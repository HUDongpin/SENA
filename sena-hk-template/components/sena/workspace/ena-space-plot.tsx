"use client";

import { useMemo, useState } from "react";
import { EnaPlot, type EnaPlotOverlay, type EnaPlotOverlayEdge } from "@/components/ena/EnaPlot";
import { buildSenaEnaPlotComposition } from "@/lib/sena/ena-plot-model";
import { cn } from "@/lib/utils";
import type { SenaEnaManifest, SenaLayer, SenaModel } from "./analysis-runtime";

// ENA Space renders through <EnaPlot> — the same component /workspace/ena uses —
// rather than through the Fusion Canvas. The Fusion grammar is right where a
// node's position is an explanatory layout choice; in ENA space every position
// is a projected coordinate, and drawing r28 discs sized by SENA's weighted
// degree over jENA geometry made the plot claim things the projection does not
// say. ADR 0008 records the split: ENA-canonical base, SENA-additive overlay.
//
// What SENA adds here is the bridge layer, optional social ties, and unit
// identity. All three are overlay: marked data-sena-layer inside EnaPlot,
// capped below the network's visual weight, and independently toggleable. With
// every toggle off the surface is a plain ENA plot, which is what
// lib/sena/__tests__/ena-space-plot-parity.test.ts asserts.

type OverlayToggles = {
  bridge: boolean;
  social: boolean;
  identity: boolean;
};

// Social ties start off. A person-person tie drawn between two projected unit
// points traces a line through ENA space that carries no meaning, so it is
// available on demand rather than by default — unlike the bridge layer, whose
// endpoints are a unit and a code and therefore do connect two things the
// projection actually places.
const defaultToggles: OverlayToggles = { bridge: true, social: false, identity: true };

function normalizeWeights<T extends { weight: number }>(edges: T[]) {
  const peak = Math.max(...edges.map((edge) => Math.abs(edge.weight)), 0);
  return edges.map((edge) => ({
    ...edge,
    normalizedWeight: peak > 0 ? Math.abs(edge.weight) / peak : 0
  }));
}

export function SenaEnaSpacePlot({
  model,
  enaManifest,
  layers,
  threshold,
  selectedId,
  onSelect,
  zoom = 1,
  className
}: {
  model: SenaModel;
  enaManifest: SenaEnaManifest;
  layers: Record<SenaLayer, boolean>;
  threshold: number;
  selectedId: string;
  onSelect: (id: string) => void;
  zoom?: number;
  className?: string;
}) {
  const [toggles, setToggles] = useState<OverlayToggles>(defaultToggles);

  const composition = useMemo(
    () => buildSenaEnaPlotComposition(enaManifest, model.people, model.codes, { title: "ENA projection" }),
    [enaManifest, model.codes, model.people]
  );

  const overlay = useMemo<EnaPlotOverlay>(() => {
    if (composition.status !== "computed") return {};

    const unitPositions = new Map(composition.units.map((unit) => [unit.id, unit]));
    const codePositions = composition.codePositions;

    function resolve(id: string) {
      const unit = unitPositions.get(id);
      if (unit) return { x: unit.x, y: unit.y };
      return codePositions[id] ?? null;
    }

    const overlayEdges: EnaPlotOverlayEdge[] = [];
    const kinds: Array<{ layer: SenaLayer; kind: EnaPlotOverlayEdge["kind"]; enabled: boolean }> = [
      { layer: "bridge", kind: "bridge", enabled: toggles.bridge && layers.bridge },
      { layer: "social", kind: "social", enabled: toggles.social && layers.social }
    ];

    for (const { layer, kind, enabled } of kinds) {
      if (!enabled) continue;
      const candidates = model.edges.filter(
        (edge) => edge.layer === layer && edge.normalizedWeight >= threshold
      );
      // Normalized within its own layer: a bridge weight and a social weight are
      // different quantities, so one shared scale would make the larger layer
      // look uniformly stronger.
      for (const edge of normalizeWeights(candidates)) {
        const source = resolve(edge.source);
        const target = resolve(edge.target);
        if (!source || !target) continue;
        overlayEdges.push({
          id: edge.id,
          label: edge.label,
          kind,
          source,
          target,
          weight: edge.weight,
          normalizedWeight: edge.normalizedWeight
        });
      }
    }

    const legend: EnaPlotOverlay["legend"] = [];
    if (toggles.bridge && layers.bridge) legend.push({ name: "Person–code bridges", color: "#24dcee", kind: "line" });
    if (toggles.social && layers.social) legend.push({ name: "Social ties", color: "#2f73ff", kind: "line" });
    if (toggles.identity) legend.push({ name: "Unit identity", color: "#24dcee", kind: "dot" });

    return {
      edges: overlayEdges,
      markers: toggles.identity ? composition.units : [],
      legend
    };
  }, [composition, layers.bridge, layers.social, model.edges, threshold, toggles]);

  if (composition.status !== "computed" || !composition.model) {
    return (
      <div
        data-testid="sena-ena-space-plot-empty"
        data-visual-role="ena-space-empty-state"
        className={cn(
          "grid place-content-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-center",
          className
        )}
      >
        <p className="text-sm font-black text-slate-700">ENA Space needs a computed jENA projection.</p>
        <p className="text-xs font-bold leading-5 text-slate-500">
          {composition.warnings[0] ?? "Load a dataset with at least two codes and one coded segment."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 gap-2" data-testid="sena-ena-space-plot" data-visual-role="ena-space-canonical-plot">
      <div
        data-testid="sena-ena-space-overlay-controls"
        data-visual-role="ena-space-overlay-controls"
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-slate-500">SENA overlay</span>
        {(
          [
            { id: "bridge", label: "Bridges", disabled: !layers.bridge },
            { id: "social", label: "Social ties", disabled: !layers.social },
            { id: "identity", label: "Unit identity", disabled: false }
          ] as const
        ).map((control) => (
          <button
            key={control.id}
            type="button"
            data-testid={`ena-space-overlay-${control.id}`}
            data-overlay-active={toggles[control.id] && !control.disabled ? "true" : "false"}
            aria-pressed={toggles[control.id] && !control.disabled}
            disabled={control.disabled}
            onClick={() => setToggles((current) => ({ ...current, [control.id]: !current[control.id] }))}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-3 text-[0.68rem] font-black transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow",
              toggles[control.id] && !control.disabled
                ? "border-cyanGlow/70 bg-white text-slate-900"
                : "border-slate-300 bg-slate-50 text-slate-500",
              control.disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {control.label}
          </button>
        ))}
      </div>
      <EnaPlot
        model={composition.model}
        variance={composition.variance}
        zoom={zoom}
        overlay={overlay}
        selectedId={selectedId}
        onSelect={onSelect}
        className={cn("h-full w-full", className)}
      />
    </div>
  );
}
