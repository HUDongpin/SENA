import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

describe("SENA enterprise observability SLI", () => {
  it("summarizes request-level SLI samples without exposing URLs or request ids", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    vi.stubEnv("SENA_OBSERVABILITY_SLO_P95_MS", "3000");
    vi.stubEnv("SENA_OBSERVABILITY_SLO_ERROR_RATE_PERCENT", "60");
    vi.stubEnv("SENA_OBSERVABILITY_SLOW_REQUEST_MS", "1500");

    try {
      const observability = await import("../enterprise/ops-observability");
      observability.resetEnterpriseObservabilityForTests();
      observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 180,
        requestId: "plain-request-id"
      });
      observability.recordEnterpriseObservedRequest({
        routeId: "sena-publication-export",
        method: "POST",
        statusCode: 200,
        durationMs: 2200,
        requestId: "slow-request-id"
      });

      const snapshot = observability.getEnterpriseObservabilitySnapshot();
      const serialized = JSON.stringify(snapshot);

      expect(snapshot.schemaVersion).toBe("sena-enterprise-observability-sli/v1");
      expect(snapshot.status).toBe("pass");
      expect(snapshot.provider.externalSinkConfigured).toBe(true);
      expect(snapshot.provider.dashboardConfigured).toBe(true);
      expect(snapshot.summary.total).toBe(2);
      expect(snapshot.summary.p95Ms).toBe(2200);
      expect(snapshot.summary.slow).toBe(1);
      expect(snapshot.routes.find((route) => route.routeId === "sena-publication-export")?.p95Ms).toBe(2200);
      expect(snapshot.recentSlowRequests[0]?.redaction.pathValueExcluded).toBe(true);
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("dash.example.test");
      expect(serialized).not.toContain("runbooks.example.test");
      expect(serialized).not.toContain("plain-request-id");
      expect(serialized).not.toContain("slow-request-id");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("accepts generic observability and alert aliases at runtime without exposing values", async () => {
    vi.resetModules();
    vi.stubEnv("OBSERVABILITY_WEBHOOK_URL", "https://collector-alias.example.test/sena");
    vi.stubEnv("OBSERVABILITY_WEBHOOK_SECRET", "sena-observability-alias-secret");
    vi.stubEnv("OBSERVABILITY_DASHBOARD_URL", "https://dash-alias.example.test/sena");
    vi.stubEnv("OBSERVABILITY_RUNBOOK_URL", "https://runbooks-alias.example.test/sena");
    vi.stubEnv("OBSERVABILITY_OWNER", "conference-alias-ops");
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://alert-alias.example.test/sena");
    vi.stubEnv("ALERT_WEBHOOK_SECRET", "sena-alert-alias-secret");

    try {
      const observability = await import("../enterprise/ops-observability");
      const alerts = await import("../enterprise/ops-alerts");
      observability.resetEnterpriseObservabilityForTests();
      const request = observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 120,
        requestId: "alias-request-id"
      });
      const delivery = await observability.deliverEnterpriseObservedRequest(request, {
        fetchImpl: vi.fn(async () => new Response("accepted", { status: 202 }))
      });
      const snapshot = observability.getEnterpriseObservabilitySnapshot();
      const opsAlerts = alerts.getEnterpriseOpsAlerts({
        checks: [],
        schemaVersion: "sena-enterprise-ops-status/v1",
        generatedAt: new Date().toISOString()
      } as never, {
        blocking: [],
        advisory: [],
        checks: [],
        schemaVersion: "sena-enterprise-deployment-readiness/v1",
        generatedAt: new Date().toISOString()
      } as never);
      const serialized = JSON.stringify({ snapshot, delivery, opsAlerts });

      expect(snapshot.provider.name).toBe("generic-webhook");
      expect(snapshot.provider.externalSinkConfigured).toBe(true);
      expect(snapshot.provider.externalSinkOriginAllowed).toBe(true);
      expect(snapshot.provider.dashboardConfigured).toBe(true);
      expect(snapshot.provider.runbookConfigured).toBe(true);
      expect(snapshot.provider.ownerConfigured).toBe(true);
      expect(delivery.status).toBe("delivered");
      expect(opsAlerts.ownership).toEqual(expect.objectContaining({
        configured: true,
        owner: "conference-alias-ops",
        channel: "deployment-monitor"
      }));
      expect(serialized).not.toContain("collector-alias.example.test");
      expect(serialized).not.toContain("dash-alias.example.test");
      expect(serialized).not.toContain("alert-alias.example.test");
      expect(serialized).not.toContain("sena-observability-alias-secret");
      expect(serialized).not.toContain("sena-alert-alias-secret");
      expect(serialized).not.toContain("alias-request-id");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("keeps observability under review when the exporter points back to the SENA app origin", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_APP_URL", "https://www.sena.hk");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://www.sena.hk/api/sena/ops/observability/probe");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");

    try {
      const observability = await import("../enterprise/ops-observability");
      const fetchImpl = vi.fn(async () => new Response("accepted", { status: 202 }));
      const sample = observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 120,
        requestId: "same-origin-request-id"
      });
      const delivery = await observability.deliverEnterpriseObservedRequest(sample, { fetchImpl });
      const contract = observability.buildEnterpriseObservabilityContract();
      const probe = await observability.verifyEnterpriseObservabilityProbe({ fetchImpl });
      const serialized = JSON.stringify({ delivery, contract, probe });

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(contract.provider.externalSinkConfigured).toBe(false);
      expect(contract.provider.externalSinkOriginAllowed).toBe(false);
      expect(delivery.status).toBe("not-configured");
      expect(delivery.delivery.errorCode).toBe("observability_exporter_origin_not_allowed");
      expect(probe.status).toBe("review");
      expect(probe.probe.deliveryStatus).toBe("not-configured");
      expect(serialized).not.toContain("www.sena.hk");
      expect(serialized).not.toContain("sena-observability-secret");
      expect(serialized).not.toContain("same-origin-request-id");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("builds a redacted observability SLI, alerting, and exporter contract", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");

    try {
      const { buildEnterpriseObservabilityContract } = await import("../enterprise/ops-observability");
      const contract = buildEnterpriseObservabilityContract();
      const serialized = JSON.stringify(contract);

      expect(contract.schemaVersion).toBe("sena-enterprise-observability-contract/v1");
      expect(contract.status).toBe("pass");
      expect(contract.summary).toEqual(expect.objectContaining({
        signalCount: 4,
        sloCount: 3,
        alertCategoryCount: 5,
        durableSampleStoreRequired: true,
        signedExporterRequired: true,
        liveProbeRequiredBeforeProduction: true
      }));
      expect(contract.provider).toEqual(expect.objectContaining({
        name: "webhook",
        externalSinkConfigured: true,
        externalSinkOriginAllowed: true,
        dashboardConfigured: true,
        runbookConfigured: true,
        ownerConfigured: true,
        endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        secretValuesExcluded: true
      }));
      expect(contract.signals.map((signal) => signal.id)).toEqual(["logs", "metrics", "traces", "alerts"]);
      expect(contract.sampleStore).toEqual(expect.objectContaining({
        requiredForProduction: true,
        acceptedStore: "postgres-table",
        table: "sena_enterprise_observed_requests",
        localRingBufferFallback: "development-only"
      }));
      expect(contract.liveProbe).toEqual(expect.objectContaining({
        requiredBeforeProduction: true,
        command: "npm run sena:observability:verify",
        payloadSchema: "sena-enterprise-observed-request/v1"
      }));
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("dash.example.test");
      expect(serialized).not.toContain("runbooks.example.test");
      expect(serialized).not.toContain("sena-observability-secret");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("mirrors redacted request samples to the Postgres observed-request store when the Postgres state store is active", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.postgres.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    const observedRows: Record<string, unknown>[] = [];
    const poolOptions: unknown[] = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        constructor(options: unknown) {
          poolOptions.push(options);
        }

        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          if (/CREATE TABLE IF NOT EXISTS/i.test(normalizedSql) || /CREATE (UNIQUE )?INDEX IF NOT EXISTS/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/INSERT INTO .*sena_enterprise_observed_requests/i.test(normalizedSql)) {
            const row = {
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
            };
            const existingIndex = observedRows.findIndex((candidate) => (
              candidate.request_id_hash === row.request_id_hash &&
              candidate.observed_at === row.observed_at &&
              candidate.route_id === row.route_id
            ));
            if (existingIndex >= 0) observedRows[existingIndex] = row;
            else observedRows.push(row);
            return { rows: [], rowCount: 1 };
          }
          if (/SELECT \* FROM .*sena_enterprise_observed_requests/i.test(normalizedSql)) {
            const limit = Number(values[values.length - 1] ?? 1000);
            return {
              rows: [...observedRows]
                .sort((left, right) => String(right.observed_at).localeCompare(String(left.observed_at)))
                .slice(0, limit),
              rowCount: observedRows.length
            };
          }
          throw new Error(`Unexpected Postgres query: ${normalizedSql}`);
        }

        async end() {
          return undefined;
        }
      }
    }));

    try {
      const observability = await import("../enterprise/ops-observability");
      observability.resetEnterpriseObservabilityForTests();
      const sample = observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 320,
        requestId: "plain-postgres-request-id"
      });
      await observability.mirrorEnterpriseObservedRequestToPostgres(sample);

      const snapshot = await observability.getEnterpriseObservabilitySnapshotWithPostgresEvidence();
      const serialized = JSON.stringify(snapshot);

      expect(poolOptions).toHaveLength(2);
      expect(observedRows).toHaveLength(1);
      expect(snapshot.status).toBe("pass");
      expect(snapshot.summary.sampleWindow).toBe("postgres-table-window");
      expect(snapshot.summary.total).toBe(1);
      expect(snapshot.routes[0]).toEqual(expect.objectContaining({
        routeId: "sena-analyze",
        method: "POST",
        total: 1,
        p95Ms: 320
      }));
      expect(snapshot.evidence).toEqual(expect.arrayContaining([
        "observabilitySampleStore=postgres-table",
        "observabilitySampleStoreSchema=sena_enterprise_observed_requests",
        "observabilitySampleStoreIndexed=true"
      ]));
      expect(serialized).not.toContain("plain-postgres-request-id");
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("example.postgres.test");
    } finally {
      vi.doUnmock("pg");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("exposes ops observability with bearer access and observation headers", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    try {
      const observability = await import("../enterprise/ops-observability");
      observability.resetEnterpriseObservabilityForTests();
      observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 250,
        requestId: "ops-route-before"
      });

      const route = await import("../../../app/api/sena/ops/observability/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/observability", {
        headers: {
          authorization: "Bearer sena-test-ops-token",
          "x-request-id": "ops-observability-request"
        }
      }));
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observability-status")).toBe("pass");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-observability");
      expect(response.headers.get("x-sena-observability-url-values")).toBe("excluded");
      expect(body.schemaVersion).toBe("sena-enterprise-observability-sli/v1");
      expect(body.summary.total).toBe(1);
      expect(body.access.mode).toBe("bearer");
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("ops-observability-request");
    } finally {
      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("serves ops observability from the durable Postgres observed-request store when configured", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.postgres.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    const pg = new RouteMemoryPostgres();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
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
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const observability = await import("../enterprise/ops-observability");
      observability.resetEnterpriseObservabilityForTests();
      const sample = observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 340,
        requestId: "ops-route-postgres-sample"
      });
      await observability.mirrorEnterpriseObservedRequestToPostgres(sample);

      const route = await import("../../../app/api/sena/ops/observability/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/observability", {
        headers: {
          authorization: "Bearer sena-test-ops-token",
          "x-request-id": "ops-observability-postgres-route-request"
        }
      }));
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observability-status")).toBe("pass");
      expect(body.summary.sampleWindow).toBe("postgres-table-window");
      expect(body.summary.total).toBe(1);
      expect(body.routes[0]).toEqual(expect.objectContaining({
        routeId: "sena-analyze",
        method: "POST",
        total: 1,
        p95Ms: 340
      }));
      expect(body.evidence).toEqual(expect.arrayContaining([
        "observabilitySampleStore=postgres-table",
        "observabilitySampleStoreSchema=sena_enterprise_observed_requests",
        "observabilitySampleStoreIndexed=true"
      ]));
      expect(pg.queries.some((query) => /SELECT \* FROM "public"\."sena_enterprise_observed_requests"/.test(query))).toBe(true);
      expect(serialized).not.toContain("ops-route-postgres-sample");
      expect(serialized).not.toContain("ops-observability-postgres-route-request");
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("example.postgres.test");
      expect(serialized).not.toContain("collector.example.test");
    } finally {
      fetchSpy.mockRestore();
      vi.doUnmock("pg");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("keeps ops observability in review when production gates require durable Postgres request samples", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    try {
      const observability = await import("../enterprise/ops-observability");
      observability.resetEnterpriseObservabilityForTests();
      observability.recordEnterpriseObservedRequest({
        routeId: "sena-analyze",
        method: "POST",
        statusCode: 202,
        durationMs: 250,
        requestId: "ops-route-before"
      });

      const route = await import("../../../app/api/sena/ops/observability/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/observability", {
        headers: {
          authorization: "Bearer sena-test-ops-token",
          "x-request-id": "ops-observability-production-request"
        }
      }));
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(503);
      expect(response.headers.get("x-sena-observability-status")).toBe("review");
      expect(body.status).toBe("review");
      expect(body.provider.externalSinkConfigured).toBe(true);
      expect(body.summary.sampleWindow).toBe("current-process-ring-buffer");
      expect(body.evidence).toEqual(expect.arrayContaining([
        "observabilityProductionPerformancePathRequired=true",
        "observabilityProductionSampleStoreRequired=true",
        "observabilityDurableSampleStore=missing",
        "observabilitySampleStore=current-process-ring-buffer",
        "observabilitySampleStorePostgresRequested=false",
        "observabilityLiveProbeRequired=true",
        "observabilityProbeProductionPerformancePathRequired=true",
        "observabilityProbeArtifactSha256=missing-or-invalid",
        "observabilityProbeVerifiedAt=missing-or-invalid"
      ]));
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("ops-observability-production-request");
    } finally {
      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("delivers a redacted live observability exporter probe", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    const requests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];

    try {
      const observability = await import("../enterprise/ops-observability");
      const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input),
          body: String(init?.body),
          headers: init?.headers as Record<string, string>
        });
        return new Response("accepted", { status: 202 });
      });

      const probe = await observability.verifyEnterpriseObservabilityProbe({
        fetchImpl,
        requestId: "observability-probe-request"
      });
      const serialized = JSON.stringify(probe);

      expect(probe.schemaVersion).toBe("sena-enterprise-observability-probe/v1");
      expect(probe.status).toBe("pass");
      expect(probe.contract.schemaVersion).toBe("sena-enterprise-observability-contract/v1");
      expect(probe.contract.status).toBe("pass");
      expect(probe.provider).toEqual(expect.objectContaining({
        name: "webhook",
        externalSinkConfigured: true,
        dashboardConfigured: true,
        runbookConfigured: true,
        ownerConfigured: true,
        endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        urlValuesExcluded: true
      }));
      expect(probe.probe).toEqual(expect.objectContaining({
        sampleRouteId: "sena-observability-live-probe",
        sampleStatusClass: "2xx",
        sampleRequestIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        deliveryStatus: "delivered",
        attempted: true,
        httpStatus: 202
      }));
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe("https://collector.example.test/sena");
      expect(requests[0].headers["x-sena-schema-version"]).toBe("sena-enterprise-observed-request/v1");
      expect(requests[0].headers["x-sena-signature"])
        .toBe(`sha256=${createHmac("sha256", "sena-observability-secret").update(requests[0].body).digest("hex")}`);
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("dash.example.test");
      expect(serialized).not.toContain("runbooks.example.test");
      expect(serialized).not.toContain("sena-observability-secret");
      expect(serialized).not.toContain("observability-probe-request");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("requires a valid observability probe artifact and verified-at timestamp before confirmation", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED", "1");
    vi.stubEnv("SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED", "1");
    vi.stubEnv("SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256", "d".repeat(64));

    try {
      const { enterpriseObservabilityProbeReadiness } = await import("../enterprise/ops-observability");
      expect(enterpriseObservabilityProbeReadiness()).toEqual(expect.objectContaining({
        required: true,
        confirmed: false,
        artifactHashConfigured: true,
        verifiedAtConfigured: false
      }));

      const verifiedAt = new Date().toISOString();
      vi.stubEnv("SENA_OBSERVABILITY_PROBE_VERIFIED_AT", verifiedAt);
      vi.stubEnv("SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION", "pass");
      expect(enterpriseObservabilityProbeReadiness()).toEqual(expect.objectContaining({
        required: true,
        confirmed: true,
        artifactHash: "d".repeat(64),
        verifiedAt,
        artifactHashConfigured: true,
        verifiedAtConfigured: true
      }));
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("requires a valid observability contract artifact and verified-at timestamp before confirmation", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_REQUIRED", "1");
    vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_CONFIRMED", "1");
    vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256", "c".repeat(64));

    try {
      const { enterpriseObservabilityContractReadiness } = await import("../enterprise/ops-observability");
      expect(enterpriseObservabilityContractReadiness()).toEqual(expect.objectContaining({
        required: true,
        confirmed: false,
        artifactHashConfigured: true,
        verifiedAtConfigured: false
      }));

      const verifiedAt = new Date().toISOString();
      vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT", verifiedAt);
      vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION", "pass");
      expect(enterpriseObservabilityContractReadiness()).toEqual(expect.objectContaining({
        required: true,
        confirmed: true,
        artifactHash: "c".repeat(64),
        verifiedAt,
        artifactHashConfigured: true,
        verifiedAtConfigured: true
      }));
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("requires a live observability probe for production and production performance gates", async () => {
    vi.resetModules();

    try {
      const { enterpriseObservabilityContractReadiness, enterpriseObservabilityLiveProbeRequired, enterpriseObservabilityProbeReadiness } = await import("../enterprise/ops-observability");

      vi.stubEnv("NODE_ENV", "production");
      expect(enterpriseObservabilityLiveProbeRequired()).toBe(true);
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
      expect(enterpriseObservabilityLiveProbeRequired()).toBe(true);
      vi.stubEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "");
      vi.stubEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED", "1");
      expect(enterpriseObservabilityLiveProbeRequired()).toBe(true);
      vi.stubEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED", "");
      vi.stubEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED", "1");
      expect(enterpriseObservabilityLiveProbeRequired()).toBe(true);
      vi.stubEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED", "");
      expect(enterpriseObservabilityLiveProbeRequired()).toBe(false);

      vi.stubEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
      vi.stubEnv("SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED", "1");
      vi.stubEnv("SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256", "not-a-sha");
      vi.stubEnv("SENA_OBSERVABILITY_PROBE_VERIFIED_AT", new Date().toISOString());
      const readiness = enterpriseObservabilityProbeReadiness();
      const contractReadiness = enterpriseObservabilityContractReadiness();

      expect(readiness).toEqual(expect.objectContaining({
        required: true,
        confirmed: false,
        artifactHashConfigured: false,
        verifiedAtConfigured: true
      }));
      expect(readiness.evidence).toEqual(expect.arrayContaining([
        "observabilityLiveProbeRequired=true",
        "observabilityProbeExplicitlyRequired=false",
        "observabilityProbeProductionRuntime=false",
        "observabilityProbeProductionPerformancePathRequired=true",
        "observabilityProbeProductionEvidenceManifestRequired=false",
        "observabilityProbeSaasOperatingModelApproved=false",
        "observabilityProbeArtifactSha256=missing-or-invalid",
        "observabilityProbeVerifiedAt=valid"
      ]));
      expect(contractReadiness).toEqual(expect.objectContaining({
        required: true,
        confirmed: false,
        artifactHashConfigured: false,
        verifiedAtConfigured: false
      }));
      expect(contractReadiness.evidence).toEqual(expect.arrayContaining([
        "observabilityContractRequired=true",
        "observabilityContractProductionPerformancePathRequired=true",
        "observabilityContractArtifactSha256=missing-or-invalid",
        "observabilityContractVerifiedAt=missing-or-invalid"
      ]));
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("keeps production observability under review when the required live probe artifact is not confirmed", async () => {
    vi.resetModules();
    const verifiedAt = new Date().toISOString();
    vi.stubEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.postgres.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    vi.stubEnv("SENA_ALERTING_OWNER", "conference-ops");
    vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_CONFIRMED", "1");
    vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256", "c".repeat(64));
    vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT", verifiedAt);
    vi.stubEnv("SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION", "pass");

    try {
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
            opsTokenConfigured: true,
            alertWebhookConfigured: true
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
      const observabilityItem = performancePath.items.find((item) => item.id === "production-observability");

      expect(observabilityItem).toEqual(expect.objectContaining({
        status: "review"
      }));
      expect(performancePath.summary.blockers).toContain("production-observability");
      expect(observabilityItem?.evidence).toEqual(expect.arrayContaining([
        "observabilityExternalSink=configured",
        "observabilityDashboard=configured",
        "observabilityRunbook=configured",
        "observabilityOwner=configured",
        "observabilityDurableSampleStore=configured",
        "observabilityContractConfirmed=true",
        "observabilityLiveProbeRequired=true",
        "observabilityLiveProbeConfirmed=false",
        "observabilityProbeArtifactSha256=missing-or-invalid",
        "observabilityProbeVerifiedAt=missing-or-invalid"
      ]));
      const serialized = JSON.stringify(observabilityItem);
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("postgres://");
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("sena-observability-secret");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("keeps production observability under review when the contract artifact is not bound before a live probe", async () => {
    vi.resetModules();
    const verifiedAt = new Date().toISOString();
    vi.stubEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH", "1");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.postgres.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    vi.stubEnv("SENA_ALERTING_OWNER", "conference-ops");
    vi.stubEnv("SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED", "1");
    vi.stubEnv("SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256", "d".repeat(64));
    vi.stubEnv("SENA_OBSERVABILITY_PROBE_VERIFIED_AT", verifiedAt);
    vi.stubEnv("SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION", "pass");

    try {
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
            opsTokenConfigured: true,
            alertWebhookConfigured: true
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
      const observabilityItem = performancePath.items.find((item) => item.id === "production-observability");
      const serialized = JSON.stringify(observabilityItem);

      expect(performancePath.summary.blockers).toContain("production-observability");
      expect(observabilityItem).toEqual(expect.objectContaining({
        status: "review"
      }));
      expect(observabilityItem?.evidence).toEqual(expect.arrayContaining([
        "observabilityExternalSink=configured",
        "observabilityDashboard=configured",
        "observabilityRunbook=configured",
        "observabilityOwner=configured",
        "observabilityDurableSampleStore=configured",
        "observabilityContractRequired=true",
        "observabilityContractConfirmed=false",
        "observabilityContractArtifactSha256=missing-or-invalid",
        "observabilityContractVerifiedAt=missing-or-invalid",
        "observabilityLiveProbeConfirmed=true",
        "observabilityProbeArtifactSha256=present"
      ]));
      expect(observabilityItem?.nextAction).toContain("sena:observability:contract");
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("postgres://");
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("sena-observability-secret");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("exposes the observability live probe through the ops route", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_OBSERVABILITY_PROVIDER", "webhook");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_URL", "https://collector.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_EXPORTER_SECRET", "sena-observability-secret");
    vi.stubEnv("SENA_OBSERVABILITY_DASHBOARD_URL", "https://dash.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_RUNBOOK_URL", "https://runbooks.example.test/sena");
    vi.stubEnv("SENA_OBSERVABILITY_OWNER", "conference-ops");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("accepted", { status: 202 }));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/observability/probe/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/observability/probe", {
        headers: {
          authorization: "Bearer sena-test-ops-token",
          "x-request-id": "observability-probe-route-request"
        }
      }));
      const body = await response.json();
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observability-probe")).toBe("pass");
      expect(response.headers.get("x-sena-observability-probe-delivery")).toBe("delivered");
      expect(response.headers.get("x-sena-observability-probe-attempted")).toBe("true");
      expect(response.headers.get("x-sena-observability-probe-http-status")).toBe("202");
      expect(response.headers.get("x-sena-observability-url-values")).toBe("excluded");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-observability-probe");
      expect(body.schemaVersion).toBe("sena-enterprise-observability-probe/v1");
      expect(body.status).toBe("pass");
      expect(serialized).not.toContain("collector.example.test");
      expect(serialized).not.toContain("observability-probe-route-request");
    } finally {
      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
