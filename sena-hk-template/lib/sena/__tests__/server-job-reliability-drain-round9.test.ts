import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD"
];

const annotations = [
  { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
  { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
  { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
  { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
];

const csv = [
  "coder_id,item_id,code_id,value",
  "c1,u1,Evidence,1",
  "c2,u1,Evidence,1",
  "c1,u2,Evidence,1",
  "c2,u2,Evidence,0"
].join("\n");

function projectSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  return buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "Round 9 reliability queue source",
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: imported.dataset
  });
}

async function localRouteFixture() {
  const dbDir = mkdtempSync(path.join(tmpdir(), "sena-reliability-drain-round9-"));
  process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "local";
  process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
  process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
  let sessionToken = "";
  vi.resetModules();
  vi.doMock("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
  vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
  vi.doMock("@/lib/sena/import", async () => await import("../import"));

  const enterprise = await import("../enterprise");
  const registered = enterprise.registerEnterpriseUser({
    name: "Round 9 Reliability Worker",
    email: `round9-reliability-${crypto.randomUUID()}@example.edu`,
    password: "sena-secure-123",
    organization: "Round 9 Reliability Lab",
    plan: "lab"
  });
  sessionToken = registered.token;
  const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
    teamId: registered.context.teams[0].id,
    title: "Round 9 Reliability Project",
    snapshot: projectSnapshot()
  });
  return {
    dbDir,
    enterprise,
    registered,
    project,
    csrf: enterprise.createEnterpriseCsrfToken(registered.context),
    route: await import("../../../app/api/sena/reliability/route"),
    runtime: await import("../enterprise/server-job-worker-runtime"),
    queue: await import("../enterprise/server-job-queue"),
    reliabilityRuns: await import("../enterprise/reliability-runs")
  };
}

describe("Round 9 local reliability queue execution", () => {
  let dbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (dbDir) rmSync(dbDir, { recursive: true, force: true });
    dbDir = undefined;
    vi.resetModules();
  });

  it("drains a JSON annotation request enqueued by the public route to succeeded", async () => {
    const fixture = await localRouteFixture();
    dbDir = fixture.dbDir;
    const response = await fixture.route.POST(new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": fixture.csrf.token,
        prefer: "respond-async"
      },
      body: JSON.stringify({
        teamId: fixture.project.teamId,
        projectId: fixture.project.id,
        reviewer: fixture.registered.context.user.name,
        sourceName: "round9-reliability.json",
        annotations
      })
    }));
    const job = await response.json() as { id: string; payloadSummary?: { uploadIds?: string[] } };

    expect(response.status).toBe(202);
    expect(job.payloadSummary?.uploadIds).toHaveLength(1);
    const report = await fixture.runtime.drainEnterpriseServerJobQueue({ limit: 10 });
    expect(report.outcomes.find((outcome) => outcome.jobId === job.id)).toMatchObject({ status: "succeeded" });
    expect((await fixture.queue.getEnterpriseServerJob(job.id)).status).toBe("succeeded");
    expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.registered.context, {
      teamId: fixture.project.teamId,
      projectId: fixture.project.id
    })).toHaveLength(1);
  });

  it("drains a multipart upload request enqueued by the public route to succeeded", async () => {
    const fixture = await localRouteFixture();
    dbDir = fixture.dbDir;
    const form = new FormData();
    form.set("teamId", fixture.project.teamId);
    form.set("projectId", fixture.project.id);
    form.set("reviewer", fixture.registered.context.user.name);
    form.set("queue", "true");
    form.append("files", new File([csv], "round9-reliability.csv", { type: "text/csv" }));
    const response = await fixture.route.POST(new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: { "x-sena-csrf-token": fixture.csrf.token },
      body: form
    }));
    const job = await response.json() as { id: string };

    expect(response.status).toBe(202);
    const report = await fixture.runtime.drainEnterpriseServerJobQueue({ limit: 10 });
    expect(report.outcomes.find((outcome) => outcome.jobId === job.id)).toMatchObject({ status: "succeeded" });
    expect((await fixture.queue.getEnterpriseServerJob(job.id)).status).toBe("succeeded");
  });

  it("lands a route-enqueued reliability job failed when its project binding becomes stale", async () => {
    const fixture = await localRouteFixture();
    dbDir = fixture.dbDir;
    const response = await fixture.route.POST(new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": fixture.csrf.token,
        prefer: "respond-async"
      },
      body: JSON.stringify({
        teamId: fixture.project.teamId,
        projectId: fixture.project.id,
        annotations
      })
    }));
    const job = await response.json() as { id: string };
    await fixture.enterprise.updateEnterpriseProjectAsync(fixture.registered.context, fixture.project.id, {
      expectedVersion: fixture.project.currentVersion,
      snapshot: structuredClone(fixture.project.snapshot)
    });

    const report = await fixture.runtime.drainEnterpriseServerJobQueue({ limit: 10 });
    expect(report.outcomes.find((outcome) => outcome.jobId === job.id)).toMatchObject({
      status: "failed",
      errorCode: "server_job_worker_reliability_project_binding_changed"
    });
    expect((await fixture.queue.getEnterpriseServerJob(job.id)).status).toBe("failed");
  });

  it("rejects a local inline reliability payload without durable custody before creating a queued receipt", async () => {
    const fixture = await localRouteFixture();
    dbDir = fixture.dbDir;
    const reliability = await import("../reliability");
    await expect(fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.project.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.registered.context.user.id,
      payload: {
        action: "run-reliability",
        teamId: fixture.project.teamId,
        projectId: fixture.project.id,
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
        uploadIds: [],
        inlineAnnotations: annotations
      },
      payloadSummary: {
        source: "dataset",
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
        annotationCount: annotations.length,
        hasInlineSnapshot: false,
        hasInlineDataset: true,
        payloadValuesExcluded: true
      }
    })).rejects.toMatchObject({ code: "server_job_inline_source_custody_required" });
    expect((await fixture.queue.listEnterpriseServerJobs({ teamId: fixture.project.teamId })).jobs).toHaveLength(0);
  });
});
