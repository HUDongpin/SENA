import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeCollaborationPropKeys = [
  "enterpriseCollaboration",
  "enterpriseCollaborationTransport",
  "enterpriseSsoPreflight",
  "onDeliverCollaborationPubSub",
  "onRunSsoPreflight"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeCollaborationPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeCollaborationPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeCollaborationProps(
  props: WorkspaceEnterpriseRuntimeCollaborationPropGroup
): WorkspaceEnterpriseRuntimeCollaborationPropGroup {
  return props;
}
