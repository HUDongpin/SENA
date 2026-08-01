import type { WorkspaceCentralPlotDeckRenderProps } from "./workspace-central-plot-deck-render-props";

export const WORKSPACE_CENTRAL_PLOT_DECK_VIEW_PANEL_PROPS_MODULE = "workspace-central-plot-deck-view-panel-props" as const;

export type CentralFusionPlotViewPanelProps = Pick<
  WorkspaceCentralPlotDeckRenderProps,
  | "model"
  | "layout"
  | "jointEmbeddingOperator"
  | "onJointEmbeddingOperatorChange"
  | "enaManifest"
  | "layers"
  | "threshold"
  | "selectedId"
  | "revealedLabelIds"
  | "onCanvasSelect"
  | "fusionPlotZoom"
  | "activePlotView"
  | "isPlotSwitcherOpen"
  | "onPlotSwitcherToggle"
  | "onPlotViewSelect"
  | "plotViewOptions"
  | "alpha"
  | "beta"
  | "gamma"
>;

export type CentralTemporalPlotViewPanelProps = Pick<
  WorkspaceCentralPlotDeckRenderProps,
  | "model"
  | "temporalMode"
  | "onTemporalModeChange"
  | "movingWindowSize"
  | "onMovingWindowSizeChange"
  | "movingWindowStep"
  | "onMovingWindowStepChange"
  | "turnWindowRadius"
  | "onTurnWindowRadiusChange"
  | "temporalWindows"
  | "temporalRuntimeTrace"
  | "activeTemporalIndex"
  | "onActiveTemporalIndexChange"
  | "isAnimating"
  | "onAnimationToggle"
  | "animationMs"
  | "onAnimationMsChange"
>;

export type CentralDualLensViewPanelProps = Pick<
  WorkspaceCentralPlotDeckRenderProps,
  | "model"
  | "enaManifest"
  | "snaManifest"
  | "activeTemporalWindow"
  | "activeTemporalIndex"
  | "temporalWindows"
>;

export type CentralEnaSpaceViewPanelProps = Pick<
  WorkspaceCentralPlotDeckRenderProps,
  | "model"
  | "enaManifest"
  | "layers"
  | "threshold"
  | "selectedId"
  | "onCanvasSelect"
  // ENA Space was the one central view pinned at 100%: the panel never passed
  // the zoom the surface already supported.
  | "fusionPlotZoom"
  | "activePlotView"
  | "isPlotSwitcherOpen"
  | "onPlotSwitcherToggle"
  | "onPlotViewSelect"
  | "plotViewOptions"
>;

export type CentralSnaMetricsViewPanelProps = Pick<WorkspaceCentralPlotDeckRenderProps, "model">;

export type CentralEvidenceLedgerViewPanelProps = Pick<
  WorkspaceCentralPlotDeckRenderProps,
  | "evidenceLedger"
  | "evidenceSourceFilter"
  | "onEvidenceSourceFilterChange"
  | "onExportEvidenceLedgerJson"
>;

export type CentralMatrixViewPanelProps = Pick<WorkspaceCentralPlotDeckRenderProps, "model">;
