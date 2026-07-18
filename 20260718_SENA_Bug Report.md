# SENA Bug Report — 2026-07-18

**Scope:** Systematic bug detection across the runnable SENA application in `sena-hk-template`
(analytical runtime, statistics, data import/adapters, temporal runtime, and the fusion workspace UI).
**Reviewer:** Claude (Opus 4.8), driven by Peter (Dongpin HU).
**Branch:** `feat/workspace-top-plots-bar` @ `fa7b954`.

---

## 1. Method

Two passes were run:

1. **Automated gates** (from `sena-hk-template/`):
   - `tsc --noEmit` (strict) → **clean, exit 0**
   - `eslint .` → **clean, exit 0**
   - `node scripts/run-vitest-with-enterprise-temp-db.mjs` (full suite) → **96 files / 1010 tests passed, 1 skipped**
   - Source scan for `TODO/FIXME/HACK/XXX/BUG`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` → **none in product source**

2. **Manual review** of the highest-risk correctness surfaces:
   - Core math: `lib/sena/model.ts`, `operators.ts`, `fusion-math.ts`
   - Statistics: `lib/sena/inference.ts`, `lib/sena/reliability.ts`
   - Consistency & temporal: `lib/sena/runtime-consistency.ts`, `lib/sena/temporal-runtime.ts`
   - Data ingestion: `lib/sena/import.ts` (CSV parser), `import-adapters.ts`, `layout.ts`, `data-contract-audit.ts`
   - UI rendering & state: `components/sena/workspace/{fusion-canvas, fusion-layout, visual-encoding, temporal-fusion-arc}.tsx` and the temporal-animation / plot-interaction hooks
   - API surface: `app/api/sena/analyze/route.ts`

### Headline

The codebase is **mature and well-defended**: the numerical core guards divide-by-zero, empty
arrays, `NaN`, isolated vertices, and asymmetric/directed input consistently, and every
mathematical block is fingerprinted and audited against the fusion equation. No crashes,
type errors, or failing tests were found. The findings below are **latent logic/consistency
issues in the data-ingestion and temporal-scoping paths** — they do not throw, but they can
silently skew analysis outputs for certain uploaded datasets.

Severity legend: **Medium** = can silently produce wrong analysis numbers on realistic input;
**Low** = narrow trigger, cosmetic, or accuracy/robustness polish.

---

## Resolution status — all five fixed (2026-07-18)

All five findings were fixed in the same session and verified. Summary:

| # | Fix | Files changed |
|---|-----|---------------|
| F1 | Stage thirds now divide by the parsed-turn count (`parsedTurnCount`), computed via a hoisted `speakerLinePattern`, so noisy transcripts still reach *Teach*/*Reflect*. | `lib/sena/import-adapters.ts` |
| F2 | Forum reply targets are resolved through a `personIdentityIndex` (canonical id + display name → id, ids winning collisions), so reply ties survive identifier-scheme mismatches. | `lib/sena/import-adapters.ts` |
| F3 | `scopeSenaDatasetToWindow` scopes **stage**-mode windows by stage membership (matching `buildTemporalWindows`); turn/moving-window modes keep the turn-range filter. | `lib/sena/model.ts` |
| F4 | `krippendorffAlphaNominal` now uses the coincidence-matrix / `n(n−1)` correction; returns `0` for no-pairable-data and `1` for single-category (no spurious perfect score). | `lib/sena/reliability.ts` |
| F5 | `parseSenaCsv` pads short rows with `""` and trims trailing empty cells before deciding a row is misaligned; genuinely over-long rows still throw. | `lib/sena/import.ts` |

**Verification:** `tsc` introduced **no new errors** (the pre-existing 58 test-file `ProcessEnv`/`NODE_ENV` type errors are untouched and out of scope); `eslint` clean on all changed files; full `npm test` green with **6 new regression tests** added — F1 (noise-line transcript reaches *Reflect*), F2 (reply-by-name resolves + social edge survives), F3 (turn-indexed interaction scoped by stage), F4 (canonical α = 0.5333 hand-computed case + perfect-agreement = 1), F5 (short-row padding / trailing-comma tolerance + still-rejects over-long).

---

## Round 2 — Exhaustive sweep + fuzzing (2026-07-18, later)

A second, deeper pass swept the modules not fully covered in round 1 (import
normalization, snapshot restore, report validation stats, jSNA/jENA handoffs,
manifest builders, Excel parser, access-control, api-helpers, demo-verification,
pilot-readiness, publication export) and then **exercised the engine with
generated inputs** rather than only reading it.

### New finding

**F6 — coded-segments-only import loses all people *(Medium; fixed)***
`lib/sena/import.ts`, `addDerivedContractRows`. The placeholder-derivation safety
net derived people from `utterances` and `interactions` but **not** from
`coded_segments`. A `coded_segments`-only upload (or any segment naming a person
absent from the other tables) therefore produced **zero people**: `buildSenaModel`
then dropped every segment as "unknown person" and the social/bridge matrices
collapsed to empty. Fix: derive placeholder people from each segment's
`personId` and `targetPersonIds` (ids win collisions), mirroring the existing
interaction/utterance derivation. Regression test added (coded-segments-only JSON
contract → `P1/P2/P3` recovered, no "unknown person" warning, `B`/`B_CP`
dimensions correct).

While there I also corrected **4 latent type errors** in the round-1 F3 test
(inline dataset annotated `: SenaDataset` but missing required `SenaPerson`/
`SenaCode` fields — invisible to vitest, flagged by `tsc`).

### Fuzzing / property testing (no further defects found)

To search exhaustively rather than by eye, the engine was driven with a seeded
generator and invariants were asserted:

- **14 degenerate probes** (empty dataset, 1 person, 0 codes, 1 code,
  self-interaction, zero weights, directed bridge, every normalization + temporal
  mode) — no throw, no NaN, fusion-math audit `verified`, `B_CP = Bᵀ` fallback holds.
- **800 random datasets** × all normalizations / temporal modes / directed &
  undirected / count & confidence bridge rules → fusion & G & S finite, fusion
  audit verified, reciprocity & density ∈ [0,1], closeness/betweenness ≥ 0, all
  person metrics and edge weights finite.
- **800 statistical cases** — group comparison (p ∈ [0,1], finite Cohen's d /
  Hedges' g, non-inverted bootstrap & permutation CIs), Holm monotonicity, and
  reliability incl. the round-1 F4 Krippendorff α + Cohen's κ all ∈ [−1,1].
- **400 snapshot round-trips** — `build → buildSenaProjectSnapshot →
  JSON.stringify → importSenaProjectSnapshot` restores without validator error;
  markdown report renders.

All ~2,000 generated cases held every invariant. The computational and statistical
core is robust; F6 was the one reachable defect this pass.

### Reviewed, not a bug

- `buildNormalizationSensitivity` sets `baselineVariantId` to
  `normalization-<current>`, which dangles when the active normalization is the
  non-default `none`/`log-max` (those aren't in the admissible variant list). But
  `baselineVariantId` is **produced and never consumed** anywhere in the app or
  tests, so it is cosmetic — left as-is to avoid touching `report.ts` for no
  functional gain.
- Self-interactions (`source === target`) add to the fusion diagonal rather than
  being dropped; all invariants still held, and rejecting them is a debatable
  policy choice, so left as-is.

**Verification:** `tsc` no new errors (and 4 pre-existing ones from round 1
removed); `eslint` clean on touched files; full `npm test` green — **1017 passed**
/ 1 skipped (round-1 1016 + the F6 regression test).

---

## 2. Findings *(as originally detected)*

| # | Severity | Area | File | One-line |
|---|----------|------|------|----------|
| F1 | Medium | Transcript import | `lib/sena/import-adapters.ts` | Stage thirds use total line count but turns count only parsed lines → stages skew |
| F2 | Medium | Forum/LMS import | `lib/sena/import-adapters.ts` | Reply edges silently dropped when reply-to identifier scheme ≠ author-id scheme |
| F3 | Low | Temporal scoping | `lib/sena/model.ts` | Stage windows and window-scoping use two different "which interactions" rules |
| F4 | Low | Reliability stats | `lib/sena/reliability.ts` | `krippendorffAlphaNominal` uses a population-proportion approximation, not canonical α |
| F5 | Low | CSV import | `lib/sena/import.ts` | One ragged row aborts the entire multi-file import instead of warn-and-continue |

---

### F1 — Transcript stage heuristic divides by the wrong denominator *(Medium)*

**File:** `lib/sena/import-adapters.ts`, `cleanTranscriptText` (~lines 144–225).

The Plan/Teach/Reflect stage for each utterance is chosen by:

```ts
const turnIndex = utterances.length + 1;                 // counts only PARSED lines
const stage = turnIndex <= Math.ceil(lines.length / 3)   // denominator = ALL non-empty lines
  ? "Plan"
  : turnIndex <= Math.ceil((lines.length * 2) / 3)
    ? "Teach"
    : "Reflect";
```

`turnIndex` is incremented only for lines that match the `Speaker: text` pattern, but the
thresholds are computed from `lines.length`, which is **every** non-empty line, including
lines that are skipped (section headers, lone timestamps, stage dividers, narration, etc.).

**Failure scenario:** a transcript with 30 non-empty lines where only 12 match `Speaker: text`.
`turnIndex` maxes at 12, but the thresholds are `ceil(30/3)=10` and `ceil(60/3)=20`. Turns 1–10
→ *Plan*, 11–12 → *Teach*, and **no utterance ever reaches *Reflect***. The auto-derived
stages — which drive the default `stage`-mode temporal windows and the Temporal Fusion Arc
phase columns — are silently distorted for any noisy transcript.

**Fix:** compute the thirds against the number of parsed utterances (either pre-count the
matching lines, or assign stages in a second pass over `utterances.length`).

---

### F2 — Forum/LMS reply edges dropped on identifier-scheme mismatch *(Medium)*

**File:** `lib/sena/import-adapters.ts`, `normalizeForumRows` (~305–337) and `adaptForumRows` (~408–420).

The author **node id** is resolved with one alias priority:

```ts
const authorId = firstString(author, ["id","author_id","user_id","person_id","email",
  "author_email","name","display_name","user_name","username"]) || `author-${index+1}`;
```

but the **reply target** is taken from a different set, unmodified:

```ts
const replyTo = firstString(row, ["reply_to_person_id","reply_to_author_id","reply_to_author",
  "parent_author_id","parent_user_id","reply_to_user_id","target"]);
// ...
const target = scalar(post.reply_to_person_id)
  || authorByPost.get(scalar(post.parent_post_id)) || "";
```

If an export identifies authors by **name** (because no id column exists, so `authorId` falls
through to `name`) while replies reference a numeric **author id** (`reply_to_author_id`) — or
the reverse — the derived `target` never equals any node's `person_id`. Downstream,
`buildSocialMatrix` (`model.ts`) emits `Interaction …->… references an unknown person` and
**drops the tie**, so the social layer `S` under-counts reply relationships with no visible
error other than a warning buried in the cleaning manifest.

Note the `parent_post_id → authorByPost` fallback is correct (it maps through the normalized
`authorId`); only the **direct `reply_to_*` identity path** is affected.

**Fix:** resolve reply-to identities through the same author-identity normalization used for
`authorId` (e.g., build a name↔id index and canonicalize `replyTo` before emitting the
interaction), or emit a targeted warning when a reply identity fails to resolve.

---

### F3 — Stage windows vs. window-scoping use two different interaction rules *(Low)*

**File:** `lib/sena/model.ts` — `buildTemporalWindows` stage branch (~1284–1305),
`interactionInTurnWindow` (~1157–1167), `scopeSenaDatasetToWindow` (~1350–1374).

When building a **stage** window, interactions are selected by stage membership and the
window's turn span is derived only from that stage's *utterance/segment* turns:

```ts
const interactions = dataset.interactions.filter((i) => i.stage === stage);
const stageTurns = [...utterances.map(u => u.turnIndex), ...segments.map(s => s.turnIndex)];
const startTurn = Math.min(...stageTurns, index + 1);
const endTurn   = Math.max(...stageTurns, startTurn);
```

But `scopeSenaDatasetToWindow` (used by `temporal-runtime.ts` to rebuild a per-window model)
filters interactions via `interactionInTurnWindow`, which — whenever an interaction has a
finite `turnIndex` — uses the **turn range** rather than the stage:

```ts
if (typeof interaction.turnIndex === "number" && Number.isFinite(interaction.turnIndex)) {
  return interaction.turnIndex >= startTurn && interaction.turnIndex <= endTurn;
}
return fallbackStages.has(interaction.stage);
```

**Consequences for datasets where interactions carry `turnIndex`:**
- A stage that contains *only* interactions (no utterances/segments) collapses to
  `[index+1, index+1]`, so nearly all of its turn-indexed interactions are dropped when the
  window is re-scoped.
- The window object's own `interactionCount` / `rawSocialConnectivity` (stage-filtered) can
  disagree with the temporal-runtime-trace scoped model's `socialEdges` / `matrixTotals.S`
  (turn-filtered) for the *same* window.

Built-in sample data has no `turnIndex` on interactions, and the transcript/forum adapters keep
interaction turns aligned to their stage's utterance turns, so this rarely manifests today —
hence Low. But the two definitions of "which interactions belong to this stage window" should
be unified so hand-authored JSON-contract uploads stay self-consistent.

**Fix:** in stage mode, scope interactions by the same stage-membership rule used to build the
window (prefer the window's stage set over the turn range), or record the stage set on the
window and branch on it in `interactionInTurnWindow`.

---

### F4 — `krippendorffAlphaNominal` is an approximation of the named metric *(Low)*

**File:** `lib/sena/reliability.ts`, `krippendorffAlphaNominal` (~137–162).

Expected disagreement is computed from population category proportions:

```ts
const expected = 1 - Σ (count/total)²;   // uses p_c²
return 1 - observed / expected;
```

Canonical Krippendorff nominal α uses the sampling-without-replacement correction
`D_e = 1 − Σ n_c(n_c−1) / (n(n−1))`. The `Σ p_c²` form biases the reported α (upward for small
samples) relative to the metric it is named after. Because this value feeds the 0.6 / 0.8
reliability gate thresholds in `buildSenaReliabilityDashboard`, a borderline dataset could be
scored slightly differently than a reference Krippendorff implementation (e.g., R `irr::kripp.alpha`).

**Fix:** use the coincidence-matrix / `n(n−1)` correction for `D_e`, or rename the field to make
the approximation explicit (e.g., `chanceCorrectedAgreementNominal`). Pairwise Cohen's κ in the
same file is implemented correctly.

---

### F5 — CSV import aborts the whole batch on a single ragged row *(Low, robustness)*

**File:** `lib/sena/import.ts`, `parseSenaCsv` (~224–227).

```ts
if (cells.length !== columns.length) {
  throw new Error(`CSV row ${rowIndex + 2} has ${cells.length} cells but the header has ${columns.length}.`);
}
```

A single row with a trailing/missing cell (common in spreadsheet exports) throws and fails the
**entire** multi-file import. This is stricter than the rest of the ingestion pipeline, which
prefers warn-and-continue with a cleaning manifest. Consider padding short rows with empty
strings (and warning) or skipping malformed rows so one stray comma doesn't sink a five-CSV upload.

---

## 3. Observations (reviewed, **not** classified as bugs)

- **Forum thread = one stanza/window.** `adaptForumRows` sets `unit_id` and `stanza_id` both to
  `thread_id`, so every post in a thread co-occurs in a single ENA/W window. This is a defensible
  modeling choice but means concept co-occurrence for long threads is maximally connected; worth a
  documented note for forum imports.
- **32-bit FNV-1a content/config hashes** (`data-contract-audit.ts`, `fusion-math.ts`) have a small
  collision space, but they are explicitly framed as reproducibility handoff checksums, not
  statistical or cryptographic evidence — acceptable as-is.
- **Numerical core is robust.** `operators.ts` (normalization, fusion adjacency, Jacobi
  eigendecomposition, MDS/Laplacian/commute-time embeddings) and `model.ts` guard every empty-array
  spread, zero divisor, isolated vertex, and directed/asymmetric case that was checked. `inference.ts`
  (permutation p-value with `+1` smoothing, Holm step-down, Hedges' g correction, bootstrap CI) is
  standard and correct. The fusion-layout and canvas renderers coerce non-finite coordinates to safe
  fallbacks throughout.

---

## 4. Recommended next actions — all completed ✅ (2026-07-18)

1. ~~Fix **F1** and **F2** first~~ — **done.** Transcript stage thirds now divide by parsed-turn
   count; forum reply targets resolve through a name/id identity index.
2. ~~Unify the stage-window interaction rule (**F3**)~~ — **done.** `scopeSenaDatasetToWindow`
   scopes stage-mode windows by stage membership; turn/moving modes keep the turn-range filter.
3. ~~Correct or rename `krippendorffAlphaNominal` (**F4**)~~ — **done.** Replaced with the canonical
   coincidence-matrix / `n(n−1)` estimator.
4. ~~Soften CSV strictness (**F5**)~~ — **done.** `parseSenaCsv` pads short rows and trims trailing
   empty cells; genuinely over-long rows still throw.
5. ~~Add regression tests~~ — **done.** All three requested tests exist, plus extras:
   - *Noisy transcript → non-empty Reflect*: `enterprise.test.ts` "splits transcript stages by
     parsed turns even when noise lines are skipped" (asserts `Plan,Plan,Teach,Teach,Reflect,Reflect`).
   - *Forum identifier-scheme mismatch → reply tie survives*: two tests in `enterprise.test.ts` —
     "resolves forum reply targets that reference the author display name" (name-keyed authors) and
     "resolves forum reply ties across an author-id vs display-name scheme mismatch" (explicit
     `author_id` nodes, name-referenced replies resolving `Ada → u1`).
   - *Stage dataset with `turnIndex`-bearing interactions → `interactionCount` == scoped social-edge
     basis*: `sena.test.ts` "scopes stage-window interactions by stage even when their turnIndex is
     outside the utterance span" (asserts `scopedModel.summary.socialEdges === reflect.interactionCount`).

   Plus the F4 canonical-α case, F5 short-row/trailing-comma cases, and the F6 coded-segments-only case.

**Final verification:** `tsc` no new errors; `eslint` clean; full `npm test` **1018 passed** / 1 skipped.

*All line numbers are approximate and reference the state of the branch at the time of review.*
