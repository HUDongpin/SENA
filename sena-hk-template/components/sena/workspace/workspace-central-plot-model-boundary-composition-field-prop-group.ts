import type { WorkspaceCentralPlotModelCompositionFieldPropGroup } from "./workspace-central-plot-model-composition-field-prop-group";

export type WorkspaceCentralPlotModelBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotModelCompositionFieldPropGroup, keyof WorkspaceCentralPlotModelCompositionFieldPropGroup>;

export function buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps(
  props: WorkspaceCentralPlotModelBoundaryCompositionFieldPropGroup
): WorkspaceCentralPlotModelBoundaryCompositionFieldPropGroup {
  return props;
}
