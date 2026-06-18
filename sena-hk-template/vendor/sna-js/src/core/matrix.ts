export function createNumberMatrix(rows: number, cols: number, fill = 0): number[][] {
  if (!Number.isInteger(rows) || rows < 0) throw new RangeError("rows must be a non-negative integer");
  if (!Number.isInteger(cols) || cols < 0) throw new RangeError("cols must be a non-negative integer");
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

export function toNestedMatrix(values: ArrayLike<number>, rows: number, cols: number): number[][] {
  if (values.length !== rows * cols) {
    throw new RangeError(`expected ${rows * cols} values, received ${values.length}`);
  }
  const out = createNumberMatrix(rows, cols);
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      out[i]![j] = values[i * cols + j] ?? 0;
    }
  }
  return out;
}

export function assertSquareMatrix(matrix: ReadonlyArray<ReadonlyArray<unknown>>): number {
  const n = matrix.length;
  for (let i = 0; i < n; i += 1) {
    const row = matrix[i];
    if (!row || row.length !== n) {
      throw new TypeError("graph matrix inputs must be square");
    }
  }
  return n;
}
