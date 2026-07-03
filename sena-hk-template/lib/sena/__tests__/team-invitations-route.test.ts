import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

class TeamInvitationRouteMemoryPostgres {
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
    throw new Error(`Unexpected Postgres query in team invitation route test: ${normalizedSql}`);
  }
}

describe("SENA team invitations route", () => {
  it("persists API invitation create and accept through Postgres primary", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-team-invitations-postgres-route-"));
    const pg = new TeamInvitationRouteMemoryPostgres();
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
        name: "Postgres Invitation Owner",
        email: "postgres-invitation-owner@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Invitation Route Lab",
        plan: "lab"
      });
      const invitee = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Route Reviewer",
        email: "postgres-route-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "External Postgres Route Lab",
        plan: "individual"
      });
      const route = await import("../../../app/api/sena/team/invitations/route");
      sessionToken = owner.token;
      const ownerCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": ownerCsrf.token
        },
        body: JSON.stringify({
          teamId: owner.context.teams[0].id,
          email: "postgres-route-reviewer@example.edu",
          role: "reviewer"
        })
      }));
      const createBody = await createResponse.json() as {
        invitation?: { id?: string; inviteCode?: string };
      };

      sessionToken = invitee.token;
      const inviteeCsrf = enterprise.createEnterpriseCsrfToken(invitee.context);
      const acceptResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": inviteeCsrf.token
        },
        body: JSON.stringify({ inviteCode: createBody.invitation?.inviteCode })
      }));
      const acceptBody = await acceptResponse.json() as {
        membership?: { id?: string; role?: string; status?: string };
      };
      const fileBackedDb = enterprise.readEnterpriseDb();

      expect(createResponse.status).toBe(201);
      expect(createResponse.headers.get("x-sena-observed-route")).toBe("sena-team-invitations");
      expect(createResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(acceptResponse.status).toBe(200);
      expect(acceptResponse.headers.get("x-sena-observed-route")).toBe("sena-team-invitations");
      expect(acceptResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(acceptBody.membership?.role).toBe("reviewer");
      expect(acceptBody.membership?.status).toBe("active");
      expect(pg.state?.payload.invitations.find((invitation) => invitation.id === createBody.invitation?.id)?.status).toBe("accepted");
      expect(pg.state?.payload.memberships.map((membership) => membership.id)).toContain(acceptBody.membership?.id);
      expect(pg.state?.payload.auditLog.map((entry) => entry.event)).toEqual(expect.arrayContaining([
        "team.invite",
        "team.invite.accept"
      ]));
      expect(fileBackedDb.invitations.map((invitation) => invitation.id)).not.toContain(createBody.invitation?.id);
      expect(fileBackedDb.memberships.map((membership) => membership.id)).not.toContain(acceptBody.membership?.id);
      expect(JSON.stringify({ acceptBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ acceptBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("returns machine-readable lifecycle headers for create, accept, and revoke", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-team-invitations-route-"));
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
        name: "Invitation Owner",
        email: "invitation-owner@example.edu",
        password: "sena-secure-123",
        organization: "Invitation Route Lab",
        plan: "lab"
      });
      const invitee = enterprise.registerEnterpriseUser({
        name: "Route Reviewer",
        email: "route-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "External Route Lab",
        plan: "individual"
      });
      sessionToken = owner.token;
      const ownerCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const route = await import("../../../app/api/sena/team/invitations/route");

      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": ownerCsrf.token
        },
        body: JSON.stringify({
          teamId: owner.context.teams[0].id,
          email: "route-reviewer@example.edu",
          role: "reviewer"
        })
      }));
      const createBody = await createResponse.json() as {
        invitation?: { id?: string; teamId?: string; role?: string; status?: string; inviteCode?: string };
      };

      expect(createResponse.status).toBe(201);
      expect(createResponse.headers.get("x-sena-invitation-id")).toBe(createBody.invitation?.id);
      expect(createResponse.headers.get("x-sena-invitation-status")).toBe("pending");
      expect(createResponse.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(createResponse.headers.get("x-sena-invitation-role")).toBe("reviewer");
      expect(createResponse.headers.get("x-sena-observed-route")).toBe("sena-team-invitations");
      expect(createResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");

      sessionToken = invitee.token;
      const inviteeCsrf = enterprise.createEnterpriseCsrfToken(invitee.context);
      const acceptResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": inviteeCsrf.token
        },
        body: JSON.stringify({ inviteCode: createBody.invitation?.inviteCode })
      }));
      const acceptBody = await acceptResponse.json() as {
        invitation?: { id?: string; teamId?: string; role?: string; status?: string };
        membership?: { id?: string; role?: string; status?: string };
      };

      expect(acceptResponse.status).toBe(200);
      expect(acceptResponse.headers.get("x-sena-invitation-id")).toBe(createBody.invitation?.id);
      expect(acceptResponse.headers.get("x-sena-invitation-status")).toBe("accepted");
      expect(acceptResponse.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(acceptResponse.headers.get("x-sena-membership-id")).toBe(acceptBody.membership?.id);
      expect(acceptResponse.headers.get("x-sena-membership-role")).toBe("reviewer");
      expect(acceptResponse.headers.get("x-sena-membership-status")).toBe("active");
      expect(acceptResponse.headers.get("x-sena-observed-route")).toBe("sena-team-invitations");

      sessionToken = owner.token;
      const revokeTarget = enterprise.createEnterpriseInvitation(owner.context, {
        teamId: owner.context.teams[0].id,
        email: "route-viewer@example.edu",
        role: "viewer"
      });
      const revokeCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const revokeResponse = await route.DELETE(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": revokeCsrf.token
        },
        body: JSON.stringify({ invitationId: revokeTarget.id })
      }));

      expect(revokeResponse.status).toBe(200);
      expect(revokeResponse.headers.get("x-sena-invitation-id")).toBe(revokeTarget.id);
      expect(revokeResponse.headers.get("x-sena-invitation-status")).toBe("revoked");
      expect(revokeResponse.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(revokeResponse.headers.get("x-sena-invitation-role")).toBe("viewer");
      expect(revokeResponse.headers.get("x-sena-observed-route")).toBe("sena-team-invitations");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
