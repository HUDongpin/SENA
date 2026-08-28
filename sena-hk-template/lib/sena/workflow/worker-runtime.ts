import { Command, type BaseCheckpointSaver } from "@langchain/langgraph";
import { senaWorkflowDigest } from "./canonical";
import { senaWorkflowDefinition } from "./definitions";
import {
  compileSenaWorkflowGraph,
  initialSenaWorkflowGraphState,
  type SenaWorkflowGraphNodeExecutor,
  type SenaWorkflowGraphState
} from "./graph-runtime";
import type { SenaWorkflowNodeStore } from "./node-executor";
import type {
  SenaWorkflowBlocker,
  SenaWorkflowCommand,
  SenaWorkflowRun,
  SenaWorkflowRunStatus
} from "./types";

type RunTransitionPatch = Partial<Pick<
  SenaWorkflowRun,
  | "status"
  | "currentNodeId"
  | "pendingInterrupt"
  | "attempt"
  | "blockers"
  | "jobReferences"
  | "candidateSha"
  | "claimBoundary"
  | "evidenceLayers"
  | "supersededByRunId"
>>;

export type SenaWorkflowWorkerStore = SenaWorkflowNodeStore & {
  claimNextCommand(input: {
    workerId: string;
    leaseMs?: number;
    maxAttempts?: number;
    kinds?: SenaWorkflowCommand["kind"][];
  }): Promise<SenaWorkflowCommand | null>;
  transitionRun(input: {
    runId: string;
    teamId: string;
    expectedVersion: number;
    updatedAt: string;
    patch: RunTransitionPatch;
  }): Promise<SenaWorkflowRun>;
  settleClaimedCommand(input: {
    commandId: string;
    workerId: string;
    runId: string;
    teamId: string;
    expectedRunVersion: number;
    completedAt: string;
    patch: RunTransitionPatch;
  }): Promise<{ run: SenaWorkflowRun; command: SenaWorkflowCommand }>;
  failCommand(input: {
    commandId: string;
    workerId: string;
    failedAt: string;
    retryable: boolean;
    retryAt?: string;
    maxAttempts?: number;
    errorClass: string;
    errorHash: string;
  }): Promise<SenaWorkflowCommand>;
};

export type SenaWorkflowWorkerInterrupt =
  | {
      kind: "waiting-human";
      nodeId: string;
      interruptId: string;
      inputDigest: string;
      candidateOutputDigest: string;
      requiredPermission: string;
    }
  | {
      kind: "waiting-job";
      nodeId: string;
      interruptId: string;
      inputDigest: string;
      jobId: string;
    }
  | {
      kind: "blocked";
      nodeId: string;
      interruptId: string;
      inputDigest: string;
      blocker: SenaWorkflowBlocker;
    };

export type SenaWorkflowWorkerRunOnceResult =
  | { status: "idle" }
  | {
      status: "processed";
      command: SenaWorkflowCommand;
      run: SenaWorkflowRun;
      interrupt?: SenaWorkflowWorkerInterrupt;
    }
  | {
      status: "failed";
      command: SenaWorkflowCommand;
      errorClass: string;
      errorHash: string;
      retryScheduled: boolean;
    };

type CompiledWorkflowGraph = ReturnType<typeof compileSenaWorkflowGraph>;
type GraphOutput = Awaited<ReturnType<CompiledWorkflowGraph["invoke"]>>;
type GraphSnapshot = Awaited<ReturnType<CompiledWorkflowGraph["getState"]>>;

function unique(values: string[]) {
  return [...new Set(values)];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textField(value: Record<string, unknown> | undefined, key: string) {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function pendingInterrupt(snapshot: GraphSnapshot) {
  for (const task of snapshot.tasks ?? []) {
    const found = task.interrupts?.[0];
    if (found) return found;
  }
  return undefined;
}

function outputFromSnapshot(snapshot: GraphSnapshot, interrupt?: { id: string; value: Record<string, unknown> }) {
  return {
    ...snapshot.values,
    ...(interrupt ? { __interrupt__: [interrupt] } : {})
  } as GraphOutput;
}

function normalizeInterrupt(output: GraphOutput): SenaWorkflowWorkerInterrupt | undefined {
  const value = record(output.__interrupt__?.[0]?.value);
  const kind = textField(value, "kind");
  const nodeId = textField(value, "nodeId");
  const interruptId = textField(value, "interruptId");
  const inputDigest = textField(value, "inputDigest");
  if (!kind || !nodeId || !interruptId || !inputDigest) return undefined;
  if (kind === "waiting-human") {
    const candidateOutputDigest = textField(value, "candidateOutputDigest");
    const requiredPermission = textField(value, "requiredPermission");
    if (!candidateOutputDigest || !requiredPermission) return undefined;
    return { kind, nodeId, interruptId, inputDigest, candidateOutputDigest, requiredPermission };
  }
  if (kind === "waiting-job" || kind === "sena-workflow-job-wait") {
    const jobId = textField(value, "jobId");
    if (!jobId) return undefined;
    return { kind: "waiting-job", nodeId, interruptId, inputDigest, jobId };
  }
  if (kind === "blocked" || kind === "sena-workflow-blocked") {
    const blocker = record(value?.blocker);
    if (
      !blocker ||
      typeof blocker.code !== "string" ||
      typeof blocker.message !== "string" ||
      typeof blocker.retryable !== "boolean"
    ) return undefined;
    return {
      kind: "blocked",
      nodeId,
      interruptId,
      inputDigest,
      blocker: {
        code: blocker.code,
        message: blocker.message,
        nodeId: typeof blocker.nodeId === "string" ? blocker.nodeId : nodeId,
        retryable: blocker.retryable
      }
    };
  }
  return undefined;
}

function settledPatch(input: {
  run: SenaWorkflowRun;
  output: GraphOutput;
  interrupt?: SenaWorkflowWorkerInterrupt;
}): RunTransitionPatch {
  if (input.interrupt?.kind === "waiting-human") {
    return {
      status: "waiting_human",
      currentNodeId: input.interrupt.nodeId,
      pendingInterrupt: input.interrupt,
      blockers: []
    };
  }
  if (input.interrupt?.kind === "waiting-job") {
    return {
      status: "waiting_job",
      currentNodeId: input.interrupt.nodeId,
      pendingInterrupt: input.interrupt,
      blockers: [],
      jobReferences: unique([...input.run.jobReferences, input.interrupt.jobId])
    };
  }
  if (input.interrupt?.kind === "blocked") {
    return {
      status: "blocked",
      currentNodeId: input.interrupt.nodeId,
      pendingInterrupt: input.interrupt,
      blockers: [input.interrupt.blocker]
    };
  }
  if (input.output.workflowStatus !== "succeeded") {
    throw new Error("SENA workflow graph returned without a terminal status or a recognized interrupt.");
  }
  return {
    status: "succeeded",
    currentNodeId: "evidence-closeout",
    pendingInterrupt: undefined,
    blockers: [],
    jobReferences: unique([
      ...input.run.jobReferences,
      ...(Array.isArray(input.output.jobReferences) ? input.output.jobReferences : [])
    ]),
    ...(input.output.claimBoundary ? { claimBoundary: input.output.claimBoundary } : {}),
    ...(input.output.evidenceLayers ? { evidenceLayers: input.output.evidenceLayers } : {})
  };
}

function retryableWorkerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return !/(binding|forbidden|definition|payload digest|recognized interrupt|absent)/i.test(message);
}

function errorClass(error: unknown) {
  if (error instanceof Error && error.name) return `workflow-worker-${error.name.toLowerCase()}`;
  return "workflow-worker-error";
}

function terminalStatus(status: SenaWorkflowRunStatus) {
  return ["succeeded", "cancelled", "superseded", "dead_lettered"].includes(status);
}

export function createSenaWorkflowWorkerRuntime(input: {
  store: SenaWorkflowWorkerStore;
  checkpointer: BaseCheckpointSaver;
  nodeExecutor: SenaWorkflowGraphNodeExecutor;
  workerId: string;
  now?: () => string;
  leaseMs?: number;
  maxAttempts?: number;
  onError?: (error: unknown) => void;
}) {
  const now = input.now ?? (() => new Date().toISOString());
  const graphs = new Map<SenaWorkflowRun["kind"], CompiledWorkflowGraph>();

  function graphFor(run: SenaWorkflowRun) {
    let graph = graphs.get(run.kind);
    if (!graph) {
      graph = compileSenaWorkflowGraph({
        definition: senaWorkflowDefinition(run.kind),
        checkpointer: input.checkpointer,
        executor: input.nodeExecutor
      });
      graphs.set(run.kind, graph);
    }
    return graph;
  }

  async function invokeForCommand(
    graph: CompiledWorkflowGraph,
    run: SenaWorkflowRun,
    command: SenaWorkflowCommand
  ) {
    const config = { configurable: { thread_id: run.id } };
    const snapshot = await graph.getState(config);
    const pending = pendingInterrupt(snapshot);
    const hasCheckpoint = typeof snapshot.values.runId === "string";

    if (command.kind === "start" || command.kind === "fork") {
      if (hasCheckpoint && (pending || snapshot.values.workflowStatus === "succeeded")) {
        return outputFromSnapshot(snapshot, pending);
      }
      if (hasCheckpoint && snapshot.next.length > 0) return graph.invoke(null, config);
      return graph.invoke(initialSenaWorkflowGraphState({
        runId: run.id,
        kind: run.kind,
        teamId: run.teamId,
        definitionHash: run.definitionHash,
        sourceBindingDigest: run.sourceBindingDigest,
        codeSha: run.codeSha,
        configDigest: run.configDigest,
        claimBoundary: run.claimBoundary
      }), config);
    }

    if (!hasCheckpoint) {
      throw new Error("SENA workflow resume command has no durable LangGraph checkpoint.");
    }
    const commandInterruptId = textField(command.payload, "interruptId");
    const pendingInterruptId = textField(record(pending?.value), "interruptId");
    if (pending && pendingInterruptId !== commandInterruptId) {
      return outputFromSnapshot(snapshot, pending);
    }
    if (pending) {
      return graph.invoke(new Command({ resume: command.payload }), config);
    }
    if (snapshot.values.workflowStatus === "succeeded") return outputFromSnapshot(snapshot);
    if (snapshot.next.length > 0) return graph.invoke(null, config);
    throw new Error("SENA workflow resume command does not match a pending interrupt.");
  }

  async function process(command: SenaWorkflowCommand): Promise<SenaWorkflowWorkerRunOnceResult> {
    try {
      if (command.payloadDigest !== senaWorkflowDigest(command.payload)) {
        throw new Error("SENA workflow command payload digest does not match its durable envelope.");
      }
      let run = await input.store.getRun(command.runId);
      if (!run) throw new Error("SENA workflow run is absent from the authoritative store.");
      if (command.kind === "cancel") {
        const settled = await input.store.settleClaimedCommand({
          commandId: command.id,
          workerId: input.workerId,
          runId: run.id,
          teamId: run.teamId,
          expectedRunVersion: run.version,
          completedAt: now(),
          patch: { status: "cancelled", pendingInterrupt: undefined, blockers: [] }
        });
        return { status: "processed", command: settled.command, run: settled.run };
      }
      if (terminalStatus(run.status)) {
        const settled = await input.store.settleClaimedCommand({
          commandId: command.id,
          workerId: input.workerId,
          runId: run.id,
          teamId: run.teamId,
          expectedRunVersion: run.version,
          completedAt: now(),
          patch: {}
        });
        return { status: "processed", command: settled.command, run: settled.run };
      }
      if (run.status !== "running") {
        run = await input.store.transitionRun({
          runId: run.id,
          teamId: run.teamId,
          expectedVersion: run.version,
          updatedAt: now(),
          patch: {
            status: "running",
            pendingInterrupt: undefined,
            blockers: [],
            attempt: command.kind === "retry" ? run.attempt + 1 : run.attempt
          }
        });
      }

      const output = await invokeForCommand(graphFor(run), run, command);
      const interrupt = normalizeInterrupt(output);
      if (output.__interrupt__?.length && !interrupt) {
        throw new Error("SENA workflow graph returned an unrecognized interrupt payload.");
      }
      const freshRun = await input.store.getRun(run.id, run.teamId);
      if (!freshRun) throw new Error("SENA workflow run disappeared before command settlement.");
      const settled = await input.store.settleClaimedCommand({
        commandId: command.id,
        workerId: input.workerId,
        runId: freshRun.id,
        teamId: freshRun.teamId,
        expectedRunVersion: freshRun.version,
        completedAt: now(),
        patch: settledPatch({ run: freshRun, output, interrupt })
      });
      return { status: "processed", command: settled.command, run: settled.run, ...(interrupt ? { interrupt } : {}) };
    } catch (error) {
      input.onError?.(error);
      const failedAt = now();
      const classification = errorClass(error);
      const hash = senaWorkflowDigest({
        classification,
        message: error instanceof Error ? error.message : String(error)
      });
      const retryable = retryableWorkerError(error);
      const failed = await input.store.failCommand({
        commandId: command.id,
        workerId: input.workerId,
        failedAt,
        retryable,
        retryAt: retryable ? new Date(Date.parse(failedAt) + 1_000).toISOString() : undefined,
        maxAttempts: input.maxAttempts,
        errorClass: classification,
        errorHash: hash
      });
      return {
        status: "failed",
        command: failed,
        errorClass: classification,
        errorHash: hash,
        retryScheduled: failed.status === "pending"
      };
    }
  }

  return {
    async runOnce(): Promise<SenaWorkflowWorkerRunOnceResult> {
      const command = await input.store.claimNextCommand({
        workerId: input.workerId,
        leaseMs: input.leaseMs,
        maxAttempts: input.maxAttempts
      });
      return command ? process(command) : { status: "idle" };
    },
    process
  };
}
