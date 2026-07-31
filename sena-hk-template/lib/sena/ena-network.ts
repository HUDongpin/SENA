import { networkEdgeStrokeWidth } from "../ena/plot-encoding";
import type { SenaEnaManifest, SenaManifestRow } from "./types";

// The Fusion Canvas draws two different concept layers, and they are not the
// same quantity:
//
//   - SENA's W matrix (lib/sena/model.ts) — stanza-scoped code co-occurrence
//     counts, normalized across the whole matrix by max or Frobenius. This is
//     SENA's epistemic layer and it feeds A_fusion, the G/Y attribution, and
//     every SENA operator. It is not an ENA network.
//   - jena-js's ENA network — per-unit moving-stanza-window accumulations,
//     sphere-normalized per unit, then averaged across units. This is what an
//     ENA graph means, and buildSenaEnaManifest already computes it; until now
//     only its node positions were used, and its line weights sat unread.
//
// In ENA-space layout the canvas places nodes at jena-js's rotated code
// positions, so drawing SENA's W edges between them said "ENA space" with the
// geometry and "SENA W" with the ink. This module derives the actual ENA
// network from the manifest so that layout can draw a real ENA graph. W is
// untouched — the explanatory and joint layouts still show it, and no SENA
// operator changes.

export type SenaEnaNetworkEdge = {
  id: string;
  name: string;
  source: string;
  target: string;
  weight: number;
  /** jena-js stroke width for this weight, before any canvas scaling. */
  jenaStrokeWidth: number;
};

export type SenaEnaNetwork = {
  status: "computed" | "skipped";
  source: "jena-js";
  /** Mean line weights across units — rENA's condition-mean network. */
  basis: "mean-line-weights";
  dimensions: [string, string] | null;
  variance: Record<string, number>;
  units: number;
  edges: SenaEnaNetworkEdge[];
  warnings: string[];
};

function numericCell(row: SenaManifestRow, column: string) {
  const value = row[column];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function skipped(reason: string, warnings: string[]): SenaEnaNetwork {
  return {
    status: "skipped",
    source: "jena-js",
    basis: "mean-line-weights",
    dimensions: null,
    variance: {},
    units: 0,
    edges: [],
    warnings: [reason, ...warnings]
  };
}

/**
 * Mean ENA network over all units, matching what `lib/ena/results.ts` hands to
 * jena-js's `addNetwork` and what the R pipeline writes as `*_networks.csv`.
 *
 * `minWeight` mirrors jena-js's `addNetwork({ minWeight })`: edges at or below
 * it are dropped rather than drawn hairline. Default 0 keeps every edge, so a
 * caller that wants jena-js's default filtering has to ask for it.
 */
export function buildSenaEnaNetwork(
  manifest: SenaEnaManifest,
  options: { minWeight?: number } = {}
): SenaEnaNetwork {
  const minWeight = options.minWeight ?? 0;
  const warnings = manifest.warnings ?? [];

  if (manifest.status !== "computed" || !manifest.outputs) {
    return skipped("ENA network requires a computed jENA manifest.", warnings);
  }

  const { adjacencyKey, lineWeights, dimensions, variance } = manifest.outputs;
  if (adjacencyKey.length === 0) {
    return skipped("jENA manifest exposed no adjacency key.", warnings);
  }
  if (lineWeights.length === 0) {
    return skipped("jENA manifest exposed no line weights.", warnings);
  }

  const edges: SenaEnaNetworkEdge[] = [];
  for (const entry of adjacencyKey) {
    let total = 0;
    let counted = 0;
    for (const row of lineWeights) {
      const value = numericCell(row, entry.name);
      if (value === null) continue;
      total += value;
      counted += 1;
    }
    if (counted === 0) continue;

    const weight = total / counted;
    if (Math.abs(weight) <= minWeight) continue;
    edges.push({
      id: `ena:${entry.source}:${entry.target}`,
      name: entry.name,
      source: entry.source,
      target: entry.target,
      weight,
      jenaStrokeWidth: networkEdgeStrokeWidth(weight)
    });
  }

  const displayed = dimensions.slice(0, 2);

  return {
    status: edges.length > 0 ? "computed" : "skipped",
    source: "jena-js",
    basis: "mean-line-weights",
    dimensions: displayed.length === 2 ? [displayed[0], displayed[1]] : null,
    variance,
    units: lineWeights.length,
    edges,
    warnings: edges.length > 0
      ? warnings
      : ["jENA manifest line weights carried no connections above the minimum weight.", ...warnings]
  };
}
