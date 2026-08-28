import { describe, expect, it } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowAuditChainHead, senaWorkflowDigest } from "../workflow/canonical";
import {
  auditSenaWorkflowCloseoutInput,
  buildSenaWorkflowCloseout,
  senaWorkflowCloseoutCommitment,
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
    jobReferences: [],
    artifactReferences: [],
    approvalReferences: [],
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
  const receipts: SenaWorkflowStepReceipt[] = [];
  const approvals: SenaWorkflowApproval[] = [];
  const artifacts: SenaWorkflowArtifact[] = [];
  const receiptHeads = new Map<string, string>();

  for (const manifest of researchEvidenceGraphV1.nodes.filter((node) => node.id !== "evidence-closeout")) {
    const sequence = receipts.length + 1;
    const inputDigest = senaWorkflowDigest({ nodeId: manifest.id, kind: "input" });
    const predecessorReceiptHashes = researchEvidenceGraphV1.edges
      .filter((edge) => edge.to === manifest.id)
      .map((edge) => receiptHeads.get(edge.from)!)
      .filter(Boolean);
    const jobId = manifest.effect === "server-job" ? `server_job_${senaWorkflowDigest(manifest.id).slice(0, 24)}` : undefined;
    const artifactId = jobId ? `artifact_${senaWorkflowDigest(manifest.id).slice(0, 24)}` : undefined;
    if (jobId && artifactId) {
      run.jobReferences.push(jobId);
      run.artifactReferences.push(artifactId);
      artifacts.push({
        id: artifactId,
        runId: run.id,
        nodeId: manifest.id,
        filename: `${manifest.id}.json`,
        schemaVersion: "sena-test-job-result/v1",
        sha256: senaWorkflowDigest({ manifest: manifest.id, kind: "artifact" }),
        storageReference: `server-job:${jobId}#resultReceipt`,
        evidenceLayer: manifest.evidenceLayer,
        createdAt: generatedAt
      });
    }
    if (manifest.effect === "human-interrupt") {
      const approval: SenaWorkflowApproval = {
        schemaVersion: SENA_SCHEMA_VERSIONS.workflowApproval,
        id: `approval_${senaWorkflowDigest(manifest.id).slice(0, 24)}`,
        runId: run.id,
        nodeId: manifest.id,
        interruptId: `interrupt_${manifest.id}`,
        expectedVersion: run.version,
        actorUserIdHash: senaWorkflowDigest({ nodeId: manifest.id, actor: "pi" }),
        actorRole: "pi",
        decision: "approve",
        inputDigest,
        candidateOutputDigest: senaWorkflowDigest({ nodeId: manifest.id, kind: "candidate" }),
        decisionDigest: senaWorkflowDigest({ nodeId: manifest.id, kind: "decision" }),
        createdAt: generatedAt
      };
      approvals.push(approval);
      run.approvalReferences.push(approval.id);
    }
    const withoutHead = {
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowStepReceipt,
      id: `receipt_${senaWorkflowDigest(manifest.id).slice(0, 24)}`,
      runId: run.id,
      nodeId: manifest.id,
      attempt: 1,
      sequence,
      effectKey: senaWorkflowDigest({ nodeId: manifest.id, kind: "effect" }),
      predecessorReceiptHashes,
      inputDigest,
      outputDigest: senaWorkflowDigest({ nodeId: manifest.id, kind: "output" }),
      ...(jobId ? { jobId } : {}),
      artifactReferences: artifactId ? [artifactId] : [],
      actorType: manifest.effect === "human-interrupt" ? "human" as const : "worker" as const,
      codeSha: run.codeSha,
      evidenceLayer: manifest.evidenceLayer,
      startedAt: generatedAt,
      finishedAt: generatedAt,
      retryDisposition: "none" as const,
      previousAuditChainHead: receipts.at(-1)?.auditChainHead
    };
    const receipt: SenaWorkflowStepReceipt = {
      ...withoutHead,
      auditChainHead: senaWorkflowAuditChainHead({
        previousAuditChainHead: withoutHead.previousAuditChainHead,
        receiptWithoutAuditChainHead: withoutHead
      })
    };
    receipts.push(receipt);
    receiptHeads.set(manifest.id, receipt.auditChainHead);
  }

  const commitment = senaWorkflowCloseoutCommitment({ run, commands: [], receipts, approvals, artifacts });
  const commitmentArtifact: SenaWorkflowArtifact = {
    id: "artifact_closeout_commitment",
    runId: run.id,
    nodeId: "evidence-closeout",
    filename: "sena-workflow-closeout.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseout,
    sha256: commitment,
    storageReference: `workflow-closeout:${run.id}#commitment-v1`,
    evidenceLayer: "local",
    createdAt: generatedAt
  };
  artifacts.push(commitmentArtifact);
  run.artifactReferences.push(commitmentArtifact.id);
  const finalManifest = researchEvidenceGraphV1.nodes.find((node) => node.id === "evidence-closeout")!;
  const finalWithoutHead = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowStepReceipt,
    id: "receipt_evidence_closeout",
    runId: run.id,
    nodeId: finalManifest.id,
    attempt: 1,
    sequence: receipts.length + 1,
    effectKey: senaWorkflowDigest({ nodeId: finalManifest.id, kind: "effect" }),
    predecessorReceiptHashes: researchEvidenceGraphV1.edges
      .filter((edge) => edge.to === finalManifest.id)
      .map((edge) => receiptHeads.get(edge.from)!),
    inputDigest: senaWorkflowDigest({ nodeId: finalManifest.id, kind: "input" }),
    outputDigest: commitment,
    artifactReferences: [commitmentArtifact.id],
    actorType: "worker" as const,
    codeSha: run.codeSha,
    evidenceLayer: finalManifest.evidenceLayer,
    startedAt: generatedAt,
    finishedAt: generatedAt,
    retryDisposition: "none" as const,
    previousAuditChainHead: receipts.at(-1)?.auditChainHead
  };
  const finalReceipt: SenaWorkflowStepReceipt = {
    ...finalWithoutHead,
    auditChainHead: senaWorkflowAuditChainHead({
      previousAuditChainHead: finalWithoutHead.previousAuditChainHead,
      receiptWithoutAuditChainHead: finalWithoutHead
    })
  };
  receipts.push(finalReceipt);
  run.auditChainHead = finalReceipt.auditChainHead;
  run.receiptSequence = receipts.length;

  const command: SenaWorkflowCommand = {
    id: "command_start_1",
    runId: run.id,
    kind: "start",
    expectedVersion: 1,
    idempotencyKey: "closeout-start-key",
    payloadDigest: run.startPayloadDigest,
    payload: { sourceBindingDigest: run.sourceBindingDigest },
    status: "completed",
    attempts: 1,
    availableAt: run.createdAt,
    claimedBy: "workflow-worker-private-id",
    claimedAt: "2026-08-28T00:00:00.500Z",
    completedAt: "2026-08-28T00:00:00.900Z",
    createdAt: run.createdAt,
    updatedAt: "2026-08-28T00:00:00.900Z"
  };
  return { run, commands: [command], receipts, approvals, artifacts };
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
      receiptCount: researchEvidenceGraphV1.nodes.length,
      headHash: events.run.auditChainHead
    });
    expect(closeout.run.createdByUserIdHash).toBe(senaWorkflowDigest(events.run.createdByUserId));
    expect(closeout.run).not.toHaveProperty("createdByUserId");
    expect(closeout.commandHistory[0]).not.toHaveProperty("payload");
    expect(closeout.commandHistory[0]).not.toHaveProperty("claimedBy");
    expect(closeout.commandHistory[0].workerIdHash).toBe(senaWorkflowDigest("workflow-worker-private-id"));
    expect(closeout.retrySummary).toMatchObject({
      commandAttemptCount: 1,
      receiptRetryableCount: 0,
      deadLetteredCommandCount: 0
    });
    expect(closeout.componentArtifacts.map((artifact) => artifact.filename)).toEqual([
      "sena-workflow-run.json",
      "sena-workflow-step-receipts.json",
      "sena-workflow-approvals.json"
    ]);
    expect(closeout.componentArtifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true);
    expect(closeout.closeoutDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(closeout.closeoutCommitment).toMatchObject({
      nodeId: "evidence-closeout",
      receiptOutputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      artifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(closeout.closeoutCommitment?.receiptOutputDigest).toBe(closeout.closeoutCommitment?.artifactSha256);
    expect(buildSenaWorkflowCloseout({ ...events, generatedAt })).toEqual(closeout);
  });

  it("rejects an incomplete succeeded graph even when its remaining receipt chain is internally valid", () => {
    const events = fixture();
    const removed = events.receipts.find((receipt) => receipt.nodeId === "audit-fusion-math")!;
    events.receipts = events.receipts.filter((receipt) => receipt !== removed);
    expect(auditSenaWorkflowCloseoutInput(events).issueCodes).toContain("succeeded-graph-node-receipt-missing");
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
