import type {
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./analysis-runtime";

export type TimelineTraceProps = {
  windows: SenaTemporalWindow[];
  activeIndex: number;
  temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  onSelect: (index: number) => void;
};

export function TimelineTrace({
  windows,
  activeIndex,
  temporalRuntimeTrace,
  onSelect
}: TimelineTraceProps) {
  const chartWidth = 420;
  const chartHeight = 150;

  if (windows.length === 0) {
    return <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">No temporal windows yet.</div>;
  }

  type TemporalMetric = "socialConnectivity" | "conceptConnectivity" | "bridgeIntegration";
  const traceByWindowId = new Map((temporalRuntimeTrace?.windows ?? []).map((entry) => [entry.window.id, entry]));
  const gTotals = windows.map((window) => traceByWindowId.get(window.id)?.sena.matrixTotals.G ?? 0);
  const gTotalMax = Math.max(1, ...gTotals);
  const xFor = (index: number) => 32 + (index * (chartWidth - 64)) / Math.max(1, windows.length - 1);
  const yFor = (value: number) => chartHeight - 24 - Math.max(0, Math.min(1, value)) * (chartHeight - 50);
  const pathFor = (key: TemporalMetric) =>
    windows.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[key])}`).join(" ");
  const pathForG = () =>
    windows.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor((traceByWindowId.get(point.id)?.sena.matrixTotals.G ?? 0) / gTotalMax)}`).join(" ");
  const labelFor = (point: SenaTemporalWindow) => {
    if (point.mode === "stage") return point.label.slice(0, 10);
    if (point.mode === "turn-window") return `${point.centerTurn ?? point.startTurn}`;
    return `${point.startTurn}-${point.endTurn}`;
  };

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full" role="img" aria-label="Temporal SENA trace">
      {[0.25, 0.5, 0.75].map((step) => (
        <line key={step} x1="26" x2={chartWidth - 26} y1={yFor(step)} y2={yFor(step)} stroke="rgb(var(--foreground) / 0.10)" />
      ))}
      <path d={pathFor("socialConnectivity")} fill="none" stroke="#2f73ff" strokeWidth="4" strokeLinecap="round" />
      <path d={pathFor("conceptConnectivity")} fill="none" stroke="#a855f7" strokeWidth="4" strokeLinecap="round" />
      <path d={pathFor("bridgeIntegration")} fill="none" stroke="#24dcee" strokeWidth="4" strokeLinecap="round" />
      <path data-visual-role="temporal-trace-g-pair-line" d={pathForG()} fill="none" stroke="#fb7185" strokeWidth="4" strokeLinecap="round" />
      {windows.map((point, index) => (
        <g key={point.id} onClick={() => onSelect(index)} className="cursor-pointer">
          {index === activeIndex && (
            <line x1={xFor(index)} x2={xFor(index)} y1="16" y2={chartHeight - 20} stroke="rgb(var(--foreground) / 0.22)" strokeDasharray="4 6" />
          )}
          <circle cx={xFor(index)} cy={yFor(point.socialConnectivity)} r="4" fill="#2f73ff" />
          <circle cx={xFor(index)} cy={yFor(point.conceptConnectivity)} r="4" fill="#a855f7" />
          <circle cx={xFor(index)} cy={yFor(point.bridgeIntegration)} r="4" fill="#24dcee" />
          <circle cx={xFor(index)} cy={yFor(gTotals[index] / gTotalMax)} r="4" fill="#fb7185" />
          {index === activeIndex && (
            <circle cx={xFor(index)} cy={yFor(point.bridgeIntegration)} r="8" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.9" />
          )}
          <text x={xFor(index)} y={chartHeight - 4} textAnchor="middle" fill="rgb(var(--muted))" fontSize="11" fontWeight="800">
            {labelFor(point)}
          </text>
          <title>{`${point.label}: turns ${point.startTurn}-${point.endTurn}`}</title>
        </g>
      ))}
    </svg>
  );
}
