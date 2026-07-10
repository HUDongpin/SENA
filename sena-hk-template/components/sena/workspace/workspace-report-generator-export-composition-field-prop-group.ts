import type { WorkspaceReportGeneratorExportPropGroup } from "./workspace-report-generator-export-prop-group";

export type WorkspaceReportGeneratorExportCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorExportPropGroup, keyof WorkspaceReportGeneratorExportPropGroup>;

export function buildWorkspaceReportGeneratorExportCompositionFieldProps(
  props: WorkspaceReportGeneratorExportCompositionFieldPropGroup
): WorkspaceReportGeneratorExportCompositionFieldPropGroup {
  return props;
}
