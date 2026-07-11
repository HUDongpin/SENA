import type { WorkspaceFusionPlotOverlaySelectionPropGroup } from "./workspace-fusion-plot-overlay-selection-prop-group";

export type WorkspaceFusionPlotOverlaySelectionFieldPropGroup = Pick<WorkspaceFusionPlotOverlaySelectionPropGroup,
  | "selectedId"
  | "revealedLabelIds"
  | "onSelect"
  | "onClose"
>;

export function buildWorkspaceFusionPlotOverlaySelectionFieldProps(
  props: WorkspaceFusionPlotOverlaySelectionFieldPropGroup
): WorkspaceFusionPlotOverlaySelectionFieldPropGroup {
  return props;
}
