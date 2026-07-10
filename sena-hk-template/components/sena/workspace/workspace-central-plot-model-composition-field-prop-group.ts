import type { WorkspaceCentralPlotModelPropGroup } from "./workspace-central-plot-model-prop-group";

export type WorkspaceCentralPlotModelCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotModelPropGroup, keyof WorkspaceCentralPlotModelPropGroup>;

export function buildWorkspaceCentralPlotModelCompositionFieldProps(
  props: WorkspaceCentralPlotModelCompositionFieldPropGroup
): WorkspaceCentralPlotModelCompositionFieldPropGroup {
  return props;
}
