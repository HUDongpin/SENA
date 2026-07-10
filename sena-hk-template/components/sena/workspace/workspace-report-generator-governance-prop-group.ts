import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";

export type WorkspaceReportGeneratorGovernancePropGroup = Pick<WorkspaceReportGeneratorPropGroup,
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

export function buildWorkspaceReportGeneratorGovernanceProps(
  props: WorkspaceReportGeneratorGovernancePropGroup
): WorkspaceReportGeneratorGovernancePropGroup {
  return props;
}
