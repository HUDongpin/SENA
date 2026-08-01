import { describe, expect, it } from "vitest";
import { ENA_LOW_RANK_SVD2_FLOOR, assessEnaLowRank } from "../low-rank";

// The rule under test is the one the 2026-07-31 window rank audit measured
// (docs/validation/ena-window-rank-audit.md): units <= 2 || svd2Share < 0.05.
// The audit found the two populations separated by 19 percentage points, so
// these cases pin the boundary rather than tune it.

const dimensions = ["SVD1", "SVD2"] as const;

describe("assessEnaLowRank", () => {
  it("flags a 2-unit window structurally, before any variance reading", () => {
    // stage:1:2-6 (Teach) in the audit: 2 units, SVD2 ~5e-33.
    const assessment = assessEnaLowRank({
      units: 2,
      variance: { SVD1: 1, SVD2: 5.26e-33 },
      dimensions
    });

    expect(assessment?.reason).toBe("units");
    expect(assessment?.units).toBe(2);
    expect(assessment?.badge).toContain("2 units");
    expect(assessment?.message).toContain("first axis");
  });

  it("flags a single-unit view with singular wording", () => {
    const assessment = assessEnaLowRank({ units: 1, variance: { SVD1: 1, SVD2: 0 }, dimensions });

    expect(assessment?.reason).toBe("units");
    expect(assessment?.badge).toContain("1 unit");
    expect(assessment?.badge).not.toContain("1 units");
  });

  it("passes a healthy window untouched", () => {
    // The weakest healthy audit window: moving-window:5:6-8 at 19.2%.
    expect(
      assessEnaLowRank({ units: 3, variance: { SVD1: 0.808, SVD2: 0.192 }, dimensions })
    ).toBeNull();
  });

  it("flags a near-degenerate window through the variance floor", () => {
    const assessment = assessEnaLowRank({
      units: 3,
      variance: { SVD1: 0.96, SVD2: 0.04 },
      dimensions
    });

    expect(assessment?.reason).toBe("variance");
    expect(assessment?.svd2Share).toBeCloseTo(0.04);
    expect(assessment?.badge).toContain("SVD2 4.0%");
  });

  it("names the denominator everywhere it quotes a share", () => {
    // /workspace/ena titles its axes with the raw rotation-column shares —
    // webENA's convention, and correct there — so the pilot's second axis reads
    // 28.5% on the title and 34.6% here. Two true numbers for one axis look
    // like a bug unless each says what it is a share of, and the badge quotes
    // the number just as the message does.
    const assessment = assessEnaLowRank({
      units: 3,
      variance: { SVD1: 0.96, SVD2: 0.04 },
      dimensions
    });

    expect(assessment?.badge).toContain("of displayed variance");
    expect(assessment?.message).toContain("of the displayed variance");
    expect(assessment?.message).toContain("not of the whole rotated space");
  });

  it("treats the 5% floor as exclusive, matching the audit rule", () => {
    expect(
      assessEnaLowRank({
        units: 3,
        variance: { SVD1: 1 - ENA_LOW_RANK_SVD2_FLOOR, SVD2: ENA_LOW_RANK_SVD2_FLOOR },
        dimensions
      })
    ).toBeNull();
  });

  it("abstains from the variance test when the second dimension has no share", () => {
    // A missing share is unknown, not zero — only the structural test may fire.
    expect(assessEnaLowRank({ units: 4, variance: { SVD1: 1 }, dimensions })).toBeNull();
    expect(assessEnaLowRank({ units: 2, variance: {}, dimensions })?.reason).toBe("units");
  });

  it("reports nothing for an empty view", () => {
    expect(assessEnaLowRank({ units: 0, variance: {}, dimensions })).toBeNull();
  });
});
