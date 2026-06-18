# SENA Project Memory

## SENA Project Agents / Session Map

Use these entries as standing briefs for future Codex agents/sessions. They are not evidence that a session is currently running; they define the needed ownership lanes for the current SENA project state.

### SENA-A01 Coordination and Handoff Agent

- Owns cross-session coordination, project memory, scope control, and handoff hygiene for `/Users/dongpinhu/Desktop/SENA` and the runnable app in `sena-hk-template`.
- Keep `AGENTS.md`, `sena-hk-template/README.md`, session logs, and handoff notes aligned with the real project state after major changes.
- Keep `CONTEXT.md` and `docs/adr/*` aligned with module-boundary decisions, especially schema registry, workspace API client, and enterprise state boundaries.
- Preserve the current direction: SENA is a research-pilot delivery candidate, not a generic analytics dashboard or production SaaS claim without gate evidence.
- Before creating new workstreams, check whether the task belongs to one of the agents below and keep edits inside that lane unless the user asks for broader coordination.
- When summarizing progress, distinguish: local research pilot, enterprise runtime readiness loop, institution-owned production cutover, and academic/method paper work.

### SENA-A02 Fusion Runtime Agent

- Owns the executable SENA analytical runtime in `sena-hk-template/lib/sena/model.ts`, `fusion-math.ts`, `temporal-runtime.ts`, `runtime-consistency.ts`, `visual-encoding.ts`, and related tests.
- Implement the formal model maintained by SENA-A13 without silently changing mathematical semantics, layer definitions, normalization assumptions, or interpretation boundaries.
- Preserve computational construction of `S`, `W`, `B`, `G`, temporal windows, `A_fusion`, stable matrix fingerprints, runtime consistency checks, and report/export handoff values.
- Any change to matrix construction, normalization code, temporal traces, fingerprints, or fusion weights should update tests and the evidence artifacts that describe those quantities.
- Coordinate with SENA-A13 before changing formula semantics, boundary cases, layer-weight interpretation, or claims about what the fused graph means.

### SENA-A03 jENA Runtime Parity Agent

- Owns local ENA runtime parity for `vendor/jena-js`, `lib/ena/*`, `app/api/ena/run/route.ts`, `app/workspace/ena/*`, `lib/sena/jena-handoff.ts`, and `ena-manifest.ts`.
- Remember that the website depends on local `jena-js`; it does not directly run the official R `rENA` package in the browser.
- Expand and protect parity evidence against rENA fixtures without overstating equivalence beyond tested jENA APIs, parameters, and metrics.
- Keep jENA outputs visible in exports, including projected unit points, code node positions, connection counts, line weights, variance, runtime provenance, and `W`-matrix handoff evidence.
- Coordinate with SENA-A04 and SENA-A13 when ENA connection-vector semantics, code-code co-occurrence, or projection claims affect SENA Fusion interpretation.

### SENA-A04 jSNA Runtime Parity Agent

- Owns local social-network runtime parity for `vendor/sna-js`, `lib/sena/jsna-handoff.ts`, `sna-manifest.ts`, and SENA social-layer metric integration.
- Remember that the website depends on local `sna.js`; it does not directly run the official R `sna` package in the browser.
- Expand and protect parity evidence against R `sna` and igraph-style fixtures without overstating equivalence beyond tested APIs and metrics.
- Current jSNA social-layer metrics include density, tie count, weak components, shortest-path average path length, person-level degree, weighted social strength, closeness, reachable nodes, and component labels.
- Keep runtime provenance visible in exports so reviewers can separate direct jSNA outputs, SENA-derived metrics, and SENA self-implemented helper metrics.

### SENA-A05 Data Contract and Import Agent

- Owns the five-table SENA data contract and ingestion path: `people`, `interactions`, `utterances`, `coded_segments`, and `codebook`.
- Primary files include `lib/sena/import.ts`, `import-adapters.ts`, `data-contract-audit.ts`, `sample-data.ts`, `pilot-assets.ts`, `app/api/sena/import/route.ts`, `app/api/sena/uploads/route.ts`, and `public/sena-pilot/*`.
- Preserve support for JSON contract uploads, five CSV uploads, CSV/XLSX discussion exports, LMS/forum JSON, TXT/MD transcripts, and SRT/VTT transcript cleaning when modifying adapters.
- Derived placeholder people/codes, inferred mappings, cleaning manifests, warning previews, source-file hashes, and upload IDs are research provenance and should remain explicit.
- Verify import changes through `lib/sena/__tests__/import-route.test.ts`, pilot package asset checks, and the browser smoke path that uploads sample/template files.

### SENA-A06 Fusion Workspace UI and Visual Grammar Agent

- Owns the user-facing research workbench in `app/workspace/sena/page.tsx`, `components/sena/SenaFusionWorkspace.tsx`, `app/globals.css`, and related screenshots/mockups.
- Preserve adopted visual grammar A1 "Inner Solid Mesh": `S` as thick blue outer-orbit social arcs, `W` as solid purple inner concept links, `B` as translucent cyan bridge ribbons, and `G` as low-emphasis pink contribution arcs.
- Preserve Temporal Fusion Arc option C as the preferred temporal direction: Plan -> Teach -> Reflect, with concept nodes, people, and S/W/B/G evidence arranged across lesson phases.
- Preserve C3 workspace shell direction: ENA-inspired left rail, dominant central plot, right primary/secondary plot viewports, bottom Data View drawer, and compact semantic rail icons.
- For UI changes, protect `data-testid="temporal-fusion-arc"` and stable SVG hooks used by smoke tests and production page contract checks.
- Check desktop and mobile layout, day/night theme, accessibility, text overlap, and screenshot evidence after visually meaningful changes.

### SENA-A07 Evidence Export and Publication Agent

- Owns review packets, runtime bundles, publication exports, reports, snapshots, and all schema-versioned handoff artifacts.
- Primary files include `report.ts`, `snapshot.ts`, `runtime-bundle.ts`, `review-packet.ts`, `publication-export.ts`, `method-protocol.ts`, `development-plan.ts`, `pilot-readiness.ts`, `demo-verification.ts`, `demo-walkthrough.ts`, and `production-page-contract.ts`.
- Keep these schema families stable unless intentionally versioning them: `sena-runtime-bundle/v1`, `sena-review-packet/v1`, `sena-fusion-math-audit/v1`, `sena-visual-grammar/v1`, `sena-development-plan/v1`, `sena-production-page-contract/v1`, `sena-coding-reliability-gate/v1`, and `sena-claim-readiness-gate/v1`.
- Use `lib/sena/schema-registry.ts` for new or touched schema-versioned contracts instead of adding scattered `schemaVersion` literals.
- Exported artifacts must keep data-contract audit, runtime provenance, matrix fingerprints, temporal trace, evidence ledger, guardrails, coding-reliability status, claim-readiness status, and artifact completeness checks aligned.
- Publication exports currently include HTML/SVG/PNG/XLSX/DOCX/PDF/package-style outputs through the enterprise publication route; do not weaken source snapshot or claim-readiness evidence when polishing format.

### SENA-A08 Research Validation and Reliability Agent

- Owns coding reliability, group-comparison validation, expert review, claim packages, inference readiness, and human-review guardrails.
- Primary files include `reliability.ts`, `reliability-api.ts`, `reliability-adapters.ts`, `inference.ts`, `app/api/sena/reliability/route.ts`, `app/api/sena/validation/*`, and tests for reliability, validation, expert review, and claim packages.
- Keep claims `exploratory-only` unless data contract, runtime alignment, fusion math, evidence ledger, method validation, data governance, coding reliability, and human review gates pass.
- Reliability work should preserve reviewer sign-off, disagreement queues, adjudication history, Cohen kappa/Krippendorff alpha diagnostics, code-level agreement, and limitations.
- Validation work should preserve permutation p values, bootstrap confidence intervals, effect sizes, Holm correction, preregistration hashes, parity evidence, walkthrough evidence, and expert review scope.

### SENA-A09 Enterprise Platform and Collaboration Agent

- Owns local enterprise runtime features: auth, SSO, CSRF, MFA, password reset, sessions, RBAC teams, invitations, memberships, saved projects, revisions, collaboration, notifications, provisioning, and SCIM.
- Primary files include `enterprise.ts`, `enterprise-postgres.ts`, `api-helpers.ts`, `provisioning-auth.ts`, `scim.ts`, `analysis-run.ts`, auth routes, project routes, team routes, notifications, provisioning, and SCIM routes.
- Prefer domain imports from `lib/sena/enterprise/*` for routes; keep `lib/sena/enterprise.ts` as the compatibility facade while the monolith is reduced.
- The default local enterprise store is `.sena-enterprise/enterprise-db.json`; never treat it as production managed infrastructure by itself.
- Preserve redaction rules for emails, secrets, hashes, audit entries, notification payloads, webhook evidence, SSO preflight status, and service-token provisioning.
- Maintain optimistic `expectedVersion` conflicts, append-only revision restore, last-active-manager guardrails, CSRF requirements for cookie-auth mutations, and bearer-token separation for service/ops routes.

### SENA-A10 Governance, Security, Ops, and Deployment Agent

- Owns governance health/security, audit export/SIEM forwarding, backup/restore, managed-database sync bridge, ops status/metrics/readiness, native adapter certification, platform decisions, release gate, alerts, deployment handoff, go-live rehearsal, rollback drill, and post-cutover monitor artifacts.
- Primary files include `ops-api.ts`, governance routes under `app/api/sena/governance/*`, ops routes under `app/api/sena/ops/*`, and tests for enterprise capability audit, postgres/neon, go-live, and enterprise readiness.
- Keep production identity provider, managed database, object storage, pub/sub, audit/SIEM, backup, email, alerting, and staffed SaaS operations marked as institution/platform-owner decisions unless accepted through signed/native-ready evidence.
- Preserve security response headers, HSTS/COOP/CORP/CSP report-only/frame/referrer/permissions/nosniff controls, audit-chain integrity, backup verification, dry-run/merge restore rehearsals, and redacted deployment packages.
- For domain/deployment work, verify the real external endpoint separately from local `next build`; the project history notes that public site health can differ from local readiness.

### SENA-A11 QA, Verification, and Release Gate Agent

- Owns automated verification, Playwright smoke coverage, production page contract checks, CI-readiness, screenshot evidence, and release hygiene.
- Primary commands are `npm test`, `npm run build`, `npm run lint`, `npm run sena:pilot:smoke`, `npm run sena:pilot:browser-smoke`, and especially `npm run sena:pilot:verify` from `sena-hk-template`.
- `npm run sena:pilot:verify` is the release handoff gate; it expects local `next dev` or `next start` processes for this project to be stopped before it clears `.next`, builds, starts a temporary production server, runs browser smoke, and stops it.
- Browser smoke should continue to cover sample/template downloads, JSON contract upload, five CSV upload, built-in lesson-study sample, layout switches, alpha/beta/gamma controls, temporal modes, SVG evidence, downloads, review-packet restore, and project-snapshot restore.
- Keep screenshots in `sena-hk-template/output/playwright` and `.tmp` as evidence when doing visual or acceptance-significant changes, but do not confuse old screenshots with fresh verification.

### SENA-A12 Academic Manuscript and Literature Agent

- Owns SENA method writing, formal mathematical analysis, literature access audits, manuscript support, APA 7 references, and paper/export workflows in the project root.
- Primary files include `SENA_formula_formal_analysis.md`, `SENA_formula_mathematical_paper.tex`, `SENA_literature_access_audit.md`, `SENA_web_tool_development_spec.md`, `SENA_feasibility_and_mvp_analysis.md`, `SENA Papers/*`, and `exports/session-outputs/*`.
- Preserve the gap statement: SENS/iSENS justify combining SNA and ENA, ENA literature formalizes code co-occurrence/projection, multilayer/heterogeneous-network literature legitimizes block adjacency, and SENA's defensible contribution is an evidence-traceable person-person/code-code/person-code supra-adjacency workflow with `G` attribution.
- For academic literature, first check open-access sources; when institutional access is useful or requested, use the Education University of Hong Kong Library route under the global credential-handling rules.
- Never store library passwords or other credentials. For reference lists, use APA 7 and italicize journal titles and volume numbers where the output format supports styling.

### SENA-A13 Fusion Mathematical Model Agent

- Owns the formal SENA Fusion mathematical model, including definitions, assumptions, notation, boundary cases, theorem/proposition statements, proof obligations, and interpretation limits.
- Primary conceptual object: `S` person-person social layer, `W` code-code epistemic layer, `B` person-code contribution layer, `G` person-code-pair contribution layer, and `A_fusion = [alpha*S gamma*B; gamma*B' beta*W]` after declared normalization.
- Treat `A_fusion` as a normalized weighted typed supra-adjacency / heterogeneous graph object, not as an automatic causal model, not as an ENA projection by itself, and not as proof that cross-layer visual distances are statistically interpretable.
- Maintain boundary-case coherence for `gamma=0`, `alpha=0`, `beta=0`, `B=0`, directed social layers, person-code-only bipartite structure, and temporal `A_fusion(t)` extensions.
- Own layer-normalization reasoning, relative interpretation of `alpha`, `beta`, and `gamma`, Laplacian/spectral admissibility claims, directed-vs-undirected distinctions, and statistical validation requirements.
- Coordinate with SENA-A02 so implementation and exports remain faithful to the mathematical model; coordinate with SENA-A12 when formal results are written into manuscripts, reports, or literature-gap arguments.

## Local ENA Runtime

- The SENA website depends on the local `jena-js` package via `sena-hk-template/package.json` as `file:vendor/jena-js`.
- `jena-js` is the browser/Node TypeScript/JavaScript ENA engine ported from rENA.
- Do not assume `/workspace/sena` directly runs the official rENA R package. The current SENA Fusion page uses the local SENA model code for S/W/B/fusion construction.
- `rENA-main.zip` is the downloaded official rENA R package source kept beside the project for reference, not the current website runtime.

## Local SNA Runtime

- The SENA website depends on local `sna.js` via `sena-hk-template/package.json` as `file:vendor/sna-js`.
- `sna.js` was imported from `SNA.js-template.zip`, built to `vendor/sna-js/dist`, and is now wired into `/workspace/sena` social-network analysis.
- Current SENA social-layer metrics computed through SNA.js include density, tie count, weak components, shortest-path average path length, person-level degree, weighted social strength, closeness, reachable nodes, and component labels.
- `SNA.js-template.zip` remains the original source artifact kept beside the project for reference.

## Temporal Fusion Design Direction

- Preserve design option C, "Temporal Fusion Arc", as the preferred visual direction for the future Temporal Fusion view.
- Temporal Fusion should emphasize the lesson study process over a static network layout: Plan -> Teach -> Reflect.
- The view should make time legible by placing concept nodes, people, and S/W/B/G relationships along the lesson phases, so researchers can narrate how questions, hypotheses, evidence, explanations, and reflections develop across windows.
- The local mockup reference is `sena-hk-template/output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png`.
- The `/workspace/sena` Temporal Trace panel now includes a `TemporalFusionArc` SVG story view anchored by `data-testid="temporal-fusion-arc"`, using existing temporal windows, top codes, evidence person IDs, S/W/B temporal metrics, and G person-code-pair contribution signals from `sena-temporal-runtime-trace/v1`, including the strongest G pair and lead contributors per window.

## Fusion Canvas Visual Grammar

- Traditional ENA semantics should be preserved visually: concept-concept `W` links should render as solid lines, not dashed lines.
- Solid ENA `W` links must still be visually distinct from solid SNA `S` person-person ties.
- Adopted current grammar for the main Fusion Canvas is design option A1, "Inner Solid Mesh": `S` uses thick blue outer-orbit social arcs around people, `W` uses solid purple links inside the concept space, `B` uses translucent cyan person-code bridge ribbons, and `G` uses low-emphasis pink contribution arcs.
- The SENA pilot package now exposes this grammar through the standalone `sena-visual-grammar.json` artifact with schemaVersion `sena-visual-grammar/v1`, and embeds it in review packets for researcher handoff.
- Alternative A variants are kept for reference: A2 "Dual-Rail ENA" is useful if `S` and `W` need stronger line-style differentiation; A3 "White-Core ENA" is useful when dense overlapping concept links need extra legibility.
- Local mockup references:
  - `sena-hk-template/output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png`
  - `sena-hk-template/output/sena-fusion-design-options/sena-fusion-option-a2-dual-rail-ena.png`
  - `sena-hk-template/output/sena-fusion-design-options/sena-fusion-option-a3-white-core-ena.png`
