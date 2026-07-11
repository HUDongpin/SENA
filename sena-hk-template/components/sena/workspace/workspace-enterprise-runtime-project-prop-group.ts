import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeProjectPropKeys = [
  "activeEnterpriseProjectId",
  "enterpriseProjects",
  "onProjectChange",
  "onSaveEnterpriseProject",
  "onRunEnterpriseAnalysis",
  "onRefreshEnterpriseState",
  "onExportEnterpriseCleaningManifestJson"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeProjectPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeProjectPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeProjectProps(
  props: WorkspaceEnterpriseRuntimeProjectPropGroup
): WorkspaceEnterpriseRuntimeProjectPropGroup {
  return props;
}
