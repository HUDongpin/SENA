import { createHash } from "node:crypto";
import {
  createEnterprisePostgresAdjudicationAdapterFromEnv,
  createEnterprisePostgresExpertReviewAdapterFromEnv,
  createEnterprisePostgresReliabilityRunAdapterFromEnv,
  createEnterprisePostgresValidationRunAdapterFromEnv
} from "../enterprise-postgres";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { requireEnterprisePermission, type SenaEnterprisePermission } from "./access-control";
import { SenaEnterpriseError } from "./errors";
import type {
  SenaEnterpriseExpertReview,
  SenaEnterpriseExpertReviewStatus
} from "./expert-review";
import { enterpriseExpertReviewRegistryRuntime } from "./expert-review";
import {
  readEnterpriseDb,
  readEnterpriseState,
  type SenaEnterpriseDb
} from "./state";
import type { SenaEnterpriseAdjudicationRecord } from "./team-collaboration";
import { enterpriseAdjudicationRegistryRuntime } from "./team-collaboration";
import type {
  SenaEnterpriseProject,
  SenaEnterpriseProjectRevision
} from "./team-project";
import type { SenaGroupComparisonMetric } from "../inference";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaProjectSnapshot } from "../types";
import type {
  SenaEnterpriseReliabilityAdjudicationCoverage,
  SenaEnterpriseReliabilityRun,
  SenaEnterpriseReliabilityRunStatus
} from "./reliability-runs";
import { enterpriseReliabilityRunRegistryRuntime } from "./reliability-runs";
import type {
  SenaEnterpriseValidationParityEvidence,
  SenaEnterpriseValidationPreregistrationPlan,
  SenaEnterpriseValidationRun,
  SenaEnterpriseValidationRunStatus
} from "./validation-runs";
import { enterpriseValidationRunRegistryRuntime } from "./validation-runs";

export type SenaEnterpriseClaimEvidencePackageStatus =
  | "claim-ready-with-limits"
  | "exploratory-only"
  | "not-claim-ready";

export type SenaEnterpriseClaimEvidencePackage = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage;
  generatedAt: string;
  status: SenaEnterpriseClaimEvidencePackageStatus;
  evidenceSource: {
    reliabilityRuns: "file-json" | "postgres-table";
    validationRuns: "file-json" | "postgres-table";
    expertReviews: "file-json" | "postgres-table";
    adjudications: "file-json" | "postgres-table" | "reliability-run-payload";
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
      claimScope: SenaEnterpriseExpertReview["claimScope"];
      reviewerName: string;
      reviewerRole: string;
      expertiseArea: string;
      ratings: SenaEnterpriseExpertReview["ratings"];
      target: SenaEnterpriseExpertReview["target"];
      reviewedAt?: string;
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

function claimPackageSourceSnapshotEvidence(
  project: SenaEnterpriseProject,
  revision: SenaEnterpriseProjectRevision | undefined
): SenaEnterpriseClaimEvidencePackage["sourceSnapshotEvidence"] {
  const activeWindow = project.snapshot.source.activeTemporalWindow;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseClaimSourceSnapshot,
    projectVersion: project.currentVersion,
    revisionId: revision?.id,
    revisionCreatedAt: revision?.createdAt,
    revisionMatchesCurrentVersion: revision?.version === project.currentVersion,
    snapshotSchemaVersion: project.snapshot.schemaVersion,
    snapshotTitle: project.title,
    snapshotGeneratedAt: project.snapshot.generatedAt,
    snapshotSha256: artifactSha256(project.snapshot),
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

function buildEnterpriseClaimEvidencePackageFromDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  input: { projectId: string },
  evidenceSource: SenaEnterpriseClaimEvidencePackage["evidenceSource"]
): SenaEnterpriseClaimEvidencePackage {
  const project = requireProjectPermissionFromDb(db, context, input.projectId, "project:read");
  const currentRevision = db.projectRevisions.find((revision) => (
    revision.projectId === project.id && revision.version === project.currentVersion
  ));
  const projectReliabilityRuns = db.reliabilityRuns.filter((run) => run.projectId === project.id);
  const projectValidationRuns = db.validationRuns.filter((run) => run.projectId === project.id);
  const projectExpertReviews = db.expertReviews.filter((review) => review.projectId === project.id);
  const approvedReliability = latestByTimestamp(projectReliabilityRuns.filter((run) => run.status === "approved"));
  const approvedExpertReview = latestByTimestamp(projectExpertReviews.filter((review) => review.status === "approved"));
  const approvedValidationRuns = projectValidationRuns.filter((run) => run.status === "approved");
  const expertValidationTargetId = approvedExpertReview?.target.kind === "validation-run" ? approvedExpertReview.target.id : undefined;
  const approvedValidation = expertValidationTargetId
    ? approvedValidationRuns.find((run) => run.id === expertValidationTargetId) ?? latestByTimestamp(approvedValidationRuns)
    : latestByTimestamp(approvedValidationRuns);
  const loadedReliabilityAdjudications = approvedReliability
    ? db.adjudications.filter((record) => record.reliabilityRunId === approvedReliability.id).length
    : 0;
  const reliabilityAdjudications = approvedReliability
    ? evidenceSource.adjudications === "reliability-run-payload"
      ? loadedReliabilityAdjudications || approvedReliability.adjudicationCoverage.resolvedDisagreements
      : loadedReliabilityAdjudications
    : 0;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!approvedReliability) blockers.push("approved-reliability-run-required");
  if (approvedReliability?.adjudicationCoverage.unresolvedDisagreements) {
    blockers.push("approved-reliability-adjudication-coverage-required");
  }
  if (!approvedValidation) blockers.push("approved-validation-run-required");
  if (approvedValidation && !approvedValidation.preregistrationPlan) blockers.push("validation-preregistration-plan-required");
  if (!approvedExpertReview) blockers.push("approved-domain-expert-review-required");
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
  if (approvedExpertReview) {
    evidence.expertReview = {
      reviewId: approvedExpertReview.id,
      status: approvedExpertReview.status,
      claimScope: approvedExpertReview.claimScope,
      reviewerName: approvedExpertReview.reviewerName,
      reviewerRole: approvedExpertReview.reviewerRole,
      expertiseArea: approvedExpertReview.expertiseArea,
      ratings: approvedExpertReview.ratings,
      target: approvedExpertReview.target,
      reviewedAt: approvedExpertReview.reviewedAt
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
  if (approvedExpertReview) {
    artifacts.push({
      id: "domain-expert-review",
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseExpertReview,
      sourceId: approvedExpertReview.id,
      status: approvedExpertReview.status
    });
  }

  const status: SenaEnterpriseClaimEvidencePackageStatus = blockers.length === 0
    ? "claim-ready-with-limits"
    : approvedExpertReview?.claimScope === "not-claim-ready"
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
    sourceSnapshotEvidence: claimPackageSourceSnapshotEvidence(project, currentRevision),
    summary: {
      reliability: claimEvidenceStatus(projectReliabilityRuns, approvedReliability),
      validation: claimEvidenceStatus(projectValidationRuns, approvedValidation),
      expertReview: claimEvidenceStatus(projectExpertReviews, approvedExpertReview),
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
  requireProjectPermissionFromDb(db, context, input.projectId, "project:read");
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
      reliabilityRuns = await adapter.listReliabilityRuns({ projectId: input.projectId, limit: 1000 });
    }
    if (evidenceSource.validationRuns === "postgres-table") {
      const { adapter, pool } = createEnterprisePostgresValidationRunAdapterFromEnv({});
      pools.push(pool);
      validationRuns = await adapter.listValidationRuns({ projectId: input.projectId, limit: 1000 });
    }
    if (evidenceSource.expertReviews === "postgres-table") {
      const { adapter, pool } = createEnterprisePostgresExpertReviewAdapterFromEnv({});
      pools.push(pool);
      expertReviews = await adapter.listExpertReviews({ projectId: input.projectId, limit: 1000 });
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
