# ADR 0005: Directed Person-Code Bridge Contract

## Status

Accepted

## Context

The original SENA formula used one person-code matrix in both off-diagonal blocks:

```text
A_fusion = [alpha*S  gamma*B; gamma*B'  beta*W]
```

The executable research runtime now preserves two typed bridge directions. `B_PC` records person-to-code evidence from the author of a coded segment. `B_CP` records code-to-person evidence when the segment declares valid `targetPersonIds`. Existing artifacts retain `B` as a compatibility alias for `B_PC`.

The runtime, model card, reports, temporal traces, and exported matrix fingerprints already expose `B_PC` and `B_CP`, while the root mathematical notes and project instructions still described the transpose-only baseline. That drift made it unclear whether independent code-to-person evidence was an intended directed extension or an accidental change.

## Decision

The authoritative SENA bridge contract is:

```text
A_fusion = [alpha*S  gamma*B_PC; gamma*B_CP  beta*W]
```

For `n` people and `m` codes:

- `S` has shape `n x n`.
- `W` has shape `m x m`.
- `B` and `B_PC` have shape `n x m`; `B` is the compatibility alias for `B_PC`.
- `B_CP` has shape `m x n`.
- Fusion assembly rejects malformed block dimensions instead of silently filling missing values.

`B_PC` is estimated from person-authored coded segments. If at least one coded segment supplies valid `targetPersonIds`, `B_CP` is independently estimated from the segment codes toward those target people and the bridge mode is `pc-cp-independent`. If no independent code-to-person evidence exists, the required fallback is `B_CP = B_PC'` and the bridge mode is `pc-transpose-fallback`.

Each bridge block is normalized under the declared normalization rule before applying the shared bridge weight `gamma`. The transpose fallback therefore preserves transpose compatibility after normalization for the supported max, Frobenius, and log1p-max rules.

The fused graph is symmetric only when `S` and `W` are symmetric and `B_CP = B_PC'`. Independent `B_CP` evidence makes `A_fusion` directed even if `S` and `W` are symmetric. Directed fusion must use a declared directed operator or an explicitly reported symmetrization; undirected Laplacian claims do not apply directly.

The same contract applies per temporal window to `A_fusion(t)`. Runtime provenance, model-card badges, reports, matrix fingerprints, and exports must disclose whether the bridge mode is independent or transpose fallback.

## Consequences

- The transpose-only formula remains the undirected special case, not the universal runtime contract.
- Independent `B_CP` is evidence-dependent; missing target-person evidence must never be presented as an observed reverse-direction bridge.
- `B`, `B_PC`, and `B_CP` remain visible in v1 artifacts to preserve compatibility and make direction auditable.
- Changes to bridge construction, fallback behavior, normalization, direction badges, or matrix fingerprints require coordinated SENA-A02/A07/A13/A15 review and matching tests.
- The root formal analysis, mathematical paper, `AGENTS.md`, `CONTEXT.md`, and README must use this contract and state its symmetry condition explicitly.
