import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_SECRET"
];

function configureManagedQueue(dbDir: string) {
  process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
  process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
  process.env.SENA_JOB_QUEUE_SECRET = "round26-queue-secret";
}

function configureLocalQueue(dbDir: string) {
  process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "local";
  process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
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

  it("keeps a durable source-preparation receipt invisible to the polling worker until the source is ready", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-source-claimability-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const worker = await import("../enterprise/server-job-worker-runtime");
    const sourcePersistenceEntered = deferred();
    const releaseSourcePersistence = deferred();

    const enqueue = queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      kind: "validation",
      payload: {
        action: "run-validation",
        teamId: "team_round26",
        projectId: "project_round26"
      },
      beforeDispatch: async () => {
        sourcePersistenceEntered.resolve();
        await releaseSourcePersistence.promise;
      }
    });

    await sourcePersistenceEntered.promise;
    const pending = await queue.listEnterpriseServerJobs({ status: "queued", limit: 10 });
    expect(pending.jobs).toHaveLength(1);
    expect(pending.jobs[0].delivery).toEqual(expect.objectContaining({
      webhookStatus: "pending",
      sourceReady: false
    }));

    const prematureDrain = await worker.drainEnterpriseServerJobQueue({ limit: 10 });
    expect(prematureDrain).toEqual(expect.objectContaining({
      scanned: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0
    }));

    releaseSourcePersistence.resolve();
    const job = await enqueue;
    expect(job.delivery).toEqual(expect.objectContaining({
      webhookStatus: "local-sink",
      sourceReady: true
    }));
    const readyDrain = await worker.drainEnterpriseServerJobQueue({ limit: 10 });
    expect(readyDrain.scanned).toBe(1);
    expect(readyDrain.skipped).toBe(1);
  });

  it("does not grant a file-store claim before source persistence reaches its durable ready transition", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-file-claimability-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const sourcePersistenceEntered = deferred();
    const releaseSourcePersistence = deferred();

    const enqueue = queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      beforeDispatch: async () => {
        sourcePersistenceEntered.resolve();
        await releaseSourcePersistence.promise;
      }
    });
    await sourcePersistenceEntered.promise;

    const prematureClaim = await queue.claimEnterpriseServerJob({
      jobId: (await queue.listEnterpriseServerJobs({ limit: 10 })).jobs[0].id,
      workerRunId: "round26-premature-file-worker"
    });
    releaseSourcePersistence.resolve();
    const job = await enqueue;
    const readyClaims = await Promise.all([
      queue.claimEnterpriseServerJob({ jobId: job.id, workerRunId: "round26-ready-file-left" }),
      queue.claimEnterpriseServerJob({ jobId: job.id, workerRunId: "round26-ready-file-right" })
    ]);

    expect(prematureClaim).toEqual(expect.objectContaining({
      claimed: false,
      reason: "server_job_worker_source_not_ready"
    }));
    expect(readyClaims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(readyClaims.filter((claim) => !claim.claimed)).toHaveLength(1);
  });

  it("rejects a status-callback mark-running transition while source persistence is still pending", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-status-claimability-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const sourcePersistenceEntered = deferred();
    const releaseSourcePersistence = deferred();

    const enqueue = queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      beforeDispatch: async () => {
        sourcePersistenceEntered.resolve();
        await releaseSourcePersistence.promise;
      }
    });
    await sourcePersistenceEntered.promise;
    const pendingJob = (await queue.listEnterpriseServerJobs({ limit: 10 })).jobs[0];
    let transitionError: unknown;
    try {
      await queue.updateEnterpriseServerJobStatus({
        jobId: pendingJob.id,
        action: "mark-running",
        workerRunId: "round26-premature-status-worker"
      });
    } catch (error) {
      transitionError = error;
    }
    releaseSourcePersistence.resolve();
    await enqueue;

    expect(transitionError).toEqual(expect.objectContaining({
      code: "server_job_worker_source_not_ready",
      status: 409
    }));
  });

  it("rejects terminal status callbacks until a ready job is owned by a running worker", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-status-machine-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const job = await queue.enqueueEnterpriseServerJob(queueInput());

    await expect(queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-succeeded",
      workerRunId: "round26-never-claimed"
    })).rejects.toMatchObject({
      code: "server_job_status_transition_not_allowed",
      status: 409
    });

    const running = await queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-running",
      workerRunId: "round26-owner-a"
    });
    expect(running.job.status).toBe("running");
    await expect(queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-failed",
      workerRunId: "round26-stale-owner-b",
      errorCode: "stale-worker"
    })).rejects.toMatchObject({
      code: "server_job_worker_run_mismatch",
      status: 409
    });

    const succeeded = await queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-succeeded",
      workerRunId: "round26-owner-a"
    });
    expect(succeeded.job.status).toBe("succeeded");
    const idempotent = await queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-succeeded",
      workerRunId: "round26-owner-a"
    });
    expect(idempotent.job).toEqual(succeeded.job);
    await expect(queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-running",
      workerRunId: "round26-owner-a"
    })).rejects.toMatchObject({
      code: "server_job_status_transition_not_allowed",
      status: 409
    });
  });

  it.each(["analysis", "validation"] as const)(
    "refuses queued %s inline sources even when the legacy inline flag is configured",
    async (kind) => {
      const dbDir = mkdtempSync(path.join(tmpdir(), `sena-round26-inline-${kind}-`));
      cleanupDirs.push(dbDir);
      configureManagedQueue(dbDir);
      process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
      const dispatch = vi.fn(async () => new Response("accepted", { status: 202 }));
      vi.stubGlobal("fetch", dispatch);
      const queue = await import("../enterprise/server-job-queue");

      expect(queue.serverJobQueueStatus()).toEqual(expect.objectContaining({
        inlinePayloadAllowed: false,
        evidence: expect.arrayContaining([
          "legacyInlinePayloadFlagConfigured=true",
          "inlinePayloadCustodyPolicy=durable-pointers-only"
        ])
      }));
      await expect(queue.enqueueEnterpriseServerJob({
        kind,
        teamId: "team_round26_inline",
        projectId: "project_round26_inline_summary_omission",
        actorUserId: "user_round26_inline",
        payload: {
          action: kind === "analysis" ? "run-analysis" : "run-validation",
          inlineDataset: { people: [] }
        },
        payloadSummary: {
          source: "dataset",
          hasInlineSnapshot: false,
          // The payload inspection must still reject a caller that lies in
          // its redacted summary about the presence of inline source data.
          hasInlineDataset: false,
          payloadValuesExcluded: true
        }
      })).rejects.toMatchObject({
        code: "server_job_inline_source_custody_required",
        status: 400
      });
      expect(dispatch).not.toHaveBeenCalled();
      await expect(queue.listEnterpriseServerJobs({ limit: 10 })).resolves.toEqual(
        expect.objectContaining({ summary: expect.objectContaining({ total: 0 }) })
      );
    }
  );

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
        sourceReady: false,
        failureStage: "source-persistence",
        errorCode: "server_job_source_persistence_failed"
      }),
      lifecycle: expect.objectContaining({ statusReason: "source-artifact-persistence-failed" })
    }));
    await expect(queue.updateEnterpriseServerJobStatus({
      jobId: stored.jobs[0].id,
      action: "retry",
      reason: "operator-review"
    })).rejects.toMatchObject({
      code: "server_job_source_repair_required",
      status: 409
    });
    await expect(queue.getEnterpriseServerJob(stored.jobs[0].id)).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        delivery: expect.objectContaining({ sourceReady: false })
      })
    );
  });

  it("projects legacy missing readiness without rewriting ambiguous receipts", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-legacy-readiness-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const state = await import("../enterprise/state");
    const delivered = await queue.enqueueEnterpriseServerJob(queueInput());
    const ambiguous = await queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      projectId: "project_round26_ambiguous",
      payload: { ...queueInput().payload, projectId: "project_round26_ambiguous" }
    });
    const corrupted = await queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      projectId: "project_round26_corrupted",
      payload: { ...queueInput().payload, projectId: "project_round26_corrupted" }
    });
    const db = state.readEnterpriseDb();
    const deliveredRaw = db.serverJobs.find((candidate) => candidate.id === delivered.id)!;
    const ambiguousRaw = db.serverJobs.find((candidate) => candidate.id === ambiguous.id)!;
    const corruptedRaw = db.serverJobs.find((candidate) => candidate.id === corrupted.id)!;
    delete (deliveredRaw.delivery as { sourceReady?: unknown }).sourceReady;
    ambiguousRaw.delivery = {
      attempted: false,
      webhookStatus: "pending"
    } as never;
    corruptedRaw.delivery = {
      ...corruptedRaw.delivery,
      sourceReady: "true"
    } as never;
    state.saveDb(db);

    await expect(queue.getEnterpriseServerJob(delivered.id)).resolves.toEqual(
      expect.objectContaining({ delivery: expect.objectContaining({ sourceReady: true }) })
    );
    const afterRead = state.readEnterpriseDb();
    expect(Object.hasOwn(
      afterRead.serverJobs.find((candidate) => candidate.id === delivered.id)!.delivery,
      "sourceReady"
    )).toBe(false);
    await expect(queue.claimEnterpriseServerJob({
      jobId: delivered.id,
      workerRunId: "round26-legacy-delivered"
    })).resolves.toEqual(expect.objectContaining({ claimed: true }));
    for (const jobId of [ambiguous.id, corrupted.id]) {
      await expect(queue.getEnterpriseServerJob(jobId)).resolves.toEqual(
        expect.objectContaining({ delivery: expect.objectContaining({ sourceReady: false }) })
      );
      await expect(queue.claimEnterpriseServerJob({
        jobId,
        workerRunId: `round26-legacy-blocked-${jobId}`
      })).resolves.toEqual(expect.objectContaining({
        claimed: false,
        reason: "server_job_worker_source_not_ready"
      }));
    }
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
