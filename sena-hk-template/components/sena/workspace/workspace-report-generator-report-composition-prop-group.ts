import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";
import type { WorkspaceReportGeneratorReportCompositionFieldPropGroup } from "./workspace-report-generator-report-composition-field-prop-group";

export type WorkspaceReportGeneratorReportCompositionPropGroup =
  WorkspaceReportGeneratorReportCompositionFieldPropGroup;

export function buildWorkspaceReportGeneratorReportCompositionProps(
  props: WorkspaceReportGeneratorReportCompositionPropGroup
): WorkspaceReportGeneratorPropGroup {
  return props;
}
