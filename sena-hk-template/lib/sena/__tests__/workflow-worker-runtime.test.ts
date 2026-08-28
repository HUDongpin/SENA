import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "../workflow/canonical";
import { researchEvidenceGraphV1 } from "../workflow/definitions";
import { createSenaWorkflowGraphNodeExecutor, type SenaWorkflowNodeOperationAdapter } from "../workflow/node-executor";
import {
  createSenaWorkflowWorkerRuntime,
  type SenaWorkflowWorkerStore
} from "../workflow/worker-runtime";
import type {
  SenaWorkflowApproval,
  SenaWorkflowCommand,
  SenaWorkflowRun,
  SenaWorkflowRunEvents,
  SenaWorkflowStepReceipt
} from "../workflow/types";

function runtimeFixture() {
  let run: SenaWorkflowRun = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: "workflow-worker-run-1",
    version: 1,
    kind: "research-evidence",
    definitionVersion: "v1",
    definitionHash: researchEvidenceGraphV1.definitionHash,
    mode: "shadow",
    teamId: "team-workflow-worker",
    projectId: "project-workflow-worker",
    projectRevisionId: "revision-workflow-worker",
    sourceBindingDigest: "a".repeat(64),
    codeSha: "b".repeat(40),
    configDigest: "c".repeat(64),
    status: "queued",
    currentNodeId: "bind-source",
    attempt: 1,
    blockers: [],
    jobReferences: [],
    artifactReferences: [],
    approvalReferences: [],
    claimBoundary: "exploratory-only",
    evidenceLayers: {
      source: "not-run",
      local: "not-run",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    },
    startIdempotencyKey: "start-worker-run-1",
    startPayloadDigest: "d".repeat(64),
    createdByUserId: "user-worker-run-1",
    receiptSequence: 0,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z"
  };
  const commands: SenaWorkflowCommand[] = [];
  const receipts: SenaWorkflowStepReceipt[] = [];
  const approvals: SenaWorkflowApproval[] = [];
  let auditHead: string | undefined;
  let sequence = 0;

  function enqueue(kind: SenaWorkflowCommand["kind"], payload: Record<string, unknown>, id: string) {
    const createdAt = `2026-08-28T00:00:${String(commands.length + 1).padStart(2, "0")}.000Z`;
    const command: SenaWorkflowCommand = {
      id,
      runId: run.id,
      kind,
      expectedVersion: run.version,
      idempotencyKey: `idempotency-${id}`,
      payloadDigest: senaWorkflowDigest(payload),
      payload,
      status: "pending",
      attempts: 0,
      availableAt: createdAt,
      createdAt,
      updatedAt: createdAt
    };
    commands.push(command);
    if (kind !== "start") run = { ...run, version: run.version + 1, updatedAt: createdAt };
    return command;
  }

  const store: SenaWorkflowWorkerStore = {
    async getRun(runId, teamId) {
      return runId === run.id && (!teamId || teamId === run.teamId) ? run : null;
    },
    async runEvents(runId, teamId): Promise<SenaWorkflowRunEvents> {
      if (runId !== run.id || teamId !== run.teamId) throw new Error("missing run");
      return { run, commands: [...commands], receipts: [...receipts], approvals: [...approvals], artifacts: [] };
    },
    async appendStepReceipt(draft) {
      const duplicate = receipts.find((receipt) => receipt.effectKey === draft.effectKey);
      if (duplicate) return { created: false, receipt: duplicate };
      sequence += 1;
      const previousAuditChainHead = auditHead;
      auditHead = senaWorkflowDigest({ draft, sequence, previousAuditChainHead });
      const receipt: SenaWorkflowStepReceipt = {
        ...draft,
        sequence,
        previousAuditChainHead,
        auditChainHead: auditHead
      };
      receipts.push(receipt);
      run = { ...run, receiptSequence: sequence, auditChainHead: auditHead };
      return { created: true, receipt };
    },
    async appendArtifact(artifact) {
      return { created: true, artifact, run };
    },
    async claimNextCommand(input) {
      const command = commands.find((candidate) => candidate.status === "pending");
      if (!command) return null;
      command.status = "claimed";
      command.claimedBy = input.workerId;
      command.claimedAt = "2026-08-28T00:01:00.000Z";
      command.claimExpiresAt = "2026-08-28T00:02:00.000Z";
      command.attempts += 1;
      return { ...command };
    },
    async transitionRun(input) {
      if (input.expectedVersion !== run.version) throw new Error("version conflict");
      run = {
        ...run,
        ...input.patch,
        version: run.version + 1,
        updatedAt: input.updatedAt
      };
      return run;
    },
    async settleClaimedCommand(input) {
      const command = commands.find((candidate) => candidate.id === input.commandId);
      if (!command || command.status !== "claimed" || command.claimedBy !== input.workerId) {
        throw new Error("claim conflict");
      }
      if (input.expectedRunVersion !== run.version) throw new Error("version conflict");
      run = {
        ...run,
        ...input.patch,
        version: run.version + 1,
        updatedAt: input.completedAt
      };
      command.status = "completed";
      command.completedAt = input.completedAt;
      command.updatedAt = input.completedAt;
      return { run, command: { ...command } };
    },
    async failCommand(input) {
      const command = commands.find((candidate) => candidate.id === input.commandId);
      if (!command) throw new Error("missing command");
      command.status = input.retryable ? "pending" : "failed";
      command.errorClass = input.errorClass;
      command.errorHash = input.errorHash;
      command.updatedAt = input.failedAt;
      return { ...command };
    }
  };
  return {
    store,
    enqueue,
    receipts,
    approvals,
    commands,
    get run() {
      return run;
    }
  };
}

describe("SENA durable workflow worker runtime", () => {
  it("persists a human wait, resumes from the same thread, and survives worker recreation before a job terminal event", async () => {
    const fixture = runtimeFixture();
    const jobStatuses = new Map<string, "queued" | "succeeded">();
    const jobsByEffect = new Map<string, string>();
    let createdJobs = 0;
    const operations: SenaWorkflowNodeOperationAdapter = {
      async materialize(input) {
        return {
          outputDigest: senaWorkflowDigest({
            nodeId: input.node.id,
            approvalId: input.approval?.id,
            jobId: input.job?.id
          })
        };
      },
      async ensureServerJob(input) {
        let id = jobsByEffect.get(input.effectKey);
        if (!id) {
          id = `server_job_worker_${jobsByEffect.size + 1}`;
          jobsByEffect.set(input.effectKey, id);
          jobStatuses.set(id, "queued");
          createdJobs += 1;
        }
        return { id, status: jobStatuses.get(id)! };
      },
      async readServerJob(input) {
        return { id: input.jobId, status: jobStatuses.get(input.jobId)! };
      }
    };
    const checkpointer = new MemorySaver();
    let capturedError: unknown;
    const nodeExecutor = createSenaWorkflowGraphNodeExecutor({
      store: fixture.store,
      operations,
      now: () => "2026-08-28T00:01:30.000Z"
    });
    fixture.enqueue("start", { action: "start" }, "workflow-command-start");
    const firstWorker = createSenaWorkflowWorkerRuntime({
      store: fixture.store,
      checkpointer,
      nodeExecutor,
      workerId: "workflow-worker-a",
      now: () => "2026-08-28T00:01:30.000Z",
      onError: (error) => {
        capturedError = error;
      }
    });

    const first = await firstWorker.runOnce();
    expect(first.status, JSON.stringify(first)).toBe("processed");
    expect(first).toMatchObject({ status: "processed", run: { status: "waiting_human" } });
    expect(fixture.run.currentNodeId).toBe("data-governance-preflight");
    expect(fixture.run.pendingInterrupt).toMatchObject({ kind: "waiting-human" });
    expect(fixture.commands[0].status).toBe("completed");
    expect(fixture.receipts.map((receipt) => receipt.nodeId)).toEqual(["bind-source"]);

    const waiting = first.status === "processed" ? first.interrupt : undefined;
    if (!waiting || waiting.kind !== "waiting-human") throw new Error("expected human interrupt");
    fixture.approvals.push({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowApproval,
      id: "workflow-approval-worker-1",
      runId: fixture.run.id,
      nodeId: waiting.nodeId,
      interruptId: waiting.interruptId,
      expectedVersion: fixture.run.version,
      actorUserIdHash: "e".repeat(64),
      actorRole: "pi",
      decision: "approve",
      inputDigest: waiting.inputDigest,
      candidateOutputDigest: waiting.candidateOutputDigest,
      decisionDigest: "f".repeat(64),
      createdAt: "2026-08-28T00:02:00.000Z"
    });
    fixture.enqueue("resume", {
      interruptId: waiting.interruptId,
      decision: "approve",
      decisionDigest: "f".repeat(64)
    }, "workflow-command-resume");

    const resumed = await firstWorker.runOnce();
    expect(resumed.status, `${JSON.stringify(resumed)} cause=${String(capturedError)}`).toBe("processed");
    expect(resumed).toMatchObject({ status: "processed", run: { status: "waiting_job" } });
    expect(fixture.run.currentNodeId).toBe("import-cleaning");
    expect(fixture.run.pendingInterrupt).toMatchObject({ kind: "waiting-job" });
    expect(createdJobs).toBe(1);
    expect(fixture.receipts.filter((receipt) => receipt.nodeId === "data-governance-preflight")).toHaveLength(1);

    const jobWait = resumed.status === "processed" ? resumed.interrupt : undefined;
    if (!jobWait || jobWait.kind !== "waiting-job") throw new Error("expected job interrupt");
    jobStatuses.set(jobWait.jobId, "succeeded");
    fixture.enqueue("job-terminal", {
      interruptId: jobWait.interruptId,
      jobId: jobWait.jobId,
      status: "succeeded",
      outputDigest: "1".repeat(64)
    }, "workflow-command-job-terminal");

    const restartedWorker = createSenaWorkflowWorkerRuntime({
      store: fixture.store,
      checkpointer,
      nodeExecutor,
      workerId: "workflow-worker-b",
      now: () => "2026-08-28T00:03:00.000Z"
    });
    const afterRestart = await restartedWorker.runOnce();
    expect(afterRestart).toMatchObject({ status: "processed", run: { status: "waiting_job" } });
    expect(fixture.run.currentNodeId).toBe("fusion-analysis");
    expect(createdJobs).toBe(2);
    expect(fixture.receipts.filter((receipt) => receipt.nodeId === "import-cleaning")).toHaveLength(1);
    expect(fixture.commands.every((command) => command.status === "completed")).toBe(true);
  });
});
