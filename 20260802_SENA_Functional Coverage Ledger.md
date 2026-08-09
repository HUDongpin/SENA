# 2026-08-02 SENA Functional Coverage Ledger

Single source of truth for the Functional Features Loop (`/functional-loop` in `sena-hk-template/.claude/commands/`).
Goal: every feature/button/function of SENA proven functional by fresh evidence, or explicitly marked N-A / BLOCKED-PETER.

**Status vocabulary** (each element line ends with exactly one):
- `UNVERIFIED` — no fresh proof this campaign (existing tests/smokes noted per area are *prior* evidence, not fresh proof)
- `IN-PROGRESS <date> (next: …)` — slice started, next step written down
- `PASS <date> (evidence: …)` — proven by real interaction/route invocation; evidence pointer required
- `FAIL <date> (repro: …)` — broken; minimal repro recorded; a fix slice is owed
- `FIXED-REGATE <date> (commit: …)` — fix landed, awaiting tsc + build + targeted-test regate
- `BLOCKED-PETER (question: …)` — needs a decision reserved for Peter (deps, main merge, claim wording, datasets)
- `N-A (reason: …)` — intentionally non-functional (display-only, mockup) — verified as *rendering*, nothing to click

**Evidence tiers** (record the tier with each PASS):
- T3 browser: real clicks on a running server (browser pane or Playwright script), observable outcome asserted
- T2 route: HTTP call or in-process handler invocation with asserted status + response shape
- T1 unit: vitest on the underlying logic
- T0 structural: tsc + next build only (never sufficient alone for a PASS)

---

## P0 — Core product

### FA-13 jENA workbench — /workspace/ena
Prior coverage: **NONE behavioral** (build-gate.yml notes no test imports this page; it broke main twice). Highest-risk area in the app.
**2026-08-08:** first behavioural coverage lands — `scripts/verify-sena-ena-browser-smoke.mjs` (commits d5183a8 + 4028fa3), 9 legs / ~50 checks, registered in `sena:pilot:verify` and green there end-to-end. Kill-proved: 6 of 7 adversarial source mutations turned the leg red for the predicted reason, including an EC-11 reproduction (client bundle throws at import ⇒ `curl` still 200, smoke red — so this gate reads hydration, not status codes). Claim wording provisional pending Peter.
- FA13-01 Page loads signed-out; mode rail (Sets/Model/Plot Tools/Stats) switches secondary panel — PASS 2026-08-08 (evidence: T3 leg 1 — signed-out proof via nav auth links, full 4-way rail state asserted before/after switching, and a Sets-only node going 0→1; the state change is what proves hydration rather than an HTTP 200)
- FA13-02 CSV upload parses client-side, infers unit/conversation/code/metadata mapping, resets prior result — UNVERIFIED (not smoke-drivable: Playwright's setInputFiles bypasses the OS chooser, so the dialog itself is untested; the *inference* half is covered indirectly by FA13-03's 12 asserted column roles)
- FA13-03 Sample button loads bundled lesson-study CSV; dataset cards + column preview populate — PASS 2026-08-08 (evidence: T3 leg 2 — caption changes to a distinct string, cards 18/12/7, and all 12 inferred column roles asserted in order)
- FA13-04 "Full table" opens Data View drawer and scrolls to it — PASS 2026-08-08 (evidence: T3 leg 2 — aria-expanded false→true→false with table count 0→9 headers→0)
- FA13-05 Model: column chips cycle roles; Units/Conversation/Codes/Metadata multi-selects update mapping — UNVERIFIED (**row wording is inaccurate** — verified against `EnaWorkspaceClient.tsx:1064` `toggleColumn`: a chip click clears the column from every role then toggles it within the target role, i.e. it assigns or unmaps; it never cycles. Writing the row as stated would produce a false red. Correction reserved for Peter — see Escalations)
- FA13-06 Model accumulation selects (Model/Window/Weight/Node Positions) + Back/Forward/Dims inputs alter run config — UNVERIFIED (not attempted this slice)
- FA13-07 Plot Tools Dimensions: axis labels, variance toggle, Flip X/Y take effect on plot — PASS 2026-08-08 (evidence: T3 leg 8 — axis rename reaches the title, variance toggle removes the share, and Flip X is proved a true mirror: every point moves >1px and the before+after abscissa sums are equal within 1e-6)
- FA13-08 Plot Tools Plotted Points: Group By draws traces only (never re-projects), scale slider, label toggles — PASS 2026-08-08 (evidence: T3 leg 5 — the load-bearing one: selecting Group By adds three mean traces **while** dimensions, edge count, axis title and every (name, weight) pair stay byte-identical. That is the "draws traces only, never re-projects" claim proved rather than assumed. Scale slider not covered)
- FA13-09 Plot Tools Network Graph: code-label/unconnected/weights toggles, edge-weight sliders incl. 0.001 floor readout — PASS 2026-08-08 (evidence: T3 legs 5+8 — code labels 7→0→7, connection weights 0→21→0, min-edge-weight slider readout 0.001→0.050 with survivor counts and name-sets asserted different)
- FA13-10 Reset plot tools restores defaults — PASS 2026-08-08 (evidence: T3 leg 8 — axis title, input value and all six abscissas return to baseline)
- FA13-11 Stats Compare: Group A/B selects compute Welch t / Cohen's d / Mann-Whitney per dimension — PASS 2026-08-08 (evidence: T3 leg 6 — exact statistics text pinned: `n 2 v 3`, `t(2.8) = -0.39, p = 0.723`, `U = 2.0, p = 0.800`, `exact distribution`)
- FA13-12 Stats Fit + Variance tabs render correct tables for current run — PASS 2026-08-08 (evidence: T3 leg 6 — Pearson and Spearman pinned at the measured 1.000 per plotted dimension plus the qualitative label, and Variance rows asserted to agree with the plot's axis titles. The value pin replaced a range-only check that a 0.000-correlation projection passed; kill-proved in 4028fa3)
- FA13-13 Stats Methods write-up + Copy button copies to clipboard — PASS 2026-08-08 (evidence: T3 leg 6 — clipboard content asserted to contain the write-up head and `This yielded 6 units of analysis.`)
- FA13-14 Runtime toggle Worker↔API; Run jENA disabled until mapping valid; worker run shows progress % — **PARTIAL** 2026-08-08 (evidence: T3 leg 3 — the worker path is proved end-to-end: Run enabled on the inferred mapping → a plot whose own marks are asserted (7 node ids, 21 edges, 6 points, axis titles, heaviest edge). NOT covered: the Worker↔API toggle, and the progress percentage — the sample run finishes in ~100ms so only `0%` is ever observable and any mid-run assertion would be flaky. Owed as a separate slice with a larger fixture)
- FA13-15 API runtime: fetches CSRF, POST /api/ena/run with session; signed-out behavior is a clear error, not a hang — UNVERIFIED (signed-out half is drivable — recon confirmed the surfaced string is `Sign in is required.` — but the signed-in half needs the auth smoke's session; owed)
- FA13-16 Cancel terminates worker; Clear clears result and error — UNVERIFIED as a browser claim (still needs the ~17,600-row synthetic CSV slice; note this also leaves the *component wiring* — that `EnaWorkspaceClient` hands the same token ref to both run and cancel — pinned by nothing, since `run-lifecycle.ts` is tested directly and no DOM test infra exists (Peter decision 2)), but the **defect recon surfaced is FIXED 2026-08-09**: run/cancel sequencing extracted to `app/workspace/ena/run-lifecycle.ts`, so `Analysis cancelled.` survives jena-js's synchronous `terminate()` rejection. The guard is a **monotonic run token**, not a cancelled-state boolean: a boolean has to be cleared by the next run, which hands an abandoned run a window in which it looks live again — and since `runWithApi` has no AbortController, a cancelled API request that returns after the user re-runs would land its stale result as the new run's and stand the live run down mid-flight. Each run now claims a token and writes state only while it still holds it; cancel bumps it. Permanent kill-proved test `lib/ena/__tests__/run-lifecycle-cancel.test.ts` (7 checks) drives the **real** jena-js browser client over a stub worker: watched red pre-fix for the predicted reason (exact string `ENA worker client terminated.` overwriting; late-result resurrection), green post-fix; the three token checks were then watched red against the boolean version, and a probe confirmed the guarded `setProgress(null)` is killed (1 failed / 6 passed). jena-js untouched at 0.6.2. Commit b102570 + token strengthening on `fix/fa13-16-cancel-race` → **PR #12** (based on the fusion branch, sibling of PR #11; merge is Peter's)
- FA13-17 JSON export downloads sena-ena-result.json (parses, sane shape) — PASS 2026-08-08 (evidence: T3 leg 9 — keys `[set, plotModel, summary, warnings]`, summary rows 18 / units 6 / codes 7, runtime `worker`, warnings `[]`)
- FA13-18 Points/Connections buttons download CSVs with plausible rows — PASS 2026-08-08 (evidence: T3 leg 9 — points header `ENA_UNIT,participant,SVD1,SVD2`; connections 2 id columns + 21 pair columns, first `PoP & GO`; both row counts equal summary.units)
- FA13-19 Plot zoom in/out/reset (0.6x–4x) — PASS 2026-08-08 (evidence: T3 leg 4 — both clamps asserted with their disabled states, and the 3dp plot attribute cross-checked against the 2dp header readout)
- FA13-20 Alerts strip: validation message, error, run warnings, low-rank warning appear when provoked — UNVERIFIED (needs purpose-built fixture CSVs — a dataset decision, not a test decision)

### FA-14 SENA fusion workspace shell — /workspace/sena
Prior coverage: verify-sena-browser-smoke.mjs (viewport shell, view switching, drawer, uploads, canvas selection, download/restore round-trips) — rerun for fresh proof.
- FA14-01 Page loads signed-out (local-adapter mode); logo link → / — PASS 2026-08-08 (evidence: T3 — verify-sena-browser-smoke.mjs full pass via `sena:pilot:verify`, commit b1abee7: signed-out goto + shell waits at 375/768/1024/1440px; default figure is the plane-orbit surface per ADR-0009)
- FA14-02 Header Upload accepts .csv/.json/.xlsx/.txt/.md/.srt/.vtt through the import pipeline — UNVERIFIED
- FA14-03 Header Export report downloads sena-analysis-report.md — UNVERIFIED
- FA14-04 Plot view bar: all 7 tabs (Fusion/Dual Lens/Temporal/ENA Space/SNA/Evidence/Matrix) switch the deck; dropdown mirrors them — PASS 2026-08-08 (evidence: T3 — smoke `verifyWorkspaceShellAndPlotViews` drives every view tab incl. the SNA orbit sociogram panel; commit b1abee7)
- FA14-05 Left rail Sets/Model/Plot Tools/Stats open focus-trapped modal drawer; Escape/backdrop/X close; background inert — UNVERIFIED
- FA14-06 Research workflow rail anchors (Data Import…Report) navigate with step state — UNVERIFIED
- FA14-07 Mobile figure switcher (Fusion/Dual Lens) with arrow keys at mobile viewport — PASS 2026-08-08 (evidence: T3 — smoke `verifyResponsiveWorkspaceShell` mobile figure tabs at 375px; commit b1abee7)

### FA-15 SENA Sets / Data Import panel
- FA15-01 Load lesson-study sample populates dataset metrics (People/Codes/Utterances/…): exact counts vs sample contract — UNVERIFIED
- FA15-02 Add data signed-out: local enterprise adapters build dataset client-side — UNVERIFIED
- FA15-03 Add data signed-in: POST /api/sena/import (create-project + runtime bundle); 202 job receipt leaves dataset untouched and reports job id — UNVERIFIED
- FA15-04 Contract template button downloads template — UNVERIFIED
- FA15-05 Clear button clears loaded contract/dataset — UNVERIFIED
- FA15-06 Uploaded table mapper: contract-table select + per-field column mapping remaps and rebuilds dataset; missing-required warnings — UNVERIFIED
- FA15-07 Import warnings panel (≤12) and error plate appear on bad input — UNVERIFIED
- FA15-08 Data contract audit Export downloads sena-data-contract-audit.json — UNVERIFIED

### FA-16 SENA Model Builder panel
- FA16-01 Layout buttons (Exploratory/ENA Space/Joint) switch coordinate frame — PASS 2026-08-08 (evidence: T3 — now four layouts incl. the `plane-orbit` default (ADR-0009): smoke `verifyFusionLayoutRoundTrip` proves each button renders its own surface in the panel AND the maximized overlay with the matching grammar caption, and `verifyDiagnosticFusionCanvasLayouts` proves the preserved A1 Canvas grammar behind Exploratory/Joint; commit b1abee7. Item wording predates the fourth layout — rewording pending Peter)
- FA16-02 S/W/B layer visibility toggles hide/show layers — UNVERIFIED (owed: smoke asserts toggle presence only; hide/show effect — e.g. S toggle → orbit `showLanes` — not yet asserted in live DOM)
- FA16-03 alpha/beta/gamma sliders + edge-threshold slider + normalization select change the fusion render (semantics per ADR-0005 — verify effect, never alter math) — PASS 2026-08-08 (evidence: T3 — smoke drives alpha/beta/gamma to 0.33/0.44/0.55, asserts readouts, and the inspector's A_fusion fingerprint provenance shows `gamma 0.55` after an edge selection — the slider state observably reaches the render provenance; commit b1abee7)

### FA-17 SENA Plot Tools panel
- FA17-01 Layout buttons, S/W/B toggles, edge-threshold slider mirror Model Builder state — UNVERIFIED
- FA17-02 Temporal framing Stage/Moving/Turn buttons switch window mode — UNVERIFIED
- FA17-03 Advanced Options drawer mirrors alpha/beta/gamma + normalization — UNVERIFIED

### FA-18 SENA Stats panel
- FA18-01 Top G pair buttons select a person-code pair for inspection — UNVERIFIED
- FA18-02 Five export buttons download parseable JSON (SNA report, jENA manifest, jSNA manifest, G report, metric provenance) — UNVERIFIED

### FA-19 Central plot deck + inspector
- FA19-01 Fusion canvas node/edge click selects; inspector shows provenance/fingerprint/G attribution (data-testid sena-fusion-canvas preserved) — PASS 2026-08-08 (evidence: T3 — smoke `verifyCanvasSelection` on the plane-orbit default: person hex → actor metrics, bridge → line-weight provenance (inspector width === drawn overlay width since 26ca5b7), social lane → jSNA tie handoff, matrix/A_fusion fingerprints asserted; `sena-fusion-canvas` testid preserved and proven reachable via Diagnostic layouts in `verifyDiagnosticFusionCanvasLayouts`; commit b1abee7; screenshot output/playwright/sena-20260808-fusion-plane-orbit-selection-unit-link.png)
- FA19-02 Maximize overlay + Restore/Close + zoom controls in both modes — PASS 2026-08-08 (evidence: T3 — smoke round-trip maximizes/restores plane-orbit and ena-space; overlay renders the SAME surface as the panel (the pre-P3 routing bug is pinned in live DOM: zero stranded Canvas mounts); zoom controls exercised in the shell flow; commit b1abee7; screenshot output/playwright/sena-20260808-fusion-plane-orbit-maximized.png)
- FA19-03 Temporal window builder: mode buttons, Prev/Next, Play/Pause animation, range slider, transition evidence — UNVERIFIED
- FA19-04 Temporal fusion arc: phase groups + window ticks jump active window (data-testid temporal-fusion-arc preserved) — PASS 2026-08-08 (evidence: T3 — smoke `verifyActiveWindowFusionScope`: Teach phase click via `temporal-fusion-phase-teach` changes the active window + A_fusion checksum; `temporal-fusion-arc` testid untouched this campaign; window ticks not separately asserted — noted; commit b1abee7)
- FA19-05 Per-view panels render with data: Dual Lens, ENA Space, SNA, Evidence (source filter + Export JSON + per-item buttons), Matrix previews — UNVERIFIED
- FA19-06 Selecting an element flips mobile view to Dual Lens — UNVERIFIED

### FA-20 Research Details drawer
- FA20-01 Floating pill opens/closes drawer dialog; 6 tabs with arrow-key navigation — UNVERIFIED
- FA20-02 Analysis tab: SNA metrics/actor table, community detection, G table, matrix evidence previews, temporal runtime trace + export — UNVERIFIED
- FA20-03 Evidence tab: ledger source filter + Export JSON — UNVERIFIED
- FA20-04 Validation tab renders method validation checks — UNVERIFIED
- FA20-05 Demo verification checklist: per-check status select, reviewer, notes persist in exports — UNVERIFIED
- FA20-06 Report + governance metadata inputs (title, review status, IRB, steward, consent, retention, constraints) flow into report artifacts — UNVERIFIED
- FA20-07 Reliability upload signed-out: local adapters compute kappa/alpha dashboard — UNVERIFIED
- FA20-08 Reliability upload signed-in: POST /api/sena/reliability; dashboard + metadata inputs; PATCH review path — UNVERIFIED
- FA20-09 All ~16 client-side export buttons download parseable artifacts with correct schemaVersion (walkthrough, verification, compatibility, page contract, snapshot, dev plan, ENA report, runtime bundle, runtime audit, readiness, reliability gate, claim gate, review packet, report JSON/MD; reliability-dashboard button correctly disabled until dashboard exists) — UNVERIFIED
- FA20-10 Publication exports (HTML/SVG/PNG/XLSX/DOCX/PDF/package) via POST /api/sena/exports/publication: signed-in blob downloads; signed-out behavior sane — UNVERIFIED

## P1 — Auth

### FA-09 Login — /login
Prior coverage: auth + sso browser smokes; login-route tests.
- FA09-01 Email+password happy path → session cookie, redirect /workspace/sena — UNVERIFIED
- FA09-02 Bad credentials → error message, no cookie — UNVERIFIED
- FA09-03 MFA 202 path: authenticator field appears; resubmit with mfaCode+challenge token; clearing email/password resets challenge — UNVERIFIED
- FA09-04 Remember-session checkbox sends manifest field — UNVERIFIED
- FA09-05 SSO buttons ×3: configured → GET redirect; unconfigured → local-pilot POST fallback → authorizationUrl or /workspace/sena — UNVERIFIED
- FA09-06 SSO preflight evidence panel populates from GET /api/auth/sso?status=1&preflight=1 — UNVERIFIED
- FA09-07 sso_error query param surfaces message; Forgot-password and Register links navigate — UNVERIFIED

### FA-10 Register — /register
- FA10-01 Full happy path (required fields, role select, plan card, terms) → account + session → /workspace/sena — UNVERIFIED
- FA10-02 Password policy min-length + mismatch blocked client-side — UNVERIFIED
- FA10-03 Invite code prefill from ?inviteCode=/?invite= and forwarded through SSO buttons — UNVERIFIED
- FA10-04 SSO/ORCID/Google buttons same dual-path as login — UNVERIFIED

### FA-11 Password reset — /reset-password
- FA11-01 Request path: pilot runtime returns local resetToken/resetUrl, auto-filled — UNVERIFIED
- FA11-02 Confirm path with token (?token= prefill honored) sets new password; sign-in works with it — UNVERIFIED

## P2 — Enterprise Administration (Research Details ▸ Administration)

### FA-21 Enterprise runtime panel
Prior coverage: enterprise-api / rbac-collaboration / reliability / validation-claim smokes + route tests. Verify signed-in against a temp enterprise DB.
- FA21-01 Local validation: group/metric selects, Run group-comparison (POST, permutation + Holm), review approve/reject (PATCH), exports — UNVERIFIED
- FA21-02 Server project controls: project select, Save (optimistic expectedVersion), Run server analysis, Refresh, cleaning-manifest export — UNVERIFIED
- FA21-03 Governance: health/security/audit-CSV/backup exports; Deliver audit/backup; Sync database — UNVERIFIED
- FA21-04 Notifications: refresh, deliver, deliver-email, mark-read — UNVERIFIED
- FA21-05 Ops exports battery (status/readiness/deployment/capability/identity/SaaS/go-live/rollback/monitor JSONs) each download and parse — UNVERIFIED
- FA21-06 Go-live rehearsal: apply draft fills release-gate form; Attest gated on checklist; attestations JSON — UNVERIFIED
- FA21-07 Upload storage: multipart upload to registry, Refresh (verify=1), Deliver object storage — UNVERIFIED
- FA21-08 Collaboration: deliver pub/sub; SSE stream (EventSource) delivers live updates; comment/presence/adjudication POSTs; restore-revision PATCH — UNVERIFIED
- FA21-09 SSO preflight button; provisioning readiness refresh (deployment + identity evidence in parallel, schema-version validated) — UNVERIFIED
- FA21-10 Account security: MFA setup/enable/disable round-trip; session list/revoke/revoke-others; logout — UNVERIFIED
- FA21-11 Team operations: create/accept/revoke invitation; membership role/status PATCH; refresh team state — UNVERIFIED
- FA21-12 Platform decision panel: full form + submit review + register/certification exports — UNVERIFIED
- FA21-13 Release gate panel: form validation (disabled until approver+notes+summary), submit, blockers count, reviews export — UNVERIFIED
- FA21-14 Expert review: create (POST), update (PATCH), dossier export — UNVERIFIED

## P3 — API surfaces with no UI caller (route-level proof, T2)

### FA-22 Headless API contracts
Route-test gaps flagged by inventory: governance/audit, provisioning, SCIM Users/Groups (+[resourceId]), ops/native-adapters — handlers never invoked by any test.
- FA22-01 GET /api/sena/docs and ?format=openapi return valid JSON / OpenAPI 3.1 (public, no auth) — UNVERIFIED
- FA22-02 SCIM v2: Users POST/GET, Users/[id] PUT/PATCH, Groups POST/GET, Groups/[id] PUT/PATCH, ServiceProviderConfig GET — bearer-token auth enforced; close route-test gap — UNVERIFIED
- FA22-03 /api/sena/provisioning POST (dry-run) + GET — bearer auth; close route-test gap — UNVERIFIED
- FA22-04 /api/sena/governance/audit GET/POST via route handler (not just lib) — close route-test gap — UNVERIFIED
- FA22-05 /api/sena/ops/native-adapters GET via route handler — close route-test gap — UNVERIFIED
- FA22-06 Ops probes respond sanely without configured live services (postgres, object-storage, cdn, metrics, observability + probe): clear "not configured" over 500s — UNVERIFIED
- FA22-07 Jobs family: /ops/jobs GET/POST, probe, worker (HMAC sig + timestamp + payload hash enforced; bad sig rejected), worker-contract, worker-heartbeat — UNVERIFIED
- FA22-08 Auth route hardening: rate limiting on login/register/password-reset/sso; CSRF required on mutations; unauthenticated hits on protected routes → 401 not 500 — UNVERIFIED

## P4 — Marketing, navigation, cross-cutting

### FA-01..08, FA-12 Marketing + static pages
- FA01-01 Home hero CTAs → /workspace/sena and /method; metric cards render — UNVERIFIED
- FA02-01 NavBar links all navigate; logo → / — UNVERIFIED
- FA02-02 Language dropdown EN/繁體/简体 swaps copy; closes on outside click + Escape — UNVERIFIED
- FA02-03 Theme toggle day/night persists across navigation — UNVERIFIED
- FA02-04 Mobile hamburger drawer: open, navigate, close via X/backdrop — UNVERIFIED
- FA03-01 Footer link groups: all 16 links land on real anchors/pages (incl. /#platform, /#cases, /api/sena/docs) — UNVERIFIED
- FA07-01 /docs: JSON contract + OpenAPI buttons open live endpoints; endpoint matrix renders — UNVERIFIED
- FA08-01 /workspace preview: Launch SENA POC + jENA Workspace buttons; mock sidebar N-A (visual only) — UNVERIFIED
- FA04..06/12-01 /platform /method /demo + 4 legal pages render fully (display-only: verify render + back-link, then N-A the rest) — UNVERIFIED

### FA-24 Fusion plane + orbit (ADR-0009, 2026-08-08 redesign)
All statuses provisional — claim wording pending Peter. Evidence run: `sena:pilot:verify` green end-to-end at commit b1abee7 (branch feat/fusion-plane-orbit); screenshots under output/playwright/sena-20260808-*.png.
- FA24-01 Default Fusion figure is the canonical plane + orbit: nested `ena-plot` inside `sena-fusion-plane-orbit`, model-definition + goodness-of-fit footer present — PASS 2026-08-08 (evidence: T3 smoke default waits + footer; parity gate lib/sena/__tests__/fusion-plane-parity.test.tsx pins byte-identity to the /workspace/ena renderer; screenshot …-fusion-plane-orbit-default.png)
- FA24-02 Orbit lanes: port-docked directed lanes with paper-cased arrowheads drawn above all lanes; every lane carries data-edge-weight/-normalized-weight/-scaled-weight/-visual-salience/-visual-width; ≥2 distinct widths when signals differ — PASS 2026-08-08 (evidence: T3 smoke `verifyOrbitLaneProvenance` on the plane surface; short-way travel + hexagon clearance invariants unit-gated after the 2026-08-08 seam fix 291f042)
- FA24-03 Cross-layer unit link: selecting an orbit hexagon draws the dashed leader to that person's unit point; deselecting removes it — PASS 2026-08-08 (evidence: T3 smoke `verifyFusionUnitLink`; screenshot …-fusion-plane-orbit-selection-unit-link.png)
- FA24-04 Four-mode routing: panel AND maximized overlay render the matching surface for plane-orbit/ena-space/explanatory/joint with the matching grammar caption; maximizing never falls back to the Canvas (pre-P3 overlay bug) — PASS 2026-08-08 (evidence: T3 smoke `verifyFusionLayoutRoundTrip`; jsdom pin lib/sena/__tests__/fusion-overlay-routing.test.tsx)
- FA24-05 Standalone SNA orbit sociogram in the SNA view with full lane provenance — PASS 2026-08-08 (evidence: T3 smoke SNA-view leg + `verifyOrbitLaneProvenance` scoped to `sena-sna-orbit-sociogram`; screenshot …-sna-orbit-sociogram.png)
- FA24-06 Diagnostic layouts preserve the A1 grammar (`sena-fusion-canvas` testid, concept guide, outer-social-arc, solid links, halos, Q glyph, weighted widths) — PASS 2026-08-08 (evidence: T3 smoke `verifyDiagnosticFusionCanvasLayouts`; screenshot …-fusion-diagnostic-a1-canvas.png)
- FA24-07 /workspace/ena comparison controls (group means + 95% t-CI overlay, signed subtraction default-off, palette presets, Δ× multiplier) — PASS 2026-08-08 **at T3** (evidence: leg 5 of `verify-sena-ena-browser-smoke.mjs`, green in `sena:pilot:verify`; commits d5183a8 + 4028fa3. Means asserted with their group n; CI rectangles asserted twice over — the drawn bounds within 1e-4 of both groups' computed values AND a positive rendered boundingBox; palette swap asserted on the ink, not just the active flag; Δ× 3 asserted to triple every stroke width while every weight and sign stays byte-identical; |Δ| threshold asserted to keep a *different set* of edges than the pooled-mean filter. Subtraction default-off is kill-proved twice: flipping the state default and flipping only the control's checked prop both turn the leg red. Upgraded from the T1-only status recorded earlier the same day)

### FA-23 Cross-cutting
- FA23-01 Responsive: workspace + marketing at mobile/tablet/desktop viewports, no overflow (footer screenshots in output/playwright are prior evidence) — UNVERIFIED
- FA23-02 Bilingual content markers in workspace evidence (per browser-smoke bilingual assertions) — UNVERIFIED
- FA23-03 Keyboard basics on dialogs/tabs already claimed (focus trap, arrow keys, Escape) actually work — UNVERIFIED
- FA23-04 404/500 pages serve (pilot gate asserts artifacts; verify served behavior) — UNVERIFIED

---

## Escalations for Peter
(append `- <date> <ledger-id>: <one-line question>`; these are the BLOCKED-PETER queue)
- 2026-08-08 FA24/FA16/FA19: ratify ADR-0009 + the fusion-redesign claim wording (rows marked provisional); FA16-01 item text still names three layouts.
- 2026-08-08 FA24-07: ~~/workspace/ena has no browser-smoke coverage at all~~ — RESOLVED same day: smoke leg added (d5183a8 + 4028fa3), FA24-07 now T3 and 13 FA-13 rows PASS.
- 2026-08-08 FA13-05: the row's wording does not match the code. `toggleColumn` (EnaWorkspaceClient.tsx:1064) clears a column from every role then toggles it within the target role — a chip click **assigns or unmaps**; it never "cycles roles". Reword the row (and I'll gate it), or tell me the cycling behaviour is the intent and it's the code that's wrong.
- 2026-08-08 FA13-16 (product defect, cosmetic but user-facing): ~~`cancelAnalysis()` sets `"Analysis cancelled."` (EnaWorkspaceClient.tsx:1149) and is then overwritten — `terminate()` rejects the in-flight run and that rejection's handler surfaces jena-js's own `"ENA worker client terminated."` (the string lives in node_modules/jena-js/dist/browser/index.js, not in SENA). The user sees library internals instead of the intended message. Fix is ours (swallow the post-cancel rejection, or re-assert the message after terminate); worth a bug row.~~ — RESOLVED 2026-08-09 on the SENA side (monotonic run token in the extracted `run-lifecycle.ts`; kill-proved regression test; jena-js pinned as-is). Delivered on `fix/fa13-16-cancel-race` → **PR #12**, based on the fusion branch rather than main because the fix touches `EnaWorkspaceClient.tsx`, which PR #10 also edits — landing it on main first would have handed PR #10 a conflict. Merge is Peter's. See the FA13-16 row for evidence.
- 2026-08-09 FA13-NEW (product defect, **not** cosmetic — raised, not fixed): **an analysis can outlive the data it was computed from.** `applyCsv` (EnaWorkspaceClient) clears the result and repopulates grid + mapping, but it neither cancels nor supersedes an in-flight run, and no data control is disabled while one is running (file input, "Load sample", and the mapping selects are all live). So: run a slow analysis on dataset A, load dataset B while the spinner is up (the panel visibly clears), and when A settles its plot paints over B's grid — the projection is A's, while the layer key, subtraction, Compare table and Methods write-up are all derived from B's mapping and group-by. Nothing on screen says the plot belongs to a dataset that is no longer loaded, and the JSON/CSV export buttons will export it. Verified against the current tree by an adversarial reviewer; **pre-existing** (the pre-FA13-16 code did the same thing unconditionally), so it is out of PR #12's scope and orthogonal to the cancel race — the run token guards *run* identity; nothing guards *input* identity. Cheapest closure reuses the new mechanism: have `applyCsv` supersede the run exactly as cancel does (bump the token + tear the worker down), factored as a shared `supersedeEnaRun` helper. That changes UX semantics (loading data would abort a running analysis), so it is your call, not mine.
- 2026-08-08 UI wording: the "Active view" note still reads "Current window A1 canvas" while the default is the plane-orbit figure — changing it touches plot-switcher copy, which the Perf Report guardrail freezes ("no plot-switcher DOM/label changes"); your call.

## Iteration log
(append-only; one line per loop iteration: `- <date> <iteration#> target=<ids> verdict=<...> evidence=<pointer> commit=<sha|none>`)
- 2026-08-08 fusion-redesign P6 target=FA14-01,04,07;FA16-01,03;FA19-01,02,04;FA24-01…07 verdict=PASS (provisional wording) evidence=sena:pilot:verify green @ b1abee7 + output/playwright/sena-20260808-*.png commit=b1abee7
- 2026-08-08 ena-workbench-coverage target=FA13-01…20;FA24-07 verdict=13 PASS / 1 PARTIAL (FA13-14) / 6 UNVERIFIED-with-reason; 2 findings raised (FA13-05 wording, FA13-16 defect) evidence=verify-sena-ena-browser-smoke.mjs green in sena:pilot:verify; 6-of-7 adversarial mutations killed; 1 vacuity found and closed (Goodness of Fit) commit=d5183a8+4028fa3
- 2026-08-09 fa13-16-cancel-race-fix target=FA13-16(defect only) verdict=FIXED, kill-proved (red pre-fix on the exact predicted strings, green post-fix; real jena-js client over stub worker) evidence=lib/ena/__tests__/run-lifecycle-cancel.test.ts; gates tsc --noEmit + npm test 1211/1212 + next build --webpack, all green from worktree upbeat-engelbart-9a2a02 (its own node_modules; main clone untouched on feat/fusion-plane-orbit; UAIS vitest running concurrently but outside this tree) commit=7dc4665 (branch claude/upbeat-engelbart-9a2a02, off main, unmerged)
- 2026-08-09 fa13-16-rebase+harden target=FA13-16(defect only) verdict=FIXED and rebased onto the PR stack; the boolean guard was found insufficient and replaced with a monotonic run token (3 new checks watched red against it; setProgress guard mutation-probed, killed 1f/6p, file restored to hash 0b0530cc) evidence=lib/ena/__tests__/run-lifecycle-cancel.test.ts (7 checks); gates tsc + npm test 1358/1 skipped + next build + eslint + sena:performance:check 821,787/852,000 + **sena:pilot:verify all 7 smokes green incl. jENA workbench** commit=(branch fix/fa13-16-cancel-race → PR #12, unmerged). 1 finding raised, not fixed: FA13-NEW (analysis outliving its dataset) — see Escalations
