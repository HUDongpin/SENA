import {
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES,
  type SenaWorkspaceFetch
} from "./api-client";
import type {
  EnterpriseContext,
  EnterpriseMfaSetup,
  EnterpriseMfaStatus,
  EnterpriseRole,
  EnterpriseSessionSummary,
  EnterpriseSsoPreflight,
  EnterpriseSsoProvider,
  EnterpriseSsoProviderStatusResponse,
  EnterpriseTeamState
} from "./enterprise-contracts";

export type EnterpriseActionHeaders = () => Promise<Record<string, string>>;

export type EnterpriseActionOptions = {
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

async function enterpriseJsonHeaders(options: EnterpriseActionOptions) {
  if (!options.jsonHeaders) {
    throw new Error("Enterprise JSON headers are required for this action.");
  }
  return options.jsonHeaders();
}

async function requestEnterpriseJsonAction<T>(
  url: string,
  input: {
    method: "POST" | "PATCH" | "DELETE";
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
  if (!payload.preflight || payload.preflight.schemaVersion !== "sena-enterprise-sso-preflight/v1") {
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
