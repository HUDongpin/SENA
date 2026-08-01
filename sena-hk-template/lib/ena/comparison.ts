import type { ENASet } from "jena-js";
import { unitGroupValues } from "./results";
import { mannWhitneyU, mean, standardDeviation, welchT, type MannWhitneyResult, type WelchTResult } from "./statistics";

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
