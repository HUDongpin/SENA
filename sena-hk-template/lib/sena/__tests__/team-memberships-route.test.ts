import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

class TeamMembershipRouteMemoryPostgres {
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
    throw new Error(`Unexpected Postgres query in team membership route test: ${normalizedSql}`);
  }
}

describe("SENA team memberships route", () => {
  it("persists API membership updates and team reads through Postgres primary", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-team-memberships-postgres-route-"));
    const pg = new TeamMembershipRouteMemoryPostgres();
    let sessionToken = "";
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
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const owner = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Membership Owner",
        email: "postgres-membership-owner@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Membership Route Lab",
        plan: "lab"
      });
      const member = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Membership Coder",
        email: "postgres-membership-coder@example.edu",
        password: "sena-secure-123",
        organization: "External Postgres Membership Lab",
        plan: "individual"
      });
      const invitation = await enterprise.createEnterpriseInvitationAsync(owner.context, {
        teamId: owner.context.teams[0].id,
        email: "postgres-membership-coder@example.edu",
        role: "reviewer"
      });
      const accepted = await enterprise.acceptEnterpriseInvitationAsync(member.context, {
        invitationId: invitation.id
      });

      sessionToken = owner.token;
      const csrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const membershipRoute = await import("../../../app/api/sena/team/memberships/route");
      const response = await membershipRoute.PATCH(new Request("https://sena.example.test/api/sena/team/memberships", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          membershipId: accepted.membership.id,
          role: "coder",
          status: "suspended"
        })
      }));
      const body = await response.json() as {
        membership?: { id?: string; role?: string; status?: string };
      };
      const teamRoute = await import("../../../app/api/sena/team/route");
      const teamResponse = await teamRoute.GET(new Request("https://sena.example.test/api/sena/team"));
      const teamBody = await teamResponse.json() as {
        users?: Array<{ email?: string }>;
        memberships?: Array<{ id?: string; role?: string; status?: string }>;
      };
      const fileBackedDb = enterprise.readEnterpriseDb();
      const postgresMembership = pg.state?.payload.memberships.find((membership) => membership.id === accepted.membership.id);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-team-memberships");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.membership?.role).toBe("coder");
      expect(body.membership?.status).toBe("suspended");
      expect(teamResponse.status).toBe(200);
      expect(teamResponse.headers.get("x-sena-observed-route")).toBe("sena-team");
      expect(teamResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(teamBody.users?.map((user) => user.email)).toContain("postgres-membership-coder@example.edu");
      expect(teamBody.memberships?.find((membership) => membership.id === accepted.membership.id)).toEqual(expect.objectContaining({
        role: "coder",
        status: "suspended"
      }));
      expect(postgresMembership).toEqual(expect.objectContaining({
        role: "coder",
        status: "suspended"
      }));
      expect(pg.state?.payload.auditLog.map((entry) => entry.event)).toContain("team.membership.update");
      expect(fileBackedDb.memberships.map((membership) => membership.id)).not.toContain(accepted.membership.id);
      expect(JSON.stringify({ body, teamBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ body, teamBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("returns machine-readable role and status headers for membership updates", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-team-memberships-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const owner = enterprise.registerEnterpriseUser({
        name: "Membership Owner",
        email: "membership-owner@example.edu",
        password: "sena-secure-123",
        organization: "Membership Route Lab",
        plan: "lab"
      });
      const member = enterprise.registerEnterpriseUser({
        name: "Membership Coder",
        email: "membership-coder@example.edu",
        password: "sena-secure-123",
        organization: "External Membership Lab",
        plan: "individual"
      });
      const invitation = enterprise.createEnterpriseInvitation(owner.context, {
        teamId: owner.context.teams[0].id,
        email: "membership-coder@example.edu",
        role: "reviewer"
      });
      const accepted = enterprise.acceptEnterpriseInvitation(member.context, {
        invitationId: invitation.id
      });

      sessionToken = owner.token;
      const csrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const route = await import("../../../app/api/sena/team/memberships/route");
      const response = await route.PATCH(new Request("https://sena.example.test/api/sena/team/memberships", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          membershipId: accepted.membership.id,
          role: "coder",
          status: "suspended"
        })
      }));
      const body = await response.json() as {
        schemaVersion?: string;
        membership?: {
          id?: string;
          teamId?: string;
          userId?: string;
          role?: string;
          status?: string;
        };
      };

      expect(response.status).toBe(200);
      expect(body.schemaVersion).toBe("sena-team-membership/v1");
      expect(body.membership?.id).toBe(accepted.membership.id);
      expect(body.membership?.role).toBe("coder");
      expect(body.membership?.status).toBe("suspended");
      expect(response.headers.get("x-sena-membership-id")).toBe(accepted.membership.id);
      expect(response.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(response.headers.get("x-sena-member-user-id")).toBe(member.context.user.id);
      expect(response.headers.get("x-sena-membership-role")).toBe("coder");
      expect(response.headers.get("x-sena-membership-status")).toBe("suspended");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-team-memberships");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
