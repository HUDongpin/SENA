import type { WorkspaceReportAndStatsDeckSectionProps } from "./workspace-report-and-stats-deck-section";

export type WorkspaceReportGeneratorPropGroup =
  WorkspaceReportAndStatsDeckSectionProps["reportProps"];

export function buildWorkspaceReportGeneratorProps(
  props: WorkspaceReportGeneratorPropGroup
): WorkspaceReportGeneratorPropGroup {
  return props;
}
