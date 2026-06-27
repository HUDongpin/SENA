import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import {
  buildSenaWorkspaceApiUrl,
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES,
  type SenaWorkspaceFetch
} from "./api-client";
import type {
  EnterpriseGoLiveAttestation,
  EnterpriseGoLiveRehearsal,
  EnterpriseIdentityProductionEvidenceDossier,
  EnterpriseOrganizationDeploymentPackage,
  EnterprisePlatformDecisionAcceptance,
  EnterprisePlatformDecisionId,
  EnterprisePlatformDecisionRegister,
  EnterprisePlatformDecisionStatus,
  EnterpriseReleaseGateDecision,
  EnterpriseReleaseGateDraft,
  EnterpriseReleaseGateReview,
  EnterpriseReleaseVerificationStatus
} from "./enterprise-contracts";

export type EnterpriseOpsActionHeaders = () => Promise<Record<string, string>>;

export type EnterpriseOpsActionOptions = {
  fetchImpl?: SenaWorkspaceFetch;
  jsonHeaders?: EnterpriseOpsActionHeaders;
};

export type EnterprisePlatformDecisionReviewActionResponse = {
  acceptance?: EnterprisePlatformDecisionAcceptance;
  platformDecisionRegister?: EnterprisePlatformDecisionRegister;
  identityProductionEvidence?: EnterpriseIdentityProductionEvidenceDossier;
};

export type EnterpriseReleaseGateReviewActionResponse = {
  review?: EnterpriseReleaseGateReview & {
    identityProductionSnapshot?: {
      status?: string;
      submissionVerifier: { incompleteDecisions?: number };
      rotationFreshness: { status?: string };
      cutoverChecklist: {
        status?: string;
        summary: { blockingItems?: number };
      };
      releaseGateBlocked?: boolean;
    };
  };
};

export type EnterpriseDeliverySummaryResponse = {
  status?: string;
  summary?: {
    delivered?: number;
    failed?: number;
    skipped?: number;
  };
};

export type EnterpriseBackupDeliveryActionResponse = EnterpriseDeliverySummaryResponse & {
  backup?: {
    recordCounts?: {
      teams?: number;
      projects?: number;
      auditEvents?: number;
    };
  };
};

export type EnterpriseOpsAlertsDeliveryActionResponse = {
  status?: string;
  alerts?: {
    summary?: {
      firing?: number;
      critical?: number;
    };
  };
};

export type EnterpriseGoLiveRehearsalActionResponse = EnterpriseGoLiveRehearsal & {
  releaseGateDraft: EnterpriseReleaseGateDraft;
};

export type EnterpriseGoLiveAttestationActionResponse = {
  attestation?: EnterpriseGoLiveAttestation;
};

async function enterpriseJsonHeaders(options: EnterpriseOpsActionOptions) {
  if (!options.jsonHeaders) {
    throw new Error("Enterprise JSON headers are required for this action.");
  }
  return options.jsonHeaders();
}

async function requestEnterpriseOpsJsonAction<T>(
  url: string,
  input: {
    method: "POST";
    body?: unknown;
    errorMessage: string;
  },
  options: EnterpriseOpsActionOptions
) {
  return requestSenaWorkspaceJson<T>(
    url,
    {
      method: input.method,
      headers: await enterpriseJsonHeaders(options),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    },
    {
      errorMessage: input.errorMessage,
      fetchImpl: options.fetchImpl
    }
  );
}

export async function submitEnterprisePlatformDecisionReviewAction(
  input: {
    teamId: string;
    decisionId: EnterprisePlatformDecisionId;
    status: EnterprisePlatformDecisionStatus;
    acceptedBridge: boolean;
    ownerName: string;
    ownerRole: string;
    environment: string;
    evidenceUrl?: string;
    productionEvidenceIds: string[];
    productionEvidenceVerifiedAt?: string;
    requestPacketPolicyHash?: string;
    notes: string;
  },
  options: EnterpriseOpsActionOptions
) {
  return requestEnterpriseOpsJsonAction<EnterprisePlatformDecisionReviewActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions,
    {
      method: "POST",
      body: input,
      errorMessage: "Platform decision review failed."
    },
    options
  );
}

export async function submitEnterpriseReleaseGateReviewAction(
  input: {
    teamId: string;
    environment: string;
    releaseVersion: string;
    decision: EnterpriseReleaseGateDecision;
    approverName: string;
    approverRole: string;
    notes: string;
    verificationCommand: string;
    verificationEvidence: {
      status: EnterpriseReleaseVerificationStatus;
      summary: string;
      outputSha256?: string;
    };
  },
  options: EnterpriseOpsActionOptions
) {
  return requestEnterpriseOpsJsonAction<EnterpriseReleaseGateReviewActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.releaseGate,
    {
      method: "POST",
      body: input,
      errorMessage: "Release gate review failed."
    },
    options
  );
}

export async function exportEnterpriseJsonArtifactAction<T = unknown>(
  url: string,
  label: string,
  options: Pick<EnterpriseOpsActionOptions, "fetchImpl"> = {}
) {
  return requestSenaWorkspaceJson<T>(url, undefined, {
    errorMessage: `${label} export failed.`,
    fetchImpl: options.fetchImpl
  });
}

export async function exportEnterpriseAuditCsvAction(
  input: { teamId?: string },
  options: Pick<EnterpriseOpsActionOptions, "fetchImpl"> = {}
) {
  const url = buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.audit, {
    format: "csv",
    integrity: 1,
    teamId: input.teamId
  });
  const response = await (options.fetchImpl ?? fetch)(url);
  const text = await response.text();
  if (!response.ok) {
    let message = "Enterprise audit CSV export failed.";
    try {
      message = JSON.parse(text).error || message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }
  return text;
}

export async function deliverEnterpriseAuditLogAction(
  input: { teamId?: string },
  options: EnterpriseOpsActionOptions
) {
  return requestEnterpriseOpsJsonAction<EnterpriseDeliverySummaryResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.audit,
    {
      method: "POST",
      body: {
        teamId: input.teamId,
        force: true,
        limit: 100
      },
      errorMessage: "Enterprise audit delivery failed."
    },
    options
  );
}

export async function deliverEnterpriseBackupAction(
  input: { teamId?: string },
  options: EnterpriseOpsActionOptions
) {
  return requestEnterpriseOpsJsonAction<EnterpriseBackupDeliveryActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.backup,
    {
      method: "POST",
      body: {
        action: "deliver",
        teamId: input.teamId
      },
      errorMessage: "Enterprise backup delivery failed."
    },
    options
  );
}

export async function syncEnterpriseDatabaseAction(
  input: { teamId?: string },
  options: EnterpriseOpsActionOptions
) {
  return requestEnterpriseOpsJsonAction<EnterpriseBackupDeliveryActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.backup,
    {
      method: "POST",
      body: {
        action: "sync-database",
        teamId: input.teamId
      },
      errorMessage: "Enterprise database sync failed."
    },
    options
  );
}

export async function getEnterpriseGoLiveRehearsalAction(
  input: { teamId?: string },
  options: Pick<EnterpriseOpsActionOptions, "fetchImpl"> = {}
) {
  const payload = await requestSenaWorkspaceJson<Partial<EnterpriseGoLiveRehearsalActionResponse> & { error?: string }>(
    buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
      teamId: input.teamId
    }),
    undefined,
    {
      errorMessage: "Go-live rehearsal draft failed.",
      fetchImpl: options.fetchImpl
    }
  );
  if (
    payload.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal ||
    payload.releaseGateDraft?.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft
  ) {
    throw new Error(payload.error || "Go-live rehearsal did not include a release gate draft.");
  }
  return payload as EnterpriseGoLiveRehearsalActionResponse;
}

export async function submitEnterpriseGoLiveAttestationAction(
  input: {
    teamId: string;
    environment: string;
    releaseVersion: string;
    decision: EnterpriseReleaseGateDecision;
    attesterName: string;
    attesterRole: string;
    notes: string;
    checklist: {
      rehearsalReviewed: boolean;
      releaseGateDraftReviewed: boolean;
      verificationEvidenceReviewed: boolean;
      rollbackOwnerConfirmed: boolean;
      platformOwnerDecisionReviewed: boolean;
    };
  },
  options: EnterpriseOpsActionOptions
) {
  return requestEnterpriseOpsJsonAction<EnterpriseGoLiveAttestationActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal,
    {
      method: "POST",
      body: input,
      errorMessage: "Go-live attestation failed."
    },
    options
  );
}

export async function refreshEnterpriseProvisioningReadinessAction(
  input: { teamId?: string },
  options: Pick<EnterpriseOpsActionOptions, "fetchImpl"> = {}
) {
  const [deployment, identityEvidence] = await Promise.all([
    requestSenaWorkspaceJson<Partial<EnterpriseOrganizationDeploymentPackage> & { error?: string }>(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.deployment, {
        teamId: input.teamId
      }),
      undefined,
      {
        errorMessage: "Enterprise deployment package did not include provisioning readiness evidence.",
        fetchImpl: options.fetchImpl
      }
    ),
    requestSenaWorkspaceJson<Partial<EnterpriseIdentityProductionEvidenceDossier> & { error?: string }>(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.identityProductionEvidence, {
        teamId: input.teamId
      }),
      undefined,
      {
        errorMessage: "Enterprise identity production evidence did not include a platform request packet.",
        fetchImpl: options.fetchImpl
      }
    )
  ]);
  if (deployment.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment) {
    throw new Error(deployment.error || "Enterprise deployment package did not include provisioning readiness evidence.");
  }
  if (identityEvidence.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence) {
    throw new Error(identityEvidence.error || "Enterprise identity production evidence did not include a platform request packet.");
  }
  return {
    deployment: deployment as EnterpriseOrganizationDeploymentPackage,
    identityEvidence: identityEvidence as EnterpriseIdentityProductionEvidenceDossier
  };
}

export async function deliverEnterpriseOpsAlertsAction(options: EnterpriseOpsActionOptions) {
  return requestEnterpriseOpsJsonAction<EnterpriseOpsAlertsDeliveryActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.opsAlerts,
    {
      method: "POST",
      body: { action: "deliver" },
      errorMessage: "Enterprise ops alert delivery failed."
    },
    options
  );
}
