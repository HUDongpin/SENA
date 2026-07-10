import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeUploadPropKeys = [
  "enterpriseUploadStorage",
  "enterpriseUploadVerification",
  "enterpriseUploads",
  "latestEnterpriseUpload",
  "fileAccept",
  "onFileInputChange",
  "onRefreshUploadStorage",
  "onDeliverUploadObjectStorage"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeUploadPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeUploadPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeUploadProps(
  props: WorkspaceEnterpriseRuntimeUploadPropGroup
): WorkspaceEnterpriseRuntimeUploadPropGroup {
  return props;
}
