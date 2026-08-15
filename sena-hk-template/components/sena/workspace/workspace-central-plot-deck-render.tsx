import {
  WorkspaceShellPanel
} from "./workspace-shell-panels";
import {
  CentralPlotDeckShellAction
} from "./workspace-central-plot-deck-shell-controls";
import {
  CentralPlotDeckBody
} from "./workspace-central-plot-deck-body";
import { buildCentralPlotDeckBodyProps } from "./workspace-central-plot-deck-body-props";
import type {
  WorkspaceCentralPlotDeckRenderProps
} from "./workspace-central-plot-deck-render-props";

export function WorkspaceCentralPlotDeckRender(props: WorkspaceCentralPlotDeckRenderProps) {
  const {
    activePlotView,
    plotViewOptions,
    fusionPlotZoom,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onMaximizeFusionPlot
  } = props;
  const bodyProps = buildCentralPlotDeckBodyProps(props);
  const activePlotViewLabel = plotViewOptions.find((option) => option.id === activePlotView)?.label ?? "Fusion";
  const deckTitle = activePlotView === "fusion"
    ? "Fusion Plot - Current Window"
    : `${activePlotViewLabel} - Current Window`;

  return (
    <WorkspaceShellPanel
      id="workflow-temporal"
      testId="workspace-central-plot-deck"
      visualRole="workspace-central-plot-deck"
      defaultPlotView="fusion"
      plotScope="current-window"
      title={deckTitle}
      action={
        <CentralPlotDeckShellAction
          fusionPlotZoom={fusionPlotZoom}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
          onMaximizeFusionPlot={onMaximizeFusionPlot}
        />
      }
      className="min-h-[calc(100vh-7rem)]"
    >
      {/* The Fusion Canvas workflow step had no target element anywhere in the DOM. */}
      <div id="workflow-canvas">
        <CentralPlotDeckBody {...bodyProps} />
      </div>
    </WorkspaceShellPanel>
  );
}

export function renderWorkspaceCentralPlotDeck(props: WorkspaceCentralPlotDeckRenderProps) {
  return <WorkspaceCentralPlotDeckRender {...props} />;
}
