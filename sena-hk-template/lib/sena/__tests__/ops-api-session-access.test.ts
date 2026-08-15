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
 * These tests pin the two paths running concurrently: bearer unchanged for
 * automation, and a session path that is gated by the same RBAC permission the
 * rest of the enterprise ops surface uses rather than by "is anyone signed in".
 */

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_OPS_TOKEN",
  "SENA_OPS_AUTOMATION_TOKEN"
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
 * An owner administering their own team, plus a member invited into that same
 * team with a role that carries no team-administration right and no team of
 * their own — the "signed in but not an operator" caller.
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
  return { enterprise, owner, member, teamId };
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

  it("accepts a signed-in team administrator while ops tokens are configured", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-admin-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { owner, teamId } = await seedOpsCallers("admin");
    sessionToken = owner.token;

    const { requireOpsAccess } = await import("../ops-api");

    // A deployment-wide ops read carries no team at all: ops status, readiness,
    // alerts. The administrator is still an operator, so it must be accepted.
    await expect(requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status")))
      .resolves.toEqual({ mode: "session" });

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
  });

  it("refuses a signed-in member who does not administer the team", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-member-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { member, teamId } = await seedOpsCallers("member");
    sessionToken = member.token;

    const { requireOpsAccess } = await import("../ops-api");

    // Naming the team is a permission failure, not a filter.
    await expect(requireOpsAccess(new Request(
      `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`
    ))).rejects.toMatchObject({ status: 403, code: "permission_denied" });

    // And omitting the team does not buy an unscoped pass.
    await expect(requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status")))
      .rejects.toMatchObject({ status: 403, code: "permission_denied" });

    const route = await import("../../../app/api/sena/ops/native-adapters/route");
    const response = await route.GET(new Request(
      `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`
    ));
    const body = await response.json() as AccessBody;
    expect(response.status, JSON.stringify(body)).toBe(403);
    expect(body.code).toBe("permission_denied");
    expect(body.access).toBeUndefined();
  });

  it("refuses a signed-in non-administrator in the tokenless configuration too", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-tokenless-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    // No ops tokens configured: the session path is the only path, and it is
    // gated by the same permission it is gated by in token mode.

    vi.resetModules();
    mockSessionCookie();

    const { member, owner, teamId } = await seedOpsCallers("tokenless");

    const { requireOpsAccess } = await import("../ops-api");

    sessionToken = member.token;
    await expect(requireOpsAccess(new Request(
      `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`
    ))).rejects.toMatchObject({ status: 403, code: "permission_denied" });

    sessionToken = owner.token;
    await expect(requireOpsAccess(new Request(
      `https://sena.example.test/api/sena/ops/native-adapters?teamId=${encodeURIComponent(teamId)}`
    ))).resolves.toEqual({ mode: "session" });
  });

  it("leaves the bearer path unchanged and unaffected by session state", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-access-bearer-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_OPS_TOKEN = opsToken;
    process.env.SENA_OPS_AUTOMATION_TOKEN = automationToken;

    vi.resetModules();
    mockSessionCookie();

    const { member, owner } = await seedOpsCallers("bearer");

    const { requireOpsAccess, requireOpsMutationAccess } = await import("../ops-api");
    const statusUrl = "https://sena.example.test/api/sena/ops/status";

    for (const token of [opsToken, automationToken]) {
      // No session at all: the monitor/worker case.
      sessionToken = "";
      await expect(requireOpsAccess(new Request(statusUrl, {
        headers: { authorization: `Bearer ${token}` }
      }))).resolves.toEqual({ mode: "bearer" });

      // A session that would itself be refused does not downgrade the token.
      sessionToken = member.token;
      await expect(requireOpsAccess(new Request(statusUrl, {
        headers: { authorization: `Bearer ${token}` }
      }))).resolves.toEqual({ mode: "bearer" });

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
    for (const candidateSession of ["", member.token, owner.token]) {
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
    sessionToken = owner.token;

    const { requireOpsMutationAccess } = await import("../ops-api");
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
