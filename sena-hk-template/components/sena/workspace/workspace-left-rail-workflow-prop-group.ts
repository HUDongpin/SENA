import type { WorkspaceLeftRailPropGroup } from "./workspace-left-rail-prop-group";

export type WorkspaceLeftRailWorkflowPropGroup = Pick<WorkspaceLeftRailPropGroup,
  | "activeRailPanel"
  | "workspaceRailMode"
  | "workflowStepStates"
>;

export function buildWorkspaceLeftRailWorkflowProps(
  props: WorkspaceLeftRailWorkflowPropGroup
): WorkspaceLeftRailWorkflowPropGroup {
  return props;
}
