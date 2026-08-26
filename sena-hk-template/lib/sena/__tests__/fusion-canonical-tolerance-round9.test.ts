import { describe, expect, it } from "vitest";
import {
  buildSenaFusionMathAudit,
  buildSenaFusionMathAuditArtifact,
  normalizeSenaFusionMathAudit
} from "../fusion-math";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaFusionMathAudit, SenaModel } from "../types";

const canonicalTolerance = 1e-9;

function modelCopy() {
  return structuredClone(buildSenaModel(lessonStudySenaContract));
}

function forgePayloadSelectedTolerance(model: SenaModel): SenaFusionMathAudit {
  const audit = buildSenaFusionMathAudit(model);
  for (const item of audit.items) {
    if (item.maxDelta !== undefined) {
      item.tolerance = 1;
      item.status = "pass";
    }
  }
  audit.passed = audit.items.filter((item) => item.status === "pass").length;
  audit.reviewNeeded = audit.items.length - audit.passed;
  audit.status = audit.reviewNeeded === 0 ? "verified" : "needs-review";
  return audit;
}

describe("fusion audit canonical tolerance", () => {
  it("does not let the public audit builder issue verified evidence with a caller-selected tolerance", () => {
    expect(() => buildSenaFusionMathAudit(modelCopy(), 1))
      .toThrow(/canonical|tolerance|1e-9/i);
  });

  it("does not let the artifact builder issue verified evidence with a noncanonical tolerance", () => {
    expect(() => buildSenaFusionMathAuditArtifact(modelCopy(), { tolerance: 1 }))
      .toThrow(/canonical|tolerance|1e-9/i);
  });

  it.each([
    ["social", (model: SenaModel) => { model.matrices.fusion.values[0][0] += 0.5; }],
    ["person-to-code bridge", (model: SenaModel) => {
      model.matrices.fusion.values[0][model.matrices.S.labels.length] += 0.5;
    }],
    ["code-to-person bridge", (model: SenaModel) => {
      model.matrices.fusion.values[model.matrices.S.labels.length][0] += 0.5;
    }],
    ["concept", (model: SenaModel) => {
      const offset = model.matrices.S.labels.length;
      model.matrices.fusion.values[offset][offset] += 0.5;
    }]
  ] as const)("rejects a coordinated %s block tamper hidden behind tolerance=1", (_label, tamper) => {
    const model = modelCopy();
    tamper(model);
    const forged = forgePayloadSelectedTolerance(model);

    expect(forged.status).toBe("verified");
    expect(forged.items.filter((item) => item.maxDelta !== undefined).every((item) => item.tolerance === 1)).toBe(true);
    expect(() => normalizeSenaFusionMathAudit(forged, model))
      .toThrow(/canonical|tolerance|matrix semantics|fusion math audit/i);
  });

  it("continues to expose one exact tolerance on canonical verified audits", () => {
    const audit = buildSenaFusionMathAudit(modelCopy());

    expect(audit.status).toBe("verified");
    expect(audit.items.filter((item) => item.maxDelta !== undefined))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ tolerance: canonicalTolerance, status: "pass" })
      ]));
  });
});
