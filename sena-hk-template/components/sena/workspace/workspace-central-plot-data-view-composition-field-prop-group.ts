import type { WorkspaceCentralPlotDataViewPropGroup } from "./workspace-central-plot-data-view-prop-group";

export type WorkspaceCentralPlotDataViewCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotDataViewPropGroup, keyof WorkspaceCentralPlotDataViewPropGroup>;

export function buildWorkspaceCentralPlotDataViewCompositionFieldProps(
  props: WorkspaceCentralPlotDataViewCompositionFieldPropGroup
): WorkspaceCentralPlotDataViewCompositionFieldPropGroup {
  return props;
}
