import type { WorkspaceFusionPlotMaximizedOverlayPropGroup } from "./workspace-fusion-plot-maximized-overlay-prop-group";

export type WorkspaceFusionPlotOverlayZoomPropGroup = Pick<WorkspaceFusionPlotMaximizedOverlayPropGroup,
  | "zoom"
  | "onZoomIn"
  | "onZoomOut"
  | "onZoomReset"
>;

export function buildWorkspaceFusionPlotOverlayZoomProps(
  props: WorkspaceFusionPlotOverlayZoomPropGroup
): WorkspaceFusionPlotOverlayZoomPropGroup {
  return props;
}
