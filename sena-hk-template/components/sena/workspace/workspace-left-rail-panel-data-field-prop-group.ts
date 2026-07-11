import type { WorkspaceLeftRailPanelDataPropGroup } from "./workspace-left-rail-panel-data-prop-group";

export type WorkspaceLeftRailPanelDataFieldPropGroup = Pick<WorkspaceLeftRailPanelDataPropGroup,
  | "dataImportProps"
  | "enterpriseRuntimeProps"
  | "dataContractAuditProps"
  | "dataImportFeedbackProps"
>;

export function buildWorkspaceLeftRailPanelDataFieldProps(
  props: WorkspaceLeftRailPanelDataFieldPropGroup
): WorkspaceLeftRailPanelDataFieldPropGroup {
  return props;
}
