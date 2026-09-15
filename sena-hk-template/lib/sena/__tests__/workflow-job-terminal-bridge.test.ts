import { describe, expect, it } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "../workflow/canonical";
import { enqueueSenaWorkflowJobTerminalCommand } from "../workflow/job-terminal-bridge";
import type { SenaWorkflowCommand, SenaWorkflowRun } from "../workflow/types";

function run(): SenaWorkflowRun {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: "workflow_run_job_bridge_1",
    version: 4,
    kind: "research-evidence",
    definitionVersion: "v1",
    definitionHash: "1".repeat(64),
    mode: "shadow",
    teamId: "workflow-team-1",
    projectId: "project_1",
    projectRevisionId: "revision_1",
    sourceBindingDigest: "2".repeat(64),
    codeSha: "3".repeat(40),
    configDigest: "4".repeat(64),
    status: "waiting_job",
    currentNodeId: "fusion-analysis",
    pendingInterrupt: {
      kind: "waiting-job",
      nodeId: "fusion-analysis",
      interruptId: "workflow_interrupt_job_bridge_1",
      inputDigest: "5".repeat(64),
      jobId: "server_job_111111111111111111111111"
    },
    attempt: 1,
    blockers: [],
    jobReferences: ["server_job_111111111111111111111111"],
    artifactReferences: [],
    approvalReferences: [],
    claimBoundary: "exploratory-only",
    evidenceLayers: {
      source: "passed", local: "running", ci: "not-run",
      merged: "not-run", deployed: "not-run", live: "not-run"
    },
    startIdempotencyKey: "workflow-job-bridge-start",
    startPayloadDigest: "6".repeat(64),
    createdByUserId: "workflow-user-1",
    receiptSequence: 1,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:01.000Z"
  };
}

describe("SENA workflow terminal job bridge", () => {
  it("writes one deterministic resume command bound to the waiting interrupt and terminal result", async () => {
    const waitingRun = run();
    const commands: SenaWorkflowCommand[] = [];
    const store = {
      async listRuns() { return [waitingRun]; },
      async enqueueCommand(input: { command: SenaWorkflowCommand }) {
        const existing = commands.find((command) => command.idempotencyKey === input.command.idempotencyKey);
        if (existing) return { created: false, run: waitingRun, command: existing };
        commands.push(input.command);
        return { created: true, run: { ...waitingRun, version: 5 }, command: input.command };
      }
    };
    const job = {
      id: waitingRun.pendingInterrupt!.kind === "waiting-job" ? waitingRun.pendingInterrupt!.jobId : "",
      teamId: waitingRun.teamId,
      status: "succeeded" as const,
      resultReceipt: {
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobResult,
        outputDigest: "7".repeat(64),
        artifactReferences: ["analysis_1"],
        evidence: { analysisRunId: "analysis_1", reportSha256: "8".repeat(64), projectSnapshotSha256: "9".repeat(64) },
        recordedAt: "2026-08-28T00:00:02.000Z",
        redaction: { payloadValuesExcluded: true, rawRowsExcluded: true, secretValuesExcluded: true }
      }
    };

    const first = await enqueueSenaWorkflowJobTerminalCommand({
      store,
      job,
      now: "2026-08-28T00:00:03.000Z"
    });
    const replay = await enqueueSenaWorkflowJobTerminalCommand({
      store,
      job,
      now: "2026-08-28T00:00:59.000Z"
    });
    expect(first).toMatchObject({ status: "enqueued", created: true, runId: waitingRun.id });
    expect(replay).toMatchObject({ status: "enqueued", created: false, runId: waitingRun.id });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      kind: "job-terminal",
      expectedVersion: waitingRun.version,
      payload: {
        action: "job-terminal",
        interruptId: waitingRun.pendingInterrupt!.interruptId,
        jobId: job.id,
        jobStatus: "succeeded",
        outputDigest: job.resultReceipt.outputDigest
      }
    });
    expect(commands[0].payloadDigest).toBe(senaWorkflowDigest(commands[0].payload));
  });

  it("does not wake for nonterminal jobs and rejects ambiguous workflow ownership", async () => {
    const waitingRun = run();
    const store = {
      async listRuns() { return [waitingRun]; },
      async enqueueCommand() { throw new Error("must not enqueue"); }
    };
    await expect(enqueueSenaWorkflowJobTerminalCommand({
      store,
      job: { id: waitingRun.jobReferences[0], teamId: waitingRun.teamId, status: "running" },
      now: "2026-08-28T00:00:03.000Z"
    })).resolves.toEqual({ status: "not-terminal", jobId: waitingRun.jobReferences[0] });

    const ambiguousStore = { ...store, async listRuns() { return [waitingRun, { ...waitingRun, id: "workflow_run_job_bridge_2" }]; } };
    await expect(enqueueSenaWorkflowJobTerminalCommand({
      store: ambiguousStore,
      job: { id: waitingRun.jobReferences[0], teamId: waitingRun.teamId, status: "failed" },
      now: "2026-08-28T00:00:03.000Z"
    })).rejects.toThrow(/multiple workflow runs/i);
  });
});
