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

export function envValueFrom(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

export function positiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export const productionEvidenceDefaultMaxAgeHours = 168;

export type SenaProductionEvidenceTimestampStatus = "fresh" | "missing-or-invalid" | "future" | "stale";

export function productionEvidenceMaxAgeHours(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  const parsed = Number(envValueFrom(env, "SENA_PRODUCTION_EVIDENCE_MAX_AGE_HOURS"));
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : productionEvidenceDefaultMaxAgeHours;
}

export function productionEvidenceTimestampStatus(
  value: string | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  nowMs = Date.now()
): SenaProductionEvidenceTimestampStatus {
  if (!value) return "missing-or-invalid";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "missing-or-invalid";
  if (parsed > nowMs + 60_000) return "future";
  const maxAgeMs = productionEvidenceMaxAgeHours(env) * 60 * 60 * 1000;
  return nowMs - parsed <= maxAgeMs ? "fresh" : "stale";
}

export function productionEvidenceTimestampConfigured(
  value: string | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  return productionEvidenceTimestampStatus(value, env) === "fresh";
}

export function productionEvidenceTimestampEvidenceValue(
  value: string | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  const status = productionEvidenceTimestampStatus(value, env);
  return status === "fresh" ? "valid" : status;
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
