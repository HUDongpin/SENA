# SENA Senior Architect Advisory — Re-examination (v2.0, 2026-07-09)

Companion files: `SENA_Senior_Architect_Advisory_Report_v2.0.docx` (full 11-section report), `SENA_Issue_Register_2026-07-09.xlsx` (P0/P1/P2 register, prior-advisory trace, golden-test status, 12-week roadmap, definition of done).

Normative basis: `20260705_SENA_clean version.docx` (spec) + `20260705_SENA_Development_Plan.docx` (plan). Audit basis: source inspection of `sena-hk-template` (commit `2ba2c63` + ~400 uncommitted changes of 7–9 Jul), test-suite execution, independent numerical verification, live checks of www.sena.hk on 9 Jul 2026.

## Verdict

The 7–9 July work implemented most of the July 5 plan's mathematical core — `lib/sena/operators.ts` (admissible normalization, fusion assembly with independent B^CP, I₀ registry, zero-inverse/ε operators, directed diagnostics, Schoenberg MDS, eigenmaps, commute-time), golden tests **T1–T15 green**, a 10-section model card with render gate, provenance envelopes, seeded permutation+bootstrap+Holm inference, typed-centrality guardrails, and an attribution wording gate. The worked example reproduces the spec **exactly** (degrees `(2, 2.25, 1.25, 2, 2.667, 2.333)`; spectrum `{0, 0.88, 1.88, 2.61, 3.31, 3.81}`).

The remaining failure pattern is **unguarded configurations**: defaults and fallbacks in which correct components combine into incorrect, confidently-labeled output — plus the fact that **none of this is committed, CI-protected, or deployed**.

## P0 — fix immediately

| ID | Finding | Reproduced evidence |
|----|---------|---------------------|
| R-01 | All remediation uncommitted (~400 files); live site serves the 3 Jul build; no CI/branch protection | `git status`; live `/privacy` empty; live `/api/sena/docs` lacks operator/model-card markers |
| R-02 | Directed-by-default fusion fed to symmetric-only embeddings; the Jacobi routine implicitly symmetrizes; badge says "Directed input preserved" | Default sample dataset: max&nbsp;\|A−Aᵀ\| = 1.0, yet `mds.available=true`, stress 0.298 |
| R-03 | Eigensolver caps at 100 *rotations* (mislabeled sweeps), no convergence check → silently wrong spectra for n ≳ 15 | Unresolved off-diagonal energy 0.19 / 29.6 / 266.7 at n = 15 / 30 / 60 (~23% of spectral energy at n=60) |

## P1 — fix within the 3-month window

- **R-04** Any I₀ vertex disables *all* formal embeddings instead of V₊ restriction (spec conv. (a), plan A4); a unit test encodes the wrong convention. Real datasets (unused codes) lose the joint view.
- **R-05** Directed isolation judged on row sums only: a person with in-degree 3 / out-degree 0 is listed in I₀ (reproduced), then R-04 fires.
- **R-06** Silent layout fallback chain (selected operator → MDS → exploratory ring) with no signal to the canvas; guardrail/strip can mislabel rendered geometry.
- **R-07** Provenance envelope + model card hardcode MDS as the embedding of record regardless of the rendered operator (`analysis-run.ts:116–121`).
- **R-08** All 3 embeddings × 2 models rebuilt eagerly on the main thread per option change (O((n+m)³) × 6 per slider move).
- **R-09** ENA-space mode = barycentric person placement (spec's "projection error") with copy that tolerates distance readings.
- **R-10** 1 red test in tree (dossier-export timeout); platform-pinned native deps break clean CI runners.
- **R-11** Live registration requires consent to policy pages that resolve to `/#docs` placeholders (pages exist locally, undeployed).
- **R-12** Enterprise state = file-backed JSON (~72 MB incl. transcripts); retention/deletion/classification undocumented; go-live gates blocked.

## P2 — fix if capacity allows

R-13 (326-file workspace dir, ~40 prop-group shims) · R-14 (static guardrail copy not bound to state) · R-15 (69–74 KB hand-maintained fact monoliths) · R-16 (dense pseudoinverse without size cap) · R-17 (seed shown as "deterministic", not the numeric seed) · R-18 (temporal normalization policy undeclared next to deltas) · R-19 (`normalization:"none"` reachable via API) · R-20 (self-interaction double-count in undirected S) · R-21 (X_ita not first-class; contribution gate is a boolean).

## What to preserve

Consistent `A_fusion` naming end-to-end; `operators.ts` as the single-source math module; `runIdentity` (dataset content hash + config hash); seeded inference with Holm correction; model-card render gate on publication export; attribution wording gate; API-surface moratorium; ADRs. The disclosure culture is right — make the disclosed values true in every configuration.

## 12-week plan (summary)

- **Wk 1–2 (Phase 0):** tag + commit in reviewed slices; GitHub Actions 5-stage gate (lint → golden math → core suite → build → smoke); fix R-02 (symmetry guard + directed branch/badge) and R-03 (convergent Jacobi + n=30/60 invariant tests); deploy and verify live markers. *Exit: CI green, live site serves the new build, T1–T15 in CI.*
- **Wk 3–5 (Phase 1):** V₊ restriction + I₀ panel; directed isolation convention; fallback provenance bound to the canvas; rendered operator into envelope/model card; reject `"none"`; lazy single-operator compute + memoization/worker. *Exit: golden+c4 renders a joint embedding; badge always matches rendered source; responsive at n+m=150.*
- **Wk 6–8 (Phase 2):** `/api/sena/embedding` cached by (datasetHash, configHash, operator); sparse/Lanczos path; per-source Dijkstra; approximate commute-time with declared error; ENA-anchor rename; direction toggle (out/in/symmetrized, badged). *Exit: T10/T11 green against the service; 150-node embed < 2 s.*
- **Wk 9–10 (Phase 3):** X_ita table + evidence-backed contribution gate; temporal policy chip + permutation-tested deltas; model card v3; share links gated. *Exit: contribution wording impossible without evidence; ungated share refused.*
- **Wk 11–12 (Phase 4):** remaining null models; claim-to-validation table in reports; beta with a real CSCL dataset; verified deletion + retention doc; docs aligned to A_fusion language. *Exit: Definition of Done satisfied; PI-signed beta; tagged release deployed.*

## Definition of done (gate for the next PoC stage)

All displayed quantities from A_fusion/A_fusion^dir under declared conventions · declared conventions for every operator incl. V₊ · cross-type distances carry exactness/stress in *all* states incl. fallbacks · T1–T15 + new guards green in CI on every deploy · no silent symmetrization · no silent isolated-node loss (V₊ + I₀ panel) · no mixed-type ranking · no over-strong attribution wording · model card on every export *and* share view · seeded, reproducible validation · live site serves the audited build with real legal pages · numerics correct at n+m ≥ 60 with declared residuals.

---
*Prepared by Claude as senior software architect / technical auditor, 9 July 2026. Sensitive to the team: the July 8–9 sprint shows advisory→implementation turnaround in days — Phase 0 is mostly discipline, not new construction.*
