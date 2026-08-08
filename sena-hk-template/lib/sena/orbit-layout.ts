import {
  buildAbsoluteEdgeStrokeScale,
  buildConceptPairContributionMap,
  readableAbsoluteEdgeStrokeWidth,
  readableEdgeStrokeSignal,
  senaOrbitSocialStrokeRange
} from "./visual-encoding";
import type { SenaEdge, SenaModel } from "./types";

// ADR 0009: inside Fusion the plane owns measured coordinates and the orbit owns
// its ring math. Nothing here is a measurement — a person's angle is an ordering
// choice and a lane's offset is a legibility choice — so all of it is pure,
// deterministic, and unit-testable without React. The one thing the orbit does
// carry quantitatively is edge width, and that comes from the corpus-anchored
// absolute stroke scale so a lane means the same thickness at every threshold.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/** Hexagon circumradius floor/ceiling; strength maps in on a sqrt scale. */
export const SENA_ORBIT_NODE_RADIUS_RANGE = { min: 18, max: 40 } as const;

/**
 * Lane 0 sits 44px outside the ring and each further lane adds 26px.
 *
 * 44 is not cosmetic. A reciprocal pair docks lane 0 at
 * `tgtR * 0.55 + off * 0.75` px along the arc from the node and departs lane 1
 * at `6 + off * 0.30`; the gap between those two ports grows with the *base*
 * offset (0.45 * base) and shrinks with the step (0.30 * step). Below ~36 the
 * two ports fall inside each other's node-clearance trim and converge, which is
 * exactly the collision this design exists to remove. See the dock-port
 * separation invariant in `__tests__/orbit-layout.test.ts`.
 */
export const SENA_ORBIT_LANE_BASE_OFFSET = 44;
export const SENA_ORBIT_LANE_STEP = 26;

/** Envelope shape, verbatim from the adopted mockup's `orbitTie`. */
export const SENA_ORBIT_ENVELOPE_RISE_END = 0.22;
export const SENA_ORBIT_ENVELOPE_FALL_START = 0.2;
export const SENA_ORBIT_ENVELOPE_DOCK_FLOOR = 0.16;

/** Samples per lane path. */
export const SENA_ORBIT_SAMPLE_COUNT = 160;

/** Extra clearance beyond the hexagon circumradius before a lane may start/end. */
export const SENA_ORBIT_DEPART_CLEARANCE = 7;
export const SENA_ORBIT_ARRIVAL_CLEARANCE = 11;

/**
 * Community ring tints. Deterministic by position in
 * `socialReport.communities` (which model.ts already sorts by community id), so
 * the same dataset always paints the same rings. A single-community model gets
 * no tint at all: a colour that never varies encodes nothing and only competes
 * with the plane.
 */
export const senaOrbitCommunityTints = [
  "#12b4cf",
  "#a06bf5",
  "#f2994a",
  "#3ec98a",
  "#e2679b",
  "#7f9cf5"
] as const;

/**
 * Default geometry for a 1240x840 surface holding a 720x520 plane at (260,160).
 * `rx`/`ry` are chosen so the plane's corners fall inside the ellipse
 * ((360/545)^2 + (260/348)^2 = 0.99 < 1) — the ring encloses the plane rather
 * than cutting through it — while the outermost node edge plus its label still
 * clears the surface. Consumers with different canvases pass their own.
 */
export const senaOrbitDefaultGeometry: SenaOrbitGeometry = {
  center: { x: 620, y: 420 },
  rx: 545,
  ry: 348
};

export const SENA_ORBIT_LABEL_FONT_SIZE = 12.5;
/** Same glyph-width approximation ADR 0008's plot encoding uses for labels. */
export const SENA_ORBIT_LABEL_GLYPH_ASPECT = 0.58;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SenaOrbitGeometry = {
  center: { x: number; y: number };
  rx: number;
  ry: number;
};

export type SenaOrbitLabelSide = "below" | "above" | "right" | "left";

export type SenaOrbitPersonLabel = {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  side: SenaOrbitLabelSide;
  fontSize: number;
  /** Approximate ink box, used by the overlap invariant. */
  box: { x: number; y: number; width: number; height: number };
};

export type SenaOrbitPerson = {
  id: string;
  label: string;
  initials: string;
  role: string;
  /** Position in the ring, 0 = first person (placed at -90 degrees). */
  index: number;
  angle: number;
  x: number;
  y: number;
  radius: number;
  strength: number;
  community: number;
  communityTint?: string;
  nameLabel: SenaOrbitPersonLabel;
};

export type SenaOrbitArrowhead = {
  /** SVG polygon `points`. */
  points: string;
  tip: { x: number; y: number };
  polygon: Array<[number, number]>;
};

export type SenaOrbitLane = {
  edgeId: string;
  source: string;
  target: string;
  label: string;
  /** 0 = innermost. Reciprocal partners always differ. */
  lane: number;
  offset: number;
  /** Sweep direction: +1 counter-clockwise in SVG coordinates, -1 clockwise. */
  sweep: 1 | -1;
  points: Array<[number, number]>;
  path: string;
  /** Index range within `points` whose envelope is at full lane height. */
  plateau: { startIndex: number; endIndex: number };
  depart: { x: number; y: number };
  dock: { x: number; y: number };
  /** Envelope value at the untrimmed arrival end; the >= 0.14 floor. */
  envelopeEnd: number;
  strokeWidth: number;
  opacity: number;
  weight: number;
  normalizedWeight: number;
  scaledWeight: number;
  salience: number;
  arrowhead: SenaOrbitArrowhead;
};

export type SenaOrbitLayout = {
  geometry: SenaOrbitGeometry;
  persons: SenaOrbitPerson[];
  lanes: SenaOrbitLane[];
  communityTints: Array<{ community: number; tint: string }>;
  laneCount: number;
  strokeRange: { min: number; max: number };
};

/** Everything the orbit reads off a model — narrow enough for hand fixtures. */
export type SenaOrbitModelInput = Pick<SenaModel, "edges" | "nodes" | "socialReport"> &
  Partial<Pick<SenaModel, "pairReport">>;

export type SenaOrbitLayoutOptions = {
  geometry?: Partial<SenaOrbitGeometry> & { center?: Partial<SenaOrbitGeometry["center"]> };
  /** Lanes below this normalizedWeight are dropped, matching the canvas filter. */
  threshold?: number;
  laneBaseOffset?: number;
  laneStep?: number;
  nodeRadiusRange?: { min: number; max: number };
  strokeRange?: { min: number; max: number };
  labelFontSize?: number;
};

// ---------------------------------------------------------------------------
// Angle helpers
// ---------------------------------------------------------------------------

function normalizeAngle(angle: number) {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

/** Signed short way round from `from` to `to`, in (-PI, PI]. */
function shortDelta(from: number, to: number) {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta <= -Math.PI) delta += TAU;
  return delta;
}

function arcInterval(from: number, to: number): [number, number] {
  const delta = shortDelta(from, to);
  const lo = normalizeAngle(delta >= 0 ? from : to);
  return [lo, lo + Math.abs(delta)];
}

function arcsOverlap(a: [number, number], b: [number, number]) {
  const epsilon = 1e-9;
  for (const shift of [-TAU, 0, TAU]) {
    const lo = b[0] + shift;
    const hi = b[1] + shift;
    if (a[0] + epsilon < hi && lo + epsilon < a[1]) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Ring order and placement
// ---------------------------------------------------------------------------

function orbitCommunityTints(model: SenaOrbitModelInput) {
  const communities = model.socialReport.communities ?? [];
  // One community is no information. Two or more, and the ring tint separates
  // them; the palette index follows the (id-sorted) report order.
  if (communities.length < 2) return [] as Array<{ community: number; tint: string }>;
  return communities.map((community, index) => ({
    community: community.id,
    tint: senaOrbitCommunityTints[index % senaOrbitCommunityTints.length]
  }));
}

function personInitials(label: string) {
  const initials = label
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || label.slice(0, 2).toUpperCase();
}

/**
 * Ring order: community id ascending, then strength descending, then the
 * dataset's own people order. `socialReport.actors` is built in
 * `dataset.people` order, so its index *is* that final tiebreak — which is what
 * makes the ring stable when two actors tie on both keys.
 */
function orbitRingOrder(model: SenaOrbitModelInput) {
  return model.socialReport.actors
    .map((actor, index) => ({ actor, index }))
    .sort((left, right) => (
      left.actor.community - right.actor.community ||
      right.actor.strength - left.actor.strength ||
      left.index - right.index
    ));
}

function orbitNodeRadius(strength: number, maxStrength: number, range: { min: number; max: number }) {
  if (!(maxStrength > 0) || !Number.isFinite(strength) || strength <= 0) return range.min;
  const intensity = Math.min(1, Math.sqrt(Math.max(0, strength) / maxStrength));
  return Number((range.min + intensity * (range.max - range.min)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Lane geometry
// ---------------------------------------------------------------------------

function laneEnvelope(t: number) {
  const rise = Math.sin((Math.PI / 2) * Math.min(1, t / SENA_ORBIT_ENVELOPE_RISE_END));
  const fall = SENA_ORBIT_ENVELOPE_DOCK_FLOOR +
    (1 - SENA_ORBIT_ENVELOPE_DOCK_FLOOR) *
      Math.sin((Math.PI / 2) * Math.min(1, (1 - t) / SENA_ORBIT_ENVELOPE_FALL_START));
  return Math.min(rise, fall);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

type LaneAssignment = {
  edge: SenaEdge;
  lane: number;
  interval: [number, number];
};

function edgeOrder(left: SenaEdge, right: SenaEdge) {
  return (
    right.normalizedWeight - left.normalizedWeight ||
    right.weight - left.weight ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

/**
 * Lanes are assigned over edges sorted heaviest-first: an edge takes the
 * innermost lane whose occupants' arcs it does not overlap. Arcs that merely
 * touch at a shared node are not overlaps, so distant parts of the ring reuse
 * lane 0 instead of stacking outward.
 *
 * A reciprocal pair is placed as a *unit* into adjacent lanes k and k+1,
 * heavier inner. Adjacency is not cosmetic. The arrival port sits
 * `tgtR * 0.55 + off * 0.75` px along the arc from the node and the partner's
 * departure port sits `6 + off * 0.30` px along it, so the gap between them is
 * `tgtR * 0.55 + 0.45 * offInner - 6 - 0.30 * (offOuter - offInner)`. Let the
 * greedy pass scatter a partner four lanes out and that gap goes to zero: the
 * two ports land on top of each other at the node, which is precisely the
 * collision this design removes. Paired lanes keep `offOuter - offInner` fixed
 * at one step, and the gap then only grows as the pair moves outward.
 */
function assignOrbitLanes(edges: SenaEdge[], angles: Map<string, number>): LaneAssignment[] {
  const ordered = [...edges].sort(edgeOrder);
  const byEndpoints = new Map(edges.map((edge) => [`${edge.source} ${edge.target}`, edge]));
  const occupancy: Array<Array<[number, number]>> = [];
  const assignments: LaneAssignment[] = [];
  const assigned = new Set<string>();

  const free = (lane: number, interval: [number, number]) => (
    !occupancy[lane]?.some((taken) => arcsOverlap(interval, taken))
  );
  const occupy = (lane: number, interval: [number, number]) => {
    if (!occupancy[lane]) occupancy[lane] = [];
    occupancy[lane].push(interval);
  };

  for (const edge of ordered) {
    if (assigned.has(edge.id)) continue;
    const from = angles.get(edge.source);
    const to = angles.get(edge.target);
    if (from === undefined || to === undefined) continue;
    const interval = arcInterval(from, to);
    const partner = byEndpoints.get(`${edge.target} ${edge.source}`);

    if (partner && !assigned.has(partner.id)) {
      const [inner, outer] = edgeOrder(edge, partner) <= 0 ? [edge, partner] : [partner, edge];
      let lane = 0;
      while (!(free(lane, interval) && free(lane + 1, interval))) lane += 1;
      occupy(lane, interval);
      occupy(lane + 1, interval);
      assigned.add(inner.id);
      assigned.add(outer.id);
      assignments.push({ edge: inner, lane, interval });
      assignments.push({ edge: outer, lane: lane + 1, interval });
      continue;
    }

    let lane = 0;
    while (!free(lane, interval)) lane += 1;
    occupy(lane, interval);
    assigned.add(edge.id);
    assignments.push({ edge, lane, interval });
  }

  return assignments;
}

function orbitArrowhead(
  tip: { x: number; y: number },
  direction: { x: number; y: number },
  strokeWidth: number
): SenaOrbitArrowhead {
  const length = Math.hypot(direction.x, direction.y) || 1;
  const ux = direction.x / length;
  const uy = direction.y / length;
  const headLength = Math.min(14, Math.max(9, strokeWidth * 2.6));
  const headWidth = headLength * 0.55;
  const baseX = tip.x - ux * headLength;
  const baseY = tip.y - uy * headLength;
  const polygon: Array<[number, number]> = [
    [round2(tip.x), round2(tip.y)],
    [round2(baseX - uy * headWidth), round2(baseY + ux * headWidth)],
    [round2(baseX + uy * headWidth), round2(baseY - ux * headWidth)]
  ];
  return {
    polygon,
    tip: { x: round2(tip.x), y: round2(tip.y) },
    points: polygon.map(([x, y]) => `${x},${y}`).join(" ")
  };
}

// ---------------------------------------------------------------------------
// Label side heuristic
// ---------------------------------------------------------------------------

const LABEL_SIDES: Array<{
  side: SenaOrbitLabelSide;
  unit: { x: number; y: number };
  anchor: "start" | "middle" | "end";
}> = [
  { side: "below", unit: { x: 0, y: 1 }, anchor: "middle" },
  { side: "above", unit: { x: 0, y: -1 }, anchor: "middle" },
  { side: "right", unit: { x: 1, y: 0 }, anchor: "start" },
  { side: "left", unit: { x: -1, y: 0 }, anchor: "end" }
];

function labelBoxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function buildLabelCandidate(
  person: { x: number; y: number; radius: number; label: string },
  side: (typeof LABEL_SIDES)[number],
  fontSize: number
): SenaOrbitPersonLabel {
  const width = person.label.length * fontSize * SENA_ORBIT_LABEL_GLYPH_ASPECT;
  const height = fontSize * 1.25;
  const gap = person.radius + 6;
  const x = person.x + side.unit.x * (gap + (side.anchor === "middle" ? 0 : 4));
  // SVG text y is the baseline; push it clear of the glyph box on each side.
  const y = person.y + side.unit.y * (gap + (side.side === "below" ? fontSize : 6)) +
    (side.unit.y === 0 ? fontSize * 0.35 : 0);
  const boxX = side.anchor === "middle" ? x - width / 2 : side.anchor === "start" ? x : x - width;
  return {
    text: person.label,
    x: round2(x),
    y: round2(y),
    anchor: side.anchor,
    side: side.side,
    fontSize,
    box: { x: round2(boxX), y: round2(y - height * 0.8), width: round2(width), height: round2(height) }
  };
}

/**
 * Labels are always on, so the only question is which side. The rule the mockup
 * encodes: pick the side without docks. Ports are where the eye follows a lane
 * into the node, and a name sitting on one reads as belonging to the lane.
 * Ties break outward (away from the plane) and then by placement order, and any
 * candidate whose ink box collides with an already-placed label or another
 * person's hexagon is rejected outright.
 */
function placeOrbitLabels(
  persons: Array<{ x: number; y: number; radius: number; label: string; angle: number }>,
  dockPoints: Map<number, Array<{ x: number; y: number }>>,
  center: { x: number; y: number },
  fontSize: number
): SenaOrbitPersonLabel[] {
  const placed: SenaOrbitPersonLabel[] = [];
  const results: SenaOrbitPersonLabel[] = [];

  persons.forEach((person, personIndex) => {
    const docks = dockPoints.get(personIndex) ?? [];
    const outward = {
      x: person.x - center.x,
      y: person.y - center.y
    };
    const outwardLength = Math.hypot(outward.x, outward.y) || 1;

    const scored = LABEL_SIDES.map((side, sideIndex) => {
      const candidate = buildLabelCandidate(person, side, fontSize);
      // A port that lands inside the name's ink box reads as part of the lane —
      // the hard version of "choose the side without docks".
      const portsInBox = docks.filter((dock) => (
        dock.x >= candidate.box.x - 2 && dock.x <= candidate.box.x + candidate.box.width + 2 &&
        dock.y >= candidate.box.y - 2 && dock.y <= candidate.box.y + candidate.box.height + 2
      )).length;
      // Worst (largest) alignment with any port direction: 1 means the label
      // points straight at a port, -1 means directly away from one.
      const dockAlignment = docks.reduce((worst, dock) => {
        const dx = dock.x - person.x;
        const dy = dock.y - person.y;
        const length = Math.hypot(dx, dy) || 1;
        return Math.max(worst, (dx * side.unit.x + dy * side.unit.y) / length);
      }, -1);
      const outwardAlignment = (outward.x * side.unit.x + outward.y * side.unit.y) / outwardLength;
      const collides = placed.some((other) => labelBoxesOverlap(candidate.box, other.box)) ||
        persons.some((other, otherIndex) => otherIndex !== personIndex && labelBoxesOverlap(candidate.box, {
          x: other.x - other.radius,
          y: other.y - other.radius,
          width: other.radius * 2,
          height: other.radius * 2
        }));
      const score = (collides ? 1000 : 0) + portsInBox * 100 +
        dockAlignment * 2 - outwardAlignment + sideIndex * 1e-6;
      return { candidate, score };
    }).sort((left, right) => left.score - right.score);

    const chosen = scored[0].candidate;
    placed.push(chosen);
    results.push(chosen);
  });

  return results;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function buildSenaOrbitLayout(
  model: SenaOrbitModelInput,
  options: SenaOrbitLayoutOptions = {}
): SenaOrbitLayout {
  const geometry: SenaOrbitGeometry = {
    center: {
      x: options.geometry?.center?.x ?? senaOrbitDefaultGeometry.center.x,
      y: options.geometry?.center?.y ?? senaOrbitDefaultGeometry.center.y
    },
    rx: options.geometry?.rx ?? senaOrbitDefaultGeometry.rx,
    ry: options.geometry?.ry ?? senaOrbitDefaultGeometry.ry
  };
  const laneBaseOffset = options.laneBaseOffset ?? SENA_ORBIT_LANE_BASE_OFFSET;
  const laneStep = options.laneStep ?? SENA_ORBIT_LANE_STEP;
  const radiusRange = options.nodeRadiusRange ?? SENA_ORBIT_NODE_RADIUS_RANGE;
  const strokeRange = options.strokeRange ?? senaOrbitSocialStrokeRange;
  const labelFontSize = options.labelFontSize ?? SENA_ORBIT_LABEL_FONT_SIZE;
  const threshold = options.threshold ?? 0;

  const tints = orbitCommunityTints(model);
  const tintByCommunity = new Map(tints.map((entry) => [entry.community, entry.tint]));
  const initialsById = new Map(
    model.nodes
      .filter((node): node is Extract<SenaModel["nodes"][number], { kind: "person" }> => node.kind === "person")
      .map((node) => [node.id, node.initials])
  );

  const ordered = orbitRingOrder(model);
  const maxStrength = model.socialReport.actors.reduce(
    (max, actor) => Math.max(max, Number.isFinite(actor.strength) ? actor.strength : 0),
    0
  );

  const rAvg = (geometry.rx + geometry.ry) / 2;
  const placements = ordered.map(({ actor }, index) => {
    // First person at -90 degrees: the ring reads from the top, clockwise in
    // SVG coordinates, so the order above is legible without a legend.
    const angle = -Math.PI / 2 + (index / Math.max(1, ordered.length)) * TAU;
    const radius = orbitNodeRadius(actor.strength, maxStrength, radiusRange);
    return {
      id: actor.id,
      label: actor.label,
      role: actor.role,
      initials: initialsById.get(actor.id) ?? personInitials(actor.label),
      index,
      angle,
      x: round2(geometry.center.x + geometry.rx * Math.cos(angle)),
      y: round2(geometry.center.y + geometry.ry * Math.sin(angle)),
      radius,
      strength: actor.strength,
      community: actor.community,
      communityTint: tintByCommunity.get(actor.community)
    };
  });

  const angleById = new Map(placements.map((placement) => [placement.id, placement.angle]));
  const radiusById = new Map(placements.map((placement) => [placement.id, placement.radius]));
  const indexById = new Map(placements.map((placement) => [placement.id, placement.index]));

  const socialEdges = model.edges.filter((edge) => (
    edge.layer === "social" &&
    edge.normalizedWeight >= threshold &&
    edge.source !== edge.target &&
    angleById.has(edge.source) &&
    angleById.has(edge.target)
  ));

  const contributions = model.pairReport ? buildConceptPairContributionMap({ pairReport: model.pairReport }) : undefined;
  const strokeScale = buildAbsoluteEdgeStrokeScale(socialEdges, contributions);

  const assignments = assignOrbitLanes(socialEdges, angleById);
  const dockPoints = new Map<number, Array<{ x: number; y: number }>>();
  const pushDock = (personIndex: number | undefined, at: { x: number; y: number }) => {
    if (personIndex === undefined) return;
    const list = dockPoints.get(personIndex) ?? [];
    list.push(at);
    dockPoints.set(personIndex, list);
  };

  const lanes: SenaOrbitLane[] = assignments.map(({ edge, lane }) => {
    const sourceAngle = angleById.get(edge.source) as number;
    const targetAngle = angleById.get(edge.target) as number;
    const sourceRadius = radiusById.get(edge.source) as number;
    const targetRadius = radiusById.get(edge.target) as number;
    const offset = laneBaseOffset + lane * laneStep;
    const delta = shortDelta(sourceAngle, targetAngle);
    const sweep: 1 | -1 = delta >= 0 ? 1 : -1;
    const span = Math.abs(delta);

    // Ports: depart a little along the sweep, arrive pulled back in proportion
    // to the lane offset, so nested lanes fan out instead of piling onto one
    // point of the node perimeter.
    let departOffset = (6 + offset * 0.30) / rAvg;
    let arrivalPullback = (targetRadius * 0.55 + offset * 0.75) / rAvg;
    // Two people almost on top of each other cannot pay for both ports; shrink
    // them together rather than letting the sweep invert.
    const portBudget = span * 0.7;
    if (departOffset + arrivalPullback > portBudget && departOffset + arrivalPullback > 0) {
      const shrink = portBudget / (departOffset + arrivalPullback);
      departOffset *= shrink;
      arrivalPullback *= shrink;
    }

    // Unwrap the target before building the arc. Placement angles live in
    // [-PI/2, 3PI/2), so whenever the short arc crosses the seam at -90 degrees
    // the raw difference `targetAngle - sourceAngle` has the opposite sign and a
    // nearly complementary magnitude to `delta` — interpolating between raw
    // angles then draws the lane the long way round, against its own `sweep`,
    // across third-party hexagons, and docks it on the far side of the target
    // while `assignOrbitLanes` books only the short arc. `sourceAngle + delta`
    // is the same point on the ring (cos/sin are periodic) expressed on the
    // branch the sweep is computed from, so interpolation, envelope, trimming,
    // docks, arrowheads and the booked occupancy interval all agree for every
    // pair, including the antipodal boundary every even ring guarantees.
    const endAngleBase = sourceAngle + delta;
    const startAngle = sourceAngle + sweep * departOffset;
    const endAngle = endAngleBase - sweep * arrivalPullback;

    const sampled: Array<[number, number]> = [];
    const envelopes: number[] = [];
    for (let i = 0; i <= SENA_ORBIT_SAMPLE_COUNT; i += 1) {
      const t = i / SENA_ORBIT_SAMPLE_COUNT;
      const angle = startAngle + (endAngle - startAngle) * t;
      const bx = geometry.center.x + geometry.rx * Math.cos(angle);
      const by = geometry.center.y + geometry.ry * Math.sin(angle);
      const radial = Math.hypot(bx - geometry.center.x, by - geometry.center.y) || 1;
      const envelope = laneEnvelope(t);
      envelopes.push(envelope);
      sampled.push([
        bx + ((bx - geometry.center.x) / radial) * offset * envelope,
        by + ((by - geometry.center.y) / radial) * offset * envelope
      ]);
    }

    const sourceCenter = {
      x: geometry.center.x + geometry.rx * Math.cos(sourceAngle),
      y: geometry.center.y + geometry.ry * Math.sin(sourceAngle)
    };
    const targetCenter = {
      x: geometry.center.x + geometry.rx * Math.cos(targetAngle),
      y: geometry.center.y + geometry.ry * Math.sin(targetAngle)
    };

    let startIndex = 0;
    while (
      startIndex < SENA_ORBIT_SAMPLE_COUNT &&
      Math.hypot(sampled[startIndex][0] - sourceCenter.x, sampled[startIndex][1] - sourceCenter.y) <
        sourceRadius + SENA_ORBIT_DEPART_CLEARANCE
    ) startIndex += 1;
    let endIndex = SENA_ORBIT_SAMPLE_COUNT;
    while (
      endIndex > 0 &&
      Math.hypot(sampled[endIndex][0] - targetCenter.x, sampled[endIndex][1] - targetCenter.y) <
        targetRadius + SENA_ORBIT_ARRIVAL_CLEARANCE
    ) endIndex -= 1;
    if (endIndex - startIndex < 4) {
      const middle = Math.round(SENA_ORBIT_SAMPLE_COUNT / 2);
      startIndex = Math.max(0, middle - 2);
      endIndex = Math.min(SENA_ORBIT_SAMPLE_COUNT, middle + 2);
    }

    const points = sampled.slice(startIndex, endIndex + 1).map(([x, y]) => [round2(x), round2(y)] as [number, number]);
    const path = `M${points.map(([x, y]) => `${x} ${y}`).join(" L")}`;

    const plateauStart = Math.max(
      startIndex,
      Math.ceil(SENA_ORBIT_ENVELOPE_RISE_END * SENA_ORBIT_SAMPLE_COUNT)
    );
    const plateauEnd = Math.min(
      endIndex,
      Math.floor((1 - SENA_ORBIT_ENVELOPE_FALL_START) * SENA_ORBIT_SAMPLE_COUNT)
    );

    const strokeWidth = readableAbsoluteEdgeStrokeWidth(edge, strokeScale, strokeRange);
    const salience = readableEdgeStrokeSignal(edge, strokeScale);
    const last = points[points.length - 1];
    const lead = points[Math.max(0, points.length - 4)];
    const toCenter = { x: targetCenter.x - last[0], y: targetCenter.y - last[1] };
    const toCenterLength = Math.hypot(toCenter.x, toCenter.y) || 1;
    const reach = Math.max(0, toCenterLength - (targetRadius + 2)) * 0.55;
    const tip = {
      x: last[0] + (toCenter.x / toCenterLength) * reach,
      y: last[1] + (toCenter.y / toCenterLength) * reach
    };
    const direction = {
      x: (last[0] - lead[0]) * 0.6 + (toCenter.x / toCenterLength) * 8,
      y: (last[1] - lead[1]) * 0.6 + (toCenter.y / toCenterLength) * 8
    };

    const depart = { x: points[0][0], y: points[0][1] };
    const dock = { x: last[0], y: last[1] };
    pushDock(indexById.get(edge.source), depart);
    pushDock(indexById.get(edge.target), dock);

    return {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      lane,
      offset,
      sweep,
      points,
      path,
      plateau: { startIndex: plateauStart - startIndex, endIndex: Math.max(plateauStart - startIndex, plateauEnd - startIndex) },
      depart,
      dock,
      envelopeEnd: envelopes[SENA_ORBIT_SAMPLE_COUNT],
      strokeWidth,
      opacity: round2(0.5 + 0.4 * Math.min(1, Math.max(0, edge.normalizedWeight))),
      weight: edge.weight,
      normalizedWeight: edge.normalizedWeight,
      scaledWeight: edge.scaledWeight,
      salience,
      arrowhead: orbitArrowhead(tip, direction, strokeWidth)
    };
  });

  const labels = placeOrbitLabels(placements, dockPoints, geometry.center, labelFontSize);
  const persons: SenaOrbitPerson[] = placements.map((placement, index) => ({
    ...placement,
    nameLabel: labels[index]
  }));

  return {
    geometry,
    persons,
    lanes,
    communityTints: tints,
    laneCount: lanes.reduce((max, lane) => Math.max(max, lane.lane + 1), 0),
    strokeRange: { min: strokeRange.min, max: strokeRange.max }
  };
}
