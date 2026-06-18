import { NextResponse } from "next/server";
import {
  createEnterpriseGoLiveAttestation,
  completeEnterprisePostCutoverObservation,
  getEnterpriseGoLiveRehearsal,
  listEnterprisePlatformDecisionAcceptances,
  listEnterpriseGoLiveAttestations,
  recordEnterprisePostCutoverObservationSample,
  SenaEnterpriseError,
  startEnterprisePostCutoverObservation,
  type SenaEnterpriseIdentityProductionEvidence,
  type SenaEnterpriseGoLiveAttestationInput
} from "@/lib/sena/enterprise";
import { identityOwnerRunbookHeaders, jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

type GoLiveRehearsalPostBody = Partial<SenaEnterpriseGoLiveAttestationInput> & {
  action?: string;
  observationId?: string;
  acknowledgedWarningAlertIds?: unknown[];
};

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
    const url = new URL(request.url);
    const artifact = url.searchParams.get("artifact");
    const teamId = url.searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped go-live rehearsal access.",
          400,
          "go_live_rehearsal_team_required"
        );
      }
      const context = requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const rehearsal = getEnterpriseGoLiveRehearsal({ teamId });
    const identityHeaders = identityProductionHandoffHeaders(rehearsal.identityProductionHandoff);
    if (artifact === "rollback-drill") {
      return NextResponse.json({
        ...rehearsal.rollbackDrill,
        access
      }, {
        headers: identityHeaders
      });
    }
    if (artifact === "post-cutover-monitor" || artifact === "monitor") {
      return NextResponse.json({
        ...rehearsal.postCutoverMonitor,
        access
      }, {
        headers: identityHeaders
      });
    }
    const includeAttestations = url.searchParams.get("attestations") === "1";
    const attestations = includeAttestations
      ? listEnterpriseGoLiveAttestations(requireApiSession(), { teamId })
      : undefined;
    return NextResponse.json({
      ...rehearsal,
      attestations,
      access
    }, {
      headers: identityHeaders
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = requireApiSessionForMutation(request);
    const body = await request.json() as GoLiveRehearsalPostBody;
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "start-post-cutover-observation") {
      const observation = startEnterprisePostCutoverObservation(context, {
        teamId: String(body.teamId ?? ""),
        environment: String(body.environment ?? ""),
        releaseVersion: String(body.releaseVersion ?? "")
      });
      return NextResponse.json({ observation }, { status: 201 });
    }
    if (action === "record-post-cutover-sample") {
      const observation = recordEnterprisePostCutoverObservationSample(context, {
        teamId: String(body.teamId ?? ""),
        observationId: String(body.observationId ?? "")
      });
      return NextResponse.json({ observation });
    }
    if (action === "complete-post-cutover-observation") {
      const observation = completeEnterprisePostCutoverObservation(context, {
        teamId: String(body.teamId ?? ""),
        observationId: String(body.observationId ?? ""),
        acknowledgedWarningAlertIds: Array.isArray(body.acknowledgedWarningAlertIds)
          ? body.acknowledgedWarningAlertIds.map((value) => String(value))
          : []
      });
      return NextResponse.json({ observation });
    }
    const attestation = createEnterpriseGoLiveAttestation(context, {
      teamId: String(body.teamId ?? ""),
      environment: String(body.environment ?? ""),
      releaseVersion: String(body.releaseVersion ?? ""),
      decision: String(body.decision ?? "") as SenaEnterpriseGoLiveAttestationInput["decision"],
      attesterName: String(body.attesterName ?? ""),
      attesterRole: String(body.attesterRole ?? ""),
      notes: String(body.notes ?? ""),
      checklist: {
        rehearsalReviewed: Boolean(body.checklist?.rehearsalReviewed),
        releaseGateDraftReviewed: Boolean(body.checklist?.releaseGateDraftReviewed),
        verificationEvidenceReviewed: Boolean(body.checklist?.verificationEvidenceReviewed),
        rollbackOwnerConfirmed: Boolean(body.checklist?.rollbackOwnerConfirmed),
        platformOwnerDecisionReviewed: Boolean(body.checklist?.platformOwnerDecisionReviewed)
      }
    });
    return NextResponse.json({ attestation }, {
      status: 201,
      headers: identityProductionHandoffHeaders(attestation.identityProductionHandoffSnapshot)
    });
  } catch (error) {
    return jsonError(error);
  }
}
