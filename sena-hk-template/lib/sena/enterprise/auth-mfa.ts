import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  envValue,
  now
} from "./auth-config";
import { SenaEnterpriseError } from "./errors";
import { appendAudit } from "./ops-audit";
import {
  readEnterpriseDb,
  saveDb,
  type SenaEnterpriseDb,
  type SenaEnterpriseUser
} from "./state";

const mfaSetupMinutes = positiveIntegerEnv("SENA_MFA_SETUP_MINUTES", 10);
const mfaChallengeMinutes = positiveIntegerEnv("SENA_MFA_CHALLENGE_MINUTES", 5);
const mfaTotpStepSeconds = 30;
const mfaTotpDigits = 6;
const mfaTotpWindow = 1;
const mfaIssuer = "SENA.HK";
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type SenaEnterpriseMfaSealedSecret = {
  algorithm: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  tag: string;
};

export type SenaEnterpriseMfaFactor = {
  id: string;
  userId: string;
  type: "totp";
  label: string;
  secret: SenaEnterpriseMfaSealedSecret;
  createdAt: string;
  verifiedAt: string;
  lastUsedAt?: string;
  disabledAt?: string;
};

export type SenaEnterpriseMfaSetup = {
  id: string;
  userId: string;
  setupTokenHash: string;
  secret: SenaEnterpriseMfaSealedSecret;
  createdAt: string;
  expiresAt: string;
};

export type SenaEnterpriseMfaChallenge = {
  id: string;
  userId: string;
  challengeHash: string;
  createdAt: string;
  expiresAt: string;
};

export type SenaEnterpriseMfaStatus = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaStatus;
  enabled: boolean;
  method: "totp" | null;
  factorId?: string;
  verifiedAt?: string;
  lastUsedAt?: string;
};

export type SenaEnterpriseMfaSetupResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaSetup;
  method: "totp";
  setupToken: string;
  secret: string;
  otpauthUrl: string;
  expiresAt: string;
};

export type SenaEnterpriseMfaEnableResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaStatus;
  enabled: true;
  method: "totp";
  factorId: string;
  verifiedAt: string;
};

export type SenaEnterpriseMfaDisableResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseMfaStatus;
  enabled: false;
  method: null;
  disabledAt: string;
};

export type SenaEnterpriseLoginMfaChallenge = {
  mfaRequired: true;
  method: "totp";
  challengeToken: string;
  expiresAt: string;
};

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function positiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function timingSafeStringEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function base32Encode(bytes: Buffer) {
  let output = "";
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function mfaEncryptionKey() {
  const material = envValue("SENA_MFA_ENCRYPTION_KEY") || envValue("SENA_SESSION_SECRET") || "sena-local-enterprise-mfa-key";
  return createHash("sha256").update(material).digest();
}

function sealMfaSecret(secret: string): SenaEnterpriseMfaSealedSecret {
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

function openMfaSecret(secret: SenaEnterpriseMfaSealedSecret) {
  if (secret.algorithm !== "aes-256-gcm") {
    throw new SenaEnterpriseError("Unsupported SENA MFA secret format.", 500, "unsupported_sealed_secret");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", mfaEncryptionKey(), Buffer.from(secret.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(secret.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new SenaEnterpriseError("Could not open the SENA MFA secret.", 500, "sealed_secret_open_failed");
  }
}

function hotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", key).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % (10 ** mfaTotpDigits)).padStart(mfaTotpDigits, "0");
}

function totpCounter(timestamp = Date.now()) {
  return Math.floor(timestamp / 1000 / mfaTotpStepSeconds);
}

function verifyTotp(secret: string, code: string) {
  const normalized = code.trim().replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${mfaTotpDigits}}$`).test(normalized)) return false;
  const counter = totpCounter();
  for (let offset = -mfaTotpWindow; offset <= mfaTotpWindow; offset += 1) {
    if (timingSafeStringEqual(hotp(secret, counter + offset), normalized)) return true;
  }
  return false;
}

function mfaSetupExpiry() {
  return new Date(Date.now() + mfaSetupMinutes * 60 * 1000).toISOString();
}

function mfaChallengeExpiry() {
  return new Date(Date.now() + mfaChallengeMinutes * 60 * 1000).toISOString();
}

export function activeMfaFactor(db: SenaEnterpriseDb, userId: string) {
  return (db.mfaFactors ?? []).find((factor) => factor.userId === userId && !factor.disabledAt);
}

function mfaTeamId(context: SenaEnterpriseSessionContext) {
  return context.memberships[0]?.teamId ?? context.teams[0]?.id;
}

function mfaUserTeamId(db: SenaEnterpriseDb, user: SenaEnterpriseUser) {
  const memberships = db.memberships.filter((membership) => membership.userId === user.id);
  return memberships.find((membership) => membership.status === "active")?.teamId ?? memberships[0]?.teamId;
}

function mfaOtpAuthUrl(user: SenaEnterpriseUser, secret: string) {
  const label = `${mfaIssuer}:${user.email}`;
  const params = new URLSearchParams({
    secret,
    issuer: mfaIssuer,
    algorithm: "SHA1",
    digits: String(mfaTotpDigits),
    period: String(mfaTotpStepSeconds)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function createMfaChallenge(db: SenaEnterpriseDb, user: SenaEnterpriseUser): SenaEnterpriseLoginMfaChallenge {
  const challengeToken = randomBytes(32).toString("base64url");
  const challenge: SenaEnterpriseMfaChallenge = {
    id: id("mfachal"),
    userId: user.id,
    challengeHash: tokenHash(challengeToken),
    createdAt: now(),
    expiresAt: mfaChallengeExpiry()
  };
  db.mfaChallenges = (db.mfaChallenges ?? [])
    .filter((candidate) => candidate.userId !== user.id && Date.parse(candidate.expiresAt) > Date.now());
  db.mfaChallenges.push(challenge);
  appendAudit(db, {
    event: "auth.mfa.challenge",
    userId: user.id,
    teamId: mfaUserTeamId(db, user),
    detail: { method: "totp", challengeId: challenge.id, expiresAt: challenge.expiresAt }
  });
  return {
    mfaRequired: true,
    method: "totp",
    challengeToken,
    expiresAt: challenge.expiresAt
  };
}

export function verifyMfaChallenge(db: SenaEnterpriseDb, user: SenaEnterpriseUser, input: {
  mfaChallengeToken?: string;
  mfaCode?: string;
}) {
  const challenge = (db.mfaChallenges ?? []).find((candidate) => (
    candidate.userId === user.id &&
    candidate.challengeHash === tokenHash(input.mfaChallengeToken ?? "")
  ));
  const factor = activeMfaFactor(db, user.id);
  const challengeValid = Boolean(challenge && Date.parse(challenge.expiresAt) > Date.now());
  const codeValid = Boolean(factor && input.mfaCode && verifyTotp(openMfaSecret(factor.secret), input.mfaCode));
  appendAudit(db, {
    event: "auth.mfa.verify",
    userId: user.id,
    teamId: mfaUserTeamId(db, user),
    detail: {
      method: "totp",
      phase: "login",
      success: challengeValid && codeValid,
      challengeId: challenge?.id ?? null
    }
  });

  if (!challengeValid || !codeValid || !challenge || !factor) {
    saveDb(db);
    throw new SenaEnterpriseError("Authenticator code is incorrect or expired.", 401, "invalid_mfa_code");
  }

  factor.lastUsedAt = now();
  db.mfaChallenges = (db.mfaChallenges ?? []).filter((candidate) => candidate.id !== challenge.id);
}

export function getEnterpriseMfaStatus(context: SenaEnterpriseSessionContext): SenaEnterpriseMfaStatus {
  const db = readEnterpriseDb();
  const factor = activeMfaFactor(db, context.user.id);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaStatus,
    enabled: Boolean(factor),
    method: factor ? "totp" : null,
    factorId: factor?.id,
    verifiedAt: factor?.verifiedAt,
    lastUsedAt: factor?.lastUsedAt
  };
}

export function createEnterpriseMfaSetup(context: SenaEnterpriseSessionContext): SenaEnterpriseMfaSetupResult {
  const db = readEnterpriseDb();
  const user = db.users.find((candidate) => candidate.id === context.user.id);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  if (activeMfaFactor(db, user.id)) {
    throw new SenaEnterpriseError("Authenticator MFA is already enabled.", 409, "mfa_already_enabled");
  }

  const secret = base32Encode(randomBytes(20));
  const setupToken = randomBytes(32).toString("base64url");
  const setup: SenaEnterpriseMfaSetup = {
    id: id("mfasetup"),
    userId: user.id,
    setupTokenHash: tokenHash(setupToken),
    secret: sealMfaSecret(secret),
    createdAt: now(),
    expiresAt: mfaSetupExpiry()
  };
  db.mfaSetups = (db.mfaSetups ?? []).filter((candidate) => candidate.userId !== user.id && Date.parse(candidate.expiresAt) > Date.now());
  db.mfaSetups.push(setup);
  appendAudit(db, {
    event: "auth.mfa.setup",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: { method: "totp", setupId: setup.id, expiresAt: setup.expiresAt }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaSetup,
    method: "totp",
    setupToken,
    secret,
    otpauthUrl: mfaOtpAuthUrl(user, secret),
    expiresAt: setup.expiresAt
  };
}

export function enableEnterpriseMfa(context: SenaEnterpriseSessionContext, input: {
  setupToken: string;
  code: string;
  label?: string;
}): SenaEnterpriseMfaEnableResult {
  const db = readEnterpriseDb();
  const user = db.users.find((candidate) => candidate.id === context.user.id);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  if (activeMfaFactor(db, user.id)) {
    throw new SenaEnterpriseError("Authenticator MFA is already enabled.", 409, "mfa_already_enabled");
  }

  const setup = (db.mfaSetups ?? []).find((candidate) => (
    candidate.userId === user.id &&
    candidate.setupTokenHash === tokenHash(input.setupToken)
  ));
  const setupValid = Boolean(setup && Date.parse(setup.expiresAt) > Date.now());
  const secret = setup ? openMfaSecret(setup.secret) : "";
  const codeValid = setupValid && verifyTotp(secret, input.code);
  appendAudit(db, {
    event: "auth.mfa.verify",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: {
      method: "totp",
      phase: "setup",
      success: codeValid,
      setupId: setup?.id ?? null
    }
  });
  if (!setup || !setupValid || !codeValid) {
    saveDb(db);
    throw new SenaEnterpriseError("Authenticator setup code is incorrect or expired.", 401, "invalid_mfa_code");
  }

  const verifiedAt = now();
  const factor: SenaEnterpriseMfaFactor = {
    id: id("mfafactor"),
    userId: user.id,
    type: "totp",
    label: input.label?.trim().slice(0, 80) || "Authenticator app",
    secret: setup.secret,
    createdAt: verifiedAt,
    verifiedAt
  };
  db.mfaFactors.push(factor);
  db.mfaSetups = (db.mfaSetups ?? []).filter((candidate) => candidate.id !== setup.id);
  appendAudit(db, {
    event: "auth.mfa.enable",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: { method: "totp", factorId: factor.id }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaStatus,
    enabled: true,
    method: "totp",
    factorId: factor.id,
    verifiedAt
  };
}

export function disableEnterpriseMfa(context: SenaEnterpriseSessionContext, input: { code: string }): SenaEnterpriseMfaDisableResult {
  const db = readEnterpriseDb();
  const user = db.users.find((candidate) => candidate.id === context.user.id);
  if (!user) throw new SenaEnterpriseError("Session user no longer exists.", 401, "session_user_missing");
  const factor = activeMfaFactor(db, user.id);
  if (!factor) throw new SenaEnterpriseError("Authenticator MFA is not enabled.", 404, "mfa_not_enabled");

  const success = verifyTotp(openMfaSecret(factor.secret), input.code);
  appendAudit(db, {
    event: "auth.mfa.verify",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: {
      method: "totp",
      phase: "disable",
      success,
      factorId: factor.id
    }
  });
  if (!success) {
    saveDb(db);
    throw new SenaEnterpriseError("Authenticator code is incorrect.", 401, "invalid_mfa_code");
  }

  const disabledAt = now();
  factor.disabledAt = disabledAt;
  appendAudit(db, {
    event: "auth.mfa.disable",
    userId: user.id,
    teamId: mfaTeamId(context),
    detail: { method: "totp", factorId: factor.id }
  });
  saveDb(db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseMfaStatus,
    enabled: false,
    method: null,
    disabledAt
  };
}
