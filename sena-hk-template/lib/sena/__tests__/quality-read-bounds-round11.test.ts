import { describe, expect, it, vi } from "vitest";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  normalizeSenaGroupComparisonValidationResult
} from "../inference";
import type { SenaEnterpriseValidationRun } from "../enterprise/validation-runs";
import type { SenaDataset } from "../types";

const createdAt = "2026-08-21T00:00:00.000Z";

function boundedDataset(): SenaDataset {
  return {
    people: [
      { id: "a1", label: "A1", group: "A", role: "A" },
      { id: "a2", label: "A2", group: "A", role: "A" },
      { id: "b1", label: "B1", group: "B", role: "B" },
      { id: "b2", label: "B2", group: "B", role: "B" },
      { id: "s1", label: "S1", group: "support", role: "support" },
      { id: "s2", label: "S2", group: "support", role: "support" }
    ],
    interactions: [
      { source: "a1", target: "s1", weight: 1, channel: "round11", stage: "read-bound", evidence: "a1-s1" },
      { source: "a2", target: "s2", weight: 2, channel: "round11", stage: "read-bound", evidence: "a2-s2" },
      { source: "b1", target: "s1", weight: 3, channel: "round11", stage: "read-bound", evidence: "b1-s1" },
      { source: "b2", target: "s2", weight: 4, channel: "round11", stage: "read-bound", evidence: "b2-s2" }
    ],
    utterances: [],
    coded_segments: [],
    codebook: []
  };
}

function currentLeaf() {
  return buildSenaGroupComparison({
    dataset: boundedDataset(),
    groupA: "A",
    groupB: "B",
    metric: "socialStrength",
    iterations: 100,
    bootstrapIterations: 100,
    seed: 20260821
  });
}

function structuredLengthAllocations(operation: () => void) {
  const from = vi.spyOn(Array, "from");
  let thrown: unknown;
  try {
    operation();
  } catch (error) {
    thrown = error;
  }
  const lengths = from.mock.calls.flatMap(([source]) => {
    if (!source || typeof source !== "object" || Array.isArray(source) || Symbol.iterator in source) return [];
    const length = (source as { length?: unknown }).length;
    return typeof length === "number" ? [length] : [];
  });
  from.mockRestore();
  return { thrown, lengths };
}

function validationRow() {
  const result = currentLeaf();
  const run: SenaEnterpriseValidationRun = {
    id: "validation-round11-read-bound",
    teamId: "team-round11",
    userId: "user-round11",
    status: "pending-review",
    preregistrationNote: "Round11 bounded list fixture.",
    methodNote: "Round11 bounded list fixture.",
    metric: result.metric,
    groupField: result.groupField,
    groupA: result.groupA,
    groupB: result.groupB,
    iterations: result.permutation.iterations,
    seed: result.permutation.seed,
    pTwoSided: result.permutation.pTwoSided,
    comparisonCount: 1,
    observedDifference: result.observedDifference,
    result,
    createdAt
  };
  return {
    id: run.id,
    team_id: run.teamId,
    project_id: null,
    user_id: run.userId,
    status: run.status,
    reviewer_id: null,
    reviewed_at: null,
    metric: run.metric,
    group_field: run.groupField,
    group_a: run.groupA,
    group_b: run.groupB,
    iterations: run.iterations,
    seed: run.seed,
    p_two_sided: run.pTwoSided,
    comparison_count: 1,
    min_holm_adjusted_p: null,
    significant_holm_count: null,
    observed_difference: run.observedDifference,
    result_schema_version: run.result.schemaVersion,
    preregistration_plan_hash: null,
    parity_evidence_status: null,
    parity_evidence_hash: null,
    formal_inference_status: null,
    payload: run,
    created_at: run.createdAt
  } satisfies Record<string, unknown>;
}

describe("Round11 deterministic reader workload bounds", () => {
  it("rejects iterations above the writer maximum before deterministic replay allocation", () => {
    const forged = currentLeaf();
    forged.permutation.iterations = 10_001;

    const observed = structuredLengthAllocations(() => {
      normalizeSenaGroupComparisonValidationResult(forged);
    });

    expect(observed.thrown).toBeInstanceOf(Error);
    expect(observed.lengths.filter((length) => length > 10_000)).toEqual([]);
  });

  it("rejects suites above 40 comparisons before replaying any nested leaf", () => {
    const suite = buildSenaGroupComparisonSuite({
      dataset: boundedDataset(),
      comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
      iterations: 100,
      bootstrapIterations: 100,
      seed: 20260821
    });
    suite.comparisons = Array.from({ length: 41 }, () => structuredClone(suite.comparisons[0]));
    suite.comparisonCount = suite.comparisons.length;

    const observed = structuredLengthAllocations(() => {
      normalizeSenaGroupComparisonValidationResult(suite);
    });

    expect(observed.thrown).toBeInstanceOf(Error);
    expect(observed.lengths).toEqual([]);
  });

  it("caps and defensively slices Postgres validation list replay to 100 rows", async () => {
    const row = validationRow();
    let selectValues: unknown[] = [];
    const query = (async (sql: string, values: unknown[] = []) => {
      if (!sql.includes("SELECT *")) return { rows: [] };
      selectValues = values;
      return {
        // Deliberately ignore SQL LIMIT to prove the application boundary is
        // bounded even if a driver/fake returns more rows than requested.
        rows: Array.from({ length: 101 }, () => structuredClone(row))
      };
    }) as SenaEnterprisePostgresQuery;
    const adapter = createEnterprisePostgresValidationRunAdapter({ query });

    const restored = await adapter.listValidationRuns({ limit: 5000 });

    expect(selectValues.at(-1)).toBe(100);
    expect(restored).toHaveLength(100);
  });
});
