import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "DATABASE_URL",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_OPS_TOKEN"
];

describe("SENA server job Postgres store", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.doUnmock("pg");
    vi.resetModules();
  });

  it("stores and updates server job status in the indexed Postgres job table when Postgres is primary", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-server-job-postgres-"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb";
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

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

    const enterprise = await import("../enterprise");
    const serverJobs = await import("../enterprise/server-job-queue");
    const runtime = enterprise.serverJobStoreRuntime();
    expect(runtime).toEqual(expect.objectContaining({
      activeStore: "postgres-table",
      postgresConfigured: true,
      postgresPrimaryActive: true
    }));

    const job = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs",
      actorUserId: "user_postgres_jobs",
      payload: {
        action: "run-analysis",
        projectId: "project_postgres_jobs"
      },
      payloadSummary: {
        source: "project",
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    expect(pg.serverJobs.find((row) => row.id === job.id)).toEqual(expect.objectContaining({
      id: job.id,
      status: "queued",
      team_id: "team_postgres_jobs",
      project_id: "project_postgres_jobs"
    }));

    let releaseSourcePersistence!: () => void;
    let sourcePersistenceEntered!: () => void;
    const sourcePersistenceGate = new Promise<void>((resolve) => {
      releaseSourcePersistence = resolve;
    });
    const sourcePersistenceStarted = new Promise<void>((resolve) => {
      sourcePersistenceEntered = resolve;
    });
    const preparingJobPromise = enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_preparing",
      actorUserId: "user_postgres_jobs",
      payload: { action: "run-analysis", projectId: "project_postgres_jobs_preparing" },
      payloadSummary: {
        source: "project",
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      },
      beforeDispatch: async () => {
        sourcePersistenceEntered();
        await sourcePersistenceGate;
      }
    });
    await sourcePersistenceStarted;
    const preparingRow = pg.serverJobs.find((row) => row.project_id === "project_postgres_jobs_preparing");
    expect(preparingRow).toBeDefined();
    const prematurePostgresClaim = await serverJobs.claimEnterpriseServerJob({
      jobId: String(preparingRow?.id),
      workerRunId: "worker_run_pg_premature"
    });
    releaseSourcePersistence();
    const preparedJob = await preparingJobPromise;
    const readyPostgresClaims = await Promise.all([
      serverJobs.claimEnterpriseServerJob({ jobId: preparedJob.id, workerRunId: "worker_run_pg_ready_left" }),
      serverJobs.claimEnterpriseServerJob({ jobId: preparedJob.id, workerRunId: "worker_run_pg_ready_right" })
    ]);
    expect(prematurePostgresClaim).toEqual(expect.objectContaining({
      claimed: false,
      reason: "server_job_worker_source_not_ready"
    }));
    expect(readyPostgresClaims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(readyPostgresClaims.filter((claim) => !claim.claimed)).toHaveLength(1);

    const route = await import("../../../app/api/sena/ops/jobs/route");
    const authHeaders = {
      authorization: "Bearer sena-test-ops-token"
    };
    const listResponse = await route.GET(new Request("https://sena.example.test/api/sena/ops/jobs?status=queued", {
      headers: authHeaders
    }));
    const listBody = await listResponse.json() as {
      schemaVersion?: string;
      summary?: { total?: number; queued?: number };
      jobs?: Array<{ id?: string; status?: string }>;
    };
    expect(listResponse.status, JSON.stringify(listBody)).toBe(200);
    expect(listBody.schemaVersion).toBe("sena-enterprise-server-job-list/v1");
    expect(listBody.summary).toEqual(expect.objectContaining({
      total: 1,
      queued: 1
    }));
    expect(listBody.jobs?.[0]).toEqual(expect.objectContaining({
      id: job.id,
      status: "queued"
    }));

    const runningResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "mark-running",
        jobId: job.id,
        workerRunId: "worker_run_pg"
      })
    }));
    const runningBody = await runningResponse.json() as {
      schemaVersion?: string;
      job?: { id?: string; status?: string; lifecycle?: { attempts?: number; workerRunId?: string } };
    };
    expect(runningResponse.status).toBe(200);
    expect(runningResponse.headers.get("x-sena-server-job-status")).toBe("running");
    expect(runningBody.schemaVersion).toBe("sena-enterprise-server-job-status-update/v1");
    expect(runningBody.job).toEqual(expect.objectContaining({
      id: job.id,
      status: "running"
    }));
    expect(runningBody.job?.lifecycle).toEqual(expect.objectContaining({
      attempts: 1,
      workerRunId: "worker_run_pg"
    }));
    expect(pg.serverJobs.find((row) => row.id === job.id)).toEqual(expect.objectContaining({
      status: "running"
    }));
    expect(pg.auditRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "ops.server_job.status",
        teamId: "team_postgres_jobs",
        projectId: "project_postgres_jobs"
      })
    ]));

    const raceJob = await enterprise.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: "team_postgres_jobs",
      projectId: "project_postgres_jobs_race",
      actorUserId: "user_postgres_jobs",
      payload: { action: "run-analysis", projectId: "project_postgres_jobs_race" },
      payloadSummary: {
        source: "project",
        hasInlineSnapshot: false,
        hasInlineDataset: true,
        payloadValuesExcluded: true
      }
    });
    const [leftClaim, rightClaim] = await Promise.all([
      serverJobs.claimEnterpriseServerJob({ jobId: raceJob.id, workerRunId: "worker_run_pg_left" }),
      serverJobs.claimEnterpriseServerJob({ jobId: raceJob.id, workerRunId: "worker_run_pg_right" })
    ]);
    const claims = [leftClaim, rightClaim];
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1);
    expect(pg.queries.some((query) => (
      /UPDATE "public"\."sena_enterprise_server_jobs"/i.test(query) &&
      /WHERE id = \$1 AND status = 'queued'/i.test(query) &&
      /delivery->>'sourceReady'/i.test(query) &&
      /RETURNING \*/i.test(query)
    ))).toBe(true);

    expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
    expect(pg.queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_server_jobs"/.test(query))).toBe(true);
    expect(pg.queries.some((query) => /CREATE INDEX IF NOT EXISTS "sena_enterprise_server_jobs_status_updated_idx"/.test(query))).toBe(true);
    expect(pg.queries.some((query) => /INSERT INTO "public"\."sena_enterprise_server_jobs"/.test(query))).toBe(true);
    expect(pg.queries.some((query) => /INSERT INTO "public"\."sena_enterprise_audit_log"/.test(query))).toBe(true);
    expect(JSON.stringify({ runtime, listBody })).not.toContain("super-secret");
    expect(JSON.stringify({ runtime, listBody })).not.toContain("example.db");
  });
});
