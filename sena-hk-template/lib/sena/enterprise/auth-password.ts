import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";

export const enterprisePasswordPolicy = {
  schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePasswordPolicy,
  minLength: 12,
  requiresLetter: true,
  requiresNumber: true,
  blocksCommonPasswords: true,
  blocksEmailLocalPart: true,
  blockedFragments: ["password", "123456", "qwerty", "letmein", "welcome", "changeme", "admin"]
};

export function passwordPolicyEvidence() {
  return `${enterprisePasswordPolicy.schemaVersion}/minLength:${enterprisePasswordPolicy.minLength}/letter:number/common-blocklist/email-local-part`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function authEmailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export function authEmailDomain(email: string) {
  const domain = normalizeEmail(email).split("@")[1] || "unknown";
  return domain.replace(/[^a-z0-9.-]+/g, "-").slice(0, 128) || "unknown";
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("hex");
  return `pbkdf2-sha256$210000$${salt}$${hash}`;
}

export function validateEnterprisePassword(password: string, email?: string) {
  const trimmed = password.trim();
  const lower = trimmed.toLowerCase();
  const emailLocalPart = email ? normalizeEmail(email).split("@")[0]?.toLowerCase() : "";
  const failures = [
    trimmed.length < enterprisePasswordPolicy.minLength ? "min-length" : null,
    enterprisePasswordPolicy.requiresLetter && !/[a-z]/i.test(trimmed) ? "letter-required" : null,
    enterprisePasswordPolicy.requiresNumber && !/\d/.test(trimmed) ? "number-required" : null,
    enterprisePasswordPolicy.blocksCommonPasswords && enterprisePasswordPolicy.blockedFragments.some((fragment) => lower.includes(fragment)) ? "common-password" : null,
    enterprisePasswordPolicy.blocksEmailLocalPart && emailLocalPart && emailLocalPart.length >= 4 && lower.includes(emailLocalPart) ? "email-local-part" : null
  ].filter((failure): failure is string => Boolean(failure));
  if (failures.length > 0) {
    throw new SenaEnterpriseError(
      "Password does not meet the SENA enterprise password policy.",
      400,
      "weak_password"
    );
  }
}

export function verifyPassword(password: string, stored?: string) {
  if (!stored) return false;
  const [algo, iterations, salt, expected] = stored.split("$");
  if (algo !== "pbkdf2-sha256" || !iterations || !salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
  const expectedBytes = Buffer.from(expected, "hex");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}
