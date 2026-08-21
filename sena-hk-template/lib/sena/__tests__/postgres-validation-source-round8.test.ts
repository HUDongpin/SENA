import { describe, expect, it } from "vitest";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import { buildSenaGroupComparisonSuite } from "../inference";
import { buildSenaModel } from "../model";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

function validationDataset(weight = 3): SenaDataset {
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
      { source: "p1", target: "support-1", weight: 1, channel: "round8", stage: "analysis", evidence: "p1-support-1" },
      { source: "p2", target: "support-2", weight: 2, channel: "round8", stage: "analysis", evidence: "p2-support-2" },
      { source: "p3", target: "support-3", weight, channel: "round8", stage: "analysis", evidence: "p3-support-3" },
      { source: "p5", target: "support-4", weight: 1, channel: "round8", stage: "analysis", evidence: "p5-support-4" },
      { source: "p6", target: "support-5", weight: 2, channel: "round8", stage: "analysis", evidence: "p6-support-5" }
    ],
    utterances: [],
    coded_segments: [],
    codebook: []
  };
}

function snapshot(dataset: SenaDataset) {
  return buildSenaProjectSnapshot(buildSenaModel(dataset), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: dataset
  });
}

function suite(dataset: SenaDataset) {
  return buildSenaGroupComparisonSuite({
    dataset,
    comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
    iterations: 100,
    bootstrapIterations: 100
  });
}

function adapterFor(input: {
  projectId?: string;
  createdAt: string;
  result: ReturnType<typeof suite>;
}) {
  const primary = input.result.primary;
  const payload = {
    id: "validation-round8",
    teamId: "team-round8",
    projectId: input.projectId,
    userId: "user-round8",
    status: "pending-review",
    preregistrationNote: "Round8 project source fixture.",
    methodNote: "Round8 project source fixture.",
    metric: primary.metric,
    groupField: primary.groupField,
    groupA: primary.groupA,
    groupB: primary.groupB,
    iterations: primary.permutation.iterations,
    seed: primary.permutation.seed,
    pTwoSided: primary.permutation.pTwoSided,
    comparisonCount: input.result.comparisonCount,
    minHolmAdjustedP: Math.min(...input.result.comparisons.map((entry) => entry.holmAdjustedP)),
    significantHolmCount: input.result.significantHolmCount,
    observedDifference: primary.observedDifference,
    result: input.result,
    createdAt: input.createdAt
  };
  const row = {
    id: payload.id,
    team_id: payload.teamId,
    project_id: payload.projectId ?? null,
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
    min_holm_adjusted_p: payload.minHolmAdjustedP,
    significant_holm_count: payload.significantHolmCount,
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
    rows: sql.includes("SELECT *") ? [row] : []
  })) as SenaEnterprisePostgresQuery;
  return createEnterprisePostgresValidationRunAdapter({ query });
}

describe("Postgres validation actual-project source binding", () => {
  it("rejects an alternate coherent suite when its source differs from the current project snapshot", async () => {
    const projectDataset = validationDataset(3);
    const project = { id: "project-current", snapshot: snapshot(projectDataset) };
    const adapter = adapterFor({
      projectId: project.id,
      createdAt: "2026-08-21T00:00:00.000Z",
      result: suite(validationDataset(30))
    });

    await expect(adapter.listValidationRuns({
      projectId: project.id,
      project
    } as never)).rejects.toThrow(/project|group-comparison|source|evidence/i);
  });

  it("fails closed when a stored project-bound run has no current project source", async () => {
    const projectDataset = validationDataset(3);
    const adapter = adapterFor({
      projectId: "missing-project",
      createdAt: "2026-08-21T00:00:00.000Z",
      result: suite(projectDataset)
    });

    await expect(adapter.listValidationRuns({ projectId: "missing-project" }))
      .rejects.toThrow(/project|source|missing/i);
  });

  it("rejects a project-filtered row whose payload deletes its project binding", async () => {
    const projectDataset = validationDataset(3);
    const project = { id: "project-current", snapshot: snapshot(projectDataset) };
    const adapter = adapterFor({
      createdAt: "2026-08-21T00:00:00.000Z",
      result: suite(projectDataset)
    });

    await expect(adapter.listValidationRuns({
      projectId: project.id,
      project
    } as never)).rejects.toThrow(/project|binding|source/i);
  });

  it("preserves projectless standalone reads while validating their embedded source proof", async () => {
    const result = suite(validationDataset(3));
    const adapter = adapterFor({
      createdAt: "2026-08-21T00:00:00.000Z",
      result
    });

    await expect(adapter.listValidationRuns()).resolves.toEqual([
      expect.objectContaining({ result })
    ]);
  });
});
