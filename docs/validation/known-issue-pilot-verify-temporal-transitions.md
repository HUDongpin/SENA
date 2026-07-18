# Known issue: `sena:pilot:verify` browser smoke fails on temporal transitions

**Status:** Open · **Found:** 2026-07-18 · **Severity:** blocks the release gate
· **Owner lane:** SENA-A02 / A06 / A07 / A11

## Symptom

`npm run sena:pilot:verify` builds clean and passes its full check chain
(enterprise readiness, conference-load rehearsal, etc.), then fails in the
production-server browser smoke at
`scripts/verify-sena-browser-smoke.mjs:1514`:

```
Error: Report JSON temporalRuntimeTransitions is missing adjacent-window delta evidence.
```

The assertion requires the exported `sena-analysis-report.json` to have
`figures.temporalRuntimeTransitions` with at least one transition whose
`delta.G` is finite.

## This is NOT caused by the 2026-07-18 Week-0 / C-P0 / Track-A/B work

Proven by reproducing the report library directly:

```
buildSenaReport(buildSenaModel(lessonStudySenaContract))
  → transitions: stage 2 / moving 7 / turn 9, all with finite delta.G
```

This output is **byte-identical on `main` and the integration branch**
(`delta.G = [-10, 25]` in stage mode). None of the F1–F6, docs, tsc-cleanup,
C-P0, or Track-A/B changes touch `report.ts`, `temporal-runtime.ts`, or the
workspace export path. So the failure is pre-existing and independent.

## Diagnosis

The app exports via `use-report-and-evidence-artifact-export-actions.ts` →
`buildSenaReport(model, …)`, which computes `temporalRuntimeTrace` internally
(`report.ts:1599`) and always yields transitions for this sample. Yet the
**running production app** exports a report whose `temporalRuntimeTransitions`
are empty. Since the library is correct in Node, the divergence is in the
running app — most likely one of:

1. **Production-build divergence** (tree-shaking / minification affecting the
   temporal-runtime path in the prod bundle only) — the smoke uses `next start`,
   not the library. Compare a dev-server export vs a `next build && next start`
   export of the same sample.
2. **Workspace model/state**: the model held in the workspace at export time has
   temporal options (or a dataset) that collapse to a single window → no adjacent
   transitions. Inspect `model.options.temporal` in the workspace at export.

## Next steps

1. Run the app (`next build && next start`), load the lesson-study sample, click
   **Export report JSON**, and inspect `figures.temporalRuntimeTransitions`
   directly — confirm empty vs populated.
2. If empty in prod but populated in dev → production-build issue (bundle);
   if empty in both → workspace model/state issue.
3. Add a unit/integration test at the app boundary (not just the library) so this
   is caught by `npm test`, since the library-level test passes today.

Until fixed, `sena:pilot:verify` cannot be used as the pre-deploy gate; the
unit suite (`npm test`), `tsc --noEmit`, and `npm run lint` remain green.
