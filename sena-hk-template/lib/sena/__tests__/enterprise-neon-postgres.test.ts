import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSenaAnalysisRun } from "../analysis-run";
import { buildSenaGroupComparison } from "../inference";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview
} from "../reliability";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "SENA_OBJECT_STORAGE_WEBHOOK_URL",
  "SENA_OBJECT_STORAGE_WEBHOOK_SECRET"
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
    const primaryCheck = opsStatus.checks.find((check) => check.id === "ops-primary-state-runtime");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    const persistence = governance.checks.find((check) => check.id === "persistence");
    const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
    const databaseDecision = deployment.platformDecisions.find((decision) => decision.id === "native-managed-database");

    expect(storage.engine).toBe("file-backed-json");
    expect(storage.primaryStateRuntime).toEqual(expect.objectContaining({
      mode: "file",
      activePrimary: "file",
      postgresConfigured: true,
      postgresPrimaryRequested: false
    }));
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
    expect(primaryCheck).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(primaryCheck?.evidence).toEqual(expect.arrayContaining([
      "stateStore=file",
      "activePrimary=file",
      "postgresConfigured=true",
      "postgresPrimaryRequested=false",
      "postgresConnectionHash=present"
    ]));
    expect(persistence?.evidence).toEqual(expect.arrayContaining([
      "engine=file-backed-json",
      "stateStore=file",
      "activePrimary=file",
      "postgresPrimaryRequested=false",
      "adapter=neon",
      "url=DATABASE_URL",
      expect.stringMatching(/^connectionHash=[a-f0-9]{64}$/)
    ]));
    expect(databaseDecision).toEqual(expect.objectContaining({
      status: "open"
    }));
    expect(databaseDecision?.evidence).toEqual(expect.arrayContaining([
      "current=file-backed-json",
      "stateStore=file",
      "activePrimary=file",
      "postgresPrimaryRequested=false",
      "native=sena-enterprise-postgres-adapter/v1",
      "url=DATABASE_URL",
      expect.stringMatching(/^connectionHash=[a-f0-9]{64}$/)
    ]));
    expect(JSON.stringify({ opsStatus, governance, deployment })).not.toContain("super-secret");
    expect(JSON.stringify({ opsStatus, governance, deployment })).not.toContain("example.neon.tech");
  });

  it("reports Neon as the active primary state store only when the state-store switch is set", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-primary-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
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
    const primaryCheck = opsStatus.checks.find((check) => check.id === "ops-primary-state-runtime");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    const persistence = governance.checks.find((check) => check.id === "persistence");
    const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
    const databaseDecision = deployment.platformDecisions.find((decision) => decision.id === "native-managed-database");

    expect(storage.engine).toBe("neon-postgres");
    expect(storage.primaryStateRuntime).toEqual(expect.objectContaining({
      mode: "postgres",
      activePrimary: "postgres",
      postgresConfigured: true,
      postgresPrimaryRequested: true
    }));
    expect(primaryCheck).toEqual(expect.objectContaining({
      status: "pass"
    }));
    expect(primaryCheck?.evidence).toEqual(expect.arrayContaining([
      "stateStore=postgres",
      "activePrimary=postgres",
      "postgresConfigured=true",
      "postgresPrimaryRequested=true",
      "postgresConnectionHash=present"
    ]));
    expect(persistence?.evidence).toEqual(expect.arrayContaining([
      "engine=neon-postgres",
      "stateStore=postgres",
      "activePrimary=postgres",
      "postgresPrimaryRequested=true",
      "adapter=neon",
      "url=DATABASE_URL",
      expect.stringMatching(/^connectionHash=[a-f0-9]{64}$/)
    ]));
    expect(databaseDecision).toEqual(expect.objectContaining({
      status: "ready"
    }));
    expect(databaseDecision?.evidence).toEqual(expect.arrayContaining([
      "current=neon-postgres",
      "stateStore=postgres",
      "activePrimary=postgres",
      "postgresPrimaryRequested=true",
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

  it("mirrors upload registry metadata and custody into the indexed Postgres upload table", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-uploads-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 201 })) as typeof fetch;
    process.env.SENA_OBJECT_STORAGE_WEBHOOK_URL = "https://objects.example.test/sena/uploads";
    process.env.SENA_OBJECT_STORAGE_WEBHOOK_SECRET = "sena-object-storage-secret";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Neon Upload PI",
        email: "neon-upload-pi@example.edu",
        password: "sena-secure-123",
        organization: "Neon Upload Lab",
        plan: "lab"
      });

      const uploads = await enterprise.createEnterpriseUploadsWithPostgresMirror(registered.context, {
        teamId: registered.context.teams[0].id,
        files: [{
          name: "people.csv",
          contentType: "text/csv",
          bytes: Buffer.from("person_id,name\np1,Ada\n", "utf8"),
          importProfile: "csv",
          warningCount: 0
        }]
      });

      expect(uploads).toHaveLength(1);
      expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_uploads"/.test(query.sql))).toBe(true);
      expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_uploads_team_created_idx"/.test(query.sql))).toBe(true);
      const firstUpsert = queries.find((query) => /INSERT INTO "public"\."sena_enterprise_uploads"/.test(query.sql));
      expect(firstUpsert?.values).toEqual(expect.arrayContaining([
        uploads[0].id,
        registered.context.teams[0].id,
        registered.context.user.id,
        "people.csv",
        "text/csv",
        uploads[0].sha256,
        "csv",
        "passed"
      ]));

      queries.length = 0;
      const delivery = await enterprise.deliverEnterpriseUploadBlobs(registered.context, {
        teamId: registered.context.teams[0].id,
        uploadId: uploads[0].id
      });

      expect(delivery.status).toBe("completed");
      const custodyUpsert = queries.find((query) => /INSERT INTO "public"\."sena_enterprise_uploads"/.test(query.sql));
      expect(custodyUpsert?.values[14]).toEqual(expect.objectContaining({
        status: "delivered",
        providerMode: "webhook",
        endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        objectKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        httpStatus: 201,
        deliveredAt: expect.any(String)
      }));
      const opsStatus = enterprise.getEnterpriseOpsStatus();
      expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-object-storage-webhook")?.evidence)
        .toContain("uploadRegistryStore=postgres-table");
      const metrics = enterprise.buildEnterpriseOpsMetrics();
      expect(metrics).toContain("sena_enterprise_upload_registry_store_postgres 1");
      expect(JSON.stringify({ delivery, opsStatus, metrics })).not.toContain("super-secret");
      expect(JSON.stringify({ delivery, opsStatus, metrics })).not.toContain("example.neon.tech");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SENA_OBJECT_STORAGE_WEBHOOK_URL;
      delete process.env.SENA_OBJECT_STORAGE_WEBHOOK_SECRET;
    }
  });

  it("mirrors import run metadata into the indexed Postgres import run table", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-imports-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Neon Import PI",
      email: "neon-import-pi@example.edu",
      password: "sena-secure-123",
      organization: "Neon Import Lab",
      plan: "lab"
    });

    const run = await enterprise.createEnterpriseImportRunWithPostgresMirror(registered.context, {
      teamId: registered.context.teams[0].id,
      uploadIds: ["upload_source_contract"],
      sources: [{
        name: "lesson-study-sena-contract.json",
        profile: "sena-contract",
        rows: lessonStudySenaContract.utterances.length,
        warnings: ["metadata row normalized"]
      }],
      warnings: ["metadata row normalized"],
      dataset: lessonStudySenaContract,
      cleaningManifest: {
        schemaVersion: SENA_SCHEMA_VERSIONS.importCleaningManifest,
        summary: {
          fileCount: 1,
          totalSourceRows: lessonStudySenaContract.utterances.length,
          adapterProfiles: ["sena-contract"],
          warningCount: 1,
          derivedPlaceholderCount: 0,
          skippedRowCount: 0,
          duplicateRowCount: 0,
          missingTableWarningCount: 0,
          transcriptNoCodeMarkerCount: 0
        },
        sources: [{
          name: "lesson-study-sena-contract.json",
          profile: "sena-contract",
          rows: lessonStudySenaContract.utterances.length,
          warningCount: 1,
          transformations: ["contract-normalization"]
        }],
        checks: [{
          id: "contract-shape",
          label: "Contract shape",
          status: "pass",
          evidence: ["profile=sena-contract"]
        }]
      }
    });

    expect(run.status).toBe("completed-with-warnings");
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_import_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_import_runs_team_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_import_runs_warnings_created_idx"/.test(query.sql))).toBe(true);
    const upsert = queries.find((query) => /INSERT INTO "public"\."sena_enterprise_import_runs"/.test(query.sql));
    expect(upsert?.values).toEqual(expect.arrayContaining([
      run.id,
      registered.context.teams[0].id,
      registered.context.user.id,
      "completed-with-warnings",
      1,
      ["upload_source_contract"],
      ["sena-contract"],
      1,
      ["metadata row normalized"],
      SENA_SCHEMA_VERSIONS.importCleaningManifest
    ]));
    expect(upsert?.values[10]).toEqual(expect.objectContaining({
      people: lessonStudySenaContract.people.length,
      utterances: lessonStudySenaContract.utterances.length,
      codes: lessonStudySenaContract.codebook.length
    }));

    const opsStatus = enterprise.getEnterpriseOpsStatus();
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-primary-state-runtime")?.evidence)
      .toContain("importRunRegistryStore=postgres-table");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    expect(governance.checks.find((check: { id: string }) => check.id === "import-run-history")?.evidence)
      .toContain("importRunRegistryPostgresTable=sena_enterprise_import_runs");
    const metrics = enterprise.buildEnterpriseOpsMetrics();
    expect(metrics).toContain("sena_enterprise_import_run_registry_store_postgres 1");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("super-secret");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("example.neon.tech");
  });

  it("mirrors analysis run metadata into the indexed Postgres analysis run table", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-analysis-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Neon Analysis PI",
      email: "neon-analysis-pi@example.edu",
      password: "sena-secure-123",
      organization: "Neon Analysis Lab",
      plan: "lab"
    });
    const analysisArtifact = buildSenaAnalysisRun({
      dataset: lessonStudySenaContract,
      title: "Neon Indexed SENA Analysis",
      includeRuntimeBundle: true
    });

    const run = await enterprise.createEnterpriseAnalysisRunWithPostgresMirror(registered.context, {
      teamId: registered.context.teams[0].id,
      run: analysisArtifact
    });

    expect(run.sourceKind).toBe("dataset");
    expect(run.includeRuntimeBundle).toBe(true);
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_analysis_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_analysis_runs_team_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_analysis_runs_source_created_idx"/.test(query.sql))).toBe(true);
    const upsert = queries.find((query) => /INSERT INTO "public"\."sena_enterprise_analysis_runs"/.test(query.sql));
    expect(upsert?.values).toEqual(expect.arrayContaining([
      run.id,
      "sena-analysis-run/v1",
      registered.context.teams[0].id,
      registered.context.user.id,
      "dataset",
      "Neon Indexed SENA Analysis",
      true
    ]));
    expect(upsert?.values[12]).toEqual(expect.objectContaining({
      reportSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      projectSnapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      runtimeBundleSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));

    const opsStatus = enterprise.getEnterpriseOpsStatus();
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-primary-state-runtime")?.evidence)
      .toContain("analysisRunRegistryStore=postgres-table");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    expect(governance.checks.find((check: { id: string }) => check.id === "analysis-run-history")?.evidence)
      .toContain("analysisRunRegistryPostgresTable=sena_enterprise_analysis_runs");
    const metrics = enterprise.buildEnterpriseOpsMetrics();
    expect(metrics).toContain("sena_enterprise_analysis_run_registry_store_postgres 1");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("super-secret");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("example.neon.tech");
  });

  it("mirrors reliability run metadata and review status into the indexed Postgres reliability run table", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-reliability-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Neon Reliability PI",
      email: "neon-reliability-pi@example.edu",
      password: "sena-secure-123",
      organization: "Neon Reliability Lab",
      plan: "lab"
    });
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Question", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Question", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "0" },
      { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
    ]);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations);
    const reviewPatch = reliabilityDashboardToReview(dashboard, "Neon Reliability Reviewer");

    const run = await enterprise.createEnterpriseReliabilityRunWithPostgresMirror(registered.context, {
      teamId: registered.context.teams[0].id,
      reviewer: "Neon Reliability Reviewer",
      fileCount: 1,
      annotationCount: parsed.annotations.length,
      inputFiles: [{ name: "coder-ratings.csv", size: 128, sha256: "b".repeat(64) }],
      dashboard,
      reviewPatch
    });
    expect(run.status).toBe("pending-review");

    const reviewed = await enterprise.reviewEnterpriseReliabilityRunWithPostgresMirror(registered.context, run.id, {
      status: "approved",
      notes: "No reliability disagreements remain."
    });

    expect(reviewed.status).toBe("approved");
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_reliability_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_reliability_runs_team_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_reliability_runs_status_created_idx"/.test(query.sql))).toBe(true);
    const upserts = queries.filter((query) => /INSERT INTO "public"\."sena_enterprise_reliability_runs"/.test(query.sql));
    expect(upserts).toHaveLength(2);
    expect(upserts[0]?.values).toEqual(expect.arrayContaining([
      run.id,
      registered.context.teams[0].id,
      registered.context.user.id,
      "pending-review",
      "Neon Reliability Reviewer",
      1,
      parsed.annotations.length,
      dashboard.coderCount,
      dashboard.itemCount,
      dashboard.codeCount,
      dashboard.meanPairwiseKappa,
      dashboard.krippendorffAlphaNominal,
      dashboard.disagreementCount,
      1,
      0
    ]));
    expect(upserts[1]?.values).toEqual(expect.arrayContaining([
      run.id,
      registered.context.teams[0].id,
      registered.context.user.id,
      "approved",
      registered.context.user.id,
      "Neon Reliability Reviewer"
    ]));

    const opsStatus = enterprise.getEnterpriseOpsStatus();
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-primary-state-runtime")?.evidence)
      .toContain("reliabilityRunRegistryStore=postgres-table");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    expect(governance.checks.find((check: { id: string }) => check.id === "reliability-run-history")?.evidence)
      .toContain("reliabilityRunRegistryPostgresTable=sena_enterprise_reliability_runs");
    const metrics = enterprise.buildEnterpriseOpsMetrics();
    expect(metrics).toContain("sena_enterprise_reliability_run_registry_store_postgres 1");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("super-secret");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("example.neon.tech");
  });

  it("mirrors validation run metadata and review status into the indexed Postgres validation run table", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-validation-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Neon Validation PI",
      email: "neon-validation-pi@example.edu",
      password: "sena-secure-123",
      organization: "Neon Validation Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const analysisArtifact = buildSenaAnalysisRun({
      dataset: lessonStudySenaContract,
      title: "Neon Validation Project",
      includeRuntimeBundle: true
    });
    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId,
      title: "Neon Validation Project",
      snapshot: analysisArtifact.projectSnapshot
    });
    const comparison = buildSenaGroupComparison({
      dataset: lessonStudySenaContract,
      groupField: "role",
      groupA: "Lead teacher",
      groupB: "Curriculum designer",
      iterations: 100,
      bootstrapIterations: 100
    });

    const run = await enterprise.createEnterpriseValidationRunWithPostgresMirror(registered.context, {
      teamId,
      projectId: project.id,
      preregistrationNote: "Neon validation preregistration fixture.",
      methodNote: "Postgres mirror validation fixture.",
      result: comparison,
      parityEvidence: {
        expertReviewRequired: false,
        studySpecificInferenceReference: "prereg:neon-validation-model-v1"
      }
    });
    expect(run.status).toBe("pending-review");
    expect(run.parityEvidence?.formalInference.status).toBe("model-referenced");

    const reviewed = await enterprise.reviewEnterpriseValidationRunWithPostgresMirror(registered.context, run.id, {
      status: "approved",
      notes: "Approved as Postgres mirror validation evidence."
    });

    expect(reviewed.status).toBe("approved");
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_validation_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_validation_runs_team_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_validation_runs_status_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_validation_runs_formal_inference_created_idx"/.test(query.sql))).toBe(true);
    const upserts = queries.filter((query) => /INSERT INTO "public"\."sena_enterprise_validation_runs"/.test(query.sql));
    expect(upserts).toHaveLength(2);
    expect(upserts[0]?.values).toEqual(expect.arrayContaining([
      run.id,
      teamId,
      project.id,
      registered.context.user.id,
      "pending-review",
      "socialStrength",
      "role",
      "Lead teacher",
      "Curriculum designer",
      100,
      comparison.permutation.seed,
      comparison.permutation.pTwoSided,
      1,
      comparison.observedDifference,
      SENA_SCHEMA_VERSIONS.groupComparison,
      run.preregistrationPlan?.planHash,
      "ready-for-review",
      run.parityEvidence?.validationRunHash,
      "model-referenced"
    ]));
    expect(upserts[0]?.values[23]).toEqual(expect.objectContaining({
      id: run.id,
      projectId: project.id,
      parityEvidence: expect.objectContaining({
        formalInference: expect.objectContaining({
          status: "model-referenced"
        })
      })
    }));
    expect(upserts[1]?.values).toEqual(expect.arrayContaining([
      run.id,
      teamId,
      project.id,
      registered.context.user.id,
      "approved",
      registered.context.user.id,
      "socialStrength"
    ]));

    const opsStatus = enterprise.getEnterpriseOpsStatus();
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-primary-state-runtime")?.evidence)
      .toContain("validationRunRegistryStore=postgres-table");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    expect(governance.checks.find((check: { id: string }) => check.id === "validation-run-history")?.evidence)
      .toContain("validationRunRegistryPostgresTable=sena_enterprise_validation_runs");
    const metrics = enterprise.buildEnterpriseOpsMetrics();
    expect(metrics).toContain("sena_enterprise_validation_run_registry_store_postgres 1");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("super-secret");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("example.neon.tech");
  });

  it("mirrors expert review metadata and claim scope into the indexed Postgres expert review table", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-expert-review-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          queries.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Neon Expert PI",
      email: "neon-expert-pi@example.edu",
      password: "sena-secure-123",
      organization: "Neon Expert Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const analysisArtifact = buildSenaAnalysisRun({
      dataset: lessonStudySenaContract,
      title: "Neon Expert Review Project",
      includeRuntimeBundle: true
    });
    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId,
      title: "Neon Expert Review Project",
      snapshot: analysisArtifact.projectSnapshot
    });

    const review = await enterprise.createEnterpriseExpertReviewWithPostgresMirror(registered.context, {
      projectId: project.id,
      target: { kind: "claim", id: "claim-package", label: "Claim package review" },
      reviewerName: "Domain Expert",
      reviewerRole: "External lesson-study reviewer",
      expertiseArea: "Lesson study and discourse analysis",
      status: "changes-requested",
      claimScope: "exploratory-only",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 3 },
      strengths: "The evidence package is auditable.",
      concerns: "Claim language needs tighter boundaries.",
      recommendations: "Keep publication claims exploratory until the second walkthrough.",
      limitations: "Single pilot dataset."
    });
    expect(review.status).toBe("changes-requested");

    const approved = await enterprise.reviewEnterpriseExpertReviewWithPostgresMirror(registered.context, review.id, {
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { interpretationValidity: 4 },
      recommendations: "Approved with bounded publication language."
    });

    expect(approved.status).toBe("approved");
    expect(approved.claimScope).toBe("claim-ready-with-limits");
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_expert_reviews"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_expert_reviews_team_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_expert_reviews_project_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_expert_reviews_claim_scope_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_expert_reviews_target_created_idx"/.test(query.sql))).toBe(true);
    const upserts = queries.filter((query) => /INSERT INTO "public"\."sena_enterprise_expert_reviews"/.test(query.sql));
    expect(upserts).toHaveLength(2);
    expect(upserts[0]?.values).toEqual(expect.arrayContaining([
      review.id,
      teamId,
      project.id,
      registered.context.user.id,
      "changes-requested",
      "claim",
      "claim-package",
      "Claim package review",
      "Domain Expert",
      "External lesson-study reviewer",
      "Lesson study and discourse analysis",
      "exploratory-only",
      4,
      4,
      3
    ]));
    expect(upserts[0]?.values[15]).toEqual(expect.objectContaining({
      id: review.id,
      projectId: project.id,
      target: expect.objectContaining({
        kind: "claim",
        id: "claim-package"
      }),
      concerns: "Claim language needs tighter boundaries."
    }));
    expect(upserts[1]?.values).toEqual(expect.arrayContaining([
      review.id,
      teamId,
      project.id,
      registered.context.user.id,
      "approved",
      "claim-ready-with-limits",
      4,
      4,
      4
    ]));

    const opsStatus = enterprise.getEnterpriseOpsStatus();
    expect(opsStatus.checks.find((check: { id: string }) => check.id === "ops-primary-state-runtime")?.evidence)
      .toContain("expertReviewRegistryStore=postgres-table");
    const governance = enterprise.getEnterpriseGovernanceStatus();
    expect(governance.checks.find((check: { id: string }) => check.id === "domain-expert-review")?.evidence)
      .toContain("expertReviewRegistryPostgresTable=sena_enterprise_expert_reviews");
    const metrics = enterprise.buildEnterpriseOpsMetrics();
    expect(metrics).toContain("sena_enterprise_expert_review_registry_store_postgres 1");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("super-secret");
    expect(JSON.stringify({ opsStatus, governance, metrics })).not.toContain("example.neon.tech");
  });

  it("builds claim evidence packages from indexed Postgres reliability validation expert review and adjudication tables", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-claim-package-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const reliabilityPayloads = new Map<string, Record<string, unknown>>();
    const validationPayloads = new Map<string, Record<string, unknown>>();
    const expertReviewPayloads = new Map<string, Record<string, unknown>>();
    const adjudicationPayloads = new Map<string, Record<string, unknown>>();
    const projectCommentPayloads = new Map<string, Record<string, unknown>>();
    const projectPresencePayloads = new Map<string, Record<string, unknown>>();
    let primaryState: { revision: number; payload: unknown } | null = null;
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          queries.push({ sql: normalizedSql, values });
          if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/.test(normalizedSql)) {
            return {
              rows: primaryState ? [{ revision: primaryState.revision, payload: primaryState.payload }] : [],
              rowCount: primaryState ? 1 : 0
            };
          }
          if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO NOTHING/.test(normalizedSql)) {
            if (!primaryState) {
              primaryState = {
                revision: 0,
                payload: values[2]
              };
            }
            return { rows: [], rowCount: 1 };
          }
          if (/UPDATE "public"\."sena_enterprise_state" SET payload/.test(normalizedSql)) {
            primaryState = {
              revision: (primaryState?.revision ?? 0) + 1,
              payload: values[0]
            };
            return { rows: [{ revision: primaryState.revision }], rowCount: 1 };
          }
          if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO UPDATE/.test(normalizedSql)) {
            primaryState = {
              revision: (primaryState?.revision ?? -1) + 1,
              payload: values[2]
            };
            return { rows: [{ revision: primaryState.revision }], rowCount: 1 };
          }
          if (/INSERT INTO "public"\."sena_enterprise_reliability_runs"/.test(normalizedSql)) {
            reliabilityPayloads.set(String(values[0]), values[19] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_validation_runs"/.test(normalizedSql)) {
            validationPayloads.set(String(values[0]), values[23] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_expert_reviews"/.test(normalizedSql)) {
            expertReviewPayloads.set(String(values[0]), values[15] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_adjudications"/.test(normalizedSql)) {
            adjudicationPayloads.set(String(values[0]), values[9] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_project_comments"/.test(normalizedSql)) {
            projectCommentPayloads.set(String(values[0]), values[8] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_project_presence"/.test(normalizedSql)) {
            projectPresencePayloads.set(String(values[0]), values[6] as Record<string, unknown>);
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_reliability_runs"/.test(normalizedSql)) {
            return {
              rows: Array.from(reliabilityPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: reliabilityPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_validation_runs"/.test(normalizedSql)) {
            return {
              rows: Array.from(validationPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: validationPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_expert_reviews"/.test(normalizedSql)) {
            return {
              rows: Array.from(expertReviewPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: expertReviewPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_adjudications"/.test(normalizedSql)) {
            return {
              rows: Array.from(adjudicationPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: adjudicationPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_project_comments"/.test(normalizedSql)) {
            return {
              rows: Array.from(projectCommentPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: projectCommentPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_project_presence"/.test(normalizedSql)) {
            return {
              rows: Array.from(projectPresencePayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .filter((payload) => !values[1] || Date.parse(String(payload.expiresAt)) > Date.parse(String(values[1])))
                .map((payload) => ({ payload })),
              rowCount: projectPresencePayloads.size
            };
          }
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Neon Claim PI",
      email: "neon-claim-pi@example.edu",
      password: "sena-secure-123",
      organization: "Neon Claim Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const analysisArtifact = buildSenaAnalysisRun({
      dataset: lessonStudySenaContract,
      title: "Neon Claim Evidence Project",
      includeRuntimeBundle: true
    });
    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId,
      title: "Neon Claim Evidence Project",
      snapshot: analysisArtifact.projectSnapshot
    });
    primaryState = {
      revision: 0,
      payload: enterprise.readEnterpriseDb()
    };
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Question", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Question", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "0" },
      { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
    ]);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations);
    const reliabilityRun = await enterprise.createEnterpriseReliabilityRunWithPostgresMirror(registered.context, {
      teamId,
      projectId: project.id,
      reviewer: "Claim Reliability Reviewer",
      fileCount: 1,
      annotationCount: parsed.annotations.length,
      inputFiles: [{ name: "claim-ratings.csv", size: 128, sha256: "c".repeat(64) }],
      dashboard,
      reviewPatch: reliabilityDashboardToReview(dashboard, "Claim Reliability Reviewer")
    });
    await enterprise.reviewEnterpriseReliabilityRunWithPostgresMirror(registered.context, reliabilityRun.id, {
      status: "approved",
      notes: "No disagreements remain for the claim evidence package."
    });
    const adjudication = await enterprise.createEnterpriseAdjudicationRecordWithPostgresMirror(registered.context, project.id, {
      reliabilityRunId: reliabilityRun.id,
      itemId: "u1",
      codeId: "Question",
      decision: "include",
      notes: "Indexed adjudication evidence for claim package.",
      coderValues: { c1: true, c2: true }
    });

    const comparison = buildSenaGroupComparison({
      dataset: lessonStudySenaContract,
      groupField: "role",
      groupA: "Lead teacher",
      groupB: "Curriculum designer",
      iterations: 100,
      bootstrapIterations: 100
    });
    const validationRun = await enterprise.createEnterpriseValidationRunWithPostgresMirror(registered.context, {
      teamId,
      projectId: project.id,
      preregistrationNote: "Claim package preregistration fixture.",
      methodNote: "Claim package Postgres evidence fixture.",
      result: comparison,
      parityEvidence: {
        expertReviewRequired: false,
        studySpecificInferenceReference: "prereg:claim-package-postgres-v1"
      }
    });
    await enterprise.reviewEnterpriseValidationRunWithPostgresMirror(registered.context, validationRun.id, {
      status: "approved",
      notes: "Approved validation evidence for claim package."
    });

    const expertReview = await enterprise.createEnterpriseExpertReviewWithPostgresMirror(registered.context, {
      projectId: project.id,
      target: { kind: "validation-run", id: validationRun.id, label: "Approved validation run" },
      reviewerName: "Domain Expert",
      reviewerRole: "External reviewer",
      expertiseArea: "Lesson study and discourse analysis",
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      strengths: "The reliability and validation evidence are linked.",
      concerns: "Claims remain bounded to the pilot dataset.",
      recommendations: "Use limited claim language.",
      limitations: "Single project evidence package."
    });

    const claimPackage = await enterprise.getEnterpriseClaimEvidencePackageWithPostgresEvidence(registered.context, {
      projectId: project.id
    });

    expect(claimPackage.status).toBe("claim-ready-with-limits");
    expect(claimPackage.evidenceSource).toEqual(expect.objectContaining({
      reliabilityRuns: "postgres-table",
      validationRuns: "postgres-table",
      expertReviews: "postgres-table",
      adjudications: "postgres-table"
    }));
    expect(claimPackage.evidence.reliability?.runId).toBe(reliabilityRun.id);
    expect(claimPackage.evidence.reliability?.adjudications).toBe(1);
    expect(claimPackage.evidence.validation?.runId).toBe(validationRun.id);
    expect(claimPackage.evidence.expertReview?.reviewId).toBe(expertReview.id);
    expect(claimPackage.summary).toEqual(expect.objectContaining({
      reliability: "approved",
      validation: "approved",
      expertReview: "approved",
      blockers: 0
    }));
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_reliability_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_validation_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_expert_reviews"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_adjudications"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_adjudications_project_created_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /INSERT INTO "public"\."sena_enterprise_adjudications"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_adjudications"/.test(query.sql))).toBe(true);
    expect(adjudicationPayloads.get(adjudication.id)).toEqual(expect.objectContaining({
      id: adjudication.id,
      projectId: project.id,
      reliabilityRunId: reliabilityRun.id
    }));
    expect(JSON.stringify(claimPackage)).not.toContain("super-secret");
    expect(JSON.stringify(claimPackage)).not.toContain("example.neon.tech");
  });

  it("loads project collaboration evidence from indexed Postgres reliability validation expert review and adjudication tables", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-neon-collaboration-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "neon";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";

    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const reliabilityPayloads = new Map<string, Record<string, unknown>>();
    const validationPayloads = new Map<string, Record<string, unknown>>();
    const expertReviewPayloads = new Map<string, Record<string, unknown>>();
    const adjudicationPayloads = new Map<string, Record<string, unknown>>();
    const projectCommentPayloads = new Map<string, Record<string, unknown>>();
    const projectPresencePayloads = new Map<string, Record<string, unknown>>();
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          queries.push({ sql: normalizedSql, values });
          if (/INSERT INTO "public"\."sena_enterprise_reliability_runs"/.test(normalizedSql)) {
            reliabilityPayloads.set(String(values[0]), values[19] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_validation_runs"/.test(normalizedSql)) {
            validationPayloads.set(String(values[0]), values[23] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_expert_reviews"/.test(normalizedSql)) {
            expertReviewPayloads.set(String(values[0]), values[15] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_adjudications"/.test(normalizedSql)) {
            adjudicationPayloads.set(String(values[0]), values[9] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_project_comments"/.test(normalizedSql)) {
            projectCommentPayloads.set(String(values[0]), values[8] as Record<string, unknown>);
          }
          if (/INSERT INTO "public"\."sena_enterprise_project_presence"/.test(normalizedSql)) {
            projectPresencePayloads.set(String(values[0]), values[6] as Record<string, unknown>);
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_reliability_runs"/.test(normalizedSql)) {
            return {
              rows: Array.from(reliabilityPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: reliabilityPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_validation_runs"/.test(normalizedSql)) {
            return {
              rows: Array.from(validationPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: validationPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_expert_reviews"/.test(normalizedSql)) {
            return {
              rows: Array.from(expertReviewPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: expertReviewPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_adjudications"/.test(normalizedSql)) {
            return {
              rows: Array.from(adjudicationPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: adjudicationPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_project_comments"/.test(normalizedSql)) {
            return {
              rows: Array.from(projectCommentPayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .map((payload) => ({ payload })),
              rowCount: projectCommentPayloads.size
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_project_presence"/.test(normalizedSql)) {
            return {
              rows: Array.from(projectPresencePayloads.values())
                .filter((payload) => payload.projectId === values[0])
                .filter((payload) => !values[1] || Date.parse(String(payload.expiresAt)) > Date.parse(String(values[1])))
                .map((payload) => ({ payload })),
              rowCount: projectPresencePayloads.size
            };
          }
          return { rows: [], rowCount: 1 };
        }

        async end() {
          return undefined;
        }
      }
    }));

    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Neon Collaboration PI",
      email: "neon-collaboration-pi@example.edu",
      password: "sena-secure-123",
      organization: "Neon Collaboration Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const analysisArtifact = buildSenaAnalysisRun({
      dataset: lessonStudySenaContract,
      title: "Neon Collaboration Evidence Project",
      includeRuntimeBundle: true
    });
    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId,
      title: "Neon Collaboration Evidence Project",
      snapshot: analysisArtifact.projectSnapshot
    });
    await enterprise.touchEnterpriseProjectPresenceWithPostgresMirror(registered.context, project.id, {
      activeView: "workspace",
      cursorLabel: "Fusion canvas"
    });
    const comment = await enterprise.createEnterpriseProjectCommentWithPostgresMirror(registered.context, project.id, {
      body: "Please review the bounded collaboration evidence.",
      target: { kind: "project", label: "Collaboration evidence" }
    });
    const resolvedComment = await enterprise.resolveEnterpriseProjectCommentWithPostgresMirror(registered.context, project.id, comment.id);
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Question", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Question", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "0" },
      { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
    ]);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations);
    const reliabilityRun = await enterprise.createEnterpriseReliabilityRunWithPostgresMirror(registered.context, {
      teamId,
      projectId: project.id,
      reviewer: "Collaboration Reliability Reviewer",
      fileCount: 1,
      annotationCount: parsed.annotations.length,
      inputFiles: [{ name: "collaboration-ratings.csv", size: 128, sha256: "d".repeat(64) }],
      dashboard,
      reviewPatch: reliabilityDashboardToReview(dashboard, "Collaboration Reliability Reviewer")
    });
    await enterprise.reviewEnterpriseReliabilityRunWithPostgresMirror(registered.context, reliabilityRun.id, {
      status: "approved",
      notes: "Collaboration evidence approved."
    });
    const adjudication = await enterprise.createEnterpriseAdjudicationRecordWithPostgresMirror(registered.context, project.id, {
      reliabilityRunId: reliabilityRun.id,
      itemId: "u1",
      codeId: "Question",
      decision: "include",
      notes: "Indexed adjudication evidence for collaboration.",
      coderValues: { c1: true, c2: true }
    });

    const comparison = buildSenaGroupComparison({
      dataset: lessonStudySenaContract,
      groupField: "role",
      groupA: "Lead teacher",
      groupB: "Curriculum designer",
      iterations: 100,
      bootstrapIterations: 100
    });
    const validationRun = await enterprise.createEnterpriseValidationRunWithPostgresMirror(registered.context, {
      teamId,
      projectId: project.id,
      preregistrationNote: "Collaboration package preregistration fixture.",
      methodNote: "Collaboration package Postgres evidence fixture.",
      result: comparison,
      parityEvidence: {
        expertReviewRequired: false,
        studySpecificInferenceReference: "prereg:collaboration-postgres-v1"
      }
    });
    await enterprise.reviewEnterpriseValidationRunWithPostgresMirror(registered.context, validationRun.id, {
      status: "approved",
      notes: "Approved validation evidence for collaboration."
    });

    const expertReview = await enterprise.createEnterpriseExpertReviewWithPostgresMirror(registered.context, {
      projectId: project.id,
      target: { kind: "validation-run", id: validationRun.id, label: "Collaboration validation run" },
      reviewerName: "Collaboration Expert",
      reviewerRole: "External reviewer",
      expertiseArea: "Lesson study and collaboration analysis",
      status: "approved",
      claimScope: "claim-ready-with-limits",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      strengths: "The collaboration evidence is linked.",
      concerns: "Claims remain bounded.",
      recommendations: "Use limited claim language.",
      limitations: "Single project evidence package."
    });

    const collaboration = await enterprise.listEnterpriseProjectCollaborationWithPostgresEvidence(registered.context, project.id);

    expect(collaboration.evidenceSource).toEqual(expect.objectContaining({
      reliabilityRuns: "postgres-table",
      validationRuns: "postgres-table",
      expertReviews: "postgres-table",
      adjudications: "postgres-table",
      comments: "postgres-table",
      presence: "postgres-table"
    }));
    expect(collaboration.comments.map((entry) => entry.id)).toContain(comment.id);
    expect(collaboration.comments.find((entry) => entry.id === comment.id)?.status).toBe("resolved");
    expect(collaboration.presence.map((entry) => entry.userId)).toContain(registered.context.user.id);
    expect(collaboration.reliabilityRuns.map((run) => run.id)).toContain(reliabilityRun.id);
    expect(collaboration.validationRuns.map((run) => run.id)).toContain(validationRun.id);
    expect(collaboration.expertReviews.map((review) => review.id)).toContain(expertReview.id);
    expect(collaboration.adjudications.map((record) => record.id)).toContain(adjudication.id);
    expect(collaboration.evidenceSource.evidence).toEqual(expect.arrayContaining([
      "projectCollaborationComments=postgres-table",
      "projectCollaborationPresence=postgres-table",
      "projectCollaborationReliabilityRuns=postgres-table",
      "projectCollaborationValidationRuns=postgres-table",
      "projectCollaborationExpertReviews=postgres-table",
      "projectCollaborationAdjudications=postgres-table"
    ]));
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_reliability_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_validation_runs"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_expert_reviews"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_adjudications"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_project_comments"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_project_presence"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_project_comments_project_updated_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_project_presence_project_active_idx"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /INSERT INTO "public"\."sena_enterprise_project_comments"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /INSERT INTO "public"\."sena_enterprise_project_presence"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_project_comments"/.test(query.sql))).toBe(true);
    expect(queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_project_presence"/.test(query.sql))).toBe(true);
    expect(projectCommentPayloads.get(comment.id)).toEqual(expect.objectContaining({
      id: comment.id,
      projectId: project.id,
      status: "resolved",
      updatedAt: resolvedComment.updatedAt
    }));
    expect(JSON.stringify(collaboration)).not.toContain("super-secret");
    expect(JSON.stringify(collaboration)).not.toContain("example.neon.tech");
  });
});
