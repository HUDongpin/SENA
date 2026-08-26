"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { SenaEnterpriseImportResult } from "@/lib/sena/import-adapters";
import type { SenaLocalReliabilityImportResult } from "@/lib/sena/reliability-adapters";
import type {
  SenaCodingReliabilityReview,
  SenaDataGovernanceMetadata,
  SenaDataset,
  SenaNormalization,
  SenaProjectSnapshot,
  SenaReportHumanReview,
  SenaTemporalMode,
  SenaTemporalWindow
} from "@/lib/sena/types";
import type { SenaSnapshotRestoreResult } from "@/lib/sena/snapshot-restore";
import { requestSenaSnapshotRestore } from "./api-client";
import type { LocalEnterpriseValidationResult } from "./enterprise-contracts";
import type { UploadedSenaTable } from "./uploaded-table-mapper";
import type { DemoManualReviewState } from "./use-demo-verification-manual-review-actions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type ProjectSnapshotRestoreActionOptions = {
  setActiveTemporalWindow: StateSetter<SenaTemporalWindow | null>;
  setAdjudicationNotes: StateSetter<string>;
  setAgreementMetric: StateSetter<string>;
  setAgreementValue: StateSetter<string>;
  setAlpha: StateSetter<number>;
  setBeta: StateSetter<number>;
  setCoderCount: StateSetter<number>;
  setCodingReliabilityReviewer: StateSetter<string>;
  setCodingReliabilityStatus: StateSetter<SenaCodingReliabilityReview["status"]>;
  setCodingScheme: StateSetter<string>;
  setDataGovernanceConsentScope: StateSetter<string>;
  setDataGovernanceDataSteward: StateSetter<string>;
  setDataGovernanceIrbApprovalId: StateSetter<string>;
  setDataGovernanceRetentionPolicy: StateSetter<string>;
  setDataGovernanceUsageConstraints: StateSetter<string>;
  setDataset: StateSetter<SenaDataset>;
  setDemoManualReviews: StateSetter<DemoManualReviewState>;
  setGamma: StateSetter<number>;
  setImportError: StateSetter<string | null>;
  setImportMessage: StateSetter<string>;
  setInterpretation: StateSetter<string>;
  setLimitations: StateSetter<string>;
  setLocalEnterpriseImportResult: StateSetter<SenaEnterpriseImportResult | null>;
  setLocalEnterpriseReliabilityResult: StateSetter<SenaLocalReliabilityImportResult | null>;
  setLocalEnterpriseValidationResult: StateSetter<LocalEnterpriseValidationResult | null>;
  setMovingWindowSize: StateSetter<number>;
  setMovingWindowStep: StateSetter<number>;
  setNextActions: StateSetter<string>;
  setNormalization: StateSetter<SenaNormalization>;
  setReliabilityLimitations: StateSetter<string>;
  setReportTitle: StateSetter<string>;
  setReviewStatus: StateSetter<SenaReportHumanReview["status"]>;
  setReviewer: StateSetter<string>;
  setSelectedId: StateSetter<string>;
  setTemporalMode: StateSetter<SenaTemporalMode>;
  setTurnWindowRadius: StateSetter<number>;
  setUnitOfCoding: StateSetter<string>;
  setUploadedTables: StateSetter<UploadedSenaTable[]>;
};

export function useProjectSnapshotRestoreAction({
  setActiveTemporalWindow,
  setAdjudicationNotes,
  setAgreementMetric,
  setAgreementValue,
  setAlpha,
  setBeta,
  setCoderCount,
  setCodingReliabilityReviewer,
  setCodingReliabilityStatus,
  setCodingScheme,
  setDataGovernanceConsentScope,
  setDataGovernanceDataSteward,
  setDataGovernanceIrbApprovalId,
  setDataGovernanceRetentionPolicy,
  setDataGovernanceUsageConstraints,
  setDataset,
  setDemoManualReviews,
  setGamma,
  setImportError,
  setImportMessage,
  setInterpretation,
  setLimitations,
  setLocalEnterpriseImportResult,
  setLocalEnterpriseReliabilityResult,
  setLocalEnterpriseValidationResult,
  setMovingWindowSize,
  setMovingWindowStep,
  setNextActions,
  setNormalization,
  setReliabilityLimitations,
  setReportTitle,
  setReviewStatus,
  setReviewer,
  setSelectedId,
  setTemporalMode,
  setTurnWindowRadius,
  setUnitOfCoding,
  setUploadedTables
}: ProjectSnapshotRestoreActionOptions) {
  const hydrateProjectSnapshot = useCallback((snapshot: SenaProjectSnapshot, fileName: string) => {
    const options = snapshot.reproducibility.buildOptions;
    const sourceDataset = snapshot.source.sourceDataset ?? snapshot.dataset;
    const review = snapshot.report.humanReview;
    const reliability = snapshot.report.codingReliabilityGate?.review;
    const governance: Partial<SenaDataGovernanceMetadata> | undefined = snapshot.dataGovernance ?? snapshot.report.dataGovernance;
    const restoredManualReviews = snapshot.workspaceState?.demoVerificationManualReviews ?? {};

    setDataset(sourceDataset);
    setUploadedTables([]);
    setLocalEnterpriseImportResult(null);
    setLocalEnterpriseReliabilityResult(null);
    setLocalEnterpriseValidationResult(null);
    setAlpha(options.alpha);
    setBeta(options.beta);
    setGamma(options.gamma);
    setNormalization(options.normalization);
    setTemporalMode(options.temporal.mode);
    setMovingWindowSize(options.temporal.movingWindowSize);
    setMovingWindowStep(options.temporal.movingWindowStep);
    setTurnWindowRadius(options.temporal.turnWindowRadius);
    setReportTitle(snapshot.title || snapshot.report.title || "SENA Analysis Report");
    setReviewStatus(review.status);
    setReviewer(review.reviewer);
    setInterpretation(review.interpretation);
    setLimitations(review.limitations);
    setNextActions(review.nextActions);
    if (reliability) {
      setCodingReliabilityStatus(reliability.status);
      setCodingReliabilityReviewer(reliability.reviewer);
      setCodingScheme(reliability.codingScheme);
      setUnitOfCoding(reliability.unitOfCoding);
      setCoderCount(reliability.coderCount);
      setAgreementMetric(reliability.agreementMetric);
      setAgreementValue(reliability.agreementValue);
      setAdjudicationNotes(reliability.adjudicationNotes);
      setReliabilityLimitations(reliability.limitations);
    }
    setDataGovernanceIrbApprovalId(governance?.irbApprovalId ?? "");
    setDataGovernanceConsentScope(governance?.consentScope ?? "");
    setDataGovernanceRetentionPolicy(governance?.retentionPolicy ?? "");
    setDataGovernanceUsageConstraints((governance?.usageConstraints ?? []).join("\n"));
    setDataGovernanceDataSteward(governance?.dataSteward ?? "");
    setDemoManualReviews(restoredManualReviews);
    setSelectedId("");
    setActiveTemporalWindow(snapshot.source.activeTemporalWindow);
    setImportMessage(`${fileName}: project snapshot restored${Object.keys(restoredManualReviews).length > 0 ? " with demo verification records" : ""}.`);
    setImportError(null);
  }, [
    setActiveTemporalWindow,
    setAdjudicationNotes,
    setAgreementMetric,
    setAgreementValue,
    setAlpha,
    setBeta,
    setCoderCount,
    setCodingReliabilityReviewer,
    setCodingReliabilityStatus,
    setCodingScheme,
    setDataGovernanceConsentScope,
    setDataGovernanceDataSteward,
    setDataGovernanceIrbApprovalId,
    setDataGovernanceRetentionPolicy,
    setDataGovernanceUsageConstraints,
    setDataset,
    setDemoManualReviews,
    setGamma,
    setImportError,
    setImportMessage,
    setInterpretation,
    setLimitations,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setMovingWindowSize,
    setMovingWindowStep,
    setNextActions,
    setNormalization,
    setReliabilityLimitations,
    setReportTitle,
    setReviewStatus,
    setReviewer,
    setSelectedId,
    setTemporalMode,
    setTurnWindowRadius,
    setUnitOfCoding,
    setUploadedTables
  ]);

  const restoreValidatedProjectSnapshot = useCallback((
    result: SenaSnapshotRestoreResult,
    fileName: string
  ) => {
    hydrateProjectSnapshot(result.snapshot, fileName);
  }, [hydrateProjectSnapshot]);

  const restoreProjectSnapshot = useCallback(async (snapshot: SenaProjectSnapshot, fileName: string) => {
    restoreValidatedProjectSnapshot(await requestSenaSnapshotRestore(snapshot), fileName);
  }, [restoreValidatedProjectSnapshot]);

  return {
    restoreProjectSnapshot,
    restoreValidatedProjectSnapshot
  };
}
