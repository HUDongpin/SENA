import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildEnterpriseClaimEvidencePackageFromDb,
  type SenaEnterpriseClaimEvidencePackage
} from "../enterprise/claim-evidence-package";
import {
  createEnterpriseAdjudicationRecord,
  createEnterpriseProject,
  createEnterpriseReliabilityRun,
  listEnterpriseProjectCollaboration,
  registerEnterpriseUser,
  reviewEnterpriseReliabilityRun,
  updateEnterpriseProject
} from "../enterprise";
import { emptyEnterpriseDb, readEnterpriseDb, writeEnterpriseDb } from "../enterprise/state";
import { buildSenaModel } from "../model";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
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

function snapshot(source: SenaDataset = dataset()) {
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

function setupProjectRun(
  source: SenaDataset = dataset(),
  coderAnnotations: SenaCoderAnnotation[] = annotations()
) {
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
    snapshot: snapshot(source)
  });
  const bound = bindSenaReliabilityAnnotationsToProject(coderAnnotations, {
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

  it("rejects a historical run whose retained revision belongs to another team", () => {
    const { registered, project } = setupProjectRun();
    updateEnterpriseProject(registered.context, project.id, {
      expectedVersion: project.currentVersion,
      snapshot: snapshot()
    });
    const db = readEnterpriseDb();
    const retainedRevision = db.projectRevisions.find((revision) => (
      revision.projectId === project.id && revision.version === project.currentVersion
    ));
    if (!retainedRevision) throw new Error("retained project revision fixture missing");
    retainedRevision.teamId = "team-forged-retained-revision";
    writeEnterpriseDb(db);

    expect(() => readEnterpriseDb()).toThrow(/current or retained project revision|binding/i);
  });

  it("lists a retained historical run in project collaboration after the project advances", () => {
    const { registered, project, run } = setupProjectRun();
    const updatedProject = updateEnterpriseProject(registered.context, project.id, {
      expectedVersion: project.currentVersion,
      snapshot: snapshot()
    });

    const collaboration = listEnterpriseProjectCollaboration(registered.context, project.id);

    expect(updatedProject.currentVersion).toBe(project.currentVersion + 1);
    expect(collaboration.reliabilityRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: run.id,
        projectBinding: expect.objectContaining({ projectVersion: project.currentVersion })
      })
    ]));
  });

  it("rebuilds each reliability dashboard only once during current claim aggregation", () => {
    const { registered, project, run } = setupProjectRun();
    const db = readEnterpriseDb();
    const storedRun = db.reliabilityRuns.find((candidate) => candidate.id === run.id);
    if (!storedRun?.dashboard.derivationEvidence) {
      throw new Error("current reliability derivation fixture missing");
    }
    const instrumentDashboard = () => {
      const dashboard = structuredClone(storedRun.dashboard);
      const derivationEvidence = dashboard.derivationEvidence;
      if (!derivationEvidence) throw new Error("instrumented derivation fixture missing");
      const annotations = derivationEvidence.annotations;
      let reads = 0;
      Object.defineProperty(derivationEvidence, "annotations", {
        configurable: true,
        enumerable: true,
        get: () => {
          reads += 1;
          return annotations;
        }
      });
      return { dashboard, reads: () => reads };
    };
    const baseline = instrumentDashboard();
    normalizeSenaReliabilityDashboard(baseline.dashboard);
    const aggregation = instrumentDashboard();
    storedRun.dashboard = aggregation.dashboard;
    const evidenceSource: SenaEnterpriseClaimEvidencePackage["evidenceSource"] = {
      reliabilityRuns: "file-json",
      validationRuns: "file-json",
      expertReviews: "file-json",
      adjudications: "file-json",
      evidence: []
    };

    buildEnterpriseClaimEvidencePackageFromDb(
      db,
      registered.context,
      { projectId: project.id },
      evidenceSource
    );

    expect(baseline.reads()).toBeGreaterThan(0);
    expect(aggregation.reads()).toBe(baseline.reads());
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

  it("keeps tuple-distinct disagreements separate when IDs contain the former delimiter", () => {
    const itemA = "left\u0000middle";
    const itemB = "left";
    const codeA = "right";
    const codeB = "middle\u0000right";
    const source: SenaDataset = {
      people: [{ id: "p1", label: "Person 1", role: "reviewer", group: "review" }],
      interactions: [],
      utterances: [itemA, itemB].map((id, index) => ({
        id,
        personId: "p1",
        unitId: `unit-${index + 1}`,
        stanzaId: `stanza-${index + 1}`,
        stage: "coding",
        turnIndex: index + 1,
        text: `Collision-safe item ${index + 1}`
      })),
      coded_segments: [],
      codebook: [codeA, codeB].map((id, index) => ({
        id,
        label: `Code ${index + 1}`,
        family: "reasoning",
        description: `Collision-safe code ${index + 1}`,
        color: index === 0 ? "#2563eb" : "#7c3aed"
      }))
    };
    const coderAnnotations: SenaCoderAnnotation[] = [
      { coderId: "c1", itemId: itemA, codeId: codeA, value: true },
      { coderId: "c2", itemId: itemA, codeId: codeA, value: false },
      { coderId: "c1", itemId: itemA, codeId: codeB, value: false },
      { coderId: "c2", itemId: itemA, codeId: codeB, value: false },
      { coderId: "c1", itemId: itemB, codeId: codeA, value: false },
      { coderId: "c2", itemId: itemB, codeId: codeA, value: false },
      { coderId: "c1", itemId: itemB, codeId: codeB, value: true },
      { coderId: "c2", itemId: itemB, codeId: codeB, value: false }
    ];
    const { registered, project, run } = setupProjectRun(source, coderAnnotations);
    expect(run.dashboard.adjudicationQueue).toHaveLength(2);
    const first = run.dashboard.adjudicationQueue.find((entry) => (
      entry.itemId === itemA && entry.codeId === codeA
    ));
    if (!first) throw new Error("tuple-collision disagreement fixture missing");

    createEnterpriseAdjudicationRecord(registered.context, project.id, {
      reliabilityRunId: run.id,
      itemId: first.itemId,
      codeId: first.codeId,
      decision: "include",
      coderValues: first.values
    });

    expect(() => reviewEnterpriseReliabilityRun(registered.context, run.id, {
      status: "approved",
      notes: "One of two tuple-distinct disagreements remains unresolved."
    })).toThrow(/all queued reliability disagreements|coverage/i);
  });
});
