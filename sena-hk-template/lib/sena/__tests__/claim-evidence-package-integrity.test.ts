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
import {
  buildEnterpriseValidationParityEvidence,
  buildEnterpriseValidationPreregistrationPlan,
  enterpriseValidationRunEvidenceHash,
  normalizeEnterpriseValidationRunEvidence
} from "../enterprise/validation-integrity";
import { enterpriseValidationParityEvidenceHash } from "../enterprise/validation-runs";
import { buildEnterpriseExpertReviewReceipt } from "../enterprise/expert-review-receipt";
import { normalizeSenaGroupComparisonValidationResult } from "../inference";
import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import { normalizeEnterpriseDb, writeEnterpriseDb, type SenaEnterpriseDb } from "../enterprise/state";

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
  const previousExpertSigningSecret = process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
  const previousExpertSigningKeyId = process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-claim-integrity-"));
  let context: SenaEnterpriseSessionContext;
  let projectId = "";
  let projectVersion = 0;
  let eligibleReliabilityRunId = "";
  let readyValidationRunId = "";
  let modelRequiredValidationRunId = "";
  let expertReviewId = "";
  let baseDb: SenaEnterpriseDb;
  let alternateValidationResult: ReturnType<typeof buildSenaGroupComparisonSuite>;

  beforeAll(async () => {
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = "8c53de6a907f4c21b8a63d34e1429af8812f1f04a06b70c6d619e8a4812cbb79";
    process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = "claim-integrity-test-v1";
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
    alternateValidationResult = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "socialStrength" },
        { groupField: "role", groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 120,
      bootstrapIterations: 120,
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
    if (previousExpertSigningSecret === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
    else process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = previousExpertSigningSecret;
    if (previousExpertSigningKeyId === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
    else process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = previousExpertSigningKeyId;
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
    expect(claimPackage.evidence.expertReview?.evidenceReceipt).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-expert-review-receipt/v1",
      keySource: "env-configured",
      keyId: "claim-integrity-test-v1",
      validationRunEvidenceHash: claimPackage.evidence.validation?.validationRunEvidenceHash
    }));
  });

  it("preserves claim-ready evidence after a recursive PostgreSQL jsonb key reorder", () => {
    const claimPackage = buildPackage(reorderJsonObjectKeys(structuredClone(baseDb)));
    expect(claimPackage.status).toBe("claim-ready-with-limits");
    expect(claimPackage.blockers).toEqual([]);
    expect(claimPackage.evidence.validation?.runId).toBe(readyValidationRunId);
    expect(claimPackage.evidence.expertReview?.reviewId).toBe(expertReviewId);
  });

  it("preserves an unverifiable receipt as backup-safe history while withholding claim authority", () => {
    const signingSecret = process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
    const signingKeyId = process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
    delete process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
    delete process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
    try {
      const normalized = normalizeEnterpriseDb(structuredClone(baseDb));
      const expert = normalized.expertReviews.find((review) => review.id === expertReviewId);
      expect(expert?.evidenceReceipt).toEqual(
        baseDb.expertReviews.find((review) => review.id === expertReviewId)?.evidenceReceipt
      );
      const claimPackage = buildPackage(normalized);
      expect(claimPackage.status).toBe("exploratory-only");
      expect(claimPackage.blockers).toContain("expert-review-receipt-required");
      expect(claimPackage.evidence.expertReview).toBeUndefined();
    } finally {
      if (signingSecret === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET;
      else process.env.SENA_EXPERT_REVIEW_SIGNING_SECRET = signingSecret;
      if (signingKeyId === undefined) delete process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID;
      else process.env.SENA_EXPERT_REVIEW_SIGNING_KEY_ID = signingKeyId;
    }
  });

  it("still rejects a semantic validation tamper after a PostgreSQL jsonb key reorder", () => {
    const db = reorderJsonObjectKeys(structuredClone(baseDb));
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation?.preregistrationPlan) throw new Error("Expected validation plan fixture.");
    validation.preregistrationPlan.guardrail = `${validation.preregistrationPlan.guardrail} tampered`;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
  });

  it("independently rejects a semantic parity tamper after a PostgreSQL jsonb key reorder", () => {
    const db = reorderJsonObjectKeys(structuredClone(baseDb));
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation?.parityEvidence) throw new Error("Expected validation parity fixture.");
    validation.parityEvidence.formalInference.guardrail =
      `${validation.parityEvidence.formalInference.guardrail} tampered`;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
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
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("project-claim-readiness-required");
  });

  it("independently rejects a non-canonical snapshot claim gate while the current revision still matches", () => {
    const db = structuredClone(baseDb);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === projectId && candidate.version === projectVersion
    ));
    if (!project || !revision) throw new Error("Expected project revision fixture.");
    project.snapshot.report.claimReadinessGate.status = "exploratory";
    project.snapshot.report.claimReadinessGate.claimUse = "exploratory-only";
    revision.snapshot = structuredClone(project.snapshot);

    const claimPackage = buildPackage(db);
    expect(claimPackage.sourceSnapshotEvidence.revisionMatchesCurrentVersion).toBe(true);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("project-claim-readiness-required");
  });

  it("independently rejects a stale current revision while project and snapshot claim gates remain ready", () => {
    const db = structuredClone(baseDb);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === projectId && candidate.version === projectVersion
    ));
    if (!project || !revision) throw new Error("Expected project revision fixture.");
    revision.snapshot.title = `${revision.snapshot.title} stale`;

    const claimPackage = buildPackage(db);
    expect(project.claimUse).toBe("research-claim-ready");
    expect(project.snapshot.report.claimReadinessGate.status).toBe("ready");
    expect(claimPackage.sourceSnapshotEvidence.revisionMatchesCurrentVersion).toBe(false);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("project-claim-readiness-required");
  });

  it("rejects a current project revision owned by a different team", () => {
    const db = structuredClone(baseDb);
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === projectId && candidate.version === projectVersion
    ));
    if (!revision) throw new Error("Expected current revision tenant fixture.");
    revision.teamId = "team_foreign_current_revision";

    const claimPackage = buildPackage(db);
    expect(claimPackage.sourceSnapshotEvidence.revisionMatchesCurrentVersion).toBe(false);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("project-claim-readiness-required");
  });

  it("rejects a same-revision valid result substituted under another plan and parity manifest", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation) throw new Error("Expected validation fixture.");
    const primary = alternateValidationResult.primary;
    validation.result = structuredClone(alternateValidationResult);
    validation.metric = primary.metric;
    validation.groupField = primary.groupField;
    validation.groupA = primary.groupA;
    validation.groupB = primary.groupB;
    validation.iterations = primary.permutation.iterations;
    validation.seed = primary.permutation.seed;
    validation.pTwoSided = primary.permutation.pTwoSided;
    validation.observedDifference = primary.observedDifference;
    validation.comparisonCount = alternateValidationResult.comparisonCount;
    validation.minHolmAdjustedP = Math.min(
      ...alternateValidationResult.comparisons.map((comparison) => comparison.holmAdjustedP)
    );
    validation.significantHolmCount = alternateValidationResult.significantHolmCount;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
  });

  it("independently rejects a cached p value that diverges from the canonical result", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation) throw new Error("Expected validation fixture.");
    validation.pTwoSided = validation.pTwoSided === 0 ? 0.5 : 0;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
  });

  it("independently rejects a cached observed difference that diverges from the canonical result", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation) throw new Error("Expected validation fixture.");
    validation.observedDifference += 1;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
  });

  it("independently rejects cached suite and Holm summaries that diverge from the canonical result", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation) throw new Error("Expected validation fixture.");
    validation.comparisonCount = (validation.comparisonCount ?? 1) + 1;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
  });

  it("keeps a legacy approved validation without a full-run seal readable but exploratory", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation) throw new Error("Expected validation fixture.");
    delete validation.validationRunEvidenceSchemaVersion;
    delete validation.validationRunEvidenceHash;

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("approved-validation-run-evidence-hash-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
  });

  it("keeps a coherently sealed legacy-normalized result exploratory despite a fresh expert receipt", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const expert = db.expertReviews.find((review) => review.id === expertReviewId);
    if (!validation || !expert || validation.result.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite) {
      throw new Error("Expected current suite and expert fixtures.");
    }
    const legacyLeaf = (entry: typeof validation.result.primary) => {
      const {
        sourceSchemaVersion: _sourceSchemaVersion,
        sourceEvidence: _sourceEvidence,
        effectSize,
        ...rest
      } = entry;
      return {
        ...rest,
        schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparison,
        effectSize: {
          cohenD: effectSize.cohenD ?? 0,
          hedgesG: effectSize.hedgesG ?? 0,
          pooledStandardDeviation: effectSize.pooledStandardDeviation ?? 0
        }
      };
    };
    const {
      sourceSchemaVersion: _suiteSourceSchemaVersion,
      primary: currentPrimary,
      comparisons: currentComparisons,
      ...suiteRest
    } = validation.result;
    validation.result = normalizeSenaGroupComparisonValidationResult({
      ...suiteRest,
      schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite,
      primary: legacyLeaf(currentPrimary),
      comparisons: currentComparisons.map(legacyLeaf)
    } as never);
    validation.preregistrationPlan = buildEnterpriseValidationPreregistrationPlan({
      result: validation.result,
      preregistrationNote: validation.preregistrationNote,
      methodNote: validation.methodNote
    });
    const oldParity = validation.parityEvidence;
    if (!oldParity) throw new Error("Expected parity fixture.");
    const expertGate = oldParity.gates.find((gate) => gate.id === "domain-expert-review");
    validation.parityEvidence = buildEnterpriseValidationParityEvidence({
      result: validation.result,
      preregistrationPlan: validation.preregistrationPlan,
      parityEvidence: {
        walkthroughDatasetLabel: oldParity.walkthrough.datasetLabel,
        walkthroughDatasetHash: oldParity.walkthrough.datasetHash,
        walkthroughSource: oldParity.walkthrough.source === "missing" ? undefined : oldParity.walkthrough.source,
        walkthroughSourceId: oldParity.walkthrough.sourceId,
        expertReviewRequired: expertGate?.status === "required",
        studySpecificInferenceReference: oldParity.formalInference.studySpecificInferenceReference,
        runtimeParityIds: oldParity.runtimeParity.map((entry) => entry.id),
        notes: oldParity.notes.slice(2)
      }
    });
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);
    expert.target.validationRunEvidenceHash = validation.validationRunEvidenceHash;
    expert.evidenceReceipt = buildEnterpriseExpertReviewReceipt(expert);

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-current-v2-result-required");
    expect(claimPackage.blockers).not.toContain("expert-review-receipt-required");
  });

  it("rejects a partially sealed approved validation instead of treating it as legacy", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation) throw new Error("Expected validation fixture.");
    delete validation.validationRunEvidenceHash;

    expect(() => normalizeEnterpriseDb(db)).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "validationRunEvidenceHash"
    }));

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
    expect(claimPackage.blockers).not.toContain("approved-validation-run-evidence-hash-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
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
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
  });

  it("rejects a retained-revision binding whose project identity differs from its run", () => {
    const db = structuredClone(baseDb);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!project || !validation?.projectBinding) throw new Error("Expected retained validation fixture.");
    validation.projectBinding.projectId = "project_foreign_retained_binding";
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "projectBinding"
    }));
  });

  it("rejects a retained revision from a different team even when project, version, and snapshot match", () => {
    const db = structuredClone(baseDb);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === projectId && candidate.version === projectVersion
    ));
    if (!project || !validation?.projectBinding || !revision) {
      throw new Error("Expected retained validation team fixture.");
    }
    project.currentVersion = projectVersion + 1;
    revision.teamId = "team_foreign_retained_revision";

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "projectBinding"
    }));
  });

  it("rejects a project validation whose team identity differs from the owning project", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!validation || !project) throw new Error("Expected team-bound validation fixture.");
    validation.teamId = "team_foreign_validation_binding";
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "projectBinding"
    }));

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
  });

  it("rejects an exact-hash expert approval owned by a different team", () => {
    const db = structuredClone(baseDb);
    const expert = db.expertReviews.find((review) => review.id === expertReviewId);
    if (!expert) throw new Error("Expected expert tenant fixture.");
    expert.teamId = "team_foreign_expert_review";

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("expert-review-integrity-required");
    expect(claimPackage.evidence.expertReview).toBeUndefined();
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

  it("keeps a validation without a real preregistration note formally incomplete", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation?.parityEvidence) throw new Error("Expected no-preregistration validation fixture.");
    validation.preregistrationNote = "";
    validation.preregistrationPlan = buildEnterpriseValidationPreregistrationPlan({
      result: validation.result,
      preregistrationNote: validation.preregistrationNote,
      methodNote: validation.methodNote
    });
    const domainExpertGate = validation.parityEvidence.gates.find((gate) => gate.id === "domain-expert-review");
    if (!domainExpertGate) throw new Error("Expected domain-expert gate fixture.");
    validation.parityEvidence = buildEnterpriseValidationParityEvidence({
      result: validation.result,
      preregistrationPlan: validation.preregistrationPlan,
      parityEvidence: {
        walkthroughDatasetLabel: validation.parityEvidence.walkthrough.datasetLabel,
        walkthroughDatasetHash: validation.parityEvidence.walkthrough.datasetHash,
        walkthroughSource: validation.parityEvidence.walkthrough.source === "missing"
          ? undefined
          : validation.parityEvidence.walkthrough.source,
        walkthroughSourceId: validation.parityEvidence.walkthrough.sourceId,
        expertReviewRequired: domainExpertGate.status === "required",
        studySpecificInferenceReference: validation.parityEvidence.inference.studySpecificInferenceReference,
        runtimeParityIds: validation.parityEvidence.runtimeParity.map((entry) => entry.id),
        notes: validation.parityEvidence.notes.slice(2)
      }
    });
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    const claimPackage = buildPackage(db);
    expect(validation.preregistrationPlan.protocolNoteHash).toBeUndefined();
    expect(validation.parityEvidence.formalInference.checks).toContainEqual(expect.objectContaining({
      id: "preregistration-plan",
      status: "required"
    }));
    expect(validation.parityEvidence.formalInference.blockers).toContain("preregistration-plan");
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-formal-inference-readiness-required");
    expect(claimPackage.evidence.validation).toEqual(expect.objectContaining({
      runId: validation.id,
      parityEvidence: expect.objectContaining({
        formalInference: expect.objectContaining({ status: "incomplete" })
      })
    }));
  });

  it("does not let manual walkthrough carriers override a project-bound snapshot source", () => {
    const validation = baseDb.validationRuns.find((run) => run.id === readyValidationRunId);
    const project = baseDb.projects.find((candidate) => candidate.id === projectId);
    if (!validation?.parityEvidence || !project) throw new Error("Expected project walkthrough fixture.");

    expect(validation.parityEvidence.walkthrough).toMatchObject({
      source: "project-snapshot",
      sourceId: project.id,
      status: "attached"
    });
    expect(validation.parityEvidence.walkthrough.datasetHash).not.toBe("c".repeat(64));
  });

  it("rejects forged-ready parity and formal evidence even when both checksums are recomputed", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === modelRequiredValidationRunId);
    const expert = db.expertReviews.find((review) => review.id === expertReviewId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!validation?.parityEvidence || !expert || !project) {
      throw new Error("Expected forged-ready validation fixture.");
    }
    expert.target = { kind: "validation-run", id: validation.id };
    const studyGate = validation.parityEvidence.gates.find((gate) => gate.id === "study-specific-inference");
    const studyCheck = validation.parityEvidence.formalInference.checks.find((check) => check.id === "study-specific-model");
    if (!studyGate || !studyCheck) throw new Error("Expected study-specific readiness carriers.");
    studyGate.status = "attached";
    studyGate.evidence = [
      "reference=prereg:forged-model-reference",
      `guardrail=${validation.result.guardrail}`
    ];
    validation.parityEvidence.formalInference.status = "model-referenced";
    studyCheck.status = "passed";
    studyCheck.evidence = ["reference=prereg:forged-model-reference"];
    validation.parityEvidence.formalInference.blockers =
      validation.parityEvidence.formalInference.blockers.filter((blocker) => blocker !== "study-specific-model");
    const {
      status: _parityStatus,
      validationRunHash: _validationRunHash,
      ...parityHashBody
    } = validation.parityEvidence;
    validation.parityEvidence.validationRunHash = enterpriseValidationParityEvidenceHash(parityHashBody);
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "parityEvidence"
    }));

    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
  });

  it("does not reuse an expert approval after the exact validation evidence is coherently resealed", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const expert = db.expertReviews.find((review) => review.id === expertReviewId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!validation?.parityEvidence || !validation.preregistrationPlan || !expert || !project) {
      throw new Error("Expected exact expert-target fixture.");
    }
    const previousEvidenceHash = validation.validationRunEvidenceHash;
    const expertGate = validation.parityEvidence.gates.find((gate) => gate.id === "domain-expert-review");
    if (!expertGate) throw new Error("Expected expert gate fixture.");
    validation.parityEvidence = buildEnterpriseValidationParityEvidence({
      result: validation.result,
      preregistrationPlan: validation.preregistrationPlan,
      parityEvidence: {
        walkthroughDatasetLabel: validation.parityEvidence.walkthrough.datasetLabel,
        walkthroughDatasetHash: validation.parityEvidence.walkthrough.datasetHash,
        walkthroughSource: validation.parityEvidence.walkthrough.source === "missing"
          ? undefined
          : validation.parityEvidence.walkthrough.source,
        walkthroughSourceId: validation.parityEvidence.walkthrough.sourceId,
        expertReviewRequired: expertGate.status === "required",
        studySpecificInferenceReference: "prereg:coherent-reseal-v2",
        runtimeParityIds: validation.parityEvidence.runtimeParity.map((entry) => entry.id),
        notes: validation.parityEvidence.notes.slice(2)
      }
    });
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);
    expert.target.validationRunEvidenceHash = validation.validationRunEvidenceHash;

    expect(validation.validationRunEvidenceHash).not.toBe(previousEvidenceHash);
    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).not.toThrow();
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("expert-review-receipt-required");
  });

  it("rejects a coherently resealed analysis-run walkthrough whose source id is not a live bound analysis artifact", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!validation?.parityEvidence || !validation.preregistrationPlan || !project) {
      throw new Error("Expected analysis-run walkthrough source fixture.");
    }
    const expertGate = validation.parityEvidence.gates.find((gate) => gate.id === "domain-expert-review");
    if (!expertGate) throw new Error("Expected domain-expert gate fixture.");
    validation.parityEvidence = buildEnterpriseValidationParityEvidence({
      result: validation.result,
      preregistrationPlan: validation.preregistrationPlan,
      parityEvidence: {
        walkthroughDatasetLabel: validation.parityEvidence.walkthrough.datasetLabel,
        walkthroughDatasetHash: validation.parityEvidence.walkthrough.datasetHash,
        walkthroughSource: "analysis-run",
        walkthroughSourceId: "analysis-run-not-in-holder",
        expertReviewRequired: expertGate.status === "required",
        studySpecificInferenceReference: validation.parityEvidence.inference.studySpecificInferenceReference,
        runtimeParityIds: validation.parityEvidence.runtimeParity.map((entry) => entry.id),
        notes: validation.parityEvidence.notes.slice(2)
      }
    });
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions,
      analysisRuns: db.analysisRuns
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "parityEvidence"
    }));
  });

  it("does not silently reauthorize a resealed validation during an unrelated expert-review patch", async () => {
    const enterprise = await import("../enterprise");
    const project = enterprise.createEnterpriseProject(context, {
      teamId: context.teams[0].id,
      title: "Expert target immutability project",
      snapshot: readySnapshot()
    });
    const validation = enterprise.createEnterpriseValidationRun(context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Exact expert target immutability fixture.",
      methodNote: "Unrelated expert edits must not retarget an approval.",
      parityEvidence: {
        walkthroughDatasetLabel: "expert-target-immutability walkthrough",
        walkthroughDatasetHash: "e".repeat(64),
        studySpecificInferenceReference: "prereg:expert-target-immutability-v1"
      },
      result: structuredClone(alternateValidationResult)
    });
    const approvedValidation = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
      status: "approved",
      notes: "Approved evidence H1."
    });
    const expert = enterprise.createEnterpriseExpertReview(context, {
      projectId: project.id,
      target: { kind: "validation-run", id: approvedValidation.id },
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      limitations: "H1 limitations."
    });
    const approvedEvidenceHash = expert.target.validationRunEvidenceHash;
    const resealedValidation = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
      status: "approved",
      notes: "Approved evidence H2 after a coherent reseal."
    });
    expect(resealedValidation.validationRunEvidenceHash).not.toBe(approvedEvidenceHash);
    const beforePatch = enterprise.readEnterpriseDb();

    let caught: unknown;
    try {
      enterprise.reviewEnterpriseExpertReview(context, expert.id, {
        limitations: "This field-only edit must not silently approve H2."
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      status: 409,
      code: "expert_validation_target_evidence_changed"
    });
    expect(enterprise.readEnterpriseDb()).toEqual(beforePatch);
    const retainedExpert = enterprise.readEnterpriseDb().expertReviews.find((candidate) => candidate.id === expert.id);
    expect(retainedExpert?.target.validationRunEvidenceHash).toBe(approvedEvidenceHash);
    expect(retainedExpert?.limitations).toBe("H1 limitations.");
  });

  it("can revoke an approval after its exact validation target is coherently resealed", async () => {
    const enterprise = await import("../enterprise");
    const project = enterprise.createEnterpriseProject(context, {
      teamId: context.teams[0].id,
      title: "Expert revocation after reseal",
      snapshot: readySnapshot()
    });
    const validation = enterprise.createEnterpriseValidationRun(context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Revocation after reseal fixture.",
      methodNote: "Revocation preserves the historical target rather than retargeting it.",
      result: structuredClone(alternateValidationResult)
    });
    const approvedValidation = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
      status: "approved",
      notes: "H1 approved."
    });
    const expert = enterprise.createEnterpriseExpertReview(context, {
      projectId: project.id,
      target: { kind: "validation-run", id: approvedValidation.id },
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      limitations: "H1 limitations."
    });
    const historicalTargetHash = expert.target.validationRunEvidenceHash;
    const resealed = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
      status: "approved",
      notes: "H2 reseal."
    });
    expect(resealed.validationRunEvidenceHash).not.toBe(historicalTargetHash);

    const revoked = enterprise.reviewEnterpriseExpertReview(context, expert.id, {
      status: "rejected",
      limitations: "Approval revoked after evidence changed."
    });

    expect(revoked.status).toBe("rejected");
    expect(revoked.target.validationRunEvidenceHash).toBe(historicalTargetHash);
    expect(revoked.evidenceReceipt).toBeUndefined();
  });

  it("can revoke an approval after its historical validation target is no longer retained", async () => {
    const enterprise = await import("../enterprise");
    const project = enterprise.createEnterpriseProject(context, {
      teamId: context.teams[0].id,
      title: "Expert revocation after retention",
      snapshot: readySnapshot()
    });
    const validation = enterprise.createEnterpriseValidationRun(context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Revocation after retention fixture.",
      methodNote: "A missing historical target cannot prevent authority revocation.",
      result: structuredClone(alternateValidationResult)
    });
    const approvedValidation = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
      status: "approved",
      notes: "Approved before retention eviction."
    });
    const expert = enterprise.createEnterpriseExpertReview(context, {
      projectId: project.id,
      target: { kind: "validation-run", id: approvedValidation.id },
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      limitations: "Target may later be evicted."
    });
    const historicalTargetHash = expert.target.validationRunEvidenceHash;
    const db = enterprise.readEnterpriseDb();
    db.validationRuns = db.validationRuns.filter((candidate) => candidate.id !== validation.id);
    writeEnterpriseDb(db);

    const revoked = enterprise.reviewEnterpriseExpertReview(context, expert.id, {
      status: "changes-requested",
      limitations: "Approval revoked even though the target is no longer retained."
    });

    expect(revoked.status).toBe("changes-requested");
    expect(revoked.target.validationRunEvidenceHash).toBe(historicalTargetHash);
    expect(revoked.evidenceReceipt).toBeUndefined();
  });

  it("rejects a forged foundation gate whose parity and outer checksums are recomputed", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!validation?.parityEvidence || !project) throw new Error("Expected foundation-gate fixture.");
    validation.parityEvidence.runtimeParity = validation.parityEvidence.runtimeParity.filter((entry) => (
      entry.id !== "jena-rena-sample-parity"
    ));
    const {
      status: _parityStatus,
      validationRunHash: _validationRunHash,
      ...parityHashBody
    } = validation.parityEvidence;
    validation.parityEvidence.validationRunHash = enterpriseValidationParityEvidenceHash(parityHashBody);
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "parityEvidence"
    }));
  });

  it("rejects a recomputed walkthrough carrier that is not the bound project snapshot", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!validation?.parityEvidence || !validation.preregistrationPlan || !project) {
      throw new Error("Expected walkthrough binding fixture.");
    }
    const domainExpertGate = validation.parityEvidence.gates.find((gate) => gate.id === "domain-expert-review");
    if (!domainExpertGate) throw new Error("Expected domain expert gate fixture.");
    validation.parityEvidence = buildEnterpriseValidationParityEvidence({
      result: validation.result,
      preregistrationPlan: validation.preregistrationPlan,
      parityEvidence: {
        walkthroughDatasetLabel: "foreign revision walkthrough",
        walkthroughDatasetHash: "d".repeat(64),
        walkthroughSource: "project-snapshot",
        walkthroughSourceId: project.id,
        expertReviewRequired: domainExpertGate.status === "required",
        studySpecificInferenceReference: validation.parityEvidence.inference.studySpecificInferenceReference,
        runtimeParityIds: validation.parityEvidence.runtimeParity.map((entry) => entry.id),
        notes: validation.parityEvidence.notes.slice(2)
      }
    });
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "parityEvidence"
    }));
  });

  it("rejects a preregistration body whose outer checksum is recomputed over a stale plan hash", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    const project = db.projects.find((candidate) => candidate.id === projectId);
    if (!validation?.preregistrationPlan || !project) throw new Error("Expected preregistration fixture.");
    validation.preregistrationPlan.evidence[0] = "protocolNote=forged";
    validation.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(validation);

    expect(() => normalizeEnterpriseValidationRunEvidence(validation, project, {
      evidenceHash: "required",
      projectRevisions: db.projectRevisions
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      code: "validation_run_evidence_invalid",
      path: "preregistrationPlan"
    }));
  });

  it("rejects a cached parity-ready label when the underlying gate is incomplete", () => {
    const db = structuredClone(baseDb);
    const validation = db.validationRuns.find((run) => run.id === readyValidationRunId);
    if (!validation?.parityEvidence) throw new Error("Expected parity fixture.");
    validation.parityEvidence.status = "incomplete";
    const claimPackage = buildPackage(db);
    expect(claimPackage.status).toBe("exploratory-only");
    expect(claimPackage.blockers).toContain("validation-run-integrity-required");
    expect(claimPackage.evidence.validation).toBeUndefined();
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

  it("can reject a sealed validation against its retained source revision after the project advances", async () => {
    const enterprise = await import("../enterprise");
    const project = enterprise.createEnterpriseProject(context, {
      teamId: context.teams[0].id,
      title: "Retained validation review project",
      snapshot: readySnapshot()
    });
    const validation = enterprise.createEnterpriseValidationRun(context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Retained source review fixture.",
      methodNote: "Rejecting a historical run must preserve its source revision.",
      result: structuredClone(alternateValidationResult)
    });
    const originalHash = validation.validationRunEvidenceHash;
    const advancedSnapshot = readySnapshot();
    enterprise.updateEnterpriseProject(context, project.id, {
      snapshot: advancedSnapshot,
      expectedVersion: project.currentVersion
    });

    const reviewed = enterprise.reviewEnterpriseValidationRun(context, validation.id, {
      status: "rejected",
      notes: "Rejected after the project advanced; retain the original analytical source."
    });

    expect(reviewed.status).toBe("rejected");
    expect(reviewed.projectBinding?.projectVersion).toBe(project.currentVersion);
    expect(reviewed.validationRunEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(reviewed.validationRunEvidenceHash).not.toBe(originalHash);
  });
});
