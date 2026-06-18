# ADR 0002: Local jENA and jSNA Runtime

## Status

Accepted

## Context

The SENA website needs browser and Node-compatible runtime evidence for ENA-style epistemic outputs and SNA-style social metrics. The official reference ecosystems include R packages, but the website currently depends on local JavaScript packages kept inside the project.

## Decision

The app uses local `jena-js` from `sena-hk-template/vendor/jena-js` and local `sna.js` from `sena-hk-template/vendor/sna-js`. These runtimes are treated as the executable website dependencies. R source archives kept beside the project are reference artifacts, not the directly executed browser runtime.

## Consequences

- Runtime exports must expose provenance so reviewers can distinguish jENA outputs, jSNA outputs, and SENA-derived metrics.
- Parity claims must be scoped to tested APIs, parameters, and fixtures.
- Changes to ENA connection semantics, SNA metrics, or runtime handoff evidence require tests and updated export evidence.
