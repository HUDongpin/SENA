import { describe, expect, it } from "vitest";
import { buildSenaFusionMathAudit } from "../fusion-math";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaModel } from "../types";

function modelCopy(): SenaModel {
  return structuredClone(buildSenaModel(lessonStudySenaContract));
}

describe("SENA fusion math audit v2", () => {
  it("emits the v2 audit contract while keeping the artifact envelope separate", () => {
    expect(buildSenaFusionMathAudit(modelCopy()).schemaVersion).toBe("sena-fusion-math-audit/v2");
  });

  it.each([
    ["S.raw", (model: SenaModel) => { model.matrices.S.raw[0][0] = -1; }],
    ["W.normalized", (model: SenaModel) => { model.matrices.W.normalized[0][0] = -1; }],
    ["B.raw", (model: SenaModel) => { model.matrices.B.raw[0][0] = -1; }],
    ["B_PC.normalized", (model: SenaModel) => { model.matrices.B_PC.normalized[0][0] = -1; }],
    ["B_CP.raw", (model: SenaModel) => { model.matrices.B_CP.raw[0][0] = -1; }],
    ["G.normalized", (model: SenaModel) => { model.matrices.G.normalized[0][0] = -1; }],
    ["A_fusion", (model: SenaModel) => { model.matrices.fusion.values[0][0] = -1; }]
  ] as const)("marks a tampered negative %s matrix value as non-verified", (_label, tamper) => {
    const model = modelCopy();
    tamper(model);

    const audit = buildSenaFusionMathAudit(model);

    expect(audit.status).toBe("needs-review");
    expect(audit.items).toContainEqual(expect.objectContaining({
      id: "nonnegative-values",
      status: "review"
    }));
  });

  it("audits nonnegative alpha, beta, and gamma independently of block equality", () => {
    const model = modelCopy();
    model.options.alpha = -1;

    const audit = buildSenaFusionMathAudit(model);

    expect(audit.items).toContainEqual(expect.objectContaining({
      id: "nonnegative-values",
      status: "review"
    }));
  });
});
