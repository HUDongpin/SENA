import { Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SenaEnaManifest,
  SenaLayer,
  SenaLayoutMode,
  SenaModel
} from "./analysis-runtime";
import { Canvas } from "./fusion-canvas";
import type { SenaJointEmbeddingOperator } from "./fusion-layout";
import { JointEmbeddingProvenanceStrip } from "./runtime-provenance-panels";
import { FusionPlotZoomControls } from "./workspace-shell-panels";

function formatPlotNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function FusionPlotCompactKey({
  model,
  layers,
  threshold,
  alpha,
  beta,
  gamma
}: {
  model: SenaModel;
  layers: Record<SenaLayer, boolean>;
  threshold: number;
  alpha: number;
  beta: number;
  gamma: number;
}) {
  const layerCounts = {
    social: model.edges.filter((edge) => edge.layer === "social" && edge.normalizedWeight >= threshold).length,
    concept: model.edges.filter((edge) => edge.layer === "concept" && edge.normalizedWeight >= threshold).length,
    bridge: model.edges.filter((edge) => edge.layer === "bridge" && edge.normalizedWeight >= threshold).length
  };
  const activeGPairs = model.pairReport.filter((pair) => pair.totalContribution > 0).length;
  const items = [
    {
      token: "S",
      label: "SNA arcs",
      value: layerCounts.social,
      weight: `alpha ${formatPlotNumber(alpha)}`,
      active: layers.social,
      className: "border-blue-300 bg-blue-50 text-blue-900"
    },
    {
      token: "W",
      label: "ENA mesh",
      value: layerCounts.concept,
      weight: `beta ${formatPlotNumber(beta)}`,
      active: layers.concept,
      className: "border-violet-300 bg-violet-50 text-violet-900"
    },
    {
      token: "B",
      label: "Bridge ribbons",
      value: layerCounts.bridge,
      weight: `gamma ${formatPlotNumber(gamma)}`,
      active: layers.bridge,
      className: "border-cyan-300 bg-cyan-50 text-cyan-900"
    },
    {
      token: "G",
      label: "Pair contribution",
      value: activeGPairs,
      weight: "temporal trace",
      active: true,
      className: "border-rose-300 bg-rose-50 text-rose-900"
    }
  ];

  return (
    <div
      data-testid="fusion-maximized-compact-key"
      data-visual-role="fusion-maximized-compact-key"
      className="grid gap-2 rounded-lg border border-slate-200 bg-white/86 p-2 shadow-[0_8px_22px_rgb(15_23_42/0.08)] sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => (
        <div
          key={item.token}
          className={cn("flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2", item.className, !item.active && "opacity-45")}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-xs font-black text-slate-800">
              {item.token}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-black text-slate-950">{item.label}</span>
              <span className="block truncate text-[0.68rem] font-bold text-slate-600">{item.weight}</span>
            </span>
          </div>
          <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-800">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function FusionPlotMaximizedOverlay({
  model,
  layout,
  jointEmbeddingOperator,
  onJointEmbeddingOperatorChange,
  enaManifest,
  layers,
  threshold,
  selectedId,
  revealedLabelIds,
  onSelect,
  onClose,
  activeWindowLabel,
  activeTurnLabel,
  alpha,
  beta,
  gamma,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset
}: {
  model: SenaModel;
  layout: SenaLayoutMode;
  jointEmbeddingOperator: SenaJointEmbeddingOperator;
  onJointEmbeddingOperatorChange: (operator: SenaJointEmbeddingOperator) => void;
  enaManifest: SenaEnaManifest;
  layers: Record<SenaLayer, boolean>;
  threshold: number;
  selectedId: string;
  revealedLabelIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  activeWindowLabel: string;
  activeTurnLabel: string;
  alpha: number;
  beta: number;
  gamma: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  return (
    <div
      data-testid="fusion-plot-maximized-overlay"
      data-visual-role="fusion-plot-maximized-window"
      role="dialog"
      aria-modal="true"
      aria-label="Maximized Fusion Plot"
      className="fixed inset-0 z-[80] bg-slate-950/62 p-3 backdrop-blur-sm sm:p-5"
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-white/25 bg-[#e8edf3] shadow-[0_24px_80px_rgb(2_6_23/0.45)]">
        <div className="flex min-h-16 flex-col gap-3 border-b border-slate-300 bg-white/82 px-4 py-3 shadow-[0_1px_0_rgb(255_255_255/0.75)_inset] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-black uppercase tracking-[0.01em] text-slate-500">Fusion Plot - Current Window</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-600">
              <span>A1 Inner Solid Mesh</span>
              <span>{activeWindowLabel}</span>
              <span>Turns {activeTurnLabel}</span>
              <span>Threshold {formatPlotNumber(threshold)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <FusionPlotZoomControls
              zoom={zoom}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onReset={onZoomReset}
              testScope="maximized"
              className="h-9"
            />
            <button
              type="button"
              data-testid="restore-fusion-plot"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 shadow-[0_8px_18px_rgb(15_23_42/0.08)] transition hover:border-cyanGlow/60 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            >
              <Minimize2 className="h-4 w-4" />
              Restore
            </button>
            <button
              type="button"
              data-testid="close-fusion-plot-maximized"
              aria-label="Close maximized Fusion Plot"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-[0_8px_18px_rgb(15_23_42/0.08)] transition hover:border-rose-300 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-auto p-3 sm:p-4">
          <FusionPlotCompactKey model={model} layers={layers} threshold={threshold} alpha={alpha} beta={beta} gamma={gamma} />
          {layout === "joint" && (
            <JointEmbeddingProvenanceStrip
              model={model}
              operator={jointEmbeddingOperator}
              onOperatorChange={onJointEmbeddingOperatorChange}
            />
          )}
          <div className="min-h-0 overflow-hidden rounded-lg border border-slate-300/80 bg-slate-50 shadow-[0_16px_38px_rgb(15_23_42/0.12)]">
            <Canvas
              model={model}
              layout={layout}
              jointEmbeddingOperator={jointEmbeddingOperator}
              enaManifest={enaManifest}
              layers={layers}
              threshold={threshold}
              selectedId={selectedId}
              revealedLabelIds={revealedLabelIds}
              onSelect={onSelect}
              zoom={zoom}
              className="h-[calc(100vh-14rem)] min-h-[34rem]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
