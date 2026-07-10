import type { WorkspaceCentralPlotModelPropGroup } from "./workspace-central-plot-model-prop-group";

export type WorkspaceCentralPlotModelFieldPropGroup = Pick<WorkspaceCentralPlotModelPropGroup,
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

export function buildWorkspaceCentralPlotModelFieldProps(
  props: WorkspaceCentralPlotModelFieldPropGroup
): WorkspaceCentralPlotModelFieldPropGroup {
  return props;
}
