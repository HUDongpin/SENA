# SENA Codex Verification Report - 2026-07-07

Prepared by Codex as an independent technical verification of the advisory package in `SENA_Advisory_2026-07-07` and the current SENA codebase in `sena-hk-template`.

## Bottom Line

Codex verifies the advisory's main technical thesis: SENA is a credible research-pilot delivery candidate, but it is not yet ready to claim production SaaS readiness or mathematically defensible SENA metric geometry under the 2026-07-05 specification.

One central sentence in the original advisory was too absolute. The original report says that `A_fusion` exists in code but "nothing the user sees is computed from it." Current source inspection shows an optional `jointLayout()` mode in `components/sena/workspace/fusion-layout.ts` that uses `model.matrices.fusion.values` as deterministic force-layout weights. The corrected statement is: the default canvas is explanatory, the ENA-space mode uses jENA coordinates, and the optional joint mode uses `A_fusion` weights for a force layout, but no visible view implements the specification's declared joint metric embedding with operator, dissimilarity, dimension, seed, Schoenberg exactness, or stress.

## Materials Checked

- `SENA_Senior_Architect_Advisory_Report_v1.0.docx`
- `SENA_Issue_Register_Roadmap_Tests_v1.0.xlsx`
- `SENA_Test_Strategy_and_CI_Plan_v1.0.md`
- `SENA_Model_Card_Template_v1.0.md`
- `README.md`
- Normative inputs: `20260705_SENA_clean version.docx` and `20260705_SENA_Development_Plan.docx`
- Source: `sena-hk-template/lib/sena`, `components/sena`, `app/api`, tests, and project scripts
- Live endpoint: `https://www.sena.hk` and `https://www.sena.hk/api/sena/docs`

## Verified Claims

1. Mathematical worked example: verified.
   - Recomputed `A_fusion`, degree vector `(2, 2.25, 1.25, 2, 2.6667, 2.3333)`, Laplacian spectrum approximately `{0, 0.88, 1.88, 2.61, 3.31, 3.81}`, shortest-path Schoenberg failure `min eig(K) = -1.6368`, rank-2 MDS max distortion `0.7181`, and stress `0.1038`.

2. `A_fusion` assembly and audit: verified.
   - `lib/sena/model.ts` builds the weighted block matrix.
   - `lib/sena/fusion-math.ts` audits the block equation and fingerprints `S`, `W`, `B`, `G`, and `A_fusion`.

3. Formal embedding/operator layer: not present.
   - Source search found no implemented eigendecomposition, Schoenberg/MDS, commute-time, stress/strain, metric-exact flag, isolated-node registry, or zero-degree convention layer in the SENA analysis path.

4. Layout risk: verified with correction.
   - `ena-space` mode uses `buildSenaEnaSpaceCoordinateMap()` over jENA manifest outputs.
   - Default mode is `explanatory`.
   - `joint` mode is an `A_fusion`-weighted force layout, not the July 5 declared metric embedding.

5. Directedness/default convention risk: verified.
   - `defaultOptions.undirectedSocial` is `true`.
   - `buildSocialMatrix()` writes both `S[source][target]` and, by default, `S[target][source]`.

6. Hard-coded weight/default normalization risks: verified.
   - Defaults are `alpha = 0.72`, `beta = 0.64`, `gamma = 0.86`, normalization `max`.
   - `normalizeMatrix()` supports `max`, `log`, and a `none` fallback rather than the July 5 admissible-normalization contract.

7. Test inversion and missing golden fixtures: verified.
   - `components/sena/SenaFusionWorkspace.tsx` is 10,860 lines.
   - `lib/sena/__tests__/sena.test.ts` is 4,986 lines.
   - Source search found no tests containing the worked-example degree/spectrum/Schoenberg golden numbers.

8. Live API surface: verified.
   - `/api/sena/docs` reports 60 endpoints and 94 methods.
   - `/api/ena/run` is documented as `auth: public`.
   - An unauthenticated POST reached validation and returned HTTP 400, confirming the endpoint is not session-gated before request validation.

9. Website/legal-placeholder risk: verified.
   - The public pages expose footer links for Privacy, Terms, Security, and Responsible AI, but those links resolve to `/#docs` placeholders.
   - The registration page requires agreement to Terms and responsible AI policy even though no dedicated policy page was found.

10. Local persistence risk: verified with narrower wording.
    - `.sena-enterprise/` is ignored by git and exists locally at about 72 MB.
    - Upload subfolders contain smoke/sample artifacts. Codex did not classify every row inside the large local JSON store, so the correct claim is "local PoC persistence requiring data classification," not proof of live production PII exposure.

## Current Gate Results

Commands were run from `/Users/dongpinhu/Desktop/SENA/sena-hk-template` on 2026-07-07.

| Check | Result | Notes |
|---|---:|---|
| `npm run lint` | PASS | ESLint completed; Babel warned that `SenaFusionWorkspace.tsx` exceeds 500 KB. |
| Focused Vitest: `api-docs`, `schema-registry`, `sena` | PASS | 3 files, 103 tests. |
| `npm run build` | PASS | Next 16.2.9 production build completed and generated 70 static pages. |
| `npm run sena:pilot:browser-smoke` against local production server | PASS | Browser interaction smoke passed for `http://127.0.0.1:3101/workspace/sena`. |
| `npm run sena:pilot:verify` | FAIL | Full suite stopped before build/browser stage: 2 CDN readiness tests failed because stale 2026-06-30 evidence no longer satisfies the freshness gate. |
| `npm run sena:go-live:check` | BLOCKED | Storage engine is `file-backed-json`; deployment readiness, rehearsal, rollback, post-cutover monitor, and capability audit are blocked. |
| `npm run sena:production:gate` | BLOCKED | 0/3 production gate families passed; production-ready claim not allowed. |

## Advisory Edits Applied

The tracked and clean DOCX versions apply these Codex corrections:

- Replace the over-absolute headline with the more precise `A_fusion` force-layout versus declared metric-embedding distinction.
- Update the top blocker and issue-register language for `B1`, `F1`, and `SENA-001`.
- Add current Codex verification evidence, including the failed full pilot verifier and blocked production/go-live gates.
- Preserve the original report's remediation direction: golden tests first, correct kernel second, embedding/provenance third, disclosure/model-card gate fourth.

## Final Assessment

The advisory package is suitable as a senior technical due-diligence baseline after the tracked Codex corrections are accepted. Its roadmap is technically coherent and proportionate. The main risk is not whether SENA can be fixed; it is whether the project keeps scope frozen long enough to make the analytical kernel testable before adding more enterprise or presentation surface.
