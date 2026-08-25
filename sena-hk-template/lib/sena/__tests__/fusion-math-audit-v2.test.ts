import { describe, expect, it } from "vitest";
import { buildSenaFusionMathAudit, normalizeSenaFusionMathAudit } from "../fusion-math";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaModel } from "../types";

function modelCopy(): SenaModel {
  return structuredClone(buildSenaModel(lessonStudySenaContract));
}

function postgresJsonbRoundTrip<T>(value: T): T {
  const reorder = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(reorder);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left === right ? 0 : left < right ? 1 : -1)
          .map(([key, child]) => [key, reorder(child)])
      );
    }
    return entry;
  };
  return reorder(JSON.parse(JSON.stringify(value))) as T;
}

describe("SENA fusion math audit v2", () => {
  it("emits the v2 audit contract while keeping the artifact envelope separate", () => {
    expect(buildSenaFusionMathAudit(modelCopy()).schemaVersion).toBe("sena-fusion-math-audit/v2");
  });

  it("accepts a value-identical current-v2 audit after a JSONB-style key reorder", () => {
    const model = modelCopy();
    const audit = buildSenaFusionMathAudit(model);
    const reordered = Object.fromEntries(Object.entries(audit).reverse()) as typeof audit;

    expect(normalizeSenaFusionMathAudit(reordered, model)).toEqual(reordered);
  });

  it("accepts a current-v2 audit and evidence after a recursive JSONB round trip", () => {
    const model = modelCopy();
    const audit = buildSenaFusionMathAudit(model);
    const persistedModel = postgresJsonbRoundTrip(model);
    const persistedAudit = postgresJsonbRoundTrip(audit);

    expect(buildSenaFusionMathAudit(persistedModel)).toEqual(persistedAudit);
    expect(normalizeSenaFusionMathAudit(persistedAudit, persistedModel)).toEqual(persistedAudit);
  });

  it.each([
    ["deleted", (items: ReturnType<typeof buildSenaFusionMathAudit>["items"]) => items.slice(1)],
    ["duplicated", (items: ReturnType<typeof buildSenaFusionMathAudit>["items"]) => [...items, structuredClone(items[0])]],
    ["unknown substitution", (items: ReturnType<typeof buildSenaFusionMathAudit>["items"]) => items.map((item, index) => (
      index === 0 ? { ...item, id: "unknown-proof-obligation" } : item
    ))]
  ])("rejects a current-v2 audit with a %s proof obligation even when counts agree", (_label, mutate) => {
    const audit = buildSenaFusionMathAudit(modelCopy());
    audit.items = mutate(audit.items);
    audit.passed = audit.items.filter((item) => item.status === "pass").length;
    audit.reviewNeeded = audit.items.length - audit.passed;
    audit.status = audit.reviewNeeded === 0 ? "verified" : "needs-review";

    expect(() => normalizeSenaFusionMathAudit(audit)).toThrow(/proof|eight|fusion math audit/i);
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

  it.each([
    ["empty S.raw", (model: SenaModel) => { model.matrices.S.raw = []; }],
    ["ragged B_PC.raw", (model: SenaModel) => { model.matrices.B_PC.raw[0].pop(); }],
    ["extra W.normalized row", (model: SenaModel) => { model.matrices.W.normalized.push([...model.matrices.W.normalized[0]]); }],
    ["extra A_fusion row", (model: SenaModel) => { model.matrices.fusion.values.push([...model.matrices.fusion.values[0]]); }]
  ] as const)("rejects %s instead of accepting a vacuous or partial matrix shape", (_label, tamper) => {
    const model = modelCopy();
    tamper(model);

    const audit = buildSenaFusionMathAudit(model);

    expect(audit.status).toBe("needs-review");
    expect(audit.items).toContainEqual(expect.objectContaining({
      id: "labels-and-dimensions",
      status: "review"
    }));
  });

  it.each([
    ["empty descriptors", (model: SenaModel) => { model.matrices.G.pairs = []; }],
    ["short descriptors", (model: SenaModel) => { model.matrices.G.pairs.pop(); }],
    ["extra descriptors", (model: SenaModel) => {
      model.matrices.G.pairs.push({ ...model.matrices.G.pairs[0], id: "extra-pair" });
    }],
    ["reordered descriptors", (model: SenaModel) => {
      [model.matrices.G.pairs[0], model.matrices.G.pairs[1]] = [model.matrices.G.pairs[1], model.matrices.G.pairs[0]];
    }],
    ["duplicate descriptors", (model: SenaModel) => {
      model.matrices.G.pairs[1] = { ...model.matrices.G.pairs[0] };
    }],
    ["mismatched descriptor", (model: SenaModel) => {
      model.matrices.G.pairs[0] = { ...model.matrices.G.pairs[0], label: "tampered pair label" };
    }]
  ] as const)("rejects G %s and binds pair descriptors into the G fingerprint", (_label, tamper) => {
    const baseline = modelCopy();
    const baselineChecksum = buildSenaFusionMathAudit(baseline).matrixFingerprints
      .find((fingerprint) => fingerprint.id === "G")?.checksum;
    const model = modelCopy();
    tamper(model);

    const audit = buildSenaFusionMathAudit(model);
    const tamperedChecksum = audit.matrixFingerprints.find((fingerprint) => fingerprint.id === "G")?.checksum;

    expect(audit.status).toBe("needs-review");
    expect(audit.items).toContainEqual(expect.objectContaining({
      id: "g-pair-coverage",
      status: "review"
    }));
    expect(tamperedChecksum).not.toBe(baselineChecksum);
  });
});
