# Draft upstream issue — jena-js Spearman GOF tie handling

**Target tracker:** https://github.com/HUDongpin/jENA/issues
**Status:** filed 2026-08-02 as https://github.com/HUDongpin/jENA/issues/1 (go-ahead given via the 2026-08-02 "solve these issues" directive)
**Source of measurements:** `docs/validation/jena-js-sena-ena-parity.md` §"Spearman
goodness-of-fit" and divergence table row 1; goldens in `docs/validation/parity/`.

---

## Suggested title

Spearman goodness-of-fit diverges from rENA by up to 2.9e-5 when point coordinates contain ties

## Suggested body

### What diverges

`ena.correlations` / the Spearman goodness-of-fit statistic differs from rENA 0.3.1
on datasets whose projected coordinates contain tied values. Pearson GOF agrees to
5e-12 on the same runs.

Measured on the SENA lesson-study parity fixtures (jena-js 0.6.2 vs rENA 0.3.1,
same input rows, signs aligned):

| Statistic | rENA 0.3.1 | jena-js 0.6.2 | Δ |
| --- | --- | --- | --- |
| tp1 SVD1 / SVD2 | 0.986726788 / 0.879432656 | identical | 0 |
| tp2 SVD2 | 0.966457985 | 0.966429098 | 2.9e-5 |
| tp3 SVD1 | 0.961379861 | 0.961358972 | 2.1e-5 |
| tp3 SVD2 | 0.987659921 | 0.987674036 | 1.4e-5 |

TP1 — whose coordinates happen to contain no ties — matches to 1e-16. TP2/TP3
contain ties and diverge. The magnitude is below the third decimal any paper
reports, so no published claim moves; it is nonetheless a real behavioural
difference against the reference implementation.

### Where it comes from (analysis, to verify)

`ranksTyped` (dist/index.js) already assigns **average ranks** to ties —
`rank = (cursor + 1 + end) / 2` — which is the same tie semantics as R's
`rank()` default, so the tie *convention* is not the problem.

The suspected mechanism is tie *detection*: ties are grouped by exact float
equality (`input[order[end]] === value`). The Spearman input is the vector of
pairwise coordinate differences, and jena-js node/point coordinates differ from
rENA's by up to ~1.1e-8 (documented solver tolerance in the same parity audit).
A pair of differences that is mathematically tied can therefore be exactly equal
on the R side but distinct at the last few ulps on the JS side (or vice versa).
Where that happens the two implementations assign different rank vectors —
average rank vs consecutive distinct ranks — and an O(1) change in a few ranks
moves the correlation at exactly the observed 1e-5 scale. This also explains why
Pearson (no ranking) agrees to 5e-12 on the same data.

### Reproduction

- `docs/validation/parity/run-jena-rena-parity.mjs` (SENA repo) runs the three
  time-point fixtures through jena-js and diffs against
  `docs/validation/parity/r-goldens-diagnostics.json` (extracted with
  `extract-rena-diagnostics.R`, rENA 0.3.1). The Spearman rows for tp2/tp3 are
  the failing comparisons.
- Minimal unit repro suggestion: rank a vector containing two entries that
  differ by 1e-12 alongside exact ties, and compare Spearman against R.

### Possible resolutions

1. **Tolerance-based tie grouping** in `ranksTyped`: treat values within an
   epsilon scaled to the data (e.g. `4 * ulp(max|value|)` or a relative 1e-9)
   as tied. Makes Spearman stable under sub-tolerance coordinate noise and
   should reproduce rENA on these fixtures.
2. **Document and accept**: state in the README/API docs that Spearman GOF may
   differ from rENA below ~1e-4 on tied data because tie detection is exact.
   (SENA's parity report currently carries this caveat downstream.)

Acceptance for (1): tp2/tp3 Spearman match `r-goldens-diagnostics.json` to
≤1e-9 with signs aligned, and tp1 stays exact.

---

## Filing checklist (for Peter)

- [ ] Confirm the mechanism by re-running `run-jena-rena-parity.mjs` against a
      build with tolerance-based tie grouping.
- [ ] File at https://github.com/HUDongpin/jENA/issues with the body above.
- [ ] Cross-link the issue number back into
      `docs/validation/jena-js-sena-ena-parity.md` divergence table row 1.
