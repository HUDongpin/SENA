import { createHash, timingSafeEqual } from "node:crypto";
import { requireApiCsrf, requireApiSession } from "./api-helpers";
import { SenaEnterpriseError } from "./enterprise";
import { requireEnterprisePermission } from "./enterprise/access-control";
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
 * and the session path is gated by what the caller actually is rather than by
 * "is anyone signed in" — or, as an earlier repair had it, by a permission that
 * open registration hands out for free. See the operator-signal note below.
 *
 * The resulting gate, in one place:
 *
 *   bearer supplied, tokens configured  → the token is the whole decision
 *   request names ?teamId=              → session + team:manage on THAT team
 *   team-less report                    → session + designated ops operator
 *   team-less mutation or live probe    → bearer only while tokens are configured
 */

/**
 * The ops surface has two dimensions, and one permission cannot serve both.
 *
 * A request that NAMES a team is team administration, so it reuses the
 * permission the rest of the enterprise ops surface already requires:
 * lib/sena/enterprise/server-job-queue.ts scopes session-mode job access on it,
 * and lib/sena/enterprise/ops-platform-decisions.ts gates the native adapter
 * certification read behind it. Note that `admin` does not carry team:manage in
 * rolePermissions, so team-scoped ops access here means owner/PI of that team.
 */
const opsSessionPermission = "team:manage" as const;

/**
 * A request that names NO team is deployment administration, and team:manage is
 * worthless as a gate for it: registration is open and unauthenticated
 * (app/api/auth/register), and a registrant with no invite code is made `owner`
 * of a brand-new active team (lib/sena/enterprise/auth-registration.ts), which
 * carries team:manage. "Administers some team" is therefore a self-service
 * claim — anyone on the internet mints one with a throwaway address, and the
 * 201 hands them the session cookie on the spot.
 *
 * The deployment-wide surface needs a signal only whoever deploys SENA can
 * emit. Of the candidates, this env allowlist is the one nothing inside the
 * product can grant itself:
 *
 *   - A dedicated ops role would live in `rolePermissions`, and every team
 *     owner can already mint arbitrary roles through invitations — the attacker
 *     invites a second throwaway account into their own team and is an operator.
 *   - A designated platform-owner team id is unmintable, but the id is a
 *     generated `team_…` value that does not exist until after the deployment
 *     has data, so it cannot be configured at deploy time, and it changes if
 *     the store is ever re-seeded.
 *   - This allowlist is set beside SENA_OPS_TOKEN in the same deploy-time
 *     config, is stable across re-seeds, and no in-product action reaches it.
 *
 * OPERATOR-VISIBLE COST: a deployment that wants humans in the ops panels must
 * now set SENA_OPS_SESSION_OPERATOR_EMAILS in addition to SENA_OPS_TOKEN. That
 * is one more env var; leaving it unset fails closed (no session reaches the
 * deployment-wide panels) rather than open.
 *
 * Emails are compared, not verified — this is an identity allowlist, not a
 * credential, and the caller has already authenticated with a session before it
 * is consulted. Addresses are lowercased on both sides because registration
 * stores them normalized (auth-registration.ts calls normalizeEmail).
 */
const opsSessionOperatorEnv = "SENA_OPS_SESSION_OPERATOR_EMAILS";

function designatedOpsOperators() {
  return (process.env[opsSessionOperatorEnv] || "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isDesignatedOpsOperator(context: SenaEnterpriseSessionContext) {
  const email = context.user.email?.trim().toLowerCase();
  if (!email) return false;
  // Whole-string membership, never a prefix/substring test: an unset allowlist
  // is an empty list, which matches nothing.
  return designatedOpsOperators().includes(email);
}

/**
 * Deployment-wide ops routes that do not merely report — they dispatch a signed
 * payload outward with the deployment's own credentials, or write against the
 * live backend:
 *
 *   jobs/probe          dispatches a synthetic job to the configured queue provider
 *   observability/probe sends a signed synthetic SLI sample to the exporter
 *   cdn                 fetches the configured CDN verification target
 *   postgres            creates a probe table, inserts, selects, deletes
 *   object-storage      PUTs, HEADs and DELETEs a probe object in the bucket
 *
 * They are shaped as GETs, so the mutation flag does not catch them; the effect
 * is what matters, not the verb. Together with every team-less mutation (the
 * `/ops/alerts` deliver webhook, the worker heartbeat) these stay bearer-only
 * while ops tokens are configured, which is exactly what they answered before
 * the session path existed. A browser session is a stealable credential, and
 * these are the ops actions an attacker would want: an alert-channel flood, a
 * queue dispatch, a synthetic job written into the shared store.
 */
const deploymentWideOpsDispatchPaths = new Set([
  "/api/sena/ops/cdn",
  "/api/sena/ops/jobs/probe",
  "/api/sena/ops/object-storage",
  "/api/sena/ops/observability/probe",
  "/api/sena/ops/postgres"
]);

function requestPath(request: Request) {
  try {
    return new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
}

/**
 * Ops routes that ARE team-dimensioned but carry the team in the request body:
 * app/api/sena/ops/jobs/route.ts reads teamId from the POST body first and only
 * falls back to the query string. A missing query teamId there is an incomplete
 * team-scoped request, not a deployment-wide one, so treating it as deployment-
 * wide would both misjudge it and break the jobs panel's own mutations.
 *
 * This layer cannot read the body to tell the difference — the route still has
 * to consume it — so these delegate the team check downstream instead, to
 * lib/sena/enterprise/server-job-queue.ts, which resolves the caller scope
 * against the caller's own memberships and refuses anything outside it. That
 * check is real and independently pinned by
 * lib/sena/__tests__/server-job-ops-team-scope.test.ts: an unscoped session list
 * is refused 400 rather than returning the estate, a foreign team 403, a foreign
 * job 403, and the queue layer itself refuses a scope carrying no team:manage.
 *
 * The delegation is therefore narrow and evidenced, not a hole: a session caller
 * reaches this route without naming a team, and receives no other team's data.
 */
const teamScopedOpsPathsCheckedDownstream = new Set([
  "/api/sena/ops/jobs"
]);

function teamCheckedDownstream(request: Request) {
  return teamScopedOpsPathsCheckedDownstream.has(requestPath(request));
}

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
 * Fails closed in every branch, and judges the two dimensions separately.
 *
 * A named team must be one the caller administers — and only that. Being a
 * designated operator is a claim about the deployment, not a master key into
 * other people's teams; cross-team ops reads are the bearer token's job.
 *
 * A deployment-wide read (ops status, readiness, metrics, evidence manifests
 * carry no team at all) requires the operator designation instead. Team
 * administration buys nothing here, because self-registration hands it out.
 */
function requireOpsSessionPermission(request: Request, context: SenaEnterpriseSessionContext) {
  const requestedTeamId = requestedOpsTeamId(request);
  if (requestedTeamId) {
    requireEnterprisePermission(context, requestedTeamId, opsSessionPermission);
    return;
  }
  if (teamCheckedDownstream(request)) return;
  if (!isDesignatedOpsOperator(context)) {
    throw new SenaEnterpriseError(
      `Deployment-wide SENA ops access requires an operator named in ${opsSessionOperatorEnv}.`,
      403,
      "ops_operator_required"
    );
  }
}

/**
 * True for the deployment-wide actions that must keep answering "bring the
 * token" to a cookie, regardless of who the cookie belongs to. Scoped by the
 * absence of a team dimension, so a team-scoped ops mutation — the jobs panel
 * retrying its own team's job — still runs on the session path, whether it names
 * the team in the query or downstream.
 *
 * Every other team-less mutation defaults to bearer-only, which is the direction
 * this should fail in: a deployment-wide ops mutation added later is covered
 * without an edit here.
 */
function bearerOnlyOpsAction(request: Request, input: { mutation: boolean }) {
  if (requestedOpsTeamId(request) || teamCheckedDownstream(request)) return false;
  return input.mutation || deploymentWideOpsDispatchPaths.has(requestPath(request));
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
  if (bearerOnlyOpsAction(request, input)) {
    // Answered before the session path existed, and answered again now: the
    // deployment-wide dispatching surface is automation's, not a browser's.
    // Thrown ahead of requireApiSession so the response does not depend on
    // whether a cookie happened to be attached.
    throw new SenaEnterpriseError("Ops bearer token is required.", 401, "ops_token_required");
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
