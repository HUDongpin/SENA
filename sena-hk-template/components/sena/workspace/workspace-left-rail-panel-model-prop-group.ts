import type { WorkspaceLeftRailPropGroup } from "./workspace-left-rail-prop-group";

export type WorkspaceLeftRailPanelModelPropGroup = Pick<WorkspaceLeftRailPropGroup,
  | "modelBuilderProps"
  | "plotToolsProps"
  | "statsProps"
>;

export function buildWorkspaceLeftRailPanelModelProps(
  props: WorkspaceLeftRailPanelModelPropGroup
): WorkspaceLeftRailPanelModelPropGroup {
  return props;
}
