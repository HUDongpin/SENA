import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import {
  serverJobWebhookTimestampFreshness,
  serverJobWebhookTimestampSkewSeconds,
  stableServerJobPayloadSha256
} from "@/lib/sena/enterprise/server-job-queue";
import {
  runEnterpriseServerJobFromQueueWebhook,
  serverJobWorkerInlineExecutionEnabled,
  type SenaServerJobWorkerOutcome
} from "@/lib/sena/enterprise/server-job-worker-runtime";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";

export const runtime = "nodejs";

const acceptedEvents = new Set([
  "server_job.queue",
  "server_job.queue.probe"
]);
const SENA_SERVER_JOB_WORKER_REQUEST_MAX_BYTES = 64 * 1024;
const SENA_SERVER_JOB_WORKER_REQUEST_MAX_CHUNKS = 1_024;

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function configuredQueueSecret() {
  const value = process.env.SENA_JOB_QUEUE_SECRET?.trim();
  if (!value) {
    throw new SenaEnterpriseError("SENA job queue secret is not configured.", 503, "server_job_worker_secret_not_configured");
  }
  return value;
}

function requiredHeader(request: Request, name: string, errorCode: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) {
    throw new SenaEnterpriseError(`Missing ${name}.`, 401, errorCode);
  }
  return value;
}

function verifyPayloadHash(receivedHash: string, body: string) {
  const expectedHash = sha256Text(body);
  if (!/^[a-f0-9]{64}$/i.test(receivedHash) || receivedHash.toLowerCase() !== expectedHash) {
    throw new SenaEnterpriseError("SENA job queue payload hash is invalid.", 401, "server_job_worker_payload_hash_invalid");
  }
  return expectedHash;
}

function verifySignature(timestamp: string, signature: string, body: string, secret: string) {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
  if (!match) {
    throw new SenaEnterpriseError("SENA job queue signature is invalid.", 401, "server_job_worker_signature_invalid");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  if (!timingSafeEqual(Buffer.from(match[1].toLowerCase(), "hex"), Buffer.from(expected, "hex"))) {
    throw new SenaEnterpriseError("SENA job queue signature is invalid.", 401, "server_job_worker_signature_invalid");
  }
  return timestamp;
}

function workerTransportError(message: string, status: 400 | 413, code: string): never {
  throw new SenaEnterpriseError(message, status, code);
}

async function cancelWorkerRequestReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // Preserve the stable admission error even when an untrusted stream rejects cancellation.
  }
}

function preflightWorkerTransport(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    workerTransportError(
      "SENA job worker accepts application/json queue deliveries only.",
      400,
      "server_job_worker_content_type_invalid"
    );
  }
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength) {
    if (!/^\d+$/.test(declaredLength)) {
      workerTransportError("SENA job worker Content-Length is invalid.", 400, "server_job_worker_request_invalid");
    }
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength > SENA_SERVER_JOB_WORKER_REQUEST_MAX_BYTES) {
      workerTransportError(
        `SENA job worker request exceeds the ${SENA_SERVER_JOB_WORKER_REQUEST_MAX_BYTES}-byte limit.`,
        413,
        "server_job_worker_request_too_large"
      );
    }
  }
  const receivedHash = requiredHeader(
    request,
    "x-sena-job-payload-sha256",
    "server_job_worker_payload_hash_required"
  );
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new SenaEnterpriseError(
      "SENA job queue payload hash is invalid.",
      401,
      "server_job_worker_payload_hash_invalid"
    );
  }
  const timestamp = requiredHeader(request, "x-sena-webhook-timestamp", "server_job_worker_timestamp_required");
  const signature = requiredHeader(request, "x-sena-webhook-signature", "server_job_worker_signature_required");
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    throw new SenaEnterpriseError(
      "SENA job queue signature is invalid.",
      401,
      "server_job_worker_signature_invalid"
    );
  }
  const event = requiredHeader(request, "x-sena-webhook-event", "server_job_worker_event_required");
  if (!acceptedEvents.has(event)) {
    throw new SenaEnterpriseError(
      "SENA job queue event is not supported.",
      400,
      "server_job_worker_event_unsupported"
    );
  }
  return {
    event: event as "server_job.queue" | "server_job.queue.probe",
    receivedHash,
    receivedWorkerPayloadHash: request.headers.get("x-sena-worker-payload-sha256")?.trim(),
    timestamp,
    signature,
    secret: configuredQueueSecret()
  };
}

async function readBoundedWorkerRequest(request: Request) {
  if (!request.body) {
    workerTransportError("SENA job worker request body is required.", 400, "server_job_worker_request_invalid");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let chunkCount = 0;
  while (true) {
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await reader.read();
    } catch {
      await cancelWorkerRequestReader(reader);
      workerTransportError("SENA job worker request stream is invalid.", 400, "server_job_worker_request_invalid");
    }
    if (read.done) break;
    chunkCount += 1;
    if (chunkCount > SENA_SERVER_JOB_WORKER_REQUEST_MAX_CHUNKS) {
      await cancelWorkerRequestReader(reader);
      workerTransportError(
        "SENA job worker request uses too many streamed chunks.",
        413,
        "server_job_worker_request_too_fragmented"
      );
    }
    const chunk = read.value ?? new Uint8Array();
    if (chunk.byteLength > SENA_SERVER_JOB_WORKER_REQUEST_MAX_BYTES - bytes) {
      await cancelWorkerRequestReader(reader);
      workerTransportError(
        `SENA job worker request exceeds the ${SENA_SERVER_JOB_WORKER_REQUEST_MAX_BYTES}-byte limit.`,
        413,
        "server_job_worker_request_too_large"
      );
    }
    bytes += chunk.byteLength;
    if (chunk.byteLength > 0) chunks.push(chunk);
  }
  const bodyBytes = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
  } catch {
    workerTransportError("SENA job worker request is not valid UTF-8.", 400, "server_job_worker_request_invalid");
  }
}

/**
 * Bounds replay of an otherwise valid delivery.
 *
 * The timestamp is signed, so it cannot be edited — but being signed is exactly
 * why a captured request replays forever unless its age is checked. Requiring
 * the header (server_job_worker_timestamp_required) only proves it was sent.
 *
 * Deliberately runs after verifySignature: a caller without the queue secret is
 * refused before reaching this, so the window cannot be probed by an
 * unauthenticated attacker. The two failures are distinguishable to a caller
 * that does hold a validly signed body, but that tells them only what they
 * already know (their own timestamp); it grants no search advantage toward the
 * secret, since the route's existing 202-vs-401 split already separates a valid
 * signature from an invalid one, and the HMAC comparison itself stays
 * constant-time.
 */
function verifyTimestampFreshness(timestamp: string) {
  const freshness = serverJobWebhookTimestampFreshness(timestamp);
  if (freshness === "invalid") {
    throw new SenaEnterpriseError(
      "SENA job queue timestamp is not an ISO-8601 instant.",
      401,
      "server_job_worker_timestamp_invalid"
    );
  }
  if (freshness === "outside-window") {
    throw new SenaEnterpriseError(
      `SENA job queue timestamp is outside the ${serverJobWebhookTimestampSkewSeconds()}s freshness window.`,
      401,
      "server_job_worker_timestamp_outside_window"
    );
  }
}

function parsePayload(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      schemaVersion?: unknown;
      job?: { id?: unknown; kind?: unknown; payloadSha256?: unknown };
      workerPayload?: unknown;
      delivery?: { workerPayloadSha256?: unknown };
      probe?: { dispatchEvent?: unknown };
    };
    if (typeof parsed.schemaVersion !== "string") {
      throw new SenaEnterpriseError("SENA job queue payload schemaVersion is missing.", 400, "server_job_worker_schema_missing");
    }
    return parsed;
  } catch (error) {
    if (error instanceof SenaEnterpriseError) throw error;
    throw new SenaEnterpriseError("SENA job queue payload is not valid JSON.", 400, "server_job_worker_payload_invalid");
  }
}

function verifyWorkerPayloadHash(
  event: "server_job.queue" | "server_job.queue.probe",
  payload: ReturnType<typeof parsePayload>,
  receivedHash?: string
) {
  if (event === "server_job.queue.probe") return undefined;
  const jobHash = payload.job?.payloadSha256;
  const deliveryHash = payload.delivery?.workerPayloadSha256;
  const expectedHash = stableServerJobPayloadSha256(payload.workerPayload);
  if (!receivedHash ||
    !/^[a-f0-9]{64}$/i.test(receivedHash) ||
    typeof jobHash !== "string" ||
    typeof deliveryHash !== "string" ||
    receivedHash.toLowerCase() !== expectedHash ||
    jobHash.toLowerCase() !== expectedHash ||
    deliveryHash.toLowerCase() !== expectedHash) {
    throw new SenaEnterpriseError(
      "SENA job queue worker payload hash is invalid.",
      401,
      "server_job_worker_worker_payload_hash_invalid"
    );
  }
  return expectedHash;
}

function acceptedEvent(event: "server_job.queue" | "server_job.queue.probe", payload: ReturnType<typeof parsePayload>) {
  if (event === "server_job.queue.probe" && payload.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe) {
    throw new SenaEnterpriseError("SENA job queue probe schema is invalid.", 400, "server_job_worker_probe_schema_invalid");
  }
  if (event === "server_job.queue" && payload.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook) {
    throw new SenaEnterpriseError("SENA job queue webhook schema is invalid.", 400, "server_job_worker_queue_schema_invalid");
  }
  return event as "server_job.queue" | "server_job.queue.probe";
}

type WorkerExecutionReceipt = {
  attempted: boolean;
  status: "succeeded" | "failed" | "skipped" | "not-attempted";
  jobStatus?: string;
  attempts?: number;
  retryable?: boolean;
  errorCode?: string;
  errorHash?: string;
  skipReason?: string;
  workerRunIdHash?: string;
  jobIdValueExcluded: true;
  resultIdValuesExcluded: true;
};

const notAttemptedExecution: WorkerExecutionReceipt = {
  attempted: false,
  status: "not-attempted",
  jobIdValueExcluded: true,
  resultIdValuesExcluded: true
};

function executionReceipt(outcome: SenaServerJobWorkerOutcome): WorkerExecutionReceipt {
  return {
    attempted: true,
    status: outcome.status,
    jobStatus: outcome.jobStatus,
    attempts: outcome.attempts,
    retryable: outcome.retryable,
    errorCode: outcome.errorCode,
    errorHash: outcome.errorHash,
    skipReason: outcome.skipReason,
    // Only the hash: the run id correlates worker logs to a job without the
    // receipt carrying an id an intermediary could replay.
    workerRunIdHash: outcome.workerRunId ? sha256Text(outcome.workerRunId) : undefined,
    jobIdValueExcluded: true,
    resultIdValuesExcluded: true
  };
}

/**
 * Runs the delivered job in-process.
 *
 * This is the half that was missing: the signature and payload hash are already
 * verified above, so a body that reaches here is one the queue signed. Only then
 * is the job claimed and executed. Operators running a separate external worker
 * turn this off with SENA_JOB_WORKER_INLINE_EXECUTION=0, which restores the
 * pre-existing receipt-only behaviour.
 */
async function executeDeliveredJob(
  event: "server_job.queue" | "server_job.queue.probe",
  payload: ReturnType<typeof parsePayload>
): Promise<WorkerExecutionReceipt> {
  if (event !== "server_job.queue") return notAttemptedExecution;
  if (!serverJobWorkerInlineExecutionEnabled()) return notAttemptedExecution;
  const jobId = typeof payload.job?.id === "string" ? payload.job.id.trim() : "";
  if (!jobId) {
    return { ...notAttemptedExecution, status: "skipped", skipReason: "server_job_worker_job_id_missing" };
  }
  try {
    return executionReceipt(await runEnterpriseServerJobFromQueueWebhook({
      jobId,
      workerPayload: payload.workerPayload
    }));
  } catch (error) {
    // The delivery itself was valid, so the receipt still reports 202 — but it
    // reports why nothing ran rather than implying the job was handled.
    return {
      ...notAttemptedExecution,
      attempted: true,
      status: "skipped",
      skipReason: error instanceof SenaEnterpriseError ? error.code : "server_job_worker_execution_unavailable"
    };
  }
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs-worker" }, async () => {
    const transport = preflightWorkerTransport(request);
    const body = await readBoundedWorkerRequest(request);
    const payloadSha256 = verifyPayloadHash(transport.receivedHash, body);
    verifyTimestampFreshness(verifySignature(
      transport.timestamp,
      transport.signature,
      body,
      transport.secret
    ));
    const payload = parsePayload(body);
    const event = acceptedEvent(transport.event, payload);
    const workerPayloadSha256 = verifyWorkerPayloadHash(
      event,
      payload,
      transport.receivedWorkerPayloadHash
    );
    const jobIdHash = typeof payload.job?.id === "string" ? sha256Text(payload.job.id) : undefined;
    const jobKind = typeof payload.job?.kind === "string" ? payload.job.kind : undefined;
    const execution = await executeDeliveredJob(event, payload);

    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhookReceipt,
      generatedAt: new Date().toISOString(),
      status: "accepted",
      event,
      job: {
        jobIdHash,
        kind: jobKind,
        jobIdValueExcluded: true
      },
      probe: {
        accepted: event === "server_job.queue.probe",
        probeIdValueExcluded: true
      },
      execution,
      delivery: {
        transportPayloadSha256: payloadSha256,
        workerPayloadSha256,
        signatureVerified: true,
        timestampVerified: true,
        timestampSkewSeconds: serverJobWebhookTimestampSkewSeconds(),
        workerRuntime: process.env.SENA_JOB_WORKER_RUNTIME || "vercel-serverless-queue-receiver"
      },
      redaction: {
        payloadValuesExcluded: true,
        responsePayloadValuesExcluded: true,
        secretValuesExcluded: true
      }
    }, {
      status: 202,
      headers: {
        "x-sena-server-job-worker": "accepted",
        "x-sena-server-job-worker-event": event,
        "x-sena-server-job-worker-signature": "verified",
        "x-sena-server-job-worker-timestamp": "verified",
        "x-sena-server-job-worker-execution": execution.status,
        "x-sena-server-job-worker-transport-payload-sha256": payloadSha256,
        ...(workerPayloadSha256
          ? { "x-sena-server-job-worker-payload-sha256": workerPayloadSha256 }
          : {}),
        "x-sena-server-job-worker-url-values": "excluded"
      }
    });
  });
}
