import type { WorkspaceHeaderPropGroup } from "./workspace-header-prop-group";

export type WorkspaceHeaderBoundaryCompositionFieldPropGroup = Pick<WorkspaceHeaderPropGroup, keyof WorkspaceHeaderPropGroup>;

export function buildWorkspaceHeaderBoundaryCompositionFieldProps(
  props: WorkspaceHeaderBoundaryCompositionFieldPropGroup
): WorkspaceHeaderBoundaryCompositionFieldPropGroup {
  return props;
}
