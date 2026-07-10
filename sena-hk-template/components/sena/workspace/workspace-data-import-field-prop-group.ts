import type { WorkspaceDataImportPropGroup } from "./workspace-data-import-prop-group";

export type WorkspaceDataImportFieldPropGroup = Pick<WorkspaceDataImportPropGroup,
  | "model"
  | "timelineModel"
  | "dataset"
  | "importMessage"
  | "fileAccept"
  | "isLoadingSample"
  | "onLoadSample"
  | "onContractUpload"
  | "onExportContractTemplate"
  | "onClearContract"
>;

export function buildWorkspaceDataImportFieldProps(
  props: WorkspaceDataImportFieldPropGroup
): WorkspaceDataImportFieldPropGroup {
  return props;
}
