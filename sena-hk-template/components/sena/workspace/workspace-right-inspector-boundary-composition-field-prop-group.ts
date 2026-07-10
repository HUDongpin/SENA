import type { WorkspaceRightInspectorPropGroup } from "./workspace-right-inspector-prop-group";

export type WorkspaceRightInspectorBoundaryCompositionFieldPropGroup = Pick<WorkspaceRightInspectorPropGroup, keyof WorkspaceRightInspectorPropGroup>;

export function buildWorkspaceRightInspectorBoundaryCompositionFieldProps(
  props: WorkspaceRightInspectorBoundaryCompositionFieldPropGroup
): WorkspaceRightInspectorBoundaryCompositionFieldPropGroup {
  return props;
}
