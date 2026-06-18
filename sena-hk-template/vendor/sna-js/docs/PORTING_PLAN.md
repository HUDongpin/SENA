# SNA.js porting plan

## Philosophy

The R `sna` package combines R-level wrappers with C implementations. A maintainable JavaScript port should be incremental and evidence-driven: document behavior, add parity fixtures, port one module at a time, and optimize only after correctness is clear.

## Phase 0: Repository foundation

Status: started in this template.

- TypeScript package setup.
- Strict types and tests.
- Original R reference source included.
- Codex prompt and agent instructions included.
- Starter graph representation included.

## Phase 1: Core graph representation

Deliverables:

- Dense matrix input normalization.
- Edge-list input normalization.
- Directed and undirected modes.
- Loop handling through `diag`.
- Threshold and valued-edge handling.
- R-compatibility wrappers for one-based edge lists.

Acceptance criteria:

- Small matrix and edge-list fixtures pass.
- No browser-incompatible runtime dependency in `src/`.

## Phase 2: Connectivity and shortest paths

Target functions:

- `geodist`
- `reachability` (starter implementation complete)
- `components`
- `component.dist`
- `component.largest`
- `component.size.byvertex`
- `is.connected`
- `isolates`
- `is.isolate`
- `neighborhood`
- `kcores`
- `cutpoints`
- `bicomponent.dist`
- `maxflow`

Why this phase comes early:

Many centrality and graph-level statistics depend on shortest paths, components, and reachability.

## Phase 3: Node-level indices

Target functions:

- `degree`
- `closeness` (starter implementation complete)
- `betweenness` (starter implementation complete)
- `bonpow`
- `evcent`
- `graphcent`
- `prestige`
- `loadcent`
- `stresscent`
- `flowbet`
- `infocent`
- `gilschmidt`

Acceptance criteria:

- R-parity fixtures for canonical graphs: path, cycle, star, complete graph, disconnected graph.
- Clear handling for directed modes and loop options.

## Phase 4: Graph-level indices and census routines

Target functions:

- `gden`
- `nties`
- `dyad.census`
- `triad.census`
- `triad.classify`
- `grecip` (starter implementation complete)
- `gtrans`
- `mutuality`
- `connectedness`
- `efficiency`
- `hierarchy`
- `lubness`

Many of these call native C in the R package, so inspect `src/triads.c`, `src/cohesion.c`, and `src/utils.c` carefully.

## SENA-specific graph utilities

- `labelPropagation` (starter implementation complete): deterministic weighted label propagation used by the SENA social layer. This is a local jSNA utility validated against SENA's igraph-derived fixture rather than a direct R `sna` API name.

## Phase 5: Random graph generation

Target functions:

- `rgraph`
- `rgnm`
- `rgnmix`
- `rguman`
- `rgws`
- `rgbn`
- `rewire.ud`
- `rewire.ws`

Rules:

- Accept an injectable RNG.
- Expose deterministic seeded behavior through an optional dependency or tiny internal RNG.
- Avoid relying on global `Math.random()` in tests.

## Phase 6: Structural equivalence and role analysis

Target functions:

- `sedist`
- `redist`
- `equiv.clust`
- `blockmodel`
- `blockmodel.expand`
- `brokerage`

## Phase 7: Permutation tests, models, and regression

Target functions:

- `qaptest`
- `cug.test`
- `cugtest`
- `netlm`
- `netlogit`
- `netcancor`
- `lnam`
- `bbnam`
- `bn`

These functions need careful statistical validation and should not be rushed.

## Phase 8: Visualization layer

Target functions:

- `gplot`
- `gplot3d`
- layout helpers
- sociomatrix plotting

Recommendation: keep visualization in a separate entry point, such as `sna.js/visualization`, so the core package remains lightweight.
