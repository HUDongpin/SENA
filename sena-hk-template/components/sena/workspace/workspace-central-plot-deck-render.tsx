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
    fusionPlotZoom,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onMaximizeFusionPlot
  } = props;
  const bodyProps = buildCentralPlotDeckBodyProps(props);

  return (
    <WorkspaceShellPanel
      id="workflow-temporal"
      testId="workspace-central-plot-deck"
      visualRole="workspace-central-plot-deck"
      defaultPlotView="fusion"
      plotScope="current-window"
      title="Fusion Plot - Current Window"
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
      <CentralPlotDeckBody {...bodyProps} />
    </WorkspaceShellPanel>
  );
}

export function renderWorkspaceCentralPlotDeck(props: WorkspaceCentralPlotDeckRenderProps) {
  return <WorkspaceCentralPlotDeckRender {...props} />;
}
