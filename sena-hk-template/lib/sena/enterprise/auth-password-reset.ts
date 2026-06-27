import { randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { envValue, now, passwordResetTokenExposure } from "./auth-config";
import {
  authEmailDomain,
  authEmailHash,
  hashPassword,
  normalizeEmail,
  tokenHash,
  validateEnterprisePassword
} from "./auth-password";
import { SenaEnterpriseError } from "./errors";
import {
  queueEnterpriseNotification
} from "./notifications-delivery";
import {
  queueEnterpriseEmail,
  type SenaEnterpriseEmailDelivery
} from "./notifications-email";
import { appendAudit } from "./ops-audit";
import {
  readEnterpriseDb,
  saveDb,
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
    mode: "email-provider-required" | "email-webhook" | "local-token";
    emailDeliveryId?: string;
    resetToken?: string;
    resetUrl?: string;
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

function passwordResetDeliveryMode(emailDelivery?: SenaEnterpriseEmailDelivery): SenaEnterprisePasswordResetRequestResult["delivery"]["mode"] {
  if (passwordResetTokenExposure()) return "local-token";
  return emailDelivery ? "email-webhook" : "email-provider-required";
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

export function createEnterprisePasswordReset(input: {
  email: string;
  baseUrl?: string;
}): SenaEnterprisePasswordResetRequestResult {
  const db = readEnterpriseDb();
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

  appendAudit(db, {
    event: "auth.password_reset.request",
    userId: user?.id,
    teamId: passwordResetTeamId(db, user),
    detail: {
      emailHash,
      emailDomain,
      delivery: passwordResetDeliveryMode(emailDelivery),
      emailDeliveryId: emailDelivery?.id ?? null,
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
        delivery: passwordResetDeliveryMode(emailDelivery),
        emailDeliveryId: emailDelivery?.id ?? null
      }
    });
  }
  saveDb(db);

  const delivery: SenaEnterprisePasswordResetRequestResult["delivery"] = {
    mode: passwordResetDeliveryMode(emailDelivery),
    emailDeliveryId: emailDelivery?.id
  };
  if (passwordResetTokenExposure()) {
    delivery.resetToken = user ? resetToken : randomBytes(32).toString("base64url");
    const exposedResetUrl = new URL("/reset-password", passwordResetBaseUrl(input.baseUrl));
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

export function completeEnterprisePasswordReset(input: {
  resetToken: string;
  password: string;
}): SenaEnterprisePasswordResetCompleteResult {
  validateEnterprisePassword(input.password);
  const db = readEnterpriseDb();
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
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePasswordResetComplete,
    status: "completed",
    resetAt
  };
}
