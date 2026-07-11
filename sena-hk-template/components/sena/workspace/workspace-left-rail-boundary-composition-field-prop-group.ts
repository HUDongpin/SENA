import type { WorkspaceLeftRailPropGroup } from "./workspace-left-rail-prop-group";

export type WorkspaceLeftRailBoundaryCompositionFieldPropGroup = Pick<WorkspaceLeftRailPropGroup, keyof WorkspaceLeftRailPropGroup>;

export function buildWorkspaceLeftRailBoundaryCompositionFieldProps(
  props: WorkspaceLeftRailBoundaryCompositionFieldPropGroup
): WorkspaceLeftRailBoundaryCompositionFieldPropGroup {
  return props;
}
