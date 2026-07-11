import type { WorkspaceReportGeneratorGovernancePropGroup } from "./workspace-report-generator-governance-prop-group";

export type WorkspaceReportGeneratorGovernanceFieldPropGroup = Pick<WorkspaceReportGeneratorGovernancePropGroup,
  | "dataGovernanceIrbApprovalId"
  | "onDataGovernanceIrbApprovalIdChange"
  | "dataGovernanceConsentScope"
  | "onDataGovernanceConsentScopeChange"
  | "dataGovernanceRetentionPolicy"
  | "onDataGovernanceRetentionPolicyChange"
  | "dataGovernanceUsageConstraints"
  | "onDataGovernanceUsageConstraintsChange"
  | "dataGovernanceDataSteward"
  | "onDataGovernanceDataStewardChange"
>;

export function buildWorkspaceReportGeneratorGovernanceFieldProps(
  props: WorkspaceReportGeneratorGovernanceFieldPropGroup
): WorkspaceReportGeneratorGovernanceFieldPropGroup {
  return props;
}
