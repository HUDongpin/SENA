# ADR 0001: Research Pilot vs Enterprise Readiness

## Status

Accepted

## Context

SENA contains both a research workbench and an enterprise readiness loop. The workbench supports local analysis, evidence exports, temporal trace review, and pilot package verification. The enterprise runtime adds auth, teams, saved projects, collaboration, reliability review, validation, governance, audit, backup, deployment readiness, and go-live rehearsal surfaces.

These surfaces can look production-like, but the project has not accepted institution-owned production identity, managed database, object storage, pub/sub, SIEM, backup, email, alerting, staffed operations, or external deployment cutover evidence as completed platform commitments.

## Decision

SENA is described as a research-pilot delivery candidate with an enterprise readiness loop. The local enterprise runtime is allowed to simulate, record, and verify readiness evidence, but it must not be presented as production SaaS by default.

## Consequences

- Claims stay exploratory-only until the relevant readiness gates pass.
- UI copy, exports, README notes, and governance artifacts should distinguish local pilot readiness from institution-owned production cutover.
- Enterprise routes may keep production-readiness artifacts, but those artifacts remain evidence requests or rehearsal records unless platform-owner acceptance is present.
