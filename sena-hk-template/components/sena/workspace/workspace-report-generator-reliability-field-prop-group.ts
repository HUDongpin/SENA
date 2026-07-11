import type { WorkspaceReportGeneratorReliabilityPropGroup } from "./workspace-report-generator-reliability-prop-group";

export type WorkspaceReportGeneratorReliabilityFieldPropGroup = Pick<WorkspaceReportGeneratorReliabilityPropGroup,
  | "codingReliabilityStatus"
  | "onCodingReliabilityStatusChange"
  | "codingReliabilityReviewer"
  | "onCodingReliabilityReviewerChange"
  | "codingScheme"
  | "onCodingSchemeChange"
  | "unitOfCoding"
  | "onUnitOfCodingChange"
  | "coderCount"
  | "onCoderCountChange"
  | "agreementMetric"
  | "onAgreementMetricChange"
  | "agreementValue"
  | "onAgreementValueChange"
  | "adjudicationNotes"
  | "onAdjudicationNotesChange"
  | "reliabilityLimitations"
  | "onReliabilityLimitationsChange"
>;

export function buildWorkspaceReportGeneratorReliabilityFieldProps(
  props: WorkspaceReportGeneratorReliabilityFieldPropGroup
): WorkspaceReportGeneratorReliabilityFieldPropGroup {
  return props;
}
