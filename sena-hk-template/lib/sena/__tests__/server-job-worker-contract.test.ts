import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "DATABASE_URL",
  "SENA_OPS_TOKEN",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_SECRET",
  "SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD",
  "SENA_JOB_WORKER_RUNTIME",
  "SENA_JOB_WORKER_CALLBACK_URL",
  "SENA_JOB_WORKER_RUNBOOK_URL",
  "SENA_JOB_WORKER_OWNER",
  "SENA_JOB_WORKER_HEARTBEAT_CONFIRMED",
  "SENA_JOB_WORKER_HEARTBEAT_SHA256",
  "SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT",
  "SENA_JOB_WORKER_CONTRACT_REQUIRED",
  "SENA_JOB_WORKER_CONTRACT_CONFIRMED",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256",
  "SENA_JOB_WORKER_CONTRACT_VERIFIED_AT",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"
];

function configureWorkerContractEnv(enterpriseDbDir: string) {
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
  process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
  process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb";
  process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
  process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
  process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
  process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
  process.env.SENA_JOB_WORKER_RUNTIME = "institution-managed-worker";
  process.env.SENA_JOB_WORKER_CALLBACK_URL = "https://sena.example.test/api/sena/ops/jobs";
  process.env.SENA_JOB_WORKER_RUNBOOK_URL = "https://ops.example.test/sena-job-worker";
  process.env.SENA_JOB_WORKER_OWNER = "Institution platform rotation";
  process.env.SENA_JOB_WORKER_HEARTBEAT_CONFIRMED = "1";
  process.env.SENA_JOB_WORKER_HEARTBEAT_SHA256 = "c".repeat(64);
  process.env.SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT = new Date().toISOString();
}

describe("SENA server job worker contract", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.resetModules();
  });

  it("requires a managed queue, indexed Postgres store, callback, runbook, and worker heartbeat without leaking values", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-worker-contract-"));
    configureWorkerContractEnv(enterpriseDbDir);

    const { getEnterpriseServerJobWorkerContract } = await import("../enterprise/server-job-worker-contract");
    const contract = getEnterpriseServerJobWorkerContract();
    const serialized = JSON.stringify(contract);

    expect(contract.schemaVersion).toBe("sena-enterprise-server-job-worker-contract/v1");
    expect(contract.productionReady).toBe(true);
    expect(contract.status).toBe("pass");
    expect(contract.provider.queueProductionReady).toBe(true);
    expect(contract.statusStore.activeStore).toBe("postgres-table");
    expect(contract.worker.callbackConfigured).toBe(true);
    expect(contract.worker.heartbeatArtifactSha256).toBe("c".repeat(64));
    expect(contract.contract.rawPayloadPersistedInJobStore).toBe(false);
    expect(contract.contract.acceptedActions).toEqual([
      "mark-running",
      "mark-succeeded",
      "mark-failed",
      "retry",
      "dead-letter"
    ]);
    expect(contract.contract.acceptedWorkerActions).toEqual([
      "run-import",
      "run-analysis",
      "run-publication-export",
      "run-reliability",
      "run-validation"
    ]);
    expect(contract.contract.payloadPolicy).toBe("project-or-upload-pointer-default");
    expect(contract.contract.inlinePayloadAllowed).toBe(false);
    expect(contract.contract.inlinePayloadPolicy).toBe("disabled");
    expect(contract.contract.legacyInlineEnvEffect).toBe("none-deprecated");
    expect(contract.contract.inlinePayloadRequiresExplicitEnv).toBeNull();
    expect(contract.contract.retryDispatchPolicy).toBe("local-polling-only");
    expect(contract.contract.pushProviderRetryPolicy).toBe("provider-native-or-resubmit");
    expect(contract.contract.parseWarningDisclosurePolicy).toBe("run-import-and-run-reliability-must-report-parse-repair-warnings");
    expect(contract.contract.uploadWarningCountSemantics).toBe("unset-until-a-parser-reports");
    expect(contract.contract.uploadWarningsCallbackField).toBe("uploadWarnings");
    expect(contract.evidence).toContain("parseWarningDisclosurePolicy=run-import-and-run-reliability-must-report-parse-repair-warnings");
    expect(contract.evidence).toContain("uploadWarningCountSemantics=unset-until-a-parser-reports");
    expect(contract.evidence).toContain("uploadWarningsCallbackField=uploadWarnings");
    expect(contract.evidence).toContain("workerInlinePayloadCustody=durable-pointers-only");
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    expect(getEnterpriseServerJobWorkerContract().contract).toEqual(expect.objectContaining({
      inlinePayloadAllowed: false,
      inlinePayloadPolicy: "disabled",
      legacyInlineEnvEffect: "none-deprecated"
    }));
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena.example.test/api/sena/ops/jobs");
    expect(serialized).not.toContain("ops.example.test");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("sena-test-job-secret");
    expect(serialized).not.toContain("Institution platform rotation");
  });

  it("requires a valid archived worker contract artifact before production performance confirmation", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_JOB_WORKER_CONTRACT_CONFIRMED = "1";
    process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256 = "f".repeat(64);
    const { serverJobWorkerContractReadiness } = await import("../enterprise/server-job-worker-contract");

    expect(serverJobWorkerContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: true,
      verifiedAtConfigured: false
    }));
    expect(serverJobWorkerContractReadiness().evidence).toEqual(expect.arrayContaining([
      "serverJobWorkerContractProductionPerformancePathRequired=true",
      "serverJobWorkerContractArtifactSha256=present",
      "serverJobWorkerContractVerifiedAt=missing-or-invalid",
      "serverJobWorkerContractCommand=npm run sena:jobs:worker-contract"
    ]));

    const verifiedAt = new Date().toISOString();
    process.env.SENA_JOB_WORKER_CONTRACT_VERIFIED_AT = verifiedAt;
    process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION = "pass";
    expect(serverJobWorkerContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "f".repeat(64),
      verifiedAt,
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
  });

  it("exposes the worker contract through an ops bearer route", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-worker-contract-route-"));
    configureWorkerContractEnv(enterpriseDbDir);

    const route = await import("../../../app/api/sena/ops/jobs/worker-contract/route");
    const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/jobs/worker-contract", {
      headers: {
        authorization: "Bearer sena-test-ops-token"
      }
    }));
    const body = await response.json() as {
      schemaVersion?: string;
      productionReady?: boolean;
      access?: { mode?: string };
    };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-sena-server-job-worker-contract")).toBe("pass");
    expect(response.headers.get("x-sena-server-job-worker-ready")).toBe("true");
    expect(response.headers.get("x-sena-server-job-worker-url-values")).toBe("excluded");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-jobs-worker-contract");
    expect(body.schemaVersion).toBe("sena-enterprise-server-job-worker-contract/v1");
    expect(body.productionReady).toBe(true);
    expect(body.access?.mode).toBe("bearer");
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena.example.test/api/sena/ops/jobs");
    expect(serialized).not.toContain("ops.example.test");
    expect(serialized).not.toContain("sena-test-job-secret");
  });

  it("keeps the worker heartbeat under review without production callback ownership prerequisites", async () => {
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";

    const { verifyEnterpriseServerJobWorkerHeartbeat } = await import("../enterprise/server-job-queue");
    const heartbeat = await verifyEnterpriseServerJobWorkerHeartbeat();
    const serialized = JSON.stringify(heartbeat);

    expect(heartbeat.schemaVersion).toBe("sena-enterprise-server-job-worker-heartbeat/v1");
    expect(heartbeat.status).toBe("review");
    expect(heartbeat.heartbeat.writeReadConfirmed).toBe(false);
    expect(heartbeat.heartbeat.syntheticUserDataIncluded).toBe(false);
    expect(heartbeat.missing).toEqual(expect.arrayContaining([
      "SENA_ENTERPRISE_STATE_STORE=postgres with configured Postgres adapter",
      "SENA_JOB_WORKER_RUNTIME",
      "SENA_JOB_WORKER_CALLBACK_URL",
      "SENA_JOB_WORKER_RUNBOOK_URL",
      "SENA_JOB_WORKER_OWNER or SENA_ALERTING_OWNER"
    ]));
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena-test-job-secret");
  });

  it("passes a fully configured synthetic heartbeat through the indexed status store", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-worker-heartbeat-pass-"));
    configureWorkerContractEnv(enterpriseDbDir);
    const pg = new RouteMemoryPostgres();
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

    const { verifyEnterpriseServerJobWorkerHeartbeat } = await import("../enterprise/server-job-queue");
    const heartbeat = await verifyEnterpriseServerJobWorkerHeartbeat();
    const stored = pg.serverJobs[0];

    expect(heartbeat).toEqual(expect.objectContaining({
      status: "pass",
      heartbeat: expect.objectContaining({
        finalStatus: "succeeded",
        attempts: 1,
        writeReadConfirmed: true
      }),
      missing: []
    }));
    expect(stored).toEqual(expect.objectContaining({
      kind: "analysis",
      status: "succeeded",
      payload_summary: expect.objectContaining({
        commandCustody: "synthetic-heartbeat-v1",
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }),
      lifecycle: expect.objectContaining({ attempts: 1 })
    }));
    expect(pg.queries.some((query) => (
      /UPDATE "public"\."sena_enterprise_server_jobs"/i.test(query) &&
      /synthetic-heartbeat-v1/i.test(query) &&
      /server_job_worker_heartbeat_/i.test(query)
    ))).toBe(true);
    expect(JSON.stringify(heartbeat)).not.toContain("sena-test-job-secret");
    expect(JSON.stringify(heartbeat)).not.toContain("jobs.example.test");
  });

  it("exposes the worker heartbeat through an ops bearer mutation route without leaking values", async () => {
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";

    const route = await import("../../../app/api/sena/ops/jobs/worker-heartbeat/route");
    const response = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs/worker-heartbeat", {
      method: "POST",
      headers: {
        authorization: "Bearer sena-test-ops-token"
      }
    }));
    const body = await response.json() as {
      schemaVersion?: string;
      status?: string;
      access?: { mode?: string };
    };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(response.headers.get("x-sena-server-job-worker-heartbeat")).toBe("review");
    expect(response.headers.get("x-sena-server-job-worker-heartbeat-url-values")).toBe("excluded");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-jobs-worker-heartbeat");
    expect(body.schemaVersion).toBe("sena-enterprise-server-job-worker-heartbeat/v1");
    expect(body.status).toBe("review");
    expect(body.access?.mode).toBe("bearer");
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena-test-job-secret");
    expect(serialized).not.toContain("sena-test-ops-token");
  });
});
