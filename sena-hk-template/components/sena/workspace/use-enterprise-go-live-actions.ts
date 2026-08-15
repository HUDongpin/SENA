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
      setEnterpriseMessage(`Go-live release gate draft applied: ${draft.releaseVersion} · ${draft.decision}.`);
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
    setEnterpriseMessage
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
