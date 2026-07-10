import type { WorkspaceReportGeneratorReportCompositionPropGroup } from "./workspace-report-generator-report-composition-prop-group";

export type WorkspaceReportGeneratorReportCompositionBoundaryFieldPropGroup =
  Pick<WorkspaceReportGeneratorReportCompositionPropGroup, keyof WorkspaceReportGeneratorReportCompositionPropGroup>;

export function buildWorkspaceReportGeneratorReportCompositionBoundaryFieldProps(
  props: WorkspaceReportGeneratorReportCompositionBoundaryFieldPropGroup
): WorkspaceReportGeneratorReportCompositionBoundaryFieldPropGroup {
  return props;
}
