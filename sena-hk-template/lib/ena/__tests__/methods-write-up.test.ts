import { describe, expect, it } from "vitest";
import { ena } from "jena-js";
import { buildEnaMethodsWriteUp } from "../methods-write-up";
import { ENA_NETWORK_MIN_WEIGHT_FLOOR, buildEnaRunResult, effectiveEnaMinWeight } from "../results";
import { defaultEnaOptions } from "../validation";
import type { EnaRow } from "../types";

// The drawn network always suppresses edges at or below a floor
// (lib/ena/results.ts). These tests pin the disclosure contract: the methods
// write-up states the threshold that was actually applied, including when the
// researcher never touched the slider — a dropped edge must never be
// undisclosed.

const CODES = ["A", "B", "C"];

function row(unit: string, phase: string, codes: number[]): EnaRow {
  return {
    unit,
    Phase: phase,
    ...Object.fromEntries(CODES.map((code, index) => [code, codes[index]]))
  };
}

const rows: EnaRow[] = [
  row("u1", "P1", [1, 1, 0]),
  row("u1", "P2", [1, 0, 1]),
  row("u2", "P1", [1, 0, 1]),
  row("u2", "P2", [0, 1, 1]),
  row("u3", "P1", [1, 1, 0]),
  row("u3", "P2", [1, 1, 1])
];

const mapping = { units: ["unit"], conversation: ["Phase"], codes: CODES };

function writeUp(minWeight: number) {
  const set = ena({
    rows,
    units: mapping.units,
    conversation: mapping.conversation,
    codes: CODES,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    dimensions: 2
  });
  const result = buildEnaRunResult(set, rows.length, "worker", 5, [], minWeight > 0 ? { minWeight } : {});
  return buildEnaMethodsWriteUp({
    result,
    mapping,
    options: defaultEnaOptions,
    groupBy: "",
    minWeight,
    comparisons: []
  });
}

describe("minimum-edge-weight disclosure", () => {
  it("raises the researcher's setting to the floor, never lowers it", () => {
    expect(effectiveEnaMinWeight(0)).toBe(ENA_NETWORK_MIN_WEIGHT_FLOOR);
    expect(effectiveEnaMinWeight(0.0005)).toBe(ENA_NETWORK_MIN_WEIGHT_FLOOR);
    expect(effectiveEnaMinWeight(0.05)).toBe(0.05);
  });

  it("discloses the default floor when the slider was never raised", () => {
    const text = writeUp(0);

    expect(text).toContain(`at or below ${ENA_NETWORK_MIN_WEIGHT_FLOOR.toFixed(3)}`);
    expect(text).toContain("default noise floor");
    expect(text).toContain("drawn network only");
  });

  it("discloses a researcher-set threshold as a choice, not a default", () => {
    const text = writeUp(0.05);

    expect(text).toContain("at or below 0.050");
    expect(text).not.toContain("default noise floor");
  });
});
