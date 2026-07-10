import type { WorkspaceReportAndStatsDeckCompositionFieldPropGroup } from "./workspace-report-and-stats-deck-composition-field-prop-group";

export type WorkspaceReportAndStatsDeckCompositionBoundaryFieldPropGroup =
  Pick<WorkspaceReportAndStatsDeckCompositionFieldPropGroup, keyof WorkspaceReportAndStatsDeckCompositionFieldPropGroup>;

export function buildWorkspaceReportAndStatsDeckCompositionBoundaryFieldProps(
  props: WorkspaceReportAndStatsDeckCompositionBoundaryFieldPropGroup
): WorkspaceReportAndStatsDeckCompositionBoundaryFieldPropGroup {
  return props;
}
