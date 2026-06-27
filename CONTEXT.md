# SENA Context

## Purpose

SENA is a research-pilot workbench for evidence-traceable fusion of social network analysis and epistemic network analysis. The current delivery target is local pilot readiness and reviewer handoff, not a claim that the system is already a staffed production SaaS.

## Ubiquitous Language

- SENA: Social Epistemic Network Analysis, the project-level method and workbench.
- S: the person-person social layer.
- W: the code-code epistemic layer, preserving ENA-style concept co-occurrence semantics.
- B: the person-code bridge layer.
- G: the person-code-pair contribution layer used to explain who contributed to concept-pair evidence.
- A_fusion: the normalized typed supra-adjacency built from alpha*S, beta*W, and gamma*B blocks.
- Runtime bundle: the schema-versioned handoff artifact that carries runtime provenance, matrices, reports, audits, temporal traces, and evidence.
- Review packet: the reviewer-facing package that embeds the runtime bundle plus report, visual grammar, readiness gates, and export manifest.
- Temporal Fusion Arc: the preferred temporal trace story view, organized as Plan -> Teach -> Reflect.
- A1 Inner Solid Mesh: the current Fusion Canvas grammar: S as thick blue outer-orbit social arcs, W as solid purple concept links, B as translucent cyan bridge ribbons, and G as low-emphasis pink contribution arcs.
- Enterprise runtime: the local auth/team/project/import/reliability/validation/governance readiness loop used to harden institutional handoff behavior.

## Runtime Boundaries

- The app runs local `jena-js` from `sena-hk-template/vendor/jena-js`; it does not directly run the official R `rENA` package in the browser.
- The app runs local `sna.js` from `sena-hk-template/vendor/sna-js`; it does not directly run the official R `sna` package in the browser.
- The default enterprise persistence store is `.sena-enterprise/enterprise-db.json`. This file-backed store is a local readiness adapter, not production managed infrastructure.
- Managed database, identity provider, object storage, pub/sub, SIEM, backup, email, alerting, and staffed operations remain platform-owner decisions until accepted through native-ready evidence.
- Self-managed closeout evidence is generated with `npm run sena:self-managed:workflow`, `npm run sena:post-cutover:observe -- --watch --attest`, and `npm run sena:go-live:check`; a fresh blocked go-live check supersedes any older closeout note, and the flow never reclassifies the default file-backed adapter as institution-managed SaaS infrastructure.
- The 2026-06-27 `npm run sena:pilot:verify` release handoff gate passed after the blocking local SENA server on port 3005 was stopped.
- The 2026-06-27 go-live check is currently `blocked` on deployment readiness, rollback drill, post-cutover monitor, and capability-audit evidence; do not summarize enterprise cutover as complete until a fresh `npm run sena:go-live:check` exits successfully.

## Code Ownership Lanes

- Fusion math and runtime: `sena-hk-template/lib/sena/model.ts`, `fusion-math.ts`, `temporal-runtime.ts`, runtime consistency, and visual encoding.
- Workspace UI and visual grammar: `sena-hk-template/components/sena/SenaFusionWorkspace.tsx` and `components/sena/workspace/*`.
- Enterprise platform: `sena-hk-template/lib/sena/enterprise.ts`, `lib/sena/enterprise/*`, auth/project/team/provisioning/routes, and enterprise tests.
- Evidence exports: report, snapshot, runtime bundle, review packet, publication export, production page contract, and pilot-readiness artifacts.
- Contract registry: `sena-hk-template/lib/sena/schema-registry.ts` is the source of named v1 schema identifiers.

## Guardrails

- Do not silently change S, W, B, G, A_fusion, normalization, temporal window semantics, or visual direction.
- Keep v1 schemaVersion strings, artifact file names, API response shapes, and export formats stable unless an explicit migration is planned.
- Keep claims exploratory-only unless method, data governance, runtime consistency, coding reliability, validation, and human review gates pass.
- Preserve `data-testid="sena-fusion-canvas"` and `data-testid="temporal-fusion-arc"` for production page and browser smoke contracts.
- Prefer adding new enterprise route imports from domain modules under `lib/sena/enterprise/*`; keep `lib/sena/enterprise.ts` as a compatibility facade while the migration is staged.
- When the worktree is broadly dirty, follow `docs/review-slices/2026-06-21-dirty-worktree-review-slices.md` and review one slice at a time before starting new implementation.
