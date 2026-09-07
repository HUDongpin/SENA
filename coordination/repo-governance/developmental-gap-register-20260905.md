# SENA developmental-gap register — 2026-09-05

## Identity and evidence boundary

- Audited source merge: `c782aa03940028a2c19db18dfddec55370c797b1` (PR #85).
- Audited tree: `3a072b473693f8ba433ca8cfd9009ff119ddfa74`.
- Fresh GitHub main readback at 2026-09-05 12:42–12:43 UTC equals that source; root is clean at the same commit. This timestamped observation is not a promise that main will never advance.
- Method: read-only committed-source and historical-receipt review. This ledger does not turn historical tests, browser screenshots, provider receipts, or deployments into fresh evidence.
- Compared with `5cdea568a053347dbc82069bde3e836cffb55cc6`, the application subtree differs only in `lib/sena/__tests__/nav-controls-style.test.ts`, `lib/sena/__tests__/repo-governance.test.ts`, and governance commands in `package.json`. Product runtime/UI source has not changed. Historical mobile findings therefore remain relevant, but must still be reproduced on the new registered lane.
- The intended deliverable is an exact-SHA software/reviewer package. A governed real-data study, empirical claim readiness, and institution-owned production cutover are separate outcomes.
- This ledger is completed before product implementation. Later acceptance results belong in an exact-commit release receipt, not silently backdated into this source audit.

Priority means impact, not automatic authority: P0 active security/data-loss/control-plane failures; P1 research-pilot usability or research/evidence integrity; P2 institution-owned production dependencies; P3 non-blocking improvements. Effort is an estimate of engineering/review work, excluding owner waiting time: S = 0.5–2 days; M = 3–5 days; L = 1–2 weeks; XL = multiple weeks.

## Current control-plane and security context

PR #85 has exact-head CI, protected merge, post-main CI, and a clean-root live governance audit. Its external closeout receipt has SHA-256 `8208f8e05f70ac4425126811bcd20e6486b7c6b86d9f1236f64e0987d9b3c908`. The final source-M audit reported zero errors and owner blockers, with 40 preservation/currentness warnings. Warnings and retained source/branches are not cleanup permission.

Evidence locators: the owner-held PR85 receipt is `/Volumes/Starship/SENA-backups/protected-integration-release-20260905.PliCF1/PR85-INTEGRATION-CLOSEOUT.json`. Historical mobile and performance results are summarized in [the 2026-08-27 exact-main receipt](exact-main-release-receipt-20260827.md). The underlying mobile diagnostic is retained at `/Volumes/Starship/SENA的衍生文件/SENA-RESCUE-QUARANTINE-20260827/release-receipts/exact-main-5cdea568-rerun2-20260827/mobile-layout-diagnostic/mobile-layout-diagnostic.json`. These external locators are evidence custody information, not application runtime dependencies.

The committed credential incident records provider containment as complete and the incident closed on 2026-08-27; forbidden paths are absent from the protected main described by that receipt. These are retained incident facts, not fresh provider calls in this lane. This source audit neither reopens a credential event without evidence nor independently recertifies every provider, cache, clone, or unreachable object. No deployment, provider write, history rewrite, or cleanup is part of this product lane.

Fresh GitHub repository metadata at the audit timestamp reports public visibility, secret scanning enabled, and push protection enabled. Non-provider patterns, validity checks, and Dependabot security updates are disabled. The older incident inventory must be read as historical, not as the current scanner status. This lane changes none of those settings; optional security-setting decisions remain separately owned (GAP-11).

## Selection decision

The first actionable product lane is **GAP-06A: mobile workspace usability and bounded browser/accessibility regression coverage**, followed by its exact-SHA software receipt. It requires neither real participant data nor provider changes. The new lane must first pass its three-path governance enrollment and independent reviews. Only one product writer is selected; no second implementation campaign starts from this ledger.

GAP-01 through GAP-04 remain high-impact P1 research tasks, but automation cannot supply their missing dataset, independent coders, scientific design, or human decisions. The software package may be handed to a reviewer with those limits explicit; it must not be advertised as a completed empirical pilot.

## Ranked gap ledger

### GAP-06A — P1 — Mobile workspace repair and bounded release matrix

- **Problem / impact:** historical exact-source diagnostics at 375×900 show the persistent rail covering the Data Import heading, a 34 px people-metric overlap, and five right-clipped central summary elements. Document scroll width equals viewport width, so page scrolling does not recover them. This blocks usable mobile reviewer handoff.
- **Target / current evidence:** research-pilot software handoff; source plus historical browser geometry. Diagnostic SHA-256: `58e8eb0148491833ca640b1c29e193856f02bafd80b4b51f0de5f0e6158664ac`. It is not fresh browser acceptance.
- **Owner:** A06 UI and A11 verification, A01 custody; task `SENA-MOBILE-RESEARCH-PILOT-20260905`, branch `codex/sena-mobile-research-pilot-20260905`.
- **Dependencies / authority:** accepted enrollment, pinned browsers, controlled local server, exact source identity. No provider or deployment permission is needed or implied.
- **Smallest next step:** reproduce painted overlap, clipping, focus and error behavior; repair the smallest responsible layout/focus/error surfaces; preserve all evidence text and mathematical semantics. Cover `central-fusion-scope-layer-counts`, `central-fusion-evidence-capsule`, `central-active-window-brief`, `central-fusion-transition-delta`, and `central-fusion-delta-g-pair` explicitly.
- **Automated acceptance:** focused workspace/governance/browser-manifest tests, controlled pilot verification, and Chromium/Firefox/WebKit at 375×900, 768×900, 1024×900 and 1440×1100. Check drawer closed/open/scrolled/reclosed, element and text-range bounds, painted hit targets, rail keyboard navigation, Tab/Shift-Tab, Escape/focus restoration, repeated malformed import/corrupt restore and local timeout/retry. Record console/page errors, screenshots and failure traces without credentials.
- **Manual acceptance:** inspect rendered screenshots and real interactions at mobile/tablet/desktop; verify readable evidence, no heading/control occlusion, reachable keyboard actions, and bounded reduced-motion/contrast checks.
- **Effort / status:** M–L; selected, implementation pending this ledger and enrollment.
- **Do not claim:** automated roles/focus checks are not a human screen-reader audit; headless local engines are not physical-device or real-provider acceptance. The workspace's forced-light rendering must not be reported as dark-theme support merely because the outer page changes theme.

### GAP-06B — P1 — Remaining browser and negative-path coverage

- **Problem / impact:** a mobile matrix alone does not close the original comprehensive auth, enterprise, resilience and accessibility matrix.
- **Target / current evidence:** research-pilot robustness and later enterprise readiness; existing source/test contracts, with page-level versus API-driven coverage distinguished.
- **Owner:** A11, A09/A10 for auth/ops failures, A06 for page interactions.
- **Dependencies / authority:** representative roles and intended local/staging targets; real identity/email/provider tests require their own credentials and authority.
- **Smallest next step:** after GAP-06A, issue a route × state × engine coverage matrix separating implemented/passed/not-run/blocked for revoked or expired sessions, invalid CSRF, forbidden roles, oversized imports, offline behavior, concurrency and double-submit.
- **Acceptance:** bounded automated negative flows assert unchanged prior state, visible errors, recovery and no credential leakage; human keyboard/screen-reader review of auth, workspace and enterprise panels is separately recorded.
- **Effort / status:** M–L; not all of this broader matrix is selected for the current fifteen-path product lane.
- **Do not claim:** unchanged console arrays, API-only assertions, or one viewport close every negative or accessibility path.

### GAP-01 — P1 — Governed real-data researcher walkthrough

- **Problem / impact:** bundled samples establish neither independent real-data usability nor a completed empirical pilot.
- **Target / current evidence:** research pilot; `docs/pilot/researcher-walkthrough-zh-en.md` records a bundled-sample walkthrough and a real dataset still pending. This corrects the older ledger's nonexistent `sena-hk-template/docs/pilot/...` path. `sena-hk-template/lib/sena/development-plan.ts` keeps researcher walkthrough next and research validation deferred.
- **Owner:** A08 lead, A05 data/import, A06 usability, A07 packet, A01 coordination.
- **Dependencies / authority:** approved pseudonymized data/version, ethics/consent/retention/access decisions, and an independent domain researcher.
- **Smallest next step:** freeze one authorized dataset; run the existing workflow and preserve input/cleaning provenance, warning decisions, snapshot, runtime/evidence/review packets and observation notes.
- **Acceptance:** software candidate passes the pilot gate; the researcher completes import → model → evidence → temporal trace → report and explains limitations without developer intervention.
- **Effort / blocker:** M after authorization; dataset and independent researcher have not been supplied to this lane.
- **Do not claim:** a sample or automated walkthrough proves construct validity, generalization, empirical readiness or a finished real study.

### GAP-02 — P1 — Genuine independent coding, adjudication and review

- **Problem / impact:** reliability machinery and fixtures cannot substitute for independent human coding or judgment.
- **Target / current evidence:** research pilot and academic method; source reliability/adjudication/claim contracts, not a real study-coder receipt.
- **Owner:** A08 lead, A07 binding, A09 persistence.
- **Dependencies / authority:** at least two independent authorized coders, frozen codebook, adjudicator, domain reviewer and exact GAP-01 project/revision.
- **Smallest next step:** import genuine coding files; assess code-level agreement and coverage; resolve disagreement queues with rationale; bind reviewer scope and limitations to that exact revision.
- **Acceptance:** focused reliability/adjudication/claim/publication tests and pilot gate; human checks independence, thresholds, provenance, unresolved items and scope.
- **Effort / blocker:** L; genuine coding and decisions remain external inputs.
- **Do not claim:** synthetic agreement, generated adjudication or automated approval is human reliability, content validity or expert review.

### GAP-03 — P1 — Evidence-bound exploratory-only claims

- **Problem / impact:** dataset, revision, reliability, validation and publication evidence can drift even when each component has passing tests.
- **Target / current evidence:** research pilot and academic method; source fail-closed claim defaults and tests, not a new reviewed real-study package.
- **Owner:** A08, A07, A15.
- **Dependencies / authority:** GAP-01/02 plus accepted governance, validation, uncertainty and domain-review evidence.
- **Smallest next step:** issue one exact-project claim package and independently inspect each blocker and identity link across export formats.
- **Acceptance:** claim-evidence/publication/state-binding tests; human review confirms identical dataset/revision/reliability/review/limitations across outputs. Keep exploratory-only while any required real gate is missing.
- **Effort / blocker:** S after upstream evidence; currently external research inputs.
- **Do not claim:** even limited claim readiness establishes causality, learning, population generalization or publication acceptance.

### GAP-04 — P1 — Independent inference oracle and adversarial validation

- **Problem / impact:** self-tested TypeScript inference is not an independent statistical oracle; valid analysis units and exchangeability are scientific decisions.
- **Target / current evidence:** academic method; existing inference/attribution tests and ENA/SNA reference generators. The bounded `.R`/`.py` source search identifies ENA/SNA parity generators, not a frozen independent SENA group-inference oracle; this is not a claim of exhaustive absence outside the audited repository.
- **Owner:** A13 semantics, A02 runtime, A03/A04 parity, A08 statistics, A11 gates.
- **Dependencies / authority:** independent implementation/version, declared tolerances, analysis-unit and exchangeability design, preregistration and statistician review.
- **Smallest next step:** freeze oracle scope before implementation; compare null/effect cases, ties, isolated/missing nodes, tiny/unequal groups, directed bridges, zero variance, extreme scales, invalid inputs, deterministic seeds and multiplicity.
- **Acceptance:** hash-bound reference artifacts, attribution/inference/validation slices, independent value comparison within declared tolerances; human sign-off on units, calibration and sensitivity.
- **Effort / blocker:** L; independent oracle and approved design are not supplied to this lane.
- **Do not claim:** ENA/SNA parity independently validates SENA inference, power, calibration or construct validity. No formula/semantic change is authorized here.

### GAP-05 — P2 — Real identity/email lifecycle and signed-in enterprise browser closure

- **Problem / impact:** local auth routes and pilot SSO fallback do not establish a real institution's identity lifecycle.
- **Target / current evidence:** enterprise readiness; existing local page/API/browser contracts, not real OIDC/email delivery proof.
- **Owner:** A09 lead, A10 provider/identity, A06 UI, A11 verification.
- **Dependencies / authority:** institution-approved clients/callbacks, email ownership, role accounts and authorized staging target.
- **Smallest next step:** separately authorize page-level invitation, logout/revocation, reset/delivery/confirmation, old-password rejection, MFA and real callback flows, then bind results to source and environment.
- **Acceptance:** page interactions and negative states, expiry/revocation/RBAC/focus/error checks, provider evidence with no token leakage.
- **Effort / blocker:** M local, L provider-backed; external identity/email decisions remain open.
- **Do not claim:** fixtures, `/api/auth/me`, or a local fallback prove real SSO, email delivery or provider lifecycle.

### GAP-07 — P2 — Sustained production capacity and performance reserve

- **Problem / impact:** passing a software budget does not establish production capacity; the historical bundle reserve was narrow.
- **Target / current evidence:** production cutover; historical `5cdea568` strict budget was 833,069/848,000 bytes, 14,931 remaining against a 12,000 minimum. These are not measurements of the next release. Local pilot 2-user/1-second smoke is not the production 50-user/30-minute rehearsal.
- **Owner:** A10/A11 with A06/A09 remediation.
- **Dependencies / authority:** exact deployed provider-backed target, observability and authorized load window.
- **Smallest next step:** bind the current software budget at the end of the new exact-SHA release ladder; defer production sustained load until separately authorized.
- **Acceptance:** final strict `SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED=1 npm run sena:performance:check -- --output <artifact>` for software; separately approved sustained p95/error/saturation/recovery observations for production.
- **Effort / blocker:** M once target exists; no production load/deployment authorization here.
- **Do not claim:** goldens, bytes, short loopback load or old artifacts prove production headroom/capacity.

### GAP-08 — P2 — Deployment/source-SHA/live behavior binding

- **Problem / impact:** a green local/CI/merge receipt and an old reachable website are different evidence layers.
- **Target / current evidence:** production cutover; this lane has not inspected or changed the production alias and does not reassert the older site's current deployment identity.
- **Owner:** A10 release/ops, A11 browser acceptance, platform owner.
- **Dependencies / authority:** separate production authorization, exact deployment ID/source/tree, environment readiness, rollback target and staffed observation.
- **Smallest next step:** after authorization only, prepare preflight, deploy exact source, accept desktop/mobile workflows, then bind alias and observation evidence.
- **Acceptance:** exact source/tree/deployment/alias/rollback identities plus post-alias console/page/network/route behavior and rollback thresholds.
- **Effort / blocker:** M; no deployment authorized.
- **Do not claim:** READY, HTTP 200, a runtime header or old production observation proves the new main is live.

### GAP-09 — P2 — Institution-owned backend and operating responsibilities

- **Problem / impact:** local enterprise storage and compatibility spikes do not supply production infrastructure or staffed ownership.
- **Target / current evidence:** institution-owned production; existing platform gates and bounded isolated EvidenceFlow receipts, not integrated/deployed managed infrastructure.
- **Owner:** A10 platform, A09 enterprise, A01 institution coordination.
- **Dependencies / authority:** managed DB, object storage, pub/sub, identity, SIEM, backup/restore, email, alerting and on-call owners.
- **Smallest next step:** complete a named-owner platform decision packet with accepted/native-ready/blocked outcomes and evidence for each dependency.
- **Acceptance:** authorized native readbacks and restore/recovery/operations rehearsal, exact target identity and human responsibility acceptance.
- **Effort / blocker:** XL; external platform/institution decisions.
- **Do not claim:** isolated Postgres restart/deduplication, local JSON storage or an adapter interface is institution-managed integration, deployment or production readiness.

### GAP-10 — P3 — Current exact-SHA evidence index

- **Problem / impact:** historical receipts and source documentation are easy to misread as current proof.
- **Target / current evidence:** reviewer usability; old receipts exist, a new product release receipt is pending.
- **Owner:** A01/A07/A11.
- **Dependencies / authority:** completed exact candidate/merge evidence and honest pending/not-run fields.
- **Smallest next step:** link the final external receipt by source/tree, commands/counts, artifact hashes, reviews, PR-head/post-main CI, and explicit deployment/live status; preserve old receipts as historical.
- **Acceptance:** one reviewer can resolve every claim to its exact layer without treating source, local, CI, merged, deployed and live as synonyms.
- **Effort / blocker:** S; waits for new release verification.
- **Do not claim:** documentation completeness supplies missing tests, research inputs or deployment evidence.

### GAP-11 — P2 — Optional repository security controls and dependency maintenance

- **Problem / impact:** non-provider patterns, validity checks and automated dependency security updates remain disabled in fresh repository metadata; transitive install deprecation notices also exist.
- **Target / current evidence:** security maintenance; read-only GitHub settings inventory and npm installation diagnostics, not a vulnerability audit.
- **Owner:** A10 with A01 scope and repository owner decisions.
- **Dependencies / authority:** explicit setting/dependency change approval, supported plan and review of behavior/false positives.
- **Smallest next step:** separately review enabling remaining controls and run a scoped dependency audit/maintenance lane if authorized. Preserve the presently enabled scanning and push protection.
- **Acceptance:** redacted post-change metadata and tests in that separate lane; no credential values or unnecessary provider queries.
- **Effort / blocker:** S–M; outside this product lane's fifteen-path authority.
- **Do not claim:** disabled optional controls prove a new exploit, deprecation notices prove vulnerabilities, or successful installation proves packages are vulnerability-free.

## Release decision boundary

### Additive observation — 2026-09-06 — GAP-06C, cross-engine snapshot integrity

This observation follows the original source audit; it does not backdate new evidence into that audit. The mobile lane remains at `1c86412c71daf1b6241a4ac96e209088c3fae7a6` with uncommitted UI, governance and regression changes. The owner has authorized an exact five-path snapshot repair extension to the original fifteen paths, but has not authorized numerical-tolerance, global-comparator, schema, or mathematical/statistical semantic changes.

- **Priority / impact:** P1, blocks cross-browser research-pilot snapshot handoff. Genuine first-stage Firefox/WebKit builder output is rejected by Node canonical import. The full-dataset synthetic case also fails across Chromium/Node.
- **Evidence:** `snapshot-cross-engine-roundtrip.test.ts` runs identical bundled repository sources in isolated network-denied engines and invokes the real Node importer. Initial RED: 9 tests, 4 pass and 5 fail; same-engine repeatability, exact source dataset/build options/Fusion matrices and one-representable-step tamper rejection are separate controls. This is a library-boundary reproduction, not fresh full pilot acceptance.
- **Proven mechanism:** native trigonometric differences in pinned jENA's Jacobi eigensolver propagate into ENA projection/variance; WebKit `log1p` additionally changes full-report normalization-sensitivity leaves. An independent in-memory same-input primitive replay eliminates the observed differences without modifying canonical validation. Replay is a diagnostic control, not a proposed runtime implementation or general numerical bound.
- **Owner / dependency:** A03 jENA numerical runtime, A02 normalization, A13 numerical interpretation, A07 snapshot custody, A11 regression. Numerical-kernel implementation or a persisted-evidence representation/validation change requires its own explicit scope and compatibility decision.
- **Next step:** agree on a reproducible numerical-runtime strategy while retaining exact tamper detection. Do not infer a tolerance from these samples, drop derived comparisons, overwrite persisted output before validating it, or call source-data recomputation an unchanged snapshot restore.
- **Acceptance still missing:** cross-engine roundtrip GREEN, malformed/tampered rejection preservation, bounded browser matrix, full suite/build/pilot/strict performance and exact-head CI for the repaired candidate. No release completion is claimed.
- **Preservation:** 13 WIP source copies and all 454 generated browser files were verified; six generated directories were reversibly relocated under the external `snapshot-repair-start-reWnQn` custody directory. Receipt SHA-256: `45d872bba29f0623ec87b25a0572a176117f8e977647286f1cf98cfc453f6beb`. No source, branch, worktree or evidence was deleted.
- **Effort / boundary:** estimate pending numerical design and compatibility choice; no upstream dependency or numerical source changes have been made. The five snapshot paths alone have not yielded a repair that preserves all current contracts.

### Additive observation — 2026-09-07 — deterministic runtime and bounded mobile verification

The owner selected the explicit `sena-deterministic-v1` numerical profile with exact canonical validation and legacy-native compatibility, then authorized the traced dependency closure and the production-client-only schema sharing rule. The current registered scope is exactly 50 paths; schema identifiers, values, order, ordinary attributes and exported literal types remain unchanged. No dependency, mathematical/statistical definition, canonical tolerance, budget, Ready/merge or deployment change is authorized.

The rebuilt diagnostic matrix passed all 456 checks over Chromium/Firefox/WebKit and four viewports, including both successful transport-retry profile readbacks in every case. Exact dataset/source hashes and legacy absence remain checked. Source was unchanged during the diagnostic; uncaught page errors were zero, while console events are preserved as hashes and not claimed to be zero. This is bounded synthetic local acceptance, not full pilot, general accessibility, production or empirical-research proof. The latest diagnostic is `.tmp/playwright/mobile-MLWqwC/results.json`, SHA-256 `f5bf05a45023383747f6e06e6d23aea007e5add0a9bdd1d59a262b0b05fac7f0` under the registered worktree's application directory.

The unchanged static-JS gate passed at 835,993/848,000 Brotli bytes with 12,007 remaining against the mandatory 12,000 reserve. The surplus is narrow and must be remeasured on the final exact SHA. Full pilot subsequently stopped in its parallel test phase at 3,200 passed, one failed and two skipped; its serial phase and later gates did not run. The remaining failure exposed a governance denial path calling GitHub before rejecting an empty staged index. A local fail-fast denial now has witnessed RED/GREEN coverage, including zero provider attempts, preserved real-index custody and valid native-hook coverage, without increasing test timeouts. Full verification is pending a fresh run of the repaired candidate. All findings and superseded receipts remain historical evidence; no ordinary commit/push or new-head CI is claimed by this observation.

### Additive observation — 2026-09-07 04:10 UTC — desktop Research Details clearance

The corrected governance denial retains its final staged-path reread after provider proof and the existing merged-release diagnostic precedence. Its eight focused regressions and independent security review passed. A subsequent complete pilot reached 3,204 parallel plus 63 serial tests passed (two opt-in real-Postgres tests skipped), a successful fresh build, and 456/456 mobile checks, but then failed the original desktop browser journey: the open Administration details panel intercepted the Model rail button. This is a full-pilot failure, not a green release.

An isolated real-browser reproduction confirmed painted hit interception at rail z-index 0 versus drawer 30. Raising the rail would cover evidence and was not adopted. The approved parent shell instead gives its direct-child Research Details drawer desktop-only left clearance; mobile geometry and existing focus/Escape logic are unchanged. A witnessed failing real-render guard, subsequent 57-test focused pass, independent three-file review, fresh build/lint and the original desktop browser smoke support the repair. Diagnostic static JS is now 835,928/848,000 bytes with 12,072 remaining; minimum reserve stays 12,000. A fresh full pilot and final clean-SHA performance receipt are pending. This does not close real-data, human-review, independent-oracle or production gaps.

### Additive observation — 2026-09-07 04:42 UTC — complete precommit pilot passed

`sharing-full-pilot-clearance-20260907` completed at 04:42:22.309 UTC with exit 0: 3,205 parallel plus 63 serial tests passed, two opt-in real-Postgres tests skipped, governance 144/144, fresh build, 456 mobile checks and every original browser workflow passed. The receipt SHA-256 is `d0cd6418f3f55181f4fd53da82ac4099a922e369666787781874281aeede8978`; its frozen 47-file preservation receipt is `a93860b377887683d23ab7630fff7eb57d8b6d4a62a8fef2c0bab5e653c241eb`. All frozen bytes remained unchanged. Only observation documents changed afterward. This closes the previously reported full-pilot software test blocker on that candidate, not the separate clean-SHA/CI/protected-main receipt or research-input gaps. No Ready, merge, deployment or cleanup is authorized.

Current decision: selected mobile/reviewer-package work is authorized; the new exact-SHA software receipt is pending. Production promotion is not authorized. Genuine data/coder/reviewer/oracle and institution-owned operations evidence remains explicitly open.

The release receipt must run fixture verification, focused reliability/auth/validation slices, complete two-phase `npm test` (no filtering arguments), TypeScript, lint, build, controlled pilot/browser/accessibility verification, then strict bindable performance as the final gate. Record actual counts and skip reasons. A human real-study gate cannot be marked passed by synthetic fixtures; a missing provider test remains missing rather than silently skipped into a production claim.
