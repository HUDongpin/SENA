import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import type { SenaEnterpriseValidationRun } from "../enterprise/validation-runs";
import {
  buildEnterpriseValidationParityEvidence,
  buildEnterpriseValidationPreregistrationPlan,
  sealEnterpriseValidationRunEvidence
} from "../enterprise/validation-integrity";
import { buildEnterpriseProjectEvidenceBinding } from "../enterprise/team-project";
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

function postgresRow(run: SenaEnterpriseValidationRun): Record<string, unknown> {
  return {
    id: run.id,
    team_id: run.teamId,
    project_id: run.projectId ?? null,
    user_id: run.userId,
    status: run.status,
    reviewer_id: run.reviewerId ?? null,
    reviewed_at: run.reviewedAt ?? null,
    metric: run.metric,
    group_field: run.groupField,
    group_a: run.groupA,
    group_b: run.groupB,
    iterations: run.iterations,
    seed: run.seed,
    p_two_sided: run.pTwoSided,
    comparison_count: run.comparisonCount ?? 1,
    min_holm_adjusted_p: run.minHolmAdjustedP ?? null,
    significant_holm_count: run.significantHolmCount ?? null,
    observed_difference: run.observedDifference,
    result_schema_version: run.result.schemaVersion,
    preregistration_plan_hash: run.preregistrationPlan?.planHash ?? null,
    parity_evidence_status: run.parityEvidence?.status ?? null,
    parity_evidence_hash: run.parityEvidence?.validationRunHash ?? null,
    formal_inference_status: run.parityEvidence?.formalInference?.status ?? null,
    payload: run,
    created_at: run.createdAt
  };
}

function sealedFixture() {
  const { project, run } = fixture();
  const preregistrationPlan = buildEnterpriseValidationPreregistrationPlan({
    result: run.result,
    preregistrationNote: run.preregistrationNote,
    methodNote: run.methodNote
  });
  const parityEvidence = buildEnterpriseValidationParityEvidence({
    result: run.result,
    preregistrationPlan,
    parityEvidence: {
      walkthroughDatasetLabel: "round9 project snapshot",
      walkthroughDatasetHash: buildEnterpriseProjectEvidenceBinding(project).snapshotSha256,
      walkthroughSource: "project-snapshot",
      walkthroughSourceId: project.id
    }
  });
  const sealed = sealEnterpriseValidationRunEvidence({
    ...run,
    projectBinding: buildEnterpriseProjectEvidenceBinding(project),
    preregistrationPlan,
    parityEvidence
  }, project);
  return { project, run: sealed, row: postgresRow(sealed) };
}

function reorderJsonObjectKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => reorderJsonObjectKeys(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([key, entry]) => [key, reorderJsonObjectKeys(entry)])) as T;
  }
  return value;
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
  it("binds an exact validation lookup to team, project, and run identity", async () => {
    const { project, run, row } = sealedFixture();
    let selectedSql = "";
    let selectedValues: unknown[] = [];
    const query = (async (sql: string, values: unknown[] = []) => {
      if (!sql.includes("SELECT *")) return { rows: [] };
      selectedSql = sql;
      selectedValues = values;
      return { rows: [row] };
    }) as SenaEnterprisePostgresQuery;
    const adapter = createEnterprisePostgresValidationRunAdapter({ query });

    await expect(adapter.listValidationRuns({
      teamId: project.teamId,
      projectId: project.id,
      runId: run.id,
      project,
      limit: 1
    })).resolves.toEqual([expect.objectContaining({ id: run.id })]);
    expect(selectedSql).toMatch(/team_id = \$1/);
    expect(selectedSql).toMatch(/project_id = \$2/);
    expect(selectedSql).toMatch(/id = \$3/);
    expect(selectedValues).toEqual([project.teamId, project.id, run.id, 1]);

    const forgedRow = structuredClone(row);
    forgedRow.id = "foreign-run-id";
    const forgedQuery = (async (sql: string) => ({
      rows: sql.includes("SELECT *") ? [forgedRow] : []
    })) as SenaEnterprisePostgresQuery;
    await expectStoredIntegrity(createEnterprisePostgresValidationRunAdapter({
      query: forgedQuery
    }).listValidationRuns({
      teamId: project.teamId,
      projectId: project.id,
      runId: run.id,
      project,
      limit: 1
    }), "row.id");
  });

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

  it("maps a malformed nested formal-inference payload to typed stored-integrity failure", async () => {
    const { project, run, row } = sealedFixture();
    const malformed = structuredClone(run);
    if (!malformed.parityEvidence) throw new Error("Expected parity evidence fixture.");
    (malformed.parityEvidence as unknown as { formalInference?: unknown }).formalInference = undefined;
    row.formal_inference_status = null;
    row.payload = malformed;

    await expectStoredIntegrity(adapterFor(row).listValidationRuns({
      projectId: project.id,
      project
    } as never), "payload.resourceAdmission");
  });

  it("rejects an invalid full-seal format before replaying a malformed result", async () => {
    const { project, run, row } = sealedFixture();
    const malformed = structuredClone(run) as unknown as Record<string, unknown>;
    malformed.validationRunEvidenceHash = "not-a-sha256";
    malformed.result = {};
    row.result_schema_version = null;
    row.payload = malformed;

    await expectStoredIntegrity(adapterFor(row).listValidationRuns({
      projectId: project.id,
      project
    } as never), "payload.resourceAdmission");
  });

  it("rejects a foreign-team retained revision before accepting its matching snapshot", async () => {
    const { project, run, row } = sealedFixture();
    const advancedProject = { ...project, currentVersion: project.currentVersion + 1 };

    await expectStoredIntegrity(adapterFor(row).listValidationRuns({
      projectId: project.id,
      project: advancedProject,
      projectRevisions: [{
        projectId: project.id,
        teamId: "team_foreign_retained_revision",
        version: project.currentVersion,
        snapshot: project.snapshot
      }]
    } as never), "payload.projectBinding");
  });

  it("accepts jsonb key reorder but rejects a coherent run-B splice under run-A's full seal", async () => {
    const previousDbDir = process.env.SENA_ENTERPRISE_DB_DIR;
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-pg-seal-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Validation PostgreSQL Seal Reviewer",
        email: "validation-pg-seal@example.edu",
        password: "sena-secure-123",
        organization: "Validation PostgreSQL Seal Lab",
        plan: "lab"
      });
      const source = dataset();
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Validation PostgreSQL seal project",
        snapshot: buildSenaProjectSnapshot(buildSenaModel(source), {
          generatedAt: createdAt,
          sourceDataset: source
        })
      });
      const resultA = buildSenaGroupComparisonSuite({
        dataset: source,
        comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
        iterations: 100,
        bootstrapIterations: 100,
        seed: 20260821
      });
      const resultB = buildSenaGroupComparisonSuite({
        dataset: source,
        comparisons: [{ groupA: "A", groupB: "B", metric: "bridgeScore" }],
        iterations: 120,
        bootstrapIterations: 120,
        seed: 20260822
      });
      const runA = enterprise.createEnterpriseValidationRun(registered.context, {
        teamId: project.teamId,
        projectId: project.id,
        preregistrationNote: "Run A preregistration.",
        methodNote: "Run A method.",
        result: resultA
      });
      const runB = enterprise.createEnterpriseValidationRun(registered.context, {
        teamId: project.teamId,
        projectId: project.id,
        preregistrationNote: "Run B preregistration.",
        methodNote: "Run B method.",
        result: resultB
      });

      const reorderedRow = postgresRow(runA);
      reorderedRow.payload = reorderJsonObjectKeys(structuredClone(runA));
      await expect(adapterFor(reorderedRow).listValidationRuns({
        projectId: project.id,
        project
      } as never)).resolves.toEqual([expect.objectContaining({ id: runA.id })]);

      const spliced = structuredClone(runA);
      for (const key of [
        "metric",
        "groupField",
        "groupA",
        "groupB",
        "iterations",
        "seed",
        "pTwoSided",
        "comparisonCount",
        "minHolmAdjustedP",
        "significantHolmCount",
        "observedDifference",
        "preregistrationNote",
        "methodNote",
        "preregistrationPlan",
        "parityEvidence",
        "result"
      ] as const) {
        (spliced as unknown as Record<string, unknown>)[key] = structuredClone(
          (runB as unknown as Record<string, unknown>)[key]
        );
      }
      const splicedRow = postgresRow(spliced);
      await expectStoredIntegrity(adapterFor(splicedRow).listValidationRuns({
        projectId: project.id,
        project
      } as never), "payload.validationRunEvidenceHash");
    } finally {
      if (previousDbDir === undefined) delete process.env.SENA_ENTERPRISE_DB_DIR;
      else process.env.SENA_ENTERPRISE_DB_DIR = previousDbDir;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
    }
  });
});
