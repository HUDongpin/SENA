import type { WorkspaceReportGeneratorExportCompositionPropGroup } from "./workspace-report-generator-export-composition-prop-group";

export type WorkspaceReportGeneratorExportBoundaryCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorExportCompositionPropGroup, keyof WorkspaceReportGeneratorExportCompositionPropGroup>;

export function buildWorkspaceReportGeneratorExportBoundaryCompositionFieldProps(
  props: WorkspaceReportGeneratorExportBoundaryCompositionFieldPropGroup
): WorkspaceReportGeneratorExportBoundaryCompositionFieldPropGroup {
  return props;
}
