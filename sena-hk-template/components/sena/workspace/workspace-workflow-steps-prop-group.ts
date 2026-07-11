import type { WorkspaceLeftRailPanelSectionProps } from "./workspace-left-rail-panel-section";

export type WorkspaceWorkflowStepPropGroup =
  WorkspaceLeftRailPanelSectionProps["workflowStepStates"];

export function buildWorkspaceWorkflowStepProps(
  props: WorkspaceWorkflowStepPropGroup
): WorkspaceWorkflowStepPropGroup {
  return props;
}
