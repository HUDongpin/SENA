import type { ENASet, Row } from "jena-js";

// jena-js >= 0.6 keeps the full rotation in the returned set: rotationColumns
// spans every rotated dimension and set.variance is normalized across ALL of
// them (rENA display semantics). SENA's published summaries and the committed
// rENA parity fixture describe only the DISPLAYED dimensions with variance
// renormalized over those (the fixture generator computes
// eigenvalues[1:2] / sum(eigenvalues[1:2])), so both derivations live here.

export function displayedRotationColumns(set: ENASet): string[] {
  const sample: Row | undefined = set.points[0];
  const displayed = sample ? set.rotation.rotationColumns.filter((column) => column in sample) : [];
  // Display output is truncated to the requested dimensions (default 2); fall
  // back to the leading rotation columns when no points exist to witness it.
  return displayed.length > 0 ? displayed : set.rotation.rotationColumns.slice(0, 2);
}

export function displayedVariance(set: ENASet): Record<string, number> {
  const columns = displayedRotationColumns(set);
  const total = columns.reduce((sum, column) => sum + (set.variance[column] ?? 0), 0);
  return Object.fromEntries(columns.map((column) => [column, total > 0 ? (set.variance[column] ?? 0) / total : 0]));
}
