import type { ENASet, Row } from "jena-js";
import { addGroup, addNetwork, addNodes, addPoints, addTrajectory, createENAPlotModel, type ENAPlotModel } from "jena-js/plot";
import { displayedRotationColumns, displayedVariance } from "./display-dimensions";
import type { EnaPlotComposition, EnaRunResult, EnaRuntime } from "./types";

const plotPalette = ["#18b7c9", "#7b50f5", "#e850d2", "#16a34a", "#f59e0b", "#ef4444"];

/**
 * The floor that keeps hairline noise out of the drawn mean network; a
 * researcher-set minimum edge weight (webENA's "minimum edge weight", the Plot
 * Tools slider) raises it but cannot go below it. Every surface that states
 * the drawn network's threshold — the slider readout, the methods write-up —
 * derives it from here, so an edge can never be dropped without the UI saying
 * at what weight.
 */
export const ENA_NETWORK_MIN_WEIGHT_FLOOR = 0.001;

/** The threshold the drawn network actually uses for a researcher setting. */
export function effectiveEnaMinWeight(minWeight: number) {
  return Math.max(ENA_NETWORK_MIN_WEIGHT_FLOOR, minWeight);
}

/** Palette slots 0–2 are reserved for the network, code, and unit traces. */
const groupPalette = plotPalette.slice(3);

function numeric(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function averageConnectionRow(set: ENASet): Row {
  if (set.lineWeights.length === 0) return {};

  return Object.fromEntries(set.codeColumns.map((column) => {
    const value = set.lineWeights.reduce((sum, row) => sum + numeric(row[column]), 0) / set.lineWeights.length;
    return [column, value];
  }));
}

function unitKey(row: Row) {
  return String(row.ENA_UNIT ?? "");
}

/**
 * Distinct unit identities. Under a trajectory model `set.unitLabels` holds one
 * entry per (unit x conversation) step, so counting it reports steps rather than
 * participants — 68 instead of 24 on the Lesson 1 model.
 */
export function distinctUnitCount(set: ENASet) {
  return new Set(set.points.map(unitKey)).size;
}

/**
 * jena-js's trajectory models emit one point per unit per conversation, in
 * order. A unit only moves if it spans more than one conversation, so a
 * trajectory model over a conversation that is constant within a unit yields
 * single-point "trajectories" and is worth reporting rather than drawing.
 */
export function isTrajectoryModel(set: ENASet) {
  return set.modelType === "AccumulatedTrajectory" || set.modelType === "SeparateTrajectory";
}

function trajectoriesByUnit(set: ENASet) {
  const sequences = new Map<string, Row[]>();
  // Insertion order is jena-js's conversation order, which is the trajectory order.
  for (const point of set.points) {
    const key = unitKey(point);
    const existing = sequences.get(key);
    if (existing) existing.push(point);
    else sequences.set(key, [point]);
  }
  return sequences;
}

/**
 * Group value per unit.
 *
 * Read from the points where possible, but jena-js's trajectory models project
 * only the unit columns — metadata is dropped from both `points` and
 * `metaData`, so a group column that is metadata rather than part of the unit
 * key vanishes exactly when trajectories are switched on. `rawRows` always
 * carries every input column, so it is the fallback, keyed by the same "::"
 * join jena-js uses to build ENA_UNIT.
 */
export function unitGroupValues(set: ENASet, column: string) {
  const values = new Map<string, string>();

  for (const point of set.points) {
    const raw = point[column];
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    values.set(unitKey(point), String(raw));
  }
  if (values.size > 0) return values;

  for (const row of set.rawRows) {
    const raw = row[column];
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    const key = set.units.map((unitColumn) => String(row[unitColumn] ?? "")).join("::");
    if (!values.has(key)) values.set(key, String(raw));
  }
  return values;
}

function distinctGroupValues(groupOf: Map<string, string>) {
  return Array.from(new Set(groupOf.values())).sort((left, right) => left.localeCompare(right));
}

function groupColor(index: number) {
  return groupPalette[index % groupPalette.length] ?? plotPalette[3];
}

export function buildEnaPlotModel(set: ENASet, composition: EnaPlotComposition = {}): ENAPlotModel {
  const model = createENAPlotModel(set, {
    title: "ENA projection",
    scaleTo: "network",
    axisPadding: 1.35,
    palette: plotPalette
  });

  const minWeight = effectiveEnaMinWeight(composition.minWeight ?? 0);
  addNetwork(model, set, averageConnectionRow(set), { name: "Mean network", color: plotPalette[0], minWeight });
  addNodes(model, set, { name: "Codes", color: plotPalette[1] });

  const groupBy = composition.groupBy?.trim();
  const groupOf = groupBy ? unitGroupValues(set, groupBy) : new Map<string, string>();
  const groups = groupBy ? distinctGroupValues(groupOf) : [];
  const colorForGroup = new Map(groups.map((value, index) => [value, groupColor(index)]));
  const sequences = isTrajectoryModel(set) ? trajectoriesByUnit(set) : null;
  const movingUnits = sequences ? [...sequences.values()].filter((steps) => steps.length > 1) : [];

  if (movingUnits.length > 0 && sequences) {
    // One trace per unit, because addTrajectory connects the points it selects
    // in order: selecting a whole group instead would zigzag between different
    // participants' steps. Traces that share a group share a name and colour so
    // the legend stays one entry per group rather than one per participant.
    for (const [unit, steps] of sequences) {
      if (steps.length < 2) continue;
      const groupValue = groupOf.get(unit) ?? "";
      const color = colorForGroup.get(groupValue) ?? plotPalette[2];
      addTrajectory(model, set, (row) => unitKey(row) === unit, {
        name: groupValue ? `${groupValue} trajectory` : "Trajectory",
        color
      });
    }
  } else {
    addPoints(model, set, undefined, { name: "Units", color: plotPalette[2] });
  }

  for (const value of groups) {
    // Selector by resolved unit rather than by column equality, so the mean is
    // computed the same way whether or not the projection kept the column.
    addGroup(model, set, (row) => groupOf.get(unitKey(row)) === value, {
      name: `${value} mean`,
      color: colorForGroup.get(value) ?? plotPalette[3]
    });
  }

  return model;
}

export function buildEnaRunResult(
  set: ENASet,
  rowCount: number,
  runtime: EnaRuntime,
  elapsedMs: number,
  warnings: string[],
  composition: EnaPlotComposition = {}
): EnaRunResult {
  const plotWarnings = [...warnings];
  if (isTrajectoryModel(set)) {
    const sequences = trajectoriesByUnit(set);
    const moving = [...sequences.values()].filter((steps) => steps.length > 1).length;
    if (moving === 0) {
      plotWarnings.push(
        `${set.modelType} produced one point per unit because every unit sits in a single conversation. Map a conversation column that varies within a unit (a phase, stanza, or time point) to draw trajectories.`
      );
    }
  }

  return {
    set,
    plotModel: buildEnaPlotModel(set, composition),
    summary: {
      rows: rowCount,
      units: distinctUnitCount(set),
      codes: set.codes.length,
      dimensions: displayedRotationColumns(set),
      variance: displayedVariance(set),
      elapsedMs,
      runtime
    },
    warnings: plotWarnings
  };
}
