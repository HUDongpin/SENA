# ADR 0008 — ENA Space uses the canonical ENA plot grammar

- **Status:** Accepted
- **Date:** 2026-07-31
- **Supersedes:** the ENA-space branch of `components/sena/workspace/fusion-canvas.tsx`
- **Related:** [ADR 0002 — local jENA/jSNA runtime](0002-local-jena-jsna-runtime.md), `SENA'S ENA UI Design.md`

## Context

SENA had two renderers drawing the same quantities from the same runtime:

- `/workspace/ena` — `components/ena/EnaPlot.tsx`, whose grammar is transcribed from
  jena-js and rENA's `ena.plot.network` and pinned by `lib/ena/__tests__/plot-parity.test.ts`.
- `/workspace/sena` → ENA Space — the ENA-space branch of the Fusion Canvas,
  which applied SENA's A1 fusion grammar to jENA coordinates.

`lib/sena/ena-network.ts` had already fixed the worst of it: the ENA-space branch
drew jENA's mean line weights rather than SENA's `W` matrix. Everything downstream
of the numbers had still diverged, and three of those divergences changed what the
figure claimed rather than only how it looked:

1. **Node size encoded a different matrix.** `/workspace/ena` sized nodes by ENA
   connectivity (rENA's `nodes$weight`); ENA Space sized them by SENA's
   `weightedDegree`. The same code read as important in one view and ordinary in
   the other, and both views presented themselves as ENA.
2. **Edge width carried a 5.6x multiplier.** `fusionEnaNodeRatio = 28 / 5` existed
   so hairlines would clear r28 discs — a node-size decision leaking into an edge
   encoding. A connection of |w| = 0.3 rendered at 8.4px in ENA Space and inside
   [1, 8]px on the ENA route.
3. **The projections disagreed.** `lib/sena/layout.ts` used one isotropic scale;
   jena-js gives each axis its own symmetric range. With SVD1 explaining far more
   variance than SVD2, the same code landed at different relative positions, so
   comparing the two views screenshot-to-screenshot was invalid.

## Decision

**Where a node's position is a measured coordinate, the visual grammar is
ENA-canonical; everything SENA adds is a marked, subordinate overlay.**

Concretely:

1. ENA Space renders through `<EnaPlot>` — the component `/workspace/ena` uses —
   fed by `lib/sena/ena-plot-model.ts`, which turns a jENA manifest into the same
   `ENAPlotModel` that `lib/ena/results.ts` builds. One renderer, not two.
2. This applies to the ENA-space **layout** wherever it is selected, not only to
   the ENA Space **view**. The Fusion view routes `layout === "ena-space"` to the
   same surface. `fusion-canvas.tsx` keeps one grammar, for the explanatory and
   joint layouts, whose positions are explanatory choices.
3. **Projection is anisotropic**, per jena-js: each axis gets its own symmetric
   padded range (`enaAxisRange`) and fills its own pixel span. `lib/sena/layout.ts`
   no longer does scale arithmetic; it calls `projectPoint` from
   `lib/ena/plot-encoding.ts`.
4. **Edge width is plot-relative**, rescaled min-max into `RENA_EDGE_WIDTH_RANGE`
   ([1, 8]px), with opacity and saturation scaling alongside it. The absolute
   weight stays in `data-edge-weight` and the tooltip.
5. **Units render as 4px ENA unit points.** Person identity is an overlay ring on
   the selected or hovered unit, not a permanent 37px hexagon.
6. Every SENA addition carries `data-sena-layer` and never displaces a glyph
   jena-js would have drawn. Overlay strokes are capped at the **median** drawn
   network width and at 0.5 opacity. Social ties default to **off** in ENA space:
   a person-person tie between two projected unit points traces a line through the
   space that carries no meaning.
7. **Node labels are collision-aware** (`nodeLabelPlacements` in
   `lib/ena/plot-encoding.ts`). This is the one deliberate deviation from
   jena-js's and rENA's label grammar, and it lives in the shared module so both
   routes inherit it. See "Consequences for node labels" below.

### Consequences for cross-plot comparison

Plot-relative edge width means **two ENA plots are not width-comparable** — a weak
network and a strong one both stretch to fill [1, 8]px. This reverses what
`ena-network-parity.test.ts` previously pinned ("stroke width absolute and monotone
in |weight|"), which is now stated as monotonicity only. Anyone producing a figure
pair for publication must read `data-edge-weight`, not stroke width. A "comparable
scale" toggle was considered and deferred.

#### Exception: degenerate weight spans use the absolute law

A plot-relative scale needs two different weights to be relative *to*. When every
drawn edge carries the same weight — one edge, or several that tie exactly — the
min-max map has no ordering to encode and sends all of them to the **top** of the
range. A lone connection of |w| = 0.001 would render as thick as one of |w| = 5:
an eightfold overstatement, in the direction of claiming more than the data
supports.

That case is reachable from the shipped UI. `temporal-window-builder.tsx` allows
turn radius from **0** and moving-window size from **1**, and on the bundled
lesson-study sample a turn radius of 0 makes **10 of 10** turn windows degenerate,
several drawing a single edge. Stepping turn by turn through a lesson is exactly
what turn windows are for. At default settings (size 3, radius 1) none of the 22
windows is degenerate — the smallest weight span is 1.92e-1, nine orders of
magnitude above the threshold — so this is a corner of the rule, not its normal
operation.

So when `max|w| - min|w| <= 1e-12`, edge width falls back to jena-js's absolute
law, `max(1, |w| * 4)`, clamped into [1, 8]px, with opacity and saturation derived
from the resulting width. This is the grammar the plot-relative rule deviates
from, it encodes magnitude honestly, and cross-plot comparability is not weakened:
a degenerate plot was never comparable to anything. Pinned by
"degenerate edge weights fall back to jena-js's absolute law" in
`lib/ena/__tests__/plot-parity.test.ts`, whose last case asserts the guard does
**not** leak into plots that do have a spread.

### Consequences for node colour

rENA fills nodes neutrally (`nodes$color = "black"`; SENA maps that to the theme
foreground). Per-code categorical colour is therefore **not** used in ENA space —
hue is reserved for trace/condition identity, which is what a subtracted or grouped
network needs. Code identity is carried by the label beside the node.

### Consequences for node labels

jena-js and rENA both label every network node unconditionally at a fixed offset.
That is correct on a full-timeline plot and wrong on a scoped one. SENA's temporal
windows re-run ENA over a handful of segments, and a window that lacks the data to
separate two codes projects them to the **same pixel**. In the bundled pilot:

| Window | Degeneracy |
| --- | --- |
| full timeline | none — closest pair 53px apart |
| `stage:0:1-3` (Plan) | `Hypothesis` ≡ `Evidence` at 0.00px; `Reflection` ≡ `Coordination` at 0.00px |
| `stage:1:2-6` (Teach) | SVD2 explains ~nothing — all seven codes on one horizontal line, two exact pairs |
| `stage:2:3-10` (Reflect) | `Evidence` ≡ `Reflection` at 0.00px, with `Question` (r=5) fully inside `Evidence` (r=15) |

Unconditional labelling overprints these into unreadable text ("Evidenthesis").
The deviation is **presentation only** — no glyph moves, and `plot-parity.test.ts`
still pins every position against jena-js to machine precision — and it has two
stages:

- **Merge.** When one node's disc lies entirely inside another's
  (`dist + r_small <= r_large`), the reader sees **one mark**, so it gets **one
  label** listing every code there: `Evidence · Question · Reflection`. Containment
  is the criterion because it is exactly when the second glyph is invisible.
  Fanning two labels off a single mark was rejected: it asserts a separation
  nothing on screen can confirm, and at distance 0 the fan direction has no basis
  in the data. The merged label states the degeneracy instead of hiding it — *this
  window cannot tell these codes apart* is a finding, not a rendering artifact.
- **Quadrant flip.** Marks that stay visually distinct keep their own labels —
  merging those would be a lie. Overlapping label boxes move to a free diagonal
  around their own node, each candidate being jena-js's offset mirrored, so a
  moved label keeps the canonical distance and only the corner changes. Where the
  projection has collapsed to a line, candidates ladder outward into the vacated
  dimension. No label is ever dropped: worst case the least-overlapping position
  wins, so the layout degrades gradually rather than losing a code name.

Leader lines were rejected: they are new strokes in the ENA base layer this ADR
reserves for the network, and near-parallel leaders read as weak edges.

Two costs are accepted. A merged label makes two codes **look like one entity** to
a reader who does not know the convention — mitigated by each node keeping its own
`<title>` tooltip and `data-label-codes` carrying the member ids. And label widths
are **estimated**, not measured (`NODE_LABEL_GLYPH_ASPECT`), since the parity
suites render to static markup with no layout engine; the estimate is deliberately
generous, so the failure mode is moving a label that would just have fit.

## Alternatives considered

- **Re-ink the ENA-space branch in place** (keep two renderers, make the second
  call `styleRenaNetwork`). Nearly the same visual outcome, but divergence stays a
  thing to maintain rather than a thing that is true by construction.
- **Palette-only reconciliation.** Produces a screenshot that looks reconciled
  while the node-size and edge-width claims stay wrong — worse than an honest
  mismatch.
- **Isotropic projection for both renderers.** Keeps on-screen distance metrically
  meaningful, but diverges from every published ENA figure, and reversing it later
  would invalidate figures already exported.

## What this does not change

Fusion, Joint, and Temporal views keep the A1 grammar exactly as
`lib/sena/visual-grammar.ts` records it: hex person nodes, the solid purple `W`
mesh, cyan bridge ribbons, outer-orbit social arcs, glow. Position there is an
explanatory layout choice, which is precisely when rich encoding is legitimate.
The workspace shell, rail, plot switcher, Data View drawer, and Stats provenance
summary are unchanged.

## Enforcement

`lib/sena/__tests__/ena-space-plot-parity.test.tsx`. Its load-bearing assertion:
removing every `[data-sena-layer]` subtree from ENA Space's markup yields a tree
byte-identical to what `<EnaPlot>` renders for the same model — including when a
node is selected. A change to either renderer alone fails there.

Supporting: `ena-network-parity.test.ts` (per-axis projection, unit definition,
monotone width), `plot-parity.test.ts` (grammar against jena-js), and
`workspace-module-boundaries.test.ts` (module shape).

`plot-parity.test.ts` also pins the label deviation, and its load-bearing case is
the negative one: on a plot whose codes are separated, `nodeLabelPlacements`
reproduces jena-js's offset exactly — nothing merged, nothing displaced. The
deviation is not merely small on a healthy plot, it is absent.
