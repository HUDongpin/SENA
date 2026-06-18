# Performance guide

## Baseline approach

Start with correct dense implementations, then introduce sparse paths for algorithms where dense memory becomes a bottleneck.

## Data structures

Recommended internal structures:

- `Float64Array` for weighted dense adjacency matrices.
- `Uint8Array` for binary dense adjacency matrices.
- `Int32Array` or arrays of integers for adjacency lists.
- Plain arrays only at API boundaries and in small tests.

## Browser compatibility

Core algorithms should work in Node and browsers. Avoid filesystem, process, worker, and DOM APIs in `src/` unless isolated behind optional entry points.

## Complexity notes

Document time and memory complexity for every algorithm whose runtime is worse than O(n²). This matters for web applications, where large networks can freeze the main thread.

## Future acceleration options

Do not add these until correctness is established:

- Web Workers for long-running algorithms.
- WebAssembly for C-equivalent hot loops.
- Sparse matrix modules.
- GPU layouts for visualization.
