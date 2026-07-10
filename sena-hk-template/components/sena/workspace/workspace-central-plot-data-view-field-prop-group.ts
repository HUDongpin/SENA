import type { WorkspaceCentralPlotDataViewPropGroup } from "./workspace-central-plot-data-view-prop-group";

export type WorkspaceCentralPlotDataViewFieldPropGroup = Pick<WorkspaceCentralPlotDataViewPropGroup,
  | "activeTemporalWindow"
  | "isWorkspaceDataViewOpen"
  | "onWorkspaceDataViewToggle"
>;

export function buildWorkspaceCentralPlotDataViewFieldProps(
  props: WorkspaceCentralPlotDataViewFieldPropGroup
): WorkspaceCentralPlotDataViewFieldPropGroup {
  return props;
}
