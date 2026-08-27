# SENA contaminated-branch sanitized salvage register — 2026-08-27

## Boundary

- Source branch: `docs/ledger-reconciliation-2026-08-19`
- Source head: `18d542f707e56aa9d043dd497e0efe48b540db20`
- Fresh comparison target: `main=5cdea568a053347dbc82069bde3e836cffb55cc6`
- Common base: `14bb3067adc7df6c985785d57d62a54761839555`
- Prohibited paths and known blob were treated only as identifiers. Document
  contents were not opened, extracted, displayed, copied, or used.
- This is a read-only semantic disposition. It does not authorize cherry-pick,
  remote deletion, history rewrite, deployment, or ordinary feature work while
  the P0 owner gate is open.

The branch has two unique commits, and both are patch-unique against current
main:

- `b071921e6f3e4332f2f4653ffb9739299030d136` — ledger/performance
  reconciliation;
- `18d542f707e56aa9d043dd497e0efe48b540db20` — mixed Fusion geometry,
  accessibility/browser, visual output, and prohibited documents.

Neither commit may be merged, rebased, or cherry-picked whole. Sanitized work
must be reconstructed from the exact current main in narrow owner lanes.

## Lane disposition

### SALVAGE-01 — Historical ledger/review evidence

Disposition: **review input; selectively reconstruct, never copy as current
readiness**.

| Path | Disposition |
|---|---|
| `20260802_SENA_Functional Coverage Ledger.md` | Historical input. Re-audit row by row against current main before retaining any assertion. Old test counts and base identity are stale. |
| `20260803_SENA_Test Suite Ledger.md` | Historical input. Rerun and bind current exact-SHA counts; do not import old kill/test provenance as current. |
| `docs/review-slices/2026-08-19-ledger-reconciliation-adversarial-review.md` | Worth a narrow sanitized historical dossier, with an explicit quarantine/not-on-main banner. |
| `sena-hk-template/20260802_SENA_Perf Report.md` | Superseded by the 848,000-byte budget, 12,000-byte reserve, and later source/build custody. Do not restore. |
| `sena-hk-template/lib/sena/__tests__/ops-probe-unconfigured-routes.test.ts` | One comment-only correction remains accurate and can be independently proposed after the freeze. |
| `sena-hk-template/lib/sena/enterprise/performance-budget-artifact.ts` | Superseded; the old comment would regress current facts. |

Minimum future code test:

```text
npx vitest run lib/sena/__tests__/ops-probe-unconfigured-routes.test.ts
```

Any current ledger reconstruction must consume the exact-main release receipt,
not the historical numbers in the quarantined branch.

### SALVAGE-02 — ADR-0012 circular people and collision-free dyad routing

Disposition: **genuinely unique implementation candidate; fresh-main semantic
port required**.

Core path manifest:

```text
docs/adr/0009-fusion-plane-orbit-grammar.md
docs/adr/0012-circular-people-and-collision-free-dyad-routing.md
sena-hk-template/README.md
sena-hk-template/components/sena/workspace/fusion-orbit-layer.tsx
sena-hk-template/components/sena/workspace/fusion-plane-orbit.tsx
sena-hk-template/components/sena/workspace/module-boundaries.ts
sena-hk-template/components/sena/workspace/workspace-central-plot-deck-sna-metrics-panel.tsx
sena-hk-template/lib/sena/__tests__/browser-smoke-manifest.test.ts
sena-hk-template/lib/sena/__tests__/fusion-orbit-layer.test.tsx
sena-hk-template/lib/sena/__tests__/fusion-plane-orbit-geometry.test.ts
sena-hk-template/lib/sena/__tests__/fusion-plane-parity.test.tsx
sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts
sena-hk-template/lib/sena/__tests__/orbit-layout.test.ts
sena-hk-template/lib/sena/__tests__/pilot-smoke.test.ts
sena-hk-template/lib/sena/__tests__/sena.test.ts
sena-hk-template/lib/sena/index.ts
sena-hk-template/lib/sena/orbit-layout.ts
sena-hk-template/lib/sena/production-page-contract.json
sena-hk-template/lib/sena/review-packet.ts
sena-hk-template/lib/sena/visual-encoding.ts
sena-hk-template/lib/sena/visual-grammar.ts
sena-hk-template/scripts/verify-sena-browser-smoke.mjs
sena-hk-template/scripts/verify-sena-pilot.mjs
```

The design changes one lane per direction into one curve per unordered dyad,
uses endpoint arrows for direction, changes Fusion people from hexagons to
circles, routes around people/ENA/canvas obstacles deterministically, and fails
closed to threshold/Matrix guidance when geometry cannot be drawn safely.

Mechanical apply is not acceptance. `human-concept-publication-figures.test.ts`
already conflicts, while `index.ts`, review packet, production contract, and
the verifier scripts must retain PR #20's later integrity/custody logic.

Two visual blockers must be resolved before adoption:

1. The saved dark-theme candidate used a white outer paper with a dark nested
   ENA plane and near-white labels/fallback copy. A unified paper/ink contract
   and real contrast check are required.
2. At 375 px all six dyads fall back instead of rendering. That is fail-closed,
   but mobile fallback acceptability is a research-pilot product decision, not
   an automatic pass.

Required future checks:

```text
npx vitest run \
  lib/sena/__tests__/orbit-layout.test.ts \
  lib/sena/__tests__/fusion-orbit-layer.test.tsx \
  lib/sena/__tests__/fusion-plane-orbit-geometry.test.ts \
  lib/sena/__tests__/fusion-plane-parity.test.tsx \
  lib/sena/__tests__/browser-smoke-manifest.test.ts \
  lib/sena/__tests__/pilot-smoke.test.ts \
  lib/sena/__tests__/human-concept-publication-figures.test.ts \
  lib/sena/__tests__/artifact-catalog.test.ts \
  lib/sena/__tests__/schema-registry.test.ts
```

Then run the full test/type/lint/build/pilot sequence, fresh desktop/mobile and
light/dark browser acceptance, keyboard Enter/Space and focus-outline checks,
console/page/network error checks, and strict bindable performance last.

### SALVAGE-03 — Accessibility, contrast, landmarks, and Analytics

Disposition: **mechanically applicable implementation candidate; requires real
DOM/browser/accessibility proof**.

The 46-path candidate covers public/auth/workspace pages, global CSS/layout,
shared sections/navigation/logo primitives, ENA/SENA workspace panels,
`accessibility-regressions.test.ts`, `vercel-analytics-layout.test.ts`, and
Tailwind configuration. Its intended changes include:

- global skip link and consistent `main-content` targets;
- corrected page `h1` and main-landmark structure;
- keyboard-focusable scrolling regions;
- native labels, slider value text, and pressed-state semantics;
- ink colors separated from decorative glow colors;
- light-surface contrast corrections;
- conditional `aria-controls` for the language popup;
- Analytics mounted only when `VERCEL=1`;
- the same skip target in loading and loaded shells.

The patch mechanically applies to current main, but its principal test is
source-string based. That does not prove accessible names, DOM relationships,
focus order, keyboard operation, or WCAG contrast. `app/layout.tsx` also mixes
skip-link and Analytics hunks and must be reviewed hunk by hunk.

Minimum future test slice:

```text
npx vitest run \
  lib/sena/__tests__/accessibility-regressions.test.ts \
  lib/sena/__tests__/vercel-analytics-layout.test.ts \
  lib/sena/__tests__/browser-smoke-manifest.test.ts \
  lib/sena/__tests__/nav-controls-style.test.ts \
  lib/sena/__tests__/workspace-module-boundaries.test.ts
```

Manual/browser acceptance must cover skip-link focus, unique landmarks,
focusable scrollers, pressed-state/display agreement, form labels, SVG keyboard
controls, 320/375/768/1024/1440 overflow, light/dark contrast and focus rings,
local absence of the Vercel insights request, `VERCEL=1` mounting, and zero
unexpected console/page errors.

### SALVAGE-04 — Visual evidence

Disposition: **do not port historical PNGs as current evidence**.

Twenty-two generated PNGs are iteration or acceptance snapshots. The only file
referenced by visual grammar,
`sena-fusion-plane-orbit-circular-dyads-adopted.png`, duplicates the blob of
`sena-orbit-default-1440.png`. Intermediate images should be omitted from code
salvage or archived offline as design history. After an accepted exact sanitized
geometry SHA, regenerate the final reference and update its hash. The current
dark screenshot is defect evidence, not pass evidence.

### Explicitly superseded

- `20260818_Claude Suggestions_SENA.md`: old prompts, counts, deployment
  judgments, and priorities; historical lead only.
- old performance report and budget comments: superseded by current custody and
  tighter budget.
- whole `b071921` and whole `18d542f`: prohibited as integration units.

## What this governance branch salvages

This governance branch does not import SALVAGE-01 through SALVAGE-04. It records
their path-level dispositions and preserves the security boundary. Its only
code-level semantic salvage is a separate disk-only worktree invariant: current
desktop actions and mobile navigation remain complementary at the `lg`
breakpoint. That invariant is unrelated to the contaminated branch.

## Resume gate

After provider rotation/revocation and P0 closure, each accepted salvage lane
requires its own owner, fresh-main branch, registered worktree, allowed paths,
tests, visual/human acceptance, draft PR, and exact-SHA closeout. The geometry
and accessibility candidates must not be combined merely because they shared a
contaminated commit.
