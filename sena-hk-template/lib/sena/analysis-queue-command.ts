import { createHash } from "node:crypto";

export const SENA_ANALYSIS_QUEUE_COMMAND_ENVELOPE_PROFILE = "analysis-command-envelope";
export const SENA_ANALYSIS_QUEUE_COMMAND_ENVELOPE_NAME = "queued-analysis-command.json";
export const SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY = "encrypted-upload-v1";
export const SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY = "legacy-inline-v2";
export const SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY = "synthetic-heartbeat-v1";

const analysisCommandEnvelopeFormat = "sena-analysis-queue-command";
const analysisCommandEnvelopeVersion = 1;

type SenaAnalysisQueueCommandEnvelope = {
  format: typeof analysisCommandEnvelopeFormat;
  version: typeof analysisCommandEnvelopeVersion;
  payloadSha256: string;
  payload: Record<string, unknown>;
};

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildSenaAnalysisQueueCommandEnvelope(
  payload: Record<string, unknown>,
  payloadSha256: string
) {
  if (!/^[a-f0-9]{64}$/.test(payloadSha256)) {
    throw new Error("Queued analysis command payload hash is invalid.");
  }
  const envelope: SenaAnalysisQueueCommandEnvelope = {
    format: analysisCommandEnvelopeFormat,
    version: analysisCommandEnvelopeVersion,
    payloadSha256,
    payload
  };
  const bytes = Buffer.from(JSON.stringify(envelope), "utf8");
  return { bytes, sha256: sha256(bytes) };
}

export function planSenaAnalysisQueueCommandCustody<
  TSummary extends object,
  TInput extends { payload: Record<string, unknown>; payloadSummary: TSummary }
>(input: TInput, commandEnvelopeUploadId: string, payloadSha256: string) {
  if (!/^upload_[a-f0-9]{24}$/.test(commandEnvelopeUploadId)) {
    throw new Error("Queued analysis command upload reservation is invalid.");
  }
  const commandEnvelope = buildSenaAnalysisQueueCommandEnvelope(input.payload, payloadSha256);
  return {
    jobInput: {
      ...input,
      payloadSummary: {
        ...input.payloadSummary,
        commandCustody: SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY as typeof SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY,
        commandEnvelopeUploadId,
        commandEnvelopeSha256: commandEnvelope.sha256
      }
    },
    file: {
      name: SENA_ANALYSIS_QUEUE_COMMAND_ENVELOPE_NAME,
      contentType: "application/json",
      bytes: commandEnvelope.bytes,
      importProfile: SENA_ANALYSIS_QUEUE_COMMAND_ENVELOPE_PROFILE,
      reservedId: commandEnvelopeUploadId
    }
  };
}

export function parseSenaAnalysisQueueCommandEnvelope(bytes: Buffer) {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Queued analysis command envelope must contain valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Queued analysis command envelope must be an object.");
  }
  const envelope = value as Partial<SenaAnalysisQueueCommandEnvelope>;
  if (envelope.format !== analysisCommandEnvelopeFormat ||
    envelope.version !== analysisCommandEnvelopeVersion) {
    throw new Error("Queued analysis command envelope format is not supported.");
  }
  if (typeof envelope.payloadSha256 !== "string" || !/^[a-f0-9]{64}$/.test(envelope.payloadSha256)) {
    throw new Error("Queued analysis command envelope payload hash is invalid.");
  }
  if (typeof envelope.payload !== "object" || envelope.payload === null || Array.isArray(envelope.payload)) {
    throw new Error("Queued analysis command envelope payload must be an object.");
  }
  return {
    payloadSha256: envelope.payloadSha256,
    payload: envelope.payload as Record<string, unknown>
  };
}
