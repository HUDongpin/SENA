import { createHmac, randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
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
import type {
  SenaEnterpriseReliabilityAdjudicationCoverage,
  SenaEnterpriseReliabilityRun
} from "./reliability-runs";
import {
  readEnterpriseDb,
  saveDb,
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

function visiblePresence(db: SenaEnterpriseDb, projectId: string) {
  const current = Date.now();
  return db.projectPresence.filter((presence) => presence.projectId === projectId && Date.parse(presence.expiresAt) > current);
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

function collaborationPubSubTeamScope(context: SenaEnterpriseSessionContext, input: { teamId?: string; projectId?: string }) {
  const db = readEnterpriseDb();
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
  const teamIds = collaborationPubSubTeamScope(context, input);
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

  const db = readEnterpriseDb();
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

  saveDb(db);
  return result;
}

export function listEnterpriseProjectCollaboration(context: SenaEnterpriseSessionContext, projectId: string) {
  const db = readEnterpriseDb();
  const project = requireProjectPermissionFromDb(db, context, projectId, "project:read");
  const userById = new Map(db.users.map((user) => [user.id, publicUser(user)]));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectCollaboration,
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
    comments: db.projectComments
      .filter((comment) => comment.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((comment) => ({
        ...comment,
        user: userById.get(comment.userId) ?? null
      })),
    presence: visiblePresence(db, projectId).map((presence) => ({
      ...presence,
      user: userById.get(presence.userId) ?? null
    })),
    adjudications: db.adjudications
      .filter((record) => record.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((record) => ({
        ...record,
        reviewer: userById.get(record.reviewerId) ?? null
      })),
    reliabilityRuns: db.reliabilityRuns
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    validationRuns: db.validationRuns
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    expertReviews: db.expertReviews
      .filter((review) => review.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export function touchEnterpriseProjectPresence(context: SenaEnterpriseSessionContext, projectId: string, input: {
  activeView?: string;
  cursorLabel?: string;
}) {
  const db = readEnterpriseDb();
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
  saveDb(db);
  return listEnterpriseProjectCollaboration(context, projectId).presence;
}

export function createEnterpriseProjectComment(context: SenaEnterpriseSessionContext, projectId: string, input: {
  body: string;
  target?: SenaEnterpriseProjectComment["target"];
}) {
  const db = readEnterpriseDb();
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
  saveDb(db);
  return comment;
}

export function resolveEnterpriseProjectComment(context: SenaEnterpriseSessionContext, projectId: string, commentId: string) {
  const db = readEnterpriseDb();
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
  saveDb(db);
  return comment;
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
  saveDb(db);
  return record;
}
