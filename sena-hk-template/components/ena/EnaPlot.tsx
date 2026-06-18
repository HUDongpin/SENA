"use client";

import type { ENAPlotModel } from "jena-js";

type PlotPoint = {
  x: number;
  y: number;
  label?: string;
};

type PlotNetworkNode = {
  id: string;
  label: string;
  x?: unknown;
  y?: unknown;
};

type PlotNetworkEdge = {
  source: string;
  target: string;
  name: string;
  weight: number;
};

type PlotNetworkGraph = {
  nodes: PlotNetworkNode[];
  edges: PlotNetworkEdge[];
};

type PlotTrace = {
  name: string;
  type?: string;
  color: string;
  points?: PlotPoint[];
  network?: PlotNetworkGraph;
};

function numberOrZero(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function rangeWithFallback(range: [number, number]) {
  if (range[0] === range[1]) return [range[0] - 1, range[1] + 1] as [number, number];
  return range;
}

export function EnaPlot({ model }: { model: ENAPlotModel }) {
  const width = 760;
  const height = 480;
  const padding = 56;
  const [xMin, xMax] = rangeWithFallback(model.axes.x.range);
  const [yMin, yMax] = rangeWithFallback(model.axes.y.range);
  const sx = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * (width - padding * 2);
  const sy = (y: number) => height - padding - ((y - yMin) / (yMax - yMin)) * (height - padding * 2);

  const traces = model.traces as PlotTrace[];
  const networkTraces = traces.filter((trace) => trace.network);
  const pointTraces = traces.filter((trace) => trace.points);

  function nodeById(network: PlotNetworkGraph, id: string) {
    return network.nodes.find((node) => node.id === id);
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-[22rem] w-full" role="img" aria-label={model.title}>
      <rect x="0" y="0" width={width} height={height} rx="8" fill="rgb(var(--background) / 0.38)" />

      {[0, 0.25, 0.5, 0.75, 1].map((step) => {
        const x = padding + step * (width - padding * 2);
        const y = padding + step * (height - padding * 2);
        return (
          <g key={step} opacity="0.42">
            <line x1={x} x2={x} y1={padding} y2={height - padding} stroke="rgb(var(--foreground) / 0.12)" />
            <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgb(var(--foreground) / 0.12)" />
          </g>
        );
      })}

      <line x1={padding} x2={width - padding} y1={sy(0)} y2={sy(0)} stroke="rgb(var(--foreground) / 0.34)" strokeDasharray="5 7" />
      <line x1={sx(0)} x2={sx(0)} y1={padding} y2={height - padding} stroke="rgb(var(--foreground) / 0.34)" strokeDasharray="5 7" />

      {networkTraces.map((trace) => {
        const network = trace.network;
        if (!network) return null;

        return (
          <g key={trace.name}>
            {network.edges.map((edge) => {
              const source = nodeById(network, edge.source);
              const target = nodeById(network, edge.target);
              if (!source || !target) return null;
              const x1 = sx(numberOrZero(source.x));
              const y1 = sy(numberOrZero(source.y));
              const x2 = sx(numberOrZero(target.x));
              const y2 = sy(numberOrZero(target.y));

              return (
                <line
                  key={`${trace.name}-${edge.name}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={trace.color}
                  strokeLinecap="round"
                  strokeWidth={Math.max(1.25, Math.min(8, 1.5 + Math.abs(edge.weight) * 8))}
                  opacity={0.24 + Math.min(0.48, Math.abs(edge.weight) * 1.8)}
                >
                  <title>{`${edge.name}: ${edge.weight.toFixed(3)}`}</title>
                </line>
              );
            })}
          </g>
        );
      })}

      {pointTraces.map((trace) => (
        <g key={trace.name}>
          {(trace.points ?? []).map((point, index) => {
            const isCode = trace.type === "nodes";
            const x = sx(point.x);
            const y = sy(point.y);

            return (
              <g key={`${trace.name}-${point.label ?? index}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={isCode ? 7 : 4.5}
                  fill={trace.color}
                  opacity={isCode ? 0.95 : 0.72}
                  stroke="rgb(var(--background))"
                  strokeWidth={isCode ? 2 : 1}
                >
                  <title>{point.label}</title>
                </circle>
                {isCode && (
                  <text x={x + 10} y={y + 4} fill="rgb(var(--foreground) / 0.82)" fontSize="12" fontWeight="800">
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}

      <text x={width / 2} y={height - 14} textAnchor="middle" fill="rgb(var(--muted))" fontSize="12" fontWeight="800">
        {model.axes.x.title}
      </text>
      <text
        x="18"
        y={height / 2}
        textAnchor="middle"
        fill="rgb(var(--muted))"
        fontSize="12"
        fontWeight="800"
        transform={`rotate(-90 18 ${height / 2})`}
      >
        {model.axes.y.title}
      </text>
    </svg>
  );
}
