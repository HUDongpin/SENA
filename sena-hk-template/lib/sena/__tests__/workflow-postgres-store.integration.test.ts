import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { senaWorkflowDigest } from "../workflow/canonical";
import { researchEvidenceGraphV1 } from "../workflow/definitions";
import { enqueueSenaWorkflowJobTerminalCommand } from "../workflow/job-terminal-bridge";
import {
  createSenaWorkflowPostgresStore,
  SenaWorkflowStoreError
} from "../workflow/postgres-store";
import type {
  SenaWorkflowApproval,
  SenaWorkflowArtifact,
  SenaWorkflowCommand,
  SenaWorkflowRun
} from "../workflow/types";

const postgresUrl = process.env.SENA_WORKFLOW_TEST_POSTGRES_URL;
const describeWithPostgres = postgresUrl ? describe : describe.skip;
const now = "2026-01-01T00:00:00.000Z";

function workflowRun(overrides: Partial<SenaWorkflowRun> = {}): SenaWorkflowRun {
  const startPayloadDigest = senaWorkflowDigest({ kind: "research-evidence", sourceBindingDigest: "a".repeat(64) });
  return {
    schemaVersion: "sena-workflow-run/v1",
    id: "workflow_run_postgres_1",
    version: 1,
    kind: "research-evidence",
    definitionVersion: "v1",
    definitionHash: researchEvidenceGraphV1.definitionHash,
    mode: "shadow",
    teamId: "team_workflow_postgres",
    projectId: "project_workflow_postgres",
    projectRevisionId: "revision_workflow_postgres_1",
    researchSourceClass: "fixture",
    sourceBindingDigest: "a".repeat(64),
    codeSha: "b".repeat(40),
    configDigest: "c".repeat(64),
    status: "queued",
    currentNodeId: "bind-source",
    attempt: 0,
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
    startIdempotencyKey: "start-idempotency-1",
    startPayloadDigest,
    createdByUserId: "user_workflow_postgres",
    receiptSequence: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function workflowCommand(run: SenaWorkflowRun, overrides: Partial<SenaWorkflowCommand> = {}): SenaWorkflowCommand {
  return {
    id: "workflow_command_start_1",
    runId: run.id,
    kind: "start",
    expectedVersion: run.version,
    idempotencyKey: run.startIdempotencyKey,
    payloadDigest: run.startPayloadDigest,
    payload: {
      kind: run.kind,
      sourceBindingDigest: run.sourceBindingDigest,
      projectRevisionId: run.projectRevisionId
    },
    status: "pending",
    attempts: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describeWithPostgres("SENA EvidenceFlow authoritative Postgres store", () => {
  let pool: Pool;
  let store: ReturnType<typeof createSenaWorkflowPostgresStore>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: postgresUrl!, max: 8 });
    store = createSenaWorkflowPostgresStore({ pool });
    await store.ensureSchema();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates the five authoritative tables and atomically deduplicates start requests", async () => {
    const tableResult = await pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'sena_workflow_%'
      ORDER BY table_name
    `);
    expect(tableResult.rows.map((row) => row.table_name)).toEqual([
      "sena_workflow_approvals",
      "sena_workflow_artifacts",
      "sena_workflow_commands",
      "sena_workflow_runs",
      "sena_workflow_step_receipts"
    ]);

    const run = workflowRun();
    const command = workflowCommand(run);
    const first = await store.createRunWithStartCommand({ run, command });
    expect(first.created).toBe(true);
    const repeated = await store.createRunWithStartCommand({ run, command });
    expect(repeated.created).toBe(false);
    expect(repeated.run.id).toBe(run.id);
    expect(repeated.run.researchSourceClass).toBe("fixture");
    expect(repeated.command.id).toBe(command.id);

    const driftedRun = workflowRun({
      id: "workflow_run_postgres_drift",
      startPayloadDigest: "d".repeat(64)
    });
    await expect(store.createRunWithStartCommand({
      run: driftedRun,
      command: workflowCommand(driftedRun, {
        id: "workflow_command_start_drift",
        payloadDigest: driftedRun.startPayloadDigest
      })
    })).rejects.toMatchObject({ status: 409, code: "workflow_idempotency_conflict" });

    const invalidRun = workflowRun({ id: "workflow_run_postgres_invalid", startIdempotencyKey: "invalid-start" });
    await expect(store.createRunWithStartCommand({
      run: invalidRun,
      command: workflowCommand(invalidRun, { runId: "different-run" })
    })).rejects.toMatchObject({ status: 422, code: "workflow_start_binding_invalid" });
    expect(await store.getRun(invalidRun.id)).toBeNull();

    const rollbackRun = workflowRun({
      id: "workflow_run_postgres_rollback",
      startIdempotencyKey: "rollback-start"
    });
    const rollbackCommand = workflowCommand(rollbackRun, {
      id: command.id,
      idempotencyKey: rollbackRun.startIdempotencyKey
    });
    let rollbackError: unknown;
    try {
      await store.createRunWithStartCommand({ run: rollbackRun, command: rollbackCommand });
    } catch (error) {
      rollbackError = error;
    }
    expect(rollbackError).toMatchObject({ status: 500, code: "workflow_transaction_failed" });
    expect((rollbackError as Error).message).not.toContain(command.id);
    expect(await store.getRun(rollbackRun.id)).toBeNull();
  });

  it("claims each outbox command once, recovers an expired lease, and dead-letters at max attempts", async () => {
    const claims = await Promise.all([
      store.claimNextCommand({ workerId: "worker-left" }),
      store.claimNextCommand({ workerId: "worker-right" })
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const firstClaim = claims.find(Boolean)!;
    await store.completeCommand({
      commandId: firstClaim.id,
      workerId: firstClaim.claimedBy!,
      completedAt: "2026-08-28T00:00:01.000Z"
    });

    const run = (await store.getRun("workflow_run_postgres_1"))!;
    const resumePayload = { interruptId: "interrupt-1", decisionDigest: "e".repeat(64) };
    const resume: SenaWorkflowCommand = workflowCommand(run, {
      id: "workflow_command_resume_1",
      kind: "resume",
      expectedVersion: run.version,
      idempotencyKey: "resume-idempotency-1",
      payloadDigest: senaWorkflowDigest(resumePayload),
      payload: resumePayload,
      createdAt: "2026-01-01T00:00:02.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
      availableAt: "2026-01-01T00:00:02.000Z"
    });
    const enqueued = await store.enqueueCommand({ teamId: run.teamId, expectedVersion: run.version, command: resume });
    expect(enqueued.created).toBe(true);
    const duplicate = await store.enqueueCommand({ teamId: run.teamId, expectedVersion: run.version, command: resume });
    expect(duplicate.created).toBe(false);

    const claimed = await store.claimNextCommand({ workerId: "worker-expiring", maxAttempts: 2 });
    expect(claimed?.id).toBe(resume.id);
    const renewed = await store.renewCommandLease({
      commandId: resume.id,
      workerId: "worker-expiring",
      leaseMs: 120_000
    });
    expect(Date.parse(renewed!.claimExpiresAt!)).toBeGreaterThan(Date.parse(claimed!.claimExpiresAt!));
    await pool.query(`
      UPDATE sena_workflow_commands SET claim_expires_at = now() - interval '1 second'
      WHERE id = $1
    `, [resume.id]);
    const recoveredClaims = await Promise.all([
      store.claimNextCommand({ workerId: "worker-recovery-left", maxAttempts: 2 }),
      store.claimNextCommand({ workerId: "worker-recovery-right", maxAttempts: 2 })
    ]);
    expect(recoveredClaims.filter(Boolean)).toHaveLength(1);
    const recovered = recoveredClaims.find(Boolean)!;
    expect(recovered.attempts).toBe(2);
    const deadLettered = await store.failCommand({
      commandId: recovered.id,
      workerId: recovered.claimedBy!,
      failedAt: "2026-08-28T00:00:03.000Z",
      retryable: true,
      maxAttempts: 2,
      errorClass: "deterministic-gate-failure",
      errorHash: "f".repeat(64)
    });
    expect(deadLettered.status).toBe("dead_lettered");
  });

  it("enforces optimistic versions, hash-chains receipts, and binds approvals and artifacts", async () => {
    const runAfterCommand = (await store.getRun("workflow_run_postgres_1"))!;
    await expect(store.enqueueCommand({
      teamId: runAfterCommand.teamId,
      expectedVersion: 1,
      command: workflowCommand(runAfterCommand, {
        id: "workflow_command_stale",
        kind: "retry",
        expectedVersion: 1,
        idempotencyKey: "stale-command",
        payloadDigest: "1".repeat(64),
        payload: { nodeId: "bind-source" }
      })
    })).rejects.toMatchObject({ status: 409, code: "workflow_version_conflict" });

    const firstReceiptDraft = {
      schemaVersion: "sena-workflow-step-receipt/v1" as const,
      id: "workflow_receipt_1",
      runId: runAfterCommand.id,
      nodeId: "bind-source",
      attempt: 1,
      effectKey: "bind-source-effect",
      predecessorReceiptHashes: [],
      inputDigest: "2".repeat(64),
      outputDigest: "3".repeat(64),
      artifactReferences: [],
      actorType: "worker" as const,
      codeSha: runAfterCommand.codeSha,
      evidenceLayer: "source" as const,
      startedAt: "2026-08-28T00:00:04.000Z",
      finishedAt: "2026-08-28T00:00:05.000Z",
      retryDisposition: "none" as const
    };
    const firstReceipt = await store.appendStepReceipt(firstReceiptDraft);
    expect(firstReceipt.created).toBe(true);
    expect(firstReceipt.receipt.sequence).toBe(1);
    const repeatedReceipt = await store.appendStepReceipt(firstReceiptDraft);
    expect(repeatedReceipt.created).toBe(false);
    expect(repeatedReceipt.receipt.auditChainHead).toBe(firstReceipt.receipt.auditChainHead);

    const secondReceipt = await store.appendStepReceipt({
      ...firstReceiptDraft,
      id: "workflow_receipt_2",
      nodeId: "data-governance-preflight",
      effectKey: undefined,
      inputDigest: "4".repeat(64),
      outputDigest: "5".repeat(64),
      predecessorReceiptHashes: [firstReceipt.receipt.auditChainHead],
      startedAt: "2026-08-28T00:00:06.000Z",
      finishedAt: "2026-08-28T00:00:07.000Z"
    });
    expect(secondReceipt.receipt.sequence).toBe(2);
    expect(secondReceipt.receipt.previousAuditChainHead).toBe(firstReceipt.receipt.auditChainHead);

    const run = (await store.getRun(runAfterCommand.id))!;
    const approval: SenaWorkflowApproval = {
      schemaVersion: "sena-workflow-approval/v1",
      id: "workflow_approval_1",
      runId: run.id,
      nodeId: "data-governance-preflight",
      interruptId: "interrupt-governance-1",
      expectedVersion: run.version,
      actorUserIdHash: "6".repeat(64),
      actorRole: "pi",
      decision: "approve",
      inputDigest: "4".repeat(64),
      candidateOutputDigest: "5".repeat(64),
      decisionDigest: "7".repeat(64),
      createdAt: "2026-08-28T00:00:08.000Z"
    };
    const recordedApproval = await store.recordApproval({ teamId: run.teamId, approval });
    expect(recordedApproval.created).toBe(true);
    expect(recordedApproval.run.version).toBe(run.version + 1);
    const repeatedApproval = await store.recordApproval({ teamId: run.teamId, approval });
    expect(repeatedApproval.created).toBe(false);

    const artifact: SenaWorkflowArtifact = {
      id: "workflow_artifact_1",
      runId: run.id,
      nodeId: "bind-source",
      filename: "sena-workflow-run.json",
      schemaVersion: "sena-workflow-run/v1",
      sha256: "8".repeat(64),
      storageReference: "artifact://workflow_artifact_1",
      evidenceLayer: "source",
      createdAt: "2026-08-28T00:00:09.000Z"
    };
    const recordedArtifact = await store.appendArtifact(artifact);
    expect(recordedArtifact.created).toBe(true);
    expect((await store.appendArtifact(artifact)).created).toBe(false);

    const events = await store.runEvents(run.id, run.teamId);
    expect(events.receipts).toHaveLength(2);
    expect(events.approvals).toHaveLength(1);
    expect(events.artifacts).toHaveLength(1);
    expect(events.run.auditChainHead).toBe(secondReceipt.receipt.auditChainHead);
    expect(events.run.receiptSequence).toBe(2);
  });

  it("rejects unsafe command payloads without echoing the rejected value", async () => {
    const run = (await store.getRun("workflow_run_postgres_1"))!;
    const unsafe = workflowCommand(run, {
      id: "workflow_command_unsafe",
      kind: "retry",
      expectedVersion: run.version,
      idempotencyKey: "unsafe-command",
      payloadDigest: "9".repeat(64),
      payload: { providerSecret: "test-only-provider-secret" }
    });
    let caught: unknown;
    try {
      await store.enqueueCommand({ teamId: run.teamId, expectedVersion: run.version, command: unsafe });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(SenaWorkflowStoreError);
    expect((caught as Error).message).not.toContain("test-only-provider-secret");
  });

  it("atomically settles one claimed command and its authoritative run transition", async () => {
    const run = workflowRun({
      id: "workflow_run_postgres_settlement",
      startIdempotencyKey: "settlement-start",
      startPayloadDigest: senaWorkflowDigest({ settlement: true })
    });
    const command = workflowCommand(run, {
      id: "workflow_command_postgres_settlement",
      idempotencyKey: run.startIdempotencyKey,
      payloadDigest: run.startPayloadDigest,
      payload: { settlement: true }
    });
    await store.createRunWithStartCommand({ run, command });
    const claimed = await store.claimNextCommand({ workerId: "worker-settlement", kinds: ["start"] });
    expect(claimed?.id).toBe(command.id);
    const running = await store.transitionRun({
      runId: run.id,
      teamId: run.teamId,
      expectedVersion: run.version,
      updatedAt: "2026-08-28T00:00:09.100Z",
      patch: { status: "running" }
    });
    const settled = await store.settleClaimedCommand({
      commandId: command.id,
      workerId: "worker-settlement",
      runId: run.id,
      teamId: run.teamId,
      expectedRunVersion: running.version,
      completedAt: "2026-08-28T00:00:09.200Z",
      patch: {
        status: "waiting_human",
        currentNodeId: "data-governance-preflight"
      }
    });
    expect(settled.command).toMatchObject({ status: "completed", completedAt: "2026-08-28T00:00:09.200Z" });
    expect(settled.run).toMatchObject({
      version: running.version + 1,
      status: "waiting_human",
      currentNodeId: "data-governance-preflight"
    });
    await expect(store.settleClaimedCommand({
      commandId: command.id,
      workerId: "worker-settlement",
      runId: run.id,
      teamId: run.teamId,
      expectedRunVersion: settled.run.version,
      completedAt: "2026-08-28T00:00:09.300Z",
      patch: { status: "succeeded" }
    })).rejects.toMatchObject({ status: 409, code: "workflow_command_lease_conflict" });
    expect((await store.getRun(run.id, run.teamId))?.status).toBe("waiting_human");
  });

  it("refuses successful terminalization while a later authorized command is pending", async () => {
    const run = workflowRun({
      id: "workflow_run_postgres_terminal_race",
      startIdempotencyKey: "terminal-race-start",
      startPayloadDigest: senaWorkflowDigest({ terminalRace: true })
    });
    const start = workflowCommand(run, {
      id: "workflow_command_postgres_terminal_race_start",
      idempotencyKey: run.startIdempotencyKey,
      payloadDigest: run.startPayloadDigest,
      payload: { terminalRace: true }
    });
    await store.createRunWithStartCommand({ run, command: start });
    const claimed = await store.claimNextCommand({ workerId: "worker-terminal-race", kinds: ["start"] });
    expect(claimed?.id).toBe(start.id);
    const running = await store.transitionRun({
      runId: run.id,
      teamId: run.teamId,
      expectedVersion: run.version,
      updatedAt: "2026-08-28T00:00:09.210Z",
      patch: { status: "running" }
    });
    const cancelPayload = { action: "cancel", reasonCode: "operator-request" };
    const cancellation = workflowCommand(running, {
      id: "workflow_command_postgres_terminal_race_cancel",
      kind: "cancel",
      expectedVersion: running.version,
      idempotencyKey: "terminal-race-cancel",
      payload: cancelPayload,
      payloadDigest: senaWorkflowDigest(cancelPayload),
      createdAt: "2026-08-28T00:00:09.220Z",
      updatedAt: "2026-08-28T00:00:09.220Z",
      availableAt: "2026-08-28T00:00:09.220Z"
    });
    const queued = await store.enqueueCommand({
      teamId: run.teamId,
      expectedVersion: running.version,
      command: cancellation
    });

    await expect(store.settleClaimedCommand({
      commandId: start.id,
      workerId: "worker-terminal-race",
      runId: run.id,
      teamId: run.teamId,
      expectedRunVersion: queued.run.version,
      completedAt: "2026-08-28T00:00:09.230Z",
      patch: { status: "succeeded", currentNodeId: "evidence-closeout" }
    })).rejects.toMatchObject({
      status: 409,
      code: "workflow_terminalization_pending_command_conflict"
    });
    await expect(store.getRun(run.id, run.teamId)).resolves.toMatchObject({ status: "running" });
  });

  it("atomically records one digest-bound approval and its resume outbox command", async () => {
    const run = workflowRun({
      id: "workflow_run_postgres_approval_command",
      startIdempotencyKey: "approval-command-start",
      startPayloadDigest: senaWorkflowDigest({ approvalCommand: true }),
      status: "waiting_human",
      currentNodeId: "data-governance-preflight"
    });
    const start = workflowCommand(run, {
      id: "workflow_command_approval_start",
      idempotencyKey: run.startIdempotencyKey,
      payloadDigest: run.startPayloadDigest,
      payload: { approvalCommand: true }
    });
    await store.createRunWithStartCommand({ run, command: start });
    const approval: SenaWorkflowApproval = {
      schemaVersion: "sena-workflow-approval/v1",
      id: "workflow_approval_command_1",
      runId: run.id,
      nodeId: "data-governance-preflight",
      interruptId: "workflow_interrupt_approval_command",
      expectedVersion: run.version,
      actorUserIdHash: "a2".repeat(32),
      actorRole: "pi",
      decision: "approve",
      inputDigest: "b2".repeat(32),
      candidateOutputDigest: "c2".repeat(32),
      decisionDigest: "d2".repeat(32),
      createdAt: "2026-08-28T00:00:09.400Z"
    };
    const resumePayload = {
      interruptId: approval.interruptId,
      decision: approval.decision,
      decisionDigest: approval.decisionDigest
    };
    const resume: SenaWorkflowCommand = workflowCommand(run, {
      id: "workflow_command_approval_resume",
      kind: "resume",
      expectedVersion: run.version,
      idempotencyKey: "approval-resume-idempotency",
      payloadDigest: senaWorkflowDigest(resumePayload),
      payload: resumePayload,
      createdAt: approval.createdAt,
      updatedAt: approval.createdAt,
      availableAt: approval.createdAt
    });
    const first = await store.recordApprovalAndEnqueueCommand({
      teamId: run.teamId,
      approval,
      command: resume
    });
    expect(first.created).toBe(true);
    expect(first.run.version).toBe(run.version + 1);
    expect(first.run.approvalReferences).toContain(approval.id);
    const repeated = await store.recordApprovalAndEnqueueCommand({
      teamId: run.teamId,
      approval: {
        ...approval,
        id: "workflow_approval_command_replayed_request",
        createdAt: "2026-08-28T00:00:09.900Z"
      },
      command: {
        ...resume,
        id: "workflow_command_approval_resume_replayed_request",
        createdAt: "2026-08-28T00:00:09.900Z",
        updatedAt: "2026-08-28T00:00:09.900Z",
        availableAt: "2026-08-28T00:00:09.900Z"
      }
    });
    expect(repeated.created).toBe(false);
    expect(repeated.approval.id).toBe(approval.id);
    expect(repeated.command.id).toBe(resume.id);
    const events = await store.runEvents(run.id, run.teamId);
    expect(events.approvals.filter((entry) => entry.id === approval.id)).toHaveLength(1);
    expect(events.commands.filter((entry) => entry.id === resume.id)).toHaveLength(1);

    await expect(store.recordApprovalAndEnqueueCommand({
      teamId: run.teamId,
      approval: { ...approval, id: "workflow_approval_command_drift" },
      command: {
        ...resume,
        id: "workflow_command_approval_resume_drift",
        idempotencyKey: "approval-resume-drift",
        payload: { ...resumePayload, interruptId: "wrong-interrupt" }
      }
    })).rejects.toMatchObject({ status: 422, code: "workflow_approval_command_binding_invalid" });
  });

  it("durably and idempotently wakes one waiting workflow from a terminal server-job receipt", async () => {
    const jobId = "server_job_aaaaaaaaaaaaaaaaaaaaaaaa";
    const waiting = workflowRun({
      id: "workflow_run_postgres_job_wake",
      startIdempotencyKey: "job-wake-start",
      startPayloadDigest: senaWorkflowDigest({ jobWake: true }),
      status: "waiting_job",
      currentNodeId: "fusion-analysis",
      pendingInterrupt: {
        kind: "waiting-job",
        nodeId: "fusion-analysis",
        interruptId: "workflow_interrupt_postgres_job_wake",
        inputDigest: "a3".repeat(32),
        jobId
      },
      jobReferences: [jobId]
    });
    await store.createRunWithStartCommand({
      run: waiting,
      command: workflowCommand(waiting, {
        id: "workflow_command_postgres_job_wake_start",
        idempotencyKey: waiting.startIdempotencyKey,
        payloadDigest: waiting.startPayloadDigest,
        payload: { jobWake: true }
      })
    });
    const job = {
      id: jobId,
      teamId: waiting.teamId,
      status: "succeeded" as const,
      resultReceipt: { outputDigest: "b3".repeat(32), artifactReferences: ["analysis_job_wake"] },
      payloadSummary: { workflowRunId: waiting.id, workflowNodeId: "fusion-analysis" }
    };
    const first = await enqueueSenaWorkflowJobTerminalCommand({
      store,
      job,
      now: "2026-08-28T00:00:09.500Z"
    });
    const repeated = await enqueueSenaWorkflowJobTerminalCommand({
      store,
      job,
      now: "2026-08-28T00:00:09.900Z"
    });
    expect(first).toMatchObject({ status: "enqueued", created: true, runId: waiting.id });
    expect(repeated).toMatchObject({ status: "enqueued", created: false, runId: waiting.id });
    const events = await store.runEvents(waiting.id, waiting.teamId);
    const terminalCommands = events.commands.filter((command) => command.kind === "job-terminal");
    expect(terminalCommands).toHaveLength(1);
    expect(terminalCommands[0].payload).toMatchObject({
      interruptId: waiting.pendingInterrupt!.interruptId,
      jobId,
      jobStatus: "succeeded",
      outputDigest: job.resultReceipt.outputDigest
    });
  });

  it("serializes command claims per run and forbids terminal-state resurrection", async () => {
    const schemaName = `sena_workflow_claim_${process.pid}_${Date.now()}`;
    await pool.query(`CREATE SCHEMA "${schemaName}"`);
    const isolatedStore = createSenaWorkflowPostgresStore({ pool, schemaName });
    try {
      await isolatedStore.ensureSchema();
      const serialized = workflowRun({
        id: "workflow_run_postgres_serialized_commands",
        startIdempotencyKey: "serialized-command-start",
        startPayloadDigest: senaWorkflowDigest({ serializedCommands: true })
      });
      const start = workflowCommand(serialized, {
        id: "workflow_command_serialized_start",
        idempotencyKey: serialized.startIdempotencyKey,
        payloadDigest: serialized.startPayloadDigest,
        payload: { serializedCommands: true },
        createdAt: "2025-12-31T00:00:00.000Z",
        updatedAt: "2025-12-31T00:00:00.000Z",
        availableAt: "2025-12-31T00:00:00.000Z"
      });
      await isolatedStore.createRunWithStartCommand({ run: serialized, command: start });
      const cancelPayload = { action: "cancel", reasonCode: "concurrency-test" };
      await isolatedStore.enqueueCommand({
        teamId: serialized.teamId,
        expectedVersion: serialized.version,
        command: workflowCommand(serialized, {
          id: "workflow_command_serialized_cancel",
          kind: "cancel",
          idempotencyKey: "serialized-command-cancel",
          payloadDigest: senaWorkflowDigest(cancelPayload),
          payload: cancelPayload,
          createdAt: "2025-12-31T00:00:01.000Z",
          updatedAt: "2025-12-31T00:00:01.000Z",
          availableAt: "2025-12-31T00:00:01.000Z"
        })
      });
      const simultaneous = await Promise.all([
        isolatedStore.claimNextCommand({ workerId: "serialized-worker-left" }),
        isolatedStore.claimNextCommand({ workerId: "serialized-worker-right" })
      ]);
      expect(simultaneous.filter(Boolean)).toHaveLength(1);
      const first = simultaneous.find(Boolean)!;
      expect(await isolatedStore.claimNextCommand({ workerId: "serialized-worker-third" })).toBeNull();
      await isolatedStore.completeCommand({
        commandId: first.id,
        workerId: first.claimedBy!,
        completedAt: "2026-08-28T00:00:12.000Z"
      });
      const second = await isolatedStore.claimNextCommand({ workerId: "serialized-worker-second" });
      expect(second).not.toBeNull();
      await isolatedStore.completeCommand({
        commandId: second!.id,
        workerId: second!.claimedBy!,
        completedAt: "2026-08-28T00:00:13.000Z"
      });

      const terminal = workflowRun({
        id: "workflow_run_postgres_terminal_fence",
        startIdempotencyKey: "terminal-fence-start",
        startPayloadDigest: senaWorkflowDigest({ terminalFence: true }),
        status: "superseded",
        supersededByRunId: "workflow_run_postgres_terminal_successor"
      });
      const terminalCommand = workflowCommand(terminal, {
        id: "workflow_command_terminal_fence",
        idempotencyKey: terminal.startIdempotencyKey,
        payloadDigest: terminal.startPayloadDigest,
        payload: { terminalFence: true },
        createdAt: "2025-12-30T00:00:00.000Z",
        updatedAt: "2025-12-30T00:00:00.000Z",
        availableAt: "2025-12-30T00:00:00.000Z"
      });
      await isolatedStore.createRunWithStartCommand({ run: terminal, command: terminalCommand });
      const terminalClaim = await isolatedStore.claimNextCommand({ workerId: "terminal-fence-worker", kinds: ["start"] });
      expect(terminalClaim?.id).toBe(terminalCommand.id);
      await expect(isolatedStore.settleClaimedCommand({
        commandId: terminalCommand.id,
        workerId: "terminal-fence-worker",
        runId: terminal.id,
        teamId: terminal.teamId,
        expectedRunVersion: terminal.version,
        completedAt: "2026-08-28T00:00:14.000Z",
        patch: { status: "waiting_job", currentNodeId: "import-cleaning" }
      })).rejects.toMatchObject({ status: 409, code: "workflow_terminal_transition_conflict" });
      expect(await isolatedStore.getRun(terminal.id, terminal.teamId)).toMatchObject({
        status: "superseded",
        supersededByRunId: terminal.supersededByRunId
      });
      const terminalBeforeNoop = (await isolatedStore.getRun(terminal.id, terminal.teamId))!;
      const terminalNoop = await isolatedStore.settleClaimedCommand({
        commandId: terminalCommand.id,
        workerId: "terminal-fence-worker",
        runId: terminal.id,
        teamId: terminal.teamId,
        expectedRunVersion: terminalBeforeNoop.version,
        completedAt: "2026-08-28T00:00:15.000Z",
        patch: {}
      });
      expect(terminalNoop.command.status).toBe("completed");
      expect(terminalNoop.run.version).toBe(terminalBeforeNoop.version);
      expect(terminalNoop.run.updatedAt).toBe(terminalBeforeNoop.updatedAt);
      await expect(isolatedStore.appendArtifact({
        id: "workflow_artifact_terminal_late",
        runId: terminal.id,
        nodeId: "bind-source",
        filename: "late.json",
        schemaVersion: "sena-workflow-run/v1",
        sha256: "9".repeat(64),
        storageReference: "artifact://late-terminal",
        evidenceLayer: "source",
        createdAt: "2026-08-28T00:00:16.000Z"
      })).rejects.toMatchObject({ status: 409, code: "workflow_terminal_evidence_conflict" });
    } finally {
      await pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    }
  });

  it("atomically supersedes a source run and creates an idempotent checkpoint-bound fork", async () => {
    const source = (await store.getRun("workflow_run_postgres_1"))!;
    const forkPayload = {
      sourceRunId: source.id,
      checkpointId: "checkpoint-safe-1",
      newSourceBindingDigest: "a1".repeat(32)
    };
    const forkedRun = workflowRun({
      id: "workflow_run_postgres_fork_1",
      version: 1,
      projectRevisionId: "revision_workflow_postgres_2",
      sourceBindingDigest: forkPayload.newSourceBindingDigest,
      status: "queued",
      currentNodeId: "bind-source",
      attempt: 0,
      jobReferences: [],
      artifactReferences: [],
      approvalReferences: [],
      auditChainHead: undefined,
      receiptSequence: 0,
      parentRunId: source.id,
      parentCheckpointId: forkPayload.checkpointId,
      supersededByRunId: undefined,
      startIdempotencyKey: "fork-idempotency-1",
      startPayloadDigest: senaWorkflowDigest(forkPayload),
      createdAt: "2026-08-28T00:00:10.000Z",
      updatedAt: "2026-08-28T00:00:10.000Z"
    });
    const forkCommand = workflowCommand(forkedRun, {
      id: "workflow_command_fork_1",
      kind: "fork",
      expectedVersion: forkedRun.version,
      idempotencyKey: forkedRun.startIdempotencyKey,
      payloadDigest: forkedRun.startPayloadDigest,
      payload: forkPayload,
      createdAt: forkedRun.createdAt,
      updatedAt: forkedRun.updatedAt,
      availableAt: forkedRun.createdAt
    });

    const first = await store.forkRun({
      sourceRunId: source.id,
      teamId: source.teamId,
      expectedVersion: source.version,
      forkedRun,
      command: forkCommand
    });
    expect(first.created).toBe(true);
    expect(first.sourceRun).toMatchObject({
      status: "superseded",
      supersededByRunId: forkedRun.id,
      version: source.version + 1
    });
    expect(first.forkedRun).toMatchObject({
      parentRunId: source.id,
      parentCheckpointId: forkPayload.checkpointId,
      sourceBindingDigest: forkPayload.newSourceBindingDigest,
      receiptSequence: 0
    });
    expect((await store.runEvents(source.id, source.teamId)).receipts).toHaveLength(2);

    const repeated = await store.forkRun({
      sourceRunId: source.id,
      teamId: source.teamId,
      expectedVersion: source.version,
      forkedRun,
      command: forkCommand
    });
    expect(repeated.created).toBe(false);
    expect(repeated.forkedRun.id).toBe(forkedRun.id);

    await expect(store.forkRun({
      sourceRunId: source.id,
      teamId: source.teamId,
      expectedVersion: source.version,
      forkedRun: { ...forkedRun, id: "workflow_run_postgres_fork_drift" },
      command: { ...forkCommand, runId: "workflow_run_postgres_fork_drift" }
    })).rejects.toMatchObject({ status: 409, code: "workflow_idempotency_conflict" });
  });
});
