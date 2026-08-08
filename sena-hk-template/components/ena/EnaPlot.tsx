"use client";

import { useState } from "react";
import type { ENAPlotModel, ENAPlotPoint, ENAPlotTrace } from "jena-js/plot";
import {
  JENA_AXIS_TITLE_FONT_SIZE,
  JENA_NETWORK_NODE_LABEL_FONT_SIZE,
  JENA_PLOT_TITLE_FONT_SIZE,
  JENA_POINT_LABEL_FONT_SIZE,
  JENA_POINT_LABEL_OFFSET,
  JENA_POINT_STROKE_WIDTH,
  JENA_TRAJECTORY_OPACITY,
  JENA_TRAJECTORY_STROKE_WIDTH,
  RENA_EDGE_WIDTH_RANGE,
  axisOrigin,
  axisTitleWithVariance,
  jenaPlotGeometry,
  nodeLabelPlacements,
  plotLegendEntries,
  pointTraceRadius,
  projectPoint,
  styleRenaNetwork
} from "@/lib/ena/plot-encoding";
import {
  clampEnaPlotScale,
  defaultEnaPlotDisplay,
  enaPlotTraceLabelsVisible,
  type EnaPlotInkDisplay
} from "@/lib/ena/plot-display";
import type { EnaLowRankAssessment } from "@/lib/ena/low-rank";

// SENA renders the ENA projection in React rather than calling jena-js's
// DOM-mutating renderENAPlot. The geometry — positions, axis origin, edge
// endpoints — comes from lib/ena/plot-encoding and is identical to jena-js and
// rENA (proven to machine precision). The network *ink* follows rENA's
// ena.plot.network grammar, not jena-js's minimal renderer: nodes are solid and
// sized by connectivity, and each edge's width, opacity, and colour-saturation
// scale together with its weight. That is the canonical ENA look webENA and
// epistemicnetwork.org present.
//
// Two SENA layers sit on top, both additive and both marked in the DOM with
// data-sena-layer so the parity suite can ignore them: a subordinate grid and a
// legend, plus variance shares appended to the axis titles. rENA draws nodes in
// literal black on white; SENA maps that to the theme foreground so it survives
// both light and dark surfaces — the one intentional, role-preserving deviation.

const { width, height, margin } = jenaPlotGeometry;

const AXIS_STROKE = "rgb(var(--foreground) / 0.30)";
const AXIS_TITLE_FILL = "rgb(var(--muted))";
const POINT_LABEL_FILL = "rgb(var(--foreground) / 0.78)";
const NODE_LABEL_FILL = "rgb(var(--foreground))";
const TITLE_FILL = "rgb(var(--foreground))";
/** The paper colour — unit markers stroke against it, the way rENA strokes points. */
const PAPER = "rgb(var(--background))";
/** rENA fills nodes with literal black; SENA uses the theme foreground. */
const NODE_FILL = "rgb(var(--foreground))";
/** Thin paper-coloured ring keeps a large node from swallowing the edges under it. */
const NODE_RING = PAPER;
/** Selection is SENA-only chrome; /workspace/ena passes no selection and never draws it. */
const SELECTION_RING = "rgb(var(--foreground) / 0.55)";
/** rENA's positive-network palette entry (#386CB0) — the base edge hue. */
const RENA_EDGE_BASE = "#386CB0";

const GRID_STEPS = [0.25, 0.5, 0.75];

/** Ink settings that reproduce jena-js exactly — what an unconfigured plot uses. */
const defaultEnaPlotInk: EnaPlotInkDisplay = {
  unitScale: defaultEnaPlotDisplay.unitScale,
  edgeWeightScale: defaultEnaPlotDisplay.edgeWeightScale,
  showEdgeWeights: defaultEnaPlotDisplay.showEdgeWeights,
  showCodeLabels: defaultEnaPlotDisplay.showCodeLabels,
  showUnitLabels: defaultEnaPlotDisplay.showUnitLabels,
  showGroupLabels: defaultEnaPlotDisplay.showGroupLabels
};

/**
 * Above this many unit points *in the whole plot*, per-unit labels stop being
 * readable and become a solid block of overlapping text — 24 students in one
 * classroom discussion is already well past it. jena-js labels every point
 * unconditionally; SENA labels small plots and falls back to hover for large
 * ones.
 *
 * The count has to be plot-wide, not per trace: a trajectory plot splits the
 * same units across one trace each, so a per-trace test sees three points at a
 * time and happily labels all 69 of them.
 */
const UNIT_LABEL_LIMIT = 8;

/** Traces that identify units. Code and group-mean labels are always drawn. */
function isUnitTrace(trace: ENAPlotTrace) {
  return trace.type === "points" || trace.type === "trajectory";
}

// --- SENA additive overlay ---------------------------------------------------
// SENA's ENA Space renders through this component so the two routes cannot
// drift (ADR 0008). What SENA adds on top — person-code bridges, social ties,
// unit identity — is additive: every element carries data-sena-layer, none of
// it displaces a glyph jena-js would have drawn, and with `overlay` omitted the
// DOM is exactly what /workspace/ena produces. The parity suite asserts that by
// stripping [data-sena-layer] and comparing trees.
//
// Overlay geometry arrives in **data coordinates**, not pixels: the renderer
// owns the projection, so an overlay cannot introduce a second one.

export type EnaPlotOverlayEdge = {
  id: string;
  label: string;
  kind: "bridge" | "social";
  source: { x: number; y: number };
  target: { x: number; y: number };
  weight: number;
  /** |weight| normalized across the overlay's own layer, in [0,1]. */
  normalizedWeight: number;
};

export type EnaPlotOverlayMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type EnaPlotOverlayLegendEntry = {
  name: string;
  color: string;
  kind: "line" | "dot";
};

/**
 * A group mean and its 95% confidence interval, in data coordinates.
 *
 * jena-js's own `group` trace carries a mean point and nothing else —
 * `ENAPlotTrace` has `points` and `network` and no interval geometry at all — so
 * an interval cannot be expressed as a trace and has to ride the additive
 * channel instead. That is not a workaround: the mean is jena-js's quantity and
 * the interval is SENA's addition to the figure, so the marked layer is where it
 * belongs.
 */
export type EnaPlotOverlayGroup = {
  name: string;
  color: string;
  mean: { x: number; y: number };
  /** Null when the group has fewer than two units — mean only, no box. */
  ci: { x: [number, number]; y: [number, number] } | null;
  /** Units behind the mean; printed in the tooltip so n is never implied. */
  n?: number;
};

export type EnaPlotOverlay = {
  edges?: EnaPlotOverlayEdge[];
  /** Units eligible for the identity glyph when selected or hovered. */
  markers?: EnaPlotOverlayMarker[];
  legend?: EnaPlotOverlayLegendEntry[];
  /** Comparison means + intervals (ADR 0009 Q3 / D6). */
  groups?: EnaPlotOverlayGroup[];
};

const OVERLAY_BRIDGE_COLOR = "#24dcee";
const OVERLAY_SOCIAL_COLOR = "#2f73ff";
/** Overlay ink never outranks the network: opacity ceiling and a width cap. */
const OVERLAY_MAX_OPACITY = 0.5;
const OVERLAY_MIN_OPACITY = 0.18;

function overlayColor(kind: EnaPlotOverlayEdge["kind"]) {
  return kind === "bridge" ? OVERLAY_BRIDGE_COLOR : OVERLAY_SOCIAL_COLOR;
}

/**
 * Median drawn network width. Overlay strokes are capped here so a dense bridge
 * layer cannot read as the strongest structure in an ENA plot — the failure the
 * fusion grammar had when it drew bridges at fusion weight over ENA geometry.
 */
function medianWidth(widths: number[]) {
  if (widths.length === 0) return RENA_EDGE_WIDTH_RANGE[0];
  const sorted = [...widths].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function hexPoints(x: number, y: number, radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 6 + (index * Math.PI * 2) / 6;
    return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`;
  }).join(" ");
}

function traceKey(trace: ENAPlotTrace, index: number) {
  return `${trace.type}-${trace.name}-${index}`;
}

function positionKey(x: number, y: number) {
  return `${Math.round(x * 100)}:${Math.round(y * 100)}`;
}

function pointKey(point: ENAPlotPoint, index: number) {
  return point.label ? `${point.label}-${index}` : `point-${index}`;
}

function formatWeight(weight: number) {
  return weight.toFixed(3);
}

/** Clamp the plot zoom to a sane range so the viewBox never inverts or drifts. */
export function clampPlotZoom(zoom: number) {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(4, Math.max(0.6, zoom));
}

export function EnaPlot({
  model,
  variance,
  lowRank,
  className,
  zoom = 1,
  ink,
  overlay,
  selectedId,
  onSelect,
  x: viewportX,
  y: viewportY,
  width: viewportWidth,
  height: viewportHeight
}: {
  model: ENAPlotModel;
  variance?: Record<string, number>;
  /**
   * Low-rank assessment from `assessEnaLowRank` (docs/validation/
   * ena-window-rank-audit.md). When set, a badge names the degenerate axis so
   * the plot cannot silently present machine-epsilon noise as vertical
   * structure. Additive SENA chrome — marked, and absent when omitted.
   */
  lowRank?: EnaLowRankAssessment | null;
  className?: string;
  /** >1 magnifies about the plot centre; the viewBox stays centred on (0,0). */
  zoom?: number;
  /**
   * webENA's Plot Tools ink settings — marker scale, edge scale, which labels
   * are drawn. Every default reproduces jena-js exactly, so a caller that omits
   * this (the parity suites, the SENA canvas) renders the same DOM as before
   * the controls existed.
   */
  ink?: Partial<EnaPlotInkDisplay>;
  /** SENA's additive layers. Omit for a plain ENA plot. */
  overlay?: EnaPlotOverlay;
  selectedId?: string;
  onSelect?: (id: string) => void;
  /**
   * Nested-viewport placement, for embedding this plot inside a larger SVG
   * (the Fusion plane, ADR 0009). A nested `<svg>` with no x/y/width/height
   * fills 100% of its parent viewport, so the host needs a way to say where
   * the plane sits — and it has to be said here rather than by a wrapper
   * `<g transform>`, which cannot size an inner viewport at all.
   *
   * Omitted is the only shape /workspace/ena and ENA Space ever use, and an
   * omitted attribute is never emitted, so the standalone DOM is byte-for-byte
   * what it was before the props existed (pinned by the parity suites).
   */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const inkDisplay: EnaPlotInkDisplay = { ...defaultEnaPlotInk, ...ink };
  const unitScale = clampEnaPlotScale(inkDisplay.unitScale);
  const edgeWeightScale = clampEnaPlotScale(inkDisplay.edgeWeightScale);
  const [hoveredId, setHoveredId] = useState("");
  const interactive = typeof onSelect === "function";
  const safeZoom = clampPlotZoom(zoom);
  const viewBoxWidth = width / safeZoom;
  const viewBoxHeight = height / safeZoom;
  const viewBoxX = width / 2 - viewBoxWidth / 2;
  const viewBoxY = height / 2 - viewBoxHeight / 2;
  // The low-rank badge is a disclosure, not a datum, so it is placed against the
  // *visible* box rather than the fixed canvas. Anchored to the canvas it left
  // the frame from about 1.05x up — and in ENA Space, where the badge is the
  // only on-plot disclosure, zooming in silently removed the caveat. It
  // counter-scales so it reads at one size whatever the zoom, the way plot
  // chrome should, and the anchor is clamped to the canvas so zooming out past
  // 1x (which widens the box beyond the paper) keeps it on the plate.
  const lowRankBadgeScale = 1 / safeZoom;
  const lowRankBadgeWidth = lowRank ? lowRank.badge.length * 6.4 + 36 : 0;
  const lowRankBadgeX =
    Math.min(width, viewBoxX + viewBoxWidth) - (margin + lowRankBadgeWidth) * lowRankBadgeScale;
  const lowRankBadgeY = Math.max(0, viewBoxY) + 10 * lowRankBadgeScale;
  const origin = axisOrigin(model);
  const networkTraces = model.traces.filter((trace) => trace.type === "network");
  const hasNetwork = networkTraces.length > 0;
  // rENA's network nodes ARE the code markers, sized by connectivity. When a
  // network is present the separate `nodes` trace (jena-js's plain code dots)
  // would draw a redundant pip inside every node, so it is suppressed — both in
  // the plot and in the legend.
  const overlayTraces = model.traces.filter(
    (trace) => trace.type !== "network" && !(hasNetwork && trace.type === "nodes")
  );
  // rENA colour for the single mean network; per-trace colour when grouped —
  // kept in step with the render below so the legend swatch matches the ink.
  const networkLegendColor = networkTraces.length > 1 ? undefined : RENA_EDGE_BASE;
  const legend = plotLegendEntries(model)
    .filter((entry) => !(hasNetwork && entry.type === "nodes"))
    .map((entry) =>
      entry.type === "network" && networkLegendColor ? { ...entry, color: networkLegendColor } : entry
    );
  // Styled once and reused: the label-suppression pass, the render, and the
  // overlay width cap all need the same numbers, and styling twice with two
  // different base colours was already a latent source of disagreement.
  const styledNetworks = networkTraces.map((trace) => ({
    trace,
    styled: trace.network
      ? styleRenaNetwork(
          model,
          trace.network,
          networkTraces.length > 1 ? trace.color : RENA_EDGE_BASE
        )
      : null
  }));
  // A network trace already carries the rotated code positions, so a plot built
  // with both addNetwork and addNodes — which is what lib/ena/results.ts builds,
  // and what jena-js's own examples build — stamps each code label twice at two
  // slightly different offsets, which reads as smeared bold text. Draw the
  // network label and let the overlapping overlay label stand down.
  const networkLabelPositions = new Set(
    styledNetworks.flatMap(({ styled }) =>
      styled ? styled.nodes.map((node) => positionKey(node.x, node.y)) : []
    )
  );
  const overlayWidthCap = medianWidth(
    styledNetworks.flatMap(({ styled }) => (styled ? styled.edges.map((edge) => edge.strokeWidth) : []))
  );
  const overlayEdges = overlay?.edges ?? [];
  const overlayMarkers = overlay?.markers ?? [];
  const overlayLegend = overlay?.legend ?? [];
  const overlayGroups = overlay?.groups ?? [];
  const legendRows = legend.length + overlayLegend.length;
  /** The separator rule between ENA rows and SENA rows costs one row of padding. */
  const legendExtraHeight = overlayLegend.length > 0 ? 8 : 0;
  const legendHeight = legendRows * 20 + legendExtraHeight + 12;
  // Same anchoring as the low-rank badge, for the same reason: the legend is
  // chrome read against the *visible* box, and pinned to the canvas its left
  // edge left the frame from about 1.14x up — a zoomed plot lost the key to its
  // own ink. webENA's placement (lower-left of the plotting area) is what is
  // preserved here; it is the coordinate space that changes, not the grammar.
  const legendScale = 1 / safeZoom;
  const legendX = Math.max(0, viewBoxX) + margin * legendScale;
  const legendY =
    Math.min(height, viewBoxY + viewBoxHeight) - (margin + legendHeight + 6) * legendScale;
  const unitPointCount = model.traces
    .filter(isUnitTrace)
    .reduce((total, trace) => total + (trace.points?.length ?? 0), 0);
  const unitLabelsFit = unitPointCount <= UNIT_LABEL_LIMIT;
  const xTitle = axisTitleWithVariance(model.axes.x.title, variance);
  const yTitle = axisTitleWithVariance(model.axes.y.title, variance);
  const description = `${model.title}. ${model.traces.length} traces on ${xTitle} by ${yTitle}.`;
  // Spread rather than passed straight through: an `undefined` attribute is
  // omitted by React anyway, but building the object keeps the embedded and
  // standalone renders one code path with one attribute order.
  const viewport = {
    ...(viewportX === undefined ? {} : { x: viewportX }),
    ...(viewportY === undefined ? {} : { y: viewportY }),
    ...(viewportWidth === undefined ? {} : { width: viewportWidth }),
    ...(viewportHeight === undefined ? {} : { height: viewportHeight })
  };

  return (
    <svg
      {...viewport}
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? "h-full min-h-[22rem] w-full"}
      role="img"
      aria-label={description}
      data-testid="ena-plot"
      data-plot-dimensions={model.dimensions.join(",")}
      data-plot-zoom={safeZoom.toFixed(3)}
    >
      <desc>{description}</desc>

      {/* White paper canvas, the way rENA / webENA present ENA plots. --card is
          pure white on the light theme and a dark neutral on dark, so the plot
          stays theme-correct without SENA's mint page tint. */}
      <rect x="0" y="0" width={width} height={height} rx="8" fill="rgb(var(--card))" />

      <g data-sena-layer="grid" opacity="0.55" aria-hidden="true">
        {GRID_STEPS.map((step) => {
          const x = margin + step * (width - margin * 2);
          const y = margin + step * (height - margin * 2);
          return (
            <g key={step}>
              <line x1={x} x2={x} y1={margin} y2={height - margin} stroke="rgb(var(--foreground) / 0.08)" />
              <line x1={margin} x2={width - margin} y1={y} y2={y} stroke="rgb(var(--foreground) / 0.08)" />
            </g>
          );
        })}
      </g>

      {/* jena-js draws one path for both axes, crossing at the data origin. */}
      <path
        data-plot-role="axes"
        d={`M ${margin} ${origin.y} L ${width - margin} ${origin.y} M ${origin.x} ${margin} L ${origin.x} ${height - margin}`}
        stroke={AXIS_STROKE}
        strokeWidth={1}
        fill="none"
      />
      <text
        data-plot-role="x-axis-title"
        x={width - margin}
        y={height - 10}
        textAnchor="end"
        fill={AXIS_TITLE_FILL}
        fontSize={JENA_AXIS_TITLE_FONT_SIZE}
        fontWeight="700"
      >
        {xTitle}
      </text>
      <text
        data-plot-role="y-axis-title"
        x={margin}
        y={18}
        fill={AXIS_TITLE_FILL}
        fontSize={JENA_AXIS_TITLE_FONT_SIZE}
        fontWeight="700"
      >
        {yTitle}
      </text>

      {/*
        SENA's additive edge layers sit *under* the ENA network so the network
        stays the figure. Straight only: in a projected space a curve claims a
        path through the space the data does not support.
      */}
      {overlayEdges.length > 0 && (
        <g data-sena-layer="overlay-edges">
          {overlayEdges.map((edge) => {
            const [x1, y1] = projectPoint(model, edge.source);
            const [x2, y2] = projectPoint(model, edge.target);
            const strokeWidth = Math.max(
              1,
              Math.min(overlayWidthCap, overlayWidthCap * (0.4 + 0.6 * edge.normalizedWeight))
            );
            const selected = selectedId === edge.id;
            return (
              <line
                key={edge.id}
                data-sena-layer="overlay-edge"
                data-overlay-kind={edge.kind}
                data-overlay-weight={formatWeight(edge.weight)}
                data-overlay-visual-width={strokeWidth.toFixed(2)}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={overlayColor(edge.kind)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={
                  selected
                    ? OVERLAY_MAX_OPACITY
                    : OVERLAY_MIN_OPACITY + (OVERLAY_MAX_OPACITY - OVERLAY_MIN_OPACITY) * edge.normalizedWeight
                }
                onClick={interactive ? () => onSelect?.(edge.id) : undefined}
                className={interactive ? "cursor-pointer" : undefined}
              >
                <title>{`${edge.label}: ${formatWeight(edge.weight)}`}</title>
              </line>
            );
          })}
        </g>
      )}

      {styledNetworks.map(({ trace, styled }, traceIndex) => {
        if (!styled) return null;
        const { edges, nodes } = styled;
        // rENA draws thin lines last so they sit in front of thick ones; sort
        // descending by width and let paint order do the rest.
        const orderedEdges = [...edges].sort((a, b) => b.strokeWidth - a.strokeWidth);
        // Labels are placed for the whole trace at once, not per node: a code
        // that projects onto another one shares its mark and therefore its
        // label, which a per-node loop cannot see. Keyed by the anchor so the
        // text still renders inside the node group it belongs to.
        const labelsByAnchor = new Map(
          nodeLabelPlacements(nodes).map((placement) => [placement.anchorId, placement])
        );

        return (
          <g key={traceKey(trace, traceIndex)} data-plot-role="network-trace" data-trace-name={trace.name}>
            {orderedEdges.map((edge) => {
              const strokeWidth = edge.strokeWidth * edgeWeightScale;
              return (
              <line
                key={edge.key}
                data-plot-role="network-edge"
                data-edge-name={edge.name}
                data-edge-weight={formatWeight(edge.weight)}
                data-edge-intensity={edge.intensity.toFixed(3)}
                data-edge-visual-width={strokeWidth.toFixed(2)}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={edge.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={edge.opacity}
              >
                <title>{`${edge.name}: ${formatWeight(edge.weight)}`}</title>
              </line>
              );
            })}
            {/* webENA's "connection weights": the mean weight printed on the
                edge itself, for reading a network off a figure rather than off
                a tooltip. Off by default, so an unconfigured plot is unchanged. */}
            {inkDisplay.showEdgeWeights && (
              <g data-plot-role="network-edge-weights">
                {orderedEdges.map((edge) => (
                  <text
                    key={`${edge.key}-weight`}
                    data-plot-role="network-edge-weight"
                    data-edge-name={edge.name}
                    x={(edge.x1 + edge.x2) / 2}
                    y={(edge.y1 + edge.y2) / 2 - 2}
                    textAnchor="middle"
                    fill={AXIS_TITLE_FILL}
                    fontSize={JENA_POINT_LABEL_FONT_SIZE}
                    fontWeight="600"
                  >
                    {formatWeight(edge.weight)}
                  </text>
                ))}
              </g>
            )}
            {nodes.map((node) => {
              const label = labelsByAnchor.get(node.id);
              return (
              <g
                key={node.id}
                data-plot-role="network-node"
                data-node-id={node.id}
                data-node-radius={node.radius.toFixed(2)}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={NODE_FILL}
                  stroke={NODE_RING}
                  strokeWidth={1}
                >
                  <title>{`${node.label} — connectivity ${(node.connectivity * 100).toFixed(0)}%`}</title>
                </circle>
                {/* Selection is transient SENA chrome drawn *beside* the node
                    rather than into its stroke, so stripping [data-sena-layer]
                    still yields the plot /workspace/ena would have drawn. */}
                {selectedId === node.id && (
                  <g data-sena-layer="selection-ring">
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.radius + 3}
                      fill="none"
                      stroke={SELECTION_RING}
                      strokeWidth={2}
                    />
                  </g>
                )}
                {/* One label per visible mark. A node whose disc is swallowed
                    by a neighbour's has no placement of its own — its code
                    appears in that neighbour's merged label instead. */}
                {label && inkDisplay.showCodeLabels && (
                  <text
                    data-plot-role="network-node-label"
                    data-label-codes={label.ids.join(",")}
                    data-label-merged={label.merged ? "true" : "false"}
                    data-label-displaced={label.displaced ? "true" : "false"}
                    x={label.x}
                    y={label.y}
                    textAnchor={label.textAnchor}
                    fill={NODE_LABEL_FILL}
                    fontSize={JENA_NETWORK_NODE_LABEL_FONT_SIZE}
                    fontWeight="600"
                  >
                    {label.text}
                  </text>
                )}
              </g>
              );
            })}
          </g>
        );
      })}

      {overlayTraces.map((trace, traceIndex) => {
        const points = trace.points ?? [];
        const radius = pointTraceRadius(trace.type) * unitScale;
        const projected = points.map((point) => projectPoint(model, point));
        // Two gates: the automatic one that keeps a crowded plot readable, and
        // the researcher's own switch for this kind of trace.
        const labelsFit =
          (!isUnitTrace(trace) || unitLabelsFit) && enaPlotTraceLabelsVisible(trace.type, inkDisplay);

        return (
          <g key={traceKey(trace, traceIndex)} data-plot-role="point-trace" data-trace-name={trace.name} data-trace-type={trace.type}>
            {trace.type === "trajectory" && projected.slice(1).map(([x, y], index) => {
              const previous = projected[index];
              return (
                <line
                  key={`segment-${index}`}
                  data-plot-role="trajectory-segment"
                  x1={previous[0]}
                  y1={previous[1]}
                  x2={x}
                  y2={y}
                  stroke={trace.color}
                  strokeWidth={JENA_TRAJECTORY_STROKE_WIDTH}
                  opacity={JENA_TRAJECTORY_OPACITY}
                />
              );
            })}
            {points.map((point, index) => {
              const [x, y] = projected[index];
              const alreadyLabelled = networkLabelPositions.has(positionKey(x, y));
              return (
                <g key={pointKey(point, index)}>
                  <circle
                    data-plot-role="point"
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={trace.color}
                    stroke={PAPER}
                    strokeWidth={JENA_POINT_STROKE_WIDTH}
                  >
                    <title>{point.label ?? trace.name}</title>
                  </circle>
                  {point.label && labelsFit && !alreadyLabelled && (
                    <text
                      x={x + JENA_POINT_LABEL_OFFSET.x}
                      y={y + JENA_POINT_LABEL_OFFSET.y}
                      fill={POINT_LABEL_FILL}
                      fontSize={JENA_POINT_LABEL_FONT_SIZE}
                      fontWeight={trace.type === "nodes" ? "700" : "500"}
                    >
                      {point.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/*
        Comparison means and their 95% t intervals (ADR 0009, D6). The interval
        is drawn first and the mean on top of it, so a wide box never hides the
        point it is an interval *for*. Both are data-coordinate inputs that this
        renderer projects, like every other overlay — a comparison surface never
        computes a pixel.
      */}
      {overlayGroups.length > 0 && (
        <g data-sena-layer="group-ci">
          {overlayGroups.map((group) => {
            if (!group.ci) return null;
            const [x1, y1] = projectPoint(model, { x: group.ci.x[0], y: group.ci.y[0] });
            const [x2, y2] = projectPoint(model, { x: group.ci.x[1], y: group.ci.y[1] });
            return (
              <rect
                key={group.name}
                data-sena-group-ci={group.name}
                // The interval in the coordinates it was computed in. A reader
                // (or a gate) checking the arithmetic should not have to invert
                // the projection to do it.
                data-sena-ci-x={`${group.ci.x[0].toFixed(6)},${group.ci.x[1].toFixed(6)}`}
                data-sena-ci-y={`${group.ci.y[0].toFixed(6)},${group.ci.y[1].toFixed(6)}`}
                x={Math.min(x1, x2)}
                y={Math.min(y1, y2)}
                width={Math.abs(x2 - x1)}
                height={Math.abs(y2 - y1)}
                fill="none"
                stroke={group.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.9}
              >
                <title>{`${group.name} — 95% confidence interval`}</title>
              </rect>
            );
          })}
        </g>
      )}

      {overlayGroups.length > 0 && (
        <g data-sena-layer="group-mean">
          {overlayGroups.map((group) => {
            const [x, y] = projectPoint(model, group.mean);
            // jena-js sizes a group marker at 6 to a unit point's 4; the square
            // is SENA's, so a mean can never be mistaken for a participant.
            const side = pointTraceRadius("group") * unitScale * 2;
            return (
              <g
                key={group.name}
                data-sena-group-mean={group.name}
                {...(group.n === undefined ? {} : { "data-sena-group-n": group.n })}
                data-sena-group-interval={group.ci ? "true" : "false"}
              >
                <rect
                  x={x - side / 2}
                  y={y - side / 2}
                  width={side}
                  height={side}
                  fill={group.color}
                  stroke={PAPER}
                  strokeWidth={JENA_POINT_STROKE_WIDTH}
                >
                  <title>
                    {group.n === undefined
                      ? `${group.name} mean`
                      : `${group.name} mean — ${group.n} unit${group.n === 1 ? "" : "s"}`}
                  </title>
                </rect>
                {inkDisplay.showGroupLabels && (
                  <text
                    x={x + side / 2 + 4}
                    y={y + 4}
                    fill={NODE_LABEL_FILL}
                    fontSize={JENA_POINT_LABEL_FONT_SIZE}
                    fontWeight="700"
                  >
                    {group.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/*
        Click targets live in their own marked layer rather than on the node
        groups themselves: an `onClick` also renders a `class` attribute, and
        putting that on a base-layer glyph would make an interactive SENA plot
        differ from /workspace/ena in the DOM even with every overlay off.
      */}
      {interactive && (
        <g data-sena-layer="node-hit-targets">
          {styledNetworks.flatMap(({ styled }) =>
            (styled?.nodes ?? []).map((node) => (
              <circle
                key={node.id}
                data-sena-hit-target={node.id}
                cx={node.x}
                cy={node.y}
                r={Math.max(node.radius, 10)}
                fill="transparent"
                onClick={() => onSelect?.(node.id)}
                className="cursor-pointer"
              />
            ))
          )}
        </g>
      )}

      {/*
        Unit identity, on demand. The base marker stays a 4px ENA unit point —
        a permanent 37px hexagon outranks a 15px code node and inverts the
        hierarchy an ENA plot is read by. Selecting or hovering a unit rings it
        instead, which keeps person identity reachable without spending the
        plot's visual budget on it.
      */}
      {overlayMarkers.length > 0 && (
        <g data-sena-layer="unit-identity">
          {overlayMarkers.map((marker) => {
            const [x, y] = projectPoint(model, marker);
            const active = selectedId === marker.id || hoveredId === marker.id;
            return (
              <g
                key={marker.id}
                data-sena-marker-id={marker.id}
                data-sena-marker-active={active ? "true" : "false"}
                onClick={interactive ? () => onSelect?.(marker.id) : undefined}
                onMouseEnter={() => setHoveredId(marker.id)}
                onMouseLeave={() => setHoveredId((current) => (current === marker.id ? "" : current))}
                className={interactive ? "cursor-pointer" : undefined}
              >
                {/* Invisible hit target: a 4px dot is too small to click reliably. */}
                <circle cx={x} cy={y} r={12} fill="transparent" />
                {active && (
                  <>
                    <polygon
                      points={hexPoints(x, y, 11)}
                      fill="none"
                      stroke={OVERLAY_BRIDGE_COLOR}
                      strokeWidth={2}
                    />
                    <text
                      x={x + 14}
                      y={y - 12}
                      fill={NODE_LABEL_FILL}
                      fontSize={JENA_POINT_LABEL_FONT_SIZE}
                      fontWeight="700"
                    >
                      {marker.label}
                    </text>
                  </>
                )}
                <title>{marker.label}</title>
              </g>
            );
          })}
        </g>
      )}

      <text
        data-plot-role="title"
        x={margin}
        y={height - 12}
        fill={TITLE_FILL}
        fontSize={JENA_PLOT_TITLE_FONT_SIZE}
        fontWeight="700"
      >
        {model.title}
      </text>

      {/*
        Low-rank badge (ena-window-rank-audit.md): when the second axis carries
        no structure the plot says so on the figure itself, where the claim is
        made — top-right, clear of the y-axis title, legend, and plot title.
        Scoped temporal windows trip this often, so it is a quiet plate with the
        full explanation in its tooltip, not an alarm.
      */}
      {lowRank && (
        <g
          data-sena-layer="low-rank-warning"
          data-low-rank-reason={lowRank.reason}
          data-low-rank-units={lowRank.units}
          data-low-rank-svd2-share={lowRank.svd2Share.toExponential(2)}
          transform={`translate(${lowRankBadgeX.toFixed(2)} ${lowRankBadgeY.toFixed(2)}) scale(${lowRankBadgeScale.toFixed(4)})`}
        >
          <title>{lowRank.message}</title>
          <rect
            x="0"
            y="0"
            width={lowRankBadgeWidth}
            height="24"
            rx="9"
            fill="rgb(var(--card) / 0.9)"
            stroke="#f59e0b"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          <path d="M 15 6 L 22.5 19 L 7.5 19 Z" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
          <text x="28" y="16" fill="rgb(var(--foreground) / 0.86)" fontSize="11" fontWeight="700">
            {lowRank.badge}
          </text>
        </g>
      )}

      {/*
        webENA anchors the plot legend near the lower-left of the plotting area
        (ena-official-website-design skill: "Show plot legends close to the
        plotting area, usually near the lower-left of the main plot"). Sits above
        the plot title, over the canvas on a translucent plate.
      */}
      <g
        data-sena-layer="legend"
        transform={`translate(${legendX.toFixed(2)} ${legendY.toFixed(2)}) scale(${legendScale.toFixed(4)})`}
      >
        <rect
          x="0"
          y="0"
          width="168"
          height={legendHeight}
          rx="9"
          fill="rgb(var(--card) / 0.9)"
          stroke="rgb(var(--foreground) / 0.12)"
          strokeWidth="1"
        />
        {legend.map((entry, index) => (
          <g key={entry.name} transform={`translate(12 ${16 + index * 20})`}>
            {entry.type === "network" || entry.type === "trajectory" ? (
              <line x1="0" y1="0" x2="16" y2="0" stroke={entry.color} strokeWidth="3" strokeLinecap="round" />
            ) : (
              <circle cx="8" cy="0" r={pointTraceRadius(entry.type)} fill={entry.color} stroke={PAPER} strokeWidth={JENA_POINT_STROKE_WIDTH} />
            )}
            <text x="26" y="4" fill="rgb(var(--foreground) / 0.86)" fontSize="11" fontWeight="700">
              {entry.name}
            </text>
          </g>
        ))}
        {/* A rule separates what ENA drew from what SENA added, so the overlay
            is self-declaring rather than reading as part of the model. */}
        {overlayLegend.length > 0 && (
          <g data-sena-layer="legend-overlay-entries">
            <line
              x1="12"
              x2="156"
              y1={legend.length * 20 + 8}
              y2={legend.length * 20 + 8}
              stroke="rgb(var(--foreground) / 0.16)"
              strokeWidth="1"
            />
            {overlayLegend.map((entry, index) => (
              <g key={entry.name} transform={`translate(12 ${legend.length * 20 + 24 + index * 20})`}>
                {entry.kind === "line" ? (
                  <line x1="0" y1="0" x2="16" y2="0" stroke={entry.color} strokeWidth="3" strokeLinecap="round" opacity={OVERLAY_MAX_OPACITY} />
                ) : (
                  <polygon points={hexPoints(8, 0, 6)} fill="none" stroke={entry.color} strokeWidth="1.5" />
                )}
                <text x="26" y="4" fill="rgb(var(--foreground) / 0.72)" fontSize="11" fontWeight="700">
                  {entry.name}
                </text>
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
