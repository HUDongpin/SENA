import { createHash } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  buildEnterpriseClaimEvidencePackageFromDb,
  type SenaEnterpriseClaimEvidencePackage
} from "./claim-evidence-package";
import { requireEnterprisePermission } from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  findEnterprisePublicationReliabilityEvidenceFromDb,
  type SenaEnterpriseReliabilityRun
} from "./reliability-runs";
import {
  readEnterprisePublicationState,
  type SenaEnterpriseStateRead
} from "./state";
import type { SenaEnterpriseProject } from "./team-project";
import { enterpriseProjectEvidenceBindingMatches } from "./team-project";
import type { SenaCodingReliabilityReview } from "../types";
import { buildEnterprisePublicationSnapshot } from "./publication-snapshot";

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function publicationStateBindingError() {
  return new SenaEnterpriseError(
    "Publication project, claim package, and reliability evidence do not share one primary-state revision.",
    409,
    "publication_state_binding_invalid"
  );
}

function publicationClaimEvidenceNotReady(): never {
  throw new SenaEnterpriseError(
    "Publication export requires one claim-ready package with approved current reliability, sealed validation, and receipt-authenticated expert evidence.",
    409,
    "publication_claim_evidence_not_ready"
  );
}

function assertPublicationAuthorizationEvidence(
  claimPackage: SenaEnterpriseClaimEvidencePackage,
  project: SenaEnterpriseProject,
  reliabilityRun: SenaEnterpriseReliabilityRun | undefined
) {
  const reliability = claimPackage.evidence.reliability;
  const validation = claimPackage.evidence.validation;
  const expert = claimPackage.evidence.expertReview;
  const receipt = expert?.evidenceReceipt;
  if (
    claimPackage.summary.reliability !== "approved" ||
    claimPackage.summary.validation !== "approved" ||
    claimPackage.summary.expertReview !== "approved" ||
    !reliability ||
    reliability.status !== "approved" ||
    !reliabilityRun ||
    reliability.runId !== reliabilityRun.id ||
    reliabilityRun.status !== "approved" ||
    reliability.adjudicationCoverage.unresolvedDisagreements !== 0 ||
    !validation ||
    validation.status !== "approved" ||
    validation.validationRunEvidenceSchemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence ||
    !/^[a-f0-9]{64}$/.test(validation.validationRunEvidenceHash) ||
    !enterpriseProjectEvidenceBindingMatches(validation.projectBinding, project) ||
    !expert ||
    expert.status !== "approved" ||
    expert.claimScope !== "claim-ready-with-limits" ||
    !enterpriseProjectEvidenceBindingMatches(expert.projectBinding, project) ||
    expert.target.kind !== "validation-run" ||
    expert.target.id !== validation.runId ||
    expert.target.validationRunEvidenceHash !== validation.validationRunEvidenceHash ||
    !receipt ||
    receipt.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseExpertReviewReceipt ||
    receipt.algorithm !== "hmac-sha256" ||
    receipt.keySource !== "env-configured" ||
    receipt.validationRunEvidenceHash !== validation.validationRunEvidenceHash ||
    receipt.signedAt !== expert.reviewedAt ||
    !/^[a-f0-9]{64}$/.test(receipt.signature)
  ) {
    publicationClaimEvidenceNotReady();
  }
  return { reliability, validation, expert, receipt };
}

function assertPublicationClaimEvidenceReady(
  claimPackage: SenaEnterpriseClaimEvidencePackage,
  project: SenaEnterpriseProject,
  reliabilityRun: SenaEnterpriseReliabilityRun | undefined
) {
  if (
    claimPackage.status !== "claim-ready-with-limits" ||
    claimPackage.blockers.length !== 0 ||
    claimPackage.summary.blockers !== 0
  ) {
    publicationClaimEvidenceNotReady();
  }
  return assertPublicationAuthorizationEvidence(claimPackage, project, reliabilityRun);
}

function stateRevisionEvidence(state: SenaEnterpriseStateRead) {
  const activePrimary = state.runtime.activePrimary;
  const revision = activePrimary === "postgres" ? state.revision : state.fileRevision;
  if (revision === undefined) throw publicationStateBindingError();
  const stateRevision = String(revision);
  return {
    activePrimary,
    stateRevisionKind: activePrimary === "postgres"
      ? "postgres-row-revision" as const
      : "file-content-sha256" as const,
    stateRevision,
    stateRevisionSha256: sha256Json({ activePrimary, stateRevision })
  };
}

export type SenaEnterprisePublicationStateBinding = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationStateBinding;
  activePrimary: "file" | "postgres";
  stateRevisionKind: "file-content-sha256" | "postgres-row-revision";
  stateRevision: string;
  stateRevisionSha256: string;
  project: {
    projectId: string;
    projectVersion: number;
    persistedSnapshotSha256: string;
    readProjectionSnapshotSha256: string;
  };
  claimPackage: {
    sha256: string;
    projectVersion: number;
    sourceSnapshotSha256: string;
    persistedSnapshotSha256: string;
    claimReadinessKind: SenaEnterpriseClaimEvidencePackage["claimReadinessEvidence"]["kind"];
    claimReadinessSnapshotSha256: string;
    reliabilityRunId: string | null;
  };
  reliabilityRun: {
    runId: string;
    status: "approved";
    sha256: string;
    dashboardSchemaVersion: string;
    projectVersion: number;
    unresolvedDisagreements: number;
    adjudicationCoverageSha256: string;
  } | null;
  validationRun: {
    runId: string;
    status: "approved";
    sha256: string;
    resultSchemaVersion: string;
    validationRunEvidenceSchemaVersion: string;
    validationRunEvidenceHash: string;
    projectBinding: NonNullable<SenaEnterpriseClaimEvidencePackage["evidence"]["validation"]>["projectBinding"];
    reviewedAt?: string;
  };
  expertReview: {
    reviewId: string;
    status: "approved";
    sha256: string;
    claimScope: "claim-ready-with-limits";
    projectBinding: NonNullable<SenaEnterpriseClaimEvidencePackage["evidence"]["expertReview"]>["projectBinding"];
    targetValidationRunId: string;
    targetValidationRunEvidenceHash: string;
    receipt: NonNullable<SenaEnterpriseClaimEvidencePackage["evidence"]["expertReview"]>["evidenceReceipt"];
    receiptSha256: string;
  };
  bindingSha256: string;
};

export type SenaEnterprisePublicationStateBundle = {
  project: SenaEnterpriseProject;
  claimPackage: SenaEnterpriseClaimEvidencePackage;
  reliabilityRun?: SenaEnterpriseReliabilityRun;
  reliabilityReviewProjection?: Partial<SenaCodingReliabilityReview>;
  publicationSnapshot: SenaEnterpriseProject["snapshot"];
  stateBinding: SenaEnterprisePublicationStateBinding;
};

export type SenaEnterprisePublicationPreNormalizationBudgetInput = {
  targetSnapshot: unknown;
};

export function resolveEnterprisePublicationStateBundleFromState(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  state: SenaEnterpriseStateRead
): SenaEnterprisePublicationStateBundle {
  const project = state.db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:read");
  requireEnterprisePermission(context, project.teamId, "export:create");

  const persistedProject = (state.persistedDb ?? state.db).projects.find((candidate) => candidate.id === projectId);
  if (!persistedProject || persistedProject.teamId !== project.teamId) throw publicationStateBindingError();

  const revisionEvidence = stateRevisionEvidence(state);
  const persistedSnapshotSha256 = sha256Json(persistedProject.snapshot);
  const readProjectionSnapshotSha256 = sha256Json(project.snapshot);
  const reliabilityEvidence = findEnterprisePublicationReliabilityEvidenceFromDb(context, project, state.db);
  const reliabilityRun = reliabilityEvidence?.reliabilityRun;
  const primarySource = revisionEvidence.activePrimary === "postgres"
    ? "postgres-primary-state" as const
    : "file-primary-state" as const;
  const evidenceSource = {
    reliabilityRuns: primarySource,
    validationRuns: primarySource,
    expertReviews: primarySource,
    adjudications: primarySource,
    evidence: [
      `publicationClaimEvidencePrimary=${revisionEvidence.activePrimary}`,
      `publicationClaimEvidenceStateRevisionSha256=${revisionEvidence.stateRevisionSha256}`,
      "publicationClaimEvidenceAtomicRead=true"
    ]
  };
  const baseOptions = {
    approvedReliabilityRunId: reliabilityRun?.id ?? null,
    persistedSnapshotSha256,
    stateRevisionSha256: revisionEvidence.stateRevisionSha256
  };
  const preliminaryClaimPackage = buildEnterpriseClaimEvidencePackageFromDb(
    state.db,
    context,
    { projectId },
    evidenceSource,
    baseOptions
  );
  if (preliminaryClaimPackage.blockers.includes("validation-run-integrity-required")) {
    throw new SenaEnterpriseError(
      "Stored validation evidence is not canonically bound to its reviewed result.",
      409,
      "validation_run_evidence_invalid"
    );
  }
  const nonDerivableBlockers = preliminaryClaimPackage.blockers.filter((blocker) => (
    blocker !== "project-claim-readiness-required"
  ));
  if (nonDerivableBlockers.length > 0) publicationClaimEvidenceNotReady();
  assertPublicationAuthorizationEvidence(preliminaryClaimPackage, project, reliabilityRun);

  const publicationSnapshot = buildEnterprisePublicationSnapshot(
    project,
    reliabilityRun,
    reliabilityEvidence?.reviewProjection
  );
  const claimPackage = buildEnterpriseClaimEvidencePackageFromDb(
    state.db,
    context,
    { projectId },
    evidenceSource,
    {
      ...baseOptions,
      claimReadinessSnapshot: publicationSnapshot,
      claimReadinessReliabilityRunId: reliabilityRun?.id
    }
  );
  const authorization = assertPublicationClaimEvidenceReady(claimPackage, project, reliabilityRun);

  const claimReliabilityRunId = claimPackage.evidence.reliability?.runId ?? null;
  if (
    claimPackage.project.id !== project.id ||
    claimPackage.project.currentVersion !== project.currentVersion ||
    claimPackage.sourceSnapshotEvidence.projectVersion !== project.currentVersion ||
    claimPackage.sourceSnapshotEvidence.snapshotSha256 !== readProjectionSnapshotSha256 ||
    claimPackage.sourceSnapshotEvidence.persistedSnapshotSha256 !== persistedSnapshotSha256 ||
    claimPackage.sourceSnapshotEvidence.stateRevisionSha256 !== revisionEvidence.stateRevisionSha256 ||
    claimReliabilityRunId !== (reliabilityRun?.id ?? null)
  ) {
    throw publicationStateBindingError();
  }

  if (reliabilityRun && reliabilityRun.status !== "approved") {
    throw publicationStateBindingError();
  }
  const reliabilityBinding = reliabilityRun ? {
    runId: reliabilityRun.id,
    status: "approved" as const,
    sha256: sha256Json(reliabilityRun),
    dashboardSchemaVersion: reliabilityRun.dashboard.schemaVersion,
    projectVersion: reliabilityRun.projectBinding?.projectVersion ?? project.currentVersion,
    unresolvedDisagreements: reliabilityRun.adjudicationCoverage.unresolvedDisagreements,
    adjudicationCoverageSha256: sha256Json(reliabilityRun.adjudicationCoverage)
  } : null;
  if (reliabilityBinding && (
    reliabilityBinding.projectVersion !== project.currentVersion ||
    reliabilityBinding.unresolvedDisagreements !== 0
  )) {
    throw publicationStateBindingError();
  }
  if (!reliabilityBinding) publicationClaimEvidenceNotReady();

  const validationBinding = {
    runId: authorization.validation.runId,
    status: "approved" as const,
    sha256: sha256Json(authorization.validation),
    resultSchemaVersion: authorization.validation.resultSchemaVersion,
    validationRunEvidenceSchemaVersion: authorization.validation.validationRunEvidenceSchemaVersion,
    validationRunEvidenceHash: authorization.validation.validationRunEvidenceHash,
    projectBinding: structuredClone(authorization.validation.projectBinding),
    reviewedAt: authorization.validation.reviewedAt
  };
  const expertBinding = {
    reviewId: authorization.expert.reviewId,
    status: "approved" as const,
    sha256: sha256Json(authorization.expert),
    claimScope: "claim-ready-with-limits" as const,
    projectBinding: structuredClone(authorization.expert.projectBinding),
    targetValidationRunId: authorization.validation.runId,
    targetValidationRunEvidenceHash: authorization.validation.validationRunEvidenceHash,
    receipt: structuredClone(authorization.receipt),
    receiptSha256: sha256Json(authorization.receipt)
  };

  const bindingCore = {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationStateBinding,
    ...revisionEvidence,
    project: {
      projectId: project.id,
      projectVersion: project.currentVersion,
      persistedSnapshotSha256,
      readProjectionSnapshotSha256
    },
    claimPackage: {
      sha256: sha256Json(claimPackage),
      projectVersion: claimPackage.project.currentVersion,
      sourceSnapshotSha256: claimPackage.sourceSnapshotEvidence.snapshotSha256,
      persistedSnapshotSha256,
      claimReadinessKind: claimPackage.claimReadinessEvidence.kind,
      claimReadinessSnapshotSha256: claimPackage.claimReadinessEvidence.snapshotSha256,
      reliabilityRunId: claimReliabilityRunId
    },
    reliabilityRun: reliabilityBinding,
    validationRun: validationBinding,
    expertReview: expertBinding
  };

  return {
    project,
    claimPackage,
    reliabilityRun,
    reliabilityReviewProjection: reliabilityEvidence?.reviewProjection,
    publicationSnapshot,
    stateBinding: {
      ...bindingCore,
      bindingSha256: sha256Json(bindingCore)
    }
  };
}

export async function resolveEnterprisePublicationStateBundle(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  options: {
    beforeNormalize?: (
      input: SenaEnterprisePublicationPreNormalizationBudgetInput
    ) => void;
  } = {}
) {
  const state = await readEnterprisePublicationState({
    beforeReadProjection: (persistedDb) => {
      const project = persistedDb.projects.find((candidate) => candidate.id === projectId);
      if (!project) {
        throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
      }
      requireEnterprisePermission(context, project.teamId, "project:read");
      requireEnterprisePermission(context, project.teamId, "export:create");
      options.beforeNormalize?.({
        targetSnapshot: project.snapshot
      });
    }
  });
  return resolveEnterprisePublicationStateBundleFromState(context, projectId, state);
}
