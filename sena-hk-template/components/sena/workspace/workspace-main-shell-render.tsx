import { WorkspaceMainShellSection } from "./workspace-main-shell-section";
import type { WorkspaceMainShellPropGroup } from "./workspace-main-shell-prop-group";

export type WorkspaceMainShellRenderProps = WorkspaceMainShellPropGroup;

export function renderWorkspaceMainShell(props: WorkspaceMainShellRenderProps) {
  return <WorkspaceMainShellSection {...props} />;
}
