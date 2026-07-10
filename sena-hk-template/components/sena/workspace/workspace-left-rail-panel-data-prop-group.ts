import type { WorkspaceLeftRailPropGroup } from "./workspace-left-rail-prop-group";

export type WorkspaceLeftRailPanelDataPropGroup = Pick<WorkspaceLeftRailPropGroup,
  | "dataImportProps"
  | "enterpriseRuntimeProps"
  | "dataContractAuditProps"
  | "dataImportFeedbackProps"
>;

export function buildWorkspaceLeftRailPanelDataProps(
  props: WorkspaceLeftRailPanelDataPropGroup
): WorkspaceLeftRailPanelDataPropGroup {
  return props;
}
