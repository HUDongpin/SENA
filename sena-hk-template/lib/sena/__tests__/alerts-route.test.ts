import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

const expectedIdentityAlertIds = [
  "readiness-blocking-identity-evidence-host-allowlist",
  "readiness-blocking-identity-secret-version-binding",
  "readiness-blocking-identity-secret-store-reference",
  "readiness-blocking-identity-secret-rotation-cadence",
  "readiness-blocking-identity-idp-tenant-binding",
  "readiness-blocking-identity-lifecycle-owner-mode"
] as const;

describe("SENA ops alerts route", () => {
  it("returns identity production alert headers for deployment monitors", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-alerts-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/alerts/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/alerts", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        status?: string;
        summary?: {
          firing?: number;
        };
        alerts?: Array<{
          id: string;
          severity: string;
          source: string;
        }>;
      };
      const identityAlerts = body.alerts
        ?.filter((alert) => expectedIdentityAlertIds.includes(alert.id as (typeof expectedIdentityAlertIds)[number])) ?? [];

      expect(response.status).toBe(503);
      expect(body.status).toBe("critical");
      expect(identityAlerts.map((alert) => alert.id)).toEqual(expect.arrayContaining([...expectedIdentityAlertIds]));
      expect(identityAlerts.every((alert) => alert.severity === "critical")).toBe(true);
      expect(identityAlerts.every((alert) => alert.source === "deployment-readiness")).toBe(true);
      expect(response.headers.get("x-sena-ops-alert-status")).toBe(body.status);
      expect(response.headers.get("x-sena-ops-alert-firing")).toBe(String(body.summary?.firing));
      expect(response.headers.get("x-sena-identity-alert-count")).toBe(String(identityAlerts.length));
      expect(response.headers.get("x-sena-identity-alert-blockers")).toBe(identityAlerts.map((alert) => alert.id).join("|"));
      expect(response.headers.get("x-sena-identity-alert-severity")).toBe("critical");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("uses the durable Postgres observability window for request SLI breach alerts", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-alerts-postgres-observability-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_ALERTING_OWNER", "conference-ops");
    vi.stubEnv("SENA_ALERTING_RUNBOOK_URL", "https://ops.example.test/sena-alerts");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.postgres.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    vi.stubEnv("SENA_OBSERVABILITY_SLO_P95_MS", "1000");
    vi.stubEnv("SENA_OBSERVABILITY_SLO_ERROR_RATE_PERCENT", "5");
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
        requestId: "alerts-postgres-plain-request-id"
      });
      await observability.mirrorEnterpriseObservedRequestToPostgres(sample);

      const route = await import("../../../app/api/sena/ops/alerts/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/alerts", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        alerts?: Array<{
          id: string;
          severity: string;
          source: string;
          evidence: string[];
        }>;
      };
      const sliAlert = body.alerts?.find((alert) => alert.id === "observability-slo-breached");
      const serialized = JSON.stringify(body);

      expect(sliAlert).toEqual(expect.objectContaining({
        severity: "warning",
        source: "observability"
      }));
      expect(sliAlert?.evidence).toEqual(expect.arrayContaining([
        "samples=1",
        "sampleWindow=postgres-table-window",
        "p95Ms=2400",
        "p95SloMs=1000",
        "observabilitySampleStore=postgres-table",
        "observabilitySampleStoreSchema=sena_enterprise_observed_requests"
      ]));
      expect(serialized).not.toContain("alerts-postgres-plain-request-id");
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("example.postgres.test");
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
