import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const modelReplayProbe = vi.hoisted(() => ({
  buildCount: 0,
  maximumBuilds: Number.POSITIVE_INFINITY
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

import {
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
  SenaEnterpriseValidationAnalysisRunIndex
} from "../enterprise/validation-integrity";
import {
  estimateSenaGroupComparisonSourceModelWorkUnits,
  normalizeSenaGroupComparisonValidationResult,
  SenaGroupComparisonSourceVerificationCache
} from "../inference";

let enterpriseDbDir = "";
const previousEnterpriseDbDir = process.env.SENA_ENTERPRISE_DB_DIR;

beforeAll(() => {
  enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-validation-replay-round25-"));
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
});

beforeEach(() => {
  modelReplayProbe.buildCount = 0;
  modelReplayProbe.maximumBuilds = Number.POSITIVE_INFINITY;
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

  it("indexes same-id analysis candidates by the complete binding key", () => {
    const artifactHash = "a".repeat(64);
    let bindingPropertyReads = 0;
    const runs = Array.from({ length: 1000 }, (_unused, candidateIndex) => {
      const target = candidateIndex === 999;
      const artifactFingerprints = {
        projectSnapshotSha256: "f".repeat(64)
      } as {
        projectSnapshotSha256: string;
        projectSnapshotBindingSha256: string;
      };
      Object.defineProperty(artifactFingerprints, "projectSnapshotBindingSha256", {
        enumerable: true,
        get() {
          bindingPropertyReads += 1;
          return target ? artifactHash : String(candidateIndex).padStart(64, "0");
        }
      });
      const candidate = {
        id: "shared-analysis-id",
        artifactFingerprints
      } as {
        id: string;
        teamId: string;
        projectId: string;
        persistedProjectId?: string;
        artifactFingerprints: {
          projectSnapshotSha256: string;
          projectSnapshotBindingSha256: string;
        };
      };
      Object.defineProperties(candidate, {
        teamId: {
          enumerable: true,
          get() {
            bindingPropertyReads += 1;
            return target ? "team-target" : `team-foreign-${candidateIndex}`;
          }
        },
        projectId: {
          enumerable: true,
          get() {
            bindingPropertyReads += 1;
            return target ? "project-target" : `project-foreign-${candidateIndex}`;
          }
        },
        persistedProjectId: {
          enumerable: true,
          get() {
            bindingPropertyReads += 1;
            return undefined;
          }
        }
      });
      return candidate;
    });
    const index = new SenaEnterpriseValidationAnalysisRunIndex(runs as never[]);

    for (let lookup = 0; lookup < 1000; lookup += 1) {
      expect(index.matchingCount({
        id: "shared-analysis-id",
        teamId: "team-target",
        projectId: "project-target",
        projectSnapshotArtifactSha256: artifactHash
      })).toBe(1);
    }
    expect(index.candidateInspectionCount).toBe(1000);
    expect(index.lookupCount).toBe(1000);
    expect(bindingPropertyReads).toBeLessThanOrEqual(5000);
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
});
