import type { SenaEnaManifest, SenaJenaConceptPairHandoffRow, SenaManifestRow, SenaModel } from "./types";

function pairKey(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function numericRowValue(row: SenaManifestRow, column: string) {
  const value = row[column];
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function rowUnitLabel(row: SenaManifestRow, index: number) {
  for (const key of ["personId", "unit", "unitId", "ENA_UNIT", "participant", "id"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return `row ${index + 1}`;
}

function columnTotal(rows: SenaManifestRow[], column: string) {
  return rows.reduce((total, row) => total + numericRowValue(row, column), 0);
}

function overlapStatus(jenaConnectionTotal: number, senaRawWeight: number): SenaJenaConceptPairHandoffRow["overlapStatus"] {
  const jenaActive = Math.abs(jenaConnectionTotal) > 1e-12;
  const senaActive = Math.abs(senaRawWeight) > 1e-12;
  if (jenaActive && senaActive) return "overlap";
  if (jenaActive) return "jena-only";
  if (senaActive) return "sena-w-only";
  return "inactive";
}

export function buildSenaJenaConceptPairHandoffRows(
  model: SenaModel,
  enaManifest: SenaEnaManifest
): SenaJenaConceptPairHandoffRow[] {
  const adjacencyByPair = new Map(
    (enaManifest.outputs?.adjacencyKey ?? []).map((entry) => [pairKey(entry.source, entry.target), entry])
  );
  const connectionCounts = enaManifest.outputs?.connectionCounts ?? [];
  const lineWeights = enaManifest.outputs?.lineWeights ?? [];

  return model.codes.flatMap((codeA, row) => (
    model.codes.slice(row + 1).map((codeB, relativeColumn) => {
      const column = row + 1 + relativeColumn;
      const id = pairKey(codeA.id, codeB.id);
      const adjacency = adjacencyByPair.get(id);
      const adjacencyColumn = adjacency?.name ?? null;
      const jenaConnectionTotal = adjacencyColumn ? columnTotal(connectionCounts, adjacencyColumn) : 0;
      const jenaLineWeightTotal = adjacencyColumn ? columnTotal(lineWeights, adjacencyColumn) : 0;
      const senaRawWeight = model.matrices.W.raw[row]?.[column] ?? 0;
      const senaNormalizedWeight = model.matrices.W.normalized[row]?.[column] ?? 0;
      const unitPreview = adjacencyColumn
        ? connectionCounts.map((connectionRow, index) => ({
          unit: rowUnitLabel(connectionRow, index),
          connectionCount: numericRowValue(connectionRow, adjacencyColumn),
          lineWeight: numericRowValue(lineWeights[index] ?? {}, adjacencyColumn)
        })).filter((entry) => Math.abs(entry.connectionCount) > 1e-12 || Math.abs(entry.lineWeight) > 1e-12).slice(0, 5)
        : [];

      return {
        id,
        codeA: codeA.id,
        codeB: codeB.id,
        codeALabel: codeA.label,
        codeBLabel: codeB.label,
        label: `${codeA.label} + ${codeB.label}`,
        adjacencyColumn,
        adjacencyCovered: Boolean(adjacencyColumn),
        jenaConnectionTotal,
        jenaLineWeightTotal,
        senaRawWeight,
        senaNormalizedWeight,
        overlapStatus: overlapStatus(jenaConnectionTotal, senaRawWeight),
        connectionRows: connectionCounts.length,
        lineWeightRows: lineWeights.length,
        unitPreview,
        guardrail: "jENA moving-window connection totals and SENA stanza W weights are aligned for coverage and signal review; they are not forced to be equal."
      };
    })
  ));
}
