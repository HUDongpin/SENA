import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";

export type WorkspaceReportGeneratorAuditSummaryPropGroup = Pick<WorkspaceReportGeneratorPropGroup,
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

export function buildWorkspaceReportGeneratorAuditSummaryProps(
  props: WorkspaceReportGeneratorAuditSummaryPropGroup
): WorkspaceReportGeneratorAuditSummaryPropGroup {
  return props;
}
