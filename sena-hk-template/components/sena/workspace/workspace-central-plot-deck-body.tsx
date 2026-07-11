import {
  CentralFusionAnalysisScope
} from "./central-fusion-analysis-scope";
import { WorkspaceDataViewDrawer } from "./workspace-data-view-drawer";
import {
  CentralPlotDeckActiveViewToolbar
} from "./workspace-central-plot-deck-shell-controls";
import type { CentralPlotDeckBodyProps } from "./workspace-central-plot-deck-body-props";
import { CentralPlotDeckViewPanelBranches } from "./workspace-central-plot-deck-view-panel-branches";

export function CentralPlotDeckBody(props: CentralPlotDeckBodyProps) {
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
    onWorkspaceDataViewToggle,
    viewPanelProps
  } = props;

  return (
    <>
      <CentralPlotDeckViewPanelBranches activePlotView={activePlotView} viewPanelProps={viewPanelProps} />

      {activePlotView !== "fusion" && (
        <CentralPlotDeckActiveViewToolbar
          activePlotView={activePlotView}
          isPlotSwitcherOpen={isPlotSwitcherOpen}
          onPlotSwitcherToggle={onPlotSwitcherToggle}
          onPlotViewSelect={onPlotViewSelect}
          plotViewOptions={plotViewOptions}
          className="mb-5"
        />
      )}

      <CentralFusionAnalysisScope
        model={model}
        activeWindow={activeTemporalWindow}
        activeIndex={activeTemporalIndex}
        windowCount={temporalWindows.length}
        fusionMathAudit={fusionMathAudit}
        activeTransition={activeTransition}
        activeWindowBrief={activeWindowBrief}
      />

      <WorkspaceDataViewDrawer
        model={model}
        activeWindow={activeTemporalWindow}
        isOpen={isWorkspaceDataViewOpen}
        onToggle={onWorkspaceDataViewToggle}
      />
    </>
  );
}
