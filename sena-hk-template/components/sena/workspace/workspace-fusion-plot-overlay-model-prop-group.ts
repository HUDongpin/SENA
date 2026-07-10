import type { WorkspaceFusionPlotMaximizedOverlayPropGroup } from "./workspace-fusion-plot-maximized-overlay-prop-group";

export type WorkspaceFusionPlotOverlayModelPropGroup = Pick<WorkspaceFusionPlotMaximizedOverlayPropGroup,
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

export function buildWorkspaceFusionPlotOverlayModelProps(
  props: WorkspaceFusionPlotOverlayModelPropGroup
): WorkspaceFusionPlotOverlayModelPropGroup {
  return props;
}
