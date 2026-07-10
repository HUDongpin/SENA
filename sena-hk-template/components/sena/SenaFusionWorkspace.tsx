"use client";

import { renderWorkspaceMainShell } from "./workspace/workspace-main-shell-render";
import { useSenaFusionWorkspaceMainShellProps } from "./workspace/use-sena-fusion-workspace-main-shell-props";

export function SenaFusionWorkspace() {
  const workspaceMainShellSectionProps = useSenaFusionWorkspaceMainShellProps();
  return renderWorkspaceMainShell(workspaceMainShellSectionProps);
}
