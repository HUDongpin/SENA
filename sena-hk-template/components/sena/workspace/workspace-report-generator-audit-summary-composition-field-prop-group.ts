import type { WorkspaceReportGeneratorAuditSummaryPropGroup } from "./workspace-report-generator-audit-summary-prop-group";

export type WorkspaceReportGeneratorAuditSummaryCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorAuditSummaryPropGroup, keyof WorkspaceReportGeneratorAuditSummaryPropGroup>;

export function buildWorkspaceReportGeneratorAuditSummaryCompositionFieldProps(
  props: WorkspaceReportGeneratorAuditSummaryCompositionFieldPropGroup
): WorkspaceReportGeneratorAuditSummaryCompositionFieldPropGroup {
  return props;
}
