import type { ENASet } from "jena-js";
import { unitGroupValues } from "./results";
import {
  mannWhitneyU,
  mean,
  standardDeviation,
  studentTQuantile,
  welchT,
  type MannWhitneyResult,
  type WelchTResult
} from "./statistics";

/**
 * Group comparison on the projected space — webENA's Stats > Comparison.
 *
 * The scores compared are the plotted coordinates: one value per unit per
 * dimension, which is what a reader sees on the axis. Units are resolved
 * through the same map the plot uses for group means, so a comparison can
 * never disagree with the picture it sits beside.
 */

const unitKeyColumn = "ENA_UNIT";

function numeric(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

/** Distinct values of a metadata column, in the order the panel should list them. */
export function comparisonGroups(set: ENASet, column: string) {
  const values = new Set(unitGroupValues(set, column).values());
  return [...values].sort((left, right) => left.localeCompare(right));
}

/**
 * One score per unit per group for a dimension.
 *
 * A trajectory model emits several points per unit, so scores are averaged
 * within a unit first: a participant with five conversation steps is still one
 * observation, and counting the steps as five would inflate every test.
 */
export function unitScoresByGroup(set: ENASet, column: string, dimension: string) {
  const groupOf = unitGroupValues(set, column);
  const perUnit = new Map<string, { group: string; values: number[] }>();

  for (const point of set.points) {
    const unit = String(point[unitKeyColumn] ?? "");
    const group = groupOf.get(unit);
    if (!group) continue;
    const value = numeric(point[dimension]);
    if (value === null) continue;
    const existing = perUnit.get(unit);
    if (existing) existing.values.push(value);
    else perUnit.set(unit, { group, values: [value] });
  }

  const scores = new Map<string, number[]>();
  for (const { group, values } of perUnit.values()) {
    const list = scores.get(group) ?? [];
    list.push(mean(values));
    scores.set(group, list);
  }
  return scores;
}

export type DimensionComparison = {
  dimension: string;
  left: { group: string; n: number; mean: number; sd: number };
  right: { group: string; n: number; mean: number; sd: number };
  parametric: WelchTResult;
  nonParametric: MannWhitneyResult;
};

/** Both tests, per dimension, for one pair of groups. */
export function compareGroups(
  set: ENASet,
  column: string,
  dimensions: string[],
  leftGroup: string,
  rightGroup: string
): DimensionComparison[] {
  return dimensions.map((dimension) => {
    const scores = unitScoresByGroup(set, column, dimension);
    const left = scores.get(leftGroup) ?? [];
    const right = scores.get(rightGroup) ?? [];

    return {
      dimension,
      left: { group: leftGroup, n: left.length, mean: mean(left), sd: standardDeviation(left) },
      right: { group: rightGroup, n: right.length, mean: mean(right), sd: standardDeviation(right) },
      parametric: welchT(left, right),
      nonParametric: mannWhitneyU(left, right)
    };
  });
}

// --- Comparison geometry -----------------------------------------------------
// Everything below draws a comparison rather than tabulating one, and works from
// plain rows rather than a live `ENASet`: /workspace/ena has the set, but SENA's
// ENA Space and the Fusion plane have only the serialized jENA manifest, and the
// two routes must not compute a group mean two different ways (ADR 0008/0009).
// `set.points` and `manifest.outputs.points` are the same rows either way — both
// carry ENA_UNIT plus the metadata columns — so one implementation serves both.

/** The row shape both routes supply: jena-js `Row`, or its serialized twin. */
export type EnaComparisonRow = Record<string, unknown>;

/**
 * Group value per unit, read straight from rows.
 *
 * `unitGroupValues` above needs a live `ENASet` (for the `rawRows` fallback a
 * trajectory model requires). A serialized manifest has neither, and its point
 * rows always carry their metadata columns, so this is the same lookup with the
 * fallback that cannot apply removed rather than faked.
 */
export function enaRowGroupValues(rows: ReadonlyArray<EnaComparisonRow>, column: string) {
  const values = new Map<string, string>();
  if (!column) return values;
  for (const row of rows) {
    const raw = row[column];
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    const unit = String(row[unitKeyColumn] ?? "");
    if (!unit) continue;
    values.set(unit, String(raw));
  }
  return values;
}

/**
 * Q3 (ADR 0009): webENA's blue/orange is the default, with rENA's red/blue a
 * click away for readers trained on rENA figures. Two entries per palette,
 * because a subtraction network has exactly two signs and a comparison exactly
 * two groups; a third group falls back to reusing the first colour, which reads
 * as "this palette is for pairs" rather than inventing a hue.
 */
export const ENA_COMPARISON_PALETTES = {
  "blue-orange": ["#218EBF", "#EF691B"],
  "red-blue": ["#CC2222", "#2222CC"]
} as const;

export type EnaComparisonPaletteId = keyof typeof ENA_COMPARISON_PALETTES;

export const ENA_COMPARISON_PALETTE_IDS = Object.keys(
  ENA_COMPARISON_PALETTES
) as EnaComparisonPaletteId[];

/** The interval every comparison surface draws, and what its 95% means. */
export const ENA_COMPARISON_CONFIDENCE_LEVEL = 0.95;

export type EnaGroupInterval = {
  name: string;
  color: string;
  /** Units in the group — the n the interval is computed on, not row count. */
  n: number;
  /** Group mean, in **data** coordinates; the renderer owns the projection. */
  mean: { x: number; y: number };
  /**
   * `mean ± t₀.₉₇₅(n−1) · sd/√n` per dimension, in data coordinates. Null below
   * two units: one observation has no spread to estimate, and drawing a
   * zero-width box there would claim a certainty the data cannot support.
   */
  ci: { x: [number, number]; y: [number, number] } | null;
  unitIds: string[];
};

function numericCell(row: EnaComparisonRow, column: string) {
  const value = Number(row[column]);
  return Number.isFinite(value) ? value : null;
}

/** Half-width of the two-sided 95% t interval, or null when n < 2. */
function confidenceHalfWidth(values: number[]) {
  if (values.length < 2) return null;
  const sd = standardDeviation(values);
  if (!Number.isFinite(sd)) return null;
  const half =
    studentTQuantile(1 - (1 - ENA_COMPARISON_CONFIDENCE_LEVEL) / 2, values.length - 1) *
    (sd / Math.sqrt(values.length));
  return Number.isFinite(half) ? half : null;
}

/**
 * Group means with a 95% t confidence interval per drawn dimension.
 *
 * One observation per unit: a trajectory model emits a point per unit per
 * conversation, and counting five steps as five participants would shrink every
 * interval by more than a factor of two. `unitScoresByGroup` averages within a
 * unit for the same reason, and this is the two-dimensional form of it.
 */
export function enaGroupIntervals({
  points,
  xDimension,
  yDimension,
  groupOf,
  groups,
  palette = ENA_COMPARISON_PALETTES["blue-orange"]
}: {
  points: ReadonlyArray<EnaComparisonRow>;
  xDimension: string;
  yDimension: string;
  /** Unit key (`ENA_UNIT`) to group name; an unnamed unit contributes nothing. */
  groupOf: Map<string, string>;
  /** Restricts and orders the output; omitted lists every group, name-sorted. */
  groups?: readonly string[];
  palette?: readonly string[];
}): EnaGroupInterval[] {
  const perUnit = new Map<string, { group: string; xs: number[]; ys: number[] }>();

  for (const row of points) {
    const unit = String(row[unitKeyColumn] ?? "");
    const group = groupOf.get(unit);
    if (!group) continue;
    const x = numericCell(row, xDimension);
    const y = numericCell(row, yDimension);
    if (x === null || y === null) continue;
    const existing = perUnit.get(unit);
    if (existing) {
      existing.xs.push(x);
      existing.ys.push(y);
    } else {
      perUnit.set(unit, { group, xs: [x], ys: [y] });
    }
  }

  const collected = new Map<string, { xs: number[]; ys: number[]; unitIds: string[] }>();
  for (const [unit, entry] of perUnit) {
    const bucket = collected.get(entry.group) ?? { xs: [], ys: [], unitIds: [] };
    bucket.xs.push(mean(entry.xs));
    bucket.ys.push(mean(entry.ys));
    bucket.unitIds.push(unit);
    collected.set(entry.group, bucket);
  }

  const names = groups
    ? groups.filter((name) => collected.has(name))
    : [...collected.keys()].sort((left, right) => left.localeCompare(right));

  return names.map((name, index) => {
    const bucket = collected.get(name)!;
    const centre = { x: mean(bucket.xs), y: mean(bucket.ys) };
    const halfX = confidenceHalfWidth(bucket.xs);
    const halfY = confidenceHalfWidth(bucket.ys);
    return {
      name,
      color: palette[index % palette.length] ?? palette[0] ?? "#218EBF",
      n: bucket.unitIds.length,
      mean: centre,
      ci:
        halfX === null || halfY === null
          ? null
          : {
              x: [centre.x - halfX, centre.x + halfX] as [number, number],
              y: [centre.y - halfY, centre.y + halfY] as [number, number]
            },
      unitIds: bucket.unitIds
    };
  });
}
