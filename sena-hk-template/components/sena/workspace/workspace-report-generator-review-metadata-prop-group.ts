import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";

export type WorkspaceReportGeneratorReviewMetadataPropGroup = Pick<WorkspaceReportGeneratorPropGroup,
  | "onDemoManualReviewChange"
  | "reportTitle"
  | "onReportTitleChange"
  | "reviewStatus"
  | "onReviewStatusChange"
  | "reviewer"
  | "onReviewerChange"
  | "interpretation"
  | "onInterpretationChange"
  | "limitations"
  | "onLimitationsChange"
  | "nextActions"
  | "onNextActionsChange"
>;

export function buildWorkspaceReportGeneratorReviewMetadataProps(
  props: WorkspaceReportGeneratorReviewMetadataPropGroup
): WorkspaceReportGeneratorReviewMetadataPropGroup {
  return props;
}
