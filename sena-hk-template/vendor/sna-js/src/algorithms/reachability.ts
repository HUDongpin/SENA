import { geodist } from "./geodist";
import type { GraphInput, GraphOptions } from "../core/types";

export interface ReachabilityResult {
  readonly matrix: number[][];
  readonly counts: number[];
}

export function reachability(input: GraphInput, options: GraphOptions = {}): ReachabilityResult {
  const distances = geodist(input, options).distances;
  const matrix: number[][] = distances.map((row, rowIndex) => {
    return row.map((distance, columnIndex) => {
      return columnIndex !== rowIndex && Number.isFinite(distance) && distance > 0 ? 1 : 0;
    });
  });
  const counts = matrix.map((row) => row.reduce((total, value) => total + value, 0));
  return { matrix, counts };
}

export function averagePathLength(input: GraphInput, options: GraphOptions = {}): number {
  const distances = geodist(input, options).distances;
  let totalDistance = 0;
  let pathCount = 0;

  for (let rowIndex = 0; rowIndex < distances.length; rowIndex += 1) {
    const row = distances[rowIndex]!;
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const distance = row[columnIndex] ?? Number.POSITIVE_INFINITY;
      if (columnIndex === rowIndex || !Number.isFinite(distance) || distance <= 0) continue;
      totalDistance += distance;
      pathCount += 1;
    }
  }

  return pathCount > 0 ? totalDistance / pathCount : 0;
}
