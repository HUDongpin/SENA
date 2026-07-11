"use client";

import { useCallback } from "react";
import type { SenaDataset } from "@/lib/sena/types";
import {
  buildSenaRuntimeBundle,
  type SenaCodingReliabilityReview,
  type SenaDataGovernanceMetadata,
  type SenaModel,
  type SenaReportHumanReview,
  type SenaTemporalRuntimeTrace,
  type SenaTemporalWindow
} from "./analysis-runtime";
import type { DemoManualReviewState } from "./use-demo-verification-manual-review-actions";

type DownloadText = (filename: string, text: string, mimeType: string) => void;

export type RuntimeBundleExportActionsOptions = {
  activeTemporalWindow: SenaTemporalWindow | null | undefined;
  codingReliabilityReview: Partial<SenaCodingReliabilityReview>;
  dataGovernanceReview: Partial<SenaDataGovernanceMetadata>;
  dataset: SenaDataset;
  demoManualReviews: DemoManualReviewState;
  downloadText: DownloadText;
  interpretation: string;
  limitations: string;
  model: SenaModel;
  nextActions: string;
  reportTitle: string;
  reviewer: string;
  reviewStatus: SenaReportHumanReview["status"];
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
};

export function useRuntimeBundleExportActions({
  activeTemporalWindow,
  codingReliabilityReview,
  dataGovernanceReview,
  dataset,
  demoManualReviews,
  downloadText,
  interpretation,
  limitations,
  model,
  nextActions,
  reportTitle,
  reviewer,
  reviewStatus,
  temporalRuntimeTrace
}: RuntimeBundleExportActionsOptions) {
  const exportRuntimeBundleJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-runtime-bundle.json",
      JSON.stringify(
        buildSenaRuntimeBundle(model, {
          title: `${reportTitle} Runtime Bundle`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null,
          sourceDataset: dataset,
          temporalRuntimeTrace,
          evidenceLimit: 500,
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
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [
    activeTemporalWindow,
    codingReliabilityReview,
    dataGovernanceReview,
    dataset,
    demoManualReviews,
    downloadText,
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
    exportRuntimeBundleJson
  };
}
