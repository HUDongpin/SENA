import { NextResponse } from "next/server";
import {
  getEnterpriseIdentityProductionEvidence,
  getEnterprisePlatformDecisionRegister,
  listEnterprisePlatformDecisionAcceptances,
  reviewEnterprisePlatformDecision,
  type SenaEnterprisePlatformDecisionAcceptanceInput
} from "@/lib/sena/enterprise";
import { identityOwnerRunbookHeaders, jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function receiptArchiveDecisionHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>,
  decisionId: string
): Record<string, string> {
  const archiveDecision = evidence.receiptArchiveManifest.decisions
    .find((decision) => decision.decisionId === decisionId);
  if (!archiveDecision) return {};
  return {
    "x-sena-identity-receipt-archive-status": archiveDecision.archiveStatus,
    "x-sena-identity-submitted-decision-receipt-archive-missing-inputs": archiveDecision.missingArchiveInputs.join("|") || "none",
    ...(archiveDecision.productionEvidenceArtifactDigestCompletenessStatus ? {
      "x-sena-identity-submitted-decision-production-evidence-artifact-completeness": archiveDecision.productionEvidenceArtifactDigestCompletenessStatus
    } : {})
  };
}

function identityProductionEvidenceDigestHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  return {
    ...(evidence.dossierDigest ? {
      "x-sena-identity-production-evidence-digest": evidence.dossierDigest
    } : {}),
    ...(evidence.evidenceBindingDigest ? {
      "x-sena-identity-evidence-binding-digest": evidence.evidenceBindingDigest
    } : {}),
    ...(evidence.receiptArchiveManifest.archiveManifestDigest ? {
      "x-sena-identity-receipt-archive-manifest-digest": evidence.receiptArchiveManifest.archiveManifestDigest
    } : {})
  };
}

function identityProductionEvidenceStatusHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  const artifactCompletenessCounts = evidence.receiptArchiveManifest.summary.artifactCompletenessCounts;
  const receiptArchiveMissingInputs = evidence.receiptArchiveManifest.evidence
    .find((entry) => entry.startsWith("receiptArchiveMissingInputs="))
    ?.slice("receiptArchiveMissingInputs=".length) ?? "missing";
  const artifactCompleteness = evidence.receiptArchiveManifest.evidence
    .find((entry) => entry.startsWith("receiptArchiveArtifactCompleteness="))
    ?.slice("receiptArchiveArtifactCompleteness=".length) ?? [
      `complete:${artifactCompletenessCounts.complete ?? 0}`,
      `partial:${artifactCompletenessCounts.partial ?? 0}`,
      `missing:${artifactCompletenessCounts.missing ?? 0}`
    ].join("|");
  return {
    "x-sena-identity-production-status": evidence.status,
    "x-sena-identity-release-gate-blocked": String(evidence.releaseGate.approvalBlocked),
    "x-sena-identity-request-blockers": String(evidence.platformRequestPacket.summary.blockingRequests),
    "x-sena-identity-receipt-review-requests": String(evidence.platformRequestPacket.summary.receiptReviewRequests),
    "x-sena-identity-production-blocking-decisions": evidence.releaseGate.productionBlockingDecisionIds.join("|") || "none",
    "x-sena-identity-receipt-archive-missing-inputs": receiptArchiveMissingInputs,
    "x-sena-identity-production-evidence-artifact-completeness": artifactCompleteness,
    "x-sena-identity-missing-evidence-ids": evidence.evidenceManifest.missingEvidenceIds.join("|") || "none",
    "x-sena-identity-cutover-checklist": evidence.cutoverChecklist.status,
    "x-sena-identity-cutover-blockers": String(evidence.cutoverChecklist.summary.blockingItems),
    "x-sena-identity-production-evidence-artifact-completeness-summary": artifactCompleteness
  };
}

function identityInstitutionActionPlanHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  const actionPlan = evidence.institutionActionPlan;
  return {
    ...(actionPlan.digest ? {
      "x-sena-identity-institution-action-plan-digest": actionPlan.digest
    } : {}),
    "x-sena-identity-institution-action-plan-blocking-lanes": String(actionPlan.summary.blockingLanes),
    "x-sena-identity-institution-action-plan-ready-lanes": String(actionPlan.summary.readyLanes),
    "x-sena-identity-institution-action-plan-submission-path": actionPlan.summary.submissionPath,
    ...identityOwnerRunbookHeaders(actionPlan)
  };
}

function identityRequestPacketPolicyHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  const policyHash = evidence.platformRequestPacket.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyHash="))
    ?.slice("requestPacketPolicyHash=".length);
  const policyBinding = evidence.platformRequestPacket.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyBinding="))
    ?.slice("requestPacketPolicyBinding=".length);
  return {
    ...(policyHash ? { "x-sena-identity-request-packet-policy-hash": policyHash } : {}),
    ...(policyBinding ? { "x-sena-identity-request-packet-policy-binding": policyBinding } : {})
  };
}

export async function GET(request: Request) {
  try {
    const context = requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId")?.trim() || undefined;
    const acceptances = listEnterprisePlatformDecisionAcceptances(context, { teamId });
    const platformDecisionRegister = getEnterprisePlatformDecisionRegister({ teamId });
    const identityProductionEvidence = getEnterpriseIdentityProductionEvidence({ teamId });
    return NextResponse.json({
      ...acceptances,
      platformDecisionRegister,
      identityProductionEvidence
    }, {
      headers: {
        ...identityRequestPacketPolicyHeaders(identityProductionEvidence),
        ...identityProductionEvidenceDigestHeaders(identityProductionEvidence),
        ...identityProductionEvidenceStatusHeaders(identityProductionEvidence),
        ...identityInstitutionActionPlanHeaders(identityProductionEvidence)
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json() as Partial<SenaEnterprisePlatformDecisionAcceptanceInput>;
    const acceptance = reviewEnterprisePlatformDecision(context, {
      teamId: String(body.teamId ?? ""),
      decisionId: String(body.decisionId ?? ""),
      status: String(body.status ?? "") as SenaEnterprisePlatformDecisionAcceptanceInput["status"],
      acceptedBridge: Boolean(body.acceptedBridge),
      ownerName: String(body.ownerName ?? ""),
      ownerRole: String(body.ownerRole ?? ""),
      environment: String(body.environment ?? ""),
      evidenceUrl: body.evidenceUrl ? String(body.evidenceUrl) : undefined,
      productionEvidenceIds: Array.isArray(body.productionEvidenceIds)
        ? body.productionEvidenceIds.map((value) => String(value))
        : undefined,
      productionEvidenceArtifactDigest: body.productionEvidenceArtifactDigest ? String(body.productionEvidenceArtifactDigest) : undefined,
      productionEvidenceVerifiedAt: body.productionEvidenceVerifiedAt ? String(body.productionEvidenceVerifiedAt) : undefined,
      requestPacketPolicyHash: body.requestPacketPolicyHash ? String(body.requestPacketPolicyHash) : undefined,
      requireRequestPacketPolicyHash: true,
      notes: String(body.notes ?? "")
    });
    const platformDecisionRegister = getEnterprisePlatformDecisionRegister({ teamId: acceptance.teamId });
    const identityProductionEvidence = getEnterpriseIdentityProductionEvidence({ teamId: acceptance.teamId });
    const productionEvidenceReceipt = acceptance.productionEvidenceReceipt;
    return NextResponse.json({
      acceptance,
      platformDecisionRegister,
      identityProductionEvidence
    }, {
      status: 201,
      headers: {
        ...(productionEvidenceReceipt?.requestPacketPolicyHash ? {
          "x-sena-identity-request-packet-policy-hash": productionEvidenceReceipt.requestPacketPolicyHash
        } : {}),
        ...(productionEvidenceReceipt?.requestPacketPolicyBindingStatus ? {
          "x-sena-identity-request-packet-policy-binding": productionEvidenceReceipt.requestPacketPolicyBindingStatus
        } : {}),
        ...(productionEvidenceReceipt?.receiptAuditDigest ? {
          "x-sena-identity-production-receipt-digest": productionEvidenceReceipt.receiptAuditDigest
        } : {}),
        ...(productionEvidenceReceipt?.submittedEvidenceDigest ? {
          "x-sena-identity-submitted-evidence-digest": productionEvidenceReceipt.submittedEvidenceDigest
        } : {}),
        ...(productionEvidenceReceipt?.productionEvidenceArtifactDigest ? {
          "x-sena-identity-production-evidence-artifact-digest": productionEvidenceReceipt.productionEvidenceArtifactDigest
        } : {}),
        ...(productionEvidenceReceipt?.productionEvidenceArtifactDigestCoveredEvidenceIds ? {
          "x-sena-identity-production-evidence-artifact-covered-ids": productionEvidenceReceipt.productionEvidenceArtifactDigestCoveredEvidenceIds.join("|") || "none"
        } : {}),
        ...(productionEvidenceReceipt?.productionEvidenceArtifactDigestCoverageStatus ? {
          "x-sena-identity-production-evidence-artifact-coverage": productionEvidenceReceipt.productionEvidenceArtifactDigestCoverageStatus
        } : {}),
        ...(productionEvidenceReceipt?.productionEvidenceArtifactDigestCompletenessStatus ? {
          "x-sena-identity-submitted-decision-production-evidence-artifact-completeness": productionEvidenceReceipt.productionEvidenceArtifactDigestCompletenessStatus
        } : {}),
        ...(productionEvidenceReceipt?.verifierStatus ? {
          "x-sena-identity-production-verifier-status": productionEvidenceReceipt.verifierStatus
        } : {}),
        ...(productionEvidenceReceipt?.evidenceUrlHostBindingStatus ? {
          "x-sena-identity-evidence-url-host-binding": productionEvidenceReceipt.evidenceUrlHostBindingStatus
        } : {}),
        ...(productionEvidenceReceipt?.technicalBindingStatus ? {
          "x-sena-identity-technical-binding": productionEvidenceReceipt.technicalBindingStatus
        } : {}),
        ...(productionEvidenceReceipt?.technicalReadinessStatus ? {
          "x-sena-identity-technical-readiness": productionEvidenceReceipt.technicalReadinessStatus
        } : {}),
        ...(productionEvidenceReceipt?.rotationFreshnessStatus ? {
          "x-sena-identity-rotation-freshness": productionEvidenceReceipt.rotationFreshnessStatus,
          "x-sena-identity-rotation-expired-evidence": productionEvidenceReceipt.rotationExpiredEvidenceIds?.join("|") || "none",
          "x-sena-identity-rotation-due-soon-evidence": productionEvidenceReceipt.rotationDueSoonEvidenceIds?.join("|") || "none"
        } : {}),
        ...identityProductionEvidenceDigestHeaders(identityProductionEvidence),
        ...identityProductionEvidenceStatusHeaders(identityProductionEvidence),
        ...identityInstitutionActionPlanHeaders(identityProductionEvidence),
        ...receiptArchiveDecisionHeaders(identityProductionEvidence, acceptance.decisionId)
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
