import { describe, expect, it, vi } from "vitest";
import {
  SenaInputValidationError
} from "../analytical-input-validation";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { createEmptySenaDataset, importSenaJsonContract } from "../import";
import { importSenaEnterpriseFiles } from "../import-adapters";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket } from "../review-packet";
import { buildSenaRuntimeBundle } from "../runtime-bundle";
import {
  assertSenaProjectSnapshotPublicationDerivationWorkBudget,
  assertSenaProjectSnapshotAdmission,
  buildSenaProjectSnapshot,
  importSenaProjectSnapshot
} from "../snapshot";
import { senaReliabilitySnapshotFingerprint } from "../reliability";
import { buildSenaTemporalRuntimeTrace } from "../temporal-runtime";
import type { SenaProjectSnapshot } from "../types";

function validSnapshot(): SenaProjectSnapshot {
  const dataset = structuredClone(lessonStudySenaContract);
  const model = buildSenaModel(dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Round 9 canonical snapshot",
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: dataset,
    activeTemporalWindow: model.temporal.windows[0] ?? null
  });
}

function nonJsonValuePaths(value: unknown) {
  const paths: string[] = [];
  const visit = (candidate: unknown, path: string) => {
    if (candidate === undefined ||
      (typeof candidate === "number" && !Number.isFinite(candidate)) ||
      typeof candidate === "bigint" ||
      typeof candidate === "symbol" ||
      typeof candidate === "function") {
      paths.push(`${path}=${String(candidate)} (${typeof candidate})`);
      return;
    }
    if (candidate === null || typeof candidate !== "object") return;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(candidate))) {
      if (descriptor.enumerable && "value" in descriptor) {
        visit(descriptor.value, `${path}.${key}`);
      }
    }
  };
  visit(value, "$snapshot");
  return paths;
}

type InvalidCase = {
  label: string;
  mutate: (snapshot: SenaProjectSnapshot) => void;
  issue: { path: string; rule: string };
};

const invalidCases: InvalidCase[] = [
  {
    label: "null people row",
    mutate: (snapshot) => { snapshot.dataset.people[0] = null as never; },
    issue: { path: "dataset.people[0]", rule: "object" }
  },
  {
    label: "unknown person source field",
    mutate: (snapshot) => {
      (snapshot.dataset.people[0] as unknown as Record<string, unknown>).unexpected = "ignored-field";
    },
    issue: { path: "dataset.people[0].unexpected", rule: "supported-value" }
  },
  {
    label: "duplicate person id",
    mutate: (snapshot) => { snapshot.dataset.people[1].id = snapshot.dataset.people[0].id; },
    issue: { path: "dataset.people[1].id", rule: "distinct-values" }
  },
  {
    label: "noncanonical person id whitespace",
    mutate: (snapshot) => { snapshot.dataset.people[0].id = ` ${snapshot.dataset.people[0].id} `; },
    issue: { path: "dataset.people[0].id", rule: "canonical-string" }
  },
  {
    label: "interaction person reference",
    mutate: (snapshot) => { snapshot.dataset.interactions[0].source = "person-does-not-exist"; },
    issue: { path: "dataset.interactions[0].source", rule: "reference" }
  },
  {
    label: "noncanonical interaction reference whitespace",
    mutate: (snapshot) => { snapshot.dataset.interactions[0].source = ` ${snapshot.dataset.interactions[0].source} `; },
    issue: { path: "dataset.interactions[0].source", rule: "canonical-string" }
  },
  {
    label: "noncanonical utterance id whitespace",
    mutate: (snapshot) => { snapshot.dataset.utterances[0].id = ` ${snapshot.dataset.utterances[0].id} `; },
    issue: { path: "dataset.utterances[0].id", rule: "canonical-string" }
  },
  {
    label: "noncanonical utterance person reference whitespace",
    mutate: (snapshot) => { snapshot.dataset.utterances[0].personId = ` ${snapshot.dataset.utterances[0].personId} `; },
    issue: { path: "dataset.utterances[0].personId", rule: "canonical-string" }
  },
  {
    label: "utterance person reference",
    mutate: (snapshot) => { snapshot.dataset.utterances[0].personId = "person-does-not-exist"; },
    issue: { path: "dataset.utterances[0].personId", rule: "reference" }
  },
  {
    label: "fractional utterance turn",
    mutate: (snapshot) => { snapshot.dataset.utterances[0].turnIndex = 1.5; },
    issue: { path: "dataset.utterances[0].turnIndex", rule: "integer-range" }
  },
  {
    label: "coded segment utterance reference",
    mutate: (snapshot) => { snapshot.dataset.coded_segments[0].utteranceId = "utterance-does-not-exist"; },
    issue: { path: "dataset.coded_segments[0].utteranceId", rule: "reference" }
  },
  {
    label: "coded segment code reference",
    mutate: (snapshot) => { snapshot.dataset.coded_segments[0].codes = ["code-does-not-exist"]; },
    issue: { path: "dataset.coded_segments[0].codes[0]", rule: "reference" }
  },
  {
    label: "noncanonical coded segment id whitespace",
    mutate: (snapshot) => { snapshot.dataset.coded_segments[0].segmentId = ` ${snapshot.dataset.coded_segments[0].segmentId} `; },
    issue: { path: "dataset.coded_segments[0].segmentId", rule: "canonical-string" }
  },
  {
    label: "noncanonical coded utterance reference whitespace",
    mutate: (snapshot) => { snapshot.dataset.coded_segments[0].utteranceId = ` ${snapshot.dataset.coded_segments[0].utteranceId} `; },
    issue: { path: "dataset.coded_segments[0].utteranceId", rule: "canonical-string" }
  },
  {
    label: "noncanonical coded person reference whitespace",
    mutate: (snapshot) => { snapshot.dataset.coded_segments[0].personId = ` ${snapshot.dataset.coded_segments[0].personId} `; },
    issue: { path: "dataset.coded_segments[0].personId", rule: "canonical-string" }
  },
  {
    label: "noncanonical coded code reference whitespace",
    mutate: (snapshot) => { snapshot.dataset.coded_segments[0].codes[0] = ` ${snapshot.dataset.coded_segments[0].codes[0]} `; },
    issue: { path: "dataset.coded_segments[0].codes[0]", rule: "canonical-string" }
  },
  {
    label: "null codebook row",
    mutate: (snapshot) => { snapshot.dataset.codebook[0] = null as never; },
    issue: { path: "dataset.codebook[0]", rule: "object" }
  },
  {
    label: "noncanonical code id whitespace",
    mutate: (snapshot) => { snapshot.dataset.codebook[0].id = ` ${snapshot.dataset.codebook[0].id} `; },
    issue: { path: "dataset.codebook[0].id", rule: "canonical-string" }
  },
  {
    label: "source dataset count mismatch",
    mutate: (snapshot) => { snapshot.source.sourceDatasetCounts.people += 1; },
    issue: { path: "source.sourceDatasetCounts.people", rule: "count-match" }
  },
  {
    label: "noncanonical source person id whitespace",
    mutate: (snapshot) => {
      if (!snapshot.source.sourceDataset) throw new Error("fixture source dataset missing");
      snapshot.source.sourceDataset.people[0].id = ` ${snapshot.source.sourceDataset.people[0].id} `;
    },
    issue: { path: "source.sourceDataset.people[0].id", rule: "canonical-string" }
  },
  {
    label: "noncanonical source reference whitespace",
    mutate: (snapshot) => {
      if (!snapshot.source.sourceDataset) throw new Error("fixture source dataset missing");
      snapshot.source.sourceDataset.interactions[0].target = ` ${snapshot.source.sourceDataset.interactions[0].target} `;
    },
    issue: { path: "source.sourceDataset.interactions[0].target", rule: "canonical-string" }
  },
  {
    label: "malformed temporal window string array",
    mutate: (snapshot) => {
      if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
      snapshot.source.activeTemporalWindow.stages = [null] as never;
    },
    issue: { path: "source.activeTemporalWindow.stages[0]", rule: "nonempty-string" }
  },
  {
    label: "noncanonical temporal window stage whitespace",
    mutate: (snapshot) => {
      if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
      snapshot.source.activeTemporalWindow.stages[0] = ` ${snapshot.source.activeTemporalWindow.stages[0]} `;
    },
    issue: { path: "source.activeTemporalWindow.stages[0]", rule: "canonical-string" }
  },
  {
    label: "noncanonical temporal window utterance id whitespace",
    mutate: (snapshot) => {
      if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
      snapshot.source.activeTemporalWindow.utteranceIds[0] = ` ${snapshot.source.activeTemporalWindow.utteranceIds[0]} `;
    },
    issue: { path: "source.activeTemporalWindow.utteranceIds[0]", rule: "canonical-string" }
  },
  {
    label: "noncanonical temporal window segment id whitespace",
    mutate: (snapshot) => {
      if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
      snapshot.source.activeTemporalWindow.segmentIds[0] = ` ${snapshot.source.activeTemporalWindow.segmentIds[0]} `;
    },
    issue: { path: "source.activeTemporalWindow.segmentIds[0]", rule: "canonical-string" }
  },
  {
    label: "out of range normalized temporal metric",
    mutate: (snapshot) => {
      if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
      snapshot.source.activeTemporalWindow.socialConnectivity = 1.5;
    },
    issue: { path: "source.activeTemporalWindow.socialConnectivity", rule: "finite-range" }
  }
];

describe("Round 9 canonical snapshot input contract", () => {
  it("enforces direct string depth admission before invoking JSON.parse", () => {
    const parse = vi.spyOn(JSON, "parse");
    const excessiveDepth = `${"[".repeat(65)}null${"]".repeat(65)}`;
    try {
      expect(() => importSenaProjectSnapshot(excessiveDepth)).toThrow(/structural admission limit/i);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("applies the same 64-container depth ceiling to direct objects", () => {
    let excessiveDepth: unknown = null;
    for (let depth = 0; depth < 65; depth += 1) excessiveDepth = [excessiveDepth];

    expect(() => assertSenaProjectSnapshotAdmission(excessiveDepth)).toThrow(
      /structural admission limit/i
    );
  });

  it("allows shared aliases but rejects a true object cycle before structuredClone", () => {
    const aliased = validSnapshot() as SenaProjectSnapshot & Record<string, unknown>;
    const shared = { evidence: "shared immutable carrier" };
    aliased.aliasA = shared;
    aliased.aliasB = shared;
    expect(importSenaProjectSnapshot(aliased)).toMatchObject({ aliasA: shared, aliasB: shared });

    const cyclic = validSnapshot() as SenaProjectSnapshot & Record<string, unknown>;
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    cyclic.cycle = cycle;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(cyclic)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("charges shared alias DAGs by their bounded JSON expansion before structuredClone", () => {
    const snapshot = validSnapshot() as SenaProjectSnapshot & Record<string, unknown>;
    let expandedAlias: Record<string, unknown> = { evidence: "bounded leaf" };
    for (let depth = 0; depth < 21; depth += 1) {
      expandedAlias = { left: expandedAlias, right: expandedAlias };
    }
    snapshot.expandedAlias = expandedAlias;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it.each([
    ["symbol", Symbol("not-json")],
    ["bigint", BigInt(1)],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["function", () => "not-json"]
  ])("rejects a non-JSON %s value before structuredClone", (_label, invalidValue) => {
    const snapshot = validSnapshot() as SenaProjectSnapshot & Record<string, unknown>;
    snapshot.invalidJsonValue = invalidValue;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("rejects an own enumerable undefined member before structuredClone", () => {
    const snapshot = validSnapshot() as SenaProjectSnapshot & Record<string, unknown>;
    expect(nonJsonValuePaths(snapshot)).toEqual([]);
    snapshot.undefinedCarrier = undefined;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("keeps the current edge-free builder JSON-admissible and round-trippable", () => {
    const dataset = createEmptySenaDataset();
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
      title: "Round 9 edge-free canonical snapshot",
      generatedAt: "2026-08-25T00:00:00.000Z",
      sourceDataset: dataset
    });

    expect(nonJsonValuePaths(snapshot)).toEqual([]);
    expect(importSenaProjectSnapshot(snapshot)).toEqual(snapshot);
    expect(importSenaProjectSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("keeps optional-free CSV and untimestamped transcript imports JSON-admissible through snapshot round-trip", async () => {
    const upload = (name: string, text: string) => ({
      name,
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer
    });
    const csv = await importSenaEnterpriseFiles([
      upload("people.csv", "id,label\nP1,Alice\nP2,Bob"),
      upload("interactions.csv", "source,target,weight,channel,stage,evidence\nP1,P2,1,discussion,Teach,Alice replies"),
      upload("utterances.csv", "id,personId,unitId,stanzaId,stage,turnIndex,text\nU1,P1,L1,S1,Teach,1,Evidence offered"),
      upload("coded_segments.csv", "segmentId,utteranceId,personId,unitId,stanzaId,stage,turnIndex,text,codes\nS1,U1,P1,L1,S1,Teach,1,Evidence offered,Evidence"),
      upload("codebook.csv", "id,label\nEvidence,Evidence")
    ]);
    const transcript = await importSenaEnterpriseFiles([
      upload("lesson.txt", "Alice: [Evidence] I found a pattern.\nBob: [Explanation] The pattern follows the example.")
    ]);

    for (const [label, dataset] of [["csv", csv.dataset], ["transcript", transcript.dataset]] as const) {
      const timelineModel = buildSenaModel(dataset);
      const snapshot = buildSenaProjectSnapshot(timelineModel, {
        title: `Round 9 ${label} JSON carrier`,
        generatedAt: "2026-08-25T00:00:00.000Z",
        sourceDataset: dataset
      });
      expect(nonJsonValuePaths(snapshot)).toEqual([]);
      expect(importSenaProjectSnapshot(snapshot)).toEqual(snapshot);
      expect(importSenaProjectSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);

      const activeWindow = timelineModel.temporal.windows[0];
      if (!activeWindow) throw new Error(`${label} fixture did not produce an active window.`);
      const activeSnapshot = buildSenaProjectSnapshot(
        buildSenaModel(scopeSenaDatasetToWindow(dataset, activeWindow), timelineModel.options),
        {
          title: `Round 9 ${label} active-window JSON carrier`,
          generatedAt: "2026-08-25T00:00:00.000Z",
          sourceDataset: dataset,
          activeTemporalWindow: activeWindow
        }
      );
      expect(nonJsonValuePaths(activeSnapshot)).toEqual([]);
      expect(importSenaProjectSnapshot(activeSnapshot)).toEqual(activeSnapshot);
      expect(importSenaProjectSnapshot(JSON.stringify(activeSnapshot))).toEqual(activeSnapshot);
    }

    const sparseModel = buildSenaModel(csv.dataset);
    const carrierOptions = {
      title: "Round 9 sparse wrapper JSON carrier",
      generatedAt: "2026-08-25T00:00:00.000Z",
      sourceDataset: csv.dataset
    };
    expect(nonJsonValuePaths(buildSenaRuntimeBundle(sparseModel, carrierOptions))).toEqual([]);
    expect(nonJsonValuePaths(buildSenaReviewPacket(sparseModel, carrierOptions))).toEqual([]);
  });

  it.each([
    {
      label: "nonfinite interaction weight",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.dataset.interactions[0].weight = Number.POSITIVE_INFINITY;
      }
    },
    {
      label: "NaN confidence",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.dataset.coded_segments[0].confidence = Number.NaN;
      }
    },
    {
      label: "overflow temporal window turn",
      mutate: (snapshot: SenaProjectSnapshot) => {
        if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
        snapshot.source.activeTemporalWindow.startTurn = JSON.parse("1e309") as number;
      }
    }
  ])("rejects a direct-object $label at structural admission", ({ mutate }) => {
    const snapshot = validSnapshot();
    mutate(snapshot);
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("rejects a parsed overflow number before clone or canonical hashing", () => {
    const serialized = JSON.stringify(validSnapshot());
    const source = `${serialized.slice(0, -1)},"overflowNumber":1e999}`;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(source)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("rejects sparse direct arrays before structuredClone", () => {
    const sparse = validSnapshot();
    sparse.analysis.pairReport = new Array(16) as never;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(sparse)).toThrow(/structural admission limit/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it.each(["analysis", "report"] as const)(
    "rejects tiny-dataset oversized %s matrix payloads before structuredClone",
    (holder) => {
      const snapshot = validSnapshot();
      const matrices = holder === "analysis" ? snapshot.analysis.matrices : snapshot.report.matrices;
      matrices.S.raw = Array.from({ length: 1_000 }, () => [0]);
      const clone = vi.spyOn(globalThis, "structuredClone");
      try {
        expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
          /persisted analysis does not match the canonical dataset and build options/i
        );
        expect(clone).not.toHaveBeenCalled();
      } finally {
        clone.mockRestore();
      }
    }
  );

  it("rejects a connected active-code worst case before rebuilding the model", () => {
    const snapshot = validSnapshot();
    snapshot.dataset.codebook = Array.from({ length: 100 }, (_, index) => ({
      id: `active-code-${index}`,
      label: `Active code ${index}`,
      family: "Admission fixture",
      description: "Every declared code is connected in one segment.",
      color: "#64748b"
    }));
    snapshot.dataset.coded_segments[0].codes = snapshot.dataset.codebook.map((code) => code.id);
    snapshot.source.sourceDataset = structuredClone(snapshot.dataset);
    snapshot.source.sourceDatasetCounts.codes = 100;
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/canonical analysis work budget/i);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("counts every active-window baseline rebuild in the cumulative route reservation", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    const model = buildSenaModel(dataset);
    const snapshot = buildSenaProjectSnapshot(model, {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: dataset,
      activeTemporalWindow: model.temporal.windows[0] ?? null,
      nullModelIterations: 1
    });
    const extraSegments = Array.from({ length: 184 }, (_, index) => ({
      ...structuredClone(snapshot.dataset.coded_segments[0]),
      segmentId: `active-budget-segment-${index}`
    }));
    snapshot.dataset.coded_segments.push(...extraSegments);
    snapshot.source.sourceDataset?.coded_segments.push(...structuredClone(extraSegments));
    snapshot.source.sourceDatasetCounts.codedSegments += extraSegments.length;

    const withoutActiveWindow = structuredClone(snapshot);
    withoutActiveWindow.source.activeTemporalWindow = null;
    expect(() => assertSenaProjectSnapshotPublicationDerivationWorkBudget(
      withoutActiveWindow,
      { scope: "route-request" }
    )).not.toThrow();
    expect(() => assertSenaProjectSnapshotPublicationDerivationWorkBudget(
      snapshot,
      { scope: "route-request" }
    )).toThrow(/canonical analysis work budget/i);
  });

  it("requires current-v2 root data governance to match the report exactly", () => {
    const missing = validSnapshot();
    delete (missing as Partial<SenaProjectSnapshot>).dataGovernance;
    expect(() => importSenaProjectSnapshot(missing)).toThrow(/data-governance|dataGovernance/i);

    const conflicting = validSnapshot();
    if (!conflicting.dataGovernance) throw new Error("Snapshot fixture has no root governance.");
    conflicting.dataGovernance = structuredClone(conflicting.dataGovernance);
    conflicting.dataGovernance.dataSteward = "Conflicting root steward";
    expect(() => importSenaProjectSnapshot(conflicting)).toThrow(/conflicting current data-governance provenance/i);
  });

  it("rejects a stale current-v2 full-source temporal trace", () => {
    const snapshot = validSnapshot();
    const firstWindow = snapshot.analysis.temporalRuntimeTrace?.windows[0];
    if (!firstWindow) throw new Error("Snapshot fixture has no temporal runtime window.");
    firstWindow.window.label = `${firstWindow.window.label} (stale)`;
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("requires the full-source temporal trace for every current-v2 snapshot", () => {
    const snapshot = validSnapshot();
    delete snapshot.analysis.temporalRuntimeTrace;

    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
      /temporalRuntimeTrace|required.*temporal runtime trace|persisted analysis/i
    );
  });

  it("binds the current-v2 temporal trace timestamp to snapshot provenance", () => {
    const snapshot = validSnapshot();
    if (!snapshot.analysis.temporalRuntimeTrace) {
      throw new Error("Snapshot fixture has no temporal runtime trace.");
    }
    snapshot.analysis.temporalRuntimeTrace.generatedAt = "2026-08-21T00:00:01.000Z";

    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("builds snapshot trace provenance from the canonical snapshot clock", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    const model = buildSenaModel(dataset);
    const attackerTrace = buildSenaTemporalRuntimeTrace(dataset, model.options, {
      generatedAt: "2099-01-01T00:00:00.000Z"
    });
    const snapshot = buildSenaProjectSnapshot(model, {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: dataset,
      temporalRuntimeTrace: attackerTrace
    });

    expect(snapshot.analysis.temporalRuntimeTrace?.generatedAt).toBe(snapshot.generatedAt);
    expect(snapshot.analysis.temporalRuntimeTrace).not.toEqual(attackerTrace);
  });

  it.each([
    {
      label: "null-model sample",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.report.validation.nullModels.permutation.samplesPreview[0] += 0.25;
      }
    },
    {
      label: "social-community figure",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.report.figures.socialCommunities[0].label =
          `${snapshot.report.figures.socialCommunities[0].label} (forged)`;
      }
    },
    {
      label: "visual-grammar figure",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.report.figures.visualGrammar[0].label =
          `${snapshot.report.figures.visualGrammar[0].label} (forged)`;
      }
    },
    {
      label: "model-card deterministic evidence",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.report.modelCard.sections[0].evidence.push("forged-ready-evidence");
      }
    },
    {
      label: "completeness cache",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.report.completenessAudit.items[0].summary = "Forged complete cache.";
      }
    },
    {
      label: "pilot-readiness cache",
      mutate: (snapshot: SenaProjectSnapshot) => {
        snapshot.report.pilotReadinessAudit.items[0].summary = "Forged ready cache.";
      }
    }
  ])("rejects forged deterministic current-v2 $label", ({ mutate }) => {
    const snapshot = validSnapshot();
    mutate(snapshot);

    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("does not let authoritative review reconciliation hide forged unrelated model-card evidence", () => {
    const snapshot = validSnapshot();
    snapshot.report.humanReview = {
      ...snapshot.report.humanReview,
      status: "human-reviewed",
      reviewer: "",
      interpretation: "",
      limitations: "",
      nextActions: ""
    };
    const unrelatedSection = snapshot.report.modelCard.sections.find(
      (section) => section.id === "validation"
    ) ?? snapshot.report.modelCard.sections[0];
    unrelatedSection.evidence.push("forged-unrelated-ready-evidence");

    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("rejects non-enumerable accessors before structuredClone without invoking the getter", () => {
    const snapshot = validSnapshot() as SenaProjectSnapshot & Record<string, unknown>;
    let getterCalls = 0;
    Object.defineProperty(snapshot, "hiddenAccessor", {
      configurable: true,
      enumerable: false,
      get() {
        getterCalls += 1;
        return "not-json-data";
      }
    });
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/structural admission|JSON-compatible/i);
      expect(getterCalls).toBe(0);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it("documents the runtime Proxy boundary and rejects before clone or derivation", () => {
    const snapshot = validSnapshot();
    let ownKeysTrapCalls = 0;
    const proxy = new Proxy(snapshot, {
      ownKeys(target) {
        ownKeysTrapCalls += 1;
        return Reflect.ownKeys(target);
      }
    });
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() => importSenaProjectSnapshot(proxy)).toThrow(/structural admission|JSON-compatible|clone/i);
      const nodeProxyDetectorAvailable = typeof process.getBuiltinModule === "function" &&
        Boolean((process.getBuiltinModule("node:util") as typeof import("node:util")).types?.isProxy);
      // Node's trap-free detector rejects before introspection. Browser/client
      // runtimes have no universal detector, so their strongest descriptor
      // checks may execute ownKeys while still rejecting before clone/model.
      if (nodeProxyDetectorAvailable) expect(ownKeysTrapCalls).toBe(0);
      else expect(ownKeysTrapCalls).toBeGreaterThan(0);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it.each([
    {
      label: "active-window comparison",
      mutate: (snapshot: SenaProjectSnapshot) => {
        const comparison = snapshot.report.figures.activeWindowComparison;
        if (!comparison) throw new Error("Snapshot fixture has no active-window comparison.");
        comparison.metrics[0].current += 1;
      }
    },
    {
      label: "temporal runtime narrative",
      mutate: (snapshot: SenaProjectSnapshot) => {
        const narrative = snapshot.report.figures.temporalRuntimeNarrative[0];
        if (!narrative) throw new Error("Snapshot fixture has no temporal runtime narrative.");
        narrative.label = `${narrative.label} (stale)`;
      }
    }
  ])("rejects stale scoped temporal evidence in the $label", ({ mutate }) => {
    const snapshot = validSnapshot();
    mutate(snapshot);
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("rejects tampered ENA positions even when the manifest remains structurally valid", () => {
    const snapshot = validSnapshot();
    const outputs = snapshot.report.enaManifest.outputs;
    if (!outputs) throw new Error("Snapshot fixture has no ENA outputs.");
    const firstPosition = outputs.nodePositions[0];
    if (!firstPosition) throw new Error("Snapshot fixture has no ENA position.");
    const coordinate = Object.keys(firstPosition).find((key) => typeof firstPosition[key] === "number");
    if (!coordinate) throw new Error("Snapshot fixture ENA position has no numeric coordinate.");
    firstPosition[coordinate] = (firstPosition[coordinate] as number) + 0.125;
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("rejects stale evidence snippets after a coordinated dataset and run-identity change", () => {
    const original = validSnapshot();
    const changedDataset = structuredClone(lessonStudySenaContract);
    changedDataset.utterances[0].text = `${changedDataset.utterances[0].text} Canonical evidence changed.`;
    changedDataset.coded_segments[0].text =
      `${changedDataset.coded_segments[0].text} Canonical evidence changed.`;
    const changedModel = buildSenaModel(changedDataset);
    const changed = buildSenaProjectSnapshot(changedModel, {
      title: original.title,
      generatedAt: original.generatedAt,
      sourceDataset: changedDataset,
      activeTemporalWindow: changedModel.temporal.windows[0] ?? null
    });
    changed.report.evidenceSnippets = structuredClone(original.report.evidenceSnippets);

    expect(() => importSenaProjectSnapshot(changed)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it.each(invalidCases)("rejects $label with a sanitized typed issue", ({ mutate, issue }) => {
    const snapshot = validSnapshot();
    mutate(snapshot);

    let thrown: unknown;
    try {
      importSenaProjectSnapshot(snapshot);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SenaInputValidationError);
    expect((thrown as SenaInputValidationError).issues).toContainEqual(issue);
    expect(JSON.stringify(thrown)).not.toContain("person-does-not-exist");
    expect(JSON.stringify(thrown)).not.toContain("utterance-does-not-exist");
    expect(JSON.stringify(thrown)).not.toContain("code-does-not-exist");
    expect(JSON.stringify(thrown)).not.toContain("Infinity");
    expect(JSON.stringify(thrown)).not.toContain("NaN");
  });

  it("does not fingerprint an invalid nonfinite source value as JSON null", () => {
    const nonfinite = validSnapshot();
    const explicitNull = validSnapshot();
    if (!nonfinite.source.sourceDataset || !explicitNull.source.sourceDataset) throw new Error("fixture source missing");
    nonfinite.source.sourceDataset.interactions[0].weight = Number.POSITIVE_INFINITY;
    explicitNull.source.sourceDataset.interactions[0].weight = null as never;

    expect(senaReliabilitySnapshotFingerprint(nonfinite)).not.toBe(
      senaReliabilitySnapshotFingerprint(explicitNull)
    );
  });

  it("bounds canonical validation evidence for a compact high-fan-out invalid snapshot", () => {
    const snapshot = validSnapshot();
    snapshot.dataset.people = Array.from({ length: 1_100 }, () => ({})) as never;

    let thrown: unknown;
    try {
      importSenaProjectSnapshot(snapshot);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/canonical analysis work budget/i);
    expect((thrown as Error).message.length).toBeLessThan(1_000);
  });

  it("round-trips dangling target claims without inventing Ghost or changing the snapshot fingerprint", () => {
    const imported = importSenaJsonContract(JSON.stringify({
      people: [
        { person_id: "P1", label: "Ada", role: "teacher", group: "lesson-study" },
        { person_id: "P2", label: "Ben", role: "teacher", group: "lesson-study" }
      ],
      interactions: [
        { source: "P1", target: "Ghost", weight: 1, channel: "reply", stage: "Reflect", evidence: "Deleted author" }
      ],
      utterances: [
        { utterance_id: "u1", person_id: "P1", unit_id: "unit-1", stanza_id: "stanza-1", stage: "Reflect", turn_index: 1, text: "Evidence" }
      ],
      coded_segments: [
        {
          segment_id: "s1",
          utterance_id: "u1",
          person_id: "P1",
          target_person_ids: "Ghost",
          unit_id: "unit-1",
          stanza_id: "stanza-1",
          stage: "Reflect",
          turn_index: 1,
          text: "Evidence",
          codes: "Evidence"
        }
      ],
      codebook: [
        { code_id: "Evidence", label: "Evidence", family: "reasoning", description: "Evidence", color: "#2563eb" }
      ]
    }));
    const model = buildSenaModel(imported.dataset);
    const snapshot = buildSenaProjectSnapshot(model, {
      title: "ADR-0010 Ghost round trip",
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: imported.dataset
    });
    const fingerprint = senaReliabilitySnapshotFingerprint(snapshot);

    expect(model.dataset.people.map((person) => person.id)).toEqual(["P1", "P2"]);
    expect(model.matrices.S.raw).toEqual([[0, 0], [0, 0]]);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-transpose-fallback");
    expect(imported.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('declared people roster does not include "Ghost"')
    ]));
    expect(model.summary.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/references an unknown (target )?person/i)
    ]));

    const restored = importSenaProjectSnapshot(JSON.stringify(snapshot));
    expect(restored.dataset.interactions).toEqual(snapshot.dataset.interactions);
    expect(restored.dataset.coded_segments[0].targetPersonIds).toEqual(["Ghost"]);
    expect(restored.dataset.warnings).toEqual(snapshot.dataset.warnings);
    expect(restored.source.sourceDataset?.interactions).toEqual(snapshot.source.sourceDataset?.interactions);
    expect(senaReliabilitySnapshotFingerprint(restored)).toBe(fingerprint);
  });
});
