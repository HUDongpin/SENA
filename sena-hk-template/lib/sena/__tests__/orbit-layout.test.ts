import { describe, expect, it } from "vitest";
import {
  buildSenaOrbitLayout,
  senaOrbitCommunityTints,
  SENA_ORBIT_ENVELOPE_DOCK_FLOOR,
  SENA_ORBIT_NODE_RADIUS_RANGE,
  type SenaOrbitLane,
  type SenaOrbitLayout,
  type SenaOrbitModelInput
} from "../orbit-layout";
import { buildAbsoluteEdgeStrokeScale, readableAbsoluteEdgeStrokeWidth } from "../visual-encoding";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaEdge, SenaModel, SenaSocialActorReport } from "../types";

// ADR 0009 (P2). The orbit is explanatory, not measured — so what has to be
// pinned is not a coordinate but the legibility contract Peter's 2026-08-08
// review asked for: reciprocal ties must stay apart from each other all the way
// to the node, and a lane's width must mean the same thing at every threshold.
// Every number asserted below is a geometric consequence of the port-docking
// constants; mutate one of those constants and these fail.

const PEOPLE = [
  { id: "p1", label: "Ms Lee", community: 0, strength: 9.4 },
  { id: "p2", label: "Mr Chan", community: 0, strength: 7.1 },
  { id: "p3", label: "Ms Ho", community: 0, strength: 5.8 },
  { id: "p4", label: "Dr Wong", community: 0, strength: 4.2 },
  { id: "p5", label: "Mr Ng", community: 1, strength: 6.6 },
  { id: "p6", label: "Ms Tsang", community: 1, strength: 3.9 },
  { id: "p7", label: "Dr Lam", community: 1, strength: 2.4 },
  { id: "p8", label: "Mr Yip", community: 1, strength: 1.1 }
] as const;

/** 20 directed ties, four of them reciprocal pairs. */
const TIES: Array<[string, string, number]> = [
  ["p1", "p2", 8], ["p2", "p1", 5],
  ["p3", "p4", 6], ["p4", "p3", 2],
  ["p5", "p6", 7], ["p6", "p5", 3],
  ["p1", "p5", 4], ["p5", "p1", 4],
  ["p1", "p3", 3],
  ["p2", "p3", 2],
  ["p2", "p4", 1],
  ["p3", "p5", 5],
  ["p4", "p6", 2],
  ["p5", "p7", 3],
  ["p6", "p7", 1],
  ["p6", "p8", 2],
  ["p7", "p8", 4],
  ["p8", "p1", 1],
  ["p2", "p6", 2],
  ["p4", "p8", 3]
];

const MAX_TIE_WEIGHT = TIES.reduce((max, [, , weight]) => Math.max(max, weight), 0);

function socialEdge(source: string, target: string, weight: number): SenaEdge {
  return {
    id: `social:${source}:${target}`,
    layer: "social",
    edgeType: "PP",
    sourceKind: "person",
    targetKind: "person",
    source,
    target,
    weight,
    // The default "max" normalization divides by the corpus matrix max, so this
    // is exactly what a real model hands the orbit.
    normalizedWeight: weight / MAX_TIE_WEIGHT,
    scaledWeight: 0.4 * (weight / MAX_TIE_WEIGHT),
    label: `${source} -> ${target}`,
    evidence: []
  };
}

function actor(person: (typeof PEOPLE)[number]): SenaSocialActorReport {
  return {
    id: person.id,
    label: person.label,
    role: "Teacher",
    group: "Team",
    degree: 3,
    strength: person.strength,
    betweenness: 0,
    closeness: 0,
    reachable: 7,
    component: 0,
    community: person.community,
    topInteractors: []
  };
}

function personNode(person: (typeof PEOPLE)[number]): SenaModel["nodes"][number] {
  return {
    id: person.id,
    kind: "person",
    label: person.label,
    role: "Teacher",
    group: "Team",
    initials: person.label
      .split(/[\s/_-]+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    metrics: {
      socialStrength: person.strength,
      socialDegree: 3,
      socialBetweenness: 0,
      socialCloseness: 0,
      socialComponent: 0,
      socialCommunity: person.community,
      socialReachable: 7,
      epistemicContribution: 0,
      bridgeScore: 0,
      epistemicDiversity: 0,
      alignment: 0,
      conceptBrokerage: 0,
      topInteractors: [],
      topCodes: [],
      topPairs: []
    }
  };
}

function communityReport(communities: number[]) {
  return [...new Set(communities)].sort((left, right) => left - right).map((id) => ({
    id,
    label: `Community ${id + 1}`,
    size: PEOPLE.filter((person) => person.community === id).length,
    memberIds: PEOPLE.filter((person) => person.community === id).map((person) => person.id),
    members: PEOPLE.filter((person) => person.community === id).map((person) => person.label),
    internalWeight: 0,
    externalWeight: 0
  }));
}

function orbitFixture(overrides: { singleCommunity?: boolean } = {}): SenaOrbitModelInput {
  const people = overrides.singleCommunity
    ? PEOPLE.map((person) => ({ ...person, community: 0 }))
    : PEOPLE.map((person) => ({ ...person }));

  return {
    nodes: people.map((person) => personNode(person as (typeof PEOPLE)[number])),
    edges: TIES.map(([source, target, weight]) => socialEdge(source, target, weight)),
    socialReport: {
      graph: {
        tieCount: TIES.length,
        density: 0.36,
        reciprocity: 0.4,
        averagePathLength: 1.8,
        componentCount: 1,
        largestComponentSize: people.length,
        mode: "digraph",
        communityDetection: "labelPropagation"
      } as SenaModel["socialReport"]["graph"],
      actors: people.map((person) => actor(person as (typeof PEOPLE)[number])),
      communities: communityReport(people.map((person) => person.community))
    }
  };
}

function laneById(lanes: SenaOrbitLane[], id: string) {
  const lane = lanes.find((candidate) => candidate.edgeId === id);
  if (!lane) throw new Error(`lane ${id} not in layout`);
  return lane;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Closest approach between two lanes over the stretch where both are at full lane height. */
function plateauSeparation(left: SenaOrbitLane, right: SenaOrbitLane) {
  let closest = Number.POSITIVE_INFINITY;
  for (let i = left.plateau.startIndex; i <= left.plateau.endIndex; i += 1) {
    const [lx, ly] = left.points[i];
    for (let j = right.plateau.startIndex; j <= right.plateau.endIndex; j += 1) {
      const [rx, ry] = right.points[j];
      closest = Math.min(closest, Math.hypot(lx - rx, ly - ry));
    }
  }
  return closest;
}

const TAU = Math.PI * 2;

/**
 * Signed short way round, the same [-PI, PI] convention the module uses —
 * including the antisymmetric antipodal boundary (`<`, not `<=`), so that both
 * directions of an exactly opposite pair agree on one half-ring instead of both
 * folding onto `+PI`.
 */
function shortDelta(from: number, to: number) {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/**
 * The ellipse's angle parameter at a drawn point. Lane points sit radially
 * outside the ring, and the outward push is along `(p - centre)`, so dividing
 * out `rx`/`ry` recovers the parameter the lane was sampled at (the offset
 * scales both components by the same factor and cancels).
 */
function pointAngle(layout: SenaOrbitLayout, point: [number, number]) {
  return Math.atan2(
    (point[1] - layout.geometry.center.y) / layout.geometry.ry,
    (point[0] - layout.geometry.center.x) / layout.geometry.rx
  );
}

function normalizeAngle(angle: number) {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

/**
 * The occupancy interval `assignOrbitLanes` books for a lane, mirrored from the
 * module: `[lo, lo + |shortDelta|]`, `lo` being whichever endpoint the sweep
 * departs from. A reciprocal pair books ONE interval for *both* of its lanes,
 * computed from the edge the heaviest-first pass reached first — which, because
 * `ordered` is sorted by `edgeOrder` and the inner lane is chosen by that same
 * comparator, is always the inner (lower-lane) partner.
 */
function bookedArc(layout: SenaOrbitLayout, lane: SenaOrbitLane): [number, number] {
  const persons = new Map(layout.persons.map((person) => [person.id, person]));
  const from = (persons.get(lane.source) as SenaOrbitLayout["persons"][number]).angle;
  const to = (persons.get(lane.target) as SenaOrbitLayout["persons"][number]).angle;
  const delta = shortDelta(from, to);
  const lo = normalizeAngle(delta >= 0 ? from : to);
  return [lo, lo + Math.abs(delta)];
}

function angleInArc(angle: number, [lo, hi]: [number, number], epsilon: number) {
  const wrapped = normalizeAngle(angle);
  return [-TAU, 0, TAU].some((shift) => wrapped + shift >= lo - epsilon && wrapped + shift <= hi + epsilon);
}

/** Per-step signed angular steps along a lane, each unwrapped into (-PI, PI]. */
function laneAngularSteps(layout: SenaOrbitLayout, lane: SenaOrbitLane) {
  const steps: number[] = [];
  for (let i = 1; i < lane.points.length; i += 1) {
    steps.push(shortDelta(pointAngle(layout, lane.points[i - 1]), pointAngle(layout, lane.points[i])));
  }
  return steps;
}

/**
 * The angular span the lane is *entitled* to: the short arc between its two
 * people, less the departure and arrival port offsets, reconstructed from the
 * module's published port law (`6 + offset * 0.30` out, `targetRadius * 0.55 +
 * offset * 0.75` back, both shrunk together when they exceed 70% of the span).
 * Mutate a port constant and this reconstruction — and the tests below — move.
 */
function laneEntitledSpan(layout: SenaOrbitLayout, lane: SenaOrbitLane) {
  const persons = new Map(layout.persons.map((person) => [person.id, person]));
  const source = persons.get(lane.source) as SenaOrbitLayout["persons"][number];
  const target = persons.get(lane.target) as SenaOrbitLayout["persons"][number];
  const rAvg = (layout.geometry.rx + layout.geometry.ry) / 2;
  const delta = shortDelta(source.angle, target.angle);
  const span = Math.abs(delta);
  let departOffset = (6 + lane.offset * 0.3) / rAvg;
  let arrivalPullback = (target.radius * 0.55 + lane.offset * 0.75) / rAvg;
  const portBudget = span * 0.7;
  if (departOffset + arrivalPullback > portBudget && departOffset + arrivalPullback > 0) {
    const shrink = portBudget / (departOffset + arrivalPullback);
    departOffset *= shrink;
    arrivalPullback *= shrink;
  }
  return { delta, span: span - departOffset - arrivalPullback };
}

const reciprocalPairs = TIES.filter(([source, target]) => (
  TIES.some(([otherSource, otherTarget]) => otherSource === target && otherTarget === source)
)).map(([source, target]) => [`social:${source}:${target}`, `social:${target}:${source}`] as const);

describe("orbit layout — ring order and placement", () => {
  it("orders the ring by community, then strength, then dataset order", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    expect(layout.persons.map((person) => person.id)).toEqual([
      "p1", "p2", "p3", "p4", // community 0, strength descending
      "p5", "p6", "p7", "p8" // community 1, strength descending
    ]);
  });

  it("places the first person at -90 degrees on evenly spaced angles", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());
    const step = (Math.PI * 2) / layout.persons.length;

    expect(layout.persons[0].angle).toBeCloseTo(-Math.PI / 2, 12);
    expect(layout.persons[0].x).toBeCloseTo(layout.geometry.center.x, 6);
    expect(layout.persons[0].y).toBeCloseTo(layout.geometry.center.y - layout.geometry.ry, 6);
    layout.persons.forEach((person, index) => {
      expect(person.angle).toBeCloseTo(-Math.PI / 2 + index * step, 12);
    });
  });

  it("sizes hexagons on a sqrt strength scale inside 18-40px", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());
    const strongest = layout.persons.find((person) => person.id === "p1");

    expect(strongest?.radius).toBe(SENA_ORBIT_NODE_RADIUS_RANGE.max);
    for (const person of layout.persons) {
      expect(person.radius).toBeGreaterThanOrEqual(SENA_ORBIT_NODE_RADIUS_RANGE.min);
      expect(person.radius).toBeLessThanOrEqual(SENA_ORBIT_NODE_RADIUS_RANGE.max);
    }
    // sqrt, not linear: half the strength is more than half the extra radius.
    const p5 = layout.persons.find((person) => person.id === "p5") as (typeof layout.persons)[number];
    const expected = 18 + 22 * Math.sqrt(6.6 / 9.4);
    expect(p5.radius).toBeCloseTo(Number(expected.toFixed(2)), 6);
  });
});

describe("orbit layout — lanes, ports and arrowheads", () => {
  it("gives every reciprocal pair its own lane, heavier tie inner", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    expect(reciprocalPairs.length).toBeGreaterThanOrEqual(4);
    for (const [forwardId, backId] of reciprocalPairs) {
      const forward = laneById(layout.lanes, forwardId);
      const back = laneById(layout.lanes, backId);
      expect(forward.lane).not.toBe(back.lane);
      if (forward.normalizedWeight > back.normalizedWeight) {
        expect(forward.lane).toBeLessThan(back.lane);
      }
    }
  });

  it("holds reciprocal lanes at least 8px apart across the plateau", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    for (const [forwardId, backId] of reciprocalPairs) {
      const separation = plateauSeparation(laneById(layout.lanes, forwardId), laneById(layout.lanes, backId));
      expect(separation).toBeGreaterThanOrEqual(8);
    }
  });

  it("docks reciprocal ports at least 12px apart at both nodes", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    for (const [forwardId, backId] of reciprocalPairs) {
      const forward = laneById(layout.lanes, forwardId);
      const back = laneById(layout.lanes, backId);
      // At the shared target of `forward`, `back` departs: those two ports are
      // the collision the design exists to remove.
      expect(distance(forward.dock, back.depart)).toBeGreaterThanOrEqual(12);
      expect(distance(back.dock, forward.depart)).toBeGreaterThanOrEqual(12);
    }
  });

  it("never lets the envelope collapse to zero at the dock", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    expect(SENA_ORBIT_ENVELOPE_DOCK_FLOOR).toBeGreaterThanOrEqual(0.14);
    for (const lane of layout.lanes) {
      expect(lane.envelopeEnd).toBeGreaterThanOrEqual(0.14);
      expect(lane.envelopeEnd).toBeCloseTo(SENA_ORBIT_ENVELOPE_DOCK_FLOOR, 12);
    }
  });

  it("keeps every lane clear of the hexagons it connects", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());
    const persons = new Map(layout.persons.map((person) => [person.id, person]));

    for (const lane of layout.lanes) {
      const source = persons.get(lane.source) as (typeof layout.persons)[number];
      const target = persons.get(lane.target) as (typeof layout.persons)[number];
      expect(distance(lane.depart, source)).toBeGreaterThanOrEqual(source.radius);
      expect(distance(lane.dock, target)).toBeGreaterThanOrEqual(target.radius);
    }
  });

  it("aims each arrowhead at its target and sizes it off the stroke", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());
    const persons = new Map(layout.persons.map((person) => [person.id, person]));

    for (const lane of layout.lanes) {
      const target = persons.get(lane.target) as (typeof layout.persons)[number];
      expect(lane.arrowhead.polygon).toHaveLength(3);
      // The tip advances from the dock toward the node perimeter, never into it.
      expect(distance(lane.arrowhead.tip, target)).toBeLessThanOrEqual(distance(lane.dock, target) + 0.01);
      expect(distance(lane.arrowhead.tip, target)).toBeGreaterThan(target.radius * 0.5);
      const headLength = Math.hypot(
        lane.arrowhead.polygon[0][0] - (lane.arrowhead.polygon[1][0] + lane.arrowhead.polygon[2][0]) / 2,
        lane.arrowhead.polygon[0][1] - (lane.arrowhead.polygon[1][1] + lane.arrowhead.polygon[2][1]) / 2
      );
      expect(headLength).toBeCloseTo(Math.min(14, Math.max(9, lane.strokeWidth * 2.6)), 1);
    }
  });
});

describe("orbit layout — every lane takes the short way round", () => {
  // The seam. Placement angles live in [-PI/2, 3PI/2), so a pair whose short arc
  // crosses -90 degrees has a raw angle difference of the opposite sign and
  // nearly complementary magnitude to `shortDelta`. Interpolating between raw
  // angles drew those lanes almost all the way round the ring, against their own
  // `sweep`, through hexagons, docking on the far side of the target — while
  // `assignOrbitLanes` had booked only the short arc, voiding the lane
  // non-overlap guarantee. The antipodal pair every even ring contains is the
  // boundary instance. Nothing in the shipped dock/plateau invariants saw it,
  // because none of them looked at where the path went in between.
  const surfaces: Array<[string, SenaOrbitLayout]> = [
    ["8-person fixture", buildSenaOrbitLayout(orbitFixture())],
    ["live pilot model", buildSenaOrbitLayout(buildSenaModel(lessonStudySenaContract))]
  ];

  for (const [label, layout] of surfaces) {
    it(`travels the short arc, in the swept direction, on the ${label}`, () => {
      expect(layout.lanes.length).toBeGreaterThan(0);

      for (const lane of layout.lanes) {
        const { delta, span } = laneEntitledSpan(layout, lane);
        const steps = laneAngularSteps(layout, lane);
        const travel = steps.reduce((total, step) => total + step, 0);

        // Sign: the drawn direction is the sweep the lane declares, which is the
        // sign of the wrap-aware short delta. This is the assertion the seam bug
        // fails outright — it drew p8->p1 at -316 degrees for a +45 degree tie.
        expect(Math.sign(delta)).toBe(lane.sweep);
        expect(Math.sign(travel)).toBe(lane.sweep);

        // Monotone: no step ever turns back. Exact, no tolerance — a long-way
        // path is monotone too, but monotone the *other* way, so this and the
        // sign check together pin the branch the arc was interpolated on.
        for (const step of steps) {
          expect(Math.sign(step) === lane.sweep || step === 0).toBe(true);
        }

        // Magnitude: the short arc less the two port offsets is the ceiling, and
        // node-clearance trimming is the only thing allowed to take from it.
        // 1e-4 rad (0.006 degrees) absorbs the 2-decimal rounding the emitted
        // points carry; the failure this guards against is measured in radians.
        expect(Math.abs(travel)).toBeLessThanOrEqual(span + 1e-4);
        expect(Math.abs(travel)).toBeGreaterThanOrEqual(span * 0.85);
      }
    });

    it(`stays inside the arc its lane assignment booked, on the ${label}`, () => {
      // The occupancy book is the whole basis of the lane-overlap guarantee: a
      // lane may only be drawn where `assignOrbitLanes` reserved room for it.
      // Every other invariant here measures a lane against its *own* endpoints,
      // which is exactly what a booking bug survives — the arc is short, sweeps
      // the way it says, clears the hexagons, and is still on a half-ring nobody
      // reserved. An exactly antipodal pair is the case that separates the two:
      // both directions return the same `+PI` from `shortDelta`, so `arcInterval`
      // hands back a *different* half-ring per direction while `assignOrbitLanes`
      // books only the first one for both lanes.
      const laneByEdge = new Map(layout.lanes.map((lane) => [lane.edgeId, lane]));
      let antipodalLanesChecked = 0;

      for (const lane of layout.lanes) {
        const partner = laneByEdge.get(`social:${lane.target}:${lane.source}`);
        const booker = partner && partner.lane < lane.lane ? partner : lane;
        const booked = bookedArc(layout, booker);

        // A booked arc is a half ring at most, by construction — so a pair whose
        // two lanes land on opposite halves can never both fit in one booking.
        expect(booked[1] - booked[0]).toBeLessThanOrEqual(Math.PI + 1e-9);

        if (Math.abs(Math.abs(laneEntitledSpan(layout, lane).delta) - Math.PI) < 1e-9) {
          antipodalLanesChecked += 1;
        }

        // 1e-3 rad (0.06 degrees) absorbs the 2-decimal rounding the emitted
        // points carry; the excursion this guards against is a half ring wide.
        const outside = lane.points.filter((point) => !angleInArc(pointAngle(layout, point), booked, 1e-3));
        expect({ edgeId: lane.edgeId, pointsOutsideBookedArc: outside.length })
          .toEqual({ edgeId: lane.edgeId, pointsOutsideBookedArc: 0 });

        if (partner) {
          // Both directions of a reciprocal tie have to resolve to the same
          // half-ring. That agreement is what makes booking the interval once
          // and handing it to both lanes legitimate in the first place.
          const own = bookedArc(layout, lane);
          expect(Math.abs(shortDelta(booked[0], own[0]))).toBeLessThan(1e-9);
          expect(own[1] - own[0]).toBeCloseTo(booked[1] - booked[0], 12);
        }
      }

      // The boundary case has to actually be present, or the loop above is only
      // exercising the pairs that were never in doubt.
      expect(antipodalLanesChecked).toBeGreaterThan(0);
    });

    it(`clears every hexagon it is not docking at, on the ${label}`, () => {
      for (const lane of layout.lanes) {
        for (const person of layout.persons) {
          let closest = Number.POSITIVE_INFINITY;
          for (const [x, y] of lane.points) {
            closest = Math.min(closest, Math.hypot(x - person.x, y - person.y));
          }
          // Endpoints included: the depart/arrival trim already buys
          // `radius + clearance` at both ports, so once the arc is on the right
          // branch no point of any lane is inside any hexagon at all. The old
          // long-way lanes ran straight through their own endpoints' hexes
          // (15.7px into a 40px node) and this is what caught it.
          expect(closest).toBeGreaterThanOrEqual(person.radius);
        }
      }
    });
  }

  it("keeps the antipodal pair an even ring guarantees on its short arc", () => {
    // Eight people, so p1 and p5 sit exactly opposite: raw difference -180
    // degrees maps to shortDelta +180, and the raw-angle interpolation used to
    // draw one direction of every such pair the long way with inverted sweep.
    const layout = buildSenaOrbitLayout(orbitFixture());
    const antipodal = layout.lanes.filter((lane) => (
      Math.abs(Math.abs(laneEntitledSpan(layout, lane).delta) - Math.PI) < 1e-9
    ));

    expect(antipodal.length).toBeGreaterThan(0);
    for (const lane of antipodal) {
      const travel = laneAngularSteps(layout, lane).reduce((total, step) => total + step, 0);
      expect(Math.sign(travel)).toBe(lane.sweep);
      expect(Math.abs(travel)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe("orbit layout — determinism and filter stability", () => {
  it("returns identical geometry for two runs on the same model", () => {
    const first = buildSenaOrbitLayout(orbitFixture());
    const second = buildSenaOrbitLayout(orbitFixture());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("is insensitive to the order edges arrive in", () => {
    const model = orbitFixture();
    const shuffled: SenaOrbitModelInput = { ...model, edges: [...model.edges].reverse() };

    expect(JSON.stringify(buildSenaOrbitLayout(shuffled).lanes))
      .toBe(JSON.stringify(buildSenaOrbitLayout(model).lanes));
  });

  it("keeps lane widths identical when a disjoint edge is filtered out", () => {
    const model = orbitFixture();
    // 1/8 = 0.125 clears every weight-1 tie, none of which shares an endpoint
    // ordering with the survivors' widths.
    const unfiltered = buildSenaOrbitLayout(model, { threshold: 0 });
    const filtered = buildSenaOrbitLayout(model, { threshold: 0.2 });

    expect(filtered.lanes.length).toBeLessThan(unfiltered.lanes.length);
    const widths = new Map(unfiltered.lanes.map((lane) => [lane.edgeId, lane.strokeWidth]));
    for (const lane of filtered.lanes) {
      expect(lane.strokeWidth).toBe(widths.get(lane.edgeId));
    }
  });

  it("anchors width on the corpus, not on the surviving slice", () => {
    const model = orbitFixture();
    const heaviest = model.edges.find((edge) => edge.id === "social:p1:p2") as SenaEdge;
    const wholeCorpus = buildAbsoluteEdgeStrokeScale(model.edges);
    const oneEdge = buildAbsoluteEdgeStrokeScale([heaviest]);

    expect(readableAbsoluteEdgeStrokeWidth(heaviest, oneEdge, { min: 2.5, max: 8.5 }))
      .toBe(readableAbsoluteEdgeStrokeWidth(heaviest, wholeCorpus, { min: 2.5, max: 8.5 }));
    // width = min + clamp(normalizedWeight)^0.72 * (max - min)
    const expected = Number((2.5 + Math.pow(8 / 8, 0.72) * (8.5 - 2.5)).toFixed(2));
    expect(readableAbsoluteEdgeStrokeWidth(heaviest, wholeCorpus, { min: 2.5, max: 8.5 })).toBe(expected);
  });

  it("draws every lane inside the orbit stroke range", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    for (const lane of layout.lanes) {
      expect(lane.strokeWidth).toBeGreaterThanOrEqual(layout.strokeRange.min);
      expect(lane.strokeWidth).toBeLessThanOrEqual(layout.strokeRange.max);
    }
  });
});

describe("orbit layout — community tint and labels", () => {
  it("tints two communities and leaves a single-community model untinted", () => {
    const twoCommunities = buildSenaOrbitLayout(orbitFixture());
    const oneCommunity = buildSenaOrbitLayout(orbitFixture({ singleCommunity: true }));

    expect(twoCommunities.communityTints).toHaveLength(2);
    expect(twoCommunities.communityTints.map((entry) => entry.tint))
      .toEqual([senaOrbitCommunityTints[0], senaOrbitCommunityTints[1]]);
    expect(new Set(twoCommunities.persons.map((person) => person.communityTint)).size).toBe(2);

    expect(oneCommunity.communityTints).toEqual([]);
    for (const person of oneCommunity.persons) {
      expect(person.communityTint).toBeUndefined();
    }
  });

  it("places 8 always-on labels without a single overlap", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    expect(layout.persons).toHaveLength(8);
    for (const person of layout.persons) {
      expect(person.nameLabel.text).toBe(person.label);
    }
    for (let i = 0; i < layout.persons.length; i += 1) {
      for (let j = i + 1; j < layout.persons.length; j += 1) {
        const a = layout.persons[i].nameLabel.box;
        const b = layout.persons[j].nameLabel.box;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width &&
          a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("never lays a name over one of that person's ports", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    for (const person of layout.persons) {
      const ports = layout.lanes
        .filter((lane) => lane.source === person.id || lane.target === person.id)
        .map((lane) => (lane.source === person.id ? lane.depart : lane.dock));
      expect(ports.length).toBeGreaterThan(0);
      const box = person.nameLabel.box;
      for (const port of ports) {
        const inside = port.x >= box.x && port.x <= box.x + box.width &&
          port.y >= box.y && port.y <= box.y + box.height;
        // A port under the name reads as though the name belongs to the lane.
        expect(inside).toBe(false);
      }
    }
  });

  it("holds the same invariants on the live pilot model", () => {
    // The hand fixture controls the geometry; the pilot proves the module takes
    // a real SenaModel and that the invariants are not an artefact of it.
    const model = buildSenaModel(lessonStudySenaContract);
    const layout = buildSenaOrbitLayout(model);
    const laneByEdge = new Map(layout.lanes.map((lane) => [lane.edgeId, lane]));

    expect(layout.persons.length).toBe(model.socialReport.actors.length);
    expect(layout.lanes.length).toBeGreaterThan(0);
    for (const lane of layout.lanes) {
      const partner = laneByEdge.get(`social:${lane.target}:${lane.source}`);
      if (!partner) continue;
      expect(Math.abs(partner.lane - lane.lane)).toBe(1);
      expect(plateauSeparation(lane, partner)).toBeGreaterThanOrEqual(8);
      expect(distance(lane.dock, partner.depart)).toBeGreaterThanOrEqual(12);
    }
    for (let i = 0; i < layout.persons.length; i += 1) {
      for (let j = i + 1; j < layout.persons.length; j += 1) {
        const a = layout.persons[i].nameLabel.box;
        const b = layout.persons[j].nameLabel.box;
        expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height)
          .toBe(false);
      }
    }
  });

  it("never lays a name over another person's hexagon", () => {
    const layout = buildSenaOrbitLayout(orbitFixture());

    for (const person of layout.persons) {
      const box = person.nameLabel.box;
      for (const other of layout.persons) {
        if (other.id === person.id) continue;
        const overlaps = box.x < other.x + other.radius && other.x - other.radius < box.x + box.width &&
          box.y < other.y + other.radius && other.y - other.radius < box.y + box.height;
        expect(overlaps).toBe(false);
      }
    }
  });
});
