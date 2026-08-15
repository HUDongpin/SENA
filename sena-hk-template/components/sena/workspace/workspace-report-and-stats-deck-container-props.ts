import {
  buildWorkspaceReportAndStatsDeckProps,
  type WorkspaceReportAndStatsDeckPropGroup
} from "./workspace-report-and-stats-deck-prop-group";
import { buildWorkspaceReportAndStatsDeckBoundaryCompositionProps } from "./workspace-report-and-stats-deck-boundary-composition-prop-group";
import { buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps } from "./workspace-report-and-stats-deck-boundary-composition-field-prop-group";
import { buildWorkspaceReportAndStatsDeckMetricsProps } from "./workspace-report-and-stats-deck-metrics-prop-group";
import {
  buildWorkspaceReportAndStatsDeckMetricsFieldProps,
  type WorkspaceReportAndStatsDeckMetricsFieldPropGroup
} from "./workspace-report-and-stats-deck-metrics-field-prop-group";
import { buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps } from "./workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group";
import { buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps } from "./workspace-report-and-stats-deck-metrics-boundary-composition-prop-group";
import { buildWorkspaceReportAndStatsDeckEvidenceProps } from "./workspace-report-and-stats-deck-evidence-prop-group";
import {
  buildWorkspaceReportAndStatsDeckEvidenceFieldProps,
  type WorkspaceReportAndStatsDeckEvidenceFieldPropGroup
} from "./workspace-report-and-stats-deck-evidence-field-prop-group";
import { buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps } from "./workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group";
import { buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps } from "./workspace-report-and-stats-deck-evidence-boundary-composition-prop-group";
import { buildWorkspaceReportAndStatsDeckReportProps } from "./workspace-report-and-stats-deck-report-prop-group";
import { buildWorkspaceReportAndStatsDeckReportFieldProps } from "./workspace-report-and-stats-deck-report-field-prop-group";
import { buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps } from "./workspace-report-and-stats-deck-report-boundary-composition-field-prop-group";
import { buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps } from "./workspace-report-and-stats-deck-report-boundary-composition-prop-group";
import { buildWorkspaceReportAndStatsDeckCompositionProps } from "./workspace-report-and-stats-deck-composition-prop-group";
import { buildWorkspaceReportAndStatsDeckCompositionFieldProps } from "./workspace-report-and-stats-deck-composition-field-prop-group";
import { buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps } from "./workspace-report-and-stats-deck-composition-boundary-field-prop-group";
import { buildWorkspaceReportAndStatsDeckCompositionBoundaryProps } from "./workspace-report-and-stats-deck-composition-boundary-prop-group";
import { buildWorkspaceReportGeneratorProps } from "./workspace-report-generator-prop-group";
import { buildWorkspaceReportGeneratorCompositionFieldProps } from "./workspace-report-generator-composition-field-prop-group";
import { buildWorkspaceReportGeneratorCompositionProps } from "./workspace-report-generator-composition-prop-group";
import { buildWorkspaceReportGeneratorBoundaryCompositionFieldProps } from "./workspace-report-generator-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorBoundaryCompositionProps } from "./workspace-report-generator-boundary-composition-prop-group";
import { buildWorkspaceReportGeneratorReportCompositionProps } from "./workspace-report-generator-report-composition-prop-group";
import { buildWorkspaceReportGeneratorReportCompositionFieldProps } from "./workspace-report-generator-report-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps } from "./workspace-report-generator-report-composition-boundary-field-prop-group";
import { buildWorkspaceReportGeneratorReportCompositionBoundaryProps } from "./workspace-report-generator-report-composition-boundary-prop-group";
import { buildWorkspaceReportGeneratorGovernanceProps } from "./workspace-report-generator-governance-prop-group";
import { buildWorkspaceReportGeneratorGovernanceCompositionFieldProps } from "./workspace-report-generator-governance-composition-field-prop-group";
import { buildWorkspaceReportGeneratorGovernanceCompositionProps } from "./workspace-report-generator-governance-composition-prop-group";
import { buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps } from "./workspace-report-generator-governance-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps } from "./workspace-report-generator-governance-boundary-composition-prop-group";
import {
  buildWorkspaceReportGeneratorGovernanceFieldProps,
  type WorkspaceReportGeneratorGovernanceFieldPropGroup
} from "./workspace-report-generator-governance-field-prop-group";
import { buildWorkspaceReportGeneratorReliabilityProps } from "./workspace-report-generator-reliability-prop-group";
import { buildWorkspaceReportGeneratorReliabilityCompositionFieldProps } from "./workspace-report-generator-reliability-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReliabilityCompositionProps } from "./workspace-report-generator-reliability-composition-prop-group";
import { buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps } from "./workspace-report-generator-reliability-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps } from "./workspace-report-generator-reliability-boundary-composition-prop-group";
import {
  buildWorkspaceReportGeneratorReliabilityFieldProps,
  type WorkspaceReportGeneratorReliabilityFieldPropGroup
} from "./workspace-report-generator-reliability-field-prop-group";
import { buildWorkspaceReportGeneratorExportProps } from "./workspace-report-generator-export-prop-group";
import { buildWorkspaceReportGeneratorExportCompositionFieldProps } from "./workspace-report-generator-export-composition-field-prop-group";
import { buildWorkspaceReportGeneratorExportCompositionProps } from "./workspace-report-generator-export-composition-prop-group";
import { buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps } from "./workspace-report-generator-export-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorExportBoundaryCompositionProps } from "./workspace-report-generator-export-boundary-composition-prop-group";
import {
  buildWorkspaceReportGeneratorExportCallbackProps,
  type WorkspaceReportGeneratorExportCallbackPropGroup
} from "./workspace-report-generator-export-callback-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataProps } from "./workspace-report-generator-review-metadata-prop-group";
import type { WorkspaceReportGeneratorReviewMetadataPropGroup } from "./workspace-report-generator-review-metadata-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps } from "./workspace-report-generator-review-metadata-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataCompositionProps } from "./workspace-report-generator-review-metadata-composition-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps } from "./workspace-report-generator-review-metadata-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps } from "./workspace-report-generator-review-metadata-boundary-composition-prop-group";
import {
  buildWorkspaceReportGeneratorReviewStatusFieldProps,
  type WorkspaceReportGeneratorReviewStatusFieldPropGroup
} from "./workspace-report-generator-review-status-field-prop-group";
import { buildWorkspaceReportGeneratorReviewStatusProps } from "./workspace-report-generator-review-status-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryProps } from "./workspace-report-generator-audit-summary-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps } from "./workspace-report-generator-audit-summary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryCompositionProps } from "./workspace-report-generator-audit-summary-composition-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps } from "./workspace-report-generator-audit-summary-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps } from "./workspace-report-generator-audit-summary-boundary-composition-prop-group";
import {
  buildWorkspaceReportGeneratorAuditSummaryFieldProps,
  type WorkspaceReportGeneratorAuditSummaryFieldPropGroup
} from "./workspace-report-generator-audit-summary-field-prop-group";

export type WorkspaceReportAndStatsDeckContainerPropsInput =
  WorkspaceReportGeneratorGovernanceFieldPropGroup &
  WorkspaceReportGeneratorReliabilityFieldPropGroup &
  WorkspaceReportGeneratorExportCallbackPropGroup &
  WorkspaceReportGeneratorReviewStatusFieldPropGroup &
  WorkspaceReportGeneratorAuditSummaryFieldPropGroup &
  WorkspaceReportAndStatsDeckMetricsFieldPropGroup &
  WorkspaceReportAndStatsDeckEvidenceFieldPropGroup &
  Pick<WorkspaceReportGeneratorReviewMetadataPropGroup, "onDemoManualReviewChange"> & {
    hasReliabilityDashboard: boolean;
    hasPublicationAccess: boolean;
  };

export function buildWorkspaceReportAndStatsDeckContainerProps({
  activeTemporalIndex,
  activeTemporalWindow,
  adjudicationNotes,
  agreementMetric,
  agreementValue,
  claimReadinessGate,
  coderCount,
  codingReliabilityGate,
  codingReliabilityReviewer,
  codingReliabilityStatus,
  codingScheme,
  completenessAudit,
  dataGovernanceConsentScope,
  dataGovernanceDataSteward,
  dataGovernanceIrbApprovalId,
  dataGovernanceRetentionPolicy,
  dataGovernanceUsageConstraints,
  demoVerification,
  demoVerificationCompatibilityAudit,
  developmentPlan,
  enaManifest,
  evidenceLedger,
  evidenceSourceFilter,
  hasReliabilityDashboard,
  hasPublicationAccess,
  interpretation,
  limitations,
  methodValidation,
  model,
  nextActions,
  onAdjudicationNotesChange,
  onAgreementMetricChange,
  onAgreementValueChange,
  onCoderCountChange,
  onCodingReliabilityReviewerChange,
  onCodingReliabilityStatusChange,
  onCodingSchemeChange,
  onDataGovernanceConsentScopeChange,
  onDataGovernanceDataStewardChange,
  onDataGovernanceIrbApprovalIdChange,
  onDataGovernanceRetentionPolicyChange,
  onDataGovernanceUsageConstraintsChange,
  onDemoManualReviewChange,
  onEvidenceSourceFilterChange,
  onExportClaimReadinessJson,
  onExportCodingReliabilityJson,
  onExportDevelopmentPlanJson,
  onExportEnaReport,
  onExportEvidenceLedgerJson,
  onExportJson,
  onExportMarkdown,
  onExportPairReport,
  onExportProductionPageContractJson,
  onExportProjectSnapshot,
  onExportPublication,
  onExportReadinessJson,
  onExportReliabilityDashboardJson,
  onExportReviewPacket,
  onExportRuntimeBundleJson,
  onExportRuntimeConsistencyAuditJson,
  onExportSocialReport,
  onExportTemporalRuntimeTraceJson,
  onExportVerificationCompatibilityJson,
  onExportVerificationJson,
  onExportWalkthroughJson,
  onInterpretationChange,
  onLimitationsChange,
  onNextActionsChange,
  onReliabilityLimitationsChange,
  onReliabilityUpload,
  onReportTitleChange,
  onReviewStatusChange,
  onReviewerChange,
  onUnitOfCodingChange,
  pilotReadinessAudit,
  productionPageContract,
  reliabilityLimitations,
  reportTitle,
  reviewPacketAudit,
  reviewStatus,
  reviewer,
  snaManifest,
  temporalRuntimeTrace,
  unitOfCoding,
  windowCount
}: WorkspaceReportAndStatsDeckContainerPropsInput): WorkspaceReportAndStatsDeckPropGroup {
  const workspaceReportGeneratorGovernanceFieldProps = buildWorkspaceReportGeneratorGovernanceFieldProps({
    dataGovernanceIrbApprovalId,
    onDataGovernanceIrbApprovalIdChange,
    dataGovernanceConsentScope,
    onDataGovernanceConsentScopeChange,
    dataGovernanceRetentionPolicy,
    onDataGovernanceRetentionPolicyChange,
    dataGovernanceUsageConstraints,
    onDataGovernanceUsageConstraintsChange,
    dataGovernanceDataSteward,
    onDataGovernanceDataStewardChange
  });

  const workspaceReportGeneratorGovernanceCompositionFieldProps = buildWorkspaceReportGeneratorGovernanceCompositionFieldProps({
    ...workspaceReportGeneratorGovernanceFieldProps,
  });
  const workspaceReportGeneratorGovernanceCompositionProps = buildWorkspaceReportGeneratorGovernanceCompositionProps({
    ...workspaceReportGeneratorGovernanceCompositionFieldProps,
  });
  const workspaceReportGeneratorGovernanceBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps({
    ...workspaceReportGeneratorGovernanceCompositionProps,
  });
  const workspaceReportGeneratorGovernanceBoundaryCompositionProps = buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps({
    ...workspaceReportGeneratorGovernanceBoundaryCompositionFieldProps,
  });
  const workspaceReportGeneratorGovernanceProps = buildWorkspaceReportGeneratorGovernanceProps({
    ...workspaceReportGeneratorGovernanceBoundaryCompositionProps,
  });

  const workspaceReportGeneratorReliabilityFieldProps = buildWorkspaceReportGeneratorReliabilityFieldProps({
    codingReliabilityStatus,
    onCodingReliabilityStatusChange,
    codingReliabilityReviewer,
    onCodingReliabilityReviewerChange,
    codingScheme,
    onCodingSchemeChange,
    unitOfCoding,
    onUnitOfCodingChange,
    coderCount,
    onCoderCountChange,
    agreementMetric,
    onAgreementMetricChange,
    agreementValue,
    onAgreementValueChange,
    adjudicationNotes,
    onAdjudicationNotesChange,
    reliabilityLimitations,
    onReliabilityLimitationsChange
  });

  const workspaceReportGeneratorReliabilityCompositionFieldProps = buildWorkspaceReportGeneratorReliabilityCompositionFieldProps({
    ...workspaceReportGeneratorReliabilityFieldProps,
  });
  const workspaceReportGeneratorReliabilityCompositionProps = buildWorkspaceReportGeneratorReliabilityCompositionProps({
    ...workspaceReportGeneratorReliabilityCompositionFieldProps,
  });
  const workspaceReportGeneratorReliabilityBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps({
    ...workspaceReportGeneratorReliabilityCompositionProps,
  });
  const workspaceReportGeneratorReliabilityBoundaryCompositionProps = buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps({
    ...workspaceReportGeneratorReliabilityBoundaryCompositionFieldProps,
  });

  const workspaceReportGeneratorReliabilityProps = buildWorkspaceReportGeneratorReliabilityProps({
    ...workspaceReportGeneratorReliabilityBoundaryCompositionProps,
  });

  const workspaceReportGeneratorExportCallbackProps = buildWorkspaceReportGeneratorExportCallbackProps({
    onExportWalkthroughJson,
    onExportVerificationJson,
    onExportVerificationCompatibilityJson,
    onExportProductionPageContractJson,
    onExportProjectSnapshot,
    onExportDevelopmentPlanJson,
    onExportEnaReport,
    onExportRuntimeBundleJson,
    onExportRuntimeConsistencyAuditJson,
    onExportReadinessJson,
    onExportCodingReliabilityJson,
    onExportReliabilityDashboardJson,
    onExportClaimReadinessJson,
    onExportReviewPacket,
    onExportJson,
    onExportMarkdown,
    onReliabilityUpload,
    onExportPublication
  });

  const workspaceReportGeneratorExportCompositionFieldProps = buildWorkspaceReportGeneratorExportCompositionFieldProps({
    ...workspaceReportGeneratorExportCallbackProps,
    hasReliabilityDashboard,
    hasPublicationAccess,
  });

  const workspaceReportGeneratorExportCompositionProps = buildWorkspaceReportGeneratorExportCompositionProps({
    ...workspaceReportGeneratorExportCompositionFieldProps,
  });

  const workspaceReportGeneratorExportBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps({
    ...workspaceReportGeneratorExportCompositionProps,
  });

  const workspaceReportGeneratorExportBoundaryCompositionProps = buildWorkspaceReportGeneratorExportBoundaryCompositionProps({
    ...workspaceReportGeneratorExportBoundaryCompositionFieldProps,
  });

  const workspaceReportGeneratorExportProps = buildWorkspaceReportGeneratorExportProps({
    ...workspaceReportGeneratorExportBoundaryCompositionProps,
  });

  const workspaceReportGeneratorReviewStatusFieldProps = buildWorkspaceReportGeneratorReviewStatusFieldProps({
    reportTitle,
    onReportTitleChange,
    reviewStatus,
    onReviewStatusChange,
    reviewer,
    onReviewerChange,
    interpretation,
    onInterpretationChange,
    limitations,
    onLimitationsChange,
    nextActions,
    onNextActionsChange
  });

  const workspaceReportGeneratorReviewStatusProps = buildWorkspaceReportGeneratorReviewStatusProps({
    ...workspaceReportGeneratorReviewStatusFieldProps,
  });

  const workspaceReportGeneratorReviewMetadataCompositionFieldProps = buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps({
    onDemoManualReviewChange,
    ...workspaceReportGeneratorReviewStatusProps,
  });

  const workspaceReportGeneratorReviewMetadataCompositionProps = buildWorkspaceReportGeneratorReviewMetadataCompositionProps({
    ...workspaceReportGeneratorReviewMetadataCompositionFieldProps,
  });

  const workspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps({
    ...workspaceReportGeneratorReviewMetadataCompositionProps,
  });

  const workspaceReportGeneratorReviewMetadataBoundaryCompositionProps = buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps({
    ...workspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps,
  });

  const workspaceReportGeneratorReviewMetadataProps = buildWorkspaceReportGeneratorReviewMetadataProps({
    ...workspaceReportGeneratorReviewMetadataBoundaryCompositionProps,
  });

  const workspaceReportGeneratorAuditSummaryFieldProps = buildWorkspaceReportGeneratorAuditSummaryFieldProps({
    completenessAudit,
    reviewPacketAudit,
    pilotReadinessAudit,
    claimReadinessGate,
    codingReliabilityGate,
    developmentPlan,
    demoVerification,
    demoVerificationCompatibilityAudit,
    productionPageContract
  });

  const workspaceReportGeneratorAuditSummaryCompositionFieldProps = buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps({
    ...workspaceReportGeneratorAuditSummaryFieldProps,
  });

  const workspaceReportGeneratorAuditSummaryCompositionProps = buildWorkspaceReportGeneratorAuditSummaryCompositionProps({
    ...workspaceReportGeneratorAuditSummaryCompositionFieldProps,
  });

  const workspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps({
    ...workspaceReportGeneratorAuditSummaryCompositionProps,
  });

  const workspaceReportGeneratorAuditSummaryBoundaryCompositionProps = buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps({
    ...workspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps,
  });

  const workspaceReportGeneratorAuditSummaryProps = buildWorkspaceReportGeneratorAuditSummaryProps({
    ...workspaceReportGeneratorAuditSummaryBoundaryCompositionProps,
  });

  const workspaceReportGeneratorReportCompositionFieldProps = buildWorkspaceReportGeneratorReportCompositionFieldProps({
    model,
    ...workspaceReportGeneratorAuditSummaryProps,
    ...workspaceReportGeneratorReviewMetadataProps,
    ...workspaceReportGeneratorGovernanceProps,
    ...workspaceReportGeneratorReliabilityProps,
    ...workspaceReportGeneratorExportProps,
  });

  const workspaceReportGeneratorReportCompositionProps = buildWorkspaceReportGeneratorReportCompositionProps({
    ...workspaceReportGeneratorReportCompositionFieldProps,
  });

  const workspaceReportGeneratorReportCompositionBoundaryFieldProps = buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps({
    ...workspaceReportGeneratorReportCompositionProps,
  });

  const workspaceReportGeneratorReportCompositionBoundaryProps = buildWorkspaceReportGeneratorReportCompositionBoundaryProps({
    ...workspaceReportGeneratorReportCompositionBoundaryFieldProps,
  });

  const workspaceReportGeneratorCompositionFieldProps = buildWorkspaceReportGeneratorCompositionFieldProps({
    ...workspaceReportGeneratorReportCompositionBoundaryProps,
  });

  const workspaceReportGeneratorCompositionProps = buildWorkspaceReportGeneratorCompositionProps({
    ...workspaceReportGeneratorCompositionFieldProps,
  });

  const workspaceReportGeneratorBoundaryCompositionFieldProps = buildWorkspaceReportGeneratorBoundaryCompositionFieldProps({
    ...workspaceReportGeneratorCompositionProps,
  });

  const workspaceReportGeneratorBoundaryCompositionProps = buildWorkspaceReportGeneratorBoundaryCompositionProps({
    ...workspaceReportGeneratorBoundaryCompositionFieldProps,
  });

  const workspaceReportGeneratorProps = buildWorkspaceReportGeneratorProps({
    ...workspaceReportGeneratorBoundaryCompositionProps,
  });

  const workspaceReportAndStatsDeckMetricsFieldProps = buildWorkspaceReportAndStatsDeckMetricsFieldProps({
    model,
    enaManifest,
    snaManifest,
    activeTemporalWindow,
    activeTemporalIndex,
    windowCount,
    methodValidation,
    temporalRuntimeTrace,
    onExportTemporalRuntimeTraceJson,
    onExportSocialReport,
    onExportPairReport
  });

  const workspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps({
    ...workspaceReportAndStatsDeckMetricsFieldProps,
  });

  const workspaceReportAndStatsDeckMetricsBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps({
    ...workspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps,
  });

  const workspaceReportAndStatsDeckMetricsProps = buildWorkspaceReportAndStatsDeckMetricsProps({
    ...workspaceReportAndStatsDeckMetricsBoundaryCompositionProps,
  });

  const workspaceReportAndStatsDeckEvidenceFieldProps = buildWorkspaceReportAndStatsDeckEvidenceFieldProps({
    evidenceLedger,
    evidenceSourceFilter,
    onEvidenceSourceFilterChange,
    onExportEvidenceLedgerJson
  });

  const workspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps({
    ...workspaceReportAndStatsDeckEvidenceFieldProps,
  });

  const workspaceReportAndStatsDeckEvidenceBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps({
    ...workspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps,
  });

  const workspaceReportAndStatsDeckEvidenceProps = buildWorkspaceReportAndStatsDeckEvidenceProps({
    ...workspaceReportAndStatsDeckEvidenceBoundaryCompositionProps,
  });

  const workspaceReportAndStatsDeckReportFieldProps = buildWorkspaceReportAndStatsDeckReportFieldProps({
    reportProps: workspaceReportGeneratorProps,
  });

  const workspaceReportAndStatsDeckReportBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps({
    ...workspaceReportAndStatsDeckReportFieldProps,
  });

  const workspaceReportAndStatsDeckReportBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps({
    ...workspaceReportAndStatsDeckReportBoundaryCompositionFieldProps,
  });

  const workspaceReportAndStatsDeckReportProps = buildWorkspaceReportAndStatsDeckReportProps({
    ...workspaceReportAndStatsDeckReportBoundaryCompositionProps,
  });

  const workspaceReportAndStatsDeckCompositionFieldProps = buildWorkspaceReportAndStatsDeckCompositionFieldProps({
    ...workspaceReportAndStatsDeckMetricsProps,
    ...workspaceReportAndStatsDeckEvidenceProps,
    ...workspaceReportAndStatsDeckReportProps,
  });

  const workspaceReportAndStatsDeckCompositionBoundaryFieldProps = buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps({
    ...workspaceReportAndStatsDeckCompositionFieldProps,
  });

  const workspaceReportAndStatsDeckCompositionBoundaryProps = buildWorkspaceReportAndStatsDeckCompositionBoundaryProps({
    ...workspaceReportAndStatsDeckCompositionBoundaryFieldProps,
  });

  const workspaceReportAndStatsDeckCompositionProps = buildWorkspaceReportAndStatsDeckCompositionProps({
    ...workspaceReportAndStatsDeckCompositionBoundaryProps,
  });

  const workspaceReportAndStatsDeckBoundaryCompositionFieldProps = buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps({
    ...workspaceReportAndStatsDeckCompositionProps,
  });

  const workspaceReportAndStatsDeckBoundaryCompositionProps = buildWorkspaceReportAndStatsDeckBoundaryCompositionProps({
    ...workspaceReportAndStatsDeckBoundaryCompositionFieldProps,
  });

  return buildWorkspaceReportAndStatsDeckProps({
    ...workspaceReportAndStatsDeckBoundaryCompositionProps,
  });
}
