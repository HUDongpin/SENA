import { describe, expect, it } from "vitest";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import type { SenaEnterpriseValidationRun } from "../enterprise/validation-runs";
import { buildSenaGroupComparisonSuite } from "../inference";
import { buildSenaModel } from "../model";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

const createdAt = "2026-08-21T00:00:00.000Z";

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
      stage: "validation-integrity",
      evidence: `${source}-${target}`
    })),
    utterances: [],
    coded_segments: [],
    codebook: []
  };
}

function fixture(projectBound = true) {
  const source = dataset();
  const project = {
    id: "project-validation-round9",
    teamId: "team-validation-round9",
    currentVersion: 1,
    snapshot: buildSenaProjectSnapshot(buildSenaModel(source), {
      generatedAt: createdAt,
      sourceDataset: source
    })
  };
  const result = buildSenaGroupComparisonSuite({
    dataset: source,
    comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
    iterations: 100,
    bootstrapIterations: 100,
    seed: 20260821
  });
  const primary = result.primary;
  const run: SenaEnterpriseValidationRun = {
    id: "validation-round9",
    teamId: project.teamId,
    projectId: projectBound ? project.id : undefined,
    userId: "user-validation-round9",
    status: "pending-review",
    preregistrationNote: "Round9 SQL integrity fixture.",
    methodNote: "Round9 SQL integrity fixture.",
    metric: primary.metric,
    groupField: primary.groupField,
    groupA: primary.groupA,
    groupB: primary.groupB,
    iterations: primary.permutation.iterations,
    seed: primary.permutation.seed,
    pTwoSided: primary.permutation.pTwoSided,
    comparisonCount: result.comparisonCount,
    minHolmAdjustedP: Math.min(...result.comparisons.map((entry) => entry.holmAdjustedP)),
    significantHolmCount: result.significantHolmCount,
    observedDifference: primary.observedDifference,
    result,
    createdAt
  };
  const row: Record<string, unknown> = {
    id: run.id,
    team_id: run.teamId,
    project_id: run.projectId ?? null,
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
    comparison_count: run.comparisonCount,
    min_holm_adjusted_p: run.minHolmAdjustedP,
    significant_holm_count: run.significantHolmCount,
    observed_difference: run.observedDifference,
    result_schema_version: run.result.schemaVersion,
    preregistration_plan_hash: null,
    parity_evidence_status: null,
    parity_evidence_hash: null,
    formal_inference_status: null,
    payload: run,
    created_at: run.createdAt
  };
  return { project, run, row };
}

function adapterFor(row: Record<string, unknown>) {
  const query = (async (sql: string) => ({
    rows: sql.includes("SELECT *") ? [row] : []
  })) as SenaEnterprisePostgresQuery;
  return createEnterprisePostgresValidationRunAdapter({ query });
}

async function expectStoredIntegrity(operation: Promise<unknown>, path: string) {
  try {
    await operation;
    throw new Error("Expected stored validation integrity rejection.");
  } catch (error) {
    expect(error).toMatchObject({
      name: "SenaEnterpriseStoredIntegrityError",
      issues: expect.arrayContaining([expect.objectContaining({ path })])
    });
    expect(JSON.stringify(error)).not.toContain("forged-secret");
  }
}

describe("Postgres validation row and project identity", () => {
  it.each([
    ["id", "id", "row.id"],
    ["team", "team_id", "row.team_id"],
    ["status", "status", "row.status"],
    ["metric", "metric", "row.metric"],
    ["seed", "seed", "row.seed"],
    ["p value", "p_two_sided", "row.p_two_sided"],
    ["created time", "created_at", "row.created_at"]
  ])("rejects a validation SQL row/payload %s mismatch", async (_label, column, path) => {
    const { project, row } = fixture();
    row[column] = "forged-secret";

    await expectStoredIntegrity(adapterFor(row).listValidationRuns({
      projectId: project.id,
      project
    } as never), path);
  });

  it("rejects a null SQL project_id on a project-filtered read", async () => {
    const { project, row } = fixture();
    row.project_id = null;

    await expectStoredIntegrity(adapterFor(row).listValidationRuns({
      projectId: project.id,
      project
    } as never), "row.project_id");
  });

  it("strictly binds the SQL project_id to the filter, payload, and supplied project", async () => {
    const { project, row } = fixture();
    row.project_id = "forged-secret";

    await expectStoredIntegrity(adapterFor(row).listValidationRuns({
      projectId: project.id,
      project
    } as never), "row.project_id");
  });

  it("allows a truly projectless row only without a filter, payload project, or supplied project", async () => {
    const { run, row } = fixture(false);

    const restored = await adapterFor(row).listValidationRuns();
    expect(restored).toEqual([expect.objectContaining({ id: run.id })]);
    expect(restored[0].projectId).toBeUndefined();
  });
});
