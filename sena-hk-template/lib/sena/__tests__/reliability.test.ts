import { describe, expect, it } from "vitest";
import { importSenaReliabilityFiles } from "../reliability-adapters";
import { prepareSenaReliabilityJsonRequest } from "../reliability-api";
import { buildSenaReliabilityDashboard, parseCoderAnnotationsFromRows } from "../reliability";

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
    expect(result.dashboard.schemaVersion).toBe("sena-coding-reliability-dashboard/v1");
    expect(result.annotationCount).toBe(4);
    expect(result.reviewPatch).toEqual(expect.objectContaining({
      reviewer: "Local reviewer",
      codingScheme: "Uploaded multi-coder annotation file",
      agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
      agreementValue: "kappa=0; alpha=0"
    }));
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
      schemaVersion: "sena-coding-reliability-dashboard/v1",
      coderCount: 2,
      codeCount: 2,
      disagreementCount: 2
    }));
    expect(prepared.reviewPatch).toEqual(expect.objectContaining({
      reviewer: "JSON reviewer",
      agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal"
    }));
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
