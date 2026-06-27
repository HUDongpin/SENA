import { createHash, randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { requireEnterprisePermission } from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  now,
  sha256Text
} from "./auth-config";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  buildEnterpriseIdentityProductionEvidenceDossier,
  type SenaEnterpriseIdentityProductionEvidence
} from "./identity-production-evidence";
import {
  buildEnterpriseIdentityPlatformDecisionRequestPacket,
  identityPlatformDecisionReceiptArchiveBodyPaths,
  identityPlatformDecisionReceiptArchivePolicy,
  identityPlatformDecisionResponseAuditHeaders,
  identityRequestPacketPolicyHash,
  type SenaEnterpriseIdentityPlatformDecisionRequestPacket
} from "./identity-request-packet";
import {
  buildEnterpriseIdentityCutoverChecklist,
  buildEnterpriseIdentitySubmissionVerifier,
  type SenaEnterpriseIdentityCutoverChecklist,
  type SenaEnterpriseIdentitySubmissionVerifier
} from "./identity-submission-gates";
import {
  buildEnterpriseIdentityEvidenceUrlHostBinding,
  type SenaEnterpriseIdentityEvidenceUrlHostBinding
} from "./identity-evidence-url-policy";
import {
  buildEnterpriseIdentityRotationFreshness,
  identityProductionDecisionIds,
  isIdentityProductionDecisionId,
  type SenaEnterpriseIdentityProductionDecisionId,
  type SenaEnterpriseIdentityRotationFreshness
} from "./identity-readiness";
import type { SenaEnterpriseIdentityInstitutionActionPlan } from "./identity-action-plan";
import {
  buildEnterpriseIdentityReceiptArchiveManifest,
  formatIdentityReceiptArchiveMissingInputCounts,
  identityReceiptArchiveArtifactCompletenessReady,
  identityReceiptArchiveDecisionAuditSummaries,
  latestReleaseGateIdentityReceiptArchiveArtifactCompleteness,
  latestReleaseGateIdentityReceiptArchiveEvidence,
  type SenaEnterpriseIdentityReceiptArchiveManifest
} from "./identity-receipt-archive";
import { appendAudit } from "./ops-audit";
import {
  getEnterpriseOrganizationDeploymentPackage,
  type SenaEnterpriseOrganizationDeploymentPackage
} from "./ops-deployment";
import {
  getEnterpriseDeploymentReadiness,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import { manageableTeamIds } from "./ops-governance";
import {
  buildEnterprisePlatformDecisionRegister,
  latestPlatformDecisionAcceptances,
  missingPlatformDecisionProductionEvidence,
  platformDecisionProductionEvidenceReceipt,
  type SenaEnterprisePlatformDecisionAcceptance,
  type SenaEnterprisePlatformDecisionRegister
} from "./ops-platform-decisions";
import {
  isSelfManagedEnterpriseMode,
  type SenaEnterprisePlatformDecisionEvidenceChecklistItem,
  type SenaEnterprisePlatformDecisionEvidenceChecklistStatus
} from "./ops-platform-decision-policy";
import {
  readEnterpriseDb,
  saveDb
} from "./state";

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export const enterpriseReleaseGateDecisions = [
  "approved",
  "blocked",
  "conditional"
] as const;

export function isEnterpriseReleaseGateDecision(status: string): status is SenaEnterpriseReleaseGateDecision {
  return (enterpriseReleaseGateDecisions as readonly string[]).includes(status);
}

export function isEnterpriseReleaseVerificationStatus(status: string): status is SenaEnterpriseReleaseVerificationStatus {
  return status === "passed" || status === "failed" || status === "not-run";
}

export function summarizeReleaseGateReviews(
  reviews: SenaEnterpriseReleaseGateReview[]
): SenaEnterpriseReleaseGateReviewList["summary"] {
  return {
    total: reviews.length,
    approved: reviews.filter((review) => review.decision === "approved").length,
    conditional: reviews.filter((review) => review.decision === "conditional").length,
    blocked: reviews.filter((review) => review.decision === "blocked").length,
    latestStatus: reviews[0]?.decision
  };
}

export function buildEnterpriseDeploymentReleaseGateEvidence(
  reviews: SenaEnterpriseReleaseGateReview[]
): SenaEnterpriseOrganizationDeploymentPackage["releaseGate"] {
  const sortedReviews = [...reviews].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const latestReview = sortedReviews[0];
  const latestIdentityRequestPacketEvidence = (sourceKey: string, targetKey: string) => {
    const evidence = latestReview?.identityProductionSnapshot?.platformRequestPacket.evidence
      .find((item) => item.startsWith(`${sourceKey}=`));
    return evidence ? `${targetKey}=${evidence.slice(sourceKey.length + 1)}` : null;
  };
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReviews,
    generatedAt: now(),
    summary: summarizeReleaseGateReviews(sortedReviews),
    latestReview: latestReview ? {
      schemaVersion: latestReview.schemaVersion,
      id: latestReview.id,
      teamId: latestReview.teamId,
      environment: latestReview.environment,
      releaseVersion: latestReview.releaseVersion,
      decision: latestReview.decision,
      verificationCommand: latestReview.verificationCommand,
      verificationEvidence: latestReview.verificationEvidence,
      readinessSnapshot: latestReview.readinessSnapshot,
      platformDecisionSnapshot: latestReview.platformDecisionSnapshot,
      identityProductionSnapshot: latestReview.identityProductionSnapshot,
      approverRole: latestReview.approverRole,
      updatedAt: latestReview.updatedAt
    } : undefined,
    evidence: [
      "schema=sena-enterprise-release-gate-reviews/v1",
      `latestReview=${latestReview ? latestReview.schemaVersion : "missing"}`,
      `releaseGateReviews=${sortedReviews.length}`,
      `latestStatus=${latestReview?.decision ?? "missing"}`,
      `latestVerificationStatus=${latestReview?.verificationEvidence.status ?? "missing"}`,
      `latestVerificationOutputSha256=${latestReview?.verificationEvidence.outputSha256 ? "present" : "missing"}`,
      `latestReadinessBlocking=${latestReview?.readinessSnapshot.blockingReview ?? "missing"}`,
      `latestPlatformDecisionBlocking=${latestReview?.platformDecisionSnapshot.productionBlocking ?? "missing"}`,
      `latestIdentityProductionStatus=${latestReview?.identityProductionSnapshot?.status ?? "missing"}`,
      `latestIdentityVerifierIncomplete=${latestReview?.identityProductionSnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestIdentityVerifierMissing=${latestReview?.identityProductionSnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestIdentityVerifierMissingTechnical=${latestReview?.identityProductionSnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestIdentityRotationFreshness=${latestReview?.identityProductionSnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestIdentityCutoverChecklist=${latestReview?.identityProductionSnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestIdentityCutoverBlockers=${latestReview?.identityProductionSnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      `latestIdentityProductionEvidenceDigest=${latestReview?.identityProductionSnapshot?.dossierDigest ?? "missing"}`,
      `latestIdentityEvidenceBindingDigest=${latestReview?.identityProductionSnapshot?.evidenceBindingDigest ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReview?.identityProductionSnapshot, "latestIdentity"),
      latestIdentityRequestPacketEvidence("requestPacketPolicyHash", "latestIdentityRequestPacketPolicyHash"),
      latestIdentityRequestPacketEvidence("requestPacketPolicyBinding", "latestIdentityRequestPacketPolicyBinding"),
      `latestIdentityEvidenceHostBinding=${latestReview?.identityProductionSnapshot?.evidenceUrlHostBinding.status ?? "missing"}`
    ].filter((evidence): evidence is string => Boolean(evidence))
  };
}

function normalizeReleaseVerificationEvidence(
  input: Partial<SenaEnterpriseReleaseVerificationEvidence> | SenaEnterpriseReleaseGateReviewInput["verificationEvidence"] | undefined,
  command: string,
  recordedAt: string,
  fallbackSummary: string
): SenaEnterpriseReleaseVerificationEvidence {
  const rawStatus = input?.status ?? "not-run";
  if (!isEnterpriseReleaseVerificationStatus(rawStatus)) {
    throw new SenaEnterpriseError("Release verification status is not recognized.", 400, "invalid_release_verification_status");
  }
  const summary = input?.summary?.trim() || fallbackSummary;
  const outputSha256 = input?.outputSha256?.trim().toLowerCase() || createHash("sha256").update([
    command,
    rawStatus,
    summary,
    recordedAt
  ].join("\n")).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(outputSha256)) {
    throw new SenaEnterpriseError("Release verification outputSha256 must be a 64-character SHA-256 hex digest.", 400, "invalid_release_verification_hash");
  }
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence,
    command,
    status: rawStatus,
    summary: summary.slice(0, 2000),
    outputSha256,
    hashAlgorithm: "sha256",
    recordedAt
  };
}

function enterpriseReleaseGatePlatformDecisionSnapshot(register: SenaEnterprisePlatformDecisionRegister): SenaEnterpriseReleaseGateReview["platformDecisionSnapshot"] {
  const productionBlockingDecisions = register.decisions.filter((decision) => {
    const missingProductionEvidence = missingPlatformDecisionProductionEvidence(decision);
    return decision.productionBlocking && (
      decision.status === "open" ||
      !decision.acceptedBridge ||
      missingProductionEvidence.length > 0
    );
  });
  return {
    schemaVersion: register.schemaVersion,
    generatedAt: register.generatedAt,
    productionBlocking: register.summary.productionBlocking,
    open: register.summary.open,
    acceptedBridge: register.summary.acceptedBridge,
    productionBlockingDecisionIds: productionBlockingDecisions.map((decision) => decision.id),
    missingProductionEvidence: productionBlockingDecisions.flatMap((decision) =>
      missingPlatformDecisionProductionEvidence(decision).map((item) => ({
        decisionId: decision.id,
        evidenceId: item.id,
        label: item.label,
        status: item.status,
        source: item.source,
        nextAction: item.nextAction
      }))
    )
  };
}

export function enterpriseReleaseGateIdentityProductionSnapshot(input: {
  generatedAt: string;
  teamId?: string;
  platformDecisionRegister: SenaEnterprisePlatformDecisionRegister;
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
}): SenaEnterpriseReleaseGateReview["identityProductionSnapshot"] {
  const latestIdentityAcceptances = latestPlatformDecisionAcceptances(input.platformDecisionAcceptances
    .filter((acceptance) => isIdentityProductionDecisionId(acceptance.decisionId)));
  const decisions: SenaEnterpriseIdentityProductionEvidence["decisions"] = input.platformDecisionRegister.decisions
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
  const acceptanceReceipts: SenaEnterpriseIdentityProductionEvidence["acceptanceReceipts"] = identityProductionDecisionIds
    .flatMap((decisionId) => {
      const acceptance = latestIdentityAcceptances.get(decisionId);
      if (!acceptance) return [];
      const productionEvidenceReceipt = platformDecisionProductionEvidenceReceipt(acceptance) ?? acceptance.productionEvidenceReceipt;
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
  const missingEvidenceIds = Array.from(new Set(requirements
    .filter((requirement) => requirement.productionRequired && requirement.status === "missing")
    .map((requirement) => requirement.id)));
  const productionBlockingDecisionIds = identityProductionDecisionIds.filter((decisionId) => {
    const decision = input.platformDecisionRegister.decisions.find((candidate) => candidate.id === decisionId);
    if (!decision) return true;
    return decision.productionBlocking && (
      decision.status === "open" ||
      !decision.acceptedBridge ||
      missingPlatformDecisionProductionEvidence(decision).length > 0
    );
  });
  const submissionVerifier = buildEnterpriseIdentitySubmissionVerifier({
    generatedAt: input.generatedAt,
    requirements,
    acceptanceReceipts,
    requestPacketPolicyHash: identityRequestPacketPolicyHash()
  });
  const platformRequestPacket = buildEnterpriseIdentityPlatformDecisionRequestPacket({
    teamId: input.teamId,
    generatedAt: input.generatedAt,
    decisions,
    requirements,
    acceptanceReceipts
  });
  const cutoverChecklist = buildEnterpriseIdentityCutoverChecklist({
    generatedAt: input.generatedAt,
    requirements,
    acceptanceReceipts
  });
  const rotationFreshness = buildEnterpriseIdentityRotationFreshness(latestIdentityAcceptances, input.generatedAt);
  const evidenceUrlHostBinding = buildEnterpriseIdentityEvidenceUrlHostBinding(latestIdentityAcceptances);
  const receiptArchiveManifest = buildEnterpriseIdentityReceiptArchiveManifest({
    generatedAt: input.generatedAt,
    acceptanceReceipts,
    receiptArchivePolicy: identityPlatformDecisionReceiptArchivePolicy,
    responseAuditHeaders: identityPlatformDecisionResponseAuditHeaders,
    receiptArchiveBodyPaths: identityPlatformDecisionReceiptArchiveBodyPaths,
    selfManagedEnterpriseMode: isSelfManagedEnterpriseMode()
  });
  const receiptArchiveArtifactCompletenessReady = identityReceiptArchiveArtifactCompletenessReady(
    receiptArchiveManifest.summary.artifactCompletenessCounts
  );
  const identityProductionDossier = buildEnterpriseIdentityProductionEvidenceDossier({
    generatedAt: input.generatedAt,
    teamId: input.teamId,
    platformDecisionRegister: input.platformDecisionRegister,
    platformDecisionAcceptances: input.platformDecisionAcceptances
  });
  const releaseGateBlocked = productionBlockingDecisionIds.length > 0 ||
    submissionVerifier.summary.incompleteDecisions > 0 ||
    submissionVerifier.summary.missingProductionEvidence > 0 ||
    submissionVerifier.summary.missingTechnicalPrerequisites > 0 ||
    cutoverChecklist.status !== "ready" ||
    rotationFreshness.status !== "ready" ||
    evidenceUrlHostBinding.status !== "ready" ||
    !receiptArchiveArtifactCompletenessReady ||
    receiptArchiveManifest.summary.readyForArchive !== identityProductionDecisionIds.length ||
    receiptArchiveManifest.summary.reviewArchives > 0 ||
    receiptArchiveManifest.summary.missingReceipts > 0;
  const status: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"] = releaseGateBlocked ? "review" : "ready";
  const snapshotCore: Omit<
    SenaEnterpriseReleaseGateReview["identityProductionSnapshot"],
    "dossierDigestAlgorithm" | "dossierDigestScope" | "dossierDigest"
  > = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
    generatedAt: input.generatedAt,
    status,
    evidenceBindingDigestAlgorithm: identityProductionDossier.evidenceBindingDigestAlgorithm,
    evidenceBindingDigestScope: identityProductionDossier.evidenceBindingDigestScope,
    evidenceBindingDigest: identityProductionDossier.evidenceBindingDigest,
    capabilityStatus: status,
    missingEvidenceIds,
    submissionVerifier: {
      schemaVersion: submissionVerifier.schemaVersion,
      verifiedDecisions: submissionVerifier.summary.verifiedDecisions,
      incompleteDecisions: submissionVerifier.summary.incompleteDecisions,
      missingProductionEvidence: submissionVerifier.summary.missingProductionEvidence,
      missingTechnicalPrerequisites: submissionVerifier.summary.missingTechnicalPrerequisites
    },
    rotationFreshness: {
      schemaVersion: rotationFreshness.schemaVersion,
      status: rotationFreshness.status,
      expiredEvidenceIds: rotationFreshness.checks
        .filter((check) => check.status === "expired")
        .map((check) => check.id),
      dueSoonEvidenceIds: rotationFreshness.checks
        .filter((check) => check.status === "due-soon")
        .map((check) => check.id)
    },
    platformRequestPacket: {
      schemaVersion: platformRequestPacket.schemaVersion,
      blockingRequests: platformRequestPacket.summary.blockingRequests,
      missingProductionEvidence: platformRequestPacket.summary.missingProductionEvidence,
      missingTechnicalPrerequisites: platformRequestPacket.summary.missingTechnicalPrerequisites,
      receiptReviewRequests: platformRequestPacket.summary.receiptReviewRequests,
      evidence: platformRequestPacket.evidence
    },
    evidenceUrlHostBinding,
    cutoverChecklist,
    receiptArchiveManifest: {
      schemaVersion: receiptArchiveManifest.schemaVersion,
      archiveManifestDigestAlgorithm: receiptArchiveManifest.archiveManifestDigestAlgorithm,
      archiveManifestDigestScope: receiptArchiveManifest.archiveManifestDigestScope,
      archiveManifestDigest: receiptArchiveManifest.archiveManifestDigest,
      summary: receiptArchiveManifest.summary,
      decisions: receiptArchiveManifest.decisions.map((decision) => ({
        decisionId: decision.decisionId,
        archiveStatus: decision.archiveStatus,
        ...(decision.receiptVerifierStatus ? { receiptVerifierStatus: decision.receiptVerifierStatus } : {}),
        digestHeader: decision.digestHeader,
        ...(decision.receiptAuditDigest ? { receiptAuditDigest: decision.receiptAuditDigest } : {}),
        ...(decision.receiptAuditDigestScope ? { receiptAuditDigestScope: decision.receiptAuditDigestScope } : {}),
        stableSubmissionDigestHeader: decision.stableSubmissionDigestHeader,
        ...(decision.submittedEvidenceDigest ? { submittedEvidenceDigest: decision.submittedEvidenceDigest } : {}),
        ...(decision.submittedEvidenceDigestScope ? { submittedEvidenceDigestScope: decision.submittedEvidenceDigestScope } : {}),
        ...(decision.productionEvidenceArtifactDigestAlgorithm ? {
          productionEvidenceArtifactDigestAlgorithm: decision.productionEvidenceArtifactDigestAlgorithm
        } : {}),
        ...(decision.productionEvidenceArtifactDigestScope ? {
          productionEvidenceArtifactDigestScope: decision.productionEvidenceArtifactDigestScope
        } : {}),
        ...(decision.productionEvidenceArtifactDigest ? {
          productionEvidenceArtifactDigest: decision.productionEvidenceArtifactDigest
        } : {}),
        ...(decision.productionEvidenceArtifactDigestCoveredEvidenceIds ? {
          productionEvidenceArtifactDigestCoveredEvidenceIds: decision.productionEvidenceArtifactDigestCoveredEvidenceIds
        } : {}),
        ...(decision.productionEvidenceArtifactDigestCoverageStatus ? {
          productionEvidenceArtifactDigestCoverageStatus: decision.productionEvidenceArtifactDigestCoverageStatus
        } : {}),
        ...(decision.productionEvidenceArtifactDigestCompletenessStatus ? {
          productionEvidenceArtifactDigestCompletenessStatus: decision.productionEvidenceArtifactDigestCompletenessStatus
        } : {}),
        missingArchiveInputs: decision.missingArchiveInputs,
        ...(decision.requestPacketPolicyBindingStatus ? { requestPacketPolicyBindingStatus: decision.requestPacketPolicyBindingStatus } : {}),
        ...(decision.technicalBindingStatus ? { technicalBindingStatus: decision.technicalBindingStatus } : {}),
        ...(decision.technicalReadinessStatus ? { technicalReadinessStatus: decision.technicalReadinessStatus } : {}),
        ...(decision.evidenceUrlHostBindingStatus ? { evidenceUrlHostBindingStatus: decision.evidenceUrlHostBindingStatus } : {}),
        ...(decision.rotationFreshnessStatus ? { rotationFreshnessStatus: decision.rotationFreshnessStatus } : {})
      }))
    },
    institutionActionPlan: identityProductionDossier.institutionActionPlan,
    releaseGateBlocked
  };
  return {
    ...snapshotCore,
    dossierDigestAlgorithm: identityProductionDossier.dossierDigestAlgorithm,
    dossierDigestScope: identityProductionDossier.dossierDigestScope,
    dossierDigest: identityProductionDossier.dossierDigest
  };
}

export function createEnterpriseReleaseGateReview(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseReleaseGateReviewInput
): SenaEnterpriseReleaseGateReview {
  if (!isEnterpriseReleaseGateDecision(input.decision)) {
    throw new SenaEnterpriseError("Release gate decision is not recognized.", 400, "invalid_release_gate_decision");
  }
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const readiness = getEnterpriseDeploymentReadiness();
  const deployment = getEnterpriseOrganizationDeploymentPackage();
  const teamPlatformDecisionAcceptances = (db.platformDecisionAcceptances ?? [])
    .filter((acceptance) => acceptance.teamId === input.teamId);
  const teamPlatformDecisionRegister = buildEnterprisePlatformDecisionRegister(
    deployment.platformDecisions,
    teamPlatformDecisionAcceptances
  );
  const verificationCommand = requiredReleaseGateText(input.verificationCommand, "verificationCommand");
  if (!readiness.runbook.verificationCommands.includes(verificationCommand)) {
    throw new SenaEnterpriseError("Release gate verification command must match the deployment readiness runbook.", 400, "release_gate_verification_command_required");
  }

  const timestamp = now();
  const identityProductionSnapshot = enterpriseReleaseGateIdentityProductionSnapshot({
    generatedAt: timestamp,
    teamId: input.teamId,
    platformDecisionRegister: teamPlatformDecisionRegister,
    platformDecisionAcceptances: teamPlatformDecisionAcceptances
  });
  const identityProductionSnapshotRequestPacketEvidence = (sourceKey: string) => identityProductionSnapshot.platformRequestPacket.evidence
    .find((item) => item.startsWith(`${sourceKey}=`))
    ?.slice(sourceKey.length + 1);
  const verificationEvidence = normalizeReleaseVerificationEvidence(
    input.verificationEvidence,
    verificationCommand,
    timestamp,
    "Release gate reviewer did not attach verification output evidence."
  );
  if (input.decision === "approved") {
    const approvalBlockers = [
      verificationEvidence.status === "passed" ? null : "release-verification-passed-required",
      readiness.summary.blockingReview === 0 ? null : "deployment-readiness-blocking-review",
      teamPlatformDecisionRegister.summary.productionBlocking === 0 ? null : "team-scoped platform decisions production blockers",
      identityProductionSnapshot.status === "ready" && !identityProductionSnapshot.releaseGateBlocked ? null : "team-scoped identity-production-evidence-required",
      identityProductionSnapshot.submissionVerifier.incompleteDecisions === 0 ? null : "team-scoped identity-submission-verifier-complete-required",
      identityProductionSnapshot.submissionVerifier.missingProductionEvidence === 0 ? null : "team-scoped identity-submission-verifier-evidence-required",
      identityProductionSnapshot.submissionVerifier.missingTechnicalPrerequisites === 0 ? null : "team-scoped identity-submission-verifier-technical-prerequisites-required",
      identityProductionSnapshot.cutoverChecklist.status === "ready" ? null : "team-scoped identity-cutover-checklist-required",
      identityProductionSnapshot.rotationFreshness.status === "ready" ? null : "team-scoped identity-rotation-freshness-required",
      identityProductionSnapshot.evidenceUrlHostBinding.status === "ready" ? null : "team-scoped identity-evidence-host-binding-required",
      identityReceiptArchiveArtifactCompletenessReady(identityProductionSnapshot.receiptArchiveManifest.summary.artifactCompletenessCounts)
        ? null
        : "team-scoped identity-production-evidence-artifact-completeness-required",
      identityProductionSnapshot.receiptArchiveManifest.summary.readyForArchive === identityProductionDecisionIds.length &&
        identityProductionSnapshot.receiptArchiveManifest.summary.reviewArchives === 0 &&
        identityProductionSnapshot.receiptArchiveManifest.summary.missingReceipts === 0
        ? null
        : "team-scoped identity-receipt-archive-ready-required"
    ].filter((blocker): blocker is string => Boolean(blocker));
    if (approvalBlockers.length > 0) {
      throw new SenaEnterpriseError(
        `Release gate approval requires zero production blockers and passed verification: ${approvalBlockers.join(", ")}.`,
        409,
        "release_gate_approval_blocked"
      );
    }
  }
  const review: SenaEnterpriseReleaseGateReview = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview,
    id: id("release-gate"),
    teamId: input.teamId,
    environment: requiredReleaseGateText(input.environment, "environment"),
    releaseVersion: requiredReleaseGateText(input.releaseVersion, "releaseVersion"),
    decision: input.decision,
    status: input.decision,
    approverName: requiredReleaseGateText(input.approverName, "approverName"),
    approverRole: requiredReleaseGateText(input.approverRole, "approverRole"),
    notes: requiredReleaseGateText(input.notes, "notes"),
    verificationCommand,
    verificationEvidence,
    readinessSnapshot: {
      schemaVersion: readiness.schemaVersion,
      generatedAt: readiness.generatedAt,
      status: readiness.status,
      blockingReview: readiness.summary.blockingReview,
      advisoryReview: readiness.summary.advisoryReview,
      blockers: readiness.summary.blockers
    },
    platformDecisionSnapshot: enterpriseReleaseGatePlatformDecisionSnapshot(teamPlatformDecisionRegister),
    identityProductionSnapshot,
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.releaseGateReviews.unshift(review);
  db.releaseGateReviews = db.releaseGateReviews.slice(0, 1000);
  appendAudit(db, {
    event: "ops.release_gate.review",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      releaseGateReviewId: review.id,
      decision: review.decision,
      environment: review.environment,
      releaseVersion: review.releaseVersion,
      verificationCommand: review.verificationCommand,
      verificationStatus: review.verificationEvidence.status,
      verificationEvidenceSha256: review.verificationEvidence.outputSha256,
      blockingReview: review.readinessSnapshot.blockingReview,
      advisoryReview: review.readinessSnapshot.advisoryReview,
      productionBlocking: review.platformDecisionSnapshot.productionBlocking,
      acceptedBridge: review.platformDecisionSnapshot.acceptedBridge,
      identityProductionStatus: review.identityProductionSnapshot.status,
      identityProductionMissingEvidence: review.identityProductionSnapshot.missingEvidenceIds.length,
      identitySubmissionVerifierIncomplete: review.identityProductionSnapshot.submissionVerifier.incompleteDecisions,
      identitySubmissionVerifierMissing: review.identityProductionSnapshot.submissionVerifier.missingProductionEvidence,
      identitySubmissionVerifierMissingTechnical: review.identityProductionSnapshot.submissionVerifier.missingTechnicalPrerequisites,
      identityRotationFreshness: review.identityProductionSnapshot.rotationFreshness.status,
      identityProductionEvidenceDigest: review.identityProductionSnapshot.dossierDigest ?? "missing",
      identityEvidenceBindingDigest: review.identityProductionSnapshot.evidenceBindingDigest ?? "missing",
      identityReceiptArchiveManifestDigest: review.identityProductionSnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing",
      identityReceiptArchiveReadyForArchive: review.identityProductionSnapshot.receiptArchiveManifest.summary.readyForArchive,
      identityReceiptArchiveReview: review.identityProductionSnapshot.receiptArchiveManifest.summary.reviewArchives,
      identityReceiptArchiveMissingReceipts: review.identityProductionSnapshot.receiptArchiveManifest.summary.missingReceipts,
      identityReceiptArchiveMissingInputs: formatIdentityReceiptArchiveMissingInputCounts(review.identityProductionSnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts),
      identityReceiptArchiveArtifactCompleteness: latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(review.identityProductionSnapshot),
      identityReceiptArchiveDecisions: JSON.stringify(identityReceiptArchiveDecisionAuditSummaries(review.identityProductionSnapshot)),
      identityRequestPacketPolicyHash: identityProductionSnapshotRequestPacketEvidence("requestPacketPolicyHash") ?? "missing",
      identityRequestPacketPolicyBinding: identityProductionSnapshotRequestPacketEvidence("requestPacketPolicyBinding") ?? "missing",
      identityEvidenceUrlHostBinding: review.identityProductionSnapshot.evidenceUrlHostBinding.status,
      identityEvidenceAllowedHostConfig: review.identityProductionSnapshot.evidenceUrlHostBinding.allowedHostConfigStatus,
      identityEvidenceAllowedHosts: review.identityProductionSnapshot.evidenceUrlHostBinding.allowedHostCount,
      identityEvidenceInvalidAllowedHosts: review.identityProductionSnapshot.evidenceUrlHostBinding.invalidAllowedHostCount
    }
  });
  saveDb(db);
  return review;
}

export function listEnterpriseReleaseGateReviews(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterpriseReleaseGateReviewList {
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for release gate reviews.", 403, "release_gate_permission_denied");
  }
  const teamIdSet = new Set(teamIds);
  const reviews = (readEnterpriseDb().releaseGateReviews ?? [])
    .filter((review) => teamIdSet.has(review.teamId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReviews,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamId: input.teamId
    },
    summary: summarizeReleaseGateReviews(reviews),
    reviews
  };
}

function requiredReleaseGateText(value: string | undefined, field: string) {
  const text = value?.trim();
  if (!text) {
    throw new SenaEnterpriseError(`${field} is required for release gate review.`, 400, "release_gate_review_required");
  }
  return text;
}

export type SenaEnterpriseReleaseGateDecision = "approved" | "blocked" | "conditional";
export type SenaEnterpriseReleaseVerificationStatus = "passed" | "failed" | "not-run";

export type SenaEnterpriseReleaseVerificationEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence;
  command: string;
  status: SenaEnterpriseReleaseVerificationStatus;
  summary: string;
  outputSha256: string;
  hashAlgorithm: "sha256";
  recordedAt: string;
};

export type SenaEnterpriseReleaseGateReview = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview;
  id: string;
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseReleaseGateDecision;
  status: SenaEnterpriseReleaseGateDecision;
  approverName: string;
  approverRole: string;
  notes: string;
  verificationCommand: string;
  verificationEvidence: SenaEnterpriseReleaseVerificationEvidence;
  readinessSnapshot: {
    schemaVersion: SenaEnterpriseDeploymentReadiness["schemaVersion"];
    generatedAt: string;
    status: SenaEnterpriseDeploymentReadiness["status"];
    blockingReview: number;
    advisoryReview: number;
    blockers: string[];
  };
  platformDecisionSnapshot: {
    schemaVersion: SenaEnterprisePlatformDecisionRegister["schemaVersion"];
    generatedAt: string;
    productionBlocking: number;
    open: number;
    acceptedBridge: number;
    productionBlockingDecisionIds: string[];
    missingProductionEvidence: Array<{
      decisionId: string;
      evidenceId: string;
      label: string;
      status: SenaEnterprisePlatformDecisionEvidenceChecklistStatus;
      source: SenaEnterprisePlatformDecisionEvidenceChecklistItem["source"];
      nextAction: string;
    }>;
  };
  identityProductionSnapshot: {
    schemaVersion: SenaEnterpriseIdentityProductionEvidence["schemaVersion"];
    generatedAt: string;
    status: SenaEnterpriseIdentityProductionEvidence["status"];
    dossierDigestAlgorithm?: "sha256";
    dossierDigestScope?: "identity-production-evidence-dossier";
    dossierDigest?: string;
    evidenceBindingDigestAlgorithm?: "sha256";
    evidenceBindingDigestScope?: "identity-production-evidence-binding";
    evidenceBindingDigest?: string;
    capabilityStatus: SenaEnterpriseIdentityProductionEvidence["capability"]["status"];
    missingEvidenceIds: string[];
    submissionVerifier: {
      schemaVersion: SenaEnterpriseIdentitySubmissionVerifier["schemaVersion"];
      verifiedDecisions: number;
      incompleteDecisions: number;
      missingProductionEvidence: number;
      missingTechnicalPrerequisites: number;
    };
    rotationFreshness: {
      schemaVersion: SenaEnterpriseIdentityRotationFreshness["schemaVersion"];
      status: SenaEnterpriseIdentityRotationFreshness["status"];
      expiredEvidenceIds: string[];
      dueSoonEvidenceIds: string[];
    };
    platformRequestPacket: {
      schemaVersion: SenaEnterpriseIdentityPlatformDecisionRequestPacket["schemaVersion"];
      blockingRequests: number;
      missingProductionEvidence: number;
      missingTechnicalPrerequisites: number;
      receiptReviewRequests: number;
      evidence: string[];
    };
    evidenceUrlHostBinding: SenaEnterpriseIdentityEvidenceUrlHostBinding;
    cutoverChecklist: SenaEnterpriseIdentityCutoverChecklist;
    receiptArchiveManifest: {
      schemaVersion: SenaEnterpriseIdentityReceiptArchiveManifest["schemaVersion"];
      archiveManifestDigestAlgorithm?: "sha256";
      archiveManifestDigestScope?: "identity-receipt-archive-manifest";
      archiveManifestDigest?: string;
      summary: SenaEnterpriseIdentityReceiptArchiveManifest["summary"];
      decisions: Array<Pick<
        SenaEnterpriseIdentityReceiptArchiveManifest["decisions"][number],
        "decisionId" |
        "archiveStatus" |
        "receiptVerifierStatus" |
        "digestHeader" |
        "receiptAuditDigest" |
        "receiptAuditDigestScope" |
        "stableSubmissionDigestHeader" |
        "submittedEvidenceDigest" |
        "submittedEvidenceDigestScope" |
        "productionEvidenceArtifactDigestAlgorithm" |
        "productionEvidenceArtifactDigestScope" |
        "productionEvidenceArtifactDigest" |
        "productionEvidenceArtifactDigestCoveredEvidenceIds" |
        "productionEvidenceArtifactDigestCoverageStatus" |
        "productionEvidenceArtifactDigestCompletenessStatus" |
        "missingArchiveInputs" |
        "requestPacketPolicyBindingStatus" |
        "technicalBindingStatus" |
        "technicalReadinessStatus" |
        "evidenceUrlHostBindingStatus" |
        "rotationFreshnessStatus"
      >>;
    };
    institutionActionPlan: SenaEnterpriseIdentityInstitutionActionPlan;
    releaseGateBlocked: boolean;
  };
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseReleaseGateReviewInput = {
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseReleaseGateDecision;
  approverName: string;
  approverRole: string;
  notes: string;
  verificationCommand: string;
  verificationEvidence?: {
    status?: SenaEnterpriseReleaseVerificationStatus;
    summary?: string;
    outputSha256?: string;
  };
};

export type SenaEnterpriseReleaseGateReviewList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReviews;
  generatedAt: string;
  scope: {
    mode: "managed-teams" | "selected-team";
    teamId?: string;
  };
  summary: {
    total: number;
    approved: number;
    conditional: number;
    blocked: number;
    latestStatus?: SenaEnterpriseReleaseGateDecision;
  };
  reviews: SenaEnterpriseReleaseGateReview[];
};
