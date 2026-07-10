import type { WorkspaceLeftRailPanelModelPropGroup } from "./workspace-left-rail-panel-model-prop-group";

export type WorkspaceLeftRailPanelModelFieldPropGroup = Pick<WorkspaceLeftRailPanelModelPropGroup,
  | "modelBuilderProps"
  | "plotToolsProps"
  | "statsProps"
>;

export function buildWorkspaceLeftRailPanelModelFieldProps(
  props: WorkspaceLeftRailPanelModelFieldPropGroup
): WorkspaceLeftRailPanelModelFieldPropGroup {
  return props;
}
