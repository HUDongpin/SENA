import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useProjectSnapshotRestoreAction, type ProjectSnapshotRestoreActionOptions } from "../../../components/sena/workspace/use-project-snapshot-restore-action";
import { useEnterpriseImportActions, type EnterpriseImportActionsOptions } from "../../../components/sena/workspace/use-enterprise-import-actions";
import { importEnterpriseFilesAction } from "../../../components/sena/workspace/enterprise-actions";
import { POST as restoreSnapshotRoute } from "../../../app/api/sena/snapshot/restore/route";
import { resolve } from "node:path";
import { rolldown } from "rolldown";
import { chromium, firefox, webkit } from "playwright";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";
import { buildSenaReport, buildSenaEvidenceLedger, buildSenaEnaReportArtifact, buildSenaMetricProvenanceArtifact } from "../report";
import { buildSenaTemporalRuntimeTrace } from "../temporal-runtime";
import { buildSenaMethodProtocol } from "../method-protocol";
import { buildSenaPublicationFigure } from "../publication-figure";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";
import { buildSenaAnalysisConfigHash } from "../data-contract-audit";
import { buildSenaGroupComparison, createSenaGroupComparisonCarrierBudget, isSenaGroupComparisonValidationCarrierAdmitted, assertSenaGroupComparisonValidationResultMatchesSource } from "../inference";
import { assertSenaImportControlContracts } from "../enterprise/heavy-request-admission";
import { buildSenaEnaManifest, senaEnaRotationReference, type SenaEnaManifestOverrides, type SenaEnaRotationReference } from "../ena-manifest";
import { lessonStudySenaContract } from "../pilot-assets";
import * as runtimeConstants from "../runtime-constants";
import { senaRuntimeProvenance } from "../runtime-constants";
import { normalizeSenaMatrix } from "../operators";
import { SenaInputValidationError, validateSenaAnalyticalInputs } from "../analytical-input-validation";
import { senaDeterministicLog, senaDeterministicLog1p } from "../deterministic-numerics";
import { buildSenaDeterministicEnaSet, senaDeterministicEnaCorrelations } from "../deterministic-ena";
import type { ENAOptions } from "jena-js";
import type { SenaBuildOptions, SenaDataset, SenaNormalization } from "../types";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const numericalRuntime = "sena-deterministic-v1" as const;
const dataset = lessonStudySenaContract;
const empty = { ...dataset, coded_segments: [] };
const oneCode = { ...dataset, codebook: dataset.codebook.slice(0, 1) };
const twoGroups = { ...dataset, people: dataset.people.map((person, index) => ({ ...person, group: index < 2 ? "A" : "B" })) };
const rules: SenaNormalization[] = ["max", "frobenius", "none", "log1p-max", "log-max"];

const snapshotTime = "2026-09-05T00:00:00.000Z";
function profileSnapshot(normalization: "max" | "log1p-max", scoped: boolean, fixed = true) {
  const sourceDataset = structuredClone(dataset);
  const options = { alpha: 1, beta: 1, gamma: 1, normalization,
    temporal: { mode: "stage" as const, movingWindowSize: 3, movingWindowStep: 1, turnWindowRadius: 1 },
    ...(fixed ? { numericalRuntime } : {}) };
  const full = buildSenaModel(sourceDataset, options);
  const activeTemporalWindow = scoped ? full.temporal.windows[0] : null;
  const model = activeTemporalWindow ? buildSenaModel(scopeSenaDatasetToWindow(sourceDataset, activeTemporalWindow), options) : full;
  return buildSenaProjectSnapshot(model, { generatedAt: snapshotTime, sourceDataset, activeTemporalWindow });
}

describe("workspace numerical profile custody", () => {
  it.each([true, false])("hydrates the stored profile including explicit legacy absence (fixed=%s)", async (fixed) => {
    const snapshot = profileSnapshot("max", false, fixed);
    const profileWrites: unknown[] = [];
    const datasetWrites: unknown[] = [];
    const setters = new Proxy({}, { get: (_target, key) => key === "setNumericalRuntime"
      ? (value: unknown) => profileWrites.push(value)
      : key === "setDataset" ? (value: unknown) => datasetWrites.push(value) : () => undefined
    }) as ProjectSnapshotRestoreActionOptions;
    let actions: ReturnType<typeof useProjectSnapshotRestoreAction> | undefined;
    function Harness() { actions = useProjectSnapshotRestoreAction(setters); return null; }
    renderToStaticMarkup(createElement(Harness));
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      restoreSnapshotRoute(new Request(new URL(String(input), "http://localhost"), init)));
    try { await actions!.restoreProjectSnapshot(snapshot, "stored.json"); }
    finally { vi.unstubAllGlobals(); }
    expect(profileWrites).toEqual([fixed ? numericalRuntime : undefined]);
    expect(datasetWrites).toEqual([snapshot.source.sourceDataset]);
  });

  it.each([true, false])("transports optional buildOptions without changing the legacy request (provided=%s)", async (provided) => {
    let form: FormData | undefined;
    let headers: Headers | undefined;
    const input = { files: [new File(["synthetic"], "input.txt")], title: "Synthetic", description: "Synthetic import", createProject: true,
      ...(provided ? { buildOptions: { numericalRuntime } } : {}) };
    await importEnterpriseFilesAction(input, {
      csrfHeaders: async () => ({ "x-csrf-token": "synthetic-csrf" }),
      fetchImpl: async (_input, init) => {
        form = init?.body as FormData;
        headers = new Headers(init?.headers);
        return Response.json({});
      }
    });
    expect(headers!.get("x-csrf-token")).toBe("synthetic-csrf");
    expect(form!.get("action")).toBe("create-project");
    expect(form!.get("buildOptions")).toBe(provided ? JSON.stringify({ numericalRuntime }) : null);
    expect([...form!.keys()]).toEqual(provided
      ? ["files", "action", "buildOptions", "title", "description"]
      : ["files", "action", "title", "description"]);
  });

  it("the real signed-in raw import requests the explicit profile before restoring server output", async () => {
    const snapshot = profileSnapshot("max", false, false);
    let form: FormData | undefined;
    let restored: unknown;
    let warningUpdate: unknown;
    const options = new Proxy({
      enterpriseUserPresent: true, activeEnterpriseTeamId: "synthetic-team",
      enterpriseCsrfHeaders: async () => ({}),
      restoreProjectSnapshot: (value: unknown) => { restored = value; },
      setDataset: (value: unknown) => { warningUpdate = value; },
    }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => undefined }) as unknown as EnterpriseImportActionsOptions;
    let actions: ReturnType<typeof useEnterpriseImportActions> | undefined;
    function Harness() { actions = useEnterpriseImportActions(options); return null; }
    renderToStaticMarkup(createElement(Harness));
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      form = init?.body as FormData;
      return Response.json({ dataset: snapshot.dataset, warnings: ["Synthetic warning"], persistedProject: { id: "synthetic-project", title: "Synthetic", snapshot } });
    });
    try { await actions!.importFilesViaEnterpriseApi([new File(["synthetic"], "input.txt")]); }
    finally { vi.unstubAllGlobals(); }
    expect(form!.get("buildOptions")).toBe(JSON.stringify({ numericalRuntime }));
    expect(restored).toEqual(snapshot);
    expect(typeof warningUpdate).toBe("function");
    expect((warningUpdate as (value: SenaDataset) => SenaDataset)(snapshot.dataset).warnings).toContain("Synthetic warning");
    expect(snapshot.reproducibility.buildOptions.numericalRuntime).toBeUndefined();
  });
});

describe("numerical profile downstream artifacts", () => {
  const frozen = [
    ["max", false, "37746c7d729459a9304099d2cbf98c45eb609d17bdc23eb810ff141505341e31"],
    ["max", true, "0ea6eece2773738301163bdac3d4147c7d4c1324cbfd6b006b72ac3dd5d49a99"],
    ["log1p-max", false, "b5a136b31cda0be358f6e46ce0db337eaf23a06249bf3e57e5e083c378ef1017"],
    ["log1p-max", true, "f166ec1359767bcef69b4f666f9538ac8981ba78a5c86efcb91fd913d049b9cc"],
  ] as const;
  for (const [normalization, scoped, hash] of frozen) {
    it(`retains native snapshot bytes and canonical restore ${normalization}/${scoped}`, () => {
      const snapshot = profileSnapshot(normalization, scoped, false);
      expect(digest(snapshot)).toBe(hash);
      expect(() => importSenaProjectSnapshot(JSON.stringify(snapshot))).not.toThrow();
    });
    it(`roundtrips explicit snapshots ${normalization}/${scoped}`, () => {
      const snapshot = profileSnapshot(normalization, scoped);
      expect(snapshot.report.enaManifest.options?.numericalRuntime).toBe(numericalRuntime);
      expect(snapshot.report.runtimeProvenance.numericalRuntime).toBe(numericalRuntime);
      expect(() => importSenaProjectSnapshot(JSON.stringify(snapshot))).not.toThrow();
    });
  }
  it("propagates the profile through reports, temporal manifests and method artifacts", () => {
    const model = buildSenaModel(dataset, { numericalRuntime, temporal: { mode: "stage" } });
    const report = buildSenaReport(model, { generatedAt: snapshotTime });
    const expected = runtimeConstants.senaRuntimeProvenanceFor(numericalRuntime);
    expect(report.runtimeProvenance).toEqual(expected);
    expect(buildSenaEvidenceLedger(model).runtimeProvenance).toEqual(expected);
    for (const check of [report.validation.sensitivity.layerWeights, report.validation.sensitivity.normalization]) {
      for (const variant of check.variants) expect(variant.buildOptions.numericalRuntime).toBe(numericalRuntime);
    }
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-api-surface")?.status).toBe("pass");
    expect(buildSenaEnaReportArtifact(model).runtimeProvenance).toEqual(expected.enaRuntime);
    expect(buildSenaMetricProvenanceArtifact(model).runtimeProvenance).toEqual(expected);
    const metric = report.validation.metricProvenance.find((row) => row.id === "jena-connection-counts")!;
    expect(metric.implementation).not.toContain("ena()");
    expect(metric.parityStatus).toContain("conditional 2D");
    const trace = buildSenaTemporalRuntimeTrace(dataset, {}, { timelineModel: model });
    expect(trace.runtimeProvenance).toEqual(expected);
    for (const entry of trace.windows) {
      const manifest = buildSenaEnaManifest(scopeSenaDatasetToWindow(dataset, entry.window), { numericalRuntime });
      expect(entry.ena.variance).toEqual(manifest.outputs?.variance ?? {});
    }
    expect(buildSenaMethodProtocol(model).runtimeIntegration.jena).toEqual(expected.enaRuntime);
    expect(digest(buildSenaPublicationFigure(model))).toBe(digest(buildSenaPublicationFigure(model, { manifest: buildSenaEnaManifest(dataset, { numericalRuntime }) })));
  });
  it("rejects mismatched and unknown explicit figure manifests before skipped projections", () => {
    for (const source of [dataset, empty]) {
      const model = buildSenaModel(source, { numericalRuntime });
      expect(() => buildSenaPublicationFigure(model, { manifest: buildSenaEnaManifest(source) })).toThrow(/numericalRuntime/);
      const bad = buildSenaEnaManifest(source, { numericalRuntime });
      bad.options = { ...bad.options, numericalRuntime: "unknown" } as unknown as typeof bad.options;
      expect(() => buildSenaPublicationFigure(model, { manifest: bad })).toThrow(/numericalRuntime/);
    }
  });
  it("propagates profile into development and review packet admission", () => {
    const packet = buildSenaReviewPacket(buildSenaModel(dataset, { numericalRuntime }), { generatedAt: snapshotTime });
    expect(packet.contents.developmentPlan.runtimeIntegration.jena).toEqual(runtimeConstants.senaRuntimeProvenanceFor(numericalRuntime).enaRuntime);
    expect(() => importSenaReviewPacket(JSON.stringify(packet))).not.toThrow();
  });
  it("retains the profile in source admission, replay and distinct configuration hashes", () => {
    const fixed = buildSenaModel(twoGroups, { numericalRuntime });
    const native = buildSenaModel(twoGroups);
    expect(buildSenaAnalysisConfigHash(fixed.options)).not.toBe(buildSenaAnalysisConfigHash(native.options));
    expect(() => assertSenaImportControlContracts({ buildOptions: { numericalRuntime } })).not.toThrow();
    const comparison = buildSenaGroupComparison({ dataset: twoGroups, buildOptions: { numericalRuntime }, groupA: "A", groupB: "B", iterations: 100, bootstrapIterations: 100 });
    expect(comparison.sourceEvidence!.analysisConfig.numericalRuntime).toBe(numericalRuntime);
    expect(isSenaGroupComparisonValidationCarrierAdmitted(comparison)).toBe(true);
    expect(() => assertSenaGroupComparisonValidationResultMatchesSource(comparison, { dataset: twoGroups, buildOptions: { numericalRuntime } })).not.toThrow();
    expect(() => assertSenaGroupComparisonValidationResultMatchesSource(comparison, { dataset: twoGroups })).toThrow();
    for (const invalid of [null, "unknown", 1]) {
      expect(() => buildSenaGroupComparison({ dataset: twoGroups, buildOptions: { numericalRuntime: invalid } as unknown as SenaBuildOptions, groupA: "A", groupB: "B" })).toThrow();
      const tampered = structuredClone(comparison);
      Object.assign(tampered.sourceEvidence!.analysisConfig, { numericalRuntime: invalid });
      expect(isSenaGroupComparisonValidationCarrierAdmitted(tampered)).toBe(false);
    }
  });
  it("rejects stripped, relabeled, unknown profiles and one ULP persisted tampering", () => {
    const original = profileSnapshot("log1p-max", true);
    for (const change of [undefined, null, "unknown"]) {
      const snapshot = structuredClone(original);
      if (change === undefined) delete snapshot.reproducibility.buildOptions.numericalRuntime;
      else Object.assign(snapshot.reproducibility.buildOptions, { numericalRuntime: change });
      expect(() => importSenaProjectSnapshot(JSON.stringify(snapshot))).toThrow();
    }
    const relabeled = profileSnapshot("max", true, false);
    relabeled.reproducibility.buildOptions.numericalRuntime = numericalRuntime;
    expect(() => importSenaProjectSnapshot(JSON.stringify(relabeled))).toThrow();
    const point = original.report.enaManifest.outputs!.nodePositions[0];
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, point.SVD1 as number);
    bits.setBigUint64(0, bits.getBigUint64(0) + BigInt(1));
    point.SVD1 = bits.getFloat64(0);
    expect(() => importSenaProjectSnapshot(JSON.stringify(original))).toThrow();
  });
  it("charges the optional profile against the existing aggregate carrier text budget", () => {
    const fixed = buildSenaGroupComparison({ dataset: twoGroups, buildOptions: { numericalRuntime }, groupA: "A", groupB: "B", iterations: 100, bootstrapIterations: 100 });
    // Carrier admission is structural; source replay remains a separate exact check.
    const absent = structuredClone(fixed);
    delete absent.sourceEvidence!.analysisConfig.numericalRuntime;
    const nativeBudget = createSenaGroupComparisonCarrierBudget();
    const fixedBudget = createSenaGroupComparisonCarrierBudget();
    expect(isSenaGroupComparisonValidationCarrierAdmitted(absent, nativeBudget)).toBe(true);
    expect(isSenaGroupComparisonValidationCarrierAdmitted(fixed, fixedBudget)).toBe(true);
    expect(fixedBudget.textBytes - nativeBudget.textBytes).toBe(new TextEncoder().encode(numericalRuntime).byteLength);
    const remaining = () => ({ ...createSenaGroupComparisonCarrierBudget(), textBytes: 8 * 1024 * 1024 - nativeBudget.textBytes });
    expect(isSenaGroupComparisonValidationCarrierAdmitted(absent, remaining())).toBe(true);
    expect(isSenaGroupComparisonValidationCarrierAdmitted(fixed, remaining())).toBe(false);
  });
});

function adapterOptions(source: SenaDataset): ENAOptions {
  const people = new Map(source.people.map((person) => [person.id, person]));
  const codes = source.codebook.map((code) => code.id);
  return {
    rows: [...source.coded_segments].sort((a, b) => a.turnIndex - b.turnIndex || a.segmentId.localeCompare(b.segmentId)).map((segment) => ({
      segmentId: segment.segmentId, personId: segment.personId, unitId: segment.unitId,
      stanzaId: segment.stanzaId, stage: segment.stage, turnIndex: segment.turnIndex,
      group: people.get(segment.personId)?.group ?? "", role: people.get(segment.personId)?.role ?? "",
      ...Object.fromEntries(codes.map((code) => [code, segment.codes.includes(code) ? segment.confidence ?? 1 : 0])),
    })),
    units: ["personId"], conversation: ["unitId", "stanzaId"], codes,
    metadata: ["group", "role"], includeMeta: true, model: "EndPoint", window: "MovingStanzaWindow",
    weightBy: "binary", windowSizeBack: 2, windowSizeForward: 0, dimensions: 2, nodePositionMethod: "undirected",
  };
}

describe("legacy numerical runtime byte compatibility", () => {
  it("retains the frozen native model bytes", () => {
    expect(digest(buildSenaModel(lessonStudySenaContract))).toBe("b9c6f1a88b3c85d33e852e3922b1a17590f5d86361bc9305566988f230bcaa41");
  });
  it("retains the frozen native manifest bytes", () => {
    expect(digest(buildSenaEnaManifest(lessonStudySenaContract))).toBe("a4400723325d881fe3c4f6251245039ea7a722e8f58890e87cafdf19f143ea00");
  });
  it("retains the frozen native provenance bytes", () => {
    expect(digest(senaRuntimeProvenance)).toBe("908c4480febcd0edba7832af05a192d56e372d26abad69a57186ab1ccd65bf06");
  });
  it("treats explicit undefined as native, including skipped manifests", () => {
    expect(digest(buildSenaModel(dataset, { numericalRuntime: undefined }))).toBe(digest(buildSenaModel(dataset)));
    for (const source of [dataset, empty, oneCode]) {
      expect(digest(buildSenaEnaManifest(source, { numericalRuntime: undefined }))).toBe(digest(buildSenaEnaManifest(source)));
    }
  });
});

describe("deterministic profile exact core replay", () => {
  let browserBundle: string;
  beforeAll(async () => {
    const entry = resolve(process.cwd(), "__sena_profile_core_memory_entry__.ts");
    const bundle = await rolldown({ input: entry, platform: "browser", plugins: [{
      name: "sena-profile-core-memory-entry",
      resolveId(id) { if (id === entry) return entry; },
      load(id) { if (id === entry) return `export { buildSenaModel } from './lib/sena/model'; export { buildSenaEnaManifest, senaEnaRotationReference } from './lib/sena/ena-manifest';`; },
    }] });
    try {
      const generated = await bundle.generate({ format: "iife", name: "SenaProfileCore" });
      expect(generated.output.length).toBe(1);
      const chunk = generated.output[0];
      if (chunk.type !== "chunk") throw new Error("Expected one in-memory profile core bundle");
      browserBundle = chunk.code;
    } finally { await bundle.close(); }
  });
  for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
    it(`${engine} replays fixed model entropy, five layer normalizations and ENA SVD/mean/shared outputs exactly`, async () => {
      const expected = [
        ...rules.map((normalization) => buildSenaModel(twoGroups, { numericalRuntime, normalization })),
        ...(["svd", "mean"] as const).flatMap((rotation) => {
          const manifest = buildSenaEnaManifest(twoGroups, { numericalRuntime, rotation, emitRotation: true });
          return [manifest, buildSenaEnaManifest(twoGroups, { numericalRuntime, projectInto: senaEnaRotationReference(manifest)! })];
        }),
      ];
      const browser = await browserType.launch({ headless: true });
      try {
        const context = await browser.newContext();
        await context.route("**/*", (route) => route.abort("blockedbyclient"));
        const page = await context.newPage();
        await page.addScriptTag({ content: browserBundle });
        const actual = await page.evaluate(({ source, normalizations, profile }) => {
          const runtime = (globalThis as unknown as { SenaProfileCore: {
            buildSenaModel: typeof buildSenaModel; buildSenaEnaManifest: typeof buildSenaEnaManifest;
            senaEnaRotationReference: typeof senaEnaRotationReference;
          } }).SenaProfileCore;
          return JSON.stringify([
            ...normalizations.map((normalization) => runtime.buildSenaModel(source, { numericalRuntime: profile, normalization })),
            ...(["svd", "mean"] as const).flatMap((rotation) => {
              const manifest = runtime.buildSenaEnaManifest(source, { numericalRuntime: profile, rotation, emitRotation: true });
              return [manifest, runtime.buildSenaEnaManifest(source, { numericalRuntime: profile, projectInto: runtime.senaEnaRotationReference(manifest)! })];
            }),
          ]);
        }, { source: twoGroups, normalizations: rules, profile: numericalRuntime });
        // Report digest equality only, never a complete analytical payload.
        expect(digest(JSON.parse(actual))).toBe(digest(expected));
      } finally { await browser.close(); }
    }, 30_000);
  }
});

describe("explicit deterministic numerical profile contract", () => {
  for (const invalid of [null, "unknown-profile-private-value", 1, true, {}, []]) {
    it(`rejects invalid profile kind ${invalid === null ? "null" : typeof invalid} through structured model validation`, () => {
      const buildOptions = { numericalRuntime: invalid } as unknown as Partial<SenaBuildOptions>;
      expect(() => validateSenaAnalyticalInputs({ buildOptions })).toThrow(SenaInputValidationError);
      try { buildSenaModel(dataset, buildOptions); } catch (error) {
        expect((error as SenaInputValidationError).issues).toContainEqual({ path: "buildOptions.numericalRuntime", rule: "supported-value" });
        expect(String(error)).not.toContain("unknown-profile-private-value");
        return;
      }
      throw new Error("Invalid profile was accepted");
    });
    it(`rejects invalid profile kind ${invalid === null ? "null" : typeof invalid} before normalization early returns`, () => {
      for (const rule of rules) expect(() => normalizeSenaMatrix([], rule, invalid as typeof numericalRuntime)).toThrow(/numericalRuntime/);
    });
    it(`rejects invalid profile kind ${invalid === null ? "null" : typeof invalid} before manifest skip or catch`, () => {
      for (const source of [dataset, empty, oneCode]) {
        expect(() => buildSenaEnaManifest(source, { numericalRuntime: invalid } as unknown as SenaEnaManifestOverrides)).toThrow(/numericalRuntime/);
      }
    });
  }

  it("declares deterministic options and preserves raw model matrices and formulas", () => {
    const native = buildSenaModel(dataset);
    const fixed = buildSenaModel(dataset, { numericalRuntime });
    expect(fixed.options.numericalRuntime).toBe(numericalRuntime);
    expect(fixed.matrices).toEqual(native.matrices);
  });

  it("uses fixed log1p for both log normalization names and all five model layers", () => {
    const matrix = [[0, 0.1, 0.5], [1, 2, 22]];
    const transformed = matrix.map((row) => row.map(senaDeterministicLog1p));
    const divisor = Math.max(...transformed.flat());
    for (const rule of ["log1p-max", "log-max"] as const) {
      expect(normalizeSenaMatrix(matrix, rule, numericalRuntime).values).toEqual(transformed.map((row) => row.map((value) => value / divisor)));
      const model = buildSenaModel(dataset, { numericalRuntime, normalization: rule });
      for (const layer of ["S", "W", "B", "B_CP", "G"] as const) {
        const block = model.matrices[layer];
        expect(block.normalized).toEqual(normalizeSenaMatrix(block.raw, rule, numericalRuntime).values);
      }
    }
    for (const rule of ["max", "frobenius", "none"] as const) {
      expect(normalizeSenaMatrix(matrix, rule, numericalRuntime)).toEqual(normalizeSenaMatrix(matrix, rule));
    }
  });

  it("uses fixed natural log for person epistemic entropy", () => {
    const model = buildSenaModel(dataset, { numericalRuntime });
    model.nodes.filter((node) => node.kind === "person").forEach((node, index) => {
      const values = model.matrices.B.raw[index];
      const total = values.reduce((sum, value) => sum + value, 0);
      const expected = values.reduce((sum, value) => value <= 0 || total === 0 ? sum : sum - (value / total) * senaDeterministicLog(value / total), 0);
      expect(node.metrics.epistemicDiversity).toBe(expected);
    });
  });

  for (const rotation of ["svd", "mean"] as const) {
    it(`records deterministic ${rotation} with complete basis and adapter outputs`, () => {
      const manifest = buildSenaEnaManifest(twoGroups, { numericalRuntime, rotation, emitRotation: true });
      const groups: [string[], string[]] | undefined = rotation === "mean"
        ? [twoGroups.people.slice(0, 2).map((person) => person.id), twoGroups.people.slice(2).map((person) => person.id)] : undefined;
      const set = buildSenaDeterministicEnaSet(adapterOptions(twoGroups), groups);
      expect(manifest.status).toBe("computed");
      expect(manifest.options?.numericalRuntime).toBe(numericalRuntime);
      expect(manifest.outputs?.points).toEqual(set.points);
      expect(manifest.outputs?.rotation?.matrix).toEqual(set.rotation.rotationMatrix);
      expect(manifest.outputs?.rotationVariance).toEqual(set.variance);
      const width = manifest.outputs!.adjacencyKey.length;
      expect(manifest.outputs?.rotation?.matrix).toHaveLength(width);
      expect(manifest.outputs?.rotation?.matrix.every((row) => row.length === width)).toBe(true);
      expect(manifest.outputs?.goodnessOfFit).toEqual(senaDeterministicEnaCorrelations(set).filter((row) =>
        [row.pearson, row.spearman, row.pearsonLower, row.pearsonUpper].every(Number.isFinite)));
      const reference = senaEnaRotationReference(manifest)!;
      expect(reference.numericalRuntime).toBe(numericalRuntime);
      const reused = buildSenaEnaManifest(twoGroups, { numericalRuntime, projectInto: reference });
      expect(reused.status).toBe("computed");
      expect(reused.options?.projectedIn).toBe(true);
      expect(reused.outputs?.rotation?.matrix).toEqual(manifest.outputs?.rotation?.matrix);
      expect(reused.outputs?.points).toEqual(manifest.outputs?.points);
    });
  }

  it("records deterministic fallback to SVD with the existing warning", () => {
    const manifest = buildSenaEnaManifest(dataset, { numericalRuntime, rotation: "mean" });
    expect(manifest.status).toBe("computed");
    expect(manifest.options?.numericalRuntime).toBe(numericalRuntime);
    expect(manifest.outputs?.points).toEqual(buildSenaDeterministicEnaSet(adapterOptions(dataset)).points);
    expect(manifest.warnings).toContain('jENA means rotation needs exactly two groups in "group"; the projection fell back to SVD.');
  });

  it("retains deterministic identity even when empty or one-code manifests skip", () => {
    for (const source of [empty, oneCode]) {
      const manifest = buildSenaEnaManifest(source, { numericalRuntime });
      expect(manifest.status).toBe("skipped");
      expect(manifest.options?.numericalRuntime).toBe(numericalRuntime);
      expect(buildSenaEnaManifest(source).options).toBeUndefined();
    }
  });

  it("rejects borrowed unknown and mismatched profiles before skipped paths", () => {
    const native = senaEnaRotationReference(buildSenaEnaManifest(dataset, { emitRotation: true }))!;
    for (const source of [dataset, empty, oneCode]) {
      expect(() => buildSenaEnaManifest(source, { numericalRuntime, projectInto: native })).toThrow(/numericalRuntime/);
      expect(() => buildSenaEnaManifest(source, { projectInto: { ...native, numericalRuntime } })).toThrow(/numericalRuntime/);
      for (const invalid of [null, 1, "unknown-profile-private-value"]) {
        expect(() => buildSenaEnaManifest(source, { projectInto: { ...native, numericalRuntime: invalid } as unknown as SenaEnaRotationReference })).toThrow(/numericalRuntime/);
      }
    }
  });

  it("keeps public projectIn adjacency rejection under the deterministic profile", () => {
    const reference = senaEnaRotationReference(buildSenaEnaManifest(dataset, { numericalRuntime, emitRotation: true }))!;
    const codes = dataset.codebook.slice(0, -1);
    const narrower = { ...dataset, codebook: codes, coded_segments: dataset.coded_segments.map((segment) => ({ ...segment, codes: segment.codes.filter((id) => codes.some((code) => code.id === id)) })) };
    const rejected = buildSenaEnaManifest(narrower, { numericalRuntime, projectInto: reference });
    expect(rejected.status).toBe("skipped");
    expect(rejected.options?.numericalRuntime).toBe(numericalRuntime);
    expect(rejected.warnings.join(" ")).toMatch(/adjacency/i);
  });

  it("derives explicit adapter provenance while leaving native and jSNA provenance intact", () => {
    expect(runtimeConstants.senaRuntimeProvenanceFor()).toBe(senaRuntimeProvenance);
    const fixed = runtimeConstants.senaRuntimeProvenanceFor(numericalRuntime);
    expect(fixed.numericalRuntime).toBe(numericalRuntime);
    expect(fixed.enaRuntime.version).toBe("0.6.2");
    expect(fixed.enaRuntime.numericalAdapter?.implementation).toBe("lib/sena/deterministic-ena.ts");
    expect(fixed.enaRuntime.numericalAdapter?.basis).toMatch(/Householder/);
    expect(fixed.snaRuntime).toEqual(senaRuntimeProvenance.snaRuntime);
    expect(fixed.parityEvidence.map((entry) => entry.id)).toEqual(senaRuntimeProvenance.parityEvidence.map((entry) => entry.id));
    expect(fixed.parityEvidence[0].interpretation).toMatch(/native.*adapter/i);
    expect(fixed.parityEvidence[0].interpretation).toContain("conditional 2D variance");
    expect(() => runtimeConstants.senaRuntimeProvenanceFor(null as unknown as typeof numericalRuntime)).toThrow(/numericalRuntime/);
  });
});
