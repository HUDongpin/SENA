import { createHash, randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { now } from "./auth-config";
import { authEmailDomain, authEmailHash } from "./auth-password";
import { SenaEnterpriseError } from "./errors";
import { appendAudit } from "./ops-audit";
import {
  readEnterpriseDb,
  saveDb,
  type SenaEnterpriseDb,
  type SenaEnterpriseUser
} from "./state";

const authLockoutMaxFailures = positiveIntegerEnv("SENA_AUTH_LOCKOUT_MAX_FAILURES", 5);
const authLockoutWindowMinutes = positiveIntegerEnv("SENA_AUTH_LOCKOUT_WINDOW_MINUTES", 15);
const authLockoutMinutes = positiveIntegerEnv("SENA_AUTH_LOCKOUT_MINUTES", 15);
const authApiRateLimitWindowSeconds = positiveIntegerEnv("SENA_AUTH_API_RATE_LIMIT_WINDOW_SECONDS", 60);
const authApiRateLimitMaxRequests = positiveIntegerEnv("SENA_AUTH_API_RATE_LIMIT_MAX_REQUESTS", 20);
const passwordResetRateLimitWindowSeconds = positiveIntegerEnv("SENA_PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS", 15 * 60);
const passwordResetRateLimitMaxRequests = positiveIntegerEnv("SENA_PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS", 5);
const ssoRateLimitWindowSeconds = positiveIntegerEnv("SENA_SSO_RATE_LIMIT_WINDOW_SECONDS", 5 * 60);
const ssoRateLimitMaxRequests = positiveIntegerEnv("SENA_SSO_RATE_LIMIT_MAX_REQUESTS", 30);

export type SenaEnterpriseAuthLockout = {
  id: string;
  emailHash: string;
  emailDomain: string;
  failedCount: number;
  firstFailedAt: string;
  lastFailedAt: string;
  lockedUntil?: string;
};

export type SenaEnterpriseApiRateLimit = {
  id: string;
  bucket: string;
  keyHash: string;
  requestCount: number;
  limit: number;
  windowSeconds: number;
  windowStartedAt: string;
  expiresAt: string;
  limitedAt?: string;
};

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function positiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function authLockoutWindowMs() {
  return authLockoutWindowMinutes * 60 * 1000;
}

function authLockoutDurationMs() {
  return authLockoutMinutes * 60 * 1000;
}

function pruneAuthLockouts(db: SenaEnterpriseDb) {
  const timestamp = Date.now();
  const staleFailureCutoff = timestamp - authLockoutWindowMs();
  return (db.authLockouts ?? []).filter((lockout) => {
    const lockedUntil = lockout.lockedUntil ? Date.parse(lockout.lockedUntil) : 0;
    if (lockedUntil > timestamp) return true;
    return Date.parse(lockout.lastFailedAt) >= staleFailureCutoff;
  });
}

function authLockoutTeamId(db: SenaEnterpriseDb, user?: SenaEnterpriseUser) {
  if (!user) return undefined;
  const memberships = db.memberships.filter((membership) => membership.userId === user.id);
  return memberships.find((membership) => membership.status === "active")?.teamId ?? memberships[0]?.teamId;
}

export function isAuthLockoutActive(lockout: SenaEnterpriseAuthLockout | undefined) {
  return Boolean(lockout?.lockedUntil && Date.parse(lockout.lockedUntil) > Date.now());
}

export function findAuthLockout(db: SenaEnterpriseDb, email: string) {
  db.authLockouts = pruneAuthLockouts(db);
  const emailHash = authEmailHash(email);
  return db.authLockouts.find((lockout) => lockout.emailHash === emailHash);
}

export function appendLockedLoginAudit(
  db: SenaEnterpriseDb,
  email: string,
  user: SenaEnterpriseUser | undefined,
  lockout: SenaEnterpriseAuthLockout
) {
  appendAudit(db, {
    event: "auth.login.locked",
    userId: user?.id,
    teamId: authLockoutTeamId(db, user),
    detail: {
      method: "password",
      emailHash: lockout.emailHash,
      emailDomain: authEmailDomain(email),
      failedCount: lockout.failedCount,
      lockedUntil: lockout.lockedUntil ?? null
    }
  });
}

export function recordFailedLogin(db: SenaEnterpriseDb, email: string, user?: SenaEnterpriseUser) {
  const timestamp = now();
  const timestampMs = Date.parse(timestamp);
  const emailHash = authEmailHash(email);
  const emailDomain = authEmailDomain(email);
  db.authLockouts = pruneAuthLockouts(db);
  const existingLockout = db.authLockouts.find((candidate) => candidate.emailHash === emailHash);
  let lockout: SenaEnterpriseAuthLockout;
  if (existingLockout && timestampMs - Date.parse(existingLockout.firstFailedAt) <= authLockoutWindowMs()) {
    lockout = existingLockout;
  } else {
    lockout = {
      id: id("authlock"),
      emailHash,
      emailDomain,
      failedCount: 0,
      firstFailedAt: timestamp,
      lastFailedAt: timestamp
    };
    db.authLockouts = db.authLockouts.filter((candidate) => candidate.emailHash !== emailHash);
    db.authLockouts.push(lockout);
  }

  lockout.emailDomain = emailDomain;
  lockout.failedCount += 1;
  lockout.lastFailedAt = timestamp;
  if (lockout.failedCount >= authLockoutMaxFailures) {
    lockout.lockedUntil = new Date(Date.now() + authLockoutDurationMs()).toISOString();
  }

  appendAudit(db, {
    event: "auth.login.failed",
    userId: user?.id,
    teamId: authLockoutTeamId(db, user),
    detail: {
      method: "password",
      emailHash,
      emailDomain,
      failedCount: lockout.failedCount,
      locked: isAuthLockoutActive(lockout),
      lockedUntil: lockout.lockedUntil ?? null
    }
  });
  if (isAuthLockoutActive(lockout)) {
    appendLockedLoginAudit(db, email, user, lockout);
  }
  return lockout;
}

export function clearFailedLogin(db: SenaEnterpriseDb, email: string) {
  const emailHash = authEmailHash(email);
  db.authLockouts = (db.authLockouts ?? []).filter((lockout) => lockout.emailHash !== emailHash);
}

export function pruneApiRateLimits(db: SenaEnterpriseDb) {
  const current = Date.now();
  return (db.apiRateLimits ?? []).filter((record) => Date.parse(record.expiresAt) > current);
}

export function enforceEnterpriseApiRateLimit(input: {
  bucket: string;
  key: string;
  limit?: number;
  windowSeconds?: number;
}) {
  const bucket = input.bucket.replace(/[^a-zA-Z0-9:._-]+/g, "-").slice(0, 96) || "api";
  const defaultLimit = bucket.includes("password_reset")
    ? passwordResetRateLimitMaxRequests
    : bucket.includes("sso")
      ? ssoRateLimitMaxRequests
      : authApiRateLimitMaxRequests;
  const defaultWindowSeconds = bucket.includes("password_reset")
    ? passwordResetRateLimitWindowSeconds
    : bucket.includes("sso")
      ? ssoRateLimitWindowSeconds
      : authApiRateLimitWindowSeconds;
  const limit = Math.max(1, Math.floor(input.limit ?? defaultLimit));
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds ?? defaultWindowSeconds));
  const keyHash = createHash("sha256").update(`${bucket}:${input.key || "anonymous"}`).digest("hex");
  const timestamp = now();
  const timestampMs = Date.parse(timestamp);
  const db = readEnterpriseDb();
  db.apiRateLimits = pruneApiRateLimits(db);
  let record = db.apiRateLimits.find((candidate) => candidate.bucket === bucket && candidate.keyHash === keyHash);
  if (!record || Date.parse(record.expiresAt) <= timestampMs) {
    record = {
      id: id("ratelimit"),
      bucket,
      keyHash,
      requestCount: 0,
      limit,
      windowSeconds,
      windowStartedAt: timestamp,
      expiresAt: new Date(timestampMs + windowSeconds * 1000).toISOString()
    };
    db.apiRateLimits = db.apiRateLimits.filter((candidate) => !(candidate.bucket === bucket && candidate.keyHash === keyHash));
    db.apiRateLimits.push(record);
  }

  record.limit = limit;
  record.windowSeconds = windowSeconds;
  record.requestCount += 1;
  if (record.requestCount > limit) {
    if (record.requestCount === limit + 1) {
      record.limitedAt = timestamp;
      appendAudit(db, {
        event: "security.rate_limit",
        detail: {
          bucket,
          keyHash,
          requestCount: record.requestCount,
          limit,
          windowSeconds,
          resetAt: record.expiresAt
        }
      });
    }
    saveDb(db);
    throw new SenaEnterpriseError("Too many requests. Try again after the rate-limit window resets.", 429, "api_rate_limited");
  }

  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseApiRateLimit,
    bucket,
    keyHash,
    requestCount: record.requestCount,
    limit,
    remaining: Math.max(0, limit - record.requestCount),
    resetAt: record.expiresAt
  };
}
