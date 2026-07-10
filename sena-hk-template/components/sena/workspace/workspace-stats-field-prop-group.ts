import type { WorkspaceStatsPropGroup } from "./workspace-stats-prop-group";

export type WorkspaceStatsFieldPropGroup = Pick<WorkspaceStatsPropGroup,
  | "model"
  | "enaManifest"
  | "snaManifest"
  | "runtimeConsistencyAudit"
  | "methodValidation"
  | "methodProtocol"
  | "icon"
  | "onSelect"
  | "onExportSocialReport"
  | "onExportEnaManifestJson"
  | "onExportSnaManifestJson"
  | "onExportPairReport"
  | "onExportMetricProvenance"
  | "onExportMethodProtocol"
>;

export function buildWorkspaceStatsFieldProps(
  props: WorkspaceStatsFieldPropGroup
): WorkspaceStatsFieldPropGroup {
  return props;
}
