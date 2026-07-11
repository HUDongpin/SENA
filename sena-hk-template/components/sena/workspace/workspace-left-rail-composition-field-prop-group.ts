import type { WorkspaceLeftRailPanelDataPropGroup } from "./workspace-left-rail-panel-data-prop-group";
import type { WorkspaceLeftRailPanelModelPropGroup } from "./workspace-left-rail-panel-model-prop-group";
import type { WorkspaceLeftRailWorkflowBoundaryCompositionPropGroup } from "./workspace-left-rail-workflow-boundary-composition-prop-group";

export type WorkspaceLeftRailCompositionFieldPropGroup =
  WorkspaceLeftRailWorkflowBoundaryCompositionPropGroup
  & WorkspaceLeftRailPanelDataPropGroup
  & WorkspaceLeftRailPanelModelPropGroup;

export function buildWorkspaceLeftRailCompositionFieldProps(
  props: WorkspaceLeftRailCompositionFieldPropGroup
): WorkspaceLeftRailCompositionFieldPropGroup {
  return props;
}
