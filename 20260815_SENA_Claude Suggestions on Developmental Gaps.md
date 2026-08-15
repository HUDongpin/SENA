# 2026-08-15 — SENA · Claude Suggestions on Developmental Gaps

**Author:** Claude (Fable 5), multi-agent discovery sweep
**Repo state:** `main` @ `6bbb222` (all PRs #10–#16 merged; fusion plane-orbit redesign, ADR-0010 roster gate, and the FA13 fixes are on main)
**Scope:** enumerate SENA's unfinished and malfunctioning features, then propose a prioritized plan to close them.

---

> **Remediation update — 2026-08-15, later the same day.** Most of this document's
> confirmed defects have since been **fixed** on branch `fix/gap-remediation-2026-08-15`.
> See §10 for what landed, what was deliberately left, and the evidence. The findings
> below are preserved as written so the record of what was found stays intact; read
> §10 alongside any item before acting on it.

## 0. How to read this document

Sections 1–9 are the **findings and plan as originally written**, before anything was fixed. The sweep that produced them was strictly read-only (the clone's `node_modules` was empty; see §7), so every code-level claim below is **static analysis**, verified by reading source at the cited `file:line`, not by running the app. §10 then records what was subsequently fixed and gated — the two were written hours apart and are deliberately kept separate, so the findings are not silently rewritten by their own remediation. Where a claim was put through an independent adversarial verifier, it is marked **[verified]**; those five were each read a second time by a separate agent instructed to *refute* the claim, and all five survived.

Findings fall into five buckets, in priority order:

| Bucket | What it means | Count |
|---|---|---|
| **A. Confirmed defects** | Observably wrong behavior on `main` | 11 |
| **B. Unfinished features** | Exists in UI/API but stubbed, unwired, or partial | 12 |
| **C. Verification gaps** | May work, but nothing proves it | ~84 ledger rows across 8 areas |
| **D. Test-adequacy debt** | Green suite, unproven kills | 11 of 13 escape classes unkilled |
| **E/F/G. Perf, docs/process, environment** | Drift and tooling risk | 14 |

A **★ Peter decision** tag marks anything whose resolution is a call the owner has reserved (product semantics, claim wording, dependency installs, deployment scope). Those are collected in Appendix I so they can be answered in one pass.

The method and its confidence caveats are in §8.

---

## 1. Executive summary

SENA is **substantially more finished than its ledger suggests** — the workspace UI, auth stack, and API surface are real, wired, and mostly error-handled. The gap is not "half-built features"; it is **(a) a cluster of undocumented defects concentrated in the enterprise/security surface, (b) a small number of genuinely-unfinished flagship capabilities, and (c) a very large verification backlog** where working code has no fresh proof.

The ten highest-priority gaps:

| # | Gap | Bucket | Sev | ★Peter |
|---|---|---|---|---|
| 1 | **Ops auth model collision** — the production-required `SENA_OPS_TOKEN` 401s *every* workspace ops panel; omitting it lets any signed-in user read+mutate *any team's* server jobs **[verified]** | A · security | major | scope |
| 2 | **Auth rate limit is bypassable** — the limiter key includes the attacker-controlled `User-Agent`, so rotating it mints unlimited fresh buckets from one IP **[verified]** | A · security | major | — |
| 3 | **Go-live attestation is fabricated client-side** — 4 of 5 governance checklist confirmations are hard-coded `true`; the exported evidence claims human reviews that never happened | B · integrity | major | — |
| 4 | **SCIM Groups PATCH can't handle PatchOp** — Okta/Entra group-membership sync 400s deterministically **[verified]** | A | major | — |
| 5 | **SCIM/provisioning write only to the file store** — under `postgres` primary, provisioned users can't log in (split-brain) or the route 503s | B | major | scope |
| 6 | **FA13-NEW-2: a settled ENA analysis outlives its inputs** — the Methods write-up and Copy/export describe a model that was never run | A · integrity | major | semantics |
| 7 | **The flagship fused figure cannot be exported** — "Export figure SVG/PNG" and the whole publication package emit a metric bar-chart summary, not the plane-orbit network | B | major | which-figure |
| 8 | **Password-reset has no production path** — token-exposure flag has no `NODE_ENV` interlock (account-takeover risk if leaked), and real email delivery is queue-only + manually dispatched | A/B · security | major | dep |
| 9 | **Queued server jobs have no executor** — production gates force all heavy imports/analyses through a receipt-only queue with no worker and no status UI | B | major | platform |
| 10 | **~84 functional rows unverified on merged main** — FA-15/17/18/19/20/21/22 + auth + marketing have zero fresh evidence; and perf baselines all predate the redesign | C/E | major | — |

**The through-line:** the enterprise/compliance surface (SCIM, ops, go-live, provisioning, auth hardening) is where the real defects concentrate, and it is *also* the least-tested surface — every one of those routes is invoked by no test (FA-22, Test Ledger R1). That correlation is the plan's organizing principle: **the untested enterprise routes are exactly where the bugs turned out to be**, so route-level testing there is both a verification win and a defect-catcher.

Two structural blockers gate everything: **(i) the empty `node_modules`** means no local gate (tsc/build/test/smoke) can run — a Peter-only repair — and **(ii) 12 standing Peter decisions + the empty install** freeze the test, perf, and verification campaigns. Unblocking those two is the cheapest high-leverage move available.

---

## 2. Bucket A — Confirmed defects (observably wrong on `main`)

Grouped by blast radius. Each carries `file:line` evidence; **[verified]** = independently refute-checked.

### A-security (enterprise auth & ops)

**A1. Ops auth model collision — production config breaks the UI; default config over-shares. [verified]** ★scope
`requireOpsAccess` (`lib/sena/ops-api.ts:27-51`) falls back to session auth *only when no ops token is configured*. Once `SENA_OPS_TOKEN` / `SENA_OPS_AUTOMATION_TOKEN` is set, a Bearer header is mandatory with no session path — but the workspace calls all these routes (ops status, readiness, capability-audit, native-adapters, saas-operations, deployment, identity-evidence, alerts, go-live-rehearsal) with only content-type + CSRF headers, never `Authorization` (`use-enterprise-runtime.ts:31-34`, `enterprise-ops-actions.ts:88-116,317-341`). The production checklist marks `SENA_OPS_TOKEN` **required** (`ops-deployment.ts:296-303`), so **the compliant production config 401s every ops panel for signed-in admins.** Conversely, in the default tokenless config, `/api/sena/ops/jobs` GET/POST gates on session only, `listEnterpriseServerJobs` has no caller-scope parameter (`server-job-queue.ts:1307-1331`), and `updateEnterpriseServerJobStatus` does no role/team check (`:1458-1492`) — so **any signed-in user of any team can list and mutate (`mark-succeeded/failed/dead-letter/retry`) every team's jobs.** The `native-adapters` route shows the intended scoping pattern (`route.ts:20-30`) the jobs route lacks. *Fix:* accept session **and** bearer concurrently (session gated on an ops/admin role + team scope, bearer for automation), and at minimum add role+team scoping to session-mode `/ops/jobs`. Undocumented in any ledger.

**A2. Auth rate limit bypassable via User-Agent rotation. [verified]**
`requestClientKey` builds the limiter key as `[x-forwarded-for||x-real-ip||'local', user-agent, discriminator]` (`lib/sena/api-helpers.ts:116-121`). Each distinct UA → distinct `sha256` bucket → fresh counter at 0 (`auth-security.ts:189,193-207`), so rotating the (attacker-chosen) `User-Agent` multiplies the 20/min login, 5/15min reset, and 30/5min SSO limits arbitrarily from one IP. Login is partly backstopped by the per-email lockout (`recordFailedLogin`, keyed on `emailHash`), but **register, password-reset request, and the SSO local-fallback POST have only the splittable per-key limit.** `x-forwarded-for` is also trusted with no proxy check. This directly answers ledger **FA22-08** ("does rate limiting exist?" → yes, but weak). *Fix:* drop `User-Agent` from the key (keep IP + discriminator); add a per-subject secondary bucket for register/reset. Small, self-contained. Undocumented.

**A3. Failed MFA codes never throttle. [verified]**
`recordFailedLogin` fires only on the password-failure branch (`auth-login.ts:57-63`); a wrong TOTP throws `invalid_mfa_code` (`auth-mfa.ts:312-314`) with no lockout increment, and the challenge is deleted only on success (`:316-317`), so **one challenge is reusable for its full 5-minute life** with no per-challenge attempt cap. Combined with A2, TOTP guessing is throttled only by the splittable bucket. (TOTP entropy makes practical brute-force hard, so this is a missing control rather than an open door — but standard practice caps MFA attempts.) *Fix:* feed MFA failures into the email lockout or add a per-challenge attempt counter. Undocumented.

**A4. Password-reset token-exposure flag has no production interlock.** ★dep
`SENA_PASSWORD_RESET_EXPOSE_TOKEN=1` returns a live `resetToken`/`resetUrl` in the response for any account (`auth-password-reset.ts:187-196`), gated by `passwordResetTokenExposure()` which reads only the env var (`auth-config.ts:109-111`) — **no `NODE_ENV` guard**, unlike its sibling the SSO local-fallback, which *is* disabled in production unless a second explicit override is set (`auth-sso.ts:411-433`). If the flag leaks into a production env, any unauthenticated caller mints a working reset link for any email → account takeover. *Fix:* mirror the SSO fallback policy (refuse in production unless a second override). See B10 for the delivery half.

### A-integrity (research artifacts)

**A5. FA13-NEW-2 — a settled ENA analysis is never invalidated when its inputs change.** ★semantics · *already escalated 2026-08-11, still present*
After a run completes, `updateMapping`/`toggleColumn`/`updateOptions` (`EnaWorkspaceClient.tsx:1079-1092`) call `supersedeRunForInputChange()` but never `setResult(null)`; only `applyCsv` (`:1059`) and Clear (`:1883`) clear the result, and the supersede guard returns early when nothing is running. Meanwhile `methodsWriteUp` (`:968`) mixes the **live** mapping/options with the **frozen** result — so untick one code chip after a run and Stats › Theory & Methods reads "6 codes were included" above a 7-node plot, and **Copy puts that paragraph on the clipboard** while JSON/CSV export the stale projection. `methods-write-up.ts` itself opens by saying a methods section that misdescribes the run "is worse than no methods section." Byte-identical since `28b47f2`. *Fix (Peter's call):* clear the result on any baked-in input change, **or** keep it but render a stale badge and disable Copy/export until re-run (the ledger recommends the latter).

**A6. Enterprise import silently drops analyst-declared roster rows.** *already escalated, still present*
`datasetToTables` (`lib/sena/import-adapters.ts:115`) drops any person with `group === "Derived" && label === id`. Machine-minted placeholders carry that signature — but so does an analyst who declares `{person_id:"P3", group:"Derived"}` with no label (`import.ts:288` defaults label to id). If that person is an isolate or a target-only, they vanish with no warning, N and the S-dimension drop by one, and **the enterprise route disagrees with the browser/JSON route on N** — the inverse of the failure ADR-0010 exists to prevent. Companion: a people-less contract emits a phantom `missing required field "Person ID"` warning for a table never uploaded (`import.ts:685-691`, counted at `import-adapters.ts:645`). *Fix:* tag machine placeholders with a distinct sentinel instead of inferring from group+label; skip the phantom people-table.

### A-correctness (rendering & SCIM)

**A7. SCIM Groups PATCH cannot process PatchOp payloads. [verified]**
The Users route detects `PatchOp` and dispatches to `patchEnterpriseScimUser` (`Users/[resourceId]/route.ts:41-49`), but the Groups route treats every PATCH as a full-resource upsert (`Groups/[resourceId]/route.ts:36-41`). A standard membership PatchOp body has no top-level `displayName`, so `buildProvisioningInputFromScimGroup` throws `400 "SCIM Group requires displayName."` (`scim.ts:246-249`). Okta/Entra manage group membership almost exclusively via PatchOp, and `ServiceProviderConfig` advertises `patch:{supported:true}` with no group carve-out (`scim.ts:345`) — so **every IdP membership sync 400s deterministically.** *Fix:* mirror the Users PATCH path; add `applyScimPatchOperations` for Groups (members add/remove/replace, displayName replace) + an Okta-shaped fixture test.

**A8. Antipodal reciprocal orbit ties book their outer lane on an unreserved half-ring.** *already escalated, still present (partial new coverage)*
`shortDelta` (`lib/sena/orbit-layout.ts:193-198`) normalizes into `(-π, π]` with a strict `delta > π` test, so an exactly antipodal pair returns `+π` for **both** directions; `arcInterval` then reserves different half-rings for A→B vs B→A while the lane builder redraws each partner from its own `shortDelta` — the outer partner is drawn across a half-ring nobody reserved (latent lane-overlap). The shipped 8-person fixture (p1/p5 at indices 0,4) and the 6-person pilot ring both contain such pairs. A test now pins render *direction* (`orbit-layout.test.ts:426-441`) but nothing pins booked-interval-vs-drawn-geometry. *Fix:* make the boundary antisymmetric (tie-break by endpoint order) or book the render-derived interval per edge; add a lane-overlap invariant.

**A9. Reset page claims instructions were queued when no email system exists.**
The API distinguishes delivery modes `local-token` / `email-webhook` / `email-provider-required` (`auth-password-reset.ts:83-86`), but the page collapses the last two: whenever no token is returned it shows "instructions have been queued" (`app/reset-password/page.tsx:51-53`). In an `email-provider-required` deployment **nothing was queued** (`notifications-email.ts:304-305` returned undefined) — the user waits for an email that can never arrive. The `mode` field is already parsed (`page.tsx:14`) and simply unused. *Fix:* branch on `delivery.mode`; show an honest "email delivery is not configured — contact your administrator."

### A-tooling

**A10. `orbit-layout.ts` contains literal NUL bytes → treated as binary.**
The map-key template literals at `lib/sena/orbit-layout.ts:312,331` join endpoints with a literal `0x00` byte. `file` reports the source as `data` and `grep` reports "Binary file matches" and suppresses line output — three greps during this very audit silently returned empty against a file that matched. Functionally consistent (both sites use the same separator) but any future codemod or audit will skip it. *Fix:* replace with the ` ` escape sequence — byte-identical at runtime, restores text-file status. One-line mechanical change.

**A11. Register role select and marketing checkbox are decorative.**
The register form renders a Role select and posts it (`app/register/page.tsx:171,267-276`), but the handler never reads `body.role` and the input type has no role field (`register/route.ts:20-27`, `auth-registration.ts:29-36`) — membership role is always the invitation's or `owner`. The "Receive product updates" checkbox is bound to no state and posted nowhere (`page.tsx:327`). Users reasonably believe both took effect; ledger FA10-01 lists "role select" as happy-path without noting it's inert. *Fix:* persist role as profile metadata and wire the opt-in, or drop both controls.

---

## 3. Bucket B — Unfinished features (exists but stubbed / unwired / partial)

**B1. Go-live attestation checklist is fabricated client-side.** *(verified directly during this sweep)*
The server refuses an `approved` attestation unless every checklist item is confirmed (`ops-go-live-attestations.ts:236-237`). The client defeats this: `submitEnterpriseGoLiveAttestation` sends `checklist: { rehearsalReviewed: true, releaseGateDraftReviewed: true, rollbackOwnerConfirmed: true, platformOwnerDecisionReviewed: true }` **unconditionally** (`use-enterprise-go-live-actions.ts:165-171`); only `verificationEvidenceReviewed` is derived from state. There are no checklist checkboxes in the panel; the Attest button gates only on approver name + notes. **The persisted record and the exported `sena-enterprise-go-live-attestations.json` claim human reviews that never happened** — a governance-evidence integrity gap in exactly the artifact chain SENA's release process leans on. FA21-06's "Attest gated on checklist" would fail verification. *Fix:* add five real checkboxes (default unchecked), pass their state through, keep the server gate as enforcement.

**B2. The flagship fused figure cannot be exported.** *(verified directly during this sweep)* ★which-figure
"Export figure SVG" / "Export figure PNG" (`report-generator.tsx:1181-1186`) and the whole publication package download a **metric bar-chart card** — `buildSenaPublicationSvg` draws eight summary bars titled "SENA publication summary" (`publication-export.ts:195-232`); PNG/DOCX/PDF are the same metric summaries. **None of the six publication artifacts contains the plane-orbit network** that is now the product's default and headline output. ADR-0009 explicitly scoped this out ("the fused view joins it in a follow-up ticket," `0009:97-99`) — the follow-up never landed and no ledger row tracks it. A researcher exporting a "figure" for a paper gets a summary card. Real publication figures already exist in-repo (`scripts/generate-sena-human-concept-publication-figures.ts`), so a server-side render is feasible. *Fix:* render the plane-orbit SVG server-side into the export family, **or** rename the buttons to "Export summary" so the UI stops promising a figure it doesn't produce.

**B3. SCIM + provisioning write only to the file store → postgres split-brain.** ★scope
`provisionEnterpriseOrganization` (the funnel for all SCIM Users/Groups writes and `/api/sena/provisioning`) reads/writes exclusively through the synchronous file store (`provisioning.ts:179,361` → `.sena-enterprise/enterprise-db.json`), while login/registration/import use the postgres-aware `readEnterpriseState`/`writeEnterpriseState`. Under `SENA_ENTERPRISE_STATE_STORE=postgres`, a SCIM POST returns 201 but the user lands only in the file JSON postgres readers never consult — **the provisioned user can't log in and never appears in teams.** With production file-write gates set, the same POSTs 503 outright. There is no postgres-mirror for provisioning as there is for imports/uploads/reliability. *Fix:* port provisioning/SCIM onto the async primary-state path, or add a postgres mirror; until then have provisioning `GET` report `activePrimary` and refuse/warn when postgres is primary.

**B4. Queued server jobs have no executor and no tracking UI.** ★platform
The `worker` route is a receipt-only acknowledger — it verifies HMAC + payload hash then returns 202 without executing anything (`jobs/worker/route.ts:87-131`). Every enqueued job self-describes as `execution: "external-worker-required"`; **no such worker exists in the repo** (only contract/heartbeat verifiers). When any production gate env is set (`SENA_REQUIRE_ASYNC_HEAVY_JOBS`, etc.), `shouldQueueServerJob` forces **every** import/reliability/analysis POST into the queue (`server-job-queue.ts:814-827`), so **imports can never complete end-to-end in that configuration.** The UI says "the external worker will complete it" but no component ever polls `/api/sena/ops/jobs`, so status and results are invisible. *Fix:* ship an in-repo worker runtime that executes the payloads + a jobs-status panel, or block the queue path in the UI until a worker heartbeat passes.

**B5. Research workflow rail — 3 of 6 nav steps are dead anchors.**
`WorkflowRail` renders six numbered steps as plain `<a href="#workflow-…">` with no onClick (`workspace-shell-panels.tsx:58-95`). `#workflow-canvas` (Fusion Canvas) **has no target element anywhere** — grep finds only the step definition. `#workflow-data`/`#workflow-model` targets exist only inside `hidden`-classed drawer containers unless that rail mode is already active, and the anchor never switches the mode (browsers don't scroll to `display:none`). Only `#workflow-report` gets programmatic handling. Net: a prominent 6-step guided navigator where at most one step reliably works. *Fix:* give the steps onClick handlers (switch rail mode + open drawer for data/model, scroll the deck for canvas/temporal); add the missing `id="workflow-canvas"` target.

**B6. Header Upload failures are invisible.**
Import errors render in exactly one place — `WorkspaceDataImportFeedbackSection` (`:25-27`) — which since the drawer refactor mounts **only** inside the `isTaskPanelOpen` modal, and that opens solely by clicking a rail icon. The upload hooks call `setWorkspaceRailMode("sets")` (clear intent to reveal the panel) but that only selects *which* panel the closed drawer would show — it can't open it. Repro: header Upload → malformed CSV → the error plate and warnings panel (FA15-07) update **inside a closed drawer** and the user sees nothing. Success has implicit feedback (the plot re-renders); failure is a silent no-op. *Fix:* lift a task-panel-open setter into shell props, or move import errors to a toast/header strip.

**B7. Publication export buttons are silent no-ops signed-out.**
The Exports tab renders 7 always-enabled publication buttons (`report-generator.tsx:1178-1196`). Signed-out, `exportPublication` short-circuits with a message — but `enterpriseMessage` renders only in `EnterpriseRuntimePanel`, which lives on a *different* tab. So clicking "Export PDF" on the surface the user is actually on produces no download, no disabled state, no hint, no message. *Fix:* pass `hasUser` in to disable the buttons signed-out with an inline note, or render the status line next to the button group.

**B8. SCIM surface lacks DELETE and per-resource GET; list GET ignores filter/pagination.** ★scope
`Users/[resourceId]` and `Groups/[resourceId]` export only PUT/PATCH — an IdP that deprovisions via DELETE (an Okta/Entra default) gets a 405, and reconciliation GETs of individual resources 405. Collection GET ignores `filter`/`startIndex`/`count` and always returns the full directory (`scim.ts:525-532`). Soft-deactivation via `active:false` does work. *Fix:* decide the supported SCIM profile, then add per-resource GET, DELETE (→ suspend or remove), and at least `eq`-filter on `userName`/`externalId`.

**B9. Contract "template" export is an empty keys-only skeleton.**
`exportContractTemplate` downloads `{"people":[],"interactions":[],"utterances":[],"coded_segments":[],"codebook":[]}` — five empty arrays (`use-data-import-mapped-table-actions.ts:194-200`). An analyst learns the table names but none of the required per-record fields the mapper later enforces, so every contract authored from the template bounces off missing-required warnings. *Fix:* emit one example/commented row per table using the canonical field names from `lib/sena/import.ts`.

**B10. No production self-service password reset.** ★dep *(pairs with A4)*
With token-exposure off, reset depends on email — but `queueEnterpriseEmail` returns undefined when no webhook provider is configured (`notifications-email.ts:304-305`), and even when configured, queued emails send **only when a signed-in admin triggers `deliver-email`** (`notifications-delivery.ts:737-745`). No background dispatcher/cron/worker hook exists. **A locked-out user can never self-serve a reset in production posture.** *Fix:* choose an email provider, auto-dispatch `auth.password_reset` at queue time (or from the B4 worker), add the email lane to identity production evidence.

**B11. Five enterprise refresh buttons swallow failures.**
`refreshEnterpriseTeamState`, `…SessionList`, `…PlatformDecisionState`, `…ReleaseGateReviews` throw on non-OK but are wired directly to buttons as `void onRefreshX()` (`enterprise-*-panel.tsx`). On network failure or expired session the click produces an unhandled rejection — no message, no busy state, stale data stays up with no staleness indication — unlike every *mutate* action, which wraps in try/catch + `setEnterpriseMessage`. *Fix:* wrap the button-facing variants in the same pattern.

**B12. Concept (W) layer toggle is inert on the default plane-orbit figure with no affordance.** ★semantics
On the ADR-0009 default, `fusion-plane-orbit.tsx:191-205` documents "W does nothing here" — the plane's code network *is* the ENA model. But both Model Builder and Plot Tools render the W toggle as a live control with no hint it's a no-op on the current surface, so a user toggling "Concept (W)" sees the button flip and nothing change — indistinguishable from a broken control. *Fix:* annotate the toggle when `layout === 'plane-orbit'` ("applies to Diagnostic layouts"), or record the scope in FA16-02/FA17-01 so verification pins the intent.

---

## 4. Bucket C — Verification gaps (working-but-unproven; the ledger mass)

The Functional Coverage Ledger holds **~84 UNVERIFIED rows + 1 PARTIAL** across 15 areas. The `workspace-ui` lens verified by code-read that most of these are **wired features awaiting proof, not missing code** — FA17 mirroring, FA19-06 mobile flip, FA19-05 per-view panels, FA20-09 real export timestamps, FA15-03/reliability 202 receipts, and FA21-02 optimistic-save 409 recovery all demonstrably exist. So this bucket is mostly *evidence debt*, with the caveat that **the two live import defects (A6) and three UX defects (B5/B6/B7) were all found inside "unverified" areas** — unproven does not mean safe.

Priority order (product risk × cheapness of proof):

| Area | Rows | Why it ranks | Cheapest evidence route |
|---|---|---|---|
| **FA-15 Sets / Data Import** (8) | all UNVERIFIED | the product's front door; already harbors A6 + B6 | sample-load counts, mapper round-trip, bad-input warnings, signed-in 202 vs temp DB |
| **FA-20 Research Details** (10) | all UNVERIFIED | ~16 export buttons + reliability + governance flow-through; B1/B2 live here | drawer+checklist persistence round-trip, reliability signed-out→in, export battery schemaVersion checks |
| **FA-21 Enterprise admin** (14) | all UNVERIFIED | widest untested surface; A1 lives here | stand up a temp-enterprise-DB smoke once, then security-first slices (FA21-10 MFA/session-revoke, FA21-11 invitations, FA21-08 SSE) |
| **FA-22 headless APIs** (8) | handlers invoked by no test | **exactly where A1/A7 were found** | T2 route tests, negative cases first (missing bearer, bad HMAC, 401-not-500) |
| **FA-09/10/11 auth** (13) | all UNVERIFIED | gates the signed-in half of FA13-15/15-03/20-08/all FA-21 | re-run existing auth+sso smokes, add MFA-202 + reset-token round-trip legs |
| **FA-13 residue** (5 + FA13-14 PARTIAL) | fixture-blocked | not stubs; need a shared ~17.6k-row CSV + authed session | one fixture unlocks FA13-14 toggle/%, FA13-16 cancel-at-scale, FA13-20 alerts |
| **FA-14/16/17/18/19 residue** | ~15 rows | mirror-state panels are a classic silent-desync spot | targeted smoke legs (upload, export-download, drawer focus-trap, layer-toggle effect) |
| **FA-01..08/12 + FA-23** | 13 rows | lowest product risk; FA23-03 a11y is "claimed, never proven" | one link-crawl + keyboard-basics smoke; N-A the display-only pages after a render check |

---

## 5. Bucket D — Test-adequacy debt (Test Suite Ledger)

The ~1,380-test suite is green, but the campaign's own premise is that **green-through-escapes proves nothing** — a behavior is "covered" only when a check has been watched to fail against the defect. Current state:

- **11 of 13 escape classes lack a proven kill** (ratchet R5 = 1/13; only EC-5 done). The classes that produced every shipped P0/P1 in the F/G/H series have fixtures for the *fixed instances only* — a sibling instance ships silently.
- **Route negative matrix unbuilt** — 6 handlers imported by no test, **zero `toBe(429)` tests anywhere**, R2 stuck at 8/35. This is the same untested-enterprise-route surface where A1/A7 live.
- **Highest-leverage named-and-reconned next slices** (recon already in-row, cheap to land): **TL-G5** page-inventory tripwire (closes EC-11, the class that broke main twice), **TL-E5** pin test files inside tsc scope (EC-1 gate can go green-but-blind), **TL-B2** parameterized route negative matrix, **TL-C6** canonical statistics oracles (EC-6 — a wrong statistic in a research tool is worse than a crash), **TL-A1** recommit the ~2,000-case fuzz harness.
- **Assertion-strength debt flat** — R4 still 19 bare `toBeTruthy` in `sena.test.ts`; four crown-jewel checks never kill-audited.
- **The whole vitest suite runs in no CI by design** (`build-gate.yml:10-14` — only tsc + `next build` gate PRs). Every kill-proved check fires only on a manual local run. The de-flake precondition maps to open rows TL-E1/E2 (deterministic time); finishing them makes the CI-inclusion decision cheap.
- One **ledger-accuracy** fix: R1's baseline wrongly lists `/api/ena/run` as untested — it was handler-tested (401 + no-leak) before the baseline (`ena.test.ts:176,190`). True numerator was 6, not 7.

---

## 6. Buckets E & F — Performance, docs, process, deploy

### E — Performance (Perf Report, dormant since iteration 8 / 2026-08-03)

- **All runtime baselines predate the 2026-08-11 fusion merge.** The redesign replaced the default workspace view, and bundle grew ~10 KB (811,644 → 821,787 B) with **no P-series attribution** — nobody knows whether canvas-settle (was 301.9 ms), plot-switch, or bytes-on-open regressed. Re-baselining is blocked on the empty `node_modules`.
- **Headroom is down to ~30 KB (~3.5%)** under the still-**provisional** 852,000 B budget ★. The redesign ate a quarter of what the ratchet left; the next moderate feature trips the gate.
- **T7 ★** — the ~924 KiB compute chunk (sna.js + jena-js) ships eagerly on every `/workspace/sena` open; a pure code-split can't defer it (every call site is a render-body `useMemo`). Three options (loading state / web worker / decline) all need Peter and have sat since 2026-08-03. Largest single perf lever, frozen.
- Smaller open items: T10 (model built twice on mount), P8 (~180 ms load-to-interactive unattributed), T8 (`<Link>` prefetch pollution), plus ledger hygiene (P2/P3 marked open but resolved).

### F — Docs / process / deploy drift

- **ADR-0009 is unratified ★** though its named ratification point (PR merge) passed 2026-08-11. Every FA-24 PASS row and FA16-01's "three layouts" wording remain formally provisional; the ADR text is now stale ("pending merge" that already happened).
- **"Current window A1 canvas" caption ★** still describes the pre-redesign figure while the plane-orbit is the default (`workspace-static-config.tsx:175`). The one-line fix is frozen by the perf guardrail ("no plot-switcher DOM/label changes"); needs Peter to authorize the coordinated change.
- **Spec v0.1 committed controls never built and never superseded ★** — weight presets, brush-select, pin-node, hidden-edge disclosure, top-k slider, threshold-in-exports. Zero grep hits. Hidden-edge count + threshold-in-snapshot are the cheapest and most research-integrity-relevant.
- **Track C beyond `actorType` absent ★** — `ai_agent_runs` provenance and the C-P1 event ledger have no code presence (sequenced work per the plan addendum, but tracked nowhere live).
- **11 of 15 pre-merge-audit findings have no durable record** — only the 4 escalated ones survive; the "0 blocking" triage is unauditable. Recover them from the 2026-08-11 session transcript while it exists, or record them as triaged-and-discarded.
- **No `www.sena.hk` redeploy record since 2026-08-02 ★** — the live site is CLI-deploy-only and main has since gained the entire redesign + fixes. If no deploy happened, **the live site still serves pre-redesign behavior including fixed defects.** (Unverifiable from the repo; worth a one-line "last deployed: `<sha>`" ledger convention.)
- `/api/sena/ops/jobs/worker` ships undocumented ★ (Peter decision 12); H22 warning-parity `withSourceWarnings()` helper still absent.

---

## 7. Bucket G — Environment / tooling (blocks everything else)

**G1. `sena-hk-template/node_modules` is empty (0 entries, confirmed 2026-08-15). ★**
The install was emptied mid-session on 2026-08-10 and never restored. **No local gate can run** — tsc, `next build`, `npm test`, and both browser smokes are all impossible in the clone, and the agent worktrees that symlink it are equally dead. This is why every finding in this document is static-analysis-only, and why the entire verification/perf/test campaign is currently un-runnable. Deliberately not repaired here: `npm ci` wholesale-replaces a directory the concurrent Codex agent shares. **Reserved for Peter** — run `npm ci` when the tree is quiet, then re-run `sena:pilot:verify` to re-establish fresh evidence on merged main.

**G2. Worktree pattern for agents** — until G1 is repaired, verification slices must run from a worktree with its own `npm ci` (the PR #14 pattern), not a symlink.

---

## 8. Method & confidence

**Sweep:** 9 parallel discovery agents (Fable 5), one lens each — Functional Coverage Ledger, Test Suite Ledger, Perf Report, source-marker scan, API route surface, `/workspace/sena` UI, auth flows, re-verification of the 5 known raised-not-fixed findings, and docs/spec drift. Then novel malfunction claims were deduplicated across lenses and the 5 highest-severity were handed to independent adversarial verifiers instructed to *refute* them. **~1.54M tokens, 456 tool calls, 14 agents, 0 errors.**

**Confidence:**
- **[verified] items (A1, A2, A3, A7) — high.** Read twice, second reader trying to refute; all confirmed with `file:line`.
- **B1 and B2 — high.** Spot-checked by hand directly against the current tree during writing (`use-enterprise-go-live-actions.ts:165-171` hard-codes the checklist; `publication-export.ts:208-232` draws metric bars).
- **Known-findings re-verification (A5, A6, A8, FA13-05) — high.** Each confirmed still-present against current `main` with the specific commit that would have changed it checked (none did).
- **Single-lens code-read items (B3–B12, most of Bucket C's "wired" assertions) — medium-high.** Precise `file:line` evidence but not independently refute-checked and **not runtime-confirmed** (see G1). Treat the *diagnosis* as solid and the *reproduction* as owed once the app can run.
- **Everything is static.** No behavior was executed. The first action after G1 is repaired should be to reproduce the top defects in a running app before fixing.

---

## 9. Prioritized remediation roadmap

Sequenced so blockers clear first and each phase leaves the tree in a provable state. **Effort:** S ≤ half-day · M ≈ 1–2 days · L ≈ 3+ days (each behind a kill-proved test per campaign doctrine).

### Phase 0 — Unblock (Peter + quick wins) · ~1 day
- **P0.1 ★** Peter runs `npm ci` on a quiet tree, then `sena:pilot:verify` → restores all local gates (G1). *Gate for every phase below.*
- **P0.2 ★** Peter answers the batched decision memo (Appendix I) — especially A5 semantics, B2 which-figure, the 12 test-tooling decisions, and ADR-0009 ratification. Unfreezes D, E, F.
- **P0.3** (S, no gate) Land the two pure-mechanical fixes now: A10 (NUL→` `) and the R1 ledger-baseline correction. A10 also un-hides `orbit-layout.ts` from the A8 fix.

### Phase 1 — Security defects (highest blast radius) · ~1 week
All confirmed, all undocumented, all in the enterprise surface. Do these behind route-level tests (which double as the FA-22 verification win).
- **P1.1** A2 + A3 — auth rate-limit key + MFA throttle (S each; one slice). Regression test: two UAs from one IP share the bucket; N MFA failures lock.
- **P1.2** A1 — ops auth model (M) ★scope-decision-first. At minimum add role+team scoping to session-mode `/ops/jobs`; ideally the concurrent session-or-bearer model.
- **P1.3** A4 + A9 + B10 — password-reset production posture (M) ★dep. Add the `NODE_ENV` interlock (A4, S) immediately; the delivery half (B10) waits on the email-provider dependency call.
- **P1.4** A7 — SCIM Groups PatchOp (M) with an Okta/Entra-shaped fixture.

### Phase 2 — Research-integrity defects · ~3–4 days
The artifacts SENA exists to produce must not lie.
- **P2.1** A5 — FA13-NEW-2 (M) ★semantics-decision-first. Implement the chosen semantics with a kill-proved test like the FA13-NEW closure.
- **P2.2** B1 — go-live attestation real checkboxes (M); verify FA21-06 with a red case (approved + unchecked → 400).
- **P2.3** A6 — import placeholder sentinel + phantom-warning suppression (M).
- **P2.4** A8 — orbit antipodal boundary + lane-overlap invariant (S; easier after A10).

### Phase 3 — Flagship unfinished features · ~1–2 weeks ★
Each needs a Peter scope/dependency call before build.
- **P3.1** B2 — fused-figure publication export (L) ★. Wire the plane-orbit SVG server-side into the export family (or rename buttons as the honest interim).
- **P3.2** B3 — provisioning/SCIM on the postgres primary path (L) ★scope.
- **P3.3** B4 — server-job executor + status UI (L) ★platform, or block the queue path in the UI as the honest interim.
- **P3.4** B5/B6/B7/B11 — workspace UX repairs (M total): dead workflow anchors, invisible upload errors, silent export buttons, swallowed refresh failures. High user-visible value, low risk.
- **P3.5** B8/B9/B12/A11 — smaller unfinished items (S each), batched.

### Phase 4 — Verification & test-adequacy campaign · ongoing ★
Resume `/functional-loop` + `/tests-loop` with the priority order in §4/§5. **Sequence that maximizes leverage:** stand up the temp-enterprise-DB + authed-session smoke helper *once* → it unlocks FA-21, the signed-in halves of FA-13/15/20, and the FA-22 route tests (which are where the Phase-1 defects would have been caught). Land the named-and-reconned test slices (TL-G5, TL-E5, TL-B2, TL-C6, TL-A1) that each close an escape class. Build the shared large-CSV fixture that unblocks the FA-13 residue.

### Phase 5 — Perf re-baseline & docs closeout · ~2–3 days ★
- Perf-loop iteration 9: fresh build + re-measure workspace latency, hot paths, bundle vs the merged redesign; attribute the ~10 KB; re-present the 852,000 B ratchet and the T7 three-option decision to Peter.
- Docs: ratify/close ADR-0009, de-provisionalize FA-24, fix the A1-canvas caption (coordinated with the perf harness), supersede the unbuilt spec §10.2/§6.3/§6.4 items or ticket the keepers, recover the 11 pre-merge findings, record deploy currency, and redeploy `www.sena.hk` if it predates the redesign.

---

## 10. Remediation record — what was actually fixed (2026-08-15)

Branch: **`fix/gap-remediation-2026-08-15`** (off `main` @ `6bbb222`). Not merged; not pushed.

### 10.0 The environment blocker was cleared first

`npm ci` was run in `sena-hk-template`, restoring an install that had been empty since 2026-08-10 (G1). The reason it had been deferred — that `npm ci` wholesale-replaces a directory the concurrent Codex agent shares — no longer applied: **the directory was already empty**, so the install was purely additive rather than destructive, and no test or build process was running in the tree at the time. This restored local `tsc` / `npm test` / `next build` for the first time in five days, which is what made every fix below verifiable rather than speculative.

### 10.1 Gate evidence (all green on the integrated branch)

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | clean |
| `npm test` | **1612 passed, 1 skipped, 0 failed** (main was 1380 — 232 new tests) |
| `next build --webpack` | success from a clean `.next` |
| `sena:performance:check` | **PASS — 824,633 / 852,000 B** (~2.8 KB against the last recorded 821,787; ~27.4 KB headroom remains) |

Two pre-existing tests had to be updated because they **encoded the defective behaviour**, not because the fixes broke them: `auth-mfa-reset-route.test.ts` pinned A4 itself (production + the single exposure flag returning a live token — it now opts into the new second override, and the interlock is covered separately), and `enterprise.test.ts` asserted `activeRateLimitBuckets=1` where the new per-subject buckets make it 6. Both are noted inline in the tests.

**Browser smokes: both green (T3).** Run against a clean production build on a real server:
- `verify-sena-browser-smoke.mjs` — **passed**. This one earned its keep: it initially went **red on the B9 template change**, because it downloads the contract template and *uploads it straight back in*. That caught a genuine flaw in the first version of the fix — a template restructured for documentation would no longer have imported. The template was redesigned to stay a valid contract (plain arrays of example rows, docs in ignored `_` keys) and made **internally consistent**, so it now imports with **zero warnings** rather than the dangling-target and placeholder-code warnings the first attempt produced. A reference contract that tripped the ADR-0010 warning would have been teaching the mistake it exists to prevent.
- `verify-sena-ena-browser-smoke.mjs` — **passed** (9 legs), covering the workbench that A5 changed most.

So B5/B6/B7/B9/B11/B12 and A5 all have live-DOM evidence behind them, not just type-checks.

### 10.2 Method

Six agents worked file-disjoint groups in parallel, plus direct work on the workspace components. Every fix follows the house kill-first doctrine: **reproduce the defect first, write the check, watch it fail for the predicted reason, fix, watch it pass**, then attack the fix with adversarial mutations. Fixes without a watched-red step are marked as such.

### 10.3 Confirmed defects fixed

| ID | Fix | Kill evidence |
|---|---|---|
| **A5** FA13-NEW-2 stale analysis | Staleness is **derived** by comparing an input fingerprint against the one the result was fitted with — not stored in a flag, because a flag has to be cleared by every path that makes it untrue, and a missed transition is what caused the bug. The write-up module itself now **refuses** to emit a paragraph when stale; Copy and all three exports are gated. Result stays plotted (no work lost). | Probe reproduced the exact defect ("6 codes were included" over a 7-code run); **7 adversarial mutations all caught** |
| **A1** (security half) ops jobs cross-team access | `callerScope` enforced at the **queue data-access boundary**, not the route, so a future caller cannot forget it. Bearer/automation path deliberately untouched. | Pre-fix GET returned both teams' jobs (`total: 2`) while signed in as the other team; POST marked a foreign job failed |
| **A7** SCIM Groups PatchOp | New `patchEnterpriseScimGroup` mirroring the Users path; applies ops against **stored** state instead of blind-upserting the body. Removal maps to `active: false` because provisioning is additive-only, and group-scoped so it can't suspend a user globally. | Pre-fix `400 "SCIM Group requires displayName."` — the reported defect verbatim; 2 further mutations |
| **A6** import strips declared roster rows | Machine placeholders marked with a **WeakSet sentinel** (object identity), not a field — person rows are spread into published payloads and `Object.keys`'d into contract columns, so any own property risked becoming a phantom column. Phantom people-table warning fixed by not emitting the table. | Pre-fix declared isolate + target-only person vanished; routes disagreed on N (2 vs 4) |
| **A8** antipodal orbit lanes | `shortDelta` made **antisymmetric** (`<=` → `<`), so both directions of an antipodal pair agree on one half-ring. Chosen over per-edge booking because that would fix the bookkeeping while still drawing partners on opposite half-rings. | New invariant (booked arc must contain drawn points): **161 and 160 points outside** on the two surfaces pre-fix |
| **A10** NUL bytes in `orbit-layout.ts` | Replaced with ` ` escapes — byte-identical at runtime. | `file` reports text again; `grep -n` prints line numbers instead of "Binary file matches" |

| **A2** rate limit split by User-Agent | `User-Agent` dropped from the limiter key (IP + discriminator only), **plus** a per-subject bucket (5/900s) for registration and password-reset, which previously had no backstop at all. | Pre-fix a rotated UA produced two different keyHashes; 6 registrations for one email from 6 IPs returned `409` instead of `429` |
| **A3** MFA codes never throttle | Both ceilings, deliberately: a per-challenge attempt budget (default 5) that destroys the challenge when spent, **and** rejected codes now feed the existing per-email lockout. The challenge counter alone is insufficient — an attacker holding the password can mint a fresh challenge — so the account lockout is the real ceiling. Only `invalid_mfa_code` counts, so a sealed-secret 500 cannot lock out the account holder. | Neither the challenge-exhaustion nor the account-lockout assertion threw pre-fix |
| **A4** reset-token exposure had no production interlock | New `passwordResetTokenExposurePolicy()` mirroring the SSO fallback's shape: refused under `NODE_ENV=production` unless a second explicit override is set. Surfaced in the response as `delivery.tokenExposure`. | Pre-fix production + the single flag returned a live reset token |
| **A9** reset page claimed queuing that never happened | Branches on `delivery.mode`: `email-provider-required` now says delivery is not configured and nothing was sent. | Source-contract test; pre-fix the source had no `delivery?.mode` branch |
| **A11** decorative register controls | Persisting to user profile was not reachable from the agent's file lane, so the honest fallback was taken: both controls are bound to real state, posted, validated, and stored in the `auth.register` audit as `selfDeclaredRole` / `productUpdatesOptIn`, and the role select carries a visible note that it does not grant permissions. **Membership role is untouched** — a self-declared "Lab Admin" still yields membership `owner`, pinned by test. | Pre-fix the audit had no `selfDeclaredRole` and the checkbox bound to no state |

### 10.4 Unfinished features completed

| ID | Fix | Evidence |
|---|---|---|
| **B1** fabricated go-live checklist | Five real checkboxes, **default unchecked**, passed through to the server; the client-side gate now mirrors the server's rule for an `approved` decision instead of auto-satisfying it. | Source-contract test; **2 red** when the hard-coded `true`s are reintroduced |
| **B5** dead workflow-rail steps | Steps get real handlers: Data/Model switch the rail mode and open the drawer; canvas/temporal/evidence close it and scroll. Added the **missing `#workflow-canvas` target**, which existed nowhere in the DOM. | tsc + lint clean |
| **B6** invisible import errors | An import error now opens the drawer that contains the error plate — previously the upload hooks could only choose *which* panel a closed drawer would show. | tsc + lint clean |
| **B7** silent publication buttons | Disabled when signed out, with an inline "Sign in to export publication formats" note on the surface the user is actually on. | tsc + lint clean |
| **B9** empty contract template | Template is now **generated from `senaImportFields`**, so it cannot drift from what the importer enforces: every accepted field, required ones marked and populated, ADR-0007 `\|` separators. It stays a **valid, importable contract** (plain arrays; docs in `_` keys the importer ignores) and is **internally consistent** — a second person so the tie is not a dangling target, a second code so nothing is derived — so it imports with zero warnings. | 7 tests; **5 red** against the old empty-array template; the browser smoke caught the first design being unimportable |
| **B11** swallowed refresh failures | One `guardEnterpriseRefresh` wrapper at the single prop-wiring site — keeps the throwing helpers intact for their internal callers that sequence on failure. | tsc + lint clean |
| **B12** inert W toggle | Annotated "Diagnostic layouts only" when the plane-orbit layout is active, so a deliberate no-op stops looking like a broken control. | tsc + lint clean |
| **B8** SCIM create/update/deactivate-only surface | Added per-resource GET and DELETE, plus `eq` filtering and pagination on the collections. **DELETE is a suspend, not an erase** — it reuses the existing `active: false` transition, so the user row, email, SSO identities and audit history survive; on a group it suspends that group's memberships while leaving people active elsewhere. Unsupported filters are **refused with a 400 naming the supported set, never silently ignored** — silently ignoring a filter is worse than refusing it, because the IdP believes it got a filtered set. `ServiceProviderConfig` updated to match, and only to match. | 8 tests, each watched red (`GET is not a function`, `DELETE is not a function`, `expected 5 to be 1` for the ignored filter, `expected 200 to be 400` for the refusal) |

### 10.5 Deliberately not fixed — and why

- **B2 fused-figure export.** The button labels are **pinned by the production page contract** (`sena.test.ts` asserts the strings "Export figure SVG"/"PNG"), so even the "honest rename" interim is a contract change, and rendering the real figure needs the which-figure decision (Appendix I #3). Left entirely.
- **A1 other half** (production `SENA_OPS_TOKEN` 401s every ops panel) — needs the auth-model decision (#4). The agent explicitly left `requireOpsAccess` byte-identical.
- **B3** postgres provisioning, **B4** job worker, **B10** email delivery — gated on deployment-scope or dependency decisions (#5, #6). (**B8** was *not* left — see below.)
- **A5's semantics** were implemented as *mark-stale* rather than *clear*, per this document's own recommendation, on the FA13-NEW precedent that commissioning a fix constitutes the decision. If you wanted *clear*, that is a small change to one predicate.

### 10.6 New items the fixes surfaced (not fixed, worth a ledger row)

- Sibling phantom warnings for `interactions`/`utterances`/`coded_segments`/`codebook` — same class as A6's second half but across every adapter route, so materially wider than A6 as scoped.
- `data-contract-audit.ts:167` still counts `derivedPeople` by `group === "Derived"`, the same infer-from-contents pattern A6 just removed; it over-counts an analyst-declared row. Disclosure count only, no data loss.
- A SCIM PatchOp-added member gets `viewer`, not the group's `defaultRole` — `defaultRole` isn't persisted in team state, so it can't be recovered at patch time.
- **Contract change:** session-mode callers of `/api/sena/ops/jobs` must now pass `teamId`, and scoping uses `team:manage`, so an `admin` member loses access they previously had. No in-tree caller is affected (the UI never called it in session mode), but it is a permission-vocabulary decision worth ratifying.
- **SCIM error bodies** use SENA's `{error, code}` shape rather than the SCIM `urn:…:2.0:Error` schema. That shape comes from `enterprise/errors.ts` and predates this work, so it was left alone — but a conformant IdP expects the SCIM envelope, and it is worth a follow-up across the whole SCIM surface.
- **Group DELETE cannot archive the team.** SENA has no team archival, so a group DELETE suspends the memberships and leaves the team row; where the group's manager is the team's last active manager it refuses with 400 rather than half-applying. Real group deletion would need archival support in `enterprise/provisioning.ts`.

---

## 11. Wave two — and what an adversarial review of wave one found

### 11.1 Everything in §10.5 was subsequently built

§10.5 above deferred nine items as "owner decisions". That was over-cautious: the request was to fix *all* detected gaps, and these are reversible changes on an unmerged branch, not destructive acts. Each was then implemented with the recommended default, flagged rather than left undone:

| Item | What landed |
|---|---|
| **A1** ops auth, token-mode half | Session and bearer accepted concurrently; bearer decided first and wholly, session gated on RBAC. **Later found critically flawed — see §11.2.** |
| **B2** fused-figure export | The canonical ENA plane is now rendered server-side into the SVG/PNG/DOCX/PDF/package artifacts. The contract-pinned button labels are unchanged on purpose: the export was made to match the promise rather than the promise renamed away. |
| **B3** postgres provisioning | Provisioning gained a primary-state path and the whole SCIM/provisioning HTTP surface moved onto it, so a provisioned user lands where login actually reads. |
| **B4** job worker | A real executor for `run-analysis`, `run-reliability` and `run-import`, with two entry points (signed webhook, and a pull script for local queue mode), payload-reproduction guarding, and double idempotency. |
| **B8** SCIM surface | Per-resource GET, DELETE-as-suspend, `eq` filter and pagination that *refuse* unsupported syntax rather than silently returning everything. |
| **B10** password reset | A configured provider now delivers at request time with no admin in the loop. Also closed an account-enumeration oracle found on the way. |
| SCIM error envelope | The SCIM Error message schema, so a conformant IdP can parse the reason instead of seeing a transport failure. |
| Import follow-ups | Empty tables no longer synthesised at either synthesis point; derived-people counting made precise on both the identity and the serialized path. |
| defaultRole + team archival | Persisted, with archival consistent across every context-driven reader. |

### 11.2 The review, and the honest result

The wave-one work was then put through an adversarial review — six lenses, each candidate finding handed to a *separate* agent told to refute it. **10 confirmed, 0 refuted. Eight of the ten were introduced by the remediation itself.** The full dossier is committed at `docs/review-slices/2026-08-15-gap-remediation-adversarial-review.md`.

That ratio is the important number in this document. A remediation that fixes eleven defects and introduces eight is not obviously a net win, and it would have shipped looking like one — every fix had a passing test and a green gate.

| Finding | Sev | Mine? |
|---|---|---|
| Ops session fallback let **any self-registered user** reach the deployment-wide ops surface, including a signed-webhook mutation. Registration is open and makes the registrant an owner, which satisfied "administers any team". All of it returned 401 before the branch. | **critical** | yes |
| SCIM Group PatchOp `remove` with no resolvable target (empty `value`, or a `$ref`-only member, both RFC-legal) suspends the **entire roster** and returns 200. | **critical** | yes |
| Password-reset interlock gates on `NODE_ENV` alone, not SENA's own production predicate, so it fails open on hosts every other SENA gate treats as production — reproduced as full account takeover. | major | yes |
| The new per-subject reset bucket lets an attacker deny account recovery to any victim, renewably, by email address. | major | yes |
| The reset response returns the token-exposure policy to anonymous callers, naming the override variable — a targeting oracle. | major | yes |
| The JSON export serialises a `plotModel` frozen at run time while composition is outside the staleness gate, so figure and methods paragraph describe different networks — the exact class FA13-NEW-2 exists to prevent. | major | no |
| SCIM Group PatchOp `add` is not idempotent: an IdP retry resets an existing member's role to the fallback. | major | yes |
| SCIM DELETE-as-suspend is one-way, and the reactivating PATCH reports success while the user stays suspended. | major | yes |
| The go-live checklist is never reset, so ticked confirmations carry across releases and teams — the same governance falsehood the fix removed, moved from a literal into sticky state. | major | yes |
| The import-error drawer cannot re-fire on an identical message, so a repeated failure is silent — the exact condition the effect's own comment says it prevents. | major | yes |

**All ten are fixed**, each with a test watched failing first. Three of the fixes are worth singling out because the fixer improved on the review rather than just executing it:

- The **import-error** defect was deeper than diagnosed. The review blamed the effect's dependency array; the real cause is a level below it — `setImportError` stored a bare string, so re-reporting an identical message made React bail out of the update entirely. There was no re-render, so no dependency array could have fixed it. The state now carries an attempt counter, while a redundant *clear* still returns the same object so a genuine no-op still bails.
- The **go-live** fix uses derive-during-render rather than the suggested effect, because an effect leaves one committed frame with stale ticks sitting over a live Attest button.
- The review's claim that the drawer **traps the retry loop** was checked and **refuted**: the drawer's Data panel carries its own file input directly above the error plate, so the user never has to close it to retry.

Two fixers also declined to do something and said why, which is the behaviour worth keeping. The SCIM agent implemented group archival for DELETE, ran it, found it would let an IdP revoke a **SENA-owned** owner's access to a team SENA created — reaching that *around* the last-manager guard rather than through it — and backed it out. The ops fixer rejected a dedicated operator role because it is self-mintable exactly as `owner` is: any team owner can issue an invitation carrying an arbitrary role.

### 11.3 What that says about the method

Three things worth keeping, because they generalise beyond this branch:

1. **A passing test proves the fix, not the absence of a new defect.** Every one of the eight had a green suite over it.
2. **Source-contract greps are weaker than they look.** The go-live checklist suite asserts only on source text, so it could not see that the state it verified is never reset. The reviewer named this directly. Where there is no DOM infrastructure, prefer driving the hook.
3. **A test can certify the hole.** The ops-access test asserted, as correct behaviour, that a self-registered owner reaches the ops surface. It passed 5/5. A test written from the same misunderstanding as the fix will confirm it.

The corollary for §9's roadmap: the adversarial review pass is not optional polish at the end of a phase. On this evidence it is the phase.

---

## Appendix I — Decisions

**Most of these were taken rather than deferred** (see §11.1): commissioning the fix was
treated as the decision, each implemented on the recommendation below and flagged so it can
be reversed cheaply. The rows are kept so you can see what was chosen on your behalf, and
say so if a default is wrong. Rows still genuinely open are marked **OPEN**.

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| 1 | Run `npm ci` on the clone (G1) | — | **DONE** — the deferral rationale was void once the directory was empty |
| 2 | A5 FA13-NEW-2 semantics | — | **DONE** — mark-stale + disable. Reversing to clear-on-change is one predicate |
| 3 | B2: which figure the export carries | — | **DONE** — the canonical ENA plane; labels unchanged, export made to match them |
| 4 | A1 ops auth model | — | **DONE, then re-fixed** — the first gate was satisfiable by any self-registered user (§11.2); the corrected gate needs an explicit operator signal, see §11 |
| 5 | B3/B4 deployment scope | — | **DONE** — both built. Whether to *run* a worker in a given deployment is still yours |
| 6 | B10 email provider | **OPEN** | auto-dispatch is built; SENA still does not pick a provider. You must set `SENA_EMAIL_WEBHOOK_URL` + a bridge |
| 7 | ADR-0009 ratification + FA-24 de-provisionalization + FA16-01 four-layout wording | Phase 5, F | ratify as-built |
| 8 | Lift the perf guardrail for the one-string A1-canvas caption fix | F | approve with a coordinated harness update |
| 9 | 852,000 B budget ratchet confirmation + T7 three-option (loading/worker/decline) | E | confirm budget; decide T7 after re-baseline |
| 10 | The 12 standing test-tooling decisions (coverage, DOM infra, Stryker, playwright, CI-inclusion of vitest, sharp CVEs, worker-route docs) | D, Phase 4 | batch: items 1–3 unlock the most leverage |
| 11 | Spec v0.1 unbuilt controls: which remain commitments vs superseded | F | keep hidden-edge count + threshold-in-export; supersede the rest |
| 12 | B12/A11 product calls: should the W-toggle be scoped-annotated; should register role/opt-in persist | P3.4/P3.5 | annotate; persist role as profile metadata |

---

## Appendix II — Full findings inventory

94 raw findings across 9 lenses; deduped to the 37 distinct items above (11 defects + 12 unfinished + verification/test/perf/docs aggregates). Per-lens detail, every `file:line`, and the 5 adversarial verdicts are preserved in the session workflow output (`won7kkl3w.output`) and journal. New-vs-documented split: **23 findings are new to any ledger** (all of A1–A4, A7, A9–A11, B1–B12 except the import filter, plus the pre-merge-audit-record and deploy-currency gaps); the rest re-confirm or aggregate existing ledger/escalation rows against current `main`.
