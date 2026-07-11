# Dirty Worktree Review Slices

Status: historical process guardrail, retained for future broad-dirty-tree recovery
Observed date: 2026-06-21
Observed branch: `main`
Latest refresh: 2026-06-27 on `codex/sena-enterprise-refactor`

## Why This Exists

The SENA worktree currently carries a broad mix of modified and untracked files across enterprise state, reliability, workspace extraction, schema/artifact exports, security, dependency configuration, proxy migration, and Playwright evidence output. This is a process risk rather than a confirmed SENA runtime bug: a broad dirty tree makes later Codex analysis less reliable and makes review gates hard to interpret.

During the 2026-06-21 check, broad git inspection was partially unreliable:

- `git diff --stat` had previously failed with `mmap failed: Operation timed out`.
- `git diff --name-only --no-ext-diff` also failed with `fatal: mmap failed: Operation timed out`.
- `git status --short --branch` and `git ls-files --modified --deleted --others --exclude-standard` completed, but reported `read error while indexing sena-hk-template/.eslintrc.json: Operation timed out`.

Until the tree is reduced, prefer the lighter inventory command below and review one slice at a time.

```bash
git ls-files --modified --deleted --others --exclude-standard
```

## 2026-06-27 Refresh

The worktree is still a release-process risk. The pre-closeout inventory was 245 dirty entries: 125 modified, 4 deleted, and 116 untracked. The active branch is `codex/sena-enterprise-refactor`.

Fresh gate notes:

- `npm run sena:pilot:verify -- --check-only` initially blocked while a local SENA `next-server` was listening from `sena-hk-template` on port 3005.
- After stopping that local server, `npm run sena:pilot:verify` completed successfully on 2026-06-27, including pilot smoke, full Vitest, Next production build, production server smoke, and browser smoke.
- Fresh Temporal Fusion screenshots were captured separately in `sena-hk-template/output/playwright/sena-temporal-fusion-2026-06-27-desktop.png` and `sena-hk-template/output/playwright/sena-temporal-fusion-2026-06-27-mobile.png`.
- Earlier in the 2026-06-27 refresh, `npm run sena:go-live:check` exited `blocked`; blockers included deployment-readiness backup freshness, go-live rehearsal blocked by deployment readiness, rollback drill blocked by deployment readiness and missing fresh managed backup, post-cutover monitor blockers, and capability-audit blockers for production security governance and go-live operations.
- The 2026-06-17 full gate remains historical evidence; the 2026-06-27 full gate is the current local release-handoff verification result. Later self-managed closeout evidence below supersedes the earlier blocked go-live observation.

Later 2026-06-27 self-managed closeout update: `npm run sena:self-managed:workflow` refreshed backup, restore, audit, release-gate, rollback, and active post-cutover observation evidence; `SENA_POST_CUTOVER_SAMPLE_MINUTES=1 npm run sena:post-cutover:observe -- --watch --attest` completed observation `post-cutover_b2dc7a52dcda978e4bf5386e` with 57 samples and an approved self-managed attestation; `npm run sena:go-live:check` exited successfully at `2026-06-27T16:59:26.260Z` with overall `status: "ready"`. Treat this as configured self-managed closeout evidence, not institution-owned SaaS cutover evidence.

## 2026-06-27 Checkpoint Closeout

Final closeout inventory before checkpoint was 250 dirty entries: 127 modified, 4 deleted, and 119 untracked. The extra EOF blank line in `sena-hk-template/lib/sena/api-docs.ts` was removed, global `git diff --check` exited cleanly, and `npm run sena:pilot:verify` completed successfully again after the whitespace fix.

This document is retained as the recovery map for future broad dirty worktrees. After the checkpoint closeout, do not treat the counts above as the current worktree state; re-run `git status --short` before starting a new slice. For enterprise status, re-run `npm run sena:go-live:check` because backup freshness and post-cutover evidence are time-sensitive.

## Operating Rules

1. Do not start broad feature implementation from this dirty tree until a single review slice is selected.
2. Do not use blanket staging such as `git add .`; stage explicit slice pathspecs only after that slice passes its gate.
3. Keep generated screenshots and Playwright output in the evidence-output slice unless the selected slice is explicitly visual QA.
4. If a full diff command fails with `mmap failed`, inspect the selected slice with path-limited commands or file-by-file reads.
5. After a slice is verified, preserve it as a small commit, stash, or handoff note before moving to the next slice.
6. Re-run the safe inventory command after each slice so the next reviewer starts from the real remaining tree.

## Slice 1: Enterprise State And Reliability

Primary owner lanes: SENA-A08, SENA-A09, SENA-A10

Purpose: isolate auth, team/project persistence, reliability/validation, provisioning, SCIM, governance, and enterprise state-store behavior.

Pathspecs:

```text
sena-hk-template/app/api/auth/**
sena-hk-template/app/api/sena/projects/**
sena-hk-template/app/api/sena/team/**
sena-hk-template/app/api/sena/provisioning/**
sena-hk-template/app/api/sena/scim/**
sena-hk-template/app/api/sena/notifications/**
sena-hk-template/app/api/sena/reliability/**
sena-hk-template/app/api/sena/validation/**
sena-hk-template/lib/sena/enterprise.ts
sena-hk-template/lib/sena/enterprise-postgres.ts
sena-hk-template/lib/sena/enterprise/**
sena-hk-template/lib/sena/analysis-run.ts
sena-hk-template/lib/sena/reliability.ts
sena-hk-template/lib/sena/reliability-api.ts
sena-hk-template/lib/sena/reliability-adapters.ts
sena-hk-template/lib/sena/inference.ts
sena-hk-template/lib/sena/scim.ts
sena-hk-template/lib/sena/__tests__/enterprise*.test.ts
sena-hk-template/lib/sena/__tests__/ops-governance-response-builders.test.ts
```

Observed dirty files include auth routes, project/team routes, provisioning and SCIM routes, enterprise facade and domain modules, reliability and validation helpers, and enterprise boundary tests.

Verification gate:

```bash
cd sena-hk-template
npm run test -- lib/sena/__tests__/enterprise-module-boundaries.test.ts lib/sena/__tests__/enterprise.test.ts lib/sena/__tests__/ops-governance-response-builders.test.ts
```

Exit criteria:

- Enterprise API routes keep domain imports under `lib/sena/enterprise/*` rather than regressing to the monolithic facade.
- File-backed state, CSRF/session behavior, service-token separation, redaction, reviewer sign-off, reliability, and validation history remain covered.
- Any route behavior change that affects public contracts is handed to the API contract lane before final merge.

## Slice 2: Workspace Extraction

Primary owner lanes: SENA-A06, SENA-A15

Purpose: isolate the workspace UI extraction, Temporal Fusion Arc module split, layout helpers, and workspace API/client boundaries.

Pathspecs:

```text
sena-hk-template/components/WorkspacePreview.tsx
sena-hk-template/components/sena/SenaFusionWorkspace.tsx
sena-hk-template/components/sena/workspace/**
sena-hk-template/app/workspace/**
sena-hk-template/app/login/page.tsx
sena-hk-template/app/register/page.tsx
sena-hk-template/lib/sena/__tests__/workspace-module-boundaries.test.ts
sena-hk-template/lib/sena/__tests__/workspace-fusion-layout.test.ts
```

Observed dirty files include `SenaFusionWorkspace.tsx`, workspace enterprise action/contract helpers, new `fusion-layout.ts`, new `temporal-fusion-arc.tsx`, and workspace boundary tests.

Verification gate:

```bash
cd sena-hk-template
npm run test -- lib/sena/__tests__/workspace-module-boundaries.test.ts lib/sena/__tests__/workspace-fusion-layout.test.ts
npm run sena:pilot:browser-smoke
```

Exit criteria:

- `SenaFusionWorkspace.tsx` does not regain direct `/api/...` fetch sprawl or enterprise request-token state.
- `data-testid="temporal-fusion-arc"` remains present in the extracted Temporal Fusion Arc module.
- The adopted visual grammar remains A1 Inner Solid Mesh and Temporal Fusion Arc Plan -> Teach -> Reflect.
- Fresh screenshots, if generated, are recorded in the evidence-output slice rather than mixed into the code-review slice.

## Slice 3: Dependency, Security, And Proxy

Primary owner lanes: SENA-A10, SENA-A11, SENA-A14

Purpose: isolate dependency/config churn, lint migration, Next proxy/middleware migration, security headers, analytics layout, and security posture checks.

Pathspecs:

```text
sena-hk-template/package.json
sena-hk-template/package-lock.json
sena-hk-template/.eslintrc.json
sena-hk-template/eslint.config.mjs
sena-hk-template/next.config.mjs
sena-hk-template/next-env.d.ts
sena-hk-template/tsconfig.json
sena-hk-template/middleware.ts
sena-hk-template/proxy.ts
sena-hk-template/app/layout.tsx
sena-hk-template/lib/sena/api-helpers.ts
sena-hk-template/lib/sena/ops-api.ts
sena-hk-template/lib/sena/__tests__/security-dependencies.test.ts
sena-hk-template/lib/sena/__tests__/vercel-analytics-layout.test.ts
sena-hk-template/vendor/sna-js/package.json
```

Observed dirty files include package manifests, ESLint config migration, Next config, TypeScript config, deleted `middleware.ts`, new `proxy.ts`, layout, API helper/security code, security dependency tests, and Vercel analytics layout tests.

Verification gate:

```bash
cd sena-hk-template
npm run test -- lib/sena/__tests__/security-dependencies.test.ts lib/sena/__tests__/vercel-analytics-layout.test.ts
npm run lint
npm run build
```

Exit criteria:

- Dependency and lockfile changes are explainable before other slices rely on the toolchain.
- Next proxy/middleware behavior preserves required security response headers and route coverage.
- Lint/build changes are not hiding runtime, API, or schema regressions.

## Slice 4: Evidence Output, Schema, And Publication Artifacts

Primary owner lanes: SENA-A07, SENA-A11, SENA-A14, SENA-A15

Purpose: isolate schema registry changes, artifact catalog mapping, runtime bundle/review-packet/publication output, API docs, pilot verification scripts, and Playwright evidence files.

Pathspecs:

```text
sena-hk-template/app/api/sena/analyze/**
sena-hk-template/app/api/sena/import/**
sena-hk-template/app/api/sena/uploads/**
sena-hk-template/app/api/sena/exports/publication/**
sena-hk-template/app/api/sena/governance/**
sena-hk-template/app/api/sena/ops/**
sena-hk-template/lib/sena/api-docs.ts
sena-hk-template/lib/sena/artifact-catalog.ts
sena-hk-template/lib/sena/data-contract-audit.ts
sena-hk-template/lib/sena/demo-verification.ts
sena-hk-template/lib/sena/demo-walkthrough.ts
sena-hk-template/lib/sena/development-plan.ts
sena-hk-template/lib/sena/ena-manifest.ts
sena-hk-template/lib/sena/excel-workbook.ts
sena-hk-template/lib/sena/fusion-math.ts
sena-hk-template/lib/sena/import-adapters.ts
sena-hk-template/lib/sena/method-protocol.ts
sena-hk-template/lib/sena/ops-api.ts
sena-hk-template/lib/sena/pilot-readiness.ts
sena-hk-template/lib/sena/project-handoff.ts
sena-hk-template/lib/sena/publication-export.ts
sena-hk-template/lib/sena/report.ts
sena-hk-template/lib/sena/review-packet.ts
sena-hk-template/lib/sena/runtime-bundle.ts
sena-hk-template/lib/sena/runtime-consistency.ts
sena-hk-template/lib/sena/schema-registry.ts
sena-hk-template/lib/sena/sna-manifest.ts
sena-hk-template/lib/sena/snapshot.ts
sena-hk-template/lib/sena/temporal-runtime.ts
sena-hk-template/lib/sena/visual-grammar.ts
sena-hk-template/lib/sena/__tests__/artifact-catalog.test.ts
sena-hk-template/lib/sena/__tests__/schema-registry.test.ts
sena-hk-template/lib/sena/__tests__/sena.test.ts
sena-hk-template/scripts/verify-sena-pilot.mjs
sena-hk-template/output/playwright/**
```

Observed dirty files include schema registry tests, new artifact catalog test/module, export/report/snapshot/runtime-bundle/review-packet/publication code, pilot verification script changes, API docs, import/upload/analyze/export routes, governance/ops routes, and Playwright PNG evidence.

Verification gate:

```bash
cd sena-hk-template
npm run test -- lib/sena/__tests__/schema-registry.test.ts lib/sena/__tests__/artifact-catalog.test.ts lib/sena/__tests__/sena.test.ts
npm run sena:pilot:smoke
npm run sena:pilot:verify
```

Exit criteria:

- Touched schema-versioned contracts use `SENA_SCHEMA_VERSIONS` unless an external literal boundary is explicitly documented.
- Artifact catalog filenames, schema labels, content keys, review-packet contents, and completeness checks remain synchronized.
- Publication exports preserve runtime provenance, matrix fingerprints, guardrails, coding-reliability status, claim-readiness status, and source snapshot evidence.
- Playwright outputs are fresh evidence for the selected review, not stale screenshots mixed into an unrelated slice.

## Cross-Slice Notes

- `AGENTS.md` is coordination memory. Do not mix it into a feature slice unless the slice intentionally changes project ownership or process rules.
- `sena-hk-template/lib/sena/api-docs.ts` can cross evidence-output and API contract review; if route shapes changed, add the API docs test to the selected gate.
- `sena-hk-template/lib/sena/ops-api.ts` can cross dependency/security and evidence-output; review it with whichever slice owns the behavior change, and mention the overlap in the handoff.
- If a slice needs the full release gate, stop any local `next dev` or `next start` processes before running `npm run sena:pilot:verify`.
