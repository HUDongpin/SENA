import type { WorkspaceReportAndStatsDeckBoundaryCompositionPropGroup } from "./workspace-report-and-stats-deck-boundary-composition-prop-group";

export type WorkspaceReportAndStatsDeckBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceReportAndStatsDeckBoundaryCompositionPropGroup, keyof WorkspaceReportAndStatsDeckBoundaryCompositionPropGroup>;

export function buildWorkspaceReportAndStatsDeckBoundaryCompositionFieldProps(
  props: WorkspaceReportAndStatsDeckBoundaryCompositionFieldPropGroup
): WorkspaceReportAndStatsDeckBoundaryCompositionFieldPropGroup {
  return props;
}
