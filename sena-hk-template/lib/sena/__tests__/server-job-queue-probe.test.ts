import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_OPS_TOKEN",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_PROVIDER_URL",
  "SENA_JOB_QUEUE_PROVIDER_TOKEN",
  "SENA_JOB_QUEUE_NAME",
  "SENA_JOB_QUEUE_SECRET",
  "SENA_JOB_QUEUE_TIMEOUT_MS",
  "SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD",
  "SENA_JOB_QUEUE_CONTRACT_REQUIRED",
  "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
  "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
  "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
  "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED",
  "SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED",
  "SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256",
  "SENA_JOB_QUEUE_PROBE_VERIFIED_AT",
  "SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "DATABASE_URL",
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
  "QSTASH_URL",
  "QSTASH_TOKEN",
  "QSTASH_QUEUE_NAME",
  "UPSTASH_QSTASH_URL",
  "UPSTASH_QSTASH_TOKEN",
  "UPSTASH_QSTASH_QUEUE_NAME"
];

function configureQueueEnv() {
  process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
  process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
  process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
}

describe("SENA server job queue live probe", () => {
  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("dispatches a signed synthetic queue probe without exposing endpoint, secret, or probe id values", async () => {
    configureQueueEnv();
    const requests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: String(init?.body),
        headers: init?.headers as Record<string, string>
      });
      return new Response("accepted", { status: 202 });
    });

    const { verifyEnterpriseServerJobQueueProbe } = await import("../enterprise/server-job-queue");
    const probe = await verifyEnterpriseServerJobQueueProbe({
      fetchImpl,
      probeId: "queue-probe-redaction"
    });
    const serialized = JSON.stringify(probe);
    const outboundPayload = JSON.parse(requests[0]?.body ?? "{}") as {
      schemaVersion?: string;
      probe?: {
        probeId?: string;
        dispatchEvent?: string;
        syntheticUserDataIncluded?: boolean;
      };
    };

    expect(probe.schemaVersion).toBe("sena-enterprise-server-job-queue-probe/v1");
    expect(probe.status).toBe("pass");
    expect(probe.contract.schemaVersion).toBe("sena-enterprise-server-job-queue-contract/v1");
    expect(probe.contract.status).toBe("pass");
    expect(probe.provider).toEqual(expect.objectContaining({
      queueMode: "managed",
      queueProductionReady: true,
      queueEndpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      queueSecretConfigured: true,
      queueEndpointValueExcluded: true,
      queueSecretValuesExcluded: true
    }));
    expect(probe.probe).toEqual(expect.objectContaining({
      dispatchEvent: "server_job.queue.probe",
      deliveryStatus: "delivered",
      attempted: true,
      httpStatus: 202,
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      queuePayloadSchema: "sena-enterprise-server-job-queue-webhook/v2",
      probePayloadSchema: "sena-enterprise-server-job-queue-probe/v1"
    }));
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://jobs.example.test/sena");
    expect(requests[0].headers["x-sena-webhook-event"]).toBe("server_job.queue.probe");
    expect(requests[0].headers["x-sena-schema-version"]).toBe("sena-enterprise-server-job-queue-probe/v1");
    expect(requests[0].headers["x-sena-job-payload-sha256"]).toBe(probe.probe.payloadSha256);
    expect(requests[0].headers["x-sena-webhook-signature"])
      .toBe(`sha256=${createHmac("sha256", "sena-test-job-secret").update(`${requests[0].headers["x-sena-webhook-timestamp"]}.${requests[0].body}`).digest("hex")}`);
    expect(outboundPayload.schemaVersion).toBe("sena-enterprise-server-job-queue-probe/v1");
    expect(outboundPayload.probe?.probeId).toBe("queue-probe-redaction");
    expect(outboundPayload.probe?.dispatchEvent).toBe("server_job.queue.probe");
    expect(outboundPayload.probe?.syntheticUserDataIncluded).toBe(false);
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena-test-job-secret");
    expect(serialized).not.toContain("queue-probe-redaction");
  });

  it("builds a redacted server job queue dispatch and custody contract", async () => {
    configureQueueEnv();
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb";

    const { buildEnterpriseServerJobQueueContract } = await import("../enterprise/server-job-queue");
    const contract = buildEnterpriseServerJobQueueContract();
    const serialized = JSON.stringify(contract);

    expect(contract.schemaVersion).toBe("sena-enterprise-server-job-queue-contract/v1");
    expect(contract.status).toBe("pass");
    expect(contract.summary).toEqual(expect.objectContaining({
      jobKindCount: 5,
      statusActionCount: 6,
      acceptedProviderModeCount: 3,
      durableJobStoreRequired: true,
      signedDispatchRequired: true,
      liveProbeRequiredBeforeProduction: true
    }));
    expect(contract.provider).toEqual(expect.objectContaining({
      queueMode: "managed",
      queueConfigured: true,
      queueProductionReady: true,
      queueEndpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      queueSecretConfigured: true
    }));
    expect(contract.store).toEqual(expect.objectContaining({
      requiredForProduction: true,
      acceptedStore: "postgres-table",
      table: "sena_enterprise_server_jobs",
      localStateFallback: "research-pilot-only",
      activeStore: "postgres-table",
      postgresPrimaryActive: true
    }));
    expect(contract.dispatch).toEqual(expect.objectContaining({
      queuePayloadSchema: "sena-enterprise-server-job-queue-webhook/v2",
      probeSchema: "sena-enterprise-server-job-queue-probe/v1",
      enqueueEvent: "server_job.queue",
      probeEvent: "server_job.queue.probe",
      signatureAlgorithm: "hmac-sha256",
      transportPayloadHashHeader: "x-sena-job-payload-sha256",
      workerPayloadHashHeader: "x-sena-worker-payload-sha256",
      hashSemantics: "exact-body-and-canonical-worker-payload-separated",
      statusCallback: "/api/sena/ops/jobs",
      inlinePayloadAllowed: false,
      inlinePayloadPolicy: "disabled",
      legacyInlineEnvEffect: "none-deprecated",
      inlinePayloadRequiresExplicitEnv: null,
      rawPayloadPersistedInJobStore: false
    }));
    expect(contract.evidence).toContain("serverJobQueueContractInlinePayloadCustody=durable-pointers-only");
    expect(contract.dispatch.acceptedJobKinds).toEqual([
      "analysis",
      "import",
      "publication-export",
      "reliability",
      "validation"
    ]);
    expect(contract.lifecycle.acceptedActions).toEqual([
      "mark-running",
      "renew-lease",
      "mark-succeeded",
      "mark-failed",
      "retry",
      "dead-letter"
    ]);
    expect(contract.lifecycle).toEqual(expect.objectContaining({
      retryDispatchPolicy: "local-polling-only",
      pushProviderRetryPolicy: "provider-native-or-resubmit"
    }));
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    expect(buildEnterpriseServerJobQueueContract().dispatch).toEqual(expect.objectContaining({
      inlinePayloadAllowed: false,
      inlinePayloadPolicy: "disabled",
      legacyInlineEnvEffect: "none-deprecated"
    }));
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena-test-job-secret");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("example.db");
  });

  it("requires a valid queue contract artifact and verified-at timestamp before confirmation", async () => {
    process.env.SENA_JOB_QUEUE_CONTRACT_REQUIRED = "1";
    process.env.SENA_JOB_QUEUE_CONTRACT_CONFIRMED = "1";
    process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256 = "c".repeat(64);
    const { serverJobQueueContractReadiness } = await import("../enterprise/server-job-queue");

    expect(serverJobQueueContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: true,
      verifiedAtConfigured: false
    }));

    const verifiedAt = new Date().toISOString();
    process.env.SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT = verifiedAt;
    process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION = "pass";
    expect(serverJobQueueContractReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "c".repeat(64),
      verifiedAt,
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
  });

  it("requires a valid queue probe artifact and verified-at timestamp before confirmation", async () => {
    process.env.SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED = "1";
    process.env.SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256 = "e".repeat(64);
    const { serverJobQueueProbeReadiness } = await import("../enterprise/server-job-queue");

    expect(serverJobQueueProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: false,
      artifactHashConfigured: true,
      verifiedAtConfigured: false
    }));

    const verifiedAt = new Date().toISOString();
    process.env.SENA_JOB_QUEUE_PROBE_VERIFIED_AT = verifiedAt;
    process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION = "pass";
    expect(serverJobQueueProbeReadiness()).toEqual(expect.objectContaining({
      required: true,
      confirmed: true,
      artifactHash: "e".repeat(64),
      verifiedAt,
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
  });

  it("publishes a signed synthetic queue probe through QStash without exposing provider or worker values", async () => {
    process.env.SENA_JOB_QUEUE_ADAPTER = "qstash";
    process.env.SENA_JOB_WORKER_CALLBACK_URL = "https://www.sena.hk/api/sena/ops/jobs";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-secret";
    process.env.QSTASH_TOKEN = "secret-qstash-token";
    process.env.QSTASH_QUEUE_NAME = "sena-heavy-jobs";
    const requests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: String(init?.body),
        headers: init?.headers as Record<string, string>
      });
      return new Response("accepted", { status: 202 });
    });

    const { verifyEnterpriseServerJobQueueProbe, serverJobQueueStatus } = await import("../enterprise/server-job-queue");
    const status = serverJobQueueStatus();
    const probe = await verifyEnterpriseServerJobQueueProbe({
      fetchImpl,
      probeId: "qstash-queue-probe-redaction"
    });
    const serialized = JSON.stringify({ status, probe });
    const expectedUrl = `https://qstash.upstash.io/v2/enqueue/sena-heavy-jobs/${encodeURIComponent("https://www.sena.hk/api/sena/ops/jobs")}`;

    expect(status).toEqual(expect.objectContaining({
      mode: "qstash",
      configured: true,
      productionReady: true,
      endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      secretConfigured: true
    }));
    expect(status.evidence).toEqual(expect.arrayContaining([
      "queueAdapter=qstash",
      "queueProviderToken=configured",
      "qstashDestination=configured",
      "qstashApiBase=configured"
    ]));
    expect(probe.status).toBe("pass");
    expect(probe.provider).toEqual(expect.objectContaining({
      queueMode: "qstash",
      queueProductionReady: true,
      queueSecretConfigured: true
    }));
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(expectedUrl);
    expect(requests[0].headers.authorization).toBe("Bearer secret-qstash-token");
    expect(requests[0].headers["upstash-forward-x-sena-webhook-event"]).toBe("server_job.queue.probe");
    expect(requests[0].headers["upstash-forward-x-sena-schema-version"]).toBe("sena-enterprise-server-job-queue-probe/v1");
    expect(requests[0].headers["upstash-forward-x-sena-job-payload-sha256"]).toBe(probe.probe.payloadSha256);
    expect(requests[0].headers["upstash-forward-x-sena-webhook-signature"])
      .toBe(`sha256=${createHmac("sha256", "sena-test-job-secret").update(`${requests[0].headers["upstash-forward-x-sena-webhook-timestamp"]}.${requests[0].body}`).digest("hex")}`);
    expect(serialized).not.toContain("secret-qstash-token");
    expect(serialized).not.toContain("sena-test-job-secret");
    expect(serialized).not.toContain("www.sena.hk/api/sena/ops/jobs");
    expect(serialized).not.toContain("qstash-queue-probe-redaction");
  });

  it("requires a live queue probe artifact under production performance gates", async () => {
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb";
    configureQueueEnv();
    process.env.SENA_JOB_WORKER_RUNTIME = "institution-managed-worker";
    process.env.SENA_JOB_WORKER_CALLBACK_URL = "https://sena.example.test/api/sena/ops/jobs";
    process.env.SENA_JOB_WORKER_RUNBOOK_URL = "https://ops.example.test/sena-job-worker";
    process.env.SENA_JOB_WORKER_OWNER = "Institution platform rotation";
    process.env.SENA_JOB_WORKER_HEARTBEAT_CONFIRMED = "1";
    process.env.SENA_JOB_WORKER_HEARTBEAT_SHA256 = "c".repeat(64);
    process.env.SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT = new Date().toISOString();

    const { serverJobQueueContractReadiness, serverJobQueueProbeReadiness } = await import("../enterprise/server-job-queue");
    const contractReadiness = serverJobQueueContractReadiness();
    const readiness = serverJobQueueProbeReadiness();

    expect(contractReadiness).toEqual(expect.objectContaining({
      required: true,
      confirmed: false
    }));
    expect(contractReadiness.evidence).toEqual(expect.arrayContaining([
      "serverJobQueueContractProductionPerformancePathRequired=true",
      "serverJobQueueContractArtifactSha256=missing-or-invalid",
      "serverJobQueueContractVerifiedAt=missing-or-invalid"
    ]));
    expect(readiness).toEqual(expect.objectContaining({
      required: true,
      confirmed: false
    }));
    expect(readiness.evidence).toEqual(expect.arrayContaining([
      "serverJobQueueProductionPerformancePathRequired=true",
      "serverJobQueueProbeArtifactSha256=missing-or-invalid",
      "serverJobQueueProbeVerifiedAt=missing-or-invalid"
    ]));

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
    const queueItem = performancePath.items.find((item) => item.id === "production-server-job-queue");

    expect(queueItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(queueItem?.evidence).toEqual(expect.arrayContaining([
      "queueProductionReady=true",
      "serverJobStore=postgres-table",
      "workerRuntime=institution-managed-worker",
      "workerHeartbeatConfirmed=true",
      "serverJobQueueContractRequired=true",
      "serverJobQueueContractConfirmed=false",
      "serverJobQueueContractArtifactSha256=missing-or-invalid",
      "serverJobQueueLiveProbeRequired=true",
      "serverJobQueueLiveProbeConfirmed=false",
      "serverJobQueueProbeArtifactSha256=missing-or-invalid",
      "serverJobQueueProbeVerifiedAt=missing-or-invalid"
    ]));
    expect(JSON.stringify(queueItem)).not.toContain("super-secret");
    expect(JSON.stringify(queueItem)).not.toContain("jobs.example.test");
  });

  it("keeps the production server job queue in review when the worker contract artifact is not bound", async () => {
    const verifiedAt = new Date().toISOString();
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.DATABASE_URL = "postgres://sena_user:super-secret@example.db/senadb";
    configureQueueEnv();
    process.env.SENA_JOB_WORKER_RUNTIME = "institution-managed-worker";
    process.env.SENA_JOB_WORKER_CALLBACK_URL = "https://sena.example.test/api/sena/ops/jobs";
    process.env.SENA_JOB_WORKER_RUNBOOK_URL = "https://ops.example.test/sena-job-worker";
    process.env.SENA_JOB_WORKER_OWNER = "Institution platform rotation";
    process.env.SENA_JOB_WORKER_HEARTBEAT_CONFIRMED = "1";
    process.env.SENA_JOB_WORKER_HEARTBEAT_SHA256 = "c".repeat(64);
    process.env.SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT = verifiedAt;
    process.env.SENA_JOB_QUEUE_CONTRACT_CONFIRMED = "1";
    process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256 = "d".repeat(64);
    process.env.SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT = verifiedAt;
    process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION = "pass";
    process.env.SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED = "1";
    process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256 = "e".repeat(64);
    process.env.SENA_JOB_QUEUE_PROBE_VERIFIED_AT = verifiedAt;
    process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION = "pass";

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
    const queueItem = performancePath.items.find((item) => item.id === "production-server-job-queue");
    const serialized = JSON.stringify(queueItem);

    expect(performancePath.summary.blockers).toContain("production-server-job-queue");
    expect(queueItem).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(queueItem?.evidence).toEqual(expect.arrayContaining([
      "queueProductionReady=true",
      "serverJobStore=postgres-table",
      "workerRuntime=institution-managed-worker",
      "workerHeartbeatConfirmed=true",
      "serverJobWorkerContractRequired=true",
      "serverJobWorkerContractConfirmed=false",
      "serverJobWorkerContractArtifactSha256=missing-or-invalid",
      "serverJobWorkerContractVerifiedAt=missing-or-invalid",
      "serverJobQueueContractConfirmed=true",
      "serverJobQueueContractArtifactSha256=present",
      "serverJobQueueLiveProbeConfirmed=true",
      "serverJobQueueProbeArtifactSha256=present"
    ]));
    expect(queueItem?.nextAction).toContain("nonce-bound managed-queue to external-worker authenticated callback receipt");
    expect(queueItem?.nextAction).toContain("same-process status-store self-test is insufficient");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("sena-test-job-secret");
    expect(serialized).not.toContain("example.db");
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena.example.test/api/sena/ops/jobs");
  });

  it("exposes the queue live probe through the ops route with redacted headers", async () => {
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    configureQueueEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("accepted", { status: 202 }));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    const route = await import("../../../app/api/sena/ops/jobs/probe/route");
    const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/jobs/probe", {
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

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-sena-server-job-queue-probe")).toBe("pass");
    expect(response.headers.get("x-sena-server-job-queue-delivery")).toBe("delivered");
    expect(response.headers.get("x-sena-server-job-queue-attempted")).toBe("true");
    expect(response.headers.get("x-sena-server-job-queue-http-status")).toBe("202");
    expect(response.headers.get("x-sena-server-job-queue-provider")).toBe("managed");
    expect(response.headers.get("x-sena-server-job-queue-url-values")).toBe("excluded");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-jobs-probe");
    expect(body.schemaVersion).toBe("sena-enterprise-server-job-queue-probe/v1");
    expect(body.status).toBe("pass");
    expect(body.access?.mode).toBe("bearer");
    expect(serialized).not.toContain("jobs.example.test");
    expect(serialized).not.toContain("sena-test-job-secret");
  });
});
