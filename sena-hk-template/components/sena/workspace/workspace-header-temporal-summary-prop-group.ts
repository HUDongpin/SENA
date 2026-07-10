import type { WorkspaceHeaderPropGroup } from "./workspace-header-prop-group";

export type WorkspaceHeaderTemporalSummaryPropGroup = Pick<WorkspaceHeaderPropGroup,
  | "activeWindowLabel"
  | "activeTurnLabel"
  | "totalEvidenceRefs"
  | "reportReadyPercent"
>;

export function buildWorkspaceHeaderTemporalSummaryProps(
  props: WorkspaceHeaderTemporalSummaryPropGroup
): WorkspaceHeaderTemporalSummaryPropGroup {
  return props;
}
