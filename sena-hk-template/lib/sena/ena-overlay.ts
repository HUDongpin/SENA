import type { EnaPlotOverlayEdge } from "@/components/ena/EnaPlot";
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
