import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createEnterpriseAdjudicationRecord,
  createEnterpriseProject,
  createEnterpriseReliabilityRun,
  registerEnterpriseUser,
  reviewEnterpriseReliabilityRun,
  updateEnterpriseProject
} from "../enterprise";
import { emptyEnterpriseDb, readEnterpriseDb, writeEnterpriseDb } from "../enterprise/state";
import { buildSenaModel } from "../model";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation
} from "../reliability";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

let enterpriseDbDir = "";
let userIndex = 0;

beforeAll(() => {
  enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-reliability-adjudication-round9-"));
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
});

beforeEach(() => {
  writeFileSync(path.join(enterpriseDbDir, "enterprise-db.json"), JSON.stringify(emptyEnterpriseDb()));
});

afterAll(() => {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  rmSync(enterpriseDbDir, { recursive: true, force: true });
});

function dataset(): SenaDataset {
  return {
    people: [{ id: "p1", label: "Person 1", role: "reviewer", group: "review" }],
    interactions: [],
    utterances: ["u1", "u2"].map((id, index) => ({
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

function snapshot() {
  const source = dataset();
  return buildSenaProjectSnapshot(buildSenaModel(source), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: source
  });
}

function annotations(): SenaCoderAnnotation[] {
  return [
    { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "evidence", value: false },
    { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
    { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
  ];
}

function setupProjectRun() {
  userIndex += 1;
  const registered = registerEnterpriseUser({
    name: "Round9 Reliability Reviewer",
    email: `round9-reliability-${userIndex}@example.edu`,
    password: "sena-secure-123",
    organization: "Round9 Reliability Lab",
    plan: "lab"
  });
  const project = createEnterpriseProject(registered.context, {
    teamId: registered.context.teams[0].id,
    title: "Round9 reliability project",
    snapshot: snapshot()
  });
  const bound = bindSenaReliabilityAnnotationsToProject(annotations(), {
    projectId: project.id,
    projectVersion: project.currentVersion,
    snapshot: project.snapshot
  });
  const dashboard = buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
  const run = createEnterpriseReliabilityRun(registered.context, {
    teamId: project.teamId,
    projectId: project.id,
    projectVersion: project.currentVersion,
    reviewer: registered.context.user.name,
    fileCount: 1,
    annotationCount: bound.annotations.length,
    annotations: bound.annotations,
    skippedCells: [],
    inputFiles: [{ name: "round9.json", size: 128, sha256: "a".repeat(64) }],
    dashboard,
    reviewPatch: reliabilityDashboardToReview(dashboard, registered.context.user.name)
  });
  const disagreement = run.dashboard.adjudicationQueue[0];
  if (!disagreement) throw new Error("round9 disagreement fixture missing");
  return { registered, project, run, disagreement };
}

describe("enterprise reliability adjudication canonical binding", () => {
  it("rejects public collaboration adjudication without a reliability run", () => {
    const { registered, project, disagreement } = setupProjectRun();

    expect(() => createEnterpriseAdjudicationRecord(registered.context, project.id, {
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision: "include",
      coderValues: disagreement.values
    })).toThrow(/reliability run|canonical queue|binding/i);
  });

  it.each([
    ["empty coder values", {}],
    ["missing coder", { c1: true }],
    ["wrong decision truth", { c1: true, c2: true }]
  ])("rejects %s instead of resolving a canonical queue item", (_label, coderValues) => {
    const { registered, project, run, disagreement } = setupProjectRun();

    expect(() => createEnterpriseAdjudicationRecord(registered.context, project.id, {
      reliabilityRunId: run.id,
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision: "include",
      coderValues
    })).toThrow(/coder|values|queue|binding|disagreement/i);
  });

  it("persists the exact project revision, snapshot fingerprint, coder universe, and queue values", () => {
    const { registered, project, run, disagreement } = setupProjectRun();
    const record = createEnterpriseAdjudicationRecord(registered.context, project.id, {
      reliabilityRunId: run.id,
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision: "revise",
      coderValues: disagreement.values
    }) as ReturnType<typeof createEnterpriseAdjudicationRecord> & {
      projectVersion?: number;
      snapshotFingerprint?: string;
      coderIds?: string[];
    };

    expect(record).toEqual(expect.objectContaining({
      projectId: project.id,
      teamId: project.teamId,
      reliabilityRunId: run.id,
      projectVersion: project.currentVersion,
      snapshotFingerprint: run.projectBinding?.snapshotFingerprint,
      coderIds: ["c1", "c2"],
      coderValues: disagreement.values,
      decision: "revise"
    }));
  });

  it("rejects a stale run after the current project revision changes", () => {
    const { registered, project, run, disagreement } = setupProjectRun();
    updateEnterpriseProject(registered.context, project.id, {
      expectedVersion: project.currentVersion,
      snapshot: snapshot()
    });

    expect(() => createEnterpriseAdjudicationRecord(registered.context, project.id, {
      reliabilityRunId: run.id,
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision: "include",
      coderValues: disagreement.values
    })).toThrow(/revision|stale|snapshot|binding/i);
  });

  it("revalidates persisted adjudication truth before approval instead of trusting cached coverage", () => {
    const { registered, project, run, disagreement } = setupProjectRun();
    const record = createEnterpriseAdjudicationRecord(registered.context, project.id, {
      reliabilityRunId: run.id,
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision: "include",
      coderValues: disagreement.values
    });
    const db = readEnterpriseDb();
    const stored = db.adjudications.find((candidate) => candidate.id === record.id);
    if (!stored) throw new Error("stored adjudication fixture missing");
    stored.coderValues = {};
    const storedRun = db.reliabilityRuns.find((candidate) => candidate.id === run.id);
    if (!storedRun) throw new Error("stored run fixture missing");
    storedRun.adjudicationCoverage = {
      ...storedRun.adjudicationCoverage,
      resolvedDisagreements: 1,
      unresolvedDisagreements: 0,
      coverageRate: 1
    };
    writeEnterpriseDb(db);

    expect(() => reviewEnterpriseReliabilityRun(registered.context, run.id, {
      status: "approved",
      notes: "Forged cached coverage must not approve."
    })).toThrow(/adjudication|coverage|coder|binding|integrity/i);
  });
});
