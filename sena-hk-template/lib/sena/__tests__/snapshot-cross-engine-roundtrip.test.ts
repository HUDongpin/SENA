import { beforeAll, describe, expect, it } from "vitest";
import { rolldown } from "rolldown";
import { chromium, firefox, webkit } from "playwright";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";

type Scope = "full" | "first-stage";
const generatedAt = "2026-09-05T00:00:00.000Z";
const buildOptions = {
  numericalRuntime: "sena-deterministic-v1",
  alpha: 1, beta: 1, gamma: 1, normalization: "max",
  temporal: { mode: "stage", movingWindowSize: 3, movingWindowStep: 1, turnWindowRadius: 1 }
} as const;

function nodeSnapshot(scope: Scope, normalization: "max" | "log1p-max" = "max", native = false) {
  const dataset = structuredClone(lessonStudySenaContract);
  const options = { ...buildOptions, normalization, ...(native ? { numericalRuntime: undefined } : {}) };
  const fullModel = buildSenaModel(dataset, options);
  const activeTemporalWindow = scope === "first-stage" ? fullModel.temporal.windows[0] : null;
  const model = activeTemporalWindow
    ? buildSenaModel(scopeSenaDatasetToWindow(dataset, activeTemporalWindow), options)
    : fullModel;
  return buildSenaProjectSnapshot(model, { generatedAt, sourceDataset: dataset, activeTemporalWindow });
}

describe("snapshot cross-engine roundtrip", () => {
  let browserBundle: string;

  beforeAll(async () => {
    // Generate from real repository sources in memory. No fixture snapshots,
    // application server, browser trace, build output, or network are needed.
    const entry = resolve(process.cwd(), "__snapshot_roundtrip_memory_entry__.ts");
    const source = `
      import { buildSenaModel, scopeSenaDatasetToWindow } from './lib/sena/model';
      import { lessonStudySenaContract } from './lib/sena/pilot-assets';
      import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from './lib/sena/snapshot';
      export function build(scope, normalization, native = false) {
        const dataset = structuredClone(lessonStudySenaContract);
        const options = ${JSON.stringify(buildOptions)};
        options.normalization = normalization;
        if (native) delete options.numericalRuntime;
        const fullModel = buildSenaModel(dataset, options);
        const activeTemporalWindow = scope === 'first-stage' ? fullModel.temporal.windows[0] : null;
        const model = activeTemporalWindow
          ? buildSenaModel(scopeSenaDatasetToWindow(dataset, activeTemporalWindow), options) : fullModel;
        return JSON.stringify(buildSenaProjectSnapshot(model, {
          generatedAt: ${JSON.stringify(generatedAt)}, sourceDataset: dataset, activeTemporalWindow
        }));
      }
      export function accepts(text) {
        try { importSenaProjectSnapshot(text); return true; } catch { return false; }
      }
    `;
    const bundle = await rolldown({
      input: entry,
      platform: "browser",
      plugins: [{
        name: "snapshot-roundtrip-memory-entry",
        resolveId(id) { if (id === entry) return entry; },
        load(id) { if (id === entry) return source; }
      }]
    });
    try {
      const generated = await bundle.generate({ format: "iife", name: "SenaSnapshotRoundtrip" });
      expect(generated.output.length).toBe(1);
      const output = generated.output[0];
      if (output.type !== "chunk") throw new Error("Expected one in-memory snapshot test chunk.");
      browserBundle = output.code;
    } finally {
      await bundle.close();
    }
  });

  // Native historical exports retain their original runtime. This characterizes
  // the known max-normalization foreign-engine limitation without upgrading them.
  for (const scope of ["full", "first-stage"] as const) {
    for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
      it(`characterizes legacy max/${scope}/${engine} canonical admission`, async () => {
        const browser = await browserType.launch({ headless: true });
        try {
          const context = await browser.newContext();
          await context.route("**/*", (route) => route.abort("blockedbyclient"));
          const page = await context.newPage();
          await page.addScriptTag({ content: browserBundle });
          const result = await page.evaluate((selectedScope) => {
            const runtime = (globalThis as unknown as { SenaSnapshotRoundtrip: {
              build(scope: string, normalization: string, native: boolean): string;
              accepts(text: string): boolean;
            } }).SenaSnapshotRoundtrip;
            const text = runtime.build(selectedScope, "max", true);
            return { text, ownAccepted: runtime.accepts(text), repeatIdentical: text === runtime.build(selectedScope, "max", true) };
          }, scope);
          expect(result.ownAccepted).toBe(true);
          expect(result.repeatIdentical).toBe(true);
          expect(JSON.parse(result.text).reproducibility.buildOptions.numericalRuntime).toBeUndefined();
          if (engine === "chromium" && scope === "first-stage") {
            expect(() => importSenaProjectSnapshot(result.text)).not.toThrow();
          } else {
            expect(() => importSenaProjectSnapshot(result.text)).toThrow("SENA project snapshot persisted analysis does not match the canonical dataset and build options.");
          }
        } finally { await browser.close(); }
      });
    }
  }

  for (const normalization of ["max", "log1p-max"] as const) {
  for (const scope of ["full", "first-stage"] as const) {
    it(`retains ${normalization}/${scope} native Node self restore as a legacy control`, () => {
      expect(() => importSenaProjectSnapshot(JSON.stringify(nodeSnapshot(scope, normalization, true)))).not.toThrow();
    });
    it(`accepts the ${normalization}/${scope} Node builder's own serialized snapshot`, () => {
      expect(() => importSenaProjectSnapshot(JSON.stringify(nodeSnapshot(scope, normalization)))).not.toThrow();
    });

    for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
      it(`accepts the ${normalization}/${scope} ${engine} builder output on both restore boundaries`, async () => {
        const browser = await browserType.launch({ headless: true });
        try {
          const context = await browser.newContext();
          await context.route("**/*", (route) => route.abort("blockedbyclient"));
          const page = await context.newPage();
          await page.addScriptTag({ content: browserBundle });
          const reference = nodeSnapshot(scope, normalization);
          const result = await page.evaluate(({ selectedScope, selectedNormalization, nodeText }) => {
            const runtime = (globalThis as unknown as {
              SenaSnapshotRoundtrip: { build(scope: string, normalization: string, native?: boolean): string; accepts(text: string): boolean }
            }).SenaSnapshotRoundtrip;
            const text = runtime.build(selectedScope, selectedNormalization);
            return { text, sameEngineAccepted: runtime.accepts(text), nodeAccepted: runtime.accepts(nodeText), repeatIdentical: runtime.build(selectedScope, selectedNormalization) === text };
          }, { selectedScope: scope, selectedNormalization: normalization, nodeText: JSON.stringify(reference) });
          expect(result.sameEngineAccepted).toBe(true);
          expect(result.repeatIdentical).toBe(true);
          expect(result.nodeAccepted).toBe(true);
          expect(createHash("sha256").update(result.text).digest("hex")).toBe(createHash("sha256").update(JSON.stringify(reference)).digest("hex"));
          const source = JSON.parse(result.text);
          // These remain exact source-custody checks, independently of the
          // derived projection portability regression below.
          expect(source.dataset).toEqual(reference.dataset);
          expect(source.source.sourceDataset).toEqual(reference.source.sourceDataset);
          expect(source.reproducibility.buildOptions).toEqual(reference.reproducibility.buildOptions);
          expect(source.analysis.matrices).toEqual(reference.analysis.matrices);
          // Assert a boolean instead of printing a half-megabyte snapshot on failure.
          let accepted = true;
          try { importSenaProjectSnapshot(result.text); } catch { accepted = false; }
          expect(accepted, `${engine}/${scope}: canonical restore rejected genuine builder output`).toBe(true);
        } finally {
          await browser.close();
        }
      });
    }
  }
  }

  it("still rejects a one-representable-step change in persisted ENA coordinates", () => {
    const source = nodeSnapshot("first-stage");
    const point = source.report.enaManifest.outputs!.nodePositions[0];
    const value = point.SVD1;
    expect(typeof value).toBe("number");
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
      throw new Error("Expected a finite nonzero synthetic node coordinate.");
    }
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, value);
    bits.setBigUint64(0, bits.getBigUint64(0) + BigInt(1));
    point.SVD1 = bits.getFloat64(0);
    expect(point.SVD1).not.toBe(value);
    expect(() => importSenaProjectSnapshot(JSON.stringify(source))).toThrow(/persisted analysis/);
  });
});
