import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";

export type WorkspaceReportGeneratorCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorPropGroup, keyof WorkspaceReportGeneratorPropGroup>;

export function buildWorkspaceReportGeneratorCompositionFieldProps(
  props: WorkspaceReportGeneratorCompositionFieldPropGroup
): WorkspaceReportGeneratorCompositionFieldPropGroup {
  return props;
}
