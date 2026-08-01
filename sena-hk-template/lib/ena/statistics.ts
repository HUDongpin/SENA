/**
 * The non-parametric half of webENA's Stats > Comparison.
 *
 * jena-js already ships the parametric side — `enaStats` returns Welch's t for
 * two groups and a one-way ANOVA for more, and `cohensD` the effect size — so
 * SENA does not reimplement any of it. What is missing there is the rank-based
 * test webENA offers beside it, which is what this module adds: Mann-Whitney U
 * for two groups.
 *
 * ENA studies are small — a dozen participants is a large one — and on samples
 * that size the normal approximation drifts: for n1 = n2 = 9 and U = 58 it
 * reports p = 0.1223 where the exact distribution gives 0.1359, understating
 * the p-value by about a tenth. So the exact distribution is computed whenever
 * it is affordable and untied, the way R's `wilcox.test` decides, and the
 * tie-corrected normal approximation is the fallback for tied or large
 * samples.
 */

/** Midranks: tied values share the average of the ranks they span. */
export function midranks(values: number[]) {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value);
  const ranks = new Array<number>(values.length);
  let position = 0;

  while (position < order.length) {
    let end = position;
    while (end + 1 < order.length && order[end + 1].value === order[position].value) end += 1;
    // Ranks are 1-based, so the block spans position+1 .. end+1.
    const shared = (position + 1 + end + 1) / 2;
    for (let index = position; index <= end; index += 1) ranks[order[index].index] = shared;
    position = end + 1;
  }

  return ranks;
}

/** Sizes of each group of tied values, used by the variance correction. */
export function tieGroupSizes(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].filter((count) => count > 1);
}

const LOG_SQRT_PI = Math.log(Math.PI) / 2;

/**
 * Regularized lower incomplete gamma P(a, x) by series expansion — the
 * convergent branch, used below the transition point.
 */
function lowerGammaSeries(a: number, x: number) {
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n < 200; n += 1) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - LOG_SQRT_PI);
}

/**
 * Regularized upper incomplete gamma Q(a, x) by the Lentz continued fraction —
 * the branch that stays accurate in the tail.
 */
function upperGammaContinuedFraction(a: number, x: number) {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 200; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-17) break;
  }

  return Math.exp(-x + a * Math.log(x) - LOG_SQRT_PI) * h;
}

/**
 * Error function to near machine precision, via the incomplete gamma
 * identity erf(x) = P(1/2, x^2). The cheap rational approximations carry an
 * absolute error around 1e-7, which is visible in a reported p-value.
 */
export function erf(x: number) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : -1;
  const magnitude = Math.abs(x);
  if (magnitude < 1e-12) return x;
  const squared = magnitude * magnitude;
  const value = squared < 1.5 ? lowerGammaSeries(0.5, squared) : 1 - upperGammaContinuedFraction(0.5, squared);
  return x < 0 ? -value : value;
}

/** Standard normal CDF. */
export function normalCdf(z: number) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Above this the exact distribution is not worth its table. R switches at 50
 * per sample; the cost here is O(n1 * n2 * n1 * n2) cells, so the ceiling is
 * on the product instead — 900 covers 30 v 30, far past any ENA study.
 */
export const exactMannWhitneyLimit = 900;

/**
 * Null distribution of U as counts, `counts[u]` for u in 0..n1*n2.
 *
 * The recurrence is the standard one for the number of ways to choose which
 * ranks fall to the first sample: N(m, n, u) = N(m-1, n, u-n) + N(m, n-1, u).
 * Counts are exact integers well past any sample this is used for.
 */
export function mannWhitneyDistribution(n1: number, n2: number) {
  const maxU = n1 * n2;
  // table[m][n] is built in place over u; iterate m and n outward.
  let previous: Float64Array[] = [];
  for (let n = 0; n <= n2; n += 1) {
    const row = new Float64Array(maxU + 1);
    row[0] = 1; // m = 0: one arrangement, U = 0
    previous.push(row);
  }

  for (let m = 1; m <= n1; m += 1) {
    const current: Float64Array[] = [];
    for (let n = 0; n <= n2; n += 1) {
      const row = new Float64Array(maxU + 1);
      if (n === 0) {
        row[0] = 1; // n = 0: one arrangement, U = 0
      } else {
        const fromM = previous[n]; // N(m-1, n, u - n)
        const fromN = current[n - 1]; // N(m, n-1, u)
        for (let u = 0; u <= maxU; u += 1) {
          row[u] = (u >= n ? fromM[u - n] : 0) + fromN[u];
        }
      }
      current.push(row);
    }
    previous = current;
  }

  return previous[n2];
}

/** Two-sided exact p for U, following R: 2 * min(lower tail, upper tail), capped. */
export function mannWhitneyExactP(n1: number, n2: number, u: number) {
  const counts = mannWhitneyDistribution(n1, n2);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return NaN;

  let lower = 0;
  let upper = 0;
  for (let value = 0; value < counts.length; value += 1) {
    if (value <= u) lower += counts[value];
    if (value >= u) upper += counts[value];
  }

  return Math.min(1, (2 * Math.min(lower, upper)) / total);
}

export type MannWhitneyResult = {
  /** U for the first sample. */
  u: number;
  /** The smaller of the two U statistics, which is what tables report. */
  uMin: number;
  /** Tie-corrected z of the normal approximation — reported either way. */
  z: number;
  /** Two-sided p. */
  p: number;
  /** How `p` was obtained, so the panel can say which one it is showing. */
  method: "exact" | "normal-approximation";
  /** Rank-biserial correlation: U scaled to [-1, 1]. */
  effectSize: number;
  n1: number;
  n2: number;
  /** True when a sample was empty, in which case every statistic is NaN. */
  degenerate: boolean;
};

/**
 * Mann-Whitney U (equivalently the Wilcoxon rank-sum test).
 *
 * Exact for untied samples small enough to enumerate, matching R's
 * `wilcox.test(x, y, correct = FALSE)`; tie-corrected normal approximation
 * otherwise, which is what R falls back to as well.
 */
export function mannWhitneyU(first: number[], second: number[]): MannWhitneyResult {
  const n1 = first.length;
  const n2 = second.length;

  if (n1 === 0 || n2 === 0) {
    return {
      u: NaN,
      uMin: NaN,
      z: NaN,
      p: NaN,
      method: "normal-approximation",
      effectSize: NaN,
      n1,
      n2,
      degenerate: true
    };
  }

  const pooled = [...first, ...second];
  const ranks = midranks(pooled);
  const rankSumFirst = ranks.slice(0, n1).reduce((sum, rank) => sum + rank, 0);

  const u1 = rankSumFirst - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const expected = (n1 * n2) / 2;

  const n = n1 + n2;
  const ties = tieGroupSizes(pooled);
  const tieTerm = ties.reduce((sum, size) => sum + (size ** 3 - size), 0);
  const variance = ((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1)));
  const z = variance > 0 ? (u1 - expected) / Math.sqrt(variance) : 0;
  const approximateP = variance > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : 1;

  const canBeExact = ties.length === 0 && n1 * n2 <= exactMannWhitneyLimit;
  const p = canBeExact ? mannWhitneyExactP(n1, n2, u1) : Math.min(1, Math.max(0, approximateP));

  return {
    u: u1,
    uMin: Math.min(u1, u2),
    z,
    p,
    method: canBeExact ? "exact" : "normal-approximation",
    // Rank-biserial: +1 when every value in `first` outranks `second`.
    effectSize: (2 * u1) / (n1 * n2) - 1,
    n1,
    n2,
    degenerate: false
  };
}

const lnGammaCoefficients = [
  76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
  0.1208650973866179e-2, -0.5395239384953e-5
];

/** Lanczos ln Γ(x) for x > 0 (relative error below 1e-15 in this range). */
export function lnGamma(x: number) {
  let y = x;
  let temporary = x + 5.5;
  temporary -= (x + 0.5) * Math.log(temporary);
  let series = 1.000000000190015;
  for (const coefficient of lnGammaCoefficients) {
    y += 1;
    series += coefficient / y;
  }
  return -temporary + Math.log((2.5066282746310005 * series) / x);
}

/** Regularized incomplete beta by the Lentz continued fraction. */
function betaContinuedFraction(a: number, b: number, x: number) {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }

  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(a: number, b: number, x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided tail of Student's t with `df` degrees of freedom. */
export function studentTTwoSidedP(t: number, df: number) {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return NaN;
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

export type WelchTResult = {
  t: number;
  /** Welch-Satterthwaite degrees of freedom — fractional, as it should be. */
  df: number;
  p: number;
  meanDifference: number;
  /** Cohen's d on the pooled standard deviation. */
  cohensD: number;
  n1: number;
  n2: number;
  degenerate: boolean;
};

/**
 * Welch's unequal-variance t-test — the pairwise parametric test behind
 * webENA's Stats > Comparison.
 *
 * jena-js's `enaStats` runs this too, but only across every group in a column
 * at once (and switches to a one-way ANOVA at three or more). A researcher
 * comparing two named groups out of several needs the pair, which is this.
 */
export function welchT(first: number[], second: number[]): WelchTResult {
  const n1 = first.length;
  const n2 = second.length;
  const blank = {
    t: NaN,
    df: NaN,
    p: NaN,
    meanDifference: NaN,
    cohensD: NaN,
    n1,
    n2,
    degenerate: true
  };
  if (n1 < 2 || n2 < 2) return blank;

  const mean1 = mean(first);
  const mean2 = mean(second);
  const variance1 = standardDeviation(first) ** 2;
  const variance2 = standardDeviation(second) ** 2;
  const standardError = Math.sqrt(variance1 / n1 + variance2 / n2);
  if (!(standardError > 0)) return { ...blank, meanDifference: mean1 - mean2 };

  const t = (mean1 - mean2) / standardError;
  const df =
    (variance1 / n1 + variance2 / n2) ** 2 /
    ((variance1 / n1) ** 2 / (n1 - 1) + (variance2 / n2) ** 2 / (n2 - 1));
  const pooledSd = Math.sqrt(
    ((n1 - 1) * variance1 + (n2 - 1) * variance2) / (n1 + n2 - 2)
  );

  return {
    t,
    df,
    p: studentTTwoSidedP(t, df),
    meanDifference: mean1 - mean2,
    cohensD: pooledSd > 0 ? (mean1 - mean2) / pooledSd : NaN,
    n1,
    n2,
    degenerate: false
  };
}

/** Mean of a sample, NaN for an empty one — so an empty group reads as absent. */
export function mean(values: number[]) {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard deviation (n-1). NaN below two observations. */
export function standardDeviation(values: number[]) {
  if (values.length < 2) return NaN;
  const average = mean(values);
  const sumSquares = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}
