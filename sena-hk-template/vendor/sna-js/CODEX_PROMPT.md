# Prompt to use in Codex

You are working in a repository named **SNA.js**, a TypeScript/JavaScript port of the R `sna` 2.8 package for social network analysis. The R package is slow for web-scale interactive use and is not directly deployable in browser applications. Your job is to incrementally port it into a fast, tested, browser-compatible library.

## Important context

- The original reference source is in `reference/r-sna-2.8/`.
- R wrappers live in `reference/r-sna-2.8/R/`.
- Native performance-critical algorithms live in `reference/r-sna-2.8/src/`.
- Function documentation lives in `reference/r-sna-2.8/man/`.
- Existing TypeScript code lives in `src/`.
- Tests live in `test/`.
- Porting docs live in `docs/`.

## Core objective

Build SNA.js into a production-quality TypeScript library that preserves the important semantics of R `sna` while using JavaScript-friendly APIs, typed arrays, iterative graph algorithms, and robust test coverage.

## Work style

Do not try to port the whole R package in one pass. Pick one function or one cohesive function family, implement it completely, test it, document it, and then move to the next.

For each function you work on:

1. Read the `.Rd` file in `reference/r-sna-2.8/man/`.
2. Read the R implementation in `reference/r-sna-2.8/R/`.
3. Search for `.C` or `.Call` usage and inspect the matching C implementation in `reference/r-sna-2.8/src/`.
4. Decide whether the JS implementation should be dense-matrix-first, sparse-edge-list-first, or both.
5. Add or update TypeScript types.
6. Add tests before or alongside implementation.
7. Implement the function in `src/` with no Node-only runtime dependencies.
8. Export the function from `src/index.ts`.
9. Update the relevant document in `docs/`.
10. Run `npm test`, `npm run typecheck`, and `npm run build`.

## API rules

- Use zero-based indices for JavaScript APIs.
- Add explicit compatibility helpers for R-style one-based edge lists when needed.
- Support matrix inputs and edge-list inputs.
- Accept options that mirror R names when practical, such as `mode`, `diag`, `cmode`, and `ignoreEval`.
- Prefer return values that are idiomatic JS objects when R returns a list-like object.
- Document every intentional divergence from R behavior.

## Performance rules

- Keep algorithms iterative and allocation-aware.
- Prefer `Float64Array`, `Uint8Array`, `Int32Array`, and compact adjacency lists in hot paths.
- Avoid DOM dependencies in core modules.
- Avoid global mutable state and hidden random number generators. Random graph functions should accept injectable RNGs.
- For functions that can be O(n³) or worse, document complexity and add benchmarks before optimizing.

## Testing rules

- Add small deterministic tests for every function.
- Include directed, undirected, loop/no-loop, empty graph, and isolate cases when relevant.
- Where possible, create R-derived fixture outputs and keep them under `test/fixtures/`.
- If R behavior is ambiguous or undesirable for JS, document the divergence and test the JS behavior explicitly.

## Suggested initial roadmap

1. Finish graph normalization, matrix utilities, edge-list conversion, and R-compatibility wrappers.
2. Port connectivity and path routines: `geodist`, `reachability`, `components`, `component.dist`, `component.largest`, `is.connected`, `isolates`, `is.isolate`, `kcores`, `cutpoints`, `bicomponent.dist`.
3. Port node-level indices: `degree`, `closeness`, `betweenness`, `evcent`, `graphcent`, `prestige`, `loadcent`, `stresscent`, `infocent`, `flowbet`.
4. Port graph-level indices: `gden`, `grecip`, `gtrans`, `dyad.census`, `triad.census`, `mutuality`, `connectedness`, `efficiency`, `hierarchy`.
5. Port random graph generators with seeded RNG support: `rgraph`, `rgnm`, `rgnmix`, `rguman`, `rgws`, `rgbn`.
6. Port structural equivalence, blockmodels, QAP/CUG tests, and regression models.
7. Add optional visualization helpers as a separate layer so the core package remains lightweight.

## Current task

Start by selecting the next highest-priority unported function from `docs/FUNCTION_INVENTORY.md`. Implement it fully using the process above. Keep the change focused. At the end, summarize:

- which function(s) were ported,
- which R files and C files were used as references,
- what tests were added,
- any known limitations or divergences,
- the results of `npm test`, `npm run typecheck`, and `npm run build`.
