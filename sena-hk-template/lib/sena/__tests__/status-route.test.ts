import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import type { SenaEnterpriseDb } from "../enterprise/state";

const expectedIdentityReadinessIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

describe("SENA ops status route", () => {
  it("returns identity readiness headers beside runtime status for deployment monitors", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-status-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/status/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/status", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        status?: string;
      };

      expect(response.headers.get("x-sena-ops-status")).toBe(body.status);
      expect(response.headers.get("x-sena-deployment-readiness-status")).toBe("blocked");
      expect(response.headers.get("x-sena-identity-readiness-blocking-count"))
        .toBe(String(expectedIdentityReadinessIds.length));
      expect(response.headers.get("x-sena-identity-readiness-blockers"))
        .toBe(expectedIdentityReadinessIds.join("|"));
      expect(response.headers.get("x-sena-identity-evidence-host-allowlist")).toBe("review");
      expect(response.headers.get("x-sena-identity-secret-version-binding")).toBe("review");
      expect(response.headers.get("x-sena-identity-secret-store-reference")).toBe("review");
      expect(response.headers.get("x-sena-identity-secret-rotation-cadence")).toBe("review");
      expect(response.headers.get("x-sena-identity-idp-tenant-binding")).toBe("review");
      expect(response.headers.get("x-sena-identity-lifecycle-owner-mode")).toBe("review");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("reads server job runtime counters from the indexed Postgres job table when Postgres is primary", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-status-postgres-jobs-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED", "1");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.db/senadb");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    const context = postgresEvidenceSessionContext("team_status_pg");
    const nowIso = "2026-06-30T00:00:00.000Z";
    const jobRows = [
      serverJobRow("job_queued", "queued", true),
      serverJobRow("job_running", "running", false),
      serverJobRow("job_failed", "failed", true),
      serverJobRow("job_dead", "dead-lettered", false)
    ];
    let postgresState: { revision: number; payload: SenaEnterpriseDb } | null = null;
    const postgresQueries: string[] = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          postgresQueries.push(normalizedSql);
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_observed_requests"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE INDEX IF NOT EXISTS "sena_enterprise_server_jobs_/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE (UNIQUE )?INDEX IF NOT EXISTS "sena_enterprise_observed_requests_/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE INDEX IF NOT EXISTS "sena_enterprise_audit_log_/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
            return {
              rows: postgresState ? [{ revision: postgresState.revision, payload: postgresState.payload }] : [],
              rowCount: postgresState ? 1 : 0
            };
          }
          if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO NOTHING/i.test(normalizedSql)) {
            if (!postgresState) {
              postgresState = {
                revision: 0,
                payload: values[2] as SenaEnterpriseDb
              };
            }
            return { rows: [], rowCount: 1 };
          }
          if (/UPDATE "public"\."sena_enterprise_state" SET payload/i.test(normalizedSql)) {
            postgresState = {
              revision: (postgresState?.revision ?? 0) + 1,
              payload: values[0] as SenaEnterpriseDb
            };
            return { rows: [{ revision: postgresState.revision }], rowCount: 1 };
          }
          if (/SELECT count\(\*\) AS total FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [{ total: 0 }], rowCount: 1 };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/SELECT count\(\*\) AS total/i.test(normalizedSql)) {
            return {
              rows: [{
                total: jobRows.length,
                queued: jobRows.filter((row) => row.status === "queued").length,
                running: jobRows.filter((row) => row.status === "running").length,
                succeeded: 0,
                failed: jobRows.filter((row) => row.status === "failed").length,
                dead_lettered: jobRows.filter((row) => row.status === "dead-lettered").length,
                retryable: jobRows.filter((row) => (row.lifecycle as { retryable?: boolean }).retryable).length
              }],
              rowCount: 1
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
            return { rows: [jobRows[0]], rowCount: 1 };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_observed_requests"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected Postgres query: ${normalizedSql}`);
        }

        async end() {
          return undefined;
        }
      }
    }));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const { emptyEnterpriseDb } = await import("../enterprise/state");
      postgresState = {
        revision: 7,
        payload: {
          ...emptyEnterpriseDb(),
          users: [context.user],
          teams: [{
            id: "team_status_pg",
            name: "Postgres Status Lab",
            plan: "enterprise",
            organization: "Postgres Status Lab",
            createdAt: nowIso,
            updatedAt: nowIso
          }],
          memberships: context.memberships,
          sessions: [context.session],
          notifications: [{
            id: "notification_status_pg",
            kind: "team.invite",
            status: "delivered",
            channel: "in-app",
            userId: context.user.id,
            teamId: "team_status_pg",
            title: "Invitation",
            body: "A team invitation is ready.",
            createdAt: nowIso,
            deliveredAt: nowIso,
            detail: {},
            webhookDelivery: {
              provider: "local-sink",
              status: "pending",
              endpointHash: "local-sink",
              queuedAt: nowIso,
              attempts: 0,
              maxAttempts: 3
            }
          }],
          emailDeliveries: [{
            id: "email_status_pg",
            kind: "team.invite",
            status: "pending",
            provider: "local-sink",
            endpointHash: "local-sink",
            teamId: "team_status_pg",
            userId: context.user.id,
            recipientEmailHash: "b".repeat(64),
            recipientEmailDomain: "example.edu",
            sealedPayload: {
              algorithm: "aes-256-gcm",
              iv: "c".repeat(24),
              tag: "d".repeat(32),
              ciphertext: "e".repeat(64)
            },
            queuedAt: nowIso,
            attempts: 0,
            maxAttempts: 3
          }]
        }
      };
      const route = await import("../../../app/api/sena/ops/status/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/status", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        status?: string;
        queues?: {
          serverJobsQueued?: number;
          serverJobsRunning?: number;
          serverJobsFailed?: number;
          serverJobsDeadLettered?: number;
          serverJobsRetryable?: number;
        };
        counts?: { users?: number; teams?: number; notifications?: number; sessions?: number; serverJobs?: number };
        storage?: {
          primaryStateRuntime?: { activePrimary?: string };
          engine?: string;
          writable?: boolean;
          writeProbe?: string;
          writePolicy?: string;
          dbFileExists?: boolean;
          lockProbe?: string;
        };
        checks?: Array<{ id: string; status: string; evidence: string[] }>;
      };
      const serverJobCheck = body.checks?.find((check) => check.id === "ops-server-job-runtime");
      const primaryStateCheck = body.checks?.find((check) => check.id === "ops-primary-state-runtime");
      const storageWritableCheck = body.checks?.find((check) => check.id === "ops-storage-writable");
      const storageReadableCheck = body.checks?.find((check) => check.id === "ops-storage-readable");
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.status).toBe("review");
      expect(body.storage?.primaryStateRuntime?.activePrimary).toBe("postgres");
      expect(body.storage).toEqual(expect.objectContaining({
        engine: "postgres",
        writable: true,
        writeProbe: "pass",
        writePolicy: "blocked",
        dbFileExists: false,
        lockProbe: "pass"
      }));
      expect(body.counts).toEqual(expect.objectContaining({
        users: 1,
        teams: 1,
        notifications: 1,
        sessions: 1
      }));
      expect(body.queues).toEqual(expect.objectContaining({
        notificationsPendingWebhook: 1,
        emailPendingWebhook: 1
      }));
      expect(body.queues).toEqual(expect.objectContaining({
        serverJobsQueued: 1,
        serverJobsRunning: 1,
        serverJobsFailed: 1,
        serverJobsDeadLettered: 1,
        serverJobsRetryable: 2
      }));
      expect(body.counts?.serverJobs).toBe(4);
      expect(serverJobCheck).toEqual(expect.objectContaining({
        status: "review"
      }));
      expect(serverJobCheck?.evidence).toEqual(expect.arrayContaining([
        "serverJobStore=postgres-table",
        "serverJobQueueCountsSource=postgres-table",
        "serverJobQueueCountsRead=pass",
        "total=4",
        "queued=1",
        "failed=1",
        "deadLettered=1"
      ]));
      expect(primaryStateCheck?.evidence).toEqual(expect.arrayContaining([
        "opsStateSnapshotSource=postgres-primary-state",
        "activePrimary=postgres"
      ]));
      expect(storageReadableCheck).toEqual(expect.objectContaining({
        status: "pass"
      }));
      expect(storageReadableCheck?.evidence).toEqual(expect.arrayContaining([
        "storageEngine=postgres",
        "activePrimary=postgres",
        "opsStateSnapshotSource=postgres-primary-state",
        "primaryStateReadable=true",
        "dbFileExists=false"
      ]));
      expect(storageWritableCheck).toEqual(expect.objectContaining({
        status: "pass"
      }));
      expect(storageWritableCheck?.evidence).toEqual(expect.arrayContaining([
        "storageEngine=postgres",
        "activePrimary=postgres",
        "opsStateSnapshotSource=postgres-primary-state",
        "primaryWriteProbe=pass",
        "writeProbe=pass",
        "writePolicy=blocked",
        "fileBackendWriteProbe=fail",
        "fileBackendWritePolicy=blocked",
        "fileBackendWriteBlocked=true",
        "fileBackendWriteBlockedReason=SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED"
      ]));
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("example.db");

      const readinessRoute = await import("../../../app/api/sena/ops/readiness/route");
      const readinessResponse = await readinessRoute.GET(new Request("https://sena.example.test/api/sena/ops/readiness", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const readinessBody = await readinessResponse.json() as {
        blocking?: Array<{ id: string; status: string; evidence: string[] }>;
        advisory?: Array<{ id: string; status: string; evidence: string[] }>;
      };
      const readinessStorage = readinessBody.blocking?.find((item) => item.id === "storage-writable");
      const readinessBackup = readinessBody.blocking?.find((item) => item.id === "write-before-backup");
      const readinessStoragePath = readinessBody.blocking?.find((item) => item.id === "managed-storage-path");
      const managedDatabaseDecision = readinessBody.advisory?.find((item) => item.id === "managed-database-decision");

      expect(readinessStorage).toEqual(expect.objectContaining({ status: "pass" }));
      expect(readinessStorage?.evidence).toEqual(expect.arrayContaining([
        "storageEngine=postgres",
        "activePrimary=postgres",
        "primaryStorageReadable=true",
        "storageWritable=true",
        "writeProbe=pass",
        "lockProbe=pass",
        "primaryStorageLockReady=true"
      ]));
      expect(readinessBackup).toEqual(expect.objectContaining({ status: "pass" }));
      expect(readinessBackup?.evidence).toEqual(expect.arrayContaining([
        "activePrimary=postgres",
        "localWriteBeforeBackupApplicable=false",
        "backupExists=false"
      ]));
      expect(readinessStoragePath).toEqual(expect.objectContaining({ status: "pass" }));
      expect(readinessStoragePath?.evidence).toEqual(expect.arrayContaining([
        "storageEngine=postgres",
        "activePrimary=postgres",
        "configuredDirectory=env-configured"
      ]));
      expect(managedDatabaseDecision).toEqual(expect.objectContaining({ status: "pass" }));
      expect(managedDatabaseDecision?.evidence).toEqual(expect.arrayContaining([
        "storageEngine=postgres",
        "current=postgres",
        "activePrimary=postgres"
      ]));
      expect(JSON.stringify(readinessBody)).not.toContain("super-secret");
      expect(JSON.stringify(readinessBody)).not.toContain("example.db");

      const goLiveRoute = await import("../../../app/api/sena/ops/go-live-rehearsal/route");
      const goLiveResponse = await goLiveRoute.GET(new Request("https://sena.example.test/api/sena/ops/go-live-rehearsal", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const goLiveBody = await goLiveResponse.json() as {
        postCutoverMonitor?: {
          checks?: Array<{ id: string; evidence: string[] }>;
        };
      };
      const goLiveOpsStatusCheck = goLiveBody.postCutoverMonitor?.checks?.find((check) => check.id === "ops-status");
      expect(goLiveResponse.status).toBe(200);
      expect(goLiveOpsStatusCheck?.evidence).toEqual(expect.arrayContaining([
        "serverJobsTotal=4",
        "serverJobsQueued=1",
        "serverJobsRunning=1",
        "serverJobsFailed=1",
        "serverJobsDeadLettered=1",
        "serverJobsRetryable=2",
        "serverJobStore=postgres-table",
        "serverJobQueueCountsSource=postgres-table",
        "serverJobQueueCountsRead=pass"
      ]));
      expect(JSON.stringify(goLiveBody)).not.toContain("super-secret");
      expect(JSON.stringify(goLiveBody)).not.toContain("example.db");

      const serverJobCountReadsBeforePost = postgresQueries
        .filter((query) => /SELECT count\(\*\) AS total/i.test(query)).length;
      const { buildEnterpriseGoLivePostResponseWithPostgresEvidence } = await import("../enterprise/ops-response-builders");
      await expect(buildEnterpriseGoLivePostResponseWithPostgresEvidence(
        context,
        {
          action: "start-post-cutover-observation",
          teamId: "team_status_pg",
          environment: "pilot-production",
          releaseVersion: "2026.06.30-postgres-cutover"
        }
      )).rejects.toMatchObject({
        code: "post_cutover_observation_start_blocked",
        status: 409
      });
      const serverJobCountReadsAfterPost = postgresQueries
        .filter((query) => /SELECT count\(\*\) AS total/i.test(query)).length;
      expect(serverJobCountReadsAfterPost).toBeGreaterThan(serverJobCountReadsBeforePost);
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

function postgresEvidenceSessionContext(teamId: string): SenaEnterpriseSessionContext {
  const nowIso = new Date("2026-06-30T00:00:00.000Z").toISOString();
  const userId = "user_status_pg";
  return {
    user: {
      id: userId,
      email: "postgres-status@example.edu",
      name: "Postgres Status Owner",
      organization: "Postgres Status Lab",
      ssoIdentities: [],
      createdAt: nowIso,
      updatedAt: nowIso
    },
    session: {
      id: "sess_status_pg",
      userId,
      tokenHash: "redacted-token-hash",
      createdAt: nowIso,
      expiresAt: "2026-07-01T00:00:00.000Z",
      sessionProfile: "standard",
      ttlDays: 7
    },
    memberships: [{
      id: "membership_status_pg",
      teamId,
      userId,
      role: "owner",
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso
    }],
    teams: [{
      id: teamId,
      name: "Postgres Status Lab",
      plan: "enterprise",
      organization: "Postgres Status Lab",
      createdAt: nowIso,
      updatedAt: nowIso
    }]
  };
}

function serverJobRow(id: string, status: string, retryable: boolean) {
  const nowIso = new Date("2026-06-30T00:00:00.000Z").toISOString();
  return {
    id,
    schema_version: "sena-enterprise-server-job/v2",
    kind: "analysis",
    status,
    team_id: "team_status_pg",
    project_id: "project_status_pg",
    actor_user_id: "user_status_pg",
    payload_sha256: "a".repeat(64),
    payload_summary: {
      source: "project",
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    },
    provider: {
      schemaVersion: "sena-enterprise-server-job-queue/v1",
      generatedAt: nowIso,
      mode: "local",
      configured: true,
      productionReady: false,
      secretConfigured: false,
      timeoutMs: 1000,
      inlinePayloadAllowed: false,
      localModeEnabled: true,
      evidence: []
    },
    delivery: {
      attempted: true,
      webhookStatus: "local-sink",
      attemptedAt: nowIso
    },
    worker: {
      expectedAction: "run-analysis",
      payloadDelivery: "project-pointer",
      execution: "local-receipt-only",
      statusCallback: "/api/sena/ops/jobs"
    },
    lifecycle: {
      attempts: 1,
      maxAttempts: 3,
      retryable,
      lastTransition: "enqueue"
    },
    redaction: {
      payloadValuesExcluded: true,
      secretValuesExcluded: true,
      endpointValueExcluded: true
    },
    queued_at: nowIso,
    updated_at: nowIso
  };
}
