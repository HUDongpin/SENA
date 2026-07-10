import type { WorkspaceFusionPlotOverlayModelPropGroup } from "./workspace-fusion-plot-overlay-model-prop-group";

export type WorkspaceFusionPlotOverlayModelFieldPropGroup = Pick<WorkspaceFusionPlotOverlayModelPropGroup,
  | "model"
  | "layout"
  | "jointEmbeddingOperator"
  | "onJointEmbeddingOperatorChange"
  | "enaManifest"
  | "layers"
  | "threshold"
  | "activeWindowLabel"
  | "activeTurnLabel"
  | "alpha"
  | "beta"
  | "gamma"
>;

export function buildWorkspaceFusionPlotOverlayModelFieldProps(
  props: WorkspaceFusionPlotOverlayModelFieldPropGroup
): WorkspaceFusionPlotOverlayModelFieldPropGroup {
  return props;
}
