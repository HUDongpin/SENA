import type { WorkspaceReportGeneratorReliabilityPropGroup } from "./workspace-report-generator-reliability-prop-group";

export type WorkspaceReportGeneratorReliabilityCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorReliabilityPropGroup, keyof WorkspaceReportGeneratorReliabilityPropGroup>;

export function buildWorkspaceReportGeneratorReliabilityCompositionFieldProps(
  props: WorkspaceReportGeneratorReliabilityCompositionFieldPropGroup
): WorkspaceReportGeneratorReliabilityCompositionFieldPropGroup {
  return props;
}
