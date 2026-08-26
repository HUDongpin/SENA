import { enterprisePostgresProbeReadiness, resolveEnterprisePostgresConfig, type SenaEnterprisePostgresConfig } from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { isAuthLockoutActive, pruneApiRateLimits } from "./auth-security";
import {
  enterpriseAnalysisRunRegistryRuntime,
  enterpriseImportRunRegistryRuntime,
  enterpriseUploadRegistryRuntime,
  summarizeEnterpriseUploadObjectStorageCustody,
  summarizeEnterpriseUploadObjectStorageCustodyFromDb,
  summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence,
  verifyEnterpriseUploadStorage,
  verifyEnterpriseUploadStorageFromDb,
  verifyEnterpriseUploadStorageAsync,
  type SenaEnterpriseUploadObjectStorageCustodySummary,
  type SenaEnterpriseUploadStorageVerification
} from "./import-analysis";
import { enterpriseReliabilityRunRegistryRuntime } from "./reliability-runs";
import { enterpriseValidationRunRegistryRuntime } from "./validation-runs";
import { enterpriseExpertReviewRegistryRuntime } from "./expert-review";
import { latestAuditAt } from "./ops-audit";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import type { SenaEnterpriseGovernanceCheck, SenaEnterpriseGovernanceStatus } from "./ops-governance";
import {
  createConfiguredFileEnterpriseStateStore,
  getEnterprisePrimaryStateRuntime,
  readEnterpriseState,
  readEnterpriseDb,
  type SenaEnterpriseDb,
  type SenaEnterprisePrimaryStateRuntime,
  type SenaFileEnterpriseStateStore
} from "./state";
import {
  alertWebhookProvider,
  auditWebhookProvider,
  backupWebhookProvider,
  collaborationPubSubProvider,
  databaseSyncWebhookProvider,
  emailWebhookProvider,
  notificationWebhookProvider,
  objectStorageWebhookProvider
} from "./webhook-delivery";
import {
  enterpriseObjectStorageNativeProvider
} from "./object-storage-adapter";
import {
  listEnterpriseServerJobs,
  serverJobStoreRuntime
} from "./server-job-queue";
import {
  enterpriseDbPath,
  enterpriseDbPathHint,
  envValue,
  now,
  positiveIntegerEnv,
  sha256Text
} from "./ops-runtime";

export type SenaEnterpriseStorageEngine = "file-backed-json" | "postgres" | "neon-postgres";

export type SenaEnterprisePostgresStorageEvidence = {
  configured: boolean;
  adapter: "postgres" | "neon";
  urlEnvName?: string;
  connectionHash?: string;
  missingEnv: string[];
  liveProbe: "confirmed" | "required-missing" | "optional";
};

export type SenaEnterpriseOpsStatus = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOpsStatus;
  status: "ready" | "review" | "degraded";
  generatedAt: string;
  deployment: {
    nodeVersion: string;
    runtime: "nodejs";
    nodeEnv: string;
    uptimeSeconds: number;
    opsTokenConfigured: boolean;
    opsSessionOperatorsConfigured: boolean;
    provisioningTokenConfigured: boolean;
    notificationWebhookConfigured: boolean;
    emailWebhookConfigured: boolean;
    collaborationPubSubWebhookConfigured: boolean;
    databaseSyncWebhookConfigured: boolean;
    objectStorageWebhookConfigured: boolean;
    objectStorageNativeConfigured: boolean;
    backupWebhookConfigured: boolean;
    alertWebhookConfigured: boolean;
    auditWebhookConfigured: boolean;
  };
  storage: {
    engine: SenaEnterpriseStorageEngine;
    primaryStateRuntime: SenaEnterprisePrimaryStateRuntime;
    configuredDirectory: "default-local" | "env-configured";
    pathHint: string;
    postgres?: SenaEnterprisePostgresStorageEvidence;
    dbFileExists: boolean;
    dbBytes: number;
    dbUpdatedAt?: string;
    dbBackupExists: boolean;
    dbBackupBytes: number;
    dbBackupUpdatedAt?: string;
    writable: boolean;
    writeProbe: "pass" | "fail";
    writePolicy: "research-pilot" | "blocked";
    writeBlockedReason?: string;
    lockProbe: "pass" | "fail";
    lockTimeoutMs: number;
    writeErrorHash?: string;
    lockErrorHash?: string;
  };
  backup: {
    status: "fresh" | "stale" | "missing";
    lastBackupAt?: string;
    lastVerifiedAt?: string;
    backupAgeSeconds: number | null;
    warningAfterHours: number;
  };
  queues: {
    notificationsPendingWebhook: number;
    notificationsFailedWebhook: number;
    emailPendingWebhook: number;
    emailFailedWebhook: number;
    auditPendingWebhook: number;
    auditFailedWebhook: number;
    collaborationPubSubPending: number;
    collaborationPubSubFailed: number;
    serverJobsQueued: number;
    serverJobsRunning: number;
    serverJobsFailed: number;
    serverJobsDeadLettered: number;
    serverJobsRetryable: number;
    activePasswordResetRequests: number;
    activeAuthLockouts: number;
    activeApiRateLimitBuckets: number;
  };
  counts: SenaEnterpriseGovernanceStatus["counts"] & {
    sessions: number;
    serverJobs: number;
    provisionedUsers: number;
    provisionedTeams: number;
    provisionedMemberships: number;
  };
  checks: SenaEnterpriseGovernanceCheck[];
};

export function enterprisePostgresStorageEngine(config = resolveEnterprisePostgresConfig()): SenaEnterpriseStorageEngine {
  if (!config.configured) return "file-backed-json";
  return config.adapter === "neon" ? "neon-postgres" : "postgres";
}

export function enterprisePostgresStorageEvidence(
  config: SenaEnterprisePostgresConfig
): SenaEnterprisePostgresStorageEvidence | undefined {
  if (!config.adapterRequested || !config.adapter) return undefined;
  const probe = enterprisePostgresProbeReadiness();
  return {
    configured: config.configured,
    adapter: config.adapter,
    urlEnvName: config.urlEnvName,
    connectionHash: config.connectionHash,
    missingEnv: config.missingEnv,
    liveProbe: probe.confirmed ? "confirmed" : probe.required ? "required-missing" : "optional"
  };
}

export function enterprisePostgresPublicEvidence(config: SenaEnterprisePostgresConfig) {
  const probe = enterprisePostgresProbeReadiness();
  return [
    ...config.evidence,
    ...probe.evidence,
    `missing=${config.missingEnv.join("|") || "none"}`,
    "nativeSchema=sena-enterprise-postgres-adapter/v1",
    `liveProbe=${probe.confirmed ? "confirmed" : probe.required ? "required-missing" : "optional"}`
  ];
}

export function opsTokenConfigured() {
  return Boolean(envValue("SENA_OPS_TOKEN"));
}

/**
 * The allowlist that lets a signed-in operator reach the deployment-wide ops
 * panels while an ops token is configured. Without it the session path fails
 * closed and those panels are bearer-only, so a production deployment that sets
 * SENA_OPS_TOKEN and nothing else has working ops routes and no way for an admin
 * to use them from the workspace.
 *
 * The name is repeated from ops-api rather than imported: ops-api pulls in
 * api-helpers and with it the Next request runtime, which this module is read
 * from scripts without.
 */
export function opsSessionOperatorsConfigured() {
  return Boolean(envValue("SENA_OPS_SESSION_OPERATOR_EMAILS"));
}

export function backupAgeSeconds(lastBackupAt?: string) {
  if (!lastBackupAt) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(lastBackupAt)) / 1000));
}

export type SenaEnterpriseOpsStatusSnapshotSource =
  | "file-json"
  | "file-primary-state"
  | "postgres-primary-state";

type SenaEnterpriseOpsStorageWriteProbe = Pick<
  SenaEnterpriseOpsStatus["storage"],
  "writable" | "writeProbe" | "writePolicy" | "writeBlockedReason" | "writeErrorHash"
>;

type SenaEnterpriseOpsStorageLockProbe = Pick<
  SenaEnterpriseOpsStatus["storage"],
  "lockProbe" | "lockTimeoutMs" | "lockErrorHash"
>;

function primaryStateSnapshotIsPostgres(input: {
  primaryStateRuntime: SenaEnterprisePrimaryStateRuntime;
  snapshotSource: SenaEnterpriseOpsStatusSnapshotSource;
}) {
  return input.primaryStateRuntime.activePrimary === "postgres" &&
    input.snapshotSource === "postgres-primary-state";
}

function buildEnterpriseOpsStatus(
  db: SenaEnterpriseDb,
  snapshotSource: SenaEnterpriseOpsStatusSnapshotSource,
  input: {
    uploadStorageVerification?: SenaEnterpriseUploadStorageVerification;
    uploadObjectStorageCustody?: SenaEnterpriseUploadObjectStorageCustodySummary;
  } = {}
): SenaEnterpriseOpsStatus {
  const generatedAt = now();
  const configuredDirectory = process.env.SENA_ENTERPRISE_DB_DIR ? "env-configured" : "default-local";
  const postgresConfig = resolveEnterprisePostgresConfig();
  const primaryStateRuntime = getEnterprisePrimaryStateRuntime();
  const storageEngine = primaryStateRuntime.activePrimary === "postgres"
    ? enterprisePostgresStorageEngine(postgresConfig)
    : "file-backed-json";
  const postgresStorage = enterprisePostgresStorageEvidence(postgresConfig);
  const stateStore: SenaFileEnterpriseStateStore = createConfiguredFileEnterpriseStateStore();
  const fileStorageProbe = stateStore.probeWrite();
  const fileLockProbe = stateStore.probeLock();
  const fileStats = stateStore.fileStats();
  const postgresPrimarySnapshot = primaryStateSnapshotIsPostgres({
    primaryStateRuntime,
    snapshotSource
  });
  const storageProbe: SenaEnterpriseOpsStorageWriteProbe = postgresPrimarySnapshot
    ? {
      writable: true,
      writeProbe: "pass" as const,
      writePolicy: fileStorageProbe.writePolicy
    }
    : fileStorageProbe;
  const lockProbe: SenaEnterpriseOpsStorageLockProbe = postgresPrimarySnapshot
    ? {
      lockProbe: "pass" as const,
      lockTimeoutMs: fileLockProbe.lockTimeoutMs
    }
    : fileLockProbe;
  const primaryStorageReadable = postgresPrimarySnapshot || fileStats.dbFileExists;
  const primaryStorageWritable = storageProbe.writable;
  const primaryStorageLockHealthy = postgresPrimarySnapshot || lockProbe.lockProbe === "pass";
  const writeBeforeBackupReady = postgresPrimarySnapshot || fileStats.dbBackupExists;
  const uploadStorageVerification = input.uploadStorageVerification ?? verifyEnterpriseUploadStorage();
  const uploadObjectStorageCustody = input.uploadObjectStorageCustody ?? summarizeEnterpriseUploadObjectStorageCustody();
  const uploadRegistryRuntime = enterpriseUploadRegistryRuntime();
  const importRunRegistryRuntime = enterpriseImportRunRegistryRuntime();
  const analysisRunRegistryRuntime = enterpriseAnalysisRunRegistryRuntime();
  const reliabilityRunRegistryRuntime = enterpriseReliabilityRunRegistryRuntime();
  const validationRunRegistryRuntime = enterpriseValidationRunRegistryRuntime();
  const expertReviewRegistryRuntime = enterpriseExpertReviewRegistryRuntime();
  const lastBackupAt = latestAuditAt(db, "governance.backup");
  const lastVerifiedAt = latestAuditAt(db, "governance.backup.verify");
  const backupAge = backupAgeSeconds(lastBackupAt);
  const backupWarningHours = positiveIntegerEnv("SENA_OPS_BACKUP_WARNING_HOURS", 24);
  const backupStatus = backupAge === null
    ? "missing"
    : backupAge > backupWarningHours * 60 * 60 ? "stale" : "fresh";
  const activePasswordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => !request.usedAt && Date.parse(request.expiresAt) > Date.now()).length;
  const activeAuthLockouts = (db.authLockouts ?? []).filter((lockout) => isAuthLockoutActive(lockout)).length;
  const activeApiRateLimitBuckets = pruneApiRateLimits(db).length;
  const provisionedUsers = db.users.filter((user) => user.provisioning).length;
  const provisionedTeams = db.teams.filter((team) => team.provisioning).length;
  const provisionedMemberships = db.memberships.filter((membership) => membership.provisioning).length;
  const notificationWebhookConfigured = notificationWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode()).configured;
  const emailWebhookConfigured = emailWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode()).configured;
  const collaborationProvider = collaborationPubSubProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const collaborationPubSubWebhookConfigured = collaborationProvider.configured;
  const databaseSyncProvider = databaseSyncWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const databaseSyncWebhookConfigured = databaseSyncProvider.configured;
  const objectStorageProvider = objectStorageWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageWebhookConfigured = objectStorageProvider.configured;
  const objectStorageNativeProvider = enterpriseObjectStorageNativeProvider();
  const objectStorageNativeConfigured = objectStorageNativeProvider.configured;
  const serverJobRuntime = serverJobStoreRuntime();
  const backupProvider = backupWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const backupWebhookConfigured = backupProvider.configured;
  const alertProvider = alertWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const alertWebhookConfigured = alertProvider.configured;
  const auditWebhookConfigured = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode()).configured;
  const emailPendingWebhook = (db.emailDeliveries ?? []).filter((entry) => entry.status === "pending").length;
  const emailFailedWebhook = (db.emailDeliveries ?? []).filter((entry) => entry.status === "failed").length;
  const auditPendingWebhook = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "pending").length;
  const auditFailedWebhook = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "failed").length;
  const collaborationPubSubPending = (db.collaborationEvents ?? []).filter((entry) => entry.delivery.status === "pending").length;
  const collaborationPubSubFailed = (db.collaborationEvents ?? []).filter((entry) => entry.delivery.status === "failed").length;
  const serverJobs = db.serverJobs ?? [];
  const serverJobsQueued = serverJobs.filter((job) => job.status === "queued").length;
  const serverJobsRunning = serverJobs.filter((job) => job.status === "running").length;
  const serverJobsFailed = serverJobs.filter((job) => job.status === "failed").length;
  const serverJobsDeadLettered = serverJobs.filter((job) => job.status === "dead-lettered").length;
  const serverJobsRetryable = serverJobs.filter((job) => job.lifecycle.retryable).length;
  const primaryStateRuntimeReady = primaryStateRuntime.activePrimary === "postgres" || !postgresConfig.adapterRequested;
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "ops-storage-readable",
      label: "Enterprise storage readable",
      status: primaryStorageReadable ? "pass" : "review",
      evidence: [
        `storageEngine=${storageEngine}`,
        `activePrimary=${primaryStateRuntime.activePrimary}`,
        `opsStateSnapshotSource=${snapshotSource}`,
        `primaryStateReadable=${primaryStorageReadable}`,
        `dbFileExists=${fileStats.dbFileExists}`,
        `dbBytes=${fileStats.dbBytes}`,
        `dbUpdatedAt=${fileStats.dbUpdatedAt ?? "missing"}`
      ],
      nextAction: primaryStorageReadable
        ? primaryStateRuntime.activePrimary === "postgres"
          ? "Keep the Postgres primary state row readable through the deployment monitor."
          : "Keep the enterprise data file on managed storage."
        : "Initialize enterprise storage before production monitoring is marked ready."
    },
    {
      id: "ops-storage-writable",
      label: "Enterprise storage writable",
      status: primaryStorageWritable ? "pass" : "review",
      evidence: [
        `storageEngine=${storageEngine}`,
        `activePrimary=${primaryStateRuntime.activePrimary}`,
        `opsStateSnapshotSource=${snapshotSource}`,
        `primaryWriteProbe=${storageProbe.writeProbe}`,
        `writeProbe=${storageProbe.writeProbe}`,
        `writePolicy=${storageProbe.writePolicy}`,
        `fileBackendWriteProbe=${fileStorageProbe.writeProbe}`,
        `fileBackendWritePolicy=${fileStorageProbe.writePolicy}`,
        `fileBackendWriteBlocked=${primaryStateRuntime.fileBackendWriteBlocked}`,
        `writeBlockedReason=${storageProbe.writeBlockedReason ?? "none"}`,
        `writeErrorHash=${storageProbe.writeErrorHash ?? "none"}`,
        `fileBackendWriteBlockedReason=${fileStorageProbe.writeBlockedReason ?? "none"}`,
        `fileBackendWriteErrorHash=${fileStorageProbe.writeErrorHash ?? "none"}`
      ],
      nextAction: primaryStorageWritable
        ? primaryStateRuntime.activePrimary === "postgres"
          ? "Keep enterprise writes on the Postgres primary runtime and leave the file backend read-only under production gates."
          : "Continue monitoring write probes from the deployment platform."
        : storageProbe.writePolicy === "blocked"
          ? "Keep .sena-enterprise/enterprise-db.json read-only for production-claim gates and configure SENA_ENTERPRISE_STATE_STORE=postgres before accepting multi-user writes."
          : "Fix enterprise data directory write permissions."
    },
    {
      id: "ops-storage-lock",
      label: "Enterprise storage write lock",
      status: primaryStorageLockHealthy ? "pass" : "review",
      evidence: [
        `storageEngine=${storageEngine}`,
        `activePrimary=${primaryStateRuntime.activePrimary}`,
        `opsStateSnapshotSource=${snapshotSource}`,
        `primaryLockRequired=${postgresPrimarySnapshot ? "false" : "true"}`,
        `lockProbe=${lockProbe.lockProbe}`,
        `lockTimeoutMs=${lockProbe.lockTimeoutMs}`,
        `lockErrorHash=${lockProbe.lockErrorHash ?? "none"}`,
        `fileBackendLockProbe=${fileLockProbe.lockProbe}`,
        `fileBackendLockErrorHash=${fileLockProbe.lockErrorHash ?? "none"}`
      ],
      nextAction: primaryStorageLockHealthy
        ? primaryStateRuntime.activePrimary === "postgres"
          ? "Keep Postgres transaction isolation as the primary concurrency boundary."
          : "Keep the lock file path on shared durable storage for single-runtime deployments."
        : "Clear stale locks or move enterprise storage to a lock-capable managed adapter."
    },
    {
      id: "ops-write-before-backup",
      label: "Enterprise write-before backup",
      status: writeBeforeBackupReady ? "pass" : "review",
      evidence: [
        `activePrimary=${primaryStateRuntime.activePrimary}`,
        `localWriteBeforeBackupApplicable=${postgresPrimarySnapshot ? "false" : "true"}`,
        `backupExists=${fileStats.dbBackupExists}`,
        `backupBytes=${fileStats.dbBackupBytes}`,
        `backupUpdatedAt=${fileStats.dbBackupUpdatedAt ?? "missing"}`
      ],
      nextAction: writeBeforeBackupReady
        ? primaryStateRuntime.activePrimary === "postgres"
          ? "Keep managed Postgres backup evidence in the release gate instead of relying on local JSON write-before backup."
          : "Keep write-before backup plus scheduled team-scoped backup verification active."
        : "Perform at least one write after initialization so the local write-before backup exists."
    },
    {
      id: "ops-upload-storage-integrity",
      label: "Upload blob storage integrity",
      status: uploadStorageVerification.status,
      evidence: [
        `registered=${uploadStorageVerification.summary.registeredUploads}`,
        `verified=${uploadStorageVerification.summary.verifiedBlobs}`,
        `missing=${uploadStorageVerification.summary.missingBlobs}`,
        `corrupt=${uploadStorageVerification.summary.checksumMismatches}`,
        `orphan=${uploadStorageVerification.summary.orphanBlobs}`,
        `reviewed=${uploadStorageVerification.summary.reviewedUploads}`
      ],
      nextAction: uploadStorageVerification.status === "pass" ? "Keep upload blob verification in deployment monitoring." : "Repair missing/corrupt/orphan upload blobs before production handoff."
    },
    {
      id: "ops-database-sync-webhook",
      label: "Managed database sync webhook",
      status: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `databaseSyncWebhook=${databaseSyncProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `secret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${databaseSyncProvider.timeoutMs}`
      ],
      nextAction: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
        ? "Keep signed database sync delivery connected to the managed database adapter."
        : "Set SENA_DATABASE_SYNC_WEBHOOK_URL and SENA_DATABASE_SYNC_WEBHOOK_SECRET before relying on external managed database mirroring."
    },
    ...(postgresConfig.adapterRequested ? [{
      id: "ops-native-postgres-adapter",
      label: "Native Postgres managed database adapter",
      status: postgresConfig.configured ? "pass" : "review",
      evidence: enterprisePostgresPublicEvidence(postgresConfig),
      nextAction: postgresConfig.configured
        ? "Run the live Neon/Postgres adapter probe during release verification and keep the connection string in the deployment secret store."
        : "Set SENA_ENTERPRISE_DB_ADAPTER=neon and a Vercel/Neon Postgres URL before claiming native database readiness."
    } satisfies SenaEnterpriseGovernanceCheck] : []),
    {
      id: "ops-primary-state-runtime",
      label: "Primary enterprise state runtime",
      status: primaryStateRuntimeReady ? "pass" : "review",
      evidence: [
        `opsStateSnapshotSource=${snapshotSource}`,
        ...primaryStateRuntime.evidence,
        ...uploadRegistryRuntime.evidence,
        ...importRunRegistryRuntime.evidence,
        ...analysisRunRegistryRuntime.evidence,
        ...reliabilityRunRegistryRuntime.evidence,
        ...validationRunRegistryRuntime.evidence,
        ...expertReviewRegistryRuntime.evidence
      ],
      nextAction: primaryStateRuntime.activePrimary === "postgres"
        ? "Keep project CRUD and migrated enterprise state operations on the async Postgres primary runtime."
        : postgresConfig.adapterRequested
          ? "Set SENA_ENTERPRISE_STATE_STORE=postgres with the configured Postgres adapter before treating .sena-enterprise/enterprise-db.json as non-primary."
          : "Keep .sena-enterprise/enterprise-db.json scoped to the local research-pilot runtime; configure Postgres and SENA_ENTERPRISE_STATE_STORE=postgres before production multi-user traffic."
    },
    {
      id: "ops-object-storage-webhook",
      label: "Managed object storage delivery adapter",
      status: objectStorageNativeProvider.configured || (objectStorageProvider.configured && objectStorageProvider.secretConfigured) ? "pass" : "review",
      evidence: [
        ...objectStorageNativeProvider.evidence,
        `objectStorageWebhook=${objectStorageProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `secret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${objectStorageProvider.timeoutMs}`,
        `custodyDelivered=${uploadObjectStorageCustody.delivered}`,
        `custodyPending=${uploadObjectStorageCustody.pending}`,
        `custodyFailed=${uploadObjectStorageCustody.failed}`,
        `custodyPendingReview=${uploadObjectStorageCustody.pendingReview}`,
        ...uploadRegistryRuntime.evidence,
        "deliveryApi=POST:/api/sena/uploads action=deliver-object-storage"
      ],
      nextAction: objectStorageNativeProvider.configured
        ? "Keep native object-storage credentials, versioning, scan/retention policy, and delivery monitoring in the release gate."
        : objectStorageProvider.configured && objectStorageProvider.secretConfigured
          ? "Keep signed upload blob delivery connected to managed object storage, or replace the bridge with a native object-storage adapter before larger SaaS scale."
          : "Set SENA_OBJECT_STORAGE_ADAPTER with native object-storage credentials, or configure SENA_OBJECT_STORAGE_WEBHOOK_URL and SENA_OBJECT_STORAGE_WEBHOOK_SECRET before relying on external upload blob handoff."
    },
    {
      id: "ops-server-job-runtime",
      label: "Server job queue runtime status",
      status: serverJobsFailed === 0 && serverJobsDeadLettered === 0 ? "pass" : "review",
      evidence: [
        ...serverJobRuntime.evidence,
        `queued=${serverJobsQueued}`,
        `running=${serverJobsRunning}`,
        `failed=${serverJobsFailed}`,
        `deadLettered=${serverJobsDeadLettered}`,
        `retryable=${serverJobsRetryable}`,
        "statusApi=/api/sena/ops/jobs",
        "workerActions=mark-running|mark-succeeded|mark-failed|retry|dead-letter",
        "workerJobActions=run-import|run-analysis|run-publication-export|run-reliability|run-validation"
      ],
      nextAction: serverJobsFailed === 0 && serverJobsDeadLettered === 0
        ? serverJobRuntime.activeStore === "postgres-table"
          ? "Keep worker status callbacks wired to /api/sena/ops/jobs and monitor the indexed Postgres job table."
          : "Keep worker status callbacks wired to /api/sena/ops/jobs; move server job status to Postgres before production load."
        : "Inspect /api/sena/ops/jobs for failed or dead-lettered jobs, retry safe project-pointer jobs, or attach worker failure evidence."
    },
    {
      id: "ops-collaboration-pubsub",
      label: "Collaboration pub/sub webhook queue",
      status: collaborationProvider.configured && collaborationProvider.secretConfigured && collaborationPubSubFailed === 0 ? "pass" : "review",
      evidence: [
        `pubsubWebhook=${collaborationProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${collaborationProvider.endpointHash ?? "none"}`,
        `secret=${collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${collaborationPubSubPending}`,
        `failed=${collaborationPubSubFailed}`
      ],
      nextAction: collaborationProvider.configured && collaborationProvider.secretConfigured && collaborationPubSubFailed === 0
        ? "Keep collaboration event delivery connected to the external pub/sub bus."
        : "Set SENA_COLLABORATION_PUBSUB_WEBHOOK_URL and SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET, then replay failed collaboration events."
    },
    {
      id: "ops-backup-freshness",
      label: "Backup freshness",
      status: backupStatus === "fresh" ? "pass" : "review",
      evidence: [
        `status=${backupStatus}`,
        `lastBackupAt=${lastBackupAt ?? "missing"}`,
        `lastVerifiedAt=${lastVerifiedAt ?? "missing"}`,
        `backupAgeSeconds=${backupAge ?? "missing"}`,
        `warningAfterHours=${backupWarningHours}`
      ],
      nextAction: backupStatus === "fresh" ? "Keep scheduled backup verification active." : "Run and verify a fresh team-scoped backup before production handoff."
    },
    {
      id: "ops-backup-webhook",
      label: "Managed backup delivery webhook",
      status: backupProvider.configured && backupProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `backupWebhook=${backupProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${backupProvider.endpointHash ?? "none"}`,
        `secret=${backupProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${backupProvider.timeoutMs}`
      ],
      nextAction: backupProvider.configured && backupProvider.secretConfigured
        ? "Keep signed backup delivery connected to managed storage or a database bridge."
        : "Set SENA_BACKUP_WEBHOOK_URL and SENA_BACKUP_WEBHOOK_SECRET before relying on external backup handoff."
    },
    {
      id: "ops-alert-webhook",
      label: "Alert delivery webhook",
      status: alertProvider.configured && alertProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `alertWebhook=${alertProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${alertProvider.endpointHash ?? "none"}`,
        `secret=${alertProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${alertProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/ops/alerts action=deliver",
        "webhookSchema=sena-enterprise-ops-alert-webhook/v1"
      ],
      nextAction: alertProvider.configured && alertProvider.secretConfigured
        ? "Keep signed alert delivery connected to the deployment incident channel."
        : "Set SENA_ALERT_WEBHOOK_URL and SENA_ALERT_WEBHOOK_SECRET before relying on external incident alerting."
    },
    {
      id: "ops-auth",
      label: "Ops endpoint access control",
      status: opsTokenConfigured() ? "pass" : "review",
      evidence: [
        `opsToken=${opsTokenConfigured() ? "configured" : "missing"}`,
        "fallback=session-required",
        "statusApi=/api/sena/ops/status",
        "metricsApi=/api/sena/ops/metrics"
      ],
      nextAction: opsTokenConfigured() ? "Use the bearer token from the deployment monitor only." : "Set SENA_OPS_TOKEN before exposing ops endpoints to deployment monitoring."
    },
    {
      id: "ops-email-webhook-queue",
      label: "Email webhook queue",
      status: emailFailedWebhook === 0 ? "pass" : "review",
      evidence: [
        `emailWebhook=${emailWebhookConfigured ? "configured" : "missing"}`,
        `pending=${emailPendingWebhook}`,
        `failed=${emailFailedWebhook}`
      ],
      nextAction: emailFailedWebhook === 0
        ? "Keep email webhook delivery in deployment monitoring."
        : "Replay failed email webhook deliveries and investigate the institution email bridge."
    },
    {
      id: "ops-audit-webhook-queue",
      label: "Audit/SIEM webhook queue",
      status: auditFailedWebhook === 0 ? "pass" : "review",
      evidence: [
        `auditWebhook=${auditWebhookConfigured ? "configured" : "missing"}`,
        `pending=${auditPendingWebhook}`,
        `failed=${auditFailedWebhook}`
      ],
      nextAction: auditFailedWebhook === 0
        ? "Keep audit webhook delivery in deployment monitoring."
        : "Replay failed audit webhook deliveries and investigate SIEM endpoint health."
    }
  ];
  const status = !primaryStorageWritable || !primaryStorageLockHealthy
    ? "degraded"
    : checks.every((check) => check.status === "pass") ? "ready" : "review";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsStatus,
    status,
    generatedAt,
    deployment: {
      nodeVersion: process.version,
      runtime: "nodejs",
      nodeEnv: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      opsTokenConfigured: opsTokenConfigured(),
      opsSessionOperatorsConfigured: opsSessionOperatorsConfigured(),
      provisioningTokenConfigured: Boolean(envValue("SENA_PROVISIONING_TOKEN")),
      notificationWebhookConfigured,
      emailWebhookConfigured,
      collaborationPubSubWebhookConfigured,
      databaseSyncWebhookConfigured,
      objectStorageWebhookConfigured,
      objectStorageNativeConfigured,
      backupWebhookConfigured,
      alertWebhookConfigured,
      auditWebhookConfigured
    },
    storage: {
      engine: storageEngine,
      primaryStateRuntime,
      configuredDirectory,
      pathHint: enterpriseDbPathHint,
      ...(postgresStorage ? { postgres: postgresStorage } : {}),
      ...fileStats,
      ...storageProbe,
      ...lockProbe
    },
    backup: {
      status: backupStatus,
      lastBackupAt,
      lastVerifiedAt,
      backupAgeSeconds: backupAge,
      warningAfterHours: backupWarningHours
    },
    queues: {
      notificationsPendingWebhook: db.notifications.filter((notification) => notification.webhookDelivery?.status === "pending").length,
      notificationsFailedWebhook: db.notifications.filter((notification) => notification.webhookDelivery?.status === "failed").length,
      emailPendingWebhook,
      emailFailedWebhook,
      auditPendingWebhook,
      auditFailedWebhook,
      collaborationPubSubPending,
      collaborationPubSubFailed,
      serverJobsQueued,
      serverJobsRunning,
      serverJobsFailed,
      serverJobsDeadLettered,
      serverJobsRetryable,
      activePasswordResetRequests,
      activeAuthLockouts,
      activeApiRateLimitBuckets
    },
    counts: {
      users: db.users.length,
      // Excludes archived (retired) teams; they remain in db.teams for audit and backup.
      teams: db.teams.filter((team) => !team.archived).length,
      teamsArchived: db.teams.filter((team) => team.archived).length,
      projects: db.projects.length,
      uploads: db.uploads.length,
      importRuns: db.importRuns.length,
      analysisRuns: db.analysisRuns.length,
      serverJobs: serverJobs.length,
      reliabilityRuns: db.reliabilityRuns.length,
      validationRuns: db.validationRuns.length,
      expertReviews: db.expertReviews.length,
      platformDecisionAcceptances: (db.platformDecisionAcceptances ?? []).length,
      releaseGateReviews: (db.releaseGateReviews ?? []).length,
      postCutoverObservations: (db.postCutoverObservations ?? []).length,
      goLiveAttestations: (db.goLiveAttestations ?? []).length,
      projectRevisions: db.projectRevisions.length,
      comments: db.projectComments.length,
      adjudications: db.adjudications.length,
      collaborationEvents: (db.collaborationEvents ?? []).length,
      notifications: db.notifications.length,
      auditEvents: db.auditLog.length,
      sessions: db.sessions.length,
      provisionedUsers,
      provisionedTeams,
      provisionedMemberships
    },
    checks
  };
}

export function getEnterpriseOpsStatus(input: {
  db?: SenaEnterpriseDb;
  snapshotSource?: SenaEnterpriseOpsStatusSnapshotSource;
  uploadStorageVerification?: SenaEnterpriseUploadStorageVerification;
  uploadObjectStorageCustody?: SenaEnterpriseUploadObjectStorageCustodySummary;
} = {}): SenaEnterpriseOpsStatus {
  const db = input.db ?? readEnterpriseDb();
  return buildEnterpriseOpsStatus(db, input.snapshotSource ?? "file-json", {
    uploadStorageVerification: input.uploadStorageVerification ?? (
      input.db ? verifyEnterpriseUploadStorageFromDb(db) : undefined
    ),
    uploadObjectStorageCustody: input.uploadObjectStorageCustody ?? (
      input.db ? summarizeEnterpriseUploadObjectStorageCustodyFromDb(db) : undefined
    )
  });
}

function serverJobRuntimeCheck(input: {
  serverJobsQueued: number;
  serverJobsRunning: number;
  serverJobsFailed: number;
  serverJobsDeadLettered: number;
  serverJobsRetryable: number;
  total: number;
  source: "enterprise-state" | "postgres-table";
  readStatus: "pass" | "fallback";
  readErrorHash?: string;
}): SenaEnterpriseGovernanceCheck {
  const serverJobRuntime = serverJobStoreRuntime();
  return {
    id: "ops-server-job-runtime",
    label: "Server job queue runtime status",
    status: input.serverJobsFailed === 0 && input.serverJobsDeadLettered === 0 && input.readStatus === "pass" ? "pass" : "review",
    evidence: [
      ...serverJobRuntime.evidence,
      `serverJobQueueCountsSource=${input.source}`,
      `serverJobQueueCountsRead=${input.readStatus}`,
      `serverJobQueueCountsReadErrorHash=${input.readErrorHash ?? "none"}`,
      `total=${input.total}`,
      `queued=${input.serverJobsQueued}`,
      `running=${input.serverJobsRunning}`,
      `failed=${input.serverJobsFailed}`,
      `deadLettered=${input.serverJobsDeadLettered}`,
      `retryable=${input.serverJobsRetryable}`,
      "statusApi=/api/sena/ops/jobs",
      "workerActions=mark-running|mark-succeeded|mark-failed|retry|dead-letter",
      "workerJobActions=run-import|run-analysis|run-publication-export|run-reliability|run-validation"
    ],
    nextAction: input.readStatus !== "pass"
      ? "Inspect the configured server job store; production monitoring fell back before it could read indexed job status counts."
      : input.serverJobsFailed === 0 && input.serverJobsDeadLettered === 0
        ? serverJobRuntime.activeStore === "postgres-table"
          ? "Keep worker status callbacks wired to /api/sena/ops/jobs and monitor the indexed Postgres job table."
          : "Keep worker status callbacks wired to /api/sena/ops/jobs; move server job status to Postgres before production load."
        : "Inspect /api/sena/ops/jobs for failed or dead-lettered jobs, retry safe project-pointer jobs, or attach worker failure evidence."
  };
}

function replaceServerJobStatus(status: SenaEnterpriseOpsStatus, input: {
  serverJobsQueued: number;
  serverJobsRunning: number;
  serverJobsFailed: number;
  serverJobsDeadLettered: number;
  serverJobsRetryable: number;
  total: number;
  source: "enterprise-state" | "postgres-table";
  readStatus: "pass" | "fallback";
  readErrorHash?: string;
}): SenaEnterpriseOpsStatus {
  const nextCheck = serverJobRuntimeCheck(input);
  const checks = status.checks.map((check) => check.id === nextCheck.id ? nextCheck : check);
  const degraded = checks.some((check) => check.status === "review" && [
    "ops-storage-readable",
    "ops-storage-writable",
    "ops-storage-lock",
    "ops-write-before-backup",
    "ops-upload-storage-integrity"
  ].includes(check.id));
  const ready = checks.every((check) => check.status === "pass");
  return {
    ...status,
    status: degraded ? "degraded" : ready ? "ready" : "review",
    queues: {
      ...status.queues,
      serverJobsQueued: input.serverJobsQueued,
      serverJobsRunning: input.serverJobsRunning,
      serverJobsFailed: input.serverJobsFailed,
      serverJobsDeadLettered: input.serverJobsDeadLettered,
      serverJobsRetryable: input.serverJobsRetryable
    },
    counts: {
      ...status.counts,
      serverJobs: input.total
    },
    checks
  };
}

export async function getEnterpriseOpsStatusWithPostgresEvidence(): Promise<SenaEnterpriseOpsStatus> {
  const state = await readEnterpriseState();
  const uploadStorageVerification = await verifyEnterpriseUploadStorageAsync();
  const uploadObjectStorageCustody = await summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence();
  const status = buildEnterpriseOpsStatus(
    state.db,
    state.runtime.activePrimary === "postgres" ? "postgres-primary-state" : "file-primary-state",
    {
      uploadStorageVerification,
      uploadObjectStorageCustody
    }
  );
  if (serverJobStoreRuntime().activeStore !== "postgres-table") return status;
  try {
    const jobs = await listEnterpriseServerJobs({ limit: 1 });
    return replaceServerJobStatus(status, {
      serverJobsQueued: jobs.summary.queued,
      serverJobsRunning: jobs.summary.running,
      serverJobsFailed: jobs.summary.failed,
      serverJobsDeadLettered: jobs.summary.deadLettered,
      serverJobsRetryable: jobs.summary.retryable,
      total: jobs.summary.total,
      source: "postgres-table",
      readStatus: "pass"
    });
  } catch (error) {
    return replaceServerJobStatus(status, {
      serverJobsQueued: status.queues.serverJobsQueued,
      serverJobsRunning: status.queues.serverJobsRunning,
      serverJobsFailed: status.queues.serverJobsFailed,
      serverJobsDeadLettered: status.queues.serverJobsDeadLettered,
      serverJobsRetryable: status.queues.serverJobsRetryable,
      total: status.counts.serverJobs,
      source: "enterprise-state",
      readStatus: "fallback",
      readErrorHash: sha256Text(error instanceof Error ? `${error.name}:${error.message}` : String(error))
    });
  }
}
