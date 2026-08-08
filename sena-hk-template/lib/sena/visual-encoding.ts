import type { SenaEdge, SenaLayer, SenaModel } from "./types";

export type SenaEdgeStrokeScale = {
  layers: Record<SenaLayer, { min: number; max: number; span: number }>;
  signals: Map<string, number>;
  /**
   * The drawn width band, when the surface this scale describes does not use
   * the A1 canvas bands. Carried on the scale rather than passed beside it so
   * that a *reader* of the scale — the inspector's line-weight provenance —
   * reports the width its surface actually drew. A scale built for the A1
   * canvas omits it and every existing caller is unchanged.
   */
  ranges?: Partial<Record<SenaLayer, { min: number; max: number }>>;
};

export const senaEdgeStrokeRanges: Record<SenaLayer, { min: number; max: number }> = {
  social: { min: 5.2, max: 15.6 },
  concept: { min: 3.2, max: 12.4 },
  bridge: { min: 2.4, max: 10.8 }
};

/**
 * The orbit band is narrower than the A1 canvas and carries every social tie at
 * once, so it re-steps the social width range rather than reusing the canvas's
 * 5.2-15.6px. ADR 0009 (P2): lanes nest, and a 15.6px lane cannot nest.
 */
export const senaOrbitSocialStrokeRange = { min: 2.5, max: 8.5 } as const;

function codePairKey(codeA: string, codeB: string) {
  return codeA < codeB ? `${codeA}|${codeB}` : `${codeB}|${codeA}`;
}

export function buildConceptPairContributionMap(model: Pick<SenaModel, "pairReport">) {
  return new Map(model.pairReport.map((pair) => [
    codePairKey(pair.codeA, pair.codeB),
    pair.totalContribution
  ]));
}

export function edgeStrokeSignal(edge: SenaEdge, conceptPairContributions: Map<string, number>) {
  if (edge.layer !== "concept") return edge.scaledWeight;
  const gContribution = conceptPairContributions.get(codePairKey(edge.source, edge.target)) ?? 0;
  return edge.scaledWeight + Math.log1p(gContribution) / 100;
}

export function buildEdgeStrokeScale(
  edges: SenaEdge[],
  conceptPairContributions: Map<string, number>
): SenaEdgeStrokeScale {
  const signals = new Map(edges.map((edge) => [edge.id, edgeStrokeSignal(edge, conceptPairContributions)]));
  const layers = (["social", "concept", "bridge"] as SenaLayer[]).reduce((scale, layer) => {
    const weights = edges
      .filter((edge) => edge.layer === layer)
      .map((edge) => signals.get(edge.id) ?? edge.scaledWeight)
      .filter((weight) => Number.isFinite(weight));
    const min = weights.length > 0 ? Math.min(...weights) : 0;
    const max = weights.length > 0 ? Math.max(...weights) : 1;
    scale[layer] = { min, max, span: max - min };
    return scale;
  }, {} as Record<SenaLayer, { min: number; max: number; span: number }>);

  return { layers, signals };
}

/**
 * The absolute counterpart of `edgeStrokeSignal`: the salience an edge carries
 * on its own, not relative to whatever else survived the current filter.
 * `normalizedWeight` is already corpus-anchored — under the default `"max"`
 * normalization its divisor *is* the matrix max
 * (`operatorDiagnostics.normalization.S.divisor`), and every other rule divides
 * by a corpus-wide constant too — so no extra plumbing is needed to read it as
 * a fraction of the corpus. The concept tie-breaker is preserved in the same
 * (log1p / 100) magnitude so absolute concept widths separate visual ties the
 * way the relative scale does.
 */
export function absoluteEdgeStrokeSignal(
  edge: SenaEdge,
  conceptPairContributions?: Map<string, number>
) {
  if (edge.layer !== "concept" || !conceptPairContributions) return edge.normalizedWeight;
  const gContribution = conceptPairContributions.get(codePairKey(edge.source, edge.target)) ?? 0;
  return edge.normalizedWeight + Math.log1p(gContribution) / 100;
}

/**
 * A stroke scale whose intensity is anchored on the corpus, not on the passed
 * edge array. Every layer's window is fixed at [0, 1] in normalized-weight
 * space, so the identical edge draws at the identical width whether the caller
 * passes the whole model or a threshold-filtered slice — the property the orbit
 * needs, because a reader comparing lane widths across two threshold settings
 * is comparing quantities, and `buildEdgeStrokeScale` rescales those under
 * filtering by design (A1's grammar text says "scaled within the active visible
 * layer" and keeps that behaviour).
 */
export function buildAbsoluteEdgeStrokeScale(
  edges: SenaEdge[],
  conceptPairContributions?: Map<string, number>,
  ranges?: Partial<Record<SenaLayer, { min: number; max: number }>>
): SenaEdgeStrokeScale {
  const signals = new Map(edges.map((edge) => [
    edge.id,
    absoluteEdgeStrokeSignal(edge, conceptPairContributions)
  ]));
  const layers = (["social", "concept", "bridge"] as SenaLayer[]).reduce((scale, layer) => {
    scale[layer] = { min: 0, max: 1, span: 1 };
    return scale;
  }, {} as Record<SenaLayer, { min: number; max: number; span: number }>);

  // Spread rather than assigned: a caller that names no bands gets exactly the
  // object shape it got before this parameter existed.
  return { layers, signals, ...(ranges ? { ranges } : {}) };
}

/**
 * width = min + clamp(normalizedWeight)^0.72 * (max - min).
 *
 * Same exponent and rounding as `readableEdgeStrokeWidth`; the only differences
 * are the corpus anchor supplied by `buildAbsoluteEdgeStrokeScale` and the
 * optional range override, which lets the orbit use its own narrower social
 * band without disturbing `senaEdgeStrokeRanges` for the A1 canvas.
 */
export function readableAbsoluteEdgeStrokeWidth(
  edge: SenaEdge,
  scale: SenaEdgeStrokeScale,
  range: { min: number; max: number } = scale.ranges?.[edge.layer] ?? senaEdgeStrokeRanges[edge.layer]
) {
  const signal = scale.signals.get(edge.id) ?? edge.normalizedWeight;
  const layerScale = scale.layers[edge.layer];
  const rawIntensity = layerScale.span > 1e-6
    ? (signal - layerScale.min) / layerScale.span
    : edge.normalizedWeight;
  const intensity = Math.min(1, Math.max(0, Math.pow(Math.max(0, rawIntensity), 0.72)));
  return Number((range.min + intensity * (range.max - range.min)).toFixed(2));
}

export function readableEdgeStrokeWidth(edge: SenaEdge, scale: SenaEdgeStrokeScale) {
  const range = scale.ranges?.[edge.layer] ?? senaEdgeStrokeRanges[edge.layer];
  const layerScale = scale.layers[edge.layer];
  const signal = scale.signals.get(edge.id) ?? edge.scaledWeight;
  const rawIntensity = layerScale.span > 1e-6
    ? (signal - layerScale.min) / layerScale.span
    : edge.normalizedWeight;
  const intensity = Math.min(1, Math.max(0, Math.pow(rawIntensity, 0.72)));
  return Number((range.min + intensity * (range.max - range.min)).toFixed(2));
}

export function readableEdgeStrokeSignal(edge: SenaEdge, scale: SenaEdgeStrokeScale) {
  return scale.signals.get(edge.id) ?? edge.scaledWeight;
}

export function describeEdgeVisualEncoding(
  edge: SenaEdge,
  scale: SenaEdgeStrokeScale,
  model: Pick<SenaModel, "pairReport">
) {
  const pair = edge.layer === "concept"
    ? model.pairReport.find((candidate) => (
      (candidate.codeA === edge.source && candidate.codeB === edge.target) ||
      (candidate.codeA === edge.target && candidate.codeB === edge.source)
    ))
    : undefined;
  const visualBasis = edge.layer === "concept" && pair
    ? "scaledWeight+gPairContributionTieBreaker"
    : "scaledWeight";

  return {
    visualEncodingVersion: "sena-fusion-edge-visual-encoding/v1" as const,
    visualSalience: readableEdgeStrokeSignal(edge, scale),
    visualStrokeWidth: readableEdgeStrokeWidth(edge, scale),
    visualStrokeRange: senaEdgeStrokeRanges[edge.layer],
    visualBasis,
    visualTieBreakerContribution: visualBasis === "scaledWeight+gPairContributionTieBreaker"
      ? pair?.totalContribution ?? 0
      : 0,
    visualGuardrail: visualBasis === "scaledWeight+gPairContributionTieBreaker"
      ? "Raw W remains unchanged; G contribution only separates visually tied active concept links."
      : "Stroke width is a layer-relative rendering of the scaled edge weight."
  };
}

export function buildFusionGraphVisualEncoding(model: SenaModel, edges: SenaEdge[] = model.edges) {
  const contributionMap = buildConceptPairContributionMap(model);
  const scale = buildEdgeStrokeScale(edges, contributionMap);
  return new Map(edges.map((edge) => [edge.id, describeEdgeVisualEncoding(edge, scale, model)]));
}
