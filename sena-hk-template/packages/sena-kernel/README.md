# @sena/kernel

Private transition boundary for the SENA analytical kernel.

This package exposes the pure TypeScript analytical core used by the app and server analysis route while the current `lib/sena/*` modules are decomposed. It intentionally re-exports the already-tested implementation instead of forking formulas.

Module coverage:

- M2 data contract
- M3 layer construction
- M4 fusion assembly
- M5 graph operators
- M6 embedding diagnostics
- M7 temporal runtime
- M8 provenance envelope

The Next.js app remains the runtime host. This package is a boundary marker and import surface, not a second implementation.
