import type { WorkspaceCentralPlotDeckPropGroup } from "./workspace-central-plot-deck-prop-group";

export type WorkspaceCentralPlotInteractionPropGroup = Pick<WorkspaceCentralPlotDeckPropGroup,
  | "jointEmbeddingOperator"
  | "onJointEmbeddingOperatorChange"
  | "selectedId"
  | "revealedLabelIds"
  | "onCanvasSelect"
  | "fusionPlotZoom"
  | "onZoomIn"
  | "onZoomOut"
  | "onZoomReset"
  | "onMaximizeFusionPlot"
>;

export function buildWorkspaceCentralPlotInteractionProps(
  props: WorkspaceCentralPlotInteractionPropGroup
): WorkspaceCentralPlotInteractionPropGroup {
  return props;
}
