import type { WorkspaceReportAndStatsDeckReportFieldPropGroup } from "./workspace-report-and-stats-deck-report-field-prop-group";

export type WorkspaceReportAndStatsDeckReportBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceReportAndStatsDeckReportFieldPropGroup, keyof WorkspaceReportAndStatsDeckReportFieldPropGroup>;

export function buildWorkspaceReportAndStatsDeckReportBoundaryCompositionFieldProps(
  props: WorkspaceReportAndStatsDeckReportBoundaryCompositionFieldPropGroup
): WorkspaceReportAndStatsDeckReportBoundaryCompositionFieldPropGroup {
  return props;
}
