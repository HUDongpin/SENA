import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseIdentityProductionEvidence } from "./identity-production-evidence";
import { latestReleaseGateIdentityReceiptArchiveEvidence } from "./identity-receipt-archive";
import type { SenaEnterpriseNativeAdapterCertification } from "./ops-platform-adapter-certification";
import type { SenaEnterprisePlatformDecisionRegister } from "./ops-platform-decisions";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import type {
  buildEnterpriseDeploymentReleaseGateEvidence,
  SenaEnterpriseReleaseGateDecision,
  SenaEnterpriseReleaseGateReview,
  SenaEnterpriseReleaseVerificationEvidence
} from "./ops-release-gate";
import { now } from "./ops-runtime";

export function buildEnterpriseSaasOperationsReadiness(input: {
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  nativeAdapterCertification: SenaEnterpriseNativeAdapterCertification;
  releaseGate: ReturnType<typeof buildEnterpriseDeploymentReleaseGateEvidence>;
  identityProductionHandoff: SenaEnterpriseIdentityProductionEvidence;
  saasOperatingModelApproved: boolean;
}): SenaEnterpriseSaasOperationsReadiness {
  const selfManagedEnterprise = isSelfManagedEnterpriseMode();
  const fullSaasDecision = input.platformDecisionRegister.decisions.find((decision) => decision.id === "full-saas-backend-operations");
  const latestReleaseGate = input.releaseGate.latestReview;
  const fullSaasDecisionAccepted = selfManagedEnterprise || Boolean(fullSaasDecision?.acceptedBridge);
  const latestReleaseGateApproved = selfManagedEnterprise || latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = selfManagedEnterprise || latestReleaseGate?.verificationEvidence?.status === "passed";
  const latestReleaseGateIdentitySnapshot = latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = selfManagedEnterprise || latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const identityProductionReleaseGateDigestBinding = selfManagedEnterprise
    ? "not-required"
    : !latestReleaseGateIdentitySnapshot?.evidenceBindingDigest || !input.identityProductionHandoff.evidenceBindingDigest
    ? "missing"
    : latestReleaseGateIdentitySnapshot.evidenceBindingDigest === input.identityProductionHandoff.evidenceBindingDigest
      ? "current"
      : "stale";
  const nativeAdapterProductionBlocking = input.nativeAdapterCertification.summary.productionBlocking;
  const blockers = selfManagedEnterprise ? [] : [
    input.saasOperatingModelApproved ? null : "saas-operating-model-approval-env-required",
    fullSaasDecisionAccepted ? null : "full-saas-platform-decision-acceptance-required",
    nativeAdapterProductionBlocking === 0 ? null : "native-adapter-certification-production-blockers",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker));
  const nextActions = selfManagedEnterprise ? [
    "Keep self-managed local enterprise runtime evidence, backups, audit integrity, and release verification current."
  ] : [
    input.saasOperatingModelApproved ? null : "Set SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED=1 only after institution platform-owner approval is recorded.",
    fullSaasDecisionAccepted ? null : "Record an accepted full-saas-backend-operations platform decision with owner evidence.",
    nativeAdapterProductionBlocking === 0 ? null : "Resolve or explicitly accept every production-blocking native adapter certification item.",
    latestReleaseGateApproved && latestReleaseGateVerificationPassed ? null : "Record an approved release gate with passed verification evidence before institution production rollout.",
    latestReleaseGateIdentityReady ? null : "Resolve release-gate identity production evidence review before SaaS operations readiness is marked ready.",
    identityProductionReleaseGateDigestBinding === "current" ? null : "Record a fresh release gate review after the latest institution identity production evidence handoff changes."
  ].filter((action): action is string => Boolean(action));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSaasOperationsReadiness,
    generatedAt: now(),
    status: blockers.length === 0 ? "ready" : blockers.some((blocker) =>
      blocker.includes("required") ||
      blocker.includes("blockers") ||
      blocker === "release-gate-identity-production-evidence-digest-stale"
    ) ? "blocked" : "review",
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    export: {
      api: "/api/sena/ops/saas-operations",
      filename: "sena-enterprise-saas-operations-readiness.json"
    },
    approval: {
      envConfigured: selfManagedEnterprise || input.saasOperatingModelApproved,
      fullSaasDecisionAccepted,
      latestReleaseGateStatus: latestReleaseGate?.decision,
      latestReleaseGateVerificationStatus: latestReleaseGate?.verificationEvidence?.status
    },
    summary: {
      platformDecisions: input.platformDecisionRegister.summary.decisions,
      acceptedPlatformDecisions: input.platformDecisionRegister.decisions.filter((decision) => decision.ownerEvidence.some((entry) => entry === "acceptance=sena-enterprise-platform-decision-acceptance/v1")).length,
      acceptedBridge: input.platformDecisionRegister.summary.acceptedBridge,
      nativeAdapterProductionBlocking,
      releaseGateReviews: input.releaseGate.summary.total,
      identityProductionStatus: latestReleaseGateIdentitySnapshot?.status ?? "missing",
      identitySubmissionVerifierIncomplete: latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing",
      identityRotationFreshness: latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing",
      identityCutoverChecklist: latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing",
      identityCutoverBlockers: latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing",
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-native-adapter-certification/v1",
      "sena-enterprise-platform-decision-acceptance/v1",
      "sena-enterprise-platform-decision-register/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED"
    ],
    evidence: [
      ...(selfManagedEnterprise ? [
        "enterpriseDeploymentMode=self-managed",
        "fullSaasOperatingModel=not-applicable",
        "selfManagedRuntime=local-enterprise"
      ] : []),
      `saasOperatingModelApproved=${input.saasOperatingModelApproved ? "yes" : "no"}`,
      `fullSaasDecisionAccepted=${fullSaasDecisionAccepted ? "yes" : "no"}`,
      `nativeAdapterCertification=${input.nativeAdapterCertification.schemaVersion}`,
      `nativeAdapterProductionBlocking=${nativeAdapterProductionBlocking}`,
      `platformDecisionRegister=${input.platformDecisionRegister.schemaVersion}`,
      `acceptedBridge=${input.platformDecisionRegister.summary.acceptedBridge}`,
      `releaseGateReviews=${input.releaseGate.summary.total}`,
      `latestReleaseGate=${latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${latestReleaseGate?.verificationEvidence?.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `latestReleaseGateIdentityEvidenceBindingDigest=${latestReleaseGateIdentitySnapshot?.evidenceBindingDigest ?? "missing"}`,
      `currentIdentityProductionEvidenceBindingDigest=${input.identityProductionHandoff.evidenceBindingDigest ?? "missing"}`,
      `identityProductionReleaseGateDigestBinding=${identityProductionReleaseGateDigestBinding}`
    ],
    nextActions
  };
}

export type SenaEnterpriseSaasOperationsReadiness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseSaasOperationsReadiness;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  export: {
    api: "/api/sena/ops/saas-operations";
    filename: "sena-enterprise-saas-operations-readiness.json";
  };
  approval: {
    envConfigured: boolean;
    fullSaasDecisionAccepted: boolean;
    latestReleaseGateStatus?: SenaEnterpriseReleaseGateDecision;
    latestReleaseGateVerificationStatus?: SenaEnterpriseReleaseVerificationEvidence["status"];
  };
  summary: {
    platformDecisions: number;
    acceptedPlatformDecisions: number;
    acceptedBridge: number;
    nativeAdapterProductionBlocking: number;
    releaseGateReviews: number;
    identityProductionStatus: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"] | "missing";
    identitySubmissionVerifierIncomplete: number | "missing";
    identityRotationFreshness: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["rotationFreshness"]["status"] | "missing";
    identityCutoverChecklist: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["cutoverChecklist"]["status"] | "missing";
    identityCutoverBlockers: number | "missing";
    blockers: string[];
  };
  requiredEvidence: string[];
  evidence: string[];
  nextActions: string[];
};
