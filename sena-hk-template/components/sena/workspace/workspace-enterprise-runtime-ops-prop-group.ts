import type { WorkspaceEnterpriseRuntimePropGroup } from "./workspace-enterprise-runtime-prop-group";

export const workspaceEnterpriseRuntimeOpsPropKeys = [
  "canSubmitAttestation",
  "onExportOpsStatusJson",
  "onExportOpsReadinessJson",
  "onExportDeploymentPackageJson",
  "onExportCapabilityAuditJson",
  "onExportIdentityProductionEvidenceJson",
  "onExportSaasOperationsReadinessJson",
  "onExportGoLiveRehearsalJson",
  "onExportGoLiveRollbackDrillJson",
  "onExportGoLiveMonitorJson",
  "onApplyGoLiveRehearsalDraft",
  "onSubmitGoLiveAttestation",
  "onExportGoLiveAttestationsJson",
  "onExportReleaseGateReviewsJson",
  "onExportOpsAlertsJson",
  "onDeliverOpsAlerts"
] as const satisfies readonly (keyof WorkspaceEnterpriseRuntimePropGroup)[];

export type WorkspaceEnterpriseRuntimeOpsPropGroup = Pick<
  WorkspaceEnterpriseRuntimePropGroup,
  typeof workspaceEnterpriseRuntimeOpsPropKeys[number]
>;

export function buildWorkspaceEnterpriseRuntimeOpsProps(
  props: WorkspaceEnterpriseRuntimeOpsPropGroup
): WorkspaceEnterpriseRuntimeOpsPropGroup {
  return props;
}
