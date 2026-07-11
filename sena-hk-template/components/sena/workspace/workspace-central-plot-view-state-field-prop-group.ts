import type { WorkspaceCentralPlotViewStatePropGroup } from "./workspace-central-plot-view-state-prop-group";

export type WorkspaceCentralPlotViewStateFieldPropGroup = Pick<WorkspaceCentralPlotViewStatePropGroup,
  | "activePlotView"
  | "isPlotSwitcherOpen"
  | "onPlotSwitcherToggle"
  | "onPlotViewSelect"
  | "plotViewOptions"
>;

export function buildWorkspaceCentralPlotViewStateFieldProps(
  props: WorkspaceCentralPlotViewStateFieldPropGroup
): WorkspaceCentralPlotViewStateFieldPropGroup {
  return props;
}
