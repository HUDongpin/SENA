import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SenaWorkflowNodeStore } from "../workflow/node-executor";
import type { SenaWorkflowRun, SenaWorkflowRunEvents } from "../workflow/types";

const envNames = [
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_MAX_ATTEMPTS"
];

describe("SENA EvidenceFlow server-job operation adapter", () => {
  let dbDir: string | undefined;

  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    if (dbDir) rmSync(dbDir, { recursive: true, force: true });
    dbDir = undefined;
    vi.resetModules();
  });

  it("reuses one deterministic analysis job and materializes its durable result receipt after worker execution", async () => {
    dbDir = mkdtempSync(path.join(tmpdir(), "sena-workflow-job-operations-"));
    process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
    process.env.SENA_JOB_QUEUE_MAX_ATTEMPTS = "3";

    const enterprise = await import("../enterprise");
    const index = await import("../index");
    const canonical = await import("../workflow/canonical");
    const definitions = await import("../workflow/definitions");
    const projects = await import("../enterprise/team-project");
    const operationsModule = await import("../workflow/server-job-operations");
    const worker = await import("../enterprise/server-job-worker-runtime");
    const queue = await import("../enterprise/server-job-queue");
    const uploads = await import("../enterprise/import-analysis");

    const registered = enterprise.registerEnterpriseUser({
      name: "EvidenceFlow Worker Owner",
      email: "evidenceflow-worker@example.edu",
      password: "sena-secure-123",
      organization: "EvidenceFlow Lab",
      plan: "lab"
    });
    const teamId = registered.context.teams[0].id;
    const imported = index.importSenaJsonContract(index.lessonStudySenaContract);
    const model = index.buildSenaModel(imported.dataset);
    const snapshot = index.buildSenaProjectSnapshot(model, {
      title: "EvidenceFlow Worker Source",
      generatedAt: "2026-08-28T00:00:00.000Z",
      sourceDataset: imported.dataset
    });
    const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
      teamId,
      title: "EvidenceFlow Worker Project",
      snapshot
    });
    const revisionSource = await projects.getEnterpriseProjectRevisionSourceReadOnlyAsync(
      registered.context,
      project.id,
      project.currentVersion
    );
    const binding = projects.buildEnterpriseProjectEvidenceBinding(revisionSource.sourceProject);
    const uploadBindings = { import: [], reliability: [] };
    const sourceEvidence = {
      projectId: project.id,
      projectRevisionId: revisionSource.revision.id,
      projectVersion: revisionSource.revision.version,
      snapshotSha256: binding.snapshotSha256,
      researchSourceClass: "fixture" as const,
      uploadBindings
    };
    const sourceBindingDigest = canonical.senaWorkflowDigest({
      kind: "research-evidence",
      teamId,
      ...sourceEvidence
    });
    const startPayload = { action: "start", parameters: {}, sourceEvidence };
    const run: SenaWorkflowRun = {
      schemaVersion: "sena-workflow-run/v1",
      id: "workflow_run_job_operations_1",
      version: 3,
      kind: "research-evidence",
      definitionVersion: "v1",
      definitionHash: definitions.researchEvidenceGraphV1.definitionHash,
      mode: "shadow",
      teamId,
      projectId: project.id,
      projectRevisionId: revisionSource.revision.id,
      researchSourceClass: "fixture",
      sourceBindingDigest,
      codeSha: "a".repeat(40),
      configDigest: canonical.senaWorkflowDigest({ parameters: {} }),
      status: "running",
      currentNodeId: "fusion-analysis",
      attempt: 1,
      blockers: [],
      jobReferences: [],
      artifactReferences: [],
      approvalReferences: [],
      claimBoundary: "exploratory-only",
      evidenceLayers: {
        source: "passed",
        local: "running",
        ci: "not-run",
        merged: "not-run",
        deployed: "not-run",
        live: "not-run"
      },
      startIdempotencyKey: "workflow-job-operations-start",
      startPayloadDigest: canonical.senaWorkflowDigest(startPayload),
      createdByUserId: registered.context.user.id,
      receiptSequence: 1,
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:01.000Z"
    };
    const events: SenaWorkflowRunEvents = {
      run,
      commands: [{
        id: "workflow_command_job_operations_start",
        runId: run.id,
        kind: "start",
        expectedVersion: 1,
        idempotencyKey: run.startIdempotencyKey,
        payloadDigest: canonical.senaWorkflowDigest(startPayload),
        payload: startPayload,
        status: "completed",
        attempts: 1,
        availableAt: run.createdAt,
        completedAt: run.updatedAt,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt
      }],
      receipts: [],
      approvals: [],
      artifacts: []
    };
    const store = {
      async getRun() { return run; },
      async runEvents() { return events; },
      async appendStepReceipt() { throw new Error("not used"); },
      async appendArtifact() { throw new Error("not used"); }
    } as unknown as SenaWorkflowNodeStore;
    const adapter = operationsModule.createSenaWorkflowServerJobOperationAdapter({ store });
    const node = definitions.researchEvidenceGraphV1.nodes.find((candidate) => candidate.id === "fusion-analysis")!;
    const effectKey = canonical.senaWorkflowDigest({ runId: run.id, nodeId: node.id, inputDigest: "b".repeat(64), effect: node.effect });
    const operation = {
      run,
      state: {} as never,
      node,
      inputDigest: "b".repeat(64),
      effectKey,
      predecessorReceiptHashes: ["c".repeat(64)]
    };

    const first = await adapter.ensureServerJob(operation);
    const replayed = await adapter.ensureServerJob(operation);
    expect(first.id).toBe(`server_job_${effectKey.slice(0, 24)}`);
    expect(replayed).toEqual(first);
    expect((await queue.listEnterpriseServerJobs({ teamId })).summary.total).toBe(1);

    const drained = await worker.drainEnterpriseServerJobQueue({ limit: 1, teamId });
    expect(drained.outcomes[0]).toMatchObject({ status: "succeeded", jobId: first.id });
    const terminal = await adapter.readServerJob({ ...operation, jobId: first.id });
    expect(terminal).toMatchObject({
      status: "succeeded",
      outputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      artifactReferences: [expect.stringMatching(/^analysis_/)]
    });
    const materialized = await adapter.materialize({ ...operation, job: terminal });
    expect(materialized.outputDigest).toBe(terminal.outputDigest);
    expect(materialized.jobReferences).toEqual([first.id]);
    expect(materialized.artifacts).toEqual([
      expect.objectContaining({
        nodeId: "fusion-analysis",
        filename: "sena-workflow-fusion-analysis-job-result.json",
        schemaVersion: "sena-enterprise-server-job-result/v1",
        sha256: terminal.outputDigest,
        storageReference: `server-job:${first.id}#resultReceipt`
      })
    ]);

    const publicationNode = definitions.researchEvidenceGraphV1.nodes.find((candidate) => (
      candidate.id === "publication-export"
    ))!;
    const publicationInputDigest = "d".repeat(64);
    const publicationEffectKey = canonical.senaWorkflowDigest({
      runId: run.id,
      nodeId: publicationNode.id,
      inputDigest: publicationInputDigest,
      effect: publicationNode.effect
    });
    const publicationOperation = {
      ...operation,
      node: publicationNode,
      inputDigest: publicationInputDigest,
      effectKey: publicationEffectKey
    };
    const publicationJob = await adapter.ensureServerJob(publicationOperation);
    const publicationQueued = await queue.getEnterpriseServerJob(publicationJob.id);
    expect(publicationQueued?.payloadSummary).toMatchObject({
      publicationScope: "exploratory-only",
      format: "package",
      projectVersion: revisionSource.revision.version
    });
    const publicationDrain = await worker.drainEnterpriseServerJobQueue({ limit: 1, teamId });
    expect(publicationDrain.outcomes[0]).toMatchObject({
      status: "succeeded",
      jobId: publicationJob.id,
      result: {
        publicationBoundaryManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    });
    const publicationTerminal = await adapter.readServerJob({
      ...publicationOperation,
      jobId: publicationJob.id
    });
    expect(publicationTerminal).toMatchObject({
      status: "succeeded",
      artifactReferences: [expect.stringMatching(/^upload_[a-f0-9]{24}$/)]
    });
    const [publicationArtifact] = await uploads.readEnterpriseUploadContentsAsync(registered.context, {
      teamId,
      uploadIds: publicationTerminal.artifactReferences ?? []
    });
    const publicationPackage = JSON.parse(publicationArtifact.bytes.toString("utf8")) as Record<string, unknown>;
    expect(publicationPackage).toMatchObject({
      schemaVersion: "sena-workflow-exploratory-publication/v1",
      claimBoundary: "exploratory-only",
      source: { projectId: project.id, projectRevisionId: revisionSource.revision.id },
      exclusions: { rawDatasetExcluded: true, credentialsExcluded: true }
    });
    expect(publicationPackage).not.toHaveProperty("dataset");
  });
});
