import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SenaEnterpriseExpertReview } from "../enterprise/expert-review";
import {
  buildEnterpriseExpertReviewReceipt,
  enterpriseExpertReviewReceiptRuntime,
  isEnterpriseExpertReviewReceiptValid
} from "../enterprise/expert-review-receipt";

const envKeys = [
  "SENA_EXPERT_REVIEW_SIGNING_SECRET",
  "SENA_EXPERT_REVIEW_SIGNING_KEY_ID",
  "SENA_EXPERT_REVIEW_VERIFICATION_KEYS_JSON"
] as const;
const strongKeyOne = "7e480cbd0c34d2dffeb9f3e168acc57d1aa52ba46b3491abc1ccf24e4331c9a8";
const strongKeyTwo = "e9920d86529120b42ce65d6e76e1b956492711ad1fdd2033449ef987757e6b60";
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function approvedReview(): SenaEnterpriseExpertReview {
  return {
    id: "expert-receipt-round25",
    teamId: "team-round25",
    projectId: "project-round25",
    userId: "user-round25",
    status: "approved",
    target: {
      kind: "validation-run",
      id: "validation-round25",
      validationRunEvidenceHash: "a".repeat(64)
    },
    reviewerName: "Receipt Reviewer",
    reviewerRole: "Domain expert",
    expertiseArea: "Statistical integrity",
    claimScope: "claim-ready-with-limits",
    ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
    strengths: "Bound evidence.",
    concerns: "Synthetic fixture.",
    recommendations: "Keep claims bounded.",
    limitations: "No participant data.",
    reviewedAt: "2026-08-25T00:00:00.000Z",
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z"
  };
}

describe("expert-review receipt signing trust root", () => {
  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not mint receipts without an explicit opaque signing key id", () => {
    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = strongKeyOne;

    expect(buildEnterpriseExpertReviewReceipt(approvedReview())).toBeUndefined();
    expect(enterpriseExpertReviewReceiptRuntime()).toMatchObject({
      ready: false,
      keyIdConfigured: false
    });
  });

  it("does not mint an authority receipt from a weak active secret", () => {
    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = "x";
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "weak-v1";

    expect(buildEnterpriseExpertReviewReceipt(approvedReview())).toBeUndefined();
    expect(enterpriseExpertReviewReceiptRuntime()).toMatchObject({
      ready: false,
      secretStrength: "weak"
    });
  });

  it("mints and verifies a full-record receipt with a strong dedicated key", () => {
    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = strongKeyOne;
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "expert-v1";
    const review = approvedReview();
    review.evidenceReceipt = buildEnterpriseExpertReviewReceipt(review);

    expect(review.evidenceReceipt).toMatchObject({
      keyId: "expert-v1",
      keySource: "env-configured",
      validationRunEvidenceHash: review.target.validationRunEvidenceHash
    });
    expect(isEnterpriseExpertReviewReceiptValid(review)).toBe(true);
  });

  it("verifies a rotated receipt only through a strong opaque-id historical key", () => {
    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = strongKeyOne;
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "expert-v1";
    const review = approvedReview();
    review.evidenceReceipt = buildEnterpriseExpertReviewReceipt(review);

    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = strongKeyTwo;
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "expert-v2";
    expect(isEnterpriseExpertReviewReceiptValid(review)).toBe(false);

    process.env.SENA_EXPERT_REVIEW_VERIFICATION_KEYS_JSON = JSON.stringify({
      "expert-v1": "x"
    });
    expect(isEnterpriseExpertReviewReceiptValid(review)).toBe(false);

    process.env.SENA_EXPERT_REVIEW_VERIFICATION_KEYS_JSON = JSON.stringify({
      "expert-v1": strongKeyOne
    });
    expect(isEnterpriseExpertReviewReceiptValid(review)).toBe(true);
  });

  it("fails closed when a rotated active secret reuses a historical key id", () => {
    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = strongKeyOne;
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "expert-v1";
    const review = approvedReview();
    review.evidenceReceipt = buildEnterpriseExpertReviewReceipt(review);

    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = strongKeyTwo;
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "expert-v1";
    process.env.SENA_EXPERT_REVIEW_VERIFICATION_KEYS_JSON = JSON.stringify({
      "expert-v1": strongKeyOne
    });

    expect(enterpriseExpertReviewReceiptRuntime()).toMatchObject({
      ready: false,
      activeHistoricalKeyIdCollision: true
    });
    expect(isEnterpriseExpertReviewReceiptValid(review)).toBe(false);
    expect(buildEnterpriseExpertReviewReceipt(approvedReview())).toBeUndefined();
  });
});
