import type { WorkspaceCentralPlotDataViewCompositionFieldPropGroup } from "./workspace-central-plot-data-view-composition-field-prop-group";

export type WorkspaceCentralPlotDataViewBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotDataViewCompositionFieldPropGroup, keyof WorkspaceCentralPlotDataViewCompositionFieldPropGroup>;

export function buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps(
  props: WorkspaceCentralPlotDataViewBoundaryCompositionFieldPropGroup
): WorkspaceCentralPlotDataViewBoundaryCompositionFieldPropGroup {
  return props;
}
