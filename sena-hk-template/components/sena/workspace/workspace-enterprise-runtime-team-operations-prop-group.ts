import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeTeamOperationsPropKeys = [
  "enterpriseUserId",
  "enterpriseTeamState",
  "enterpriseTeamMemberships",
  "pendingEnterpriseInvitations",
  "teamInviteEmail",
  "teamInviteRole",
  "teamInviteCode",
  "onTeamInviteEmailChange",
  "onTeamInviteRoleChange",
  "onTeamInviteCodeChange",
  "onRefreshTeamState",
  "onCreateTeamInvitation",
  "onAcceptTeamInvitation",
  "onUpdateTeamMembership",
  "onRevokeTeamInvitation"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeTeamOperationsPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeTeamOperationsPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeTeamOperationsProps(
  props: WorkspaceEnterpriseRuntimeTeamOperationsPropGroup
): WorkspaceEnterpriseRuntimeTeamOperationsPropGroup {
  return props;
}
