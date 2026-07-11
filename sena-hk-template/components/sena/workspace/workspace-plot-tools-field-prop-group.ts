import type { WorkspacePlotToolsPropGroup } from "./workspace-plot-tools-prop-group";

export type WorkspacePlotToolsFieldPropGroup = Pick<WorkspacePlotToolsPropGroup,
  | "layoutOptions"
  | "layout"
  | "onLayoutChange"
  | "plotViewOptions"
  | "activePlotView"
  | "onActivePlotViewChange"
  | "layers"
  | "layerCopy"
  | "onLayerToggle"
  | "threshold"
  | "onThresholdChange"
  | "temporalModeOptions"
  | "temporalMode"
  | "onTemporalModeChange"
  | "isAdvancedOpen"
  | "onAdvancedToggle"
  | "alpha"
  | "beta"
  | "gamma"
  | "normalization"
  | "onAlphaChange"
  | "onBetaChange"
  | "onGammaChange"
  | "onNormalizationChange"
>;

export function buildWorkspacePlotToolsFieldProps(
  props: WorkspacePlotToolsFieldPropGroup
): WorkspacePlotToolsFieldPropGroup {
  return props;
}
