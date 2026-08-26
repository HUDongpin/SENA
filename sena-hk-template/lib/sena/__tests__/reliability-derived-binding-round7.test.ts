import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createEnterprisePostgresReliabilityRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import { emptyEnterpriseDb, normalizeEnterpriseDb } from "../enterprise/state";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation,
  type SenaReliabilityDashboard
} from "../reliability";
import { normalizeSenaCodingReliabilityGate } from "../report";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";
import { importSenaReport, importSenaRuntimeBundle } from "../statistical-leaf-read";

const eligibleAnnotations: SenaCoderAnnotation[] = [
  { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
  { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
  { coderId: "c1", itemId: "u2", codeId: "explanation", value: false },
  { coderId: "c2", itemId: "u2", codeId: "explanation", value: false }
];

const disagreementAnnotations: SenaCoderAnnotation[] = [
  { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
  { coderId: "c2", itemId: "u1", codeId: "evidence", value: false },
  { coderId: "c1", itemId: "u2", codeId: "explanation", value: true },
  { coderId: "c2", itemId: "u2", codeId: "explanation", value: false }
];

function baseSnapshot() {
  return buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
}

function boundDashboard(annotations: SenaCoderAnnotation[]) {
  const bound = bindSenaReliabilityAnnotationsToProject(annotations, {
    projectId: "project-current",
    projectVersion: 7,
    snapshot: baseSnapshot()
  });
  return buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
}

function coordinatedForgery() {
  const actual = boundDashboard(disagreementAnnotations);
  const eligible = boundDashboard(eligibleAnnotations);
  expect(actual.projectBinding?.annotationCoverageHash).not.toBe(eligible.projectBinding?.annotationCoverageHash);
  expect(actual.disagreementCount).toBeGreaterThan(0);
  expect(eligible.claimEligibility.eligible).toBe(true);
  return {
    ...actual,
    status: eligible.status,
    pairwiseCohenKappa: structuredClone(eligible.pairwiseCohenKappa),
    codeDiagnostics: structuredClone(eligible.codeDiagnostics),
    meanPairwiseKappaStatus: eligible.meanPairwiseKappaStatus,
    meanPairwiseKappa: eligible.meanPairwiseKappa,
    krippendorffAlphaNominalStatus: eligible.krippendorffAlphaNominalStatus,
    krippendorffAlphaNominalRaw: eligible.krippendorffAlphaNominalRaw,
    krippendorffAlphaNominal: eligible.krippendorffAlphaNominal,
    claimEligibilityInputs: structuredClone(eligible.claimEligibilityInputs),
    claimEligibility: structuredClone(eligible.claimEligibility),
    disagreementCount: eligible.disagreementCount,
    adjudicationQueue: structuredClone(eligible.adjudicationQueue),
    interpretation: eligible.interpretation,
    warnings: structuredClone(eligible.warnings)
  } satisfies SenaReliabilityDashboard;
}

function packetFor(annotations: SenaCoderAnnotation[]) {
  return buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract,
    codingReliability: reliabilityDashboardToReview(boundDashboard(annotations), "Reliability reviewer")
  });
}

function coordinatedForgedGate() {
  const actual = packetFor(disagreementAnnotations).contents.codingReliabilityGate;
  const eligible = packetFor(eligibleAnnotations).contents.codingReliabilityGate;
  const actualBinding = actual.review.machineEvidence!.projectBinding!;
  const forged = structuredClone(eligible);
  forged.review.machineEvidence!.projectBinding = structuredClone(actualBinding);
  return forged;
}

function packetWithForgery() {
  const packet = structuredClone(packetFor(disagreementAnnotations));
  const forgedGate = coordinatedForgedGate();
  packet.contents.codingReliabilityGate = structuredClone(forgedGate);
  packet.contents.reportJson.codingReliabilityGate = structuredClone(forgedGate);
  packet.contents.runtimeBundle.codingReliabilityGate = structuredClone(forgedGate);
  packet.contents.runtimeBundle.report.codingReliabilityGate = structuredClone(forgedGate);
  packet.contents.projectSnapshot.report.codingReliabilityGate = structuredClone(forgedGate);
  return packet;
}

describe("project-bound reliability derived-metric verification", () => {
  it("rejects an internally coherent eligible dashboard swapped onto disagreement coverage", () => {
    expect(() => normalizeSenaReliabilityDashboard(coordinatedForgery()))
      .toThrow(/project|binding|derived|metric|coverage|dashboard/i);
  });

  it("accepts the canonical dashboard rebuilt from its binding annotation coverage", () => {
    const dashboard = boundDashboard(disagreementAnnotations);
    expect(normalizeSenaReliabilityDashboard(JSON.parse(JSON.stringify(dashboard)))).toEqual(dashboard);
  });

  it("rejects the coordinated forgery at the coding-reliability gate", () => {
    expect(() => normalizeSenaCodingReliabilityGate(coordinatedForgedGate()))
      .toThrow(/project|binding|derived|metric|coverage|coding reliability gate/i);
  });

  it("rejects the coordinated forgery on report read", () => {
    const report = structuredClone(packetFor(disagreementAnnotations).contents.reportJson);
    report.codingReliabilityGate = coordinatedForgedGate();
    expect(() => importSenaReport(report))
      .toThrow(/project|binding|derived|metric|coverage|coding reliability gate/i);
  });

  it("rejects the coordinated forgery on runtime-bundle read", () => {
    const runtimeBundle = structuredClone(packetFor(disagreementAnnotations).contents.runtimeBundle);
    const forgedGate = coordinatedForgedGate();
    runtimeBundle.codingReliabilityGate = structuredClone(forgedGate);
    runtimeBundle.report.codingReliabilityGate = structuredClone(forgedGate);
    expect(() => importSenaRuntimeBundle(runtimeBundle))
      .toThrow(/project|binding|derived|metric|coverage|coding reliability gate/i);
  });

  it("rejects the coordinated forgery on snapshot read", () => {
    const snapshot = structuredClone(packetFor(disagreementAnnotations).contents.projectSnapshot);
    snapshot.report.codingReliabilityGate = coordinatedForgedGate();
    expect(() => importSenaProjectSnapshot(snapshot))
      .toThrow(/project|binding|derived|metric|coverage|coding reliability gate/i);
  });

  it("rejects the coordinated forgery on review-packet read", () => {
    expect(() => importSenaReviewPacket(packetWithForgery()))
      .toThrow(/project|binding|derived|metric|coverage|coding reliability gate/i);
  });

  it("rejects the coordinated forgery during file-state restore", () => {
    const dashboard = coordinatedForgery();
    const db = emptyEnterpriseDb();
    db.reliabilityRuns = [{
      id: "rel_forged",
      projectId: dashboard.projectBinding!.projectId,
      projectBinding: dashboard.projectBinding,
      dashboard,
      disagreementCount: dashboard.disagreementCount,
      createdAt: "2026-08-21T00:00:00.000Z"
    } as never];

    expect(() => normalizeEnterpriseDb(db)).toThrow(/project|binding|derived|metric|coverage|dashboard/i);
  });

  it("rejects the coordinated forgery during Postgres restore", async () => {
    const dashboard = coordinatedForgery();
    const query = (async (sql: string) => ({
      rows: sql.includes("SELECT *")
        ? [{ payload: {
          id: "rel_forged",
          projectId: dashboard.projectBinding!.projectId,
          projectBinding: dashboard.projectBinding,
          dashboard,
          disagreementCount: dashboard.disagreementCount,
          createdAt: "2026-08-21T00:00:00.000Z"
        } }]
        : []
    })) as SenaEnterprisePostgresQuery;
    const adapter = createEnterprisePostgresReliabilityRunAdapter({ query });

    await expect(adapter.listReliabilityRuns()).rejects
      .toThrow(/project|binding|derived|metric|coverage|dashboard/i);
  });

  it("rejects a forged submitted dashboard instead of silently replacing it on direct run creation", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-reliability-derived-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.resetModules();
    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Derived metric reviewer",
        email: "derived-metric-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Derived metric lab",
        plan: "lab"
      });
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Derived metric binding project",
        snapshot: baseSnapshot()
      });

      expect(() => enterprise.createEnterpriseReliabilityRun(registered.context, {
        teamId: project.teamId,
        projectId: project.id,
        projectVersion: project.currentVersion,
        reviewer: "Derived metric reviewer",
        fileCount: 1,
        annotationCount: disagreementAnnotations.length,
        annotations: disagreementAnnotations,
        inputFiles: [],
        dashboard: coordinatedForgery(),
        reviewPatch: {}
      })).toThrow(/project|binding|derived|metric|coverage|dashboard/i);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
