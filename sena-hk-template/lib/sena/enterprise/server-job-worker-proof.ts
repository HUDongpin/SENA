import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { enterprisePostgresPoolOptions } from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import { productionEvidenceMaxAgeHours } from "./ops-runtime";
import { dispatchEnterpriseServerJobWorkerProof, serverJobWorkerProofTransport } from "./server-job-queue";
import {
  acceptWorkerProofCallback,
  authenticateWorkerProofCallback,
  createWorkerProofCallback,
  createWorkerProofChallenge,
  createWorkerProofContext,
  signWorkerProofCallback,
  verifyStoredWorkerProof,
  workerProofStoredChallenge
} from "./server-job-worker-proof-protocol";
import { createWorkerProofPostgresStore, type WorkerProofStoredRecord } from "./server-job-worker-proof-store";

type ProofScope = { record?: WorkerProofStoredRecord; readStatus: "loaded" | "unavailable" };
const proofScope = new AsyncLocalStorage<ProofScope>();
let database: { connectionString: string; pool: Pool; store: ReturnType<typeof createWorkerProofPostgresStore> } | undefined;

function context() {
  return createWorkerProofContext(process.env, serverJobWorkerProofTransport());
}

function store() {
  const options = enterprisePostgresPoolOptions();
  if (!database || database.connectionString !== options.connectionString) {
    if (database) void database.pool.end().catch(() => undefined);
    const pool = new Pool(options);
    database = {
      connectionString: options.connectionString!,
      pool,
      store: createWorkerProofPostgresStore({ query: async <T>(sql: string, values?: unknown[]) => {
        const result = await pool.query(sql, values);
        return { rows: result.rows as T[], rowCount: result.rowCount };
      } })
    };
  }
  return database.store;
}

/** One durable load per composed request. A failed read never becomes an env-backed pass. */
export async function withWorkerProofEvidence<T>(operation: () => T | Promise<T>): Promise<T> {
  if (proofScope.getStore()) return operation();
  let scope: ProofScope;
  try {
    const current = context();
    const maxAgeMs = Math.min(24, productionEvidenceMaxAgeHours()) * 3_600_000;
    const record = await store().latestReceipt({
      bindingSha256: current.bindingSha256,
      notBefore: new Date(Date.now() - maxAgeMs).toISOString()
    });
    scope = { record, readStatus: "loaded" };
  } catch {
    scope = { readStatus: "unavailable" };
  }
  return proofScope.run(scope, operation);
}

/** Revalidate freshness and current credentials at every use; no positive cross-request cache. */
export function currentWorkerProofEvidence() {
  const scope = proofScope.getStore();
  if (!scope?.record || scope.readStatus !== "loaded") return undefined;
  try {
    return verifyStoredWorkerProof(context(), scope.record);
  } catch {
    return undefined;
  }
}

export async function issueWorkerProofChallenge() {
  const current = context();
  const challenge = createWorkerProofChallenge(current);
  const record = workerProofStoredChallenge(current, challenge);
  const persistence = store();
  await persistence.insertChallenge(record);
  const dispatch = await dispatchEnterpriseServerJobWorkerProof(challenge);
  if (dispatch.webhookStatus === "delivered" && dispatch.httpStatus) {
    await persistence.recordDispatch({
      id: record.id, bindingSha256: record.bindingSha256, bindingMac: record.bindingMac,
      httpStatus: dispatch.httpStatus
    });
  }
  // A synchronous HTTP worker can finish its callback before dispatch acknowledgement is saved.
  const verified = verifyStoredWorkerProof(current, await persistence.getChallenge(record.id));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofStatus,
    generatedAt: new Date().toISOString(),
    status: verified ? "confirmed" as const : dispatch.webhookStatus === "delivered" ? "pending" as const : "dispatch-failed" as const,
    challengeIdSha256: createHash("sha256").update(record.id).digest("hex"),
    expiresAt: record.expiresAt,
    dispatch: { status: dispatch.webhookStatus, httpStatus: dispatch.httpStatus, errorCode: "errorCode" in dispatch ? dispatch.errorCode : undefined },
    proof: verified,
    redaction: { nonceValuesExcluded: true, secretValuesExcluded: true, endpointValuesExcluded: true }
  };
}

/** Called only after the existing queue receiver authenticates the complete challenge body. */
export async function executeWorkerProofChallenge(payload: unknown) {
  const current = context();
  const callback = createWorkerProofCallback(current, payload);
  const body = JSON.stringify(callback);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(current.callbackUrl, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      "x-sena-worker-proof-timestamp": timestamp,
      "x-sena-worker-proof-signature": `sha256=${signWorkerProofCallback(current, body, timestamp)}`
    },
    body
  }).catch(() => {
    throw new SenaEnterpriseError("Worker proof callback transport failed.", 502, "worker_proof_callback_transport_failed");
  });
  await response.body?.cancel();
  if (!response.ok) {
    throw new SenaEnterpriseError("Worker proof callback was not accepted.", 502, "worker_proof_callback_rejected");
  }
  return {
    status: "callback-accepted" as const,
    callbackHttpStatus: response.status,
    distinctRuntimeObserved: true,
    brokerDurabilityObserved: false
  };
}

export async function receiveWorkerProofCallback(input: { body: string; timestamp: string; signature: string }) {
  const current = context();
  authenticateWorkerProofCallback(current, input.body, input.timestamp, input.signature);
  let callback: unknown;
  try { callback = JSON.parse(input.body); } catch {
    throw new SenaEnterpriseError("Worker proof callback JSON is invalid.", 400, "worker_proof_input_invalid");
  }
  const id = callback && typeof callback === "object" && "challenge" in callback &&
    callback.challenge && typeof callback.challenge === "object" && "id" in callback.challenge
    ? callback.challenge.id : undefined;
  if (typeof id !== "string" || !/^worker_proof_[a-f0-9]{24}$/.test(id)) {
    throw new SenaEnterpriseError("Worker proof callback identity is invalid.", 400, "worker_proof_input_invalid");
  }
  const persistence = store();
  const record = await persistence.getChallenge(id);
  if (!record) throw new SenaEnterpriseError("Worker proof challenge is unavailable.", 409, "worker_proof_challenge_unavailable");
  const accepted = acceptWorkerProofCallback(current, callback, record);
  const consumed = await persistence.consumeCallback({
    id: record.id, nonceSha256: record.nonceSha256, bindingSha256: record.bindingSha256,
    bindingMac: record.bindingMac, receipt: accepted.receipt, receiptMac: accepted.receiptMac
  });
  if (!consumed) throw new SenaEnterpriseError("Worker proof callback was already consumed or expired.", 409, "worker_proof_consumption_conflict");
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofStatus,
    status: "callback-accepted" as const,
    receipt: accepted.receipt,
    redaction: { nonceValuesExcluded: true, secretValuesExcluded: true, endpointValuesExcluded: true }
  };
}

/** Authenticate the bounded raw body before parsing any callback JSON. */
export async function readWorkerProofCallbackRequest(request: Request) {
  const timestamp = request.headers.get("x-sena-worker-proof-timestamp") ?? "";
  const signature = request.headers.get("x-sena-worker-proof-signature") ?? "";
  if (!/^\d{1,12}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/.test(signature)) {
    throw new SenaEnterpriseError("Worker proof callback authentication is required.", 401, "worker_proof_authentication_failed");
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new SenaEnterpriseError("Worker proof callback requires JSON.", 400, "worker_proof_input_invalid");
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 16_384)) {
    throw new SenaEnterpriseError("Worker proof callback exceeds the transport limit.", 413, "worker_proof_body_too_large");
  }
  if (!request.body) throw new SenaEnterpriseError("Worker proof callback body is missing.", 400, "worker_proof_input_invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      chunks.push(chunk.value);
      if (total > 16_384 || chunks.length > 128) {
        throw new SenaEnterpriseError("Worker proof callback exceeds the transport limit.", 413, "worker_proof_body_too_large");
      }
    }
    if (length !== null && Number(length) !== total) {
      throw new SenaEnterpriseError("Worker proof callback length is invalid.", 400, "worker_proof_input_invalid");
    }
    let body: string;
    try { body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); } catch {
      throw new SenaEnterpriseError("Worker proof callback encoding is invalid.", 400, "worker_proof_input_invalid");
    }
    return { body, timestamp, signature };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
