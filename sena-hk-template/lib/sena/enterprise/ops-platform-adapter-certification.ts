import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  latestPlatformDecisionAcceptances,
  missingPlatformDecisionProductionEvidence,
  type SenaEnterprisePlatformDecisionAcceptance,
  type SenaEnterprisePlatformDecisionRegister,
  type SenaEnterprisePlatformDecisionRegisterDecision
} from "./ops-platform-decisions";
import type { SenaEnterprisePlatformDecisionCategory } from "./ops-platform-decision-policy";
import { now } from "./ops-runtime";

function nativeAdapterSpec(decisionId: string) {
  switch (decisionId) {
    case "native-managed-database":
      return {
        id: "managed-database-adapter",
        currentAdapter: "file-backed-json",
        targetAdapter: "managed-database",
        bridgeSchema: "sena-enterprise-database-sync-webhook/v1"
      };
    case "native-managed-object-storage":
      return {
        id: "managed-object-storage-adapter",
        currentAdapter: "private-local-upload-directory",
        targetAdapter: "managed-object-storage",
        bridgeSchema: "sena-enterprise-upload-object-storage-webhook/v1"
      };
    case "native-collaboration-pubsub":
      return {
        id: "managed-collaboration-pubsub-adapter",
        currentAdapter: "single-runtime-sse-plus-webhook-queue",
        targetAdapter: "managed-event-bus",
        bridgeSchema: "sena-enterprise-collaboration-pubsub-webhook/v1"
      };
    case "institution-idp-approval":
      return {
        id: "institution-idp-adapter",
        currentAdapter: "oauth-oidc-or-local-pilot-fallback",
        targetAdapter: "institution-idp-tenant",
        bridgeSchema: "sena-enterprise-sso-preflight/v1"
      };
    case "institution-provisioning-owner":
      return {
        id: "institution-provisioning-adapter",
        currentAdapter: "service-token-provisioning-plus-scim-bridge",
        targetAdapter: "institution-idp-scim-owner",
        bridgeSchema: "sena-scim-provisioning-bridge/v1"
      };
    case "deployment-alerting-escalation":
      return {
        id: "deployment-alerting-adapter",
        currentAdapter: "signed-alert-webhook",
        targetAdapter: "institution-incident-escalation",
        bridgeSchema: "sena-enterprise-ops-alert-webhook/v1"
      };
    case "native-audit-siem-adapter":
      return {
        id: "institution-audit-siem-adapter",
        currentAdapter: "append-only-file-audit-log-plus-signed-webhook",
        targetAdapter: "institution-siem-audit-retention",
        bridgeSchema: "sena-enterprise-audit-webhook/v1"
      };
    case "institution-email-provider":
      return {
        id: "institution-email-adapter",
        currentAdapter: "signed-email-webhook",
        targetAdapter: "institution-email-provider",
        bridgeSchema: "sena-enterprise-email-webhook/v1"
      };
    case "native-managed-backup-storage":
      return {
        id: "managed-backup-storage-adapter",
        currentAdapter: "team-scoped-file-backup-plus-signed-webhook",
        targetAdapter: "managed-backup-storage-and-restore",
        bridgeSchema: "sena-enterprise-backup-webhook/v1"
      };
    case "full-saas-backend-operations":
      return {
        id: "full-saas-operations-adapter",
        currentAdapter: "file-backed-runtime-plus-signed-bridges",
        targetAdapter: "managed-saas-operations-backend",
        bridgeSchema: "sena-enterprise-organization-deployment/v1"
      };
    default:
      return {
        id: `${decisionId}-adapter`,
        currentAdapter: "local-enterprise-runtime",
        targetAdapter: "institution-managed-adapter",
        bridgeSchema: "sena-enterprise-platform-decision-acceptance/v1"
      };
  }
}

function nativeAdapterCertificationStatus(
  decision: SenaEnterprisePlatformDecisionRegisterDecision,
  acceptance?: SenaEnterprisePlatformDecisionAcceptance
): SenaEnterpriseNativeAdapterCertificationStatus {
  if (acceptance?.status === "needs-native-adapter") return "native-required";
  if (acceptance?.status === "rejected") return "blocked";
  if (acceptance?.status === "superseded") return "superseded";
  if (decision.acceptedBridge) return "accepted-bridge";
  if (decision.status === "bridge-ready") return "bridge-ready";
  if (decision.status === "ready") return "native-ready";
  return "open";
}

function nativeAdapterCertificationEvidence(
  decision: SenaEnterprisePlatformDecisionRegisterDecision,
  spec: ReturnType<typeof nativeAdapterSpec>
) {
  const hasEndpoint = decision.evidence.some((entry) => /^endpointHash=(?!none$)/.test(entry));
  return Array.from(new Set([
    `platformDecision=${decision.id}`,
    `category=${decision.category}`,
    `currentAdapter=${spec.currentAdapter}`,
    `targetAdapter=${spec.targetAdapter}`,
    `bridge=${spec.bridgeSchema}`,
    `decisionStatus=${decision.status}`,
    `acceptedBridge=${decision.acceptedBridge}`,
    `endpointHash=${hasEndpoint ? "present" : "missing"}`,
    ...decision.evidence.filter((entry) => !/secret|token|password/i.test(entry))
  ]));
}

export function buildEnterpriseNativeAdapterCertification(
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister,
  acceptances: SenaEnterprisePlatformDecisionAcceptance[] = []
): SenaEnterpriseNativeAdapterCertification {
  const latestAcceptances = latestPlatformDecisionAcceptances(acceptances);
  const adapters = platformDecisionRegister.decisions.map((decision) => {
    const spec = nativeAdapterSpec(decision.id);
    const acceptance = latestAcceptances.get(decision.id);
    const status = nativeAdapterCertificationStatus(decision, acceptance);
    const missingProductionEvidence = missingPlatformDecisionProductionEvidence(decision);
    const productionBlocking = decision.productionBlocking && (
      missingProductionEvidence.length > 0 ||
      (!decision.acceptedBridge && (
        status === "open" ||
        status === "bridge-ready" ||
        status === "native-ready" ||
        status === "native-required" ||
        status === "blocked"
      ))
    );
    return {
      id: spec.id,
      decisionId: decision.id,
      category: decision.category,
      label: decision.label,
      status,
      currentAdapter: spec.currentAdapter,
      targetAdapter: spec.targetAdapter,
      bridgeSchema: spec.bridgeSchema,
      acceptedBridge: decision.acceptedBridge,
      productionBlocking,
      certificationEvidence: nativeAdapterCertificationEvidence(decision, spec),
      ownerEvidence: decision.ownerEvidence,
      acceptanceCriteria: decision.acceptanceCriteria,
      nextAction: decision.nextAction
    };
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification,
    generatedAt: now(),
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    summary: {
      adapters: adapters.length,
      nativeReady: adapters.filter((adapter) => adapter.status === "native-ready").length,
      acceptedBridge: adapters.filter((adapter) => adapter.status === "accepted-bridge").length,
      bridgeReady: adapters.filter((adapter) => adapter.status === "bridge-ready").length,
      nativeRequired: adapters.filter((adapter) => adapter.status === "native-required").length,
      productionBlocking: adapters.filter((adapter) => adapter.productionBlocking).length
    },
    export: {
      api: "/api/sena/ops/native-adapters",
      filename: "sena-enterprise-native-adapter-certification.json"
    },
    adapters,
    nextActions: Array.from(new Set(adapters
      .filter((adapter) => adapter.productionBlocking || adapter.status === "native-required")
      .map((adapter) => adapter.nextAction)))
  };
}

export type SenaEnterpriseNativeAdapterCertificationStatus =
  | "native-ready"
  | "accepted-bridge"
  | "bridge-ready"
  | "native-required"
  | "blocked"
  | "superseded"
  | "open";

export type SenaEnterpriseNativeAdapterCertification = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification;
  generatedAt: string;
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  summary: {
    adapters: number;
    nativeReady: number;
    acceptedBridge: number;
    bridgeReady: number;
    nativeRequired: number;
    productionBlocking: number;
  };
  export: {
    api: "/api/sena/ops/native-adapters";
    filename: "sena-enterprise-native-adapter-certification.json";
  };
  adapters: Array<{
    id: string;
    decisionId: string;
    category: SenaEnterprisePlatformDecisionCategory;
    label: string;
    status: SenaEnterpriseNativeAdapterCertificationStatus;
    currentAdapter: string;
    targetAdapter: string;
    bridgeSchema: string;
    acceptedBridge: boolean;
    productionBlocking: boolean;
    certificationEvidence: string[];
    ownerEvidence: string[];
    acceptanceCriteria: string[];
    nextAction: string;
  }>;
  nextActions: string[];
};
