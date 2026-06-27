import { createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  hasEnterprisePermission,
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  localWebhookSinkAttempt,
  notificationWebhookMaxAttempts,
  notificationWebhookProvider,
  notificationWebhookSecret,
  notificationWebhookTimeoutMs,
  notificationWebhookUrl,
  webhookErrorHash,
  webhookQueueProvider,
  webhookRetryAt,
  type SenaEnterpriseWebhookProviderMode,
  type SenaEnterpriseWebhookQueueProvider
} from "./webhook-delivery";
import {
  deliverEnterpriseEmails
} from "./notifications-email";
import {
  readEnterpriseDb,
  saveDb
} from "./state";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseDb } from "./state";

export type SenaEnterpriseNotificationKind =
  | "team.invite"
  | "auth.password_reset"
  | "project.comment"
  | "reliability.review"
  | "expert.review"
  | "validation.review";

export type SenaEnterpriseNotificationStatus = "delivered" | "read" | "failed";

export type SenaEnterpriseNotificationWebhookDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseNotificationWebhookDelivery = {
  provider: SenaEnterpriseWebhookQueueProvider;
  status: SenaEnterpriseNotificationWebhookDeliveryStatus;
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

export type SenaEnterpriseNotification = {
  id: string;
  kind: SenaEnterpriseNotificationKind;
  status: SenaEnterpriseNotificationStatus;
  channel: "in-app";
  userId?: string;
  teamId?: string;
  projectId?: string;
  recipientEmailHash?: string;
  recipientEmailDomain?: string;
  title: string;
  body: string;
  actionUrl?: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
  detail: Record<string, string | number | boolean | null>;
  webhookDelivery?: SenaEnterpriseNotificationWebhookDelivery;
};

export type SenaEnterpriseNotificationQuery = {
  teamId?: string;
  status?: SenaEnterpriseNotificationStatus;
  kind?: SenaEnterpriseNotificationKind;
  limit?: number;
  offset?: number;
};

export type SenaEnterpriseNotificationResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseNotifications;
  generatedAt: string;
  scope: {
    mode: "user" | "team";
    teamId?: string;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    returned: number;
    nextOffset: number | null;
  };
  notifications: SenaEnterpriseNotification[];
};

export type SenaEnterpriseNotificationDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseNotificationDelivery;
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
    limit: number;
    force: boolean;
  };
  summary: {
    attempted: number;
    delivered: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  notifications: Array<{
    notificationId: string;
    kind: SenaEnterpriseNotificationKind;
    teamId?: string;
    projectId?: string;
    webhookStatus: SenaEnterpriseNotificationWebhookDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};

const notificationKinds: SenaEnterpriseNotificationKind[] = [
  "team.invite",
  "auth.password_reset",
  "project.comment",
  "reliability.review",
  "expert.review",
  "validation.review"
];

const notificationStatuses: SenaEnterpriseNotificationStatus[] = ["delivered", "read", "failed"];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function authEmailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function authEmailDomain(email: string) {
  const domain = normalizeEmail(email).split("@")[1] || "unknown";
  return domain.replace(/[^a-z0-9.-]+/g, "-").slice(0, 128) || "unknown";
}

function notificationVisibleToContext(context: SenaEnterpriseSessionContext, notification: SenaEnterpriseNotification) {
  const userEmailHash = authEmailHash(context.user.email);
  if (notification.userId === context.user.id) return true;
  if (notification.recipientEmailHash === userEmailHash) return true;
  if (notification.teamId && hasEnterprisePermission(context, notification.teamId, "team:manage")) return true;
  return false;
}

function numberParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusParam(value: string | null) {
  return notificationStatuses.includes(value as SenaEnterpriseNotificationStatus)
    ? value as SenaEnterpriseNotificationStatus
    : undefined;
}

function kindParam(value: string | null) {
  return notificationKinds.includes(value as SenaEnterpriseNotificationKind)
    ? value as SenaEnterpriseNotificationKind
    : undefined;
}

const enterpriseDbDir = process.env.SENA_ENTERPRISE_DB_DIR || ".sena-enterprise";
const enterpriseDbPath = path.join(enterpriseDbDir, "enterprise-db.json");

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function enterpriseDeploymentMode(): "institution-managed" | "self-managed" {
  const mode = (envValue("SENA_ENTERPRISE_DEPLOYMENT_MODE") ?? envValue("SENA_ENTERPRISE_MODE") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (mode === "self-managed" || envValue("SENA_SELF_MANAGED_ENTERPRISE") === "1") return "self-managed";
  return "institution-managed";
}

function isSelfManagedEnterpriseMode() {
  return enterpriseDeploymentMode() === "self-managed";
}

function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && hasEnterprisePermission(context, membership.teamId, "team:manage"))
    .map((membership) => membership.teamId);
}

function initialNotificationWebhookDelivery(queuedAt = now()): SenaEnterpriseNotificationWebhookDelivery | undefined {
  const provider = notificationWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  if (!provider.configured || !provider.endpointHash) return undefined;
  return {
    provider: webhookQueueProvider(provider),
    status: "pending",
    endpointHash: provider.endpointHash,
    queuedAt,
    attempts: 0,
    maxAttempts: provider.maxAttempts
  };
}

function ensureNotificationWebhookDelivery(notification: SenaEnterpriseNotification) {
  const provider = notificationWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  if (!provider.configured || !provider.endpointHash) return undefined;
  if (!notification.webhookDelivery || notification.webhookDelivery.endpointHash !== provider.endpointHash) {
    notification.webhookDelivery = {
      provider: webhookQueueProvider(provider),
      status: "pending",
      endpointHash: provider.endpointHash,
      queuedAt: now(),
      attempts: 0,
      maxAttempts: provider.maxAttempts
    };
  } else {
    notification.webhookDelivery.maxAttempts = provider.maxAttempts;
  }
  return notification.webhookDelivery;
}

function notificationWebhookPayload(
  notification: SenaEnterpriseNotification,
  delivery: SenaEnterpriseNotificationWebhookDelivery,
  attempt: number,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNotificationWebhook,
    generatedAt,
    notification: {
      id: notification.id,
      kind: notification.kind,
      status: notification.status,
      channel: notification.channel,
      userId: notification.userId,
      teamId: notification.teamId,
      projectId: notification.projectId,
      recipientEmailHash: notification.recipientEmailHash,
      recipientEmailDomain: notification.recipientEmailDomain,
      title: notification.title,
      body: notification.body,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
      deliveredAt: notification.deliveredAt,
      readAt: notification.readAt,
      detail: notification.detail
    },
    delivery: {
      provider: delivery.provider,
      endpointHash: delivery.endpointHash,
      attempt,
      maxAttempts: delivery.maxAttempts
    }
  };
}

async function postNotificationWebhook(notification: SenaEnterpriseNotification, delivery: SenaEnterpriseNotificationWebhookDelivery) {
  const webhookUrl = notificationWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Notification webhook delivery is not configured.", 503, "notification_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = delivery.attempts + 1;
  const body = JSON.stringify(notificationWebhookPayload(notification, delivery, attempt, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "notification.delivery",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-notification-id": notification.id
  };
  const secret = notificationWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), notificationWebhookTimeoutMs());
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
      errorHash: undefined as string | undefined
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

export function queueEnterpriseNotification(db: SenaEnterpriseDb, input: {
  kind: SenaEnterpriseNotificationKind;
  userId?: string;
  email?: string;
  teamId?: string;
  projectId?: string;
  title: string;
  body: string;
  actionUrl?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
}) {
  const user = input.userId ? db.users.find((candidate) => candidate.id === input.userId) : undefined;
  const email = input.email ?? user?.email;
  const createdAt = now();
  const notification: SenaEnterpriseNotification = {
    id: id("notif"),
    kind: input.kind,
    status: "delivered",
    channel: "in-app",
    userId: input.userId,
    teamId: input.teamId,
    projectId: input.projectId,
    recipientEmailHash: email ? authEmailHash(email) : undefined,
    recipientEmailDomain: email ? authEmailDomain(email) : undefined,
    title: input.title.trim(),
    body: input.body.trim(),
    actionUrl: input.actionUrl,
    createdAt,
    deliveredAt: createdAt,
    detail: Object.fromEntries(Object.entries(input.detail ?? {}).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean | null>,
    webhookDelivery: initialNotificationWebhookDelivery(createdAt)
  };
  db.notifications.unshift(notification);
  db.notifications = db.notifications.slice(0, 2000);
  appendAudit(db, {
    event: "notification.queue",
    userId: input.userId,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      notificationId: notification.id,
      kind: notification.kind,
      channel: notification.channel,
      recipient: input.userId ? "user" : email ? "email" : "team"
    }
  });
  return notification;
}

export function notifyTeamManagers(db: SenaEnterpriseDb, input: {
  teamId: string;
  kind: SenaEnterpriseNotificationKind;
  title: string;
  body: string;
  actionUrl?: string;
  projectId?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
  excludeUserId?: string;
}) {
  const managerIds = db.memberships
    .filter((membership) => membership.teamId === input.teamId && membership.status === "active" && rolePermissions[membership.role].includes("team:manage"))
    .map((membership) => membership.userId)
    .filter((userId) => userId !== input.excludeUserId);
  for (const userId of Array.from(new Set(managerIds))) {
    queueEnterpriseNotification(db, { ...input, userId });
  }
}

export function notifyProjectReaders(db: SenaEnterpriseDb, project: { id: string; teamId: string }, input: {
  kind: SenaEnterpriseNotificationKind;
  title: string;
  body: string;
  actionUrl?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
  excludeUserId?: string;
}) {
  const readerIds = db.memberships
    .filter((membership) => (
      membership.teamId === project.teamId &&
      membership.status === "active" &&
      rolePermissions[membership.role].includes("project:read")
    ))
    .map((membership) => membership.userId)
    .filter((userId) => userId !== input.excludeUserId);
  for (const userId of Array.from(new Set(readerIds))) {
    queueEnterpriseNotification(db, {
      ...input,
      userId,
      teamId: project.teamId,
      projectId: project.id
    });
  }
}

export function listEnterpriseNotifications(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseNotificationQuery = {}
): SenaEnterpriseNotificationResult {
  const db = readEnterpriseDb();
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  }
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
  const filtered = db.notifications
    .filter((notification) => input.teamId ? notification.teamId === input.teamId : notificationVisibleToContext(context, notification))
    .filter((notification) => !input.status || notification.status === input.status)
    .filter((notification) => !input.kind || notification.kind === input.kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notifications = filtered.slice(offset, offset + limit);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNotifications,
    generatedAt: new Date().toISOString(),
    scope: {
      mode: input.teamId ? "team" : "user",
      teamId: input.teamId
    },
    pagination: {
      limit,
      offset,
      total: filtered.length,
      returned: notifications.length,
      nextOffset: offset + notifications.length < filtered.length ? offset + notifications.length : null
    },
    notifications
  };
}

export function markEnterpriseNotificationRead(context: SenaEnterpriseSessionContext, notificationId: string) {
  const db = readEnterpriseDb();
  const notification = db.notifications.find((candidate) => candidate.id === notificationId);
  if (!notification) throw new SenaEnterpriseError("Notification was not found.", 404, "notification_not_found");
  if (!notificationVisibleToContext(context, notification)) {
    throw new SenaEnterpriseError("Notification access is not allowed.", 403, "notification_permission_denied");
  }
  notification.status = "read";
  notification.readAt = new Date().toISOString();
  appendAudit(db, {
    event: "notification.read",
    userId: context.user.id,
    teamId: notification.teamId,
    projectId: notification.projectId,
    detail: {
      notificationId: notification.id,
      kind: notification.kind
    }
  });
  saveDb(db);
  return notification;
}

export async function deliverEnterpriseNotifications(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; notificationId?: string } = {}
): Promise<SenaEnterpriseNotificationDeliveryResult> {
  const provider = notificationWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 200);
  const force = Boolean(input.force);
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for notification delivery.", 403, "notification_delivery_permission_denied");
  }

  const result: SenaEnterpriseNotificationDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNotificationDelivery,
    generatedAt: now(),
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId,
      limit,
      force
    },
    summary: {
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      pending: 0
    },
    notifications: []
  };

  if (!provider.configured) {
    return result;
  }

  const db = readEnterpriseDb();
  const teamIdSet = new Set(teamIds);
  const deliveryQueue: SenaEnterpriseNotification[] = [];
  const nowMs = Date.now();

  for (const notification of db.notifications
    .filter((candidate) => candidate.teamId && teamIdSet.has(candidate.teamId))
    .filter((candidate) => !input.notificationId || candidate.id === input.notificationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const delivery = ensureNotificationWebhookDelivery(notification);
    if (!delivery) {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.attempts >= delivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(notification);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const notification of targets) {
    const delivery = notification.webhookDelivery!;
    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(delivery.endpointHash)
      : await postNotificationWebhook(notification, delivery);
    const attemptedAt = now();
    delivery.attempts += 1;
    delivery.lastAttemptAt = attemptedAt;
    delivery.lastStatus = attemptResult.httpStatus;
    delivery.lastErrorCode = attemptResult.errorCode;
    delivery.lastErrorHash = attemptResult.errorHash;

    if (attemptResult.ok) {
      delivery.status = "delivered";
      delivery.deliveredAt = attemptedAt;
      delete delivery.nextAttemptAt;
      delete delivery.failedAt;
      result.summary.delivered += 1;
    } else if (delivery.attempts >= delivery.maxAttempts) {
      delivery.status = "failed";
      delivery.failedAt = attemptedAt;
      delete delivery.nextAttemptAt;
      result.summary.failed += 1;
    } else {
      delivery.status = "pending";
      delivery.nextAttemptAt = webhookRetryAt(delivery.attempts);
      result.summary.pending += 1;
    }

    result.summary.attempted += 1;
    result.notifications.push({
      notificationId: notification.id,
      kind: notification.kind,
      teamId: notification.teamId,
      projectId: notification.projectId,
      webhookStatus: delivery.status,
      attempts: delivery.attempts,
      httpStatus: delivery.lastStatus,
      errorCode: delivery.lastErrorCode
    });

    appendAudit(db, {
      event: attemptResult.ok ? "notification.webhook.deliver" : "notification.webhook.fail",
      userId: context.user.id,
      teamId: notification.teamId,
      projectId: notification.projectId,
      detail: {
        notificationId: notification.id,
        kind: notification.kind,
        provider: delivery.provider,
        endpointHash: delivery.endpointHash,
        attempts: delivery.attempts,
        status: delivery.status,
        httpStatus: delivery.lastStatus ?? null,
        errorCode: delivery.lastErrorCode ?? null
      }
    });
  }

  saveDb(db);
  return result;
}

export function buildEnterpriseNotificationListResponse(
  context: SenaEnterpriseSessionContext,
  searchParams: URLSearchParams
) {
  return {
    body: listEnterpriseNotifications(context, {
      teamId: searchParams.get("teamId") || undefined,
      status: statusParam(searchParams.get("status")),
      kind: kindParam(searchParams.get("kind")),
      limit: numberParam(searchParams.get("limit")),
      offset: numberParam(searchParams.get("offset"))
    })
  };
}

export function buildEnterpriseNotificationReadResponse(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  const notification = markEnterpriseNotificationRead(context, String(body.notificationId ?? ""));
  return {
    body: {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNotification,
      notification
    }
  };
}

export async function buildEnterpriseNotificationDeliveryResponse(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  if (body.action === "deliver-email" || body.channel === "email") {
    return {
      body: await deliverEnterpriseEmails(context, {
        teamId: body.teamId ? String(body.teamId) : undefined,
        limit: typeof body.limit === "number" ? body.limit : undefined,
        force: Boolean(body.force),
        emailDeliveryId: body.emailDeliveryId ? String(body.emailDeliveryId) : undefined
      })
    };
  }
  return {
    body: await deliverEnterpriseNotifications(context, {
      teamId: body.teamId ? String(body.teamId) : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      force: Boolean(body.force),
      notificationId: body.notificationId ? String(body.notificationId) : undefined
    })
  };
}
