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

type SenaEngineeringTargetKind = "real-sena-read-only" | "fixture-repository";
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
  gateReceipts: SenaEngineeringGateReceipt[];
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

function parseGateReceipt(value: unknown, binding: SenaEngineeringRunBinding, targetKind: SenaEngineeringTargetKind) {
  const receipt = record(value, "gate receipt");
  exact(receipt, [
    "schemaVersion", "gate", "evidenceLayer", "status", "candidateSha", "commandDigest",
    "environmentDigest", "logSummaryDigest", "exitCode", "startedAt", "finishedAt", "fixture",
    "externalSideEffects", "artifactReferences"
  ], "gate receipt");
  const gate = receipt.gate as SenaEngineeringGateName;
  const startedAt = typeof receipt.startedAt === "string" ? Date.parse(receipt.startedAt) : Number.NaN;
  const finishedAt = typeof receipt.finishedAt === "string" ? Date.parse(receipt.finishedAt) : Number.NaN;
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
    !Array.isArray(receipt.artifactReferences) ||
    !receipt.artifactReferences.every((entry) => typeof entry === "string" && SAFE_REFERENCE.test(entry)) ||
    (receipt.status === "passed" && receipt.exitCode !== 0) ||
    (receipt.status !== "passed" && receipt.exitCode === 0)
  ) {
    throw new Error(`SENA engineering ${String(receipt.gate)} gate receipt is invalid.`);
  }
  return structuredClone(receipt) as SenaEngineeringGateReceipt;
}

export function parseSenaEngineeringEvidenceParameters(
  parameters: Record<string, unknown>,
  binding: SenaEngineeringRunBinding
): SenaEngineeringEvidenceParameters {
  if (!binding.repo || !SHA.test(binding.baseSha) || !SHA.test(binding.candidateSha) ||
    !SHA256.test(binding.workRequestDigest)) {
    throw new Error("SENA engineering run binding is invalid.");
  }
  const evidence = record(parameters.engineeringEvidence, "evidence parameters");
  exact(evidence, [
    "ownerLane", "branch", "worktreePathHash", "allowedPaths", "targetKind",
    "repositoryPreflight", "candidateReceipt", "gateReceipts"
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
  if (changedPaths.some((path) => !allowedPaths.includes(path))) {
    throw new Error("SENA engineering candidate changed a path outside its allowed path scope.");
  }
  if (!Array.isArray(evidence.gateReceipts) || evidence.gateReceipts.length > GATE_NAMES.size) {
    throw new Error("SENA engineering gate receipts are invalid.");
  }
  const gateReceipts = evidence.gateReceipts.map((receipt) => parseGateReceipt(receipt, binding, targetKind));
  if (new Set(gateReceipts.map((receipt) => receipt.gate)).size !== gateReceipts.length) {
    throw new Error("SENA engineering gate receipts contain duplicate gates.");
  }
  const requiredGates: SenaEngineeringGateName[] = [
    "focused-tests", "typecheck", "lint", "build", "pilot-verify",
    ...(targetKind === "fixture-repository"
      ? ["pr-head-ci", "post-merge-main-ci", "deployment", "live-proof", "rollback"] as SenaEngineeringGateName[]
      : [])
  ];
  const missingGate = requiredGates.find((gate) => !gateReceipts.some((receipt) => receipt.gate === gate));
  if (missingGate) throw new Error(`SENA engineering ${missingGate} receipt is missing.`);
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
    },
    gateReceipts
  };
}

function requirePassedReceipts(evidence: SenaEngineeringEvidenceParameters, names: SenaEngineeringGateName[]) {
  return names.map((gate) => {
    const receipt = evidence.gateReceipts.find((candidate) => candidate.gate === gate);
    if (!receipt) throw new Error(`SENA engineering ${gate} receipt is missing.`);
    if (receipt.status !== "passed") throw new Error(`SENA engineering ${gate} gate did not pass.`);
    return receipt;
  });
}

export function evaluateSenaEngineeringEvidenceNode(
  nodeId: string,
  evidence: SenaEngineeringEvidenceParameters,
  binding: SenaEngineeringRunBinding
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
    repositoryPreflightDigest: senaWorkflowDigest(evidence.repositoryPreflight),
    externalSideEffectsAuthorized: false as const
  };
  let document: unknown;
  let filename: string | undefined;
  let schemaVersion: string | undefined;
  let receiptDigests: string[] = [];
  let receipts: SenaEngineeringGateReceipt[] = [];
  let evidenceLayers: Partial<SenaWorkflowRun["evidenceLayers"]> | undefined;
  if (nodeId === "repository-preflight") {
    document = evidence.repositoryPreflight;
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
    receipts = requirePassedReceipts(evidence, ["focused-tests"]);
    receiptDigests = receipts.map(senaWorkflowDigest);
  } else if (nodeId === "full-local-gate") {
    receipts = requirePassedReceipts(evidence, ["typecheck", "lint", "build", "pilot-verify"]);
    receiptDigests = receipts.map(senaWorkflowDigest);
  } else if (nodeId === "shadow-release-model") {
    if (evidence.targetKind === "fixture-repository") {
      receipts = requirePassedReceipts(evidence, [
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
