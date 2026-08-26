import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_SECRET",
  "SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS",
  "SENA_JOB_WORKER_INLINE_EXECUTION",
  "SENA_OPS_TOKEN"
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
  const workerPayloadSha256 = String((JSON.parse(input.body) as {
    job?: { payloadSha256?: unknown };
  }).job?.payloadSha256 ?? "");
  return new Request("https://sena.example.test/api/sena/ops/jobs/worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-webhook-event": "server_job.queue",
      "x-sena-webhook-timestamp": timestamp,
      "x-sena-job-payload-sha256": createHash("sha256").update(input.body).digest("hex"),
      "x-sena-worker-payload-sha256": workerPayloadSha256,
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
  const analysisCommand = await import("../analysis-queue-command");
  const teamProject = await import("../enterprise/team-project");

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
    commandCustody: analysisCommand.SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY,
    teamId,
    projectId: project.id,
    projectVersion: project.currentVersion,
    sourceTitle: project.title,
    includeRuntimeBundle: false,
    persist: true,
    updateProject: true,
    expectedVersion: project.currentVersion
  };
  const [commandEnvelopeUploadId] = importAnalysis.reserveEnterpriseUploadIds(1);
  const commandCustody = analysisCommand.planSenaAnalysisQueueCommandCustody({
    kind: "analysis" as const,
    teamId,
    projectId: project.id,
    actorUserId: registered.context.user.id,
    payload: workerPayload,
    payloadSummary: {
      source: "project" as const,
      projectVersion: project.currentVersion,
      expectedVersion: project.currentVersion,
      includeRuntimeBundle: false,
      persist: true,
      updateProject: true,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true as const
    }
  }, commandEnvelopeUploadId, queue.stableServerJobPayloadSha256(workerPayload));
  const job = await queue.enqueueEnterpriseServerJob({
    ...commandCustody.jobInput,
    beforeDispatch: async () => {
      await importAnalysis.createEnterpriseAnalysisCommandEnvelopeWithPostgresMirrorAsync(
        registered.context,
        { teamId, files: [commandCustody.file] }
      );
    }
  });
  const commandUpload = enterprise.readEnterpriseDb().uploads.find(
    (candidate: { id: string }) => candidate.id === commandEnvelopeUploadId
  );
  if (!commandUpload) throw new Error("command envelope upload fixture missing");

  const { delivery: _delivery, ...jobWithoutDelivery } = job;
  const body = JSON.stringify({
    schemaVersion: "sena-enterprise-server-job-queue-webhook/v2",
    generatedAt: "2026-08-15T00:00:00.000Z",
    job: jobWithoutDelivery,
    workerPayload,
    delivery: {
      provider: job.provider.mode,
      secretConfigured: true,
      workerPayloadSha256: job.payloadSha256
    },
    redaction: {
      responsePayloadValuesExcluded: true,
      auditPayloadValuesExcluded: true,
      secretValuesExcluded: true
    }
  });

  return {
    enterpriseDbDir,
    enterprise,
    queue,
    importAnalysis,
    teamProject,
    context: registered.context,
    teamId,
    project,
    job,
    body,
    commandUpload
  };
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

  it("rejects a signed managed analysis command whose durable envelope is corrupt before claim", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    writeFileSync(
      path.join(fixture.enterpriseDbDir, String(fixture.commandUpload.storagePath)),
      "corrupt-command-envelope"
    );

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({ body: fixture.body }));

    expect(response.status).toBe(202);
    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored).toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({ attempts: 0, retryable: false })
    }));
    expect(await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toHaveLength(0);
  });

  it("refuses to downgrade a current signed analysis command into the envelope-free legacy path", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const db = fixture.enterprise.readEnterpriseDb();
    const storedFixture = db.serverJobs.find(
      (candidate: { id: string }) => candidate.id === fixture.job.id
    );
    if (!storedFixture) throw new Error("server job downgrade fixture missing");
    delete storedFixture.payloadSummary.commandCustody;
    delete storedFixture.payloadSummary.commandEnvelopeUploadId;
    delete storedFixture.payloadSummary.commandEnvelopeSha256;
    fixture.enterprise.writeEnterpriseDb(db);

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({ body: fixture.body }));

    expect(response.status).toBe(202);
    expect(await fixture.queue.getEnterpriseServerJob(fixture.job.id)).toEqual(
      expect.objectContaining({
        status: "failed",
        lifecycle: expect.objectContaining({ attempts: 0, retryable: false })
      })
    );
    expect(await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toHaveLength(0);
  });

  it("rejects a signed managed queued update after a title-only state revision advances", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const concurrent = await fixture.enterprise.updateEnterpriseProjectAsync(
      fixture.context,
      fixture.project.id,
      {
        expectedVersion: fixture.project.currentVersion,
        title: "Concurrent managed title"
      }
    );
    expect(concurrent.currentVersion).toBe(fixture.project.currentVersion + 1);
    const retained = await fixture.teamProject.getEnterpriseProjectRevisionSourceReadOnlyAsync(
      fixture.context,
      fixture.project.id,
      fixture.project.currentVersion
    );
    expect(retained.sourceProject).toEqual(expect.objectContaining({
      currentVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      description: fixture.project.description
    }));

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({ body: fixture.body }));

    expect(response.status).toBe(202);
    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored).toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({
        attempts: 0,
        retryable: false,
        lastErrorCode: "project_version_conflict"
      })
    }));
    expect(await fixture.enterprise.getEnterpriseProjectAsync(
      fixture.context,
      fixture.project.id
    )).toEqual(expect.objectContaining({
      currentVersion: fixture.project.currentVersion + 1,
      title: "Concurrent managed title"
    }));

    const restored = await fixture.teamProject.restoreEnterpriseProjectRevisionAsync(
      fixture.context,
      fixture.project.id,
      {
        version: fixture.project.currentVersion,
        expectedVersion: concurrent.currentVersion
      }
    );
    expect(restored.project).toEqual(expect.objectContaining({
      currentVersion: concurrent.currentVersion + 1,
      title: fixture.project.title,
      description: fixture.project.description
    }));
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

  it("rejects a correctly signed body whose worker payload no longer matches the durable job hash", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const forged = JSON.parse(fixture.body) as {
      workerPayload: { title?: string };
    };
    forged.workerPayload.title = "tampered after enqueue";
    const forgedBody = JSON.stringify(forged);

    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const response = await route.POST(signedQueueRequest({ body: forgedBody }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: "server_job_worker_worker_payload_hash_invalid"
    });
    const stored = await fixture.queue.getEnterpriseServerJob(fixture.job.id);
    expect(stored.status).toBe("queued");
    expect(stored.lifecycle.attempts).toBe(0);
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

  it("stays receipt-only until an external claim re-admits current command custody", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    process.env.SENA_JOB_WORKER_INLINE_EXECUTION = "0";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

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

    const jobsRoute = await import("../../../app/api/sena/ops/jobs/route");
    const claim = await jobsRoute.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        authorization: "Bearer sena-test-ops-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "mark-running",
        jobId: fixture.job.id,
        workerRunId: "external_worker_valid_custody"
      })
    }));
    expect(claim.status).toBe(200);
    await expect(claim.json()).resolves.toEqual(expect.objectContaining({
      job: expect.objectContaining({
        status: "running",
        lifecycle: expect.objectContaining({ attempts: 1 })
      })
    }));
  });

  it("terminalizes a receipt-only external analysis claim when encrypted command custody is corrupt", async () => {
    const fixture = await queuedAnalysisJob();
    enterpriseDbDir = fixture.enterpriseDbDir;
    process.env.SENA_JOB_WORKER_INLINE_EXECUTION = "0";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";

    const workerRoute = await import("../../../app/api/sena/ops/jobs/worker/route");
    const receiptOnly = await workerRoute.POST(signedQueueRequest({ body: fixture.body }));
    expect(receiptOnly.status).toBe(202);
    expect(await receiptOnly.json()).toEqual(expect.objectContaining({
      execution: expect.objectContaining({ attempted: false, status: "not-attempted" })
    }));
    writeFileSync(
      path.join(fixture.enterpriseDbDir, String(fixture.commandUpload.storagePath)),
      "corrupt-command-envelope-before-external-claim"
    );

    const jobsRoute = await import("../../../app/api/sena/ops/jobs/route");
    const claim = await jobsRoute.POST(new Request("https://sena.example.test/api/sena/ops/jobs", {
      method: "POST",
      headers: {
        authorization: "Bearer sena-test-ops-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "mark-running",
        jobId: fixture.job.id,
        workerRunId: "external_worker_corrupt_custody"
      })
    }));
    expect(claim.status).toBe(409);
    await expect(claim.json()).resolves.toEqual(expect.objectContaining({
      code: "server_job_worker_analysis_command_custody_invalid"
    }));
    await expect(fixture.queue.getEnterpriseServerJob(fixture.job.id)).resolves.toEqual(
      expect.objectContaining({
        status: "failed",
        lifecycle: expect.objectContaining({
          attempts: 0,
          retryable: false,
          lastErrorCode: "server_job_worker_analysis_command_custody_invalid"
        })
      })
    );
    expect(await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toHaveLength(0);
  });
});

describe("server job webhook timestamp skew ceiling", () => {
  // The ceiling is the guard that stops an operator restoring exactly the
  // unbounded replay this control removed — 5c8d9ab's own commit message argues
  // it "matters as much as the default". The window's *widening* was pinned; its
  // *bound* was not, so setting the env to a year left the whole job family green.
  it("clamps SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS to the ceiling rather than honouring it", async () => {
    const queue = await import("../enterprise/server-job-queue");
    const previous = process.env.SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS;
    try {
      process.env.SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS = "31536000";
      expect(queue.serverJobWebhookTimestampSkewSeconds()).toBe(queue.serverJobWebhookTimestampMaxSkewSeconds);

      // A value inside the ceiling is still honoured, so the clamp is a bound and
      // not a constant — without this the assertion above would pass against a
      // function that ignored the env entirely.
      process.env.SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS = "1800";
      expect(queue.serverJobWebhookTimestampSkewSeconds()).toBe(1800);
    } finally {
      if (previous === undefined) delete process.env.SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS;
      else process.env.SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS = previous;
    }
  });
});
