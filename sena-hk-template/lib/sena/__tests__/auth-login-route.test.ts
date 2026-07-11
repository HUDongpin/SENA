import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

class AuthLoginRouteMemoryPostgres {
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
    throw new Error(`Unexpected Postgres query in auth login route test: ${normalizedSql}`);
  }
}

describe("SENA auth login route", () => {
  it("returns audit-ready session headers for password login", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-login-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Login Route User",
        email: "login-route-user@example.edu",
        password: "sena-secure-123",
        organization: "Login Route Lab",
        plan: "lab"
      });
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();

      const route = await import("../../../app/api/auth/login/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "login-route-user@example.edu",
          password: "sena-secure-123",
          rememberSession: true
        })
      }));
      const body = await response.json() as {
        user?: { id?: string };
        teams?: Array<{ id?: string }>;
        memberships?: Array<{ role?: string }>;
        session?: { id?: string; sessionProfile?: string; expiresAt?: string };
      };

      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain("sena_session=");
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-login");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("x-sena-auth-flow")).toBe("password-login");
      expect(response.headers.get("x-sena-auth-user-id")).toBe(body.user?.id);
      expect(response.headers.get("x-sena-auth-session-id")).toBe(body.session?.id);
      expect(response.headers.get("x-sena-auth-session-profile")).toBe("remembered");
      expect(response.headers.get("x-sena-auth-session-expires-at")).toBe(body.session?.expiresAt);
      expect(response.headers.get("x-sena-auth-team-id")).toBe(registered.context.teams[0].id);
      expect(response.headers.get("x-sena-auth-membership-role")).toBe(body.memberships?.[0]?.role);
      expect(response.headers.get("x-sena-auth-production-gate")).toBe(identityEvidence.status);
      expect(response.headers.get("x-sena-identity-production-status")).toBe(identityEvidence.status);
      expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(identityEvidence.releaseGate.approvalBlocked));
      expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(identityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(identityEvidence.cutoverChecklist.status);
      expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.blockingLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.readyLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(identityEvidence.institutionActionPlan.summary.submissionPath);
      expect(response.headers.get("x-sena-identity-owner-runbook-digest"))
        .toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-identity-owner-runbook-blocking"))
        .toBe(String(identityEvidence.institutionActionPlan.ownerRunbooks.summary.blockingRunbooks));
      expect(response.headers.get("x-sena-identity-owner-runbook-preflight-checks"))
        .toBe(String(identityEvidence.institutionActionPlan.ownerRunbooks.summary.preflightChecks));
      expect(response.headers.get("x-sena-identity-owner-runbook-submission-steps"))
        .toBe(String(identityEvidence.institutionActionPlan.ownerRunbooks.summary.submissionSteps));
      expect(response.headers.get("x-sena-identity-owner-runbook-receipt-archive-steps"))
        .toBe(String(identityEvidence.institutionActionPlan.ownerRunbooks.summary.receiptArchiveSteps));
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("persists API password login, session, and rate-limit state through Postgres primary", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-login-postgres-route-"));
    const pg = new AuthLoginRouteMemoryPostgres();
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
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
      const { registerEnterpriseUserAsync } = await import("../enterprise/auth-registration");
      await registerEnterpriseUserAsync({
        name: "Postgres Login Route User",
        email: "postgres-login-route-user@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Login Route Lab",
        plan: "lab"
      });
      const route = await import("../../../app/api/auth/login/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "postgres-login-route-user@example.edu",
          password: "sena-secure-123",
          rememberSession: true
        })
      }));
      const body = await response.json() as {
        user?: { id?: string; email?: string };
        session?: { id?: string; sessionProfile?: string };
      };
      const enterprise = await import("../enterprise");
      const fileBackedDb = enterprise.readEnterpriseDb();

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-login");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.session?.sessionProfile).toBe("remembered");
      expect(pg.state?.payload.users.map((user) => user.email)).toContain("postgres-login-route-user@example.edu");
      expect(pg.state?.payload.sessions.map((session) => session.id)).toContain(body.session?.id);
      expect(pg.state?.payload.apiRateLimits.map((record) => record.bucket)).toEqual(expect.arrayContaining([
        "auth.login"
      ]));
      expect(pg.state?.payload.auditLog.map((entry) => entry.event)).toEqual(expect.arrayContaining([
        "auth.register",
        "auth.login"
      ]));
      expect(fileBackedDb.sessions.map((session) => session.id)).not.toContain(body.session?.id);
      expect(JSON.stringify({ body, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ body, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
