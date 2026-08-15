import { randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { envValue, now, passwordResetTokenExposure, passwordResetTokenExposurePolicy } from "./auth-config";
import {
  authEmailDomain,
  authEmailHash,
  hashPassword,
  normalizeEmail,
  tokenHash,
  validateEnterprisePassword
} from "./auth-password";
import {
  enforceEnterpriseAuthSubjectRateLimit,
  enforceEnterpriseAuthSubjectRateLimitAsync
} from "./auth-security";
import { SenaEnterpriseError } from "./errors";
import {
  queueEnterpriseNotification
} from "./notifications-delivery";
import {
  dispatchEnterpriseEmailDelivery,
  enterpriseEmailProvider,
  queueEnterpriseEmail,
  type SenaEnterpriseEmailDelivery
} from "./notifications-email";
import { appendAudit } from "./ops-audit";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  type SenaEnterpriseDb,
  type SenaEnterpriseUser
} from "./state";

const passwordResetMinutes = positiveIntegerEnv("SENA_PASSWORD_RESET_MINUTES", 30);

export type SenaEnterprisePasswordResetRequest = {
  id: string;
  userId?: string;
  emailHash: string;
  emailDomain: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type SenaEnterprisePasswordResetRequestResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePasswordResetRequest;
  status: "queued";
  expiresAt: string;
  delivery: {
    mode: "email-provider-required" | "email-webhook" | "email-dispatch-failed" | "local-token";
    emailDeliveryId?: string;
    resetToken?: string;
    resetUrl?: string;
    tokenExposure: ReturnType<typeof passwordResetTokenExposurePolicy>;
  };
};

export type SenaEnterprisePasswordResetCompleteResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePasswordResetComplete;
  status: "completed";
  resetAt: string;
};

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function positiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function normalizedBaseUrl(baseUrl?: string) {
  const candidate = (baseUrl || envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL") || "http://localhost:3000").replace(/\/+$/, "");
  try {
    return new URL(candidate).origin;
  } catch {
    throw new SenaEnterpriseError("SENA_APP_URL must be an absolute URL for password reset links.", 500, "invalid_app_url");
  }
}

function passwordResetExpiry() {
  return new Date(Date.now() + passwordResetMinutes * 60 * 1000).toISOString();
}

type SenaEnterprisePasswordResetDispatch = {
  attempted: boolean;
  delivered: boolean;
  errorCode?: string;
};

const passwordResetDispatchNotAttempted: SenaEnterprisePasswordResetDispatch = {
  attempted: false,
  delivered: false
};

// The mode is a function of the configured channel and that channel's observed
// health — never of whether the address belongs to an account. Deriving it from
// the queued email (as this used to) made an existing account answer
// `email-webhook` while an unknown one answered `email-provider-required`, which
// is an account-enumeration oracle in the production posture.
function passwordResetDeliveryMode(
  providerConfigured: boolean,
  dispatchHealth: "confirmed" | "failed"
): SenaEnterprisePasswordResetRequestResult["delivery"]["mode"] {
  if (passwordResetTokenExposure()) return "local-token";
  if (!providerConfigured) return "email-provider-required";
  return dispatchHealth === "failed" ? "email-dispatch-failed" : "email-webhook";
}

function passwordResetEmailProviderConfigured() {
  try {
    return enterpriseEmailProvider().configured;
  } catch {
    // An unparseable webhook URL is still an operator who configured a provider;
    // the dispatch outcome, not the provider probe, carries the failure.
    return true;
  }
}

// An unknown address has no email to dispatch, so it inherits the channel's last
// observed health. Reporting a failure requires positive evidence of a failed
// attempt, which keeps the known and unknown branches identical on a deployment
// that has never seen one.
function passwordResetDispatchHealth(
  db: SenaEnterpriseDb,
  dispatch: SenaEnterprisePasswordResetDispatch
): "confirmed" | "failed" {
  if (dispatch.attempted) return dispatch.delivered ? "confirmed" : "failed";
  const lastAttempted = (db.emailDeliveries ?? [])
    .filter((delivery) => delivery.kind === "auth.password_reset" && delivery.attempts > 0 && delivery.lastAttemptAt)
    .sort((a, b) => (b.lastAttemptAt ?? "").localeCompare(a.lastAttemptAt ?? ""))[0];
  return lastAttempted && lastAttempted.status !== "delivered" ? "failed" : "confirmed";
}

async function dispatchPasswordResetEmail(
  db: SenaEnterpriseDb,
  emailDelivery?: SenaEnterpriseEmailDelivery
): Promise<SenaEnterprisePasswordResetDispatch> {
  if (!emailDelivery) return passwordResetDispatchNotAttempted;
  const outcome = await dispatchEnterpriseEmailDelivery(db, emailDelivery);
  return {
    attempted: outcome.attempted,
    delivered: outcome.delivered,
    errorCode: outcome.errorCode
  };
}

function passwordResetBaseUrl(baseUrl?: string) {
  return normalizedBaseUrl(baseUrl);
}

function passwordResetTeamId(db: SenaEnterpriseDb, user?: SenaEnterpriseUser) {
  if (!user) return undefined;
  const memberships = db.memberships.filter((membership) => membership.userId === user.id);
  return memberships.find((membership) => membership.status === "active")?.teamId ?? memberships[0]?.teamId;
}

function clearFailedLogin(db: SenaEnterpriseDb, email: string) {
  const emailHash = authEmailHash(email);
  db.authLockouts = (db.authLockouts ?? []).filter((lockout) => lockout.emailHash !== emailHash);
}

export type SenaEnterprisePasswordResetInput = {
  email: string;
  baseUrl?: string;
};

export type SenaEnterprisePasswordResetCompleteInput = {
  resetToken: string;
  password: string;
};

type PreparedEnterprisePasswordReset = {
  emailHash: string;
  emailDomain: string;
  user?: SenaEnterpriseUser;
  emailDelivery?: SenaEnterpriseEmailDelivery;
  resetToken: string;
  expiresAt: string;
  baseUrl?: string;
};

function prepareEnterprisePasswordResetInDb(
  db: SenaEnterpriseDb,
  input: SenaEnterprisePasswordResetInput
): PreparedEnterprisePasswordReset {
  const email = normalizeEmail(input.email);
  const emailHash = authEmailHash(email);
  const emailDomain = authEmailDomain(email);
  const user = db.users.find((candidate) => candidate.email === email);
  const expiresAt = passwordResetExpiry();
  const resetToken = randomBytes(32).toString("base64url");
  const resetUrl = new URL("/reset-password", passwordResetBaseUrl(input.baseUrl));
  resetUrl.searchParams.set("token", resetToken);

  db.passwordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => request.emailHash !== emailHash && Date.parse(request.expiresAt) > Date.now() && !request.usedAt);

  let emailDelivery: SenaEnterpriseEmailDelivery | undefined;
  if (user) {
    const request: SenaEnterprisePasswordResetRequest = {
      id: id("pwreset"),
      userId: user.id,
      emailHash,
      emailDomain,
      tokenHash: tokenHash(resetToken),
      createdAt: now(),
      expiresAt
    };
    db.passwordResetRequests.push(request);
    emailDelivery = queueEnterpriseEmail(db, {
      kind: "auth.password_reset",
      recipientEmail: user.email,
      recipientName: user.name,
      userId: user.id,
      teamId: passwordResetTeamId(db, user),
      subject: "Reset your SENA password",
      bodyText: "A password reset was requested for your SENA account. Use the secure link before it expires.",
      actionUrl: resetUrl.toString(),
      expiresAt,
      templateData: {
        resetRequestId: request.id,
        expiresAt,
        userName: user.name
      }
    });
  }

  return {
    emailHash,
    emailDomain,
    user,
    emailDelivery,
    resetToken,
    expiresAt,
    baseUrl: input.baseUrl
  };
}

function finalizeEnterprisePasswordReset(
  db: SenaEnterpriseDb,
  prepared: PreparedEnterprisePasswordReset,
  dispatch: SenaEnterprisePasswordResetDispatch
): SenaEnterprisePasswordResetRequestResult {
  const { emailDelivery, emailHash, emailDomain, expiresAt, user } = prepared;
  const mode = passwordResetDeliveryMode(
    passwordResetEmailProviderConfigured(),
    passwordResetDispatchHealth(db, dispatch)
  );

  appendAudit(db, {
    event: "auth.password_reset.request",
    userId: user?.id,
    teamId: passwordResetTeamId(db, user),
    detail: {
      emailHash,
      emailDomain,
      delivery: mode,
      emailDeliveryId: emailDelivery?.id ?? null,
      emailStatus: emailDelivery?.status ?? null,
      dispatchAttempted: dispatch.attempted,
      dispatchDelivered: dispatch.delivered,
      dispatchErrorCode: dispatch.errorCode ?? null,
      expiresAt
    }
  });
  if (user) {
    queueEnterpriseNotification(db, {
      kind: "auth.password_reset",
      userId: user.id,
      email: user.email,
      teamId: passwordResetTeamId(db, user),
      title: "SENA password reset requested",
      body: "A password reset was requested for your SENA account.",
      actionUrl: "/reset-password",
      detail: {
        expiresAt,
        delivery: mode,
        emailDeliveryId: emailDelivery?.id ?? null,
        emailStatus: emailDelivery?.status ?? null
      }
    });
  }
  const delivery: SenaEnterprisePasswordResetRequestResult["delivery"] = {
    mode,
    tokenExposure: passwordResetTokenExposurePolicy()
  };
  if (passwordResetTokenExposure()) {
    // The queue id only exists when the address resolved to an account, so it is
    // only safe to return alongside an exposed token — a posture that already
    // hands the caller the reset material.
    delivery.emailDeliveryId = emailDelivery?.id;
    delivery.resetToken = user ? prepared.resetToken : randomBytes(32).toString("base64url");
    const exposedResetUrl = new URL("/reset-password", passwordResetBaseUrl(prepared.baseUrl));
    exposedResetUrl.searchParams.set("token", delivery.resetToken);
    delivery.resetUrl = exposedResetUrl.toString();
  }

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePasswordResetRequest,
    status: "queued",
    expiresAt,
    delivery
  };
}

// Synchronous callers (the local file-backed facade) cannot await a webhook, so
// this entry point only queues. Production self-service reset runs through
// `createEnterprisePasswordResetAsync`, which dispatches inline.
export function createEnterprisePasswordReset(input: SenaEnterprisePasswordResetInput): SenaEnterprisePasswordResetRequestResult {
  enforceEnterpriseAuthSubjectRateLimit({ bucket: "auth.password_reset", subject: normalizeEmail(input.email) });
  const db = readEnterpriseDb();
  const prepared = prepareEnterprisePasswordResetInDb(db, input);
  const result = finalizeEnterprisePasswordReset(db, prepared, passwordResetDispatchNotAttempted);
  saveDb(db);
  return result;
}

export async function createEnterprisePasswordResetAsync(input: SenaEnterprisePasswordResetInput): Promise<SenaEnterprisePasswordResetRequestResult> {
  await enforceEnterpriseAuthSubjectRateLimitAsync({ bucket: "auth.password_reset", subject: normalizeEmail(input.email) });
  const state = await readEnterpriseState();
  const prepared = prepareEnterprisePasswordResetInDb(state.db, input);
  // Dispatch before the single save so the persisted delivery record, the audit
  // trail, and the mode the caller is told all describe the same outcome.
  const dispatch = await dispatchPasswordResetEmail(state.db, prepared.emailDelivery);
  const result = finalizeEnterprisePasswordReset(state.db, prepared, dispatch);
  await saveEnterpriseState(state, state.db);
  return result;
}

function completeEnterprisePasswordResetInDb(
  db: SenaEnterpriseDb,
  input: SenaEnterprisePasswordResetCompleteInput
): SenaEnterprisePasswordResetCompleteResult {
  validateEnterprisePassword(input.password);
  const resetHash = tokenHash(input.resetToken);
  const request = (db.passwordResetRequests ?? []).find((candidate) => (
    candidate.tokenHash === resetHash &&
    !candidate.usedAt &&
    Date.parse(candidate.expiresAt) > Date.now()
  ));
  if (!request?.userId) {
    throw new SenaEnterpriseError("Password reset link is invalid or expired.", 401, "invalid_password_reset_token");
  }
  const user = db.users.find((candidate) => candidate.id === request.userId);
  if (!user) {
    throw new SenaEnterpriseError("Password reset user is no longer available.", 410, "password_reset_user_missing");
  }
  validateEnterprisePassword(input.password, user.email);

  const resetAt = now();
  user.passwordHash = hashPassword(input.password);
  user.updatedAt = resetAt;
  request.usedAt = resetAt;
  db.sessions = db.sessions.filter((session) => session.userId !== user.id);
  db.mfaChallenges = (db.mfaChallenges ?? []).filter((challenge) => challenge.userId !== user.id);
  clearFailedLogin(db, user.email);
  appendAudit(db, {
    event: "auth.password_reset.complete",
    userId: user.id,
    teamId: passwordResetTeamId(db, user),
    detail: {
      emailHash: request.emailHash,
      emailDomain: request.emailDomain,
      resetRequestId: request.id,
      sessionsRevoked: true
    }
  });
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePasswordResetComplete,
    status: "completed",
    resetAt
  };
}

export function completeEnterprisePasswordReset(input: SenaEnterprisePasswordResetCompleteInput): SenaEnterprisePasswordResetCompleteResult {
  const db = readEnterpriseDb();
  const result = completeEnterprisePasswordResetInDb(db, input);
  saveDb(db);
  return result;
}

export async function completeEnterprisePasswordResetAsync(input: SenaEnterprisePasswordResetCompleteInput): Promise<SenaEnterprisePasswordResetCompleteResult> {
  const state = await readEnterpriseState();
  const result = completeEnterprisePasswordResetInDb(state.db, input);
  await saveEnterpriseState(state, state.db);
  return result;
}
