import type { WorkspaceReportAndStatsDeckMetricsPropGroup } from "./workspace-report-and-stats-deck-metrics-prop-group";

export type WorkspaceReportAndStatsDeckMetricsFieldPropGroup = Pick<WorkspaceReportAndStatsDeckMetricsPropGroup,
  | "model"
  | "enaManifest"
  | "snaManifest"
  | "activeTemporalWindow"
  | "activeTemporalIndex"
  | "windowCount"
  | "methodValidation"
  | "temporalRuntimeTrace"
  | "onExportTemporalRuntimeTraceJson"
  | "onExportSocialReport"
  | "onExportPairReport"
>;

export function buildWorkspaceReportAndStatsDeckMetricsFieldProps(
  props: WorkspaceReportAndStatsDeckMetricsFieldPropGroup
): WorkspaceReportAndStatsDeckMetricsFieldPropGroup {
  return props;
}
