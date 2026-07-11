"use client";

import { type ChangeEvent, type Dispatch, type SetStateAction, useCallback } from "react";
import type { SenaLocalReliabilityImportResult } from "@/lib/sena/reliability-adapters";
import {
  importEnterpriseReliabilityFilesAction,
  reviewEnterpriseReliabilityRunAction
} from "./enterprise-actions";
import type { EnterpriseCollaborationState } from "./enterprise-contracts";
import type { SenaCodingReliabilityReview } from "./analysis-runtime";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type EnterpriseReliabilityRun = EnterpriseCollaborationState["reliabilityRuns"][number];
type EnterpriseReliabilityReviewStatus = Extract<EnterpriseReliabilityRun["status"], "approved" | "rejected" | "pending-adjudication">;

export type EnterpriseReliabilityActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  activeEnterpriseProjectId: string;
  latestEnterpriseReliabilityRunId?: string;
  reliabilityReviewNote: string;
  codingReliabilityReviewer: string;
  reviewer: string;
  codingScheme: string;
  unitOfCoding: string;
  coderCount: number;
  agreementMetric: string;
  agreementValue: string;
  adjudicationNotes: string;
  reliabilityLimitations: string;
  enterpriseJsonHeaders: () => Promise<Record<string, string>>;
  enterpriseCsrfHeaders: () => Promise<Record<string, string>>;
  refreshEnterpriseCollaboration: (projectId?: string) => Promise<void>;
  setEnterpriseBusy: StateSetter<boolean>;
  setEnterpriseMessage: StateSetter<string>;
  setLocalEnterpriseReliabilityResult: StateSetter<SenaLocalReliabilityImportResult | null>;
  setReliabilityReviewNote: StateSetter<string>;
  setCodingReliabilityStatus: StateSetter<SenaCodingReliabilityReview["status"]>;
  setCodingReliabilityReviewer: StateSetter<string>;
  setCodingScheme: StateSetter<string>;
  setUnitOfCoding: StateSetter<string>;
  setCoderCount: StateSetter<number>;
  setAgreementMetric: StateSetter<string>;
  setAgreementValue: StateSetter<string>;
  setAdjudicationNotes: StateSetter<string>;
  setReliabilityLimitations: StateSetter<string>;
};

export function useEnterpriseReliabilityActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  activeEnterpriseProjectId,
  latestEnterpriseReliabilityRunId,
  reliabilityReviewNote,
  codingReliabilityReviewer,
  reviewer,
  codingScheme,
  unitOfCoding,
  coderCount,
  agreementMetric,
  agreementValue,
  adjudicationNotes,
  reliabilityLimitations,
  enterpriseJsonHeaders,
  enterpriseCsrfHeaders,
  refreshEnterpriseCollaboration,
  setEnterpriseBusy,
  setEnterpriseMessage,
  setLocalEnterpriseReliabilityResult,
  setReliabilityReviewNote,
  setCodingReliabilityStatus,
  setCodingReliabilityReviewer,
  setCodingScheme,
  setUnitOfCoding,
  setCoderCount,
  setAgreementMetric,
  setAgreementValue,
  setAdjudicationNotes,
  setReliabilityLimitations
}: EnterpriseReliabilityActionsOptions) {
  const applyReliabilityReviewPatch = useCallback((review: Partial<SenaCodingReliabilityReview>) => {
    setCodingReliabilityStatus(review.status ?? "documented");
    setCodingReliabilityReviewer(review.reviewer ?? codingReliabilityReviewer ?? reviewer);
    setCodingScheme(review.codingScheme ?? codingScheme);
    setUnitOfCoding(review.unitOfCoding ?? unitOfCoding);
    setCoderCount(Number(review.coderCount ?? coderCount));
    setAgreementMetric(review.agreementMetric ?? agreementMetric);
    setAgreementValue(review.agreementValue ?? agreementValue);
    setAdjudicationNotes(review.adjudicationNotes ?? adjudicationNotes);
    setReliabilityLimitations(review.limitations ?? reliabilityLimitations);
  }, [
    adjudicationNotes,
    agreementMetric,
    agreementValue,
    coderCount,
    codingReliabilityReviewer,
    codingScheme,
    reliabilityLimitations,
    reviewer,
    setAdjudicationNotes,
    setAgreementMetric,
    setAgreementValue,
    setCoderCount,
    setCodingReliabilityReviewer,
    setCodingReliabilityStatus,
    setCodingScheme,
    setReliabilityLimitations,
    setUnitOfCoding,
    unitOfCoding
  ]);

  const reviewEnterpriseReliabilityRun = useCallback(async (status: EnterpriseReliabilityReviewStatus) => {
    if (!latestEnterpriseReliabilityRunId) return;
    setEnterpriseBusy(true);
    try {
      const payload = await reviewEnterpriseReliabilityRunAction(
        {
          runId: latestEnterpriseReliabilityRunId,
          status,
          notes: reliabilityReviewNote
        },
        { jsonHeaders: enterpriseJsonHeaders }
      );
      setReliabilityReviewNote("");
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Reliability run ${payload.reliabilityRun.id} marked ${payload.reliabilityRun.status}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Reliability review failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseProjectId,
    enterpriseJsonHeaders,
    latestEnterpriseReliabilityRunId,
    refreshEnterpriseCollaboration,
    reliabilityReviewNote,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setReliabilityReviewNote
  ]);

  const importReliabilityFilesLocally = useCallback(async (files: File[]) => {
    setEnterpriseBusy(true);
    try {
      const { importSenaReliabilityFiles } = await import("@/lib/sena/reliability-adapters");
      const result = await importSenaReliabilityFiles(files, codingReliabilityReviewer || reviewer || "SENA reliability workflow");
      setLocalEnterpriseReliabilityResult(result);
      applyReliabilityReviewPatch(result.reviewPatch);
      setEnterpriseMessage(`Local reliability dashboard calculated without sign-in: kappa ${result.dashboard.meanPairwiseKappa}, alpha ${result.dashboard.krippendorffAlphaNominal}, disagreements ${result.dashboard.disagreementCount}. Sign in to persist reliability runs and adjudication coverage.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Local reliability calculation failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    applyReliabilityReviewPatch,
    codingReliabilityReviewer,
    reviewer,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setLocalEnterpriseReliabilityResult
  ]);

  const handleReliabilityUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    if (!enterpriseUserPresent) {
      try {
        await importReliabilityFilesLocally(files);
      } finally {
        input.value = "";
      }
      return;
    }
    setEnterpriseBusy(true);
    try {
      const payload = await importEnterpriseReliabilityFilesAction(
        {
          files,
          teamId: activeEnterpriseTeamId || undefined,
          projectId: activeEnterpriseProjectId || undefined,
          reviewer: codingReliabilityReviewer || reviewer || undefined
        },
        { csrfHeaders: enterpriseCsrfHeaders }
      );
      const review = payload.reviewPatch ?? {};
      applyReliabilityReviewPatch(review);
      setLocalEnterpriseReliabilityResult(null);
      if (activeEnterpriseProjectId) await refreshEnterpriseCollaboration(activeEnterpriseProjectId);
      setEnterpriseMessage(`Reliability run ${payload.reliabilityRun?.id ?? "local"} saved: kappa ${payload.dashboard.meanPairwiseKappa}, alpha ${payload.dashboard.krippendorffAlphaNominal}, disagreements ${payload.dashboard.disagreementCount}.`);
    } catch (error) {
      setEnterpriseMessage(error instanceof Error ? error.message : "Reliability calculation failed.");
    } finally {
      setEnterpriseBusy(false);
      input.value = "";
    }
  }, [
    activeEnterpriseProjectId,
    activeEnterpriseTeamId,
    applyReliabilityReviewPatch,
    codingReliabilityReviewer,
    enterpriseCsrfHeaders,
    enterpriseUserPresent,
    importReliabilityFilesLocally,
    refreshEnterpriseCollaboration,
    reviewer,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setLocalEnterpriseReliabilityResult
  ]);

  return {
    handleReliabilityUpload,
    reviewEnterpriseReliabilityRun
  };
}
