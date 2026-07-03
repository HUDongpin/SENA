import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "NODE_ENV",
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_ENTERPRISE_STATE_STORE",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"
];

describe("SENA enterprise file state production policy", () => {
  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    vi.resetModules();
  });

  it("keeps file-backed state read-only when the production performance path is required", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-file-policy-"));
    process.env.NODE_ENV = "production";
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    vi.resetModules();

    try {
      const state = await import("../enterprise/state");
      const opsStatus = await import("../enterprise/ops-status");
      const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");

      const db = state.readEnterpriseDb();
      const runtime = state.getEnterprisePrimaryStateRuntime();
      const writeProbe = state.createConfiguredFileEnterpriseStateStore().probeWrite();
      const status = opsStatus.getEnterpriseOpsStatus();
      const writableCheck = status.checks.find((check) => check.id === "ops-storage-writable");

      expect(db.schemaVersion).toBe(state.emptyEnterpriseDb().schemaVersion);
      expect(existsSync(dbPath)).toBe(false);
      expect(runtime).toEqual(expect.objectContaining({
        fileBackendWritePolicy: "blocked",
        fileBackendWriteBlocked: true
      }));
      expect(runtime.evidence).toEqual(expect.arrayContaining([
        "fileBackendWritePolicy=blocked",
        "fileBackendWriteBlocked=true",
        "fileBackendWriteBlockReasons=NODE_ENV=production+SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH"
      ]));
      expect(writeProbe).toEqual(expect.objectContaining({
        writable: false,
        writeProbe: "fail",
        writePolicy: "blocked",
        writeBlockedReason: "NODE_ENV=production+SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
        writeErrorHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(status.status).toBe("degraded");
      expect(status.storage.writePolicy).toBe("blocked");
      expect(writableCheck?.evidence).toEqual(expect.arrayContaining([
        "writeProbe=fail",
        "writePolicy=blocked",
        "writeBlockedReason=NODE_ENV=production+SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH"
      ]));

      expect(() => state.writeEnterpriseDb(db)).toThrow(expect.objectContaining({
        status: 503,
        code: "enterprise_file_state_production_write_blocked"
      }));
      expect(existsSync(dbPath)).toBe(false);
    } finally {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
    }
  });

  it("blocks legacy direct file writes under production evidence gates even when Postgres primary is configured", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-file-policy-postgres-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    process.env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED = "1";
    vi.resetModules();

    try {
      const state = await import("../enterprise/state");
      const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
      const db = state.emptyEnterpriseDb();
      const policy = state.enterpriseFileStateWritePolicy();
      const runtime = state.getEnterprisePrimaryStateRuntime();
      const writeProbe = state.createConfiguredFileEnterpriseStateStore().probeWrite();

      expect(policy).toEqual(expect.objectContaining({
        mode: "blocked",
        blocked: true,
        blockingReasons: ["SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED"]
      }));
      expect(policy.evidence).toEqual(expect.arrayContaining([
        "fileBackendPostgresPrimaryActive=true",
        "fileBackendProductionEvidenceManifestRequired=true"
      ]));
      expect(runtime.activePrimary).toBe("postgres");
      expect(runtime.fileBackendWriteBlocked).toBe(true);
      expect(writeProbe).toEqual(expect.objectContaining({
        writable: false,
        writeProbe: "fail",
        writePolicy: "blocked",
        writeBlockedReason: "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED"
      }));
      expect(() => state.writeEnterpriseDb(db)).toThrow(expect.objectContaining({
        status: 503,
        code: "enterprise_file_state_production_write_blocked"
      }));
      expect(existsSync(dbPath)).toBe(false);
    } finally {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
    }
  });
});
