import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimePlatformDecisionPropKeys = [
  "enterprisePlatformDecisionState",
  "selectedPlatformDecision",
  "selectedPlatformDecisionProductionEvidenceItems",
  "latestPlatformDecisionAcceptance",
  "platformDecisionId",
  "platformDecisionStatus",
  "platformDecisionAcceptBridge",
  "platformDecisionOwnerName",
  "platformDecisionOwnerRole",
  "platformDecisionEnvironment",
  "platformDecisionEvidenceUrl",
  "platformDecisionProductionEvidenceIds",
  "platformDecisionProductionEvidenceVerifiedAt",
  "platformDecisionNotes",
  "platformDecisionRequiresIdentityEvidenceUrl",
  "platformDecisionRequiresIdentityEvidenceTimestamp",
  "onRefreshPlatformDecisionState",
  "onExportPlatformDecisionRegisterJson",
  "onExportNativeAdapterCertificationJson",
  "onPlatformDecisionIdChange",
  "onPlatformDecisionStatusChange",
  "onPlatformDecisionAcceptBridgeChange",
  "onPlatformDecisionOwnerNameChange",
  "onPlatformDecisionOwnerRoleChange",
  "onPlatformDecisionEnvironmentChange",
  "onPlatformDecisionEvidenceUrlChange",
  "onPlatformDecisionProductionEvidenceIdsChange",
  "onPlatformDecisionProductionEvidenceVerifiedAtChange",
  "onPlatformDecisionNotesChange",
  "onSubmitPlatformDecisionReview"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimePlatformDecisionPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimePlatformDecisionPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimePlatformDecisionProps(
  props: WorkspaceEnterpriseRuntimePlatformDecisionPropGroup
): WorkspaceEnterpriseRuntimePlatformDecisionPropGroup {
  return props;
}
