import type { WorkspaceCentralPlotEvidencePropGroup } from "./workspace-central-plot-evidence-prop-group";

export type WorkspaceCentralPlotEvidenceCompositionFieldPropGroup =
  Pick<WorkspaceCentralPlotEvidencePropGroup, keyof WorkspaceCentralPlotEvidencePropGroup>;

export function buildWorkspaceCentralPlotEvidenceCompositionFieldProps(
  props: WorkspaceCentralPlotEvidenceCompositionFieldPropGroup
): WorkspaceCentralPlotEvidenceCompositionFieldPropGroup {
  return props;
}
