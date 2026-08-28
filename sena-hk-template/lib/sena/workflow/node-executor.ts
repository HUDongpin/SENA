import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "./canonical";
import type {
  SenaClaimBoundary,
  SenaEvidenceLayer,
  SenaWorkflowApproval,
  SenaWorkflowArtifact,
  SenaWorkflowBlocker,
  SenaWorkflowNodeManifest,
  SenaWorkflowRun,
  SenaWorkflowRunEvents,
  SenaWorkflowStepReceipt
} from "./types";
import type {
  SenaWorkflowGraphNodeExecutor,
  SenaWorkflowGraphNodeResult,
  SenaWorkflowGraphResume,
  SenaWorkflowGraphState
} from "./graph-runtime";

type EvidenceLayerState = SenaWorkflowRun["evidenceLayers"];

export type SenaWorkflowServerJobState = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead-lettered";
  outputDigest?: string;
  artifactReferences?: string[];
  resultRecordedAt?: string;
};

export type SenaWorkflowNodeMaterialization = {
  outputDigest: string;
  artifacts?: SenaWorkflowArtifact[];
  artifactReferences?: string[];
  jobReferences?: string[];
  approvalReferences?: string[];
  evidenceLayers?: Partial<EvidenceLayerState>;
  claimBoundary?: SenaClaimBoundary;
};

export type SenaWorkflowNodeOperationInput = {
  run: SenaWorkflowRun;
  state: SenaWorkflowGraphState;
  node: SenaWorkflowNodeManifest;
  inputDigest: string;
  effectKey: string;
  predecessorReceiptHashes: string[];
  job?: SenaWorkflowServerJobState;
  approval?: SenaWorkflowApproval;
};

export type SenaWorkflowNodeOperationAdapter = {
  materialize(input: SenaWorkflowNodeOperationInput): Promise<SenaWorkflowNodeMaterialization>;
  prepareHumanGate?(input: SenaWorkflowNodeOperationInput): Promise<{
    candidateOutputDigest: string;
    blocker?: SenaWorkflowBlocker;
  }>;
  ensureServerJob(input: SenaWorkflowNodeOperationInput): Promise<SenaWorkflowServerJobState>;
  readServerJob(input: SenaWorkflowNodeOperationInput & { jobId: string }): Promise<SenaWorkflowServerJobState>;
};

export type SenaWorkflowNodeStore = {
  getRun(runId: string, teamId?: string): Promise<SenaWorkflowRun | null>;
  runEvents(runId: string, teamId: string): Promise<SenaWorkflowRunEvents>;
  appendStepReceipt(
    draft: Omit<SenaWorkflowStepReceipt, "sequence" | "previousAuditChainHead" | "auditChainHead">
  ): Promise<{ created: boolean; receipt: SenaWorkflowStepReceipt }>;
  appendArtifact(artifact: SenaWorkflowArtifact): Promise<{
    created: boolean;
    artifact: SenaWorkflowArtifact;
    run: SenaWorkflowRun;
  }>;
};

function completedFromReceipt(
  events: SenaWorkflowRunEvents,
  receipt: SenaWorkflowStepReceipt
): Extract<SenaWorkflowGraphNodeResult, { kind: "completed" }> {
  const approvalReferences = events.approvals
    .filter((approval) => approval.nodeId === receipt.nodeId && approval.inputDigest === receipt.inputDigest)
    .map((approval) => approval.id);
  return {
    kind: "completed",
    outputDigest: receipt.outputDigest,
    receiptHash: receipt.auditChainHead,
    artifactReferences: receipt.artifactReferences,
    jobReferences: receipt.jobId ? [receipt.jobId] : [],
    approvalReferences,
    evidenceLayers: {
      [receipt.evidenceLayer]: "passed",
      ...(receipt.statePatch?.evidenceLayers ?? {})
    },
    ...(receipt.statePatch?.claimBoundary
      ? { claimBoundary: receipt.statePatch.claimBoundary }
      : {})
  };
}

function blocked(input: {
  interruptId: string;
  inputDigest: string;
  nodeId: string;
  code: string;
  message: string;
  retryable: boolean;
}): Extract<SenaWorkflowGraphNodeResult, { kind: "blocked" }> {
  return {
    kind: "blocked",
    interruptId: input.interruptId,
    inputDigest: input.inputDigest,
    blocker: {
      code: input.code,
      message: input.message,
      nodeId: input.nodeId,
      retryable: input.retryable
    }
  };
}

function stringField(record: SenaWorkflowGraphResume | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function assertBoundRun(run: SenaWorkflowRun, state: SenaWorkflowGraphState) {
  if (
    run.id !== state.runId ||
    run.teamId !== state.teamId ||
    run.kind !== state.kind ||
    run.definitionHash !== state.definitionHash ||
    run.sourceBindingDigest !== state.sourceBindingDigest ||
    run.codeSha !== state.codeSha ||
    run.configDigest !== state.configDigest
  ) {
    throw new Error("SENA workflow node execution does not match the authoritative immutable run binding.");
  }
  if (["cancelled", "superseded", "dead_lettered"].includes(run.status)) {
    throw new Error(`SENA workflow node execution is forbidden for terminal run status ${run.status}.`);
  }
}

function deterministicInterruptId(input: {
  runId: string;
  nodeId: string;
  inputDigest: string;
  kind: "human" | "job" | "blocked";
}) {
  return `workflow_interrupt_${senaWorkflowDigest(input).slice(0, 24)}`;
}

function defaultEvidenceLayers(node: SenaWorkflowNodeManifest): Partial<Record<SenaEvidenceLayer, "passed">> {
  return { [node.evidenceLayer]: "passed" };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function createSenaWorkflowGraphNodeExecutor(input: {
  store: SenaWorkflowNodeStore;
  operations: SenaWorkflowNodeOperationAdapter;
  now?: () => string;
}): SenaWorkflowGraphNodeExecutor {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async execute(execution) {
      const run = await input.store.getRun(execution.state.runId, execution.state.teamId);
      if (!run) throw new Error("SENA workflow run is absent from the authoritative store.");
      assertBoundRun(run, execution.state);

      const effectKey = senaWorkflowDigest({
        runId: run.id,
        nodeId: execution.node.id,
        inputDigest: execution.inputDigest,
        effect: execution.node.effect
      });
      let events = await input.store.runEvents(run.id, run.teamId);
      const existingReceipt = events.receipts.find(
        (receipt) => receipt.nodeId === execution.node.id && receipt.inputDigest === execution.inputDigest
      );
      if (existingReceipt) {
        return completedFromReceipt(events, existingReceipt);
      }

      const operationInput: SenaWorkflowNodeOperationInput = {
        run,
        state: execution.state,
        node: execution.node,
        inputDigest: execution.inputDigest,
        effectKey,
        predecessorReceiptHashes: execution.predecessorReceiptHashes
      };
      const humanInterruptId = deterministicInterruptId({
        runId: run.id,
        nodeId: execution.node.id,
        inputDigest: execution.inputDigest,
        kind: "human"
      });
      const jobInterruptId = deterministicInterruptId({
        runId: run.id,
        nodeId: execution.node.id,
        inputDigest: execution.inputDigest,
        kind: "job"
      });
      const blockedInterruptId = deterministicInterruptId({
        runId: run.id,
        nodeId: execution.node.id,
        inputDigest: execution.inputDigest,
        kind: "blocked"
      });

      let approval: SenaWorkflowApproval | undefined;
      let job: SenaWorkflowServerJobState | undefined;
      if (execution.node.effect === "human-interrupt") {
        const prepared = input.operations.prepareHumanGate
          ? await input.operations.prepareHumanGate(operationInput)
          : {
              candidateOutputDigest: senaWorkflowDigest({
                runId: run.id,
                nodeId: execution.node.id,
                inputDigest: execution.inputDigest,
                predecessorReceiptHashes: execution.predecessorReceiptHashes,
                requiredPermission: execution.node.requiredPermission ?? "analysis:run"
              })
            };
        if (prepared.blocker) {
          return blocked({
            interruptId: blockedInterruptId,
            inputDigest: execution.inputDigest,
            nodeId: execution.node.id,
            code: prepared.blocker.code,
            message: prepared.blocker.message,
            retryable: prepared.blocker.retryable
          });
        }
        if (!execution.resume) {
          return {
            kind: "waiting-human",
            interruptId: humanInterruptId,
            inputDigest: execution.inputDigest,
            candidateOutputDigest: prepared.candidateOutputDigest,
            requiredPermission: execution.node.requiredPermission ?? "analysis:run"
          };
        }
        const resumedInterruptId = stringField(execution.resume, "interruptId");
        const resumedDecision = stringField(execution.resume, "decision");
        const resumedDecisionDigest = stringField(execution.resume, "decisionDigest");
        events = await input.store.runEvents(run.id, run.teamId);
        approval = events.approvals.find((candidate) =>
          candidate.nodeId === execution.node.id &&
          candidate.interruptId === humanInterruptId &&
          candidate.inputDigest === execution.inputDigest &&
          candidate.candidateOutputDigest === prepared.candidateOutputDigest &&
          candidate.decision === resumedDecision &&
          candidate.decisionDigest === resumedDecisionDigest
        );
        if (resumedInterruptId !== humanInterruptId || !approval) {
          return blocked({
            interruptId: humanInterruptId,
            inputDigest: execution.inputDigest,
            nodeId: execution.node.id,
            code: "workflow_approval_evidence_missing",
            message: "A matching authoritative approval receipt is required before this workflow node can resume.",
            retryable: false
          });
        }
        if (approval.decision === "reject") {
          return blocked({
            interruptId: humanInterruptId,
            inputDigest: execution.inputDigest,
            nodeId: execution.node.id,
            code: "workflow_human_decision_rejected",
            message: "The authoritative human decision rejected this workflow node output.",
            retryable: false
          });
        }
      }

      if (execution.node.effect === "server-job") {
        const ensured = await input.operations.ensureServerJob(operationInput);
        if (execution.resume) {
          const resumedInterruptId = stringField(execution.resume, "interruptId");
          const resumedJobId = stringField(execution.resume, "jobId");
          if (resumedInterruptId !== jobInterruptId || resumedJobId !== ensured.id) {
            return blocked({
              interruptId: jobInterruptId,
              inputDigest: execution.inputDigest,
              nodeId: execution.node.id,
              code: "workflow_job_resume_binding_invalid",
              message: "The workflow job resume command does not match the durable job binding.",
              retryable: false
            });
          }
          job = await input.operations.readServerJob({ ...operationInput, jobId: ensured.id });
        } else {
          job = ensured;
        }
        if (job.id !== ensured.id) {
          return blocked({
            interruptId: jobInterruptId,
            inputDigest: execution.inputDigest,
            nodeId: execution.node.id,
            code: "workflow_job_receipt_binding_invalid",
            message: "The terminal server-job receipt does not match the workflow job binding.",
            retryable: false
          });
        }
        if (job.status === "queued" || job.status === "running") {
          return {
            kind: "waiting-job",
            interruptId: jobInterruptId,
            inputDigest: execution.inputDigest,
            jobId: job.id
          };
        }
        if (job.status === "failed" || job.status === "dead-lettered") {
          return blocked({
            interruptId: jobInterruptId,
            inputDigest: execution.inputDigest,
            nodeId: execution.node.id,
            code: job.status === "dead-lettered" ? "workflow_job_dead_lettered" : "workflow_job_failed",
            message: "The bound server job did not produce a successful terminal receipt.",
            retryable: job.status === "failed"
          });
        }
      }

      const materialized = await input.operations.materialize({ ...operationInput, job, approval });
      if (!/^[a-f0-9]{64}$/.test(materialized.outputDigest)) {
        throw new Error("SENA workflow node materialization must return a SHA-256 output digest.");
      }
      const appendedArtifacts: string[] = [];
      for (const artifact of materialized.artifacts ?? []) {
        if (artifact.runId !== run.id || artifact.nodeId !== execution.node.id) {
          throw new Error("SENA workflow artifact is not bound to the executing run and node.");
        }
        const appended = await input.store.appendArtifact(artifact);
        appendedArtifacts.push(appended.artifact.id);
      }
      const artifactReferences = unique([
        ...appendedArtifacts,
        ...(materialized.artifactReferences ?? []),
        ...(job?.artifactReferences ?? [])
      ]);
      const approvalReferences = unique([
        ...(approval ? [approval.id] : []),
        ...(materialized.approvalReferences ?? [])
      ]);
      const jobReferences = unique([
        ...(job ? [job.id] : []),
        ...(materialized.jobReferences ?? [])
      ]);
      const finishedAt = now();
      const receiptEvidenceLayers = {
        ...defaultEvidenceLayers(execution.node),
        ...(materialized.evidenceLayers ?? {})
      };
      const appended = await input.store.appendStepReceipt({
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowStepReceipt,
        id: `workflow_receipt_${effectKey.slice(0, 24)}`,
        runId: run.id,
        nodeId: execution.node.id,
        attempt: run.attempt,
        effectKey,
        predecessorReceiptHashes: execution.predecessorReceiptHashes,
        inputDigest: execution.inputDigest,
        outputDigest: materialized.outputDigest,
        ...(job ? { jobId: job.id } : {}),
        artifactReferences,
        actorType: approval ? "human" : execution.node.effect === "server-job" ? "worker" : "system",
        ...(approval ? { actorIdHash: approval.actorUserIdHash } : {}),
        codeSha: run.codeSha,
        evidenceLayer: execution.node.evidenceLayer,
        statePatch: {
          ...(materialized.claimBoundary ? { claimBoundary: materialized.claimBoundary } : {}),
          evidenceLayers: receiptEvidenceLayers
        },
        startedAt: finishedAt,
        finishedAt,
        retryDisposition: "none"
      });
      return {
        ...completedFromReceipt({
          ...events,
          approvals: approval ? uniqueApprovals([...events.approvals, approval]) : events.approvals
        }, appended.receipt),
        artifactReferences,
        jobReferences,
        approvalReferences,
        evidenceLayers: receiptEvidenceLayers,
        ...(materialized.claimBoundary ? { claimBoundary: materialized.claimBoundary } : {})
      };
    }
  };
}

function uniqueApprovals(approvals: SenaWorkflowApproval[]) {
  return [...new Map(approvals.map((approval) => [approval.id, approval])).values()];
}
