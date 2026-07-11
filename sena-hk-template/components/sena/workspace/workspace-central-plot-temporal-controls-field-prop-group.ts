import type { WorkspaceCentralPlotTemporalControlsPropGroup } from "./workspace-central-plot-temporal-controls-prop-group";

export type WorkspaceCentralPlotTemporalControlsFieldPropGroup = Pick<WorkspaceCentralPlotTemporalControlsPropGroup,
  | "activeTemporalIndex"
  | "onActiveTemporalIndexChange"
  | "temporalWindows"
  | "temporalMode"
  | "onTemporalModeChange"
  | "movingWindowSize"
  | "onMovingWindowSizeChange"
  | "movingWindowStep"
  | "onMovingWindowStepChange"
  | "turnWindowRadius"
  | "onTurnWindowRadiusChange"
  | "temporalRuntimeTrace"
  | "isAnimating"
  | "onAnimationToggle"
  | "animationMs"
  | "onAnimationMsChange"
>;

export function buildWorkspaceCentralPlotTemporalControlsFieldProps(
  props: WorkspaceCentralPlotTemporalControlsFieldPropGroup
): WorkspaceCentralPlotTemporalControlsFieldPropGroup {
  return props;
}
