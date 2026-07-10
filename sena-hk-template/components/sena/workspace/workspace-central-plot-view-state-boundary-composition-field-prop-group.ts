import type { WorkspaceCentralPlotViewStateCompositionFieldPropGroup } from "./workspace-central-plot-view-state-composition-field-prop-group";

export type WorkspaceCentralPlotViewStateBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotViewStateCompositionFieldPropGroup, keyof WorkspaceCentralPlotViewStateCompositionFieldPropGroup>;

export function buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps(
  props: WorkspaceCentralPlotViewStateBoundaryCompositionFieldPropGroup
): WorkspaceCentralPlotViewStateBoundaryCompositionFieldPropGroup {
  return props;
}
