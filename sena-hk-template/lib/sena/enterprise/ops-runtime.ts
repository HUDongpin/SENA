import { createHash } from "node:crypto";
import path from "node:path";
import { SenaEnterpriseError } from "./errors";

export const auditRetentionMaxEvents = 5000;
export const enterpriseDbDir = process.env.SENA_ENTERPRISE_DB_DIR || ".sena-enterprise";
export const enterpriseDbPath = path.join(enterpriseDbDir, "enterprise-db.json");
export const enterpriseDbPathHint = path.basename(enterpriseDbDir);
export const dbLockTimeoutMs = positiveIntegerEnv("SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS", 5000);

export function now() {
  return new Date().toISOString();
}

export function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

export function positiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function normalizedBaseUrl(baseUrl?: string) {
  const candidate = (baseUrl || envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL") || "http://localhost:3000").replace(/\/+$/, "");
  try {
    return new URL(candidate).origin;
  } catch {
    throw new SenaEnterpriseError("SENA_APP_URL must be an absolute URL for OAuth/OIDC SSO.", 500, "invalid_sso_app_url");
  }
}

export function sha256Text(value: string | undefined) {
  return value ? createHash("sha256").update(value).digest("hex") : undefined;
}

export function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function authEmailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export function authEmailDomain(email: string) {
  return normalizeEmail(email).split("@").at(-1) || "unknown";
}
