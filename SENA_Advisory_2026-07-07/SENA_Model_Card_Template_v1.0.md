# SENA Model Card Template — v1.0

**Purpose:** the disclosure contract required beside **every** rendered SENA figure, export, and share link (plan §5 A11, spec §Statistical Validation Framework items 1–10). Rendering is **blocked** if any section is missing (`block_render_if_missing`).
**Schema:** `sena-model-card/v2` (add to `lib/sena/schema-registry.ts`).
**Date:** 2026-07-07 · Prepared as part of SENA Advisory 2026-07-07.

---

## Model card fields (items 1–10)

### 1. Data contract
- Dataset ID + **version (content hash)**: `________`
- Persons: n = ___ (ID scheme: pseudonymized ☐ / named ☐ — named requires consent record)
- Interactions: ___ (source table + extraction rule)
- Windows/stanzas: q = ___ · definition: `stage | moving(size, step) | turn(radius)` = ________
- Coded segments: ___ · Codebook: `id@version` = ________ (m = ___ codes)
- Person-specific coding evidence X_ita present: **Yes ☐ / No ☐** (controls §7 wording)

### 2. Exact formulas
- S: `S = R` ☐ or `S = R + Rᵀ` ☐ (undirected) · directed: `S = R` (asymmetry preserved) ☐
- W: `W_ab = Σ_t X_ta X_tb (a ≠ b), W_aa = 0` ☐ · code frequencies reported as node attributes ☐
- B: `B = Y·X` ☐ · segment-count ☐ / confidence-weighted ☐ (declare which)
- G shown: `G_i = Xᵀ diag(Y_i,:) X` ☐ · Ĝ (participation-normalized, 0/0→0) ☐

### 3. Normalization
- Rule: `max ☐ / frobenius ☐ / log1p_max ☐` · Divisors used: S: ___ W: ___ B: ___
- Scale-invariant under global positive rescaling: yes (max/frobenius) ☐ / **no (log)** ☐

### 4. Layer weights and sensitivity
- α = ___ β = ___ γ = ___ — **interpretable only under the rule in §3** (spec Cor. 2)
- Sensitivity grid attached (results at declared (α,β,γ) grid): ☐ · headline findings stable: ☐

### 5. Embedding / geometry
- Operator Φ: `laplacian_eigenmaps ☐ / classical_mds ☐ / commute_time ☐ / none (layout only) ☐`
- Dissimilarity δ: `shortest_path ☐ / diffusion ☐ / commute_time ☐` · dimension d = ___ · seed = ___
- **metric_exact:** true ☐ / false ☐ — if false: stress = ___ · max distortion = ___
- If layout only (force-directed / ring / ENA-space overlay): **distances are not metric** — badge mandatory.

### 6. Coding reliability
- Human coding: raters = ___ · κ / Krippendorff α = ___ on ___% double-coded
- AI-assisted coding: model + version = ___ · human review coverage = ___% · adjudication log ref: ___

### 7. Attribution wording gate
- X_ita present or declared attribution rule → "**contribution**" permitted ☐
- Otherwise → wording limited to "**association / exposure**" ("person i was associated, through participation, with windows containing the code pair") ☐
- Variant shown: G ☐ / Ĝ ☐ (volume effect removed in Ĝ)

### 8. Validation
- Claims made by this figure: ________
- Null model / test per claim (spec claim-to-validation table): ________
- n_perm = ___ · seed = ___ · p = ___ · bootstrap CI: ___
- No inferential claim made (descriptive/exploratory only): ☐

### 9. Isolated vertices and zero-degree convention
- I₀ = { ________ } (fusion-isolated; retained, never deleted) · Social-only isolated (bridge-connected): { ___ }
- D⁻¹ / D^{−1/2} convention: `restrict_V₊ ☐ / zero_inverse ☐ / ε-reg (ε = ___, sensitivity attached) ☐`

### 10. Directed-graph convention
- direction = `undirected ☐ / directed ☐`
- If directed: operator = `out-degree RW ☐ / in-degree RW ☐ / symmetrized ☐`
- If symmetrized: **"Direction collapsed by symmetrization"** badge permanently attached ☐
- Directed bridges: B^PC and B^CP independent (not forced transposes) ☐

**Render gate:** all ten sections complete → render/export permitted. Any missing → view shows "Model card incomplete — rendering blocked", listing missing items.

---

## Badge catalog (exact UI strings)

| Trigger | Badge text |
|---|---|
| Force-directed / ring / overlay view | `Exploratory layout — distances are not metric.` |
| Embedding view computed from A_fusion | `Joint embedding computed from A_fusion — Φ: {operator}, δ: {delta}, d: {d}, seed: {seed}.` |
| metric_exact = true | `Exact metric embedding (Schoenberg criterion satisfied).` |
| metric_exact = false | `Approximate embedding; stress = {stress}, max distortion = {distortion}.` |
| Symmetrized directed data | `Direction collapsed by symmetrization.` |
| Directed mode | `Directed analysis — {out-degree | in-degree} random-walk operator.` |
| Attribution without X_ita | `Association/exposure only; contribution requires person-specific evidence.` |
| Attribution with X_ita | `Contribution supported by person-specific coding evidence ({coverage}% of segments).` |
| Isolated nodes present | `{k} isolated node(s) retained (I₀) — convention: {convention}.` |
| ε-regularized operator | `ε-regularized (ε = {eps}) — numerically regularized, not an observed tie.` |
| Whole-graph typed centrality | `Position in the typed social-epistemic graph — not type-free importance.` |
| Comparative/temporal claim without validation | `Descriptive only — no significance test attached.` |
| log1p_max normalization | `Weights not comparable across rescaled inputs (log rule is not scale-invariant).` |

## JSON sketch

```json
{
  "schemaVersion": "sena-model-card/v2",
  "dataset": {"id": "…", "version": "sha256:…", "n": 0, "m": 0, "q": 0,
               "windowRule": "…", "codebook": "id@ver", "xItaPresent": false,
               "consentRecord": "ref|null", "pseudonymized": true},
  "formulas": {"S": "R+R^T", "W": "sum_t XtaXtb, Waa=0", "B": "Y*X|count|confidence", "G": "Xt diag(Yi) X|Ghat|null"},
  "normalization": {"rule": "max", "divisors": {"S": 4, "W": 3, "B": 3}, "scaleInvariant": true},
  "weights": {"alpha": 1, "beta": 1, "gamma": 1, "sensitivityRef": "…"},
  "embedding": {"phi": "commute_time", "delta": "commute_time", "d": 2, "seed": 42,
                 "metricExact": false, "stress": 0.104, "maxDistortion": 0.718},
  "reliability": {"kappa": null, "alphaK": null, "aiModel": null, "humanReviewPct": null},
  "attribution": {"variant": "G_hat", "wording": "association"},
  "validation": [{"claim": "…", "nullModel": "…", "nPerm": 1000, "seed": 42, "p": null}],
  "isolated": {"I0": [], "socialOnlyIsolated": [], "degConvention": "zero_inverse", "eps": null},
  "direction": {"mode": "undirected", "operator": null, "collapsed": false, "bridgesIndependent": null}
}
```

## Implementation notes

1. Provenance records already exist in embryo (`fusion-math.ts` fingerprints, `runtime-bundle.ts`). Extend, don't reinvent: every module M1–M11 appends to one provenance object; M11 renders it.
2. The card is generated, never hand-edited; hand-edited cards defeat the audit trail.
3. Exports (`report.ts`, `publication-export.ts`, `review-packet.ts`) embed the card in the artifact body and in machine-readable JSON alongside.
4. Share links carry the card by reference (ID + hash), not by URL parameters (no PII in URLs).
