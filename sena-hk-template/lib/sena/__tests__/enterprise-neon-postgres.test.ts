import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL"
];

describe("SENA enterprise Neon Postgres readiness", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) {
      delete process.env[name];
    }
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.resetModules();
  });

  it("reports configured Neon as the native managed database adapter without exposing credentials", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const enterprise = await import("../enterprise");

    const opsStatus = enterprise.getEnterpriseOpsStatus();
    const storage = opsStatus.storage as typeof opsStatus.storage & {
      postgres?: {
        configured: boolean;
        adapter: string;
        urlEnvName?: string;
        connectionHash?: string;
      };
    };
    const nativeCheck = opsStatus.checks.find((check) => check.id === "ops-native-postgres-adapter");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    const persistence = governance.checks.find((check) => check.id === "persistence");
    const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
    const databaseDecision = deployment.platformDecisions.find((decision) => decision.id === "native-managed-database");

    expect(storage.engine).toBe("neon-postgres");
    expect(storage.postgres).toEqual(expect.objectContaining({
      configured: true,
      adapter: "neon",
      urlEnvName: "DATABASE_URL",
      connectionHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(nativeCheck).toEqual(expect.objectContaining({
      status: "pass"
    }));
    expect(nativeCheck?.evidence).toEqual(expect.arrayContaining([
      "adapter=neon",
      "configured=true",
      "url=DATABASE_URL",
      expect.stringMatching(/^connectionHash=[a-f0-9]{64}$/)
    ]));
    expect(persistence?.evidence).toEqual(expect.arrayContaining([
      "engine=neon-postgres",
      "adapter=neon",
      "url=DATABASE_URL",
      expect.stringMatching(/^connectionHash=[a-f0-9]{64}$/)
    ]));
    expect(databaseDecision).toEqual(expect.objectContaining({
      status: "ready"
    }));
    expect(databaseDecision?.evidence).toEqual(expect.arrayContaining([
      "current=neon-postgres",
      "native=sena-enterprise-postgres-adapter/v1",
      "url=DATABASE_URL",
      expect.stringMatching(/^connectionHash=[a-f0-9]{64}$/)
    ]));
    expect(JSON.stringify({ opsStatus, governance, deployment })).not.toContain("super-secret");
    expect(JSON.stringify({ opsStatus, governance, deployment })).not.toContain("example.neon.tech");
  });

  it("delivers database sync artifacts through the native Neon adapter when configured", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-sync-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: string[] = [];
    const poolOptions: unknown[] = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        constructor(options: unknown) {
          poolOptions.push(options);
        }

        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          queries.push(normalizedSql);
          if (/CREATE TABLE IF NOT EXISTS/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/INSERT INTO .*sena_enterprise_database_syncs/i.test(normalizedSql)) {
            return { rows: [{ revision: 1, backup_id: values[0], payload_sha256: values[1] }], rowCount: 1 };
          }
          throw new Error(`Unexpected Postgres query: ${normalizedSql}`);
        }

        async end() {
          return undefined;
        }
      }
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("database sync should not use webhook fetch when Neon is configured");
    }) as typeof fetch;

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Neon PI",
        email: "neon-pi@example.edu",
        password: "sena-secure-123",
        organization: "Neon Lab",
        plan: "lab"
      });
      const backup = enterprise.createEnterpriseBackup(registered.context);

      const sync = await enterprise.deliverEnterpriseDatabaseSync(registered.context, { backup });

      expect(sync.status).toBe("delivered");
      expect(sync.provider).toEqual(expect.objectContaining({
        mode: "postgres-native",
        configured: true,
        urlEnvName: "DATABASE_URL",
        connectionHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(sync.sync).toEqual(expect.objectContaining({
        attempted: true,
        nativeStatus: "delivered",
        revision: 1,
        adapter: "neon"
      }));
      expect(poolOptions[0]).toEqual(expect.objectContaining({
        connectionString: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
      }));
      expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_database_syncs"/.test(query))).toBe(true);
      expect(queries.some((query) => /INSERT INTO "public"\."sena_enterprise_database_syncs"/.test(query))).toBe(true);
      expect(JSON.stringify(sync)).not.toContain("super-secret");
      expect(JSON.stringify(sync)).not.toContain("example.neon.tech");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
