import type { WorkspaceReportGeneratorGovernancePropGroup } from "./workspace-report-generator-governance-prop-group";

export type WorkspaceReportGeneratorGovernanceCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorGovernancePropGroup, keyof WorkspaceReportGeneratorGovernancePropGroup>;

export function buildWorkspaceReportGeneratorGovernanceCompositionFieldProps(
  props: WorkspaceReportGeneratorGovernanceCompositionFieldPropGroup
): WorkspaceReportGeneratorGovernanceCompositionFieldPropGroup {
  return props;
}
