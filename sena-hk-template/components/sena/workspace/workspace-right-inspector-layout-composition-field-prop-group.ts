import type { WorkspaceRightInspectorLayoutPropGroup } from "./workspace-right-inspector-layout-prop-group";

export type WorkspaceRightInspectorLayoutCompositionFieldPropGroup = Pick<WorkspaceRightInspectorLayoutPropGroup,
  | "layout"
  | "selectedLayoutNote"
  | "onLayoutChange"
  | "layoutOptions"
  | "jointEmbeddingOperator"
  | "onJointEmbeddingOperatorChange"
>;

export function buildWorkspaceRightInspectorLayoutCompositionFieldProps(
  props: WorkspaceRightInspectorLayoutCompositionFieldPropGroup
): WorkspaceRightInspectorLayoutCompositionFieldPropGroup {
  return props;
}
