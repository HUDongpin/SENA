import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "DATABASE_URL",
  "SENA_AUDIT_RETENTION_DAYS"
];

describe("SENA audit Postgres store", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.resetModules();
  });

  it("stores async audit events in the indexed Postgres audit table when Postgres is primary", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-audit-postgres-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb";
    process.env.SENA_AUDIT_RETENTION_DAYS = "90";

    const queries: string[] = [];
    const auditRows = new Map<string, Record<string, unknown>>();
    let stateRow: { revision: number; payload: unknown } | null = null;

    function filteredAuditRows(values: unknown[]) {
      const teamIds = new Set((values[0] as string[] | undefined) ?? []);
      const scopedUserIds = new Set((values[1] as string[] | undefined) ?? []);
      const eventFilter = typeof values[2] === "string" ? values[2] : undefined;
      return [...auditRows.values()]
        .filter((row) => teamIds.has(String(row.team_id)) || scopedUserIds.has(String(row.user_id)) || row.event === "security.rate_limit")
        .filter((row) => !eventFilter || row.event === eventFilter)
        .sort((left, right) => (
          String(right.created_at).localeCompare(String(left.created_at)) || String(right.id).localeCompare(String(left.id))
        ));
    }

    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          queries.push(normalizedSql);
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
            return { rows: stateRow ? [stateRow] : [], rowCount: stateRow ? 1 : 0 };
          }
          if (/INSERT INTO "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
            stateRow = { revision: 0, payload: values[2] };
            return { rows: [], rowCount: 1 };
          }
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE INDEX IF NOT EXISTS "sena_enterprise_audit_log_/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/INSERT INTO "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            const row = {
              id: values[0],
              event: values[1],
              user_id: values[2],
              team_id: values[3],
              project_id: values[4],
              detail: values[5],
              webhook_delivery: values[6],
              created_at: values[7]
            };
            auditRows.set(String(row.id), row);
            return { rows: [], rowCount: 1 };
          }
          if (/SELECT count\(\*\) AS total FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [{ total: filteredAuditRows(values).length }], rowCount: 1 };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: filteredAuditRows(values), rowCount: auditRows.size };
          }
          throw new Error(`Unexpected Postgres query: ${normalizedSql}`);
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Audit PI",
      email: "audit-pi@example.edu",
      password: "sena-secure-123",
      organization: "Audit Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;

    await enterprise.recordEnterpriseAuditAsync({
      event: "ops.server_job.status",
      userId: registered.context.user.id,
      teamId,
      projectId: "project_audit_pg",
      detail: {
        serverJobId: "server_job_pg",
        action: "mark-running",
        status: "running"
      }
    });

    const runtime = enterprise.auditStoreRuntime();
    const listed = await enterprise.listEnterpriseAuditLogAsync(registered.context, {
      teamId,
      event: "ops.server_job.status"
    });
    const integrity = await enterprise.verifyEnterpriseAuditIntegrityAsync(registered.context, { teamId });

    expect(runtime).toEqual(expect.objectContaining({
      activeStore: "postgres-table",
      postgresConfigured: true,
      postgresPrimaryActive: true
    }));
    expect(listed.schemaVersion).toBe("sena-enterprise-audit-log/v1");
    expect(listed.pagination).toEqual(expect.objectContaining({
      total: 1,
      returned: 1
    }));
    expect(listed.events[0]).toEqual(expect.objectContaining({
      event: "ops.server_job.status",
      teamId,
      projectId: "project_audit_pg",
      detail: expect.objectContaining({
        serverJobId: "server_job_pg",
        status: "running"
      })
    }));
    expect(integrity.chain.eventCount).toBe(1);
    expect(integrity.status).toBe("pass");

    const fileAudit = enterprise.listEnterpriseAuditLog(registered.context, {
      teamId,
      event: "ops.server_job.status"
    });
    expect(fileAudit.pagination.total).toBe(0);
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_audit_log"/.test(query))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_audit_log_event_created_idx"/.test(query))).toBe(true);
    expect(queries.some((query) => /INSERT INTO "public"\."sena_enterprise_audit_log"/.test(query))).toBe(true);
    expect(JSON.stringify({ runtime, listed, integrity })).not.toContain("super-secret");
    expect(JSON.stringify({ runtime, listed, integrity })).not.toContain("example.db");
  });
});
