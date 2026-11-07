import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkerProofCallbackInput,
  WorkerProofDispatchInput,
  WorkerProofStoredRecord
} from "../enterprise/server-job-worker-proof-store";

// This adapter fixture preserves conditional acceptance and independent dispatch/callback
// fields. Real PostgreSQL locking, SQL predicates, and races have their own integration suite.
const persistence = vi.hoisted(() => {
  const rows = new Map<string, WorkerProofStoredRecord>();
  const events: string[] = [];
  const controls = { readError: false, insertError: false };
  const copy = (record: WorkerProofStoredRecord | undefined) => record && structuredClone(record);
  const eligible = (record: WorkerProofStoredRecord | undefined) => record
    && Date.parse(record.expiresAt) > Date.now()
    && Date.parse(record.issuedAt) <= Date.now() + 30_000;
  const store = {
    ensureSchema: vi.fn(async () => undefined),
    insertChallenge: vi.fn(async (record: WorkerProofStoredRecord) => {
      if (controls.insertError) throw new Error("Synthetic persistence outage");
      if (rows.has(record.id)) throw new Error("Duplicate fixture challenge");
      rows.set(record.id, structuredClone(record));
      events.push("persisted");
      return structuredClone(record);
    }),
    getChallenge: vi.fn(async (id: string) => copy(rows.get(id))),
    recordDispatch: vi.fn(async (input: WorkerProofDispatchInput) => {
      const record = rows.get(input.id);
      if (!eligible(record) || !record || record.dispatchAcceptedAt
        || record.bindingSha256 !== input.bindingSha256 || record.bindingMac !== input.bindingMac
        || input.httpStatus < 200 || input.httpStatus > 299) return undefined;
      record.dispatchAcceptedAt = new Date().toISOString();
      record.dispatchHttpStatus = input.httpStatus;
      events.push("dispatch-accepted");
      return copy(record);
    }),
    consumeCallback: vi.fn(async (input: WorkerProofCallbackInput) => {
      const record = rows.get(input.id);
      if (!eligible(record) || !record || record.callbackAcceptedAt
        || record.nonceSha256 !== input.nonceSha256 || record.bindingSha256 !== input.bindingSha256
        || record.bindingMac !== input.bindingMac) return undefined;
      record.callbackAcceptedAt = new Date().toISOString();
      record.receipt = structuredClone(input.receipt);
      record.receiptMac = input.receiptMac;
      events.push("callback-accepted");
      return copy(record);
    }),
    latestReceipt: vi.fn(async (input: { bindingSha256: string; notBefore: string }) => {
      if (controls.readError) throw new Error("Synthetic persistence outage");
      return copy([...rows.values()].filter((record) => record.bindingSha256 === input.bindingSha256
        && record.dispatchAcceptedAt && record.callbackAcceptedAt
        && record.callbackAcceptedAt >= input.notBefore)
        .sort((left, right) => right.callbackAcceptedAt!.localeCompare(left.callbackAcceptedAt!))[0]);
    })
  };
  return { rows, events, controls, store };
});

vi.mock("../enterprise/server-job-worker-proof-store", () => ({
  createWorkerProofPostgresStore: () => persistence.store
}));
vi.mock("pg", () => ({
  Pool: class {
    async query() { throw new Error("This suite must never access a real database"); }
    async end() { return undefined; }
  }
}));

import {
  currentWorkerProofEvidence,
  executeWorkerProofChallenge,
  issueWorkerProofChallenge,
  readWorkerProofCallbackRequest,
  receiveWorkerProofCallback,
  withWorkerProofEvidence
} from "../enterprise/server-job-worker-proof";
import {
  authenticateWorkerProofCallback,
  createWorkerProofCallback,
  createWorkerProofChallenge,
  createWorkerProofContext,
  signWorkerProofCallback,
  workerProofRuntimeSha256,
  workerProofStoredChallenge,
  type WorkerProofChallenge
} from "../enterprise/server-job-worker-proof-protocol";
import { serverJobWorkerProofTransport } from "../enterprise/server-job-queue";
import {
  getEnterpriseServerJobWorkerContract,
  serverJobWorkerContractReadiness
} from "../enterprise/server-job-worker-contract";

const NOW = new Date("2026-10-28T08:00:00.000Z");
const at = (milliseconds: number) => new Date(NOW.getTime() + milliseconds);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const proofSecret = "synthetic-proof-secret-for-service-tests-only-2026";
const queueSecret = "synthetic-queue-secret-for-service-tests-only-2026";
const providerToken = "synthetic-provider-token-for-service-tests-only";
const databaseUrl = "postgres://fixture:synthetic-database-password@worker-proof-db.invalid:5432/fixture";
const callbackUrl = "https://preview.example.test/api/sena/ops/jobs/worker-proof/callback";
const queueUrl = "https://queue.example.test/dispatch";
const workerUrl = "https://worker.example.test/api/sena/ops/jobs/worker";

beforeEach(() => {
  vi.clearAllMocks();
  persistence.rows.clear();
  persistence.events.length = 0;
  persistence.controls.readError = false;
  persistence.controls.insertError = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const [name, value] of Object.entries({
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_DEPLOYMENT_ID: "dpl_worker_proof_service_fixture",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    SENA_JOB_WORKER_PROOF_BUILD_ID: "a".repeat(40),
    SENA_ENTERPRISE_STATE_STORE: "postgres",
    SENA_ENTERPRISE_DB_ADAPTER: "postgres",
    SENA_ENTERPRISE_POSTGRES_URL: databaseUrl,
    SENA_JOB_QUEUE_ADAPTER: "managed",
    SENA_JOB_QUEUE_URL: queueUrl,
    SENA_JOB_QUEUE_SECRET: queueSecret,
    SENA_JOB_QUEUE_PROVIDER_TOKEN: providerToken,
    SENA_JOB_WORKER_CALLBACK_URL: workerUrl,
    SENA_JOB_WORKER_PROOF_SECRET: proofSecret,
    SENA_JOB_WORKER_PROOF_KEY_VERSION: "fixture-preview-v1",
    SENA_JOB_WORKER_PROOF_CALLBACK_URL: callbackUrl,
    SENA_PRODUCTION_EVIDENCE_MAX_AGE_HOURS: "24",
    SENA_OPS_TOKEN: "synthetic-ops-token-for-service-tests-only",
    SENA_JOB_WORKER_RUNTIME: "unit-test-fixture",
    SENA_JOB_WORKER_OWNER: "synthetic-worker-owner",
    SENA_JOB_WORKER_RUNBOOK_URL: "https://docs.example.test/worker-runbook",
    SENA_JOB_WORKER_HEARTBEAT_CONFIRMED: "1",
    SENA_JOB_WORKER_HEARTBEAT_SHA256: "b".repeat(64),
    SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT: NOW.toISOString()
  })) vi.stubEnv(name, value);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected fixture network request"); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function issuerContext() {
  return createWorkerProofContext(process.env, serverJobWorkerProofTransport());
}

// This test-only runtime override simulates a worker. It is not external-process evidence.
function syntheticCallback(challenge: WorkerProofChallenge) {
  const worker = createWorkerProofContext(process.env, serverJobWorkerProofTransport(), {
    runtimeSha256: digest("synthetic worker context for service integration tests")
  });
  const body = JSON.stringify(createWorkerProofCallback(worker, challenge));
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { body, timestamp, signature: `sha256=${signWorkerProofCallback(worker, body, timestamp)}` };
}

async function persistedChallenge() {
  const current = issuerContext();
  const challenge = createWorkerProofChallenge(current);
  await persistence.store.insertChallenge(workerProofStoredChallenge(current, challenge));
  return challenge;
}

async function issueWithSyntheticCallback(httpStatus = 202) {
  let challenge: WorkerProofChallenge | undefined;
  let signed: ReturnType<typeof syntheticCallback> | undefined;
  let persistedBeforeFetch = false;
  let callbackResult: Awaited<ReturnType<typeof receiveWorkerProofCallback>> | undefined;
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    challenge = JSON.parse(String(init?.body)) as WorkerProofChallenge;
    persistedBeforeFetch = persistence.rows.has(challenge.id);
    persistence.events.push("queue-fetch");
    vi.setSystemTime(at(1_000));
    signed = syntheticCallback(challenge);
    callbackResult = await receiveWorkerProofCallback(signed);
    persistence.events.push("queue-response");
    vi.setSystemTime(at(2_000));
    return new Response(null, { status: httpStatus });
  });
  vi.stubGlobal("fetch", fetchMock);
  const issued = await issueWorkerProofChallenge();
  if (!challenge || !signed || !callbackResult) throw new Error("Synthetic callback fixture did not run");
  return { issued, challenge, signed, callbackResult, persistedBeforeFetch, fetchMock };
}

function expectNoPrivateValues(output: unknown, challenge: WorkerProofChallenge, signature: string) {
  const stored = persistence.rows.get(challenge.id)!;
  const serialized = JSON.stringify(output);
  for (const privateValue of [challenge.id, challenge.nonce, stored.nonceSha256, stored.bindingMac,
    stored.receiptMac, signature, proofSecret, queueSecret, providerToken, databaseUrl,
    callbackUrl, queueUrl, workerUrl]) {
    if (privateValue) expect(serialized).not.toContain(privateValue);
  }
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      expect(["nonce", "nonceSha256", "bindingMac", "receiptMac", "proofSecret", "queueSecret", "credentialConfiguration"])
        .not.toContain(key);
      visit(entry);
    }
  };
  visit(output);
}

describe("worker proof service issuance and acceptance", () => {
  it("persists the challenge before dispatch and retains an authenticated callback that arrives before HTTP 202", async () => {
    const fixture = await issueWithSyntheticCallback();
    expect(fixture.persistedBeforeFetch).toBe(true);
    expect(persistence.events).toEqual(["persisted", "queue-fetch", "callback-accepted", "queue-response", "dispatch-accepted"]);
    expect(fixture.issued).toMatchObject({ status: "confirmed", dispatch: { status: "delivered", httpStatus: 202 } });
    expect(fixture.issued.proof?.receipt).toEqual(fixture.callbackResult.receipt);
    expect(persistence.rows.get(fixture.challenge.id)).toMatchObject({
      callbackAcceptedAt: at(1_000).toISOString(), dispatchAcceptedAt: at(2_000).toISOString(),
      dispatchHttpStatus: 202, receipt: fixture.callbackResult.receipt
    });
    expect(fixture.issued.proof?.receipt).toMatchObject({ distinctRuntimeObserved: true, brokerDurabilityObserved: false });
  });

  it("does not dispatch a challenge whose persistence failed", async () => {
    persistence.controls.insertError = true;
    await expect(issueWorkerProofChallenge()).rejects.toThrow("Synthetic persistence outage");
    expect(fetch).not.toHaveBeenCalled();
    expect(persistence.rows.size).toBe(0);
  });

  it("leaves an acknowledged dispatch pending until a callback is accepted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    const result = await issueWorkerProofChallenge();
    expect(result).toMatchObject({ status: "pending", dispatch: { status: "delivered", httpStatus: 202 } });
    expect(result.proof).toBeUndefined();
    await withWorkerProofEvidence(() => expect(currentWorkerProofEvidence()).toBeUndefined());
  });

  it("does not confirm an HTTP dispatch error without a callback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const result = await issueWorkerProofChallenge();
    expect(result).toMatchObject({ status: "dispatch-failed", dispatch: { status: "failed", httpStatus: 503 } });
    expect(result.proof).toBeUndefined();
    expect(persistence.store.recordDispatch).not.toHaveBeenCalled();
  });

  it("does not confirm a callback when the associated dispatch returns HTTP 503", async () => {
    const fixture = await issueWithSyntheticCallback(503);
    expect(fixture.callbackResult.status).toBe("callback-accepted");
    expect(fixture.issued).toMatchObject({ status: "dispatch-failed", dispatch: { status: "failed", httpStatus: 503 } });
    expect(fixture.issued.proof).toBeUndefined();
    expect(persistence.store.recordDispatch).not.toHaveBeenCalled();
    await withWorkerProofEvidence(() => expect(currentWorkerProofEvidence()).toBeUndefined());
  });

  it("excludes nonce, credentials, MACs, and raw endpoints from public issue, callback, and contract outputs", async () => {
    const fixture = await issueWithSyntheticCallback();
    const contract = await withWorkerProofEvidence(() => getEnterpriseServerJobWorkerContract());
    expect(contract.worker.externalWorkerCallbackReceiptConfirmed).toBe(true);
    for (const output of [fixture.issued, fixture.callbackResult, contract]) {
      expectNoPrivateValues(output, fixture.challenge, fixture.signed.signature);
    }
  });

  it("authenticates malformed raw JSON before parsing or reading a challenge", async () => {
    const body = "{this is not JSON";
    const parse = vi.spyOn(JSON, "parse");
    await expect(receiveWorkerProofCallback({ body, timestamp: String(Date.now() / 1000), signature: `sha256=${"0".repeat(64)}` }))
      .rejects.toMatchObject({ status: 401, code: "worker_proof_authentication_failed" });
    expect(parse).not.toHaveBeenCalledWith(body);
    expect(persistence.store.getChallenge).not.toHaveBeenCalled();
    expect(persistence.store.consumeCallback).not.toHaveBeenCalled();
  });

  it("rejects authenticated malformed JSON before accessing the database", async () => {
    const body = "{this is not JSON";
    const timestamp = String(Date.now() / 1000);
    const signature = `sha256=${signWorkerProofCallback(issuerContext(), body, timestamp)}`;
    await expect(receiveWorkerProofCallback({ body, timestamp, signature }))
      .rejects.toMatchObject({ status: 400, code: "worker_proof_input_invalid" });
    expect(persistence.store.getChallenge).not.toHaveBeenCalled();
  });

  it("rejects a leading UTF-8 BOM added after signing instead of normalizing it before authentication", async () => {
    const challenge = await persistedChallenge();
    const signed = syntheticCallback(challenge);
    const request = new Request(callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-worker-proof-timestamp": signed.timestamp,
        "x-sena-worker-proof-signature": signed.signature
      },
      body: new TextEncoder().encode(`\uFEFF${signed.body}`)
    });
    const received = await readWorkerProofCallbackRequest(request);
    await expect(receiveWorkerProofCallback(received))
      .rejects.toMatchObject({ status: 401, code: "worker_proof_authentication_failed" });
    expect(persistence.store.getChallenge).not.toHaveBeenCalled();
    expect(persistence.store.consumeCallback).not.toHaveBeenCalled();
  });

  it("rejects a replay without changing its original receipt or acceptance time", async () => {
    const challenge = await persistedChallenge();
    const signed = syntheticCallback(challenge);
    await receiveWorkerProofCallback(signed);
    const original = structuredClone(persistence.rows.get(challenge.id));
    vi.setSystemTime(at(10_000));
    await expect(receiveWorkerProofCallback(signed))
      .rejects.toMatchObject({ status: 409, code: "worker_proof_already_consumed" });
    expect(persistence.rows.get(challenge.id)).toEqual(original);
    expect(persistence.store.consumeCallback).toHaveBeenCalledTimes(1);
  });

  it("refuses the losing concurrent callback when both read the same unconsumed challenge", async () => {
    const challenge = await persistedChallenge();
    const signed = syntheticCallback(challenge);
    const results = await Promise.allSettled([receiveWorkerProofCallback(signed), receiveWorkerProofCallback(signed)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { status: 409, code: "worker_proof_consumption_conflict" } });
    expect(persistence.events.filter((event) => event === "callback-accepted")).toHaveLength(1);
  });
});

describe("worker proof service execution", () => {
  it("refuses a challenge issued by this actual process before making a callback request", async () => {
    const current = issuerContext();
    expect(current.runtimeSha256).toBe(workerProofRuntimeSha256());
    await expect(executeWorkerProofChallenge(createWorkerProofChallenge(current)))
      .rejects.toMatchObject({ status: 409, code: "worker_proof_binding_mismatch" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses its actual process identity, authenticates the exact callback body, and refuses redirects", async () => {
    // Only the incoming issuer identity is synthetic; executeWorkerProofChallenge uses no identity override.
    const syntheticIssuer = createWorkerProofContext(process.env, serverJobWorkerProofTransport(), {
      runtimeSha256: digest("synthetic remote issuer for execution tests")
    });
    const challenge = createWorkerProofChallenge(syntheticIssuer);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await executeWorkerProofChallenge(challenge)).toMatchObject({
      status: "callback-accepted", callbackHttpStatus: 204, distinctRuntimeObserved: true, brokerDurabilityObserved: false
    });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(callbackUrl);
    expect(request).toMatchObject({ method: "POST", redirect: "error" });
    const headers = new Headers(request.headers);
    const body = String(request.body);
    expect(JSON.parse(body)).toMatchObject({ challenge, workerRuntimeSha256: workerProofRuntimeSha256() });
    expect(() => authenticateWorkerProofCallback(issuerContext(), body,
      headers.get("x-sena-worker-proof-timestamp"), headers.get("x-sena-worker-proof-signature"))).not.toThrow();
    expect(persistence.store.consumeCallback).not.toHaveBeenCalled();
  });

  it.each([302, 401, 503])("does not accept callback HTTP %s", async (status) => {
    const syntheticIssuer = createWorkerProofContext(process.env, serverJobWorkerProofTransport(), {
      runtimeSha256: digest("synthetic remote issuer for execution tests")
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(executeWorkerProofChallenge(createWorkerProofChallenge(syntheticIssuer)))
      .rejects.toMatchObject({ status: 502, code: "worker_proof_callback_rejected" });
  });
});

describe("worker proof request-scoped durable evidence", () => {
  it("loads once for nested composed reads and exposes nothing outside the scope", async () => {
    const fixture = await issueWithSyntheticCallback();
    expect(currentWorkerProofEvidence()).toBeUndefined();
    await withWorkerProofEvidence(async () => {
      expect(currentWorkerProofEvidence()).toEqual(fixture.issued.proof);
      await withWorkerProofEvidence(async () => {
        expect(currentWorkerProofEvidence()).toEqual(fixture.issued.proof);
        expect(getEnterpriseServerJobWorkerContract().worker.externalWorkerCallbackReceiptConfirmed).toBe(true);
      });
      expect(currentWorkerProofEvidence()).toEqual(fixture.issued.proof);
    });
    expect(persistence.store.latestReceipt).toHaveBeenCalledTimes(1);
    expect(currentWorkerProofEvidence()).toBeUndefined();
    await withWorkerProofEvidence(() => expect(currentWorkerProofEvidence()).toEqual(fixture.issued.proof));
    expect(persistence.store.latestReceipt).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed durable read closed for the whole request despite database recovery and operator flags", async () => {
    await issueWithSyntheticCallback();
    persistence.controls.readError = true;
    vi.stubEnv("SENA_JOB_WORKER_CONTRACT_CONFIRMED", "1");
    vi.stubEnv("SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256", "f".repeat(64));
    vi.stubEnv("SENA_JOB_WORKER_CONTRACT_VERIFIED_AT", at(1_000).toISOString());
    vi.stubEnv("SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION", "pass");
    await withWorkerProofEvidence(async () => {
      expect(currentWorkerProofEvidence()).toBeUndefined();
      persistence.controls.readError = false;
      await withWorkerProofEvidence(() => {
        expect(currentWorkerProofEvidence()).toBeUndefined();
        expect(serverJobWorkerContractReadiness().confirmed).toBe(false);
      });
    });
    expect(persistence.store.latestReceipt).toHaveBeenCalledTimes(1);
    await withWorkerProofEvidence(() => expect(currentWorkerProofEvidence()).toBeDefined());
    expect(persistence.store.latestReceipt).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["proof key rotation", "SENA_JOB_WORKER_PROOF_SECRET", "replacement-proof-secret-for-service-tests-only-2026"],
    ["key version", "SENA_JOB_WORKER_PROOF_KEY_VERSION", "fixture-preview-v2"],
    ["deployment", "VERCEL_DEPLOYMENT_ID", "dpl_another_preview_fixture"],
    ["environment", "VERCEL_ENV", "production"],
    ["queue credential", "SENA_JOB_QUEUE_SECRET", "replacement-queue-secret-for-service-tests-only-2026"],
    ["provider credential", "SENA_JOB_QUEUE_PROVIDER_TOKEN", "replacement-provider-token-for-service-tests-only"],
    ["database identity", "SENA_ENTERPRISE_POSTGRES_URL", "postgres://fixture:different-test-password@different-db.invalid:5432/fixture"],
    ["queue endpoint", "SENA_JOB_QUEUE_URL", "https://new-queue.example.test/dispatch"],
    ["callback endpoint", "SENA_JOB_WORKER_PROOF_CALLBACK_URL", "https://new-preview.example.test/api/sena/ops/jobs/worker-proof/callback"]
  ])("invalidates an already loaded receipt after %s changes", async (_label, key, value) => {
    await issueWithSyntheticCallback();
    await withWorkerProofEvidence(() => {
      expect(currentWorkerProofEvidence()).toBeDefined();
      vi.stubEnv(key, value);
      expect(currentWorkerProofEvidence()).toBeUndefined();
      expect(getEnterpriseServerJobWorkerContract().worker.externalWorkerCallbackReceiptConfirmed).toBe(false);
    });
    expect(persistence.store.latestReceipt).toHaveBeenCalledTimes(1);
  });

  it("rechecks receipt age within a loaded scope without refreshing the acceptance timestamp", async () => {
    await issueWithSyntheticCallback();
    await withWorkerProofEvidence(() => {
      expect(currentWorkerProofEvidence()).toBeDefined();
      vi.setSystemTime(at(24 * 3_600_000 + 1_001));
      expect(currentWorkerProofEvidence()).toBeUndefined();
    });
    expect(persistence.store.latestReceipt).toHaveBeenCalledTimes(1);
  });

  it("keeps the accepted time and exact contract hash stable across later durable reads", async () => {
    const fixture = await issueWithSyntheticCallback();
    const original = structuredClone(persistence.rows.get(fixture.challenge.id));
    const first = await withWorkerProofEvidence(() => ({
      proof: currentWorkerProofEvidence(), contract: getEnterpriseServerJobWorkerContract(),
      readiness: serverJobWorkerContractReadiness()
    }));
    vi.setSystemTime(at(60_000));
    const second = await withWorkerProofEvidence(() => ({
      proof: currentWorkerProofEvidence(), contract: getEnterpriseServerJobWorkerContract(),
      readiness: serverJobWorkerContractReadiness()
    }));
    expect(first.contract.missing).toEqual([]);
    expect(first.readiness.confirmed).toBe(true);
    expect(second).toEqual(first);
    expect(second.proof?.verifiedAt).toBe(at(1_000).toISOString());
    expect(second.readiness.artifactHash).toBe(digest(`${JSON.stringify(second.contract, null, 2)}\n`));
    expect(persistence.rows.get(fixture.challenge.id)).toEqual(original);
    expect(persistence.store.latestReceipt).toHaveBeenCalledTimes(2);
  });
});
