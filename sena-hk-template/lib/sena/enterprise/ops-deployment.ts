import {
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  getEnterpriseSsoProviderStatuses,
  providerEnvPrefix,
  ssoCallbackPath,
  type SenaEnterpriseSsoProvider,
  type SenaEnterpriseSsoProviderStatus
} from "./auth-sso";
import {
  buildEnterpriseIdentityProductionEvidenceDossier,
  type SenaEnterpriseIdentityProductionEvidence
} from "./identity-production-evidence";
import {
  identityEvidenceAllowedHostConfig
} from "./identity-evidence-url-policy";
import {
  identityLifecycleOwnerModeBinding,
  identitySecretRotationCadenceBinding,
  idpTenantBinding,
  secretStoreReferenceBinding
} from "./identity-readiness";
import {
  alertingChannel,
  alertingOwner,
  alertingRunbookUrl
} from "./ops-alerts";
import {
  conferenceLoadRehearsalProductionEvidenceReadiness
} from "./conference-load-rehearsal";
import {
  buildEnterpriseOrganizationDeploymentDecisions,
  type SenaEnterpriseOrganizationDeploymentDecision
} from "./ops-deployment-decisions";
import {
  enterpriseObservabilityReadiness
} from "./ops-observability";
import {
  buildEnterpriseProductionEvidenceManifest,
  type SenaEnterpriseProductionEvidenceManifest
} from "./ops-production-evidence";
import {
  serverJobQueueProbeReadiness,
  serverJobQueueStatus
} from "./server-job-queue";
import {
  getEnterpriseServerJobWorkerContract
} from "./server-job-worker-contract";
import {
  deploymentEnv,
  deploymentWebhookEnv,
  type SenaEnterpriseOrganizationDeploymentEnv
} from "./ops-deployment-env";
import {
  enterpriseOrganizationDeploymentServiceEndpoints,
  type SenaEnterpriseOrganizationDeploymentServiceEndpoint
} from "./ops-deployment-service-endpoints";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseDeploymentReadinessWithPostgresEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import {
  getEnterpriseGovernanceStatus,
  getEnterpriseGovernanceStatusWithPostgresEvidence,
  type SenaEnterpriseGovernanceCheck,
  type SenaEnterpriseGovernanceStatus
} from "./ops-governance";
import {
  buildEnterprisePlatformDecisionRegister,
  latestPlatformDecisionAcceptances,
  summarizePlatformDecisionAcceptances,
  type SenaEnterprisePlatformDecisionAcceptance,
  type SenaEnterprisePlatformDecisionRegister
} from "./ops-platform-decisions";
import {
  buildEnterpriseNativeAdapterCertification,
  type SenaEnterpriseNativeAdapterCertification
} from "./ops-platform-adapter-certification";
import {
  isSelfManagedEnterpriseMode
} from "./ops-platform-decision-policy";
import {
  buildEnterpriseDeploymentReleaseGateEvidence,
  enterpriseReleaseGateIdentityProductionSnapshot,
  type SenaEnterpriseReleaseGateDecision,
  type SenaEnterpriseReleaseGateReview,
  type SenaEnterpriseReleaseGateReviewList,
  type SenaEnterpriseReleaseVerificationEvidence
} from "./ops-release-gate";
import {
  getEnterpriseOpsStatus,
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus,
  type SenaEnterpriseStorageEngine
} from "./ops-status";
import {
  buildEnterpriseSaasOperationsReadiness,
  type SenaEnterpriseSaasOperationsReadiness
} from "./ops-saas-operations";
import {
  dbLockTimeoutMs,
  enterpriseDbPath,
  envValue,
  normalizedBaseUrl,
  now,
  sha256Text
} from "./ops-runtime";
import {
  readEnterpriseDb,
  readEnterpriseState,
  type SenaEnterpriseDb
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

export function getEnterprisePlatformDecisionRegister(input: {
  teamId?: string;
  db?: SenaEnterpriseDb;
} = {}): SenaEnterprisePlatformDecisionRegister {
  const db = input.db ?? readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage({ db });
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  return buildEnterprisePlatformDecisionRegister(deployment.platformDecisions, platformDecisionAcceptances);
}

export async function getEnterprisePlatformDecisionRegisterWithPostgresState(input: {
  teamId?: string;
} = {}): Promise<SenaEnterprisePlatformDecisionRegister> {
  const state = await readEnterpriseState();
  return getEnterprisePlatformDecisionRegister({
    teamId: input.teamId,
    db: state.db
  });
}

export function getEnterpriseNativeAdapterCertification(input: { teamId?: string } = {}): SenaEnterpriseNativeAdapterCertification {
  const db = readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  const platformDecisionRegister = input.teamId
    ? buildEnterprisePlatformDecisionRegister(deployment.platformDecisions, platformDecisionAcceptances)
    : deployment.platformDecisionRegister;
  return buildEnterpriseNativeAdapterCertification(platformDecisionRegister, platformDecisionAcceptances);
}

export function getEnterpriseSaasOperationsReadiness(input: { teamId?: string } = {}): SenaEnterpriseSaasOperationsReadiness {
  if (!input.teamId) {
    return getEnterpriseOrganizationDeploymentPackage().saasOperationsReadiness;
  }
  const db = readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const platformDecisionAcceptances = (db.platformDecisionAcceptances ?? [])
    .filter((acceptance) => acceptance.teamId === input.teamId);
  const platformDecisionRegister = buildEnterprisePlatformDecisionRegister(
    deployment.platformDecisions,
    platformDecisionAcceptances
  );
  const nativeAdapterCertification = buildEnterpriseNativeAdapterCertification(
    platformDecisionRegister,
    platformDecisionAcceptances
  );
  const releaseGate = buildEnterpriseDeploymentReleaseGateEvidence(
    (db.releaseGateReviews ?? []).filter((review) => review.teamId === input.teamId)
  );
  const identityProductionHandoff = buildEnterpriseIdentityProductionEvidenceDossier({
    teamId: input.teamId,
    platformDecisionRegister,
    platformDecisionAcceptances
  });
  return buildEnterpriseSaasOperationsReadiness({
    platformDecisionRegister,
    nativeAdapterCertification,
    releaseGate,
    identityProductionHandoff,
    saasOperatingModelApproved: envValue("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED") === "1"
  });
}


export function getEnterpriseOrganizationDeploymentPackage(input: {
  teamId?: string;
  readiness?: SenaEnterpriseDeploymentReadiness;
  opsStatus?: SenaEnterpriseOpsStatus;
  governance?: SenaEnterpriseGovernanceStatus;
  db?: SenaEnterpriseDb;
} = {}): SenaEnterpriseOrganizationDeploymentPackage {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const db = input.db ?? readEnterpriseDb();
  const opsStatus = input.opsStatus ?? getEnterpriseOpsStatus();
  const readiness = input.readiness ?? getEnterpriseDeploymentReadiness({ opsStatus });
  const governance = input.governance ?? getEnterpriseGovernanceStatus({ db, opsStatus });
  const postgresConfig = resolveEnterprisePostgresConfig();
  const baseUrl = normalizedBaseUrl();
  const webhookProvider = notificationWebhookProvider(enterpriseDbPath, selfManagedEnterprise);
  const emailProvider = emailWebhookProvider(enterpriseDbPath, selfManagedEnterprise);
  const collaborationProvider = collaborationPubSubProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const databaseSyncProvider = databaseSyncWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageProvider = objectStorageWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageNativeProvider = enterpriseObjectStorageNativeProvider();
  const backupProvider = backupWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const alertProvider = alertWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const auditProvider = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const queueStatus = serverJobQueueStatus();
  const queueProbe = serverJobQueueProbeReadiness();
  const workerContract = getEnterpriseServerJobWorkerContract();
  const observability = enterpriseObservabilityReadiness();
  const conferenceLoad = conferenceLoadRehearsalProductionEvidenceReadiness();
  const oidcProviders = getEnterpriseSsoProviderStatuses();
  const governanceCheckById = new Map(governance.checks.map((check) => [check.id, check]));
  const mfaKeyConfigured = Boolean(envValue("SENA_MFA_ENCRYPTION_KEY") || envValue("SENA_SESSION_SECRET"));
  const fullSaasBackendApproved = envValue("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED") === "1";
  const identityEvidenceHostAllowlist = identityEvidenceAllowedHostConfig();
  const identityEvidenceHostAllowlistConfigured = identityEvidenceHostAllowlist.configured &&
    identityEvidenceHostAllowlist.hosts.length > 0 &&
    identityEvidenceHostAllowlist.invalidCount === 0;
  const env: SenaEnterpriseOrganizationDeploymentEnv[] = [
    deploymentEnv({
      name: "SENA_APP_URL",
      category: "runtime",
      required: true,
      configured: Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL")),
      secret: false,
      value: baseUrl,
      purpose: "Canonical deployment origin for OAuth/OIDC callbacks and email action URLs"
    }),
    deploymentEnv({
      name: "SENA_ENTERPRISE_DB_DIR",
      category: "storage",
      required: true,
      configured: opsStatus.storage.configuredDirectory === "env-configured",
      secret: false,
      value: process.env.SENA_ENTERPRISE_DB_DIR,
      purpose: "Managed durable enterprise data directory"
    }),
    deploymentEnv({
      name: "SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS",
      category: "storage",
      required: false,
      configured: Boolean(envValue("SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS")),
      secret: false,
      defaultedTo: String(dbLockTimeoutMs),
      purpose: "Single-runtime file-lock timeout"
    }),
    deploymentEnv({
      name: "SENA_ENTERPRISE_DB_ADAPTER",
      category: "storage",
      required: fullSaasBackendApproved,
      configured: postgresConfig.adapterRequested,
      secret: false,
      value: postgresConfig.adapter,
      purpose: "Native Postgres/Neon enterprise state adapter selection"
    }),
    deploymentEnv({
      name: "SENA_ENTERPRISE_POSTGRES_URL|SENA_DATABASE_URL|POSTGRES_URL|DATABASE_URL",
      category: "storage",
      required: fullSaasBackendApproved,
      configured: postgresConfig.configured,
      secret: true,
      purpose: "Managed Postgres connection string for enterprise state"
    }),
    deploymentEnv({
      name: "SENA_ENTERPRISE_STATE_STORE",
      category: "storage",
      required: fullSaasBackendApproved,
      configured: opsStatus.storage.primaryStateRuntime.postgresPrimaryRequested,
      secret: false,
      value: opsStatus.storage.primaryStateRuntime.mode,
      purpose: "Switches enterprise project state routes from local JSON to the configured Postgres primary store"
    }),
    deploymentEnv({
      name: "SENA_MFA_ENCRYPTION_KEY|SENA_SESSION_SECRET",
      category: "auth",
      required: true,
      configured: mfaKeyConfigured,
      secret: true,
      purpose: "Production auth/MFA secret material"
    }),
    deploymentEnv({
      name: "SENA_OPS_TOKEN",
      category: "ops",
      required: true,
      configured: opsStatus.deployment.opsTokenConfigured,
      secret: true,
      purpose: "Bearer token for deployment monitors"
    }),
    deploymentEnv({
      name: "SENA_PROVISIONING_TOKEN",
      category: "provisioning",
      required: !selfManagedEnterprise,
      configured: selfManagedEnterprise || opsStatus.deployment.provisioningTokenConfigured,
      secret: true,
      purpose: selfManagedEnterprise
        ? "Not required for self-managed manual local membership and RBAC administration"
        : "Bearer token for institution IdP/SCIM provisioning"
    }),
    deploymentEnv({
      name: "SENA_PROVISIONING_TOKEN_SECRET_REF",
      category: "provisioning",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF").configured,
      secret: false,
      value: envValue("SENA_PROVISIONING_TOKEN_SECRET_REF"),
      purpose: "Non-secret institution secret-store reference for provisioning bearer-token custody evidence"
    }),
    deploymentEnv({
      name: "SENA_PROVISIONING_TOKEN_VERSION",
      category: "provisioning",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: Boolean(envValue("SENA_PROVISIONING_TOKEN_VERSION")),
      secret: false,
      value: envValue("SENA_PROVISIONING_TOKEN_VERSION"),
      purpose: "Non-secret provisioning bearer-token rotation version used to bind institution production evidence"
    }),
    deploymentEnv({
      name: "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: identityEvidenceHostAllowlistConfigured,
      secret: false,
      purpose: "Institution evidence-host allowlist for IdP/SCIM production evidence URLs"
    }),
    deploymentEnv({
      name: "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: identitySecretRotationCadenceBinding().valid,
      secret: false,
      value: envValue("SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"),
      purpose: "Institution-approved SSO client-secret and provisioning bearer-token rotation cadence in days"
    }),
    deploymentEnv({
      name: "SENA_SSO_INSTITUTION_TENANT_ID",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: idpTenantBinding().configured,
      secret: false,
      value: envValue("SENA_SSO_INSTITUTION_TENANT_ID"),
      purpose: "Non-secret institution IdP tenant or app-registration identifier used to bind tenant approval evidence"
    }),
    deploymentEnv({
      name: "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF").configured,
      secret: false,
      value: envValue("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF"),
      purpose: "Non-secret institution secret-store reference for OIDC client-secret custody evidence"
    }),
    deploymentEnv({
      name: "SENA_IDENTITY_LIFECYCLE_OWNER_MODE",
      category: "identity",
      required: !selfManagedEnterprise && process.env.NODE_ENV === "production",
      configured: identityLifecycleOwnerModeBinding().valid,
      secret: false,
      value: envValue("SENA_IDENTITY_LIFECYCLE_OWNER_MODE"),
      purpose: "Institution lifecycle ownership mode for SCIM, IdP, or hybrid provisioning"
    }),
    deploymentEnv({
      name: "SENA_AUDIT_RETENTION_DAYS",
      category: "governance",
      required: true,
      configured: Boolean(envValue("SENA_AUDIT_RETENTION_DAYS")),
      secret: false,
      value: envValue("SENA_AUDIT_RETENTION_DAYS"),
      purpose: "Institution-approved audit retention window"
    }),
    deploymentEnv({
      name: "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
      category: "governance",
      required: false,
      configured: fullSaasBackendApproved,
      secret: false,
      value: envValue("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"),
      purpose: "Institution platform-owner approval for the full SaaS backend operating model"
    }),
    deploymentEnv({
      name: "SENA_OBJECT_STORAGE_ADAPTER",
      category: "uploads",
      required: fullSaasBackendApproved && !(objectStorageProvider.configured && objectStorageProvider.secretConfigured),
      configured: objectStorageNativeProvider.mode !== "not-configured",
      secret: false,
      value: objectStorageNativeProvider.mode,
      purpose: "Native object-storage adapter selection for upload blobs"
    }),
    deploymentEnv({
      name: "SENA_OBJECT_STORAGE_ENDPOINT",
      category: "uploads",
      required: fullSaasBackendApproved && !(objectStorageProvider.configured && objectStorageProvider.secretConfigured),
      configured: Boolean(objectStorageNativeProvider.endpointHash),
      secret: false,
      purpose: "Native object-storage endpoint; concrete value is excluded and represented by hash evidence"
    }),
    deploymentEnv({
      name: "SENA_OBJECT_STORAGE_BUCKET",
      category: "uploads",
      required: fullSaasBackendApproved && !(objectStorageProvider.configured && objectStorageProvider.secretConfigured),
      configured: Boolean(objectStorageNativeProvider.bucketHash),
      secret: false,
      purpose: "Native object-storage bucket; concrete value is excluded and represented by hash evidence"
    }),
    deploymentEnv({
      name: "SENA_OBJECT_STORAGE_ACCESS_KEY_ID|SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
      category: "uploads",
      required: fullSaasBackendApproved && !(objectStorageProvider.configured && objectStorageProvider.secretConfigured),
      configured: objectStorageNativeProvider.accessKeyConfigured && objectStorageNativeProvider.secretConfigured,
      secret: true,
      purpose: "Native object-storage HMAC credentials for server-side PUT delivery"
    }),
    deploymentEnv({
      name: "SENA_JOB_QUEUE_ADAPTER",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: queueStatus.mode === "managed" || queueStatus.mode === "webhook",
      secret: false,
      value: queueStatus.mode,
      purpose: "Managed server job queue adapter for heavy analysis and publication export work"
    }),
    deploymentEnv({
      name: "SENA_JOB_QUEUE_URL",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: (queueStatus.mode === "managed" || queueStatus.mode === "webhook") && Boolean(queueStatus.endpointHash),
      secret: false,
      endpointHash: queueStatus.endpointHash,
      purpose: "Managed server job queue endpoint; concrete URL is excluded"
    }),
    deploymentEnv({
      name: "SENA_JOB_QUEUE_SECRET",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: queueStatus.secretConfigured,
      secret: true,
      purpose: "HMAC signing secret for server job queue payload delivery"
    }),
    deploymentEnv({
      name: "SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED|SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256|SENA_JOB_QUEUE_PROBE_VERIFIED_AT",
      category: "ops",
      required: fullSaasBackendApproved && queueProbe.required,
      configured: queueProbe.confirmed,
      secret: false,
      purpose: "Managed queue live dispatch probe binding proving signed synthetic payload delivery"
    }),
    deploymentEnv({
      name: "SENA_JOB_WORKER_RUNTIME",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: workerContract.worker.runtime !== "not-configured",
      secret: false,
      value: workerContract.worker.runtime,
      purpose: "External worker runtime or managed queue consumer identity"
    }),
    deploymentEnv({
      name: "SENA_JOB_WORKER_CALLBACK_URL",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: workerContract.worker.callbackConfigured,
      secret: false,
      endpointHash: workerContract.worker.callbackUrlHash,
      purpose: "External worker status callback URL for /api/sena/ops/jobs; concrete URL is excluded"
    }),
    deploymentEnv({
      name: "SENA_JOB_WORKER_RUNBOOK_URL",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: workerContract.worker.runbookConfigured,
      secret: false,
      endpointHash: workerContract.worker.runbookUrlHash,
      purpose: "Worker incident runbook URL; concrete URL is excluded"
    }),
    deploymentEnv({
      name: "SENA_JOB_WORKER_HEARTBEAT_CONFIRMED|SENA_JOB_WORKER_HEARTBEAT_SHA256|SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: workerContract.worker.heartbeatConfirmed &&
        workerContract.worker.heartbeatArtifactHashConfigured &&
        workerContract.worker.heartbeatVerifiedAtConfigured,
      secret: false,
      purpose: "Worker heartbeat artifact binding proving the queue consumer can call status callbacks"
    }),
    deploymentEnv({
      name: "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: envValue("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED") === "1",
      secret: false,
      purpose: "Enforces the aggregated production evidence manifest for live probe artifact custody"
    }),
    deploymentEnv({
      name: "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED|SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256|SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: conferenceLoad.confirmed,
      secret: false,
      purpose: "Archived conference load rehearsal artifact binding for the 50-user, 30-minute performance path"
    }),
    deploymentEnv({
      name: "SENA_CONFERENCE_LOAD_REHEARSAL_USERS|SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS|SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS|SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: conferenceLoad.usersConfigured &&
        conferenceLoad.durationConfigured &&
        conferenceLoad.p95Configured &&
        conferenceLoad.errorRateConfigured,
      secret: false,
      purpose: "Conference load rehearsal metadata proving 50 users, 1800 seconds, p95 latency, and error-rate evidence"
    }),
    ...deploymentWebhookEnv("SENA_NOTIFICATION_WEBHOOK_URL", "SENA_NOTIFICATION_WEBHOOK_SECRET", webhookProvider, "notifications", "Notification event bridge"),
    ...deploymentWebhookEnv("SENA_EMAIL_WEBHOOK_URL", "SENA_EMAIL_WEBHOOK_SECRET", emailProvider, "notifications", "Institution email bridge"),
    ...deploymentWebhookEnv("SENA_COLLABORATION_PUBSUB_WEBHOOK_URL", "SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET", collaborationProvider, "collaboration", "Collaboration pub/sub bridge"),
    ...deploymentWebhookEnv("SENA_DATABASE_SYNC_WEBHOOK_URL", "SENA_DATABASE_SYNC_WEBHOOK_SECRET", databaseSyncProvider, "storage", "Managed database sync bridge"),
    ...deploymentWebhookEnv("SENA_OBJECT_STORAGE_WEBHOOK_URL", "SENA_OBJECT_STORAGE_WEBHOOK_SECRET", objectStorageProvider, "uploads", "Managed upload object-storage bridge"),
    ...deploymentWebhookEnv("SENA_BACKUP_WEBHOOK_URL", "SENA_BACKUP_WEBHOOK_SECRET", backupProvider, "governance", "Managed backup delivery bridge"),
    ...deploymentWebhookEnv("SENA_ALERT_WEBHOOK_URL", "SENA_ALERT_WEBHOOK_SECRET", alertProvider, "ops", "Deployment alert delivery bridge"),
    ...deploymentWebhookEnv("SENA_AUDIT_WEBHOOK_URL", "SENA_AUDIT_WEBHOOK_SECRET", auditProvider, "governance", "Audit/SIEM forwarding bridge"),
    deploymentEnv({
      name: "SENA_OBSERVABILITY_PROVIDER",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: observability.provider !== "not-configured",
      secret: false,
      value: observability.provider,
      purpose: "Request-level SLI/APM provider for production monitoring"
    }),
    deploymentEnv({
      name: "SENA_OBSERVABILITY_EXPORTER_URL",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: Boolean(observability.endpointHash),
      secret: false,
      endpointHash: observability.endpointHash,
      purpose: "External request SLI exporter endpoint; concrete URL is excluded"
    }),
    deploymentEnv({
      name: "SENA_OBSERVABILITY_EXPORTER_SECRET",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: observability.secretConfigured,
      secret: true,
      purpose: "HMAC signing secret for the request SLI exporter"
    }),
    deploymentEnv({
      name: "SENA_OBSERVABILITY_DASHBOARD_URL",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: observability.dashboardConfigured,
      secret: false,
      endpointHash: observability.dashboardUrlHash,
      purpose: "Operational dashboard URL for request p95, error-rate, and slow-route review; concrete URL is excluded"
    }),
    deploymentEnv({
      name: "SENA_OBSERVABILITY_RUNBOOK_URL",
      category: "ops",
      required: fullSaasBackendApproved,
      configured: observability.runbookConfigured,
      secret: false,
      endpointHash: observability.runbookUrlHash,
      purpose: "Incident runbook URL for request SLI breaches; concrete URL is excluded"
    })
  ];

  for (const provider of oidcProviders) {
    const prefix = providerEnvPrefix(provider.provider);
    env.push(
      deploymentEnv({
        name: `${prefix}_CLIENT_ID`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(envValue(`${prefix}_CLIENT_ID`)),
        value: envValue(`${prefix}_CLIENT_ID`),
        purpose: `${provider.provider} OAuth/OIDC client identifier`
      }),
      deploymentEnv({
        name: `${prefix}_CLIENT_SECRET`,
        category: "sso",
        required: false,
        secret: true,
        configured: Boolean(envValue(`${prefix}_CLIENT_SECRET`)),
        purpose: `${provider.provider} OAuth/OIDC client secret`
      }),
      deploymentEnv({
        name: `${prefix}_CLIENT_SECRET_VERSION`,
        category: "sso",
        required: !selfManagedEnterprise && provider.provider === "institution" && process.env.NODE_ENV === "production",
        secret: false,
        configured: Boolean(envValue(`${prefix}_CLIENT_SECRET_VERSION`)),
        value: envValue(`${prefix}_CLIENT_SECRET_VERSION`),
        purpose: `${provider.provider} non-secret OAuth/OIDC client-secret rotation version used to bind institution production evidence`
      }),
      deploymentEnv({
        name: `${prefix}_DISCOVERY_URL`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(provider.discoveryUrl),
        endpointHash: sha256Text(provider.discoveryUrl),
        purpose: `${provider.provider} OAuth/OIDC discovery endpoint`
      }),
      deploymentEnv({
        name: `${prefix}_ISSUER`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(provider.issuer),
        endpointHash: sha256Text(provider.issuer),
        purpose: `${provider.provider} OIDC issuer claim for id_token validation`
      }),
      deploymentEnv({
        name: `${prefix}_JWKS_URL`,
        category: "sso",
        required: false,
        secret: false,
        configured: Boolean(provider.jwksUrl),
        endpointHash: sha256Text(provider.jwksUrl),
        purpose: `${provider.provider} JWKS endpoint for id_token signature validation`
      })
    );
  }

  const requiredEnv = env.filter((entry) => entry.required);
  const missingRequiredEnv = requiredEnv.filter((entry) => entry.status === "review").map((entry) => entry.name);
  const webhookBridgeProviders = [
    webhookProvider,
    emailProvider,
    collaborationProvider,
    databaseSyncProvider,
    objectStorageProvider,
    backupProvider,
    alertProvider,
    auditProvider
  ];
  const keyCheckIds = [
    "auth-session",
    "oauth-oidc-sso",
    "organization-provisioning",
    "persistence",
    "database-sync-bridge",
    "backup-restore-rehearsal",
    "deployment-monitoring",
    "organization-deployment-package",
    "release-gate-review",
    "notification-delivery",
    "institution-email-delivery",
    "audit-log"
  ];
  const keyChecks = keyCheckIds
    .map((id) => governanceCheckById.get(id))
    .filter((check): check is SenaEnterpriseGovernanceCheck => Boolean(check))
    .map((check) => ({
      id: check.id,
      status: check.status,
      evidence: check.evidence,
      nextAction: check.nextAction
    }));
  const oidcGovernance = governanceCheckById.get("oauth-oidc-sso");
  const provisioningGovernance = governanceCheckById.get("organization-provisioning");
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  const latestDecisionAcceptances = latestPlatformDecisionAcceptances(platformDecisionAcceptances);
  const fullSaasDecisionAcceptance = latestDecisionAcceptances.get("full-saas-backend-operations");
  const fullSaasDecisionAccepted = fullSaasDecisionAcceptance?.status === "accepted" && fullSaasDecisionAcceptance.acceptedBridge;
  const platformDecisionAcceptanceSummary = summarizePlatformDecisionAcceptances(platformDecisionAcceptances);
  const decisions = buildEnterpriseOrganizationDeploymentDecisions({
    selfManagedEnterprise,
    postgresConfig,
    primaryStateRuntime: opsStatus.storage.primaryStateRuntime,
    databaseSyncProvider,
    objectStorageProvider,
    objectStorageNativeProvider,
    collaborationProvider,
    backupProvider,
    alertProvider,
    auditProvider,
    emailProvider,
    oidcGovernance,
    provisioningGovernance,
    fullSaasBackendApproved,
    fullSaasDecisionAccepted
  });
  const platformDecisionRegister = buildEnterprisePlatformDecisionRegister(decisions, platformDecisionAcceptances);
  const nativeAdapterCertification = buildEnterpriseNativeAdapterCertification(platformDecisionRegister, platformDecisionAcceptances);
  const openPlatformDecisions = platformDecisionRegister.summary.open;
  const generatedAt = now();
  const identityProductionEvidence = enterpriseReleaseGateIdentityProductionSnapshot({
    generatedAt,
    teamId: input.teamId,
    db,
    platformDecisionRegister,
    platformDecisionAcceptances
  });
  const identityProductionHandoff = buildEnterpriseIdentityProductionEvidenceDossier({
    generatedAt,
    teamId: input.teamId,
    db,
    platformDecisionRegister,
    platformDecisionAcceptances
  });
  const releaseGateReviews = input.teamId
    ? (db.releaseGateReviews ?? []).filter((review) => review.teamId === input.teamId)
    : db.releaseGateReviews ?? [];
  const releaseGate = buildEnterpriseDeploymentReleaseGateEvidence(releaseGateReviews);
  const saasOperationsReadiness = buildEnterpriseSaasOperationsReadiness({
    platformDecisionRegister,
    nativeAdapterCertification,
    releaseGate,
    identityProductionHandoff,
    saasOperatingModelApproved: fullSaasBackendApproved
  });
  const productionEvidenceManifest = buildEnterpriseProductionEvidenceManifest();

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment,
    generatedAt,
    status: readiness.status === "blocked" || missingRequiredEnv.length > 0 || productionEvidenceManifest.status === "blocked"
      ? "blocked"
      : openPlatformDecisions > 0 || readiness.status === "review" || governance.status === "review" || productionEvidenceManifest.status === "review"
        ? "review"
        : "ready",
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true,
      secretHashingDisabled: true
    },
    baseUrl: {
      configured: Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL")),
      origin: baseUrl,
      originHash: sha256Text(baseUrl)!,
      callbackPath: ssoCallbackPath
    },
    environment: {
      nodeEnv: opsStatus.deployment.nodeEnv,
      runtime: "nodejs",
      storageEngine: opsStatus.storage.engine,
      configuredDirectory: opsStatus.storage.configuredDirectory,
      pathHint: opsStatus.storage.pathHint
    },
    access: {
      api: "/api/sena/ops/deployment",
      auth: "ops-bearer-token-or-session",
      opsTokenConfigured: opsStatus.deployment.opsTokenConfigured
    },
    summary: {
      requiredEnv: requiredEnv.length,
      configuredRequiredEnv: requiredEnv.length - missingRequiredEnv.length,
      missingRequiredEnv,
      configuredSecrets: env.filter((entry) => entry.secret && entry.configured).length,
      configuredWebhookBridges: webhookBridgeProviders.filter((provider) => provider.configured && provider.secretConfigured).length,
      openPlatformDecisions,
      acceptedPlatformDecisions: platformDecisionAcceptanceSummary.accepted,
      identityProductionStatus: identityProductionEvidence.status,
      identitySubmissionVerifierIncomplete: identityProductionEvidence.submissionVerifier.incompleteDecisions,
      identityRotationFreshness: identityProductionEvidence.rotationFreshness.status,
      identityEvidenceUrlHostBinding: identityProductionEvidence.evidenceUrlHostBinding.status,
      identityEvidenceAllowedHostConfig: identityProductionEvidence.evidenceUrlHostBinding.allowedHostConfigStatus,
      identityEvidenceAllowedHosts: identityProductionEvidence.evidenceUrlHostBinding.allowedHostCount,
      identityEvidenceInvalidAllowedHosts: identityProductionEvidence.evidenceUrlHostBinding.invalidAllowedHostCount,
      productionEvidenceStatus: productionEvidenceManifest.status,
      productionEvidenceMissingRequired: productionEvidenceManifest.summary.missingRequired,
      blockingReview: readiness.summary.blockingReview,
      advisoryReview: readiness.summary.advisoryReview
    },
    readiness: {
      schemaVersion: readiness.schemaVersion,
      status: readiness.status,
      blockers: readiness.summary.blockers,
      blockingReview: readiness.summary.blockingReview,
      advisoryReview: readiness.summary.advisoryReview
    },
    governance: {
      schemaVersion: governance.schemaVersion,
      status: governance.status,
      checksPass: governance.checks.filter((check) => check.status === "pass").length,
      checksReview: governance.checks.filter((check) => check.status === "review").length,
      keyChecks
    },
    oidc: oidcProviders.map((provider) => ({
      provider: provider.provider,
      mode: provider.mode,
      configured: provider.configured,
      missingEnv: provider.missingEnv
    })),
    env,
    serviceEndpoints: enterpriseOrganizationDeploymentServiceEndpoints,
    platformDecisions: decisions,
    platformDecisionRegister,
    nativeAdapterCertification,
    saasOperationsReadiness,
    productionEvidenceManifest,
    identityProductionEvidence,
    identityProductionHandoff,
    releaseGate,
    verification: {
      commands: readiness.runbook.verificationCommands,
      releaseGate: "npm run sena:pilot:verify"
    }
  };
}

export async function getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence(input: {
  teamId?: string;
  readiness?: SenaEnterpriseDeploymentReadiness;
  opsStatus?: SenaEnterpriseOpsStatus;
  governance?: SenaEnterpriseGovernanceStatus;
  db?: SenaEnterpriseDb;
} = {}): Promise<SenaEnterpriseOrganizationDeploymentPackage> {
  const db = input.db ?? (await readEnterpriseState()).db;
  const opsStatus = input.opsStatus ?? await getEnterpriseOpsStatusWithPostgresEvidence();
  const readiness = input.readiness ?? await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus });
  const governance = input.governance ?? await getEnterpriseGovernanceStatusWithPostgresEvidence({ opsStatus });
  return getEnterpriseOrganizationDeploymentPackage({
    teamId: input.teamId,
    readiness,
    opsStatus,
    governance,
    db
  });
}

export type SenaEnterpriseOrganizationDeploymentPackage = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
    secretHashingDisabled: true;
  };
  baseUrl: {
    configured: boolean;
    origin: string;
    originHash: string;
    callbackPath: string;
  };
  environment: {
    nodeEnv: string;
    runtime: "nodejs";
    storageEngine: SenaEnterpriseStorageEngine;
    configuredDirectory: "default-local" | "env-configured";
    pathHint: string;
  };
  access: {
    api: "/api/sena/ops/deployment";
    auth: "ops-bearer-token-or-session";
    opsTokenConfigured: boolean;
  };
  summary: {
    requiredEnv: number;
    configuredRequiredEnv: number;
    missingRequiredEnv: string[];
    configuredSecrets: number;
    configuredWebhookBridges: number;
    openPlatformDecisions: number;
    acceptedPlatformDecisions: number;
    identityProductionStatus: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"];
    identitySubmissionVerifierIncomplete: number;
    identityRotationFreshness: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["rotationFreshness"]["status"];
    identityEvidenceUrlHostBinding: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["status"];
    identityEvidenceAllowedHostConfig: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["allowedHostConfigStatus"];
    identityEvidenceAllowedHosts: number;
    identityEvidenceInvalidAllowedHosts: number;
    productionEvidenceStatus: SenaEnterpriseProductionEvidenceManifest["status"];
    productionEvidenceMissingRequired: number;
    blockingReview: number;
    advisoryReview: number;
  };
  readiness: {
    schemaVersion: SenaEnterpriseDeploymentReadiness["schemaVersion"];
    status: SenaEnterpriseDeploymentReadiness["status"];
    blockers: string[];
    blockingReview: number;
    advisoryReview: number;
  };
  governance: {
    schemaVersion: SenaEnterpriseGovernanceStatus["schemaVersion"];
    status: SenaEnterpriseGovernanceStatus["status"];
    checksPass: number;
    checksReview: number;
    keyChecks: Array<Pick<SenaEnterpriseGovernanceCheck, "id" | "status" | "evidence" | "nextAction">>;
  };
  oidc: Array<{
    provider: SenaEnterpriseSsoProvider;
    mode: SenaEnterpriseSsoProviderStatus["mode"];
    configured: boolean;
    missingEnv: string[];
  }>;
  env: SenaEnterpriseOrganizationDeploymentEnv[];
  serviceEndpoints: SenaEnterpriseOrganizationDeploymentServiceEndpoint[];
  platformDecisions: SenaEnterpriseOrganizationDeploymentDecision[];
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  nativeAdapterCertification: SenaEnterpriseNativeAdapterCertification;
  saasOperationsReadiness: SenaEnterpriseSaasOperationsReadiness;
  productionEvidenceManifest: SenaEnterpriseProductionEvidenceManifest;
  identityProductionEvidence: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"];
  identityProductionHandoff: SenaEnterpriseIdentityProductionEvidence;
  releaseGate: {
    schemaVersion: SenaEnterpriseReleaseGateReviewList["schemaVersion"];
    generatedAt: string;
    summary: SenaEnterpriseReleaseGateReviewList["summary"];
    latestReview?: {
      schemaVersion: SenaEnterpriseReleaseGateReview["schemaVersion"];
      id: string;
      teamId: string;
      environment: string;
      releaseVersion: string;
      decision: SenaEnterpriseReleaseGateDecision;
      verificationCommand: string;
      verificationEvidence: SenaEnterpriseReleaseVerificationEvidence;
      readinessSnapshot: SenaEnterpriseReleaseGateReview["readinessSnapshot"];
      platformDecisionSnapshot: SenaEnterpriseReleaseGateReview["platformDecisionSnapshot"];
      identityProductionSnapshot?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"];
      approverRole: string;
      updatedAt: string;
    };
    evidence: string[];
  };
  verification: {
    commands: string[];
    releaseGate: "npm run sena:pilot:verify";
  };
};
