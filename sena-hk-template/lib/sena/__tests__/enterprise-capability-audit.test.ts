import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const institutionAuthEnv = [
  "SENA_APP_URL",
  "SENA_PROVISIONING_TOKEN",
  "SENA_PROVISIONING_TOKEN_SECRET_REF",
  "SENA_PROVISIONING_TOKEN_VERSION",
  "SENA_MFA_ENCRYPTION_KEY",
  "SENA_CSRF_SECRET",
  "SENA_SESSION_SECRET",
  "SENA_PASSWORD_RESET_EXPOSE_TOKEN",
  "SENA_ENTERPRISE_DEPLOYMENT_MODE",
  "SENA_SELF_MANAGED_WEBHOOK_SINK",
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_OPS_TOKEN",
  "SENA_NOTIFICATION_WEBHOOK_URL",
  "SENA_NOTIFICATION_WEBHOOK_SECRET",
  "SENA_EMAIL_WEBHOOK_URL",
  "SENA_EMAIL_WEBHOOK_SECRET",
  "SENA_AUDIT_WEBHOOK_URL",
  "SENA_AUDIT_WEBHOOK_SECRET",
  "SENA_BACKUP_WEBHOOK_URL",
  "SENA_BACKUP_WEBHOOK_SECRET",
  "SENA_ALERT_WEBHOOK_URL",
  "SENA_ALERT_WEBHOOK_SECRET",
  "SENA_DATABASE_SYNC_WEBHOOK_URL",
  "SENA_DATABASE_SYNC_WEBHOOK_SECRET",
  "SENA_OBJECT_STORAGE_WEBHOOK_URL",
  "SENA_OBJECT_STORAGE_WEBHOOK_SECRET",
  "SENA_COLLABORATION_PUBSUB_WEBHOOK_URL",
  "SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET",
  "SENA_SSO_INSTITUTION_CLIENT_ID",
  "SENA_SSO_INSTITUTION_TENANT_ID",
  "SENA_SSO_INSTITUTION_CLIENT_SECRET",
  "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF",
  "SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION",
  "SENA_SSO_INSTITUTION_SCOPES",
  "SENA_SSO_INSTITUTION_ISSUER",
  "SENA_SSO_INSTITUTION_AUTHORIZATION_URL",
  "SENA_SSO_INSTITUTION_TOKEN_URL",
  "SENA_SSO_INSTITUTION_USERINFO_URL",
  "SENA_SSO_INSTITUTION_JWKS_URL",
  "SENA_SSO_GOOGLE_CLIENT_ID",
  "SENA_SSO_GOOGLE_CLIENT_SECRET",
  "SENA_SSO_GOOGLE_SCOPES",
  "SENA_SSO_GOOGLE_ISSUER",
  "SENA_SSO_GOOGLE_AUTHORIZATION_URL",
  "SENA_SSO_GOOGLE_TOKEN_URL",
  "SENA_SSO_GOOGLE_USERINFO_URL",
  "SENA_SSO_GOOGLE_JWKS_URL",
  "SENA_SSO_ORCID_CLIENT_ID",
  "SENA_SSO_ORCID_CLIENT_SECRET",
  "SENA_SSO_ORCID_SCOPES",
  "SENA_SSO_ORCID_ISSUER",
  "SENA_SSO_ORCID_AUTHORIZATION_URL",
  "SENA_SSO_ORCID_TOKEN_URL",
  "SENA_SSO_ORCID_USERINFO_URL",
  "SENA_SSO_ORCID_JWKS_URL",
  "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS",
  "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS",
  "SENA_IDENTITY_LIFECYCLE_OWNER_MODE"
];

function clearInstitutionAuthEnv() {
  for (const name of institutionAuthEnv) {
    delete process.env[name];
  }
}

const enterpriseCapabilityAuditTestTimeoutMs = 30_000;
const productionLikeProvisioningToken = "sena_prov_2026_9f4c2a1d8e7b6c5a4f3e2d1c0b9a8765";
const productionLikeInstitutionSsoSecret = "sena_oidc_2026_7c6b5a49382716f0e1d2c3b4a5968778";
const productionLikeIdpEvidenceArtifactDigest = "a".repeat(64);
const productionLikeProvisioningEvidenceArtifactDigest = "b".repeat(64);
const expectedIdentityResponseAuditHeaders = [
  "x-sena-identity-request-packet-policy-hash",
  "x-sena-identity-request-packet-policy-binding",
  "x-sena-identity-production-receipt-digest",
  "x-sena-identity-submitted-evidence-digest",
  "x-sena-identity-production-evidence-artifact-digest",
  "x-sena-identity-production-evidence-artifact-covered-ids",
  "x-sena-identity-production-evidence-artifact-coverage",
  "x-sena-identity-production-evidence-artifact-completeness",
  "x-sena-identity-submitted-decision-production-evidence-artifact-completeness",
  "x-sena-identity-production-verifier-status",
  "x-sena-identity-evidence-url-host-binding",
  "x-sena-identity-technical-binding",
  "x-sena-identity-technical-readiness",
  "x-sena-identity-rotation-freshness",
  "x-sena-identity-rotation-expired-evidence",
  "x-sena-identity-rotation-due-soon-evidence",
  "x-sena-identity-receipt-archive-status",
  "x-sena-identity-submitted-decision-receipt-archive-missing-inputs",
  "x-sena-identity-receipt-archive-missing-inputs",
  "x-sena-identity-production-evidence-digest",
  "x-sena-identity-evidence-binding-digest",
  "x-sena-identity-receipt-archive-manifest-digest",
  "x-sena-identity-production-status",
  "x-sena-identity-release-gate-blocked",
  "x-sena-identity-request-blockers",
  "x-sena-identity-receipt-review-requests",
  "x-sena-identity-production-blocking-decisions",
  "x-sena-identity-missing-evidence-ids",
  "x-sena-identity-cutover-checklist",
  "x-sena-identity-cutover-blockers",
  "x-sena-identity-production-evidence-artifact-completeness-summary"
];
const expectedIdentityReceiptArchiveBodyPaths = [
  "acceptance.productionEvidenceReceipt",
  "identityProductionEvidence.submissionVerifier",
  "identityProductionEvidence.cutoverChecklist",
  "identityProductionEvidence.platformRequestPacket",
  "identityProductionEvidence.receiptArchiveManifest",
  "identityProductionEvidence.institutionActionPlan"
];
const expectedIdentityStableSubmissionDigestInputFields = [
  "schemaVersion",
  "submittedEvidenceDigestAlgorithm",
  "submittedEvidenceDigestScope",
  "decisionId",
  "status",
  "acceptedBridge",
  "ownerNameHash",
  "ownerRoleHash",
  "environmentHash",
  "productionEvidenceVerifiedAtHash",
  "submittedEvidenceIds",
  "evidenceUrlHash",
  "evidenceUrlPathHash",
  "evidenceUrlHostHash",
  "evidenceUrlAllowedHostHash",
  "productionEvidenceArtifactDigestAlgorithm",
  "productionEvidenceArtifactDigestScope",
  "productionEvidenceArtifactDigest",
  "productionEvidenceArtifactDigestCoveredEvidenceIds",
  "productionEvidenceArtifactDigestCoverageStatus",
  "productionEvidenceArtifactDigestCompletenessStatus",
  "requestPacketSchemaVersion",
  "submittedRequestPacketPolicyHash",
  "technicalEvidenceBinding"
];

function currentIdentityRequestPacketPolicyHash(
  enterprise: typeof import("../enterprise"),
  teamId: string
) {
  const hash = enterprise.getEnterpriseIdentityProductionEvidence({ teamId }).platformRequestPacket.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyHash="))
    ?.slice("requestPacketPolicyHash=".length);
  if (!hash) throw new Error("Missing identity request packet policy hash in test setup.");
  return hash;
}

describe("SENA enterprise capability audit auth evidence", () => {
  it("treats institution IdP and SCIM evidence as not applicable in self-managed enterprise mode", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-self-managed-identity-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DEPLOYMENT_MODE = "self-managed";
    process.env.SENA_APP_URL = "https://sena-self-managed.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      expect(deployment.summary.missingRequiredEnv).not.toContain("SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION");
      const identityDecisions = deployment.platformDecisionRegister.decisions
        .filter((decision) => decision.id === "institution-idp-approval" || decision.id === "institution-provisioning-owner");

      expect(identityDecisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "institution-idp-approval",
          productionBlocking: false,
          acceptedBridge: true,
          evidenceChecklist: expect.arrayContaining([
            expect.objectContaining({ id: "idp-tenant-approval", productionRequired: false, status: "present" }),
            expect.objectContaining({ id: "sso-provider-secrets", productionRequired: false, status: "present" })
          ])
        }),
        expect.objectContaining({
          id: "institution-provisioning-owner",
          productionBlocking: false,
          acceptedBridge: true,
          evidenceChecklist: expect.arrayContaining([
            expect.objectContaining({ id: "provisioning-owner", productionRequired: false, status: "present" }),
            expect.objectContaining({ id: "scim-or-idp-ownership", productionRequired: false, status: "present" })
          ])
        })
      ]));
      expect(deployment.platformDecisionRegister.summary.productionBlocking).toBeLessThanOrEqual(8);

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      expect(identityEvidence.status).toBe("ready");
      expect(identityEvidence.releaseGate.approvalBlocked).toBe(false);
      expect(identityEvidence.releaseGate.productionBlockingDecisionIds).toEqual([]);
      expect(identityEvidence.evidenceManifest.missingEvidenceIds).not.toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "sso-provider-secrets",
        "provisioning-owner",
        "scim-or-idp-ownership"
      ]));
      expect(identityEvidence.evidence).toEqual(expect.arrayContaining([
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable"
      ]));

      const capabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const authCapability = capabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("ready");
      expect(authCapability?.remainingPlatformDecisions).not.toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "enterpriseDeploymentMode=self-managed",
        "idpTenantApproval=not-applicable",
        "scimProvisioningOwner=not-applicable"
      ]));

      const governance = enterprise.getEnterpriseGovernanceStatus();
      const oidcGovernance = governance.checks.find((check) => check.id === "oauth-oidc-sso");
      const provisioningGovernance = governance.checks.find((check) => check.id === "organization-provisioning");
      expect(oidcGovernance).toEqual(expect.objectContaining({
        status: "pass",
        evidence: expect.arrayContaining([
          "enterpriseDeploymentMode=self-managed",
          "institutionIdentityEvidence=not-applicable"
        ])
      }));
      expect(provisioningGovernance).toEqual(expect.objectContaining({
        status: "pass",
        evidence: expect.arrayContaining([
          "enterpriseDeploymentMode=self-managed",
          "provisioningMode=manual-local"
        ])
      }));
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DEPLOYMENT_MODE;
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_MFA_ENCRYPTION_KEY;
      delete process.env.SENA_CSRF_SECRET;
      vi.unstubAllEnvs();
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("accepts the local webhook sink as self-managed enterprise bridge evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-self-managed-sink-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DEPLOYMENT_MODE = "self-managed";
    process.env.SENA_SELF_MANAGED_WEBHOOK_SINK = "local";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";

    try {
      const enterprise = await import("../enterprise");
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const bridgeIds = [
        "backup-webhook",
        "alert-webhook",
        "database-sync-webhook",
        "object-storage-webhook",
        "collaboration-pubsub",
        "notification-webhook",
        "email-webhook",
        "audit-webhook"
      ];

      for (const id of bridgeIds) {
        const item = readiness.blocking.find((candidate) => candidate.id === id);
        expect(item?.status).toBe("pass");
        expect(item?.evidence).toEqual(expect.arrayContaining([
          "provider=local-sink",
          "selfManagedSink=local"
        ]));
      }

      expect(readiness.environment).toEqual(expect.objectContaining({
        notificationWebhookConfigured: true,
        emailWebhookConfigured: true,
        collaborationPubSubWebhookConfigured: true,
        databaseSyncWebhookConfigured: true,
        objectStorageWebhookConfigured: true,
        backupWebhookConfigured: true,
        alertWebhookConfigured: true,
        auditWebhookConfigured: true
      }));
    } finally {
      clearInstitutionAuthEnv();
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("treats institution identity readiness checks as local-auth evidence in self-managed mode", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-self-managed-readiness-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DEPLOYMENT_MODE = "self-managed";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";

    try {
      const enterprise = await import("../enterprise");
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const identityIds = [
        "oidc-provider",
        "provisioning-token",
        "identity-evidence-host-allowlist",
        "identity-secret-version-binding",
        "identity-secret-store-reference",
        "identity-secret-rotation-cadence",
        "identity-idp-tenant-binding",
        "identity-lifecycle-owner-mode"
      ];

      for (const id of identityIds) {
        const item = readiness.blocking.find((candidate) => candidate.id === id);
        expect(item?.status).toBe("pass");
        expect(item?.evidence).toEqual(expect.arrayContaining([
          "enterpriseDeploymentMode=self-managed",
          "institutionIdentityEvidence=not-applicable"
        ]));
      }
    } finally {
      clearInstitutionAuthEnv();
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("delivers self-managed local sink queues without outbound webhook fetch", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-self-managed-local-delivery-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DEPLOYMENT_MODE = "self-managed";
    process.env.SENA_SELF_MANAGED_WEBHOOK_SINK = "local";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";

    const originalFetch = globalThis.fetch;
    let outboundFetchCalled = false;
    globalThis.fetch = (async () => {
      outboundFetchCalled = true;
      throw new Error("self-managed local sink must not call outbound fetch");
    }) as typeof fetch;

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Self Managed Owner",
        email: "self-managed-owner@example.edu",
        password: "sena-secure-123",
        organization: "Self Managed Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      enterprise.createEnterpriseInvitation(registered.context, {
        teamId,
        email: "local-sink-reviewer@example.edu",
        role: "reviewer",
        baseUrl: "https://sena-self-managed.example.test"
      });

      const notificationDelivery = await enterprise.deliverEnterpriseNotifications(registered.context, { teamId, force: true });
      expect(notificationDelivery.provider.mode).toBe("local-sink");
      expect(notificationDelivery.summary.delivered).toBeGreaterThan(0);
      expect(notificationDelivery.notifications.every((notification) => notification.webhookStatus === "delivered")).toBe(true);

      const emailDelivery = await enterprise.deliverEnterpriseEmails(registered.context, { teamId, force: true });
      expect(emailDelivery.provider.mode).toBe("local-sink");
      expect(emailDelivery.summary.delivered).toBeGreaterThan(0);
      expect(emailDelivery.emails.every((email) => email.emailStatus === "delivered")).toBe(true);

      const backup = enterprise.createEnterpriseBackup(registered.context, { teamId });
      const backupDelivery = await enterprise.deliverEnterpriseBackup(registered.context, { backup });
      expect(backupDelivery.provider.mode).toBe("local-sink");
      expect(backupDelivery.status).toBe("delivered");
      expect(backupDelivery.delivery.webhookStatus).toBe("delivered");
      expect(backupDelivery.delivery.endpointHash).toHaveLength(64);
      expect(outboundFetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      clearInstitutionAuthEnv();
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("does not block capability audit on native SaaS platform decisions in self-managed mode", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-self-managed-platform-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DEPLOYMENT_MODE = "self-managed";
    process.env.SENA_SELF_MANAGED_WEBHOOK_SINK = "local";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_AUDIT_RETENTION_DAYS = "3650";
    process.env.SENA_ALERTING_OWNER = "SENA self-managed operator";
    process.env.SENA_ALERTING_CHANNEL = "local-ops";
    process.env.SENA_ALERTING_RUNBOOK_URL = "https://sena-self-managed.example.test/runbook";

    try {
      const enterprise = await import("../enterprise");
      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const selfManagedDecisionIds = [
        "native-managed-database",
        "native-managed-object-storage",
        "native-collaboration-pubsub",
        "deployment-alerting-escalation",
        "institution-email-provider",
        "native-audit-siem-adapter",
        "native-managed-backup-storage",
        "full-saas-backend-operations"
      ];
      const selfManagedDecisions = deployment.platformDecisionRegister.decisions
        .filter((decision) => selfManagedDecisionIds.includes(decision.id));

      expect(selfManagedDecisions).toHaveLength(selfManagedDecisionIds.length);
      expect(selfManagedDecisions).toEqual(expect.arrayContaining(selfManagedDecisionIds.map((id) => expect.objectContaining({
        id,
        productionBlocking: false,
        acceptedBridge: true
      }))));
      expect(deployment.platformDecisionRegister.summary.productionBlocking).toBe(0);
      expect(deployment.platformDecisionRegister.summary.open).toBe(0);
      expect(deployment.nativeAdapterCertification.summary.productionBlocking).toBe(0);
      expect(deployment.nativeAdapterCertification.adapters.every((adapter) => adapter.productionBlocking === false)).toBe(true);
      expect(deployment.saasOperationsReadiness.status).not.toBe("blocked");

      const capabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      expect(capabilityAudit.capabilities.flatMap((capability) => capability.remainingPlatformDecisions)).toEqual([]);
      expect(capabilityAudit.summary.platformDecisionItems).toBe(0);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_AUDIT_RETENTION_DAYS;
      delete process.env.SENA_ALERTING_OWNER;
      delete process.env.SENA_ALERTING_CHANNEL;
      delete process.env.SENA_ALERTING_RUNBOOK_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("keeps auth capability in review until institution IdP production evidence is resolved", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const capabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const authCapability = capabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");

      expect(authCapability).toBeTruthy();
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "idpTenantApproval=open",
        "ssoSecrets=institution:missing|google:missing|orcid:missing",
        "ssoPreflightStatus=review",
        "scimProvisioningOwner=open",
        "provisioningToken=review",
        "secretHardening=review",
        "secretRotation=review",
        "cutoverChecklist=review"
      ]));
      expect(authCapability?.evidence.some((entry) => /^cutoverBlockers=\d+$/.test(entry))).toBe(true);
      expect(authCapability?.requiredArtifacts).toEqual(expect.arrayContaining([
        "sena-enterprise-deployment-readiness/v1",
        "sena-enterprise-security-posture/v1",
        "sena-enterprise-platform-decision-register/v1",
        "sena-enterprise-identity-production-evidence/v1",
        "sena-enterprise-identity-cutover-checklist/v1",
        "sena-enterprise-provisioning/v1",
        "sena-scim-provisioning-bridge/v1"
      ]));
      expect(authCapability?.productionContractTestIds).toEqual(expect.arrayContaining([
        "enterprise-sso-preflight",
        "enterprise-provisioning-readiness",
        "enterprise-platform-decision-register-export",
        "enterprise-ops-readiness-export"
      ]));
      expect(authCapability?.nextAction).toContain("institution IdP tenant approval");
      expect(JSON.stringify(capabilityAudit)).not.toContain("CLIENT_SECRET");
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("surfaces identity production evidence submission guardrails in the auth capability audit", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-identity-guardrails-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const capabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const authCapability = capabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const identityActionPlan = identityEvidence.institutionActionPlan as typeof identityEvidence.institutionActionPlan & {
        submissionMatrix?: {
          schemaVersion?: string;
          summary?: {
            rows?: number;
            blockingRows?: number;
            platformEvidenceRows?: number;
            technicalPrerequisiteRows?: number;
            rotationRows?: number;
            requiredArtifactDigestRows?: number;
            requiredVerifiedAtRows?: number;
            requiredEvidenceUrlRows?: number;
          };
          redaction?: {
            secretValuesExcluded?: boolean;
            evidenceUrlValuesExcluded?: boolean;
            ownerNamesExcluded?: boolean;
            submissionDraftEvidenceUrlFieldOnly?: boolean;
          };
          rows?: Array<{
            laneId?: string;
            ownerRole?: string;
            decisionId?: string;
            evidenceId?: string;
            evidenceSource?: string;
            status?: string;
            blocking?: boolean;
            cutoverItemIds?: string[];
            submissionRequired?: boolean;
            technicalPrerequisite?: boolean;
            rotationEvidence?: boolean;
            requiredBodyFields?: string[];
            requiresEvidenceUrl?: boolean;
            requiresProductionEvidenceArtifactDigest?: boolean;
            requiresProductionEvidenceVerifiedAt?: boolean;
            requestPacketPolicyHash?: string;
            responseAuditHeaders?: string[];
            receiptArchiveBodyPaths?: string[];
          }>;
        };
        ownerRunbooks?: {
          schemaVersion?: string;
          summary?: {
            lanes?: number;
            blockingRunbooks?: number;
            preflightChecks?: number;
            submissionSteps?: number;
            receiptArchiveSteps?: number;
            releaseGateBlockers?: number;
          };
          redaction?: {
            secretValuesExcluded?: boolean;
            evidenceUrlValuesExcluded?: boolean;
            ownerNamesExcluded?: boolean;
            submissionDraftEvidenceUrlFieldOnly?: boolean;
          };
          runbooks?: Array<{
            laneId?: string;
            ownerRole?: string;
            status?: string;
            decisionIds?: string[];
            cutoverItemIds?: string[];
            missingProductionEvidenceIds?: string[];
            missingTechnicalPrerequisiteEvidenceIds?: string[];
            rotationEvidenceIds?: string[];
            preflightChecks?: Array<{
              id?: string;
              status?: string;
              required?: boolean;
              envVars?: string[];
              evidenceIds?: string[];
            }>;
            submissionSteps?: Array<{
              decisionId?: string;
              method?: string;
              path?: string;
              requiredBodyFields?: string[];
              productionEvidenceIds?: string[];
              requestPacketPolicyHash?: string;
              responseAuditHeaders?: string[];
            }>;
            receiptArchiveSteps?: Array<{
              decisionId?: string;
              archiveStatus?: string;
              requiredHeaders?: string[];
              requiredBodyPaths?: string[];
              missingArchiveInputs?: string[];
            }>;
            releaseGateBlockers?: string[];
            nextActions?: string[];
          }>;
        };
      };
      const idpRequest = identityEvidence.platformRequestPacket.requests
        .find((request) => request.decisionId === "institution-idp-approval");
      const provisioningRequest = identityEvidence.platformRequestPacket.requests
        .find((request) => request.decisionId === "institution-provisioning-owner");

      expect(identityActionPlan.submissionMatrix).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-submission-matrix/v1",
        redaction: {
          secretValuesExcluded: true,
          evidenceUrlValuesExcluded: true,
          ownerNamesExcluded: true,
          submissionDraftEvidenceUrlFieldOnly: true
        },
        summary: expect.objectContaining({
          rows: identityEvidence.requirements.length,
          blockingRows: identityEvidence.requirements.filter((requirement) => requirement.status === "missing").length,
          platformEvidenceRows: identityEvidence.requirements.filter((requirement) => requirement.source === "platform-acceptance").length,
          technicalPrerequisiteRows: identityEvidence.requirements.filter((requirement) => requirement.source === "technical-readiness").length,
          rotationRows: 2,
          requiredArtifactDigestRows: identityEvidence.requirements.filter((requirement) => requirement.source === "platform-acceptance").length,
          requiredVerifiedAtRows: identityEvidence.requirements.filter((requirement) => requirement.source === "platform-acceptance").length,
          requiredEvidenceUrlRows: identityEvidence.requirements.filter((requirement) => requirement.source === "platform-acceptance").length
        })
      }));
      expect(identityActionPlan.submissionMatrix?.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          laneId: "institution-idp-owner",
          ownerRole: "Institution IdP owner",
          decisionId: "institution-idp-approval",
          evidenceId: "idp-tenant-approval",
          evidenceSource: "platform-acceptance",
          status: "missing",
          blocking: true,
          cutoverItemIds: ["idp-tenant-approval"],
          submissionRequired: true,
          technicalPrerequisite: false,
          rotationEvidence: false,
          requiredBodyFields: identityEvidence.platformRequestPacket.submission.identityProductionEvidenceBodyFields,
          requiresEvidenceUrl: true,
          requiresProductionEvidenceArtifactDigest: true,
          requiresProductionEvidenceVerifiedAt: true,
          requestPacketPolicyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          responseAuditHeaders: expectedIdentityResponseAuditHeaders,
          receiptArchiveBodyPaths: expectedIdentityReceiptArchiveBodyPaths
        }),
        expect.objectContaining({
          laneId: "institution-idp-owner",
          decisionId: "institution-idp-approval",
          evidenceId: "sso-secret-rotation",
          evidenceSource: "platform-acceptance",
          cutoverItemIds: ["identity-secret-rotation"],
          submissionRequired: true,
          rotationEvidence: true,
          requiresProductionEvidenceArtifactDigest: true,
          requiresProductionEvidenceVerifiedAt: true
        }),
        expect.objectContaining({
          laneId: "institution-provisioning-owner",
          ownerRole: "Institution provisioning owner",
          decisionId: "institution-provisioning-owner",
          evidenceId: "scim-or-idp-ownership",
          evidenceSource: "platform-acceptance",
          cutoverItemIds: ["scim-idp-ownership"],
          submissionRequired: true,
          technicalPrerequisite: false,
          requiresEvidenceUrl: true
        }),
        expect.objectContaining({
          laneId: "institution-provisioning-owner",
          ownerRole: "Institution provisioning owner",
          decisionId: "institution-provisioning-owner",
          evidenceId: "identity-lifecycle-owner-mode",
          evidenceSource: "technical-readiness",
          cutoverItemIds: ["scim-idp-ownership"],
          submissionRequired: false,
          technicalPrerequisite: true,
          requiredBodyFields: [],
          requiresEvidenceUrl: false,
          requiresProductionEvidenceArtifactDigest: false,
          requiresProductionEvidenceVerifiedAt: false
        })
      ]));
      expect(JSON.stringify(identityActionPlan.submissionMatrix)).not.toContain(productionLikeInstitutionSsoSecret);
      expect(JSON.stringify(identityActionPlan.submissionMatrix)).not.toContain(productionLikeProvisioningToken);
      expect(JSON.stringify(identityActionPlan.submissionMatrix)).not.toContain("https://<institution-evidence-host>");

      expect(identityActionPlan.ownerRunbooks).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-owner-runbook/v1",
        redaction: {
          secretValuesExcluded: true,
          evidenceUrlValuesExcluded: true,
          ownerNamesExcluded: true,
          submissionDraftEvidenceUrlFieldOnly: true
        },
        summary: expect.objectContaining({
          lanes: 2,
          blockingRunbooks: 2,
          preflightChecks: expect.any(Number),
          submissionSteps: 2,
          receiptArchiveSteps: 2,
          releaseGateBlockers: expect.any(Number)
        })
      }));
      expect(identityActionPlan.ownerRunbooks?.summary?.preflightChecks).toBeGreaterThanOrEqual(8);
      expect(identityActionPlan.ownerRunbooks?.summary?.releaseGateBlockers).toBeGreaterThanOrEqual(4);
      expect(identityActionPlan.ownerRunbooks?.runbooks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          laneId: "institution-idp-owner",
          ownerRole: "Institution IdP owner",
          status: "review",
          decisionIds: ["institution-idp-approval"],
          cutoverItemIds: ["idp-tenant-approval", "sso-secret-custody", "identity-secret-rotation"],
          missingProductionEvidenceIds: expect.arrayContaining([
            "idp-tenant-approval",
            "idp-callback-approval",
            "sso-provider-secrets",
            "sso-secret-store-reference",
            "sso-secret-rotation"
          ]),
          missingTechnicalPrerequisiteEvidenceIds: expect.arrayContaining([
            "sso-preflight"
          ]),
          rotationEvidenceIds: ["sso-secret-rotation"],
          preflightChecks: expect.arrayContaining([
            expect.objectContaining({
              id: "idp-tenant-technical-binding",
              status: "review",
              required: true,
              envVars: ["SENA_SSO_INSTITUTION_TENANT_ID"],
              evidenceIds: ["idp-tenant-binding", "idp-tenant-approval"]
            }),
            expect.objectContaining({
              id: "sso-secret-custody-binding",
              status: "review",
              required: true,
              envVars: ["SENA_SSO_INSTITUTION_CLIENT_SECRET_REF", "SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION"],
              evidenceIds: ["sso-provider-secrets", "sso-secret-store-reference", "sso-client-secret-version", "sso-secret-store-binding"]
            }),
            expect.objectContaining({
              id: "identity-secret-rotation-cadence",
              status: "review",
              required: true,
              envVars: ["SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS"],
              evidenceIds: ["sso-secret-rotation", "identity-secret-rotation-cadence"]
            })
          ]),
          submissionSteps: [expect.objectContaining({
            decisionId: "institution-idp-approval",
            method: "POST",
            path: "/api/sena/ops/platform-decisions",
            requiredBodyFields: identityEvidence.platformRequestPacket.submission.requiredBodyFields,
            productionEvidenceIds: expect.arrayContaining([
              "idp-tenant-approval",
              "idp-callback-approval",
              "sso-provider-secrets",
              "sso-secret-store-reference",
              "sso-secret-rotation"
            ]),
            requestPacketPolicyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            responseAuditHeaders: expectedIdentityResponseAuditHeaders
          })],
          receiptArchiveSteps: [expect.objectContaining({
            decisionId: "institution-idp-approval",
            archiveStatus: "missing-receipt",
            requiredHeaders: expectedIdentityResponseAuditHeaders,
            requiredBodyPaths: expectedIdentityReceiptArchiveBodyPaths,
            missingArchiveInputs: ["productionEvidenceReceipt"]
          })],
          releaseGateBlockers: expect.arrayContaining([
            "idp-tenant-approval",
            "sso-secret-custody",
            "identity-secret-rotation"
          ])
        }),
        expect.objectContaining({
          laneId: "institution-provisioning-owner",
          ownerRole: "Institution provisioning owner",
          status: "review",
          decisionIds: ["institution-provisioning-owner"],
          cutoverItemIds: ["scim-idp-ownership", "identity-secret-rotation"],
          missingProductionEvidenceIds: expect.arrayContaining([
            "provisioning-owner",
            "scim-or-idp-ownership",
            "bearer-token-rotation",
            "lifecycle-guardrails"
          ]),
          missingTechnicalPrerequisiteEvidenceIds: expect.arrayContaining([
            "provisioning-token"
          ]),
          rotationEvidenceIds: ["bearer-token-rotation"],
          preflightChecks: expect.arrayContaining([
            expect.objectContaining({
              id: "scim-lifecycle-owner-mode",
              status: "review",
              required: true,
              envVars: ["SENA_IDENTITY_LIFECYCLE_OWNER_MODE"],
              evidenceIds: ["identity-lifecycle-owner-mode", "scim-or-idp-ownership"]
            }),
            expect.objectContaining({
              id: "provisioning-token-custody-binding",
              status: "review",
              required: true,
              envVars: ["SENA_PROVISIONING_TOKEN_SECRET_REF", "SENA_PROVISIONING_TOKEN_VERSION"],
              evidenceIds: ["provisioning-token-secret-ref", "provisioning-token-version", "bearer-token-rotation"]
            })
          ]),
          submissionSteps: [expect.objectContaining({
            decisionId: "institution-provisioning-owner",
            method: "POST",
            path: "/api/sena/ops/platform-decisions",
            requiredBodyFields: identityEvidence.platformRequestPacket.submission.requiredBodyFields,
            productionEvidenceIds: expect.arrayContaining([
              "provisioning-owner",
              "scim-or-idp-ownership",
              "bearer-token-rotation",
              "lifecycle-guardrails"
            ]),
            requestPacketPolicyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            responseAuditHeaders: expectedIdentityResponseAuditHeaders
          })],
          receiptArchiveSteps: [expect.objectContaining({
            decisionId: "institution-provisioning-owner",
            archiveStatus: "missing-receipt",
            requiredHeaders: expectedIdentityResponseAuditHeaders,
            requiredBodyPaths: expectedIdentityReceiptArchiveBodyPaths,
            missingArchiveInputs: ["productionEvidenceReceipt"]
          })],
          releaseGateBlockers: expect.arrayContaining([
            "scim-idp-ownership",
            "identity-secret-rotation"
          ])
        })
      ]));
      expect(JSON.stringify(identityActionPlan.ownerRunbooks)).not.toContain(productionLikeInstitutionSsoSecret);
      expect(JSON.stringify(identityActionPlan.ownerRunbooks)).not.toContain(productionLikeProvisioningToken);
      expect(JSON.stringify(identityActionPlan.ownerRunbooks)).not.toContain("https://<institution-evidence-host>");

      expect(identityEvidence.platformRequestPacket.submission.responseAuditHeaders).toEqual(expectedIdentityResponseAuditHeaders);
      expect(identityEvidence.platformRequestPacket.submission.receiptArchivePolicy).toEqual({
        required: true,
        digestAlgorithm: "sha256",
        digestHeader: "x-sena-identity-production-receipt-digest",
        digestScope: "current-validation-snapshot",
        stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest",
        stableSubmissionDigestScope: "platform-submission-inputs",
        stableSubmissionDigestInputFields: expectedIdentityStableSubmissionDigestInputFields,
        archiveHeaders: expectedIdentityResponseAuditHeaders,
        archiveBodyPaths: expectedIdentityReceiptArchiveBodyPaths,
        redaction: {
          secretValuesExcluded: true,
          evidenceUrlValuesExcluded: true,
          evidenceUrlsHashed: true,
          ownerNamesHashed: true,
          productionEvidenceTimestampsHashed: true
        }
      });
      expect(identityEvidence.receiptArchiveManifest).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-receipt-archive-manifest/v1",
        archivePolicy: identityEvidence.platformRequestPacket.submission.receiptArchivePolicy,
        summary: expect.objectContaining({
          decisions: 2,
          readyForArchive: 0,
          reviewArchives: 0,
          missingReceipts: 2,
          missingArchiveInputCounts: {
            productionEvidenceReceipt: 2
          },
          artifactCompletenessCounts: {
            missing: 2
          },
          digestHeader: "x-sena-identity-production-receipt-digest",
          stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest",
          archiveBodyPaths: expectedIdentityReceiptArchiveBodyPaths
        }),
        decisions: expect.arrayContaining([
          expect.objectContaining({
            decisionId: "institution-idp-approval",
            archiveStatus: "missing-receipt",
            responseAuditHeaders: expectedIdentityResponseAuditHeaders,
            archiveBodyPaths: expectedIdentityReceiptArchiveBodyPaths,
            missingArchiveInputs: ["productionEvidenceReceipt"]
          }),
          expect.objectContaining({
            decisionId: "institution-provisioning-owner",
            archiveStatus: "missing-receipt",
            responseAuditHeaders: expectedIdentityResponseAuditHeaders,
            archiveBodyPaths: expectedIdentityReceiptArchiveBodyPaths,
            missingArchiveInputs: ["productionEvidenceReceipt"]
          })
        ])
      }));
      expect(identityEvidence.receiptArchiveManifest.evidence).toContain(
        "receiptArchiveMissingInputs=productionEvidenceReceipt:2"
      );
      expect(identityEvidence.receiptArchiveManifest.evidence).toContain(
        "receiptArchiveArtifactCompleteness=complete:0|partial:0|missing:2"
      );
      expect(identityEvidence.receiptArchiveManifest.evidence).toContain(
        `receiptArchiveHeaders=${expectedIdentityResponseAuditHeaders.join("|")}`
      );
      expect(identityEvidence.evidence).toContain(
        "receiptArchiveMissingInputs=productionEvidenceReceipt:2"
      );
      expect(identityEvidence.evidence).toContain(
        "receiptArchiveArtifactCompleteness=complete:0|partial:0|missing:2"
      );
      expect(identityEvidence.evidence).toContain(
        `receiptArchiveHeaders=${expectedIdentityResponseAuditHeaders.join("|")}`
      );
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "identityRequestPacket=sena-enterprise-identity-platform-decision-request-packet/v1",
        `identityRequests=${identityEvidence.platformRequestPacket.summary.requests}`,
        `identityRequestBlockers=${identityEvidence.platformRequestPacket.summary.blockingRequests}`,
        `identityMissingProductionEvidence=${identityEvidence.platformRequestPacket.summary.missingProductionEvidence}`,
        `identityMissingTechnicalPrerequisites=${identityEvidence.platformRequestPacket.summary.missingTechnicalPrerequisites}`,
        `identityReadyRequests=${identityEvidence.platformRequestPacket.summary.readyRequests}`,
        `identityIdpMissingProductionEvidenceIds=${idpRequest?.missingProductionEvidenceIds.join("|") || "none"}`,
        `identityProvisioningMissingProductionEvidenceIds=${provisioningRequest?.missingProductionEvidenceIds.join("|") || "none"}`,
        `identityIdpMissingTechnicalPrerequisites=${idpRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none"}`,
        `identityProvisioningMissingTechnicalPrerequisites=${provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none"}`,
        "identityReceiptReviewRequests=0",
        `identityProductionEvidenceSubmission=${identityEvidence.platformRequestPacket.submission.method}:${identityEvidence.platformRequestPacket.submission.path}`,
        `identityProductionEvidenceResponseSchema=${identityEvidence.platformRequestPacket.submission.responseSchema}`,
        `identityResponseAuditHeaders=${expectedIdentityResponseAuditHeaders.join("|")}`,
        `identityReceiptArchivePolicy=required;digestHeader=x-sena-identity-production-receipt-digest;stableDigestHeader=x-sena-identity-submitted-evidence-digest;bodyPaths=${expectedIdentityReceiptArchiveBodyPaths.join("|")}`,
        "identityReceiptArchiveManifest=sena-enterprise-identity-receipt-archive-manifest/v1",
        "identityReceiptArchiveReadyForArchive=0",
        "identityReceiptArchiveMissingReceipts=2",
        "identityReceiptArchiveMissingInputs=productionEvidenceReceipt:2",
        "identityReceiptArchiveArtifactCompleteness=complete:0|partial:0|missing:2",
        `identityProductionEvidenceRequiredAcceptedStatus=${identityEvidence.platformRequestPacket.submission.requiredAcceptedStatus}`,
        `identityProductionEvidenceRequiredAcceptedBridge=${identityEvidence.platformRequestPacket.submission.requiredAcceptedBridge}`,
        "identityEvidenceUrlPolicy=https|institution-owned|required;forbidden=local-or-private|sena-application-origin|reserved-example-or-test",
        "identityEvidenceUrlRequiredForProductionEvidence=true",
        "identityEvidenceUrlPath=specific-path-required",
        "identityEvidenceUrlSecretCarriers=credentials|fragments|sensitive-query-rejected",
        "identityEvidenceUrlAllowedHosts=not-configured",
        "identityEvidenceUrlHostBinding=review",
        "identityEvidenceAllowedHostConfig=not-configured",
        "identityEvidenceAllowedHosts=0",
        "identityEvidenceInvalidAllowedHosts=0",
        "identityNotesSecretCarriers=sensitive-assignments|bearer-tokens-rejected",
        "identityFreeTextSecretCarriers=ownerName|ownerRole|environment|notes",
        "identityProductionEvidenceVerifiedAt=required|past-or-present|canonical-iso",
        "identityOwnerRolePolicy=forbidden:sena;institution:institution|institutional|university|college|school|district|campus|academy;idp:identity|idp|iam|sso|oidc|platform|security;provisioning:identity|provisioning|scim|idp|iam|lifecycle|platform|security",
        "identitySenaAppOrigin=hash-present",
        "identityRedaction=secret-values-excluded|evidence-url-values-excluded"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("marks auth capability ready after SSO preflight, secret hardening, provisioning, and platform acceptance", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-ready-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Owner",
        email: "institution-owner@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });

      const preAcceptanceAudit = enterprise.getEnterpriseCapabilityAudit();
      const preAcceptanceAuth = preAcceptanceAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(preAcceptanceAuth?.status).toBe("review");
      expect(preAcceptanceAuth?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(preAcceptanceAuth?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "idpTenantApproval=ready-without-platform-acceptance",
        "scimProvisioningOwner=ready-without-platform-acceptance"
      ]));
      expect(preAcceptanceAuth?.nextAction).toContain("Record institution IdP tenant approval with owner evidence URL.");
      const preAcceptanceDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const preAcceptanceRegister = preAcceptanceDeployment.platformDecisionRegister;
      const preAcceptanceIdentityDecisions = preAcceptanceRegister.decisions
        .filter((decision) => decision.id === "institution-idp-approval" || decision.id === "institution-provisioning-owner");
      expect(preAcceptanceIdentityDecisions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "institution-idp-approval", status: "ready", productionBlocking: true, acceptedBridge: false }),
        expect.objectContaining({ id: "institution-provisioning-owner", status: "ready", productionBlocking: true, acceptedBridge: false })
      ]));
      expect(preAcceptanceRegister.summary.productionBlocking).toBeGreaterThanOrEqual(2);
      expect(preAcceptanceRegister.nextActions.join(" ")).toContain("provider-side callback or redirect URI approval");
      expect(preAcceptanceRegister.nextActions.join(" ")).toContain("provisioning lifecycle operations");
      const preAcceptanceIdpDecision = preAcceptanceIdentityDecisions.find((decision) => decision.id === "institution-idp-approval") as typeof preAcceptanceIdentityDecisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean }>;
      };
      const preAcceptanceProvisioningDecision = preAcceptanceIdentityDecisions.find((decision) => decision.id === "institution-provisioning-owner") as typeof preAcceptanceIdentityDecisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean }>;
      };
      expect(preAcceptanceIdpDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "idp-tenant-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "idp-callback-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-secret-rotation", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-secret-store-reference", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-provider-secrets", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-preflight", status: "present", productionRequired: true })
      ]));
      expect(preAcceptanceProvisioningDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "provisioning-owner", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "scim-or-idp-ownership", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "lifecycle-guardrails", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "provisioning-secret-store-reference", status: "present", productionRequired: true }),
        expect.objectContaining({ id: "provisioning-token", status: "present", productionRequired: true })
      ]));
      const preAcceptanceIdentityAdapters = preAcceptanceDeployment.nativeAdapterCertification.adapters
        .filter((adapter) => adapter.decisionId === "institution-idp-approval" || adapter.decisionId === "institution-provisioning-owner");
      expect(preAcceptanceIdentityAdapters).toEqual(expect.arrayContaining([
        expect.objectContaining({ decisionId: "institution-idp-approval", status: "native-ready", productionBlocking: true, acceptedBridge: false }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", status: "native-ready", productionBlocking: true, acceptedBridge: false })
      ]));
      expect(preAcceptanceDeployment.saasOperationsReadiness.summary.nativeAdapterProductionBlocking).toBeGreaterThanOrEqual(2);

      const weakIdpAcceptanceResponse = enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-tenant-approval",
        notes: "Approved for pilot."
      });
      const weakProvisioningAcceptanceResponse = enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/scim-owner-approval",
        notes: "Approved for pilot."
      });
      expect(JSON.stringify(weakIdpAcceptanceResponse)).not.toContain("https://ops.institution.edu/sena/idp-tenant-approval");
      expect(JSON.stringify(weakProvisioningAcceptanceResponse)).not.toContain("https://ops.institution.edu/sena/scim-owner-approval");
      const weakAcceptanceAudit = enterprise.getEnterpriseCapabilityAudit();
      const weakAcceptanceAuth = weakAcceptanceAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      const weakAcceptanceGoLive = weakAcceptanceAudit.capabilities.find((capability) => capability.id === "go-live-operations");
      expect(weakAcceptanceAuth?.status).toBe("review");
      expect(weakAcceptanceAuth?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(weakAcceptanceGoLive?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(weakAcceptanceAuth?.evidence).toEqual(expect.arrayContaining([
        "idpTenantApproval=accepted-bridge-missing-evidence",
        "scimProvisioningOwner=accepted-bridge-missing-evidence",
        "idpAcceptanceEvidence=tenant:false|callback:false|providerSecrets:false|secretStoreReference:false|secretRotation:false|evidenceUrl:true",
        "scimAcceptanceEvidence=owner:false|scimOrIdp:false|bearerTokenRotation:false|lifecycleGuardrails:false|evidenceUrl:true"
      ]));
      const weakAcceptanceDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      expect(weakAcceptanceDeployment.platformDecisionRegister.summary.productionBlocking).toBeGreaterThanOrEqual(2);
      expect(weakAcceptanceDeployment.platformDecisionRegister.summary.acceptedBridgeMissingEvidence).toBeGreaterThanOrEqual(2);
      expect((weakAcceptanceDeployment as typeof weakAcceptanceDeployment & {
        identityProductionHandoff?: {
          schemaVersion: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          platformRequestPacket: {
            schemaVersion: string;
            summary: {
              blockingRequests: number;
              missingProductionEvidence: number;
            };
            requests: Array<{
              decisionId: string;
              missingProductionEvidenceIds: string[];
            }>;
          };
        };
      }).identityProductionHandoff).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-evidence/v1",
        evidenceManifest: expect.objectContaining({
          missingEvidenceIds: expect.arrayContaining([
            "idp-tenant-approval",
            "idp-callback-approval",
            "sso-provider-secrets",
            "sso-secret-store-reference",
            "sso-secret-rotation",
            "provisioning-owner",
            "scim-or-idp-ownership",
            "bearer-token-rotation",
            "lifecycle-guardrails"
          ])
        }),
        platformRequestPacket: expect.objectContaining({
          schemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1",
          summary: expect.objectContaining({
            blockingRequests: 2,
            missingProductionEvidence: 9
          }),
          requests: expect.arrayContaining([
            expect.objectContaining({
              decisionId: "institution-idp-approval",
              missingProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
            }),
            expect.objectContaining({
              decisionId: "institution-provisioning-owner",
              missingProductionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]
            })
          ])
        })
      }));
      const weakAcceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances> & {
        summary: ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances>["summary"] & {
          acceptedBridgeMissingEvidence?: number;
        };
        acceptances: Array<ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances>["acceptances"][number] & {
          productionEvidenceReceipt?: {
            schemaVersion: string;
            allowedEvidenceIds: string[];
            submittedEvidenceIds: string[];
            acceptedEvidenceIds: string[];
            missingEvidenceIds: string[];
            evidenceUrlHash?: string;
          };
        }>;
      };
      expect(weakAcceptanceList.summary.acceptedBridgeMissingEvidence).toBeGreaterThanOrEqual(2);
      const weakIdpAcceptance = weakAcceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval");
      const weakProvisioningAcceptance = weakAcceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-provisioning-owner");
      expect(JSON.stringify(weakAcceptanceList)).not.toContain("https://ops.institution.edu/sena/idp-tenant-approval");
      expect(JSON.stringify(weakAcceptanceList)).not.toContain("https://ops.institution.edu/sena/scim-owner-approval");
      expect(weakIdpAcceptance?.productionEvidenceReceipt).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-platform-decision-production-evidence-receipt/v1",
        allowedEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
        submittedEvidenceIds: [],
        missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
        evidenceUrlHash: weakIdpAcceptance?.evidenceUrlHash
      }));
      expect(weakProvisioningAcceptance?.productionEvidenceReceipt).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-platform-decision-production-evidence-receipt/v1",
        allowedEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]),
        submittedEvidenceIds: [],
        missingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]),
        evidenceUrlHash: weakProvisioningAcceptance?.evidenceUrlHash
      }));
      expect(weakAcceptanceDeployment.platformDecisionRegister.nextActions.join(" ")).toContain("callback");
      expect(weakAcceptanceDeployment.platformDecisionRegister.nextActions.join(" ")).toContain("bearer-token rotation");
      expect(weakAcceptanceDeployment.saasOperationsReadiness.summary.nativeAdapterProductionBlocking).toBeGreaterThanOrEqual(2);
      expect(weakAcceptanceDeployment.saasOperationsReadiness.summary.blockers).toContain("native-adapter-certification-production-blockers");
      const weakIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          schemaVersion: string;
          status: string;
          summary: { missing: number; platformBlocking: number; technicalBlocking: number };
          decisions: Array<{ id: string }>;
          requirements: Array<{ id: string; decisionId: string; status: string; source: string }>;
          acceptanceReceipts: Array<{
            decisionId: string;
            status: string;
            acceptedBridge: boolean;
            evidenceUrlHash?: string;
            productionEvidenceReceipt?: {
              submittedEvidenceIds: string[];
              missingEvidenceIds: string[];
            };
          }>;
          evidenceManifest: {
            schemaVersion: string;
            requiredEvidenceIds: string[];
            acceptedEvidenceIds: string[];
            presentEvidenceIds: string[];
            missingEvidenceIds: string[];
            platformAcceptanceEvidenceIds: string[];
            technicalReadinessEvidenceIds: string[];
            byDecision: Array<{
              decisionId: string;
              requiredEvidenceIds: string[];
              acceptedEvidenceIds: string[];
              presentEvidenceIds: string[];
              missingEvidenceIds: string[];
            }>;
          };
          cutoverChecklist: {
            schemaVersion: string;
            status: string;
            summary: {
              items: number;
              readyItems: number;
              blockingItems: number;
              artifactCompletenessCounts?: Record<string, number>;
            };
            items: Array<{
              id: string;
              label: string;
              status: string;
              artifactCompletenessStatus?: string;
              decisionIds: string[];
              evidenceIds: string[];
              acceptedEvidenceIds: string[];
              presentEvidenceIds: string[];
              missingEvidenceIds: string[];
              nextActions: string[];
            }>;
            evidence: string[];
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
          platformRequestPacket: {
            schemaVersion: string;
            redaction: {
              secretValuesExcluded: boolean;
              evidenceUrlValuesExcluded: boolean;
            };
            summary: {
              requests: number;
              blockingRequests: number;
              missingProductionEvidence: number;
              readyRequests: number;
            };
            submission: {
              method: string;
              path: string;
              responseSchema: string;
              requiredAcceptedStatus: string;
              requiredAcceptedBridge: boolean;
              evidenceUrlPolicy?: {
                requiredProtocol: string;
                institutionOwnedRequired: boolean;
                forbiddenHostKinds: string[];
                allowedHostHashes?: string[];
                allowedHostCount?: number;
              };
              ownerRolePolicy?: {
                forbiddenTokens: string[];
                requiredSemanticTokensByDecision: Record<string, string[]>;
              };
            };
            requests: Array<{
              decisionId: string;
              status: string;
              blocking: boolean;
              ownerRole?: string;
              environment?: string;
              evidenceUrlHash?: string;
              requestedProductionEvidenceIds: string[];
              acceptedProductionEvidenceIds: string[];
              missingProductionEvidenceIds: string[];
              technicalPrerequisiteEvidenceIds: string[];
              technicalEvidenceBinding?: {
                schemaVersion: string;
                decisionId: string;
                provider?: string;
                status: string;
                latestPreflightStatus?: string;
                configBinding?: string;
                configHashes?: Record<string, string>;
                evidence: string[];
              };
              submissionTemplate: {
                decisionId: string;
                status: string;
                acceptedBridge: boolean;
                ownerNamePolicy: {
                  specificInstitutionOwnerRequired: boolean;
                  genericPlaceholderRejected: boolean;
                  rejectedPlaceholderNames: string[];
                };
                productionEvidenceIds: string[];
                evidenceUrlPlaceholder: string;
              };
            }>;
          };
          nextActions: string[];
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(weakIdentityEvidence?.schemaVersion).toBe("sena-enterprise-identity-production-evidence/v1");
      expect(weakIdentityEvidence?.status).toBe("review");
      expect(weakIdentityEvidence?.summary.missing).toBeGreaterThanOrEqual(9);
      expect(weakIdentityEvidence?.summary.platformBlocking).toBeGreaterThanOrEqual(9);
      expect(weakIdentityEvidence?.summary.technicalBlocking).toBe(0);
      expect(weakIdentityEvidence?.decisions.map((decision) => decision.id)).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(weakIdentityEvidence?.requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ decisionId: "institution-idp-approval", id: "idp-tenant-approval", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-idp-approval", id: "idp-callback-approval", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-idp-approval", id: "sso-provider-secrets", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-idp-approval", id: "sso-secret-store-reference", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-idp-approval", id: "sso-secret-rotation", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", id: "provisioning-owner", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", id: "scim-or-idp-ownership", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", id: "bearer-token-rotation", status: "missing", source: "platform-acceptance" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", id: "lifecycle-guardrails", status: "missing", source: "platform-acceptance" })
      ]));
      expect(weakIdentityEvidence?.acceptanceReceipts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          status: "accepted",
          acceptedBridge: true,
          evidenceUrlHash: weakIdpAcceptance?.evidenceUrlHash,
          productionEvidenceReceipt: expect.objectContaining({
            submittedEvidenceIds: [],
            missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
          })
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          status: "accepted",
          acceptedBridge: true,
          evidenceUrlHash: weakProvisioningAcceptance?.evidenceUrlHash,
          productionEvidenceReceipt: expect.objectContaining({
            submittedEvidenceIds: [],
            missingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"])
          })
        })
      ]));
      expect(weakIdentityEvidence?.evidenceManifest.schemaVersion).toBe("sena-enterprise-identity-production-evidence-manifest/v1");
      expect(weakIdentityEvidence?.evidenceManifest.requiredEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation",
        "sso-provider-secrets",
        "sso-preflight",
        "sso-secret-store-reference",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails",
        "provisioning-token",
        "provisioning-secret-store-reference",
        "identity-lifecycle-owner-mode"
      ]));
      expect(weakIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(weakIdentityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight",
        "provisioning-token",
        "provisioning-secret-store-reference",
        "identity-lifecycle-owner-mode"
      ]));
      expect(weakIdentityEvidence?.evidenceManifest.platformAcceptanceEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(weakIdentityEvidence?.evidenceManifest.technicalReadinessEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight",
        "provisioning-token",
        "provisioning-secret-store-reference",
        "identity-lifecycle-owner-mode"
      ]));
      expect(weakIdentityEvidence?.evidenceManifest.byDecision).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          missingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"])
        })
      ]));
      expect(weakIdentityEvidence?.cutoverChecklist.schemaVersion).toBe("sena-enterprise-identity-cutover-checklist/v1");
      expect(weakIdentityEvidence?.cutoverChecklist.status).toBe("review");
      expect(weakIdentityEvidence?.cutoverChecklist.summary.items).toBe(4);
      expect(weakIdentityEvidence?.cutoverChecklist.summary.blockingItems).toBeGreaterThanOrEqual(3);
      expect(weakIdentityEvidence?.cutoverChecklist.summary.artifactCompletenessCounts).toEqual({
        missing: 2
      });
      expect(weakIdentityEvidence?.cutoverChecklist.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "idp-tenant-approval",
          artifactCompletenessStatus: "missing",
          decisionIds: ["institution-idp-approval"],
          evidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval"]),
          missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval"])
        }),
        expect.objectContaining({
          id: "sso-secret-custody",
          artifactCompletenessStatus: "missing",
          decisionIds: ["institution-idp-approval"],
          evidenceIds: expect.arrayContaining(["sso-provider-secrets", "sso-secret-store-reference"]),
          missingEvidenceIds: expect.arrayContaining(["sso-provider-secrets", "sso-secret-store-reference"])
        }),
        expect.objectContaining({
          id: "scim-idp-ownership",
          decisionIds: ["institution-provisioning-owner"],
          evidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "lifecycle-guardrails"]),
          missingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "lifecycle-guardrails"])
        }),
        expect.objectContaining({
          id: "identity-secret-rotation",
          decisionIds: ["institution-idp-approval", "institution-provisioning-owner"],
          evidenceIds: expect.arrayContaining(["sso-secret-rotation", "bearer-token-rotation"]),
          missingEvidenceIds: expect.arrayContaining(["sso-secret-rotation", "bearer-token-rotation"])
        })
      ]));
      expect(weakIdentityEvidence?.cutoverChecklist.evidence).toEqual(expect.arrayContaining([
        "schema=sena-enterprise-identity-cutover-checklist/v1",
        "cutoverChecklistItems=4",
        "cutoverArtifactCompleteness=complete:0|partial:0|missing:2"
      ]));
      expect(weakIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(weakIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(weakIdentityEvidence?.platformRequestPacket.schemaVersion).toBe("sena-enterprise-identity-platform-decision-request-packet/v1");
      expect(weakIdentityEvidence?.platformRequestPacket.redaction).toEqual(expect.objectContaining({
        secretValuesExcluded: true,
        evidenceUrlValuesExcluded: true
      }));
      expect(weakIdentityEvidence?.platformRequestPacket.summary).toEqual(expect.objectContaining({
        requests: 2,
        blockingRequests: 2,
        missingProductionEvidence: 9,
        readyRequests: 0
      }));
      expect(weakIdentityEvidence?.platformRequestPacket.submission).toEqual(expect.objectContaining({
        method: "POST",
        path: "/api/sena/ops/platform-decisions",
        responseSchema: "sena-enterprise-platform-decision-production-evidence-receipt/v1",
        requiredAcceptedStatus: "accepted",
        requiredAcceptedBridge: true,
        requiredBodyFields: [
          "teamId",
          "decisionId",
          "status",
          "acceptedBridge",
          "ownerName",
          "ownerRole",
          "environment",
          "evidenceUrl",
          "productionEvidenceIds",
          "productionEvidenceArtifactDigest",
          "productionEvidenceVerifiedAt",
          "requestPacketPolicyHash",
          "notes"
        ],
        identityProductionEvidenceBodyFields: [
          "evidenceUrl",
          "productionEvidenceIds",
          "productionEvidenceArtifactDigest",
          "productionEvidenceVerifiedAt",
          "requestPacketPolicyHash"
        ],
        receiptArchivePolicy: expect.objectContaining({
          stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest",
          stableSubmissionDigestScope: "platform-submission-inputs",
          stableSubmissionDigestInputFields: expect.arrayContaining([
            "decisionId",
            "submittedEvidenceIds",
            "productionEvidenceArtifactDigest",
            "submittedRequestPacketPolicyHash",
            "technicalEvidenceBinding"
          ])
        }),
        productionEvidenceArtifactDigestPolicy: expect.objectContaining({
          required: true,
          algorithm: "sha256",
          scope: "external-evidence-artifact",
          digestBodyField: "productionEvidenceArtifactDigest",
          responseHeader: "x-sena-identity-production-evidence-artifact-digest",
          artifactCustody: "institution-owned-evidence-system",
          rawArtifactUploadAccepted: false,
          secretValuesAccepted: false,
          requiredForEvidenceIds: expect.arrayContaining([
            "idp-tenant-approval",
            "idp-callback-approval",
            "sso-provider-secrets",
            "sso-secret-store-reference",
            "sso-secret-rotation",
            "provisioning-owner",
            "scim-or-idp-ownership",
            "bearer-token-rotation",
            "lifecycle-guardrails"
          ])
        }),
        evidenceUrlPolicy: expect.objectContaining({
          requiredProtocol: "https",
          institutionOwnedRequired: true,
          allowedHostConfigRequiredInProduction: true,
          forbiddenHostKinds: ["local-or-private", "sena-application-origin", "reserved-example-or-test"]
        }),
        ownerRolePolicy: expect.objectContaining({
          forbiddenTokens: ["sena"],
          institutionOwnerTokens: expect.arrayContaining(["institution", "university", "college", "school"]),
          requiredSemanticTokensByDecision: {
            "institution-idp-approval": expect.arrayContaining(["identity", "idp", "iam", "sso", "oidc", "platform", "security"]),
            "institution-provisioning-owner": expect.arrayContaining(["identity", "provisioning", "scim", "idp", "iam", "lifecycle", "platform", "security"])
          }
        })
      }));
      expect(weakIdentityEvidence?.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
        "submissionMethod=POST",
        "submissionPath=/api/sena/ops/platform-decisions",
        "responseSchema=sena-enterprise-platform-decision-production-evidence-receipt/v1",
        "requiredAcceptedStatus=accepted",
        "requiredAcceptedBridge=true",
        "requiredBodyFields=teamId|decisionId|status|acceptedBridge|ownerName|ownerRole|environment|evidenceUrl|productionEvidenceIds|productionEvidenceArtifactDigest|productionEvidenceVerifiedAt|requestPacketPolicyHash|notes",
        "identityProductionEvidenceBodyFields=evidenceUrl|productionEvidenceIds|productionEvidenceArtifactDigest|productionEvidenceVerifiedAt|requestPacketPolicyHash",
        "productionEvidenceArtifactDigestPolicy=sha256|external-evidence-artifact|institution-custody|no-raw-artifact-upload",
        "productionEvidenceArtifactDigest=sha256|required-for-archive",
        expect.stringContaining("stableSubmissionDigestInputFields="),
        "requestPacketPolicyHashRequired=true"
      ]));
      expect(weakIdentityEvidence?.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          status: "accepted",
          blocking: true,
          ownerRole: "Identity platform",
          environment: "pilot-production",
          evidenceUrlHash: weakIdpAcceptance?.evidenceUrlHash,
          requestedProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
          acceptedProductionEvidenceIds: [],
          missingProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
          technicalPrerequisiteEvidenceIds: ["idp-tenant-binding", "identity-secret-rotation-cadence", "sso-preflight"],
          technicalEvidenceBinding: expect.objectContaining({
            schemaVersion: "sena-enterprise-identity-technical-evidence-binding/v1",
            decisionId: "institution-idp-approval",
            provider: "institution",
            status: "ready",
            latestPreflightStatus: "pass",
            configBinding: "current",
            configHashes: expect.objectContaining({
              clientIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
              scopesHash: expect.stringMatching(/^[a-f0-9]{64}$/),
              callbackHash: expect.stringMatching(/^[a-f0-9]{64}$/)
            })
          }),
          submissionTemplate: expect.objectContaining({
            decisionId: "institution-idp-approval",
            status: "accepted",
            acceptedBridge: true,
            ownerNamePolicy: {
              specificInstitutionOwnerRequired: true,
              genericPlaceholderRejected: true,
              rejectedPlaceholderNames: expect.arrayContaining(["institution platform owner"])
            },
            productionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
            productionEvidenceVerifiedAtField: "productionEvidenceVerifiedAt",
            productionEvidenceVerifiedAtRequiredForEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
            evidenceUrlPlaceholder: "https://<institution-evidence-host>/sena/identity-evidence"
          })
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          status: "accepted",
          blocking: true,
          ownerRole: "Identity lifecycle",
          environment: "pilot-production",
          evidenceUrlHash: weakProvisioningAcceptance?.evidenceUrlHash,
          requestedProductionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
          acceptedProductionEvidenceIds: [],
          missingProductionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
          technicalPrerequisiteEvidenceIds: ["provisioning-token", "identity-secret-rotation-cadence", "provisioning-secret-store-reference", "identity-lifecycle-owner-mode"],
          technicalEvidenceBinding: expect.objectContaining({
            schemaVersion: "sena-enterprise-identity-technical-evidence-binding/v1",
            decisionId: "institution-provisioning-owner",
            status: "ready",
            configBinding: "current",
            evidence: expect.arrayContaining([
              "provisioningToken=configured",
              "provisioningTokenStrength=configured",
              "provisioningTokenMinLength=32",
              "secretHashing=disabled"
            ])
          }),
          submissionTemplate: expect.objectContaining({
            decisionId: "institution-provisioning-owner",
            status: "accepted",
            acceptedBridge: true,
            ownerNamePolicy: {
              specificInstitutionOwnerRequired: true,
              genericPlaceholderRejected: true,
              rejectedPlaceholderNames: expect.arrayContaining(["institution platform owner"])
            },
            productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
            productionEvidenceVerifiedAtField: "productionEvidenceVerifiedAt",
            productionEvidenceVerifiedAtRequiredForEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
            evidenceUrlPlaceholder: "https://<institution-evidence-host>/sena/identity-evidence"
          })
        })
      ]));
      const idpRequest = weakIdentityEvidence?.platformRequestPacket.requests.find((request) => request.decisionId === "institution-idp-approval");
      const provisioningRequest = weakIdentityEvidence?.platformRequestPacket.requests.find((request) => request.decisionId === "institution-provisioning-owner");
      expect(idpRequest?.submissionTemplate.ownerNamePolicy).toEqual({
        specificInstitutionOwnerRequired: true,
        genericPlaceholderRejected: true,
        rejectedPlaceholderNames: expect.arrayContaining(["institution platform owner"])
      });
      expect(provisioningRequest?.submissionTemplate.ownerNamePolicy).toEqual({
        specificInstitutionOwnerRequired: true,
        genericPlaceholderRejected: true,
        rejectedPlaceholderNames: expect.arrayContaining(["institution platform owner"])
      });
      expect(weakIdentityEvidence?.nextActions.join(" ")).toContain("callback");
      expect(weakIdentityEvidence?.nextActions.join(" ")).toContain("bearer-token rotation");
      const weakAcceptanceIdpDecision = weakAcceptanceDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof weakAcceptanceDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean }>;
      };
      const weakAcceptanceProvisioningDecision = weakAcceptanceDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-provisioning-owner") as typeof weakAcceptanceDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean }>;
      };
      expect(weakAcceptanceIdpDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "idp-tenant-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "idp-callback-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-provider-secrets", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-secret-store-reference", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-secret-rotation", status: "missing", productionRequired: true })
      ]));
      expect(weakAcceptanceIdpDecision.ownerEvidence).toEqual(expect.arrayContaining([
        "productionEvidenceIds=none",
        "missingProductionEvidenceIds=idp-tenant-approval|idp-callback-approval|sso-provider-secrets|sso-secret-store-reference|sso-secret-rotation"
      ]));
      expect(weakAcceptanceProvisioningDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "provisioning-owner", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "scim-or-idp-ownership", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "lifecycle-guardrails", status: "missing", productionRequired: true })
      ]));
      expect(weakAcceptanceProvisioningDecision.ownerEvidence).toEqual(expect.arrayContaining([
        "productionEvidenceIds=none",
        "missingProductionEvidenceIds=provisioning-owner|scim-or-idp-ownership|bearer-token-rotation|lifecycle-guardrails"
      ]));
      const weakAcceptanceIdentityAdapters = weakAcceptanceDeployment.nativeAdapterCertification.adapters
        .filter((adapter) => adapter.decisionId === "institution-idp-approval" || adapter.decisionId === "institution-provisioning-owner");
      expect(weakAcceptanceIdentityAdapters).toEqual(expect.arrayContaining([
        expect.objectContaining({ decisionId: "institution-idp-approval", status: "accepted-bridge", productionBlocking: true, acceptedBridge: true }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", status: "accepted-bridge", productionBlocking: true, acceptedBridge: true })
      ]));

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-keyword-only-approval",
        notes: "Institution IdP tenant, callback redirect URI approval, and SSO secret rotation are described in notes only."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/scim-keyword-only-approval",
        notes: "SCIM or IdP ownership, provisioning owner, bearer-token rotation, lifecycle guardrails, suspension handling, and last-active-manager protection are described in notes only."
      });
      const notesOnlyIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { missing: number; platformBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(notesOnlyIdentityEvidence?.status).toBe("review");
      expect(notesOnlyIdentityEvidence?.summary.missing).toBeGreaterThanOrEqual(9);
      expect(notesOnlyIdentityEvidence?.summary.platformBlocking).toBeGreaterThanOrEqual(9);
      expect(notesOnlyIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(notesOnlyIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(notesOnlyIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));

      const conditionalReleaseGate = enterprise.createEnterpriseReleaseGateReview(registered.context, {
        teamId: registered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-identity-conditional",
        decision: "conditional",
        approverName: "Institution release owner",
        approverRole: "Identity platform",
        notes: "Conditional release keeps identity production evidence blockers attached.",
        verificationCommand: "npm run sena:pilot:verify",
        verificationEvidence: {
          status: "passed",
          summary: "Verification command passed, with remaining institution identity evidence blockers.",
          outputSha256: "c".repeat(64)
        }
      }) as ReturnType<typeof enterprise.createEnterpriseReleaseGateReview> & {
        platformDecisionSnapshot: ReturnType<typeof enterprise.createEnterpriseReleaseGateReview>["platformDecisionSnapshot"] & {
          productionBlockingDecisionIds?: string[];
          missingProductionEvidence?: Array<{ decisionId: string; evidenceId: string; status: string }>;
        };
        identityProductionSnapshot?: {
          schemaVersion: "sena-enterprise-identity-production-evidence/v1";
          status: string;
          capabilityStatus: string;
          missingEvidenceIds: string[];
          submissionVerifier: {
            schemaVersion: "sena-enterprise-identity-submission-verifier/v1";
            verifiedDecisions: number;
            incompleteDecisions: number;
            missingProductionEvidence: number;
          };
          rotationFreshness: {
            schemaVersion: "sena-enterprise-identity-rotation-freshness/v1";
            status: string;
            expiredEvidenceIds: string[];
            dueSoonEvidenceIds: string[];
          };
          platformRequestPacket?: {
            schemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1";
            blockingRequests: number;
            missingProductionEvidence: number;
            missingTechnicalPrerequisites: number;
            receiptReviewRequests: number;
            evidence: string[];
          };
          cutoverChecklist?: {
            schemaVersion: "sena-enterprise-identity-cutover-checklist/v1";
            status: string;
            summary: {
              items: number;
              readyItems: number;
              blockingItems: number;
            };
            items: Array<{
              id: string;
              status: string;
              missingEvidenceIds: string[];
            }>;
          };
          receiptArchiveManifest?: {
            schemaVersion: "sena-enterprise-identity-receipt-archive-manifest/v1";
            archiveManifestDigest?: string;
            summary: {
              readyForArchive: number;
              reviewArchives: number;
              missingReceipts: number;
            };
          };
          releaseGateBlocked: boolean;
        };
      };
      expect(conditionalReleaseGate.platformDecisionSnapshot.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(conditionalReleaseGate.platformDecisionSnapshot.missingProductionEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ decisionId: "institution-idp-approval", evidenceId: "idp-tenant-approval", status: "missing" }),
        expect.objectContaining({ decisionId: "institution-idp-approval", evidenceId: "idp-callback-approval", status: "missing" }),
        expect.objectContaining({ decisionId: "institution-idp-approval", evidenceId: "sso-secret-rotation", status: "missing" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", evidenceId: "provisioning-owner", status: "missing" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", evidenceId: "scim-or-idp-ownership", status: "missing" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", evidenceId: "bearer-token-rotation", status: "missing" }),
        expect.objectContaining({ decisionId: "institution-provisioning-owner", evidenceId: "lifecycle-guardrails", status: "missing" })
      ]));
      expect(conditionalReleaseGate.identityProductionSnapshot).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-evidence/v1",
        status: "review",
        capabilityStatus: "review",
        releaseGateBlocked: true,
        submissionVerifier: expect.objectContaining({
          schemaVersion: "sena-enterprise-identity-submission-verifier/v1",
          verifiedDecisions: 0,
          incompleteDecisions: 2,
          missingProductionEvidence: expect.any(Number)
        }),
        rotationFreshness: expect.objectContaining({
          schemaVersion: "sena-enterprise-identity-rotation-freshness/v1",
          status: "review"
        }),
        platformRequestPacket: expect.objectContaining({
          schemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1",
          blockingRequests: 2,
          missingProductionEvidence: expect.any(Number),
          missingTechnicalPrerequisites: expect.any(Number),
          receiptReviewRequests: expect.any(Number),
          evidence: expect.arrayContaining([
            "evidenceUrlPath=specific-path-required",
            "evidenceUrlSecretCarriers=credentials|fragments|sensitive-query-rejected",
            "notesSecretCarriers=sensitive-assignments|bearer-tokens-rejected",
            "freeTextSecretCarriers=ownerName|ownerRole|environment|notes"
          ])
        })
      }));
      expect(conditionalReleaseGate.identityProductionSnapshot?.platformRequestPacket?.receiptReviewRequests)
        .toBeGreaterThanOrEqual(2);
      expect(conditionalReleaseGate.identityProductionSnapshot?.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(conditionalReleaseGate.identityProductionSnapshot?.submissionVerifier.missingProductionEvidence)
        .toBeGreaterThanOrEqual(9);
      expect(conditionalReleaseGate.identityProductionSnapshot?.rotationFreshness.expiredEvidenceIds).toEqual([]);
      expect(conditionalReleaseGate.identityProductionSnapshot?.rotationFreshness.dueSoonEvidenceIds).toEqual([]);
      expect(conditionalReleaseGate.identityProductionSnapshot?.cutoverChecklist).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-cutover-checklist/v1",
        status: "review",
        summary: expect.objectContaining({
          items: 4,
          blockingItems: expect.any(Number)
        }),
        items: expect.arrayContaining([
          expect.objectContaining({ id: "idp-tenant-approval", status: "review" }),
          expect.objectContaining({ id: "sso-secret-custody" }),
          expect.objectContaining({ id: "scim-idp-ownership", status: "review" }),
          expect.objectContaining({ id: "identity-secret-rotation", status: "review" })
        ])
      }));
      expect(conditionalReleaseGate.identityProductionSnapshot?.cutoverChecklist?.summary.blockingItems)
        .toBeGreaterThanOrEqual(3);
      expect(conditionalReleaseGate.identityProductionSnapshot?.cutoverChecklist?.items.find((item) => item.id === "idp-tenant-approval")?.missingEvidenceIds)
        .toEqual(expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval"]));
      expect(conditionalReleaseGate.identityProductionSnapshot?.cutoverChecklist?.items.find((item) => item.id === "identity-secret-rotation")?.missingEvidenceIds)
        .toEqual(expect.arrayContaining(["sso-secret-rotation", "bearer-token-rotation"]));
      expect(conditionalReleaseGate.identityProductionSnapshot?.receiptArchiveManifest).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-receipt-archive-manifest/v1",
        archiveManifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          readyForArchive: 0,
          missingReceipts: 0,
          reviewArchives: 2
        })
      }));
      expect(() => enterprise.createEnterpriseReleaseGateReview(registered.context, {
        teamId: registered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-identity-weak-acceptance",
        decision: "approved",
        approverName: "Institution release owner",
        approverRole: "Identity platform",
        notes: "Attempting approval before callback, secret rotation, bearer-token rotation, and lifecycle guardrails are evidenced.",
        verificationCommand: "npm run sena:pilot:verify",
        verificationEvidence: {
          status: "passed",
          summary: "Verification command passed, but identity platform evidence is still incomplete.",
          outputSha256: "a".repeat(64)
        }
      })).toThrow(/Release gate approval requires zero production blockers/);

      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-tenant-approval",
        notes: "Approved for production.",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: new Date().toISOString(),
        requestPacketPolicyHash
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/scim-owner-approval",
        notes: "Approved for production.",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: new Date().toISOString(),
        requestPacketPolicyHash
      });

      const capabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const authCapability = capabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");

      expect(authCapability).toBeTruthy();
      expect(authCapability?.status).toBe("ready");
      expect(authCapability?.remainingPlatformDecisions).toEqual([]);
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=ready",
        "idpTenantApproval=accepted-bridge",
        "ssoSecrets=institution:configured|google:missing|orcid:missing",
        "ssoPreflightStatus=pass",
        "scimProvisioningOwner=accepted-bridge",
        "provisioningToken=pass",
        "secretHardening=pass",
        "secretRotation=ready",
        "idpAcceptanceEvidence=tenant:true|callback:true|providerSecrets:true|secretStoreReference:true|secretRotation:true|evidenceUrl:true",
        "scimAcceptanceEvidence=owner:true|scimOrIdp:true|bearerTokenRotation:true|lifecycleGuardrails:true|evidenceUrl:true"
      ]));
      expect(authCapability?.evidence).toContain("identityRequestPacketPolicyBinding=idp:current|provisioning:current");
      expect(authCapability?.evidence.some((entry) => /^identityRequestPacketPolicyHash=[a-f0-9]{64}$/.test(entry))).toBe(true);
      expect(authCapability?.nextAction).toContain("Keep institution IdP tenant approval");
      expect(authCapability?.requiredArtifacts).toContain("sena-enterprise-identity-production-evidence/v1");
      const acceptedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      expect(acceptedDeployment.platformDecisionRegister.summary.acceptedBridgeMissingEvidence).toBe(0);
      const acceptedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          schemaVersion: string;
          status: string;
          summary: { missing: number };
          evidenceManifest: {
            acceptedEvidenceIds: string[];
            presentEvidenceIds: string[];
            missingEvidenceIds: string[];
          };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              submittedEvidenceIds: string[];
              missingEvidenceIds: string[];
              requestPacketPolicyHash?: string;
              requestPacketPolicyBindingStatus?: string;
            };
          }>;
          platformRequestPacket: {
            summary: {
              blockingRequests: number;
              missingProductionEvidence: number;
              readyRequests: number;
            };
            evidence: string[];
            requests: Array<{
              decisionId?: string;
              blocking: boolean;
              acceptedProductionEvidenceIds: string[];
              missingProductionEvidenceIds: string[];
              latestReceiptRequestPacketPolicyBindingStatus?: string;
            }>;
          };
          submissionVerifier?: {
            expectedSubmissions: Array<{
              decisionId: string;
              requestPacketPolicyHash?: string;
              requestPacketPolicyBindingStatus?: string;
            }>;
          };
          cutoverChecklist: {
            schemaVersion: string;
            status: string;
            summary: {
              items: number;
              readyItems: number;
              blockingItems: number;
            };
            items: Array<{
              id: string;
              status: string;
              missingEvidenceIds: string[];
            }>;
            evidence: string[];
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
          requirements: Array<{ status: string }>;
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(acceptedIdentityEvidence?.schemaVersion).toBe("sena-enterprise-identity-production-evidence/v1");
      expect(acceptedIdentityEvidence?.status).toBe("ready");
      expect(acceptedIdentityEvidence?.summary.missing).toBe(0);
      expect(acceptedIdentityEvidence?.cutoverChecklist.status).toBe("ready");
      expect(acceptedIdentityEvidence?.cutoverChecklist.summary).toEqual(expect.objectContaining({
        items: 4,
        readyItems: 4,
        blockingItems: 0
      }));
      expect(acceptedIdentityEvidence?.cutoverChecklist.items.every((item) => item.status === "ready")).toBe(true);
      expect(acceptedIdentityEvidence?.cutoverChecklist.items.every((item) => item.missingEvidenceIds.length === 0)).toBe(true);
      expect(acceptedIdentityEvidence?.cutoverChecklist.evidence).toEqual(expect.arrayContaining([
        "cutoverChecklistStatus=ready",
        "cutoverBlockers=0"
      ]));
      expect(acceptedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);
      expect(acceptedIdentityEvidence?.evidenceManifest.acceptedEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(acceptedIdentityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight",
        "provisioning-token"
      ]));
      expect(acceptedIdentityEvidence?.acceptanceReceipts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          productionEvidenceReceipt: expect.objectContaining({
            submittedEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
            missingEvidenceIds: []
          })
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          productionEvidenceReceipt: expect.objectContaining({
            submittedEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]),
            missingEvidenceIds: []
          })
        })
      ]));
      expect(acceptedIdentityEvidence?.releaseGate.approvalBlocked).toBe(false);
      expect(acceptedIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual([]);
      expect(acceptedIdentityEvidence?.platformRequestPacket.summary).toEqual(expect.objectContaining({
        blockingRequests: 0,
        missingProductionEvidence: 0,
        readyRequests: 2
      }));
      const acceptedRequestPolicyHash = acceptedIdentityEvidence?.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(acceptedRequestPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(acceptedIdentityEvidence?.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
        "requestPacketPolicyBinding=idp:current|provisioning:current"
      ]));
      expect(acceptedIdentityEvidence?.platformRequestPacket.requests.every((request) => !request.blocking)).toBe(true);
      expect(acceptedIdentityEvidence?.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          acceptedProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
          missingProductionEvidenceIds: [],
          latestReceiptRequestPacketPolicyBindingStatus: "current"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          acceptedProductionEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]),
          missingProductionEvidenceIds: [],
          latestReceiptRequestPacketPolicyBindingStatus: "current"
        })
      ]));
      expect(acceptedIdentityEvidence?.submissionVerifier?.expectedSubmissions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          requestPacketPolicyHash: acceptedRequestPolicyHash,
          requestPacketPolicyBindingStatus: "current"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          requestPacketPolicyHash: acceptedRequestPolicyHash,
          requestPacketPolicyBindingStatus: "current"
        })
      ]));
      expect(acceptedIdentityEvidence?.submissionVerifier?.evidence).toEqual(expect.arrayContaining([
        `requestPacketPolicyHash=${acceptedRequestPolicyHash}`,
        "requestPacketPolicyBinding=idp:current|provisioning:current"
      ]));
      expect(acceptedIdentityEvidence?.requirements.every((requirement) => requirement.status === "accepted" || requirement.status === "present")).toBe(true);
      const acceptedAcceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances> & {
        summary: ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances>["summary"] & {
          acceptedBridgeMissingEvidence?: number;
        };
        acceptances: Array<ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances>["acceptances"][number] & {
          productionEvidenceIds?: string[];
          productionEvidenceReceipt?: {
            submittedEvidenceIds: string[];
            missingEvidenceIds: string[];
            requestPacketPolicyHash?: string;
            requestPacketPolicyBindingStatus?: string;
          };
        }>;
      };
      expect(acceptedAcceptanceList.summary.acceptedBridgeMissingEvidence).toBe(0);
      const acceptedIdpAcceptanceReceipt = acceptedAcceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval");
      const acceptedProvisioningAcceptanceReceipt = acceptedAcceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-provisioning-owner");
      expect(acceptedIdpAcceptanceReceipt?.productionEvidenceIds)
        .toEqual(expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]));
      expect(acceptedProvisioningAcceptanceReceipt?.productionEvidenceIds)
        .toEqual(expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]));
      expect(acceptedIdpAcceptanceReceipt?.productionEvidenceReceipt?.submittedEvidenceIds)
        .toEqual(expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]));
      expect(acceptedIdpAcceptanceReceipt?.productionEvidenceReceipt?.missingEvidenceIds).toEqual([]);
      expect(acceptedIdpAcceptanceReceipt?.productionEvidenceReceipt?.requestPacketPolicyHash).toBe(acceptedRequestPolicyHash);
      expect(acceptedIdpAcceptanceReceipt?.productionEvidenceReceipt?.requestPacketPolicyBindingStatus).toBe("current");
      expect(acceptedProvisioningAcceptanceReceipt?.productionEvidenceReceipt?.submittedEvidenceIds)
        .toEqual(expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]));
      expect(acceptedProvisioningAcceptanceReceipt?.productionEvidenceReceipt?.missingEvidenceIds).toEqual([]);
      expect(acceptedProvisioningAcceptanceReceipt?.productionEvidenceReceipt?.requestPacketPolicyHash).toBe(acceptedRequestPolicyHash);
      expect(acceptedProvisioningAcceptanceReceipt?.productionEvidenceReceipt?.requestPacketPolicyBindingStatus).toBe("current");
      expect(capabilityAudit.evidence).toContain("redaction=secret-values-excluded");
      expect(JSON.stringify(acceptedIdentityEvidence)).not.toContain(productionLikeInstitutionSsoSecret);
      expect(JSON.stringify(acceptedIdentityEvidence)).not.toContain(productionLikeProvisioningToken);
      expect(JSON.stringify(capabilityAudit)).not.toContain(productionLikeInstitutionSsoSecret);
      expect(JSON.stringify(capabilityAudit)).not.toContain(productionLikeProvisioningToken);
      const acceptedIdpDecision = acceptedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof acceptedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean }>;
      };
      const acceptedProvisioningDecision = acceptedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-provisioning-owner") as typeof acceptedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean }>;
      };
      expect(acceptedIdpDecision.evidenceChecklist?.every((item) => item.status === "accepted" || item.status === "present")).toBe(true);
      expect(acceptedProvisioningDecision.evidenceChecklist?.every((item) => item.status === "accepted" || item.status === "present")).toBe(true);
      expect(acceptedIdpDecision.ownerEvidence).toEqual(expect.arrayContaining([
        "productionEvidenceIds=idp-tenant-approval|idp-callback-approval|sso-provider-secrets|sso-secret-store-reference|sso-secret-rotation",
        "missingProductionEvidenceIds=none"
      ]));
      expect(acceptedProvisioningDecision.ownerEvidence).toEqual(expect.arrayContaining([
        "productionEvidenceIds=provisioning-owner|scim-or-idp-ownership|bearer-token-rotation|lifecycle-guardrails",
        "missingProductionEvidenceIds=none"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not trust legacy IdP technical bindings that omit SSO secret readiness evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-legacy-idp-secret-binding-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Legacy Secret Binding Owner",
        email: "legacy-secret-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-legacy-secret-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-legacy-secret-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          cutoverChecklist: {
            status: string;
            summary: { artifactCompletenessCounts?: Record<string, number>; blockingItems: number };
            items: Array<{ id: string; status: string; artifactCompletenessStatus?: string; missingEvidenceIds: string[] }>;
          };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.cutoverChecklist.status).toBe("ready");
      expect(freshIdentityEvidence?.cutoverChecklist.summary.artifactCompletenessCounts).toEqual({
        complete: 2
      });
      expect(freshIdentityEvidence?.cutoverChecklist.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "idp-tenant-approval",
          status: "ready",
          artifactCompletenessStatus: "complete",
          missingEvidenceIds: []
        }),
        expect.objectContaining({
          id: "scim-idp-ownership",
          status: "ready",
          artifactCompletenessStatus: "complete",
          missingEvidenceIds: []
        })
      ]));

      const dbFile = path.join(enterpriseDbDir, "enterprise-db.json");
      const db = JSON.parse(readFileSync(dbFile, "utf8")) as {
        platformDecisionAcceptances: Array<{
          decisionId: string;
          technicalEvidenceBinding?: { secretBinding?: unknown };
        }>;
      };
      const idpAcceptance = db.platformDecisionAcceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval");
      expect(idpAcceptance?.technicalEvidenceBinding?.secretBinding).toBeTruthy();
      delete idpAcceptance?.technicalEvidenceBinding?.secretBinding;
      writeFileSync(dbFile, `${JSON.stringify(db, null, 2)}\n`);

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "idpTenantApproval=accepted-bridge-missing-evidence",
        "ssoSecrets=institution:configured|google:missing|orcid:missing",
        "rotationFreshness=ready"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      const securityCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "production-security-governance");
      const goLiveCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "go-live-operations");
      expect(securityCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      expect(goLiveCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      expect(securityCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "identityReceiptVerifier=idp:review|provisioning:ready",
        "cutoverChecklist=review"
      ]));
      expect(securityCapability?.evidence.some((entry) => /^cutoverBlockers=\d+$/.test(entry))).toBe(true);
      expect(securityCapability?.requiredArtifacts).toContain("sena-enterprise-identity-production-evidence/v1");
      expect(securityCapability?.requiredArtifacts).toContain("sena-enterprise-identity-cutover-checklist/v1");
      expect(goLiveCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "identityReceiptVerifier=idp:review|provisioning:ready",
        "cutoverChecklist=review"
      ]));
      expect(goLiveCapability?.evidence.some((entry) => /^cutoverBlockers=\d+$/.test(entry))).toBe(true);
      expect(goLiveCapability?.requiredArtifacts).toContain("sena-enterprise-identity-production-evidence/v1");
      expect(goLiveCapability?.requiredArtifacts).toContain("sena-enterprise-identity-cutover-checklist/v1");

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[]; presentEvidenceIds: string[] };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              verifierStatus?: string;
              technicalBindingStatus?: string;
              technicalReadinessStatus?: string;
              missingEvidenceIds: string[];
              technicalBindingEvidence?: string[];
            };
          }>;
          platformRequestPacket: {
            summary: { receiptReviewRequests?: number };
            requests: Array<{
              decisionId: string;
              latestReceiptVerifierStatus?: string;
              latestReceiptTechnicalBindingStatus?: string;
              latestReceiptTechnicalReadinessStatus?: string;
              missingProductionEvidenceIds: string[];
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation"
      ]));
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).not.toContain("sso-preflight");
      expect(identityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight",
        "provisioning-token"
      ]));
      const legacyIdpReceipt = identityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      expect(legacyIdpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "ready",
        missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
      }));
      expect(legacyIdpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "technicalBinding=stale",
        "acceptedClientSecretStrength=missing",
        "currentClientSecretStrength=configured"
      ]));
      expect(identityEvidence?.platformRequestPacket.summary.receiptReviewRequests).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          latestReceiptVerifierStatus: "review",
          latestReceiptTechnicalBindingStatus: "stale",
          latestReceiptTechnicalReadinessStatus: "ready",
          missingProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
        })
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      expect(JSON.stringify(identityEvidence)).not.toContain(productionLikeInstitutionSsoSecret);
      expect(JSON.stringify(authCapability)).not.toContain(productionLikeInstitutionSsoSecret);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not promote IdP platform evidence submitted before SSO technical binding exists", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-prebinding-idp-evidence-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Prebinding IdP Evidence Owner",
        email: "prebinding-idp-evidence@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-prebinding-approval",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Platform evidence was submitted before the SSO client, issuer, and preflight binding existed."
      });

      process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
      process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
      process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
      process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
      process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
      process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
      process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const currentRequestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-prebinding-idp",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash: currentRequestPacketPolicyHash,
        notes: "Provisioning ownership, bearer-token rotation, and lifecycle guardrail evidence is current."
      });

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "idpTenantApproval=accepted-bridge-missing-evidence",
        "ssoPreflightStatus=pass",
        "rotationFreshness=ready"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[]; presentEvidenceIds: string[] };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              verifierStatus?: string;
              technicalBindingStatus?: string;
              technicalReadinessStatus?: string;
              missingEvidenceIds: string[];
              technicalBindingEvidence?: string[];
            };
          }>;
          platformRequestPacket: {
            summary: { receiptReviewRequests?: number };
            requests: Array<{
              decisionId: string;
              latestReceiptVerifierStatus?: string;
              latestReceiptTechnicalBindingStatus?: string;
              latestReceiptTechnicalReadinessStatus?: string;
              missingProductionEvidenceIds: string[];
            }>;
          };
          submissionVerifier?: {
            summary: { missingProductionEvidence: number; incompleteDecisions: number };
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation"
      ]));
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).not.toContain("sso-preflight");
      expect(identityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight",
        "provisioning-token"
      ]));
      const idpReceipt = identityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      expect(idpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "ready",
        missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
      }));
      expect(idpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "bindingSchema=missing",
        "acceptedTechnicalStatus=missing",
        "currentTechnicalStatus=ready",
        "currentPreflight=pass"
      ]));
      expect(identityEvidence?.platformRequestPacket.summary.receiptReviewRequests).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          latestReceiptVerifierStatus: "review",
          latestReceiptTechnicalBindingStatus: "stale",
          latestReceiptTechnicalReadinessStatus: "ready",
          missingProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
        })
      ]));
      expect(identityEvidence?.submissionVerifier?.summary.missingProductionEvidence).toBeGreaterThanOrEqual(3);
      expect(identityEvidence?.submissionVerifier?.summary.incompleteDecisions).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects identity production evidence ids when the platform bridge is not accepted", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-unaccepted-bridge-evidence-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Unaccepted Bridge Evidence Owner",
        email: "unaccepted-bridge-evidence@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: false,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-unaccepted-bridge",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution IdP production evidence without accepting the platform bridge."
      })).toThrow(/acceptedBridge/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: false,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-unaccepted-bridge",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution provisioning production evidence without accepting the platform bridge."
      })).toThrow(/acceptedBridge/i);

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      });
      expect(acceptanceList.acceptances).toEqual([]);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not promote IdP platform evidence submitted before SSO preflight exists when preflight later passes", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-preflight-after-idp-evidence-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Preflight After Evidence Owner",
        email: "preflight-after-idp-evidence@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-before-preflight",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "IdP production evidence was submitted before any SSO preflight pass existed."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-before-idp-preflight",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Provisioning ownership, bearer-token rotation, and lifecycle guardrail evidence is current."
      });

      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
      const preflight = await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(preflight.summary.passed).toBe(1);

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "ssoPreflightStatus=pass",
        "identityReceiptVerifier=idp:review|provisioning:ready",
        "rotationFreshness=ready"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              verifierStatus?: string;
              technicalBindingStatus?: string;
              technicalReadinessStatus?: string;
              missingEvidenceIds: string[];
              technicalBindingEvidence?: string[];
            };
          }>;
          platformRequestPacket: {
            summary: { receiptReviewRequests?: number };
            requests: Array<{
              decisionId: string;
              blocking: boolean;
              latestReceiptVerifierStatus?: string;
              latestReceiptTechnicalBindingStatus?: string;
              latestReceiptTechnicalReadinessStatus?: string;
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.status).toBe("review");
      const idpReceipt = identityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      expect(idpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "ready",
        missingEvidenceIds: ["sso-provider-secrets"]
      }));
      expect(idpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedPreflight=missing",
        "currentPreflight=pass"
      ]));
      expect(identityEvidence?.platformRequestPacket.summary.receiptReviewRequests).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          blocking: true,
          latestReceiptVerifierStatus: "review",
          latestReceiptTechnicalBindingStatus: "stale",
          latestReceiptTechnicalReadinessStatus: "ready"
        })
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      const artifactCompletenessEvidence = "complete:2|partial:0|missing:0";
      const conditionalReleaseGate = enterprise.createEnterpriseReleaseGateReview(registered.context, {
        teamId: registered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.01.02-preflight-after-idp-evidence",
        decision: "conditional",
        approverName: "Institution release owner",
        approverRole: "Identity platform",
        notes: "Conditional review keeps the IdP receipt verifier review attached after preflight arrives later.",
        verificationCommand: "npm run sena:pilot:verify",
        verificationEvidence: {
          status: "passed",
          summary: "Verification command passed, but the IdP production receipt verifier is still in review.",
          outputSha256: "b".repeat(64)
        }
      }) as ReturnType<typeof enterprise.createEnterpriseReleaseGateReview> & {
        identityProductionSnapshot?: {
          status: string;
          capabilityStatus: string;
          releaseGateBlocked: boolean;
          submissionVerifier: {
            incompleteDecisions: number;
            missingProductionEvidence: number;
            missingTechnicalPrerequisites: number;
          };
          rotationFreshness: { status: string };
          cutoverChecklist?: {
            schemaVersion: string;
            status: string;
            summary: { blockingItems: number };
          };
          receiptArchiveManifest?: {
            archiveManifestDigest?: string;
            summary: {
              readyForArchive?: number;
              reviewArchives?: number;
              missingReceipts?: number;
              missingArchiveInputCounts?: Record<string, number>;
              artifactCompletenessCounts?: Record<string, number>;
            };
            decisions?: Array<{
              decisionId: string;
              digestHeader?: string;
              stableSubmissionDigestHeader?: string;
              submittedEvidenceDigest?: string;
              submittedEvidenceDigestScope?: string;
              productionEvidenceArtifactDigest?: string;
              productionEvidenceArtifactDigestScope?: string;
              productionEvidenceArtifactDigestCompletenessStatus?: string;
            }>;
          };
        };
      };
      expect(conditionalReleaseGate.identityProductionSnapshot).toEqual(expect.objectContaining({
        status: "review",
        capabilityStatus: "review",
        releaseGateBlocked: true,
        submissionVerifier: expect.objectContaining({
          incompleteDecisions: 1,
          missingProductionEvidence: 1,
          missingTechnicalPrerequisites: 0
        }),
        rotationFreshness: expect.objectContaining({ status: "ready" })
      }));
      expect(conditionalReleaseGate.identityProductionSnapshot?.cutoverChecklist).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-cutover-checklist/v1",
        status: "review",
        summary: expect.objectContaining({
          blockingItems: 1,
          readyItems: 3,
          artifactCompletenessCounts: { complete: 2 }
        })
      }));
      expect(conditionalReleaseGate.identityProductionSnapshot?.receiptArchiveManifest?.summary.artifactCompletenessCounts).toEqual({
        complete: 2
      });
      expect(conditionalReleaseGate.identityProductionSnapshot?.receiptArchiveManifest?.archiveManifestDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(conditionalReleaseGate.identityProductionSnapshot?.receiptArchiveManifest?.summary).toEqual(expect.objectContaining({
        readyForArchive: 1,
        reviewArchives: 1,
        missingReceipts: 0,
        missingArchiveInputCounts: { technicalEvidenceBinding: 1 }
      }));
      const latestIdentityReceiptArchiveEvidence = [
        `latestIdentityReceiptArchiveManifestDigest=${conditionalReleaseGate.identityProductionSnapshot?.receiptArchiveManifest?.archiveManifestDigest}`,
        "latestIdentityReceiptArchiveReadyForArchive=1",
        "latestIdentityReceiptArchiveReview=1",
        "latestIdentityReceiptArchiveMissingReceipts=0",
        "latestIdentityReceiptArchiveMissingInputs=technicalEvidenceBinding:1",
        `latestIdentityReceiptArchiveArtifactCompleteness=${artifactCompletenessEvidence}`
      ];
      const latestReleaseGateIdentityReceiptArchiveEvidence = [
        `latestReleaseGateIdentityReceiptArchiveManifestDigest=${conditionalReleaseGate.identityProductionSnapshot?.receiptArchiveManifest?.archiveManifestDigest}`,
        "latestReleaseGateIdentityReceiptArchiveReadyForArchive=1",
        "latestReleaseGateIdentityReceiptArchiveReview=1",
        "latestReleaseGateIdentityReceiptArchiveMissingReceipts=0",
        "latestReleaseGateIdentityReceiptArchiveMissingInputs=technicalEvidenceBinding:1",
        `latestReleaseGateIdentityReceiptArchiveArtifactCompleteness=${artifactCompletenessEvidence}`
      ];
      expect(conditionalReleaseGate.identityProductionSnapshot?.receiptArchiveManifest?.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          digestHeader: "x-sena-identity-production-receipt-digest",
          stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest",
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigestScope: "platform-submission-inputs",
          productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          productionEvidenceArtifactDigestScope: "external-evidence-artifact",
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        })
      ]));
      let approvalError: unknown;
      try {
        enterprise.createEnterpriseReleaseGateReview(registered.context, {
        teamId: registered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.01.02-preflight-after-idp-evidence-approved",
        decision: "approved",
        approverName: "Institution release owner",
        approverRole: "Identity platform",
        notes: "Attempting approval while the IdP production receipt verifier is still incomplete.",
        verificationCommand: "npm run sena:pilot:verify",
        verificationEvidence: {
          status: "passed",
          summary: "Verification command passed, but the IdP production receipt verifier is still in review.",
          outputSha256: "d".repeat(64)
        }
        });
      } catch (error) {
        approvalError = error;
      }
      const approvalErrorMessage = approvalError instanceof Error ? approvalError.message : String(approvalError);
      expect(approvalErrorMessage).toContain("team-scoped identity-submission-verifier-complete-required");
      expect(approvalErrorMessage).toContain("team-scoped identity-receipt-archive-ready-required");

      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      expect(deployment.releaseGate.evidence).toEqual(expect.arrayContaining([
        "latestIdentityVerifierIncomplete=1",
        "latestIdentityVerifierMissing=1",
        "latestIdentityVerifierMissingTechnical=0",
        "latestIdentityCutoverChecklist=review",
        "latestIdentityCutoverBlockers=1",
        ...latestIdentityReceiptArchiveEvidence
      ]));
      expect(deployment.saasOperationsReadiness.summary.blockers).toContain("release-gate-identity-production-evidence-required");
      expect(deployment.saasOperationsReadiness.evidence).toEqual(expect.arrayContaining([
        "latestReleaseGateIdentityProductionStatus=review",
        "latestReleaseGateIdentityVerifierIncomplete=1",
        "latestReleaseGateIdentityVerifierMissing=1",
        "latestReleaseGateIdentityVerifierMissingTechnical=0",
        "latestReleaseGateIdentityRotationFreshness=ready",
        "latestReleaseGateIdentityCutoverChecklist=review",
        "latestReleaseGateIdentityCutoverBlockers=1",
        ...latestReleaseGateIdentityReceiptArchiveEvidence
      ]));
      const goLiveRehearsal = enterprise.getEnterpriseGoLiveRehearsal({
        teamId: registered.context.teams[0].id
      });
      expect(goLiveRehearsal.summary.blockers).toContain("release-gate-identity-production-evidence-required");
      expect(goLiveRehearsal.requiredEvidence).toContain("sena-enterprise-identity-production-evidence/v1");
      expect(goLiveRehearsal.evidence).toEqual(expect.arrayContaining([
        "latestReleaseGateIdentityProductionStatus=review",
        "latestReleaseGateIdentityVerifierIncomplete=1",
        "latestReleaseGateIdentityVerifierMissing=1",
        "latestReleaseGateIdentityVerifierMissingTechnical=0",
        "latestReleaseGateIdentityRotationFreshness=ready",
        "latestReleaseGateIdentityCutoverChecklist=review",
        "latestReleaseGateIdentityCutoverBlockers=1",
        ...latestReleaseGateIdentityReceiptArchiveEvidence
      ]));
      expect(goLiveRehearsal.releaseGateDraft.evidence).toEqual(expect.arrayContaining([
        "latestReleaseGateIdentityProductionStatus=review",
        "latestReleaseGateIdentityVerifierIncomplete=1",
        "latestReleaseGateIdentityVerifierMissing=1",
        "latestReleaseGateIdentityVerifierMissingTechnical=0",
        "latestReleaseGateIdentityRotationFreshness=ready",
        "latestReleaseGateIdentityCutoverChecklist=review",
        "latestReleaseGateIdentityCutoverBlockers=1",
        ...latestReleaseGateIdentityReceiptArchiveEvidence
      ]));
      expect(goLiveRehearsal.rollbackDrill.summary.blockers).toContain("release-gate-identity-production-evidence-required");
      expect(goLiveRehearsal.rollbackDrill.evidence).toEqual(expect.arrayContaining([
        "latestReleaseGateIdentityProductionStatus=review",
        "latestReleaseGateIdentityVerifierIncomplete=1",
        "latestReleaseGateIdentityVerifierMissing=1",
        "latestReleaseGateIdentityVerifierMissingTechnical=0",
        "latestReleaseGateIdentityRotationFreshness=ready",
        "latestReleaseGateIdentityCutoverChecklist=review",
        "latestReleaseGateIdentityCutoverBlockers=1",
        ...latestReleaseGateIdentityReceiptArchiveEvidence
      ]));
      expect(goLiveRehearsal.rollbackDrill.runbook.steps.find((step) => step.id === "rollback-release")?.evidence)
        .toEqual(expect.arrayContaining([
          "latestReleaseGateIdentityProductionStatus=review",
          "latestReleaseGateIdentityVerifierIncomplete=1",
          "latestReleaseGateIdentityRotationFreshness=ready",
          "latestReleaseGateIdentityCutoverChecklist=review",
          "latestReleaseGateIdentityCutoverBlockers=1",
          ...latestReleaseGateIdentityReceiptArchiveEvidence
        ]));
      expect(goLiveRehearsal.postCutoverMonitor.summary.blockers).toContain("release-gate-identity-production-evidence-required");
      expect(goLiveRehearsal.postCutoverMonitor.evidence).toEqual(expect.arrayContaining([
        "latestReleaseGateIdentityProductionStatus=review",
        "latestReleaseGateIdentityVerifierIncomplete=1",
        "latestReleaseGateIdentityVerifierMissing=1",
        "latestReleaseGateIdentityVerifierMissingTechnical=0",
        "latestReleaseGateIdentityRotationFreshness=ready",
        "latestReleaseGateIdentityCutoverChecklist=review",
        "latestReleaseGateIdentityCutoverBlockers=1",
        ...latestReleaseGateIdentityReceiptArchiveEvidence
      ]));
      expect(goLiveRehearsal.postCutoverMonitor.checks.find((check) => check.id === "release-verification")?.evidence)
        .toEqual(expect.arrayContaining([
          "latestReleaseGateIdentityProductionStatus=review",
          "latestReleaseGateIdentityVerifierIncomplete=1",
          "latestReleaseGateIdentityRotationFreshness=ready",
          "latestReleaseGateIdentityCutoverChecklist=review",
          "latestReleaseGateIdentityCutoverBlockers=1",
          ...latestReleaseGateIdentityReceiptArchiveEvidence
        ]));

      type AuditReceiptArchiveDecision = {
        decisionId: string;
        receiptAuditDigest?: string;
        submittedEvidenceDigest?: string;
        submittedEvidenceDigestScope?: string;
        productionEvidenceArtifactDigest?: string;
        productionEvidenceArtifactDigestCompletenessStatus?: string;
      };

      const releaseGateAudit = enterprise.listEnterpriseAuditLog(registered.context, {
        teamId: registered.context.teams[0].id,
        event: "ops.release_gate.review"
      }) as ReturnType<typeof enterprise.listEnterpriseAuditLog> & {
        events: Array<ReturnType<typeof enterprise.listEnterpriseAuditLog>["events"][number] & {
          detail?: {
            identitySubmissionVerifierIncomplete?: number;
            identitySubmissionVerifierMissing?: number;
            identitySubmissionVerifierMissingTechnical?: number;
            identityReceiptArchiveArtifactCompleteness?: string;
            identityReceiptArchiveDecisions?: string;
          };
        }>;
      };
      expect(releaseGateAudit.events[0]?.detail).toEqual(expect.objectContaining({
        identitySubmissionVerifierIncomplete: 1,
        identitySubmissionVerifierMissing: 1,
        identitySubmissionVerifierMissingTechnical: 0,
        identityReceiptArchiveArtifactCompleteness: artifactCompletenessEvidence
      }));
      expect(typeof releaseGateAudit.events[0]?.detail?.identityReceiptArchiveDecisions).toBe("string");
      const releaseGateAuditReceiptArchiveDecisions = JSON.parse(
        releaseGateAudit.events[0]?.detail?.identityReceiptArchiveDecisions ?? "[]"
      ) as AuditReceiptArchiveDecision[];
      expect(releaseGateAuditReceiptArchiveDecisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigestScope: "platform-submission-inputs",
          productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        })
      ]));

      const goLiveAttestation = enterprise.createEnterpriseGoLiveAttestation(registered.context, {
        teamId: registered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.01.02-preflight-after-idp-evidence",
        decision: "conditional",
        attesterName: "Institution release owner",
        attesterRole: "Identity platform",
        notes: "Conditional go-live attestation keeps the IdP receipt verifier review attached.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: true,
          platformOwnerDecisionReviewed: true
        }
      }) as ReturnType<typeof enterprise.createEnterpriseGoLiveAttestation> & {
        latestReleaseGateSnapshot?: {
          identityProductionStatus?: string;
          identityReleaseGateBlocked?: boolean;
          identitySubmissionVerifierIncomplete?: number;
          identitySubmissionVerifierMissing?: number;
          identitySubmissionVerifierMissingTechnical?: number;
          identityRotationFreshness?: string;
          identityCutoverChecklistStatus?: string;
          identityCutoverChecklistBlockingItems?: number;
          identityReceiptArchiveArtifactCompleteness?: string;
          identityReceiptArchiveDecisions?: Array<{
            decisionId: string;
            receiptAuditDigest?: string;
            submittedEvidenceDigest?: string;
            submittedEvidenceDigestScope?: string;
            productionEvidenceArtifactDigest?: string;
            productionEvidenceArtifactDigestCompletenessStatus?: string;
          }>;
        };
      };
      expect(goLiveAttestation.latestReleaseGateSnapshot).toEqual(expect.objectContaining({
        identityProductionStatus: "review",
        identityReleaseGateBlocked: true,
        identitySubmissionVerifierIncomplete: 1,
        identitySubmissionVerifierMissing: 1,
        identitySubmissionVerifierMissingTechnical: 0,
        identityRotationFreshness: "ready",
        identityCutoverChecklistStatus: "review",
        identityCutoverChecklistBlockingItems: 1,
        identityReceiptArchiveArtifactCompleteness: artifactCompletenessEvidence
      }));
      expect(goLiveAttestation.latestReleaseGateSnapshot?.identityReceiptArchiveDecisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigestScope: "platform-submission-inputs",
          productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        })
      ]));
      expect(goLiveAttestation.evidence).toEqual(expect.arrayContaining([
        "latestReleaseGateIdentityProductionStatus=review",
        "latestReleaseGateIdentityVerifierIncomplete=1",
        "latestReleaseGateIdentityVerifierMissing=1",
        "latestReleaseGateIdentityVerifierMissingTechnical=0",
        "latestReleaseGateIdentityRotationFreshness=ready",
        "latestReleaseGateIdentityCutoverChecklist=review",
        "latestReleaseGateIdentityCutoverBlockers=1",
        `latestReleaseGateIdentityReceiptArchiveArtifactCompleteness=${artifactCompletenessEvidence}`
      ]));

      const goLiveAudit = enterprise.listEnterpriseAuditLog(registered.context, {
        teamId: registered.context.teams[0].id,
        event: "ops.go_live.attestation"
      }) as ReturnType<typeof enterprise.listEnterpriseAuditLog> & {
        events: Array<ReturnType<typeof enterprise.listEnterpriseAuditLog>["events"][number] & {
          detail?: {
            latestReleaseGateIdentityProductionStatus?: string;
            latestReleaseGateIdentitySubmissionVerifierIncomplete?: number;
            latestReleaseGateIdentitySubmissionVerifierMissing?: number;
            latestReleaseGateIdentitySubmissionVerifierMissingTechnical?: number;
            latestReleaseGateIdentityCutoverChecklistStatus?: string;
            latestReleaseGateIdentityCutoverChecklistBlockingItems?: number;
            latestReleaseGateIdentityReceiptArchiveMissingInputs?: string;
            latestReleaseGateIdentityReceiptArchiveArtifactCompleteness?: string;
            latestReleaseGateIdentityReceiptArchiveDecisions?: string;
            identityProductionHandoffSnapshotReceiptArchiveMissingInputs?: string;
          };
        }>;
      };
      expect(goLiveAudit.events[0]?.detail).toEqual(expect.objectContaining({
        latestReleaseGateIdentityProductionStatus: "review",
        latestReleaseGateIdentitySubmissionVerifierIncomplete: 1,
        latestReleaseGateIdentitySubmissionVerifierMissing: 1,
        latestReleaseGateIdentitySubmissionVerifierMissingTechnical: 0,
        latestReleaseGateIdentityCutoverChecklistStatus: "review",
        latestReleaseGateIdentityCutoverChecklistBlockingItems: 1,
        latestReleaseGateIdentityReceiptArchiveMissingInputs: "technicalEvidenceBinding:1",
        latestReleaseGateIdentityReceiptArchiveArtifactCompleteness: artifactCompletenessEvidence,
        identityProductionHandoffSnapshotReceiptArchiveMissingInputs: "technicalEvidenceBinding:1"
      }));
      expect(typeof goLiveAudit.events[0]?.detail?.latestReleaseGateIdentityReceiptArchiveDecisions).toBe("string");
      const goLiveAuditReceiptArchiveDecisions = JSON.parse(
        goLiveAudit.events[0]?.detail?.latestReleaseGateIdentityReceiptArchiveDecisions ?? "[]"
      ) as AuditReceiptArchiveDecision[];
      expect(goLiveAuditReceiptArchiveDecisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigestScope: "platform-submission-inputs",
          productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
          productionEvidenceArtifactDigestCompletenessStatus: "complete"
        })
      ]));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not report rejected identity platform decisions as accepted production evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-rejected-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Owner",
        email: "rejected-identity-owner@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "rejected",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-rejected",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "Rejected pending institution tenant ownership."
      });

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances> & {
        acceptances: Array<ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances>["acceptances"][number] & {
          productionEvidenceReceipt?: {
            submittedEvidenceIds: string[];
            acceptedEvidenceIds: string[];
            missingEvidenceIds: string[];
          };
        }>;
      };
      const rejectedIdpAcceptance = acceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval");
      expect(rejectedIdpAcceptance?.status).toBe("rejected");
      expect(rejectedIdpAcceptance?.acceptedBridge).toBe(false);
      expect(rejectedIdpAcceptance?.productionEvidenceReceipt?.submittedEvidenceIds).toEqual([]);
      expect(rejectedIdpAcceptance?.productionEvidenceReceipt?.acceptedEvidenceIds).toEqual([]);
      expect(rejectedIdpAcceptance?.productionEvidenceReceipt?.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-secret-rotation"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires fresh SSO and provisioning rotation evidence before auth stays production-ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-rotation-freshness-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Rotation Owner",
        email: "rotation-identity-owner@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-rotation-fresh",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-rotation-fresh",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          rotationFreshness?: {
            schemaVersion: string;
            status: string;
            summary: { expired: number };
          };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.rotationFreshness?.schemaVersion).toBe("sena-enterprise-identity-rotation-freshness/v1");
      expect(freshIdentityEvidence?.rotationFreshness?.status).toBe("ready");
      expect(freshIdentityEvidence?.rotationFreshness?.summary.expired).toBe(0);

      vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));

      const staleCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const staleAuthCapability = staleCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(staleAuthCapability?.status).toBe("review");
      expect(staleAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "secretHardening=pass",
        "secretRotation=review",
        "rotationFreshness=review",
        "rotationExpired=sso-secret-rotation|bearer-token-rotation"
      ]));
      expect(staleAuthCapability?.evidence).not.toContain("secretRotation=pass");
      expect(staleAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));

      const staleIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          rotationFreshness?: {
            schemaVersion: string;
            status: string;
            policy: { maxAgeDays: number; warningDays: number };
            summary: { expired: number; dueSoon: number };
            checks: Array<{
              id: string;
              status: string;
              ageDays: number;
              maxAgeDays: number;
              expiresAt: string;
              evidenceUrlHash?: string;
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
          nextActions: string[];
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(staleIdentityEvidence?.status).toBe("review");
      expect(staleIdentityEvidence?.rotationFreshness?.schemaVersion).toBe("sena-enterprise-identity-rotation-freshness/v1");
      expect(staleIdentityEvidence?.rotationFreshness?.status).toBe("review");
      expect(staleIdentityEvidence?.rotationFreshness?.policy).toEqual({ maxAgeDays: 180, warningDays: 30 });
      expect(staleIdentityEvidence?.rotationFreshness?.summary).toEqual(expect.objectContaining({
        expired: 2,
        dueSoon: 0
      }));
      expect(staleIdentityEvidence?.rotationFreshness?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-secret-rotation", status: "expired", maxAgeDays: 180 }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "expired", maxAgeDays: 180 })
      ]));
      expect(staleIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-secret-rotation",
        "bearer-token-rotation"
      ]));
      expect(staleIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(staleIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(staleIdentityEvidence?.nextActions.join(" ")).toContain("rotation evidence");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not count placeholder provisioning tokens as institution lifecycle production evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-weak-provisioning-token-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = "sena-test-provisioning-token";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Weak Provisioning Token Owner",
        email: "weak-provisioning-token@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-weak-provisioning-token",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-weak-token",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "provisioningToken=review",
        "rotationFreshness=ready"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-provisioning-owner"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
          platformRequestPacket: {
            summary: { blockingRequests: number; missingTechnicalPrerequisites: number };
            requests: Array<{
              decisionId: string;
              blocking: boolean;
              missingProductionEvidenceIds: string[];
              missingTechnicalPrerequisiteEvidenceIds?: string[];
            }>;
          };
          submissionVerifier?: {
            summary: {
              missingProductionEvidence: number;
              missingTechnicalPrerequisites: number;
              incompleteDecisions: number;
            };
            expectedSubmissions: Array<{
              decisionId: string;
              verifierStatus: string;
              stillMissingEvidenceIds: string[];
              missingTechnicalPrerequisiteEvidenceIds: string[];
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "provisioning-token"
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-provisioning-owner"
      ]));
      expect(identityEvidence?.platformRequestPacket.summary.blockingRequests).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.platformRequestPacket.summary.missingTechnicalPrerequisites).toBeGreaterThanOrEqual(1);
      const provisioningRequest = identityEvidence?.platformRequestPacket.requests.find((request) => request.decisionId === "institution-provisioning-owner");
      expect(provisioningRequest).toEqual(expect.objectContaining({
        blocking: true,
        missingProductionEvidenceIds: [],
        missingTechnicalPrerequisiteEvidenceIds: expect.arrayContaining(["provisioning-token"])
      }));

      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const provisioningDecision = deployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-provisioning-owner") as typeof deployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const provisioningTokenChecklist = provisioningDecision.evidenceChecklist?.find((item) => item.id === "provisioning-token");
      expect(provisioningTokenChecklist).toEqual(expect.objectContaining({
        id: "provisioning-token",
        status: "missing",
        productionRequired: true
      }));
      expect(provisioningTokenChecklist?.evidence).toEqual(expect.arrayContaining([
        "provisioningToken=configured",
        "provisioningTokenStrength=weak"
      ]));
      expect(JSON.stringify(identityEvidence)).not.toContain("sena-test-provisioning-token");
      expect(JSON.stringify(authCapability)).not.toContain("sena-test-provisioning-token");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not count placeholder institution SSO client secrets as production SSO evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-weak-sso-secret-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = "sena-institution-secret";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Weak SSO Secret Owner",
        email: "weak-sso-secret@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const preflight = await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(preflight.providers[0].status).toBe("review");
      expect(preflight.providers[0].checks.find((check) => check.id === "sso-provider-config")?.evidence).toEqual(expect.arrayContaining([
        "clientSecretStrength=weak"
      ]));
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-weak-sso-secret",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-weak-sso-secret",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "ssoSecrets=institution:weak|google:missing|orcid:missing",
        "ssoPreflightStatus=review",
        "rotationFreshness=ready"
      ]));
      expect(authCapability?.evidence).not.toContain("ssoSecrets=institution:configured|google:missing|orcid:missing");
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
          platformRequestPacket: {
            summary: { blockingRequests: number; missingTechnicalPrerequisites: number };
            requests: Array<{
              decisionId: string;
              blocking: boolean;
              missingProductionEvidenceIds: string[];
              missingTechnicalPrerequisiteEvidenceIds?: string[];
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
          receiptArchiveManifest: {
            decisions: Array<{
              decisionId: string;
              archiveStatus: string;
              missingArchiveInputs: string[];
              technicalBindingStatus?: string;
              technicalReadinessStatus?: string;
              nextAction: string;
            }>;
            evidence: string[];
          };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-provider-secrets",
        "sso-preflight"
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      expect(identityEvidence?.platformRequestPacket.summary.blockingRequests).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.platformRequestPacket.summary.missingTechnicalPrerequisites).toBeGreaterThanOrEqual(1);
      const idpRequest = identityEvidence?.platformRequestPacket.requests.find((request) => request.decisionId === "institution-idp-approval");
      expect(idpRequest).toEqual(expect.objectContaining({
        blocking: true,
        missingProductionEvidenceIds: expect.arrayContaining(["sso-provider-secrets"]),
        missingTechnicalPrerequisiteEvidenceIds: expect.arrayContaining(["sso-preflight"])
      }));
      expect(identityEvidence?.submissionVerifier?.summary).toEqual(expect.objectContaining({
        missingProductionEvidence: 1,
        missingTechnicalPrerequisites: expect.any(Number),
        incompleteDecisions: expect.any(Number)
      }));
      expect(identityEvidence?.submissionVerifier?.summary.missingTechnicalPrerequisites).toBeGreaterThanOrEqual(1);
      const idpSubmission = identityEvidence?.submissionVerifier?.expectedSubmissions.find((submission) => submission.decisionId === "institution-idp-approval");
      expect(idpSubmission).toEqual(expect.objectContaining({
        verifierStatus: "review",
        stillMissingEvidenceIds: expect.arrayContaining(["sso-provider-secrets"]),
        missingTechnicalPrerequisiteEvidenceIds: expect.arrayContaining(["sso-preflight"])
      }));

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as {
        acceptances: Array<{
          decisionId: string;
          productionEvidenceReceipt?: {
            verifierStatus?: string;
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            stillMissingEvidenceIds?: string[];
          };
        }>;
      };
      const idpAcceptanceReceipt = acceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      expect(idpAcceptanceReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "current",
        technicalReadinessStatus: "review",
        stillMissingEvidenceIds: ["sso-provider-secrets"]
      }));
      expect(identityEvidence?.receiptArchiveManifest.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          archiveStatus: "review",
          technicalBindingStatus: "current",
          technicalReadinessStatus: "review",
          missingArchiveInputs: ["technicalReadiness"],
          nextAction: expect.stringMatching(/technical readiness/i)
        })
      ]));
      expect(identityEvidence?.receiptArchiveManifest.evidence).toContain(
        "receiptArchive:institution-idp-approval=review;missing=technicalReadiness"
      );

      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const idpDecision = deployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof deployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const ssoProviderSecretsChecklist = idpDecision.evidenceChecklist?.find((item) => item.id === "sso-provider-secrets");
      expect(ssoProviderSecretsChecklist).toEqual(expect.objectContaining({
        id: "sso-provider-secrets",
        status: "missing",
        productionRequired: true
      }));
      expect(ssoProviderSecretsChecklist?.evidence.join(" ")).toContain("clientSecretStrength=weak");
      expect(JSON.stringify(identityEvidence)).not.toContain("sena-institution-secret");
      expect(JSON.stringify(authCapability)).not.toContain("sena-institution-secret");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not count reserved institution IdP endpoint hosts as production SSO evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-reserved-idp-host-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.example.test";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.example.test/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.example.test/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.example.test/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.example.test/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Reserved IdP Host Owner",
        email: "reserved-idp-host@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const preflight = await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(preflight.providers[0].status).toBe("review");
      expect(preflight.providers[0].checks.find((check) => check.id === "sso-production-endpoint-hosts")?.evidence).toEqual(expect.arrayContaining([
        "provider=institution",
        "endpointHostPolicy=reserved-example-or-test"
      ]));

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-reserved-endpoint-host",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence with a reserved endpoint host."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-reserved-endpoint-host",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "ssoPreflightStatus=review",
        "rotationFreshness=ready"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const idpDecision = deployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof deployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const ssoProviderSecretsChecklist = idpDecision.evidenceChecklist?.find((item) => item.id === "sso-provider-secrets");
      expect(ssoProviderSecretsChecklist).toEqual(expect.objectContaining({
        id: "sso-provider-secrets",
        status: "missing",
        productionRequired: true
      }));
      expect(ssoProviderSecretsChecklist?.evidence.join(" ")).toContain("endpointHostPolicy=reserved-example-or-test");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("does not let non-institution SSO providers satisfy institution IdP production evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-non-institution-sso-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_GOOGLE_CLIENT_ID = "sena-google-client";
    process.env.SENA_SSO_GOOGLE_CLIENT_SECRET = "sena-google-secret";
    process.env.SENA_SSO_GOOGLE_ISSUER = "https://accounts.google.example.test";
    process.env.SENA_SSO_GOOGLE_AUTHORIZATION_URL = "https://accounts.google.example.test/authorize";
    process.env.SENA_SSO_GOOGLE_TOKEN_URL = "https://accounts.google.example.test/token";
    process.env.SENA_SSO_GOOGLE_USERINFO_URL = "https://accounts.google.example.test/userinfo";
    process.env.SENA_SSO_GOOGLE_JWKS_URL = "https://accounts.google.example.test/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Missing IdP Secrets Owner",
        email: "missing-institution-idp@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["google"],
        baseUrl: "https://sena.example.test"
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-google-only",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Platform evidence is attached, but only Google SSO technical preflight is configured."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-google-only",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Fresh provisioning ownership and bearer-token rotation evidence."
      });

      const capabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const authCapability = capabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "ssoSecrets=institution:missing|google:weak|orcid:missing"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-provider-secrets",
        "sso-preflight"
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const idpDecision = deployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof deployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const ssoProviderSecretsChecklist = idpDecision.evidenceChecklist?.find((item) => item.id === "sso-provider-secrets");
      const ssoPreflightChecklist = idpDecision.evidenceChecklist?.find((item) => item.id === "sso-preflight");
      expect(idpDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-provider-secrets", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-preflight", status: "missing", productionRequired: true })
      ]));
      expect(ssoProviderSecretsChecklist?.evidence.join(" ")).not.toContain("google");
      expect(ssoPreflightChecklist?.evidence.join(" ")).not.toContain("google");
      expect(ssoProviderSecretsChecklist?.evidence.join(" ")).toContain("institution");
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("institution");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("keeps SSO governance in review until every configured provider has fresh preflight evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-all-sso-preflight-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    process.env.SENA_SSO_GOOGLE_CLIENT_ID = "sena-google-client";
    process.env.SENA_SSO_GOOGLE_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_GOOGLE_ISSUER = "https://accounts.google.com";
    process.env.SENA_SSO_GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    process.env.SENA_SSO_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
    process.env.SENA_SSO_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
    process.env.SENA_SSO_GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

    try {
      const enterprise = await import("../enterprise");

      const preflight = await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(preflight.summary.passed).toBe(1);

      const governance = enterprise.getEnterpriseGovernanceStatus();
      const ssoGovernance = governance.checks.find((check) => check.id === "oauth-oidc-sso");
      expect(ssoGovernance?.status).toBe("review");
      expect(ssoGovernance?.evidence).toEqual(expect.arrayContaining([
        "preflightPassedProviders=institution",
        "preflightMissingProviders=google"
      ]));

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["google"],
        baseUrl: "https://sena.example.test"
      });
      const completeGovernance = enterprise.getEnterpriseGovernanceStatus();
      const completeSsoGovernance = completeGovernance.checks.find((check) => check.id === "oauth-oidc-sso");
      expect(completeSsoGovernance?.status).toBe("pass");
      expect(completeSsoGovernance?.evidence).toEqual(expect.arrayContaining([
        "preflightPassedProviders=institution|google",
        "preflightMissingProviders=none"
      ]));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("expires stale SSO preflight evidence before auth stays production-ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-sso-preflight-freshness-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution SSO Preflight Owner",
        email: "sso-preflight-freshness@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-preflight-freshness",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-preflight-freshness",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          rotationFreshness?: { status: string };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.rotationFreshness?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      vi.setSystemTime(new Date("2026-02-15T00:00:00.000Z"));

      const staleCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const staleAuthCapability = staleCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(staleAuthCapability?.status).toBe("review");
      expect(staleAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "ssoPreflightStatus=review",
        "rotationFreshness=ready",
        "rotationExpired=none"
      ]));
      expect(staleAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const staleIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
          rotationFreshness?: { status: string };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(staleIdentityEvidence?.status).toBe("review");
      expect(staleIdentityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(staleIdentityEvidence?.rotationFreshness?.status).toBe("ready");
      expect(staleIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight"
      ]));
      expect(staleIdentityEvidence?.evidenceManifest.missingEvidenceIds).not.toContain("idp-tenant-approval");
      expect(staleIdentityEvidence?.evidenceManifest.missingEvidenceIds).not.toContain("idp-callback-approval");
      expect(staleIdentityEvidence?.evidenceManifest.missingEvidenceIds).not.toContain("sso-secret-rotation");
      expect(staleIdentityEvidence?.evidenceManifest.missingEvidenceIds).not.toContain("bearer-token-rotation");
      expect(staleIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(staleIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as {
        acceptances: Array<{
          decisionId: string;
          productionEvidenceReceipt?: {
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            technicalBindingEvidence?: string[];
          };
        }>;
      };
      const staleIdpAcceptanceReceipt = acceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      expect(staleIdpAcceptanceReceipt).toEqual(expect.objectContaining({
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review",
        technicalBindingEvidence: expect.arrayContaining([
          "acceptedPreflight=pass",
          "currentPreflight=stale"
        ])
      }));

      const staleDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const staleIdpDecision = staleDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof staleDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean }>;
      };
      expect(staleIdpDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-preflight", status: "missing", productionRequired: true })
      ]));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("invalidates SSO preflight evidence when institution provider endpoints change after the run", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-sso-preflight-config-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution SSO Config Binding Owner",
        email: "sso-preflight-config-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-preflight-config-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-preflight-config-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp2.institution.edu/token";
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

      const changedCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const changedAuthCapability = changedCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(changedAuthCapability?.status).toBe("review");
      expect(changedAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "ssoPreflightStatus=review",
        "rotationFreshness=ready"
      ]));
      expect(changedAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const changedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(changedIdentityEvidence?.status).toBe("review");
      expect(changedIdentityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight"
      ]));
      expect(changedIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(changedIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const changedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const changedIdpDecision = changedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof changedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const ssoPreflightChecklist = changedIdpDecision.evidenceChecklist?.find((item) => item.id === "sso-preflight");
      expect(ssoPreflightChecklist).toEqual(expect.objectContaining({
        id: "sso-preflight",
        status: "missing",
        productionRequired: true
      }));
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("preflight=stale-config");
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("configBinding=changed");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("invalidates SSO preflight evidence when institution provider endpoints are removed after the run", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-sso-preflight-missing-config-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution SSO Missing Config Owner",
        email: "sso-preflight-missing-config@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-preflight-missing-config",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-preflight-missing-config",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      delete process.env.SENA_SSO_INSTITUTION_TOKEN_URL;
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

      const changedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(changedIdentityEvidence?.status).toBe("review");
      expect(changedIdentityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-provider-secrets",
        "sso-preflight"
      ]));

      const changedAcceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as {
        acceptances: Array<{
          decisionId: string;
          productionEvidenceReceipt?: {
            verifierStatus?: string;
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            technicalBindingEvidence?: string[];
          };
        }>;
      };
      const changedIdpAcceptanceReceipt = changedAcceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      expect(changedIdpAcceptanceReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review"
      }));
      expect(changedIdpAcceptanceReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "currentTechnicalStatus=missing",
        "currentPreflight=missing"
      ]));

      const changedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const changedIdpDecision = changedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof changedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const ssoPreflightChecklist = changedIdpDecision.evidenceChecklist?.find((item) => item.id === "sso-preflight");
      expect(ssoPreflightChecklist).toEqual(expect.objectContaining({
        id: "sso-preflight",
        status: "missing",
        productionRequired: true
      }));
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("preflight=missing-config");
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("configBinding=missing-config");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("invalidates SSO preflight evidence when the SENA callback origin changes after the run", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-sso-preflight-callback-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution SSO Callback Binding Owner",
        email: "sso-preflight-callback-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-preflight-callback-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-preflight-callback-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      process.env.SENA_APP_URL = "https://sena-callback.example.test";
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

      const changedCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const changedAuthCapability = changedCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(changedAuthCapability?.status).toBe("review");
      expect(changedAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "ssoPreflightStatus=review",
        "rotationFreshness=ready"
      ]));
      expect(changedAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const changedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const changedIdpDecision = changedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof changedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const ssoPreflightChecklist = changedIdpDecision.evidenceChecklist?.find((item) => item.id === "sso-preflight");
      expect(ssoPreflightChecklist).toEqual(expect.objectContaining({
        id: "sso-preflight",
        status: "missing",
        productionRequired: true
      }));
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("preflight=stale-config");
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("configBinding=changed");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  async function expectInstitutionSsoPreflightStaleAfterNonSecretConfigChange(input: {
    dbPrefix: string;
    ownerName: string;
    email: string;
    idpEvidenceSlug: string;
    provisioningEvidenceSlug: string;
    mutateEnv: () => void;
  }) {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), input.dbPrefix));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: input.ownerName,
        email: input.email,
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const preflight = await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(preflight.summary.passed).toBe(1);
      expect(preflight.providers[0].status).toBe("pass");
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: `https://ops.institution.edu/sena/${input.idpEvidenceSlug}`,
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: `https://ops.institution.edu/sena/${input.provisioningEvidenceSlug}`,
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      input.mutateEnv();
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

      const changedCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const changedAuthCapability = changedCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(changedAuthCapability?.status).toBe("review");
      expect(changedAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "ssoPreflightStatus=review",
        "rotationFreshness=ready"
      ]));
      expect(changedAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const changedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[] };
          rotationFreshness?: { status: string };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(changedIdentityEvidence?.status).toBe("review");
      expect(changedIdentityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(changedIdentityEvidence?.rotationFreshness?.status).toBe("ready");
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight"
      ]));
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).not.toEqual(expect.arrayContaining([
        "sso-secret-rotation",
        "bearer-token-rotation"
      ]));
      expect(changedIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(changedIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const changedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const changedIdpDecision = changedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof changedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      const ssoPreflightChecklist = changedIdpDecision.evidenceChecklist?.find((item) => item.id === "sso-preflight");
      expect(ssoPreflightChecklist).toEqual(expect.objectContaining({
        id: "sso-preflight",
        status: "missing",
        productionRequired: true
      }));
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("preflight=stale-config");
      expect(ssoPreflightChecklist?.evidence.join(" ")).toContain("configBinding=changed");
      expect(JSON.stringify(changedDeployment)).not.toContain(productionLikeInstitutionSsoSecret);
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }

  it("invalidates SSO preflight evidence when the institution client id changes after the run", async () => {
    await expectInstitutionSsoPreflightStaleAfterNonSecretConfigChange({
      dbPrefix: "sena-enterprise-capability-audit-sso-preflight-client-binding-",
      ownerName: "Institution SSO Client Binding Owner",
      email: "sso-preflight-client-binding@example.edu",
      idpEvidenceSlug: "idp-preflight-client-binding",
      provisioningEvidenceSlug: "provisioning-preflight-client-binding",
      mutateEnv: () => {
        process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client-rotated";
      }
    });
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("invalidates SSO preflight evidence when the institution OIDC scopes change after the run", async () => {
    await expectInstitutionSsoPreflightStaleAfterNonSecretConfigChange({
      dbPrefix: "sena-enterprise-capability-audit-sso-preflight-scope-binding-",
      ownerName: "Institution SSO Scope Binding Owner",
      email: "sso-preflight-scope-binding@example.edu",
      idpEvidenceSlug: "idp-preflight-scope-binding",
      provisioningEvidenceSlug: "provisioning-preflight-scope-binding",
      mutateEnv: () => {
        process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email";
      }
    });
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("invalidates SSO preflight evidence when an optional institution JWKS endpoint is removed after the run", async () => {
    await expectInstitutionSsoPreflightStaleAfterNonSecretConfigChange({
      dbPrefix: "sena-enterprise-capability-audit-sso-preflight-jwks-binding-",
      ownerName: "Institution SSO JWKS Binding Owner",
      email: "sso-preflight-jwks-binding@example.edu",
      idpEvidenceSlug: "idp-preflight-jwks-binding",
      provisioningEvidenceSlug: "provisioning-preflight-jwks-binding",
      mutateEnv: () => {
        delete process.env.SENA_SSO_INSTITUTION_JWKS_URL;
      }
    });
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires renewed IdP platform evidence when institution SSO config changes and preflight is rerun", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-sso-platform-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution SSO Platform Binding Owner",
        email: "sso-platform-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-platform-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence for the current SSO app registration."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-platform-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client-rotated";
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
      const rerunPreflight = await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(rerunPreflight.summary.passed).toBe(1);

      const changedCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const changedAuthCapability = changedCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(changedAuthCapability?.status).toBe("review");
      expect(changedAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "ssoPreflightStatus=pass",
        "idpTenantApproval=accepted-bridge-missing-evidence",
        "rotationFreshness=ready"
      ]));
      expect(changedAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const changedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { platformBlocking: number; technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[]; presentEvidenceIds: string[] };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              verifierStatus?: string;
              technicalBindingStatus?: string;
              technicalReadinessStatus?: string;
              missingEvidenceIds: string[];
            };
          }>;
          platformRequestPacket: {
            summary: { receiptReviewRequests?: number };
            requests: Array<{
              decisionId: string;
              blocking: boolean;
              latestReceiptVerifierStatus?: string;
              latestReceiptTechnicalBindingStatus?: string;
              latestReceiptTechnicalReadinessStatus?: string;
              missingProductionEvidenceIds: string[];
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(changedIdentityEvidence?.status).toBe("review");
      expect(changedIdentityEvidence?.summary.platformBlocking).toBeGreaterThanOrEqual(3);
      expect(changedIdentityEvidence?.summary.technicalBlocking).toBe(0);
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation"
      ]));
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).not.toContain("sso-preflight");
      expect(changedIdentityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight",
        "provisioning-token"
      ]));
      expect(changedIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(changedIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      const changedIdpReceipt = changedIdentityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval");
      expect(changedIdpReceipt?.productionEvidenceReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "ready",
        missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
      }));
      expect(changedIdentityEvidence?.platformRequestPacket.summary.receiptReviewRequests).toBeGreaterThanOrEqual(1);
      const changedIdpRequest = changedIdentityEvidence?.platformRequestPacket.requests.find((request) => request.decisionId === "institution-idp-approval");
      expect(changedIdpRequest).toEqual(expect.objectContaining({
        blocking: true,
        latestReceiptVerifierStatus: "review",
        latestReceiptTechnicalBindingStatus: "stale",
        latestReceiptTechnicalReadinessStatus: "ready",
        missingProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
      }));

      const changedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const changedIdpDecision = changedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof changedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      expect(changedIdpDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "idp-tenant-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "idp-callback-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-secret-rotation", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-provider-secrets", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-preflight", status: "present", productionRequired: true })
      ]));
      expect(JSON.stringify(changedDeployment)).not.toContain(productionLikeInstitutionSsoSecret);
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires renewed IdP platform evidence when institution SSO client secret readiness changes", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-sso-secret-platform-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution SSO Secret Platform Binding Owner",
        email: "sso-secret-platform-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-secret-platform-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence for the current SSO secret readiness."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-secret-platform-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = "sena-institution-secret";

      const changedCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const changedAuthCapability = changedCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(changedAuthCapability?.status).toBe("review");
      expect(changedAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "idpTenantApproval=accepted-bridge-missing-evidence",
        "ssoPreflightStatus=review",
        "rotationFreshness=ready"
      ]));
      expect(changedAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));

      const changedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { platformBlocking: number; technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[]; presentEvidenceIds: string[] };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              technicalBindingStatus?: string;
              technicalBindingEvidence?: string[];
              missingEvidenceIds: string[];
            };
          }>;
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(changedIdentityEvidence?.status).toBe("review");
      expect(changedIdentityEvidence?.summary.platformBlocking).toBeGreaterThanOrEqual(3);
      expect(changedIdentityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-secret-rotation",
        "sso-provider-secrets",
        "sso-preflight"
      ]));
      expect(changedIdentityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "provisioning-token"
      ]));
      expect(changedIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(changedIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      const changedIdpReceipt = changedIdentityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval");
      expect(changedIdpReceipt?.productionEvidenceReceipt).toEqual(expect.objectContaining({
        technicalBindingStatus: "stale",
        missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
      }));
      expect(changedIdpReceipt?.productionEvidenceReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "technicalBinding=stale",
        "acceptedClientSecretStrength=configured",
        "currentClientSecretStrength=weak"
      ]));

      const changedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const changedIdpDecision = changedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-idp-approval") as typeof changedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      expect(changedIdpDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "idp-tenant-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "idp-callback-approval", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-secret-rotation", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "sso-provider-secrets", status: "missing", productionRequired: true })
      ]));
      expect(JSON.stringify(changedIdentityEvidence)).not.toContain(productionLikeInstitutionSsoSecret);
      expect(JSON.stringify(changedIdentityEvidence)).not.toContain("sena-institution-secret");
      expect(JSON.stringify(changedCapabilityAudit)).not.toContain("sena-institution-secret");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires renewed provisioning owner evidence when the provisioning token readiness changes", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-provisioning-platform-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Provisioning Platform Binding Owner",
        email: "provisioning-platform-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-provisioning-platform-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-token-platform-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence for the current provisioning token readiness."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      process.env.SENA_PROVISIONING_TOKEN = "sena-test-provisioning-token";

      const changedCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const changedAuthCapability = changedCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(changedAuthCapability?.status).toBe("review");
      expect(changedAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "provisioningToken=review",
        "rotationFreshness=ready"
      ]));
      expect(changedAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-provisioning-owner"
      ]));

      const changedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { platformBlocking: number; technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[]; presentEvidenceIds: string[] };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              technicalBindingStatus?: string;
              technicalBindingEvidence?: string[];
              missingEvidenceIds: string[];
            };
          }>;
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(changedIdentityEvidence?.status).toBe("review");
      expect(changedIdentityEvidence?.summary.platformBlocking).toBeGreaterThanOrEqual(4);
      expect(changedIdentityEvidence?.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails",
        "provisioning-token"
      ]));
      expect(changedIdentityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight"
      ]));
      expect(changedIdentityEvidence?.evidenceManifest.presentEvidenceIds).not.toEqual(expect.arrayContaining([
        "provisioning-token"
      ]));
      expect(changedIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(changedIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-provisioning-owner"
      ]));
      const changedProvisioningReceipt = changedIdentityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner");
      expect(changedProvisioningReceipt?.productionEvidenceReceipt).toEqual(expect.objectContaining({
        technicalBindingStatus: "stale",
        missingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"])
      }));
      expect(changedProvisioningReceipt?.productionEvidenceReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "technicalBinding=stale",
        "acceptedProvisioningStatus=ready",
        "currentProvisioningStatus=review"
      ]));

      const changedDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const changedProvisioningDecision = changedDeployment.platformDecisionRegister.decisions.find((decision) => decision.id === "institution-provisioning-owner") as typeof changedDeployment.platformDecisionRegister.decisions[number] & {
        evidenceChecklist?: Array<{ id: string; status: string; productionRequired: boolean; evidence: string[] }>;
      };
      expect(changedProvisioningDecision.evidenceChecklist).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "provisioning-owner", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "scim-or-idp-ownership", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "lifecycle-guardrails", status: "missing", productionRequired: true }),
        expect.objectContaining({ id: "provisioning-token", status: "missing", productionRequired: true })
      ]));
      expect(JSON.stringify(changedIdentityEvidence)).not.toContain(productionLikeProvisioningToken);
      expect(JSON.stringify(changedIdentityEvidence)).not.toContain("sena-test-provisioning-token");
      expect(JSON.stringify(changedCapabilityAudit)).not.toContain("sena-test-provisioning-token");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires renewed identity platform evidence when non-secret secret rotation versions change", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-secret-version-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-01";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-01";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Secret Version Binding Owner",
        email: "secret-version-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-secret-version-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP tenant, callback, and SSO secret rotation evidence for the current non-secret secret version."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-secret-version-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership, bearer-token rotation, and lifecycle guardrail evidence for the current non-secret token version."
      });

      const freshIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(freshIdentityEvidence?.status).toBe("ready");
      expect(freshIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual([]);

      process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
      process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";

      const changedCapabilityAudit = enterprise.getEnterpriseCapabilityAudit();
      const changedAuthCapability = changedCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(changedAuthCapability?.status).toBe("review");
      expect(changedAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));

      const changedIdentityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          summary: { platformBlocking: number; technicalBlocking: number };
          evidenceManifest: { missingEvidenceIds: string[]; presentEvidenceIds: string[] };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              verifierStatus?: string;
              technicalBindingStatus?: string;
              technicalReadinessStatus?: string;
              missingEvidenceIds: string[];
              technicalBindingEvidence?: string[];
            };
          }>;
          platformRequestPacket: {
            summary: { receiptReviewRequests?: number };
            requests: Array<{
              decisionId: string;
              latestReceiptVerifierStatus?: string;
              latestReceiptTechnicalBindingStatus?: string;
              latestReceiptTechnicalReadinessStatus?: string;
              missingProductionEvidenceIds: string[];
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(changedIdentityEvidence?.status).toBe("review");
      expect(changedIdentityEvidence?.summary.platformBlocking).toBeGreaterThanOrEqual(9);
      expect(changedIdentityEvidence?.summary.technicalBlocking).toBe(0);
      expect(changedIdentityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-provider-secrets",
        "sso-secret-store-reference",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(changedIdentityEvidence?.evidenceManifest.presentEvidenceIds).toEqual(expect.arrayContaining([
        "sso-preflight",
        "provisioning-token"
      ]));
      expect(changedIdentityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(changedIdentityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(changedIdentityEvidence?.platformRequestPacket.summary.receiptReviewRequests).toBeGreaterThanOrEqual(2);
      expect(changedIdentityEvidence?.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          latestReceiptVerifierStatus: "review",
          latestReceiptTechnicalBindingStatus: "stale",
          latestReceiptTechnicalReadinessStatus: "ready",
          missingProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          latestReceiptVerifierStatus: "review",
          latestReceiptTechnicalBindingStatus: "stale",
          latestReceiptTechnicalReadinessStatus: "ready",
          missingProductionEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"])
        })
      ]));
      const changedIdpReceipt = changedIdentityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      const changedProvisioningReceipt = changedIdentityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner")?.productionEvidenceReceipt;
      expect(changedIdpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedClientSecretVersionHash=present",
        "currentClientSecretVersionHash=present"
      ]));
      expect(changedProvisioningReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedProvisioningTokenVersionHash=present",
        "currentProvisioningTokenVersionHash=present"
      ]));
      expect(JSON.stringify(changedIdentityEvidence)).not.toContain("sso-client-secret-rotation-2026-02");
      expect(JSON.stringify(changedIdentityEvidence)).not.toContain("provisioning-token-rotation-2026-02");
      expect(JSON.stringify(changedCapabilityAudit)).not.toContain("sso-client-secret-rotation-2026-02");
      expect(JSON.stringify(changedCapabilityAudit)).not.toContain("provisioning-token-rotation-2026-02");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("uses the platform-provided rotation evidence timestamp rather than the submission timestamp", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-rotation-evidence-time-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Evidence Timestamp Owner",
        email: "rotation-evidence-time@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-old-rotation-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2025-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "IdP tenant and callback evidence are attached, but the SSO secret rotation evidence is old."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-old-rotation-evidence",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2025-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Provisioning ownership evidence is attached, but the bearer-token rotation evidence is old."
      });

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              receiptAuditDigest?: string;
              submittedEvidenceDigest?: string;
              submittedEvidenceDigestScope?: string;
              productionEvidenceArtifactDigest?: string;
              productionEvidenceArtifactDigestCoverageStatus?: string;
              productionEvidenceArtifactDigestCompletenessStatus?: string;
              verifierStatus?: string;
              requestPacketPolicyBindingStatus?: string;
              technicalBindingStatus?: string;
              technicalReadinessStatus?: string;
              evidenceUrlHostBindingStatus?: string;
              rotationFreshnessStatus?: string;
              rotationExpiredEvidenceIds?: string[];
              rotationFreshnessChecks?: Array<{ id: string; status: string; verifiedAtHash?: string; expiresAtHash?: string }>;
            };
          }>;
          platformRequestPacket: {
            requests: Array<{
              decisionId: string;
              latestReceiptRotationFreshnessStatus?: string;
              latestReceiptRotationExpiredEvidenceIds?: string[];
              latestReceiptRotationDueSoonEvidenceIds?: string[];
            }>;
          };
          rotationFreshness?: {
            status: string;
            summary: { expired: number };
            checks: Array<{ id: string; status: string; verifiedAtHash?: string; expiresAtHash?: string }>;
          };
          receiptArchiveManifest: {
            decisions: Array<{
              decisionId: string;
              archiveStatus: string;
              missingArchiveInputs: string[];
              rotationFreshnessStatus?: string;
              nextAction: string;
            }>;
            evidence: string[];
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();

      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.rotationFreshness?.status).toBe("review");
      expect(identityEvidence?.rotationFreshness?.summary.expired).toBe(2);
      expect(identityEvidence?.rotationFreshness?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-secret-rotation", status: "expired", verifiedAtHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAtHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "expired", verifiedAtHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAtHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
      ]));
      expect(JSON.stringify(identityEvidence)).not.toContain("2025-01-01T00:00:00.000Z");
      expect(JSON.stringify(identityEvidence)).not.toContain("2025-06-30T00:00:00.000Z");
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-secret-rotation",
        "bearer-token-rotation"
      ]));
      const idpReceipt = identityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      const provisioningReceipt = identityEvidence?.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner")?.productionEvidenceReceipt;
      expect(idpReceipt?.rotationFreshnessStatus).toBe("review");
      expect(idpReceipt?.rotationExpiredEvidenceIds).toEqual(["sso-secret-rotation"]);
      expect(idpReceipt?.rotationFreshnessChecks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-secret-rotation", status: "expired", verifiedAtHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAtHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
      ]));
      expect(provisioningReceipt?.rotationFreshnessStatus).toBe("review");
      expect(provisioningReceipt?.rotationExpiredEvidenceIds).toEqual(["bearer-token-rotation"]);
      expect(provisioningReceipt?.rotationFreshnessChecks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "bearer-token-rotation", status: "expired", verifiedAtHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAtHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
      ]));
      const idpRequest = identityEvidence?.platformRequestPacket.requests.find((request) => request.decisionId === "institution-idp-approval");
      const provisioningRequest = identityEvidence?.platformRequestPacket.requests.find((request) => request.decisionId === "institution-provisioning-owner");
      expect(idpRequest?.latestReceiptRotationFreshnessStatus).toBe("review");
      expect(idpRequest?.latestReceiptRotationExpiredEvidenceIds).toEqual(["sso-secret-rotation"]);
      expect(provisioningRequest?.latestReceiptRotationFreshnessStatus).toBe("review");
      expect(provisioningRequest?.latestReceiptRotationExpiredEvidenceIds).toEqual(["bearer-token-rotation"]);
      const idpArchive = identityEvidence?.receiptArchiveManifest.decisions.find((decision) => decision.decisionId === "institution-idp-approval");
      const provisioningArchive = identityEvidence?.receiptArchiveManifest.decisions.find((decision) => decision.decisionId === "institution-provisioning-owner");
      expect(idpArchive).toEqual(expect.objectContaining({
        archiveStatus: "review",
        rotationFreshnessStatus: "review",
        missingArchiveInputs: ["rotationFreshness"],
        nextAction: expect.stringMatching(/rotation evidence/i)
      }));
      expect(provisioningArchive).toEqual(expect.objectContaining({
        archiveStatus: "review",
        rotationFreshnessStatus: "review",
        missingArchiveInputs: ["rotationFreshness"],
        nextAction: expect.stringMatching(/rotation evidence/i)
      }));
      expect(identityEvidence?.receiptArchiveManifest.evidence).toEqual(expect.arrayContaining([
        "receiptArchive:institution-idp-approval=review;missing=rotationFreshness",
        "receiptArchive:institution-provisioning-owner=review;missing=rotationFreshness"
      ]));
      const platformDecisionAudit = enterprise.listEnterpriseAuditLog(registered.context, {
        teamId: registered.context.teams[0].id,
        event: "ops.platform_decision.review"
      }) as ReturnType<typeof enterprise.listEnterpriseAuditLog> & {
        events: Array<ReturnType<typeof enterprise.listEnterpriseAuditLog>["events"][number] & {
          detail: {
            decisionId?: string;
            identityReceiptAuditDigest?: string;
            identitySubmittedEvidenceDigest?: string;
            identitySubmittedEvidenceDigestScope?: string;
            identityProductionEvidenceArtifactDigest?: string;
            identityProductionEvidenceArtifactCoverage?: string;
            identityProductionEvidenceArtifactCompleteness?: string;
            identityVerifierStatus?: string;
            identityRequestPacketPolicyBindingStatus?: string;
            identityTechnicalBindingStatus?: string;
            identityTechnicalReadinessStatus?: string;
            identityEvidenceUrlHostBindingStatus?: string;
            identityRotationFreshness?: string;
            identityRotationExpiredEvidenceIds?: string;
            identityRotationDueSoonEvidenceIds?: string;
          };
        }>;
      };
      const idpAudit = platformDecisionAudit.events.find((event) => event.detail.decisionId === "institution-idp-approval");
      const provisioningAudit = platformDecisionAudit.events.find((event) => event.detail.decisionId === "institution-provisioning-owner");
      expect(idpAudit?.detail).toEqual(expect.objectContaining({
        identityReceiptAuditDigest: idpReceipt?.receiptAuditDigest,
        identitySubmittedEvidenceDigest: idpReceipt?.submittedEvidenceDigest,
        identitySubmittedEvidenceDigestScope: idpReceipt?.submittedEvidenceDigestScope,
        identityProductionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        identityProductionEvidenceArtifactCoverage: idpReceipt?.productionEvidenceArtifactDigestCoverageStatus,
        identityProductionEvidenceArtifactCompleteness: idpReceipt?.productionEvidenceArtifactDigestCompletenessStatus,
        identityVerifierStatus: idpReceipt?.verifierStatus,
        identityRequestPacketPolicyBindingStatus: idpReceipt?.requestPacketPolicyBindingStatus,
        identityTechnicalBindingStatus: idpReceipt?.technicalBindingStatus,
        identityTechnicalReadinessStatus: idpReceipt?.technicalReadinessStatus,
        identityEvidenceUrlHostBindingStatus: idpReceipt?.evidenceUrlHostBindingStatus
      }));
      expect(idpAudit?.detail.identityReceiptAuditDigest).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
      expect(idpAudit?.detail.identitySubmittedEvidenceDigest).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
      expect(idpAudit?.detail.identityRotationFreshness).toBe("review");
      expect(idpAudit?.detail.identityRotationExpiredEvidenceIds).toBe("sso-secret-rotation");
      expect(idpAudit?.detail.identityRotationDueSoonEvidenceIds).toBe("none");
      expect(provisioningAudit?.detail).toEqual(expect.objectContaining({
        identityReceiptAuditDigest: provisioningReceipt?.receiptAuditDigest,
        identitySubmittedEvidenceDigest: provisioningReceipt?.submittedEvidenceDigest,
        identitySubmittedEvidenceDigestScope: provisioningReceipt?.submittedEvidenceDigestScope,
        identityProductionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        identityProductionEvidenceArtifactCoverage: provisioningReceipt?.productionEvidenceArtifactDigestCoverageStatus,
        identityProductionEvidenceArtifactCompleteness: provisioningReceipt?.productionEvidenceArtifactDigestCompletenessStatus,
        identityVerifierStatus: provisioningReceipt?.verifierStatus,
        identityRequestPacketPolicyBindingStatus: provisioningReceipt?.requestPacketPolicyBindingStatus,
        identityTechnicalBindingStatus: provisioningReceipt?.technicalBindingStatus,
        identityTechnicalReadinessStatus: provisioningReceipt?.technicalReadinessStatus,
        identityEvidenceUrlHostBindingStatus: provisioningReceipt?.evidenceUrlHostBindingStatus
      }));
      expect(provisioningAudit?.detail.identityReceiptAuditDigest).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
      expect(provisioningAudit?.detail.identitySubmittedEvidenceDigest).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
      expect(provisioningAudit?.detail.identityRotationFreshness).toBe("review");
      expect(provisioningAudit?.detail.identityRotationExpiredEvidenceIds).toBe("bearer-token-rotation");
      expect(provisioningAudit?.detail.identityRotationDueSoonEvidenceIds).toBe("none");
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires explicit platform rotation evidence verification timestamps before auth is production-ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-missing-rotation-evidence-time-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Missing Evidence Timestamp Owner",
        email: "missing-rotation-evidence-time@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-missing-rotation-evidence-time",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "IdP tenant, callback, and SSO secret rotation evidence are submitted without a verification timestamp."
      })).toThrow(/production evidence verified-at timestamp is required/i);
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-missing-rotation-evidence-time",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        notes: "Provisioning ownership, bearer-token rotation, and lifecycle evidence are submitted without a verification timestamp."
      })).toThrow(/production evidence verified-at timestamp is required/i);

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "rotationFreshness=review"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          rotationFreshness?: {
            status: string;
            summary: { missing: number };
            checks: Array<{ id: string; status: string; verifiedAt?: string }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();

      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.rotationFreshness?.status).toBe("review");
      expect(identityEvidence?.rotationFreshness?.summary.missing).toBe(2);
      expect(identityEvidence?.rotationFreshness?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-secret-rotation", status: "missing" }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "missing" })
      ]));
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-secret-rotation",
        "bearer-token-rotation"
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects identity production evidence submissions without valid past verified-at timestamps", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-invalid-identity-evidence-time-submit-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Evidence Timestamp Submitter",
        email: "submit-identity-evidence-time@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-missing-evidence-time",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "Attempts to attach IdP tenant evidence without a platform verified-at timestamp."
      })).toThrow(/production evidence verified-at timestamp is required/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-invalid-evidence-time",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "not-a-valid-date",
        notes: "Attempts to attach IdP tenant evidence with a malformed verified-at timestamp."
      })).toThrow(/valid past-or-present production evidence verified-at timestamp/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-future-evidence-time",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-07-01T00:00:00.000Z",
        notes: "Attempts to attach provisioning ownership evidence with a future verified-at timestamp."
      })).toThrow(/valid past-or-present production evidence verified-at timestamp/i);
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects non-canonical identity production evidence verified-at timestamps", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-non-canonical-identity-evidence-time-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Evidence Timestamp Canonical Submitter",
        email: "submit-canonical-identity-evidence-time@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-date-only-evidence-time",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15",
        notes: "Attempts to attach IdP tenant evidence with a date-only verified-at timestamp."
      })).toThrow(/canonical ISO/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-human-evidence-time",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "January 15, 2026",
        notes: "Attempts to attach provisioning ownership evidence with a human-readable verified-at timestamp."
      })).toThrow(/canonical ISO/i);

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId
      });
      expect(identityEvidence.platformRequestPacket.requests.every((request) => request.acceptedProductionEvidenceIds.length === 0)).toBe(true);
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects identity production evidence ids without an evidence URL", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-missing-identity-evidence-url-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Evidence URL Submitter",
        email: "submit-identity-evidence-url@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution IdP tenant evidence without an institution evidence URL."
      })).toThrow(/evidence URL/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Institution identity lifecycle owner",
        environment: "pilot-production",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution provisioning owner evidence without an institution evidence URL."
      })).toThrow(/evidence URL/i);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires platform verification timestamps for non-rotation identity production evidence ids", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-missing-identity-evidence-time-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Undated Evidence Owner",
        email: "undated-identity-evidence@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-undated-approval",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "IdP tenant and callback approval evidence is attached without a platform verification timestamp."
      })).toThrow(/production evidence verified-at timestamp is required/i);
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-undated-ownership",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        notes: "Provisioning owner, SCIM or IdP ownership, and lifecycle guardrail evidence is attached without a platform verification timestamp."
      })).toThrow(/production evidence verified-at timestamp is required/i);

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as {
        summary: { acceptedBridgeMissingEvidence?: number; total: number };
        acceptances: Array<{
          decisionId: string;
          productionEvidenceReceipt?: {
            acceptedEvidenceIds: string[];
            missingEvidenceIds: string[];
          };
        }>;
      };
      expect(acceptanceList.summary.total).toBe(0);
      expect(acceptanceList.summary.acceptedBridgeMissingEvidence).toBe(0);
      expect(acceptanceList.acceptances).toEqual([]);

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: {
            acceptedEvidenceIds: string[];
            missingEvidenceIds: string[];
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();

      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.evidenceManifest.acceptedEvidenceIds).toEqual([]);
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "lifecycle-guardrails"
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects invalid platform-provided rotation evidence timestamps before saving production evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-invalid-rotation-evidence-time-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Invalid Evidence Timestamp Owner",
        email: "invalid-rotation-evidence-time@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-invalid-rotation-evidence-time",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "not-a-valid-date",
        notes: "IdP tenant and callback evidence are attached, but the rotation evidence timestamp is malformed."
      })).toThrow(/valid past-or-present production evidence verified-at timestamp/i);
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-invalid-rotation-evidence-time",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "not-a-valid-date",
        notes: "Provisioning ownership evidence is attached, but the rotation evidence timestamp is malformed."
      })).toThrow(/valid past-or-present production evidence verified-at timestamp/i);

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "rotationFreshness=review"
      ]));
      expect(authCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          rotationFreshness?: {
            status: string;
            summary: { missing: number };
            checks: Array<{ id: string; status: string; verifiedAt?: string }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();

      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.rotationFreshness?.status).toBe("review");
      expect(identityEvidence?.rotationFreshness?.summary.missing).toBe(2);
      expect(identityEvidence?.rotationFreshness?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-secret-rotation", status: "missing" }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "missing" })
      ]));
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-secret-rotation",
        "bearer-token-rotation"
      ]));
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as {
        summary: { total: number; acceptedBridgeMissingEvidence?: number };
        acceptances: Array<{
          decisionId: string;
          productionEvidenceReceipt?: {
            acceptedEvidenceIds: string[];
            missingEvidenceIds: string[];
          };
        }>;
      };
      expect(acceptanceList.summary.total).toBe(0);
      expect(acceptanceList.summary.acceptedBridgeMissingEvidence).toBe(0);
      expect(acceptanceList.acceptances).toEqual([]);
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects future platform-provided identity evidence timestamps before saving production evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-future-identity-evidence-time-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Future Evidence Timestamp Owner",
        email: "future-identity-evidence-time@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-future-evidence-time",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-07-01T00:00:00.000Z",
        notes: "IdP tenant, callback, and SSO secret rotation evidence has a future verification timestamp."
      })).toThrow(/valid past-or-present production evidence verified-at timestamp/i);
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-future-evidence-time",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-07-01T00:00:00.000Z",
        notes: "Provisioning ownership, bearer-token rotation, and lifecycle guardrail evidence has a future verification timestamp."
      })).toThrow(/valid past-or-present production evidence verified-at timestamp/i);

      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.status).toBe("review");
      expect(authCapability?.evidence).toEqual(expect.arrayContaining([
        "rotationFreshness=review"
      ]));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          evidenceManifest: {
            acceptedEvidenceIds: string[];
            missingEvidenceIds: string[];
          };
          rotationFreshness?: {
            status: string;
            summary: { missing: number };
            checks: Array<{ id: string; status: string; verifiedAt?: string }>;
          };
          acceptanceReceipts: Array<{
            decisionId: string;
            productionEvidenceReceipt?: {
              acceptedEvidenceIds: string[];
              missingEvidenceIds: string[];
            };
          }>;
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
        };
      }).getEnterpriseIdentityProductionEvidence?.();

      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.evidenceManifest.acceptedEvidenceIds).toEqual([]);
      expect(identityEvidence?.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(identityEvidence?.rotationFreshness?.status).toBe("review");
      expect(identityEvidence?.rotationFreshness?.summary.missing).toBe(2);
      expect(identityEvidence?.rotationFreshness?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sso-secret-rotation", status: "missing" }),
        expect.objectContaining({ id: "bearer-token-rotation", status: "missing" })
      ]));
      expect(identityEvidence?.acceptanceReceipts).toEqual([]);
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("verifies partial identity production evidence submissions against the request packet", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-submission-verifier-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Partial Evidence Owner",
        email: "partial-identity-owner@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-cross-decision-evidence",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "Attempts to attach provisioning evidence to the IdP decision."
      })).toThrow(/not valid for institution-idp-approval/);

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-partial-evidence",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Only tenant approval has been attached so far."
      });

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances> & {
        acceptances: Array<ReturnType<typeof enterprise.listEnterprisePlatformDecisionAcceptances>["acceptances"][number] & {
          evidenceUrlPathHash?: string;
          productionEvidenceReceipt?: {
            schemaVersion: string;
            verifierStatus?: string;
            requestPacketSchemaVersion?: string;
            expectedEvidenceIds?: string[];
            matchedRequestEvidenceIds?: string[];
            unexpectedEvidenceIds?: string[];
            stillMissingEvidenceIds?: string[];
            evidenceUrlPathHash?: string;
          };
        }>;
      };
      const partialIdpAcceptance = acceptanceList.acceptances.find((acceptance) => acceptance.decisionId === "institution-idp-approval");
      expect(partialIdpAcceptance?.evidenceUrlPathHash).toMatch(/^[a-f0-9]{64}$/);
      expect(partialIdpAcceptance?.productionEvidenceReceipt?.evidenceUrlPathHash).toBe(partialIdpAcceptance?.evidenceUrlPathHash);
      expect(JSON.stringify(partialIdpAcceptance)).not.toContain("/sena/idp-partial-evidence");
      expect(partialIdpAcceptance?.productionEvidenceReceipt).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-platform-decision-production-evidence-receipt/v1",
        verifierStatus: "review",
        requestPacketSchemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1",
        expectedEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        matchedRequestEvidenceIds: [],
        unexpectedEvidenceIds: [],
        stillMissingEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]
      }));

      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          status: string;
          submissionVerifier?: {
            schemaVersion: string;
            summary: {
              expectedDecisions: number;
              verifiedDecisions: number;
              incompleteDecisions: number;
              missingProductionEvidence: number;
            };
            expectedSubmissions: Array<{
              decisionId: string;
              expectedProductionEvidenceIds: string[];
              matchedRequestEvidenceIds: string[];
              stillMissingEvidenceIds: string[];
              verifierStatus: string;
            }>;
          };
          releaseGate: { approvalBlocked: boolean; productionBlockingDecisionIds: string[] };
          evidence: string[];
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.status).toBe("review");
      expect(identityEvidence?.submissionVerifier?.schemaVersion).toBe("sena-enterprise-identity-submission-verifier/v1");
      expect(identityEvidence?.submissionVerifier?.summary).toEqual(expect.objectContaining({
        expectedDecisions: 2,
        verifiedDecisions: 0,
        incompleteDecisions: 2,
        missingProductionEvidence: expect.any(Number)
      }));
      expect(identityEvidence?.submissionVerifier?.summary.missingProductionEvidence).toBeGreaterThanOrEqual(6);
      expect(identityEvidence?.submissionVerifier?.expectedSubmissions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          verifierStatus: "review",
          expectedProductionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]),
          matchedRequestEvidenceIds: [],
          stillMissingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          verifierStatus: "review",
          expectedProductionEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]),
          matchedRequestEvidenceIds: [],
          stillMissingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"])
        })
      ]));
      expect(identityEvidence?.evidence).toContain("submissionVerifier=sena-enterprise-identity-submission-verifier/v1");
      expect(identityEvidence?.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence?.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects secret-like values in identity production evidence notes", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-identity-notes-secret-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Notes Secret Reviewer",
        email: "identity-notes-secret@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId
      });
      const notesPolicy = (identityEvidence.platformRequestPacket.submission as typeof identityEvidence.platformRequestPacket.submission & {
        notesPolicy?: {
          secretValuesRejected?: boolean;
          bearerTokensRejected?: boolean;
          rejectedSensitiveAssignmentNames?: string[];
        };
      }).notesPolicy;
      expect(notesPolicy).toEqual(expect.objectContaining({
        secretValuesRejected: true,
        bearerTokensRejected: true,
        rejectedSensitiveAssignmentNames: expect.arrayContaining([
          "client_secret",
          "token"
        ])
      }));
      expect(identityEvidence.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
        "notesSecretCarriers=sensitive-assignments|bearer-tokens-rejected"
      ]));

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-notes-secret",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Rotate complete; client_secret=sena-prod-client-secret-value-1234567890 was confirmed in the institution vault."
      })).toThrow(/notes must not include raw secret or token values/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-notes-token",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Provisioning owner confirmed with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
      })).toThrow(/notes must not include raw secret or token values/i);

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-notes-safe",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "SSO secret rotation evidence is attached via the institution evidence artifact; no raw secret value is pasted."
      });

      const acceptanceList = enterprise.listEnterprisePlatformDecisionAcceptances(registered.context, {
        teamId
      });
      expect(acceptanceList.summary.total).toBe(1);
      expect(JSON.stringify(acceptanceList)).not.toContain("sena-prod-client-secret-value-1234567890");
      expect(JSON.stringify(acceptanceList)).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects secret-like values in identity production evidence free-text fields", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-identity-free-text-secret-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Free Text Secret Reviewer",
        email: "identity-free-text-secret@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId
      });
      const freeTextPolicy = (identityEvidence.platformRequestPacket.submission as typeof identityEvidence.platformRequestPacket.submission & {
        freeTextPolicy?: {
          secretValuesRejected?: boolean;
          bearerTokensRejected?: boolean;
          fields?: string[];
          rejectedSensitiveAssignmentNames?: string[];
        };
      }).freeTextPolicy;
      expect(freeTextPolicy).toEqual(expect.objectContaining({
        secretValuesRejected: true,
        bearerTokensRejected: true,
        fields: expect.arrayContaining(["ownerName", "ownerRole", "environment", "notes"]),
        rejectedSensitiveAssignmentNames: expect.arrayContaining([
          "client_secret",
          "token"
        ])
      }));
      expect(identityEvidence.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
        "freeTextSecretCarriers=ownerName|ownerRole|environment|notes"
      ]));

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner client_secret=sena-prod-client-secret-value-1234567890",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-owner-name-secret",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attach IdP evidence without raw secrets."
      })).toThrow(/free-text fields must not include raw secret or token values/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform token: sena-prod-token-value-1234567890",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-owner-role-secret",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attach IdP evidence without raw secrets."
      })).toThrow(/free-text fields must not include raw secret or token values/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-environment-secret",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attach provisioning evidence without raw secrets."
      })).toThrow(/free-text fields must not include raw secret or token values/i);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects local SENA owner roles for identity production evidence submissions", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-owner-role-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Owner Role Reviewer",
        email: "identity-owner-role@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Local Application Owner",
        ownerRole: "SENA app owner",
        environment: "production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-owner-role",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to self-attest institution IdP approval from the SENA application owner role."
      })).toThrow(/institution identity platform owner role/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Local Application Owner",
        ownerRole: "SENA lifecycle app owner",
        environment: "production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-owner-role",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to self-attest institution provisioning ownership from the SENA application owner role."
      })).toThrow(/institution identity platform owner role/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Vendor IAM Owner",
        ownerRole: "Identity platform",
        environment: "production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-vendor-owner-role",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution IdP production evidence from a non-institution owner role."
      })).toThrow(/institution identity platform owner role/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Vendor Lifecycle Owner",
        ownerRole: "Identity lifecycle",
        environment: "production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-vendor-owner-role",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution provisioning production evidence from a non-institution owner role."
      })).toThrow(/institution identity platform owner role/i);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("rejects generic owner placeholders for identity production evidence submissions", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-owner-placeholder-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Owner Placeholder Reviewer",
        email: "identity-owner-placeholder@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution platform owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-placeholder-owner",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution IdP production evidence with only the request-packet owner placeholder."
      })).toThrow(/specific institution identity platform owner/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution platform owner",
        ownerRole: "Institution provisioning platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-placeholder-owner",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution provisioning production evidence with only the request-packet owner placeholder."
      })).toThrow(/specific institution identity platform owner/i);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("redacts rotation freshness verified-at timestamps by hash in the identity production handoff", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-rotation-verified-at-redaction-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-01";
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-secret-store/provisioning/sena-token";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-01";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-secret-store/sso/sena-client-secret";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Rotation Redaction Reviewer",
        email: "identity-rotation-redaction@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-old-rotation-redaction",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2025-01-01T00:00:00.000Z",
        notes: "Attach old IdP rotation evidence while keeping the raw verification timestamp out of the handoff."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        rotationFreshness: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["rotationFreshness"] & {
          checks: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["rotationFreshness"]["checks"][number] & {
            verifiedAtHash?: string;
            expiresAtHash?: string;
            verifiedAt?: string;
            expiresAt?: string;
          }>;
        };
      };
      const ssoRotationCheck = identityEvidence.rotationFreshness.checks.find((check) => check.id === "sso-secret-rotation");

      expect(ssoRotationCheck).toEqual(expect.objectContaining({
        status: "expired",
        verifiedAtHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAtHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(ssoRotationCheck).not.toHaveProperty("verifiedAt");
      expect(ssoRotationCheck).not.toHaveProperty("expiresAt");
      expect(JSON.stringify(identityEvidence)).not.toContain("2025-01-01T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("declares owner-name and verified-at hash redaction in the identity production handoff", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-identity-redaction-contract-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Redaction Contract Reviewer",
        email: "identity-redaction-contract@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        redaction: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["redaction"] & {
          ownerNamesHashed?: boolean;
          productionEvidenceTimestampsHashed?: boolean;
        };
      };

      expect(identityEvidence.redaction).toEqual(expect.objectContaining({
        secretValuesExcluded: true,
        endpointValuesHashed: true,
        evidenceUrlsHashed: true,
        ownerNamesHashed: true,
        productionEvidenceTimestampsHashed: true
      }));
      expect(identityEvidence.evidence).toEqual(expect.arrayContaining([
        "redaction=owner-names-hashed|production-evidence-timestamps-hashed"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("binds identity production owner names by hash without leaking the owner name in the handoff", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-owner-name-hash-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Owner Hash Reviewer",
        email: "identity-owner-hash@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-owner-hash",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attach institution IdP owner evidence without exposing the owner name in the handoff."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Nadia Chan",
        ownerRole: "Institution identity lifecycle owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-owner-hash",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attach institution provisioning owner evidence without exposing the owner name in the handoff."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          ownerNameHash?: string;
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            ownerNameHash?: string;
          };
        }>;
      };
      const idpReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval");
      const provisioningReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner");

      expect(idpReceipt?.ownerNameHash).toMatch(/^[a-f0-9]{64}$/);
      expect(provisioningReceipt?.ownerNameHash).toMatch(/^[a-f0-9]{64}$/);
      expect(idpReceipt?.productionEvidenceReceipt?.ownerNameHash).toBe(idpReceipt?.ownerNameHash);
      expect(provisioningReceipt?.productionEvidenceReceipt?.ownerNameHash).toBe(provisioningReceipt?.ownerNameHash);
      expect(JSON.stringify(identityEvidence)).not.toContain("Maya Lee");
      expect(JSON.stringify(identityEvidence)).not.toContain("Nadia Chan");
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("binds identity production verified-at timestamps by hash without leaking the timestamp in the handoff", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-verified-at-hash-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Verified At Hash Reviewer",
        email: "identity-verified-at-hash@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-verified-at-hash",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attach institution IdP tenant evidence without exposing the raw verified-at timestamp in the handoff."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Nadia Chan",
        ownerRole: "Institution identity lifecycle owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/provisioning-verified-at-hash",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attach institution provisioning owner evidence without exposing the raw verified-at timestamp in the handoff."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          productionEvidenceVerifiedAtHash?: string;
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            productionEvidenceVerifiedAtHash?: string;
          };
        }>;
      };
      const idpReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval");
      const provisioningReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner");

      expect(idpReceipt?.productionEvidenceVerifiedAtHash).toMatch(/^[a-f0-9]{64}$/);
      expect(provisioningReceipt?.productionEvidenceVerifiedAtHash).toMatch(/^[a-f0-9]{64}$/);
      expect(idpReceipt?.productionEvidenceReceipt?.productionEvidenceVerifiedAtHash).toBe(idpReceipt?.productionEvidenceVerifiedAtHash);
      expect(provisioningReceipt?.productionEvidenceReceipt?.productionEvidenceVerifiedAtHash).toBe(provisioningReceipt?.productionEvidenceVerifiedAtHash);
      expect(JSON.stringify(identityEvidence)).not.toContain("2026-01-15T00:00:00.000Z");
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("publishes evidence URL required ids in the identity production request packet", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-evidence-url-required-policy-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Evidence URL Required Reviewer",
        email: "identity-evidence-url-required@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId: registered.context.teams[0].id
      });
      const evidenceUrlPolicy = identityEvidence.platformRequestPacket.submission.evidenceUrlPolicy as
        typeof identityEvidence.platformRequestPacket.submission.evidenceUrlPolicy & {
          evidenceUrlRequiredForProductionEvidence?: boolean;
          evidenceUrlRequiredForEvidenceIds?: string[];
          embeddedCredentialsRejected?: boolean;
          fragmentsRejected?: boolean;
          sensitiveQueryParametersRejected?: boolean;
          rejectedSensitiveQueryParameters?: string[];
          specificEvidencePathRequired?: boolean;
        };

      expect(evidenceUrlPolicy).toEqual(expect.objectContaining({
        evidenceUrlRequiredForProductionEvidence: true,
        specificEvidencePathRequired: true,
        embeddedCredentialsRejected: true,
        fragmentsRejected: true,
        sensitiveQueryParametersRejected: true,
        rejectedSensitiveQueryParameters: expect.arrayContaining([
          "access_token",
          "client_secret",
          "token"
        ]),
        evidenceUrlRequiredForEvidenceIds: expect.arrayContaining([
          "idp-tenant-approval",
          "idp-callback-approval",
          "sso-provider-secrets",
          "sso-secret-store-reference",
          "sso-secret-rotation",
          "provisioning-owner",
          "scim-or-idp-ownership",
          "bearer-token-rotation",
          "lifecycle-guardrails"
        ])
      }));
      expect(evidenceUrlPolicy.evidenceUrlRequiredForEvidenceIds).toHaveLength(9);
      expect(identityEvidence.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
        "evidenceUrlRequiredForProductionEvidence=true",
        "evidenceUrlPath=specific-path-required",
        "evidenceUrlSecretCarriers=credentials|fragments|sensitive-query-rejected"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires identity production submissions to echo the current request packet policy hash", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-request-policy-hash-submit-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Request Policy Reviewer",
        email: "identity-request-policy@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({ teamId });
      const currentRequestPacketPolicyHash = identityEvidence.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);

      expect(currentRequestPacketPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(identityEvidence.platformRequestPacket.submission.requiredBodyFields).toContain("requestPacketPolicyHash");
      expect(identityEvidence.platformRequestPacket.submission.identityProductionEvidenceBodyFields).toContain("requestPacketPolicyHash");
      expect(identityEvidence.platformRequestPacket.evidence).toContain("requestPacketPolicyHashRequired=true");

      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS", "ops.institution.edu");
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-request-policy-missing",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempt to submit institution IdP evidence without echoing the request packet policy."
      })).toThrow(/must include the current identity request packet policy hash/i);
      vi.unstubAllEnvs();

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-request-policy-stale",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        requestPacketPolicyHash: "0".repeat(64),
        notes: "Attempt to submit institution IdP evidence against a stale request packet."
      })).toThrow(/current identity request packet policy hash/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-request-policy-missing-artifact-digest",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        requestPacketPolicyHash: currentRequestPacketPolicyHash,
        notes: "Attempt to submit institution IdP evidence without the external evidence artifact digest."
      })).toThrow(/artifact digest is required/i);

      const acceptance = enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-request-policy-current",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        requestPacketPolicyHash: currentRequestPacketPolicyHash,
        notes: "Submit institution IdP evidence against the current request packet."
      }) as ReturnType<typeof enterprise.reviewEnterprisePlatformDecision> & {
        submittedRequestPacketPolicyHash?: string;
      };

      expect(acceptance.submittedRequestPacketPolicyHash).toBe(currentRequestPacketPolicyHash);
      expect(acceptance.productionEvidenceReceipt).toEqual(expect.objectContaining({
        requestPacketPolicyHash: currentRequestPacketPolicyHash,
        submittedRequestPacketPolicyHash: currentRequestPacketPolicyHash,
        requestPacketPolicyBindingStatus: "current",
        receiptAuditDigestAlgorithm: "sha256",
        receiptAuditDigestScope: "current-validation-snapshot",
        receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        submittedEvidenceDigestAlgorithm: "sha256",
        submittedEvidenceDigestScope: "platform-submission-inputs",
        submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        productionEvidenceArtifactDigestAlgorithm: "sha256",
        productionEvidenceArtifactDigestScope: "external-evidence-artifact",
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceArtifactDigestCompletenessStatus: "partial"
      }));
      const identityEvidenceAfterAcceptance = enterprise.getEnterpriseIdentityProductionEvidence({ teamId });
      const idpCutoverItem = identityEvidenceAfterAcceptance.cutoverChecklist.items
        .find((item) => item.id === "idp-tenant-approval");
      expect(idpCutoverItem).toEqual(expect.objectContaining({
        status: "review",
        artifactCompletenessStatus: "partial",
        nextActions: expect.arrayContaining([
          expect.stringMatching(/artifact digest/i)
        ])
      }));
      expect(identityEvidenceAfterAcceptance.cutoverChecklist.evidence).toEqual(expect.arrayContaining([
        "cutover:idp-tenant-approval=review;missing=idp-tenant-approval|idp-callback-approval;artifactCompleteness=partial"
      ]));
      expect(identityEvidenceAfterAcceptance.receiptArchiveManifest.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          archiveStatus: "review",
          receiptVerifierStatus: "review",
          digestHeader: "x-sena-identity-production-receipt-digest",
          receiptAuditDigest: acceptance.productionEvidenceReceipt?.receiptAuditDigest,
          receiptAuditDigestScope: "current-validation-snapshot",
          stableSubmissionDigestHeader: "x-sena-identity-submitted-evidence-digest",
          submittedEvidenceDigest: acceptance.productionEvidenceReceipt?.submittedEvidenceDigest,
          submittedEvidenceDigestScope: "platform-submission-inputs",
          productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          missingArchiveInputs: [
            "productionEvidenceCompleteness",
            "technicalEvidenceBinding",
            "technicalReadiness",
            "rotationFreshness"
          ],
          nextAction: expect.stringMatching(/production evidence/i)
        })
      ]));
      expect(identityEvidenceAfterAcceptance.receiptArchiveManifest.evidence).toEqual(expect.arrayContaining([
        expect.stringMatching(/^receiptArchive:institution-idp-approval=review;missing=.*productionEvidenceCompleteness.*technicalEvidenceBinding.*technicalReadiness.*rotationFreshness/)
      ]));

      const revisedArtifactDigest = "c".repeat(64);
      const revisedArtifactAcceptance = enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-request-policy-current",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: revisedArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        requestPacketPolicyHash: currentRequestPacketPolicyHash,
        notes: "Submit revised institution IdP evidence artifact digest against the current request packet."
      });
      expect(revisedArtifactAcceptance.productionEvidenceReceipt).toEqual(expect.objectContaining({
        submittedEvidenceDigestScope: "platform-submission-inputs",
        productionEvidenceArtifactDigest: revisedArtifactDigest
      }));
      expect(revisedArtifactAcceptance.productionEvidenceReceipt?.submittedEvidenceDigest)
        .not.toBe(acceptance.productionEvidenceReceipt?.submittedEvidenceDigest);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("keeps legacy identity production receipts in review when the request packet policy hash was never submitted", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-legacy-request-policy-hash-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "ops.institution.edu";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "90";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Legacy Request Packet Reviewer",
        email: "legacy-request-policy@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-legacy-request-policy",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Legacy IdP evidence record created before platform submissions echoed the request packet policy hash."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({ teamId });
      const idpReceipt = identityEvidence.acceptanceReceipts
        .find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      const idpSubmission = identityEvidence.submissionVerifier.expectedSubmissions
        .find((submission) => submission.decisionId === "institution-idp-approval");
      const idpRequest = identityEvidence.platformRequestPacket.requests
        .find((request) => request.decisionId === "institution-idp-approval");

      expect(idpReceipt).toEqual(expect.objectContaining({
        requestPacketPolicyBindingStatus: "stale",
        verifierStatus: "review"
      }));
      expect(idpReceipt).not.toHaveProperty("submittedRequestPacketPolicyHash");
      expect(idpSubmission).toEqual(expect.objectContaining({
        requestPacketPolicyBindingStatus: "stale",
        verifierStatus: "review"
      }));
      expect(idpRequest).toEqual(expect.objectContaining({
        blocking: true,
        latestReceiptRequestPacketPolicyBindingStatus: "stale",
        latestReceiptVerifierStatus: "review"
      }));
      expect(identityEvidence.status).toBe("review");
      expect(identityEvidence.platformRequestPacket.evidence).toContain("requestPacketPolicyBinding=idp:stale|provisioning:missing");
      expect(identityEvidence.submissionVerifier.evidence).toContain("requestPacketPolicyBinding=idp:stale|provisioning:missing");
      expect(identityEvidence.receiptArchiveManifest.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          archiveStatus: "review",
          receiptVerifierStatus: "review",
          requestPacketPolicyBindingStatus: "stale",
          missingArchiveInputs: expect.arrayContaining(["requestPacketPolicyBinding"]),
          nextAction: expect.stringMatching(/request packet policy binding/i)
        })
      ]));
      expect(identityEvidence.receiptArchiveManifest.evidence).toEqual(expect.arrayContaining([
        expect.stringMatching(/^receiptArchive:institution-idp-approval=review;missing=.*requestPacketPolicyBinding/)
      ]));
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("keeps the submitted evidence digest stable when rotation freshness ages", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-stable-submission-digest-"));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Stable Digest Owner",
        email: "identity-stable-digest@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });

      const teamId = registered.context.teams[0].id;
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, teamId);
      const idpAcceptance = enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-stable-digest",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Institution IdP production evidence for stable digest archival."
      });
      const initialReceipt = idpAcceptance.productionEvidenceReceipt;

      vi.setSystemTime(new Date("2026-07-20T00:00:00.000Z"));
      const agedReceipt = enterprise.getEnterpriseIdentityProductionEvidence({ teamId }).acceptanceReceipts
        .find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;

      expect(initialReceipt).toEqual(expect.objectContaining({
        receiptAuditDigestScope: "current-validation-snapshot",
        submittedEvidenceDigestAlgorithm: "sha256",
        submittedEvidenceDigestScope: "platform-submission-inputs",
        submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(agedReceipt).toEqual(expect.objectContaining({
        rotationFreshnessStatus: "ready",
        submittedEvidenceDigest: initialReceipt?.submittedEvidenceDigest
      }));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("publishes the SENA app-origin evidence URL policy without leaking the origin", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-origin-policy-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Evidence URL Policy Reviewer",
        email: "identity-origin-policy@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId: registered.context.teams[0].id
      });
      const evidenceUrlPolicy = identityEvidence.platformRequestPacket.submission.evidenceUrlPolicy as
        typeof identityEvidence.platformRequestPacket.submission.evidenceUrlPolicy & {
          senaAppOriginRequiredForProductionEvidence?: boolean;
          senaAppOriginConfigured?: boolean;
          senaAppOriginHash?: string;
        };

      expect(evidenceUrlPolicy).toEqual(expect.objectContaining({
        requiredProtocol: "https",
        institutionOwnedRequired: true,
        senaAppOriginRequiredForProductionEvidence: true,
        senaAppOriginConfigured: true,
        senaAppOriginHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(identityEvidence.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
        "senaAppOrigin=hash-present"
      ]));
      expect(JSON.stringify(identityEvidence.platformRequestPacket)).not.toContain("https://sena.example.test");
      expect(JSON.stringify(identityEvidence.platformRequestPacket)).not.toContain("sena.example.test");
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("publishes owner-name and verified-at policies in the identity production request packet", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-owner-policy-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Owner Policy Reviewer",
        email: "identity-owner-policy@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({
        teamId: registered.context.teams[0].id
      });
      expect(identityEvidence.platformRequestPacket.requests.map((request) => request.decisionId)).toEqual([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]);
      for (const request of identityEvidence.platformRequestPacket.requests) {
        expect(request.submissionTemplate.ownerNamePolicy).toEqual({
          specificInstitutionOwnerRequired: true,
          genericPlaceholderRejected: true,
          rejectedPlaceholderNames: expect.arrayContaining([
            request.submissionTemplate.ownerNamePlaceholder.toLowerCase()
          ])
        });
        const verifiedAtPolicy = (request.submissionTemplate as typeof request.submissionTemplate & {
          productionEvidenceArtifactDigestField?: string;
          productionEvidenceArtifactDigestPolicy?: {
            required: boolean;
            algorithm: string;
            scope: string;
            requiredForEvidenceIds: string[];
            artifactCustody: string;
            rawArtifactUploadAccepted: boolean;
            secretValuesAccepted: boolean;
            responseHeader: string;
          };
          productionEvidenceVerifiedAtPolicy?: {
            required: boolean;
            requiredForEvidenceIds: string[];
            validPastOrPresentRequired: boolean;
            futureTimestampsRejected: boolean;
            canonicalIsoTimestampRequired: boolean;
          };
          rotationFreshnessPolicy?: {
            maxAgeDays: number;
            warningDays: number;
            rotationEvidenceIds: string[];
            expiredEvidenceBlocksRelease: boolean;
            dueSoonEvidenceWarns: boolean;
          };
        });
        expect(verifiedAtPolicy.productionEvidenceArtifactDigestField).toBe("productionEvidenceArtifactDigest");
        expect(verifiedAtPolicy.productionEvidenceArtifactDigestPolicy).toEqual({
          required: true,
          algorithm: "sha256",
          scope: "external-evidence-artifact",
          requiredForEvidenceIds: request.submissionTemplate.productionEvidenceIds,
          artifactCustody: "institution-owned-evidence-system",
          rawArtifactUploadAccepted: false,
          secretValuesAccepted: false,
          responseHeader: "x-sena-identity-production-evidence-artifact-digest"
        });
        const productionEvidenceVerifiedAtPolicy = verifiedAtPolicy.productionEvidenceVerifiedAtPolicy;
        expect(productionEvidenceVerifiedAtPolicy).toEqual({
          required: true,
          requiredForEvidenceIds: request.submissionTemplate.productionEvidenceVerifiedAtRequiredForEvidenceIds,
          validPastOrPresentRequired: true,
          futureTimestampsRejected: true,
          canonicalIsoTimestampRequired: true
        });
        const rotationFreshnessPolicy = (request.submissionTemplate as typeof request.submissionTemplate & {
          rotationFreshnessPolicy?: {
            maxAgeDays: number;
            warningDays: number;
            rotationEvidenceIds: string[];
            expiredEvidenceBlocksRelease: boolean;
            dueSoonEvidenceWarns: boolean;
          };
        }).rotationFreshnessPolicy;
        expect(rotationFreshnessPolicy).toEqual({
          maxAgeDays: 180,
          warningDays: 30,
          rotationEvidenceIds: request.decisionId === "institution-idp-approval"
            ? ["sso-secret-rotation"]
            : ["bearer-token-rotation"],
          expiredEvidenceBlocksRelease: true,
          dueSoonEvidenceWarns: true
        });
      }
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("publishes redacted platform-owner submission drafts in the identity production request packet", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-submission-draft-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Submission Draft Reviewer",
        email: "identity-submission-draft@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({ teamId });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, teamId);
      const idpRequest = identityEvidence.platformRequestPacket.requests
        .find((request) => request.decisionId === "institution-idp-approval");
      const provisioningRequest = identityEvidence.platformRequestPacket.requests
        .find((request) => request.decisionId === "institution-provisioning-owner");

      expect(idpRequest?.submissionTemplate.submissionDraft).toEqual({
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "<specific-institution-owner-name>",
        ownerRole: idpRequest?.submissionTemplate.ownerRolePlaceholder,
        environment: idpRequest?.submissionTemplate.environmentPlaceholder,
        evidenceUrl: idpRequest?.submissionTemplate.evidenceUrlPlaceholder,
        productionEvidenceIds: idpRequest?.submissionTemplate.productionEvidenceIds,
        productionEvidenceArtifactDigest: "<sha256-hex-artifact-digest>",
        productionEvidenceVerifiedAt: "<canonical-iso-timestamp>",
        requestPacketPolicyHash,
        notes: idpRequest?.submissionTemplate.notesTemplate
      });
      expect(provisioningRequest?.submissionTemplate.submissionDraft).toEqual({
        teamId,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "<specific-institution-owner-name>",
        ownerRole: provisioningRequest?.submissionTemplate.ownerRolePlaceholder,
        environment: provisioningRequest?.submissionTemplate.environmentPlaceholder,
        evidenceUrl: provisioningRequest?.submissionTemplate.evidenceUrlPlaceholder,
        productionEvidenceIds: provisioningRequest?.submissionTemplate.productionEvidenceIds,
        productionEvidenceArtifactDigest: "<sha256-hex-artifact-digest>",
        productionEvidenceVerifiedAt: "<canonical-iso-timestamp>",
        requestPacketPolicyHash,
        notes: provisioningRequest?.submissionTemplate.notesTemplate
      });
      expect(identityEvidence.platformRequestPacket.evidence).toContain("submissionDrafts=redacted-platform-owner-json");
      expect(JSON.stringify(identityEvidence.platformRequestPacket)).not.toContain(productionLikeInstitutionSsoSecret);
      expect(JSON.stringify(identityEvidence.platformRequestPacket)).not.toContain(productionLikeProvisioningToken);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("blocks production deployment readiness without the identity evidence host allowlist", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-allowlist-readiness-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const allowlistReadiness = readiness.blocking.find((item) => item.id === "identity-evidence-host-allowlist");

      expect(allowlistReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "review"
      }));
      expect(allowlistReadiness?.evidence).toEqual(expect.arrayContaining([
        "nodeEnv=production",
        "requiredInProduction=true",
        "allowlist=not-configured"
      ]));
      expect(readiness.summary.blockers).toContain("identity-evidence-host-allowlist");

      process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
      const configuredReadiness = enterprise.getEnterpriseDeploymentReadiness();
      const configuredAllowlistReadiness = configuredReadiness.blocking.find((item) => item.id === "identity-evidence-host-allowlist");

      expect(configuredAllowlistReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "pass"
      }));
      expect(configuredAllowlistReadiness?.evidence).toEqual(expect.arrayContaining([
        "nodeEnv=production",
        "requiredInProduction=true",
        "allowlist=configured",
        "allowedHosts=1"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("blocks production deployment readiness without identity secret rotation version bindings", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-secret-version-readiness-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const secretVersionReadiness = readiness.blocking.find((item) => item.id === "identity-secret-version-binding");

      expect(secretVersionReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "review"
      }));
      expect(secretVersionReadiness?.evidence).toEqual(expect.arrayContaining([
        "nodeEnv=production",
        "requiredInProduction=true",
        "ssoClientSecretVersion=missing",
        "provisioningTokenVersion=missing"
      ]));
      expect(readiness.summary.blockers).toContain("identity-secret-version-binding");

      process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
      process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
      const configuredReadiness = enterprise.getEnterpriseDeploymentReadiness();
      const configuredSecretVersionReadiness = configuredReadiness.blocking.find((item) => item.id === "identity-secret-version-binding");

      expect(configuredSecretVersionReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "pass"
      }));
      expect(configuredSecretVersionReadiness?.evidence).toEqual(expect.arrayContaining([
        "nodeEnv=production",
        "requiredInProduction=true",
        "ssoClientSecretVersion=configured",
        "provisioningTokenVersion=configured"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("blocks production deployment readiness without an identity lifecycle owner mode", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-lifecycle-mode-readiness-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const lifecycleOwnerReadiness = readiness.blocking.find((item) => item.id === "identity-lifecycle-owner-mode");

      expect(lifecycleOwnerReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "review"
      }));
      expect(lifecycleOwnerReadiness?.evidence).toEqual(expect.arrayContaining([
        "nodeEnv=production",
        "requiredInProduction=true",
        "mode=missing",
        "valid=false"
      ]));
      expect(readiness.summary.blockers).toContain("identity-lifecycle-owner-mode");

      process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
      const configuredReadiness = enterprise.getEnterpriseDeploymentReadiness();
      const configuredLifecycleOwnerReadiness = configuredReadiness.blocking.find((item) => item.id === "identity-lifecycle-owner-mode");

      expect(configuredLifecycleOwnerReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "pass"
      }));
      expect(configuredLifecycleOwnerReadiness?.evidence).toEqual(expect.arrayContaining([
        "nodeEnv=production",
        "requiredInProduction=true",
        "mode=scim",
        "valid=true"
      ]));
    } finally {
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("surfaces the production identity evidence host allowlist in the deployment handoff", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-allowlist-handoff-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const allowlistEnv = deployment.env.find((entry) => entry.name === "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS");

      expect(allowlistEnv).toEqual(expect.objectContaining({
        category: "identity",
        required: true,
        configured: false,
        secret: false,
        status: "review",
        purpose: expect.stringMatching(/institution.*evidence-host/i)
      }));
      expect(deployment.summary.missingRequiredEnv).toEqual(expect.arrayContaining([
        "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS"
      ]));
      expect(deployment.summary).toEqual(expect.objectContaining({
        identityEvidenceUrlHostBinding: "review",
        identityEvidenceAllowedHostConfig: "not-configured",
        identityEvidenceAllowedHosts: 0,
        identityEvidenceInvalidAllowedHosts: 0
      }));
      const evidenceUrlPolicy = deployment.identityProductionHandoff.platformRequestPacket.submission.evidenceUrlPolicy as typeof deployment.identityProductionHandoff.platformRequestPacket.submission.evidenceUrlPolicy & {
        allowedHostConfigRequiredInProduction?: boolean;
      };
      expect(evidenceUrlPolicy.allowedHostConfigRequiredInProduction).toBe(true);

      process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
      const configuredDeployment = enterprise.getEnterpriseOrganizationDeploymentPackage();
      const configuredAllowlistEnv = configuredDeployment.env.find((entry) => entry.name === "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS");

      expect(configuredAllowlistEnv).toEqual(expect.objectContaining({
        category: "identity",
        required: true,
        configured: true,
        secret: false,
        status: "pass"
      }));
      expect(configuredDeployment.summary.missingRequiredEnv).not.toContain("SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS");
      expect(configuredDeployment.summary).toEqual(expect.objectContaining({
        identityEvidenceUrlHostBinding: "review",
        identityEvidenceAllowedHostConfig: "configured",
        identityEvidenceAllowedHosts: 1,
        identityEvidenceInvalidAllowedHosts: 0
      }));
    } finally {
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires non-secret secret rotation versions before production identity evidence is ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-production-secret-version-required-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Production Secret Version Owner",
        email: "identity-production-secret-version@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-missing-secret-version",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "IdP evidence is attached, but no non-secret SSO client-secret version binding is configured."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/provisioning-missing-secret-version",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "SCIM ownership evidence is attached, but no non-secret provisioning token version binding is configured."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence() as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            technicalBindingEvidence?: string[];
          };
        }>;
        platformRequestPacket: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["platformRequestPacket"] & {
          requests: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["platformRequestPacket"]["requests"][number] & {
            latestReceiptVerifierStatus?: string;
            latestReceiptTechnicalBindingStatus?: string;
            latestReceiptTechnicalReadinessStatus?: string;
          }>;
        };
      };

      expect(identityEvidence.status).toBe("review");
      expect(identityEvidence.releaseGate.approvalBlocked).toBe(true);
      expect(identityEvidence.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      const idpReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      const provisioningReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner")?.productionEvidenceReceipt;
      expect(idpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "ready",
        missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
      }));
      expect(provisioningReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "ready",
        missingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"])
      }));
      expect(idpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedClientSecretVersionHash=missing",
        "currentClientSecretVersionHash=missing"
      ]));
      expect(provisioningReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedProvisioningTokenVersionHash=missing",
        "currentProvisioningTokenVersionHash=missing"
      ]));
      expect(identityEvidence.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          latestReceiptVerifierStatus: "review",
          latestReceiptTechnicalBindingStatus: "stale",
          latestReceiptTechnicalReadinessStatus: "ready"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          latestReceiptVerifierStatus: "review",
          latestReceiptTechnicalBindingStatus: "stale",
          latestReceiptTechnicalReadinessStatus: "ready"
        })
      ]));
      expect(identityEvidence.receiptArchiveManifest.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          archiveStatus: "review",
          technicalBindingStatus: "stale",
          technicalReadinessStatus: "ready",
          missingArchiveInputs: ["technicalEvidenceBinding"],
          nextAction: expect.stringMatching(/technical binding/i)
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          archiveStatus: "review",
          technicalBindingStatus: "stale",
          technicalReadinessStatus: "ready",
          missingArchiveInputs: ["technicalEvidenceBinding"],
          nextAction: expect.stringMatching(/technical binding/i)
        })
      ]));
      expect(identityEvidence.receiptArchiveManifest.evidence).toEqual(expect.arrayContaining([
        "receiptArchive:institution-idp-approval=review;missing=technicalEvidenceBinding",
        "receiptArchive:institution-provisioning-owner=review;missing=technicalEvidenceBinding"
      ]));
      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities
        .find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.nextAction).toContain("SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION");
      expect(authCapability?.nextAction).toContain("SENA_PROVISIONING_TOKEN_VERSION");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires a non-secret IdP tenant binding before production IdP evidence is ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-production-tenant-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Tenant Binding Owner",
        email: "identity-tenant-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-tenant-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "IdP tenant, callback, and SSO secret rotation evidence is attached, but the runtime has no tenant identifier binding."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/provisioning-tenant-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "SCIM ownership evidence is attached for the current provisioning token and lifecycle owner mode."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence() as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            technicalBindingEvidence?: string[];
          };
        }>;
      };

      expect(identityEvidence.status).toBe("review");
      expect(identityEvidence.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(identityEvidence.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-binding"
      ]));
      expect(identityEvidence.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      const idpReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      expect(idpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review"
      }));
      expect(idpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedTenantBinding=missing",
        "currentTenantBinding=missing"
      ]));

      process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";

      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const tenantReadiness = readiness.blocking.find((item) => item.id === "identity-idp-tenant-binding");
      expect(tenantReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "pass"
      }));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires an institution identity secret rotation cadence before production rotation evidence is ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-rotation-cadence-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Rotation Cadence Owner",
        email: "identity-rotation-cadence@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-rotation-cadence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "IdP tenant, callback, and SSO secret rotation evidence is attached, but no institution rotation cadence binding is configured."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/provisioning-rotation-cadence",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "SCIM ownership and bearer-token rotation evidence is attached, but no institution rotation cadence binding is configured."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence() as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            technicalBindingEvidence?: string[];
          };
        }>;
      };

      expect(identityEvidence.status).toBe("review");
      expect(identityEvidence.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(identityEvidence.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "identity-secret-rotation-cadence"
      ]));
      expect(identityEvidence.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      const idpReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      const provisioningReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner")?.productionEvidenceReceipt;
      expect(idpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review"
      }));
      expect(provisioningReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review"
      }));
      expect(idpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedRotationCadence=missing",
        "currentRotationCadence=missing"
      ]));
      expect(provisioningReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedRotationCadence=missing",
        "currentRotationCadence=missing"
      ]));
      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities
        .find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.nextAction).toContain("SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS");

      process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "90";
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const rotationCadenceReadiness = readiness.blocking.find((item) => item.id === "identity-secret-rotation-cadence");
      expect(rotationCadenceReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "pass"
      }));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires institution secret-store references before production identity secrets are ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-secret-store-ref-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Secret Store Owner",
        email: "identity-secret-store@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-secret-store",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "IdP tenant, callback, and SSO secret rotation evidence is attached, but no institution secret-store reference is configured."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/provisioning-secret-store",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "SCIM ownership and bearer-token rotation evidence is attached, but no institution secret-store reference is configured."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence() as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            technicalBindingEvidence?: string[];
          };
        }>;
      };

      expect(identityEvidence.status).toBe("review");
      expect(identityEvidence.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(identityEvidence.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "sso-secret-store-reference",
        "provisioning-secret-store-reference"
      ]));
      expect(identityEvidence.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      const idpReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      const provisioningReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner")?.productionEvidenceReceipt;
      expect(idpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review"
      }));
      expect(provisioningReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review"
      }));
      expect(idpReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedSecretStoreReference=missing",
        "currentSecretStoreReference=missing"
      ]));
      expect(provisioningReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedSecretStoreReference=missing",
        "currentSecretStoreReference=missing"
      ]));
      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities
        .find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.nextAction).toContain("SENA_SSO_INSTITUTION_CLIENT_SECRET_REF");
      expect(authCapability?.nextAction).toContain("SENA_PROVISIONING_TOKEN_SECRET_REF");

      process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
      process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const secretStoreReadiness = readiness.blocking.find((item) => item.id === "identity-secret-store-reference");
      expect(secretStoreReadiness).toEqual(expect.objectContaining({
        severity: "blocking",
        status: "pass"
      }));
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires an identity lifecycle owner mode before production provisioning evidence is ready", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-lifecycle-owner-mode-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Lifecycle Owner Mode Reviewer",
        email: "identity-lifecycle-owner-mode@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-lifecycle-mode",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP production evidence from the institution allowlisted evidence host."
      });
      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/provisioning-lifecycle-mode",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "SCIM ownership evidence is attached, but the runtime does not declare whether SCIM or IdP owns lifecycle writes."
      });

      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence() as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        evidenceManifest: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["evidenceManifest"] & {
          missingEvidenceIds: string[];
          presentEvidenceIds: string[];
        };
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            technicalBindingEvidence?: string[];
          };
        }>;
      };

      expect(identityEvidence.status).toBe("review");
      expect(identityEvidence.summary.technicalBlocking).toBeGreaterThanOrEqual(1);
      expect(identityEvidence.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "identity-lifecycle-owner-mode",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(identityEvidence.evidenceManifest.missingEvidenceIds).not.toContain("sso-secret-rotation");
      expect(identityEvidence.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-provisioning-owner"
      ]));
      const provisioningReceipt = identityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner")?.productionEvidenceReceipt;
      expect(provisioningReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        technicalBindingStatus: "stale",
        technicalReadinessStatus: "review"
      }));
      expect(provisioningReceipt?.technicalBindingEvidence).toEqual(expect.arrayContaining([
        "acceptedLifecycleOwnerMode=missing",
        "currentLifecycleOwnerMode=missing"
      ]));
      const authCapability = enterprise.getEnterpriseCapabilityAudit().capabilities
        .find((capability) => capability.id === "auth-login-register-sso");
      expect(authCapability?.nextAction).toContain("SENA_IDENTITY_LIFECYCLE_OWNER_MODE");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires renewed identity production evidence when the accepted evidence host leaves the allowlist", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-identity-evidence-host-binding-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
    process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
    process.env.SENA_PROVISIONING_TOKEN = productionLikeProvisioningToken;
    process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
    process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-02";
    process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
    process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
    process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
    process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
    process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = productionLikeInstitutionSsoSecret;
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
    process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-02";
    process.env.SENA_SSO_INSTITUTION_SCOPES = "openid email profile";
    process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
    process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
    process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
    process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
    process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
    vi.stubEnv("NODE_ENV", "production");

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Evidence Host Binding Owner",
        email: "identity-evidence-host-binding@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      await enterprise.preflightEnterpriseSsoProviders({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      const idpAcceptance = enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-host-binding",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh IdP production evidence from the institution allowlisted evidence host."
      }) as ReturnType<typeof enterprise.reviewEnterprisePlatformDecision> & {
        evidenceUrlHostHash?: string;
      };
      const provisioningAcceptance = enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Identity lifecycle",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/provisioning-host-binding",
        productionEvidenceIds: ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-02-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Fresh SCIM ownership and rotation evidence from the institution allowlisted evidence host."
      }) as ReturnType<typeof enterprise.reviewEnterprisePlatformDecision> & {
        evidenceUrlHostHash?: string;
      };

      expect(idpAcceptance.evidenceUrlHostHash).toMatch(/^[a-f0-9]{64}$/);
      expect(provisioningAcceptance.evidenceUrlHostHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(idpAcceptance)).not.toContain("identity-evidence.institution.edu");
      expect(JSON.stringify(provisioningAcceptance)).not.toContain("identity-evidence.institution.edu");

      const freshIdentityEvidence = enterprise.getEnterpriseIdentityProductionEvidence() as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        platformRequestPacket: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["platformRequestPacket"] & {
          requests: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["platformRequestPacket"]["requests"][number] & {
            latestReceiptEvidenceUrlHostBindingStatus?: string;
          }>;
        };
      };
      expect(freshIdentityEvidence.status).toBe("ready");
      expect(freshIdentityEvidence.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          latestReceiptEvidenceUrlHostBindingStatus: "current"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          latestReceiptEvidenceUrlHostBindingStatus: "current"
        })
      ]));

      process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence-alt.institution.edu";
      const driftedIdentityEvidence = enterprise.getEnterpriseIdentityProductionEvidence() as ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence> & {
        acceptanceReceipts: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number] & {
          productionEvidenceReceipt?: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["acceptanceReceipts"][number]["productionEvidenceReceipt"] & {
            evidenceUrlHostHash?: string;
            evidenceUrlHostBindingStatus?: string;
            evidenceUrlHostBindingEvidence?: string[];
          };
        }>;
        platformRequestPacket: ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["platformRequestPacket"] & {
          requests: Array<ReturnType<typeof enterprise.getEnterpriseIdentityProductionEvidence>["platformRequestPacket"]["requests"][number] & {
            latestReceiptEvidenceUrlHostBindingStatus?: string;
          }>;
        };
      };

      expect(driftedIdentityEvidence.status).toBe("review");
      expect(driftedIdentityEvidence.releaseGate.approvalBlocked).toBe(true);
      expect(driftedIdentityEvidence.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(driftedIdentityEvidence.platformRequestPacket.summary.receiptReviewRequests).toBeGreaterThanOrEqual(2);
      expect(driftedIdentityEvidence.platformRequestPacket.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          latestReceiptVerifierStatus: "review",
          latestReceiptEvidenceUrlHostBindingStatus: "stale"
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          latestReceiptVerifierStatus: "review",
          latestReceiptEvidenceUrlHostBindingStatus: "stale"
        })
      ]));
      const driftedIdpReceipt = driftedIdentityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-idp-approval")?.productionEvidenceReceipt;
      const driftedProvisioningReceipt = driftedIdentityEvidence.acceptanceReceipts.find((receipt) => receipt.decisionId === "institution-provisioning-owner")?.productionEvidenceReceipt;
      expect(driftedIdpReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        evidenceUrlHostHash: idpAcceptance.evidenceUrlHostHash,
        evidenceUrlHostBindingStatus: "stale",
        missingEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"])
      }));
      expect(driftedProvisioningReceipt).toEqual(expect.objectContaining({
        verifierStatus: "review",
        evidenceUrlHostHash: provisioningAcceptance.evidenceUrlHostHash,
        evidenceUrlHostBindingStatus: "stale",
        missingEvidenceIds: expect.arrayContaining(["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"])
      }));
      expect(driftedIdpReceipt?.evidenceUrlHostBindingEvidence).toEqual(expect.arrayContaining([
        "evidenceUrlHostBinding=stale",
        "acceptedEvidenceUrlHostHash=present",
        "allowedHostHashes=1"
      ]));
      expect(driftedIdentityEvidence.receiptArchiveManifest.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          decisionId: "institution-idp-approval",
          archiveStatus: "review",
          evidenceUrlHostBindingStatus: "stale",
          missingArchiveInputs: expect.arrayContaining(["evidenceUrlHostBinding"])
        }),
        expect.objectContaining({
          decisionId: "institution-provisioning-owner",
          archiveStatus: "review",
          evidenceUrlHostBindingStatus: "stale",
          missingArchiveInputs: expect.arrayContaining(["evidenceUrlHostBinding"])
        })
      ]));
      expect(driftedIdentityEvidence.receiptArchiveManifest.evidence).toEqual(expect.arrayContaining([
        expect.stringMatching(/^receiptArchive:institution-idp-approval=review;missing=.*evidenceUrlHostBinding/),
        expect.stringMatching(/^receiptArchive:institution-provisioning-owner=review;missing=.*evidenceUrlHostBinding/)
      ]));
      const driftedAuthCapability = enterprise.getEnterpriseCapabilityAudit().capabilities
        .find((capability) => capability.id === "auth-login-register-sso");
      expect(driftedAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "identityEvidenceUrlHostBinding=review",
        "identityEvidenceAllowedHostConfig=configured",
        "identityEvidenceAllowedHosts=1",
        "identityEvidenceInvalidAllowedHosts=0"
      ]));
      expect(driftedAuthCapability?.nextAction).toContain("Renew institution identity evidence URLs");
      const driftedReleaseGate = enterprise.createEnterpriseReleaseGateReview(registered.context, {
        teamId: registered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.02.01-evidence-host-drift",
        decision: "conditional",
        approverName: "Institution release owner",
        approverRole: "Identity platform",
        notes: "Conditional release review after the institution evidence-host allowlist changed.",
        verificationCommand: "npm run sena:pilot:verify",
        verificationEvidence: {
          status: "passed",
          summary: "Verification command passed, but identity evidence-host bindings require renewed institution evidence.",
          outputSha256: "e".repeat(64)
        }
      }) as ReturnType<typeof enterprise.createEnterpriseReleaseGateReview> & {
        identityProductionSnapshot: ReturnType<typeof enterprise.createEnterpriseReleaseGateReview>["identityProductionSnapshot"] & {
          evidenceUrlHostBinding?: {
            status: string;
            staleDecisionIds: string[];
            missingDecisionIds: string[];
          };
        };
      };
      expect(driftedReleaseGate.identityProductionSnapshot.evidenceUrlHostBinding).toEqual(expect.objectContaining({
        status: "review",
        staleDecisionIds: expect.arrayContaining([
          "institution-idp-approval",
          "institution-provisioning-owner"
        ]),
        missingDecisionIds: []
      }));

      const driftedGoLive = enterprise.getEnterpriseGoLiveRehearsal({
        teamId: registered.context.teams[0].id
      }) as ReturnType<typeof enterprise.getEnterpriseGoLiveRehearsal> & {
        identityProductionHandoff: ReturnType<typeof enterprise.getEnterpriseGoLiveRehearsal>["identityProductionHandoff"] & {
          evidenceUrlHostBinding?: {
            status: string;
            staleDecisionIds: string[];
          };
        };
      };
      expect(driftedGoLive.identityProductionHandoff.evidenceUrlHostBinding).toEqual(expect.objectContaining({
        status: "review",
        staleDecisionIds: expect.arrayContaining([
          "institution-idp-approval",
          "institution-provisioning-owner"
        ])
      }));

      const driftedGoLiveAttestation = enterprise.createEnterpriseGoLiveAttestation(registered.context, {
        teamId: registered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.02.01-evidence-host-drift-attestation",
        decision: "conditional",
        attesterName: "Institution platform owner",
        attesterRole: "Platform operations",
        notes: "Attesting that go-live is conditional while evidence-host bindings are renewed.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: true,
          platformOwnerDecisionReviewed: true
        }
      }) as ReturnType<typeof enterprise.createEnterpriseGoLiveAttestation> & {
        identityProductionHandoffSnapshot: ReturnType<typeof enterprise.createEnterpriseGoLiveAttestation>["identityProductionHandoffSnapshot"] & {
          evidenceUrlHostBinding?: {
            status: string;
            staleDecisionIds: string[];
          };
        };
      };
      expect(driftedGoLiveAttestation.identityProductionHandoffSnapshot.evidenceUrlHostBinding).toEqual(expect.objectContaining({
        status: "review",
        staleDecisionIds: expect.arrayContaining([
          "institution-idp-approval",
          "institution-provisioning-owner"
        ])
      }));
      expect(driftedGoLiveAttestation.evidence).toEqual(expect.arrayContaining([
        "identityProductionHandoffSnapshotHostBinding=review"
      ]));
      expect(JSON.stringify(driftedIdentityEvidence)).not.toContain("identity-evidence.institution.edu");
      expect(JSON.stringify(driftedIdentityEvidence)).not.toContain("identity-evidence-alt.institution.edu");
    } finally {
      vi.useRealTimers();
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires the SENA application origin before accepting identity production evidence URLs", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-identity-app-origin-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    delete process.env.NEXT_PUBLIC_SENA_APP_URL;
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution Origin Evidence Owner",
        email: "identity-origin-owner@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-origin-required",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution IdP evidence before the SENA app origin is configured."
      })).toThrow(/SENA application origin/i);

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId,
        decisionId: "institution-provisioning-owner",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution SCIM Owner",
        ownerRole: "Institution identity lifecycle owner",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/provisioning-origin-required",
        productionEvidenceIds: ["provisioning-owner"],
        productionEvidenceArtifactDigest: productionLikeProvisioningEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Attempts to attach institution provisioning evidence before the SENA app origin is configured."
      })).toThrow(/SENA application origin/i);
    } finally {
      clearInstitutionAuthEnv();
      delete process.env.NEXT_PUBLIC_SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);

  it("requires HTTPS URLs for institution identity production evidence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-capability-audit-identity-https-"));
    vi.resetModules();
    clearInstitutionAuthEnv();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Institution HTTPS Evidence Owner",
        email: "identity-https-owner@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "http://ops.institution.edu/sena/idp-insecure-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "Attempts to attach insecure HTTP IdP production evidence."
      })).toThrow(/Identity production evidence URL must use HTTPS/);

      for (const evidenceUrl of [
        "https://localhost/sena/idp-localhost-evidence",
        "https://127.0.0.1/sena/idp-loopback-evidence"
      ]) {
        expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
          teamId: registered.context.teams[0].id,
          decisionId: "institution-idp-approval",
          status: "accepted",
          acceptedBridge: true,
          ownerName: "Institution IdP Owner",
          ownerRole: "Identity platform",
          environment: "pilot-production",
          evidenceUrl,
          productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          notes: "Attempts to attach local IdP production evidence."
        })).toThrow(/Identity production evidence URL must reference an institution-owned HTTPS evidence system/);
      }

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://sena.example.test/sena/self-hosted-idp-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "Attempts to attach SENA application origin as IdP production evidence."
      })).toThrow(/Identity production evidence URL must be separate from the SENA application origin/);

      for (const evidenceUrl of [
        "https://ops.example.test/sena/idp-reserved-test-domain",
        "https://evidence.example.com/sena/idp-reserved-example-domain"
      ]) {
        expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
          teamId: registered.context.teams[0].id,
          decisionId: "institution-idp-approval",
          status: "accepted",
          acceptedBridge: true,
          ownerName: "Institution IdP Owner",
          ownerRole: "Identity platform",
          environment: "pilot-production",
          evidenceUrl,
          productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          notes: "Attempts to attach reserved-domain IdP production evidence."
        })).toThrow(/Identity production evidence URL must reference an institution-owned HTTPS evidence system/);
      }

      for (const evidenceUrl of [
        "https://auditor:secret@ops.institution.edu/sena/idp-credentialed-evidence",
        "https://ops.institution.edu/sena/idp-fragment-evidence#access-token"
      ]) {
        expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
          teamId: registered.context.teams[0].id,
          decisionId: "institution-idp-approval",
          status: "accepted",
          acceptedBridge: true,
          ownerName: "Institution IdP Owner",
          ownerRole: "Identity platform",
          environment: "pilot-production",
          evidenceUrl,
          productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
          notes: "Attempts to attach IdP production evidence with a URL that can carry access secrets."
        })).toThrow(/must not include embedded credentials or URL fragments/i);
      }

      for (const evidenceUrl of [
        "https://ops.institution.edu/sena/idp-token-query-evidence?access_token=temporary-token",
        "https://ops.institution.edu/sena/idp-secret-query-evidence?client_secret=temporary-secret",
        "https://ops.institution.edu/sena/idp-signature-query-evidence?signature=temporary-signature"
      ]) {
        expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
          teamId: registered.context.teams[0].id,
          decisionId: "institution-idp-approval",
          status: "accepted",
          acceptedBridge: true,
          ownerName: "Institution IdP Owner",
          ownerRole: "Identity platform",
          environment: "pilot-production",
          evidenceUrl,
          productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
          notes: "Attempts to attach IdP production evidence with secret-like URL query parameters."
        })).toThrow(/must not include sensitive query parameters/i);
      }

      for (const evidenceUrl of [
        "https://ops.institution.edu",
        "https://ops.institution.edu/"
      ]) {
        expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
          teamId: registered.context.teams[0].id,
          decisionId: "institution-idp-approval",
          status: "accepted",
          acceptedBridge: true,
          ownerName: "Institution IdP Owner",
          ownerRole: "Identity platform",
          environment: "pilot-production",
          evidenceUrl,
          productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
          productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
          notes: "Attempts to attach IdP production evidence without a concrete evidence artifact path."
        })).toThrow(/specific evidence path/i);
      }

      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "local-dev",
        evidenceUrl: "https://ops.institution.edu/sena/idp-local-dev-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        notes: "Attempts to attach local-development IdP evidence as production evidence."
      })).toThrow(/Identity production evidence environment must name a production or pilot-production environment/);

      vi.stubEnv("NODE_ENV", "production");
      delete process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS;
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-missing-allowlist-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Attempts to attach IdP evidence in production without the institution evidence-host allowlist."
      })).toThrow(/Identity production evidence host allowlist must be configured in production/);

      process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "https://";
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-invalid-allowlist-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Attempts to attach IdP evidence while the institution evidence-host allowlist is malformed."
      })).toThrow(/Identity production evidence host allowlist must include at least one valid hostname/);

      process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu,localhost";
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-local-allowlist-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Attempts to attach IdP evidence while the institution evidence-host allowlist includes a local host."
      })).toThrow(/Identity production evidence host allowlist must include at least one valid hostname/);

      process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "identity-evidence.institution.edu";
      const requestPacketPolicyHash = currentIdentityRequestPacketPolicyHash(enterprise, registered.context.teams[0].id);
      expect(() => enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://ops.vendor.edu/sena/idp-vendor-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        notes: "Attempts to attach IdP evidence outside the institution evidence-host allowlist."
      })).toThrow(/Identity production evidence URL host must match the configured institution evidence-host allowlist/);

      enterprise.reviewEnterprisePlatformDecision(registered.context, {
        teamId: registered.context.teams[0].id,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Institution IdP Owner",
        ownerRole: "Identity platform",
        environment: "pilot-production",
        evidenceUrl: "https://identity-evidence.institution.edu/sena/idp-allowlisted-evidence",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: productionLikeIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: "2026-01-01T00:00:00.000Z",
        requestPacketPolicyHash,
        notes: "Attach IdP evidence from the institution evidence-host allowlist."
      });
      const identityEvidence = (enterprise as typeof enterprise & {
        getEnterpriseIdentityProductionEvidence?: () => {
          platformRequestPacket: {
            submission: {
              evidenceUrlPolicy?: {
                allowedHostConfigRequiredInProduction?: boolean;
                allowedHostCount?: number;
                allowedHostHashes?: string[];
              };
            };
            evidence: string[];
          };
        };
      }).getEnterpriseIdentityProductionEvidence?.();
      expect(identityEvidence?.platformRequestPacket.submission.evidenceUrlPolicy).toEqual(expect.objectContaining({
        allowedHostConfigRequiredInProduction: true,
        allowedHostCount: 1,
        allowedHostHashes: [expect.stringMatching(/^[a-f0-9]{64}$/)]
      }));
      expect(identityEvidence?.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
        "evidenceUrlAllowedHosts=1"
      ]));
      expect(JSON.stringify(identityEvidence?.platformRequestPacket)).not.toContain("identity-evidence.institution.edu");
    } finally {
      clearInstitutionAuthEnv();
      vi.unstubAllEnvs();
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, enterpriseCapabilityAuditTestTimeoutMs);
});
