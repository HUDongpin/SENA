import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeReleaseGatePropKeys = [
  "enterpriseReleaseGateState",
  "latestReleaseGateReview",
  "latestReleaseGateIdentitySnapshot",
  "releaseGateDecision",
  "releaseGateVersion",
  "releaseGateEnvironment",
  "releaseGateApproverName",
  "releaseGateApproverRole",
  "releaseGateNotes",
  "releaseGateVerificationStatus",
  "releaseGateVerificationSummary",
  "releaseGateVerificationHash",
  "onReleaseGateDecisionChange",
  "onReleaseGateVersionChange",
  "onReleaseGateEnvironmentChange",
  "onReleaseGateApproverNameChange",
  "onReleaseGateApproverRoleChange",
  "onReleaseGateNotesChange",
  "onReleaseGateVerificationStatusChange",
  "onReleaseGateVerificationSummaryChange",
  "onReleaseGateVerificationHashChange",
  "onRefreshReleaseGateReviews",
  "onExportReleaseGateReviewsJson",
  "onSubmitReleaseGateReview"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeReleaseGatePropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeReleaseGatePropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeReleaseGateProps(
  props: WorkspaceEnterpriseRuntimeReleaseGatePropGroup
): WorkspaceEnterpriseRuntimeReleaseGatePropGroup {
  return props;
}
