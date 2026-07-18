# ADR 0006: Forum Reply Bridge Evidence & Human–AI Actor Typing

## Status

**Proposed** (2026-07-18). Requires SENA-A02/A05/A07/A13/A15 acceptance before any
runtime change. This ADR exists to make a deferred decision reviewable; it does
**not** itself change runtime behavior.

## Context

Two related pressures sit on the person↔code bridge layer:

1. **Forum/LMS imports degrade `B_CP` to the transpose fallback.** ADR-0005 makes
   `A_fusion` directed when coded segments declare valid `targetPersonIds`
   (independent `B_CP`), else requires `B_CP = B_PC'` (`pc-transpose-fallback`).
   The forum adapter (`import-adapters.ts › adaptForumRows`) already resolves each
   reply's **target author** and emits it as a *social* interaction (S layer),
   but it does **not** write that target onto the reply's **coded segment**. So
   forum-derived fusion always falls back to the transpose, even though
   addressed-to evidence exists in the source. The 2026-07-18 Track C-P0 work
   deliberately left this untouched because flipping it changes `B_CP` /
   bridge-direction semantics, which the guardrails reserve for a decision.

2. **Human–AI data needs typed actors, not people rows.** The 2026-07-11 brief
   (`docs/research/human-ai/…`) argues SENA should generalize person→actor with
   `actorType = human | ai_agent`, keep the five tables as compatibility views,
   and route directed contribution/uptake through `B_PC`/`B_CP`. The blank
   `coded_segments` template now exposes `target_person_ids` (Track C-P0), so the
   *contract* can already carry directed evidence; the open questions are the
   *adapter* behavior and the *actor* generalization.

## Decision (proposed)

### D1 — Forum reply targets populate coded-segment `targetPersonIds`

When `adaptForumRows` creates a coded segment for a reply post whose target author
resolves (via the same `personIdentityIndex` used for the S-layer interaction,
per F2), set that segment's `target_person_ids` to the resolved target. This
makes forum imports emit **independent `B_CP`** (`pc-cp-independent`) instead of
the transpose fallback.

Guardrails on D1:

- A reply's coded contribution is **addressed-to** evidence, not **uptake**.
  Reports must keep labelling it as directed contribution, never as adoption of
  the parent's ideas.
- Only populate when the target **resolves to a known actor**; unresolved targets
  leave the segment target empty (transpose fallback preserved) with a manifest
  warning — never invent a target.
- Threads that set `unit_id = stanza_id = thread_id` already maximise concept
  co-occurrence; D1 does not change W, only B_CP.

### D2 — Person → Actor generalization is additive, behind compatibility views

Adopt `actorType = human | ai_agent` on the roster as an **additive** field with
`human` as the default; keep `people` as a derived view so all v1 artifacts and
the five-table contract are unchanged. `targetPersonIds` gains `targetActorIds`
as an alias (already an importer alias) but the stored field name stays stable
until a versioned migration. No AI-specific matrix behavior is introduced by this
ADR; `ai_agent_runs` provenance and the event ledger (C-P1/P2) are separate ADRs.

## Consequences

- **Directionality becomes evidence-driven for forums.** Datasets with reply
  structure gain a directed `A_fusion`; the fused graph is no longer symmetric
  for them (ADR-0005 symmetry condition), so downstream Laplacian/undirected
  claims must respect the directed operator or a declared symmetrization.
- **Reproducibility.** Any dataset re-imported after D1 lands may change from
  `pc-transpose-fallback` to `pc-cp-independent`; the bridge-mode badge, matrix
  fingerprints, and temporal traces will change accordingly and must be
  re-recorded. This is a deliberate, disclosed change — not silent.
- **Tests required with the change:** a forum fixture whose replies produce
  independent `B_CP` (bridge mode `pc-cp-independent`, `B_CP ≠ B_PC'`), plus the
  unresolved-target case still falling back with a warning. The existing
  transpose-fallback tests must be updated, not deleted.
- D2 keeps the five-table contract and every v1 schema stable; only additive
  fields and aliases change.

## Alternatives considered

- **Leave forum imports on transpose fallback (status quo).** Simplest, but
  discards real addressed-to evidence and understates directed structure — the
  exact drift the brief flags.
- **Infer targets from adjacency** (previous/next speaker). Rejected: temporal
  adjacency is not addressed-to; this is the F1/F3-class error the bug sweep
  guarded against.

## Rollout

1. Accept this ADR (SENA-A02/A05/A07/A13/A15).
2. Implement D1 on a branch stacked on the F2 forum-identity work, with the tests
   above; update ADR-0005 cross-references and the forum observations note.
3. Regenerate affected fixtures/fingerprints and disclose the bridge-mode change.
4. D2 and the event ledger proceed as their own ADRs (C-P1/P2).

## References

- ADR-0005 (Directed Person-Code Bridge Contract)
- `docs/research/human-ai/sena-analyzable-data-structures-human-ai-2026-07-11.md` (§1, §3, §9)
- Bug report F2 (forum reply identity index), 2026-07-18
