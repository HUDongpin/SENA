# SENA Bug Report — 2026-08-01 (multi-agent detect / fix / verify campaign)

**Scope:** Full bug-detection, fixing, and verification campaign over the runnable SENA
application in `sena-hk-template`, concentrated on the uncommitted 2026-08-01 correctness
closeout (ADR-0007 pipe-only delimiter, G1/G2 fixes, low-rank disclosure) plus every fix the
campaign itself produced. Four detect→fix→verify cycles, each ending in a fresh-eyes
verification sweep; the loop ran until a sweep returned **zero P0/P1/P2**.
**Method:** Claude Fable 5 as decision manager and quality evaluator; Claude Opus 5 agents as
detection/verification sweeps and three implementation engineers (A: warning channels,
B: import semantics, C: plot/variance disclosure). Every fix required regression tests proven
to fail against the pre-fix code; every cycle ended with the full gates run unsandboxed.
**Branch:** `main` @ `c2d71c0`, working tree carrying the (uncommitted) closeout changes.
**Previous reports:** `20260718_SENA_Bug Report.md` (F1–F6, fixed), `20260731_SENA_Bug Report.md` (G1–G2, fixed).

---

## 0. Gate status — final, all green

| Gate | Start of campaign | End of campaign |
|---|---|---|
| `tsc --noEmit` | clean | **clean, exit 0** |
| `npm test` (full vitest) | 1154 passed / 1 skipped / 0 failed | **1197 passed / 1 skipped / 0 failed** (+43 regression tests) |
| `next build` | clean | **clean, exit 0** |

Gates were re-run after every cycle. One mid-campaign gate failure was itself a catch: three
test-file type errors that vitest (which never type-checks) and `next build` (which excludes
test files) were both blind to — a live demonstration of the documented gate-coverage gap.
Fixed the same cycle; `tsc` re-verified clean.

## 1. Verification of the 2026-07-31 report's claims

The claimed G1/G2 fixes and the ADR-0007 implementation were independently re-verified
against the tree: G1's `hasDeclaredRoster` narrowing and `resolveDeclaredTarget` are present
and correct; the six regression tests exist; pipe-only splitting matches the ADR
(`"Wong, Ka Yee"` survives; JSON arrays round-trip); the pilot manifest has zero byte/sha256
drift. **G2's warning channel, however, was only wired for the enterprise import path** —
three of five call sites discarded it, which became findings H1/H3 below.

## 2. Findings and resolutions

All labels fresh for this report (internal sweep labels in parentheses; sweep reports and
probes are preserved in the session records). **Every item below marked fixed carries a
regression test that was demonstrated to fail against the pre-fix code.**

### Cycle 1 — detection sweep over the closeout diff

| # | Sev | Finding | Resolution |
|---|---|---|---|
| H1 (#1) | **P0** | Ragged coder CSV silently flips reliability stats (kappa 1→0.4, alpha 1→0.444) while `reliability-adapters.ts:58` and the API route hard-code `warnings: []`, discarding the exact diagnosis `parseSenaCsv` produced | Warnings wired through adapter + route into `dashboard.warnings`/review patch, file-name-prefixed; route-level test posts real multipart ragged CSV |
| H2 (#2) | P2 (downgraded from P1) | Roster-less upload derives people from `target_person_ids` and flips `B_CP` to independent mode with only a benign warning. **Ruling:** derivation is the deliberately-preserved F6 rule and ADR-0006 D1's "never invent a target" guardrail is scoped to the forum adapter (which is properly guarded) — disclosure gap, not a violation | Specific manifest warning names target-only-derived people and the B_CP consequence; no behavior change |
| H3 (#3) | P2 | Browser five-CSV upload discards `parseSenaCsv` warnings | Fixed (superseded by H12 below — warnings now ride on the uploaded tables) |
| H4 (#4) | P2 | ADR-0007 deprecation warning fires on legitimate ids whenever the roster is derived | Judged against the finished dataset (declared or derived); genuine legacy lists (all fragments known ids) still warn |
| H5 (#5) | P2 | Low-rank badge clips out of the SVG viewBox above ~1.05× zoom; in ENA Space it was the only disclosure | Badge re-anchored to the zoom-adjusted viewBox with 1/z counter-scale and canvas clamps; ENA Space gained a text caveat |
| H6 (#6) | P2 | `assessEnaLowRank` received the plotted-and-filtered point count, not the authoritative unit count | Now reads `manifest.datasetCounts.units` |
| H7 (#7) | P2 | Per-id charset warnings scale with roster size (hundreds for a name-keyed LMS export) | Aggregated to one warning per table/field with count + examples; `\|`-bearing ids (actionable) still warn per id |
| H8 (#8) | P2 | Stray empty heading at the end of `AGENTS.md` | **Not fixed here** — likely a live edit of the concurrent Codex session; left to Peter |
| H9 (#9) | P2 | Plot legend anchored in canvas coordinates — off-frame above 1.14× zoom (two clicks of the workspace zoom button) | Same viewBox-anchor treatment as the badge; measured threshold corrected in-source |
| H10 (#10) | gap | Queued reliability uploads are never parsed in-repo (external worker per `server-job-worker-contract.ts`) and the registry asserts `warningCount: 0` for unparsed files | **External-worker contract decision — Peter** (see §4) |

### Cycle 2 — fresh-eyes verification of the cycle-1 fixes (1 P1, 9 P2)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| H11 (F1) | **P1** | The browser-upload ragged-CSV warning was parked in `importError`, which the next mapping interaction unconditionally clears (`applyMappedTables` → `setImportError(null)`) while the padded cells stay in the dataset | Root-cause fix: warnings ride on the uploaded tables (`UploadedSenaTable.warnings`), folded into `dataset.warnings` on every rebuild — they now survive remaps and stop rendering as errors |
| H12 (F2/F3) | P2 | `slice(0,3)` silently dropped warnings 4+; the test stub couldn't catch the ordering regression | Durable channel has its own overflow handling; tests rebuilt on the real hook chain |
| H13 (F4) | P2 | Containment tests asserted the visible box only — clamp removal stayed green at z<1 | Canvas-containment assertions at z ∈ {0.6, 0.8} with vacuity guards (first prove the viewBox outgrew the card) |
| H14 (F5) | P2 | `"question\|evidence,claim"` mixed-separator cells escaped the ADR-0007 warning; `"evidence,claim"` became a fabricated codebook id | Each pipe-fragment judged independently |
| H15 (F6) | P2 | Legacy-cell warnings duplicated across files, labelled "row 1" with no provenance | Import-wide dedup; source table name leads the message |
| H16 (F7) | P2 | Skipped rows still received "read as one value" advice | Only kept rows are noted |
| H17 (F8) | P2 | An unresolvable `"P2,P3"` target appeared in the charset aggregate as "legal and kept verbatim" three lines after the deprecation warning said the opposite | Flagged legacy cells excluded from the aggregate |
| H18 (F9) | P2 | ADR-0007's implementation note understated the implemented rule in both directions | ADR note rewritten to the actual finished-dataset + fragments-precedence rule |
| H19 (F10) | P2 | `/workspace/ena` mixed variance bases: axis titles raw (28.5%), low-rank alert renormalized (34.6%), neither labelled | Low-rank badge and message now name their basis ("of displayed variance") |
| H20 (F11) | P2 | The two routes titled the same axis differently: ENA Space used `displayedVariance` (34.6%) where `/workspace/ena` uses raw `set.variance` (28.5%, the webENA/rENA-parity convention) | Additive `manifest.outputs.rotationVariance` carries the raw basis; `composition.variance` now means the rotation basis; the renormalized basis kept under its own name; parity suite green untouched |
| — | P2 | Exported `parseCoderAnnotationsCsv` still dropped warnings (the H1 defect one external caller away) | Warnings merged additively |

### Cycle 3 — second verification sweep (0 P0/P1, 2 P2 + 1 adjacent)

| # | Sev | Finding | Resolution |
|---|---|---|---|
| H21 (F12) | P2 | After H20, the SENA workspace showed two different SVD shares on one screen with only one labelled (axes rotation basis; stats rail/temporal panel/report renormalized, unlabelled) | "Displayed variance" labels on both panels; report line gains "(displayed variance)" + a basis-explanation line; note added beside the number, mirroring `/workspace/ena`'s placement |
| H22 (F13) | P2 | Identical ragged CSVs audited `"review"` via the browser path but `"pass"` via the enterprise path — only the browser path folded source warnings into `dataset.warnings` | One-line fold in `importSenaEnterpriseFiles` (ordering parity came free); cross-route audit-parity regression test |
| H23 (F14) | P2→worse | `use-enterprise-import-actions.ts` still put warnings on the rose error plate with `slice(0,3)`. Engineer verification showed the sweep's premise was optimistic: the cleaning manifest stores **counts only**, so the warning text was being **lost** on both enterprise paths | Warnings folded into `dataset.warnings` via a race-proof merge; genuine errors keep the error channel |

### Cycle 4 — third sweep (0 P0/P1, 3 P2) and fourth sweep (1 P2), then all-clear

| # | Sev | Finding | Resolution |
|---|---|---|---|
| H24 (G1) | P2 | The dedup union collapsed *meaningful* exact-duplicate warnings (three `Duplicate person id` lines rendered as two while counters said 3) | Multiset merge: preserves multiplicity, idempotent (returns the same object on no-op — no state churn), order-preserving |
| H25 (G2) | P2 | The stats cell's bare "65.4%" under the new "renormalizes to 100%" note read as *coverage* ("65% of the space is displayed") — the opposite of its meaning | Cell names its axis (`SVD1 65.4%`), label "Share of displayed variance", note re-worded |
| H26 (G3) | P2 | The basis copy rendered unconditionally — even under `- Variance: NA` — and claimed the two percentages "differ" (false at full rank and on the fallback) | Both surfaces gated; "can differ" |
| H27 (—) | fix | Three test-file `tsc` errors introduced by cycle-3 tests (invisible to vitest and build) | Fixed; the honest option chosen both times (no `?? []` masking at call sites) |
| H28 (H1) | P2 | The gated note still rendered for a **single-drawn-dimension** manifest (two-code dataset → one rotation column, share 0%) — "the drawn pair" with no pair; the report asserted a renormalization that provably did not happen | Both gates now require `dimensions.length > 1`; render-level tests (pilot → present, skipped → absent, 1-D → absent) replaced the brittle source-string pin |

**Final verification sweep verdict: no P0, no P1; the one P2 (H28) fixed, re-gated, re-tested.
Campaign exit condition met.**

## 3. Behavioural changes worth disclosing (release notes)

1. **Ragged CSVs now disclose everywhere.** Reliability dashboards, browser uploads, and
   enterprise imports all surface `parseSenaCsv` repair warnings durably. Datasets whose
   ragged rows were previously silent will now show cleaning warnings — and, per H22, an
   enterprise import carrying any cleaning note now flips the data-contract readiness item to
   "review" exactly as the browser route always did.
2. **ADR-0007 deprecation window widened (H14) and narrowed (H4) deliberately.**
   Half-migrated `a\|b,c` cells that were silent now warn; ids the import itself accepts no
   longer warn. In-flight migrations may see warnings appear/disappear accordingly.
3. **Warning text shape changed:** legacy-cell warnings now carry source-file provenance
   (`segments-a.csv row 1 …` instead of `coded_segments row 1 …`); charset warnings are
   aggregated with counts and examples.
4. **ENA Space axis titles changed numerically** (renormalized → raw rotation share, e.g.
   34.6% → 28.5% on the pilot): they now match `/workspace/ena` and the rENA parity
   reference. The renormalized basis remains available and is now labelled "displayed
   variance" wherever quoted; exported reports gained `(displayed variance)` and a basis
   line. `manifest.outputs.rotationVariance` is a new additive optional field.

## 4. Items for Peter (not fixed here, decisions or actions required)

1. **`reliability.ts:71` maps an empty value cell to "applied"** (`if (!normalized) return true`).
   Pre-existing and deliberate-looking, but after H1 the warning is the only guard: a user who
   ignores it still gets moved kappa/alpha. Decide whether an empty cell should be a skipped
   annotation instead.
2. **Queued reliability path (H10):** the external worker contract should require ragged-row
   disclosure, and the upload registry should not assert `warningCount: 0` for files nothing
   has parsed.
3. **`AGENTS.md` stray empty heading (H8)** — likely the concurrent Codex session's
   in-progress edit; confirm before committing.
4. Pre-existing, out of campaign scope, found by sweeps: the import route's persist-branch
   dataset divergence; the 202-queue path leaving `dataset` undefined; `pilot-readiness.ts:199`
   double-counting warnings in its evidence string (gates nothing).
5. **Suggested hardening:** a shared `withSourceWarnings(dataset, sourceWarnings)` helper used
   by both import routes, so the H22 parity is enforced by code rather than convention; and
   listing `displayedVarianceCell` in `module-boundaries.ts` if that manifest is meant to be
   complete (the sweep confirmed it is a subset contract today, with 23 modules already
   exporting undeclared values).
6. **One visual check when the app is next up:** whether `SVD1 65.4%` truncates in the narrow
   stats rail at small widths, and a general glance at the new panels/notes — all changes are
   render-tested but none were viewed in a browser.
7. **Committing:** all fixes are uncommitted working-tree changes, alongside the pre-existing
   closeout work and a concurrent agent's edits. Stage selectively.

### §4 resolution addendum (2026-08-02, "solve these issues" directive)

1. **Resolved (decision delegated to Claude 2026-08-02, second pass).** An empty value
   cell is **missing data**: never "applied" (the pre-fix inflation bug) and never
   "not applied" (a fabricated disagreement). The parser distinguishes a *missing value
   column* (presence-style export — every row still reads as applied) from an *empty cell
   in an existing value column* (records no decision), including ragged rows padded by
   `parseSenaCsv`. Skipped cells are excluded from pairable units Krippendorff-style:
   `cohenKappa` pairs only units where both coders recorded a decision, alpha's m>=2
   coincidence filter drops them naturally, agreement rates and coder positive rates
   count recorded cells only, and a recorded decision always beats a skip. Because
   exclusions can shrink the pairable universe far below `binaryUnitCount`, a
   **no-evidence floor** guards the degenerate conventions: a coder pair with fewer
   than 2 pairable units reports kappa 0 (never the denominator-0 "perfect" 1), and
   alpha with fewer than 2 pairable units reports 0 — mirroring the existing alpha
   guard's "no spurious perfect scores" standard. Every exclusion and every floored
   pair is disclosed (per-row warnings plus aggregate counts of cells actually
   excluded after recorded-beats-skip).
   Regression tests pin the three-way distinction: empty=missing (kappa computed over the
   remaining pairable units), explicit 0=recorded disagreement, absent-row=presence
   semantics. Known cosmetic caveat: the skip warning's row index counts rows flattened
   across all uploaded files (same convention as the pre-existing missing-field warning).
2. **Resolved (channel completed 2026-08-02, second pass).** `SenaEnterpriseUpload.warningCount`
   is optional — unset means "no parser has reported", 0 means "parsed, clean" — and the
   queued reliability **and queued import** routes no longer assert `warningCount: 0`
   (the import route had the identical H10 defect). The status-update contract now carries
   the disclosure channel: an additive optional `uploadWarnings` field (counts only)
   through which run-import/run-reliability workers perform the "until-a-parser-reports"
   transition; the worker contract publishes `parseWarningDisclosurePolicy`,
   `uploadWarningCountSemantics`, and `uploadWarningsCallbackField`. Hardened per the
   pre-merge adversarial review: every entry is validated before the job transition (a
   non-array report, an entry outside the job's uploadIds, a duplicate, or more entries
   than queued uploads all 400 — nothing is silently truncated or ignored), applies are
   scoped to the job's own team (a foreign upload id smuggled into a queued uploadIds
   list cannot write another tenant's registry), and an apply failure after the committed
   transition returns a distinct 503 telling the idempotent worker to re-send. Remaining
   documented limit: the Postgres mirror column stays NOT NULL DEFAULT 0 (the primary
   document store preserves unset).
3. **Resolved.** The stray `AGENTS.md` heading ("Imported Claude Cowork project
   instructions") was removed on 2026-08-02 and the root project docs committed.
4. **Resolved (2026-08-02, second pass).** The three pre-existing sweep findings: the
   import route's persist branch now returns the same governance-enriched dataset the
   snapshot was built from; the workspace client detects a queued 202 job receipt and
   leaves the current dataset untouched instead of clobbering it to undefined; and
   `pilot-readiness` no longer double-counts dataset warnings in its evidence string
   (summary.warnings already folds them in).
5. **Open.** `withSourceWarnings()` helper and module-boundaries completeness remain
   suggested hardening.
6. **Done.** Visual check on 2026-08-02 (dev server, Chromium): `/workspace/ena` Variance
   and Fit panels render without truncation at 1280/768/375 widths; plot axis titles use
   the raw rotation basis (`SVD1 · 44.1%` / `SVD2 · 26.4%` on the sample) consistently with
   the stats rail; `/workspace/sena` ENA Space shows the same basis (`SVD1 · 72.3%`) with
   bridges on / social off, and the Stats panel's "SVD1 72.3% — Share of displayed
   variance" cell plus basis note render fully. One cosmetic observation for later: the
   "Active view — ENA Space" caption strip can appear twice stacked (primary deck +
   inspector viewport both captioning the same view).
7. **Done.** The H1–H28 campaign was merged to `main` as `434f279` on 2026-08-02 and the
   §4.1/§4.2 fixes landed in the follow-up closeout branch with the P-series iteration 1
   guard (see `sena-hk-template/20260802_SENA_Perf Report.md`).

## 5. Evidence trail

Session artifacts (scratchpad, not committed): `detection-sweep-2026-08-01.md`,
`verify-sweep-2026-08-01.md`, `verify-sweep2-2026-08-01.md`, `verify-sweep3-2026-08-01.md`,
`verify-sweep4-2026-08-01.md`, probe scripts, and per-cycle gate logs (`tsc*.log`,
`vitest*.log`, `build*.log`). Every engineer report includes the failing-first test output
for its fixes; every "reviewed and found correct" claim in the sweeps names the code it
checked.

*Line numbers reference the working tree of 2026-08-01; they will shift once committed.*
