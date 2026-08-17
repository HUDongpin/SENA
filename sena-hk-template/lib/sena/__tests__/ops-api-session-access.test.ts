import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A1 (availability half): `requireOpsAccess` fell back to session auth only when
 * zero ops tokens were configured, so the moment SENA_OPS_TOKEN was set — which
 * the production deployment checklist marks required — every ops panel answered
 * 401 to a signed-in administrator, because a browser cannot carry an ops token.
 *
 * A1 (confidentiality half): the first repair gated that session path on "the
 * caller administers *some* team", which registration mints for free —
 * app/api/auth/register accepts anyone, and a registrant with no invite code is
 * made `owner` of a brand-new active team (lib/sena/enterprise/auth-registration.ts).
 * `owner` carries team:manage, so that gate admitted any anonymous registrant to
 * every deployment-wide ops read and to the alert-delivery webhook.
 *
 * These tests pin the split the two halves force:
 *   - a request that NAMES a team keeps per-team team:manage;
 *   - the team-less, deployment-wide surface requires a designated ops operator
 *     (SENA_OPS_SESSION_OPERATOR_EMAILS), a signal registration cannot mint;
 *   - deployment-wide actions that dispatch outward stay bearer-only while ops
 *     tokens are configured;
 *   - bearer is untouched throughout.
 */

const operatorEnvName = "SENA_OPS_SESSION_OPERATOR_EMAILS";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_OPS_TOKEN",
  "SENA_OPS_AUTOMATION_TOKEN",
  operatorEnvName
];

const opsToken = "sena-primary-ops-token";
const automationToken = "sena-automation-ops-token";

type AccessBody = { code?: string; access?: { mode?: string } };

let sessionToken = "";

function mockSessionCookie() {
  vi.doMock("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));
}

function unmockSessionCookie() {
  vi.doUnmock("next/headers");
  vi.doUnmock("@/lib/sena/enterprise");
  vi.doUnmock("@/lib/sena/api-helpers");
  vi.doUnmock("@/lib/sena/ops-api");
}

/**
 * Three callers, because the gate has to separate three things that the first
 * repair conflated:
 *
 *   owner    — administers the deployment's team. Legitimate, but being a team
 *              administrator is not by itself a deployment-operator claim.
 *   member   — invited `coder`, no team of their own. The easy refusal.
 *   outsider — signs up at /api/auth/register with a throwaway address and no
 *              invite code, which makes them `owner` of a brand-new active team.
 *              This is the actual attacker: unaffiliated, unauthorised, and
 *              holding team:manage from the moment the 201 sets their cookie.
 */
async function seedOpsCallers(slug: string) {
  const enterprise = await import("../enterprise");
  const owner = enterprise.registerEnterpriseUser({
    name: `Ops Owner ${slug}`,
    email: `ops-access-owner-${slug}@example.edu`,
    password: "sena-secure-123",
    organization: `Ops Access Lab ${slug}`,
    plan: "enterprise"
  });
  const teamId = owner.context.teams[0].id;
  const invitation = enterprise.createEnterpriseInvitation(owner.context, {
    teamId,
    email: `ops-access-member-${slug}@example.edu`,
    role: "coder"
  });
  const member = enterprise.registerEnterpriseUser({
    name: `Ops Member ${slug}`,
    email: `ops-access-member-${slug}@example.edu`,
    password: "sena-secure-123",
    organization: `Ops Access Lab ${slug}`,
    inviteCode: invitation.inviteCode
  });
  // The member must have no manageable team anywhere, or the gate would pass
  // them for deployment-wide reads for the wrong reason.
  expect(member.context.memberships.map((membership) => membership.role)).toEqual(["coder"]);
  expect(member.context.teams.map((team) => team.id)).toEqual([teamId]);

  const outsider = enterprise.registerEnterpriseUser({
    name: `Ops Outsider ${slug}`,
    email: `ops-access-outsider-${slug}@throwaway.example`,
    password: "sena-secure-123",
    organization: `Throwaway ${slug}`
  });
  // Pin what open registration actually hands an anonymous stranger, so this
  // suite fails loudly if the shape the gate must refuse ever changes.
  expect(outsider.context.memberships.map((membership) => membership.role)).toEqual(["owner"]);
  expect(outsider.context.memberships.map((membership) => membership.status)).toEqual(["active"]);
  expect(outsider.context.teams).toHaveLength(1);
  expect(outsider.context.teams[0].id).not.toBe(teamId);

  return { enterprise, owner, member, outsider, teamId, outsiderTeamId: outsider.context.teams[0].id };
}

function designate(...emails: string[]) {
  process.env[operatorEnvName] = emails.join(",");
}

describe("SENA ops API session access", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    unmockSessionCookie();
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    sessionToken = "";
    vi.resetModules();
  });

  it("accepts a designated ops operator on the deployment-wide surface while ops tokens are configured", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-operator-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { owner, teamId } = await seedOpsCallers("operator");
    designate(owner.context.user.email);
    sessionToken = owner.token;

    const { requireOpsAccess } = await import("../ops-api");

    // The deployment-wide reads carry no team at all: status, readiness,
    // production evidence. The designated operator reaches all of them.
    for (const route of ["status", "readiness", "production-evidence"]) {
      await expect(requireOpsAccess(new Request(`https://sena.example.test/api/sena/ops/${route}`)))
        .resolves.toEqual({ mode: "session" });
    }

    // A team-scoped ops read names the team the caller is acting for.
    await expect(requireOpsAccess(new Request(
      `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`
    ))).resolves.toEqual({ mode: "session" });

    // ...and the panel itself answers, rather than 401-ing the way it did when
    // the bearer token was the only accepted credential.
    const route = await import("../../../app/api/sena/ops/native-adapters/route");
    const response = await route.GET(new Request(
      `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`
    ));
    const body = await response.json() as AccessBody;
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.access?.mode).toBe("session");

    // Case and surrounding whitespace in the allowlist are configuration noise,
    // not an access decision — registration lowercases the stored address.
    designate(`  ${owner.context.user.email.toUpperCase()}  `, "someone-else@example.edu");
    await expect(requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status")))
      .resolves.toEqual({ mode: "session" });
  });

  it("refuses a self-registered owner on the deployment-wide surface", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-outsider-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { owner, outsider } = await seedOpsCallers("outsider");
    designate(owner.context.user.email);

    const { requireOpsAccess } = await import("../ops-api");

    // The attacker: registered thirty seconds ago, owner of nothing but their
    // own workspace, holding team:manage on it. Every team-less ops read must
    // refuse them — these expose readiness blockers, storage and backup health,
    // hashed webhook endpoints, and the production evidence manifest.
    sessionToken = outsider.token;
    for (const route of ["status", "readiness", "metrics", "production-evidence", "observability"]) {
      await expect(
        requireOpsAccess(new Request(`https://sena.example.test/api/sena/ops/${route}`)),
        `deployment-wide read /${route} must refuse a self-registered owner`
      ).rejects.toMatchObject({ status: 403, code: "ops_operator_required" });
    }

    // The live probes are refused too, one layer earlier: they dispatch outward,
    // so no session reaches them at all while ops tokens are configured.
    for (const route of ["postgres", "object-storage", "cdn"]) {
      await expect(
        requireOpsAccess(new Request(`https://sena.example.test/api/sena/ops/${route}`)),
        `live probe /${route} must refuse a self-registered owner`
      ).rejects.toMatchObject({ status: 401, code: "ops_token_required" });
    }

    // Naming a team they do own does not buy the deployment-wide surface either:
    // that request is judged against *that* team, and the ops panels are not it.
    await expect(requireOpsAccess(new Request(
      `https://sena.example.test/api/sena/ops/status?teamId=${encodeURIComponent(outsider.context.teams[0].id)}`
    ))).resolves.toEqual({ mode: "session" });

    // Administering a team is likewise not an operator claim in itself: the
    // deployment's own team owner is refused too while somebody else is the
    // named operator. team:manage is not what opens this surface any more.
    designate("someone-else@example.edu");
    sessionToken = owner.token;
    await expect(requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status")))
      .rejects.toMatchObject({ status: 403, code: "ops_operator_required" });

    // An allowlist that names somebody else does not admit the outsider by
    // prefix, suffix, or substring.
    sessionToken = outsider.token;
    for (const allowlist of [
      "", // unset deployment: fails closed rather than open
      "ops-access-outsider-outsider@throwaway.example.attacker.test",
      "outsider-outsider@throwaway.example",
      `x${outsider.context.user.email}`
    ]) {
      process.env[operatorEnvName] = allowlist;
      await expect(
        requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status")),
        `allowlist ${JSON.stringify(allowlist)} must not admit the outsider`
      ).rejects.toMatchObject({ status: 403 });
    }

    // The route answers the refusal, and leaks no ops payload with it.
    designate(owner.context.user.email);
    sessionToken = outsider.token;
    const route = await import("../../../app/api/sena/ops/status/route");
    const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/status"));
    const body = await response.json() as AccessBody;
    expect(response.status, JSON.stringify(body)).toBe(403);
    expect(body.access).toBeUndefined();
  });

  it("keeps team-scoped ops reads on per-team team:manage", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-team-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { member, outsider, owner, teamId } = await seedOpsCallers("team");
    const teamUrl = `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`;

    const { requireOpsAccess } = await import("../ops-api");

    // A member of the team without team:manage: a permission failure, not a filter.
    designate(owner.context.user.email);
    sessionToken = member.token;
    await expect(requireOpsAccess(new Request(teamUrl)))
      .rejects.toMatchObject({ status: 403, code: "permission_denied" });

    // The self-registered outsider is an owner — of a different team.
    sessionToken = outsider.token;
    await expect(requireOpsAccess(new Request(teamUrl)))
      .rejects.toMatchObject({ status: 403, code: "permission_denied" });

    // Being a designated operator is a claim about the deployment, not a
    // master key into other people's teams.
    designate(outsider.context.user.email);
    await expect(requireOpsAccess(new Request(teamUrl)))
      .rejects.toMatchObject({ status: 403, code: "permission_denied" });

    // The team's own administrator passes without any operator designation.
    process.env[operatorEnvName] = "";
    sessionToken = owner.token;
    await expect(requireOpsAccess(new Request(teamUrl))).resolves.toEqual({ mode: "session" });

    const route = await import("../../../app/api/sena/ops/native-adapters/route");
    sessionToken = member.token;
    const response = await route.GET(new Request(teamUrl));
    const body = await response.json() as AccessBody;
    expect(response.status, JSON.stringify(body)).toBe(403);
    expect(body.code).toBe("permission_denied");
    expect(body.access).toBeUndefined();

    // /ops/jobs is team-dimensioned but carries teamId in the POST body, so this
    // layer cannot see it and delegates the team check to the queue layer. That
    // delegation must stay a delegation and never a bypass: the self-registered
    // outsider gets no estate-wide listing out of it.
    const jobsRoute = await import("../../../app/api/sena/ops/jobs/route");
    sessionToken = outsider.token;
    const jobsResponse = await jobsRoute.GET(new Request("https://sena.example.test/api/sena/ops/jobs"));
    const jobsBody = await jobsResponse.json() as AccessBody & { jobs?: unknown[] };
    expect(jobsResponse.status, JSON.stringify(jobsBody)).toBe(400);
    expect(jobsBody.code).toBe("server_job_team_required");
    expect(jobsBody.jobs).toBeUndefined();

    // Naming somebody else's team is still judged here, before the route runs.
    await expect(requireOpsAccess(new Request(
      `https://sena.example.test/api/sena/ops/jobs?teamId=${encodeURIComponent(teamId)}`
    ))).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });

  it("keeps deployment-wide ops actions bearer-only while ops tokens are configured", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-actions-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { enterprise, owner, outsider } = await seedOpsCallers("actions");
    // The most privileged session the deployment can produce: a designated
    // operator, holding a genuine CSRF token for their own session. Even that
    // must not reach an action that dispatches outward.
    designate(owner.context.user.email);
    sessionToken = owner.token;
    const csrf = enterprise.createEnterpriseCsrfToken(owner.context);

    const { requireOpsAccess, requireOpsMutationAccess } = await import("../ops-api");

    // POST /ops/alerts {"action":"deliver"} signs and sends a webhook to
    // SENA_ALERT_WEBHOOK_URL; the worker heartbeat writes a synthetic job into
    // the shared store. Both answered 401 before the session path existed.
    for (const url of [
      "https://sena.example.test/api/sena/ops/alerts",
      "https://sena.example.test/api/sena/ops/jobs/worker-heartbeat"
    ]) {
      await expect(requireOpsMutationAccess(new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sena-csrf-token": csrf.token }
      })), url).rejects.toMatchObject({ status: 401, code: "ops_token_required" });
    }

    // GET-shaped but side-effecting: these dispatch a signed synthetic payload
    // to the configured provider, or write and delete against the live backend.
    for (const route of ["jobs/probe", "observability/probe", "cdn", "postgres", "object-storage"]) {
      await expect(
        requireOpsAccess(new Request(`https://sena.example.test/api/sena/ops/${route}`)),
        route
      ).rejects.toMatchObject({ status: 401, code: "ops_token_required" });
    }

    // The outsider gains nothing from the same routes.
    sessionToken = outsider.token;
    await expect(requireOpsMutationAccess(new Request("https://sena.example.test/api/sena/ops/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" }
    }))).rejects.toMatchObject({ status: 401, code: "ops_token_required" });

    // Automation still delivers, on the token.
    sessionToken = "";
    await expect(requireOpsMutationAccess(new Request("https://sena.example.test/api/sena/ops/alerts", {
      method: "POST",
      headers: { authorization: `Bearer ${opsToken}`, "content-type": "application/json" }
    }))).resolves.toEqual({ mode: "bearer" });

    // ...and the route says so rather than delivering for a session caller.
    sessionToken = owner.token;
    const route = await import("../../../app/api/sena/ops/alerts/route");
    const response = await route.POST(new Request("https://sena.example.test/api/sena/ops/alerts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sena-csrf-token": csrf.token },
      body: JSON.stringify({ action: "deliver" })
    }));
    const body = await response.json() as AccessBody;
    expect(response.status, JSON.stringify(body)).toBe(401);
    expect(body.code).toBe("ops_token_required");
    expect(body.access).toBeUndefined();
  });

  it("applies the same split in the tokenless configuration", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-tokenless-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    // No ops tokens configured: the session path is the only path, and the
    // deployment-wide surface is gated by the same operator signal it is gated
    // by in token mode. There is no configuration in which team:manage alone
    // opens the deployment-wide reads.

    vi.resetModules();
    mockSessionCookie();

    const { member, outsider, owner, teamId } = await seedOpsCallers("tokenless");
    const teamUrl = `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`;
    const statusUrl = "https://sena.example.test/api/sena/ops/status";

    const { requireOpsAccess } = await import("../ops-api");

    sessionToken = member.token;
    await expect(requireOpsAccess(new Request(teamUrl)))
      .rejects.toMatchObject({ status: 403, code: "permission_denied" });

    sessionToken = owner.token;
    await expect(requireOpsAccess(new Request(teamUrl))).resolves.toEqual({ mode: "session" });

    // Team administration still does not reach the deployment-wide surface.
    await expect(requireOpsAccess(new Request(statusUrl))).rejects.toMatchObject({ status: 403 });

    sessionToken = outsider.token;
    await expect(requireOpsAccess(new Request(statusUrl))).rejects.toMatchObject({ status: 403 });

    designate(owner.context.user.email);
    sessionToken = owner.token;
    await expect(requireOpsAccess(new Request(statusUrl))).resolves.toEqual({ mode: "session" });

    sessionToken = outsider.token;
    await expect(requireOpsAccess(new Request(statusUrl))).rejects.toMatchObject({ status: 403 });
  });

  it("leaves the bearer path unchanged and unaffected by session state", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-bearer-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { member, outsider, owner } = await seedOpsCallers("bearer");
    designate(owner.context.user.email);

    const { requireOpsAccess, requireOpsMutationAccess } = await import("../ops-api");
    const statusUrl = "https://sena.example.test/api/sena/ops/status";

    for (const token of [opsToken, automationToken]) {
      // No session at all: the monitor/worker case.
      sessionToken = "";
      await expect(requireOpsAccess(new Request(statusUrl, {
        headers: { authorization: `Bearer ${token}` }
      }))).resolves.toEqual({ mode: "bearer" });

      // A session that would itself be refused does not downgrade the token —
      // whether it is a non-administrator or the self-registered outsider.
      for (const refused of [member.token, outsider.token]) {
        sessionToken = refused;
        await expect(requireOpsAccess(new Request(statusUrl, {
          headers: { authorization: `Bearer ${token}` }
        }))).resolves.toEqual({ mode: "bearer" });
      }

      // ...nor does a session that would itself be accepted upgrade it.
      sessionToken = owner.token;
      await expect(requireOpsAccess(new Request(statusUrl, {
        headers: { authorization: `Bearer ${token}` }
      }))).resolves.toEqual({ mode: "bearer" });
    }

    // Bearer mutations stay CSRF-free: an automation caller holds no cookie.
    sessionToken = "";
    await expect(requireOpsMutationAccess(new Request(statusUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${opsToken}`, "content-type": "application/json" }
    }))).resolves.toEqual({ mode: "bearer" });

    // A bad token is still refused outright — it must never fall through to the
    // session path, however privileged the signed-in caller happens to be.
    for (const candidateSession of ["", member.token, outsider.token, owner.token]) {
      sessionToken = candidateSession;
      await expect(requireOpsAccess(new Request(statusUrl, {
        headers: { authorization: "Bearer wrong-token" }
      }))).rejects.toMatchObject({ status: 401, code: "ops_token_invalid" });
    }
  });

  it("keeps the CSRF requirement on session mutations while ops tokens are configured", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-csrf-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { enterprise, owner, teamId } = await seedOpsCallers("csrf");
    designate(owner.context.user.email);
    sessionToken = owner.token;

    const { requireOpsMutationAccess } = await import("../ops-api");
    // Team-scoped, so the session path is the accepted one here and CSRF is the
    // check under test rather than the bearer-only refusal.
    const mutationUrl = `https://sena.example.test/api/sena/ops/go-live-rehearsal?teamId=${encodeURIComponent(teamId)}`;

    // A cookie-authenticated mutation with no CSRF header is exactly the hole
    // the parallel session path must not open.
    await expect(requireOpsMutationAccess(new Request(mutationUrl, {
      method: "POST",
      headers: { "content-type": "application/json" }
    }))).rejects.toMatchObject({ status: 403, code: "csrf_invalid" });

    await expect(requireOpsMutationAccess(new Request(mutationUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sena-csrf-token": "forged-csrf-token" }
    }))).rejects.toMatchObject({ status: 403, code: "csrf_invalid" });

    const csrf = enterprise.createEnterpriseCsrfToken(owner.context);
    await expect(requireOpsMutationAccess(new Request(mutationUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sena-csrf-token": csrf.token }
    }))).resolves.toEqual({ mode: "session" });
  });
});
