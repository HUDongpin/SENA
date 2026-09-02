import type { SENA_SCHEMA_VERSIONS } from "../schema-registry";

export type SenaWorkflowKind = "research-evidence" | "engineering-release";

export type SenaWorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting_job"
  | "waiting_human"
  | "blocked"
  | "succeeded"
  | "failed"
  | "dead_lettered"
  | "cancelled"
  | "superseded";

export type SenaEvidenceLayer = "source" | "local" | "ci" | "merged" | "deployed" | "live";
export type SenaClaimBoundary = "exploratory-only" | "inference-ready";
export type SenaResearchSourceClass = "fixture" | "approved-pseudonymized";
export type SenaWorkflowMode = "shadow";

export type SenaWorkflowNodeManifest = {
  id: string;
  label: string;
  ownerLanes: string[];
  effect: "read-only" | "server-job" | "human-interrupt" | "artifact-write" | "closeout";
  requiredPermission?: string;
  evidenceLayer: SenaEvidenceLayer;
};

export type SenaWorkflowEdgeManifest = {
  from: string;
  to: string;
  condition?: string;
};

export type SenaWorkflowDefinitionManifest = {
  schemaVersion: (typeof SENA_SCHEMA_VERSIONS)["workflowDefinition"];
  kind: SenaWorkflowKind;
  definitionVersion: "v1";
  mode: SenaWorkflowMode;
  nodes: SenaWorkflowNodeManifest[];
  edges: SenaWorkflowEdgeManifest[];
  permanentProhibitions: string[];
  definitionHash: string;
};

export type SenaWorkflowBlocker = {
  code: string;
  message: string;
  nodeId?: string;
  jobId?: string;
  retryable: boolean;
};

export type SenaWorkflowPendingInterrupt =
  | {
      kind: "waiting-human";
      nodeId: string;
      interruptId: string;
      checkpointId?: string;
      inputDigest: string;
      candidateOutputDigest: string;
      requiredPermission: string;
    }
  | {
      kind: "waiting-job";
      nodeId: string;
      interruptId: string;
      checkpointId?: string;
      inputDigest: string;
      jobId: string;
    }
  | {
      kind: "blocked";
      nodeId: string;
      interruptId: string;
      checkpointId?: string;
      inputDigest: string;
      blocker: SenaWorkflowBlocker;
    };

export type SenaWorkflowRun = {
  schemaVersion: (typeof SENA_SCHEMA_VERSIONS)["workflowRun"];
  id: string;
  version: number;
  kind: SenaWorkflowKind;
  definitionVersion: "v1";
  definitionHash: string;
  mode: SenaWorkflowMode;
  teamId: string;
  projectId?: string;
  projectRevisionId?: string;
  researchSourceClass?: SenaResearchSourceClass;
  repo?: string;
  baseSha?: string;
  candidateSha?: string;
  sourceBindingDigest: string;
  codeSha: string;
  configDigest: string;
  status: SenaWorkflowRunStatus;
  currentNodeId: string;
  pendingInterrupt?: SenaWorkflowPendingInterrupt;
  attempt: number;
  blockers: SenaWorkflowBlocker[];
  jobReferences: string[];
  artifactReferences: string[];
  approvalReferences: string[];
  claimBoundary?: SenaClaimBoundary;
  evidenceLayers: Record<SenaEvidenceLayer, "not-run" | "running" | "passed" | "failed" | "blocked">;
  startIdempotencyKey: string;
  startPayloadDigest: string;
  createdByUserId: string;
  auditChainHead?: string;
  receiptSequence: number;
  parentRunId?: string;
  parentCheckpointId?: string;
  supersededByRunId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaWorkflowCommandKind = "start" | "resume" | "retry" | "cancel" | "fork" | "job-terminal";

export type SenaWorkflowCommand = {
  id: string;
  runId: string;
  kind: SenaWorkflowCommandKind;
  expectedVersion: number;
  idempotencyKey: string;
  payloadDigest: string;
  payload: Record<string, unknown>;
  status: "pending" | "claimed" | "completed" | "failed" | "dead_lettered";
  attempts: number;
  availableAt: string;
  claimedBy?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  completedAt?: string;
  errorClass?: string;
  errorHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaWorkflowStepReceipt = {
  schemaVersion: (typeof SENA_SCHEMA_VERSIONS)["workflowStepReceipt"];
  id: string;
  runId: string;
  nodeId: string;
  attempt: number;
  sequence: number;
  effectKey?: string;
  predecessorReceiptHashes: string[];
  inputDigest: string;
  outputDigest: string;
  jobId?: string;
  artifactReferences: string[];
  actorType: "system" | "worker" | "human";
  actorIdHash?: string;
  codeSha: string;
  evidenceLayer: SenaEvidenceLayer;
  statePatch?: {
    claimBoundary?: SenaClaimBoundary;
    evidenceLayers?: Partial<SenaWorkflowRun["evidenceLayers"]>;
  };
  startedAt: string;
  finishedAt: string;
  errorClass?: string;
  retryDisposition: "none" | "retryable" | "terminal" | "dead-letter";
  previousAuditChainHead?: string;
  auditChainHead: string;
};

export type SenaWorkflowApproval = {
  schemaVersion: (typeof SENA_SCHEMA_VERSIONS)["workflowApproval"];
  id: string;
  runId: string;
  nodeId: string;
  interruptId: string;
  expectedVersion: number;
  actorUserIdHash: string;
  actorRole: string;
  decision: "approve" | "reject";
  reasonCode?: string;
  inputDigest: string;
  candidateOutputDigest: string;
  decisionDigest: string;
  createdAt: string;
};

export type SenaWorkflowArtifact = {
  id: string;
  runId: string;
  nodeId: string;
  filename: string;
  schemaVersion: string;
  sha256: string;
  storageReference: string;
  evidenceLayer: SenaEvidenceLayer;
  createdAt: string;
};

export type SenaWorkflowCloseoutRun = Omit<
  SenaWorkflowRun,
  "createdByUserId" | "startIdempotencyKey"
> & {
  createdByUserIdHash: string;
  startIdempotencyKeyHash: string;
};

export type SenaWorkflowCloseoutCommand = Pick<
  SenaWorkflowCommand,
  | "id"
  | "kind"
  | "expectedVersion"
  | "payloadDigest"
  | "status"
  | "attempts"
  | "availableAt"
  | "claimedAt"
  | "claimExpiresAt"
  | "completedAt"
  | "errorClass"
  | "errorHash"
  | "createdAt"
  | "updatedAt"
> & {
  idempotencyKeyHash: string;
  workerIdHash?: string;
};

export type SenaWorkflowCloseoutArtifactManifestEntry = {
  filename: string;
  schemaVersion: string;
  sha256: string;
  bytes: number;
};

export type SenaWorkflowCloseout = {
  schemaVersion: (typeof SENA_SCHEMA_VERSIONS)["workflowCloseout"];
  generatedAt: string;
  runId: string;
  snapshotKind: "final" | "provisional";
  boundRunVersion: number;
  kind: SenaWorkflowKind;
  definitionVersion: "v1";
  definitionHash: string;
  mode: SenaWorkflowMode;
  workflowStatus: SenaWorkflowRunStatus;
  claimBoundary?: SenaClaimBoundary;
  evidenceLayers: SenaWorkflowRun["evidenceLayers"];
  run: SenaWorkflowCloseoutRun;
  commandHistory: SenaWorkflowCloseoutCommand[];
  stepReceipts: SenaWorkflowStepReceipt[];
  approvals: SenaWorkflowApproval[];
  artifacts: SenaWorkflowArtifact[];
  componentArtifacts: SenaWorkflowCloseoutArtifactManifestEntry[];
  closeoutArtifact: SenaWorkflowCloseoutArtifactManifestEntry;
  auditChain: {
    algorithm: "sha256";
    status: "verified";
    receiptCount: number;
    headHash?: string;
    issueCodes: [];
  };
  retrySummary: {
    commandAttemptCount: number;
    retriedCommandCount: number;
    deadLetteredCommandCount: number;
    receiptRetryableCount: number;
    receiptTerminalFailureCount: number;
    errorClasses: string[];
  };
  evidenceBoundary: {
    workflowCompletionDoesNotImplyInferenceReadiness: true;
    evidenceLayersAreIndependent: true;
    externalGitOrDeploymentSideEffects: "none";
  };
  closeoutDigest: string;
  closeoutCommitment?: {
    nodeId: "evidence-closeout";
    receiptOutputDigest: string;
    artifactSha256: string;
  };
};

export type SenaWorkflowRunEvents = {
  run: SenaWorkflowRun;
  commands: SenaWorkflowCommand[];
  receipts: SenaWorkflowStepReceipt[];
  approvals: SenaWorkflowApproval[];
  artifacts: SenaWorkflowArtifact[];
};

export type SenaWorkflowAction =
  | { action: "approve"; interruptId: string; decisionDigest: string }
  | { action: "reject"; interruptId: string; reasonCode: string }
  | { action: "retry"; nodeId: string }
  | { action: "cancel"; reasonCode: string }
  | { action: "fork"; checkpointId: string; newSourceBindingDigest: string };
