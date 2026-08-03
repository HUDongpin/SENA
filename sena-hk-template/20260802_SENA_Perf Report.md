# SENA Performance Campaign — Ledger

Started 2026-08-02. This file is the campaign's memory: every loop iteration reads it first
and writes its result here last. Findings are numbered P1, P2, … (P-series), mirroring the
H-series convention of `20260801_SENA_Bug Report.md`.

**Protocol.** One target per iteration: re-measure baseline → one hypothesis → smallest
change → re-measure. Accept only if ≥10% better on the target metric and no tracked metric
regresses >2%; otherwise revert and log the negative result. Gates before recording a win:
`npx tsc --noEmit`, `npm test`, `npm run build`, `npm run sena:performance:check` — all green
or the change is reverted. After a landed bundle win, ratchet the corresponding budget in
`lib/sena/enterprise/performance-budget-artifact.ts`.

**Protocol refinement (2026-08-03, loop-command review).** Acceptance is two-tier. Byte
metrics (deterministic): any measurable improvement above the build-noise floor may land
when behavior-preserving (calibrate the floor once — build the same commit twice
back-to-back, record the delta here); ≥10% stays the prioritization bar, not the landing
bar. Timing metrics: ≥10% median improvement AND non-overlapping baseline/after sample
ranges; a timing regression counts only if >2% worse AND outside the baseline's range AND
≥0.5 ms absolute; near-threshold results repeat the full baseline+after pair. Budget
ratchets applied by the loop are provisional (new-actual + 5–10% headroom, never looser);
final values are Peter's (list as PENDING under Peter decisions). Backlog row states:
open / IN-PROGRESS / DONE / REJECTED (negative result logged) / BLOCKED-PETER. Full
iteration protocol: `.claude/commands/performance-loop.md` (`/performance-loop`).

**Environment caveats** (this tree): run gates unsandboxed (iCloud-dataless node_modules);
`pgrep -f vitest` must be empty before any vitest run (concurrent agent shares the tree);
Bash cwd resets on unsandboxed calls — use absolute paths. Never bump/unpin `jena-js` /
`sna.js`; no plot-switcher DOM/label changes; dependency changes and accuracy trade-offs go
to the Peter-decisions list.

**Measurement commands.**

- Compute hot paths: `npm run sena:bench:hot-paths` (wired iteration 1; 2 warmup + 7 measured
  runs, median/min/max since iteration 4; lesson-study sample at 1x plus deterministic
  synthetic scale-ups at 25x/100x/250x — 1x/25x retained for continuity with iterations
  0–3. All scale points hold people at 5x sample and cycle units at 5 by design, so the
  sweep isolates row growth from actor-count growth).
- Bundle budgets: `npm run sena:performance:check` — **only valid against a fresh
  `npm run build`** (see P1).
- Route/chunk sizes: walk `.next/static/chunks` + `.next/build-manifest.json`
  (`rootMainFiles` + polyfills = shared first-load; `static/chunks/app/<route>/page-*.js` =
  per-route chunk). Next 16 no longer prints per-route First Load JS in build output.
- Build-noise floor (measured 2026-08-03, iteration 2): **0 B** for JS byte metrics —
  same-source back-to-back builds produce identical chunk hashes; workspace-html varies
  ~4 B (embedded build id). Cross-source rebuilds add ~tens of B of module-id churn.
- Bytes-on-open (network trace): production `next start` on a CLI-chosen port, headless
  Playwright, fresh context, wait for `sena-fusion-canvas` mount; count `/_next/static/*.js`
  responses (raw decompressed bytes; `next start` sends no content-length on chunked gzip).
  Trace includes `<Link>` prefetch chunks (e.g. /docs page chunk on /workspace/ena) — note
  them when reading totals.

---

## Baselines — Iteration 0 (2026-08-02)

Machine: Apple M4 Pro, 48 GB RAM, Node v24.15.0. Commit `434f279` on
`fix/bug-campaign-2026-08-01`. Next.js 16.2.10 (webpack). Build: compile 3.2s,
TypeScript 6.5s, 74 static pages.

### Budget artifact (fresh build)

| check                 | actual (brotli B) | budget (B) | headroom |
| --------------------- | ----------------: | ---------: | -------: |
| workspace-html-br     |             1,858 |     80,000 |      98% |
| workspace-route-js-br |             1,430 |    180,000 |      99% |
| total-static-js-br    |           812,524 |    900,000 |      10% |

### Static JS (raw, fresh build)

Total static JS: **3,442.4 KiB** raw. Shared first-load (rootMainFiles + polyfills,
5 files): **526.4 KiB** raw.

| route           | page chunk (KiB raw) |
| --------------- | -------------------: |
| /               |                  4.9 |
| /workspace      |                 11.9 |
| /workspace/ena  |                 53.8 |
| /workspace/sena |                  4.4 |
| /demo           |                  8.9 |

Top chunks (raw): `2482.ee3cd1f9b4bff157.js` 929.6 KiB (contains jena-js + sna.js +
docx/pdf-lib/exceljs signatures — mixed compute/export vendor chunk);
`6edf0643.f31d8b7c019e5e15.js` 910.4 KiB (exceljs signature); `3794` 217.0 KiB (shared);
`4bd1b696` 195.2 KiB (shared); `8691` 157.0 KiB; `framework` 136.5 KiB; `main` 134.5 KiB;
`8419` 110.2 KiB; `polyfills` 110.0 KiB; `3a0f3609` 101.7 KiB. The two ~900 KiB chunks are
async (not in rootMainFiles or page chunks) and together are **53% of all static JS**.

### Compute hot paths (`scripts/bench-sena-hot-paths.ts`, medians, ms)

| stage                       | sample 1x | synthetic 25x | growth |
| --------------------------- | --------: | ------------: | -----: |
| importSenaJsonContract      |     0.157 |         0.728 |   4.6x |
| buildSenaModel              |     1.817 |        13.404 |   7.4x |
| buildSenaEnaManifest        |     0.925 |         1.903 |   2.1x |
| buildSenaEnaNetwork         |     0.023 |         0.013 |      — |
| buildSenaEnaPlotComposition |     0.048 |         0.029 |      — |
| buildSenaFusionMathAudit    |     0.252 |         0.635 |   2.5x |
| **TOTAL (sum of medians)**  | **3.222** |    **16.713** |   5.2x |

Datasets: 1x = 4 people / 8 interactions / 10 utterances / 10 segments / 7 codes;
25x = 20 / 200 / 250 / 250 / 7.

---

## P-series findings log

- **P1 (closed 2026-08-02, iteration 1).** `sena:performance:check` run against the stale
  pre-existing `.next` reported `total-static-js-br` **fail** at 945,737 B and
  `workspace-route-js-br` actual **0 B (trivial pass)**; after a fresh build it reports
  812,524 B (pass) and 1,430 B. The check happily measured stale or dev-polluted build
  output, and a zero-byte route actual passed instead of failing. **Fix landed:**
  `buildSizeCheck` in `lib/sena/enterprise/performance-budget-artifact.ts` now fails any
  size check whose actual is exactly 0 bytes, with `zeroByteActual=true` evidence and a
  rebuild next-action (regression test: "fails a zero-byte actual instead of trivially
  passing a stale build (P1)"). Staleness *binding* (source-hash pinning) already exists
  behind the strict-production-evidence env flags and was left as-is.
- **P2 (open, compute).** `buildSenaModel` is 80% of pipeline time at 25x (13.4 of 16.7 ms)
  and grows 7.4x for 25x rows — fastest-growing stage, though absolute cost is still small.
  Not worth optimizing until absolute cost matters; first profile at 100–250x to see if
  growth is superlinear. → backlog T4.
- **P3 (open, bundle).** Two async vendor chunks total 1,840 KiB raw (53% of static JS):
  one mixes ENA/SNA compute (jena-js, sna.js) with export libraries (docx, pdf-lib,
  exceljs signatures), the other is exceljs-dominated. They are lazy-loaded, so the win is
  narrower than raw size suggests — but chunk 2482 mixing compute with exports means
  opening analysis likely also downloads export code. → backlog T1/T2.

- **P4 (closed 2026-08-03, iteration 2).** Iteration 0's "chunk 2482 mixes compute with
  docx/pdf-lib/exceljs" was a **measurement artifact**: `lib/sena/runtime-constants.ts`
  imported the entire `package.json` (plus both R parity fixtures, ~16 KB pretty-printed)
  into the client workspace chunk, so grepping chunks for export-library *names* matched
  dependency-spec strings like `"docx":"^9.7.1"`. Content markers (`word/document.xml`,
  `endobj`, `xl/workbook.xml`) prove the split was already correct: docx/pdf-lib exist
  only in the server exports route bundle; exceljs lives alone in its own ~910 KiB async
  chunk behind the existing `await import("@/lib/sena/import-adapters")` boundary
  (react-loadable-manifest lists it only under `use-enterprise-import-actions.ts`; network
  trace confirms it is NOT requested on workspace open). **Fix landed:** runtime-constants
  values are now literals; the provenance test re-derives every value from the real
  package.json/fixtures and a source guard rejects non-type JSON imports in that file.
  Lesson: grep chunks for *content* signatures, never package names alone.

- **P5 (open, knowledge — no action).** The existing
  `await import("@/lib/sena/inference")` in `use-enterprise-validation-actions.ts:173`
  defers nothing today: `inference.ts` statically imports `model.ts`, and `model.ts` is
  already in the eager workspace chunk via `analysis-runtime.ts`, so webpack just
  references the shared module. The dynamic boundary only becomes a real deferral if the
  eager graph ever drops model.ts (see T7). Conversely, `analysis-runtime.ts:60-64`
  re-exporting inference as `export type` only is the escape hatch that keeps inference
  itself out of the eager graph — the house pattern for future de-eager work.

- **P6 (closed 2026-08-03, iteration 4 — measurement note, no action).** Cross-day timing
  drift: iteration-4 fresh baselines ran 9–31% faster than iteration-0's stored numbers
  (buildSenaModel 1x 1.817 → 1.247 ms, 25x 13.404 → 11.711 ms) on the same machine, Node,
  and protocol. Confirms ledger timing numbers are date-stamps, not baselines; the
  same-session fresh-baseline rule is mandatory for timing verdicts.
- **P7 (CLOSED 2026-08-03, iteration 5 — fix landed).** Root cause found by cpuprofile at
  250x: `conceptEdgeEvidence` (model.ts) was ~87% of buildSenaModel self-time — for every
  code pair it filtered all segments, then for EACH survivor rescanned all segments to
  rebuild that stanza's code set before `slice(0,6)` → O(pairs · segments²). Fix
  (bit-identical, verified by sha256 of JSON.stringify(model) at 1x/25x/100x/250x —
  hashes unchanged): per-dataset stanza→code-set cache (WeakMap on the coded_segments
  array) + same-order early-exit collection with identical predicates and cap.
  buildSenaModel medians (this-session baseline → after, ranges in parens):
  25x 12.264 (10.98–17.56) → 7.444 (6.90–8.78), −39%;
  100x 87.830 (84.41–90.38) → 15.868 (14.52–26.28), −82%;
  250x 538.822 (516.64–610.47) → 31.545 (30.46–33.43), −94% (17x).
  Growth exponent now ~0.55–0.99 (linear-to-sublinear); 1x unchanged within range.
  B-A-B stationarity: baseline #2 at 250x 509.203 ms (446.5–521.3) ≈ baseline #1.
  Lock: `lib/sena/__tests__/model-scaling.test.ts` growth-ratio tripwire (10x rows must
  stay <30x time; pre-fix code measured 31.6 and fails, fix measures ~4–5, ~7x headroom).
  Original finding (iteration 4): `buildSenaModel` is
  superlinear in rows and approaching quadratic, with people held constant (20) across the
  sweep: 12.232 ms @ 250 rows → 86.116 ms @ 1,000 (rows ×4, time ×7.0, exponent ~1.41) →
  **451.263 ms @ 2,500** (rows ×2.5, time ×5.2, exponent ~1.81; range 439.8–468.5, no
  overlap between points). All other stages ~linear or flat (ena-manifest 1.9 → 5.8 →
  11.5 ms). Impact multiplier from T7 recon: the function runs synchronously on the UI
  thread in render-body `useMemo` TWICE (:347 timelineModel, :356 windowed model, plus
  inside buildSenaTemporalRuntimeTrace), so a realistic 2,500-utterance corpus implies
  roughly a second of main-thread jank per dataset/window change. → T9, ranked #1.

(Negative results — rejected hypotheses — get logged here too, so later iterations don't
retry them. **Iteration 3 negative result:** "defer sna.js via `await import()` at
buildSenaModel call sites" is refuted at design stage — see T7 BLOCKED-PETER below. The
only client caller of `buildSenaModel`/`scopeSenaDatasetToWindow` is
`use-sena-fusion-workspace-main-shell-props.ts` (:347, :354, :356), all render-body
`useMemo` executed on first mount against the bundled lesson-study sample; the fusion
canvas paints a real plot on the first frame with no empty state, and
`timelineModel.temporal.windows` is a synchronous dependency of the same render pass.
Six of analysis-runtime's value re-export groups pull model.ts (model, report,
temporal-runtime, snapshot, runtime-bundle, review-packet); jena-js is entangled one line
downstream (`buildSenaEnaManifest` at :357). Deferring compute without a UX change is not
possible; do not re-try a pure code-splitting approach.)

---

## Ranked target backlog

1. **T6 — Workspace interaction latency.** Playwright: workspace load-to-interactive and
   plot-switch latency. Bytes-on-open harness from iteration 2 is the seed (see Measurement
   commands); extend with timing + N≥15 runs + IQR per the loop's timing rules.
2. **T8 — Prefetch pollution (low).** /workspace/ena open also fetches the /docs page
   chunk (53.6 KiB) and /workspace/sena open fetches the home page chunk via `<Link>`
   prefetch. Likely WAI; assess only if route-open bytes become a tracked budget.

**T7 — BLOCKED-PETER 2026-08-03 (iteration 3): defer sna.js out of the eager workspace
chunk.** Refuted as a pure code-splitting change (see iteration-3 negative result in the
P-series section): `/workspace/sena` deliberately paints a real sample-data plot on the
first frame, and `buildSenaModel` (sole sna.js consumer) runs synchronously on mount, so
sna.js + jena-js legitimately ship in the eager chunk (~924 KiB of the 1,823 KiB open
payload). Deferral requires a UX decision (see Peter decisions). If declined, close as
REJECTED (UX-constrained) — the open payload is then within ~50 KiB of its floor for the
current design.

3. **T10 — Workspace builds the model twice on mount (low, post-P7).** :347 timelineModel
   + :356 windowed model in `use-sena-fusion-workspace-main-shell-props.ts`; post-fix cost
   is 2×~32 ms even at 250x, so only worth an iteration if T6 measurements show it;
   touches the hook → T7-adjacent care.

Closed: **T5 — REJECTED 2026-08-03 (iteration 6): shared first-load is the framework
floor.** Attribution of all five rootMainFiles+polyfills chunks (526.4 KiB raw):
`4bd1b696` 195.2 KiB = react-dom client (hydration/DOM event system markers);
`3794` 217.0 KiB = Next App Router client core (layout router, server actions);
polyfills 110.0 KiB = Next's standard legacy bundle; webpack runtime 3.7 + main-app 0.5.
Zero house code, zero non-framework libraries — nothing deferrable without framework
surgery. The layout's own chunk graph (~88 KiB more, loads everywhere but outside the
rootMainFiles metric) is the app shell itself: providers, NavBar, footer, @vercel/analytics;
largest single chunk 21 KiB — below any sensible fencing threshold (an async boundary for
single-digit-KiB returns fails the no-added-complexity rule). Do not reopen without a
framework-level lever. **T9 — DONE 2026-08-03 (iteration 5).** conceptEdgeEvidence quadratic fixed
bit-identically (P7 closed); 250x median 538.8 → 31.5 ms (17x); growth-ratio tripwire
landed. **T4 — DONE 2026-08-03 (iteration 4).** Bench parameterized to 25x/100x/250x with
max_ms column; growth curve recorded (P7); superlinear confirmed → spawned T9.
**T1 — DONE 2026-08-03 (iteration 2).** Premise was the P4 artifact; export libs
were already split (docx/pdf-lib server-only, exceljs behind the import-adapters dynamic
boundary). Residual cleanup (package.json + fixture inlining) landed: total-static-js-br
813,233 → 811,589 B. **T2 — DONE 2026-08-03 (iteration 2)** by evidence:
react-loadable-manifest lists the exceljs chunk only under `use-enterprise-import-actions`,
and the network trace shows it is not requested on workspace open. **T3 — DONE 2026-08-02
(iteration 1).** Zero-byte actuals now fail; staleness binding stays behind the existing
strict-evidence flags.

## Peter decisions

- **PENDING (2026-08-03, iteration 2): confirm total-static-js-br ratchet 900,000 → 852,000 B.**
  Provisional value applied in `performance-budget-artifact.ts` (actual 811,589 B + 5%
  headroom, never looser than before). Confirm or adjust; env override
  `SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES` remains available.
- **PENDING (2026-08-03, iteration 3): T7 UX decision — may /workspace/sena show a brief
  loading state on open to defer the compute libraries?** Today the workspace paints a
  real lesson-study plot on the first frame; that requires sna.js (+jena-js) in the eager
  chunk (~924 KiB of the 1,823 KiB raw JS downloaded on open; sna.js ships ~450-520 KB of
  ESM source, the dominant share). Options: (a) async model with a visible loading/empty
  state on the default path — saves most of the compute chunk on open, changes first-paint
  behavior and the essential-shell contract; (b) move model building into a web worker
  like /workspace/ena's jena worker — bigger refactor, same first-paint question;
  (c) decline — T7 closes as REJECTED (UX-constrained) and the open payload stays as
  designed. No code was changed pending this decision.
- (Reserved for: dependency replacements — e.g. exceljs alternatives; budget
  ratchet values after first wins; any accuracy/performance trade-off in ENA math.)

---

## Iteration log

- **Iteration 0 (2026-08-02).** Created ledger + `scripts/bench-sena-hot-paths.ts`;
  recorded baselines above. No optimization performed. Fresh build passes all budgets;
  stale-build measurement discrepancy logged as P1. Next iteration: T3 (validity guard).
- **Iteration 1 (2026-08-02, T3).** Zero-byte-actual guard landed in `buildSizeCheck`
  (`performance-budget-artifact.ts`): `actual === 0` now fails with `zeroByteActual=true`
  evidence and a "stale or incomplete .next" next-action; regression test added. This is a
  validity guard, not an optimization, so the ≥10% acceptance criterion does not apply;
  gates green (tsc, targeted vitest, full suite + build at commit time). The bench script
  is now wired as `npm run sena:bench:hot-paths` and the ledger + script are committed.
  Next iteration: T1 (split export libs out of mixed vendor chunk 2482).
- **Iteration 2 (2026-08-03, T1+T2 → P4).** Context: M4 Pro, Node v24.15.0, commit 28b47f2;
  quiesce check showed only foreign next-dev servers (MAIS-MVP, UAIS) — acceptable for
  byte-class metrics. Calibrated build-noise floor: 0 B JS (identical hashes across
  same-source builds). Import-graph recon + content-marker greps + network trace overturned
  T1's premise (P4): export libs already split; exceljs chunk not requested on workspace
  open (traced: /workspace/sena 1,829.5 KiB raw on open incl. 930.1 KiB compute chunk;
  /workspace/ena 825.9 KiB, no compute vendor chunk). Landed the real residual:
  runtime-constants.ts no longer inlines package.json + parity fixtures (values now
  literals, pinned by recompute assertions + a source guard in sena.test.ts).
  total-static-js-br 813,233 → 811,589 B (−1,644 B, −0.20%, floor 0 → minor win, byte
  lane); compute chunk 930.1 → 923.9 KiB; on-open 1,829.5 → 1,823.3 KiB; mixed-chunk grep
  now clean; no guardrail regressed (shared first-load 526.4 KiB unchanged). Provisional
  ratchet 900,000 → 852,000 B (PENDING Peter). Gates green: full suite (1,207 tests),
  tsc, fresh build, perf-check. T1, T2 closed; backlog re-ranked — next: T7 (defer
  sna.js/buildSenaModel out of the eager workspace chunk).
- **Iteration 3 (2026-08-03, T7 → BLOCKED-PETER).** Context: M4 Pro, Node v24.15.0,
  commit 36f7b3d; quiesce showed foreign next-dev (MAIS-MVP) and a read-only Codex
  process outside this tree — acceptable for byte metrics. Fresh baseline matched the
  ledger (total-static-js-br 811,589 B; compute chunk 923.9 KiB; /workspace/sena
  bytes-on-open 1,823.3 KiB, canvas mounted). Full client call-graph recon of model.ts
  (sole sna.js importer) refuted the deferral hypothesis at design stage: every client
  call site is a render-body useMemo on mount painting the first frame; no event-handler
  call sites exist; six analysis-runtime re-export groups pull model.ts; jena-js is
  entangled at :357. Recorded P5 (inference dynamic import defers nothing today) and the
  export-type-only escape-hatch pattern. No code changed; no gates required. T7 marked
  BLOCKED-PETER with a three-option UX question (loading state / worker / decline).
  Next open target: T4 (bench 100x/250x scale points, profile buildSenaModel growth).
- **Iteration 4 (2026-08-03, T4 → DONE, spawned T9).** Context: M4 Pro, Node v24.15.0,
  commit f50f18f; quiesce clean (foreign MAIS-MVP dev server only). Fresh 1x/25x baseline
  ran 9–31% faster than iteration-0 numbers → P6 (cross-day drift note). Smallest change:
  parameterized `buildScaledContractText(sampleText, scale)`, SCALES=[25,100,250], added
  max_ms column; 1x/25x labels retained for continuity. Profile result (P7):
  buildSenaModel 12.232 / 86.116 / 451.263 ms at 250/1,000/2,500 rows — exponent rising
  1.41 → 1.81, approaching quadratic with people constant; all other stages ~linear.
  Profiling iteration: no optimization landed, acceptance rules N/A; the extended bench
  itself is the lock (growth-ratio vitest deliberately NOT added — wall-time asserts flake
  in CI; manual re-measurement via the wired npm script is the tripwire). Gates green:
  full suite (1,207, exit 0 verified), tsc, fresh build, perf-check 5/5. Next: T9.
- **Iteration 5 (2026-08-03, T9 → DONE — first accepted timing win).** Context: M4 Pro,
  Node v24.15.0, commit fa204df; quiesce clean (foreign MAIS-MVP only; new foreign
  untracked Test Suite Ledger noted, untouched). Fresh baseline: buildSenaModel 250x
  538.822 ms (516.6–610.5) — another ~19% cross-day drift vs iteration 4, P6 pattern
  holds. cpuprofile (10 runs @ 250x via NODE_OPTIONS=--cpu-prof + vite-node) attributed
  ~87% of self-time to conceptEdgeEvidence + inner callbacks; fix and numbers in P7
  (closed). Identity: sha256(JSON.stringify(model)) equal before/after at all four
  scales. Acceptance: 25x/100x/250x all ≥39% better with disjoint ranges; 1x within
  baseline range (guardrail clean); B-A-B baseline #2 509.203 ms confirms stationarity.
  Tripwire test verified to FAIL on pre-fix code (ratio 31.6 > 30) and PASS on fix
  (~4–5). Gates: tsc green, full suite 1,208 passed exit 0 (incl. new test), fresh
  build, perf-check 5/5. Spawned T10 (double model build, low). Next: T5.
- **Iteration 6 (2026-08-03, T5 → REJECTED — audit complete, framework floor).** Context:
  M4 Pro, Node v24.15.0, commit 4b9e66f; quiesce clean (foreign UAIS dev server only).
  Fresh build: budgets pass, total-static-js-br 811,644 B, shared first-load 526.4 KiB
  (55 B build noise vs iteration 5 — within expectations for the HTML metric only; JS
  identical). Signature attribution closed T5 without a code change (details in the
  backlog's Closed entry): both large shared chunks are react-dom and Next App Router
  internals; layout graph is the shell itself. No gates needed (ledger-only). Audit
  method that worked: literal-string frequency dump (`grep -oE '"[A-Za-z@/. -]{12,50}"'`)
  beats guessing minified identifiers. Next: T6 (build the interaction-latency harness).
