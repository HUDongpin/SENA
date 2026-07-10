import type { SenaGroupComparisonMetric } from "@/lib/sena/inference";
import type {
  EnterprisePlatformDecisionId,
  EnterprisePlatformDecisionStatus,
  EnterpriseReleaseGateDecision,
  EnterpriseSsoProvider
} from "./enterprise-contracts";

export const enterpriseValidationMetrics: Array<{ value: SenaGroupComparisonMetric; label: string }> = [
  { value: "socialStrength", label: "Social strength" },
  { value: "socialDegree", label: "Social degree" },
  { value: "epistemicContribution", label: "Epistemic contribution" },
  { value: "epistemicDiversity", label: "Epistemic diversity" },
  { value: "bridgeScore", label: "Bridge score (experimental)" },
  { value: "conceptBrokerage", label: "Concept brokerage (experimental)" },
  { value: "alignment", label: "Alignment (experimental)" }
];
export const enterprisePlatformDecisionOptions: Array<{ id: EnterprisePlatformDecisionId; label: string }> = [
  { id: "native-managed-database", label: "Managed database bridge" },
  { id: "native-managed-object-storage", label: "Object storage bridge" },
  { id: "native-collaboration-pubsub", label: "Collaboration pub/sub" },
  { id: "institution-idp-approval", label: "IdP approval" },
  { id: "institution-provisioning-owner", label: "Provisioning owner" },
  { id: "deployment-alerting-escalation", label: "Alert escalation" },
  { id: "native-audit-siem-adapter", label: "Audit/SIEM bridge" },
  { id: "institution-email-provider", label: "Email provider" },
  { id: "native-managed-backup-storage", label: "Backup storage" },
  { id: "full-saas-backend-operations", label: "Full SaaS operating model" }
];
export const enterprisePlatformDecisionStatuses: Array<{ value: EnterprisePlatformDecisionStatus; label: string }> = [
  { value: "accepted", label: "Accepted" },
  { value: "needs-native-adapter", label: "Needs native adapter" },
  { value: "rejected", label: "Rejected" },
  { value: "superseded", label: "Superseded" }
];
export const enterpriseReleaseGateDecisions: Array<{ value: EnterpriseReleaseGateDecision; label: string }> = [
  { value: "conditional", label: "Conditional" },
  { value: "approved", label: "Approved" },
  { value: "blocked", label: "Blocked" }
];
export const enterpriseSsoProviderOptions: Array<{ value: EnterpriseSsoProvider; label: string }> = [
  { value: "institution", label: "Institution IdP" },
  { value: "google", label: "Google" },
  { value: "orcid", label: "ORCID" }
];
