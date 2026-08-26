import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const modelReplayProbe = vi.hoisted(() => ({
  buildCount: 0,
  maximumBuilds: Number.POSITIVE_INFINITY
}));

const datasetHashProbe = vi.hoisted(() => ({
  buildCount: 0
}));

vi.mock("../model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../model")>();
  return {
    ...actual,
    buildSenaModel: (...args: Parameters<typeof actual.buildSenaModel>) => {
      modelReplayProbe.buildCount += 1;
      if (modelReplayProbe.buildCount > modelReplayProbe.maximumBuilds) {
        throw new Error("validation source model replay budget exceeded");
      }
      return actual.buildSenaModel(...args);
    }
  };
});

vi.mock("../data-contract-audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data-contract-audit")>();
  return {
    ...actual,
    buildSenaDatasetContentHash: (...args: Parameters<typeof actual.buildSenaDatasetContentHash>) => {
      datasetHashProbe.buildCount += 1;
      return actual.buildSenaDatasetContentHash(...args);
    }
  };
});

import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  buildSenaAnalysisRun,
  buildSenaModel,
  buildSenaProjectSnapshot,
  lessonStudySenaContract
} from "../index";
import {
  createEnterpriseProject,
  createEnterpriseAnalysisRun,
  createEnterpriseValidationRun,
  readEnterpriseDb,
  registerEnterpriseUser
} from "../enterprise";
import {
  emptyEnterpriseDb,
  normalizeEnterpriseDb
} from "../enterprise/state";
import {
  enterpriseValidationParityEvidenceHash,
  enterpriseValidationRunEvidenceHash,
  isEnterpriseValidationParityEvidenceHashValid,
  isEnterpriseValidationPreregistrationPlanHashValid,
  normalizeEnterpriseValidationRunEvidence,
  normalizeEnterpriseValidationRunCollectionEvidence,
  sealEnterpriseValidationRunEvidence,
  isEnterpriseValidationRunCurrentProvenance,
  SenaEnterpriseValidationAnalysisRunIndex,
  SenaEnterpriseValidationProjectRevisionIndex
} from "../enterprise/validation-integrity";
import {
  estimateSenaGroupComparisonSourceModelWorkUnits,
  normalizeSenaGroupComparisonValidationResult,
  SenaGroupComparisonSourceVerificationCache
} from "../inference";
import {
  runWithSenaValidationRequestScope,
  senaValidationSourceVerificationCache
} from "../enterprise/validation-request-scope";

let enterpriseDbDir = "";
const previousEnterpriseDbDir = process.env.SENA_ENTERPRISE_DB_DIR;

beforeAll(() => {
  enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-replay-round25-"));
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
});

beforeEach(() => {
  modelReplayProbe.buildCount = 0;
  modelReplayProbe.maximumBuilds = Number.POSITIVE_INFINITY;
  datasetHashProbe.buildCount = 0;
  writeFileSync(
    path.join(enterpriseDbDir, "enterprise-db.json"),
    JSON.stringify(emptyEnterpriseDb())
  );
});

afterAll(() => {
  modelReplayProbe.maximumBuilds = Number.POSITIVE_INFINITY;
  if (previousEnterpriseDbDir === undefined) delete process.env.SENA_ENTERPRISE_DB_DIR;
  else process.env.SENA_ENTERPRISE_DB_DIR = previousEnterpriseDbDir;
  rmSync(enterpriseDbDir, { recursive: true, force: true });
});

describe("validation source verification replay budget", () => {
  function createValidationEvidenceFixture(suffix: string, seed = 20260611) {
    const registered = registerEnterpriseUser({
      name: `Validation Admission ${suffix}`,
      email: `validation-admission-${suffix}@example.edu`,
      password: "sena-secure-123",
      organization: "Validation Admission Lab",
      plan: "lab"
    });
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
      title: `Validation admission ${suffix}`,
      generatedAt: "2026-08-25T00:00:00.000Z",
      sourceDataset: lessonStudySenaContract
    });
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: `Validation admission ${suffix}`,
      snapshot
    });
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      seed,
      alpha: 0.05
    });
    const run = createEnterpriseValidationRun(registered.context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Bounded evidence fixture.",
      methodNote: "Every self-hash carrier is admitted before traversal.",
      result
    });
    return { project, run };
  }

  it("charges the social cubic kernel before admitting a 150-person holder model", () => {
    const person = lessonStudySenaContract.people[0];
    const dataset = {
      ...structuredClone(lessonStudySenaContract),
      people: Array.from({ length: 150 }, (_unused, index) => ({
        ...structuredClone(person),
        id: `person-${index}`
      }))
    };
    modelReplayProbe.buildCount = 0;

    expect(estimateSenaGroupComparisonSourceModelWorkUnits({ dataset }))
      .toBeGreaterThan(50_000_000);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it.each(["single", "suite"] as const)(
    "preflights repeated-alias projection fan-out for the public %s builder before validation or model work",
    (mode) => {
      const sharedCodes = Array.from({ length: 128 }, () => (
        lessonStudySenaContract.coded_segments[0].codes[0]
      ));
      const dataset = {
        ...structuredClone(lessonStudySenaContract),
        coded_segments: Array.from({ length: 64 }, (_unused, index) => ({
          ...structuredClone(lessonStudySenaContract.coded_segments[0]),
          segmentId: `aliased-segment-${index}`,
          codes: sharedCodes
        }))
      };
      const limits = {
        maxProjectionWorkUnits: 500,
        maxSourceModelWorkUnits: 50_000_000,
        maxSourceTextBytes: 16 * 1024 * 1024
      };
      modelReplayProbe.buildCount = 0;

      const build = () => mode === "single"
        ? (buildSenaGroupComparison as unknown as (
          input: Record<string, unknown>,
          limits: Record<string, number>
        ) => unknown)({
          dataset,
          groupField: "role",
          groupA: "Lead teacher",
          groupB: "Curriculum designer",
          metric: "bridgeScore",
          iterations: 100,
          bootstrapIterations: 100
        }, limits)
        : (buildSenaGroupComparisonSuite as unknown as (
          input: Record<string, unknown>,
          limits: Record<string, number>
        ) => unknown)({
          dataset,
          defaultGroupField: "role",
          comparisons: [
            { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
          ],
          iterations: 100,
          bootstrapIterations: 100
        }, limits);

      expect(build).toThrow(/source projection work budget exceeded/i);
      expect(modelReplayProbe.buildCount).toBe(0);
    }
  );

  it.each(["single", "suite"] as const)(
    "enforces the aggregate source-text budget for the public %s builder before model work",
    (mode) => {
      const dataset = structuredClone(lessonStudySenaContract);
      const limits = {
        maxProjectionWorkUnits: 5_000_000,
        maxSourceModelWorkUnits: 50_000_000,
        maxSourceTextBytes: 64
      };
      modelReplayProbe.buildCount = 0;

      const build = () => mode === "single"
        ? (buildSenaGroupComparison as unknown as (
          input: Record<string, unknown>,
          limits: Record<string, number>
        ) => unknown)({
          dataset,
          groupField: "role",
          groupA: "Lead teacher",
          groupB: "Curriculum designer",
          metric: "bridgeScore",
          iterations: 100,
          bootstrapIterations: 100
        }, limits)
        : (buildSenaGroupComparisonSuite as unknown as (
          input: Record<string, unknown>,
          limits: Record<string, number>
        ) => unknown)({
          dataset,
          defaultGroupField: "role",
          comparisons: [
            { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
          ],
          iterations: 100,
          bootstrapIterations: 100
        }, limits);

      expect(build).toThrow(/source model text budget exceeded/i);
      expect(modelReplayProbe.buildCount).toBe(0);
    }
  );

  it.each(["single", "suite"] as const)(
    "rejects the next public %s source string by its byte lower bound before malformed UTF scanning",
    (mode) => {
      const dataset = structuredClone(lessonStudySenaContract);
      dataset.people[0].id = "a".repeat(63);
      dataset.people[0].label = `${"b".repeat(63)}\ud800`;
      const limits = {
        maxProjectionWorkUnits: 5_000_000,
        maxSourceModelWorkUnits: 50_000_000,
        maxSourceTextBytes: 64
      };
      modelReplayProbe.buildCount = 0;
      datasetHashProbe.buildCount = 0;

      const build = () => mode === "single"
        ? buildSenaGroupComparison({
          dataset,
          groupField: "role",
          groupA: "Lead teacher",
          groupB: "Curriculum designer",
          metric: "bridgeScore",
          iterations: 100,
          bootstrapIterations: 100
        }, limits)
        : buildSenaGroupComparisonSuite({
          dataset,
          defaultGroupField: "role",
          comparisons: [
            { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
          ],
          iterations: 100,
          bootstrapIterations: 100
        }, limits);

      expect(build).toThrow(/source model text budget exceeded/i);
      expect(modelReplayProbe.buildCount).toBe(0);
      expect(datasetHashProbe.buildCount).toBe(0);
    }
  );

  it("builds and hashes one admitted source model for a maximum 40-comparison public suite", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    dataset.people = [
      ...dataset.people.map((person, index) => ({ ...person, group: `suite-group-${index}` })),
      ...Array.from({ length: 6 }, (_unused, index) => ({
        ...structuredClone(dataset.people[0]),
        id: `suite-extra-person-${index}`,
        label: `Suite extra person ${index}`,
        group: `suite-group-${index + 4}`
      }))
    ];
    const groupNames = dataset.people.map((person) => person.group);
    const comparisons = groupNames.flatMap((groupA, index) => (
      [1, 2, 3, 4].map((offset) => ({
        groupField: "group" as const,
        groupA,
        groupB: groupNames[(index + offset) % groupNames.length],
        metric: "bridgeScore" as const
      }))
    ));
    expect(comparisons).toHaveLength(40);
    const oneModelWorkUnits = estimateSenaGroupComparisonSourceModelWorkUnits({ dataset });
    const limits = {
      maxProjectionWorkUnits: 5_000_000,
      maxSourceModelWorkUnits: oneModelWorkUnits,
      maxSourceTextBytes: 16 * 1024 * 1024
    };

    modelReplayProbe.buildCount = 0;
    datasetHashProbe.buildCount = 0;
    expect(() => buildSenaGroupComparison({
      dataset,
      groupField: comparisons[0].groupField,
      groupA: comparisons[0].groupA,
      groupB: comparisons[0].groupB,
      metric: "bridgeScore",
      iterations: 100,
      bootstrapIterations: 100
    }, limits)).not.toThrow();
    expect(modelReplayProbe.buildCount).toBe(1);
    expect(datasetHashProbe.buildCount).toBe(1);

    modelReplayProbe.buildCount = 0;
    datasetHashProbe.buildCount = 0;
    expect(() => buildSenaGroupComparisonSuite({
      dataset,
      defaultGroupField: "group",
      comparisons,
      iterations: 100,
      bootstrapIterations: 100
    }, limits)).not.toThrow();
    expect(modelReplayProbe.buildCount).toBe(1);
    expect(datasetHashProbe.buildCount).toBe(1);
  });

  it("rejects an oversized sparse holder collection before reading an entry", () => {
    const codedSegments = new Array(65_537);
    let reads = 0;
    Object.defineProperty(codedSegments, 65_536, {
      enumerable: true,
      get() {
        reads += 1;
        return {};
      }
    });
    const dataset = {
      ...structuredClone(lessonStudySenaContract),
      coded_segments: codedSegments
    };

    expect(() => estimateSenaGroupComparisonSourceModelWorkUnits(
      { dataset: dataset as never },
      50_000_000
    )).toThrow(/source model work budget exceeded/i);
    expect(reads).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("rejects oversized segment code fan-out before reading a code entry", () => {
    const codes = new Array(65_537);
    let reads = 0;
    Object.defineProperty(codes, 65_536, {
      enumerable: true,
      get() {
        reads += 1;
        return "evidence";
      }
    });
    const dataset = {
      ...structuredClone(lessonStudySenaContract),
      coded_segments: [{
        ...structuredClone(lessonStudySenaContract.coded_segments[0]),
        codes
      }]
    };

    expect(() => estimateSenaGroupComparisonSourceModelWorkUnits(
      { dataset: dataset as never },
      50_000_000
    )).toThrow(/source model work budget exceeded/i);
    expect(reads).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("reserves cumulative segment fan-out before reading the segment that crosses the budget", () => {
    let triggeringReads = 0;
    const segments = Array.from({ length: 2 }, (_unused, segmentIndex) => {
      const codes = Array.from({ length: 5500 }, () => "evidence");
      if (segmentIndex === 1) {
        Object.defineProperty(codes, 0, {
          enumerable: true,
          configurable: true,
          get() {
            triggeringReads += 1;
            return "evidence";
          }
        });
      }
      return {
        ...structuredClone(lessonStudySenaContract.coded_segments[0]),
        id: `segment-${segmentIndex}`,
        codes
      };
    });
    const dataset = {
      ...structuredClone(lessonStudySenaContract),
      coded_segments: segments
    };

    expect(() => estimateSenaGroupComparisonSourceModelWorkUnits(
      { dataset: dataset as never },
      50_000_000
    )).toThrow(/source model work budget exceeded/i);
    expect(triggeringReads).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it.each([
    ["plan comparisons", (run: Record<string, any>, carrier: unknown[]) => {
      run.preregistrationPlan.comparisons = carrier;
    }],
    ["runtime parity", (run: Record<string, any>, carrier: unknown[]) => {
      run.parityEvidence.runtimeParity = carrier;
    }],
    ["parity gates", (run: Record<string, any>, carrier: unknown[]) => {
      run.parityEvidence.gates = carrier;
    }],
    ["formal checks", (run: Record<string, any>, carrier: unknown[]) => {
      run.parityEvidence.formalInference.checks = carrier;
    }],
    ["parity notes", (run: Record<string, any>, carrier: unknown[]) => {
      run.parityEvidence.notes = carrier;
    }]
  ] as const)("rejects oversized %s before traversing self-hash entries", (_label, mutate) => {
    const { project, run } = createValidationEvidenceFixture(String(_label).replaceAll(" ", "-"));
    const maximum = _label === "plan comparisons" ? 41
      : _label === "runtime parity" ? 17
        : _label === "parity gates" ? 6
          : _label === "formal checks" ? 7
            : 33;
    const carrier = new Array(maximum);
    Object.defineProperty(carrier, 0, {
      enumerable: true,
      get() {
        throw new Error(`oversized ${_label} carrier was traversed`);
      }
    });
    mutate(run as unknown as Record<string, any>, carrier);

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({
      code: "validation_run_evidence_invalid",
      path: "resourceAdmission"
    }));
  });

  it("rejects unknown nested self-hash fields without recursively reading their value", () => {
    const { project, run } = createValidationEvidenceFixture("unknown-nested-field");
    const nested = {};
    Object.defineProperty(nested, "secret", {
      enumerable: true,
      get() {
        throw new Error("unknown nested validation field was recursively traversed");
      }
    });
    Object.assign(run.parityEvidence!.gates[0], { unexpected: nested });

    expect(isEnterpriseValidationParityEvidenceHashValid(run.parityEvidence)).toBe(false);
    expect(isEnterpriseValidationPreregistrationPlanHashValid(run.preregistrationPlan)).toBe(true);
    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
  });

  it("rejects an allowed validation field accessor without invoking it", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    let getterReads = 0;
    Object.defineProperty(result.comparisons[0], "groupA", {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("allowed validation getter was invoked");
      }
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(result)).toThrow(/carrier|shape/i);
    expect(getterReads).toBe(0);
  });

  it("rejects an allowed validation array index accessor without invoking it", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    let getterReads = 0;
    Object.defineProperty(result.comparisons[0].permutation.samplesPreview, 0, {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("allowed validation array getter was invoked");
      }
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(result)).toThrow(/carrier|shape/i);
    expect(getterReads).toBe(0);
  });

  it("rejects an allowed sealed-evidence field accessor without invoking it", () => {
    const { project, run } = createValidationEvidenceFixture("allowed-evidence-field-accessor");
    let getterReads = 0;
    Object.defineProperty(run.preregistrationPlan!.parameters, "permutationIterations", {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("allowed sealed-evidence getter was invoked");
      }
    });

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
    expect(getterReads).toBe(0);
  });

  it("rejects an allowed sealed-evidence array index accessor without invoking it", () => {
    const { project, run } = createValidationEvidenceFixture("allowed-evidence-index-accessor");
    let getterReads = 0;
    Object.defineProperty(run.parityEvidence!.notes, 0, {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("allowed sealed-evidence index getter was invoked");
      }
    });

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
    expect(getterReads).toBe(0);
  });

  it("ignores extra holder source-record fields without traversing their values", () => {
    const dataset = structuredClone(lessonStudySenaContract) as typeof lessonStudySenaContract & {
      people: Array<(typeof lessonStudySenaContract.people)[number] & { unexpected?: unknown }>;
    };
    let getterReads = 0;
    const nested = {};
    Object.defineProperty(nested, "secret", {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("unknown source-record value was traversed");
      }
    });
    dataset.people[0].unexpected = nested;

    expect(estimateSenaGroupComparisonSourceModelWorkUnits({ dataset }))
      .toBe(estimateSenaGroupComparisonSourceModelWorkUnits({
        dataset: structuredClone(lessonStudySenaContract)
      }));
    expect(getterReads).toBe(0);
  });

  it("projects source carriers by known schema fields without enumerating unknown object or array extras", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const dataset = structuredClone(lessonStudySenaContract) as typeof lessonStudySenaContract & {
      people: Array<(typeof lessonStudySenaContract.people)[number] & { unexpected?: unknown }> & {
        unexpected?: unknown;
      };
    };
    const sourceRow = dataset.people[0];
    const sourceArray = dataset.people;
    let unknownValueReads = 0;
    Object.defineProperty(sourceRow, "unexpected", {
      configurable: true,
      enumerable: true,
      get() {
        unknownValueReads += 1;
        throw new Error("unknown source row value was read");
      }
    });
    Object.defineProperty(sourceArray, "unexpected", {
      configurable: true,
      enumerable: true,
      get() {
        unknownValueReads += 1;
        throw new Error("unknown source array value was read");
      }
    });
    const originalOwnKeys = Reflect.ownKeys;
    let untrustedCarrierEnumerations = 0;
    const ownKeysSpy = vi.spyOn(Reflect, "ownKeys").mockImplementation((value) => {
      if (value === sourceRow || value === sourceArray) untrustedCarrierEnumerations += 1;
      return originalOwnKeys(value);
    });

    try {
      expect(() => normalizeSenaGroupComparisonValidationResult(
        structuredClone(result),
        { dataset },
        new SenaGroupComparisonSourceVerificationCache()
      )).not.toThrow();
      expect(untrustedCarrierEnumerations).toBe(0);
      expect(unknownValueReads).toBe(0);
    } finally {
      ownKeysSpy.mockRestore();
    }
  });

  it("builds and revalidates current evidence from one canonical source projection", () => {
    const cleanDataset = structuredClone(lessonStudySenaContract);
    const cleanBuildOptions = { alpha: 0.5 };
    const comparisonInput = {
      defaultGroupField: "role" as const,
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" as const }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      seed: 20260611,
      alpha: 0.05
    };
    const cleanResult = buildSenaGroupComparisonSuite({
      dataset: cleanDataset,
      buildOptions: cleanBuildOptions,
      ...comparisonInput
    });
    const extendedDataset = structuredClone(cleanDataset) as typeof cleanDataset & {
      people: typeof cleanDataset.people & { extensionArray?: unknown };
    };
    const extendedBuildOptions = { alpha: 0.5 } as typeof cleanBuildOptions & {
      extensionOption?: unknown;
    };
    let unknownReads = 0;
    const unreadable = () => {
      unknownReads += 1;
      throw new Error("unknown canonical-source extension was read");
    };
    Object.defineProperty(extendedDataset.people[0], "extensionField", {
      configurable: true,
      enumerable: true,
      get: unreadable
    });
    Object.defineProperty(extendedDataset.people[0], "hiddenExtension", {
      configurable: true,
      enumerable: false,
      value: "hidden"
    });
    (extendedDataset.people[0] as unknown as Record<PropertyKey, unknown>)[Symbol("extension")] = "symbol";
    Object.defineProperty(extendedDataset.people, "extensionArray", {
      configurable: true,
      enumerable: true,
      get: unreadable
    });
    Object.defineProperty(extendedBuildOptions, "extensionOption", {
      configurable: true,
      enumerable: true,
      get: unreadable
    });

    const extendedResult = buildSenaGroupComparisonSuite({
      dataset: extendedDataset,
      buildOptions: extendedBuildOptions,
      ...comparisonInput
    });

    expect(unknownReads).toBe(0);
    expect(extendedResult).toEqual(cleanResult);
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(extendedResult),
      { dataset: extendedDataset, buildOptions: extendedBuildOptions },
      new SenaGroupComparisonSourceVerificationCache()
    )).not.toThrow();
    expect(unknownReads).toBe(0);
  });

  it("normalizes optional own-undefined source fields to the absent canonical form", () => {
    const absentDataset = structuredClone(lessonStudySenaContract);
    delete (absentDataset.people[0] as Partial<(typeof absentDataset.people)[number]>).initials;
    delete (absentDataset as Partial<typeof absentDataset>).warnings;
    const undefinedDataset = structuredClone(absentDataset);
    undefinedDataset.people[0].initials = undefined;
    undefinedDataset.warnings = undefined;
    const absentBuildOptions = { alpha: 0.5, temporal: { mode: "stage" as const } };
    const undefinedBuildOptions = {
      alpha: 0.5,
      beta: undefined,
      temporal: {
        mode: "stage" as const,
        movingWindowSize: undefined
      }
    };
    const result = buildSenaGroupComparisonSuite({
      dataset: absentDataset,
      buildOptions: absentBuildOptions,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      seed: 20260611,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache({ maxUniqueSources: 1 });

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: absentDataset, buildOptions: absentBuildOptions },
      cache
    )).not.toThrow();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: undefinedDataset, buildOptions: undefinedBuildOptions },
      cache
    )).not.toThrow();
    expect(cache.modelBuildCount).toBe(1);
    expect(cache.sourceEvidenceBuildCount).toBe(1);
  });

  it("rejects an allowed holder source-record accessor without invoking it", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    let getterReads = 0;
    Object.defineProperty(dataset.people[0], "id", {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("allowed source-record getter was invoked");
      }
    });

    expect(() => estimateSenaGroupComparisonSourceModelWorkUnits({ dataset }))
      .toThrow(/holder dataset|source model|carrier/i);
    expect(getterReads).toBe(0);
  });

  it.each([
    ["result", (run: Record<string, any>, value: object) => {
      Object.defineProperty(run.result, "unexpected", { enumerable: true, get: () => value });
    }],
    ["run envelope", (run: Record<string, any>, value: object) => {
      Object.defineProperty(run, "unexpected", { enumerable: true, get: () => value });
    }]
  ] as const)("rejects an unknown %s field before recursive hash traversal", (_label, mutate) => {
    const { project, run } = createValidationEvidenceFixture(`unknown-${_label.replaceAll(" ", "-")}`);
    let getterReads = 0;
    const nested = {};
    Object.defineProperty(nested, "secret", {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("unknown sealed validation carrier was traversed");
      }
    });
    mutate(run as unknown as Record<string, any>, nested);

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
    expect(getterReads).toBe(0);
  });

  it.each([
    ["non-enumerable", (run: Record<PropertyKey, unknown>) => {
      Object.defineProperty(run, "unexpected", {
        configurable: true,
        enumerable: false,
        value: "hidden validation field"
      });
    }],
    ["symbol", (run: Record<PropertyKey, unknown>) => {
      run[Symbol("unexpected")] = "symbol validation field";
    }]
  ] as const)("rejects an unknown %s sealed validation field", (_label, mutate) => {
    const { project, run } = createValidationEvidenceFixture(
      `unknown-${_label}-sealed-field`
    );
    mutate(run as unknown as Record<PropertyKey, unknown>);

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
  });

  it.each([
    ["non-enumerable", (carrier: unknown[]) => {
      Object.defineProperty(carrier, "unexpected", {
        configurable: true,
        enumerable: false,
        value: "hidden validation array field"
      });
    }],
    ["symbol", (carrier: unknown[]) => {
      (carrier as unknown as Record<PropertyKey, unknown>)[Symbol("unexpected")] =
        "symbol validation array field";
    }]
  ] as const)("rejects an unknown %s sealed validation array field", (_label, mutate) => {
    const { project, run } = createValidationEvidenceFixture(
      `unknown-${_label}-sealed-array-field`
    );
    mutate(run.parityEvidence!.notes);

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
  });

  it.each([
    ["plan iterations", (run: Record<string, any>, value: unknown) => {
      run.preregistrationPlan.parameters.permutationIterations = value;
    }],
    ["parity inference count", (run: Record<string, any>, value: unknown) => {
      run.parityEvidence.inference.comparisonCount = value;
    }],
    ["formal minimum group size", (run: Record<string, any>, value: unknown) => {
      run.parityEvidence.formalInference.minGroupSize = value;
    }]
  ] as const)("rejects a non-scalar %s carrier before reading its entries", (_label, mutate) => {
    const { project, run } = createValidationEvidenceFixture(`scalar-${_label.replaceAll(" ", "-")}`);
    const carrier = new Array(65_537);
    let getterReads = 0;
    Object.defineProperty(carrier, 0, {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("known scalar validation carrier was traversed");
      }
    });
    mutate(run as unknown as Record<string, any>, carrier);

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
    expect(getterReads).toBe(0);
  });

  it("rejects an oversized result string before full-run hashing", () => {
    const { project, run } = createValidationEvidenceFixture("oversized-result-string");
    (run.result as unknown as Record<string, any>).comparisons[0].groupA = "A".repeat(4097);

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
  });

  it("keeps internally sealed historical runtime provenance readable but not current", () => {
    const { project, run } = createValidationEvidenceFixture("historical-runtime-provenance");
    const parity = run.parityEvidence!;
    parity.runtimeParity[0].interpretation = `${parity.runtimeParity[0].interpretation} Historical fixture wording.`;
    const {
      status: _status,
      validationRunHash: _validationRunHash,
      ...parityBody
    } = parity;
    parity.validationRunHash = enterpriseValidationParityEvidenceHash(parityBody);
    run.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(run);

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required"
    })).not.toThrow();
    expect(isEnterpriseValidationRunCurrentProvenance(run, project)).toBe(false);
  });

  it("does not build the analysis-run index for a project-snapshot walkthrough", () => {
    const { project, run } = createValidationEvidenceFixture("project-source-index-skip");
    let sourceReads = 0;
    const unrelatedSource = {};
    Object.defineProperty(unrelatedSource, "id", {
      enumerable: true,
      get() {
        sourceReads += 1;
        throw new Error("project-snapshot evidence constructed the analysis-run index");
      }
    });

    expect(() => normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: "required",
      analysisRuns: [unrelatedSource] as never[]
    })).not.toThrow();
    expect(sourceReads).toBe(0);
  });

  it("keeps an unsealed legacy project run readable without guessing the live project source", () => {
    const { project, run } = createValidationEvidenceFixture("legacy-unbound-after-project-advance");
    const legacy = structuredClone(run) as Record<string, any>;
    delete legacy.validationRunEvidenceSchemaVersion;
    delete legacy.validationRunEvidenceHash;
    delete legacy.projectBinding;
    const advancedProject = structuredClone(project);
    advancedProject.currentVersion += 1;
    advancedProject.snapshot.dataset.people[0].label = "Advanced holder roster";

    expect(() => normalizeEnterpriseValidationRunEvidence(legacy as never, advancedProject, {
      evidenceHash: "optional"
    })).not.toThrow();
    expect(() => normalizeEnterpriseValidationRunEvidence(legacy as never, advancedProject, {
      evidenceHash: "required"
    })).toThrowError(expect.objectContaining({
      path: "validationRunEvidenceHash"
    }));
    expect(() => sealEnterpriseValidationRunEvidence(legacy as never, advancedProject)).toThrowError(
      expect.objectContaining({ path: "projectBinding" })
    );
  });

  it("indexes exact analysis candidates by the complete binding key", () => {
    const artifactHash = "a".repeat(64);
    const runs = Array.from({ length: 1000 }, (_unused, candidateIndex) => {
      const target = candidateIndex === 999;
      const artifactFingerprints = {
        reportSha256: "e".repeat(64),
        projectSnapshotSha256: "f".repeat(64),
        projectSnapshotBindingSha256: target
          ? artifactHash
          : String(candidateIndex).padStart(64, "0")
      } satisfies {
        reportSha256: string;
        projectSnapshotSha256: string;
        projectSnapshotBindingSha256: string;
      };
      return {
        id: target ? "analysis-target" : `analysis-foreign-${candidateIndex}`,
        teamId: target ? "team-target" : `team-foreign-${candidateIndex}`,
        projectId: target ? "project-target" : `project-foreign-${candidateIndex}`,
        persistedProjectId: undefined,
        artifactFingerprints
      };
    });
    const index = new SenaEnterpriseValidationAnalysisRunIndex(runs as never[]);

    for (let lookup = 0; lookup < 1000; lookup += 1) {
      expect(index.matchingCount({
        id: "analysis-target",
        teamId: "team-target",
        projectId: "project-target",
        projectSnapshotArtifactSha256: artifactHash
      })).toBe(1);
    }
    expect(index.candidateInspectionCount).toBe(1000);
    expect(index.lookupCount).toBe(1000);
  });

  it.each([
    ["enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      candidate.unexpected = "extra";
    }],
    ["non-enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      Object.defineProperty(candidate, "unexpected", { value: "hidden", enumerable: false });
    }],
    ["symbol extra", (candidate: Record<PropertyKey, unknown>) => {
      candidate[Symbol("unexpected")] = "symbol";
    }],
    ["fingerprint enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      (candidate.artifactFingerprints as Record<PropertyKey, unknown>).unexpected = "extra";
    }],
    ["fingerprint non-enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      Object.defineProperty(candidate.artifactFingerprints as object, "unexpected", {
        value: "hidden",
        enumerable: false
      });
    }],
    ["fingerprint symbol extra", (candidate: Record<PropertyKey, unknown>) => {
      (candidate.artifactFingerprints as Record<PropertyKey, unknown>)[Symbol("unexpected")] = "symbol";
    }],
    ["allowed id accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "id", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("analysis id getter executed");
        }
      });
    }],
    ["allowed teamId accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "teamId", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("analysis teamId getter executed");
        }
      });
    }],
    ["fingerprint accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate.artifactFingerprints as object, "projectSnapshotBindingSha256", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("analysis fingerprint getter executed");
        }
      });
    }]
  ] as const)("rejects an analysis authority wrapper with %s before reading it", (_label, mutate) => {
    const reads = { count: 0 };
    const candidate: Record<PropertyKey, unknown> = {
      id: "analysis-exact-carrier",
      teamId: "team-exact-carrier",
      projectId: "project-exact-carrier",
      persistedProjectId: undefined,
      artifactFingerprints: {
        reportSha256: "a".repeat(64),
        projectSnapshotSha256: "b".repeat(64),
        projectSnapshotBindingSha256: "c".repeat(64)
      }
    };
    mutate(candidate, reads);

    expect(() => new SenaEnterpriseValidationAnalysisRunIndex([candidate] as never[]))
      .toThrow(/resourceAdmission|carrier|canonically bound/i);
    expect(reads.count).toBe(0);
  });

  it.each([
    ["enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      candidate.unexpected = "extra";
    }],
    ["non-enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      Object.defineProperty(candidate, "unexpected", { value: "hidden", enumerable: false });
    }],
    ["symbol extra", (candidate: Record<PropertyKey, unknown>) => {
      candidate[Symbol("unexpected")] = "symbol";
    }],
    ["allowed id accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "id", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("project id getter executed");
        }
      });
    }],
    ["allowed currentVersion accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "currentVersion", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("project currentVersion getter executed");
        }
      });
    }],
    ["allowed snapshot accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "snapshot", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("project snapshot getter executed");
        }
      });
    }]
  ] as const)("rejects a project authority wrapper with %s before reading it", (_label, mutate) => {
    const fixture = createValidationEvidenceFixture(`project-wrapper-${_label.replaceAll(" ", "-")}`);
    const reads = { count: 0 };
    const candidate = structuredClone(fixture.project) as unknown as Record<PropertyKey, unknown>;
    mutate(candidate, reads);

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [fixture.run],
      projects: [candidate as never],
      analysisRuns: []
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
    expect(reads.count).toBe(0);
  });

  it.each([
    ["enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      candidate.unexpected = "extra";
    }],
    ["non-enumerable extra", (candidate: Record<PropertyKey, unknown>) => {
      Object.defineProperty(candidate, "unexpected", { value: "hidden", enumerable: false });
    }],
    ["symbol extra", (candidate: Record<PropertyKey, unknown>) => {
      candidate[Symbol("unexpected")] = "symbol";
    }],
    ["allowed projectId accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "projectId", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("revision projectId getter executed");
        }
      });
    }],
    ["allowed teamId accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "teamId", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("revision teamId getter executed");
        }
      });
    }],
    ["allowed snapshot accessor", (candidate: Record<PropertyKey, unknown>, reads: { count: number }) => {
      Object.defineProperty(candidate, "snapshot", {
        enumerable: true,
        get() {
          reads.count += 1;
          throw new Error("revision snapshot getter executed");
        }
      });
    }]
  ] as const)("rejects a revision authority wrapper with %s before reading it", (_label, mutate) => {
    const fixture = createValidationEvidenceFixture(`revision-wrapper-${_label.replaceAll(" ", "-")}`);
    const db = readEnterpriseDb();
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === fixture.project.id &&
      candidate.version === fixture.run.projectBinding?.projectVersion
    ));
    if (!revision) throw new Error("Expected project revision authority fixture.");
    const reads = { count: 0 };
    const candidate = structuredClone(revision) as unknown as Record<PropertyKey, unknown>;
    mutate(candidate, reads);

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [fixture.run],
      projects: [fixture.project],
      projectRevisions: [candidate as never],
      analysisRuns: []
    })).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
    expect(reads.count).toBe(0);
  });

  it("applies exact project-wrapper admission in the direct single-run normalizer", () => {
    const fixture = createValidationEvidenceFixture("direct-project-wrapper");
    const candidate = structuredClone(fixture.project);
    let getterReads = 0;
    Object.defineProperty(candidate, "currentVersion", {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("direct project currentVersion getter executed");
      }
    });

    expect(() => normalizeEnterpriseValidationRunEvidence(
      fixture.run,
      candidate,
      { evidenceHash: "required" }
    )).toThrowError(expect.objectContaining({ path: "resourceAdmission" }));
    expect(getterReads).toBe(0);
  });

  it("rejects an oversized foreign metric universe before traversing or replaying it", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const forged = structuredClone(result);
    const oversizedUniverse = new Array(lessonStudySenaContract.people.length + 1);
    Object.defineProperty(oversizedUniverse, 0, {
      enumerable: true,
      get() {
        throw new Error("oversized metric universe was traversed");
      }
    });
    forged.comparisons[0].sourceEvidence!.metricUniverse = oversizedUniverse;
    forged.primary = forged.comparisons[0];

    expect(() => normalizeSenaGroupComparisonValidationResult(forged, {
      dataset: lessonStudySenaContract
    }, new SenaGroupComparisonSourceVerificationCache())).toThrow(
      /metric universe|carrier|bounded/i
    );
  });

  it("replays one canonical deterministic result for 1000 identical exact source results", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();
    for (let index = 0; index < 1000; index += 1) {
      expect(() => normalizeSenaGroupComparisonValidationResult(
        structuredClone(result),
        { dataset: lessonStudySenaContract },
        cache
      )).not.toThrow();
    }
    expect(cache.modelBuildCount).toBe(1);
    expect(cache.sourceEvidenceBuildCount).toBe(1);
    expect(cache.canonicalResultReplayCount).toBe(1);
  });

  it("reuses one canonical holder model across cloned source carriers", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).not.toThrow();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).not.toThrow();

    expect(cache.modelBuildCount).toBe(1);
    expect(cache.sourceEvidenceBuildCount).toBe(1);
    expect(cache.canonicalResultReplayCount).toBe(1);
    expect(cache.uniqueSourceReservationCount).toBe(1);
  });

  it.each([
    ["utterance text", (dataset: typeof lessonStudySenaContract, text: string) => {
      dataset.utterances[0].text += text;
    }],
    ["coded-segment text", (dataset: typeof lessonStudySenaContract, text: string) => {
      dataset.coded_segments[0].text += text;
    }],
    ["codebook description", (dataset: typeof lessonStudySenaContract, text: string) => {
      dataset.codebook[0].description += text;
    }],
    ["interaction evidence", (dataset: typeof lessonStudySenaContract, text: string) => {
      dataset.interactions[0].evidence += text;
    }]
  ] as const)("rejects aggregate source %s before canonical digest or model construction", (_label, mutate) => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const probe = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      probe
    )).not.toThrow();
    const dataset = structuredClone(lessonStudySenaContract);
    mutate(dataset, "xx");
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceTextBytes: probe.lastSourceTextBytesMeasured + 1
    });
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset },
      cache
    )).toThrow(/source model text budget exceeded/i);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(cache.sourceDigestBytesReserved).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("charges every cloned source digest scan against one cumulative request budget", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const probe = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      probe
    )).not.toThrow();
    const oneDigestScan = probe.sourceDigestBytesReserved;
    const oneAdmissionBytes = probe.sourceDigestMeasurementBytesAttempted;
    expect(oneDigestScan).toBeGreaterThan(0);
    expect(oneAdmissionBytes).toBeGreaterThanOrEqual(oneDigestScan);

    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceDigestBytes: oneAdmissionBytes
    });
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).not.toThrow();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).toThrow(/source digest scan budget exceeded/i);
    expect(cache.sourceDigestScanCount).toBe(1);
    expect(cache.sourceDigestBytesReserved).toBe(oneDigestScan);
    expect(cache.modelBuildCount).toBe(1);
  });

  it("charges every cloned source digest traversal against one cumulative work budget", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const probe = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      probe
    )).not.toThrow();
    const oneDigestTraversal = probe.sourceDigestWorkUnitsReserved;
    expect(oneDigestTraversal).toBeGreaterThan(0);

    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceDigestWorkUnits: oneDigestTraversal
    });
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).not.toThrow();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).toThrow(/source digest scan budget exceeded/i);
    expect(cache.sourceDigestScanCount).toBe(1);
    expect(cache.sourceDigestWorkUnitsReserved).toBe(oneDigestTraversal);
    expect(cache.modelBuildCount).toBe(1);
  });

  it("stops a cloned-source measurement on the first work unit after the request budget is exhausted", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const probe = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      probe
    )).not.toThrow();
    const oneDigestTraversal = probe.sourceDigestWorkUnitsReserved;
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceDigestWorkUnits: oneDigestTraversal
    });
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).not.toThrow();
    const attemptsBefore = cache.sourceDigestMeasurementWorkUnitsAttempted;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).toThrow(/source digest scan budget exceeded/i);
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted - attemptsBefore).toBe(0);
    expect(cache.sourceDigestScanCount).toBe(1);
    expect(cache.modelBuildCount).toBe(1);
  });

  it.each([
    ["exhausted", 0],
    ["one remaining unit", 1]
  ] as const)("rejects before touching an observable source carrier when the request budget is %s", (_label, remaining) => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const probe = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      probe
    )).not.toThrow();
    const oneAdmission = probe.sourceDigestMeasurementWorkUnitsAttempted;
    expect(oneAdmission).toBeGreaterThan(1);

    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceDigestWorkUnits: oneAdmission + remaining
    });
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).not.toThrow();

    let sourceCarrierTouches = 0;
    const observableSource = new Proxy(
      { dataset: structuredClone(lessonStudySenaContract) },
      {
        getPrototypeOf(target) {
          sourceCarrierTouches += 1;
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          sourceCarrierTouches += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          sourceCarrierTouches += 1;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
        get(target, key, receiver) {
          sourceCarrierTouches += 1;
          return Reflect.get(target, key, receiver);
        }
      }
    );

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      observableSource as never,
      cache
    )).toThrow(/source digest scan budget exceeded/i);
    expect(sourceCarrierTouches).toBe(0);
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBe(oneAdmission + remaining);
  });

  it("preserves the request-budget error when nested source-array projection exhausts admission", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache({
      // Holder (5) + dataset (10) + people-array preflight (3) fit exactly;
      // reserving its declared dense indices must fail with the budget error,
      // not be rewritten as an invalid-carrier error by an outer reflector.
      maxSourceDigestWorkUnits: 18
    });
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).toThrow(/source digest scan budget exceeded/i);
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBe(18);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("ignores a long unknown source key without scanning it as UTF text", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const dataset = structuredClone(lessonStudySenaContract);
    Object.defineProperty(dataset.people[0], `\uD800${"x".repeat(100_000)}`, {
      configurable: true,
      enumerable: true,
      value: "unknown"
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset },
      cache
    )).not.toThrow();
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBeGreaterThan(0);
    expect(cache.sourceDigestMeasurementBytesAttempted).toBeGreaterThan(0);
    expect(cache.sourceDigestScanCount).toBe(1);
    expect(modelReplayProbe.buildCount).toBe(1);
  });

  it.each([
    ["person label", (dataset: typeof lessonStudySenaContract) => {
      dataset.people[0].label += "\uD800";
    }, /well-formed UTF-16/i],
    ["person group", (dataset: typeof lessonStudySenaContract) => {
      dataset.people[0].group += "\uDC00";
    }, /well-formed UTF-16/i],
    ["utterance text", (dataset: typeof lessonStudySenaContract) => {
      dataset.utterances[0].text += "\uD800";
    }, /well-formed UTF-16/i],
    ["metadata value", (dataset: typeof lessonStudySenaContract) => {
      if (!dataset.metadata) throw new Error("metadata fixture missing");
      dataset.metadata.datasetVersion += "\uDC00";
    }, /well-formed UTF-16/i]
  ] as const)("rejects ill-formed UTF-16 in source %s before digest or model construction", (_label, mutate, expected) => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const dataset = structuredClone(lessonStudySenaContract);
    mutate(dataset);
    const cache = new SenaGroupComparisonSourceVerificationCache();
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset },
      cache
    )).toThrow(expected);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(cache.sourceDigestBytesReserved).toBe(0);
    expect(cache.sourceDigestWorkUnitsReserved).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("ignores ill-formed UTF-16 in an unknown source object key without enumerating it", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const dataset = structuredClone(lessonStudySenaContract);
    Object.defineProperty(dataset.people[0], "\uD800", {
      enumerable: true,
      configurable: true,
      value: "malformed-key"
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset },
      cache
    )).not.toThrow();
    expect(cache.sourceDigestScanCount).toBe(1);
    expect(cache.sourceDigestBytesReserved).toBeGreaterThan(0);
    expect(cache.sourceDigestWorkUnitsReserved).toBeGreaterThan(0);
    expect(modelReplayProbe.buildCount).toBe(1);
  });

  it("accepts a literal replacement character as a distinct well-formed source value", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    dataset.people[0].label += "\uFFFD";
    const result = buildSenaGroupComparisonSuite({
      dataset,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset },
      cache
    )).not.toThrow();
    expect(cache.sourceDigestScanCount).toBe(1);
    expect(cache.modelBuildCount).toBe(1);
    expect(modelReplayProbe.buildCount).toBe(1);
  });

  it("measures the full source text budget in UTF-8 bytes instead of UTF-16 code units", () => {
    const baselineResult = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const probe = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(baselineResult),
      { dataset: structuredClone(lessonStudySenaContract) },
      probe
    )).not.toThrow();

    const dataset = structuredClone(lessonStudySenaContract);
    dataset.people[0].label = `${dataset.people[0].label}界`;
    const result = buildSenaGroupComparisonSuite({
      dataset,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceTextBytes: probe.lastSourceTextBytesMeasured + 2
    });
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset },
      cache
    )).toThrow(/source model text budget exceeded/i);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("shares one cumulative replay budget across unrelated validation reads in a request scope", () => {
    const first = createValidationEvidenceFixture("request-budget-first", 20260901);
    const second = createValidationEvidenceFixture("request-budget-second", 20260902);
    const leaf = first.run.result.schemaVersion === "sena-group-comparison-suite/v2"
      ? first.run.result.comparisons[0]
      : first.run.result;
    const oneReplayWork = (leaf.permutation.iterations + leaf.bootstrap.iterations) *
      leaf.diagnostics.comparedPeople;

    runWithSenaValidationRequestScope(() => {
      expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
        runs: [structuredClone(first.run)],
        projects: [structuredClone(first.project)],
        analysisRuns: []
      })).not.toThrow();

      // A nested helper must inherit the existing request scope instead of
      // minting a fresh budget for an unrelated state read/retry.
      expect(() => runWithSenaValidationRequestScope(() => (
        normalizeEnterpriseValidationRunCollectionEvidence({
          runs: [structuredClone(second.run)],
          projects: [structuredClone(second.project)],
          analysisRuns: []
        })
      ))).toThrow(expect.objectContaining({
        name: "SenaEnterpriseValidationRunIntegrityError",
        path: "result"
      }));

      const cache = senaValidationSourceVerificationCache();
      expect(cache.deterministicWorkUnitsReserved).toBe(oneReplayWork);
      expect(cache.uniqueResultReservationCount).toBe(1);
    }, {
      maxDeterministicWorkUnits: oneReplayWork,
      maxUniqueResults: 1000,
      maxUniqueSources: 1000
    });
  });

  it("reserves trusted holder work before replaying a distinct source-valid result", () => {
    const buildResult = (seed: number) => buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      seed,
      alpha: 0.05
    });
    const first = buildResult(20260825);
    const second = buildResult(20260826);
    const leaf = first.comparisons[0];
    const comparedPeople = leaf.sourceEvidence!.sufficientStatistics.groupA.n +
      leaf.sourceEvidence!.sufficientStatistics.groupB.n;
    const oneReplayWork = (leaf.permutation.iterations + leaf.bootstrap.iterations) * comparedPeople;
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxDeterministicWorkUnits: oneReplayWork,
      maxUniqueResults: 1000
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(
      first,
      { dataset: lessonStudySenaContract },
      cache
    )).not.toThrow();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      second,
      { dataset: lessonStudySenaContract },
      cache
    )).toThrow(/source verification replay budget exceeded/i);
    expect(cache.canonicalResultReplayCount).toBe(1);
    expect(cache.uniqueResultReservationCount).toBe(1);
    expect(cache.deterministicWorkUnitsReserved).toBe(oneReplayWork);
  });

  it("rejects an over-budget second holder before constructing its model", () => {
    const firstDataset = structuredClone(lessonStudySenaContract);
    const secondDataset = structuredClone(lessonStudySenaContract);
    secondDataset.people[0].label = `${secondDataset.people[0].label} revised`;
    const buildResult = (dataset: typeof lessonStudySenaContract) => buildSenaGroupComparisonSuite({
      dataset,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const first = buildResult(firstDataset);
    const second = buildResult(secondDataset);
    const leaf = first.comparisons[0];
    const oneReplayWork = (leaf.permutation.iterations + leaf.bootstrap.iterations) *
      leaf.diagnostics.comparedPeople;
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxDeterministicWorkUnits: oneReplayWork,
      maxUniqueResults: 1000,
      maxUniqueSources: 1000
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(
      first,
      { dataset: firstDataset },
      cache
    )).not.toThrow();
    expect(cache.modelBuildCount).toBe(1);
    expect(() => normalizeSenaGroupComparisonValidationResult(
      second,
      { dataset: secondDataset },
      cache
    )).toThrow(/source verification replay budget exceeded/i);
    expect(cache.modelBuildCount).toBe(1);
    expect(cache.uniqueSourceReservationCount).toBe(1);
  });

  it("accounts for holder model work across distinct snapshots before the second build", () => {
    const firstDataset = structuredClone(lessonStudySenaContract);
    const secondDataset = structuredClone(lessonStudySenaContract);
    secondDataset.people[0].label = `${secondDataset.people[0].label} model-budget-revision`;
    const buildResult = (dataset: typeof lessonStudySenaContract) => buildSenaGroupComparisonSuite({
      dataset,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const first = buildResult(firstDataset);
    const second = buildResult(secondDataset);
    const replayWork = (first.comparisons[0].permutation.iterations +
      first.comparisons[0].bootstrap.iterations) * first.comparisons[0].diagnostics.comparedPeople;
    const firstSource = { dataset: firstDataset };
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxDeterministicWorkUnits: replayWork * 2,
      maxUniqueResults: 1000,
      maxUniqueSources: 1000,
      maxSourceModelWorkUnits: estimateSenaGroupComparisonSourceModelWorkUnits(firstSource)
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(first, firstSource, cache)).not.toThrow();
    expect(cache.modelBuildCount).toBe(1);
    expect(() => normalizeSenaGroupComparisonValidationResult(
      second,
      { dataset: secondDataset },
      cache
    )).toThrow(/source model work budget exceeded/i);
    expect(cache.modelBuildCount).toBe(1);
    expect(cache.uniqueSourceReservationCount).toBe(1);
  });

  it("rejects a retained collection whose distinct replay work would poison the next read", () => {
    const first = createValidationEvidenceFixture("collection-budget-first", 20260825);
    const second = createValidationEvidenceFixture("collection-budget-second", 20260826);
    const leaf = first.run.result.schemaVersion === "sena-group-comparison-suite/v2"
      ? first.run.result.comparisons[0]
      : first.run.result;
    const oneReplayWork = (leaf.permutation.iterations + leaf.bootstrap.iterations) *
      leaf.diagnostics.comparedPeople;
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxDeterministicWorkUnits: oneReplayWork,
      maxUniqueResults: 1000,
      maxUniqueSources: 1000
    });
    const db = readEnterpriseDb();

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [first.run, second.run],
      projects: [first.project, second.project],
      projectRevisions: db.projectRevisions,
      analysisRuns: db.analysisRuns,
      sourceVerificationCache: cache
    })).toThrow(expect.objectContaining({
      name: "SenaEnterpriseValidationRunIntegrityError",
      path: "result"
    }));
    expect(cache.deterministicWorkUnitsReserved).toBe(oneReplayWork);
    expect(cache.uniqueResultReservationCount).toBe(1);
    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [first.run],
      projects: [first.project],
      projectRevisions: db.projectRevisions,
      analysisRuns: db.analysisRuns,
      sourceVerificationCache: new SenaGroupComparisonSourceVerificationCache({
        maxDeterministicWorkUnits: oneReplayWork,
        maxUniqueResults: 1000,
        maxUniqueSources: 1000
      })
    })).not.toThrow();
  });

  it("admits every retained run carrier before replaying the first holder", () => {
    const fixture = createValidationEvidenceFixture("collection-two-phase", 20260827);
    const runs = Array.from({ length: 1000 }, (_unused, index) => {
      const candidate = {
        ...structuredClone(fixture.run),
        id: `validation-two-phase-${index}`
      };
      candidate.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(candidate);
      return candidate;
    });
    let unknownReads = 0;
    Object.defineProperty(runs[999], "unknownCarrierField", {
      enumerable: true,
      get() {
        unknownReads += 1;
        return { expensive: true };
      }
    });
    const db = readEnterpriseDb();
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs,
      projects: [fixture.project],
      projectRevisions: db.projectRevisions,
      analysisRuns: db.analysisRuns
    })).toThrow(/resourceAdmission|canonically bound/i);
    expect(unknownReads).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("rejects duplicate retained analysis IDs before replaying validation evidence", () => {
    const fixture = createValidationEvidenceFixture("duplicate-analysis-id", 20260828);
    const analysisRun = {
      id: "analysis-duplicate",
      teamId: fixture.project.teamId,
      projectId: fixture.project.id,
      artifactFingerprints: {
        reportSha256: "a".repeat(64),
        projectSnapshotSha256: "b".repeat(64),
        projectSnapshotBindingSha256: "c".repeat(64)
      }
    };
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [fixture.run],
      projects: [fixture.project],
      analysisRuns: [analysisRun, structuredClone(analysisRun)] as never
    })).toThrow(/resourceAdmission|canonically bound/i);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("rejects duplicate project identities before replaying validation evidence", () => {
    const fixture = createValidationEvidenceFixture("duplicate-project-id", 20260829);
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [fixture.run],
      projects: [fixture.project, structuredClone(fixture.project)],
      analysisRuns: []
    })).toThrow(/resourceAdmission|canonically bound/i);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("rejects duplicate exact retained revisions instead of choosing one", () => {
    const fixture = createValidationEvidenceFixture("duplicate-revision", 20260830);
    const db = readEnterpriseDb();
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === fixture.project.id &&
      candidate.version === fixture.run.projectBinding?.projectVersion
    ));
    if (!revision) throw new Error("Expected retained revision fixture.");
    const advancedProject = {
      ...structuredClone(fixture.project),
      currentVersion: fixture.project.currentVersion + 1
    };
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [fixture.run],
      projects: [advancedProject],
      projectRevisions: [revision, structuredClone(revision)],
      analysisRuns: []
    })).toThrow(expect.objectContaining({ path: "projectBinding" }));
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("scopes direct historical revision materialization to the bound project identity", () => {
    const fixture = createValidationEvidenceFixture("scoped-direct-revision", 20260831);
    const db = readEnterpriseDb();
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === fixture.project.id &&
      candidate.teamId === fixture.project.teamId &&
      candidate.version === fixture.run.projectBinding?.projectVersion
    ));
    if (!revision || !fixture.run.projectBinding) throw new Error("Expected retained revision binding fixture.");
    const advancedProject = {
      ...structuredClone(fixture.project),
      currentVersion: fixture.project.currentVersion + 1
    };
    const foreignSnapshot: Record<string, unknown> = {};
    foreignSnapshot.self = foreignSnapshot;
    const foreignRevision = {
      projectId: "foreign-project-that-must-not-be-materialized",
      teamId: "foreign-team-that-must-not-be-materialized",
      version: 1,
      snapshot: foreignSnapshot
    };

    expect(() => normalizeEnterpriseValidationRunEvidence(fixture.run, advancedProject, {
      evidenceHash: "optional",
      projectRevisions: [foreignRevision, revision] as never
    })).not.toThrow();
  });

  it("reuses one scoped historical revision index and snapshot cache across normalize and seal", () => {
    const fixture = createValidationEvidenceFixture("shared-direct-revision", 20260832);
    const db = readEnterpriseDb();
    const revision = db.projectRevisions.find((candidate) => (
      candidate.projectId === fixture.project.id &&
      candidate.teamId === fixture.project.teamId &&
      candidate.version === fixture.run.projectBinding?.projectVersion
    ));
    if (!revision || !fixture.run.projectBinding) throw new Error("Expected retained revision binding fixture.");
    const advancedProject = {
      ...structuredClone(fixture.project),
      currentVersion: fixture.project.currentVersion + 1
    };
    const foreignSnapshot: Record<string, unknown> = {};
    foreignSnapshot.self = foreignSnapshot;
    const revisions = [{
      projectId: "foreign-project-shared-index",
      teamId: "foreign-team-shared-index",
      version: 1,
      snapshot: foreignSnapshot
    }, revision] as never;
    const snapshotHashCache = new WeakMap<object, { bindingSha256: string }>();
    const projectRevisionIndex = new SenaEnterpriseValidationProjectRevisionIndex(
      revisions,
      snapshotHashCache,
      {
        projectId: fixture.project.id,
        teamId: fixture.project.teamId,
        version: fixture.run.projectBinding.projectVersion
      }
    );

    const normalized = normalizeEnterpriseValidationRunEvidence(fixture.run, advancedProject, {
      evidenceHash: "optional",
      projectRevisions: revisions,
      projectRevisionIndex,
      snapshotHashCache
    });
    expect(projectRevisionIndex.candidateInspectionCount).toBe(1);
    expect(snapshotHashCache.has(foreignSnapshot)).toBe(false);
    expect(() => sealEnterpriseValidationRunEvidence(normalized, advancedProject, {
      projectRevisions: revisions,
      projectRevisionIndex,
      snapshotHashCache
    })).not.toThrow();
    expect(projectRevisionIndex.candidateInspectionCount).toBe(1);
    expect(snapshotHashCache.has(foreignSnapshot)).toBe(false);
  });

  it("rejects oversized analysis identity text before building its index", () => {
    const fixture = createValidationEvidenceFixture("analysis-text-cap", 20260831);
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeEnterpriseValidationRunCollectionEvidence({
      runs: [fixture.run],
      projects: [fixture.project],
      analysisRuns: [{
        id: "a".repeat(4097),
        teamId: fixture.project.teamId,
        projectId: fixture.project.id,
        artifactFingerprints: {
          reportSha256: "a".repeat(64),
          projectSnapshotSha256: "b".repeat(64),
          projectSnapshotBindingSha256: "c".repeat(64)
        }
      }] as never
    })).toThrow(/resourceAdmission|canonically bound/i);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("builds one holder model for 1000 sealed runs sharing the same immutable snapshot", () => {
    const registered = registerEnterpriseUser({
      name: "Validation Replay Owner",
      email: "validation-replay-round25@example.edu",
      password: "sena-secure-123",
      organization: "Validation Replay Lab",
      plan: "lab"
    });
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
      title: "Validation replay fixture",
      generatedAt: "2026-08-25T00:00:00.000Z",
      sourceDataset: lessonStudySenaContract
    });
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Validation replay project",
      snapshot
    });
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const run = createEnterpriseValidationRun(registered.context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Replay-budget fixture.",
      methodNote: "Every run shares one immutable holder snapshot.",
      result
    });
    const db = readEnterpriseDb();
    db.validationRuns = Array.from({ length: 1000 }, (_unused, index) => {
      const candidate = {
        ...structuredClone(run),
        id: `validation-replay-${index}`
      };
      candidate.validationRunEvidenceHash = enterpriseValidationRunEvidenceHash(candidate);
      return candidate;
    });

    const dbWithoutValidationRuns = structuredClone(db);
    dbWithoutValidationRuns.validationRuns = [];
    modelReplayProbe.buildCount = 0;
    modelReplayProbe.maximumBuilds = Number.POSITIVE_INFINITY;
    expect(() => normalizeEnterpriseDb(dbWithoutValidationRuns)).not.toThrow();
    const nonValidationBuildCount = modelReplayProbe.buildCount;

    modelReplayProbe.buildCount = 0;
    modelReplayProbe.maximumBuilds = nonValidationBuildCount + 1;
    expect(() => normalizeEnterpriseDb(db)).not.toThrow();
    expect(modelReplayProbe.buildCount).toBe(nonValidationBuildCount + 1);
  });

  it("retains an analysis artifact while a sealed validation still references it", () => {
    const registered = registerEnterpriseUser({
      name: "Validation Anchor Owner",
      email: "validation-anchor-round25@example.edu",
      password: "sena-secure-123",
      organization: "Validation Anchor Lab",
      plan: "lab"
    });
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
      title: "Validation anchor fixture",
      generatedAt: "2026-08-25T00:00:00.000Z",
      sourceDataset: lessonStudySenaContract
    });
    const project = createEnterpriseProject(registered.context, {
      teamId: registered.context.teams[0].id,
      title: "Validation anchor project",
      snapshot
    });
    const analysisArtifact = buildSenaAnalysisRun({
      snapshot: project.snapshot,
      title: project.snapshot.title,
      generatedAt: project.snapshot.generatedAt,
      includeRuntimeBundle: false
    });
    const anchor = createEnterpriseAnalysisRun(registered.context, {
      teamId: project.teamId,
      projectId: project.id,
      run: analysisArtifact
    });
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const validation = createEnterpriseValidationRun(registered.context, {
      teamId: project.teamId,
      projectId: project.id,
      preregistrationNote: "Analysis-anchor retention fixture.",
      methodNote: "The exact analysis artifact remains resolvable while referenced.",
      result
    });
    expect(validation.parityEvidence?.walkthrough).toMatchObject({
      source: "analysis-run",
      sourceId: anchor.id
    });

    const db = readEnterpriseDb();
    db.analysisRuns = [
      ...Array.from({ length: 1000 }, (_unused, index) => ({
        ...structuredClone(anchor),
        id: `newer-unreferenced-analysis-${index}`,
        createdAt: `2026-08-25T01:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`
      })),
      anchor
    ];
    writeFileSync(
      path.join(enterpriseDbDir, "enterprise-db.json"),
      JSON.stringify(db)
    );

    createEnterpriseAnalysisRun(registered.context, {
      teamId: project.teamId,
      projectId: project.id,
      run: analysisArtifact
    });

    const retained = readEnterpriseDb();
    expect(retained.analysisRuns.some((candidate) => candidate.id === anchor.id)).toBe(true);
    expect(retained.analysisRuns.length).toBeLessThanOrEqual(2000);
  });

  it("ignores a well-formed subtree under an unknown source row key", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const dataset = structuredClone(lessonStudySenaContract) as typeof lessonStudySenaContract & {
      people: Array<(typeof lessonStudySenaContract.people)[number] & { unexpected?: unknown }>;
    };
    dataset.people[0].unexpected = Array.from({ length: 10_000 }, (_unused, index) => ({
      index,
      value: `well-formed-${index}`
    }));
    const cache = new SenaGroupComparisonSourceVerificationCache();
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset },
      cache
    )).not.toThrow();
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBeGreaterThan(0);
    expect(cache.sourceDigestScanCount).toBe(1);
    expect(cache.sourceDigestBytesReserved).toBeGreaterThan(0);
    expect(cache.sourceDigestWorkUnitsReserved).toBeGreaterThan(0);
    expect(modelReplayProbe.buildCount).toBe(1);
  });

  it("admits the complete result carrier before spending a near-budget source digest", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    }) as ReturnType<typeof buildSenaGroupComparisonSuite> & { unexpectedResultField?: unknown };
    result.unexpectedResultField = { structurallyValidButUnknown: true };
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceDigestWorkUnits: 1
    });
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      result,
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).toThrow(/validation result|suite|carrier|shape/i);
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBe(0);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it("charges failed digest traversal cumulatively instead of resetting the request budget", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const malformedDataset = structuredClone(lessonStudySenaContract);
    malformedDataset.codebook.at(-1)!.description += "\uD800";
    const probe = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(malformedDataset) },
      probe
    )).toThrow(/well-formed UTF-16/i);
    const oneFailedTraversal = probe.sourceDigestMeasurementWorkUnitsAttempted;
    expect(oneFailedTraversal).toBeGreaterThan(0);
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceDigestWorkUnits: oneFailedTraversal
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(malformedDataset) },
      cache
    )).toThrow(/well-formed UTF-16/i);
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBe(oneFailedTraversal);
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(malformedDataset) },
      cache
    )).toThrow(/source digest scan budget exceeded/i);
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBe(oneFailedTraversal);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(cache.sourceDigestWorkUnitsReserved).toBe(0);
  });

  it("charges a long malformed model-estimation string before validating its final surrogate", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const malformedDataset = structuredClone(lessonStudySenaContract);
    const malformedCode = `${"a".repeat(4096)}\uD800`;
    malformedDataset.coded_segments[0].codes[0] = malformedCode;
    const cache = new SenaGroupComparisonSourceVerificationCache({
      maxSourceDigestBytes: malformedCode.length
    });
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(malformedDataset) },
      cache
    )).toThrow(/well-formed UTF-16/i);
    expect(cache.sourceDigestMeasurementBytesAttempted).toBe(malformedCode.length);
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(malformedDataset) },
      cache
    )).toThrow(/source digest scan budget exceeded/i);
    expect(cache.sourceDigestMeasurementBytesAttempted).toBe(malformedCode.length);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });

  it.each([
    ["person group", (source: { dataset: typeof lessonStudySenaContract; buildOptions: { alpha: number } }) => {
      source.dataset.people[0].group = `${source.dataset.people[0].group} revised`;
    }],
    ["source text", (source: { dataset: typeof lessonStudySenaContract; buildOptions: { alpha: number } }) => {
      source.dataset.utterances[0].text = `${source.dataset.utterances[0].text} revised`;
    }],
    ["build option", (source: { dataset: typeof lessonStudySenaContract; buildOptions: { alpha: number } }) => {
      source.buildOptions.alpha = 0.25;
    }]
  ] as const)("rebinds a mutable same-identity holder after changing %s", (_label, mutate) => {
    const dataset = structuredClone(lessonStudySenaContract);
    const source = { dataset, buildOptions: { alpha: 1 } };
    const result = buildSenaGroupComparisonSuite({
      dataset,
      buildOptions: source.buildOptions,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(result, source, cache)).not.toThrow();
    const scansBeforeMutation = cache.sourceDigestScanCount;

    mutate(source);

    expect(() => normalizeSenaGroupComparisonValidationResult(result, source, cache)).toThrow(
      /does not match the holder dataset|source evidence/i
    );
    expect(cache.sourceDigestScanCount).toBe(scansBeforeMutation + 1);
  });

  it("canonicalizes an own undefined buildOptions field exactly like an absent field", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract) },
      cache
    )).not.toThrow();
    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: structuredClone(lessonStudySenaContract), buildOptions: undefined },
      cache
    )).not.toThrow();

    expect(cache.sourceDigestScanCount).toBe(2);
    expect(cache.uniqueSourceReservationCount).toBe(1);
    expect(cache.modelBuildCount).toBe(1);
    expect(cache.sourceEvidenceBuildCount).toBe(1);
    expect(cache.canonicalResultReplayCount).toBe(1);
  });

  it("rejects an oversized source array from its length descriptor without whole-carrier enumeration", () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: lessonStudySenaContract,
      defaultGroupField: "role",
      comparisons: [
        { groupA: "Lead teacher", groupB: "Curriculum designer", metric: "bridgeScore" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      alpha: 0.05
    });
    let ownKeyEnumerations = 0;
    const oversizedPeople = new Proxy(new Array(65_537), {
      ownKeys() {
        ownKeyEnumerations += 1;
        throw new Error("whole source array enumeration invoked");
      }
    });
    const dataset = {
      ...structuredClone(lessonStudySenaContract),
      people: oversizedPeople
    };
    const cache = new SenaGroupComparisonSourceVerificationCache();
    modelReplayProbe.buildCount = 0;

    expect(() => normalizeSenaGroupComparisonValidationResult(
      structuredClone(result),
      { dataset: dataset as never },
      cache
    )).toThrow(/source dataset carrier|bounded|source model work budget/i);
    expect(ownKeyEnumerations).toBe(0);
    expect(cache.sourceDigestMeasurementWorkUnitsAttempted).toBeGreaterThan(0);
    expect(cache.sourceDigestScanCount).toBe(0);
    expect(modelReplayProbe.buildCount).toBe(0);
  });
});
