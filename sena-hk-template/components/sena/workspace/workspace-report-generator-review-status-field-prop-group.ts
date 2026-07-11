import type { WorkspaceReportGeneratorReviewMetadataPropGroup } from "./workspace-report-generator-review-metadata-prop-group";

export type WorkspaceReportGeneratorReviewStatusFieldPropGroup = Pick<WorkspaceReportGeneratorReviewMetadataPropGroup,
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

export function buildWorkspaceReportGeneratorReviewStatusFieldProps(
  props: WorkspaceReportGeneratorReviewStatusFieldPropGroup
): WorkspaceReportGeneratorReviewStatusFieldPropGroup {
  return props;
}
