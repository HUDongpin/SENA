import { describe, expect, it } from "vitest";
import {
  createEnterprisePostgresAdjudicationAdapter,
  createEnterprisePostgresReliabilityRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import type { SenaEnterpriseReliabilityRun } from "../enterprise/reliability-runs";
import type { SenaEnterpriseAdjudicationRecord } from "../enterprise/team-collaboration";
import { buildSenaModel } from "../model";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  reliabilityDashboardToReview
} from "../reliability";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

const createdAt = "2026-08-21T00:00:00.000Z";

function dataset(extraItem = false): SenaDataset {
  const ids = extraItem ? ["u1", "u2", "u3"] : ["u1", "u2"];
  return {
    people: [{ id: "p1", label: "Person 1", role: "reviewer", group: "review" }],
    interactions: [],
    utterances: ids.map((id, index) => ({
      id,
      personId: "p1",
      unitId: `unit-${id}`,
      stanzaId: `stanza-${id}`,
      stage: "coding",
      turnIndex: index + 1,
      text: `Reliability ${id}`
    })),
    coded_segments: [],
    codebook: [{
      id: "evidence",
      label: "Evidence",
      family: "reasoning",
      description: "Evidence use",
      color: "#2563eb"
    }]
  };
}

function snapshot(extraItem = false) {
  const source = dataset(extraItem);
  return buildSenaProjectSnapshot(buildSenaModel(source), {
    generatedAt: createdAt,
    sourceDataset: source
  });
}

function reliabilityFixture() {
  const project = {
    id: "project-round9",
    teamId: "team-round9",
    currentVersion: 1,
    snapshot: snapshot()
  };
  const annotations = [
    { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "evidence", value: false },
    { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
    { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
  ];
  const bound = bindSenaReliabilityAnnotationsToProject(annotations, {
    projectId: project.id,
    projectVersion: project.currentVersion,
    snapshot: project.snapshot
  });
  const dashboard = buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
  const run: SenaEnterpriseReliabilityRun = {
    id: "reliability-round9",
    teamId: project.teamId,
    projectId: project.id,
    userId: "user-round9",
    status: "pending-adjudication",
    reviewer: "Round9 reviewer",
    fileCount: 1,
    annotationCount: bound.annotations.length,
    coderCount: dashboard.coderCount,
    itemCount: dashboard.itemCount,
    codeCount: dashboard.codeCount,
    meanPairwiseKappa: dashboard.meanPairwiseKappa,
    krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
    disagreementCount: dashboard.disagreementCount,
    inputFiles: [{ name: "round9.json", size: 128, sha256: "a".repeat(64) }],
    dashboard,
    projectBinding: bound.binding,
    adjudicationCoverage: {
      schemaVersion: "sena-reliability-adjudication-coverage/v1",
      queuedDisagreements: 1,
      resolvedDisagreements: 0,
      unresolvedDisagreements: 1,
      coverageRate: 0,
      decisions: { include: 0, exclude: 0, revise: 0 },
      updatedAt: createdAt
    },
    reviewPatch: reliabilityDashboardToReview(dashboard, "Round9 reviewer"),
    createdAt
  };
  const row: Record<string, unknown> = {
    id: run.id,
    team_id: run.teamId,
    project_id: run.projectId,
    user_id: run.userId,
    status: run.status,
    reviewed_by: null,
    reviewed_at: null,
    reviewer: run.reviewer,
    file_count: run.fileCount,
    annotation_count: run.annotationCount,
    coder_count: run.coderCount,
    item_count: run.itemCount,
    code_count: run.codeCount,
    mean_pairwise_kappa: run.meanPairwiseKappa,
    krippendorff_alpha_nominal: run.krippendorffAlphaNominal,
    disagreement_count: run.disagreementCount,
    adjudication_coverage_rate: run.adjudicationCoverage.coverageRate,
    unresolved_disagreements: run.adjudicationCoverage.unresolvedDisagreements,
    input_files: run.inputFiles,
    payload: run,
    created_at: run.createdAt,
    updated_at: run.createdAt
  };
  return { project, run, row };
}

function adapterQuery(row: Record<string, unknown>): SenaEnterprisePostgresQuery {
  return (async (sql: string) => ({
    rows: sql.includes("SELECT *") ? [row] : []
  })) as SenaEnterprisePostgresQuery;
}

async function expectStoredIntegrity(operation: Promise<unknown>, expectedPath: string, forbidden = "forged-secret") {
  try {
    await operation;
    throw new Error("Expected stored integrity rejection.");
  } catch (error) {
    expect(error).toMatchObject({
      name: "SenaEnterpriseStoredIntegrityError",
      issues: expect.arrayContaining([expect.objectContaining({ path: expectedPath })])
    });
    expect(JSON.stringify(error)).not.toContain(forbidden);
  }
}

describe("Postgres reliability and adjudication row integrity", () => {
  it.each([
    ["id", "id", "row.id"],
    ["team", "team_id", "row.team_id"],
    ["status", "status", "row.status"],
    ["project", "project_id", "row.project_id"],
    ["created time", "created_at", "row.created_at"]
  ])("rejects a reliability row/payload %s mismatch", async (_label, field, issuePath) => {
    const { project, row } = reliabilityFixture();
    row[field] = "forged-secret";
    const adapter = createEnterprisePostgresReliabilityRunAdapter({ query: adapterQuery(row) });

    await expectStoredIntegrity(adapter.listReliabilityRuns({
      projectId: project.id,
      project
    } as never), issuePath);
  });

  it("requires a filtered project-bound reliability row to retain a non-null SQL project_id", async () => {
    const { project, row } = reliabilityFixture();
    row.project_id = null;
    const adapter = createEnterprisePostgresReliabilityRunAdapter({ query: adapterQuery(row) });

    await expectStoredIntegrity(adapter.listReliabilityRuns({
      projectId: project.id,
      project
    } as never), "row.project_id", "project-round9");
  });

  it("revalidates a project-bound reliability payload against the supplied current snapshot", async () => {
    const { project, row } = reliabilityFixture();
    const adapter = createEnterprisePostgresReliabilityRunAdapter({ query: adapterQuery(row) });
    const changedProject = { ...project, snapshot: snapshot(true) };

    await expectStoredIntegrity(adapter.listReliabilityRuns({
      projectId: project.id,
      project: changedProject
    } as never), "payload.projectBinding", project.id);
  });

  it.each([
    ["annotation count", "annotationCount", "annotation_count", 99],
    ["coder count", "coderCount", "coder_count", 99],
    ["item count", "itemCount", "item_count", 99],
    ["code count", "codeCount", "code_count", 99],
    ["mean pairwise kappa", "meanPairwiseKappa", "mean_pairwise_kappa", 0.75],
    ["Krippendorff alpha", "krippendorffAlphaNominal", "krippendorff_alpha_nominal", 0.75],
    ["disagreement count", "disagreementCount", "disagreement_count", 99]
  ] as const)("rejects a coordinated payload/row %s forgery against the canonical dashboard", async (
    _label,
    payloadField,
    rowField,
    forgedValue
  ) => {
    const { project, run, row } = reliabilityFixture();
    (run as unknown as Record<string, unknown>)[payloadField] = forgedValue;
    row[rowField] = forgedValue;
    const adapter = createEnterprisePostgresReliabilityRunAdapter({ query: adapterQuery(row) });

    await expectStoredIntegrity(adapter.listReliabilityRuns({
      projectId: project.id,
      project
    }), `payload.${payloadField}`);
  });

  it("rejects coordinated payload/row adjudication coverage forged beyond the canonical queue", async () => {
    const { project, run, row } = reliabilityFixture();
    run.adjudicationCoverage = {
      ...run.adjudicationCoverage,
      queuedDisagreements: 99,
      resolvedDisagreements: 99,
      unresolvedDisagreements: 0,
      coverageRate: 1,
      decisions: { include: 99, exclude: 0, revise: 0 }
    };
    row.adjudication_coverage_rate = 1;
    row.unresolved_disagreements = 0;
    const adapter = createEnterprisePostgresReliabilityRunAdapter({ query: adapterQuery(row) });

    await expectStoredIntegrity(adapter.listReliabilityRuns({
      projectId: project.id,
      project,
      adjudications: []
    } as never), "payload.adjudicationCoverage");
  });

  it("revalidates a retained historical reliability row against its exact project revision", async () => {
    const { project, run, row } = reliabilityFixture();
    const adapter = createEnterprisePostgresReliabilityRunAdapter({ query: adapterQuery(row) });
    const currentProject = {
      ...project,
      currentVersion: 2,
      snapshot: snapshot(true)
    };

    const historicalRuns = await adapter.listReliabilityRuns({
      projectId: project.id,
      project: currentProject,
      projectRevisions: [{
        projectId: project.id,
        teamId: project.teamId,
        version: 1,
        snapshot: project.snapshot
      }]
    });

    expect(historicalRuns).toHaveLength(1);
    expect(historicalRuns[0]).toEqual(expect.objectContaining({
      id: run.id,
      projectBinding: expect.objectContaining({ projectVersion: 1 })
    }));
  });

  it.each([
    ["id", "id", "row.id"],
    ["team", "team_id", "row.team_id"],
    ["project", "project_id", "row.project_id"],
    ["run", "reliability_run_id", "row.reliability_run_id"],
    ["item", "item_id", "row.item_id"],
    ["code", "code_id", "row.code_id"],
    ["decision", "decision", "row.decision"],
    ["reviewer", "reviewer_id", "row.reviewer_id"],
    ["coder values", "coder_values", "row.coder_values"],
    ["created time", "created_at", "row.created_at"]
  ])("rejects an adjudication row/payload %s mismatch", async (_label, field, issuePath) => {
    const { project, run } = reliabilityFixture();
    const disagreement = run.dashboard.adjudicationQueue[0];
    if (!disagreement) throw new Error("adjudication fixture missing");
    const record = {
      id: "adjudication-round9",
      projectId: project.id,
      teamId: project.teamId,
      reliabilityRunId: run.id,
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision: "include",
      reviewerId: "reviewer-round9",
      notes: "Canonical queue decision",
      coderValues: disagreement.values,
      projectVersion: project.currentVersion,
      snapshotFingerprint: run.projectBinding!.snapshotFingerprint,
      coderIds: run.dashboard.coderIds,
      createdAt
    } satisfies SenaEnterpriseAdjudicationRecord & Record<string, unknown>;
    const row: Record<string, unknown> = {
      id: record.id,
      project_id: record.projectId,
      team_id: record.teamId,
      reliability_run_id: record.reliabilityRunId,
      item_id: record.itemId,
      code_id: record.codeId,
      decision: record.decision,
      reviewer_id: record.reviewerId,
      coder_values: record.coderValues,
      payload: record,
      created_at: record.createdAt,
      updated_at: record.createdAt
    };
    row[field] = field === "coder_values" ? {} : "forged-secret";
    const adapter = createEnterprisePostgresAdjudicationAdapter({ query: adapterQuery(row) });

    await expectStoredIntegrity(adapter.listAdjudications({
      projectId: project.id,
      reliabilityRunId: run.id
    }), issuePath);
  });
});
