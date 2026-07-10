# SENA — Senior-Architect Advisory Report

**Architecture, Algorithmic Fidelity & 3-Month Remediation Plan**

| | |
|---|---|
| **Prepared for** | Dr. Peter (SENA founder / research lead) and the SENA engineering team |
| **Deployment under review** | www.sena.hk — Next.js app, `sena-hk-template` (Vercel) |
| **Normative basis** | `20260705_SENA_clean version.docx` (math spec) + SENA.HK Algorithm Development Plan |
| **Date** | 6 July 2026 |
| **Classification** | Internal — engineering & research leadership |

> **Companion deliverables:** `SENA_Architecture_Advisory_Report.docx` (formatted report) · `SENA_Issue_Register.xlsx` (filterable tracker: issues, golden tests, roadmap, module map).

---

## Scope, Method, and Evidence Basis

**What this report is.** A senior-architect advisory that (a) treats the 5 July 2026 mathematical specification as normative, (b) audits the currently deployed SENA implementation against it, and (c) gives a realistic 12-week plan to make the system modifiable, mathematically faithful, and technically credible.

**Evidence basis.** This audit was performed against the actual source repository that builds www.sena.hk (the `sena-hk-template` Next.js project, deployed via Vercel). Findings tagged **[Confirmed]** are grounded in specific files and line numbers. Findings tagged **[Risk]** are inferences the team should verify. Source evidence is authoritative over screenshots, so live-UI browsing was not required.

**Tone.** Direct and constructive. The implementation reflects real, competent engineering effort — the criticism targets the object, never the developer. Where the current build already does the right thing, this report says so, because those parts are the foundation the remediation builds on.

**One-line verdict.** SENA is a well-scaffolded research demo with an impressive deployment/enterprise shell, but its analytical core is not yet faithful to the July 5 specification: **the fusion matrix `A_fusion` is assembled correctly as a data object, then never used to compute anything the user sees.** That single gap is the spine of this report.

---

## 1. Executive Summary

**The current technical state, in plain language.** SENA today is a research demo dressed as a product. The website renders a visually rich "fusion" picture — persons on a social ring, codes in an epistemic space, bridges between them — and wraps it in a genuinely large enterprise/operations layer (auth, SSO, SCIM, Postgres adapters, backup, go-live gating, observability). But the analytic substance the platform claims — a unified social-epistemic graph analyzed through one fused adjacency matrix — is **not what the code computes**. The social ring is computed by a vendored SNA library (`sna.js`), the epistemic space by a vendored ENA library (`jena-js`), and the two are overlaid visually. `A_fusion` is correctly built in memory and then used only to print a checksum and pass a structural self-check. No distance, degree, layout, centrality, or embedding the user sees is derived from it.

**Prototype, research demo, or maintainable product?** On the mathematics and analytics, it is a **research demo**: the object of study exists but is analytically inert, and the spec's core guarantees (Laplacian PSD, joint embedding, metric-validity/stress, isolated-node retention, directed operators) are unimplemented. On the platform shell, it looks like an early product: hundreds of files of enterprise plumbing and ~90 route/ops tests. This inversion — heavy platform, thin and unfaithful math — is the central maintainability problem. For a proof-of-concept whose credibility rests on mathematical fidelity, effort has been spent in the wrong tier.

### Top 5 blockers to reliable modification in the next 3 months

| # | Blocker | Why it blocks everything else |
|---|---------|-------------------------------|
| 1 | **`A_fusion` is analytically inert.** Assembled at `model.ts:608–629` but displayed degree, components, betweenness and layout come from the S block via `sna.js` / the ENA manifest via `jena-js`. | Until analytics read from `A_fusion`, no UI or math work changes what the user sees. Root cause behind most §2 findings. |
| 2 | **The "fusion view" is a projection overlay, not a joint embedding.** `layout.ts` places person nodes into a pre-computed `jena-js` ENA space (`source:"jena-js"`) and reads cross-type distances off it. | This is the exact Failure Mode (Example 1, "Projection error") the spec names as invalid. Person–code proximity is currently not a modelled quantity. |
| 3 | **No graph-operator layer exists.** Zero Laplacian, eigendecomposition, commute-time, or Schoenberg code in the whole repo. | Propositions 4–5, Corollary 1, Remark 2, the metric/stress readout, and half the golden tests cannot be built on a codebase with no spectral primitives. |
| 4 | **No golden-test harness bound to the worked example.** The ~90 tests cover routes and enterprise ops; none assert `A_fusion`, `d`, or the Laplacian spectrum. | Without T1–T15 green in CI, any refactor of the math is unverifiable and regressions are silent. Must exist *before* the math work. |
| 5 | **Architecture inversion & provenance gaps.** ~90 enterprise/ops modules vs. a handful of math modules; no model-card gate; math split across two vendor bundles + `model.ts` + `report.ts`. | Time and code gravity are in the wrong tier; no single provenance object can block an unfaithful render, so correctness can't be enforced structurally. |

**The good news.** The remediation does not start from zero. `A_fusion` is already named consistently and assembled with the correct block structure and symmetry (`model.ts`, `fusion-math.ts`, `method-protocol.ts`). A real, seeded permutation + bootstrap + Holm-corrected inference engine already exists (`inference.ts`). The codebase has a strong disclosure culture — interpretation limits and guardrails throughout `report.ts` and `method-protocol.ts`, and G is already cautioned as "association" in `report.ts:223`. These are the right instincts; the work is to move them from the reporting layer into the computational core and make them enforceable.

---

## 2. Mathematical Fidelity Risks

Each risk is scored **Critical / High / Medium / Low** with evidence, the corrupted user-facing feature, the technical layer, a concrete fix, and a testable acceptance criterion.

### 2.1 `A_fusion` computed but never used as the analytical substrate — **Critical** [Confirmed]
- **Evidence:** `model.ts:1027` builds the (n+m)×(n+m) fusion matrix and stores it (`model.ts:1103–1105`); `fusion-math.ts` only fingerprints it and checks block placement/finiteness. Displayed degree = `degree(S,…)` via `sna.js` (`model.ts:179`), components = `components(S)` (`model.ts:162`), betweenness runs "over the S block" (`report.ts:176`), layout coordinates come from the `jena-js` ENA manifest (`layout.ts`). `A_fusion` feeds no metric the user sees.
- **Affected feature:** every analytic panel — node sizes/degrees, clustering, centrality, the fusion canvas.
- **Affected layer:** M4 fusion → M5 operators; `model.ts`, `report.ts`, `layout.ts`.
- **Fix:** route all displayed graph quantities through `A_fusion` / `A_fusion^dir`; compute typed degree, components, centrality from the fused matrix; delete or demote the S-only path.
- **Acceptance:** T2 passes — fused degree `d = (2, 2.25, 1.25, 2, 2.667, 2.333)` computed from `A_fusion` appears in API + UI; no displayed graph metric is sourced from the S block alone.

### 2.2 Visual layout confused with analytical embedding (projection error) — **Critical** [Confirmed]
- **Evidence:** `layout.ts` (`buildSenaEnaSpaceCoordinateMap`) sets `source:"jena-js"` and reads person coordinates from `manifest.outputs.points`, code coordinates from `manifest.outputs.nodePositions` of a pre-computed ENA projection. This is placing SNA persons into an existing ENA space — the spec's Example 1, explicitly labelled invalid.
- **Affected feature:** the main Fusion canvas; any read of person–code distance/angle/cluster.
- **Affected layer:** M6 embedding; `layout.ts`, `SenaFusionWorkspace.tsx`.
- **Fix:** joint embedding computed from `A_fusion` via a declared operator (Laplacian eigenmaps, classical MDS + Schoenberg, or commute-time); keep the ring/overlay strictly exploratory with a non-metric badge.
- **Acceptance:** T10–T11 pass; fusion coordinates produced by `EMBED(A_fusion,…)`; metric/stress badge present whenever person–code distance is visible.

### 2.3 No graph-operator layer: Laplacian / spectrum / PSD unimplemented — **Critical** [Confirmed]
- **Evidence:** repository-wide search finds **zero** non-test files mentioning Laplacian, eigen, commute, or Schoenberg. Corollary 1 (Laplacian PSD) is never computed; the worked-example spectrum `{0, 0.88, 1.88, 2.61, 3.31, 3.81}` is never reproduced.
- **Affected feature:** any spectral/distance view; the claim that the object is a valid graph.
- **Affected layer:** M5 graph operators (new module) + a linear-algebra dependency.
- **Fix:** typed operators module — unnormalized `L = D−A`, normalized `L_sym`, random-walk `P`, with the three declared zero-degree conventions (restrict `V₊`, zero-inverse, ε-regularization); add an eigensolver.
- **Acceptance:** T3, T5, T6, T7 pass.

### 2.4 No metric-validity / stress reporting on cross-type distances — **Critical** [Confirmed]
- **Evidence:** no Schoenberg check, classical-MDS strain, or commute-time exactness anywhere (the apparent "stress/strain" hits are substring matches inside `usageConstraints`). Person–code distances are shown with no exactness/stress qualifier.
- **Affected feature:** fusion canvas distance reading; exported figures.
- **Affected layer:** M6 embedding; `report.ts`, `visual-encoding.ts`.
- **Fix:** `SCHOENBERG_MDS` (`K = −½JΔ²J`; exact iff euclidean and rank ≤ d) + `COMMUTE_TIME_EMBED` (exact at full rank); always compute + surface distortion/stress/strain.
- **Acceptance:** T10 reproduces `min eig(K) = −1.637` and rank-2 max distortion `0.718`; T11 commute-time error `< 1e-9`; UI shows "exact" or a numeric stress.

### 2.5 Silent symmetrization of directed social data — **High** [Confirmed]
- **Evidence:** `report.ts:133` — "Undirected mode counts collapsed person-person ties after SENA symmetrization." The default `undirectedSocial` path symmetrizes R with no badge; `report.ts:187` notes reciprocity still reads directed raw data. The fusion assembly hard-codes a symmetric bridge (`model.ts:618–619`: `fusion[i][n+a] = fusion[n+a][i] = gamma*B`), so `A_fusion^dir` with independent `B^PC`, `B^CP` cannot be represented.
- **Affected feature:** every social-layer metric and the fusion view under "undirected" mode.
- **Affected layer:** M1 ingest, M2 layers, M5 operators.
- **Fix:** preserve R directed on ingest; make symmetrization an explicit badged choice; add `A_fusion^dir` with independent `B^PC`/`B^CP` and out/in-degree random-walk operators; forbid undirected-only theorems on directed objects in code.
- **Acceptance:** T8–T9 pass; symmetrized mode permanently badges "direction collapsed."

### 2.6 Normalization lacks admissibility checks and divisor provenance — **High** [Confirmed]
- **Evidence:** `model.ts:65–73` implements only `max`, `log-max` (log1p then max), `none`. No Frobenius; no assertions for `N(0)=0`, dimension preservation, nonnegativity, symmetry preservation, positive divisor; the divisor and scale-invariance status are not recorded. α, β, γ applied (`model.ts:612–625`) without tying interpretation to the rule in the UI.
- **Affected feature:** layer-weight sliders; every downstream metric; sensitivity claims.
- **Affected layer:** M3 normalization engine; `model.ts`, `types.ts`, workspace.
- **Fix:** `ADMISSIBLE_NORMALIZE` with axiom asserts + provenance `{rule, divisor, scale_invariant}`; add Frobenius; surface the rule next to α/β/γ (Corollary 2).
- **Acceptance:** T14 (axioms) + T15 (scale invariance) pass; UI cannot show α/β/γ without the active rule.

### 2.7 Isolated / zero-degree vertices judged on the S block, not `A_fusion` — **High** [Confirmed]
- **Evidence:** components/isolation via `components(S)` (`model.ts:162`), surfaced as `socialComponent` (`model.ts:473`). No `I₀` registry on the fused graph, no `V₊`/zero-inverse/ε convention. The spec's P3 case is the counterexample: socially peripheral but connected through the bridge.
- **Affected feature:** isolated-node handling; who appears "alone."
- **Affected layer:** M5 operators + UI panel.
- **Fix:** compute `I₀ = {u : d_u = 0}` on `A_fusion`; retain + report isolated nodes (dimmed, never dropped); distinguish fusion-isolation from social-only isolation.
- **Acceptance:** T4 passes — P3 has social degree 1 but fused degree 1.25 and is NOT in `I₀`; isolated-node panel lists `I₀` with reason + `D⁻¹` convention.

### 2.8 Attribution overstated: G labelled "contribution", no normalized Ĝ — **High** [Confirmed]
- **Evidence:** `CONTEXT.md` defines G as "the person-code-pair **contribution** layer … who contributed"; the visual grammar renders "pink **contribution** arcs." No Ĝ (normalized tensor) in code. The slice identity `G_i = Xᵀ diag(Y_i) X` and invariant `Σ_i G_i = Xᵀ diag(P) X` are not implemented/tested. *Mitigating:* `report.ts:223` already cautions "association … unless person-specific evidence" — right wording, not enforced everywhere.
- **Affected feature:** attribution heatmaps; any "who contributed" claim; exports.
- **Affected layer:** M7 attribution; `visual-grammar.ts`, `report.ts`.
- **Fix:** default semantics "association / exposure"; compute PSD slices `G_i` and normalized `Ĝ_i` (0/0→0); enable "contribution" only when `X_ita` evidence or a declared rule is present.
- **Acceptance:** T12–T13 pass; UI shows "contribution" only with evidence, else "association."

### 2.9 Typed centrality not implemented as four separated families — **Medium** [Confirmed]
- **Evidence:** centrality = `sna.js` betweenness over the S block + a bridge "ranking helper" (`report.ts:214`). The spec's four typed families (within-person on S, within-code on W, cross-type on B, whole-graph on `A_fusion`) are not computed; no guard against ranking persons and codes on one list.
- **Fix:** compute four families from the correct blocks; tag whole-graph as "position in the typed graph, not type-free importance"; make a mixed person+code ranking impossible without a type label.
- **Acceptance:** no ranked list mixes persons and codes without a type column; each family declares its own scale.

### 2.10 Temporal comparison uses per-time normalization without a declared policy — **Medium** [Confirmed]
- **Evidence:** `model.ts:754–764` (`normalizeTemporalWindows`) normalizes each window by its own per-metric max — within-time normalization that hides magnitude change — with no global-vs-per-time policy surfaced. Frobenius/spectral/edit distances + significance are not the basis of the displayed delta.
- **Fix:** assemble `A(t)` under a declared norm policy (`global_denominator` vs `per_time`); compute `ΔA` + Frobenius/spectral/edit distances; route significance through the validation suite; disclose the policy.
- **Acceptance:** temporal deltas computed from `A(t)` with the policy shown; no raw distance reported without a significance test.

---

## 3. Architecture and Codebase Risks

### 3.1 Separation across the 11 pipeline stages

| Pipeline stage | State today | Assessment |
|---|---|---|
| Data ingest (M1) | `import.ts` / `import-adapters.ts`; direction collapsed on ingest | **Partial** |
| Layer construction (M2) | `model.ts` builds S, W, B; G present; bridge hard-coded symmetric | **Partial** |
| Normalization (M3) | inline in `model.ts` (max/log-max/none); no admissibility engine | **Weak** |
| Fusion assembly (M4) | correct block build (`model.ts:608–629`); consistent `A_fusion` naming | **Good** |
| Graph operators (M5) | absent — no Laplacian/degree-on-fusion/normalized operators | **Missing** |
| Embedding (M6) | absent as joint embedding; layout reads `jena-js` ENA projection | **Missing** |
| Attribution (M7) | G present as "contribution"; no Ĝ, no slice identities | **Weak** |
| Typed centrality (M8) | `sna.js` betweenness on S + bridge ranking; not four families | **Partial** |
| Temporal (M9) | `temporal-runtime.ts` with per-time normalization only | **Partial** |
| Validation (M10) | `inference.ts`: seeded permutation + bootstrap + Holm; generic null only | **Partial — strong base** |
| Reporting / UI (M11) | rich `report.ts` + workspace; no render-blocking model card | **Partial** |

**Verdict.** The seams the plan wants (typed contract, provenance per module, one assembly point) partially exist, but the middle of the pipeline — normalization, operators, embedding, attribution — is inline, missing, or unfaithful. Correctness cannot be localized because there is no operators module to own it and no provenance object to enforce it.

### 3.2 Signs of prototype / vibe-coded architecture (code-grounded)
- **Architecture inversion.** ~90 modules under `lib/sena/enterprise/*` and `ops-*` vs. a handful of math modules. For a PoC whose value is mathematical fidelity, code gravity is in the wrong tier.
- **Calculations split across vendor bundles and UI-adjacent code.** Analytics come from vendored `jena-js` (ENA) and `sna.js` (SNA); fusion in `model.ts`; interpretation in `report.ts`. No single source of truth for "what SENA computes."
- **Computed-but-unused objects.** `A_fusion` is assembled then only fingerprinted — a classic prototype smell where the headline object is decorative.
- **Inline, non-configurable normalization.** A private function with a fixed rule set and no schema; adding Frobenius or asserts touches model internals.
- **No math test fixtures.** The worked example isn't encoded; the large suite asserts routes/ops, so math can regress silently.
- **Provenance without enforcement.** Fingerprints + interpretation limits exist, but nothing blocks a render when provenance is incomplete (`block_render_if_missing` is absent).
- **Hard-coded structural assumptions.** The symmetric bridge in the assembly encodes "undirected" into the data model, so directed mode is *structurally precluded*, not merely unimplemented.

**Positive signals worth preserving.** Consistent `A_fusion` naming; documented ubiquitous language (`CONTEXT.md`); explicit guardrails; `schema-registry` versioning; a real seeded statistical engine. Harden these, don't discard them.

---

## 4. Data Model and API Issues

### 4.1 Minimum data contract to enforce

| Entity | Shape / key fields | Rules to enforce |
|---|---|---|
| Person p₁..pₙ | stable `personId`, displayName, group, consent flag | IDs globally unique + stable across imports; never reuse |
| Code c₁..cₘ | `codeId`, label, `codebookVersion` | every code carries its codebook version; mixed versions rejected/migrated |
| Discourse window t₁..t_q | `windowId`, unit/stanza def, ordering, span | one declared windowing rule per dataset |
| Interaction | fromPerson, toPerson, weight ≥ 0, direction, timestamp | directed by default; symmetrization is a downstream badged choice |
| Coded segment | windowId, codeId, personId?, sourceRef | each segment links to a source record (traceability) |
| Participation `Y[n×q]` | person×window, ≥ 0 | dims match persons/windows; raw counts separate from normalized |
| Code activation `X[q×m]` | window×code, ≥ 0 (binary/weighted) | declared binary vs weighted; builds `W = XᵀX`, `B = YX` |
| Social `R[n×n]` | person×person, ≥ 0, directed | zero diagonal by default; self-ties only under a declared convention |
| `X_ita` (optional) | person-specific coding evidence | presence unlocks "contribution" wording |

### 4.2 Risks to flag
- **Ambiguous person IDs** — `layout.ts` already probes `personId/person/unit/unitId/id`; enforce one canonical key.
- **Codebook versioning** — no evidence codes carry a version; mixing corrupts W and B.
- **Window definition drift** — multiple modes (fixed/moving/radius); record + show the active definition.
- **Raw vs normalized mixing** — keep them as distinct labelled fields (the fingerprint layer already separates raw/normalized — extend everywhere).
- **Missing edge→source audit trail** — every fused edge should trace to the segments/interactions that produced it.
- **Dataset versioning & import/export schema** — make a first-class versioned dataset artifact the unit of reproducibility.

### 4.3 Recommended API / service boundaries

| Endpoint / service | Responsibility | Returns |
|---|---|---|
| `POST /api/dataset` | validate + version an ingested dataset | datasetId, schemaVersion, validation report |
| `POST /api/layers` | build S, W, B (+directed) from R, X, Y | raw + provenance |
| `POST /api/normalize` | admissible normalization with axiom checks | normalized layers + `{rule, divisor, scale_invariant}` |
| `POST /api/fusion` | assemble `A_fusion` / `A_fusion^dir` / `A_fusion(t)` | block matrix + labels + tag |
| `POST /api/operators` | degrees, `I₀`, L, L_sym, L_rw under conventions | operators + spectrum + convention |
| `POST /api/embedding` | eigenmaps / MDS+Schoenberg / commute-time | Z + `{Φ,δ,d,seed,exact,stress}` |
| `POST /api/attribution` | G and Ĝ slices with wording rules | tensors + variant + bounds |
| `POST /api/centrality` | four typed families | per-family scores + scale disclosure |
| `POST /api/temporal` | `A(t)` deltas under a norm policy | distances + policy + significance |
| `POST /api/validate` | null models, permutation, bootstrap, sensitivity | obs, p, n_perm, seed, null_model |
| `GET /api/model-card/:viewId` | assemble items 1–10; gate rendering | model card or **409** if incomplete |

---

## 5. Visualization and UX Issues

The overarching risk: **the interface invites metric readings of a non-metric picture.**

| UI element | How it can mislead today | Fix |
|---|---|---|
| Ring / overlay layout | outer social ring + inner ENA space invite reading distance/angle as meaning | demote to "exploratory layout" with a permanent non-metric badge; make the joint embedding the default |
| Graph distance | distances come from the ENA projection, not a joint model; no exactness/stress | show operator, δ, d, seed + "exact" or numeric stress next to any person–code distance |
| Person–code proximity | reflects ENA placement, not `A_fusion` | recompute from `EMBED(A_fusion)`; label the operator |
| Centrality rankings | betweenness on S block framed as importance; type-mixing risk | four typed families; whole-graph tagged "position, not type-free importance" |
| Group comparisons | differences shown without always foregrounding the null model/p-value | attach p, n_perm, seed, null-model name to every group claim |
| Temporal comparisons | per-time normalization hides magnitude changes | show the norm policy; label "structural change only" when per-time |
| Attribution heatmaps | "contribution" overstates person-level evidence | default "association/exposure"; unlock "contribution" only with `X_ita` |
| Isolated nodes | judged on S block; bridge-connected persons can look alone | `I₀` panel from `A_fusion`; draw isolated nodes dimmed, never drop |
| Export figures / share links | can travel without their assumptions | embed the model card; block if incomplete |

### 5.1 Exact badge text to implement
- *"Exploratory layout — distances are not metric."* (ring/overlay view)
- *"Joint embedding computed from A_fusion."* (analytical embedding; add operator + d + seed)
- *"Direction collapsed by symmetrization."* (permanent, whenever symmetrized mode is active)
- *"Association/exposure only; contribution requires person-specific evidence."* (attribution unless `X_ita`)
- *"Approximate embedding; stress = 0.xx."* (any truncated/inexact embedding; show the number)
- *"Exact metric (commute-time, full rank)."* (when Proposition 5 is satisfied)

**Design principle.** One badge per object, plus a single expandable "Model card" affordance per view. Casual users see a clean picture with a small badge; reviewers get full disclosure in one click.

---

## 6. Testing and Verification Gaps

**Today's gap.** The suite is large but aimed at routes, auth, and enterprise ops. The analytics have essentially no regression protection, and the worked example is not encoded. **Highest-leverage action: build the golden-test harness first (Week 1–2)** so all later math is verified against fixed numbers.

### 6.1 Golden regression fixture
Encode `S = [[0,4,0],[4,0,1],[0,1,0]]`, `W = [[0,3,1],[3,0,2],[1,2,0]]`, `B = [[2,1,0],[0,2,1],[0,0,3]]`, `norm=max`, `α=β=γ=1` once; assert everywhere.

| Test | Asserts | Layer |
|---|---|---|
| T1 A_fusion | exact 6×6 fused matrix (spec fractions) | M4 |
| T2 Degrees | `d = (2, 2.25, 1.25, 2, 2.667, 2.333)` from A_fusion | M5 |
| T3 Laplacian spectrum | `{0,0.88,1.88,2.61,3.31,3.81}`; PSD; one zero | M5 |
| T4 Bridge keeps P3 | social deg 1 but fused deg 1.25; P3 ∉ I₀ | M5 |
| T5 Unused code | add c4: d(c4)=0; L PSD; exactly two zero eigenvalues | M5 |
| T6 zero-inverse | `eig(L_sym) ⊆ [0,2]` | M5 |
| T7 ε-convention | row of `I − D_ε⁻¹A` at c4 → identity as ε→0⁺ | M5 |
| T8 directed indefinite | `min eig sym(D_out − A_dir) = −0.218 < 0` | M5 |
| T9 row-stochastic | `P = D_out⁻¹A` row-stochastic on V₊; `|eig| ≤ 1` | M5 |
| T10 Schoenberg/MDS | `min eig(K) = −1.637` ⇒ exact=false; rank-2 max distortion `0.718`; stress reported | M6 |
| T11 commute-time | `max | ‖Z_u−Z_v‖² − C(u,v) | < 1e-9` on all 9 pairs | M6 |
| T12 G slices | `G_i` PSD; `Σ_i G_i = Xᵀ diag(P) X`; window-normalized Y ⇒ offdiag = W | M7 |
| T13 Ĝ bounds | `Ĝ ≤ max_t X_ta X_tb`; binary X ∈ [0,1]; zero-participation row → 0 | M7 |
| T14 normalization axioms | N(0)=0; dims; nonneg; symmetry; divisor > 0 | M3 |
| T15 scale invariance | max/frob invariant to rescale; log flagged variant | M3 |

### 6.2 Test strategy by layer
- **Unit — layers (M2):** `W = XᵀX` symmetric PSD before the zero-diagonal step; `B = YX` nonnegative + correct dims; directed builder keeps asymmetry.
- **Property — normalization (M3):** the five admissibility axioms as property tests over random nonnegative matrices + scale invariance.
- **Unit — fusion (M4):** block placement; symmetry in undirected mode; `A ≠ Aᵀ` allowed + tagged in directed mode.
- **Unit — operators (M5):** PSD Laplacian; spectra ranges; all three zero-degree conventions; isolated-node retention.
- **Unit — embedding (M6):** Schoenberg iff; commute-time exactness at full rank; stress computed whenever truncated.
- **Unit — attribution (M7):** G/Ĝ identities + bounds; wording gate keyed to `X_ita`.
- **Contract — UI / model card:** a view with an incomplete provenance record fails to render (409 / blocked).
- **End-to-end golden:** dataset → fusion → operators → embedding → model card reproduces every worked-example number.

### 6.3 CI gate (before every deploy)
Block deployment on: T1–T15; M3 admissibility property tests; directed-vs-undirected guard tests; the model-card render-gate contract test; plus the existing route/enterprise suite. Seeds fixed + recorded so permutation/bootstrap p-values reproduce. **Fail-closed:** a red golden test blocks release.

---

## 7. Security, Privacy, and Research-Ethics Risks

SENA ingests collaborative-learning discourse — frequently from students, i.e. potentially minors.

| Area | Risk | Concrete recommendation (PoC-appropriate) |
|---|---|---|
| Student data / minors | discourse may involve minors; heightened duty of care | de-identified imports by default; never require real names; document a minors policy before any real classroom data |
| PII in transcripts | names/emails/identifying content inside discourse | PII scan + redaction at ingest; store pseudonymous `personId`; separate, access-controlled re-identification map |
| Transcript storage | default file-backed store (`.sena-enterprise`) is a local adapter, not managed infra (per CONTEXT.md) | encrypt at rest; document retention; don't treat the file store as production-grade for real data |
| Consent | no consent artifact tied to datasets | attach a consent/approval record to each dataset; surface in the model card |
| Anonymization | pseudonymization not enforced by the data model | make pseudonymous IDs the only IDs the analytics see |
| Audit logs | `ops-audit.ts` exists — good | ensure it covers data access/export/re-identification; make logs tamper-evident |
| Access control | RBAC in `enterprise/access-control.ts` | least privilege on datasets/exports; roles gate re-identification |
| Sharing / export links | figures can travel without scope | embed the model card; scope/expire links; record exports in the audit log |
| AI-coding reliability | unreliable coding propagates into S/W/B (spec Example 3) | record coder (human/AI/model+version); require human review; report reliability (κ) |
| Human review workflow | no explicit coding-review gate | block "publication-grade" claims until reliability + review pass |
| Data deletion | no per-subject deletion path | dataset + per-subject delete; propagate to derived artifacts and backups |
| Compliance posture | education-research expectations (FERPA/GDPR-style, IRB) | keep an ethics/IRB reference + data-governance metadata per dataset (`report.ts` already models governance — extend + enforce) |

**Bottom line.** The platform already has audit, RBAC, and governance-metadata primitives — the work is to bind them to the dataset lifecycle and the model card so privacy posture travels with every figure, and to make de-identification the default.

---

## 8. Performance and Scalability Risks

| Operation | Cost / bottleneck | Strategy |
|---|---|---|
| Dense `A_fusion` & layers | (n+m)² memory; most blocks sparse in practice | sparse (CSR); dense only for small n+m or final display |
| Eigendecomposition (L, L_sym) | O(N³) dense | dense ≤ ~1–2k nodes; sparse/partial eigensolvers (Lanczos, k-smallest) beyond |
| Commute-time pseudoinverse | `L⁺` is O(N³) dense (plan flags N > ~3000) | restrict to connected V₊; sparse/Nyström/low-rank at scale; cache `L⁺` |
| Graph distances (Dijkstra for MDS Δ) | all-pairs shortest path O(N² log N)+ | compute on demand for the active view; cache; prefer commute-time (exact) |
| Permutation / bootstrap | n_perm × statistic; already seeded (`inference.ts`) | background jobs (`server-job-queue.ts` exists); stream progress; cache by (data, seed, n_perm) |
| Temporal snapshots | one assembly + operators per window | precompute `A(t)` + spectra as artifacts; diff incrementally |
| Large discourse datasets | ingest + coding scale with transcript size | stream ingest; precompute layer matrices as versioned artifacts; paginate UI |

**Rules of thumb.** Dense + exact for the worked example and small pilots (correctness first); sparse + approximate only past a measured threshold, behind the same tested interface. Precompute embeddings/spectra as cached artifacts keyed by (dataset version, config, seed); **never** recompute an eigendecomposition inside a UI render path.

---

## 9. Three-Month Remediation Roadmap

Twelve weeks, five phases, sequenced so verification exists before the math it verifies, and faithfulness is built bottom-up (operators → embedding → attribution → UI). The Development Plan's P5 beta/perf hardening is folded into Weeks 11–12 and flagged as the main schedule risk.

| Phase | Goal | Key tasks | Owner role | Exit criteria |
|---|---|---|---|---|
| **Wk 1–2 · Foundation** | make the math testable + consistently named | golden-test harness (T1–T15 scaffold); worked-example fixture; typed data contract; finish `A_SENA`→`A_fusion` naming sweep; CI fail-closed | senior/full-stack + math reviewer | T1–T4 green or precisely ticketed; data-contract schema merged; CI blocks on golden tests |
| **Wk 3–5 · Core engine** | faithful layers, normalization, fusion, operators, direction | M2 layer builders (directed); M3 admissible normalization (+Frobenius, asserts, provenance); M4 `A_fusion`/`A_fusion^dir`; M5 degrees/Laplacian/normalized operators w/ zero-degree conventions; isolated-node retention | backend + numerics reviewer | T1–T9, T14–T15 green; all degrees/components from `A_fusion`; no silent symmetrization |
| **Wk 6–8 · Embedding** | real joint geometry with honest distortion | M6 embedding: eigenmaps, MDS + Schoenberg, commute-time; stress/strain readout; replace ring-overlay analytical reading with `EMBED(A_fusion)` | numerics engineer + frontend | T10–T11 green; fusion view runs off `A_fusion`; distances carry exact/stress metadata |
| **Wk 9–10 · Attribution/typed** | correct attribution, typed centrality, temporal, model-card proto | M7 G/Ĝ with wording gate; M8 four typed-centrality families; M9 temporal deltas under declared policy; first model-card generator (items 1–10) | backend + product/UX | T12–T13 green; "contribution" gated on `X_ita`; model card renders for one E2E view |
| **Wk 11–12 · Validation/UX/harden** | enforce disclosure, validate claims, beta on real data | M10 structure-preserving null models + sensitivity; UI badges + isolated-node/direction toggles; model-card render-gate; docs; CSCL beta; perf pass (sparse `L⁺`) | full team + pilot researcher | model card blocks incomplete renders; p-values reproducible by seed; all 15 golden tests green; sign-off vs July 5 spec |

### 9.1 Dependencies and sequencing risks
- **Hard dependency chain:** operators (Wk3–5) block embedding (Wk6–8) block the model-card metric fields (Wk9–10). Don't parallelize; slipping the engine slips everything.
- **Numerics skill is the scarce resource.** Eigensolvers, pseudoinverse, and the Schoenberg iff are highest-risk; secure a math-literate reviewer for Weeks 3–8.
- **Beta + hardening is the pressure point.** Weeks 11–12 carry validation, UI, docs, and a real-data beta. If time compresses, protect the model-card gate and golden CI; defer sparse-scale performance to a fast-follow.
- **Freeze the enterprise shell** during these 12 weeks; redirect that capacity to the math core.

---

## 10. Prioritized Issue Register

Effort key: **S** ≤ ~2 days · **M** ≤ ~1–2 weeks · **L** ≥ ~2–4 weeks or cross-cutting. (Filterable version with owner/status columns in `SENA_Issue_Register.xlsx`.)

| ID | Issue | Sev | Evidence / source | Why it matters | Module | Recommended fix | Eff | ≤3mo |
|---|---|---|---|---|---|---|---|---|
| S-01 | `A_fusion` assembled but never used for analytics | Critical | model.ts:608–629,:1027; degree(S):179; components(S):162; report.ts:176 | headline object is decorative; nothing users see is fused | M4/M5 | route all displayed quantities through `A_fusion`; delete S-only path | L | Yes |
| S-02 | Fusion view is an ENA-projection overlay, not a joint embedding | Critical | layout.ts (source:"jena-js") | person–code distance is not a modelled quantity (Example 1) | M6 | `EMBED(A_fusion)`; overlay = exploratory only | L | Yes |
| S-03 | No graph-operator layer (Laplacian/eigen) | Critical | 0 non-test files for Laplacian/eigen/commute/Schoenberg | Corollary 1, Props 4–5, half the golden tests impossible | M5 | operators module + eigensolver | L | Yes |
| S-04 | No metric-validity / stress reporting | Critical | no Schoenberg/MDS/commute | cross-type distances shown with no exactness/stress | M6 | SCHOENBERG_MDS + COMMUTE_TIME_EMBED + stress readout | M | Yes |
| S-05 | No golden-test harness for worked example | Critical | package.json has no math/golden script | math regresses silently; refactors unverifiable | M0 | encode fixture; T1–T15 in CI | M | Yes |
| S-06 | Silent symmetrization of directed social data | High | report.ts:133,:187; symmetric bridge model.ts:618–619 | direction dropped w/o disclosure; `A_fusion^dir` impossible | M1/M2/M5 | preserve R directed; badge symmetrization; directed assembly+ops | L | Yes |
| S-07 | Normalization lacks admissibility checks & Frobenius | High | model.ts:65–73 | no axioms; α/β/γ uninterpretable vs rule | M3 | ADMISSIBLE_NORMALIZE + provenance; add Frobenius | M | Yes |
| S-08 | Isolated nodes judged on S block, not `A_fusion` | High | components(S) model.ts:162; :473 | P3-type nodes mis-marked isolated; no `I₀` registry | M5 | compute `I₀` on `A_fusion`; retain & report; conventions | M | Yes |
| S-09 | Attribution overstated; G="contribution", no Ĝ | High | CONTEXT.md; visual-grammar; no Ghat in code | overstates person-level evidence (Example 4) | M7 | default "association"; add Ĝ; gate "contribution" on `X_ita` | M | Yes |
| S-10 | No render-blocking model card | High | 0 modelCard files | unfaithful/undisclosed figures can render & export | M11 | model-card generator + block_render_if_missing | M | Yes |
| S-11 | Validation null models are generic mean-shuffles | High | inference.ts:183–195 | not structure-preserving; claims under-supported | M10 | degree-preserving rewiring, code-label/stanza shuffles, bipartite null, sensitivity | M | Yes |
| S-12 | Degrees are social-only, not fused typed degrees | High | degree(S) model.ts:179; :470 | node emphasis contradicts the fused model (T2) | M5 | compute typed degree from `A_fusion` | S | Yes |
| S-13 | Typed centrality not four separated families | Medium | report.ts:176,:214 | mixed-type ranking risk; no scale disclosure | M8 | four families; tag whole-graph; block mixed lists | M | Yes |
| S-14 | Temporal uses per-time normalization only | Medium | model.ts:754–764 | hides magnitude change; no declared policy | M9 | `A(t)` under declared policy; `ΔA` distances + significance | M | Yes |
| S-15 | Architecture inversion: ~90 ops files vs thin math core | High | lib/sena/enterprise/* + ops-* | effort/gravity in wrong tier; math hard to modify | All | freeze enterprise growth; consolidate math into tested services | L | Partial |
| S-16 | Math split across vendor bundles + UI-adjacent code | Medium | jena-js, sna.js; model.ts; report.ts | no single source of truth for "what SENA computes" | All | centralize analytics behind /api; vendor libs = within-type only | L | Partial |
| S-17 | Person ID ambiguity | Medium | layout.ts probes 5 id fields | fragile joins; mis-placed nodes | M1 | enforce one canonical stable `personId` | S | Yes |
| S-18 | No codebook versioning / edge→source audit trail | Medium | no codebookVersion; no edge provenance | mixed codebooks corrupt W/B; no traceability | M1 | version codebooks; link every edge to source segments | M | Yes |
| S-19 | De-identification not enforced for discourse data | High | .sena-enterprise file store; no PII redaction | student PII risk; possible minors | Sec | PII redaction + pseudonymous IDs by default; encrypt at rest | M | Yes |
| S-20 | Eigen/commute compute has no scale plan | Low | operators absent | latency regression risk on real datasets | Perf | sparse + Nyström past a threshold; cache artifacts | M | Partial |

---

## 11. Definition of Done

SENA is ready for the next proof-of-concept stage when **all** of the following hold simultaneously and are demonstrable in CI and in the running app.

| # | Condition | How it is demonstrated |
|---|---|---|
| 1 | every displayed quantity computed from `A_fusion` / `A_fusion^dir` | grep + tests show no S-only analytic path; T1–T2 green |
| 2 | every graph operator has a declared convention | operator responses carry `{convention, eps?}`; T5–T7 green |
| 3 | cross-type distance claims carry exactness or stress | embedding response has `{exact, stress}`; T10–T11 green; UI badge present |
| 4 | golden tests pass in CI | T1–T15 fail-closed gate on every deploy |
| 5 | no silent symmetrization | directed preserved; symmetrized mode permanently badged; T8–T9 green |
| 6 | no silent deletion of isolated nodes | `I₀` retained, listed, drawn dimmed; T4 green |
| 7 | no mixed-type centrality ranking without type labels | UI cannot render a person+code list without a type column |
| 8 | no attribution wording stronger than the evidence | "contribution" gated on `X_ita`; else "association"; T12–T13 green |
| 9 | a model card is attached to every export / share view | export embeds items 1–10; render blocked if incomplete |
| 10 | validation results reproducible with seeds | permutation/bootstrap p-values reproduce byte-for-byte from the recorded seed |

**The single rule that operationalizes most of this:** *no view may render a number whose provenance record is incomplete.* If the model-card gate is real and enforced in CI, then normalization disclosure, embedding honesty, direction conventions, isolated-node handling, and attribution wording all become non-optional — the mathematics stops being advice and becomes a build constraint.

**Closing note.** The distance between the current build and this Definition of Done is real but bounded, precisely because the July 5 specification and its Development Plan already supply the target numbers, the pseudocode, and the acceptance tests. The work of the next 12 weeks is not research — it is disciplined engineering against a fixed, verified target. Build the harness first, move the mathematics from the report layer into a tested core, and let the model card make faithfulness the only way to ship.
