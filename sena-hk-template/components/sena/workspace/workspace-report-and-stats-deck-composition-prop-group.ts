import type { WorkspaceReportAndStatsDeckEvidencePropGroup } from "./workspace-report-and-stats-deck-evidence-prop-group";
import type { WorkspaceReportAndStatsDeckMetricsPropGroup } from "./workspace-report-and-stats-deck-metrics-prop-group";
import type { WorkspaceReportAndStatsDeckPropGroup } from "./workspace-report-and-stats-deck-prop-group";
import type { WorkspaceReportAndStatsDeckReportPropGroup } from "./workspace-report-and-stats-deck-report-prop-group";

export type WorkspaceReportAndStatsDeckCompositionPropGroup =
  WorkspaceReportAndStatsDeckMetricsPropGroup
  & WorkspaceReportAndStatsDeckEvidencePropGroup
  & WorkspaceReportAndStatsDeckReportPropGroup;

export function buildWorkspaceReportAndStatsDeckCompositionProps(
  props: WorkspaceReportAndStatsDeckCompositionPropGroup
): WorkspaceReportAndStatsDeckPropGroup {
  return props;
}
