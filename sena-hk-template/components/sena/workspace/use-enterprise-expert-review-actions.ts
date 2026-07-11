"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  submitEnterpriseExpertReviewAction,
  updateEnterpriseExpertReviewAction
} from "./enterprise-actions";
import type { EnterpriseCollaborationState } from "./enterprise-contracts";
import {
  buildSenaWorkspaceApiUrl,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type ExpertReviewStatus = "approved" | "changes-requested" | "rejected";
type EnterpriseExpertReview = EnterpriseCollaborationState["expertReviews"][number];

export type EnterpriseExpertReviewActionsOptions = {
  activeEnterpriseTeamId: string;
  activeEnterpriseProjectId: string;
  latestEnterpriseValidationRunId?: string;
  latestEnterpriseExpertReview?: EnterpriseExpertReview | null;
  expertReviewerName: string;
  expertExpertiseArea: string;
  expertClaimScope: EnterpriseExpertReview["claimScope"];
  expertDataAdequacy: number;
  expertMethodFit: number;
  expertInterpretationValidity: number;
  expertConcerns: string;
  expertRecommendations: string;
  limitations: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  refreshEnterpriseCollaboration: (projectId?: string) => Promise<void>;
  exportEnterpriseJsonArtifact: (url: string, filename: string, label: string) => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setExpertConcerns: StateSetter<string>;
  setExpertRecommendations: StateSetter<string>;
};

export function useEnterpriseExpertReviewActions({
  activeEnterpriseTeamId,
  activeEnterpriseProjectId,
  latestEnterpriseValidationRunId,
  latestEnterpriseExpertReview,
  expertReviewerName,
  expertExpertiseArea,
  expertClaimScope,
  expertDataAdequacy,
  expertMethodFit,
  expertInterpretationValidity,
  expertConcerns,
  expertRecommendations,
  limitations,
  enterpriseJsonHeaders,
  refreshEnterpriseCollaboration,
  exportEnterpriseJsonArtifact,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setExpertConcerns,
  setExpertRecommendations
}: EnterpriseExpertReviewActionsOptions) {
  const exportEnterpriseExpertReviewDossierJson = useCallback(async () => {
    await exportEnterpriseJsonArtifact(
      buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.expertReview, {
        teamId: activeEnterpriseTeamId || undefined,
        projectId: activeEnterpriseProjectId || undefined
      }),
      "sena-enterprise-expert-review-dossier.json",
      "Enterprise expert review dossier"
    );
  }, [activeEnterpriseProjectId, activeEnterpriseTeamId, exportEnterpriseJsonArtifact]);

  const submitEnterpriseExpertReview = useCallback(async (status: ExpertReviewStatus = "approved") => {
    if (!activeEnterpriseProjectId) {
      setEnterpriseMessage("Save or select a server project before recording expert review.");
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await submitEnterpriseExpertReviewAction(
        {
          projectId: activeEnterpriseProjectId,
          target: {
            kind: latestEnterpriseValidationRunId ? "validation-run" : "project",
            id: latestEnterpriseValidationRunId,
            label: latestEnterpriseValidationRunId ? "Latest validation run" : "Project claim review"
          },
          reviewerName: expertReviewerName || undefined,
          expertiseArea: expertExpertiseArea || undefined,
          status,
          claimScope: expertClaimScope,
          ratings: {
            dataAdequacy: expertDataAdequacy,
            methodFit: expertMethodFit,
            interpretationValidity: expertInterpretationValidity
          },
          concerns: expertConcerns,
          recommendations: expertRecommendations,
          limitations
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setExpertConcerns("");
      setExpertRecommendations("");
      await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Expert review ${payload.expertReview.id} recorded: ${payload.expertReview.status}, ${payload.expertReview.claimScope}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Expert review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseJsonHeaders,
    expertClaimScope,
    expertConcerns,
    expertDataAdequacy,
    expertExpertiseArea,
    expertInterpretationValidity,
    expertMethodFit,
    expertRecommendations,
    expertReviewerName,
    latestEnterpriseValidationRunId,
    limitations,
    refreshEnterpriseCollaboration,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setExpertConcerns,
    setExpertRecommendations
  ]);

  const updateEnterpriseExpertReview = useCallback(async (status: ExpertReviewStatus) => {
    if (!latestEnterpriseExpertReview) return;
    setEnterpriseBusy(true);
    try {
      const payload = await updateEnterpriseExpertReviewAction(
        {
          reviewId: latestEnterpriseExpertReview.id,
          status,
          claimScope: expertClaimScope,
          ratings: {
            dataAdequacy: expertDataAdequacy,
            methodFit: expertMethodFit,
            interpretationValidity: expertInterpretationValidity
          },
          concerns: expertConcerns || latestEnterpriseExpertReview.concerns,
          recommendations: expertRecommendations || latestEnterpriseExpertReview.recommendations,
          limitations
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Expert review ${payload.expertReview.id} marked ${payload.expertReview.status}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Expert review update failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseJsonHeaders,
    expertClaimScope,
    expertConcerns,
    expertDataAdequacy,
    expertInterpretationValidity,
    expertMethodFit,
    expertRecommendations,
    latestEnterpriseExpertReview,
    limitations,
    refreshEnterpriseCollaboration,
    setEnterpriseBusy,
    setEnterpriseMessage
  ]);

  return {
    exportEnterpriseExpertReviewDossierJson,
    submitEnterpriseExpertReview,
    updateEnterpriseExpertReview
  };
}
