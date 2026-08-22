import { describe, expect, it, vi } from "vitest";
import { enterpriseErrorResponse } from "../enterprise/errors";
import {
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  SenaReliabilityAnnotationValidationError,
  type SenaCoderAnnotation
} from "../reliability";

describe("Round11 reliability tuple correctness and indexed work", () => {
  it("rejects duplicate annotation cells before dashboard derivation", () => {
    const flatMap = vi.spyOn(Array.prototype, "flatMap");
    const annotations: SenaCoderAnnotation[] = [
      { coderId: "coder-a", itemId: "item-1", codeId: "evidence", value: true },
      { coderId: "coder-a", itemId: "item-1", codeId: "evidence", value: true }
    ];

    try {
      expect(() => buildSenaReliabilityDashboard(annotations)).toThrow(expect.objectContaining({
        name: "SenaReliabilityAnnotationValidationError",
        status: 400,
        code: "invalid_sena_reliability_annotations",
        issues: [{ path: "annotations.1", code: "duplicate-cell" }]
      }));
      expect(flatMap).not.toHaveBeenCalled();
    } finally {
      flatMap.mockRestore();
    }
  });

  it("rejects contradictory annotation cells before dashboard derivation", () => {
    const flatMap = vi.spyOn(Array.prototype, "flatMap");
    const annotations: SenaCoderAnnotation[] = [
      { coderId: "coder-a", itemId: "item-1", codeId: "evidence", value: false },
      { coderId: "coder-a", itemId: "item-1", codeId: "evidence", value: true }
    ];

    try {
      expect(() => buildSenaReliabilityDashboard(annotations)).toThrow(expect.objectContaining({
        name: "SenaReliabilityAnnotationValidationError",
        status: 400,
        code: "invalid_sena_reliability_annotations",
        issues: [{ path: "annotations.1", code: "conflicting-cell" }]
      }));
      expect(flatMap).not.toHaveBeenCalled();
    } finally {
      flatMap.mockRestore();
    }
  });

  it("maps raw duplicate-cell validation to a sanitized client 400", () => {
    const response = enterpriseErrorResponse(new SenaReliabilityAnnotationValidationError([
      { path: "annotations.1", code: "duplicate-cell" }
    ]));

    expect(response).toEqual({
      body: {
        error: "SENA coding-reliability annotations contain duplicate coder-item-code cells.",
        code: "invalid_sena_reliability_annotations",
        issues: [{ path: "annotations.1", code: "duplicate-cell" }]
      },
      status: 400
    });
  });

  it("keeps coder, item, and code IDs containing :: as exact structured tuple members", () => {
    const annotations: SenaCoderAnnotation[] = [
      { coderId: "coder::one", itemId: "item::one", codeId: "code::evidence", value: true },
      { coderId: "coder::two", itemId: "item::one", codeId: "code::evidence", value: false },
      { coderId: "coder::one", itemId: "item::two", codeId: "code::evidence", value: true },
      { coderId: "coder::two", itemId: "item::two", codeId: "code::evidence", value: true }
    ];

    const dashboard = buildSenaReliabilityDashboard(annotations);

    expect(dashboard).toEqual(expect.objectContaining({
      coderCount: 2,
      itemCount: 2,
      codeCount: 1,
      binaryUnitCount: 2,
      disagreementCount: 1,
      meanPairwiseKappaStatus: "estimable",
      meanPairwiseKappa: 0,
      krippendorffAlphaNominalStatus: "estimable"
    }));
    expect(dashboard.pairwiseCohenKappa).toEqual([
      expect.objectContaining({
        coderA: "coder::one",
        coderB: "coder::two",
        units: 2,
        status: "estimable",
        kappa: 0
      })
    ]);
    expect(dashboard.adjudicationQueue).toEqual([{
      itemId: "item::one",
      codeId: "code::evidence",
      values: { "coder::one": true, "coder::two": false }
    }]);
    expect(dashboard.codeDiagnostics).toEqual([
      expect.objectContaining({
        codeId: "code::evidence",
        unitCount: 2,
        positiveAssignments: 3,
        disagreementCount: 1,
        agreementRate: 0.5
      })
    ]);
    expect(normalizeSenaReliabilityDashboard(dashboard)).toEqual(dashboard);
  });

  it("preserves the existing canonical annotation and skipped-cell fingerprints", () => {
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: false },
      { coderId: "c1", itemId: "u2", codeId: "explanation", value: true },
      { coderId: "c2", itemId: "u2", codeId: "explanation", value: true }
    ], {
      skippedCells: [{ coderId: "c2", itemId: "u3", codeIds: ["evidence"] }]
    });

    expect(dashboard.derivationEvidence).toEqual(expect.objectContaining({
      annotationCoverageHash: "0x3fd97fe6",
      skippedCellCoverageHash: "0xe37a3ba4"
    }));
  });

  it("reads instrumented annotation fields within a linear work budget", () => {
    let fieldReads = 0;
    const annotations: SenaCoderAnnotation[] = [];
    const coders = Array.from({ length: 4 }, (_, index) => `coder-${index + 1}`);
    const items = Array.from({ length: 12 }, (_, index) => `item-${index + 1}`);
    const codes = Array.from({ length: 4 }, (_, index) => `code-${index + 1}`);
    for (let coderIndex = 0; coderIndex < coders.length; coderIndex += 1) {
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        for (let codeIndex = 0; codeIndex < codes.length; codeIndex += 1) {
          const values = {
            coderId: coders[coderIndex],
            itemId: items[itemIndex],
            codeId: codes[codeIndex],
            value: (coderIndex + itemIndex + codeIndex) % 2 === 0
          };
          const annotation = {} as SenaCoderAnnotation;
          for (const key of ["coderId", "itemId", "codeId", "value"] as const) {
            Object.defineProperty(annotation, key, {
              enumerable: true,
              get() {
                fieldReads += 1;
                return values[key];
              }
            });
          }
          annotations.push(annotation);
        }
      }
    }

    const dashboard = buildSenaReliabilityDashboard(annotations);

    expect(dashboard.binaryUnitCount).toBe(items.length * codes.length);
    expect(dashboard.codeDiagnostics).toHaveLength(codes.length);
    expect(fieldReads).toBeLessThanOrEqual(annotations.length * 20);
  });
});
