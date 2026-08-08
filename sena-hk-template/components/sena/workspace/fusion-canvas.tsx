import { useMemo } from "react";
import { hexPoints } from "@/lib/sena/hex";
import {
  buildConceptPairContributionMap,
  buildEdgeStrokeScale,
  readableEdgeStrokeSignal,
  readableEdgeStrokeWidth
} from "@/lib/sena/visual-encoding";
import { cn } from "@/lib/utils";
import type {
  SenaEdge,
  SenaEnaManifest,
  SenaLayer,
  SenaLayoutMode,
  SenaModel
} from "./analysis-runtime";
import {
  computeFusionLayout,
  fusionCanvasCenter as center,
  fusionCanvasHeight as height,
  fusionCanvasWidth as width,
  fusionConceptGuideRadius as conceptGuideRadius,
  type PositionedSenaNode as PositionedNode,
  type SenaJointEmbeddingOperator
} from "./fusion-layout";
import { clampFusionPlotZoom } from "./workspace-shell-panels";

function formatCanvasNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function nodeRadius(node: PositionedNode) {
  if (node.kind === "concept") return 28 + Math.min(10, node.metrics.weightedDegree * 0.75);
  return 25 + Math.min(12, Math.log1p(Math.max(0, node.metrics.socialStrength)) * 3);
}

function readableLabelWidth(label: string, min = 72, max = 142) {
  return Math.min(max, Math.max(min, label.length * 7.6 + 28));
}

function readableConceptGlyph(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("question")) return "Q";
  if (normalized.includes("explanation")) return "X";
  if (normalized.includes("coordination")) return "Co";
  const initials = label
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || label.slice(0, 2).toUpperCase();
}

// The Fusion Canvas draws SENA's explanatory grammar: hexagonal person nodes,
// the solid purple W mesh, cyan bridge ribbons, and outer-orbit social arcs.
// It is the right grammar for the explanatory and joint layouts, where a node's
// position is a layout choice rather than a measurement.
//
// The ENA-space layout no longer renders here. It used to, and carrying jena-js's
// `max(1, |w| * 4)` edge law onto a 900px canvas with r28 code discs meant
// multiplying it by 5.6 just to clear the discs — a node-size decision leaking
// into an edge encoding, on top of sizing those discs by SENA's weightedDegree
// while the geometry underneath was jENA's. ENA space now renders through
// components/sena/workspace/ena-space-plot.tsx, which uses the same <EnaPlot>
// renderer as /workspace/ena (ADR 0008).

function edgeStroke(edge: SenaEdge) {
  if (edge.layer === "social") return "#2f73ff";
  if (edge.layer === "concept") return "url(#concept-link-gradient)";
  return "url(#bridge-gradient)";
}

function straightEdgePath(source: PositionedNode, target: PositionedNode) {
  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
}

function socialArcPath(source: PositionedNode, target: PositionedNode) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const midpoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2
  };
  let outwardX = midpoint.x - center.x;
  let outwardY = midpoint.y - center.y;
  const outwardLength = Math.sqrt(outwardX * outwardX + outwardY * outwardY);

  if (outwardLength < 16) {
    outwardX = -dy / distance;
    outwardY = dx / distance;
  } else {
    outwardX /= outwardLength;
    outwardY /= outwardLength;
  }

  const baseCurve = Math.min(260, Math.max(118, distance * 0.34));
  const centerClearance = Math.max(0, conceptGuideRadius + 84 - outwardLength) * 2.05;
  const curve = Math.max(baseCurve, centerClearance);
  const control = {
    x: midpoint.x + outwardX * curve,
    y: midpoint.y + outwardY * curve
  };

  return `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`;
}

function bridgeRibbonPath(source: PositionedNode, target: PositionedNode) {
  const mx = (source.x + target.x) / 2;
  const my = (source.y + target.y) / 2;
  const curve = source.kind === "person" ? -32 : 32;
  return `M ${source.x} ${source.y} Q ${mx} ${my + curve} ${target.x} ${target.y}`;
}

function edgePath(edge: SenaEdge, positions: Map<string, PositionedNode>) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target) return "";
  // The social arc and bridge ribbon curve away from the straight line to keep
  // the ring layout legible, which is sound precisely because a node's position
  // here carries no quantity.
  if (edge.layer === "social") return socialArcPath(source, target);
  if (edge.layer === "bridge") return bridgeRibbonPath(source, target);
  return straightEdgePath(source, target);
}

export function Canvas({
  model,
  layout,
  jointEmbeddingOperator,
  enaManifest,
  layers,
  threshold,
  selectedId,
  revealedLabelIds,
  onSelect,
  zoom = 1,
  className
}: {
  model: SenaModel;
  layout: SenaLayoutMode;
  jointEmbeddingOperator: SenaJointEmbeddingOperator;
  enaManifest: SenaEnaManifest;
  layers: Record<SenaLayer, boolean>;
  threshold: number;
  selectedId: string;
  revealedLabelIds: string[];
  onSelect: (id: string) => void;
  zoom?: number;
  className?: string;
}) {
  const nodes = useMemo(() => computeFusionLayout(model, layout, enaManifest, jointEmbeddingOperator), [enaManifest, jointEmbeddingOperator, layout, model]);
  const positions = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const revealedLabelSet = useMemo(() => new Set(revealedLabelIds), [revealedLabelIds]);
  const edges = model.edges.filter((edge) => layers[edge.layer] && edge.normalizedWeight >= threshold);
  const conceptPairContributions = useMemo(() => buildConceptPairContributionMap(model), [model]);

  const conceptEdges = edges.filter((edge) => edge.layer === "concept");
  const socialEdges = edges.filter((edge) => edge.layer === "social");
  const bridgeEdges = edges.filter((edge) => edge.layer === "bridge");
  const edgeStrokeScale = buildEdgeStrokeScale(edges, conceptPairContributions);
  const safeZoom = clampFusionPlotZoom(zoom);
  const viewBoxWidth = width / safeZoom;
  const viewBoxHeight = height / safeZoom;
  const viewBoxX = center.x - viewBoxWidth / 2;
  const viewBoxY = center.y - viewBoxHeight / 2;

  return (
    <svg
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
      className={cn("h-[40rem] w-full max-w-full", className)}
      role="img"
      aria-label="SENA Fusion Canvas"
      data-testid="sena-fusion-canvas"
      data-visual-scope="sena-fusion"
      data-plot-zoom={safeZoom.toFixed(3)}
    >
      <defs>
        <linearGradient id="concept-link-gradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#735cf6" />
          <stop offset="100%" stopColor="#b14cf1" />
        </linearGradient>
        <linearGradient id="bridge-gradient" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#24dcee" />
          <stop offset="54%" stopColor="#5bd7ff" />
          <stop offset="100%" stopColor="#78adff" />
        </linearGradient>
        <filter id="concept-link-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0.50 0 0 0 0.18 0 0.25 0 0 0.10 0 0 0.85 0 0.75 0 0 0 0.52 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="social-link-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0.12 0 0 0 0.04 0 0.36 0 0 0.18 0 0 0.95 0 0.90 0 0 0 0.38 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x={viewBoxX} y={viewBoxY} width={viewBoxWidth} height={viewBoxHeight} rx="8" fill="rgb(var(--background) / 0.42)" />
      <rect x="0" y="0" width={width} height={height} rx="8" fill="rgb(var(--background) / 0.18)" />
      <g opacity="0.32">
        {Array.from({ length: 15 }, (_, index) => index * 64).map((x) => (
          <line key={`x-${x}`} x1={x} x2={x} y1="0" y2={height} stroke="rgb(var(--foreground) / 0.08)" />
        ))}
        {Array.from({ length: 11 }, (_, index) => index * 62).map((y) => (
          <line key={`y-${y}`} x1="0" x2={width} y1={y} y2={y} stroke="rgb(var(--foreground) / 0.08)" />
        ))}
      </g>
      <circle
        cx={center.x}
        cy={center.y}
        r={conceptGuideRadius}
        fill="none"
        stroke="#895dff"
        strokeOpacity="0.34"
        strokeWidth="1.5"
        strokeDasharray="8 12"
        data-testid="sena-fusion-center-guide"
        data-layer="concept"
        data-visual-role="concept-space-guide"
      />

      <g>
        {bridgeEdges.map((edge) => {
          const path = edgePath(edge, positions);
          const strokeWidth = readableEdgeStrokeWidth(edge, edgeStrokeScale);
          const strokeSignal = readableEdgeStrokeSignal(edge, edgeStrokeScale);
          return (
            <g key={edge.id}>
              <path
                data-layer={edge.layer}
                data-visual-role="fusion-readable-link-halo"
                d={path}
                fill="none"
                stroke="rgb(var(--background) / 0.88)"
                strokeWidth={strokeWidth + 7}
                strokeLinecap="round"
                opacity="0.9"
                pointerEvents="none"
              />
              <path
                data-testid={`sena-edge-${edge.id}`}
                data-layer={edge.layer}
                data-visual-role="person-code-bridge-ribbon"
                data-edge-weight={formatCanvasNumber(edge.weight)}
                data-edge-normalized-weight={formatCanvasNumber(edge.normalizedWeight, 4)}
                data-edge-scaled-weight={formatCanvasNumber(edge.scaledWeight, 4)}
                data-edge-visual-salience={formatCanvasNumber(strokeSignal, 4)}
                data-edge-visual-width={formatCanvasNumber(strokeWidth, 2)}
                d={path}
                fill="none"
                stroke={edgeStroke(edge)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={selectedId === edge.id ? 0.95 : 0.42 + edge.normalizedWeight * 0.34}
                onClick={() => onSelect(edge.id)}
                className="cursor-pointer transition-opacity"
              >
                <title>{`${edge.label}; weight ${formatCanvasNumber(edge.weight)}, scaled ${formatCanvasNumber(edge.scaledWeight)}, visual width ${formatCanvasNumber(strokeWidth, 1)}`}</title>
              </path>
            </g>
          );
        })}
        {conceptEdges.map((edge) => {
          const path = edgePath(edge, positions);
          const strokeWidth = readableEdgeStrokeWidth(edge, edgeStrokeScale);
          const strokeSignal = readableEdgeStrokeSignal(edge, edgeStrokeScale);
          return (
            <g key={edge.id}>
              <path
                data-layer={edge.layer}
                data-visual-role="fusion-readable-link-halo"
                d={path}
                fill="none"
                stroke="rgb(var(--background) / 0.94)"
                strokeWidth={strokeWidth + 8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.95"
                pointerEvents="none"
              />
              <path
                data-testid={`sena-edge-${edge.id}`}
                data-layer={edge.layer}
                data-visual-role="ena-solid-concept-link"
                data-edge-weight={formatCanvasNumber(edge.weight)}
                data-edge-normalized-weight={formatCanvasNumber(edge.normalizedWeight, 4)}
                data-edge-scaled-weight={formatCanvasNumber(edge.scaledWeight, 4)}
                data-edge-visual-salience={formatCanvasNumber(strokeSignal, 4)}
                data-edge-visual-width={formatCanvasNumber(strokeWidth, 2)}
                d={path}
                fill="none"
                stroke={edgeStroke(edge)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={selectedId === edge.id ? 0.98 : 0.68 + edge.normalizedWeight * 0.24}
                filter="url(#concept-link-glow)"
                onClick={() => onSelect(edge.id)}
                className="cursor-pointer"
              >
                <title>{`${edge.label}; weight ${formatCanvasNumber(edge.weight)}, scaled ${formatCanvasNumber(edge.scaledWeight)}, visual width ${formatCanvasNumber(strokeWidth, 1)}`}</title>
              </path>
            </g>
          );
        })}
        {socialEdges.map((edge) => {
          const path = edgePath(edge, positions);
          const strokeWidth = readableEdgeStrokeWidth(edge, edgeStrokeScale);
          const strokeSignal = readableEdgeStrokeSignal(edge, edgeStrokeScale);
          return (
            <g key={edge.id}>
              <path
                data-layer={edge.layer}
                data-visual-role="fusion-readable-link-halo"
                d={path}
                fill="none"
                stroke="rgb(var(--background) / 0.9)"
                strokeWidth={strokeWidth + 7}
                strokeLinecap="round"
                opacity="0.9"
                pointerEvents="none"
              />
              <path
                data-testid={`sena-edge-${edge.id}`}
                data-layer={edge.layer}
                data-visual-role="outer-social-arc"
                data-arc-route="outer-orbit"
                data-edge-weight={formatCanvasNumber(edge.weight)}
                data-edge-normalized-weight={formatCanvasNumber(edge.normalizedWeight, 4)}
                data-edge-scaled-weight={formatCanvasNumber(edge.scaledWeight, 4)}
                data-edge-visual-salience={formatCanvasNumber(strokeSignal, 4)}
                data-edge-visual-width={formatCanvasNumber(strokeWidth, 2)}
                d={path}
                fill="none"
                stroke={edgeStroke(edge)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={selectedId === edge.id ? 0.98 : 0.72 + edge.normalizedWeight * 0.2}
                filter="url(#social-link-glow)"
                onClick={() => onSelect(edge.id)}
                className="cursor-pointer"
              >
                <title>{`${edge.label}; weight ${formatCanvasNumber(edge.weight)}, scaled ${formatCanvasNumber(edge.scaledWeight)}, visual width ${formatCanvasNumber(strokeWidth, 1)}`}</title>
              </path>
            </g>
          );
        })}
      </g>

      <g>
        {nodes.map((node) => {
          const selected = selectedId === node.id;
          const radius = nodeRadius(node);
          if (node.kind === "concept") {
            const showReadableLabel = selected || revealedLabelSet.has(node.id);
            const labelWidth = readableLabelWidth(node.label, 82, 152);
            const labelOffset = node.y > center.y + 86 ? -(radius + 18) : radius + 20;
            const labelY = node.y + labelOffset;
            const glyph = readableConceptGlyph(node.label);
            return (
              <g
                key={node.id}
                data-testid={`sena-node-${node.id}`}
                data-node-kind={node.kind}
                data-node-label={node.label}
                data-node-glyph={glyph}
                onClick={() => onSelect(node.id)}
                className="cursor-pointer"
                filter={selected ? "url(#node-glow)" : undefined}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill={node.color}
                  opacity="0.94"
                  stroke={selected ? "#ffffff" : "rgb(var(--background))"}
                  strokeWidth={selected ? 4 : 2}
                  data-visual-role="ena-concept-circle-node"
                />
                <text x={node.x} y={node.y + (glyph.length > 1 ? 5 : 8)} textAnchor="middle" fill="white" fontSize={glyph.length > 1 ? 17 : 26} fontWeight="950">
                  {glyph}
                </text>
                {showReadableLabel && (
                  <g data-testid="fusion-selected-node-label" data-node-id={node.id} data-selected={selected ? "true" : "false"}>
                    <rect
                      x={node.x - labelWidth / 2}
                      y={labelY - 13}
                      width={labelWidth}
                      height="27"
                      rx="13.5"
                      fill="rgb(var(--background) / 0.94)"
                      stroke="rgb(var(--foreground) / 0.14)"
                      strokeWidth="1"
                      data-visual-role="fusion-readable-label-plate"
                    />
                    <text x={node.x} y={labelY + 5} textAnchor="middle" fill="rgb(var(--foreground))" fontSize="12.5" fontWeight="900">
                      {node.label}
                    </text>
                  </g>
                )}
                <title>{node.description}</title>
              </g>
            );
          }

          const labelWidth = readableLabelWidth(node.label, 78, 154);
          const labelY = node.y + radius + 24;
          const showReadableLabel = selected || revealedLabelSet.has(node.id);
          return (
            <g key={node.id} data-testid={`sena-node-${node.id}`} data-node-kind={node.kind} onClick={() => onSelect(node.id)} className="cursor-pointer" filter={selected ? "url(#node-glow)" : undefined}>
              <polygon
                points={hexPoints(node.x, node.y, radius + 6)}
                fill="rgb(var(--background) / 0.72)"
                stroke="#24dcee"
                strokeWidth={selected ? 4 : 2}
                data-visual-role="sna-person-hex-node"
              />
              <polygon
                points={hexPoints(node.x, node.y, radius)}
                fill="#f8fbff"
              />
              <text x={node.x} y={node.y + 7} textAnchor="middle" fill="#0f172a" fontSize="18" fontWeight="950">
                {node.initials}
              </text>
              {showReadableLabel && (
                <g data-testid="fusion-selected-node-label" data-node-id={node.id} data-selected={selected ? "true" : "false"}>
                  <rect
                    x={node.x - labelWidth / 2}
                    y={labelY - 14}
                    width={labelWidth}
                    height="28"
                    rx="14"
                    fill="rgb(var(--background) / 0.94)"
                    stroke="rgb(var(--foreground) / 0.14)"
                    strokeWidth="1"
                    data-visual-role="fusion-readable-label-plate"
                  />
                  <text x={node.x} y={labelY + 5} textAnchor="middle" fill="rgb(var(--foreground))" fontSize="13" fontWeight="900">
                    {node.label}
                  </text>
                </g>
              )}
              <title>{`${node.label}: ${node.role}`}</title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
