import type { WorkspaceReportAndStatsDeckReportPropGroup } from "./workspace-report-and-stats-deck-report-prop-group";

export type WorkspaceReportAndStatsDeckReportFieldPropGroup = Pick<WorkspaceReportAndStatsDeckReportPropGroup,
  | "reportProps"
>;

export function buildWorkspaceReportAndStatsDeckReportFieldProps(
  props: WorkspaceReportAndStatsDeckReportFieldPropGroup
): WorkspaceReportAndStatsDeckReportFieldPropGroup {
  return props;
}
