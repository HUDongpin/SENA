import { Maximize2 } from "lucide-react";
import type { SenaPlotView } from "./plot-tools-panel";
import {
  ActivePlotViewToolbar,
  FusionPlotZoomControls
} from "./workspace-shell-panels";

export type CentralPlotDeckShellActionProps = {
  fusionPlotZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onMaximizeFusionPlot: () => void;
};

export function CentralPlotDeckShellAction({
  fusionPlotZoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onMaximizeFusionPlot
}: CentralPlotDeckShellActionProps) {
  return (
    <div className="flex items-center gap-2">
      <FusionPlotZoomControls
        zoom={fusionPlotZoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onReset={onZoomReset}
        testScope="central"
      />
      <button
        type="button"
        data-testid="maximize-fusion-plot"
        data-visual-role="fusion-plot-maximize-control"
        onClick={onMaximizeFusionPlot}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-400/70 bg-white/78 px-3 text-[0.68rem] font-black normal-case text-slate-800 shadow-[0_6px_16px_rgb(15_23_42/0.1)] transition hover:border-cyanGlow/70 hover:bg-white hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Maximize
      </button>
    </div>
  );
}

export type CentralPlotDeckActiveViewToolbarProps = {
  activePlotView: SenaPlotView;
  isPlotSwitcherOpen: boolean;
  onPlotSwitcherToggle: () => void;
  onPlotViewSelect: (view: SenaPlotView) => void;
  plotViewOptions: Array<{ id: SenaPlotView; label: string; detail: string }>;
  className?: string;
};

export function CentralPlotDeckActiveViewToolbar({
  activePlotView,
  isPlotSwitcherOpen,
  onPlotSwitcherToggle,
  onPlotViewSelect,
  plotViewOptions,
  className
}: CentralPlotDeckActiveViewToolbarProps) {
  return (
    <ActivePlotViewToolbar
      active={activePlotView}
      isOpen={isPlotSwitcherOpen}
      onToggle={onPlotSwitcherToggle}
      onSelect={onPlotViewSelect}
      plotViewOptions={plotViewOptions}
      className={className}
    />
  );
}
