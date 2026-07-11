import { SenaEnterpriseError } from "./errors";
import { envValue } from "./ops-runtime";

export type SenaEnterprisePlatformDecisionAcceptanceStatus =
  | "accepted"
  | "rejected"
  | "needs-native-adapter"
  | "superseded";

export type SenaEnterprisePlatformDecisionCategory =
  | "storage"
  | "identity"
  | "collaboration"
  | "delivery"
  | "operations"
  | "saas";

export type SenaEnterprisePlatformDecisionEvidenceChecklistStatus = "accepted" | "present" | "missing";

export type SenaEnterprisePlatformDecisionEvidenceChecklistItem = {
  id: string;
  label: string;
  status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
  productionRequired: boolean;
  source: "platform-acceptance" | "technical-readiness";
  evidence: string[];
  nextAction: string;
};

type SenaEnterprisePlatformDecisionEvidenceSource = {
  id: string;
  status: string;
  evidence: string[];
};

export const enterprisePlatformDecisionIds = [
  "native-managed-database",
  "native-managed-object-storage",
  "native-collaboration-pubsub",
  "institution-idp-approval",
  "institution-provisioning-owner",
  "deployment-alerting-escalation",
  "native-audit-siem-adapter",
  "institution-email-provider",
  "native-managed-backup-storage",
  "full-saas-backend-operations"
] as const;

export const enterprisePlatformDecisionAcceptanceStatuses = [
  "accepted",
  "rejected",
  "needs-native-adapter",
  "superseded"
] as const;

export function isEnterprisePlatformDecisionId(decisionId: string) {
  return (enterprisePlatformDecisionIds as readonly string[]).includes(decisionId);
}

export function isEnterprisePlatformDecisionAcceptanceStatus(status: string): status is SenaEnterprisePlatformDecisionAcceptanceStatus {
  return (enterprisePlatformDecisionAcceptanceStatuses as readonly string[]).includes(status);
}

export function platformDecisionCategory(decisionId: string): SenaEnterprisePlatformDecisionCategory {
  if (decisionId.includes("database") || decisionId.includes("storage")) return "storage";
  if (decisionId.includes("idp") || decisionId.includes("provisioning")) return "identity";
  if (decisionId.includes("collaboration")) return "collaboration";
  if (decisionId.includes("email")) return "delivery";
  if (decisionId.includes("alerting") || decisionId.includes("audit")) return "operations";
  return "saas";
}

export function platformDecisionAcceptanceCriteria(decisionId: string): string[] {
  switch (decisionId) {
    case "native-managed-database":
      return [
        "Institution platform owner accepts the signed database-sync bridge for production or replaces it with a native managed database adapter.",
        "Durability, backup, restore, and multi-instance write ownership are documented."
      ];
    case "native-managed-object-storage":
      return [
        "Institution platform owner accepts the signed object-storage bridge for production or replaces it with a native object-storage adapter.",
        "Upload retention, malware/DLP review, and private object access are documented."
      ];
    case "native-collaboration-pubsub":
      return [
        "Institution platform owner accepts the signed pub/sub bridge for production or replaces it with a native event-bus adapter.",
        "Presence, comment, adjudication, and retry behavior are monitored across multi-instance runtime."
      ];
    case "institution-idp-approval":
      return [
        "Institution IdP tenant, redirect URI, callback origin, and secret rotation are approved.",
        "SSO preflight passes for every enabled provider before release."
      ];
    case "institution-provisioning-owner":
      return [
        "Institution provisioning owner is named for IdP, SCIM, and bearer-token rotation.",
        "Suspension and last-active-manager guardrails are accepted by the institution."
      ];
    case "deployment-alerting-escalation":
      return [
        "Alert owner, channel, runbook, and signed alert webhook delivery are approved.",
        "Critical readiness regressions are routed to the deployment incident policy."
      ];
    case "native-audit-siem-adapter":
      return [
        "Institution platform owner accepts the signed audit/SIEM bridge for production or replaces it with a native audit retention adapter.",
        "Audit retention, chain-head archival, SIEM delivery monitoring, and export ownership are documented."
      ];
    case "institution-email-provider":
      return [
        "Institution email provider accepts signed delivery payloads for invitations and password resets.",
        "Replay, retention, deliverability, and secure action URL handling are documented."
      ];
    case "native-managed-backup-storage":
      return [
        "Institution platform owner accepts the signed backup bridge for production or replaces it with a native managed backup and restore adapter.",
        "Backup retention, restore drill cadence, RPO/RTO ownership, and private storage access are documented."
      ];
    case "full-saas-backend-operations":
      return [
        "Managed database, object storage, pub/sub, email, alerting, audit, backup, and IdP ownership are approved for multi-instance SaaS operation.",
        "Local file-backed bridges are either formally accepted as interim production controls or replaced with native platform adapters."
      ];
    default:
      return ["Institution platform owner records an acceptance decision before regulated production use."];
  }
}

export function enterpriseDeploymentMode(): "institution-managed" | "self-managed" {
  const mode = (envValue("SENA_ENTERPRISE_DEPLOYMENT_MODE") ?? envValue("SENA_ENTERPRISE_MODE") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (mode === "self-managed" || envValue("SENA_SELF_MANAGED_ENTERPRISE") === "1") return "self-managed";
  return "institution-managed";
}

export function isSelfManagedEnterpriseMode() {
  return enterpriseDeploymentMode() === "self-managed";
}

const selfManagedIdentityDecisionIds = new Set([
  "institution-idp-approval",
  "institution-provisioning-owner"
]);

export const selfManagedLocalPlatformDecisionIds = new Set([
  "native-managed-database",
  "native-managed-object-storage",
  "native-collaboration-pubsub",
  "deployment-alerting-escalation",
  "institution-email-provider",
  "native-audit-siem-adapter",
  "native-managed-backup-storage",
  "full-saas-backend-operations"
]);

export function isSelfManagedIdentityDecision(decisionId: string) {
  return isSelfManagedEnterpriseMode() && selfManagedIdentityDecisionIds.has(decisionId);
}

export function isSelfManagedLocalPlatformDecision(decisionId: string) {
  return isSelfManagedEnterpriseMode() && selfManagedLocalPlatformDecisionIds.has(decisionId);
}

export function platformDecisionProductionBlocking(decisionId: string): boolean {
  if (isSelfManagedIdentityDecision(decisionId)) return false;
  if (isSelfManagedLocalPlatformDecision(decisionId)) return false;
  return (enterprisePlatformDecisionIds as readonly string[]).includes(decisionId);
}

export function platformDecisionOwnerEvidence(decision: Pick<SenaEnterprisePlatformDecisionEvidenceSource, "status" | "evidence">): string[] {
  const ownerEvidence = decision.evidence.filter((entry) =>
    /owner|provider|tenant|callback|channel|runbook|configured|endpointHash|approval|approved|bridge/i.test(entry)
  );
  return ownerEvidence.length > 0 ? ownerEvidence : [`status=${decision.status}`];
}

export function platformDecisionAcceptedBridge(decision: Pick<SenaEnterprisePlatformDecisionEvidenceSource, "id" | "evidence">): boolean {
  if (isSelfManagedIdentityDecision(decision.id)) return true;
  if (isSelfManagedLocalPlatformDecision(decision.id)) return true;
  return decision.evidence.some((entry) =>
    entry === "bridgeAcceptance=accepted" || entry === "platformAcceptance=accepted"
  );
}

export function requiredPlatformDecisionText(value: string | undefined, field: string) {
  const text = value?.trim();
  if (!text) {
    throw new SenaEnterpriseError(`${field} is required for platform decision acceptance.`, 400, "platform_decision_acceptance_required");
  }
  return text;
}

export function normalizedPlatformDecisionEvidenceUrl(value?: string) {
  const text = value?.trim();
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.href;
  } catch {
    throw new SenaEnterpriseError("Platform decision evidence URL must be HTTP(S).", 400, "invalid_platform_decision_evidence_url");
  }
}

export function selfManagedIdentityEvidence(evidence: string[] = []) {
  return Array.from(new Set([
    ...evidence,
    "enterpriseDeploymentMode=self-managed",
    "selfManagedBoundary=local-enterprise-runtime",
    "institutionIdentityEvidence=not-applicable"
  ]));
}

export function selfManagedIdentityNextAction() {
  return "Institution IdP, SCIM, and institution-owned identity evidence are marked not applicable for this explicitly self-managed enterprise deployment; keep local auth, sessions, MFA, CSRF, backup, audit, and release verification evidence current.";
}

export function selfManagedIdentityChecklistItems(
  items: SenaEnterprisePlatformDecisionEvidenceChecklistItem[]
): SenaEnterprisePlatformDecisionEvidenceChecklistItem[] {
  if (!isSelfManagedEnterpriseMode()) return items;
  return items.map((item) => ({
    ...item,
    status: "present",
    productionRequired: false,
    evidence: selfManagedIdentityEvidence(item.evidence),
    nextAction: selfManagedIdentityNextAction()
  }));
}
