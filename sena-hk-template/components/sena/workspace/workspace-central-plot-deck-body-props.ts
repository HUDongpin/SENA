import type { WorkspaceCentralPlotDeckRenderProps } from "./workspace-central-plot-deck-render-props";

export const WORKSPACE_CENTRAL_PLOT_DECK_BODY_PROPS_MODULE = "workspace-central-plot-deck-body-props" as const;

export type CentralPlotDeckBodyProps = Pick<
  WorkspaceCentralPlotDeckRenderProps,
  | "model"
  | "activePlotView"
  | "isPlotSwitcherOpen"
  | "onPlotSwitcherToggle"
  | "onPlotViewSelect"
  | "plotViewOptions"
  | "activeTemporalWindow"
  | "activeTemporalIndex"
  | "temporalWindows"
  | "fusionMathAudit"
  | "activeTransition"
  | "activeWindowBrief"
  | "isWorkspaceDataViewOpen"
  | "onWorkspaceDataViewToggle"
> & {
  viewPanelProps: WorkspaceCentralPlotDeckRenderProps;
};

export function buildCentralPlotDeckBodyProps(
  props: WorkspaceCentralPlotDeckRenderProps
): CentralPlotDeckBodyProps {
  const {
    model,
    activePlotView,
    isPlotSwitcherOpen,
    onPlotSwitcherToggle,
    onPlotViewSelect,
    plotViewOptions,
    activeTemporalWindow,
    activeTemporalIndex,
    temporalWindows,
    fusionMathAudit,
    activeTransition,
    activeWindowBrief,
    isWorkspaceDataViewOpen,
    onWorkspaceDataViewToggle
  } = props;

  return {
    model,
    activePlotView,
    isPlotSwitcherOpen,
    onPlotSwitcherToggle,
    onPlotViewSelect,
    plotViewOptions,
    activeTemporalWindow,
    activeTemporalIndex,
    temporalWindows,
    fusionMathAudit,
    activeTransition,
    activeWindowBrief,
    isWorkspaceDataViewOpen,
    onWorkspaceDataViewToggle,
    viewPanelProps: props
  };
}
