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
- FA13-01 Page loads signed-out; mode rail (Sets/Model/Plot Tools/Stats) switches secondary panel — UNVERIFIED
- FA13-02 CSV upload parses client-side, infers unit/conversation/code/metadata mapping, resets prior result — UNVERIFIED
- FA13-03 Sample button loads bundled lesson-study CSV; dataset cards + column preview populate — UNVERIFIED
- FA13-04 "Full table" opens Data View drawer and scrolls to it — UNVERIFIED
- FA13-05 Model: column chips cycle roles; Units/Conversation/Codes/Metadata multi-selects update mapping — UNVERIFIED
- FA13-06 Model accumulation selects (Model/Window/Weight/Node Positions) + Back/Forward/Dims inputs alter run config — UNVERIFIED
- FA13-07 Plot Tools Dimensions: axis labels, variance toggle, Flip X/Y take effect on plot — UNVERIFIED
- FA13-08 Plot Tools Plotted Points: Group By draws traces only (never re-projects), scale slider, label toggles — UNVERIFIED
- FA13-09 Plot Tools Network Graph: code-label/unconnected/weights toggles, edge-weight sliders incl. 0.001 floor readout — UNVERIFIED
- FA13-10 Reset plot tools restores defaults — UNVERIFIED
- FA13-11 Stats Compare: Group A/B selects compute Welch t / Cohen's d / Mann-Whitney per dimension — UNVERIFIED
- FA13-12 Stats Fit + Variance tabs render correct tables for current run — UNVERIFIED
- FA13-13 Stats Methods write-up + Copy button copies to clipboard — UNVERIFIED
- FA13-14 Runtime toggle Worker↔API; Run jENA disabled until mapping valid; worker run shows progress % — UNVERIFIED
- FA13-15 API runtime: fetches CSRF, POST /api/ena/run with session; signed-out behavior is a clear error, not a hang — UNVERIFIED
- FA13-16 Cancel terminates worker; Clear clears result and error — UNVERIFIED
- FA13-17 JSON export downloads sena-ena-result.json (parses, sane shape) — UNVERIFIED
- FA13-18 Points/Connections buttons download CSVs with plausible rows — UNVERIFIED
- FA13-19 Plot zoom in/out/reset (0.6x–4x) — UNVERIFIED
- FA13-20 Alerts strip: validation message, error, run warnings, low-rank warning appear when provoked — UNVERIFIED

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
- FA24-07 /workspace/ena comparison controls (group means + 95% t-CI overlay, signed subtraction default-off, palette presets, Δ× multiplier) — PASS 2026-08-08 at T1 only (evidence: lib/ena/__tests__/comparison-geometry.test.tsx (23) + statistics goldens + |Δ|-threshold wiring pins from 26ca5b7; T3 browser leg OWED — no gate visits /workspace/ena yet, see Escalations)

### FA-23 Cross-cutting
- FA23-01 Responsive: workspace + marketing at mobile/tablet/desktop viewports, no overflow (footer screenshots in output/playwright are prior evidence) — UNVERIFIED
- FA23-02 Bilingual content markers in workspace evidence (per browser-smoke bilingual assertions) — UNVERIFIED
- FA23-03 Keyboard basics on dialogs/tabs already claimed (focus trap, arrow keys, Escape) actually work — UNVERIFIED
- FA23-04 404/500 pages serve (pilot gate asserts artifacts; verify served behavior) — UNVERIFIED

---

## Escalations for Peter
(append `- <date> <ledger-id>: <one-line question>`; these are the BLOCKED-PETER queue)
- 2026-08-08 FA24/FA16/FA19: ratify ADR-0009 + the fusion-redesign claim wording (rows marked provisional); FA16-01 item text still names three layouts.
- 2026-08-08 FA24-07: /workspace/ena has no browser-smoke coverage at all (P4c comparison UI is unit-tested only) — approve adding a smoke leg, or accept T1 evidence for the comparison surface.
- 2026-08-08 UI wording: the "Active view" note still reads "Current window A1 canvas" while the default is the plane-orbit figure — changing it touches plot-switcher copy, which the Perf Report guardrail freezes ("no plot-switcher DOM/label changes"); your call.

## Iteration log
(append-only; one line per loop iteration: `- <date> <iteration#> target=<ids> verdict=<...> evidence=<pointer> commit=<sha|none>`)
- 2026-08-08 fusion-redesign P6 target=FA14-01,04,07;FA16-01,03;FA19-01,02,04;FA24-01…07 verdict=PASS (provisional wording) evidence=sena:pilot:verify green @ b1abee7 + output/playwright/sena-20260808-*.png commit=b1abee7
