import {
  buildWorkspaceMainShellSectionProps,
  type WorkspaceMainShellPropGroup
} from "./workspace-main-shell-prop-group";
import { buildWorkspaceMainShellBoundaryCompositionFieldProps } from "./workspace-main-shell-boundary-composition-field-prop-group";
import { buildWorkspaceMainShellBoundaryCompositionProps } from "./workspace-main-shell-boundary-composition-prop-group";
import { buildWorkspaceFusionPlotMaximizedOverlayProps } from "./workspace-fusion-plot-maximized-overlay-prop-group";
import { buildWorkspaceFusionPlotOverlayCompositionProps } from "./workspace-fusion-plot-overlay-composition-prop-group";
import { buildWorkspaceFusionPlotOverlayCompositionFieldProps } from "./workspace-fusion-plot-overlay-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-boundary-composition-prop-group";
import { buildWorkspaceFusionPlotOverlaySelectionProps } from "./workspace-fusion-plot-overlay-selection-prop-group";
import {
  buildWorkspaceFusionPlotOverlaySelectionFieldProps,
  type WorkspaceFusionPlotOverlaySelectionFieldPropGroup
} from "./workspace-fusion-plot-overlay-selection-field-prop-group";
import { buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-selection-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-selection-boundary-composition-prop-group";
import { buildWorkspaceFusionPlotOverlayModelProps } from "./workspace-fusion-plot-overlay-model-prop-group";
import {
  buildWorkspaceFusionPlotOverlayModelFieldProps,
  type WorkspaceFusionPlotOverlayModelFieldPropGroup
} from "./workspace-fusion-plot-overlay-model-field-prop-group";
import { buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-model-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-model-boundary-composition-prop-group";
import { buildWorkspaceFusionPlotOverlayZoomProps } from "./workspace-fusion-plot-overlay-zoom-prop-group";
import {
  buildWorkspaceFusionPlotOverlayZoomFieldProps,
  type WorkspaceFusionPlotOverlayZoomFieldPropGroup
} from "./workspace-fusion-plot-overlay-zoom-field-prop-group";
import { buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps } from "./workspace-fusion-plot-overlay-zoom-boundary-composition-field-prop-group";
import { buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps } from "./workspace-fusion-plot-overlay-zoom-boundary-composition-prop-group";
import { buildWorkspaceRailProps } from "./workspace-rail-prop-group";
import {
  buildWorkspaceRailFieldProps,
  type WorkspaceRailFieldPropGroup
} from "./workspace-rail-field-prop-group";
import { buildWorkspaceRailCompositionFieldProps } from "./workspace-rail-composition-field-prop-group";
import { buildWorkspaceRailCompositionProps } from "./workspace-rail-composition-prop-group";
import { buildWorkspaceRailBoundaryCompositionFieldProps } from "./workspace-rail-boundary-composition-field-prop-group";
import { buildWorkspaceRailBoundaryCompositionProps } from "./workspace-rail-boundary-composition-prop-group";
import {
  buildWorkspaceRailModeHandlerProps,
  type WorkspaceRailModeHandlerDependencies
} from "./workspace-rail-mode-handler-prop-group";

export type WorkspaceFusionOverlayRailMainShellContainerPropsInput =
  WorkspaceFusionPlotOverlaySelectionFieldPropGroup &
  WorkspaceFusionPlotOverlayModelFieldPropGroup &
  WorkspaceFusionPlotOverlayZoomFieldPropGroup &
  Pick<WorkspaceRailFieldPropGroup, "active" | "items"> &
  WorkspaceRailModeHandlerDependencies &
  Pick<
    WorkspaceMainShellPropGroup,
    | "isFusionPlotMaximized"
    | "headerProps"
    | "leftRailProps"
    | "centralPlotDeckProps"
    | "rightInspectorProps"
    | "reportAndStatsDeckProps"
  >;

export function buildWorkspaceFusionOverlayRailMainShellContainerProps({
  active,
  activeTurnLabel,
  activeWindowLabel,
  alpha,
  beta,
  centralPlotDeckProps,
  enaManifest,
  gamma,
  headerProps,
  isFusionPlotMaximized,
  items,
  jointEmbeddingOperator,
  layers,
  layout,
  leftRailProps,
  model,
  onActivePlotViewChange,
  onClose,
  onJointEmbeddingOperatorChange,
  onPlotSwitcherOpenChange,
  onSelect,
  onWorkspaceRailModeChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  reportAndStatsDeckProps,
  revealedLabelIds,
  rightInspectorProps,
  selectedId,
  threshold,
  zoom
}: WorkspaceFusionOverlayRailMainShellContainerPropsInput): WorkspaceMainShellPropGroup {
  const workspaceFusionPlotOverlaySelectionFieldProps = buildWorkspaceFusionPlotOverlaySelectionFieldProps({
    selectedId,
    revealedLabelIds,
    onSelect,
    onClose
  });

  const workspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps({
    ...workspaceFusionPlotOverlaySelectionFieldProps,
  });

  const workspaceFusionPlotOverlaySelectionBoundaryCompositionProps = buildWorkspaceFusionPlotOverlaySelectionBoundaryCompositionProps({
    ...workspaceFusionPlotOverlaySelectionBoundaryCompositionFieldProps,
  });

  const workspaceFusionPlotOverlaySelectionProps = buildWorkspaceFusionPlotOverlaySelectionProps({
    ...workspaceFusionPlotOverlaySelectionBoundaryCompositionProps,
  });

  const workspaceFusionPlotOverlayModelFieldProps = buildWorkspaceFusionPlotOverlayModelFieldProps({
    model,
    layout,
    jointEmbeddingOperator,
    onJointEmbeddingOperatorChange,
    enaManifest,
    layers,
    threshold,
    activeWindowLabel,
    activeTurnLabel,
    alpha,
    beta,
    gamma
  });

  const workspaceFusionPlotOverlayModelBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlayModelBoundaryCompositionFieldProps({
    ...workspaceFusionPlotOverlayModelFieldProps,
  });

  const workspaceFusionPlotOverlayModelBoundaryCompositionProps = buildWorkspaceFusionPlotOverlayModelBoundaryCompositionProps({
    ...workspaceFusionPlotOverlayModelBoundaryCompositionFieldProps,
  });

  const workspaceFusionPlotOverlayModelProps = buildWorkspaceFusionPlotOverlayModelProps({
    ...workspaceFusionPlotOverlayModelBoundaryCompositionProps,
  });

  const workspaceFusionPlotOverlayZoomFieldProps = buildWorkspaceFusionPlotOverlayZoomFieldProps({
    zoom,
    onZoomIn,
    onZoomOut,
    onZoomReset
  });

  const workspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps({
    ...workspaceFusionPlotOverlayZoomFieldProps,
  });

  const workspaceFusionPlotOverlayZoomBoundaryCompositionProps = buildWorkspaceFusionPlotOverlayZoomBoundaryCompositionProps({
    ...workspaceFusionPlotOverlayZoomBoundaryCompositionFieldProps,
  });

  const workspaceFusionPlotOverlayZoomProps = buildWorkspaceFusionPlotOverlayZoomProps({
    ...workspaceFusionPlotOverlayZoomBoundaryCompositionProps,
  });

  const workspaceFusionPlotOverlayCompositionFieldProps = buildWorkspaceFusionPlotOverlayCompositionFieldProps({
    ...workspaceFusionPlotOverlayModelProps,
    ...workspaceFusionPlotOverlaySelectionProps,
    ...workspaceFusionPlotOverlayZoomProps,
  });

  const workspaceFusionPlotOverlayCompositionProps = buildWorkspaceFusionPlotOverlayCompositionProps({
    ...workspaceFusionPlotOverlayCompositionFieldProps,
  });

  const workspaceFusionPlotOverlayBoundaryCompositionFieldProps = buildWorkspaceFusionPlotOverlayBoundaryCompositionFieldProps({
    ...workspaceFusionPlotOverlayCompositionProps,
  });

  const workspaceFusionPlotOverlayBoundaryCompositionProps = buildWorkspaceFusionPlotOverlayBoundaryCompositionProps({
    ...workspaceFusionPlotOverlayBoundaryCompositionFieldProps,
  });

  const workspaceFusionPlotMaximizedOverlayProps = buildWorkspaceFusionPlotMaximizedOverlayProps({
    ...workspaceFusionPlotOverlayBoundaryCompositionProps,
  });

  const workspaceRailModeHandlerProps = buildWorkspaceRailModeHandlerProps({
    onWorkspaceRailModeChange,
    onPlotSwitcherOpenChange,
    onActivePlotViewChange
  });

  const workspaceRailFieldProps = buildWorkspaceRailFieldProps({
    active,
    ...workspaceRailModeHandlerProps,
    items
  });

  const workspaceRailCompositionFieldProps = buildWorkspaceRailCompositionFieldProps({
    ...workspaceRailFieldProps,
  });

  const workspaceRailCompositionProps = buildWorkspaceRailCompositionProps({
    ...workspaceRailCompositionFieldProps,
  });

  const workspaceRailBoundaryCompositionFieldProps = buildWorkspaceRailBoundaryCompositionFieldProps({
    ...workspaceRailCompositionProps,
  });

  const workspaceRailBoundaryCompositionProps = buildWorkspaceRailBoundaryCompositionProps({
    ...workspaceRailBoundaryCompositionFieldProps,
  });

  const workspaceRailProps = buildWorkspaceRailProps({
    ...workspaceRailBoundaryCompositionProps,
  });

  const workspaceMainShellBoundaryCompositionFieldProps = buildWorkspaceMainShellBoundaryCompositionFieldProps({
    isFusionPlotMaximized,
    fusionPlotMaximizedOverlayProps: workspaceFusionPlotMaximizedOverlayProps,
    headerProps,
    railProps: workspaceRailProps,
    leftRailProps,
    centralPlotDeckProps,
    rightInspectorProps,
    reportAndStatsDeckProps,
  });

  const workspaceMainShellBoundaryCompositionProps = buildWorkspaceMainShellBoundaryCompositionProps({
    ...workspaceMainShellBoundaryCompositionFieldProps,
  });

  const workspaceMainShellSectionProps = buildWorkspaceMainShellSectionProps({
    ...workspaceMainShellBoundaryCompositionProps,
  });

  return workspaceMainShellSectionProps;
}
