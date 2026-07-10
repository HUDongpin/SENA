import type { WorkspaceReportAndStatsDeckCompositionPropGroup } from "./workspace-report-and-stats-deck-composition-prop-group";

export type WorkspaceReportAndStatsDeckCompositionFieldPropGroup =
  Pick<WorkspaceReportAndStatsDeckCompositionPropGroup, keyof WorkspaceReportAndStatsDeckCompositionPropGroup>;

export function buildWorkspaceReportAndStatsDeckCompositionFieldProps(
  props: WorkspaceReportAndStatsDeckCompositionFieldPropGroup
): WorkspaceReportAndStatsDeckCompositionFieldPropGroup {
  return props;
}
