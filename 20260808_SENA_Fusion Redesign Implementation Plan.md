# SENA Fusion Redesign — Implementation Plan

- **Date:** 2026-08-08
- **Status:** Draft — awaiting Peter's review
- **Design source:** "SENA Fusion — Redesign Proposal" artifact (canonical ENA plane + social orbit; port-docked, paper-cased directed arrows), 2026-08-08
- **Decision lineage:** extends ADR-0008 (`docs/adr/0008-ena-space-canonical-plot-grammar.md`); narrows `SENA'S ENA UI Design.md` §5 ("Fusion keeps A1 grammar") to the orbit only
- **Repo:** `sena-hk-template` (paths below relative to it unless noted)

---

## 0. Summary

The redesign applies ADR-0008's rule *inside* the Fusion view: the ENA layer renders as the
canonical `<EnaPlot>` plane (measured jENA coordinates, rENA ink), and the SNA layer moves to an
explanatory **social orbit** ring around it (nested directed lanes, port docking, cased arrowheads,
community tints, always-on names). Six phases, each independently shippable and gate-green:

| Phase | Deliverable | Size | Blocks on |
|---|---|---|---|
| P0 | ADR-0009 + visual-grammar registration + fingerprint re-pins | S | ADR acceptance |
| P1 | Canonical ENA plane embedded in Fusion (`FusionPlaneOrbitPlot`, plane only) | M | P0 |
| P2 | Social orbit layer (`lib/sena/orbit-layout.ts` + orbit component) | L | P0; Q1, Q4 defaults |
| P3 | Mode wiring, default flip, maximized-overlay routing fix, controls | M | P1+P2; D5 |
| P4 | Comparison mode (means + 95% t-CI + subtraction; means rotation; projectIn) | L | P1; Q2, Q3; D6 |
| P5 | Layer stroke palette re-step (central `layer-palette.ts`) | S | Q4 |
| P6 | Ledger evidence, browser-smoke extension, perf check, kill-proof rows | M | each phase |

Verification ground truth for every integration point below came from a four-agent code audit on
2026-08-08 (EnaPlot embedding API, fusion wiring, gate inventory, orbit data). Where a claim has a
file:line, it was read, not remembered.

---

## 1. Scope and non-goals

**In scope:** the Fusion view's default rendering; the maximized overlay; plot-tools/layout
controls; the S/W/B/G stroke palette; a comparison (subtraction) capability; tests/gates/ledger
evidence for all of it.

**Non-goals (explicitly deferred):**
- Square plane geometry. `EnaPlot` hardcodes 720×520/margin 44 (`jenaPlotGeometry`,
  `lib/ena/plot-encoding.ts:16–18`; destructured at `EnaPlot.tsx:47`). v1 embeds the canvas as-is
  (letterboxed by `preserveAspectRatio="xMidYMid meet"`). A `geometry` prop is a clean follow-up but
  churns `lib/ena/__tests__/plot-parity.test.ts` (530 lines of pinned geometry) for cosmetic gain.
- Exported publication figures of the fused view. The export pipeline is a server-side synthetic
  summary (`buildSenaPublicationSvg/Png`, `lib/sena/publication-export.ts:208/:234`) that never
  serializes plot DOM — the redesign cannot break it, but the fused view also won't appear in
  exports until that path is extended (and EnaPlot's CSS-variable colors are inlined). Track as a
  follow-up ticket, not a phase.
- Localization. Workspace strings are hardcoded English by convention (LanguageProvider covers
  marketing only); new labels follow suit.
- Temporal/Dual-Lens/Matrix views. Untouched except where shared code moves.

---

## 2. Decision gate

Work can start on defaults; each decision only blocks the phase named.

| # | Decision | Recommended default | Blocks |
|---|---|---|---|
| Q1 | Arrowheads on S ties | Keep, confined to orbit band (paper-cased, ports) | P2 |
| Q2 | Code node color on the plane | Neutral (hue reserved for condition identity, per ADR-0008) | P1 (already EnaPlot default) |
| Q3 | Comparison default palette | webENA blue/orange preset (`#218EBF`/`#EF691B`); red/blue one-click | P4 |
| Q4 | Palette re-step scope | Strokes only (chips/marketing keep bright set) | P2, P5 |
| D5 | Flip Fusion default layout to the new mode | Yes — `"plane-orbit"` default; joint/explanatory demoted to "Diagnostic" | P3 |
| D6 | Where comparison mode surfaces first | `/workspace/ena` first (live ENASet, groups exist), then ENA Space panel; fusion-plane "compare windows" last | P4 |
| D7 | Disposition of the A1 grammar entry | Keep `fusion-canvas-a1` entry and id (a hard gate depends on it — §4 ring 1); its mockup asset flips `adopted-reference → alternative-reference`; A1 remains the grammar for the diagnostic layouts | P0 |

**Peter-reserved checkpoints:** ADR-0009 acceptance (P0), Q1–Q4/D5–D7, each PR merge, ledger claim
wording, and any perf-budget escalation (§8).

---

## 3. Architecture

### 3.1 New layout mode, new surface

- `SenaLayoutMode` (`lib/sena/types.ts:7`) gains `"plane-orbit"` →
  `"plane-orbit" | "explanatory" | "ena-space" | "joint"`.
- New component **`components/sena/workspace/fusion-plane-orbit.tsx`** (`FusionPlaneOrbitPlot`) —
  a single `<svg>` (own coordinate space ~1240×840) composed of:
  1. **Nested canonical plane:** `<svg x y width height>` wrapper hosting
     `<EnaPlot className="" zoom={fusionPlotZoom} …/>`. EnaPlot is embedding-friendly by
     construction — one root `<svg>`, zoom-derived viewBox, **no defs/ids/filters/clipPaths**
     (verified; the fusion canvas's gradient ids cannot collide). Two obligations:
     - pass `className=""` to drop its Tailwind sizing default;
     - **forward the outer zoom into EnaPlot's `zoom` prop** — its legend and low-rank badge
       counter-scale against its own viewBox (`EnaPlot.tsx:240–244, 296–304`); zooming only the
       outer viewBox would shrink/drift that chrome.
  2. **Orbit layer:** `<g data-sena-layer="orbit">` — persons, lanes, arrows (§3.3).
  3. **Cross-layer links:** `<g data-sena-layer="unit-link">` — dashed leader from a selected
     person's hexagon to their unit point. The unit point's outer-svg position is computable:
     `projectPoint(model, unit)` (`lib/ena/plot-encoding.ts:99–105`) into plane pixels, then the
     known nested-svg placement transform. One small helper, unit-tested.
- The mode does **not** go through `computeFusionLayout` — the plane owns measured coordinates and
  the orbit owns its ring math. `fusion-layout.ts` is untouched except tests (§7).
- Data inputs are exactly what the panel already receives: `model`, `enaManifest`
  (composition via `buildSenaEnaPlotComposition(manifest, model.people, model.codes, {title})`,
  `lib/sena/ena-plot-model.ts:116–121`), `layers`, `threshold`, `selectedId`, `revealedLabelIds`,
  `onCanvasSelect`, `fusionPlotZoom`.

### 3.2 The plane (P1)

- **Reuse, don't fork.** `SenaEnaSpacePlot` is a `<div>` wrapper — not reusable inside an SVG — so
  the plane composes `EnaPlot` directly, but its **overlay assembly** (per-layer weight
  re-normalization, data-coordinate endpoints, median-width/0.5-opacity caps,
  `ena-space-plot.tsx:77–129`) moves to a shared helper `lib/sena/ena-overlay.ts` consumed by both
  ENA Space and the fusion plane. Overlay endpoints stay **data coordinates**; EnaPlot owns the only
  projection (comment at `EnaPlot.tsx:102–104`).
- **B bridges** render through that overlay channel (`kind: "bridge"`), focus-on-selection: the
  selected person's bridges by default, all bridges when the B layer toggle is explicitly on.
  **S ties never draw inside the plane** (ADR-0008: social ties default off in projected space —
  in this design they have a better home on the orbit).
- **Model-definition + GoF footer** inside the SVG (export-safe), as
  `<g data-sena-layer="model-footer">`: units/conversation/window/rotation line + co-registration
  r/ρ. Gap to close: `enaCorrelations` needs a live `ENASet`; the manifest doesn't persist it.
  Extend `lib/sena/ena-manifest.ts` to compute and store
  `outputs.goodnessOfFit: { pearson: number[]; spearman: number[] }` at manifest build time
  (engine helper exists: jena-js `enaCorrelations`).
- **Parity contract extends to the plane:** strip every `<g data-sena-layer>` subtree from the
  nested-svg slice → byte-identical to a plain `<EnaPlot model variance>` render. Same recipe as
  `lib/sena/__tests__/ena-space-plot-parity.test.tsx:35–67` (`stripSenaLayers`); new suite
  `fusion-plane-parity.test.tsx`.

### 3.3 The orbit (P2)

- **Pure math module `lib/sena/orbit-layout.ts`** (no React), unit-testable:
  - *Ring order:* community id asc, then strength desc, stable by `dataset.people` order. Sources:
    `model.socialReport.actors` (`SenaSocialActorReport`, `types.ts:1874–1887`) and
    `model.socialReport.communities[].memberIds` (`types.ts:1889–1897`) for stable tint assignment.
  - *Placement:* even angular spacing on an ellipse around the plane, first person at −90°.
  - *Lane assignment:* per directed tie, short-sweep direction; reciprocal pairs (which arrive as
    **two edges**, `social:A:B` / `social:B:A`, `model.ts:1059–1079`) get paired lanes — heavier
    tie inner. Deterministic given the edge list.
  - *Port docking:* depart offset `(6 + off·0.30)/r̄`, arrival pullback `(tgtR·0.55 + off·0.75)/r̄`
    along the sweep; offset envelope rises to the lane, plateaus, and docks at ≥0.14·off — lanes
    never converge at nodes (the collision Peter flagged on 2026-08-08).
  - *Arrow geometry:* tip aimed at the node perimeter, sized off stroke width.
- **Component `components/sena/workspace/fusion-orbit-layer.tsx`:**
  - Hexagon persons — extract the thrice-duplicated `hexPoints` (fusion-canvas.tsx:32,
    temporal-fusion-arc.tsx:39, EnaPlot.tsx:159) into a shared `lib/sena/hex.ts`. Size = √-scaled
    strength, 18–40 px. Community ring tint (new small palette; single-community datasets get none).
    Keep `data-visual-role="sna-person-hex-node"` — the production contract and browser smoke pin
    that string (§4 ring 3/4).
  - Paint order: **all lane paths, then all arrowheads** (paper-cased) — the casing + z-order rule
    that makes arrows legible at any crossing.
  - Always-on name labels with a port-aware side heuristic (choose the side without docks; the
    mockup's per-node placements are the reference).
  - Every lane carries the full provenance set `data-edge-weight/-normalized-weight/-scaled-weight/
    -visual-salience/-visual-width` (README §Demo-Flow-8; smoke `:66–92`).
  - Hover/selection payloads come free: `buildSenaJsnaSocialTieHandoffRows`
    (`lib/sena/jsna-handoff.ts:36–79`) already returns per-tie weight cross-checks, both actors'
    metric summaries, and 5-snippet evidence previews — the Inspector renders this shape today.
- **Width scale becomes absolute (filter-stable).** Under the default `normalization: "max"`
  (`model.ts:59`), `edge.normalizedWeight` is *already* corpus-max-anchored
  (`operatorDiagnostics.normalization.S.divisor` = matrix max), so:
  `width = min + clamp(normalizedWeight)^0.72 · (max − min)` with a new narrower social range
  (~2.5–8.5 px, replacing 5.2–15.6). Implement `buildAbsoluteEdgeStrokeScale` in
  `lib/sena/visual-encoding.ts` (call sites: fusion-canvas.tsx:170,
  use-sena-fusion-workspace-main-shell-props.ts:521) and **consolidate the private duplicate in
  inspector-panel.tsx:15–66** so the Inspector's width provenance matches the drawing. Non-"max"
  normalization modes fall back to `matrices.S.raw` max.
- **Standalone SNA sociogram for free:** the "SNA" view panel
  (`workspace-central-plot-deck-sna-metrics-panel.tsx`) receives the full deck render props at its
  call site — its `Pick<…, "model">` is type-only (`workspace-central-plot-deck-view-panel-branches.tsx:38–39`).
  Widening the Pick to add `selectedId | onCanvasSelect` and mounting the orbit (plane hidden)
  above the existing metric cells is a small, separate commit inside P2.

### 3.4 Wiring and demotion (P3)

Integration checklist (verified against current source):
1. `lib/sena/types.ts:7` — extend the union.
2. `components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx:59–84` — routing
   ternary gains the `"plane-orbit"` → `<FusionPlaneOrbitPlot/>` branch.
3. **`components/sena/workspace/fusion-plot-overlay.tsx:203–216` — fix the confirmed bug**: the
   maximized overlay passes `layout` straight to `Canvas` with no routing branch, so maximizing in
   ENA Space today renders the deprecated fusion-canvas fallback. The fix is the same routing
   switch as (2), covering both `"ena-space"` and `"plane-orbit"`. Also make the hardcoded
   "A1 Inner Solid Mesh" title chip (`:158–163`) layout-conditional.
4. `components/sena/workspace/workspace-static-config.tsx:47–51` — add the `layoutOptions` entry
   (`{ value: "plane-orbit", label: "Fusion plane + orbit", note: "Canonical ENA plane with social
   orbit" }`); reword explanatory/joint notes to "Diagnostic — …". The Joint provenance strip
   (`JointEmbeddingProvenanceStrip`) stays exactly as is for the joint mode.
5. `components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts:187` — default
   `useState<SenaLayoutMode>("joint")` → `"plane-orbit"` (D5).
6. Selection/zoom/layer state reuses the existing hooks unchanged
   (`useFusionCanvasSelectionState`, `useFusionPlotInteractions`); orbit clicks call the same
   `onSelect(id)`.
7. `FusionLayerKey` (chip row) unchanged in shape; counts already derive from
   `edge.layer` + threshold.

### 3.5 Comparison mode (P4)

All engine inputs exist; three additions, in dependency order:
1. **Inverse-t quantile** in `lib/ena/statistics.ts` — nothing in the repo or jena-js provides one
   (only the forward tail `studentTTwoSidedP(t, df)` at `:314`). Bisection over the forward CDF is
   sufficient; golden-test against known t-table values. Then per group per dimension:
   `mean ± t₀.₉₇₅(n−1) · sd/√n` using `mean`/`standardDeviation` (`:383/:389`).
2. **Group means + CI through the additive channel.** `ENAPlotModel` traces cannot carry interval
   geometry (`ENAPlotTraceType` has no interval type), so: extend `SenaEnaPlotComposition` with
   `groups: Array<{name; color; mean:{x,y}; ci:{x:[lo,hi]; y:[lo,hi]}; unitIds}>` (data coords) and
   render in EnaPlot as `<g data-sena-layer="group-mean">` (square marker,
   `pointTraceRadius("group")` = 6 exists) + `<g data-sena-layer="group-ci">` (dashed rect) —
   parity-safe by construction. On `/workspace/ena` (live `ENASet`), groups can alternatively flow
   through jena-js `addGroup` as today (`lib/ena/results.ts:124–156`).
3. **Subtraction network.** Difference of per-group mean line weights (manifest
   `outputs.lineWeights` rows grouped by unit) → one signed network; extend the network ink to a
   signed two-color mode (pos/neg — rENA's own `colors=c(pos,neg)` param), default blue/orange per
   Q3, multiplier exposed as "Δ ×" control. Default-off so `plot-parity.test.ts` sees identical
   output for existing models.
4. **Means rotation + shared spaces.** `lib/sena/ena-manifest.ts` hardcodes SVD/EndPoint; add an
   options surface for rotation `"mean"` (two-group ⇒ MR1 axis naming from jena-js
   `rotationColumns`) and `projectIn` for cross-window shared rotation — the fix the rank audit
   already anticipates for non-comparable low-rank windows.

Surface order (D6): `/workspace/ena` → ENA Space panel → fusion-plane "compare windows".

### 3.6 Palette (P5)

New module `lib/sena/layer-palette.ts` exporting `{ stroke, chip }` per layer; strokes:
S `#2451CC`, W `#A06BF5`, B `#0891B2`, G `#DB2777` (validated 2026-08-08: all six dataviz palette
checks pass on white; shipped S/W pair fails deutan at ΔE 1.5). Consumers to migrate off literals:
`fusion-canvas.tsx:76–80` + gradient defs `:187–230` (A1 stays for diagnostic layouts),
`ena-space-plot.tsx` overlay colors, `temporal-fusion-arc.tsx:179–190` gradients,
`timeline-trace.tsx`, the new orbit component (already on the new set). Chips/inspector/marketing
keep the bright set (Q4). No gate pins color literals (verified — contract/smoke pin roles and
attributes, not fills), so this phase is mechanically safe; the one watch-item is
`human-concept-publication-figures.test.ts:574/:600` which pins figure *layer names*, not colors.

---

## 4. Gate impact map (what breaks, what to update — from the 2026-08-08 gate audit)

**Ring 1 — visual grammar + fingerprints.** `lib/sena/visual-grammar.ts` gains a
`fusion-plane-orbit` entry + new reference assets (mockup PNGs exported to
`output/sena-fusion-redesign-options/`, pinned by bytes+sha256); A1's asset role flips per D7 but
the **entry id `fusion-canvas-a1` must remain** — `review-packet.ts:379–380` hard-requires it (and
`temporal-fusion-arc`) for the `visual-grammar-handoff` gate. Update in lockstep:
`sena.test.ts:668, 1028–1116, 2064, 3689–3747, 3889–3893` (exact ordered id lists, encoding
substrings, sha literals, disk-recompute), `pilot-smoke.test.ts:150–218`,
`verify-sena-browser-smoke.mjs:1604–1719` (duplicated bytes/sha literals), and the
`referenceAssets=5` / `adoptedReferences=` pipe-list evidence strings. **P0 lands all of this
before any rendering change so later phases don't fight fingerprints.**

**Ring 2 — parity.** New `fusion-plane-parity.test.tsx` (strip-and-compare, §3.2);
`ena-space-plot-parity.test.tsx` untouched; `ena-network-parity.test.ts` source-greps
`lib/sena/layout.ts` for forbidden isotropic scaling — the plane reuses
`buildSenaEnaSpaceCoordinateMap`/`projectPoint`, adding no new coordinate arithmetic, so it stays
green. **Do not fork the renderer** — `plot-parity.test.ts` pins it wholesale.

**Ring 3 — production page contract.** Add visualChecks for the plane + orbit (ids +
requiredText: `orbit-social-lane`, `orbit-social-arrowhead`, nested `ena-plot` presence,
`data-sena-layer="orbit"`), update the **exact ordered list** at `sena.test.ts:2064`, the
`toContain` pins `:2309–2436`, and `verify-sena-pilot.mjs:21–51` coverage ids;
`browser-smoke-manifest.test.ts:31–44` source-greps must stay satisfied.

**Ring 4 — browser smoke.** Extend `verify-sena-browser-smoke.mjs`: waits for the new roles;
provenance-attribute checks over orbit lanes (same pattern as `:66–92`); keep
`sena-fusion-canvas` and `temporal-fusion-arc` testids untouched (Functional Ledger pins both);
the new surface gets `data-testid="sena-fusion-plane-orbit"`.

**Ring 5 — module boundaries + misc.** Register the new modules in
`workspace-module-boundaries.test.ts:521` (boundary id list) and keep visual-grammar exports in
`use-method-artifact-export-actions.ts` (`:1441–1460`); update
`workspace-fusion-layout.test.ts:58–72` (currently pins default `"joint"` + provenance strip);
extend `fusion-canvas-selection-toggle` expectations only if orbit label reveal diverges from the
click-to-reveal contract (it shouldn't — labels are always-on, selection ring is separate).

---

## 5. Phase plans with acceptance criteria

### P0 — Decision records & grammar registration (S)
Write ADR-0009 (rule: *inside Fusion, the plane is ENA-canonical via the shared renderer; the
orbit is explanatory and carries SENA grammar; joint/explanatory are diagnostic layouts*). Export
mockup assets, pin, update every Ring-1 gate.
**Accept:** `npm test`, `npm run lint`, `npm run build`, `npm run sena:pilot:verify` all green with
the new grammar entry present and zero rendering changes.

### P1 — Plane (M)
`EnaPlot` gains optional `x/y/width/height` passthrough (omitted ⇒ byte-identical output —
parity-checked); `lib/sena/ena-overlay.ts` extraction; `FusionPlaneOrbitPlot` rendering plane +
bridges + footer; manifest `goodnessOfFit` extension; `fusion-plane-parity.test.tsx`.
**Accept:** parity suite green (default + selected states); ENA Space behavior unchanged
(existing parity suite green); bridges capped at median width/0.5 opacity; footer text present in
static markup.

### P2 — Orbit (L)
`lib/sena/orbit-layout.ts` + `lib/sena/hex.ts` + `fusion-orbit-layer.tsx` +
`buildAbsoluteEdgeStrokeScale` + inspector-duplicate consolidation + SNA-view mount.
**Accept:** unit tests prove the geometry invariants — for every reciprocal pair, minimum
lane-to-lane distance in the plateau ≥ 8 px and dock-port separation ≥ 12 px; arrowheads render
after all lines; envelope end ≥ 0.14·off; deterministic output for a fixed model; widths stable
under threshold changes (assert equal widths before/after filtering a disjoint edge). An 8-person /
20-tie fixture renders without label overlap (label side heuristic test). Provenance attributes
present on every lane.

### P3 — Wiring (M)
Union + routing branches (panel **and** maximized overlay — fixing the ena-space overlay bug),
`layoutOptions`, default flip, conditional overlay title chip, layout tests update.
**Accept:** switching all four modes round-trips in the panel and the maximized overlay
(the overlay bug test: maximize in `"ena-space"` must render `ena-plot`, not the Canvas fallback —
this is a new regression test); default-mode test updated; FA-16-01 semantics (layout buttons
switch coordinate frame) hold for the new mode.

### P4 — Comparison (L)
Inverse-t + goldens; composition `groups` + CI overlay rendering; signed subtraction network
(default-off); manifest rotation/projectIn options; `/workspace/ena` comparison UI first.
**Accept:** t-quantile goldens (e.g. t₀.₉₇₅ for df 1/5/10/30/∞); CI rectangle coordinates verified
against hand-computed values for a fixture; subtraction output for two known groups matches
hand-computed Δ mean line weights; existing plot-parity suite untouched and green (signed mode off
by default); MR1 axis title appears under means rotation.

### P5 — Palette (S)
`layer-palette.ts`; migrate stroke consumers; chips untouched.
**Accept:** grep gate — no stroke hex literals left in the migrated files; all suites green;
one screenshot pass in light theme confirming contrast.

### P6 — Evidence & ledger (M)
Browser-smoke extension (Ring 4), production-contract entries (Ring 3), fresh T3 evidence for
FA-14/FA-16/FA-19 + new FA rows for the plane/orbit; Test Suite Ledger rows for the new geometry
module (kill-proof: mutate the port-docking constants → the invariant tests must fail);
`npm run sena:performance:check` on a fresh build.
**Accept:** `sena:pilot:verify` green end-to-end; ledger rows PASS with T3 evidence; perf gate
within budget (§8).

---

## 6. PR slicing & sequencing

Branch `feat/fusion-plane-orbit` off `main`; one PR per phase (P0…P6), each independently
gate-green and revertible. P1 and P2 can develop in parallel after P0 (they meet in P3). P4 is
independent of P2/P3 and can start after P1. P5 anytime after Q4. Merges are Peter's.

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fingerprint/exact-list test churn spread across phases | High if unmanaged | P0 lands **all** Ring-1 pins first; later phases touch only their own new tests |
| EnaPlot chrome mis-scales when embedded | Medium | Forward outer zoom into `zoom` prop (§3.1); regression test on legend transform at zoom 2× |
| Orbit legibility beyond the 4-person pilot | Medium | 8-person fixture in P2 acceptance; lane cap + "aggregate parallel ties" toggle as documented fallback; orbit label heuristic tested |
| Perf budget: total-static-js-br **852,000 B, ~5% headroom** | Medium | No new deps (jena-js/sna.js already eager — "never bump/unpin" guardrail); new modules are pure TS/SVG; measure per-PR; if breached → BLOCKED-PETER (re-opens T7 skeleton/worker decision) |
| `use-sena-fusion-workspace-main-shell-props.ts` is "T7-adjacent" | Low | P3 touches one `useState` default; no structural changes |
| Means-rotation/projectIn math errors | Medium | P4 goldens hand-computed; TL-C1/TL-D3 ledger rows extended; claims wording reserved for Peter |
| Single-community pilot makes tints invisible | Certain, benign | Tint no-op for one community; 2-community fixture in tests |
| Maximized-overlay divergence recurs | Low after fix | The P3 regression test pins routing for **all** non-Canvas modes |
| CSS-variable colors leak into any future DOM-serialized export | Known limitation | Documented non-goal; theme-inline pass specified for the follow-up export ticket |

---

## 8. Standing constraints honored

- `data-testid="sena-fusion-canvas"` and `"temporal-fusion-arc"` preserved (Functional Ledger
  FA-19 pins both).
- Provenance attributes (`data-edge-*`) on every drawn tie (README Demo Flow §8; smoke `:66–92`).
- Threshold semantics per ADR-0005 — controls change the render, never the math (FA-16-03).
- Joint-mode embedding provenance strip untouched (`report.ts:110` guardrail).
- No changes to jena-js / sna.js versions; no plot-switcher DOM/label changes (Perf Report
  guardrails `:28–29`).
- ADR-0008 byte-parity discipline extends to the fusion plane rather than being relaxed anywhere.

---

*Prepared by Claude (Fable 5) from the 2026-08-08 design proposal and two code-audit workflows
(six analysts on 2026-08-08 for design research; four verifiers same day for integration ground
truth). All file:line references current as of commit `cb75e20`.*
