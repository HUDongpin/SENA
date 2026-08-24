import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildSenaGroupComparisonSuite,
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  reliabilityDashboardToReview
} from "../index";
import { buildEnterpriseClaimEvidencePackageFromDb } from "../enterprise/claim-evidence-package";
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import type { SenaEnterpriseDb } from "../enterprise/state";

const evidenceSource = {
  reliabilityRuns: "file-json" as const,
  validationRuns: "file-json" as const,
  expertReviews: "file-json" as const,
  adjudications: "file-json" as const,
  evidence: ["claim-package-integrity-regression"]
};

function readySnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  const reliability = buildSenaReliabilityDashboard([
    { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
    { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
  ]);
  return buildSenaProjectSnapshot(model, {
    title: "Claim evidence integrity fixture",
    generatedAt: "2026-08-25T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Claim integrity reviewer",
      interpretation: "Synthetic claim-integrity fixture interpretation.",
      limitations: "Synthetic fixture only.",
      nextActions: "Retain fail-closed claim aggregation."
    },
    codingReliability: reliabilityDashboardToReview(reliability, "Claim integrity reviewer"),
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic regression fixture only.",
      retentionPolicy: "Delete generated state after the test.",
      usageConstraints: ["Do not use as participant evidence."],
      dataSteward: "Claim integrity reviewer"
    }
  });
}

function reorderJsonObjectKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => reorderJsonObjectKeys(entry)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left === right ? 0 : left < right ? 1 : -1)
        .map(([key, entry]) => [key, reorderJsonObjectKeys(entry)])
    ) as T;
  }
  return value;
}

describe("enterprise claim evidence package integrity", () => {
  const previousDbDir = process.env.SENA_ENTERPRISE_DB_DIR;
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-claim-integrity-"));
  let context: SenaEnterpriseSessionContext;
  let projectId = "";
  let projectVersion = 0;
  let eligibleReliabilityRunId = "";
  let readyValidationRunId = "";
  let modelRequiredValidationRunId = "";
  let expertReviewId = "";
  let baseDb: SenaEnterpriseDb;

  beforeAll(async () => {
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Claim Integrity PI",
      email: "claim-integrity@example.edu",
      password: "sena-secure-123",
      organization: "Claim Integrity Lab",
      plan: "lab"
    });
    context = registered.context;
    const project = enterprise.createEnterpriseProject(context, {
      teamId: context.teams[0].id,
      title: "Claim integrity project",
      snapshot: readySnapshot()
    });
    projectId = project.id;
    projectVersion = project.currentVersion;

    const ineligibleAnnotations = [
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u2", codeId: "Evidence", value: true }
    ];
    const ineligibleDashboard = buildSenaReliabilityDashboard(ineligibleAnnotations);
    expect(ineligibleDashboard.claimEligibility.eligible).toBe(false);
    const ineligibleRun = enterprise.createEnterpriseReliabilityRun(context, {
      teamId: project.teamId,
      projectId,
      reviewer: "Claim Integrity PI",
      fileCount: 1,
      annotationCount: ineligibleAnnotations.length,
      annotations: ineligibleAnnotations,
      skippedCells: [],
      inputFiles: [{ name: "ineligible.csv", size: 1, sha256: "a".repeat(64) }],
      dashboard: ineligibleDashboard,
      reviewPatch: reliabilityDashboardToReview(ineligibleDashboard, "Claim Integrity PI")
    });
    enterprise.reviewEnterpriseReliabilityRun(context, ineligibleRun.id, {
      status: "approved",
      notes: "Human workflow approval cannot override non-estimable machine evidence."
    });

    const eligibleAnnotations = [
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c1", itemId: "u3", codeId: "Explanation", value: true },
      { coderId: "c2", itemId: "u3", codeId: "Explanation", value: true },
      { coderId: "c1", itemId: "u4", codeId: "Explanation", value: false },
      { coderId: "c2", itemId: "u4", codeId: "Explanation", value: false }
    ];
    const eligibleDashboard = buildSenaReliabilityDashboard(eligibleAnnotations);
    expect(eligibleDashboard.claimEligibility.eligible).toBe(true);
    const eligibleRun = enterprise.createEnterpriseReliabilityRun(context, {
      teamId: project.teamId,
      projectId,
      reviewer: "Claim Integrity PI",
      fileCount: 1,
      annotationCount: eligibleAnnotations.length,
      annotations: eligibleAnnotations,
      skippedCells: [],
      inputFiles: [{ name: "eligible.csv", size: 1, sha256: "b".repeat(64) }],
      dashboard: eligibleDashboard,
      reviewPatch: reliabilityDashboardToReview(eligibleDashboard, "Claim Integrity PI")
    });
    enterprise.reviewEnterpriseReliabilityRun(context, eligibleRun.id, {
      status: "approved",
      notes: "Current machine-eligible reliability evidence."
    });
    eligibleReliabilityRunId = eligibleRun.id;

    const validationSuite = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" },
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const modelRequiredValidation = enterprise.createEnterpriseValidationRun(context, {
      teamId: project.teamId,
      projectId,
      preregistrationNote: "Model-required validation fixture.",
      methodNote: "Valid parity evidence without a study-specific model reference.",
      result: validationSuite
    });
    enterprise.reviewEnterpriseValidationRun(context, modelRequiredValidation.id, {
      status: "approved",
      notes: "Approved descriptive validation; formal model still required."
    });
    modelRequiredValidationRunId = modelRequiredValidation.id;

    const readyValidation = enterprise.createEnterpriseValidationRun(context, {
      teamId: project.teamId,
      projectId,
      preregistrationNote: "Claim-ready validation fixture.",
      methodNote: "Holm-corrected validation with parity and formal-model evidence.",
      parityEvidence: {
        walkthroughDatasetLabel: "claim-integrity walkthrough",
        walkthroughDatasetHash: "c".repeat(64),
        studySpecificInferenceReference: "prereg:claim-integrity-model-v1"
      },
      result: validationSuite
    });
    enterprise.reviewEnterpriseValidationRun(context, readyValidation.id, {
      status: "approved",
      notes: "Approved current validation evidence."
    });
    readyValidationRunId = readyValidation.id;

    const expertReview = enterprise.createEnterpriseExpertReview(context, {
      projectId,
      target: { kind: "validation-run", id: readyValidation.id },
      reviewerName: "Claim Integrity Expert",
      reviewerRole: "Domain expert",
      expertiseArea: "Lesson study",
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      strengths: "Traceable evidence.",
      concerns: "Synthetic fixture only.",
      recommendations: "Keep claims limited.",
      limitations: "No participant data."
    });
    expertReviewId = expertReview.id;
    baseDb = enterprise.readEnterpriseDb();
  });

  afterAll(() => {
    if (previousDbDir === undefined) delete process.env.SENA_ENTERPRISE_DB_DIR;
    else process.env.SENA_ENTERPRISE_DB_DIR = previousDbDir;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
  });

  function buildPackage(db: SenaEnterpriseDb) {
    return buildEnterpriseClaimEvidencePackageFromDb(db, context, { projectId }, evidenceSource);
  }

  it("accepts only the coherent current claim-ready evidence set", () => {
    const claimPackage = buildPackage(structuredClone(baseDb));
    expect(claimPackage.status).toBe("claim-ready-with-limits");
    expect(claimPackage.blockers).toEqual([]);
    expect(claimPackage.evidence.reliability?.runId).toBe(eligibleReliabilityRunId);
    expect(claimPackage.evidence.validation?.runId).toBe(readyValidationRunId);
    expect(claimPackage.evidence.expertReview?.reviewId).toBe(expertReviewId);
  });

  it("preserves claim-ready evidence after a recursive PostgreSQL jsonb key reorder", () => {
    const claimPackage = buildPackage(reorderJsonObjectKeys(structuredClone(baseDb)));
    expect(claimPackage.status).toBe("claim-ready-with-limits");
    expect(claimPackage.blockers).toEqual([]);
    expect(claimPackage.evidence.validation?.runId).toBe(readyValidationRunId);
    expect(claimPackage.evidence.expertReview?.reviewId).toBe(expertReviewId);
  });

  it("still rejects a semantic validation tamper after a PostgreSQL jsonb key reorder", () => {
    const db = reorderJsonObjectKeys(structuredClone(baseDb));
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation?.preregistrationPlan) throw new Error("Expected validation plan fixture.");
    validation.preregistrationPlan.guardrail = `${validation.preregistrationPlan.guardrail} tampered`;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toEqual(expect.arrayContaining([
      "validation-parity-readiness-required",
      "validation-formal-inference-readiness-required"
    ]));
  });

  it("keeps a human-approved but machine-ineligible reliability run exploratory", () => {
    const db = structuredClone(baseDb);
    db.reliabilityRuns = db.reliabilityRuns.filter((run) => run.id !== eligibleReliabilityRunId);
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("approved-reliability-machine-eligibility-required");
    expect(claimPackage.blockers).toEqual(expect.arrayContaining([
      "all-pairwise-kappa-estimable",
      "krippendorff-alpha-estimable"
    ]));
  });

  it("does not let workflow approvals override the current project claim gate", () => {
    const db = structuredClone(baseDb);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error("Expected project fixture.");
    project.claimUse = "exploratory-only";
    project.snapshot.report.claimReadinessGate.status = "exploratory";
    project.snapshot.report.claimReadinessGate.claimUse = "exploratory-only";
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("project-claim-readiness-required");
  });

  it("rejects validation evidence bound to a different project revision or snapshot", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation?.projectBinding) throw new Error("Expected validation binding fixture.");
    validation.projectBinding = {
      projectId,
      projectVersion: projectVersion + 1,
      snapshotSha256: "0".repeat(64)
    };
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-current-project-binding-required");
  });

  it("rejects internally coherent parity evidence whose formal model is still required", () => {
    const db = structuredClone(baseDb);
    const expert = db.expertReviews.find((review) => review.id === expertReviewId);
    if (!expert) throw new Error("Expected expert fixture.");
    expert.target = { kind: "validation-run", id: modelRequiredValidationRunId };
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-formal-inference-readiness-required");
    expect(claimPackage.blockers).not.toContain("validation-parity-readiness-required");
  });

  it("rejects a cached parity-ready label when the underlying gate is incomplete", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation?.parityEvidence) throw new Error("Expected parity fixture.");
    validation.parityEvidence.status = "incomplete";
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-parity-readiness-required");
  });

  it("does not fall back to an unrelated approved validation when the expert target is rejected", () => {
    const db = structuredClone(baseDb);
    const targetedValidation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!targetedValidation) throw new Error("Expected targeted validation fixture.");
    targetedValidation.status = "rejected";
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("domain-expert-target-alignment-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
  });

  it("rejects an expert review bound to a different project revision or snapshot", () => {
    const db = structuredClone(baseDb);
    const expert = db.expertReviews.find((review) => review.id === expertReviewId);
    if (!expert?.projectBinding) throw new Error("Expected expert binding fixture.");
    expert.projectBinding = {
      projectId,
      projectVersion: projectVersion + 1,
      snapshotSha256: "0".repeat(64)
    };
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("domain-expert-current-project-binding-required");
  });

  it("does not splice pre-restore validation and expert evidence into a new reliability revision", async () => {
    const enterprise = await import("../enterprise");
    const updated = enterprise.updateEnterpriseProject(context, projectId, {
      snapshot: readySnapshot(),
      description: "Advance the project before the restore regression.",
      expectedVersion: projectVersion
    });
    const restored = enterprise.restoreEnterpriseProjectRevision(context, projectId, {
      version: projectVersion,
      expectedVersion: updated.currentVersion
    });
    expect(restored.project.currentVersion).toBe(projectVersion + 2);

    const currentAnnotations = [
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c1", itemId: "u3", codeId: "Explanation", value: true },
      { coderId: "c2", itemId: "u3", codeId: "Explanation", value: true },
      { coderId: "c1", itemId: "u4", codeId: "Explanation", value: false },
      { coderId: "c2", itemId: "u4", codeId: "Explanation", value: false }
    ];
    const currentDashboard = buildSenaReliabilityDashboard(currentAnnotations);
    const currentReliability = enterprise.createEnterpriseReliabilityRun(context, {
      teamId: restored.project.teamId,
      projectId,
      projectVersion: restored.project.currentVersion,
      reviewer: "Claim Integrity PI",
      fileCount: 1,
      annotationCount: currentAnnotations.length,
      annotations: currentAnnotations,
      skippedCells: [],
      inputFiles: [{ name: "post-restore.csv", size: 1, sha256: "d".repeat(64) }],
      dashboard: currentDashboard,
      reviewPatch: reliabilityDashboardToReview(currentDashboard, "Claim Integrity PI")
    });
    enterprise.reviewEnterpriseReliabilityRun(context, currentReliability.id, {
      status: "approved",
      notes: "Current post-restore machine-eligible evidence."
    });

    const claimPackage = buildPackage(enterprise.readEnterpriseDb());
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.evidence.reliability?.runId).toBe(currentReliability.id);
    expect(claimPackage.blockers).toEqual(expect.arrayContaining([
      "validation-current-project-binding-required",
      "domain-expert-current-project-binding-required"
    ]));
  });
});
