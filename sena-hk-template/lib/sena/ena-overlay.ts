import type { EnaPlotOverlayEdge } from "@/components/ena/EnaPlot";
import { RENA_EDGE_WIDTH_RANGE, styleRenaNetwork } from "@/lib/ena/plot-encoding";
import type { SenaEnaPlotComposition } from "./ena-plot-model";
import type { SenaEdge, SenaLayer } from "./types";

// The overlay assembly ENA Space and the Fusion plane share (ADR 0009). It was
// ENA Space's alone until the Fusion plane started rendering through the same
// <EnaPlot>; forking it would have given one figure two ways of deciding how
// thick a bridge is, which is the divergence ADR 0008 exists to prevent.
//
// Endpoints stay in **data coordinates**. The renderer owns the only projection
// (comment at components/ena/EnaPlot.tsx:102–104), so this module resolves ids
// to raw ENA positions and stops there. The one import from components/ is
// type-only and deliberate: this builds the shared renderer's overlay channel,
// so the channel's own type is the right contract to compile against rather
// than a second declaration of it that could drift.

/**
 * |weight| normalized within one layer. A bridge weight and a social weight are
 * different quantities, so a shared scale would make the larger layer look
 * uniformly stronger.
 */
export function normalizeWeights<T extends { weight: number }>(edges: T[]) {
  const peak = Math.max(...edges.map((edge) => Math.abs(edge.weight)), 0);
  return edges.map((edge) => ({
    ...edge,
    normalizedWeight: peak > 0 ? Math.abs(edge.weight) / peak : 0
  }));
}

export type SenaEnaOverlayKind = {
  /** Which SENA layer supplies the edges. */
  layer: SenaLayer;
  /** Which overlay channel draws them — bridges and social ties are inked apart. */
  kind: EnaPlotOverlayEdge["kind"];
  /** The layer toggle. A disabled layer contributes nothing. */
  enabled: boolean;
  /**
   * Optional focus filter, applied **after** normalization so the widths a
   * reader sees stay layer-relative rather than relative to whatever subset is
   * currently in focus. The Fusion plane uses it to show one person's bridges.
   */
  include?: (edge: SenaEdge) => boolean;
};

/**
 * Overlay edges for a canonical ENA plot: per-layer re-normalization, the
 * threshold filter, and data-coordinate endpoints resolved through the
 * composition's units and code positions. An edge whose endpoints the
 * projection does not place is dropped rather than guessed at.
 */
export function buildSenaEnaOverlayEdges({
  edges,
  composition,
  threshold,
  kinds
}: {
  /** `model.edges` — passed as the array, not the model, so a memo that reads it stays narrow. */
  edges: SenaEdge[];
  composition: SenaEnaPlotComposition;
  threshold: number;
  kinds: SenaEnaOverlayKind[];
}): EnaPlotOverlayEdge[] {
  if (composition.status !== "computed") return [];

  const unitPositions = new Map(composition.units.map((unit) => [unit.id, unit]));
  const codePositions = composition.codePositions;

  function resolve(id: string) {
    const unit = unitPositions.get(id);
    if (unit) return { x: unit.x, y: unit.y };
    return codePositions[id] ?? null;
  }

  const overlayEdges: EnaPlotOverlayEdge[] = [];

  for (const { layer, kind, enabled, include } of kinds) {
    if (!enabled) continue;
    const candidates = edges.filter((edge) => edge.layer === layer && edge.normalizedWeight >= threshold);
    for (const edge of normalizeWeights(candidates)) {
      if (include && !include(edge)) continue;
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

  return overlayEdges;
}

// --- Drawn overlay width -----------------------------------------------------
//
// The renderer decides how thick an overlay line is, and it decides it under a
// law nothing outside it could restate: the cap is the *median drawn network
// width*, which only exists once the network has been styled. Any surface that
// has to report the width it drew — the inspector's line-weight provenance —
// therefore has to ask the same question the renderer asks, from the same
// composition, rather than approximate it with a band. These two functions are
// that question, mirrored from EnaPlot's `medianWidth` and its overlay stroke
// expression so a change to one fails the test that pins the pair.

/**
 * The cap EnaPlot applies to every overlay stroke: the median width of the drawn
 * rENA network. Colour plays no part in a styled edge's width, so the base
 * colour passed here is immaterial and only has to be a valid one.
 */
export function senaEnaOverlayWidthCap(composition: SenaEnaPlotComposition): number {
  const model = composition.status === "computed" ? composition.model : null;
  if (!model) return RENA_EDGE_WIDTH_RANGE[0];

  const widths = model.traces
    .filter((trace) => trace.type === "network" && trace.network)
    .flatMap((trace) => styleRenaNetwork(model, trace.network!, "#386CB0").edges.map((edge) => edge.strokeWidth))
    .sort((left, right) => left - right);

  if (widths.length === 0) return RENA_EDGE_WIDTH_RANGE[0];
  const middle = Math.floor(widths.length / 2);
  return widths.length % 2 === 0 ? (widths[middle - 1] + widths[middle]) / 2 : widths[middle];
}

/** `max(1, min(cap, cap * (0.4 + 0.6 * nw)))` — EnaPlot's overlay stroke law. */
export function senaEnaOverlayStrokeWidth(normalizedWeight: number, cap: number) {
  return Math.max(1, Math.min(cap, cap * (0.4 + 0.6 * normalizedWeight)));
}

/**
 * Drawn width per SENA edge id for the overlay channel of a nested plot.
 *
 * Built from the same call that builds the lines, so an edge that is not drawn
 * has no entry and an edge that is drawn has exactly the number on screen.
 */
export function buildSenaEnaOverlayWidths(args: {
  edges: SenaEdge[];
  composition: SenaEnaPlotComposition;
  threshold: number;
  kinds: SenaEnaOverlayKind[];
}): Map<string, number> {
  const cap = senaEnaOverlayWidthCap(args.composition);
  return new Map(
    buildSenaEnaOverlayEdges(args).map((edge) => [
      edge.id,
      Number(senaEnaOverlayStrokeWidth(edge.normalizedWeight, cap).toFixed(2))
    ])
  );
}
