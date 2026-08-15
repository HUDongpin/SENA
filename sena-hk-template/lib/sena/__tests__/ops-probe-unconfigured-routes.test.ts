import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FA22-06 — ops probes with the live services deliberately UNSET.
 *
 * Every other probe suite in this tree configures its backend first
 * (metrics-route.test.ts stubs a Postgres pool, cdn-verification.test.ts hands
 * the probe a fetch, object-storage-native.test.ts supplies S3 credentials), so
 * the state an operator actually meets on day one — a deployment where nothing
 * is wired up yet — has never been driven through the HTTP handlers.
 *
 * These tests invoke the real exported GET of all six ops surfaces with every
 * SENA_*, DATABASE_URL, R2_*, BLOB_*, VERCEL_* and AWS_* variable removed from
 * process.env, and assert the full answer: HTTP status, a machine-readable
 * "not configured" marker, a schemaVersion'd envelope, and the absence of a
 * stack trace, a raw driver message, or a filesystem path in the body.
 *
 * Two of the cases below pin behaviour this suite considers wrong. They are
 * labelled DEFECT and say so inline; they document what the code does today so
 * a fix is a visible diff, they do not bless it.
 */

const opsToken = "sena-test-ops-token";
const origin = "https://sena.example.test";

const opsSurfaces = {
  postgres: {
    modulePath: "../../../app/api/sena/ops/postgres/route",
    routePath: "/api/sena/ops/postgres",
    observedRoute: "sena-ops-postgres"
  },
  objectStorage: {
    modulePath: "../../../app/api/sena/ops/object-storage/route",
    routePath: "/api/sena/ops/object-storage",
    observedRoute: "sena-ops-object-storage"
  },
  cdn: {
    modulePath: "../../../app/api/sena/ops/cdn/route",
    routePath: "/api/sena/ops/cdn",
    observedRoute: "sena-ops-cdn"
  },
  metrics: {
    modulePath: "../../../app/api/sena/ops/metrics/route",
    routePath: "/api/sena/ops/metrics",
    observedRoute: "sena-ops-metrics"
  },
  observability: {
    modulePath: "../../../app/api/sena/ops/observability/route",
    routePath: "/api/sena/ops/observability",
    observedRoute: "sena-ops-observability"
  },
  observabilityProbe: {
    modulePath: "../../../app/api/sena/ops/observability/probe/route",
    routePath: "/api/sena/ops/observability/probe",
    observedRoute: "sena-ops-observability-probe"
  }
} as const;

type OpsSurfaceName = keyof typeof opsSurfaces;

/**
 * Anything that could name a live backend. The point of the row is that these
 * are genuinely absent, so the suite removes them rather than assuming a clean
 * shell: a developer with DATABASE_URL exported, or CI with VERCEL_* injected,
 * would otherwise silently configure the very services under test.
 */
function namesALiveService(key: string) {
  return /^SENA_/.test(key)
    || /^NEXT_PUBLIC_SENA/.test(key)
    || /^(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|POSTGRES_URL_NON_POOLING|NEON_DATABASE_URL|PGHOST|PGUSER|PGPASSWORD|PGDATABASE|PGPORT)$/.test(key)
    || /^(R2_|CLOUDFLARE_|BLOB_|VERCEL_|AWS_|GCS_|GOOGLE_|OTEL_|DATADOG_|DD_)/.test(key);
}

type OpsHarness = {
  enterpriseDbDir: string;
  /** URLs the handlers tried to dial. Must stay empty: nothing is configured. */
  fetchAttempts: string[];
  /** Postgres pools the handlers tried to open. Must stay 0 for the same reason. */
  postgresPoolAttempts: () => number;
  get: (surface: OpsSurfaceName, init?: RequestInit) => Promise<Response>;
};

let releaseHarness: (() => void) | undefined;

afterEach(() => {
  releaseHarness?.();
  releaseHarness = undefined;
});

function startUnconfiguredOps(options: {
  /** Set only when the case is about a configured ops credential. */
  opsToken?: string;
  /** Undefined models a request that carries no SENA session cookie. */
  sessionCookie?: string;
  /** Extra env the case deliberately DOES configure (see the defect cases). */
  env?: Record<string, string>;
  /** Supplied only by cases that need a Postgres primary to fail a certain way. */
  pgQuery?: (sql: string, values: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
} = {}): OpsHarness {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-ops-unconfigured-"));
  const savedEnv = new Map<string, string | undefined>();
  for (const key of Object.keys(process.env)) {
    if (!namesALiveService(key)) continue;
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }

  const fetchAttempts: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchAttempts.push(String(input instanceof Request ? input.url : input));
    throw new Error("sena-test: no live service is configured, no outbound fetch may be attempted");
  }) as typeof fetch;

  const postgres = { poolAttempts: 0 };

  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  if (options.opsToken) process.env.SENA_OPS_TOKEN = options.opsToken;
  for (const [key, value] of Object.entries(options.env ?? {})) process.env[key] = value;

  const pgQuery = options.pgQuery;
  vi.doMock("pg", () => ({
    Pool: class HarnessPool {
      constructor() {
        postgres.poolAttempts += 1;
        if (!pgQuery) {
          throw new Error("sena-test: no Postgres is configured, no pool may be constructed");
        }
      }

      async query(sql: string, values: unknown[] = []) {
        if (!pgQuery) throw new Error("sena-test: no Postgres is configured");
        return await pgQuery(sql, values);
      }

      async end() {
        return undefined;
      }
    }
  }));
  // next/headers throws "called outside a request scope" under Vitest, which
  // would make every tokenless case assert a harness artifact instead of the
  // handler. Model the request scope: a cookie jar that holds what the case says
  // the caller sent.
  vi.doMock("next/headers", () => ({
    cookies: async () => ({
      get: (name: string) => (
        name === "sena_session" && options.sessionCookie
          ? { name, value: options.sessionCookie }
          : undefined
      )
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));
  vi.doMock("@/lib/sena/enterprise-postgres", async () => await import("../enterprise-postgres"));
  vi.doMock("@/lib/sena/enterprise/object-storage-adapter", async () => await import("../enterprise/object-storage-adapter"));
  vi.doMock("@/lib/sena/enterprise/cdn-verification", async () => await import("../enterprise/cdn-verification"));
  vi.doMock("@/lib/sena/enterprise/ops-observability", async () => await import("../enterprise/ops-observability"));
  vi.doMock("@/lib/sena/enterprise/ops-status", async () => await import("../enterprise/ops-status"));
  vi.doMock("@/lib/sena/enterprise/ops-metrics", async () => await import("../enterprise/ops-metrics"));
  vi.doMock("@/lib/sena/enterprise/ops-deployment-readiness", async () => await import("../enterprise/ops-deployment-readiness"));

  releaseHarness = () => {
    globalThis.fetch = realFetch;
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    delete process.env.SENA_OPS_TOKEN;
    for (const key of Object.keys(options.env ?? {})) delete process.env[key];
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.doUnmock("pg");
    vi.doUnmock("next/headers");
    vi.resetModules();
  };

  return {
    enterpriseDbDir,
    fetchAttempts,
    postgresPoolAttempts: () => postgres.poolAttempts,
    get: async (surface, init) => {
      const { modulePath, routePath } = opsSurfaces[surface];
      const route = await import(modulePath) as { GET: (request: Request) => Promise<Response> };
      return await route.GET(new Request(`${origin}${routePath}`, {
        ...init,
        headers: {
          ...(options.opsToken ? { authorization: `Bearer ${options.opsToken}` } : {}),
          ...(init?.headers ?? {})
        }
      }));
    }
  };
}

/**
 * The row's redaction clause: a "not configured" answer must read as a
 * structured report, never as a leaked exception. `enterpriseErrorResponse`
 * puts the raw `Error.message` into the body of anything it does not recognise
 * (lib/sena/enterprise/errors.ts:19), so an escaped throw is visible here.
 */
function expectNoLeakedFailureDetail(bodyText: string, harness: OpsHarness) {
  expect(bodyText).not.toMatch(/\n\s+at\s+\S+\s+\(/);
  expect(bodyText).not.toMatch(/\b(?:Error|TypeError|ReferenceError):/);
  expect(bodyText).not.toContain("unexpected_error");
  expect(bodyText).not.toContain("node_modules");
  expect(bodyText).not.toContain(harness.enterpriseDbDir);
  expect(bodyText).not.toContain(tmpdir());
}

describe("SENA ops probes with no live service configured (FA22-06)", () => {
  it("answers every JSON probe 503 with a schemaVersion'd not-configured report instead of a crash", async () => {
    const harness = startUnconfiguredOps({ opsToken });

    const postgres = await harness.get("postgres");
    const postgresText = await postgres.text();
    const postgresBody = JSON.parse(postgresText) as {
      schemaVersion?: string;
      status?: string;
      provider?: { configured?: boolean; adapter?: string; missingEnv?: string[]; connectionValueExcluded?: boolean };
      probe?: { cleanupStatus?: string; createTable?: { attempted?: boolean } };
      evidence?: string[];
      redaction?: { connectionValuesExcluded?: boolean };
      access?: { mode?: string };
      error?: unknown;
    };

    expect(postgres.status).toBe(503);
    expect(postgres.headers.get("content-type")).toContain("application/json");
    expect(postgres.headers.get("x-sena-observed-route")).toBe(opsSurfaces.postgres.observedRoute);
    expect(postgresBody.schemaVersion).toBe("sena-enterprise-postgres-probe/v1");
    expect(postgresBody.status).toBe("review");
    expect(postgresBody.provider?.configured).toBe(false);
    expect(postgresBody.provider?.adapter).toBeUndefined();
    expect(postgresBody.provider?.missingEnv).toContain("SENA_ENTERPRISE_DB_ADAPTER=postgres");
    expect(postgresBody.evidence).toContain("postgresConfig=missing");
    expect(postgresBody.evidence).toContain("probe=not-attempted");
    expect(postgresBody.probe?.createTable?.attempted).toBe(false);
    expect(postgresBody.probe?.cleanupStatus).toBe("not-attempted");
    expect(postgresBody.redaction?.connectionValuesExcluded).toBe(true);
    expect(postgresBody.access?.mode).toBe("bearer");
    expect(postgresBody.error).toBeUndefined();
    expect(postgres.headers.get("x-sena-postgres-probe")).toBe("review");
    expect(postgres.headers.get("x-sena-postgres-provider")).toBe("missing");
    expect(postgres.headers.get("x-sena-postgres-cleanup")).toBe("not-attempted");
    expectNoLeakedFailureDetail(postgresText, harness);

    const objectStorage = await harness.get("objectStorage");
    const objectStorageText = await objectStorage.text();
    const objectStorageBody = JSON.parse(objectStorageText) as {
      schemaVersion?: string;
      status?: string;
      provider?: { mode?: string; configured?: boolean; productionReady?: boolean; accessKeyConfigured?: boolean; secretConfigured?: boolean };
      probe?: { put?: { attempted?: boolean }; cleanupStatus?: string };
      evidence?: string[];
      redaction?: { secretValuesExcluded?: boolean };
      access?: { mode?: string };
      error?: unknown;
    };

    expect(objectStorage.status).toBe(503);
    expect(objectStorage.headers.get("x-sena-observed-route")).toBe(opsSurfaces.objectStorage.observedRoute);
    expect(objectStorageBody.schemaVersion).toBe("sena-enterprise-object-storage-probe/v1");
    expect(objectStorageBody.status).toBe("review");
    expect(objectStorageBody.provider?.mode).toBe("not-configured");
    expect(objectStorageBody.provider?.configured).toBe(false);
    expect(objectStorageBody.provider?.productionReady).toBe(false);
    expect(objectStorageBody.provider?.accessKeyConfigured).toBe(false);
    expect(objectStorageBody.provider?.secretConfigured).toBe(false);
    expect(objectStorageBody.evidence).toContain("nativeConfig=missing");
    expect(objectStorageBody.evidence).toContain("probe=not-attempted");
    expect(objectStorageBody.evidence).toContain("errorHash=none");
    expect(objectStorageBody.probe?.put?.attempted).toBe(false);
    expect(objectStorageBody.probe?.cleanupStatus).toBe("not-attempted");
    expect(objectStorageBody.redaction?.secretValuesExcluded).toBe(true);
    expect(objectStorageBody.access?.mode).toBe("bearer");
    expect(objectStorageBody.error).toBeUndefined();
    expect(objectStorage.headers.get("x-sena-object-storage-probe")).toBe("review");
    expect(objectStorage.headers.get("x-sena-object-storage-provider")).toBe("not-configured");
    expect(objectStorage.headers.get("x-sena-object-storage-object-key-hash")).toBe("missing");
    expectNoLeakedFailureDetail(objectStorageText, harness);

    const cdn = await harness.get("cdn");
    const cdnText = await cdn.text();
    const cdnBody = JSON.parse(cdnText) as {
      schemaVersion?: string;
      status?: string;
      target?: { configured?: boolean; source?: string; hostHash?: string; urlValueExcluded?: boolean };
      html?: { attempted?: boolean };
      staticAsset?: { attempted?: boolean; discovered?: boolean };
      evidence?: string[];
      redaction?: { urlValuesExcluded?: boolean };
      access?: { mode?: string };
      error?: unknown;
    };

    expect(cdn.status).toBe(503);
    expect(cdn.headers.get("x-sena-observed-route")).toBe(opsSurfaces.cdn.observedRoute);
    expect(cdnBody.schemaVersion).toBe("sena-enterprise-cdn-probe/v1");
    expect(cdnBody.status).toBe("review");
    expect(cdnBody.target?.configured).toBe(false);
    expect(cdnBody.target?.source).toBe("missing");
    expect(cdnBody.target?.hostHash).toBeUndefined();
    expect(cdnBody.target?.urlValueExcluded).toBe(true);
    expect(cdnBody.evidence).toContain("target=missing-or-invalid");
    // The not-configured answer names the env the operator has to set, which is
    // the difference between a probe that reports and a probe that just fails.
    expect(cdnBody.evidence).toContain("set=SENA_CDN_VERIFY_URL|SENA_CDN_URL|SENA_APP_URL");
    expect(cdnBody.html?.attempted).toBe(false);
    expect(cdnBody.staticAsset?.attempted).toBe(false);
    expect(cdnBody.staticAsset?.discovered).toBe(false);
    expect(cdnBody.redaction?.urlValuesExcluded).toBe(true);
    expect(cdnBody.access?.mode).toBe("bearer");
    expect(cdnBody.error).toBeUndefined();
    expect(cdn.headers.get("x-sena-cdn-probe")).toBe("review");
    expect(cdn.headers.get("x-sena-cdn-target-host-hash")).toBe("missing");
    expectNoLeakedFailureDetail(cdnText, harness);

    const observability = await harness.get("observability");
    const observabilityText = await observability.text();
    const observabilityBody = JSON.parse(observabilityText) as {
      schemaVersion?: string;
      status?: string;
      provider?: { name?: string; externalSinkConfigured?: boolean; dashboardConfigured?: boolean; secretConfigured?: boolean };
      summary?: { sampleWindow?: string };
      evidence?: string[];
      access?: { mode?: string };
      error?: unknown;
    };

    expect(observability.status).toBe(503);
    expect(observability.headers.get("x-sena-observed-route")).toBe(opsSurfaces.observability.observedRoute);
    expect(observabilityBody.schemaVersion).toBe("sena-enterprise-observability-sli/v1");
    expect(observabilityBody.status).toBe("review");
    expect(observabilityBody.provider?.name).toBe("not-configured");
    expect(observabilityBody.provider?.externalSinkConfigured).toBe(false);
    expect(observabilityBody.provider?.dashboardConfigured).toBe(false);
    expect(observabilityBody.provider?.secretConfigured).toBe(false);
    expect(observabilityBody.summary?.sampleWindow).toBe("current-process-ring-buffer");
    expect(observabilityBody.evidence).toContain("observabilityProvider=not-configured");
    expect(observabilityBody.evidence).toContain("observabilityExternalSink=missing");
    expect(observabilityBody.evidence).toContain("observabilityDurableSampleStore=missing");
    expect(observabilityBody.access?.mode).toBe("bearer");
    expect(observabilityBody.error).toBeUndefined();
    expect(observability.headers.get("x-sena-observability-external-sink")).toBe("missing");
    expect(observability.headers.get("x-sena-observability-dashboard")).toBe("missing");
    expectNoLeakedFailureDetail(observabilityText, harness);

    const probe = await harness.get("observabilityProbe");
    const probeText = await probe.text();
    const probeBody = JSON.parse(probeText) as {
      schemaVersion?: string;
      status?: string;
      provider?: { name?: string; externalSinkConfigured?: boolean };
      probe?: { deliveryStatus?: string; attempted?: boolean; httpStatus?: number; errorCode?: string };
      evidence?: string[];
      redaction?: { exporterUrlValuesExcluded?: boolean };
      access?: { mode?: string };
      error?: unknown;
    };

    expect(probe.status).toBe(503);
    expect(probe.headers.get("x-sena-observed-route")).toBe(opsSurfaces.observabilityProbe.observedRoute);
    expect(probeBody.schemaVersion).toBe("sena-enterprise-observability-probe/v1");
    expect(probeBody.status).toBe("review");
    expect(probeBody.provider?.name).toBe("not-configured");
    expect(probeBody.provider?.externalSinkConfigured).toBe(false);
    expect(probeBody.probe?.deliveryStatus).toBe("not-configured");
    expect(probeBody.probe?.attempted).toBe(false);
    expect(probeBody.probe?.httpStatus).toBeUndefined();
    expect(probeBody.probe?.errorCode).toBeUndefined();
    expect(probeBody.evidence).toContain("observabilityProbeDelivery=not-configured");
    expect(probeBody.evidence).toContain("observabilityProbeAttempted=false");
    expect(probeBody.redaction?.exporterUrlValuesExcluded).toBe(true);
    expect(probeBody.access?.mode).toBe("bearer");
    expect(probeBody.error).toBeUndefined();
    expect(probe.headers.get("x-sena-observability-probe-delivery")).toBe("not-configured");
    expect(probe.headers.get("x-sena-observability-probe-attempted")).toBe("false");
    expect(probe.headers.get("x-sena-observability-probe-http-status")).toBe("missing");
    expect(probe.headers.get("x-sena-observability-exporter")).toBe("missing");
    expectNoLeakedFailureDetail(probeText, harness);

    // "Not configured" has to be decided from env, not by dialling a default.
    // A probe that fell back to localhost or to a vendor default would show up
    // here as an attempted request, and would hang or leak in production.
    expect(harness.fetchAttempts).toEqual([]);
    expect(harness.postgresPoolAttempts()).toBe(0);
  });

  it("keeps /ops/metrics scrapable at 200 and reports every unset backend as a zero gauge", async () => {
    const harness = startUnconfiguredOps({ opsToken });

    const response = await harness.get("metrics");
    const metrics = await response.text();

    // NOTE: metrics is the one surface that answers 2xx here, and that is
    // correct for a Prometheus scrape target — a non-2xx makes the scrape fail
    // and drops every gauge in the body. Its five siblings answer 503 for the
    // same deployment state; the machine-readable not-configured signal here is
    // the gauge set below, not the status line.
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(response.headers.get("x-sena-observed-route")).toBe(opsSurfaces.metrics.observedRoute);

    expect(metrics).toContain('sena_enterprise_ready{status="review"} 0');
    expect(metrics).toContain("sena_enterprise_degraded 0");
    expect(metrics).toContain("sena_enterprise_object_storage_native_configured 0");
    expect(metrics).toContain("sena_enterprise_object_storage_probe_confirmed 0");
    expect(metrics).toContain("sena_enterprise_postgres_probe_confirmed 0");
    expect(metrics).toContain("sena_enterprise_postgres_probe_artifact_configured 0");
    expect(metrics).toContain("sena_enterprise_observability_probe_confirmed 0");
    expect(metrics).toContain("sena_enterprise_observability_sample_store_postgres 0");
    expect(metrics).toContain('sena_enterprise_observability_samples{store="current-process-ring-buffer"}');
    expect(metrics).toContain("sena_enterprise_server_job_store_postgres 0");
    expect(metrics).toContain("sena_enterprise_audit_store_postgres 0");
    expect(metrics).toContain("sena_enterprise_object_storage_webhook_configured 0");
    expect(metrics).toContain("sena_enterprise_database_sync_webhook_configured 0");

    // A scrape body is a public-ish artifact; it must carry gauges, not paths or
    // exception text.
    expectNoLeakedFailureDetail(metrics, harness);
    expect(harness.fetchAttempts).toEqual([]);
    expect(harness.postgresPoolAttempts()).toBe(0);
  });

  it("keeps answering /ops/metrics 200 once the deployment is degraded, so the scrape carries the gauges that say so", async () => {
    // A Prometheus scrape target that answers non-2xx has FAILED the scrape: `up`
    // goes to 0 and not one sample line is ingested. The gauges that report the
    // degradation are computed and serialised on exactly the request that would
    // have thrown them away, so an alert written `sena_enterprise_degraded == 1`
    // could never fire and only a bare `up == 0` was left, saying nothing about
    // what broke.
    const harness = startUnconfiguredOps({ opsToken });

    // A real degraded status, not a stub. One warm-up scrape initialises
    // enterprise-db.json (the read path only writes when the file is absent —
    // lib/sena/enterprise/state.ts:736), after which a read-only data directory
    // fails probeWrite and probeLock without making the state read itself throw.
    // Those flip `ops-storage-writable` and `ops-storage-lock` to "review", two of
    // the five checks that make buildEnterpriseOpsStatus report "degraded"
    // (lib/sena/enterprise/ops-status.ts:748).
    expect(await (await harness.get("metrics")).text()).toContain("sena_enterprise_degraded 0");
    chmodSync(harness.enterpriseDbDir, 0o555);
    try {
      const response = await harness.get("metrics");
      const metrics = await response.text();

      // The degradation is in the body, which is only worth anything if the body
      // is ingested.
      expect(metrics).toContain("sena_enterprise_degraded 1");
      expect(response.status).toBe(200);
      // The exposition contract is unchanged by answering 200.
      expect(response.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
      expect(response.headers.get("x-sena-observed-route")).toBe(opsSurfaces.metrics.observedRoute);
      expect(metrics).toContain("# TYPE sena_enterprise_degraded gauge");
      expectNoLeakedFailureDetail(metrics, harness);
    } finally {
      chmodSync(harness.enterpriseDbDir, 0o755);
    }
  });

  it("books a handler-declared informational not-configured response as a report, not a server error", async () => {
    // The classification boundary. `recordEnterpriseObservedRequest` cannot read
    // "nothing failed here" off a status code — a 503 from an exhausted backend or
    // a lock timeout is a genuine error and has to keep counting — so the handler
    // that built the response is the only place that knows, and it says so by
    // passing `informational`.
    const harness = startUnconfiguredOps({ opsToken });
    const observability = await import("../enterprise/ops-observability");

    const informationalProbes = [
      opsSurfaces.postgres.observedRoute,
      opsSurfaces.objectStorage.observedRoute,
      opsSurfaces.cdn.observedRoute,
      opsSurfaces.observabilityProbe.observedRoute
    ];
    for (const routeId of informationalProbes) {
      observability.recordEnterpriseObservedRequest({
        routeId,
        method: "GET",
        statusCode: 503,
        durationMs: 5,
        informational: true
      });
    }

    const snapshot = observability.getEnterpriseObservabilitySnapshot();

    // The wire fact is kept — these really were 503s — but none of them is an error.
    expect(snapshot.summary.total).toBe(4);
    expect(snapshot.summary.informational).toBe(4);
    expect(snapshot.summary.errors).toBe(0);
    expect(snapshot.summary.serverErrors).toBe(0);
    expect(snapshot.summary.clientErrors).toBe(0);
    expect(snapshot.summary.errorRatePercent).toBe(0);
    expect(snapshot.summary.sloBreached).toBe(false);
    expect(snapshot.evidence).toContain("observabilityInformationalResponses=4");

    const byRoute = new Map(snapshot.routes.map((route) => [route.routeId, route]));
    for (const routeId of informationalProbes) {
      expect(byRoute.get(routeId)?.total).toBe(1);
      // No probe is charged an error for answering the question it exists to answer.
      expect(byRoute.get(routeId)?.errors).toBe(0);
    }

    const samples = observability.listEnterpriseObservedRequests();
    expect(samples.every((sample) => sample.statusClass === "5xx")).toBe(true);
    expect(samples.every((sample) => sample.informational)).toBe(true);
    expect(samples.every((sample) => sample.error === false)).toBe(true);
  });

  it("still books an unmarked 5xx as a server error, so a real failure moves the rate", async () => {
    // The other half of the boundary: nothing about 5xx was relaxed. A response the
    // handler did NOT declare informational counts exactly as it did before, and
    // still drives errorRatePercent and the SLO.
    const harness = startUnconfiguredOps({ opsToken });
    const observability = await import("../enterprise/ops-observability");

    for (const routeId of [
      opsSurfaces.postgres.observedRoute,
      opsSurfaces.objectStorage.observedRoute,
      opsSurfaces.cdn.observedRoute
    ]) {
      observability.recordEnterpriseObservedRequest({
        routeId,
        method: "GET",
        statusCode: 503,
        durationMs: 5,
        informational: true
      });
    }
    // Same status code, same route, no informational declaration: a Postgres lock
    // timeout or an exhausted pool reaching the caller as a 503.
    observability.recordEnterpriseObservedRequest({
      routeId: opsSurfaces.postgres.observedRoute,
      method: "GET",
      statusCode: 503,
      durationMs: 5
    });

    const snapshot = observability.getEnterpriseObservabilitySnapshot();

    expect(snapshot.summary.total).toBe(4);
    expect(snapshot.summary.informational).toBe(3);
    expect(snapshot.summary.errors).toBe(1);
    expect(snapshot.summary.serverErrors).toBe(1);
    expect(snapshot.summary.errorRatePercent).toBe(25);
    // 25% is over the default error-rate SLO, so the breach the deployment
    // actually has still surfaces.
    expect(snapshot.summary.sloBreached).toBe(true);

    const postgresRoute = snapshot.routes.find((route) => route.routeId === opsSurfaces.postgres.observedRoute);
    expect(postgresRoute?.total).toBe(2);
    expect(postgresRoute?.errors).toBe(1);
  });

  it("books the four unconfigured probe scrapes as informational end to end, leaving the deployment's own SLO unbreached", async () => {
    // Was a DEFECT pin. The classification was fixed first — the two cases above
    // pin that a declared response leaves the error count and an undeclared 5xx
    // does not — but the declaration had no way to travel from the handler that
    // knows to the recorder that counts, so a monitor polling the probes on a
    // half-provisioned deployment saw an error-rate SLI pinned at 100% with
    // nothing failed, during exactly the pre-go-live window the signal is for.
    //
    // The middle is now wired: each probe stamps the api-helpers sentinel on its
    // own not-configured Response, and observeSenaApiRoute reads it off that
    // Response and passes `informational` to the recorder.
    const harness = startUnconfiguredOps({
      opsToken,
      // The case is about the error-rate term of the SLO. Pinning the latency
      // term keeps a slow machine from breaching on p95 and reporting it here as
      // a classification failure.
      env: { SENA_OBSERVABILITY_SLO_P95_MS: "120000" }
    });

    await harness.get("postgres");
    await harness.get("objectStorage");
    await harness.get("cdn");
    await harness.get("observabilityProbe");

    // The alert-rule-facing artifact first, over exactly those four scrapes: a
    // Prometheus rule keyed on the SLO has nothing to fire on.
    const metrics = await (await harness.get("metrics")).text();
    expect(metrics).toContain('sena_enterprise_observability_slo_breached{store="current-process-ring-buffer"} 0');
    expect(metrics).toContain('sena_enterprise_observability_error_rate_percent{store="current-process-ring-buffer"} 0');

    const observability = await harness.get("observability");
    const body = await observability.json() as {
      summary?: { total?: number; errors?: number; informational?: number; serverErrors?: number; clientErrors?: number; errorRatePercent?: number; sloBreached?: boolean };
      routes?: Array<{ routeId?: string; total?: number; errors?: number }>;
      evidence?: string[];
    };

    // Five samples: the four probes plus the /ops/metrics scrape on the line
    // above, which is observed like any other request and answered 200.
    expect(body.summary?.total).toBe(5);
    // The wire fact is kept — those four really were 503s — but none of them is
    // an error, so no error budget is spent reporting an unset backend.
    expect(body.summary?.informational).toBe(4);
    expect(body.summary?.errors).toBe(0);
    expect(body.summary?.serverErrors).toBe(0);
    expect(body.summary?.clientErrors).toBe(0);
    expect(body.summary?.errorRatePercent).toBe(0);
    expect(body.summary?.sloBreached).toBe(false);
    expect(body.evidence).toContain("observabilityInformationalResponses=4");

    const byRoute = new Map((body.routes ?? []).map((route) => [route.routeId, route]));
    for (const routeId of [
      opsSurfaces.postgres.observedRoute,
      opsSurfaces.objectStorage.observedRoute,
      opsSurfaces.cdn.observedRoute,
      opsSurfaces.observabilityProbe.observedRoute
    ]) {
      expect(byRoute.get(routeId)?.total).toBe(1);
      // No probe is charged an error for answering the question it exists to answer.
      expect(byRoute.get(routeId)?.errors).toBe(0);
    }

    // Decided from env, as before: still nothing dialled, still no pool opened.
    expect(harness.fetchAttempts).toEqual([]);
    expect(harness.postgresPoolAttempts()).toBe(0);
  });

  it("keeps a probe that dialled a CONFIGURED backend and lost counted as a server error that moves the rate", async () => {
    // The other side of the distinction, end to end this time. Getting it
    // backwards — marking every 503 the probes emit — would mute a real edge
    // outage, which is worse than the defect being fixed.
    const harness = startUnconfiguredOps({
      opsToken,
      // A CDN target IS configured here. The harness fetch refuses every outbound
      // call, so the probe dials it and loses: cdn-verification's fetch_error
      // branch, which keeps target.configured true.
      env: {
        SENA_CDN_VERIFY_URL: "https://cdn.sena.invalid/",
        SENA_OBSERVABILITY_SLO_P95_MS: "120000"
      }
    });

    const cdn = await harness.get("cdn");
    const cdnBody = await cdn.json() as { target?: { configured?: boolean }; evidence?: string[] };
    expect(cdn.status).toBe(503);
    // Configured, dialled, failed — not the not-configured answer.
    expect(cdnBody.target?.configured).toBe(true);
    expect(cdnBody.evidence).toContain("errorCode=fetch_error");
    expect(harness.fetchAttempts).toHaveLength(1);

    // The three genuinely unconfigured probes alongside it, so the rate has both
    // kinds in the same window.
    await harness.get("postgres");
    await harness.get("objectStorage");
    await harness.get("observabilityProbe");

    const body = await (await harness.get("observability")).json() as {
      summary?: { total?: number; errors?: number; informational?: number; serverErrors?: number; errorRatePercent?: number; sloBreached?: boolean };
      routes?: Array<{ routeId?: string; total?: number; errors?: number }>;
    };

    expect(body.summary?.total).toBe(4);
    expect(body.summary?.informational).toBe(3);
    expect(body.summary?.errors).toBe(1);
    expect(body.summary?.serverErrors).toBe(1);
    // One real failure in four requests, over the default 5% error-rate SLO: the
    // breach a dead CDN should raise still raises.
    expect(body.summary?.errorRatePercent).toBe(25);
    expect(body.summary?.sloBreached).toBe(true);

    const byRoute = new Map((body.routes ?? []).map((route) => [route.routeId, route]));
    expect(byRoute.get(opsSurfaces.cdn.observedRoute)?.errors).toBe(1);
    for (const routeId of [
      opsSurfaces.postgres.observedRoute,
      opsSurfaces.objectStorage.observedRoute,
      opsSurfaces.observabilityProbe.observedRoute
    ]) {
      expect(byRoute.get(routeId)?.errors).toBe(0);
    }
  });

  it("strips the informational sentinel before the response leaves, so no client ever sees it", async () => {
    // The declaration is an internal signal between the handler and
    // observeSenaApiRoute. Leaking it would publish a header no caller can act on
    // and would hand an attacker the marker's exact name and value.
    const harness = startUnconfiguredOps({ opsToken });
    const { senaInformationalResponseHeaderName } = await import("../api-helpers");

    for (const surface of ["postgres", "objectStorage", "cdn", "observabilityProbe"] as const) {
      const response = await harness.get(surface);
      expect(response.status).toBe(503);
      expect(response.headers.get(senaInformationalResponseHeaderName)).toBeNull();
      // Nothing under another spelling either.
      expect([...response.headers.keys()].filter((name) => name.includes("informational"))).toEqual([]);
    }

    // ...and the marker was really set on every one of those responses, so the
    // assertions above cannot be satisfied by a sentinel that is never stamped.
    const observability = await import("../enterprise/ops-observability");
    expect(observability.getEnterpriseObservabilitySnapshot().summary.informational).toBe(4);
  });

  it("ignores a client-supplied sentinel on the request, so a caller cannot launder its own 5xx", async () => {
    // The declaration is read off the Response the handler built, never off the
    // request, and the marker's value is a per-process token minted in
    // api-helpers that never leaves the process. A caller that learns the header
    // name gets nothing from either half.
    const harness = startUnconfiguredOps({
      opsToken,
      env: {
        SENA_CDN_VERIFY_URL: "https://cdn.sena.invalid/",
        SENA_OBSERVABILITY_SLO_P95_MS: "120000"
      }
    });
    const { senaInformationalResponseHeaderName } = await import("../api-helpers");

    // A genuine failure — configured CDN, refused dial — with the sentinel spoofed
    // on the request, in the two shapes a caller would try.
    const spoofed = await harness.get("cdn", {
      headers: { [senaInformationalResponseHeaderName]: "true" }
    });
    expect(spoofed.status).toBe(503);
    expect(spoofed.headers.get(senaInformationalResponseHeaderName)).toBeNull();

    const spoofedWithGuessedToken = await harness.get("cdn", {
      headers: { [senaInformationalResponseHeaderName]: "3f1d9c3e-6a1e-4a2f-9f1a-0b7c5d2e8a41" }
    });
    expect(spoofedWithGuessedToken.status).toBe(503);

    const observability = await import("../enterprise/ops-observability");
    const snapshot = observability.getEnterpriseObservabilitySnapshot();

    // Both failures counted, neither laundered.
    expect(snapshot.summary.total).toBe(2);
    expect(snapshot.summary.informational).toBe(0);
    expect(snapshot.summary.errors).toBe(2);
    expect(snapshot.summary.serverErrors).toBe(2);
    expect(snapshot.summary.errorRatePercent).toBe(100);
    expect(snapshot.summary.sloBreached).toBe(true);
  });

  it("refuses each probe 401 with a machine-readable code when no ops credential is configured either", async () => {
    // SENA_OPS_TOKEN unset is itself an unconfigured service. The refusal has to
    // be a clean, coded 401 — not a crash, and not a leak of how the session
    // lookup failed.
    const harness = startUnconfiguredOps();

    for (const surface of Object.keys(opsSurfaces) as OpsSurfaceName[]) {
      const response = await harness.get(surface);
      const text = await response.text();
      const body = JSON.parse(text) as { error?: string; code?: string };

      expect(response.status).toBe(401);
      expect(body.code).toBe("auth_required");
      expect(body.error).toBe("Sign in is required.");
      expect(response.headers.get("x-sena-observed-route")).toBe(opsSurfaces[surface].observedRoute);
      expectNoLeakedFailureDetail(text, harness);
    }

    expect(harness.fetchAttempts).toEqual([]);
    expect(harness.postgresPoolAttempts()).toBe(0);
  });

  it("refuses with a coded 401 when the session lookup itself fails against an unreachable backend, leaking no driver detail", async () => {
    // This case was a DEFECT pin: the "no ops token configured" branch of
    // resolveOpsAccess returned early, calling opsSessionAccess OUTSIDE the
    // try/catch that normalises unrecognised throws, so a Postgres primary that
    // could not be reached — the state of a half-provisioned deployment — reached
    // enterpriseErrorResponse and had its raw message published verbatim in the
    // body of an UNAUTHENTICATED response, internal hostname and all.
    //
    // Both halves of that are now closed (lib/sena/ops-api.ts:273-274, and
    // lib/sena/enterprise/errors.ts, which no longer publishes a raw Error.message
    // for unrecognised throws). The case is kept, inverted, as the regression that
    // holds the leak shut.
    const unreachableHost = "db-internal.sena.invalid";
    const harnessEnv = {
      SENA_ENTERPRISE_DB_ADAPTER: "postgres",
      SENA_ENTERPRISE_STATE_STORE: "postgres",
      SENA_ENTERPRISE_POSTGRES_URL: `postgres://sena_user:super-secret@${unreachableHost}/senadb?sslmode=require`
    };
    const failingPg = async () => {
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${unreachableHost}`), { code: "ENOTFOUND" });
    };

    const tokenless = startUnconfiguredOps({
      env: harnessEnv,
      sessionCookie: "any-cookie-value-an-anonymous-caller-can-invent",
      pgQuery: failingPg
    });

    const response = await tokenless.get("observability");
    const text = await response.text();
    const body = JSON.parse(text) as { error?: string; code?: string };

    // A coded refusal with no backend detail. The code is deliberately NOT
    // ops_token_required: no ops token is configured here, so naming a bearer
    // token would send the operator after a credential this deployment does not
    // accept.
    expect(response.status).toBe(401);
    expect(body.code).toBe("ops_session_unverified");
    // Nothing about the backend that failed reaches an unauthenticated caller.
    expect(text).not.toContain("ENOTFOUND");
    expect(text).not.toContain(unreachableHost);
    expect(text).not.toContain("super-secret");
    expectNoLeakedFailureDetail(text, tokenless);
    releaseHarness?.();
    releaseHarness = undefined;

    // The other branch, unchanged: the SAME request against the SAME broken
    // backend with an ops token configured is refused as ops_token_required,
    // because there a bearer token is the credential that would work.
    const guarded = startUnconfiguredOps({
      opsToken,
      env: harnessEnv,
      sessionCookie: "any-cookie-value-an-anonymous-caller-can-invent",
      pgQuery: failingPg
    });

    const guardedResponse = await guarded.get("observability", { headers: { authorization: "" } });
    const guardedText = await guardedResponse.text();
    const guardedBody = JSON.parse(guardedText) as { error?: string; code?: string };

    expect(guardedResponse.status).toBe(401);
    expect(guardedBody.code).toBe("ops_token_required");
    expect(guardedText).not.toContain(unreachableHost);
    expect(guardedText).not.toContain("ENOTFOUND");
    expect(guardedText).not.toContain("super-secret");
  });
});
