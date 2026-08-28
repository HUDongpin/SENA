import { describe, expect, it } from "vitest";
import { rolePermissions } from "../enterprise/access-control";
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import {
  buildEnterpriseProjectEvidenceBinding,
  getEnterpriseCurrentProjectRevisionSourceReadOnlyAsync
} from "../enterprise/team-project";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  createSenaWorkflowRun,
  performSenaWorkflowAction,
  senaWorkflowDecisionDigest
} from "../workflow/api-runtime";
import { senaWorkflowDigest } from "../workflow/canonical";
import { engineeringReleaseGraphV1, researchEvidenceGraphV1 } from "../workflow/definitions";
import type { SenaWorkflowApproval, SenaWorkflowCommand, SenaWorkflowRun } from "../workflow/types";

const IMPORT_UPLOAD_ID = "upload_111111111111111111111111";
const RELIABILITY_UPLOAD_ID = "upload_222222222222222222222222";
const WORKFLOW_UPLOAD_BINDINGS = {
  import: [{
    id: IMPORT_UPLOAD_ID,
    sha256: "1".repeat(64),
    size: 128,
    importProfile: "sena-json-contract",
    scanStatus: "passed"
  }],
  reliability: [{
    id: RELIABILITY_UPLOAD_ID,
    sha256: "2".repeat(64),
    size: 256,
    importProfile: "coding-reliability",
    scanStatus: "passed"
  }]
} as const;

function workflowUploads(uploadIds: string[]) {
  return uploadIds.map((id) => {
    const evidence = id === IMPORT_UPLOAD_ID
      ? WORKFLOW_UPLOAD_BINDINGS.import[0]
      : WORKFLOW_UPLOAD_BINDINGS.reliability[0];
    return {
      ...evidence,
      teamId: "workflow-team-1",
      userId: "workflow-user-1",
      originalName: "redacted-fixture.json",
      storedName: `${id}.blob`,
      contentType: "application/json",
      scanEngine: "sena-local-upload-scan/v1",
      scanFindings: [],
      storagePath: `workflow-team-1/${id}.blob`,
      createdAt: "2026-08-28T00:00:00.000Z"
    };
  }) as never;
}

function context(role: "owner" | "reviewer" = "owner") {
  return {
    user: { id: "workflow-user-1" },
    memberships: [{ teamId: "workflow-team-1", role, status: "active" }],
    teams: [{ id: "workflow-team-1" }],
    session: { id: "workflow-session-1" }
  } as SenaEnterpriseSessionContext;
}

function researchRevision() {
  return {
    currentProject: { id: "workflow-project-1", teamId: "workflow-team-1", currentVersion: 7 },
    revision: {
      id: "workflow-revision-6",
      projectId: "workflow-project-1",
      teamId: "workflow-team-1",
      version: 6
    },
    sourceProject: {
      id: "workflow-project-1",
      teamId: "workflow-team-1",
      currentVersion: 6,
      snapshot: { schemaVersion: "test-fixture-snapshot/v1", title: "Test fixture only" }
    }
  } as never;
}

function engineeringParameters(baseSha: string, candidateSha: string) {
  const branch = "codex/sena-evidenceflow-engineering-test";
  const changedPaths = ["sena-hk-template/lib/sena/workflow/engineering-evidence.ts"];
  const gateNames = ["focused-tests", "typecheck", "lint", "build", "pilot-verify"] as const;
  return {
    engineeringEvidence: {
      ownerLane: "A15",
      branch,
      worktreePathHash: "6".repeat(64),
      allowedPaths: changedPaths,
      targetKind: "real-sena-read-only",
      repositoryPreflight: {
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight,
        repo: "HUDongpin/SENA",
        baseSha,
        liveMainSha: baseSha,
        governanceRegistryDigest: "6".repeat(64),
        checkedAt: "2026-08-28T00:00:00.000Z",
        featureWorkFrozen: false,
        protectedMainGreen: true,
        ownerConflict: false,
        dirtyTarget: false,
        headDrift: false,
        allowedPathConflict: false,
        externalSideEffects: false
      },
      candidateReceipt: {
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringCandidateReceipt,
        repo: "HUDongpin/SENA",
        branch,
        baseSha,
        candidateSha,
        ownerLane: "A15",
        changedPaths,
        changedPathDigest: senaWorkflowDigest({ changedPaths })
      },
      gateReceipts: gateNames.map((gate, index) => ({
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringGateReceipt,
        gate,
        evidenceLayer: "local",
        status: "passed",
        candidateSha,
        commandDigest: senaWorkflowDigest({ gate }),
        environmentDigest: "7".repeat(64),
        logSummaryDigest: String(index + 1).repeat(64),
        exitCode: 0,
        startedAt: "2026-08-28T00:00:00.000Z",
        finishedAt: "2026-08-28T00:00:01.000Z",
        fixture: false,
        externalSideEffects: false,
        artifactReferences: []
      }))
    }
  };
}

describe("SENA workflow API run creation contract", () => {
  it("derives immutable research bindings server-side and creates one transactional start command", async () => {
    const writes: unknown[] = [];
    const result = await createSenaWorkflowRun({
      context: context(),
      body: {
        kind: "research-evidence",
        teamId: "workflow-team-1",
        projectId: "workflow-project-1",
        projectRevisionId: "workflow-revision-6",
        parameters: {
          researchSourceClass: "fixture",
          importUploadIds: [IMPORT_UPLOAD_ID],
          reliabilityUploadIds: [RELIABILITY_UPLOAD_ID],
          validationSuite: "default",
          publicationFormat: "package"
        }
      },
      idempotencyKey: "workflow-start-idempotency-1",
      codeSha: "a".repeat(40),
      now: "2026-08-28T00:00:00.000Z",
      idFactory: () => "11111111-2222-3333-4444-555555555555",
      assertCapabilities: () => undefined,
      resolveResearchRevision: async () => researchRevision(),
      resolveUploadMetadata: async (_context, request) => workflowUploads(request.uploadIds),
      store: {
        async createRunWithStartCommand(input) {
          writes.push(input);
          return { created: true, ...input };
        }
      }
    });

    expect(result.created).toBe(true);
    expect(writes).toHaveLength(1);
    expect(result.run).toMatchObject({
      id: "workflow_run_11111111222233334444555555555555",
      kind: "research-evidence",
      teamId: "workflow-team-1",
      projectId: "workflow-project-1",
      projectRevisionId: "workflow-revision-6",
      status: "queued",
      claimBoundary: "exploratory-only",
      researchSourceClass: "fixture",
      codeSha: "a".repeat(40)
    });
    expect(result.run.sourceBindingDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.command).toMatchObject({
      kind: "start",
      expectedVersion: 1,
      idempotencyKey: "workflow-start-idempotency-1",
      payloadDigest: result.run.startPayloadDigest
    });
    expect(result.command.payload).not.toHaveProperty("snapshot");
    expect(result.command.payload.sourceEvidence).toMatchObject({
      snapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      researchSourceClass: "fixture",
      uploadBindings: WORKFLOW_UPLOAD_BINDINGS
    });
    expect(JSON.stringify(result.command.payload)).not.toContain("Test fixture only");
  });

  it("admits only a digest-bound exact-SHA engineering shadow evidence packet", async () => {
    const baseSha = "c".repeat(40);
    const candidateSha = "d".repeat(40);
    const workRequestDigest = "e".repeat(64);
    const result = await createSenaWorkflowRun({
      context: context(),
      body: {
        kind: "engineering-release",
        teamId: "workflow-team-1",
        repo: "HUDongpin/SENA",
        baseSha,
        candidateSha,
        workRequestDigest,
        parameters: engineeringParameters(baseSha, candidateSha)
      },
      idempotencyKey: "workflow-engineering-start-1",
      codeSha: "f".repeat(40),
      now: "2026-08-28T00:00:00.000Z",
      idFactory: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      assertCapabilities: () => undefined,
      store: {
        async createRunWithStartCommand(input) {
          return { created: true, ...input };
        }
      }
    });
    expect(result.run).toMatchObject({
      kind: "engineering-release",
      mode: "shadow",
      repo: "HUDongpin/SENA",
      baseSha,
      candidateSha
    });
    expect(result.run).not.toHaveProperty("claimBoundary");
    expect(result.command.payload).toMatchObject({
      sourceEvidence: { repo: "HUDongpin/SENA", baseSha, workRequestDigest },
      parameters: {
        engineeringEvidence: {
          ownerLane: "A15",
          targetKind: "real-sena-read-only",
          candidateReceipt: { candidateSha }
        }
      }
    });
  });

  it("rejects source drift, unsupported fields, unsafe parameters, and engineering starts without team management", async () => {
    const base = {
      context: context(),
      idempotencyKey: "workflow-start-idempotency-2",
      codeSha: "b".repeat(40),
      idFactory: () => "66666666-7777-8888-9999-000000000000",
      assertCapabilities: () => undefined,
      resolveResearchRevision: async () => researchRevision(),
      resolveUploadMetadata: async (_context: unknown, request: { uploadIds: string[] }) => workflowUploads(request.uploadIds),
      store: {
        async createRunWithStartCommand() {
          throw new Error("must not write");
        }
      }
    };
    await expect(createSenaWorkflowRun({
      ...base,
      body: {
        kind: "research-evidence",
        teamId: "workflow-team-1",
        projectId: "workflow-project-1",
        projectRevisionId: "workflow-revision-6",
        parameters: {
          importUploadIds: [IMPORT_UPLOAD_ID],
          reliabilityUploadIds: [RELIABILITY_UPLOAD_ID]
        }
      }
    })).rejects.toMatchObject({ status: 422, code: "workflow_research_source_class_invalid" });
    await expect(createSenaWorkflowRun({
      ...base,
      body: {
        kind: "research-evidence",
        teamId: "workflow-team-1",
        projectId: "workflow-project-1",
        projectRevisionId: "workflow-revision-6",
        parameters: {
          researchSourceClass: "fixture",
          importUploadIds: [IMPORT_UPLOAD_ID],
          reliabilityUploadIds: [RELIABILITY_UPLOAD_ID]
        },
        sourceBindingDigest: "f".repeat(64)
      }
    })).rejects.toMatchObject({ status: 409, code: "workflow_source_binding_conflict" });
    await expect(createSenaWorkflowRun({
      ...base,
      body: {
        kind: "research-evidence",
        teamId: "workflow-team-1",
        projectId: "workflow-project-1",
        projectRevisionId: "workflow-revision-6",
        arbitraryGraphCode: "forbidden"
      }
    })).rejects.toMatchObject({ status: 422, code: "workflow_request_fields_invalid" });
    await expect(createSenaWorkflowRun({
      ...base,
      body: {
        kind: "research-evidence",
        teamId: "workflow-team-1",
        projectId: "workflow-project-1",
        projectRevisionId: "workflow-revision-6",
        parameters: { providerSecret: "test-only-secret" }
      }
    })).rejects.toThrow(/forbidden field/);
    await expect(createSenaWorkflowRun({
      ...base,
      context: context("reviewer"),
      body: {
        kind: "engineering-release",
        teamId: "workflow-team-1",
        repo: "HUDongpin/SENA",
        baseSha: "c".repeat(40),
        workRequestDigest: "d".repeat(64)
      }
    })).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });
});

function actionRun(overrides: Partial<SenaWorkflowRun> = {}): SenaWorkflowRun {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: "workflow_run_action_1",
    version: 7,
    kind: "research-evidence",
    definitionVersion: "v1",
    definitionHash: researchEvidenceGraphV1.definitionHash,
    mode: "shadow",
    teamId: "workflow-team-1",
    projectId: "workflow-project-1",
    projectRevisionId: "workflow-revision-6",
    sourceBindingDigest: "a".repeat(64),
    codeSha: "b".repeat(40),
    configDigest: "c".repeat(64),
    status: "waiting_human",
    currentNodeId: "data-governance-preflight",
    pendingInterrupt: {
      kind: "waiting-human",
      nodeId: "data-governance-preflight",
      interruptId: "workflow_interrupt_action_1",
      inputDigest: "d".repeat(64),
      candidateOutputDigest: "e".repeat(64),
      requiredPermission: "analysis:run"
    },
    attempt: 1,
    blockers: [],
    jobReferences: [],
    artifactReferences: [],
    approvalReferences: [],
    claimBoundary: "exploratory-only",
    evidenceLayers: {
      source: "passed",
      local: "not-run",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    },
    startIdempotencyKey: "workflow-action-start",
    startPayloadDigest: "f".repeat(64),
    createdByUserId: "workflow-user-1",
    receiptSequence: 1,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:01.000Z",
    ...overrides
  };
}

function actionStore(run: SenaWorkflowRun) {
  const startPayload = {
    action: "start",
    parameters: {
      researchSourceClass: "fixture",
      importUploadIds: [IMPORT_UPLOAD_ID],
      reliabilityUploadIds: [RELIABILITY_UPLOAD_ID],
      validationSuite: "default"
    },
    sourceEvidence: {
      researchSourceClass: "fixture",
      uploadBindings: WORKFLOW_UPLOAD_BINDINGS
    }
  };
  const commands: SenaWorkflowCommand[] = [{
    id: `workflow_command_start_${run.id}`,
    runId: run.id,
    kind: "start",
    expectedVersion: 1,
    idempotencyKey: run.startIdempotencyKey,
    payloadDigest: senaWorkflowDigest(startPayload),
    payload: startPayload,
    status: "completed",
    attempts: 1,
    availableAt: run.createdAt,
    completedAt: run.updatedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  }];
  const approvals: SenaWorkflowApproval[] = [];
  let approvalWrites = 0;
  let commandWrites = 0;
  return {
    commands,
    approvals,
    get approvalWrites() { return approvalWrites; },
    get commandWrites() { return commandWrites; },
    store: {
      async getRun(runId: string) {
        return runId === run.id ? run : null;
      },
      async runEvents() {
        return { run, commands, approvals, receipts: [], artifacts: [] };
      },
      async recordApprovalAndEnqueueCommand(input: { approval: SenaWorkflowApproval; command: SenaWorkflowCommand }) {
        approvalWrites += 1;
        approvals.push(input.approval);
        commands.push(input.command);
        return {
          created: true,
          approval: input.approval,
          command: input.command,
          run: { ...run, version: run.version + 1, approvalReferences: [input.approval.id] }
        };
      },
      async enqueueCommand(input: { command: SenaWorkflowCommand }) {
        commandWrites += 1;
        commands.push(input.command);
        return { created: true, command: input.command, run: { ...run, version: run.version + 1 } };
      },
      async forkRun(input: { forkedRun: SenaWorkflowRun; command: SenaWorkflowCommand }) {
        commandWrites += 1;
        commands.push(input.command);
        return { created: true, sourceRun: { ...run, status: "superseded" as const }, forkedRun: input.forkedRun, command: input.command };
      }
    }
  };
}

describe("SENA workflow API action contract", () => {
  it("grants release approval only to owner and pi roles", () => {
    expect(rolePermissions.owner).toContain("release:approve");
    expect(rolePermissions.pi).toContain("release:approve");
    for (const role of ["admin", "coder", "reviewer", "viewer"] as const) {
      expect(rolePermissions[role]).not.toContain("release:approve");
    }
  });

  it("atomically records one exact digest-bound approval and idempotently reuses it", async () => {
    const run = actionRun();
    const memory = actionStore(run);
    const pending = run.pendingInterrupt!;
    if (pending.kind !== "waiting-human") throw new Error("expected waiting-human fixture");
    const decisionDigest = senaWorkflowDecisionDigest({
      runId: run.id,
      nodeId: pending.nodeId,
      interruptId: pending.interruptId,
      inputDigest: pending.inputDigest,
      candidateOutputDigest: pending.candidateOutputDigest,
      decision: "approve"
    });
    const request = {
      context: context(),
      runId: run.id,
      body: {
        action: "approve",
        expectedVersion: run.version,
        interruptId: pending.interruptId,
        decisionDigest
      },
      idempotencyKey: "workflow-approve-idempotency",
      store: memory.store,
      now: "2026-08-28T00:00:02.000Z"
    };
    const accepted = await performSenaWorkflowAction(request);
    expect(accepted).toMatchObject({ action: "approve", created: true });
    expect(memory.approvalWrites).toBe(1);
    expect(memory.approvals[0]).toMatchObject({
      nodeId: pending.nodeId,
      interruptId: pending.interruptId,
      inputDigest: pending.inputDigest,
      candidateOutputDigest: pending.candidateOutputDigest,
      decisionDigest,
      actorRole: "owner"
    });
    const replayed = await performSenaWorkflowAction({
      ...request,
      now: "2026-08-28T00:00:59.000Z"
    });
    expect(replayed).toMatchObject({ action: "approve", created: false });
    expect(memory.approvalWrites).toBe(1);

    await expect(performSenaWorkflowAction({
      ...request,
      idempotencyKey: "workflow-approve-wrong-digest",
      body: { ...request.body, decisionDigest: "0".repeat(64) }
    })).rejects.toMatchObject({ status: 409, code: "workflow_decision_digest_conflict" });
  });

  it("binds rejection reasons and keeps release approval owner/pi-only", async () => {
    const research = actionRun();
    const researchMemory = actionStore(research);
    const rejected = await performSenaWorkflowAction({
      context: context(),
      runId: research.id,
      body: {
        action: "reject",
        expectedVersion: research.version,
        interruptId: research.pendingInterrupt!.interruptId,
        reasonCode: "governance-evidence-incomplete"
      },
      idempotencyKey: "workflow-reject-idempotency",
      store: researchMemory.store,
      now: "2026-08-28T00:00:03.000Z"
    });
    expect(rejected).toMatchObject({
      action: "reject",
      approval: { reasonCode: "governance-evidence-incomplete" },
      command: { payload: { reasonCode: "governance-evidence-incomplete" } }
    });

    const engineering = actionRun({
      kind: "engineering-release",
      definitionHash: engineeringReleaseGraphV1.definitionHash,
      projectId: undefined,
      projectRevisionId: undefined,
      repo: "HUDongpin/SENA",
      baseSha: "1".repeat(40),
      status: "waiting_human",
      currentNodeId: "exact-sha-review",
      pendingInterrupt: {
        kind: "waiting-human",
        nodeId: "exact-sha-review",
        interruptId: "workflow_interrupt_release_1",
        inputDigest: "2".repeat(64),
        candidateOutputDigest: "3".repeat(64),
        requiredPermission: "release:approve"
      },
      claimBoundary: undefined
    });
    const releaseMemory = actionStore(engineering);
    const releasePending = engineering.pendingInterrupt!;
    if (releasePending.kind !== "waiting-human") throw new Error("expected waiting-human fixture");
    await expect(performSenaWorkflowAction({
      context: context("reviewer"),
      runId: engineering.id,
      body: {
        action: "approve",
        expectedVersion: engineering.version,
        interruptId: releasePending.interruptId,
        decisionDigest: senaWorkflowDecisionDigest({
          runId: engineering.id,
          nodeId: releasePending.nodeId,
          interruptId: releasePending.interruptId,
          inputDigest: releasePending.inputDigest,
          candidateOutputDigest: releasePending.candidateOutputDigest,
          decision: "approve"
        })
      },
      idempotencyKey: "workflow-release-reviewer-denied",
      store: releaseMemory.store
    })).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });

  it("creates a deterministic superseding research fork from the current immutable revision", async () => {
    const run = actionRun({ status: "blocked", pendingInterrupt: undefined, blockers: [{ code: "source-drift", message: "source drift", retryable: false }] });
    const memory = actionStore(run);
    const projectId = run.projectId!;
    const resolved = {
      currentProject: { id: projectId, teamId: run.teamId, currentVersion: 8 },
      revision: { id: "workflow-revision-8", projectId, teamId: run.teamId, version: 8 },
      sourceProject: {
        id: projectId,
        teamId: run.teamId,
        currentVersion: 8,
        snapshot: { schemaVersion: "test-fixture-snapshot/v1", title: "Current fixture" }
      }
    };
    const snapshotSha256 = buildEnterpriseProjectEvidenceBinding(resolved.sourceProject as never).snapshotSha256;
    const newSourceBindingDigest = senaWorkflowDigest({
      kind: run.kind,
      teamId: run.teamId,
      projectId,
      projectRevisionId: resolved.revision.id,
      projectVersion: resolved.revision.version,
      snapshotSha256,
      researchSourceClass: "fixture",
      uploadBindings: WORKFLOW_UPLOAD_BINDINGS
    });
    await expect(performSenaWorkflowAction({
      context: context(),
      runId: run.id,
      body: {
        action: "fork",
        expectedVersion: run.version,
        checkpointId: "checkpoint-missing",
        newSourceBindingDigest
      },
      idempotencyKey: "workflow-fork-missing-checkpoint",
      store: memory.store,
      codeSha: "9".repeat(40),
      validateCheckpoint: async () => false,
      resolveCurrentResearchRevision: async () => resolved as unknown as Awaited<
        ReturnType<typeof getEnterpriseCurrentProjectRevisionSourceReadOnlyAsync>
      >
    })).rejects.toMatchObject({ status: 409, code: "workflow_checkpoint_not_found" });
    expect(memory.commandWrites).toBe(0);
    const result = await performSenaWorkflowAction({
      context: context(),
      runId: run.id,
      body: {
        action: "fork",
        expectedVersion: run.version,
        checkpointId: "checkpoint-action-1",
        newSourceBindingDigest
      },
      idempotencyKey: "workflow-fork-idempotency",
      store: memory.store,
      codeSha: "9".repeat(40),
      now: "2026-08-28T00:00:04.000Z",
      validateCheckpoint: async ({ runId, checkpointId }) => (
        runId === run.id && checkpointId === "checkpoint-action-1"
      ),
      resolveCurrentResearchRevision: async () => resolved as unknown as Awaited<
        ReturnType<typeof getEnterpriseCurrentProjectRevisionSourceReadOnlyAsync>
      >
    });
    expect(result).toMatchObject({
      action: "fork",
      created: true,
      run: {
        status: "queued",
        projectRevisionId: "workflow-revision-8",
        sourceBindingDigest: newSourceBindingDigest,
        parentRunId: run.id,
        parentCheckpointId: "checkpoint-action-1",
        codeSha: "9".repeat(40)
      },
      sourceRun: { status: "superseded" }
    });
    expect(result.command.payload).toMatchObject({
      forkMode: "validated-lineage-full-restart",
      checkpointBindingDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      sourceEvidence: { uploadBindings: WORKFLOW_UPLOAD_BINDINGS },
      parameters: {
        researchSourceClass: "fixture",
        importUploadIds: [IMPORT_UPLOAD_ID],
        reliabilityUploadIds: [RELIABILITY_UPLOAD_ID]
      }
    });
  });

  it("preserves the immutable engineering work-request binding in a validated full-restart fork", async () => {
    const workRequestDigest = "7".repeat(64);
    const repo = "HUDongpin/SENA";
    const baseSha = "8".repeat(40);
    const candidateSha = "9".repeat(40);
    const sourceBindingDigest = senaWorkflowDigest({
      kind: "engineering-release",
      teamId: "workflow-team-1",
      repo,
      baseSha,
      workRequestDigest
    });
    const run = actionRun({
      kind: "engineering-release",
      definitionHash: engineeringReleaseGraphV1.definitionHash,
      projectId: undefined,
      projectRevisionId: undefined,
      researchSourceClass: undefined,
      repo,
      baseSha,
      candidateSha,
      sourceBindingDigest,
      status: "blocked",
      pendingInterrupt: undefined,
      blockers: [{ code: "candidate-drift", message: "candidate drift", retryable: false }],
      claimBoundary: undefined
    });
    const memory = actionStore(run);
    const sourcePayload = {
      action: "start",
      parameters: { engineeringEvidence: { mode: "shadow" } },
      sourceEvidence: { repo, baseSha, workRequestDigest }
    };
    memory.commands[0].payload = sourcePayload;
    memory.commands[0].payloadDigest = senaWorkflowDigest(sourcePayload);

    const result = await performSenaWorkflowAction({
      context: context(),
      runId: run.id,
      body: {
        action: "fork",
        expectedVersion: run.version,
        checkpointId: "checkpoint-engineering-1",
        newSourceBindingDigest: sourceBindingDigest
      },
      idempotencyKey: "workflow-engineering-fork",
      store: memory.store,
      codeSha: run.codeSha,
      validateCheckpoint: async () => true
    });

    expect(result.run).toMatchObject({
      kind: "engineering-release",
      repo,
      baseSha,
      candidateSha,
      sourceBindingDigest,
      parentRunId: run.id,
      parentCheckpointId: "checkpoint-engineering-1"
    });
    expect(result.command.payload).toMatchObject({
      forkMode: "validated-lineage-full-restart",
      sourceEvidence: { repo, baseSha, workRequestDigest }
    });
  });
});
