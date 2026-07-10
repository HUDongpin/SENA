import type { WorkspaceCentralPlotDataViewPropGroup } from "./workspace-central-plot-data-view-prop-group";
import type { WorkspaceCentralPlotEvidencePropGroup } from "./workspace-central-plot-evidence-prop-group";
import type { WorkspaceCentralPlotInteractionPropGroup } from "./workspace-central-plot-interaction-prop-group";
import type { WorkspaceCentralPlotModelPropGroup } from "./workspace-central-plot-model-prop-group";
import type { WorkspaceCentralPlotTemporalControlsPropGroup } from "./workspace-central-plot-temporal-controls-prop-group";
import type { WorkspaceCentralPlotViewStatePropGroup } from "./workspace-central-plot-view-state-prop-group";

export type WorkspaceCentralPlotDeckCompositionFieldPropGroup =
  WorkspaceCentralPlotModelPropGroup
  & WorkspaceCentralPlotInteractionPropGroup
  & WorkspaceCentralPlotViewStatePropGroup
  & WorkspaceCentralPlotDataViewPropGroup
  & WorkspaceCentralPlotTemporalControlsPropGroup
  & WorkspaceCentralPlotEvidencePropGroup;

export function buildWorkspaceCentralPlotDeckCompositionFieldProps(
  props: WorkspaceCentralPlotDeckCompositionFieldPropGroup
): WorkspaceCentralPlotDeckCompositionFieldPropGroup {
  return props;
}
