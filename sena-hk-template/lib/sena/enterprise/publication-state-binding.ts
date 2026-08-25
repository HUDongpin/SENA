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
import type { SenaCodingReliabilityReview } from "../types";

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
  bindingSha256: string;
};

export type SenaEnterprisePublicationStateBundle = {
  project: SenaEnterpriseProject;
  claimPackage: SenaEnterpriseClaimEvidencePackage;
  reliabilityRun?: SenaEnterpriseReliabilityRun;
  reliabilityReviewProjection?: Partial<SenaCodingReliabilityReview>;
  stateBinding: SenaEnterprisePublicationStateBinding;
};

export type SenaEnterprisePublicationPreNormalizationBudgetInput = {
  targetSnapshot: unknown;
  stateNormalizationSnapshots: unknown[];
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
  const claimPackage = buildEnterpriseClaimEvidencePackageFromDb(
    state.db,
    context,
    { projectId },
    {
      reliabilityRuns: primarySource,
      validationRuns: primarySource,
      expertReviews: primarySource,
      adjudications: primarySource,
      evidence: [
        `publicationClaimEvidencePrimary=${revisionEvidence.activePrimary}`,
        `publicationClaimEvidenceStateRevisionSha256=${revisionEvidence.stateRevisionSha256}`,
        "publicationClaimEvidenceAtomicRead=true"
      ]
    },
    {
      approvedReliabilityRunId: reliabilityRun?.id ?? null,
      persistedSnapshotSha256,
      stateRevisionSha256: revisionEvidence.stateRevisionSha256
    }
  );

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
      reliabilityRunId: claimReliabilityRunId
    },
    reliabilityRun: reliabilityBinding
  };

  return {
    project,
    claimPackage,
    reliabilityRun,
    reliabilityReviewProjection: reliabilityEvidence?.reviewProjection,
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
        targetSnapshot: project.snapshot,
        // This publication-specific raw-state path performs no implicit
        // project/revision imports. All canonical model/report work is
        // reserved in the target route derivation below.
        stateNormalizationSnapshots: []
      });
    }
  });
  return resolveEnterprisePublicationStateBundleFromState(context, projectId, state);
}
