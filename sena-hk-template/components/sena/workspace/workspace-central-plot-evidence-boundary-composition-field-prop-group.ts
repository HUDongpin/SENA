import type { WorkspaceCentralPlotEvidenceCompositionFieldPropGroup } from "./workspace-central-plot-evidence-composition-field-prop-group";

export type WorkspaceCentralPlotEvidenceBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotEvidenceCompositionFieldPropGroup, keyof WorkspaceCentralPlotEvidenceCompositionFieldPropGroup>;

export function buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps(
  props: WorkspaceCentralPlotEvidenceBoundaryCompositionFieldPropGroup
): WorkspaceCentralPlotEvidenceBoundaryCompositionFieldPropGroup {
  return props;
}
