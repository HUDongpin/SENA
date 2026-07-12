import type { ReactNode } from "react";
import {
  Activity,
  ChevronDown,
  Eye,
  EyeOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SenaLayer,
  SenaNormalization,
  SenaTemporalMode
} from "./analysis-runtime";
import type {
  ModelBuilderLayerCopy,
  ModelBuilderLayoutOption
} from "./model-builder-panel";
import {
  Panel,
  Slider
} from "./workspace-primitives";

export type SenaPlotView = "temporal" | "fusion" | "dual" | "ena" | "sna" | "evidence" | "matrix";

export type PlotViewOption = {
  id: SenaPlotView;
  label: string;
  detail: string;
};

export type TemporalModeOption = {
  value: SenaTemporalMode;
  label: string;
};

export type PlotToolsPanelProps = {
  layoutOptions: ModelBuilderLayoutOption[];
  layout: ModelBuilderLayoutOption["value"];
  onLayoutChange: (value: ModelBuilderLayoutOption["value"]) => void;
  plotViewOptions: PlotViewOption[];
  activePlotView: SenaPlotView;
  layers: Record<SenaLayer, boolean>;
  layerCopy: ModelBuilderLayerCopy;
  onLayerToggle: (layer: SenaLayer) => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
  temporalModeOptions: TemporalModeOption[];
  temporalMode: SenaTemporalMode;
  onTemporalModeChange: (mode: SenaTemporalMode) => void;
  isAdvancedOpen: boolean;
  onAdvancedToggle: () => void;
  alpha: number;
  beta: number;
  gamma: number;
  normalization: SenaNormalization;
  onAlphaChange: (value: number) => void;
  onBetaChange: (value: number) => void;
  onGammaChange: (value: number) => void;
  onNormalizationChange: (value: SenaNormalization) => void;
};

function WorkspaceToolSection({
  testId,
  title,
  detail,
  children
}: {
  testId: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      data-visual-role="webena-plot-tools-section"
      className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3"
    >
      <div>
        <div className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-slate-500">{title}</div>
        <div className="mt-1 text-xs font-bold leading-5 text-slate-500">{detail}</div>
      </div>
      {children}
    </section>
  );
}

function WorkspaceSecondaryDrawer({
  testId,
  visualRole,
  title,
  detail,
  isOpen,
  onToggle,
  children
}: {
  testId: string;
  visualRole: string;
  title: string;
  detail: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      data-visual-role={visualRole}
      data-open={String(isOpen)}
      className="overflow-hidden rounded border border-slate-300 bg-white"
    >
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 bg-[#252525] px-3 py-2 text-left text-white transition hover:bg-[#303030] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        <span className="min-w-0">
          <span className="block text-[0.68rem] font-black uppercase tracking-[0.1em]">{title}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-white/62">{detail}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#56b09d] transition", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div data-testid={`${testId}-content`} className="grid gap-3 border-t border-[#56b09d] bg-slate-50 p-3">
          {children}
        </div>
      )}
    </section>
  );
}

export function PlotToolsPanel({
  layoutOptions,
  layout,
  onLayoutChange,
  plotViewOptions,
  activePlotView,
  layers,
  layerCopy,
  onLayerToggle,
  threshold,
  onThresholdChange,
  temporalModeOptions,
  temporalMode,
  onTemporalModeChange,
  isAdvancedOpen,
  onAdvancedToggle,
  alpha,
  beta,
  gamma,
  normalization,
  onAlphaChange,
  onBetaChange,
  onGammaChange,
  onNormalizationChange
}: PlotToolsPanelProps) {
  const activePlotViewOption = plotViewOptions.find((option) => option.id === activePlotView) ?? plotViewOptions[0];
  return (
    <Panel id="workspace-plot-tools-panel" title="Plot Tools" icon={Activity} className="p-4">
      <div className="grid gap-4">
        <WorkspaceToolSection
          testId="plot-tools-dimensions-section"
          title="Dimensions"
          detail="Choose the coordinate frame used by the central plot."
        >
          {layoutOptions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                data-testid={`plot-layout-${item.value}`}
                onClick={() => onLayoutChange(item.value)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition",
                  layout === item.value ? "border-cyanGlow/60 bg-cyanGlow/12 text-slate-950" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-950"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-sm font-black">{item.label}</span>
                  <span className="block text-xs font-semibold leading-5">{item.note}</span>
                </span>
              </button>
            );
          })}
        </WorkspaceToolSection>

        <WorkspaceToolSection
          testId="plot-tools-plotted-points-section"
          title="Plotted Points"
          detail="The central plot follows the Plots bar at the top of the workspace."
        >
          <div
            data-testid="plot-tools-active-view-summary"
            className="rounded border border-cyanGlow/60 bg-cyanGlow/12 px-3 py-2"
          >
            <span className="block text-[0.62rem] font-black uppercase tracking-[0.08em] text-slate-500">Active view</span>
            <span className="mt-0.5 block text-sm font-black text-slate-950">{activePlotViewOption.label}</span>
            <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-600">{activePlotViewOption.detail}</span>
          </div>
          <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-500">
            Close this panel to switch among the {plotViewOptions.length} plot views from the Plots bar above the canvas.
          </div>
        </WorkspaceToolSection>

        <WorkspaceToolSection
          testId="plot-tools-network-graph-section"
          title="Network Graph"
          detail="Tune visible S/W/B layers and minimum edge weight."
        >
          {(["social", "concept", "bridge"] as SenaLayer[]).map((layer) => {
            const Icon = layers[layer] ? Eye : EyeOff;
            return (
              <button
                key={layer}
                type="button"
                data-testid={`plot-layer-${layer}-toggle`}
                onClick={() => onLayerToggle(layer)}
                className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-black", layerCopy[layer].className, !layers[layer] && "opacity-50")}
              >
                <span>{layerCopy[layer].label}</span>
                <Icon className="h-4 w-4" />
              </button>
            );
          })}

          <Slider label="Edge threshold" value={threshold} testId="plot-edge-threshold-slider" onChange={onThresholdChange} />
          <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-500">
            S/W/B line widths scale within each visible layer; the threshold filters low-salience graph ties before inspection.
          </div>
        </WorkspaceToolSection>

        <WorkspaceToolSection
          testId="plot-tools-temporal-framing-section"
          title="Temporal Framing"
          detail="Set the active window logic used by Fusion and Temporal views."
        >
          <div className="grid grid-cols-3 gap-2 rounded border border-slate-200 bg-white p-2">
            {temporalModeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`plot-temporal-mode-${option.value}`}
                onClick={() => onTemporalModeChange(option.value)}
                className={cn(
                  "rounded-md px-2 py-2 text-xs font-black transition",
                  temporalMode === option.value ? "bg-cyanGlow text-slate-950" : "text-slate-500 hover:bg-white hover:text-slate-950"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </WorkspaceToolSection>

        <WorkspaceSecondaryDrawer
          testId="plot-tools-advanced-drawer"
          visualRole="webena-plot-tools-advanced-drawer"
          title="Advanced Options"
          detail="Weights, normalization, and line intensity"
          isOpen={isAdvancedOpen}
          onToggle={onAdvancedToggle}
        >
          <Slider label="alpha - SNA" value={alpha} testId="plot-alpha-slider" onChange={onAlphaChange} />
          <Slider label="beta - ENA" value={beta} testId="plot-beta-slider" onChange={onBetaChange} />
          <Slider label="gamma - Bridge" value={gamma} testId="plot-gamma-slider" onChange={onGammaChange} />
          <label className="grid gap-2 text-sm font-black text-slate-950">
            Normalization
            <select
              data-testid="plot-normalization-select"
              value={normalization}
              onChange={(event) => onNormalizationChange(event.currentTarget.value as SenaNormalization)}
              className="h-10 rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-cyanGlow"
            >
              <option value="max">Max scaling</option>
              <option value="frobenius">Frobenius scaling</option>
              <option value="log1p-max">Log1p + max scaling</option>
            </select>
          </label>
        </WorkspaceSecondaryDrawer>
      </div>
    </Panel>
  );
}
