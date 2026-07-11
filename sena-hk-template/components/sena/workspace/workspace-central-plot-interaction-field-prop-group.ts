import type { WorkspaceCentralPlotInteractionPropGroup } from "./workspace-central-plot-interaction-prop-group";

export type WorkspaceCentralPlotInteractionFieldPropGroup = Pick<WorkspaceCentralPlotInteractionPropGroup,
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

export function buildWorkspaceCentralPlotInteractionFieldProps(
  props: WorkspaceCentralPlotInteractionFieldPropGroup
): WorkspaceCentralPlotInteractionFieldPropGroup {
  return props;
}
