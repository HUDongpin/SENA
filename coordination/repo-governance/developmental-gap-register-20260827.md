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
- Later external compatibility-spike receipts are recorded as bounded addenda;
  they do not modify the audited source tree or authorize implementation lanes.

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

- Problem and impact: independent visual review found an exact mobile defect on
  the same `5cdea568` source that passed the automated ladder. At `375x900`, the
  persistent rail occupies `y=180..263` and fully covers the Data Import heading
  at `y=181..209`; the people metric overlaps by `34 px`; five internal elements
  are clipped at the right edge. Document scroll width and client width are both
  `375`, so page-level horizontal scrolling cannot recover the clipped content.
  This is a real research-pilot/reviewer-handoff P1, not a generic future matrix
  concern.
- Target: research-pilot/reviewer handoff first; the expanded matrix also
  strengthens later enterprise readiness.
- Current evidence layer: exact mobile diagnostic SHA-256
  `58e8eb0148491833ca640b1c29e193856f02bafd80b4b51f0de5f0e6158664ac`;
  the companion browser observer SHA-256
  `a58a429b8dd1662f957776b2fc60244e404f189cd8072d9b88253b0a9cec319b`
  had no unexpected observer-array entries and desktop visual review passed,
  while independent mobile/overall visual review failed. Firefox/WebKit and
  comprehensive accessibility evidence remain absent.
- Owner lane: A11 lead; A06 accessibility/UI; A09/A10 auth/ops failures.
- Dependencies and authorization: the P0 credential freeze must close before
  product-code work starts. The mobile layout fix itself requires no external
  real dataset or provider write; CI capacity, Firefox/WebKit projects,
  accessibility criteria, and manual review are needed for closure.
- Smallest next step: repair the persistent-rail overlay, remove the `34 px`
  people-metric overlap, and eliminate all five internal right-edge clipping
  findings. Then execute Chromium, Firefox, and WebKit at
  375/768/1024/1440; capture unexpected console/page errors; add keyboard,
  focus, screen-reader, overflow, reduced-motion, and contrast checks; retain
  anonymous, revoked/expired, invalid-CSRF, forbidden-role,
  malformed/oversized-import, corrupt-restore, offline/provider, timeout/retry,
  concurrency, and double-submit paths.
- Automated acceptance: at 375/768/1024/1440, no rail covers Data Import or
  another primary heading, no metric/control overlap remains, no internal
  element is right-clipped, and Chromium/Firefox/WebKit projects pass with
  traces on failure. The matrix is then promoted into protected CI or the
  pre-release workflow.
- Human acceptance: keyboard and screen-reader review at all four widths for
  auth, workspace, Data Import, primary controls, and enterprise panels, with
  reading/focus order and reachable content explicitly recorded.
- Effort: M–L.
- Blocker: ordinary product work is still frozen by the P0 credential incident;
  after that closes, this is the first product-code lane that can start without
  external real data. Cross-browser projects and acceptance ownership must also
  be configured.
- Do not claim: headless Chromium happy paths are not cross-browser,
  accessibility, mobile, or resilient negative-behavior proof; an observer
  array with no unexpected entries is not visual acceptance.

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
- Bounded external compatibility addendum: the mode-`0600` regular-file receipt
  `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/evidenceflow-spike/evidenceflow-compatibility-spike-20260827T115636Z.json`
  was observed at `2026-08-27T11:56:36Z`, is 1,657 bytes, and has SHA-256
  `0ecf61c30dea76b78d803662f404da4d5928e971d94513ef5f4d6b3c34e8cf45`.
  Its baseline is exact `main=5cdea568`, which an independent live-ref readback
  confirmed remained current; the receipt states that it modified no SENA
  feature code. It records Node `24.15.0`, npm `11.12.1`,
  `@langchain/core@1.2.9`,
  `@langchain/langgraph@1.4.13`,
  `@langchain/langgraph-checkpoint-postgres@1.0.5`, and `pg@8.21.0`; its
  package-lock artifact SHA-256 is
  `994ae38c5d39f3364a730a7d3d8be4a1ca0f7bbd4f26a402361641ada580c090`.
- That isolated in-memory spike supports package installation, StateGraph
  compile/invoke, two concurrent thread IDs, interrupt/resume, observed node
  replay, digest-keyed side-effect deduplication, and a pointer/digest-only
  checkpoint fixture. `PostgresSaver` import passed, but its runtime was not run
  in that first receipt because local Postgres and the Docker daemon were
  unavailable.
- A later mode-`0600`, 2,307-byte durable extension at
  `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/evidenceflow-spike/evidenceflow-postgres-recovery-spike-20260827T121556Z.json`
  was observed at `2026-08-27T12:15:56Z`, has SHA-256
  `dc65ba83cbbb34cfa96c642619eab0dd09b6dc12ef24691845387859ea4f3644`,
  and binds the first spike's exact SHA-256. On Node `24.15.0` and PostgreSQL
  `16.15` in an ephemeral localhost-only cluster, it records
  `PostgresSaver.setup` in schema `sena_langgraph`, four checkpoint tables,
  three interrupt checkpoints, persistence before `SIGKILL`/exit `137`, and
  same-`thread_id` resume from a new Node process with node replay observed.
- The extension also records an authoritative
  `UNIQUE(runId,nodeId,inputDigest)` receipt boundary, one row after replay, and
  zero duplicate simulated side effects. EvidenceFlow's handoff additionally
  reports one row before replay, but that pre-replay count is not a field in the
  fixed JSON receipt. The checkpoint fixture persisted only source
  pointers/digests, with no raw research row or credential material.
  EvidenceFlow separately reports that the temporary cluster was stopped and
  moved to Trash and that no real database was touched; those cleanup facts are
  handoff evidence, not fields in the fixed JSON receipt.
- Even with the extension, the evidence does **not** prove compatibility with an
  institution-managed SENA Postgres instance or its backup/retention policy,
  transactional outbox/server-job integration, multi-host failover or managed
  worker operations, SENA application integration, deployment, or production
  readiness. It does not thaw this lane. Independent audits check fixed receipt
  bytes, structure, sensitive-data boundaries, and internal claim consistency;
  they do not rerun either spike or independently prove every working tree
  clean. The extension's recorded source SHA-256 could not be independently
  recomputed because no source script/log accompanied the durable receipt. The
  first receipt's zero-known-vulnerability audit remains observation-time
  evidence only.
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
  performance/load, environment packet, go-live check, and production gate;
  for any future EvidenceFlow integration, repeat recovery against the accepted
  institution-managed Postgres topology and add transactional outbox/server-job,
  multi-host kill/restart, replay, and exactly-once side-effect custody tests.
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

1. Start the mobile portion of GAP-06 first: fix the known persistent-rail
   overlay and internal clipping, then close the 375/768/1024/1440,
   keyboard/screen-reader, Chromium/Firefox/WebKit acceptance above. This is the
   first product-code lane that needs no external real data, but it is not
   authorized while P0 remains open.
2. Use the second lane for GAP-01 + GAP-02 when data, coders, reviewer, and
   ethics/governance authorization are available; otherwise use it for GAP-04
   only after statistical semantics and the reference implementation are
   agreed.

GAP-03 remains fail-closed over real-pilot inputs. The broader negative-path
portion of GAP-06 and GAP-05/GAP-07/GAP-08 follow after the known mobile P1 is
closed or explicitly owner-accepted and the research-pilot blockers are
explicit. GAP-09 is a separate institutional program, not an automatic
continuation of local pilot work.
