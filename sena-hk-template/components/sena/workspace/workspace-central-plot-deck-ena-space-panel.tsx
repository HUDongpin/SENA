import { SenaEnaSpacePlot } from "./ena-space-plot";
import { ActivePlotViewToolbar } from "./workspace-shell-panels";
import type { CentralEnaSpaceViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";

export function CentralEnaSpaceViewPanel({
  model,
  enaManifest,
  layers,
  threshold,
  selectedId,
  onCanvasSelect,
  fusionPlotZoom,
  activePlotView,
  isPlotSwitcherOpen,
  onPlotSwitcherToggle,
  onPlotViewSelect,
  plotViewOptions
}: CentralEnaSpaceViewPanelProps) {
  return (
    <section
      data-testid="workspace-primary-plot"
      data-visual-role="workspace-primary-plot"
      className="grid min-h-0 gap-3"
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600">
        ENA Space uses jENA projected unit points and code node positions from the local JavaScript runtime.
      </div>
      <div
        data-testid="central-ena-space-canvas-frame"
        data-visual-role="ena-space-current-window-frame"
        className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3"
      >
        <SenaEnaSpacePlot
          model={model}
          enaManifest={enaManifest}
          layers={layers}
          threshold={threshold}
          selectedId={selectedId}
          onSelect={onCanvasSelect}
          zoom={fusionPlotZoom}
          className="h-[min(48dvh,34rem)] min-h-[22rem]"
        />
      </div>
      <ActivePlotViewToolbar
        active={activePlotView}
        isOpen={isPlotSwitcherOpen}
        onToggle={onPlotSwitcherToggle}
        onSelect={onPlotViewSelect}
        plotViewOptions={plotViewOptions}
      />
    </section>
  );
}
