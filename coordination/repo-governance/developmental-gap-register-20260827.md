# SENA developmental-gap register — 2026-08-27

## Audit identity and evidence boundary

- Source baseline: `5cdea568a053347dbc82069bde3e836cffb55cc6`
- Tree: `4a0f018023803cb5eef8d67b05658d8656ca1f58`
- Baseline relation at audit start: local `origin/main` and freshly queried live
  GitHub `main` both pointed at the source baseline.
- Audit method: read-only source and checked-in evidence review against the
  committed tree. Working-tree governance changes were not used as product
  evidence.
- Evidence proved by this ledger: source-level capability and gap
  classification only. Historical test records are labelled historical.
- Evidence not proved by this ledger: a fresh full local suite, current CI,
  deployment, production alias, live behavior, real-data validity, or human
  review. Those layers require their own receipts.

The default delivery target remains **research-pilot/reviewer handoff**. It is
not silently promoted to institution-owned production SaaS.

## Ranking rule

- P0: active credentials/security response, permanent data-loss risk, or a
  materially false Git control plane. Those current items are tracked in
  `active-work.json` and the incident/rescue receipts, not disguised as product
  backlog.
- P1: blocks the research-pilot/reviewer handoff, research integrity, data
  provenance, statistical validity, or its exact-release evidence.
- P2: blocks institution-owned production cutover or depends on external IdP,
  managed data/storage/queue/SIEM/backup/email/alerting/operations owners.
- P3: useful evidence/documentation or experience work that must not displace
  substantive research gates.

Effort shorthand: S = 0.5–2 days, M = 3–5 days, L = 1–2 weeks, XL = multiple
weeks plus institutional coordination.

## Ranked implementation ledger

No additional product P0 was found on the exact-main source audit. The open P0
is the separately quarantined credential/control-plane incident.

### GAP-01 — P1 — First governed real-data researcher walkthrough

- Problem and impact: the bundled lesson-study sample demonstrates a workflow,
  but no repository evidence establishes that an independent researcher can
  import and interpret a governed real dataset without developer intervention.
  This blocks completion of a governed real-data pilot and every empirical
  claim; it does not invalidate the exact-SHA software/reviewer-package handoff.
- Target: research pilot.
- Current evidence layer: source plus a historical local walkthrough using the
  bundled sample.
  `sena-hk-template/docs/pilot/researcher-walkthrough-zh-en.md` records a real
  dataset as pending; `sena-hk-template/lib/sena/development-plan.ts` still
  lists real-data walkthrough and validation as next/deferred work.
- Owner lane: A08 lead; A05 import/cleaning; A06 usability; A07 evidence packet;
  A01 coordination.
- Dependencies and authorization: one approved, pseudonymized dataset; ethics,
  consent, retention, and access authority; a domain researcher who did not
  build the feature.
- Smallest next step: freeze one authorized dataset/version and execute the
  existing six-step walkthrough. Preserve source hashes, cleaning manifest,
  warnings, snapshot, runtime bundle, evidence ledger, review packet,
  observation notes, and resulting backlog.
- Automated acceptance: exact candidate passes `npm run sena:pilot:verify`.
- Human acceptance: the researcher completes import → model → fusion/evidence →
  temporal trace → report/gates and explains limitations without developer
  intervention.
- Effort: M after data authorization.
- Blocker: no approved data or external domain reviewer is present in repository
  evidence.
- Do not claim: sample success is not real-data usability, construct validity,
  empirical readiness, generalizability, or a completed real pilot.

### GAP-02 — P1 — Real coding reliability, adjudication, and human review

- Problem and impact: SENA implements reliability/adjudication machinery, but
  fixtures and automated approvals cannot supply genuine independent coding or
  expert judgment. Without those inputs, publication and empirical claims must
  remain blocked.
- Target: research pilot and academic method.
- Current evidence layer: source and fixture-driven test/browser contracts for
  kappa, Krippendorff alpha, coverage, disagreements, approval, and claim
  packages; no actual study-coder receipt.
- Owner lane: A08 lead; A07 evidence/publication binding; A09 persisted workflow.
- Dependencies and authorization: at least two authorized coders, versioned
  codebook, adjudicator, domain reviewer, and authority for raw coding files.
- Smallest next step: import genuine independent coder files for GAP-01's exact
  dataset/revision, calculate code-level and aggregate reliability, exhaust the
  disagreement queue, record adjudication rationales/limitations, and obtain a
  review receipt bound to the same project and revision.
- Automated acceptance: focused reliability, adjudication, claim-package, and
  publication-gate tests, followed by `npm run sena:pilot:verify`.
- Human acceptance: verify coder independence, source hashes, codebook identity,
  reviewer scope, threshold rationale, coverage, and the absence of unresolved
  disagreements wherever the selected gate requires full adjudication.
- Effort: L.
- Blocker: genuine human coding and adjudication decisions are external inputs.
- Do not claim: fixture agreement, generated adjudications, or an automated
  approval is not coding reliability, content validity, adjudication quality,
  or human review.

### GAP-03 — P1 — Enforce the exploratory-only claim boundary on real evidence

- Problem and impact: source is designed to fail closed, but the claim package
  has not been reissued from an actual reviewed dataset. Evidence drift between
  dataset, reliability run, revision, review, and publication formats could
  otherwise overstate readiness.
- Target: academic method and research pilot.
- Current evidence layer: source-level `exploratory-only` defaults in
  `pilot-readiness.ts` and the enterprise claim package; tests exist but are not
  themselves real study evidence.
- Owner lane: A08 lead; A07 exports; A15 schema/evidence identity.
- Dependencies and authorization: GAP-01, GAP-02, ethics/data governance,
  parity/uncertainty evidence, and domain review.
- Smallest next step: generate one project-bound claim package after genuine
  reliability/adjudication/review, audit every blocker independently, and keep
  publication fail-closed unless all exact evidence identities agree.
- Automated acceptance: claim-evidence-package, publication-export-gate,
  publication-state-binding, and validation-claim tests plus the pilot gate.
- Human acceptance: every output format names the same dataset, revision,
  reliability evidence, review scope, claim scope, and limitations.
- Effort: S after upstream evidence; otherwise blocked.
- Blocker: GAP-01 and GAP-02 plus governance and validation evidence.
- Do not claim: even `claim-ready-with-limits` would not establish causality,
  learning/understanding, population generalization, or publication acceptance.
  Current empirical status remains `exploratory-only`.

### GAP-04 — P1 — Independent mathematical/statistical oracle and adversarial battery

- Problem and impact: internal TypeScript tests are not independent validation
  of SENA inference. Group comparisons need calibration, power sanity, valid
  exchangeability assumptions, and an external reference implementation.
- Target: academic method.
- Current evidence layer: deterministic source tests for T12 attribution and
  internal fixtures for permutation p values, bootstrap intervals, effect
  sizes, Holm correction, seeds, invalid inputs, small samples, and zero
  variance. No frozen independent R/Python oracle was found for SENA group
  comparison.
- Owner lane: A13 semantics; A02 runtime; A03/A04 parity; A08 statistics; A11
  enforcement.
- Dependencies and authorization: frozen independent implementation/version,
  agreed tolerances, valid analysis-unit and exchangeability decisions, and a
  preregistered comparison plan.
- Smallest next step: generate versioned R or Python oracle fixtures for T1–T15
  and inference outputs; add known-null, known-effect, ties, isolated/missing
  nodes, unequal/tiny groups, directed bridges, zero variance, extreme scales,
  deterministic seeds, invalid units, and multiplicity cases.
- Automated acceptance: run the attribution, inference, and validation-route
  slices; regenerate reference artifacts; verify hashes; compare every value
  within declared tolerances; make the oracle battery a required CI gate.
- Human acceptance: statistician approves units, exchangeability, multiplicity,
  tolerances, and sensitivity across windows, normalization, and α/β/γ.
- Effort: L.
- Blocker: independent oracle and preregistered statistical design are absent.
- Do not claim: jENA/jSNA fixture parity or internal tests do not independently
  validate SENA inference, calibration, power, or construct validity.

### GAP-05 — P2 — Register/reset/SSO and signed-in enterprise UI browser closure

- Problem and impact: register/login have page-level local coverage, but reset,
  real OIDC callbacks, email delivery, MFA lifecycle, and signed-in enterprise
  panel actions are incomplete as browser evidence.
- Target: enterprise readiness.
- Current evidence layer: source plus local Chromium smoke definitions.
  Registration/login exercise pages and `/api/auth/me`; SSO smoke uses a local
  pilot fallback; RBAC smoke drives many actions through fetch/API calls.
- Owner lane: A09 lead; A06 UI; A10 IdP/email; A11 browser acceptance.
- Dependencies and authorization: institution/ORCID/Google clients and callback
  approval, email provider, identity owner, and representative role accounts.
- Smallest next step: add page-level invitation registration, logout/revocation,
  reset request/delivery/confirm, old-password rejection, new-password login,
  MFA, and signed-in enterprise panel flows. Separately run an authorized
  staging OIDC authorization-code/PKCE callback and signed email delivery.
- Automated acceptance: local pilot gate plus dedicated page-level browser
  flows.
- Human acceptance: focus/error behavior, expiry/revocation, RBAC visibility and
  denials, intended-team return, and absence of token leakage.
- Effort: M for local browser closure; L including providers.
- Blocker: provider clients, callback/email ownership, and test identities.
- Do not claim: local SSO fallback, webhook fixtures, route tests, or
  `/api/auth/me` are not real SSO, password delivery, or identity lifecycle.

### GAP-06 — P1 — Cross-browser, viewport, accessibility, and negative-path matrix

- Problem and impact: declared widths are not a genuine multi-browser test
  matrix, and unexpected console/page errors plus systematic failure paths are
  not uniformly gated.
- Target: enterprise readiness.
- Current evidence layer: source-only Chromium verifier definitions with useful
  individual negative checks. Firefox/WebKit and comprehensive accessibility
  evidence are absent.
- Owner lane: A11 lead; A06 accessibility/UI; A09/A10 auth/ops failures.
- Dependencies and authorization: CI capacity, browser/device set, accessibility
  criteria, role accounts, and manual review availability.
- Smallest next step: execute Chromium/Firefox/WebKit at 375/768/1024/1440;
  capture unexpected console/page errors; add keyboard, focus, overflow,
  reduced-motion, and contrast checks; cover anonymous, revoked/expired,
  invalid CSRF, forbidden role, malformed/oversized import, corrupt restore,
  offline/provider, timeout/retry, concurrency, and double-submit paths.
- Automated acceptance: all projects/widths pass with traces on failure and are
  promoted into protected CI or the pre-release workflow.
- Human acceptance: keyboard and screen-reader review of auth, workspace, and
  enterprise panels.
- Effort: M–L.
- Blocker: cross-browser projects and acceptance ownership are not configured.
- Do not claim: headless Chromium happy paths are not cross-browser,
  accessibility, mobile, or resilient negative-behavior proof.

### GAP-07 — P2 — Production load evidence and sustained performance headroom

- Problem and impact: exact-main local budget evidence now exists, but production
  capacity still needs a sustained provider-backed rehearsal, and the remaining
  JavaScript reserve warrants monitoring rather than a production claim.
- Target: production cutover.
- Current evidence layer: `exact-main-release-receipt-20260827.md` records a
  strict clean-source pass for `5cdea568`: 833,069/848,000 bytes with 14,931
  bytes headroom against a 12,000-byte minimum. The pilot gate's 2-user,
  1-second loopback smoke is not production load evidence. Production policy
  separately requires 50 users for 30 minutes.
- Owner lane: A10 production performance; A11 gate execution; A06/A09 remediation.
- Dependencies and authorization: clean release checkout, exact deployment,
  provider-backed state/storage/queue/observability, and load authorization.
- Smallest next step: retain the strict artifact as the research-handoff
  baseline and, only for a separately authorized production candidate, rerun
  the exact-source budget gate and the 50-user/30-minute sustained rehearsal.
- Automated acceptance: on the authorized deployment candidate, rerun build and
  strict `sena:performance:check`, then the production-required conference load
  command.
- Human acceptance: source/build identity, clean custody, stable artifact set,
  bundle headroom, sustained p95/error rate, saturation, queue drainage, and
  recovery.
- Effort: M once a production candidate exists.
- Blocker: no authorized provider-backed production target or load window.
- Do not claim: T12 goldens, a bundle-size pass, a short loopback smoke, or an old
  artifact is production capacity/headroom evidence.

### GAP-08 — P2 — Bind deployment and live behavior to exact source SHA

- Problem and impact: current Vercel preflight can prove target/domain/HTTP and
  runtime headers without proving the Git source SHA. A `READY` old deployment
  can therefore be mistaken for the intended release.
- Target: production cutover evidence.
- Current evidence layer: source-level provider preflight and production
  evidence contracts; deployment-source SHA is not a required bound field.
- Owner lane: A10 lead; A11 release verification; A01 handoff governance.
- Dependencies and authorization: Vercel metadata access, canonical GitHub ref,
  designated release SHA, deployment, and live-browser authorization.
- Smallest next step: require expected release SHA, read Vercel Git source
  metadata, fail on absence/mismatch, bind it into the evidence archive/final
  gate, and execute fresh behavior checks on that deployment.
- Automated acceptance: local release SHA = live GitHub main = provider Git
  source SHA; deployment ID/alias/evidence hashes agree.
- Human acceptance: fresh `/`, auth pages, workspace, import, Fusion/Temporal,
  ENA/SNA, restore, reliability/validation, publication, console/page/network,
  observation-window, and rollback review.
- Effort: S–M for contract/tests plus operational deployment time.
- Blocker: schema lacks mandatory provider source-SHA binding; promotion is not
  authorized.
- Do not claim: HTTP 200, `READY`, production target, alias, or
  `enterprise-neon` header proves neither `5cdea568` deployment nor full live
  behavior.

### GAP-09 — P2 — Institution-owned backend, identity, and staffed operations

- Problem and impact: source supports many readiness contracts, but the
  institution has not accepted every provider, data, identity, backup, security,
  and on-call responsibility needed for production SaaS.
- Target: production cutover.
- Current evidence layer: source contracts/adapters and local/self-managed
  rehearsal artifacts. ADR 0001 and ADR 0004 explicitly retain institution
  decisions and distinguish the local file store from managed infrastructure.
- Owner lane: A10 ops/deployment; A09 identity/state; institutional platform,
  identity, security, data-governance, and operations owners.
- Dependencies and authorization: procurement/configuration; IdP/SCIM; secret
  custody; residency/DPA; managed Postgres, object storage, CDN, queue,
  observability, SIEM, backup, email, alerts; RPO/RTO; staffed on-call and
  rollback ownership.
- Smallest next step: record accepted-bridge/native-adapter decisions per
  service, configure real providers, run safe live probes and restore rehearsal,
  bind receipts, staff operating ownership, and execute go-live/rollback review.
- Automated acceptance: provider verifiers, production-evidence check, strict
  performance/load, environment packet, go-live check, and production gate.
- Human acceptance: provider-dashboard readback, backup restore, alert delivery
  and acknowledgement, worker recovery, IdP lifecycle, on-call response, and
  final institutional attestation.
- Effort: XL plus institutional lead time.
- Blocker: external decisions, contracts, credentials, resources, and staffed
  ownership.
- Do not claim: local JSON state, simulated bridges, signed forms, or generated
  dossiers are institution-owned infrastructure or staffed operations.

### GAP-10 — P3 — SHA-keyed current evidence index

- Problem and impact: enduring boundaries and dated success prose coexist in
  project documentation. Readers can mistake a historical pass or old
  self-managed closeout for current exact-source evidence.
- Target: cross-cutting governance/documentation.
- Current evidence layer: source and historical prose, including dated local
  pilot results in `CONTEXT.md`.
- Owner lane: A01 lead; A07 artifact index; A11 verification state.
- Dependencies and authorization: none for the structure; refreshing CI,
  deployment, or live state remains separately authorized.
- Smallest next step: maintain a compact evidence ledger keyed by source SHA and
  timestamp with separate source/local/CI/merge/deployment/live fields; mark old
  entries historical or superseded.
- Automated acceptance: reject unbound `ready`/`passed` release claims that lack
  SHA, timestamp, layer, and scope.
- Human acceptance: every current claim resolves to an existing artifact and
  does not cross evidence layers.
- Effort: S.
- Blocker: none for the ledger structure.
- Do not claim: dated local/self-managed readiness is current-commit,
  current-deployment, or institution-production readiness.

## Authorized lane frontier

Until the credential incident's owner gate closes, ordinary feature work stays
frozen. After closure, start at most two substantive lanes and only when each
has owner, authorized input, branch, registered worktree, allowed paths, exact
acceptance, and closeout date:

1. GAP-01 + GAP-02 as one tightly bound real-pilot evidence lane, if data,
   coders, reviewer, and ethics/governance authorization are available.
2. GAP-04 as the independent oracle/adversarial validation lane, if statistical
   semantics and the reference implementation are agreed.

GAP-03 remains fail-closed over those inputs. GAP-05 through GAP-08 follow only
after research-pilot blockers are explicit or resolved. GAP-09 is a separate
institutional program, not an automatic continuation of local pilot work.
