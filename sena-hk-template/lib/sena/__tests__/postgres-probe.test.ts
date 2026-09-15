import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SenaEnterprisePostgresPoolFactory } from "../enterprise-postgres";

const envNames = [
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "SENA_ENTERPRISE_POSTGRES_MAX_POOL_SIZE",
  "SENA_ENTERPRISE_POSTGRES_IDLE_TIMEOUT_MS",
  "SENA_ENTERPRISE_POSTGRES_CONNECTION_TIMEOUT_MS",
  "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED",
  "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED",
  "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256",
  "SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT",
  "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_REQUIRED",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
  "SENA_OPS_TOKEN",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER"
];

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function configurePostgresEnv() {
  process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
  process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb?sslmode=require";
}

describe("SENA enterprise Postgres live probe", () => {
  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("runs a redacted CREATE/INSERT/SELECT/DELETE probe without exposing connection values", async () => {
    configurePostgresEnv();
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const poolEnds: string[] = [];
    const poolFactory = vi.fn((options: unknown) => ({
      async query(sql: string, values: unknown[] = []) {
        const normalizedSql = sql.replace(/\s+/g, " ").trim();
        queries.push({ sql: normalizedSql, values });
        if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_postgres_live_probes"/.test(normalizedSql)) {
          return { rows: [], rowCount: 0 };
        }
        if (/INSERT INTO "public"\."sena_enterprise_postgres_live_probes"/.test(normalizedSql)) {
          return { rows: [], rowCount: 1 };
        }
        if (/SELECT payload_sha256 FROM "public"\."sena_enterprise_postgres_live_probes"/.test(normalizedSql)) {
          return { rows: [{ payload_sha256: values[1] ?? queries.find((query) => /INSERT INTO/.test(query.sql))?.values[1] }], rowCount: 1 };
        }
        if (/DELETE FROM "public"\."sena_enterprise_postgres_live_probes"/.test(normalizedSql)) {
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected Postgres query: ${normalizedSql}`);
      },
      async end() {
        poolEnds.push("ended");
      }
    })) as unknown as SenaEnterprisePostgresPoolFactory & ReturnType<typeof vi.fn>;

    const { verifyEnterprisePostgresProbe } = await import("../enterprise-postgres");
    const probe = await verifyEnterprisePostgresProbe({
      poolFactory,
      probeId: "postgres-probe-redaction"
    });

    expect(probe.schemaVersion).toBe("sena-enterprise-postgres-probe/v1");
    expect(probe.status).toBe("pass");
    expect(probe.provider).toEqual(expect.objectContaining({
      configured: true,
      adapter: "postgres",
      urlEnvName: "DATABASE_URL",
      connectionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      connectionValueExcluded: true,
      pool: expect.objectContaining({
        max: 5,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000,
        keepAlive: true
      })
    }));
    expect(probe.probe).toEqual(expect.objectContaining({
      schemaName: "public",
      tableName: "sena_enterprise_postgres_live_probes",
      probeIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      cleanupStatus: "deleted",
      createTable: expect.objectContaining({ attempted: true, status: "pass" }),
      insert: expect.objectContaining({ attempted: true, status: "pass", rowCount: 1 }),
      select: expect.objectContaining({ attempted: true, status: "pass", rowCount: 1 }),
      delete: expect.objectContaining({ attempted: true, status: "pass", rowCount: 1 })
    }));
    expect(probe.schemaContract).toEqual(expect.objectContaining({
      schemaVersion: "sena-enterprise-postgres-schema-contract/v1",
      status: "pass",
      schemaName: "public",
      summary: expect.objectContaining({
        tableCount: 20,
        productionTableCount: 19,
        verifierTableCount: 1,
        indexCount: 71,
        uniqueIndexCount: 10,
        ddlStatementCount: 98,
        destructiveDdlStatementCount: 0,
        migrationMode: "create-if-not-exists"
      }),
      redaction: {
        sqlValuesExcluded: true,
        connectionValuesExcluded: true,
        secretValuesExcluded: true
      }
    }));
    expect(probe.schemaContract.tables.map((table) => table.name)).toEqual(expect.arrayContaining([
      "sena_enterprise_state",
      "sena_enterprise_uploads",
      "sena_enterprise_server_jobs",
      "sena_enterprise_audit_log",
      "sena_enterprise_observed_requests",
      "sena_workflow_runs",
      "sena_workflow_commands",
      "sena_workflow_step_receipts",
      "sena_workflow_approvals",
      "sena_workflow_artifacts",
      "sena_enterprise_postgres_live_probes"
    ]));
    expect(probe.schemaContract.indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
      "sena_enterprise_uploads_team_created_idx",
      "sena_enterprise_server_jobs_status_updated_idx",
      "sena_enterprise_observed_requests_error_idx",
      "sena_workflow_runs_team_start_idempotency_uidx",
      "sena_workflow_commands_run_claimed_uidx",
      "sena_workflow_commands_claim_idx",
      "sena_workflow_step_receipts_effect_uidx"
    ]));
    expect(probe.schemaContract.ddl.statementFingerprints.every((statement) => /^[a-f0-9]{64}$/.test(statement.sqlSha256))).toBe(true);
    expect(queries.map((query) => query.sql.split(" ")[0])).toEqual(["CREATE", "INSERT", "SELECT", "DELETE"]);
    expect(poolFactory).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: "postgres://sena_user:super-secret@example.db/senadb?sslmode=require",
      max: 5,
      keepAlive: true
    }));
    expect(poolEnds).toEqual(["ended"]);
    const serialized = JSON.stringify(probe);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("example.db");
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("postgres-probe-redaction");
  });

  it("generates a redacted schema contract from Postgres adapter DDL without a connection string", async () => {
    const { buildEnterprisePostgresSchemaContract } = await import("../enterprise-postgres");
    const contract = await buildEnterprisePostgresSchemaContract({ schemaName: "public" });

    expect(contract.schemaVersion).toBe("sena-enterprise-postgres-schema-contract/v1");
    expect(contract.status).toBe("pass");
    expect(contract.summary).toEqual(expect.objectContaining({
      tableCount: 20,
      productionTableCount: 19,
      verifierTableCount: 1,
      indexCount: 71,
      uniqueIndexCount: 10,
      ddlStatementCount: 98,
      destructiveDdlStatementCount: 0
    }));
    expect(contract.evidence).toEqual(expect.arrayContaining([
      "schemaContractSource=enterprisePostgresAdapterEnsureSchema",
      "schemaContractSqlValues=hashed",
      "migrationMode=create-table-if-not-exists|add-column-if-not-exists|alter-column-nullability|create-index-if-not-exists",
      "connectionValues=excluded",
      "secretValues=excluded"
    ]));
    expect(JSON.stringify(contract)).not.toContain("postgres://");
    expect(JSON.stringify(contract)).not.toContain("super-secret");
  });

  it("requires a valid Postgres probe artifact and verified-at timestamp before confirmation", async () => {
    process.env.SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED = "1";
    process.env.SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256 = "c".repeat(64);
    const { enterprisePostgresProbeReadiness } = await import("../enterprise-postgres");

    expect(enterprisePostgresProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: true,
      verifiedAtConfigured: false
    }));

    const verifiedAt = new Date().toISOString();
    process.env.SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT = verifiedAt;
    process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION = "pass";
    expect(enterprisePostgresProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "c".repeat(64),
      verifiedAt,
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
  });

  it("requires a live Postgres probe for production and production performance gates", async () => {
    const { enterprisePostgresLiveProbeRequired, enterprisePostgresProbeReadiness } = await import("../enterprise-postgres");

    expect(enterprisePostgresLiveProbeRequired({ NODE_ENV: "production" })).toBe(true);
    expect(enterprisePostgresLiveProbeRequired({ SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH: "1" })).toBe(true);
    expect(enterprisePostgresLiveProbeRequired({ SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED: "1" })).toBe(true);
    expect(enterprisePostgresLiveProbeRequired({ SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED: "1" })).toBe(true);
    expect(enterprisePostgresLiveProbeRequired({})).toBe(false);

    const readiness = enterprisePostgresProbeReadiness({
      SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH: "1",
      SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED: "1",
      SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256: "not-a-sha",
      SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT: new Date().toISOString()
    });

    expect(readiness).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: false,
      verifiedAtConfigured: true
    }));
    expect(readiness.evidence).toEqual(expect.arrayContaining([
      "postgresLiveProbeRequired=true",
      "postgresProbeExplicitlyRequired=false",
      "postgresProductionRuntime=false",
      "postgresProductionPerformancePathRequired=true",
      "postgresProductionEvidenceManifestRequired=false",
      "postgresSaasOperatingModelApproved=false",
      "postgresProbeArtifactSha256=missing-or-invalid",
      "postgresProbeVerifiedAt=valid"
    ]));
  });

  it("keeps production Postgres state under review when the live probe is confirmed but the schema contract is missing", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256 = "c".repeat(64);
    process.env.SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT = new Date().toISOString();
    process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION = "pass";
    configurePostgresEnv();

    const { buildEnterpriseProductionPerformancePath } = await import("../enterprise/ops-productionization");
    const performancePath = buildEnterpriseProductionPerformancePath({
      opsStatus: {
        storage: {
          engine: "postgres",
          primaryStateRuntime: {
            mode: "postgres",
            activePrimary: "postgres",
            postgresPrimaryRequested: true
          }
        },
        counts: {
          uploads: 0
        },
        deployment: {
          objectStorageNativeConfigured: true,
          objectStorageWebhookConfigured: false,
          opsTokenConfigured: true
        }
      } as never,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody: {
        source: "postgres-table",
        totalUploads: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        skipped: 0,
        pendingReview: 0,
        eligibleForDelivery: 0,
        eligibleDelivered: 0,
        eligibleUndelivered: 0,
        ready: true,
        evidence: ["uploadCustodySource=postgres-table"]
      }
    });
    const postgresItem = performancePath.items.find((item) => item.id === "production-postgres-state");

    expect(postgresItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(performancePath.summary.blockers).toContain("production-postgres-state");
    expect(postgresItem?.evidence).toEqual(expect.arrayContaining([
      "postgresSchemaContractRequired=true",
      "postgresSchemaContractConfirmed=false",
      "postgresSchemaContractArtifactSha256=missing-or-invalid",
      "postgresLiveProbeRequired=true",
      "postgresLiveProbeConfirmed=true",
      "postgresProbeArtifactSha256=present",
      "postgresProbeVerifiedAt=valid",
      "activePrimary=postgres",
      "stateStore=postgres"
    ]));
    expect(postgresItem?.nextAction).toContain("sena:postgres:schema-contract");
    const serialized = JSON.stringify(postgresItem);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("example.db");
  });

  it("keeps the production path under review until the Vercel runtime header preflight is bound", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    configurePostgresEnv();

    const opsStatus = {
      storage: {
        engine: "postgres",
        primaryStateRuntime: {
          mode: "postgres",
          activePrimary: "postgres",
          postgresPrimaryRequested: true
        }
      },
      counts: {
        uploads: 0
      },
      deployment: {
        objectStorageNativeConfigured: true,
        objectStorageWebhookConfigured: false,
        opsTokenConfigured: true
      }
    } as never;
    const uploadObjectStorageCustody = {
      source: "postgres-table" as const,
      totalUploads: 0,
      delivered: 0,
      pending: 0,
      failed: 0,
      skipped: 0,
      pendingReview: 0,
      eligibleForDelivery: 0,
      eligibleDelivered: 0,
      eligibleUndelivered: 0,
      ready: true as const,
      evidence: ["uploadCustodySource=postgres-table"]
    };

    const { buildEnterpriseProductionPerformancePath } = await import("../enterprise/ops-productionization");
    const blockedPath = buildEnterpriseProductionPerformancePath({
      opsStatus,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody
    });
    const blockedHeaderItem = blockedPath.items.find((item) => item.id === "production-runtime-header");

    expect(blockedHeaderItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(blockedPath.summary.blockers).toContain("production-runtime-header");
    expect(blockedHeaderItem?.evidence).toEqual(expect.arrayContaining([
      "vercelPreflightConfirmed=false",
      "vercelPreflightArtifactSha256=missing-or-invalid",
      "vercelPreflightVerifiedAt=missing-or-invalid",
      "expectedRuntimeHeader=enterprise-neon|enterprise-postgres",
      "localRuntimeHeader=enterprise-local"
    ]));

    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED = "1";
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256 = "8".repeat(64);
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT = new Date().toISOString();

    const missingMetadataPath = buildEnterpriseProductionPerformancePath({
      opsStatus,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody
    });
    const missingMetadataHeaderItem = missingMetadataPath.items.find((item) => item.id === "production-runtime-header");

    expect(missingMetadataHeaderItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(missingMetadataPath.summary.blockers).toContain("production-runtime-header");
    expect(missingMetadataHeaderItem?.evidence).toEqual(expect.arrayContaining([
      "vercelPreflightConfirmed=true",
      "vercelPreflightArtifactSha256=present",
      "vercelPreflightVerifiedAt=valid",
      "vercelPreflightTargetHostSha256=missing-or-mismatch",
      "vercelPreflightDeploymentUrlSha256=missing-or-invalid",
      "vercelPreflightHttpStatus=missing-or-non-success",
      "vercelPreflightRuntimeHeader=missing-or-local"
    ]));

    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256 = sha256Text("www.sena.hk");
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256 = "7".repeat(64);
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS = "200";
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER = "enterprise-neon";

    const readyPath = buildEnterpriseProductionPerformancePath({
      opsStatus,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody
    });
    const readyHeaderItem = readyPath.items.find((item) => item.id === "production-runtime-header");

    expect(readyHeaderItem).toEqual(expect.objectContaining({
      status: "pass"
    }));
    expect(readyPath.summary.blockers).not.toContain("production-runtime-header");
    expect(readyHeaderItem?.evidence).toEqual(expect.arrayContaining([
      "vercelPreflightConfirmed=true",
      "vercelPreflightArtifactSha256=present",
      "vercelPreflightVerifiedAt=valid"
    ]));
    expect(JSON.stringify({ blockedHeaderItem, readyHeaderItem })).not.toContain("super-secret");
    expect(JSON.stringify({ blockedHeaderItem, readyHeaderItem })).not.toContain("postgres://");
  });

  it("exposes the Postgres probe through the ops route with redacted headers", async () => {
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    configurePostgresEnv();
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        private payloadSha256 = "";

        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          if (/CREATE TABLE IF NOT EXISTS/.test(normalizedSql)) return { rows: [], rowCount: 0 };
          if (/INSERT INTO/.test(normalizedSql)) {
            this.payloadSha256 = String(values[1]);
            return { rows: [], rowCount: 1 };
          }
          if (/SELECT payload_sha256/.test(normalizedSql)) return { rows: [{ payload_sha256: this.payloadSha256 }], rowCount: 1 };
          if (/DELETE FROM/.test(normalizedSql)) return { rows: [], rowCount: 1 };
          throw new Error(`Unexpected Postgres query: ${normalizedSql}`);
        }

        async end() {
          return undefined;
        }
      }
    }));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    const route = await import("../../../app/api/sena/ops/postgres/route");
    const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/postgres", {
      headers: {
        authorization: "Bearer sena-test-ops-token"
      }
    }));
    const body = await response.json() as { schemaVersion?: string; status?: string };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("sena-enterprise-postgres-probe/v1");
    expect(body.status).toBe("pass");
    expect(response.headers.get("x-sena-postgres-probe")).toBe("pass");
    expect(response.headers.get("x-sena-postgres-provider")).toBe("postgres");
    expect(response.headers.get("x-sena-postgres-create-table")).toBe("pass");
    expect(response.headers.get("x-sena-postgres-insert")).toBe("pass");
    expect(response.headers.get("x-sena-postgres-select")).toBe("pass");
    expect(response.headers.get("x-sena-postgres-delete")).toBe("pass");
    expect(response.headers.get("x-sena-postgres-cleanup")).toBe("deleted");
    expect(response.headers.get("x-sena-postgres-connection-value")).toBe("excluded");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-postgres");
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(JSON.stringify(body)).not.toContain("example.db");
    expect(JSON.stringify(body)).not.toContain("postgres://");
  });
});
