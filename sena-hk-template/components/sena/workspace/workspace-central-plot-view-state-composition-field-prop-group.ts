import type { WorkspaceCentralPlotViewStatePropGroup } from "./workspace-central-plot-view-state-prop-group";

export type WorkspaceCentralPlotViewStateCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotViewStatePropGroup, keyof WorkspaceCentralPlotViewStatePropGroup>;

export function buildWorkspaceCentralPlotViewStateCompositionFieldProps(
  props: WorkspaceCentralPlotViewStateCompositionFieldPropGroup
): WorkspaceCentralPlotViewStateCompositionFieldPropGroup {
  return props;
}
