# SENA Test Suite Campaign — Ledger

Started 2026-08-03. This file is the campaign's memory: every loop iteration reads it first
and writes its result here last. Full iteration protocol:
`sena-hk-template/.claude/commands/tests-loop.md` (`/tests-loop`). Findings are numbered
Q1, Q2, … (Q-series), mirroring the H-series (bug) and P-series (perf) conventions.
Backlog rows are TL-<lane><n>; historical escape classes are EC-<n>.

**ACTIVE MUTATION: none**
(Last probe block: 2026-08-03 TL-B1 K1–K6. `lib/sena/api-route-facts.ts` restored to its
pre-mutation `git hash-object` `865eb4c44e2cb32e259f2e4d8bdbddd0d36d8190` and verified by
`git diff --quiet`; `api-route-coverage.ts` and `api-route-reconciliation.test.ts` restored
from scratchpad copies and verified by `cmp -s`; the two probe route files
`app/api/sena/ops/probe-kill{,-tsx}/` deleted and their absence asserted. Each probe opened
and closed inside a single shell invocation — no mutation ever spanned a tool call.)
(Mutation-probe slot. Before applying any probe: file path, pre-mutation
`git hash-object`, the mutation's unified diff, expected post-mutation hash, status
PLANNED/APPLIED. Restore → set back to `none`. Step 0 of every iteration checks this
slot first; recovery dispatches on the current hash — see the command file.)

**Protocol, in one line.** One slice per iteration: kill list → check at the highest
oracle tier → every kill red for the predicted reason → green → named gate → ratchet.
DONE requires all three of: kills proven, check green, gate named. Green-on-green is never
evidence; an existing check with no demonstrated kill counts as uncovered.

**Row statuses:** `open` / `IN-PROGRESS <date> (next: …)` / `DONE <date> (O<n>, kills: …,
gate: …)` / `REJECTED (negative result: …)` / `BLOCKED-PETER (question: …)` / `N-A
(reason: …)`. Oracle tiers: O3 external oracle, O2 executed behavior, O1 two-way wiring
cross-check, O0 source-text grep (sanctioned only for structure-subject pins).

**Environment caveats** (this tree): shared clone with a concurrent Codex agent — never
`git add -A`, never revert foreign dirty files; `pgrep -fl 'vitest|next|vite-node|tsc'`
must show nothing foreign before runs or probes; run gates unsandboxed (iCloud-dataless
node_modules); absolute paths (Bash cwd resets); never run vitest from a
`.claude/worktrees` checkout. Scoped runs: `npm test -- lib/sena/__tests__/<file>`.

---

## Ratchet table

Baselines measured 2026-08-03 (commit 36f7b3d, read-only recon; commands pinned so any
session re-measures identically). Numerator/denominator pairs — foreign additions show up
as denominator drift. Numbers move the right way or the exception gets a Q-finding.

| # | metric | baseline | target | measurement command (run from sena-hk-template) |
|---|--------|----------|--------|--------------------------------------------------|
| R1 | route handlers imported by no test | 7 / 63 (+favicon N-A) | 0 | `find app -name route.ts -not -path '*worktrees*'` vs `grep -rhoE "app/api[a-zA-Z0-9/._[\]-]*" lib/sena/__tests__ lib/ena/__tests__ \| sort -u` |
| R2 | route-test files with ≥1 4xx assertion | 8 / 35 | all with a mutating or auth-guarded handler | `grep -El 'toBe\(4[0-9]{2}\)' lib/sena/__tests__/*-route.test.ts \| wc -l` / `ls lib/sena/__tests__/*-route.test.ts \| wc -l` |
| R3 | non-sanctioned O0-only test files | 5 (see TL-D5 for the full 13-file audit) | 0 | list in TL-D5; classification maintained there |
| R4 | bare `toBeTruthy()` in sena.test.ts | 19 | 0 | `grep -c 'toBeTruthy()' lib/sena/__tests__/sena.test.ts` |
| R5 | EC classes with a proven, gated kill | 0 / 13 | 13 / 13 | count of EC rows marked DONE below |
| R6 | full `npm test` wall time (quiet box) | **80.9 s** (1208 passed / 1 skipped; Apple M4 Pro 12-core, 48 GB, node v24.15.0, commit 2627972, quiesce-checked clear) | no silent growth; regressions get a Q-finding | time a full `npm test`; record machine + commit |

R1 baseline list (untested handlers): `app/api/ena/run`, `app/api/sena/governance/audit`,
`app/api/sena/provisioning`, `app/api/sena/scim/v2/Users`, `…/Users/[resourceId]`,
`…/Groups`, `…/Groups/[resourceId]`. (`app/favicon.ico/route.ts` = N-A.)
R2 baseline list (files with 4xx): auth-register, collaboration-stream, go-live-rehearsal,
platform-decisions, sso, server-job-ops, server-job-worker, uploads.
R3 baseline list (upgrade-needed O0): nav-controls-style, theme-default,
vercel-analytics-layout, workspace-essential-shell (desktop-mode strings), home-routing.
Sanctioned structure pins (counted separately, not in R3): workspace-module-boundaries,
enterprise-module-boundaries, analysis-api-boundaries, sena-kernel-boundary,
security-dependencies, schema-registry (walks sources by design).

## Escape-class map (EC-rows)

Every historical escape class must end the campaign with a named permanent tripwire and a
recorded kill, or an explicit owner (smoke step / listed manual check). History: F-series
2026-07-18, G-series 2026-07-31, H-series 2026-08-01 bug reports; perf P-series.

| EC | class (history) | current tripwire | status / owed work |
|----|-----------------|------------------|--------------------|
| EC-1 | test-invisible type errors (58 latent; F3's 4; H27's 3) | build-gate.yml + .githooks/pre-push run `tsc --noEmit` | open — kill: seed a type error in a test file, watch tsc red (TL-G1) |
| EC-2 | half-committed non-building main (2026-07-18, 2026-07-31) | build-gate.yml builds the pushed ref | open — verify workflow + hooksPath active per clone (TL-G1) |
| EC-3 | warning-channel loss at sibling call sites (H1 P0, H11 P1, H22, H23) | H22 parity test only | open — call-site exhaustiveness suite (TL-A2) |
| EC-4 | ingestion identity/derivation on messy input (F1, F2, F5, F6; NaN matrixTotal) | per-bug regression fixtures | open — fuzz harness (TL-A1) + messy corpus (TL-A9) |
| EC-5 | cross-fix interaction violating ADR prose (G1 fabricated actors) | none — ADR-0006 rule is prose | open — executable ADR invariants (TL-A3) |
| EC-6 | non-canonical statistics (F4 alpha approximation) | alpha: hand-computed 0.5333 golden; ENA: rENA parity | open — kappa/Welch/Mann-Whitney oracles (TL-C6) |
| EC-7 | degenerate-input perfect scores (kappa 1 on <2 pairable units) | no-evidence floor + tests (28b47f2) | open — kill audit (TL-A6) |
| EC-8 | vacuous-pass tests/gates (H13, H28, H10, perf-T3 zero-byte) | fixed instances carry vacuity guards | open — systematic audit of gate-like tests (TL-A4) |
| EC-9 | missing-data semantics (empty cell counted as applied) | three-way-semantics regression tests (55d3894/28b47f2) | open — kill audit (TL-A5) |
| EC-10 | geometry/visual escapes invisible to node/jsdom (H5, H9, three overflow bugs) | zoom tests for the two fixed elements | open — owned by smokes (TL-F5) + explicit manual list; never weak vitest proxies |
| EC-11 | page-import holes (/workspace/ena; broke main twice) | **route half covered**: api-route-reconciliation.test.ts (TL-B1, 6 kills, `npm test`) | open — page half still uncovered: TL-F1 smoke, TL-G5 page-inventory tripwire |
| EC-12 | queued/202-path state bugs (dataset clobber; cross-tenant write) | server-job-ops + worker-contract tests (28b47f2) | open — kill audit + full worker round-trip (TL-A8) |
| EC-13 | error masking (misleading import/parse messages; G2, 55d3894) | message-shape fixes landed | open — message-specificity tests + kill audit (TL-A7) |

## Backlog (TL-rows, lane order = priority)

### Lane A — escape-class tripwires
- TL-A1 Recommit the seeded fuzz/property harness as a permanent suite (2026-07-18
  campaign: ~800 random datasets + 800 statistical cases + 400 snapshot round-trips + 14
  degenerate probes; finiteness/range/audit-verified invariants; fixed seeds, modest
  default N, env-scaled knob proposal → Peter list). No new deps needed. — open
- TL-A2 Warning-channel call-site exhaustiveness: enumerate every
  parseSenaCsv/parseCoderAnnotationsCsv consumer; assert ragged-input warnings surface at
  each user-visible path (browser, enterprise, queued); consider §4.5's
  withSourceWarnings() helper. Kills: re-drop the fold at each call site. — open
- TL-A3 Executable ADR invariants: ADR-0006 never-invent-a-target (roster members trace to
  a declared row or disclosed derivation); ADR-0005 B_CP transpose fallback; S/B_CP
  identity-resolution parity. Kill: replay G1's fabricated-actor repro.
  — **BLOCKED-PETER 2026-08-03 (question: Peter decision 13 — is the interactions-target
  derivation an ADR-0006 D1 violation to fix, or intended behaviour to disclose?)**
  Recon + an executed repro found that **the honest invariant is RED against current code**
  (Q9). Do not write this row's test until 13 is answered: the ADR-0006 clause can be
  phrased two ways, and the tempting phrasing — "traces to a declared row **or a disclosed
  derivation**" — is satisfied by the current behaviour, because a warning *is* emitted.
  That phrasing yields a green test certifying the exact behaviour ADR-0006 forbids: a
  textbook EC-8 vacuous pass, inside the row whose whole purpose is closing EC-5. Write the
  honest clause, take the red, and let the fix be a decided semantics change — not a test
  weakened to fit the code. Fixing it is an S-layer semantics change (roster membership, a
  social edge, person counts, S dimensions, matrix fingerprints), which rule 4 reserves and
  which ADR-0005:48 says needs coordinated SENA-A02/A07/A13/A15 review. — BLOCKED-PETER
- TL-A4 Vacuity-guard audit of gate-like tests (H13/H28/H10/perf-T3 pattern): sweep for
  precondition-less asserts; add guards. — open
- TL-A5 Missing-data semantics kill audit (EC-9): probe empty-cell→applied remap; tests
  must fire. — open
- TL-A6 Degenerate-denominator kill audit (EC-7) + sweep for other denominator-0
  conventions minting perfect scores. — open
- TL-A7 Error-masking specificity tests (EC-13): contract-shaped JSON routing, ragged-row
  truncation message; kills: reintroduce the masks. — open
- TL-A8 Queued-path end-to-end: 202 receipt → worker status update with uploadWarnings →
  registry transition → UI-visible state; plus Postgres-mirror warningCount
  NOT-NULL-vs-optional divergence tripwire. — open
- TL-A9 Messy-input fixture corpus: 'Last, First' rosters, noise-line transcripts,
  id-vs-name reply schemes, table-subset uploads, exercised across adapters (EC-4). — open

### Lane B — route auth/negative matrix
- TL-B1 Manifest-vs-filesystem reconciliation test: walk `app/api/**/route.ts` vs
  SENA_IMPLEMENTED_API_ROUTES, both directions (kills Q1's self-fulfilling check).
  — **DONE 2026-08-03 (O1** two-way wiring cross-check — one side is `readdirSync`, which is
  the whole point; **kills: 6/6 proven red**, see below; **gate:** `npm test`, itself run by
  `sena:pilot:verify`'s "Full test suite" step — confirmed collected, file appears in the
  full run at 113 files / 1,216 tests**)**.
  Landed `lib/sena/__tests__/api-route-reconciliation.test.ts` (8 tests, **89 ms** solo) plus
  a new declaration module `lib/sena/api-route-coverage.ts`.
  **It found a live escape on first run — see Q8:** `app/api/sena/ops/jobs/worker/route.ts`
  ships undeclared, exactly the hole Q1 predicted, while `api-docs.test.ts` stays green.
  Kills proven (each red for the predicted reason, each restored byte-exact, hashes in the
  ACTIVE MUTATION block):
  - **K1** new undeclared `app/api/sena/ops/probe-kill/route.ts` → `declares or explicitly
    excludes every route file on disk` red: `"app/api/sena/ops/probe-kill/route.ts:
    /api/sena/ops/probe-kill is in neither the facts manifest nor
    SENA_UNDOCUMENTED_API_ROUTES"`. This is EC-11's exact escape replayed.
  - **K2** rename `path: "/api/sena/ops/cdn"` → `"/api/sena/ops/cdn-v2"` in
    api-route-facts.ts → **fires in BOTH directions from one mutation** (the strongest kill
    here): direction 1 `"app/api/sena/ops/cdn/route.ts: … is in neither …"` and direction 2
    `"sena-ops-cdn: declared sourceFile app/api/sena/ops/cdn-v2/route.ts does not exist"`.
  - **K3a** point an exclusion entry at an already-documented route → `"/api/sena/ops/cdn:
    now documented — remove it from SENA_UNDOCUMENTED_API_ROUTES"`.
  - **K3b** point an exclusion entry at a path not on disk → `"/api/sena/ops/deleted-route:
    excluded but no longer on disk"`. K3a+K3b together are what stop the exclusion list
    becoming a second self-fulfilling artifact — the failure mode Q1 is about.
  - **K4** declare `methods: ["GET"]` for `/api/sena/ops/jobs` (disk exports GET+POST) →
    `"/api/sena/ops/jobs: manifest=[GET] disk=[GET,POST]"`.
  - **K5 (vacuity probe)** sabotage the walker's extension set so it collects nothing → the
    guard fires FIRST as designed: `AssertionError: expected 0 to be greater than or equal
    to 60`. Without that guard every other assertion in the file would have passed on an
    empty set — the H13/H28/perf-T3 pattern.
  - **K6** author a route as `route.tsx` instead of `route.ts` → still caught. The recon
    flagged that a walker matching only `entry === "route.ts"` would let a `.tsx` route hide
    completely; the collector matches `route.{ts,tsx,js,jsx,mjs}` for that reason.
  Deliberately NOT done: adding the worker route to SENA_API_ENDPOINT_FACTS. That publishes
  an internal queue callback in the documented surface and needs an auth mode that does not
  exist in the `SenaApiAuthMode` union — a product decision, not a test fix (Peter 12 / Q8).
  — DONE
- TL-B2 Parameterized negative matrix over the route manifest: 401 no session; CSRF 4xx on
  mutating methods; 400 malformed body; one 429 HTTP-status test (none exists). ≥1 kill
  per property class. — open
- TL-B3 `/api/ena/run` route-handler tests (auth gating, EnaInputError→400). — open
- TL-B4 SCIM v2 Users/Groups(+[resourceId]) CRUD route tests with bearer-auth negatives
  (model: scim-route.test.ts). — open
- TL-B5 `/api/sena/provisioning` route tests (bearer auth, POST dry-run, GET). — open
- TL-B6 `/api/sena/governance/audit` route tests (HTTP boundary; lib already covered). — open
- TL-B7 `/api/sena/ops/native-adapters` GET route test. — open
- TL-B8 Rate-limit negatives for password-reset and sso routes (login/register have them). — open

### Lane C — untested math-adjacent modules
- TL-C1 fusion-math.ts direct goldens (independent derivation; pin ADR-0005 effects). — open
- TL-C2 temporal-runtime.ts behavioral tests (window builder; matrixTotal finiteness). — open
- TL-C3 jena-handoff.ts + jsna-handoff.ts (back FA18-02 manifest exports). — open
- TL-C4 visual-encoding.ts unit tests. — open
- TL-C5 enterprise/postgres-url-env.ts unit tests. — open
- TL-C6 Canonical-statistics oracles: Cohen's kappa, Welch t, Mann-Whitney vs
  hand-computed/R-fixture values (EC-6; R-generator precedent in scripts/). — open

### Lane D — O0→O2 upgrades and kill audits of existing checks
- TL-D1 use-workspace-desktop-mode: executed hook test (matchMedia stub, 1280px breakpoint,
  listener add/remove) replacing string grep. — open
- TL-D2 theme-default + nav-controls-style → rendered-behavior pins (footer.test.tsx
  pattern). — open
- TL-D3 ena-network-parity: pin 1–2 hand-computed edge means (method-independent oracle). — open
- TL-D4 sena.test.ts bare-truthy strengthening (R4: 19 → 0). — open
- TL-D5 Full O0 audit: classify all ~13 source-grep files sanctioned-vs-upgrade; maintain
  R3 from it. — open
- TL-D6 Kill audits of existing crown-jewel checks (sena-golden-operators,
  enterprise-capability-audit, import-route, browser-smoke-manifest): are they killable at
  all, and for the predicted reasons? — open

### Lane E — suite health
- TL-E1 enterprise.test.ts TOTP: real Date.now → vi.setSystemTime (Q2). — open
- TL-E2 conference-load-rehearsal.test.ts: real setTimeout/duration loops → deterministic. — open
- TL-E3 Runtime baseline: per-file slowest list on a quiet box; R6 baseline; split
  proposals for sena.test.ts (5,605 lines), workspace-module-boundaries (7,788),
  enterprise-capability-audit (8,779) as test-only refactors. — open
- TL-E4 Environment-declaration guard against the 'document is not defined'
  collection-failure class (2026-07-31 §0 incident). — open
- TL-E5 Pin that tsconfig keeps test files inside `tsc --noEmit`'s scope (the EC-1 gate
  silently dies if tests get excluded). — open
  **(recon done 2026-08-03, not yet implemented):** confirmed empirically that all 112 test
  files are currently in scope, via a wide `include: ["**/*.ts","**/*.tsx"]` + narrow
  `exclude: ["node_modules"]`. **Nothing pins this.** The only test that reads tsconfig.json
  at all is `sena-kernel-boundary.test.ts:21-23,44`, and it asserts one key
  (`compilerOptions.paths["@sena/kernel"]`) — so adding an `exclude` entry for tests would
  pass every existing check and leave `tsc --noEmit` green-but-blind, which is exactly the
  EC-1 failure mode. Land it as a **behavioral** pin, not a JSON string-compare: `typescript`
  is already a direct dependency (5.9.3), and its compiler API resolves the real gate's root
  file set in ~16 ms, so assert the on-disk test files are inside the resolved set in both
  directions. No test imports `typescript` today — that import is the one novel move. Kill:
  add `"**/__tests__/**"` to `exclude` in an in-memory clone of the parsed config and watch
  the resolved set lose all 112 files.

### Lane F — smoke-only surfaces (coordinate with Functional Ledger FA-rows)
- TL-F1 /workspace/ena browser smoke script (FA-13's 20 rows; register in
  verify-sena-pilot.mjs + browser-smoke-manifest cross-check, both directions). — open
- TL-F2 /reset-password smoke (request + confirm; FA-11). — open
- TL-F3 Static-pages sweep smoke: /, /workspace, /docs, /platform, /method, /demo,
  /privacy, /terms, /security, /responsible-ai (render + key links). — open
- TL-F4 404/500 served-behavior checks (currently artifact-presence only). — open
- TL-F5 Horizontal-overflow tripwire at 320/375/768 beyond /workspace/sena (three shipped
  overflow bugs; EC-10). — open

### Lane G — gate integrity
- TL-G1 Gate liveness: `git config core.hooksPath` = .githooks in this clone; build-gate.yml
  present/active; `node scripts/verify-sena-pilot.mjs --check-only` passes; EC-1 kill
  (seeded type error goes red under tsc). — open
- TL-G2 Extend machine-checked visualChecks beyond the current 14 of 243 in
  production-page-contract.json — drive assertions from the JSON, not hand lists. — open
- TL-G3 Run `npm run lint`; triage findings (fixing is sanctioned; *gating* lint is a Peter
  decision). — **DONE 2026-08-03** (triage row, no check landed, so no oracle tier / no
  kill applies; gate: none — lint remains ungated, Peter decision 6, unchanged). Baseline
  was **exit 1, 704 problems (627 errors, 77 warnings)**. Triage: 703 of 704 were generated
  code, not first-party — `eslint.config.mjs` ignored `.next/**` only at the app root, so
  `eslint .` descended into `.claude/worktrees/{awesome-albattani,gifted-meitner}` (2.4 GB
  of full checkouts) and linted their compiled `.next` chunks: 626 errors
  (react-hooks/rules-of-hooks 378, @next/next/no-assign-module-variable 140, unused-vars
  78) and all 77 warnings (unused eslint-disable directives inside bundled vendor code).
  Fixed by ignoring `**/.claude/worktrees/**` + `**/.worktrees/**`, mirroring
  `vitest.config.ts`'s exclusions for the same reason (see Q6). Exactly **one** first-party
  error: `react-hooks/preserve-manual-memoization` at
  `components/sena/workspace/ena-space-plot.tsx:69` — the overlay `useMemo` declared
  `layers.bridge` / `layers.social` but the rule's compiler analysis inferred the whole
  `layers` object, a broader dependency than declared. Fixed by reading both booleans into
  scalars before the memo so inferred and declared dependencies match; behaviour is
  unchanged and `ena-space-plot-parity` + `ena-low-rank` stay green. Widening the memo to
  `layers` would also have silenced the rule but changed behaviour — `layers` is a
  pass-through prop with no identity guarantee, so the overlay would rebuild every render.
  **Scope note (no perf claim):** `experimental.reactCompiler` is NOT enabled in
  `next.config.mjs`, so React Compiler does not run in the build; the rule ships with
  eslint-plugin-react-hooks 7.1.1 and performs its compiler analysis at lint time only.
  This fix therefore buys a green gate and a correct dependency list, **not** a runtime
  optimization — no P-series cross-reference is owed. (The commit body of 2627972 says the
  compiler "skipped optimizing the component entirely"; that is true of the lint-time
  analysis only, and this row is the precise statement.) Now `npm run lint` exits 0.
  Commits: 2627972. — DONE
- TL-G4 Browser-smoke granularity: per-step pass/fail reporting inside the hand-rolled
  scripts (no dependency change). — open
- TL-G5 Page-inventory tripwire: every `app/**/page.tsx` is smoke-covered or explicitly
  listed as uncovered (EC-11's "new page repeats the escape silently" hole). — open
  **(recon done 2026-08-03, not yet implemented — start here, no re-exploration needed):**
  15 `page.tsx` on disk under `app/`; no route groups, no dynamic segments, no parallel
  routes. Exactly 3 are browser-smoke-covered (`/workspace/sena`, `/register`, `/login`);
  12 are uncovered. **No test imports any page component**; the only page-adjacent test is
  `home-routing.test.ts`, which `readFileSync`s `app/page.tsx` as text (O0).
  `app/workspace/ena/page.tsx` — the file that broke main twice — is imported by nothing.
  Design it as a THREE-way cross-check or it lands as Q1's dead check again: side A =
  `readdirSync` walk (filesystem truth), side B = a new `lib/sena/page-inventory.ts`
  declaration, side C = `readFileSync` of the actual smoke scripts + `verify-sena-pilot.mjs`
  to prove each claimed coverage is real. Derive the 3 covered routes from
  `SENA_BROWSER_SMOKE_MANIFEST` rather than restating literals (a second copy is a future
  drift bug). **Trap the recon hit:** `/workspace/sena` does NOT appear in
  `verify-sena-browser-smoke.mjs` — the literal lives in `verify-sena-pilot.mjs`'s
  `verifyProductionServerSmoke()`, so a naive "grep the smoke script for the route"
  false-negatives on the best-covered page. Kills available: new undeclared page; delete a
  declared page; delete a `page.goto` line from a smoke (proves non-self-fulfilling); flip a
  row to `coverage: "browser-smoke"` while writing no smoke (the lie kill); sabotage the
  walker predicate (vacuity). Root the walk at `path.join(process.cwd(), "app")` and skip
  `.claude`/`.worktrees` defensively.

## Q-series findings

- Q1 (2026-08-03) api-docs.test.ts's "documents every route" check is self-fulfilling:
  both sides derive from hand-maintained api-route-facts.ts; a new undeclared route file
  cannot fail it. → TL-B1.
- Q2 (2026-08-03) enterprise.test.ts derives TOTP codes from real Date.now (line ~61):
  flaky at 30-second step boundaries. → TL-E1.
- Q3 (2026-08-03) RouteMemoryPostgres (regex SQL, localeCompare ordering) can diverge from
  real Postgres; real semantics verified only by the env-gated live test. → Peter list
  (live-test cadence).
- Q4 (2026-08-03) The 2026-07-18 ~2,000-case seeded fuzz harness was session-ephemeral and
  never committed; it would have tripwired the NaN matrixTotal class fixed only on
  2026-08-02. → TL-A1.
- Q5 (2026-08-03) The vitest suite runs in no CI by documented design (build-gate.yml
  header); suite regressions surface only on manual runs. → Peter list (vitest-in-CI).
- Q6 (2026-08-03) `npm run lint` was structurally unusable, not merely ungated: the flat
  config's ignores were app-root-relative (`.next/**`), so `eslint .` linted the compiled
  `.next` chunks inside the two `.claude/worktrees` checkouts and buried the single real
  first-party error under 703 generated-code problems. A gate nobody can read the output of
  is worse than one that does not run — the signal existed the whole time and was
  undiscoverable. Fixed in 2627972 (TL-G3). Generalized lesson for this campaign: *ignore
  lists are per-tool and drift independently* — `vitest.config.ts` already excluded the
  worktrees, `eslint.config.mjs` did not. Any future tool pointed at the repo root (a
  formatter, a type-coverage tool, a dead-code scanner) inherits the same hazard.
  → no TL-row owed; noted for TL-D5's audit and as a standing caveat.
- Q7 (2026-08-03) `npm audit` reported 4 high-severity advisories on a tree whose gates
  were all green — no gate in this project looks at dependency advisories at all.
  `npm audit fix` (lockfile-only; package.json unchanged) cleared next 16.2.10 → 16.2.12
  and postcss → 8.5.25, including GHSA-6gpp-xcg3-4w24 (middleware/proxy bypass), which
  matters here because `proxy.ts` is the sole source of every security header the app
  sends. 2 high remain (sharp <0.35.0 libvips CVEs, and next's dependency on vulnerable
  sharp); clearing them needs `npm audit fix --force` (sharp@0.35.3, breaking major) =
  a dependency decision reserved for Peter. Commit 194e773. → Peter list (item 10).

- Q8 (2026-08-03) **Live escape, found by TL-B1's check on its first run.**
  `app/api/sena/ops/jobs/worker/route.ts` exists and ships — it exports POST, sets
  `runtime = "nodejs"`, verifies an HMAC over the request body against
  `SENA_JOB_QUEUE_SECRET`, and has its own suite at `server-job-worker-route.test.ts` — but
  it has no entry in `SENA_API_ENDPOINT_FACTS`, and therefore none in
  `SENA_IMPLEMENTED_API_ROUTES`, none in the generated OpenAPI document, and none in
  `/api/sena/docs`. Its three cluster siblings (`ops/jobs`, `ops/jobs/worker-contract`,
  `ops/jobs/worker-heartbeat`) and `ops/jobs/probe` are all declared, so this reads as an
  oversight, not a policy. Disk holds 61 route files; the facts manifest declares 60; the
  difference is exactly this one route, in one direction. `api-docs.test.ts` was and is
  green — precisely Q1's prediction, now demonstrated rather than argued.
  Not fixed here on purpose: declaring it would publish an internal queue callback in the
  documented API surface, and its HMAC scheme matches none of the five `SenaApiAuthMode`
  values, so declaring it also means widening that union — a wider blast radius than a test
  row should take unilaterally. Recorded instead as an explicit, anti-rot exclusion in
  `lib/sena/api-route-coverage.ts`, which the reconciliation test forbids from rotting
  (K3a/K3b). → Peter decision 12.

- Q9 (2026-08-03) **A third fabricated-actor chain survived the G1 fix — proven by an
  executed repro, not inference.** `addDerivedContractRows` (lib/sena/import.ts:475-489)
  iterates `[interaction.source, interaction.target]` and mints a `group:"Derived"` roster
  member for any unknown id, with **no `hasDeclaredRoster` gate** — while the
  `coded_segments` loop 20 lines below (import.ts:509-511) *does* gate exactly that, and its
  own comment (import.ts:496-506) states the rule it is applying: *"A target is a claim
  about an actor, not a declaration of one, so once a roster exists an unmatched target must
  stay dangling"*, citing ADR-0006 D1. An interaction's `target` is the same kind of claim —
  who someone replied to — and gets no such treatment.
  Repro (run against HEAD via `importSenaJsonContract`): declared roster `people:[P1,P2]`
  plus `interactions:[{source:P1,target:"Ghost"}]` →
  `roster after import : P1, P2, Ghost`, with the fabricated row
  `{"id":"Ghost","label":"Ghost","role":"Participant","group":"Derived","initials":"GH"}`
  and the single warning `people table did not include "Ghost"; derived a placeholder person
  from interactions.` That is a person count of 3 where the researcher declared 2, from a
  claim rather than a contribution.
  This is the same class as G1 (2026-07-31), which was fixed on two of its three chains —
  import.ts:510 (segments) and import-adapters.ts:440-452 (`resolveDeclaredTarget`) — while
  the S-layer chain was deliberately left open and documented as such (Bug Report lines
  78-81; enterprise.test.ts:279-282). The interactions-loop chain above appears not to have
  been enumerated at all. Related and still present: `resolvePersonIdentity`
  (import-adapters.ts:430) keeps its `?? value` pass-through, so an unresolvable
  `reply_to_author` reaches the same loop through the forum adapter.
  Not fixed here: rule 4 (math/semantics guardrail) reserves S-layer changes, and the fix
  removes a roster member *and* a social edge from affected datasets. → Peter decision 13,
  TL-A3 BLOCKED-PETER.

## Peter decisions (standing list)

PENDING — none decided:
1. Coverage provider dependency (@vitest/coverage-v8, version-matched to vitest 4.1.x).
2. DOM test infra dependency (jsdom/happy-dom + @testing-library) — components/ and app/
   have zero unit tests today, structurally.
3. Mutation-testing tooling (Stryker) — would mechanize this campaign's manual kill probes.
4. @playwright/test migration for the seven hand-rolled smokes (traces, retries, reports).
5. vitest-in-CI policy (declined by design in build-gate.yml — revisit after de-flake?).
6. Lint gating (eslint wired but gated nowhere).
7. Nightly scheduled runs (suite, fuzz at scale, live-Postgres cadence).
8. Cross-browser smokes (firefox/webkit) and visual-regression tooling.
9. Fuzz suite default N and env-scaled knob values (TL-A1 lands with a modest default).
10. `sharp` 0.34.x → 0.35.3 to clear the libvips CVEs (breaking major; `npm audit fix
    --force`). Also decides next's transitive "depends on vulnerable sharp" advisory.
    sharp is a devDependency (figure/screenshot generation), so blast radius is the
    scripts, not the app bundle. → Q7.
11. Whether *any* gate should read dependency advisories (`npm audit` in build-gate.yml or
    a nightly), given that 4 high-severity advisories sat on an all-green tree. → Q7.
12. `/api/sena/ops/jobs/worker`: document it in `SENA_API_ENDPOINT_FACTS` (which publishes an
    internal HMAC-signed queue callback in `/api/sena/docs` + the OpenAPI document, and
    requires widening the `SenaApiAuthMode` union with an hmac-signed mode), or affirm it as
    permanently internal and leave the `SENA_UNDOCUMENTED_API_ROUTES` entry standing? Either
    answer is cheap now; the point is that the choice is currently implicit. → Q8.
13. **ADR-0006 D1 vs the interactions-target derivation** (Q9). Should
    `addDerivedContractRows` gate `interaction.target` on `hasDeclaredRoster` the way the
    coded_segments loop already gates `targetPersonIds` — i.e. is the current behaviour a
    bug to fix, or intended behaviour to disclose? Fixing it drops a roster member and a
    social edge for any dataset with an unresolvable reply target, changing person counts, S
    dimensions, and matrix fingerprints; ADR-0005:48 asks for coordinated
    SENA-A02/A07/A13/A15 review for exactly that. Answering this unblocks TL-A3, which
    cannot be written honestly until the invariant's wording is settled. Also decides the
    sibling `resolvePersonIdentity` pass-through at import-adapters.ts:430, which the
    2026-07-31 report deferred and the 2026-08-01 report dropped without resolution.

## Iteration log

- **Iteration 0 — 2026-08-03.** Campaign bootstrap, read-only. Recon by a 5-agent
  workflow (suite inventory/taxonomy, quality audit, gate map, escaped-defect history,
  coverage map); command file authored and adversarially reviewed by 3 critics
  (fact-check, sibling-consistency, protocol attack), fixes applied
  (mutation-record schema + hash-dispatch recovery, kill-quality rules, deletion
  traceability, ratchet num/denom form). Ledger seeded: 13 EC classes, 44 TL-rows,
  ratchet baselines R1–R6. No code changed; no tests run; no mutation applied.
- **Iteration 1 — 2026-08-03.** Slice: TL-G3 (lane G, gate integrity). Entered from a
  whole-project audit (9-dimension agent sweep + adversarial verification) rather than
  lane order, because the audit found the lint gate red and 4 high-severity dependency
  advisories — both gate-integrity facts this lane owns. Kills proven: none owed (triage
  row, no check landed; the ena-space-plot change is behaviour-preserving and covered by
  the existing ena-space-plot-parity / ena-low-rank suites). Gate: unchanged — lint is
  still gated nowhere (Peter decision 6). Ratchet deltas: **R6 0 → measured (80.9 s
  baseline recorded, Apple M4 Pro / node 24.15.0 / commit 2627972)**; R1–R5 unchanged
  (no test files added this iteration). New findings: Q6 (lint config's ignores were
  app-root-relative, so the gate's output was 703/704 generated-code noise and its one
  real signal was undiscoverable), Q7 (4 high-severity advisories on an all-green tree;
  no gate reads advisories at all). Peter list grew by items 10 and 11. Also landed
  outside the lane, from the same audit: the campaign ledgers and six evidence
  screenshots are now tracked in git (ed05ceb) — they had been untracked single-copy
  files in a clone shared with a concurrent agent, i.e. one `git clean -fd` from total
  loss of both campaigns' memory; and the branch's 7 unpushed commits were pushed to
  origin. Closeout gates: lint 0 (was 1), `tsc --noEmit` 0, `next build` 0 (74/74 pages),
  full suite 1208 passed / 1 skipped, `sena:performance:check` pass (total-static-js-br
  811,676 B vs 852,000 budget). Commits: ed05ceb, 194e773, 2627972.
- **Iteration 2 — 2026-08-03.** Slice: TL-B1 (lane B, route reconciliation) — selected
  ahead of lane A because it is the row that kills Q1, and Q1 is the finding that says one
  of this suite's own gate-like checks cannot fail. Kills proven: **6/6** (K1 undeclared
  route file; K2 renamed manifest path, red in both directions from one mutation; K3a/K3b
  exclusion-list anti-rot in both senses; K4 method-level lie; K5 vacuity probe, whose guard
  fired first as designed; K6 `.tsx` route must not hide). Every probe opened and closed
  inside a single shell invocation and was verified restored (`git hash-object` for the
  tracked file, `cmp -s` for the untracked ones). Gate: `npm test`, run by
  `sena:pilot:verify`'s "Full test suite" step — confirmed by the file appearing in the full
  run. New findings: **Q8, a live escape the new check caught on its first run** —
  `/api/sena/ops/jobs/worker` ships undeclared while `api-docs.test.ts` is green. Peter list
  grew by item 12 (document that route, or affirm it internal). Ratchet deltas: **EC-11's
  route half is now covered** (its page half — TL-F1, TL-G5 — is still open, so **R5 stays
  0/13**: the EC row is not DONE until both halves are); R1/R2/R3/R4 unchanged (this row
  added no handler imports and touched no O0 file); **R6 re-measured 78.5 s** against the
  80.9 s baseline with +8 tests (113 files / 1,216 tests) — no silent growth. Closeout
  gates: `tsc --noEmit` 0, `next build` 0 (74/74 pages, required because
  `api-route-coverage.ts` is non-test source), lint 0, full suite 1,216 passed / 1 skipped.
  Next: TL-G5 (page-inventory tripwire) closes EC-11's remaining half — recon is already
  done and is summarized in the row.
  Also this iteration, from the same 4-row recon sweep (read-only, no code changed): TL-G5,
  TL-E5 and TL-A3 now carry their recon in-row so a fresh session starts from the ledger
  without re-exploring. TL-A3 moved **open → BLOCKED-PETER** on the strength of **Q9**, a
  third fabricated-actor chain that survived the G1 fix, proven by an executed repro against
  HEAD rather than by reading. That is the second live product finding this campaign has
  produced (Q8 being the first) — both from checks or invariants that did not exist
  yesterday, which is the loop's thesis working: the suite was green through both.
