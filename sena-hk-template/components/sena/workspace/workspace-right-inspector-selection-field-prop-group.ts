import type { WorkspaceRightInspectorSelectionPropGroup } from "./workspace-right-inspector-selection-prop-group";

export type WorkspaceRightInspectorSelectionFieldPropGroup = Pick<WorkspaceRightInspectorSelectionPropGroup,
  | "selected"
  | "selectedId"
  | "revealedLabelIds"
  | "onCanvasSelect"
>;

export function buildWorkspaceRightInspectorSelectionFieldProps(
  props: WorkspaceRightInspectorSelectionFieldPropGroup
): WorkspaceRightInspectorSelectionFieldPropGroup {
  return props;
}
