import type { WorkspaceDataContractAuditPropGroup } from "./workspace-data-contract-audit-prop-group";

export type WorkspaceDataContractAuditFieldPropGroup = Pick<WorkspaceDataContractAuditPropGroup,
  | "audit"
  | "onExport"
>;

export function buildWorkspaceDataContractAuditFieldProps(
  props: WorkspaceDataContractAuditFieldPropGroup
): WorkspaceDataContractAuditFieldPropGroup {
  return props;
}
