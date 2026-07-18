# SENA — Next Development Plan (2026-07-18)

**Author:** Claude (Opus 4.8), for Peter (Dongpin HU)
**Repo:** `/Users/dongpinhu/Desktop/SENA` · app in `sena-hk-template/`
**Branch reviewed:** `feat/workspace-top-plots-bar` @ `fa7b954`
**Live site:** www.sena.hk (Vercel project `sena-hk`, CLI-deployed, no Git auto-deploy)

> This plan is written against the *verified* state of the tree on 2026-07-18, not against
> older planning docs. It supersedes the sequencing in `20260705_SENA_Development_Plan.docx`
> and complements the in-app machine-readable plan in
> [`lib/sena/development-plan.ts`](sena-hk-template/lib/sena/development-plan.ts). It does **not**
> change any v1 export schema, matrix semantics, or the "exploratory-only until gates pass"
> discipline.

---

## 1. Where SENA stands today

| Track | Status | Evidence |
|---|---|---|
| **Runtime foundation** | ✅ Complete & deployed | Pinned `jena-js@0.6.2` + `sna.js` = `npm:@peterhudongpin/sna.js@0.4.0`; no `vendor/`; provenance chain rewritten in `runtime-constants.ts` (`jenaRuntimeVersion=0.6.2`, `snaRuntimeVersion=0.4.0`); live on www.sena.hk with production browser-worker smoke passing |
| **Local research pilot** | 🟡 Active | Six-step `/workspace/sena` workflow (Import → Model → Fusion Canvas → Evidence → Temporal Trace → Report); A1 Inner Solid Mesh grammar; Temporal Fusion Arc; review-packet / runtime-bundle / snapshot exports |
| **Workspace chrome** | 🟡 In review | Top **Plots bar** consolidation on this branch (PR #5); pinned by the five workspace plot-view contract layers |
| **Bug hardening** | 🟡 Fixed, **uncommitted** | F1–F6 fixed & verified (`20260718_SENA_Bug Report.md`); full suite 1018 pass / 1 skip; changes still sitting in the working tree |
| **Research validation** | ⏸ Deferred | Reliability/inference primitives exist; real-data + domain-review evidence not yet gathered |
| **Enterprise / production cutover** | ⏸ Gated | Local readiness loop + acceptance-evidence artifacts exist; institution-owned services remain platform-owner decisions |
| **Human–AI SENA (v2)** | 📄 Research brief only | Strategy captured in `docs/research/human-ai/…2026-07-11.md` (PR #3, draft); no contract/runtime work yet |

**Health:** `tsc` strict is clean on product source; `eslint` clean; full suite green. Two standing
liabilities carried forward, both **out of product scope**: (a) 58 pre-existing TypeScript errors in
*test files* (`ProcessEnv`/`NODE_ENV`), (b) one flaky `enterprise-capability-audit` timeout.

---

## 2. Immediate hygiene — "Week 0" (land what's already done)

These are near-zero-risk and should close before any new feature work; several are correctness/PR
hygiene, not features.

1. **Commit the F1–F6 bug fixes.** The eight modified files (`import-adapters.ts`, `import.ts`,
   `model.ts`, `reliability.ts` + three test files + `next-env.d.ts`) are verified but uncommitted.
   Commit them as a self-contained "data-ingestion & reliability hardening" change with the bug
   report attached. *Owner: SENA-A05 / A08. Gate: `npm test` green (1018/1).*
2. **Resolve the PR backlog.** Merge **PR #5** (top Plots bar) after a fresh essential-shell contract
   run; **close PR #4** as superseded by #5 (duplicate plot-view-bar branch); decide **PR #3**
   (Human–AI research brief) → land as `docs/research` since it's already merged into the tree, or
   keep as the design-of-record for Track C. *Owner: SENA-A01.*
3. **Fix stale runtime docs (doc drift).** `CONTEXT.md` (lines 25–26) and `AGENTS.md`
   (lines 26, 34, 143, 150–151) still say the app "runs local `jena-js` from
   `sena-hk-template/vendor/jena-js`" / `file:vendor/*`. That is **no longer true** — the migration
   deleted `vendor/` and pinned registry packages. Update both to the registry-package story so
   future sessions don't act on a false boundary. *Owner: SENA-A01. Low effort, high trust value.*
4. **Retire the two standing test-infra liabilities** (schedule, don't block): type the
   `ProcessEnv`/`NODE_ENV` test globals to clear the 58 `tsc` test-file errors, and stabilize or quarantine
   the flaky enterprise-capability-audit timeout so `npm test` is deterministically green. *Owner: SENA-A11.*
5. **Refresh the pilot gate on `main`.** After #1–#2 land, run `npm run sena:pilot:verify` (servers
   stopped first) and redeploy www.sena.hk via `vercel deploy --prod` so the live site carries the
   hardening fixes. *Owner: SENA-A11 / A10.*

**Exit:** `main` is green, docs match reality, live site == verified tree, no orphaned PRs.

---

## 3. The three forward tracks

After Week 0, work proceeds on three tracks that can overlap. **Track A is the delivery spine**
(makes SENA handoff-ready *now*). **Track B** unblocks any claim stronger than exploratory.
**Track C** is the flagship research contribution and can start in parallel because it is *additive*
(compatibility views over the existing five-table contract — no schema break).

### Track A — Pilot handoff freeze & researcher walkthrough  *(priority: highest)*

Goal: turn the verified pilot into a frozen, reviewer-runnable package and put it in front of real
researchers. This is exactly the `pilot-handoff-freeze` → `researcher-walkthrough` sequence already
encoded in `development-plan.ts`.

- **A1 — Freeze the handoff package.** Fixed six-step workflow + sample/templates + snapshot +
  runtime-bundle + review-packet + walkthrough/verification exports, all schema-stable (additive
  fields only). Gate: `sena:pilot:verify` passes immediately before freeze.
- **A2 — Bilingual walkthrough script (中文/English).** Data Import → Fusion Canvas → Temporal Fusion
  Arc → Evidence Inspector → review-packet export, followable without a developer present.
- **A3 — Run 1–2 real research datasets** (a lesson-study transcript and one async forum/LMS export)
  end-to-end. Capture confusing terminology, missing-evidence moments, and report blockers as the
  research-validation backlog.
- **A4 — Usability polish** on empty/import/error states and the Evidence Inspector, staying inside
  the workspace plot-view contract layers (no changes to the pinned switcher testids / DOM order).

**Acceptance:** a researcher explains the whole workflow unaided; all report claims remain
exploratory-only; the package restores cleanly from `sena-project-snapshot.json`.

### Track B — Research validation  *(priority: high, gates all claims)*

Goal: make every non-exploratory claim defensible. Deferred until A3 identifies which evidence is
actually needed, but the backlog is known:

- **B1 — Coding reliability on real data.** Exercise the corrected `krippendorffAlphaNominal`
  (canonical `n(n−1)` estimator, F4) and Cohen's κ against a genuine double-coded set; wire the
  0.6/0.8 gates into the reliability dashboard as a hard export gate.
- **B2 — Parity expansion.** Grow jENA/rENA and jSNA/R-`sna`+igraph parity fixtures beyond the
  bundled cases (more topologies, directed/weighted, larger n) without overstating equivalence
  beyond tested APIs.
- **B3 — Uncertainty & stability.** Document window-size / normalization / α·β·γ sensitivity and
  bootstrap/permutation behavior on *valid independent units* (student/group/session — **not** turns
  or edges).
- **B4 — Ethics & data governance.** Consent, purpose, retention, pseudonymization, and the
  DELICATE/Pardo-Siemens principles captured as a required review step before external sharing.

**Acceptance:** report + review packet accepted as reproducibility artifacts; limitations cleanly
separate exploratory network evidence from causal/assessment claims.

### Track C — Human–AI SENA (v2 actor–event model)  *(priority: strategic / flagship)*

Goal: extend SENA's defensible contribution from person–person to a **typed actor–actor–epistemic
event system** that can represent Human–Human, Human–AI, AI–Human (and, when warranted, AI–AI)
interaction with type, direction, role, control, and model-version provenance preserved. This is the
project's differentiating research bet, grounded in the 2026-07-11 brief and SENS/iSENS lineage.

Sequenced as the brief's P0 → P1 → P2, but **schema-safe**: the current five tables become
*compatibility views*, so the live pilot never breaks.

- **C-P0 — Make Human–AI data *semantically correct* (additive).**
  - `people` → `actors` with `actorType = human | ai_agent`; keep `people` as a derived view.
  - Add `ai_agent_runs` provenance (provider, model_snapshot, config/prompt hash, sampling params;
    unknown fields marked `not_exposed`).
  - `targetPersonIds` → `targetActorIds`; **fix the two known drifts** — expose the target column in
    the blank `coded_segments` template, and have the forum adapter write coded-segment target IDs
    (so `B_CP` stops silently degrading to the `B_PC` transpose).
  - Default to **per-group/session AI instances** to avoid a mechanical global AI super-hub.
  - Separate *content producer* from *coder* provenance.
- **C-P1 — Recomputable event ledger.** Introduce `contexts / events / event_links /
  contents+segments / code_assignments`; derive the five tables and all matrices from row-level
  evidence; add xAPI/Caliper import adapters that only "upgrade" to full SENA when social + epistemic
  join keys are present.
- **C-P2 — Research-grade Human–AI multiplex inference.** Expose `S_HH / S_HA / S_AH / S_AA` blocks
  with relation-specific normalization; separate production / exposure / **uptake** bridges;
  actor-type & model-version measurement-invariance panels (AI text is longer / denser — guard
  against it mechanically dominating `B`/`G`/`W`); nested-unit permutation/bootstrap.

**Guardrail (non-negotiable, from the brief §8):** never claim "Human–AI SENA achieved" merely by
putting an AI row in `people`; never read a `B_PC` transpose as independent code→actor uptake; never
treat turns/segments/edges as independent N.

---

## 4. Deferred track — Enterprise / institution cutover

Unchanged posture: the local enterprise runtime + acceptance-evidence artifacts (native-adapter
certification, platform-decision register, SaaS-ops readiness, go-live rehearsal) stay as *runnable
evidence*, not a production claim. Managed DB / IdP / object storage / SIEM / backup / alerting remain
platform-owner decisions until accepted through native-ready evidence. **No new enterprise scope is
proposed** until Track A produces a real target-user + governance requirement. Keep the file-backed
`.sena-enterprise/enterprise-db.json` store labelled as a local readiness adapter.

---

## 5. Academic manuscript (parallel, low-coupling)

The method/formal-analysis assets (`SENA_formula_formal_analysis.md`,
`SENA_formula_mathematical_paper.tex`) and the Human–AI brief support a paper whose defensible
contribution is *an evidence-traceable person/actor–code supra-adjacency workflow with G attribution*.
Recommend: keep the manuscript's formal model in lockstep with any Track C change to `A_fusion`
(the actor-block `S_AA` / directed-bridge extension), and cite the F4 reliability correction so
reported α matches a reference implementation.

---

## 6. Suggested sequencing

```
Week 0        Track A            Track B            Track C
────────      ──────────         ──────────         ──────────────
Hygiene   →   A1 Freeze      ┐
(commit,      A2 Script      │
docs, PRs,    A3 Real data ──┼─► B1 Reliability
gate)         A4 Polish      │   B2 Parity          C-P0 (additive,
              (schema-safe)  │   B3 Uncertainty      can start now)
                             │   B4 Ethics
                             │                      C-P1 ledger
                             └──────────────────►   C-P2 multiplex
                                                    (after B units defined)
Enterprise: no new scope until A3 yields a real user + governance need.
```

Rationale: Week 0 removes debt and makes `main`/live truthful. Track A is the shortest path to a
deliverable. Track C-P0 is deliberately front-loadable because it is additive and de-risks the
strategic bet early; C-P1/P2 wait until Track B has defined valid analysis units so inference isn't
built on turns-as-samples.

---

## 7. Verification gates & guardrails (apply to every track)

- **Gate command:** `npm run sena:pilot:verify` (stop local dev/start servers first — it refuses to
  run while a SENA server is listening).
- **Suite:** `npm test` stays green; new behavior ships with regression tests (the F1–F6 pattern).
- **Schema stability:** v1 export schemas (`sena-project-snapshot/v1`, `-runtime-bundle/v1`,
  `-review-packet/v1`, `-report/v1`, `-claim-readiness-gate/v1`, …) change by *additive fields only*;
  route schema changes through `SENA_SCHEMA_VERSIONS`.
- **Do not silently change** S, W, B/B_PC, B_CP, G, A_fusion, the directed-bridge fallback
  (ADR-0005), normalization, temporal-window semantics, or visual direction.
- **Workspace UI:** preserve `data-testid="sena-fusion-canvas"` / `temporal-fusion-arc` and the five
  workspace plot-view contract layers; deliberate redesigns must update the essential-shell source
  suite.
- **Provenance moves with every version bump:** any jENA/sna.js change updates
  `runtime-constants.ts` + the exact-string test expectations together.

---

## 8. Open decisions for Peter

1. **Track C timing** — start C-P0 (`actors`/`actorType`, adapter fixes) in parallel with Track A
   now, or hold all of C until after the first researcher walkthrough?
2. **First real datasets (A3)** — which one lesson-study transcript and which one async
   forum/LMS export should be the walkthrough corpora?
3. **PR #3** — land the Human–AI brief as `docs/research` design-of-record, or keep it a draft PR?
4. **Test-infra debt (Week 0 #4)** — fix the 58 test-file `tsc` errors + flaky audit now, or defer
   until they actually block a release?
5. **Paper timing** — write the Human–AI actor-model extension into the manuscript before or after
   C-P0 lands in code?

---

*Generated from the verified 2026-07-18 tree state: pinned registry runtimes, uncommitted F1–F6
hardening, open PRs #4/#5, draft PR #3, and the 2026-07-11 Human–AI research brief. All line/PR
references reflect that snapshot.*
