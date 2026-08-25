import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  createEnterprisePostgresAdjudicationAdapterFromEnv,
  createEnterprisePostgresExpertReviewAdapterFromEnv,
  createEnterprisePostgresReliabilityRunAdapterFromEnv,
  createEnterprisePostgresValidationRunAdapterFromEnv,
  SenaEnterpriseStoredIntegrityError
} from "../enterprise-postgres";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { requireEnterprisePermission, type SenaEnterprisePermission } from "./access-control";
import { SenaEnterpriseError } from "./errors";
import type {
  SenaEnterpriseExpertReview,
  SenaEnterpriseExpertReviewStatus
} from "./expert-review";
import { enterpriseExpertReviewRegistryRuntime } from "./expert-review";
import { isEnterpriseExpertReviewReceiptValid } from "./expert-review-receipt";
import {
  readEnterpriseDb,
  readEnterpriseState,
  type SenaEnterpriseDb
} from "./state";
import type { SenaEnterpriseAdjudicationRecord } from "./team-collaboration";
import { enterpriseAdjudicationRegistryRuntime } from "./team-collaboration";
import type {
  SenaEnterpriseProject,
  SenaEnterpriseProjectEvidenceBinding,
  SenaEnterpriseProjectRevision
} from "./team-project";
import { enterpriseProjectEvidenceBindingMatches } from "./team-project";
import {
  isCurrentSenaGroupComparisonValidationResult,
  SenaGroupComparisonSourceVerificationCache,
  type SenaGroupComparisonMetric
} from "../inference";
import { buildSenaClaimReadinessGate } from "../pilot-readiness";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaProjectSnapshot } from "../types";
import type {
  SenaEnterpriseReliabilityAdjudicationCoverage,
  SenaEnterpriseReliabilityRun,
  SenaEnterpriseReliabilityRunStatus
} from "./reliability-runs";
import { enterpriseReliabilityRunRegistryRuntime } from "./reliability-runs";
import {
  buildEnterpriseReliabilityPublicationReviewProjection,
  buildEnterpriseReliabilityAdjudicationCoverageFromResolvedScope,
  groupEnterpriseReliabilityAdjudicationsByRunId,
  resolveEnterpriseReliabilityRunProjectScope
} from "./reliability-integrity";
import type {
  SenaEnterpriseValidationParityEvidence,
  SenaEnterpriseValidationPreregistrationPlan,
  SenaEnterpriseValidationRun,
  SenaEnterpriseValidationRunStatus
} from "./validation-runs";
import {
  enterpriseValidationRunRegistryRuntime,
  isEnterpriseValidationParityEvidenceHashValid,
  isEnterpriseValidationPreregistrationPlanHashValid
} from "./validation-runs";
import {
  isEnterpriseValidationRunCurrentProvenance,
  normalizeEnterpriseValidationRunEvidence,
  SenaEnterpriseValidationRunIntegrityError
} from "./validation-integrity";

export type SenaEnterpriseClaimEvidencePackageStatus =
  | "claim-ready-with-limits"
  | "exploratory-only"
  | "not-claim-ready";

export type SenaEnterpriseClaimEvidencePackage = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage;
  generatedAt: string;
  status: SenaEnterpriseClaimEvidencePackageStatus;
  evidenceSource: {
    reliabilityRuns: "file-json" | "postgres-table" | "file-primary-state" | "postgres-primary-state";
    validationRuns: "file-json" | "postgres-table" | "file-primary-state" | "postgres-primary-state";
    expertReviews: "file-json" | "postgres-table" | "file-primary-state" | "postgres-primary-state";
    adjudications: "file-json" | "postgres-table" | "reliability-run-payload" | "file-primary-state" | "postgres-primary-state";
    evidence: string[];
  };
  project: {
    id: string;
    teamId: string;
    title: string;
    currentVersion: number;
    claimUse: string;
    activeWindowLabel: string;
    datasetCounts: SenaEnterpriseProject["datasetCounts"];
  };
  sourceSnapshotEvidence: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseClaimSourceSnapshot;
    projectVersion: number;
    revisionId?: string;
    revisionCreatedAt?: string;
    revisionMatchesCurrentVersion: boolean;
    snapshotSchemaVersion: SenaProjectSnapshot["schemaVersion"];
    snapshotTitle: string;
    snapshotGeneratedAt: string;
    snapshotSha256: string;
    readProjectionSnapshotSha256: string;
    persistedSnapshotSha256?: string;
    stateRevisionSha256?: string;
    reportSha256: string;
    dataGovernance: SenaProjectSnapshot["report"]["dataGovernance"];
    datasetCounts: SenaEnterpriseProject["datasetCounts"];
    buildOptions: SenaProjectSnapshot["reproducibility"]["buildOptions"];
    activeTemporalWindow: {
      id: string;
      label: string;
      mode: string;
      index: number;
      startTurn: number;
      endTurn: number;
    } | null;
    matrixFingerprints: Array<{
      id: string;
      label: string;
      shape: string;
      checksumAlgorithm: string;
      checksum: string;
      sha256: string;
    }>;
  };
  summary: {
    reliability: "approved" | "missing" | "pending-or-rejected";
    validation: "approved" | "missing" | "pending-or-rejected";
    expertReview: "approved" | "missing" | "pending-or-rejected";
    blockers: number;
    warnings: number;
  };
  blockers: string[];
  warnings: string[];
  evidence: {
    reliability?: {
      runId: string;
      status: SenaEnterpriseReliabilityRunStatus;
      reviewer: string;
      coderCount: number;
      itemCount: number;
      codeCount: number;
      meanPairwiseKappa: number | null;
      krippendorffAlphaNominal: number | null;
      disagreementCount: number;
      adjudications: number;
      adjudicationCoverage: SenaEnterpriseReliabilityAdjudicationCoverage;
      reviewedAt?: string;
    };
    validation?: {
      runId: string;
      status: SenaEnterpriseValidationRunStatus;
      validationRunEvidenceSchemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence;
      validationRunEvidenceHash: string;
      projectBinding?: SenaEnterpriseProjectEvidenceBinding;
      analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"] | "unplanned";
      metric: SenaGroupComparisonMetric;
      groupField: "group" | "role";
      groupA: string;
      groupB: string;
      pTwoSided: number;
      observedDifference: number;
      comparisonCount: number;
      minHolmAdjustedP?: number;
      significantHolmCount?: number;
      preregistrationPlanHash?: string;
      parityEvidence?: SenaEnterpriseValidationParityEvidence;
      suiteCorrection?: "holm";
      reviewedAt?: string;
    };
    expertReview?: {
      reviewId: string;
      status: SenaEnterpriseExpertReviewStatus;
      projectBinding?: SenaEnterpriseProjectEvidenceBinding;
      claimScope: SenaEnterpriseExpertReview["claimScope"];
      reviewerName: string;
      reviewerRole: string;
      expertiseArea: string;
      ratings: SenaEnterpriseExpertReview["ratings"];
      target: SenaEnterpriseExpertReview["target"];
      reviewedAt?: string;
      evidenceReceipt: NonNullable<SenaEnterpriseExpertReview["evidenceReceipt"]>;
    };
  };
  artifacts: Array<{
    id: string;
    schemaVersion: string;
    sourceId: string;
    status: string;
  }>;
  guardrails: string[];
};

function now() {
  return new Date().toISOString();
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function latestByTimestamp<T extends { createdAt: string; updatedAt?: string }>(records: T[]) {
  return records
    .slice()
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
}

function requireProjectPermissionFromDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  projectId: string,
  permission: SenaEnterprisePermission
) {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, permission);
  return project;
}

function claimEvidenceStatus<T extends { status: string }>(
  records: T[],
  approved: T | undefined
): "approved" | "missing" | "pending-or-rejected" {
  if (approved) return "approved";
  return records.length === 0 ? "missing" : "pending-or-rejected";
}

function validationCorrection(run: SenaEnterpriseValidationRun): "holm" | undefined {
  return run.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? run.result.correction : undefined;
}

function projectSnapshotIsResearchClaimReady(project: SenaEnterpriseProject) {
  const report = project.snapshot.report;
  const gate = report.claimReadinessGate;
  const canonicalGate = buildSenaClaimReadinessGate(report.pilotReadinessAudit);
  return project.claimUse === "research-claim-ready" &&
    gate.status === "ready" &&
    gate.claimUse === "research-claim-ready" &&
    gate.reviewNeeded === 0 &&
    gate.blockers.length === 0 &&
    gate.ready === gate.items.length &&
    gate.items.every((item) => item.status === "ready") &&
    isDeepStrictEqual(gate, canonicalGate);
}

function validationParityAndFormalInferenceReadiness(run: SenaEnterpriseValidationRun) {
  try {
    const parity = run.parityEvidence;
    const plan = run.preregistrationPlan;
    if (!parity || !plan || !isEnterpriseValidationPreregistrationPlanHashValid(plan) ||
      !isEnterpriseValidationParityEvidenceHashValid(parity) ||
      parity.preregistrationPlanHash !== plan.planHash ||
      !/^[a-f0-9]{64}$/.test(parity.validationRunHash)) {
      return { parityReady: false, formalReady: false };
    }
    const foundationGateIds = ["rena-parity", "r-sna-parity", "real-data-walkthrough"] as const;
    const foundationGatesReady = foundationGateIds.every((gateId) => {
      const matches = parity.gates.filter((gate) => gate.id === gateId);
      return matches.length === 1 && matches[0].status === "passed";
    });
    const parityReady = parity.status === "ready-for-review" && foundationGatesReady;
    const formal = parity.formalInference;
    const requiredFormalCheckIds = [
      "preregistration-plan",
      "study-specific-model",
      "runtime-parity",
      "real-data-walkthrough",
      "multiplicity-control"
    ] as const;
    const formalChecksReady = requiredFormalCheckIds.every((checkId) => {
      const matches = formal.checks.filter((check) => check.id === checkId);
      return matches.length === 1 && matches[0].status === "passed";
    });
    const sampleSizeChecks = formal.checks.filter((check) => check.id === "sample-size");
    const formalReady =
      formal.status === "model-referenced" &&
      formal.preregistrationPlanHash === plan.planHash &&
      formal.resultSchemaVersion === run.result.schemaVersion &&
      formal.analysis === plan.analysis &&
      formal.blockers.length === 0 &&
      formalChecksReady &&
      sampleSizeChecks.length === 1 &&
      (sampleSizeChecks[0].status === "passed" || sampleSizeChecks[0].status === "review");
    return { parityReady, formalReady };
  } catch {
    return { parityReady: false, formalReady: false };
  }
}

function claimPackageSourceSnapshotEvidence(
  project: SenaEnterpriseProject,
  revision: SenaEnterpriseProjectRevision | undefined,
  options: Pick<
    SenaEnterpriseClaimEvidencePackageBuildOptions,
    "persistedSnapshotSha256" | "stateRevisionSha256"
  > = {}
): SenaEnterpriseClaimEvidencePackage["sourceSnapshotEvidence"] {
  const activeWindow = project.snapshot.source.activeTemporalWindow;
  const readProjectionSnapshotSha256 = artifactSha256(project.snapshot);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseClaimSourceSnapshot,
    projectVersion: project.currentVersion,
    revisionId: revision?.id,
    revisionCreatedAt: revision?.createdAt,
    revisionMatchesCurrentVersion: revision?.teamId === project.teamId &&
      revision.version === project.currentVersion &&
      artifactSha256(revision.snapshot) === readProjectionSnapshotSha256,
    snapshotSchemaVersion: project.snapshot.schemaVersion,
    snapshotTitle: project.title,
    snapshotGeneratedAt: project.snapshot.generatedAt,
    snapshotSha256: readProjectionSnapshotSha256,
    readProjectionSnapshotSha256,
    ...(options.persistedSnapshotSha256 ? { persistedSnapshotSha256: options.persistedSnapshotSha256 } : {}),
    ...(options.stateRevisionSha256 ? { stateRevisionSha256: options.stateRevisionSha256 } : {}),
    reportSha256: artifactSha256(project.snapshot.report),
    dataGovernance: project.snapshot.report.dataGovernance,
    datasetCounts: project.datasetCounts,
    buildOptions: project.snapshot.reproducibility.buildOptions,
    activeTemporalWindow: activeWindow
      ? {
          id: activeWindow.id,
          label: activeWindow.label,
          mode: activeWindow.mode,
          index: activeWindow.index,
          startTurn: activeWindow.startTurn,
          endTurn: activeWindow.endTurn
        }
      : null,
    matrixFingerprints: project.snapshot.report.fusionMathAudit.matrixFingerprints.map((fingerprint) => ({
      id: fingerprint.id,
      label: fingerprint.label,
      shape: fingerprint.shape,
      checksumAlgorithm: fingerprint.checksumAlgorithm,
      checksum: fingerprint.checksum,
      sha256: artifactSha256(fingerprint)
    }))
  };
}

export function enterpriseClaimEvidencePackageRuntime(): SenaEnterpriseClaimEvidencePackage["evidenceSource"] {
  const reliabilityRuntime = enterpriseReliabilityRunRegistryRuntime();
  const validationRuntime = enterpriseValidationRunRegistryRuntime();
  const expertReviewRuntime = enterpriseExpertReviewRegistryRuntime();
  const adjudicationRuntime = enterpriseAdjudicationRegistryRuntime();
  const reliabilityRuns = reliabilityRuntime.activeStore;
  const validationRuns = validationRuntime.activeStore;
  const expertReviews = expertReviewRuntime.activeStore;
  const adjudications = adjudicationRuntime.activeStore;
  return {
    reliabilityRuns,
    validationRuns,
    expertReviews,
    adjudications,
    evidence: [
      `claimEvidenceReliabilityRuns=${reliabilityRuns}`,
      `claimEvidenceValidationRuns=${validationRuns}`,
      `claimEvidenceExpertReviews=${expertReviews}`,
      `claimEvidenceAdjudications=${adjudications}`,
      ...reliabilityRuntime.evidence,
      ...validationRuntime.evidence,
      ...expertReviewRuntime.evidence,
      ...adjudicationRuntime.evidence
    ]
  };
}

export type SenaEnterpriseClaimEvidencePackageBuildOptions = {
  /** `null` pins publication aggregation to no eligible reliability run. */
  approvedReliabilityRunId?: string | null;
  persistedSnapshotSha256?: string;
  stateRevisionSha256?: string;
};

export function buildEnterpriseClaimEvidencePackageFromDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  input: { projectId: string },
  evidenceSource: SenaEnterpriseClaimEvidencePackage["evidenceSource"],
  options: SenaEnterpriseClaimEvidencePackageBuildOptions = {}
): SenaEnterpriseClaimEvidencePackage {
  const project = requireProjectPermissionFromDb(db, context, input.projectId, "project:read");
  const validationSourceVerificationCache = new SenaGroupComparisonSourceVerificationCache();
  const currentRevisionCandidates = db.projectRevisions.filter((revision) => (
    revision.projectId === project.id && revision.version === project.currentVersion
  ));
  const currentRevisionTenantMismatch = currentRevisionCandidates.some((revision) => (
    revision.teamId !== project.teamId
  ));
  const currentRevision = currentRevisionCandidates.find((revision) => revision.teamId === project.teamId);
  const currentRevisionMatchesProject = Boolean(
    !currentRevisionTenantMismatch &&
    currentRevisionCandidates.length === 1 &&
    currentRevision &&
    artifactSha256(currentRevision.snapshot) === artifactSha256(project.snapshot)
  );
  const adjudicationsByRunId = groupEnterpriseReliabilityAdjudicationsByRunId(
    db.adjudications.filter((record) => record.projectId === project.id)
  );
  const projectReliabilityRuns = db.reliabilityRuns
    .filter((run) => run.projectId === project.id)
    .flatMap((run) => {
      const resolved = resolveEnterpriseReliabilityRunProjectScope(
        run,
        project,
        db.projectRevisions
      );
      const adjudicationCoverage = buildEnterpriseReliabilityAdjudicationCoverageFromResolvedScope(
        run,
        resolved,
        adjudicationsByRunId.get(run.id) ?? []
      );
      return resolved.scope === "current" ? [{
        ...run,
        dashboard: resolved.dashboard,
        projectBinding: resolved.dashboard.projectBinding,
        adjudicationCoverage
      }] : [];
    });
  const projectValidationCandidates = db.validationRuns.filter((run) => run.projectId === project.id);
  const validationTenantMismatch = projectValidationCandidates.some((run) => run.teamId !== project.teamId);
  const projectValidationRuns = projectValidationCandidates.filter((run) => run.teamId === project.teamId);
  const projectExpertReviewCandidates = db.expertReviews.filter((review) => review.projectId === project.id);
  const expertReviewTenantMismatch = projectExpertReviewCandidates.some((review) => review.teamId !== project.teamId);
  const projectExpertReviews = projectExpertReviewCandidates.filter((review) => review.teamId === project.teamId);
  const approvedReliabilityRuns = projectReliabilityRuns
    .filter((run) => run.status === "approved")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const projectedApprovedReliabilityRuns = approvedReliabilityRuns.flatMap((run) => {
    try {
      const projection = buildEnterpriseReliabilityPublicationReviewProjection(
        run,
        project,
        adjudicationsByRunId.get(run.id) ?? []
      );
      return [{
        run: {
          ...run,
          dashboard: projection.dashboard,
          adjudicationCoverage: projection.adjudicationCoverage
        },
        projection
      }];
    } catch {
      return [];
    }
  });
  const machineEligibleReliabilityRuns = projectedApprovedReliabilityRuns.filter(({ projection }) => (
    projection.dashboard.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityDashboard &&
    projection.dashboard.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityDashboard &&
    projection.review.machineEvidence?.claimEligibility.eligible === true &&
    projection.adjudicationCoverage.unresolvedDisagreements === 0
  ));
  const approvedReliabilityEvidence = Object.hasOwn(options, "approvedReliabilityRunId")
    ? options.approvedReliabilityRunId
      ? machineEligibleReliabilityRuns.find(({ run }) => run.id === options.approvedReliabilityRunId)
      : undefined
    : machineEligibleReliabilityRuns[0];
  const approvedReliability = approvedReliabilityEvidence?.run;
  const reliabilityEligibilityEvidence = Object.hasOwn(options, "approvedReliabilityRunId") && options.approvedReliabilityRunId
    ? projectedApprovedReliabilityRuns.find(({ run }) => run.id === options.approvedReliabilityRunId)
    : projectedApprovedReliabilityRuns[0];
  const approvedExpertReview = expertReviewTenantMismatch
    ? undefined
    : latestByTimestamp(projectExpertReviews.filter((review) => review.status === "approved"));
  const approvedValidationRuns = projectValidationRuns.filter((run) => run.status === "approved");
  const expertValidationTargetId = approvedExpertReview?.target.kind === "validation-run" ? approvedExpertReview.target.id : undefined;
  const selectedApprovedValidation = approvedExpertReview
    ? expertValidationTargetId
      ? approvedValidationRuns.find((run) => run.id === expertValidationTargetId)
      : undefined
    : latestByTimestamp(approvedValidationRuns);
  let approvedValidation: SenaEnterpriseValidationRun | undefined;
  let validationIntegrityBlocker: "approved-validation-run-evidence-hash-required" |
    "validation-run-integrity-required" | undefined = validationTenantMismatch
      ? "validation-run-integrity-required"
      : undefined;
  if (selectedApprovedValidation) {
    try {
      approvedValidation = normalizeEnterpriseValidationRunEvidence(
        selectedApprovedValidation,
        project,
        {
          evidenceHash: "required",
          projectRevisions: db.projectRevisions,
          analysisRuns: db.analysisRuns,
          sourceVerificationCache: validationSourceVerificationCache
        }
      );
    } catch (error) {
      if (!(error instanceof SenaEnterpriseValidationRunIntegrityError)) throw error;
      const fullRunSealMissing = selectedApprovedValidation.validationRunEvidenceHash === undefined &&
        selectedApprovedValidation.validationRunEvidenceSchemaVersion === undefined;
      if (!validationIntegrityBlocker || !fullRunSealMissing) {
        validationIntegrityBlocker = fullRunSealMissing
          ? "approved-validation-run-evidence-hash-required"
          : "validation-run-integrity-required";
      }
    }
  }
  const expertTargetsSelectedValidation = Boolean(
    approvedExpertReview &&
    approvedValidation &&
    approvedExpertReview.target.kind === "validation-run" &&
    approvedExpertReview.target.id === approvedValidation.id &&
    approvedExpertReview.target.validationRunEvidenceHash === approvedValidation.validationRunEvidenceHash
  );
  const expertReviewReceiptValid = Boolean(
    approvedExpertReview &&
    expertTargetsSelectedValidation &&
    isEnterpriseExpertReviewReceiptValid(approvedExpertReview)
  );
  const authorizedExpertReview = expertReviewReceiptValid ? approvedExpertReview : undefined;
  const validationBindingCurrent = approvedValidation
    ? enterpriseProjectEvidenceBindingMatches(approvedValidation.projectBinding, project)
    : false;
  const expertBindingCurrent = approvedExpertReview
    ? enterpriseProjectEvidenceBindingMatches(approvedExpertReview.projectBinding, project)
    : false;
  const validationReadiness = approvedValidation
    ? validationParityAndFormalInferenceReadiness(approvedValidation)
    : { parityReady: false, formalReady: false };
  const validationProvenanceCurrent = approvedValidation
    ? isEnterpriseValidationRunCurrentProvenance(approvedValidation, project, {
        analysisRuns: db.analysisRuns
      })
    : false;
  const validationCurrentV2 = approvedValidation
    ? isCurrentSenaGroupComparisonValidationResult(approvedValidation.result)
    : false;
  const loadedReliabilityAdjudications = approvedReliability
    ? (adjudicationsByRunId.get(approvedReliability.id) ?? []).length
    : 0;
  const reliabilityAdjudications = approvedReliability
    ? evidenceSource.adjudications === "reliability-run-payload"
      ? loadedReliabilityAdjudications || approvedReliability.adjudicationCoverage.resolvedDisagreements
      : loadedReliabilityAdjudications
    : 0;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (approvedReliabilityRuns.length === 0) blockers.push("approved-reliability-run-required");
  if (approvedReliabilityRuns.length > 0 && !approvedReliability) {
    blockers.push("approved-reliability-machine-eligibility-required");
    for (const blocker of reliabilityEligibilityEvidence?.projection.review.machineEvidence?.claimEligibility.blockers ?? []) {
      if (!blockers.includes(blocker)) blockers.push(blocker);
    }
  }
  if (approvedReliability?.adjudicationCoverage.unresolvedDisagreements) {
    blockers.push("approved-reliability-adjudication-coverage-required");
  }
  if (!projectSnapshotIsResearchClaimReady(project) || !currentRevisionMatchesProject) {
    blockers.push("project-claim-readiness-required");
  }
  if (!approvedValidation && !validationIntegrityBlocker) blockers.push("approved-validation-run-required");
  if (validationIntegrityBlocker) blockers.push(validationIntegrityBlocker);
  if (approvedValidation && !approvedValidation.preregistrationPlan) blockers.push("validation-preregistration-plan-required");
  if (approvedValidation && !validationBindingCurrent) blockers.push("validation-current-project-binding-required");
  if (approvedValidation && !validationProvenanceCurrent) blockers.push("validation-current-provenance-required");
  if (approvedValidation && !validationReadiness.parityReady) blockers.push("validation-parity-readiness-required");
  if (approvedValidation && !validationReadiness.formalReady) blockers.push("validation-formal-inference-readiness-required");
  if (approvedValidation && !validationCurrentV2) blockers.push("validation-current-v2-result-required");
  if (expertReviewTenantMismatch) blockers.push("expert-review-integrity-required");
  if (!approvedExpertReview) blockers.push("approved-domain-expert-review-required");
  if (approvedExpertReview && !expertTargetsSelectedValidation) {
    blockers.push("domain-expert-target-alignment-required");
  }
  if (approvedExpertReview && expertTargetsSelectedValidation && !expertReviewReceiptValid) {
    blockers.push("expert-review-receipt-required");
  }
  if (approvedExpertReview && !expertBindingCurrent) {
    blockers.push("domain-expert-current-project-binding-required");
  }
  if (approvedExpertReview && approvedExpertReview.claimScope !== "claim-ready-with-limits") {
    blockers.push("domain-expert-claim-ready-with-limits-required");
  }
  if (approvedValidation?.preregistrationPlan?.guardrail) warnings.push(approvedValidation.preregistrationPlan.guardrail);
  warnings.push("enterprise-claim-package-is-evidence-aggregation-not-causal-inference");

  const evidence: SenaEnterpriseClaimEvidencePackage["evidence"] = {};
  if (approvedReliability) {
    evidence.reliability = {
      runId: approvedReliability.id,
      status: approvedReliability.status,
      reviewer: approvedReliability.reviewer,
      coderCount: approvedReliability.coderCount,
      itemCount: approvedReliability.itemCount,
      codeCount: approvedReliability.codeCount,
      meanPairwiseKappa: approvedReliability.meanPairwiseKappa,
      krippendorffAlphaNominal: approvedReliability.krippendorffAlphaNominal,
      disagreementCount: approvedReliability.disagreementCount,
      adjudications: reliabilityAdjudications,
      adjudicationCoverage: approvedReliability.adjudicationCoverage,
      reviewedAt: approvedReliability.reviewedAt
    };
  }
  if (approvedValidation) {
    evidence.validation = {
      runId: approvedValidation.id,
      status: approvedValidation.status,
      validationRunEvidenceSchemaVersion: approvedValidation.validationRunEvidenceSchemaVersion!,
      validationRunEvidenceHash: approvedValidation.validationRunEvidenceHash!,
      projectBinding: approvedValidation.projectBinding
        ? structuredClone(approvedValidation.projectBinding)
        : undefined,
      analysis: approvedValidation.preregistrationPlan?.analysis ?? "unplanned",
      metric: approvedValidation.metric,
      groupField: approvedValidation.groupField,
      groupA: approvedValidation.groupA,
      groupB: approvedValidation.groupB,
      pTwoSided: approvedValidation.pTwoSided,
      observedDifference: approvedValidation.observedDifference,
      comparisonCount: approvedValidation.comparisonCount ?? 1,
      minHolmAdjustedP: approvedValidation.minHolmAdjustedP,
      significantHolmCount: approvedValidation.significantHolmCount,
      preregistrationPlanHash: approvedValidation.preregistrationPlan?.planHash,
      parityEvidence: approvedValidation.parityEvidence,
      suiteCorrection: validationCorrection(approvedValidation),
      reviewedAt: approvedValidation.reviewedAt
    };
  }
  if (authorizedExpertReview?.evidenceReceipt) {
    evidence.expertReview = {
      reviewId: authorizedExpertReview.id,
      status: authorizedExpertReview.status,
      projectBinding: authorizedExpertReview.projectBinding
        ? structuredClone(authorizedExpertReview.projectBinding)
        : undefined,
      claimScope: authorizedExpertReview.claimScope,
      reviewerName: authorizedExpertReview.reviewerName,
      reviewerRole: authorizedExpertReview.reviewerRole,
      expertiseArea: authorizedExpertReview.expertiseArea,
      ratings: authorizedExpertReview.ratings,
      target: authorizedExpertReview.target,
      reviewedAt: authorizedExpertReview.reviewedAt,
      evidenceReceipt: structuredClone(authorizedExpertReview.evidenceReceipt)
    };
  }

  const artifacts: SenaEnterpriseClaimEvidencePackage["artifacts"] = [];
  if (approvedReliability) {
    artifacts.push({
      id: "reliability-dashboard",
      schemaVersion: approvedReliability.dashboard.sourceSchemaVersion,
      sourceId: approvedReliability.id,
      status: approvedReliability.status
    });
  }
  if (approvedValidation?.preregistrationPlan) {
    artifacts.push({
      id: "validation-preregistration-plan",
      schemaVersion: approvedValidation.preregistrationPlan.schemaVersion,
      sourceId: approvedValidation.id,
      status: approvedValidation.status
    });
  }
  if (approvedValidation?.parityEvidence) {
    artifacts.push({
      id: "validation-parity-evidence",
      schemaVersion: approvedValidation.parityEvidence.schemaVersion,
      sourceId: approvedValidation.id,
      status: approvedValidation.parityEvidence.status
    });
    artifacts.push({
      id: "formal-inference-readiness",
      schemaVersion: approvedValidation.parityEvidence.formalInference.schemaVersion,
      sourceId: approvedValidation.id,
      status: approvedValidation.parityEvidence.formalInference.status
    });
  }
  if (authorizedExpertReview?.evidenceReceipt) {
    artifacts.push({
      id: "domain-expert-review",
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseExpertReview,
      sourceId: authorizedExpertReview.id,
      status: authorizedExpertReview.status
    });
    artifacts.push({
      id: "domain-expert-review-receipt",
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseExpertReviewReceipt,
      sourceId: authorizedExpertReview.id,
      status: authorizedExpertReview.evidenceReceipt.keySource
    });
  }

  const status: SenaEnterpriseClaimEvidencePackageStatus = blockers.length === 0
    ? "claim-ready-with-limits"
    : authorizedExpertReview?.claimScope === "not-claim-ready"
      ? "not-claim-ready"
      : "exploratory-only";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage,
    generatedAt: now(),
    status,
    evidenceSource,
    project: {
      id: project.id,
      teamId: project.teamId,
      title: project.title,
      currentVersion: project.currentVersion,
      claimUse: project.claimUse,
      activeWindowLabel: project.activeWindowLabel,
      datasetCounts: project.datasetCounts
    },
    sourceSnapshotEvidence: claimPackageSourceSnapshotEvidence(project, currentRevision, options),
    summary: {
      reliability: claimEvidenceStatus(projectReliabilityRuns, approvedReliability),
      validation: claimEvidenceStatus(projectValidationRuns, approvedValidation),
      expertReview: claimEvidenceStatus(projectExpertReviews, authorizedExpertReview),
      blockers: blockers.length,
      warnings: warnings.length
    },
    blockers,
    warnings,
    evidence,
    artifacts,
    guardrails: [
      "Claim readiness is limited to the approved project evidence in this package and does not replace study-level preregistration or institutional review.",
      "Treat SENA network patterns as exploratory unless the approved expert review, reliability evidence, and validation plan all support the stated claim scope.",
      "Expert approval is accepted only with a valid server-authenticated receipt over the full review record and exact validation evidence hash; configure a dedicated signing secret and retain prior keys by opaque key id during rotation.",
      "This package aggregates persisted enterprise evidence; it does not rerun analysis or alter project state."
    ]
  };
}

export function getEnterpriseClaimEvidencePackage(
  context: SenaEnterpriseSessionContext,
  input: { projectId: string }
): SenaEnterpriseClaimEvidencePackage {
  return buildEnterpriseClaimEvidencePackageFromDb(readEnterpriseDb(), context, input, {
    reliabilityRuns: "file-json",
    validationRuns: "file-json",
    expertReviews: "file-json",
    adjudications: "file-json",
    evidence: [
      "claimEvidenceReliabilityRuns=file-json",
      "claimEvidenceValidationRuns=file-json",
      "claimEvidenceExpertReviews=file-json",
      "claimEvidenceAdjudications=file-json"
    ]
  });
}

export async function getEnterpriseClaimEvidencePackageWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  input: { projectId: string }
): Promise<SenaEnterpriseClaimEvidencePackage> {
  const state = await readEnterpriseState();
  const db = state.db;
  const project = requireProjectPermissionFromDb(db, context, input.projectId, "project:read");
  const evidenceSource = enterpriseClaimEvidencePackageRuntime();
  let reliabilityRuns: SenaEnterpriseReliabilityRun[] = db.reliabilityRuns.filter((run) => run.projectId === input.projectId);
  let validationRuns: SenaEnterpriseValidationRun[] = db.validationRuns.filter((run) => run.projectId === input.projectId);
  let expertReviews: SenaEnterpriseExpertReview[] = db.expertReviews.filter((review) => review.projectId === input.projectId);
  let adjudications: SenaEnterpriseAdjudicationRecord[] = db.adjudications.filter((record) => record.projectId === input.projectId);
  const pools: Array<{ end?: () => Promise<void> }> = [];

  try {
    if (evidenceSource.reliabilityRuns === "postgres-table") {
      const { adapter, pool } = createEnterprisePostgresReliabilityRunAdapterFromEnv({});
      pools.push(pool);
      reliabilityRuns = await adapter.listReliabilityRuns({
        projectId: input.projectId,
        project: db.projects.find((candidate) => candidate.id === input.projectId),
        projectRevisions: db.projectRevisions.filter((revision) => (
          revision.projectId === input.projectId
        )),
        limit: 1000
      });
    }
    if (evidenceSource.expertReviews === "postgres-table") {
      const { adapter, pool } = createEnterprisePostgresExpertReviewAdapterFromEnv({});
      pools.push(pool);
      try {
        expertReviews = await adapter.listExpertReviews({
          projectId: input.projectId,
          teamId: project.teamId,
          limit: 1000
        });
      } catch (error) {
        if (error instanceof SenaEnterpriseStoredIntegrityError) {
          throw new SenaEnterpriseError(
            "Stored expert-review evidence failed indexed integrity validation.",
            409,
            "expert_review_evidence_invalid"
          );
        }
        throw error;
      }
    }
    if (evidenceSource.validationRuns === "postgres-table") {
      const { adapter, pool } = createEnterprisePostgresValidationRunAdapterFromEnv({});
      pools.push(pool);
      try {
        const approvedExpertTarget = latestByTimestamp(
          expertReviews.filter((review) => (
            review.teamId === project.teamId &&
            review.projectId === project.id &&
            review.status === "approved" &&
            review.target.kind === "validation-run"
          ))
        )?.target;
        validationRuns = await adapter.listValidationRuns({
          teamId: project.teamId,
          projectId: project.id,
          ...(approvedExpertTarget?.kind === "validation-run"
            ? { runId: approvedExpertTarget.id }
            : {}),
          status: "approved",
          project,
          projectRevisions: db.projectRevisions.filter((revision) => (
            revision.projectId === project.id
          )),
          analysisRuns: db.analysisRuns.filter((run) => (
            run.projectId === project.id || run.persistedProjectId === project.id
          )),
          limit: 1
        });
      } catch (error) {
        if (error instanceof SenaEnterpriseStoredIntegrityError) {
          throw new SenaEnterpriseError(
            "Stored validation evidence is not canonically bound to its reviewed result.",
            409,
            "validation_run_evidence_invalid"
          );
        }
        throw error;
      }
    }
    if (evidenceSource.adjudications === "postgres-table") {
      const { adapter, pool } = createEnterprisePostgresAdjudicationAdapterFromEnv({});
      pools.push(pool);
      adjudications = await adapter.listAdjudications({ projectId: input.projectId, limit: 1000 });
    }
  } finally {
    await Promise.all(pools.map((pool) => pool.end?.()));
  }

  return buildEnterpriseClaimEvidencePackageFromDb({
    ...db,
    adjudications,
    reliabilityRuns,
    validationRuns,
    expertReviews
  }, context, input, evidenceSource);
}
