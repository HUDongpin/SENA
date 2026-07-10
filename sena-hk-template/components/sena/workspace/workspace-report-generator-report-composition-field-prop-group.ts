import type { WorkspaceReportGeneratorAuditSummaryPropGroup } from "./workspace-report-generator-audit-summary-prop-group";
import type { WorkspaceReportGeneratorExportPropGroup } from "./workspace-report-generator-export-prop-group";
import type { WorkspaceReportGeneratorGovernancePropGroup } from "./workspace-report-generator-governance-prop-group";
import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";
import type { WorkspaceReportGeneratorReliabilityPropGroup } from "./workspace-report-generator-reliability-prop-group";
import type { WorkspaceReportGeneratorReviewMetadataPropGroup } from "./workspace-report-generator-review-metadata-prop-group";

export type WorkspaceReportGeneratorReportCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorPropGroup, "model">
  & WorkspaceReportGeneratorAuditSummaryPropGroup
  & WorkspaceReportGeneratorReviewMetadataPropGroup
  & WorkspaceReportGeneratorGovernancePropGroup
  & WorkspaceReportGeneratorReliabilityPropGroup
  & WorkspaceReportGeneratorExportPropGroup;

export function buildWorkspaceReportGeneratorReportCompositionFieldProps(
  props: WorkspaceReportGeneratorReportCompositionFieldPropGroup
): WorkspaceReportGeneratorReportCompositionFieldPropGroup {
  return props;
}
