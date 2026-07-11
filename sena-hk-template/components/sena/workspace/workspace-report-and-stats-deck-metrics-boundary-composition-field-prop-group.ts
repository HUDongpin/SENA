import type { WorkspaceReportAndStatsDeckMetricsFieldPropGroup } from "./workspace-report-and-stats-deck-metrics-field-prop-group";

export type WorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceReportAndStatsDeckMetricsFieldPropGroup, keyof WorkspaceReportAndStatsDeckMetricsFieldPropGroup>;

export function buildWorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldProps(
  props: WorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldPropGroup
): WorkspaceReportAndStatsDeckMetricsBoundaryCompositionFieldPropGroup {
  return props;
}
