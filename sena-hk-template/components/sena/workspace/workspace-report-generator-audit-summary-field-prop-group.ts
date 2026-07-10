import type { WorkspaceReportGeneratorAuditSummaryPropGroup } from "./workspace-report-generator-audit-summary-prop-group";

export type WorkspaceReportGeneratorAuditSummaryFieldPropGroup = Pick<WorkspaceReportGeneratorAuditSummaryPropGroup,
  | "completenessAudit"
  | "reviewPacketAudit"
  | "pilotReadinessAudit"
  | "claimReadinessGate"
  | "codingReliabilityGate"
  | "developmentPlan"
  | "demoVerification"
  | "demoVerificationCompatibilityAudit"
  | "productionPageContract"
>;

export function buildWorkspaceReportGeneratorAuditSummaryFieldProps(
  props: WorkspaceReportGeneratorAuditSummaryFieldPropGroup
): WorkspaceReportGeneratorAuditSummaryFieldPropGroup {
  return props;
}
