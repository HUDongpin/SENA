import { createHash, timingSafeEqual } from "node:crypto";
import { requireApiCsrf, requireApiSession } from "./api-helpers";
import { SenaEnterpriseError } from "./enterprise";
import { hasEnterprisePermission, requireEnterprisePermission } from "./enterprise/access-control";
import type { SenaEnterpriseSessionContext } from "./enterprise/auth-session";

function hashToken(value: string) {
  return createHash("sha256").update(value).digest();
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

function configuredOpsTokens() {
  return [
    process.env.SENA_OPS_TOKEN?.trim(),
    process.env.SENA_OPS_AUTOMATION_TOKEN?.trim()
  ].filter((value): value is string => Boolean(value));
}

function opsTokenMatches(configuredTokens: string[], provided: string) {
  const providedHash = hashToken(provided);
  return configuredTokens.some((configured) => timingSafeEqual(hashToken(configured), providedHash));
}

/**
 * Ops surfaces serve two callers with incompatible credentials: automation
 * (deployment monitors, the job worker) holding SENA_OPS_TOKEN, and a signed-in
 * human in the workspace UI. A browser must never hold an ops token, so making
 * the token the only accepted credential locks humans out — and the production
 * deployment checklist marks SENA_OPS_TOKEN required, so the compliant
 * production configuration answered 401 from every ops panel.
 *
 * Both paths are therefore accepted concurrently, and neither weakens the other:
 * a supplied bearer token is still judged against the configured tokens alone,
 * and the session path is gated by RBAC rather than by "is anyone signed in".
 */

/**
 * Ops panels are a team-administration surface, so the session gate reuses the
 * permission the rest of the enterprise ops surface already requires:
 * lib/sena/enterprise/server-job-queue.ts scopes session-mode job access on it,
 * and lib/sena/enterprise/ops-platform-decisions.ts gates the native adapter
 * certification read behind it. One permission across the ops surfaces matters
 * more than widening this one gate — note that `admin` does not carry
 * team:manage in rolePermissions, so ops access here means owner/PI.
 */
const opsSessionPermission = "team:manage" as const;

/**
 * Team-scoped ops routes name the team the caller is acting for as a query
 * parameter — see app/api/sena/ops/native-adapters/route.ts and
 * app/api/sena/ops/jobs/route.ts, which both re-check it downstream. The body is
 * deliberately not read here: the route still has to consume it.
 */
function requestedOpsTeamId(request: Request) {
  try {
    return new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fails closed in every branch. A named team must be one the caller administers;
 * a deployment-wide read (ops status, readiness, alerts carry no team at all)
 * still requires the caller to administer some team, so a signed-in member with
 * no operator role anywhere is refused rather than silently passed.
 */
function requireOpsSessionPermission(request: Request, context: SenaEnterpriseSessionContext) {
  const requestedTeamId = requestedOpsTeamId(request);
  if (requestedTeamId) {
    requireEnterprisePermission(context, requestedTeamId, opsSessionPermission);
    return;
  }
  const administersAnyTeam = context.memberships.some((membership) => (
    membership.status === "active" &&
    hasEnterprisePermission(context, membership.teamId, opsSessionPermission)
  ));
  if (!administersAnyTeam) {
    throw new SenaEnterpriseError("Your SENA role does not allow this action.", 403, "permission_denied");
  }
}

async function opsSessionAccess(request: Request, input: { mutation: boolean }) {
  const context = await requireApiSession();
  // CSRF stays ahead of the RBAC answer: a cookie-authenticated mutation without
  // the header is the hole this parallel path must not open.
  if (input.mutation) await requireApiCsrf(request, context);
  requireOpsSessionPermission(request, context);
  return { mode: "session" as const };
}

async function resolveOpsAccess(request: Request, input: { mutation: boolean }) {
  const configuredTokens = configuredOpsTokens();
  if (configuredTokens.length === 0) {
    return await opsSessionAccess(request, input);
  }
  const provided = bearerToken(request);
  if (provided) {
    // Bearer semantics are untouched: a supplied token is the whole decision,
    // and an invalid one never falls through to the session path.
    if (!opsTokenMatches(configuredTokens, provided)) {
      throw new SenaEnterpriseError("Ops bearer token is invalid.", 401, "ops_token_invalid");
    }
    return { mode: "bearer" as const };
  }
  try {
    return await opsSessionAccess(request, input);
  } catch (error) {
    // Session and RBAC refusals surface as themselves (401 auth, 403 CSRF/role).
    // Anything else means there is no session context to evaluate at all, which
    // is the automation caller who simply forgot the token.
    if (error instanceof SenaEnterpriseError) throw error;
    throw new SenaEnterpriseError("Ops bearer token is required.", 401, "ops_token_required");
  }
}

export async function requireOpsAccess(request: Request) {
  return await resolveOpsAccess(request, { mutation: false });
}

export async function requireOpsMutationAccess(request: Request) {
  return await resolveOpsAccess(request, { mutation: true });
}
