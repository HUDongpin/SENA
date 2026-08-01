import { describe, expect, it } from "vitest";
import {
  erf,
  mannWhitneyDistribution,
  mannWhitneyExactP,
  mannWhitneyU,
  mean,
  midranks,
  normalCdf,
  standardDeviation,
  studentTTwoSidedP,
  tieGroupSizes,
  welchT
} from "../statistics";

describe("midranks", () => {
  it("ranks a tie-free sample 1..n in value order", () => {
    expect(midranks([30, 10, 20])).toEqual([3, 1, 2]);
  });

  it("gives tied values the average of the ranks they span", () => {
    // Values 5,5 span ranks 1 and 2 -> 1.5; 9,9,9 span 3,4,5 -> 4.
    expect(midranks([5, 5, 9, 9, 9])).toEqual([1.5, 1.5, 4, 4, 4]);
  });
});

describe("tieGroupSizes", () => {
  it("reports only the sizes of groups that actually tie", () => {
    expect(tieGroupSizes([1, 2, 2, 3, 3, 3]).sort()).toEqual([2, 3]);
    expect(tieGroupSizes([1, 2, 3])).toEqual([]);
  });
});

describe("erf and normalCdf", () => {
  it("matches the error function to near machine precision", () => {
    expect(erf(0)).toBe(0);
    expect(erf(0.5)).toBeCloseTo(0.5204998778130465, 14);
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 14);
    expect(erf(2)).toBeCloseTo(0.9953222650189527, 14);
    expect(erf(-1.5)).toBeCloseTo(-0.9661051464753107, 14);
  });

  it("matches the standard normal at the reference points", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 14);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 13);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 8);
    expect(normalCdf(-2.5758293)).toBeCloseTo(0.005, 8);
  });
});

describe("mannWhitneyDistribution", () => {
  it("enumerates every arrangement exactly once", () => {
    // The counts across all U values must sum to C(n1+n2, n1).
    const counts = mannWhitneyDistribution(4, 3);
    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(total).toBe(35);
    expect(counts.length).toBe(13);
  });

  it("is symmetric about n1 * n2 / 2", () => {
    const counts = mannWhitneyDistribution(5, 4);
    const maxU = 20;
    for (let u = 0; u <= maxU; u += 1) {
      expect(counts[u]).toBe(counts[maxU - u]);
    }
  });
});

describe("mannWhitneyExactP", () => {
  it("reproduces the worked example in R's wilcox.test documentation", () => {
    // R ?wilcox.test, two-sample case: n1 = 10, n2 = 5, W = 35,
    // alternative = "greater" -> p = 0.1272, so two-sided is 0.2544.
    expect(mannWhitneyExactP(10, 5, 35)).toBeCloseTo(0.2544122544122544, 12);
  });

  it("agrees with direct enumeration of every arrangement", () => {
    // Independently enumerated: of the C(18,9) = 48620 arrangements,
    // P(U >= 58) = 0.06795557383792677, so two-sided is 0.13591114767585355.
    expect(mannWhitneyExactP(9, 9, 58)).toBeCloseTo(0.13591114767585355, 12);
    // Complete separation of two samples of 3: 2 * (1/20) = 0.1
    expect(mannWhitneyExactP(3, 3, 0)).toBeCloseTo(0.1, 12);
  });
});

describe("mannWhitneyU", () => {
  it("reproduces the textbook U for fully separated samples", () => {
    // Every value of the second sample outranks every value of the first, so
    // U for the first sample is 0 and its counterpart is n1 * n2.
    const result = mannWhitneyU([1, 2, 3], [4, 5, 6]);
    expect(result.u).toBe(0);
    expect(result.uMin).toBe(0);
    expect(result.effectSize).toBe(-1);
  });

  it("takes the exact branch on a small untied sample", () => {
    const x = [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3];
    const y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.07, 3.14, 1.28];
    const result = mannWhitneyU(x, y);
    expect(result.u).toBe(58);
    expect(result.method).toBe("exact");
    expect(result.p).toBeCloseTo(0.13591114767585355, 12);
  });

  it("falls back to the tie-corrected approximation when values tie", () => {
    const result = mannWhitneyU([1, 2, 2, 4], [2, 3, 5, 6]);
    expect(result.method).toBe("normal-approximation");
    expect(result.p).toBeGreaterThan(0);
    expect(result.p).toBeLessThanOrEqual(1);
  });

  it("applies the tie correction to the variance", () => {
    // Heavily tied samples: the corrected variance is smaller than the
    // uncorrected one, so |z| is larger and p smaller than the naive value.
    const x = [1, 1, 2, 2, 3];
    const y = [2, 3, 3, 4, 4];
    const result = mannWhitneyU(x, y);

    const n1 = x.length;
    const n2 = y.length;
    const uncorrectedVariance = (n1 * n2 * (n1 + n2 + 1)) / 12;
    const uncorrectedZ = (result.u - (n1 * n2) / 2) / Math.sqrt(uncorrectedVariance);

    expect(Math.abs(result.z)).toBeGreaterThan(Math.abs(uncorrectedZ));
    expect(result.p).toBeLessThan(2 * (1 - normalCdf(Math.abs(uncorrectedZ))));
  });

  it("reports identical samples as no difference", () => {
    const result = mannWhitneyU([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(result.z).toBeCloseTo(0, 12);
    expect(result.p).toBe(1);
    expect(result.effectSize).toBeCloseTo(0, 12);
  });

  it("keeps the exact p above the normal approximation on a small sample", () => {
    // Why the exact branch exists: on nine against nine the approximation
    // reports 0.1223 where the exact distribution gives 0.1359.
    const x = [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3];
    const y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.07, 3.14, 1.28];
    const result = mannWhitneyU(x, y);
    const approximate = 2 * (1 - normalCdf(Math.abs(result.z)));
    expect(approximate).toBeCloseTo(0.12227667721471347, 12);
    expect(result.p).toBeGreaterThan(approximate);
  });

  it("marks an empty sample degenerate instead of inventing a statistic", () => {
    const result = mannWhitneyU([], [1, 2, 3]);
    expect(result.degenerate).toBe(true);
    expect(Number.isNaN(result.p)).toBe(true);
  });

  it("keeps U and its counterpart summing to n1 * n2", () => {
    const x = [4, 8, 15, 16, 23, 42];
    const y = [1, 9, 12, 30];
    const result = mannWhitneyU(x, y);
    expect(result.u + (x.length * y.length - result.u)).toBe(x.length * y.length);
    expect(result.uMin).toBe(Math.min(result.u, x.length * y.length - result.u));
  });
});

describe("mean and standardDeviation", () => {
  it("computes the sample statistics", () => {
    expect(mean([2, 4, 6])).toBe(4);
    // var = ((2-4)^2 + 0 + (6-4)^2) / 2 = 4
    expect(standardDeviation([2, 4, 6])).toBeCloseTo(2, 12);
  });

  it("returns NaN where the statistic is undefined", () => {
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(standardDeviation([5]))).toBe(true);
  });
});

describe("studentTTwoSidedP", () => {
  it("matches the t distribution's tail computed by numeric integration", () => {
    // Reference values from Simpson integration of the t density over
    // [|t|, |t|+400] with 2e6 intervals, doubled for the two-sided tail. That
    // reference truncates the tail beyond 400, which on few degrees of freedom
    // costs it a little over 1e-10 — hence nine places, not twelve.
    expect(studentTTwoSidedP(2, 10)).toBeCloseTo(0.073388034771, 9);
    expect(studentTTwoSidedP(2.5, 7.3)).toBeCloseTo(0.039650234665, 9);
    expect(studentTTwoSidedP(1, 25)).toBeCloseTo(0.326891912692, 9);
    expect(studentTTwoSidedP(3.2, 4.1)).toBeCloseTo(0.031769552728, 9);
  });

  it("is 1 at t = 0 and falls monotonically", () => {
    expect(studentTTwoSidedP(0, 12)).toBeCloseTo(1, 12);
    expect(studentTTwoSidedP(1, 12)).toBeGreaterThan(studentTTwoSidedP(2, 12));
    expect(studentTTwoSidedP(2, 12)).toBeGreaterThan(studentTTwoSidedP(4, 12));
  });

  it("approaches the normal tail as df grows", () => {
    expect(studentTTwoSidedP(1.959964, 1e7)).toBeCloseTo(0.05, 5);
  });
});

describe("welchT", () => {
  it("computes the statistic, fractional df, and effect size", () => {
    const x = [27.5, 21, 19, 23.6, 17, 17.9, 16.9, 20.1, 21.9, 22.6];
    const y = [27.1, 22, 20.8, 23.4, 23.4, 23.5, 25.8, 22, 24.8, 20.2];

    const result = welchT(x, y);
    // Hand-checkable pieces: the difference of means and the sample variances.
    expect(result.meanDifference).toBeCloseTo(mean(x) - mean(y), 12);
    const standardError = Math.sqrt(
      standardDeviation(x) ** 2 / x.length + standardDeviation(y) ** 2 / y.length
    );
    expect(result.t).toBeCloseTo((mean(x) - mean(y)) / standardError, 12);
    // Welch df sits between the smaller sample's n-1 and n1+n2-2.
    expect(result.df).toBeGreaterThan(8);
    expect(result.df).toBeLessThan(18);
    expect(result.p).toBeCloseTo(studentTTwoSidedP(result.t, result.df), 12);
  });

  it("reduces to Student's t when the samples match in size and spread", () => {
    // Equal n and equal variances: Welch's df is exactly n1 + n2 - 2.
    const x = [1, 2, 3, 4, 5];
    const y = [3, 4, 5, 6, 7];
    const result = welchT(x, y);
    expect(result.df).toBeCloseTo(8, 12);
    expect(result.meanDifference).toBeCloseTo(-2, 12);
    expect(result.cohensD).toBeCloseTo(-2 / standardDeviation(x), 12);
  });

  it("reports no difference between identical samples", () => {
    const result = welchT([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(result.t).toBe(0);
    expect(result.p).toBeCloseTo(1, 12);
  });

  it("marks samples too small to test as degenerate", () => {
    expect(welchT([1], [1, 2, 3]).degenerate).toBe(true);
    expect(Number.isNaN(welchT([1], [1, 2, 3]).p)).toBe(true);
  });

  it("does not invent a statistic when a sample has no spread", () => {
    const result = welchT([2, 2, 2], [2, 2, 2]);
    expect(result.degenerate).toBe(true);
    expect(result.meanDifference).toBe(0);
  });
});
