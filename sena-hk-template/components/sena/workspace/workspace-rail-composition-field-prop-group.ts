import type { WorkspaceRailPropGroup } from "./workspace-rail-prop-group";

export type WorkspaceRailCompositionFieldPropGroup = Pick<WorkspaceRailPropGroup,
  | "active"
  | "onChange"
  | "items"
>;

export function buildWorkspaceRailCompositionFieldProps(
  props: WorkspaceRailCompositionFieldPropGroup
): WorkspaceRailCompositionFieldPropGroup {
  return props;
}
