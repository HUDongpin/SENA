// A 2-D ENA plot is only honest when both axes carry structure. The 2026-07-31
// window rank audit (docs/validation/ena-window-rank-audit.md) measured every
// scoped pilot window and found five whose second axis is numerically zero
// (~1e-33) — every one a 2-unit window, which is arithmetic, not data: ENA
// projects n units into at most n − 1 dimensions. The healthiest degenerate
// window and the weakest healthy one are separated by 19 percentage points, so
// the threshold below is not a tuning knob; any value between the populations
// classifies them identically.
//
// Both plot routes (SENA's ENA Space and /workspace/ena) assess through this
// one module so the badge can never disagree between them.

/** Below this share of displayed variance, the second axis is not interpretable. */
export const ENA_LOW_RANK_SVD2_FLOOR = 0.05;

export type EnaLowRankAssessment = {
  reason: "units" | "variance";
  units: number;
  /** Second displayed dimension's share of displayed variance, in [0, 1]. */
  svd2Share: number;
  /** Short label for the on-plot badge. */
  badge: string;
  /** Full sentence for tooltips and warning strips. */
  message: string;
};

/**
 * `units <= 2 || svd2Share < 0.05` — the audit's rule, structural test first.
 *
 * `variance` uses displayed-dimension shares (renormalized so the two drawn
 * axes sum to 1), keyed by dimension name — what `displayedVariance` and
 * `manifest.outputs.variance` already carry. When the second dimension has no
 * share recorded, the variance test abstains rather than inventing a zero; the
 * structural unit test still applies.
 *
 * Both the badge and the message name that basis, because a route may quote a
 * different denominator beside it: /workspace/ena titles its axes with the raw
 * rotation-column shares, which is webENA's convention and correct there, so
 * the pilot's second axis reads 28.5% on the axis title and 34.6% here. Naming
 * the denominator is what makes two true numbers stop looking like a bug.
 *
 * Small windows are the norm in scoped temporal views (21 of 21 pilot windows
 * have 2–3 units), so the wording is informative rather than alarming: it says
 * what remains readable, not just what is broken.
 */
export function assessEnaLowRank(input: {
  units: number;
  variance: Record<string, number>;
  dimensions: readonly string[];
}): EnaLowRankAssessment | null {
  const { units, variance, dimensions } = input;
  const secondDimension = dimensions[1];
  const rawShare = secondDimension === undefined ? undefined : variance[secondDimension];
  const svd2Share = typeof rawShare === "number" && Number.isFinite(rawShare) ? rawShare : null;

  if (units > 0 && units <= 2) {
    return {
      reason: "units",
      units,
      svd2Share: svd2Share ?? 0,
      badge: `1-D structure · ${units} unit${units === 1 ? "" : "s"}`,
      message:
        `This view projects only ${units} unit${units === 1 ? "" : "s"}, and an ENA space over n units has at ` +
        `most n − 1 informative dimensions — the second axis carries no structure here. ` +
        `Read positions along the first axis only.`
    };
  }

  if (svd2Share !== null && svd2Share < ENA_LOW_RANK_SVD2_FLOOR) {
    return {
      reason: "variance",
      units,
      svd2Share,
      badge: `1-D structure · SVD2 ${(svd2Share * 100).toFixed(1)}% of displayed variance`,
      message:
        `The second axis explains ${(svd2Share * 100).toFixed(1)}% of the displayed variance — the share of the ` +
        `two drawn axes renormalized to 100%, not of the whole rotated space — so position along it is not ` +
        `interpretable. Read positions along the first axis only.`
    };
  }

  return null;
}
