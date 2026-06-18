# API design notes

## Naming

SNA.js should expose JavaScript-friendly camelCase names while preserving familiar R names where they are already concise.

Examples:

- `gden()` can remain `gden()`.
- `geodist()` can remain `geodist()`.
- `dyad.census` should become `dyadCensus()` with an R-compatibility alias in an object such as `snaR["dyad.census"]`.

## Indexing

JavaScript APIs use zero-based vertex indices.

For users migrating from R, provide explicit helpers:

```ts
makeDenseGraph({ edges: [[1, 2], [2, 3]], indexBase: 1 });
```

Avoid silently guessing whether edge lists are zero- or one-based.

## Graph inputs

Support these input forms:

```ts
// Dense adjacency matrix
const matrix = [
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 0],
];

// Edge-list input
const edgeList = {
  order: 3,
  edges: [
    [0, 1],
    [1, 2],
  ],
};
```

## Graph modes

Mirror R `sna` option names where practical:

- `mode: "digraph"` for directed graphs.
- `mode: "graph"` for undirected graphs.
- `diag: true` to preserve loops.
- `ignoreEval: true` to treat all nonzero ties as unweighted edges.

## Return values

When R returns a list, return a typed object with named properties.

Example:

```ts
const result = geodist(graph);
result.distances;
result.counts;
```

## Compatibility layer

Use a separate compatibility layer for R-like names that are not valid or ergonomic JS identifiers:

```ts
import { snaR } from "sna.js";

snaR["is.connected"](graph);
```
