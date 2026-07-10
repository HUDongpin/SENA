import type { WorkspaceReportGeneratorReviewMetadataPropGroup } from "./workspace-report-generator-review-metadata-prop-group";

export type WorkspaceReportGeneratorReviewMetadataCompositionFieldPropGroup =
  Pick<WorkspaceReportGeneratorReviewMetadataPropGroup, keyof WorkspaceReportGeneratorReviewMetadataPropGroup>;

export function buildWorkspaceReportGeneratorReviewMetadataCompositionFieldProps(
  props: WorkspaceReportGeneratorReviewMetadataCompositionFieldPropGroup
): WorkspaceReportGeneratorReviewMetadataCompositionFieldPropGroup {
  return props;
}
