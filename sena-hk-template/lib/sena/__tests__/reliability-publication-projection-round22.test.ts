import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation
} from "../reliability";
import {
  buildEnterpriseReliabilityPublicationReviewProjection
} from "../enterprise/reliability-integrity";
import type {
  SenaEnterpriseReliabilityRun
} from "../enterprise/reliability-runs";
import type {
  SenaEnterpriseAdjudicationRecord
} from "../enterprise/team-collaboration";

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function projectionSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  return buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "Reliability publication projection fixture",
    generatedAt: "2026-08-24T00:00:00.000Z",
    sourceDataset: imported.dataset
  });
}

function balancedAnnotations(
  snapshot: ReturnType<typeof projectionSnapshot>,
  disagreementCount: number
): SenaCoderAnnotation[] {
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  const units = source.utterances.flatMap((utterance) => (
    source.codebook.map((code) => ({ itemId: utterance.id, codeId: code.id }))
  )).slice(0, 20);
  if (units.length < 20 || disagreementCount > units.length) {
    throw new Error("Reliability projection fixture lacks the requested units.");
  }
  return units.flatMap((unit, unitIndex) => ["coder-a", "coder-b"].map((coderId, coderIndex) => {
    const canonicalValue = unitIndex % 2 === 0;
    return {
      coderId,
      itemId: unit.itemId,
      codeId: unit.codeId,
      value: coderIndex === 1 && unitIndex < disagreementCount ? !canonicalValue : canonicalValue
    };
  }));
}

function fixture(disagreementCount: number) {
  const snapshot = projectionSnapshot();
  const project = {
    id: `project_projection_${disagreementCount}`,
    teamId: "team_projection",
    currentVersion: 1,
    snapshot
  };
  const bound = bindSenaReliabilityAnnotationsToProject(
    balancedAnnotations(snapshot, disagreementCount),
    { projectId: project.id, projectVersion: project.currentVersion, snapshot }
  );
  const dashboard = buildSenaReliabilityDashboard(bound.annotations, {
    projectBinding: bound.binding
  });
  const createdAt = "2026-08-24T00:01:00.000Z";
  const run: SenaEnterpriseReliabilityRun = {
    id: `rel_projection_${disagreementCount}`,
    teamId: project.teamId,
    projectId: project.id,
    userId: "user_projection",
    status: "approved",
    reviewedBy: "user_projection",
    reviewedAt: createdAt,
    reviewNotes: "Projection fixture approval.",
    reviewer: "Projection fixture reviewer",
    fileCount: 1,
    annotationCount: bound.annotations.length,
    coderCount: dashboard.coderCount,
    itemCount: dashboard.itemCount,
    codeCount: dashboard.codeCount,
    meanPairwiseKappa: dashboard.meanPairwiseKappa,
    krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
    disagreementCount: dashboard.disagreementCount,
    inputFiles: [{ name: "fixture.json", size: 1, sha256: "a".repeat(64) }],
    dashboard,
    projectBinding: bound.binding,
    adjudicationCoverage: {
      schemaVersion: "sena-reliability-adjudication-coverage/v1",
      queuedDisagreements: dashboard.disagreementCount,
      resolvedDisagreements: 0,
      unresolvedDisagreements: dashboard.disagreementCount,
      coverageRate: dashboard.disagreementCount === 0 ? 1 : 0,
      decisions: { include: 0, exclude: 0, revise: 0 },
      updatedAt: createdAt
    },
    reviewPatch: reliabilityDashboardToReview(dashboard, "Projection fixture reviewer"),
    createdAt
  };
  const records = dashboard.adjudicationQueue.map((entry, index): SenaEnterpriseAdjudicationRecord => ({
    id: `adj_projection_${disagreementCount}_${index}`,
    projectId: project.id,
    teamId: project.teamId,
    reliabilityRunId: run.id,
    itemId: entry.itemId,
    codeId: entry.codeId,
    decision: "include",
    reviewerId: "user_projection",
    notes: "Canonical projection fixture adjudication.",
    coderValues: entry.values,
    projectVersion: project.currentVersion,
    snapshotFingerprint: bound.binding.snapshotFingerprint,
    coderIds: [...dashboard.coderIds],
    createdAt: `2026-08-24T00:02:${String(index).padStart(2, "0")}.000Z`
  }));
  return { project, run, records };
}

describe("reliability publication-only adjudication projection", () => {
  it("ignores a forged cached zero-coverage claim when no canonical adjudication record exists", () => {
    const { project, run } = fixture(1);
    run.adjudicationCoverage = {
      ...run.adjudicationCoverage,
      resolvedDisagreements: 1,
      unresolvedDisagreements: 0,
      coverageRate: 1,
      decisions: { include: 1, exclude: 0, revise: 0 }
    };

    const projection = buildEnterpriseReliabilityPublicationReviewProjection(run, project, []);

    expect(projection.adjudicationCoverage).toEqual(expect.objectContaining({
      queuedDisagreements: 1,
      resolvedDisagreements: 0,
      unresolvedDisagreements: 1,
      coverageRate: 0
    }));
    expect(projection.review.machineEvidence?.claimEligibility.eligible).toBe(false);
    expect(projection.review.machineEvidence?.claimEligibility.blockers)
      .toContain("unresolved-reliability-disagreements");
  });

  it("keeps a partially adjudicated run blocked and leaves every raw evidence surface unchanged", () => {
    const { project, run, records } = fixture(2);
    const rawHashes = {
      dashboard: sha256Json(run.dashboard),
      queue: sha256Json(run.dashboard.adjudicationQueue),
      reviewPatch: sha256Json(run.reviewPatch)
    };

    const projection = buildEnterpriseReliabilityPublicationReviewProjection(run, project, records.slice(0, 1));

    expect(projection.adjudicationCoverage).toEqual(expect.objectContaining({
      queuedDisagreements: 2,
      resolvedDisagreements: 1,
      unresolvedDisagreements: 1,
      coverageRate: 0.5
    }));
    expect(projection.review.machineEvidence?.claimEligibility.eligible).toBe(false);
    expect({
      dashboard: sha256Json(run.dashboard),
      queue: sha256Json(run.dashboard.adjudicationQueue),
      reviewPatch: sha256Json(run.reviewPatch)
    }).toEqual(rawHashes);
  });

  it("does not let complete adjudication erase below-threshold statistical blockers", () => {
    const { project, run, records } = fixture(8);
    expect(run.meanPairwiseKappa).toBeLessThan(0.8);
    expect(run.krippendorffAlphaNominal).toBeLessThan(0.8);

    const projection = buildEnterpriseReliabilityPublicationReviewProjection(run, project, records);

    expect(projection.adjudicationCoverage.unresolvedDisagreements).toBe(0);
    expect(projection.review.machineEvidence?.claimEligibility).toEqual(expect.objectContaining({
      eligible: false,
      blockers: expect.arrayContaining([
        "mean-pairwise-kappa-at-least-0.80",
        "krippendorff-alpha-at-least-0.80"
      ])
    }));
  });
});
