import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
  type SenaEngineeringGateName,
  type SenaEngineeringRepositoryPreflightReceipt
} from "../workflow/engineering-evidence";
import {
  createSenaEngineeringCommandExecutor,
  observeSenaEngineeringRepositoryPreflight
} from "../workflow/engineering-runner";

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
    isolation: options.fixture ? {
      provider: "fixed-fixture-simulation",
      snapshotKind: "fixed-fixture",
      candidateTreeSha: binding.candidateSha,
      dependencyLockDigest: "8".repeat(64),
      sandboxPolicyDigest: "9".repeat(64),
      filesystemPolicy: "fixed-fixture",
      readPolicy: "fixed-fixture",
      networkPolicy: "none",
      temporarySnapshot: true
    } : {
      provider: "macos-sandbox-exec",
      snapshotKind: "git-archive-exact-sha",
      candidateTreeSha: "8".repeat(40),
      dependencyLockDigest: "8".repeat(64),
      sandboxPolicyDigest: "9".repeat(64),
      filesystemPolicy: "snapshot-write-only",
      readPolicy: "host-data-denied",
      networkPolicy: "loopback-only",
      temporarySnapshot: true
    },
    provenance: {
      issuer: "sena-workflow-worker",
      workflowRunId: "workflow_run_engineering_trusted_runner",
      executionMode: options.fixture ? "fixture-simulation" : "exact-sha-sandbox",
      worktreeBindingDigest: "7".repeat(64)
    }
  };
}

function repositoryPreflightReceipt(
  targetKind: "real-sena-read-only" | "fixture-repository" = "real-sena-read-only"
): SenaEngineeringRepositoryPreflightReceipt {
  const fixture = targetKind === "fixture-repository";
  return {
    schemaVersion: "sena-engineering-repository-preflight/v1",
    repo: binding.repo,
    baseSha: binding.baseSha,
    liveMainSha: binding.baseSha,
    candidateSha: binding.candidateSha,
    branch: "codex/sena-evidenceflow-fixture",
    ownerLane: "A11",
    worktreePathHash: "6".repeat(64),
    governanceRegistryDigest: "a".repeat(64),
    changedPathDigest: senaWorkflowDigest({ changedPaths: [".github/workflows/build-gate.yml"] }),
    checkedAt: "2026-08-28T00:00:00.000Z",
    featureWorkFrozen: false,
    protectedMainGreen: true,
    ownerConflict: false,
    dirtyTarget: false,
    headDrift: false,
    allowedPathConflict: false,
    externalSideEffects: false,
    fixture,
    provenance: {
      issuer: "sena-workflow-worker",
      observationMode: fixture ? "fixture-simulation" : "live-read-only",
      liveMainObservation: fixture ? "fixed-fixture" : "git-ls-remote",
      registryObservation: fixture ? "fixed-fixture" : "git-show-protected-main",
      requiredChecksObservation: fixture ? "fixed-fixture" : "github-check-runs",
      governanceAuditStatus: fixture ? "fixture-simulated" : "passed",
      governanceAuditDigest: "b".repeat(64),
      requiredChecksDigest: "d".repeat(64),
      requiredCheckNames: ["build", "repository-security"],
      canonicalRemoteDigest: "c".repeat(64),
      activeWorkItemTaskId: fixture ? "fixture-work-item" : "SENA-A11-ACTIONS-NODE24-UPGRADE-20260828",
      candidateTreeSha: "8".repeat(40),
      baseAncestorOfCandidate: true
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
        logSummaryDigest: senaWorkflowDigest({ command, output: "redacted-pass" }),
        isolation: gate("focused-tests").isolation
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
    expect(() => evaluateSenaEngineeringEvidenceNode("repository-preflight", parsed, binding))
      .toThrow(/repository preflight receipt/i);
    const preflight = evaluateSenaEngineeringEvidenceNode(
      "repository-preflight",
      parsed,
      binding,
      [],
      repositoryPreflightReceipt()
    );
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

    const governedGlob = parameters();
    governedGlob.engineeringEvidence.allowedPaths = [".github/workflows/**"];
    expect(parseSenaEngineeringEvidenceParameters(governedGlob, binding).allowedPaths)
      .toEqual([".github/workflows/**"]);

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

  it("requires isolation proof and a worker-minted repository observation", async () => {
    const parsed = parseSenaEngineeringEvidenceParameters(parameters(), binding);
    const receiptWithoutIsolation = structuredClone(gate("focused-tests")) as unknown as Record<string, unknown>;
    delete receiptWithoutIsolation.isolation;
    expect(() => evaluateSenaEngineeringEvidenceNode(
      "focused-gates",
      parsed,
      binding,
      [receiptWithoutIsolation as unknown as SenaEngineeringGateReceipt]
    )).toThrow(/isolation/i);

    const tamperedObservation = repositoryPreflightReceipt();
    tamperedObservation.liveMainSha = "9".repeat(40);
    expect(() => evaluateSenaEngineeringEvidenceNode(
      "repository-preflight",
      parsed,
      binding,
      [],
      tamperedObservation
    )).toThrow(/worker repository preflight/i);

    const fixtureEvidence = parseSenaEngineeringEvidenceParameters(parameters("fixture-repository"), binding);
    const fixtureObservation = await observeSenaEngineeringRepositoryPreflight({
      evidence: fixtureEvidence,
      binding
    });
    expect(fixtureObservation).toMatchObject({
      fixture: true,
      provenance: {
        issuer: "sena-workflow-worker",
        observationMode: "fixture-simulation",
        governanceAuditStatus: "fixture-simulated"
      }
    });
  });

  it.runIf(process.platform === "darwin")(
    "runs the exact candidate archive in a disposable filesystem and loopback-only sandbox",
    async () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "sena-engineering-sandbox-test-"));
      const outside = path.join(os.tmpdir(), `sena-engineering-escape-${path.basename(root)}`);
      const outsideRead = `${outside}-read`;
      const runGit = (args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
      try {
        execFileSync("git", ["init", "-b", "codex/sena-sandbox-fixture", root], { stdio: "ignore" });
        runGit(["config", "user.name", "SENA Test"]);
        runGit(["config", "user.email", "sena-test@example.invalid"]);
        const probe = [
          "const fs=require('node:fs')",
          "fs.writeFileSync('snapshot-only.txt','ok')",
          "let writeBlocked=false",
          `try{fs.writeFileSync(${JSON.stringify(outside)},'escape')}catch{writeBlocked=true}`,
          "let readBlocked=false",
          `try{fs.readFileSync(${JSON.stringify(outsideRead)})}catch{readBlocked=true}`,
          "fetch('https://example.com').then(()=>process.exit(91),()=>process.exit(writeBlocked&&readBlocked?0:92))"
        ].join(";");
        writeFileSync(path.join(root, "package.json"), `${JSON.stringify({
          name: "sena-engineering-sandbox-fixture",
          version: "1.0.0",
          private: true,
          scripts: { test: `node -e ${JSON.stringify(probe)}` }
        }, null, 2)}\n`);
        writeFileSync(path.join(root, "package-lock.json"), `${JSON.stringify({
          name: "sena-engineering-sandbox-fixture",
          version: "1.0.0",
          lockfileVersion: 3,
          requires: true,
          packages: { "": { name: "sena-engineering-sandbox-fixture", version: "1.0.0" } }
        }, null, 2)}\n`);
        runGit(["add", "package.json", "package-lock.json"]);
        runGit(["commit", "-m", "test: add sandbox fixture"]);
        const baseSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        writeFileSync(path.join(root, "gate-proof.txt"), "candidate\n");
        runGit(["add", "gate-proof.txt"]);
        runGit(["commit", "-m", "test: add candidate gate proof"]);
        const candidateSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        const sandboxBinding = {
          teamId: "workflow-team-sandbox",
          repo: "HUDongpin/SENA",
          baseSha,
          candidateSha,
          workRequestDigest: "3".repeat(64)
        };
        const changedPaths = ["gate-proof.txt"];
        const sandboxParameters = parameters();
        sandboxParameters.engineeringEvidence.branch = "codex/sena-sandbox-fixture";
        sandboxParameters.engineeringEvidence.worktreePathHash = senaWorkflowDigest(realpathForTest(root));
        sandboxParameters.engineeringEvidence.allowedPaths = changedPaths;
        sandboxParameters.engineeringEvidence.repositoryPreflight.repo = sandboxBinding.repo;
        sandboxParameters.engineeringEvidence.repositoryPreflight.baseSha = baseSha;
        sandboxParameters.engineeringEvidence.repositoryPreflight.liveMainSha = baseSha;
        sandboxParameters.engineeringEvidence.candidateReceipt = {
          ...sandboxParameters.engineeringEvidence.candidateReceipt,
          repo: sandboxBinding.repo,
          branch: "codex/sena-sandbox-fixture",
          baseSha,
          candidateSha,
          changedPaths,
          changedPathDigest: senaWorkflowDigest({ changedPaths })
        };
        const evidence = parseSenaEngineeringEvidenceParameters(sandboxParameters, sandboxBinding);
        writeFileSync(outsideRead, "host-only sentinel must remain unreadable\n");
        const execute = await createSenaEngineeringCommandExecutor({
          evidence,
          binding: sandboxBinding,
          env: { ...process.env, SENA_ENGINEERING_WORKTREE_PATH: root }
        });
        const result = await execute({
          gate: "focused-tests",
          commandId: "sena-focused-tests-v1",
          executable: "npm",
          args: ["test"],
          fixture: false
        });
        expect(result).toMatchObject({
          exitCode: 0,
          isolation: {
            provider: "macos-sandbox-exec",
            snapshotKind: "git-archive-exact-sha",
            filesystemPolicy: "snapshot-write-only",
            readPolicy: "host-data-denied",
            networkPolicy: "loopback-only"
          }
        });
        expect(existsSync(outside)).toBe(false);
        expect(existsSync(outsideRead)).toBe(true);
        expect(existsSync(path.join(root, "snapshot-only.txt"))).toBe(false);

        writeFileSync(path.join(root, "untracked-candidate-input.txt"), "must not influence exact SHA\n");
        await expect(execute({
          gate: "focused-tests",
          commandId: "sena-focused-tests-v1",
          executable: "npm",
          args: ["test"],
          fixture: false
        })).rejects.toThrow(/not clean/i);
      } finally {
        rmSync(outside, { force: true });
        rmSync(outsideRead, { force: true });
        rmSync(root, { recursive: true, force: true });
      }
    },
    30_000
  );

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
      engineeringRepositoryPreflightFactory: async () => repositoryPreflightReceipt(),
      engineeringCommandExecutorFactory: async () => async (command) => ({
        exitCode: 0,
        startedAt: "2026-08-28T00:00:00.000Z",
        finishedAt: "2026-08-28T00:00:01.000Z",
        logSummaryDigest: senaWorkflowDigest({ command, output: "redacted-pass" }),
        isolation: gate("focused-tests").isolation
      })
    });
    const preflightNode = engineeringReleaseGraphV1.nodes.find((candidate) => candidate.id === "repository-preflight")!;
    const preflight = await adapter.materialize({
      run,
      state: {} as never,
      node: preflightNode,
      inputDigest: "a".repeat(64),
      effectKey: "f".repeat(64),
      predecessorReceiptHashes: []
    });
    expect(preflight.artifacts).toEqual([
      expect.objectContaining({
        filename: "sena-engineering-repository-preflight.json",
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight,
        storageReference: `workflow-worker:${run.id}#repository-preflight`
      })
    ]);
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

function realpathForTest(value: string) {
  return execFileSync("realpath", [value], { encoding: "utf8" }).trim();
}
