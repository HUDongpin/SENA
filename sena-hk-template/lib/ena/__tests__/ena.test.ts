import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ena } from "jena-js";
import {
  buildEnaRunResult,
  inferEnaMapping,
  parseCsv,
  prepareEnaRun,
  runEnaRequest,
  sampleEnaCsv
} from "../index";

const rEnaParityFixture = JSON.parse(
  readFileSync(new URL("../__fixtures__/r-ena-sample-parity.json", import.meta.url), "utf8")
) as {
  variance: Record<"SVD1" | "SVD2", number>;
  points: Array<{ participant: string; SVD1: number; SVD2: number }>;
  nodes: Array<{ code: string; SVD1: number; SVD2: number }>;
  lineWeights: Array<Record<string, number | string>>;
  connectionCounts: Array<Record<string, number | string>>;
};

function numericRowsByKey<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return new Map(rows.map((row) => [String(row[key]), row]));
}

function axisSign<T extends Record<string, unknown>>(reference: T[], actual: T[], key: keyof T, idKey: keyof T) {
  const actualById = numericRowsByKey(actual, idKey);
  const dot = reference.reduce((sum, row) => {
    const actualRow = actualById.get(String(row[idKey]));
    return sum + Number(row[key]) * Number(actualRow?.[key] ?? 0);
  }, 0);
  return dot < 0 ? -1 : 1;
}

function sampleRequest() {
  const parsed = parseCsv(sampleEnaCsv);
  return {
    rows: parsed.rows,
    mapping: inferEnaMapping(parsed.headers, parsed.rows),
    options: {
      model: "EndPoint" as const,
      window: "MovingStanzaWindow" as const,
      weightBy: "binary" as const,
      windowSizeBack: 1,
      windowSizeForward: 0,
      dimensions: 2,
      nodePositionMethod: "undirected" as const
    }
  };
}

describe("CSV parsing", () => {
  it("parses quoted values, escaped quotes, empty cells, and headers", () => {
    const parsed = parseCsv('unit,conv,A,B,note\n"u,1",c1,1,,"said ""hi"""');

    expect(parsed.headers).toEqual(["unit", "conv", "A", "B", "note"]);
    expect(parsed.rows[0]).toEqual({
      unit: "u,1",
      conv: "c1",
      A: "1",
      B: null,
      note: 'said "hi"'
    });
  });

  it("rejects malformed row widths", () => {
    expect(() => parseCsv("unit,conv,A\nu1,c1,1,extra")).toThrow(/header has 3/);
  });
});

describe("ENA input validation", () => {
  it("requires unit, conversation, and at least two code columns", () => {
    expect(() => prepareEnaRun({
      rows: [{ unit: "u1", conv: "c1", A: "1" }],
      mapping: { units: [], conversation: ["conv"], codes: ["A"] }
    })).toThrow(/unit column/);
  });

  it("rejects non-numeric code values", () => {
    expect(() => prepareEnaRun({
      rows: [{ unit: "u1", conv: "c1", A: "1", B: "oops" }],
      mapping: { units: ["unit"], conversation: ["conv"], codes: ["A", "B"] }
    })).toThrow(/non-numeric/);
  });
});

describe("jENA execution", () => {
  it("generates points, connection counts, node positions, and variance", () => {
    const result = runEnaRequest(sampleRequest(), "api");

    expect(result.set.points.length).toBe(6);
    expect(result.set.connectionCounts.length).toBe(6);
    expect(result.set.rotation.nodes?.length).toBe(7);
    expect(result.summary.dimensions).toEqual(["SVD1", "SVD2"]);
    expect(Object.keys(result.summary.variance)).toEqual(["SVD1", "SVD2"]);
  });

  it("keeps the shared result builder equivalent to the API runner", () => {
    const request = sampleRequest();
    const prepared = prepareEnaRun(request);
    const directSet = ena(prepared.options);
    const direct = buildEnaRunResult(directSet, request.rows.length, "worker", 0, prepared.warnings);
    const api = runEnaRequest(request, "api");

    expect(direct.set.points.length).toBe(api.set.points.length);
    expect(direct.summary.variance.SVD1).toBeCloseTo(api.summary.variance.SVD1, 10);
    expect(direct.summary.variance.SVD2).toBeCloseTo(api.summary.variance.SVD2, 10);
    expect(direct.plotModel.traces.length).toBe(api.plotModel.traces.length);
  });

  it("matches the bundled rENA parity fixture on sample line weights and connection counts", () => {
    const result = runEnaRequest(sampleRequest(), "api");
    const actualLineWeights = numericRowsByKey(result.set.lineWeights, "participant");
    const actualConnectionCounts = numericRowsByKey(result.set.connectionCounts, "participant");

    for (const expectedRow of rEnaParityFixture.lineWeights) {
      const participant = String(expectedRow.participant);
      const actualRow = actualLineWeights.get(participant);
      expect(actualRow).toBeTruthy();

      for (const [column, expectedValue] of Object.entries(expectedRow)) {
        if (column === "participant") continue;
        expect(Number(actualRow?.[column as keyof typeof actualRow])).toBeCloseTo(Number(expectedValue), 12);
      }
    }

    for (const expectedRow of rEnaParityFixture.connectionCounts) {
      const participant = String(expectedRow.participant);
      const actualRow = actualConnectionCounts.get(participant);
      expect(actualRow).toBeTruthy();

      for (const [column, expectedValue] of Object.entries(expectedRow)) {
        if (column === "participant") continue;
        expect(Number(actualRow?.[column as keyof typeof actualRow])).toBe(Number(expectedValue));
      }
    }
  });

  it("matches the bundled rENA parity fixture on 2D variance, unit points, and node positions up to axis sign", () => {
    const result = runEnaRequest(sampleRequest(), "api");
    const pointSignSvd1 = axisSign(rEnaParityFixture.points, result.set.points, "SVD1", "participant");
    const pointSignSvd2 = axisSign(rEnaParityFixture.points, result.set.points, "SVD2", "participant");
    const nodeSignSvd1 = axisSign(rEnaParityFixture.nodes, result.set.rotation.nodes ?? [], "SVD1", "code");
    const nodeSignSvd2 = axisSign(rEnaParityFixture.nodes, result.set.rotation.nodes ?? [], "SVD2", "code");
    const actualPoints = numericRowsByKey(result.set.points, "participant");
    const actualNodes = numericRowsByKey(result.set.rotation.nodes ?? [], "code");

    expect(result.summary.variance.SVD1).toBeCloseTo(rEnaParityFixture.variance.SVD1, 10);
    expect(result.summary.variance.SVD2).toBeCloseTo(rEnaParityFixture.variance.SVD2, 10);

    for (const expectedPoint of rEnaParityFixture.points) {
      const actualPoint = actualPoints.get(expectedPoint.participant);
      expect(actualPoint).toBeTruthy();
      expect(Number(actualPoint?.SVD1) * pointSignSvd1).toBeCloseTo(expectedPoint.SVD1, 6);
      expect(Number(actualPoint?.SVD2) * pointSignSvd2).toBeCloseTo(expectedPoint.SVD2, 6);
    }

    for (const expectedNode of rEnaParityFixture.nodes) {
      const actualNode = actualNodes.get(expectedNode.code);
      expect(actualNode).toBeTruthy();
      expect(Number(actualNode?.SVD1) * nodeSignSvd1).toBeCloseTo(expectedNode.SVD1, 6);
      expect(Number(actualNode?.SVD2) * nodeSignSvd2).toBeCloseTo(expectedNode.SVD2, 6);
    }
  });
});
