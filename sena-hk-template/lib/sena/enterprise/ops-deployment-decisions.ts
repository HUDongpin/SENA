import type { SenaEnterprisePostgresConfig } from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { passwordResetTokenExposure } from "./auth-config";
import {
  alertingChannel,
  alertingOwner
} from "./ops-alerts";
import { auditRetentionWindowDays } from "./ops-audit";
import type { SenaEnterpriseGovernanceCheck } from "./ops-governance";
import {
  enterprisePostgresPublicEvidence,
  enterprisePostgresStorageEngine
} from "./ops-status";
import type { SenaEnterprisePrimaryStateRuntime } from "./state";
import type { SenaEnterpriseObjectStorageNativeProvider } from "./object-storage-adapter";

export type SenaEnterpriseOrganizationDeploymentDecision = {
  id: string;
  label: string;
  status: "ready" | "bridge-ready" | "open";
  evidence: string[];
  nextAction: string;
};

type SenaEnterpriseOrganizationDeploymentDecisionProvider = {
  configured: boolean;
  endpointHash?: string;
  secretConfigured: boolean;
};

export function buildEnterpriseOrganizationDeploymentDecisions(input: {
  selfManagedEnterprise: boolean;
  postgresConfig: SenaEnterprisePostgresConfig;
  primaryStateRuntime: SenaEnterprisePrimaryStateRuntime;
  databaseSyncProvider: SenaEnterpriseOrganizationDeploymentDecisionProvider;
  objectStorageProvider: SenaEnterpriseOrganizationDeploymentDecisionProvider;
  objectStorageNativeProvider: SenaEnterpriseObjectStorageNativeProvider;
  collaborationProvider: SenaEnterpriseOrganizationDeploymentDecisionProvider;
  backupProvider: SenaEnterpriseOrganizationDeploymentDecisionProvider;
  alertProvider: SenaEnterpriseOrganizationDeploymentDecisionProvider;
  auditProvider: SenaEnterpriseOrganizationDeploymentDecisionProvider;
  emailProvider: SenaEnterpriseOrganizationDeploymentDecisionProvider;
  oidcGovernance?: SenaEnterpriseGovernanceCheck;
  provisioningGovernance?: SenaEnterpriseGovernanceCheck;
  fullSaasBackendApproved: boolean;
  fullSaasDecisionAccepted: boolean | undefined;
}): SenaEnterpriseOrganizationDeploymentDecision[] {
  const alertingReady = Boolean(alertingOwner()) && input.alertProvider.configured && input.alertProvider.secretConfigured;
  const postgresPrimaryReady = input.postgresConfig.configured && input.primaryStateRuntime.activePrimary === "postgres";
  const managedDatabaseReady = postgresPrimaryReady ||
    (input.databaseSyncProvider.configured && input.databaseSyncProvider.secretConfigured);
  const managedObjectStorageReady = input.objectStorageNativeProvider.configured ||
    (input.objectStorageProvider.configured && input.objectStorageProvider.secretConfigured);
  const fullSaasBackendReady = input.fullSaasBackendApproved &&
    Boolean(input.fullSaasDecisionAccepted) &&
    managedDatabaseReady &&
    managedObjectStorageReady &&
    input.collaborationProvider.configured &&
    input.collaborationProvider.secretConfigured &&
    input.backupProvider.configured &&
    input.backupProvider.secretConfigured &&
    alertingReady &&
    input.auditProvider.configured &&
    input.auditProvider.secretConfigured &&
    input.emailProvider.configured &&
    input.emailProvider.secretConfigured &&
    input.oidcGovernance?.status === "pass" &&
    input.provisioningGovernance?.status === "pass";

  return [
    {
      id: "native-managed-database",
      label: "Native managed database adapter ownership",
      status: postgresPrimaryReady
        ? "ready"
        : input.databaseSyncProvider.configured && input.databaseSyncProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: input.postgresConfig.configured
        ? [
          `current=${postgresPrimaryReady ? enterprisePostgresStorageEngine(input.postgresConfig) : "file-backed-json"}`,
          `stateStore=${input.primaryStateRuntime.mode}`,
          `activePrimary=${input.primaryStateRuntime.activePrimary}`,
          `postgresPrimaryRequested=${input.primaryStateRuntime.postgresPrimaryRequested}`,
          "native=sena-enterprise-postgres-adapter/v1",
          ...enterprisePostgresPublicEvidence(input.postgresConfig)
        ]
        : [
          "current=file-backed-json",
          "bridge=sena-enterprise-database-sync-webhook/v1",
          `endpointHash=${input.databaseSyncProvider.endpointHash ?? "none"}`
        ],
      nextAction: postgresPrimaryReady
        ? "Run and attach live Neon/Postgres adapter verification before multi-instance SaaS cutover."
        : input.postgresConfig.configured
          ? "Set SENA_ENTERPRISE_STATE_STORE=postgres so the configured adapter becomes the active primary enterprise state store."
          : input.databaseSyncProvider.configured && input.databaseSyncProvider.secretConfigured
            ? "Platform owner must decide whether the signed sync bridge is acceptable or replace it with a native database adapter before SaaS scale."
            : "Choose a managed database/durable volume owner and configure the signed sync bridge as interim evidence."
    },
    {
      id: "native-managed-object-storage",
      label: "Native managed object storage ownership",
      status: input.objectStorageNativeProvider.configured
        ? "ready"
        : input.objectStorageProvider.configured && input.objectStorageProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: input.objectStorageNativeProvider.configured
        ? [
          `current=${input.objectStorageNativeProvider.mode}`,
          `native=${SENA_SCHEMA_VERSIONS.enterpriseObjectStorageNative}`,
          ...input.objectStorageNativeProvider.evidence
        ]
        : [
          "current=private-local-upload-directory",
          "bridge=sena-enterprise-upload-object-storage-webhook/v1",
          ...input.objectStorageNativeProvider.evidence,
          `endpointHash=${input.objectStorageProvider.endpointHash ?? "none"}`
        ],
      nextAction: input.objectStorageNativeProvider.configured
        ? "Attach bucket versioning, scan/retention, restore, and credential-rotation evidence before SaaS cutover."
        : input.objectStorageProvider.configured && input.objectStorageProvider.secretConfigured
          ? "Platform owner must decide whether the signed object-storage bridge is acceptable or replace it with a native object-storage adapter."
          : "Configure managed object storage and scan/retention ownership before regulated deployment."
    },
    {
      id: "native-collaboration-pubsub",
      label: "Native collaboration pub/sub ownership",
      status: input.collaborationProvider.configured && input.collaborationProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "current=single-runtime-sse-plus-webhook-queue",
        "bridge=sena-enterprise-collaboration-pubsub-webhook/v1",
        `endpointHash=${input.collaborationProvider.endpointHash ?? "none"}`
      ],
      nextAction: input.collaborationProvider.configured && input.collaborationProvider.secretConfigured
        ? "Platform owner must decide whether the signed pub/sub bridge is acceptable or replace it with a native bus adapter before multi-instance scale."
        : "Choose the institution event bus and configure collaboration delivery before multi-runtime collaboration is claimed."
    },
    {
      id: "institution-idp-approval",
      label: "Institution IdP tenant and callback approval",
      status: input.oidcGovernance?.status === "pass" ? "ready" : "open",
      evidence: input.oidcGovernance?.evidence ?? ["oauthGovernance=missing"],
      nextAction: input.oidcGovernance?.status === "pass"
        ? "Keep provider-side redirect URI approval and SSO preflight in release checks."
        : "Complete IdP tenant approval, configure OAuth/OIDC secrets, and rerun SSO preflight."
    },
    {
      id: "institution-provisioning-owner",
      label: "Institution provisioning owner",
      status: input.provisioningGovernance?.status === "pass" ? "ready" : "open",
      evidence: input.provisioningGovernance?.evidence ?? ["provisioningGovernance=missing"],
      nextAction: input.provisioningGovernance?.status === "pass"
        ? "Map provisioning ownership to the institution IdP or SCIM bridge."
        : "Assign the institution provisioning owner and configure SENA_PROVISIONING_TOKEN."
    },
    {
      id: "deployment-alerting-escalation",
      label: "Deployment alerting escalation owner",
      status: alertingReady ? "ready" : "open",
      evidence: [
        `alertingOwner=${alertingOwner() ? "configured" : "missing"}`,
        `alertingChannel=${alertingChannel()}`,
        `alertWebhook=${input.alertProvider.configured ? "configured" : "missing"}`,
        `endpointHash=${input.alertProvider.endpointHash ?? "none"}`
      ],
      nextAction: alertingReady
        ? "Connect signed alert delivery to deployment monitor escalation policy."
        : "Assign alert owner/channel/runbook and configure signed alert delivery."
    },
    {
      id: "native-audit-siem-adapter",
      label: "Native audit/SIEM retention ownership",
      status: input.auditProvider.configured && input.auditProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "current=append-only-file-audit-log-plus-signed-webhook",
        "bridge=sena-enterprise-audit-webhook/v1",
        `retentionDays=${auditRetentionWindowDays() ?? "missing"}`,
        `endpointHash=${input.auditProvider.endpointHash ?? "none"}`
      ],
      nextAction: input.auditProvider.configured && input.auditProvider.secretConfigured
        ? "Platform owner must decide whether the signed audit/SIEM bridge is acceptable or replace it with a native audit retention adapter."
        : "Configure signed audit/SIEM forwarding and retention ownership before production audit claims."
    },
    {
      id: "institution-email-provider",
      label: "Institution email provider ownership",
      status: input.emailProvider.configured && input.emailProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "bridge=sena-enterprise-email-webhook/v1",
        `endpointHash=${input.emailProvider.endpointHash ?? "none"}`,
        `passwordResetLocalTokenExposure=${passwordResetTokenExposure()}`
      ],
      nextAction: input.emailProvider.configured && input.emailProvider.secretConfigured
        ? "Institution owner must approve retention, replay, and deliverability policy for the signed email bridge."
        : "Configure institution email delivery before password reset or invitation email is claimed."
    },
    {
      id: "native-managed-backup-storage",
      label: "Native managed backup and restore ownership",
      status: input.backupProvider.configured && input.backupProvider.secretConfigured ? "bridge-ready" : "open",
      evidence: [
        "current=team-scoped-file-backup-plus-signed-webhook",
        "bridge=sena-enterprise-backup-webhook/v1",
        "restoreRehearsal=sena-enterprise-backup-restore/v1",
        `endpointHash=${input.backupProvider.endpointHash ?? "none"}`
      ],
      nextAction: input.backupProvider.configured && input.backupProvider.secretConfigured
        ? "Platform owner must decide whether the signed managed-backup bridge is acceptable or replace it with a native backup/restore adapter."
        : "Configure signed managed-backup delivery and restore ownership before production backup claims."
    },
    {
      id: "full-saas-backend-operations",
      label: "Full SaaS backend operating model",
      status: fullSaasBackendReady ? "ready" : input.selfManagedEnterprise ? "bridge-ready" : "open",
      evidence: [
        "current=file-backed-json|signed-webhook-bridges|single-runtime-sse",
        `saasOperatingModelApproved=${input.fullSaasBackendApproved ? "yes" : "no"}`,
        `postgresPrimary=${postgresPrimaryReady ? "ready" : "review"}`,
        `objectStorageNative=${input.objectStorageNativeProvider.configured ? "configured" : "missing"}`,
        `managedDatabaseBridge=${input.databaseSyncProvider.configured && input.databaseSyncProvider.secretConfigured ? "configured" : "missing"}`,
        `objectStorageBridge=${input.objectStorageProvider.configured && input.objectStorageProvider.secretConfigured ? "configured" : "missing"}`,
        `collaborationPubSubBridge=${input.collaborationProvider.configured && input.collaborationProvider.secretConfigured ? "configured" : "missing"}`,
        `backupBridge=${input.backupProvider.configured && input.backupProvider.secretConfigured ? "configured" : "missing"}`,
        `alertingOwner=${alertingOwner() ? "configured" : "missing"}`,
        `alertWebhook=${input.alertProvider.configured && input.alertProvider.secretConfigured ? "configured" : "missing"}`,
        `auditWebhook=${input.auditProvider.configured && input.auditProvider.secretConfigured ? "configured" : "missing"}`,
        `emailWebhook=${input.emailProvider.configured && input.emailProvider.secretConfigured ? "configured" : "missing"}`,
        `idpApproval=${input.oidcGovernance?.status ?? "missing"}`,
        `provisioningOwner=${input.provisioningGovernance?.status ?? "missing"}`
      ],
      nextAction: fullSaasBackendReady
        ? "Keep the SaaS operating-model approval with release evidence and rerun deployment readiness before each institution handoff."
        : input.selfManagedEnterprise
          ? "Keep self-managed runtime, backup, audit, and release verification evidence current; full institution SaaS operating-model approval is not applicable for this deployment boundary."
          : "Approve the full SaaS backend operating model or replace the file-backed/runtime bridge controls with native managed platform adapters."
    }
  ];
}
