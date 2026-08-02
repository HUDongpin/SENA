import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildSenaAnalysisProvenanceEnvelope, buildSenaAnalysisRun } from "../analysis-run";
import { buildSenaAnalysisConfigHash, buildSenaDataContractAudit, buildSenaDatasetContentHash } from "../data-contract-audit";
import { buildSenaGroupComparison } from "../inference";
import { buildSenaModel } from "../model";
import { buildSenaModelCard } from "../model-card";
import { buildSenaMarkdownReport, buildSenaReport, buildSenaValidation } from "../report";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataset } from "../types";

const directedDataset: SenaDataset = {
  people: [
    { id: "p1", label: "P1", role: "teacher", group: "A" },
    { id: "p2", label: "P2", role: "student", group: "A" }
  ],
  interactions: [
    {
      source: "p1",
      target: "p2",
      weight: 2,
      channel: "reply",
      stage: "teach",
      turnIndex: 1,
      evidence: "P1 responds to P2."
    }
  ],
  utterances: [],
  coded_segments: [],
  codebook: []
};

const isolatedCodeDataset: SenaDataset = {
  ...directedDataset,
  codebook: [
    {
      id: "c1",
      label: "Unused concept",
      family: "evidence",
      description: "A retained isolated code node.",
      color: "#8b5cf6"
    }
  ]
};

const attributionDataset: SenaDataset = {
  people: [
    { id: "p1", label: "P1", role: "teacher", group: "A" },
    { id: "p2", label: "P2", role: "student", group: "A" }
  ],
  interactions: [
    {
      source: "p1",
      target: "p2",
      weight: 1,
      channel: "reply",
      stage: "teach",
      turnIndex: 1,
      evidence: "P1 and P2 discuss evidence."
    }
  ],
  utterances: [
    { id: "u1", personId: "p1", unitId: "unit-1", stanzaId: "stanza-1", text: "Evidence matters.", stage: "teach", turnIndex: 1 },
    { id: "u2", personId: "p2", unitId: "unit-1", stanzaId: "stanza-1", text: "We need an explanation.", stage: "teach", turnIndex: 2 }
  ],
  coded_segments: [
    {
      segmentId: "s1",
      utteranceId: "u1",
      personId: "p1",
      unitId: "unit-1",
      text: "Evidence matters.",
      codes: ["c1"],
      stage: "teach",
      turnIndex: 1,
      stanzaId: "stanza-1"
    },
    {
      segmentId: "s2",
      utteranceId: "u2",
      personId: "p2",
      unitId: "unit-1",
      text: "We need an explanation.",
      codes: ["c2"],
      stage: "teach",
      turnIndex: 2,
      stanzaId: "stanza-1"
    }
  ],
  codebook: [
    { id: "c1", label: "Evidence", family: "reasoning", description: "Evidence code.", color: "#2563eb" },
    { id: "c2", label: "Explanation", family: "reasoning", description: "Explanation code.", color: "#7c3aed" }
  ]
};

const governedAttributionDataset: SenaDataset = {
  ...attributionDataset,
  metadata: {
    datasetVersion: "sena-test-fixture-2026-07-07",
    consent: {
      instrument: "SENA pilot consent v1",
      date: "2026-07-07",
      scope: "Synthetic fixture for local SENA advisory tests."
    },
    retention: {
      policy: "Retain generated test artifacts only for local verification.",
      deleteBy: "2026-12-31"
    },
    pseudonymization: {
      personIdPolicy: "opaque",
      rosterMapping: "external-encrypted-store"
    },
    codebook: {
      id: "sena-advisory-test-codebook",
      version: "v1",
      contentHash: "0xfixture"
    }
  }
};

const confidenceWeightedBridgeDataset: SenaDataset = {
  ...attributionDataset,
  coded_segments: [
    {
      segmentId: "s1",
      utteranceId: "u1",
      personId: "p1",
      unitId: "unit-1",
      text: "Evidence matters.",
      codes: ["c1"],
      confidence: 0.25,
      stage: "teach",
      turnIndex: 1,
      stanzaId: "stanza-1"
    }
  ]
};

const directedBridgeDataset = {
  people: [
    { id: "p1", label: "P1", role: "teacher", group: "A" },
    { id: "p2", label: "P2", role: "student", group: "A" }
  ],
  interactions: [],
  utterances: [
    { id: "u1", personId: "p1", unitId: "unit-1", stanzaId: "stanza-1", text: "Evidence and explanation are directed to P2.", stage: "teach", turnIndex: 1 }
  ],
  coded_segments: [
    {
      segmentId: "s1",
      utteranceId: "u1",
      personId: "p1",
      targetPersonIds: ["p2"],
      unitId: "unit-1",
      text: "Evidence and explanation are directed to P2.",
      codes: ["c1", "c2"],
      stage: "teach",
      turnIndex: 1,
      stanzaId: "stanza-1"
    }
  ],
  codebook: [
    { id: "c1", label: "Evidence", family: "reasoning", description: "Evidence code.", color: "#2563eb" },
    { id: "c2", label: "Explanation", family: "reasoning", description: "Explanation code.", color: "#7c3aed" }
  ]
} as unknown as SenaDataset;

describe("SENA advisory model defaults", () => {
  it("defaults alpha, beta, and gamma to 1 so layer weights are declared relative to normalization", () => {
    const model = buildSenaModel(directedDataset);

    expect(model.options.alpha).toBe(1);
    expect(model.options.beta).toBe(1);
    expect(model.options.gamma).toBe(1);
  });

  it("preserves directed social input by default instead of silently symmetrizing it", () => {
    const model = buildSenaModel(directedDataset);

    expect(model.options.undirectedSocial).toBe(false);
    expect(model.matrices.S.raw).toEqual([
      [0, 2],
      [0, 0]
    ]);
  });

  it("only mirrors directed ties when undirectedSocial is explicitly declared", () => {
    const model = buildSenaModel(directedDataset, { undirectedSocial: true });

    expect(model.matrices.S.raw).toEqual([
      [0, 2],
      [2, 0]
    ]);
  });

  it("promotes required analysis config declarations into resolved options, diagnostics, and API provenance", () => {
    const declaredBuildOptions = {
      direction: "undirected" as const,
      deg_convention: "row-sum" as const,
      Phi: "classical_mds" as const,
      delta: "shortest_path_reciprocal_weight" as const,
      d: 3,
      seed: 7
    };
    const model = buildSenaModel(governedAttributionDataset, declaredBuildOptions);
    const run = buildSenaAnalysisRun({
      dataset: governedAttributionDataset,
      buildOptions: declaredBuildOptions,
      generatedAt: "2026-07-07T00:00:00.000Z"
    });

    expect(model.options).toEqual(expect.objectContaining({
      ...declaredBuildOptions,
      undirectedSocial: true
    }));
    expect(model.operatorDiagnostics.analysisConfig).toEqual(declaredBuildOptions);
    expect(model.operatorDiagnostics.embedding.mds.dimensions).toBe(3);
    expect(buildSenaModelCard(model).embedding.seed).toBe(7);
    expect(run.provenanceEnvelope).toEqual(expect.objectContaining({
      direction: "undirected",
      deg_convention: "row-sum",
      Phi: "classical_mds",
      delta: "shortest_path_reciprocal_weight",
      d: 3,
      seed: 7
    }));
  });

  it("rejects conflicting legacy and declared social direction options", () => {
    expect(() => buildSenaModel(directedDataset, {
      direction: "directed",
      undirectedSocial: true
    })).toThrow("buildOptions.direction conflicts with buildOptions.undirectedSocial");
  });

  it("binds analysis config declarations into the reproducibility hash", () => {
    const baseline = buildSenaModel(governedAttributionDataset, { seed: 7 });
    const changedSeed = buildSenaModel(governedAttributionDataset, { seed: 8 });

    expect(buildSenaAnalysisConfigHash(baseline.options)).not.toBe(buildSenaAnalysisConfigHash(changedSeed.options));
    expect(baseline.operatorDiagnostics.runIdentity.configHash).not.toBe(changedSeed.operatorDiagnostics.runIdentity.configHash);
  });

  it("reports fused degrees, isolated vertices, and normalization divisors for model-card provenance", () => {
    const model = buildSenaModel(isolatedCodeDataset, { undirectedSocial: true });

    expect(model.operatorDiagnostics.degreeVector).toEqual([1, 1, 0]);
    expect(model.operatorDiagnostics.isolatedVertices).toEqual([
      { index: 2, label: "Unused concept", degree: 0 }
    ]);
    expect(model.operatorDiagnostics.normalization.S.divisor).toBe(2);
    expect(model.operatorDiagnostics.normalization.S.rule).toBe("max");
    expect(model.operatorDiagnostics.normalization.S.admissible).toBe(true);
    // ADR-0005: B_CP is normalized independently of B (= B_PC), so its divisor
    // and admissibility must be disclosed alongside the other layers. In
    // transpose-fallback mode the max divisor equals B's.
    expect(model.operatorDiagnostics.normalization.B_CP.rule).toBe("max");
    expect(model.operatorDiagnostics.normalization.B_CP.admissible).toBe(true);
    expect(model.operatorDiagnostics.normalization.B_CP.divisor).toBe(model.operatorDiagnostics.normalization.B.divisor);
  });

  it("records formal embedding diagnostics separately from exploratory layout provenance", () => {
    const model = buildSenaModel(directedDataset, { undirectedSocial: true });

    expect(model.operatorDiagnostics.embedding.exploratoryLayout.operator).toBe("deterministic-force-layout");
    expect(model.operatorDiagnostics.embedding.exploratoryLayout.metricExact).toBe(false);
    expect(model.operatorDiagnostics.embedding.mds.operator).toBe("classical-mds");
    expect(model.operatorDiagnostics.embedding.mds.delta).toBe("shortest-path-reciprocal-weight");
    expect(model.operatorDiagnostics.embedding.mds.dimensions).toBe(2);
    expect(model.operatorDiagnostics.embedding.mds.available).toBe(true);
    expect(model.operatorDiagnostics.embedding.mds.metricExact).toBe(true);
    expect(model.operatorDiagnostics.embedding.mds.stress).toBe(0);
    expect(model.operatorDiagnostics.embedding.mds.coordinates).toHaveLength(model.nodes.length);
    expect(model.operatorDiagnostics.embedding.mds.coordinates?.every((row) => (
      row.length === 2 && row.every(Number.isFinite)
    ))).toBe(true);
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.operator).toBe("laplacian-eigenmaps");
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.available).toBe(true);
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.dimensions).toBe(2);
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.coordinates).toHaveLength(model.nodes.length);
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.coordinates?.every((row) => (
      row.length === 2 && row.every(Number.isFinite)
    ))).toBe(true);
    expect(model.operatorDiagnostics.embedding.commuteTime.operator).toBe("commute-time");
    expect(model.operatorDiagnostics.embedding.commuteTime.available).toBe(true);
    expect(model.operatorDiagnostics.embedding.commuteTime.metricExact).toBe(true);
    expect(model.operatorDiagnostics.embedding.commuteTime.coordinates?.length).toBe(model.nodes.length);
    expect(model.operatorDiagnostics.embedding.commuteTime.maxPairwiseError).toBeLessThan(1e-9);
  });

  it("marks formal embedding diagnostics unavailable when isolated vertices make finite dissimilarities invalid", () => {
    const model = buildSenaModel(isolatedCodeDataset, { undirectedSocial: true });

    expect(model.operatorDiagnostics.embedding.mds.available).toBe(false);
    expect(model.operatorDiagnostics.embedding.mds.metricExact).toBe(false);
    expect(model.operatorDiagnostics.embedding.mds.warnings.join(" ")).toContain("isolated");
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.available).toBe(false);
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.warnings.join(" ")).toContain("isolated");
    expect(model.operatorDiagnostics.embedding.commuteTime.available).toBe(false);
    expect(model.operatorDiagnostics.embedding.commuteTime.warnings.join(" ")).toContain("connected");
  });

  it("records attribution wording gates and participation-normalized G-hat diagnostics", () => {
    const model = buildSenaModel(attributionDataset, { undirectedSocial: true });

    expect(model.operatorDiagnostics.attribution.defaultWording).toBe("associated with windows containing the pair");
    expect(model.operatorDiagnostics.attribution.contributionWordingAllowed).toBe(true);
    expect(model.operatorDiagnostics.attribution.contributionWordingReason).toContain("person-specific");
    expect(model.operatorDiagnostics.attribution.estimator).toBe("x-transpose-diag-y-x");
    expect(model.operatorDiagnostics.attribution.gHat.normalization).toBe("participation-window-share");
    expect(model.operatorDiagnostics.attribution.gHat.rowSums).toEqual([1, 1]);
    expect(model.operatorDiagnostics.attribution.gHat.boundsWithinWindowProducts).toBe(true);
    expect(model.operatorDiagnostics.attribution.gHat.minValue).toBeGreaterThanOrEqual(0);
    expect(model.operatorDiagnostics.attribution.gHat.maxValue).toBeLessThanOrEqual(1);
    expect(model.operatorDiagnostics.attribution.identities).toMatchObject({
      rawSlicesPsd: true,
      rawSumMatchesParticipantWeightedCooccurrence: true,
      windowNormalizedOffDiagonalMatchesCodeCooccurrence: true
    });
    expect(model.matrices.G.raw).toEqual([[1], [1]]);
  });

  it("makes the participation matrix Y first-class for attribution provenance", () => {
    const model = buildSenaModel(attributionDataset, { undirectedSocial: true });
    const card = buildSenaModelCard(model);
    const report = buildSenaReport(model);
    const markdown = buildSenaMarkdownReport(report);
    const attributionSection = card.sections.find((section) => section.id === "attribution-wording");

    expect(model.matrices.Y).toMatchObject({
      rowLabels: ["P1", "P2"],
      columnLabels: ["unit-1::stanza-1"],
      windowIds: ["unit-1::stanza-1"],
      raw: [
        [1],
        [1]
      ]
    });
    expect(model.operatorDiagnostics.attribution.participation).toMatchObject({
      symbol: "Y",
      sourceTable: "coded_segments",
      rowCount: 2,
      columnCount: 1,
      activeCells: 2,
      firstClass: true
    });
    expect(attributionSection?.evidence).toContain("Y=2x1");
    expect(attributionSection?.evidence).toContain("G identities=true");
    expect(attributionSection?.evidence).toContain("G_hat bounds=true");
    expect(markdown).toContain("Y: participation matrix");
    expect(markdown).toContain("- Participation matrix Y: 2x1 from coded_segments; active cells=2");
  });

  it("separates typed centrality families and forbids one mixed-type ranking", () => {
    const model = buildSenaModel(attributionDataset, { undirectedSocial: true });

    expect(model.operatorDiagnostics.typedCentrality.mixedRankingRenderable).toBe(false);
    expect(model.operatorDiagnostics.typedCentrality.families.personsOnS.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(model.operatorDiagnostics.typedCentrality.families.codesOnW.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(model.operatorDiagnostics.typedCentrality.families.bridgesOnB.map((item) => item.id)).toEqual(["p1->c1", "p2->c2"]);
    expect(model.operatorDiagnostics.typedCentrality.families.typedGraph.map((item) => item.nodeType)).toEqual(["person", "person", "code", "code"]);
  });

  it("serializes explicit typed-edge semantics for PP, CC, and PC edges", () => {
    const model = buildSenaModel(attributionDataset, { undirectedSocial: true });

    expect(model.edges.map((edge) => ({
      id: edge.id,
      layer: edge.layer,
      edgeType: edge.edgeType,
      sourceKind: edge.sourceKind,
      targetKind: edge.targetKind
    }))).toEqual([
      {
        id: "social:p1:p2",
        layer: "social",
        edgeType: "PP",
        sourceKind: "person",
        targetKind: "person"
      },
      {
        id: "concept:c1:c2",
        layer: "concept",
        edgeType: "CC",
        sourceKind: "concept",
        targetKind: "concept"
      },
      {
        id: "bridge:p1:c1",
        layer: "bridge",
        edgeType: "PC",
        sourceKind: "person",
        targetKind: "concept"
      },
      {
        id: "bridge:p2:c2",
        layer: "bridge",
        edgeType: "PC",
        sourceKind: "person",
        targetKind: "concept"
      }
    ]);
  });

  it("keeps marketing gallery SENA fusion copy out of overlay terminology", () => {
    const gallerySource = readFileSync(join(process.cwd(), "components/AnalyticsGallery.tsx"), "utf8");

    expect(gallerySource).toContain("SENA typed fusion graphs");
    expect(gallerySource).toContain('type: "fusion"');
    expect(gallerySource).not.toContain('type: "overlay"');
  });

  it("keeps default validation metrics on typed measures and labels composite metrics experimental", () => {
    const comparison = buildSenaGroupComparison({
      dataset: attributionDataset,
      groupField: "role",
      groupA: "teacher",
      groupB: "student",
      iterations: 10,
      bootstrapIterations: 10,
      seed: 7
    });
    const optionsSource = readFileSync(join(process.cwd(), "components/sena/workspace/enterprise-options.ts"), "utf8");
    const workspaceSource = readFileSync(
      join(process.cwd(), "components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts"),
      "utf8"
    );
    const fusionCanvasSource = readFileSync(join(process.cwd(), "components/sena/workspace/fusion-canvas.tsx"), "utf8");
    const inspectorSource = readFileSync(join(process.cwd(), "components/sena/workspace/inspector-panel.tsx"), "utf8");
    const nodeRadiusSource = fusionCanvasSource.match(/function nodeRadius[\s\S]*?\n}\n/)?.[0] ?? "";

    expect(comparison.metric).toBe("socialStrength");
    expect(workspaceSource).toContain('useState<SenaGroupComparisonMetric>("socialStrength")');
    expect(inspectorSource).toContain('label="Bridge score (exp.)"');
    expect(nodeRadiusSource).not.toContain("bridgeScore");
    expect(nodeRadiusSource).toContain("node.metrics.socialStrength");
    expect(optionsSource).toContain('{ value: "socialStrength", label: "Social strength" }');
    expect(optionsSource).toContain('label: "Bridge score (experimental)"');
    expect(optionsSource).toContain('label: "Concept brokerage (experimental)"');
    expect(optionsSource).toContain('label: "Alignment (experimental)"');
  });

  it("discloses exploratory composite bridge metric formulas in metric provenance", () => {
    const report = buildSenaReport(buildSenaModel(attributionDataset, { undirectedSocial: true }));
    const bridgeScore = report.validation.metricProvenance.find((metric) => metric.id === "bridge-score");
    const conceptBrokerage = report.validation.metricProvenance.find((metric) => metric.id === "concept-brokerage");
    const alignment = report.validation.metricProvenance.find((metric) => metric.id === "alignment");
    const modelSource = readFileSync(join(process.cwd(), "lib/sena/model.ts"), "utf8");

    expect(bridgeScore?.implementation).toContain("0.5*z(S social strength)");
    expect(bridgeScore?.implementation).toContain("0.3*z(B person-code total)");
    expect(bridgeScore?.implementation).toContain("0.2*z(concept brokerage)");
    expect(conceptBrokerage?.implementation).toContain("damping constant 0.5");
    expect(conceptBrokerage?.interpretationLimit).toContain("exploratory");
    expect(alignment?.implementation).toContain("(S x B)");
    expect(alignment?.interpretationLimit).toContain("not peer influence");
    expect(modelSource).toContain("const conceptBrokerageDamping = 0.5");
    expect(modelSource).toContain("const exploratoryBridgeScoreWeights");
    expect(modelSource).not.toContain("weight / (0.5 + W");
  });

  it("keeps directed bridge PC/CP independence status explicit in diagnostics and provenance", () => {
    const model = buildSenaModel(attributionDataset);
    const card = buildSenaModelCard(model, { generatedAt: "2026-07-07T00:00:00.000Z" });
    const envelope = buildSenaAnalysisProvenanceEnvelope(model, card);
    const directedSection = card.sections.find((section) => section.id === "directed-graph");

    expect(model.options.undirectedSocial).toBe(false);
    expect(model.operatorDiagnostics.direction).toMatchObject({
      socialMode: "directed",
      socialSymmetrized: false,
      directedInputPreserved: true,
      bridgeMode: "pc-transpose-fallback",
      pcEdgeType: "PC",
      cpEdgeType: "CP",
      cpEdgeCount: model.operatorDiagnostics.direction.pcEdgeCount,
      independentBridgeMatrices: false
    });
    expect(model.operatorDiagnostics.direction.badge).toContain("B^CP uses transpose-compatible weights");
    expect(card.direction.bridgesIndependent).toBe(false);
    expect(card.direction.badge).toContain("B^CP uses transpose-compatible weights");
    expect(directedSection?.status).toBe("complete");
    expect(directedSection?.evidence).toContain("bridgeMode=pc-transpose-fallback");
    expect(directedSection?.evidence).toContain("independentBridgeMatrices=false");
    expect(envelope.bridge_direction).toBe("pc-transpose-fallback");
    expect(envelope.bridge_pc_cp_independent).toBe(false);
    expect(envelope.direction_badge).toContain("B^CP uses transpose-compatible weights");
  });

  it("uses independent B_PC and B_CP matrices when directed code-to-person evidence is present", () => {
    const model = buildSenaModel(directedBridgeDataset);
    const card = buildSenaModelCard(model, { generatedAt: "2026-07-07T00:00:00.000Z" });
    const envelope = buildSenaAnalysisProvenanceEnvelope(model, card);
    const cpEdges = model.edges.filter((edge) => edge.edgeType === "CP");

    expect(model.matrices.B.raw).toEqual(model.matrices.B_PC.raw);
    expect(model.matrices.B_PC.raw).toEqual([
      [1, 1],
      [0, 0]
    ]);
    expect(model.matrices.B_CP.raw).toEqual([
      [0, 1],
      [0, 1]
    ]);
    expect(model.matrices.fusion.values[2][0]).toBe(0);
    expect(model.matrices.fusion.values[2][1]).toBe(1);
    expect(model.matrices.fusion.values[3][0]).toBe(0);
    expect(model.matrices.fusion.values[3][1]).toBe(1);
    expect(model.operatorDiagnostics.direction).toMatchObject({
      bridgeMode: "pc-cp-independent",
      pcEdgeCount: 2,
      cpEdgeCount: 2,
      independentBridgeMatrices: true
    });
    expect(card.direction.bridgesIndependent).toBe(true);
    expect(envelope.bridge_direction).toBe("pc-cp-independent");
    expect(envelope.bridge_pc_cp_independent).toBe(true);
    expect(cpEdges.map((edge) => ({
      edgeType: edge.edgeType,
      sourceKind: edge.sourceKind,
      targetKind: edge.targetKind,
      source: edge.source,
      target: edge.target
    }))).toEqual([
      { edgeType: "CP", sourceKind: "concept", targetKind: "person", source: "c1", target: "p2" },
      { edgeType: "CP", sourceKind: "concept", targetKind: "person", source: "c2", target: "p2" }
    ]);
  });

  it("keeps fusion direction explicit when independent B_CP survives social symmetrization", () => {
    const model = buildSenaModel(directedBridgeDataset, { undirectedSocial: true });
    const card = buildSenaModelCard(model, { generatedAt: "2026-07-10T00:00:00.000Z" });
    const envelope = buildSenaAnalysisProvenanceEnvelope(model, card);
    const directedSection = card.sections.find((section) => section.id === "directed-graph");

    expect(model.operatorDiagnostics.direction).toMatchObject({
      socialMode: "undirected",
      fusionMode: "directed",
      socialSymmetrized: true,
      bridgeMode: "pc-cp-independent",
      independentBridgeMatrices: true
    });
    expect(model.operatorDiagnostics.direction.badge).toContain("keeps A_fusion directed");
    expect(card.direction).toMatchObject({
      mode: "directed",
      operator: "declared-spectral-symmetrization",
      collapsed: false,
      bridgesIndependent: true
    });
    expect(directedSection?.evidence).toContain("mode=directed");
    expect(directedSection?.evidence).toContain("socialMode=undirected");
    expect(envelope.direction).toBe("directed");
    expect(envelope.bridge_direction).toBe("pc-cp-independent");
  });

  it("requires dataset governance metadata while recording a deterministic dataset content hash", () => {
    const missingGovernanceAudit = buildSenaDataContractAudit(attributionDataset);
    const governedAudit = buildSenaDataContractAudit(governedAttributionDataset);
    const missingGovernance = missingGovernanceAudit.items.find((item) => item.id === "dataset-governance-metadata");
    const governed = governedAudit.items.find((item) => item.id === "dataset-governance-metadata");

    expect(missingGovernanceAudit.status).toBe("needs-review");
    expect(missingGovernance?.status).toBe("review");
    expect(governedAudit.status).toBe("valid");
    expect(governed?.status).toBe("pass");
    expect(governed?.detail.some((detail) => detail.startsWith("datasetVersion=sena-test-fixture-2026-07-07"))).toBe(true);
    expect(governed?.detail.some((detail) => detail.startsWith("contentHash=0x"))).toBe(true);
  });

  it("records deterministic dataset and analysis-config identity hashes for reproducibility", () => {
    const baseline = buildSenaModel(governedAttributionDataset, { undirectedSocial: true });
    const changedWeights = buildSenaModel(governedAttributionDataset, { alpha: 0.5, undirectedSocial: true });

    expect(baseline.operatorDiagnostics.runIdentity.datasetVersion).toBe("sena-test-fixture-2026-07-07");
    expect(baseline.operatorDiagnostics.runIdentity.datasetContentHash).toBe(buildSenaDatasetContentHash(governedAttributionDataset));
    expect(baseline.operatorDiagnostics.runIdentity.datasetContentHash).toMatch(/^0x[a-f0-9]{8}$/);
    expect(baseline.operatorDiagnostics.runIdentity.configHash).toMatch(/^0x[a-f0-9]{8}$/);
    expect(changedWeights.operatorDiagnostics.runIdentity.datasetContentHash).toBe(baseline.operatorDiagnostics.runIdentity.datasetContentHash);
    expect(changedWeights.operatorDiagnostics.runIdentity.configHash).not.toBe(baseline.operatorDiagnostics.runIdentity.configHash);
  });

  it("generates a v2 model card with the ten advisory disclosure sections", () => {
    const model = buildSenaModel(governedAttributionDataset);
    const card = buildSenaModelCard(model, { generatedAt: "2026-07-07T00:00:00.000Z" });

    expect(card.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.modelCard);
    expect(card.generatedAt).toBe("2026-07-07T00:00:00.000Z");
    expect(card.sections.map((section) => section.id)).toEqual([
      "data-contract",
      "exact-formulas",
      "normalization",
      "layer-weights",
      "embedding-geometry",
      "coding-reliability",
      "attribution-wording",
      "validation",
      "isolated-zero-degree",
      "directed-graph"
    ]);
    expect(card.dataset.version).toEqual({
      declared: "sena-test-fixture-2026-07-07",
      contentHash: model.operatorDiagnostics.runIdentity.datasetContentHash
    });
    expect(card.formulas.social).toMatchObject({
      formula: "S = R",
      direction: "directed"
    });
    expect(card.formulas.bridge.weightRule).toBe("segment-count");
    expect(card.normalization.divisors).toEqual({
      S: model.operatorDiagnostics.normalization.S.divisor,
      W: model.operatorDiagnostics.normalization.W.divisor,
      B: model.operatorDiagnostics.normalization.B.divisor,
      B_CP: model.operatorDiagnostics.normalization.B_CP.divisor,
      G: model.operatorDiagnostics.normalization.G.divisor
    });
    expect(card.weights.configHash).toBe(model.operatorDiagnostics.runIdentity.configHash);
    expect(card.embedding.layoutBadge).toBe("Exploratory layout — distances are not metric.");
    expect(card.embedding.seed).toBe(0);
    expect(card.attribution.wording).toBe("contribution-supported");
    expect(card.direction.mode).toBe("directed");
    expect(card.renderGate.status).toBe("blocked");
    expect(card.renderGate.missingSectionIds).toEqual(expect.arrayContaining(["coding-reliability", "validation"]));
  });

  it("exposes a first-class API provenance envelope on analysis runs", () => {
    const run = buildSenaAnalysisRun({
      dataset: governedAttributionDataset,
      generatedAt: "2026-07-07T00:00:00.000Z"
    });
    const model = buildSenaModel(governedAttributionDataset);

    expect(run.provenanceEnvelope).toEqual(expect.objectContaining({
      schemaVersion: SENA_SCHEMA_VERSIONS.analysisProvenanceEnvelope,
      norm_rule: "max",
      alpha: 1,
      beta: 1,
      gamma: 1,
      direction: "directed",
      deg_convention: "row-sum",
      Phi: "classical_mds",
      delta: "shortest_path_reciprocal_weight",
      d: 2,
      seed: 0,
      metric_exact: model.operatorDiagnostics.embedding.mds.metricExact,
      stress: model.operatorDiagnostics.embedding.mds.stress,
      dataset_version: "sena-test-fixture-2026-07-07",
      dataset_content_hash: model.operatorDiagnostics.runIdentity.datasetContentHash,
      codebook_version: "v1"
    }));
    expect(run.provenanceEnvelope.divisors).toEqual({
      S: model.operatorDiagnostics.normalization.S.divisor,
      W: model.operatorDiagnostics.normalization.W.divisor,
      B: model.operatorDiagnostics.normalization.B.divisor,
      B_CP: model.operatorDiagnostics.normalization.B_CP.divisor,
      G: model.operatorDiagnostics.normalization.G.divisor
    });
    expect(run.provenanceEnvelope.isolated).toEqual(model.operatorDiagnostics.isolatedVertices);
    expect(run.provenanceEnvelope.model_card).toEqual({
      schemaVersion: "sena-model-card/v2",
      renderGateStatus: "blocked",
      missingSectionIds: expect.arrayContaining(["data-contract", "coding-reliability"])
    });
    expect(run.provenanceEnvelope.model_card.missingSectionIds).not.toContain("directed-graph");
  });

  it("defaults bridge weights to declared segment-code counts instead of silently mixing confidence", () => {
    const model = buildSenaModel(confidenceWeightedBridgeDataset, { undirectedSocial: true });

    expect(model.matrices.B.raw[0][0]).toBe(1);
    expect(model.operatorDiagnostics.bridgeWeighting.rule).toBe("count");
    expect(model.operatorDiagnostics.bridgeWeighting.activeCodeValue).toBe("segment-code-count");
    expect(model.operatorDiagnostics.bridgeWeighting.warnings.join(" ")).toContain("ignored by default");
  });

  it("uses confidence-weighted bridge values only when bridgeWeightRule is explicitly declared", () => {
    const model = buildSenaModel(confidenceWeightedBridgeDataset, {
      bridgeWeightRule: "confidence",
      undirectedSocial: true
    } as Parameters<typeof buildSenaModel>[1]);

    expect(model.matrices.B.raw[0][0]).toBe(0.25);
    expect(model.operatorDiagnostics.bridgeWeighting.rule).toBe("confidence");
    expect(model.operatorDiagnostics.bridgeWeighting.activeCodeValue).toBe("segment-confidence-or-1");
    expect(model.operatorDiagnostics.bridgeWeighting.warnings.join(" ")).toContain("declared");
  });

  it("uses admissible normalization rules for sensitivity instead of raw-weight none", () => {
    const model = buildSenaModel(isolatedCodeDataset, { undirectedSocial: true });
    const validation = buildSenaValidation(model);

    expect(validation.sensitivity.normalization.variants.map((variant) => variant.buildOptions.normalization)).toEqual([
      "max",
      "frobenius",
      "log1p-max"
    ]);
  });

  it("scopes W co-occurrence windows by unitId + stanzaId to match G/Y and jENA conversations", () => {
    const codebook = [
      { id: "c1", label: "Concept 1", family: "evidence", description: "", color: "#8b5cf6" },
      { id: "c2", label: "Concept 2", family: "evidence", description: "", color: "#22d3ee" }
    ];
    const segment = (overrides: {
      segmentId: string;
      personId: string;
      unitId: string;
      stanzaId: string;
      turnIndex: number;
      codes: string[];
    }) => ({
      utteranceId: `u-${overrides.segmentId}`,
      stage: "teach",
      text: "Window fixture segment.",
      ...overrides
    });
    const crossUnitDataset: SenaDataset = {
      people: [
        { id: "p1", label: "P1", role: "teacher", group: "A" },
        { id: "p2", label: "P2", role: "student", group: "B" }
      ],
      interactions: [],
      utterances: [],
      coded_segments: [
        segment({ segmentId: "s1", personId: "p1", unitId: "unit-a", stanzaId: "s1", turnIndex: 1, codes: ["c1"] }),
        segment({ segmentId: "s2", personId: "p2", unitId: "unit-b", stanzaId: "s1", turnIndex: 2, codes: ["c2"] })
      ],
      codebook
    };

    const crossUnit = buildSenaModel(crossUnitDataset, { undirectedSocial: true });
    expect(crossUnit.matrices.W.raw[0][1]).toBe(0);
    expect(crossUnit.matrices.W.raw[1][0]).toBe(0);
    expect(crossUnit.matrices.Y.windowIds).toEqual(["unit-a::s1", "unit-b::s1"]);
    expect(crossUnit.pairReport.every((pair) => pair.totalContribution === 0)).toBe(true);

    const sameUnitDataset: SenaDataset = {
      ...crossUnitDataset,
      coded_segments: [
        segment({ segmentId: "s1", personId: "p1", unitId: "unit-a", stanzaId: "s1", turnIndex: 1, codes: ["c1"] }),
        segment({ segmentId: "s2", personId: "p2", unitId: "unit-a", stanzaId: "s1", turnIndex: 2, codes: ["c2"] })
      ]
    };
    const sameUnit = buildSenaModel(sameUnitDataset, { undirectedSocial: true });
    expect(sameUnit.matrices.W.raw[0][1]).toBe(1);
    expect(sameUnit.matrices.W.raw[1][0]).toBe(1);
  });
});
