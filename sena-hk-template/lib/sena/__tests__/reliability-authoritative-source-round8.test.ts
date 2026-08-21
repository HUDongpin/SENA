import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEnterpriseProject,
  createEnterpriseReliabilityRun,
  registerEnterpriseUser
} from "../enterprise";
import { buildSenaModel } from "../model";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  SenaReliabilityProjectBindingError,
  senaReliabilitySnapshotFingerprint,
  type SenaCoderAnnotation
} from "../reliability";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

let enterpriseDbDir = "";

afterEach(() => {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  if (enterpriseDbDir) rmSync(enterpriseDbDir, { recursive: true, force: true });
  enterpriseDbDir = "";
});

function fullDataset(): SenaDataset {
  return {
    people: [{ id: "p1", label: "Person 1", role: "teacher", group: "A" }],
    interactions: [],
    utterances: Array.from({ length: 10 }, (_, index) => ({
      id: `u${index + 1}`,
      personId: "p1",
      unitId: `unit-${index + 1}`,
      stanzaId: `stanza-${index + 1}`,
      stage: index < 5 ? "plan" : "reflect",
      turnIndex: index + 1,
      text: `Full-source item ${index + 1}`
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

function scopedSnapshot(source = fullDataset(), activeWindow = false) {
  const scoped = {
    ...structuredClone(source),
    utterances: source.utterances.slice(0, 1)
  };
  const model = buildSenaModel(scoped);
  return buildSenaProjectSnapshot(model, {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: source,
    activeTemporalWindow: activeWindow ? model.temporal.windows[0] : null
  });
}

function outOfScopeAnnotations(): SenaCoderAnnotation[] {
  return [
    { coderId: "c1", itemId: "u2", codeId: "evidence", value: true },
    { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
  ];
}

describe("SENA reliability authoritative project source", () => {
  it("accepts an accurately declared annotation subset containing a full-source item outside the scoped dataset", () => {
    const bound = bindSenaReliabilityAnnotationsToProject(outOfScopeAnnotations(), {
      projectId: "scoped-project",
      projectVersion: 1,
      snapshot: scopedSnapshot()
    });

    expect(bound.binding.itemUniverseIds).toContain("u2");
    expect(bound.binding.annotatedItemIds).toEqual(["u2"]);
  });

  it("changes the project fingerprint when only the authoritative full source or active window changes", () => {
    const source = fullDataset();
    const baseline = scopedSnapshot(source);
    const changedSource = structuredClone(source);
    changedSource.utterances[1].text = "Changed authoritative source text";

    expect(senaReliabilitySnapshotFingerprint(scopedSnapshot(changedSource)))
      .not.toBe(senaReliabilitySnapshotFingerprint(baseline));
    expect(senaReliabilitySnapshotFingerprint(scopedSnapshot(source, true)))
      .not.toBe(senaReliabilitySnapshotFingerprint(baseline));
  });

  it("fails with the typed unknown-item issue when no full source exists", () => {
    const snapshot = scopedSnapshot();
    delete snapshot.source.sourceDataset;

    expect(() => bindSenaReliabilityAnnotationsToProject(outOfScopeAnnotations(), {
      projectId: "scoped-only-project",
      projectVersion: 1,
      snapshot
    })).toThrow(SenaReliabilityProjectBindingError);
    try {
      bindSenaReliabilityAnnotationsToProject(outOfScopeAnnotations(), {
        projectId: "scoped-only-project",
        projectVersion: 1,
        snapshot
      });
    } catch (error) {
      expect((error as SenaReliabilityProjectBindingError).issues)
        .toContainEqual(expect.objectContaining({ code: "unknown-item" }));
    }
  });

  it("uses the same authoritative source in direct enterprise run creation", () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-round8-authoritative-source-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    const registered = registerEnterpriseUser({
      name: "Round8 Reliability Reviewer",
      email: "round8-reliability@example.edu",
      password: "sena-secure-123",
      organization: "Round8 Lab",
      plan: "lab"
    });
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Scoped source project",
      snapshot: scopedSnapshot()
    });
    const annotations = outOfScopeAnnotations();
    const dashboard = buildSenaReliabilityDashboard(annotations);

    const run = createEnterpriseReliabilityRun(registered.context, {
      teamId: project.teamId,
      projectId: project.id,
      projectVersion: project.currentVersion,
      reviewer: registered.context.user.name,
      fileCount: 1,
      annotationCount: annotations.length,
      annotations,
      inputFiles: [{ name: "subset.csv", size: 10, sha256: "a".repeat(64) }],
      dashboard,
      reviewPatch: reliabilityDashboardToReview(dashboard, registered.context.user.name)
    });

    expect(run.projectBinding?.itemUniverseIds).toContain("u2");
    expect(run.projectBinding?.annotatedItemIds).toEqual(["u2"]);
  });
});
