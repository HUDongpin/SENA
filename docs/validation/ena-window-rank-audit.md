# ENA window rank audit — variance shares and node separation per temporal window

**Date:** 2026-07-31
**Scope:** read-only audit of `lessonStudySenaContract` (bundled pilot), all three temporal modes
**Purpose:** turn "SVD2 explains ~nothing" (ADR 0008, label-collision table) into a number that can set a low-rank warning threshold

## Method

For the full timeline and for every window of every temporal mode:

1. `scopeSenaDatasetToWindow(dataset, window)` → `buildSenaModel` → `buildSenaEnaManifest`
2. `buildSenaEnaPlotComposition(...)` for the `ENAPlotModel` actually rendered
3. Variance shares read from `composition.variance` for the two displayed dimensions
4. Node pixel positions and radii from `styleRenaNetwork(model, network, colour, jenaPlotGeometry)`
   — the same call `<EnaPlot>` makes, on the canonical 720x520 geometry
5. Pairwise: *coincident* = centre distance < 0.5px; *contained* = `dist + r_small <= r_large`
   (exactly when the smaller mark is invisible inside the larger)

No source file was modified. The harness was deleted after the run.

## Results

| mode | window | units | SVD1 | SVD2 | min pair px | coincident | contained |
|---|---|---:|---:|---:|---:|---:|---:|
| full | full-timeline | 4 | 65.4% | 34.6% | 53.17 | 0 | 0 |
| stage | stage:0:1-3 | 3 | 72.3% | 27.7% | 0 | 2 | 1 |
| stage | **stage:1:2-6** | **2** | **100.0%** | **~0** | 0 | 2 | 1 |
| stage | stage:2:3-10 | 3 | 60.6% | 39.4% | 0 | 1 | 2 |
| moving-window | moving-window:0:1-3 | 3 | 72.3% | 27.7% | 0 | 2 | 1 |
| moving-window | moving-window:1:2-4 | 3 | 68.7% | 31.3% | 0 | 3 | 3 |
| moving-window | moving-window:2:3-5 | 3 | 69.9% | 30.1% | 0 | 4 | 3 |
| moving-window | **moving-window:3:4-6** | **2** | **100.0%** | **~0** | 0 | 2 | 1 |
| moving-window | moving-window:4:5-7 | 3 | 63.8% | 36.2% | 42.58 | 0 | 0 |
| moving-window | moving-window:5:6-8 | 3 | 80.8% | 19.2% | 0 | 2 | 0 |
| moving-window | moving-window:6:7-9 | 3 | 76.3% | 23.7% | 0 | 2 | 1 |
| moving-window | moving-window:7:8-10 | 3 | 76.6% | 23.4% | 0 | 2 | 0 |
| turn-window | **turn-window:0:0-2** | **2** | **100.0%** | **0** | 0 | 5 | 3 |
| turn-window | turn-window:1:1-3 | 3 | 72.3% | 27.7% | 0 | 2 | 1 |
| turn-window | turn-window:2:2-4 | 3 | 68.7% | 31.3% | 0 | 3 | 3 |
| turn-window | turn-window:3:3-5 | 3 | 69.9% | 30.1% | 0 | 4 | 3 |
| turn-window | **turn-window:4:4-6** | **2** | **100.0%** | **~0** | 0 | 2 | 1 |
| turn-window | turn-window:5:5-7 | 3 | 63.8% | 36.2% | 42.58 | 0 | 0 |
| turn-window | turn-window:6:6-8 | 3 | 80.8% | 19.2% | 0 | 2 | 0 |
| turn-window | turn-window:7:7-9 | 3 | 76.3% | 23.7% | 0 | 2 | 1 |
| turn-window | turn-window:8:8-10 | 3 | 76.6% | 23.4% | 0 | 2 | 0 |
| turn-window | **turn-window:9:9-11** | **2** | **100.0%** | **~0** | 0 | 5 | 2 |

## Finding 1 — degeneracy is structural, and the threshold is unambiguous

Raw SVD2 in the five flagged windows: `5.26e-33`, `5.26e-33`, `0`, `5.26e-33`, `8.52e-34`.
That is **numerically zero** — machine-epsilon noise, not a small real quantity.

The lowest SVD2 among all other windows is **19.16%**.

> There is no grey zone. Degenerate windows sit at ~1e-33; healthy ones start at 0.19.
> Any threshold between them separates the two populations perfectly.

**Every degenerate window has exactly 2 units. Every healthy window has 3 or 4.** This is not a
property of the pilot data — it is arithmetic. ENA projects *n* units into at most *n − 1*
dimensions, so a 2-unit window has rank 1 and its second axis is identically zero. The plot still
draws a full 2-D space, and vertical position in it means nothing.

**Recommended rule** — structural test first, variance floor as backstop:

```
lowRank = units <= 2 || svd2Share < 0.05
```

`units <= 2` catches the certain case with a reason a researcher can act on ("this window has
only two units"). The 5% floor catches near-degenerate windows that a different dataset could
produce between 0 and 19%, where no pilot window currently lands.

## Finding 2 — label collision is near-universal in scoped windows, and rare outside them

- **19 of 21** scoped windows contain at least one pair of code nodes at *identical* coordinates.
- **15 of 21** contain a pair where one mark is entirely inside another.
- Only **2** scoped windows are collision-free (`moving-window:4:5-7` and `turn-window:5:5-7` —
  the same span under two modes), at 42.58px separation.
- The **full timeline has none**, at 53.17px.

This confirms the collision work is load-bearing rather than cosmetic: the unmodified
jena-js/rENA label grammar is unreadable in 90% of this pilot's scoped windows. It also explains
why the problem was invisible before — SENA's old fusion grammar hid code labels behind
click-to-reveal, and the full timeline (the only unscoped view) has no collisions at all.

## Finding 3 — the temporal modes overlap heavily

`turn-window:N` reproduces `moving-window:N-1` exactly (identical units, SVD shares, and
collision counts) for N = 1..8, and `stage:0` equals `moving-window:0`. The three modes are not
three independent analyses of this dataset; on a 10-segment pilot they are largely the same
windows relabelled. Worth knowing before any claim rests on cross-mode agreement.

## Implications

1. **A low-rank badge is justified and cheap.** The variance shares are already in the manifest
   and already printed on the axis titles. Warn where `units <= 2 || svd2Share < 0.05`, on both
   routes, from the shared module.
2. **The pilot's Teach stage cannot support a 2-D ENA claim.** `stage:1:2-6` is one of the five.
   Any figure or sentence about vertical structure in the Teach window needs re-checking.
3. **Small windows are the norm here, not the exception.** 21 of 21 scoped windows have 2–3 units
   against 4 in the full dataset. Whatever the UI says about degeneracy will be shown often, so it
   should be informative rather than alarming.

## Reproducing

The harness was temporary. To regenerate, build per-window compositions as in §Method and record
`composition.variance` plus `styleRenaNetwork(...).nodes`. Raw output of this run:
`variance-audit.json` (session scratchpad).
