import type { WorkspaceModelBuilderPropGroup } from "./workspace-model-builder-prop-group";

export type WorkspaceModelBuilderFieldPropGroup = Pick<WorkspaceModelBuilderPropGroup,
  | "layoutOptions"
  | "layout"
  | "onLayoutChange"
  | "layers"
  | "layerCopy"
  | "onLayerToggle"
  | "alpha"
  | "beta"
  | "gamma"
  | "threshold"
  | "normalization"
  | "onAlphaChange"
  | "onBetaChange"
  | "onGammaChange"
  | "onThresholdChange"
  | "onNormalizationChange"
>;

export function buildWorkspaceModelBuilderFieldProps(
  props: WorkspaceModelBuilderFieldPropGroup
): WorkspaceModelBuilderFieldPropGroup {
  return props;
}
