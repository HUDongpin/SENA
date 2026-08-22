import { describe, expect, it } from "vitest";
import { SenaInputValidationError } from "../analytical-input-validation";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  buildSenaProjectSnapshot,
  importSenaProjectSnapshot
} from "../snapshot";
import { senaReliabilitySnapshotFingerprint } from "../reliability";
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
    label: "nonfinite interaction weight",
    mutate: (snapshot) => { snapshot.dataset.interactions[0].weight = Number.POSITIVE_INFINITY; },
    issue: { path: "dataset.interactions[0].weight", rule: "finite-nonnegative" }
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
    label: "NaN confidence",
    mutate: (snapshot) => { snapshot.dataset.coded_segments[0].confidence = Number.NaN; },
    issue: { path: "dataset.coded_segments[0].confidence", rule: "finite-probability" }
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
    label: "overflow temporal window turn",
    mutate: (snapshot) => {
      if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
      snapshot.source.activeTemporalWindow.startTurn = JSON.parse("1e309") as number;
    },
    issue: { path: "source.activeTemporalWindow.startTurn", rule: "integer-range" }
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
    label: "out of range normalized temporal metric",
    mutate: (snapshot) => {
      if (!snapshot.source.activeTemporalWindow) throw new Error("fixture active window missing");
      snapshot.source.activeTemporalWindow.socialConnectivity = 1.5;
    },
    issue: { path: "source.activeTemporalWindow.socialConnectivity", rule: "finite-range" }
  }
];

describe("Round 9 canonical snapshot input contract", () => {
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
});
