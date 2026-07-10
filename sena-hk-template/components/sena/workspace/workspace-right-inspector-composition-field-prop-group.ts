import type { WorkspaceRightInspectorCompositionPropGroup } from "./workspace-right-inspector-composition-prop-group";

export type WorkspaceRightInspectorCompositionFieldPropGroup = Pick<WorkspaceRightInspectorCompositionPropGroup, keyof WorkspaceRightInspectorCompositionPropGroup>;

export function buildWorkspaceRightInspectorCompositionFieldProps(
  props: WorkspaceRightInspectorCompositionFieldPropGroup
): WorkspaceRightInspectorCompositionFieldPropGroup {
  return props;
}
