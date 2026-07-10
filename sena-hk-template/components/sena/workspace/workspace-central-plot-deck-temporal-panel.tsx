import { TemporalWindowBuilder } from "./temporal-window-builder";
import type { CentralTemporalPlotViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";

export function CentralTemporalPlotViewPanel({
  model,
  temporalMode,
  onTemporalModeChange,
  movingWindowSize,
  onMovingWindowSizeChange,
  movingWindowStep,
  onMovingWindowStepChange,
  turnWindowRadius,
  onTurnWindowRadiusChange,
  temporalWindows,
  temporalRuntimeTrace,
  activeTemporalIndex,
  onActiveTemporalIndexChange,
  isAnimating,
  onAnimationToggle,
  animationMs,
  onAnimationMsChange
}: CentralTemporalPlotViewPanelProps) {
  return (
    <div className="grid gap-4">
      <TemporalWindowBuilder
        mode={temporalMode}
        onModeChange={onTemporalModeChange}
        movingWindowSize={movingWindowSize}
        onMovingWindowSizeChange={onMovingWindowSizeChange}
        movingWindowStep={movingWindowStep}
        onMovingWindowStepChange={onMovingWindowStepChange}
        turnWindowRadius={turnWindowRadius}
        onTurnWindowRadiusChange={onTurnWindowRadiusChange}
        windows={temporalWindows}
        people={model.people}
        codes={model.codes}
        temporalRuntimeTrace={temporalRuntimeTrace}
        activeIndex={activeTemporalIndex}
        onActiveIndexChange={onActiveTemporalIndexChange}
        isAnimating={isAnimating}
        onAnimationToggle={onAnimationToggle}
        animationMs={animationMs}
        onAnimationMsChange={onAnimationMsChange}
      />
    </div>
  );
}
