import { describe, expect, it } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "../workflow/canonical";
import { researchEvidenceGraphV1 } from "../workflow/definitions";
import { initialSenaWorkflowGraphState } from "../workflow/graph-runtime";
import {
  createSenaWorkflowGraphNodeExecutor,
  type SenaWorkflowNodeOperationAdapter,
  type SenaWorkflowNodeStore
} from "../workflow/node-executor";
import type {
  SenaWorkflowApproval,
  SenaWorkflowArtifact,
  SenaWorkflowRun,
  SenaWorkflowRunEvents,
  SenaWorkflowStepReceipt
} from "../workflow/types";

function node(nodeId: string) {
  const found = researchEvidenceGraphV1.nodes.find((candidate) => candidate.id === nodeId);
  if (!found) throw new Error(`Missing fixture node ${nodeId}`);
  return found;
}

function runFixture(): SenaWorkflowRun {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: "workflow-run-node-executor",
    version: 1,
    kind: "research-evidence",
    definitionVersion: "v1",
    definitionHash: researchEvidenceGraphV1.definitionHash,
    mode: "shadow",
    teamId: "team-node-executor",
    projectId: "project-node-executor",
    projectRevisionId: "revision-node-executor",
    sourceBindingDigest: "a".repeat(64),
    codeSha: "b".repeat(40),
    configDigest: "c".repeat(64),
    status: "running",
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
    startIdempotencyKey: "start-node-executor",
    startPayloadDigest: "d".repeat(64),
    createdByUserId: "user-node-executor",
    receiptSequence: 0,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z"
  };
}

function inMemoryStore(run: SenaWorkflowRun) {
  const receipts: SenaWorkflowStepReceipt[] = [];
  const approvals: SenaWorkflowApproval[] = [];
  const artifacts: SenaWorkflowArtifact[] = [];
  const store: SenaWorkflowNodeStore = {
    async getRun(runId, teamId) {
      return runId === run.id && (!teamId || teamId === run.teamId) ? run : null;
    },
    async runEvents(runId, teamId): Promise<SenaWorkflowRunEvents> {
      if (runId !== run.id || teamId !== run.teamId) throw new Error("missing run");
      return { run, commands: [], receipts: [...receipts], approvals: [...approvals], artifacts: [...artifacts] };
    },
    async appendStepReceipt(draft) {
      const duplicate = receipts.find((receipt) => receipt.effectKey === draft.effectKey);
      if (duplicate) return { created: false, receipt: duplicate };
      const receipt: SenaWorkflowStepReceipt = {
        ...draft,
        sequence: receipts.length + 1,
        previousAuditChainHead: receipts.at(-1)?.auditChainHead,
        auditChainHead: senaWorkflowDigest({ draft, sequence: receipts.length + 1 })
      };
      receipts.push(receipt);
      return { created: true, receipt };
    },
    async appendArtifact(artifact) {
      const duplicate = artifacts.find((candidate) => candidate.id === artifact.id);
      if (!duplicate) artifacts.push(artifact);
      return { created: !duplicate, artifact: duplicate ?? artifact, run };
    }
  };
  return { store, receipts, approvals, artifacts };
}

function graphState(run: SenaWorkflowRun) {
  return initialSenaWorkflowGraphState({
    runId: run.id,
    kind: run.kind,
    teamId: run.teamId,
    definitionHash: run.definitionHash,
    sourceBindingDigest: run.sourceBindingDigest,
    codeSha: run.codeSha,
    configDigest: run.configDigest,
    claimBoundary: run.claimBoundary
  });
}

describe("SENA authoritative workflow node executor", () => {
  it("reuses the exact receipt before repeating a deterministic node effect", async () => {
    const run = runFixture();
    const memory = inMemoryStore(run);
    let materializations = 0;
    const operations: SenaWorkflowNodeOperationAdapter = {
      async materialize(input) {
        materializations += 1;
        return {
          outputDigest: senaWorkflowDigest({ effectKey: input.effectKey }),
          claimBoundary: "inference-ready",
          evidenceLayers: { source: "passed" }
        };
      },
      async ensureServerJob() {
        throw new Error("unexpected server job");
      },
      async readServerJob() {
        throw new Error("unexpected server job read");
      }
    };
    const executor = createSenaWorkflowGraphNodeExecutor({
      store: memory.store,
      operations,
      now: () => "2026-08-28T00:00:01.000Z"
    });
    const input = {
      state: graphState(run),
      node: node("bind-source"),
      inputDigest: "e".repeat(64),
      predecessorReceiptHashes: []
    };

    const first = await executor.execute(input);
    const replayed = await executor.execute(input);

    expect(first).toEqual(replayed);
    expect(first.kind).toBe("completed");
    expect(first).toMatchObject({ claimBoundary: "inference-ready", evidenceLayers: { source: "passed" } });
    expect(materializations).toBe(1);
    expect(memory.receipts).toHaveLength(1);
    expect(memory.receipts[0].effectKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reuses one server job across interrupt replay and trusts terminal store state instead of resume claims", async () => {
    const run = runFixture();
    const memory = inMemoryStore(run);
    let jobStatus: "queued" | "succeeded" = "queued";
    let createdJobs = 0;
    const jobs = new Map<string, string>();
    const operations: SenaWorkflowNodeOperationAdapter = {
      async materialize(input) {
        return { outputDigest: senaWorkflowDigest({ completedJob: input.job?.id }) };
      },
      async ensureServerJob(input) {
        let jobId = jobs.get(input.effectKey);
        if (!jobId) {
          jobId = "server_job_workflow_1";
          jobs.set(input.effectKey, jobId);
          createdJobs += 1;
        }
        return { id: jobId, status: jobStatus };
      },
      async readServerJob(input) {
        return { id: input.jobId, status: jobStatus };
      }
    };
    const executor = createSenaWorkflowGraphNodeExecutor({
      store: memory.store,
      operations,
      now: () => "2026-08-28T00:00:02.000Z"
    });
    const input = {
      state: graphState(run),
      node: node("import-cleaning"),
      inputDigest: "f".repeat(64),
      predecessorReceiptHashes: ["1".repeat(64)]
    };

    const firstWait = await executor.execute(input);
    const replayedWait = await executor.execute(input);
    expect(firstWait).toEqual(replayedWait);
    expect(firstWait).toMatchObject({ kind: "waiting-job", jobId: "server_job_workflow_1" });
    expect(createdJobs).toBe(1);
    expect(memory.receipts).toHaveLength(0);

    jobStatus = "succeeded";
    const completed = await executor.execute({
      ...input,
      resume: {
        interruptId: firstWait.kind === "waiting-job" ? firstWait.interruptId : "wrong",
        jobId: "server_job_workflow_1",
        status: "failed"
      }
    });
    expect(completed.kind).toBe("completed");
    expect(createdJobs).toBe(1);
    expect(memory.receipts).toHaveLength(1);
    expect(memory.receipts[0].jobId).toBe("server_job_workflow_1");
  });

  it("accepts a human resume only when an authoritative digest-bound approval exists", async () => {
    const run = runFixture();
    const memory = inMemoryStore(run);
    const operations: SenaWorkflowNodeOperationAdapter = {
      async materialize(input) {
        return { outputDigest: senaWorkflowDigest({ approvalId: input.approval?.id }) };
      },
      async ensureServerJob() {
        throw new Error("unexpected server job");
      },
      async readServerJob() {
        throw new Error("unexpected server job read");
      }
    };
    const executor = createSenaWorkflowGraphNodeExecutor({
      store: memory.store,
      operations,
      now: () => "2026-08-28T00:00:03.000Z"
    });
    const input = {
      state: graphState(run),
      node: node("data-governance-preflight"),
      inputDigest: "2".repeat(64),
      predecessorReceiptHashes: ["3".repeat(64)]
    };
    const waiting = await executor.execute(input);
    expect(waiting.kind).toBe("waiting-human");
    if (waiting.kind !== "waiting-human") throw new Error("expected waiting-human");

    const withoutApproval = await executor.execute({
      ...input,
      resume: {
        interruptId: waiting.interruptId,
        decision: "approve",
        decisionDigest: "4".repeat(64)
      }
    });
    expect(withoutApproval).toMatchObject({
      kind: "blocked",
      blocker: { code: "workflow_approval_evidence_missing", retryable: false }
    });

    memory.approvals.push({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowApproval,
      id: "workflow-approval-1",
      runId: run.id,
      nodeId: input.node.id,
      interruptId: waiting.interruptId,
      expectedVersion: run.version,
      actorUserIdHash: "5".repeat(64),
      actorRole: "pi",
      decision: "approve",
      inputDigest: input.inputDigest,
      candidateOutputDigest: waiting.candidateOutputDigest,
      decisionDigest: "4".repeat(64),
      createdAt: "2026-08-28T00:00:03.000Z"
    });
    const completed = await executor.execute({
      ...input,
      resume: {
        interruptId: waiting.interruptId,
        decision: "approve",
        decisionDigest: "4".repeat(64)
      }
    });
    expect(completed).toMatchObject({
      kind: "completed",
      approvalReferences: ["workflow-approval-1"]
    });
    expect(memory.receipts).toHaveLength(1);
  });

  it("enters a durable blocked interrupt before approval when a human-gate preflight fails closed", async () => {
    const run = runFixture();
    const memory = inMemoryStore(run);
    let materializations = 0;
    const operations: SenaWorkflowNodeOperationAdapter = {
      async prepareHumanGate() {
        return {
          candidateOutputDigest: "6".repeat(64),
          blocker: {
            code: "workflow_data_governance_incomplete",
            message: "Immutable governance evidence is incomplete; fork from a remediated revision.",
            retryable: false
          }
        };
      },
      async materialize() {
        materializations += 1;
        return { outputDigest: "7".repeat(64) };
      },
      async ensureServerJob() {
        throw new Error("unexpected server job");
      },
      async readServerJob() {
        throw new Error("unexpected server job read");
      }
    };
    const executor = createSenaWorkflowGraphNodeExecutor({ store: memory.store, operations });
    const result = await executor.execute({
      state: graphState(run),
      node: node("data-governance-preflight"),
      inputDigest: "8".repeat(64),
      predecessorReceiptHashes: ["9".repeat(64)]
    });

    expect(result).toMatchObject({
      kind: "blocked",
      blocker: {
        code: "workflow_data_governance_incomplete",
        retryable: false
      }
    });
    expect(materializations).toBe(0);
    expect(memory.receipts).toHaveLength(0);
  });
});
