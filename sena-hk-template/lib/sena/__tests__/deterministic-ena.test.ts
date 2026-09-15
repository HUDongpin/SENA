import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rolldown } from "rolldown";
import { chromium, firefox, webkit } from "playwright";
import { accumulateData, ena, enaCorrelations, inverseNormal, projectIn, type ENAOptions, type ENASet, type Row } from "jena-js";
import { covarianceLike, multiplyMatrices, transpose, varianceColumns } from "jena-js/core";
import { parseCsv } from "../../ena/csv";
import { sampleEnaCsv } from "../../ena/sample-data";
import { buildSenaDeterministicEnaSet, senaDeterministicEnaCorrelations } from "../deterministic-ena";
import { senaDeterministicAtanh, senaDeterministicTanh } from "../deterministic-numerics";

type Groups = [string[], string[]];
type Case = { label: string; options: ENAOptions; groups?: Groups };
const realOptions: ENAOptions = {
  rows: parseCsv(sampleEnaCsv).rows, units: ["participant"], conversation: ["conversation"],
  codes: ["PoP", "GO", "SC", "MV", "MR", "RoP", "PR"], metadata: ["turn", "stage", "group"],
  model: "EndPoint", weightBy: "binary", window: "MovingStanzaWindow", windowSizeBack: 1,
  windowSizeForward: 0, dimensions: 2, nodePositionMethod: "undirected",
};
const realGroups: Groups = [["T1", "T2", "T3"], ["T4", "T5", "T6"]];

function synthetic(units: number, codeCount: number): ENAOptions {
  const codes = Array.from({ length: codeCount }, (_, i) => `C${i}`);
  let seed = 0x13579bdf + units * 31 + codeCount;
  const rows = Array.from({ length: units * 5 }, (_, i) => {
    const row: Row = { unit: `U${Math.floor(i / 5)}`, conversation: `V${Math.floor(i / 5)}`, turn: i };
    for (const code of codes) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      row[code] = seed % 5 < 2 ? 1 : 0;
    }
    return row;
  });
  return { rows, units: ["unit"], conversation: ["conversation"], codes, weightBy: "sum", windowSizeBack: 1, dimensions: 2 };
}

const cases: Case[] = [4, 8, 20].flatMap((units) => [3, 5, 8].flatMap((codes) => {
  const options = synthetic(units, codes);
  const labels = Array.from({ length: units }, (_, i) => `U${i}`);
  return [
    { label: `${units} units / ${codes} codes / SVD`, options },
    { label: `${units} units / ${codes} codes / mean`, options, groups: [labels.slice(0, units / 2), labels.slice(units / 2)] as Groups },
  ];
}));

function edgeOptions(edges: number[][], centerAlignToOrigin = true): ENAOptions {
  // Each row represents precisely one upper-triangle edge via sum weighting.
  const rows: Row[] = edges.flatMap((weights, unit) => weights.map((weight, edge) => ({
    unit: `U${unit}`, conversation: `U${unit}`, A: edge < 2 ? 1 : 0,
    B: edge === 0 ? weight : edge === 2 ? 1 : 0, C: edge > 0 ? weight : 0,
  })));
  return { rows, units: ["unit"], conversation: ["conversation"], codes: ["A", "B", "C"], weightBy: "sum", windowSizeBack: 1, dimensions: 3, centerAlignToOrigin };
}

// Exact admission: every binary64 bit, including signed zero and nonfinite
// numbers, is compared. No rounding or numerical tolerance enters this path.
function exact(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item !== "number") return item;
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, item, false);
    return { binary64: view.getBigUint64(0, false).toString(16).padStart(16, "0") };
  });
}

function matrix(rows: Row[], columns: string[]): number[][] {
  return rows.map((row) => columns.map((column) => Number(row[column])));
}

function maxDifference(a: number[][], b: number[][]): number {
  return a.reduce((maximum, row, i) => Math.max(maximum, ...row.map((value, j) => Math.abs(value - b[i][j]))), 0);
}

function assertBasis(set: ENASet): void {
  const width = set.adjacencyKey.length;
  expect(set.rotation.rotationColumns).toHaveLength(width);
  expect(set.rotation.rotationMatrix).toHaveLength(width);
  set.rotation.rotationMatrix.forEach((row) => expect(row).toHaveLength(width));
  const basis = set.rotation.rotationMatrix;
  const identity = Array.from({ length: width }, (_, i) => Array.from({ length: width }, (_, j) => Number(i === j)));
  // Numerical analysis bounds only; exact replay uses the bit encoder above.
  expect(maxDifference(multiplyMatrices(transpose(basis), basis), identity)).toBeLessThan(2e-12);
  const points = matrix(set.pointsForProjection, set.codeColumns);
  const projected = multiplyMatrices(points, basis);
  expect(maxDifference(multiplyMatrices(projected, transpose(basis)), points)).toBeLessThan(2e-12);
  const variances = varianceColumns(projected);
  const total = variances.reduce((a, b) => a + b, 0);
  expect(set.variance).toEqual(Object.fromEntries(set.rotation.rotationColumns.map((name, i) => [name, total === 0 ? 0 : variances[i] / total])));
  if (set.rotation.rotationColumns[0] === "SVD1") {
    const gram = covarianceLike(points);
    const scale = gram.reduce((max, row) => Math.max(max, ...row.map(Math.abs)), 0);
    const eigen = set.rotation.eigenvalues;
    expect(eigen).toHaveLength(width);
    eigen.forEach((value, i) => {
      expect(value).toBeGreaterThanOrEqual(0);
      if (i) expect(value).toBeLessThanOrEqual(eigen[i - 1]);
    });
    const av = multiplyMatrices(gram, basis);
    const vd = basis.map((row) => row.map((value, j) => value * eigen[j] * Math.max(1, points.length - 1)));
    expect(maxDifference(av, vd) / (scale || 1)).toBeLessThan(2e-12);
  } else expect(set.rotation.eigenvalues).toEqual([]);
}

describe("deterministic ENA public adapter", () => {
  it("declares the exact pinned quantile and uses only public jENA entrypoints", () => {
    expect(inverseNormal((1 + 0.95) / 2)).toBe(1.9599639861189817);
    expect(JSON.parse(readFileSync(resolve(process.cwd(), "node_modules/jena-js/package.json"), "utf8")).version).toBe("0.6.2");
    const source = readFileSync(resolve(process.cwd(), "lib/sena/deterministic-ena.ts"), "utf8");
    expect(source).not.toMatch(/jena-js\/(?:dist|rotation)|Math\.(?:atan2|cos|sin|atanh|tanh|log|log1p)\s*\(/);
    expect(source).not.toMatch(/Math\.[A-Za-z]+\s*=|\.toFixed\(|\.toPrecision\(/);
  });

  for (const config of cases) it(`preserves a complete orthonormal basis: ${config.label}`, () => {
    const set = buildSenaDeterministicEnaSet(config.options, config.groups);
    assertBasis(set);
    const native = ena({ ...config.options, ...(config.groups ? { rotation: { method: "mean" as const, params: { groups: config.groups } } } : {}) });
    expect(set.connectionCounts).toEqual(native.connectionCounts);
    expect(set.lineWeights).toEqual(native.lineWeights);
    expect(set.pointsForProjection).toEqual(native.pointsForProjection);
    expect(set.rotation.centerVector).toEqual(native.rotation.centerVector);
    // Only the two displayed, nondegenerate axes are signal-aligned here;
    // null-space vectors and repeated eigenspaces need not match native signs.
    const names = set.rotation.rotationColumns.slice(0, 2);
    for (const name of names) {
      const sign = set.points.reduce((sum, row, i) => sum + Number(row[name]) * Number(native.points[i][name]), 0) < 0 ? -1 : 1;
      const pointError = Math.max(...set.points.map((row, i) => Math.abs(Number(row[name]) * sign - Number(native.points[i][name]))));
      expect(pointError).toBeLessThan(1e-10);
      expect(Math.abs(set.variance[name] - native.variance[name])).toBeLessThan(1e-12);
      const nodeError = Math.max(...(set.rotation.nodes ?? []).map((row, i) => Math.abs(Number(row[name]) * sign - Number(native.rotation.nodes?.[i][name]))));
      expect(nodeError).toBeLessThan(1e-6);
    }
  });

  it("preserves mean group orientation and accepts only one string-ID pair", () => {
    const forward = buildSenaDeterministicEnaSet(realOptions, realGroups);
    const fromOptions = buildSenaDeterministicEnaSet({ ...realOptions, rotation: { method: "mean", params: { groups: realGroups } } });
    expect(exact(fromOptions)).toBe(exact(forward));
    const reverse = buildSenaDeterministicEnaSet(realOptions, [realGroups[1], realGroups[0]]);
    const difference = (set: ENASet) => {
      const average = (labels: string[]) => {
        const rows = set.points.filter((row) => labels.includes(String(row.ENA_UNIT)));
        return rows.reduce((sum, row) => sum + Number(row.MR1), 0) / rows.length;
      };
      return average(realGroups[0]) - average(realGroups[1]);
    };
    expect(difference(forward)).toBeGreaterThan(0);
    expect(difference(reverse)).toBeLessThan(0);
    forward.rotation.rotationMatrix.forEach((row, i) => expect(row[0]).toBe(-reverse.rotation.rotationMatrix[i][0]));
    expect(() => buildSenaDeterministicEnaSet(realOptions, [[], realGroups[1]])).toThrow(/both contain/);
    expect(() => buildSenaDeterministicEnaSet(realOptions, [realGroups[0], realGroups[0]])).toThrow(/identical means/);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, rotation: { method: "mean", params: { groups: [realGroups, realGroups] } } })).toThrow(/one.*pair/i);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, rotation: { method: "mean", params: { groups: [[true], [false]] } } })).toThrow(/string/i);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, rotation: { method: "svd" } }, realGroups)).toThrow(/conflict/i);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, rotation: { method: "mean", params: { groups: realGroups } } }, realGroups)).toThrow(/conflict/i);
  });

  it("rejects unsupported rotations and preserves native validation", () => {
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, rotation: { method: "spherical" } })).toThrow(/unsupported/i);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, rotationSet: ena(realOptions).rotation })).toThrow(/projectIn/);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, dimensions: 0 })).toThrow(/dimensions/);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, nodePositionMethod: "directed" })).toThrow(/directed adjacency/);
    expect(() => buildSenaDeterministicEnaSet({ ...realOptions, codes: ["PoP"] })).toThrow(/at least 2/);
  });

  it("centers signal rows exactly and retains zero rows under both centering modes", () => {
    for (const centerAlignToOrigin of [true, false]) {
      const options = edgeOptions([[2, 1, 0], [0, 0, 0], [0, 1, 3]], centerAlignToOrigin);
      const set = buildSenaDeterministicEnaSet(options);
      expect(set.pointsForProjection).toEqual(ena(options).pointsForProjection);
      expect(set.rotation.centerVector).toEqual(ena(options).rotation.centerVector);
      assertBasis(set);
    }
    const allZero = edgeOptions([[0, 0, 0], [0, 0, 0]]);
    expect(() => buildSenaDeterministicEnaSet(allZero)).toThrow(/no co-occurrences/);
    expect(() => ena(allZero)).toThrow(/no co-occurrences/);
    const allowed = buildSenaDeterministicEnaSet({ ...allZero, centerAlignToOrigin: false });
    expect(allowed.rotation.eigenvalues).toEqual([0, 0, 0]);
    assertBasis(allowed);
  });

  it("handles repeated eigenvalues, zero Gram, and positive eigenvalues below 1e-12 without rank truncation", () => {
    const repeated = buildSenaDeterministicEnaSet(edgeOptions([[1, 0, 0], [0, 1, 0], [0, 0, 1]]));
    assertBasis(repeated);
    expect(Math.abs(repeated.rotation.eigenvalues[0] - repeated.rotation.eigenvalues[1])).toBeLessThan(1e-14);
    const zeroGram = buildSenaDeterministicEnaSet(edgeOptions([[1, 0, 0], [1, 0, 0]]));
    expect(zeroGram.rotation.eigenvalues).toEqual([0, 0, 0]);
    assertBasis(zeroGram);
    const tiny = buildSenaDeterministicEnaSet(edgeOptions([[1, 1e-8, 0], [1, 0, 1e-8], [1, 2e-8, 3e-8]]));
    assertBasis(tiny);
    expect(tiny.rotation.eigenvalues[0]).toBeGreaterThan(0);
    expect(tiny.rotation.eigenvalues[0]).toBeLessThan(1e-12);
    expect(tiny.rotation.eigenvalues[1]).toBeGreaterThan(0);
  });

  it("retains a one-dimensional mean basis without residual SVD", () => {
    const options: ENAOptions = { ...edgeOptions([[1, 0, 0], [0, 0, 0]]), codes: ["A", "B"], centerAlignToOrigin: false };
    const set = buildSenaDeterministicEnaSet(options, [["U0"], ["U1"]]);
    expect(set.rotation.rotationColumns).toEqual(["MR1"]);
    expect(set.rotation.rotationMatrix).toEqual([[1]]);
    assertBasis(set);
  });

  it("retains the full mean basis near coordinate axes without duplicating mean variance", () => {
    for (const epsilon of [0, 1e-16, 1e-12, 1e-8, 1e-6]) {
      for (let axis = 0; axis < 3; axis += 1) {
        const weights = [0, 0, 0];
        weights[axis] = 1;
        weights[(axis + 1) % 3] = epsilon;
        for (const groups of [[["U0"], ["U1"]], [["U1"], ["U0"]]] as Groups[]) {
          const set = buildSenaDeterministicEnaSet(edgeOptions([weights, [0, 0, 0]], false), groups);
          assertBasis(set);
          expect(Math.abs(set.variance.MR1 - 1)).toBeLessThan(1e-12);
          expect(set.variance.SVD2 + set.variance.SVD3).toBeLessThan(1e-24);
          const first = Number(set.points[0].MR1) - Number(set.points[1].MR1);
          expect(first * (groups[0][0] === "U0" ? 1 : -1)).toBeGreaterThan(0);
        }
      }
    }
    for (const epsilon of [1e-7, 1e-6]) {
      const set = buildSenaDeterministicEnaSet(edgeOptions([[epsilon, 1, 0], [0, 1, 0]]), [["U0"], ["U1"]]);
      assertBasis(set);
      expect(Math.abs(set.variance.MR1 - 1)).toBeLessThan(1e-12);
    }
  });

  it("uses the public shared-space projection and keeps adjacency rejection", () => {
    for (const groups of [undefined, realGroups]) {
      const basis = buildSenaDeterministicEnaSet(realOptions, groups);
      const data = accumulateData({ ...realOptions, unitsUsed: ["T1", "T4", "T5"] });
      const shared = projectIn(data, basis);
      expect(shared.rotation.rotationMatrix).toEqual(basis.rotation.rotationMatrix);
      expect(shared.rotation.nodes).toEqual(basis.rotation.nodes);
      expect(shared.rotation.centerVector).toEqual(basis.rotation.centerVector);
      expect(() => projectIn(accumulateData({ ...realOptions, codes: [...realOptions.codes].reverse() }), basis)).toThrow(/identical adjacency/);
    }
  });

  it("replaces Fisher intervals using the pinned default 95% quantile and preserves the two correlations", () => {
    const set = buildSenaDeterministicEnaSet(realOptions);
    const native = enaCorrelations(set);
    const fixed = senaDeterministicEnaCorrelations(set);
    const pairCount = set.points.length * (set.points.length - 1) / 2;
    fixed.forEach((row, i) => {
      expect(row.dimension).toBe(native[i].dimension);
      expect(row.pearson).toBe(native[i].pearson);
      expect(row.spearman).toBe(native[i].spearman);
      const z = senaDeterministicAtanh(Math.max(-0.999999999999, Math.min(0.999999999999, row.pearson)));
      const margin = 1 / Math.sqrt(pairCount - 3) * inverseNormal((1 + 0.95) / 2);
      expect(row.pearsonLower).toBe(senaDeterministicTanh(z - margin));
      expect(row.pearsonUpper).toBe(senaDeterministicTanh(z + margin));
    });
    for (const n of [1, 2, 3]) {
      const small = { ...set, points: set.points.slice(0, n), centroids: set.centroids?.slice(0, n) };
      senaDeterministicEnaCorrelations(small).forEach((row) => {
        expect(row.pearsonLower).toBeNaN(); expect(row.pearsonUpper).toBeNaN();
      });
    }
    const constant = { ...set, centroids: set.centroids?.map((row) => ({ ...row, SVD1: 0, SVD2: 0 })) };
    senaDeterministicEnaCorrelations(constant).forEach((row) => {
      expect(row.pearson).toBeNaN(); expect(row.pearsonLower).toBeNaN(); expect(row.pearsonUpper).toBeNaN();
    });
    const perfect = { ...set, centroids: set.points };
    senaDeterministicEnaCorrelations(perfect).forEach((row) => {
      expect(row.pearson).toBe(1); expect(row.pearsonLower).toBeLessThan(1); expect(row.pearsonUpper).toBeLessThanOrEqual(1);
    });
    const opposite = { ...set, centroids: set.points.map((row) => ({ ...row, SVD1: -Number(row.SVD1), SVD2: -Number(row.SVD2) })) };
    senaDeterministicEnaCorrelations(opposite).forEach((row) => {
      expect(row.pearson).toBe(-1); expect(row.pearsonLower).toBeGreaterThanOrEqual(-1); expect(row.pearsonUpper).toBeGreaterThan(-1);
    });
  });

  it("checks both fixed Fisher bounds on every synthetic configuration", () => {
    // Node can coincide with the fixed primitives. The browser replay tests
    // detect native interval leakage independently (including shared spaces).
    for (const { options, groups } of cases) {
      const set = buildSenaDeterministicEnaSet(options, groups);
      const native = enaCorrelations(set);
      const actual = senaDeterministicEnaCorrelations(set);
      const n = set.points.length * (set.points.length - 1) / 2;
      native.forEach((row, i) => {
        const z = senaDeterministicAtanh(Math.max(-0.999999999999, Math.min(0.999999999999, row.pearson)));
        const margin = 1 / Math.sqrt(n - 3) * inverseNormal((1 + 0.95) / 2);
        const lower = senaDeterministicTanh(z - margin);
        const upper = senaDeterministicTanh(z + margin);
        expect(actual[i].pearsonLower).toBe(lower);
        expect(actual[i].pearsonUpper).toBe(upper);
      });
    }
  });

  it("matches the independent rENA sample fixture, with its explicitly conditional 2D variance", () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "lib/ena/__fixtures__/r-ena-sample-parity.json"), "utf8")) as {
      points: Row[]; nodes: Row[]; variance: Record<string, number>; lineWeights: Row[]; connectionCounts: Row[];
    };
    // The generator explicitly divides eigenvalues[1:2] by their sum. The
    // adapter keeps native full-axis variance; compare the conditional ratio
    // only here, without mutating either result or the frozen R fixture.
    for (const set of [ena(realOptions), buildSenaDeterministicEnaSet(realOptions)]) {
      for (const field of ["connectionCounts", "lineWeights"] as const) {
        for (const expected of fixture[field]) {
          const actual = set[field].find((row) => row.participant === expected.participant)!;
          expect(actual).toBeDefined();
          for (const key of Object.keys(expected).filter((key) => key !== "participant")) {
            const error = Math.abs(Number(actual[key]) - Number(expected[key]));
            expect(error).toBeLessThanOrEqual(field === "connectionCounts" ? 0 : 1e-12);
          }
        }
      }
      for (const name of ["SVD1", "SVD2"]) {
        const sign = fixture.points.reduce((sum, row) => sum + Number(row[name]) * Number(set.points.find((point) => point.participant === row.participant)?.[name]), 0) < 0 ? -1 : 1;
        for (const [expectedRows, actualRows, id] of [[fixture.points, set.points, "participant"], [fixture.nodes, set.rotation.nodes ?? [], "code"]] as const) {
          for (const expected of expectedRows) {
            const actual = actualRows.find((row) => row[id] === expected[id])!;
            expect(Math.abs(Number(actual[name]) * sign - Number(expected[name]))).toBeLessThan(5e-7);
          }
        }
        expect(Math.abs(set.variance[name] / (set.variance.SVD1 + set.variance.SVD2) - fixture.variance[name])).toBeLessThan(1e-10);
      }
    }
  });
});

describe("exact complete ENASet and correlation replay across browser engines", () => {
  let browserBundle: string;
  const replayCases: Case[] = [...cases, { label: "real SVD", options: realOptions }, { label: "real mean", options: realOptions, groups: realGroups },
    { label: "repeated eigenvalues", options: edgeOptions([[1, 0, 0], [0, 1, 0], [0, 0, 1]]) },
    { label: "zero Gram", options: edgeOptions([[1, 0, 0], [1, 0, 0]]) },
    { label: "tiny Gram", options: edgeOptions([[1, 1e-8, 0], [1, 0, 1e-8], [1, 2e-8, 3e-8]]) },
    { label: "zero row", options: edgeOptions([[1, 0, 0], [0, 0, 0], [0, 1, 0]]) },
    ...[1e-8, 1e-6].flatMap((epsilon) => [0, 1, 2].flatMap((axis) => {
      const weights = [0, 0, 0]; weights[axis] = 1; weights[(axis + 1) % 3] = epsilon;
      return [[["U0"], ["U1"]], [["U1"], ["U0"]]].map((groups, direction) => ({
        label: `near-axis ${axis}/${epsilon}/${direction}`, options: edgeOptions([weights, [0, 0, 0]], false), groups: groups as Groups,
      }));
    })),
    { label: "near-axis nonzero rows", options: edgeOptions([[1e-6, 1, 0], [0, 1, 0]]), groups: [["U0"], ["U1"]] },
  ];
  beforeAll(async () => {
    const entry = resolve(process.cwd(), "__deterministic_ena_memory_entry__.ts");
    const bundle = await rolldown({ input: entry, platform: "browser", plugins: [{
      name: "deterministic-ena-memory-entry",
      resolveId(id) { if (id === entry) return entry; },
      load(id) { if (id === entry) return `export * from './lib/sena/deterministic-ena'; export {accumulateData, projectIn} from 'jena-js'; export const exact = ${exact.toString()};`; },
    }] });
    try {
      const generated = await bundle.generate({ format: "iife", name: "SenaEna" });
      expect(generated.output).toHaveLength(1);
      const chunk = generated.output[0];
      if (chunk.type !== "chunk") throw new Error("Expected one in-memory browser bundle");
      browserBundle = chunk.code;
    } finally { await bundle.close(); }
  });
  for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
    it(`${engine}: bit-identical complete SVD, mean, degenerate and shared-space results`, async () => {
      const expected = replayCases.map(({ options, groups }) => {
        const set = buildSenaDeterministicEnaSet(options, groups);
        const shared = projectIn(accumulateData({ ...options, unitsUsed: set.unitLabels.slice(0, 3) }), set);
        return exact({ set, correlations: senaDeterministicEnaCorrelations(set), shared, sharedCorrelations: senaDeterministicEnaCorrelations(shared) });
      });
      const browser = await browserType.launch({ headless: true });
      try {
        const context = await browser.newContext();
        await context.route("**/*", (route) => route.abort("blockedbyclient"));
        const page = await context.newPage();
        await page.addScriptTag({ content: browserBundle });
        const actual = await page.evaluate((configs) => {
          const runtime = (globalThis as unknown as { SenaEna: {
            buildSenaDeterministicEnaSet: typeof buildSenaDeterministicEnaSet;
            senaDeterministicEnaCorrelations: typeof senaDeterministicEnaCorrelations;
            accumulateData: typeof accumulateData; projectIn: typeof projectIn; exact: typeof exact;
          } }).SenaEna;
          return configs.map(({ options, groups }) => {
            const run = () => {
              const set = runtime.buildSenaDeterministicEnaSet(options, groups);
              const shared = runtime.projectIn(runtime.accumulateData({ ...options, unitsUsed: set.unitLabels.slice(0, 3) }), set);
              return runtime.exact({ set, correlations: runtime.senaDeterministicEnaCorrelations(set), shared, sharedCorrelations: runtime.senaDeterministicEnaCorrelations(shared) });
            };
            const cold = run();
            return { cold, repeatIdentical: cold === run() };
          });
        }, replayCases);
        actual.forEach((result, i) => {
          expect(result.repeatIdentical, replayCases[i].label).toBe(true);
          // Boolean assertion avoids persisting the complete data payload on failure.
          expect(result.cold === expected[i], `${engine}: ${replayCases[i].label}`).toBe(true);
        });
      } finally { await browser.close(); }
    }, 60_000);
  }
});
