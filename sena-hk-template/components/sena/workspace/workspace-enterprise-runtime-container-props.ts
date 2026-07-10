import {
  buildWorkspaceEnterpriseRuntimeProps,
  type WorkspaceEnterpriseRuntimePropGroup
} from "./workspace-enterprise-runtime-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeAccountSecurityProps,
  workspaceEnterpriseRuntimeAccountSecurityPropKeys,
  type WorkspaceEnterpriseRuntimeAccountSecurityPropGroup
} from "./workspace-enterprise-runtime-account-security-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeCollaborationProps,
  workspaceEnterpriseRuntimeCollaborationPropKeys,
  type WorkspaceEnterpriseRuntimeCollaborationPropGroup
} from "./workspace-enterprise-runtime-collaboration-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeCollaborationProjectProps,
  workspaceEnterpriseRuntimeCollaborationProjectPropKeys,
  type WorkspaceEnterpriseRuntimeCollaborationProjectPropGroup
} from "./workspace-enterprise-runtime-collaboration-project-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeGovernanceProps,
  workspaceEnterpriseRuntimeGovernancePropKeys,
  type WorkspaceEnterpriseRuntimeGovernancePropGroup
} from "./workspace-enterprise-runtime-governance-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeOpsProps,
  workspaceEnterpriseRuntimeOpsPropKeys,
  type WorkspaceEnterpriseRuntimeOpsPropGroup
} from "./workspace-enterprise-runtime-ops-prop-group";
import {
  buildWorkspaceEnterpriseRuntimePlatformDecisionProps,
  workspaceEnterpriseRuntimePlatformDecisionPropKeys,
  type WorkspaceEnterpriseRuntimePlatformDecisionPropGroup
} from "./workspace-enterprise-runtime-platform-decision-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeProjectProps,
  workspaceEnterpriseRuntimeProjectPropKeys,
  type WorkspaceEnterpriseRuntimeProjectPropGroup
} from "./workspace-enterprise-runtime-project-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeProvisioningProps,
  workspaceEnterpriseRuntimeProvisioningPropKeys,
  type WorkspaceEnterpriseRuntimeProvisioningPropGroup
} from "./workspace-enterprise-runtime-provisioning-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeReleaseGateProps,
  workspaceEnterpriseRuntimeReleaseGatePropKeys,
  type WorkspaceEnterpriseRuntimeReleaseGatePropGroup
} from "./workspace-enterprise-runtime-release-gate-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeTeamOperationsProps,
  workspaceEnterpriseRuntimeTeamOperationsPropKeys,
  type WorkspaceEnterpriseRuntimeTeamOperationsPropGroup
} from "./workspace-enterprise-runtime-team-operations-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeUploadProps,
  workspaceEnterpriseRuntimeUploadPropKeys,
  type WorkspaceEnterpriseRuntimeUploadPropGroup
} from "./workspace-enterprise-runtime-upload-prop-group";
import {
  buildWorkspaceEnterpriseRuntimeValidationProps,
  workspaceEnterpriseRuntimeValidationPropKeys,
  type WorkspaceEnterpriseRuntimeValidationPropGroup
} from "./workspace-enterprise-runtime-validation-prop-group";

export type WorkspaceEnterpriseRuntimeContainerPropsInput = WorkspaceEnterpriseRuntimePropGroup;

function pickWorkspaceEnterpriseRuntimeProps<
  const Keys extends readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[]
>(
  props: WorkspaceEnterpriseRuntimePropGroup,
  keys: Keys
): Pick<WorkspaceEnterpriseRuntimePropGroup, Keys[number]> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    picked[String(key)] = props[key];
  }
  return picked as Pick<WorkspaceEnterpriseRuntimePropGroup, Keys[number]>;
}

export function buildWorkspaceEnterpriseRuntimeContainerProps(
  props: WorkspaceEnterpriseRuntimeContainerPropsInput
): WorkspaceEnterpriseRuntimePropGroup {
  const enterpriseRuntimeValidationProps = buildWorkspaceEnterpriseRuntimeValidationProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeValidationPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeValidationPropGroup);

  const enterpriseRuntimeProjectProps = buildWorkspaceEnterpriseRuntimeProjectProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeProjectPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeProjectPropGroup);

  const enterpriseRuntimeGovernanceProps = buildWorkspaceEnterpriseRuntimeGovernanceProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeGovernancePropKeys)
  } satisfies WorkspaceEnterpriseRuntimeGovernancePropGroup);

  const enterpriseRuntimeOpsProps = buildWorkspaceEnterpriseRuntimeOpsProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeOpsPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeOpsPropGroup);

  const enterpriseRuntimeUploadProps = buildWorkspaceEnterpriseRuntimeUploadProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeUploadPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeUploadPropGroup);

  const enterpriseRuntimeCollaborationProps = buildWorkspaceEnterpriseRuntimeCollaborationProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeCollaborationPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeCollaborationPropGroup);

  const enterpriseRuntimeProvisioningProps = buildWorkspaceEnterpriseRuntimeProvisioningProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeProvisioningPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeProvisioningPropGroup);

  const enterpriseRuntimeAccountSecurityProps = buildWorkspaceEnterpriseRuntimeAccountSecurityProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeAccountSecurityPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeAccountSecurityPropGroup);

  const enterpriseRuntimeTeamOperationsProps = buildWorkspaceEnterpriseRuntimeTeamOperationsProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeTeamOperationsPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeTeamOperationsPropGroup);

  const enterpriseRuntimePlatformDecisionProps = buildWorkspaceEnterpriseRuntimePlatformDecisionProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimePlatformDecisionPropKeys)
  } satisfies WorkspaceEnterpriseRuntimePlatformDecisionPropGroup);

  const enterpriseRuntimeReleaseGateProps = buildWorkspaceEnterpriseRuntimeReleaseGateProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeReleaseGatePropKeys)
  } satisfies WorkspaceEnterpriseRuntimeReleaseGatePropGroup);

  const enterpriseRuntimeCollaborationProjectProps = buildWorkspaceEnterpriseRuntimeCollaborationProjectProps({
    ...pickWorkspaceEnterpriseRuntimeProps(props, workspaceEnterpriseRuntimeCollaborationProjectPropKeys)
  } satisfies WorkspaceEnterpriseRuntimeCollaborationProjectPropGroup);

  return buildWorkspaceEnterpriseRuntimeProps({
    busy: props.busy,
    enterpriseContext: props.enterpriseContext,
    enterpriseMessage: props.enterpriseMessage,
    ...enterpriseRuntimeValidationProps,
    ...enterpriseRuntimeProjectProps,
    ...enterpriseRuntimeGovernanceProps,
    ...enterpriseRuntimeOpsProps,
    ...enterpriseRuntimeUploadProps,
    ...enterpriseRuntimeCollaborationProps,
    ...enterpriseRuntimeProvisioningProps,
    ...enterpriseRuntimeAccountSecurityProps,
    ...enterpriseRuntimeTeamOperationsProps,
    ...enterpriseRuntimePlatformDecisionProps,
    ...enterpriseRuntimeReleaseGateProps,
    ...enterpriseRuntimeCollaborationProjectProps,
  } satisfies WorkspaceEnterpriseRuntimePropGroup);
}
