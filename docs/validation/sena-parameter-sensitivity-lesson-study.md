# SENA parameter sensitivity — bundled lesson-study sample

Generated: 2026-07-18T01:24:55.901Z
Source: `public/sena-pilot/sample/lesson-study-sena-contract.json`
(4 people, 7 codes, 10 coded segments, 8 interactions)

> **Scope.** Exploratory stability evidence on ONE bundled case, produced by
> `scripts/analyze-sena-parameter-sensitivity.ts`. It is not a validation
> result and says nothing about real datasets. Its purpose is to make the
> analyst-facing point that normalization, layer weights, and window mode are
> **consequential modelling choices**, and that the fusion-math audit stays
> `verified` across the whole grid.

## 1. Normalization sweep (α=β=γ=1, mode=stage)

Shows how each normalization rule reweights the S / W / B share of the fused
supra-adjacency `A_fusion`. The bounded rules (`max`, `frobenius`,
`log1p-max`) are the admissible set; `none` and `log-max` are shown for
contrast.

| normalization | auditStatus | S% | W% | B% | fusionTotal | socialDensity | reciprocity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| max | verified | 18.3 | 45.4 | 36.3 | 25.7143 | 0.6667 | 0.5 |
| frobenius | verified | 27.5 | 31.2 | 41.3 | 9.4048 | 0.6667 | 0.5 |
| log1p-max | verified | 18.9 | 44.3 | 36.8 | 31.9227 | 0.6667 | 0.5 |
| log-max | verified | 18.9 | 44.3 | 36.8 | 31.9227 | 0.6667 | 0.5 |
| none | verified | 34.4 | 36.5 | 29.2 | 96 | 0.6667 | 0.5 |


## 2. Layer-weight sweep (normalization=max, mode=stage)

α, β, γ are **relative emphasis** knobs on the social / epistemic / bridge
blocks. The S/W/B share moves as expected; `no-bridge (1,1,0)` zeroes B.

| weights | auditStatus | S% | W% | B% | fusionTotal |
| --- | --- | --- | --- | --- | --- |
| balanced (1,1,1) | verified | 18.3 | 45.4 | 36.3 | 25.7143 |
| social-led (2,1,1) | verified | 31 | 38.3 | 30.7 | 30.4286 |
| epistemic-led (1,2,1) | verified | 12.6 | 62.4 | 25 | 37.381 |
| bridge-led (1,1,2) | verified | 13.5 | 33.3 | 53.3 | 35.0476 |
| no-bridge (1,1,0) | verified | 28.8 | 71.2 | 0 | 16.381 |


## 3. Temporal window-mode sweep (normalization=max, α=β=γ=1)

Window choice is a theoretical assumption, not a neutral parameter: the number
of windows (and therefore every per-window S/W/B/G trace) depends on it.

| mode | windows | firstWindow | lastWindow |
| --- | --- | --- | --- |
| stage | 3 | Plan | Reflect |
| moving-window | 8 | Turns 1-3 | Turns 8-10 |
| turn-window | 10 | Turn 1 | Turn 10 |


## 4. Invariants held across the grid

- Fusion-math audit `status = verified` for every combination above.
- All fused-layer totals and window counts are finite.
- ✅ No invariant violations detected.

## 5. How to read this for a real study

- Report the normalization, α/β/γ, and window mode as **declared choices** with
  a rationale, and run this sweep on the real dataset before interpreting the
  S/W/B balance.
- The audit staying `verified` confirms the block equation is well-formed; it
  is **not** evidence that cross-layer visual distances are inferential.
- For real inference, vary these on *valid independent units* (student / group /
  session), not turns or edges. See the Human-AI brief §8 and the ethics /
  governance checklist.
