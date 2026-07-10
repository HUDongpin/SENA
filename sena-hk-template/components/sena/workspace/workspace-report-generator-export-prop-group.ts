import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";

export type WorkspaceReportGeneratorExportPropGroup = Pick<WorkspaceReportGeneratorPropGroup,
  | "onExportWalkthroughJson"
  | "onExportVerificationJson"
  | "onExportVerificationCompatibilityJson"
  | "onExportProductionPageContractJson"
  | "onExportProjectSnapshot"
  | "onExportDevelopmentPlanJson"
  | "onExportEnaReport"
  | "onExportRuntimeBundleJson"
  | "onExportRuntimeConsistencyAuditJson"
  | "onExportReadinessJson"
  | "onExportCodingReliabilityJson"
  | "onExportReliabilityDashboardJson"
  | "onExportClaimReadinessJson"
  | "onExportReviewPacket"
  | "onExportJson"
  | "onExportMarkdown"
  | "onReliabilityUpload"
  | "hasReliabilityDashboard"
  | "onExportPublication"
>;

export function buildWorkspaceReportGeneratorExportProps(
  props: WorkspaceReportGeneratorExportPropGroup
): WorkspaceReportGeneratorExportPropGroup {
  return props;
}
