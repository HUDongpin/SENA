import { describe, expect, it } from "vitest";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  normalizeSenaGroupComparisonValidationResult,
  type SenaGroupComparisonResult
} from "../inference";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import { emptyEnterpriseDb, normalizeEnterpriseDb } from "../enterprise/state";
import type { SenaDataset } from "../types";

function dataset(): SenaDataset {
  const people = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `p${index + 1}`,
      label: `Person ${index + 1}`,
      role: index < 3 ? "A" : "B",
      group: index < 3 ? "A" : "B"
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `support-${index + 1}`,
      label: `Support ${index + 1}`,
      role: "support",
      group: "support"
    }))
  ];
  return {
    people,
    interactions: [
      ["p1", "support-1", 1],
      ["p2", "support-2", 2],
      ["p3", "support-3", 3],
      ["p5", "support-4", 1],
      ["p6", "support-5", 2]
    ].map(([source, target, weight]) => ({
      source: String(source),
      target: String(target),
      weight: Number(weight),
      channel: "round9",
      stage: "deterministic-proof",
      evidence: `${source}-${target}`
    })),
    utterances: [],
    coded_segments: [],
    codebook: []
  };
}

function result() {
  return buildSenaGroupComparison({
    dataset: dataset(),
    groupA: "A",
    groupB: "B",
    metric: "socialStrength",
    iterations: 100,
    bootstrapIterations: 100,
    seed: 20260821
  });
}

function coordinatedResamplingForgery(value: SenaGroupComparisonResult) {
  const forged = structuredClone(value);
  forged.permutation = {
    ...forged.permutation,
    seed: forged.permutation.seed + 1,
    pTwoSided: 0,
    nullLower: -999,
    nullUpper: 999,
    samplesPreview: forged.permutation.samplesPreview.map(() => 999)
  };
  forged.bootstrap = {
    ...forged.bootstrap,
    seed: forged.bootstrap.seed + 1,
    meanDifferenceLower: -999,
    meanDifferenceUpper: 999,
    samplesPreview: forged.bootstrap.samplesPreview.map(() => -999)
  };
  return forged;
}

function expectDeterministicRejection(value: unknown, source?: SenaDataset) {
  expect(() => normalizeSenaGroupComparisonValidationResult(
    value as never,
    source ? { dataset: source } : undefined
  )).toThrow(/deterministic|permutation|bootstrap|group-comparison|source evidence/i);
}

describe("group-comparison deterministic proof obligations", () => {
  it("rejects a coordinated standalone permutation, bootstrap, CI, preview, and seed forgery", () => {
    expectDeterministicRejection(coordinatedResamplingForgery(result()));
  });

  it("recomputes all stochastic fields when an actual holder dataset is supplied", () => {
    expectDeterministicRejection(coordinatedResamplingForgery(result()), dataset());
  });

  it("rejects the coordinated forgery during file-state normalization", () => {
    const forged = coordinatedResamplingForgery(result());
    const db = emptyEnterpriseDb();
    db.validationRuns = [{
      id: "validation_round9_coordinated_forgery",
      teamId: "team_round9",
      userId: "user_round9",
      status: "pending-review",
      preregistrationNote: "Round 9 deterministic proof fixture.",
      methodNote: forged.guardrail,
      metric: forged.metric,
      groupField: forged.groupField,
      groupA: forged.groupA,
      groupB: forged.groupB,
      iterations: forged.permutation.iterations,
      seed: forged.permutation.seed,
      pTwoSided: forged.permutation.pTwoSided,
      comparisonCount: 1,
      observedDifference: forged.observedDifference,
      createdAt: "2026-08-21T00:00:00.000Z",
      result: forged
    } as never];

    expect(() => normalizeEnterpriseDb(db)).toThrowError(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "result"
    }));
  });

  it("rejects the coordinated forgery during Postgres normalization", async () => {
    const forged = coordinatedResamplingForgery(result());
    const payload = {
      id: "validation-deterministic-forgery",
      teamId: "team-round9",
      userId: "user-round9",
      status: "pending-review",
      preregistrationNote: "Round9 deterministic proof.",
      methodNote: "Round9 deterministic proof.",
      metric: forged.metric,
      groupField: forged.groupField,
      groupA: forged.groupA,
      groupB: forged.groupB,
      iterations: forged.permutation.iterations,
      seed: forged.permutation.seed,
      pTwoSided: forged.permutation.pTwoSided,
      comparisonCount: 1,
      observedDifference: forged.observedDifference,
      result: forged,
      createdAt: "2026-08-21T00:00:00.000Z"
    };
    const row = {
      id: payload.id,
      team_id: payload.teamId,
      project_id: null,
      user_id: payload.userId,
      status: payload.status,
      reviewer_id: null,
      reviewed_at: null,
      metric: payload.metric,
      group_field: payload.groupField,
      group_a: payload.groupA,
      group_b: payload.groupB,
      iterations: payload.iterations,
      seed: payload.seed,
      p_two_sided: payload.pTwoSided,
      comparison_count: payload.comparisonCount,
      min_holm_adjusted_p: null,
      significant_holm_count: null,
      observed_difference: payload.observedDifference,
      result_schema_version: payload.result.schemaVersion,
      preregistration_plan_hash: null,
      parity_evidence_status: null,
      parity_evidence_hash: null,
      formal_inference_status: null,
      payload,
      created_at: payload.createdAt
    };
    const query = (async (sql: string) => ({
      rows: sql.includes("SELECT *")
        ? [row]
        : []
    })) as SenaEnterprisePostgresQuery;
    const adapter = createEnterprisePostgresValidationRunAdapter({ query });

    await expect(adapter.listValidationRuns())
      .rejects.toThrow(/deterministic|permutation|bootstrap|group-comparison|source evidence/i);
  });

  it("rebuilds nested p values before accepting coordinated Holm, primary, and count changes", () => {
    const suite = buildSenaGroupComparisonSuite({
      dataset: dataset(),
      comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
      iterations: 100,
      bootstrapIterations: 100,
      seed: 20260821
    });
    suite.comparisons[0] = {
      ...suite.comparisons[0],
      ...coordinatedResamplingForgery(suite.comparisons[0]),
      holmAdjustedP: 0,
      significantAtAlpha: true
    };
    suite.primary = structuredClone(suite.comparisons[0]);
    suite.significantHolmCount = 1;

    expectDeterministicRejection(suite);
  });
});
