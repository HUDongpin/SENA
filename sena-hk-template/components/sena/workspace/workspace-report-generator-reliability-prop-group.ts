import type { WorkspaceReportGeneratorPropGroup } from "./workspace-report-generator-prop-group";

export type WorkspaceReportGeneratorReliabilityPropGroup = Pick<WorkspaceReportGeneratorPropGroup,
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

export function buildWorkspaceReportGeneratorReliabilityProps(
  props: WorkspaceReportGeneratorReliabilityPropGroup
): WorkspaceReportGeneratorReliabilityPropGroup {
  return props;
}
