import type { WorkspaceMainShellPropGroup } from "./workspace-main-shell-prop-group";

export type WorkspaceMainShellBoundaryCompositionFieldPropGroup = Pick<WorkspaceMainShellPropGroup, keyof WorkspaceMainShellPropGroup>;

export function buildWorkspaceMainShellBoundaryCompositionFieldProps(
  props: WorkspaceMainShellBoundaryCompositionFieldPropGroup
): WorkspaceMainShellBoundaryCompositionFieldPropGroup {
  return props;
}
