# SENA Context

## Purpose

SENA is a research-pilot workbench for evidence-traceable fusion of social network analysis and epistemic network analysis. The current delivery target is local pilot readiness and reviewer handoff, not a claim that the system is already a staffed production SaaS.

## Ubiquitous Language

- SENA: Social Epistemic Network Analysis, the project-level method and workbench.
- S: the person-person social layer.
- W: the code-code epistemic layer, preserving ENA-style concept co-occurrence semantics.
- B / B_PC: the person-to-code bridge layer; `B` is the compatibility alias retained in existing artifacts.
- B_CP: the code-to-person bridge layer. It is independently estimated from declared target-person evidence when available and otherwise falls back to `B_PC` transpose.
- G: the person-code-pair contribution layer used to explain who contributed to concept-pair evidence.
- A_fusion: the normalized typed supra-adjacency `[alpha*S gamma*B_PC; gamma*B_CP beta*W]`. Independent `B_CP` evidence makes it directed even when `S` and `W` are symmetric.
- Directed bridge contract: `docs/adr/0005-directed-bridge-contract.md`, which fixes the evidence trigger, transpose fallback, dimensions, and direction guardrails.
- Runtime bundle: the schema-versioned handoff artifact that carries runtime provenance, matrices, reports, audits, temporal traces, and evidence.
- Review packet: the reviewer-facing package that embeds the runtime bundle plus report, visual grammar, readiness gates, and export manifest.
- Temporal Fusion Arc: the preferred temporal trace story view, organized as Plan -> Teach -> Reflect.
- A1 Inner Solid Mesh: the current Fusion Canvas grammar: S as thick blue outer-orbit social arcs, W as solid purple concept links, B as translucent cyan bridge ribbons, and G as low-emphasis pink contribution arcs.
- Enterprise runtime: the local auth/team/project/import/reliability/validation/governance readiness loop used to harden institutional handoff behavior.

## Runtime Boundaries

- The app runs `jena-js` as an exactly pinned published npm package (`"jena-js": "0.6.2"`); it does not directly run the official R `rENA` package in the browser. The former `vendor/jena-js` copy was deleted in the 2026-07-12 registry migration.
- The app runs `sna.js` as an exactly pinned published npm package (`"sna.js": "npm:@peterhudongpin/sna.js@0.4.0"`, an npm alias that keeps `from "sna.js"` imports working); it does not directly run the official R `sna` package in the browser. The former `vendor/sna-js` copy was deleted in the same migration.
- The default enterprise persistence store is `.sena-enterprise/enterprise-db.json`. This file-backed store is a local readiness adapter, not production managed infrastructure.
- Managed database, identity provider, object storage, pub/sub, SIEM, backup, email, alerting, and staffed operations remain platform-owner decisions until accepted through native-ready evidence.
- Self-managed closeout evidence is generated with `npm run sena:self-managed:workflow`, `npm run sena:post-cutover:observe -- --watch --attest`, and `npm run sena:go-live:check`; a fresh go-live check supersedes any older closeout note, and the flow never reclassifies the default file-backed adapter as institution-managed SaaS infrastructure.
- The 2026-06-27 `npm run sena:pilot:verify` release handoff gate passed after the blocking local SENA server on port 3005 was stopped.
- The 2026-06-27T16:59:26Z self-managed go-live check exited `ready` after `npm run sena:self-managed:workflow` refreshed backup/release evidence and `npm run sena:post-cutover:observe -- --watch --attest` completed the real 60-minute post-cutover observation. This proves the configured self-managed enterprise closeout gate, not institution-owned SaaS cutover.

## Code Ownership Lanes

- Fusion math and runtime: `sena-hk-template/lib/sena/model.ts`, `fusion-math.ts`, `temporal-runtime.ts`, runtime consistency, and visual encoding.
- Workspace UI and visual grammar: `sena-hk-template/components/sena/SenaFusionWorkspace.tsx` and `components/sena/workspace/*`.
- Enterprise platform: `sena-hk-template/lib/sena/enterprise.ts`, `lib/sena/enterprise/*`, auth/project/team/provisioning/routes, and enterprise tests.
- Evidence exports: report, snapshot, runtime bundle, review packet, publication export, production page contract, and pilot-readiness artifacts.
- Contract registry: `sena-hk-template/lib/sena/schema-registry.ts` is the source of named v1 schema identifiers.

## Guardrails

- Do not silently change S, W, B/B_PC, B_CP, G, A_fusion, bridge-direction fallback, normalization, temporal window semantics, or visual direction.
- Keep v1 schemaVersion strings, artifact file names, API response shapes, and export formats stable unless an explicit migration is planned.
- Keep claims exploratory-only unless method, data governance, runtime consistency, coding reliability, validation, and human review gates pass.
- Preserve `data-testid="sena-fusion-canvas"` and `data-testid="temporal-fusion-arc"` for production page and browser smoke contracts.
- Prefer adding new enterprise route imports from domain modules under `lib/sena/enterprise/*`; keep `lib/sena/enterprise.ts` as a compatibility facade while the migration is staged.
- When the worktree is broadly dirty, follow `docs/review-slices/2026-06-21-dirty-worktree-review-slices.md` and review one slice at a time before starting new implementation.
