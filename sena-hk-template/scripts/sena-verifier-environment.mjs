import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const inheritedVerifierEnvironmentKeys = Object.freeze([
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "COLORTERM",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
  "PLAYWRIGHT_BROWSERS_PATH",
  "NEXT_TELEMETRY_DISABLED",
  "XDG_CACHE_HOME",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT"
]);

// Every entry is material that can select a non-local persistence backend or
// cause a verifier mutation to leave the temporary process. Keeping explicit
// empty entries also prevents Next's .env loading from filling these keys after
// the parent shell has been sanitized.
export const SENA_VERIFIER_EXTERNAL_ENV_KEYS = Object.freeze([
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "SENA_REQUIRE_ASYNC_HEAVY_JOBS",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_SECRET",
  "SENA_JOB_QUEUE_PROVIDER_URL",
  "SENA_JOB_QUEUE_PROVIDER_TOKEN",
  "SENA_JOB_QUEUE_NAME",
  "SENA_JOB_QUEUE_ALLOW_LOCAL",
  "SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD",
  "SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED",
  "SENA_JOB_WORKER_CALLBACK_URL",
  "QSTASH_URL",
  "UPSTASH_QSTASH_URL",
  "QSTASH_TOKEN",
  "UPSTASH_QSTASH_TOKEN",
  "QSTASH_QUEUE_NAME",
  "UPSTASH_QSTASH_QUEUE_NAME",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "SENA_NOTIFICATION_WEBHOOK_URL",
  "SENA_NOTIFICATION_WEBHOOK_SECRET",
  "SENA_EMAIL_WEBHOOK_URL",
  "SENA_EMAIL_WEBHOOK_SECRET",
  "SENA_AUDIT_WEBHOOK_URL",
  "SENA_AUDIT_WEBHOOK_SECRET",
  "SENA_BACKUP_WEBHOOK_URL",
  "SENA_BACKUP_WEBHOOK_SECRET",
  "SENA_ALERT_WEBHOOK_URL",
  "SENA_ALERTING_WEBHOOK_URL",
  "SENA_ALERT_WEBHOOK_SECRET",
  "SENA_ALERTING_WEBHOOK_SECRET",
  "SENA_ALERT_WEBHOOK_SIGNING_SECRET",
  "SENA_DATABASE_SYNC_WEBHOOK_URL",
  "SENA_DATABASE_SYNC_WEBHOOK_SECRET",
  "SENA_OBJECT_STORAGE_WEBHOOK_URL",
  "SENA_OBJECT_STORAGE_WEBHOOK_SECRET",
  "SENA_COLLABORATION_PUBSUB_WEBHOOK_URL",
  "SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET",
  "SENA_SELF_MANAGED_WEBHOOK_SINK",
  "SENA_SELF_MANAGED_APP_URL",
  "SENA_SELF_MANAGED_ENTERPRISE",
  "SENA_ENTERPRISE_DEPLOYMENT_MODE",
  "SENA_ENTERPRISE_MODE",
  "SENA_OBJECT_STORAGE_ADAPTER",
  "SENA_OBJECT_STORAGE_ENDPOINT",
  "SENA_OBJECT_STORAGE_BUCKET",
  "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
  "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "SENA_OBJECT_STORAGE_R2_ACCOUNT_ID",
  "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
  "SENA_OBJECT_STORAGE_BLOB_STORE_ID",
  "SENA_OBJECT_STORAGE_BLOB_OIDC_TOKEN",
  "R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "R2_ENDPOINT",
  "CLOUDFLARE_R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_BUCKET",
  "CLOUDFLARE_R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "SENA_SSO_INSTITUTION_CLIENT_ID",
  "SENA_SSO_INSTITUTION_CLIENT_SECRET",
  "SENA_SSO_GOOGLE_CLIENT_ID",
  "SENA_SSO_GOOGLE_CLIENT_SECRET",
  "SENA_SSO_ORCID_CLIENT_ID",
  "SENA_SSO_ORCID_CLIENT_SECRET",
  "SENA_OBSERVABILITY_PROVIDER",
  "SENA_OBSERVABILITY_EXPORTER_URL",
  "SENA_OBSERVABILITY_WEBHOOK_URL",
  "SENA_OBSERVABILITY_EXPORTER_SECRET",
  "SENA_OBSERVABILITY_WEBHOOK_SECRET",
  "SENA_OBSERVABILITY_EXPORTER_TOKEN",
  "OBSERVABILITY_WEBHOOK_URL",
  "OBSERVABILITY_EXPORTER_URL",
  "OBSERVABILITY_WEBHOOK_SECRET",
  "OBSERVABILITY_EXPORTER_SECRET",
  "OBSERVABILITY_EXPORTER_TOKEN"
]);

const allowedLocalSenaKeys = new Set([
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_ENTERPRISE_STATE_STORE",
  "SENA_ALLOW_LOCAL_SSO_FALLBACK",
  "SENA_PROVISIONING_TOKEN",
  "SENA_EXPERT_REVIEW_SIGNING_SECRET",
  "SENA_EXPERT_REVIEW_SIGNING_KEY_ID",
  "SENA_APP_URL",
  "NEXT_PUBLIC_SENA_APP_URL"
]);

function copyInheritedVerifierEnvironment(baseEnvironment) {
  const inherited = {};
  for (const key of inheritedVerifierEnvironmentKeys) {
    const value = baseEnvironment?.[key];
    if (typeof value === "string") inherited[key] = value;
  }
  return inherited;
}

function nextEnvironmentFileKeys(projectDirectory) {
  const root = resolve(projectDirectory);
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => /^\.env(?:\.(?:local|development(?:\.local)?|test(?:\.local)?|production(?:\.local)?))?$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const keys = new Set();
  for (const name of names) {
    const path = join(root, name);
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024 * 1024) {
      throw new Error(`SENA verifier refused unsafe Next environment file metadata for ${name}.`);
    }
    const contents = readFileSync(path, "utf8");
    for (const match of contents.matchAll(/^[\t ]*(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=/gm)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

export function buildSenaVerifierEnvironment(
  baseEnvironment = process.env,
  overrides = {},
  projectDirectory = process.cwd()
) {
  const environment = {
    ...copyInheritedVerifierEnvironment(baseEnvironment),
    SENA_ENTERPRISE_STATE_STORE: "file"
  };
  // Next loads .env* after the verifier spawns it. Shadow every declared key
  // without retaining or logging its value, then apply only verifier-owned
  // overrides. This closes the ignored/untracked .env.local escape hatch.
  for (const key of nextEnvironmentFileKeys(projectDirectory)) {
    if (!(key in environment)) environment[key] = "";
  }
  for (const key of SENA_VERIFIER_EXTERNAL_ENV_KEYS) environment[key] = "";
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string") environment[key] = value;
  }
  environment.SENA_ENTERPRISE_STATE_STORE = "file";
  for (const key of SENA_VERIFIER_EXTERNAL_ENV_KEYS) environment[key] = "";
  return Object.freeze(environment);
}

export function assertSenaVerifierEnvironmentIsLocal(environment, expectedEnterpriseDbDir) {
  const errors = [];
  if (!environment || typeof environment !== "object") {
    errors.push("environment is missing");
  } else {
    if (environment.SENA_ENTERPRISE_STATE_STORE !== "file") {
      errors.push("SENA_ENTERPRISE_STATE_STORE is not file");
    }
    if (
      typeof expectedEnterpriseDbDir !== "string" ||
      expectedEnterpriseDbDir.length === 0 ||
      environment.SENA_ENTERPRISE_DB_DIR !== expectedEnterpriseDbDir
    ) {
      errors.push("SENA_ENTERPRISE_DB_DIR is not the verifier-owned directory");
    }
    for (const key of SENA_VERIFIER_EXTERNAL_ENV_KEYS) {
      if (typeof environment[key] === "string" && environment[key].trim().length > 0) {
        errors.push(`${key} is externally configured`);
      }
    }
    for (const [key, value] of Object.entries(environment)) {
      if (
        key.startsWith("SENA_") &&
        typeof value === "string" &&
        value.trim().length > 0 &&
        !allowedLocalSenaKeys.has(key)
      ) {
        errors.push(`${key} is not verifier-local`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`SENA verifier-local environment custody failed: ${errors.join(", ")}.`);
  }
  return environment;
}
