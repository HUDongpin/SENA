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
  buildEnterpriseOrganizationDeploymentDecisions,
  type SenaEnterpriseOrganizationDeploymentDecision
} from "./ops-deployment-decisions";
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
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import {
  getEnterpriseGovernanceStatus,
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
import { readEnterpriseDb } from "./state";
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

export function getEnterprisePlatformDecisionRegister(input: { teamId?: string } = {}): SenaEnterprisePlatformDecisionRegister {
  const db = readEnterpriseDb();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const platformDecisionAcceptances = input.teamId
    ? (db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : db.platformDecisionAcceptances ?? [];
  return buildEnterprisePlatformDecisionRegister(deployment.platformDecisions, platformDecisionAcceptances);
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


export function getEnterpriseOrganizationDeploymentPackage(input: { teamId?: string } = {}): SenaEnterpriseOrganizationDeploymentPackage {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const db = readEnterpriseDb();
  const readiness = getEnterpriseDeploymentReadiness();
  const governance = getEnterpriseGovernanceStatus();
  const opsStatus = getEnterpriseOpsStatus();
  const postgresConfig = resolveEnterprisePostgresConfig();
  const baseUrl = normalizedBaseUrl();
  const webhookProvider = notificationWebhookProvider(enterpriseDbPath, selfManagedEnterprise);
  const emailProvider = emailWebhookProvider(enterpriseDbPath, selfManagedEnterprise);
  const collaborationProvider = collaborationPubSubProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const databaseSyncProvider = databaseSyncWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const objectStorageProvider = objectStorageWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const backupProvider = backupWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const alertProvider = alertWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const auditProvider = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
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
    ...deploymentWebhookEnv("SENA_NOTIFICATION_WEBHOOK_URL", "SENA_NOTIFICATION_WEBHOOK_SECRET", webhookProvider, "notifications", "Notification event bridge"),
    ...deploymentWebhookEnv("SENA_EMAIL_WEBHOOK_URL", "SENA_EMAIL_WEBHOOK_SECRET", emailProvider, "notifications", "Institution email bridge"),
    ...deploymentWebhookEnv("SENA_COLLABORATION_PUBSUB_WEBHOOK_URL", "SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET", collaborationProvider, "collaboration", "Collaboration pub/sub bridge"),
    ...deploymentWebhookEnv("SENA_DATABASE_SYNC_WEBHOOK_URL", "SENA_DATABASE_SYNC_WEBHOOK_SECRET", databaseSyncProvider, "storage", "Managed database sync bridge"),
    ...deploymentWebhookEnv("SENA_OBJECT_STORAGE_WEBHOOK_URL", "SENA_OBJECT_STORAGE_WEBHOOK_SECRET", objectStorageProvider, "uploads", "Managed upload object-storage bridge"),
    ...deploymentWebhookEnv("SENA_BACKUP_WEBHOOK_URL", "SENA_BACKUP_WEBHOOK_SECRET", backupProvider, "governance", "Managed backup delivery bridge"),
    ...deploymentWebhookEnv("SENA_ALERT_WEBHOOK_URL", "SENA_ALERT_WEBHOOK_SECRET", alertProvider, "ops", "Deployment alert delivery bridge"),
    ...deploymentWebhookEnv("SENA_AUDIT_WEBHOOK_URL", "SENA_AUDIT_WEBHOOK_SECRET", auditProvider, "governance", "Audit/SIEM forwarding bridge")
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
    databaseSyncProvider,
    objectStorageProvider,
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
    platformDecisionRegister,
    platformDecisionAcceptances
  });
  const identityProductionHandoff = buildEnterpriseIdentityProductionEvidenceDossier({
    generatedAt,
    teamId: input.teamId,
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

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment,
    generatedAt,
    status: readiness.status === "blocked" || missingRequiredEnv.length > 0 ? "blocked" : openPlatformDecisions > 0 || readiness.status === "review" || governance.status === "review" ? "review" : "ready",
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
    identityProductionEvidence,
    identityProductionHandoff,
    releaseGate,
    verification: {
      commands: readiness.runbook.verificationCommands,
      releaseGate: "npm run sena:pilot:verify"
    }
  };
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
