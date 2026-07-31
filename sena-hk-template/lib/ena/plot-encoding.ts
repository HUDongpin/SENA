import type { ENAPlotModel, ENAPlotTraceType, NetworkGraph } from "jena-js/plot";

// The visual grammar of an ENA plot, transcribed from jena-js 0.6.2's own
// renderer (src/plot/render.ts, shipped as dist/plot/index.js). SENA draws its
// plot in React rather than by DOM mutation, so without a shared definition the
// two renderers drift silently: before this module SENA used a different edge
// width curve, a different edge opacity curve, no network-node glyph, and no
// trajectory segments, which made a SENA screenshot and a jena-js screenshot of
// the same ENASet disagree about which connections looked strong.
//
// Every constant and formula below is jena-js's. lib/ena/__tests__/plot-parity
// re-runs jena-js's renderENAPlot against a stub SVG document and asserts the
// geometry produced here matches it attribute for attribute, so a jena-js
// upgrade that changes the grammar fails the suite instead of shipping.

export const JENA_PLOT_WIDTH = 720;
export const JENA_PLOT_HEIGHT = 520;
export const JENA_PLOT_MARGIN = 44;

export const JENA_NETWORK_EDGE_OPACITY = 0.72;
export const JENA_NETWORK_NODE_RADIUS = 5;
export const JENA_NETWORK_NODE_STROKE_WIDTH = 2;
export const JENA_POINT_STROKE_WIDTH = 1.25;
export const JENA_TRAJECTORY_STROKE_WIDTH = 1.5;
export const JENA_TRAJECTORY_OPACITY = 0.8;

/** jena-js offsets labels up and to the right of the glyph they belong to. */
export const JENA_POINT_LABEL_OFFSET = { x: 6, y: -6 } as const;
export const JENA_NETWORK_NODE_LABEL_OFFSET = { x: 7, y: -7 } as const;

export const JENA_POINT_LABEL_FONT_SIZE = 11;
export const JENA_NETWORK_NODE_LABEL_FONT_SIZE = 11;
export const JENA_AXIS_TITLE_FONT_SIZE = 12;
export const JENA_PLOT_TITLE_FONT_SIZE = 13;

export type PlotGeometry = {
  width: number;
  height: number;
  margin: number;
  /**
   * Per-axis margins, for surfaces that are not the 720x520 canvas. jena-js has
   * one margin because its canvas is fixed; the SENA workspace slot is wider
   * than it is tall and needs more horizontal inset to keep code labels off the
   * frame. Both default to `margin`, so a geometry that omits them projects
   * exactly as jena-js does.
   */
  marginX?: number;
  marginY?: number;
};

export const jenaPlotGeometry: PlotGeometry = {
  width: JENA_PLOT_WIDTH,
  height: JENA_PLOT_HEIGHT,
  margin: JENA_PLOT_MARGIN
};

export function geometryMarginX(geometry: PlotGeometry) {
  return geometry.marginX ?? geometry.margin;
}

export function geometryMarginY(geometry: PlotGeometry) {
  return geometry.marginY ?? geometry.margin;
}

/** jena-js's axis padding default; `lib/ena/results.ts` overrides it to 1.35. */
export const JENA_AXIS_PADDING = 1.2;

/**
 * jena-js's `rangeFromValues`: symmetric about zero, padded, with a 1e-9 floor
 * so an all-zero dimension still yields a usable range. Symmetry is what puts
 * the data origin at a fixed place, which is what makes the quadrant reading of
 * an ENA space meaningful.
 */
export function enaAxisRange(values: number[], padding = JENA_AXIS_PADDING): [number, number] {
  const max = Math.max(1e-9, ...values.map((value) => Math.abs(value))) * padding;
  return [-max, max];
}

/**
 * jena-js collapses a degenerate axis range to the pixel midpoint rather than
 * dividing by zero. Reproduced exactly, including the 1e-12 span threshold.
 */
export function scaleAxis(value: number, range: readonly [number, number], pixels: readonly [number, number]) {
  const span = range[1] - range[0];
  if (Math.abs(span) < 1e-12) return (pixels[0] + pixels[1]) / 2;
  return pixels[0] + ((value - range[0]) / span) * (pixels[1] - pixels[0]);
}

export function projectX(model: ENAPlotModel, x: number, geometry: PlotGeometry = jenaPlotGeometry) {
  const margin = geometryMarginX(geometry);
  return scaleAxis(x, model.axes.x.range, [margin, geometry.width - margin]);
}

export function projectY(model: ENAPlotModel, y: number, geometry: PlotGeometry = jenaPlotGeometry) {
  const margin = geometryMarginY(geometry);
  return scaleAxis(y, model.axes.y.range, [geometry.height - margin, margin]);
}

export function projectPoint(
  model: ENAPlotModel,
  point: { x: number; y: number },
  geometry: PlotGeometry = jenaPlotGeometry
): [number, number] {
  return [projectX(model, point.x, geometry), projectY(model, point.y, geometry)];
}

/**
 * Pixel position of the data origin, where jena-js draws the axis cross. This
 * is the projection of (0, 0) and not the centre of the canvas: an asymmetric
 * range puts the cross off-centre, which is how rENA plots read too.
 */
export function axisOrigin(model: ENAPlotModel, geometry: PlotGeometry = jenaPlotGeometry) {
  return {
    x: projectX(model, 0, geometry),
    y: projectY(model, 0, geometry)
  };
}

/** jena-js: `Math.max(1, Math.abs(edge.weight) * 4)` — unclamped above. */
export function networkEdgeStrokeWidth(weight: number) {
  return Math.max(1, Math.abs(weight) * 4);
}

/** jena-js: group markers 6px, code nodes 5px, everything else 4px. */
export function pointTraceRadius(type: ENAPlotTraceType | string | undefined) {
  if (type === "group") return 6;
  if (type === "nodes") return 5;
  return 4;
}

export type ResolvedNetworkEdge = {
  key: string;
  name: string;
  weight: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
};

/**
 * Edges whose endpoints both carry rotated positions, projected to pixels.
 * jena-js skips any edge with an unplaced endpoint rather than defaulting the
 * missing coordinate to zero — SENA's previous renderer defaulted to zero and
 * drew phantom edges into the origin.
 */
export function resolveNetworkEdges(
  model: ENAPlotModel,
  network: NetworkGraph,
  geometry: PlotGeometry = jenaPlotGeometry
): ResolvedNetworkEdge[] {
  const nodes = new Map(network.nodes.map((node) => [node.id, node]));
  const resolved: ResolvedNetworkEdge[] = [];

  for (const edge of network.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (source.x === undefined || source.y === undefined) continue;
    if (target.x === undefined || target.y === undefined) continue;

    const [x1, y1] = projectPoint(model, { x: source.x, y: source.y }, geometry);
    const [x2, y2] = projectPoint(model, { x: target.x, y: target.y }, geometry);
    resolved.push({
      key: edge.name,
      name: edge.name,
      weight: edge.weight,
      x1,
      y1,
      x2,
      y2,
      strokeWidth: networkEdgeStrokeWidth(edge.weight)
    });
  }

  return resolved;
}

export type ResolvedNetworkNode = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export function resolveNetworkNodes(
  model: ENAPlotModel,
  network: NetworkGraph,
  geometry: PlotGeometry = jenaPlotGeometry
): ResolvedNetworkNode[] {
  const resolved: ResolvedNetworkNode[] = [];

  for (const node of network.nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    const [x, y] = projectPoint(model, { x: node.x, y: node.y }, geometry);
    resolved.push({ id: node.id, label: node.label, x, y });
  }

  return resolved;
}

// --- rENA network styling ---------------------------------------------------
// jena-js's plot helper (renderENAPlot) is a deliberately minimal renderer:
// hollow fixed-radius nodes, one stroke width per |weight|, constant opacity.
// The canonical ENA look — rENA's ena.plot.network, the same style webENA and
// epistemicnetwork.org present — is richer, and three signatures make a plot
// read as ENA. All three are transcribed from rENA-main/R/ena.plot.network.R:
//
//   1. Node size ∝ connectivity. `nodes$weight` accumulates |edge weight| over
//      every incident edge, is normalized by the max, then rescaled to
//      `node.size` (rENA default c(3,10)). High-traffic codes render large.
//   2. Nodes are solid and neutral — `nodes$color = "black"`. SENA maps that to
//      the theme foreground so it survives both light and dark surfaces.
//   3. Edge weight drives width AND opacity AND saturation together
//      (`network.thickness`, `network.opacity`, `network.saturation`). Weak
//      edges are thin, faint, and desaturated toward gray; strong edges are
//      bold, opaque, and fully coloured.
//
// The geometry (positions, axis origin, edge endpoints) is identical to
// jena-js and rENA — proven to machine precision — so resolveNetworkEdges /
// resolveNetworkNodes above are reused unchanged; only the ink is rENA's.

/** rENA node.size default is c(3,10) marker units; radii tuned to the 720×520 canvas. */
export const RENA_NODE_RADIUS_RANGE: readonly [number, number] = [5, 15];
/** Edge stroke width in px at the weakest / strongest connection. */
export const RENA_EDGE_WIDTH_RANGE: readonly [number, number] = [1, 8];
/** rENA scale.range floor is 0–0.1; lifted slightly so weak edges stay readable. */
export const RENA_EDGE_OPACITY_RANGE: readonly [number, number] = [0.28, 1];

function rescale(value: number, from: readonly [number, number], to: readonly [number, number]) {
  const span = from[1] - from[0];
  const fraction = span <= 1e-12 ? 1 : (value - from[0]) / span;
  const clamped = Math.min(1, Math.max(0, fraction));
  return to[0] + clamped * (to[1] - to[0]);
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Scale a colour's saturation toward gray, the way rENA scales the HSV S channel
 * per edge (`color[2] = network.saturation[i]`). `factor` = 1 keeps the colour,
 * 0 collapses it to gray at the same luminance. Done in RGB against the pixel's
 * own gray point, which is visually equivalent to the HSV move and needs no
 * round-trip through hue.
 */
export function desaturate(hex: string, factor: number) {
  const { r, g, b } = hexToRgb(hex);
  const gray = 0.3 * r + 0.59 * g + 0.11 * b;
  const f = Math.min(1, Math.max(0, factor));
  return rgbToHex(gray + (r - gray) * f, gray + (g - gray) * f, gray + (b - gray) * f);
}

export type RenaStyledEdge = ResolvedNetworkEdge & {
  /** |weight| normalized across the network's edges, in [0,1]. */
  intensity: number;
  opacity: number;
  color: string;
};

export type RenaStyledNode = ResolvedNetworkNode & {
  /** Summed |weight| of incident edges, normalized to [0,1]. */
  connectivity: number;
  radius: number;
};

export type RenaStyledNetwork = {
  edges: RenaStyledEdge[];
  nodes: RenaStyledNode[];
};

/**
 * rENA-styled network: geometry from resolveNetworkEdges/Nodes, ink from rENA's
 * grammar. Edge width, opacity, and colour-saturation all scale with |weight|;
 * node radius scales with summed incident weight. `baseColor` is the trace's
 * colour, playing the role of rENA's positive palette entry.
 */
export function styleRenaNetwork(
  model: ENAPlotModel,
  network: NetworkGraph,
  baseColor: string,
  geometry: PlotGeometry = jenaPlotGeometry
): RenaStyledNetwork {
  const resolvedEdges = resolveNetworkEdges(model, network, geometry);
  const resolvedNodes = resolveNetworkNodes(model, network, geometry);

  const weights = resolvedEdges.map((edge) => Math.abs(edge.weight));
  const minWeight = weights.length ? Math.min(...weights) : 0;
  const maxWeight = weights.length ? Math.max(...weights) : 1;

  // Accumulate incident |weight| per node — rENA's nodes$weight. Only edges the
  // renderer actually draws (both endpoints placed) contribute, so an unplaced
  // code cannot inflate a neighbour's size.
  const drawnEdgeNames = new Set(resolvedEdges.map((edge) => edge.name));
  const connectivityRaw = new Map<string, number>();
  for (const rawEdge of network.edges) {
    if (!drawnEdgeNames.has(rawEdge.name)) continue;
    const magnitude = Math.abs(rawEdge.weight);
    connectivityRaw.set(rawEdge.source, (connectivityRaw.get(rawEdge.source) ?? 0) + magnitude);
    connectivityRaw.set(rawEdge.target, (connectivityRaw.get(rawEdge.target) ?? 0) + magnitude);
  }
  const maxConnectivity = Math.max(0, ...connectivityRaw.values());

  const edges: RenaStyledEdge[] = resolvedEdges.map((edge) => {
    const intensity = rescale(Math.abs(edge.weight), [minWeight, maxWeight], [0, 1]);
    return {
      ...edge,
      intensity,
      strokeWidth: rescale(Math.abs(edge.weight), [minWeight, maxWeight], RENA_EDGE_WIDTH_RANGE),
      opacity: rescale(Math.abs(edge.weight), [minWeight, maxWeight], RENA_EDGE_OPACITY_RANGE),
      // rENA desaturates weak edges; keep a floor so hue stays legible.
      color: desaturate(baseColor, 0.35 + 0.65 * intensity)
    };
  });

  const nodes: RenaStyledNode[] = resolvedNodes.map((node) => {
    const raw = connectivityRaw.get(node.id) ?? 0;
    const connectivity = maxConnectivity > 0 ? raw / maxConnectivity : 0;
    const radius = maxConnectivity > 0
      ? rescale(connectivity, [0, 1], RENA_NODE_RADIUS_RANGE)
      : RENA_NODE_RADIUS_RANGE[1];
    return { ...node, connectivity, radius };
  });

  return { edges, nodes };
}

// --- Collision-aware node labels ---------------------------------------------
// A DOCUMENTED DEVIATION FROM jena-js AND rENA, and the only one that moves
// label text off the canonical offset.
//
// Both grammars label every network node unconditionally at a fixed offset
// (JENA_NETWORK_NODE_LABEL_OFFSET). That is correct for a full-timeline plot,
// where the projection separates the codes. It fails on a scoped one: SENA's
// temporal windows re-run ENA over a handful of segments, and a window that
// lacks the data to separate two codes projects them to the *same pixel*. In
// the bundled pilot, window `stage:0:1-3` puts Hypothesis and Evidence at
// distance 0.00px and Reflection on top of Coordination; `stage:1:2-6`
// collapses all seven codes onto one horizontal line. Unconditional labelling
// then overprints two strings into unreadable mush ("Evidenthesis").
//
// The deviation is presentation, never geometry. Node and edge positions stay
// exactly where resolveNetworkNodes / resolveNetworkEdges put them — the
// jena-js parity suite still pins those to machine precision, and
// `plot-parity.test.ts` still pins *point* labels to jena-js's offset, which
// this does not touch. What changes is only which text is drawn where, in two
// stages:
//
//   1. MERGE. When one node's disc is entirely inside another's
//      (dist + r_small <= r_large), the reader sees ONE mark. Drawing two
//      labels beside one mark asserts a separation nothing on screen can
//      confirm, and fanning them apart invents a direction the projection did
//      not supply. So the covered nodes collapse into a single anchor carrying
//      every code at that mark — "Evidence · Reflection". That reads as what it
//      is: this window lacks the data to tell these codes apart. Containment is
//      the criterion because it is exactly the condition under which the second
//      glyph is invisible; it needs no tolerance constant, and exact
//      coincidence is just its d = 0 case.
//   2. QUADRANT FLIP. Anchors that stay visually distinct keep one label each —
//      merging those WOULD be a lie, the reader can see two marks. When their
//      text boxes still overlap, the label moves to whichever of the four
//      diagonal quadrants around its own node is free. Each candidate is
//      jena-js's own offset mirrored in x and/or y, so a moved label sits at
//      the same distance from its node as an unmoved one; only the corner
//      differs. Where even that is not enough — `stage:1:2-6` collapses all
//      seven codes onto one horizontal line — the corners ladder outward a line
//      at a time into the dimension the projection has vacated. Nothing is ever
//      dropped: if every candidate collides the least overlapping one wins, so
//      the layout degrades gradually instead of losing a code name.
//
// A well-separated plot hits neither stage and is byte-identical to what the
// unconditional rule produced — `nodeLabelPlacements` is a no-op there, which
// `plot-composition.test.ts` asserts. Placement is a pure function of the
// resolved nodes, so /workspace/ena and SENA's ENA Space (which render through
// one component, ADR 0008) cannot disagree, and it ignores selection and
// hover so ENA Space's parity with the plain plot holds in every state.

/** Merged anchors join their code labels with this, longest-form first. */
export const NODE_LABEL_MERGE_SEPARATOR = " · ";

/**
 * Average glyph advance as a fraction of font size, for the semibold sans-serif
 * the plot labels use. SVG text cannot be measured without a layout engine —
 * and the parity suites render to static markup, where there is none — so the
 * box is estimated. Slightly generous: over-estimating width makes the resolver
 * move a label that would just barely have fit, which costs nothing, whereas
 * under-estimating lets a real overlap through.
 */
export const NODE_LABEL_GLYPH_ASPECT = 0.58;

/** Padding around a label box, so resolved labels are not merely not-touching. */
export const NODE_LABEL_BOX_PADDING = 2;

/**
 * Slack in the containment test, in pixels.
 *
 * Not a fudge factor — without it the rule misfires on the exact case it exists
 * for. Two codes at the same coordinate get the same connectivity and therefore
 * the same radius, so `dist + r <= r` holds only to within float noise: the SVD
 * and rotation leave distances of ~1e-9 and radii that differ in the last bits,
 * which flips containment at random. Half a pixel is below what a reader can
 * resolve, so anything inside it is one mark by any honest reading, and it is
 * far too small to merge marks that are genuinely apart — the tightest real gap
 * in the pilot's degenerate windows is 9.49px, twenty times this.
 */
export const NODE_LABEL_COINCIDENCE_TOLERANCE = 0.5;

/**
 * How far a label's box reaches above and below its baseline, as a fraction of
 * font size. A text box is *not* symmetric about the baseline — nearly all of
 * it sits above — which is why flipping a label from above a node to below it
 * has to mirror the box rather than the baseline. Both the box and the
 * candidate positions derive from these, so the two cannot drift apart.
 */
export const NODE_LABEL_ASCENT_RATIO = 0.8;
export const NODE_LABEL_DESCENT_RATIO = 0.2;

export type LabelBox = { left: number; right: number; top: number; bottom: number };

export function estimateLabelWidth(text: string, fontSize = JENA_NETWORK_NODE_LABEL_FONT_SIZE) {
  return text.length * fontSize * NODE_LABEL_GLYPH_ASPECT;
}

/**
 * The box a `<text>` occupies. `anchor` mirrors SVG's text-anchor: an `end`
 * label extends left from its x, a `start` label right. The vertical extent is
 * the em box around the baseline — ascent above, a little descent below.
 */
export function labelBox(
  text: string,
  x: number,
  y: number,
  anchor: "start" | "end",
  fontSize = JENA_NETWORK_NODE_LABEL_FONT_SIZE
): LabelBox {
  const width = estimateLabelWidth(text, fontSize);
  const left = anchor === "end" ? x - width : x;
  return {
    left: left - NODE_LABEL_BOX_PADDING,
    right: left + width + NODE_LABEL_BOX_PADDING,
    top: y - fontSize * NODE_LABEL_ASCENT_RATIO - NODE_LABEL_BOX_PADDING,
    bottom: y + fontSize * NODE_LABEL_DESCENT_RATIO + NODE_LABEL_BOX_PADDING
  };
}

/** Height of a label box — one row of the ladder, and the flip's clearance. */
function labelBoxHeight(fontSize: number) {
  return fontSize * (NODE_LABEL_ASCENT_RATIO + NODE_LABEL_DESCENT_RATIO) + 2 * NODE_LABEL_BOX_PADDING;
}

/** Overlapping area of two boxes; 0 when they are disjoint. */
function boxOverlap(a: LabelBox, b: LabelBox) {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (x <= 0 || y <= 0) return 0;
  return x * y;
}

export type NodeLabelPlacement = {
  /** Ids of every node collapsed into this anchor, in the merge's own order. */
  ids: string[];
  /** The node whose position anchors the label — the largest of the merged set. */
  anchorId: string;
  /** One code, or several joined by NODE_LABEL_MERGE_SEPARATOR. */
  text: string;
  x: number;
  y: number;
  textAnchor: "start" | "end";
  /** True when this anchor carries more than one code's label. */
  merged: boolean;
  /** False when the label sits exactly where the jena-js rule would put it. */
  displaced: boolean;
};

type LabelCandidate = { x: number; y: number; textAnchor: "start" | "end" };

/**
 * Rows of extra candidates past the four corners, each one line further out.
 * Only reached when a plot is degenerate enough that all four corners collide —
 * in the pilot that is `stage:1:2-6`, where the projection collapses onto a
 * single horizontal line and five label anchors have to share it. The ladder
 * grows along the axis the projection has *vacated*, so it spends space the
 * data is not using; on a healthy plot no label ever leaves ring 0.
 */
export const NODE_LABEL_LADDER_ROWS = 3;

/**
 * Candidate positions for one label, nearest first.
 *
 * Ring 0 is the four diagonals: jena-js's offset, then that same offset
 * mirrored in x, in y, and in both. Every ring-0 candidate keeps jena-js's
 * horizontal distance from the node and puts its box at jena-js's vertical
 * distance — only the corner differs — which is what keeps a displaced label a
 * small, stated deviation rather than a free choice. The y mirror reflects the
 * *box*, not the baseline: mirroring the baseline of a box that reaches 0.8em
 * up and 0.2em down leaves the two rows overlapping, which would make the
 * vertical flip useless. Ring k repeats those four corners one box-height
 * further out, so adjacent rows abut rather than collide.
 */
function labelCandidates(
  x: number,
  y: number,
  radius: number,
  fontSize: number
): LabelCandidate[] {
  const dx = radius + JENA_NETWORK_NODE_LABEL_OFFSET.x;
  const dy = JENA_NETWORK_NODE_LABEL_OFFSET.y;
  /** Baseline that mirrors the ascent-heavy box across the node's own row. */
  const mirroredDy = -dy + fontSize * (NODE_LABEL_ASCENT_RATIO - NODE_LABEL_DESCENT_RATIO);
  const lineHeight = labelBoxHeight(fontSize);
  const candidates: LabelCandidate[] = [];

  for (let ring = 0; ring <= NODE_LABEL_LADDER_ROWS; ring += 1) {
    const rise = dy - ring * lineHeight;
    const fall = mirroredDy + ring * lineHeight;
    candidates.push(
      { x: x + dx, y: y + rise, textAnchor: "start" },
      { x: x - dx, y: y + rise, textAnchor: "end" },
      { x: x + dx, y: y + fall, textAnchor: "start" },
      { x: x - dx, y: y + fall, textAnchor: "end" }
    );
  }

  return candidates;
}

type PlacementNode = { id: string; label: string; x: number; y: number; radius: number };

/** Radius bucketed to the coincidence tolerance, so ties are ties. */
function radiusRank(radius: number) {
  return Math.round(radius / NODE_LABEL_COINCIDENCE_TOLERANCE);
}

/**
 * Group nodes that render as one mark. A node is absorbed when its disc lies
 * entirely within another's, which is precisely when it is invisible. Equal
 * radii at distance 0 absorb each other, so the larger-then-alphabetical order
 * below decides the anchor and the relation is applied once.
 */
function mergeCoincidentNodes(nodes: PlacementNode[]) {
  // Largest first so an anchor is always at least as large as what it absorbs;
  // label breaks the tie, which is what makes the result independent of the
  // order jena-js happened to emit the nodes in. Radii are compared at the same
  // sub-pixel resolution as containment, so two equally-connected codes tie on
  // the label rather than on whichever way the last bits of the SVD rounded.
  const ordered = [...nodes].sort(
    (left, right) =>
      radiusRank(right.radius) - radiusRank(left.radius) || left.label.localeCompare(right.label)
  );
  const anchorOf = new Map<string, PlacementNode>();
  const groups = new Map<string, PlacementNode[]>();

  for (const node of ordered) {
    let anchor: PlacementNode | undefined;
    for (const candidate of groups.keys()) {
      const host = anchorOf.get(candidate)!;
      const distance = Math.hypot(node.x - host.x, node.y - host.y);
      if (distance + node.radius <= host.radius + NODE_LABEL_COINCIDENCE_TOLERANCE) {
        anchor = host;
        break;
      }
    }
    if (anchor) {
      groups.get(anchor.id)!.push(node);
      continue;
    }
    anchorOf.set(node.id, node);
    groups.set(node.id, [node]);
  }

  return [...groups.entries()].map(([anchorId, members]) => ({
    anchor: anchorOf.get(anchorId)!,
    members
  }));
}

/**
 * Where each network node's label is drawn. Returns one placement per *visible*
 * mark, not per node: coincident and occluded nodes share an anchor. See the
 * block comment above for why this deviates from jena-js and rENA.
 *
 * Callers render exactly what comes back — the deviation lives here, in the
 * shared grammar, so both ENA routes inherit it (ADR 0008).
 */
export function nodeLabelPlacements(
  nodes: readonly ResolvedNetworkNode[] | readonly RenaStyledNode[],
  fontSize = JENA_NETWORK_NODE_LABEL_FONT_SIZE
): NodeLabelPlacement[] {
  const placementNodes: PlacementNode[] = nodes.map((node) => ({
    id: node.id,
    label: node.label,
    x: node.x,
    y: node.y,
    radius: "radius" in node ? node.radius : JENA_NETWORK_NODE_RADIUS
  }));

  const groups = mergeCoincidentNodes(placementNodes);
  // Resolve the biggest marks first: the most-connected code is the one a
  // reader looks up, so it keeps jena-js's canonical corner and the smaller
  // ones move around it.
  const ordered = [...groups].sort(
    (left, right) =>
      radiusRank(right.anchor.radius) - radiusRank(left.anchor.radius) ||
      left.anchor.label.localeCompare(right.anchor.label)
  );

  const placed: LabelBox[] = [];
  const placements: NodeLabelPlacement[] = [];

  for (const { anchor, members } of ordered) {
    // Alphabetical inside a merged anchor: no ordering of coincident codes is
    // meaningful, and a stable one keeps the rendered string deterministic.
    const sorted = [...members].sort((left, right) => left.label.localeCompare(right.label));
    const text = sorted.map((member) => member.label).join(NODE_LABEL_MERGE_SEPARATOR);
    const candidates = labelCandidates(anchor.x, anchor.y, anchor.radius, fontSize);

    let best = candidates[0];
    let bestBox = labelBox(text, best.x, best.y, best.textAnchor, fontSize);
    let bestOverlap = placed.reduce((total, box) => total + boxOverlap(bestBox, box), 0);

    // First free candidate wins, jena-js's corner tried first. If every corner
    // collides the least-overlapping one is kept, so a label is never dropped.
    if (bestOverlap > 0) {
      for (const candidate of candidates.slice(1)) {
        const box = labelBox(text, candidate.x, candidate.y, candidate.textAnchor, fontSize);
        const overlap = placed.reduce((total, other) => total + boxOverlap(box, other), 0);
        if (overlap < bestOverlap) {
          best = candidate;
          bestBox = box;
          bestOverlap = overlap;
        }
        if (overlap === 0) break;
      }
    }

    placed.push(bestBox);
    placements.push({
      ids: sorted.map((member) => member.id),
      anchorId: anchor.id,
      text,
      x: best.x,
      y: best.y,
      textAnchor: best.textAnchor,
      merged: sorted.length > 1,
      displaced: best !== candidates[0]
    });
  }

  // Emitted in the nodes' own order so the DOM does not reshuffle when a
  // window's connectivity changes; the anchor is the group's first node.
  const rank = new Map(placementNodes.map((node, index) => [node.id, index]));
  return placements.sort((left, right) => rank.get(left.anchorId)! - rank.get(right.anchorId)!);
}

// --- SENA presentation extensions -------------------------------------------
// Additive only: these never move a glyph jena-js would have drawn, they label
// what is already there. Keeping them here rather than inline in the component
// keeps the parity test's boundary explicit.

/**
 * `SVD1 · 51.0%` when the run reports variance for that dimension, otherwise
 * the bare dimension name jena-js uses.
 */
export function axisTitleWithVariance(dimension: string, variance?: Record<string, number>) {
  const share = variance?.[dimension];
  if (share === undefined || !Number.isFinite(share)) return dimension;
  return `${dimension} · ${(share * 100).toFixed(1)}%`;
}

export type PlotLegendEntry = {
  name: string;
  color: string;
  type: ENAPlotTraceType;
};

/**
 * One entry per distinct name+colour. A trajectory plot adds one trace per unit
 * — 24 participants means 24 traces — but traces in the same group share a name
 * and colour, so the legend collapses to one row per group instead of one row
 * per participant.
 */
export function plotLegendEntries(model: ENAPlotModel): PlotLegendEntry[] {
  const entries: PlotLegendEntry[] = [];
  const seen = new Set<string>();

  for (const trace of model.traces) {
    const key = `${trace.name}|${trace.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name: trace.name, color: trace.color, type: trace.type });
  }

  return entries;
}

/**
 * Strongest connections in a network trace, for the SENA edge-weight readout.
 * Ordered by absolute weight so subtracted networks surface their largest
 * differences in either direction.
 */
export function strongestEdges(network: NetworkGraph, limit = 5) {
  return [...network.edges]
    .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
    .slice(0, limit);
}
