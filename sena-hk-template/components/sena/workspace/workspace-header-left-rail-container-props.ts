import {
  buildWorkspaceDataContractAuditProps,
  type WorkspaceDataContractAuditPropGroup
} from "./workspace-data-contract-audit-prop-group";
import {
  buildWorkspaceDataContractAuditFieldProps,
  type WorkspaceDataContractAuditFieldPropGroup
} from "./workspace-data-contract-audit-field-prop-group";
import {
  buildWorkspaceDataImportProps,
  type WorkspaceDataImportPropGroup
} from "./workspace-data-import-prop-group";
import {
  buildWorkspaceDataImportFieldProps,
  type WorkspaceDataImportFieldPropGroup
} from "./workspace-data-import-field-prop-group";
import {
  buildWorkspaceDataImportFeedbackProps,
  type WorkspaceDataImportFeedbackPropGroup
} from "./workspace-data-import-feedback-prop-group";
import {
  buildWorkspaceDataImportFeedbackFieldProps,
  type WorkspaceDataImportFeedbackFieldPropGroup
} from "./workspace-data-import-feedback-field-prop-group";
import {
  buildWorkspaceHeaderProps,
  type WorkspaceHeaderPropGroup
} from "./workspace-header-prop-group";
import {
  buildWorkspaceHeaderBoundaryCompositionFieldProps,
  type WorkspaceHeaderBoundaryCompositionFieldPropGroup
} from "./workspace-header-boundary-composition-field-prop-group";
import {
  buildWorkspaceHeaderBoundaryCompositionProps,
  type WorkspaceHeaderBoundaryCompositionPropGroup
} from "./workspace-header-boundary-composition-prop-group";
import {
  buildWorkspaceHeaderCompositionFieldProps,
  type WorkspaceHeaderCompositionFieldPropGroup
} from "./workspace-header-composition-field-prop-group";
import {
  buildWorkspaceHeaderCompositionProps,
  type WorkspaceHeaderCompositionPropGroup
} from "./workspace-header-composition-prop-group";
import {
  buildWorkspaceHeaderExportFieldProps,
  type WorkspaceHeaderExportFieldPropGroup
} from "./workspace-header-export-field-prop-group";
import {
  buildWorkspaceHeaderExportProps,
  type WorkspaceHeaderExportPropGroup
} from "./workspace-header-export-prop-group";
import {
  buildWorkspaceHeaderTemporalSummaryFieldProps,
  type WorkspaceHeaderTemporalSummaryFieldPropGroup
} from "./workspace-header-temporal-summary-field-prop-group";
import {
  buildWorkspaceHeaderTemporalSummaryProps,
  type WorkspaceHeaderTemporalSummaryPropGroup
} from "./workspace-header-temporal-summary-prop-group";
import {
  buildWorkspaceLeftRailProps,
  type WorkspaceLeftRailPropGroup
} from "./workspace-left-rail-prop-group";
import {
  buildWorkspaceLeftRailBoundaryCompositionFieldProps,
  type WorkspaceLeftRailBoundaryCompositionFieldPropGroup
} from "./workspace-left-rail-boundary-composition-field-prop-group";
import {
  buildWorkspaceLeftRailBoundaryCompositionProps,
  type WorkspaceLeftRailBoundaryCompositionPropGroup
} from "./workspace-left-rail-boundary-composition-prop-group";
import {
  buildWorkspaceLeftRailCompositionFieldProps,
  type WorkspaceLeftRailCompositionFieldPropGroup
} from "./workspace-left-rail-composition-field-prop-group";
import {
  buildWorkspaceLeftRailCompositionProps,
  type WorkspaceLeftRailCompositionPropGroup
} from "./workspace-left-rail-composition-prop-group";
import {
  buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps,
  type WorkspaceLeftRailPanelDataBoundaryCompositionFieldPropGroup
} from "./workspace-left-rail-panel-data-boundary-composition-field-prop-group";
import {
  buildWorkspaceLeftRailPanelDataBoundaryCompositionProps,
  type WorkspaceLeftRailPanelDataBoundaryCompositionPropGroup
} from "./workspace-left-rail-panel-data-boundary-composition-prop-group";
import {
  buildWorkspaceLeftRailPanelDataFieldProps,
  type WorkspaceLeftRailPanelDataFieldPropGroup
} from "./workspace-left-rail-panel-data-field-prop-group";
import {
  buildWorkspaceLeftRailPanelDataProps,
  type WorkspaceLeftRailPanelDataPropGroup
} from "./workspace-left-rail-panel-data-prop-group";
import {
  buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps,
  type WorkspaceLeftRailPanelModelBoundaryCompositionFieldPropGroup
} from "./workspace-left-rail-panel-model-boundary-composition-field-prop-group";
import {
  buildWorkspaceLeftRailPanelModelBoundaryCompositionProps,
  type WorkspaceLeftRailPanelModelBoundaryCompositionPropGroup
} from "./workspace-left-rail-panel-model-boundary-composition-prop-group";
import {
  buildWorkspaceLeftRailPanelModelFieldProps,
  type WorkspaceLeftRailPanelModelFieldPropGroup
} from "./workspace-left-rail-panel-model-field-prop-group";
import {
  buildWorkspaceLeftRailPanelModelProps,
  type WorkspaceLeftRailPanelModelPropGroup
} from "./workspace-left-rail-panel-model-prop-group";
import {
  buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps,
  type WorkspaceLeftRailWorkflowBoundaryCompositionFieldPropGroup
} from "./workspace-left-rail-workflow-boundary-composition-field-prop-group";
import {
  buildWorkspaceLeftRailWorkflowBoundaryCompositionProps,
  type WorkspaceLeftRailWorkflowBoundaryCompositionPropGroup
} from "./workspace-left-rail-workflow-boundary-composition-prop-group";
import {
  buildWorkspaceLeftRailWorkflowProps,
  type WorkspaceLeftRailWorkflowPropGroup
} from "./workspace-left-rail-workflow-prop-group";
import {
  buildWorkspaceModelBuilderProps,
  type WorkspaceModelBuilderPropGroup
} from "./workspace-model-builder-prop-group";
import {
  buildWorkspaceModelBuilderFieldProps,
  type WorkspaceModelBuilderFieldPropGroup
} from "./workspace-model-builder-field-prop-group";
import {
  buildWorkspacePlotToolsProps,
  type WorkspacePlotToolsPropGroup
} from "./workspace-plot-tools-prop-group";
import {
  buildWorkspacePlotToolsFieldProps,
  type WorkspacePlotToolsFieldPropGroup
} from "./workspace-plot-tools-field-prop-group";
import {
  buildWorkspaceStatsProps,
  type WorkspaceStatsPropGroup
} from "./workspace-stats-prop-group";
import {
  buildWorkspaceStatsFieldProps,
  type WorkspaceStatsFieldPropGroup
} from "./workspace-stats-field-prop-group";
import {
  buildWorkspaceWorkflowStepProps
} from "./workspace-workflow-steps-prop-group";
import {
  buildWorkspaceWorkflowStepFieldProps,
  type WorkspaceWorkflowStepFieldPropGroup
} from "./workspace-workflow-steps-field-prop-group";
import type { WorkspaceMainShellPropGroup } from "./workspace-main-shell-prop-group";

export type WorkspaceHeaderLeftRailContainerPropsInput =
  WorkspaceDataImportFieldPropGroup &
  WorkspaceModelBuilderFieldPropGroup &
  WorkspacePlotToolsFieldPropGroup &
  WorkspaceStatsFieldPropGroup &
  WorkspaceDataContractAuditFieldPropGroup &
  WorkspaceDataImportFeedbackFieldPropGroup &
  WorkspaceHeaderExportFieldPropGroup &
  WorkspaceHeaderTemporalSummaryFieldPropGroup &
  Pick<WorkspaceLeftRailPanelDataFieldPropGroup, "enterpriseRuntimeProps"> &
  Pick<WorkspaceLeftRailWorkflowPropGroup, "activeRailPanel" | "workspaceRailMode"> & {
    workflowStepStates: WorkspaceWorkflowStepFieldPropGroup;
  };

export type WorkspaceHeaderLeftRailContainerProps = Pick<
  WorkspaceMainShellPropGroup,
  "headerProps" | "leftRailProps"
>;

export function buildWorkspaceHeaderLeftRailContainerProps({
  activePlotView,
  activeRailPanel,
  alpha,
  audit,
  beta,
  dataset,
  enaManifest,
  enterpriseRuntimeProps,
  fileAccept,
  gamma,
  icon,
  importError,
  importMessage,
  isAdvancedOpen,
  isLoadingSample,
  layerCopy,
  layers,
  layout,
  layoutOptions,
  methodProtocol,
  methodValidation,
  model,
  normalization,
  onAdvancedToggle,
  onAlphaChange,
  onBetaChange,
  onClearContract,
  onContractUpload,
  onExport,
  onExportContractTemplate,
  onExportEnaManifestJson,
  onExportMethodProtocol,
  onExportMetricProvenance,
  onExportPairReport,
  onExportReportMarkdown,
  onExportSnaManifestJson,
  onExportSocialReport,
  onFieldChange,
  onGammaChange,
  onLayerToggle,
  onLayoutChange,
  onLoadSample,
  onNormalizationChange,
  onSelect,
  onTableChange,
  onTemporalModeChange,
  onThresholdChange,
  plotViewOptions,
  reportReadyPercent,
  runtimeConsistencyAudit,
  snaManifest,
  temporalMode,
  temporalModeOptions,
  threshold,
  timelineModel,
  totalEvidenceRefs,
  uploadedTables,
  warnings,
  workflowStepStates,
  workspaceRailMode
}: WorkspaceHeaderLeftRailContainerPropsInput): WorkspaceHeaderLeftRailContainerProps {
  const workspaceDataImportFieldProps = buildWorkspaceDataImportFieldProps({
    model,
    timelineModel,
    dataset,
    importMessage,
    fileAccept,
    isLoadingSample,
    onLoadSample,
    onContractUpload,
    onExportContractTemplate,
    onClearContract
  } satisfies WorkspaceDataImportFieldPropGroup);

  const workspaceDataImportProps = buildWorkspaceDataImportProps({
    ...workspaceDataImportFieldProps,
  } satisfies WorkspaceDataImportPropGroup);

  const workspaceModelBuilderFieldProps = buildWorkspaceModelBuilderFieldProps({
    layoutOptions,
    layout,
    onLayoutChange,
    layers,
    layerCopy,
    onLayerToggle,
    alpha,
    beta,
    gamma,
    threshold,
    normalization,
    onAlphaChange,
    onBetaChange,
    onGammaChange,
    onThresholdChange,
    onNormalizationChange
  } satisfies WorkspaceModelBuilderFieldPropGroup);

  const workspaceModelBuilderProps = buildWorkspaceModelBuilderProps({
    ...workspaceModelBuilderFieldProps,
  } satisfies WorkspaceModelBuilderPropGroup);

  const workspacePlotToolsFieldProps = buildWorkspacePlotToolsFieldProps({
    layoutOptions,
    layout,
    onLayoutChange,
    plotViewOptions,
    activePlotView,
    layers,
    layerCopy,
    onLayerToggle,
    threshold,
    onThresholdChange,
    temporalModeOptions,
    temporalMode,
    onTemporalModeChange,
    isAdvancedOpen,
    onAdvancedToggle,
    alpha,
    beta,
    gamma,
    normalization,
    onAlphaChange,
    onBetaChange,
    onGammaChange,
    onNormalizationChange
  } satisfies WorkspacePlotToolsFieldPropGroup);

  const workspacePlotToolsProps = buildWorkspacePlotToolsProps({
    ...workspacePlotToolsFieldProps,
  } satisfies WorkspacePlotToolsPropGroup);

  const workspaceStatsFieldProps = buildWorkspaceStatsFieldProps({
    model,
    enaManifest,
    snaManifest,
    runtimeConsistencyAudit,
    methodValidation,
    methodProtocol,
    icon,
    onSelect,
    onExportSocialReport,
    onExportEnaManifestJson,
    onExportSnaManifestJson,
    onExportPairReport,
    onExportMetricProvenance,
    onExportMethodProtocol
  } satisfies WorkspaceStatsFieldPropGroup);

  const workspaceStatsProps = buildWorkspaceStatsProps({
    ...workspaceStatsFieldProps,
  } satisfies WorkspaceStatsPropGroup);

  const workspaceDataContractAuditFieldProps = buildWorkspaceDataContractAuditFieldProps({
    audit,
    onExport
  } satisfies WorkspaceDataContractAuditFieldPropGroup);

  const workspaceDataContractAuditProps = buildWorkspaceDataContractAuditProps({
    ...workspaceDataContractAuditFieldProps,
  } satisfies WorkspaceDataContractAuditPropGroup);

  const workspaceDataImportFeedbackFieldProps = buildWorkspaceDataImportFeedbackFieldProps({
    importError,
    uploadedTables,
    warnings,
    onTableChange,
    onFieldChange
  } satisfies WorkspaceDataImportFeedbackFieldPropGroup);

  const workspaceDataImportFeedbackProps = buildWorkspaceDataImportFeedbackProps({
    ...workspaceDataImportFeedbackFieldProps,
  } satisfies WorkspaceDataImportFeedbackPropGroup);

  const workspaceWorkflowStepFieldProps = buildWorkspaceWorkflowStepFieldProps(workflowStepStates);

  const workspaceWorkflowStepProps = buildWorkspaceWorkflowStepProps(workspaceWorkflowStepFieldProps);

  const workspaceLeftRailPanelDataFieldProps = buildWorkspaceLeftRailPanelDataFieldProps({
    dataImportProps: workspaceDataImportProps,
    enterpriseRuntimeProps,
    dataContractAuditProps: workspaceDataContractAuditProps,
    dataImportFeedbackProps: workspaceDataImportFeedbackProps,
  } satisfies WorkspaceLeftRailPanelDataFieldPropGroup);

  const workspaceLeftRailPanelDataBoundaryCompositionFieldProps = buildWorkspaceLeftRailPanelDataBoundaryCompositionFieldProps({
    ...workspaceLeftRailPanelDataFieldProps,
  } satisfies WorkspaceLeftRailPanelDataBoundaryCompositionFieldPropGroup);

  const workspaceLeftRailPanelDataBoundaryCompositionProps = buildWorkspaceLeftRailPanelDataBoundaryCompositionProps({
    ...workspaceLeftRailPanelDataBoundaryCompositionFieldProps,
  } satisfies WorkspaceLeftRailPanelDataBoundaryCompositionPropGroup);

  const workspaceLeftRailPanelDataProps = buildWorkspaceLeftRailPanelDataProps({
    ...workspaceLeftRailPanelDataBoundaryCompositionProps,
  } satisfies WorkspaceLeftRailPanelDataPropGroup);

  const workspaceLeftRailPanelModelFieldProps = buildWorkspaceLeftRailPanelModelFieldProps({
    modelBuilderProps: workspaceModelBuilderProps,
    plotToolsProps: workspacePlotToolsProps,
    statsProps: workspaceStatsProps,
  } satisfies WorkspaceLeftRailPanelModelFieldPropGroup);

  const workspaceLeftRailPanelModelBoundaryCompositionFieldProps = buildWorkspaceLeftRailPanelModelBoundaryCompositionFieldProps({
    ...workspaceLeftRailPanelModelFieldProps,
  } satisfies WorkspaceLeftRailPanelModelBoundaryCompositionFieldPropGroup);

  const workspaceLeftRailPanelModelBoundaryCompositionProps = buildWorkspaceLeftRailPanelModelBoundaryCompositionProps({
    ...workspaceLeftRailPanelModelBoundaryCompositionFieldProps,
  } satisfies WorkspaceLeftRailPanelModelBoundaryCompositionPropGroup);

  const workspaceLeftRailPanelModelProps = buildWorkspaceLeftRailPanelModelProps({
    ...workspaceLeftRailPanelModelBoundaryCompositionProps,
  } satisfies WorkspaceLeftRailPanelModelPropGroup);

  const workspaceLeftRailWorkflowProps = buildWorkspaceLeftRailWorkflowProps({
    activeRailPanel,
    workspaceRailMode,
    workflowStepStates: workspaceWorkflowStepProps
  } satisfies WorkspaceLeftRailWorkflowPropGroup);

  const workspaceLeftRailWorkflowBoundaryCompositionFieldProps = buildWorkspaceLeftRailWorkflowBoundaryCompositionFieldProps({
    ...workspaceLeftRailWorkflowProps,
  } satisfies WorkspaceLeftRailWorkflowBoundaryCompositionFieldPropGroup);

  const workspaceLeftRailWorkflowBoundaryCompositionProps = buildWorkspaceLeftRailWorkflowBoundaryCompositionProps({
    ...workspaceLeftRailWorkflowBoundaryCompositionFieldProps,
  } satisfies WorkspaceLeftRailWorkflowBoundaryCompositionPropGroup);

  const workspaceLeftRailCompositionFieldProps = buildWorkspaceLeftRailCompositionFieldProps({
    ...workspaceLeftRailWorkflowBoundaryCompositionProps,
    ...workspaceLeftRailPanelDataProps,
    ...workspaceLeftRailPanelModelProps,
  } satisfies WorkspaceLeftRailCompositionFieldPropGroup);

  const workspaceLeftRailCompositionProps = buildWorkspaceLeftRailCompositionProps({
    ...workspaceLeftRailCompositionFieldProps,
  } satisfies WorkspaceLeftRailCompositionPropGroup);

  const workspaceLeftRailBoundaryCompositionFieldProps = buildWorkspaceLeftRailBoundaryCompositionFieldProps({
    ...workspaceLeftRailCompositionProps,
  } satisfies WorkspaceLeftRailBoundaryCompositionFieldPropGroup);

  const workspaceLeftRailBoundaryCompositionProps = buildWorkspaceLeftRailBoundaryCompositionProps({
    ...workspaceLeftRailBoundaryCompositionFieldProps,
  } satisfies WorkspaceLeftRailBoundaryCompositionPropGroup);

  const workspaceLeftRailProps = buildWorkspaceLeftRailProps({
    ...workspaceLeftRailBoundaryCompositionProps,
  } satisfies WorkspaceLeftRailPropGroup);

  const workspaceHeaderExportFieldProps = buildWorkspaceHeaderExportFieldProps({
    fileAccept,
    onContractUpload,
    onExportReportMarkdown
  } satisfies WorkspaceHeaderExportFieldPropGroup);

  const workspaceHeaderExportProps = buildWorkspaceHeaderExportProps({
    ...workspaceHeaderExportFieldProps,
  } satisfies WorkspaceHeaderExportPropGroup);

  const workspaceHeaderTemporalSummaryFieldProps = buildWorkspaceHeaderTemporalSummaryFieldProps({
    totalEvidenceRefs,
    reportReadyPercent
  } satisfies WorkspaceHeaderTemporalSummaryFieldPropGroup);

  const workspaceHeaderTemporalSummaryProps = buildWorkspaceHeaderTemporalSummaryProps({
    ...workspaceHeaderTemporalSummaryFieldProps,
  } satisfies WorkspaceHeaderTemporalSummaryPropGroup);

  const workspaceHeaderCompositionFieldProps = buildWorkspaceHeaderCompositionFieldProps({
    ...workspaceHeaderTemporalSummaryProps,
    ...workspaceHeaderExportProps,
  } satisfies WorkspaceHeaderCompositionFieldPropGroup);

  const workspaceHeaderCompositionProps = buildWorkspaceHeaderCompositionProps({
    ...workspaceHeaderCompositionFieldProps,
  } satisfies WorkspaceHeaderCompositionPropGroup);

  const workspaceHeaderBoundaryCompositionFieldProps = buildWorkspaceHeaderBoundaryCompositionFieldProps({
    ...workspaceHeaderCompositionProps,
  } satisfies WorkspaceHeaderBoundaryCompositionFieldPropGroup);

  const workspaceHeaderBoundaryCompositionProps = buildWorkspaceHeaderBoundaryCompositionProps({
    ...workspaceHeaderBoundaryCompositionFieldProps,
  } satisfies WorkspaceHeaderBoundaryCompositionPropGroup);

  const workspaceHeaderProps = buildWorkspaceHeaderProps({
    ...workspaceHeaderBoundaryCompositionProps,
  } satisfies WorkspaceHeaderPropGroup);

  return {
    headerProps: workspaceHeaderProps,
    leftRailProps: workspaceLeftRailProps
  };
}
