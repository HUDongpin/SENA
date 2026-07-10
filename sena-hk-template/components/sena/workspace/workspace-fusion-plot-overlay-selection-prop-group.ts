import type { WorkspaceFusionPlotMaximizedOverlayPropGroup } from "./workspace-fusion-plot-maximized-overlay-prop-group";

export type WorkspaceFusionPlotOverlaySelectionPropGroup = Pick<WorkspaceFusionPlotMaximizedOverlayPropGroup,
  | "selectedId"
  | "revealedLabelIds"
  | "onSelect"
  | "onClose"
>;

export function buildWorkspaceFusionPlotOverlaySelectionProps(
  props: WorkspaceFusionPlotOverlaySelectionPropGroup
): WorkspaceFusionPlotOverlaySelectionPropGroup {
  return props;
}
