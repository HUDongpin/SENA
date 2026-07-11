"use client";

import { useCallback } from "react";
import type { SenaDataset } from "@/lib/sena/types";
import {
  buildSenaProjectSnapshot,
  type SenaCodingReliabilityReview,
  type SenaDataGovernanceMetadata,
  type SenaModel,
  type SenaProjectSnapshot,
  type SenaReportHumanReview,
  type SenaTemporalRuntimeTrace,
  type SenaTemporalWindow
} from "./analysis-runtime";
import type { DemoManualReviewState } from "./use-demo-verification-manual-review-actions";

export type CurrentProjectSnapshotBuilderOptions = {
  activeTemporalWindow: SenaTemporalWindow | null | undefined;
  codingReliabilityReview: Partial<SenaCodingReliabilityReview>;
  dataGovernanceReview: Partial<SenaDataGovernanceMetadata>;
  dataset: SenaDataset;
  demoManualReviews: DemoManualReviewState;
  interpretation: string;
  limitations: string;
  model: SenaModel;
  nextActions: string;
  reportTitle: string;
  reviewer: string;
  reviewStatus: SenaReportHumanReview["status"];
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
};

export function useCurrentProjectSnapshotBuilder({
  activeTemporalWindow,
  codingReliabilityReview,
  dataGovernanceReview,
  dataset,
  demoManualReviews,
  interpretation,
  limitations,
  model,
  nextActions,
  reportTitle,
  reviewer,
  reviewStatus,
  temporalRuntimeTrace
}: CurrentProjectSnapshotBuilderOptions) {
  const buildCurrentProjectSnapshot = useCallback((generatedAt = new Date().toISOString()): SenaProjectSnapshot => (
    buildSenaProjectSnapshot(model, {
      title: reportTitle,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      sourceDataset: dataset,
      temporalRuntimeTrace,
      demoVerificationManualReviews: demoManualReviews,
      humanReview: {
        status: reviewStatus,
        reviewer,
        reviewedAt: generatedAt,
        interpretation,
        limitations,
        nextActions
      },
      codingReliability: {
        ...codingReliabilityReview,
        reviewedAt: generatedAt
      },
      dataGovernance: dataGovernanceReview
    })
  ), [
    activeTemporalWindow,
    codingReliabilityReview,
    dataGovernanceReview,
    dataset,
    demoManualReviews,
    interpretation,
    limitations,
    model,
    nextActions,
    reportTitle,
    reviewer,
    reviewStatus,
    temporalRuntimeTrace
  ]);

  return {
    buildCurrentProjectSnapshot
  };
}
