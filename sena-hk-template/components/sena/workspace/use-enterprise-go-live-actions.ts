"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  buildSenaWorkspaceApiUrl,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import {
  getEnterpriseGoLiveRehearsalAction,
  submitEnterpriseGoLiveAttestationAction
} from "./enterprise-ops-actions";
import type {
  EnterpriseReleaseGateDecision,
  EnterpriseReleaseVerificationStatus
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseGoLiveChecklistState = {
  rehearsalReviewed: boolean;
  releaseGateDraftReviewed: boolean;
  verificationEvidenceReviewed: boolean;
  rollbackOwnerConfirmed: boolean;
  platformOwnerDecisionReviewed: boolean;
};

export const EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST: EnterpriseGoLiveChecklistState = {
  rehearsalReviewed: false,
  releaseGateDraftReviewed: false,
  verificationEvidenceReviewed: false,
  rollbackOwnerConfirmed: false,
  platformOwnerDecisionReviewed: false
};

// A confirmation is a claim about one release, in one environment, for one team.
// Move any of those three and the ticks on screen no longer describe what would be
// attested, so the held checklist is scoped by this key rather than kept as loose
// session state.
export type EnterpriseGoLiveChecklistScope = {
  teamId: string;
  environment: string;
  releaseVersion: string;
};

export type HeldEnterpriseGoLiveChecklist = {
  scopeKey: string;
  checklist: EnterpriseGoLiveChecklistState;
};

export function enterpriseGoLiveChecklistScopeKey(scope: EnterpriseGoLiveChecklistScope): string {
  // NUL-delimited: a team id or environment containing the delimiter cannot forge
  // another scope's key and inherit its confirmations.
  return [scope.teamId, scope.environment, scope.releaseVersion].join("\u0000");
}

export function enterpriseGoLiveChecklistForScope(
  held: HeldEnterpriseGoLiveChecklist,
  scopeKey: string
): EnterpriseGoLiveChecklistState {
  return held.scopeKey === scopeKey ? held.checklist : EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST;
}

export type EnterpriseGoLiveActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  goLiveChecklist: EnterpriseGoLiveChecklistState;
  releaseGateDecision: EnterpriseReleaseGateDecision;
  releaseGateVersion: string;
  releaseGateEnvironment: string;
  releaseGateApproverName: string;
  releaseGateApproverRole: string;
  releaseGateNotes: string;
  releaseGateVerificationStatus: EnterpriseReleaseVerificationStatus;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  exportEnterpriseJsonArtifact: (url: string, filename: string, label: string) => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setGoLiveChecklist: StateSetter<EnterpriseGoLiveChecklistState>;
  setReleaseGateDecision: StateSetter<EnterpriseReleaseGateDecision>;
  setReleaseGateEnvironment: StateSetter<string>;
  setReleaseGateVersion: StateSetter<string>;
  setReleaseGateNotes: StateSetter<string>;
  setReleaseGateVerificationStatus: StateSetter<EnterpriseReleaseVerificationStatus>;
  setReleaseGateVerificationSummary: StateSetter<string>;
  setReleaseGateVerificationHash: StateSetter<string>;
};

export function useEnterpriseGoLiveActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  goLiveChecklist,
  releaseGateDecision,
  releaseGateVersion,
  releaseGateEnvironment,
  releaseGateApproverName,
  releaseGateApproverRole,
  releaseGateNotes,
  releaseGateVerificationStatus,
  enterpriseJsonHeaders,
  exportEnterpriseJsonArtifact,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setGoLiveChecklist,
  setReleaseGateDecision,
  setReleaseGateEnvironment,
  setReleaseGateVersion,
  setReleaseGateNotes,
  setReleaseGateVerificationStatus,
  setReleaseGateVerificationSummary,
  setReleaseGateVerificationHash
}: EnterpriseGoLiveActionsOptions) {
  const exportEnterpriseGoLiveAttestationsJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
        attestations: 1,
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-go-live-attestations.json",
      "Enterprise go-live attestations"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseGoLiveRehearsalJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-go-live-rehearsal.json",
      "Enterprise go-live rehearsal"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseGoLiveRollbackDrillJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
        artifact: "rollback-drill",
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-go-live-rollback-drill.json",
      "Enterprise go-live rollback drill"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const exportEnterpriseGoLiveMonitorJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
        artifact: "post-cutover-monitor",
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-go-live-monitor.json",
      "Enterprise go-live monitor"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const applyEnterpriseGoLiveRehearsalDraft = useCallback(async () => {
    if (!enterpriseUserPresent) {
      setEnterpriseMessage("Sign in before applying the go-live rehearsal draft.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await getEnterpriseGoLiveRehearsalAction({
        teamId: activeEnterpriseTeamId || undefined
      });
      const draft = payload.releaseGateDraft;
      setReleaseGateDecision(draft.decision);
      setReleaseGateEnvironment(draft.environment);
      setReleaseGateVersion(draft.releaseVersion);
      setReleaseGateNotes(draft.notes);
      setReleaseGateVerificationStatus(draft.verificationEvidence.status);
      setReleaseGateVerificationSummary(draft.verificationEvidence.summary);
      setReleaseGateVerificationHash("");
      // The draft replaces the decision, environment, release version, notes, and
      // verification evidence the reviewer was looking at. Whatever they had already
      // confirmed was confirmed about the previous material, so it cannot ride along
      // into an attestation for this one.
      setGoLiveChecklist(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
      setEnterpriseMessage(`Go-live release gate draft applied: ${draft.releaseVersion} · ${draft.decision}. Re-confirm the go-live checklist before attesting.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Go-live rehearsal draft failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseUserPresent,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setGoLiveChecklist,
    setReleaseGateDecision,
    setReleaseGateEnvironment,
    setReleaseGateNotes,
    setReleaseGateVerificationHash,
    setReleaseGateVerificationStatus,
    setReleaseGateVerificationSummary,
    setReleaseGateVersion
  ]);

  const submitEnterpriseGoLiveAttestation = useCallback(async () => {
    if (!enterpriseUserPresent || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with team management access before recording go-live attestation.");
      return;
    }
    if (!releaseGateApproverName.trim() || !releaseGateApproverRole.trim() || !releaseGateEnvironment.trim() || !releaseGateVersion.trim() || !releaseGateNotes.trim()) {
      setEnterpriseMessage("Apply or complete release gate details before recording go-live attestation.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await submitEnterpriseGoLiveAttestationAction(
        {
          teamId: activeEnterpriseTeamId,
          environment: releaseGateEnvironment,
          releaseVersion: releaseGateVersion,
          decision: releaseGateDecision,
          attesterName: releaseGateApproverName,
          attesterRole: releaseGateApproverRole,
          notes: releaseGateNotes,
          checklist: {
            rehearsalReviewed: goLiveChecklist.rehearsalReviewed,
            releaseGateDraftReviewed: goLiveChecklist.releaseGateDraftReviewed,
            // The reviewer confirms they read the evidence; a passing status is not that confirmation.
            verificationEvidenceReviewed:
              goLiveChecklist.verificationEvidenceReviewed && releaseGateVerificationStatus === "passed",
            rollbackOwnerConfirmed: goLiveChecklist.rollbackOwnerConfirmed,
            platformOwnerDecisionReviewed: goLiveChecklist.platformOwnerDecisionReviewed
          }
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      // The confirmations have been spent on this attestation. Leaving them ticked
      // would let the next click record a second approved attestation asserting
      // reviews nobody repeated.
      setGoLiveChecklist(EMPTY_ENTERPRISE_GO_LIVE_CHECKLIST);
      setEnterpriseMessage(`Go-live attestation recorded: ${payload.attestation?.releaseVersion ?? releaseGateVersion} · ${payload.attestation?.decision ?? releaseGateDecision} · go-live identity ${payload.attestation?.latestReleaseGateSnapshot?.identityProductionStatus ?? "missing"} · identity verifier ${payload.attestation?.latestReleaseGateSnapshot?.identitySubmissionVerifierIncomplete ?? "missing"} incomplete · identity rotation ${payload.attestation?.latestReleaseGateSnapshot?.identityRotationFreshness ?? "missing"} · identity cutover ${payload.attestation?.latestReleaseGateSnapshot?.identityCutoverChecklistStatus ?? "missing"} · cutover blockers ${payload.attestation?.latestReleaseGateSnapshot?.identityCutoverChecklistBlockingItems ?? "missing"} · identity handoff ${payload.attestation?.identityProductionHandoffSnapshot?.status ?? "missing"} · handoff blockers ${payload.attestation?.identityProductionHandoffSnapshot?.platformRequestPacket.summary.blockingRequests ?? "missing"} · blocked ${payload.attestation?.latestReleaseGateSnapshot?.identityReleaseGateBlocked ? "yes" : "no"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Go-live attestation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    goLiveChecklist,
    releaseGateApproverName,
    releaseGateApproverRole,
    releaseGateDecision,
    releaseGateEnvironment,
    releaseGateNotes,
    releaseGateVerificationStatus,
    releaseGateVersion,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setGoLiveChecklist
  ]);

  return {
    applyEnterpriseGoLiveRehearsalDraft,
    exportEnterpriseGoLiveAttestationsJson,
    exportEnterpriseGoLiveMonitorJson,
    exportEnterpriseGoLiveRehearsalJson,
    exportEnterpriseGoLiveRollbackDrillJson,
    submitEnterpriseGoLiveAttestation
  };
}
