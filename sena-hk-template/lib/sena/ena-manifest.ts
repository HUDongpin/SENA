import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { ena, type ENAOptions, type Row } from "jena-js";
import { displayedRotationColumns, displayedVariance } from "../ena/display-dimensions";
import type { SenaDataset, SenaEnaManifest, SenaManifestRow } from "./types";
import { jenaRuntimeVersion } from "./runtime-constants";

const defaultManifestOptions = {
  model: "EndPoint",
  window: "MovingStanzaWindow",
  weightBy: "binary",
  windowSizeBack: 2,
  windowSizeForward: 0,
  dimensions: 2,
  nodePositionMethod: "undirected"
} as const;

function serializableRows(rows: Row[]): SenaManifestRow[] {
  return rows.map((row) => ({ ...row }));
}

function uniqueCount(values: string[]) {
  return new Set(values).size;
}

function buildRows(dataset: SenaDataset) {
  const peopleById = new Map(dataset.people.map((person) => [person.id, person]));
  const codeIds = dataset.codebook.map((code) => code.id);
  const codeSet = new Set(codeIds);
  const warnings: string[] = [];

  const rows = [...dataset.coded_segments]
    .sort((left, right) => left.turnIndex - right.turnIndex || left.segmentId.localeCompare(right.segmentId))
    .map<Row>((segment) => {
      const person = peopleById.get(segment.personId);
      if (!person) warnings.push(`jENA manifest skipped unknown person "${segment.personId}" in segment ${segment.segmentId}.`);

      const row: Row = {
        segmentId: segment.segmentId,
        personId: segment.personId,
        unitId: segment.unitId,
        stanzaId: segment.stanzaId,
        stage: segment.stage,
        turnIndex: segment.turnIndex,
        group: person?.group ?? "",
        role: person?.role ?? ""
      };

      for (const code of codeIds) row[code] = 0;
      for (const code of segment.codes) {
        if (!codeSet.has(code)) {
          warnings.push(`jENA manifest skipped unknown code "${code}" in segment ${segment.segmentId}.`);
          continue;
        }
        row[code] = segment.confidence ?? 1;
      }

      return row;
    });

  return { rows, codeIds, warnings };
}

function skippedManifest(dataset: SenaDataset, reason: string, warnings: string[] = []): SenaEnaManifest {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enaManifest,
    status: "skipped",
    engine: "jena-js",
    engineVersion: jenaRuntimeVersion,
    source: {
      rowsFrom: "coded_segments",
      unitColumns: ["personId"],
      conversationColumns: ["unitId", "stanzaId"],
      codeColumns: dataset.codebook.map((code) => code.id),
      metadataColumns: ["group", "role"],
      activeCodeValue: "segment-confidence-or-1"
    },
    datasetCounts: {
      rows: dataset.coded_segments.length,
      units: uniqueCount(dataset.coded_segments.map((segment) => segment.personId)),
      conversations: uniqueCount(dataset.coded_segments.map((segment) => `${segment.unitId}::${segment.stanzaId}`)),
      codes: dataset.codebook.length
    },
    warnings: [reason, ...warnings]
  };
}

export function buildSenaEnaManifest(dataset: SenaDataset): SenaEnaManifest {
  const { rows, codeIds, warnings } = buildRows(dataset);

  if (codeIds.length < 2) return skippedManifest(dataset, "jENA manifest requires at least two codes.", warnings);
  if (rows.length === 0) return skippedManifest(dataset, "jENA manifest requires at least one coded segment.", warnings);

  const options: ENAOptions = {
    rows,
    units: ["personId"],
    conversation: ["unitId", "stanzaId"],
    codes: codeIds,
    metadata: ["group", "role"],
    includeMeta: true,
    ...defaultManifestOptions
  };

  try {
    const set = ena(options);
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enaManifest,
      status: "computed",
      engine: "jena-js",
      engineVersion: jenaRuntimeVersion,
      source: {
        rowsFrom: "coded_segments",
        unitColumns: options.units,
        conversationColumns: options.conversation,
        codeColumns: options.codes,
        metadataColumns: options.metadata ?? [],
        activeCodeValue: "segment-confidence-or-1"
      },
      options: defaultManifestOptions,
      datasetCounts: {
        rows: rows.length,
        units: set.unitLabels.length,
        conversations: uniqueCount(rows.map((row) => `${String(row.unitId ?? "")}::${String(row.stanzaId ?? "")}`)),
        codes: set.codes.length
      },
      outputs: {
        adjacencyKey: set.adjacencyKey,
        dimensions: displayedRotationColumns(set),
        variance: displayedVariance(set),
        connectionCounts: serializableRows(set.connectionCounts),
        lineWeights: serializableRows(set.lineWeights),
        pointsForProjection: serializableRows(set.pointsForProjection),
        points: serializableRows(set.points),
        nodePositions: serializableRows(set.rotation.nodes ?? []),
        centroids: serializableRows(set.centroids ?? [])
      },
      warnings
    };
  } catch (error) {
    return skippedManifest(
      dataset,
      `jENA manifest failed: ${error instanceof Error ? error.message : String(error)}`,
      warnings
    );
  }
}
