import type { WorkspaceReportAndStatsDeckPropGroup } from "./workspace-report-and-stats-deck-prop-group";

export type WorkspaceReportAndStatsDeckReportPropGroup = Pick<WorkspaceReportAndStatsDeckPropGroup,
  | "reportProps"
>;

export function buildWorkspaceReportAndStatsDeckReportProps(
  props: WorkspaceReportAndStatsDeckReportPropGroup
): WorkspaceReportAndStatsDeckReportPropGroup {
  return props;
}
