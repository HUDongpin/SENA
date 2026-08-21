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

const reviewerByMode = {
  json: "Queued JSON Reviewer",
  multipart: "Queued Multipart Reviewer",
  pointer: "Queued Pointer Reviewer"
} as const;

type QueueMode = keyof typeof reviewerByMode;

function projectSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  return buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "Round11 reviewer parity project",
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: imported.dataset
  });
}

const annotationRows = [
  { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
  { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
];

const annotationCsv = [
  "coder_id,item_id,code_id,value",
  "c1,u2,Evidence,1",
  "c2,u2,Evidence,0"
].join("\n");

async function runQueuedReviewerCase(mode: QueueMode) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round11-reviewer-${mode}-`));
  let sessionToken = "";
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "local";
  process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
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

  try {
    const enterprise = await import("../enterprise");
    const importAnalysis = await import("../enterprise/import-analysis");
    const reliabilityRuns = await import("../enterprise/reliability-runs");
    const worker = await import("../enterprise/server-job-worker-runtime");
    const registered = enterprise.registerEnterpriseUser({
      name: "Authenticated Queue Owner",
      email: `round11-${mode}@example.edu`,
      password: "sena-secure-123",
      organization: "Round11 Queue Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    const teamId = registered.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId,
      title: `Round11 ${mode} reviewer project`,
      snapshot: projectSnapshot()
    });
    const reviewer = reviewerByMode[mode];
    const route = await import("../../../app/api/sena/reliability/route");
    let request: Request;

    if (mode === "multipart") {
      const form = new FormData();
      form.set("teamId", teamId);
      form.set("projectId", project.id);
      form.set("reviewer", reviewer);
      form.set("queue", "true");
      form.append("files", new File([annotationCsv], "round11-reviewer.csv", { type: "text/csv" }));
      request = new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: { "x-sena-csrf-token": csrf.token, prefer: "respond-async" },
        body: form
      });
    } else {
      const uploadIds = mode === "pointer"
        ? (await importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(registered.context, {
          teamId,
          files: [{
            name: "round11-pointer.csv",
            contentType: "text/csv",
            bytes: Buffer.from(annotationCsv, "utf8"),
            importProfile: "reliability"
          }]
        })).map((upload) => upload.id)
        : undefined;
      request = new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token,
          prefer: "respond-async"
        },
        body: JSON.stringify({
          teamId,
          projectId: project.id,
          reviewer,
          annotations: mode === "json" ? annotationRows : undefined,
          uploadIds
        })
      });
    }

    const response = await route.POST(request);
    const job = await response.json() as {
      payloadSummary?: {
        uploadIds?: string[];
        reviewerEnvelopeUploadId?: string;
      };
    };
    expect(response.status).toBe(202);
    expect(JSON.stringify(job)).not.toContain(reviewer);
    expect(JSON.stringify(job)).not.toContain("coder_id");

    const drained = await worker.drainEnterpriseServerJobQueue({ teamId, kind: "reliability" });
    expect(drained.succeeded).toBe(1);
    const runs = await reliabilityRuns.listEnterpriseReliabilityRunsAsync(registered.context, {
      teamId,
      projectId: project.id
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].reviewer).toBe(reviewer);
    expect(runs[0].reviewPatch.reviewer).toBe(reviewer);
    expect(job.payloadSummary?.reviewerEnvelopeUploadId).toMatch(/^upload_/);
  } finally {
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    delete process.env.SENA_JOB_QUEUE_ADAPTER;
    delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

describe("Round11 queued reliability reviewer parity", () => {
  afterEach(() => {
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    delete process.env.SENA_JOB_QUEUE_ADAPTER;
    delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each(["json", "multipart", "pointer"] as const)(
    "persists an explicit %s reviewer without exposing it in the job receipt",
    async (mode) => runQueuedReviewerCase(mode),
    30_000
  );
});
