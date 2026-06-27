import { createHmac } from "node:crypto";
import {
  createEnterprisePostgresDatabaseSyncAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import { appendAudit } from "./ops-audit";
import {
  backupCoreChecksPass,
  createEnterpriseBackup,
  ensureBackupDeliveryPermission,
  type SenaEnterpriseBackupArtifact,
  type SenaEnterpriseBackupRecordCounts,
  type SenaEnterpriseBackupVerification,
  verifyEnterpriseBackup
} from "./ops-backup";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import {
  enterpriseDbPath,
  now
} from "./ops-runtime";
import {
  readEnterpriseDb,
  saveDb
} from "./state";
import {
  databaseSyncWebhookEndpointHash,
  databaseSyncWebhookProvider,
  databaseSyncWebhookSecret,
  databaseSyncWebhookTimeoutMs,
  databaseSyncWebhookUrl,
  localWebhookSinkAttempt,
  webhookErrorHash
} from "./webhook-delivery";

export type SenaEnterpriseDatabaseSyncResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseDatabaseSync;
  status: "not-configured" | "delivered" | "failed";
  generatedAt: string;
  provider: {
    mode: "webhook" | "local-sink" | "postgres-native" | "not-configured";
    configured: boolean;
    endpointHash?: string;
    urlEnvName?: string;
    connectionHash?: string;
    adapter?: "postgres" | "neon";
    secretConfigured: boolean;
    timeoutMs: number;
  };
  backup: {
    backupId: string;
    generatedAt: string;
    payloadSha256: string;
    recordCounts: SenaEnterpriseBackupRecordCounts;
    scope: SenaEnterpriseBackupArtifact["scope"];
  };
  verification: SenaEnterpriseBackupVerification;
  sync: {
    attempted: boolean;
    webhookStatus?: "delivered" | "failed";
    nativeStatus?: "delivered" | "failed";
    attemptedAt?: string;
    endpointHash?: string;
    httpStatus?: number;
    revision?: number;
    adapter?: "postgres" | "neon";
    errorCode?: string;
    errorHash?: string;
  };
};

function databaseSyncWebhookPayload(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification,
  endpointHash: string,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDatabaseSyncWebhook,
    generatedAt,
    sync: {
      kind: "sanitized-enterprise-state",
      sourceStorageEngine: "file-backed-json",
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      recordCounts: verification.recordCounts,
      scope: backup.scope
    },
    backup,
    verification,
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(databaseSyncWebhookSecret())
    }
  };
}

async function postDatabaseSyncWebhook(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification
) {
  const webhookUrl = databaseSyncWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Database sync webhook delivery is not configured.", 503, "database_sync_webhook_not_configured");
  }
  const endpointHash = databaseSyncWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(databaseSyncWebhookPayload(backup, verification, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "database.sync",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-database-sync-backup-id": backup.backupId,
    "x-sena-database-sync-payload-sha256": verification.payloadSha256
  };
  const secret = databaseSyncWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), databaseSyncWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeDatabaseSyncPostgres(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification
) {
  const { adapter, pool } = createEnterprisePostgresDatabaseSyncAdapterFromEnv({});
  try {
    const write = await adapter.writeSync(backup, verification);
    return {
      ok: true,
      revision: write.revision,
      errorCode: undefined,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      revision: undefined,
      errorCode: error instanceof Error && "code" in error ? String(error.code) : "postgres_sync_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    await pool.end?.();
  }
}

export async function deliverEnterpriseDatabaseSync(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; backup?: SenaEnterpriseBackupArtifact } = {}
): Promise<SenaEnterpriseDatabaseSyncResult> {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const webhookProvider = databaseSyncWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const provider: SenaEnterpriseDatabaseSyncResult["provider"] = postgresConfig.configured
    ? {
      mode: "postgres-native",
      configured: true,
      urlEnvName: postgresConfig.urlEnvName,
      connectionHash: postgresConfig.connectionHash,
      adapter: postgresConfig.adapter,
      secretConfigured: Boolean(postgresConfig.connectionHash),
      timeoutMs: 0
    }
    : webhookProvider;
  const backup = input.backup ?? createEnterpriseBackup(context, { teamId: input.teamId });
  if (input.backup) {
    ensureBackupDeliveryPermission(context, backup);
  }
  const verification = verifyEnterpriseBackup(context, backup);
  if (!backupCoreChecksPass(verification)) {
    throw new SenaEnterpriseError("Database sync requires checksum, record counts, and secret exclusions to pass.", 400, "database_sync_preflight_failed");
  }

  const result: SenaEnterpriseDatabaseSyncResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDatabaseSync,
    status: provider.configured ? "failed" : "not-configured",
    generatedAt: now(),
    provider,
    backup: {
      backupId: backup.backupId,
      generatedAt: backup.generatedAt,
      payloadSha256: verification.payloadSha256,
      recordCounts: verification.recordCounts,
      scope: backup.scope
    },
    verification,
    sync: {
      attempted: false
    }
  };

  if (postgresConfig.configured) {
    const attemptResult = await writeDatabaseSyncPostgres(backup, verification);
    const attemptedAt = now();
    result.status = attemptResult.ok ? "delivered" : "failed";
    result.sync = {
      attempted: true,
      nativeStatus: attemptResult.ok ? "delivered" : "failed",
      attemptedAt,
      revision: attemptResult.revision,
      adapter: postgresConfig.adapter,
      errorCode: attemptResult.errorCode,
      errorHash: attemptResult.errorHash
    };

    const db = readEnterpriseDb();
    appendAudit(db, {
      event: attemptResult.ok ? "governance.database_sync.deliver" : "governance.database_sync.fail",
      userId: context.user.id,
      teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
      detail: {
        backupId: backup.backupId,
        payloadSha256: verification.payloadSha256,
        provider: "postgres-native",
        adapter: postgresConfig.adapter ?? null,
        urlEnvName: postgresConfig.urlEnvName ?? null,
        connectionHash: postgresConfig.connectionHash ?? null,
        revision: attemptResult.revision ?? null,
        errorCode: attemptResult.errorCode ?? null,
        errorHash: attemptResult.errorHash ?? null,
        teams: verification.recordCounts.teams,
        projects: verification.recordCounts.projects,
        uploads: verification.recordCounts.uploads,
        auditEvents: verification.recordCounts.auditEvents
      }
    });
    saveDb(db);
    return result;
  }

  if (!provider.configured) {
    return result;
  }

  const attemptResult = provider.mode === "local-sink"
    ? localWebhookSinkAttempt(provider.endpointHash!)
    : await postDatabaseSyncWebhook(backup, verification);
  const attemptedAt = now();
  result.status = attemptResult.ok ? "delivered" : "failed";
  result.sync = {
    attempted: true,
    webhookStatus: attemptResult.ok ? "delivered" : "failed",
    attemptedAt,
    endpointHash: attemptResult.endpointHash,
    httpStatus: attemptResult.httpStatus,
    errorCode: attemptResult.errorCode,
    errorHash: attemptResult.errorHash
  };

  const db = readEnterpriseDb();
  appendAudit(db, {
    event: attemptResult.ok ? "governance.database_sync.deliver" : "governance.database_sync.fail",
    userId: context.user.id,
    teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
    detail: {
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      endpointHash: attemptResult.endpointHash ?? "none",
      httpStatus: attemptResult.httpStatus ?? null,
      errorCode: attemptResult.errorCode ?? null,
      errorHash: attemptResult.errorHash ?? null,
      teams: verification.recordCounts.teams,
      projects: verification.recordCounts.projects,
      uploads: verification.recordCounts.uploads,
      auditEvents: verification.recordCounts.auditEvents
    }
  });
  saveDb(db);
  return result;
}
