import { afterEach, describe, expect, it } from "vitest";
import { buildEnterpriseProductionPerformancePath } from "../enterprise/ops-productionization";
import {
  conferenceLoadRehearsalProductionEvidenceRequired,
  conferenceLoadRehearsalProductionEvidenceReadiness,
  runEnterpriseConferenceLoadRehearsal
} from "../enterprise/conference-load-rehearsal";

const conferenceLoadEnvNames = [
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED",
  "SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256",
  "SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT",
  "SENA_CONFERENCE_LOAD_REHEARSAL_USERS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT",
  "SENA_LOAD_MAX_P95_MS",
  "SENA_LOAD_MAX_ERROR_RATE_PERCENT"
];

function okFetch() {
  return Promise.resolve(new Response("ok", { status: 200 }));
}

function slowFetch() {
  return new Promise<Response>((resolve) => {
    setTimeout(() => resolve(new Response("ok", { status: 200 })), 20);
  });
}

function dnsErrorFetch() {
  return Promise.reject(Object.assign(new TypeError("fetch failed"), {
    cause: {
      code: "ENOTFOUND",
      hostname: "private-sena-host.example.test"
    }
  }));
}

describe("SENA conference load rehearsal artifact", () => {
  afterEach(() => {
    for (const name of conferenceLoadEnvNames) delete process.env[name];
  });

  it("emits a redacted pass artifact for a bounded rehearsal profile", async () => {
    const artifact = await runEnterpriseConferenceLoadRehearsal({
      fetchImpl: okFetch,
      env: {
        SENA_LOAD_TARGET_URL: "https://sena.example.test/private?token=secret",
        SENA_LOAD_PATHS: "/workspace/sena,/api/sena/docs?format=openapi",
        SENA_LOAD_TARGET_USERS: "2",
        SENA_LOAD_CONCURRENCY: "2",
        SENA_LOAD_DURATION_SECONDS: "1",
        SENA_LOAD_THINK_TIME_MS: "0",
        SENA_LOAD_MAX_REQUESTS: "4",
        SENA_LOAD_MIN_REQUESTS: "4",
        SENA_LOAD_MAX_P95_MS: "1000",
        SENA_LOAD_MAX_ERROR_RATE_PERCENT: "0"
      }
    });
    const serialized = JSON.stringify(artifact);

    expect(artifact.schemaVersion).toBe("sena-enterprise-conference-load-rehearsal/v1");
    expect(artifact.status).toBe("pass");
    expect(artifact.summary.totalRequests).toBe(4);
    expect(artifact.summary.errors).toBe(0);
    expect(artifact.summary.rampRequests).toBe(0);
    expect(artifact.summary.sustainRequests).toBe(4);
    expect(artifact.summary.sustainP95Ms).toBe(artifact.summary.p95Ms);
    expect(artifact.target.productionTargetSatisfied).toBe(false);
    expect(artifact.target.configuredRampSeconds).toBe(0);
    expect(artifact.target.configuredSustainDurationSeconds).toBe(1);
    expect(artifact.target.loadProfile).toBe("instant");
    expect(artifact.routes.every((route) => route.ramp === 0 && route.sustain === route.total)).toBe(true);
    expect(artifact.routes.map((route) => route.routeId)).toEqual(["/api/sena/docs", "/workspace/sena"]);
    expect(serialized).not.toContain("sena.example.test");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("format=openapi");
    expect(artifact.redaction.responseBodiesExcluded).toBe(true);
  });

  it("records a linear-ramp profile separately from the sustained load window", async () => {
    const artifact = await runEnterpriseConferenceLoadRehearsal({
      fetchImpl: okFetch,
      env: {
        SENA_LOAD_TARGET_URL: "https://sena.example.test",
        SENA_LOAD_PATHS: "/workspace/sena",
        SENA_LOAD_TARGET_USERS: "2",
        SENA_LOAD_CONCURRENCY: "2",
        SENA_LOAD_RAMP_SECONDS: "1",
        SENA_LOAD_DURATION_SECONDS: "1",
        SENA_LOAD_THINK_TIME_MS: "0",
        SENA_LOAD_MAX_REQUESTS: "1",
        SENA_LOAD_MIN_REQUESTS: "1",
        SENA_LOAD_MAX_P95_MS: "1000",
        SENA_LOAD_MAX_ERROR_RATE_PERCENT: "0"
      }
    });

    expect(artifact.status).toBe("pass");
    expect(artifact.target.loadProfile).toBe("linear-ramp");
    expect(artifact.target.configuredRampSeconds).toBe(1);
    expect(artifact.target.configuredSustainDurationSeconds).toBe(1);
    expect(artifact.summary.rampRequests).toBe(1);
    expect(artifact.summary.sustainRequests).toBe(0);
    expect(artifact.evidence).toEqual(expect.arrayContaining([
      "configuredRampSeconds=1",
      "rampRequests=1",
      "sustainRequests=0"
    ]));
  });

  it("fails when latency exceeds the configured p95 SLO", async () => {
    const artifact = await runEnterpriseConferenceLoadRehearsal({
      fetchImpl: slowFetch,
      env: {
        SENA_LOAD_TARGET_URL: "https://sena.example.test",
        SENA_LOAD_PATHS: "/workspace/sena",
        SENA_LOAD_TARGET_USERS: "1",
        SENA_LOAD_CONCURRENCY: "1",
        SENA_LOAD_DURATION_SECONDS: "1",
        SENA_LOAD_THINK_TIME_MS: "0",
        SENA_LOAD_MAX_REQUESTS: "1",
        SENA_LOAD_MAX_P95_MS: "1"
      }
    });

    expect(artifact.status).toBe("fail");
    expect(artifact.checks.find((check) => check.id === "p95-latency")).toEqual(expect.objectContaining({
      status: "fail",
      threshold: 1
    }));
    expect(artifact.nextActions).toContain("Tune CDN/origin capacity, reduce route work, or route heavier requests through the server job queue.");
  });

  it("records redacted network error classes without leaking hostnames from fetch failures", async () => {
    const artifact = await runEnterpriseConferenceLoadRehearsal({
      fetchImpl: dnsErrorFetch,
      env: {
        SENA_LOAD_TARGET_URL: "https://sena.example.test/private?token=secret",
        SENA_LOAD_PATHS: "/workspace/sena",
        SENA_LOAD_TARGET_USERS: "1",
        SENA_LOAD_CONCURRENCY: "1",
        SENA_LOAD_DURATION_SECONDS: "1",
        SENA_LOAD_THINK_TIME_MS: "0",
        SENA_LOAD_MAX_REQUESTS: "1"
      }
    });
    const serialized = JSON.stringify(artifact);

    expect(artifact.status).toBe("fail");
    expect(artifact.routes[0]?.statusClasses).toEqual({
      "network-dns-error": 1
    });
    expect(serialized).not.toContain("private-sena-host.example.test");
    expect(serialized).not.toContain("sena.example.test");
    expect(serialized).not.toContain("token=secret");
  });

  it("fails production-required rehearsal evidence when the target origin is local", async () => {
    const artifact = await runEnterpriseConferenceLoadRehearsal({
      fetchImpl: okFetch,
      env: {
        SENA_LOAD_REQUIRE_PRODUCTION_TARGET: "1",
        SENA_LOAD_TARGET_URL: "http://127.0.0.1:3005",
        SENA_LOAD_PATHS: "/workspace/sena",
        SENA_LOAD_TARGET_USERS: "50",
        SENA_LOAD_CONCURRENCY: "1",
        SENA_LOAD_DURATION_SECONDS: "1800",
        SENA_LOAD_THINK_TIME_MS: "0",
        SENA_LOAD_MAX_REQUESTS: "1",
        SENA_LOAD_MIN_REQUESTS: "1",
        SENA_LOAD_MAX_ERROR_RATE_PERCENT: "0"
      }
    });
    const originCheck = artifact.checks.find((check) => check.id === "production-origin");

    expect(artifact.status).toBe("fail");
    expect(artifact.target.productionTargetSatisfied).toBe(false);
    expect(artifact.target.productionOriginSatisfied).toBe(false);
    expect(originCheck).toEqual(expect.objectContaining({
      status: "fail",
      threshold: 1
    }));
    expect(artifact.nextActions).toContain("Set SENA_LOAD_TARGET_URL to the deployed HTTPS production URL before binding conference-scale evidence.");
  });

  it("requires production-scale metadata before confirming release evidence", () => {
    const verifiedAt = new Date().toISOString();
    const ready = conferenceLoadRehearsalProductionEvidenceReadiness({
      SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED: "1",
      SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256: "a".repeat(64),
      SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT: verifiedAt,
      SENA_CONFERENCE_LOAD_REHEARSAL_USERS: "50",
      SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS: "1800",
      SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS: "750",
      SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT: "0"
    });
    const insufficient = conferenceLoadRehearsalProductionEvidenceReadiness({
      SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED: "1",
      SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256: "b".repeat(64),
      SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT: verifiedAt,
      SENA_CONFERENCE_LOAD_REHEARSAL_USERS: "50",
      SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS: "30",
      SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS: "750",
      SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT: "0"
    });

    expect(ready.confirmed).toBe(true);
    expect(insufficient.confirmed).toBe(false);
    expect(insufficient.durationConfigured).toBe(false);
  });

  it("keeps deployment readiness under review when bound conference load metadata exceeds SLO", () => {
    const verifiedAt = new Date().toISOString();
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED = "1";
    process.env.SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256 = "a".repeat(64);
    process.env.SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT = verifiedAt;
    process.env.SENA_CONFERENCE_LOAD_REHEARSAL_USERS = "50";
    process.env.SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS = "1800";
    process.env.SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS = "3000";
    process.env.SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT = "2";

    const readiness = conferenceLoadRehearsalProductionEvidenceReadiness();
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
    const loadItem = performancePath.items.find((item) => item.id === "production-conference-load-rehearsal");

    expect(readiness).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      usersConfigured: true,
      durationConfigured: true,
      p95Configured: true,
      errorRateConfigured: true,
      p95WithinSlo: false,
      errorRateWithinSlo: false
    }));
    expect(readiness.evidence).toEqual(expect.arrayContaining([
      "conferenceLoadP95Ms=present",
      "conferenceLoadP95WithinSlo=false",
      "conferenceLoadMaxP95Ms=2000",
      "conferenceLoadErrorRatePercent=present",
      "conferenceLoadErrorRateWithinSlo=false",
      "conferenceLoadMaxErrorRatePercent=1"
    ]));
    expect(performancePath.summary.blockers).toContain("production-conference-load-rehearsal");
    expect(loadItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(loadItem?.evidence).toEqual(expect.arrayContaining([
      "conferenceLoadArtifactSha256=present",
      "conferenceLoadUsers=valid",
      "conferenceLoadDurationSeconds=valid",
      "conferenceLoadP95WithinSlo=false",
      "conferenceLoadErrorRateWithinSlo=false",
      "loadP95Ms=3000",
      "loadErrorRatePercent=2"
    ]));
  });

  it("requires production-scale rehearsal evidence for production and production performance gates", () => {
    expect(conferenceLoadRehearsalProductionEvidenceRequired({ NODE_ENV: "production" })).toBe(true);
    expect(conferenceLoadRehearsalProductionEvidenceRequired({ SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH: "1" })).toBe(true);
    expect(conferenceLoadRehearsalProductionEvidenceRequired({ SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED: "1" })).toBe(true);
    expect(conferenceLoadRehearsalProductionEvidenceRequired({ SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED: "1" })).toBe(true);
    expect(conferenceLoadRehearsalProductionEvidenceRequired({})).toBe(false);

    const readiness = conferenceLoadRehearsalProductionEvidenceReadiness({
      SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH: "1"
    });

    expect(readiness.required).toBe(true);
    expect(readiness.confirmed).toBe(false);
    expect(readiness.evidence).toEqual(expect.arrayContaining([
      "conferenceLoadRequired=true",
      "conferenceLoadExplicitlyRequired=false",
      "conferenceLoadProductionRuntime=false",
      "conferenceLoadProductionPerformancePathRequired=true",
      "conferenceLoadProductionEvidenceManifestRequired=false",
      "conferenceLoadSaasOperatingModelApproved=false",
      "conferenceLoadArtifactSha256=missing-or-invalid",
      "conferenceLoadDurationSeconds=missing-or-insufficient"
    ]));
  });
});
