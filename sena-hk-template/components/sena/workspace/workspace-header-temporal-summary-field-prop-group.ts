import type { WorkspaceHeaderTemporalSummaryPropGroup } from "./workspace-header-temporal-summary-prop-group";

export type WorkspaceHeaderTemporalSummaryFieldPropGroup = Pick<WorkspaceHeaderTemporalSummaryPropGroup,
  | "totalEvidenceRefs"
  | "reportReadyPercent"
>;

export function buildWorkspaceHeaderTemporalSummaryFieldProps(
  props: WorkspaceHeaderTemporalSummaryFieldPropGroup
): WorkspaceHeaderTemporalSummaryFieldPropGroup {
  return props;
}
