import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  enforceEnterpriseApiRateLimit,
  enforceEnterpriseApiRateLimitAsync as enforceEnterpriseApiRateLimitOnPrimaryState
} from "./enterprise/auth-security";
import {
  senaCsrfHeaderName,
  requireEnterpriseSessionAsync,
  sanitizeEnterpriseContext,
  senaSessionCookieName,
  verifyEnterpriseCsrfTokenAsync,
  type SenaEnterpriseSessionContext
} from "./enterprise/auth-session";
import { enterpriseErrorResponse } from "./enterprise/errors";
import {
  emitEnterpriseObservedRequest,
  mirrorEnterpriseObservedRequestToPostgres,
  recordEnterpriseObservedRequest,
  type SenaEnterpriseObservedRequest
} from "./enterprise/ops-observability";
import { getEnterpriseIdentityProductionEvidence } from "./enterprise/identity-production-evidence";
import type { SenaEnterpriseIdentityInstitutionActionPlan } from "./enterprise/identity-action-plan";

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

function requestIdFromHeaders(request: Request) {
  return request.headers.get("x-request-id") ||
    request.headers.get("x-correlation-id") ||
    randomUUID();
}

function applyObservedRequestHeaders(response: Response, sample: SenaEnterpriseObservedRequest) {
  response.headers.set("x-sena-request-id-hash", sample.requestIdHash);
  response.headers.set("x-sena-observed-route", sample.routeId);
  response.headers.set("x-sena-observed-status-class", sample.statusClass);
  response.headers.set("x-sena-observed-duration-ms", String(sample.durationMs));
  response.headers.set("server-timing", `sena;dur=${sample.durationMs}`);
  return response;
}

export async function observeSenaApiRoute(
  request: Request,
  input: {
    routeId: string;
    /**
     * Rewrites the error body for surfaces that owe callers a different envelope
     * (SCIM clients expect urn:ietf:params:scim:api:messages:2.0:Error). Status and
     * the observed error code are taken before this runs, so observability is
     * unaffected by the shape a route chooses to emit.
     */
    errorBody?: (body: { error: string; code: string }, status: number) => unknown;
  },
  handler: () => Promise<Response> | Response
) {
  const startedAt = Date.now();
  const requestId = requestIdFromHeaders(request);
  try {
    const response = await handler();
    const sample = recordEnterpriseObservedRequest({
      routeId: input.routeId,
      method: request.method,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      requestId
    });
    emitEnterpriseObservedRequest(sample);
    void mirrorEnterpriseObservedRequestToPostgres(sample);
    return applyObservedRequestHeaders(response, sample);
  } catch (error) {
    const enterpriseError = enterpriseErrorResponse(error);
    const sample = recordEnterpriseObservedRequest({
      routeId: input.routeId,
      method: request.method,
      statusCode: enterpriseError.status,
      durationMs: Date.now() - startedAt,
      requestId,
      errorCode: enterpriseError.body.code
    });
    emitEnterpriseObservedRequest(sample);
    void mirrorEnterpriseObservedRequestToPostgres(sample);
    return applyObservedRequestHeaders(
      NextResponse.json(
        input.errorBody ? input.errorBody(enterpriseError.body, enterpriseError.status) : enterpriseError.body,
        { status: enterpriseError.status }
      ),
      sample
    );
  }
}

export async function currentSessionToken() {
  return (await cookies()).get(senaSessionCookieName)?.value;
}

export async function requireApiSession(): Promise<SenaEnterpriseSessionContext> {
  return requireEnterpriseSessionAsync(await currentSessionToken());
}

export async function requireApiCsrf(request: Request, context: SenaEnterpriseSessionContext) {
  return verifyEnterpriseCsrfTokenAsync(context, request.headers.get(senaCsrfHeaderName));
}

export async function requireApiSessionForMutation(request: Request): Promise<SenaEnterpriseSessionContext> {
  const context = await requireApiSession();
  await requireApiCsrf(request, context);
  return context;
}

function requestClientKey(request: Request, discriminator?: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  // Every distinct key gets its own counter, so anything an attacker can vary
  // freely must stay out of it — a User-Agent here let one client mint unlimited
  // fresh buckets, which is why it was removed.
  //
  // The IP component is NOT in that safe category on its own, and saying otherwise
  // is what this comment used to do. Both headers are client-supplied; the
  // left-most x-forwarded-for value is only trustworthy when every request reaches
  // this handler through a proxy that overwrites the header rather than appending
  // to it. Behind such a proxy (Vercel's edge, an ingress that rewrites XFF) the
  // key is sound. Deployed with the app directly reachable, a caller can vary
  // x-forwarded-for per request and split these buckets exactly as a rotated
  // User-Agent did. Taking the right-most hop instead is not a general fix: which
  // entry is trustworthy depends on how many proxies are in front, so it would
  // trade one wrong assumption for another.
  //
  // The per-subject backstops are what hold when this assumption does not:
  // recordFailedLogin on login, and the password-reset and registration subject
  // budgets. Those are keyed on the account, which an attacker cannot vary.
  return [forwardedFor || realIp || "local", discriminator || "anonymous"].join("|");
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

export async function enforceAuthRateLimitAsync(request: Request, input: {
  bucket: string;
  discriminator?: string;
  limit?: number;
  windowSeconds?: number;
}) {
  return enforceEnterpriseApiRateLimitOnPrimaryState({
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
