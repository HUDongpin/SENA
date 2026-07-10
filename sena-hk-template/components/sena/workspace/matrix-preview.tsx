export type MatrixPreviewProps = {
  title: string;
  rowLabels: string[];
  columnLabels: string[];
  values: number[][];
};

function formatMatrixNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function MatrixPreview({
  title,
  rowLabels,
  columnLabels,
  values
}: MatrixPreviewProps) {
  const rows = values.slice(0, 6);
  const columns = columnLabels.slice(0, 6);

  return (
    <div className="overflow-hidden rounded-lg border border-cardBorder/45 bg-background/30">
      <div className="border-b border-cardBorder/35 px-3 py-2 text-sm font-black text-foreground">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="text-muted">
              <th className="px-3 py-2 font-black">Layer</th>
              {columns.map((label) => (
                <th key={label} className="px-3 py-2 font-black">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowLabels[rowIndex]} className="border-t border-cardBorder/20">
                <td className="whitespace-nowrap px-3 py-2 font-black text-foreground">{rowLabels[rowIndex]}</td>
                {columns.map((_, columnIndex) => (
                  <td key={columnIndex} className="px-3 py-2 text-foreground/78">{formatMatrixNumber(row[columnIndex] ?? 0, 1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
