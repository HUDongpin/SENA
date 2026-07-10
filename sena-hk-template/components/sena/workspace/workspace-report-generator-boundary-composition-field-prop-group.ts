import type { WorkspaceReportGeneratorCompositionPropGroup } from "./workspace-report-generator-composition-prop-group";

export type WorkspaceReportGeneratorBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorCompositionPropGroup, keyof WorkspaceReportGeneratorCompositionPropGroup>;

export function buildWorkspaceReportGeneratorBoundaryCompositionFieldProps(
  props: WorkspaceReportGeneratorBoundaryCompositionFieldPropGroup
): WorkspaceReportGeneratorBoundaryCompositionFieldPropGroup {
  return props;
}
