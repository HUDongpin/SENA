# SNA.js

SNA.js is a TypeScript/JavaScript project template for porting the R `sna` package into a browser- and Node-compatible social network analysis library.

The goal is not to do a blind line-by-line translation. The goal is to preserve user-visible semantics where possible, make the algorithms scalable for web applications, and build a test harness that can prove parity with the R reference implementation.

## What is included

- A TypeScript package scaffold with ESM/CJS builds.
- Initial dense graph primitives and starter implementations for `gden`, `nties`, `degree`, `betweenness`, `closeness`, `reachability`, `averagePathLength`, `labelPropagation`, `geodist`, `grecip`, and components.
- Vitest tests for small directed and undirected graphs.
- A Codex prompt in [`CODEX_PROMPT.md`](./CODEX_PROMPT.md).
- Codex/agent repo instructions in [`AGENTS.md`](./AGENTS.md).
- Porting documentation in [`docs/`](./docs/).
- Original R package reference source in [`reference/r-sna-2.8/`](./reference/r-sna-2.8/).

## Setup

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Example

```ts
import { averagePathLength, betweenness, closeness, degree, gden, geodist, grecip, labelPropagation, reachability } from "sna.js";

const graph = [
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 0],
];

console.log(gden(graph, { mode: "digraph" }));
console.log(degree(graph, { mode: "digraph", cmode: "outdegree" }));
console.log(betweenness(graph, { mode: "digraph", cmode: "directed" }));
console.log(closeness(graph, { mode: "digraph" }));
console.log(reachability(graph, { mode: "digraph" }).counts);
console.log(averagePathLength(graph, { mode: "digraph" }));
console.log(labelPropagation(graph, { mode: "graph" }).labels);
console.log(geodist(graph, { mode: "digraph" }).distances);
console.log(grecip(graph, { measure: "edgewise" }));
```

## API principles

1. Keep the public API familiar to R `sna` users, but idiomatic for JavaScript.
2. Use zero-based vertex indices in JavaScript APIs. Add explicit R-compatibility wrappers for one-based indexing when needed.
3. Support both matrix and edge-list inputs.
4. Keep the core package browser-safe. Do not add native Node-only dependencies to `src/`.
5. Prefer typed arrays and iterative algorithms for performance-sensitive paths.
6. Every ported function needs parity tests or documented divergence from R.

## Recommended development loop

1. Pick one function or one tight group of functions from `docs/FUNCTION_INVENTORY.md`.
2. Read the `.Rd` docs, the R wrapper, and any C routine called by that wrapper.
3. Add fixtures that compare expected R behavior on small graphs.
4. Implement the TypeScript function.
5. Run `npm test`, `npm run typecheck`, and `npm run build`.
6. Update docs with behavior notes, limitations, and performance considerations.

## License

This template is GPL-2.0-or-later because it is designed as a port of GPL-licensed R code. See [`NOTICE`](./NOTICE) and [`LICENSE`](./LICENSE).
