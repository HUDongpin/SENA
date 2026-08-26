import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  type SenaEnterpriseDb
} from "./state";
import type { SenaEnterpriseOrganizationDeploymentDecision } from "./ops-deployment-decisions";
import type { SenaEnterpriseReleaseGateReview } from "./ops-release-gate";
import type {
  SenaEnterprisePlatformDecisionAcceptance,
  SenaEnterprisePlatformDecisionProductionEvidenceReceipt,
  SenaEnterprisePlatformDecisionRegister
} from "./ops-platform-decisions";
import type {
  SenaEnterprisePlatformDecisionAcceptanceStatus,
  SenaEnterprisePlatformDecisionEvidenceChecklistItem,
  SenaEnterprisePlatformDecisionEvidenceChecklistStatus
} from "./ops-platform-decision-policy";
import type { SenaEnterpriseCapabilityAuditItem } from "./ops-capability-audit";
import {
  getEnterpriseOrganizationDeploymentPackage,
  getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence,
  type SenaEnterpriseOrganizationDeploymentPackage
} from "./ops-deployment";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseDeploymentReadinessWithPostgresEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import {
  buildEnterprisePlatformDecisionRegister,
  latestPlatformDecisionAcceptances,
  missingPlatformDecisionProductionEvidence,
  platformDecisionProductionEvidenceReceipt
} from "./ops-platform-decisions";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import {
  getEnterpriseCapabilityAudit,
  getEnterpriseCapabilityAuditWithPostgresEvidence,
  type SenaEnterpriseCapabilityAudit
} from "./ops-capability-audit";
import {
  getEnterpriseOpsStatus,
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus,
  type SenaEnterpriseOpsStatusSnapshotSource
} from "./ops-status";
import { getEnterpriseGovernanceStatus } from "./ops-governance";
import {
  summarizeEnterpriseUploadObjectStorageCustodyFromDb,
  verifyEnterpriseUploadStorageFromDb
} from "./import-analysis";
import {
  verifyEnterpriseAuditIntegrityFromDb,
  type SenaEnterpriseAuditLogEntry
} from "./ops-audit";
import {
  artifactSha256,
  now,
  sha256Text
} from "./auth-config";
import {
  buildEnterpriseIdentityReceiptArchiveManifest,
  formatIdentityReceiptArchiveArtifactCompletenessCounts,
  formatIdentityReceiptArchiveMissingInputCounts,
  identityReceiptArchiveArtifactCompletenessReady,
  type SenaEnterpriseIdentityReceiptArchiveManifest,
  type SenaEnterpriseIdentityReceiptArchiveMissingInput
} from "./identity-receipt-archive";
import {
  buildEnterpriseIdentityInstitutionActionPlan,
  type SenaEnterpriseIdentityInstitutionActionPlan
} from "./identity-action-plan";
import {
  buildEnterpriseIdentityEvidenceUrlHostBinding,
  type SenaEnterpriseIdentityEvidenceUrlHostBinding
} from "./identity-evidence-url-policy";
import {
  buildEnterpriseIdentityCutoverChecklist,
  buildEnterpriseIdentitySubmissionVerifier,
  type SenaEnterpriseIdentityCutoverChecklist,
  type SenaEnterpriseIdentitySubmissionVerifier
} from "./identity-submission-gates";
import {
  buildEnterpriseIdentityPlatformDecisionRequestPacket,
  identityPlatformDecisionReceiptArchiveBodyPaths,
  identityPlatformDecisionReceiptArchivePolicy,
  identityPlatformDecisionResponseAuditHeaders,
  identityRequestPacketPolicyHash,
  type SenaEnterpriseIdentityPlatformDecisionRequestPacket
} from "./identity-request-packet";
import {
  buildEnterpriseIdentityRotationFreshness,
  identityProductionDecisionIds,
  identityRotationFreshnessSpecs,
  isIdentityProductionDecisionId,
  type SenaEnterpriseIdentityProductionDecisionId,
  type SenaEnterpriseIdentityRotationFreshness
} from "./identity-readiness";

export type SenaEnterpriseIdentityProductionEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence;
  generatedAt: string;
  status: "ready" | "review";
  dossierDigestAlgorithm?: "sha256";
  dossierDigestScope?: "identity-production-evidence-dossier";
  dossierDigest?: string;
  evidenceBindingDigestAlgorithm?: "sha256";
  evidenceBindingDigestScope?: "identity-production-evidence-binding";
  evidenceBindingDigest?: string;
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
    evidenceUrlsHashed: true;
    ownerNamesHashed: true;
    productionEvidenceTimestampsHashed: true;
  };
  summary: {
    productionRequired: number;
    accepted: number;
    present: number;
    missing: number;
    platformBlocking: number;
    technicalBlocking: number;
  };
  capability: Pick<SenaEnterpriseCapabilityAuditItem, "id" | "status" | "evidence" | "remainingPlatformDecisions" | "nextAction">;
  decisions: Array<{
    id: SenaEnterpriseIdentityProductionDecisionId;
    label: string;
    status: SenaEnterpriseOrganizationDeploymentDecision["status"];
    productionBlocking: boolean;
    acceptedBridge: boolean;
    ownerEvidence: string[];
    acceptanceCriteria: string[];
  }>;
  acceptanceReceipts: Array<{
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    status: SenaEnterprisePlatformDecisionAcceptanceStatus;
    acceptedBridge: boolean;
    ownerNameHash?: string;
    productionEvidenceVerifiedAtHash?: string;
    ownerRole: string;
    environment: string;
    evidenceUrlHash?: string;
    evidenceUrlPathHash?: string;
    evidenceUrlHostHash?: string;
    evidenceUrlAllowedHostHash?: string;
    productionEvidenceReceipt?: SenaEnterprisePlatformDecisionProductionEvidenceReceipt;
    updatedAt: string;
  }>;
  requirements: Array<{
    id: string;
    decisionId: SenaEnterpriseIdentityProductionDecisionId;
    label: string;
    status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
    productionRequired: boolean;
    source: SenaEnterprisePlatformDecisionEvidenceChecklistItem["source"];
    evidence: string[];
    nextAction: string;
  }>;
  evidenceManifest: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidenceManifest;
    requiredEvidenceIds: string[];
    acceptedEvidenceIds: string[];
    presentEvidenceIds: string[];
    missingEvidenceIds: string[];
    platformAcceptanceEvidenceIds: string[];
    technicalReadinessEvidenceIds: string[];
    byDecision: Array<{
      decisionId: SenaEnterpriseIdentityProductionDecisionId;
      requiredEvidenceIds: string[];
      acceptedEvidenceIds: string[];
      presentEvidenceIds: string[];
      missingEvidenceIds: string[];
    }>;
  };
  releaseGate: {
    approvalBlocked: boolean;
    productionBlockingDecisionIds: string[];
    missingProductionEvidence: SenaEnterpriseReleaseGateReview["platformDecisionSnapshot"]["missingProductionEvidence"];
  };
  rotationFreshness: SenaEnterpriseIdentityRotationFreshness;
  evidenceUrlHostBinding: SenaEnterpriseIdentityEvidenceUrlHostBinding;
  cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
  platformRequestPacket: SenaEnterpriseIdentityPlatformDecisionRequestPacket;
  submissionVerifier: SenaEnterpriseIdentitySubmissionVerifier;
  receiptArchiveManifest: SenaEnterpriseIdentityReceiptArchiveManifest;
  institutionActionPlan: SenaEnterpriseIdentityInstitutionActionPlan;
  evidence: string[];
  nextActions: string[];
};


function identityProductionEvidenceBindingDigest(
  acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"]
) {
  const receiptByDecision = new Map(acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt]));
  return artifactSha256({
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
    evidenceBindingDigestAlgorithm: "sha256",
    evidenceBindingDigestScope: "identity-production-evidence-binding",
    decisions: identityProductionDecisionIds.map((decisionId) => {
      const receipt = receiptByDecision.get(decisionId);
      const productionEvidenceReceipt = receipt?.productionEvidenceReceipt;
      return {
        decisionId,
        status: receipt?.status ?? "missing",
        acceptedBridge: receipt?.acceptedBridge ?? false,
        submittedEvidenceDigest: productionEvidenceReceipt?.submittedEvidenceDigest ?? "missing",
        productionEvidenceArtifactDigestAlgorithm: productionEvidenceReceipt?.productionEvidenceArtifactDigestAlgorithm ?? "missing",
        productionEvidenceArtifactDigestScope: productionEvidenceReceipt?.productionEvidenceArtifactDigestScope ?? "missing",
        productionEvidenceArtifactDigest: productionEvidenceReceipt?.productionEvidenceArtifactDigest ?? "missing",
        productionEvidenceArtifactDigestCoveredEvidenceIds: productionEvidenceReceipt?.productionEvidenceArtifactDigestCoveredEvidenceIds ?? [],
        productionEvidenceArtifactDigestCoverageStatus: productionEvidenceReceipt?.productionEvidenceArtifactDigestCoverageStatus ?? "missing",
        productionEvidenceArtifactDigestCompletenessStatus: productionEvidenceReceipt?.productionEvidenceArtifactDigestCompletenessStatus ?? "missing",
        verifierStatus: productionEvidenceReceipt?.verifierStatus ?? "missing",
        requestPacketPolicyBindingStatus: productionEvidenceReceipt?.requestPacketPolicyBindingStatus ?? "missing",
        technicalBindingStatus: productionEvidenceReceipt?.technicalBindingStatus ?? "missing",
        technicalReadinessStatus: productionEvidenceReceipt?.technicalReadinessStatus ?? "missing",
        evidenceUrlHostBindingStatus: productionEvidenceReceipt?.evidenceUrlHostBindingStatus ?? "missing",
        rotationFreshnessStatus: productionEvidenceReceipt?.rotationFreshnessStatus ?? "missing",
        rotationExpiredEvidenceIds: productionEvidenceReceipt?.rotationExpiredEvidenceIds ?? [],
        rotationDueSoonEvidenceIds: productionEvidenceReceipt?.rotationDueSoonEvidenceIds ?? []
      };
    })
  });
}

export function buildEnterpriseIdentityProductionEvidenceDossier(input: {
  generatedAt?: string;
  teamId?: string;
  db?: SenaEnterpriseDb;
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
  authCapability?: SenaEnterpriseCapabilityAuditItem;
  requireAuthCapabilityReady?: boolean;
}): SenaEnterpriseIdentityProductionEvidence {
  const latestIdentityAcceptances = latestPlatformDecisionAcceptances(input.platformDecisionAcceptances);
  const decisions = input.platformDecisionRegister.decisions
    .filter((decision) => isIdentityProductionDecisionId(decision.id))
    .map((decision) => ({
      id: decision.id as SenaEnterpriseIdentityProductionDecisionId,
      label: decision.label,
      status: decision.status,
      productionBlocking: decision.productionBlocking,
      acceptedBridge: decision.acceptedBridge,
      ownerEvidence: decision.ownerEvidence,
      acceptanceCriteria: decision.acceptanceCriteria
    }));
  const acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"] = identityProductionDecisionIds
    .flatMap((decisionId) => {
      const acceptance = latestIdentityAcceptances.get(decisionId);
      if (!acceptance) return [];
      const productionEvidenceReceipt = platformDecisionProductionEvidenceReceipt(acceptance, input.db) ?? acceptance.productionEvidenceReceipt;
      return [{
        decisionId,
        status: acceptance.status,
        acceptedBridge: acceptance.acceptedBridge,
        ownerNameHash: sha256Text(acceptance.ownerName),
        ...(acceptance.productionEvidenceVerifiedAt ? {
          productionEvidenceVerifiedAtHash: sha256Text(acceptance.productionEvidenceVerifiedAt)
        } : {}),
        ownerRole: acceptance.ownerRole,
        environment: acceptance.environment,
        ...(acceptance.evidenceUrlHash ? { evidenceUrlHash: acceptance.evidenceUrlHash } : {}),
        ...(acceptance.evidenceUrlPathHash ? { evidenceUrlPathHash: acceptance.evidenceUrlPathHash } : {}),
        ...(acceptance.evidenceUrlHostHash ? { evidenceUrlHostHash: acceptance.evidenceUrlHostHash } : {}),
        ...(acceptance.evidenceUrlAllowedHostHash ? { evidenceUrlAllowedHostHash: acceptance.evidenceUrlAllowedHostHash } : {}),
        ...(productionEvidenceReceipt ? { productionEvidenceReceipt } : {}),
        updatedAt: acceptance.updatedAt
      }];
    });
  const requirements = input.platformDecisionRegister.decisions
    .filter((decision) => isIdentityProductionDecisionId(decision.id))
    .flatMap((decision) =>
      decision.evidenceChecklist
        .filter((item) => item.productionRequired)
        .map((item) => ({
          id: item.id,
          decisionId: decision.id as SenaEnterpriseIdentityProductionDecisionId,
          label: item.label,
          status: item.status,
          productionRequired: item.productionRequired,
          source: item.source,
          evidence: item.evidence,
          nextAction: item.nextAction
        }))
    );
  const productionRequirements = requirements.filter((requirement) => requirement.productionRequired);
  const missingRequirements = productionRequirements.filter((requirement) => requirement.status === "missing");
  const uniqueEvidenceIds = (values: string[]) => Array.from(new Set(values));
  const acceptanceReceiptByDecision = new Map(acceptanceReceipts.map((receipt) => [receipt.decisionId, receipt]));
  const evidenceManifest: SenaEnterpriseIdentityProductionEvidence["evidenceManifest"] = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidenceManifest,
    requiredEvidenceIds: uniqueEvidenceIds(productionRequirements.map((requirement) => requirement.id)),
    acceptedEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.status === "accepted")
      .map((requirement) => requirement.id)),
    presentEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.status === "present")
      .map((requirement) => requirement.id)),
    missingEvidenceIds: uniqueEvidenceIds(missingRequirements.map((requirement) => requirement.id)),
    platformAcceptanceEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.source === "platform-acceptance")
      .map((requirement) => requirement.id)),
    technicalReadinessEvidenceIds: uniqueEvidenceIds(productionRequirements
      .filter((requirement) => requirement.source === "technical-readiness")
      .map((requirement) => requirement.id)),
    byDecision: identityProductionDecisionIds.map((decisionId) => {
      const decisionRequirements = productionRequirements.filter((requirement) => requirement.decisionId === decisionId);
      return {
        decisionId,
        requiredEvidenceIds: uniqueEvidenceIds(decisionRequirements.map((requirement) => requirement.id)),
        acceptedEvidenceIds: uniqueEvidenceIds(decisionRequirements
          .filter((requirement) => requirement.status === "accepted")
          .map((requirement) => requirement.id)),
        presentEvidenceIds: uniqueEvidenceIds(decisionRequirements
          .filter((requirement) => requirement.status === "present")
          .map((requirement) => requirement.id)),
        missingEvidenceIds: uniqueEvidenceIds(decisionRequirements
          .filter((requirement) => requirement.status === "missing")
          .map((requirement) => requirement.id))
      };
    })
  };
  const productionBlockingDecisionIds = identityProductionDecisionIds.filter((decisionId) => {
    const decision = input.platformDecisionRegister.decisions.find((candidate) => candidate.id === decisionId);
    if (!decision) return true;
    return decision.productionBlocking && (
      decision.status === "open" ||
      !decision.acceptedBridge ||
      requirements.some((requirement) => requirement.decisionId === decisionId && requirement.status === "missing") ||
      acceptanceReceiptByDecision.get(decisionId)?.productionEvidenceReceipt?.verifierStatus === "review"
    );
  });
  const generatedAt = input.generatedAt ?? now();
  const rotationFreshness = buildEnterpriseIdentityRotationFreshness(latestIdentityAcceptances, generatedAt);
  const evidenceUrlHostBinding = buildEnterpriseIdentityEvidenceUrlHostBinding(latestIdentityAcceptances);
  const platformRequestPacket = buildEnterpriseIdentityPlatformDecisionRequestPacket({
    teamId: input.teamId,
    db: input.db,
    generatedAt,
    decisions,
    requirements,
    acceptanceReceipts
  });
  const submissionVerifier = buildEnterpriseIdentitySubmissionVerifier({
    generatedAt,
    requirements,
    acceptanceReceipts,
    requestPacketPolicyHash: identityRequestPacketPolicyHash()
  });
  const receiptArchiveManifest = buildEnterpriseIdentityReceiptArchiveManifest({
    generatedAt,
    acceptanceReceipts,
    receiptArchivePolicy: identityPlatformDecisionReceiptArchivePolicy,
    responseAuditHeaders: identityPlatformDecisionResponseAuditHeaders,
    receiptArchiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths,
    selfManagedEnterpriseMode: isSelfManagedEnterpriseMode()
  });
  const evidenceBindingDigest = identityProductionEvidenceBindingDigest(acceptanceReceipts);
  const cutoverChecklist = buildEnterpriseIdentityCutoverChecklist({
    generatedAt,
    requirements,
    acceptanceReceipts
  });
  const institutionActionPlan = buildEnterpriseIdentityInstitutionActionPlan({
    generatedAt,
    requirements,
    platformRequestPacket,
    cutoverChecklist,
    receiptArchiveManifest,
    rotationFreshnessSpecs: identityRotationFreshnessSpecs,
    requestPacketPolicyHash: identityRequestPacketPolicyHash()
  });
  const receiptArchiveReady = receiptArchiveManifest.summary.readyForArchive === identityProductionDecisionIds.length &&
    receiptArchiveManifest.summary.reviewArchives === 0 &&
    receiptArchiveManifest.summary.missingReceipts === 0;
  const receiptArchiveArtifactCompletenessReady = identityReceiptArchiveArtifactCompletenessReady(
    receiptArchiveManifest.summary.artifactCompletenessCounts
  );
  const authCapabilityReady = !input.requireAuthCapabilityReady || input.authCapability?.status === "ready";
  const identityProductionReleaseGateBlocked = productionBlockingDecisionIds.length > 0 ||
    submissionVerifier.summary.incompleteDecisions > 0 ||
    submissionVerifier.summary.missingProductionEvidence > 0 ||
    submissionVerifier.summary.missingTechnicalPrerequisites > 0 ||
    cutoverChecklist.status !== "ready" ||
    rotationFreshness.status !== "ready" ||
    evidenceUrlHostBinding.status !== "ready" ||
    !receiptArchiveArtifactCompletenessReady ||
    !receiptArchiveReady;
  const status: SenaEnterpriseIdentityProductionEvidence["status"] = !identityProductionReleaseGateBlocked && authCapabilityReady
    ? "ready"
    : "review";
  const capabilityStatus = input.teamId ? status : input.authCapability?.status ?? status;
  const nextActions = Array.from(new Set(
    missingRequirements.length > 0
      ? missingRequirements.map((requirement) => requirement.nextAction)
      : [input.authCapability?.nextAction ?? "Keep institution identity evidence attached to release checks."]
  ));

  const dossierCore: Omit<
    SenaEnterpriseIdentityProductionEvidence,
    "dossierDigestAlgorithm" | "dossierDigestScope" | "dossierDigest"
  > = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
    generatedAt,
    status,
    evidenceBindingDigestAlgorithm: "sha256",
    evidenceBindingDigestScope: "identity-production-evidence-binding",
    evidenceBindingDigest,
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true,
      evidenceUrlsHashed: true,
      ownerNamesHashed: true,
      productionEvidenceTimestampsHashed: true
    },
    summary: {
      productionRequired: productionRequirements.length,
      accepted: productionRequirements.filter((requirement) => requirement.status === "accepted").length,
      present: productionRequirements.filter((requirement) => requirement.status === "present").length,
      missing: missingRequirements.length,
      platformBlocking: missingRequirements.filter((requirement) => requirement.source === "platform-acceptance").length,
      technicalBlocking: missingRequirements.filter((requirement) => requirement.source === "technical-readiness").length
    },
    capability: {
      id: input.authCapability?.id ?? "auth-login-register-sso",
      status: capabilityStatus,
      evidence: input.teamId
        ? [
            "capabilityAudit=team-scoped-identity-production-evidence",
            `teamId=${input.teamId}`,
            `platformDecisionRegister=${input.platformDecisionRegister.schemaVersion}`,
            `missingEvidenceIds=${evidenceManifest.missingEvidenceIds.join("|") || "none"}`
          ]
        : input.authCapability?.evidence ?? [
            "capabilityAudit=deployment-identity-production-handoff",
            `platformDecisionRegister=${input.platformDecisionRegister.schemaVersion}`,
            `missingEvidenceIds=${evidenceManifest.missingEvidenceIds.join("|") || "none"}`
          ],
      remainingPlatformDecisions: input.teamId
        ? productionBlockingDecisionIds
        : input.authCapability?.remainingPlatformDecisions ?? productionBlockingDecisionIds,
      nextAction: input.authCapability?.nextAction ?? "Complete institution identity production evidence before release approval."
    },
    decisions,
    acceptanceReceipts,
    requirements,
    evidenceManifest,
    releaseGate: {
      approvalBlocked: identityProductionReleaseGateBlocked || !authCapabilityReady,
      productionBlockingDecisionIds,
      missingProductionEvidence: missingRequirements.map((requirement) => ({
        decisionId: requirement.decisionId,
        evidenceId: requirement.id,
        label: requirement.label,
        status: requirement.status,
        source: requirement.source,
        nextAction: requirement.nextAction
      }))
    },
    rotationFreshness,
    evidenceUrlHostBinding,
    cutoverChecklist,
    platformRequestPacket,
    submissionVerifier,
    receiptArchiveManifest,
    institutionActionPlan,
    evidence: [
      "schema=sena-enterprise-identity-production-evidence/v1",
      `status=${status}`,
      `authCapability=${capabilityStatus}`,
      `scope=${input.teamId ? `team:${input.teamId}` : "global"}`,
      ...(isSelfManagedEnterpriseMode() ? [
        "enterpriseDeploymentMode=self-managed",
        "institutionIdentityEvidence=not-applicable"
      ] : []),
      `evidenceBindingDigest=${evidenceBindingDigest}`,
      `productionRequired=${productionRequirements.length}`,
      `missing=${missingRequirements.length}`,
      `missingEvidenceIds=${evidenceManifest.missingEvidenceIds.join("|") || "none"}`,
      `identityProductionBlockingDecisions=${productionBlockingDecisionIds.join("|") || "none"}`,
      `platformRequestPacket=${platformRequestPacket.schemaVersion}`,
      `platformRequestBlocking=${platformRequestPacket.summary.blockingRequests}`,
      `submissionVerifier=${submissionVerifier.schemaVersion}`,
      `submissionVerifierMissing=${submissionVerifier.summary.missingProductionEvidence}`,
      `submissionVerifierMissingTechnical=${submissionVerifier.summary.missingTechnicalPrerequisites}`,
      `receiptArchiveManifest=${receiptArchiveManifest.schemaVersion}`,
      `receiptArchiveReadyForArchive=${receiptArchiveManifest.summary.readyForArchive}`,
      `receiptArchiveReview=${receiptArchiveManifest.summary.reviewArchives}`,
      `receiptArchiveMissingReceipts=${receiptArchiveManifest.summary.missingReceipts}`,
      `receiptArchiveMissingInputs=${formatIdentityReceiptArchiveMissingInputCounts(receiptArchiveManifest.summary.missingArchiveInputCounts)}`,
      `receiptArchiveArtifactCompleteness=${formatIdentityReceiptArchiveArtifactCompletenessCounts(receiptArchiveManifest.summary.artifactCompletenessCounts)}`,
      `receiptArchiveHeaders=${receiptArchiveManifest.archivePolicy.archiveHeaders.join("|")}`,
      `institutionActionPlan=${institutionActionPlan.schemaVersion}`,
      `institutionActionPlanDigest=${institutionActionPlan.digest ?? "missing"}`,
      `institutionActionPlanBlockingLanes=${institutionActionPlan.summary.blockingLanes}`,
      `rotationFreshness=${rotationFreshness.status}`,
      `rotationExpired=${rotationFreshness.checks.filter((check) => check.status === "expired").map((check) => check.id).join("|") || "none"}`,
      `evidenceUrlHostBinding=${evidenceUrlHostBinding.status}`,
      `evidenceUrlHostBindingStale=${evidenceUrlHostBinding.staleDecisionIds.join("|") || "none"}`,
      `cutoverChecklist=${cutoverChecklist.status}`,
      `cutoverBlockers=${cutoverChecklist.summary.blockingItems}`,
      "redaction=owner-names-hashed|production-evidence-timestamps-hashed",
      "redaction=secret-values-excluded",
      "evidenceUrls=hashed"
    ],
    nextActions: Array.from(new Set([
      ...nextActions,
      ...institutionActionPlan.nextActions,
      ...receiptArchiveManifest.nextActions,
      ...rotationFreshness.nextActions,
      ...(evidenceUrlHostBinding.status === "ready"
        ? []
        : [`Renew institution identity evidence URLs for ${[...evidenceUrlHostBinding.staleDecisionIds, ...evidenceUrlHostBinding.missingDecisionIds].join(", ")} so accepted evidence hosts match the current allowlist.`])
    ]))
  };
  return {
    ...dossierCore,
    dossierDigestAlgorithm: "sha256",
    dossierDigestScope: "identity-production-evidence-dossier",
    dossierDigest: artifactSha256({
      ...dossierCore,
      dossierDigestAlgorithm: "sha256",
      dossierDigestScope: "identity-production-evidence-dossier"
    })
  };
}

function buildEnterpriseIdentityProductionEvidenceFromSnapshots(input: {
  teamId?: string;
  db: SenaEnterpriseDb;
  deployment: SenaEnterpriseOrganizationDeploymentPackage;
  audit: SenaEnterpriseCapabilityAudit;
}) {
  const authCapability = input.audit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
  const platformDecisionAcceptances = input.teamId
    ? (input.db.platformDecisionAcceptances ?? []).filter((acceptance) => acceptance.teamId === input.teamId)
    : input.db.platformDecisionAcceptances ?? [];
  const platformDecisionRegister = input.teamId
    ? buildEnterprisePlatformDecisionRegister(input.deployment.platformDecisions, platformDecisionAcceptances)
    : input.deployment.platformDecisionRegister;
  return buildEnterpriseIdentityProductionEvidenceDossier({
    teamId: input.teamId,
    db: input.db,
    platformDecisionRegister,
    platformDecisionAcceptances,
    authCapability,
    requireAuthCapabilityReady: !input.teamId
  });
}

export function getEnterpriseIdentityProductionEvidence(input: {
  teamId?: string;
  db?: SenaEnterpriseDb;
  snapshotSource?: SenaEnterpriseOpsStatusSnapshotSource;
} = {}): SenaEnterpriseIdentityProductionEvidence {
  const db = input.db ?? readEnterpriseDb();
  const snapshotSource = input.snapshotSource ?? "file-json";
  const auditIntegrity = verifyEnterpriseAuditIntegrityFromDb(db);
  const uploadStorageVerification = verifyEnterpriseUploadStorageFromDb(db);
  const uploadObjectStorageCustody = summarizeEnterpriseUploadObjectStorageCustodyFromDb(db, {
    source: snapshotSource
  });
  const opsStatus = getEnterpriseOpsStatus({
    db,
    snapshotSource,
    uploadStorageVerification,
    uploadObjectStorageCustody
  });
  const governance = getEnterpriseGovernanceStatus({
    db,
    opsStatus,
    auditIntegrity,
    uploadStorageVerification,
    uploadObjectStorageCustody
  });
  const readiness = getEnterpriseDeploymentReadiness({
    opsStatus,
    governance,
    uploadStorageVerification,
    uploadObjectStorageCustody
  });
  const deployment = getEnterpriseOrganizationDeploymentPackage({
    teamId: input.teamId,
    db,
    opsStatus,
    governance,
    readiness
  });
  const audit = getEnterpriseCapabilityAudit({
    teamId: input.teamId,
    db,
    opsStatus,
    governance,
    readiness,
    deployment
  });
  return buildEnterpriseIdentityProductionEvidenceFromSnapshots({
    teamId: input.teamId,
    db,
    deployment,
    audit
  });
}

export async function getEnterpriseIdentityProductionEvidenceWithPostgresEvidence(input: {
  teamId?: string;
  db?: SenaEnterpriseDb;
  opsStatus?: SenaEnterpriseOpsStatus;
  readiness?: SenaEnterpriseDeploymentReadiness;
  deployment?: SenaEnterpriseOrganizationDeploymentPackage;
  audit?: SenaEnterpriseCapabilityAudit;
} = {}): Promise<SenaEnterpriseIdentityProductionEvidence> {
  const db = input.db ?? (await readEnterpriseState()).db;
  const opsStatus = input.opsStatus ?? await getEnterpriseOpsStatusWithPostgresEvidence();
  const readiness = input.readiness ?? await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus });
  const deployment = input.deployment ?? await getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence({
    teamId: input.teamId,
    readiness,
    opsStatus,
    db
  });
  const audit = input.audit ?? await getEnterpriseCapabilityAuditWithPostgresEvidence({
    teamId: input.teamId,
    deployment,
    readiness,
    opsStatus,
    db
  });
  return buildEnterpriseIdentityProductionEvidenceFromSnapshots({
    teamId: input.teamId,
    db,
    deployment,
    audit
  });
}
