import { randomUUID } from "node:crypto";
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import {
  requireEnterprisePermission,
  type SenaEnterprisePermission
} from "../enterprise/access-control";
import { SenaEnterpriseError } from "../enterprise/errors";
import { assertServerJobQueueReady, serverJobQueueStatus } from "../enterprise/server-job-queue";
import { assertSenaServerJobWorkerExecutable } from "../enterprise/server-job-worker-capabilities";
import { readEnterpriseUploadMetadataAsync } from "../enterprise/import-analysis";
import {
  buildEnterpriseProjectEvidenceBinding,
  getEnterpriseCurrentProjectRevisionSourceReadOnlyAsync,
  getEnterpriseProjectRevisionByIdReadOnlyAsync
} from "../enterprise/team-project";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "./canonical";
import { assertSenaWorkflowCheckpointSafe } from "./checkpoint-policy";
import { senaWorkflowDefinition } from "./definitions";
import { parseSenaEngineeringEvidenceParameters } from "./engineering-evidence";
import {
  createSenaWorkflowPostgresStoreFromEnv,
  senaWorkflowPostgresRuntimeStatus
} from "./postgres-runtime";
import {
  SenaWorkflowStoreError,
  type SenaWorkflowPostgresStore
} from "./postgres-store";
import type {
  SenaWorkflowCommand,
  SenaWorkflowApproval,
  SenaWorkflowKind,
  SenaResearchSourceClass,
  SenaWorkflowRun
} from "./types";

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_REPO = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const START_FIELDS = new Set([
  "kind",
  "teamId",
  "projectId",
  "projectRevisionId",
  "repo",
  "baseSha",
  "candidateSha",
  "sourceBindingDigest",
  "workRequestDigest",
  "parameters"
]);
const WORKFLOW_REQUEST_MAX_BYTES = 64 * 1024;
const WORKFLOW_REQUEST_MAX_CHUNKS = 1_024;
const REASON_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "dead_lettered", "cancelled", "superseded"]);
const ACTION_FIELDS = {
  approve: new Set(["action", "expectedVersion", "interruptId", "decisionDigest"]),
  reject: new Set(["action", "expectedVersion", "interruptId", "reasonCode"]),
  retry: new Set(["action", "expectedVersion", "nodeId"]),
  cancel: new Set(["action", "expectedVersion", "reasonCode"]),
  fork: new Set(["action", "expectedVersion", "checkpointId", "newSourceBindingDigest"])
} as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SenaEnterpriseError("SENA workflow request must be a JSON object.", 422, "workflow_request_invalid");
  }
  return value as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new SenaEnterpriseError(`SENA workflow ${key} is required.`, 422, "workflow_request_invalid");
  }
  return value.trim();
}

function optionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new SenaEnterpriseError(`SENA workflow ${key} is invalid.`, 422, "workflow_request_invalid");
  }
  return value.trim();
}

function exactFields(body: Record<string, unknown>) {
  const unknown = Object.keys(body).filter((key) => !START_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new SenaEnterpriseError(
      "SENA workflow request contains unsupported fields.",
      422,
      "workflow_request_fields_invalid"
    );
  }
}

function workflowKind(body: Record<string, unknown>): SenaWorkflowKind {
  const value = requiredString(body, "kind");
  if (value !== "research-evidence" && value !== "engineering-release") {
    throw new SenaEnterpriseError("Unsupported SENA workflow kind.", 422, "workflow_kind_invalid");
  }
  return value;
}

function parameters(body: Record<string, unknown>) {
  if (body.parameters === undefined) return {};
  const value = object(body.parameters);
  assertSenaWorkflowCheckpointSafe(value, "workflow.parameters");
  return value;
}

function requiredWorkflowUploadIds(parametersValue: Record<string, unknown>, key: string) {
  const raw = parametersValue[key];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) {
    throw new SenaEnterpriseError(
      `SENA research workflow parameters.${key} must contain 1-100 upload pointers.`,
      422,
      "workflow_upload_binding_invalid"
    );
  }
  const uploadIds = raw.map((value) => typeof value === "string" ? value : "");
  if (uploadIds.some((value) => !/^upload_[a-f0-9]{24}$/.test(value)) ||
    new Set(uploadIds).size !== uploadIds.length) {
    throw new SenaEnterpriseError(
      `SENA research workflow parameters.${key} contains invalid or duplicate upload pointers.`,
      422,
      "workflow_upload_binding_invalid"
    );
  }
  return uploadIds;
}

function requiredResearchSourceClass(parametersValue: Record<string, unknown>): SenaResearchSourceClass {
  const value = parametersValue.researchSourceClass;
  if (value !== "fixture" && value !== "approved-pseudonymized") {
    throw new SenaEnterpriseError(
      "SENA research workflow parameters.researchSourceClass must explicitly identify fixture or approved pseudonymized evidence.",
      422,
      "workflow_research_source_class_invalid"
    );
  }
  return value;
}

function positiveExpectedVersion(body: Record<string, unknown>) {
  const value = body.expectedVersion;
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new SenaEnterpriseError(
      "SENA workflow expectedVersion must be a positive integer.",
      422,
      "workflow_expected_version_invalid"
    );
  }
  return Number(value);
}

function actionName(body: Record<string, unknown>): keyof typeof ACTION_FIELDS {
  const value = body.action;
  if (typeof value !== "string" || !(value in ACTION_FIELDS)) {
    throw new SenaEnterpriseError("Unsupported SENA workflow action.", 422, "workflow_action_invalid");
  }
  return value as keyof typeof ACTION_FIELDS;
}

function exactActionFields(body: Record<string, unknown>, action: keyof typeof ACTION_FIELDS) {
  if (Object.keys(body).some((key) => !ACTION_FIELDS[action].has(key))) {
    throw new SenaEnterpriseError(
      "SENA workflow action contains unsupported fields.",
      422,
      "workflow_action_fields_invalid"
    );
  }
}

function safeActionId(body: Record<string, unknown>, key: string) {
  const value = requiredString(body, key);
  if (!SAFE_ID.test(value)) {
    throw new SenaEnterpriseError(`SENA workflow ${key} is invalid.`, 422, "workflow_action_invalid");
  }
  return value;
}

function reasonCode(body: Record<string, unknown>) {
  const value = requiredString(body, "reasonCode");
  if (!REASON_CODE.test(value)) {
    throw new SenaEnterpriseError("SENA workflow reasonCode is invalid.", 422, "workflow_reason_code_invalid");
  }
  return value;
}

function membershipRole(context: SenaEnterpriseSessionContext, teamId: string) {
  const memberships = context.memberships.filter((membership) => (
    membership.teamId === teamId && membership.status === "active"
  ));
  if (memberships.length !== 1) {
    throw new SenaEnterpriseError(
      "SENA workflow actor membership is missing or ambiguous.",
      403,
      "workflow_actor_membership_invalid"
    );
  }
  return memberships[0].role;
}

function actionPermission(run: SenaWorkflowRun, nodeId?: string) {
  const definition = senaWorkflowDefinition(run.kind);
  if (!nodeId) return run.kind === "research-evidence" ? "analysis:run" : "team:manage";
  const node = definition.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new SenaEnterpriseError("SENA workflow action node is invalid.", 422, "workflow_action_node_invalid");
  }
  return (node.requiredPermission ?? (run.kind === "research-evidence" ? "analysis:run" : "team:manage")) as SenaEnterprisePermission;
}

function requireActionPermission(
  context: SenaEnterpriseSessionContext,
  run: SenaWorkflowRun,
  nodeId?: string
) {
  const permission = actionPermission(run, nodeId);
  requireEnterprisePermission(context, run.teamId, permission);
  return permission;
}

export function senaWorkflowDecisionDigest(input: {
  runId: string;
  nodeId: string;
  interruptId: string;
  inputDigest: string;
  candidateOutputDigest: string;
  decision: "approve" | "reject";
  reasonCode?: string;
}) {
  return senaWorkflowDigest({
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowDecision,
    runId: input.runId,
    nodeId: input.nodeId,
    interruptId: input.interruptId,
    inputDigest: input.inputDigest,
    candidateOutputDigest: input.candidateOutputDigest,
    decision: input.decision,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {})
  });
}

function actionToken(runId: string, idempotencyKey: string, action: string) {
  return senaWorkflowDigest({ runId, idempotencyKey, action });
}

function pendingCommand(input: {
  id: string;
  runId: string;
  kind: SenaWorkflowCommand["kind"];
  expectedVersion: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
}): SenaWorkflowCommand {
  assertSenaWorkflowCheckpointSafe(input.payload, "workflow.actionCommand.payload");
  return {
    id: input.id,
    runId: input.runId,
    kind: input.kind,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    payloadDigest: senaWorkflowDigest(input.payload),
    payload: input.payload,
    status: "pending",
    attempts: 0,
    availableAt: input.createdAt,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}

export function requireSenaWorkflowIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || !SAFE_ID.test(value)) {
    throw new SenaEnterpriseError(
      "A valid Idempotency-Key header is required for SENA workflow mutations.",
      422,
      "workflow_idempotency_key_required"
    );
  }
  return value;
}

export async function readSenaWorkflowJson(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new SenaEnterpriseError(
      "SENA workflow mutations require application/json.",
      422,
      "workflow_content_type_invalid"
    );
  }
  const declared = request.headers.get("content-length")?.trim();
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > WORKFLOW_REQUEST_MAX_BYTES)) {
    throw new SenaEnterpriseError("SENA workflow request is too large.", 413, "workflow_request_too_large");
  }
  if (!request.body) {
    throw new SenaEnterpriseError("SENA workflow request body is required.", 422, "workflow_request_invalid");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunkCount += 1;
    if (chunkCount > WORKFLOW_REQUEST_MAX_CHUNKS) {
      await reader.cancel().catch(() => undefined);
      throw new SenaEnterpriseError("SENA workflow request is too fragmented.", 413, "workflow_request_too_fragmented");
    }
    const chunk = value ?? new Uint8Array();
    if (chunk.byteLength > WORKFLOW_REQUEST_MAX_BYTES - bytes) {
      await reader.cancel().catch(() => undefined);
      throw new SenaEnterpriseError("SENA workflow request is too large.", 413, "workflow_request_too_large");
    }
    bytes += chunk.byteLength;
    chunks.push(chunk);
  }
  const bodyBytes = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes));
  } catch {
    throw new SenaEnterpriseError("SENA workflow request is invalid JSON.", 422, "workflow_request_invalid");
  }
}

export function requireSenaWorkflowCodeSha(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  const value = (env.SENA_WORKFLOW_CODE_SHA || env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
  if (!SHA.test(value)) {
    throw new SenaEnterpriseError(
      "SENA workflow code SHA is not configured.",
      503,
      "workflow_code_sha_unavailable"
    );
  }
  return value;
}

function mapStoreError(error: unknown): never {
  if (error instanceof SenaWorkflowStoreError) {
    throw new SenaEnterpriseError(error.message, error.status, error.code);
  }
  throw error;
}

export async function withSenaWorkflowStore<T>(
  operation: (store: SenaWorkflowPostgresStore) => Promise<T>,
  input: {
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    schemaName?: string;
  } = {}
) {
  const runtime = senaWorkflowPostgresRuntimeStatus(input.env);
  if (!runtime.configured) {
    throw new SenaEnterpriseError(
      "SENA EvidenceFlow requires its authoritative Postgres store.",
      503,
      "workflow_postgres_unavailable"
    );
  }
  const { store, pool } = createSenaWorkflowPostgresStoreFromEnv({
    env: input.env,
    schemaName: input.schemaName
  });
  try {
    return await operation(store);
  } catch (error) {
    mapStoreError(error);
  } finally {
    await pool.end();
  }
}

export async function createSenaWorkflowRun(input: {
  context: SenaEnterpriseSessionContext;
  body: unknown;
  idempotencyKey: string;
  codeSha?: string;
  now?: string;
  idFactory?: () => string;
  assertCapabilities?: (kind: SenaWorkflowKind) => void;
  resolveResearchRevision?: typeof getEnterpriseProjectRevisionByIdReadOnlyAsync;
  resolveUploadMetadata?: typeof readEnterpriseUploadMetadataAsync;
  store: Pick<SenaWorkflowPostgresStore, "createRunWithStartCommand">;
}) {
  if (!SAFE_ID.test(input.idempotencyKey)) {
    throw new SenaEnterpriseError("SENA workflow idempotency key is invalid.", 422, "workflow_idempotency_key_required");
  }
  const body = object(input.body);
  exactFields(body);
  const kind = workflowKind(body);
  const teamId = requiredString(body, "teamId");
  const definition = senaWorkflowDefinition(kind);
  let workflowParameters = parameters(body);
  const codeSha = (input.codeSha ?? requireSenaWorkflowCodeSha()).toLowerCase();
  if (!SHA.test(codeSha)) {
    throw new SenaEnterpriseError("SENA workflow code SHA is invalid.", 422, "workflow_code_sha_invalid");
  }

  let sourceBindingDigest: string;
  let binding: Pick<SenaWorkflowRun, "projectId" | "projectRevisionId" | "repo" | "baseSha" | "candidateSha">;
  let sourceEvidence: Record<string, unknown>;
  let researchSourceClass: SenaResearchSourceClass | undefined;
  if (kind === "research-evidence") {
    requireEnterprisePermission(input.context, teamId, "analysis:run");
    const projectId = requiredString(body, "projectId");
    const projectRevisionId = requiredString(body, "projectRevisionId");
    const revisionSource = await (input.resolveResearchRevision ?? getEnterpriseProjectRevisionByIdReadOnlyAsync)(
      input.context,
      projectId,
      projectRevisionId
    );
    if (revisionSource.currentProject.teamId !== teamId || revisionSource.revision.teamId !== teamId) {
      throw new SenaEnterpriseError(
        "SENA workflow team does not match the immutable project revision.",
        409,
        "workflow_project_team_mismatch"
      );
    }
    const importUploadIds = requiredWorkflowUploadIds(workflowParameters, "importUploadIds");
    const reliabilityUploadIds = requiredWorkflowUploadIds(workflowParameters, "reliabilityUploadIds");
    researchSourceClass = requiredResearchSourceClass(workflowParameters);
    const resolveUploads = input.resolveUploadMetadata ?? readEnterpriseUploadMetadataAsync;
    const [importUploads, reliabilityUploads] = await Promise.all([
      resolveUploads(input.context, { teamId, uploadIds: importUploadIds }),
      resolveUploads(input.context, { teamId, uploadIds: reliabilityUploadIds })
    ]);
    const uploadEvidence = (uploads: typeof importUploads) => uploads.map((upload) => ({
      id: upload.id,
      sha256: upload.sha256,
      size: upload.size,
      importProfile: upload.importProfile ?? null,
      scanStatus: upload.scanStatus
    }));
    const projectEvidence = buildEnterpriseProjectEvidenceBinding(revisionSource.sourceProject);
    sourceEvidence = {
      projectId,
      projectRevisionId,
      projectVersion: revisionSource.revision.version,
      snapshotSha256: projectEvidence.snapshotSha256,
      researchSourceClass,
      uploadBindings: {
        import: uploadEvidence(importUploads),
        reliability: uploadEvidence(reliabilityUploads)
      }
    };
    sourceBindingDigest = senaWorkflowDigest({ kind, teamId, ...sourceEvidence });
    binding = { projectId, projectRevisionId };
  } else {
    requireEnterprisePermission(input.context, teamId, "team:manage");
    const repo = requiredString(body, "repo");
    const baseSha = requiredString(body, "baseSha").toLowerCase();
    const candidateSha = optionalString(body, "candidateSha")?.toLowerCase();
    const workRequestDigest = requiredString(body, "workRequestDigest").toLowerCase();
    if (!SAFE_REPO.test(repo) || repo.includes("..") || !SHA.test(baseSha) ||
      (candidateSha && !SHA.test(candidateSha)) || !SHA256.test(workRequestDigest)) {
      throw new SenaEnterpriseError(
        "SENA engineering workflow binding is invalid.",
        422,
        "workflow_engineering_binding_invalid"
      );
    }
    if (!candidateSha) {
      throw new SenaEnterpriseError(
        "SENA engineering shadow workflow requires an exact candidate SHA receipt at admission.",
        422,
        "workflow_engineering_candidate_required"
      );
    }
    try {
      workflowParameters = {
        ...workflowParameters,
        engineeringEvidence: parseSenaEngineeringEvidenceParameters(workflowParameters, {
          teamId,
          repo,
          baseSha,
          candidateSha,
          workRequestDigest
        })
      };
    } catch (error) {
      throw new SenaEnterpriseError(
        error instanceof Error ? error.message : "SENA engineering evidence is invalid.",
        422,
        "workflow_engineering_evidence_invalid"
      );
    }
    sourceEvidence = { repo, baseSha, workRequestDigest };
    sourceBindingDigest = senaWorkflowDigest({ kind, teamId, ...sourceEvidence });
    binding = { repo, baseSha, ...(candidateSha ? { candidateSha } : {}) };
  }
  const suppliedBindingDigest = optionalString(body, "sourceBindingDigest")?.toLowerCase();
  if (suppliedBindingDigest && suppliedBindingDigest !== sourceBindingDigest) {
    throw new SenaEnterpriseError(
      "SENA workflow source binding drifted before run creation.",
      409,
      "workflow_source_binding_conflict"
    );
  }

  (input.assertCapabilities ?? ((workflowKindValue) => {
    if (workflowKindValue !== "research-evidence") return;
    assertServerJobQueueReady(serverJobQueueStatus());
    for (const jobKind of ["import", "analysis", "reliability", "validation", "publication-export"] as const) {
      assertSenaServerJobWorkerExecutable(jobKind);
    }
  }))(kind);

  const configDigest = senaWorkflowDigest({
    mode: definition.mode,
    parameters: workflowParameters
  });
  const createdAt = input.now ?? new Date().toISOString();
  const uniqueId = (input.idFactory ?? randomUUID)().replaceAll("-", "").toLowerCase();
  const runId = `workflow_run_${uniqueId}`;
  const startPayload = {
    action: "start",
    kind,
    definitionVersion: definition.definitionVersion,
    definitionHash: definition.definitionHash,
    teamId,
    ...binding,
    ...(researchSourceClass ? { researchSourceClass } : {}),
    sourceBindingDigest,
    sourceEvidence,
    codeSha,
    configDigest,
    parameters: workflowParameters
  };
  assertSenaWorkflowCheckpointSafe(startPayload, "workflow.startCommand.payload");
  const startPayloadDigest = senaWorkflowDigest(startPayload);
  const run: SenaWorkflowRun = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: runId,
    version: 1,
    kind,
    definitionVersion: definition.definitionVersion,
    definitionHash: definition.definitionHash,
    mode: definition.mode,
    teamId,
    ...binding,
    ...(researchSourceClass ? { researchSourceClass } : {}),
    sourceBindingDigest,
    codeSha,
    configDigest,
    status: "queued",
    currentNodeId: definition.nodes[0].id,
    attempt: 1,
    blockers: [],
    jobReferences: [],
    artifactReferences: [],
    approvalReferences: [],
    ...(kind === "research-evidence" ? { claimBoundary: "exploratory-only" as const } : {}),
    evidenceLayers: {
      source: "not-run",
      local: "not-run",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    },
    startIdempotencyKey: input.idempotencyKey,
    startPayloadDigest,
    createdByUserId: input.context.user.id,
    receiptSequence: 0,
    createdAt,
    updatedAt: createdAt
  };
  const command: SenaWorkflowCommand = {
    id: `workflow_command_${uniqueId}`,
    runId,
    kind: "start",
    expectedVersion: run.version,
    idempotencyKey: input.idempotencyKey,
    payloadDigest: startPayloadDigest,
    payload: startPayload,
    status: "pending",
    attempts: 0,
    availableAt: createdAt,
    createdAt,
    updatedAt: createdAt
  };
  try {
    return await input.store.createRunWithStartCommand({ run, command });
  } catch (error) {
    mapStoreError(error);
  }
}

type SenaWorkflowActionStore = Pick<
  SenaWorkflowPostgresStore,
  | "getRun"
  | "runEvents"
  | "recordApprovalAndEnqueueCommand"
  | "enqueueCommand"
  | "forkRun"
>;

function actionIdempotencyConflict(): never {
  throw new SenaEnterpriseError(
    "The SENA workflow Idempotency-Key is already bound to a different action.",
    409,
    "workflow_idempotency_conflict"
  );
}

function matchingCommandReplay(input: {
  command: SenaWorkflowCommand;
  kind: SenaWorkflowCommand["kind"];
  expectedVersion: number;
  payload: Record<string, unknown>;
}) {
  const payloadDigest = senaWorkflowDigest(input.payload);
  if (
    input.command.kind !== input.kind ||
    input.command.expectedVersion !== input.expectedVersion ||
    input.command.payloadDigest !== payloadDigest
  ) actionIdempotencyConflict();
  return input.command;
}

export async function performSenaWorkflowAction(input: {
  context: SenaEnterpriseSessionContext;
  runId: string;
  body: unknown;
  idempotencyKey: string;
  store: SenaWorkflowActionStore;
  now?: string;
  codeSha?: string;
  resolveCurrentResearchRevision?: typeof getEnterpriseCurrentProjectRevisionSourceReadOnlyAsync;
}) {
  if (!SAFE_ID.test(input.runId) || !SAFE_ID.test(input.idempotencyKey)) {
    throw new SenaEnterpriseError("SENA workflow action identity is invalid.", 422, "workflow_action_invalid");
  }
  const body = object(input.body);
  const action = actionName(body);
  exactActionFields(body, action);
  const expectedVersion = positiveExpectedVersion(body);
  const run = await input.store.getRun(input.runId);
  if (!run) throw new SenaEnterpriseError("SENA workflow run was not found.", 404, "workflow_run_not_found");
  const createdAt = input.now ?? new Date().toISOString();
  const token = actionToken(run.id, input.idempotencyKey, action);

  if (action === "approve" || action === "reject") {
    const decision = action;
    const interruptId = safeActionId(body, "interruptId");
    const rejectionReason = decision === "reject" ? reasonCode(body) : undefined;
    const events = await input.store.runEvents(run.id, run.teamId);
    const existingCommand = events.commands.find((command) => command.idempotencyKey === input.idempotencyKey);
    if (existingCommand) {
      const existingApproval = events.approvals.find((approval) => approval.interruptId === interruptId);
      if (
        !existingApproval ||
        existingApproval.expectedVersion !== expectedVersion ||
        existingApproval.decision !== decision ||
        existingApproval.reasonCode !== rejectionReason ||
        existingApproval.actorUserIdHash !== senaWorkflowDigest(input.context.user.id)
      ) actionIdempotencyConflict();
      requireActionPermission(input.context, run, existingApproval.nodeId);
      const expectedDecisionDigest = senaWorkflowDecisionDigest({
        runId: run.id,
        nodeId: existingApproval.nodeId,
        interruptId,
        inputDigest: existingApproval.inputDigest,
        candidateOutputDigest: existingApproval.candidateOutputDigest,
        decision,
        ...(rejectionReason ? { reasonCode: rejectionReason } : {})
      });
      if (existingApproval.decisionDigest !== expectedDecisionDigest) actionIdempotencyConflict();
      if (decision === "approve") {
        const suppliedDigest = requiredString(body, "decisionDigest").toLowerCase();
        if (!SHA256.test(suppliedDigest) || suppliedDigest !== expectedDecisionDigest) {
          throw new SenaEnterpriseError(
            "SENA workflow approval digest does not match the pending evidence.",
            409,
            "workflow_decision_digest_conflict"
          );
        }
      }
      const command = matchingCommandReplay({
        command: existingCommand,
        kind: "resume",
        expectedVersion,
        payload: {
          interruptId,
          decision,
          decisionDigest: expectedDecisionDigest,
          ...(rejectionReason ? { reasonCode: rejectionReason } : {})
        }
      });
      return { action, created: false, run, command, approval: existingApproval };
    }

    const pending = run.pendingInterrupt;
    if (run.status !== "waiting_human" || pending?.kind !== "waiting-human") {
      throw new SenaEnterpriseError(
        "SENA workflow run is not waiting for a human decision.",
        409,
        "workflow_human_interrupt_not_pending"
      );
    }
    if (pending.interruptId !== interruptId || pending.nodeId !== run.currentNodeId) {
      throw new SenaEnterpriseError(
        "SENA workflow interrupt is stale or belongs to another node.",
        409,
        "workflow_interrupt_conflict"
      );
    }
    const permission = requireActionPermission(input.context, run, pending.nodeId);
    if (pending.requiredPermission !== permission) {
      throw new SenaEnterpriseError(
        "SENA workflow interrupt permission drifted from the fixed graph definition.",
        409,
        "workflow_interrupt_permission_conflict"
      );
    }
    const decisionDigest = senaWorkflowDecisionDigest({
      runId: run.id,
      nodeId: pending.nodeId,
      interruptId,
      inputDigest: pending.inputDigest,
      candidateOutputDigest: pending.candidateOutputDigest,
      decision,
      ...(rejectionReason ? { reasonCode: rejectionReason } : {})
    });
    if (decision === "approve") {
      const suppliedDigest = requiredString(body, "decisionDigest").toLowerCase();
      if (!SHA256.test(suppliedDigest)) {
        throw new SenaEnterpriseError("SENA workflow decisionDigest is invalid.", 422, "workflow_decision_digest_invalid");
      }
      if (suppliedDigest !== decisionDigest) {
        throw new SenaEnterpriseError(
          "SENA workflow approval digest does not match the pending evidence.",
          409,
          "workflow_decision_digest_conflict"
        );
      }
    }
    const approval: SenaWorkflowApproval = {
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowApproval,
      id: `workflow_approval_${token.slice(0, 24)}`,
      runId: run.id,
      nodeId: pending.nodeId,
      interruptId,
      expectedVersion,
      actorUserIdHash: senaWorkflowDigest(input.context.user.id),
      actorRole: membershipRole(input.context, run.teamId),
      decision,
      ...(rejectionReason ? { reasonCode: rejectionReason } : {}),
      inputDigest: pending.inputDigest,
      candidateOutputDigest: pending.candidateOutputDigest,
      decisionDigest,
      createdAt
    };
    const command = pendingCommand({
      id: `workflow_command_${token.slice(0, 24)}`,
      runId: run.id,
      kind: "resume",
      expectedVersion,
      idempotencyKey: input.idempotencyKey,
      payload: {
        interruptId,
        decision,
        decisionDigest,
        ...(rejectionReason ? { reasonCode: rejectionReason } : {})
      },
      createdAt
    });
    try {
      return { action, ...await input.store.recordApprovalAndEnqueueCommand({
        teamId: run.teamId,
        approval,
        command
      }) };
    } catch (error) {
      mapStoreError(error);
    }
  }

  if (action === "cancel") {
    requireActionPermission(input.context, run);
    const cancellationReason = reasonCode(body);
    const payload = { action, reasonCode: cancellationReason };
    const events = await input.store.runEvents(run.id, run.teamId);
    const existing = events.commands.find((command) => command.idempotencyKey === input.idempotencyKey);
    if (existing) {
      return {
        action,
        created: false,
        run,
        command: matchingCommandReplay({ command: existing, kind: "cancel", expectedVersion, payload })
      };
    }
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      throw new SenaEnterpriseError("SENA workflow run is already terminal.", 409, "workflow_action_not_allowed");
    }
    const command = pendingCommand({
      id: `workflow_command_${token.slice(0, 24)}`,
      runId: run.id,
      kind: "cancel",
      expectedVersion,
      idempotencyKey: input.idempotencyKey,
      payload,
      createdAt
    });
    try {
      return { action, ...await input.store.enqueueCommand({ teamId: run.teamId, expectedVersion, command }) };
    } catch (error) {
      mapStoreError(error);
    }
  }

  if (action === "retry") {
    const nodeId = safeActionId(body, "nodeId");
    requireActionPermission(input.context, run, nodeId);
    const events = await input.store.runEvents(run.id, run.teamId);
    const existing = events.commands.find((command) => command.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (
        existing.kind !== "retry" ||
        existing.expectedVersion !== expectedVersion ||
        existing.payload.action !== "retry" ||
        existing.payload.nodeId !== nodeId ||
        existing.payloadDigest !== senaWorkflowDigest(existing.payload)
      ) actionIdempotencyConflict();
      return { action, created: false, run, command: existing };
    }
    if (!new Set(["blocked", "failed", "dead_lettered"]).has(run.status) || run.currentNodeId !== nodeId) {
      throw new SenaEnterpriseError("SENA workflow node is not retryable in its current state.", 409, "workflow_retry_not_allowed");
    }
    if (run.status === "blocked" && !run.blockers.some((blocker) => blocker.retryable)) {
      throw new SenaEnterpriseError("SENA workflow blocker requires remediation or a fork.", 422, "workflow_retry_not_allowed");
    }
    const payload = {
      action,
      nodeId,
      ...(run.pendingInterrupt ? { interruptId: run.pendingInterrupt.interruptId } : {})
    };
    const command = pendingCommand({
      id: `workflow_command_${token.slice(0, 24)}`,
      runId: run.id,
      kind: "retry",
      expectedVersion,
      idempotencyKey: input.idempotencyKey,
      payload,
      createdAt
    });
    try {
      return { action, ...await input.store.enqueueCommand({ teamId: run.teamId, expectedVersion, command }) };
    } catch (error) {
      mapStoreError(error);
    }
  }

  const checkpointId = safeActionId(body, "checkpointId");
  const suppliedSourceBindingDigest = requiredString(body, "newSourceBindingDigest").toLowerCase();
  if (!SHA256.test(suppliedSourceBindingDigest)) {
    throw new SenaEnterpriseError(
      "SENA workflow newSourceBindingDigest is invalid.",
      422,
      "workflow_source_binding_invalid"
    );
  }
  requireActionPermission(input.context, run);
  const definition = senaWorkflowDefinition(run.kind);
  const sourceEvents = await input.store.runEvents(run.id, run.teamId);
  const sourceCommand = sourceEvents.commands.find((command) => (
    command.kind === "start" || command.kind === "fork"
  ));
  if (!sourceCommand || sourceCommand.payloadDigest !== senaWorkflowDigest(sourceCommand.payload)) {
    throw new SenaEnterpriseError(
      "SENA workflow fork cannot verify the authoritative source command.",
      409,
      "workflow_fork_source_command_invalid"
    );
  }
  const sourceParameters = sourceCommand.payload.parameters;
  if (!sourceParameters || typeof sourceParameters !== "object" || Array.isArray(sourceParameters)) {
    throw new SenaEnterpriseError(
      "SENA workflow fork cannot recover the redacted source parameters.",
      409,
      "workflow_fork_parameters_missing"
    );
  }
  const originalSourceEvidence = sourceCommand.payload.sourceEvidence;
  if (!originalSourceEvidence || typeof originalSourceEvidence !== "object" || Array.isArray(originalSourceEvidence)) {
    throw new SenaEnterpriseError(
      "SENA workflow fork cannot recover the digest-bound source evidence.",
      409,
      "workflow_fork_source_evidence_missing"
    );
  }
  let sourceBindingDigest: string;
  let sourceEvidence: Record<string, unknown>;
  let binding: Pick<SenaWorkflowRun, "projectId" | "projectRevisionId" | "repo" | "baseSha" | "candidateSha">;
  if (run.kind === "research-evidence") {
    if (!run.projectId) {
      throw new SenaEnterpriseError("Research workflow project binding is missing.", 409, "workflow_source_binding_invalid");
    }
    const resolved = await (
      input.resolveCurrentResearchRevision ?? getEnterpriseCurrentProjectRevisionSourceReadOnlyAsync
    )(input.context, run.projectId);
    if (resolved.currentProject.teamId !== run.teamId || resolved.revision.teamId !== run.teamId) {
      throw new SenaEnterpriseError("Research workflow fork crossed a team boundary.", 409, "workflow_project_team_mismatch");
    }
    const originalUploadBindings = (originalSourceEvidence as Record<string, unknown>).uploadBindings;
    const originalResearchSourceClass = (originalSourceEvidence as Record<string, unknown>).researchSourceClass;
    if (originalResearchSourceClass !== "fixture" && originalResearchSourceClass !== "approved-pseudonymized") {
      throw new SenaEnterpriseError(
        "SENA workflow fork cannot recover the digest-bound research source classification.",
        409,
        "workflow_fork_source_class_missing"
      );
    }
    if (!originalUploadBindings || typeof originalUploadBindings !== "object" || Array.isArray(originalUploadBindings)) {
      throw new SenaEnterpriseError(
        "SENA workflow fork cannot recover the digest-bound upload evidence.",
        409,
        "workflow_fork_upload_binding_missing"
      );
    }
    const uploadBindingRecord = originalUploadBindings as Record<string, unknown>;
    if (!Array.isArray(uploadBindingRecord.import) || !Array.isArray(uploadBindingRecord.reliability)) {
      throw new SenaEnterpriseError(
        "SENA workflow fork upload evidence is invalid.",
        409,
        "workflow_fork_upload_binding_invalid"
      );
    }
    const evidence = buildEnterpriseProjectEvidenceBinding(resolved.sourceProject);
    sourceEvidence = {
      projectId: run.projectId,
      projectRevisionId: resolved.revision.id,
      projectVersion: resolved.revision.version,
      snapshotSha256: evidence.snapshotSha256,
      researchSourceClass: originalResearchSourceClass,
      uploadBindings: originalUploadBindings
    };
    sourceBindingDigest = senaWorkflowDigest({
      kind: run.kind,
      teamId: run.teamId,
      ...sourceEvidence
    });
    binding = { projectId: run.projectId, projectRevisionId: resolved.revision.id };
  } else {
    sourceBindingDigest = run.sourceBindingDigest;
    sourceEvidence = {
      repo: run.repo,
      baseSha: run.baseSha,
      candidateSha: run.candidateSha ?? null
    };
    binding = {
      ...(run.repo ? { repo: run.repo } : {}),
      ...(run.baseSha ? { baseSha: run.baseSha } : {}),
      ...(run.candidateSha ? { candidateSha: run.candidateSha } : {})
    };
  }
  if (suppliedSourceBindingDigest !== sourceBindingDigest) {
    throw new SenaEnterpriseError(
      "SENA workflow fork source binding does not match authoritative evidence.",
      409,
      "workflow_source_binding_conflict"
    );
  }
  const codeSha = (input.codeSha ?? requireSenaWorkflowCodeSha()).toLowerCase();
  if (!SHA.test(codeSha)) {
    throw new SenaEnterpriseError("SENA workflow code SHA is invalid.", 422, "workflow_code_sha_invalid");
  }
  const forkRunId = `workflow_run_${token.slice(0, 32)}`;
  const forkPayload = {
    action: "fork",
    sourceRunId: run.id,
    checkpointId,
    newSourceBindingDigest: sourceBindingDigest,
    sourceEvidence,
    definitionVersion: definition.definitionVersion,
    definitionHash: definition.definitionHash,
    codeSha,
    configDigest: run.configDigest,
    parameters: sourceParameters
  };
  assertSenaWorkflowCheckpointSafe(forkPayload, "workflow.forkCommand.payload");
  const forkPayloadDigest = senaWorkflowDigest(forkPayload);
  const forkedRun: SenaWorkflowRun = {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: forkRunId,
    version: 1,
    kind: run.kind,
    definitionVersion: definition.definitionVersion,
    definitionHash: definition.definitionHash,
    mode: definition.mode,
    teamId: run.teamId,
    ...binding,
    ...(run.kind === "research-evidence"
      ? { researchSourceClass: sourceEvidence.researchSourceClass as SenaResearchSourceClass }
      : {}),
    sourceBindingDigest,
    codeSha,
    configDigest: run.configDigest,
    status: "queued",
    currentNodeId: definition.nodes[0].id,
    attempt: 1,
    blockers: [],
    jobReferences: [],
    artifactReferences: [],
    approvalReferences: [],
    ...(run.kind === "research-evidence" ? { claimBoundary: "exploratory-only" as const } : {}),
    evidenceLayers: {
      source: "not-run",
      local: "not-run",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    },
    startIdempotencyKey: input.idempotencyKey,
    startPayloadDigest: forkPayloadDigest,
    createdByUserId: input.context.user.id,
    receiptSequence: 0,
    parentRunId: run.id,
    parentCheckpointId: checkpointId,
    createdAt,
    updatedAt: createdAt
  };
  const command = pendingCommand({
    id: `workflow_command_${token.slice(0, 24)}`,
    runId: forkedRun.id,
    kind: "fork",
    expectedVersion: forkedRun.version,
    idempotencyKey: input.idempotencyKey,
    payload: forkPayload,
    createdAt
  });
  try {
    const result = await input.store.forkRun({
      sourceRunId: run.id,
      teamId: run.teamId,
      expectedVersion,
      forkedRun,
      command
    });
    return { action, ...result, run: result.forkedRun };
  } catch (error) {
    mapStoreError(error);
  }
}
