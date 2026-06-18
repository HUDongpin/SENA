import { NextResponse } from "next/server";
import {
  getEnterpriseOrganizationDeploymentPackage,
  listEnterprisePlatformDecisionAcceptances,
  SenaEnterpriseError,
  type SenaEnterpriseIdentityProductionEvidence
} from "@/lib/sena/enterprise";
import { identityOwnerRunbookHeaders, jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

const receiptArchiveMissingInputOrder = [
  "productionEvidenceReceipt",
  "receiptAuditDigest",
  "submittedEvidenceDigest",
  "productionEvidenceArtifactDigest",
  "requestPacketPolicyBinding",
  "productionEvidenceCompleteness",
  "technicalEvidenceBinding",
  "technicalReadiness",
  "evidenceUrlHostBinding",
  "rotationFreshness"
] as const;
const artifactCompletenessOrder = ["complete", "partial", "missing"] as const;

function formatReceiptArchiveMissingInputs(counts: Partial<Record<(typeof receiptArchiveMissingInputOrder)[number], number>>) {
  return receiptArchiveMissingInputOrder
    .filter((key) => counts[key])
    .map((key) => `${key}:${counts[key]}`)
    .join("|") || "none";
}

function formatArtifactCompleteness(counts: Partial<Record<(typeof artifactCompletenessOrder)[number], number>>) {
  return artifactCompletenessOrder
    .map((key) => `${key}:${counts[key] ?? 0}`)
    .join("|");
}

function identityProductionHandoffHeaders(
  handoff?: SenaEnterpriseIdentityProductionEvidence
): Record<string, string> {
  if (!handoff) return {};
  const artifactCompleteness = formatArtifactCompleteness(
    handoff.receiptArchiveManifest.summary.artifactCompletenessCounts
  );
  return {
    ...(handoff.dossierDigest ? {
      "x-sena-identity-production-evidence-digest": handoff.dossierDigest
    } : {}),
    ...(handoff.evidenceBindingDigest ? {
      "x-sena-identity-evidence-binding-digest": handoff.evidenceBindingDigest
    } : {}),
    ...(handoff.receiptArchiveManifest.archiveManifestDigest ? {
      "x-sena-identity-receipt-archive-manifest-digest": handoff.receiptArchiveManifest.archiveManifestDigest
    } : {}),
    "x-sena-identity-production-status": handoff.status,
    "x-sena-identity-release-gate-blocked": String(handoff.releaseGate.approvalBlocked),
    "x-sena-identity-request-blockers": String(handoff.platformRequestPacket.summary.blockingRequests),
    "x-sena-identity-receipt-review-requests": String(handoff.platformRequestPacket.summary.receiptReviewRequests),
    "x-sena-identity-production-blocking-decisions": handoff.releaseGate.productionBlockingDecisionIds.join("|") || "none",
    "x-sena-identity-receipt-archive-missing-inputs": formatReceiptArchiveMissingInputs(
      handoff.receiptArchiveManifest.summary.missingArchiveInputCounts
    ),
    "x-sena-identity-production-evidence-artifact-completeness": artifactCompleteness,
    "x-sena-identity-missing-evidence-ids": handoff.evidenceManifest.missingEvidenceIds.join("|") || "none",
    "x-sena-identity-cutover-checklist": handoff.cutoverChecklist.status,
    "x-sena-identity-cutover-blockers": String(handoff.cutoverChecklist.summary.blockingItems),
    "x-sena-identity-production-evidence-artifact-completeness-summary": artifactCompleteness,
    ...(handoff.institutionActionPlan.digest ? {
      "x-sena-identity-institution-action-plan-digest": handoff.institutionActionPlan.digest
    } : {}),
    "x-sena-identity-institution-action-plan-blocking-lanes": String(handoff.institutionActionPlan.summary.blockingLanes),
    "x-sena-identity-institution-action-plan-ready-lanes": String(handoff.institutionActionPlan.summary.readyLanes),
    "x-sena-identity-institution-action-plan-submission-path": handoff.institutionActionPlan.summary.submissionPath,
    ...identityOwnerRunbookHeaders(handoff.institutionActionPlan)
  };
}

export async function GET(request: Request) {
  try {
    const access = requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped deployment package access.",
          400,
          "deployment_package_team_required"
        );
      }
      const context = requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const deployment = getEnterpriseOrganizationDeploymentPackage({ teamId });
    return NextResponse.json({
      ...deployment,
      access
    }, {
      status: deployment.status === "blocked" ? 503 : 200,
      headers: identityProductionHandoffHeaders(deployment.identityProductionHandoff)
    });
  } catch (error) {
    return jsonError(error);
  }
}
