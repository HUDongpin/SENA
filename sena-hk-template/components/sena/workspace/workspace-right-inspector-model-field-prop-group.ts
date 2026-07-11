import type { WorkspaceRightInspectorModelPropGroup } from "./workspace-right-inspector-model-prop-group";

export type WorkspaceRightInspectorModelFieldPropGroup = Pick<WorkspaceRightInspectorModelPropGroup,
  | "model"
  | "timelineModel"
  | "enaManifest"
  | "layers"
  | "layerCopy"
  | "threshold"
  | "alpha"
  | "beta"
  | "gamma"
  | "activeTemporalWindow"
>;

export function buildWorkspaceRightInspectorModelFieldProps(
  props: WorkspaceRightInspectorModelFieldPropGroup
): WorkspaceRightInspectorModelFieldPropGroup {
  return props;
}
