import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseBackupArtifact } from "../enterprise/ops-backup";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

describe("SENA governance backup route Postgres primary state", () => {
  it("creates, verifies, and restore-rehearses backups through Postgres primary state without local JSON", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-backup-route-postgres-primary-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
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
        name: "Postgres Backup Owner",
        email: "postgres-backup-owner@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Backup Lab",
        plan: "enterprise"
      });
      sessionToken = owner.token;
      const teamId = owner.context.teams[0].id;
      const csrf = enterprise.createEnterpriseCsrfToken(owner.context);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
      const route = await import("../../../app/api/sena/governance/backup/route");
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);

      const backupResponse = await route.GET(new Request(`https://sena.example.test/api/sena/governance/backup?teamId=${teamId}`));
      const backup = await backupResponse.json() as SenaEnterpriseBackupArtifact;
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
      const verifyResponse = await route.POST(new Request("https://sena.example.test/api/sena/governance/backup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({ artifact: backup })
      }));
      const verification = await verifyResponse.json() as { backupId?: string; checks?: Array<{ id: string; status: string }> };
      expect(verifyResponse.status).toBe(200);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
      if (!pg.state) throw new Error("Postgres primary state was not initialized before restore dry-run.");
      const beforeDryRun = structuredClone(pg.state);
      const restoreResponse = await route.POST(new Request("https://sena.example.test/api/sena/governance/backup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({ action: "restore-dry-run", artifact: backup })
      }));
      const restore = await restoreResponse.json() as { status?: string; dryRun?: boolean; backupId?: string };
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);

      expect(backupResponse.status).toBe(200);
      expect(backupResponse.headers.get("x-sena-observed-route")).toBe("sena-governance-backup");
      expect(backupResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(backup.manifest.storageEngine).toBe("postgres-primary-state");
      expect(backup.manifest.storagePathHint).toBe("postgres:configured");
      expect(verifyResponse.headers.get("x-sena-observed-route")).toBe("sena-governance-backup");
      expect(verifyResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(verification.backupId).toBe(backup.backupId);
      expect(verification.checks?.find((check) => check.id === "backup-secret-exclusions")?.status).toBe("pass");
      expect(restoreResponse.status).toBe(200);
      expect(restoreResponse.headers.get("x-sena-observed-route")).toBe("sena-governance-backup");
      expect(restoreResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(restore.status).toBe("dry-run");
      expect(restore.dryRun).toBe(true);
      expect(restore.backupId).toBe(backup.backupId);
      expect(pg.state?.revision).toBe(beforeDryRun.revision + 1);
      const { auditLog: beforeDryRunAudit, ...beforeDryRunDomainState } = beforeDryRun.payload;
      const { auditLog: afterDryRunAudit, ...afterDryRunDomainState } = pg.state!.payload;
      expect(afterDryRunDomainState).toEqual(beforeDryRunDomainState);
      expect(afterDryRunAudit).toHaveLength(beforeDryRunAudit.length + 1);
      expect(afterDryRunAudit.filter((entry) => entry.event === "governance.backup.verify")).toHaveLength(
        beforeDryRunAudit.filter((entry) => entry.event === "governance.backup.verify").length + 1
      );
      expect(afterDryRunAudit.filter((entry) => entry.event === "governance.backup.restore")).toHaveLength(
        beforeDryRunAudit.filter((entry) => entry.event === "governance.backup.restore").length
      );
      expect(pg.state?.payload.auditLog.some((entry) => entry.event === "governance.backup")).toBe(true);
      expect(pg.state?.payload.auditLog.filter((entry) => entry.event === "governance.backup.verify").length).toBeGreaterThanOrEqual(2);
      expect(pg.queries.some((query) => /UPDATE "public"\."sena_enterprise_state" SET payload/i.test(query))).toBe(true);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.doUnmock("next/headers");
      vi.resetModules();
    }
  });
});
