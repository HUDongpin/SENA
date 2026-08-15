import type { ENAPlotModel, ENAPlotTrace } from "jena-js/plot";
import {
  JENA_AXIS_TITLE_FONT_SIZE,
  JENA_NETWORK_NODE_LABEL_FONT_SIZE,
  JENA_PLOT_TITLE_FONT_SIZE,
  JENA_POINT_LABEL_FONT_SIZE,
  JENA_POINT_LABEL_OFFSET,
  JENA_POINT_STROKE_WIDTH,
  axisOrigin,
  axisTitleWithVariance,
  jenaPlotGeometry,
  nodeLabelPlacements,
  plotLegendEntries,
  pointTraceRadius,
  projectPoint,
  styleRenaNetwork
} from "../ena/plot-encoding";
import { buildSenaEnaManifest } from "./ena-manifest";
import { buildSenaEnaPlotComposition } from "./ena-plot-model";
import type { SenaEnaManifest, SenaModel } from "./types";

// The figure a publication export exports.
//
// `buildSenaPublicationSvg` used to draw a bar chart of eight summary metrics
// under a button labelled "Export figure SVG"; DOCX and PDF were text summaries
// and the PNG was the same card in a hand-rolled bitmap font. None of the six
// artifacts in the publication package contained the product's headline output,
// so a researcher exporting a "figure" for a paper got a summary card.
//
// The exported figure is the **canonical ENA plane** — the ENA half of the
// Fusion plane-orbit default (ADR 0009). Three reasons decide it over the
// alternatives: it is the measured, rENA-standard artifact a paper actually
// carries; it is a pure function of the model, so an export is reproducible from
// the snapshot alone; and it depends on no interactive state (no selection, no
// hover, no zoom, no layer toggles), which a server-side export cannot observe.
//
// This module owns ONE geometry and THREE renderers over it, which is the whole
// design: `buildSenaPublicationFigure` resolves the plane to marks in the
// plane's own 720x520 pixel space, and the SVG, raster, and PDF renderers each
// walk exactly those marks. SVG and PDF therefore cannot drift from each other,
// and the PNG cannot drift from either — the failure mode that produced B2 in
// the first place was four artifact builders each inventing their own content.
//
// Geometry and ink both come from `lib/ena/plot-encoding`, the same pure module
// `<EnaPlot>` renders through, so the exported figure is the plot the workspace
// draws rather than a second drawing of the same numbers (ADR 0008). The one
// deliberate deviation is colour: `<EnaPlot>` paints through CSS custom
// properties (`rgb(var(--foreground))`), and an exported file has no stylesheet
// to resolve them against, so the theme tokens are resolved here to the literal
// publication palette — white paper, near-black ink — which is what rENA prints
// and what a journal expects.
//
// Precedent: scripts/generate-sena-human-concept-publication-figures.ts already
// emits real figure SVG server-side (pure string building, deterministic, no
// browser). This follows that approach; it does NOT follow its use of `sharp`
// for rasterisation, because sharp is a devDependency and is not available in
// the production export runtime — see `rasterizeSenaPublicationFigure`.

/** The plane's own canvas: `<EnaPlot>`'s, at 1:1, so the projection is unchanged. */
const { width: PLANE_WIDTH, height: PLANE_HEIGHT, margin: PLANE_MARGIN } = jenaPlotGeometry;

/** rENA's positive-network palette entry (#386CB0) — mirrors EnaPlot's constant. */
export const SENA_FIGURE_EDGE_BASE = "#386CB0";

/**
 * `<EnaPlot>`'s theme tokens, resolved for a standalone file. Each entry names
 * the CSS custom property it stands in for so the two cannot silently diverge.
 */
export const SENA_FIGURE_PALETTE = {
  /** --card: the paper the plot is drawn on. */
  paper: "#ffffff",
  /** --background behind the plate. */
  page: "#f8fafc",
  /** --foreground: node fill, node labels, plot title. */
  ink: "#0f172a",
  /** --muted: axis titles and caption. */
  muted: "#64748b",
  /** --foreground at 0.12: the legend plate's keyline. */
  keyline: "#cbd5e1",
  /** --foreground at 0.08: the subordinate grid. */
  grid: "#dbe2ea"
} as const;

/** Axis stroke: EnaPlot's `rgb(var(--foreground) / 0.30)`. */
const AXIS_OPACITY = 0.3;
/** Grid opacity: EnaPlot wraps the grid group at 0.55. */
const GRID_OPACITY = 0.55;
const GRID_STEPS = [0.25, 0.5, 0.75];

/**
 * EnaPlot's plot-wide unit-label gate. Above this many unit points the labels
 * become a block of overlapping text, so the plot draws points without names —
 * reproduced here rather than imported because EnaPlot keeps it module-private.
 */
const UNIT_LABEL_LIMIT = 8;

/** The plot title the figure carries; the document title is the report's. */
export const SENA_PUBLICATION_FIGURE_TITLE = "Canonical ENA plane";

export type SenaFigureLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  opacity: number;
};

export type SenaFigureEdge = SenaFigureLine & {
  name: string;
  weight: number;
  intensity: number;
};

export type SenaFigureNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  connectivity: number;
};

export type SenaFigureNodeLabel = {
  anchorId: string;
  codes: string[];
  text: string;
  x: number;
  y: number;
  textAnchor: "start" | "end";
  merged: boolean;
  displaced: boolean;
};

export type SenaFigureUnit = {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  showLabel: boolean;
};

export type SenaFigureText = {
  role: string;
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  color: string;
  fontSize: number;
  bold: boolean;
};

export type SenaFigureLegendEntry = {
  name: string;
  color: string;
  kind: "line" | "dot";
  radius: number;
};

export type SenaFigureLegend = {
  x: number;
  y: number;
  width: number;
  height: number;
  entries: SenaFigureLegendEntry[];
};

/** Where a composed document places the plane, and at what scale. */
export type SenaFigurePlacement = {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
};

export type SenaPublicationFigure = {
  /** "unavailable" when the manifest carries no usable projection. */
  status: "computed" | "unavailable";
  /** Stable identifier for the figure this export contains. */
  figure: "canonical-ena-plane";
  /** Empty when computed; the honest reason otherwise. */
  reason: string;
  plane: { width: number; height: number; margin: number };
  title: string;
  dimensions: string[];
  grid: SenaFigureLine[];
  axisLines: SenaFigureLine[];
  edges: SenaFigureEdge[];
  nodes: SenaFigureNode[];
  nodeLabels: SenaFigureNodeLabel[];
  units: SenaFigureUnit[];
  texts: SenaFigureText[];
  legend: SenaFigureLegend;
  /** Present when the displayed space is effectively 1-D (rank audit rule). */
  lowRank: { badge: string; message: string } | null;
  /**
   * The lines an ENA figure is unreadable without: what a unit is, what a
   * conversation is, which window and rotation produced the projection, and the
   * co-registration fit. Placed by the composing document, not inside the plate.
   */
  caption: { modelDefinition: string; goodnessOfFit: string; guardrail: string };
  /** Placement inside the exported SVG document. */
  vector: SenaFigurePlacement;
  /** Placement inside the exported PNG document. */
  raster: SenaFigurePlacement;
};

/** Composed-document geometry. The plate is most of the page, by construction. */
export const SENA_PUBLICATION_FIGURE_LAYOUT = {
  svg: { document: { width: 1200, height: 1010 }, plate: { x: 78, y: 126, scale: 1.45 } },
  png: { document: { width: 1560, height: 1360 }, plate: { x: 60, y: 140, scale: 2 } }
} as const;

function placement(plate: { x: number; y: number; scale: number }): SenaFigurePlacement {
  return {
    x: plate.x,
    y: plate.y,
    scale: plate.scale,
    width: Math.round(PLANE_WIDTH * plate.scale),
    height: Math.round(PLANE_HEIGHT * plate.scale)
  };
}

export const SENA_PUBLICATION_FIGURE_VECTOR_PLACEMENT = placement(SENA_PUBLICATION_FIGURE_LAYOUT.svg.plate);
export const SENA_PUBLICATION_FIGURE_RASTER_PLACEMENT = placement(SENA_PUBLICATION_FIGURE_LAYOUT.png.plate);

function formatCorrelation(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "NA";
}

/** Mirrors the Fusion plane's footer, which is where this wording is defined. */
function modelDefinitionLine(manifest: SenaEnaManifest) {
  const units = manifest.source.unitColumns.join(", ") || "NA";
  const conversation = manifest.source.conversationColumns.join(", ") || "NA";
  const options = manifest.options;
  const window = options
    ? `${options.window} (back ${options.windowSizeBack}, forward ${options.windowSizeForward})`
    : "NA";
  const rotation = options
    ? `${options.model}, ${options.weightBy}, ${options.nodePositionMethod} nodes, ${options.dimensions}D`
    : "NA";
  return `Units ${units} · Conversation ${conversation} · Window ${window} · Rotation ${rotation}`;
}

function goodnessOfFitLine(manifest: SenaEnaManifest) {
  const rows = manifest.outputs?.goodnessOfFit ?? [];
  if (rows.length === 0) return "Co-registration NA — goodness of fit was not estimable for this projection";
  const parts = rows.map(
    (row) => `${row.dimension} r ${formatCorrelation(row.pearson)} ρ ${formatCorrelation(row.spearman)}`
  );
  return `Co-registration ${parts.join(" · ")}`;
}

const FIGURE_GUARDRAIL =
  "Descriptive analytics: report coding reliability, human review, and method settings with any claim made from this figure.";

function emptyFigure(reason: string, manifest: SenaEnaManifest, title: string): SenaPublicationFigure {
  return {
    status: "unavailable",
    figure: "canonical-ena-plane",
    reason,
    plane: { width: PLANE_WIDTH, height: PLANE_HEIGHT, margin: PLANE_MARGIN },
    title,
    dimensions: [],
    grid: [],
    axisLines: [],
    edges: [],
    nodes: [],
    nodeLabels: [],
    units: [],
    texts: [],
    legend: { x: PLANE_MARGIN, y: PLANE_HEIGHT - PLANE_MARGIN, width: 0, height: 0, entries: [] },
    lowRank: null,
    caption: {
      modelDefinition: modelDefinitionLine(manifest),
      goodnessOfFit: goodnessOfFitLine(manifest),
      guardrail: FIGURE_GUARDRAIL
    },
    vector: SENA_PUBLICATION_FIGURE_VECTOR_PLACEMENT,
    raster: SENA_PUBLICATION_FIGURE_RASTER_PLACEMENT
  };
}

function isUnitTrace(trace: ENAPlotTrace) {
  return trace.type === "points" || trace.type === "trajectory";
}

export type SenaPublicationFigureOptions = {
  /**
   * The projection to draw. Publication exports pass `report.enaManifest`, so
   * the figure is the very projection the report was written from rather than a
   * second run of the same computation; omitted, it is computed from the model's
   * dataset, which is the same deterministic call.
   */
  manifest?: SenaEnaManifest;
  title?: string;
};

/**
 * The canonical ENA plane, resolved to marks in the plane's own pixel space.
 *
 * Pure: same model in, same marks out, byte for byte. Nothing here reads
 * selection, hover, zoom, or layer state, because an export has none of them.
 */
export function buildSenaPublicationFigure(
  model: SenaModel,
  options: SenaPublicationFigureOptions = {}
): SenaPublicationFigure {
  const manifest = options.manifest ?? buildSenaEnaManifest(model.dataset);
  const title = options.title ?? SENA_PUBLICATION_FIGURE_TITLE;
  const composition = buildSenaEnaPlotComposition(manifest, model.people, model.codes, { title });

  if (composition.status !== "computed" || !composition.model) {
    return emptyFigure(
      composition.warnings[0] ?? "The publication figure needs a computed jENA projection.",
      manifest,
      title
    );
  }

  const plotModel: ENAPlotModel = composition.model;
  const origin = axisOrigin(plotModel);
  const networkTraces = plotModel.traces.filter((trace) => trace.type === "network");
  const hasNetwork = networkTraces.length > 0;
  const pointTraces = plotModel.traces.filter(
    (trace) => trace.type !== "network" && !(hasNetwork && trace.type === "nodes")
  );

  const grid: SenaFigureLine[] = GRID_STEPS.flatMap((step) => {
    const x = PLANE_MARGIN + step * (PLANE_WIDTH - PLANE_MARGIN * 2);
    const y = PLANE_MARGIN + step * (PLANE_HEIGHT - PLANE_MARGIN * 2);
    return [
      { x1: x, y1: PLANE_MARGIN, x2: x, y2: PLANE_HEIGHT - PLANE_MARGIN, color: SENA_FIGURE_PALETTE.grid, strokeWidth: 1, opacity: GRID_OPACITY },
      { x1: PLANE_MARGIN, y1: y, x2: PLANE_WIDTH - PLANE_MARGIN, y2: y, color: SENA_FIGURE_PALETTE.grid, strokeWidth: 1, opacity: GRID_OPACITY }
    ];
  });

  // jena-js draws one path for both axes, crossing at the *data* origin.
  const axisLines: SenaFigureLine[] = [
    { x1: PLANE_MARGIN, y1: origin.y, x2: PLANE_WIDTH - PLANE_MARGIN, y2: origin.y, color: SENA_FIGURE_PALETTE.ink, strokeWidth: 1, opacity: AXIS_OPACITY },
    { x1: origin.x, y1: PLANE_MARGIN, x2: origin.x, y2: PLANE_HEIGHT - PLANE_MARGIN, color: SENA_FIGURE_PALETTE.ink, strokeWidth: 1, opacity: AXIS_OPACITY }
  ];

  const edges: SenaFigureEdge[] = [];
  const nodes: SenaFigureNode[] = [];
  const nodeLabels: SenaFigureNodeLabel[] = [];

  for (const trace of networkTraces) {
    if (!trace.network) continue;
    const styled = styleRenaNetwork(
      plotModel,
      trace.network,
      networkTraces.length > 1 ? trace.color : SENA_FIGURE_EDGE_BASE
    );
    // rENA draws thin lines last so they sit in front of thick ones.
    for (const edge of [...styled.edges].sort((left, right) => right.strokeWidth - left.strokeWidth)) {
      edges.push({
        name: edge.name,
        weight: edge.weight,
        intensity: edge.intensity,
        x1: edge.x1,
        y1: edge.y1,
        x2: edge.x2,
        y2: edge.y2,
        color: edge.color,
        strokeWidth: edge.strokeWidth,
        opacity: edge.opacity
      });
    }
    for (const node of styled.nodes) {
      nodes.push({
        id: node.id,
        label: node.label,
        x: node.x,
        y: node.y,
        radius: node.radius,
        connectivity: node.connectivity
      });
    }
    // Placed for the whole trace at once: a code that projects onto another
    // shares its mark and therefore its label.
    for (const placementRow of nodeLabelPlacements(styled.nodes)) {
      nodeLabels.push({
        anchorId: placementRow.anchorId,
        codes: placementRow.ids,
        text: placementRow.text,
        x: placementRow.x,
        y: placementRow.y,
        textAnchor: placementRow.textAnchor,
        merged: placementRow.merged,
        displaced: placementRow.displaced
      });
    }
  }

  const unitPointCount = plotModel.traces
    .filter(isUnitTrace)
    .reduce((total, trace) => total + (trace.points?.length ?? 0), 0);
  const unitLabelsFit = unitPointCount <= UNIT_LABEL_LIMIT;
  const nodePositionKeys = new Set(nodes.map((node) => `${Math.round(node.x * 100)}:${Math.round(node.y * 100)}`));

  const units: SenaFigureUnit[] = [];
  for (const trace of pointTraces) {
    const radius = pointTraceRadius(trace.type);
    for (const [index, point] of (trace.points ?? []).entries()) {
      const [x, y] = projectPoint(plotModel, point);
      const alreadyLabelled = nodePositionKeys.has(`${Math.round(x * 100)}:${Math.round(y * 100)}`);
      const label = point.label ?? trace.name;
      units.push({
        id: composition.units[index]?.id ?? `${trace.name}-${index}`,
        label,
        x,
        y,
        radius,
        color: trace.color,
        showLabel: Boolean(point.label) && (!isUnitTrace(trace) || unitLabelsFit) && !alreadyLabelled
      });
    }
  }

  const xTitle = axisTitleWithVariance(plotModel.axes.x.title, composition.variance);
  const yTitle = axisTitleWithVariance(plotModel.axes.y.title, composition.variance);

  const texts: SenaFigureText[] = [
    {
      role: "x-axis-title",
      text: xTitle,
      x: PLANE_WIDTH - PLANE_MARGIN,
      y: PLANE_HEIGHT - 10,
      anchor: "end",
      color: SENA_FIGURE_PALETTE.muted,
      fontSize: JENA_AXIS_TITLE_FONT_SIZE,
      bold: true
    },
    {
      role: "y-axis-title",
      text: yTitle,
      x: PLANE_MARGIN,
      y: 18,
      anchor: "start",
      color: SENA_FIGURE_PALETTE.muted,
      fontSize: JENA_AXIS_TITLE_FONT_SIZE,
      bold: true
    },
    {
      role: "title",
      text: plotModel.title,
      x: PLANE_MARGIN,
      y: PLANE_HEIGHT - 12,
      anchor: "start",
      color: SENA_FIGURE_PALETTE.ink,
      fontSize: JENA_PLOT_TITLE_FONT_SIZE,
      bold: true
    }
  ];

  // Legend: webENA anchors it near the lower-left of the plotting area. The
  // network entry takes rENA's base hue, matching the ink actually drawn.
  const legendEntries: SenaFigureLegendEntry[] = plotLegendEntries(plotModel)
    .filter((entry) => !(hasNetwork && entry.type === "nodes"))
    .map((entry) => ({
      name: entry.name,
      color: entry.type === "network" && networkTraces.length <= 1 ? SENA_FIGURE_EDGE_BASE : entry.color,
      kind: entry.type === "network" || entry.type === "trajectory" ? ("line" as const) : ("dot" as const),
      radius: pointTraceRadius(entry.type)
    }));
  const legendHeight = legendEntries.length * 20 + 12;

  return {
    status: "computed",
    figure: "canonical-ena-plane",
    reason: "",
    plane: { width: PLANE_WIDTH, height: PLANE_HEIGHT, margin: PLANE_MARGIN },
    title: plotModel.title,
    dimensions: [...plotModel.dimensions],
    grid,
    axisLines,
    edges,
    nodes,
    nodeLabels,
    units,
    texts,
    legend: {
      x: PLANE_MARGIN,
      y: PLANE_HEIGHT - PLANE_MARGIN - legendHeight - 6,
      width: 168,
      height: legendHeight,
      entries: legendEntries
    },
    lowRank: composition.lowRank
      ? { badge: composition.lowRank.badge, message: composition.lowRank.message }
      : null,
    caption: {
      modelDefinition: modelDefinitionLine(manifest),
      goodnessOfFit: goodnessOfFitLine(manifest),
      guardrail: FIGURE_GUARDRAIL
    },
    vector: SENA_PUBLICATION_FIGURE_VECTOR_PLACEMENT,
    raster: SENA_PUBLICATION_FIGURE_RASTER_PLACEMENT
  };
}

// --- SVG renderer ------------------------------------------------------------

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgNumber(value: number) {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function svgLine(line: SenaFigureLine, attributes = "") {
  return `<line ${attributes}x1="${svgNumber(line.x1)}" y1="${svgNumber(line.y1)}" x2="${svgNumber(line.x2)}" y2="${svgNumber(line.y2)}" stroke="${line.color}" stroke-width="${svgNumber(line.strokeWidth)}" stroke-opacity="${svgNumber(line.opacity)}" stroke-linecap="round"/>`;
}

function svgText(text: SenaFigureText, role = text.role) {
  return `<text data-plot-role="${escapeXml(role)}" x="${svgNumber(text.x)}" y="${svgNumber(text.y)}" text-anchor="${text.anchor}" fill="${text.color}" font-size="${text.fontSize}" font-weight="${text.bold ? 700 : 500}">${escapeXml(text.text)}</text>`;
}

/**
 * The plane as SVG markup in its own 720x520 coordinate space, wrapped in one
 * group a document can translate and scale. `data-plot-role` values are
 * `<EnaPlot>`'s own, so a reader (or a test) reads one vocabulary across the
 * live plot and the exported file.
 */
export function renderSenaPublicationFigureSvgGroup(figure: SenaPublicationFigure) {
  const { width, height } = figure.plane;
  const parts: string[] = [
    `<g data-sena-figure="${figure.figure}" data-figure-status="${figure.status}">`,
    `<rect data-plot-role="paper" x="0" y="0" width="${width}" height="${height}" rx="8" fill="${SENA_FIGURE_PALETTE.paper}" stroke="${SENA_FIGURE_PALETTE.keyline}"/>`
  ];

  if (figure.status !== "computed") {
    parts.push(
      `<text data-plot-role="figure-unavailable" x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${SENA_FIGURE_PALETTE.ink}" font-size="15" font-weight="700">${escapeXml(figure.reason)}</text>`,
      "</g>"
    );
    return parts.join("\n");
  }

  parts.push('<g data-plot-role="grid" aria-hidden="true">');
  for (const line of figure.grid) parts.push(svgLine(line));
  parts.push("</g>");

  parts.push(
    `<path data-plot-role="axes" d="M ${svgNumber(figure.axisLines[0].x1)} ${svgNumber(figure.axisLines[0].y1)} L ${svgNumber(figure.axisLines[0].x2)} ${svgNumber(figure.axisLines[0].y2)} M ${svgNumber(figure.axisLines[1].x1)} ${svgNumber(figure.axisLines[1].y1)} L ${svgNumber(figure.axisLines[1].x2)} ${svgNumber(figure.axisLines[1].y2)}" stroke="${SENA_FIGURE_PALETTE.ink}" stroke-opacity="${AXIS_OPACITY}" stroke-width="1" fill="none"/>`
  );

  parts.push('<g data-plot-role="network-trace">');
  for (const edge of figure.edges) {
    parts.push(
      svgLine(
        edge,
        `data-plot-role="network-edge" data-edge-name="${escapeXml(edge.name)}" data-edge-weight="${edge.weight.toFixed(3)}" data-edge-intensity="${edge.intensity.toFixed(3)}" `
      )
    );
  }
  const labelsByAnchor = new Map(figure.nodeLabels.map((label) => [label.anchorId, label]));
  for (const node of figure.nodes) {
    const label = labelsByAnchor.get(node.id);
    parts.push(
      `<g data-plot-role="network-node" data-node-id="${escapeXml(node.id)}" data-node-radius="${node.radius.toFixed(2)}">`,
      `<circle cx="${svgNumber(node.x)}" cy="${svgNumber(node.y)}" r="${svgNumber(node.radius)}" fill="${SENA_FIGURE_PALETTE.ink}" stroke="${SENA_FIGURE_PALETTE.paper}" stroke-width="1"><title>${escapeXml(node.label)} — connectivity ${(node.connectivity * 100).toFixed(0)}%</title></circle>`
    );
    if (label) {
      parts.push(
        `<text data-plot-role="network-node-label" data-label-codes="${escapeXml(label.codes.join(","))}" data-label-merged="${label.merged}" data-label-displaced="${label.displaced}" x="${svgNumber(label.x)}" y="${svgNumber(label.y)}" text-anchor="${label.textAnchor}" fill="${SENA_FIGURE_PALETTE.ink}" font-size="${JENA_NETWORK_NODE_LABEL_FONT_SIZE}" font-weight="600">${escapeXml(label.text)}</text>`
      );
    }
    parts.push("</g>");
  }
  parts.push("</g>");

  parts.push('<g data-plot-role="point-trace">');
  for (const unit of figure.units) {
    parts.push(
      `<circle data-plot-role="point" data-point-id="${escapeXml(unit.id)}" cx="${svgNumber(unit.x)}" cy="${svgNumber(unit.y)}" r="${svgNumber(unit.radius)}" fill="${unit.color}" stroke="${SENA_FIGURE_PALETTE.paper}" stroke-width="${JENA_POINT_STROKE_WIDTH}"><title>${escapeXml(unit.label)}</title></circle>`
    );
    if (unit.showLabel) {
      parts.push(
        `<text data-plot-role="point-label" x="${svgNumber(unit.x + JENA_POINT_LABEL_OFFSET.x)}" y="${svgNumber(unit.y + JENA_POINT_LABEL_OFFSET.y)}" fill="${SENA_FIGURE_PALETTE.ink}" font-size="${JENA_POINT_LABEL_FONT_SIZE}" font-weight="500">${escapeXml(unit.label)}</text>`
      );
    }
  }
  parts.push("</g>");

  for (const text of figure.texts) parts.push(svgText(text));

  if (figure.legend.entries.length > 0) {
    parts.push(
      `<g data-plot-role="legend" transform="translate(${svgNumber(figure.legend.x)} ${svgNumber(figure.legend.y)})">`,
      `<rect x="0" y="0" width="${figure.legend.width}" height="${figure.legend.height}" rx="9" fill="${SENA_FIGURE_PALETTE.paper}" stroke="${SENA_FIGURE_PALETTE.keyline}" stroke-width="1"/>`
    );
    figure.legend.entries.forEach((entry, index) => {
      const y = 16 + index * 20;
      parts.push(
        entry.kind === "line"
          ? `<line x1="12" y1="${y}" x2="28" y2="${y}" stroke="${entry.color}" stroke-width="3" stroke-linecap="round"/>`
          : `<circle cx="20" cy="${y}" r="${entry.radius}" fill="${entry.color}" stroke="${SENA_FIGURE_PALETTE.paper}" stroke-width="${JENA_POINT_STROKE_WIDTH}"/>`,
        `<text x="38" y="${y + 4}" fill="${SENA_FIGURE_PALETTE.ink}" font-size="11" font-weight="700">${escapeXml(entry.name)}</text>`
      );
    });
    parts.push("</g>");
  }

  if (figure.lowRank) {
    const badgeWidth = figure.lowRank.badge.length * 6.4 + 36;
    parts.push(
      `<g data-plot-role="low-rank-warning" transform="translate(${svgNumber(width - PLANE_MARGIN - badgeWidth)} 10)">`,
      `<title>${escapeXml(figure.lowRank.message)}</title>`,
      `<rect x="0" y="0" width="${svgNumber(badgeWidth)}" height="24" rx="9" fill="${SENA_FIGURE_PALETTE.paper}" stroke="#f59e0b" stroke-width="1"/>`,
      `<text x="14" y="16" fill="${SENA_FIGURE_PALETTE.ink}" font-size="11" font-weight="700">${escapeXml(figure.lowRank.badge)}</text>`,
      "</g>"
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * The plane as a standalone SVG document, for embedding somewhere that takes a
 * whole file rather than markup (the DOCX image part).
 */
export function buildSenaPublicationFigureSvgDocument(figure: SenaPublicationFigure) {
  const { width, height } = figure.plane;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`${figure.title} — canonical ENA plane`)}" font-family="Arial, Helvetica, sans-serif">
<desc>${escapeXml(`${figure.caption.modelDefinition}. ${figure.caption.goodnessOfFit}.`)}</desc>
<rect x="0" y="0" width="${width}" height="${height}" fill="${SENA_FIGURE_PALETTE.paper}"/>
${renderSenaPublicationFigureSvgGroup(figure)}
</svg>`;
}

// --- Raster renderer ---------------------------------------------------------
//
// WHY THIS EXISTS RATHER THAN A REAL RASTERISER. The publication exports run in
// the production API route, and the only SVG rasteriser in the repo is `sharp`,
// which is a devDependency (it is used by the offline figure script, not by the
// server). So the PNG cannot be produced by rendering the SVG. What it CAN do,
// and what it does, is draw the very same marks with a small anti-aliased
// rasteriser: every line, disc, and ring below is the same geometry the SVG
// emits, at an integer scale, with coverage-based blending.
//
// The honest limitation is typography and nothing else: text is drawn in the
// export module's 5x7 bitmap font, which is uppercase-only and unhinted. The
// PNG therefore shows the real figure with degraded labels, and it says so on
// its own face. The SVG is the artifact for print.

export type SenaFigureRasterTarget = {
  /** Device-space bounds, for clipping. */
  width: number;
  height: number;
  /** Where the plane's (0,0) lands, in device pixels. */
  offsetX: number;
  offsetY: number;
  /** Device pixels per plane unit. */
  scale: number;
  /** Blend one device pixel. `alpha` is coverage x opacity, in [0,1]. */
  blend(x: number, y: number, color: readonly [number, number, number], alpha: number): void;
  /**
   * Bitmap text. `x`/`y` are device coordinates of the text's left edge and
   * baseline; `fontSize` is the plane-space font size (device size is
   * `fontSize * scale`).
   */
  text(
    value: string,
    x: number,
    y: number,
    fontSize: number,
    color: readonly [number, number, number],
    anchor: "start" | "middle" | "end"
  ): void;
};

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Anti-aliased thick segment: coverage is the distance to the segment. */
function rasterLine(target: SenaFigureRasterTarget, line: SenaFigureLine) {
  const color = hexToRgb(line.color);
  const x1 = target.offsetX + line.x1 * target.scale;
  const y1 = target.offsetY + line.y1 * target.scale;
  const x2 = target.offsetX + line.x2 * target.scale;
  const y2 = target.offsetY + line.y2 * target.scale;
  const half = Math.max(0.5, (line.strokeWidth * target.scale) / 2);
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - half - 1));
  const maxX = Math.min(target.width - 1, Math.ceil(Math.max(x1, x2) + half + 1));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - half - 1));
  const maxY = Math.min(target.height - 1, Math.ceil(Math.max(y1, y2) + half + 1));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
      const distance = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      const coverage = Math.min(1, Math.max(0, half + 0.5 - distance));
      if (coverage > 0) target.blend(x, y, color, coverage * line.opacity);
    }
  }
}

/** Anti-aliased filled disc with an optional ring, both in device pixels. */
function rasterDisc(
  target: SenaFigureRasterTarget,
  centre: { x: number; y: number },
  radius: number,
  fill: string,
  ring?: { color: string; width: number }
) {
  const cx = target.offsetX + centre.x * target.scale;
  const cy = target.offsetY + centre.y * target.scale;
  const r = radius * target.scale;
  const ringWidth = (ring?.width ?? 0) * target.scale;
  const outer = r + ringWidth;
  const fillColor = hexToRgb(fill);
  const ringColor = ring ? hexToRgb(ring.color) : fillColor;
  const minX = Math.max(0, Math.floor(cx - outer - 1));
  const maxX = Math.min(target.width - 1, Math.ceil(cx + outer + 1));
  const minY = Math.max(0, Math.floor(cy - outer - 1));
  const maxY = Math.min(target.height - 1, Math.ceil(cy + outer + 1));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (ringWidth > 0) {
        const ringCoverage = Math.min(1, Math.max(0, outer + 0.5 - distance));
        if (ringCoverage > 0) target.blend(x, y, ringColor, ringCoverage);
      }
      const coverage = Math.min(1, Math.max(0, r + 0.5 - distance));
      if (coverage > 0) target.blend(x, y, fillColor, coverage);
    }
  }
}

/** Draws the figure onto a raster target. Same marks, same order, as the SVG. */
export function rasterizeSenaPublicationFigure(figure: SenaPublicationFigure, target: SenaFigureRasterTarget) {
  if (figure.status !== "computed") {
    target.text(
      figure.reason,
      target.offsetX + (figure.plane.width * target.scale) / 2,
      target.offsetY + (figure.plane.height * target.scale) / 2,
      15,
      hexToRgb(SENA_FIGURE_PALETTE.ink),
      "middle"
    );
    return;
  }

  for (const line of figure.grid) rasterLine(target, line);
  for (const line of figure.axisLines) rasterLine(target, line);
  for (const edge of figure.edges) rasterLine(target, edge);

  for (const unit of figure.units) {
    rasterDisc(target, unit, unit.radius, unit.color, {
      color: SENA_FIGURE_PALETTE.paper,
      width: JENA_POINT_STROKE_WIDTH
    });
  }
  for (const node of figure.nodes) {
    rasterDisc(target, node, node.radius, SENA_FIGURE_PALETTE.ink, {
      color: SENA_FIGURE_PALETTE.paper,
      width: 1
    });
  }

  const ink = hexToRgb(SENA_FIGURE_PALETTE.ink);
  for (const label of figure.nodeLabels) {
    target.text(
      label.text,
      target.offsetX + label.x * target.scale,
      target.offsetY + label.y * target.scale,
      JENA_NETWORK_NODE_LABEL_FONT_SIZE,
      ink,
      label.textAnchor
    );
  }
  for (const unit of figure.units) {
    if (!unit.showLabel) continue;
    target.text(
      unit.label,
      target.offsetX + (unit.x + JENA_POINT_LABEL_OFFSET.x) * target.scale,
      target.offsetY + (unit.y + JENA_POINT_LABEL_OFFSET.y) * target.scale,
      JENA_POINT_LABEL_FONT_SIZE,
      ink,
      "start"
    );
  }
  for (const text of figure.texts) {
    target.text(
      text.text,
      target.offsetX + text.x * target.scale,
      target.offsetY + text.y * target.scale,
      text.fontSize,
      hexToRgb(text.color),
      text.anchor
    );
  }
  figure.legend.entries.forEach((entry, index) => {
    const y = figure.legend.y + 16 + index * 20;
    if (entry.kind === "line") {
      rasterLine(target, {
        x1: figure.legend.x + 12,
        y1: y,
        x2: figure.legend.x + 28,
        y2: y,
        color: entry.color,
        strokeWidth: 3,
        opacity: 1
      });
    } else {
      rasterDisc(target, { x: figure.legend.x + 20, y }, entry.radius, entry.color);
    }
    target.text(
      entry.name,
      target.offsetX + (figure.legend.x + 38) * target.scale,
      target.offsetY + (y + 4) * target.scale,
      11,
      ink,
      "start"
    );
  });
}

// --- PDF renderer ------------------------------------------------------------
//
// The PDF gets the figure as real vectors — pdf-lib draws lines and circles
// natively and embeds Helvetica, so the PDF carries the same geometry as the
// SVG with proper typography rather than an embedded raster.

export type SenaFigurePdfTarget = {
  /** Left edge of the plate, in PDF points. */
  x: number;
  /** TOP edge of the plate, in PDF points (PDF's y grows upward). */
  top: number;
  /** PDF points per plane unit. */
  scale: number;
  drawLine(options: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    thickness: number;
    opacity: number;
  }): void;
  drawDisc(options: {
    x: number;
    y: number;
    radius: number;
    color: string;
    borderColor?: string;
    borderWidth?: number;
  }): void;
  drawText(options: {
    text: string;
    x: number;
    y: number;
    size: number;
    color: string;
    bold: boolean;
    anchor: "start" | "middle" | "end";
  }): void;
};

/** Draws the figure onto a PDF page through the caller's pdf-lib bindings. */
export function drawSenaPublicationFigureOnPdf(figure: SenaPublicationFigure, target: SenaFigurePdfTarget) {
  const px = (value: number) => target.x + value * target.scale;
  const py = (value: number) => target.top - value * target.scale;

  if (figure.status !== "computed") {
    target.drawText({
      text: figure.reason,
      x: px(figure.plane.width / 2),
      y: py(figure.plane.height / 2),
      size: 10,
      color: SENA_FIGURE_PALETTE.ink,
      bold: true,
      anchor: "middle"
    });
    return;
  }

  const line = (row: SenaFigureLine) =>
    target.drawLine({
      x1: px(row.x1),
      y1: py(row.y1),
      x2: px(row.x2),
      y2: py(row.y2),
      color: row.color,
      thickness: Math.max(0.2, row.strokeWidth * target.scale),
      opacity: row.opacity
    });

  for (const row of figure.grid) line(row);
  for (const row of figure.axisLines) line(row);
  for (const row of figure.edges) line(row);

  for (const unit of figure.units) {
    target.drawDisc({
      x: px(unit.x),
      y: py(unit.y),
      radius: unit.radius * target.scale,
      color: unit.color,
      borderColor: SENA_FIGURE_PALETTE.paper,
      borderWidth: JENA_POINT_STROKE_WIDTH * target.scale
    });
  }
  for (const node of figure.nodes) {
    target.drawDisc({
      x: px(node.x),
      y: py(node.y),
      radius: node.radius * target.scale,
      color: SENA_FIGURE_PALETTE.ink,
      borderColor: SENA_FIGURE_PALETTE.paper,
      borderWidth: target.scale
    });
  }
  for (const label of figure.nodeLabels) {
    target.drawText({
      text: label.text,
      x: px(label.x),
      y: py(label.y),
      size: JENA_NETWORK_NODE_LABEL_FONT_SIZE * target.scale,
      color: SENA_FIGURE_PALETTE.ink,
      bold: true,
      anchor: label.textAnchor
    });
  }
  for (const unit of figure.units) {
    if (!unit.showLabel) continue;
    target.drawText({
      text: unit.label,
      x: px(unit.x + JENA_POINT_LABEL_OFFSET.x),
      y: py(unit.y + JENA_POINT_LABEL_OFFSET.y),
      size: JENA_POINT_LABEL_FONT_SIZE * target.scale,
      color: SENA_FIGURE_PALETTE.ink,
      bold: false,
      anchor: "start"
    });
  }
  for (const text of figure.texts) {
    target.drawText({
      text: text.text,
      x: px(text.x),
      y: py(text.y),
      size: text.fontSize * target.scale,
      color: text.color,
      bold: text.bold,
      anchor: text.anchor
    });
  }
  figure.legend.entries.forEach((entry, index) => {
    const y = figure.legend.y + 16 + index * 20;
    if (entry.kind === "line") {
      target.drawLine({
        x1: px(figure.legend.x + 12),
        y1: py(y),
        x2: px(figure.legend.x + 28),
        y2: py(y),
        color: entry.color,
        thickness: 3 * target.scale,
        opacity: 1
      });
    } else {
      target.drawDisc({
        x: px(figure.legend.x + 20),
        y: py(y),
        radius: entry.radius * target.scale,
        color: entry.color
      });
    }
    target.drawText({
      text: entry.name,
      x: px(figure.legend.x + 38),
      y: py(y + 4),
      size: 11 * target.scale,
      color: SENA_FIGURE_PALETTE.ink,
      bold: true,
      anchor: "start"
    });
  });
}
