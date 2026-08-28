import { describe, expect, it } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowAuditChainHead, senaWorkflowDigest } from "../workflow/canonical";
import {
  auditSenaWorkflowCloseoutInput,
  buildSenaWorkflowCloseout,
  SenaWorkflowCloseoutError
} from "../workflow/closeout";
import { researchEvidenceGraphV1 } from "../workflow/definitions";
import type {
  SenaWorkflowApproval,
  SenaWorkflowArtifact,
  SenaWorkflowCommand,
  SenaWorkflowRun,
  SenaWorkflowStepReceipt
} from "../workflow/types";

const generatedAt = "2026-08-28T01:02:03.000Z";

function fixture() {
  const run: SenaWorkflowRun = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: "workflow_closeout_research_1",
    version: 4,
    kind: "research-evidence",
    definitionVersion: "v1",
    definitionHash: researchEvidenceGraphV1.definitionHash,
    mode: "shadow",
    teamId: "team_closeout",
    projectId: "project_closeout",
    projectRevisionId: "revision_closeout_1",
    researchSourceClass: "fixture",
    sourceBindingDigest: "a".repeat(64),
    codeSha: "b".repeat(40),
    configDigest: "c".repeat(64),
    status: "succeeded",
    currentNodeId: "evidence-closeout",
    attempt: 1,
    blockers: [],
    jobReferences: ["job_validation_1"],
    artifactReferences: ["artifact_publication_1"],
    approvalReferences: ["approval_expert_1"],
    claimBoundary: "exploratory-only",
    evidenceLayers: {
      source: "passed",
      local: "passed",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    },
    startIdempotencyKey: "closeout-start-key",
    startPayloadDigest: "d".repeat(64),
    createdByUserId: "user_private_identifier",
    receiptSequence: 0,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: generatedAt
  };

  const firstWithoutHead = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowStepReceipt,
    id: "receipt_bind_1",
    runId: run.id,
    nodeId: "bind-source",
    attempt: 1,
    sequence: 1,
    effectKey: "bind-source:input-a",
    predecessorReceiptHashes: [],
    inputDigest: "e".repeat(64),
    outputDigest: "f".repeat(64),
    artifactReferences: [],
    actorType: "worker" as const,
    codeSha: run.codeSha,
    evidenceLayer: "source" as const,
    startedAt: "2026-08-28T00:00:01.000Z",
    finishedAt: "2026-08-28T00:00:02.000Z",
    retryDisposition: "none" as const,
    previousAuditChainHead: undefined
  };
  const first: SenaWorkflowStepReceipt = {
    ...firstWithoutHead,
    auditChainHead: senaWorkflowAuditChainHead({ receiptWithoutAuditChainHead: firstWithoutHead })
  };
  const secondWithoutHead = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowStepReceipt,
    id: "receipt_validation_1",
    runId: run.id,
    nodeId: "statistical-validation",
    attempt: 2,
    sequence: 2,
    predecessorReceiptHashes: [first.auditChainHead],
    inputDigest: "1".repeat(64),
    outputDigest: "2".repeat(64),
    jobId: "job_validation_1",
    artifactReferences: ["artifact_publication_1"],
    actorType: "worker" as const,
    codeSha: run.codeSha,
    evidenceLayer: "local" as const,
    startedAt: "2026-08-28T00:00:03.000Z",
    finishedAt: "2026-08-28T00:00:04.000Z",
    errorClass: "transient-worker-exit",
    retryDisposition: "retryable" as const,
    previousAuditChainHead: first.auditChainHead
  };
  const second: SenaWorkflowStepReceipt = {
    ...secondWithoutHead,
    auditChainHead: senaWorkflowAuditChainHead({
      previousAuditChainHead: first.auditChainHead,
      receiptWithoutAuditChainHead: secondWithoutHead
    })
  };
  run.auditChainHead = second.auditChainHead;
  run.receiptSequence = 2;

  const approval: SenaWorkflowApproval = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowApproval,
    id: "approval_expert_1",
    runId: run.id,
    nodeId: "expert-review-gate",
    interruptId: "interrupt_expert_1",
    expectedVersion: 3,
    actorUserIdHash: "3".repeat(64),
    actorRole: "pi",
    decision: "approve",
    inputDigest: "4".repeat(64),
    candidateOutputDigest: "5".repeat(64),
    decisionDigest: "6".repeat(64),
    createdAt: "2026-08-28T00:00:05.000Z"
  };
  const artifact: SenaWorkflowArtifact = {
    id: "artifact_publication_1",
    runId: run.id,
    nodeId: "publication-export",
    filename: "publication-package.zip",
    schemaVersion: "sena-publication-package/v1",
    sha256: "7".repeat(64),
    storageReference: "artifact://publication-package-1",
    evidenceLayer: "local",
    createdAt: "2026-08-28T00:00:06.000Z"
  };
  const command: SenaWorkflowCommand = {
    id: "command_start_1",
    runId: run.id,
    kind: "start",
    expectedVersion: 1,
    idempotencyKey: "closeout-start-key",
    payloadDigest: run.startPayloadDigest,
    payload: { sourceBindingDigest: run.sourceBindingDigest, providerSecret: undefined },
    status: "completed",
    attempts: 1,
    availableAt: run.createdAt,
    claimedBy: "workflow-worker-private-id",
    claimedAt: "2026-08-28T00:00:00.500Z",
    completedAt: "2026-08-28T00:00:00.900Z",
    createdAt: run.createdAt,
    updatedAt: "2026-08-28T00:00:00.900Z"
  };
  return { run, commands: [command], receipts: [first, second], approvals: [approval], artifacts: [artifact] };
}

describe("SENA EvidenceFlow closeout", () => {
  it("builds a deterministic redacted closeout while keeping workflow success separate from claim readiness", () => {
    const events = fixture();
    const closeout = buildSenaWorkflowCloseout({ ...events, generatedAt });

    expect(closeout.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.workflowCloseout);
    expect(closeout.workflowStatus).toBe("succeeded");
    expect(closeout.claimBoundary).toBe("exploratory-only");
    expect(closeout.auditChain).toMatchObject({
      algorithm: "sha256",
      status: "verified",
      receiptCount: 2,
      headHash: events.run.auditChainHead
    });
    expect(closeout.run.createdByUserIdHash).toBe(senaWorkflowDigest(events.run.createdByUserId));
    expect(closeout.run).not.toHaveProperty("createdByUserId");
    expect(closeout.commandHistory[0]).not.toHaveProperty("payload");
    expect(closeout.commandHistory[0]).not.toHaveProperty("claimedBy");
    expect(closeout.commandHistory[0].workerIdHash).toBe(senaWorkflowDigest("workflow-worker-private-id"));
    expect(closeout.retrySummary).toMatchObject({
      commandAttemptCount: 1,
      receiptRetryableCount: 1,
      deadLetteredCommandCount: 0
    });
    expect(closeout.componentArtifacts.map((artifact) => artifact.filename)).toEqual([
      "sena-workflow-run.json",
      "sena-workflow-step-receipts.json",
      "sena-workflow-approvals.json"
    ]);
    expect(closeout.componentArtifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true);
    expect(closeout.closeoutDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(buildSenaWorkflowCloseout({ ...events, generatedAt })).toEqual(closeout);
  });

  it("fails closed on receipt tampering and reports only stable issue codes", () => {
    const events = fixture();
    events.receipts[1] = { ...events.receipts[1], outputDigest: "8".repeat(64) };

    const audit = auditSenaWorkflowCloseoutInput(events);
    expect(audit.status).toBe("invalid");
    expect(audit.issueCodes).toContain("receipt-audit-head-mismatch");
    expect(() => buildSenaWorkflowCloseout({ ...events, generatedAt })).toThrow(SenaWorkflowCloseoutError);
    try {
      buildSenaWorkflowCloseout({ ...events, generatedAt });
    } catch (error) {
      expect((error as Error).message).not.toContain("8".repeat(64));
    }
  });

  it("rejects inference readiness derived from fixture evidence", () => {
    const events = fixture();
    events.run.claimBoundary = "inference-ready";

    expect(auditSenaWorkflowCloseoutInput(events).issueCodes).toContain(
      "fixture-inference-boundary-forbidden"
    );
    expect(() => buildSenaWorkflowCloseout({ ...events, generatedAt })).toThrow(SenaWorkflowCloseoutError);
  });

  it("rejects unknown predecessors, reference drift, and real external evidence claims in shadow engineering mode", () => {
    const events = fixture();
    events.receipts[1] = {
      ...events.receipts[1],
      predecessorReceiptHashes: ["9".repeat(64)]
    };
    events.run.approvalReferences = [];
    events.run.kind = "engineering-release";
    events.run.claimBoundary = undefined;
    events.run.evidenceLayers.deployed = "passed";

    expect(auditSenaWorkflowCloseoutInput(events).issueCodes).toEqual(expect.arrayContaining([
      "receipt-predecessor-not-found",
      "run-approval-reference-mismatch",
      "shadow-external-layer-passed"
    ]));
  });
});
