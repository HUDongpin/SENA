# ADR 0004: Enterprise State Boundary

## Status

Accepted

## Context

The enterprise runtime grew around a monolithic `lib/sena/enterprise.ts` file that owned domain behavior and file-backed persistence. Routes imported the monolith directly, making it hard to separate identity, team/project, import/analysis, reliability/validation, notifications, governance, and state concerns.

## Decision

Domain modules under `lib/sena/enterprise/*` are the preferred import surface for new route code. The old `lib/sena/enterprise.ts` remains a compatibility facade during migration. Persistence is represented through `SenaEnterpriseStateStore` in `lib/sena/enterprise/state.ts`, and the current file-backed JSON implementation is exposed through a facade factory without changing route response shapes.

## Consequences

- Routes can migrate gradually without breaking existing callers.
- File-backed JSON remains the default local store.
- Postgres or managed persistence adapters should implement the same state-store boundary instead of reaching through route/domain code.
- The monolithic facade can shrink over time once imports and tests have moved to domain modules.
