import { geodist } from "./geodist";
import type { GraphInput, GraphOptions } from "../core/types";

export interface ClosenessOptions extends GraphOptions {
  readonly rescale?: boolean;
}

export function closeness(input: GraphInput, options: ClosenessOptions = {}): number[] {
  const distances = geodist(input, options).distances;
  const raw = distances.map((row, rowIndex) => {
    let reachable = 0;
    let totalDistance = 0;

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const distance = row[columnIndex] ?? Number.POSITIVE_INFINITY;
      if (columnIndex === rowIndex || !Number.isFinite(distance) || distance <= 0) continue;
      reachable += 1;
      totalDistance += distance;
    }

    return totalDistance > 0 ? reachable / totalDistance : 0;
  });

  if (!options.rescale) return raw;

  const n = distances.length;
  if (n <= 1) return raw.map(() => 0);
  return raw.map((value, index) => {
    const reachable = distances[index]?.filter((distance, columnIndex) => {
      return columnIndex !== index && Number.isFinite(distance) && distance > 0;
    }).length ?? 0;
    return value * (reachable / (n - 1));
  });
}
