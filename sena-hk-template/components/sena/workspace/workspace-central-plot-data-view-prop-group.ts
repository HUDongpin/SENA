import type { WorkspaceCentralPlotDeckPropGroup } from "./workspace-central-plot-deck-prop-group";

export type WorkspaceCentralPlotDataViewPropGroup = Pick<WorkspaceCentralPlotDeckPropGroup,
  | "activeTemporalWindow"
  | "isWorkspaceDataViewOpen"
  | "onWorkspaceDataViewToggle"
>;

export function buildWorkspaceCentralPlotDataViewProps(
  props: WorkspaceCentralPlotDataViewPropGroup
): WorkspaceCentralPlotDataViewPropGroup {
  return props;
}
