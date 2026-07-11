import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

class SsoRouteMemoryPostgres {
  state: { revision: number; payload: SenaEnterpriseDb } | null = null;
  queries: string[] = [];

  async query(sql: string, values: unknown[] = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    this.queries.push(normalizedSql);
    if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
      return {
        rows: this.state ? [{ revision: this.state.revision, payload: this.state.payload }] : [],
        rowCount: this.state ? 1 : 0
      };
    }
    if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO NOTHING/i.test(normalizedSql)) {
      if (!this.state) {
        this.state = {
          revision: 0,
          payload: values[2] as SenaEnterpriseDb
        };
      }
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE "public"\."sena_enterprise_state" SET payload/i.test(normalizedSql)) {
      const expectedRevision = Number(values[2]);
      if (!this.state || this.state.revision !== expectedRevision) {
        return { rows: [], rowCount: 0 };
      }
      this.state = {
        revision: this.state.revision + 1,
        payload: values[0] as SenaEnterpriseDb
      };
      return { rows: [{ revision: this.state.revision }], rowCount: 1 };
    }
    // The identity production gate now rides the WithPostgresEvidence ops
    // chain, which prepares and reads the indexed evidence tables; report
    // them as present-but-empty so the route sees the same shape as a fresh
    // managed database.
    if (/^CREATE (TABLE|INDEX|UNIQUE INDEX)/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/^(SELECT|WITH)\b/i.test(normalizedSql) && /"public"\."sena_enterprise_[a-z_]+"/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/^INSERT INTO "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected Postgres query in SSO route test: ${normalizedSql}`);
  }
}

describe("SENA SSO route production fallback policy", () => {
  it("returns identity production gate headers on SSO status and preflight checks", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-sso-status-gate-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const route = await import("../../../app/api/auth/sso/route");

      const statusResponse = await route.GET(new Request("https://sena.example.test/api/auth/sso?status=1"));
      const statusBody = await statusResponse.json() as {
        providers?: Array<{ provider: string }>;
        identityProductionGate?: {
          schemaVersion?: string;
          status?: string;
          releaseGateBlocked?: boolean;
          missingEvidenceIds?: string[];
          institutionActionPlan?: {
            digest?: string;
            summary?: {
              blockingLanes?: number;
              readyLanes?: number;
              submissionPath?: string;
            };
          };
          redaction?: {
            secretValuesExcluded?: boolean;
            evidenceUrlValuesExcluded?: boolean;
            ownerNamesExcluded?: boolean;
          };
        };
      };
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(statusResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(statusBody.providers?.length).toBeGreaterThan(0);
      expect(statusBody.identityProductionGate).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-gate-summary/v1",
        status: identityEvidence.status,
        releaseGateBlocked: identityEvidence.releaseGate.approvalBlocked,
        missingEvidenceIds: identityEvidence.evidenceManifest.missingEvidenceIds,
        redaction: {
          secretValuesExcluded: true,
          evidenceUrlValuesExcluded: true,
          ownerNamesExcluded: true
        }
      }));
      expect(statusBody.identityProductionGate?.institutionActionPlan).toEqual(expect.objectContaining({
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          blockingLanes: identityEvidence.institutionActionPlan.summary.blockingLanes,
          readyLanes: identityEvidence.institutionActionPlan.summary.readyLanes,
          submissionPath: identityEvidence.institutionActionPlan.summary.submissionPath
        })
      }));
      expect(JSON.stringify(statusBody.identityProductionGate)).not.toContain("client_secret");
      expect(JSON.stringify(statusBody.identityProductionGate)).not.toContain("https://<institution-evidence-host>");
      expect(statusResponse.headers.get("x-sena-sso-production-gate")).toBe(identityEvidence.status);
      expect(statusResponse.headers.get("x-sena-identity-production-status")).toBe(identityEvidence.status);
      expect(statusResponse.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(identityEvidence.releaseGate.approvalBlocked));
      expect(statusResponse.headers.get("x-sena-identity-missing-evidence-ids")).toBe(identityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none");
      expect(statusResponse.headers.get("x-sena-identity-cutover-checklist")).toBe(identityEvidence.cutoverChecklist.status);
      expect(statusResponse.headers.get("x-sena-identity-rotation-freshness")).toBe(identityEvidence.rotationFreshness.status);
      expect(statusResponse.headers.get("x-sena-identity-institution-action-plan-digest")).toMatch(/^[a-f0-9]{64}$/);
      expect(statusResponse.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.blockingLanes));
      expect(statusResponse.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.readyLanes));
      expect(statusResponse.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(identityEvidence.institutionActionPlan.summary.submissionPath);

      const preflightResponse = await route.GET(new Request("https://sena.example.test/api/auth/sso?status=1&preflight=1&provider=institution"));
      const preflightBody = await preflightResponse.json() as {
        preflight?: { schemaVersion?: string };
        identityProductionGate?: {
          schemaVersion?: string;
          institutionActionPlan?: {
            summary?: {
              blockingLanes?: number;
              submissionPath?: string;
            };
          };
        };
      };
      expect(preflightResponse.status).toBe(200);
      expect(preflightResponse.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(preflightBody.preflight?.schemaVersion).toBe("sena-enterprise-sso-preflight/v1");
      expect(preflightBody.identityProductionGate?.schemaVersion)
        .toBe("sena-enterprise-identity-production-gate-summary/v1");
      expect(preflightBody.identityProductionGate?.institutionActionPlan?.summary?.blockingLanes)
        .toBe(identityEvidence.institutionActionPlan.summary.blockingLanes);
      expect(preflightBody.identityProductionGate?.institutionActionPlan?.summary?.submissionPath)
        .toBe(identityEvidence.institutionActionPlan.summary.submissionPath);
      expect(preflightResponse.headers.get("x-sena-sso-production-gate")).toBe(identityEvidence.status);
      expect(preflightResponse.headers.get("x-sena-identity-production-status")).toBe(identityEvidence.status);
      expect(preflightResponse.headers.get("x-sena-identity-missing-evidence-ids")).toBe(identityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none");
      expect(preflightResponse.headers.get("x-sena-identity-rotation-freshness")).toBe(identityEvidence.rotationFreshness.status);
      expect(preflightResponse.headers.get("x-sena-identity-institution-action-plan-digest")).toMatch(/^[a-f0-9]{64}$/);
      expect(preflightResponse.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.blockingLanes));
      expect(preflightResponse.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.readyLanes));
      expect(preflightResponse.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(identityEvidence.institutionActionPlan.summary.submissionPath);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("returns audit-ready session headers for OAuth callback redirects", async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const context = {
      user: { id: "user-sso-callback", email: "callback-sso@example.edu" },
      session: {
        id: "session-sso-callback",
        userId: "user-sso-callback",
        createdAt: new Date().toISOString(),
        expiresAt,
        sessionProfile: "standard"
      },
      teams: [{ id: "team-sso-callback", name: "Callback Team" }],
      memberships: [{ id: "membership-sso-callback", teamId: "team-sso-callback", userId: "user-sso-callback", role: "reviewer", status: "active" }]
    };
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise/auth-sso", () => ({
      completeEnterpriseSsoCallbackAsync: async () => ({
        token: "sena-callback-token",
        redirectTo: "/workspace/sena?rail=sets",
        context
      }),
      senaSessionCookieName: "sena_session"
    }));
    vi.doMock("@/lib/sena/api-helpers", () => ({
      authSessionHeaders: () => ({
        "x-sena-auth-flow": "sso-callback",
        "x-sena-auth-provider": "google",
        "x-sena-sso-provider": "google",
        "x-sena-sso-mode": "oauth-oidc",
        "x-sena-auth-user-id": "user-sso-callback",
        "x-sena-auth-session-id": "session-sso-callback",
        "x-sena-auth-team-id": "team-sso-callback",
        "x-sena-auth-membership-role": "reviewer",
        "x-sena-auth-production-gate": "review",
        "x-sena-identity-missing-evidence-ids": "idp-tenant-approval|scim-or-idp-ownership"
      }),
      enforceAuthRateLimitAsync: async () => ({ allowed: true }),
      observeSenaApiRoute: async (_request: Request, input: { routeId: string }, handler: () => Promise<Response> | Response) => {
        const response = await handler();
        response.headers.set("x-sena-observed-route", input.routeId);
        response.headers.set("x-sena-observed-status-class", `${Math.floor(response.status / 100)}xx`);
        return response;
      },
      sessionCookieMaxAgeSeconds: () => 86_400,
      sessionCookieOptions: () => ({
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 86_400
      })
    }));

    try {
      const route = await import("../../../app/api/auth/sso/callback/route");
      const response = await route.GET(new Request("https://sena.example.test/api/auth/sso/callback?provider=google&code=provider-code&state=state-1"));

      expect(response.status).toBe(307);
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-sso-callback");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("3xx");
      expect(response.headers.get("location")).toBe("https://sena.example.test/workspace/sena?rail=sets");
      expect(response.headers.get("set-cookie")).toContain("sena_session=sena-callback-token");
      expect(response.headers.get("x-sena-auth-flow")).toBe("sso-callback");
      expect(response.headers.get("x-sena-auth-provider")).toBe("google");
      expect(response.headers.get("x-sena-sso-provider")).toBe("google");
      expect(response.headers.get("x-sena-sso-mode")).toBe("oauth-oidc");
      expect(response.headers.get("x-sena-auth-user-id")).toBe("user-sso-callback");
      expect(response.headers.get("x-sena-auth-session-id")).toBe("session-sso-callback");
      expect(response.headers.get("x-sena-auth-team-id")).toBe("team-sso-callback");
      expect(response.headers.get("x-sena-auth-membership-role")).toBe("reviewer");
      expect(response.headers.get("x-sena-auth-production-gate")).toBe("review");
      expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe("idp-tenant-approval|scim-or-idp-ownership");
    } finally {
      vi.doUnmock("@/lib/sena/enterprise/auth-sso");
      vi.doUnmock("@/lib/sena/api-helpers");
      vi.resetModules();
    }
  });

  it("returns audit-ready session headers for local SSO fallback", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-sso-headers-route-"));
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const route = await import("../../../app/api/auth/sso/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "orcid",
          email: "orcid-route-user@example.edu",
          name: "ORCID Route User",
          organization: "ORCID Route Lab"
        })
      }));
      const body = await response.json() as {
        user?: { id?: string };
        teams?: Array<{ id?: string }>;
        memberships?: Array<{ role?: string }>;
        session?: { id?: string; sessionProfile?: string; expiresAt?: string };
      };

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("set-cookie")).toContain("sena_session=");
      expect(response.headers.get("x-sena-auth-flow")).toBe("sso-local-fallback");
      expect(response.headers.get("x-sena-auth-provider")).toBe("orcid");
      expect(response.headers.get("x-sena-sso-provider")).toBe("orcid");
      expect(response.headers.get("x-sena-sso-mode")).toBe("local-pilot-fallback");
      expect(response.headers.get("x-sena-auth-user-id")).toBe(body.user?.id);
      expect(response.headers.get("x-sena-auth-session-id")).toBe(body.session?.id);
      expect(response.headers.get("x-sena-auth-session-profile")).toBe(body.session?.sessionProfile);
      expect(response.headers.get("x-sena-auth-session-expires-at")).toBe(body.session?.expiresAt);
      expect(response.headers.get("x-sena-auth-team-id")).toBe(body.teams?.[0]?.id);
      expect(response.headers.get("x-sena-auth-membership-role")).toBe(body.memberships?.[0]?.role);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("persists API SSO preflight and local fallback state through Postgres primary", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-sso-postgres-route-"));
    const pg = new SsoRouteMemoryPostgres();
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
        }
      }
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const route = await import("../../../app/api/auth/sso/route");
      const preflightResponse = await route.GET(new Request("https://sena.example.test/api/auth/sso?status=1&preflight=1&provider=orcid"));
      const preflightBody = await preflightResponse.json() as {
        preflight?: { schemaVersion?: string };
      };
      const fallbackResponse = await route.POST(new Request("https://sena.example.test/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "orcid",
          email: "postgres-orcid-route-user@example.edu",
          name: "Postgres ORCID Route User",
          organization: "Postgres ORCID Route Lab"
        })
      }));
      const fallbackBody = await fallbackResponse.json() as {
        user?: { id?: string; email?: string };
        session?: { id?: string };
      };
      const enterprise = await import("../enterprise");
      const fileBackedDb = enterprise.readEnterpriseDb();
      const auditEvents = pg.state?.payload.auditLog.map((entry) => entry.event) ?? [];

      expect(preflightResponse.status).toBe(200);
      expect(preflightResponse.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(preflightBody.preflight?.schemaVersion).toBe("sena-enterprise-sso-preflight/v1");
      expect(fallbackResponse.status).toBe(200);
      expect(fallbackResponse.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(pg.queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/.test(query))).toBe(true);
      expect(pg.state?.payload.users.map((user) => user.email)).toContain("postgres-orcid-route-user@example.edu");
      expect(pg.state?.payload.sessions.map((session) => session.id)).toContain(fallbackBody.session?.id);
      expect(pg.state?.payload.apiRateLimits.map((record) => record.bucket)).toEqual(expect.arrayContaining([
        "auth.sso.preflight",
        "auth.sso.start"
      ]));
      expect(auditEvents).toEqual(expect.arrayContaining([
        "auth.sso.preflight.fail",
        "auth.sso"
      ]));
      expect(fileBackedDb.users.map((user) => user.email)).not.toContain("postgres-orcid-route-user@example.edu");
      expect(fileBackedDb.sessions.map((session) => session.id)).not.toContain(fallbackBody.session?.id);
      expect(JSON.stringify({ fallbackBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ fallbackBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      delete process.env.SENA_APP_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("rejects an invitation code when local SSO fallback email does not match the pending invitation", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-sso-invite-route-"));
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const owner = enterprise.registerEnterpriseUser({
        name: "SSO PI Owner",
        email: "sso-pi-owner@example.edu",
        password: "sena-secure-123",
        organization: "SSO Invitation Lab",
        plan: "lab"
      });
      const invitation = enterprise.createEnterpriseInvitation(owner.context, {
        teamId: owner.context.teams[0].id,
        email: "sso-invited-reviewer@example.edu",
        role: "reviewer"
      });

      const route = await import("../../../app/api/auth/sso/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "institution",
          email: "wrong-sso-reviewer@example.edu",
          name: "Wrong SSO Reviewer",
          inviteCode: invitation.inviteCode
        })
      }));
      const body = await response.json() as { code?: string; error?: string };

      expect(response.status).toBe(403);
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("4xx");
      expect(body.code).toBe("invitation_email_mismatch");
      expect(body.error).toContain("Invitation email does not match");
      expect(response.headers.get("set-cookie")).toBeNull();
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("rejects local SSO fallback in production unless it is explicitly enabled", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-sso-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    delete process.env.SENA_ALLOW_LOCAL_SSO_FALLBACK;
    delete process.env.SENA_SSO_GOOGLE_CLIENT_ID;
    delete process.env.SENA_SSO_GOOGLE_CLIENT_SECRET;
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const route = await import("../../../app/api/auth/sso/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          email: "pilot-fallback@example.edu",
          name: "Pilot Fallback"
        })
      }));
      const body = await response.json() as { code?: string; error?: string };

      expect(response.status).toBe(503);
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("5xx");
      expect(body.code).toBe("sso_local_fallback_disabled");
      expect(body.error).toContain("Local pilot SSO fallback is disabled");

      const statusResponse = await route.GET(new Request("https://sena.example.test/api/auth/sso?status=1"));
      const statusBody = await statusResponse.json() as {
        providers: Array<{
          provider: string;
          fallbackPolicy?: { schemaVersion: string; enabled: boolean; productionRuntime: boolean; explicitOverride: boolean };
        }>;
      };
      const googleStatus = statusBody.providers.find((provider) => provider.provider === "google");
      expect(googleStatus?.fallbackPolicy).toEqual({
        schemaVersion: "sena-enterprise-sso-fallback-policy/v1",
        enabled: false,
        productionRuntime: true,
        explicitOverride: false,
        env: "SENA_ALLOW_LOCAL_SSO_FALLBACK"
      });

      const enterprise = await import("../enterprise");
      const governance = enterprise.getEnterpriseGovernanceStatus();
      const ssoEvidence = governance.checks.find((check) => check.id === "oauth-oidc-sso")?.evidence ?? [];
      expect(ssoEvidence).toContain("fallbackPolicy=sena-enterprise-sso-fallback-policy/v1");
      expect(ssoEvidence).toContain("localFallback=disabled");

      process.env.SENA_ALLOW_LOCAL_SSO_FALLBACK = "1";
      const allowedResponse = await route.POST(new Request("https://sena.example.test/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          email: "pilot-fallback-allowed@example.edu",
          name: "Pilot Fallback Allowed"
        })
      }));
      const allowedBody = await allowedResponse.json() as { user?: { email?: string } };
      expect(allowedResponse.status).toBe(200);
      expect(allowedResponse.headers.get("x-sena-observed-route")).toBe("auth-sso");
      expect(allowedBody.user?.email).toBe("pilot-fallback-allowed@example.edu");
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ALLOW_LOCAL_SSO_FALLBACK;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
