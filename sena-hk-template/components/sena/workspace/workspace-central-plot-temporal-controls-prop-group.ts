import type { WorkspaceCentralPlotDeckPropGroup } from "./workspace-central-plot-deck-prop-group";

export type WorkspaceCentralPlotTemporalControlsPropGroup = Pick<WorkspaceCentralPlotDeckPropGroup,
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

export function buildWorkspaceCentralPlotTemporalControlsProps(
  props: WorkspaceCentralPlotTemporalControlsPropGroup
): WorkspaceCentralPlotTemporalControlsPropGroup {
  return props;
}
