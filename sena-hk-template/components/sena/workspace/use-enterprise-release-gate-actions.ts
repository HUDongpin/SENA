"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  buildSenaWorkspaceApiUrl,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import { submitEnterpriseReleaseGateReviewAction } from "./enterprise-ops-actions";
import type {
  EnterpriseReleaseGateDecision,
  EnterpriseReleaseVerificationStatus
} from "./enterprise-contracts";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type EnterpriseReleaseGateActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  releaseGateDecision: EnterpriseReleaseGateDecision;
  releaseGateVersion: string;
  releaseGateEnvironment: string;
  releaseGateApproverName: string;
  releaseGateApproverRole: string;
  releaseGateNotes: string;
  releaseGateVerificationStatus: EnterpriseReleaseVerificationStatus;
  releaseGateVerificationSummary: string;
  releaseGateVerificationHash: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  refreshEnterpriseReleaseGateReviews: (teamId?: string) => Promise<unknown>;
  refreshEnterpriseProvisioningReadiness: (options?: { silent?: boolean }) => Promise<unknown>;
  exportEnterpriseJsonArtifact: (url: string, filename: string, label: string) => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setReleaseGateNotes: StateSetter<string>;
};

export function useEnterpriseReleaseGateActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  releaseGateDecision,
  releaseGateVersion,
  releaseGateEnvironment,
  releaseGateApproverName,
  releaseGateApproverRole,
  releaseGateNotes,
  releaseGateVerificationStatus,
  releaseGateVerificationSummary,
  releaseGateVerificationHash,
  enterpriseJsonHeaders,
  refreshEnterpriseReleaseGateReviews,
  refreshEnterpriseProvisioningReadiness,
  exportEnterpriseJsonArtifact,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setReleaseGateNotes
}: EnterpriseReleaseGateActionsOptions) {
  const exportEnterpriseReleaseGateReviewsJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.releaseGate, {
        teamId: activeEnterpriseTeamId || undefined
      }),
      "sena-enterprise-release-gate-reviews.json",
      "Enterprise release gate reviews"
    );
  }, [activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const submitEnterpriseReleaseGateReview = useCallback(async () => {
    if (!enterpriseUserPresent || !activeEnterpriseTeamId) {
      setEnterpriseMessage("Sign in with team management access before recording release gate reviews.");
      return;
    }
    if (!releaseGateApproverName.trim() || !releaseGateApproverRole.trim() || !releaseGateEnvironment.trim() || !releaseGateVersion.trim() || !releaseGateNotes.trim() || !releaseGateVerificationSummary.trim()) {
      setEnterpriseMessage("Add approver, role, environment, release version, notes, and verification evidence before recording a release gate review.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await submitEnterpriseReleaseGateReviewAction(
        {
          teamId: activeEnterpriseTeamId,
          environment: releaseGateEnvironment,
          releaseVersion: releaseGateVersion,
          decision: releaseGateDecision,
          approverName: releaseGateApproverName,
          approverRole: releaseGateApproverRole,
          notes: releaseGateNotes,
          verificationCommand: "npm run sena:pilot:verify",
          verificationEvidence: {
            status: releaseGateVerificationStatus,
            summary: releaseGateVerificationSummary,
            outputSha256: /^[a-f0-9]{64}$/i.test(releaseGateVerificationHash.trim()) ? releaseGateVerificationHash.trim() : undefined
          }
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setReleaseGateNotes("");
      await refreshEnterpriseReleaseGateReviews(activeEnterpriseTeamId);
      await refreshEnterpriseProvisioningReadiness();
      setEnterpriseMessage(`Release gate recorded: ${payload.review?.releaseVersion ?? releaseGateVersion} · ${payload.review?.decision ?? releaseGateDecision} · release gate identity ${payload.review?.identityProductionSnapshot?.status ?? "missing"} · verifier ${payload.review?.identityProductionSnapshot?.submissionVerifier.incompleteDecisions ?? "missing"} incomplete · rotation ${payload.review?.identityProductionSnapshot?.rotationFreshness.status ?? "missing"} · cutover ${payload.review?.identityProductionSnapshot?.cutoverChecklist.status ?? "missing"} · cutover blockers ${payload.review?.identityProductionSnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"} · blocked ${payload.review?.identityProductionSnapshot?.releaseGateBlocked ? "yes" : "no"}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Release gate review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseJsonHeaders,
    enterpriseUserPresent,
    refreshEnterpriseProvisioningReadiness,
    refreshEnterpriseReleaseGateReviews,
    releaseGateApproverName,
    releaseGateApproverRole,
    releaseGateDecision,
    releaseGateEnvironment,
    releaseGateNotes,
    releaseGateVerificationHash,
    releaseGateVerificationStatus,
    releaseGateVerificationSummary,
    releaseGateVersion,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setReleaseGateNotes
  ]);

  return {
    exportEnterpriseReleaseGateReviewsJson,
    submitEnterpriseReleaseGateReview
  };
}
