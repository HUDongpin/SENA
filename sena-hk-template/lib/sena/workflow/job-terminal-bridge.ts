import { senaWorkflowDigest } from "./canonical";
import type { SenaWorkflowCommand, SenaWorkflowRun } from "./types";
import {
  createSenaWorkflowPostgresStoreFromEnv,
  senaWorkflowPostgresRuntimeStatus
} from "./postgres-runtime";

type TerminalJobStatus = "succeeded" | "failed" | "dead-lettered";

export type SenaWorkflowTerminalServerJob = {
  id: string;
  teamId: string;
  status: "queued" | "running" | TerminalJobStatus;
  resultReceipt?: {
    outputDigest: string;
    artifactReferences: string[];
  };
  payloadSummary?: {
    workflowRunId?: string;
    workflowNodeId?: string;
  };
};

export type SenaWorkflowJobTerminalBridgeStore = {
  listRuns(filters: { teamId: string; status?: SenaWorkflowRun["status"]; limit?: number }): Promise<SenaWorkflowRun[]>;
  enqueueCommand(input: {
    teamId: string;
    expectedVersion: number;
    command: SenaWorkflowCommand;
  }): Promise<{ created: boolean; run: SenaWorkflowRun; command: SenaWorkflowCommand }>;
};

const TERMINAL_JOB_STATUSES = new Set<TerminalJobStatus>(["succeeded", "failed", "dead-lettered"]);

export async function enqueueSenaWorkflowJobTerminalCommand(input: {
  store: SenaWorkflowJobTerminalBridgeStore;
  job: SenaWorkflowTerminalServerJob;
  now: string;
  candidateRuns?: SenaWorkflowRun[];
}) {
  if (!TERMINAL_JOB_STATUSES.has(input.job.status as TerminalJobStatus)) {
    return { status: "not-terminal" as const, jobId: input.job.id };
  }
  const candidates = input.candidateRuns ?? await input.store.listRuns({
    teamId: input.job.teamId,
    status: "waiting_job",
    limit: 500
  });
  const matches = candidates.filter((run) => (
    run.teamId === input.job.teamId &&
    run.status === "waiting_job" &&
    run.pendingInterrupt?.kind === "waiting-job" &&
    run.pendingInterrupt.jobId === input.job.id &&
    (!input.job.payloadSummary?.workflowRunId || input.job.payloadSummary.workflowRunId === run.id) &&
    (!input.job.payloadSummary?.workflowNodeId || input.job.payloadSummary.workflowNodeId === run.currentNodeId)
  ));
  if (matches.length === 0) return { status: "no-waiter" as const, jobId: input.job.id };
  if (matches.length !== 1) {
    throw new Error("One terminal server job is bound to multiple workflow runs.");
  }
  const run = matches[0];
  const pending = run.pendingInterrupt;
  if (pending?.kind !== "waiting-job") throw new Error("Workflow waiting-job evidence changed during wakeup.");
  const payload = {
    action: "job-terminal",
    interruptId: pending.interruptId,
    jobId: input.job.id,
    jobStatus: input.job.status,
    outputDigest: input.job.resultReceipt?.outputDigest ?? null
  };
  const bindingDigest = senaWorkflowDigest({
    runId: run.id,
    nodeId: pending.nodeId,
    inputDigest: pending.inputDigest,
    payload
  });
  const command: SenaWorkflowCommand = {
    id: `workflow_command_${bindingDigest.slice(0, 24)}`,
    runId: run.id,
    kind: "job-terminal",
    expectedVersion: run.version,
    idempotencyKey: `workflow-job-terminal-${bindingDigest.slice(0, 32)}`,
    payloadDigest: senaWorkflowDigest(payload),
    payload,
    status: "pending",
    attempts: 0,
    availableAt: input.now,
    createdAt: input.now,
    updatedAt: input.now
  };
  const result = await input.store.enqueueCommand({
    teamId: run.teamId,
    expectedVersion: run.version,
    command
  });
  return {
    status: "enqueued" as const,
    created: result.created,
    runId: run.id,
    command: result.command
  };
}

export async function notifySenaWorkflowServerJobTerminal(input: {
  job: SenaWorkflowTerminalServerJob;
  now?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}) {
  if (!input.job.payloadSummary?.workflowRunId) {
    return { status: "not-workflow-job" as const, jobId: input.job.id };
  }
  if (!senaWorkflowPostgresRuntimeStatus(input.env).configured) {
    return { status: "workflow-store-not-configured" as const, jobId: input.job.id };
  }
  const { store, pool } = createSenaWorkflowPostgresStoreFromEnv({ env: input.env });
  try {
    return await enqueueSenaWorkflowJobTerminalCommand({
      store,
      job: input.job,
      now: input.now ?? new Date().toISOString()
    });
  } finally {
    await pool.end();
  }
}

export async function recoverSenaWorkflowJobTerminalCommands(input: {
  store: SenaWorkflowJobTerminalBridgeStore & {
    listWaitingJobRuns(limit?: number): Promise<SenaWorkflowRun[]>;
  };
  readServerJob(jobId: string): Promise<SenaWorkflowTerminalServerJob>;
  now?: () => string;
  limit?: number;
}) {
  const waitingRuns = await input.store.listWaitingJobRuns(input.limit ?? 100);
  const outcomes = [];
  for (const run of waitingRuns) {
    const pending = run.pendingInterrupt;
    if (pending?.kind !== "waiting-job") continue;
    try {
      const job = await input.readServerJob(pending.jobId);
      outcomes.push(await enqueueSenaWorkflowJobTerminalCommand({
        store: input.store,
        job,
        now: (input.now ?? (() => new Date().toISOString()))(),
        candidateRuns: [run]
      }));
    } catch (error) {
      outcomes.push({
        status: "recovery-failed" as const,
        runId: run.id,
        jobId: pending.jobId,
        errorClass: error instanceof Error ? error.name : "UnknownError",
        errorHash: senaWorkflowDigest({
          errorClass: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error)
        })
      });
    }
  }
  return { waitingRunCount: waitingRuns.length, outcomes };
}
