import { createHash } from "node:crypto";
import { SenaEnterpriseError } from "./errors";

export type SenaEnterpriseWebhookProviderMode = "webhook" | "local-sink" | "not-configured";
export type SenaEnterpriseWebhookQueueProvider = "webhook" | "local-sink";
export type SenaEnterpriseWebhookProvider = {
  mode: SenaEnterpriseWebhookProviderMode;
  configured: boolean;
  endpointHash?: string;
  secretConfigured: boolean;
  timeoutMs: number;
  maxAttempts: number;
};

type SenaEnterpriseWebhookProviderConfig = {
  channel: string;
  dbPath: string;
  selfManagedEnterpriseMode: boolean;
  urlEnvName: string;
  secretEnvName: string;
  timeoutEnvName: string;
  maxAttemptsEnvName: string;
  timeoutFallbackMs: number;
  timeoutCeilingMs: number;
  maxAttemptsFallback: number;
  maxAttemptsCeiling: number;
  invalidUrlErrorCode: string;
};

export function webhookQueueProvider(provider: { mode: SenaEnterpriseWebhookProviderMode }): SenaEnterpriseWebhookQueueProvider {
  return provider.mode === "local-sink" ? "local-sink" : "webhook";
}

export function webhookEnvValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

export function webhookPositiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function webhookUrlFromEnv(key: string, invalidUrlErrorCode: string) {
  const url = webhookEnvValue(key);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new SenaEnterpriseError(`${key} must be an HTTP(S) URL.`, 500, invalidUrlErrorCode);
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof SenaEnterpriseError) throw error;
    throw new SenaEnterpriseError(`${key} must be an HTTP(S) URL.`, 500, invalidUrlErrorCode);
  }
}

export function webhookTimeoutMs(key: string, fallback: number, ceiling: number) {
  return Math.min(ceiling, webhookPositiveIntegerEnv(key, fallback));
}

export function webhookMaxAttempts(key: string, fallback: number, ceiling: number) {
  return Math.min(ceiling, webhookPositiveIntegerEnv(key, fallback));
}

export function webhookEndpointHash(url?: string) {
  return url ? createHash("sha256").update(url).digest("hex") : undefined;
}

export function selfManagedLocalWebhookSinkEnabled(selfManagedEnterpriseMode: boolean) {
  const sink = (webhookEnvValue("SENA_SELF_MANAGED_WEBHOOK_SINK") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  return selfManagedEnterpriseMode && (sink === "local" || sink === "local-sink");
}

export function localWebhookSinkAttempt(endpointHash: string | undefined) {
  return {
    ok: true,
    endpointHash,
    httpStatus: undefined as number | undefined,
    errorCode: undefined as string | undefined,
    errorHash: undefined as string | undefined
  };
}

export function localWebhookSinkEndpointHash(channel: string, dbPath: string) {
  return createHash("sha256").update(`sena-local-webhook-sink:${channel}:${dbPath}`).digest("hex");
}

export function localWebhookSinkProvider(channel: string, timeoutMs: number, dbPath: string, maxAttempts = 1) {
  return {
    mode: "local-sink" as const,
    configured: true,
    endpointHash: localWebhookSinkEndpointHash(channel, dbPath),
    secretConfigured: true,
    timeoutMs,
    maxAttempts
  };
}

export function webhookProviderFromEnv(config: SenaEnterpriseWebhookProviderConfig): SenaEnterpriseWebhookProvider {
  const timeoutMs = webhookTimeoutMs(config.timeoutEnvName, config.timeoutFallbackMs, config.timeoutCeilingMs);
  const maxAttempts = webhookMaxAttempts(config.maxAttemptsEnvName, config.maxAttemptsFallback, config.maxAttemptsCeiling);
  if (selfManagedLocalWebhookSinkEnabled(config.selfManagedEnterpriseMode)) {
    return localWebhookSinkProvider(config.channel, timeoutMs, config.dbPath, maxAttempts);
  }
  const url = webhookUrlFromEnv(config.urlEnvName, config.invalidUrlErrorCode);
  const endpointHash = webhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" : "not-configured",
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(webhookEnvValue(config.secretEnvName)),
    timeoutMs,
    maxAttempts
  };
}

export function notificationWebhookUrl() {
  return webhookUrlFromEnv("SENA_NOTIFICATION_WEBHOOK_URL", "invalid_notification_webhook_url");
}

export function notificationWebhookSecret() {
  return webhookEnvValue("SENA_NOTIFICATION_WEBHOOK_SECRET");
}

export function notificationWebhookTimeoutMs() {
  return webhookTimeoutMs("SENA_NOTIFICATION_WEBHOOK_TIMEOUT_MS", 5000, 30_000);
}

export function notificationWebhookMaxAttempts() {
  return webhookMaxAttempts("SENA_NOTIFICATION_WEBHOOK_MAX_ATTEMPTS", 3, 10);
}

export function notificationWebhookProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderFromEnv({
    channel: "notification",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_NOTIFICATION_WEBHOOK_URL",
    secretEnvName: "SENA_NOTIFICATION_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_NOTIFICATION_WEBHOOK_TIMEOUT_MS",
    maxAttemptsEnvName: "SENA_NOTIFICATION_WEBHOOK_MAX_ATTEMPTS",
    timeoutFallbackMs: 5000,
    timeoutCeilingMs: 30_000,
    maxAttemptsFallback: 3,
    maxAttemptsCeiling: 10,
    invalidUrlErrorCode: "invalid_notification_webhook_url"
  });
}

export function emailWebhookUrl() {
  return webhookUrlFromEnv("SENA_EMAIL_WEBHOOK_URL", "invalid_email_webhook_url");
}

export function emailWebhookSecret() {
  return webhookEnvValue("SENA_EMAIL_WEBHOOK_SECRET");
}

export function emailWebhookTimeoutMs() {
  return webhookTimeoutMs("SENA_EMAIL_WEBHOOK_TIMEOUT_MS", 5000, 30_000);
}

export function emailWebhookMaxAttempts() {
  return webhookMaxAttempts("SENA_EMAIL_WEBHOOK_MAX_ATTEMPTS", 3, 10);
}

export function emailWebhookProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderFromEnv({
    channel: "email",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_EMAIL_WEBHOOK_URL",
    secretEnvName: "SENA_EMAIL_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_EMAIL_WEBHOOK_TIMEOUT_MS",
    maxAttemptsEnvName: "SENA_EMAIL_WEBHOOK_MAX_ATTEMPTS",
    timeoutFallbackMs: 5000,
    timeoutCeilingMs: 30_000,
    maxAttemptsFallback: 3,
    maxAttemptsCeiling: 10,
    invalidUrlErrorCode: "invalid_email_webhook_url"
  });
}

function webhookProviderWithoutRetriesFromEnv(config: Omit<
  SenaEnterpriseWebhookProviderConfig,
  "maxAttemptsEnvName" | "maxAttemptsFallback" | "maxAttemptsCeiling"
>) {
  const timeoutMs = webhookTimeoutMs(config.timeoutEnvName, config.timeoutFallbackMs, config.timeoutCeilingMs);
  if (selfManagedLocalWebhookSinkEnabled(config.selfManagedEnterpriseMode)) {
    return localWebhookSinkProvider(config.channel, timeoutMs, config.dbPath);
  }
  const url = webhookUrlFromEnv(config.urlEnvName, config.invalidUrlErrorCode);
  const endpointHash = webhookEndpointHash(url);
  return {
    mode: endpointHash ? "webhook" as const : "not-configured" as const,
    configured: Boolean(endpointHash),
    endpointHash,
    secretConfigured: Boolean(webhookEnvValue(config.secretEnvName)),
    timeoutMs
  };
}

export function auditWebhookUrl() {
  return webhookUrlFromEnv("SENA_AUDIT_WEBHOOK_URL", "invalid_audit_webhook_url");
}

export function auditWebhookSecret() {
  return webhookEnvValue("SENA_AUDIT_WEBHOOK_SECRET");
}

export function auditWebhookTimeoutMs() {
  return webhookTimeoutMs("SENA_AUDIT_WEBHOOK_TIMEOUT_MS", 5000, 30_000);
}

export function auditWebhookMaxAttempts() {
  return webhookMaxAttempts("SENA_AUDIT_WEBHOOK_MAX_ATTEMPTS", 3, 10);
}

export function auditWebhookProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderFromEnv({
    channel: "audit",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_AUDIT_WEBHOOK_URL",
    secretEnvName: "SENA_AUDIT_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_AUDIT_WEBHOOK_TIMEOUT_MS",
    maxAttemptsEnvName: "SENA_AUDIT_WEBHOOK_MAX_ATTEMPTS",
    timeoutFallbackMs: 5000,
    timeoutCeilingMs: 30_000,
    maxAttemptsFallback: 3,
    maxAttemptsCeiling: 10,
    invalidUrlErrorCode: "invalid_audit_webhook_url"
  });
}

export function backupWebhookUrl() {
  return webhookUrlFromEnv("SENA_BACKUP_WEBHOOK_URL", "invalid_backup_webhook_url");
}

export function backupWebhookSecret() {
  return webhookEnvValue("SENA_BACKUP_WEBHOOK_SECRET");
}

export function backupWebhookTimeoutMs() {
  return webhookTimeoutMs("SENA_BACKUP_WEBHOOK_TIMEOUT_MS", 30_000, 120_000);
}

export function backupWebhookEndpointHash(url = backupWebhookUrl()) {
  return webhookEndpointHash(url);
}

export function backupWebhookProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderWithoutRetriesFromEnv({
    channel: "backup",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_BACKUP_WEBHOOK_URL",
    secretEnvName: "SENA_BACKUP_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_BACKUP_WEBHOOK_TIMEOUT_MS",
    timeoutFallbackMs: 30_000,
    timeoutCeilingMs: 120_000,
    invalidUrlErrorCode: "invalid_backup_webhook_url"
  });
}

export function alertWebhookUrl() {
  return webhookUrlFromEnv("SENA_ALERT_WEBHOOK_URL", "invalid_alert_webhook_url");
}

export function alertWebhookSecret() {
  return webhookEnvValue("SENA_ALERT_WEBHOOK_SECRET");
}

export function alertWebhookTimeoutMs() {
  return webhookTimeoutMs("SENA_ALERT_WEBHOOK_TIMEOUT_MS", 30_000, 120_000);
}

export function alertWebhookEndpointHash(url = alertWebhookUrl()) {
  return webhookEndpointHash(url);
}

export function alertWebhookProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderWithoutRetriesFromEnv({
    channel: "alert",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_ALERT_WEBHOOK_URL",
    secretEnvName: "SENA_ALERT_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_ALERT_WEBHOOK_TIMEOUT_MS",
    timeoutFallbackMs: 30_000,
    timeoutCeilingMs: 120_000,
    invalidUrlErrorCode: "invalid_alert_webhook_url"
  });
}

export function databaseSyncWebhookUrl() {
  return webhookUrlFromEnv("SENA_DATABASE_SYNC_WEBHOOK_URL", "invalid_database_sync_webhook_url");
}

export function databaseSyncWebhookSecret() {
  return webhookEnvValue("SENA_DATABASE_SYNC_WEBHOOK_SECRET");
}

export function databaseSyncWebhookTimeoutMs() {
  return webhookTimeoutMs("SENA_DATABASE_SYNC_WEBHOOK_TIMEOUT_MS", 30_000, 120_000);
}

export function databaseSyncWebhookEndpointHash(url = databaseSyncWebhookUrl()) {
  return webhookEndpointHash(url);
}

export function databaseSyncWebhookProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderWithoutRetriesFromEnv({
    channel: "database-sync",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_DATABASE_SYNC_WEBHOOK_URL",
    secretEnvName: "SENA_DATABASE_SYNC_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_DATABASE_SYNC_WEBHOOK_TIMEOUT_MS",
    timeoutFallbackMs: 30_000,
    timeoutCeilingMs: 120_000,
    invalidUrlErrorCode: "invalid_database_sync_webhook_url"
  });
}

export function objectStorageWebhookUrl() {
  return webhookUrlFromEnv("SENA_OBJECT_STORAGE_WEBHOOK_URL", "invalid_object_storage_webhook_url");
}

export function objectStorageWebhookSecret() {
  return webhookEnvValue("SENA_OBJECT_STORAGE_WEBHOOK_SECRET");
}

export function objectStorageWebhookTimeoutMs() {
  return webhookTimeoutMs("SENA_OBJECT_STORAGE_WEBHOOK_TIMEOUT_MS", 30_000, 120_000);
}

export function objectStorageWebhookEndpointHash(url = objectStorageWebhookUrl()) {
  return webhookEndpointHash(url);
}

export function objectStorageWebhookProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderWithoutRetriesFromEnv({
    channel: "object-storage",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_OBJECT_STORAGE_WEBHOOK_URL",
    secretEnvName: "SENA_OBJECT_STORAGE_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_OBJECT_STORAGE_WEBHOOK_TIMEOUT_MS",
    timeoutFallbackMs: 30_000,
    timeoutCeilingMs: 120_000,
    invalidUrlErrorCode: "invalid_object_storage_webhook_url"
  });
}

export function collaborationPubSubWebhookUrl() {
  return webhookUrlFromEnv("SENA_COLLABORATION_PUBSUB_WEBHOOK_URL", "invalid_collaboration_pubsub_webhook_url");
}

export function collaborationPubSubWebhookSecret() {
  return webhookEnvValue("SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET");
}

export function collaborationPubSubTimeoutMs() {
  return webhookTimeoutMs("SENA_COLLABORATION_PUBSUB_WEBHOOK_TIMEOUT_MS", 5000, 60_000);
}

export function collaborationPubSubMaxAttempts() {
  return webhookMaxAttempts("SENA_COLLABORATION_PUBSUB_WEBHOOK_MAX_ATTEMPTS", 3, 10);
}

export function collaborationPubSubEndpointHash(url = collaborationPubSubWebhookUrl()) {
  return webhookEndpointHash(url);
}

export function collaborationPubSubProvider(dbPath: string, selfManagedEnterpriseMode: boolean) {
  return webhookProviderFromEnv({
    channel: "collaboration-pubsub",
    dbPath,
    selfManagedEnterpriseMode,
    urlEnvName: "SENA_COLLABORATION_PUBSUB_WEBHOOK_URL",
    secretEnvName: "SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET",
    timeoutEnvName: "SENA_COLLABORATION_PUBSUB_WEBHOOK_TIMEOUT_MS",
    maxAttemptsEnvName: "SENA_COLLABORATION_PUBSUB_WEBHOOK_MAX_ATTEMPTS",
    timeoutFallbackMs: 5000,
    timeoutCeilingMs: 60_000,
    maxAttemptsFallback: 3,
    maxAttemptsCeiling: 10,
    invalidUrlErrorCode: "invalid_collaboration_pubsub_webhook_url"
  });
}

export function webhookRetryAt(attempts: number) {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

export function webhookErrorHash(error: unknown) {
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return createHash("sha256").update(message).digest("hex");
}
