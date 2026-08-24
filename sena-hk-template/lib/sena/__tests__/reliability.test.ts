import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importSenaReliabilityFiles } from "../reliability-adapters";
import { prepareSenaReliabilityJsonRequest } from "../reliability-api";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsCsv,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview,
  SENA_RELIABILITY_UNIVERSE_LIMITS
} from "../reliability";

const annotationCellLimit = SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows;

function annotationCellLimitError(actual = annotationCellLimit + 1) {
  return expect.objectContaining({
    code: "reliability_universe_limit_exceeded",
    issues: [{
      path: "annotations",
      rule: `annotation-row-count-at-most-${annotationCellLimit}`,
      actual,
      maximum: annotationCellLimit
    }]
  });
}

describe("SENA reliability code-cell admission", () => {
  it("rejects one 200001-code cell before returning annotations", () => {
    expect(() => parseCoderAnnotationsFromRows([{
      coder_id: "c1",
      item_id: "u1",
      code_id: "a;".repeat(annotationCellLimit + 1),
      value: "1"
    }])).toThrow(annotationCellLimitError());
  });

  it("admits the exact 200000-code boundary and ignores empty delimiter cells", () => {
    const parsed = parseCoderAnnotationsFromRows([{
      coder_id: "c1",
      item_id: "u1",
      code_id: `${"a;".repeat(annotationCellLimit)};;; | ;`,
      value: "1"
    }]);

    expect(parsed.annotations).toHaveLength(annotationCellLimit);
    expect(parsed.skippedCells).toEqual([]);
  });

  it("applies the emitted-cell budget cumulatively across rows", () => {
    expect(() => parseCoderAnnotationsFromRows([
      {
        coder_id: "c1",
        item_id: "u1",
        code_id: "a;".repeat(100_001),
        value: "1"
      },
      {
        coder_id: "c2",
        item_id: "u2",
        code_id: "b;".repeat(100_000),
        value: "0"
      }
    ])).toThrow(annotationCellLimitError());
  });

  it("counts empty-value skipped codes before allocating skipped-cell evidence", () => {
    expect(() => parseCoderAnnotationsFromRows([{
      coder_id: "c1",
      item_id: "u1",
      code_id: "a;".repeat(annotationCellLimit + 1),
      value: ""
    }])).toThrow(annotationCellLimitError());
  });
});

describe("SENA coding reliability diagnostics", () => {
  it("summarizes code-level agreement and coder positive-rate drift", () => {
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" },
      { coder_id: "c1", item_id: "u1", code_id: "Explanation", value: "0" },
      { coder_id: "c2", item_id: "u1", code_id: "Explanation", value: "0" },
      { coder_id: "c1", item_id: "u2", code_id: "Explanation", value: "1" },
      { coder_id: "c2", item_id: "u2", code_id: "Explanation", value: "1" }
    ]);

    const dashboard = buildSenaReliabilityDashboard(parsed.annotations);

    expect(dashboard.codeDiagnostics).toEqual([
      expect.objectContaining({
        codeId: "Evidence",
        unitCount: 2,
        disagreementCount: 1,
        agreementRate: 0.5,
        positiveAssignments: 3,
        coderPositiveRates: { c1: 1, c2: 0.5 }
      }),
      expect.objectContaining({
        codeId: "Explanation",
        unitCount: 2,
        disagreementCount: 0,
        agreementRate: 1,
        positiveAssignments: 2,
        coderPositiveRates: { c1: 0.5, c2: 0.5 }
      })
    ]);
    expect(dashboard.codeDiagnostics[0].pairwiseCohenKappa).toEqual([
      expect.objectContaining({ coderA: "c1", coderB: "c2", units: 2, kappa: 0 })
    ]);
  });

  it("imports local reliability files into a dashboard and review patch", async () => {
    const csv = [
      "coder_id,item_id,code_id,value",
      "c1,u1,Evidence,1",
      "c2,u1,Evidence,1",
      "c1,u2,Evidence,1",
      "c2,u2,Evidence,0"
    ].join("\n");

    const result = await importSenaReliabilityFiles([
      {
        name: "coder-ratings.csv",
        size: csv.length,
        text: async () => csv,
        arrayBuffer: async () => new TextEncoder().encode(csv).buffer
      }
    ], "Local reviewer");

    expect(result.schemaVersion).toBe("sena-local-reliability-import/v1");
    expect(result.dashboard.schemaVersion).toBe("sena-coding-reliability-dashboard/v2");
    expect(result.annotationCount).toBe(4);
    expect(result.reviewPatch).toEqual(expect.objectContaining({
      reviewer: "Local reviewer",
      codingScheme: "Uploaded multi-coder annotation file",
      agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
      agreementValue: "kappa=0; alpha=0"
    }));
  });

  it("discloses ragged coder rows and excludes their padded empty value cells as missing data", async () => {
    // The last row is truncated before its value cell. parseSenaCsv pads it and
    // reliability.ts treats the cell as missing data (2026-08-01 §4.1, decided
    // 2026-08-02): never "applied" (pre-fix inflation) and never "not applied"
    // (fabricated disagreement) — the unit is excluded from pairable units for
    // that coder, Krippendorff-style.
    const csv = [
      "coder_id,item_id,code_id,value",
      "c1,u1,Evidence,1",
      "c2,u1,Evidence,1",
      "c1,u2,Evidence,1",
      "c2,u2,Evidence"
    ].join("\n");

    const result = await importSenaReliabilityFiles([
      {
        name: "coder-ratings.csv",
        size: csv.length,
        text: async () => csv,
        arrayBuffer: async () => new TextEncoder().encode(csv).buffer
      }
    ], "Local reviewer");

    expect(result.warnings).toContain(
      "coder-ratings.csv: CSV row 5 has 3 cells but the header has 4; padded empty values for: value."
    );
    expect(result.warnings).toContain(
      "coder annotation row 4 has an empty value cell; it is treated as missing data and excluded from pairable reliability units."
    );
    expect(result.warnings).toContain(
      "1 distinct coder cell(s) with an empty value were treated as missing data and excluded from pairable reliability units."
    );
    expect(result.warnings).toContain(
      "1 coder pair(s) were not estimable; their agreement estimates are reported as null with a stable status."
    );
    expect(result.dashboard.warnings).toEqual(result.warnings);
    expect(result.annotationCount).toBe(3);
    expect(result.dashboard.coderCount).toBe(2);
    expect(result.dashboard.binaryUnitCount).toBe(2);
    // Pin the estimator consequence: u2::Evidence is unpairable for c1-c2 (c2's
    // cell is missing), leaving 1 pairable unit — below the no-evidence floor,
    // so kappa/alpha report null with disclosure. No fabricated disagreement
    // (pre-fix empty=applied minted agreement; empty=not-applied would mint a
    // disagreement; a degenerate 1-unit kappa would mint a perfect score).
    expect(result.dashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({
      units: 1,
      status: "insufficient-pairable-units",
      kappa: null
    }));
    expect(result.dashboard.meanPairwiseKappa).toBeNull();
    expect(result.dashboard.krippendorffAlphaNominal).toBeNull();
    expect(result.dashboard.disagreementCount).toBe(0);
    expect(result.reviewPatch.status).toBe("documented");
  });

  it("leaves reliability warnings empty for a well-formed coder file", async () => {
    const csv = [
      "coder_id,item_id,code_id,value",
      "c1,u1,Evidence,1",
      "c2,u1,Evidence,0",
      "c1,u2,Evidence,1",
      "c2,u2,Evidence,1"
    ].join("\n");

    const result = await importSenaReliabilityFiles([
      {
        name: "clean-ratings.csv",
        size: csv.length,
        text: async () => csv,
        arrayBuffer: async () => new TextEncoder().encode(csv).buffer
      }
    ], "Local reviewer");

    expect(result.warnings).toEqual([]);
  });

  it("carries ragged-row warnings through the exported parseCoderAnnotationsCsv helper", () => {
    const parsed = parseCoderAnnotationsCsv([
      "coder_id,item_id,code_id,value",
      "c1,u1,Evidence,1",
      "c2,u1,Evidence"
    ].join("\n"));

    expect(parsed.warnings).toContain(
      "CSV row 3 has 3 cells but the header has 4; padded empty values for: value."
    );
    expect(parsed.warnings).toContain(
      "coder annotation row 2 has an empty value cell; it is treated as missing data and excluded from pairable reliability units."
    );
    // The return shape stays destructurable for existing callers; the padded
    // row is disclosed twice but only the recorded annotation survives.
    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.skippedCells).toEqual([{ coderId: "c2", itemId: "u1", codeIds: ["Evidence"] }]);
    expect(parseCoderAnnotationsCsv("coder_id,item_id,code_id,value\nc1,u1,Evidence,1").warnings).toEqual([]);
  });

  it("records explicitly empty value cells as skipped missing-data cells, never applied", () => {
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "   " }
    ]);

    expect(parsed.annotations).toEqual([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true }
    ]);
    expect(parsed.skippedCells).toEqual([
      { coderId: "c2", itemId: "u1", codeIds: ["Evidence"] },
      { coderId: "c2", itemId: "u1", codeIds: ["Evidence"] }
    ]);
    expect(parsed.warnings).toEqual([
      "coder annotation row 2 has an empty value cell; it is treated as missing data and excluded from pairable reliability units.",
      "coder annotation row 3 has an empty value cell; it is treated as missing data and excluded from pairable reliability units."
    ]);
  });

  it("distinguishes missing cells from explicit not-applied decisions in kappa and alpha", () => {
    // Same fixture twice, differing only in c2's u2 cell: an explicit "0" is a
    // recorded disagreement; an empty cell is missing data and excludes the
    // unit from the pair universe. A recorded decision always beats a skip.
    const explicitNo = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
    ]);
    const explicitDashboard = buildSenaReliabilityDashboard(explicitNo.annotations, { skippedCells: explicitNo.skippedCells });
    expect(explicitDashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({ units: 2, kappa: 0 }));
    expect(explicitDashboard.disagreementCount).toBe(1);

    const missing = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "" }
    ]);
    const missingDashboard = buildSenaReliabilityDashboard(missing.annotations, { skippedCells: missing.skippedCells });
    // One pairable unit is below the no-evidence floor: kappa/alpha report null
    // with disclosure rather than a degenerate perfect score, and — unlike the
    // explicit "0" fixture above — no disagreement is fabricated.
    expect(missingDashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({
      units: 1,
      status: "insufficient-pairable-units",
      kappa: null
    }));
    expect(missingDashboard.krippendorffAlphaNominal).toBeNull();
    expect(missingDashboard.disagreementCount).toBe(0);
    expect(missingDashboard.binaryUnitCount).toBe(2);
    expect(missingDashboard.warnings).toContain(
      "1 coder pair(s) were not estimable; their agreement estimates are reported as null with a stable status."
    );

    // A recorded decision beats a skipped cell for the same coder/item/code —
    // in both directions: a recorded "1" restores the agreement, a recorded
    // "0" is a genuine adjudicable disagreement, never a missing cell.
    const recordedWins = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" }
    ]);
    const recordedDashboard = buildSenaReliabilityDashboard(recordedWins.annotations, { skippedCells: recordedWins.skippedCells });
    expect(recordedDashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({ units: 1 }));
    expect(recordedDashboard.disagreementCount).toBe(0);

    const recordedNo = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "0" }
    ]);
    const recordedNoDashboard = buildSenaReliabilityDashboard(recordedNo.annotations, { skippedCells: recordedNo.skippedCells });
    expect(recordedNoDashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({ units: 1 }));
    expect(recordedNoDashboard.disagreementCount).toBe(1);
    expect(recordedNoDashboard.adjudicationQueue).toEqual([
      { itemId: "u1", codeId: "Evidence", values: { c1: true, c2: false } }
    ]);
  });

  it("reports no evidence, not perfect agreement, for a sparse pairable universe", () => {
    // 10 items where c2 left 9 of 10 value cells empty: only one pairable unit
    // survives. A degenerate kappa/alpha convention would report 1 and clear
    // the claim-readiness gate from a single overlapping decision; the
    // no-evidence floor reports null and demotes the interpretation instead.
    const rows = Array.from({ length: 10 }, (_, index) => ({
      coder_id: "c1",
      item_id: `u${index + 1}`,
      code_id: "Evidence",
      value: "1"
    }));
    const c2Rows = Array.from({ length: 10 }, (_, index) => ({
      coder_id: "c2",
      item_id: `u${index + 1}`,
      code_id: "Evidence",
      value: index === 0 ? "1" : ""
    }));
    const parsed = parseCoderAnnotationsFromRows([...rows, ...c2Rows]);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });

    expect(dashboard.binaryUnitCount).toBe(10);
    expect(dashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({
      units: 1,
      status: "insufficient-pairable-units",
      kappa: null
    }));
    expect(dashboard.meanPairwiseKappa).toBeNull();
    expect(dashboard.krippendorffAlphaNominal).toBeNull();
    expect(dashboard.disagreementCount).toBe(0);
    expect(dashboard.interpretation).toBe(
      "Reliability is not estimable (insufficient-pairable-units); do not substitute a zero or perfect score."
    );
    expect(dashboard.warnings).toContain(
      "9 distinct coder cell(s) with an empty value were treated as missing data and excluded from pairable reliability units."
    );
  });

  it("degrades fail-safe when one coder's every value cell is empty", () => {
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "" },
      { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "" }
    ]);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });

    // The wholly-empty coder contributes no annotations, so the dashboard
    // degrades to the single-coder no-evidence path rather than minting stats.
    expect(dashboard.coderCount).toBe(1);
    expect(dashboard.warnings).toContain("At least two coders are required for reliability statistics.");
    expect(dashboard.meanPairwiseKappa).toBeNull();
    expect(dashboard.krippendorffAlphaNominal).toBeNull();
    expect(reliabilityDashboardToReview(dashboard).status).toBe("not-documented");
  });

  it("keeps presence-style files without a value column reading as applied", () => {
    const parsed = parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "u1", code_id: "Evidence" },
      { coder_id: "c2", item_id: "u1", code_id: "Evidence" }
    ]);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.annotations).toEqual([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true }
    ]);
  });

  it("prepares JSON API annotation batches with audit-ready source fingerprints", () => {
    const prepared = prepareSenaReliabilityJsonRequest({
      schemaVersion: "sena-reliability-json-request/v1",
      teamId: "team-json",
      projectId: "project-json",
      reviewer: "JSON reviewer",
      sourceName: "reliability-api-batch.json",
      annotations: [
        { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
        { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
        { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "1" },
        { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" },
        { coder_id: "c1", item_id: "u2", code_id: "Explanation", value: "1" },
        { coder_id: "c2", item_id: "u2", code_id: "Explanation", value: "0" }
      ]
    }, { defaultReviewer: "Fallback reviewer" });

    expect(prepared.schemaVersion).toBe("sena-reliability-prepared-input/v1");
    expect(prepared.source).toBe("json-annotations");
    expect(prepared.teamId).toBe("team-json");
    expect(prepared.projectId).toBe("project-json");
    expect(prepared.reviewer).toBe("JSON reviewer");
    expect(prepared.fileCount).toBe(1);
    expect(prepared.annotationCount).toBe(6);
    expect(prepared.inputFiles).toEqual([
      expect.objectContaining({
        name: "reliability-api-batch.json",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    ]);
    expect(prepared.inputFiles[0].size).toBeGreaterThan(0);
    expect(prepared.dashboard).toEqual(expect.objectContaining({
      schemaVersion: "sena-coding-reliability-dashboard/v2",
      coderCount: 2,
      codeCount: 2,
      disagreementCount: 2
    }));
    expect(prepared.reviewPatch).toEqual(expect.objectContaining({
      reviewer: "JSON reviewer",
      agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal"
    }));
  });

  it("fingerprints Unicode JSON row keys in canonical code-unit order", () => {
    const row = {
      "ä": "last-by-code-unit",
      z: "before-umlaut",
      coder_id: "coder-z",
      item_id: "u1",
      code_id: "Evidence",
      value: "1"
    };
    const prepared = prepareSenaReliabilityJsonRequest({
      sourceName: "unicode-row.json",
      annotations: [row]
    });
    const stable = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
      if (value && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left === right ? 0 : left < right ? -1 : 1)
          .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
          .join(",")}}`;
      }
      return JSON.stringify(value);
    };
    const expectedBody = stable({
      schemaVersion: "sena-reliability-json-source/v1",
      name: "unicode-row.json",
      rows: [row]
    });

    expect(prepared.inputFiles[0].sha256)
      .toBe(createHash("sha256").update(expectedBody).digest("hex"));
  });

  it("computes canonical Krippendorff nominal alpha with the n(n-1) correction", () => {
    // Four item-code units, two coders: three agree (T/T, T/T, F/F) and one
    // disagrees (T/F). Coincidence matrix marginals n_T=5, n_F=3, n=8, so the
    // canonical alpha = 1 - (n-1)*D_o / D_e = 1 - 7*2 / 30 = 0.5333. The old
    // population-proportion approximation (1 - D_o / (1 - sum p_c^2)) would report
    // a different value, so this pins the corrected estimator.
    const dashboard = buildSenaReliabilityDashboard(parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "i1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "i1", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "i2", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "i2", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "i3", code_id: "Evidence", value: "0" },
      { coder_id: "c2", item_id: "i3", code_id: "Evidence", value: "0" },
      { coder_id: "c1", item_id: "i4", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "i4", code_id: "Evidence", value: "0" }
    ]).annotations);

    expect(dashboard.krippendorffAlphaNominal).toBe(0.5333);

    const perfectAgreement = buildSenaReliabilityDashboard(parseCoderAnnotationsFromRows([
      { coder_id: "c1", item_id: "i1", code_id: "Evidence", value: "1" },
      { coder_id: "c2", item_id: "i1", code_id: "Evidence", value: "1" },
      { coder_id: "c1", item_id: "i2", code_id: "Evidence", value: "0" },
      { coder_id: "c2", item_id: "i2", code_id: "Evidence", value: "0" }
    ]).annotations);

    expect(perfectAgreement.krippendorffAlphaNominal).toBe(1);
  });
});
