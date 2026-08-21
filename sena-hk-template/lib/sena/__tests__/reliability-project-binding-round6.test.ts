import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  SenaReliabilityProjectBindingError,
  type SenaCoderAnnotation
} from "../reliability";
import { normalizeSenaCodingReliabilityGate } from "../report";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";
import {
  importSenaReport,
  importSenaRuntimeBundle
} from "../statistical-leaf-read";

const rawAnnotations: SenaCoderAnnotation[] = [
  { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
  { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
  { coderId: "c1", itemId: "u2", codeId: "explanation", value: false },
  { coderId: "c2", itemId: "u2", codeId: "explanation", value: false }
];

function baseSnapshot() {
  const model = buildSenaModel(lessonStudySenaContract);
  return buildSenaProjectSnapshot(model, {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
}

function bindingInput(annotations: SenaCoderAnnotation[] = rawAnnotations) {
  return bindSenaReliabilityAnnotationsToProject(annotations, {
    projectId: "project-current",
    projectVersion: 7,
    snapshot: baseSnapshot()
  });
}

describe("reliability annotations current-project binding", () => {
  it("canonicalizes a sampled annotation subset and emits deterministic universe and coverage hashes", () => {
    const first = bindingInput();
    const second = bindingInput([...rawAnnotations].reverse());

    expect(first.annotations.map((entry) => entry.codeId)).toEqual([
      "evidence", "evidence", "explanation", "explanation"
    ]);
    expect(first.binding).toEqual(second.binding);
    expect(first.binding.projectVersion).toBe(7);
    expect(first.binding.snapshotFingerprint).toMatch(/^0x[a-f0-9]{8}$/);
    expect(first.binding.codebookUniverseHash).toMatch(/^0x[a-f0-9]{8}$/);
    expect(first.binding.itemUniverseHash).toMatch(/^0x[a-f0-9]{8}$/);
    expect(first.binding.coderCoverageHash).toMatch(/^0x[a-f0-9]{8}$/);
    expect(first.binding.annotationCoverageHash).toMatch(/^0x[a-f0-9]{8}$/);
    expect(first.binding.annotatedItemIds).toEqual(["u1", "u2"]);
    expect(first.binding.itemUniverseIds.length).toBeGreaterThan(first.binding.annotatedItemIds.length);
  });

  it.each([
    ["invented item", [{ ...rawAnnotations[0], itemId: "invented-item" }], "annotations.0.itemId"],
    ["invented code", [{ ...rawAnnotations[0], codeId: "invented-code" }], "annotations.0.codeId"]
  ])("rejects an %s with sanitized typed issues", (_label, annotations, path) => {
    try {
      bindingInput(annotations);
      throw new Error("expected project binding validation to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(SenaReliabilityProjectBindingError);
      expect((error as SenaReliabilityProjectBindingError).issues).toContainEqual(expect.objectContaining({ path }));
      expect(JSON.stringify(error)).not.toContain("invented-item");
      expect(JSON.stringify(error)).not.toContain("invented-code");
    }
  });

  it("rejects deletion and substitution of current-project binding hashes on dashboard read", () => {
    const bound = bindingInput();
    const dashboard = buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
    const missing = structuredClone(dashboard);
    delete (missing.projectBinding as { annotationCoverageHash?: string }).annotationCoverageHash;
    expect(() => normalizeSenaReliabilityDashboard(missing)).toThrow(/project|binding|coverage|dashboard/i);

    const substituted = structuredClone(dashboard);
    substituted.projectBinding!.annotationCoverageHash = "0x00000000";
    expect(() => normalizeSenaReliabilityDashboard(substituted)).toThrow(/project|binding|coverage|dashboard/i);
  });

  it("rejects missing or substituted binding evidence at gate/report/runtime/snapshot/review reads", () => {
    const bound = bindingInput();
    const dashboard = buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
    const review = reliabilityDashboardToReview(dashboard, "Bound reliability reviewer");
    const model = buildSenaModel(lessonStudySenaContract);
    const packet = buildSenaReviewPacket(model, {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: lessonStudySenaContract,
      codingReliability: review
    });
    const forge = <T,>(value: T): T => {
      const cloned = structuredClone(value) as T;
      const evidence = (cloned as { review: { machineEvidence: { projectBinding?: { itemUniverseHash?: string } } } })
        .review.machineEvidence;
      if (!evidence.projectBinding) throw new Error("fixture requires project binding");
      evidence.projectBinding.itemUniverseHash = "0x00000000";
      return cloned;
    };

    expect(() => normalizeSenaCodingReliabilityGate(forge(packet.contents.codingReliabilityGate)))
      .toThrow(/project|binding|coverage|coding reliability gate/i);
    const report = structuredClone(packet.contents.reportJson);
    report.codingReliabilityGate = forge(report.codingReliabilityGate);
    expect(() => importSenaReport(report)).toThrow(/project|binding|coverage|coding reliability gate/i);
    const runtime = structuredClone(packet.contents.runtimeBundle);
    runtime.codingReliabilityGate = forge(runtime.codingReliabilityGate);
    expect(() => importSenaRuntimeBundle(runtime)).toThrow(/project|binding|coverage|coding reliability gate/i);
    const snapshot = structuredClone(packet.contents.projectSnapshot);
    snapshot.report.codingReliabilityGate = forge(snapshot.report.codingReliabilityGate);
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/project|binding|coverage|coding reliability gate/i);
    const reviewPacket = structuredClone(packet);
    reviewPacket.contents.codingReliabilityGate = forge(reviewPacket.contents.codingReliabilityGate);
    expect(() => importSenaReviewPacket(reviewPacket)).toThrow(/project|binding|coverage|coding reliability gate/i);
  });

  it("rejects replaying valid reliability evidence against a different current snapshot", () => {
    const bound = bindingInput();
    const dashboard = buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
    const changedDataset = structuredClone(lessonStudySenaContract);
    changedDataset.codebook.push({
      id: "new-current-code",
      label: "New current code",
      family: "Revision",
      description: "Present only in the current revision",
      color: "#000000"
    });
    const packet = buildSenaReviewPacket(buildSenaModel(changedDataset), {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: changedDataset,
      codingReliability: reliabilityDashboardToReview(dashboard, "Stale reliability reviewer")
    });

    expect(() => importSenaProjectSnapshot(packet.contents.projectSnapshot))
      .toThrow(/project|binding|snapshot|revision|coding reliability/i);
    expect(() => importSenaReviewPacket(packet)).toThrow(/project|binding|snapshot|revision|coding reliability/i);
  });

  it("binds direct and sync persisted runs to the current project revision and rejects an old revision replay", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-reliability-binding-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.resetModules();
    try {
      const enterprise = await import("../enterprise");
      const reliabilityRuns = await import("../enterprise/reliability-runs");
      const registered = enterprise.registerEnterpriseUser({
        name: "Binding reviewer",
        email: "binding-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "Binding lab",
        plan: "lab"
      });
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Bound reliability project",
        snapshot: baseSnapshot()
      });
      const dashboard = buildSenaReliabilityDashboard(rawAnnotations);
      const direct = enterprise.createEnterpriseReliabilityRun(registered.context, {
        teamId: project.teamId,
        projectId: project.id,
        projectVersion: project.currentVersion,
        reviewer: "Binding reviewer",
        fileCount: 1,
        annotationCount: rawAnnotations.length,
        annotations: rawAnnotations,
        inputFiles: [{ name: "binding.json", size: 1, sha256: "a".repeat(64) }],
        dashboard,
        reviewPatch: reliabilityDashboardToReview(dashboard, "Binding reviewer")
      });
      expect(direct.projectBinding).toEqual(direct.dashboard.projectBinding);
      expect(direct.projectBinding?.projectVersion).toBe(1);
      expect(direct.dashboard.codeDiagnostics.map((entry) => entry.codeId)).toEqual(["evidence", "explanation"]);

      const sync = reliabilityRuns.buildEnterpriseReliabilityJsonRunResponse(registered.context, {
        teamId: project.teamId,
        projectId: project.id,
        reviewer: "Sync binding reviewer",
        annotations: rawAnnotations
      });
      expect(sync.body.reliabilityRun.projectBinding?.snapshotFingerprint)
        .toBe(direct.projectBinding?.snapshotFingerprint);

      const changedDataset = structuredClone(lessonStudySenaContract);
      changedDataset.codebook.push({
        id: "revision-only",
        label: "Revision only",
        family: "Revision",
        description: "Revision marker",
        color: "#111111"
      });
      enterprise.updateEnterpriseProject(registered.context, project.id, {
        expectedVersion: 1,
        snapshot: buildSenaProjectSnapshot(buildSenaModel(changedDataset), {
          generatedAt: "2026-08-21T00:00:00.000Z",
          sourceDataset: changedDataset
        })
      });

      expect(() => enterprise.createEnterpriseReliabilityRun(registered.context, {
        teamId: project.teamId,
        projectId: project.id,
        projectVersion: 1,
        reviewer: "Stale reviewer",
        fileCount: 1,
        annotationCount: rawAnnotations.length,
        annotations: rawAnnotations,
        inputFiles: [],
        dashboard,
        reviewPatch: {}
      })).toThrow(/project.*version|changed|revision|binding/i);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
