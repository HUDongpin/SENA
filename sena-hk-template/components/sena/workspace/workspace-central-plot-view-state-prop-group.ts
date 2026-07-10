import type { WorkspaceCentralPlotDeckPropGroup } from "./workspace-central-plot-deck-prop-group";

export type WorkspaceCentralPlotViewStatePropGroup = Pick<WorkspaceCentralPlotDeckPropGroup,
  | "activePlotView"
  | "isPlotSwitcherOpen"
  | "onPlotSwitcherToggle"
  | "onPlotViewSelect"
  | "plotViewOptions"
>;

export function buildWorkspaceCentralPlotViewStateProps(
  props: WorkspaceCentralPlotViewStatePropGroup
): WorkspaceCentralPlotViewStatePropGroup {
  return props;
}
