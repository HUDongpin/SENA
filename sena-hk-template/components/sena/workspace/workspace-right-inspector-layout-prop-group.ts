import type { WorkspaceRightInspectorPropGroup } from "./workspace-right-inspector-prop-group";

export type WorkspaceRightInspectorLayoutPropGroup = Pick<WorkspaceRightInspectorPropGroup,
  | "layout"
  | "selectedLayoutNote"
  | "onLayoutChange"
  | "layoutOptions"
  | "jointEmbeddingOperator"
  | "onJointEmbeddingOperatorChange"
>;

export function buildWorkspaceRightInspectorLayoutProps(
  props: WorkspaceRightInspectorLayoutPropGroup
): WorkspaceRightInspectorLayoutPropGroup {
  return props;
}
