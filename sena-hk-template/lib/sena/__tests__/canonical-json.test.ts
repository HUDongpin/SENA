import { describe, expect, it } from "vitest";
import { canonicalSenaJson, senaJsonValuesEqual } from "../canonical-json";

describe("canonical SENA JSON semantics", () => {
  it("ignores object key order and JSON-omitted object values without ignoring semantic fields", () => {
    const left = { z: 2, omitted: undefined, nested: { b: false, a: "value" } };
    const reordered = { nested: { a: "value", b: false }, z: 2 };

    expect(senaJsonValuesEqual(left, reordered)).toBe(true);
    expect(senaJsonValuesEqual(left, { ...reordered, extra: true })).toBe(false);
  });

  it("matches JSON.stringify for sparse, undefined, and non-finite array entries", () => {
    const sparse = Array(1);
    const values = [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

    expect(canonicalSenaJson(sparse)).toBe(JSON.stringify(sparse));
    expect(canonicalSenaJson(values)).toBe(JSON.stringify(values));
  });
});
