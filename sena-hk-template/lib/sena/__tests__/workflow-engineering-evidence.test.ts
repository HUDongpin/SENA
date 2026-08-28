import { describe, expect, it, vi } from "vitest";
import { senaWorkflowDigest } from "../workflow/canonical";
import { engineeringReleaseGraphV1 } from "../workflow/definitions";
import { createSenaWorkflowServerJobOperationAdapter } from "../workflow/server-job-operations";
import type { SenaWorkflowNodeStore } from "../workflow/node-executor";
import type { SenaWorkflowRun, SenaWorkflowRunEvents } from "../workflow/types";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  evaluateSenaEngineeringEvidenceNode,
  runSenaEngineeringVerificationNode,
  parseSenaEngineeringEvidenceParameters,
  type SenaEngineeringGateReceipt,
  type SenaEngineeringGateName
} from "../workflow/engineering-evidence";
import { createSenaEngineeringCommandExecutor } from "../workflow/engineering-runner";

const binding = {
  teamId: "workflow-team-1",
  repo: "HUDongpin/SENA",
  baseSha: "1".repeat(40),
  candidateSha: "2".repeat(40),
  workRequestDigest: "3".repeat(64)
};

function gate(
  gateName: SenaEngineeringGateName,
  options: { fixture?: boolean } = {}
): SenaEngineeringGateReceipt {
  const layer = gateName === "pr-head-ci" || gateName === "post-merge-main-ci"
    ? "ci"
    : gateName === "deployment"
      ? "deployed"
      : gateName === "live-proof"
        ? "live"
        : gateName === "rollback"
          ? "merged"
          : "local";
  return {
    schemaVersion: "sena-engineering-gate-receipt/v1",
    gate: gateName,
    evidenceLayer: layer,
    status: "passed",
    candidateSha: binding.candidateSha,
    commandDigest: senaWorkflowDigest({ gateName, command: "fixed-by-gate-registry" }),
    environmentDigest: "4".repeat(64),
    logSummaryDigest: "5".repeat(64),
    exitCode: 0,
    startedAt: "2026-08-28T00:00:00.000Z",
    finishedAt: "2026-08-28T00:00:01.000Z",
    fixture: Boolean(options.fixture),
    externalSideEffects: false,
    artifactReferences: [],
    provenance: {
      issuer: "sena-workflow-worker",
      workflowRunId: "workflow_run_engineering_trusted_runner",
      executionMode: options.fixture ? "fixture-simulation" : "local-command",
      worktreeBindingDigest: "7".repeat(64)
    }
  };
}

function parameters(targetKind: "real-sena-read-only" | "fixture-repository" = "real-sena-read-only") {
  const changedPaths = [".github/workflows/build-gate.yml"];
  return {
    engineeringEvidence: {
      ownerLane: "A11",
      branch: "codex/sena-evidenceflow-fixture",
      worktreePathHash: "6".repeat(64),
      allowedPaths: [
        ".github/workflows/build-gate.yml",
        ".github/workflows/repo-security-gate.yml"
      ],
      targetKind,
      repositoryPreflight: {
        schemaVersion: "sena-engineering-repository-preflight/v1",
        repo: binding.repo,
        baseSha: binding.baseSha,
        liveMainSha: binding.baseSha,
        governanceRegistryDigest: "a".repeat(64),
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
        schemaVersion: "sena-engineering-candidate-receipt/v1",
        repo: binding.repo,
        branch: "codex/sena-evidenceflow-fixture",
        baseSha: binding.baseSha,
        candidateSha: binding.candidateSha,
        ownerLane: "A11",
        changedPaths,
        changedPathDigest: senaWorkflowDigest({ changedPaths })
      }
    }
  };
}

describe("SENA engineering shadow evidence", () => {
  it("does not expose worker provider secrets to candidate verification commands", async () => {
    vi.stubEnv("SENA_ENGINEERING_FORBIDDEN_SECRET", "must-not-reach-candidate");
    try {
      const evidence = parseSenaEngineeringEvidenceParameters(parameters("fixture-repository"), binding);
      const execute = await createSenaEngineeringCommandExecutor({ evidence, binding });
      const result = await execute({
        gate: "focused-tests",
        commandId: "sena-secret-redaction-probe-v1",
        executable: "node",
        args: [
          "--eval",
          "process.exit(process.env.SENA_ENGINEERING_FORBIDDEN_SECRET ? 91 : 0)"
        ],
        fixture: true
      });
      expect(result.exitCode).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects caller-authored gate claims and mints gate receipts only from the workflow worker runner", async () => {
    const untrusted = parameters();
    (untrusted.engineeringEvidence as Record<string, unknown>).gateReceipts = [gate("focused-tests")];
    expect(() => parseSenaEngineeringEvidenceParameters(untrusted, binding)).toThrow(/unsupported fields/i);

    delete (untrusted.engineeringEvidence as { gateReceipts?: unknown }).gateReceipts;
    const parsed = parseSenaEngineeringEvidenceParameters(untrusted, binding);
    const executed = await runSenaEngineeringVerificationNode({
      nodeId: "focused-gates",
      runId: "workflow_run_engineering_trusted_runner",
      evidence: parsed,
      binding,
      executeCommand: async (command) => ({
        exitCode: 0,
        startedAt: "2026-08-28T00:00:00.000Z",
        finishedAt: "2026-08-28T00:00:01.000Z",
        logSummaryDigest: senaWorkflowDigest({ command, output: "redacted-pass" })
      })
    });

    expect(executed.receipts).toEqual([
      expect.objectContaining({
        gate: "focused-tests",
        status: "passed",
        candidateSha: binding.candidateSha,
        provenance: expect.objectContaining({
          issuer: "sena-workflow-worker",
          workflowRunId: "workflow_run_engineering_trusted_runner"
        })
      })
    ]);
    expect(evaluateSenaEngineeringEvidenceNode(
      "focused-gates",
      parsed,
      binding,
      executed.receipts
    ).receiptDigests).toHaveLength(1);
  });

  it("binds the immutable work order, candidate, and exact-SHA local gates", () => {
    const parsed = parseSenaEngineeringEvidenceParameters(parameters(), binding);
    const trusted = [
      gate("focused-tests"), gate("typecheck"), gate("lint"), gate("build"), gate("pilot-verify")
    ];
    const workOrder = evaluateSenaEngineeringEvidenceNode("immutable-work-order", parsed, binding);
    const preflight = evaluateSenaEngineeringEvidenceNode("repository-preflight", parsed, binding);
    const candidate = evaluateSenaEngineeringEvidenceNode("candidate-sha-intake", parsed, binding);
    const focused = evaluateSenaEngineeringEvidenceNode("focused-gates", parsed, binding, trusted);
    const local = evaluateSenaEngineeringEvidenceNode("full-local-gate", parsed, binding, trusted);
    const shadow = evaluateSenaEngineeringEvidenceNode("shadow-release-model", parsed, binding);

    expect(workOrder.document).toMatchObject({
      schemaVersion: "sena-engineering-work-order/v1",
      mode: "shadow",
      targetKind: "real-sena-read-only",
      ownerLane: "A11",
      allowedPaths: parameters().engineeringEvidence.allowedPaths
    });
    expect(candidate.document).toMatchObject({ candidateSha: binding.candidateSha });
    expect(preflight.document).toMatchObject({
      schemaVersion: "sena-engineering-repository-preflight/v1",
      protectedMainGreen: true,
      featureWorkFrozen: false
    });
    expect(focused.receiptDigests).toHaveLength(1);
    expect(local.receiptDigests).toHaveLength(4);
    expect(shadow.evidenceLayers).toEqual({
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    });
  });

  it("fails closed on SHA/path drift and requires complete fixture-only release evidence", () => {
    const wrongSha = parameters();
    wrongSha.engineeringEvidence.candidateReceipt.candidateSha = "9".repeat(40);
    expect(() => parseSenaEngineeringEvidenceParameters(wrongSha, binding)).toThrow(/candidate/i);

    const outsidePath = parameters();
    outsidePath.engineeringEvidence.candidateReceipt.changedPaths = ["package.json"];
    outsidePath.engineeringEvidence.candidateReceipt.changedPathDigest = senaWorkflowDigest({
      changedPaths: ["package.json"]
    });
    expect(() => parseSenaEngineeringEvidenceParameters(outsidePath, binding)).toThrow(/allowed path/i);

    const frozen = parameters();
    frozen.engineeringEvidence.repositoryPreflight.featureWorkFrozen = true;
    expect(() => parseSenaEngineeringEvidenceParameters(frozen, binding)).toThrow(/preflight/i);

    const fixture = parseSenaEngineeringEvidenceParameters(parameters("fixture-repository"), binding);
    const fixtureReleaseReceipts = ([
      "pr-head-ci", "post-merge-main-ci", "deployment", "live-proof", "rollback"
    ] as SenaEngineeringGateName[]).map((name) => gate(name, { fixture: true }));
    expect(evaluateSenaEngineeringEvidenceNode(
      "shadow-release-model",
      fixture,
      binding,
      fixtureReleaseReceipts
    ).evidenceLayers).toEqual({
      ci: "passed",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    });

    expect(() => evaluateSenaEngineeringEvidenceNode(
      "shadow-release-model",
      fixture,
      binding,
      fixtureReleaseReceipts.filter((receipt) => receipt.gate !== "live-proof")
    )).toThrow(/live-proof/);
  });

  it("materializes content-addressed work-order and gate receipt references without side effects", async () => {
    const sourceEvidence = {
      repo: binding.repo,
      baseSha: binding.baseSha,
      workRequestDigest: binding.workRequestDigest
    };
    const startPayload = { action: "start", parameters: parameters(), sourceEvidence };
    const run: SenaWorkflowRun = {
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
      id: "workflow_run_engineering_materialize_1",
      version: 3,
      kind: "engineering-release",
      definitionVersion: "v1",
      definitionHash: engineeringReleaseGraphV1.definitionHash,
      mode: "shadow",
      teamId: binding.teamId,
      repo: binding.repo,
      baseSha: binding.baseSha,
      candidateSha: binding.candidateSha,
      sourceBindingDigest: senaWorkflowDigest({ kind: "engineering-release", ...sourceEvidence, teamId: binding.teamId }),
      codeSha: "a".repeat(40),
      configDigest: senaWorkflowDigest(parameters()),
      status: "running",
      currentNodeId: "immutable-work-order",
      attempt: 1,
      blockers: [],
      jobReferences: [],
      artifactReferences: [],
      approvalReferences: [],
      evidenceLayers: {
        source: "running", local: "not-run", ci: "not-run",
        merged: "not-run", deployed: "not-run", live: "not-run"
      },
      startIdempotencyKey: "engineering-materialize-start",
      startPayloadDigest: senaWorkflowDigest(startPayload),
      createdByUserId: "workflow-user-1",
      receiptSequence: 0,
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z"
    };
    const events: SenaWorkflowRunEvents = {
      run,
      commands: [{
        id: "workflow_command_engineering_start",
        runId: run.id,
        kind: "start",
        expectedVersion: 1,
        idempotencyKey: run.startIdempotencyKey,
        payloadDigest: senaWorkflowDigest(startPayload),
        payload: startPayload,
        status: "completed",
        attempts: 1,
        availableAt: run.createdAt,
        completedAt: run.createdAt,
        createdAt: run.createdAt,
        updatedAt: run.createdAt
      }],
      receipts: [], approvals: [], artifacts: []
    };
    const store = {
      async getRun() { return run; },
      async runEvents() { return events; },
      async appendStepReceipt() { throw new Error("not used"); },
      async appendArtifact() { throw new Error("not used"); }
    } as unknown as SenaWorkflowNodeStore;
    const adapter = createSenaWorkflowServerJobOperationAdapter({
      store,
      engineeringCommandExecutorFactory: async () => async (command) => ({
        exitCode: 0,
        startedAt: "2026-08-28T00:00:00.000Z",
        finishedAt: "2026-08-28T00:00:01.000Z",
        logSummaryDigest: senaWorkflowDigest({ command, output: "redacted-pass" })
      })
    });
    const node = engineeringReleaseGraphV1.nodes.find((candidate) => candidate.id === "immutable-work-order")!;
    const workOrder = await adapter.materialize({
      run,
      state: {} as never,
      node,
      inputDigest: "b".repeat(64),
      effectKey: "c".repeat(64),
      predecessorReceiptHashes: []
    });
    expect(workOrder.artifacts).toEqual([
      expect.objectContaining({
        runId: run.id,
        nodeId: "immutable-work-order",
        filename: "sena-engineering-work-order.json",
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringWorkOrder,
        storageReference: expect.stringContaining("workflow_command_engineering_start")
      })
    ]);

    const focusedNode = engineeringReleaseGraphV1.nodes.find((candidate) => candidate.id === "focused-gates")!;
    const focused = await adapter.materialize({
      run,
      state: {} as never,
      node: focusedNode,
      inputDigest: "d".repeat(64),
      effectKey: "e".repeat(64),
      predecessorReceiptHashes: [workOrder.outputDigest]
    });
    expect(focused.artifacts).toEqual([
      expect.objectContaining({
        filename: "sena-engineering-focused-tests-receipt.json",
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringGateReceipt,
        evidenceLayer: "local"
      })
    ]);
  });
});
