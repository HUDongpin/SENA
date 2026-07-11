import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseSsoProvider } from "./auth-sso";
import {
  csrfKeySource,
  mfaKeySource,
  passwordResetTokenExposure,
  provisioningTokenProductionEvidence
} from "./auth-config";
import {
  summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence,
  verifyEnterpriseUploadStorage,
  verifyEnterpriseUploadStorageAsync,
  type SenaEnterpriseUploadStorageVerification,
  type SenaEnterpriseUploadObjectStorageCustodySummary
} from "./import-analysis";
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
  getEnterpriseGovernanceStatus,
  getEnterpriseGovernanceStatusWithPostgresEvidence,
  governanceCheck,
  type SenaEnterpriseGovernanceStatus
} from "./ops-governance";
import {
  isSelfManagedEnterpriseMode,
  selfManagedIdentityEvidence
} from "./ops-platform-decision-policy";
import {
  buildEnterpriseProductionPerformancePath,
  type SenaEnterpriseProductionPerformancePath
} from "./ops-productionization";
import {
  enterpriseDbPath,
  envValue,
  now
} from "./ops-runtime";
import {
  getEnterpriseOpsStatus,
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus,
  type SenaEnterpriseStorageEngine
} from "./ops-status";
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

export function getEnterpriseDeploymentReadiness(input: {
  opsStatus?: SenaEnterpriseOpsStatus;
  governance?: SenaEnterpriseGovernanceStatus;
  uploadStorageVerification?: SenaEnterpriseUploadStorageVerification;
  uploadObjectStorageCustody?: SenaEnterpriseUploadObjectStorageCustodySummary;
} = {}): SenaEnterpriseDeploymentReadiness {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const opsStatus = input.opsStatus ?? getEnterpriseOpsStatus();
  const governance = input.governance ?? getEnterpriseGovernanceStatus({ opsStatus });
  const uploadStorageVerification = input.uploadStorageVerification ?? verifyEnterpriseUploadStorage();
  const webhookProvider = notificationWebhookProvider(enterpriseDbPath, selfManagedEnterprise);
  const emailProvider = emailWebhookProvider(enterpriseDbPath, selfManagedEnterprise);
  const collaborationProvider = collaborationPubSubProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const databaseSyncProvider = databaseSyncWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageProvider = objectStorageWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageNativeProvider = enterpriseObjectStorageNativeProvider();
  const backupProvider = backupWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const alertProvider = alertWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const auditProvider = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const productionPerformancePath = buildEnterpriseProductionPerformancePath({
    opsStatus,
    objectStorageReady: objectStorageNativeProvider.configured || (objectStorageProvider.configured && objectStorageProvider.secretConfigured),
    alertReady: alertProvider.configured && alertProvider.secretConfigured,
    uploadObjectStorageCustody: input.uploadObjectStorageCustody
  });
  const productionPerformancePathRequired = opsStatus.deployment.nodeEnv === "production" || envValue("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH") === "1";
  const productionPerformanceBlockingItems = productionPerformancePathRequired
    ? productionPerformancePath.items
    : [];
  const productionPerformanceAdvisoryItems = productionPerformancePathRequired
    ? []
    : productionPerformancePath.items.map((item) => ({ ...item, severity: "advisory" as const }));
  const configuredOidcProviders = governance.auth.oidcProviders
    .filter((provider) => provider.configured)
    .map((provider) => provider.provider);
  const oidcGovernance = governanceCheck(governance, "oauth-oidc-sso");
  const provisioningTokenEvidence = provisioningTokenProductionEvidence();
  const identityEvidenceHostAllowlist = identityEvidenceAllowedHostConfig();
  const identityEvidenceHostAllowlistConfigured = identityEvidenceHostAllowlist.configured &&
    identityEvidenceHostAllowlist.hosts.length > 0 &&
    identityEvidenceHostAllowlist.invalidCount === 0;
  const identityEvidenceHostAllowlistRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identityEvidenceHostAllowlistReady = !identityEvidenceHostAllowlistRequired || identityEvidenceHostAllowlistConfigured;
  const identityEvidenceHostAllowlistStatus = !identityEvidenceHostAllowlist.configured
    ? "not-configured"
    : identityEvidenceHostAllowlistConfigured
      ? "configured"
      : "invalid";
  const identitySecretVersionBindingRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const ssoClientSecretVersionConfigured = Boolean(envValue("SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION"));
  const provisioningTokenVersionConfigured = Boolean(envValue("SENA_PROVISIONING_TOKEN_VERSION"));
  const identitySecretVersionBindingReady = !identitySecretVersionBindingRequired ||
    (ssoClientSecretVersionConfigured && provisioningTokenVersionConfigured);
  const identitySsoSecretStoreReference = secretStoreReferenceBinding("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF");
  const identityProvisioningSecretStoreReference = secretStoreReferenceBinding("SENA_PROVISIONING_TOKEN_SECRET_REF");
  const identitySecretStoreReferenceRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identitySecretStoreReferenceReady = !identitySecretStoreReferenceRequired ||
    (identitySsoSecretStoreReference.configured && identityProvisioningSecretStoreReference.configured);
  const identitySecretRotationCadence = identitySecretRotationCadenceBinding();
  const identitySecretRotationCadenceRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identitySecretRotationCadenceReady = !identitySecretRotationCadenceRequired || identitySecretRotationCadence.valid;
  const identityIdpTenantBinding = idpTenantBinding();
  const identityIdpTenantBindingRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identityIdpTenantBindingReady = !identityIdpTenantBindingRequired || identityIdpTenantBinding.configured;
  const identityLifecycleOwnerMode = identityLifecycleOwnerModeBinding();
  const identityLifecycleOwnerModeRequired = !selfManagedEnterprise && opsStatus.deployment.nodeEnv === "production";
  const identityLifecycleOwnerModeReady = !identityLifecycleOwnerModeRequired || identityLifecycleOwnerMode.valid;
  const postgresPrimaryActive = opsStatus.storage.primaryStateRuntime.activePrimary === "postgres";
  const primaryStorageReadableReady = postgresPrimaryActive || opsStatus.storage.dbFileExists;
  const primaryStorageLockReady = postgresPrimaryActive || opsStatus.storage.lockProbe === "pass";
  const primaryStorageReady = opsStatus.storage.writable && primaryStorageReadableReady && primaryStorageLockReady;
  const writeBeforeBackupReady = postgresPrimaryActive || opsStatus.storage.dbBackupExists;
  const managedStoragePathReady = postgresPrimaryActive || opsStatus.storage.configuredDirectory === "env-configured";
  const managedDatabaseDecisionReady = postgresPrimaryActive ||
    (databaseSyncProvider.configured && databaseSyncProvider.secretConfigured);

  const blocking: SenaEnterpriseDeploymentReadinessItem[] = [
    readinessItem({
      id: "storage-writable",
      label: "Enterprise primary storage write/read probe",
      severity: "blocking",
      status: primaryStorageReady ? "pass" : "review",
      evidence: [
        `storageEngine=${opsStatus.storage.engine}`,
        `activePrimary=${opsStatus.storage.primaryStateRuntime.activePrimary}`,
        `dbFileExists=${opsStatus.storage.dbFileExists}`,
        `primaryStorageReadable=${primaryStorageReadableReady}`,
        `storageWritable=${opsStatus.storage.writable}`,
        `writeProbe=${opsStatus.storage.writeProbe}`,
        `lockProbe=${opsStatus.storage.lockProbe}`,
        `primaryStorageLockReady=${primaryStorageLockReady}`,
        `lockTimeoutMs=${opsStatus.storage.lockTimeoutMs}`,
        `configuredDirectory=${opsStatus.storage.configuredDirectory}`
      ],
      nextAction: primaryStorageReady
        ? postgresPrimaryActive
          ? "Keep the Postgres primary state runtime readable and writable through deployment monitoring."
          : "Keep the configured enterprise data path on durable, backed-up storage."
        : "Fix enterprise primary storage before accepting production traffic."
    }),
    readinessItem({
      id: "write-before-backup",
      label: "Write-before backup exists",
      severity: "blocking",
      status: writeBeforeBackupReady ? "pass" : "review",
      evidence: [
        `activePrimary=${opsStatus.storage.primaryStateRuntime.activePrimary}`,
        `localWriteBeforeBackupApplicable=${postgresPrimaryActive ? "false" : "true"}`,
        `backupExists=${opsStatus.storage.dbBackupExists}`,
        `backupBytes=${opsStatus.storage.dbBackupBytes}`,
        `backupUpdatedAt=${opsStatus.storage.dbBackupUpdatedAt ?? "missing"}`
      ],
      nextAction: writeBeforeBackupReady
        ? postgresPrimaryActive
          ? "Use managed Postgres backup and restore evidence for production recovery instead of local JSON write-before backup."
          : "Keep the write-before backup as local recovery support in addition to scheduled team backups."
        : "Perform a verified enterprise write after initialization so the local write-before backup is created."
    }),
    readinessItem({
      id: "managed-storage-path",
      label: "Managed enterprise primary storage configured",
      severity: "blocking",
      status: managedStoragePathReady ? "pass" : "review",
      evidence: [
        `storageEngine=${opsStatus.storage.engine}`,
        `activePrimary=${opsStatus.storage.primaryStateRuntime.activePrimary}`,
        `configuredDirectory=${opsStatus.storage.configuredDirectory}`,
        `pathHint=${opsStatus.storage.pathHint}`
      ],
      nextAction: managedStoragePathReady
        ? postgresPrimaryActive
          ? "Document Neon/Postgres backup, retention, and restore policy for production."
          : "Document the backup and retention policy for the configured enterprise directory."
        : "Set SENA_ENTERPRISE_DB_DIR to a managed persistent path before production handoff."
    }),
    readinessItem({
      id: "ops-bearer-token",
      label: "Ops bearer token configured",
      severity: "blocking",
      status: opsStatus.deployment.opsTokenConfigured ? "pass" : "review",
      evidence: [
        `opsToken=${opsStatus.deployment.opsTokenConfigured ? "configured" : "missing"}`,
        "statusApi=/api/sena/ops/status",
        "metricsApi=/api/sena/ops/metrics",
        "readinessApi=/api/sena/ops/readiness"
      ],
      nextAction: opsStatus.deployment.opsTokenConfigured
        ? "Use this token only from deployment monitors and rotate it through the secret store."
        : "Set SENA_OPS_TOKEN before exposing ops endpoints."
    }),
    ...productionPerformanceBlockingItems,
    readinessItem({
      id: "backup-freshness",
      label: "Verified backup freshness",
      severity: "blocking",
      status: opsStatus.backup.status === "fresh" ? "pass" : "review",
      evidence: [
        `backupStatus=${opsStatus.backup.status}`,
        `lastBackupAt=${opsStatus.backup.lastBackupAt ?? "missing"}`,
        `lastVerifiedAt=${opsStatus.backup.lastVerifiedAt ?? "missing"}`,
        `backupAgeSeconds=${opsStatus.backup.backupAgeSeconds ?? "missing"}`
      ],
      nextAction: opsStatus.backup.status === "fresh"
        ? "Keep scheduled backup export, verify, and restore rehearsal active."
        : "Run backup export plus verification before production handoff."
    }),
    readinessItem({
      id: "backup-webhook",
      label: "Managed backup webhook and signing configured",
      severity: "blocking",
      status: backupProvider.configured && backupProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${backupProvider.mode}`,
        ...(backupProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${backupProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${backupProvider.endpointHash ?? "none"}`,
        `secret=${backupProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${backupProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/governance/backup action=deliver"
      ],
      nextAction: backupProvider.configured && backupProvider.secretConfigured
        ? "Keep scheduled signed backup delivery pointed at managed storage or the database bridge."
        : "Set SENA_BACKUP_WEBHOOK_URL and SENA_BACKUP_WEBHOOK_SECRET before production backup handoff is claimed."
    }),
    readinessItem({
      id: "alert-webhook",
      label: "Alert delivery webhook and signing configured",
      severity: "blocking",
      status: alertProvider.configured && alertProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${alertProvider.mode}`,
        ...(alertProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${alertProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${alertProvider.endpointHash ?? "none"}`,
        `secret=${alertProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${alertProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/ops/alerts action=deliver",
        "webhookSchema=sena-enterprise-ops-alert-webhook/v1"
      ],
      nextAction: alertProvider.configured && alertProvider.secretConfigured
        ? "Keep signed ops alerts connected to the deployment incident channel."
        : "Set SENA_ALERT_WEBHOOK_URL and SENA_ALERT_WEBHOOK_SECRET before production alert delivery is claimed."
    }),
    readinessItem({
      id: "database-sync-webhook",
      label: "Managed database sync webhook and signing configured",
      severity: "blocking",
      status: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${databaseSyncProvider.mode}`,
        ...(databaseSyncProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${databaseSyncProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `secret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${databaseSyncProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/governance/backup action=sync-database",
        "webhookSchema=sena-enterprise-database-sync-webhook/v1"
      ],
      nextAction: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
        ? "Keep signed sanitized enterprise-state sync pointed at the managed database adapter."
        : "Set SENA_DATABASE_SYNC_WEBHOOK_URL and SENA_DATABASE_SYNC_WEBHOOK_SECRET before production database mirroring is claimed."
    }),
    readinessItem({
      id: "object-storage-webhook",
      label: "Managed object storage adapter or webhook configured",
      severity: "blocking",
      status: objectStorageNativeProvider.configured || (objectStorageProvider.configured && objectStorageProvider.secretConfigured) ? "pass" : "review",
      evidence: [
        ...objectStorageNativeProvider.evidence,
        `provider=${objectStorageProvider.mode}`,
        ...(objectStorageProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${objectStorageProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `secret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${objectStorageProvider.timeoutMs}`,
        "deliveryApi=POST:/api/sena/uploads action=deliver-object-storage",
        "webhookSchema=sena-enterprise-upload-object-storage-webhook/v1"
      ],
      nextAction: objectStorageNativeProvider.configured
        ? "Keep native object-storage bucket versioning, scan/retention policy, and credential rotation evidence attached."
        : objectStorageProvider.configured && objectStorageProvider.secretConfigured
          ? "Keep signed upload blob delivery pointed at managed object storage or replace the bridge with a native adapter."
          : "Set SENA_OBJECT_STORAGE_ADAPTER plus native object-storage credentials, or configure SENA_OBJECT_STORAGE_WEBHOOK_URL and SENA_OBJECT_STORAGE_WEBHOOK_SECRET before production upload storage handoff is claimed."
    }),
    readinessItem({
      id: "collaboration-pubsub",
      label: "Collaboration pub/sub webhook and signing configured",
      severity: "blocking",
      status: collaborationProvider.configured && collaborationProvider.secretConfigured && opsStatus.queues.collaborationPubSubFailed === 0 ? "pass" : "review",
      evidence: [
        `provider=${collaborationProvider.mode}`,
        ...(collaborationProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${collaborationProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${collaborationProvider.endpointHash ?? "none"}`,
        `secret=${collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `timeoutMs=${collaborationProvider.timeoutMs}`,
        `maxAttempts=${collaborationProvider.maxAttempts}`,
        `pending=${opsStatus.queues.collaborationPubSubPending}`,
        `failed=${opsStatus.queues.collaborationPubSubFailed}`,
        "deliveryApi=POST:/api/sena/projects/:projectId/collaboration action=deliver-pubsub",
        "webhookSchema=sena-enterprise-collaboration-pubsub-webhook/v1"
      ],
      nextAction: collaborationProvider.configured && collaborationProvider.secretConfigured && opsStatus.queues.collaborationPubSubFailed === 0
        ? "Keep signed collaboration events connected to the external pub/sub bus."
        : "Set SENA_COLLABORATION_PUBSUB_WEBHOOK_URL and SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET, then replay failed collaboration events before claiming multi-runtime collaboration delivery."
    }),
    readinessItem({
      id: "oidc-provider",
      label: "OAuth/OIDC provider configured and preflighted",
      severity: "blocking",
      status: selfManagedEnterprise || oidcGovernance?.status === "pass" ? "pass" : "review",
      evidence: selfManagedEnterprise
        ? selfManagedIdentityEvidence(["authMode=local"])
        : oidcGovernance?.evidence ?? governance.auth.oidcProviders.map((provider) => `${provider.provider}=${provider.configured ? "configured" : "missing"};mode=${provider.mode}`),
      nextAction: selfManagedEnterprise
        ? "Keep local auth, session, MFA, and CSRF evidence current for this self-managed deployment."
        : oidcGovernance?.status === "pass"
        ? "Keep IdP tenant redirect URI approval and SSO preflight in deployment release checks."
        : "Configure SENA_SSO_* provider credentials and run /api/auth/sso?status=1&preflight=1 before production SSO is claimed."
    }),
    readinessItem({
      id: "provisioning-token",
      label: "Organization provisioning token configured",
      severity: "blocking",
      status: selfManagedEnterprise || provisioningTokenEvidence.ready ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence(["provisioningMode=manual-local"]) : provisioningTokenEvidence.evidence),
        `provisionedTeams=${opsStatus.counts.provisionedTeams}`,
        `provisionedUsers=${opsStatus.counts.provisionedUsers}`,
        `provisionedMemberships=${opsStatus.counts.provisionedMemberships}`
      ],
      nextAction: selfManagedEnterprise
        ? "Keep manual local membership and RBAC evidence current; SCIM/provisioning token evidence is not required for this self-managed deployment."
        : provisioningTokenEvidence.ready
        ? "Map the provisioning endpoint to the institution IdP or SCIM bridge."
        : provisioningTokenEvidence.present
          ? "Rotate SENA_PROVISIONING_TOKEN to a production secret-store value before institution-managed onboarding."
          : "Set SENA_PROVISIONING_TOKEN before institution-managed onboarding."
    }),
    readinessItem({
      id: "identity-evidence-host-allowlist",
      label: "Identity production evidence host allowlist configured",
      severity: "blocking",
      status: identityEvidenceHostAllowlistReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identityEvidenceHostAllowlistRequired}`,
        `allowlist=${identityEvidenceHostAllowlistStatus}`,
        `allowedHosts=${identityEvidenceHostAllowlist.hosts.length}`,
        `invalidAllowedHosts=${identityEvidenceHostAllowlist.invalidCount}`,
        "evidenceUrlPolicy=sena-enterprise-identity-platform-decision-request-packet/v1"
      ],
      nextAction: identityEvidenceHostAllowlistReady
        ? "Keep SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS aligned with the institution-owned IdP/SCIM evidence system before production evidence acceptance."
        : identityEvidenceHostAllowlist.configured
          ? "Fix SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS so it contains only valid institution-owned evidence hosts before accepting IdP or SCIM production evidence."
          : "Set SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS before accepting institution IdP or SCIM production evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-secret-version-binding",
      label: "Identity secret rotation version bindings configured",
      severity: "blocking",
      status: identitySecretVersionBindingReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identitySecretVersionBindingRequired}`,
        `ssoClientSecretVersion=${ssoClientSecretVersionConfigured ? "configured" : "missing"}`,
        `provisioningTokenVersion=${provisioningTokenVersionConfigured ? "configured" : "missing"}`,
        "secretValues=excluded",
        "versionValues=hashed-in-identity-production-evidence"
      ],
      nextAction: identitySecretVersionBindingReady
        ? "Keep non-secret SSO client-secret and provisioning-token version identifiers aligned with institution rotation evidence."
        : "Set SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION and SENA_PROVISIONING_TOKEN_VERSION before accepting institution secret-rotation production evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-secret-store-reference",
      label: "Identity secret store references configured",
      severity: "blocking",
      status: identitySecretStoreReferenceReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identitySecretStoreReferenceRequired}`,
        `ssoClientSecretRef=${identitySsoSecretStoreReference.configured ? "configured" : "missing"}`,
        `provisioningTokenRef=${identityProvisioningSecretStoreReference.configured ? "configured" : "missing"}`,
        `ssoClientSecretRefHash=${identitySsoSecretStoreReference.referenceHash ? "present" : "missing"}`,
        `provisioningTokenRefHash=${identityProvisioningSecretStoreReference.referenceHash ? "present" : "missing"}`,
        `envs=${identitySsoSecretStoreReference.env}|${identityProvisioningSecretStoreReference.env}`,
        "secretValues=excluded"
      ],
      nextAction: identitySecretStoreReferenceReady
        ? "Keep non-secret secret-store references aligned with institution SSO and provisioning secret custody evidence."
        : "Set SENA_SSO_INSTITUTION_CLIENT_SECRET_REF and SENA_PROVISIONING_TOKEN_SECRET_REF before accepting institution identity secret custody evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-secret-rotation-cadence",
      label: "Identity secret rotation cadence configured",
      severity: "blocking",
      status: identitySecretRotationCadenceReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identitySecretRotationCadenceRequired}`,
        `configured=${identitySecretRotationCadence.configured}`,
        `valid=${identitySecretRotationCadence.valid}`,
        `cadenceDays=${identitySecretRotationCadence.cadenceDays ?? "missing"}`,
        `minDays=${identitySecretRotationCadence.minDays}`,
        `maxDays=${identitySecretRotationCadence.maxDays}`,
        `cadenceHash=${identitySecretRotationCadence.cadenceHash ? "present" : "missing"}`,
        `env=${identitySecretRotationCadence.env}`
      ],
      nextAction: identitySecretRotationCadenceReady
        ? "Keep the identity rotation cadence aligned with institution SSO and bearer-token rotation evidence."
        : "Set SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS to an institution-approved value from 1 to 180 before accepting SSO or bearer-token rotation evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-idp-tenant-binding",
      label: "Institution IdP tenant binding configured",
      severity: "blocking",
      status: identityIdpTenantBindingReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identityIdpTenantBindingRequired}`,
        `tenantBinding=${identityIdpTenantBinding.configured ? "configured" : "missing"}`,
        `tenantHash=${identityIdpTenantBinding.tenantHash ? "present" : "missing"}`,
        `env=${identityIdpTenantBinding.env}`,
        "secretValues=excluded"
      ],
      nextAction: identityIdpTenantBindingReady
        ? "Keep the IdP tenant identifier aligned with institution tenant approval evidence."
        : "Set SENA_SSO_INSTITUTION_TENANT_ID before accepting institution IdP tenant approval evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "identity-lifecycle-owner-mode",
      label: "Identity lifecycle owner mode configured",
      severity: "blocking",
      status: identityLifecycleOwnerModeReady ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `requiredInProduction=${identityLifecycleOwnerModeRequired}`,
        `mode=${identityLifecycleOwnerMode.mode ?? "missing"}`,
        `valid=${identityLifecycleOwnerMode.valid}`,
        `acceptedModes=${identityLifecycleOwnerMode.acceptedModes.join("|")}`,
        `env=${identityLifecycleOwnerMode.env}`
      ],
      nextAction: identityLifecycleOwnerModeReady
        ? "Keep the declared SCIM/IdP lifecycle owner mode aligned with institution provisioning evidence."
        : "Set SENA_IDENTITY_LIFECYCLE_OWNER_MODE to scim, idp, or hybrid before accepting institution SCIM/IdP ownership evidence in NODE_ENV=production."
    }),
    readinessItem({
      id: "notification-webhook",
      label: "Notification webhook and signing configured",
      severity: "blocking",
      status: webhookProvider.configured && webhookProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${webhookProvider.mode}`,
        ...(webhookProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${webhookProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${webhookProvider.endpointHash ?? "none"}`,
        `secret=${webhookProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${opsStatus.queues.notificationsPendingWebhook}`,
        `failed=${opsStatus.queues.notificationsFailedWebhook}`
      ],
      nextAction: webhookProvider.configured && webhookProvider.secretConfigured
        ? "Connect webhook delivery to the approved email/event workflow and alert on failed deliveries."
        : "Set SENA_NOTIFICATION_WEBHOOK_URL and SENA_NOTIFICATION_WEBHOOK_SECRET before relying on external notifications."
    }),
    readinessItem({
      id: "email-webhook",
      label: "Institution email webhook and signing configured",
      severity: "blocking",
      status: emailProvider.configured && emailProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${emailProvider.mode}`,
        ...(emailProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${emailProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${emailProvider.endpointHash ?? "none"}`,
        `secret=${emailProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${opsStatus.queues.emailPendingWebhook}`,
        `failed=${opsStatus.queues.emailFailedWebhook}`
      ],
      nextAction: emailProvider.configured && emailProvider.secretConfigured
        ? "Connect signed password-reset and invitation email delivery to the institution email bridge."
        : "Set SENA_EMAIL_WEBHOOK_URL and SENA_EMAIL_WEBHOOK_SECRET before relying on password reset or invitation email."
    }),
    readinessItem({
      id: "audit-webhook",
      label: "Audit/SIEM webhook and signing configured",
      severity: "blocking",
      status: auditProvider.configured && auditProvider.secretConfigured ? "pass" : "review",
      evidence: [
        `provider=${auditProvider.mode}`,
        ...(auditProvider.mode === "local-sink" ? ["selfManagedSink=local"] : []),
        `webhook=${auditProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${auditProvider.endpointHash ?? "none"}`,
        `secret=${auditProvider.secretConfigured ? "configured" : "missing"}`,
        `pending=${opsStatus.queues.auditPendingWebhook}`,
        `failed=${opsStatus.queues.auditFailedWebhook}`
      ],
      nextAction: auditProvider.configured && auditProvider.secretConfigured
        ? "Connect signed audit forwarding to the institutional SIEM or logging workflow."
        : "Set SENA_AUDIT_WEBHOOK_URL and SENA_AUDIT_WEBHOOK_SECRET before relying on external audit forwarding."
    }),
    readinessFromGovernance(governance, "audit-log", "blocking", "Audit logging", "Enable audit logging before production."),
    readinessFromGovernance(governance, "rbac", "blocking", "RBAC roles and permissions", "Review role permissions before production.")
  ];

  const advisory: SenaEnterpriseDeploymentReadinessItem[] = [
    readinessItem({
      id: "node-env-production",
      label: "Runtime NODE_ENV production",
      severity: "advisory",
      status: opsStatus.deployment.nodeEnv === "production" ? "pass" : "review",
      evidence: [
        `nodeEnv=${opsStatus.deployment.nodeEnv}`,
        `nodeVersion=${opsStatus.deployment.nodeVersion}`,
        `runtime=${opsStatus.deployment.runtime}`
      ],
      nextAction: opsStatus.deployment.nodeEnv === "production"
        ? "Keep production runtime settings pinned in deployment configuration."
        : "Deploy with NODE_ENV=production for institution-facing traffic."
    }),
    readinessItem({
      id: "managed-database-decision",
      label: "Managed database or durable storage decision",
      severity: "advisory",
      status: managedDatabaseDecisionReady ? "pass" : "review",
      evidence: [
        `storageEngine=${opsStatus.storage.engine}`,
        `current=${opsStatus.storage.engine}`,
        `activePrimary=${opsStatus.storage.primaryStateRuntime.activePrimary}`,
        `databaseSyncWebhook=${databaseSyncProvider.configured ? "configured" : "missing"}`,
        `databaseSyncEndpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `databaseSyncSecret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        "bridge=sena-enterprise-database-sync-webhook/v1",
        "decision=managed-db-or-durable-volume-required-before-saas-scale"
      ],
      nextAction: managedDatabaseDecisionReady
        ? postgresPrimaryActive
          ? "Keep Neon/Postgres as the native managed database decision and attach live probe plus backup evidence."
          : "Document whether the signed sanitized-state bridge remains acceptable or replace it with a native managed database adapter before SaaS scale."
        : "Choose a managed database or durable volume strategy before multi-instance SaaS deployment."
    }),
    readinessItem({
      id: "object-storage-decision",
      label: "Managed object storage decision",
      severity: "advisory",
      status: objectStorageNativeProvider.configured || (objectStorageProvider.configured && objectStorageProvider.secretConfigured) ? "pass" : "review",
      evidence: [
        "uploadBlobStorage=private-local-directory",
        ...objectStorageNativeProvider.evidence,
        `objectStorageWebhook=${objectStorageProvider.configured ? "configured" : "missing"}`,
        `objectStorageEndpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `objectStorageSecret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        "bridge=sena-enterprise-upload-object-storage-webhook/v1",
        "scanEngine=sena-local-upload-scan/v1",
        `uploads=${opsStatus.counts.uploads}`,
        `registered=${uploadStorageVerification.summary.registeredUploads}`,
        `verified=${uploadStorageVerification.summary.verifiedBlobs}`,
        `missing=${uploadStorageVerification.summary.missingBlobs}`,
        `corrupt=${uploadStorageVerification.summary.checksumMismatches}`,
        `orphan=${uploadStorageVerification.summary.orphanBlobs}`
      ],
      nextAction: objectStorageNativeProvider.configured
        ? "Document bucket ownership, versioning, retention, malware/DLP scan policy, and restore ownership for the native object-storage adapter."
        : objectStorageProvider.configured && objectStorageProvider.secretConfigured
          ? "Document whether the signed bridge remains acceptable or replace it with a native institution object-storage adapter before SaaS scale."
          : "Move upload blobs to institution-approved object storage and malware/DLP scanning before regulated deployment."
    }),
    readinessItem({
      id: "secret-hardening",
      label: "Security secret hardening",
      severity: "advisory",
      status: mfaKeySource() === "env-configured" && csrfKeySource() !== "local-default-review" && !passwordResetTokenExposure() ? "pass" : "review",
      evidence: [
        `mfaKeySource=${mfaKeySource()}`,
        `csrfKeySource=${csrfKeySource()}`,
        `passwordResetDelivery=${passwordResetTokenExposure() ? "local-token" : "email-provider-required"}`,
        `activePasswordResetRequests=${opsStatus.queues.activePasswordResetRequests}`,
        `activeAuthLockouts=${opsStatus.queues.activeAuthLockouts}`,
        `activeApiRateLimitBuckets=${opsStatus.queues.activeApiRateLimitBuckets}`
      ],
      nextAction: mfaKeySource() === "env-configured" && csrfKeySource() !== "local-default-review" && !passwordResetTokenExposure()
        ? "Keep auth secrets in the deployment secret store and rotate on schedule."
        : "Set SENA_MFA_ENCRYPTION_KEY plus SENA_CSRF_SECRET or SENA_SESSION_SECRET, and keep local reset-token exposure disabled."
    }),
    readinessFromGovernance(governance, "reliability-run-history", "advisory", "Reliability run history", "Run coding reliability workflow before publication claims."),
    readinessFromGovernance(governance, "validation-run-history", "advisory", "Validation run history", "Run validation workflow before publication claims."),
    readinessFromGovernance(governance, "domain-expert-review", "advisory", "Domain expert review", "Record domain expert review before publication claims."),
    readinessFromGovernance(governance, "deployment-monitoring", "advisory", "Deployment monitoring", "Connect deployment monitoring before handoff."),
    readinessFromGovernance(governance, "organization-deployment-package", "advisory", "Organization deployment package", "Generate redacted deployment evidence before platform handoff."),
    readinessFromGovernance(governance, "backup-restore-rehearsal", "advisory", "Backup restore rehearsal", "Run restore rehearsal before handoff."),
    ...productionPerformanceAdvisoryItems
  ];

  const blockingPass = blocking.filter((item) => item.status === "pass").length;
  const blockingReview = blocking.length - blockingPass;
  const advisoryPass = advisory.filter((item) => item.status === "pass").length;
  const advisoryReview = advisory.length - advisoryPass;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDeploymentReadiness,
    status: blockingReview > 0 ? "blocked" : advisoryReview > 0 ? "review" : "ready",
    generatedAt: now(),
    environment: {
      nodeEnv: opsStatus.deployment.nodeEnv,
      runtime: "nodejs",
      storageEngine: opsStatus.storage.engine,
      configuredDirectory: opsStatus.storage.configuredDirectory,
      opsTokenConfigured: opsStatus.deployment.opsTokenConfigured,
      provisioningTokenConfigured: opsStatus.deployment.provisioningTokenConfigured,
      notificationWebhookConfigured: webhookProvider.configured,
      emailWebhookConfigured: emailProvider.configured,
      collaborationPubSubWebhookConfigured: collaborationProvider.configured,
      databaseSyncWebhookConfigured: databaseSyncProvider.configured,
      objectStorageWebhookConfigured: objectStorageProvider.configured,
      backupWebhookConfigured: backupProvider.configured,
      alertWebhookConfigured: alertProvider.configured,
      auditWebhookConfigured: auditProvider.configured,
      oidcProvidersConfigured: configuredOidcProviders,
      productionPerformancePathRequired,
      productionPerformancePathStatus: productionPerformancePath.status
    },
    summary: {
      blockingPass,
      blockingReview,
      advisoryPass,
      advisoryReview,
      blockers: blocking.filter((item) => item.status === "review").map((item) => item.id)
    },
    blocking,
    advisory,
    productionPerformancePath,
    runbook: {
      requiredBeforeProduction: blocking.map((item) => item.nextAction),
      platformDecisions: [
        "Do not treat .sena-enterprise/enterprise-db.json as a multi-user production state store; configure native Postgres or keep the deployment explicitly scoped to research-pilot traffic.",
        "Choose managed database or durable volume ownership for enterprise JSON state, using the signed database sync bridge only when accepted by the platform owner.",
        "Connect signed collaboration pub/sub delivery to the selected external event bus and decide whether to replace the webhook bridge with a native bus adapter before SaaS scale.",
        "Connect signed team backup delivery to managed storage or the database bridge.",
        "Connect signed upload blob delivery to managed object storage, then decide whether to replace the bridge with a native adapter.",
        "Configure CDN gzip/brotli compression, immutable static asset caching, and a managed server job queue before conference-scale interactive workloads.",
        "Connect signed ops alert delivery to the deployment incident channel and alerting escalation policy.",
        "Finalize IdP tenant approval, redirect URI ownership, and secret rotation.",
        "Finalize institution email-provider credentials, delivery retention, and replay ownership.",
        "Connect audit/ops metrics to the deployment monitor and alerting policy.",
        "Document notification/email provider retention policy and operational owner."
      ],
      platformDecisionRegister: "sena-enterprise-platform-decision-register/v1",
      verificationCommands: [
        "npx tsc --noEmit",
        "npm test",
        "npm run build",
        "npm run sena:pilot:verify"
      ]
    }
  };
}

export async function getEnterpriseDeploymentReadinessWithPostgresEvidence(input: {
  opsStatus?: SenaEnterpriseOpsStatus;
} = {}): Promise<SenaEnterpriseDeploymentReadiness> {
  const opsStatus = input.opsStatus ?? await getEnterpriseOpsStatusWithPostgresEvidence();
  const uploadStorageVerification = await verifyEnterpriseUploadStorageAsync();
  const uploadObjectStorageCustody = await summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence();
  const governance = await getEnterpriseGovernanceStatusWithPostgresEvidence({
    opsStatus,
    uploadStorageVerification,
    uploadObjectStorageCustody
  });
  return getEnterpriseDeploymentReadiness({
    opsStatus,
    governance,
    uploadStorageVerification,
    uploadObjectStorageCustody
  });
}

export type SenaEnterpriseDeploymentReadinessItem = {
  id: string;
  label: string;
  severity: "blocking" | "advisory";
  status: "pass" | "review";
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseDeploymentReadiness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseDeploymentReadiness;
  status: "ready" | "review" | "blocked";
  generatedAt: string;
  environment: {
    nodeEnv: string;
    runtime: "nodejs";
    storageEngine: SenaEnterpriseStorageEngine;
    configuredDirectory: "default-local" | "env-configured";
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
    oidcProvidersConfigured: SenaEnterpriseSsoProvider[];
    productionPerformancePathRequired: boolean;
    productionPerformancePathStatus: "pass" | "review";
  };
  summary: {
    blockingPass: number;
    blockingReview: number;
    advisoryPass: number;
    advisoryReview: number;
    blockers: string[];
  };
  blocking: SenaEnterpriseDeploymentReadinessItem[];
  advisory: SenaEnterpriseDeploymentReadinessItem[];
  productionPerformancePath: SenaEnterpriseProductionPerformancePath;
  runbook: {
    requiredBeforeProduction: string[];
    platformDecisions: string[];
    platformDecisionRegister: "sena-enterprise-platform-decision-register/v1";
    verificationCommands: string[];
  };
};

export function readinessItem(input: SenaEnterpriseDeploymentReadinessItem): SenaEnterpriseDeploymentReadinessItem {
  return input;
}

export function readinessFromGovernance(
  status: SenaEnterpriseGovernanceStatus,
  id: string,
  severity: SenaEnterpriseDeploymentReadinessItem["severity"],
  fallbackLabel: string,
  fallbackAction: string
) {
  const check = governanceCheck(status, id);
  return readinessItem({
    id,
    label: check?.label ?? fallbackLabel,
    severity,
    status: check?.status ?? "review",
    evidence: check?.evidence ?? ["governanceCheck=missing"],
    nextAction: check?.nextAction ?? fallbackAction
  });
}
