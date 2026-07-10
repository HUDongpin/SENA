import type { WorkspaceCentralPlotDeckPropGroup } from "./workspace-central-plot-deck-prop-group";

export type WorkspaceCentralPlotModelPropGroup = Pick<WorkspaceCentralPlotDeckPropGroup,
  | "model"
  | "layout"
  | "enaManifest"
  | "snaManifest"
  | "layers"
  | "threshold"
  | "alpha"
  | "beta"
  | "gamma"
>;

export function buildWorkspaceCentralPlotModelProps(
  props: WorkspaceCentralPlotModelPropGroup
): WorkspaceCentralPlotModelPropGroup {
  return props;
}
