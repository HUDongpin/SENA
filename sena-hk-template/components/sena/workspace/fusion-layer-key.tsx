import { cn } from "@/lib/utils";
import type { SenaLayer, SenaLayoutMode, SenaModel } from "./analysis-runtime";

type LayerVisibility = Record<SenaLayer, boolean>;

/**
 * The name of the coordinate frame currently on screen.
 *
 * It lives in this leaf module because two surfaces caption the same figure —
 * this key under the inline plot and the maximized overlay's grammar chip — and
 * a figure that is called one thing at one size and another thing at another is
 * the mislabeling ADR 0009 treats as a correctness bug, not a copy nit. An
 * omitted layout keeps the historical A1 caption so a caller that has no layout
 * to give is unchanged rather than silently renamed.
 */
export function fusionGrammarLabel(layout?: SenaLayoutMode) {
  if (layout === "plane-orbit") return "Fusion Plane + Orbit";
  if (layout === "ena-space") return "ENA Space";
  return "A1 Inner Solid Mesh";
}

function formatLegendNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function RankedList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-black text-foreground">{title}</h4>
      <div className="grid gap-2">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No values yet.</div>
        ) : rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[1fr_4rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-bold text-foreground/86">{label}</span>
            <span className="text-right font-black text-cyanGlow">{formatLegendNumber(value, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FusionLayerKey({
  model,
  layers,
  threshold,
  alpha,
  beta,
  gamma,
  layout
}: {
  model: SenaModel;
  layers: LayerVisibility;
  threshold: number;
  alpha: number;
  beta: number;
  gamma: number;
  /** Which grammar the figure above this key is drawn in; omitted reads as A1. */
  layout?: SenaLayoutMode;
}) {
  const layerCounts = {
    social: model.edges.filter((edge) => edge.layer === "social" && edge.normalizedWeight >= threshold).length,
    concept: model.edges.filter((edge) => edge.layer === "concept" && edge.normalizedWeight >= threshold).length,
    bridge: model.edges.filter((edge) => edge.layer === "bridge" && edge.normalizedWeight >= threshold).length
  };
  const activeGPairs = model.pairReport.filter((pair) => pair.totalContribution > 0).length;
  const strongestGPair = [...model.pairReport].sort((a, b) => b.totalContribution - a.totalContribution)[0];
  const items = [
    {
      id: "s",
      token: "S",
      label: "SNA outer arcs",
      detail: "person-person ties",
      count: layerCounts.social,
      weight: `alpha ${formatLegendNumber(alpha)}`,
      active: layers.social,
      className: "border-blue-300 bg-blue-50 text-blue-800",
      lineClassName: "bg-[#2f73ff] shadow-[0_0_12px_rgba(47,115,255,0.35)]",
      visualRole: "fusion-layer-key-social"
    },
    {
      id: "w",
      token: "W",
      label: "W solid ENA mesh",
      detail: "code-code co-occurrence",
      count: layerCounts.concept,
      weight: `beta ${formatLegendNumber(beta)}`,
      active: layers.concept,
      className: "border-violet-300 bg-violet-50 text-violet-800",
      lineClassName: "bg-gradient-to-r from-[#735cf6] to-[#b14cf1] shadow-[0_0_12px_rgba(137,93,255,0.35)]",
      visualRole: "fusion-layer-key-ena"
    },
    {
      id: "b",
      token: "B",
      label: "B bridge ribbons",
      detail: "person-code contribution",
      count: layerCounts.bridge,
      weight: `gamma ${formatLegendNumber(gamma)}`,
      active: layers.bridge,
      className: "border-cyan-300 bg-cyan-50 text-cyan-800",
      lineClassName: "bg-gradient-to-r from-cyanGlow via-violetGlow to-fuchsia-400 opacity-80",
      visualRole: "fusion-layer-key-bridge"
    },
    {
      id: "g",
      token: "G",
      label: "G pair contribution",
      detail: strongestGPair ? strongestGPair.label : "person-code-pair drivers",
      count: activeGPairs,
      weight: "temporal trace",
      active: true,
      className: "border-rose-300 bg-rose-50 text-rose-800",
      lineClassName: "bg-gradient-to-r from-rose-400 to-fuchsia-400 shadow-[0_0_12px_rgba(251,113,133,0.28)]",
      visualRole: "fusion-layer-key-g"
    }
  ];

  return (
    <div data-testid="fusion-layer-key" data-visual-role="fusion-layer-key-a1" className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-2 text-xs font-black text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/*
            The attribute stays `fusion-layer-key-a1` on purpose: the production
            contract pins it, and a marker rename is a separate, contract-level
            change from telling the reader the truth about the figure.
          */}
          <div className="uppercase text-slate-950">{fusionGrammarLabel(layout)}</div>
          <div className="mt-1 font-semibold normal-case text-slate-600">{"A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]"}</div>
        </div>
        <div data-testid="fusion-layer-key-threshold" className="inline-flex w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-950">
          Threshold {formatLegendNumber(threshold)}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.id}
            data-visual-role={item.visualRole}
            className={cn("grid min-h-28 gap-2 rounded-lg border p-3 text-xs", item.className, !item.active && "opacity-45")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300 bg-white font-black text-slate-700">
                {item.token}
              </span>
              <span className="rounded-full border border-slate-300 bg-white px-2 py-1 font-black text-slate-700">{item.count}</span>
            </div>
            <span className={cn("h-1.5 w-full rounded-full", item.lineClassName)} />
            <div>
              <div className="font-black text-slate-950">{item.label}</div>
              <div className="mt-1 font-semibold leading-5 text-slate-600">{item.detail}</div>
              <div className="mt-1 font-black text-slate-700">{item.weight}</div>
            </div>
          </div>
        ))}
      </div>
      <div data-testid="fusion-layer-key-line-weight-note" data-visual-role="fusion-layer-key-line-weight-note" className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
        Line thickness is layer-relative salience; selected edges expose raw, normalized, scaled, salience, and stroke-width provenance.
      </div>
    </div>
  );
}
