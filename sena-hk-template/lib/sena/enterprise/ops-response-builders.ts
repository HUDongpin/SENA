import type {
  SenaEnterpriseIdentityProductionEvidence
} from "./identity-production-evidence";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  getEnterpriseIdentityProductionEvidence,
  getEnterpriseIdentityProductionEvidenceWithPostgresEvidence
} from "./identity-production-evidence";
import { identityProductionDecisionIds } from "./identity-readiness";
import { SenaEnterpriseError } from "./errors";
import {
  getEnterprisePlatformDecisionRegister,
  getEnterprisePlatformDecisionRegisterWithPostgresState
} from "./ops-deployment";
import {
  listEnterprisePlatformDecisionAcceptances,
  reviewEnterprisePlatformDecision,
  listEnterprisePlatformDecisionAcceptancesWithPostgresState,
  reviewEnterprisePlatformDecisionWithPostgresState,
  type SenaEnterprisePlatformDecisionAcceptance,
  type SenaEnterprisePlatformDecisionAcceptanceInput
} from "./ops-platform-decisions";
import {
  getEnterpriseGoLiveRehearsal,
  getEnterpriseGoLiveRehearsalWithPostgresEvidence,
  type SenaEnterpriseGoLiveRehearsal
} from "./ops-go-live";
import {
  createEnterpriseGoLiveAttestation,
  createEnterpriseGoLiveAttestationWithPostgresEvidence,
  listEnterpriseGoLiveAttestations,
  listEnterpriseGoLiveAttestationsWithPostgresEvidence,
  type SenaEnterpriseGoLiveAttestationInput
} from "./ops-go-live-attestations";
import {
  completeEnterprisePostCutoverObservation,
  completeEnterprisePostCutoverObservationWithPostgresEvidence,
  recordEnterprisePostCutoverObservationSample,
  recordEnterprisePostCutoverObservationSampleWithPostgresEvidence,
  startEnterprisePostCutoverObservation,
  startEnterprisePostCutoverObservationWithPostgresEvidence
} from "./ops-post-cutover-observations";
import type { SenaEnterpriseCapabilityAudit } from "./ops-capability-audit";
import type { SenaEnterpriseReleaseGateReview } from "./ops-release-gate";

export type SenaEnterpriseOpsRouteResponse<Body extends Record<string, unknown>> = {
  body: Body;
  headers?: Record<string, string>;
  status?: number;
};

export type SenaEnterpriseGoLiveAccessSummary = {
  mode: string;
  [key: string]: unknown;
};

export type SenaEnterpriseGoLiveRehearsalResponseInput = {
  access: SenaEnterpriseGoLiveAccessSummary;
  artifact?: string | null;
  context?: SenaEnterpriseSessionContext;
  includeAttestations?: boolean;
  teamId?: string;
};

type EnterpriseProductionEvidenceReceipt = NonNullable<SenaEnterprisePlatformDecisionAcceptance["productionEvidenceReceipt"]>;

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

function evidenceValue(evidence: string[], prefix: string) {
  return evidence
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
}

function formatReceiptArchiveMissingInputs(
  counts: Partial<Record<(typeof receiptArchiveMissingInputOrder)[number], number>>
) {
  return receiptArchiveMissingInputOrder
    .filter((key) => counts[key])
    .map((key) => `${key}:${counts[key]}`)
    .join("|") || "none";
}

function formatArtifactCompleteness(
  counts: Partial<Record<(typeof artifactCompletenessOrder)[number], number>>
) {
  return artifactCompletenessOrder
    .map((key) => `${key}:${counts[key] ?? 0}`)
    .join("|");
}

function buildEnterpriseIdentityInstitutionActionPlanSummaryHeaders(
  actionPlan: SenaEnterpriseIdentityProductionEvidence["institutionActionPlan"]
): Record<string, string> {
  const ownerRunbooks = actionPlan.ownerRunbooks;
  return {
    ...(actionPlan.digest ? {
      "x-sena-identity-institution-action-plan-digest": actionPlan.digest
    } : {}),
    "x-sena-identity-institution-action-plan-blocking-lanes": String(actionPlan.summary.blockingLanes),
    "x-sena-identity-institution-action-plan-ready-lanes": String(actionPlan.summary.readyLanes),
    "x-sena-identity-institution-action-plan-submission-path": actionPlan.summary.submissionPath,
    ...(ownerRunbooks?.digest ? {
      "x-sena-identity-owner-runbook-digest": ownerRunbooks.digest
    } : {}),
    ...(ownerRunbooks ? {
      "x-sena-identity-owner-runbook-blocking": String(ownerRunbooks.summary.blockingRunbooks),
      "x-sena-identity-owner-runbook-preflight-checks": String(ownerRunbooks.summary.preflightChecks),
      "x-sena-identity-owner-runbook-submission-steps": String(ownerRunbooks.summary.submissionSteps),
      "x-sena-identity-owner-runbook-receipt-archive-steps": String(ownerRunbooks.summary.receiptArchiveSteps)
    } : {})
  };
}

export function buildEnterpriseIdentityProductionEvidenceDigestHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence
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

export function buildEnterpriseIdentityInstitutionActionPlanHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence
): Record<string, string> {
  return buildEnterpriseIdentityInstitutionActionPlanSummaryHeaders(evidence.institutionActionPlan);
}

export function buildEnterpriseIdentityProductionEvidenceStatusHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence
): Record<string, string> {
  const artifactCompletenessCounts = evidence.receiptArchiveManifest.summary.artifactCompletenessCounts;
  const receiptArchiveMissingInputs = evidenceValue(
    evidence.receiptArchiveManifest.evidence,
    "receiptArchiveMissingInputs="
  ) ?? "missing";
  const artifactCompleteness = evidenceValue(
    evidence.receiptArchiveManifest.evidence,
    "receiptArchiveArtifactCompleteness="
  ) ?? formatArtifactCompleteness(artifactCompletenessCounts);
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

export function buildEnterpriseIdentityRequestPacketPolicyHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence
): Record<string, string> {
  const policyHash = evidenceValue(evidence.platformRequestPacket.evidence, "requestPacketPolicyHash=");
  const policyBinding = evidenceValue(evidence.platformRequestPacket.evidence, "requestPacketPolicyBinding=");
  return {
    ...(policyHash ? { "x-sena-identity-request-packet-policy-hash": policyHash } : {}),
    ...(policyBinding ? { "x-sena-identity-request-packet-policy-binding": policyBinding } : {})
  };
}

export function buildEnterpriseIdentityRotationFreshnessHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence
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

export function buildEnterpriseIdentityPerDecisionMissingEvidenceHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence
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

export function buildEnterpriseAuthCapabilityHeaders(
  audit: SenaEnterpriseCapabilityAudit
): Record<string, string> {
  const authCapability = audit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
  if (!authCapability) return {};
  return {
    "x-sena-auth-capability-status": authCapability.status,
    "x-sena-auth-capability-remaining-platform-decisions": authCapability.remainingPlatformDecisions.join("|") || "none",
    "x-sena-auth-capability-required-artifacts": authCapability.requiredArtifacts.join("|") || "none",
    "x-sena-auth-capability-next-action": authCapability.nextAction
  };
}

export function buildEnterpriseIdentityProductionEvidenceHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence
): Record<string, string> {
  return {
    ...buildEnterpriseIdentityRequestPacketPolicyHeaders(evidence),
    ...buildEnterpriseIdentityProductionEvidenceDigestHeaders(evidence),
    ...buildEnterpriseIdentityProductionEvidenceStatusHeaders(evidence),
    ...buildEnterpriseIdentityInstitutionActionPlanHeaders(evidence),
    ...buildEnterpriseIdentityRotationFreshnessHeaders(evidence)
  };
}

export function buildEnterpriseReceiptArchiveDecisionHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence,
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

export function buildEnterpriseProductionEvidenceReceiptHeaders(
  receipt?: EnterpriseProductionEvidenceReceipt
): Record<string, string> {
  if (!receipt) return {};
  return {
    ...(receipt.requestPacketPolicyHash ? {
      "x-sena-identity-request-packet-policy-hash": receipt.requestPacketPolicyHash
    } : {}),
    ...(receipt.requestPacketPolicyBindingStatus ? {
      "x-sena-identity-request-packet-policy-binding": receipt.requestPacketPolicyBindingStatus
    } : {}),
    ...(receipt.receiptAuditDigest ? {
      "x-sena-identity-production-receipt-digest": receipt.receiptAuditDigest
    } : {}),
    ...(receipt.submittedEvidenceDigest ? {
      "x-sena-identity-submitted-evidence-digest": receipt.submittedEvidenceDigest
    } : {}),
    ...(receipt.productionEvidenceArtifactDigest ? {
      "x-sena-identity-production-evidence-artifact-digest": receipt.productionEvidenceArtifactDigest
    } : {}),
    ...(receipt.productionEvidenceArtifactDigestCoveredEvidenceIds ? {
      "x-sena-identity-production-evidence-artifact-covered-ids": receipt.productionEvidenceArtifactDigestCoveredEvidenceIds.join("|") || "none"
    } : {}),
    ...(receipt.productionEvidenceArtifactDigestCoverageStatus ? {
      "x-sena-identity-production-evidence-artifact-coverage": receipt.productionEvidenceArtifactDigestCoverageStatus
    } : {}),
    ...(receipt.productionEvidenceArtifactDigestCompletenessStatus ? {
      "x-sena-identity-submitted-decision-production-evidence-artifact-completeness": receipt.productionEvidenceArtifactDigestCompletenessStatus
    } : {}),
    ...(receipt.verifierStatus ? {
      "x-sena-identity-production-verifier-status": receipt.verifierStatus
    } : {}),
    ...(receipt.evidenceUrlHostBindingStatus ? {
      "x-sena-identity-evidence-url-host-binding": receipt.evidenceUrlHostBindingStatus
    } : {}),
    ...(receipt.technicalBindingStatus ? {
      "x-sena-identity-technical-binding": receipt.technicalBindingStatus
    } : {}),
    ...(receipt.technicalReadinessStatus ? {
      "x-sena-identity-technical-readiness": receipt.technicalReadinessStatus
    } : {}),
    ...(receipt.rotationFreshnessStatus ? {
      "x-sena-identity-rotation-freshness": receipt.rotationFreshnessStatus,
      "x-sena-identity-rotation-expired-evidence": receipt.rotationExpiredEvidenceIds?.join("|") || "none",
      "x-sena-identity-rotation-due-soon-evidence": receipt.rotationDueSoonEvidenceIds?.join("|") || "none"
    } : {})
  };
}

export function buildEnterprisePlatformDecisionReviewHeaders(
  evidence: SenaEnterpriseIdentityProductionEvidence,
  decisionId: string,
  receipt?: EnterpriseProductionEvidenceReceipt
): Record<string, string> {
  return {
    ...buildEnterpriseProductionEvidenceReceiptHeaders(receipt),
    ...buildEnterpriseIdentityProductionEvidenceDigestHeaders(evidence),
    ...buildEnterpriseIdentityProductionEvidenceStatusHeaders(evidence),
    ...buildEnterpriseIdentityInstitutionActionPlanHeaders(evidence),
    ...buildEnterpriseReceiptArchiveDecisionHeaders(evidence, decisionId)
  };
}

export function buildEnterpriseIdentityProductionHandoffHeaders(
  handoff?: SenaEnterpriseIdentityProductionEvidence
): Record<string, string> {
  if (!handoff) return {};
  const artifactCompleteness = formatArtifactCompleteness(
    handoff.receiptArchiveManifest.summary.artifactCompletenessCounts
  );
  return {
    ...buildEnterpriseIdentityProductionEvidenceDigestHeaders(handoff),
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
    ...buildEnterpriseIdentityInstitutionActionPlanHeaders(handoff)
  };
}

export function buildEnterpriseReleaseGateIdentitySnapshotHeaders(
  review?: SenaEnterpriseReleaseGateReview
): Record<string, string> {
  if (!review) return {};
  const snapshot = review.identityProductionSnapshot;
  const identityBlockingDecisionIds = review.platformDecisionSnapshot.productionBlockingDecisionIds
    .filter((decisionId) => identityProductionDecisionIds.includes(decisionId as never));
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
    ...buildEnterpriseIdentityInstitutionActionPlanSummaryHeaders(snapshot.institutionActionPlan)
  };
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function platformDecisionReviewInputFromBody(
  body: Record<string, unknown>
): SenaEnterprisePlatformDecisionAcceptanceInput {
  return {
    teamId: String(body.teamId ?? ""),
    decisionId: String(body.decisionId ?? ""),
    status: String(body.status ?? "") as SenaEnterprisePlatformDecisionAcceptanceInput["status"],
    acceptedBridge: Boolean(body.acceptedBridge),
    ownerName: String(body.ownerName ?? ""),
    ownerRole: String(body.ownerRole ?? ""),
    environment: String(body.environment ?? ""),
    evidenceUrl: body.evidenceUrl ? String(body.evidenceUrl) : undefined,
    productionEvidenceIds: stringList(body.productionEvidenceIds),
    productionEvidenceArtifactDigest: body.productionEvidenceArtifactDigest ? String(body.productionEvidenceArtifactDigest) : undefined,
    productionEvidenceVerifiedAt: body.productionEvidenceVerifiedAt ? String(body.productionEvidenceVerifiedAt) : undefined,
    requestPacketPolicyHash: body.requestPacketPolicyHash ? String(body.requestPacketPolicyHash) : undefined,
    requireRequestPacketPolicyHash: true,
    notes: String(body.notes ?? "")
  };
}

export function buildEnterprisePlatformDecisionListResponse(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string }
) {
  const acceptances = listEnterprisePlatformDecisionAcceptances(context, input);
  const platformDecisionRegister = getEnterprisePlatformDecisionRegister(input);
  const identityProductionEvidence = getEnterpriseIdentityProductionEvidence(input);
  return {
    body: {
      ...acceptances,
      platformDecisionRegister,
      identityProductionEvidence
    },
    headers: buildEnterpriseIdentityProductionEvidenceHeaders(identityProductionEvidence)
  };
}

export async function buildEnterprisePlatformDecisionListResponseWithPostgresState(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string }
) {
  const acceptances = await listEnterprisePlatformDecisionAcceptancesWithPostgresState(context, input);
  const platformDecisionRegister = await getEnterprisePlatformDecisionRegisterWithPostgresState(input);
  const identityProductionEvidence = await getEnterpriseIdentityProductionEvidenceWithPostgresEvidence(input);
  return {
    body: {
      ...acceptances,
      platformDecisionRegister,
      identityProductionEvidence
    },
    headers: buildEnterpriseIdentityProductionEvidenceHeaders(identityProductionEvidence)
  };
}

export function buildEnterprisePlatformDecisionReviewResponse(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  const acceptance = reviewEnterprisePlatformDecision(context, platformDecisionReviewInputFromBody(body));
  const platformDecisionRegister = getEnterprisePlatformDecisionRegister({ teamId: acceptance.teamId });
  const identityProductionEvidence = getEnterpriseIdentityProductionEvidence({ teamId: acceptance.teamId });
  return {
    body: {
      acceptance,
      platformDecisionRegister,
      identityProductionEvidence
    },
    status: 201,
    headers: buildEnterprisePlatformDecisionReviewHeaders(
      identityProductionEvidence,
      acceptance.decisionId,
      acceptance.productionEvidenceReceipt
    )
  };
}

export async function buildEnterprisePlatformDecisionReviewResponseWithPostgresState(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  const acceptance = await reviewEnterprisePlatformDecisionWithPostgresState(
    context,
    platformDecisionReviewInputFromBody(body)
  );
  const platformDecisionRegister = await getEnterprisePlatformDecisionRegisterWithPostgresState({ teamId: acceptance.teamId });
  const identityProductionEvidence = await getEnterpriseIdentityProductionEvidenceWithPostgresEvidence({ teamId: acceptance.teamId });
  return {
    body: {
      acceptance,
      platformDecisionRegister,
      identityProductionEvidence
    },
    status: 201,
    headers: buildEnterprisePlatformDecisionReviewHeaders(
      identityProductionEvidence,
      acceptance.decisionId,
      acceptance.productionEvidenceReceipt
    )
  };
}

function requireGoLiveRehearsalAccess(input: SenaEnterpriseGoLiveRehearsalResponseInput) {
  if (input.access.mode === "session") {
    if (!input.teamId) {
      throw new SenaEnterpriseError(
        "Team id is required for session-scoped go-live rehearsal access.",
        400,
        "go_live_rehearsal_team_required"
      );
    }
    if (!input.context) {
      throw new SenaEnterpriseError(
        "Session context is required for session-scoped go-live rehearsal access.",
        401,
        "go_live_rehearsal_session_required"
      );
    }
    listEnterprisePlatformDecisionAcceptances(input.context, { teamId: input.teamId });
  }
}

async function requireGoLiveRehearsalAccessWithPostgresState(input: SenaEnterpriseGoLiveRehearsalResponseInput) {
  if (input.access.mode === "session") {
    if (!input.teamId) {
      throw new SenaEnterpriseError(
        "Team id is required for session-scoped go-live rehearsal access.",
        400,
        "go_live_rehearsal_team_required"
      );
    }
    if (!input.context) {
      throw new SenaEnterpriseError(
        "Session context is required for session-scoped go-live rehearsal access.",
        401,
        "go_live_rehearsal_session_required"
      );
    }
    await listEnterprisePlatformDecisionAcceptancesWithPostgresState(input.context, { teamId: input.teamId });
  }
}

function buildEnterpriseGoLiveRehearsalResponseBody(
  input: SenaEnterpriseGoLiveRehearsalResponseInput,
  rehearsal: SenaEnterpriseGoLiveRehearsal
) {
  const headers = buildEnterpriseIdentityProductionHandoffHeaders(rehearsal.identityProductionHandoff);
  if (input.artifact === "rollback-drill") {
    return {
      body: {
        ...rehearsal.rollbackDrill,
        access: input.access
      },
      headers
    };
  }
  if (input.artifact === "post-cutover-monitor" || input.artifact === "monitor") {
    return {
      body: {
        ...rehearsal.postCutoverMonitor,
        access: input.access
      },
      headers
    };
  }
  const attestations = input.includeAttestations && input.context
    ? listEnterpriseGoLiveAttestations(input.context, { teamId: input.teamId })
    : undefined;
  return {
    body: {
      ...rehearsal,
      attestations,
      access: input.access
    },
    headers
  };
}

export function buildEnterpriseGoLiveRehearsalResponse(
  input: SenaEnterpriseGoLiveRehearsalResponseInput
) {
  requireGoLiveRehearsalAccess(input);
  return buildEnterpriseGoLiveRehearsalResponseBody(
    input,
    getEnterpriseGoLiveRehearsal({ teamId: input.teamId })
  );
}

export async function buildEnterpriseGoLiveRehearsalResponseWithPostgresEvidence(
  input: SenaEnterpriseGoLiveRehearsalResponseInput
) {
  await requireGoLiveRehearsalAccessWithPostgresState(input);
  const responseInput = input.includeAttestations
    ? { ...input, includeAttestations: false }
    : input;
  const response = buildEnterpriseGoLiveRehearsalResponseBody(
    responseInput,
    await getEnterpriseGoLiveRehearsalWithPostgresEvidence({ teamId: input.teamId })
  );
  if (input.includeAttestations && input.context) {
    return {
      ...response,
      body: {
        ...response.body,
        attestations: await listEnterpriseGoLiveAttestationsWithPostgresEvidence(input.context, { teamId: input.teamId })
      }
    };
  }
  return response;
}

export function buildEnterpriseGoLivePostResponse(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "start-post-cutover-observation") {
    const observation = startEnterprisePostCutoverObservation(context, {
      teamId: String(body.teamId ?? ""),
      environment: String(body.environment ?? ""),
      releaseVersion: String(body.releaseVersion ?? "")
    });
    return {
      body: { observation },
      status: 201
    };
  }
  if (action === "record-post-cutover-sample") {
    const observation = recordEnterprisePostCutoverObservationSample(context, {
      teamId: String(body.teamId ?? ""),
      observationId: String(body.observationId ?? "")
    });
    return {
      body: { observation }
    };
  }
  if (action === "complete-post-cutover-observation") {
    const observation = completeEnterprisePostCutoverObservation(context, {
      teamId: String(body.teamId ?? ""),
      observationId: String(body.observationId ?? ""),
      acknowledgedWarningAlertIds: Array.isArray(body.acknowledgedWarningAlertIds)
        ? body.acknowledgedWarningAlertIds.map((value) => String(value))
        : []
    });
    return {
      body: { observation }
    };
  }

  const checklist = typeof body.checklist === "object" && body.checklist !== null
    ? body.checklist as Partial<SenaEnterpriseGoLiveAttestationInput["checklist"]>
    : {};
  const attestation = createEnterpriseGoLiveAttestation(context, {
    teamId: String(body.teamId ?? ""),
    environment: String(body.environment ?? ""),
    releaseVersion: String(body.releaseVersion ?? ""),
    decision: String(body.decision ?? "") as SenaEnterpriseGoLiveAttestationInput["decision"],
    attesterName: String(body.attesterName ?? ""),
    attesterRole: String(body.attesterRole ?? ""),
    notes: String(body.notes ?? ""),
    checklist: {
      rehearsalReviewed: Boolean(checklist.rehearsalReviewed),
      releaseGateDraftReviewed: Boolean(checklist.releaseGateDraftReviewed),
      verificationEvidenceReviewed: Boolean(checklist.verificationEvidenceReviewed),
      rollbackOwnerConfirmed: Boolean(checklist.rollbackOwnerConfirmed),
      platformOwnerDecisionReviewed: Boolean(checklist.platformOwnerDecisionReviewed)
    }
  });
  return {
    body: { attestation },
    status: 201,
    headers: buildEnterpriseIdentityProductionHandoffHeaders(attestation.identityProductionHandoffSnapshot)
  };
}

export async function buildEnterpriseGoLivePostResponseWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "start-post-cutover-observation") {
    const observation = await startEnterprisePostCutoverObservationWithPostgresEvidence(context, {
      teamId: String(body.teamId ?? ""),
      environment: String(body.environment ?? ""),
      releaseVersion: String(body.releaseVersion ?? "")
    });
    return {
      body: { observation },
      status: 201
    };
  }
  if (action === "record-post-cutover-sample") {
    const observation = await recordEnterprisePostCutoverObservationSampleWithPostgresEvidence(context, {
      teamId: String(body.teamId ?? ""),
      observationId: String(body.observationId ?? "")
    });
    return {
      body: { observation }
    };
  }
  if (action === "complete-post-cutover-observation") {
    const observation = await completeEnterprisePostCutoverObservationWithPostgresEvidence(context, {
      teamId: String(body.teamId ?? ""),
      observationId: String(body.observationId ?? ""),
      acknowledgedWarningAlertIds: Array.isArray(body.acknowledgedWarningAlertIds)
        ? body.acknowledgedWarningAlertIds.map((value) => String(value))
        : []
    });
    return {
      body: { observation }
    };
  }

  const checklist = typeof body.checklist === "object" && body.checklist !== null
    ? body.checklist as Partial<SenaEnterpriseGoLiveAttestationInput["checklist"]>
    : {};
  const attestation = await createEnterpriseGoLiveAttestationWithPostgresEvidence(context, {
    teamId: String(body.teamId ?? ""),
    environment: String(body.environment ?? ""),
    releaseVersion: String(body.releaseVersion ?? ""),
    decision: String(body.decision ?? "") as SenaEnterpriseGoLiveAttestationInput["decision"],
    attesterName: String(body.attesterName ?? ""),
    attesterRole: String(body.attesterRole ?? ""),
    notes: String(body.notes ?? ""),
    checklist: {
      rehearsalReviewed: Boolean(checklist.rehearsalReviewed),
      releaseGateDraftReviewed: Boolean(checklist.releaseGateDraftReviewed),
      verificationEvidenceReviewed: Boolean(checklist.verificationEvidenceReviewed),
      rollbackOwnerConfirmed: Boolean(checklist.rollbackOwnerConfirmed),
      platformOwnerDecisionReviewed: Boolean(checklist.platformOwnerDecisionReviewed)
    }
  });
  return {
    body: { attestation },
    status: 201,
    headers: buildEnterpriseIdentityProductionHandoffHeaders(attestation.identityProductionHandoffSnapshot)
  };
}
