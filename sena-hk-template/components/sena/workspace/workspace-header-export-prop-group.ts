import type { WorkspaceHeaderPropGroup } from "./workspace-header-prop-group";

export type WorkspaceHeaderExportPropGroup = Pick<WorkspaceHeaderPropGroup,
  | "fileAccept"
  | "onContractUpload"
  | "onExportReportMarkdown"
>;

export function buildWorkspaceHeaderExportProps(
  props: WorkspaceHeaderExportPropGroup
): WorkspaceHeaderExportPropGroup {
  return props;
}
