import type { WorkspaceHeaderExportPropGroup } from "./workspace-header-export-prop-group";
import type { WorkspaceHeaderTemporalSummaryPropGroup } from "./workspace-header-temporal-summary-prop-group";

export type WorkspaceHeaderCompositionFieldPropGroup =
  WorkspaceHeaderTemporalSummaryPropGroup
  & WorkspaceHeaderExportPropGroup;

export function buildWorkspaceHeaderCompositionFieldProps(
  props: WorkspaceHeaderCompositionFieldPropGroup
): WorkspaceHeaderCompositionFieldPropGroup {
  return props;
}
