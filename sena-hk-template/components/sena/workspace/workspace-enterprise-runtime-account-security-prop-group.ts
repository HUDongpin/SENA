import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeAccountSecurityPropKeys = [
  "enterpriseMfaStatus",
  "enterpriseMfaSetup",
  "enterpriseMfaEnableCode",
  "enterpriseMfaDisableCode",
  "enterpriseSessionList",
  "onStartMfaSetup",
  "onLogoutSession",
  "onMfaEnableCodeChange",
  "onEnableMfa",
  "onMfaDisableCodeChange",
  "onDisableMfa",
  "onRefreshSessionList",
  "onRevokeSession"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeAccountSecurityPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeAccountSecurityPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeAccountSecurityProps(
  props: WorkspaceEnterpriseRuntimeAccountSecurityPropGroup
): WorkspaceEnterpriseRuntimeAccountSecurityPropGroup {
  return props;
}
