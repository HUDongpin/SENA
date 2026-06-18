import type { SenaEdge, SenaLayer, SenaModel } from "./types";

export type SenaEdgeStrokeScale = {
  layers: Record<SenaLayer, { min: number; max: number; span: number }>;
  signals: Map<string, number>;
};

export const senaEdgeStrokeRanges: Record<SenaLayer, { min: number; max: number }> = {
  social: { min: 5.2, max: 15.6 },
  concept: { min: 3.2, max: 12.4 },
  bridge: { min: 2.4, max: 10.8 }
};

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

export function readableEdgeStrokeWidth(edge: SenaEdge, scale: SenaEdgeStrokeScale) {
  const range = senaEdgeStrokeRanges[edge.layer];
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
