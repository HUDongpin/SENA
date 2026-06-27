import { randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { requireEnterprisePermission } from "./access-control";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import type {
  SenaEnterpriseIdentityProductionEvidence
} from "./identity-production-evidence";
import {
  formatIdentityReceiptArchiveMissingInputCounts,
  identityReceiptArchiveDecisionAuditSummaries,
  latestReleaseGateIdentityReceiptArchiveArtifactCompleteness
} from "./identity-receipt-archive";
import { appendAudit } from "./ops-audit";
import {
  getEnterpriseOrganizationDeploymentPackage
} from "./ops-deployment";
import {
  getEnterpriseGoLiveRehearsal,
  type SenaEnterpriseGoLiveRehearsal
} from "./ops-go-live";
import type {
  SenaEnterpriseReleaseGateDecision,
  SenaEnterpriseReleaseGateReview,
  SenaEnterpriseReleaseVerificationEvidence
} from "./ops-release-gate";
import {
  readEnterpriseDb,
  writeEnterpriseDb
} from "./state";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function requiredReleaseGateText(value: string | undefined, field: string) {
  const text = value?.trim();
  if (!text) {
    throw new SenaEnterpriseError(`${field} is required for release gate review.`, 400, "release_gate_review_required");
  }
  return text;
}

export type SenaEnterpriseGoLiveChecklist = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveChecklist;
  rehearsalReviewed: boolean;
  releaseGateDraftReviewed: boolean;
  verificationEvidenceReviewed: boolean;
  rollbackOwnerConfirmed: boolean;
  platformOwnerDecisionReviewed: boolean;
  passed: boolean;
  missing: string[];
};

export type SenaEnterpriseGoLiveAttestationDecision = "approved" | "conditional" | "blocked";

export type SenaEnterpriseGoLiveAttestation = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestation;
  id: string;
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseGoLiveAttestationDecision;
  status: SenaEnterpriseGoLiveAttestationDecision;
  attesterName: string;
  attesterRole: string;
  notes: string;
  checklist: SenaEnterpriseGoLiveChecklist;
  goLiveRehearsalSnapshot: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal;
    generatedAt: string;
    status: SenaEnterpriseGoLiveRehearsal["status"];
    blockers: string[];
  };
  releaseGateDraftSnapshot: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft;
    decision: SenaEnterpriseReleaseGateDecision;
    verificationStatus: SenaEnterpriseReleaseVerificationEvidence["status"];
  };
  identityProductionHandoffSnapshot: SenaEnterpriseIdentityProductionEvidence;
  latestReleaseGateSnapshot?: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview;
    id: string;
    decision: SenaEnterpriseReleaseGateDecision;
    verificationStatus: SenaEnterpriseReleaseVerificationEvidence["status"];
    identityProductionStatus?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["status"];
    identityProductionEvidenceDigest?: string;
    identityReceiptArchiveManifestDigest?: string;
    identityReceiptArchiveReadyForArchive?: number;
    identityReceiptArchiveReview?: number;
    identityReceiptArchiveMissingReceipts?: number;
    identityReceiptArchiveMissingInputs?: string;
    identityReceiptArchiveArtifactCompleteness?: string;
    identityReceiptArchiveDecisions?: Array<Pick<
      SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["receiptArchiveManifest"]["decisions"][number],
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
      "missingArchiveInputs"
    >>;
    identityReleaseGateBlocked?: boolean;
    identitySubmissionVerifierIncomplete?: number;
    identitySubmissionVerifierMissing?: number;
    identitySubmissionVerifierMissingTechnical?: number;
    identityRotationFreshness?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["rotationFreshness"]["status"];
    identityEvidenceUrlHostBinding?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["status"];
    identityEvidenceAllowedHostConfig?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["evidenceUrlHostBinding"]["allowedHostConfigStatus"];
    identityEvidenceAllowedHosts?: number;
    identityEvidenceInvalidAllowedHosts?: number;
    identityCutoverChecklistStatus?: SenaEnterpriseReleaseGateReview["identityProductionSnapshot"]["cutoverChecklist"]["status"];
    identityCutoverChecklistBlockingItems?: number;
  };
  evidence: string[];
  createdByUserId: string;
  createdAt: string;
};

export type SenaEnterpriseGoLiveAttestationInput = {
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: SenaEnterpriseGoLiveAttestationDecision;
  attesterName: string;
  attesterRole: string;
  notes: string;
  checklist: Pick<SenaEnterpriseGoLiveChecklist,
    "rehearsalReviewed" |
    "releaseGateDraftReviewed" |
    "verificationEvidenceReviewed" |
    "rollbackOwnerConfirmed" |
    "platformOwnerDecisionReviewed"
  >;
};

export type SenaEnterpriseGoLiveAttestationList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestations;
  generatedAt: string;
  scope: {
    mode: "selected-team" | "managed-teams";
    teamId?: string;
  };
  summary: {
    total: number;
    approved: number;
    conditional: number;
    blocked: number;
  };
  attestations: SenaEnterpriseGoLiveAttestation[];
};

const enterpriseGoLiveAttestationDecisions = [
  "approved",
  "blocked",
  "conditional"
] as const;

function normalizeGoLiveChecklist(input: SenaEnterpriseGoLiveAttestationInput["checklist"]): SenaEnterpriseGoLiveChecklist {
  const checks = {
    rehearsalReviewed: Boolean(input.rehearsalReviewed),
    releaseGateDraftReviewed: Boolean(input.releaseGateDraftReviewed),
    verificationEvidenceReviewed: Boolean(input.verificationEvidenceReviewed),
    rollbackOwnerConfirmed: Boolean(input.rollbackOwnerConfirmed),
    platformOwnerDecisionReviewed: Boolean(input.platformOwnerDecisionReviewed)
  };
  const labels: Record<keyof typeof checks, string> = {
    rehearsalReviewed: "rehearsal-reviewed",
    releaseGateDraftReviewed: "release-gate-draft-reviewed",
    verificationEvidenceReviewed: "verification-evidence-reviewed",
    rollbackOwnerConfirmed: "rollback-owner-confirmed",
    platformOwnerDecisionReviewed: "platform-owner-decision-reviewed"
  };
  const missing = (Object.keys(checks) as Array<keyof typeof checks>)
    .filter((key) => !checks[key])
    .map((key) => labels[key]);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveChecklist,
    ...checks,
    passed: missing.length === 0,
    missing
  };
}

function summarizeGoLiveAttestations(attestations: SenaEnterpriseGoLiveAttestation[]): SenaEnterpriseGoLiveAttestationList["summary"] {
  return {
    total: attestations.length,
    approved: attestations.filter((attestation) => attestation.decision === "approved").length,
    conditional: attestations.filter((attestation) => attestation.decision === "conditional").length,
    blocked: attestations.filter((attestation) => attestation.decision === "blocked").length
  };
}

export function createEnterpriseGoLiveAttestation(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseGoLiveAttestationInput
): SenaEnterpriseGoLiveAttestation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const decision = input.decision;
  if (!(enterpriseGoLiveAttestationDecisions as readonly string[]).includes(decision)) {
    throw new SenaEnterpriseError("Go-live attestation decision is not recognized.", 400, "invalid_go_live_attestation_decision");
  }
  const checklist = normalizeGoLiveChecklist(input.checklist);
  const rehearsal = getEnterpriseGoLiveRehearsal({ teamId: input.teamId });
  if (decision === "approved" && rehearsal.status !== "ready") {
    throw new SenaEnterpriseError("Go-live attestation cannot be approved while the current rehearsal has blockers or review items.", 400, "go_live_attestation_approval_blocked");
  }
  if (decision === "approved" && rehearsal.postCutoverMonitor.status !== "ready") {
    throw new SenaEnterpriseError("Go-live attestation cannot be approved until the post-cutover monitor is ready.", 400, "go_live_attestation_post_cutover_monitor_required");
  }
  if (decision === "approved" && !checklist.passed) {
    throw new SenaEnterpriseError("Go-live attestation approval requires every checklist item to be confirmed.", 400, "go_live_attestation_checklist_required");
  }
  const identityProductionHandoffSnapshot = rehearsal.identityProductionHandoff;
  const latestReleaseGate = getEnterpriseOrganizationDeploymentPackage({ teamId: input.teamId }).releaseGate.latestReview;
  const latestReleaseGateIdentitySnapshot = latestReleaseGate?.identityProductionSnapshot;
  const identityProductionHandoffSnapshotEvidence = (sourceKey: string, targetKey: string) => {
    const evidence = identityProductionHandoffSnapshot.platformRequestPacket.evidence
      .find((item) => item.startsWith(`${sourceKey}=`));
    return evidence ? `${targetKey}=${evidence.slice(sourceKey.length + 1)}` : null;
  };
  const identityProductionHandoffSnapshotAuditEvidence = [
    identityProductionHandoffSnapshotEvidence("requestPacketPolicyHash", "identityProductionHandoffSnapshotRequestPacketPolicyHash"),
    identityProductionHandoffSnapshotEvidence("requestPacketPolicyBinding", "identityProductionHandoffSnapshotRequestPacketPolicyBinding"),
    identityProductionHandoffSnapshotEvidence("receiptReviewRequests", "identityProductionHandoffSnapshotReceiptReviewRequests"),
    identityProductionHandoffSnapshotEvidence("evidenceUrlAllowedHosts", "identityProductionHandoffSnapshotEvidenceUrlAllowedHosts")
  ].filter((evidence): evidence is string => Boolean(evidence));
  const identityProductionHandoffSnapshotHostBinding = identityProductionHandoffSnapshot.evidenceUrlHostBinding;
  const latestReleaseGateIdentityReceiptArchiveDecisions = identityReceiptArchiveDecisionAuditSummaries(latestReleaseGateIdentitySnapshot);
  const timestamp = now();
  const attestation: SenaEnterpriseGoLiveAttestation = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestation,
    id: id("go-live"),
    teamId: input.teamId,
    environment: requiredReleaseGateText(input.environment, "environment"),
    releaseVersion: requiredReleaseGateText(input.releaseVersion, "releaseVersion"),
    decision,
    status: decision,
    attesterName: requiredReleaseGateText(input.attesterName, "attesterName"),
    attesterRole: requiredReleaseGateText(input.attesterRole, "attesterRole"),
    notes: requiredReleaseGateText(input.notes, "notes"),
    checklist,
    goLiveRehearsalSnapshot: {
      schemaVersion: rehearsal.schemaVersion,
      generatedAt: rehearsal.generatedAt,
      status: rehearsal.status,
      blockers: rehearsal.summary.blockers
    },
    releaseGateDraftSnapshot: {
      schemaVersion: rehearsal.releaseGateDraft.schemaVersion,
      decision: rehearsal.releaseGateDraft.decision,
      verificationStatus: rehearsal.releaseGateDraft.verificationEvidence.status
    },
    identityProductionHandoffSnapshot,
    latestReleaseGateSnapshot: latestReleaseGate ? {
      schemaVersion: latestReleaseGate.schemaVersion,
      id: latestReleaseGate.id,
      decision: latestReleaseGate.decision,
      verificationStatus: latestReleaseGate.verificationEvidence.status,
      ...(latestReleaseGateIdentitySnapshot ? {
        identityProductionStatus: latestReleaseGateIdentitySnapshot.status,
        identityProductionEvidenceDigest: latestReleaseGateIdentitySnapshot.dossierDigest ?? "missing",
        identityReceiptArchiveManifestDigest: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing",
        identityReceiptArchiveReadyForArchive: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.readyForArchive,
        identityReceiptArchiveReview: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.reviewArchives,
        identityReceiptArchiveMissingReceipts: latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingReceipts,
        identityReceiptArchiveMissingInputs: formatIdentityReceiptArchiveMissingInputCounts(latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts),
        identityReceiptArchiveArtifactCompleteness: latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(latestReleaseGateIdentitySnapshot),
        identityReceiptArchiveDecisions: latestReleaseGateIdentityReceiptArchiveDecisions,
        identityReleaseGateBlocked: latestReleaseGateIdentitySnapshot.releaseGateBlocked,
        identitySubmissionVerifierIncomplete: latestReleaseGateIdentitySnapshot.submissionVerifier.incompleteDecisions,
        identitySubmissionVerifierMissing: latestReleaseGateIdentitySnapshot.submissionVerifier.missingProductionEvidence,
        identitySubmissionVerifierMissingTechnical: latestReleaseGateIdentitySnapshot.submissionVerifier.missingTechnicalPrerequisites,
        identityRotationFreshness: latestReleaseGateIdentitySnapshot.rotationFreshness.status,
        identityEvidenceUrlHostBinding: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.status,
        identityEvidenceAllowedHostConfig: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.allowedHostConfigStatus,
        identityEvidenceAllowedHosts: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.allowedHostCount,
        identityEvidenceInvalidAllowedHosts: latestReleaseGateIdentitySnapshot.evidenceUrlHostBinding.invalidAllowedHostCount,
        identityCutoverChecklistStatus: latestReleaseGateIdentitySnapshot.cutoverChecklist.status,
        identityCutoverChecklistBlockingItems: latestReleaseGateIdentitySnapshot.cutoverChecklist.summary.blockingItems
      } : {})
    } : undefined,
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "releaseGateDraft=sena-enterprise-release-gate-draft/v1",
      "rollbackDrill=sena-enterprise-go-live-rollback-drill/v1",
      "postCutoverMonitor=sena-enterprise-go-live-monitor/v1",
      "checklist=sena-enterprise-go-live-checklist/v1",
      `decision=${decision}`,
      `rehearsalStatus=${rehearsal.status}`,
      `blockers=${rehearsal.summary.blockers.length}`,
      `checklistPassed=${checklist.passed ? "yes" : "no"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      `latestReleaseGateIdentityProductionEvidenceDigest=${latestReleaseGateIdentitySnapshot?.dossierDigest ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveManifestDigest=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.archiveManifestDigest ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveReadyForArchive=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.readyForArchive ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveReview=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.reviewArchives ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveMissingReceipts=${latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.missingReceipts ?? "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveMissingInputs=${latestReleaseGateIdentitySnapshot ? formatIdentityReceiptArchiveMissingInputCounts(latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts) : "missing"}`,
      `latestReleaseGateIdentityReceiptArchiveArtifactCompleteness=${latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(latestReleaseGateIdentitySnapshot)}`,
      `latestReleaseGateIdentityEvidenceHostBinding=${latestReleaseGateIdentitySnapshot?.evidenceUrlHostBinding.status ?? "missing"}`,
      `identityProductionHandoffSnapshot=${identityProductionHandoffSnapshot.schemaVersion}`,
      `identityProductionHandoffSnapshotStatus=${identityProductionHandoffSnapshot.status}`,
      `identityProductionHandoffSnapshotMissingEvidence=${identityProductionHandoffSnapshot.evidenceManifest.missingEvidenceIds.length}`,
      `identityProductionHandoffSnapshotRequestBlockers=${identityProductionHandoffSnapshot.platformRequestPacket.summary.blockingRequests}`,
      `identityProductionHandoffSnapshotDigest=${identityProductionHandoffSnapshot.dossierDigest ?? "missing"}`,
      `identityProductionHandoffSnapshotReceiptArchiveManifestDigest=${identityProductionHandoffSnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing"}`,
      `identityProductionHandoffSnapshotReceiptArchiveReadyForArchive=${identityProductionHandoffSnapshot.receiptArchiveManifest.summary.readyForArchive}`,
      `identityProductionHandoffSnapshotReceiptArchiveReview=${identityProductionHandoffSnapshot.receiptArchiveManifest.summary.reviewArchives}`,
      `identityProductionHandoffSnapshotReceiptArchiveMissingReceipts=${identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingReceipts}`,
      `identityProductionHandoffSnapshotReceiptArchiveMissingInputs=${formatIdentityReceiptArchiveMissingInputCounts(identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts)}`,
      ...identityProductionHandoffSnapshotAuditEvidence,
      `identityProductionHandoffSnapshotHostBinding=${identityProductionHandoffSnapshotHostBinding.status}`,
      `identityProductionHandoffSnapshotAllowedHostConfig=${identityProductionHandoffSnapshotHostBinding.allowedHostConfigStatus}`,
      `identityProductionHandoffSnapshotAllowedHosts=${identityProductionHandoffSnapshotHostBinding.allowedHostCount}`,
      `identityProductionHandoffSnapshotInvalidAllowedHosts=${identityProductionHandoffSnapshotHostBinding.invalidAllowedHostCount}`
    ],
    createdByUserId: context.user.id,
    createdAt: timestamp
  };

  const db = readEnterpriseDb();
  db.goLiveAttestations.unshift(attestation);
  db.goLiveAttestations = db.goLiveAttestations.slice(0, 1000);
  appendAudit(db, {
    event: "ops.go_live.attestation",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      goLiveAttestationId: attestation.id,
      decision: attestation.decision,
      environment: attestation.environment,
      releaseVersion: attestation.releaseVersion,
      rehearsalStatus: attestation.goLiveRehearsalSnapshot.status,
      blockers: attestation.goLiveRehearsalSnapshot.blockers.length,
      checklistPassed: attestation.checklist.passed,
      latestReleaseGateIdentityProductionStatus: latestReleaseGateIdentitySnapshot?.status ?? "missing",
      latestReleaseGateIdentitySubmissionVerifierIncomplete: latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing",
      latestReleaseGateIdentitySubmissionVerifierMissing: latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing",
      latestReleaseGateIdentitySubmissionVerifierMissingTechnical: latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing",
      latestReleaseGateIdentityRotationFreshness: latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing",
      latestReleaseGateIdentityCutoverChecklistStatus: latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing",
      latestReleaseGateIdentityCutoverChecklistBlockingItems: latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing",
      latestReleaseGateIdentityProductionEvidenceDigest: latestReleaseGateIdentitySnapshot?.dossierDigest ?? "missing",
      latestReleaseGateIdentityReceiptArchiveManifestDigest: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.archiveManifestDigest ?? "missing",
      latestReleaseGateIdentityReceiptArchiveReadyForArchive: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.readyForArchive ?? "missing",
      latestReleaseGateIdentityReceiptArchiveReview: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.reviewArchives ?? "missing",
      latestReleaseGateIdentityReceiptArchiveMissingReceipts: latestReleaseGateIdentitySnapshot?.receiptArchiveManifest.summary.missingReceipts ?? "missing",
      latestReleaseGateIdentityReceiptArchiveMissingInputs: latestReleaseGateIdentitySnapshot ? formatIdentityReceiptArchiveMissingInputCounts(latestReleaseGateIdentitySnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts) : "missing",
      latestReleaseGateIdentityReceiptArchiveArtifactCompleteness: latestReleaseGateIdentityReceiptArchiveArtifactCompleteness(latestReleaseGateIdentitySnapshot),
      latestReleaseGateIdentityReceiptArchiveDecisions: JSON.stringify(latestReleaseGateIdentityReceiptArchiveDecisions ?? []),
      latestReleaseGateIdentityEvidenceHostBinding: latestReleaseGateIdentitySnapshot?.evidenceUrlHostBinding.status ?? "missing",
      identityProductionHandoffSnapshotStatus: identityProductionHandoffSnapshot.status,
      identityProductionHandoffSnapshotMissingEvidence: identityProductionHandoffSnapshot.evidenceManifest.missingEvidenceIds.length,
      identityProductionHandoffSnapshotRequestBlockers: identityProductionHandoffSnapshot.platformRequestPacket.summary.blockingRequests,
      identityProductionHandoffSnapshotDigest: identityProductionHandoffSnapshot.dossierDigest ?? "missing",
      identityProductionHandoffSnapshotReceiptArchiveManifestDigest: identityProductionHandoffSnapshot.receiptArchiveManifest.archiveManifestDigest ?? "missing",
      identityProductionHandoffSnapshotReceiptArchiveReadyForArchive: identityProductionHandoffSnapshot.receiptArchiveManifest.summary.readyForArchive,
      identityProductionHandoffSnapshotReceiptArchiveReview: identityProductionHandoffSnapshot.receiptArchiveManifest.summary.reviewArchives,
      identityProductionHandoffSnapshotReceiptArchiveMissingReceipts: identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingReceipts,
      identityProductionHandoffSnapshotReceiptArchiveMissingInputs: formatIdentityReceiptArchiveMissingInputCounts(identityProductionHandoffSnapshot.receiptArchiveManifest.summary.missingArchiveInputCounts),
      identityProductionHandoffSnapshotReceiptReviewRequests: identityProductionHandoffSnapshot.platformRequestPacket.summary.receiptReviewRequests,
      identityProductionHandoffSnapshotEvidenceUrlAllowedHosts: identityProductionHandoffSnapshot.platformRequestPacket.evidence
        .find((item) => item.startsWith("evidenceUrlAllowedHosts="))?.slice("evidenceUrlAllowedHosts=".length) ?? "missing",
      identityProductionHandoffSnapshotHostBinding: identityProductionHandoffSnapshotHostBinding.status,
      identityProductionHandoffSnapshotAllowedHostConfig: identityProductionHandoffSnapshotHostBinding.allowedHostConfigStatus,
      identityProductionHandoffSnapshotAllowedHosts: identityProductionHandoffSnapshotHostBinding.allowedHostCount,
      identityProductionHandoffSnapshotInvalidAllowedHosts: identityProductionHandoffSnapshotHostBinding.invalidAllowedHostCount
    }
  });
  writeEnterpriseDb(db);
  return attestation;
}

export function listEnterpriseGoLiveAttestations(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterpriseGoLiveAttestationList {
  const managedTeamIds = context.memberships
    .filter((membership) => membership.status === "active" && (membership.role === "owner" || membership.role === "pi" || membership.role === "admin"))
    .map((membership) => membership.teamId);
  const scopeTeamIds = input.teamId ? [input.teamId] : managedTeamIds;
  for (const teamId of scopeTeamIds) {
    requireEnterprisePermission(context, teamId, "team:manage");
  }
  const attestations = (readEnterpriseDb().goLiveAttestations ?? [])
    .filter((attestation) => scopeTeamIds.includes(attestation.teamId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestations,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamId: input.teamId
    },
    summary: summarizeGoLiveAttestations(attestations),
    attestations
  };
}
