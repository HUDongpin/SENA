# Agent instructions for SNA.js

## Project goal

Port the R `sna` 2.8 package into a fast, browser-compatible TypeScript/JavaScript library named SNA.js.

## Reference source

The original R package is under `reference/r-sna-2.8/`. For any function you port, inspect these files in order:

1. `reference/r-sna-2.8/man/<function>.Rd` for documented behavior.
2. The relevant R wrapper in `reference/r-sna-2.8/R/`.
3. Any native C routine in `reference/r-sna-2.8/src/` called through `.C` or `.Call`.

Do not assume that the R wrapper alone is the full algorithm when it calls native code.

## Commands

Run these before finishing any task:

```bash
npm test
npm run typecheck
npm run build
```

Use `npm run inventory` after adding or changing porting-status metadata.

## Implementation rules

- Keep `src/` browser-safe and free of Node-only APIs.
- Use TypeScript strict mode.
- Prefer typed arrays for dense numeric graph data.
- Add explicit tests for directed and undirected behavior.
- Preserve R behavior unless a documented JavaScript divergence is intentional.
- Use zero-based vertex indices in JavaScript APIs. Add R-compatibility helpers separately.
- Keep large algorithms iterative rather than recursive when recursion depth could scale with graph size.
- Do not port the entire package in one change. Work by module or function group.

## Definition of done

A porting change is complete only when:

- Public exports are added from `src/index.ts`.
- Tests cover small graphs, edge cases, and at least one R-parity fixture or manual R-derived expected output.
- Documentation notes any limitations or deviations.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
