import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import {
  accumulateData,
  ena,
  enaCorrelations,
  extractMakeSetOptions,
  projectIn,
  type AdjacencyKeyEntry,
  type ENAOptions,
  type ENASet,
  type RotationSet,
  type Row
} from "jena-js";
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

/**
 * Co-registration goodness of fit — jena-js's `enaCorrelations`, which measures
 * per dimension how well the projected unit positions agree with their network
 * centroids. It is the figure rENA prints beside an ENA model definition, it
 * needs the live `ENASet` (and throws outright when the set carries no
 * centroids), and nothing downstream of this function has one — so it is
 * serialized here or it does not exist. A failure costs the field and gains a
 * warning; it never costs the projection.
 *
 * Rows carrying a non-finite correlation are dropped rather than serialized:
 * the manifest is a JSON contract, `JSON.stringify(NaN)` is `null`, and a
 * degenerate temporal window would otherwise put a `null` where the type
 * promises a number.
 */
function manifestGoodnessOfFit(set: ENASet, warnings: string[]) {
  try {
    const rows = enaCorrelations(set)
      .filter((row) =>
        [row.pearson, row.spearman, row.pearsonLower, row.pearsonUpper].every((value) =>
          Number.isFinite(value)
        )
      )
      .map((row) => ({
        dimension: row.dimension,
        pearson: row.pearson,
        spearman: row.spearman,
        pearsonLower: row.pearsonLower,
        pearsonUpper: row.pearsonUpper
      }));
    if (rows.length === 0) {
      warnings.push("jENA goodness-of-fit correlations were not estimable for this projection.");
      return undefined;
    }
    return rows;
  } catch (error) {
    warnings.push(
      `jENA goodness-of-fit correlations failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

/**
 * A prior manifest's rotation, in the shape `projectIn` wants.
 *
 * Assembled rather than stored whole: the adjacency key and the code list are
 * already in the manifest, and duplicating them inside `outputs.rotation` would
 * put the same contract in two places that could disagree. The adjacency key
 * travels with the reference on purpose — jena-js refuses to project into a
 * space whose adjacency key differs, and that guard is only real if the key
 * checked is the *source* window's.
 */
export type SenaEnaRotationReference = {
  method: "svd" | "mean";
  codes: string[];
  adjacencyKey: AdjacencyKeyEntry[];
  columns: string[];
  matrix: number[][];
  eigenvalues: number[];
  centerVector: number[];
};

/** The rotation a computed manifest can lend to another window, or null. */
export function senaEnaRotationReference(manifest: SenaEnaManifest): SenaEnaRotationReference | null {
  const rotation = manifest.outputs?.rotation;
  if (manifest.status !== "computed" || !manifest.outputs || !rotation) return null;
  return {
    method: rotation.method,
    codes: manifest.source.codeColumns,
    adjacencyKey: manifest.outputs.adjacencyKey,
    columns: rotation.columns,
    matrix: rotation.matrix,
    eigenvalues: rotation.eigenvalues,
    centerVector: rotation.centerVector
  };
}

function rotationSetFrom(reference: SenaEnaRotationReference): RotationSet {
  return {
    codes: reference.codes,
    adjacencyKey: reference.adjacencyKey,
    rotationMatrix: reference.matrix,
    rotationColumns: reference.columns,
    eigenvalues: reference.eigenvalues,
    centerVector: reference.centerVector
  };
}

function allFinite(values: number[]) {
  return values.every((value) => Number.isFinite(value));
}

/**
 * The rotation payload, or nothing plus a warning.
 *
 * Same rule as the goodness-of-fit block above: the manifest is a JSON
 * contract and `JSON.stringify(NaN)` is `null`, so a degenerate window must not
 * leave a `null` where the type promises a number. A correlation table can drop
 * the bad rows and stay meaningful; a rotation matrix cannot — a partial matrix
 * projects nothing — so the whole payload goes and the reason is recorded.
 */
type SenaEnaManifestRotation = NonNullable<SenaEnaManifest["outputs"]>["rotation"];

function manifestRotation(
  set: ENASet,
  method: "svd" | "mean",
  warnings: string[]
): SenaEnaManifestRotation {
  const { rotationMatrix, rotationColumns, eigenvalues, centerVector } = set.rotation;
  const finite =
    rotationMatrix.every((row) => allFinite(row)) &&
    allFinite(eigenvalues) &&
    allFinite(centerVector);
  if (!finite || rotationMatrix.length === 0) {
    warnings.push("jENA rotation was not serializable for reuse (non-finite entries).");
    return undefined;
  }
  return {
    method,
    columns: [...rotationColumns],
    matrix: rotationMatrix.map((row) => [...row]),
    eigenvalues: [...eigenvalues],
    centerVector: [...centerVector]
  };
}

/**
 * The two unit-label selectors a means rotation needs, or null.
 *
 * jena-js matches a `string[]` selector against each connection-count row's
 * `ENA_UNIT`, so the selectors are unit labels rather than the group names the
 * researcher picked. Exactly two groups: rENA's means rotation puts the
 * difference of two group means on MR1 and there is no third direction to give
 * a third group.
 */
function meanRotationGroups(rows: Row[], column: string) {
  const unitsByGroup = new Map<string, string[]>();
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const unit = String(row.ENA_UNIT ?? "");
    if (!unit) continue;
    const group = String(value);
    const units = unitsByGroup.get(group) ?? [];
    if (!units.includes(unit)) units.push(unit);
    unitsByGroup.set(group, units);
  }

  const names = [...unitsByGroup.keys()].sort((left, right) => left.localeCompare(right));
  if (names.length !== 2) return null;
  return {
    names: names as [string, string],
    selectors: [unitsByGroup.get(names[0])!, unitsByGroup.get(names[1])!] as [string[], string[]]
  };
}

/**
 * What a caller may change about the projection.
 *
 * Every field is optional and every default is the shape this module always
 * built, so `buildSenaEnaManifest(dataset)` is byte-for-byte what it was and
 * every existing consumer, fixture, and gate keeps reading the same manifest.
 */
export type SenaEnaManifestOverrides = {
  /**
   * `"mean"` puts the difference between two groups' means on the first axis
   * (rENA's means rotation; the axis is named MR1). Needs exactly two groups in
   * `groupColumn`; on any other count it falls back to SVD and says so in the
   * warnings rather than failing the run.
   */
  rotation?: "svd" | "mean";
  /** Metadata column the means rotation splits on. Defaults to "group". */
  groupColumn?: string;
  /**
   * Project this window into a prior manifest's rotation instead of computing
   * one, so two windows are plotted in one comparable space.
   * `senaEnaRotationReference` produces the argument.
   */
  projectInto?: SenaEnaRotationReference;
  /**
   * Serialize the rotation so a later window can be projected into this one.
   * Implied by `rotation: "mean"` and by `projectInto`, since a space worth
   * naming is a space worth reusing.
   */
  emitRotation?: boolean;
};

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

export function buildSenaEnaManifest(
  dataset: SenaDataset,
  overrides: SenaEnaManifestOverrides = {}
): SenaEnaManifest {
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
    // The default path stays `ena(options)` verbatim. It is exactly
    // accumulateData + makeSet, but keeping the call means the manifest every
    // existing consumer reads is produced by the code that always produced it,
    // and only a caller that asked for something else takes another route.
    let set: ENASet;
    let rotationMethod: "svd" | "mean" = "svd";
    let groupColumn: string | undefined;
    let projectedIn = false;

    if (overrides.projectInto) {
      // Cross-window shared space: the second window is placed in the first
      // window's rotation instead of computing its own, which is what makes two
      // windows' coordinates comparable at all.
      const data = accumulateData(options);
      set = projectIn(data, rotationSetFrom(overrides.projectInto), extractMakeSetOptions(options));
      rotationMethod = overrides.projectInto.method;
      projectedIn = true;
    } else if (overrides.rotation === "mean") {
      groupColumn = overrides.groupColumn ?? "group";
      const data = accumulateData(options);
      const groups = meanRotationGroups(data.connectionCounts, groupColumn);
      if (groups) {
        set = ena({ ...options, rotation: { method: "mean", params: { groups: groups.selectors } } });
        rotationMethod = "mean";
      } else {
        warnings.push(
          `jENA means rotation needs exactly two groups in "${groupColumn}"; the projection fell back to SVD.`
        );
        groupColumn = undefined;
        set = ena(options);
      }
    } else {
      set = ena(options);
    }

    const goodnessOfFit = manifestGoodnessOfFit(set, warnings);
    const emitRotation = overrides.emitRotation === true || rotationMethod === "mean" || projectedIn;
    const rotation = emitRotation ? manifestRotation(set, rotationMethod, warnings) : undefined;
    const recordedOptions =
      rotationMethod === "mean" || projectedIn
        ? {
            ...defaultManifestOptions,
            rotation: rotationMethod,
            ...(groupColumn ? { groupColumn } : {}),
            ...(projectedIn ? { projectedIn: true } : {})
          }
        : defaultManifestOptions;

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
      options: recordedOptions,
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
        // Carried beside the displayed shares, not instead of them: axis titles
        // quote the rotation-column basis (webENA's convention, and what
        // /workspace/ena titles from), while `variance` above stays the
        // renormalized basis the summaries and the low-rank rule are defined on.
        rotationVariance: { ...set.variance },
        // Additive and optional, so the schema version does not move: a reader
        // written against the previous shape sees exactly what it saw before.
        ...(goodnessOfFit ? { goodnessOfFit } : {}),
        ...(rotation ? { rotation } : {}),
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
