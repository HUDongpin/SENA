import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  senaCsrfHeaderName,
  enforceEnterpriseApiRateLimit,
  enterpriseErrorResponse,
  getEnterpriseIdentityProductionEvidence,
  requireEnterpriseSession,
  sanitizeEnterpriseContext,
  senaSessionCookieName,
  verifyEnterpriseCsrfToken,
  type SenaEnterpriseIdentityInstitutionActionPlan,
  type SenaEnterpriseSessionContext
} from "./enterprise";

export function sessionCookieOptions(maxAgeSeconds = 7 * 24 * 60 * 60) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  };
}

export function sessionCookieMaxAgeSeconds(expiresAt: string) {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
}

export function jsonError(error: unknown) {
  const response = enterpriseErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export function currentSessionToken() {
  return cookies().get(senaSessionCookieName)?.value;
}

export function requireApiSession(): SenaEnterpriseSessionContext {
  return requireEnterpriseSession(currentSessionToken());
}

export function requireApiCsrf(request: Request, context: SenaEnterpriseSessionContext) {
  return verifyEnterpriseCsrfToken(context, request.headers.get(senaCsrfHeaderName));
}

export function requireApiSessionForMutation(request: Request): SenaEnterpriseSessionContext {
  const context = requireApiSession();
  requireApiCsrf(request, context);
  return context;
}

function requestClientKey(request: Request, discriminator?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) || "unknown-agent";
  return [forwardedFor || realIp || "local", userAgent, discriminator || "anonymous"].join("|");
}

export function enforceAuthRateLimit(request: Request, input: {
  bucket: string;
  discriminator?: string;
  limit?: number;
  windowSeconds?: number;
}) {
  return enforceEnterpriseApiRateLimit({
    bucket: input.bucket,
    key: requestClientKey(request, input.discriminator),
    limit: input.limit,
    windowSeconds: input.windowSeconds
  });
}

export function authSessionHeaders(context: SenaEnterpriseSessionContext, input: {
  flow: string;
  provider?: string;
  ssoProvider?: string;
  ssoMode?: "oauth-oidc" | "local-pilot-fallback";
}) {
  const primaryTeam = context.teams[0];
  const primaryMembership = context.memberships.find((membership) => membership.teamId === primaryTeam?.id) ?? context.memberships[0];
  return {
    "x-sena-auth-flow": input.flow,
    "x-sena-auth-user-id": context.user.id,
    "x-sena-auth-session-id": context.session.id,
    "x-sena-auth-session-profile": context.session.sessionProfile,
    "x-sena-auth-session-expires-at": context.session.expiresAt,
    ...(primaryTeam?.id ? { "x-sena-auth-team-id": primaryTeam.id } : {}),
    ...(primaryMembership?.role ? { "x-sena-auth-membership-role": primaryMembership.role } : {}),
    ...(input.provider ? { "x-sena-auth-provider": input.provider } : {}),
    ...(input.ssoProvider ? { "x-sena-sso-provider": input.ssoProvider } : {}),
    ...(input.ssoMode ? { "x-sena-sso-mode": input.ssoMode } : {}),
    ...authProductionGateHeaders()
  };
}

export function authProductionGateHeaders() {
  const identityEvidence = getEnterpriseIdentityProductionEvidence();
  return {
    "x-sena-auth-production-gate": identityEvidence.status,
    "x-sena-identity-production-status": identityEvidence.status,
    "x-sena-identity-release-gate-blocked": String(identityEvidence.releaseGate.approvalBlocked),
    "x-sena-identity-request-blockers": String(identityEvidence.platformRequestPacket.summary.blockingRequests),
    "x-sena-identity-production-blocking-decisions": identityEvidence.releaseGate.productionBlockingDecisionIds.join("|") || "none",
    "x-sena-identity-missing-evidence-ids": identityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none",
    "x-sena-identity-cutover-checklist": identityEvidence.cutoverChecklist.status,
    "x-sena-identity-cutover-blockers": String(identityEvidence.cutoverChecklist.summary.blockingItems),
    "x-sena-identity-rotation-freshness": identityEvidence.rotationFreshness.status,
    ...identityInstitutionActionPlanHeaders(identityEvidence)
  };
}

export function identityInstitutionActionPlanHeaders(
  identityEvidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence> = getEnterpriseIdentityProductionEvidence()
): Record<string, string> {
  const actionPlan = identityEvidence.institutionActionPlan;
  return {
    "x-sena-identity-institution-action-plan-digest": actionPlan.digest ?? "missing",
    "x-sena-identity-institution-action-plan-blocking-lanes": String(actionPlan.summary.blockingLanes),
    "x-sena-identity-institution-action-plan-ready-lanes": String(actionPlan.summary.readyLanes),
    "x-sena-identity-institution-action-plan-submission-path": actionPlan.summary.submissionPath,
    ...identityOwnerRunbookHeaders(actionPlan)
  };
}

export function identityOwnerRunbookHeaders(
  actionPlan?: Pick<SenaEnterpriseIdentityInstitutionActionPlan, "ownerRunbooks">
): Record<string, string> {
  const ownerRunbooks = actionPlan?.ownerRunbooks;
  if (!ownerRunbooks) return {};
  return {
    ...(ownerRunbooks.digest ? {
      "x-sena-identity-owner-runbook-digest": ownerRunbooks.digest
    } : {}),
    "x-sena-identity-owner-runbook-blocking": String(ownerRunbooks.summary.blockingRunbooks),
    "x-sena-identity-owner-runbook-preflight-checks": String(ownerRunbooks.summary.preflightChecks),
    "x-sena-identity-owner-runbook-submission-steps": String(ownerRunbooks.summary.submissionSteps),
    "x-sena-identity-owner-runbook-receipt-archive-steps": String(ownerRunbooks.summary.receiptArchiveSteps)
  };
}

export function sessionJson(
  context: SenaEnterpriseSessionContext,
  status = 200,
  headers: Record<string, string> = authSessionHeaders(context, { flow: "session-read" })
) {
  return NextResponse.json(sanitizeEnterpriseContext(context), { status, headers });
}
