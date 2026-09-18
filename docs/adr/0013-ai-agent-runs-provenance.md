# ADR 0013: `ai_agent_runs` Provenance for Typed AI Actors

## Status

**Accepted** (2026-09-18, Track C-P0). Additive implementation only: `SenaDataset.ai_agent_runs`
is an optional sidecar table linked to roster `actor_id` (with optional `actor_instance_id` /
`context_id`). Five-table v1 import is unchanged when the table is absent. No event ledger
(C-P1), no matrix-behavior change, and no Human–AI “done” claim.

## Context

ADR-0006 D2 landed additive roster typing (`actorType = human | ai_agent`) and
`target_actor_ids` as an alias of stored `targetPersonIds`. That increment is **roster
semantics only**: putting an AI row in `people` does not record how the model was
configured, which snapshot produced the text, or which run generated a turn.

The 2026-07-11 Human–AI brief (`docs/research/human-ai/sena-analyzable-data-structures-human-ai-2026-07-11.md`
§4 / P0 item 2) and the 2026-07-18 development plan name the **next** C-P0 increment as
an `ai_agent_runs` provenance table so provider, model family/snapshot, deployment /
API version, agent config / system-prompt hash, and sampling parameters can be recorded
when they are available. Model Cards emphasize intended use, limitations, and transparent
reporting of the model under test; NIST AI RMF treats design, use, and evaluation
conditions as part of risk management. Neither source is adopted here as a compliance
regime — they motivate **explicit** model/config/version fields rather than silent
omission.

Without this table, two research-grade failures remain possible:

1. An analyst types a roster row `ai_agent` and reports Human–AI SENA. ADR-0006 already
   forbids that claim; this ADR supplies the missing **run** evidence channel.
2. An analyst has AI actors in a research claim and treats missing model/config/version
   fields as optional. Brief §8 makes Human–AI model/config/version provenance a
   **must**, and forbids claiming Human–AI SENA merely by putting AI in `people`.

C-P1 (`contexts` / `events` / `event_links`) remains a later increment. This ADR does not
invent those tables, does not change `S` / `W` / `B` / `G` / `A_fusion`, and does not
force AI actors into matrices differently from any other roster row.

## Decision

### D1 — Optional additive `ai_agent_runs` sidecar, not a sixth required contract table

Adopt `ai_agent_runs` as an **optional** dataset field. The v1 five-table contract
(`people`, `interactions`, `utterances`, `coded_segments`, `codebook`) stays the required
import shape. When the sidecar is absent or empty, import must succeed exactly as today
(no “table is not uploaded” warning for `ai_agent_runs`). When present, parse and
validate it; never invent run rows, model names, or sampling parameters.

Each row is linked to:

- `actor_id` (required) — the roster id of the AI actor (the `people.id` / ADR-0006 actor);
- `actor_instance_id` (optional) — a group/session instance of that actor when known;
- `context_id` (optional) — a study/session/task context id when known.

`actor_instance_id` and `context_id` are join keys reserved for later C-P1 contexts; this
ADR stores them when declared and does not introduce a `contexts` table.

### D2 — Provenance fields, with explicit `unknown` / `not_exposed`

A run row records, as available:

- `agent_run_id` (required)
- `provider`, `model_family`, `model_snapshot`
- `deployment_id`, `api_version`
- `agent_config_version`, `system_prompt_hash`
- sampling parameters `temperature`, `top_p`, `seed` when the serving API exposes them
- `started_at`, `ended_at`

Optional declared extras that the brief lists (`retrieval_corpus_version`,
`tool_policy_version`, `request_id`) may be stored when present.

A field that is not available **must not be silently dropped** on a declared run row.
Use:

- `unknown` — the value was not in the source log / the analyst does not know it;
- `not_exposed` — the serving API or deployment did not expose the field.

Empty CSV cells on these provenance fields store `unknown`. An unrecognized sampling
number is disclosed and stored as `unknown`, never coerced into a fake float.

### D3 — Guardrails (brief §8, tied to ADR-0006)

1. **Never claim Human–AI SENA merely by putting an AI row in `people`.** Actor typing
   remains roster semantics (ADR-0006 D2). Recording `ai_agent_runs` records data-generation
   provenance; it does not complete Track C, does not create an event ledger, and does not
   certify uptake, understanding, or learning gain.
2. **Never treat missing run provenance as optional when AI actors are present in
   research claims.** If the roster declares `ai_agent` rows and no covering run row exists
   for that `actor_id`, the cleaning manifest must say that model/config/version provenance
   is missing and that Human–AI findings remain exploratory.
3. **No matrix semantics.** `buildSenaModel` does not read `ai_agent_runs`. AI actors stay
   ordinary roster members for `S` / `W` / `B` / `G` / `A_fusion`.
4. **No C-P1 tables.** Do not add `contexts`, `events`, or `event_links` under this ADR.
5. **No invented datasets.** Pilot sample lesson-study files stay human-only. Tests may use
   minimal fixture rows.

## Consequences

- Five-table JSON/CSV imports, blank five-table templates, and existing v1 snapshot hashes
  remain byte-stable when `ai_agent_runs` is absent (the field is omitted, not stored as
  `[]`).
- Datasets that declare AI actors gain a disclosed provenance gap or a disclosed run
  record. The disclosure rides the existing cleaning-manifest channel
  (`dataset.warnings`).
- Re-importing a file that adds `ai_agent_runs` does not change matrix fingerprints,
  because matrices still ignore the sidecar. Dataset content hashes include the sidecar
  only when it is present.
- Later C-P1 work may join `agent_run_id` onto events; this ADR does not create that join.

## Alternatives considered

- **Leave provenance as free-text notes on `people`.** Rejected: Model Cards / NIST-style
  reporting need typed model/snapshot/config fields, and notes would not be validatable.
- **Require `ai_agent_runs` as a sixth contract table.** Rejected: that would break every
  current five-table import with a missing-table warning and is a v1 contract break.
- **Infer model identity from actor labels** (`ChatGPT`, `Tutor`, …). Rejected: labels are
  not deployments; this would invent provenance.
- **Implement C-P1 events in the same change.** Rejected: out of scope; the brief sequences
  run provenance (P0) before the event ledger (P1).

## Rollout

1. Accept this ADR (SENA-A05 import/contract, SENA-A01 memory, SENA-A15 additive field
   allowance). SENA-A02/A13 confirm no matrix-semantics change.
2. Land types, optional import/validation, blank template exposure, and tests on a Draft
   PR. Do not merge until review.
3. Keep C-P1 (`contexts` / `events` / `event_links`) and C-P2 multiplex inference as
   separate ADRs.

## References

- ADR-0006 D2 (Forum Reply Bridge Evidence & Human–AI Actor Typing)
- `docs/research/human-ai/sena-analyzable-data-structures-human-ai-2026-07-11.md` (§4 `ai_agent_runs`, §8 gates, P0 item 2)
- `20260718_SENA_Next Development Plan.md` (Track C-P0)
- Mitchell, M., et al. (2019). Model cards for model reporting. In *Proceedings of FAT\** (pp. 220–229). ACM. https://doi.org/10.1145/3287560.3287596
- National Institute of Standards and Technology. (2023). *Artificial Intelligence Risk Management Framework (AI RMF 1.0)*. https://www.nist.gov/itl/ai-risk-management-framework
