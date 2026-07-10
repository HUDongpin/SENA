import type { WorkspaceReportGeneratorExportPropGroup } from "./workspace-report-generator-export-prop-group";

export type WorkspaceReportGeneratorExportCallbackPropGroup = Pick<WorkspaceReportGeneratorExportPropGroup,
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
  | "onExportPublication"
>;

export function buildWorkspaceReportGeneratorExportCallbackProps(
  props: WorkspaceReportGeneratorExportCallbackPropGroup
): WorkspaceReportGeneratorExportCallbackPropGroup {
  return props;
}
