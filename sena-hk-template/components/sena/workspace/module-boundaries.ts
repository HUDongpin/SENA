import {
  buildSenaModel,
  buildSenaReport,
  importSenaJsonContract
} from "./analysis-runtime";
import { SenaFusionWorkspaceLoader } from "../SenaFusionWorkspaceLoader";
import {
  requestSenaWorkspaceJson,
  SENA_WORKSPACE_API_ROUTES
} from "./api-client";
import { useSenaFusionWorkspaceMainShellProps } from "./use-sena-fusion-workspace-main-shell-props";
import {
  createTeamInvitationAction,
  deliverEnterpriseNotificationsAction,
  startEnterpriseMfaSetupAction
} from "./enterprise-actions";
import {
  deliverEnterpriseAuditLogAction,
  deliverEnterpriseBackupAction,
  deliverEnterpriseOpsAlertsAction,
  exportEnterpriseAuditCsvAction,
  exportEnterpriseJsonArtifactAction,
  getEnterpriseGoLiveRehearsalAction,
  refreshEnterpriseProvisioningReadinessAction,
  submitEnterpriseGoLiveAttestationAction,
  submitEnterpriseReleaseGateReviewAction,
  syncEnterpriseDatabaseAction
} from "./enterprise-ops-actions";
import { DataContractAuditPanel } from "./data-contract-audit-panel";
import { EnterpriseAccountSecurityPanel } from "./enterprise-account-security-panel";
import { EnterpriseCollaborationProjectPanel } from "./enterprise-collaboration-project-panel";
import { EnterpriseCollaborationSsoPanel } from "./enterprise-collaboration-sso-panel";
import { EnterpriseGovernanceNotificationsPanel } from "./enterprise-governance-notifications-panel";
import { EnterpriseLocalValidationPanel } from "./enterprise-local-validation-panel";
import { EnterpriseOpsExports } from "./enterprise-ops-exports";
import { EnterprisePlatformDecisionPanel } from "./enterprise-platform-decision-panel";
import { EnterpriseProvisioningReadinessPanel } from "./enterprise-provisioning-readiness-panel";
import { EnterpriseReleaseGatePanel } from "./enterprise-release-gate-panel";
import { EnterpriseRuntimeHeaderPanel } from "./enterprise-runtime-header-panel";
import { EnterpriseRuntimePanel } from "./enterprise-runtime-panel";
import { EnterpriseServerProjectControlsPanel } from "./enterprise-server-project-controls-panel";
import { EnterpriseTeamOperationsPanel } from "./enterprise-team-operations-panel";
import { EnterpriseUploadStoragePanel } from "./enterprise-upload-storage-panel";
import { DualLensDashboard } from "./dual-lens-dashboard";
import { EvidenceLedgerPanel, EvidenceLineageBadges } from "./evidence-ledger-panel";
import { Canvas } from "./fusion-canvas";
import { FusionLayerKey, RankedList } from "./fusion-layer-key";
import {
  FusionPlotCompactKey,
  FusionPlotMaximizedOverlay
} from "./fusion-plot-overlay";
import { FusionMathAuditPanel } from "./fusion-math-audit-panel";
import { Inspector } from "./inspector-panel";
import { MatrixPreview } from "./matrix-preview";
import { ModelBuilderPanel } from "./model-builder-panel";
import { MethodFormulaPanel } from "./method-formula-panel";
import { MethodValidationPanel } from "./method-validation-panel";
import { PlotToolsPanel } from "./plot-tools-panel";
import { TimelineTrace } from "./timeline-trace";
import {
  IntegerControl,
  MappingSelect,
  MetricCell,
  Panel,
  Slider
} from "./workspace-primitives";
import {
  ActivePlotViewToolbar,
  FusionPlotZoomControls,
  WorkflowRail,
  WorkspacePlotViewBar,
  WorkspaceRail,
  WorkspaceShellPanel,
  WorkspaceViewportPanel
} from "./workspace-shell-panels";
import {
  SHOW_ARCHIVED_FORMULA_PANEL,
  StatsNetworkMetricsIcon,
  downloadText,
  formatDelta,
  formatNumber,
  layerCopy,
  layoutOptions,
  platformDecisionTimestampedEvidenceIds,
  plotViewOptions,
  productionPageContract,
  senaEnterpriseImportFileAccept,
  temporalModeOptions,
  upperTriangleTotal,
  workflowSteps,
  workspaceRailItems,
  workspaceRailPanelCopy
} from "./workspace-static-config";
import { WorkspaceHeaderSection } from "./workspace-header-section";
import { PilotAssetsPanel } from "./pilot-assets-panel";
import { WorkspaceLeftRailPanelSection } from "./workspace-left-rail-panel-section";
import { WorkspaceDataImportPanel } from "./workspace-data-import-panel";
import { WorkspaceDataImportFeedbackSection } from "./workspace-data-import-feedback-section";
import { UploadedTableMapper } from "./uploaded-table-mapper";
import { ReportGenerator } from "./report-generator";
import {
  JenaConceptHandoffPanel,
  JointEmbeddingProvenanceStrip,
  JsnaSocialHandoffPanel,
  MethodProtocolHandoffPanel,
  MetricProvenanceSummary
} from "./runtime-provenance-panels";
import { CentralFusionAnalysisScope } from "./central-fusion-analysis-scope";
import {
  CommunityList,
  PairContributionTable,
  SocialMetricsTable
} from "./sena-stats-tables";
import { WorkspaceReportAndStatsDeckSection } from "./workspace-report-and-stats-deck-section";
import { buildWorkspaceReportAndStatsDeckContainerProps } from "./workspace-report-and-stats-deck-container-props";
import { buildWorkspaceReportAndStatsDeckProps } from "./workspace-report-and-stats-deck-prop-group";
import { buildWorkspaceReportAndStatsDeckMetricsProps } from "./workspace-report-and-stats-deck-metrics-prop-group";
import { buildWorkspaceReportAndStatsDeckMetricsFieldProps } from "./workspace-report-and-stats-deck-metrics-field-prop-group";
import { buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps } from "./workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group";
import { buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps } from "./workspace-report-and-stats-deck-metrics-boundary-composition-prop-group";
import { buildWorkspaceReportAndStatsDeckEvidenceProps } from "./workspace-report-and-stats-deck-evidence-prop-group";
import { buildWorkspaceReportAndStatsDeckEvidenceFieldProps } from "./workspace-report-and-stats-deck-evidence-field-prop-group";
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
import { buildWorkspaceReportAndStatsDeckBoundaryCompositionProps } from "./workspace-report-and-stats-deck-boundary-composition-prop-group";
import { buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps } from "./workspace-report-and-stats-deck-boundary-composition-field-prop-group";
import { WorkspaceMainShellSection } from "./workspace-main-shell-section";
import { renderWorkspaceMainShell } from "./workspace-main-shell-render";
import { buildWorkspaceMainShellSectionProps } from "./workspace-main-shell-prop-group";
import { buildWorkspaceMainShellBoundaryCompositionFieldProps } from "./workspace-main-shell-boundary-composition-field-prop-group";
import { buildWorkspaceMainShellBoundaryCompositionProps } from "./workspace-main-shell-boundary-composition-prop-group";
import { buildWorkspaceFusionOverlayRailMainShellContainerProps } from "./workspace-fusion-overlay-rail-main-shell-container-props";
import { buildWorkspaceHeaderLeftRailContainerProps } from "./workspace-header-left-rail-container-props";
import { buildWorkspaceFusionPlotMaximizedOverlayProps } from "./workspace-fusion-plot-maximized-overlay-prop-group";
import { buildWorkspaceFusionPlotOverlayCompositionProps } from "./workspace-fusion-plot-overlay-composition-prop-group";
import { buildWorkspaceFusionPlotOverlayCompositionFieldProps } from "./workspace-fusion-plot-overlay-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-boundary-composition-prop-group";
import { buildWorkspaceFusionPlotOverlaySelectionProps } from "./workspace-fusion-plot-overlay-selection-prop-group";
import { buildWorkspaceFusionPlotOverlaySelectionFieldProps } from "./workspace-fusion-plot-overlay-selection-field-prop-group";
import { buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-selection-boundary-composition-prop-group";
import { buildWorkspaceFusionPlotOverlayModelProps } from "./workspace-fusion-plot-overlay-model-prop-group";
import { buildWorkspaceFusionPlotOverlayModelFieldProps } from "./workspace-fusion-plot-overlay-model-field-prop-group";
import { buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-model-boundary-composition-prop-group";
import { buildWorkspaceFusionPlotOverlayZoomProps } from "./workspace-fusion-plot-overlay-zoom-prop-group";
import { buildWorkspaceFusionPlotOverlayZoomFieldProps } from "./workspace-fusion-plot-overlay-zoom-field-prop-group";
import { buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group";
import { buildWorkspaceRailProps } from "./workspace-rail-prop-group";
import { buildWorkspaceRailFieldProps } from "./workspace-rail-field-prop-group";
import { buildWorkspaceRailCompositionFieldProps } from "./workspace-rail-composition-field-prop-group";
import { buildWorkspaceRailCompositionProps } from "./workspace-rail-composition-prop-group";
import { buildWorkspaceRailBoundaryCompositionFieldProps } from "./workspace-rail-boundary-composition-field-prop-group";
import { buildWorkspaceRailBoundaryCompositionProps } from "./workspace-rail-boundary-composition-prop-group";
import { buildWorkspaceRailModeHandlerProps } from "./workspace-rail-mode-handler-prop-group";
import { buildWorkspaceHeaderProps } from "./workspace-header-prop-group";
import { buildWorkspaceHeaderCompositionProps } from "./workspace-header-composition-prop-group";
import { buildWorkspaceHeaderCompositionFieldProps } from "./workspace-header-composition-field-prop-group";
import { buildWorkspaceHeaderBoundaryCompositionFieldProps } from "./workspace-header-boundary-composition-field-prop-group";
import { buildWorkspaceHeaderBoundaryCompositionProps } from "./workspace-header-boundary-composition-prop-group";
import { buildWorkspaceHeaderExportProps } from "./workspace-header-export-prop-group";
import { buildWorkspaceHeaderExportFieldProps } from "./workspace-header-export-field-prop-group";
import { buildWorkspaceHeaderTemporalSummaryProps } from "./workspace-header-temporal-summary-prop-group";
import { buildWorkspaceHeaderTemporalSummaryFieldProps } from "./workspace-header-temporal-summary-field-prop-group";
import { buildWorkspaceLeftRailProps } from "./workspace-left-rail-prop-group";
import { buildWorkspaceLeftRailCompositionProps } from "./workspace-left-rail-composition-prop-group";
import { buildWorkspaceLeftRailCompositionFieldProps } from "./workspace-left-rail-composition-field-prop-group";
import { buildWorkspaceLeftRailBoundaryCompositionFieldProps } from "./workspace-left-rail-boundary-composition-field-prop-group";
import { buildWorkspaceLeftRailBoundaryCompositionProps } from "./workspace-left-rail-boundary-composition-prop-group";
import { buildWorkspaceLeftRailPanelDataProps } from "./workspace-left-rail-panel-data-prop-group";
import { buildWorkspaceLeftRailPanelDataFieldProps } from "./workspace-left-rail-panel-data-field-prop-group";
import { buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps } from "./workspace-left-rail-panel-data-boundary-composition-field-prop-group";
import { buildWorkspaceLeftRailPanelDataBoundaryCompositionProps } from "./workspace-left-rail-panel-data-boundary-composition-prop-group";
import { buildWorkspaceLeftRailPanelModelProps } from "./workspace-left-rail-panel-model-prop-group";
import { buildWorkspaceLeftRailPanelModelFieldProps } from "./workspace-left-rail-panel-model-field-prop-group";
import { buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps } from "./workspace-left-rail-panel-model-boundary-composition-field-prop-group";
import { buildWorkspaceLeftRailPanelModelBoundaryCompositionProps } from "./workspace-left-rail-panel-model-boundary-composition-prop-group";
import { buildWorkspaceLeftRailWorkflowProps } from "./workspace-left-rail-workflow-prop-group";
import { buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps } from "./workspace-left-rail-workflow-boundary-composition-field-prop-group";
import { buildWorkspaceLeftRailWorkflowBoundaryCompositionProps } from "./workspace-left-rail-workflow-boundary-composition-prop-group";
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
import { buildWorkspaceReportGeneratorGovernanceFieldProps } from "./workspace-report-generator-governance-field-prop-group";
import { buildWorkspaceReportGeneratorReliabilityProps } from "./workspace-report-generator-reliability-prop-group";
import { buildWorkspaceReportGeneratorReliabilityCompositionFieldProps } from "./workspace-report-generator-reliability-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReliabilityCompositionProps } from "./workspace-report-generator-reliability-composition-prop-group";
import { buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps } from "./workspace-report-generator-reliability-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps } from "./workspace-report-generator-reliability-boundary-composition-prop-group";
import { buildWorkspaceReportGeneratorReliabilityFieldProps } from "./workspace-report-generator-reliability-field-prop-group";
import { buildWorkspaceReportGeneratorExportProps } from "./workspace-report-generator-export-prop-group";
import { buildWorkspaceReportGeneratorExportCompositionFieldProps } from "./workspace-report-generator-export-composition-field-prop-group";
import { buildWorkspaceReportGeneratorExportCompositionProps } from "./workspace-report-generator-export-composition-prop-group";
import { buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps } from "./workspace-report-generator-export-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorExportBoundaryCompositionProps } from "./workspace-report-generator-export-boundary-composition-prop-group";
import { buildWorkspaceReportGeneratorExportCallbackProps } from "./workspace-report-generator-export-callback-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataProps } from "./workspace-report-generator-review-metadata-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps } from "./workspace-report-generator-review-metadata-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataCompositionProps } from "./workspace-report-generator-review-metadata-composition-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps } from "./workspace-report-generator-review-metadata-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps } from "./workspace-report-generator-review-metadata-boundary-composition-prop-group";
import { buildWorkspaceReportGeneratorReviewStatusFieldProps } from "./workspace-report-generator-review-status-field-prop-group";
import { buildWorkspaceReportGeneratorReviewStatusProps } from "./workspace-report-generator-review-status-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryProps } from "./workspace-report-generator-audit-summary-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps } from "./workspace-report-generator-audit-summary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryCompositionProps } from "./workspace-report-generator-audit-summary-composition-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps } from "./workspace-report-generator-audit-summary-boundary-composition-field-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps } from "./workspace-report-generator-audit-summary-boundary-composition-prop-group";
import { buildWorkspaceReportGeneratorAuditSummaryFieldProps } from "./workspace-report-generator-audit-summary-field-prop-group";
import { buildWorkspaceDataImportProps } from "./workspace-data-import-prop-group";
import { buildWorkspaceDataImportFieldProps } from "./workspace-data-import-field-prop-group";
import { buildWorkspaceModelBuilderProps } from "./workspace-model-builder-prop-group";
import { buildWorkspaceModelBuilderFieldProps } from "./workspace-model-builder-field-prop-group";
import { buildWorkspacePlotToolsProps } from "./workspace-plot-tools-prop-group";
import { buildWorkspacePlotToolsFieldProps } from "./workspace-plot-tools-field-prop-group";
import { buildWorkspaceStatsProps } from "./workspace-stats-prop-group";
import { buildWorkspaceStatsFieldProps } from "./workspace-stats-field-prop-group";
import { buildWorkspaceDataContractAuditProps } from "./workspace-data-contract-audit-prop-group";
import { buildWorkspaceDataContractAuditFieldProps } from "./workspace-data-contract-audit-field-prop-group";
import { buildWorkspaceDataImportFeedbackProps } from "./workspace-data-import-feedback-prop-group";
import { buildWorkspaceDataImportFeedbackFieldProps } from "./workspace-data-import-feedback-field-prop-group";
import { buildWorkspaceWorkflowStepProps } from "./workspace-workflow-steps-prop-group";
import { buildWorkspaceWorkflowStepFieldProps } from "./workspace-workflow-steps-field-prop-group";
import { WorkspaceCentralPlotDeck } from "./workspace-central-plot-deck";
import { renderWorkspaceCentralPlotDeck } from "./workspace-central-plot-deck-render";
import { WORKSPACE_CENTRAL_PLOT_DECK_RENDER_PROPS_MODULE } from "./workspace-central-plot-deck-render-props";
import {
  WORKSPACE_CENTRAL_PLOT_DECK_BODY_PROPS_MODULE,
  buildCentralPlotDeckBodyProps
} from "./workspace-central-plot-deck-body-props";
import { CentralPlotDeckBody } from "./workspace-central-plot-deck-body";
import { CentralPlotDeckViewPanelBranches } from "./workspace-central-plot-deck-view-panel-branches";
import { WORKSPACE_CENTRAL_PLOT_DECK_VIEW_PANEL_PROPS_MODULE } from "./workspace-central-plot-deck-view-panel-props";
import { CentralDualLensViewPanel } from "./workspace-central-plot-deck-dual-lens-panel";
import { CentralEnaSpaceViewPanel } from "./workspace-central-plot-deck-ena-space-panel";
import { CentralEvidenceLedgerViewPanel } from "./workspace-central-plot-deck-evidence-ledger-panel";
import { CentralFusionPlotViewPanel } from "./workspace-central-plot-deck-fusion-panel";
import { CentralMatrixViewPanel } from "./workspace-central-plot-deck-matrix-panel";
import { CentralSnaMetricsViewPanel } from "./workspace-central-plot-deck-sna-metrics-panel";
import { CentralTemporalPlotViewPanel } from "./workspace-central-plot-deck-temporal-panel";
import {
  CentralPlotDeckActiveViewToolbar,
  CentralPlotDeckShellAction
} from "./workspace-central-plot-deck-shell-controls";
import { buildWorkspaceCentralPlotDeckContainerProps } from "./workspace-central-plot-deck-container-props";
import { buildWorkspaceCentralPlotDeckProps } from "./workspace-central-plot-deck-prop-group";
import { buildWorkspaceCentralPlotDeckCompositionProps } from "./workspace-central-plot-deck-composition-prop-group";
import { buildWorkspaceCentralPlotDeckCompositionFieldProps } from "./workspace-central-plot-deck-composition-field-prop-group";
import { buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps } from "./workspace-central-plot-deck-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotDeckBoundaryCompositionProps } from "./workspace-central-plot-deck-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsProps } from "./workspace-central-plot-temporal-controls-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsFieldProps } from "./workspace-central-plot-temporal-controls-field-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps } from "./workspace-central-plot-temporal-controls-composition-field-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsCompositionProps } from "./workspace-central-plot-temporal-controls-composition-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps } from "./workspace-central-plot-temporal-controls-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps } from "./workspace-central-plot-temporal-controls-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotEvidenceProps } from "./workspace-central-plot-evidence-prop-group";
import { buildWorkspaceCentralPlotEvidenceFieldProps } from "./workspace-central-plot-evidence-field-prop-group";
import { buildWorkspaceCentralPlotEvidenceCompositionFieldProps } from "./workspace-central-plot-evidence-composition-field-prop-group";
import { buildWorkspaceCentralPlotEvidenceCompositionProps } from "./workspace-central-plot-evidence-composition-prop-group";
import { buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps } from "./workspace-central-plot-evidence-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps } from "./workspace-central-plot-evidence-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotDataViewProps } from "./workspace-central-plot-data-view-prop-group";
import { buildWorkspaceCentralPlotDataViewFieldProps } from "./workspace-central-plot-data-view-field-prop-group";
import { buildWorkspaceCentralPlotDataViewCompositionFieldProps } from "./workspace-central-plot-data-view-composition-field-prop-group";
import { buildWorkspaceCentralPlotDataViewCompositionProps } from "./workspace-central-plot-data-view-composition-prop-group";
import { buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps } from "./workspace-central-plot-data-view-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotDataViewBoundaryCompositionProps } from "./workspace-central-plot-data-view-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotInteractionProps } from "./workspace-central-plot-interaction-prop-group";
import { buildWorkspaceCentralPlotInteractionFieldProps } from "./workspace-central-plot-interaction-field-prop-group";
import { buildWorkspaceCentralPlotInteractionCompositionFieldProps } from "./workspace-central-plot-interaction-composition-field-prop-group";
import { buildWorkspaceCentralPlotInteractionCompositionProps } from "./workspace-central-plot-interaction-composition-prop-group";
import { buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps } from "./workspace-central-plot-interaction-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotInteractionBoundaryCompositionProps } from "./workspace-central-plot-interaction-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotModelProps } from "./workspace-central-plot-model-prop-group";
import { buildWorkspaceCentralPlotModelFieldProps } from "./workspace-central-plot-model-field-prop-group";
import { buildWorkspaceCentralPlotModelCompositionFieldProps } from "./workspace-central-plot-model-composition-field-prop-group";
import { buildWorkspaceCentralPlotModelCompositionProps } from "./workspace-central-plot-model-composition-prop-group";
import { buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps } from "./workspace-central-plot-model-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotModelBoundaryCompositionProps } from "./workspace-central-plot-model-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotViewStateProps } from "./workspace-central-plot-view-state-prop-group";
import { buildWorkspaceCentralPlotViewStateFieldProps } from "./workspace-central-plot-view-state-field-prop-group";
import { buildWorkspaceCentralPlotViewStateCompositionFieldProps } from "./workspace-central-plot-view-state-composition-field-prop-group";
import { buildWorkspaceCentralPlotViewStateCompositionProps } from "./workspace-central-plot-view-state-composition-prop-group";
import { buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps } from "./workspace-central-plot-view-state-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotViewStateBoundaryCompositionProps } from "./workspace-central-plot-view-state-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorProps } from "./workspace-right-inspector-prop-group";
import { buildWorkspaceRightInspectorCompositionProps } from "./workspace-right-inspector-composition-prop-group";
import { buildWorkspaceRightInspectorCompositionFieldProps } from "./workspace-right-inspector-composition-field-prop-group";
import { buildWorkspaceRightInspectorBoundaryCompositionFieldProps } from "./workspace-right-inspector-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorBoundaryCompositionProps } from "./workspace-right-inspector-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorLayoutProps } from "./workspace-right-inspector-layout-prop-group";
import { buildWorkspaceRightInspectorLayoutFieldProps } from "./workspace-right-inspector-layout-field-prop-group";
import { buildWorkspaceRightInspectorLayoutCompositionFieldProps } from "./workspace-right-inspector-layout-composition-field-prop-group";
import { buildWorkspaceRightInspectorLayoutCompositionProps } from "./workspace-right-inspector-layout-composition-prop-group";
import { buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps } from "./workspace-right-inspector-layout-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorLayoutBoundaryCompositionProps } from "./workspace-right-inspector-layout-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorEvidenceProps } from "./workspace-right-inspector-evidence-prop-group";
import { buildWorkspaceRightInspectorEvidenceFieldProps } from "./workspace-right-inspector-evidence-field-prop-group";
import { buildWorkspaceRightInspectorEvidenceCompositionFieldProps } from "./workspace-right-inspector-evidence-composition-field-prop-group";
import { buildWorkspaceRightInspectorEvidenceCompositionProps } from "./workspace-right-inspector-evidence-composition-prop-group";
import { buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps } from "./workspace-right-inspector-evidence-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps } from "./workspace-right-inspector-evidence-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorModelProps } from "./workspace-right-inspector-model-prop-group";
import { buildWorkspaceRightInspectorModelFieldProps } from "./workspace-right-inspector-model-field-prop-group";
import { buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps } from "./workspace-right-inspector-model-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorModelBoundaryCompositionProps } from "./workspace-right-inspector-model-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorSelectionProps } from "./workspace-right-inspector-selection-prop-group";
import { buildWorkspaceRightInspectorSelectionFieldProps } from "./workspace-right-inspector-selection-field-prop-group";
import { buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps } from "./workspace-right-inspector-selection-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorSelectionBoundaryCompositionProps } from "./workspace-right-inspector-selection-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorContainerProps } from "./workspace-right-inspector-container-props";
import { WorkspaceEnterpriseRuntimeSection } from "./workspace-enterprise-runtime-section";
import { buildWorkspaceEnterpriseRuntimeContainerProps } from "./workspace-enterprise-runtime-container-props";
import { buildWorkspaceEnterpriseRuntimeProps } from "./workspace-enterprise-runtime-prop-group";
import { buildWorkspaceEnterpriseRuntimeValidationProps } from "./workspace-enterprise-runtime-validation-prop-group";
import { buildWorkspaceEnterpriseRuntimeProjectProps } from "./workspace-enterprise-runtime-project-prop-group";
import { buildWorkspaceEnterpriseRuntimeGovernanceProps } from "./workspace-enterprise-runtime-governance-prop-group";
import { buildWorkspaceEnterpriseRuntimeOpsProps } from "./workspace-enterprise-runtime-ops-prop-group";
import { buildWorkspaceEnterpriseRuntimeUploadProps } from "./workspace-enterprise-runtime-upload-prop-group";
import { buildWorkspaceEnterpriseRuntimeCollaborationProps } from "./workspace-enterprise-runtime-collaboration-prop-group";
import { buildWorkspaceEnterpriseRuntimeProvisioningProps } from "./workspace-enterprise-runtime-provisioning-prop-group";
import { buildWorkspaceEnterpriseRuntimeAccountSecurityProps } from "./workspace-enterprise-runtime-account-security-prop-group";
import { buildWorkspaceEnterpriseRuntimeTeamOperationsProps } from "./workspace-enterprise-runtime-team-operations-prop-group";
import { buildWorkspaceEnterpriseRuntimePlatformDecisionProps } from "./workspace-enterprise-runtime-platform-decision-prop-group";
import { buildWorkspaceEnterpriseRuntimeReleaseGateProps } from "./workspace-enterprise-runtime-release-gate-prop-group";
import { buildWorkspaceEnterpriseRuntimeCollaborationProjectProps } from "./workspace-enterprise-runtime-collaboration-project-prop-group";
import type {
  EnterpriseContext,
  EnterpriseCsrfToken,
  EnterprisePlatformDecisionState,
  EnterpriseReleaseGateState,
  EnterpriseTeamState
} from "./enterprise-contracts";
import {
  enterprisePlatformDecisionOptions,
  enterpriseSsoProviderOptions,
  enterpriseValidationMetrics
} from "./enterprise-options";
import { TemporalFusionArc } from "./temporal-fusion-arc";
import { TemporalRuntimeTracePanel } from "./temporal-runtime-trace-panel";
import { TemporalWindowBuilder } from "./temporal-window-builder";
import { useFusionPlotInteractions } from "./use-fusion-plot-interactions";
import { useTemporalAnimationEffects } from "./use-temporal-animation-effects";
import { WorkspaceDataViewDrawer } from "./workspace-data-view-drawer";
import { WorkspaceRightInspectorColumn } from "./workspace-right-inspector-column";
import { WorkspaceReportSection } from "./workspace-report-section";
import { WorkspaceSecondaryComparisonLens } from "./workspace-secondary-comparison-lens";
import { WorkspaceStatsPanel } from "./workspace-stats-panel";
import { useEnterpriseAuditBackupActions } from "./use-enterprise-audit-backup-actions";
import { useEnterpriseCollaborationActions } from "./use-enterprise-collaboration-actions";
import { useEnterpriseCollaborationEffects } from "./use-enterprise-collaboration-effects";
import { useEnterpriseDatabaseSyncActions } from "./use-enterprise-database-sync-actions";
import { useEnterpriseExpertReviewActions } from "./use-enterprise-expert-review-actions";
import { useEnterpriseGoLiveActions } from "./use-enterprise-go-live-actions";
import { useEnterpriseGovernanceExportActions } from "./use-enterprise-governance-export-actions";
import { useEnterpriseImportActions } from "./use-enterprise-import-actions";
import { useEnterpriseJsonArtifactExportAction } from "./use-enterprise-json-artifact-export-action";
import { useEnterpriseMfaActions } from "./use-enterprise-mfa-actions";
import { useEnterpriseNotificationActions } from "./use-enterprise-notification-actions";
import { useEnterpriseOpsAlertsActions } from "./use-enterprise-ops-alerts-actions";
import { useEnterprisePlatformDecisionActions } from "./use-enterprise-platform-decision-actions";
import { useEnterpriseProjectActions } from "./use-enterprise-project-actions";
import { useEnterprisePublicationActions } from "./use-enterprise-publication-actions";
import { useEnterpriseProvisioningReadinessActions } from "./use-enterprise-provisioning-readiness-actions";
import { useEnterpriseReleaseGateActions } from "./use-enterprise-release-gate-actions";
import { useEnterpriseRefreshActions } from "./use-enterprise-refresh-actions";
import { useEnterpriseReliabilityActions } from "./use-enterprise-reliability-actions";
import { useEnterpriseTeamActions } from "./use-enterprise-team-actions";
import { useEnterpriseUploadStorageActions } from "./use-enterprise-upload-storage-actions";
import { useEnterpriseValidationActions } from "./use-enterprise-validation-actions";
import { useEnterpriseWorkspaceApi } from "./use-enterprise-runtime";
import { useContractUploadAction } from "./use-contract-upload-action";
import { useCurrentProjectSnapshotBuilder } from "./use-current-project-snapshot-builder";
import { useDataContractEvidenceExportActions } from "./use-data-contract-evidence-export-actions";
import { useDataImportMappedTableActions } from "./use-data-import-mapped-table-actions";
import { useDemoVerificationManualReviewActions } from "./use-demo-verification-manual-review-actions";
import { useFusionCanvasSelectionState } from "./use-fusion-canvas-selection-state";
import { useMethodArtifactExportActions } from "./use-method-artifact-export-actions";
import { useProjectSnapshotExportActions } from "./use-project-snapshot-export-actions";
import { useProjectSnapshotRestoreAction } from "./use-project-snapshot-restore-action";
import { useReportAndEvidenceArtifactExportActions } from "./use-report-and-evidence-artifact-export-actions";
import { useRuntimeBundleExportActions } from "./use-runtime-bundle-export-actions";
import { useRuntimeManifestExportActions } from "./use-runtime-manifest-export-actions";
import { useSenaReportExportActions } from "./use-sena-report-export-actions";
import { useTemporalRuntimeTraceExportActions } from "./use-temporal-runtime-trace-export-actions";

type EnterpriseWorkspaceContractTypeExports = {
  EnterpriseContext: EnterpriseContext;
  EnterpriseCsrfToken: EnterpriseCsrfToken;
  EnterprisePlatformDecisionState: EnterprisePlatformDecisionState;
  EnterpriseReleaseGateState: EnterpriseReleaseGateState;
  EnterpriseTeamState: EnterpriseTeamState;
};

type SenaWorkspaceRefreshContractState =
  | "EnterpriseTeamState"
  | "EnterprisePlatformDecisionState"
  | "EnterpriseReleaseGateState";

export type SenaWorkspaceBoundaryModuleId =
  | "workspace-loader"
  | "analysis-runtime"
  | "enterprise-contracts"
  | "enterprise-options"
  | "api-client"
  | "use-sena-fusion-workspace-main-shell-props"
  | "use-enterprise-runtime"
  | "use-enterprise-refresh-actions"
  | "use-enterprise-mfa-actions"
  | "use-enterprise-team-actions"
  | "use-enterprise-notification-actions"
  | "use-enterprise-upload-storage-actions"
  | "use-enterprise-import-actions"
  | "use-enterprise-json-artifact-export-action"
  | "use-enterprise-project-actions"
  | "use-enterprise-publication-actions"
  | "use-enterprise-provisioning-readiness-actions"
  | "use-enterprise-collaboration-actions"
  | "use-enterprise-collaboration-effects"
  | "use-fusion-plot-interactions"
  | "use-temporal-animation-effects"
  | "use-fusion-canvas-selection-state"
  | "use-demo-verification-manual-review-actions"
  | "use-data-contract-evidence-export-actions"
  | "use-contract-upload-action"
  | "use-current-project-snapshot-builder"
  | "use-data-import-mapped-table-actions"
  | "use-project-snapshot-export-actions"
  | "use-project-snapshot-restore-action"
  | "use-report-and-evidence-artifact-export-actions"
  | "use-runtime-bundle-export-actions"
  | "use-temporal-runtime-trace-export-actions"
  | "use-method-artifact-export-actions"
  | "use-runtime-manifest-export-actions"
  | "use-sena-report-export-actions"
  | "use-enterprise-validation-actions"
  | "use-enterprise-expert-review-actions"
  | "use-enterprise-reliability-actions"
  | "use-enterprise-platform-decision-actions"
  | "use-enterprise-release-gate-actions"
  | "use-enterprise-go-live-actions"
  | "use-enterprise-governance-export-actions"
  | "use-enterprise-ops-alerts-actions"
  | "use-enterprise-audit-backup-actions"
  | "use-enterprise-database-sync-actions"
  | "enterprise-actions"
  | "enterprise-ops-actions"
  | "enterprise-governance-notifications-panel"
  | "enterprise-upload-storage-panel"
  | "enterprise-platform-decision-panel"
  | "enterprise-collaboration-sso-panel"
  | "enterprise-account-security-panel"
  | "enterprise-provisioning-readiness-panel"
  | "enterprise-team-operations-panel"
  | "enterprise-collaboration-project-panel"
  | "enterprise-local-validation-panel"
  | "enterprise-runtime-header-panel"
  | "enterprise-server-project-controls-panel"
  | "enterprise-runtime-panel"
  | "workspace-enterprise-runtime-section"
  | "workspace-enterprise-runtime-container-props"
  | "workspace-enterprise-runtime-prop-group"
  | "workspace-enterprise-runtime-validation-prop-group"
  | "workspace-enterprise-runtime-project-prop-group"
  | "workspace-enterprise-runtime-governance-prop-group"
  | "workspace-enterprise-runtime-ops-prop-group"
  | "workspace-enterprise-runtime-upload-prop-group"
  | "workspace-enterprise-runtime-collaboration-prop-group"
  | "workspace-enterprise-runtime-provisioning-prop-group"
  | "workspace-enterprise-runtime-account-security-prop-group"
  | "workspace-enterprise-runtime-team-operations-prop-group"
  | "workspace-enterprise-runtime-platform-decision-prop-group"
  | "workspace-enterprise-runtime-release-gate-prop-group"
  | "workspace-enterprise-runtime-collaboration-project-prop-group"
  | "enterprise-ops-exports"
  | "enterprise-release-gate-panel"
  | "workspace-primitives"
  | "workspace-shell-panels"
  | "workspace-static-config"
  | "workspace-header-section"
  | "pilot-assets-panel"
  | "workspace-left-rail-panel-section"
  | "workspace-data-import-panel"
  | "workspace-data-import-feedback-section"
  | "model-builder-panel"
  | "plot-tools-panel"
  | "uploaded-table-mapper"
  | "matrix-preview"
  | "report-generator"
  | "workspace-report-section"
  | "runtime-provenance-panels"
  | "central-fusion-analysis-scope"
  | "workspace-central-plot-deck"
  | "workspace-central-plot-deck-render"
  | "workspace-central-plot-deck-render-props"
  | "workspace-central-plot-deck-body-props"
  | "workspace-central-plot-deck-body"
  | "workspace-central-plot-deck-view-panel-branches"
  | "workspace-central-plot-deck-fusion-panel"
  | "workspace-central-plot-deck-temporal-panel"
  | "workspace-central-plot-deck-dual-lens-panel"
  | "workspace-central-plot-deck-ena-space-panel"
  | "workspace-central-plot-deck-sna-metrics-panel"
  | "workspace-central-plot-deck-evidence-ledger-panel"
  | "workspace-central-plot-deck-matrix-panel"
  | "workspace-central-plot-deck-view-panel-props"
  | "workspace-central-plot-deck-shell-controls"
  | "workspace-central-plot-deck-container-props"
  | "workspace-central-plot-deck-prop-group"
  | "workspace-central-plot-deck-composition-prop-group"
  | "workspace-central-plot-deck-composition-field-prop-group"
  | "workspace-central-plot-deck-boundary-composition-field-prop-group"
  | "workspace-central-plot-deck-boundary-composition-prop-group"
  | "workspace-central-plot-temporal-controls-prop-group"
  | "workspace-central-plot-temporal-controls-field-prop-group"
  | "workspace-central-plot-temporal-controls-composition-field-prop-group"
  | "workspace-central-plot-temporal-controls-composition-prop-group"
  | "workspace-central-plot-temporal-controls-boundary-composition-field-prop-group"
  | "workspace-central-plot-temporal-controls-boundary-composition-prop-group"
  | "workspace-central-plot-evidence-prop-group"
  | "workspace-central-plot-evidence-field-prop-group"
  | "workspace-central-plot-evidence-composition-field-prop-group"
  | "workspace-central-plot-evidence-composition-prop-group"
  | "workspace-central-plot-evidence-boundary-composition-field-prop-group"
  | "workspace-central-plot-evidence-boundary-composition-prop-group"
  | "workspace-central-plot-data-view-prop-group"
  | "workspace-central-plot-data-view-field-prop-group"
  | "workspace-central-plot-data-view-composition-field-prop-group"
  | "workspace-central-plot-data-view-composition-prop-group"
  | "workspace-central-plot-data-view-boundary-composition-field-prop-group"
  | "workspace-central-plot-data-view-boundary-composition-prop-group"
  | "workspace-central-plot-interaction-prop-group"
  | "workspace-central-plot-interaction-field-prop-group"
  | "workspace-central-plot-interaction-composition-field-prop-group"
  | "workspace-central-plot-interaction-composition-prop-group"
  | "workspace-central-plot-interaction-boundary-composition-field-prop-group"
  | "workspace-central-plot-interaction-boundary-composition-prop-group"
  | "workspace-central-plot-model-prop-group"
  | "workspace-central-plot-model-field-prop-group"
  | "workspace-central-plot-model-composition-field-prop-group"
  | "workspace-central-plot-model-composition-prop-group"
  | "workspace-central-plot-model-boundary-composition-field-prop-group"
  | "workspace-central-plot-model-boundary-composition-prop-group"
  | "workspace-central-plot-view-state-prop-group"
  | "workspace-central-plot-view-state-field-prop-group"
  | "workspace-central-plot-view-state-composition-field-prop-group"
  | "workspace-central-plot-view-state-composition-prop-group"
  | "workspace-central-plot-view-state-boundary-composition-field-prop-group"
  | "workspace-central-plot-view-state-boundary-composition-prop-group"
  | "workspace-secondary-comparison-lens"
  | "workspace-right-inspector-column"
  | "workspace-right-inspector-container-props"
  | "workspace-right-inspector-prop-group"
  | "workspace-right-inspector-layout-prop-group"
  | "workspace-right-inspector-layout-field-prop-group"
  | "workspace-right-inspector-layout-composition-field-prop-group"
  | "workspace-right-inspector-layout-composition-prop-group"
  | "workspace-right-inspector-layout-boundary-composition-field-prop-group"
  | "workspace-right-inspector-layout-boundary-composition-prop-group"
  | "workspace-right-inspector-evidence-prop-group"
  | "workspace-right-inspector-evidence-field-prop-group"
  | "workspace-right-inspector-evidence-composition-field-prop-group"
  | "workspace-right-inspector-evidence-composition-prop-group"
  | "workspace-right-inspector-evidence-boundary-composition-field-prop-group"
  | "workspace-right-inspector-evidence-boundary-composition-prop-group"
  | "workspace-right-inspector-model-prop-group"
  | "workspace-right-inspector-model-field-prop-group"
  | "workspace-right-inspector-model-boundary-composition-field-prop-group"
  | "workspace-right-inspector-model-boundary-composition-prop-group"
  | "workspace-right-inspector-selection-prop-group"
  | "workspace-right-inspector-selection-field-prop-group"
  | "workspace-right-inspector-selection-boundary-composition-field-prop-group"
  | "workspace-right-inspector-selection-boundary-composition-prop-group"
  | "workspace-right-inspector-composition-prop-group"
  | "workspace-right-inspector-composition-field-prop-group"
  | "workspace-right-inspector-boundary-composition-field-prop-group"
  | "workspace-right-inspector-boundary-composition-prop-group"
  | "evidence-ledger-panel"
  | "dual-lens-dashboard"
  | "fusion-canvas"
  | "fusion-plot-overlay"
  | "fusion-layer-key"
  | "inspector-panel"
  | "workspace-stats-panel"
  | "timeline-trace"
  | "temporal-window-builder"
  | "workspace-data-view-drawer"
  | "temporal-runtime-trace-panel"
  | "data-contract-audit-panel"
  | "sena-stats-tables"
  | "workspace-report-and-stats-deck-section"
  | "workspace-report-and-stats-deck-container-props"
  | "workspace-report-and-stats-deck-prop-group"
  | "workspace-header-left-rail-container-props"
  | "workspace-fusion-overlay-rail-main-shell-container-props"
  | "workspace-main-shell-section"
  | "workspace-main-shell-render"
  | "workspace-main-shell-prop-group"
  | "workspace-main-shell-boundary-composition-field-prop-group"
  | "workspace-main-shell-boundary-composition-prop-group"
  | "workspace-fusion-plot-maximized-overlay-prop-group"
  | "workspace-fusion-plot-overlay-selection-prop-group"
  | "workspace-fusion-plot-overlay-selection-field-prop-group"
  | "workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group"
  | "workspace-fusion-plot-overlay-selection-boundary-composition-prop-group"
  | "workspace-fusion-plot-overlay-model-prop-group"
  | "workspace-fusion-plot-overlay-model-field-prop-group"
  | "workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group"
  | "workspace-fusion-plot-overlay-model-boundary-composition-prop-group"
  | "workspace-fusion-plot-overlay-zoom-prop-group"
  | "workspace-fusion-plot-overlay-zoom-field-prop-group"
  | "workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group"
  | "workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group"
  | "workspace-fusion-plot-overlay-composition-prop-group"
  | "workspace-fusion-plot-overlay-composition-field-prop-group"
  | "workspace-fusion-plot-overlay-boundary-composition-field-prop-group"
  | "workspace-fusion-plot-overlay-boundary-composition-prop-group"
  | "workspace-rail-prop-group"
  | "workspace-rail-field-prop-group"
  | "workspace-rail-composition-field-prop-group"
  | "workspace-rail-composition-prop-group"
  | "workspace-rail-boundary-composition-field-prop-group"
  | "workspace-rail-boundary-composition-prop-group"
  | "workspace-rail-mode-handler-prop-group"
  | "workspace-header-prop-group"
  | "workspace-header-composition-prop-group"
  | "workspace-header-composition-field-prop-group"
  | "workspace-header-boundary-composition-field-prop-group"
  | "workspace-header-boundary-composition-prop-group"
  | "workspace-header-export-prop-group"
  | "workspace-header-export-field-prop-group"
  | "workspace-header-temporal-summary-prop-group"
  | "workspace-header-temporal-summary-field-prop-group"
  | "workspace-left-rail-prop-group"
  | "workspace-left-rail-composition-prop-group"
  | "workspace-left-rail-composition-field-prop-group"
  | "workspace-left-rail-boundary-composition-field-prop-group"
  | "workspace-left-rail-boundary-composition-prop-group"
  | "workspace-left-rail-panel-data-prop-group"
  | "workspace-left-rail-panel-data-field-prop-group"
  | "workspace-left-rail-panel-data-boundary-composition-field-prop-group"
  | "workspace-left-rail-panel-data-boundary-composition-prop-group"
  | "workspace-left-rail-panel-model-prop-group"
  | "workspace-left-rail-panel-model-field-prop-group"
  | "workspace-left-rail-panel-model-boundary-composition-field-prop-group"
  | "workspace-left-rail-panel-model-boundary-composition-prop-group"
  | "workspace-left-rail-workflow-prop-group"
  | "workspace-left-rail-workflow-boundary-composition-field-prop-group"
  | "workspace-left-rail-workflow-boundary-composition-prop-group"
  | "workspace-report-generator-prop-group"
  | "workspace-report-generator-composition-field-prop-group"
  | "workspace-report-generator-composition-prop-group"
  | "workspace-report-generator-boundary-composition-field-prop-group"
  | "workspace-report-generator-boundary-composition-prop-group"
  | "workspace-report-generator-report-composition-field-prop-group"
  | "workspace-report-generator-report-composition-prop-group"
  | "workspace-report-generator-report-composition-boundary-field-prop-group"
  | "workspace-report-generator-report-composition-boundary-prop-group"
  | "workspace-report-generator-governance-prop-group"
  | "workspace-report-generator-governance-composition-field-prop-group"
  | "workspace-report-generator-governance-composition-prop-group"
  | "workspace-report-generator-governance-boundary-composition-field-prop-group"
  | "workspace-report-generator-governance-boundary-composition-prop-group"
  | "workspace-report-generator-governance-field-prop-group"
  | "workspace-report-generator-reliability-prop-group"
  | "workspace-report-generator-reliability-composition-field-prop-group"
  | "workspace-report-generator-reliability-composition-prop-group"
  | "workspace-report-generator-reliability-boundary-composition-field-prop-group"
  | "workspace-report-generator-reliability-boundary-composition-prop-group"
  | "workspace-report-generator-reliability-field-prop-group"
  | "workspace-report-generator-export-prop-group"
  | "workspace-report-generator-export-composition-field-prop-group"
  | "workspace-report-generator-export-composition-prop-group"
  | "workspace-report-generator-export-boundary-composition-field-prop-group"
  | "workspace-report-generator-export-boundary-composition-prop-group"
  | "workspace-report-generator-export-callback-prop-group"
  | "workspace-report-generator-review-metadata-prop-group"
  | "workspace-report-generator-review-metadata-composition-field-prop-group"
  | "workspace-report-generator-review-metadata-composition-prop-group"
  | "workspace-report-generator-review-metadata-boundary-composition-field-prop-group"
  | "workspace-report-generator-review-metadata-boundary-composition-prop-group"
  | "workspace-report-generator-review-status-field-prop-group"
  | "workspace-report-generator-review-status-prop-group"
  | "workspace-report-generator-audit-summary-prop-group"
  | "workspace-report-generator-audit-summary-composition-field-prop-group"
  | "workspace-report-generator-audit-summary-composition-prop-group"
  | "workspace-report-generator-audit-summary-boundary-composition-field-prop-group"
  | "workspace-report-generator-audit-summary-boundary-composition-prop-group"
  | "workspace-report-generator-audit-summary-field-prop-group"
  | "workspace-data-import-prop-group"
  | "workspace-data-import-field-prop-group"
  | "workspace-model-builder-prop-group"
  | "workspace-model-builder-field-prop-group"
  | "workspace-plot-tools-prop-group"
  | "workspace-plot-tools-field-prop-group"
  | "workspace-stats-prop-group"
  | "workspace-stats-field-prop-group"
  | "workspace-data-contract-audit-prop-group"
  | "workspace-data-contract-audit-field-prop-group"
  | "workspace-data-import-feedback-prop-group"
  | "workspace-data-import-feedback-field-prop-group"
  | "workspace-workflow-steps-prop-group"
  | "workspace-workflow-steps-field-prop-group"
  | "workspace-report-and-stats-deck-metrics-prop-group"
  | "workspace-report-and-stats-deck-metrics-field-prop-group"
  | "workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group"
  | "workspace-report-and-stats-deck-metrics-boundary-composition-prop-group"
  | "workspace-report-and-stats-deck-evidence-prop-group"
  | "workspace-report-and-stats-deck-evidence-field-prop-group"
  | "workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group"
  | "workspace-report-and-stats-deck-evidence-boundary-composition-prop-group"
  | "workspace-report-and-stats-deck-report-prop-group"
  | "workspace-report-and-stats-deck-report-field-prop-group"
  | "workspace-report-and-stats-deck-report-boundary-composition-field-prop-group"
  | "workspace-report-and-stats-deck-report-boundary-composition-prop-group"
  | "workspace-report-and-stats-deck-composition-prop-group"
  | "workspace-report-and-stats-deck-composition-field-prop-group"
  | "workspace-report-and-stats-deck-composition-boundary-field-prop-group"
  | "workspace-report-and-stats-deck-composition-boundary-prop-group"
  | "workspace-report-and-stats-deck-boundary-composition-prop-group"
  | "workspace-report-and-stats-deck-boundary-composition-field-prop-group"
  | "fusion-math-audit-panel"
  | "method-formula-panel"
  | "method-validation-panel"
  | "temporal-fusion-arc";

export type SenaWorkspaceBoundaryModule = {
  id: SenaWorkspaceBoundaryModuleId;
  path: `./${string}` | `../${string}`;
  role: string;
  containerResponsibilities: readonly string[];
  runtimeExports?: Readonly<Record<string, unknown>>;
  typeExports?: readonly (keyof EnterpriseWorkspaceContractTypeExports)[];
  ownedState?: readonly (keyof EnterpriseWorkspaceContractTypeExports)[];
  testIds?: readonly string[];
  storyPhases?: readonly string[];
};

export type SenaWorkspaceModuleBoundaryManifest = {
  container: {
    id: "SenaFusionWorkspace";
    delegatedModules: readonly SenaWorkspaceBoundaryModuleId[];
    directFetchPolicy: "forbidden";
    requestTokenState: "delegated-to-runtime-hook";
    sizeBudget: {
      observedLines: number;
      maxLinesBeforeNextExtraction: number;
      nextExtractionTarget: string;
      nextExtractionCandidates: readonly string[];
    };
    refreshContracts: readonly {
      state: SenaWorkspaceRefreshContractState;
      route: string;
      transport: "requestSenaWorkspaceJson";
    }[];
  };
  modules: readonly SenaWorkspaceBoundaryModule[];
};

const enterpriseContractTypeExports = [
  "EnterpriseContext",
  "EnterprisePlatformDecisionState",
  "EnterpriseReleaseGateState",
  "EnterpriseTeamState"
] as const satisfies ReadonlyArray<keyof EnterpriseWorkspaceContractTypeExports>;

export const SENA_WORKSPACE_MODULE_BOUNDARIES = {
  container: {
    id: "SenaFusionWorkspace",
    delegatedModules: [
      "enterprise-contracts",
      "workspace-loader",
      "enterprise-options",
      "analysis-runtime",
      "api-client",
      "use-sena-fusion-workspace-main-shell-props",
      "use-enterprise-runtime",
      "use-enterprise-refresh-actions",
      "use-enterprise-mfa-actions",
      "use-enterprise-team-actions",
      "use-enterprise-notification-actions",
      "use-enterprise-upload-storage-actions",
      "use-enterprise-import-actions",
      "use-enterprise-json-artifact-export-action",
      "use-enterprise-project-actions",
      "use-enterprise-publication-actions",
      "use-enterprise-provisioning-readiness-actions",
      "use-enterprise-collaboration-actions",
      "use-enterprise-collaboration-effects",
      "use-fusion-plot-interactions",
      "use-temporal-animation-effects",
      "use-fusion-canvas-selection-state",
      "use-demo-verification-manual-review-actions",
      "use-data-contract-evidence-export-actions",
      "use-contract-upload-action",
      "use-current-project-snapshot-builder",
      "use-data-import-mapped-table-actions",
      "use-project-snapshot-export-actions",
      "use-project-snapshot-restore-action",
      "use-report-and-evidence-artifact-export-actions",
      "use-runtime-bundle-export-actions",
      "use-temporal-runtime-trace-export-actions",
      "use-method-artifact-export-actions",
      "use-runtime-manifest-export-actions",
      "use-sena-report-export-actions",
      "use-enterprise-validation-actions",
      "use-enterprise-expert-review-actions",
      "use-enterprise-reliability-actions",
      "use-enterprise-platform-decision-actions",
      "use-enterprise-release-gate-actions",
      "use-enterprise-go-live-actions",
      "use-enterprise-governance-export-actions",
      "use-enterprise-ops-alerts-actions",
      "use-enterprise-audit-backup-actions",
      "use-enterprise-database-sync-actions",
      "enterprise-actions",
      "enterprise-ops-actions",
      "enterprise-governance-notifications-panel",
      "enterprise-upload-storage-panel",
      "enterprise-platform-decision-panel",
      "enterprise-collaboration-sso-panel",
      "enterprise-account-security-panel",
      "enterprise-provisioning-readiness-panel",
      "enterprise-team-operations-panel",
      "enterprise-collaboration-project-panel",
      "enterprise-local-validation-panel",
      "enterprise-runtime-header-panel",
      "enterprise-server-project-controls-panel",
      "enterprise-runtime-panel",
      "workspace-enterprise-runtime-section",
      "workspace-enterprise-runtime-container-props",
      "workspace-enterprise-runtime-prop-group",
      "workspace-enterprise-runtime-validation-prop-group",
      "workspace-enterprise-runtime-project-prop-group",
      "workspace-enterprise-runtime-governance-prop-group",
      "workspace-enterprise-runtime-ops-prop-group",
      "workspace-enterprise-runtime-upload-prop-group",
      "workspace-enterprise-runtime-collaboration-prop-group",
      "workspace-enterprise-runtime-provisioning-prop-group",
      "workspace-enterprise-runtime-account-security-prop-group",
      "workspace-enterprise-runtime-team-operations-prop-group",
      "workspace-enterprise-runtime-platform-decision-prop-group",
      "workspace-enterprise-runtime-release-gate-prop-group",
      "workspace-enterprise-runtime-collaboration-project-prop-group",
      "enterprise-ops-exports",
      "enterprise-release-gate-panel",
      "workspace-primitives",
      "workspace-shell-panels",
      "workspace-static-config",
      "workspace-header-section",
      "pilot-assets-panel",
      "workspace-left-rail-panel-section",
      "workspace-data-import-panel",
      "workspace-data-import-feedback-section",
      "model-builder-panel",
      "plot-tools-panel",
      "uploaded-table-mapper",
      "matrix-preview",
      "report-generator",
      "workspace-report-section",
      "runtime-provenance-panels",
      "central-fusion-analysis-scope",
      "workspace-central-plot-deck",
      "workspace-central-plot-deck-render",
      "workspace-central-plot-deck-render-props",
      "workspace-central-plot-deck-body-props",
      "workspace-central-plot-deck-body",
      "workspace-central-plot-deck-view-panel-branches",
      "workspace-central-plot-deck-fusion-panel",
      "workspace-central-plot-deck-temporal-panel",
      "workspace-central-plot-deck-dual-lens-panel",
      "workspace-central-plot-deck-ena-space-panel",
      "workspace-central-plot-deck-sna-metrics-panel",
      "workspace-central-plot-deck-evidence-ledger-panel",
      "workspace-central-plot-deck-matrix-panel",
      "workspace-central-plot-deck-view-panel-props",
      "workspace-central-plot-deck-shell-controls",
      "workspace-central-plot-deck-container-props",
      "workspace-central-plot-deck-prop-group",
      "workspace-central-plot-deck-composition-prop-group",
      "workspace-central-plot-deck-composition-field-prop-group",
      "workspace-central-plot-deck-boundary-composition-field-prop-group",
      "workspace-central-plot-deck-boundary-composition-prop-group",
      "workspace-central-plot-temporal-controls-prop-group",
      "workspace-central-plot-temporal-controls-field-prop-group",
      "workspace-central-plot-temporal-controls-composition-field-prop-group",
      "workspace-central-plot-temporal-controls-composition-prop-group",
      "workspace-central-plot-temporal-controls-boundary-composition-field-prop-group",
      "workspace-central-plot-temporal-controls-boundary-composition-prop-group",
      "workspace-central-plot-evidence-prop-group",
      "workspace-central-plot-evidence-field-prop-group",
      "workspace-central-plot-evidence-composition-field-prop-group",
      "workspace-central-plot-evidence-composition-prop-group",
      "workspace-central-plot-evidence-boundary-composition-field-prop-group",
      "workspace-central-plot-evidence-boundary-composition-prop-group",
      "workspace-central-plot-data-view-prop-group",
      "workspace-central-plot-data-view-field-prop-group",
      "workspace-central-plot-data-view-composition-field-prop-group",
      "workspace-central-plot-data-view-composition-prop-group",
      "workspace-central-plot-data-view-boundary-composition-field-prop-group",
      "workspace-central-plot-data-view-boundary-composition-prop-group",
      "workspace-central-plot-interaction-prop-group",
      "workspace-central-plot-interaction-field-prop-group",
      "workspace-central-plot-interaction-composition-field-prop-group",
      "workspace-central-plot-interaction-composition-prop-group",
      "workspace-central-plot-interaction-boundary-composition-field-prop-group",
      "workspace-central-plot-interaction-boundary-composition-prop-group",
      "workspace-central-plot-model-prop-group",
      "workspace-central-plot-model-field-prop-group",
      "workspace-central-plot-model-composition-field-prop-group",
      "workspace-central-plot-model-composition-prop-group",
      "workspace-central-plot-model-boundary-composition-field-prop-group",
      "workspace-central-plot-model-boundary-composition-prop-group",
      "workspace-central-plot-view-state-prop-group",
      "workspace-central-plot-view-state-field-prop-group",
      "workspace-central-plot-view-state-composition-field-prop-group",
      "workspace-central-plot-view-state-composition-prop-group",
      "workspace-central-plot-view-state-boundary-composition-field-prop-group",
      "workspace-central-plot-view-state-boundary-composition-prop-group",
      "workspace-secondary-comparison-lens",
      "workspace-right-inspector-column",
      "workspace-right-inspector-container-props",
      "workspace-right-inspector-prop-group",
      "workspace-right-inspector-layout-prop-group",
      "workspace-right-inspector-layout-field-prop-group",
      "workspace-right-inspector-layout-composition-field-prop-group",
      "workspace-right-inspector-layout-composition-prop-group",
      "workspace-right-inspector-layout-boundary-composition-field-prop-group",
      "workspace-right-inspector-layout-boundary-composition-prop-group",
      "workspace-right-inspector-evidence-prop-group",
      "workspace-right-inspector-evidence-field-prop-group",
      "workspace-right-inspector-evidence-composition-field-prop-group",
      "workspace-right-inspector-evidence-composition-prop-group",
      "workspace-right-inspector-evidence-boundary-composition-field-prop-group",
      "workspace-right-inspector-evidence-boundary-composition-prop-group",
      "workspace-right-inspector-model-prop-group",
      "workspace-right-inspector-model-field-prop-group",
      "workspace-right-inspector-model-boundary-composition-field-prop-group",
      "workspace-right-inspector-model-boundary-composition-prop-group",
      "workspace-right-inspector-selection-prop-group",
      "workspace-right-inspector-selection-field-prop-group",
      "workspace-right-inspector-selection-boundary-composition-field-prop-group",
      "workspace-right-inspector-selection-boundary-composition-prop-group",
      "workspace-right-inspector-composition-prop-group",
      "workspace-right-inspector-composition-field-prop-group",
      "workspace-right-inspector-boundary-composition-field-prop-group",
      "workspace-right-inspector-boundary-composition-prop-group",
      "evidence-ledger-panel",
      "dual-lens-dashboard",
      "fusion-canvas",
      "fusion-plot-overlay",
      "fusion-layer-key",
      "inspector-panel",
      "workspace-stats-panel",
      "timeline-trace",
      "temporal-window-builder",
      "workspace-data-view-drawer",
      "temporal-runtime-trace-panel",
      "data-contract-audit-panel",
      "sena-stats-tables",
      "workspace-report-and-stats-deck-section",
      "workspace-report-and-stats-deck-container-props",
      "workspace-report-and-stats-deck-prop-group",
      "workspace-header-left-rail-container-props",
      "workspace-fusion-overlay-rail-main-shell-container-props",
      "workspace-main-shell-section",
      "workspace-main-shell-render",
      "workspace-main-shell-prop-group",
      "workspace-main-shell-boundary-composition-field-prop-group",
      "workspace-main-shell-boundary-composition-prop-group",
      "workspace-fusion-plot-maximized-overlay-prop-group",
      "workspace-fusion-plot-overlay-selection-prop-group",
      "workspace-fusion-plot-overlay-selection-field-prop-group",
      "workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-selection-boundary-composition-prop-group",
      "workspace-fusion-plot-overlay-model-prop-group",
      "workspace-fusion-plot-overlay-model-field-prop-group",
      "workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-model-boundary-composition-prop-group",
      "workspace-fusion-plot-overlay-zoom-prop-group",
      "workspace-fusion-plot-overlay-zoom-field-prop-group",
      "workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group",
      "workspace-fusion-plot-overlay-composition-prop-group",
      "workspace-fusion-plot-overlay-composition-field-prop-group",
      "workspace-fusion-plot-overlay-boundary-composition-field-prop-group",
      "workspace-fusion-plot-overlay-boundary-composition-prop-group",
      "workspace-rail-prop-group",
      "workspace-rail-field-prop-group",
      "workspace-rail-composition-field-prop-group",
      "workspace-rail-composition-prop-group",
      "workspace-rail-boundary-composition-field-prop-group",
      "workspace-rail-boundary-composition-prop-group",
      "workspace-rail-mode-handler-prop-group",
      "workspace-header-prop-group",
      "workspace-header-composition-prop-group",
      "workspace-header-composition-field-prop-group",
      "workspace-header-boundary-composition-field-prop-group",
      "workspace-header-boundary-composition-prop-group",
      "workspace-header-export-prop-group",
      "workspace-header-export-field-prop-group",
      "workspace-header-temporal-summary-prop-group",
      "workspace-header-temporal-summary-field-prop-group",
      "workspace-left-rail-prop-group",
      "workspace-left-rail-composition-prop-group",
      "workspace-left-rail-composition-field-prop-group",
      "workspace-left-rail-boundary-composition-field-prop-group",
      "workspace-left-rail-boundary-composition-prop-group",
      "workspace-left-rail-panel-data-prop-group",
      "workspace-left-rail-panel-data-field-prop-group",
      "workspace-left-rail-panel-data-boundary-composition-field-prop-group",
      "workspace-left-rail-panel-data-boundary-composition-prop-group",
      "workspace-left-rail-panel-model-prop-group",
      "workspace-left-rail-panel-model-field-prop-group",
      "workspace-left-rail-panel-model-boundary-composition-field-prop-group",
      "workspace-left-rail-panel-model-boundary-composition-prop-group",
      "workspace-left-rail-workflow-prop-group",
      "workspace-left-rail-workflow-boundary-composition-field-prop-group",
      "workspace-left-rail-workflow-boundary-composition-prop-group",
      "workspace-report-generator-prop-group",
      "workspace-report-generator-composition-field-prop-group",
      "workspace-report-generator-composition-prop-group",
      "workspace-report-generator-boundary-composition-field-prop-group",
      "workspace-report-generator-boundary-composition-prop-group",
      "workspace-report-generator-report-composition-field-prop-group",
      "workspace-report-generator-report-composition-prop-group",
      "workspace-report-generator-report-composition-boundary-field-prop-group",
      "workspace-report-generator-report-composition-boundary-prop-group",
      "workspace-report-generator-governance-prop-group",
      "workspace-report-generator-governance-composition-field-prop-group",
      "workspace-report-generator-governance-composition-prop-group",
      "workspace-report-generator-governance-boundary-composition-field-prop-group",
      "workspace-report-generator-governance-boundary-composition-prop-group",
      "workspace-report-generator-governance-field-prop-group",
      "workspace-report-generator-reliability-prop-group",
      "workspace-report-generator-reliability-composition-field-prop-group",
      "workspace-report-generator-reliability-composition-prop-group",
      "workspace-report-generator-reliability-boundary-composition-field-prop-group",
      "workspace-report-generator-reliability-boundary-composition-prop-group",
      "workspace-report-generator-reliability-field-prop-group",
      "workspace-report-generator-export-prop-group",
      "workspace-report-generator-export-composition-field-prop-group",
      "workspace-report-generator-export-composition-prop-group",
      "workspace-report-generator-export-boundary-composition-field-prop-group",
      "workspace-report-generator-export-boundary-composition-prop-group",
      "workspace-report-generator-export-callback-prop-group",
      "workspace-report-generator-review-metadata-prop-group",
      "workspace-report-generator-review-metadata-composition-field-prop-group",
      "workspace-report-generator-review-metadata-composition-prop-group",
      "workspace-report-generator-review-metadata-boundary-composition-field-prop-group",
      "workspace-report-generator-review-metadata-boundary-composition-prop-group",
      "workspace-report-generator-review-status-field-prop-group",
      "workspace-report-generator-review-status-prop-group",
      "workspace-report-generator-audit-summary-prop-group",
      "workspace-report-generator-audit-summary-composition-field-prop-group",
      "workspace-report-generator-audit-summary-composition-prop-group",
      "workspace-report-generator-audit-summary-boundary-composition-field-prop-group",
      "workspace-report-generator-audit-summary-boundary-composition-prop-group",
      "workspace-report-generator-audit-summary-field-prop-group",
      "workspace-data-import-prop-group",
      "workspace-data-import-field-prop-group",
      "workspace-model-builder-prop-group",
      "workspace-model-builder-field-prop-group",
      "workspace-plot-tools-prop-group",
      "workspace-plot-tools-field-prop-group",
      "workspace-stats-prop-group",
      "workspace-stats-field-prop-group",
      "workspace-data-contract-audit-prop-group",
      "workspace-data-contract-audit-field-prop-group",
      "workspace-data-import-feedback-prop-group",
      "workspace-data-import-feedback-field-prop-group",
      "workspace-workflow-steps-prop-group",
      "workspace-workflow-steps-field-prop-group",
      "workspace-report-and-stats-deck-metrics-prop-group",
      "workspace-report-and-stats-deck-metrics-field-prop-group",
      "workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group",
      "workspace-report-and-stats-deck-metrics-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-evidence-prop-group",
      "workspace-report-and-stats-deck-evidence-field-prop-group",
      "workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group",
      "workspace-report-and-stats-deck-evidence-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-report-prop-group",
      "workspace-report-and-stats-deck-report-field-prop-group",
      "workspace-report-and-stats-deck-report-boundary-composition-field-prop-group",
      "workspace-report-and-stats-deck-report-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-composition-prop-group",
      "workspace-report-and-stats-deck-composition-field-prop-group",
      "workspace-report-and-stats-deck-composition-boundary-field-prop-group",
      "workspace-report-and-stats-deck-composition-boundary-prop-group",
      "workspace-report-and-stats-deck-boundary-composition-prop-group",
      "workspace-report-and-stats-deck-boundary-composition-field-prop-group",
      "fusion-math-audit-panel",
      "method-formula-panel",
      "method-validation-panel",
      "temporal-fusion-arc"
    ],
    directFetchPolicy: "forbidden",
    requestTokenState: "delegated-to-runtime-hook",
    sizeBudget: {
      observedLines: 9,
      maxLinesBeforeNextExtraction: 120,
      nextExtractionTarget: "sena-fusion-workspace-container-derived-data-and-action-state-extraction",
      nextExtractionCandidates: [
        "sena fusion workspace container derived data and action state extraction"
      ]
    },
    refreshContracts: [
      {
        state: "EnterpriseTeamState",
        route: SENA_WORKSPACE_API_ROUTES.enterprise.team,
        transport: "requestSenaWorkspaceJson"
      },
      {
        state: "EnterprisePlatformDecisionState",
        route: SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions,
        transport: "requestSenaWorkspaceJson"
      },
      {
        state: "EnterpriseReleaseGateState",
        route: SENA_WORKSPACE_API_ROUTES.enterprise.releaseGate,
        transport: "requestSenaWorkspaceJson"
      }
    ]
  },
  modules: [
    {
      id: "workspace-loader",
      path: "../SenaFusionWorkspaceLoader",
      role: "Client-side dynamic loader for deferring the full research workbench out of the prerendered route shell.",
      runtimeExports: {
        SenaFusionWorkspaceLoader
      },
      containerResponsibilities: [
        "render a lightweight loading shell before the full workspace bundle is requested",
        "avoid server-prerendering the entire interactive workbench HTML"
      ],
      testIds: ["sena-workspace-loading"]
    },
    {
      id: "enterprise-contracts",
      path: "./enterprise-contracts",
      role: "Typed enterprise response contracts consumed by the workspace container.",
      typeExports: enterpriseContractTypeExports,
      containerResponsibilities: [
        "consume imported enterprise response types",
        "avoid redeclaring enterprise response contracts inline"
      ]
    },
    {
      id: "enterprise-options",
      path: "./enterprise-options",
      role: "Enterprise select-list and metric option collections.",
      runtimeExports: {
        enterprisePlatformDecisionOptions,
        enterpriseSsoProviderOptions,
        enterpriseValidationMetrics
      },
      containerResponsibilities: [
        "render imported option collections",
        "avoid declaring enterprise option arrays inline"
      ]
    },
    {
      id: "analysis-runtime",
      path: "./analysis-runtime",
      role: "Client-safe SENA runtime adapter that imports concrete analysis modules instead of the lib/sena barrel.",
      runtimeExports: {
        buildSenaModel,
        buildSenaReport,
        importSenaJsonContract
      },
      containerResponsibilities: [
        "call imported runtime adapter functions",
        "avoid importing from the lib/sena barrel in client workspace modules"
      ]
    },
    {
      id: "api-client",
      path: "./api-client",
      role: "Centralized workspace route literals, URL builders, and JSON transport.",
      runtimeExports: {
        requestSenaWorkspaceJson,
        SENA_WORKSPACE_API_ROUTES
      },
      containerResponsibilities: [
        "call requestSenaWorkspaceJson for refresh reads",
        "avoid direct fetch calls in the main container"
      ]
    },
    {
      id: "use-sena-fusion-workspace-main-shell-props",
      path: "./use-sena-fusion-workspace-main-shell-props",
      role: "Client hook that owns SENA workspace state, derived runtime data, action wiring, and final main-shell prop composition for the thin component entry.",
      runtimeExports: {
        useSenaFusionWorkspaceMainShellProps
      },
      containerResponsibilities: [
        "call useSenaFusionWorkspaceMainShellProps from the thin SenaFusionWorkspace component",
        "keep state declarations, derived analysis data, enterprise action wiring, and shell prop assembly outside the component file"
      ]
    },
    {
      id: "use-enterprise-runtime",
      path: "./use-enterprise-runtime",
      role: "Client hook that owns enterprise CSRF token state and secure request headers.",
      runtimeExports: {
        useEnterpriseWorkspaceApi
      },
      ownedState: ["EnterpriseCsrfToken"],
      containerResponsibilities: [
        "call useEnterpriseWorkspaceApi",
        "reset CSRF state through resetEnterpriseCsrfToken"
      ]
    },
    {
      id: "use-enterprise-refresh-actions",
      path: "./use-enterprise-refresh-actions",
      role: "Client hook that owns enterprise refresh callbacks, logout, session revoke, and session-missing cleanup.",
      runtimeExports: {
        useEnterpriseRefreshActions
      },
      containerResponsibilities: [
        "own enterprise refresh callbacks for session, team, MFA status, platform decisions, release gate, imports, analysis runs, logout, and session revoke",
        "keep refresh request route literals, logout and revoke action calls, session-list patching, and reset-on-missing-session state cleanup outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-mfa-actions",
      path: "./use-enterprise-mfa-actions",
      role: "Client hook that owns enterprise authenticator MFA setup, enable, and disable callbacks.",
      runtimeExports: {
        useEnterpriseMfaActions
      },
      containerResponsibilities: [
        "own enterprise authenticator MFA setup, enable, and disable callbacks",
        "keep MFA action calls, setup-token binding, authenticator-code validation, and MFA status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-team-actions",
      path: "./use-enterprise-team-actions",
      role: "Client hook that owns enterprise team invitation and membership mutation callbacks.",
      runtimeExports: {
        useEnterpriseTeamActions
      },
      containerResponsibilities: [
        "own enterprise team invitation create, accept, revoke, and membership update callbacks",
        "keep team action calls, invite-code validation, team refresh choreography, and team status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-notification-actions",
      path: "./use-enterprise-notification-actions",
      role: "Client hook that owns enterprise notification mark-read and delivery callbacks.",
      runtimeExports: {
        useEnterpriseNotificationActions
      },
      containerResponsibilities: [
        "own enterprise notification mark-read, webhook delivery, and email delivery callbacks",
        "keep notification action calls, delivery target binding, team refresh choreography, and notification status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-upload-storage-actions",
      path: "./use-enterprise-upload-storage-actions",
      role: "Client hook that owns enterprise upload registry refresh, file registration, and object-storage delivery callbacks.",
      runtimeExports: {
        useEnterpriseUploadStorageActions
      },
      containerResponsibilities: [
        "own enterprise upload storage refresh, registry file creation, and object-storage delivery callbacks",
        "keep upload action calls, file input clearing, CSRF upload binding, object-storage delivery binding, and upload status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-import-actions",
      path: "./use-enterprise-import-actions",
      role: "Client hook that owns enterprise file import and local adapter fallback callbacks.",
      runtimeExports: {
        useEnterpriseImportActions
      },
      containerResponsibilities: [
        "own enterprise file import, persisted project hydration, import-run list updates, and local adapter fallback callbacks",
        "keep enterprise import action calls, dynamic adapter import, upload scan summaries, cleaning-manifest summaries, and import status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-json-artifact-export-action",
      path: "./use-enterprise-json-artifact-export-action",
      role: "Client hook that owns generic enterprise JSON artifact export side effects.",
      runtimeExports: {
        useEnterpriseJsonArtifactExportAction
      },
      containerResponsibilities: [
        "own enterprise JSON artifact auth guard, busy-state binding, action call, JSON serialization, download callback, and status messages",
        "keep generic enterprise artifact export side effects outside the main workspace container while downstream enterprise hooks share one callback"
      ]
    },
    {
      id: "use-enterprise-project-actions",
      path: "./use-enterprise-project-actions",
      role: "Client hook that owns enterprise project save, open, restore, and server analysis callbacks.",
      runtimeExports: {
        useEnterpriseProjectActions
      },
      containerResponsibilities: [
        "own enterprise project save, open, revision restore, and server-side analysis callbacks",
        "keep project action calls, snapshot persistence binding, version conflict handling, analysis-run list updates, and project status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-publication-actions",
      path: "./use-enterprise-publication-actions",
      role: "Client hook that owns enterprise publication export callbacks.",
      runtimeExports: {
        useEnterprisePublicationActions
      },
      containerResponsibilities: [
        "own enterprise publication export callbacks",
        "keep publication export action calls, Blob download binding, snapshot fallback binding, and publication status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-provisioning-readiness-actions",
      path: "./use-enterprise-provisioning-readiness-actions",
      role: "Client hook that owns provisioning and SCIM readiness refresh callbacks.",
      runtimeExports: {
        useEnterpriseProvisioningReadinessActions
      },
      containerResponsibilities: [
        "own provisioning and SCIM readiness refresh callbacks",
        "keep provisioning readiness action calls, deployment package hydration, identity evidence hydration, and readiness status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-collaboration-actions",
      path: "./use-enterprise-collaboration-actions",
      role: "Client hook that owns enterprise collaboration refresh, presence, comment, adjudication, pub/sub delivery, and SSO preflight callbacks.",
      runtimeExports: {
        useEnterpriseCollaborationActions
      },
      containerResponsibilities: [
        "own enterprise collaboration refresh, presence, comment, adjudication, pub/sub delivery, and SSO preflight callbacks",
        "keep collaboration request actions, SSO preflight action calls, delivery status messages, and comment/adjudication form cleanup outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-collaboration-effects",
      path: "./use-enterprise-collaboration-effects",
      role: "Client hook that owns enterprise collaboration stream subscription and presence heartbeat effects.",
      runtimeExports: {
        useEnterpriseCollaborationEffects
      },
      containerResponsibilities: [
        "own enterprise collaboration EventSource subscription and presence heartbeat effects",
        "keep collaboration stream route binding, presence action calls, transport state transitions, and heartbeat interval cleanup outside the main workspace container"
      ]
    },
    {
      id: "use-fusion-plot-interactions",
      path: "./use-fusion-plot-interactions",
      role: "Client hook that owns Fusion Plot fullscreen, zoom, and layer visibility interactions.",
      runtimeExports: {
        useFusionPlotInteractions
      },
      containerResponsibilities: [
        "own Fusion Plot fullscreen keyboard, body overflow, maximize, close, zoom, and layer visibility callbacks",
        "keep fullscreen Escape handling, body scroll locking, zoom clamping, zoom step binding, and layer toggle state updates outside the main workspace container"
      ]
    },
    {
      id: "use-temporal-animation-effects",
      path: "./use-temporal-animation-effects",
      role: "Client hook that owns temporal active-window reset, restore, bounds, and playback effects.",
      runtimeExports: {
        useTemporalAnimationEffects
      },
      containerResponsibilities: [
        "own temporal active-window reset, restored-window selection, bounds clamping, and animation interval effects",
        "keep temporal playback interval binding, pending-window restoration, and animation stop conditions outside the main workspace container"
      ]
    },
    {
      id: "use-demo-verification-manual-review-actions",
      path: "./use-demo-verification-manual-review-actions",
      role: "Client hook that owns demo verification manual-review editing and import callbacks.",
      runtimeExports: {
        useDemoVerificationManualReviewActions
      },
      containerResponsibilities: [
        "own demo verification manual-review patching and compatibility-checked import callbacks",
        "keep manual-review default state, compatibility mismatch messages, and verification summary status messages outside the main workspace container"
      ]
    },
    {
      id: "use-data-contract-evidence-export-actions",
      path: "./use-data-contract-evidence-export-actions",
      role: "Client hook that owns data-contract evidence export download side effects.",
      runtimeExports: {
        useDataContractEvidenceExportActions
      },
      containerResponsibilities: [
        "own data-contract audit, import cleaning manifest, and validation parity evidence filenames, JSON serialization, guard messages, and download callbacks",
        "keep data-contract and validation evidence export side effects outside the main workspace container"
      ]
    },
    {
      id: "use-data-import-mapped-table-actions",
      path: "./use-data-import-mapped-table-actions",
      role: "Client hook that owns mapped-table dataset commits and import-status resets.",
      runtimeExports: {
        useDataImportMappedTableActions
      },
      containerResponsibilities: [
        "own mapped-table dataset construction, upload table commits, uploaded table updates, table mapping callbacks, clear-contract reset, lesson-study sample loading, contract-template export, local enterprise result resets, and import status messages",
        "keep buildSenaDatasetFromTables binding, uploaded table mapping, empty dataset reset, sample fetch/import, contract-template JSON, and mapped-table reset side effects outside the main workspace container"
      ]
    },
    {
      id: "use-current-project-snapshot-builder",
      path: "./use-current-project-snapshot-builder",
      role: "Client hook that owns current project snapshot builder closure and review/governance binding.",
      runtimeExports: {
        useCurrentProjectSnapshotBuilder
      },
      containerResponsibilities: [
        "own current project snapshot generatedAt default, source dataset, temporal trace, demo manual-review, human-review, coding-reliability, and data-governance binding",
        "keep buildSenaProjectSnapshot callback construction outside the main workspace container while export, validation, project, and publication hooks share one builder"
      ]
    },
    {
      id: "use-contract-upload-action",
      path: "./use-contract-upload-action",
      role: "Client hook that owns contract upload parsing, snapshot/review-packet/demo restoration dispatch, CSV staging, and enterprise import fallback.",
      runtimeExports: {
        useContractUploadAction
      },
      containerResponsibilities: [
        "own contract upload file filtering, JSON schema dispatch, CSV table inference, enterprise import fallback, and upload input reset",
        "keep project snapshot, review packet, demo verification, JSON contract, and CSV upload branching outside the main workspace container"
      ]
    },
    {
      id: "use-project-snapshot-export-actions",
      path: "./use-project-snapshot-export-actions",
      role: "Client hook that owns project snapshot export download side effects.",
      runtimeExports: {
        useProjectSnapshotExportActions
      },
      containerResponsibilities: [
        "own project snapshot generatedAt creation, JSON serialization, filename binding, and download callback",
        "keep project snapshot export side effects outside the main workspace container while preserving the container-owned snapshot builder"
      ]
    },
    {
      id: "use-project-snapshot-restore-action",
      path: "./use-project-snapshot-restore-action",
      role: "Client hook that owns project snapshot restore state hydration.",
      runtimeExports: {
        useProjectSnapshotRestoreAction
      },
      containerResponsibilities: [
        "own snapshot dataset, build options, review, reliability, governance, manual-review, selection, temporal-window, and import-message state restoration",
        "keep project snapshot restore state hydration outside the main workspace container while enterprise import and project hooks share one restore callback"
      ]
    },
    {
      id: "use-report-and-evidence-artifact-export-actions",
      path: "./use-report-and-evidence-artifact-export-actions",
      role: "Client hook that owns report, evidence, review packet, demo, validation, and readiness artifact export download side effects.",
      runtimeExports: {
        useReportAndEvidenceArtifactExportActions
      },
      containerResponsibilities: [
        "own report, evidence ledger, demo walkthrough, demo verification, development plan, pilot readiness, reliability, validation, claim readiness, and review-packet export callbacks",
        "keep report and evidence artifact construction, JSON serialization, Markdown conversion, filename binding, and missing-evidence messages outside the main workspace container"
      ]
    },
    {
      id: "use-runtime-manifest-export-actions",
      path: "./use-runtime-manifest-export-actions",
      role: "Client hook that owns runtime manifest and audit export download side effects.",
      runtimeExports: {
        useRuntimeManifestExportActions
      },
      containerResponsibilities: [
        "own jENA manifest, jSNA manifest, runtime consistency audit, and fusion math audit JSON download callbacks",
        "keep already-built runtime manifest and audit object serialization outside the main workspace container"
      ]
    },
    {
      id: "use-runtime-bundle-export-actions",
      path: "./use-runtime-bundle-export-actions",
      role: "Client hook that owns runtime bundle export download side effects.",
      runtimeExports: {
        useRuntimeBundleExportActions
      },
      containerResponsibilities: [
        "own runtime bundle generatedAt creation, human-review binding, coding-reliability reviewedAt binding, JSON serialization, filename binding, and download callback",
        "keep buildSenaRuntimeBundle export side effects outside the main workspace container while preserving the current report review and governance inputs"
      ]
    },
    {
      id: "use-temporal-runtime-trace-export-actions",
      path: "./use-temporal-runtime-trace-export-actions",
      role: "Client hook that owns temporal runtime trace export download side effects.",
      runtimeExports: {
        useTemporalRuntimeTraceExportActions
      },
      containerResponsibilities: [
        "own temporal runtime trace generatedAt creation, trace rebuild binding, JSON serialization, filename binding, and download callback",
        "keep buildSenaTemporalRuntimeTrace export side effects outside the main workspace container while preserving the container-owned timeline model"
      ]
    },
    {
      id: "use-fusion-canvas-selection-state",
      path: "./use-fusion-canvas-selection-state",
      role: "Client hook that owns Fusion Canvas selected id and revealed node-label state.",
      runtimeExports: {
        useFusionCanvasSelectionState
      },
      containerResponsibilities: [
        "own selected id, selected element fallback resolution, graph-node label reveal state, label pruning, and canvas selection callback",
        "keep Fusion Canvas selection and revealed-label state transitions outside the main workspace container"
      ]
    },
    {
      id: "use-method-artifact-export-actions",
      path: "./use-method-artifact-export-actions",
      role: "Client hook that owns method protocol and visual grammar export download side effects.",
      runtimeExports: {
        useMethodArtifactExportActions
      },
      containerResponsibilities: [
        "own method protocol and visual grammar generatedAt creation, artifact builder calls, filenames, JSON serialization, and download callbacks",
        "keep method protocol and visual grammar export side effects outside the main workspace container"
      ]
    },
    {
      id: "use-sena-report-export-actions",
      path: "./use-sena-report-export-actions",
      role: "Client hook that owns SENA report artifact export download side effects.",
      runtimeExports: {
        useSenaReportExportActions
      },
      containerResponsibilities: [
        "own generatedAt creation, artifact builder calls, filenames, JSON serialization, and download callbacks for SENA report exports",
        "keep pair contribution, jSNA, metric provenance, and jENA report export side effects outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-validation-actions",
      path: "./use-enterprise-validation-actions",
      role: "Client hook that owns enterprise validation run and validation review callbacks.",
      runtimeExports: {
        useEnterpriseValidationActions
      },
      containerResponsibilities: [
        "own local and server-backed enterprise validation run callbacks plus validation review actions",
        "keep validation inference imports, preregistration hashing, and validation status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-expert-review-actions",
      path: "./use-enterprise-expert-review-actions",
      role: "Client hook that owns enterprise expert-review submit, update, and dossier export callbacks.",
      runtimeExports: {
        useEnterpriseExpertReviewActions
      },
      containerResponsibilities: [
        "own enterprise expert-review submit, update, and dossier export callbacks",
        "keep expert-review request actions, target selection, form cleanup, and status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-reliability-actions",
      path: "./use-enterprise-reliability-actions",
      role: "Client hook that owns enterprise reliability import, review, local fallback, and review-patch callbacks.",
      runtimeExports: {
        useEnterpriseReliabilityActions
      },
      containerResponsibilities: [
        "own enterprise reliability review, local import fallback, server upload, and review-patch callbacks",
        "keep reliability adapter imports, CSRF upload actions, review-patch field hydration, and reliability status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-platform-decision-actions",
      path: "./use-enterprise-platform-decision-actions",
      role: "Client hook that owns platform-decision review submission, register export, and identity request form hydration callbacks.",
      runtimeExports: {
        useEnterprisePlatformDecisionActions
      },
      containerResponsibilities: [
        "own platform-decision review submission, register JSON export, and identity request form hydration callbacks",
        "keep platform decision export route binding, artifact filename, URL policy checks, production evidence timestamp checks, policy hash binding, and identity evidence status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-release-gate-actions",
      path: "./use-enterprise-release-gate-actions",
      role: "Client hook that owns release-gate review submission and export callbacks.",
      runtimeExports: {
        useEnterpriseReleaseGateActions
      },
      containerResponsibilities: [
        "own release-gate review submission and release-gate review export callbacks",
        "keep release-gate validation, verification hash binding, provisioning refresh, and release-gate status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-go-live-actions",
      path: "./use-enterprise-go-live-actions",
      role: "Client hook that owns go-live rehearsal, rollback-drill, post-cutover monitor, draft, attestation, and attestation export callbacks.",
      runtimeExports: {
        useEnterpriseGoLiveActions
      },
      containerResponsibilities: [
        "own go-live rehearsal, rollback-drill, post-cutover monitor, and attestation export callbacks",
        "keep go-live route binding, artifact filenames, release-gate draft hydration, checklist binding, and go-live status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-governance-export-actions",
      path: "./use-enterprise-governance-export-actions",
      role: "Client hook that owns enterprise governance, ops, deployment, capability, native-adapter, and SaaS readiness JSON export callbacks.",
      runtimeExports: {
        useEnterpriseGovernanceExportActions
      },
      containerResponsibilities: [
        "own enterprise governance, ops, deployment, capability, native-adapter, and SaaS readiness JSON export callbacks",
        "keep enterprise JSON export route binding, artifact filenames, and export labels outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-ops-alerts-actions",
      path: "./use-enterprise-ops-alerts-actions",
      role: "Client hook that owns enterprise ops alert export and delivery callbacks.",
      runtimeExports: {
        useEnterpriseOpsAlertsActions
      },
      containerResponsibilities: [
        "own enterprise ops alert export and delivery callbacks",
        "keep ops alert action calls, export route binding, and delivery status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-audit-backup-actions",
      path: "./use-enterprise-audit-backup-actions",
      role: "Client hook that owns enterprise audit CSV export, backup export, audit delivery, and backup delivery callbacks.",
      runtimeExports: {
        useEnterpriseAuditBackupActions
      },
      containerResponsibilities: [
        "own enterprise audit CSV export, backup export, audit delivery, and backup delivery callbacks",
        "keep audit and backup action calls, CSV download binding, team refresh, and delivery status messages outside the main workspace container"
      ]
    },
    {
      id: "use-enterprise-database-sync-actions",
      path: "./use-enterprise-database-sync-actions",
      role: "Client hook that owns enterprise database sync callbacks.",
      runtimeExports: {
        useEnterpriseDatabaseSyncActions
      },
      containerResponsibilities: [
        "own enterprise database sync callbacks",
        "keep database sync action calls, team refresh, and database sync status messages outside the main workspace container"
      ]
    },
    {
      id: "enterprise-actions",
      path: "./enterprise-actions",
      role: "Typed identity, team, upload, project, reliability, and validation action helpers.",
      runtimeExports: {
        createTeamInvitationAction,
        deliverEnterpriseNotificationsAction,
        startEnterpriseMfaSetupAction
      },
      containerResponsibilities: [
        "call typed enterprise action helpers",
        "avoid inline identity/team request bodies"
      ]
    },
    {
      id: "enterprise-ops-actions",
      path: "./enterprise-ops-actions",
      role: "Typed governance, deployment, backup, audit, release-gate, and go-live action helpers.",
      runtimeExports: {
        deliverEnterpriseAuditLogAction,
        deliverEnterpriseBackupAction,
        deliverEnterpriseOpsAlertsAction,
        exportEnterpriseAuditCsvAction,
        exportEnterpriseJsonArtifactAction,
        getEnterpriseGoLiveRehearsalAction,
        refreshEnterpriseProvisioningReadinessAction,
        submitEnterpriseGoLiveAttestationAction,
        submitEnterpriseReleaseGateReviewAction,
        syncEnterpriseDatabaseAction
      },
      containerResponsibilities: [
        "call typed enterprise ops action helpers",
        "avoid inline governance/deployment request bodies"
      ]
    },
    {
      id: "enterprise-governance-notifications-panel",
      path: "./enterprise-governance-notifications-panel",
      role: "Enterprise governance artifact export controls and notification center.",
      runtimeExports: {
        EnterpriseGovernanceNotificationsPanel
      },
      testIds: [
        "enterprise-governance-exports",
        "enterprise-notification-center",
        "enterprise-notification-mark-read"
      ],
      containerResponsibilities: [
        "render EnterpriseGovernanceNotificationsPanel with prepared governance and notification callbacks",
        "avoid keeping governance export and notification-center JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-upload-storage-panel",
      path: "./enterprise-upload-storage-panel",
      role: "Enterprise upload registry, blob verification, and object-storage delivery controls.",
      runtimeExports: {
        EnterpriseUploadStoragePanel
      },
      testIds: [
        "enterprise-upload-storage",
        "enterprise-upload-storage-file-input",
        "enterprise-upload-storage-deliver"
      ],
      containerResponsibilities: [
        "render EnterpriseUploadStoragePanel with prepared upload registry state and callbacks",
        "avoid keeping upload registry and object-storage JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-platform-decision-panel",
      path: "./enterprise-platform-decision-panel",
      role: "Enterprise platform decision review form, evidence checklist, and decision-register summary.",
      runtimeExports: {
        EnterprisePlatformDecisionPanel
      },
      testIds: [
        "enterprise-platform-decision-review",
        "enterprise-platform-decision-submit",
        "enterprise-platform-decision-production-evidence"
      ],
      containerResponsibilities: [
        "render EnterprisePlatformDecisionPanel with prepared decision state and callbacks",
        "avoid keeping platform decision review JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-collaboration-sso-panel",
      path: "./enterprise-collaboration-sso-panel",
      role: "Enterprise collaboration pub/sub delivery and SSO preflight panels.",
      runtimeExports: {
        EnterpriseCollaborationSsoPanel
      },
      testIds: [
        "enterprise-collaboration-pubsub-schema",
        "enterprise-collaboration-pubsub-delivery",
        "enterprise-sso-preflight"
      ],
      containerResponsibilities: [
        "render EnterpriseCollaborationSsoPanel with prepared collaboration and SSO state",
        "avoid keeping collaboration pub/sub and SSO preflight JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-account-security-panel",
      path: "./enterprise-account-security-panel",
      role: "Enterprise MFA setup, logout, and active-session controls.",
      runtimeExports: {
        EnterpriseAccountSecurityPanel
      },
      testIds: [
        "enterprise-account-security",
        "enterprise-mfa-status",
        "enterprise-session-list"
      ],
      containerResponsibilities: [
        "render EnterpriseAccountSecurityPanel with prepared MFA and session state",
        "avoid keeping account security and session-control JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-provisioning-readiness-panel",
      path: "./enterprise-provisioning-readiness-panel",
      role: "Enterprise provisioning, SCIM, identity handoff, and cutover readiness panel.",
      runtimeExports: {
        EnterpriseProvisioningReadinessPanel
      },
      testIds: [
        "enterprise-provisioning-readiness",
        "enterprise-identity-request-packet-summary",
        "enterprise-identity-cutover-checklist"
      ],
      containerResponsibilities: [
        "render EnterpriseProvisioningReadinessPanel with prepared deployment and identity readiness state",
        "avoid keeping provisioning, SCIM, and identity handoff JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-team-operations-panel",
      path: "./enterprise-team-operations-panel",
      role: "Enterprise RBAC team invitation, membership, and pending-invite controls.",
      runtimeExports: {
        EnterpriseTeamOperationsPanel
      },
      testIds: [
        "enterprise-team-operations",
        "enterprise-team-invite-submit",
        "enterprise-team-member-row",
        "enterprise-team-pending-invite"
      ],
      containerResponsibilities: [
        "render EnterpriseTeamOperationsPanel with prepared team state and callbacks",
        "avoid keeping RBAC membership and invitation JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-collaboration-project-panel",
      path: "./enterprise-collaboration-project-panel",
      role: "Enterprise collaboration project summary, review, claim-package, and adjudication controls.",
      runtimeExports: {
        EnterpriseCollaborationProjectPanel
      },
      testIds: [
        "enterprise-claim-evidence-package-details",
        "enterprise-reliability-adjudication-coverage",
        "enterprise-validation-parity-evidence-detail",
        "enterprise-expert-review-dossier-export-project"
      ],
      containerResponsibilities: [
        "render EnterpriseCollaborationProjectPanel with prepared collaboration state and callbacks",
        "avoid keeping collaboration project review and claim-package JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-local-validation-panel",
      path: "./enterprise-local-validation-panel",
      role: "Enterprise local group-comparison validation controls, notes, and local-result summary.",
      runtimeExports: {
        EnterpriseLocalValidationPanel
      },
      testIds: [
        "local-validation-controls",
        "run-validation-suite",
        "export-local-validation-result",
        "local-validation-result"
      ],
      containerResponsibilities: [
        "render EnterpriseLocalValidationPanel with validation state and callbacks",
        "avoid keeping local validation control JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-runtime-header-panel",
      path: "./enterprise-runtime-header-panel",
      role: "Enterprise runtime identity summary, claim package badge, expert dossier export, and validation parity evidence header.",
      runtimeExports: {
        EnterpriseRuntimeHeaderPanel
      },
      testIds: [
        "enterprise-claim-evidence-package",
        "enterprise-expert-review-dossier-export",
        "enterprise-validation-parity-evidence",
        "enterprise-validation-parity-export"
      ],
      containerResponsibilities: [
        "render EnterpriseRuntimeHeaderPanel with enterprise context and latest validation evidence",
        "avoid keeping runtime header and parity evidence JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-server-project-controls-panel",
      path: "./enterprise-server-project-controls-panel",
      role: "Enterprise server-project selector plus save, analysis, refresh, and cleaning-manifest export controls.",
      runtimeExports: {
        EnterpriseServerProjectControlsPanel
      },
      testIds: [
        "enterprise-import-cleaning-manifest-export"
      ],
      containerResponsibilities: [
        "render EnterpriseServerProjectControlsPanel with server project state and callbacks",
        "avoid keeping server project control JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-runtime-panel",
      path: "./enterprise-runtime-panel",
      role: "Enterprise runtime panel composition for the extracted enterprise runtime subpanels.",
      runtimeExports: {
        EnterpriseRuntimePanel
      },
      testIds: [
        "enterprise-runtime-panel"
      ],
      containerResponsibilities: [
        "render EnterpriseRuntimePanel with prepared enterprise state and callbacks",
        "avoid keeping enterprise runtime panel composition JSX in the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-section",
      path: "./workspace-enterprise-runtime-section",
      role: "Workspace seam that owns the EnterpriseRuntimePanel render call outside the main workbench JSX tree.",
      runtimeExports: {
        WorkspaceEnterpriseRuntimeSection
      },
      testIds: [
        "enterprise-runtime-panel"
      ],
      containerResponsibilities: [
        "render WorkspaceEnterpriseRuntimeSection with prepared enterprise runtime props",
        "avoid directly rendering EnterpriseRuntimePanel from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-container-props",
      path: "./workspace-enterprise-runtime-container-props",
      role: "Focused container prop builder for enterprise runtime validation, project, governance, ops, upload, collaboration, provisioning, account, team, platform, release, and review composition.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeContainerProps
      },
      containerResponsibilities: [
        "compose enterprise runtime sub-prop groups through buildWorkspaceEnterpriseRuntimeContainerProps",
        "keep enterprise runtime prop-builder chains outside the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-prop-group",
      path: "./workspace-enterprise-runtime-prop-group",
      role: "Typed prop-group boundary for enterprise runtime panel props assembled by the main workspace container.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeProps
      },
      containerResponsibilities: [
        "assemble enterprise runtime props through buildWorkspaceEnterpriseRuntimeProps",
        "keep enterprise runtime prop-group typing out of the main workspace container so subgroups can be extracted incrementally"
      ]
    },
    {
      id: "workspace-enterprise-runtime-validation-prop-group",
      path: "./workspace-enterprise-runtime-validation-prop-group",
      role: "Focused prop-group boundary for enterprise validation and preregistration runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeValidationProps
      },
      containerResponsibilities: [
        "assemble validation and preregistration props through buildWorkspaceEnterpriseRuntimeValidationProps",
        "keep validation-specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-project-prop-group",
      path: "./workspace-enterprise-runtime-project-prop-group",
      role: "Focused prop-group boundary for enterprise project, analysis-run, refresh, and cleaning-manifest runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeProjectProps
      },
      containerResponsibilities: [
        "assemble project and analysis-run props through buildWorkspaceEnterpriseRuntimeProjectProps",
        "keep server-project specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-governance-prop-group",
      path: "./workspace-enterprise-runtime-governance-prop-group",
      role: "Focused prop-group boundary for enterprise governance, notification, audit, backup, and database-sync runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeGovernanceProps
      },
      containerResponsibilities: [
        "assemble governance and notification props through buildWorkspaceEnterpriseRuntimeGovernanceProps",
        "keep governance-specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-ops-prop-group",
      path: "./workspace-enterprise-runtime-ops-prop-group",
      role: "Focused prop-group boundary for enterprise ops, deployment, go-live, release-gate export, and alert runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeOpsProps
      },
      containerResponsibilities: [
        "assemble ops and go-live props through buildWorkspaceEnterpriseRuntimeOpsProps",
        "keep deployment-specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-upload-prop-group",
      path: "./workspace-enterprise-runtime-upload-prop-group",
      role: "Focused prop-group boundary for enterprise upload registry, file intake, verification, and object-storage delivery runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeUploadProps
      },
      containerResponsibilities: [
        "assemble upload registry props through buildWorkspaceEnterpriseRuntimeUploadProps",
        "keep upload-specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-collaboration-prop-group",
      path: "./workspace-enterprise-runtime-collaboration-prop-group",
      role: "Focused prop-group boundary for enterprise collaboration transport and SSO preflight runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeCollaborationProps
      },
      containerResponsibilities: [
        "assemble collaboration and SSO props through buildWorkspaceEnterpriseRuntimeCollaborationProps",
        "keep collaboration-specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-provisioning-prop-group",
      path: "./workspace-enterprise-runtime-provisioning-prop-group",
      role: "Focused prop-group boundary for enterprise provisioning readiness, identity handoff, platform request, and cutover runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeProvisioningProps
      },
      containerResponsibilities: [
        "assemble provisioning readiness props through buildWorkspaceEnterpriseRuntimeProvisioningProps",
        "keep provisioning-specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-account-security-prop-group",
      path: "./workspace-enterprise-runtime-account-security-prop-group",
      role: "Focused prop-group boundary for enterprise MFA, logout, active-session, and session-revocation runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeAccountSecurityProps
      },
      containerResponsibilities: [
        "assemble account security props through buildWorkspaceEnterpriseRuntimeAccountSecurityProps",
        "keep account-security specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-team-operations-prop-group",
      path: "./workspace-enterprise-runtime-team-operations-prop-group",
      role: "Focused prop-group boundary for enterprise team membership, invitation, role, and invitation-code runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeTeamOperationsProps
      },
      containerResponsibilities: [
        "assemble team operations props through buildWorkspaceEnterpriseRuntimeTeamOperationsProps",
        "keep team-operation specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-platform-decision-prop-group",
      path: "./workspace-enterprise-runtime-platform-decision-prop-group",
      role: "Focused prop-group boundary for enterprise platform-decision review, production evidence, owner, environment, and submission runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimePlatformDecisionProps
      },
      containerResponsibilities: [
        "assemble platform decision props through buildWorkspaceEnterpriseRuntimePlatformDecisionProps",
        "keep platform-decision specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-release-gate-prop-group",
      path: "./workspace-enterprise-runtime-release-gate-prop-group",
      role: "Focused prop-group boundary for enterprise release-gate review, identity snapshot, verification evidence, export, and submission runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeReleaseGateProps
      },
      containerResponsibilities: [
        "assemble release-gate props through buildWorkspaceEnterpriseRuntimeReleaseGateProps",
        "keep release-gate specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "workspace-enterprise-runtime-collaboration-project-prop-group",
      path: "./workspace-enterprise-runtime-collaboration-project-prop-group",
      role: "Focused prop-group boundary for enterprise collaboration project, claim package, expert review, reliability review, validation review, comments, and adjudication runtime props.",
      runtimeExports: {
        buildWorkspaceEnterpriseRuntimeCollaborationProjectProps
      },
      containerResponsibilities: [
        "assemble collaboration project props through buildWorkspaceEnterpriseRuntimeCollaborationProjectProps",
        "keep claim-package and expert-review specific enterprise runtime prop keys grouped for later extraction from the main workspace container"
      ]
    },
    {
      id: "enterprise-ops-exports",
      path: "./enterprise-ops-exports",
      role: "Enterprise ops, go-live, identity, release-gate, and alert artifact export controls.",
      runtimeExports: {
        EnterpriseOpsExports
      },
      testIds: [
        "enterprise-ops-exports",
        "enterprise-go-live-attestation-submit",
        "enterprise-ops-alert-delivery"
      ],
      containerResponsibilities: [
        "render EnterpriseOpsExports with prepared action callbacks",
        "avoid keeping enterprise ops artifact-export JSX in the main workspace container"
      ]
    },
    {
      id: "enterprise-release-gate-panel",
      path: "./enterprise-release-gate-panel",
      role: "Enterprise release gate review panel with identity snapshot and verification evidence fields.",
      runtimeExports: {
        EnterpriseReleaseGatePanel
      },
      testIds: [
        "enterprise-release-gate-review",
        "enterprise-release-gate-identity-snapshot",
        "enterprise-release-gate-submit"
      ],
      containerResponsibilities: [
        "render EnterpriseReleaseGatePanel with prepared release-gate state and callbacks",
        "avoid keeping release-gate review JSX in the main workspace container"
      ]
    },
    {
      id: "workspace-primitives",
      path: "./workspace-primitives",
      role: "Reusable workspace panel, metric, slider, number, and mapping controls shared across the SENA workspace.",
      runtimeExports: {
        Panel,
        MetricCell,
        Slider,
        IntegerControl,
        MappingSelect
      },
      containerResponsibilities: [
        "render imported workspace primitives",
        "avoid keeping reusable panel and form-control implementations in the main workspace container"
      ]
    },
    {
      id: "workspace-shell-panels",
      path: "./workspace-shell-panels",
      role: "Workspace navigation rail, top plot view bar with window context, plot switcher, active view caption, viewport shells, workflow rail, and Fusion plot zoom controls.",
      runtimeExports: {
        WorkflowRail,
        WorkspacePlotViewBar,
        WorkspaceRail,
        WorkspaceShellPanel,
        WorkspaceViewportPanel,
        ActivePlotViewToolbar,
        FusionPlotZoomControls
      },
      testIds: [
        "sena-workspace-mode-rail",
        "workspace-plot-view-bar",
        "workspace-plot-view-bar-window-context",
        "workspace-plot-switcher",
        "workspace-plot-switcher-menu",
        "central-active-view-toolbar",
        "workspace-central-plot-deck",
        "fusion-plot-central-zoom-controls"
      ],
      containerResponsibilities: [
        "render imported workspace shell components with prepared active rail, workflow, plot view, and zoom state",
        "keep shell, rail, plot switcher, viewport chrome, and zoom control JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-static-config",
      path: "./workspace-static-config",
      role: "Static workspace display configuration, rail icons, workflow copy, production-page contract preview, and browser export helpers.",
      runtimeExports: {
        SHOW_ARCHIVED_FORMULA_PANEL,
        StatsNetworkMetricsIcon,
        downloadText,
        formatDelta,
        formatNumber,
        layerCopy,
        layoutOptions,
        platformDecisionTimestampedEvidenceIds,
        plotViewOptions,
        productionPageContract,
        senaEnterpriseImportFileAccept,
        temporalModeOptions,
        upperTriangleTotal,
        workflowSteps,
        workspaceRailItems,
        workspaceRailPanelCopy
      },
      containerResponsibilities: [
        "import static workspace options, icons, copy, and export helpers from workspace-static-config",
        "avoid keeping rail definitions, workflow copy, SVG icon components, and browser download utilities in the main workspace container"
      ]
    },
    {
      id: "pilot-assets-panel",
      path: "./pilot-assets-panel",
      role: "Research pilot asset links, handoff checks, sample downloads, and template downloads.",
      runtimeExports: {
        PilotAssetsPanel
      },
      testIds: [
        "pilot-assets-panel",
        "pilot-handoff-checks",
        "pilot-asset-link"
      ],
      containerResponsibilities: [
        "render PilotAssetsPanel with sample-loading state",
        "avoid keeping pilot asset manifest rendering inside the main workspace container"
      ]
    },
    {
      id: "workspace-header-section",
      path: "./workspace-header-section",
      role: "Top workspace header with brand mark, dataset and report-readiness summary, upload control, navigation, and report export action.",
      runtimeExports: {
        WorkspaceHeaderSection
      },
      testIds: [
        "sena-upload-input"
      ],
      containerResponsibilities: [
        "render imported WorkspaceHeaderSection with prepared summary labels and upload/export handlers",
        "keep workspace header navigation, upload control, and report export JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-section",
      path: "./workspace-left-rail-panel-section",
      role: "Left rail composition for data import, model builder, plot tools, stats, and research workflow panels.",
      runtimeExports: {
        WorkspaceLeftRailPanelSection
      },
      testIds: [
        "workspace-left-panel"
      ],
      containerResponsibilities: [
        "render imported WorkspaceLeftRailPanelSection with prepared section props",
        "keep left rail panel conditionals, data import composition, model controls, plot tools, stats, and workflow JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-data-import-panel",
      path: "./workspace-data-import-panel",
      role: "Data import metrics, sample asset handoff, upload controls, and import status shell for the left rail.",
      runtimeExports: {
        WorkspaceDataImportPanel
      },
      testIds: [
        "sena-data-import-upload-input",
        "data-count-people",
        "data-count-codes",
        "data-count-utterances",
        "data-count-segments",
        "data-count-social-ties"
      ],
      containerResponsibilities: [
        "render WorkspaceDataImportPanel with prepared model, timeline, dataset, and import handlers",
        "keep data import metric and upload-control JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-data-import-feedback-section",
      path: "./workspace-data-import-feedback-section",
      role: "Import error, uploaded table mapper, and runtime warning feedback for the data rail.",
      runtimeExports: {
        WorkspaceDataImportFeedbackSection
      },
      containerResponsibilities: [
        "render imported WorkspaceDataImportFeedbackSection with import feedback, uploaded tables, and warning data",
        "keep import feedback JSX and uploaded table mapper iteration out of the main workspace container"
      ]
    },
    {
      id: "model-builder-panel",
      path: "./model-builder-panel",
      role: "Model builder controls for layout choice, S/W/B layer visibility, fusion weights, threshold, and normalization.",
      runtimeExports: {
        ModelBuilderPanel
      },
      testIds: [
        "model-layout-explanatory",
        "model-layout-ena-space",
        "model-layout-joint",
        "model-layer-social-toggle",
        "alpha-slider",
        "normalization-select"
      ],
      containerResponsibilities: [
        "render ModelBuilderPanel with prepared layer state, layout options, and model parameter setters",
        "keep model-control JSX and normalization select wiring out of the main workspace container"
      ]
    },
    {
      id: "plot-tools-panel",
      path: "./plot-tools-panel",
      role: "Plot tools controls for dimensions, active plot view summary, network layers, temporal framing, and advanced weights.",
      runtimeExports: {
        PlotToolsPanel
      },
      testIds: [
        "workspace-plot-tools-panel",
        "plot-tools-dimensions-section",
        "plot-tools-plotted-points-section",
        "plot-tools-network-graph-section",
        "plot-tools-temporal-framing-section",
        "plot-tools-advanced-drawer",
        "plot-alpha-slider"
      ],
      containerResponsibilities: [
        "render PlotToolsPanel with prepared layout, layer, temporal, and advanced-setting state",
        "keep plot tools section and advanced drawer JSX out of the main workspace container"
      ]
    },
    {
      id: "uploaded-table-mapper",
      path: "./uploaded-table-mapper",
      role: "Uploaded table contract selector and column mapping controls for SENA import adapters.",
      runtimeExports: {
        UploadedTableMapper
      },
      containerResponsibilities: [
        "render UploadedTableMapper for each uploaded import table",
        "avoid keeping import field mapping JSX and missing-field checks inside the main workspace container"
      ]
    },
    {
      id: "matrix-preview",
      path: "./matrix-preview",
      role: "Reusable compact S/W/B/G matrix preview table for workspace plot and evidence panels.",
      runtimeExports: {
        MatrixPreview
      },
      containerResponsibilities: [
        "render imported MatrixPreview instances for matrix evidence surfaces",
        "avoid keeping reusable matrix preview table implementation in the main workspace container"
      ]
    },
    {
      id: "report-generator",
      path: "./report-generator",
      role: "Report, readiness, reliability, and publication export panel implementation.",
      runtimeExports: {
        ReportGenerator
      },
      containerResponsibilities: [
        "render ReportGenerator with prepared audits and export callbacks",
        "avoid keeping report gate JSX in the main workspace container"
      ]
    },
    {
      id: "workspace-report-section",
      path: "./workspace-report-section",
      role: "Report workflow section shell that owns the Report Generator panel chrome.",
      runtimeExports: {
        WorkspaceReportSection
      },
      testIds: [
        "workflow-report"
      ],
      containerResponsibilities: [
        "render WorkspaceReportSection with prepared audits, review state, reliability state, and export callbacks",
        "keep ReportGenerator panel shell JSX out of the main workspace container"
      ]
    },
    {
      id: "runtime-provenance-panels",
      path: "./runtime-provenance-panels",
      role: "Joint embedding, metric provenance, jENA/jSNA handoff, and method-protocol evidence panels.",
      runtimeExports: {
        JointEmbeddingProvenanceStrip,
        MetricProvenanceSummary,
        JenaConceptHandoffPanel,
        JsnaSocialHandoffPanel,
        MethodProtocolHandoffPanel
      },
      testIds: [
        "joint-embedding-provenance-strip",
        "stats-metric-provenance-summary",
        "stats-jena-concept-handoff",
        "stats-jsna-social-handoff",
        "method-protocol-runtime-handoffs"
      ],
      containerResponsibilities: [
        "render imported runtime provenance panels with prepared runtime audit and method protocol data",
        "keep jENA, jSNA, joint embedding, and method protocol evidence JSX out of the main workspace container"
      ]
    },
    {
      id: "central-fusion-analysis-scope",
      path: "./central-fusion-analysis-scope",
      role: "Central Fusion analysis scope, evidence capsule, active-window brief, and adjacent-window delta panel.",
      runtimeExports: {
        CentralFusionAnalysisScope
      },
      testIds: [
        "central-fusion-analysis-scope",
        "central-fusion-evidence-capsule",
        "central-active-window-brief",
        "central-fusion-transition-delta",
        "central-fusion-delta-a-fusion"
      ],
      containerResponsibilities: [
        "render CentralFusionAnalysisScope with prepared model, active window, fusion math audit, and transition evidence",
        "keep central Fusion scope and transition evidence JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-deck",
      path: "./workspace-central-plot-deck",
      role: "Central plot deck view switcher for Fusion, Temporal, Dual Lens, ENA, SNA, Evidence, Matrix, and Data View drawer surfaces.",
      runtimeExports: {
        WorkspaceCentralPlotDeck
      },
      testIds: [
        "workspace-central-plot-deck",
        "central-fusion-priority-plot",
        "central-fusion-canvas-frame"
      ],
      containerResponsibilities: [
        "render WorkspaceCentralPlotDeck with prepared model, active plot view, temporal controls, evidence filters, and zoom callbacks",
        "keep central plot view branches and their Canvas, Temporal, SNA, Evidence, Matrix, and Data View JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-deck-render",
      path: "./workspace-central-plot-deck-render",
      role: "Focused render boundary for the central plot deck view switcher and view branches.",
      runtimeExports: {
        renderWorkspaceCentralPlotDeck
      },
      testIds: [
        "workspace-central-plot-deck",
        "central-fusion-priority-plot",
        "central-fusion-canvas-frame"
      ],
      containerResponsibilities: [
        "render the central plot deck view branches through renderWorkspaceCentralPlotDeck",
        "keep Fusion, Temporal, Dual Lens, ENA, SNA, Evidence, Matrix, and Data View JSX outside the public deck entry module"
      ]
    },
    {
      id: "workspace-central-plot-deck-render-props",
      path: "./workspace-central-plot-deck-render-props",
      role: "Focused type boundary for the central plot deck render props contract.",
      runtimeExports: {
        WORKSPACE_CENTRAL_PLOT_DECK_RENDER_PROPS_MODULE
      },
      containerResponsibilities: [
        "share the central plot deck render props contract without coupling body and view panels to the render module",
        "keep the shell render module focused on rendering instead of owning the wide plot deck prop contract"
      ]
    },
    {
      id: "workspace-central-plot-deck-body-props",
      path: "./workspace-central-plot-deck-body-props",
      role: "Focused prop boundary that narrows central plot deck render props before body composition.",
      runtimeExports: {
        WORKSPACE_CENTRAL_PLOT_DECK_BODY_PROPS_MODULE,
        buildCentralPlotDeckBodyProps
      },
      containerResponsibilities: [
        "build narrowed body props from the central plot deck render props before composing CentralPlotDeckBody",
        "keep CentralPlotDeckBody from depending directly on the full render props contract"
      ]
    },
    {
      id: "workspace-central-plot-deck-body",
      path: "./workspace-central-plot-deck-body",
      role: "Focused body composition module for central plot deck active view dispatch, analysis scope, and data drawer.",
      runtimeExports: {
        CentralPlotDeckBody
      },
      testIds: [
        "central-fusion-priority-plot",
        "central-fusion-canvas-frame"
      ],
      containerResponsibilities: [
        "compose central plot deck body content through CentralPlotDeckBody",
        "keep active view dispatch, analysis scope, and data view drawer outside the deck shell render boundary"
      ]
    },
    {
      id: "workspace-central-plot-deck-view-panel-branches",
      path: "./workspace-central-plot-deck-view-panel-branches",
      role: "Focused dispatcher module for central plot deck active view branches.",
      runtimeExports: {
        CentralPlotDeckViewPanelBranches
      },
      containerResponsibilities: [
        "dispatch active central plot deck view panel branches through CentralPlotDeckViewPanelBranches",
        "keep active view branch conditionals outside CentralPlotDeckBody"
      ]
    },
    {
      id: "workspace-central-plot-deck-fusion-panel",
      path: "./workspace-central-plot-deck-fusion-panel",
      role: "Focused render module for the central Fusion plot view panel.",
      runtimeExports: {
        CentralFusionPlotViewPanel
      },
      testIds: [
        "central-fusion-priority-plot",
        "central-fusion-canvas-frame"
      ],
      containerResponsibilities: [
        "render the central Fusion plot branch through CentralFusionPlotViewPanel",
        "keep Fusion-specific canvas, layer key, and joint embedding UI outside the shared central view-panels module"
      ]
    },
    {
      id: "workspace-central-plot-deck-temporal-panel",
      path: "./workspace-central-plot-deck-temporal-panel",
      role: "Focused render module for the central Temporal plot view panel.",
      runtimeExports: {
        CentralTemporalPlotViewPanel
      },
      containerResponsibilities: [
        "render the central Temporal plot branch through CentralTemporalPlotViewPanel",
        "keep Temporal window builder JSX outside the shared central view-panels module"
      ]
    },
    {
      id: "workspace-central-plot-deck-dual-lens-panel",
      path: "./workspace-central-plot-deck-dual-lens-panel",
      role: "Focused render module for the central Dual Lens plot view panel.",
      runtimeExports: {
        CentralDualLensViewPanel
      },
      containerResponsibilities: [
        "render the central Dual Lens branch through CentralDualLensViewPanel",
        "keep DualLensDashboard composition outside the shared central view-panels module"
      ]
    },
    {
      id: "workspace-central-plot-deck-ena-space-panel",
      path: "./workspace-central-plot-deck-ena-space-panel",
      role: "Focused render module for the central ENA Space plot view panel.",
      runtimeExports: {
        CentralEnaSpaceViewPanel
      },
      containerResponsibilities: [
        "render the central ENA Space branch through CentralEnaSpaceViewPanel",
        "keep ENA-space canvas and jENA runtime explanatory copy outside the shared central view-panels module"
      ]
    },
    {
      id: "workspace-central-plot-deck-sna-metrics-panel",
      path: "./workspace-central-plot-deck-sna-metrics-panel",
      role: "Focused render module for the central SNA Metrics plot view panel.",
      runtimeExports: {
        CentralSnaMetricsViewPanel
      },
      containerResponsibilities: [
        "render the central SNA Metrics branch through CentralSnaMetricsViewPanel",
        "keep SNA graph metric cells and social metrics table composition outside the shared central view-panels module"
      ]
    },
    {
      id: "workspace-central-plot-deck-evidence-ledger-panel",
      path: "./workspace-central-plot-deck-evidence-ledger-panel",
      role: "Focused render module for the central Evidence Ledger plot view panel.",
      runtimeExports: {
        CentralEvidenceLedgerViewPanel
      },
      containerResponsibilities: [
        "render the central Evidence Ledger branch through CentralEvidenceLedgerViewPanel",
        "keep EvidenceLedgerPanel composition outside the shared central view-panels module"
      ]
    },
    {
      id: "workspace-central-plot-deck-matrix-panel",
      path: "./workspace-central-plot-deck-matrix-panel",
      role: "Focused render module for the central Matrix plot view panel.",
      runtimeExports: {
        CentralMatrixViewPanel
      },
      containerResponsibilities: [
        "render the central Matrix branch through CentralMatrixViewPanel",
        "keep MatrixPreview composition outside the retired shared central view-panels module"
      ]
    },
    {
      id: "workspace-central-plot-deck-view-panel-props",
      path: "./workspace-central-plot-deck-view-panel-props",
      role: "Focused type boundary for central plot deck view panel prop contracts.",
      runtimeExports: {
        WORKSPACE_CENTRAL_PLOT_DECK_VIEW_PANEL_PROPS_MODULE
      },
      containerResponsibilities: [
        "define narrowed prop contracts for central plot deck view panels",
        "keep view panel render functions from depending directly on the full central plot deck render props contract"
      ]
    },
    {
      id: "workspace-central-plot-deck-shell-controls",
      path: "./workspace-central-plot-deck-shell-controls",
      role: "Focused controls module for central plot deck zoom, maximize, and active view toolbar controls.",
      runtimeExports: {
        CentralPlotDeckShellAction,
        CentralPlotDeckActiveViewToolbar
      },
      testIds: [
        "maximize-fusion-plot"
      ],
      containerResponsibilities: [
        "render central plot deck shell action controls through CentralPlotDeckShellAction",
        "render non-fusion active view toolbar through CentralPlotDeckActiveViewToolbar"
      ]
    },
    {
      id: "workspace-central-plot-deck-container-props",
      path: "./workspace-central-plot-deck-container-props",
      role: "Focused container prop builder for central plot deck model, temporal, evidence, data-view, interaction, and view-state composition.",
      runtimeExports: {
        buildWorkspaceCentralPlotDeckContainerProps
      },
      containerResponsibilities: [
        "compose central plot deck props from model, temporal, evidence, data-view, interaction, and view-state prop groups",
        "keep central plot deck prop-builder chains outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-deck-prop-group",
      path: "./workspace-central-plot-deck-prop-group",
      role: "Focused prop-group boundary for the central plot deck model, layout, temporal, evidence, data view, and interaction props.",
      runtimeExports: {
        buildWorkspaceCentralPlotDeckProps
      },
      containerResponsibilities: [
        "assemble central plot deck props through buildWorkspaceCentralPlotDeckProps",
        "keep central plot deck prop typing and grouping outside the main workspace container before the next extraction step"
      ]
    },
    {
      id: "workspace-central-plot-deck-composition-prop-group",
      path: "./workspace-central-plot-deck-composition-prop-group",
      role: "Focused composition boundary for merging central plot deck prop groups.",
      runtimeExports: {
        buildWorkspaceCentralPlotDeckCompositionProps
      },
      containerResponsibilities: [
        "assemble central plot deck composition props through buildWorkspaceCentralPlotDeckCompositionProps",
        "keep central plot model, interaction, view-state, data-view, temporal-control, and evidence prop groups merged behind an explicit boundary"
      ]
    },
    {
      id: "workspace-central-plot-deck-composition-field-prop-group",
      path: "./workspace-central-plot-deck-composition-field-prop-group",
      role: "Focused prop-group boundary for central plot deck composition field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotDeckCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot deck composition field props through buildWorkspaceCentralPlotDeckCompositionFieldProps",
        "keep central plot model, interaction, view-state, data-view, temporal-control, and evidence field grouping outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-deck-boundary-composition-field-prop-group",
      path: "./workspace-central-plot-deck-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final central plot deck composition field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot deck boundary composition field props through buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps",
        "keep the final central plot deck handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-deck-boundary-composition-prop-group",
      path: "./workspace-central-plot-deck-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final central plot deck handoff props.",
      runtimeExports: {
        buildWorkspaceCentralPlotDeckBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose central plot deck boundary props through buildWorkspaceCentralPlotDeckBoundaryCompositionProps",
        "keep final central plot deck boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-temporal-controls-prop-group",
      path: "./workspace-central-plot-temporal-controls-prop-group",
      role: "Focused prop-group boundary for central plot temporal window controls, playback settings, and runtime trace state.",
      runtimeExports: {
        buildWorkspaceCentralPlotTemporalControlsProps
      },
      containerResponsibilities: [
        "assemble central plot temporal control props through buildWorkspaceCentralPlotTemporalControlsProps",
        "keep temporal window control callbacks and playback settings grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-temporal-controls-field-prop-group",
      path: "./workspace-central-plot-temporal-controls-field-prop-group",
      role: "Focused prop-group boundary for central plot temporal control field values and callbacks.",
      runtimeExports: {
        buildWorkspaceCentralPlotTemporalControlsFieldProps
      },
      containerResponsibilities: [
        "assemble central plot temporal control field props through buildWorkspaceCentralPlotTemporalControlsFieldProps",
        "keep temporal window control values, playback state, and callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-temporal-controls-composition-field-prop-group",
      path: "./workspace-central-plot-temporal-controls-composition-field-prop-group",
      role: "Focused prop-group boundary for central plot temporal control composition field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot temporal control composition field props through buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps",
        "keep temporal control field composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-temporal-controls-composition-prop-group",
      path: "./workspace-central-plot-temporal-controls-composition-prop-group",
      role: "Focused prop-group boundary for central plot temporal control composition props.",
      runtimeExports: {
        buildWorkspaceCentralPlotTemporalControlsCompositionProps
      },
      containerResponsibilities: [
        "compose central plot temporal control props through buildWorkspaceCentralPlotTemporalControlsCompositionProps",
        "keep temporal controls composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-temporal-controls-boundary-composition-field-prop-group",
      path: "./workspace-central-plot-temporal-controls-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final central plot temporal control handoff field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot temporal control boundary composition field props through buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps",
        "keep final temporal control handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-temporal-controls-boundary-composition-prop-group",
      path: "./workspace-central-plot-temporal-controls-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final central plot temporal control handoff props.",
      runtimeExports: {
        buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose central plot temporal control boundary composition props through buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps",
        "keep final temporal control handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-evidence-prop-group",
      path: "./workspace-central-plot-evidence-prop-group",
      role: "Focused prop-group boundary for central plot evidence ledger, active-window evidence summary, and export callbacks.",
      runtimeExports: {
        buildWorkspaceCentralPlotEvidenceProps
      },
      containerResponsibilities: [
        "assemble central plot evidence props through buildWorkspaceCentralPlotEvidenceProps",
        "keep active-window evidence, fusion audit, ledger filter, and export callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-evidence-field-prop-group",
      path: "./workspace-central-plot-evidence-field-prop-group",
      role: "Focused prop-group boundary for central plot evidence field values and callbacks.",
      runtimeExports: {
        buildWorkspaceCentralPlotEvidenceFieldProps
      },
      containerResponsibilities: [
        "assemble central plot evidence field props through buildWorkspaceCentralPlotEvidenceFieldProps",
        "keep active-window evidence values, fusion audit, ledger filter, and export callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-evidence-composition-field-prop-group",
      path: "./workspace-central-plot-evidence-composition-field-prop-group",
      role: "Focused prop-group boundary for central plot evidence composition field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotEvidenceCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot evidence composition field props through buildWorkspaceCentralPlotEvidenceCompositionFieldProps",
        "keep central plot evidence field composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-evidence-composition-prop-group",
      path: "./workspace-central-plot-evidence-composition-prop-group",
      role: "Focused prop-group boundary for central plot evidence composition props.",
      runtimeExports: {
        buildWorkspaceCentralPlotEvidenceCompositionProps
      },
      containerResponsibilities: [
        "compose central plot evidence props through buildWorkspaceCentralPlotEvidenceCompositionProps",
        "keep central plot evidence composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-evidence-boundary-composition-field-prop-group",
      path: "./workspace-central-plot-evidence-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final central plot evidence handoff field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot evidence boundary composition field props through buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps",
        "keep final evidence handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-evidence-boundary-composition-prop-group",
      path: "./workspace-central-plot-evidence-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final central plot evidence handoff props.",
      runtimeExports: {
        buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose central plot evidence boundary composition props through buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps",
        "keep final evidence handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-data-view-prop-group",
      path: "./workspace-central-plot-data-view-prop-group",
      role: "Focused prop-group boundary for central plot Data View drawer state and active temporal window context.",
      runtimeExports: {
        buildWorkspaceCentralPlotDataViewProps
      },
      containerResponsibilities: [
        "assemble central plot data-view props through buildWorkspaceCentralPlotDataViewProps",
        "keep Data View drawer state and active-window context grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-data-view-field-prop-group",
      path: "./workspace-central-plot-data-view-field-prop-group",
      role: "Focused prop-group boundary for central plot Data View field values and drawer toggle callback.",
      runtimeExports: {
        buildWorkspaceCentralPlotDataViewFieldProps
      },
      containerResponsibilities: [
        "assemble central plot data-view field props through buildWorkspaceCentralPlotDataViewFieldProps",
        "keep Data View drawer state, toggle callback, and active-window context grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-data-view-composition-field-prop-group",
      path: "./workspace-central-plot-data-view-composition-field-prop-group",
      role: "Focused prop-group boundary for central plot Data View composition field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotDataViewCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot data-view composition field props through buildWorkspaceCentralPlotDataViewCompositionFieldProps",
        "keep Data View field composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-data-view-composition-prop-group",
      path: "./workspace-central-plot-data-view-composition-prop-group",
      role: "Focused prop-group boundary for central plot Data View composition props.",
      runtimeExports: {
        buildWorkspaceCentralPlotDataViewCompositionProps
      },
      containerResponsibilities: [
        "compose central plot data-view props through buildWorkspaceCentralPlotDataViewCompositionProps",
        "keep Data View composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-data-view-boundary-composition-field-prop-group",
      path: "./workspace-central-plot-data-view-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final central plot Data View handoff field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot data-view boundary composition field props through buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps",
        "keep final Data View drawer handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-data-view-boundary-composition-prop-group",
      path: "./workspace-central-plot-data-view-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final central plot Data View handoff props.",
      runtimeExports: {
        buildWorkspaceCentralPlotDataViewBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose central plot data-view boundary composition props through buildWorkspaceCentralPlotDataViewBoundaryCompositionProps",
        "keep final Data View drawer handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-interaction-prop-group",
      path: "./workspace-central-plot-interaction-prop-group",
      role: "Focused prop-group boundary for central plot selection, zoom, plot switching, and joint embedding interactions.",
      runtimeExports: {
        buildWorkspaceCentralPlotInteractionProps
      },
      containerResponsibilities: [
        "assemble central plot interaction props through buildWorkspaceCentralPlotInteractionProps",
        "keep plot switcher, zoom, selection, and joint embedding callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-interaction-field-prop-group",
      path: "./workspace-central-plot-interaction-field-prop-group",
      role: "Focused prop-group boundary for central plot interaction field values and callbacks.",
      runtimeExports: {
        buildWorkspaceCentralPlotInteractionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot interaction field props through buildWorkspaceCentralPlotInteractionFieldProps",
        "keep selection, label reveal, zoom, maximize, and joint embedding callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-interaction-composition-field-prop-group",
      path: "./workspace-central-plot-interaction-composition-field-prop-group",
      role: "Focused prop-group boundary for central plot interaction composition field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotInteractionCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot interaction composition field props through buildWorkspaceCentralPlotInteractionCompositionFieldProps",
        "keep central plot interaction field composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-interaction-composition-prop-group",
      path: "./workspace-central-plot-interaction-composition-prop-group",
      role: "Focused prop-group boundary for central plot interaction composition props.",
      runtimeExports: {
        buildWorkspaceCentralPlotInteractionCompositionProps
      },
      containerResponsibilities: [
        "compose central plot interaction props through buildWorkspaceCentralPlotInteractionCompositionProps",
        "keep central plot interaction composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-interaction-boundary-composition-field-prop-group",
      path: "./workspace-central-plot-interaction-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final central plot interaction handoff field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot interaction boundary composition field props through buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps",
        "keep final interaction handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-interaction-boundary-composition-prop-group",
      path: "./workspace-central-plot-interaction-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final central plot interaction handoff props.",
      runtimeExports: {
        buildWorkspaceCentralPlotInteractionBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose central plot interaction boundary composition props through buildWorkspaceCentralPlotInteractionBoundaryCompositionProps",
        "keep final interaction handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-model-prop-group",
      path: "./workspace-central-plot-model-prop-group",
      role: "Focused prop-group boundary for central plot model, layout, runtime manifests, layer toggles, and fusion weights.",
      runtimeExports: {
        buildWorkspaceCentralPlotModelProps
      },
      containerResponsibilities: [
        "assemble central plot model props through buildWorkspaceCentralPlotModelProps",
        "keep model, layout, manifest, layer, threshold, and fusion weight inputs grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-model-field-prop-group",
      path: "./workspace-central-plot-model-field-prop-group",
      role: "Focused prop-group boundary for central plot model field inputs.",
      runtimeExports: {
        buildWorkspaceCentralPlotModelFieldProps
      },
      containerResponsibilities: [
        "assemble central plot model field props through buildWorkspaceCentralPlotModelFieldProps",
        "keep model, layout, manifest, layer, threshold, and fusion weight values grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-model-composition-field-prop-group",
      path: "./workspace-central-plot-model-composition-field-prop-group",
      role: "Focused prop-group boundary for central plot model composition field inputs.",
      runtimeExports: {
        buildWorkspaceCentralPlotModelCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot model composition field props through buildWorkspaceCentralPlotModelCompositionFieldProps",
        "keep central plot model field composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-model-composition-prop-group",
      path: "./workspace-central-plot-model-composition-prop-group",
      role: "Focused prop-group boundary for central plot model composition props.",
      runtimeExports: {
        buildWorkspaceCentralPlotModelCompositionProps
      },
      containerResponsibilities: [
        "compose central plot model props through buildWorkspaceCentralPlotModelCompositionProps",
        "keep central plot model composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-model-boundary-composition-field-prop-group",
      path: "./workspace-central-plot-model-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final central plot model handoff field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot model boundary composition field props through buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps",
        "keep final model handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-model-boundary-composition-prop-group",
      path: "./workspace-central-plot-model-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final central plot model handoff props.",
      runtimeExports: {
        buildWorkspaceCentralPlotModelBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose central plot model boundary composition props through buildWorkspaceCentralPlotModelBoundaryCompositionProps",
        "keep final model handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-view-state-prop-group",
      path: "./workspace-central-plot-view-state-prop-group",
      role: "Focused prop-group boundary for central plot active view state, switcher state, and plot-view option callbacks.",
      runtimeExports: {
        buildWorkspaceCentralPlotViewStateProps
      },
      containerResponsibilities: [
        "assemble central plot view-state props through buildWorkspaceCentralPlotViewStateProps",
        "keep active plot view, plot switcher state, and view option callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-view-state-field-prop-group",
      path: "./workspace-central-plot-view-state-field-prop-group",
      role: "Focused prop-group boundary for central plot view-state field inputs.",
      runtimeExports: {
        buildWorkspaceCentralPlotViewStateFieldProps
      },
      containerResponsibilities: [
        "assemble central plot view-state field props through buildWorkspaceCentralPlotViewStateFieldProps",
        "keep active plot view, switcher state, view option callbacks, and plot options grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-view-state-composition-field-prop-group",
      path: "./workspace-central-plot-view-state-composition-field-prop-group",
      role: "Focused prop-group boundary for central plot view-state composition field inputs.",
      runtimeExports: {
        buildWorkspaceCentralPlotViewStateCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot view-state composition field props through buildWorkspaceCentralPlotViewStateCompositionFieldProps",
        "keep central plot view-state field composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-view-state-composition-prop-group",
      path: "./workspace-central-plot-view-state-composition-prop-group",
      role: "Focused prop-group boundary for central plot view-state composition props.",
      runtimeExports: {
        buildWorkspaceCentralPlotViewStateCompositionProps
      },
      containerResponsibilities: [
        "compose central plot view-state props through buildWorkspaceCentralPlotViewStateCompositionProps",
        "keep central plot view-state composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-view-state-boundary-composition-field-prop-group",
      path: "./workspace-central-plot-view-state-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final central plot view-state handoff field values.",
      runtimeExports: {
        buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble central plot view-state boundary composition field props through buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps",
        "keep final view-state handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-central-plot-view-state-boundary-composition-prop-group",
      path: "./workspace-central-plot-view-state-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final central plot view-state handoff props.",
      runtimeExports: {
        buildWorkspaceCentralPlotViewStateBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose central plot view-state boundary composition props through buildWorkspaceCentralPlotViewStateBoundaryCompositionProps",
        "keep final view-state handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-secondary-comparison-lens",
      path: "./workspace-secondary-comparison-lens",
      role: "Secondary plot current-window versus full-corpus comparison lens with ranking context.",
      runtimeExports: {
        WorkspaceSecondaryComparisonLens
      },
      testIds: [
        "workspace-secondary-comparison-lens",
        "workspace-secondary-ranking-context"
      ],
      containerResponsibilities: [
        "render WorkspaceSecondaryComparisonLens with prepared current and baseline SENA models",
        "keep secondary comparison and ranking-context JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-column",
      path: "./workspace-right-inspector-column",
      role: "Right-side plot, comparison, inspector, feasibility, and archived formula column for the SENA workspace.",
      runtimeExports: {
        WorkspaceRightInspectorColumn
      },
      testIds: [
        "workspace-right-inspector-column",
        "workspace-primary-plot",
        "workspace-secondary-plot"
      ],
      containerResponsibilities: [
        "render WorkspaceRightInspectorColumn with prepared model, layout, selected evidence, and export callbacks",
        "keep right-column primary plot, comparison, inspector, feasibility, and archived formula JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-container-props",
      path: "./workspace-right-inspector-container-props",
      role: "Focused container prop builder for right inspector layout, evidence, model, and selection composition.",
      runtimeExports: {
        buildWorkspaceRightInspectorContainerProps
      },
      containerResponsibilities: [
        "compose right inspector props from layout, evidence, model, and selection prop groups",
        "keep right inspector prop-builder chains outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-prop-group",
      path: "./workspace-right-inspector-prop-group",
      role: "Focused prop-group boundary for right inspector model, layout, selected evidence, handoff rows, and export callbacks.",
      runtimeExports: {
        buildWorkspaceRightInspectorProps
      },
      containerResponsibilities: [
        "assemble right inspector props through buildWorkspaceRightInspectorProps",
        "keep right inspector prop typing and grouping outside the main workspace container before the next extraction step"
      ]
    },
    {
      id: "workspace-right-inspector-composition-prop-group",
      path: "./workspace-right-inspector-composition-prop-group",
      role: "Focused composition boundary for merging right inspector prop groups.",
      runtimeExports: {
        buildWorkspaceRightInspectorCompositionProps
      },
      containerResponsibilities: [
        "assemble right inspector composition props through buildWorkspaceRightInspectorCompositionProps",
        "keep right inspector model, layout, selection, and evidence prop groups merged behind an explicit boundary"
      ]
    },
    {
      id: "workspace-right-inspector-composition-field-prop-group",
      path: "./workspace-right-inspector-composition-field-prop-group",
      role: "Focused prop-group boundary for right inspector composition field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector composition field props through buildWorkspaceRightInspectorCompositionFieldProps",
        "keep the final right inspector composition handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-boundary-composition-field-prop-group",
      path: "./workspace-right-inspector-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final right inspector handoff field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector boundary composition field props through buildWorkspaceRightInspectorBoundaryCompositionFieldProps",
        "keep the final right inspector handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-boundary-composition-prop-group",
      path: "./workspace-right-inspector-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final right inspector handoff props.",
      runtimeExports: {
        buildWorkspaceRightInspectorBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose right inspector boundary props through buildWorkspaceRightInspectorBoundaryCompositionProps",
        "keep final right inspector boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-layout-prop-group",
      path: "./workspace-right-inspector-layout-prop-group",
      role: "Focused prop-group boundary for right inspector layout and joint embedding controls.",
      runtimeExports: {
        buildWorkspaceRightInspectorLayoutProps
      },
      containerResponsibilities: [
        "assemble right inspector layout props through buildWorkspaceRightInspectorLayoutProps",
        "keep layout, layout option, selected-layout note, and joint embedding callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-layout-field-prop-group",
      path: "./workspace-right-inspector-layout-field-prop-group",
      role: "Focused prop-group boundary for right inspector layout field values and callbacks.",
      runtimeExports: {
        buildWorkspaceRightInspectorLayoutFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector layout field props through buildWorkspaceRightInspectorLayoutFieldProps",
        "keep selected layout, layout options, and joint embedding callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-layout-composition-field-prop-group",
      path: "./workspace-right-inspector-layout-composition-field-prop-group",
      role: "Focused prop-group boundary for right inspector layout composition field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorLayoutCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector layout composition field props through buildWorkspaceRightInspectorLayoutCompositionFieldProps",
        "keep the final right inspector layout handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-layout-composition-prop-group",
      path: "./workspace-right-inspector-layout-composition-prop-group",
      role: "Focused prop-group boundary for right inspector layout composition props.",
      runtimeExports: {
        buildWorkspaceRightInspectorLayoutCompositionProps
      },
      containerResponsibilities: [
        "compose right inspector layout props through buildWorkspaceRightInspectorLayoutCompositionProps",
        "keep right inspector layout composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-layout-boundary-composition-field-prop-group",
      path: "./workspace-right-inspector-layout-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for right inspector layout boundary composition field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector layout boundary composition field props through buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps",
        "keep the final right inspector layout boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-layout-boundary-composition-prop-group",
      path: "./workspace-right-inspector-layout-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final right inspector layout handoff props.",
      runtimeExports: {
        buildWorkspaceRightInspectorLayoutBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose right inspector layout boundary composition props through buildWorkspaceRightInspectorLayoutBoundaryCompositionProps",
        "keep final inspector layout handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-evidence-prop-group",
      path: "./workspace-right-inspector-evidence-prop-group",
      role: "Focused prop-group boundary for right inspector evidence, handoff rows, and export callbacks.",
      runtimeExports: {
        buildWorkspaceRightInspectorEvidenceProps
      },
      containerResponsibilities: [
        "assemble right inspector evidence and export props through buildWorkspaceRightInspectorEvidenceProps",
        "keep fusion math audit, jENA/jSNA handoff rows, archived formula visibility, and export callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-evidence-field-prop-group",
      path: "./workspace-right-inspector-evidence-field-prop-group",
      role: "Focused prop-group boundary for right inspector evidence field values and export callbacks.",
      runtimeExports: {
        buildWorkspaceRightInspectorEvidenceFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector evidence field props through buildWorkspaceRightInspectorEvidenceFieldProps",
        "keep audit evidence, handoff rows, archived formula visibility, and export callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-evidence-composition-field-prop-group",
      path: "./workspace-right-inspector-evidence-composition-field-prop-group",
      role: "Focused prop-group boundary for right inspector evidence composition field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorEvidenceCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector evidence composition field props through buildWorkspaceRightInspectorEvidenceCompositionFieldProps",
        "keep the final right inspector evidence handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-evidence-composition-prop-group",
      path: "./workspace-right-inspector-evidence-composition-prop-group",
      role: "Focused prop-group boundary for right inspector evidence composition props.",
      runtimeExports: {
        buildWorkspaceRightInspectorEvidenceCompositionProps
      },
      containerResponsibilities: [
        "compose right inspector evidence props through buildWorkspaceRightInspectorEvidenceCompositionProps",
        "keep right inspector evidence composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-evidence-boundary-composition-field-prop-group",
      path: "./workspace-right-inspector-evidence-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for right inspector evidence boundary composition field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector evidence boundary composition field props through buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps",
        "keep the final right inspector evidence boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-evidence-boundary-composition-prop-group",
      path: "./workspace-right-inspector-evidence-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final right inspector evidence handoff props.",
      runtimeExports: {
        buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose right inspector evidence boundary composition props through buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps",
        "keep final inspector evidence handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-model-prop-group",
      path: "./workspace-right-inspector-model-prop-group",
      role: "Focused prop-group boundary for right inspector model, timeline, layer, and weighting context.",
      runtimeExports: {
        buildWorkspaceRightInspectorModelProps
      },
      containerResponsibilities: [
        "assemble right inspector model and weighting props through buildWorkspaceRightInspectorModelProps",
        "keep model, timeline, layer visibility, threshold, fusion weights, and active temporal window grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-model-field-prop-group",
      path: "./workspace-right-inspector-model-field-prop-group",
      role: "Focused prop-group boundary for right inspector model field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorModelFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector model field props through buildWorkspaceRightInspectorModelFieldProps",
        "keep model, timeline, layer visibility, threshold, fusion weights, and active temporal window field values grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-model-boundary-composition-field-prop-group",
      path: "./workspace-right-inspector-model-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for right inspector model boundary composition field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector model boundary composition field props through buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps",
        "keep the final right inspector model boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-model-boundary-composition-prop-group",
      path: "./workspace-right-inspector-model-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final right inspector model handoff props.",
      runtimeExports: {
        buildWorkspaceRightInspectorModelBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose right inspector model boundary composition props through buildWorkspaceRightInspectorModelBoundaryCompositionProps",
        "keep final inspector model handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-selection-prop-group",
      path: "./workspace-right-inspector-selection-prop-group",
      role: "Focused prop-group boundary for right inspector selection and canvas interaction state.",
      runtimeExports: {
        buildWorkspaceRightInspectorSelectionProps
      },
      containerResponsibilities: [
        "assemble right inspector selection props through buildWorkspaceRightInspectorSelectionProps",
        "keep selected entity, revealed node labels, selected id, and canvas selection callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-selection-field-prop-group",
      path: "./workspace-right-inspector-selection-field-prop-group",
      role: "Focused prop-group boundary for right inspector selection field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorSelectionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector selection field props through buildWorkspaceRightInspectorSelectionFieldProps",
        "keep selected entity, revealed node labels, selected id, and canvas selection callback field values grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-selection-boundary-composition-field-prop-group",
      path: "./workspace-right-inspector-selection-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for right inspector selection boundary composition field values.",
      runtimeExports: {
        buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble right inspector selection boundary composition field props through buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps",
        "keep the final right inspector selection boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-right-inspector-selection-boundary-composition-prop-group",
      path: "./workspace-right-inspector-selection-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final right inspector selection handoff props.",
      runtimeExports: {
        buildWorkspaceRightInspectorSelectionBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose right inspector selection boundary composition props through buildWorkspaceRightInspectorSelectionBoundaryCompositionProps",
        "keep final inspector selection handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "evidence-ledger-panel",
      path: "./evidence-ledger-panel",
      role: "Evidence ledger source filter, snippet review queue, and five-table lineage badges.",
      runtimeExports: {
        EvidenceLedgerPanel,
        EvidenceLineageBadges
      },
      testIds: [
        "evidence-ledger-source-filter",
        "evidence-lineage"
      ],
      containerResponsibilities: [
        "render EvidenceLedgerPanel with prepared evidence ledger state and export callback",
        "reuse EvidenceLineageBadges from the evidence module instead of defining lineage badges inline"
      ]
    },
    {
      id: "dual-lens-dashboard",
      path: "./dual-lens-dashboard",
      role: "Window-scoped Dual Lens dashboard for conversation stream, jSNA, jENA, and G contribution views.",
      runtimeExports: {
        DualLensDashboard
      },
      testIds: [
        "dual-lens-dashboard",
        "central-dual-lens-dashboard",
        "dual-lens-runtime",
        "central-dual-lens-runtime"
      ],
      containerResponsibilities: [
        "render DualLensDashboard with prepared SENA model, jENA manifest, jSNA manifest, and active window state",
        "keep dual-lens runtime handoff and split-view JSX out of the main workspace container"
      ]
    },
    {
      id: "fusion-canvas",
      path: "./fusion-canvas",
      role: "Fusion Canvas SVG rendering, node glyphs, edge paths, visual stroke encoding, and zoomable viewbox.",
      runtimeExports: {
        Canvas
      },
      testIds: [
        "sena-fusion-canvas",
        "sena-fusion-center-guide",
        "fusion-selected-node-label"
      ],
      containerResponsibilities: [
        "render Canvas with prepared model, layout, layer visibility, threshold, selection, and zoom state",
        "keep SVG geometry, edge path routing, node glyph sizing, and Fusion Canvas test hooks out of the main workspace container"
      ]
    },
    {
      id: "fusion-plot-overlay",
      path: "./fusion-plot-overlay",
      role: "Maximized Fusion Plot dialog shell, compact S/W/B/G key, and zoomable Canvas composition.",
      runtimeExports: {
        FusionPlotCompactKey,
        FusionPlotMaximizedOverlay
      },
      testIds: [
        "fusion-plot-maximized-overlay",
        "fusion-maximized-compact-key",
        "restore-fusion-plot"
      ],
      containerResponsibilities: [
        "render FusionPlotMaximizedOverlay with prepared selection, layer, temporal, and zoom state",
        "keep maximized plot dialog chrome and compact S/W/B/G key JSX out of the main workspace container"
      ]
    },
    {
      id: "fusion-layer-key",
      path: "./fusion-layer-key",
      role: "Fusion layer legend, A1 visual grammar key, and compact ranked metric lists.",
      runtimeExports: {
        FusionLayerKey,
        RankedList
      },
      testIds: [
        "fusion-layer-key",
        "fusion-layer-key-threshold",
        "fusion-layer-key-line-weight-note"
      ],
      containerResponsibilities: [
        "render FusionLayerKey for central and secondary Fusion canvases with prepared model/layer state",
        "reuse RankedList in inspector summaries without defining ranked-list JSX inline"
      ]
    },
    {
      id: "inspector-panel",
      path: "./inspector-panel",
      role: "Selected node/edge inspector with matrix provenance, G attribution, and jENA/jSNA handoff evidence.",
      runtimeExports: {
        Inspector
      },
      testIds: [
        "sena-inspector",
        "edge-visual-stroke-provenance",
        "edge-matrix-provenance",
        "concept-edge-g-attribution",
        "concept-edge-jena-handoff",
        "social-edge-jsna-handoff"
      ],
      containerResponsibilities: [
        "render Inspector with selected node/edge, fingerprints, runtime handoff rows, and edge stroke scale",
        "keep selected-item provenance, G attribution, and jENA/jSNA handoff JSX out of the main workspace container"
      ]
    },
    {
      id: "workspace-stats-panel",
      path: "./workspace-stats-panel",
      role: "Stats rail panel composition for SNA graph metrics, jENA/jSNA runtime snapshot, top actors, top G pairs, and stats exports.",
      runtimeExports: {
        WorkspaceStatsPanel
      },
      testIds: [
        "stats-runtime-snapshot",
        "stats-top-g-pair",
        "export-stats-sna-report"
      ],
      containerResponsibilities: [
        "render WorkspaceStatsPanel with prepared SENA model, runtime audits, manifests, and export callbacks",
        "keep stats runtime snapshot, ranking buttons, and stats export JSX out of the main workspace container"
      ]
    },
    {
      id: "timeline-trace",
      path: "./timeline-trace",
      role: "Temporal S/W/B/G trace line chart for the temporal window builder.",
      runtimeExports: {
        TimelineTrace
      },
      containerResponsibilities: [
        "render imported TimelineTrace with prepared temporal runtime trace data",
        "avoid keeping temporal SVG line-chart implementation in the main workspace container"
      ]
    },
    {
      id: "temporal-window-builder",
      path: "./temporal-window-builder",
      role: "Temporal mode controls, playback controls, arc view, line trace, and active-window evidence panel.",
      runtimeExports: {
        TemporalWindowBuilder
      },
      testIds: [
        "temporal-window-slider",
        "temporal-transition-evidence"
      ],
      containerResponsibilities: [
        "render TemporalWindowBuilder with prepared temporal state and callbacks",
        "avoid keeping temporal control and active-window evidence JSX in the main workspace container"
      ]
    },
    {
      id: "workspace-data-view-drawer",
      path: "./workspace-data-view-drawer",
      role: "Bottom data-view drawer for utterance, coded-segment, interaction, and matrix-count previews.",
      runtimeExports: {
        WorkspaceDataViewDrawer
      },
      testIds: [
        "workspace-data-view-drawer",
        "workspace-data-view-toggle",
        "workspace-data-view-utterances",
        "workspace-data-view-segments",
        "workspace-data-view-interactions"
      ],
      containerResponsibilities: [
        "render WorkspaceDataViewDrawer with prepared model, active temporal window, and drawer state",
        "keep raw table preview rendering out of the main workspace container"
      ]
    },
    {
      id: "temporal-runtime-trace-panel",
      path: "./temporal-runtime-trace-panel",
      role: "Temporal runtime trace summary, transition evidence, per-window status table, and export control.",
      runtimeExports: {
        TemporalRuntimeTracePanel
      },
      testIds: [
        "temporal-transition-summary",
        "temporal-window-fingerprint"
      ],
      containerResponsibilities: [
        "render TemporalRuntimeTracePanel with prepared trace data and export callback",
        "avoid keeping temporal runtime trace summary and table JSX in the main workspace container"
      ]
    },
    {
      id: "data-contract-audit-panel",
      path: "./data-contract-audit-panel",
      role: "Data contract audit status, review-item list, and audit export control.",
      runtimeExports: {
        DataContractAuditPanel
      },
      containerResponsibilities: [
        "render DataContractAuditPanel with prepared contract audit and export callback",
        "avoid keeping contract audit evidence JSX in the main workspace container"
      ]
    },
    {
      id: "sena-stats-tables",
      path: "./sena-stats-tables",
      role: "Reusable SNA actor metrics, community, and G pair contribution tables.",
      runtimeExports: {
        SocialMetricsTable,
        CommunityList,
        PairContributionTable
      },
      containerResponsibilities: [
        "render imported SENA statistics tables with prepared model slices",
        "avoid keeping reusable actor, community, and G contribution table JSX in the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-section",
      path: "./workspace-report-and-stats-deck-section",
      role: "Default-closed Research Details overlay for data, analysis, evidence, validation, export, and administration panels.",
      runtimeExports: {
        WorkspaceReportAndStatsDeckSection
      },
      containerResponsibilities: [
        "render WorkspaceReportAndStatsDeckSection with prepared model, evidence, validation, temporal trace, report, and enterprise runtime props",
        "keep advanced report, stats, evidence, matrix, temporal, administration, and handoff JSX out of the default workspace flow"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-container-props",
      path: "./workspace-report-and-stats-deck-container-props",
      role: "Focused container prop builder for lower report and statistics deck composition.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckContainerProps
      },
      containerResponsibilities: [
        "compose WorkspaceReportAndStatsDeckSection props from report generator, metric, evidence, and report sub-prop groups",
        "keep lower report and statistics deck prop-builder chains outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-prop-group",
      path: "./workspace-report-and-stats-deck-prop-group",
      role: "Focused prop-group boundary for lower report, statistics, evidence, validation, temporal trace, and report generator props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckProps
      },
      containerResponsibilities: [
        "assemble report and stats deck props through buildWorkspaceReportAndStatsDeckProps",
        "keep lower deck prop typing and grouping outside the main workspace container before the next extraction step"
      ]
    },
    {
      id: "workspace-header-left-rail-container-props",
      path: "./workspace-header-left-rail-container-props",
      role: "Focused container prop builder for workspace header, left rail, data import, model controls, plot tools, stats, and workflow composition.",
      runtimeExports: {
        buildWorkspaceHeaderLeftRailContainerProps
      },
      containerResponsibilities: [
        "compose workspace header and left rail props through buildWorkspaceHeaderLeftRailContainerProps",
        "keep data import, model builder, plot tools, stats, workflow, header, and left rail prop-builder chains outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-overlay-rail-main-shell-container-props",
      path: "./workspace-fusion-overlay-rail-main-shell-container-props",
      role: "Focused container prop builder for maximized fusion overlay, workspace rail, and final main shell composition.",
      runtimeExports: {
        buildWorkspaceFusionOverlayRailMainShellContainerProps
      },
      containerResponsibilities: [
        "compose maximized fusion overlay, rail, and final main shell props through buildWorkspaceFusionOverlayRailMainShellContainerProps",
        "keep overlay, rail, and main shell prop-builder chains outside the main workspace container"
      ]
    },
    {
      id: "workspace-main-shell-section",
      path: "./workspace-main-shell-section",
      role: "Top-level responsive essential workspace shell for header, overlay task rail, Fusion, Dual Lens or selection context, and Research Details.",
      runtimeExports: {
        WorkspaceMainShellSection
      },
      containerResponsibilities: [
        "render WorkspaceMainShellSection with prepared shell and panel props plus local responsive figure state",
        "keep top-level responsive grid, task overlay, figure disclosure, and direct workspace panel composition out of the main workspace container"
      ]
    },
    {
      id: "workspace-main-shell-render",
      path: "./workspace-main-shell-render",
      role: "Focused render boundary for the prepared main shell props.",
      runtimeExports: {
        renderWorkspaceMainShell
      },
      containerResponsibilities: [
        "render the prepared WorkspaceMainShellSection props through renderWorkspaceMainShell",
        "keep the final main-shell render target outside the main workspace container"
      ]
    },
    {
      id: "workspace-main-shell-prop-group",
      path: "./workspace-main-shell-prop-group",
      role: "Focused prop-group boundary for the top-level workspace shell, overlay, header, rail, central plot, right inspector, and lower deck props.",
      runtimeExports: {
        buildWorkspaceMainShellSectionProps
      },
      containerResponsibilities: [
        "assemble main shell props through buildWorkspaceMainShellSectionProps",
        "keep final workspace shell prop typing and grouping outside the main workspace container before the next extraction step"
      ]
    },
    {
      id: "workspace-main-shell-boundary-composition-field-prop-group",
      path: "./workspace-main-shell-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final workspace main shell handoff field values.",
      runtimeExports: {
        buildWorkspaceMainShellBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble main shell boundary composition field props through buildWorkspaceMainShellBoundaryCompositionFieldProps",
        "keep final workspace shell handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-main-shell-boundary-composition-prop-group",
      path: "./workspace-main-shell-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final top-level workspace shell handoff props.",
      runtimeExports: {
        buildWorkspaceMainShellBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose main shell boundary props through buildWorkspaceMainShellBoundaryCompositionProps",
        "keep final top-level workspace shell boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-maximized-overlay-prop-group",
      path: "./workspace-fusion-plot-maximized-overlay-prop-group",
      role: "Focused prop-group boundary for the maximized fusion plot overlay model, layout, zoom, selection, and close callbacks.",
      runtimeExports: {
        buildWorkspaceFusionPlotMaximizedOverlayProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot overlay props through buildWorkspaceFusionPlotMaximizedOverlayProps",
        "keep overlay-specific prop typing and grouping outside the main workspace shell prop group"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-composition-prop-group",
      path: "./workspace-fusion-plot-overlay-composition-prop-group",
      role: "Focused composition boundary for merging maximized fusion plot overlay prop groups.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayCompositionProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot overlay composition props through buildWorkspaceFusionPlotOverlayCompositionProps",
        "keep overlay model, selection, and zoom prop groups merged behind an explicit boundary"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-composition-field-prop-group",
      path: "./workspace-fusion-plot-overlay-composition-field-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot overlay composition field values.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble fusion plot overlay composition field props through buildWorkspaceFusionPlotOverlayCompositionFieldProps",
        "keep overlay model, selection, and zoom field grouping outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-boundary-composition-field-prop-group",
      path: "./workspace-fusion-plot-overlay-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final maximized fusion plot overlay handoff field values.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot overlay boundary composition field props through buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps",
        "keep the final maximized fusion plot overlay handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-boundary-composition-prop-group",
      path: "./workspace-fusion-plot-overlay-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final maximized fusion plot overlay handoff props.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose maximized fusion plot overlay boundary props through buildWorkspaceFusionPlotOverlayBoundaryCompositionProps",
        "keep final maximized fusion plot overlay boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-selection-prop-group",
      path: "./workspace-fusion-plot-overlay-selection-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot selection and close interactions.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlaySelectionProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot selection props through buildWorkspaceFusionPlotOverlaySelectionProps",
        "keep selected id, revealed labels, canvas select callback, and overlay close callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-selection-field-prop-group",
      path: "./workspace-fusion-plot-overlay-selection-field-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot overlay selection field values and callbacks.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlaySelectionFieldProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot selection field props through buildWorkspaceFusionPlotOverlaySelectionFieldProps",
        "keep selected id, revealed labels, select callback, and close callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group",
      path: "./workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot overlay selection boundary composition field values.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot selection boundary composition field props through buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps",
        "keep the final maximized fusion plot selection boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-selection-boundary-composition-prop-group",
      path: "./workspace-fusion-plot-overlay-selection-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final maximized fusion plot overlay selection handoff props.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose maximized fusion plot overlay selection boundary props through buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps",
        "keep final maximized fusion plot selection handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-model-prop-group",
      path: "./workspace-fusion-plot-overlay-model-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot model, layout, layer, window, and weighting context.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayModelProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot model props through buildWorkspaceFusionPlotOverlayModelProps",
        "keep model, layout, jENA manifest, layer visibility, threshold, active window labels, and fusion weights grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-model-field-prop-group",
      path: "./workspace-fusion-plot-overlay-model-field-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot overlay model field values and callbacks.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayModelFieldProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot model field props through buildWorkspaceFusionPlotOverlayModelFieldProps",
        "keep overlay model, layout, joint embedding, layer, window, and weighting inputs grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group",
      path: "./workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot overlay model boundary composition field values.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot model boundary composition field props through buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps",
        "keep the final maximized fusion plot model boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-model-boundary-composition-prop-group",
      path: "./workspace-fusion-plot-overlay-model-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final maximized fusion plot overlay model handoff props.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose maximized fusion plot overlay model boundary props through buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps",
        "keep final maximized fusion plot model handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-zoom-prop-group",
      path: "./workspace-fusion-plot-overlay-zoom-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot zoom value and controls.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayZoomProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot zoom props through buildWorkspaceFusionPlotOverlayZoomProps",
        "keep fusion plot zoom value and zoom callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-zoom-field-prop-group",
      path: "./workspace-fusion-plot-overlay-zoom-field-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot overlay zoom field values and callbacks.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayZoomFieldProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot zoom field props through buildWorkspaceFusionPlotOverlayZoomFieldProps",
        "keep overlay zoom value and zoom callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group",
      path: "./workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for maximized fusion plot overlay zoom boundary composition field values.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble maximized fusion plot zoom boundary composition field props through buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps",
        "keep the final maximized fusion plot zoom boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group",
      path: "./workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final maximized fusion plot overlay zoom handoff props.",
      runtimeExports: {
        buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose maximized fusion plot overlay zoom boundary props through buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps",
        "keep final maximized fusion plot zoom handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-rail-prop-group",
      path: "./workspace-rail-prop-group",
      role: "Focused prop-group boundary for workspace rail active mode, item collection, and selection callback.",
      runtimeExports: {
        buildWorkspaceRailProps
      },
      containerResponsibilities: [
        "assemble workspace rail props through buildWorkspaceRailProps",
        "keep rail-specific prop typing and grouping outside the main workspace shell prop group"
      ]
    },
    {
      id: "workspace-rail-field-prop-group",
      path: "./workspace-rail-field-prop-group",
      role: "Focused prop-group boundary for workspace rail field values and callbacks.",
      runtimeExports: {
        buildWorkspaceRailFieldProps
      },
      containerResponsibilities: [
        "assemble workspace rail field props through buildWorkspaceRailFieldProps",
        "keep active rail mode, rail items, and selection callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-rail-composition-field-prop-group",
      path: "./workspace-rail-composition-field-prop-group",
      role: "Focused prop-group boundary for workspace rail composition field values.",
      runtimeExports: {
        buildWorkspaceRailCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble workspace rail composition field props through buildWorkspaceRailCompositionFieldProps",
        "keep final workspace rail handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-rail-composition-prop-group",
      path: "./workspace-rail-composition-prop-group",
      role: "Focused prop-group boundary for workspace rail composition props.",
      runtimeExports: {
        buildWorkspaceRailCompositionProps
      },
      containerResponsibilities: [
        "compose workspace rail props through buildWorkspaceRailCompositionProps",
        "keep workspace rail composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-rail-boundary-composition-field-prop-group",
      path: "./workspace-rail-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for workspace rail boundary composition field values.",
      runtimeExports: {
        buildWorkspaceRailBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble workspace rail boundary composition field props through buildWorkspaceRailBoundaryCompositionFieldProps",
        "keep final workspace rail boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-rail-boundary-composition-prop-group",
      path: "./workspace-rail-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final workspace rail handoff props.",
      runtimeExports: {
        buildWorkspaceRailBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose workspace rail boundary props through buildWorkspaceRailBoundaryCompositionProps",
        "keep final workspace rail handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-rail-mode-handler-prop-group",
      path: "./workspace-rail-mode-handler-prop-group",
      role: "Focused prop-group boundary for workspace rail mode selection and plot-view synchronization.",
      runtimeExports: {
        buildWorkspaceRailModeHandlerProps
      },
      containerResponsibilities: [
        "assemble workspace rail mode-change props through buildWorkspaceRailModeHandlerProps",
        "keep rail mode, plot switcher, and active plot view synchronization outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-prop-group",
      path: "./workspace-header-prop-group",
      role: "Focused prop-group boundary for active temporal labels, report readiness, import accept list, and header export callbacks.",
      runtimeExports: {
        buildWorkspaceHeaderProps
      },
      containerResponsibilities: [
        "assemble workspace header props through buildWorkspaceHeaderProps",
        "keep header-specific prop typing and grouping outside the main workspace shell prop group"
      ]
    },
    {
      id: "workspace-header-composition-prop-group",
      path: "./workspace-header-composition-prop-group",
      role: "Focused prop-group boundary for composing header export and temporal summary props.",
      runtimeExports: {
        buildWorkspaceHeaderCompositionProps
      },
      containerResponsibilities: [
        "compose header temporal summary and export props through buildWorkspaceHeaderCompositionProps",
        "keep final header prop composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-composition-field-prop-group",
      path: "./workspace-header-composition-field-prop-group",
      role: "Focused prop-group boundary for header composition field values.",
      runtimeExports: {
        buildWorkspaceHeaderCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble header composition field props through buildWorkspaceHeaderCompositionFieldProps",
        "keep header temporal summary and export field grouping outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-boundary-composition-field-prop-group",
      path: "./workspace-header-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final workspace header handoff field values.",
      runtimeExports: {
        buildWorkspaceHeaderBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble header boundary composition field props through buildWorkspaceHeaderBoundaryCompositionFieldProps",
        "keep final workspace header handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-boundary-composition-prop-group",
      path: "./workspace-header-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final workspace header handoff props.",
      runtimeExports: {
        buildWorkspaceHeaderBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose workspace header boundary props through buildWorkspaceHeaderBoundaryCompositionProps",
        "keep final workspace header boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-export-prop-group",
      path: "./workspace-header-export-prop-group",
      role: "Focused prop-group boundary for header upload accept list and report export callbacks.",
      runtimeExports: {
        buildWorkspaceHeaderExportProps
      },
      containerResponsibilities: [
        "assemble header upload and export props through buildWorkspaceHeaderExportProps",
        "keep upload accept list, contract upload handler, and report export callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-export-field-prop-group",
      path: "./workspace-header-export-field-prop-group",
      role: "Focused prop-group boundary for header upload and export field values.",
      runtimeExports: {
        buildWorkspaceHeaderExportFieldProps
      },
      containerResponsibilities: [
        "assemble header upload and export field props through buildWorkspaceHeaderExportFieldProps",
        "keep upload accept list, contract upload handler, and report export callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-temporal-summary-prop-group",
      path: "./workspace-header-temporal-summary-prop-group",
      role: "Focused prop-group boundary for header evidence and report readiness summary values; window and turn context moved to the top plot view bar.",
      runtimeExports: {
        buildWorkspaceHeaderTemporalSummaryProps
      },
      containerResponsibilities: [
        "assemble header temporal summary props through buildWorkspaceHeaderTemporalSummaryProps",
        "keep active window label, turn label, evidence count, and report readiness grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-header-temporal-summary-field-prop-group",
      path: "./workspace-header-temporal-summary-field-prop-group",
      role: "Focused prop-group boundary for header temporal summary field values.",
      runtimeExports: {
        buildWorkspaceHeaderTemporalSummaryFieldProps
      },
      containerResponsibilities: [
        "assemble header temporal summary field props through buildWorkspaceHeaderTemporalSummaryFieldProps",
        "keep active window label, turn label, evidence count, and report readiness field values grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-prop-group",
      path: "./workspace-left-rail-prop-group",
      role: "Focused prop-group boundary for data import, enterprise runtime, model builder, plot tools, stats, and workflow state props.",
      runtimeExports: {
        buildWorkspaceLeftRailProps
      },
      containerResponsibilities: [
        "assemble workspace left rail props through buildWorkspaceLeftRailProps",
        "keep left rail prop typing and grouping outside the main workspace container before deeper panel-specific extraction"
      ]
    },
    {
      id: "workspace-left-rail-composition-prop-group",
      path: "./workspace-left-rail-composition-prop-group",
      role: "Focused prop-group boundary for composing left rail workflow, data, and model panel props.",
      runtimeExports: {
        buildWorkspaceLeftRailCompositionProps
      },
      containerResponsibilities: [
        "compose left rail workflow, data panel, and model panel props through buildWorkspaceLeftRailCompositionProps",
        "keep final left rail prop composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-composition-field-prop-group",
      path: "./workspace-left-rail-composition-field-prop-group",
      role: "Focused prop-group boundary for left rail composition field values.",
      runtimeExports: {
        buildWorkspaceLeftRailCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble left rail composition field props through buildWorkspaceLeftRailCompositionFieldProps",
        "keep workflow, data panel, and model panel prop grouping outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-boundary-composition-field-prop-group",
      path: "./workspace-left-rail-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final workspace left rail handoff field values.",
      runtimeExports: {
        buildWorkspaceLeftRailBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble left rail boundary composition field props through buildWorkspaceLeftRailBoundaryCompositionFieldProps",
        "keep final workspace left rail handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-boundary-composition-prop-group",
      path: "./workspace-left-rail-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final workspace left rail handoff props.",
      runtimeExports: {
        buildWorkspaceLeftRailBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose left rail boundary props through buildWorkspaceLeftRailBoundaryCompositionProps",
        "keep final left rail boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-data-prop-group",
      path: "./workspace-left-rail-panel-data-prop-group",
      role: "Focused prop-group boundary for left rail data import, enterprise runtime, audit, and import feedback panels.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelDataProps
      },
      containerResponsibilities: [
        "assemble left rail data panel props through buildWorkspaceLeftRailPanelDataProps",
        "keep data import, enterprise runtime, data-contract audit, and import feedback props grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-data-field-prop-group",
      path: "./workspace-left-rail-panel-data-field-prop-group",
      role: "Focused prop-group boundary for left rail data panel field values.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelDataFieldProps
      },
      containerResponsibilities: [
        "assemble left rail data panel field props through buildWorkspaceLeftRailPanelDataFieldProps",
        "keep data import, enterprise runtime, data-contract audit, and import feedback field values grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-data-boundary-composition-field-prop-group",
      path: "./workspace-left-rail-panel-data-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final left rail data panel handoff field values.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble left rail data panel boundary composition field props through buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps",
        "keep final left rail data panel handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-data-boundary-composition-prop-group",
      path: "./workspace-left-rail-panel-data-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final left rail data panel handoff props.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelDataBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose left rail data panel boundary props through buildWorkspaceLeftRailPanelDataBoundaryCompositionProps",
        "keep final left rail data panel boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-model-prop-group",
      path: "./workspace-left-rail-panel-model-prop-group",
      role: "Focused prop-group boundary for left rail model, plot tooling, and statistics panels.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelModelProps
      },
      containerResponsibilities: [
        "assemble left rail model and analysis panel props through buildWorkspaceLeftRailPanelModelProps",
        "keep model builder, plot tools, and statistics props grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-model-field-prop-group",
      path: "./workspace-left-rail-panel-model-field-prop-group",
      role: "Focused prop-group boundary for left rail model and analysis field values.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelModelFieldProps
      },
      containerResponsibilities: [
        "assemble left rail model and analysis panel field props through buildWorkspaceLeftRailPanelModelFieldProps",
        "keep model builder, plot tools, and statistics field values grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-model-boundary-composition-field-prop-group",
      path: "./workspace-left-rail-panel-model-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final left rail model panel handoff field values.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble left rail model panel boundary composition field props through buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps",
        "keep final left rail model panel handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-panel-model-boundary-composition-prop-group",
      path: "./workspace-left-rail-panel-model-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final left rail model panel handoff props.",
      runtimeExports: {
        buildWorkspaceLeftRailPanelModelBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose left rail model panel boundary props through buildWorkspaceLeftRailPanelModelBoundaryCompositionProps",
        "keep final left rail model panel boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-workflow-prop-group",
      path: "./workspace-left-rail-workflow-prop-group",
      role: "Focused prop-group boundary for active rail copy, rail mode, and workflow step state.",
      runtimeExports: {
        buildWorkspaceLeftRailWorkflowProps
      },
      containerResponsibilities: [
        "assemble left rail workflow props through buildWorkspaceLeftRailWorkflowProps",
        "keep active rail panel copy, rail mode, and workflow steps grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-workflow-boundary-composition-field-prop-group",
      path: "./workspace-left-rail-workflow-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final left rail workflow handoff field values.",
      runtimeExports: {
        buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble left rail workflow boundary composition field props through buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps",
        "keep final left rail workflow handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-left-rail-workflow-boundary-composition-prop-group",
      path: "./workspace-left-rail-workflow-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final left rail workflow handoff props.",
      runtimeExports: {
        buildWorkspaceLeftRailWorkflowBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose left rail workflow boundary props through buildWorkspaceLeftRailWorkflowBoundaryCompositionProps",
        "keep final left rail workflow boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-prop-group",
      path: "./workspace-report-generator-prop-group",
      role: "Focused prop-group boundary for report generator review metadata, data governance, reliability, export, and publication callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorProps
      },
      containerResponsibilities: [
        "assemble report generator props through buildWorkspaceReportGeneratorProps",
        "keep report-generator prop typing and grouping outside the report and stats deck prop group"
      ]
    },
    {
      id: "workspace-report-generator-composition-prop-group",
      path: "./workspace-report-generator-composition-prop-group",
      role: "Focused prop-group boundary for composing final report generator props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorCompositionProps
      },
      containerResponsibilities: [
        "compose final report generator props through buildWorkspaceReportGeneratorCompositionProps",
        "keep report generator final prop composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-composition-field-prop-group",
      path: "./workspace-report-generator-composition-field-prop-group",
      role: "Focused prop-group boundary for report generator composition field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator composition field props through buildWorkspaceReportGeneratorCompositionFieldProps",
        "keep final report generator composition fields outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-boundary-composition-field-prop-group",
      path: "./workspace-report-generator-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report generator handoff field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator boundary composition field props through buildWorkspaceReportGeneratorBoundaryCompositionFieldProps",
        "keep final report generator handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-boundary-composition-prop-group",
      path: "./workspace-report-generator-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing final report generator handoff props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose report generator boundary props through buildWorkspaceReportGeneratorBoundaryCompositionProps",
        "keep final report generator boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-report-composition-prop-group",
      path: "./workspace-report-generator-report-composition-prop-group",
      role: "Focused prop-group boundary for composing final report generator props from model, audit, review, governance, reliability, and export groups.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReportCompositionProps
      },
      containerResponsibilities: [
        "assemble final report generator composition props through buildWorkspaceReportGeneratorReportCompositionProps",
        "keep model, audit, review, governance, reliability, and export group composition outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-report-composition-field-prop-group",
      path: "./workspace-report-generator-report-composition-field-prop-group",
      role: "Focused prop-group boundary for report generator report composition field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReportCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator report composition field props through buildWorkspaceReportGeneratorReportCompositionFieldProps",
        "keep model, audit, review, governance, reliability, and export composition fields outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-report-composition-boundary-field-prop-group",
      path: "./workspace-report-generator-report-composition-boundary-field-prop-group",
      role: "Focused prop-group boundary for final report generator report-composition handoff field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps
      },
      containerResponsibilities: [
        "assemble report generator report-composition boundary field props through buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps",
        "keep final report generator report-composition handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-report-composition-boundary-prop-group",
      path: "./workspace-report-generator-report-composition-boundary-prop-group",
      role: "Focused prop-group boundary for composing final report generator report-composition handoff props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReportCompositionBoundaryProps
      },
      containerResponsibilities: [
        "compose report generator report-composition boundary props through buildWorkspaceReportGeneratorReportCompositionBoundaryProps",
        "keep final report generator report-composition boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-governance-prop-group",
      path: "./workspace-report-generator-governance-prop-group",
      role: "Focused prop-group boundary for report generator data-governance metadata and change callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorGovernanceProps
      },
      containerResponsibilities: [
        "assemble report generator governance props through buildWorkspaceReportGeneratorGovernanceProps",
        "keep IRB, consent, retention, usage constraint, and steward props grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-governance-composition-prop-group",
      path: "./workspace-report-generator-governance-composition-prop-group",
      role: "Focused prop-group boundary for composing report generator governance props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorGovernanceCompositionProps
      },
      containerResponsibilities: [
        "compose report generator governance props through buildWorkspaceReportGeneratorGovernanceCompositionProps",
        "keep report generator governance composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-governance-composition-field-prop-group",
      path: "./workspace-report-generator-governance-composition-field-prop-group",
      role: "Focused prop-group boundary for report generator governance composition field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorGovernanceCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator governance composition field props through buildWorkspaceReportGeneratorGovernanceCompositionFieldProps",
        "keep report generator governance composition fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-governance-boundary-composition-field-prop-group",
      path: "./workspace-report-generator-governance-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report generator governance handoff field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator governance boundary composition field props through buildWorkspaceReportGeneratorGovernanceBoundaryCompositionFieldProps",
        "keep final report generator governance handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-governance-boundary-composition-prop-group",
      path: "./workspace-report-generator-governance-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report generator governance handoff props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose final report generator governance handoff props through buildWorkspaceReportGeneratorGovernanceBoundaryCompositionProps",
        "keep final report generator governance handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-governance-field-prop-group",
      path: "./workspace-report-generator-governance-field-prop-group",
      role: "Focused prop-group boundary for report generator governance field values and change callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorGovernanceFieldProps
      },
      containerResponsibilities: [
        "assemble report generator governance field props through buildWorkspaceReportGeneratorGovernanceFieldProps",
        "keep governance field values and setters grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-reliability-prop-group",
      path: "./workspace-report-generator-reliability-prop-group",
      role: "Focused prop-group boundary for report generator coding-reliability metadata and change callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReliabilityProps
      },
      containerResponsibilities: [
        "assemble report generator reliability props through buildWorkspaceReportGeneratorReliabilityProps",
        "keep coding status, reviewer, coding scheme, agreement, adjudication, and limitation props grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-reliability-composition-prop-group",
      path: "./workspace-report-generator-reliability-composition-prop-group",
      role: "Focused prop-group boundary for composing report generator reliability props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReliabilityCompositionProps
      },
      containerResponsibilities: [
        "compose report generator reliability props through buildWorkspaceReportGeneratorReliabilityCompositionProps",
        "keep report generator reliability composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-reliability-composition-field-prop-group",
      path: "./workspace-report-generator-reliability-composition-field-prop-group",
      role: "Focused prop-group boundary for report generator reliability composition field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReliabilityCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator reliability composition field props through buildWorkspaceReportGeneratorReliabilityCompositionFieldProps",
        "keep report generator reliability composition fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-reliability-boundary-composition-field-prop-group",
      path: "./workspace-report-generator-reliability-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report generator reliability handoff field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator reliability boundary composition field props through buildWorkspaceReportGeneratorReliabilityBoundaryCompositionFieldProps",
        "keep final report generator reliability handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-reliability-boundary-composition-prop-group",
      path: "./workspace-report-generator-reliability-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report generator reliability handoff props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose final report generator reliability handoff props through buildWorkspaceReportGeneratorReliabilityBoundaryCompositionProps",
        "keep final report generator reliability handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-reliability-field-prop-group",
      path: "./workspace-report-generator-reliability-field-prop-group",
      role: "Focused prop-group boundary for report generator reliability field values and change callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReliabilityFieldProps
      },
      containerResponsibilities: [
        "assemble report generator reliability field props through buildWorkspaceReportGeneratorReliabilityFieldProps",
        "keep reliability field values and setters grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-export-prop-group",
      path: "./workspace-report-generator-export-prop-group",
      role: "Focused prop-group boundary for report generator export, publication, and reliability upload callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorExportProps
      },
      containerResponsibilities: [
        "assemble report generator export props through buildWorkspaceReportGeneratorExportProps",
        "keep report, packet, bundle, readiness, reliability, publication, and upload callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-export-composition-prop-group",
      path: "./workspace-report-generator-export-composition-prop-group",
      role: "Focused prop-group boundary for composing report generator export props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorExportCompositionProps
      },
      containerResponsibilities: [
        "compose report generator export props through buildWorkspaceReportGeneratorExportCompositionProps",
        "keep report generator export callback composition and reliability dashboard state grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-export-composition-field-prop-group",
      path: "./workspace-report-generator-export-composition-field-prop-group",
      role: "Focused prop-group boundary for report generator export composition field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorExportCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator export composition field props through buildWorkspaceReportGeneratorExportCompositionFieldProps",
        "keep report generator export composition fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-export-boundary-composition-field-prop-group",
      path: "./workspace-report-generator-export-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report generator export handoff field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator export boundary composition field props through buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps",
        "keep final report generator export handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-export-boundary-composition-prop-group",
      path: "./workspace-report-generator-export-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report generator export handoff props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorExportBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose final report generator export handoff props through buildWorkspaceReportGeneratorExportBoundaryCompositionProps",
        "keep final report generator export handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-export-callback-prop-group",
      path: "./workspace-report-generator-export-callback-prop-group",
      role: "Focused prop-group boundary for report generator export, publication, and reliability upload callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorExportCallbackProps
      },
      containerResponsibilities: [
        "assemble report generator export callback props through buildWorkspaceReportGeneratorExportCallbackProps",
        "keep report, packet, bundle, readiness, reliability, publication, and upload callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-review-metadata-prop-group",
      path: "./workspace-report-generator-review-metadata-prop-group",
      role: "Focused prop-group boundary for report generator title, reviewer, interpretation, limitations, next actions, and manual review metadata.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReviewMetadataProps
      },
      containerResponsibilities: [
        "assemble report generator review metadata props through buildWorkspaceReportGeneratorReviewMetadataProps",
        "keep report title, review status, reviewer, interpretation, limitations, next-action, and manual review callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-review-metadata-composition-prop-group",
      path: "./workspace-report-generator-review-metadata-composition-prop-group",
      role: "Focused prop-group boundary for composing report generator review metadata props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReviewMetadataCompositionProps
      },
      containerResponsibilities: [
        "compose report generator review metadata props through buildWorkspaceReportGeneratorReviewMetadataCompositionProps",
        "keep report generator review status fields and manual review callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-review-metadata-composition-field-prop-group",
      path: "./workspace-report-generator-review-metadata-composition-field-prop-group",
      role: "Focused prop-group boundary for report generator review metadata composition field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator review metadata composition field props through buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps",
        "keep report generator review metadata composition fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-review-metadata-boundary-composition-field-prop-group",
      path: "./workspace-report-generator-review-metadata-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report generator review metadata handoff field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator review metadata boundary composition field props through buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionFieldProps",
        "keep final report generator review metadata handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-review-metadata-boundary-composition-prop-group",
      path: "./workspace-report-generator-review-metadata-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report generator review metadata handoff props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose final report generator review metadata handoff props through buildWorkspaceReportGeneratorReviewMetadataBoundaryCompositionProps",
        "keep final report generator review metadata handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-review-status-field-prop-group",
      path: "./workspace-report-generator-review-status-field-prop-group",
      role: "Focused prop-group boundary for report generator review status field values and change callbacks.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReviewStatusFieldProps
      },
      containerResponsibilities: [
        "assemble report generator review status field props through buildWorkspaceReportGeneratorReviewStatusFieldProps",
        "keep report title, status, reviewer, interpretation, limitations, and next-action fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-review-status-prop-group",
      path: "./workspace-report-generator-review-status-prop-group",
      role: "Focused prop-group boundary for report generator review status props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorReviewStatusProps
      },
      containerResponsibilities: [
        "compose report generator review status props through buildWorkspaceReportGeneratorReviewStatusProps",
        "keep report generator review status composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-audit-summary-prop-group",
      path: "./workspace-report-generator-audit-summary-prop-group",
      role: "Focused prop-group boundary for report generator audit, readiness, claim, demo, and production contract inputs.",
      runtimeExports: {
        buildWorkspaceReportGeneratorAuditSummaryProps
      },
      containerResponsibilities: [
        "assemble report generator audit summary props through buildWorkspaceReportGeneratorAuditSummaryProps",
        "keep completeness, review packet, readiness, claim, reliability gate, demo, development-plan, and production contract inputs grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-audit-summary-composition-prop-group",
      path: "./workspace-report-generator-audit-summary-composition-prop-group",
      role: "Focused prop-group boundary for composing report generator audit summary props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorAuditSummaryCompositionProps
      },
      containerResponsibilities: [
        "compose report generator audit summary props through buildWorkspaceReportGeneratorAuditSummaryCompositionProps",
        "keep report generator audit summary field inputs grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-audit-summary-composition-field-prop-group",
      path: "./workspace-report-generator-audit-summary-composition-field-prop-group",
      role: "Focused prop-group boundary for report generator audit summary composition field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator audit summary composition field props through buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps",
        "keep report generator audit summary composition fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-audit-summary-boundary-composition-field-prop-group",
      path: "./workspace-report-generator-audit-summary-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report generator audit summary handoff field values.",
      runtimeExports: {
        buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report generator audit summary boundary composition field props through buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionFieldProps",
        "keep final report generator audit summary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-audit-summary-boundary-composition-prop-group",
      path: "./workspace-report-generator-audit-summary-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report generator audit summary handoff props.",
      runtimeExports: {
        buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose final report generator audit summary handoff props through buildWorkspaceReportGeneratorAuditSummaryBoundaryCompositionProps",
        "keep final report generator audit summary handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-generator-audit-summary-field-prop-group",
      path: "./workspace-report-generator-audit-summary-field-prop-group",
      role: "Focused prop-group boundary for report generator audit summary field inputs.",
      runtimeExports: {
        buildWorkspaceReportGeneratorAuditSummaryFieldProps
      },
      containerResponsibilities: [
        "assemble report generator audit summary field props through buildWorkspaceReportGeneratorAuditSummaryFieldProps",
        "keep completeness, review packet, readiness, claim, reliability gate, demo, development-plan, and production contract inputs grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-data-import-prop-group",
      path: "./workspace-data-import-prop-group",
      role: "Focused prop-group boundary for SENA data import model state, file accept policy, sample loading, contract upload, template export, and clear callbacks.",
      runtimeExports: {
        buildWorkspaceDataImportProps
      },
      containerResponsibilities: [
        "assemble data import props through buildWorkspaceDataImportProps",
        "keep data-import prop typing and grouping outside the left rail prop group"
      ]
    },
    {
      id: "workspace-data-import-field-prop-group",
      path: "./workspace-data-import-field-prop-group",
      role: "Focused prop-group boundary for SENA data import field values and callbacks.",
      runtimeExports: {
        buildWorkspaceDataImportFieldProps
      },
      containerResponsibilities: [
        "assemble data import field props through buildWorkspaceDataImportFieldProps",
        "keep data import model, file policy, sample, upload, template, and clear fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-model-builder-prop-group",
      path: "./workspace-model-builder-prop-group",
      role: "Focused prop-group boundary for layout, layer visibility, fusion weights, threshold, normalization, and model-builder callbacks.",
      runtimeExports: {
        buildWorkspaceModelBuilderProps
      },
      containerResponsibilities: [
        "assemble model builder props through buildWorkspaceModelBuilderProps",
        "keep model-builder prop typing and grouping outside the left rail prop group"
      ]
    },
    {
      id: "workspace-model-builder-field-prop-group",
      path: "./workspace-model-builder-field-prop-group",
      role: "Focused prop-group boundary for model-builder field values and callbacks.",
      runtimeExports: {
        buildWorkspaceModelBuilderFieldProps
      },
      containerResponsibilities: [
        "assemble model builder field props through buildWorkspaceModelBuilderFieldProps",
        "keep layout, layer, fusion weight, threshold, and normalization fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-plot-tools-prop-group",
      path: "./workspace-plot-tools-prop-group",
      role: "Focused prop-group boundary for plot view selection, layer toggles, threshold, temporal modes, advanced plot controls, and fusion weights.",
      runtimeExports: {
        buildWorkspacePlotToolsProps
      },
      containerResponsibilities: [
        "assemble plot tools props through buildWorkspacePlotToolsProps",
        "keep plot-tools prop typing and grouping outside the left rail prop group"
      ]
    },
    {
      id: "workspace-plot-tools-field-prop-group",
      path: "./workspace-plot-tools-field-prop-group",
      role: "Focused prop-group boundary for plot-tools field values and callbacks.",
      runtimeExports: {
        buildWorkspacePlotToolsFieldProps
      },
      containerResponsibilities: [
        "assemble plot tools field props through buildWorkspacePlotToolsFieldProps",
        "keep plot view, layer, threshold, temporal, advanced, and fusion weight fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-stats-prop-group",
      path: "./workspace-stats-prop-group",
      role: "Focused prop-group boundary for SENA stats model inputs, runtime audits, method protocol, metric export callbacks, and selection callback.",
      runtimeExports: {
        buildWorkspaceStatsProps
      },
      containerResponsibilities: [
        "assemble workspace stats props through buildWorkspaceStatsProps",
        "keep stats prop typing and grouping outside the left rail prop group"
      ]
    },
    {
      id: "workspace-stats-field-prop-group",
      path: "./workspace-stats-field-prop-group",
      role: "Focused prop-group boundary for stats field values and callbacks.",
      runtimeExports: {
        buildWorkspaceStatsFieldProps
      },
      containerResponsibilities: [
        "assemble stats field props through buildWorkspaceStatsFieldProps",
        "keep model, runtime audit, method protocol, metric export, and selection fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-data-contract-audit-prop-group",
      path: "./workspace-data-contract-audit-prop-group",
      role: "Focused prop-group boundary for source data-contract audit artifact and export callback.",
      runtimeExports: {
        buildWorkspaceDataContractAuditProps
      },
      containerResponsibilities: [
        "assemble data contract audit props through buildWorkspaceDataContractAuditProps",
        "keep audit prop typing and grouping outside the left rail prop group"
      ]
    },
    {
      id: "workspace-data-contract-audit-field-prop-group",
      path: "./workspace-data-contract-audit-field-prop-group",
      role: "Focused prop-group boundary for data-contract audit field values and callbacks.",
      runtimeExports: {
        buildWorkspaceDataContractAuditFieldProps
      },
      containerResponsibilities: [
        "assemble data-contract audit field props through buildWorkspaceDataContractAuditFieldProps",
        "keep source audit artifact and audit export callback grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-data-import-feedback-prop-group",
      path: "./workspace-data-import-feedback-prop-group",
      role: "Focused prop-group boundary for import errors, uploaded table previews, warnings, and table/field mapping callbacks.",
      runtimeExports: {
        buildWorkspaceDataImportFeedbackProps
      },
      containerResponsibilities: [
        "assemble data import feedback props through buildWorkspaceDataImportFeedbackProps",
        "keep data-import feedback prop typing and grouping outside the left rail prop group"
      ]
    },
    {
      id: "workspace-data-import-feedback-field-prop-group",
      path: "./workspace-data-import-feedback-field-prop-group",
      role: "Focused prop-group boundary for data-import feedback field values and callbacks.",
      runtimeExports: {
        buildWorkspaceDataImportFeedbackFieldProps
      },
      containerResponsibilities: [
        "assemble data-import feedback field props through buildWorkspaceDataImportFeedbackFieldProps",
        "keep import errors, uploaded previews, warnings, and mapping callbacks grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-workflow-steps-prop-group",
      path: "./workspace-workflow-steps-prop-group",
      role: "Focused prop-group boundary for left-rail workflow step state projection.",
      runtimeExports: {
        buildWorkspaceWorkflowStepProps
      },
      containerResponsibilities: [
        "assemble workflow step props through buildWorkspaceWorkflowStepProps",
        "keep workflow-step prop typing and grouping outside the left rail prop group"
      ]
    },
    {
      id: "workspace-workflow-steps-field-prop-group",
      path: "./workspace-workflow-steps-field-prop-group",
      role: "Focused prop-group boundary for workflow-step field values.",
      runtimeExports: {
        buildWorkspaceWorkflowStepFieldProps
      },
      containerResponsibilities: [
        "assemble workflow-step field props through buildWorkspaceWorkflowStepFieldProps",
        "keep workflow step state projection grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-metrics-prop-group",
      path: "./workspace-report-and-stats-deck-metrics-prop-group",
      role: "Focused prop-group boundary for report/stat deck model, manifest, temporal metric, validation, and export props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckMetricsProps
      },
      containerResponsibilities: [
        "assemble report and stats deck metrics props through buildWorkspaceReportAndStatsDeckMetricsProps",
        "keep lower-deck metrics prop typing and grouping outside the main report/stat deck prop group"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-metrics-field-prop-group",
      path: "./workspace-report-and-stats-deck-metrics-field-prop-group",
      role: "Focused prop-group boundary for report/stat deck metrics field values and callbacks.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckMetricsFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck metrics field props through buildWorkspaceReportAndStatsDeckMetricsFieldProps",
        "keep lower-deck model, manifest, temporal, validation, and metric export fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group",
      path: "./workspace-report-and-stats-deck-metrics-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report/stat deck metrics handoff field values.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck metrics boundary composition field props through buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps",
        "keep final lower-deck model, manifest, temporal, validation, and metric export fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-metrics-boundary-composition-prop-group",
      path: "./workspace-report-and-stats-deck-metrics-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report/stat deck metrics handoff props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose report/stat deck metrics boundary composition props through buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionProps",
        "keep final lower-deck model, manifest, temporal, validation, and metric export composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-evidence-prop-group",
      path: "./workspace-report-and-stats-deck-evidence-prop-group",
      role: "Focused prop-group boundary for lower-deck evidence ledger, source filter, filter callback, and evidence export callback.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckEvidenceProps
      },
      containerResponsibilities: [
        "assemble report and stats deck evidence props through buildWorkspaceReportAndStatsDeckEvidenceProps",
        "keep lower-deck evidence prop typing and grouping outside the main report/stat deck prop group"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-evidence-field-prop-group",
      path: "./workspace-report-and-stats-deck-evidence-field-prop-group",
      role: "Focused prop-group boundary for report/stat deck evidence field values and callbacks.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckEvidenceFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck evidence field props through buildWorkspaceReportAndStatsDeckEvidenceFieldProps",
        "keep lower-deck evidence ledger, filter, and export fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group",
      path: "./workspace-report-and-stats-deck-evidence-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report/stat deck evidence handoff field values.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck evidence boundary composition field props through buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionFieldProps",
        "keep final lower-deck evidence ledger, filter, and export fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-evidence-boundary-composition-prop-group",
      path: "./workspace-report-and-stats-deck-evidence-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report/stat deck evidence handoff props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose report/stat deck evidence boundary composition props through buildWorkspaceReportAndStatsDeckEvidenceBoundaryCompositionProps",
        "keep final lower-deck evidence ledger, filter, and export composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-report-prop-group",
      path: "./workspace-report-and-stats-deck-report-prop-group",
      role: "Focused prop-group boundary for lower-deck report generator prop handoff.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckReportProps
      },
      containerResponsibilities: [
        "assemble report and stats deck report props through buildWorkspaceReportAndStatsDeckReportProps",
        "keep lower-deck report generator prop handoff outside the main report/stat deck prop group"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-report-field-prop-group",
      path: "./workspace-report-and-stats-deck-report-field-prop-group",
      role: "Focused prop-group boundary for report/stat deck report handoff field values.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckReportFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck report field props through buildWorkspaceReportAndStatsDeckReportFieldProps",
        "keep lower-deck report generator handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-report-boundary-composition-field-prop-group",
      path: "./workspace-report-and-stats-deck-report-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for final report/stat deck report handoff field values.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck report boundary composition field props through buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps",
        "keep final lower-deck report generator handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-report-boundary-composition-prop-group",
      path: "./workspace-report-and-stats-deck-report-boundary-composition-prop-group",
      role: "Focused prop-group boundary for final report/stat deck report handoff props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose report/stat deck report boundary composition props through buildWorkspaceReportAndStatsDeckReportBoundaryCompositionProps",
        "keep final lower-deck report generator handoff composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-composition-prop-group",
      path: "./workspace-report-and-stats-deck-composition-prop-group",
      role: "Focused prop-group boundary for composing lower-deck metrics, evidence, and report props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckCompositionProps
      },
      containerResponsibilities: [
        "assemble report and stats deck composition props through buildWorkspaceReportAndStatsDeckCompositionProps",
        "keep lower-deck metrics, evidence, and report prop composition outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-composition-field-prop-group",
      path: "./workspace-report-and-stats-deck-composition-field-prop-group",
      role: "Focused prop-group boundary for report/stat deck composition field values.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck composition field props through buildWorkspaceReportAndStatsDeckCompositionFieldProps",
        "keep lower-deck metrics, evidence, and report prop composition grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-composition-boundary-field-prop-group",
      path: "./workspace-report-and-stats-deck-composition-boundary-field-prop-group",
      role: "Focused prop-group boundary for final report/stat deck composition handoff field values.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck composition boundary field props through buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps",
        "keep final lower-deck metrics, evidence, and report composition fields grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-composition-boundary-prop-group",
      path: "./workspace-report-and-stats-deck-composition-boundary-prop-group",
      role: "Focused prop-group boundary for final report/stat deck composition handoff props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckCompositionBoundaryProps
      },
      containerResponsibilities: [
        "compose report/stat deck composition boundary props through buildWorkspaceReportAndStatsDeckCompositionBoundaryProps",
        "keep final lower-deck metrics, evidence, and report composition handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-boundary-composition-prop-group",
      path: "./workspace-report-and-stats-deck-boundary-composition-prop-group",
      role: "Focused prop-group boundary for composing the lower-deck boundary handoff props.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckBoundaryCompositionProps
      },
      containerResponsibilities: [
        "compose report and stats deck boundary props through buildWorkspaceReportAndStatsDeckBoundaryCompositionProps",
        "keep final report and stats deck boundary handoff grouped outside the main workspace container"
      ]
    },
    {
      id: "workspace-report-and-stats-deck-boundary-composition-field-prop-group",
      path: "./workspace-report-and-stats-deck-boundary-composition-field-prop-group",
      role: "Focused prop-group boundary for report/stat deck boundary composition field values.",
      runtimeExports: {
        buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps
      },
      containerResponsibilities: [
        "assemble report/stat deck boundary composition field props through buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps",
        "keep final report and stats deck boundary handoff fields grouped outside the main workspace container"
      ]
    },
    {
      id: "fusion-math-audit-panel",
      path: "./fusion-math-audit-panel",
      role: "Fusion math audit status, review-item list, and tolerance evidence panel.",
      runtimeExports: {
        FusionMathAuditPanel
      },
      containerResponsibilities: [
        "render FusionMathAuditPanel with prepared audit data",
        "avoid keeping fusion math audit evidence JSX in the main workspace container"
      ]
    },
    {
      id: "method-formula-panel",
      path: "./method-formula-panel",
      role: "SENA formula, live matrix ledger, matrix fingerprints, and method export controls.",
      runtimeExports: {
        MethodFormulaPanel
      },
      testIds: [
        "live-matrix-ledger",
        "matrix-fingerprint-ledger"
      ],
      containerResponsibilities: [
        "render MethodFormulaPanel with prepared model, audit data, and export callbacks",
        "avoid keeping formula, matrix ledger, and fingerprint evidence JSX in the main workspace container"
      ]
    },
    {
      id: "method-validation-panel",
      path: "./method-validation-panel",
      role: "Method validation diagnostics for metric provenance, sensitivity, stability, and null model panels.",
      runtimeExports: {
        MethodValidationPanel
      },
      testIds: [
        "metric-provenance-panel"
      ],
      containerResponsibilities: [
        "render MethodValidationPanel with prepared validation artifact data",
        "avoid keeping method validation diagnostic JSX in the main workspace container"
      ]
    },
    {
      id: "temporal-fusion-arc",
      path: "./temporal-fusion-arc",
      role: "Temporal Fusion Arc visualization component for Plan, Teach, Reflect traces.",
      runtimeExports: {
        TemporalFusionArc
      },
      testIds: ["temporal-fusion-arc"],
      storyPhases: ["Plan", "Teach", "Reflect"],
      containerResponsibilities: [
        "render imported TemporalFusionArc",
        "keep temporal story-view implementation out of the main container"
      ]
    }
  ]
} as const satisfies SenaWorkspaceModuleBoundaryManifest;
