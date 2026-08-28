import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD",
  "SENA_JOB_QUEUE_MAX_ATTEMPTS",
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

  it("reuses one deterministic server job across node replay and rejects evidence drift", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-deterministic-job-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const jobId = `server_job_${"a".repeat(24)}`;
    let sourceWrites = 0;
    const input = {
      ...queueInput(),
      jobId,
      beforeDispatch: async () => {
        sourceWrites += 1;
      }
    };

    const first = await queue.enqueueEnterpriseServerJob(input);
    const replayed = await queue.enqueueEnterpriseServerJob(input);
    const listed = await queue.listEnterpriseServerJobs({ limit: 10 });
    expect(first.id).toBe(jobId);
    expect(replayed).toEqual(first);
    expect(sourceWrites).toBe(1);
    expect(listed.summary.total).toBe(1);

    await expect(queue.enqueueEnterpriseServerJob({
      ...input,
      payload: { ...input.payload, projectVersion: 8 },
      payloadSummary: { ...input.payloadSummary, projectVersion: 8 }
    })).rejects.toMatchObject({ status: 409, code: "server_job_idempotency_conflict" });
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

  it("keeps a legacy validation receipt nonclaimable when encrypted command custody is absent", async () => {
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
      payloadSummary: {
        ...queueInput().payloadSummary,
        projectTeamId: "team_round26"
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
    expect(readyDrain.scanned).toBe(0);
    expect(readyDrain.failed).toBe(0);
    expect(readyDrain.skipped).toBe(0);
    expect(readyDrain.outcomes).toEqual([]);
    await expect(queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
      status: "queued",
      lifecycle: expect.objectContaining({ attempts: 0 })
    }));
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

  it("requires an exact validation project-team binding before file-store claimability", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-validation-team-binding-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const validationInput = (suffix: string, projectTeamId?: string) => ({
      ...queueInput(),
      kind: "validation" as const,
      projectId: `project_round26_validation_${suffix}`,
      payload: {
        action: "run-validation",
        teamId: "team_round26",
        projectId: `project_round26_validation_${suffix}`
      },
      payloadSummary: {
        ...queueInput().payloadSummary,
        projectTeamId,
        commandCustody: "encrypted-upload-v1" as const,
        commandEnvelopeUploadId: `upload_${(suffix === "matching" ? "a" : suffix === "missing" ? "b" : "c").repeat(24)}`,
        commandEnvelopeSha256: "a".repeat(64)
      }
    });
    const matching = await queue.enqueueEnterpriseServerJob(
      validationInput("matching", "team_round26")
    );
    const missing = await queue.enqueueEnterpriseServerJob(validationInput("missing"));
    const mismatched = await queue.enqueueEnterpriseServerJob(
      validationInput("mismatched", "team_other")
    );

    const claimable = await queue.listEnterpriseServerJobs({
      status: "queued",
      claimableOnly: true,
      limit: 10
    });
    expect(claimable.jobs.map((job) => job.id)).toContain(matching.id);
    expect(claimable.jobs.map((job) => job.id)).not.toContain(missing.id);
    expect(claimable.jobs.map((job) => job.id)).not.toContain(mismatched.id);
    for (const blocked of [missing, mismatched]) {
      await expect(queue.getEnterpriseServerJob(blocked.id)).resolves.toEqual(expect.objectContaining({
        delivery: expect.objectContaining({ sourceReady: false })
      }));
      await expect(queue.claimEnterpriseServerJob({
        jobId: blocked.id,
        workerRunId: `worker_run_round26_${blocked.id}`
      })).resolves.toEqual(expect.objectContaining({
        claimed: false,
        reason: "server_job_worker_source_not_ready"
      }));
    }
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
    expect(stored.summary).toEqual(expect.objectContaining({ total: 1, failed: 1, retryable: 0 }));
    expect(stored.jobs[0]).toEqual(expect.objectContaining({
      status: "failed",
      delivery: expect.objectContaining({ attempted: true, webhookStatus: "failed", httpStatus: 503 }),
      lifecycle: expect.objectContaining({
        retryable: false,
        lastErrorCode: "http_503",
        statusReason: "queue-dispatch-failed"
      })
    }));
    await expect(queue.updateEnterpriseServerJobStatus({
      jobId: stored.jobs[0].id,
      action: "retry",
      reason: "operator-review"
    })).rejects.toMatchObject({
      code: "server_job_resubmission_required",
      status: 409
    });
  });

  it("redispatches the same deterministic job after a queue-dispatch failure instead of returning a false 202 replay", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-dispatch-replay-"));
    cleanupDirs.push(dbDir);
    configureManagedQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const jobId = `server_job_${"f".repeat(24)}`;
    let sourceWrites = 0;
    let dispatches = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      dispatches += 1;
      return new Response(dispatches === 1 ? "unavailable" : "accepted", {
        status: dispatches === 1 ? 503 : 202
      });
    }));
    const input = {
      ...queueInput(),
      jobId,
      beforeDispatch: async () => { sourceWrites += 1; }
    };

    await expect(queue.enqueueEnterpriseServerJob(input)).rejects.toMatchObject({
      code: "server_job_queue_dispatch_failed"
    });
    const replayed = await queue.enqueueEnterpriseServerJob(input);

    expect(replayed).toEqual(expect.objectContaining({
      id: jobId,
      status: "queued",
      delivery: expect.objectContaining({ webhookStatus: "delivered", httpStatus: 202 })
    }));
    expect(dispatches).toBe(2);
    expect(sourceWrites).toBe(1);
  });

  it("keeps a first managed worker failure non-retryable without falsely dead-lettering it", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-managed-first-failure-"));
    cleanupDirs.push(dbDir);
    configureManagedQueue(dbDir);
    process.env.SENA_JOB_QUEUE_MAX_ATTEMPTS = "3";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("accepted", { status: 202 })));
    const queue = await import("../enterprise/server-job-queue");
    const job = await queue.enqueueEnterpriseServerJob(queueInput());

    await queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-running",
      workerRunId: "round26-managed-first-owner"
    });
    const failed = await queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-failed",
      workerRunId: "round26-managed-first-owner",
      errorCode: "managed-first-failure"
    });

    expect(failed.job.status).toBe("failed");
    expect(failed.job.lifecycle).toEqual(expect.objectContaining({
      attempts: 1,
      maxAttempts: 3,
      retryable: false,
      lastErrorCode: "managed-first-failure"
    }));
    expect(failed.job.lifecycle.deadLetteredAt).toBeUndefined();
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
    expect(stored.summary).toEqual(expect.objectContaining({ total: 1, failed: 1, retryable: 0 }));
    expect(stored.jobs[0]).toEqual(expect.objectContaining({
      delivery: expect.objectContaining({
        attempted: false,
        webhookStatus: "failed",
        sourceReady: false,
        failureStage: "source-persistence",
        errorCode: "server_job_source_persistence_failed"
      }),
      lifecycle: expect.objectContaining({
        retryable: false,
        statusReason: "source-artifact-persistence-failed"
      })
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

  it("allows only the exact synthetic heartbeat profile through file-store status CAS", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-file-heartbeat-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const worker = await import("../enterprise/server-job-worker-runtime");
    const state = await import("../enterprise/state");
    const created = await queue.enqueueEnterpriseServerJob(queueInput());
    const db = state.readEnterpriseDb();
    const raw = db.serverJobs.find((candidate) => candidate.id === created.id)!;
    raw.id = `server_job_worker_heartbeat_${"a".repeat(24)}`;
    raw.teamId = "ops-heartbeat";
    raw.projectId = "worker-heartbeat";
    raw.actorUserId = "ops-heartbeat";
    raw.payloadSummary = {
      source: "project",
      projectVersion: 1,
      commandCustody: "synthetic-heartbeat-v1",
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    };
    raw.delivery = {
      ...raw.delivery,
      sourceReady: true,
      webhookStatus: "delivered"
    };
    raw.worker = {
      expectedAction: "run-analysis",
      payloadDelivery: "project-pointer",
      execution: "external-worker-required",
      statusCallback: "/api/sena/ops/jobs"
    };
    state.saveDb(db);

    const pollingRace = await worker.drainEnterpriseServerJobQueue({
      kind: "analysis",
      limit: 10
    });
    expect(pollingRace).toEqual(expect.objectContaining({
      scanned: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      outcomes: []
    }));
    await expect(queue.getEnterpriseServerJob(raw.id)).resolves.toEqual(expect.objectContaining({
      status: "queued",
      lifecycle: expect.objectContaining({ attempts: 0 })
    }));

    const running = await queue.updateEnterpriseServerJobStatus({
      jobId: raw.id,
      action: "mark-running",
      workerRunId: "worker_run_round26_heartbeat"
    });
    const succeeded = await queue.updateEnterpriseServerJobStatus({
      jobId: raw.id,
      action: "mark-succeeded",
      workerRunId: "worker_run_round26_heartbeat"
    });

    expect(running.job).toEqual(expect.objectContaining({
      status: "running",
      lifecycle: expect.objectContaining({ attempts: 1 })
    }));
    expect(succeeded.job).toEqual(expect.objectContaining({
      status: "succeeded",
      lifecycle: expect.objectContaining({ attempts: 1, retryable: false })
    }));
  });

  it("does not allow normal analysis enqueue to select the synthetic heartbeat profile", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-heartbeat-profile-admission-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");

    await expect(queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      payload: {
        ...queueInput().payload,
        commandCustody: "synthetic-heartbeat-v1"
      },
      payloadSummary: {
        ...queueInput().payloadSummary,
        commandCustody: "synthetic-heartbeat-v1"
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "server_job_analysis_command_custody_invalid"
    });
    await expect(queue.listEnterpriseServerJobs({ limit: 10 })).resolves.toEqual(
      expect.objectContaining({ jobs: [] })
    );
  });

  it("terminalizes raw unmarked and partially stripped analysis receipts before local claim", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-file-custody-quarantine-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const worker = await import("../enterprise/server-job-worker-runtime");
    const state = await import("../enterprise/state");
    const unmarked = await queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      projectId: "project_round26_unmarked",
      payload: { ...queueInput().payload, projectId: "project_round26_unmarked" }
    });
    const strippedCurrent = await queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      projectId: "project_round26_stripped_current",
      payload: { ...queueInput().payload, projectId: "project_round26_stripped_current" }
    });
    const db = state.readEnterpriseDb();
    const unmarkedRaw = db.serverJobs.find((candidate) => candidate.id === unmarked.id)!;
    const strippedRaw = db.serverJobs.find((candidate) => candidate.id === strippedCurrent.id)!;
    delete unmarkedRaw.payloadSummary.commandCustody;
    strippedRaw.payloadSummary.commandCustody = "encrypted-upload-v1";
    delete strippedRaw.payloadSummary.commandEnvelopeUploadId;
    delete strippedRaw.payloadSummary.commandEnvelopeSha256;
    state.saveDb(db);

    const report = await worker.drainEnterpriseServerJobQueue({ kind: "analysis", limit: 10 });

    expect(report).toEqual(expect.objectContaining({ scanned: 2, failed: 2, succeeded: 0 }));
    expect(report.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: unmarked.id, status: "failed", attempts: 0 }),
      expect.objectContaining({ jobId: strippedCurrent.id, status: "failed", attempts: 0 })
    ]));
    for (const jobId of [unmarked.id, strippedCurrent.id]) {
      await expect(queue.getEnterpriseServerJob(jobId)).resolves.toEqual(expect.objectContaining({
        status: "failed",
        lifecycle: expect.objectContaining({
          attempts: 0,
          retryable: false,
          lastErrorCode: "server_job_worker_analysis_command_custody_invalid"
        })
      }));
    }
  });

  it("reserves polling capacity for valid jobs when invalid custody receipts fill the quarantine", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-quarantine-fairness-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const worker = await import("../enterprise/server-job-worker-runtime");
    const state = await import("../enterprise/state");
    const valid = await queue.enqueueEnterpriseServerJob({
      ...queueInput(),
      projectId: "project_round26_fair_valid",
      payload: { ...queueInput().payload, projectId: "project_round26_fair_valid" }
    });
    const invalid = [];
    for (let index = 0; index < 3; index += 1) {
      const projectId = `project_round26_fair_invalid_${index}`;
      invalid.push(await queue.enqueueEnterpriseServerJob({
        ...queueInput(),
        projectId,
        payload: { ...queueInput().payload, projectId }
      }));
    }
    const db = state.readEnterpriseDb();
    for (const job of invalid) {
      const raw = db.serverJobs.find((candidate) => candidate.id === job.id)!;
      delete raw.payloadSummary.commandCustody;
    }
    state.saveDb(db);

    const report = await worker.drainEnterpriseServerJobQueue({ kind: "analysis", limit: 2 });

    expect(report.scanned).toBe(2);
    expect(report.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        jobId: valid.id,
        status: "failed",
        errorCode: "server_job_worker_payload_not_reproducible",
        attempts: 0
      }),
      expect.objectContaining({
        status: "failed",
        errorCode: "server_job_worker_analysis_command_custody_invalid",
        attempts: 0
      })
    ]));
    expect(report.outcomes.filter((outcome) => (
      outcome.errorCode === "server_job_worker_analysis_command_custody_invalid"
    ))).toHaveLength(1);
  });

  it.each([1, 2])(
    "does not let %i newer nonclaimable legacy validation receipts consume executable capacity",
    async (limit) => {
      const dbDir = mkdtempSync(path.join(tmpdir(), `sena-round26-mixed-kind-fairness-${limit}-`));
      cleanupDirs.push(dbDir);
      configureLocalQueue(dbDir);
      const queue = await import("../enterprise/server-job-queue");
      const worker = await import("../enterprise/server-job-worker-runtime");
      const state = await import("../enterprise/state");
      const executable = await queue.enqueueEnterpriseServerJob({
        ...queueInput(),
        projectId: "project_round26_mixed_kind_executable",
        payload: {
          ...queueInput().payload,
          projectId: "project_round26_mixed_kind_executable"
        }
      });
      const unsupported = [];
      for (let index = 0; index < limit; index += 1) {
        const projectId = `project_round26_mixed_kind_validation_${index}`;
        unsupported.push(await queue.enqueueEnterpriseServerJob({
          kind: "validation",
          teamId: "team_round26_validation_backlog",
          projectId,
          actorUserId: "user_round26_validation_backlog",
          payload: {
            action: "run-validation",
            teamId: "team_round26_validation_backlog",
            projectId
          },
          payloadSummary: {
            source: "project",
            projectVersion: 1,
            projectTeamId: "team_round26_validation_backlog",
            hasInlineSnapshot: false,
            hasInlineDataset: false,
            payloadValuesExcluded: true
          }
        }));
      }
      const db = state.readEnterpriseDb();
      db.serverJobs.find((candidate) => candidate.id === executable.id)!.updatedAt =
        "2026-08-26T00:00:00.000Z";
      unsupported.forEach((job, index) => {
        db.serverJobs.find((candidate) => candidate.id === job.id)!.updatedAt =
          `2026-08-26T00:00:${String(index + 1).padStart(2, "0")}.000Z`;
      });
      state.saveDb(db);

      const first = await worker.drainEnterpriseServerJobQueue({ limit });
      const second = await worker.drainEnterpriseServerJobQueue({ limit });

      expect(first.outcomes[0]).toEqual(expect.objectContaining({
        jobId: executable.id,
        status: "failed",
        errorCode: "server_job_worker_payload_not_reproducible",
        attempts: 0
      }));
      expect(second.outcomes).toEqual([]);
      for (const job of unsupported) {
        await expect(queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
          status: "queued",
          delivery: expect.objectContaining({ sourceReady: false }),
          lifecycle: expect.objectContaining({ attempts: 0 })
        }));
      }
      await expect(queue.getEnterpriseServerJob(executable.id)).resolves.toEqual(
        expect.objectContaining({ status: "failed" })
      );
    }
  );

  it("documents that irreproducible pull-worker commands are terminalized before claim", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/run-sena-job-worker.ts"), "utf8");

    expect(source).toContain("atomically terminalized before claim");
    expect(source).toContain("attempts unchanged");
    expect(source).not.toContain("reported and left queued");
  });

  it("documents preclaim rejection as preserving rather than resetting prior attempts", () => {
    const sources = [
      "README.md",
      "lib/sena/api-evidence-notes.ts",
      "lib/sena/enterprise/server-job-queue.ts",
      "lib/sena/enterprise/server-job-worker-runtime.ts"
    ].map((file) => readFileSync(path.join(process.cwd(), file), "utf8"));

    for (const source of sources) {
      const normalized = source.replace(/\n\s*\*\s?/g, " ").replace(/\s+/g, " ");
      expect(normalized).toContain("without incrementing attempts; the existing attempt count is preserved");
    }
  });

  it("quarantines project pointers whose immutable projectVersion is not a positive safe integer", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-project-version-custody-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const state = await import("../enterprise/state");
    const variants: Array<[string, unknown]> = [
      ["missing", undefined],
      ["string", "7"],
      ["fraction", 7.5],
      ["zero", 0],
      ["unsafe", Number.MAX_SAFE_INTEGER + 1]
    ];
    const jobs: Array<Awaited<ReturnType<typeof queue.enqueueEnterpriseServerJob>>> = [];
    for (const [suffix] of variants) {
      const projectId = `project_round26_version_${suffix}`;
      jobs.push(await queue.enqueueEnterpriseServerJob({
        ...queueInput(),
        projectId,
        payload: {
          ...queueInput().payload,
          projectId
        }
      }));
    }
    const db = state.readEnterpriseDb();
    for (const [index, [, projectVersion]] of variants.entries()) {
      const stored = db.serverJobs.find((candidate) => candidate.id === jobs[index].id)!;
      if (projectVersion === undefined) {
        delete (stored.payloadSummary as { projectVersion?: unknown }).projectVersion;
      } else {
        (stored.payloadSummary as { projectVersion?: unknown }).projectVersion = projectVersion;
      }
    }
    state.saveDb(db);

    const claimable = await queue.listEnterpriseServerJobs({ claimableOnly: true, limit: 100 });
    expect(claimable.jobs.map((candidate) => candidate.id)).not.toEqual(
      expect.arrayContaining(jobs.map((candidate) => candidate.id))
    );
    for (const job of jobs) {
      await expect(queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
        status: "queued",
        delivery: expect.objectContaining({ sourceReady: false }),
        lifecycle: expect.objectContaining({ attempts: 0 })
      }));
      await expect(queue.claimEnterpriseServerJob({
        jobId: job.id,
        workerRunId: `round26-invalid-version-${job.id}`
      })).resolves.toEqual(expect.objectContaining({
        claimed: false,
        reason: "server_job_worker_source_not_ready"
      }));
    }
  });

  it("quarantines retained inline jobs even when legacy delivery evidence or a stored true bit says ready", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-legacy-inline-quarantine-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const state = await import("../enterprise/state");
    const variants = [];
    for (const projectId of [
      "project_inline_stored_true",
      "project_inline_delivered",
      "project_inline_local_sink",
      "project_inline_failed_dispatch"
    ]) {
      variants.push(await queue.enqueueEnterpriseServerJob({ ...queueInput(), projectId }));
    }
    const db = state.readEnterpriseDb();
    const deliveryVariants = [
      { attempted: true, webhookStatus: "delivered", sourceReady: true },
      { attempted: true, webhookStatus: "delivered" },
      { attempted: true, webhookStatus: "local-sink" },
      { attempted: true, webhookStatus: "failed", failureStage: "queue-dispatch" }
    ];
    for (const [index, created] of variants.entries()) {
      const raw = db.serverJobs.find((candidate) => candidate.id === created.id)!;
      raw.kind = "reliability";
      raw.payloadSummary = {
        ...raw.payloadSummary,
        source: "dataset",
        uploadIds: [],
        hasInlineDataset: true
      };
      raw.worker = {
        ...raw.worker,
        expectedAction: "run-reliability",
        payloadDelivery: "inline-payload-enabled"
      };
      raw.delivery = deliveryVariants[index] as never;
    }
    state.saveDb(db);

    const claimable = await queue.listEnterpriseServerJobs({ claimableOnly: true, limit: 100 });
    expect(claimable.jobs.map((candidate) => candidate.id)).not.toEqual(
      expect.arrayContaining(variants.map((candidate) => candidate.id))
    );
    for (const candidate of variants) {
      await expect(queue.getEnterpriseServerJob(candidate.id)).resolves.toEqual(
        expect.objectContaining({ delivery: expect.objectContaining({ sourceReady: false }) })
      );
      await expect(queue.claimEnterpriseServerJob({
        jobId: candidate.id,
        workerRunId: `round26-inline-quarantine-${candidate.id}`
      })).resolves.toEqual(expect.objectContaining({
        claimed: false,
        reason: "server_job_worker_source_not_ready"
      }));
    }
  });

  it("requires a nonblank worker owner before either file-store claim can mutate the job", async () => {
    const dbDir = mkdtempSync(path.join(tmpdir(), "sena-round26-worker-owner-"));
    cleanupDirs.push(dbDir);
    configureLocalQueue(dbDir);
    const queue = await import("../enterprise/server-job-queue");
    const job = await queue.enqueueEnterpriseServerJob(queueInput());

    for (const workerRunId of ["", "   "]) {
      await expect(queue.claimEnterpriseServerJob({ jobId: job.id, workerRunId })).rejects.toMatchObject({
        code: "server_job_worker_run_id_required",
        status: 400
      });
      await expect(queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
        status: "queued",
        lifecycle: expect.objectContaining({ attempts: 0 })
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
