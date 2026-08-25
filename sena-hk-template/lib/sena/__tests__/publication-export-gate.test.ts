import { describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  buildSenaRuntimeBundle,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";
import {
  assertSenaPublicationModelCardReady,
  buildSenaPublicationExport
} from "../publication-export";
import { reliabilityDashboardToReview } from "../reliability";
import { importSenaProjectSnapshot, isSenaProjectSnapshot } from "../snapshot";
import { importSenaRuntimeBundle } from "../statistical-leaf-read";

function readyCurrentV2Snapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const dashboard = buildSenaReliabilityDashboard([
    { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
    { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
    { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
  ]);
  return buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "Current v2 publication readiness fixture",
    generatedAt: "2026-08-25T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Publication readiness reviewer",
      interpretation: "Current-v2 readiness fixture interpretation.",
      limitations: "Synthetic fixture only.",
      nextActions: "Keep every readiness surface derived from the reviewed evidence."
    },
    codingReliability: reliabilityDashboardToReview(dashboard, "Publication reliability reviewer"),
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic publication readiness fixture only.",
      retentionPolicy: "Delete generated fixture state after the test run.",
      usageConstraints: ["Do not use as real participant evidence."],
      dataSteward: "Publication readiness reviewer"
    }
  });
}

function readyCurrentV2RuntimeBundle() {
  const snapshot = readyCurrentV2Snapshot();
  return buildSenaRuntimeBundle(
    buildSenaModel(snapshot.dataset, snapshot.reproducibility.buildOptions),
    {
      title: "Current v2 runtime readiness fixture",
      generatedAt: snapshot.generatedAt,
      sourceDataset: snapshot.source.sourceDataset,
      humanReview: snapshot.report.humanReview,
      codingReliability: snapshot.report.codingReliabilityGate.review,
      dataGovernance: snapshot.report.dataGovernance
    }
  );
}

describe("SENA publication export model-card gate", () => {
  it("blocks publication artifacts when the model card render gate is incomplete", async () => {
    const model = buildSenaModel(lessonStudySenaContract);
    const snapshot = buildSenaProjectSnapshot(model, {
      title: "Ungated Publication Fixture",
      generatedAt: "2026-07-07T00:00:00.000Z",
      sourceDataset: lessonStudySenaContract
    });

    expect(snapshot.report.modelCard.renderGate.status).toBe("blocked");
    expect(snapshot.report.modelCard.renderGate.missingSectionIds).toEqual(expect.arrayContaining([
      "coding-reliability",
      "data-contract"
    ]));
    await expect(buildSenaPublicationExport(snapshot, "svg")).rejects.toMatchObject({
      status: 409,
      code: "publication_export_model_card_blocked"
    });
  });

  it("recomputes current-v2 reliability readiness when machine evidence is eligible but human documentation is empty", () => {
    const source = readyCurrentV2Snapshot();
    expect(source.report.codingReliabilityGate.machineClaimEligibility.eligible).toBe(true);
    expect(source.report.codingReliabilityGate.status).toBe("ready");
    expect(source.report.claimReadinessGate.status).toBe("ready");
    expect(source.report.modelCard.renderGate.status).toBe("ready");

    const forged = structuredClone(source);
    forged.report.codingReliabilityGate.review.reviewer = "";
    const restored = importSenaProjectSnapshot(forged);

    expect(restored.report.codingReliabilityGate.machineClaimEligibility.eligible).toBe(true);
    expect(restored.report.codingReliabilityGate).toEqual(expect.objectContaining({
      status: "review",
      claimUse: "coding-reliability-needed",
      blockers: expect.arrayContaining(["Reliability reviewer is missing."])
    }));
    expect(restored.report.completenessAudit.items).toContainEqual(expect.objectContaining({
      id: "coding-reliability",
      status: "review"
    }));
    expect(restored.report.pilotReadinessAudit.items).toContainEqual(expect.objectContaining({
      id: "coding-reliability",
      status: "review"
    }));
    expect(restored.report.claimReadinessGate).toEqual(expect.objectContaining({
      status: "exploratory",
      claimUse: "exploratory-only"
    }));
    expect(restored.report.modelCard.reliability.status).toBe("needs-review");
    expect(restored.report.modelCard.sections).toContainEqual(expect.objectContaining({
      id: "coding-reliability",
      status: "needs-review"
    }));
    expect(restored.report.modelCard.renderGate).toEqual(expect.objectContaining({
      status: "blocked",
      missingSectionIds: expect.arrayContaining(["coding-reliability"])
    }));
  });

  it("recomputes current-v2 data-governance readiness from the persisted governance fields", () => {
    const source = readyCurrentV2Snapshot();
    const forged = structuredClone(source);
    const governance = {
      ...structuredClone(forged.report.dataGovernance),
      status: "needs-review" as const,
      dataSteward: "",
      blockers: ["Data steward"]
    };
    forged.dataGovernance = structuredClone(governance);
    forged.report.dataGovernance = structuredClone(governance);

    expect(forged.report.completenessAudit.status).toBe("complete");
    expect(forged.report.pilotReadinessAudit.status).toBe("ready");
    expect(forged.report.claimReadinessGate.status).toBe("ready");
    expect(forged.report.modelCard.renderGate.status).toBe("ready");

    const restored = importSenaProjectSnapshot(forged);
    expect(restored.report.dataGovernance).toEqual(expect.objectContaining({
      status: "needs-review",
      dataSteward: "",
      blockers: ["Data steward"]
    }));
    expect(restored.report.completenessAudit.items).toContainEqual(expect.objectContaining({
      id: "data-governance",
      status: "review"
    }));
    expect(restored.report.pilotReadinessAudit.items).toContainEqual(expect.objectContaining({
      id: "data-governance",
      status: "review"
    }));
    expect(restored.report.claimReadinessGate).toEqual(expect.objectContaining({
      status: "exploratory",
      claimUse: "exploratory-only"
    }));
    expect(restored.report.modelCard.sections).toContainEqual(expect.objectContaining({
      id: "data-contract",
      status: "needs-review"
    }));
    expect(restored.report.modelCard.renderGate).toEqual(expect.objectContaining({
      status: "blocked",
      missingSectionIds: expect.arrayContaining(["data-contract"])
    }));
    expect(() => assertSenaPublicationModelCardReady(restored.report)).toThrow(
      /data-governance|publication export blocked/i
    );
  });

  it.each([
    {
      label: "data-contract audit",
      mutate: (report: ReturnType<typeof readyCurrentV2Snapshot>["report"]) => {
        report.dataContractAudit.status = "needs-review";
      }
    },
    {
      label: "runtime-consistency audit",
      mutate: (report: ReturnType<typeof readyCurrentV2Snapshot>["report"]) => {
        report.runtimeConsistencyAudit.status = "needs-review";
      }
    },
    {
      label: "fusion audit",
      mutate: (report: ReturnType<typeof readyCurrentV2Snapshot>["report"]) => {
        report.fusionMathAudit.status = "needs-review";
      }
    },
    {
      label: "ENA runtime",
      mutate: (report: ReturnType<typeof readyCurrentV2Snapshot>["report"]) => {
        report.enaManifest.status = "skipped";
      }
    },
    {
      label: "SNA runtime",
      mutate: (report: ReturnType<typeof readyCurrentV2Snapshot>["report"]) => {
        report.snaManifest.status = "skipped";
      }
    },
    {
      label: "method validation structure",
      mutate: (report: ReturnType<typeof readyCurrentV2Snapshot>["report"]) => {
        report.validation.metricProvenance = [];
      }
    }
  ])("blocks publication from downgraded authoritative $label despite ready caches", ({ mutate }) => {
    const snapshot = readyCurrentV2Snapshot();
    expect(snapshot.report.modelCard.renderGate.status).toBe("ready");
    expect(snapshot.report.claimReadinessGate.status).toBe("ready");
    mutate(snapshot.report);

    expect(() => assertSenaPublicationModelCardReady(snapshot.report)).toThrow(
      /publication export blocked/i
    );
  });

  it("never upgrades a legacy statistical read projection into publication-ready current evidence", () => {
    const snapshot = readyCurrentV2Snapshot();
    snapshot.report.fusionMathAudit.sourceSchemaVersion = "sena-fusion-math-audit/v1";
    snapshot.report.codingReliabilityGate.sourceSchemaVersion = "sena-coding-reliability-gate/v1";
    expect(snapshot.report.modelCard.renderGate.status).toBe("ready");
    expect(snapshot.report.claimReadinessGate.status).toBe("ready");

    expect(() => assertSenaPublicationModelCardReady(snapshot.report)).toThrow(
      /current-fusion-math-evidence|current-coding-reliability-evidence/i
    );
  });

  it("rejects a jointly forged run identity when snapshot analysis was not derived from the canonical dataset", () => {
    const forged = structuredClone(readyCurrentV2Snapshot());
    const interaction = forged.dataset.interactions[0];
    if (!interaction) throw new Error("Ready fixture has no interaction to vary.");
    interaction.weight = (interaction.weight ?? 1) + 99;
    forged.source.sourceDataset = structuredClone(forged.dataset);
    forged.report.operatorDiagnostics.runIdentity = buildSenaModel(
      forged.dataset,
      forged.reproducibility.buildOptions
    ).operatorDiagnostics.runIdentity;

    expect(isSenaProjectSnapshot(forged)).toBe(false);
    expect(() => importSenaProjectSnapshot(forged)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("rejects excessive canonical-analysis work before rebuilding an untrusted snapshot", () => {
    const forged = structuredClone(readyCurrentV2Snapshot());
    forged.dataset.people = Array.from({ length: 370 }, (_, index) => ({
      id: `budget-person-${index}`,
      label: `Budget person ${index}`,
      role: "Synthetic restore load",
      group: "Budget fixture"
    }));
    forged.dataset.interactions = [];
    forged.dataset.utterances = [];
    forged.dataset.coded_segments = [];
    forged.source.sourceDataset = structuredClone(forged.dataset);
    forged.source.sourceDatasetCounts = {
      people: forged.dataset.people.length,
      interactions: 0,
      utterances: 0,
      codedSegments: 0,
      codes: forged.dataset.codebook.length
    };

    expect(() => importSenaProjectSnapshot(forged)).toThrow(
      /canonical analysis work budget/i
    );
  });

  it("recomputes a current-v2 runtime bundle top-level model card from its consistent normalized reliability gate", () => {
    const source = readyCurrentV2RuntimeBundle();
    expect(source.codingReliabilityGate.status).toBe("ready");
    expect(source.modelCard.renderGate.status).toBe("ready");
    expect(importSenaRuntimeBundle(source)).toEqual(source);

    const forged = JSON.parse(JSON.stringify(source)) as typeof source;
    forged.codingReliabilityGate.review.reviewer = "";
    forged.report.codingReliabilityGate.review.reviewer = "";
    expect(forged.report.codingReliabilityGate.status).toBe("ready");
    expect(forged.report.codingReliabilityGate.review.reviewer).toBe("");
    expect(forged.modelCard.renderGate.status).toBe("ready");

    const restored = importSenaRuntimeBundle(forged);
    expect(restored.codingReliabilityGate).toEqual(expect.objectContaining({
      status: "review",
      claimUse: "coding-reliability-needed"
    }));
    expect(restored.report.codingReliabilityGate).toEqual(restored.codingReliabilityGate);
    expect(restored.modelCard.reliability.status).toBe("needs-review");
    expect(restored.modelCard.sections).toContainEqual(expect.objectContaining({
      id: "coding-reliability",
      status: "needs-review"
    }));
    expect(restored.modelCard.renderGate).toEqual(expect.objectContaining({
      status: "blocked",
      missingSectionIds: expect.arrayContaining(["coding-reliability"])
    }));
    expect(restored.report.modelCard.reliability.status).toBe("needs-review");
    expect(restored.report.modelCard.sections).toContainEqual(expect.objectContaining({
      id: "coding-reliability",
      status: "needs-review"
    }));
    expect(restored.report.modelCard.renderGate).toEqual(expect.objectContaining({
      status: "blocked",
      missingSectionIds: expect.arrayContaining(["coding-reliability"])
    }));
    expect(restored.pilotReadinessAudit.status).toBe("needs-review");
    expect(restored.claimReadinessGate.status).toBe("exploratory");
    expect(restored.report.pilotReadinessAudit.status).toBe("needs-review");
    expect(restored.report.claimReadinessGate.status).toBe("exploratory");
  });

  it("fails closed when ready runtime reliability gates carry different provenance", () => {
    const source = readyCurrentV2RuntimeBundle();
    const forged = JSON.parse(JSON.stringify(source)) as typeof source;
    forged.codingReliabilityGate.review.reviewer = "Conflicting top-level reviewer";

    expect(forged.codingReliabilityGate.status).toBe("ready");
    expect(forged.report.codingReliabilityGate.status).toBe("ready");
    expect(forged.codingReliabilityGate.review.reviewer)
      .not.toBe(forged.report.codingReliabilityGate.review.reviewer);

    expect(() => importSenaRuntimeBundle(forged))
      .toThrow(/conflicting ready coding-reliability provenance/i);
  });

  it.each([
    {
      label: "empty sections",
      expectedBlockingId: "exact-formulas" as const,
      mutate: (snapshot: ReturnType<typeof readyCurrentV2Snapshot>) => {
        snapshot.report.modelCard.sections = [];
      }
    },
    {
      label: "one missing section",
      expectedBlockingId: "exact-formulas" as const,
      mutate: (snapshot: ReturnType<typeof readyCurrentV2Snapshot>) => {
        snapshot.report.modelCard.sections = snapshot.report.modelCard.sections
          .filter((section) => section.id !== "exact-formulas");
      }
    },
    {
      label: "a duplicate section",
      expectedBlockingId: "data-contract" as const,
      mutate: (snapshot: ReturnType<typeof readyCurrentV2Snapshot>) => {
        const duplicate = structuredClone(snapshot.report.modelCard.sections[0]);
        snapshot.report.modelCard.sections.push(duplicate);
      }
    }
  ])("blocks current-v2 publication when the model card has $label", async ({ mutate, expectedBlockingId }) => {
    const forged = readyCurrentV2Snapshot();
    mutate(forged);
    expect(forged.report.modelCard.renderGate.status).toBe("ready");

    const restored = importSenaProjectSnapshot(forged);
    expect(restored.report.modelCard.renderGate.status).toBe("blocked");
    expect(restored.report.modelCard.renderGate.missingSectionIds).toContain(expectedBlockingId);
    await expect(buildSenaPublicationExport(forged, "html")).rejects.toMatchObject({
      status: 409,
      code: "publication_export_model_card_blocked"
    });
  });

  it.each(["", "Pending human review."])(
    "blocks direct publication when a cached-ready current-v2 snapshot carries incomplete human review text %j",
    async (interpretation) => {
      const source = readyCurrentV2Snapshot();
      const forged = structuredClone(source);
      forged.report.humanReview.interpretation = interpretation;

      expect(forged.report.humanReview.status).toBe("human-reviewed");
      expect(forged.report.completenessAudit.status).toBe("complete");
      expect(forged.report.pilotReadinessAudit.status).toBe("ready");
      expect(forged.report.claimReadinessGate.status).toBe("ready");
      expect(forged.report.modelCard.renderGate.status).toBe("ready");

      const restored = importSenaProjectSnapshot(forged);
      expect(restored.report.humanReview.status).toBe("draft");
      expect(restored.report.completenessAudit.status).toBe("needs-review");
      expect(restored.report.pilotReadinessAudit.status).toBe("needs-review");
      expect(restored.report.pilotReadinessAudit.items).toContainEqual(expect.objectContaining({
        id: "human-review",
        evidence: expect.arrayContaining(["interpretation=missing"])
      }));
      expect(restored.report.claimReadinessGate.status).toBe("exploratory");
      await expect(buildSenaPublicationExport(forged, "html")).rejects.toMatchObject({
        status: 409,
        code: "publication_export_model_card_blocked"
      });
    }
  );

  it("preserves and exports a semantically complete current-v2 ready snapshot", async () => {
    const source = readyCurrentV2Snapshot();
    expect(importSenaProjectSnapshot(source)).toEqual(source);
    await expect(buildSenaPublicationExport(source, "html")).resolves.toEqual(expect.objectContaining({
      contentType: "text/html; charset=utf-8"
    }));
  });
});
