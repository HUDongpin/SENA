import { createHash } from "node:crypto";
import { SenaEnterpriseError } from "./enterprise/errors";

export const SENA_SERVER_JOB_COMMAND_ENVELOPE_PROFILE = "server-job-command-envelope";
export const SENA_SERVER_JOB_COMMAND_CUSTODY = "encrypted-upload-v1";

export type SenaServerJobCommandEnvelopeKind = "publication-export" | "validation";

const serverJobCommandEnvelopeFormat = "sena-server-job-command";
const serverJobCommandEnvelopeVersion = 1;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

type SenaServerJobCommandEnvelope = {
  format: typeof serverJobCommandEnvelopeFormat;
  version: typeof serverJobCommandEnvelopeVersion;
  kind: SenaServerJobCommandEnvelopeKind;
  payloadSha256: string;
  payload: Record<string, unknown>;
};

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function bindSenaServerJobIdempotency(input: {
  request: Request;
  kind: SenaServerJobCommandEnvelopeKind;
  teamId: string;
  actorUserId: string;
  projectId?: string;
}) {
  const idempotencyKey = input.request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    throw new SenaEnterpriseError(
      "Queued SENA server-job mutations require Idempotency-Key.",
      422,
      "server_job_idempotency_key_required"
    );
  }
  if (!idempotencyKeyPattern.test(idempotencyKey)) {
    throw new SenaEnterpriseError(
      "Queued SENA server-job Idempotency-Key is invalid.",
      422,
      "server_job_idempotency_key_invalid"
    );
  }
  const scopeDigest = sha256(Buffer.from([
    "sena-server-job-idempotency-v1",
    input.kind,
    input.teamId,
    input.actorUserId,
    input.projectId ?? "",
    idempotencyKey
  ].join("\u0000"), "utf8"));
  return {
    idempotencyKey,
    jobId: `server_job_${scopeDigest.slice(0, 24)}`,
    commandEnvelopeUploadId: `upload_${sha256(Buffer.from(`command-envelope\u0000${scopeDigest}`, "utf8")).slice(0, 24)}`
  };
}

export function buildSenaServerJobCommandEnvelope(
  kind: SenaServerJobCommandEnvelopeKind,
  payload: Record<string, unknown>,
  payloadSha256: string
) {
  if (!/^[a-f0-9]{64}$/.test(payloadSha256)) {
    throw new Error("Queued server-job command payload hash is invalid.");
  }
  const envelope: SenaServerJobCommandEnvelope = {
    format: serverJobCommandEnvelopeFormat,
    version: serverJobCommandEnvelopeVersion,
    kind,
    payloadSha256,
    payload
  };
  const bytes = Buffer.from(JSON.stringify(envelope), "utf8");
  return { bytes, sha256: sha256(bytes) };
}

export function planSenaServerJobCommandCustody<
  TKind extends SenaServerJobCommandEnvelopeKind,
  TSummary extends object,
  TInput extends {
    kind: TKind;
    payload: Record<string, unknown>;
    payloadSummary: TSummary;
  }
>(input: TInput, commandEnvelopeUploadId: string, payloadSha256: string) {
  if (!/^upload_[a-f0-9]{24}$/.test(commandEnvelopeUploadId)) {
    throw new Error("Queued server-job command upload reservation is invalid.");
  }
  const commandEnvelope = buildSenaServerJobCommandEnvelope(input.kind, input.payload, payloadSha256);
  return {
    jobInput: {
      ...input,
      payloadSummary: {
        ...input.payloadSummary,
        commandCustody: SENA_SERVER_JOB_COMMAND_CUSTODY as typeof SENA_SERVER_JOB_COMMAND_CUSTODY,
        commandEnvelopeUploadId,
        commandEnvelopeSha256: commandEnvelope.sha256
      }
    },
    file: {
      name: `queued-${input.kind}-command.json`,
      contentType: "application/json",
      bytes: commandEnvelope.bytes,
      importProfile: SENA_SERVER_JOB_COMMAND_ENVELOPE_PROFILE,
      reservedId: commandEnvelopeUploadId
    }
  };
}

export function parseSenaServerJobCommandEnvelope(bytes: Buffer) {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Queued server-job command envelope must contain valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Queued server-job command envelope must be an object.");
  }
  const envelope = value as Partial<SenaServerJobCommandEnvelope>;
  if (envelope.format !== serverJobCommandEnvelopeFormat || envelope.version !== serverJobCommandEnvelopeVersion) {
    throw new Error("Queued server-job command envelope format is not supported.");
  }
  if (envelope.kind !== "validation" && envelope.kind !== "publication-export") {
    throw new Error("Queued server-job command envelope kind is not supported.");
  }
  if (typeof envelope.payloadSha256 !== "string" || !/^[a-f0-9]{64}$/.test(envelope.payloadSha256)) {
    throw new Error("Queued server-job command envelope payload hash is invalid.");
  }
  if (typeof envelope.payload !== "object" || envelope.payload === null || Array.isArray(envelope.payload)) {
    throw new Error("Queued server-job command envelope payload must be an object.");
  }
  return {
    kind: envelope.kind,
    payloadSha256: envelope.payloadSha256,
    payload: envelope.payload as Record<string, unknown>
  };
}
