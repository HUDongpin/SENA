import { resolveEnterprisePostgresConfig, type SenaEnterprisePostgresConfig } from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { isAuthLockoutActive, pruneApiRateLimits } from "./auth-security";
import { verifyEnterpriseUploadStorage } from "./import-analysis";
import { latestAuditAt } from "./ops-audit";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import type { SenaEnterpriseGovernanceCheck, SenaEnterpriseGovernanceStatus } from "./ops-governance";
import {
  createConfiguredFileEnterpriseStateStore,
  readEnterpriseDb,
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
  enterpriseDbPath,
  enterpriseDbPathHint,
  envValue,
  now,
  positiveIntegerEnv
} from "./ops-runtime";

export type SenaEnterpriseStorageEngine = "file-backed-json" | "postgres" | "neon-postgres";

export type SenaEnterprisePostgresStorageEvidence = {
  configured: boolean;
  adapter: "postgres" | "neon";
  urlEnvName?: string;
  connectionHash?: string;
  missingEnv: string[];
  liveProbe: "not-run";
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
    provisioningTokenConfigured: boolean;
    notificationWebhookConfigured: boolean;
    emailWebhookConfigured: boolean;
    collaborationPubSubWebhookConfigured: boolean;
    databaseSyncWebhookConfigured: boolean;
    objectStorageWebhookConfigured: boolean;
    backupWebhookConfigured: boolean;
    alertWebhookConfigured: boolean;
    auditWebhookConfigured: boolean;
  };
  storage: {
    engine: SenaEnterpriseStorageEngine;
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
    activePasswordResetRequests: number;
    activeAuthLockouts: number;
    activeApiRateLimitBuckets: number;
  };
  counts: SenaEnterpriseGovernanceStatus["counts"] & {
    sessions: number;
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
  return {
    configured: config.configured,
    adapter: config.adapter,
    urlEnvName: config.urlEnvName,
    connectionHash: config.connectionHash,
    missingEnv: config.missingEnv,
    liveProbe: "not-run"
  };
}

export function enterprisePostgresPublicEvidence(config: SenaEnterprisePostgresConfig) {
  return [
    ...config.evidence,
    `missing=${config.missingEnv.join("|") || "none"}`,
    "nativeSchema=sena-enterprise-postgres-adapter/v1",
    "liveProbe=not-run"
  ];
}

export function opsTokenConfigured() {
  return Boolean(envValue("SENA_OPS_TOKEN"));
}

export function backupAgeSeconds(lastBackupAt?: string) {
  if (!lastBackupAt) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(lastBackupAt)) / 1000));
}

export function getEnterpriseOpsStatus(): SenaEnterpriseOpsStatus {
  const db = readEnterpriseDb();
  const generatedAt = now();
  const configuredDirectory = process.env.SENA_ENTERPRISE_DB_DIR ? "env-configured" : "default-local";
  const postgresConfig = resolveEnterprisePostgresConfig();
  const storageEngine = enterprisePostgresStorageEngine(postgresConfig);
  const postgresStorage = enterprisePostgresStorageEvidence(postgresConfig);
  const stateStore: SenaFileEnterpriseStateStore = createConfiguredFileEnterpriseStateStore();
  const storageProbe = stateStore.probeWrite();
  const lockProbe = stateStore.probeLock();
  const fileStats = stateStore.fileStats();
  const uploadStorageVerification = verifyEnterpriseUploadStorage();
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
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "ops-storage-readable",
      label: "Enterprise storage readable",
      status: fileStats.dbFileExists ? "pass" : "review",
      evidence: [
        `dbFileExists=${fileStats.dbFileExists}`,
        `dbBytes=${fileStats.dbBytes}`,
        `dbUpdatedAt=${fileStats.dbUpdatedAt ?? "missing"}`
      ],
      nextAction: fileStats.dbFileExists ? "Keep the enterprise data file on managed storage." : "Initialize enterprise storage before production monitoring is marked ready."
    },
    {
      id: "ops-storage-writable",
      label: "Enterprise storage writable",
      status: storageProbe.writable ? "pass" : "review",
      evidence: [
        `writeProbe=${storageProbe.writeProbe}`,
        `writeErrorHash=${storageProbe.writeErrorHash ?? "none"}`
      ],
      nextAction: storageProbe.writable ? "Continue monitoring write probes from the deployment platform." : "Fix enterprise data directory write permissions."
    },
    {
      id: "ops-storage-lock",
      label: "Enterprise storage write lock",
      status: lockProbe.lockProbe === "pass" ? "pass" : "review",
      evidence: [
        `lockProbe=${lockProbe.lockProbe}`,
        `lockTimeoutMs=${lockProbe.lockTimeoutMs}`,
        `lockErrorHash=${lockProbe.lockErrorHash ?? "none"}`
      ],
      nextAction: lockProbe.lockProbe === "pass" ? "Keep the lock file path on shared durable storage for single-runtime deployments." : "Clear stale locks or move enterprise storage to a lock-capable managed adapter."
    },
    {
      id: "ops-write-before-backup",
      label: "Enterprise write-before backup",
      status: fileStats.dbBackupExists ? "pass" : "review",
      evidence: [
        `backupExists=${fileStats.dbBackupExists}`,
        `backupBytes=${fileStats.dbBackupBytes}`,
        `backupUpdatedAt=${fileStats.dbBackupUpdatedAt ?? "missing"}`
      ],
      nextAction: fileStats.dbBackupExists ? "Keep write-before backup plus scheduled team-scoped backup verification active." : "Perform at least one write after initialization so the local write-before backup exists."
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
      id: "ops-object-storage-webhook",
      label: "Managed object storage delivery webhook",
      status: objectStorageProvider.configured && objectStorageProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `objectStorageWebhook=${objectStorageProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `secret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${objectStorageProvider.timeoutMs}`
      ],
      nextAction: objectStorageProvider.configured && objectStorageProvider.secretConfigured
        ? "Keep signed upload blob delivery connected to managed object storage."
        : "Set SENA_OBJECT_STORAGE_WEBHOOK_URL and SENA_OBJECT_STORAGE_WEBHOOK_SECRET before relying on external upload blob handoff."
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
  const status = !storageProbe.writable || lockProbe.lockProbe === "fail"
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
      provisioningTokenConfigured: Boolean(envValue("SENA_PROVISIONING_TOKEN")),
      notificationWebhookConfigured,
      emailWebhookConfigured,
      collaborationPubSubWebhookConfigured,
      databaseSyncWebhookConfigured,
      objectStorageWebhookConfigured,
      backupWebhookConfigured,
      alertWebhookConfigured,
      auditWebhookConfigured
    },
    storage: {
      engine: storageEngine,
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
      activePasswordResetRequests,
      activeAuthLockouts,
      activeApiRateLimitBuckets
    },
    counts: {
      users: db.users.length,
      teams: db.teams.length,
      projects: db.projects.length,
      uploads: db.uploads.length,
      importRuns: db.importRuns.length,
      analysisRuns: db.analysisRuns.length,
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
