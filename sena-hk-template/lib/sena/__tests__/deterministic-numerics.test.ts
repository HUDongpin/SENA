import { beforeAll, describe, expect, it } from "vitest";
import { rolldown } from "rolldown";
import { chromium, firefox, webkit } from "playwright";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as numerics from "../deterministic-numerics";

const functions = {
  Log: numerics.senaDeterministicLog,
  Log1p: numerics.senaDeterministicLog1p,
  Atanh: numerics.senaDeterministicAtanh,
  Tanh: numerics.senaDeterministicTanh,
};
type Primitive = keyof typeof functions;
// Independent oracle: CPython 3.14.6 decimal (libmpdec 4.0.1), precision 1200,
// ROUND_HALF_EVEN. Decimal.ln/exp are correctly rounded at this precision.
// d = Decimal.from_float(x), then float(d.ln()), float((1+d).ln()),
// float(((1+d)/(1-d)).ln()/2), float(((2*d).exp()-1)/((2*d).exp()+1)).
// At |x| > 100, tanh rounds to +/-1. Inputs are exact binary64 values,
// not decimal interpretations of their printed spellings. No host Math oracle.
// ULP bounds below concern primitive accuracy ONLY, never snapshot admission.
const vectors: Record<Primitive, readonly (readonly [number, number])[]> = {
  Log: [
    [5e-324, -744.4400719213812], [2.225073858507201e-308, -708.3964185322641],
    [2.2250738585072014e-308, -708.3964185322641], [1e-200, -460.51701859880916],
    [1e-20, -46.051701859880914], [5.551115123125783e-17, -37.42994775023705],
    [1e-9, -20.72326583694641], [3.725290298461914e-9, -19.408121055678468],
    [0.1, -2.3025850929940455], [0.2928932188134525, -1.2279471772995156],
    [0.34657359027997264, -1.0596601011416096], [0.41421356237309503, -0.881373587019543],
    [0.49999999999999994, -0.6931471805599454], [0.5, -0.6931471805599453],
    [0.9999999999999999, -1.1102230246251565e-16], [1, 0],
    [1.0000000000000002, 2.2204460492503128e-16], [2, 0.6931471805599453],
    [10, 2.302585092994046], [22, 3.091042453358316],
    [1e100, 230.25850929940458], [Number.MAX_VALUE, 709.782712893384],
  ],
  Log1p: [
    [-0.9999999999999999, -36.7368005696771], [-0.5, -0.6931471805599453],
    [-0.49999999999999994, -0.6931471805599452], [-0.41421356237309503, -0.5347999967395703],
    [-0.34657359027997264, -0.4255253617155107], [-0.2928932188134525, -0.34657359027997264],
    [-0.1, -0.10536051565782631], [-3.725290298461914e-9, -3.725290305400808e-9],
    [-1e-9, -1.0000000005000001e-9], [-5.551115123125783e-17, -5.551115123125783e-17],
    [-1e-200, -1e-200], [-5e-324, -5e-324], [5e-324, 5e-324],
    [2.225073858507201e-308, 2.225073858507201e-308],
    [2.2250738585072014e-308, 2.2250738585072014e-308], [1e-200, 1e-200], [1e-20, 1e-20],
    [5.551115123125783e-17, 5.551115123125783e-17], [1e-9, 9.999999995e-10],
    [3.725290298461914e-9, 3.72529029152302e-9], [0.1, 0.09531017980432487],
    [0.2928932188134525, 0.2568825123218147], [0.34657359027997264, 0.29756328478758615],
    [0.41421356237309503, 0.34657359027997264], [0.49999999999999994, 0.40546510810816433],
    [0.5, 0.4054651081081644], [0.9999999999999999, 0.6931471805599453],
    [1.0000000000000002, 0.6931471805599454], [2, 1.0986122886681098], [10, 2.3978952727983707],
    [22, 3.1354942159291497], [1e100, 230.25850929940458], [Number.MAX_VALUE, 709.782712893384],
  ],
  Atanh: [
    [5e-324, 5e-324], [2.225073858507201e-308, 2.225073858507201e-308],
    [2.2250738585072014e-308, 2.2250738585072014e-308], [1e-200, 1e-200], [1e-20, 1e-20],
    [5.551115123125783e-17, 5.551115123125783e-17], [1e-9, 1e-9],
    [3.725290298461914e-9, 3.725290298461914e-9], [0.1, 0.10033534773107558],
    [0.2928932188134525, 0.3017280513008937], [0.34657359027997264, 0.3615443232515484],
    [0.41421356237309503, 0.44068679350977147], [0.49999999999999994, 0.5493061443340548],
    [0.5, 0.5493061443340549], [0.9999999999999999, 18.714973875118524],
  ],
  Tanh: [
    [5e-324, 5e-324], [2.225073858507201e-308, 2.225073858507201e-308],
    [2.2250738585072014e-308, 2.2250738585072014e-308], [1e-200, 1e-200], [1e-20, 1e-20],
    [5.551115123125783e-17, 5.551115123125783e-17], [1e-9, 1e-9],
    [3.725290298461914e-9, 3.725290298461914e-9], [0.1, 0.09966799462495582],
    [0.2928932188134525, 0.28479555178735644], [0.34657359027997264, 0.3333333333333333],
    [0.41421356237309503, 0.39204450189153184], [0.49999999999999994, 0.46211715726000974],
    [0.5, 0.46211715726000974], [0.9999999999999999, 0.7615941559557649],
    [1.0000000000000002, 0.761594155955765], [2, 0.9640275800758169],
    [10, 0.9999999958776927], [21.999999999999996, 1], [22, 1], [1e100, 1], [Number.MAX_VALUE, 1],
  ],
};

function bits(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x, false);
  return view.getBigUint64(0, false).toString(16).padStart(16, "0");
}

function ulps(actual: number, expected: number): bigint {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.sign(actual)).toBe(Math.sign(expected));
  const difference = BigInt(`0x${bits(actual)}`) - BigInt(`0x${bits(expected)}`);
  return difference < BigInt(0) ? -difference : difference;
}

describe("fixed deterministic numerical primitives", () => {
  for (const name of Object.keys(functions) as Primitive[]) {
    it(`${name} preserves its IEEE special values and domain`, () => {
      const fn = functions[name];
      expect(fn(NaN)).toBeNaN();
      if (name === "Log") {
        expect(fn(0)).toBe(-Infinity); expect(fn(-0)).toBe(-Infinity);
        expect(fn(-5e-324)).toBeNaN(); expect(fn(-Infinity)).toBeNaN();
        expect(fn(Infinity)).toBe(Infinity);
      } else {
        expect(Object.is(fn(0), 0)).toBe(true); expect(Object.is(fn(-0), -0)).toBe(true);
        if (name === "Log1p") {
          expect(fn(-1)).toBe(-Infinity); expect(fn(-1.0000000000000002)).toBeNaN();
          expect(fn(-Infinity)).toBeNaN(); expect(fn(Infinity)).toBe(Infinity);
        } else if (name === "Atanh") {
          expect(fn(-1)).toBe(-Infinity); expect(fn(1)).toBe(Infinity);
          for (const x of [-Infinity, Infinity, -1.0000000000000002, 1.0000000000000002]) expect(fn(x)).toBeNaN();
        } else {
          expect(fn(-Infinity)).toBe(-1); expect(fn(Infinity)).toBe(1);
        }
      }
    });
    it(`${name} agrees with the independent high precision oracle within two ULP`, () => {
      for (const [x, expected] of vectors[name]) {
        expect(ulps(functions[name](x), expected), `${name}(${x})`).toBeLessThanOrEqual(BigInt(2));
        if (name === "Atanh" || name === "Tanh") {
          expect(ulps(functions[name](-x), -expected), `${name}(${-x})`).toBeLessThanOrEqual(BigInt(2));
        }
      }
    });
  }

  it("has no native transcendental fallback or environment selection", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/sena/deterministic-numerics.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(source).not.toMatch(/Math\.(?:log|log1p|atanh|tanh|exp|expm1|pow)\b|\*\*|process\.|navigator\./);
    expect(source).not.toMatch(/\b(?:import|require)\s*\(?/);
  });

  let browserBundle: string;
  beforeAll(async () => {
    const entry = resolve(process.cwd(), "__deterministic_numerics_memory_entry__.ts");
    const bundle = await rolldown({ input: entry, platform: "browser", plugins: [{
      name: "deterministic-numerics-memory-entry",
      resolveId(id) { if (id === entry) return entry; },
      load(id) { if (id === entry) return `export * from './lib/sena/deterministic-numerics';`; },
    }] });
    try {
      const generated = await bundle.generate({ format: "iife", name: "SenaNumerics" });
      expect(generated.output.length).toBe(1);
      const chunk = generated.output[0];
      if (chunk.type !== "chunk") throw new Error("Expected one in-memory numerical bundle");
      browserBundle = chunk.code;
    } finally { await bundle.close(); }
  });

  for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
    it(`${engine} is bit-identical to Node, including signed zero and canonical NaN`, async () => {
      const inputs = [NaN, Infinity, -Infinity, -0, 0, -1, 1, ...Object.values(vectors).flatMap((rows) => rows.flatMap(([x]) => [x, -x]))];
      // Deterministic bit patterns sample across the exponent range and both signs,
      // payload NaNs and subnormals; dense finite inputs exercise reduction.
      const view = new DataView(new ArrayBuffer(8));
      let seed = 0x13579bdf;
      for (let i = 0; i < 4096; i += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        view.setUint32(0, seed, false); view.setUint32(4, (seed ^ 0xa5a5a5a5) >>> 0, false);
        inputs.push(view.getFloat64(0, false), (i - 2048) / 2048, (i - 2048) / 64);
      }
      const encodedInputs = inputs.map(bits);
      const expected = inputs.flatMap((x) => Object.values(functions).map((fn) => bits(fn(x))));
      const browser = await browserType.launch({ headless: true });
      try {
        const context = await browser.newContext();
        await context.route("**/*", (route) => route.abort("blockedbyclient"));
        const page = await context.newPage();
        await page.addScriptTag({ content: browserBundle });
        const actual = await page.evaluate((encoded) => {
          const runtime = (globalThis as unknown as { SenaNumerics: typeof numerics }).SenaNumerics;
          const fns = [runtime.senaDeterministicLog, runtime.senaDeterministicLog1p, runtime.senaDeterministicAtanh, runtime.senaDeterministicTanh];
          const data = new DataView(new ArrayBuffer(8));
          const run = () => encoded.flatMap((hex) => {
            data.setBigUint64(0, BigInt(`0x${hex}`), false);
            const x = data.getFloat64(0, false);
            return fns.map((fn) => { data.setFloat64(0, fn(x), false); return data.getBigUint64(0, false).toString(16).padStart(16, "0"); });
          });
          const cold = run();
          const warm = run();
          return { cold, repeatIdentical: cold.every((value, index) => value === warm[index]) };
        }, encodedInputs);
        expect(actual.repeatIdentical).toBe(true);
        const mismatch = actual.cold.findIndex((value, index) => value !== expected[index]);
        expect(mismatch, `${engine}: first mismatch index ${mismatch}`).toBe(-1);
      } finally { await browser.close(); }
    }, 30_000);
  }
});
