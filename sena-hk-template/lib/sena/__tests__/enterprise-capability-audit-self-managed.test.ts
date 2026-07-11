import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { clearInstitutionAuthEnv } from "./enterprise-capability-audit-fixtures";

describe("SENA enterprise capability audit self-managed evidence", () => {
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
});
