import type { WorkspaceFusionPlotOverlayModelPropGroup } from "./workspace-fusion-plot-overlay-model-prop-group";
import type { WorkspaceFusionPlotOverlaySelectionPropGroup } from "./workspace-fusion-plot-overlay-selection-prop-group";
import type { WorkspaceFusionPlotOverlayZoomPropGroup } from "./workspace-fusion-plot-overlay-zoom-prop-group";

export type WorkspaceFusionPlotOverlayCompositionFieldPropGroup =
  WorkspaceFusionPlotOverlayModelPropGroup
  & WorkspaceFusionPlotOverlaySelectionPropGroup
  & WorkspaceFusionPlotOverlayZoomPropGroup;

export function buildWorkspaceFusionPlotOverlayCompositionFieldProps(
  props: WorkspaceFusionPlotOverlayCompositionFieldPropGroup
): WorkspaceFusionPlotOverlayCompositionFieldPropGroup {
  return props;
}
