import type { WorkspaceCentralPlotDeckPropGroup } from "./workspace-central-plot-deck-prop-group";

export type WorkspaceCentralPlotDeckBoundaryCompositionFieldPropGroup = Pick<WorkspaceCentralPlotDeckPropGroup, keyof WorkspaceCentralPlotDeckPropGroup>;

export function buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps(
  props: WorkspaceCentralPlotDeckBoundaryCompositionFieldPropGroup
): WorkspaceCentralPlotDeckBoundaryCompositionFieldPropGroup {
  return props;
}
