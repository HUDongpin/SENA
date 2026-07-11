import type { WorkspaceRailPropGroup } from "./workspace-rail-prop-group";

export type WorkspaceRailFieldPropGroup = Pick<WorkspaceRailPropGroup,
  | "active"
  | "onChange"
  | "items"
>;

export function buildWorkspaceRailFieldProps(
  props: WorkspaceRailFieldPropGroup
): WorkspaceRailFieldPropGroup {
  return props;
}
