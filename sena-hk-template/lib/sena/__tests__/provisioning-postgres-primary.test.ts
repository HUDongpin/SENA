import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const provisioningInput = {
  source: "scim" as const,
  organization: "Postgres Provisioning Lab",
  teams: [{ externalId: "okta-group-cohort", name: "Cohort A", plan: "enterprise" as const }],
  users: [{
    externalId: "okta-user-owner",
    email: "scim-owner@example.edu",
    name: "SCIM Owner",
    sso: { provider: "institution" as const, subject: "okta-user-owner" },
    memberships: [{ teamExternalId: "okta-group-cohort", role: "owner" as const }]
  }]
};

describe("SENA provisioning primary-state routing", () => {
  it("writes SCIM provisioning into the Postgres primary so the provisioned user can authenticate", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-provisioning-postgres-primary-"));
    const pg = new RouteMemoryPostgres();
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

    try {
      const provisioning = await import("../enterprise/provisioning");
      const state = await import("../enterprise/state");
      const sso = await import("../enterprise/auth-sso");
      const session = await import("../enterprise/auth-session");

      const result = await provisioning.provisionEnterpriseOrganizationAsync(provisioningInput);
      expect(result.summary.usersCreated).toBe(1);
      expect(result.summary.teamsCreated).toBe(1);
      expect(result.summary.membershipsCreated).toBe(1);

      // The write must land where the configured primary is, not in the file JSON
      // that a Postgres-primary deployment never reads.
      const primary = await state.readEnterpriseState();
      expect(primary.runtime.activePrimary).toBe("postgres");
      expect(primary.db.users.map((user) => user.email)).toContain("scim-owner@example.edu");
      expect(primary.db.teams.map((team) => team.name)).toContain("Cohort A");
      expect(pg.state?.payload.users.some((user) => user.email === "scim-owner@example.edu")).toBe(true);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);

      // The SCIM read surface resolves through the same primary.
      const directory = await provisioning.listEnterpriseProvisioningDirectoryAsync("scim");
      expect(directory.users.map((user) => user.email)).toContain("scim-owner@example.edu");
      expect(directory.teams.map((team) => team.name)).toContain("Cohort A");

      // The provisioning audit is recorded against the primary, not the file JSON.
      const auditedToPostgres = (pg.state?.payload.auditLog ?? []).some((entry) => entry.event === "provisioning.sync")
        || pg.auditRows.some((row) => row.event === "provisioning.sync");
      expect(auditedToPostgres).toBe(true);

      // ...and the provisioned identity can actually log in and reach its team.
      const login = await sso.ssoEnterpriseUserAsync({
        provider: "institution",
        email: "scim-owner@example.edu",
        subject: "okta-user-owner",
        name: "SCIM Owner"
      });
      expect(login.context.user.email).toBe("scim-owner@example.edu");
      expect(login.context.teams.map((team) => team.name)).toContain("Cohort A");
      const restored = await session.getEnterpriseSessionAsync(login.token);
      expect(restored?.user.email).toBe("scim-owner@example.edu");
      expect(restored?.memberships.map((membership) => membership.role)).toContain("owner");
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.resetModules();
    }
  });

  it("keeps the synchronous file-primary provisioning path byte-for-byte unchanged", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-provisioning-file-primary-"));
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;

    try {
      const provisioning = await import("../enterprise/provisioning");
      const sso = await import("../enterprise/auth-sso");
      const session = await import("../enterprise/auth-session");

      const dryRun = provisioning.provisionEnterpriseOrganization({ ...provisioningInput, dryRun: true });
      expect(dryRun.dryRun).toBe(true);
      expect(dryRun.summary.usersCreated).toBe(1);
      const afterDryRun = JSON.parse(readFileSync(path.join(enterpriseDbDir, "enterprise-db.json"), "utf8")) as SenaEnterpriseDb;
      expect(afterDryRun.users).toHaveLength(0);
      expect(afterDryRun.auditLog.some((entry) => entry.event === "provisioning.sync")).toBe(false);

      const result = provisioning.provisionEnterpriseOrganization(provisioningInput);
      expect(result.summary.usersCreated).toBe(1);
      expect(result.summary.teamsCreated).toBe(1);
      expect(result.summary.membershipsCreated).toBe(1);

      const db = JSON.parse(readFileSync(path.join(enterpriseDbDir, "enterprise-db.json"), "utf8")) as SenaEnterpriseDb;
      expect(db.users.map((user) => user.email)).toContain("scim-owner@example.edu");
      expect(db.teams.map((team) => team.name)).toContain("Cohort A");
      expect(db.memberships.map((membership) => membership.role)).toContain("owner");
      expect(db.auditLog.some((entry) => entry.event === "provisioning.sync")).toBe(true);

      const directory = provisioning.listEnterpriseProvisioningDirectory("scim");
      expect(directory.users.map((user) => user.email)).toContain("scim-owner@example.edu");

      const login = sso.ssoEnterpriseUser({
        provider: "institution",
        email: "scim-owner@example.edu",
        subject: "okta-user-owner",
        name: "SCIM Owner"
      });
      expect(login.context.teams.map((team) => team.name)).toContain("Cohort A");
      expect(session.getEnterpriseSession(login.token)?.user.email).toBe("scim-owner@example.edu");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
