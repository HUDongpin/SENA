import {
  buildSenaWorkspaceApiUrl,
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES,
  type SenaWorkspaceFetch
} from "./api-client";
import type {
  SenaCodingReliabilityReview,
  SenaDataset,
  SenaProjectSnapshot
} from "@/lib/sena/types";
import { hasSenaSchemaVersion } from "@/lib/sena/schema-registry";
import type {
  EnterpriseAnalysisRun,
  EnterpriseClaimEvidencePackage,
  EnterpriseCollaborationState,
  EnterpriseContext,
  EnterpriseImportRun,
  EnterpriseMfaSetup,
  EnterpriseMfaStatus,
  EnterpriseProjectSummary,
  EnterpriseRole,
  EnterpriseSessionSummary,
  EnterpriseSsoPreflight,
  EnterpriseSsoProvider,
  EnterpriseSsoProviderStatusResponse,
  EnterpriseTeamState,
  EnterpriseUploadStorageState
} from "./enterprise-contracts";

export type EnterpriseActionHeaders = () => Promise<Record<string, string>>;

export type EnterpriseActionOptions = {
  csrfHeaders?: EnterpriseActionHeaders;
  fetchImpl?: SenaWorkspaceFetch;
  jsonHeaders?: EnterpriseActionHeaders;
};

export type EnterpriseSessionRevokeResponse = {
  generatedAt?: string;
  remainingSessions?: EnterpriseSessionSummary[];
  revokedCount?: number;
};

export type EnterpriseInvitationActionResponse = {
  invitation?: EnterpriseTeamState["invitations"][number];
  context?: EnterpriseContext;
};

export type EnterpriseMembershipActionResponse = {
  membership?: EnterpriseTeamState["memberships"][number];
};

export type EnterpriseNotificationActionResponse = {
  notification?: EnterpriseTeamState["notifications"][number];
  notifications?: unknown[];
  deliveries?: unknown[];
  emailDeliveries?: unknown[];
};
export type EnterpriseUploadObjectStorageResponse = {
  status?: string;
  summary?: {
    delivered?: number;
    failed?: number;
    skipped?: number;
  };
};
export type EnterpriseCollaborationDeliveryResponse = EnterpriseCollaborationState & {
  summary?: {
    delivered?: number;
    failed?: number;
    skipped?: number;
  };
};
export type EnterpriseProjectActionResponse = {
  project: EnterpriseProjectSummary & { snapshot: SenaProjectSnapshot };
  restoredFrom?: { version: number };
};
export type EnterpriseProjectRevisionRestoreResponse = EnterpriseProjectActionResponse & {
  restoredFrom: { version: number };
};
export type EnterpriseImportFilesActionResponse = {
  // Absent when the server queued the import as a server job (202 receipt
  // instead of an import result) — callers must guard before using it.
  dataset?: SenaDataset;
  // Server-job receipt fields present only on the queued 202 response.
  id?: string;
  kind?: string;
  status?: string;
  sources?: Array<{ profile: string }>;
  warnings?: string[];
  persistedProject?: EnterpriseProjectSummary & { snapshot?: SenaProjectSnapshot };
  importRun?: EnterpriseImportRun;
  enterpriseAnalysisRun?: EnterpriseAnalysisRun;
  uploads?: Array<{ scanStatus?: string }>;
  cleaningManifest?: {
    schemaVersion?: string;
    checks?: Array<{ status: string }>;
  };
};
export type EnterpriseAnalysisActionResponse = {
  enterpriseAnalysisRun?: EnterpriseAnalysisRun;
  summary: {
    people: number;
    concepts: number;
    claimUse: string;
  };
};
export type EnterprisePublicationFormat = "svg" | "png" | "html" | "xlsx" | "docx" | "pdf" | "package";
export type EnterprisePublicationExportActionResponse = {
  blob: Blob;
  filename: string;
};
export type EnterpriseProjectListResponse = {
  projects?: EnterpriseProjectSummary[];
};
export type EnterpriseRunListResponse = {
  importRuns?: EnterpriseImportRun[];
  analysisRuns?: EnterpriseAnalysisRun[];
};
export type EnterpriseReliabilityFilesActionResponse = {
  reviewPatch?: Partial<SenaCodingReliabilityReview>;
  // Absent when the server queued the run as a server job (202 receipt
  // instead of a computed dashboard) — callers must guard before using it.
  dashboard?: {
    meanPairwiseKappa: number;
    krippendorffAlphaNominal: number;
    disagreementCount: number;
  };
  // Server-job receipt fields present only on the queued 202 response.
  id?: string;
  status?: string;
  reliabilityRun?: EnterpriseCollaborationState["reliabilityRuns"][number];
};
export type EnterpriseReliabilityReviewActionResponse = {
  reliabilityRun: EnterpriseCollaborationState["reliabilityRuns"][number];
};
export type EnterpriseValidationComparisonActionResponse = {
  schemaVersion?: string;
  metric: string;
  groupA: string;
  groupB: string;
  permutation: { pTwoSided: number };
  comparisonCount?: number;
  primary?: { holmAdjustedP?: number };
  validationRun?: EnterpriseCollaborationState["validationRuns"][number] & {
    minHolmAdjustedP?: number;
  };
};
export type EnterpriseValidationReviewActionResponse = {
  validationRun: EnterpriseCollaborationState["validationRuns"][number];
};
export type EnterpriseExpertReviewActionResponse = {
  expertReview: EnterpriseCollaborationState["expertReviews"][number];
};

async function enterpriseJsonHeaders(options: EnterpriseActionOptions) {
  if (!options.jsonHeaders) {
    throw new Error("Enterprise JSON headers are required for this action.");
  }
  return options.jsonHeaders();
}

async function enterpriseCsrfHeaders(options: EnterpriseActionOptions) {
  if (!options.csrfHeaders) {
    throw new Error("Enterprise CSRF headers are required for this action.");
  }
  return options.csrfHeaders();
}

async function requestEnterpriseJsonAction<T>(
  url: string,
  input: {
    method: "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    errorMessage: string;
  },
  options: EnterpriseActionOptions
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

export async function refreshEnterpriseUploadStorageAction(
  input: { teamId?: string; verify?: boolean },
  options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}
) {
  return requestSenaWorkspaceJson<EnterpriseUploadStorageState>(
    buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.uploads, {
      teamId: input.teamId,
      verify: input.verify ? "1" : undefined
    }),
    undefined,
    {
      errorMessage: "Upload storage refresh failed.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function createEnterpriseUploadRegistryFilesAction(
  input: { files: File[]; teamId: string },
  options: Pick<EnterpriseActionOptions, "csrfHeaders" | "fetchImpl">
) {
  const form = new FormData();
  input.files.forEach((file) => form.append("files", file));
  form.append("teamId", input.teamId);
  return requestSenaWorkspaceJson<EnterpriseUploadStorageState>(
    SENA_WORKSPACE_API_ROUTES.enterprise.uploads,
    {
      method: "POST",
      headers: await enterpriseCsrfHeaders(options),
      body: form
    },
    {
      errorMessage: "Enterprise upload failed.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function deliverEnterpriseUploadObjectStorageAction(
  input: { teamId?: string; uploadId?: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseUploadObjectStorageResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.uploads,
    {
      method: "POST",
      body: {
        action: "deliver-object-storage",
        teamId: input.teamId,
        uploadId: input.uploadId,
        limit: input.uploadId ? 1 : 25,
        includeReview: true
      },
      errorMessage: "Object-storage delivery failed."
    },
    options
  );
}

export async function getEnterpriseProjectsAction(options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}) {
  return requestSenaWorkspaceJson<EnterpriseProjectListResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.projects,
    undefined,
    {
      errorMessage: "Could not load enterprise projects.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function getEnterpriseImportRunsAction(
  input: { teamId?: string },
  options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}
) {
  return requestSenaWorkspaceJson<EnterpriseRunListResponse>(
    buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.import, { teamId: input.teamId }),
    undefined,
    {
      errorMessage: "Could not load enterprise import runs.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function getEnterpriseAnalysisRunsAction(
  input: { teamId?: string },
  options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}
) {
  return requestSenaWorkspaceJson<EnterpriseRunListResponse>(
    buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.analyze, { teamId: input.teamId }),
    undefined,
    {
      errorMessage: "Could not load enterprise analysis runs.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function refreshEnterpriseCollaborationAction(
  input: { projectId: string },
  options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}
) {
  return requestSenaWorkspaceJson<EnterpriseCollaborationState>(
    SENA_WORKSPACE_API_ROUTES.enterprise.collaboration(input.projectId),
    undefined,
    {
      errorMessage: "Could not load collaboration state.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function refreshEnterpriseClaimPackageAction(
  input: { projectId: string },
  options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}
) {
  return requestSenaWorkspaceJson<EnterpriseClaimEvidencePackage>(
    buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.validationClaimPackage, {
      projectId: input.projectId
    }),
    undefined,
    {
      errorMessage: "Could not load claim package.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function touchEnterprisePresenceAction(
  input: { projectId: string; activeView: string; cursorLabel: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseCollaborationState>(
    SENA_WORKSPACE_API_ROUTES.enterprise.collaboration(input.projectId),
    {
      method: "POST",
      body: {
        action: "presence",
        activeView: input.activeView,
        cursorLabel: input.cursorLabel
      },
      errorMessage: "Presence update failed."
    },
    options
  );
}

export async function addEnterpriseCommentAction(
  input: {
    projectId: string;
    body: string;
    target: { kind: string; id?: string; label?: string };
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseCollaborationState>(
    SENA_WORKSPACE_API_ROUTES.enterprise.collaboration(input.projectId),
    {
      method: "POST",
      body: {
        action: "comment",
        body: input.body,
        target: input.target
      },
      errorMessage: "Comment failed."
    },
    options
  );
}

export async function addEnterpriseAdjudicationAction(
  input: {
    projectId: string;
    reliabilityRunId?: string;
    itemId: string;
    codeId: string;
    decision: string;
    notes: string;
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseCollaborationState>(
    SENA_WORKSPACE_API_ROUTES.enterprise.collaboration(input.projectId),
    {
      method: "POST",
      body: {
        action: "adjudication",
        reliabilityRunId: input.reliabilityRunId,
        itemId: input.itemId,
        codeId: input.codeId,
        decision: input.decision,
        notes: input.notes
      },
      errorMessage: "Adjudication failed."
    },
    options
  );
}

export async function deliverEnterpriseCollaborationPubSubAction(
  input: { projectId: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseCollaborationDeliveryResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.collaboration(input.projectId),
    {
      method: "POST",
      body: {
        action: "deliver-pubsub",
        force: true,
        limit: 50
      },
      errorMessage: "Collaboration pub/sub delivery failed."
    },
    options
  );
}

export async function importEnterpriseFilesAction(
  input: {
    files: File[];
    teamId?: string;
    title: string;
    description: string;
    createProject?: boolean;
    includeRuntimeBundle?: boolean;
  },
  options: Pick<EnterpriseActionOptions, "csrfHeaders" | "fetchImpl">
) {
  const form = new FormData();
  input.files.forEach((file) => form.append("files", file));
  if (input.teamId) form.append("teamId", input.teamId);
  if (input.createProject) form.append("action", "create-project");
  if (input.includeRuntimeBundle) form.append("includeRuntimeBundle", "true");
  form.append("title", input.title);
  form.append("description", input.description);
  return requestSenaWorkspaceJson<EnterpriseImportFilesActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.import,
    {
      method: "POST",
      headers: await enterpriseCsrfHeaders(options),
      body: form
    },
    {
      errorMessage: "Enterprise import failed.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function saveEnterpriseProjectAction(
  input: {
    teamId: string;
    title: string;
    description: string;
    snapshot: unknown;
    projectId?: string;
    expectedVersion?: number;
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseProjectActionResponse>(
    input.projectId
      ? SENA_WORKSPACE_API_ROUTES.enterprise.project(input.projectId)
      : SENA_WORKSPACE_API_ROUTES.enterprise.projects,
    {
      method: input.projectId ? "PUT" : "POST",
      body: {
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        expectedVersion: input.expectedVersion,
        snapshot: input.snapshot
      },
      errorMessage: "Project save failed."
    },
    options
  );
}

export async function runEnterpriseAnalysisAction(
  input: {
    teamId: string;
    projectId?: string;
    snapshot?: unknown;
    title: string;
    includeRuntimeBundle?: boolean;
    persist?: boolean;
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseAnalysisActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.analyze,
    {
      method: "POST",
      body: {
        teamId: input.teamId,
        projectId: input.projectId,
        snapshot: input.snapshot,
        title: input.title,
        includeRuntimeBundle: input.includeRuntimeBundle,
        persist: input.persist
      },
      errorMessage: "Server-side SENA analysis failed."
    },
    options
  );
}

export async function openEnterpriseProjectAction(
  input: { projectId: string },
  options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}
) {
  return requestSenaWorkspaceJson<EnterpriseProjectActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.project(input.projectId),
    undefined,
    {
      errorMessage: "Could not open project.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function restoreEnterpriseProjectRevisionAction(
  input: { projectId: string; revisionId: string; expectedVersion: number },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseProjectRevisionRestoreResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.project(input.projectId),
    {
      method: "PATCH",
      body: {
        action: "restore-revision",
        revisionId: input.revisionId,
        expectedVersion: input.expectedVersion
      },
      errorMessage: "Project revision restore failed."
    },
    options
  );
}

export async function exportEnterprisePublicationAction(
  input: {
    teamId?: string;
    format: EnterprisePublicationFormat;
    projectId?: string;
    snapshot?: unknown;
  },
  options: EnterpriseActionOptions
): Promise<EnterprisePublicationExportActionResponse> {
  const response = await (options.fetchImpl ?? fetch)(
    SENA_WORKSPACE_API_ROUTES.publicationExport,
    {
      method: "POST",
      headers: await enterpriseJsonHeaders(options),
      body: JSON.stringify({
        teamId: input.teamId,
        format: input.format,
        projectId: input.projectId,
        snapshot: input.snapshot
      })
    }
  );
  if (!response.ok) {
    let message = "Publication export failed.";
    try {
      const payload = await response.json() as { error?: string };
      message = payload.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  return {
    blob,
    filename: match?.[1] ?? `sena-publication.${input.format}`
  };
}

export async function importEnterpriseReliabilityFilesAction(
  input: {
    files: File[];
    teamId?: string;
    projectId?: string;
    reviewer?: string;
  },
  options: Pick<EnterpriseActionOptions, "csrfHeaders" | "fetchImpl">
) {
  const form = new FormData();
  input.files.forEach((file) => form.append("files", file));
  if (input.teamId) form.append("teamId", input.teamId);
  if (input.projectId) form.append("projectId", input.projectId);
  if (input.reviewer) form.append("reviewer", input.reviewer);
  return requestSenaWorkspaceJson<EnterpriseReliabilityFilesActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.reliability,
    {
      method: "POST",
      headers: await enterpriseCsrfHeaders(options),
      body: form
    },
    {
      errorMessage: "Reliability calculation failed.",
      fetchImpl: options.fetchImpl
    }
  );
}

export async function reviewEnterpriseReliabilityRunAction(
  input: {
    runId: string;
    status: EnterpriseCollaborationState["reliabilityRuns"][number]["status"];
    notes: string;
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseReliabilityReviewActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.reliability,
    {
      method: "PATCH",
      body: {
        runId: input.runId,
        status: input.status,
        notes: input.notes
      },
      errorMessage: "Reliability review failed."
    },
    options
  );
}

export async function runEnterpriseValidationComparisonAction(
  input: {
    teamId: string;
    projectId?: string;
    snapshot: unknown;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
    metric?: string;
    suite?: boolean;
    metrics?: string[];
    iterations: number;
    seed: number;
    preregistrationNote: string;
    methodNote: string;
    parityEvidence?: { studySpecificInferenceReference?: string };
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseValidationComparisonActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.validationGroupComparison,
    {
      method: "POST",
      body: {
        teamId: input.teamId,
        projectId: input.projectId,
        snapshot: input.snapshot,
        groupField: input.groupField,
        groupA: input.groupA,
        groupB: input.groupB,
        ...(input.suite ? {
          suite: true,
          metrics: input.metrics ?? []
        } : {
          metric: input.metric
        }),
        iterations: input.iterations,
        seed: input.seed,
        preregistrationNote: input.preregistrationNote,
        methodNote: input.methodNote,
        parityEvidence: input.parityEvidence
      },
      errorMessage: "Group-comparison validation failed."
    },
    options
  );
}

export async function reviewEnterpriseValidationRunAction(
  input: {
    runId: string;
    status: "approved" | "rejected";
    notes: string;
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseValidationReviewActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.validationGroupComparison,
    {
      method: "PATCH",
      body: {
        runId: input.runId,
        status: input.status,
        notes: input.notes
      },
      errorMessage: "Validation review failed."
    },
    options
  );
}

export async function submitEnterpriseExpertReviewAction(
  input: {
    projectId: string;
    target: EnterpriseCollaborationState["expertReviews"][number]["target"];
    reviewerName?: string;
    expertiseArea?: string;
    status: "approved" | "changes-requested" | "rejected";
    claimScope: EnterpriseCollaborationState["expertReviews"][number]["claimScope"];
    ratings: EnterpriseCollaborationState["expertReviews"][number]["ratings"];
    concerns: string;
    recommendations: string;
    limitations: string;
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseExpertReviewActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.expertReview,
    {
      method: "POST",
      body: input,
      errorMessage: "Expert review failed."
    },
    options
  );
}

export async function updateEnterpriseExpertReviewAction(
  input: {
    reviewId: string;
    status: "approved" | "changes-requested" | "rejected";
    claimScope: EnterpriseCollaborationState["expertReviews"][number]["claimScope"];
    ratings: EnterpriseCollaborationState["expertReviews"][number]["ratings"];
    concerns: string;
    recommendations: string;
    limitations: string;
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseExpertReviewActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.expertReview,
    {
      method: "PATCH",
      body: input,
      errorMessage: "Expert review update failed."
    },
    options
  );
}

export async function runEnterpriseSsoPreflightAction(
  provider?: EnterpriseSsoProvider,
  options: Pick<EnterpriseActionOptions, "fetchImpl"> = {}
) {
  const preflightUrl = SENA_WORKSPACE_API_ROUTES.auth.ssoPreflight;
  const payload = await requestSenaWorkspaceJson<EnterpriseSsoProviderStatusResponse & { error?: string }>(
    provider ? `${preflightUrl}&provider=${encodeURIComponent(provider)}` : preflightUrl,
    undefined,
    {
      errorMessage: "Enterprise SSO preflight failed.",
      fetchImpl: options.fetchImpl
    }
  );
  if (!hasSenaSchemaVersion(payload.preflight, "enterpriseSsoPreflight")) {
    throw new Error("Enterprise SSO preflight response did not include readiness evidence.");
  }
  return payload.preflight as EnterpriseSsoPreflight;
}

export async function logoutEnterpriseSessionAction(options: EnterpriseActionOptions) {
  return requestEnterpriseJsonAction<unknown>(
    SENA_WORKSPACE_API_ROUTES.auth.logout,
    {
      method: "POST",
      errorMessage: "Enterprise logout failed."
    },
    options
  );
}

export async function revokeEnterpriseSessionAction(
  input: { sessionId?: string; action?: "revoke-others" },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseSessionRevokeResponse>(
    SENA_WORKSPACE_API_ROUTES.auth.sessions,
    {
      method: "DELETE",
      body: input.action ? { action: input.action } : { sessionId: input.sessionId },
      errorMessage: "Session revoke failed."
    },
    options
  );
}

export async function startEnterpriseMfaSetupAction(options: EnterpriseActionOptions) {
  return requestEnterpriseJsonAction<EnterpriseMfaSetup>(
    SENA_WORKSPACE_API_ROUTES.auth.mfa,
    {
      method: "POST",
      body: { action: "setup" },
      errorMessage: "MFA setup failed."
    },
    options
  );
}

export async function enableEnterpriseMfaAction(
  input: { setupToken: string; code: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseMfaStatus>(
    SENA_WORKSPACE_API_ROUTES.auth.mfa,
    {
      method: "POST",
      body: {
        action: "enable",
        setupToken: input.setupToken,
        code: input.code
      },
      errorMessage: "MFA enable failed."
    },
    options
  );
}

export async function disableEnterpriseMfaAction(
  input: { code: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseMfaStatus>(
    SENA_WORKSPACE_API_ROUTES.auth.mfa,
    {
      method: "DELETE",
      body: { code: input.code },
      errorMessage: "MFA disable failed."
    },
    options
  );
}

export async function createTeamInvitationAction(
  input: { teamId: string; email: string; role: EnterpriseRole },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseInvitationActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.invitations,
    {
      method: "POST",
      body: input,
      errorMessage: "Invitation failed."
    },
    options
  );
}

export async function acceptTeamInvitationAction(
  input: { inviteCode: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseInvitationActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.invitations,
    {
      method: "PATCH",
      body: input,
      errorMessage: "Invitation acceptance failed."
    },
    options
  );
}

export async function revokeTeamInvitationAction(
  input: { invitationId: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseInvitationActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.invitations,
    {
      method: "DELETE",
      body: input,
      errorMessage: "Invitation revoke failed."
    },
    options
  );
}

export async function updateTeamMembershipAction(
  input: {
    membershipId: string;
    role?: EnterpriseRole;
    status?: "active" | "suspended";
  },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseMembershipActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.memberships,
    {
      method: "PATCH",
      body: input,
      errorMessage: "Membership update failed."
    },
    options
  );
}

export async function markEnterpriseNotificationReadAction(
  input: { notificationId: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseNotificationActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.notifications,
    {
      method: "PATCH",
      body: input,
      errorMessage: "Notification update failed."
    },
    options
  );
}

export async function deliverEnterpriseNotificationsAction(
  input: { delivery: "notifications" | "email"; teamId?: string },
  options: EnterpriseActionOptions
) {
  return requestEnterpriseJsonAction<EnterpriseNotificationActionResponse>(
    SENA_WORKSPACE_API_ROUTES.enterprise.notifications,
    {
      method: "POST",
      body: {
        action: input.delivery === "email" ? "deliver-email" : "deliver",
        teamId: input.teamId,
        force: true
      },
      errorMessage: input.delivery === "email" ? "Email delivery failed." : "Notification delivery failed."
    },
    options
  );
}
