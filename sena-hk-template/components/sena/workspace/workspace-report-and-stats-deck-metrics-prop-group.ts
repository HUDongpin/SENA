import type { WorkspaceReportAndStatsDeckPropGroup } from "./workspace-report-and-stats-deck-prop-group";

export type WorkspaceReportAndStatsDeckMetricsPropGroup = Pick<WorkspaceReportAndStatsDeckPropGroup,
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

export function buildWorkspaceReportAndStatsDeckMetricsProps(
  props: WorkspaceReportAndStatsDeckMetricsPropGroup
): WorkspaceReportAndStatsDeckMetricsPropGroup {
  return props;
}
