# SENA Test Strategy and CI Plan — v1.0

**Date:** 2026-07-07 · **Status:** Proposed for adoption · **Owner:** Engineering (SENA)
**Normative sources:** `20260705_SENA_clean version.docx` (spec), `20260705_SENA_Development_Plan.docx` (plan, Sections 5–6)
**Scope:** the 12-week migration of www.sena.hk from the 2026-06-11 engine to the 2026-07-05 specification.

---

## 1. Principles

1. **The worked example is the law.** Every algorithm in the pipeline must reproduce the spec's worked example exactly (to declared tolerances) before it ships. No feature that touches S, W, B, G, A_fusion, operators, or embeddings merges without its golden test.
2. **Tests must fail before they pass.** Encode T1–T15 against the *current* engine first (P0). Expected result: most fail. Each failure becomes a ticket. This converts the migration from opinion into a burn-down list.
3. **No silent anything.** Symmetrization, isolated-node deletion, normalization fallbacks, and NaN-coercion are the four failure modes tests must make loud.
4. **Provenance is testable.** A view that renders without a complete model card is a test failure, not a style issue.
5. **Rebalance the pyramid.** Today ~30 test files guard enterprise/auth/ops routes while the math core has no fixture-based tests (confirmed: `lib/sena/__tests__/sena.test.ts`, 4,986 lines, contains none of the spec's golden numbers). New math tests take priority over any new route tests until parity is reached.

## 2. The golden fixture (core regression asset)

Encode once, in `lib/sena/__fixtures__/worked-example.ts`, imported by every suite:

```
S = [[0,4,0],[4,0,1],[0,1,0]]        // persons P1,P2,P3
W = [[0,3,1],[3,0,2],[1,2,0]]        // codes c1,c2,c3
B = [[2,1,0],[0,2,1],[0,0,3]]        // persons x codes
norm = max  (divisors 4, 3, 3) ; alpha = beta = gamma = 1
node order: (P1,P2,P3,c1,c2,c3)
```

**Expected values** (spec §Worked Example; independently recomputed 2026-07-07 with NumPy — all agree):

| Quantity | Expected | Tolerance |
|---|---|---|
| A_fusion | 6×6 exact fractions (e.g. A[0][3]=2/3, A[1][2]=1/4) | 1e-12 |
| Typed degrees d | (2, 2.25, 1.25, 2, 8/3, 7/3) | 1e-12 |
| eig(L), L = D − A | {0, 0.88, 1.88, 2.61, 3.31, 3.81} | 2 dp |
| min eig(L) | ≥ 0; exactly one zero eigenvalue | 1e-9 |
| P3 social-block degree (raw S) | 1 | exact |
| P3 fused degree | 1.25; P3 ∉ I₀ | 1e-12 |
| Shortest-path Δ (length = 1/weight): min eig(K), K = −½JΔ²J | −1.637 | 3 dp |
| Rank-2 classical MDS max distortion | 0.718 | 3 dp |
| Rank-2 classical MDS stress | ≈ 0.104 | 3 dp |
| Commute-time embedding, d = rank(L⁺) | ‖Z_u−Z_v‖² = c(u,v) to < 1e-9, all u ≠ v | 1e-9 |
| Directed counterexample (plan fixture) | min eig of sym(D_out − A_dir) = −0.218 | 3 dp |

**Fixture-design caution (learned while verifying):** when checking pairwise identities, exclude or special-case u = v. A naive `e[u]=1; e[v]=-1` constructs the wrong vector when u = v and reports a spurious error of ~9.28 on this fixture. Golden tests must themselves be reviewed against the spec by a second person.

## 3. Test suites

### 3.1 Golden regression (T1–T15, from plan §6)

| ID | Asserts | Module | CI stage |
|---|---|---|---|
| T1 | A_fusion equals the 6×6 exact fractions | M4 | PR |
| T2 | degrees d = (2, 2.25, 1.25, 2, 8/3, 7/3) | M5 | PR |
| T3 | eig(L) = {0, 0.88, 1.88, 2.61, 3.31, 3.81} (2 dp), PSD, one zero | M5 | PR |
| T4 | P3: social degree 1, fused degree 1.25, P3 ∉ I₀ | M5 | PR |
| T5 | add never-used code c4: d(c4)=0; L still PSD; exactly 2 zero eigenvalues; c4 retained and listed in I₀ | M5 | PR |
| T6 | zero-inverse convention: eig(L_sym) ⊂ [0, 2] | M5 | PR |
| T7 | ε convention: row of I − D_ε⁻¹A at c4 → identity row as ε → 0⁺ | M5 | PR |
| T8 | directed fixture: min eig of sym(D_out − A_dir) = −0.218 (undirected theorems must NOT be applied) | M5 | PR |
| T9 | P = D_out⁻¹A row-stochastic on V₊; max |eig(P)| ≤ 1 | M5 | PR |
| T10 | Schoenberg: min eig(K) = −1.637 → exact=false; rank-2 distortion 0.718; stress reported | M6 | merge |
| T11 | commute-time embedding exact to 1e-9 on all 9 person-code pairs | M6 | merge |
| T12 | G slices PSD; Σᵢ Gᵢ = Xᵀdiag(P)X; window-normalized Y ⇒ offdiag = W | M7 | PR |
| T13 | Ĝ bounds: ≤ maxₜ X_ta·X_tb; binary X ⇒ [0,1]; zero-participation row → 0 | M7 | PR |
| T14 | ADMISSIBLE_NORMALIZE axioms: N(0)=0; dims; nonnegativity; symmetry; divisor > 0 | M3 | PR |
| T15 | scale invariance: (c_S·S, α/c_S) leaves A_raw unchanged; log rule flagged as non-invariant | M3 | PR |

### 3.2 Ingest and layer-construction unit tests (M1–M2)

- Directed ingest preserves R: `buildSocialMatrix` must never write `S[target][source]` unless `direction=undirected` was explicitly declared. Assert `directedS ≠ S` on an asymmetric fixture in directed mode. (Today the default `undirectedSocial: true` symmetrizes silently — this test pins the fix.)
- B^PC / B^CP independence: in directed mode, uploading an uptake matrix must not be replaced by Bᵀ.
- W construction: stanza-unique co-occurrence, W_aa = 0, code frequencies exported as node attributes.
- B weighting rule declared: `segment.confidence`-weighted vs count-based must be an explicit config, each with its own expected fixture output.
- Unknown person/code references produce warnings and are never silently dropped from totals.

### 3.3 Normalization property tests (M3)

Property-based (fast-check or equivalent), for each rule in {max, frobenius, log1p_max}:
- shape preserved; nonnegativity preserved; symmetric input ⇒ symmetric output; N(0)=0; divisor > 0 for nonzero input;
- max/frobenius: N(cM) = N(M) for c > 0; log1p_max: flagged non-invariant;
- the literal `"none"` normalization is removed or quarantined behind an `exploratory` flag that poisons the model card.

### 3.4 Operator and isolated-node tests (M5)

- I₀ registry: isolated vertices retained in every report/serialization (assert presence, not absence).
- Convention coverage: each of restrict_V₊ / zero_inverse / ε-reg produces documented, distinct, finite outputs on the c4 fixture; provenance records the convention.
- No NaN/Inf escapes any operator (finite-matrix invariant already exists in `fusion-math.ts` — extend it to operators).

### 3.5 Embedding tests (M6)

- Determinism: same config + seed ⇒ identical Z (hash coordinates).
- Sign/rotation stability policy documented (eigenvector sign fixing).
- `metric_exact` flag correctness on both a Euclidean-realizable fixture and the T10 non-realizable fixture.
- Stress/strain always computed when truncated; present in provenance.

### 3.6 Attribution tests (M7)

- G identities (T12) + Ĝ bounds (T13).
- **Wording gate:** serialized outputs may contain "contribution"/"contributed" only when person-specific coding evidence (X_ita or per-person coded segments with a declared attribution rule) is registered; otherwise "association/exposure". Implement as a unit test over report/UI string builders, not a code-review convention.

### 3.7 Typed centrality tests (M8)

- Four families computed (S-block, W-block, B-bipartite, whole-graph-typed); any API/UI payload that ranks persons and codes in one list without type tags fails the contract test.
- The legacy invented metrics (`conceptBrokerage` with its 0.5 constant, `neighborContribution` = S·B) are either removed, or re-labeled experimental with a model-card entry and excluded from default views — enforced by test.

### 3.8 API contract tests

- Every analysis response carries a provenance envelope: {norm_rule, divisors, alpha, beta, gamma, direction, deg_convention, delta, Phi, d, seed, metric_exact, stress, isolated: I₀, dataset_version, codebook_version}. JSON-schema validated in CI.
- Versioned schemas: golden serialization snapshots per schemaVersion; breaking change requires version bump (schema-registry test extended).

### 3.9 UI provenance / model-card tests (Playwright)

- Fusion view refuses to render distances without operator badge (operator, δ, d, seed, exact/stress).
- Two-ring/overlay view always displays "Exploratory layout — distances are not metric."
- Symmetrized directed data displays permanent "Direction collapsed by symmetrization." badge.
- Isolated-node panel lists I₀; isolated nodes visible (dimmed) on canvas.
- Export/share artifacts embed the model card; export is blocked if any of items 1–10 missing.
- Keep `data-testid="sena-fusion-canvas"` and `data-testid="temporal-fusion-arc"` stable (existing smoke contract).

### 3.10 Validation-suite tests (M10)

- Permutation/bootstrap reproducibility: same seed ⇒ same p-value; p = (1 + #{null ≥ obs})/(n_perm + 1).
- Null-model correctness on synthetic data with known effect (power sanity check) and known-null data (calibration: p uniform).

### 3.11 Security smoke

- `/api/ena/run` not publicly invokable (401 without session) or removed.
- All analysis/upload routes require auth; upload size/type limits enforced; no PII in share-link URLs.

## 4. CI gating

| Stage | Runs | Budget |
|---|---|---|
| Every PR | typecheck, lint, unit + property tests, golden T1–T9/T12–T15, API contract tests | < 5 min |
| Pre-merge to main | + T10–T11 (embedding), Playwright provenance suite, security smoke | < 15 min |
| Nightly | full 47-check verification suite, sensitivity grid over (α,β,γ) × norm rules, performance budget (N=500 synthetic), parity checks of vendored jena-js/sna-js outputs against pinned reference outputs | unbounded |
| Release | all of the above green + model-card render-block e2e + signed fixture checksums | gate |

**No deploy while any golden test is red.** During P0 the golden suite may run in "expected-fail" mode with each failure linked to a ticket; expected-fail entries must reach zero by end of P1 (analysis core) and end of P2 (embedding).

## 5. Numeric determinism policy

- Tolerances: spectra 2 dp; Schoenberg/distortion 3 dp; exactness claims 1e-9; assembly identities 1e-12.
- Fix and record library versions for linear algebra (ml-matrix / LAPACK build / BLAS threading); single-threaded eigensolves in CI.
- All stochastic operations take an explicit `seed`; `Math.random` is banned in `lib/sena` by lint rule.
- Eigenvector sign convention: fix sign by making the largest-magnitude component positive.

## 6. Ownership and exit criteria

- **P0 (wk 1–2):** harness + fixtures exist; T1–T4 encoded and running (red allowed, ticketed). Owner: senior engineer + junior dev pairing.
- **P1 (wk 3–5):** T1–T9, T14, T15 green. Owner: math-literate backend dev.
- **P2 (wk 6–8):** T10–T11 green; provenance e2e for fusion view green.
- **P3 (wk 9–10):** T12–T13 + wording gate + typed-centrality contract green.
- **P4 (wk 11–12):** validation reproducibility + model-card render-block green; full PR/merge pipeline enforced on main.

*Definition of green:* the 15 golden tests pass in CI against each release; no silent symmetrization, no silent isolated-node deletion, no α/β/γ reuse across normalization rules (the three failure modes the mathematics forbids — plan §8).
