import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_SECRET",
  "SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS",
  "SENA_JOB_WORKER_INLINE_EXECUTION"
];

const queueSecret = "sena-test-job-queue-secret";

function skewedTimestamp(offsetSeconds: number) {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString();
}

// The queue dispatcher signs `${attemptedAt}.${body}` and sends attemptedAt as
// the timestamp header, so a replay fixture is just a request whose signature is
// genuine for a timestamp the receiver should no longer accept.
function signedQueueRequest(input: { body: string; signature?: string; timestamp?: string }) {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const signature = input.signature ??
    `sha256=${createHmac("sha256", queueSecret).update(`${timestamp}.${input.body}`).digest("hex")}`;
  return new Request("https://sena.example.test/api/sena/ops/jobs/worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-webhook-event": "server_job.queue",
      "x-sena-webhook-timestamp": timestamp,
      "x-sena-job-payload-sha256": createHash("sha256").update(input.body).digest("hex"),
      "x-sena-webhook-signature": signature
    },
    body: input.body
  });
}

async function queuedAnalysisJob() {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-job-worker-route-exec-"));
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "local";
  process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
  process.env.SENA_JOB_QUEUE_SECRET = queueSecret;

  const enterprise = await import("../enterprise");
  const index = await import("../index");
  const queue = await import("../enterprise/server-job-queue");
  const importAnalysis = await import("../enterprise/import-analysis");

  const registered = enterprise.registerEnterpriseUser({
    name: "Route Worker Owner",
    email: "route-worker-owner@example.edu",
    password: "sena-secure-123",
    organization: "Route Worker Lab",
    plan: "lab"
  });
  const teamId = registered.context.teams[0].id;
  const imported = index.importSenaJsonContract(index.lessonStudySenaContract);
  const model = index.buildSenaModel(imported.dataset);
  const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
    teamId,
    title: "Route Worker Project",
    description: "Fixture project for the worker route executor.",
    snapshot: index.buildSenaProjectSnapshot(model, {
      title: "Route Worker Source",
      generatedAt: "2026-08-15T00:00:00.000Z",
      sourceDataset: imported.dataset
    })
  });

  const workerPayload = {
    action: "run-analysis",
    teamId,
    projectId: project.id,
    projectVersion: project.currentVersion,
    title: project.title,
    includeRuntimeBundle: false,
    persist: false,
    updateProject: true
  };
  const job = await queue.enqueueEnterpriseServerJob({
    kind: "analysis",
    teamId,
    projectId: project.id,
    actorUserId: registered.context.user.id,
    payload: workerPayload,
    payloadSummary: {
      source: "project",
      projectVersion: project.currentVersion,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    }
  });

  const { delivery: _delivery, ...jobWithoutDelivery } = job;
  const body = JSON.stringify({
    schemaVersion: "sena-enterprise-server-job-queue-webhook/v1",
    generatedAt: "2026-08-15T00:00:00.000Z",
    job: jobWithoutDelivery,
    workerPayload,
    delivery: {
      provider: job.provider.mode,
      secretConfigured: true,
      payloadSha256: job.payloadSha256
    },
    redaction: {
      responsePayloadValuesExcluded: true,
      auditPayloadValuesExcluded: true,
      secretValuesExcluded: true
    }
  });

  return { enterpriseDbDir, enterprise, queue, importAnalysis, context: registered.context, teamId, job, body };
}

describe("SENA server job worker route execution", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.resetModules();
  });

  it("executes a signed queue webhook and lands the job succeeded", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({ body: fixture.body }));
    const body = await response.json() as {
      status?: string;
      execution?: {
        attempted?: boolean;
        status?: string;
        jobStatus?: string;
        resultIdValuesExcluded?: boolean;
      };
    };

    expect(response.status).toBe(202);
    expect(body.status).toBe("accepted");
    expect(body.execution?.attempted).toBe(true);
    expect(body.execution?.status).toBe("succeeded");
    expect(body.execution?.jobStatus).toBe("succeeded");
    expect(body.execution?.resultIdValuesExcluded).toBe(true);
    expect(response.headers.get("x-sena-server-job-worker-execution")).toBe("succeeded");
    expect(JSON.stringify(body)).not.toContain(fixture.job.id);

    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("succeeded");

    const runs = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs).toHaveLength(1);
  });

  it("rejects a queue webhook with a bad signature and executes nothing", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({
      body: fixture.body,
      signature: `sha256=${"0".repeat(64)}`
    }));
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(401);
    expect(body.code).toBe("server_job_worker_signature_invalid");

    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("queued");
    expect(stored.lifecycle.attempts).toBe(0);

    const runs = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs).toHaveLength(0);
  });

  it("rejects a correctly signed queue webhook replayed outside the skew window and executes nothing", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    // A capture from an hour ago, and a mint-your-own-validity attempt an hour
    // ahead. Both carry a signature that is genuine for their own timestamp.
    for (const offsetSeconds of [-3600, 3600]) {
      const response = await route.POST(signedQueueRequest({
        body: fixture.body,
        timestamp: skewedTimestamp(offsetSeconds)
      }));
      const body = await response.json() as { code?: string };

      expect(response.status).toBe(401);
      expect(body.code).toBe("server_job_worker_timestamp_outside_window");
    }

    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("queued");
    expect(stored.lifecycle.attempts).toBe(0);

    const runs = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs).toHaveLength(0);
  });

  it("rejects an ill-formed queue webhook timestamp and executes nothing", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    // "0" and "NaN" are the values that silently pass a naive numeric freshness
    // check; the date-only form has no instant to compare against.
    for (const timestamp of ["not-a-timestamp", "0", "NaN", "2026-08-15", "2026-08-32T00:00:00.000Z"]) {
      const response = await route.POST(signedQueueRequest({ body: fixture.body, timestamp }));
      const body = await response.json() as { code?: string };

      expect(response.status).toBe(401);
      expect(body.code).toBe("server_job_worker_timestamp_invalid");
    }

    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("queued");
    expect(stored.lifecycle.attempts).toBe(0);

    const runs = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs).toHaveLength(0);
  });

  it("tolerates a sender clock running behind inside the skew window", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({
      body: fixture.body,
      timestamp: skewedTimestamp(-120)
    }));
    const body = await response.json() as { execution?: { status?: string } };

    expect(response.status).toBe(202);
    expect(body.execution?.status).toBe("succeeded");

    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("succeeded");
  });

  it("tolerates a sender clock running ahead inside the skew window", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({
      body: fixture.body,
      timestamp: skewedTimestamp(120)
    }));
    const body = await response.json() as { execution?: { status?: string } };

    expect(response.status).toBe(202);
    expect(body.execution?.status).toBe("succeeded");

    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("succeeded");
  });

  it("widens the freshness window only as far as SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS allows", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS = "1800";

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const stale = await route.POST(signedQueueRequest({
      body: fixture.body,
      timestamp: skewedTimestamp(-2400)
    }));
    expect(stale.status).toBe(401);
    expect(await stale.json()).toMatchObject({ code: "server_job_worker_timestamp_outside_window" });

    const accepted = await route.POST(signedQueueRequest({
      body: fixture.body,
      timestamp: skewedTimestamp(-1200)
    }));
    const body = await accepted.json() as { execution?: { status?: string } };

    expect(accepted.status).toBe(202);
    expect(body.execution?.status).toBe("succeeded");
  });

  it("stays receipt-only when inline execution is disabled", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    process.env.SENA_JOB_WORKER_INLINE_EXECUTION = "0";

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({ body: fixture.body }));
    const body = await response.json() as {
      execution?: { attempted?: boolean; status?: string };
    };

    expect(response.status).toBe(202);
    expect(body.execution?.attempted).toBe(false);
    expect(body.execution?.status).toBe("not-attempted");

    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("queued");
  });
});
