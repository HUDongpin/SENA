# ADR 0009 — Fusion renders a canonical ENA plane with an explanatory social orbit

- **Status:** Accepted under delegated implementation authority (2026-08-08); Peter ratification pending at PR merge
- **Date:** 2026-08-08
- **Extends:** [ADR 0008 — ENA Space uses the canonical ENA plot grammar](0008-ena-space-canonical-plot-grammar.md)
- **Narrows:** `SENA'S ENA UI Design.md` §5 ("Fusion keeps A1 grammar") — A1 now governs the orbit and the diagnostic layouts only
- **Related:** "SENA Fusion — Redesign Proposal" artifact (2026-08-08); "SENA Fusion Redesign — Implementation Plan" (2026-08-08); [ADR 0005 — directed bridge contract](0005-directed-bridge-contract.md)

## Context

ADR-0008 settled the rule for measured coordinates: where a node's position comes
from the jENA runtime, the grammar is rENA/jena-js verbatim through the one shared
renderer, and everything SENA adds is a marked, subordinate overlay. It applied
that rule to ENA Space and to the `ena-space` layout, and left the Fusion view's
default (`joint`) and `explanatory` layouts on the A1 grammar, because their
positions are layout choices, not measurements.

That left the Fusion view — SENA's flagship figure — in the one place the rule
did not reach. Its ENA content renders as an explanatory mesh whose distances an
ENA-literate reader will try to read as measurements and cannot, while its SNA
content competes for the same plane, the same visual channel, and the same
z-order. Peter's 2026-08-08 review asked for a redesign: the ENA part must follow
jENA/rENA standards; the SNA part must be clearer and more beautiful.

## Decision

**Inside Fusion, the plane is ENA-canonical via the shared renderer; the orbit is
explanatory and carries SENA grammar; joint and explanatory become labeled
diagnostic layouts.**

Concretely:

1. A new layout mode `"plane-orbit"` becomes the Fusion default. It renders:
   - a **nested canonical plane** — `<EnaPlot>` itself, fed by
     `lib/sena/ena-plot-model.ts`, embedded as a nested `<svg>`; measured jENA
     coordinates, rENA ink, byte-parity discipline extended by a strip-and-compare
     suite (`fusion-plane-parity.test.tsx`);
   - a **social orbit** — persons as hexagons on an ellipse around the plane,
     directed ties as nested lanes with port docking and paper-cased arrowheads,
     community ring tints, always-on names. Pure ring math in
     `lib/sena/orbit-layout.ts`; no force simulation, no measured-coordinate claim.
2. **S ties never draw inside the plane.** ADR-0008 defaulted them off in
   projected space because a line between two projected unit points traces no
   meaningful path; this design gives them a home where direction, reciprocity,
   and weight are legible instead — the orbit band.
3. **B bridges** cross the boundary through the overlay channel (data-coordinate
   endpoints, median-width/0.5-opacity caps), focus-on-selection.
4. The plane and orbit never pass through `computeFusionLayout`. The plane owns
   measured coordinates; the orbit owns its ring math. A1's joint/explanatory
   layouts remain available, relabeled **"Diagnostic"**, with their embedding
   provenance strip untouched.

## Decision gate resolutions

Recorded here so implementation does not re-litigate them. Q/D numbering follows
the implementation plan §2. Resolved on recommended defaults under the delegated
authority of the 2026-08-08 implementation directive; Peter may override any of
them at PR review, and each names the phase it steers.

- **Q1 — Arrowheads on S ties: keep, confined to the orbit band** (paper-cased,
  port-docked). Direction is the point of a directed social layer; the casing +
  z-order rule keeps crossings legible. (P2)
- **Q2 — Code node color on the plane: neutral.** Hue stays reserved for
  trace/condition identity per ADR-0008; this is already the shared renderer's
  default. (P1)
- **Q3 — Comparison default palette: webENA blue/orange** (`#218EBF`/`#EF691B`),
  with a one-click red/blue preset for readers trained on rENA figures. (P4)
- **Q4 — Palette re-step scope: strokes only.** Chips, inspector swatches, and
  marketing keep the bright set; only drawn-line strokes move to the
  contrast-validated set. (P2, P5)
- **D5 — Default flip: yes.** `"plane-orbit"` becomes the Fusion default;
  joint/explanatory are demoted to "Diagnostic" wording. (P3)
- **D6 — Comparison surfaces on `/workspace/ena` first** (live ENASet, groups
  exist), then the ENA Space panel, fusion-plane "compare windows" last. (P4)
- **D7 — `fusion-canvas-a1` keeps its id and entry.** The review-packet
  `visual-grammar-handoff` gate hard-requires the id; A1 remains the recorded
  grammar for the diagnostic layouts. Its mockup asset flips
  `adopted-reference → alternative-reference`; the new plane-orbit mockup becomes
  the adopted reference for the Fusion default. (P0)

## Alternatives considered

- **Restyle the A1 mesh toward rENA ink in place** (keep explanatory positions,
  adopt canonical styling). Rejected: it produces a figure that *looks* like an
  ENA plot while its distances remain layout choices — the precise confusion
  ADR-0008 exists to prevent, now dressed more convincingly.
- **Two side-by-side panels (ENA plot | sociogram).** Honest but abandons the
  fusion claim; cross-layer structure (who contributes to which codes) becomes
  invisible. The orbit + bridge-overlay design keeps one figure.
- **Force-directed sociogram around the plane.** Nondeterministic layouts break
  screenshot-stable evidence, and proximity in a force layout invites exactly the
  distance-reading the plane forbids. The ring is deterministic and visibly
  non-metric.

## What this does not change

`/workspace/ena`, ENA Space, Temporal, Dual-Lens, and Matrix views; the export
pipeline (synthetic server-side summary — the fused view joins it in a follow-up
ticket); `computeFusionLayout` and the diagnostic layouts' math; jena-js/sna.js
versions and pins; the `sena-fusion-canvas` and `temporal-fusion-arc` testids
(Functional Ledger FA-19 pins both); threshold semantics per ADR-0005.

## Enforcement

- `lib/sena/__tests__/fusion-plane-parity.test.tsx` (new, P1): stripping every
  `data-sena-layer` subtree from the nested-plane slice yields byte-identical
  markup to a plain `<EnaPlot model variance>` render — the ADR-0008 recipe
  applied to Fusion.
- `lib/sena/orbit-layout` unit suite (P2): port-dock separation, lane plateau
  distance, envelope floor, determinism, filter-stable absolute widths.
- `lib/sena/visual-grammar.ts` gains the `fusion-plane-orbit` entry whose
  guardrail states the split: plane distances are measurements; orbit placement
  is explanatory; read `data-edge-weight` for cross-plot comparison.
- Ring 1–5 gate updates land with their phases per the implementation plan §4.
