import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaWorkflowRun } from "./types";
import { senaWorkflowDigest } from "./canonical";

export type SenaEngineeringGateName =
  | "focused-tests"
  | "typecheck"
  | "lint"
  | "build"
  | "pilot-verify"
  | "pr-head-ci"
  | "post-merge-main-ci"
  | "deployment"
  | "live-proof"
  | "rollback";

export type SenaEngineeringTargetKind = "real-sena-read-only" | "fixture-repository";
type SenaEngineeringEvidenceLayer = "local" | "ci" | "merged" | "deployed" | "live";

export type SenaEngineeringGateReceipt = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.workflowEngineeringGateReceipt;
  gate: SenaEngineeringGateName;
  evidenceLayer: SenaEngineeringEvidenceLayer;
  status: "passed" | "failed" | "blocked";
  candidateSha: string;
  commandDigest: string;
  environmentDigest: string;
  logSummaryDigest: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  fixture: boolean;
  externalSideEffects: false;
  artifactReferences: string[];
  isolation: SenaEngineeringIsolationProof;
  provenance: {
    issuer: "sena-workflow-worker";
    workflowRunId: string;
    executionMode: "exact-sha-sandbox" | "fixture-simulation";
    worktreeBindingDigest: string;
  };
};

export type SenaEngineeringIsolationProof = {
  provider: "macos-sandbox-exec" | "fixed-fixture-simulation";
  snapshotKind: "git-archive-exact-sha" | "fixed-fixture";
  candidateTreeSha: string;
  dependencyLockDigest: string;
  sandboxPolicyDigest: string;
  filesystemPolicy: "snapshot-write-only" | "fixed-fixture";
  readPolicy: "host-data-denied" | "fixed-fixture";
  networkPolicy: "loopback-only" | "none";
  temporarySnapshot: true;
};

export type SenaEngineeringRepositoryPreflightReceipt = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight;
  repo: string;
  baseSha: string;
  liveMainSha: string;
  candidateSha: string;
  branch: string;
  ownerLane: string;
  worktreePathHash: string;
  governanceRegistryDigest: string;
  changedPathDigest: string;
  checkedAt: string;
  featureWorkFrozen: false;
  protectedMainGreen: true;
  ownerConflict: false;
  dirtyTarget: false;
  headDrift: false;
  allowedPathConflict: false;
  externalSideEffects: false;
  fixture: boolean;
  provenance: {
    issuer: "sena-workflow-worker";
    observationMode: "live-read-only" | "fixture-simulation";
    liveMainObservation: "git-ls-remote" | "fixed-fixture";
    registryObservation: "git-show-protected-main" | "fixed-fixture";
    requiredChecksObservation: "github-check-runs" | "fixed-fixture";
    governanceAuditStatus: "passed" | "fixture-simulated";
    governanceAuditDigest: string;
    requiredChecksDigest: string;
    requiredCheckNames: string[];
    canonicalRemoteDigest: string;
    activeWorkItemTaskId: string;
    candidateTreeSha: string;
    baseAncestorOfCandidate: true;
  };
};

export type SenaEngineeringEvidenceParameters = {
  ownerLane: string;
  branch: string;
  worktreePathHash: string;
  allowedPaths: string[];
  targetKind: SenaEngineeringTargetKind;
  repositoryPreflight: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight;
    repo: string;
    baseSha: string;
    liveMainSha: string;
    governanceRegistryDigest: string;
    checkedAt: string;
    featureWorkFrozen: false;
    protectedMainGreen: true;
    ownerConflict: false;
    dirtyTarget: false;
    headDrift: false;
    allowedPathConflict: false;
    externalSideEffects: false;
  };
  candidateReceipt: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.workflowEngineeringCandidateReceipt;
    repo: string;
    branch: string;
    baseSha: string;
    candidateSha: string;
    ownerLane: string;
    changedPaths: string[];
    changedPathDigest: string;
  };
};

export type SenaEngineeringRunBinding = {
  teamId: string;
  repo: string;
  baseSha: string;
  candidateSha: string;
  workRequestDigest: string;
};

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const OWNER_LANE = /^A(?:0[1-9]|1[0-5])$/;
const SAFE_BRANCH = /^codex\/[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const GATE_NAMES = new Set<SenaEngineeringGateName>([
  "focused-tests", "typecheck", "lint", "build", "pilot-verify",
  "pr-head-ci", "post-merge-main-ci", "deployment", "live-proof", "rollback"
]);
const EXPECTED_LAYER: Record<SenaEngineeringGateName, SenaEngineeringEvidenceLayer> = {
  "focused-tests": "local",
  typecheck: "local",
  lint: "local",
  build: "local",
  "pilot-verify": "local",
  "pr-head-ci": "ci",
  "post-merge-main-ci": "ci",
  deployment: "deployed",
  "live-proof": "live",
  rollback: "merged"
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`SENA engineering ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exact(recordValue: Record<string, unknown>, fields: string[], label: string) {
  if (Object.keys(recordValue).some((key) => !fields.includes(key))) {
    throw new Error(`SENA engineering ${label} contains unsupported fields.`);
  }
}

function safePath(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 ||
    value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) {
    throw new Error("SENA engineering allowed path is invalid.");
  }
  return value;
}

function canonicalUniquePaths(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error(`SENA engineering ${label} must contain 1-100 paths.`);
  }
  const paths = value.map(safePath);
  if (new Set(paths).size !== paths.length) throw new Error(`SENA engineering ${label} contains duplicates.`);
  return [...paths].sort();
}

export function senaEngineeringPathAllowed(changedPath: string, allowedPath: string) {
  if (changedPath === allowedPath) return true;
  if (!allowedPath.endsWith("/**")) return false;
  const prefix = allowedPath.slice(0, -3).replace(/\/$/, "");
  return Boolean(prefix) && changedPath.startsWith(`${prefix}/`);
}

function parseGateReceipt(
  value: unknown,
  binding: SenaEngineeringRunBinding,
  targetKind: SenaEngineeringTargetKind,
  workflowRunId?: string
) {
  const receipt = record(value, "gate receipt");
  exact(receipt, [
    "schemaVersion", "gate", "evidenceLayer", "status", "candidateSha", "commandDigest",
    "environmentDigest", "logSummaryDigest", "exitCode", "startedAt", "finishedAt", "fixture",
    "externalSideEffects", "artifactReferences", "isolation", "provenance"
  ], "gate receipt");
  const gate = receipt.gate as SenaEngineeringGateName;
  const startedAt = typeof receipt.startedAt === "string" ? Date.parse(receipt.startedAt) : Number.NaN;
  const finishedAt = typeof receipt.finishedAt === "string" ? Date.parse(receipt.finishedAt) : Number.NaN;
  const provenance = record(receipt.provenance, "gate receipt provenance");
  exact(provenance, ["issuer", "workflowRunId", "executionMode", "worktreeBindingDigest"], "gate receipt provenance");
  const isolation = record(receipt.isolation, "gate receipt isolation");
  exact(isolation, [
    "provider", "snapshotKind", "candidateTreeSha", "dependencyLockDigest", "sandboxPolicyDigest",
    "filesystemPolicy", "readPolicy", "networkPolicy", "temporarySnapshot"
  ], "gate receipt isolation");
  const realIsolation = targetKind === "real-sena-read-only" &&
    isolation.provider === "macos-sandbox-exec" &&
    isolation.snapshotKind === "git-archive-exact-sha" &&
    isolation.filesystemPolicy === "snapshot-write-only" &&
    isolation.readPolicy === "host-data-denied" &&
    isolation.networkPolicy === "loopback-only";
  const fixtureIsolation = targetKind === "fixture-repository" &&
    isolation.provider === "fixed-fixture-simulation" &&
    isolation.snapshotKind === "fixed-fixture" &&
    isolation.filesystemPolicy === "fixed-fixture" &&
    isolation.readPolicy === "fixed-fixture" &&
    isolation.networkPolicy === "none";
  if (
    receipt.schemaVersion !== SENA_SCHEMA_VERSIONS.workflowEngineeringGateReceipt ||
    !GATE_NAMES.has(gate) || receipt.evidenceLayer !== EXPECTED_LAYER[gate] ||
    !["passed", "failed", "blocked"].includes(String(receipt.status)) ||
    receipt.candidateSha !== binding.candidateSha ||
    ![receipt.commandDigest, receipt.environmentDigest, receipt.logSummaryDigest]
      .every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
    !Number.isSafeInteger(receipt.exitCode) || Number(receipt.exitCode) < 0 ||
    !Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt ||
    receipt.fixture !== (targetKind === "fixture-repository") ||
    receipt.externalSideEffects !== false ||
    provenance.issuer !== "sena-workflow-worker" ||
    typeof provenance.workflowRunId !== "string" || !provenance.workflowRunId ||
    (workflowRunId !== undefined && provenance.workflowRunId !== workflowRunId) ||
    !["exact-sha-sandbox", "fixture-simulation"].includes(String(provenance.executionMode)) ||
    provenance.executionMode !== (targetKind === "fixture-repository" ? "fixture-simulation" : "exact-sha-sandbox") ||
    typeof provenance.worktreeBindingDigest !== "string" || !SHA256.test(provenance.worktreeBindingDigest) ||
    (!realIsolation && !fixtureIsolation) ||
    typeof isolation.candidateTreeSha !== "string" || !SHA.test(isolation.candidateTreeSha) ||
    typeof isolation.dependencyLockDigest !== "string" || !SHA256.test(isolation.dependencyLockDigest) ||
    typeof isolation.sandboxPolicyDigest !== "string" || !SHA256.test(isolation.sandboxPolicyDigest) ||
    isolation.temporarySnapshot !== true ||
    !Array.isArray(receipt.artifactReferences) ||
    !receipt.artifactReferences.every((entry) => typeof entry === "string" && SAFE_REFERENCE.test(entry)) ||
    (receipt.status === "passed" && receipt.exitCode !== 0) ||
    (receipt.status !== "passed" && receipt.exitCode === 0)
  ) {
    throw new Error(`SENA engineering ${String(receipt.gate)} gate receipt is invalid.`);
  }
  return structuredClone(receipt) as SenaEngineeringGateReceipt;
}

export function parseSenaEngineeringRepositoryPreflightReceipt(
  value: unknown,
  evidence: SenaEngineeringEvidenceParameters,
  binding: SenaEngineeringRunBinding
) {
  const receipt = record(value, "repository preflight receipt");
  exact(receipt, [
    "schemaVersion", "repo", "baseSha", "liveMainSha", "candidateSha", "branch", "ownerLane",
    "worktreePathHash", "governanceRegistryDigest", "changedPathDigest", "checkedAt",
    "featureWorkFrozen", "protectedMainGreen", "ownerConflict", "dirtyTarget", "headDrift",
    "allowedPathConflict", "externalSideEffects", "fixture", "provenance"
  ], "repository preflight receipt");
  const provenance = record(receipt.provenance, "repository preflight provenance");
  exact(provenance, [
    "issuer", "observationMode", "liveMainObservation", "registryObservation", "requiredChecksObservation",
    "governanceAuditStatus", "governanceAuditDigest", "requiredChecksDigest", "requiredCheckNames",
    "canonicalRemoteDigest", "activeWorkItemTaskId",
    "candidateTreeSha", "baseAncestorOfCandidate"
  ], "repository preflight provenance");
  const realObservation = evidence.targetKind === "real-sena-read-only" &&
    receipt.fixture === false && provenance.observationMode === "live-read-only" &&
    provenance.liveMainObservation === "git-ls-remote" &&
    provenance.registryObservation === "git-show-protected-main" &&
    provenance.requiredChecksObservation === "github-check-runs" &&
    provenance.governanceAuditStatus === "passed";
  const fixtureObservation = evidence.targetKind === "fixture-repository" &&
    receipt.fixture === true && provenance.observationMode === "fixture-simulation" &&
    provenance.liveMainObservation === "fixed-fixture" &&
    provenance.registryObservation === "fixed-fixture" &&
    provenance.requiredChecksObservation === "fixed-fixture" &&
    provenance.governanceAuditStatus === "fixture-simulated";
  if (
    receipt.schemaVersion !== SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight ||
    receipt.repo !== binding.repo || receipt.baseSha !== binding.baseSha ||
    receipt.liveMainSha !== binding.baseSha || receipt.candidateSha !== binding.candidateSha ||
    receipt.branch !== evidence.branch || receipt.ownerLane !== evidence.ownerLane ||
    receipt.worktreePathHash !== evidence.worktreePathHash ||
    receipt.governanceRegistryDigest !== evidence.repositoryPreflight.governanceRegistryDigest ||
    receipt.changedPathDigest !== evidence.candidateReceipt.changedPathDigest ||
    typeof receipt.checkedAt !== "string" || !Number.isFinite(Date.parse(receipt.checkedAt)) ||
    receipt.featureWorkFrozen !== false || receipt.protectedMainGreen !== true ||
    receipt.ownerConflict !== false || receipt.dirtyTarget !== false ||
    receipt.headDrift !== false || receipt.allowedPathConflict !== false ||
    receipt.externalSideEffects !== false ||
    provenance.issuer !== "sena-workflow-worker" || (!realObservation && !fixtureObservation) ||
    typeof provenance.governanceAuditDigest !== "string" || !SHA256.test(provenance.governanceAuditDigest) ||
    typeof provenance.requiredChecksDigest !== "string" || !SHA256.test(provenance.requiredChecksDigest) ||
    !Array.isArray(provenance.requiredCheckNames) || provenance.requiredCheckNames.length < 1 ||
    provenance.requiredCheckNames.length > 20 ||
    provenance.requiredCheckNames.some((entry) => typeof entry !== "string" || !SAFE_REFERENCE.test(entry)) ||
    new Set(provenance.requiredCheckNames).size !== provenance.requiredCheckNames.length ||
    typeof provenance.canonicalRemoteDigest !== "string" || !SHA256.test(provenance.canonicalRemoteDigest) ||
    typeof provenance.activeWorkItemTaskId !== "string" || !SAFE_REFERENCE.test(provenance.activeWorkItemTaskId) ||
    typeof provenance.candidateTreeSha !== "string" || !SHA.test(provenance.candidateTreeSha) ||
    provenance.baseAncestorOfCandidate !== true
  ) {
    throw new Error("SENA engineering worker repository preflight receipt is invalid.");
  }
  return structuredClone(receipt) as SenaEngineeringRepositoryPreflightReceipt;
}

export function parseSenaEngineeringEvidenceParameters(
  parameters: Record<string, unknown>,
  binding: SenaEngineeringRunBinding
): SenaEngineeringEvidenceParameters {
  if (!GITHUB_REPOSITORY.test(binding.repo) || !SHA.test(binding.baseSha) || !SHA.test(binding.candidateSha) ||
    !SHA256.test(binding.workRequestDigest)) {
    throw new Error("SENA engineering run binding is invalid.");
  }
  const evidence = record(parameters.engineeringEvidence, "evidence parameters");
  exact(evidence, [
    "ownerLane", "branch", "worktreePathHash", "allowedPaths", "targetKind",
    "repositoryPreflight", "candidateReceipt"
  ], "evidence parameters");
  const ownerLane = evidence.ownerLane;
  const branch = evidence.branch;
  const targetKind = evidence.targetKind as SenaEngineeringTargetKind;
  if (typeof ownerLane !== "string" || !OWNER_LANE.test(ownerLane) ||
    typeof branch !== "string" || !SAFE_BRANCH.test(branch) ||
    typeof evidence.worktreePathHash !== "string" || !SHA256.test(evidence.worktreePathHash) ||
    (targetKind !== "real-sena-read-only" && targetKind !== "fixture-repository")) {
    throw new Error("SENA engineering owner lane, branch, worktree, or target binding is invalid.");
  }
  const allowedPaths = canonicalUniquePaths(evidence.allowedPaths, "allowed paths");
  const repositoryPreflight = record(evidence.repositoryPreflight, "repository preflight");
  exact(repositoryPreflight, [
    "schemaVersion", "repo", "baseSha", "liveMainSha", "governanceRegistryDigest", "checkedAt",
    "featureWorkFrozen", "protectedMainGreen", "ownerConflict", "dirtyTarget", "headDrift",
    "allowedPathConflict", "externalSideEffects"
  ], "repository preflight");
  if (
    repositoryPreflight.schemaVersion !== SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight ||
    repositoryPreflight.repo !== binding.repo || repositoryPreflight.baseSha !== binding.baseSha ||
    repositoryPreflight.liveMainSha !== binding.baseSha ||
    typeof repositoryPreflight.governanceRegistryDigest !== "string" ||
      !SHA256.test(repositoryPreflight.governanceRegistryDigest) ||
    typeof repositoryPreflight.checkedAt !== "string" ||
      !Number.isFinite(Date.parse(repositoryPreflight.checkedAt)) ||
    repositoryPreflight.featureWorkFrozen !== false || repositoryPreflight.protectedMainGreen !== true ||
    repositoryPreflight.ownerConflict !== false || repositoryPreflight.dirtyTarget !== false ||
    repositoryPreflight.headDrift !== false || repositoryPreflight.allowedPathConflict !== false ||
    repositoryPreflight.externalSideEffects !== false
  ) {
    throw new Error("SENA engineering repository preflight is not admissible.");
  }
  const candidate = record(evidence.candidateReceipt, "candidate receipt");
  exact(candidate, [
    "schemaVersion", "repo", "branch", "baseSha", "candidateSha", "ownerLane",
    "changedPaths", "changedPathDigest"
  ], "candidate receipt");
  const changedPaths = canonicalUniquePaths(candidate.changedPaths, "changed paths");
  if (
    candidate.schemaVersion !== SENA_SCHEMA_VERSIONS.workflowEngineeringCandidateReceipt ||
    candidate.repo !== binding.repo || candidate.branch !== branch ||
    candidate.baseSha !== binding.baseSha || candidate.candidateSha !== binding.candidateSha ||
    candidate.ownerLane !== ownerLane ||
    typeof candidate.changedPathDigest !== "string" || !SHA256.test(candidate.changedPathDigest) ||
    candidate.changedPathDigest !== senaWorkflowDigest({ changedPaths })
  ) {
    throw new Error("SENA engineering candidate receipt does not match the exact run binding.");
  }
  if (changedPaths.some((changedPath) =>
    !allowedPaths.some((allowedPath) => senaEngineeringPathAllowed(changedPath, allowedPath)))) {
    throw new Error("SENA engineering candidate changed a path outside its allowed path scope.");
  }
  return {
    ownerLane,
    branch,
    worktreePathHash: evidence.worktreePathHash,
    allowedPaths,
    targetKind,
    repositoryPreflight: structuredClone(repositoryPreflight) as SenaEngineeringEvidenceParameters["repositoryPreflight"],
    candidateReceipt: {
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringCandidateReceipt,
      repo: binding.repo,
      branch,
      baseSha: binding.baseSha,
      candidateSha: binding.candidateSha,
      ownerLane,
      changedPaths,
      changedPathDigest: candidate.changedPathDigest
    }
  };
}

function requirePassedReceipts(
  receipts: SenaEngineeringGateReceipt[],
  evidence: SenaEngineeringEvidenceParameters,
  binding: SenaEngineeringRunBinding,
  names: SenaEngineeringGateName[]
) {
  const parsed = receipts.map((receipt) => parseGateReceipt(
    receipt,
    binding,
    evidence.targetKind,
    receipt.provenance.workflowRunId
  ));
  if (new Set(parsed.map((receipt) => receipt.gate)).size !== parsed.length) {
    throw new Error("SENA engineering worker gate receipts contain duplicates.");
  }
  return names.map((gate) => {
    const receipt = parsed.find((candidate) => candidate.gate === gate);
    if (!receipt) throw new Error(`SENA engineering ${gate} receipt is missing.`);
    if (receipt.status !== "passed") throw new Error(`SENA engineering ${gate} gate did not pass.`);
    return receipt;
  });
}

export type SenaEngineeringCommandSpec = {
  gate: SenaEngineeringGateName;
  commandId: string;
  executable: string;
  args: string[];
  fixture: boolean;
};

export type SenaEngineeringCommandResult = {
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  logSummaryDigest: string;
  isolation: SenaEngineeringIsolationProof;
};

export type SenaEngineeringCommandExecutor = (
  command: SenaEngineeringCommandSpec
) => Promise<SenaEngineeringCommandResult>;

export const SENA_ENGINEERING_REAL_COMMAND_PLAN: Record<Extract<SenaEngineeringGateName,
  "focused-tests" | "typecheck" | "lint" | "build" | "pilot-verify">, Omit<SenaEngineeringCommandSpec, "gate" | "fixture">> = {
  "focused-tests": { commandId: "sena-focused-tests-v1", executable: "npm", args: ["test"] },
  typecheck: { commandId: "sena-typecheck-v1", executable: "npx", args: ["tsc", "--noEmit"] },
  lint: { commandId: "sena-lint-v1", executable: "npm", args: ["run", "lint"] },
  build: { commandId: "sena-build-v1", executable: "npm", args: ["run", "build"] },
  "pilot-verify": { commandId: "sena-pilot-verify-v1", executable: "npm", args: ["run", "sena:pilot:verify"] }
};

function verificationGates(nodeId: string, targetKind: SenaEngineeringTargetKind): SenaEngineeringGateName[] {
  if (nodeId === "focused-gates") return ["focused-tests"];
  if (nodeId === "full-local-gate") return ["typecheck", "lint", "build", "pilot-verify"];
  if (nodeId === "shadow-release-model" && targetKind === "fixture-repository") {
    return ["pr-head-ci", "post-merge-main-ci", "deployment", "live-proof", "rollback"];
  }
  return [];
}

function commandForGate(gate: SenaEngineeringGateName, fixture: boolean): SenaEngineeringCommandSpec {
  if (!fixture && gate in SENA_ENGINEERING_REAL_COMMAND_PLAN) {
    const command = SENA_ENGINEERING_REAL_COMMAND_PLAN[gate as keyof typeof SENA_ENGINEERING_REAL_COMMAND_PLAN];
    return { gate, ...command, fixture: false };
  }
  return {
    gate,
    commandId: `sena-shadow-fixture-${gate}-v1`,
    executable: "node",
    args: ["--eval", `if (${JSON.stringify(gate)}.length < 1) process.exit(1)`],
    fixture: true
  };
}

export async function runSenaEngineeringVerificationNode(input: {
  nodeId: string;
  runId: string;
  evidence: SenaEngineeringEvidenceParameters;
  binding: SenaEngineeringRunBinding;
  executeCommand: SenaEngineeringCommandExecutor;
}) {
  const fixture = input.evidence.targetKind === "fixture-repository";
  const worktreeBindingDigest = senaWorkflowDigest({
    repo: input.binding.repo,
    baseSha: input.binding.baseSha,
    candidateSha: input.binding.candidateSha,
    worktreePathHash: input.evidence.worktreePathHash,
    targetKind: input.evidence.targetKind
  });
  const environmentDigest = senaWorkflowDigest({
    runtime: globalThis.process.version,
    platform: globalThis.process.platform,
    architecture: globalThis.process.arch,
    worktreeBindingDigest
  });
  const receipts: SenaEngineeringGateReceipt[] = [];
  for (const gate of verificationGates(input.nodeId, input.evidence.targetKind)) {
    const command = commandForGate(gate, fixture);
    let result: SenaEngineeringCommandResult;
    try {
      result = await input.executeCommand(command);
    } catch (error) {
      const timestamp = new Date().toISOString();
      result = {
        exitCode: 1,
        startedAt: timestamp,
        finishedAt: timestamp,
        logSummaryDigest: senaWorkflowDigest({
          commandId: command.commandId,
          errorClass: error instanceof Error ? error.name : "unknown"
        }),
        isolation: fixture ? {
          provider: "fixed-fixture-simulation",
          snapshotKind: "fixed-fixture",
          candidateTreeSha: input.binding.candidateSha,
          dependencyLockDigest: senaWorkflowDigest({ fixture: true, gate }),
          sandboxPolicyDigest: senaWorkflowDigest({ policy: "fixed-fixture-v1" }),
          filesystemPolicy: "fixed-fixture",
          readPolicy: "fixed-fixture",
          networkPolicy: "none",
          temporarySnapshot: true
        } : {
          provider: "macos-sandbox-exec",
          snapshotKind: "git-archive-exact-sha",
          candidateTreeSha: input.binding.candidateSha,
          dependencyLockDigest: senaWorkflowDigest({ missing: "dependency-lock" }),
          sandboxPolicyDigest: senaWorkflowDigest({ missing: "sandbox-policy" }),
          filesystemPolicy: "snapshot-write-only",
          readPolicy: "host-data-denied",
          networkPolicy: "loopback-only",
          temporarySnapshot: true
        }
      };
    }
    const receipt: SenaEngineeringGateReceipt = {
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringGateReceipt,
      gate,
      evidenceLayer: EXPECTED_LAYER[gate],
      status: result.exitCode === 0 ? "passed" : "failed",
      candidateSha: input.binding.candidateSha,
      commandDigest: senaWorkflowDigest(command),
      environmentDigest,
      logSummaryDigest: result.logSummaryDigest,
      exitCode: result.exitCode,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      fixture,
      externalSideEffects: false,
      artifactReferences: [],
      isolation: result.isolation,
      provenance: {
        issuer: "sena-workflow-worker",
        workflowRunId: input.runId,
        executionMode: fixture ? "fixture-simulation" : "exact-sha-sandbox",
        worktreeBindingDigest
      }
    };
    receipts.push(parseGateReceipt(receipt, input.binding, input.evidence.targetKind, input.runId));
  }
  return { receipts, worktreeBindingDigest, environmentDigest };
}

export function evaluateSenaEngineeringEvidenceNode(
  nodeId: string,
  evidence: SenaEngineeringEvidenceParameters,
  binding: SenaEngineeringRunBinding,
  trustedGateReceipts: SenaEngineeringGateReceipt[] = [],
  trustedRepositoryPreflight?: SenaEngineeringRepositoryPreflightReceipt
) {
  const workOrder = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringWorkOrder,
    mode: "shadow" as const,
    targetKind: evidence.targetKind,
    teamId: binding.teamId,
    repo: binding.repo,
    ownerLane: evidence.ownerLane,
    branch: evidence.branch,
    worktreePathHash: evidence.worktreePathHash,
    baseSha: binding.baseSha,
    workRequestDigest: binding.workRequestDigest,
    allowedPaths: evidence.allowedPaths,
    repositoryPreflightProposalDigest: senaWorkflowDigest(evidence.repositoryPreflight),
    externalSideEffectsAuthorized: false as const
  };
  let document: unknown;
  let filename: string | undefined;
  let schemaVersion: string | undefined;
  let receiptDigests: string[] = [];
  let receipts: SenaEngineeringGateReceipt[] = [];
  let evidenceLayers: Partial<SenaWorkflowRun["evidenceLayers"]> | undefined;
  if (nodeId === "repository-preflight") {
    document = parseSenaEngineeringRepositoryPreflightReceipt(
      trustedRepositoryPreflight,
      evidence,
      binding
    );
    filename = "sena-engineering-repository-preflight.json";
    schemaVersion = SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight;
  } else if (nodeId === "immutable-work-order") {
    document = workOrder;
    filename = "sena-engineering-work-order.json";
    schemaVersion = SENA_SCHEMA_VERSIONS.workflowEngineeringWorkOrder;
  } else if (nodeId === "candidate-sha-intake" || nodeId === "exact-sha-review") {
    document = evidence.candidateReceipt;
    filename = "sena-engineering-candidate-receipt.json";
    schemaVersion = SENA_SCHEMA_VERSIONS.workflowEngineeringCandidateReceipt;
  } else if (nodeId === "focused-gates") {
    receipts = requirePassedReceipts(trustedGateReceipts, evidence, binding, ["focused-tests"]);
    receiptDigests = receipts.map(senaWorkflowDigest);
  } else if (nodeId === "full-local-gate") {
    receipts = requirePassedReceipts(
      trustedGateReceipts,
      evidence,
      binding,
      ["typecheck", "lint", "build", "pilot-verify"]
    );
    receiptDigests = receipts.map(senaWorkflowDigest);
  } else if (nodeId === "shadow-release-model") {
    if (evidence.targetKind === "fixture-repository") {
      receipts = requirePassedReceipts(trustedGateReceipts, evidence, binding, [
        "pr-head-ci", "post-merge-main-ci", "deployment", "live-proof", "rollback"
      ]);
      receiptDigests = receipts.map(senaWorkflowDigest);
      // These receipts prove the fixture state-machine simulation. v1 remains
      // shadow-only, so real merge/deploy/live bands must stay not-run.
      evidenceLayers = { ci: "passed", merged: "not-run", deployed: "not-run", live: "not-run" };
    } else {
      evidenceLayers = { ci: "not-run", merged: "not-run", deployed: "not-run", live: "not-run" };
    }
  }
  const outputDigest = senaWorkflowDigest({
    nodeId,
    binding,
    workOrderDigest: senaWorkflowDigest(workOrder),
    candidateReceiptDigest: senaWorkflowDigest(evidence.candidateReceipt),
    repositoryPreflightReceiptDigest: nodeId === "repository-preflight" && document
      ? senaWorkflowDigest(document)
      : null,
    receiptDigests,
    evidenceLayers: evidenceLayers ?? null,
    externalSideEffects: false
  });
  return {
    outputDigest,
    receiptDigests,
    receipts,
    ...(document ? { document } : {}),
    ...(filename ? { filename } : {}),
    ...(schemaVersion ? { schemaVersion } : {}),
    ...(evidenceLayers ? { evidenceLayers } : {})
  };
}
