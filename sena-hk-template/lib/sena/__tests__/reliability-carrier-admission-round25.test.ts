import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  type SenaCoderAnnotation,
  type SenaReliabilityDashboardV1
} from "../reliability";
import { SENA_LEGACY_SCHEMA_VERSIONS } from "../schema-registry";
import { buildSenaProjectSnapshot } from "../snapshot";

const annotations: SenaCoderAnnotation[] = [
  { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
  { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
  { coderId: "c1", itemId: "u2", codeId: "explanation", value: false },
  { coderId: "c2", itemId: "u2", codeId: "explanation", value: false }
];

function dashboard() {
  return buildSenaReliabilityDashboard(annotations);
}

function boundDashboard() {
  const snapshot = buildSenaProjectSnapshot(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-26T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
  const bound = bindSenaReliabilityAnnotationsToProject(annotations, {
    projectId: "project-reliability-carrier",
    projectVersion: 1,
    snapshot
  });
  return buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
}

function addUnknownGetter(target: object) {
  let reads = 0;
  Object.defineProperty(target, "unknownCarrierField", {
    enumerable: true,
    get() {
      reads += 1;
      return { recursively: { expensive: true } };
    }
  });
  return () => reads;
}

function historicalDashboard(): SenaReliabilityDashboardV1 {
  const pair = {
    coderA: "c1",
    coderB: "c2",
    units: 2,
    observedAgreement: 1,
    expectedAgreement: 0.5,
    kappa: 1
  };
  return {
    schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard,
    coderCount: 2,
    itemCount: 2,
    codeCount: 1,
    binaryUnitCount: 2,
    pairwiseCohenKappa: [pair],
    codeDiagnostics: [{
      codeId: "evidence",
      unitCount: 2,
      positiveAssignments: 2,
      disagreementCount: 0,
      agreementRate: 1,
      coderPositiveRates: { c1: 0.5, c2: 0.5 },
      pairwiseCohenKappa: [pair]
    }],
    meanPairwiseKappa: 1,
    krippendorffAlphaNominal: 1,
    disagreementCount: 0,
    adjudicationQueue: [],
    interpretation: "Historical carrier fixture.",
    warnings: []
  };
}

describe("reliability dashboard raw-carrier admission", () => {
  it("rejects an unknown current-dashboard field without reading its value", () => {
    const candidate = dashboard();
    const reads = addUnknownGetter(candidate);

    expect(() => normalizeSenaReliabilityDashboard(candidate)).toThrow(/reliability dashboard/i);
    expect(reads()).toBe(0);
  });

  it("rejects an unknown derivation annotation field before hashing it", () => {
    const candidate = dashboard();
    const reads = addUnknownGetter(candidate.derivationEvidence!.annotations[0]);

    expect(() => normalizeSenaReliabilityDashboard(candidate)).toThrow(/reliability dashboard/i);
    expect(reads()).toBe(0);
  });

  it("rejects an unknown project-binding row field before sorting or hashing it", () => {
    const candidate = boundDashboard();
    const reads = addUnknownGetter(candidate.projectBinding!.codebookUniverse[0]);

    expect(() => normalizeSenaReliabilityDashboard(candidate)).toThrow(/reliability dashboard/i);
    expect(reads()).toBe(0);
  });

  it("rejects unknown current pair, raw, diagnostic, and coder-rate fields", () => {
    const targets = [
      (candidate: ReturnType<typeof dashboard>) => candidate.pairwiseCohenKappa[0],
      (candidate: ReturnType<typeof dashboard>) => candidate.pairwiseCohenKappa[0].raw,
      (candidate: ReturnType<typeof dashboard>) => candidate.codeDiagnostics[0],
      (candidate: ReturnType<typeof dashboard>) => candidate.codeDiagnostics[0].coderPositiveRates
    ];
    for (const select of targets) {
      const candidate = dashboard();
      const reads = addUnknownGetter(select(candidate));
      expect(() => normalizeSenaReliabilityDashboard(candidate)).toThrow(/reliability dashboard/i);
      expect(reads()).toBe(0);
    }
  });

  it("rejects an oversized blocker collection before reading an entry", () => {
    const candidate = dashboard();
    const blockers = Array.from({ length: 8 }, () => "blocked");
    let reads = 0;
    Object.defineProperty(blockers, 0, {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        return "blocked";
      }
    });
    candidate.claimEligibility.blockers = blockers;

    expect(() => normalizeSenaReliabilityDashboard(candidate)).toThrow(/reliability dashboard/i);
    expect(reads).toBe(0);
  });

  it("rejects unknown legacy top-level and diagnostic fields before spreading them", () => {
    const top = historicalDashboard();
    const topReads = addUnknownGetter(top);
    expect(() => normalizeSenaReliabilityDashboard(top)).toThrow(/reliability dashboard/i);
    expect(topReads()).toBe(0);

    const nested = historicalDashboard();
    const nestedReads = addUnknownGetter(nested.codeDiagnostics[0]);
    expect(() => normalizeSenaReliabilityDashboard(nested)).toThrow(/reliability dashboard/i);
    expect(nestedReads()).toBe(0);
  });

  it("round-trips a previously admitted identifier longer than 4 KiB", () => {
    const longCoderId = "c".repeat(4_097);
    const candidate = buildSenaReliabilityDashboard([
      { coderId: longCoderId, itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
      { coderId: longCoderId, itemId: "u2", codeId: "evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
    ]);

    expect(normalizeSenaReliabilityDashboard(candidate)).toEqual(candidate);
  });
});
