import type { WorkspaceHeaderPropGroup } from "./workspace-header-prop-group";

export type WorkspaceHeaderTemporalSummaryPropGroup = Pick<WorkspaceHeaderPropGroup,
  | "totalEvidenceRefs"
  | "reportReadyPercent"
>;

export function buildWorkspaceHeaderTemporalSummaryProps(
  props: WorkspaceHeaderTemporalSummaryPropGroup
): WorkspaceHeaderTemporalSummaryPropGroup {
  return props;
}
