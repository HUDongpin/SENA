# ADR 0003: Schema Registry for V1 Contracts

## Status

Accepted

## Context

The codebase had many scattered `schemaVersion` string literals across routes, artifact builders, tests, types, and the enterprise runtime. This made v1 contract auditing difficult and would make any v2 migration noisy.

## Decision

`sena-hk-template/lib/sena/schema-registry.ts` is the named registry for SENA v1 schema identifiers. New or touched production code should use `SENA_SCHEMA_VERSIONS` or its helper functions instead of adding new scattered `schemaVersion` literals.

## Consequences

- Existing v1 string values stay unchanged.
- Type definitions can reference `typeof SENA_SCHEMA_VERSIONS.someContract` for precise literal types.
- Tests can validate emitted artifacts against the registry while avoiding broad source-string assertions.
- Future v2 migration can start with the registry and then update builders/routes deliberately.
