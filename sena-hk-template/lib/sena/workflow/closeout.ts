import { listSenaWorkflowArtifacts } from "../artifact-catalog";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowAuditChainHead, senaWorkflowCanonicalJson, senaWorkflowDigest } from "./canonical";
import { senaWorkflowDefinition } from "./definitions";
import type {
  SenaWorkflowCloseout,
  SenaWorkflowCloseoutArtifactManifestEntry,
  SenaWorkflowCloseoutCommand,
  SenaWorkflowCloseoutRun,
  SenaWorkflowRunEvents,
  SenaWorkflowStepReceipt
} from "./types";

export type SenaWorkflowCloseoutAudit = {
  status: "verified" | "invalid";
  issueCodes: string[];
  receiptCount: number;
  headHash?: string;
};

export class SenaWorkflowCloseoutError extends Error {
  readonly issueCodes: string[];

  constructor(issueCodes: string[]) {
    super(`SENA EvidenceFlow closeout rejected (${issueCodes.join(",")}).`);
    this.name = "SenaWorkflowCloseoutError";
    this.issueCodes = [...issueCodes];
  }
}

function sameStringSet(left: string[], right: string[]) {
  return [...new Set(left)].sort().join("\n") === [...new Set(right)].sort().join("\n");
}

function receiptWithoutAuditChainHead(receipt: SenaWorkflowStepReceipt) {
  const { auditChainHead: _auditChainHead, ...withoutHead } = receipt;
  return withoutHead;
}

function addIf(condition: boolean, issues: Set<string>, code: string) {
  if (condition) issues.add(code);
}

export function auditSenaWorkflowCloseoutInput(input: SenaWorkflowRunEvents): SenaWorkflowCloseoutAudit {
  const issues = new Set<string>();
  const { run, commands, receipts, approvals, artifacts } = input;
  let definitionHash: string | undefined;
  try {
    definitionHash = senaWorkflowDefinition(run.kind).definitionHash;
  } catch {
    issues.add("run-definition-unsupported");
  }

  addIf(run.schemaVersion !== SENA_SCHEMA_VERSIONS.workflowRun, issues, "run-schema-mismatch");
  addIf(definitionHash !== undefined && run.definitionHash !== definitionHash, issues, "run-definition-hash-mismatch");
  addIf(commands.some((command) => command.runId !== run.id), issues, "command-run-binding-mismatch");
  addIf(receipts.some((receipt) => receipt.runId !== run.id), issues, "receipt-run-binding-mismatch");
  addIf(approvals.some((approval) => approval.runId !== run.id), issues, "approval-run-binding-mismatch");
  addIf(artifacts.some((artifact) => artifact.runId !== run.id), issues, "artifact-run-binding-mismatch");
  addIf(receipts.some((receipt) => receipt.schemaVersion !== SENA_SCHEMA_VERSIONS.workflowStepReceipt), issues, "receipt-schema-mismatch");
  addIf(approvals.some((approval) => approval.schemaVersion !== SENA_SCHEMA_VERSIONS.workflowApproval), issues, "approval-schema-mismatch");
  addIf(receipts.some((receipt) => receipt.codeSha !== run.codeSha), issues, "receipt-code-sha-mismatch");

  addIf(new Set(commands.map((command) => command.id)).size !== commands.length, issues, "duplicate-command-id");
  addIf(new Set(receipts.map((receipt) => receipt.id)).size !== receipts.length, issues, "duplicate-receipt-id");
  addIf(new Set(approvals.map((approval) => approval.id)).size !== approvals.length, issues, "duplicate-approval-id");
  addIf(new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length, issues, "duplicate-artifact-id");

  const seenReceiptHeads = new Set<string>();
  let previousHead: string | undefined;
  receipts.forEach((receipt, index) => {
    addIf(receipt.sequence !== index + 1, issues, "receipt-sequence-mismatch");
    addIf(receipt.previousAuditChainHead !== previousHead, issues, "receipt-previous-head-mismatch");
    const expectedHead = senaWorkflowAuditChainHead({
      previousAuditChainHead: previousHead,
      receiptWithoutAuditChainHead: receiptWithoutAuditChainHead(receipt)
    });
    addIf(receipt.auditChainHead !== expectedHead, issues, "receipt-audit-head-mismatch");
    addIf(
      receipt.predecessorReceiptHashes.some((hash) => !seenReceiptHeads.has(hash)),
      issues,
      "receipt-predecessor-not-found"
    );
    seenReceiptHeads.add(receipt.auditChainHead);
    previousHead = receipt.auditChainHead;
  });

  addIf(run.receiptSequence !== receipts.length, issues, "run-receipt-count-mismatch");
  addIf(run.auditChainHead !== previousHead, issues, "run-audit-head-mismatch");
  addIf(!sameStringSet(run.approvalReferences, approvals.map((approval) => approval.id)), issues, "run-approval-reference-mismatch");
  addIf(!sameStringSet(run.artifactReferences, artifacts.map((artifact) => artifact.id)), issues, "run-artifact-reference-mismatch");

  if (run.kind === "research-evidence") {
    addIf(run.claimBoundary !== "exploratory-only" && run.claimBoundary !== "inference-ready", issues, "research-claim-boundary-missing");
    addIf(
      run.researchSourceClass !== "fixture" && run.researchSourceClass !== "approved-pseudonymized",
      issues,
      "research-source-class-missing"
    );
    addIf(
      run.researchSourceClass === "fixture" && run.claimBoundary === "inference-ready",
      issues,
      "fixture-inference-boundary-forbidden"
    );
  }
  if (run.mode === "shadow") {
    addIf(
      [run.evidenceLayers.merged, run.evidenceLayers.deployed, run.evidenceLayers.live].includes("passed"),
      issues,
      "shadow-external-layer-passed"
    );
  }

  const issueCodes = [...issues].sort();
  return {
    status: issueCodes.length === 0 ? "verified" : "invalid",
    issueCodes,
    receiptCount: receipts.length,
    headHash: previousHead
  };
}

function redactedRun(run: SenaWorkflowRunEvents["run"]): SenaWorkflowCloseoutRun {
  const { createdByUserId, ...safeRun } = run;
  return {
    ...safeRun,
    createdByUserIdHash: senaWorkflowDigest(createdByUserId)
  };
}

function commandHistory(input: SenaWorkflowRunEvents["commands"]): SenaWorkflowCloseoutCommand[] {
  return input.map((command) => ({
    id: command.id,
    kind: command.kind,
    expectedVersion: command.expectedVersion,
    payloadDigest: command.payloadDigest,
    status: command.status,
    attempts: command.attempts,
    availableAt: command.availableAt,
    claimedAt: command.claimedAt,
    claimExpiresAt: command.claimExpiresAt,
    completedAt: command.completedAt,
    errorClass: command.errorClass,
    errorHash: command.errorHash,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    idempotencyKeyHash: senaWorkflowDigest(command.idempotencyKey),
    ...(command.claimedBy ? { workerIdHash: senaWorkflowDigest(command.claimedBy) } : {})
  }));
}

function manifestEntry(filename: string, schemaVersion: string, payload: unknown): SenaWorkflowCloseoutArtifactManifestEntry {
  const canonical = senaWorkflowCanonicalJson(payload);
  return {
    filename,
    schemaVersion,
    sha256: senaWorkflowDigest(payload),
    bytes: Buffer.byteLength(canonical, "utf8")
  };
}

export function buildSenaWorkflowCloseout(
  input: SenaWorkflowRunEvents & { generatedAt: string }
): SenaWorkflowCloseout {
  const audit = auditSenaWorkflowCloseoutInput(input);
  if (audit.status !== "verified") throw new SenaWorkflowCloseoutError(audit.issueCodes);

  const run = redactedRun(input.run);
  const commands = commandHistory(input.commands);
  const receipts = input.receipts.map((receipt) => ({ ...receipt }));
  const approvals = input.approvals.map((approval) => ({ ...approval }));
  const artifacts = input.artifacts.map((artifact) => ({ ...artifact }));
  const catalog = listSenaWorkflowArtifacts();
  const componentArtifacts = [
    manifestEntry("sena-workflow-run.json", SENA_SCHEMA_VERSIONS.workflowRun, run),
    manifestEntry("sena-workflow-step-receipts.json", SENA_SCHEMA_VERSIONS.workflowStepReceipt, receipts),
    manifestEntry("sena-workflow-approvals.json", SENA_SCHEMA_VERSIONS.workflowApproval, approvals)
  ];
  const catalogFilenames = new Set(catalog.map((entry) => entry.filename));
  if (componentArtifacts.some((artifact) => !catalogFilenames.has(artifact.filename))) {
    throw new SenaWorkflowCloseoutError(["workflow-artifact-catalog-mismatch"]);
  }

  const errorClasses = [...new Set([
    ...commands.map((command) => command.errorClass),
    ...receipts.map((receipt) => receipt.errorClass)
  ].filter((value): value is string => Boolean(value)))].sort();
  const core = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseout,
    generatedAt: input.generatedAt,
    runId: input.run.id,
    kind: input.run.kind,
    definitionVersion: input.run.definitionVersion,
    definitionHash: input.run.definitionHash,
    mode: input.run.mode,
    workflowStatus: input.run.status,
    ...(input.run.claimBoundary ? { claimBoundary: input.run.claimBoundary } : {}),
    evidenceLayers: { ...input.run.evidenceLayers },
    run,
    commandHistory: commands,
    stepReceipts: receipts,
    approvals,
    artifacts,
    componentArtifacts,
    auditChain: {
      algorithm: "sha256" as const,
      status: "verified" as const,
      receiptCount: audit.receiptCount,
      ...(audit.headHash ? { headHash: audit.headHash } : {}),
      issueCodes: [] as []
    },
    retrySummary: {
      commandAttemptCount: commands.reduce((sum, command) => sum + command.attempts, 0),
      retriedCommandCount: commands.filter((command) => command.attempts > 1).length,
      deadLetteredCommandCount: commands.filter((command) => command.status === "dead_lettered").length,
      receiptRetryableCount: receipts.filter((receipt) => receipt.retryDisposition === "retryable").length,
      receiptTerminalFailureCount: receipts.filter((receipt) => receipt.retryDisposition === "terminal" || receipt.retryDisposition === "dead-letter").length,
      errorClasses
    },
    evidenceBoundary: {
      workflowCompletionDoesNotImplyInferenceReadiness: true as const,
      evidenceLayersAreIndependent: true as const,
      externalGitOrDeploymentSideEffects: "none" as const
    }
  };
  const closeoutDigest = senaWorkflowDigest(core);
  const closeoutCatalog = catalog.find((entry) => entry.filename === "sena-workflow-closeout.json");
  if (!closeoutCatalog) throw new SenaWorkflowCloseoutError(["workflow-closeout-catalog-missing"]);
  const closeoutArtifact = {
    filename: closeoutCatalog.filename,
    schemaVersion: closeoutCatalog.schemaVersion,
    sha256: closeoutDigest,
    bytes: Buffer.byteLength(senaWorkflowCanonicalJson(core), "utf8")
  };

  return {
    ...core,
    closeoutArtifact,
    closeoutDigest
  };
}
