import { NextResponse } from "next/server";
import {
  createEnterpriseReleaseGateReview,
  listEnterpriseReleaseGateReviews,
  type SenaEnterpriseReleaseGateReview,
  type SenaEnterpriseReleaseGateReviewInput
} from "@/lib/sena/enterprise";
import { identityOwnerRunbookHeaders, jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

const identityProductionDecisionIds = new Set(["institution-idp-approval", "institution-provisioning-owner"]);
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

function identityProductionSnapshotHeaders(review?: SenaEnterpriseReleaseGateReview): Record<string, string> {
  if (!review) return {};
  const snapshot = review.identityProductionSnapshot;
  const identityBlockingDecisionIds = review.platformDecisionSnapshot.productionBlockingDecisionIds
    .filter((decisionId) => identityProductionDecisionIds.has(decisionId));
  const artifactCompleteness = formatArtifactCompleteness(
    snapshot.receiptArchiveManifest.summary.artifactCompletenessCounts
  );
  return {
    ...(snapshot.dossierDigest ? {
      "x-sena-identity-production-evidence-digest": snapshot.dossierDigest
    } : {}),
    ...(snapshot.evidenceBindingDigest ? {
      "x-sena-identity-evidence-binding-digest": snapshot.evidenceBindingDigest
    } : {}),
    ...(snapshot.receiptArchiveManifest.archiveManifestDigest ? {
      "x-sena-identity-receipt-archive-manifest-digest": snapshot.receiptArchiveManifest.archiveManifestDigest
    } : {}),
    "x-sena-identity-production-status": snapshot.status,
    "x-sena-identity-release-gate-blocked": String(snapshot.releaseGateBlocked),
    "x-sena-identity-request-blockers": String(snapshot.platformRequestPacket.blockingRequests),
    "x-sena-identity-receipt-review-requests": String(snapshot.platformRequestPacket.receiptReviewRequests),
    "x-sena-identity-production-blocking-decisions": identityBlockingDecisionIds.join("|") || "none",
    "x-sena-identity-receipt-archive-missing-inputs": formatReceiptArchiveMissingInputs(
      snapshot.receiptArchiveManifest.summary.missingArchiveInputCounts
    ),
    "x-sena-identity-production-evidence-artifact-completeness": artifactCompleteness,
    "x-sena-identity-missing-evidence-ids": snapshot.missingEvidenceIds.join("|") || "none",
    "x-sena-identity-cutover-checklist": snapshot.cutoverChecklist.status,
    "x-sena-identity-cutover-blockers": String(snapshot.cutoverChecklist.summary.blockingItems),
    "x-sena-identity-production-evidence-artifact-completeness-summary": artifactCompleteness,
    ...(snapshot.institutionActionPlan?.digest ? {
      "x-sena-identity-institution-action-plan-digest": snapshot.institutionActionPlan.digest
    } : {}),
    ...(snapshot.institutionActionPlan ? {
      "x-sena-identity-institution-action-plan-blocking-lanes": String(snapshot.institutionActionPlan.summary.blockingLanes),
      "x-sena-identity-institution-action-plan-ready-lanes": String(snapshot.institutionActionPlan.summary.readyLanes),
      "x-sena-identity-institution-action-plan-submission-path": snapshot.institutionActionPlan.summary.submissionPath,
      ...identityOwnerRunbookHeaders(snapshot.institutionActionPlan)
    } : {})
  };
}

export async function GET(request: Request) {
  try {
    const context = requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId")?.trim() || undefined;
    const reviews = listEnterpriseReleaseGateReviews(context, { teamId });
    return NextResponse.json(reviews, {
      headers: identityProductionSnapshotHeaders(reviews.reviews[0])
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json() as Partial<SenaEnterpriseReleaseGateReviewInput>;
    const review = createEnterpriseReleaseGateReview(context, {
      teamId: String(body.teamId ?? ""),
      environment: String(body.environment ?? ""),
      releaseVersion: String(body.releaseVersion ?? ""),
      decision: String(body.decision ?? "") as SenaEnterpriseReleaseGateReviewInput["decision"],
      approverName: String(body.approverName ?? ""),
      approverRole: String(body.approverRole ?? ""),
      notes: String(body.notes ?? ""),
      verificationCommand: String(body.verificationCommand ?? ""),
      verificationEvidence: body.verificationEvidence
    });
    return NextResponse.json({ review }, {
      status: 201,
      headers: identityProductionSnapshotHeaders(review)
    });
  } catch (error) {
    return jsonError(error);
  }
}
