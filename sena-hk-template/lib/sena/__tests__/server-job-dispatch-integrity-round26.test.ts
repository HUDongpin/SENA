import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_SECRET"
];

function configureManagedQueue(dbDir: string) {
  process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
  process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
  process.env.SENA_JOB_QUEUE_SECRET = "round26-queue-secret";
}

function queueInput() {
  return {
    kind: "analysis" as const,
    teamId: "team_round26",
    projectId: "project_round26",
    actorUserId: "user_round26",
    payload: {
      action: "run-analysis",
      teamId: "team_round26",
      projectId: "project_round26",
      projectVersion: 7,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    },
    payloadSummary: {
      source: "project" as const,
      projectVersion: 7,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true as const
    }
  };
}

describe("SENA server-job dispatch integrity round 26", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    vi.unstubAllGlobals();
    vi.resetModules();
    while (cleanupDirs.length > 0) {
      rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("persists the job before dispatch and distinguishes transport from worker-payload hashes", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-dispatch-"));
    cleanupDirs.push(dbDir);
    configureManagedQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    let durableDuringDispatch: Awaited<ReturnType<typeof queue.listEnterpriseServerJobs>> | undefined;
    let outboundBody = "";
    let outboundHeaders: Record<string, string> = {};
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      durableDuringDispatch = await queue.listEnterpriseServerJobs({ limit: 10 });
      outboundBody = String(init?.body ?? "");
      outboundHeaders = init?.headers as Record<string, string>;
      return new Response("accepted", { status: 202 });
    }));

    const job = await queue.enqueueEnterpriseServerJob(queueInput());
    const webhook = JSON.parse(outboundBody) as {
      job?: { id?: string; payloadSha256?: string };
      delivery?: { payloadSha256?: string; workerPayloadSha256?: string };
    };
    const transportPayloadSha256 = createHash("sha256").update(outboundBody).digest("hex");

    expect(durableDuringDispatch?.summary.total).toBe(1);
    expect(durableDuringDispatch?.jobs[0]).toEqual(expect.objectContaining({
      id: job.id,
      status: "queued",
      delivery: expect.objectContaining({ attempted: false, webhookStatus: "pending" })
    }));
    expect(outboundHeaders["x-sena-job-payload-sha256"]).toBe(transportPayloadSha256);
    expect(outboundHeaders["x-sena-worker-payload-sha256"]).toBe(job.payloadSha256);
    expect(transportPayloadSha256).not.toBe(job.payloadSha256);
    expect(webhook.job?.payloadSha256).toBe(job.payloadSha256);
    expect(webhook.delivery?.workerPayloadSha256).toBe(job.payloadSha256);
    expect(webhook.delivery?.payloadSha256).toBeUndefined();
    expect(job.delivery.webhookStatus).toBe("delivered");
  });

  it("retains a durable failed-dispatch receipt when the queue rejects delivery", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-dispatch-failure-"));
    cleanupDirs.push(dbDir);
    configureManagedQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    let durableCountDuringDispatch = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      durableCountDuringDispatch = (await queue.listEnterpriseServerJobs({ limit: 10 })).summary.total;
      return new Response("unavailable", { status: 503 });
    }));

    await expect(queue.enqueueEnterpriseServerJob(queueInput())).rejects.toMatchObject({
      code: "server_job_queue_dispatch_failed"
    });

    expect(durableCountDuringDispatch).toBe(1);
    const stored = await queue.listEnterpriseServerJobs({ limit: 10 });
    expect(stored.summary).toEqual(expect.objectContaining({ total: 1, failed: 1, retryable: 1 }));
    expect(stored.jobs[0]).toEqual(expect.objectContaining({
      status: "failed",
      delivery: expect.objectContaining({ attempted: true, webhookStatus: "failed", httpStatus: 503 }),
      lifecycle: expect.objectContaining({
        retryable: true,
        lastErrorCode: "http_503",
        statusReason: "queue-dispatch-failed"
      })
    }));
  });

  it("runs source persistence only after the job is durable and never dispatches when it fails", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-source-failure-"));
    cleanupDirs.push(dbDir);
    configureManagedQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    let durableCountDuringSourcePersistence = 0;
    const dispatch = vi.fn(async () => new Response("accepted", { status: 202 }));
    vi.stubGlobal("fetch", dispatch);

    await expect(queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      beforeDispatch: async () => {
        durableCountDuringSourcePersistence = (await queue.listEnterpriseServerJobs({ limit: 10 })).summary.total;
        throw new Error("simulated source registry failure");
      }
    })).rejects.toMatchObject({ code: "server_job_source_persistence_failed" });

    expect(durableCountDuringSourcePersistence).toBe(1);
    expect(dispatch).not.toHaveBeenCalled();
    const stored = await queue.listEnterpriseServerJobs({ limit: 10 });
    expect(stored.summary).toEqual(expect.objectContaining({ total: 1, failed: 1, retryable: 1 }));
    expect(stored.jobs[0]).toEqual(expect.objectContaining({
      delivery: expect.objectContaining({
        attempted: false,
        webhookStatus: "failed",
        failureStage: "source-persistence",
        errorCode: "server_job_source_persistence_failed"
      }),
      lifecycle: expect.objectContaining({ statusReason: "source-artifact-persistence-failed" })
    }));
  });

  it("does not overwrite a worker transition that completes before dispatch returns", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-dispatch-race-"));
    cleanupDirs.push(dbDir);
    configureManagedQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    vi.stubGlobal("fetch", vi.fn(async () => {
      const stored = await queue.listEnterpriseServerJobs({ limit: 10 });
      const jobId = stored.jobs[0]?.id;
      expect(jobId).toBeTruthy();
      await queue.updateEnterpriseServerJobStatus({
        jobId,
        action: "mark-running",
        workerRunId: "round26-worker"
      });
      await queue.updateEnterpriseServerJobStatus({
        jobId,
        action: "mark-succeeded",
        workerRunId: "round26-worker"
      });
      return new Response("accepted", { status: 202 });
    }));

    const job = await queue.enqueueEnterpriseServerJob(queueInput());
    const stored = await queue.getEnterpriseServerJob(job.id);

    expect(job.status).toBe("succeeded");
    expect(stored.status).toBe("succeeded");
    expect(stored.lifecycle).toEqual(expect.objectContaining({
      attempts: 1,
      retryable: false,
      lastTransition: "mark-succeeded",
      workerRunId: "round26-worker"
    }));
    expect(stored.delivery.webhookStatus).toBe("delivered");
  });
});
