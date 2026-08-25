import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalSenaJson } from "../canonical-json";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { envValue, productionSecretStrength } from "./auth-config";
import type { SenaEnterpriseExpertReview } from "./expert-review";

export type SenaEnterpriseExpertReviewReceipt = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseExpertReviewReceipt;
  algorithm: "hmac-sha256";
  keySource: "env-configured";
  keyId: string;
  signedAt: string;
  validationRunEvidenceHash: string;
  signature: string;
};

const receiptDomain = "sena-enterprise-expert-review-receipt/v1";

function historicalVerificationKeys() {
  const keys = new Map<string, string>();
  const encoded = envValue("SENA_EXPERT_REVIEW_VERIFICATION_KEYS_JSON");
  if (!encoded) return keys;
  try {
    const parsed = JSON.parse(encoded) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return keys;
    for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^[A-Za-z0-9._:-]{1,64}$/.test(keyId) &&
        typeof value === "string" &&
        productionSecretStrength(value.trim()) === "configured") {
        keys.set(keyId, value.trim());
      }
    }
  } catch {
    return keys;
  }
  return keys;
}

function expertReceiptKeyConfiguration() {
  const secret = envValue("SENA_EXPERT_REVIEW_SIGNING_SECRET");
  const secretStrength = productionSecretStrength(secret);
  const keyId = envValue("SENA_EXPERT_REVIEW_SIGNING_KEY_ID");
  const keyIdValid = typeof keyId === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(keyId);
  const historicalKeys = historicalVerificationKeys();
  const activeHistoricalKeyIdCollision = secretStrength === "configured" &&
    keyIdValid && historicalKeys.has(keyId);
  const ready = typeof secret === "string" && secretStrength === "configured" &&
    keyIdValid && !activeHistoricalKeyIdCollision;
  return {
    secret,
    secretStrength,
    keyId,
    keyIdValid,
    historicalKeys,
    activeHistoricalKeyIdCollision,
    ready
  };
}

function signingKeyMaterial() {
  const configuration = expertReceiptKeyConfiguration();
  if (!configuration.ready || !configuration.secret || !configuration.keyId) return undefined;
  return {
    key: configuration.secret,
    keyId: configuration.keyId,
    keySource: "env-configured" as const
  };
}

export function enterpriseExpertReviewReceiptRuntime() {
  const configuration = expertReceiptKeyConfiguration();
  const historicalKeyCount = configuration.historicalKeys.size;
  return {
    ready: configuration.ready,
    secretStrength: configuration.secretStrength,
    keyIdConfigured: configuration.keyId !== undefined,
    keyIdValid: configuration.keyIdValid,
    activeHistoricalKeyIdCollision: configuration.activeHistoricalKeyIdCollision,
    historicalKeyCount,
    evidence: [
      `expertReviewReceiptSigning=${configuration.ready ? "configured" : "review"}`,
      `expertReviewReceiptSecretStrength=${configuration.secretStrength}`,
      `expertReviewReceiptKeyId=${configuration.keyIdValid ? configuration.keyId : "missing-or-invalid"}`,
      `expertReviewReceiptActiveHistoricalKeyIdCollision=${configuration.activeHistoricalKeyIdCollision}`,
      `expertReviewReceiptHistoricalKeys=${historicalKeyCount}`,
      "expertReviewReceiptSecretMinLength=32",
      "expertReviewReceiptAlgorithm=hmac-sha256"
    ]
  };
}

function receiptBody(
  review: SenaEnterpriseExpertReview,
  receipt: Omit<SenaEnterpriseExpertReviewReceipt, "signature">
) {
  const { evidenceReceipt: _evidenceReceipt, ...reviewBody } = review;
  return canonicalSenaJson({
    domain: receiptDomain,
    review: reviewBody,
    receipt
  }) ?? "null";
}

function receiptSignature(
  review: SenaEnterpriseExpertReview,
  receipt: Omit<SenaEnterpriseExpertReviewReceipt, "signature">,
  key: string
) {
  return createHmac("sha256", key).update(receiptBody(review, receipt)).digest("hex");
}

export function buildEnterpriseExpertReviewReceipt(
  review: SenaEnterpriseExpertReview
): SenaEnterpriseExpertReviewReceipt | undefined {
  if (
    review.status !== "approved" ||
    review.target.kind !== "validation-run" ||
    !/^[a-f0-9]{64}$/.test(review.target.validationRunEvidenceHash ?? "") ||
    typeof review.reviewedAt !== "string" ||
    !Number.isFinite(Date.parse(review.reviewedAt))
  ) {
    return undefined;
  }
  const keyMaterial = signingKeyMaterial();
  if (!keyMaterial) return undefined;
  const { key, keyId, keySource } = keyMaterial;
  const unsigned: Omit<SenaEnterpriseExpertReviewReceipt, "signature"> = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseExpertReviewReceipt,
    algorithm: "hmac-sha256",
    keySource,
    keyId,
    signedAt: review.reviewedAt,
    validationRunEvidenceHash: review.target.validationRunEvidenceHash!
  };
  return {
    ...unsigned,
    signature: receiptSignature(review, unsigned, key)
  };
}

export function isEnterpriseExpertReviewReceiptValid(review: SenaEnterpriseExpertReview) {
  const receipt = review.evidenceReceipt;
  if (
    review.status !== "approved" ||
    review.target.kind !== "validation-run" ||
    !receipt ||
    receipt.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseExpertReviewReceipt ||
    receipt.algorithm !== "hmac-sha256" ||
    typeof receipt.signedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.signedAt)) ||
    receipt.signedAt !== review.reviewedAt ||
    receipt.validationRunEvidenceHash !== review.target.validationRunEvidenceHash ||
    !/^[a-f0-9]{64}$/.test(receipt.signature)
  ) {
    return false;
  }
  const configuration = expertReceiptKeyConfiguration();
  if (configuration.activeHistoricalKeyIdCollision) return false;
  const keyMaterial = signingKeyMaterial();
  if (receipt.keySource !== "env-configured") return false;
  const key = keyMaterial?.keyId === receipt.keyId
    ? keyMaterial.key
    : configuration.historicalKeys.get(receipt.keyId);
  if (!key) return false;
  const { signature: _signature, ...unsigned } = receipt;
  const expected = receiptSignature(review, unsigned, key);
  const actualBytes = Buffer.from(receipt.signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
