import type { WorkspaceFusionPlotOverlayZoomPropGroup } from "./workspace-fusion-plot-overlay-zoom-prop-group";

export type WorkspaceFusionPlotOverlayZoomFieldPropGroup = Pick<WorkspaceFusionPlotOverlayZoomPropGroup,
  | "zoom"
  | "onZoomIn"
  | "onZoomOut"
  | "onZoomReset"
>;

export function buildWorkspaceFusionPlotOverlayZoomFieldProps(
  props: WorkspaceFusionPlotOverlayZoomFieldPropGroup
): WorkspaceFusionPlotOverlayZoomFieldPropGroup {
  return props;
}
