import type { WorkspaceCentralPlotInteractionPropGroup } from "./workspace-central-plot-interaction-prop-group";

export type WorkspaceCentralPlotInteractionCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotInteractionPropGroup, keyof WorkspaceCentralPlotInteractionPropGroup>;

export function buildWorkspaceCentralPlotInteractionCompositionFieldProps(
  props: WorkspaceCentralPlotInteractionCompositionFieldPropGroup
): WorkspaceCentralPlotInteractionCompositionFieldPropGroup {
  return props;
}
