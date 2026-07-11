import type { WorkspaceRightInspectorPropGroup } from "./workspace-right-inspector-prop-group";

export type WorkspaceRightInspectorModelPropGroup = Pick<WorkspaceRightInspectorPropGroup,
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

export function buildWorkspaceRightInspectorModelProps(
  props: WorkspaceRightInspectorModelPropGroup
): WorkspaceRightInspectorModelPropGroup {
  return props;
}
