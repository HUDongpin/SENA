import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeProvisioningPropKeys = [
  "enterpriseDeploymentPackage",
  "identityProductionHandoff",
  "platformRequestPacket",
  "institutionActionPlan",
  "identityCutoverChecklist",
  "provisioningDeploymentEnv",
  "provisioningServiceEndpoints",
  "identityProductionServiceEndpoint",
  "provisioningOwnerDecision",
  "provisioningGovernanceCheck",
  "onRefreshProvisioningReadiness",
  "onApplyIdentityRequestToPlatformDecision"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeProvisioningPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeProvisioningPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeProvisioningProps(
  props: WorkspaceEnterpriseRuntimeProvisioningPropGroup
): WorkspaceEnterpriseRuntimeProvisioningPropGroup {
  return props;
}
