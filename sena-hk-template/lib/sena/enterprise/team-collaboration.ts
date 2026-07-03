import { createHmac, randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  createEnterprisePostgresAdjudicationAdapterFromEnv,
  createEnterprisePostgresExpertReviewAdapterFromEnv,
  createEnterprisePostgresProjectCommentAdapterFromEnv,
  createEnterprisePostgresProjectPresenceAdapterFromEnv,
  createEnterprisePostgresReliabilityRunAdapterFromEnv,
  createEnterprisePostgresValidationRunAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import {
  notifyProjectReaders
} from "./notifications-delivery";
import { appendAudit } from "./ops-audit";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import {
  enterpriseDbPath,
  now
} from "./ops-runtime";
import {
  enterpriseExpertReviewRegistryRuntime
} from "./expert-review";
import type {
  SenaEnterpriseExpertReview
} from "./expert-review";
import {
  enterpriseReliabilityRunRegistryRuntime,
  type SenaEnterpriseReliabilityAdjudicationCoverage,
  type SenaEnterpriseReliabilityRun
} from "./reliability-runs";
import {
  enterpriseValidationRunRegistryRuntime
} from "./validation-runs";
import type {
  SenaEnterpriseValidationRun
} from "./validation-runs";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  type SenaEnterpriseDb,
  type SenaEnterpriseUser
} from "./state";
import {
  collaborationPubSubProvider,
  collaborationPubSubTimeoutMs,
  collaborationPubSubWebhookSecret,
  collaborationPubSubWebhookUrl,
  localWebhookSinkAttempt,
  webhookErrorHash,
  webhookRetryAt
} from "./webhook-delivery";
import type {
  SenaEnterpriseWebhookProviderMode,
  SenaEnterpriseWebhookQueueProvider
} from "./webhook-delivery";

export type SenaEnterpriseProjectComment = {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  body: string;
  target: {
    kind: "project" | "node" | "edge" | "evidence" | "report" | "reliability";
    id?: string;
    label?: string;
  };
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseProjectPresence = {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  activeView: string;
  cursorLabel: string;
  updatedAt: string;
  expiresAt: string;
};

export type SenaEnterpriseCollaborationPubSubEventKind =
  | "presence"
  | "comment"
  | "comment.resolve"
  | "adjudication";

export type SenaEnterpriseCollaborationPubSubDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseCollaborationPubSubDelivery = {
  provider: SenaEnterpriseWebhookQueueProvider;
  status: SenaEnterpriseCollaborationPubSubDeliveryStatus;
  endpointHash: string;
  queuedAt: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  lastStatus?: number;
  lastErrorCode?: string;
  lastErrorHash?: string;
  nextAttemptAt?: string;
  deliveredAt?: string;
  failedAt?: string;
};

export type SenaEnterpriseCollaborationPubSubEvent = {
  id: string;
  kind: SenaEnterpriseCollaborationPubSubEventKind;
  teamId: string;
  projectId: string;
  actorUserId: string;
  createdAt: string;
  detail: Record<string, string | number | boolean | null>;
  delivery: SenaEnterpriseCollaborationPubSubDelivery;
};

export type SenaEnterpriseCollaborationPubSubDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseCollaborationPubsubDelivery;
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    maxAttempts: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
    requestedProjectId?: string;
    limit: number;
    force: boolean;
  };
  summary: {
    attempted: number;
    delivered: number;
    failed: number;
    pending: number;
    skipped: number;
  };
  events: Array<{
    eventId: string;
    kind: SenaEnterpriseCollaborationPubSubEventKind;
    teamId: string;
    projectId: string;
    deliveryStatus: SenaEnterpriseCollaborationPubSubDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};

export type SenaEnterpriseAdjudicationRecord = {
  id: string;
  projectId: string;
  teamId: string;
  reliabilityRunId?: string;
  itemId: string;
  codeId: string;
  decision: "include" | "exclude" | "revise";
  reviewerId: string;
  notes: string;
  coderValues: Record<string, boolean>;
  createdAt: string;
};

export type SenaEnterpriseProjectCollaborationEvidenceStore = "file-json" | "postgres-table";

export type SenaEnterpriseProjectCollaborationEvidenceSource = {
  comments: SenaEnterpriseProjectCollaborationEvidenceStore;
  presence: SenaEnterpriseProjectCollaborationEvidenceStore;
  reliabilityRuns: SenaEnterpriseProjectCollaborationEvidenceStore;
  validationRuns: SenaEnterpriseProjectCollaborationEvidenceStore;
  expertReviews: SenaEnterpriseProjectCollaborationEvidenceStore;
  adjudications: SenaEnterpriseProjectCollaborationEvidenceStore;
  evidence: string[];
};

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function publicUser(user: SenaEnterpriseUser) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && rolePermissions[membership.role].includes("team:manage"))
    .map((membership) => membership.teamId);
}

function requireProjectPermissionFromDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  projectId: string,
  permission: Parameters<typeof requireEnterprisePermission>[2]
) {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, permission);
  return project;
}

function visiblePresenceRecords(records: SenaEnterpriseProjectPresence[], projectId: string) {
  const current = Date.now();
  return records.filter((presence) => presence.projectId === projectId && Date.parse(presence.expiresAt) > current);
}

function visiblePresence(db: SenaEnterpriseDb, projectId: string) {
  return visiblePresenceRecords(db.projectPresence, projectId);
}

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function postgresAdjudicationRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresAdjudicationRegistryConfigured() {
  return postgresAdjudicationRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

function postgresCollaborationRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresCollaborationRegistryConfigured() {
  return postgresCollaborationRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

export function enterpriseProjectCommentRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresCollaborationRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_project_comments",
    evidence: [
      `projectCommentRegistryStore=${activeStore}`,
      `projectCommentRegistryPostgresRequested=${requested}`,
      `projectCommentRegistryPostgresConfigured=${postgresConfig.configured}`,
      `projectCommentRegistryPostgresTable=sena_enterprise_project_comments`,
      `projectCommentRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

export function enterpriseProjectPresenceRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresCollaborationRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_project_presence",
    evidence: [
      `projectPresenceRegistryStore=${activeStore}`,
      `projectPresenceRegistryPostgresRequested=${requested}`,
      `projectPresenceRegistryPostgresConfigured=${postgresConfig.configured}`,
      `projectPresenceRegistryPostgresTable=sena_enterprise_project_presence`,
      `projectPresenceRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

export function enterpriseAdjudicationRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresAdjudicationRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_adjudications",
    evidence: [
      `adjudicationRegistryStore=${activeStore}`,
      `adjudicationRegistryPostgresRequested=${requested}`,
      `adjudicationRegistryPostgresConfigured=${postgresConfig.configured}`,
      `adjudicationRegistryPostgresTable=sena_enterprise_adjudications`,
      `adjudicationRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

async function upsertAdjudicationsToPostgresIfConfigured(records: SenaEnterpriseAdjudicationRecord[]) {
  if (records.length === 0 || !postgresAdjudicationRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresAdjudicationAdapterFromEnv({});
  try {
    await adapter.upsertAdjudications(records);
  } finally {
    await pool.end?.();
  }
}

async function upsertReliabilityRunsToPostgresIfConfigured(runs: SenaEnterpriseReliabilityRun[]) {
  if (runs.length === 0 || enterpriseReliabilityRunRegistryRuntime().activeStore !== "postgres-table") return;
  const { adapter, pool } = createEnterprisePostgresReliabilityRunAdapterFromEnv({});
  try {
    await adapter.upsertReliabilityRuns(runs);
  } finally {
    await pool.end?.();
  }
}

async function upsertProjectCommentsToPostgresIfConfigured(comments: SenaEnterpriseProjectComment[]) {
  if (comments.length === 0 || !postgresCollaborationRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresProjectCommentAdapterFromEnv({});
  try {
    await adapter.upsertProjectComments(comments);
  } finally {
    await pool.end?.();
  }
}

async function upsertProjectPresenceToPostgresIfConfigured(records: SenaEnterpriseProjectPresence[]) {
  if (records.length === 0 || !postgresCollaborationRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresProjectPresenceAdapterFromEnv({});
  try {
    await adapter.upsertProjectPresence(records);
  } finally {
    await pool.end?.();
  }
}

function isPostgresStateRevisionConflict(error: unknown) {
  return error instanceof SenaEnterpriseError && error.code === "postgres_state_revision_conflict";
}

async function collaborationStateRetryBackoff(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, 12 * (attempt + 1)));
}

async function withEnterpriseCollaborationStateRetry<T>(
  operation: (db: SenaEnterpriseDb) => T | Promise<T>
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await readEnterpriseState();
    try {
      const result = await operation(state.db);
      await saveEnterpriseState(state, state.db);
      return result;
    } catch (error) {
      if (isPostgresStateRevisionConflict(error) && attempt < 2) {
        lastError = error;
        await collaborationStateRetryBackoff(attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function enterpriseProjectCollaborationFileEvidenceSource(): SenaEnterpriseProjectCollaborationEvidenceSource {
  return {
    comments: "file-json",
    presence: "file-json",
    reliabilityRuns: "file-json",
    validationRuns: "file-json",
    expertReviews: "file-json",
    adjudications: "file-json",
    evidence: [
      "projectCollaborationComments=file-json",
      "projectCollaborationPresence=file-json",
      "projectCollaborationReliabilityRuns=file-json",
      "projectCollaborationValidationRuns=file-json",
      "projectCollaborationExpertReviews=file-json",
      "projectCollaborationAdjudications=file-json"
    ]
  };
}

export function enterpriseProjectCollaborationRuntime(): SenaEnterpriseProjectCollaborationEvidenceSource {
  const comments = enterpriseProjectCommentRegistryRuntime();
  const presence = enterpriseProjectPresenceRegistryRuntime();
  const reliability = enterpriseReliabilityRunRegistryRuntime();
  const validation = enterpriseValidationRunRegistryRuntime();
  const expertReview = enterpriseExpertReviewRegistryRuntime();
  const adjudication = enterpriseAdjudicationRegistryRuntime();
  return {
    comments: comments.activeStore,
    presence: presence.activeStore,
    reliabilityRuns: reliability.activeStore,
    validationRuns: validation.activeStore,
    expertReviews: expertReview.activeStore,
    adjudications: adjudication.activeStore,
    evidence: [
      `projectCollaborationComments=${comments.activeStore}`,
      `projectCollaborationPresence=${presence.activeStore}`,
      `projectCollaborationReliabilityRuns=${reliability.activeStore}`,
      `projectCollaborationValidationRuns=${validation.activeStore}`,
      `projectCollaborationExpertReviews=${expertReview.activeStore}`,
      `projectCollaborationAdjudications=${adjudication.activeStore}`,
      ...comments.evidence,
      ...presence.evidence,
      ...reliability.evidence,
      ...validation.evidence,
      ...expertReview.evidence,
      ...adjudication.evidence
    ]
  };
}

function queueEnterpriseCollaborationEvent(db: SenaEnterpriseDb, input: {
  kind: SenaEnterpriseCollaborationPubSubEventKind;
  teamId: string;
  projectId: string;
  actorUserId: string;
  detail: Record<string, string | number | boolean | null>;
}) {
  const provider = collaborationPubSubProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  if (!provider.configured || !provider.endpointHash) return undefined;
  const timestamp = now();
  const event: SenaEnterpriseCollaborationPubSubEvent = {
    id: id("collab_evt"),
    kind: input.kind,
    teamId: input.teamId,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    createdAt: timestamp,
    detail: input.detail,
    delivery: {
      provider: "webhook",
      status: "pending",
      endpointHash: provider.endpointHash,
      queuedAt: timestamp,
      attempts: 0,
      maxAttempts: provider.maxAttempts
    }
  };
  db.collaborationEvents.unshift(event);
  db.collaborationEvents = db.collaborationEvents.slice(0, 2000);
  return event;
}

function collaborationPubSubEventPayload(
  event: SenaEnterpriseCollaborationPubSubEvent,
  attempt: number,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCollaborationPubsubWebhook,
    generatedAt,
    event: {
      id: event.id,
      kind: event.kind,
      teamId: event.teamId,
      projectId: event.projectId,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt,
      detail: event.detail
    },
    delivery: {
      provider: event.delivery.provider,
      endpointHash: event.delivery.endpointHash,
      attempt,
      maxAttempts: event.delivery.maxAttempts
    }
  };
}

async function postCollaborationPubSubWebhook(event: SenaEnterpriseCollaborationPubSubEvent) {
  const webhookUrl = collaborationPubSubWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Collaboration pub/sub webhook delivery is not configured.", 503, "collaboration_pubsub_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = event.delivery.attempts + 1;
  const body = JSON.stringify(collaborationPubSubEventPayload(event, attempt, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "collaboration.publish",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-collaboration-event-id": event.id,
    "x-sena-project-id": event.projectId
  };
  const secret = collaborationPubSubWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), collaborationPubSubTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function collaborationPubSubTeamScopeFromDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string }
) {
  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "team:manage");
    return [project.teamId];
  }
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
    return [input.teamId];
  }
  const teamIds = manageableTeamIds(context);
  if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for collaboration pub/sub delivery.", 403, "collaboration_pubsub_permission_denied");
  }
  return teamIds;
}

function roundedCoverageRate(resolved: number, queued: number) {
  if (queued === 0) return 1;
  return Number((resolved / queued).toFixed(4));
}

function reliabilityDisagreementKey(itemId: string, codeId: string) {
  return `${itemId}::${codeId}`;
}

function buildReliabilityAdjudicationCoverage(
  run: Pick<SenaEnterpriseReliabilityRun, "id" | "createdAt" | "reviewedAt" | "dashboard">,
  adjudications: SenaEnterpriseAdjudicationRecord[]
): SenaEnterpriseReliabilityAdjudicationCoverage {
  const queueKeys = new Set((run.dashboard.adjudicationQueue ?? []).map((disagreement) => (
    reliabilityDisagreementKey(disagreement.itemId, disagreement.codeId)
  )));
  const latestByDisagreement = new Map<string, SenaEnterpriseAdjudicationRecord>();
  adjudications
    .filter((record) => record.reliabilityRunId === run.id)
    .filter((record) => queueKeys.has(reliabilityDisagreementKey(record.itemId, record.codeId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((record) => {
      latestByDisagreement.set(reliabilityDisagreementKey(record.itemId, record.codeId), record);
    });

  const decisions = { include: 0, exclude: 0, revise: 0 };
  let updatedAt = run.reviewedAt ?? run.createdAt;
  for (const record of latestByDisagreement.values()) {
    decisions[record.decision] += 1;
    if (record.createdAt.localeCompare(updatedAt) > 0) updatedAt = record.createdAt;
  }

  const queuedDisagreements = queueKeys.size;
  const resolvedDisagreements = latestByDisagreement.size;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
    queuedDisagreements,
    resolvedDisagreements,
    unresolvedDisagreements: Math.max(queuedDisagreements - resolvedDisagreements, 0),
    coverageRate: roundedCoverageRate(resolvedDisagreements, queuedDisagreements),
    decisions,
    updatedAt
  };
}

function refreshReliabilityAdjudicationCoverage(
  db: SenaEnterpriseDb,
  run: SenaEnterpriseReliabilityRun
) {
  run.adjudicationCoverage = buildReliabilityAdjudicationCoverage(run, db.adjudications ?? []);
  return run.adjudicationCoverage;
}

export async function deliverEnterpriseCollaborationPubSub(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string; limit?: number; force?: boolean; eventId?: string } = {}
): Promise<SenaEnterpriseCollaborationPubSubDeliveryResult> {
  const provider = collaborationPubSubProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const state = await readEnterpriseState();
  const db = state.db;
  const teamIds = collaborationPubSubTeamScopeFromDb(db, context, input);
  const teamIdSet = new Set(teamIds);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const force = Boolean(input.force);
  const result: SenaEnterpriseCollaborationPubSubDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseCollaborationPubsubDelivery,
    generatedAt: now(),
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId,
      requestedProjectId: input.projectId,
      limit,
      force
    },
    summary: {
      attempted: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      skipped: 0
    },
    events: []
  };

  if (!provider.configured) return result;

  const nowMs = Date.now();
  const queue = (db.collaborationEvents ?? [])
    .filter((event) => teamIdSet.has(event.teamId))
    .filter((event) => !input.projectId || event.projectId === input.projectId)
    .filter((event) => !input.eventId || event.id === input.eventId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const deliveryQueue: SenaEnterpriseCollaborationPubSubEvent[] = [];

  for (const event of queue) {
    if (event.delivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (event.delivery.attempts >= event.delivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && event.delivery.nextAttemptAt && Date.parse(event.delivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(event);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const event of targets) {
    if (provider.endpointHash && event.delivery.endpointHash !== provider.endpointHash) {
      event.delivery.endpointHash = provider.endpointHash;
      event.delivery.status = "pending";
      event.delivery.attempts = 0;
      event.delivery.maxAttempts = provider.maxAttempts;
      delete event.delivery.nextAttemptAt;
      delete event.delivery.deliveredAt;
      delete event.delivery.failedAt;
    }
    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(event.delivery.endpointHash)
      : await postCollaborationPubSubWebhook(event);
    const attemptedAt = now();
    event.delivery.attempts += 1;
    event.delivery.lastAttemptAt = attemptedAt;
    event.delivery.lastStatus = attemptResult.httpStatus;
    event.delivery.lastErrorCode = attemptResult.errorCode;
    event.delivery.lastErrorHash = attemptResult.errorHash;

    if (attemptResult.ok) {
      event.delivery.status = "delivered";
      event.delivery.deliveredAt = attemptedAt;
      delete event.delivery.nextAttemptAt;
      delete event.delivery.failedAt;
      result.summary.delivered += 1;
    } else if (event.delivery.attempts >= event.delivery.maxAttempts) {
      event.delivery.status = "failed";
      event.delivery.failedAt = attemptedAt;
      delete event.delivery.nextAttemptAt;
      result.summary.failed += 1;
    } else {
      event.delivery.status = "pending";
      event.delivery.nextAttemptAt = webhookRetryAt(event.delivery.attempts);
      result.summary.pending += 1;
    }
    result.summary.attempted += 1;
    result.events.push({
      eventId: event.id,
      kind: event.kind,
      teamId: event.teamId,
      projectId: event.projectId,
      deliveryStatus: event.delivery.status,
      attempts: event.delivery.attempts,
      httpStatus: event.delivery.lastStatus,
      errorCode: event.delivery.lastErrorCode
    });
    appendAudit(db, {
      event: attemptResult.ok ? "collaboration.pubsub.deliver" : "collaboration.pubsub.fail",
      userId: context.user.id,
      teamId: event.teamId,
      projectId: event.projectId,
      detail: {
        eventId: event.id,
        kind: event.kind,
        endpointHash: event.delivery.endpointHash,
        httpStatus: attemptResult.httpStatus ?? null,
        errorCode: attemptResult.errorCode ?? null,
        errorHash: attemptResult.errorHash ?? null
      }
    });
  }

  await saveEnterpriseState(state, db);
  return result;
}

function buildEnterpriseProjectCollaborationFromDb(
  context: SenaEnterpriseSessionContext,
  db: SenaEnterpriseDb,
  projectId: string,
  evidence: {
    comments: SenaEnterpriseProjectComment[];
    presence: SenaEnterpriseProjectPresence[];
    adjudications: SenaEnterpriseAdjudicationRecord[];
    reliabilityRuns: SenaEnterpriseReliabilityRun[];
    validationRuns: SenaEnterpriseValidationRun[];
    expertReviews: SenaEnterpriseExpertReview[];
    source: SenaEnterpriseProjectCollaborationEvidenceSource;
  }
) {
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:read");
  const userById = new Map(db.users.map((user) => [user.id, publicUser(user)]));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectCollaboration,
    evidenceSource: evidence.source,
    project: {
      id: project.id,
      title: project.title,
      teamId: project.teamId,
      currentVersion: project.currentVersion,
      updatedAt: project.updatedAt
    },
    revisions: db.projectRevisions
      .filter((revision) => revision.projectId === projectId)
      .sort((a, b) => b.version - a.version)
      .map(({ snapshot: _snapshot, ...revision }) => ({
        ...revision,
        user: userById.get(revision.userId) ?? null
      })),
    comments: evidence.comments
      .filter((comment) => comment.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((comment) => ({
        ...comment,
        user: userById.get(comment.userId) ?? null
      })),
    presence: visiblePresenceRecords(evidence.presence, projectId).map((presence) => ({
      ...presence,
      user: userById.get(presence.userId) ?? null
    })),
    adjudications: evidence.adjudications
      .filter((record) => record.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => ({
        ...record,
        reviewer: userById.get(record.reviewerId) ?? null
      })),
    reliabilityRuns: evidence.reliabilityRuns
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    validationRuns: evidence.validationRuns
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    expertReviews: evidence.expertReviews
      .filter((review) => review.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export function listEnterpriseProjectCollaboration(context: SenaEnterpriseSessionContext, projectId: string) {
  const db = readEnterpriseDb();
  return buildEnterpriseProjectCollaborationFromDb(context, db, projectId, {
    comments: db.projectComments,
    presence: db.projectPresence,
    adjudications: db.adjudications,
    reliabilityRuns: db.reliabilityRuns,
    validationRuns: db.validationRuns,
    expertReviews: db.expertReviews,
    source: enterpriseProjectCollaborationFileEvidenceSource()
  });
}

async function listEnterpriseProjectCollaborationWithPostgresEvidenceFromDb(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  db: SenaEnterpriseDb
) {
  requireProjectPermissionFromDb(db, context, projectId, "project:read");
  const source = enterpriseProjectCollaborationRuntime();
  const pools: Array<{ end?: () => Promise<void> }> = [];
  try {
    const reliabilityRunsPromise = source.reliabilityRuns === "postgres-table"
      ? (() => {
        const { adapter, pool } = createEnterprisePostgresReliabilityRunAdapterFromEnv({});
        pools.push(pool);
        return adapter.listReliabilityRuns({ projectId, limit: 1000 });
      })()
      : Promise.resolve(db.reliabilityRuns);
    const validationRunsPromise = source.validationRuns === "postgres-table"
      ? (() => {
        const { adapter, pool } = createEnterprisePostgresValidationRunAdapterFromEnv({});
        pools.push(pool);
        return adapter.listValidationRuns({ projectId, limit: 1000 });
      })()
      : Promise.resolve(db.validationRuns);
    const expertReviewsPromise = source.expertReviews === "postgres-table"
      ? (() => {
        const { adapter, pool } = createEnterprisePostgresExpertReviewAdapterFromEnv({});
        pools.push(pool);
        return adapter.listExpertReviews({ projectId, limit: 1000 });
      })()
      : Promise.resolve(db.expertReviews);
    const adjudicationsPromise = source.adjudications === "postgres-table"
      ? (() => {
        const { adapter, pool } = createEnterprisePostgresAdjudicationAdapterFromEnv({});
        pools.push(pool);
        return adapter.listAdjudications({ projectId, limit: 1000 });
      })()
      : Promise.resolve(db.adjudications);
    const commentsPromise = source.comments === "postgres-table"
      ? (() => {
        const { adapter, pool } = createEnterprisePostgresProjectCommentAdapterFromEnv({});
        pools.push(pool);
        return adapter.listProjectComments({ projectId, limit: 1000 });
      })()
      : Promise.resolve(db.projectComments);
    const presencePromise = source.presence === "postgres-table"
      ? (() => {
        const { adapter, pool } = createEnterprisePostgresProjectPresenceAdapterFromEnv({});
        pools.push(pool);
        return adapter.listProjectPresence({ projectId, activeOnly: true, limit: 500 });
      })()
      : Promise.resolve(db.projectPresence);
    const [reliabilityRuns, validationRuns, expertReviews, adjudications, comments, presence] = await Promise.all([
      reliabilityRunsPromise,
      validationRunsPromise,
      expertReviewsPromise,
      adjudicationsPromise,
      commentsPromise,
      presencePromise
    ]);
    return buildEnterpriseProjectCollaborationFromDb(context, db, projectId, {
      comments,
      presence,
      adjudications,
      reliabilityRuns,
      validationRuns,
      expertReviews,
      source
    });
  } finally {
    await Promise.allSettled(pools.map((pool) => pool.end?.()));
  }
}

export async function listEnterpriseProjectCollaborationWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  projectId: string
) {
  return listEnterpriseProjectCollaborationWithPostgresEvidenceFromDb(context, projectId, readEnterpriseDb());
}

export async function listEnterpriseProjectCollaborationWithPostgresEvidenceAsync(
  context: SenaEnterpriseSessionContext,
  projectId: string
) {
  const state = await readEnterpriseState();
  return listEnterpriseProjectCollaborationWithPostgresEvidenceFromDb(context, projectId, state.db);
}

function projectPresenceResponseFromDb(db: SenaEnterpriseDb, projectId: string) {
  const userById = new Map(db.users.map((user) => [user.id, publicUser(user)]));
  return visiblePresenceRecords(db.projectPresence, projectId).map((presence) => ({
    ...presence,
    user: userById.get(presence.userId) ?? null
  }));
}

function touchEnterpriseProjectPresenceInDb(context: SenaEnterpriseSessionContext, projectId: string, input: {
  activeView?: string;
  cursorLabel?: string;
}, db: SenaEnterpriseDb) {
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:read");
  const timestamp = now();
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const existing = db.projectPresence.find((presence) => presence.projectId === projectId && presence.userId === context.user.id);
  if (existing) {
    existing.activeView = input.activeView?.trim() || existing.activeView;
    existing.cursorLabel = input.cursorLabel?.trim() || existing.cursorLabel;
    existing.updatedAt = timestamp;
    existing.expiresAt = expiresAt;
  } else {
    db.projectPresence.push({
      id: id("presence"),
      projectId,
      teamId: project.teamId,
      userId: context.user.id,
      activeView: input.activeView?.trim() || "workspace",
      cursorLabel: input.cursorLabel?.trim() || "SENA workspace",
      updatedAt: timestamp,
      expiresAt
    });
  }
  appendAudit(db, { event: "project.presence", userId: context.user.id, teamId: project.teamId, projectId, detail: { activeView: input.activeView || "workspace" } });
  queueEnterpriseCollaborationEvent(db, {
    kind: "presence",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      activeView: input.activeView?.trim() || "workspace",
      cursorLabel: input.cursorLabel?.trim() || "SENA workspace"
    }
  });
  return projectPresenceResponseFromDb(db, projectId);
}

export function touchEnterpriseProjectPresence(context: SenaEnterpriseSessionContext, projectId: string, input: {
  activeView?: string;
  cursorLabel?: string;
}) {
  const db = readEnterpriseDb();
  const presence = touchEnterpriseProjectPresenceInDb(context, projectId, input, db);
  saveDb(db);
  return presence;
}

export async function touchEnterpriseProjectPresenceWithPostgresMirror(context: SenaEnterpriseSessionContext, projectId: string, input: {
  activeView?: string;
  cursorLabel?: string;
}) {
  const presence = touchEnterpriseProjectPresence(context, projectId, input);
  const updated = readEnterpriseDb().projectPresence.find((record) => record.projectId === projectId && record.userId === context.user.id);
  if (updated) await upsertProjectPresenceToPostgresIfConfigured([updated]);
  return presence;
}

export async function touchEnterpriseProjectPresenceWithPostgresMirrorAsync(context: SenaEnterpriseSessionContext, projectId: string, input: {
  activeView?: string;
  cursorLabel?: string;
}) {
  let updated: SenaEnterpriseProjectPresence | undefined;
  const presence = await withEnterpriseCollaborationStateRetry((db) => {
    const result = touchEnterpriseProjectPresenceInDb(context, projectId, input, db);
    updated = db.projectPresence.find((record) => record.projectId === projectId && record.userId === context.user.id);
    return result;
  });
  if (updated) await upsertProjectPresenceToPostgresIfConfigured([updated]);
  return presence;
}

function createEnterpriseProjectCommentInDb(context: SenaEnterpriseSessionContext, projectId: string, input: {
  body: string;
  target?: SenaEnterpriseProjectComment["target"];
}, db: SenaEnterpriseDb) {
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:comment");
  const timestamp = now();
  const comment: SenaEnterpriseProjectComment = {
    id: id("comment"),
    projectId,
    teamId: project.teamId,
    userId: context.user.id,
    body: input.body.trim(),
    target: input.target ?? { kind: "project" },
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (!comment.body) throw new SenaEnterpriseError("Comment body is required.", 400, "comment_body_required");
  db.projectComments.push(comment);
  appendAudit(db, { event: "project.comment", userId: context.user.id, teamId: project.teamId, projectId, detail: { target: comment.target.kind, targetId: comment.target.id ?? null } });
  queueEnterpriseCollaborationEvent(db, {
    kind: "comment",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      commentId: comment.id,
      target: comment.target.kind,
      targetId: comment.target.id ?? null,
      status: comment.status
    }
  });
  notifyProjectReaders(db, project, {
    kind: "project.comment",
    title: "New SENA project comment",
    body: `${context.user.name} commented on ${project.title}.`,
    actionUrl: `/workspace/sena?projectId=${encodeURIComponent(project.id)}`,
    excludeUserId: context.user.id,
    detail: {
      commentId: comment.id,
      target: comment.target.kind,
      targetId: comment.target.id ?? null
    }
  });
  return comment;
}

export function createEnterpriseProjectComment(context: SenaEnterpriseSessionContext, projectId: string, input: {
  body: string;
  target?: SenaEnterpriseProjectComment["target"];
}) {
  const db = readEnterpriseDb();
  const comment = createEnterpriseProjectCommentInDb(context, projectId, input, db);
  saveDb(db);
  return comment;
}

export async function createEnterpriseProjectCommentWithPostgresMirror(context: SenaEnterpriseSessionContext, projectId: string, input: {
  body: string;
  target?: SenaEnterpriseProjectComment["target"];
}) {
  const comment = createEnterpriseProjectComment(context, projectId, input);
  await upsertProjectCommentsToPostgresIfConfigured([comment]);
  return comment;
}

export async function createEnterpriseProjectCommentWithPostgresMirrorAsync(context: SenaEnterpriseSessionContext, projectId: string, input: {
  body: string;
  target?: SenaEnterpriseProjectComment["target"];
}) {
  const comment = await withEnterpriseCollaborationStateRetry((db) => (
    createEnterpriseProjectCommentInDb(context, projectId, input, db)
  ));
  await upsertProjectCommentsToPostgresIfConfigured([comment]);
  return comment;
}

function resolveEnterpriseProjectCommentInDb(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  commentId: string,
  db: SenaEnterpriseDb
) {
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:comment");
  const comment = db.projectComments.find((candidate) => candidate.id === commentId && candidate.projectId === projectId);
  if (!comment) throw new SenaEnterpriseError("Comment was not found.", 404, "comment_not_found");
  comment.status = "resolved";
  comment.updatedAt = now();
  appendAudit(db, { event: "project.comment.resolve", userId: context.user.id, teamId: project.teamId, projectId, detail: { commentId } });
  queueEnterpriseCollaborationEvent(db, {
    kind: "comment.resolve",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      commentId,
      status: comment.status
    }
  });
  return comment;
}

export function resolveEnterpriseProjectComment(context: SenaEnterpriseSessionContext, projectId: string, commentId: string) {
  const db = readEnterpriseDb();
  const comment = resolveEnterpriseProjectCommentInDb(context, projectId, commentId, db);
  saveDb(db);
  return comment;
}

export async function resolveEnterpriseProjectCommentWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  commentId: string
) {
  const comment = resolveEnterpriseProjectComment(context, projectId, commentId);
  await upsertProjectCommentsToPostgresIfConfigured([comment]);
  return comment;
}

export async function resolveEnterpriseProjectCommentWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  commentId: string
) {
  const comment = await withEnterpriseCollaborationStateRetry((db) => (
    resolveEnterpriseProjectCommentInDb(context, projectId, commentId, db)
  ));
  await upsertProjectCommentsToPostgresIfConfigured([comment]);
  return comment;
}

function createEnterpriseAdjudicationRecordInDb(context: SenaEnterpriseSessionContext, projectId: string, input: {
  reliabilityRunId?: string;
  itemId: string;
  codeId: string;
  decision: SenaEnterpriseAdjudicationRecord["decision"];
  notes?: string;
  coderValues?: Record<string, boolean>;
}, db: SenaEnterpriseDb) {
  const project = requireProjectPermissionFromDb(db, context, projectId, "reliability:adjudicate");
  const reliabilityRun = input.reliabilityRunId
    ? db.reliabilityRuns.find((run) => run.id === input.reliabilityRunId)
    : undefined;
  if (input.reliabilityRunId && !reliabilityRun) {
    throw new SenaEnterpriseError("Reliability run was not found for adjudication.", 404, "reliability_run_not_found");
  }
  if (reliabilityRun && reliabilityRun.projectId !== projectId) {
    throw new SenaEnterpriseError("Adjudication reliability run does not belong to this project.", 400, "adjudication_reliability_project_mismatch");
  }
  const record: SenaEnterpriseAdjudicationRecord = {
    id: id("adj"),
    projectId,
    teamId: project.teamId,
    reliabilityRunId: reliabilityRun?.id,
    itemId: input.itemId.trim(),
    codeId: input.codeId.trim(),
    decision: input.decision,
    reviewerId: context.user.id,
    notes: input.notes?.trim() ?? "",
    coderValues: input.coderValues ?? {},
    createdAt: now()
  };
  if (!record.itemId || !record.codeId) {
    throw new SenaEnterpriseError("Adjudication item and code are required.", 400, "adjudication_target_required");
  }
  db.adjudications.push(record);
  appendAudit(db, {
    event: "project.adjudicate",
    userId: context.user.id,
    teamId: project.teamId,
    projectId,
    detail: {
      itemId: record.itemId,
      codeId: record.codeId,
      decision: record.decision,
      reliabilityRunId: record.reliabilityRunId ?? null
    }
  });
  queueEnterpriseCollaborationEvent(db, {
    kind: "adjudication",
    teamId: project.teamId,
    projectId,
    actorUserId: context.user.id,
    detail: {
      adjudicationId: record.id,
      itemId: record.itemId,
      codeId: record.codeId,
      decision: record.decision,
      reliabilityRunId: record.reliabilityRunId ?? null
    }
  });
  if (reliabilityRun) refreshReliabilityAdjudicationCoverage(db, reliabilityRun);
  return record;
}

export function createEnterpriseAdjudicationRecord(context: SenaEnterpriseSessionContext, projectId: string, input: {
  reliabilityRunId?: string;
  itemId: string;
  codeId: string;
  decision: SenaEnterpriseAdjudicationRecord["decision"];
  notes?: string;
  coderValues?: Record<string, boolean>;
}) {
  const db = readEnterpriseDb();
  const record = createEnterpriseAdjudicationRecordInDb(context, projectId, input, db);
  saveDb(db);
  return record;
}

export async function createEnterpriseAdjudicationRecordWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  input: Parameters<typeof createEnterpriseAdjudicationRecord>[2]
) {
  const record = createEnterpriseAdjudicationRecord(context, projectId, input);
  await upsertAdjudicationsToPostgresIfConfigured([record]);
  const reliabilityRun = readEnterpriseDb().reliabilityRuns.find((run) => run.id === record.reliabilityRunId);
  if (reliabilityRun) await upsertReliabilityRunsToPostgresIfConfigured([reliabilityRun]);
  return record;
}

export async function createEnterpriseAdjudicationRecordWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  input: Parameters<typeof createEnterpriseAdjudicationRecord>[2]
) {
  let reliabilityRun: SenaEnterpriseReliabilityRun | undefined;
  const record = await withEnterpriseCollaborationStateRetry((db) => {
    const created = createEnterpriseAdjudicationRecordInDb(context, projectId, input, db);
    reliabilityRun = db.reliabilityRuns.find((run) => run.id === created.reliabilityRunId);
    return created;
  });
  await upsertAdjudicationsToPostgresIfConfigured([record]);
  if (reliabilityRun) await upsertReliabilityRunsToPostgresIfConfigured([reliabilityRun]);
  return record;
}
