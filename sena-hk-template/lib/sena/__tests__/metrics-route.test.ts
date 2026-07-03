import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

describe("SENA ops metrics route", () => {
  it("exports identity production readiness gauges for deployment monitoring", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-metrics-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/metrics/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/metrics", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const metrics = await response.text();

      expect(response.headers.get("content-type")).toContain("text/plain; version=0.0.4");
      expect(metrics).toContain("# HELP sena_enterprise_identity_readiness_blockers Identity production readiness blockers from deployment readiness.");
      expect(metrics).toContain("# TYPE sena_enterprise_identity_readiness_blockers gauge");
      expect(metrics).toContain('sena_enterprise_identity_readiness_blockers{readiness_status="blocked"} 6');
      expect(metrics).toContain("# HELP sena_enterprise_identity_readiness_item Identity production readiness item state.");
      expect(metrics).toContain('sena_enterprise_identity_readiness_item{item="identity-idp-tenant-binding",status="review"} 1');
      expect(metrics).toContain('sena_enterprise_identity_readiness_item{item="identity-secret-rotation-cadence",status="review"} 1');
      expect(metrics).toContain('sena_enterprise_identity_readiness_item{item="identity-lifecycle-owner-mode",status="review"} 1');
      expect(metrics).toContain("# HELP sena_enterprise_production_performance_blockers Production performance path blockers for Vercel runtime header, Postgres, object storage, CDN, job queue, and observability.");
      expect(metrics).toContain('sena_enterprise_production_performance_item{item="production-postgres-state",status="review"} 1');
      expect(metrics).toContain('sena_enterprise_production_performance_item{item="production-runtime-header",status="review"} 1');
      expect(metrics).toContain('sena_enterprise_production_performance_item{item="production-server-job-queue",status="review"} 1');
      expect(metrics).toContain('sena_enterprise_queue_records{queue="serverJobsFailed"} 0');
      expect(metrics).toContain('sena_enterprise_queue_records{queue="serverJobsDeadLettered"} 0');
      expect(metrics).toContain("sena_enterprise_postgres_probe_required 1");
      expect(metrics).toContain("sena_enterprise_postgres_probe_confirmed 0");
      expect(metrics).toContain("sena_enterprise_postgres_probe_artifact_configured 0");
      expect(metrics).toContain("sena_enterprise_postgres_probe_verified_at_configured 0");
      expect(metrics).toContain("sena_enterprise_object_storage_native_configured 0");
      expect(metrics).toContain("sena_enterprise_object_storage_probe_required 1");
      expect(metrics).toContain("sena_enterprise_object_storage_probe_confirmed 0");
      expect(metrics).toContain("sena_enterprise_object_storage_probe_artifact_configured 0");
      expect(metrics).toContain("sena_enterprise_object_storage_probe_verified_at_configured 0");
      expect(metrics).toContain("sena_enterprise_server_job_store_postgres 0");
      expect(metrics).toContain("sena_enterprise_server_job_worker_contract_ready");
      expect(metrics).toContain("sena_enterprise_server_job_worker_contract_missing");
      expect(metrics).toContain("sena_enterprise_server_job_worker_heartbeat_confirmed 0");
      expect(metrics).toContain("sena_enterprise_server_job_queue_probe_required 1");
      expect(metrics).toContain("sena_enterprise_server_job_queue_probe_confirmed 0");
      expect(metrics).toContain("sena_enterprise_server_job_queue_probe_artifact_configured 0");
      expect(metrics).toContain("sena_enterprise_server_job_queue_probe_verified_at_configured 0");
      expect(metrics).toContain("sena_enterprise_audit_store_postgres 0");
      expect(metrics).toContain("sena_enterprise_observability_external_sink_configured");
      expect(metrics).toContain("sena_enterprise_observability_probe_required 1");
      expect(metrics).toContain("sena_enterprise_observability_probe_confirmed 0");
      expect(metrics).toContain("sena_enterprise_observability_probe_artifact_configured 0");
      expect(metrics).toContain("sena_enterprise_observability_probe_verified_at_configured 0");
      expect(metrics).toContain("sena_enterprise_observability_sample_store_postgres 0");
      expect(metrics).toContain('sena_enterprise_observability_samples{store="current-process-ring-buffer"} 0');
      expect(metrics).toContain('sena_enterprise_observability_request_p95_ms{store="current-process-ring-buffer"} 0');
      expect(metrics).toContain('sena_enterprise_observability_error_rate_percent{store="current-process-ring-buffer"} 0');
      expect(metrics).toContain('sena_enterprise_production_evidence_missing_required{status="blocked"} 9');
      expect(metrics).toContain("sena_enterprise_production_evidence_confirmed");
      expect(metrics).toContain('sena_enterprise_production_evidence_item{item="vercel-production-preflight"');
      expect(metrics).toContain('sena_enterprise_production_evidence_item{item="postgres-live-probe"');
      expect(metrics).toContain('sena_enterprise_production_evidence_item{item="server-job-queue-live-probe"');
      expect(metrics).toContain('sena_enterprise_production_evidence_item{item="server-job-worker-contract"');
      expect(metrics).toContain('sena_enterprise_production_evidence_item{item="conference-load-rehearsal"');
      expect(metrics).toContain("sena_enterprise_conference_load_rehearsal_confirmed 0");
      expect(metrics).toContain('sena_enterprise_production_performance_item{item="production-conference-load-rehearsal",status="review"} 1');
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-metrics");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("scrapes the durable Postgres observability sample window when the Postgres state store is active", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-metrics-postgres-observability-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.postgres.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_SLOW_REQUEST_MS", "1000");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    const observedRows: Record<string, unknown>[] = [];
    let postgresState: { revision: number; payload: SenaEnterpriseDb } | null = null;
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          if (/CREATE TABLE IF NOT EXISTS/i.test(normalizedSql) || /CREATE (UNIQUE )?INDEX IF NOT EXISTS/i.test(normalizedSql)) {
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
          if (/INSERT INTO .*sena_enterprise_observed_requests/i.test(normalizedSql)) {
            observedRows.push({
              request_id_hash: values[0],
              observed_at: values[1],
              route_id: values[2],
              method: values[3],
              status_code: values[4],
              status_class: values[5],
              duration_ms: values[6],
              slow: values[7],
              error: values[8],
              error_code_hash: values[9],
              payload: values[10]
            });
            return { rows: [], rowCount: 1 };
          }
          if (/SELECT \* FROM .*sena_enterprise_observed_requests/i.test(normalizedSql)) {
            return {
              rows: [...observedRows].sort((left, right) => (
                String(right.observed_at).localeCompare(String(left.observed_at))
              )),
              rowCount: observedRows.length
            };
          }
          if (/SELECT count\(\*\) AS total FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [{ total: 0 }], rowCount: 1 };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/SELECT count\(\*\) AS total FROM "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
            return {
              rows: [{
                total: 0,
                queued: 0,
                running: 0,
                succeeded: 0,
                failed: 0,
                dead_lettered: 0,
                retryable: 0
              }],
              rowCount: 1
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
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
        revision: 0,
        payload: emptyEnterpriseDb()
      };
      const observability = await import("../enterprise/ops-observability");
      const sample = observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 2400,
        requestId: "metrics-postgres-plain-request-id"
      });
      await observability.mirrorEnterpriseObservedRequestToPostgres(sample);

      const route = await import("../../../app/api/sena/ops/metrics/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/metrics", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const metrics = await response.text();

      expect(metrics).toContain("sena_enterprise_observability_sample_store_postgres 1");
      expect(metrics).toContain('sena_enterprise_observability_samples{store="postgres-table"} 1');
      expect(metrics).toContain('sena_enterprise_observability_request_p95_ms{store="postgres-table"} 2400');
      expect(metrics).toContain('sena_enterprise_observability_route_requests{route="sena-analyze",method="POST",store="postgres-table"} 1');
      expect(metrics).not.toContain("metrics-postgres-plain-request-id");
      expect(metrics).not.toContain("super-secret");
      expect(metrics).not.toContain("example.postgres.test");
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
