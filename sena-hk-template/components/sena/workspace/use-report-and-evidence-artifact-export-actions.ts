"use client";

import { useCallback } from "react";
import type { SenaReliabilityDashboard } from "@/lib/sena/reliability";
import type { SenaGroupComparisonValidationResult } from "@/lib/sena/inference";
import {
  buildSenaCodingReliabilityGate,
  buildSenaDemoVerification,
  buildSenaDemoVerificationCompatibilityAudit,
  buildSenaDemoWalkthrough,
  buildSenaDevelopmentPlan,
  buildSenaEvidenceLedger,
  buildSenaMarkdownReport,
  buildSenaProductionPageContract,
  buildSenaReport,
  buildSenaReviewPacket,
  type SenaClaimReadinessGate,
  type SenaCodingReliabilityReview,
  type SenaDataGovernanceMetadata,
  type SenaModel,
  type SenaPilotReadinessAudit,
  type SenaReportHumanReview,
  type SenaTemporalRuntimeTrace,
  type SenaTemporalWindow
} from "./analysis-runtime";
import type {
  EnterpriseCollaborationState,
  LocalEnterpriseValidationResult,
  LocalValidationPreregistrationPlan
} from "./enterprise-contracts";
import type { DemoManualReviewState } from "./use-demo-verification-manual-review-actions";
import type { SenaDataset } from "@/lib/sena/types";

type DownloadText = (filename: string, text: string, mimeType: string) => void;
type EnterpriseReliabilityDashboard = NonNullable<EnterpriseCollaborationState["reliabilityRuns"][number]["dashboard"]>;
type ReliabilityDashboardExport = SenaReliabilityDashboard | EnterpriseReliabilityDashboard;

export type ReportAndEvidenceArtifactExportActionsOptions = {
  activeTemporalWindow: SenaTemporalWindow | null | undefined;
  claimReadinessGate: SenaClaimReadinessGate;
  codingReliabilityReview: Partial<SenaCodingReliabilityReview>;
  dataGovernanceReview: Partial<SenaDataGovernanceMetadata>;
  dataset: SenaDataset;
  demoManualReviews: DemoManualReviewState;
  downloadText: DownloadText;
  interpretation: string;
  latestReliabilityDashboard: ReliabilityDashboardExport | null | undefined;
  latestValidationPreregistrationPlan: LocalValidationPreregistrationPlan | null | undefined;
  latestValidationResult: SenaGroupComparisonValidationResult | null | undefined;
  limitations: string;
  localEnterpriseValidationResult: LocalEnterpriseValidationResult | null;
  model: SenaModel;
  nextActions: string;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  reportTitle: string;
  reviewer: string;
  reviewStatus: SenaReportHumanReview["status"];
  setEnterpriseMessage: (message: string) => void;
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
};

export function useReportAndEvidenceArtifactExportActions({
  activeTemporalWindow,
  claimReadinessGate,
  codingReliabilityReview,
  dataGovernanceReview,
  dataset,
  demoManualReviews,
  downloadText,
  interpretation,
  latestReliabilityDashboard,
  latestValidationPreregistrationPlan,
  latestValidationResult,
  limitations,
  localEnterpriseValidationResult,
  model,
  nextActions,
  pilotReadinessAudit,
  reportTitle,
  reviewer,
  reviewStatus,
  setEnterpriseMessage,
  temporalRuntimeTrace
}: ReportAndEvidenceArtifactExportActionsOptions) {
  const buildCurrentReport = useCallback((generatedAt = new Date().toISOString()) => (
    buildSenaReport(model, {
      title: reportTitle,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      sourceDataset: dataset,
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
    interpretation,
    limitations,
    model,
    nextActions,
    reportTitle,
    reviewer,
    reviewStatus
  ]);

  const buildCurrentEvidenceLedger = useCallback((generatedAt = new Date().toISOString()) => (
    buildSenaEvidenceLedger(model, {
      title: `${reportTitle} Evidence Ledger`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      evidenceLimit: 500,
      humanReview: {
        status: reviewStatus,
        reviewer,
        reviewedAt: generatedAt,
        interpretation,
        limitations,
        nextActions
      }
    })
  ), [
    activeTemporalWindow,
    interpretation,
    limitations,
    model,
    nextActions,
    reportTitle,
    reviewer,
    reviewStatus
  ]);

  const exportEvidenceLedgerJson = useCallback(() => {
    downloadText(
      "sena-evidence-ledger.json",
      JSON.stringify(buildCurrentEvidenceLedger(), null, 2),
      "application/json"
    );
  }, [buildCurrentEvidenceLedger, downloadText]);

  const exportDemoWalkthroughJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-demo-walkthrough.json",
      JSON.stringify(
        buildSenaDemoWalkthrough(model, {
          title: `${reportTitle} Demo Walkthrough`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null,
          pilotReadinessAudit,
          temporalRuntimeTrace
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, downloadText, model, pilotReadinessAudit, reportTitle, temporalRuntimeTrace]);

  const exportDemoVerificationJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    const demoVerification = buildSenaDemoVerification(model, {
      title: `${reportTitle} Demo Verification`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace,
      manualReviews: demoManualReviews
    });

    downloadText(
      "sena-demo-verification.json",
      JSON.stringify(demoVerification, null, 2),
      "application/json"
    );
  }, [activeTemporalWindow, demoManualReviews, downloadText, model, pilotReadinessAudit, reportTitle, temporalRuntimeTrace]);

  const exportDemoVerificationCompatibilityJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    const demoVerification = buildSenaDemoVerification(model, {
      title: `${reportTitle} Demo Verification`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace,
      manualReviews: demoManualReviews
    });

    downloadText(
      "sena-demo-verification-compatibility-audit.json",
      JSON.stringify(buildSenaDemoVerificationCompatibilityAudit(model, demoVerification), null, 2),
      "application/json"
    );
  }, [activeTemporalWindow, demoManualReviews, downloadText, model, pilotReadinessAudit, reportTitle, temporalRuntimeTrace]);

  const exportProductionPageContractJson = useCallback(() => {
    downloadText(
      "sena-production-page-contract.json",
      JSON.stringify(buildSenaProductionPageContract(), null, 2),
      "application/json"
    );
  }, [downloadText]);

  const exportDevelopmentPlanJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    const demoWalkthrough = buildSenaDemoWalkthrough(model, {
      title: `${reportTitle} Demo Walkthrough`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace
    });
    const demoVerification = buildSenaDemoVerification(model, {
      title: `${reportTitle} Demo Verification`,
      generatedAt,
      activeTemporalWindow: activeTemporalWindow ?? null,
      pilotReadinessAudit,
      temporalRuntimeTrace,
      manualReviews: demoManualReviews
    });

    downloadText(
      "sena-development-plan.json",
      JSON.stringify(
        buildSenaDevelopmentPlan(model, {
          title: `${reportTitle} Development Plan`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null,
          pilotReadinessAudit,
          demoWalkthrough,
          demoVerification
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, demoManualReviews, downloadText, model, pilotReadinessAudit, reportTitle, temporalRuntimeTrace]);

  const exportPilotReadinessJson = useCallback(() => {
    downloadText(
      "sena-pilot-readiness-audit.json",
      JSON.stringify(pilotReadinessAudit, null, 2),
      "application/json"
    );
  }, [downloadText, pilotReadinessAudit]);

  const exportCodingReliabilityJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-coding-reliability-gate.json",
      JSON.stringify(
        buildSenaCodingReliabilityGate({
          generatedAt,
          codingReliability: {
            ...codingReliabilityReview,
            reviewedAt: generatedAt
          }
        }, generatedAt),
        null,
        2
      ),
      "application/json"
    );
  }, [codingReliabilityReview, downloadText]);

  const exportReliabilityDashboardJson = useCallback(() => {
    if (!latestReliabilityDashboard) {
      setEnterpriseMessage("Upload coder annotations before exporting a reliability dashboard.");
      return;
    }
    downloadText(
      "sena-coding-reliability-dashboard.json",
      JSON.stringify(latestReliabilityDashboard, null, 2),
      "application/json"
    );
  }, [downloadText, latestReliabilityDashboard, setEnterpriseMessage]);

  const exportClaimReadinessJson = useCallback(() => {
    downloadText(
      "sena-claim-readiness-gate.json",
      JSON.stringify(claimReadinessGate, null, 2),
      "application/json"
    );
  }, [claimReadinessGate, downloadText]);

  const exportReviewPacketJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-review-packet.json",
      JSON.stringify(
        buildSenaReviewPacket(model, {
          title: reportTitle,
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

  const exportLocalValidationResultJson = useCallback(() => {
    if (!latestValidationResult) {
      setEnterpriseMessage("Run a group-comparison validation before exporting validation evidence.");
      return;
    }
    downloadText(
      "sena-group-comparison-validation.json",
      JSON.stringify(localEnterpriseValidationResult ?? latestValidationResult, null, 2),
      "application/json"
    );
  }, [downloadText, latestValidationResult, localEnterpriseValidationResult, setEnterpriseMessage]);

  const exportValidationPreregistrationPlanJson = useCallback(() => {
    if (!latestValidationPreregistrationPlan) {
      setEnterpriseMessage("Run or load a validation run with a preregistration plan before exporting the plan.");
      return;
    }
    downloadText(
      "sena-validation-preregistration-plan.json",
      JSON.stringify(latestValidationPreregistrationPlan, null, 2),
      "application/json"
    );
  }, [downloadText, latestValidationPreregistrationPlan, setEnterpriseMessage]);

  const exportReportJson = useCallback(() => {
    downloadText(
      "sena-analysis-report.json",
      JSON.stringify(buildCurrentReport(), null, 2),
      "application/json"
    );
  }, [buildCurrentReport, downloadText]);

  const exportReportMarkdown = useCallback(() => {
    const report = buildCurrentReport();
    downloadText(
      "sena-analysis-report.md",
      buildSenaMarkdownReport(report),
      "text/markdown"
    );
  }, [buildCurrentReport, downloadText]);

  return {
    exportClaimReadinessJson,
    exportCodingReliabilityJson,
    exportDemoVerificationCompatibilityJson,
    exportDemoVerificationJson,
    exportDemoWalkthroughJson,
    exportDevelopmentPlanJson,
    exportEvidenceLedgerJson,
    exportLocalValidationResultJson,
    exportPilotReadinessJson,
    exportProductionPageContractJson,
    exportReliabilityDashboardJson,
    exportReportJson,
    exportReportMarkdown,
    exportReviewPacketJson,
    exportValidationPreregistrationPlanJson
  };
}
