import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

class AuthRouteMemoryPostgres {
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
    throw new Error(`Unexpected Postgres query in auth register route test: ${normalizedSql}`);
  }
}

describe("SENA auth register route", () => {
  it("returns audit-ready session headers when registration creates a team session", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-register-success-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const route = await import("../../../app/api/auth/register/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Registered Route User",
          email: "registered-route-user@example.edu",
          password: "sena-secure-123",
          organization: "Registered Route Lab",
          plan: "lab"
        })
      }));
      const body = await response.json() as {
        user?: { id?: string };
        teams?: Array<{ id?: string }>;
        memberships?: Array<{ role?: string }>;
        session?: { id?: string; sessionProfile?: string; expiresAt?: string };
      };

      expect(response.status).toBe(201);
      expect(response.headers.get("set-cookie")).toContain("sena_session=");
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-register");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("x-sena-auth-flow")).toBe("password-register");
      expect(response.headers.get("x-sena-auth-user-id")).toBe(body.user?.id);
      expect(response.headers.get("x-sena-auth-session-id")).toBe(body.session?.id);
      expect(response.headers.get("x-sena-auth-session-profile")).toBe(body.session?.sessionProfile);
      expect(response.headers.get("x-sena-auth-session-expires-at")).toBe(body.session?.expiresAt);
      expect(response.headers.get("x-sena-auth-team-id")).toBe(body.teams?.[0]?.id);
      expect(response.headers.get("x-sena-auth-membership-role")).toBe(body.memberships?.[0]?.role);
      const enterprise = await import("../enterprise");
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
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
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("persists API registration, session, and rate-limit state through Postgres primary", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-register-postgres-route-"));
    const pg = new AuthRouteMemoryPostgres();
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
      const route = await import("../../../app/api/auth/register/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Postgres Registered Route User",
          email: "postgres-registered-route-user@example.edu",
          password: "sena-secure-123",
          organization: "Postgres Registered Route Lab",
          plan: "lab"
        })
      }));
      const body = await response.json() as {
        user?: { id?: string; email?: string };
        session?: { id?: string };
      };
      const enterprise = await import("../enterprise");
      const fileBackedDb = enterprise.readEnterpriseDb();

      expect(response.status).toBe(201);
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-register");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(pg.state?.payload.users.map((user) => user.email)).toContain("postgres-registered-route-user@example.edu");
      expect(pg.state?.payload.sessions.map((session) => session.id)).toContain(body.session?.id);
      expect(pg.state?.payload.apiRateLimits.map((record) => record.bucket)).toContain("auth.register");
      expect(pg.state?.payload.auditLog.map((entry) => entry.event)).toContain("auth.register");
      expect(fileBackedDb.users.map((user) => user.email)).not.toContain("postgres-registered-route-user@example.edu");
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

  it("rejects an invitation code when the registering email does not match the pending invitation", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-register-route-"));
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const owner = enterprise.registerEnterpriseUser({
        name: "PI Owner",
        email: "pi-owner@example.edu",
        password: "sena-secure-123",
        organization: "Invitation Lab",
        plan: "lab"
      });
      const invitation = enterprise.createEnterpriseInvitation(owner.context, {
        teamId: owner.context.teams[0].id,
        email: "invited-reviewer@example.edu",
        role: "reviewer"
      });

      const route = await import("../../../app/api/auth/register/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Wrong Reviewer",
          email: "wrong-reviewer@example.edu",
          password: "sena-secure-123",
          organization: "Outside Lab",
          inviteCode: invitation.inviteCode
        })
      }));
      const body = await response.json() as { code?: string; error?: string };

      expect(response.status).toBe(403);
      expect(response.headers.get("x-sena-observed-route")).toBe("auth-register");
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
});
