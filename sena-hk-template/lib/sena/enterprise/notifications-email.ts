import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  hasEnterprisePermission,
  requireEnterprisePermission
} from "./access-control";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import type { SenaEnterpriseMfaSealedSecret } from "./auth-mfa";
import { SenaEnterpriseError } from "./errors";
import { appendAudit } from "./ops-audit";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  type SenaEnterpriseDb
} from "./state";
import {
  emailWebhookProvider,
  emailWebhookSecret,
  emailWebhookTimeoutMs,
  emailWebhookUrl,
  localWebhookSinkAttempt,
  webhookErrorHash,
  webhookQueueProvider,
  webhookRetryAt,
  webhookTimeoutMs,
  type SenaEnterpriseWebhookProviderMode,
  type SenaEnterpriseWebhookQueueProvider
} from "./webhook-delivery";

export type SenaEnterpriseEmailDeliveryKind = "auth.password_reset" | "team.invite";

export type SenaEnterpriseEmailDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseEmailDeliveryPayload = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseEmailPayload;
  kind: SenaEnterpriseEmailDeliveryKind;
  recipient: {
    email: string;
    name?: string;
  };
  subject: string;
  bodyText: string;
  actionUrl?: string;
  expiresAt?: string;
  templateData: Record<string, string | number | boolean | null>;
};

export type SenaEnterpriseEmailDelivery = {
  id: string;
  kind: SenaEnterpriseEmailDeliveryKind;
  status: SenaEnterpriseEmailDeliveryStatus;
  provider: SenaEnterpriseWebhookQueueProvider;
  endpointHash: string;
  teamId?: string;
  userId?: string;
  projectId?: string;
  recipientEmailHash: string;
  recipientEmailDomain: string;
  sealedPayload: SenaEnterpriseMfaSealedSecret;
  queuedAt: string;
  expiresAt?: string;
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

export type SenaEnterpriseEmailDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseEmailDelivery;
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
  emails: Array<{
    emailDeliveryId: string;
    kind: SenaEnterpriseEmailDeliveryKind;
    teamId?: string;
    userId?: string;
    projectId?: string;
    emailStatus: SenaEnterpriseEmailDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};

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

function mfaEncryptionKey() {
  const material = envValue("SENA_MFA_ENCRYPTION_KEY") || envValue("SENA_SESSION_SECRET") || "sena-local-enterprise-mfa-key";
  return createHash("sha256").update(material).digest();
}

function sealEnterpriseSecret(secret: string): SenaEnterpriseMfaSealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: tag.toString("base64url")
  };
}

function openEnterpriseSecret(secret: SenaEnterpriseMfaSealedSecret, label = "SENA secret") {
  if (secret.algorithm !== "aes-256-gcm") {
    throw new SenaEnterpriseError(`Unsupported ${label} format.`, 500, "unsupported_sealed_secret");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", mfaEncryptionKey(), Buffer.from(secret.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(secret.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new SenaEnterpriseError(`Could not open the ${label}.`, 500, "sealed_secret_open_failed");
  }
}

function sealEmailDeliveryPayload(payload: SenaEnterpriseEmailDeliveryPayload): SenaEnterpriseMfaSealedSecret {
  return sealEnterpriseSecret(JSON.stringify(payload));
}

function openEmailDeliveryPayload(delivery: SenaEnterpriseEmailDelivery) {
  return JSON.parse(openEnterpriseSecret(delivery.sealedPayload, "SENA email delivery payload")) as SenaEnterpriseEmailDeliveryPayload;
}

function emailWebhookPayload(
  emailDelivery: SenaEnterpriseEmailDelivery,
  attempt: number,
  generatedAt: string
): Record<string, unknown> {
  const payload = openEmailDeliveryPayload(emailDelivery);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseEmailWebhook,
    generatedAt,
    email: {
      id: emailDelivery.id,
      kind: emailDelivery.kind,
      teamId: emailDelivery.teamId,
      userId: emailDelivery.userId,
      projectId: emailDelivery.projectId,
      recipientEmailHash: emailDelivery.recipientEmailHash,
      recipientEmailDomain: emailDelivery.recipientEmailDomain,
      recipient: payload.recipient,
      subject: payload.subject,
      bodyText: payload.bodyText,
      actionUrl: payload.actionUrl,
      expiresAt: payload.expiresAt,
      templateData: payload.templateData,
      queuedAt: emailDelivery.queuedAt
    },
    delivery: {
      provider: emailDelivery.provider,
      endpointHash: emailDelivery.endpointHash,
      attempt,
      maxAttempts: emailDelivery.maxAttempts
    }
  };
}

export function enterpriseEmailProvider() {
  return emailWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
}

// Inline dispatch runs inside a user-facing request, so it gets a tighter budget
// than the operator-triggered flush: a mail bridge that is merely slow must not
// turn a password-reset POST into a gateway timeout. The abort fires at the
// smaller of the provider timeout and this budget, so no fetch outlives the
// response it was blocking.
function emailInlineDispatchTimeoutMs() {
  return Math.min(
    emailWebhookTimeoutMs(),
    webhookTimeoutMs("SENA_EMAIL_INLINE_DISPATCH_TIMEOUT_MS", 3000, 10_000)
  );
}

type SenaEnterpriseEmailAttemptResult = {
  ok: boolean;
  httpStatus?: number;
  errorCode?: string;
  errorHash?: string;
};

async function postEmailWebhook(emailDelivery: SenaEnterpriseEmailDelivery, timeoutMs = emailWebhookTimeoutMs()) {
  const webhookUrl = emailWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Email webhook delivery is not configured.", 503, "email_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = emailDelivery.attempts + 1;
  let body: string;
  try {
    body = JSON.stringify(emailWebhookPayload(emailDelivery, attempt, generatedAt));
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: "payload_open_failed",
      errorHash: webhookErrorHash(error)
    };
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "email.deliver",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-email-delivery-id": emailDelivery.id
  };
  const secret = emailWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

export function queueEnterpriseEmail(db: SenaEnterpriseDb, input: {
  kind: SenaEnterpriseEmailDeliveryKind;
  recipientEmail: string;
  recipientName?: string;
  teamId?: string;
  userId?: string;
  projectId?: string;
  subject: string;
  bodyText: string;
  actionUrl?: string;
  expiresAt?: string;
  templateData?: Record<string, string | number | boolean | null | undefined>;
}) {
  const provider = enterpriseEmailProvider();
  if (!provider.configured || !provider.endpointHash) return undefined;
  const recipientEmail = normalizeEmail(input.recipientEmail);
  const payload: SenaEnterpriseEmailDeliveryPayload = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseEmailPayload,
    kind: input.kind,
    recipient: {
      email: recipientEmail,
      name: input.recipientName?.trim() || undefined
    },
    subject: input.subject.trim(),
    bodyText: input.bodyText.trim(),
    actionUrl: input.actionUrl,
    expiresAt: input.expiresAt,
    templateData: Object.fromEntries(Object.entries(input.templateData ?? {}).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean | null>
  };
  const queuedAt = now();
  const delivery: SenaEnterpriseEmailDelivery = {
    id: id("email"),
    kind: input.kind,
    status: "pending",
    provider: webhookQueueProvider(provider),
    endpointHash: provider.endpointHash,
    teamId: input.teamId,
    userId: input.userId,
    projectId: input.projectId,
    recipientEmailHash: authEmailHash(recipientEmail),
    recipientEmailDomain: authEmailDomain(recipientEmail),
    sealedPayload: sealEmailDeliveryPayload(payload),
    queuedAt,
    expiresAt: input.expiresAt,
    attempts: 0,
    maxAttempts: provider.maxAttempts
  };
  db.emailDeliveries.unshift(delivery);
  db.emailDeliveries = db.emailDeliveries.slice(0, 2000);
  appendAudit(db, {
    event: "email.queue",
    userId: input.userId,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      emailDeliveryId: delivery.id,
      kind: delivery.kind,
      provider: delivery.provider,
      endpointHash: delivery.endpointHash,
      recipientEmailHash: delivery.recipientEmailHash,
      recipientEmailDomain: delivery.recipientEmailDomain,
      expiresAt: delivery.expiresAt ?? null
    }
  });
  return delivery;
}

// One place records what an attempt did to a queued email, so the operator flush
// and the inline auto-dispatch can never drift into different bookkeeping.
function applyEmailDeliveryAttempt(
  db: SenaEnterpriseDb,
  emailDelivery: SenaEnterpriseEmailDelivery,
  attemptResult: SenaEnterpriseEmailAttemptResult,
  attemptedAt: string,
  actor: { userId?: string; trigger: "manual-flush" | "auto-dispatch" }
) {
  emailDelivery.attempts += 1;
  emailDelivery.lastAttemptAt = attemptedAt;
  emailDelivery.lastStatus = attemptResult.httpStatus;
  emailDelivery.lastErrorCode = attemptResult.errorCode;
  emailDelivery.lastErrorHash = attemptResult.errorHash;

  if (attemptResult.ok) {
    emailDelivery.status = "delivered";
    emailDelivery.deliveredAt = attemptedAt;
    delete emailDelivery.nextAttemptAt;
    delete emailDelivery.failedAt;
  } else if (emailDelivery.attempts >= emailDelivery.maxAttempts || attemptResult.errorCode === "expired") {
    emailDelivery.status = "failed";
    emailDelivery.failedAt = attemptedAt;
    delete emailDelivery.nextAttemptAt;
  } else {
    emailDelivery.status = "pending";
    emailDelivery.nextAttemptAt = webhookRetryAt(emailDelivery.attempts);
  }

  appendAudit(db, {
    event: attemptResult.ok ? "email.webhook.deliver" : "email.webhook.fail",
    userId: actor.userId,
    teamId: emailDelivery.teamId,
    projectId: emailDelivery.projectId,
    detail: {
      emailDeliveryId: emailDelivery.id,
      kind: emailDelivery.kind,
      provider: emailDelivery.provider,
      endpointHash: emailDelivery.endpointHash,
      attempts: emailDelivery.attempts,
      status: emailDelivery.status,
      httpStatus: emailDelivery.lastStatus ?? null,
      errorCode: emailDelivery.lastErrorCode ?? null,
      trigger: actor.trigger,
      recipientEmailHash: emailDelivery.recipientEmailHash,
      recipientEmailDomain: emailDelivery.recipientEmailDomain
    }
  });

  return emailDelivery.status;
}

export type SenaEnterpriseEmailDispatchOutcome = {
  attempted: boolean;
  delivered: boolean;
  status: SenaEnterpriseEmailDeliveryStatus;
  errorCode?: string;
};

// Sends one queued email immediately, without an operator session. This is what
// keeps self-service password reset self-service: `deliverEnterpriseEmails`
// needs a signed-in admin with team:manage (and silently ignores queue rows that
// carry no teamId), so a locked-out user cannot depend on it.
//
// It never throws: a broken mail bridge must degrade the delivery record, not
// the request that queued it.
export async function dispatchEnterpriseEmailDelivery(
  db: SenaEnterpriseDb,
  emailDelivery: SenaEnterpriseEmailDelivery,
  input: { timeoutMs?: number } = {}
): Promise<SenaEnterpriseEmailDispatchOutcome> {
  try {
    const provider = enterpriseEmailProvider();
    if (!provider.configured || !provider.endpointHash) {
      return { attempted: false, delivered: false, status: emailDelivery.status, errorCode: "email_provider_not_configured" };
    }
    if (emailDelivery.status === "delivered") {
      return { attempted: false, delivered: true, status: "delivered" };
    }
    if (emailDelivery.endpointHash !== provider.endpointHash) {
      emailDelivery.endpointHash = provider.endpointHash;
      emailDelivery.status = "pending";
      emailDelivery.attempts = 0;
      delete emailDelivery.nextAttemptAt;
      delete emailDelivery.failedAt;
    }
    emailDelivery.maxAttempts = provider.maxAttempts;
    if (emailDelivery.attempts >= emailDelivery.maxAttempts) {
      return { attempted: false, delivered: false, status: emailDelivery.status, errorCode: "max_attempts_exhausted" };
    }

    const attemptedAt = now();
    let attemptResult: SenaEnterpriseEmailAttemptResult;
    if (emailDelivery.expiresAt && Date.parse(emailDelivery.expiresAt) <= Date.now()) {
      attemptResult = { ok: false, errorCode: "expired" };
    } else if (provider.mode === "local-sink") {
      attemptResult = localWebhookSinkAttempt(emailDelivery.endpointHash);
    } else {
      attemptResult = await postEmailWebhook(emailDelivery, input.timeoutMs ?? emailInlineDispatchTimeoutMs());
    }

    const status = applyEmailDeliveryAttempt(db, emailDelivery, attemptResult, attemptedAt, {
      userId: emailDelivery.userId,
      trigger: "auto-dispatch"
    });
    return {
      attempted: true,
      delivered: attemptResult.ok,
      status,
      errorCode: attemptResult.errorCode
    };
  } catch (error) {
    // Provider misconfiguration (for example an unparseable webhook URL) raises
    // before any attempt is made. Report it as an undelivered dispatch rather
    // than failing the caller's request.
    return {
      attempted: false,
      delivered: false,
      status: emailDelivery.status,
      errorCode: error instanceof SenaEnterpriseError ? error.code : "email_dispatch_error"
    };
  }
}

export async function deliverEnterpriseEmails(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; emailDeliveryId?: string } = {}
): Promise<SenaEnterpriseEmailDeliveryResult> {
  const db = readEnterpriseDb();
  const result = await deliverEnterpriseEmailsFromDb(context, input, db);
  saveDb(db);
  return result;
}

export async function deliverEnterpriseEmailsAsync(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; emailDeliveryId?: string } = {}
): Promise<SenaEnterpriseEmailDeliveryResult> {
  const state = await readEnterpriseState();
  const result = await deliverEnterpriseEmailsFromDb(context, input, state.db);
  await saveEnterpriseState(state, state.db);
  return result;
}

async function deliverEnterpriseEmailsFromDb(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; emailDeliveryId?: string },
  db: SenaEnterpriseDb
): Promise<SenaEnterpriseEmailDeliveryResult> {
  const provider = enterpriseEmailProvider();
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 200);
  const force = Boolean(input.force);
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for email delivery.", 403, "email_delivery_permission_denied");
  }

  const result: SenaEnterpriseEmailDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseEmailDelivery,
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
    emails: []
  };

  if (!provider.configured) {
    return result;
  }

  const teamIdSet = new Set(teamIds);
  const deliveryQueue: SenaEnterpriseEmailDelivery[] = [];
  const nowMs = Date.now();

  for (const emailDelivery of (db.emailDeliveries ?? [])
    .filter((candidate) => candidate.teamId && teamIdSet.has(candidate.teamId))
    .filter((candidate) => !input.emailDeliveryId || candidate.id === input.emailDeliveryId)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
    if (emailDelivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (emailDelivery.endpointHash !== provider.endpointHash) {
      emailDelivery.endpointHash = provider.endpointHash!;
      emailDelivery.status = "pending";
      emailDelivery.attempts = 0;
      delete emailDelivery.nextAttemptAt;
      delete emailDelivery.failedAt;
    }
    emailDelivery.maxAttempts = provider.maxAttempts;
    if (emailDelivery.attempts >= emailDelivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && emailDelivery.nextAttemptAt && Date.parse(emailDelivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(emailDelivery);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const emailDelivery of targets) {
    const attemptedAt = now();
    let attemptResult: SenaEnterpriseEmailAttemptResult;
    if (emailDelivery.expiresAt && Date.parse(emailDelivery.expiresAt) <= Date.now()) {
      attemptResult = {
        ok: false,
        httpStatus: undefined,
        errorCode: "expired",
        errorHash: undefined
      };
    } else if (provider.mode === "local-sink") {
      attemptResult = localWebhookSinkAttempt(emailDelivery.endpointHash);
    } else {
      attemptResult = await postEmailWebhook(emailDelivery);
    }

    const status = applyEmailDeliveryAttempt(db, emailDelivery, attemptResult, attemptedAt, {
      userId: context.user.id,
      trigger: "manual-flush"
    });
    if (status === "delivered") {
      result.summary.delivered += 1;
    } else if (status === "failed") {
      result.summary.failed += 1;
    } else {
      result.summary.pending += 1;
    }

    result.summary.attempted += 1;
    result.emails.push({
      emailDeliveryId: emailDelivery.id,
      kind: emailDelivery.kind,
      teamId: emailDelivery.teamId,
      userId: emailDelivery.userId,
      projectId: emailDelivery.projectId,
      emailStatus: emailDelivery.status,
      attempts: emailDelivery.attempts,
      httpStatus: emailDelivery.lastStatus,
      errorCode: emailDelivery.lastErrorCode
    });
  }

  return result;
}
