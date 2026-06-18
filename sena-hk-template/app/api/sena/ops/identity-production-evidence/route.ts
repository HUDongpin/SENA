import { NextResponse } from "next/server";
import {
  getEnterpriseIdentityProductionEvidence,
  listEnterprisePlatformDecisionAcceptances
} from "@/lib/sena/enterprise/ops-governance";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import { identityOwnerRunbookHeaders, jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function receiptArchiveMissingInputsHeader(evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>) {
  return evidence.receiptArchiveManifest.evidence
    .find((entry) => entry.startsWith("receiptArchiveMissingInputs="))
    ?.slice("receiptArchiveMissingInputs=".length) ?? "missing";
}

function receiptArchiveArtifactCompletenessHeader(evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>) {
  return evidence.receiptArchiveManifest.evidence
    .find((entry) => entry.startsWith("receiptArchiveArtifactCompleteness="))
    ?.slice("receiptArchiveArtifactCompleteness=".length) ?? "missing";
}

function identityRequestPacketPolicyHashHeader(evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>) {
  return evidence.platformRequestPacket.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyHash="))
    ?.slice("requestPacketPolicyHash=".length);
}

function identityRequestPacketPolicyBindingHeader(evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>) {
  return evidence.platformRequestPacket.evidence
    .find((entry) => entry.startsWith("requestPacketPolicyBinding="))
    ?.slice("requestPacketPolicyBinding=".length);
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

export async function GET(request: Request) {
  try {
    const access = requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped identity production evidence access.",
          400,
          "identity_evidence_team_required"
        );
      }
      const context = requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const evidence = getEnterpriseIdentityProductionEvidence({ teamId });
    const requestPacketPolicyHash = identityRequestPacketPolicyHashHeader(evidence);
    const requestPacketPolicyBinding = identityRequestPacketPolicyBindingHeader(evidence);
    const artifactCompleteness = receiptArchiveArtifactCompletenessHeader(evidence);
    return NextResponse.json({
      ...evidence,
      access
    }, {
      headers: {
        ...(evidence.dossierDigest ? {
          "x-sena-identity-production-evidence-digest": evidence.dossierDigest
        } : {}),
        ...(evidence.evidenceBindingDigest ? {
          "x-sena-identity-evidence-binding-digest": evidence.evidenceBindingDigest
        } : {}),
        ...(evidence.receiptArchiveManifest.archiveManifestDigest ? {
          "x-sena-identity-receipt-archive-manifest-digest": evidence.receiptArchiveManifest.archiveManifestDigest
        } : {}),
        ...identityInstitutionActionPlanHeaders(evidence),
        ...(requestPacketPolicyHash ? {
          "x-sena-identity-request-packet-policy-hash": requestPacketPolicyHash
        } : {}),
        ...(requestPacketPolicyBinding ? {
          "x-sena-identity-request-packet-policy-binding": requestPacketPolicyBinding
        } : {}),
        "x-sena-identity-receipt-archive-missing-inputs": receiptArchiveMissingInputsHeader(evidence),
        "x-sena-identity-production-evidence-artifact-completeness": artifactCompleteness,
        "x-sena-identity-production-evidence-artifact-completeness-summary": artifactCompleteness,
        "x-sena-identity-production-status": evidence.status,
        "x-sena-identity-release-gate-blocked": String(evidence.releaseGate.approvalBlocked),
        "x-sena-identity-request-blockers": String(evidence.platformRequestPacket.summary.blockingRequests),
        "x-sena-identity-receipt-review-requests": String(evidence.platformRequestPacket.summary.receiptReviewRequests),
        "x-sena-identity-production-blocking-decisions": evidence.releaseGate.productionBlockingDecisionIds.join("|") || "none",
        "x-sena-identity-missing-evidence-ids": evidence.evidenceManifest.missingEvidenceIds.join("|") || "none",
        "x-sena-identity-cutover-checklist": evidence.cutoverChecklist.status,
        "x-sena-identity-cutover-blockers": String(evidence.cutoverChecklist.summary.blockingItems)
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
