import type { WorkspaceDataImportFeedbackPropGroup } from "./workspace-data-import-feedback-prop-group";

export type WorkspaceDataImportFeedbackFieldPropGroup = Pick<WorkspaceDataImportFeedbackPropGroup,
  | "importError"
  | "importErrorAttempt"
  | "uploadedTables"
  | "warnings"
  | "onTableChange"
  | "onFieldChange"
>;

export function buildWorkspaceDataImportFeedbackFieldProps(
  props: WorkspaceDataImportFeedbackFieldPropGroup
): WorkspaceDataImportFeedbackFieldPropGroup {
  return props;
}
