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

const closeoutNodeId = "evidence-closeout";
const closeoutCommitmentFilename = "sena-workflow-closeout-commitment.json";
const finalCloseoutStatuses = new Set(["succeeded", "cancelled", "superseded"]);
const provisionalCloseoutStatuses = new Set(["failed", "dead_lettered"]);

function matchingCloseoutCommitmentArtifact(
  artifacts: SenaWorkflowRunEvents["artifacts"],
  commitment: string
) {
  return artifacts.find((artifact) => (
    artifact.nodeId === closeoutNodeId &&
    artifact.filename === closeoutCommitmentFilename &&
    artifact.sha256 === commitment
  ));
}

function committedCommandHistory(commands: SenaWorkflowRunEvents["commands"]) {
  const finalCommand = [...commands]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .at(-1);
  return commands.map((command) => ({
    id: command.id,
    kind: command.kind,
    expectedVersion: command.expectedVersion,
    payloadDigest: command.payloadDigest,
    status: command.id === finalCommand?.id ? "settlement-normalized" : command.status,
    attempts: command.attempts,
    availableAt: command.availableAt,
    claimedAt: command.claimedAt ?? null,
    errorClass: command.errorClass ?? null,
    errorHash: command.errorHash ?? null,
    createdAt: command.createdAt,
    idempotencyKeyHash: senaWorkflowDigest(command.idempotencyKey),
    workerIdHash: command.claimedBy ? senaWorkflowDigest(command.claimedBy) : null
  }));
}

export function senaWorkflowCloseoutCommitment(input: SenaWorkflowRunEvents) {
  return senaWorkflowDigest({
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseoutCommitment,
    run: {
      id: input.run.id,
      kind: input.run.kind,
      teamId: input.run.teamId,
      definitionHash: input.run.definitionHash,
      sourceBindingDigest: input.run.sourceBindingDigest,
      codeSha: input.run.codeSha,
      configDigest: input.run.configDigest,
      claimBoundary: input.run.claimBoundary ?? null,
      evidenceLayers: input.run.evidenceLayers
    },
    commands: committedCommandHistory(input.commands),
    receipts: input.receipts
      .filter((receipt) => receipt.nodeId !== closeoutNodeId)
      .map((receipt) => ({ ...receipt })),
    approvals: input.approvals.map((approval) => ({ ...approval })),
    artifacts: input.artifacts
      .filter((artifact) => !(
        artifact.nodeId === closeoutNodeId && artifact.filename === closeoutCommitmentFilename
      ))
      .map((artifact) => ({ ...artifact })),
    sealBoundary: {
      finalReceiptExcludedToAvoidSelfReference: true,
      commitmentArtifactExcludedToAvoidSelfReference: true,
      finalCommandTransportStatusNormalized: true,
      rawPayloadsExcluded: true
    }
  });
}

export function auditSenaWorkflowCloseoutInput(input: SenaWorkflowRunEvents): SenaWorkflowCloseoutAudit {
  const issues = new Set<string>();
  const { run, commands, receipts, approvals, artifacts } = input;
  let definitionHash: string | undefined;
  let definition: ReturnType<typeof senaWorkflowDefinition> | undefined;
  addIf(
    !finalCloseoutStatuses.has(run.status) && !provisionalCloseoutStatuses.has(run.status),
    issues,
    "closeout-run-status-not-exportable"
  );
  try {
    definition = senaWorkflowDefinition(run.kind);
    definitionHash = definition.definitionHash;
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

  if (run.status === "succeeded" && definition) {
    const receiptsByNode = new Map<string, SenaWorkflowStepReceipt[]>();
    for (const receipt of receipts) {
      receiptsByNode.set(receipt.nodeId, [...(receiptsByNode.get(receipt.nodeId) ?? []), receipt]);
    }
    const definitionNodeIds = new Set(definition.nodes.map((node) => node.id));
    addIf(
      receipts.some((receipt) => !definitionNodeIds.has(receipt.nodeId)),
      issues,
      "succeeded-graph-unknown-node-receipt"
    );
    for (const node of definition.nodes) {
      const matches = receiptsByNode.get(node.id) ?? [];
      addIf(matches.length === 0, issues, "succeeded-graph-node-receipt-missing");
      addIf(matches.length > 1, issues, "succeeded-graph-node-receipt-duplicate");
      const receipt = matches[0];
      if (!receipt) continue;
      addIf(receipt.evidenceLayer !== node.evidenceLayer, issues, "succeeded-graph-evidence-layer-mismatch");
      const expectedPredecessors = definition.edges
        .filter((edge) => edge.to === node.id)
        .map((edge) => receiptsByNode.get(edge.from)?.[0]?.auditChainHead)
        .filter((value): value is string => Boolean(value));
      addIf(
        !sameStringSet(receipt.predecessorReceiptHashes, expectedPredecessors),
        issues,
        "succeeded-graph-predecessor-mismatch"
      );
      if (node.effect === "human-interrupt") {
        addIf(
          !approvals.some((approval) => (
            approval.nodeId === node.id &&
            approval.inputDigest === receipt.inputDigest &&
            approval.decision === "approve"
          )),
          issues,
          "succeeded-graph-approval-missing"
        );
      }
      if (node.effect === "server-job") {
        addIf(!receipt.jobId, issues, "succeeded-graph-job-binding-missing");
        addIf(
          Boolean(receipt.jobId) && !run.jobReferences.includes(receipt.jobId!),
          issues,
          "succeeded-graph-job-reference-missing"
        );
      }
    }
    const finalReceipt = receiptsByNode.get(closeoutNodeId)?.[0];
    const commitment = senaWorkflowCloseoutCommitment(input);
    const commitmentArtifact = matchingCloseoutCommitmentArtifact(artifacts, commitment);
    addIf(!finalReceipt || finalReceipt.sequence !== receipts.length, issues, "succeeded-closeout-receipt-not-final");
    addIf(finalReceipt?.outputDigest !== commitment, issues, "succeeded-closeout-commitment-mismatch");
    addIf(
      !commitmentArtifact || commitmentArtifact.sha256 !== commitment,
      issues,
      "succeeded-closeout-artifact-missing"
    );
  }

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
  const { createdByUserId, startIdempotencyKey, ...safeRun } = run;
  return {
    ...safeRun,
    createdByUserIdHash: senaWorkflowDigest(createdByUserId),
    startIdempotencyKeyHash: senaWorkflowDigest(startIdempotencyKey)
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
    snapshotKind: provisionalCloseoutStatuses.has(input.run.status) ? "provisional" as const : "final" as const,
    boundRunVersion: input.run.version,
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
    closeoutDigest,
    ...(input.run.status === "succeeded"
      ? {
          closeoutCommitment: {
            nodeId: closeoutNodeId as "evidence-closeout",
            receiptOutputDigest: input.receipts.find((receipt) => receipt.nodeId === closeoutNodeId)!.outputDigest,
            artifactSha256: matchingCloseoutCommitmentArtifact(
              input.artifacts,
              input.receipts.find((receipt) => receipt.nodeId === closeoutNodeId)!.outputDigest
            )!.sha256
          }
        }
      : {})
  };
}

export function senaWorkflowCloseoutGeneratedAt(events: SenaWorkflowRunEvents) {
  return events.receipts.find((receipt) => receipt.nodeId === closeoutNodeId)?.finishedAt ?? events.run.updatedAt;
}
