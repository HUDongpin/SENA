import type { WorkspaceCentralPlotTemporalControlsPropGroup } from "./workspace-central-plot-temporal-controls-prop-group";

export type WorkspaceCentralPlotTemporalControlsCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotTemporalControlsPropGroup, keyof WorkspaceCentralPlotTemporalControlsPropGroup>;

export function buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps(
  props: WorkspaceCentralPlotTemporalControlsCompositionFieldPropGroup
): WorkspaceCentralPlotTemporalControlsCompositionFieldPropGroup {
  return props;
}
