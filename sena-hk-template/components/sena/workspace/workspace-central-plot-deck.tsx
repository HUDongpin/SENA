import {
  renderWorkspaceCentralPlotDeck
} from "./workspace-central-plot-deck-render";
import type { WorkspaceCentralPlotDeckRenderProps } from "./workspace-central-plot-deck-render-props";

export type WorkspaceCentralPlotDeckProps = WorkspaceCentralPlotDeckRenderProps;

export function WorkspaceCentralPlotDeck(props: WorkspaceCentralPlotDeckProps) {
  return renderWorkspaceCentralPlotDeck(props);
}
