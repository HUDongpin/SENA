import { projectPoint, type PlotGeometry } from "../ena/plot-encoding";
import { buildSenaEnaPlotComposition } from "./ena-plot-model";
import type { SenaCode, SenaEnaManifest, SenaPerson } from "./types";

export type SenaEnaSpaceCoordinate = {
  id: string;
  kind: "person" | "concept";
  x: number;
  y: number;
  rawX: number;
  rawY: number;
};

export type SenaEnaSpaceCoordinateMap = {
  status: "computed" | "skipped";
  source: "jena-js";
  dimensions: [string, string] | null;
  coordinates: Record<string, SenaEnaSpaceCoordinate>;
  warnings: string[];
};

type CanvasBounds = {
  width: number;
  height: number;
  marginX: number;
  marginY: number;
};

const defaultBounds: CanvasBounds = {
  width: 900,
  height: 620,
  marginX: 86,
  marginY: 72
};

/**
 * Average coordinates that share an id.
 *
 * SENA's ENA unit is `personId` (lib/sena/ena-manifest.ts), so today each
 * person contributes exactly one point row and this collapses nothing. It stops
 * being a no-op the moment units become multi-column — `person x window`, which
 * the temporal work wants — and at that point averaging would quietly plot one
 * mean point per person while /workspace/ena plots one point per person-window.
 * So it records a warning when it actually merges rows, rather than collapsing
 * them in silence. lib/sena/__tests__/ena-space-plot-parity.test.ts pins the
 * one-point-per-unit contract.
 */
function averageDuplicateCoordinates(items: SenaEnaSpaceCoordinate[], warnings: string[]) {
  const byId = new Map<string, SenaEnaSpaceCoordinate[]>();
  for (const item of items) byId.set(item.id, [...(byId.get(item.id) ?? []), item]);

  return Array.from(byId.entries()).map(([id, values]) => {
    const first = values[0];
    if (values.length > 1) {
      warnings.push(
        `ENA coordinate layout averaged ${values.length} projected rows for unit "${id}"; ENA plots one point per unit.`
      );
    }
    const rawX = values.reduce((total, value) => total + value.rawX, 0) / values.length;
    const rawY = values.reduce((total, value) => total + value.rawY, 0) / values.length;
    return {
      id,
      kind: first?.kind ?? "person",
      rawX,
      rawY,
      x: rawX,
      y: rawY
    };
  });
}

/**
 * Project raw ENA coordinates onto a canvas.
 *
 * The projection itself belongs to lib/ena/plot-encoding — the same
 * `projectPoint` <EnaPlot> uses — so this map and the rendered plot cannot
 * disagree. It previously reimplemented the projection with a single isotropic
 * scale, which put the same code at a different relative position than
 * /workspace/ena drew it: SVD1 usually explains far more variance than SVD2, so
 * scaling both axes by `min(...)` compresses the plot along its informative
 * axis. jena-js instead gives each axis its own symmetric range, and ADR 0008
 * settles that both renderers follow jena-js.
 */
function projectCoordinates(
  items: SenaEnaSpaceCoordinate[],
  model: Parameters<typeof projectPoint>[0],
  bounds: CanvasBounds
) {
  const geometry: PlotGeometry = {
    width: bounds.width,
    height: bounds.height,
    margin: bounds.marginX,
    marginX: bounds.marginX,
    marginY: bounds.marginY
  };

  return items.map((item) => {
    const [x, y] = projectPoint(model, { x: item.rawX, y: item.rawY }, geometry);
    return { ...item, x, y };
  });
}

export function buildSenaEnaSpaceCoordinateMap(
  manifest: SenaEnaManifest,
  people: SenaPerson[],
  codes: SenaCode[],
  bounds: Partial<CanvasBounds> = {}
): SenaEnaSpaceCoordinateMap {
  const resolvedBounds = { ...defaultBounds, ...bounds };
  const composition = buildSenaEnaPlotComposition(manifest, people, codes);

  if (composition.status !== "computed" || !composition.model) {
    return {
      status: "skipped",
      source: "jena-js",
      dimensions: null,
      coordinates: {},
      warnings: ["jENA coordinate layout requires a computed two-dimensional manifest.", ...composition.warnings]
    };
  }

  const warnings = [...composition.warnings];
  const rawCoordinates: SenaEnaSpaceCoordinate[] = [
    ...composition.units.map((unit) => ({
      id: unit.id,
      kind: "person" as const,
      rawX: unit.x,
      rawY: unit.y,
      x: unit.x,
      y: unit.y
    })),
    ...Object.entries(composition.codePositions).map(([id, position]) => ({
      id,
      kind: "concept" as const,
      rawX: position.x,
      rawY: position.y,
      x: position.x,
      y: position.y
    }))
  ];

  const coordinates = Object.fromEntries(
    projectCoordinates(
      averageDuplicateCoordinates(rawCoordinates, warnings),
      composition.model,
      resolvedBounds
    ).map((coordinate) => [coordinate.id, coordinate])
  );

  return {
    status: Object.keys(coordinates).length > 0 ? "computed" : "skipped",
    source: "jena-js",
    dimensions: composition.model.dimensions,
    coordinates,
    warnings: Object.keys(coordinates).length > 0
      ? warnings
      : ["jENA manifest did not expose usable ENA coordinates.", ...warnings]
  };
}
