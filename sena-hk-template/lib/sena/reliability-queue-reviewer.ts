export const SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE = "reliability-reviewer-envelope";
export const SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME = "queued-reliability-reviewer.json";

const reviewerEnvelopeFormat = "sena-reliability-queue-reviewer";
const reviewerEnvelopeVersion = 1;
const reviewerMaximumLength = 200;

type SenaReliabilityReviewerEnvelope = {
  format: typeof reviewerEnvelopeFormat;
  version: typeof reviewerEnvelopeVersion;
  reviewer: string;
};

function reviewerText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, reviewerMaximumLength);
}

export function normalizeSenaReliabilityReviewer(value: unknown, fallback: string) {
  return reviewerText(value) || reviewerText(fallback) || "SENA reliability reviewer";
}

export function buildSenaReliabilityReviewerEnvelope(value: unknown, fallback: string) {
  const envelope: SenaReliabilityReviewerEnvelope = {
    format: reviewerEnvelopeFormat,
    version: reviewerEnvelopeVersion,
    reviewer: normalizeSenaReliabilityReviewer(value, fallback)
  };
  return {
    reviewer: envelope.reviewer,
    bytes: Buffer.from(JSON.stringify(envelope), "utf8")
  };
}

export function parseSenaReliabilityReviewerEnvelope(bytes: Buffer) {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Queued reliability reviewer envelope must contain valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Queued reliability reviewer envelope must be an object.");
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.format !== reviewerEnvelopeFormat || envelope.version !== reviewerEnvelopeVersion) {
    throw new Error("Queued reliability reviewer envelope format is not supported.");
  }
  const reviewer = reviewerText(envelope.reviewer);
  if (!reviewer || reviewer !== envelope.reviewer) {
    throw new Error("Queued reliability reviewer envelope is not canonical.");
  }
  return reviewer;
}
