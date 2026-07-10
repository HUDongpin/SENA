import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeGovernancePropKeys = [
  "enterpriseTeamState",
  "enterpriseNotifications",
  "unreadEnterpriseNotificationCount",
  "onExportGovernanceHealthJson",
  "onExportSecurityPostureJson",
  "onExportAuditCsv",
  "onExportBackupJson",
  "onDeliverAuditLog",
  "onDeliverBackup",
  "onSyncDatabase",
  "onRefreshNotifications",
  "onDeliverNotifications",
  "onDeliverEmails",
  "onMarkNotificationRead"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeGovernancePropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeGovernancePropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeGovernanceProps(
  props: WorkspaceEnterpriseRuntimeGovernancePropGroup
): WorkspaceEnterpriseRuntimeGovernancePropGroup {
  return props;
}
