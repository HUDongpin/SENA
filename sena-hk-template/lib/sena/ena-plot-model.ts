import type { ENAPlotModel, NetworkGraph } from "jena-js/plot";
import {
  ENA_COMPARISON_PALETTES,
  enaGroupIntervals,
  enaRowGroupValues,
  type EnaGroupInterval
} from "../ena/comparison";
import { assessEnaLowRank, type EnaLowRankAssessment } from "../ena/low-rank";
import { enaAxisRange } from "../ena/plot-encoding";
import { buildSenaEnaNetwork, type SenaEnaNetwork } from "./ena-network";
import type { SenaCode, SenaEnaManifest, SenaManifestRow, SenaPerson } from "./types";

// SENA's ENA Space and /workspace/ena draw the same quantities from the same
// runtime. Before this module they drew them through two different renderers
// with two different grammars: ENA Space sized code nodes by SENA's
// weightedDegree, multiplied jena-js's edge law by 5.6 to clear its r28 discs,
// and projected coordinates with one isotropic scale while jena-js scales each
// axis into its own symmetric range. Same numbers, two incompatible pictures.
//
// This adapter turns a jENA manifest into the very ENAPlotModel that
// lib/ena/results.ts hands to <EnaPlot>, so ENA Space renders through the
// canonical renderer instead of a parallel one. Trace order and palette slots
// mirror buildEnaPlotModel exactly, because trace order is what assigns colours
// (jena-js's nextColor walks the palette by trace index) — a missing `nodes`
// trace would silently recolour the unit points from magenta to purple.
//
// ADR 0008 records the rule this implements: where a node's position is a
// measured coordinate, the visual grammar is ENA-canonical, and everything SENA
// adds is a marked, subordinate overlay.

/** Same palette `lib/ena/results.ts` passes to createENAPlotModel. */
export const SENA_ENA_PLOT_PALETTE = ["#18b7c9", "#7b50f5", "#e850d2", "#16a34a", "#f59e0b", "#ef4444"];

/** `lib/ena/results.ts` overrides jena-js's 1.2 default; ENA Space matches it. */
export const SENA_ENA_PLOT_AXIS_PADDING = 1.35;

export type SenaEnaPlotUnit = {
  /** SENA person id — what selection, bridges, and the inspector key on. */
  id: string;
  label: string;
  /** Raw ENA coordinates; the renderer owns the projection to pixels. */
  x: number;
  y: number;
};

export type SenaEnaPlotComposition = {
  status: "computed" | "skipped";
  source: "jena-js";
  model: ENAPlotModel | null;
  network: SenaEnaNetwork;
  units: SenaEnaPlotUnit[];
  /** Raw ENA coordinates per code id, for placing overlay endpoints. */
  codePositions: Record<string, { x: number; y: number }>;
  /**
   * The shares the axes are titled with: the rotation-column basis, which is
   * what /workspace/ena titles from (webENA's convention), so one axis reads
   * the same percentage on both routes. This is exactly what <EnaPlot>'s
   * `variance` prop means, which is why it carries the plain name.
   */
  variance: Record<string, number>;
  /**
   * The same shares renormalized over the two drawn axes — the basis the
   * low-rank rule, SENA's published summaries, and the rENA parity fixture are
   * defined on. The pilot's second axis is 28.5% above and 34.6% here; both are
   * true, so both are carried and each is named.
   */
  displayedVariance: Record<string, number>;
  /** Non-null when the displayed space is effectively 1-D (rank audit rule). */
  lowRank: EnaLowRankAssessment | null;
  /**
   * Comparison groups — mean and 95% t interval per group, in raw ENA
   * coordinates (ADR 0009, Q3/D6). Empty unless `groupBy` names a metadata
   * column, so an unasked-for comparison is exactly the absence of one and the
   * parity suites see the DOM they always saw.
   *
   * Not traces: `ENAPlotTrace` carries points and networks and nothing that can
   * express an interval, so the interval rides the renderer's additive overlay
   * channel instead (see `EnaPlotOverlayGroup`).
   */
  groups: EnaGroupInterval[];
  warnings: string[];
};

function numericCell(row: SenaManifestRow, column: string) {
  const value = row[column];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * SENA's ENA units are `personId` (lib/sena/ena-manifest.ts), so a point row
 * identifies its unit through one of these columns. Kept in step with
 * lib/sena/layout.ts, which reads the same rows.
 */
function personIdFromRow(row: SenaManifestRow, knownPeople: Set<string>) {
  const candidates = ["personId", "person", "unit", "unitId", "id"];
  for (const candidate of candidates) {
    const value = row[candidate];
    if (typeof value === "string" && knownPeople.has(value)) return value;
  }
  return null;
}

function skipped(reason: string, network: SenaEnaNetwork, warnings: string[]): SenaEnaPlotComposition {
  return {
    status: "skipped",
    source: "jena-js",
    model: null,
    network,
    units: [],
    codePositions: {},
    variance: {},
    displayedVariance: {},
    lowRank: null,
    groups: [],
    warnings: [reason, ...warnings]
  };
}

export type SenaEnaPlotCompositionOptions = {
  /** Mirrors jena-js's `addNetwork({ minWeight })`. */
  minWeight?: number;
  title?: string;
  /**
   * Metadata column on the manifest's point rows to group units by — `"group"`
   * or `"role"` for a SENA manifest (`source.metadataColumns`). Omitted, no
   * groups are computed and nothing is added to the figure.
   *
   * `/workspace/ena` reaches the same quantity through jena-js `addGroup` on a
   * live `ENASet`; ENA Space and the Fusion plane have only the serialized
   * manifest, which is why this reads rows rather than a set.
   */
  groupBy?: string;
  /** Restricts and orders the groups; omitted lists every value, name-sorted. */
  groups?: readonly string[];
  /** Comparison palette (Q3 default: webENA blue/orange). */
  groupPalette?: readonly string[];
};

/**
 * ENAPlotModel for SENA's ENA Space, built from the jENA manifest.
 *
 * Axis ranges follow `scaleTo: "network"` — symmetric about zero, padded, and
 * derived from the rotated **code** positions, exactly as createENAPlotModel
 * does for /workspace/ena. Deriving them from the union of codes and units
 * would frame the plot slightly differently and break screenshot comparison
 * between the two routes, which is the whole point of this module.
 */
export function buildSenaEnaPlotComposition(
  manifest: SenaEnaManifest,
  people: SenaPerson[],
  codes: SenaCode[],
  options: SenaEnaPlotCompositionOptions = {}
): SenaEnaPlotComposition {
  const network = buildSenaEnaNetwork(manifest, { minWeight: options.minWeight });
  const warnings = manifest.warnings ?? [];

  if (manifest.status !== "computed" || !manifest.outputs) {
    return skipped("ENA Space requires a computed jENA manifest.", network, warnings);
  }

  const dimensions = manifest.outputs.dimensions.slice(0, 2);
  if (dimensions.length < 2) {
    return skipped("ENA Space requires a two-dimensional jENA projection.", network, warnings);
  }

  const [xDimension, yDimension] = dimensions as [string, string];
  const codeById = new Map(codes.map((code) => [code.id, code]));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const peopleIds = new Set(peopleById.keys());

  const codePositions: Record<string, { x: number; y: number }> = {};
  for (const row of manifest.outputs.nodePositions) {
    const code = row.code;
    const x = numericCell(row, xDimension);
    const y = numericCell(row, yDimension);
    if (typeof code !== "string" || !codeById.has(code) || x === null || y === null) continue;
    codePositions[code] = { x, y };
  }

  if (Object.keys(codePositions).length === 0) {
    return skipped("jENA manifest exposed no usable code positions.", network, warnings);
  }

  const units: SenaEnaPlotUnit[] = [];
  for (const row of manifest.outputs.points) {
    const id = personIdFromRow(row, peopleIds);
    const x = numericCell(row, xDimension);
    const y = numericCell(row, yDimension);
    if (!id || x === null || y === null) continue;
    units.push({ id, label: peopleById.get(id)?.label ?? id, x, y });
  }

  const graph: NetworkGraph = {
    nodes: Object.entries(codePositions).map(([id, position]) => ({
      id,
      label: codeById.get(id)?.label ?? id,
      x: position.x,
      y: position.y
    })),
    edges: network.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      name: edge.name
    }))
  };

  const nodeXs = Object.values(codePositions).map((position) => position.x);
  const nodeYs = Object.values(codePositions).map((position) => position.y);

  // Computed from the same point rows the unit markers come from, so a group
  // mean is the mean of exactly the points a reader can count on the plot.
  const groups = options.groupBy
    ? enaGroupIntervals({
        points: manifest.outputs.points,
        xDimension,
        yDimension,
        groupOf: enaRowGroupValues(manifest.outputs.points, options.groupBy),
        groups: options.groups,
        palette: options.groupPalette ?? ENA_COMPARISON_PALETTES["blue-orange"]
      })
    : [];

  const model: ENAPlotModel = {
    title: options.title ?? "ENA projection",
    dimensions: [xDimension, yDimension],
    axes: {
      x: { title: xDimension, range: enaAxisRange(nodeXs, SENA_ENA_PLOT_AXIS_PADDING) },
      y: { title: yDimension, range: enaAxisRange(nodeYs, SENA_ENA_PLOT_AXIS_PADDING) }
    },
    palette: SENA_ENA_PLOT_PALETTE,
    traces: [
      // Trace order is buildEnaPlotModel's: network, nodes, points. The `nodes`
      // trace is suppressed by EnaPlot whenever a network is present (the
      // network already carries the code markers) but it still occupies its
      // palette slot, which is what keeps the unit points magenta rather than
      // purple on both routes.
      { type: "network", name: "Mean network", color: SENA_ENA_PLOT_PALETTE[0], network: graph },
      {
        type: "nodes",
        name: "Codes",
        color: SENA_ENA_PLOT_PALETTE[1],
        points: graph.nodes.map((node) => ({ x: node.x ?? 0, y: node.y ?? 0, label: node.label }))
      },
      {
        type: "points",
        name: "Units",
        color: SENA_ENA_PLOT_PALETTE[2],
        points: units.map((unit) => ({ x: unit.x, y: unit.y, label: unit.label }))
      }
    ]
  };

  return {
    status: "computed",
    source: "jena-js",
    model,
    network,
    units,
    codePositions,
    // A manifest emitted before `rotationVariance` existed carries only the
    // renormalized shares; titling from those is the bug this fixes, but a
    // rotation basis cannot be invented from them (the missing normalizer is
    // the variance mass outside the drawn axes), so an old manifest keeps its
    // old titles rather than a fabricated correction.
    variance: manifest.outputs.rotationVariance ?? manifest.outputs.variance,
    displayedVariance: manifest.outputs.variance,
    // The audit's unit count is the projection's, not the plot's: a point row
    // whose person id or coordinates are unusable is dropped above, and counting
    // the survivors would report a rank the space does not have — three dropped
    // rows in a healthy 5-unit window would read as a degenerate 2-unit one.
    // `datasetCounts.units` is the jENA set's own unitLabels count, which is
    // what /workspace/ena assesses from (`result.summary.units`), so the two
    // routes keep reading one number.
    lowRank: assessEnaLowRank({
      units: manifest.datasetCounts.units,
      variance: manifest.outputs.variance,
      dimensions
    }),
    groups,
    warnings
  };
}
