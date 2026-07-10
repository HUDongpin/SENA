import type { WorkspaceRightInspectorLayoutPropGroup } from "./workspace-right-inspector-layout-prop-group";

export type WorkspaceRightInspectorLayoutFieldPropGroup = Pick<WorkspaceRightInspectorLayoutPropGroup,
  | "layout"
  | "selectedLayoutNote"
  | "onLayoutChange"
  | "layoutOptions"
  | "jointEmbeddingOperator"
  | "onJointEmbeddingOperatorChange"
>;

export function buildWorkspaceRightInspectorLayoutFieldProps(
  props: WorkspaceRightInspectorLayoutFieldPropGroup
): WorkspaceRightInspectorLayoutFieldPropGroup {
  return props;
}
