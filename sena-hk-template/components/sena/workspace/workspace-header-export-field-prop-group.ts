import type { WorkspaceHeaderExportPropGroup } from "./workspace-header-export-prop-group";

export type WorkspaceHeaderExportFieldPropGroup = Pick<WorkspaceHeaderExportPropGroup,
  | "fileAccept"
  | "onContractUpload"
  | "onExportReportMarkdown"
>;

export function buildWorkspaceHeaderExportFieldProps(
  props: WorkspaceHeaderExportFieldPropGroup
): WorkspaceHeaderExportFieldPropGroup {
  return props;
}
