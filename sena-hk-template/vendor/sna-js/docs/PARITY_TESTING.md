# R parity testing strategy

## Goal

Every ported function should either match R `sna` behavior on documented inputs or explicitly document and test a deliberate JavaScript divergence.

## Fixture categories

Use small graphs first:

- Empty graph.
- Single isolate.
- Directed path.
- Undirected path.
- Directed cycle.
- Undirected cycle.
- Star graph.
- Complete graph.
- Disconnected graph.
- Graph with loops.
- Valued graph.

## R-derived fixtures

The script `scripts/generate-r-snapshots.R` is a starting point for producing reference outputs from R. It assumes R and the `sna` package are available. You may install `sna` from CRAN or from the included source.

Suggested workflow:

```bash
R CMD INSTALL reference/r-sna-2.8
npm run r:parity
npm test
```

Keep generated fixtures small and reviewable. Do not commit huge random outputs.

## Floating-point comparisons

Use approximate comparison for floating-point statistics. Record tolerances in the tests.

## Random algorithms

For random graph generators, use seeded RNGs and statistical smoke tests. Do not expect exact parity with R random streams unless a compatible RNG is intentionally implemented.
