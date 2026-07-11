# SENA Senior-Architect Advisory Package — 2026-07-07

Advisory review of the www.sena.hk implementation against the normative 2026-07-05 SENA mathematical specification, with a 12-week remediation plan.

## Contents

| File | Audience | Purpose |
|---|---|---|
| `SENA_Senior_Architect_Advisory_Report_v1.0.docx` | Founder/researcher + engineering | Full advisory report (11 sections): executive summary, mathematical-fidelity risks, architecture/codebase risks, data model & API, visualization/UX, testing gaps, security/privacy/ethics, performance, 12-week roadmap, issue register, definition of done. Includes evidence log and independent recomputation of the spec's golden numbers. |
| `SENA_Issue_Register_Roadmap_Tests_v1.0.xlsx` | Engineering + PM | Working artifacts: prioritized issue register (23 issues), 12-week roadmap with exit criteria, golden-test matrix (T1–T15 + supporting suites), self-verifying golden fixture sheet, definition-of-done checklist. |
| `SENA_Test_Strategy_and_CI_Plan_v1.0.md` | Engineering (repo-ready) | Test suites, CI gating, tolerances, determinism policy. Drop into `docs/` of the repo. |
| `SENA_Model_Card_Template_v1.0.md` | Engineering + research | The items 1–10 disclosure contract, exact UI badge strings, JSON schema sketch. Drop into `docs/`. |

## Sources reviewed

- `20260705_SENA_clean version.docx` — normative mathematical specification (treated as law).
- `20260705_SENA_Development_Plan.docx` — migration plan from the 2026-06-11 engine (gap table G1–G10, algorithms A1–A11, golden tests T1–T15).
- Live site: www.sena.hk (home, /method, /platform, /demo, /docs, /workspace/sena) and the public OpenAPI contract at `/api/sena/docs` (60 resources / 94 methods).
- Source code in this folder: `sena-hk-template/` — notably `lib/sena/model.ts`, `fusion-math.ts`, `layout.ts`, `temporal-runtime.ts`, `components/sena/SenaFusionWorkspace.tsx`, test suites, and `CONTEXT.md`.

## Headline finding

**A_fusion is assembled and audited in the code, but nothing the user sees is computed from it.** Workspace coordinates come from the jENA ENA-space projection (`lib/sena/layout.ts`) with social arcs overlaid — the exact "projection error" the specification forbids (spec §Failure Modes, Example 1). The migration plan's architecture (M1–M11) is sound; the priority is sequencing: golden tests first, correct core second, embedding third, disclosure last.

## Verification note

The spec's worked-example numbers (A_fusion fractions, degrees, Laplacian spectrum, Schoenberg failure at −1.637, rank-2 distortion 0.718, commute-time exactness) were independently recomputed on 2026-07-07 and all agree with the 2026-07-05 manuscript.

## Relationship to prior advisory

`SENA_Advisory_2026-07-06/` (previous day) predates this review; this package was produced independently against the July 5 spec and the current repo state, and supersedes it where they differ.

*Prepared by Claude acting as senior software architect / technical auditor, at the request of Shirleen (shirleenxql@gmail.com).*
