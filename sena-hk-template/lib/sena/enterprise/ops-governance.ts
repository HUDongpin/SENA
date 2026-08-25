import {
  resolveEnterprisePostgresConfig,
  type SenaEnterprisePostgresConfig
} from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaEnterpriseUploadMaxBytes } from "./upload-limits";
import {
  alertingChannel,
  alertingOwner,
  alertingRunbookUrl,
  getEnterpriseOpsAlerts,
  type SenaEnterpriseOpsAlerts
} from "./ops-alerts";
import {
  appendAudit,
  auditStoreRuntime,
  auditRetentionWindowDays,
  latestAuditAt,
  verifyEnterpriseAuditIntegrity,
  verifyEnterpriseAuditIntegrityAsync,
  type SenaEnterpriseAuditIntegrity
} from "./ops-audit";
import {
  buildEnterprisePlatformDecisionRegister,
  latestPlatformDecisionAcceptances,
  missingPlatformDecisionProductionEvidence,
  platformDecisionProductionEvidenceReceipt,
  summarizePlatformDecisionAcceptances,
  type SenaEnterprisePlatformDecisionAcceptance,
  type SenaEnterprisePlatformDecisionRegister
} from "./ops-platform-decisions";
import {
  buildEnterpriseNativeAdapterCertification,
  type SenaEnterpriseNativeAdapterCertification
} from "./ops-platform-adapter-certification";
import {
  isSelfManagedEnterpriseMode,
  selfManagedIdentityEvidence,
  type SenaEnterprisePlatformDecisionEvidenceChecklistItem,
  type SenaEnterprisePlatformDecisionEvidenceChecklistStatus
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
  enterprisePostgresPublicEvidence,
  getEnterpriseOpsStatus,
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus,
  type SenaEnterprisePostgresStorageEvidence,
  type SenaEnterpriseStorageEngine
} from "./ops-status";
import {
  enterpriseAnalysisRunRegistryRuntime,
  enterpriseImportRunRegistryRuntime,
  enterpriseUploadRegistryRuntime,
  summarizeEnterpriseUploadObjectStorageCustody,
  summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence,
  verifyEnterpriseUploadStorage,
  verifyEnterpriseUploadStorageAsync,
  type SenaEnterpriseUploadObjectStorageCustodySummary,
  type SenaEnterpriseUploadStorageVerification
} from "./import-analysis";
import { enterpriseReliabilityRunRegistryRuntime } from "./reliability-runs";
import { enterpriseValidationRunRegistryRuntime } from "./validation-runs";
import { enterpriseExpertReviewRegistryRuntime } from "./expert-review";
import type { SenaEnterpriseProject } from "./team-project";
import {
  hasEnterprisePermission,
  requireEnterprisePermission,
  rolePermissions,
  type SenaEnterprisePermission,
  type SenaEnterpriseRole
} from "./access-control";
import type {
  SenaEnterpriseSsoProvider,
  SenaEnterpriseSsoProviderStatus
} from "./auth-sso";
import {
  senaCsrfHeaderName,
  senaSessionCookieName,
  type SenaEnterpriseSessionContext
} from "./auth-session";
import {
  csrfKeySource,
  mfaKeySource,
  passwordResetTokenExposure,
  provisioningTokenProductionEvidence
} from "./auth-config";
import {
  isAuthLockoutActive,
  pruneApiRateLimits
} from "./auth-security";
import {
  enterpriseLocalSsoFallbackPolicy,
  getEnterpriseSsoProviderStatuses,
  providerEnvPrefix,
  ssoCallbackPath,
  ssoPreflightEvidence,
  ssoPreflightPassedProviders,
  ssoProviders
} from "./auth-sso";
import {
  enterprisePasswordPolicy,
  passwordPolicyEvidence
} from "./auth-password";
import type {
  SenaEnterpriseDb,
  SenaEnterprisePrimaryStateRuntime,
  SenaEnterpriseTeam,
  SenaEnterpriseUser,
  SenaFileEnterpriseStateStore
} from "./state";
import {
  createConfiguredFileEnterpriseStateStore,
  readEnterpriseState,
  readEnterpriseDb,
  saveDb,
  writeEnterpriseDb
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
  auditRetentionMaxEvents,
  authEmailDomain,
  authEmailHash,
  artifactSha256,
  dbLockTimeoutMs,
  enterpriseDbPath,
  enterpriseDbPathHint,
  envValue,
  normalizedBaseUrl,
  now,
  positiveIntegerEnv,
  sha256Text
} from "./ops-runtime";
import {
  enterpriseObjectStorageNativeProvider
} from "./object-storage-adapter";

export function getEnterpriseGovernanceStatus(input: {
  db?: SenaEnterpriseDb;
  opsStatus?: SenaEnterpriseOpsStatus;
  auditIntegrity?: SenaEnterpriseAuditIntegrity;
  uploadStorageVerification?: SenaEnterpriseUploadStorageVerification;
  uploadObjectStorageCustody?: SenaEnterpriseUploadObjectStorageCustodySummary;
} = {}): SenaEnterpriseGovernanceStatus {
  const db = input.db ?? readEnterpriseDb();
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const configuredDirectory = process.env.SENA_ENTERPRISE_DB_DIR ? "env-configured" : "default-local";
  const postgresConfig = resolveEnterprisePostgresConfig();
  const opsStatus = input.opsStatus ?? getEnterpriseOpsStatus({ db });
  const storageEngine = opsStatus.storage.engine;
  const postgresStorage = opsStatus.storage.postgres;
  const primaryStateRuntime = opsStatus.storage.primaryStateRuntime;
  const permissions = Array.from(new Set(Object.values(rolePermissions).flat())).sort();
  const oidcProviders = getEnterpriseSsoProviderStatuses();
  const configuredOidcProviders = oidcProviders.filter((provider) => provider.configured);
  const ssoFallbackPolicy = enterpriseLocalSsoFallbackPolicy();
  const ssoPreflightPassed = ssoPreflightPassedProviders(db, oidcProviders);
  const ssoPreflightPassedProviderIds = new Set(ssoPreflightPassed.map((provider) => provider.provider));
  const ssoPreflightMissingConfiguredProviders = configuredOidcProviders
    .filter((provider) => !ssoPreflightPassedProviderIds.has(provider.provider));
  const ssoPreflightPassEvents = db.auditLog.filter((entry) => entry.event === "auth.sso.preflight.pass");
  const ssoPreflightFailEvents = db.auditLog.filter((entry) => entry.event === "auth.sso.preflight.fail");
  const backupEvents = db.auditLog.filter((entry) => entry.event === "governance.backup");
  const backupVerifyEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.verify");
  const backupDeliverEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.deliver");
  const backupDeliverFailEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.deliver.fail");
  const databaseSyncDeliverEvents = db.auditLog.filter((entry) => entry.event === "governance.database_sync.deliver");
  const databaseSyncFailEvents = db.auditLog.filter((entry) => entry.event === "governance.database_sync.fail");
  const alertDeliverEvents = db.auditLog.filter((entry) => entry.event === "ops.alert.deliver");
  const alertDeliverFailEvents = db.auditLog.filter((entry) => entry.event === "ops.alert.deliver.fail");
  const platformDecisionReviewEvents = db.auditLog.filter((entry) => entry.event === "ops.platform_decision.review");
  const releaseGateReviewEvents = db.auditLog.filter((entry) => entry.event === "ops.release_gate.review");
  const backupRestoreEvents = db.auditLog.filter((entry) => entry.event === "governance.backup.restore");
  const uploadObjectStorageDeliverEvents = db.auditLog.filter((entry) => entry.event === "upload.object_storage.deliver");
  const uploadObjectStorageFailEvents = db.auditLog.filter((entry) => entry.event === "upload.object_storage.fail");
  const collaborationPubSubDeliverEvents = db.auditLog.filter((entry) => entry.event === "collaboration.pubsub.deliver");
  const collaborationPubSubFailEvents = db.auditLog.filter((entry) => entry.event === "collaboration.pubsub.fail");
  const membershipLifecycleEvents = db.auditLog.filter((entry) => entry.event === "team.membership.update");
  const acceptedInvitationEvents = db.auditLog.filter((entry) => entry.event === "team.invite.accept");
  const provisioningEvents = db.auditLog.filter((entry) => entry.event === "provisioning.sync");
  const provisionedTeams = db.teams.filter((team) => team.provisioning).length;
  const provisionedUsers = db.users.filter((user) => user.provisioning).length;
  const provisionedMemberships = db.memberships.filter((membership) => membership.provisioning).length;
  const revokedInvitationEvents = db.auditLog.filter((entry) => entry.event === "team.invite.revoke");
  const failedLoginEvents = db.auditLog.filter((entry) => entry.event === "auth.login.failed");
  const lockedLoginEvents = db.auditLog.filter((entry) => entry.event === "auth.login.locked");
  const sessionRevocationEvents = db.auditLog.filter((entry) => entry.event === "auth.session.revoke");
  const csrfFailEvents = db.auditLog.filter((entry) => entry.event === "security.csrf.fail");
  const activeAuthLockouts = (db.authLockouts ?? []).filter((lockout) => isAuthLockoutActive(lockout)).length;
  const activeApiRateLimits = pruneApiRateLimits(db);
  const rateLimitEvents = db.auditLog.filter((entry) => entry.event === "security.rate_limit");
  const enabledMfaUsers = new Set((db.mfaFactors ?? []).filter((factor) => !factor.disabledAt).map((factor) => factor.userId)).size;
  const mfaChallengeEvents = db.auditLog.filter((entry) => entry.event === "auth.mfa.challenge");
  const mfaVerifyEvents = db.auditLog.filter((entry) => entry.event === "auth.mfa.verify");
  const activePasswordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => !request.usedAt && Date.parse(request.expiresAt) > Date.now()).length;
  const passwordResetRequestEvents = db.auditLog.filter((entry) => entry.event === "auth.password_reset.request");
  const passwordResetCompleteEvents = db.auditLog.filter((entry) => entry.event === "auth.password_reset.complete");
  const notificationEvents = db.auditLog.filter((entry) => entry.event === "notification.queue");
  const notificationReadEvents = db.auditLog.filter((entry) => entry.event === "notification.read");
  const notificationWebhookDeliverEvents = db.auditLog.filter((entry) => entry.event === "notification.webhook.deliver");
  const notificationWebhookFailEvents = db.auditLog.filter((entry) => entry.event === "notification.webhook.fail");
  const emailQueueEvents = db.auditLog.filter((entry) => entry.event === "email.queue");
  const emailWebhookDeliverEvents = db.auditLog.filter((entry) => entry.event === "email.webhook.deliver");
  const emailWebhookFailEvents = db.auditLog.filter((entry) => entry.event === "email.webhook.fail");
  const unreadNotifications = db.notifications.filter((notification) => notification.status !== "read").length;
  const webhookProvider = notificationWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageProvider = objectStorageWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageNativeProvider = enterpriseObjectStorageNativeProvider();
  const backupProvider = backupWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const databaseSyncProvider = databaseSyncWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const collaborationProvider = collaborationPubSubProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const collaborationPubSubQueuedEvents = (db.collaborationEvents ?? []).length;
  const collaborationPubSubPending = (db.collaborationEvents ?? []).filter((event) => event.delivery.status === "pending").length;
  const collaborationPubSubDelivered = (db.collaborationEvents ?? []).filter((event) => event.delivery.status === "delivered").length;
  const collaborationPubSubFailed = (db.collaborationEvents ?? []).filter((event) => event.delivery.status === "failed").length;
  const webhookPendingNotifications = db.notifications.filter((notification) => notification.webhookDelivery?.status === "pending").length;
  const webhookDeliveredNotifications = db.notifications.filter((notification) => notification.webhookDelivery?.status === "delivered").length;
  const webhookFailedNotifications = db.notifications.filter((notification) => notification.webhookDelivery?.status === "failed").length;
  const emailProvider = emailWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const emailPendingDeliveries = (db.emailDeliveries ?? []).filter((delivery) => delivery.status === "pending").length;
  const emailDeliveredDeliveries = (db.emailDeliveries ?? []).filter((delivery) => delivery.status === "delivered").length;
  const emailFailedDeliveries = (db.emailDeliveries ?? []).filter((delivery) => delivery.status === "failed").length;
  const auditProvider = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const auditRuntime = auditStoreRuntime();
  const provisioningTokenEvidence = provisioningTokenProductionEvidence();
  const auditWebhookPendingEvents = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "pending").length;
  const auditWebhookDeliveredEvents = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "delivered").length;
  const auditWebhookFailedEvents = db.auditLog.filter((entry) => entry.webhookDelivery?.status === "failed").length;
  const auditIntegrity = input.auditIntegrity ?? verifyEnterpriseAuditIntegrity();
  const uploadStorageVerification = input.uploadStorageVerification ?? verifyEnterpriseUploadStorage();
  const uploadObjectStorageCustody = input.uploadObjectStorageCustody ?? summarizeEnterpriseUploadObjectStorageCustody();
  const uploadRegistryRuntime = enterpriseUploadRegistryRuntime();
  const importRunRegistryRuntime = enterpriseImportRunRegistryRuntime();
  const analysisRunRegistryRuntime = enterpriseAnalysisRunRegistryRuntime();
  const reliabilityRunRegistryRuntime = enterpriseReliabilityRunRegistryRuntime();
  const validationRunRegistryRuntime = enterpriseValidationRunRegistryRuntime();
  const expertReviewRegistryRuntime = enterpriseExpertReviewRegistryRuntime();
  const alertProvider = alertWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const configuredAlertingOwner = alertingOwner();
  const configuredAlertingRunbookUrl = alertingRunbookUrl();
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "auth-session",
      label: "Authentication and session policy",
      status: "pass",
      evidence: [
        "passwordHash=pbkdf2-sha256",
        `sessionCookie=${senaSessionCookieName}`,
        `sessionDays=${sessionDays}`,
        `rememberedSessionDays=${rememberedSessionDays}`,
        "sessionProfiles=standard|remembered",
        `activeSessions=${db.sessions.length}`,
        "sessionLifecycleApi=/api/auth/sessions",
        "sessionLifecycleSchema=sena-enterprise-session-list/v1|sena-enterprise-session-revocation/v1",
        `sessionRevocationEvents=${sessionRevocationEvents.length}`,
        `csrf=header:${senaCsrfHeaderName}/keySource:${csrfKeySource()}`,
        "csrfCoverage=session-mutating-api",
        "csrfTokenApi=/api/auth/csrf",
        `csrfFailEvents=${csrfFailEvents.length}`,
        `loginLockout=maxFailures:${authLockoutMaxFailures}/windowMinutes:${authLockoutWindowMinutes}/lockoutMinutes:${authLockoutMinutes}`,
        `activeLockouts=${activeAuthLockouts}`,
        `failedLoginEvents=${failedLoginEvents.length}`,
        `lockedLoginEvents=${lockedLoginEvents.length}`,
        `rateLimit=auth:${authApiRateLimitMaxRequests}/${authApiRateLimitWindowSeconds}s,passwordReset:${passwordResetRateLimitMaxRequests}/${passwordResetRateLimitWindowSeconds}s,sso:${ssoRateLimitMaxRequests}/${ssoRateLimitWindowSeconds}s`,
        `activeRateLimitBuckets=${activeApiRateLimits.length}`,
        `rateLimitEvents=${rateLimitEvents.length}`,
        `mfa=totp/enabledUsers:${enabledMfaUsers}/challengeMinutes:${mfaChallengeMinutes}/setupMinutes:${mfaSetupMinutes}`,
        `mfaSecretStorage=aes-256-gcm/keySource:${mfaKeySource()}`,
        `mfaChallengeEvents=${mfaChallengeEvents.length}`,
        `mfaVerifyEvents=${mfaVerifyEvents.length}`,
        `passwordReset=minutes:${passwordResetMinutes}/activeRequests:${activePasswordResetRequests}/delivery:${passwordResetTokenExposure() ? "local-token" : emailProvider.configured ? "email-webhook" : "email-provider-required"}`,
        `passwordPolicy=${passwordPolicyEvidence()}`,
        `passwordResetRequestEvents=${passwordResetRequestEvents.length}`,
        `passwordResetCompleteEvents=${passwordResetCompleteEvents.length}`,
        "ssoModes=institution|google|orcid"
      ],
      nextAction: "Keep password policy, session TTL, and cookie settings aligned with the institution's security review."
    },
    {
      id: "oauth-oidc-sso",
      label: "OAuth/OIDC SSO provider configuration and preflight",
      status: selfManagedEnterprise || configuredOidcProviders.length > 0 && ssoPreflightMissingConfiguredProviders.length === 0 ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence() : []),
        ...oidcProviders.map((provider) => (
          `${provider.provider}=${provider.mode};missing=${provider.missingEnv.join("|") || "none"};clientSecretStrength=${provider.clientSecretStrength};endpointHostPolicy=${provider.endpointHostPolicy}`
        )),
        ...ssoPreflightEvidence(db, oidcProviders),
        `preflightPassEvents=${ssoPreflightPassEvents.length}`,
        `preflightFailEvents=${ssoPreflightFailEvents.length}`,
        "preflightApi=/api/auth/sso?status=1&preflight=1",
        "preflightSchema=sena-enterprise-sso-preflight/v1",
        "pkce=S256",
        "state=hashed-server-side",
        "nonce=state-bound",
        "idTokenNonce=validated-when-present",
        "idTokenSignature=jwks",
        "idTokenClaims=issuer|audience|nonce|exp|iat",
        `localFallback=${ssoFallbackPolicy.enabled ? "enabled" : "disabled"}`,
        `fallbackPolicy=${ssoFallbackPolicy.schemaVersion}`,
        `fallbackProductionRuntime=${ssoFallbackPolicy.productionRuntime ? "yes" : "no"}`,
        `fallbackOverride=${ssoFallbackPolicy.explicitOverride ? "enabled" : "disabled"}`,
        `preflightPassedProviders=${ssoPreflightPassed.map((provider) => provider.provider).join("|") || "none"}`,
        `preflightMissingProviders=${ssoPreflightMissingConfiguredProviders.map((provider) => provider.provider).join("|") || "none"}`
      ],
      nextAction: selfManagedEnterprise
        ? "Keep local auth, session, MFA, and CSRF evidence current for this self-managed deployment."
        : configuredOidcProviders.length > 0 && ssoPreflightMissingConfiguredProviders.length === 0
        ? "Complete provider-side redirect URI approval, keep preflight in release checks, and rotate client secrets through the deployment secret store."
        : configuredOidcProviders.length > 0
          ? "Run SSO preflight for every configured OAuth/OIDC provider before production SSO is claimed."
          : "Configure at least one SENA_SSO_* OAuth/OIDC provider and run SSO preflight before production SSO is claimed."
    },
    {
      id: "security-response-headers",
      label: "Browser security response headers",
      status: "pass",
      evidence: [
        "middleware=next",
        "header=x-content-type-options:nosniff",
        "header=x-frame-options:DENY",
        "header=referrer-policy:strict-origin-when-cross-origin",
        "header=permissions-policy:camera=(), microphone=(), geolocation=(), payment=()",
        "header=strict-transport-security:max-age=63072000; includeSubDomains; preload",
        "header=cross-origin-opener-policy:same-origin",
        "header=cross-origin-resource-policy:same-origin",
        "header=content-security-policy-report-only",
        "cspMode=report-only",
        "cspDirectives=default-src 'self'|frame-ancestors 'none'|object-src 'none'|upgrade-insecure-requests",
        "apiCacheControl=no-store"
      ],
      nextAction: "Review CSP violation reports, then move to enforcing Content-Security-Policy when all institution integrations are allow-listed."
    },
    {
      id: "rbac",
      label: "RBAC roles and permissions",
      status: "pass",
      evidence: Object.entries(rolePermissions).map(([role, rolePerms]) => `${role}=${rolePerms.join("|")}`),
      nextAction: "Review role matrix with the research governance owner before onboarding external labs."
    },
    {
      id: "team-lifecycle-governance",
      label: "Team membership and invitation lifecycle",
      status: "pass",
      evidence: [
        `activeMemberships=${db.memberships.filter((membership) => membership.status === "active").length}`,
        `suspendedMemberships=${db.memberships.filter((membership) => membership.status === "suspended").length}`,
        `pendingInvitations=${db.invitations.filter((invitation) => invitation.status === "pending").length}`,
        `acceptedInvitations=${db.invitations.filter((invitation) => invitation.status === "accepted").length}`,
        `revokedInvitations=${db.invitations.filter((invitation) => invitation.status === "revoked").length}`,
        `invitationAcceptances=${acceptedInvitationEvents.length}`,
        `membershipUpdates=${membershipLifecycleEvents.length}`,
        `invitationRevocations=${revokedInvitationEvents.length}`,
        "guardrail=last-active-team-manager-required"
      ],
      nextAction: "Connect lifecycle events to institution notifications and review SCIM/IdP provisioning ownership before organization-wide rollout."
    },
    {
      id: "organization-provisioning",
      label: "Organization provisioning and IdP sync",
      status: selfManagedEnterprise || provisioningTokenEvidence.ready ? "pass" : "review",
      evidence: [
        ...(selfManagedEnterprise ? selfManagedIdentityEvidence(["provisioningMode=manual-local"]) : []),
        "schema=sena-enterprise-provisioning/v1",
        "api=/api/sena/provisioning",
        "scimApi=/api/sena/scim/v2",
        "scimSchemas=User|Group|EnterpriseUser|SENAUser|SENAGroup",
        "auth=bearer-token-hash-compare",
        "supports=teams|users|sso-identities|memberships|dry-run|scim-users|scim-groups",
        "guardrail=last-active-team-manager-required",
        "token=redacted",
        ...provisioningTokenEvidence.evidence,
        `provisionedTeams=${provisionedTeams}`,
        `provisionedUsers=${provisionedUsers}`,
        `provisionedMemberships=${provisionedMemberships}`,
        `syncEvents=${provisioningEvents.length}`
      ],
      nextAction: selfManagedEnterprise
        ? "Keep manual local membership and RBAC evidence current; SCIM provisioning is not required for this self-managed deployment."
        : provisioningTokenEvidence.ready
        ? "Map this endpoint to the institution IdP or SCIM bridge and document ownership for user lifecycle changes."
        : provisioningTokenEvidence.present
          ? "Rotate SENA_PROVISIONING_TOKEN to a production secret-store value before claiming institution-managed provisioning."
          : "Set SENA_PROVISIONING_TOKEN before claiming institution-managed provisioning."
    },
    {
      id: "persistence",
      label: "Project persistence",
      status: primaryStateRuntime.activePrimary === "postgres" || configuredDirectory === "env-configured" ? "pass" : "review",
      evidence: [
        `engine=${storageEngine}`,
        `stateStore=${primaryStateRuntime.mode}`,
        `activePrimary=${primaryStateRuntime.activePrimary}`,
        `postgresPrimaryRequested=${primaryStateRuntime.postgresPrimaryRequested}`,
        `configuredDirectory=${configuredDirectory}`,
        ...(postgresConfig.adapterRequested ? enterprisePostgresPublicEvidence(postgresConfig) : []),
        `projects=${db.projects.length}`,
        `revisions=${db.projectRevisions.length}`,
        "optimisticConcurrency=currentVersion/expectedVersion",
        "conflictStatus=409:project_version_conflict",
        "revisionRestore=append-only",
        `revisionRestoreEvents=${db.auditLog.filter((entry) => entry.event === "project.restore").length}`
      ],
      nextAction: primaryStateRuntime.activePrimary === "postgres"
        ? "Keep Neon/Postgres backup, branching, and restore drills in release verification."
        : postgresConfig.configured
          ? "Set SENA_ENTERPRISE_STATE_STORE=postgres before treating the configured Postgres adapter as the primary project state store."
          : configuredDirectory === "env-configured"
            ? "Back up the configured enterprise data directory and set retention policy."
            : "Set SENA_ENTERPRISE_DB_DIR to a managed, backed-up path or replace the adapter with a managed database before production."
    },
    {
      id: "database-sync-bridge",
      label: "Managed database sync bridge",
      status: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-database-sync/v1",
        "webhookSchema=sena-enterprise-database-sync-webhook/v1",
        "api=/api/sena/governance/backup",
        "deliveryApi=POST:/api/sena/governance/backup action=sync-database",
        "syncKind=sanitized-enterprise-state",
        "preflight=backup-checksum|backup-record-counts|backup-secret-exclusions",
        "sourceStorage=file-backed-json",
        `webhookProvider=${databaseSyncProvider.mode}`,
        `webhookEndpointHash=${databaseSyncProvider.endpointHash ?? "none"}`,
        `webhookSecret=${databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookTimeoutMs=${databaseSyncProvider.timeoutMs}`,
        `deliverEvents=${databaseSyncDeliverEvents.length}`,
        `failEvents=${databaseSyncFailEvents.length}`
      ],
      nextAction: databaseSyncProvider.configured && databaseSyncProvider.secretConfigured
        ? "Keep sanitized enterprise-state sync connected to the managed database adapter and monitor failed sync events."
        : "Set SENA_DATABASE_SYNC_WEBHOOK_URL and SENA_DATABASE_SYNC_WEBHOOK_SECRET before claiming external managed database mirroring."
    },
    {
      id: "backup-restore-rehearsal",
      label: "Backup export and restore rehearsal",
      status: "pass",
      evidence: [
        "schema=sena-enterprise-backup/v1",
        "verifySchema=sena-enterprise-backup-verification/v1",
        "webhookSchema=sena-enterprise-backup-webhook/v1",
        "api=/api/sena/governance/backup",
        "deliveryApi=POST:/api/sena/governance/backup action=deliver",
        "restore=merge|dry-run",
        "scope=team-manage-only",
        "checksum=payload-sha256",
        "excluded=sessions|ssoStates|authLockouts|apiRateLimits|mfaSecrets|mfaChallenges|emailDeliveries|passwordResetTokens|projectPresence|collaborationEvents|passwordHash|uploadBlobs",
        `webhookProvider=${backupProvider.mode}`,
        `webhookEndpointHash=${backupProvider.endpointHash ?? "none"}`,
        `webhookSecret=${backupProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookTimeoutMs=${backupProvider.timeoutMs}`,
        `backupEvents=${backupEvents.length}`,
        `verifyEvents=${backupVerifyEvents.length}`,
        `deliverEvents=${backupDeliverEvents.length}`,
        `deliverFailEvents=${backupDeliverFailEvents.length}`,
        `restoreEvents=${backupRestoreEvents.length}`
      ],
      nextAction: backupProvider.configured && backupProvider.secretConfigured
        ? "Keep signed scheduled backups going to managed storage and rehearse dry-run plus merge restore before institutional deployment."
        : "Set SENA_BACKUP_WEBHOOK_URL and SENA_BACKUP_WEBHOOK_SECRET, then run signed backup delivery plus restore rehearsal before institutional deployment."
    },
    {
      id: "deployment-monitoring",
      label: "Deployment monitoring and operational readiness",
      status: opsStatus.storage.writable &&
        opsStatus.deployment.opsTokenConfigured &&
        Boolean(configuredAlertingOwner) &&
        alertProvider.configured &&
        alertProvider.secretConfigured ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-ops-status/v1",
        "statusApi=/api/sena/ops/status",
        "metricsApi=/api/sena/ops/metrics",
        "alertsApi=/api/sena/ops/alerts",
        "alertDeliveryApi=POST:/api/sena/ops/alerts action=deliver",
        "alertWebhookSchema=sena-enterprise-ops-alert-webhook/v1",
        `opsToken=${opsStatus.deployment.opsTokenConfigured ? "configured" : "missing"}`,
        `alertingOwner=${configuredAlertingOwner ? "configured" : "missing"}`,
        `alertingChannel=${alertingChannel()}`,
        `alertingRunbook=${configuredAlertingRunbookUrl ? "configured" : "missing"}`,
        `alertWebhookProvider=${alertProvider.mode}`,
        `alertWebhookEndpointHash=${alertProvider.endpointHash ?? "none"}`,
        `alertWebhookSecret=${alertProvider.secretConfigured ? "configured" : "missing"}`,
        `alertWebhookTimeoutMs=${alertProvider.timeoutMs}`,
        `alertDeliverEvents=${alertDeliverEvents.length}`,
        `alertDeliverFailEvents=${alertDeliverFailEvents.length}`,
        `opsStatus=${opsStatus.status}`,
        `storageWritable=${opsStatus.storage.writable}`,
        `backupStatus=${opsStatus.backup.status}`,
        `node=${opsStatus.deployment.nodeVersion}`,
        `uptimeSeconds=${opsStatus.deployment.uptimeSeconds}`
      ],
      nextAction: opsStatus.deployment.opsTokenConfigured && configuredAlertingOwner && alertProvider.configured && alertProvider.secretConfigured
        ? "Connect status, metrics, and signed alert delivery to the deployment monitor and incident runbook."
        : "Set SENA_OPS_TOKEN, SENA_ALERTING_OWNER, SENA_ALERT_WEBHOOK_URL, and SENA_ALERT_WEBHOOK_SECRET before exposing operational endpoints to deployment monitoring."
    },
    {
      id: "organization-deployment-package",
      label: "Organization deployment handoff package",
      status: opsStatus.deployment.opsTokenConfigured && Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL")) ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-organization-deployment/v1",
        "platformDecisionRegister=sena-enterprise-platform-decision-register/v1",
        `platformDecisionAcceptances=${(db.platformDecisionAcceptances ?? []).length}`,
        `platformDecisionReviewEvents=${platformDecisionReviewEvents.length}`,
        "api=/api/sena/ops/deployment",
        "auth=ops-bearer-token-or-session",
        "redaction=secret-values-excluded|endpoint-values-hashed|secret-hashing-disabled",
        `opsToken=${opsStatus.deployment.opsTokenConfigured ? "configured" : "missing"}`,
        `baseUrl=${envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL") ? "configured" : "missing"}`,
        `configuredDirectory=${opsStatus.storage.configuredDirectory}`,
        "includes=env-inventory|service-endpoints|readiness-summary|governance-key-checks|platform-decisions|platform-decision-register"
      ],
      nextAction: opsStatus.deployment.opsTokenConfigured && Boolean(envValue("SENA_APP_URL") || envValue("NEXT_PUBLIC_SENA_APP_URL"))
        ? "Attach the redacted organization deployment package to platform handoff and release review."
        : "Set SENA_OPS_TOKEN and SENA_APP_URL before handing deployment evidence to an institution platform team."
    },
    {
      id: "release-gate-review",
      label: "Release gate review",
      status: (db.releaseGateReviews ?? []).length > 0 ? "pass" : "review",
      evidence: [
        "schema=sena-enterprise-release-gate-review/v1",
        "listSchema=sena-enterprise-release-gate-reviews/v1",
        "api=/api/sena/ops/release-gate",
        "auth=team-rbac",
        `releaseGateReviews=${(db.releaseGateReviews ?? []).length}`,
        `reviewEvents=${releaseGateReviewEvents.length}`,
        `latestStatus=${(db.releaseGateReviews ?? [])[0]?.decision ?? "missing"}`,
        "snapshot=deployment-readiness|platform-decision-register",
        "verificationCommand=npm run sena:pilot:verify",
        "verificationEvidence=sena-enterprise-release-verification-evidence/v1",
        `latestVerificationStatus=${(db.releaseGateReviews ?? [])[0]?.verificationEvidence?.status ?? "missing"}`,
        `latestVerificationOutputSha256=${(db.releaseGateReviews ?? [])[0]?.verificationEvidence?.outputSha256 ? "present" : "missing"}`
      ],
      nextAction: (db.releaseGateReviews ?? []).length > 0
        ? "Attach the release gate review record to the deployment handoff package before institution rollout."
        : "Record a release gate review after readiness, platform decisions, and verification commands have been reviewed."
    },
    {
      id: "upload-registry",
      label: "Upload registry and source-file lineage",
      status: "pass",
      evidence: [
        `uploads=${db.uploads.length}`,
        "fileHash=sha256",
        "storage=private-enterprise-upload-directory",
        "objectStorageDelivery=POST:/api/sena/uploads action=deliver-object-storage",
        "objectStorageWebhookSchema=sena-enterprise-upload-object-storage-webhook/v1",
        ...objectStorageNativeProvider.evidence,
        `objectStorageProvider=${objectStorageProvider.mode}`,
        `objectStorageEndpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `objectStorageSecret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `objectStorageDeliverEvents=${uploadObjectStorageDeliverEvents.length}`,
        `objectStorageFailEvents=${uploadObjectStorageFailEvents.length}`,
        `objectStorageCustodyDelivered=${uploadObjectStorageCustody.delivered}`,
        `objectStorageCustodyPending=${uploadObjectStorageCustody.pending}`,
        `objectStorageCustodyFailed=${uploadObjectStorageCustody.failed}`,
        `objectStorageCustodyPendingReview=${uploadObjectStorageCustody.pendingReview}`,
        ...uploadRegistryRuntime.evidence,
        "metadata=team|user|contentType|size|adapterProfile|scanStatus"
      ],
      nextAction: objectStorageNativeProvider.configured
        ? "Keep native object-storage handoff, scan-review policy, retention, and versioning evidence documented before cross-organization deployment."
        : objectStorageProvider.configured && objectStorageProvider.secretConfigured
          ? "Keep signed object-storage handoff and scan-review policy documented before cross-organization deployment."
          : "Move upload blobs to managed object storage with retention and malware scanning before cross-organization deployment."
    },
    {
      id: "upload-security-scan",
      label: "Upload security and DLP scan",
      status: "pass",
      evidence: [
        `engine=${uploadScanEngine}`,
        `maxBytes=${maxUploadBytes}`,
        `passed=${db.uploads.filter((upload) => upload.scanStatus === "passed").length}`,
        `review=${db.uploads.filter((upload) => upload.scanStatus === "review").length}`,
        `allowedExtensions=${Array.from(allowedUploadExtensions).join("|")}`,
        "blocked=empty|oversized|unsupported-extension|executable-magic"
      ],
      nextAction: "Replace the local heuristic scanner with institution-approved malware scanning and DLP before regulated deployment."
    },
    {
      id: "upload-storage-integrity",
      label: "Upload blob integrity verification",
      status: uploadStorageVerification.status,
      evidence: [
        "schema=sena-enterprise-upload-storage-verification/v1",
        "objectStorageWebhookSchema=sena-enterprise-upload-object-storage-webhook/v1",
        "storage=private-local-directory",
        ...objectStorageNativeProvider.evidence,
        `objectStorageProvider=${objectStorageProvider.mode}`,
        `objectStorageEndpointHash=${objectStorageProvider.endpointHash ?? "none"}`,
        `objectStorageSecret=${objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `registered=${uploadStorageVerification.summary.registeredUploads}`,
        `verified=${uploadStorageVerification.summary.verifiedBlobs}`,
        `missing=${uploadStorageVerification.summary.missingBlobs}`,
        `corrupt=${uploadStorageVerification.summary.checksumMismatches}`,
        `orphan=${uploadStorageVerification.summary.orphanBlobs}`,
        `registeredBytes=${uploadStorageVerification.summary.totalRegisteredBytes}`,
        `verifiedBytes=${uploadStorageVerification.summary.totalVerifiedBytes}`
      ],
      nextAction: uploadStorageVerification.status === "pass"
        ? "Keep upload blob integrity verification active before each signed object-storage delivery run."
        : "Repair missing, corrupt, or orphan upload blobs before production handoff."
    },
    {
      id: "import-run-history",
      label: "Import run history and data-quality lineage",
      status: "pass",
      evidence: [
        `importRuns=${db.importRuns.length}`,
        `warnings=${db.importRuns.reduce((total, run) => total + run.warningCount, 0)}`,
        `profiles=${Array.from(new Set(db.importRuns.flatMap((run) => run.sources.map((source) => source.profile)))).join("|") || "none"}`,
        `cleaningManifests=${db.importRuns.filter((run) => run.cleaningManifest?.schemaVersion === SENA_SCHEMA_VERSIONS.importCleaningManifest).length}`,
        ...importRunRegistryRuntime.evidence,
        "cleaningManifest=sena-import-cleaning-manifest/v1",
        "lineage=uploadIds|adapterProfiles|datasetCounts|warningsPreview|cleaningManifest",
        "adapters=csv|excel|sena-json|lms-forum-json|lms-forum-export|cleaned-transcript"
      ],
      nextAction: "Add malware scanning, DLP checks, and institution-approved retention rules before cross-organization imports."
    },
    {
      id: "analysis-run-history",
      label: "Server-side SENA analysis run history",
      status: "pass",
      evidence: [
        `analysisRuns=${db.analysisRuns.length}`,
        "schema=sena-analysis-run/v1",
        "api=/api/sena/analyze",
        "historyApi=GET:/api/sena/analyze",
        ...analysisRunRegistryRuntime.evidence,
        "lineage=team|project|persistedProject|sourceKind|datasetCounts|activeTemporalWindow",
        "artifactFingerprints=reportSha256|projectSnapshotSha256|runtimeBundleSha256",
        `runtimeBundles=${db.analysisRuns.filter((run) => run.includeRuntimeBundle).length}`,
        `projectLinked=${db.analysisRuns.filter((run) => run.projectId || run.persistedProjectId).length}`
      ],
      nextAction: "Use analysis run IDs and artifact fingerprints when reviewing server-side SENA outputs across teams."
    },
    {
      id: "audit-log",
      label: "Audit logging",
      status: auditIntegrity.status,
      evidence: [
        "schema=sena-enterprise-audit-integrity/v1",
        ...auditRuntime.evidence,
        `auditEvents=${db.auditLog.length}`,
        `retention=max-${auditRetentionMaxEvents}-events`,
        `retentionDays=${auditIntegrity.retention.retentionWindowDays ?? "missing"}`,
        `chainHead=${auditIntegrity.chain.headHash}`,
        `integrity=${auditIntegrity.status}`,
        "api=/api/sena/governance/audit",
        "integrityApi=/api/sena/governance/audit?integrity=1",
        "deliveryApi=POST:/api/sena/governance/audit",
        "webhookSchema=sena-enterprise-audit-webhook/v1",
        `webhookProvider=${auditProvider.mode}`,
        `webhookEndpointHash=${auditProvider.endpointHash ?? "none"}`,
        `webhookSecret=${auditProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookPending=${auditWebhookPendingEvents}`,
        `webhookDelivered=${auditWebhookDeliveredEvents}`,
        `webhookFailed=${auditWebhookFailedEvents}`,
        "exports=json|csv",
        "filters=team|event|user|project|date",
        "events=auth|auth.login.failed|auth.login.locked|auth.mfa|auth.password_reset|security.rate_limit|team|project|import|reliability|inference|export|notification|email|governance"
      ],
      nextAction: auditIntegrity.status === "pass"
        ? "Forward signed audit events and chain heads to institutional logging or SIEM storage before regulated deployment."
        : "Set audit retention policy and repair audit integrity checks before regulated deployment."
    },
    {
      id: "reliability-run-history",
      label: "Reliability run history",
      status: "pass",
      evidence: [
        `reliabilityRuns=${db.reliabilityRuns.length}`,
        `approved=${db.reliabilityRuns.filter((run) => run.status === "approved").length}`,
        `pending=${db.reliabilityRuns.filter((run) => run.status === "pending-review" || run.status === "pending-adjudication").length}`,
        `reliabilityAdjudications=${db.adjudications.filter((record) => record.reliabilityRunId).length}`,
        ...reliabilityRunRegistryRuntime.evidence,
        "dashboard=sena-coding-reliability-dashboard/v2",
        "adjudicationCoverage=sena-reliability-adjudication-coverage/v1",
        `latestAdjudicationCoverage=${db.reliabilityRuns[0]?.adjudicationCoverage?.coverageRate ?? "missing"}`,
        `latestUnresolvedDisagreements=${db.reliabilityRuns[0]?.adjudicationCoverage?.unresolvedDisagreements ?? "missing"}`,
        "metrics=cohen-kappa|krippendorff-alpha|adjudication-queue|code-diagnostics",
        "diagnostics=code-level-agreement|coder-positive-rate-drift",
        "lineage=input-file-sha256|team|project|reviewer|reliabilityRunId",
        "signoff=pending-review|pending-adjudication|approved|rejected"
      ],
      nextAction: "Connect reliability run sign-off and adjudication decisions to the formal preregistration workflow before publication claims."
    },
    {
      id: "validation-run-history",
      label: "Group-comparison validation run history",
      status: "pass",
      evidence: [
        `validationRuns=${db.validationRuns.length}`,
        `approved=${db.validationRuns.filter((run) => run.status === "approved").length}`,
        `pending=${db.validationRuns.filter((run) => run.status === "pending-review").length}`,
        "schema=sena-group-comparison/v2|sena-group-comparison-suite/v2",
        "method=permutation-two-sided|bootstrap-ci|effect-size",
        "multipleComparison=holm",
        ...validationRunRegistryRuntime.evidence,
        `suiteRuns=${db.validationRuns.filter((run) => run.result?.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite).length}`,
        `preregistrationPlans=${db.validationRuns.filter((run) => run.preregistrationPlan?.schemaVersion === SENA_SCHEMA_VERSIONS.validationPreregistrationPlan).length}`,
        "preregistrationPlan=sena-validation-preregistration-plan/v1",
        "planHash=sha256",
        "planLock=analysis-parameters|protocol-note-hash|method-note-hash",
        `parityEvidenceRuns=${db.validationRuns.filter((run) => run.parityEvidence?.schemaVersion === SENA_SCHEMA_VERSIONS.validationParityEvidence).length}`,
        `parityReadyForReview=${db.validationRuns.filter((run) => run.parityEvidence?.status === "ready-for-review").length}`,
        "parityEvidence=sena-validation-parity-evidence/v1",
        "runtimeParity=jena-rena-sample-parity|jsna-r-sna-social-parity",
        "guardrail=descriptive-validation-not-preregistered-inference"
      ],
      nextAction: "Attach preregistration identifiers, domain expert review, and final inferential model references before publication or assessment claims."
    },
    {
      id: "domain-expert-review",
      label: "Domain expert review workflow",
      status: expertReviewRegistryRuntime.receiptSigningReady ? "pass" : "review",
      evidence: [
        `expertReviews=${db.expertReviews.length}`,
        `approved=${db.expertReviews.filter((review) => review.status === "approved").length}`,
        `changesRequested=${db.expertReviews.filter((review) => review.status === "changes-requested").length}`,
        `claimReadyWithLimits=${db.expertReviews.filter((review) => review.claimScope === "claim-ready-with-limits").length}`,
        "schema=sena-enterprise-expert-review/v1",
        ...expertReviewRegistryRuntime.evidence,
        "ratings=data-adequacy|method-fit|interpretation-validity",
        "targets=project|validation-run|reliability-run|claim",
        "signoff=requested|approved|changes-requested|rejected"
      ],
      nextAction: expertReviewRegistryRuntime.receiptSigningReady
        ? "Require at least one receipt-authenticated approved domain expert review before treating SENA patterns as publication-facing claims."
        : "Configure a dedicated 32+ character SENA_EXPERT_REVIEW_SIGNING_SECRET and an opaque key id before expert approval can authorize claim-ready evidence."
    },
    {
      id: "collaboration-governance",
      label: "Collaboration stream and adjudication records",
      status: "pass",
      evidence: [
        "transport=sse:/api/sena/projects/:projectId/collaboration/stream",
        "streamSchema=sena-project-collaboration-stream/v1",
        "saveGuard=expectedVersion-409-conflict",
        "revisionRestoreGuard=expectedVersion-append-only",
        "pubsubDeliveryApi=POST:/api/sena/projects/:projectId/collaboration action=deliver-pubsub",
        "pubsubWebhookSchema=sena-enterprise-collaboration-pubsub-webhook/v1",
        `pubsubProvider=${collaborationProvider.mode}`,
        `pubsubEndpointHash=${collaborationProvider.endpointHash ?? "none"}`,
        `pubsubSecret=${collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `pubsubTimeoutMs=${collaborationProvider.timeoutMs}`,
        `pubsubMaxAttempts=${collaborationProvider.maxAttempts}`,
        `pubsubQueued=${collaborationPubSubQueuedEvents}`,
        `pubsubPending=${collaborationPubSubPending}`,
        `pubsubDelivered=${collaborationPubSubDelivered}`,
        `pubsubFailed=${collaborationPubSubFailed}`,
        `pubsubDeliverEvents=${collaborationPubSubDeliverEvents.length}`,
        `pubsubFailEvents=${collaborationPubSubFailEvents.length}`,
        `comments=${db.projectComments.length}`,
        `presence=${db.projectPresence.length}`,
        `adjudications=${db.adjudications.length}`
      ],
      nextAction: collaborationProvider.configured && collaborationProvider.secretConfigured
        ? "Keep signed collaboration events flowing to the selected external pub/sub bus and monitor failed deliveries."
        : "Set SENA_COLLABORATION_PUBSUB_WEBHOOK_URL and SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET before multi-runtime collaboration delivery is claimed."
    },
    {
      id: "notification-delivery",
      label: "Notification outbox and delivery",
      status: "pass",
      evidence: [
        "schema=sena-enterprise-notifications/v1",
        "api=/api/sena/notifications",
        "delivery=local-in-app-outbox",
        "deliveryWorker=POST:/api/sena/notifications",
        "emailDeliveryWorker=POST:/api/sena/notifications action=deliver-email",
        "emailWebhookSchema=sena-enterprise-email-webhook/v1",
        `webhookProvider=${webhookProvider.mode}`,
        `webhookEndpointHash=${webhookProvider.endpointHash ?? "none"}`,
        `webhookSecret=${webhookProvider.secretConfigured ? "configured" : "missing"}`,
        `webhookTimeoutMs=${webhookProvider.timeoutMs}`,
        `webhookMaxAttempts=${webhookProvider.maxAttempts}`,
        `emailWebhookProvider=${emailProvider.mode}`,
        `emailWebhookEndpointHash=${emailProvider.endpointHash ?? "none"}`,
        `emailWebhookSecret=${emailProvider.secretConfigured ? "configured" : "missing"}`,
        `emailWebhookTimeoutMs=${emailProvider.timeoutMs}`,
        `emailWebhookMaxAttempts=${emailProvider.maxAttempts}`,
        `notifications=${db.notifications.length}`,
        `unread=${unreadNotifications}`,
        `webhookPending=${webhookPendingNotifications}`,
        `webhookDelivered=${webhookDeliveredNotifications}`,
        `webhookFailed=${webhookFailedNotifications}`,
        `emailPending=${emailPendingDeliveries}`,
        `emailDelivered=${emailDeliveredDeliveries}`,
        `emailFailed=${emailFailedDeliveries}`,
        `queuedEvents=${notificationEvents.length}`,
        `readEvents=${notificationReadEvents.length}`,
        `webhookDeliverEvents=${notificationWebhookDeliverEvents.length}`,
        `webhookFailEvents=${notificationWebhookFailEvents.length}`,
        `emailQueueEvents=${emailQueueEvents.length}`,
        `emailWebhookDeliverEvents=${emailWebhookDeliverEvents.length}`,
        `emailWebhookFailEvents=${emailWebhookFailEvents.length}`,
        "events=team.invite|auth.password_reset|project.comment|reliability.review|validation.review|expert.review"
      ],
      nextAction: emailProvider.configured && emailProvider.secretConfigured
        ? "Keep institution email webhook retention and replay ownership documented before organization-wide rollout."
        : "Connect signed institution email delivery for password reset and team invitations before organization-wide rollout."
    }
  ];

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGovernance,
    status: checks.every((check) => check.status === "pass") ? "ready" : "review",
    generatedAt: now(),
    storage: {
      engine: storageEngine,
      primaryStateRuntime,
      configuredDirectory,
      pathHint: enterpriseDbPathHint,
      ...(postgresStorage ? { postgres: postgresStorage } : {})
    },
    auth: {
      passwordHash: "pbkdf2-sha256",
      ssoModes: ssoProviders,
      oidcProviders,
      callbackPath: ssoCallbackPath,
      sessionCookie: senaSessionCookieName,
      sessionDays,
      sessionPolicy: {
        standardDays: standardSessionDays,
        rememberedDays: rememberedSessionDays
      },
      loginLockout: {
        maxFailures: authLockoutMaxFailures,
        windowMinutes: authLockoutWindowMinutes,
        lockoutMinutes: authLockoutMinutes,
        activeLockouts: activeAuthLockouts
      },
      mfa: {
        methods: ["totp"],
        enabledUsers: enabledMfaUsers,
        challengeMinutes: mfaChallengeMinutes,
        setupMinutes: mfaSetupMinutes,
        secretStorage: "aes-256-gcm",
        keySource: mfaKeySource()
      },
      passwordReset: {
        expiresMinutes: passwordResetMinutes,
        activeRequests: activePasswordResetRequests,
        delivery: passwordResetTokenExposure() ? "local-token" : emailProvider.configured ? "email-webhook" : "email-provider-required"
      },
      passwordPolicy: enterprisePasswordPolicy
    },
    rbac: {
      roles: Object.keys(rolePermissions) as SenaEnterpriseRole[],
      permissions: permissions as SenaEnterprisePermission[]
    },
    counts: {
      users: db.users.length,
      // Archived teams are retired, not deleted: they stay in db.teams so audit
      // history and backups keep resolving them. A go-live decision reads this
      // count as "teams live on this deployment", so it must exclude them.
      teams: db.teams.filter((team) => !team.archived).length,
      teamsArchived: db.teams.filter((team) => team.archived).length,
      projects: db.projects.length,
      uploads: db.uploads.length,
      importRuns: db.importRuns.length,
      analysisRuns: db.analysisRuns.length,
      serverJobs: (db.serverJobs ?? []).length,
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
      auditEvents: db.auditLog.length
    },
    checks
  };
}

export async function getEnterpriseGovernanceStatusWithPostgresEvidence(input: {
  opsStatus?: SenaEnterpriseOpsStatus;
  auditIntegrity?: SenaEnterpriseAuditIntegrity;
  uploadStorageVerification?: SenaEnterpriseUploadStorageVerification;
  uploadObjectStorageCustody?: SenaEnterpriseUploadObjectStorageCustodySummary;
} = {}): Promise<SenaEnterpriseGovernanceStatus> {
  const state = await readEnterpriseState();
  const opsStatus = input.opsStatus ?? await getEnterpriseOpsStatusWithPostgresEvidence();
  const auditIntegrity = input.auditIntegrity ?? await verifyEnterpriseAuditIntegrityAsync();
  const uploadStorageVerification = input.uploadStorageVerification ?? await verifyEnterpriseUploadStorageAsync();
  const uploadObjectStorageCustody = input.uploadObjectStorageCustody ?? await summarizeEnterpriseUploadObjectStorageCustodyWithPostgresEvidence();
  return getEnterpriseGovernanceStatus({
    db: state.db,
    opsStatus,
    auditIntegrity,
    uploadStorageVerification,
    uploadObjectStorageCustody
  });
}

export type SenaEnterpriseGovernanceStatus = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGovernance;
  status: "ready" | "review";
  generatedAt: string;
  storage: {
    engine: SenaEnterpriseStorageEngine;
    primaryStateRuntime: SenaEnterprisePrimaryStateRuntime;
    configuredDirectory: "default-local" | "env-configured";
    pathHint: string;
    postgres?: SenaEnterprisePostgresStorageEvidence;
  };
  auth: {
    passwordHash: "pbkdf2-sha256";
    ssoModes: SenaEnterpriseSsoProvider[];
    oidcProviders: SenaEnterpriseSsoProviderStatus[];
    callbackPath: string;
    sessionCookie: string;
    sessionDays: number;
    sessionPolicy: {
      standardDays: number;
      rememberedDays: number;
    };
    loginLockout: {
      maxFailures: number;
      windowMinutes: number;
      lockoutMinutes: number;
      activeLockouts: number;
    };
    mfa: {
      methods: Array<"totp">;
      enabledUsers: number;
      challengeMinutes: number;
      setupMinutes: number;
      secretStorage: "aes-256-gcm";
      keySource: "env-configured" | "local-default-review";
    };
    passwordReset: {
      expiresMinutes: number;
      activeRequests: number;
      delivery: "email-provider-required" | "email-webhook" | "local-token";
    };
    passwordPolicy: {
      schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePasswordPolicy;
      minLength: number;
      requiresLetter: boolean;
      requiresNumber: boolean;
      blocksCommonPasswords: boolean;
      blocksEmailLocalPart: boolean;
      blockedFragments: string[];
    };
  };
  rbac: {
    roles: SenaEnterpriseRole[];
    permissions: SenaEnterprisePermission[];
  };
  counts: {
    users: number;
    teams: number;
    teamsArchived: number;
    projects: number;
    uploads: number;
    importRuns: number;
    analysisRuns: number;
    serverJobs: number;
    reliabilityRuns: number;
    validationRuns: number;
    expertReviews: number;
    platformDecisionAcceptances: number;
    releaseGateReviews: number;
    postCutoverObservations: number;
    goLiveAttestations: number;
    projectRevisions: number;
    comments: number;
    adjudications: number;
    collaborationEvents: number;
    notifications: number;
    auditEvents: number;
  };
  checks: SenaEnterpriseGovernanceCheck[];
};



export type SenaEnterpriseGovernanceCheck = {
  id: string;
  label: string;
  status: "pass" | "review";
  evidence: string[];
  nextAction: string;
};

export function governanceCheck(status: SenaEnterpriseGovernanceStatus, id: string) {
  return status.checks.find((check) => check.id === id);
}

const standardSessionDays = 7;
const rememberedSessionDays = 30;
const sessionDays = standardSessionDays;
const authLockoutMaxFailures = positiveIntegerEnv("SENA_AUTH_LOCKOUT_MAX_FAILURES", 5);
const authLockoutWindowMinutes = positiveIntegerEnv("SENA_AUTH_LOCKOUT_WINDOW_MINUTES", 15);
const authLockoutMinutes = positiveIntegerEnv("SENA_AUTH_LOCKOUT_MINUTES", 15);
const authApiRateLimitWindowSeconds = positiveIntegerEnv("SENA_AUTH_API_RATE_LIMIT_WINDOW_SECONDS", 60);
const authApiRateLimitMaxRequests = positiveIntegerEnv("SENA_AUTH_API_RATE_LIMIT_MAX_REQUESTS", 20);
const passwordResetRateLimitWindowSeconds = positiveIntegerEnv("SENA_PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS", 15 * 60);
const passwordResetRateLimitMaxRequests = positiveIntegerEnv("SENA_PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS", 5);
const ssoRateLimitWindowSeconds = positiveIntegerEnv("SENA_SSO_RATE_LIMIT_WINDOW_SECONDS", 5 * 60);
const ssoRateLimitMaxRequests = positiveIntegerEnv("SENA_SSO_RATE_LIMIT_MAX_REQUESTS", 30);
const mfaSetupMinutes = positiveIntegerEnv("SENA_MFA_SETUP_MINUTES", 10);
const mfaChallengeMinutes = positiveIntegerEnv("SENA_MFA_CHALLENGE_MINUTES", 5);
const passwordResetMinutes = positiveIntegerEnv("SENA_PASSWORD_RESET_MINUTES", 30);
const uploadScanEngine = "sena-local-upload-scan/v1" as const;
const maxUploadBytes = senaEnterpriseUploadMaxBytes();
const allowedUploadExtensions = new Set([".csv", ".json", ".xlsx", ".txt", ".md", ".srt", ".vtt"]);

export function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && hasEnterprisePermission(context, membership.teamId, "team:manage"))
    .map((membership) => membership.teamId);
}
