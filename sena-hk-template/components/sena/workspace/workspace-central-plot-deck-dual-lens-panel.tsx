import { DualLensDashboard } from "./dual-lens-dashboard";
import type { CentralDualLensViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";

export function CentralDualLensViewPanel({
  model,
  enaManifest,
  snaManifest,
  activeTemporalWindow,
  activeTemporalIndex,
  temporalWindows
}: CentralDualLensViewPanelProps) {
  return (
    <DualLensDashboard
      model={model}
      enaManifest={enaManifest}
      snaManifest={snaManifest}
      activeWindow={activeTemporalWindow}
      activeWindowIndex={activeTemporalIndex}
      windowCount={temporalWindows.length}
      surface="central"
    />
  );
}
