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

**Environment caveats** (this tree): run gates unsandboxed (iCloud-dataless node_modules);
`pgrep -f vitest` must be empty before any vitest run (concurrent agent shares the tree);
Bash cwd resets on unsandboxed calls — use absolute paths. Never bump/unpin `jena-js` /
`sna.js`; no plot-switcher DOM/label changes; dependency changes and accuracy trade-offs go
to the Peter-decisions list.

**Measurement commands.**

- Compute hot paths: `npx vite-node scripts/bench-sena-hot-paths.ts` (2 warmup + 7 measured
  runs, medians; lesson-study sample at 1x plus deterministic 25x synthetic scale-up).
- Bundle budgets: `npm run sena:performance:check` — **only valid against a fresh
  `npm run build`** (see P1).
- Route/chunk sizes: walk `.next/static/chunks` + `.next/build-manifest.json`
  (`rootMainFiles` + polyfills = shared first-load; `static/chunks/app/<route>/page-*.js` =
  per-route chunk). Next 16 no longer prints per-route First Load JS in build output.

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

(Negative results — rejected hypotheses — get logged here too, so later iterations don't
retry them.)

---

## Ranked target backlog

1. **T1 — Split export libs out of vendor chunk 2482.** If docx/pdf-lib/exceljs are
   reachable from the same import graph as jena-js/sna.js, dynamic-import the export entry
   points so analysis views don't download export code. Metric: chunk composition + bytes
   downloaded on /workspace/ena open (network trace), total-static-js-br.
2. **T2 — exceljs chunk (6edf0643, 910 KiB raw).** Verify it loads only on actual Excel
   export; if it leaks into any eager path, fence it. Replacing exceljs outright is a
   dependency change → Peter decision.
3. **T3 — Budget-check validity guard (P1). DONE 2026-08-02 (iteration 1).** Zero-byte
   actuals now fail; staleness binding stays behind the existing strict-evidence flags.
4. **T4 — buildSenaModel scaling (P2).** Extend bench with a 100x/250x point; profile which
   section grows fastest. Optimize only if superlinear or absolute cost becomes user-visible.
5. **T5 — Shared first-load 526 KiB raw.** Audit rootMainFiles for heavyweight imports
   pulled into the app shell (layout-level imports). Metric: rootMainFiles bytes.
6. **T6 — Workspace interaction latency.** Playwright: workspace load-to-interactive and
   plot-switch latency. Establish only after T1/T2 settle bundle composition.

## Peter decisions

- None pending. (Reserved for: dependency replacements — e.g. exceljs alternatives; budget
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
