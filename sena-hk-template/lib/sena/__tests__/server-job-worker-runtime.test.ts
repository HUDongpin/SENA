import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveInstalledPackageFile } from "../../../scripts/resolve-installed-package-file";

const viteNodePath = resolveInstalledPackageFile("vite-node", "vite-node.mjs", import.meta.url);
const localClaimContenderPath = path.join(
  process.cwd(),
  "lib/sena/__tests__/fixtures/local-server-job-claim-contender.ts"
);
const localStaleWriterPath = path.join(
  process.cwd(),
  "lib/sena/__tests__/fixtures/local-file-state-stale-writer.ts"
);

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD",
  "SENA_JOB_QUEUE_MAX_ATTEMPTS",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_SECRET"
];

const reliabilityAnnotations = [
  { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
  { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
  { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
  { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
];

const reliabilityCsv = [
  "coder_id,item_id,code_id,value",
  "c1,u1,Evidence,1",
  "c2,u1,Evidence,1",
  "c1,u2,Evidence,1",
  "c2,u2,Evidence,0"
].join("\n");

// Opaque person ids and no dataset.metadata of its own: the two preconditions
// withSenaImportDatasetMetadata requires before it derives one from the request's
// dataGovernance block. A contract that already carries metadata, or that names
// people by roster id, would leave the derivation dormant and make the parity
// assertion below vacuous.
const parityImportContract = {
  people: [
    { id: "p-1", label: "Participant 1", role: "Teacher", group: "Parity Team", initials: "P1" },
    { id: "p-2", label: "Participant 2", role: "Teacher", group: "Parity Team", initials: "P2" }
  ],
  interactions: [
    { source: "p-1", target: "p-2", weight: 2, channel: "reply", stage: "Plan", turnIndex: 1 }
  ],
  utterances: [
    { id: "u1", personId: "p-1", unitId: "parity-unit", stanzaId: "parity-1", stage: "Plan", turnIndex: 1, text: "What evidence would tell us the question worked", timestamp: "2026-06-08T09:00:00Z" },
    { id: "u2", personId: "p-2", unitId: "parity-unit", stanzaId: "parity-1", stage: "Plan", turnIndex: 2, text: "We can explain the pattern with the exit tickets", timestamp: "2026-06-08T09:01:00Z" }
  ],
  coded_segments: [
    { segmentId: "s1", utteranceId: "u1", personId: "p-1", unitId: "parity-unit", stanzaId: "parity-1", stage: "Plan", turnIndex: 1, text: "What evidence would tell us the question worked", codes: ["question"], confidence: 1 },
    { segmentId: "s2", utteranceId: "u2", personId: "p-2", unitId: "parity-unit", stanzaId: "parity-1", stage: "Plan", turnIndex: 2, text: "We can explain the pattern with the exit tickets", codes: ["explanation"], confidence: 1 }
  ],
  codebook: [
    { id: "question", label: "Question", family: "Inquiry", description: "Problem framing and inquiry prompts", color: "#7c3aed" },
    { id: "explanation", label: "Explanation", family: "Inquiry", description: "Mechanism and reasoning moves", color: "#0ea5e9" }
  ]
};

const parityDataGovernance = {
  irbApprovalId: "IRB-2026-PARITY-01",
  consentScope: "Consented lesson-study discourse, secondary analysis only",
  retentionPolicy: "Raw transcripts deleted 24 months after publication",
  dataSteward: "Parity Data Steward",
  reviewedAt: "2026-08-10T00:00:00.000Z"
};

async function workerFixture(options: { inlinePayload?: boolean; scopedSource?: boolean } = {}) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-job-worker-runtime-"));
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = "local";
  process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
  process.env.SENA_JOB_QUEUE_MAX_ATTEMPTS = "3";
  if (options.inlinePayload) process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";

  const enterprise = await import("../enterprise");
  const index = await import("../index");
  const runtime = await import("../enterprise/server-job-worker-runtime");
  const queue = await import("../enterprise/server-job-queue");
  const importAnalysis = await import("../enterprise/import-analysis");
  const reliabilityRuns = await import("../enterprise/reliability-runs");

  const registered = enterprise.registerEnterpriseUser({
    name: "Job Worker Owner",
    email: "job-worker-owner@example.edu",
    password: "sena-secure-123",
    organization: "Job Worker Lab",
    plan: "lab"
  });
  const teamId = registered.context.teams[0].id;

  const imported = index.importSenaJsonContract(index.lessonStudySenaContract);
  const analysisDataset = options.scopedSource ? {
    ...structuredClone(imported.dataset),
    utterances: imported.dataset.utterances.slice(0, 1),
    coded_segments: imported.dataset.coded_segments.filter((segment) => segment.utteranceId === "u1")
  } : imported.dataset;
  const model = index.buildSenaModel(analysisDataset);
  const snapshot = index.buildSenaProjectSnapshot(model, {
    title: "Worker Runtime Source",
    generatedAt: "2026-08-15T00:00:00.000Z",
    sourceDataset: imported.dataset
  });
  const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
    teamId,
    title: "Worker Runtime Project",
    description: "Fixture project for the in-repo job worker.",
    snapshot
  });

  // Registers upload blobs exactly the way the queueing half of the import and
  // reliability routes does: encrypted at rest, no warningCount asserted, and
  // reachable afterwards only by upload id.
  async function registerUploads(files: Array<{ name: string; contentType?: string; body: string; importProfile?: string }>) {
    return importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(registered.context, {
      teamId,
      files: files.map((file) => ({
        name: file.name,
        contentType: file.contentType ?? "application/octet-stream",
        bytes: Buffer.from(file.body, "utf8"),
        importProfile: file.importProfile
      }))
    });
  }

  return {
    enterpriseDbDir,
    enterprise,
    runtime,
    queue,
    importAnalysis,
    reliabilityRuns,
    index,
    registerUploads,
    context: registered.context,
    teamId,
    project,
    snapshot
  };
}

async function waitForCoordinationFiles(paths: string[], timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (!paths.every(existsSync)) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for claim coordination: ${paths.map((entry) => path.basename(entry)).join(", ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function spawnLocalClaimContender(input: {
  mode?: "claim" | "worker";
  contenderId: string;
  jobId: string;
  coordinationDir: string;
  enterpriseDbDir: string;
  workerPayloadPath?: string;
}) {
  const child = spawn(process.execPath, [
    viteNodePath,
    "--script",
    localClaimContenderPath,
    input.mode ?? "claim",
    input.contenderId,
    input.jobId,
    input.coordinationDir,
    input.workerPayloadPath ?? ""
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SENA_ENTERPRISE_DB_DIR: input.enterpriseDbDir,
      SENA_ENTERPRISE_STATE_STORE: "",
      SENA_ENTERPRISE_DB_ADAPTER: "",
      DATABASE_URL: "",
      SENA_JOB_QUEUE_ADAPTER: "local",
      SENA_JOB_QUEUE_ALLOW_LOCAL: "1",
      SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const completion = new Promise<Record<string, unknown>>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Local claim contender ${input.contenderId} exited ${code}: ${stderr || stdout}`));
        return;
      }
      const payload = stdout.match(/CLAIM_RESULT:(\{.*\})/)?.[1];
      if (!payload) {
        reject(new Error(`Local claim contender ${input.contenderId} omitted its result: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(payload) as Record<string, unknown>);
    });
  });
  return { child, completion };
}

function spawnLocalStaleWriter(input: {
  coordinationDir: string;
  enterpriseDbDir: string;
}) {
  const child = spawn(process.execPath, [
    viteNodePath,
    "--script",
    localStaleWriterPath,
    input.coordinationDir
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SENA_ENTERPRISE_DB_DIR: input.enterpriseDbDir,
      SENA_ENTERPRISE_STATE_STORE: "",
      SENA_ENTERPRISE_DB_ADAPTER: "",
      DATABASE_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const completion = new Promise<Record<string, unknown>>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Local stale writer exited ${code}: ${stderr || stdout}`));
        return;
      }
      const payload = stdout.match(/STALE_WRITE_RESULT:(\{.*\})/)?.[1];
      if (!payload) {
        reject(new Error(`Local stale writer omitted its result: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(payload) as Record<string, unknown>);
    });
  });
  return { child, completion };
}

describe("SENA in-repo server job worker runtime", () => {
  let enterpriseDbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (enterpriseDbDir) {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      enterpriseDbDir = undefined;
    }
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("executes a queued analysis job and lands it succeeded with the analysis run reachable", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome.status).toBe("succeeded");
    expect(outcome.jobStatus).toBe("succeeded");
    expect(outcome.result?.analysisRunId).toMatch(/^analysis_/);

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("succeeded");
    expect(stored.lifecycle.attempts).toBe(1);
    expect(stored.lifecycle.workerRunId).toBe(outcome.workerRunId);
    expect(stored.resultReceipt).toMatchObject({
      schemaVersion: "sena-enterprise-server-job-result/v1",
      outputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      artifactReferences: [outcome.result?.analysisRunId],
      evidence: {
        analysisRunId: outcome.result?.analysisRunId,
        reportSha256: outcome.result?.reportSha256,
        projectSnapshotSha256: outcome.result?.projectSnapshotSha256
      },
      redaction: {
        payloadValuesExcluded: true,
        rawRowsExcluded: true,
        secretValuesExcluded: true
      }
    });

    const runs = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs.map((run) => run.id)).toContain(outcome.result?.analysisRunId);
  });

  it("executes an encrypted project-bound validation job and reuses its deterministic run on replay", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const commandEnvelope = await import("../server-job-command-envelope");
    const validationRuns = await import("../enterprise/validation-runs");
    const validationDataset = structuredClone(fixture.snapshot.dataset);
    validationDataset.people = validationDataset.people.map((person, index) => ({
      ...person,
      group: index % 2 === 0 ? "Validation A" : "Validation B"
    }));
    const validationModel = fixture.index.buildSenaModel(validationDataset);
    const snapshot = fixture.index.buildSenaProjectSnapshot(validationModel, {
      title: "Validation Worker Source",
      generatedAt: "2026-08-28T00:00:00.000Z",
      sourceDataset: validationDataset
    });
    const project = await fixture.enterprise.createEnterpriseProjectAsync(fixture.context, {
      teamId: fixture.teamId,
      title: "Validation Worker Project",
      snapshot
    });
    const payload = {
      action: "run-validation",
      commandCustody: commandEnvelope.SENA_SERVER_JOB_COMMAND_CUSTODY,
      teamId: fixture.teamId,
      projectId: project.id,
      projectVersion: project.currentVersion,
      groupField: "group",
      groupA: "Validation A",
      groupB: "Validation B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05,
      seed: 20260828,
      suite: false
    };
    const queueInput = {
      kind: "validation" as const,
      teamId: fixture.teamId,
      projectId: project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project" as const,
        projectVersion: project.currentVersion,
        projectTeamId: project.teamId,
        comparisonCount: 1,
        validationMethod: "group-comparison" as const,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true as const
      }
    };
    const [commandEnvelopeUploadId] = fixture.importAnalysis.reserveEnterpriseUploadIds(1);
    const custody = commandEnvelope.planSenaServerJobCommandCustody(
      queueInput,
      commandEnvelopeUploadId,
      fixture.queue.stableServerJobPayloadSha256(payload)
    );
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      ...custody.jobInput,
      beforeDispatch: async () => {
        await fixture.importAnalysis.createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync(
          fixture.context,
          {
            teamId: fixture.teamId,
            files: [custody.file],
            requiredPermission: "analysis:run"
          }
        );
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });
    expect(outcome).toEqual(expect.objectContaining({
      status: "succeeded",
      jobStatus: "succeeded",
      result: expect.objectContaining({
        validationRunId: expect.stringMatching(/^val_job_[a-f0-9]{24}$/),
        validationRunEvidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    }));

    const replay = await validationRuns.buildEnterpriseGroupComparisonValidationResponseWithPostgresMirrorAsync(
      fixture.context,
      payload,
      { executionIdempotency: { key: job.id, createdAt: job.queuedAt } }
    );
    expect(replay.body.validationRun.id).toBe(outcome.result?.validationRunId);
    expect(validationRuns.listEnterpriseValidationRuns(fixture.context, {
      teamId: fixture.teamId,
      projectId: project.id
    }).filter((run) => run.id === outcome.result?.validationRunId)).toHaveLength(1);
  });

  it.each([
    ["missing version", (payload: Record<string, unknown>) => { delete payload.projectVersion; }],
    ["string version", (payload: Record<string, unknown>) => { payload.projectVersion = "1"; }],
    ["fractional version", (payload: Record<string, unknown>) => { payload.projectVersion = 1.5; }],
    ["unsafe version", (payload: Record<string, unknown>) => {
      payload.projectVersion = Number.MAX_SAFE_INTEGER + 1;
    }],
    ["mismatched version", (payload: Record<string, unknown>) => { payload.projectVersion = 2; }],
    ["mismatched team", (payload: Record<string, unknown>) => { payload.teamId = "team_other"; }],
    ["mismatched project", (payload: Record<string, unknown>) => { payload.projectId = "project_other"; }]
  ] as const)("rejects an analysis payload with %s before claim or analysis side effects", async (_label, mutate) => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const payload: Record<string, unknown> = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    mutate(payload);
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const runsBefore = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome).toEqual(expect.objectContaining({
      status: "failed",
      jobStatus: "failed",
      attempts: 0,
      retryable: false,
      errorCode: "server_job_worker_project_binding_invalid"
    }));
    await expect(fixture.queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({ attempts: 0, retryable: false })
    }));
    expect(await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toEqual(runsBefore);
  });

  it("executes a non-persisting analysis against its retained source revision after the current project advances", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const runsBefore = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    await fixture.enterprise.updateEnterpriseProjectAsync(fixture.context, fixture.project.id, {
      expectedVersion: fixture.project.currentVersion,
      snapshot: structuredClone(fixture.snapshot)
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome).toEqual(expect.objectContaining({
      status: "succeeded",
      jobStatus: "succeeded",
      attempts: 1,
      result: expect.objectContaining({ analysisRunId: expect.stringMatching(/^analysis_/) })
    }));
    await expect(fixture.queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
      status: "succeeded",
      lifecycle: expect.objectContaining({ attempts: 1 })
    }));
    expect((await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).length).toBe(runsBefore.length + 1);
  });

  it("rejects a stale signed expectedVersion before claim, model execution, or project update", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const currentProject = await fixture.enterprise.updateEnterpriseProjectAsync(
      fixture.context,
      fixture.project.id,
      {
        expectedVersion: fixture.project.currentVersion,
        snapshot: structuredClone(fixture.snapshot)
      }
    );
    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: currentProject.id,
      projectVersion: currentProject.currentVersion,
      title: "Stale title must not persist",
      description: "Stale description must not persist",
      includeRuntimeBundle: false,
      persist: true,
      updateProject: true,
      expectedVersion: currentProject.currentVersion - 1
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: currentProject.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: currentProject.currentVersion,
        includeRuntimeBundle: false,
        persist: true,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const runsBefore = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome).toEqual(expect.objectContaining({
      status: "failed",
      jobStatus: "failed",
      attempts: 0,
      retryable: false,
      errorCode: "project_version_conflict"
    }));
    await expect(fixture.queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({
        attempts: 0,
        retryable: false,
        lastErrorCode: "project_version_conflict"
      })
    }));
    expect(await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toEqual(runsBefore);
    expect(fixture.enterprise.readEnterpriseDb().projects.find(
      (candidate: { id: string }) => candidate.id === currentProject.id
    )).toEqual(expect.objectContaining({
      currentVersion: currentProject.currentVersion,
      title: currentProject.title,
      description: currentProject.description
    }));
  });

  it("rejects a managed inline reliability payload before creating a queued receipt", async () => {
    const fixture = await workerFixture({ inlinePayload: true, scopedSource: true });
    enterpriseDbDir = fixture.enterpriseDbDir;
    const reliability = await import("../reliability");
    // Inline annotations are an externally delivered webhook shape. The local
    // polling queue intentionally rejects them because its public job record
    // never stores raw coder values and therefore cannot reproduce their hash.
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "sena-worker-runtime-test-secret";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 202 })));

    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
      uploadIds: [],
      reviewer: "Worker Runtime Reviewer",
      sourceName: "worker-runtime-reliability.json",
      inlineAnnotations: reliabilityAnnotations
    };
    const runsBefore = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    await expect(fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "dataset",
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
        uploadIds: [],
        annotationCount: reliabilityAnnotations.length,
        hasInlineSnapshot: false,
        hasInlineDataset: true,
        payloadValuesExcluded: true
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "server_job_inline_source_custody_required"
    });
    expect((await fixture.queue.listEnterpriseServerJobs({ teamId: fixture.teamId })).jobs).toHaveLength(0);
    expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toEqual(runsBefore);
  });

  it("quarantines a hash-matching retained inline reliability webhook before claim or run persistence", async () => {
    const fixture = await workerFixture({ inlinePayload: true, scopedSource: true });
    enterpriseDbDir = fixture.enterpriseDbDir;
    const state = await import("../enterprise/state");
    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      reviewer: "Historic Inline Reviewer",
      sourceName: "historic-inline-reliability.json",
      inlineAnnotations: reliabilityAnnotations
    };
    const seeded = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload: { action: "run-analysis", projectId: fixture.project.id },
      payloadSummary: {
        source: "project",
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const db = state.readEnterpriseDb();
    const retained = db.serverJobs.find((candidate) => candidate.id === seeded.id)!;
    retained.kind = "reliability";
    retained.payloadSha256 = fixture.queue.stableServerJobPayloadSha256(payload);
    retained.payloadSummary = {
      ...retained.payloadSummary,
      source: "dataset",
      uploadIds: [],
      annotationCount: reliabilityAnnotations.length,
      hasInlineDataset: true
    };
    retained.worker = {
      ...retained.worker,
      expectedAction: "run-reliability",
      payloadDelivery: "inline-payload-enabled"
    };
    retained.delivery = {
      ...retained.delivery,
      sourceReady: true,
      webhookStatus: "delivered"
    };
    state.saveDb(db);
    const runsBefore = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    const auditsBefore = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;

    const outcome = await fixture.runtime.runEnterpriseServerJobFromQueueWebhook({
      jobId: retained.id,
      workerPayload: payload
    });

    expect(outcome).toEqual(expect.objectContaining({
      status: "skipped",
      skipReason: "server_job_worker_source_not_ready",
      attempts: 0
    }));
    expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toEqual(runsBefore);
    expect(fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events).toEqual(auditsBefore);
    await expect(fixture.queue.getEnterpriseServerJob(retained.id)).resolves.toEqual(
      expect.objectContaining({
        status: "queued",
        delivery: expect.objectContaining({ sourceReady: false }),
        lifecycle: expect.objectContaining({ attempts: 0 })
      })
    );
  });

  it("rejects a blank explicit runtime owner before claim, source read, or execution", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const runsBefore = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });

    for (const runId of ["", "   "]) {
      await expect(fixture.runtime.runEnterpriseServerJob({
        job,
        workerPayload: payload,
        runId
      })).rejects.toMatchObject({
        code: "server_job_worker_run_id_required",
        status: 400
      });
    }
    expect(await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toEqual(runsBefore);
    await expect(fixture.queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
      status: "queued",
      lifecycle: expect.objectContaining({ attempts: 0 })
    }));
  });

  it("rejects a queued reliability job after its bound project revision changes", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const reliability = await import("../reliability");
    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-stale-reliability.csv",
      contentType: "text/csv",
      body: reliabilityCsv,
      importProfile: "reliability"
    }]);
    const uploadIds = uploads.map((upload) => upload.id);
    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
      uploadIds
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: payload.snapshotFingerprint,
        uploadIds,
        annotationCount: reliabilityAnnotations.length,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    await fixture.enterprise.updateEnterpriseProjectAsync(fixture.context, fixture.project.id, {
      expectedVersion: fixture.project.currentVersion,
      snapshot: structuredClone(fixture.snapshot)
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("server_job_worker_reliability_project_binding_changed");
    expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toEqual([]);
  });

  it("terminalizes a failing immutable payload before claim with its error code and hash", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: "project_does_not_exist",
      projectVersion: 1,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: "project_does_not_exist",
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome).toEqual(expect.objectContaining({
      status: "failed",
      jobStatus: "failed",
      attempts: 0,
      retryable: false,
      errorCode: "project_not_found",
      errorHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("failed");
    expect(stored.lifecycle).toEqual(expect.objectContaining({
      attempts: 0,
      retryable: false,
      lastTransition: "mark-failed",
      lastErrorCode: "project_not_found",
      lastErrorHash: outcome.errorHash,
      statusReason: "server-job-worker-preclaim-admission-failed"
    }));
    expect(stored.lifecycle.workerRunId).toBeUndefined();
    expect(stored.lifecycle.deadLetteredAt).toBeUndefined();
  });

  it("requeues a local failed job once under concurrent retry and lets polling execute the retained source", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    await fixture.queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-running",
      workerRunId: "local-retry-first-owner"
    });
    const failed = await fixture.queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-failed",
      workerRunId: "local-retry-first-owner",
      errorCode: "simulated-transient-local-failure"
    });
    expect(failed.job).toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({ attempts: 1, retryable: true })
    }));

    const retryResults = await Promise.allSettled([
      fixture.queue.updateEnterpriseServerJobStatus({ jobId: job.id, action: "retry" }),
      fixture.queue.updateEnterpriseServerJobStatus({ jobId: job.id, action: "retry" })
    ]);
    expect(retryResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(retryResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const retryWinner = retryResults.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<{
      job: { status: string; lifecycle: { attempts: number; workerRunId?: string } };
    }>;
    expect(retryWinner.value.job).toEqual(expect.objectContaining({
      status: "queued",
      lifecycle: expect.objectContaining({ attempts: 1 })
    }));
    expect(retryWinner.value.job.lifecycle.workerRunId).toBeUndefined();

    const report = await fixture.runtime.drainEnterpriseServerJobQueue({
      teamId: fixture.teamId,
      kind: "analysis",
      limit: 10
    });
    expect(report).toEqual(expect.objectContaining({
      scanned: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0
    }));
    await expect(fixture.queue.getEnterpriseServerJob(job.id)).resolves.toEqual(
      expect.objectContaining({
        status: "succeeded",
        lifecycle: expect.objectContaining({ attempts: 2, retryable: false })
      })
    );
  });

  it("preserves a prior attempt when a retried command becomes irreproducible before its next claim", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const state = await import("../enterprise/state");
    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    await fixture.queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-running",
      workerRunId: "local-retry-corruption-owner"
    });
    await fixture.queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "mark-failed",
      workerRunId: "local-retry-corruption-owner",
      errorCode: "simulated-transient-local-failure"
    });
    await fixture.queue.updateEnterpriseServerJobStatus({
      jobId: job.id,
      action: "retry"
    });
    const db = state.readEnterpriseDb();
    db.serverJobs.find((candidate) => candidate.id === job.id)!.payloadSha256 = "f".repeat(64);
    state.saveDb(db);

    const report = await fixture.runtime.drainEnterpriseServerJobQueue({
      teamId: fixture.teamId,
      kind: "analysis",
      limit: 1
    });

    expect(report).toEqual(expect.objectContaining({ scanned: 1, failed: 1, succeeded: 0 }));
    expect(report.outcomes[0]).toEqual(expect.objectContaining({
      jobId: job.id,
      status: "failed",
      attempts: 1,
      retryable: false,
      errorCode: "server_job_worker_payload_not_reproducible"
    }));
    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored).toEqual(expect.objectContaining({
      status: "failed",
      lifecycle: expect.objectContaining({
        attempts: 1,
        retryable: false
      })
    }));
    expect(stored.lifecycle).not.toHaveProperty("workerRunId");
  });

  it("does not execute a job a second time once it has been claimed", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const [first, second] = await Promise.all([
      fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload }),
      fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload })
    ]);
    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.status === "succeeded")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "skipped")).toHaveLength(1);

    const alreadyClaimed = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });
    expect(alreadyClaimed.status).toBe("skipped");
    expect(alreadyClaimed.skipReason).toBe("server_job_worker_job_not_queued");

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.lifecycle.attempts).toBe(1);
    const runs = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs).toHaveLength(1);
  });

  it("atomically grants exactly one queued-job claim to racing worker contenders", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const [left, right] = await Promise.all([
      fixture.queue.claimEnterpriseServerJob({ jobId: job.id, workerRunId: "worker_run_left" }),
      fixture.queue.claimEnterpriseServerJob({ jobId: job.id, workerRunId: "worker_run_right" })
    ]);
    const claims = [left, right];
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1);

    const winner = claims.find((claim) => claim.claimed);
    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("running");
    expect(stored.lifecycle.attempts).toBe(1);
    expect(stored.lifecycle.workerRunId).toBe(winner?.job.lifecycle.workerRunId);
  });

  it("grants exactly one local claim across independent processes sharing one file store", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload: {
        action: "run-analysis",
        projectId: fixture.project.id,
        projectVersion: fixture.project.currentVersion
      },
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const coordinationDir = path.join(fixture.enterpriseDbDir, "claim-process-coordination");
    mkdirSync(coordinationDir, { recursive: true });
    const left = spawnLocalClaimContender({
      contenderId: "left",
      jobId: job.id,
      coordinationDir,
      enterpriseDbDir: fixture.enterpriseDbDir
    });
    const right = spawnLocalClaimContender({
      contenderId: "right",
      jobId: job.id,
      coordinationDir,
      enterpriseDbDir: fixture.enterpriseDbDir
    });

    await waitForCoordinationFiles([
      path.join(coordinationDir, "ready-left"),
      path.join(coordinationDir, "ready-right")
    ]);
    writeFileSync(path.join(coordinationDir, "start"), "start");
    const state = await import("../enterprise/state");
    if (!("mutateEnterpriseDbAtomically" in state)) {
      await waitForCoordinationFiles([
        path.join(coordinationDir, "read-left"),
        path.join(coordinationDir, "read-right")
      ]);
      writeFileSync(path.join(coordinationDir, "release-readers"), "release");
    }

    const claims = await Promise.all([left.completion, right.completion]);
    expect(claims.filter((claim) => claim.claimed === true)).toHaveLength(1);
    expect(claims.filter((claim) => claim.claimed === false)).toHaveLength(1);
    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("running");
    expect(stored.lifecycle.attempts).toBe(1);
  }, 30_000);

  it("fails closed when an atomic file mutation times out or its callback throws", async () => {
    const state = await import("../enterprise/state");
    const atomicDbDir = mkdtempSync(path.join(tmpdir(), "sena-atomic-file-state-"));
    try {
      const store = state.createFileEnterpriseStateStore({
        dbDir: atomicDbDir,
        createEmptyDb: state.emptyEnterpriseDb,
        lockTimeoutMs: 25,
        lockPollMs: 1
      });
      store.read();
      const before = readFileSync(store.paths.dbPath, "utf8");
      writeFileSync(store.paths.lockPath, "held-by-another-process", { flag: "wx" });
      try {
        expect(() => store.mutateAtomically((db) => {
          (db as typeof db & { claimProbe?: string }).claimProbe = "must-not-persist";
          return "unreachable";
        })).toThrow(/Timed out waiting for SENA enterprise database write lock/);
      } finally {
        if (existsSync(store.paths.lockPath)) unlinkSync(store.paths.lockPath);
      }
      expect(readFileSync(store.paths.dbPath, "utf8")).toBe(before);

      expect(() => store.mutateAtomically((db) => {
        (db as typeof db & { claimProbe?: string }).claimProbe = "must-not-persist";
        throw new Error("atomic mutator failure");
      })).toThrow("atomic mutator failure");
      expect(readFileSync(store.paths.dbPath, "utf8")).toBe(before);
      expect(existsSync(store.paths.lockPath)).toBe(false);
      expect(store.mutateAtomically((db) => db.schemaVersion)).toBe(state.emptyEnterpriseDb().schemaVersion);
    } finally {
      rmSync(atomicDbDir, { recursive: true, force: true });
    }
  });

  it("allows only one cross-process reliability worker to persist a run and audit", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const uploadReader = await import("../enterprise/reliability-upload-reader");
    const queueReviewer = await import("../reliability-queue-reviewer");
    const queueSources = uploadReader.buildEnterpriseReliabilityJsonQueueUploads({
      annotations: reliabilityAnnotations
    });
    const reviewerEnvelope = queueReviewer.buildSenaReliabilityReviewerEnvelope(
      "Cross-process reliability reviewer",
      fixture.context.user.name
    );
    const uploads = await fixture.importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(fixture.context, {
      teamId: fixture.teamId,
      files: [
        ...queueSources,
        {
          name: queueReviewer.SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME,
          contentType: "application/json",
          bytes: reviewerEnvelope.bytes,
          importProfile: queueReviewer.SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE
        }
      ]
    });
    const sourceUpload = uploads[0];
    const reviewerUpload = uploads[1];
    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: undefined,
      projectVersion: undefined,
      snapshotFingerprint: undefined,
      uploadIds: [sourceUpload.id],
      reviewerEnvelopeUploadId: reviewerUpload.id,
      reviewerEnvelopeSha256: reviewerUpload.sha256
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        uploadIds: [sourceUpload.id],
        reviewerEnvelopeUploadId: reviewerUpload.id,
        reviewerEnvelopeSha256: reviewerUpload.sha256,
        annotationCount: reliabilityAnnotations.length,
        fileCount: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const auditsBefore = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;
    const coordinationDir = path.join(fixture.enterpriseDbDir, "reliability-worker-process-coordination");
    mkdirSync(coordinationDir, { recursive: true });
    const workerPayloadPath = path.join(coordinationDir, "worker-payload.json");
    writeFileSync(workerPayloadPath, JSON.stringify(payload));
    const left = spawnLocalClaimContender({
      mode: "worker",
      contenderId: "left",
      jobId: job.id,
      workerPayloadPath,
      coordinationDir,
      enterpriseDbDir: fixture.enterpriseDbDir
    });
    const right = spawnLocalClaimContender({
      mode: "worker",
      contenderId: "right",
      jobId: job.id,
      workerPayloadPath,
      coordinationDir,
      enterpriseDbDir: fixture.enterpriseDbDir
    });

    await waitForCoordinationFiles([
      path.join(coordinationDir, "ready-left"),
      path.join(coordinationDir, "ready-right")
    ]);
    writeFileSync(path.join(coordinationDir, "start"), "start");
    const state = await import("../enterprise/state");
    if (!("mutateEnterpriseDbAtomically" in state)) {
      await waitForCoordinationFiles([
        path.join(coordinationDir, "read-left"),
        path.join(coordinationDir, "read-right")
      ]);
      writeFileSync(path.join(coordinationDir, "release-readers"), "release");
    }

    const outcomes = await Promise.all([left.completion, right.completion]);
    expect(outcomes.filter((outcome) => outcome.status === "succeeded")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "skipped")).toHaveLength(1);
    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("succeeded");
    expect(stored.lifecycle.attempts).toBe(1);
    const runs = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs).toHaveLength(1);
    const auditsAfter = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;
    const newRunAudits = auditsAfter.filter((event) => (
      event.event === "reliability.run" && !auditsBefore.some((before) => before.id === event.id)
    ));
    expect(newRunAudits).toHaveLength(1);
  }, 30_000);

  it("rejects a stale ordinary file writer after a reliability worker claim and preserves one run, audit, and attempt", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const uploadReader = await import("../enterprise/reliability-upload-reader");
    const queueReviewer = await import("../reliability-queue-reviewer");
    const queueSources = uploadReader.buildEnterpriseReliabilityJsonQueueUploads({
      annotations: reliabilityAnnotations
    });
    const reviewerEnvelope = queueReviewer.buildSenaReliabilityReviewerEnvelope(
      "Stale writer reliability reviewer",
      fixture.context.user.name
    );
    const uploads = await fixture.importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(fixture.context, {
      teamId: fixture.teamId,
      files: [
        ...queueSources,
        {
          name: queueReviewer.SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME,
          contentType: "application/json",
          bytes: reviewerEnvelope.bytes,
          importProfile: queueReviewer.SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE
        }
      ]
    });
    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: undefined,
      projectVersion: undefined,
      snapshotFingerprint: undefined,
      uploadIds: [uploads[0].id],
      reviewerEnvelopeUploadId: uploads[1].id,
      reviewerEnvelopeSha256: uploads[1].sha256
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        uploadIds: [uploads[0].id],
        reviewerEnvelopeUploadId: uploads[1].id,
        reviewerEnvelopeSha256: uploads[1].sha256,
        annotationCount: reliabilityAnnotations.length,
        fileCount: 1,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const auditsBefore = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;
    const coordinationDir = path.join(fixture.enterpriseDbDir, "stale-writer-coordination");
    mkdirSync(coordinationDir, { recursive: true });
    const staleWriter = spawnLocalStaleWriter({
      coordinationDir,
      enterpriseDbDir: fixture.enterpriseDbDir
    });
    await waitForCoordinationFiles([path.join(coordinationDir, "stale-writer-ready")]);

    const firstOutcome = await fixture.runtime.runEnterpriseServerJob({
      job,
      workerPayload: payload,
      runId: "worker_run_stale_writer_first"
    });
    expect(firstOutcome.status).toBe("succeeded");
    writeFileSync(path.join(coordinationDir, "release-stale-writer"), "release");
    const staleWrite = await staleWriter.completion;

    expect(staleWrite).toEqual({
      written: false,
      code: "enterprise_file_state_revision_conflict",
      status: 409
    });
    const storedAfterStaleWrite = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(storedAfterStaleWrite.status).toBe("succeeded");
    expect(storedAfterStaleWrite.lifecycle.attempts).toBe(1);

    const secondOutcome = await fixture.runtime.runEnterpriseServerJob({
      job: storedAfterStaleWrite,
      workerPayload: payload,
      runId: "worker_run_stale_writer_second"
    });
    expect(secondOutcome.status).toBe("skipped");
    const runs = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(runs).toHaveLength(1);
    const auditsAfter = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;
    expect(auditsAfter.filter((event) => (
      event.event === "reliability.run" && !auditsBefore.some((before) => before.id === event.id)
    ))).toHaveLength(1);
  }, 30_000);

  it("executes a queued import job from its registered upload blobs and lands it succeeded", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-import.json",
      contentType: "application/json",
      body: JSON.stringify(fixture.index.lessonStudySenaContract)
    }]);
    const uploadIds = uploads.map((upload) => upload.id);
    // The queueing route deliberately leaves warningCount unset: preflight is
    // validation-only, while the worker owns the authoritative persisted count.
    expect(uploads[0].warningCount).toBeUndefined();

    const payload = {
      action: "run-import",
      teamId: fixture.teamId,
      uploadIds,
      persistProject: true,
      title: "Queued Import Project",
      includeRuntimeBundle: false
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "import",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        fileCount: uploadIds.length,
        uploadIds,
        persist: true,
        includeRuntimeBundle: false,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome.errorCode).toBeUndefined();
    expect(outcome.status).toBe("succeeded");
    expect(outcome.result?.importRunId).toMatch(/^import_/);
    expect(outcome.result?.importDatasetContentHash).toMatch(/^0x[a-f0-9]{8}$/);
    expect(outcome.result?.importCleaningManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.result?.persistedProjectId).toMatch(/^project_/);
    expect(outcome.result?.analysisRunId).toMatch(/^analysis_/);

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("succeeded");
    expect(stored.lifecycle.attempts).toBe(1);

    const importRuns = await fixture.importAnalysis.listEnterpriseImportRunsAsync(fixture.context, fixture.teamId);
    const importRun = importRuns.find((run) => run.id === outcome.result?.importRunId);
    expect(importRun).toBeDefined();
    expect(importRun?.uploadIds).toEqual(uploadIds);
    expect(importRun?.fileCount).toBe(1);
    expect(importRun?.datasetCounts.utterances).toBeGreaterThan(0);

    const analysisRuns = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    expect(analysisRuns.map((run) => run.id)).toContain(outcome.result?.analysisRunId);

    const registeredUploads = await fixture.importAnalysis.listEnterpriseUploadsAsync(fixture.context, fixture.teamId);
    expect(registeredUploads.find((upload) => upload.id === uploadIds[0])?.warningCount).toBe(0);
  });

  it("returns stable sanitized numeric issues when a queued import bypasses route preflight", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const invalidDataset = structuredClone(fixture.index.lessonStudySenaContract);
    invalidDataset.interactions[0].weight = -54321;
    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-invalid-import.json",
      contentType: "application/json",
      body: JSON.stringify(invalidDataset)
    }]);
    const uploadIds = uploads.map((upload) => upload.id);
    const payload = {
      action: "run-import",
      teamId: fixture.teamId,
      uploadIds,
      persistProject: false,
      includeRuntimeBundle: false
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "import",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        fileCount: 1,
        uploadIds,
        persist: false,
        includeRuntimeBundle: false,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("invalid_sena_numeric_domain");
    expect(outcome.issues).toEqual([{
      path: "dataset.interactions[0].weight",
      rule: "finite-nonnegative"
    }]);
    expect(JSON.stringify(outcome)).not.toContain("-54321");
    expect(await fixture.importAnalysis.listEnterpriseImportRunsAsync(fixture.context, fixture.teamId)).toEqual([]);
  });

  it("executes a queued reliability job from its registered upload blobs", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const reliability = await import("../reliability");

    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-reliability.csv",
      contentType: "text/csv",
      body: reliabilityCsv,
      importProfile: "reliability"
    }]);
    const uploadIds = uploads.map((upload) => upload.id);

    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
      uploadIds
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
        uploadIds,
        fileCount: uploadIds.length,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome.errorCode).toBeUndefined();
    expect(outcome.status).toBe("succeeded");
    expect(outcome.result?.reliabilityRunId).toMatch(/^rel_/);

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("succeeded");

    const runs = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    const reliabilityRun = runs.find((run) => run.id === outcome.result?.reliabilityRunId);
    expect(reliabilityRun).toBeDefined();
    expect(reliabilityRun?.annotationCount).toBe(4);
    expect(reliabilityRun?.fileCount).toBe(1);
  });

  it("admits queued reliability pointers before project reads and reviewer decryption", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const reliability = await import("../reliability");
    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-reliability-preflight.csv",
      contentType: "text/csv",
      body: reliabilityCsv,
      importProfile: "reliability"
    }]);
    const uploadIds = uploads.map((upload) => upload.id);
    const reviewerEnvelopeSha256 = "a".repeat(64);
    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
      uploadIds,
      reviewerEnvelopeUploadId: "upload_reviewer_must_not_be_read",
      reviewerEnvelopeSha256
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
        uploadIds,
        fileCount: uploadIds.length,
        reviewerEnvelopeUploadId: "upload_reviewer_must_not_be_read",
        reviewerEnvelopeSha256,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const runsBefore = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    const jobBeforeAdmission = structuredClone(await fixture.queue.getEnterpriseServerJob(job.id));
    const auditsBefore = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;
    const auditedProjectRead = vi.fn(async () => {
      throw new Error("audited project read happened before reliability pointer admission");
    });
    const readOnlyProjectLookup = vi.fn(async () => {
      throw new Error("read-only project lookup happened before reliability pointer admission");
    });
    const reviewerReader = vi.fn(async () => {
      throw new Error("reviewer decrypt happened before reliability pointer admission");
    });
    const pointerReader = vi.fn(async () => {
      const actualReliability = await vi.importActual<typeof import("../reliability")>("../reliability");
      throw new actualReliability.SenaReliabilityUniverseLimitError([{
        path: "uploadIds",
        rule: "aggregate-source-byte-count-at-most-104857600",
        actual: 104_857_601,
        maximum: 104_857_600
      }]);
    });

    vi.resetModules();
    vi.doMock("../enterprise/team-project", async () => ({
      ...await vi.importActual<typeof import("../enterprise/team-project")>("../enterprise/team-project"),
      getEnterpriseProjectAsync: auditedProjectRead,
      getEnterpriseProjectReadOnlyAsync: readOnlyProjectLookup
    }));
    vi.doMock("../enterprise/import-analysis", async () => ({
      ...await vi.importActual<typeof import("../enterprise/import-analysis")>("../enterprise/import-analysis"),
      readEnterpriseUploadContentsAsync: reviewerReader
    }));
    vi.doMock("../enterprise/reliability-upload-reader", async () => ({
      ...await vi.importActual<typeof import("../enterprise/reliability-upload-reader")>("../enterprise/reliability-upload-reader"),
      readEnterpriseReliabilityUploadPointerContents: pointerReader
    }));

    try {
      const runtime = await import("../enterprise/server-job-worker-runtime");
      const outcome = await runtime.runEnterpriseServerJob({ job, workerPayload: payload });

      expect(outcome.status).toBe("failed");
      expect(pointerReader).toHaveBeenCalledTimes(1);
      expect(auditedProjectRead).not.toHaveBeenCalled();
      expect(readOnlyProjectLookup).not.toHaveBeenCalled();
      expect(reviewerReader).not.toHaveBeenCalled();
      expect(outcome.errorCode).toBe("reliability_universe_limit_exceeded");
      expect(await fixture.queue.getEnterpriseServerJob(job.id)).toEqual(jobBeforeAdmission);
      expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
        teamId: fixture.teamId
      })).toEqual(runsBefore);
      expect(fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
        teamId: fixture.teamId,
        limit: 500
      }).events).toEqual(auditsBefore);
    } finally {
      vi.doUnmock("../enterprise/team-project");
      vi.doUnmock("../enterprise/import-analysis");
      vi.doUnmock("../enterprise/reliability-upload-reader");
    }
  });

  it("rejects cumulative code-cell fan-out across queued upload pointers before claim, run, or audit side effects", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const limit = 200_000;
    const uploads = await fixture.registerUploads([
      {
        name: "worker-code-cells-first.json",
        contentType: "application/json",
        body: JSON.stringify({
          rows: [{ coder_id: "c1", item_id: "u1", code_id: "a;".repeat(100_001), value: "1" }]
        }),
        importProfile: "reliability"
      },
      {
        name: "worker-code-cells-second.json",
        contentType: "application/json",
        body: JSON.stringify({
          rows: [{ coder_id: "c2", item_id: "u2", code_id: "b;".repeat(100_000), value: "" }]
        }),
        importProfile: "reliability"
      }
    ]);
    const uploadIds = uploads.map((upload) => upload.id);
    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      uploadIds
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        uploadIds,
        fileCount: uploadIds.length,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const jobBefore = structuredClone(await fixture.queue.getEnterpriseServerJob(job.id));
    const runsBefore = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    const auditsBefore = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome).toMatchObject({
      status: "failed",
      errorCode: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: `annotation-row-count-at-most-${limit}`,
        actual: limit + 1,
        maximum: limit
      }]
    });
    expect(await fixture.queue.getEnterpriseServerJob(job.id)).toEqual(jobBefore);
    expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).toEqual(runsBefore);
    expect(fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events).toEqual(auditsBefore);
  });

  it.each([
    ["object", (): unknown => ({ rows: [null] })],
    ["null", (): unknown => null],
    ["string", (): unknown => "not-a-file-array"]
  ] as const)(
    "rejects managed inline files=%s before receipt, dispatch, run, or audit mutation",
    async (_label, value) => {
      const fixture = await workerFixture({ inlinePayload: true });
      enterpriseDbDir = fixture.enterpriseDbDir;
      process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
      process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
      process.env.SENA_JOB_QUEUE_SECRET = "worker-invalid-files-secret";
      const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
      vi.stubGlobal("fetch", fetchMock);
      const reliability = await import("../reliability");
      const reviewerEnvelopeUploadId = "upload_reviewer_must_not_be_read";
      const reviewerEnvelopeSha256 = "b".repeat(64);
      const payload = {
        action: "run-reliability",
        teamId: fixture.teamId,
        projectId: fixture.project.id,
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
        files: value(),
        reviewerEnvelopeUploadId,
        reviewerEnvelopeSha256
      };
      const jobsBefore = (await fixture.queue.listEnterpriseServerJobs({ teamId: fixture.teamId })).jobs;
      const runsBefore = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
        teamId: fixture.teamId
      });
      const auditsBefore = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
        teamId: fixture.teamId,
        limit: 500
      }).events;

      await expect(fixture.queue.enqueueEnterpriseServerJob({
        kind: "reliability",
        teamId: fixture.teamId,
        projectId: fixture.project.id,
        actorUserId: fixture.context.user.id,
        payload,
        payloadSummary: {
          source: "dataset",
          projectVersion: fixture.project.currentVersion,
          snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
          reviewerEnvelopeUploadId,
          reviewerEnvelopeSha256,
          hasInlineSnapshot: false,
          hasInlineDataset: true,
          payloadValuesExcluded: true
        }
      })).rejects.toMatchObject({
        status: 400,
        code: "server_job_inline_source_custody_required"
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await fixture.queue.listEnterpriseServerJobs({ teamId: fixture.teamId })).jobs).toEqual(jobsBefore);
      expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
        teamId: fixture.teamId
      })).toEqual(runsBefore);
      expect(fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
        teamId: fixture.teamId,
        limit: 500
      }).events).toEqual(auditsBefore);
    },
    30_000
  );

  it("rejects an over-limit local queued JSON envelope before claim, project, reviewer, run, or audit mutation", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const reliability = await import("../reliability");
    const queueReader = await import("../enterprise/reliability-upload-reader");
    const [sourceUpload] = await fixture.registerUploads([{
      name: "queued-reliability-json-annotations-1.json",
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "sena-reliability-json-source/v1",
        name: "reliability-json-annotations.json",
        rows: Array.from({ length: 200_001 }, () => null)
      }),
      importProfile: queueReader.SENA_RELIABILITY_JSON_QUEUE_UPLOAD_PROFILES.annotations
    }]);
    const reviewerEnvelopeUploadId = "upload_reviewer_must_not_be_read";
    const reviewerEnvelopeSha256 = "c".repeat(64);
    const payload = {
      action: "run-reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
      uploadIds: [sourceUpload.id],
      reviewerEnvelopeUploadId,
      reviewerEnvelopeSha256
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "reliability",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        projectVersion: fixture.project.currentVersion,
        snapshotFingerprint: reliability.senaReliabilitySnapshotFingerprint(fixture.project.snapshot),
        uploadIds: [sourceUpload.id],
        fileCount: 1,
        reviewerEnvelopeUploadId,
        reviewerEnvelopeSha256,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const jobBefore = structuredClone(await fixture.queue.getEnterpriseServerJob(job.id));
    const runsBefore = await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    const auditsBefore = fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
      teamId: fixture.teamId,
      limit: 500
    }).events;
    const auditedProjectRead = vi.fn(async () => {
      throw new Error("audited project read happened before queued JSON envelope admission");
    });
    const readOnlyProjectLookup = vi.fn(async () => {
      throw new Error("read-only project lookup happened before queued JSON envelope admission");
    });
    const reviewerReader = vi.fn();

    vi.resetModules();
    vi.doMock("../enterprise/team-project", async () => ({
      ...await vi.importActual<typeof import("../enterprise/team-project")>("../enterprise/team-project"),
      getEnterpriseProjectAsync: auditedProjectRead,
      getEnterpriseProjectReadOnlyAsync: readOnlyProjectLookup
    }));
    vi.doMock("../enterprise/import-analysis", async () => {
      const actual = await vi.importActual<typeof import("../enterprise/import-analysis")>("../enterprise/import-analysis");
      return {
        ...actual,
        readEnterpriseUploadContentsAsync: async (...args: Parameters<typeof actual.readEnterpriseUploadContentsAsync>) => {
          const input = args[1];
          if (input.uploadIds.includes(reviewerEnvelopeUploadId)) {
            reviewerReader();
            throw new Error("reviewer decrypt happened before queued JSON envelope admission");
          }
          return actual.readEnterpriseUploadContentsAsync(...args);
        }
      };
    });

    try {
      const runtime = await import("../enterprise/server-job-worker-runtime");
      const outcome = await runtime.runEnterpriseServerJob({ job, workerPayload: payload });

      expect(outcome.status).toBe("failed");
      expect(outcome.errorCode).toBe("reliability_universe_limit_exceeded");
      expect(auditedProjectRead).not.toHaveBeenCalled();
      expect(readOnlyProjectLookup).not.toHaveBeenCalled();
      expect(reviewerReader).not.toHaveBeenCalled();
      expect(await fixture.queue.getEnterpriseServerJob(job.id)).toEqual(jobBefore);
      expect(await fixture.reliabilityRuns.listEnterpriseReliabilityRunsAsync(fixture.context, {
        teamId: fixture.teamId
      })).toEqual(runsBefore);
      expect(fixture.enterprise.listEnterpriseAuditLog(fixture.context, {
        teamId: fixture.teamId,
        limit: 500
      }).events).toEqual(auditsBefore);
    } finally {
      vi.doUnmock("../enterprise/team-project");
      vi.doUnmock("../enterprise/import-analysis");
    }
  }, 30_000);

  it("fails a queued import whose upload is not registered instead of importing zero bytes", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const payload = {
      action: "run-import",
      teamId: fixture.teamId,
      uploadIds: ["upload_worker_runtime_missing"],
      persistProject: false,
      includeRuntimeBundle: false
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "import",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        fileCount: 1,
        uploadIds: ["upload_worker_runtime_missing"],
        persist: false,
        includeRuntimeBundle: false,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("upload_not_found");
    expect(outcome.errorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.result).toBeUndefined();

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("failed");
    expect(stored.lifecycle.lastErrorCode).toBe("upload_not_found");

    // The important half: nothing was recorded as an import at all.
    const importRuns = await fixture.importAnalysis.listEnterpriseImportRunsAsync(fixture.context, fixture.teamId);
    expect(importRuns).toHaveLength(0);
  });

  it("fails a queued import whose upload blob has been deleted from storage", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-import.json",
      contentType: "application/json",
      body: JSON.stringify(fixture.index.lessonStudySenaContract)
    }]);
    const uploadIds = uploads.map((upload) => upload.id);
    rmSync(path.join(fixture.enterpriseDbDir, uploads[0].storagePath), { force: true });

    const payload = {
      action: "run-import",
      teamId: fixture.teamId,
      uploadIds,
      persistProject: false,
      includeRuntimeBundle: false
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "import",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        fileCount: 1,
        uploadIds,
        persist: false,
        includeRuntimeBundle: false,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJob({ job, workerPayload: payload });

    expect(outcome.status).toBe("failed");
    expect(outcome.errorCode).toBe("upload_blob_missing");

    const importRuns = await fixture.importAnalysis.listEnterpriseImportRunsAsync(fixture.context, fixture.teamId);
    expect(importRuns).toHaveLength(0);
  });

  it("refuses a delivered import payload that does not hash to the enqueued payload", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-import.json",
      contentType: "application/json",
      body: JSON.stringify(fixture.index.lessonStudySenaContract)
    }]);
    const uploadIds = uploads.map((upload) => upload.id);
    const payload = {
      action: "run-import",
      teamId: fixture.teamId,
      uploadIds,
      persistProject: false,
      includeRuntimeBundle: false
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "import",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "upload",
        fileCount: 1,
        uploadIds,
        persist: false,
        includeRuntimeBundle: false,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const outcome = await fixture.runtime.runEnterpriseServerJobFromQueueWebhook({
      jobId: job.id,
      // Flipping persistProject would create a project nobody asked for.
      workerPayload: { ...payload, persistProject: true }
    });

    expect(outcome.status).toBe("skipped");
    expect(outcome.skipReason).toBe("server_job_worker_payload_sha256_mismatch");

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("queued");
    expect(stored.lifecycle.attempts).toBe(0);
    const importRuns = await fixture.importAnalysis.listEnterpriseImportRunsAsync(fixture.context, fixture.teamId);
    expect(importRuns).toHaveLength(0);
  });

  it("refuses to read upload bytes for a team the caller does not hold upload:read on", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-import.json",
      contentType: "application/json",
      body: JSON.stringify(fixture.index.lessonStudySenaContract)
    }]);
    const outsider = fixture.enterprise.registerEnterpriseUser({
      name: "Other Lab Owner",
      email: "other-lab-owner@example.edu",
      password: "sena-secure-123",
      organization: "Other Lab",
      plan: "lab"
    });

    // Naming the owning team is a permission failure, not a data leak.
    await expect(fixture.importAnalysis.readEnterpriseUploadContentsAsync(outsider.context, {
      teamId: fixture.teamId,
      uploadIds: uploads.map((upload) => upload.id)
    })).rejects.toMatchObject({ code: "permission_denied" });

    // Naming their own team cannot reach the foreign upload id either.
    await expect(fixture.importAnalysis.readEnterpriseUploadContentsAsync(outsider.context, {
      teamId: outsider.context.teams[0].id,
      uploadIds: uploads.map((upload) => upload.id)
    })).rejects.toMatchObject({ code: "upload_not_found" });
  });

  it("returns the exact registered bytes for an upload it can read", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const body = JSON.stringify(fixture.index.lessonStudySenaContract);
    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-import.json",
      contentType: "application/json",
      body
    }]);

    const contents = await fixture.importAnalysis.readEnterpriseUploadContentsAsync(fixture.context, {
      teamId: fixture.teamId,
      uploadIds: uploads.map((upload) => upload.id)
    });

    expect(contents).toHaveLength(1);
    expect(contents[0].bytes.toString("utf8")).toBe(body);
    expect(contents[0].upload.id).toBe(uploads[0].id);
    expect(contents[0].upload.storageEncoding).toBe("sena-upload-aes-256-gcm-envelope/v1");
    // The blob on disk stays the envelope: nothing spilled plaintext.
    expect(readFileSync(path.join(fixture.enterpriseDbDir, uploads[0].storagePath), "utf8")).not.toContain("lesson");
  });

  it("drains a queued import job whose payload reproduces the enqueued payload hash", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const uploads = await fixture.registerUploads([{
      name: "worker-runtime-import.json",
      contentType: "application/json",
      body: JSON.stringify(fixture.index.lessonStudySenaContract)
    }]);
    const uploadIds = uploads.map((upload) => upload.id);
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "import",
      teamId: fixture.teamId,
      actorUserId: fixture.context.user.id,
      payload: {
        action: "run-import",
        teamId: fixture.teamId,
        uploadIds,
        persistProject: false,
        includeRuntimeBundle: false
      },
      payloadSummary: {
        source: "upload",
        fileCount: 1,
        uploadIds,
        persist: false,
        includeRuntimeBundle: false,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const report = await fixture.runtime.drainEnterpriseServerJobQueue({ limit: 10 });

    expect(report.outcomes.find((outcome) => outcome.jobId === job.id)?.status).toBe("succeeded");

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("succeeded");
  });

  it("drains a queued analysis job with a signed matching expectedVersion and updates that version", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload: {
        action: "run-analysis",
        teamId: fixture.teamId,
        projectId: fixture.project.id,
        projectVersion: fixture.project.currentVersion,
        title: fixture.project.title,
        includeRuntimeBundle: false,
        persist: true,
        updateProject: true,
        expectedVersion: fixture.project.currentVersion
      },
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        expectedVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: true,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const report = await fixture.runtime.drainEnterpriseServerJobQueue({ limit: 10 });

    expect(report.succeeded).toBe(1);
    expect(report.outcomes.find((outcome) => outcome.jobId === job.id)).toEqual(expect.objectContaining({
      status: "succeeded",
      result: expect.objectContaining({ persistedProjectId: fixture.project.id })
    }));

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("succeeded");
    expect(fixture.enterprise.readEnterpriseDb().projects.find(
      (candidate: { id: string }) => candidate.id === fixture.project.id
    )?.currentVersion).toBe(fixture.project.currentVersion + 1);
  });

  it("runs a locally polled non-persisting analysis from its retained revision after the current project advances", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    await fixture.enterprise.updateEnterpriseProjectAsync(fixture.context, fixture.project.id, {
      expectedVersion: fixture.project.currentVersion,
      snapshot: structuredClone(fixture.snapshot)
    });
    const runsBefore = await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    });
    const report = await fixture.runtime.drainEnterpriseServerJobQueue({ limit: 10 });

    expect(report).toEqual(expect.objectContaining({
      scanned: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0
    }));
    expect(report.outcomes.find((outcome) => outcome.jobId === job.id)).toEqual(expect.objectContaining({
      status: "succeeded",
      jobStatus: "succeeded",
      attempts: 1
    }));
    await expect(fixture.queue.getEnterpriseServerJob(job.id)).resolves.toEqual(expect.objectContaining({
      status: "succeeded",
      lifecycle: expect.objectContaining({ attempts: 1 })
    }));
    expect((await fixture.importAnalysis.listEnterpriseAnalysisRunsAsync(fixture.context, {
      teamId: fixture.teamId
    })).length).toBe(runsBefore.length + 1);
  });

  it("refuses to drain a job whose payload cannot be reproduced from the job store", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;

    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload: {
        action: "run-analysis",
        teamId: fixture.teamId,
        projectId: fixture.project.id,
        projectVersion: fixture.project.currentVersion,
        title: fixture.project.title,
        // Not recoverable from payloadSummary: the drain path must refuse
        // rather than run a different analysis than the one that was queued.
        buildOptions: { stanzaWindow: 4 },
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true
      },
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });

    const report = await fixture.runtime.drainEnterpriseServerJobQueue({ limit: 10 });

    expect(report.succeeded).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.outcomes.find((outcome) => outcome.jobId === job.id)).toEqual(expect.objectContaining({
      status: "failed",
      jobStatus: "failed",
      attempts: 0,
      retryable: false,
      errorCode: "server_job_worker_payload_not_reproducible"
    }));

    const stored = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(stored.status).toBe("failed");
    expect(stored.lifecycle.attempts).toBe(0);
    expect(stored.lifecycle.retryable).toBe(false);
    expect(stored.lifecycle.lastErrorCode).toBe("server_job_worker_payload_not_reproducible");
  });

  /**
   * The reason withSenaImportDatasetMetadata lives in import-adapters.ts instead
   * of in the import route beside its only other caller.
   *
   * Queueing is meant to be a scheduling decision, not a semantic one: the same
   * file with the same dataGovernance block has to land the same dataset either
   * way. projectSnapshotSha256 is the sharpest place to assert that, because it
   * hashes the whole snapshot the analysis run was built from — so it moves if
   * the derived consent/retention/pseudonymization/codebook metadata moves, and
   * it moved for real while the route and the worker each kept their own copy of
   * the derivation.
   *
   * The clock is frozen only because buildSenaAnalysisRun stamps generatedAt from
   * the wall clock when the caller does not supply one, and neither caller does;
   * without that the two hashes would differ on the timestamp alone and the
   * assertion would say nothing about the metadata.
   */
  it("lands the same project snapshot for a queued import as the synchronous route does for the same file and governance block", async () => {
    enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-job-worker-import-parity-"));
    let sessionToken = "";
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-15T09:30:00.000Z"));
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
    vi.doMock("@/lib/sena/import-adapters", async () => await import("../import-adapters"));
    vi.doMock("@/lib/sena/analysis-run", async () => await import("../analysis-run"));

    try {
      const enterprise = await import("../enterprise");
      const importAnalysis = await import("../enterprise/import-analysis");
      const queue = await import("../enterprise/server-job-queue");
      const runtime = await import("../enterprise/server-job-worker-runtime");

      const registered = enterprise.registerEnterpriseUser({
        name: "Import Parity Owner",
        email: "import-parity-owner@example.edu",
        password: "sena-secure-123",
        organization: "Import Parity Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const teamId = registered.context.teams[0].id;

      // Byte-identical inputs down the two paths, including the file name: the
      // adapters prefix their warnings with it, and those warnings ride on the
      // dataset the snapshot is built from.
      const fileName = "parity-import.json";
      const fileBody = JSON.stringify(parityImportContract);
      const title = "Import Parity Project";

      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const form = new FormData();
      form.set("teamId", teamId);
      form.set("action", "create-project");
      form.set("title", title);
      form.set("dataGovernance", JSON.stringify(parityDataGovernance));
      form.append("files", new File([fileBody], fileName, { type: "application/json" }));

      const route = await import("../../../app/api/sena/import/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
        method: "POST",
        headers: {
          "x-sena-csrf-token": csrf.token
        },
        body: form
      }));
      const direct = await response.json() as {
        dataset?: {
          metadata?: {
            datasetVersion?: string;
            consent?: { instrument?: string; date?: string; scope?: string };
            retention?: { policy?: string };
            pseudonymization?: { personIdPolicy?: string; rosterMapping?: string };
          };
        };
      };
      expect(response.status).toBe(201);

      // Not a vacuous pin: the direct import really did derive the metadata, so
      // the hash below is a hash of a governed dataset rather than of a dataset
      // the derivation declined to touch.
      expect(direct.dataset?.metadata?.consent).toEqual({
        instrument: parityDataGovernance.irbApprovalId,
        date: "2026-08-10",
        scope: parityDataGovernance.consentScope
      });
      expect(direct.dataset?.metadata?.retention?.policy).toBe(parityDataGovernance.retentionPolicy);
      expect(direct.dataset?.metadata?.pseudonymization).toEqual({
        personIdPolicy: "opaque",
        rosterMapping: "not-stored"
      });
      const directSnapshotSha256 = response.headers.get("x-sena-project-snapshot-sha256");
      expect(directSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);

      const uploads = await importAnalysis.createEnterpriseUploadsWithPostgresMirrorAsync(registered.context, {
        teamId,
        files: [{
          name: fileName,
          contentType: "application/json",
          bytes: Buffer.from(fileBody, "utf8")
        }]
      });
      const uploadIds = uploads.map((upload) => upload.id);
      const payload = {
        action: "run-import",
        teamId,
        uploadIds,
        persistProject: true,
        title,
        includeRuntimeBundle: false,
        dataGovernance: parityDataGovernance
      };
      const job = await queue.enqueueEnterpriseServerJob({
        kind: "import",
        teamId,
        actorUserId: registered.context.user.id,
        payload,
        payloadSummary: {
          source: "upload",
          fileCount: uploadIds.length,
          uploadIds,
          persist: true,
          includeRuntimeBundle: false,
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true
        }
      });
      const outcome = await runtime.runEnterpriseServerJob({ job, workerPayload: payload });

      expect(outcome.errorCode).toBeUndefined();
      expect(outcome.status).toBe("succeeded");
      expect(outcome.result?.projectSnapshotSha256).toBe(directSnapshotSha256);
    } finally {
      delete process.env.SENA_JOB_QUEUE_ADAPTER;
      delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
      vi.useRealTimers();
      vi.doUnmock("next/headers");
      vi.doUnmock("@/lib/sena/enterprise");
      vi.doUnmock("@/lib/sena/api-helpers");
      vi.doUnmock("@/lib/sena/import-adapters");
      vi.doUnmock("@/lib/sena/analysis-run");
    }
  }, 30_000);

  it("reclaims an expired running-job lease so a crash cannot strand EvidenceFlow forever", async () => {
    const fixture = await workerFixture();
    enterpriseDbDir = fixture.enterpriseDbDir;
    const payload = {
      action: "run-analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      projectVersion: fixture.project.currentVersion,
      title: fixture.project.title,
      includeRuntimeBundle: false,
      persist: false,
      updateProject: true
    };
    const job = await fixture.queue.enqueueEnterpriseServerJob({
      kind: "analysis",
      teamId: fixture.teamId,
      projectId: fixture.project.id,
      actorUserId: fixture.context.user.id,
      payload,
      payloadSummary: {
        source: "project",
        projectVersion: fixture.project.currentVersion,
        includeRuntimeBundle: false,
        persist: false,
        updateProject: true,
        hasInlineSnapshot: false,
        hasInlineDataset: false,
        payloadValuesExcluded: true
      }
    });
    const claimed = await fixture.queue.claimEnterpriseServerJob({
      jobId: job.id,
      workerRunId: "worker_run_crashed_before_terminal_callback"
    });
    expect(claimed.claimed).toBe(true);
    if (!claimed.claimed) throw new Error("expected running job claim");
    expect(claimed.job.lifecycle.leaseExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const recovery = await fixture.queue.recoverExpiredEnterpriseServerJobs({
      kinds: ["analysis"],
      observedAt: new Date(Date.parse(claimed.job.lifecycle.leaseExpiresAt!) + 1).toISOString(),
      limit: 10
    });

    expect(recovery).toMatchObject({ inspected: 1, requeued: 1, deadLettered: 0 });
    const recovered = await fixture.queue.getEnterpriseServerJob(job.id);
    expect(recovered).toEqual(expect.objectContaining({
      status: "queued",
      lifecycle: expect.objectContaining({
        attempts: 1,
        statusReason: "server-job-worker-lease-expired-requeued"
      })
    }));
    expect(recovered.lifecycle.workerRunId).toBeUndefined();
    expect(recovered.lifecycle.leaseExpiresAt).toBeUndefined();
  });
});
