import type { SenaCode, SenaEnaManifest, SenaManifestRow, SenaPerson } from "./types";

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

function numericCell(row: SenaManifestRow, column: string) {
  const value = row[column];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function personIdFromRow(row: SenaManifestRow, knownPeople: Set<string>) {
  const candidates = ["personId", "person", "unit", "unitId", "id"];
  for (const candidate of candidates) {
    const value = row[candidate];
    if (typeof value === "string" && knownPeople.has(value)) return value;
  }
  return null;
}

function averageDuplicateCoordinates(items: SenaEnaSpaceCoordinate[]) {
  const byId = new Map<string, SenaEnaSpaceCoordinate[]>();
  for (const item of items) byId.set(item.id, [...(byId.get(item.id) ?? []), item]);

  return Array.from(byId.entries()).map(([id, values]) => {
    const first = values[0];
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

function scaleCoordinates(items: SenaEnaSpaceCoordinate[], bounds: CanvasBounds) {
  if (items.length === 0) return [];

  const minX = Math.min(...items.map((item) => item.rawX));
  const maxX = Math.max(...items.map((item) => item.rawX));
  const minY = Math.min(...items.map((item) => item.rawY));
  const maxY = Math.max(...items.map((item) => item.rawY));
  const spanX = Math.max(1e-9, maxX - minX);
  const spanY = Math.max(1e-9, maxY - minY);
  const scale = Math.min((bounds.width - bounds.marginX * 2) / spanX, (bounds.height - bounds.marginY * 2) / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;

  return items.map((item) => ({
    ...item,
    x: Math.max(bounds.marginX, Math.min(bounds.width - bounds.marginX, centerX + (item.rawX - midX) * scale)),
    y: Math.max(bounds.marginY, Math.min(bounds.height - bounds.marginY, centerY - (item.rawY - midY) * scale))
  }));
}

export function buildSenaEnaSpaceCoordinateMap(
  manifest: SenaEnaManifest,
  people: SenaPerson[],
  codes: SenaCode[],
  bounds: Partial<CanvasBounds> = {}
): SenaEnaSpaceCoordinateMap {
  const resolvedBounds = { ...defaultBounds, ...bounds };
  const dimensions = manifest.outputs?.dimensions.slice(0, 2);
  if (manifest.status !== "computed" || !manifest.outputs || !dimensions || dimensions.length < 2) {
    return {
      status: "skipped",
      source: "jena-js",
      dimensions: null,
      coordinates: {},
      warnings: ["jENA coordinate layout requires a computed two-dimensional manifest.", ...manifest.warnings]
    };
  }

  const [xDimension, yDimension] = dimensions as [string, string];
  const peopleIds = new Set(people.map((person) => person.id));
  const codeIds = new Set(codes.map((code) => code.id));
  const rawCoordinates: SenaEnaSpaceCoordinate[] = [];

  for (const row of manifest.outputs.points) {
    const id = personIdFromRow(row, peopleIds);
    const rawX = numericCell(row, xDimension);
    const rawY = numericCell(row, yDimension);
    if (!id || rawX === null || rawY === null) continue;
    rawCoordinates.push({ id, kind: "person", rawX, rawY, x: rawX, y: rawY });
  }

  for (const row of manifest.outputs.nodePositions) {
    const code = row.code;
    const rawX = numericCell(row, xDimension);
    const rawY = numericCell(row, yDimension);
    if (typeof code !== "string" || !codeIds.has(code) || rawX === null || rawY === null) continue;
    rawCoordinates.push({ id: code, kind: "concept", rawX, rawY, x: rawX, y: rawY });
  }

  const coordinates = Object.fromEntries(
    scaleCoordinates(averageDuplicateCoordinates(rawCoordinates), resolvedBounds).map((coordinate) => [coordinate.id, coordinate])
  );

  return {
    status: Object.keys(coordinates).length > 0 ? "computed" : "skipped",
    source: "jena-js",
    dimensions: [xDimension, yDimension],
    coordinates,
    warnings: Object.keys(coordinates).length > 0 ? manifest.warnings : ["jENA manifest did not expose usable ENA coordinates.", ...manifest.warnings]
  };
}
