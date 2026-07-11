import type { WorkspaceRightInspectorPropGroup } from "./workspace-right-inspector-prop-group";

export type WorkspaceRightInspectorSelectionPropGroup = Pick<WorkspaceRightInspectorPropGroup,
  | "selected"
  | "selectedId"
  | "revealedLabelIds"
  | "onCanvasSelect"
>;

export function buildWorkspaceRightInspectorSelectionProps(
  props: WorkspaceRightInspectorSelectionPropGroup
): WorkspaceRightInspectorSelectionPropGroup {
  return props;
}
