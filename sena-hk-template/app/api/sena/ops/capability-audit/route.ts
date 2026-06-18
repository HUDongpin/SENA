import { NextResponse } from "next/server";
import {
  getEnterpriseCapabilityAudit,
  getEnterpriseIdentityProductionEvidence,
  listEnterprisePlatformDecisionAcceptances,
  SenaEnterpriseError
} from "@/lib/sena/enterprise";
import { identityOwnerRunbookHeaders, jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function authCapabilityHeaders(audit: ReturnType<typeof getEnterpriseCapabilityAudit>): Record<string, string> {
  const authCapability = audit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
  if (!authCapability) return {};
  return {
    "x-sena-auth-capability-status": authCapability.status,
    "x-sena-auth-capability-remaining-platform-decisions": authCapability.remainingPlatformDecisions.join("|") || "none",
    "x-sena-auth-capability-required-artifacts": authCapability.requiredArtifacts.join("|") || "none",
    "x-sena-auth-capability-next-action": authCapability.nextAction
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

function identityRotationFreshnessHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  const evidenceIdsForStatus = (status: "expired" | "due-soon") => evidence.rotationFreshness.checks
    .filter((check) => check.status === status)
    .map((check) => check.id)
    .join("|") || "none";
  return {
    "x-sena-identity-rotation-freshness": evidence.rotationFreshness.status,
    "x-sena-identity-rotation-expired-evidence": evidenceIdsForStatus("expired"),
    "x-sena-identity-rotation-due-soon-evidence": evidenceIdsForStatus("due-soon")
  };
}

function identityPerDecisionMissingEvidenceHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  const requestByDecisionId = (decisionId: string) => evidence.platformRequestPacket.requests
    .find((request) => request.decisionId === decisionId);
  const idpRequest = requestByDecisionId("institution-idp-approval");
  const provisioningRequest = requestByDecisionId("institution-provisioning-owner");
  return {
    "x-sena-auth-capability-idp-missing-production-evidence": idpRequest?.missingProductionEvidenceIds.join("|") || "none",
    "x-sena-auth-capability-provisioning-missing-production-evidence": provisioningRequest?.missingProductionEvidenceIds.join("|") || "none",
    "x-sena-auth-capability-idp-missing-technical-prerequisites": idpRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none",
    "x-sena-auth-capability-provisioning-missing-technical-prerequisites": provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none"
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
    const access = requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped capability audit access.",
          400,
          "capability_audit_team_required"
        );
      }
      const context = requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const audit = getEnterpriseCapabilityAudit({ teamId });
    const identityProductionEvidence = getEnterpriseIdentityProductionEvidence({ teamId });
    return NextResponse.json({
      ...audit,
      identityProductionEvidence,
      access
    }, {
      headers: {
        ...authCapabilityHeaders(audit),
        ...identityRequestPacketPolicyHeaders(identityProductionEvidence),
        ...identityProductionEvidenceDigestHeaders(identityProductionEvidence),
        ...identityProductionEvidenceStatusHeaders(identityProductionEvidence),
        ...identityInstitutionActionPlanHeaders(identityProductionEvidence),
        ...identityRotationFreshnessHeaders(identityProductionEvidence),
        ...identityPerDecisionMissingEvidenceHeaders(identityProductionEvidence)
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
