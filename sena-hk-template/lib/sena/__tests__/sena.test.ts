import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveInstalledPackageFile } from "../../../scripts/resolve-installed-package-file";
import {
  buildSenaDatasetFromTables,
  buildSenaDataContractAudit,
  buildSenaDataContractAuditArtifact,
  buildSenaEnaManifest,
  buildSenaEnaReportArtifact,
  buildSenaEnaSpaceCoordinateMap,
  buildSenaEvidenceLedger,
  buildSenaClaimReadinessGate,
  buildSenaMarkdownReport,
  buildSenaDemoVerification,
  buildSenaDemoVerificationCompatibilityAudit,
  buildSenaDemoWalkthrough,
  buildSenaDevelopmentPlan,
  buildSenaFusionMathAudit,
  buildSenaFusionMathAuditArtifact,
  buildSenaJenaConceptPairHandoffRows,
  buildSenaJsnaSocialTieHandoffRows,
  buildSenaMatrixFingerprints,
  buildSenaMethodProtocol,
  buildSenaMetricProvenanceArtifact,
  buildSenaModel,
  buildSenaPairContributionReportArtifact,
  buildSenaProjectSnapshot,
  buildSenaReport,
  buildSenaReportCompletenessAudit,
  buildSenaReviewPacket,
  buildSenaPilotReadinessAudit,
  buildSenaRuntimeBundle,
  buildSenaRuntimeConsistencyAudit,
  buildSenaSnaManifest,
  buildSenaSnaReportArtifact,
  buildSenaTemporalRuntimeTrace,
  buildSenaValidation,
  buildSenaVisualGrammarArtifact,
  buildConceptPairContributionMap,
  buildEdgeStrokeScale,
  createEmptySenaDataset,
  importSenaDemoVerification,
  importSenaJsonContract,
  importSenaProjectSnapshot,
  importSenaReviewPacket,
  isSenaDemoVerification,
  isSenaProjectSnapshot,
  isSenaReviewPacket,
  inferSenaColumnMapping,
  jenaRuntimeDependencySpec,
  jenaRuntimeVersion,
  lessonStudySenaContract,
  lessonStudySampleUrl,
  senaPilotAssetIntegrity,
  parseSenaCsv,
  readableEdgeStrokeWidth,
  senaRuntimeProvenance,
  senaPilotHandoffChecks,
  senaPilotPackageManifestAsset,
  senaPilotPackageManifestUrl,
  senaPilotSampleAssets,
  senaPilotSampleCsvAssets,
  senaPilotTemplateAssets,
  SenaInputValidationError,
  snaRuntimeDependencySpec,
  snaRuntimeVersion,
  scopeSenaDatasetToWindow,
  type SenaImportTable
} from "../index";
import { exampleSenaContract } from "../sample-data";
import { projectSenaPilotPackageArtifactCatalog } from "../artifact-catalog";
import {
  SENA_AUTH_PAGE_MANIFEST,
  SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST
} from "../auth-page-manifest";
import { SENA_BROWSER_SMOKE_MANIFEST } from "../browser-smoke-manifest";
import { senaLayerStrokes } from "../layer-palette";
import { buildSenaApiDocumentation } from "../api-docs";
import { SENA_IMPLEMENTED_API_ROUTES } from "../api-route-manifest";
import {
  getEnterpriseNativeAdapterCertification,
  getEnterpriseOrganizationDeploymentPackage,
  getEnterpriseSaasOperationsReadiness
} from "../enterprise/ops-deployment";
import {
  getEnterpriseCapabilityAudit
} from "../enterprise/ops-capability-audit";
import {
  getEnterpriseIdentityProductionEvidence
} from "../enterprise/identity-production-evidence";
import { buildSenaGroupComparisonSuite } from "../inference";
import { importSenaEnterpriseFiles } from "../import-adapters";
import { importSenaReliabilityFiles } from "../reliability-adapters";
import {
  buildSenaSecurityHeaders,
  resolveSenaRuntimeHeader,
  SENA_SECURITY_HEADER_MANIFEST
} from "../security-headers";
import {
  createEnterpriseUploadRegistryFilesAction,
  deliverEnterpriseCollaborationPubSubAction,
  deliverEnterpriseNotificationsAction,
  deliverEnterpriseUploadObjectStorageAction,
  exportEnterprisePublicationAction,
  logoutEnterpriseSessionAction,
  markEnterpriseNotificationReadAction,
  refreshEnterpriseUploadStorageAction,
  runEnterpriseSsoPreflightAction,
  runEnterpriseValidationComparisonAction
} from "../../../components/sena/workspace/enterprise-actions";
import {
  deliverEnterpriseAuditLogAction,
  deliverEnterpriseBackupAction,
  deliverEnterpriseOpsAlertsAction,
  exportEnterpriseAuditCsvAction,
  exportEnterpriseJsonArtifactAction,
  getEnterpriseGoLiveRehearsalAction,
  refreshEnterpriseProvisioningReadinessAction,
  submitEnterpriseGoLiveAttestationAction,
  submitEnterprisePlatformDecisionReviewAction,
  syncEnterpriseDatabaseAction
} from "../../../components/sena/workspace/enterprise-ops-actions";
import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataset } from "../types";
import {
  buildSenaWorkspaceApiUrl,
  SENA_WORKSPACE_API_ROUTES
} from "../../../components/sena/workspace/api-client";

type RSocialFixtureGraph = {
  name: string;
  people: string[];
  interactions: Array<{ source: string; target: string; weight: number }>;
  undirectedMatrix: number[][];
  degree: number[];
  weightedDegree: number[];
  betweenness: number[];
  closeness: number[];
  reachable: number[];
  reciprocity: number;
  averagePathLength: number;
  componentCount: number;
  componentLabels: number[];
  communityLabels?: number[];
  communityCount?: number;
};

const rSnaSocialParity = JSON.parse(
  readFileSync(new URL("../__fixtures__/r-sna-social-parity.json", import.meta.url), "utf8")
) as Record<string, RSocialFixtureGraph>;

const rEnaSampleParity = JSON.parse(
  readFileSync(new URL("../../ena/__fixtures__/r-ena-sample-parity.json", import.meta.url), "utf8")
) as {
  points: unknown[];
  nodes: unknown[];
  variance: Record<string, number>;
  lineWeights: Record<string, unknown>[];
  connectionCounts: Record<string, unknown>[];
};

// Resolved through Node's module search path rather than a node_modules assumed
// to sit beside this file, so the suite also runs from a git worktree (which has
// no install of its own) — see scripts/resolve-installed-package-file.ts.
const jenaPackage = JSON.parse(
  readFileSync(resolveInstalledPackageFile("jena-js", "package.json", import.meta.url), "utf8")
) as { version: string };

const snaPackage = JSON.parse(
  readFileSync(resolveInstalledPackageFile("sna.js", "package.json", import.meta.url), "utf8")
) as { version: string };

const appPackage = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
) as { dependencies: Record<string, string> };

function readPilotAsset(path: string) {
  return readFileSync(new URL(`../../../public/sena-pilot/${path}`, import.meta.url), "utf8");
}

function readPublicHref(href: string) {
  return readPublicHrefBytes(href).toString("utf8");
}

function readPublicHrefBytes(href: string) {
  if (!href.startsWith("/sena-pilot/")) throw new Error(`Unexpected pilot href: ${href}`);
  return readFileSync(new URL(`../../../public${href}`, import.meta.url));
}

function readWorkspaceBytes(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url));
}

function sha256Hex(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseRecordedBody(init?: RequestInit) {
  if (typeof init?.body !== "string") return undefined;
  return JSON.parse(init.body) as unknown;
}

function createJsonFetchRecorder(responsePayload: unknown = { ok: true }) {
  const calls: Array<{ url: string; init?: RequestInit; body: unknown }> = [];
  return {
    calls,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        init,
        body: parseRecordedBody(init)
      });
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  };
}

function uploadLike(name: string, text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    text: async () => text,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

async function testEnterpriseJsonHeaders() {
  return {
    "content-type": "application/json",
    "x-sena-csrf-token": "test-csrf-token"
  };
}

const documentedCodingReliability = {
  status: "documented" as const,
  reviewer: "Reliability lead",
  codingScheme: "SENA lesson-study codebook v1",
  unitOfCoding: "coded_segments",
  coderCount: 2,
  agreementMetric: "Cohen kappa",
  agreementValue: "0.82",
  adjudicationNotes: "Disagreements were adjudicated before the pilot export.",
  limitations: "Reliability evidence is documented for the pilot sample only."
};

const documentedDataGovernance = {
  irbApprovalId: "EDUHK-SENA-2026-014",
  consentScope: "Consented lesson-study discourse for research analysis and publication excerpts.",
  retentionPolicy: "Retain de-identified analysis artifacts for 7 years under institutional policy.",
  usageConstraints: ["no student performance ranking", "publication excerpts require human review"],
  dataSteward: "Research ethics lead"
};

function buildSocialParityDataset(graph: RSocialFixtureGraph): SenaDataset {
  return {
    people: graph.people.map((id) => ({
      id,
      label: id,
      role: "Learner",
      group: "R parity",
      initials: id
    })),
    interactions: graph.interactions.map((interaction, index) => ({
      ...interaction,
      channel: "fixture",
      stage: "SNA parity",
      turnIndex: index + 1,
      evidence: `${interaction.source}->${interaction.target}`
    })),
    utterances: graph.people.map((id, index) => ({
      id: `u-${id}`,
      personId: id,
      unitId: "sna-parity",
      stanzaId: `stanza-${Math.floor(index / 2) + 1}`,
      stage: "SNA parity",
      turnIndex: index + 1,
      text: `${id} fixture utterance`
    })),
    coded_segments: graph.people.map((id, index) => ({
      segmentId: `cs-${id}`,
      utteranceId: `u-${id}`,
      personId: id,
      unitId: "sna-parity",
      stanzaId: `stanza-${Math.floor(index / 2) + 1}`,
      stage: "SNA parity",
      turnIndex: index + 1,
      text: `${id} coded fixture segment`,
      codes: index % 2 === 0 ? ["claim", "evidence"] : ["evidence"],
      confidence: 1
    })),
    codebook: [
      {
        id: "claim",
        label: "Claim",
        family: "Reasoning",
        description: "Claim fixture code.",
        color: "#2563eb"
      },
      {
        id: "evidence",
        label: "Evidence",
        family: "Reasoning",
        description: "Evidence fixture code.",
        color: "#14b8a6"
      }
    ]
  };
}

function expectSamePartition(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    for (let j = 0; j < expected.length; j += 1) {
      expect(actual[i] === actual[j]).toBe(expected[i] === expected[j]);
    }
  }
}

function buildLargeSyntheticDataset(peopleCount = 72, codeCount = 18, turnCount = 360): SenaDataset {
  const people = Array.from({ length: peopleCount }, (_, index) => ({
    id: `P${index + 1}`,
    label: `Person ${index + 1}`,
    role: index % 5 === 0 ? "Facilitator" : "Learner",
    group: `Group ${index % 6}`,
    initials: `P${index + 1}`
  }));
  const codebook = Array.from({ length: codeCount }, (_, index) => ({
    id: `c${index + 1}`,
    label: `Code ${index + 1}`,
    family: `Family ${index % 4}`,
    description: `Synthetic code ${index + 1}.`,
    color: `#${((index * 891289 + 0x334455) % 0xffffff).toString(16).padStart(6, "0")}`
  }));
  const stages = ["Opening", "Evidence", "Critique", "Synthesis"];
  const utterances = Array.from({ length: turnCount }, (_, index) => {
    const person = people[index % people.length];
    return {
      id: `u${index + 1}`,
      personId: person.id,
      unitId: `unit-${index % 8}`,
      stanzaId: `stanza-${Math.floor(index / 3) + 1}`,
      stage: stages[Math.floor((index / turnCount) * stages.length)] ?? stages.at(-1)!,
      turnIndex: index + 1,
      text: `Synthetic turn ${index + 1} from ${person.label}.`
    };
  });
  const coded_segments = utterances.map((utterance, index) => {
    const first = index % codebook.length;
    const second = (index * 5 + 3) % codebook.length;
    const third = (index * 7 + 5) % codebook.length;
    return {
      segmentId: `s${index + 1}`,
      utteranceId: utterance.id,
      personId: utterance.personId,
      unitId: utterance.unitId,
      stanzaId: utterance.stanzaId,
      stage: utterance.stage,
      turnIndex: utterance.turnIndex,
      text: utterance.text,
      codes: Array.from(new Set([codebook[first].id, codebook[second].id, codebook[third].id])),
      confidence: 0.75 + (index % 4) * 0.05
    };
  });
  const interactions = Array.from({ length: turnCount * 2 }, (_, index) => {
    const source = people[index % people.length];
    const target = people[(index * 7 + 11) % people.length];
    const turn = (index % turnCount) + 1;
    return {
      source: source.id,
      target: target.id === source.id ? people[(index + 1) % people.length].id : target.id,
      weight: 1 + (index % 5),
      channel: index % 3 === 0 ? "reply" : "mention",
      stage: utterances[turn - 1].stage,
      turnIndex: turn,
      evidence: `Synthetic interaction ${index + 1}`
    };
  });

  return { people, interactions, utterances, coded_segments, codebook };
}

describe("SENA model builder", () => {
  it("builds S, W, B, and fusion matrices from the upload data contract", () => {
    const model = buildSenaModel(exampleSenaContract);

    expect(model.matrices.S.raw).toHaveLength(exampleSenaContract.people.length);
    expect(model.matrices.W.raw).toHaveLength(exampleSenaContract.codebook.length);
    expect(model.matrices.B.raw).toHaveLength(exampleSenaContract.people.length);
    expect(model.matrices.B.raw[0]).toHaveLength(exampleSenaContract.codebook.length);
    expect(model.matrices.G.raw).toHaveLength(exampleSenaContract.people.length);
    expect(model.matrices.G.raw[0]).toHaveLength((exampleSenaContract.codebook.length * (exampleSenaContract.codebook.length - 1)) / 2);
    expect(model.pairReport).toHaveLength(model.matrices.G.pairs.length);
    expect(model.matrices.fusion.values).toHaveLength(exampleSenaContract.people.length + exampleSenaContract.codebook.length);
    expect(model.summary.people).toBe(6);
    expect(model.summary.concepts).toBe(7);
  });

  it("builds stage temporal windows by default", () => {
    const model = buildSenaModel(exampleSenaContract);

    expect(model.options.temporal.mode).toBe("stage");
    expect(model.temporal.settings.mode).toBe("stage");
    expect(model.timeline).toBe(model.temporal.windows);
    expect(model.temporal.windows.map((window) => window.label)).toEqual(["Brainstorming", "Evidence Building", "Reflection"]);
    expect(model.temporal.windows[0].startTurn).toBe(1);
    expect(model.temporal.windows[0].endTurn).toBe(3);
    expect(model.temporal.windows[0].segmentCount).toBe(3);
    expect(model.temporal.windows[0].evidence.length).toBeGreaterThan(0);
    expect(Math.max(...model.temporal.windows.map((window) => window.bridgeIntegration))).toBe(1);
  });

  it("builds moving temporal windows with configurable size and step", () => {
    const model = buildSenaModel(exampleSenaContract, {
      temporal: {
        mode: "moving-window",
        movingWindowSize: 3,
        movingWindowStep: 2
      }
    });

    expect(model.temporal.settings.mode).toBe("moving-window");
    expect(model.temporal.settings.movingWindowSize).toBe(3);
    expect(model.temporal.settings.movingWindowStep).toBe(2);
    expect(model.temporal.windows).toHaveLength(7);
    expect(model.temporal.windows[0].label).toBe("Turns 1-3");
    expect(model.temporal.windows[1].label).toBe("Turns 3-5");
    expect(model.temporal.windows.at(-1)?.label).toBe("Turns 13-15");
    expect(model.temporal.windows.every((window) => window.mode === "moving-window")).toBe(true);
    expect(model.temporal.windows[0].topCodes.length).toBeGreaterThan(0);
  });

  it("builds turn-centered temporal windows with radius context", () => {
    const model = buildSenaModel(exampleSenaContract, {
      temporal: {
        mode: "turn-window",
        turnWindowRadius: 1
      }
    });

    const centerFive = model.temporal.windows.find((window) => window.centerTurn === 5);
    expect(model.temporal.settings.mode).toBe("turn-window");
    expect(model.temporal.windows).toHaveLength(15);
    expect(centerFive?.startTurn).toBe(4);
    expect(centerFive?.endTurn).toBe(6);
    expect(centerFive?.segmentIds).toEqual(["s4", "s5", "s6"]);
    expect(centerFive?.stages).toContain("Evidence Building");
    expect(centerFive?.rawBridgeIntegration).toBeGreaterThan(0);
  });

  it("scopes SNA, ENA, and fusion calculations to a selected temporal window", () => {
    const fullModel = buildSenaModel(exampleSenaContract);
    const brainstorming = fullModel.temporal.windows.find((window) => window.label === "Brainstorming");
    expect(brainstorming).toBeTruthy();

    const scopedDataset = scopeSenaDatasetToWindow(exampleSenaContract, brainstorming!);
    const scopedModel = buildSenaModel(scopedDataset);
    const chenIndex = scopedModel.people.findIndex((person) => person.id === "C");
    const eliIndex = scopedModel.people.findIndex((person) => person.id === "E");
    const pairIndex = scopedModel.matrices.G.pairIds.indexOf("evidence|explanation");

    expect(scopedDataset.utterances.map((utterance) => utterance.id)).toEqual(["u1", "u2", "u3"]);
    expect(scopedDataset.coded_segments.map((segment) => segment.segmentId)).toEqual(["s1", "s2", "s3"]);
    expect(scopedModel.summary.socialEdges).toBeLessThan(fullModel.summary.socialEdges);
    expect(scopedModel.summary.conceptEdges).toBeLessThan(fullModel.summary.conceptEdges);
    expect(scopedModel.matrices.fusion.values).toHaveLength(fullModel.matrices.fusion.values.length);
    expect(scopedModel.matrices.G.raw[chenIndex]?.[pairIndex]).toBe(0);
    expect(scopedModel.matrices.G.raw[eliIndex]?.[pairIndex]).toBeCloseTo(1);
  });

  it("scopes stage-window interactions by stage even when their turnIndex is outside the utterance span", () => {
    // The Reflect stage's utterances are turns 1-2, but its interaction carries
    // turnIndex 9. buildTemporalWindows selects that interaction by stage, so
    // scopeSenaDatasetToWindow must too — a turn-range filter would drop it and
    // disagree with the window's own interactionCount.
    const stageTurnDataset: SenaDataset = {
      people: [
        { id: "A", label: "Ada", role: "Teacher", group: "Team" },
        { id: "B", label: "Ben", role: "Student", group: "Team" }
      ],
      codebook: [
        { id: "evidence", label: "Evidence", family: "Epistemic", description: "Evidence move", color: "#2f73ff" },
        { id: "question", label: "Question", family: "Epistemic", description: "Question move", color: "#a855f7" }
      ],
      utterances: [
        { id: "u1", personId: "A", unitId: "unit-1", stanzaId: "s1", stage: "Reflect", turnIndex: 1, text: "Reflecting on the evidence." },
        { id: "u2", personId: "B", unitId: "unit-1", stanzaId: "s1", stage: "Reflect", turnIndex: 2, text: "Adding a follow-up question." }
      ],
      coded_segments: [
        { segmentId: "cs1", utteranceId: "u1", personId: "A", unitId: "unit-1", stanzaId: "s1", stage: "Reflect", turnIndex: 1, text: "Reflecting on the evidence.", codes: ["evidence"] },
        { segmentId: "cs2", utteranceId: "u2", personId: "B", unitId: "unit-1", stanzaId: "s1", stage: "Reflect", turnIndex: 2, text: "Adding a follow-up question.", codes: ["question"] }
      ],
      interactions: [
        { source: "A", target: "B", stage: "Reflect", turnIndex: 9, weight: 1, channel: "reply", evidence: "Late reply that still belongs to the Reflect stage." }
      ]
    };

    const model = buildSenaModel(stageTurnDataset);
    const reflect = model.temporal.windows.find((window) => window.mode === "stage" && window.label === "Reflect");
    expect(reflect).toBeTruthy();
    expect(reflect!.interactionCount).toBe(1);

    const scoped = scopeSenaDatasetToWindow(stageTurnDataset, reflect!);
    expect(scoped.interactions).toHaveLength(1);
    expect(scoped.interactions[0]?.turnIndex).toBe(9);
    // The window's own interactionCount must equal the scoped model's social-edge
    // basis; a turn-range filter would drop the turn-9 interaction and desync them.
    const scopedModel = buildSenaModel(scoped);
    expect(scopedModel.summary.socialEdges).toBe(reflect!.interactionCount);
    expect(scopedModel.summary.socialEdges).toBe(1);
  });

  it("builds a temporal runtime trace with per-window jENA and jSNA provenance", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const trace = buildSenaTemporalRuntimeTrace(exampleSenaContract, {}, {
      generatedAt: "2026-06-08T00:00:00.000Z",
      timelineModel
    });
    const brainstorming = trace.windows.find((entry) => entry.window.label === "Brainstorming");

    expect(trace.schemaVersion).toBe("sena-temporal-runtime-trace/v1");
    expect(trace.generatedAt).toBe("2026-06-08T00:00:00.000Z");
    expect(trace.temporalSettings.mode).toBe("stage");
    expect(trace.windows.map((entry) => entry.window.label)).toEqual(timelineModel.temporal.windows.map((window) => window.label));
    expect(brainstorming?.datasetCounts.codedSegments).toBe(3);
    expect(brainstorming?.ena.status).toBe("computed");
    expect(brainstorming?.ena.dimensions.length).toBeGreaterThan(0);
    expect(brainstorming?.sna.status).toBe("computed");
    expect(brainstorming?.sna.graph?.communityCount).toBeGreaterThanOrEqual(1);
    expect(trace.windows.some((entry) => entry.sena.activeGPairs > 0)).toBe(true);
    expect(trace.windows.some((entry) => entry.sena.strongestGPair?.totalContribution && entry.sena.strongestGPair.totalContribution > 0)).toBe(true);
    expect(trace.windows.find((entry) => entry.sena.strongestGPair)?.sena.strongestGPair?.topContributors.length).toBeGreaterThan(0);
    expect(trace.windows.every((entry) => entry.sena.matrixTotals.fusion >= 0)).toBe(true);
    expect(brainstorming?.sena.matrixFingerprints.map((fingerprint) => fingerprint.id)).toEqual(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
    expect(brainstorming?.sena.matrixFingerprints.every((fingerprint) => fingerprint.checksumAlgorithm === "sena-stable-fnv1a32/v1")).toBe(true);
    expect(brainstorming?.sena.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion")?.checksum).toMatch(/^0x[a-f0-9]{8}$/);
    expect(trace.transitions).toHaveLength(Math.max(0, trace.windows.length - 1));
    expect(trace.transitions[0]?.fromWindowId).toBe(trace.windows[0]?.window.id);
    expect(trace.transitions[0]?.toWindowId).toBe(trace.windows[1]?.window.id);
    expect(Number.isFinite(trace.transitions[0]?.delta.G ?? NaN)).toBe(true);
    expect(Number.isFinite(trace.transitions[0]?.delta.fusion ?? NaN)).toBe(true);
    expect(trace.transitions[0]?.interpretationGuardrail).toContain("not causal evidence");
  });

  it("rejects a temporal trace when an interaction weight is not finite", () => {
    const dataset = {
      ...exampleSenaContract,
      interactions: exampleSenaContract.interactions.map((interaction, index) => (
        index === 0 ? { ...interaction, weight: Number.NaN } : interaction
      ))
    };

    expect(() => buildSenaTemporalRuntimeTrace(dataset, {}, {
      generatedAt: "2026-08-02T00:00:00.000Z"
    })).toThrowError(SenaInputValidationError);
  });

  it("returns an empty temporal runtime trace for an empty dataset", () => {
    const trace = buildSenaTemporalRuntimeTrace(createEmptySenaDataset(), {}, {
      generatedAt: "2026-06-08T00:00:00.000Z"
    });

    expect(trace.sourceDatasetCounts.people).toBe(0);
    expect(trace.windows).toHaveLength(0);
    expect(trace.transitions).toHaveLength(0);
    expect(trace.buildOptions.temporal.mode).toBe("stage");
  });

  it("uses interaction turn indices for precise turn-window SNA scoping when available", () => {
    const dataset = {
      ...exampleSenaContract,
      interactions: [
        {
          source: "A",
          target: "B",
          weight: 1,
          channel: "reply",
          stage: "Evidence Building",
          turnIndex: 4,
          evidence: "Turn 4 tie"
        },
        {
          source: "E",
          target: "F",
          weight: 1,
          channel: "reply",
          stage: "Evidence Building",
          turnIndex: 9,
          evidence: "Turn 9 tie"
        }
      ]
    };
    const timelineModel = buildSenaModel(dataset, { temporal: { mode: "turn-window", turnWindowRadius: 0 } });
    const turnFour = timelineModel.temporal.windows.find((window) => window.centerTurn === 4);
    expect(turnFour).toBeTruthy();

    const scopedDataset = scopeSenaDatasetToWindow(dataset, turnFour!);
    const scopedModel = buildSenaModel(scopedDataset);

    expect(turnFour?.interactionCount).toBe(1);
    expect(scopedDataset.interactions.map((interaction) => interaction.evidence)).toEqual(["Turn 4 tie"]);
    expect(scopedModel.summary.socialEdges).toBe(1);
  });

  it("generates a comprehensive SENA report package", () => {
    const model = buildSenaModel(exampleSenaContract);
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T00:00:00.000Z",
      evidenceLimit: 12,
      humanReview: {
        status: "human-reviewed",
        reviewer: "Research lead",
        interpretation: "Evidence and explanation become more integrated after the opening stage.",
        limitations: "This interpretation still depends on human coding reliability.",
        nextActions: "Review the evidence-explanation excerpts with the teaching team."
      },
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });
    const markdown = buildSenaMarkdownReport(report);

    expect(report.schemaVersion).toBe("sena-report/v1");
    expect(report.dataGovernance.schemaVersion).toBe("sena-data-governance-metadata/v1");
    expect(report.dataGovernance.status).toBe("complete");
    expect(report.dataGovernance.irbApprovalId).toBe("EDUHK-SENA-2026-014");
    expect(report.dataGovernance.usageConstraints).toContain("no student performance ranking");
    expect(markdown).toContain("## Data Governance");
    expect(markdown).toContain("EDUHK-SENA-2026-014");
    expect(report.analysisWindow).toBeNull();
    expect(report.parameters.buildOptions.normalization).toBe(model.options.normalization);
    expect(report.parameters.datasetCounts.codedSegments).toBe(exampleSenaContract.coded_segments.length);
    expect(report.runtimeProvenance.enaRuntime.engine).toBe("jena-js");
    expect(report.runtimeProvenance.snaRuntime.engine).toBe("sna.js");
    expect(report.interpretationGuardrails.some((guardrail) => guardrail.id === "layout-distance-boundary")).toBe(true);
    expect(report.matrices.S.raw).toEqual(model.matrices.S.raw);
    expect(report.matrices.G.pairs).toHaveLength(model.matrices.G.pairs.length);
    expect(report.figures.fusionGraph.nodes).toHaveLength(model.nodes.length);
    expect(report.figures.fusionGraph.edges).toHaveLength(model.edges.length);
    expect(new Set(report.figures.fusionGraph.edges.map((edge) => edge.edgeType))).toEqual(new Set(["PP", "CC", "PC"]));
    expect(report.figures.fusionGraph.edges.filter((edge) => edge.layer === "bridge").every((edge) => edge.edgeType === "PC" && edge.sourceKind === "person" && edge.targetKind === "concept")).toBe(true);
    expect(report.figures.temporalTrace.windows).toHaveLength(model.temporal.windows.length);
    expect(report.figures.temporalRuntimeNarrative).toHaveLength(model.temporal.windows.length);
    expect(report.figures.temporalRuntimeTransitions).toHaveLength(Math.max(0, model.temporal.windows.length - 1));
    expect(report.figures.temporalRuntimeTransitions[0]?.delta).toHaveProperty("activeGPairs");
    expect(markdown).toContain("### Temporal Transitions");
    expect(markdown).toContain("Delta A_fusion");
    expect(markdown).toContain("A_fusion checksum");
    expect(markdown).toContain("Top S tie");
    expect(markdown).toContain("Top W tie");
    expect(markdown).toContain("Top B tie");
    expect(report.figures.temporalRuntimeNarrative.every((entry) => entry.matrixFingerprints.map((fingerprint) => fingerprint.id).join("|") === "S|W|B|B_PC|B_CP|G|A_fusion")).toBe(true);
    expect(report.figures.temporalRuntimeNarrative.every((entry) => entry.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))).toBe(true);
    expect(report.figures.temporalRuntimeNarrative.some((entry) => entry.strongestSocialTie)).toBe(true);
    expect(report.figures.temporalRuntimeNarrative.some((entry) => entry.strongestConceptTie)).toBe(true);
    expect(report.figures.temporalRuntimeNarrative.some((entry) => entry.strongestBridgeTie)).toBe(true);
    expect(report.figures.temporalRuntimeNarrative.some((entry) => entry.strongestGPair?.totalContribution && entry.strongestGPair.totalContribution > 0)).toBe(true);
    expect(report.figures.temporalRuntimeNarrative.find((entry) => entry.strongestGPair)?.strongestGPair?.topContributors.length).toBeGreaterThan(0);
    expect(report.figures.visualGrammar.map((item) => item.id)).toEqual(["fusion-canvas-a1", "temporal-fusion-arc", "ena-space-canonical", "workspace-shell-c3-collapsed-switcher", "fusion-plane-orbit"]);
    expect(report.figures.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.guardrail).toContain("Visual distance");
    expect(report.figures.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.guardrail).toContain("Plane distances are measurements");
    expect(report.figures.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("S ties never draw inside the plane");
    expect(report.enaManifest.status).toBe("computed");
    expect(report.enaManifest.outputs?.connectionCounts.length).toBe(exampleSenaContract.people.length);
    expect(report.enaManifest.outputs?.lineWeights.length).toBeGreaterThan(0);
    const conceptPairHandoffRows = buildSenaJenaConceptPairHandoffRows(model, report.enaManifest);
    expect(conceptPairHandoffRows).toHaveLength((model.codes.length * (model.codes.length - 1)) / 2);
    expect(conceptPairHandoffRows.some((row) => row.overlapStatus === "overlap" && row.jenaConnectionTotal > 0 && row.senaRawWeight > 0)).toBe(true);
    expect(conceptPairHandoffRows.find((row) => row.id === "evidence|explanation")?.unitPreview.length).toBeGreaterThan(0);
    expect(report.enaManifest.outputs?.pointsForProjection.length).toBe(exampleSenaContract.people.length);
    expect(report.enaManifest.outputs?.points.length).toBe(exampleSenaContract.people.length);
    expect(report.enaManifest.outputs?.nodePositions.length).toBe(exampleSenaContract.codebook.length);
    expect(report.snaManifest.status).toBe("computed");
    expect(report.snaManifest.engine).toBe("sna.js");
    expect(report.snaManifest.engineAlias).toBe("jSNA");
    expect(report.snaManifest.datasetCounts.people).toBe(exampleSenaContract.people.length);
    expect(report.snaManifest.outputs?.graph).toEqual(model.socialReport.graph);
    expect(report.snaManifest.outputs?.socialMatrix).toEqual(model.matrices.S);
    const socialTieHandoffRows = buildSenaJsnaSocialTieHandoffRows(model, report.snaManifest);
    expect(socialTieHandoffRows).toHaveLength(model.edges.filter((edge) => edge.layer === "social").length);
    expect(socialTieHandoffRows.every((row) => row.matrixAligned)).toBe(true);
    expect(socialTieHandoffRows.some((row) => row.edgeWeight > 0 && row.evidencePreview.length > 0 && row.sourceActor && row.targetActor)).toBe(true);
    const jointGuardrail = report.interpretationGuardrails.find((guardrail) => guardrail.id === "joint-embedding-boundary");
    expect(jointGuardrail?.statement).toContain("declared A_fusion embedding operators");
    expect(jointGuardrail?.statement).toContain("Laplacian eigenmaps");
    expect(jointGuardrail?.statement).toContain("operator, delta, dimension, seed, metric exactness, and stress");
    expect(report.completenessAudit.schemaVersion).toBe("sena-report-completeness/v1");
    expect(report.completenessAudit.status).toBe("complete");
    expect(report.completenessAudit.reviewNeeded).toBe(0);
    expect(report.completenessAudit.items.find((item) => item.id === "analysis-scope")?.summary).toBe("Full conversation analysis");
    expect(report.completenessAudit.items.map((item) => item.id)).toContain("data-contract-audit");
    expect(report.completenessAudit.items.map((item) => item.id)).toContain("jsna-manifest");
    expect(report.completenessAudit.items.map((item) => item.id)).toContain("runtime-api-surface");
    expect(report.completenessAudit.items.map((item) => item.id)).toContain("fusion-math-audit");
    expect(report.completenessAudit.items.map((item) => item.id)).toContain("coding-reliability");
    expect(report.completenessAudit.items.map((item) => item.id)).toContain("data-governance");
    expect(report.completenessAudit.items.find((item) => item.id === "runtime-api-surface")?.evidence).toContain("jena-api-surface:pass");
    expect(report.completenessAudit.items.find((item) => item.id === "runtime-api-surface")?.evidence).toContain("jsna-api-surface:pass");
    expect(report.codingReliabilityGate.schemaVersion).toBe("sena-coding-reliability-gate/v1");
    expect(report.codingReliabilityGate.status).toBe("ready");
    expect(markdown).toContain("## Coding Reliability Gate");
    expect(report.completenessAudit.items.every((item) => item.status === "pass")).toBe(true);
    expect(buildSenaReportCompletenessAudit({
      model,
      analysisWindow: report.analysisWindow,
      enaManifest: report.enaManifest,
      snaManifest: report.snaManifest,
      runtimeConsistencyAudit: report.runtimeConsistencyAudit,
      dataContractAudit: report.dataContractAudit,
      fusionMathAudit: report.fusionMathAudit,
      evidenceSnippets: report.evidenceSnippets,
      humanReview: report.humanReview,
      codingReliabilityGate: report.codingReliabilityGate,
      dataGovernance: report.dataGovernance
    })).toEqual(report.completenessAudit);
    expect(report.dataContractAudit.schemaVersion).toBe("sena-data-contract-audit/v1");
    expect(report.dataContractAudit.status).toBe("valid");
    expect(report.dataContractAudit.reviewNeeded).toBe(0);
    expect(report.dataContractAudit.items.map((item) => item.id)).toEqual([
      "five-table-shape",
      "people-table",
      "codebook-table",
      "dataset-governance-metadata",
      "utterances-table",
      "coded-segments-table",
      "interactions-table",
      "temporal-fields",
      "import-and-model-warnings"
    ]);
    expect(buildSenaDataContractAudit(model.dataset, { modelWarnings: model.summary.warnings })).toEqual(report.dataContractAudit);
    expect(report.fusionMathAudit.schemaVersion).toBe("sena-fusion-math-audit/v2");
    expect(report.fusionMathAudit.status).toBe("verified");
    expect(report.fusionMathAudit.reviewNeeded).toBe(0);
    expect(report.fusionMathAudit.items.map((item) => item.id)).toEqual([
      "labels-and-dimensions",
      "finite-values",
      "nonnegative-values",
      "social-block",
      "bridge-block",
      "bridge-cp-block",
      "concept-block",
      "g-pair-coverage"
    ]);
    expect(report.fusionMathAudit.matrixFingerprints.map((fingerprint) => fingerprint.id)).toEqual(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
    expect(report.fusionMathAudit.matrixFingerprints.every((fingerprint) => fingerprint.checksumAlgorithm === "sena-stable-fnv1a32/v1")).toBe(true);
    expect(report.fusionMathAudit.matrixFingerprints.every((fingerprint) => /^0x[a-f0-9]{8}$/.test(fingerprint.checksum))).toBe(true);
    expect(report.fusionMathAudit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion")?.valueKinds).toEqual(["values"]);
    expect(buildSenaFusionMathAudit(model)).toEqual(report.fusionMathAudit);
    expect(report.runtimeConsistencyAudit.schemaVersion).toBe("sena-runtime-consistency/v1");
    expect(report.runtimeConsistencyAudit.status).toBe("consistent");
    expect(report.runtimeConsistencyAudit.reviewNeeded).toBe(0);
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-local-dependency")?.actual).toContain("0.6.2");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-api-surface")?.actual).toContain("ena()");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-api-surface")?.detail).toContain("source=lib/sena/ena-manifest.ts");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.status).toBe("pass");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.actual).toContain("fixture=lib/ena/__fixtures__/r-ena-sample-parity.json");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.actual).toContain("coverage=lineWeights|connectionCounts|variance|unitPoints|nodePositions");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix")?.status).toBe("pass");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix")?.expected).toContain("jENA adjacencyKey covers");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix")?.actual).toContain("overlap=");
    const jenaConceptHandoff = report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix");
    expect(Number(jenaConceptHandoff?.metrics?.expectedPairs)).toBeGreaterThan(0);
    expect(Number(jenaConceptHandoff?.metrics?.adjacencyPairs)).toBe(Number(jenaConceptHandoff?.metrics?.expectedPairs));
    expect(Number(jenaConceptHandoff?.metrics?.positiveJenaPairs)).toBeGreaterThan(0);
    expect(Number(jenaConceptHandoff?.metrics?.positiveSenaWPairs)).toBeGreaterThan(0);
    expect(Number(jenaConceptHandoff?.metrics?.overlapPairs)).toBeGreaterThan(0);
    expect(jenaConceptHandoff?.metrics?.finiteColumns).toBe(true);
    expect(jenaConceptHandoff?.metrics?.allPositiveJenaPairsMapToSenaW).toBe(true);
    expect(Array.isArray(jenaConceptHandoff?.metrics?.overlapPreview)).toBe(true);
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-local-dependency")?.actual).toContain("npm:@peterhudongpin/sna.js@0.4.0");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-api-surface")?.actual).toContain("geodist()");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-api-surface")?.detail).toContain("source=lib/sena/model.ts");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity")?.status).toBe("pass");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity")?.actual).toContain("fixture=lib/sena/__fixtures__/r-sna-social-parity.json");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity")?.actual).toContain("graphFamilies=5");
    expect(report.runtimeConsistencyAudit.items.map((item) => item.id)).toContain("jsna-social-matrix");
    const jsnaSocialMatrix = report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-social-matrix");
    expect(jsnaSocialMatrix?.status).toBe("pass");
    expect(jsnaSocialMatrix?.actual).toContain("socialTieRows=");
    expect(Number(jsnaSocialMatrix?.metrics?.labels)).toBe(model.matrices.S.labels.length);
    expect(Number(jsnaSocialMatrix?.metrics?.socialTieRows)).toBe(model.edges.filter((edge) => edge.layer === "social").length);
    expect(Number(jsnaSocialMatrix?.metrics?.alignedTieRows)).toBe(Number(jsnaSocialMatrix?.metrics?.socialTieRows));
    expect(Number(jsnaSocialMatrix?.metrics?.positiveTieRows)).toBeGreaterThan(0);
    expect(Number(jsnaSocialMatrix?.metrics?.evidenceTieRows)).toBeGreaterThan(0);
    expect(jsnaSocialMatrix?.metrics?.labelsAligned).toBe(true);
    expect(jsnaSocialMatrix?.metrics?.rawAligned).toBe(true);
    expect(jsnaSocialMatrix?.metrics?.normalizedAligned).toBe(true);
    expect(jsnaSocialMatrix?.metrics?.socialTieHandoffAligned).toBe(true);
    expect(Array.isArray(jsnaSocialMatrix?.metrics?.socialTiePreview)).toBe(true);
    expect(buildSenaRuntimeConsistencyAudit({
      model,
      enaManifest: report.enaManifest,
      snaManifest: report.snaManifest
    })).toEqual(report.runtimeConsistencyAudit);
    expect(report.pilotReadinessAudit.schemaVersion).toBe("sena-pilot-readiness/v1");
    expect(report.pilotReadinessAudit.status).toBe("ready");
    expect(report.pilotReadinessAudit.reviewNeeded).toBe(0);
    expect(report.pilotReadinessAudit.items.map((item) => item.id)).toContain("runtime-consistency");
    expect(report.pilotReadinessAudit.items.map((item) => item.id)).toContain("model-json-export");
    expect(report.pilotReadinessAudit.items.map((item) => item.id)).toContain("coding-reliability");
    expect(report.pilotReadinessAudit.items.map((item) => item.id)).toContain("data-governance");
    expect(report.pilotReadinessAudit.items.map((item) => item.id)).toContain("human-review");
    expect(buildSenaPilotReadinessAudit({
      model,
      completenessAudit: report.completenessAudit,
      dataContractAudit: report.dataContractAudit,
      runtimeConsistencyAudit: report.runtimeConsistencyAudit,
      fusionMathAudit: report.fusionMathAudit,
      validation: report.validation,
      evidenceLedger: buildSenaEvidenceLedger(model, {
        generatedAt: report.generatedAt,
        evidenceLimit: 12,
        humanReview: report.humanReview
      }),
      humanReview: report.humanReview,
      codingReliabilityGate: report.codingReliabilityGate,
      dataGovernance: report.dataGovernance
    })).toEqual(report.pilotReadinessAudit);
    expect(report.claimReadinessGate.schemaVersion).toBe("sena-claim-readiness-gate/v1");
    expect(report.claimReadinessGate.status).toBe("ready");
    expect(report.claimReadinessGate.claimUse).toBe("research-claim-ready");
    expect(report.claimReadinessGate.reviewNeeded).toBe(0);
    expect(report.claimReadinessGate.items.map((item) => item.id)).toEqual([
      "data-contract",
      "runtime-alignment",
      "fusion-math",
      "evidence-ledger",
      "method-validation",
      "data-governance",
      "coding-reliability",
      "human-review"
    ]);
    expect(report.claimReadinessGate.items.find((item) => item.id === "coding-reliability")?.guardrail).toContain("coding reliability");
    expect(report.claimReadinessGate.guardrail).toContain("data governance");
    expect(report.claimReadinessGate.items.find((item) => item.id === "human-review")?.guardrail).toBe("Exploratory until human review is complete.");
    expect(buildSenaClaimReadinessGate(report.pilotReadinessAudit)).toEqual(report.claimReadinessGate);
    expect(report.evidenceSnippets.length).toBeGreaterThan(0);
    expect(report.evidenceSnippets.length).toBeLessThanOrEqual(12);
    expect(report.evidenceSnippets[0].sourceLabel).toBeTruthy();
    expect(report.validation.metricProvenance.some((metric) => metric.source === "sna.js")).toBe(true);
    expect(report.validation.metricProvenance.some((metric) => metric.source === "sena-self-implemented")).toBe(true);
    expect(report.validation.sensitivity.layerWeights.variants.length).toBeGreaterThanOrEqual(7);
    expect(report.validation.sensitivity.normalization.variants.map((variant) => variant.buildOptions.normalization)).toEqual(["max", "frobenius", "log1p-max"]);
    expect(report.validation.stability.community.deterministicRepeatAgreement).toBe(1);
    expect(report.validation.stability.temporal.variants.map((variant) => variant.mode)).toEqual(["stage", "moving-window", "turn-window"]);
    expect(report.validation.nullModels.permutation.iterations).toBe(12);
    expect(report.validation.nullModels.bootstrap.iterations).toBe(12);
    expect(report.validation.nullModels.permutation.pValueGreaterOrEqual).toBeGreaterThan(0);
    expect(report.validation.nullModels.bootstrap.lower).toBeLessThanOrEqual(report.validation.nullModels.bootstrap.upper);
    expect(report.humanReview.status).toBe("human-reviewed");
    expect(report.humanReview.interpretation).toMatch(/Evidence and explanation/);
  });

  it("records the active analysis window in report JSON and Markdown exports", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const activeWindow = timelineModel.temporal.windows.find((window) => window.label === "Reflection");
    expect(activeWindow).toBeTruthy();

    const model = buildSenaModel(scopeSenaDatasetToWindow(exampleSenaContract, activeWindow!));
    const report = buildSenaReport(model, {
      title: "Reflection Window Report",
      generatedAt: "2026-06-08T01:30:00.000Z",
      activeTemporalWindow: activeWindow,
      sourceDataset: exampleSenaContract,
      humanReview: {
        reviewer: "Window reviewer",
        interpretation: "Reflection window report.",
        limitations: "Window-scoped interpretation.",
        nextActions: "Compare with full-conversation report."
      }
    });
    const markdown = buildSenaMarkdownReport(report);
    const activeTopGPair = report.figures.temporalRuntimeNarrative.find((entry) => entry.strongestGPair)
      ?.strongestGPair?.label;

    expect(report.analysisWindow?.id).toBe(activeWindow?.id);
    expect(report.analysisWindow?.label).toBe("Reflection");
    expect(report.completenessAudit.items.find((item) => item.id === "analysis-scope")?.summary).toContain("Reflection window");
    expect(report.completenessAudit.items.find((item) => item.id === "analysis-scope")?.evidence).toContain(`windowId=${activeWindow?.id}`);
    expect(report.parameters.datasetCounts.utterances).toBeLessThan(exampleSenaContract.utterances.length);
    expect(report.figures.activeWindowComparison?.baselineScope).toBe("full-conversation");
    expect(report.figures.activeWindowComparison?.currentWindow.id).toBe(activeWindow?.id);
    expect(report.figures.activeWindowComparison?.sourceDatasetCounts.utterances).toBe(exampleSenaContract.utterances.length);
    expect(report.figures.activeWindowComparison?.analysisDatasetCounts.utterances).toBe(model.dataset.utterances.length);
    expect(report.figures.activeWindowComparison?.metrics.map((metric) => metric.id)).toEqual([
      "sna-density",
      "social-ties",
      "ena-links",
      "bridge-links",
      "g-total",
      "fusion-total"
    ]);
    expect(report.figures.activeWindowComparison?.metrics.find((metric) => metric.id === "fusion-total")?.share).not.toBeNull();
    expect(report.figures.activeWindowComparison?.topSignals.currentTopConceptTie?.label).toBeTruthy();
    expect(report.figures.activeWindowComparison?.topSignals.baselineTopGPair?.label).toBeTruthy();
    expect(report.figures.activeWindowComparison?.rankingContext.map((entry) => entry.id)).toEqual([
      "top-social-tie",
      "top-concept-tie",
      "top-bridge-tie",
      "top-g-pair"
    ]);
    expect(report.figures.activeWindowComparison?.rankingContext.map((entry) => entry.layer)).toEqual(["S", "W", "B", "G"]);
    expect(report.figures.activeWindowComparison?.rankingContext.find((entry) => entry.id === "top-concept-tie")?.baselineRank).not.toBeNull();
    expect(report.figures.activeWindowComparison?.rankingContext.find((entry) => entry.id === "top-g-pair")?.baselineShare).not.toBeNull();
    expect(report.figures.activeWindowBrief?.schemaVersion).toBe("sena-active-window-brief/v1");
    expect(report.figures.activeWindowBrief?.window.id).toBe(activeWindow?.id);
    expect(report.figures.activeWindowBrief?.dominantSignals.map((signal) => signal.layer)).toEqual(["S", "W", "B", "G"]);
    expect(report.figures.activeWindowBrief?.evidenceCues.length).toBeGreaterThan(0);
    expect(report.figures.activeWindowBrief?.reviewChecklist.map((item) => item.id)).toEqual([
      "active-window-baseline",
      "evidence-ledger",
      "coding-reliability",
      "human-review"
    ]);
    expect(markdown).toContain("Analysis window: Reflection");
    expect(markdown).toContain("- Analysis window: Reflection");
    expect(markdown).toContain("- Window mode: stage");
    expect(markdown).toContain(`- Window turns: ${activeWindow?.startTurn}-${activeWindow?.endTurn}`);
    expect(markdown).toContain(`- Window utterances/interactions/segments: ${activeWindow?.utteranceIds.length}/${activeWindow?.interactionCount}/${activeWindow?.segmentCount}`);
    expect(markdown).toContain("### Visual Grammar");
    expect(markdown).toContain("A1 Inner Solid Mesh Fusion Canvas");
    expect(markdown).toContain("Temporal Fusion Arc");
    expect(markdown).toContain("## Active Window Comparison");
    expect(markdown).toContain("| Metric | Window | Full conversation | Delta | Share |");
    expect(markdown).toContain("| Ranking context | Layer | Current-window top signal | Window weight | Full-conversation weight | Full rank | Full share |");
    expect(markdown).toContain("Top current-window W tie");
    expect(markdown).toContain("## Active Window Brief");
    expect(markdown).toContain("sena-active-window-brief/v1");
    expect(markdown).toContain("### Brief Review Checklist");
    expect(markdown).toContain("Top ENA W link");
    expect(markdown).toContain("Top G pair");
    expect(markdown).toContain("Lead contributor");
    expect(activeTopGPair).toBeTruthy();
    expect(markdown).toContain(activeTopGPair as string);
  });

  it("audits the S/W/B/G fusion equation and flags altered matrix blocks", () => {
    const model = buildSenaModel(exampleSenaContract);
    const audit = buildSenaFusionMathAudit(model);
    const brokenValues = model.matrices.fusion.values.map((row) => [...row]);
    brokenValues[0][0] += 0.25;
    const brokenModel = {
      ...model,
      matrices: {
        ...model.matrices,
        fusion: {
          ...model.matrices.fusion,
          values: brokenValues
        }
      }
    };
    const brokenAudit = buildSenaFusionMathAudit(brokenModel);

    expect(audit.status).toBe("verified");
    expect(audit.items.every((item) => item.status === "pass")).toBe(true);
    expect(audit.matrixFingerprints).toEqual(buildSenaMatrixFingerprints(model));
    expect(audit.matrixFingerprints.map((fingerprint) => fingerprint.shape)).toEqual([
      `${model.matrices.S.labels.length}x${model.matrices.S.labels.length}`,
      `${model.matrices.W.labels.length}x${model.matrices.W.labels.length}`,
      `${model.matrices.B.rowLabels.length}x${model.matrices.B.columnLabels.length}`,
      `${model.matrices.B_PC.rowLabels.length}x${model.matrices.B_PC.columnLabels.length}`,
      `${model.matrices.B_CP.rowLabels.length}x${model.matrices.B_CP.columnLabels.length}`,
      `${model.matrices.G.rowLabels.length}x${model.matrices.G.columnLabels.length}`,
      `${model.matrices.fusion.labels.length}x${model.matrices.fusion.labels.length}`
    ]);
    expect(audit.matrixFingerprints.find((fingerprint) => fingerprint.id === "S")?.totals.raw).toBeGreaterThan(0);
    expect(audit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion")?.checksum).not.toBe(
      brokenAudit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion")?.checksum
    );
    expect(brokenAudit.status).toBe("needs-review");
    expect(brokenAudit.items.find((item) => item.id === "social-block")?.status).toBe("review");
    expect(brokenAudit.items.find((item) => item.id === "social-block")?.maxDelta).toBeGreaterThan(0.2);
  });

  it("builds a standalone fusion math audit artifact for demo export", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const activeWindow = timelineModel.temporal.windows[0];
    expect(activeWindow).toBeTruthy();

    const model = buildSenaModel(scopeSenaDatasetToWindow(exampleSenaContract, activeWindow!));
    const artifact = buildSenaFusionMathAuditArtifact(model, {
      title: "Window Formula Audit",
      generatedAt: "2026-06-08T06:00:00.000Z",
      activeTemporalWindow: activeWindow
    });

    expect(artifact.schemaVersion).toBe("sena-fusion-math-audit-artifact/v1");
    expect(artifact.title).toBe("Window Formula Audit");
    expect(artifact.generatedAt).toBe("2026-06-08T06:00:00.000Z");
    expect(artifact.analysisWindow?.label).toBe(activeWindow?.label);
    expect(artifact.formula).toBe("A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]");
    expect(artifact.parameters.buildOptions).toEqual(model.options);
    expect(artifact.parameters.datasetCounts.codedSegments).toBe(model.dataset.coded_segments.length);
    expect(artifact.fusionMathAudit).toEqual(buildSenaFusionMathAudit(model));
    expect(artifact.fusionMathAudit.status).toBe("verified");
    expect(artifact.fusionMathAudit.matrixFingerprints.map((fingerprint) => fingerprint.id)).toEqual(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
    expect(artifact.matrices.fusion.values).toEqual(model.matrices.fusion.values);
    expect(artifact.notes[0]).toContain("S/W/B/B_PC/B_CP/G");
  });

  it("builds a SENA method protocol from the active mathematical frame", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const activeWindow = timelineModel.temporal.windows.find((window) => window.label === "Reflection");
    expect(activeWindow).toBeTruthy();

    const model = buildSenaModel(scopeSenaDatasetToWindow(exampleSenaContract, activeWindow!));
    const protocol = buildSenaMethodProtocol(model, {
      title: "Reflection Method Protocol",
      generatedAt: "2026-06-08T09:30:00.000Z",
      activeTemporalWindow: activeWindow
    });

    expect(protocol.schemaVersion).toBe("sena-method-protocol/v1");
    expect(protocol.title).toBe("Reflection Method Protocol");
    expect(protocol.generatedAt).toBe("2026-06-08T09:30:00.000Z");
    expect(protocol.analysisWindow?.label).toBe("Reflection");
    expect(protocol.dataContract.requiredTables).toEqual(["people", "interactions", "utterances", "coded_segments", "codebook"]);
    expect(protocol.mathematicalFrame.graphType).toBe("normalized-typed-heterogeneous-adjacency");
    expect(protocol.mathematicalFrame.formula).toBe("A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]");
    expect(protocol.mathematicalFrame.layers.map((layer) => layer.id)).toEqual(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
    expect(protocol.mathematicalFrame.layers.find((layer) => layer.id === "G")?.guardrail).toContain("not as an additional adjacency block");
    expect(protocol.visualGrammar.map((item) => item.id)).toEqual(["fusion-canvas-a1", "temporal-fusion-arc", "ena-space-canonical", "workspace-shell-c3-collapsed-switcher", "fusion-plane-orbit"]);
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("solid purple links");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("outer-orbit social arcs");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("hexagonal person nodes");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("circular ENA concept nodes");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("label plates");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("hidden by default");
    expect(protocol.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("collapsed Plots switcher");
    expect(protocol.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("Apple-style glass tiles");
    expect(protocol.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("Layer Stack glyph");
    expect(protocol.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("Network Metrics glyph");
    expect(protocol.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("metric provenance summary");
    expect(protocol.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.dataMapping).toContain("direct jSNA");
    expect(protocol.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.dataMapping).toContain("SENA-implemented");
    expect(protocol.visualGrammar.find((item) => item.id === "temporal-fusion-arc")?.dataMapping).toContain("temporal windows");
    expect(protocol.visualGrammar.find((item) => item.id === "temporal-fusion-arc")?.dataMapping).toContain("active person-code-pair counts");
    expect(protocol.visualGrammar.find((item) => item.id === "temporal-fusion-arc")?.dataMapping).toContain("strongest G pair labels");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("shared EnaPlot renderer verbatim");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("port docking");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("paper-cased arrowhead");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("S ties never draw inside the plane");
    expect(protocol.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.dataMapping).toContain("corpus-max-anchored normalized S weight");
    expect(protocol.interpretationGuardrails.some((guardrail) => guardrail.includes("visual grammars"))).toBe(true);
    expect(protocol.runtimeIntegration.jena.dependencySpec).toBe("0.6.2");
    expect(protocol.runtimeIntegration.jena.apiSurface).toContain("ena()");
    expect(protocol.runtimeIntegration.jsna.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(protocol.runtimeIntegration.jsna.apiSurface).toContain("geodist()");
    expect(protocol.runtimeParityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.coverage).toContain("lineWeights");
    expect(protocol.runtimeParityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.coverage).toContain("nodePositions");
    expect(protocol.runtimeParityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.coverage).toContain("betweenness");
    expect(protocol.runtimeParityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.coverage).toContain("communities");
    expect(protocol.auditSummary.fusionMath.status).toBe("verified");
    expect(protocol.auditSummary.runtimeConsistency.status).toBe("consistent");
    expect(protocol.runtimeHandoffs.map((handoff) => handoff.id)).toEqual(["jena-concept-matrix", "jsna-social-matrix", "fusion-math"]);
    expect(protocol.runtimeHandoffs.every((handoff) => handoff.status === "pass")).toBe(true);
    expect(protocol.runtimeHandoffs.find((handoff) => handoff.id === "jena-concept-matrix")?.summary).toContain("overlap=");
    expect(protocol.runtimeHandoffs.find((handoff) => handoff.id === "jsna-social-matrix")?.summary).toContain("socialTieRows=");
    expect(protocol.runtimeHandoffs.find((handoff) => handoff.id === "fusion-math")?.summary).toContain("A_fusion=0x");
    expect(protocol.requiredCompanionArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(protocol.requiredCompanionArtifacts).toContain("sena-review-packet.json");
    expect(protocol.requiredCompanionArtifacts).toContain("sena-production-page-contract.json");
    expect(protocol.requiredCompanionArtifacts).toContain("sena-visual-grammar.json");
    expect(protocol.requiredCompanionArtifacts).toContain("sena-metric-provenance.json");
    expect(protocol.requiredCompanionArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(protocol.requiredCompanionArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(protocol.interpretationGuardrails.some((guardrail) => guardrail.includes("standalone metric provenance artifact"))).toBe(true);
    expect(protocol.interpretationGuardrails.some((guardrail) => guardrail.includes("assetIntegrity fingerprints"))).toBe(true);
  });

  it("builds a standalone visual grammar artifact for SENA research handoff", () => {
    const model = buildSenaModel(exampleSenaContract);
    const artifact = buildSenaVisualGrammarArtifact({
      title: "Lesson Study Visual Grammar",
      generatedAt: "2026-06-08T09:40:00.000Z",
      activeTemporalWindow: model.temporal.windows[0]
    });

    expect(artifact.schemaVersion).toBe("sena-visual-grammar/v1");
    expect(artifact.title).toBe("Lesson Study Visual Grammar");
    expect(artifact.workspaceRoute).toBe("/workspace/sena");
    expect(artifact.analysisWindow?.id).toBe(model.temporal.windows[0].id);
    expect(artifact.visualGrammar.map((item) => item.id)).toEqual(["fusion-canvas-a1", "temporal-fusion-arc", "ena-space-canonical", "workspace-shell-c3-collapsed-switcher", "fusion-plane-orbit"]);
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("solid purple links");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("outer-orbit social arcs");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("hexagonal person nodes");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("circular ENA concept nodes");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("link halos");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-canvas-a1")?.visualEncoding).toContain("selecting a person or concept node reveals only that selected node label");
    expect(artifact.visualGrammar.find((item) => item.id === "temporal-fusion-arc")?.interpretationRole).toContain("lesson-study");
    expect(artifact.visualGrammar.find((item) => item.id === "temporal-fusion-arc")?.visualEncoding).toContain("S/W/B/G");
    expect(artifact.visualGrammar.find((item) => item.id === "temporal-fusion-arc")?.visualEncoding).toContain("top G pair labels");
    expect(artifact.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("right-side Primary Plot and Secondary Plot viewports");
    expect(artifact.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("compact Apple-style glass tiles");
    expect(artifact.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("Layer Stack glyph");
    expect(artifact.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("Network Metrics glyph");
    expect(artifact.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.visualEncoding).toContain("metric provenance summary");
    expect(artifact.visualGrammar.find((item) => item.id === "workspace-shell-c3-collapsed-switcher")?.dataMapping).toContain("SENA composite");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("shared EnaPlot renderer verbatim");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("port docking");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("paper-cased arrowhead");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.visualEncoding).toContain("S ties never draw inside the plane");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.dataMapping).toContain("corpus-max-anchored normalized S weight");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.interpretationRole).toContain("explanatory ring");
    expect(artifact.visualGrammar.find((item) => item.id === "fusion-plane-orbit")?.guardrail).toContain("lib/sena/__tests__/fusion-plane-parity.test.tsx");
    expect(artifact.referenceAssets.map((asset) => asset.id)).toEqual([
      "a1-inner-solid-mesh-mockup",
      "a2-dual-rail-ena-mockup",
      "a3-white-core-ena-mockup",
      "temporal-fusion-arc-mockup",
      "workspace-shell-c3-collapsed-switcher-mockup",
      "fusion-plane-orbit-mockup"
    ]);
    expect(artifact.referenceAssets.find((asset) => asset.id === "a1-inner-solid-mesh-mockup")?.role).toBe("alternative-reference");
    expect(artifact.referenceAssets.find((asset) => asset.id === "a1-inner-solid-mesh-mockup")?.path).toBe("output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png");
    expect(artifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.role).toBe("adopted-reference");
    expect(artifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.path).toBe("output/sena-fusion-redesign-options/sena-fusion-plane-orbit.png");
    expect(artifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.relatedGrammarId).toBe("fusion-plane-orbit");
    expect(artifact.referenceAssets.find((asset) => asset.id === "temporal-fusion-arc-mockup")?.role).toBe("adopted-reference");
    expect(artifact.referenceAssets.find((asset) => asset.id === "temporal-fusion-arc-mockup")?.path).toBe("output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png");
    expect(artifact.referenceAssets.find((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup")?.role).toBe("adopted-reference");
    expect(artifact.referenceAssets.find((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup")?.path).toBe("output/sena-workspace-layout-options/sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher.png");
    for (const asset of artifact.referenceAssets) {
      const bytes = readWorkspaceBytes(asset.path);
      expect(asset.bytes).toBe(bytes.length);
      expect(asset.sha256).toBe(sha256Hex(bytes));
    }
    expect(artifact.notes.join(" ")).toContain("A1 Inner Solid Mesh");
    expect(artifact.notes.join(" ")).toContain("Temporal Fusion Arc");
    expect(artifact.notes.join(" ")).toContain("C3 Workspace Shell");
    expect(artifact.notes.join(" ")).toContain("Fusion plane + social orbit grammar (ADR 0009)");
  });

  it("builds a standalone metric provenance artifact for SENA research handoff", () => {
    const model = buildSenaModel(exampleSenaContract);
    const activeWindow = model.temporal.windows[0];
    const artifact = buildSenaMetricProvenanceArtifact(model, {
      title: "Lesson Study Metric Provenance",
      generatedAt: "2026-06-08T09:45:00.000Z",
      activeTemporalWindow: activeWindow
    });

    expect(artifact.schemaVersion).toBe("sena-metric-provenance/v1");
    expect(artifact.title).toBe("Lesson Study Metric Provenance");
    expect(artifact.workspaceRoute).toBe("/workspace/sena");
    expect(artifact.analysisWindow?.id).toBe(activeWindow.id);
    expect(artifact.coverage.totalMetrics).toBe(artifact.metricProvenance.length);
    expect(artifact.coverage.bySource.map((entry) => entry.source)).toEqual(expect.arrayContaining([
      "sna.js",
      "jena-js",
      "sena-self-implemented",
      "sena-composite"
    ]));
    expect(artifact.coverage.bySource.map((entry) => entry.source)).not.toContain("sena-derived-from-sna.js");
    expect(artifact.coverage.byScope.map((entry) => entry.scope)).toEqual(expect.arrayContaining(["social-graph", "social-actor"]));
    expect(artifact.coverage.parityCovered).toBeLessThanOrEqual(artifact.coverage.totalMetrics);
    expect(artifact.metricProvenance.find((metric) => metric.id === "betweenness")?.parityStatus).toContain("R sna::betweenness fixtures");
    expect(artifact.socialMetricSnapshot.graph.tieCount).toBe(model.socialReport.graph.tieCount);
    expect(artifact.socialMetricSnapshot.socialMatrix).toEqual(model.matrices.S);
    expect(artifact.socialMetricSnapshot.socialTieHandoff).toHaveLength(model.edges.filter((edge) => edge.layer === "social").length);
    expect(artifact.socialMetricSnapshot.socialTieHandoff.every((row) => row.matrixAligned)).toBe(true);
    expect(artifact.epistemicMetricSnapshot.manifest.schemaVersion).toBe("sena-ena-manifest/v1");
    expect(artifact.epistemicMetricSnapshot.manifest.status).toBe("computed");
    expect(artifact.epistemicMetricSnapshot.conceptMatrix).toEqual(model.matrices.W);
    expect(artifact.epistemicMetricSnapshot.conceptPairHandoff).toHaveLength((model.codes.length * (model.codes.length - 1)) / 2);
    expect(artifact.epistemicMetricSnapshot.conceptPairHandoff.some((row) => row.overlapStatus === "overlap")).toBe(true);
    expect(artifact.epistemicMetricSnapshot.runtimeConsistencyAudit.status).toBe("consistent");
    expect(artifact.epistemicMetricSnapshot.enaSpace.connectionCounts.length).toBeGreaterThan(0);
    expect(artifact.fusionMetricSnapshot.parameters).toEqual({
      alpha: model.options.alpha,
      beta: model.options.beta,
      gamma: model.options.gamma,
      normalization: model.options.normalization
    });
    expect(artifact.fusionMetricSnapshot.matrices.S).toEqual(model.matrices.S);
    expect(artifact.fusionMetricSnapshot.matrices.W).toEqual(model.matrices.W);
    expect(artifact.fusionMetricSnapshot.matrices.B).toEqual(model.matrices.B);
    expect(artifact.fusionMetricSnapshot.matrices.G).toEqual(model.matrices.G);
    expect(artifact.fusionMetricSnapshot.matrices.fusion).toEqual(model.matrices.fusion);
    expect(artifact.fusionMetricSnapshot.layerTotals.total).toBeGreaterThan(0);
    expect(artifact.notes.join(" ")).toContain("metric source");
    expect(artifact.notes.join(" ")).toContain("parity");
    expect(artifact.notes.join(" ")).toContain("interpretation-limit");
    expect(artifact.notes.join(" ")).toContain("jENA metrics");
    expect(artifact.notes.join(" ")).toContain("SENA composite metrics");
    expect(artifact.notes.join(" ")).toContain("social, epistemic, and fusion snapshots");
  });

  it("audits the five-table data contract and flags reference issues", () => {
    const validModel = buildSenaModel(exampleSenaContract);
    const validAudit = buildSenaDataContractAudit(validModel.dataset, { modelWarnings: validModel.summary.warnings });
    const brokenDataset = {
      ...exampleSenaContract,
      interactions: [
        ...exampleSenaContract.interactions,
        { source: "A", target: "ghost", weight: -1, channel: "reply", stage: "Reflection", turnIndex: 99, evidence: "Bad target" }
      ],
      coded_segments: [
        ...exampleSenaContract.coded_segments,
        {
          segmentId: "bad-ref",
          utteranceId: "missing-utterance",
          personId: "ghost",
          unitId: "team",
          stanzaId: "stanza-x",
          stage: "Reflection",
          turnIndex: Number.NaN,
          text: "Broken reference.",
          codes: ["missing-code"],
          confidence: Number.NaN
        }
      ]
    };
    expect(() => buildSenaModel(brokenDataset)).toThrowError(SenaInputValidationError);
    const brokenAudit = buildSenaDataContractAudit(brokenDataset, {
      modelWarnings: ["Analytical numeric-domain validation failed before model construction."]
    });

    expect(validAudit.status).toBe("valid");
    expect(validAudit.items.every((item) => item.status === "pass")).toBe(true);
    expect(brokenAudit.status).toBe("needs-review");
    expect(brokenAudit.items.find((item) => item.id === "coded-segments-table")?.status).toBe("review");
    expect(brokenAudit.items.find((item) => item.id === "interactions-table")?.status).toBe("review");
    expect(brokenAudit.items.find((item) => item.id === "import-and-model-warnings")?.status).toBe("review");
  });

  it("builds a standalone data contract audit artifact for demo export", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const activeWindow = timelineModel.temporal.windows[0];
    expect(activeWindow).toBeTruthy();

    const model = buildSenaModel(scopeSenaDatasetToWindow(exampleSenaContract, activeWindow!));
    const artifact = buildSenaDataContractAuditArtifact(model, {
      title: "Window Data Audit",
      generatedAt: "2026-06-08T06:30:00.000Z",
      activeTemporalWindow: activeWindow
    });

    expect(artifact.schemaVersion).toBe("sena-data-contract-audit-artifact/v1");
    expect(artifact.title).toBe("Window Data Audit");
    expect(artifact.generatedAt).toBe("2026-06-08T06:30:00.000Z");
    expect(artifact.analysisWindow?.label).toBe(activeWindow?.label);
    expect(artifact.parameters.buildOptions).toEqual(model.options);
    expect(artifact.parameters.datasetCounts.codedSegments).toBe(model.dataset.coded_segments.length);
    expect(artifact.dataContractAudit).toEqual(buildSenaDataContractAudit(model.dataset, { modelWarnings: model.summary.warnings }));
    expect(artifact.dataContractAudit.status).toBe("valid");
    expect(artifact.notes[0]).toContain("people, interactions, utterances, coded_segments, and codebook");
  });

  it("keeps jENA and jSNA runtime provenance aligned with local package metadata", () => {
    const model = buildSenaModel(exampleSenaContract);
    const enaManifest = buildSenaEnaManifest(model.dataset);
    const snaManifest = buildSenaSnaManifest(model);
    const report = buildSenaReport(model);
    const trace = buildSenaTemporalRuntimeTrace(exampleSenaContract);

    expect(jenaRuntimeVersion).toBe(jenaPackage.version);
    expect(snaRuntimeVersion).toBe(snaPackage.version);
    expect(jenaRuntimeDependencySpec).toBe(appPackage.dependencies["jena-js"]);
    expect(snaRuntimeDependencySpec).toBe(appPackage.dependencies["sna.js"]);
    expect(jenaRuntimeDependencySpec).toBe("0.6.2");
    expect(snaRuntimeDependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(senaRuntimeProvenance.enaRuntime.version).toBe(jenaPackage.version);
    expect(senaRuntimeProvenance.snaRuntime.version).toBe(snaPackage.version);
    expect(senaRuntimeProvenance.enaRuntime.packageName).toBe("jena-js");
    expect(senaRuntimeProvenance.snaRuntime.packageName).toBe("@peterhudongpin/sna.js");
    expect(senaRuntimeProvenance.enaRuntime.dependencySpec).toBe(appPackage.dependencies["jena-js"]);
    expect(senaRuntimeProvenance.snaRuntime.dependencySpec).toBe(appPackage.dependencies["sna.js"]);
    expect(senaRuntimeProvenance.enaRuntime.packagePath).toBe("node_modules/jena-js/package.json");
    expect(senaRuntimeProvenance.snaRuntime.packagePath).toBe("node_modules/sna.js/package.json");
    expect(senaRuntimeProvenance.enaRuntime.apiSurface).toEqual(["ena()"]);
    expect(senaRuntimeProvenance.snaRuntime.apiSurface).toEqual([
      "gden()",
      "nties()",
      "degree()",
      "betweenness()",
      "reachability()",
      "averagePathLength()",
      "labelPropagation()",
      "components()",
      "isConnected()",
      "geodist()",
      "grecip()"
    ]);
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.referenceRuntime).toBe("rENA");
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.coverage).toEqual([
      "lineWeights",
      "connectionCounts",
      "variance",
      "unitPoints",
      "nodePositions"
    ]);
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.sample.units).toBe(6);
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.sample.codes).toBe(7);
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.referenceRuntime).toBe("R sna + igraph");
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.coverage).toEqual([
      "degree",
      "weightedDegree",
      "betweenness",
      "closeness",
      "reachable",
      "reciprocity",
      "averagePathLength",
      "components",
      "communities"
    ]);
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.sample.graphFamilies).toBe(5);
    // runtime-constants.ts keeps these as literals (importing the fixtures there
    // would inline them into the client workspace chunk); re-derive each value
    // from the fixture files so the published record cannot drift silently.
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.sample).toEqual({
      units: rEnaSampleParity.points.length,
      codes: rEnaSampleParity.nodes.length,
      dimensions: Object.keys(rEnaSampleParity.variance).length,
      lineWeightRows: rEnaSampleParity.lineWeights.length,
      lineWeightColumns: Object.keys(rEnaSampleParity.lineWeights[0] ?? {}).filter((column) => column !== "participant").length,
      connectionCountRows: rEnaSampleParity.connectionCounts.length,
      connectionCountColumns: Object.keys(rEnaSampleParity.connectionCounts[0] ?? {}).filter((column) => column !== "participant").length
    });
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.sample.graphFamilies).toBe(Object.keys(rSnaSocialParity).length);
    // Source guard: re-importing package.json or the parity fixtures in
    // runtime-constants.ts would inline them into the client workspace chunk
    // (~6 KiB raw, and it makes chunk greps for export-library names match
    // dependency spec strings — see Perf Report P4).
    const runtimeConstantsSource = readFileSync(new URL("../runtime-constants.ts", import.meta.url), "utf8");
    expect(runtimeConstantsSource).not.toMatch(/import\s+(?!type\s)[^;]*from\s+"[^"]*package\.json"/);
    expect(runtimeConstantsSource).not.toMatch(/import\s+(?!type\s)[^;]*from\s+"[^"]*__fixtures__[^"]*"/);
    expect(enaManifest.engineVersion).toBe(jenaPackage.version);
    expect(snaManifest.engineVersion).toBe(snaPackage.version);
    expect(report.runtimeProvenance.enaRuntime.version).toBe(enaManifest.engineVersion);
    expect(report.runtimeProvenance.snaRuntime.version).toBe(snaManifest.engineVersion);
    expect(report.runtimeProvenance.enaRuntime.dependencySpec).toBe("0.6.2");
    expect(report.runtimeProvenance.snaRuntime.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(report.runtimeProvenance.enaRuntime.apiSurface).toContain("ena()");
    expect(report.runtimeProvenance.snaRuntime.apiSurface).toContain("geodist()");
    expect(report.runtimeProvenance.parityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(trace.runtimeProvenance.enaRuntime.version).toBe(jenaPackage.version);
    expect(trace.runtimeProvenance.snaRuntime.version).toBe(snaPackage.version);
    expect(trace.runtimeProvenance.enaRuntime.dependencySpec).toBe("0.6.2");
    expect(trace.runtimeProvenance.snaRuntime.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
  });

  it("builds standalone method validation diagnostics shared by UI and reports", () => {
    const model = buildSenaModel(exampleSenaContract);
    const validation = buildSenaValidation(model, { nullModelIterations: 5 });
    const report = buildSenaReport(model, { nullModelIterations: 5 });

    expect(validation.metricProvenance.some((metric) => metric.source === "sna.js")).toBe(true);
    expect(validation.sensitivity.layerWeights.variants.map((variant) => variant.id)).toContain("gamma-one-half");
    expect(validation.sensitivity.normalization.variants.map((variant) => variant.label)).toEqual(["max", "frobenius", "log1p-max"]);
    expect(validation.stability.community.deterministicRepeatAgreement).toBe(1);
    expect(validation.stability.temporal.variants.map((variant) => variant.mode)).toEqual(["stage", "moving-window", "turn-window"]);
    expect(validation.nullModels.permutation.iterations).toBe(5);
    expect(validation.nullModels.bootstrap.iterations).toBe(5);
    expect(report.validation).toEqual(validation);
  });

  it("builds a review-ready evidence ledger shared with report snippets", () => {
    const model = buildSenaModel(exampleSenaContract);
    const activeWindow = model.temporal.windows.find((window) => window.label === "Evidence Building");
    const ledger = buildSenaEvidenceLedger(model, {
      title: "Evidence Review Queue",
      generatedAt: "2026-06-08T03:00:00.000Z",
      activeTemporalWindow: activeWindow,
      evidenceLimit: 500,
      humanReview: {
        reviewer: "Evidence reviewer",
        interpretation: "Review queue for claims.",
        limitations: "Needs coding reliability notes.",
        nextActions: "Mark include/exclude decisions."
      }
    });
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T03:00:00.000Z",
      evidenceLimit: 500
    });

    expect(ledger.schemaVersion).toBe("sena-evidence-ledger/v1");
    expect(ledger.title).toBe("Evidence Review Queue");
    expect(ledger.analysisWindow?.label).toBe("Evidence Building");
    expect(ledger.parameters.buildOptions).toEqual(model.options);
    expect(ledger.runtimeProvenance.enaRuntime.engine).toBe("jena-js");
    expect(ledger.interpretationGuardrails.some((guardrail) => guardrail.id === "human-review-required")).toBe(true);
    expect(ledger.snippets.length).toBeGreaterThan(0);
    expect(ledger.sourceCounts["social-edge"]).toBeGreaterThan(0);
    expect(ledger.sourceCounts["concept-edge"]).toBeGreaterThan(0);
    expect(ledger.sourceCounts["bridge-edge"]).toBeGreaterThan(0);
    expect(ledger.sourceCounts["pair-contribution"]).toBeGreaterThan(0);
    expect(ledger.sourceCounts["temporal-window"]).toBeGreaterThan(0);
    expect(Object.values(ledger.sourceCounts).reduce((total, count) => total + count, 0)).toBe(ledger.snippets.length);
    expect(ledger.snippets.some((snippet) => snippet.text.includes("evidence"))).toBe(true);
    expect(ledger.snippets.every((snippet) => snippet.lineage)).toBe(true);
    expect(ledger.snippets.some((snippet) => snippet.lineage?.table === "coded_segments" && snippet.lineage.related?.utteranceId)).toBe(true);
    expect(ledger.snippets.some((snippet) => snippet.lineage?.table === "interactions")).toBe(true);
    expect(ledger.humanReview.reviewer).toBe("Evidence reviewer");
    expect(report.evidenceSnippets).toEqual(ledger.snippets);
    expect(buildSenaMarkdownReport(report)).toContain("Lineage: table=");
  });

  it("keeps claim readiness exploratory until data-governance metadata is complete", () => {
    const model = buildSenaModel(exampleSenaContract);
    const sharedOptions = {
      generatedAt: "2026-06-08T04:00:00.000Z",
      evidenceLimit: 80,
      humanReview: {
        status: "human-reviewed" as const,
        reviewer: "Ethics reviewer",
        interpretation: "The SENA graph has been reviewed against the original lesson-study evidence.",
        limitations: "The interpretation is bounded to the consented pilot dataset.",
        nextActions: "Export the review packet for institutional sign-off."
      },
      codingReliability: documentedCodingReliability
    };

    const missingGovernanceReport = buildSenaReport(model, sharedOptions);

    expect(missingGovernanceReport.dataGovernance.status).toBe("needs-review");
    expect(missingGovernanceReport.completenessAudit.items.find((item) => item.id === "data-governance")?.status).toBe("review");
    expect(missingGovernanceReport.pilotReadinessAudit.items.find((item) => item.id === "data-governance")?.status).toBe("review");
    expect(missingGovernanceReport.claimReadinessGate.items.find((item) => item.id === "data-governance")?.status).toBe("review");
    expect(missingGovernanceReport.claimReadinessGate.claimUse).toBe("exploratory-only");
    expect(missingGovernanceReport.claimReadinessGate.blockers).toContain("Data governance");

    const completeGovernanceReport = buildSenaReport(model, {
      ...sharedOptions,
      dataGovernance: documentedDataGovernance
    });

    expect(completeGovernanceReport.dataGovernance.status).toBe("complete");
    expect(completeGovernanceReport.completenessAudit.items.find((item) => item.id === "data-governance")?.status).toBe("pass");
    expect(completeGovernanceReport.pilotReadinessAudit.items.find((item) => item.id === "data-governance")?.status).toBe("ready");
    expect(completeGovernanceReport.claimReadinessGate.items.find((item) => item.id === "data-governance")?.status).toBe("ready");
    expect(completeGovernanceReport.claimReadinessGate.claimUse).toBe("research-claim-ready");
  });

  it("builds a standalone pilot-readiness audit for research demo export", () => {
    const model = buildSenaModel(exampleSenaContract);
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T05:00:00.000Z",
      evidenceLimit: 80,
      humanReview: {
        status: "human-reviewed",
        reviewer: "Pilot reviewer",
        interpretation: "The SENA graph is ready for a local research pilot walkthrough.",
        limitations: "Interpretation remains exploratory and requires coding reliability review.",
        nextActions: "Export readiness, report, and evidence files for team review."
      },
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });

    const readinessExport = buildSenaPilotReadinessAudit({
      model,
      completenessAudit: report.completenessAudit,
      dataContractAudit: report.dataContractAudit,
      runtimeConsistencyAudit: report.runtimeConsistencyAudit,
      fusionMathAudit: report.fusionMathAudit,
      validation: report.validation,
      evidenceLedger: buildSenaEvidenceLedger(model, {
        generatedAt: report.generatedAt,
        evidenceLimit: 80,
        humanReview: report.humanReview
      }),
      humanReview: report.humanReview,
      codingReliabilityGate: report.codingReliabilityGate,
      dataGovernance: report.dataGovernance
    });

    expect(readinessExport).toEqual(report.pilotReadinessAudit);
    expect(readinessExport.schemaVersion).toBe("sena-pilot-readiness/v1");
    expect(readinessExport.status).toBe("ready");
    expect(readinessExport.items.map((item) => item.category)).toEqual([
      "data",
      "model",
      "model",
      "math",
      "runtime",
      "runtime",
      "method",
      "evidence",
      "review",
      "review",
      "review",
      "review"
    ]);
    const modelJsonItem = readinessExport.items.find((item) => item.id === "model-json-export");
    expect(modelJsonItem?.label).toBe("Restorable model JSON export");
    expect(modelJsonItem?.evidence).toContain("artifact=sena-project-snapshot.json");
    expect(modelJsonItem?.summary).toContain("typed edges");
    expect(readinessExport.items.every((item) => item.evidence.length > 0)).toBe(true);
    expect(readinessExport.items.every((item) => item.nextAction.length > 0)).toBe(true);
  });

  it("builds a standalone demo walkthrough from pilot-readiness evidence", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const trace = buildSenaTemporalRuntimeTrace(exampleSenaContract, {}, {
      generatedAt: "2026-06-08T07:00:00.000Z",
      timelineModel
    });
    const model = buildSenaModel(exampleSenaContract);
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T07:00:00.000Z",
      humanReview: {
        status: "human-reviewed",
        reviewer: "Demo reviewer",
        interpretation: "Walkthrough is ready for a local pilot demonstration.",
        limitations: "Demo remains exploratory.",
        nextActions: "Run the six-step workflow with the teaching team."
      },
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });
    const walkthrough = buildSenaDemoWalkthrough(model, {
      title: "Demo Walkthrough",
      generatedAt: "2026-06-08T07:00:00.000Z",
      activeTemporalWindow: model.temporal.windows[0],
      pilotReadinessAudit: report.pilotReadinessAudit,
      temporalRuntimeTrace: trace
    });

    expect(walkthrough.schemaVersion).toBe("sena-demo-walkthrough/v1");
    expect(walkthrough.workspaceRoute).toBe("/workspace/sena");
    expect(walkthrough.summary).toEqual({
      totalSteps: 6,
      readySteps: 6,
      reviewSteps: 0,
      pilotReadinessStatus: "ready"
    });
    expect(walkthrough.steps.map((step) => step.id)).toEqual([
      "data-import",
      "model-builder",
      "fusion-canvas",
      "evidence",
      "temporal-trace",
      "report"
    ]);
    expect(walkthrough.steps.every((step) => step.anchor.startsWith("#workflow-"))).toBe(true);
    expect(walkthrough.steps.find((step) => step.id === "data-import")?.exportArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(walkthrough.steps.find((step) => step.id === "model-builder")?.exportArtifacts).toContain("sena-jena-manifest.json");
    expect(walkthrough.steps.find((step) => step.id === "model-builder")?.exportArtifacts).toContain("sena-ena-report.json");
    expect(walkthrough.steps.find((step) => step.id === "model-builder")?.exportArtifacts).toContain("sena-jsna-manifest.json");
    expect(walkthrough.steps.find((step) => step.id === "model-builder")?.exportArtifacts).toContain("sena-sna-report.json");
    expect(walkthrough.steps.find((step) => step.id === "model-builder")?.exportArtifacts).toContain("sena-runtime-consistency-audit.json");
    expect(walkthrough.steps.find((step) => step.id === "model-builder")?.userAction).toContain("archived formula audit");
    expect(walkthrough.steps.find((step) => step.id === "fusion-canvas")?.exportArtifacts).toContain("sena-visual-grammar.json");
    expect(walkthrough.steps.find((step) => step.id === "evidence")?.exportArtifacts).toContain("sena-person-code-pair-g-report.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-development-plan.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-demo-verification-compatibility-audit.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-production-page-contract.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-metric-provenance.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-method-protocol.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-fusion-math-audit.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-visual-grammar.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-review-packet.json");
    expect(walkthrough.steps.find((step) => step.id === "report")?.exportArtifacts).toContain("sena-analysis-report.md");
    expect(walkthrough.steps.find((step) => step.id === "report")?.userAction).toContain("metric provenance");
    expect(walkthrough.steps.find((step) => step.id === "report")?.userAction).toContain("claim-readiness gate");
    expect(walkthrough.steps.find((step) => step.id === "evidence")?.evidence.length).toBeGreaterThan(0);
  });

  it("builds a manual demo verification checklist with automated evidence", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const trace = buildSenaTemporalRuntimeTrace(exampleSenaContract, {}, {
      generatedAt: "2026-06-08T07:30:00.000Z",
      timelineModel
    });
    const model = buildSenaModel(exampleSenaContract);
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T07:30:00.000Z",
      evidenceLimit: 80
    });
    const verification = buildSenaDemoVerification(model, {
      title: "Demo Verification",
      generatedAt: "2026-06-08T07:30:00.000Z",
      activeTemporalWindow: model.temporal.windows[0],
      pilotReadinessAudit: report.pilotReadinessAudit,
      temporalRuntimeTrace: trace
    });

    expect(verification.schemaVersion).toBe("sena-demo-verification/v1");
    expect(verification.workspaceRoute).toBe("/workspace/sena");
    expect(verification.summary.totalChecks).toBe(6);
    expect(verification.summary.manualPending).toBe(6);
    expect(verification.summary.manualPassed).toBe(0);
    expect(verification.summary.manualFailed).toBe(0);
    expect(verification.summary.requiredArtifacts).toContain("sena-demo-verification.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-jena-manifest.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-ena-report.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-jsna-manifest.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-sna-report.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-metric-provenance.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-person-code-pair-g-report.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-runtime-consistency-audit.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-demo-verification-compatibility-audit.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-production-page-contract.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-development-plan.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-visual-grammar.json");
    expect(verification.summary.requiredArtifacts).toContain("sena-review-packet.json");
    expect(verification.checks.map((check) => check.id)).toEqual([
      "sample-import",
      "weights-and-formula",
      "layout-switching",
      "evidence-inspection",
      "temporal-runtime",
      "report-exports"
    ]);
    expect(verification.checks.find((check) => check.id === "sample-import")?.status).toBe("pass");
    expect(verification.checks.find((check) => check.id === "sample-import")?.manualAction).toContain("assetIntegrity fingerprints");
    expect(verification.checks.find((check) => check.id === "sample-import")?.expectedOutcome).toContain("manifest fingerprints");
    expect(verification.checks.find((check) => check.id === "sample-import")?.observedEvidence).toContain("assetIntegrity=13");
    expect(verification.checks.find((check) => check.id === "sample-import")?.observedEvidence).toContain("assetIntegritySha256=13");
    expect(verification.checks.find((check) => check.id === "sample-import")?.observedEvidence).toContain("handoff=pilot-asset-integrity");
    expect(verification.checks.find((check) => check.id === "report-exports")?.status).toBe("review");
    expect(verification.checks.every((check) => check.manualReview.status === "pending")).toBe(true);
    expect(verification.checks.find((check) => check.id === "temporal-runtime")?.manualAction).toContain("A_fusion checksums");
    expect(verification.checks.find((check) => check.id === "temporal-runtime")?.expectedOutcome).toContain("matrix fingerprints");
    expect(verification.checks.find((check) => check.id === "temporal-runtime")?.observedEvidence).toContain("runtimeWindows=3");
    expect(verification.checks.find((check) => check.id === "temporal-runtime")?.observedEvidence).toContain("matrixFingerprintWindows=3/3");
    expect(verification.checks.find((check) => check.id === "temporal-runtime")?.observedEvidence).toContain("A_fusionChecksums=3");

    const reviewedVerification = buildSenaDemoVerification(model, {
      title: "Demo Verification",
      generatedAt: "2026-06-08T07:35:00.000Z",
      activeTemporalWindow: model.temporal.windows[0],
      pilotReadinessAudit: report.pilotReadinessAudit,
      temporalRuntimeTrace: trace,
      manualReviews: {
        "sample-import": {
          status: "passed",
          reviewer: "Pilot reviewer",
          verifiedAt: "2026-06-08T07:34:00.000Z",
          notes: "Loaded sample and checked contract counts."
        },
        "report-exports": {
          status: "failed",
          reviewer: "Pilot reviewer",
          verifiedAt: "2026-06-08T07:34:30.000Z",
          notes: "Waiting for final report review fields."
        }
      }
    });
    expect(reviewedVerification.summary.manualPending).toBe(4);
    expect(reviewedVerification.summary.manualPassed).toBe(1);
    expect(reviewedVerification.summary.manualFailed).toBe(1);
    expect(reviewedVerification.checks.find((check) => check.id === "sample-import")?.manualReview).toEqual({
      status: "passed",
      reviewer: "Pilot reviewer",
      verifiedAt: "2026-06-08T07:34:00.000Z",
      notes: "Loaded sample and checked contract counts."
    });
    expect(reviewedVerification.checks.find((check) => check.id === "report-exports")?.manualReview.status).toBe("failed");
  });

  it("imports demo verification artifacts for manual-review reapplication", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const trace = buildSenaTemporalRuntimeTrace(exampleSenaContract, {}, {
      generatedAt: "2026-06-08T07:40:00.000Z",
      timelineModel
    });
    const model = buildSenaModel(exampleSenaContract);
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T07:40:00.000Z",
      evidenceLimit: 80
    });
    const verification = buildSenaDemoVerification(model, {
      title: "Imported Demo Verification",
      generatedAt: "2026-06-08T07:40:00.000Z",
      activeTemporalWindow: model.temporal.windows[0],
      pilotReadinessAudit: report.pilotReadinessAudit,
      temporalRuntimeTrace: trace,
      manualReviews: {
        "sample-import": {
          status: "passed",
          reviewer: "Import reviewer",
          verifiedAt: "2026-06-08T07:41:00.000Z",
          notes: "Manual review survives standalone verification import."
        }
      }
    });

    const imported = importSenaDemoVerification(JSON.stringify(verification));
    expect(isSenaDemoVerification(imported)).toBe(true);
    expect(imported.schemaVersion).toBe("sena-demo-verification/v1");
    expect(imported.summary.manualPassed).toBe(1);
    expect(imported.checks.find((check) => check.id === "sample-import")?.manualReview.reviewer).toBe("Import reviewer");

    const compatibleAudit = buildSenaDemoVerificationCompatibilityAudit(model, imported);
    expect(compatibleAudit.schemaVersion).toBe("sena-demo-verification-compatibility/v1");
    expect(compatibleAudit.status).toBe("compatible");
    expect(compatibleAudit.reviewNeeded).toBe(0);

    const mismatchedModel = buildSenaModel(exampleSenaContract, { alpha: 0.12 });
    const mismatchAudit = buildSenaDemoVerificationCompatibilityAudit(mismatchedModel, imported);
    expect(mismatchAudit.status).toBe("mismatch");
    expect(mismatchAudit.items.find((item) => item.id === "build-options")?.status).toBe("review");

    const countMismatchModel = buildSenaModel({
      ...exampleSenaContract,
      interactions: exampleSenaContract.interactions.slice(0, 1)
    });
    const countMismatchAudit = buildSenaDemoVerificationCompatibilityAudit(countMismatchModel, imported);
    expect(countMismatchAudit.status).toBe("mismatch");
    expect(countMismatchAudit.items.find((item) => item.id === "dataset-counts")?.status).toBe("review");
    expect(countMismatchAudit.items.find((item) => item.id === "build-options")?.status).toBe("pass");

    expect(isSenaDemoVerification({ schemaVersion: "sena-demo-verification/v1" })).toBe(false);
    expect(() => importSenaDemoVerification({
      ...verification,
      checks: [{
        ...verification.checks[0],
        manualReview: {
          status: "unknown",
          reviewer: "Import reviewer",
          verifiedAt: "2026-06-08T07:41:00.000Z",
          notes: "Bad status."
        }
      }]
    })).toThrow(/manualReview\.status/i);
  });

  it("builds a local development plan from readiness and verification evidence", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const activeWindow = timelineModel.temporal.windows.find((window) => window.label === "Reflection");
    expect(activeWindow).toBeTruthy();
    const trace = buildSenaTemporalRuntimeTrace(exampleSenaContract, {}, {
      generatedAt: "2026-06-08T07:45:00.000Z",
      timelineModel
    });
    const model = buildSenaModel(exampleSenaContract);
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T07:45:00.000Z",
      evidenceLimit: 80,
      humanReview: {
        status: "human-reviewed",
        reviewer: "Development reviewer",
        interpretation: "The local pilot package is ready for a scoped method walkthrough.",
        limitations: "Production features remain deferred.",
        nextActions: "Use the review packet with the research team."
      },
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });
    const walkthrough = buildSenaDemoWalkthrough(model, {
      title: "Development Walkthrough",
      generatedAt: "2026-06-08T07:45:00.000Z",
      activeTemporalWindow: activeWindow,
      pilotReadinessAudit: report.pilotReadinessAudit,
      temporalRuntimeTrace: trace
    });
    const verification = buildSenaDemoVerification(model, {
      title: "Development Verification",
      generatedAt: "2026-06-08T07:45:00.000Z",
      activeTemporalWindow: activeWindow,
      pilotReadinessAudit: report.pilotReadinessAudit,
      temporalRuntimeTrace: trace
    });
    const plan = buildSenaDevelopmentPlan(model, {
      title: "SENA Local Development Plan",
      generatedAt: "2026-06-08T07:45:00.000Z",
      activeTemporalWindow: activeWindow,
      pilotReadinessAudit: report.pilotReadinessAudit,
      demoWalkthrough: walkthrough,
      demoVerification: verification
    });

    expect(plan.schemaVersion).toBe("sena-development-plan/v1");
    expect(plan.title).toBe("SENA Local Development Plan");
    expect(plan.milestone).toBe("local-research-pilot");
    expect(plan.analysisWindow?.label).toBe("Reflection");
    expect(plan.runtimeIntegration.jena.dependencySpec).toBe("0.6.2");
    expect(plan.runtimeIntegration.jsna.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(plan.runtimeParityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(plan.runtimeParityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity")?.fixturePath).toBe("lib/ena/__fixtures__/r-ena-sample-parity.json");
    expect(plan.runtimeParityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.fixturePath).toBe("lib/sena/__fixtures__/r-sna-social-parity.json");
    expect(plan.scope.inScope).toContain("Local demo readiness for researchers and education pilot users.");
    expect(plan.scope.inScope).toContain("Five-table SENA data contract import, templates, lesson-study sample data, and asset-integrity fingerprints.");
    expect(plan.scope.inScope).toContain("Restorable model JSON snapshot export with graph nodes, typed edges, S/W/B/B_PC/B_CP/G, fusion matrix, and temporal trace.");
    expect(plan.scope.inScope).toContain("Local enterprise-runtime vertical slice for auth, RBAC teams, server-side projects, imports, reliability, validation, publication exports, ops readiness, and redacted organization deployment handoff evidence.");
    expect(plan.scope.inScope).toContain("Institution production cutover acceptance evidence with native adapter certification, platform-owner bridge decisions, release-gate records, go-live rehearsal, and redacted operations handoff for database, object storage, pub/sub, audit/SIEM, backup/restore, alerting, email, IdP, and provisioning.");
    expect(plan.scope.outOfScope).not.toContain("Native managed database, object-storage, collaboration pub/sub, audit/SIEM, and backup/restore adapters beyond the signed webhook bridge handoffs.");
    expect(plan.scope.outOfScope).not.toContain("Billing, tenant administration at SaaS scale, incident escalation ownership, and full SaaS operations backend.");
    expect(plan.workflowAnchors.map((anchor) => anchor.anchor)).toContain("#workflow-report");
    expect(plan.workflowAnchors).toEqual(walkthrough.steps.map((step) => ({
      id: step.id,
      label: step.label,
      anchor: step.anchor,
      status: step.status,
      exportArtifacts: step.exportArtifacts
    })));
    expect(plan.currentGate.pilotReadinessStatus).toBe("ready");
    expect(plan.currentGate.automatedVerification.totalChecks).toBe(6);
    expect(plan.currentGate.automatedVerification.manualPassed).toBe(0);
    expect(plan.currentGate.automatedVerification.manualFailed).toBe(0);
    expect(plan.phases.find((phase) => phase.id === "local-research-pilot")?.status).toBe("active");
    expect(plan.deliveryCandidate.status).toBe("delivery-candidate");
    expect(plan.deliveryCandidate.horizon).toBe("4-week-local-research-pilot");
    expect(plan.deliveryCandidate.priority).toBe("pilot-delivery");
    expect(plan.deliveryCandidate.weeklyPlan.map((week) => week.label)).toEqual([
      "Freeze pilot baseline",
      "Polish researcher workbench",
      "Strengthen research handoff gates",
      "Package delivery candidate"
    ]);
    expect(plan.deliveryCandidate.verificationCommands).toContain("npm run sena:pilot:verify");
    expect(plan.deliveryCandidate.handoffPackage).toContain("sena-runtime-bundle.json");
    expect(plan.deliveryCandidate.handoffPackage).toContain("sena-review-packet.json");
    expect(plan.deliveryCandidate.demoScript.map((step) => step.label)).toEqual([
      "Import data",
      "Review Fusion Canvas",
      "Inspect Temporal Trace",
      "Inspect evidence",
      "Export review packet"
    ]);
    expect(plan.deliveryCandidate.demoScript.find((step) => step.label === "Export review packet")?.zh).toContain("导出 review packet");
    expect(plan.deliveryCandidate.boundaries.join(" ")).toContain("local JavaScript jENA and jSNA runtimes only");
    expect(plan.nextStage.status).toBe("baseline-verified");
    expect(plan.nextStage.horizon).toBe("post-delivery-candidate");
    expect(plan.nextStage.priority).toBe("research-validation-before-platform");
    expect(plan.nextStage.baseline.command).toBe("npm run sena:pilot:verify");
    expect(plan.nextStage.phases.map((phase) => phase.label)).toEqual([
      "Pilot Handoff Freeze",
      "Researcher Walkthrough",
      "Research Validation",
      "Production Platform Acceptance"
    ]);
    expect(plan.nextStage.phases.find((phase) => phase.id === "pilot-handoff-freeze")?.status).toBe("active");
    expect(plan.nextStage.phases.find((phase) => phase.id === "research-validation")?.deliverables).toContain("real research dataset validation notes");
    expect(plan.nextStage.phases.find((phase) => phase.id === "research-validation")?.deliverables).toContain("expanded jENA/rENA parity evidence");
    expect(plan.nextStage.phases.find((phase) => phase.id === "research-validation")?.deliverables).toContain("expanded jSNA/R sna parity evidence");
    expect(plan.nextStage.phases.find((phase) => phase.id === "research-validation")?.blockedUntil?.join(" ")).toContain("real research datasets");
    expect(plan.nextStage.phases.find((phase) => phase.id === "research-validation")?.blockedUntil?.join(" ")).toContain("Coding reliability, uncertainty/stability, and domain expert review evidence");
    expect(plan.nextStage.phases.find((phase) => phase.id === "platform-decision-gate")?.acceptanceCriteria.join(" ")).toContain("accepted bridge, native-ready, or blocked decision evidence");
    expect(plan.nextStage.releaseGate.command).toBe("npm run sena:pilot:verify");
    expect(plan.nextStage.releaseGate.browserAcceptanceScenarios.join(" ")).toContain("Switch Fusion Canvas layouts");
    expect(plan.nextStage.releaseGate.dataScenarios.join(" ")).toContain("Chinese and Cantonese");
    expect(plan.nextStage.releaseGate.dataScenarios.join(" ")).toContain("Incomplete human-review");
    expect(plan.nextStage.releaseGate.regressionRules.join(" ")).toContain("A1 Inner Solid Mesh");
    expect(plan.nextStage.publicInterfacePolicy.join(" ")).toContain("/workspace/sena");
    expect(plan.nextStage.publicInterfacePolicy.join(" ")).toContain("sena-project-snapshot/v1");
    expect(plan.nextStage.assumptions.join(" ")).toContain("exploratory-only");
    expect(plan.nextStage.assumptions.join(" ")).toContain("real-data walkthrough evidence");
    expect(plan.phases.find((phase) => phase.id === "runtime-foundation")?.deliverables).toContain("restorable model JSON snapshot");
    expect(plan.phases.find((phase) => phase.id === "runtime-foundation")?.deliverables).toContain("jENA/rENA parity evidence");
    expect(plan.phases.find((phase) => phase.id === "runtime-foundation")?.deliverables).toContain("jSNA/R sna + igraph parity evidence");
    expect(plan.phases.find((phase) => phase.id === "runtime-foundation")?.exitCriteria.join(" ")).toContain("jSNA/R sna fixture parity");
    expect(plan.phases.find((phase) => phase.id === "local-research-pilot")?.deliverables).toContain("asset-integrity handoff check");
    expect(plan.phases.find((phase) => phase.id === "local-research-pilot")?.deliverables).toContain("restorable model JSON export");
    expect(plan.phases.find((phase) => phase.id === "local-research-pilot")?.deliverables).toContain("archived formula-audit handoff");
    expect(plan.phases.find((phase) => phase.id === "local-research-pilot")?.exitCriteria.join(" ")).toContain("pilot asset-integrity evidence");
    expect(plan.phases.find((phase) => phase.id === "local-research-pilot")?.exitCriteria.join(" ")).toContain("parity evidence");
    expect(plan.phases.find((phase) => phase.id === "research-validation")?.deliverables).toContain("SNA metric parity expansion beyond bundled R sna + igraph fixtures");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.status).toBe("active");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.label).toBe("Institution cutover acceptance evidence");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.scope).toContain("without marking production cutover complete");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.deliverables).toContain("redacted organization deployment handoff package");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.evidence).toContain("deploymentPackage=sena-enterprise-organization-deployment/v1");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.evidence).toContain("nativeAdapterCertification=sena-enterprise-native-adapter-certification/v1");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.evidence).toContain("saasOperationsReadiness=sena-enterprise-saas-operations-readiness/v1");
    expect(plan.phases.find((phase) => phase.id === "production-platform")?.evidence).toContain("goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1");
    expect(plan.requiredArtifacts).toContain("sena-development-plan.json");
    expect(plan.requiredArtifacts).toContain("sena-method-protocol.json");
    expect(plan.requiredArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(plan.requiredArtifacts).toContain("sena-project-snapshot.json");
    expect(plan.requiredArtifacts).toContain("sena-metric-provenance.json");
    expect(plan.requiredArtifacts).toContain("sena-visual-grammar.json");
    expect(plan.requiredArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(plan.requiredArtifacts).toContain("sena-claim-readiness-gate.json");
    for (const artifact of verification.summary.requiredArtifacts) {
      expect(plan.requiredArtifacts).toContain(artifact);
    }
    expect(plan.nextDecisions[0]).toContain("Freeze the verified local pilot handoff package");
    expect(plan.nextDecisions.some((decision) => decision.includes("redacted organization deployment package"))).toBe(true);
  });

  it("builds a complete jENA, jSNA, and SENA runtime bundle", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const activeWindow = timelineModel.temporal.windows.find((window) => window.label === "Reflection");
    expect(activeWindow).toBeTruthy();

    const model = buildSenaModel(scopeSenaDatasetToWindow(exampleSenaContract, activeWindow!));
    const bundle = buildSenaRuntimeBundle(model, {
      title: "Reflection Runtime Bundle",
      generatedAt: "2026-06-08T04:00:00.000Z",
      activeTemporalWindow: activeWindow,
      sourceDataset: exampleSenaContract,
      evidenceLimit: 500,
      demoVerificationManualReviews: {
        "temporal-runtime": {
          status: "passed",
          reviewer: "Runtime reviewer",
          verifiedAt: "2026-06-08T04:05:00.000Z",
          notes: "Window trace reviewed."
        }
      },
      humanReview: {
        reviewer: "Runtime reviewer",
        interpretation: "Runtime bundle for jENA and jSNA review.",
        limitations: "Window-scoped runtime export.",
        nextActions: "Compare runtime artifacts with report claims."
      },
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });

    expect(bundle.schemaVersion).toBe("sena-runtime-bundle/v1");
    expect(bundle.title).toBe("Reflection Runtime Bundle");
    expect(bundle.analysisWindow?.label).toBe("Reflection");
    expect(bundle.report.analysisWindow?.label).toBe("Reflection");
    expect(bundle.parameters.buildOptions).toEqual(model.options);
    expect(bundle.runtimeProvenance.senaModel.engine).toBe("sena-js");
    expect(bundle.runtimeProvenance.enaRuntime.dependencySpec).toBe("0.6.2");
    expect(bundle.runtimeProvenance.snaRuntime.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(bundle.runtimeProvenance.enaRuntime.apiSurface).toContain("ena()");
    expect(bundle.runtimeProvenance.snaRuntime.apiSurface).toContain("geodist()");
    expect(bundle.runtimeProvenance.parityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-jena-manifest.json")?.handoffChecks).toContain("jena-api-surface");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-jena-manifest.json")?.handoffChecks).toContain("jena-rena-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-jsna-manifest.json")?.handoffChecks).toContain("jsna-api-surface");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-jsna-manifest.json")?.handoffChecks).toContain("jsna-r-sna-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-consistency-audit.json")?.handoffChecks).toContain("jena-api-surface");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-consistency-audit.json")?.handoffChecks).toContain("jena-rena-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-consistency-audit.json")?.handoffChecks).toContain("jsna-r-sna-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-consistency-audit.json")?.handoffChecks).toContain("jsna-api-surface");
    expect(bundle.runtimes.ena.engine).toBe("jena-js");
    expect(bundle.runtimes.ena.dependencySpec).toBe("0.6.2");
    expect(bundle.runtimes.ena.manifest.schemaVersion).toBe("sena-ena-manifest/v1");
    expect(bundle.runtimes.ena.manifest.status).toBe("computed");
    expect(bundle.runtimes.sna.engine).toBe("sna.js");
    expect(bundle.runtimes.sna.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(bundle.runtimes.sna.manifest.schemaVersion).toBe("sena-jsna-manifest/v1");
    expect(bundle.runtimes.sna.manifest.engineAlias).toBe("jSNA");
    expect(bundle.runtimes.sna.manifest.outputs?.actorMetrics).toHaveLength(model.people.length);
    expect(bundle.runtimes.sna.socialReport.graph.engine).toBe("sna.js");
    expect(bundle.runtimes.sna.socialMatrix).toEqual(model.matrices.S);
    expect(bundle.runtimes.sena.matrixFormula).toBe("A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]");
    expect(bundle.runtimes.sena.matrices.fusion.values).toEqual(model.matrices.fusion.values);
    expect(bundle.runtimes.sena.pairReport).toEqual(model.pairReport);
    expect(bundle.runtimes.sena.operatorDiagnostics.embedding.mds.delta).toBe("shortest-path-reciprocal-weight");
    expect(bundle.runtimes.sena.operatorDiagnostics.embedding.mds.dimensions).toBe(2);
    expect(bundle.runtimes.sena.operatorDiagnostics.embedding.exploratoryLayout.metricExact).toBe(false);
    expect(bundle.validation).toEqual(bundle.report.validation);
    expect(bundle.codingReliabilityGate).toEqual(bundle.report.codingReliabilityGate);
    expect(bundle.codingReliabilityGate.status).toBe("ready");
    expect(bundle.dataContractAudit).toEqual(bundle.report.dataContractAudit);
    expect(bundle.dataContractAudit.status).toBe("valid");
    expect(bundle.fusionMathAudit).toEqual(bundle.report.fusionMathAudit);
    expect(bundle.fusionMathAudit.status).toBe("verified");
    expect(bundle.fusionMathAudit.matrixFingerprints).toHaveLength(7);
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-bundle.json")?.handoffChecks).toContain("matrix-fingerprints");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-bundle.json")?.evidenceCoverage).toContain("matrixFingerprints=7");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-bundle.json")?.evidenceCoverage.some((entry) => entry.startsWith("A_fusionChecksum=0x"))).toBe(true);
    expect(bundle.pilotReadinessAudit).toEqual(bundle.report.pilotReadinessAudit);
    expect(bundle.pilotReadinessAudit.schemaVersion).toBe("sena-pilot-readiness/v1");
    expect(bundle.claimReadinessGate).toEqual(bundle.report.claimReadinessGate);
    expect(bundle.claimReadinessGate.schemaVersion).toBe("sena-claim-readiness-gate/v1");
    expect(bundle.developmentPlan.schemaVersion).toBe("sena-development-plan/v1");
    expect(bundle.developmentPlan.currentGate.pilotReadinessStatus).toBe(bundle.pilotReadinessAudit.status);
    expect(bundle.developmentPlan.runtimeParityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-development-plan.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-review-packet.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-production-page-contract.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-metric-provenance.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-visual-grammar.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(bundle.demoWalkthrough.schemaVersion).toBe("sena-demo-walkthrough/v1");
    expect(bundle.demoWalkthrough.summary.totalSteps).toBe(6);
    expect(bundle.demoWalkthrough.steps.map((step) => step.anchor)).toContain("#workflow-report");
    expect(bundle.demoVerification.schemaVersion).toBe("sena-demo-verification/v1");
    expect(bundle.demoVerification.summary.totalChecks).toBe(6);
    expect(bundle.demoVerification.summary.manualPending).toBe(5);
    expect(bundle.demoVerification.summary.manualPassed).toBe(1);
    expect(bundle.demoVerification.summary.manualFailed).toBe(0);
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-demo-verification.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-demo-verification-compatibility-audit.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-production-page-contract.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-metric-provenance.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-visual-grammar.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(bundle.demoVerification.checks.find((check) => check.id === "temporal-runtime")?.manualReview.status).toBe("passed");
    expect(bundle.demoVerificationCompatibilityAudit.schemaVersion).toBe("sena-demo-verification-compatibility/v1");
    expect(bundle.demoVerificationCompatibilityAudit.status).toBe("compatible");
    expect(bundle.demoVerificationCompatibilityAudit.reviewNeeded).toBe(0);
    expect(bundle.demoVerificationCompatibilityAudit.items.map((item) => item.id)).toEqual(["dataset-counts", "build-options"]);
    expect(bundle.productionPageContract.schemaVersion).toBe("sena-production-page-contract/v1");
    expect(bundle.productionPageContract.workspaceRoute).toBe("/workspace/sena");
    expect(bundle.productionPageContract.sections.map((section) => section.id)).toContain("temporal-fusion");
    expect(bundle.productionPageContract.sections.map((section) => section.id)).toContain("dual-lens");
    expect(bundle.productionPageContract.sections.map((section) => section.id)).toContain("essential-workbench");
    expect(bundle.productionPageContract.sections.map((section) => section.id)).toContain("method-validation");
    expect(bundle.productionPageContract.sections.map((section) => section.id)).toContain("claim-readiness");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "data-import")?.requiredText).toContain("Package manifest");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "data-import")?.requiredText).toContain("manifest fingerprints");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "data-import")?.requiredText).toContain("JSON contract template");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "data-import")?.requiredText).toContain("SRT/VTT subtitle transcripts");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "data-import")?.requiredText).toContain("TXT/MD transcript cleaning");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "data-import")?.requiredText).toContain("Handoff checks");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "data-import")?.requiredText).toContain("Restorable model JSON export");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("Matrix provenance");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("Formula factor");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("Matrix fingerprint");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("A_fusion fingerprint");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("G attribution");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("G fingerprint");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("Lineage refs");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "evidence-inspector")?.requiredText).toContain("table coded_segments");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("Temporal Fusion Arc");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("evidence refs");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("G pair contributions");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("Raw G pairs");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("Top G pair");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("Top G pair in this window");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("Temporal transition evidence");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("Delta A_fusion");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "temporal-fusion")?.requiredText).toContain("A_fusion checksum");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "layout-controls")?.requiredText).toContain("A1 Inner Solid Mesh");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "layout-controls")?.requiredText).toContain("Dual Lens");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "layout-controls")?.requiredText).toContain("G pair contribution");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "dual-lens")?.requiredText).toContain("Window-scoped conversation, SNA, and ENA");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "dual-lens")?.requiredText).toContain("jSNA social lens");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "dual-lens")?.requiredText).toContain("jENA epistemic lens");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "dual-lens")?.requiredText).toContain("SENA bridge lens");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "formula")).toBeUndefined();
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("Metric provenance");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("sena-metric-provenance/v1");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("jena-js");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("sna.js geodist() component-scoped closeness");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("sna.js labelPropagation()");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("sena-self-implemented");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("sena-composite");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "method-validation")?.requiredText).toContain("R sna::betweenness fixtures");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Production page contract");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Review packet audit");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Method protocol handoff");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export project snapshot");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export reliability gate");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export reliability dashboard");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export claim gate JSON");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export HTML");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export figure SVG");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export figure PNG");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export Excel");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export DOCX");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export PDF");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export publication package");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "review-exports")?.requiredText).toContain("Export report MD");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "delivery-candidate")?.requiredText).toContain("Local research pilot delivery candidate");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "delivery-candidate")?.requiredText).toContain("4-week-local-research-pilot");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "delivery-candidate")?.requiredText).toContain("npm run sena:pilot:verify");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "delivery-candidate")?.requiredText).toContain("sena-review-packet.json");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "next-stage-plan")?.requiredText).toContain("Next-stage development plan");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "next-stage-plan")?.requiredText).toContain("research-validation-before-platform");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "next-stage-plan")?.requiredText).toContain("Pilot Handoff Freeze");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "next-stage-plan")?.requiredText).toContain("Researcher Walkthrough");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "next-stage-plan")?.requiredText).toContain("Research Validation");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "next-stage-plan")?.requiredText).toContain("Production Platform Acceptance");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "next-stage-plan")?.requiredText).toContain("exploratory-only");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "claim-readiness")?.requiredText).toContain("Claim readiness gate");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "claim-readiness")?.requiredText).toContain("sena-claim-readiness-gate/v1");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "claim-readiness")?.requiredText).toContain("sena-claim-readiness-gate.json");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "claim-readiness")?.requiredText).toContain("Coding reliability");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "claim-readiness")?.requiredText).toContain("Data governance");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "claim-readiness")?.requiredText).toContain("Exploratory until coding reliability, data governance");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "coding-reliability")?.requiredText).toContain("sena-coding-reliability-gate/v1");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "coding-reliability")?.requiredText).toContain("sena-coding-reliability-gate.json");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "coding-reliability")?.requiredText).toContain("Coding reliability evidence");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "research-artifact-exports")?.requiredText).toContain("Export metric provenance");
    expect(bundle.productionPageContract.sections.find((section) => section.id === "research-artifact-exports")?.requiredText).toContain("Export evidence ledger");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.id)).toEqual([
      "fusion-canvas-svg-anchor",
      "workspace-shell-rail",
      "workspace-shell-rail-role",
      "workspace-mobile-figure-switcher",
      "workspace-mobile-figure-fusion",
      "workspace-mobile-figure-dual",
      "workspace-research-details-toggle",
      "workspace-research-details-drawer",
      "workspace-research-details-tabs",
      "delivery-candidate-plan",
      "delivery-candidate-plan-role",
      "next-stage-development-plan",
      "next-stage-development-plan-role",
      "workspace-model-layer-stack-icon",
      "workspace-model-layout-plane-orbit",
      "workspace-model-layout-explanatory",
      "workspace-model-layout-ena-space",
      "workspace-model-layout-joint",
      "workspace-joint-embedding-provenance",
      "workspace-joint-embedding-laplacian-operator",
      "workspace-model-layer-social-toggle",
      "workspace-model-layer-concept-toggle",
      "workspace-model-layer-bridge-toggle",
      "workspace-model-alpha-slider",
      "workspace-model-beta-slider",
      "workspace-model-gamma-slider",
      "workspace-model-threshold-slider",
      "workspace-model-normalization-select",
      "workspace-stats-network-metrics-icon",
      "workspace-stats-metric-provenance-summary",
      "workspace-stats-metric-provenance-summary-role",
      "workspace-stats-jena-concept-handoff",
      "workspace-stats-jena-concept-handoff-role",
      "workspace-stats-sna-report-export",
      "workspace-stats-jena-manifest-export",
      "workspace-stats-jsna-manifest-export",
      "workspace-stats-g-report-export",
      "workspace-stats-metric-provenance-export",
      "workspace-plot-switcher",
      "workspace-plot-switcher-role",
      "workspace-plot-tools-dimensions-section",
      "workspace-plot-tools-plotted-points-section",
      "workspace-plot-tools-network-graph-section",
      "workspace-plot-tools-temporal-framing-section",
      "workspace-plot-tools-advanced-drawer",
      "workspace-plot-tools-advanced-drawer-role",
      "workspace-central-plot-deck",
      "workspace-central-plot-deck-role",
      "workspace-central-default-fusion",
      "workspace-central-current-window-scope",
      "workspace-bottom-data-view-drawer",
      "workspace-bottom-data-view-drawer-role",
      "workspace-bottom-data-view-toggle",
      "central-fusion-analysis-scope",
      "central-fusion-analysis-scope-role",
      "central-fusion-evidence-capsule",
      "central-fusion-evidence-capsule-role",
      "central-active-window-brief",
      "central-active-window-brief-role",
      "central-fusion-transition-delta",
      "central-fusion-transition-delta-role",
      "central-fusion-delta-g-pair",
      "central-fusion-delta-g-pair-role",
      "workspace-primary-plot",
      "workspace-primary-plot-role",
      "workspace-secondary-plot",
      "workspace-secondary-plot-role",
      "workspace-secondary-comparison-lens",
      "workspace-secondary-comparison-lens-role",
      "workspace-secondary-ranking-context",
      "workspace-secondary-ranking-context-role",
      "pilot-assets-panel",
      "pilot-assets-panel-role",
      "pilot-asset-link",
      "pilot-asset-manifest-link",
      "pilot-asset-sample-link",
      "pilot-asset-template-link",
      "pilot-asset-integrity",
      "pilot-asset-integrity-role",
      "enterprise-team-operations",
      "enterprise-team-operations-role",
      "enterprise-team-invite-email",
      "enterprise-team-invite-submit",
      "enterprise-team-accept-code",
      "enterprise-team-member-row",
      "enterprise-team-pending-invite",
      "enterprise-sso-preflight",
      "enterprise-sso-preflight-role",
      "enterprise-sso-preflight-schema",
      "enterprise-sso-preflight-run",
      "enterprise-sso-preflight-provider",
      "enterprise-provisioning-readiness",
      "enterprise-provisioning-readiness-role",
      "enterprise-provisioning-readiness-schema",
      "enterprise-provisioning-readiness-refresh",
      "enterprise-provisioning-endpoint",
      "enterprise-provisioning-env",
      "enterprise-provisioning-owner-decision",
      "enterprise-account-security",
      "enterprise-account-security-role",
      "enterprise-mfa-status",
      "enterprise-mfa-setup",
      "enterprise-mfa-enable-code",
      "enterprise-mfa-disable-code",
      "enterprise-session-list",
      "enterprise-session-row",
      "enterprise-session-revoke",
      "enterprise-session-revoke-others",
      "enterprise-session-logout",
      "contract-template-export",
      "pilot-handoff-checks",
      "pilot-handoff-checks-role",
      "pilot-handoff-check",
      "pilot-handoff-model-json",
      "fusion-canvas-center-region",
      "fusion-canvas-center-guide-role",
      "fusion-canvas-ena-solid-link",
      "fusion-canvas-readable-link-halo",
      "fusion-canvas-weighted-link-width",
      "fusion-canvas-link-weight-provenance",
      "fusion-canvas-link-visual-salience",
      "fusion-canvas-layer-key-line-weight-note",
      "fusion-canvas-selected-edge-stroke-provenance",
      "fusion-canvas-selected-node-label-on-click",
      "fusion-canvas-question-node-q-glyph",
      "fusion-canvas-ena-concept-circle-node",
      "fusion-canvas-sna-person-hex-node",
      "fusion-canvas-sna-outer-orbit",
      "fusion-canvas-layer-key",
      "fusion-canvas-g-layer-key",
      "fusion-plane-orbit-svg-anchor",
      "fusion-plane-nested-ena-plot",
      "fusion-orbit-layer-anchor",
      "fusion-orbit-sena-layer",
      "fusion-orbit-social-lane",
      "fusion-orbit-social-arrowhead",
      "fusion-orbit-lane-normalized-weight",
      "fusion-plane-unit-link",
      "fusion-plane-model-footer",
      "sna-orbit-sociogram",
      "metric-provenance-panel",
      "metric-provenance-panel-role",
      "edge-matrix-provenance",
      "edge-matrix-provenance-role",
      "edge-matrix-fingerprint",
      "edge-matrix-fingerprint-role",
      "evidence-lineage",
      "evidence-lineage-role",
      "temporal-fusion-arc",
      "temporal-window-fingerprint",
      "temporal-window-fingerprint-role",
      "temporal-fusion-g-pair-metric",
      "temporal-trace-g-pair-line",
      "temporal-transition-evidence",
      "temporal-transition-summary",
      "temporal-transition-summary-role",
      "data-governance-metadata",
      "claim-readiness-gate",
      "claim-readiness-gate-role",
      "publication-html-export",
      "publication-svg-export",
      "publication-png-export",
      "publication-xlsx-export",
      "publication-docx-export",
      "publication-pdf-export",
      "publication-package-export",
      "enterprise-claim-evidence-package",
      "enterprise-claim-evidence-package-schema",
      "enterprise-expert-review-dossier-export",
      "enterprise-validation-parity-evidence",
      "enterprise-validation-parity-evidence-role",
      "enterprise-validation-parity-evidence-schema",
      "enterprise-validation-walkthrough-evidence",
      "enterprise-validation-parity-export",
      "local-validation-result-export",
      "validation-preregistration-plan-export",
      "validation-holm-suite-run",
      "enterprise-validation-inference-reference",
      "enterprise-formal-inference-readiness",
      "enterprise-formal-inference-readiness-schema",
      "enterprise-platform-decision-review",
      "enterprise-platform-decision-review-schema",
      "enterprise-platform-decision-select",
      "enterprise-platform-decision-status",
      "enterprise-platform-decision-owner",
      "enterprise-platform-decision-evidence",
      "enterprise-platform-decision-production-evidence",
      "enterprise-platform-decision-submit",
      "enterprise-platform-decision-register-export",
      "enterprise-capability-audit-export",
      "enterprise-capability-audit-schema",
      "enterprise-native-adapter-certification-export",
      "enterprise-native-adapter-certification-schema",
      "enterprise-identity-production-evidence-export",
      "enterprise-identity-production-evidence-schema",
      "enterprise-identity-platform-decision-request-packet-schema",
      "enterprise-identity-submission-verifier-schema",
      "enterprise-identity-rotation-freshness-schema",
      "enterprise-saas-operations-readiness-export",
      "enterprise-saas-operations-readiness-schema",
      "enterprise-go-live-rehearsal-export",
      "enterprise-go-live-rehearsal-schema",
      "enterprise-go-live-rollback-drill-schema",
      "enterprise-go-live-rollback-drill-export",
      "enterprise-go-live-monitor-schema",
      "enterprise-go-live-monitor-export",
      "enterprise-go-live-rehearsal-apply-draft",
      "enterprise-go-live-release-gate-draft-schema",
      "enterprise-go-live-attestation-schema",
      "enterprise-go-live-attestation-submit",
      "enterprise-go-live-attestation-export",
      "enterprise-release-gate-review",
      "enterprise-release-gate-review-schema",
      "enterprise-release-gate-identity-snapshot",
      "enterprise-release-gate-identity-snapshot-schema",
      "enterprise-release-gate-decision",
      "enterprise-release-gate-submit",
      "enterprise-release-gate-export",
      "enterprise-import-cleaning-manifest-export",
      "enterprise-governance-exports",
      "enterprise-governance-health-export",
      "enterprise-governance-security-export",
      "enterprise-governance-audit-csv-export",
      "enterprise-governance-backup-export",
      "enterprise-governance-audit-delivery",
      "enterprise-governance-backup-delivery",
      "enterprise-governance-database-sync",
      "enterprise-ops-exports",
      "enterprise-ops-status-export",
      "enterprise-ops-readiness-export",
      "enterprise-ops-deployment-export",
      "enterprise-ops-alerts-export",
      "enterprise-ops-alert-delivery",
      "enterprise-notification-center",
      "enterprise-notification-refresh",
      "enterprise-notification-deliver",
      "enterprise-notification-deliver-email",
      "enterprise-notification-mark-read",
      "enterprise-upload-storage",
      "enterprise-upload-storage-refresh",
      "enterprise-upload-storage-verify",
      "enterprise-upload-storage-deliver",
      "enterprise-upload-storage-file-input",
      "enterprise-upload-storage-transcript-accept",
      "enterprise-collaboration-pubsub-delivery",
      "enterprise-collaboration-pubsub-schema",
      "coding-reliability-gate",
      "coding-reliability-gate-role",
      "coding-reliability-dashboard-export",
      "review-packet-audit",
      "review-packet-audit-role",
      "review-packet-method-protocol-handoff",
      "review-packet-development-plan-handoff",
      "review-packet-project-snapshot-handoff"
    ]);
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"sena-workspace-mode-rail\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"workspace-shell-c3-glass-rail\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"delivery-candidate-plan\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"local-research-pilot-delivery-candidate\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"next-stage-development-plan\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"post-delivery-research-validation-plan\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"model-layout-explanatory\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"model-layout-ena-space\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"model-layout-joint\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"joint-embedding-provenance-strip\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"joint-embedding-operator-laplacian-eigenmaps\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"model-layer-social-toggle\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"model-layer-concept-toggle\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"model-layer-bridge-toggle\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"alpha-slider\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"beta-slider\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"gamma-slider\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"edge-threshold-slider\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"normalization-select\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-icon-name=\"network-metrics\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"stats-metric-provenance-summary\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"stats-metric-provenance-summary\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-stats-sna-report\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-stats-jena-manifest\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-stats-jsna-manifest\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-stats-g-report\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-stats-metric-provenance\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-plot-switcher\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"workspace-shell-collapsed-plot-switcher\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"plot-tools-dimensions-section\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"plot-tools-plotted-points-section\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"plot-tools-network-graph-section\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"plot-tools-temporal-framing-section\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"plot-tools-advanced-drawer\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"webena-plot-tools-advanced-drawer\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-central-plot-deck\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"workspace-central-plot-deck\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-default-plot-view=\"fusion\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-plot-scope=\"current-window\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-data-view-drawer\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"workspace-bottom-data-view-drawer\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-data-view-toggle\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"central-fusion-analysis-scope\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"active-window-fusion-scope\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"central-fusion-evidence-capsule\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"current-window-fusion-evidence-capsule\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"central-active-window-brief\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"active-window-interpretation-brief\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"central-fusion-transition-delta\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"active-window-fusion-transition-delta\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"central-fusion-delta-g-pair\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"active-window-fusion-g-pair-driver\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-primary-plot\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"workspace-primary-plot\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-secondary-plot\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"workspace-secondary-plot\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-secondary-comparison-lens\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"secondary-plot-current-window-comparison\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"workspace-secondary-ranking-context\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"secondary-plot-signal-ranking-context\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"pilot-assets-panel\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"pilot-assets-panel\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"pilot-asset-link\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-asset-kind=\"manifest\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-asset-kind=\"sample\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-asset-kind=\"template\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"pilot-asset-integrity\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"pilot-asset-integrity\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-team-operations\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"enterprise-rbac-team-operations\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-team-invite-email\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-team-invite-submit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-team-accept-code\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-team-member-row\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-team-pending-invite\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-sso-preflight\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"enterprise-sso-preflight\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-sso-preflight/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-sso-preflight-run\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-sso-preflight-provider\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-provisioning-readiness\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"enterprise-provisioning-scim-readiness\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-organization-deployment/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-provisioning-readiness-refresh\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-provisioning-endpoint\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-provisioning-env\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-provisioning-owner-decision\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-account-security\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"enterprise-auth-mfa-controls\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-mfa-status\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-mfa-setup\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-mfa-enable-code\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-mfa-disable-code\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-session-list\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-session-row\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-session-revoke\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-session-revoke-others\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-session-logout\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-contract-template\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"pilot-handoff-checks\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"pilot-handoff-checks\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-handoff-check-id=\"model-json-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"concept-space-guide\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"ena-solid-concept-link\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"fusion-readable-link-halo\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-edge-visual-width=");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-edge-scaled-weight=");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-edge-visual-salience=");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"fusion-layer-key-line-weight-note\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"edge-visual-stroke-provenance\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"sena-node-");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-node-glyph=\"Q\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"ena-concept-circle-node\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"sna-person-hex-node\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-arc-route=\"outer-orbit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"fusion-layer-key\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"fusion-layer-key-g\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"model-layout-plane-orbit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"sena-fusion-plane-orbit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"ena-plot\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"sena-fusion-orbit-layer\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-sena-layer=\"orbit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"orbit-social-lane\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"orbit-social-arrowhead\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-edge-normalized-weight=");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"sena-fusion-unit-link\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-sena-layer=\"model-footer\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"sena-sna-orbit-sociogram\"");
    // The A1 canvas centre guide's pinned stroke is the single-source concept
    // layer stroke, not a literal that can drift from it (P5 re-stepped
    // #895dff to #A06BF5 and orphaned this row until P6).
    expect(bundle.productionPageContract.visualChecks.find((check) => check.id === "fusion-canvas-center-region")?.requiredText)
      .toContain(senaLayerStrokes.concept);
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"metric-provenance-panel\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"sena-metric-provenance\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"stats-jena-concept-handoff\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"stats-jena-concept-pair-handoff\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"edge-matrix-provenance\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"edge-matrix-provenance\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"edge-matrix-fingerprint\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"edge-matrix-fingerprint\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"evidence-lineage\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"five-table-evidence-lineage\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"temporal-fusion-arc\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"temporal-window-fingerprint\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"temporal-window-fingerprint\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"temporal-transition-evidence\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"temporal-transition-summary\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"temporal-transition-summary\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"data-governance-metadata\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"claim-readiness-gate\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"claim-readiness-gate\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-publication-svg\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-publication-png\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-publication-xlsx\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-publication-docx\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-publication-pdf\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-publication-package\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-claim-evidence-package\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-claim-evidence-package/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-expert-review-dossier-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-validation-parity-evidence\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"enterprise-validation-parity-evidence\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-validation-parity-evidence/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-validation-walkthrough-evidence\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-validation-parity-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-local-validation-result\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"export-validation-preregistration-plan\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"run-validation-suite\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-validation-inference-reference\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-formal-inference-readiness\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-formal-inference-readiness/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-review\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-platform-decision-acceptance/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-select\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-status\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-owner\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-evidence\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-production-evidence\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-submit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-platform-decision-register-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-capability-audit-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-capability-audit/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-native-adapter-certification-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-native-adapter-certification/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-identity-production-evidence-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-identity-production-evidence/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-identity-platform-decision-request-packet/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-identity-submission-verifier/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-identity-rotation-freshness/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-saas-operations-readiness-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-saas-operations-readiness/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-go-live-rehearsal-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-go-live-rehearsal/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-go-live-rollback-drill-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-go-live-rollback-drill/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-go-live-monitor-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-go-live-monitor/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-go-live-rehearsal-apply-draft\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-release-gate-draft/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-go-live-attestation/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-go-live-attestation-submit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-go-live-attestation-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-release-gate-review\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-release-gate-review/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-release-gate-identity-snapshot\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-release-gate-identity-snapshot-schema\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-release-gate-decision\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-release-gate-submit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-release-gate-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-import-cleaning-manifest-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-exports\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-health-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-security-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-audit-csv-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-backup-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-audit-delivery\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-backup-delivery\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-governance-database-sync\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-ops-exports\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-ops-status-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-ops-readiness-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-ops-deployment-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-ops-alerts-export\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-ops-alert-delivery\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-notification-center\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-notification-refresh\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-notification-deliver\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-notification-deliver-email\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-notification-mark-read\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-upload-storage\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-upload-storage-refresh\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-upload-storage-verify\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-upload-storage-deliver\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-upload-storage-file-input\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain(".srt,.vtt");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"enterprise-collaboration-pubsub-delivery\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("sena-enterprise-collaboration-pubsub-delivery/v1");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-testid=\"review-packet-audit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-visual-role=\"review-packet-audit\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-audit-id=\"method-protocol-handoff\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-audit-id=\"development-plan-handoff\"");
    expect(bundle.productionPageContract.visualChecks.map((check) => check.requiredText)).toContain("data-audit-id=\"project-snapshot-handoff\"");
    expect(bundle.temporalRuntimeTrace.schemaVersion).toBe("sena-temporal-runtime-trace/v1");
    expect(bundle.temporalRuntimeTrace.sourceDatasetCounts.utterances).toBe(exampleSenaContract.utterances.length);
    expect(bundle.temporalRuntimeTrace.windows.map((entry) => entry.window.label)).toEqual(timelineModel.temporal.windows.map((window) => window.label));
    expect(bundle.temporalRuntimeTrace.windows.every((entry) => entry.ena.status === "computed")).toBe(true);
    expect(bundle.temporalRuntimeTrace.windows.every((entry) => entry.sna.status === "computed")).toBe(true);
    expect(bundle.temporalRuntimeTrace.windows.every((entry) => entry.sena.matrixFingerprints.length === 7)).toBe(true);
    expect(bundle.temporalRuntimeTrace.windows.every((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))).toBe(true);
    expect(bundle.evidenceLedger.snippets.length).toBeGreaterThan(0);
    expect(bundle.evidenceLedger.humanReview.reviewer).toBe("Runtime reviewer");
    expect(bundle.artifactEvidence.map((artifact) => artifact.filename)).toEqual([
      "sena-jena-manifest.json",
      "sena-ena-report.json",
      "sena-jsna-manifest.json",
      "sena-sna-report.json",
      "sena-metric-provenance.json",
      "sena-person-code-pair-g-report.json",
      "sena-runtime-consistency-audit.json",
      "sena-pilot-package-manifest.json",
      "sena-coding-reliability-gate.json",
      "sena-runtime-bundle.json"
    ]);
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.schemaVersion).toBe("sena-ena-report/v1");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.matrixCoverage).toContain(`W=${model.matrices.W.raw.length}x${model.matrices.W.raw[0]?.length ?? 0}`);
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.matrixCoverage).toContain("rENAParity=pass");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.handoffChecks).toContain("jena-rena-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.handoffChecks).toContain("jena-concept-matrix");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.schemaVersion).toBe("sena-sna-report/v1");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.matrixCoverage).toContain(`S=${model.matrices.S.raw.length}x${model.matrices.S.raw[0]?.length ?? 0}`);
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.handoffChecks).toContain("jsna-social-matrix");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.handoffChecks).toContain("jsna-r-sna-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.matrixCoverage).toContain("RSnaParity=pass");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.schemaVersion).toBe("sena-metric-provenance/v1");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.downloadControl).toBe("Export metric provenance");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.matrixCoverage).toContain(`metrics=${bundle.report.validation.metricProvenance.length}`);
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.matrixCoverage).toContain("snapshots=social|epistemic|fusion");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.evidenceCoverage).toContain("betweenness:sna.js");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("metric-provenance");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("jsna-social-matrix");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("jena-concept-matrix");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("fusion-matrix-snapshot");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-pilot-package-manifest.json")?.schemaVersion).toBe("sena-pilot-package-manifest/v1");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-pilot-package-manifest.json")?.matrixCoverage).toContain("assetIntegrity=13");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-pilot-package-manifest.json")?.evidenceCoverage).toContain("sha256=13");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-pilot-package-manifest.json")?.handoffChecks).toContain("pilot-asset-integrity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-coding-reliability-gate.json")?.schemaVersion).toBe("sena-coding-reliability-gate/v1");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-coding-reliability-gate.json")?.matrixCoverage).toContain(`claimUse=${bundle.codingReliabilityGate.claimUse}`);
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-coding-reliability-gate.json")?.handoffChecks).toContain("coding-reliability-gate");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-bundle.json")?.matrixCoverage).toContain(`A_fusion=${model.matrices.fusion.labels.length}`);
    expect(bundle.artifactEvidence.every((artifact) => artifact.status === "ready")).toBe(true);
    expect(bundle.report.runtimeProvenance.snaRuntime.engine).toBe("sna.js");
  });

  it("exposes enterprise platform decision review controls in the SENA workspace", () => {
    const documentation = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" });
    const platformEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions");
    const releaseGateEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate");
    const goLiveEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal");
    const validationEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-group-comparison");
    const publicationEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export");

    expect(platformEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions);
    expect(platformEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionAcceptance,
      SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionProductionEvidenceReceipt,
      SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionRegister,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence
    ]));
    expect(releaseGateEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.releaseGate);
    expect(releaseGateEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
      SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionVerifier,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist
    ]));
    expect(releaseGateEndpoint?.request)
      .toEqual(expect.stringContaining("identityProductionSnapshot.cutoverChecklist"));
    expect(goLiveEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal);
    expect(goLiveEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal,
      SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft,
      SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestation
    ]));
    expect(validationEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.groupComparisonSuite,
      SENA_SCHEMA_VERSIONS.formalInferenceReadiness,
      SENA_SCHEMA_VERSIONS.validationRunReview
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.schemaVersions).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.groupComparisonSuite,
      SENA_SCHEMA_VERSIONS.expertReviewResponse,
      SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage
    ]));
    expect(SENA_SCHEMA_VERSIONS.validationParityEvidence).toBe("sena-validation-parity-evidence/v1");
    expect(SENA_SCHEMA_VERSIONS.formalInferenceReadiness).toBe("sena-formal-inference-readiness/v1");
    expect(publicationEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.publicationExport);
    expect(publicationEndpoint?.request).toEqual(expect.stringContaining("html|svg|png|xlsx|docx|pdf|package"));
    expect(publicationEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.publicationPackage,
      SENA_SCHEMA_VERSIONS.publicationSourceSnapshot,
      SENA_SCHEMA_VERSIONS.publicationVerificationCertificate
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.publicationFormats).toEqual(expect.arrayContaining([
      "svg",
      "png",
      "xlsx",
      "docx",
      "pdf"
    ]));
  });

  it("uses the active server project as the publication export source", async () => {
    const calls: Array<{ url: string; init?: RequestInit; body: unknown }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        init,
        body: parseRecordedBody(init)
      });
      return new Response("publication", {
        status: 200,
        headers: { "content-disposition": 'attachment; filename="sena-publication.pdf"' }
      });
    };

    const serverProjectExport = await exportEnterprisePublicationAction(
      {
        teamId: "team-1",
        format: "pdf",
        projectId: "project-1"
      },
      { jsonHeaders: testEnterpriseJsonHeaders, fetchImpl }
    );
    const snapshotExport = await exportEnterprisePublicationAction(
      {
        teamId: "team-1",
        format: "package",
        snapshot: { schemaVersion: "sena-project-snapshot/v1", id: "snapshot-1" }
      },
      { jsonHeaders: testEnterpriseJsonHeaders, fetchImpl }
    );

    expect(SENA_WORKSPACE_API_ROUTES.publicationExport).toBe("/api/sena/exports/publication");
    expect(serverProjectExport.filename).toBe("sena-publication.pdf");
    expect(snapshotExport.filename).toBe("sena-publication.pdf");
    expect(calls.map((call) => call.url)).toEqual([
      SENA_WORKSPACE_API_ROUTES.publicationExport,
      SENA_WORKSPACE_API_ROUTES.publicationExport
    ]);
    expect(calls[0].body).toEqual({
      teamId: "team-1",
      format: "pdf",
      projectId: "project-1"
    });
    expect(calls[1].body).toEqual({
      teamId: "team-1",
      format: "package",
      snapshot: { schemaVersion: "sena-project-snapshot/v1", id: "snapshot-1" }
    });
  });

  it("uses server session expiry for SSO session cookies", () => {
    const ssoCookieRoutes = SENA_IMPLEMENTED_API_ROUTES.filter((route) => route.sessionCookie?.maxAgeSource === "session.expiresAt");

    expect(ssoCookieRoutes.map((route) => route.id)).toEqual(expect.arrayContaining([
      "auth-login",
      "auth-register",
      "auth-sso",
      "auth-sso-callback"
    ]));
    expect(ssoCookieRoutes.find((route) => route.id === "auth-sso")).toMatchObject({
      path: "/api/auth/sso",
      sessionCookie: {
        name: "sena_session",
        maxAgeSource: "session.expiresAt",
        optionsHelper: "sessionCookieOptions",
        maxAgeHelper: "sessionCookieMaxAgeSeconds"
      }
    });
    expect(ssoCookieRoutes.find((route) => route.id === "auth-sso-callback")).toMatchObject({
      path: "/api/auth/sso/callback",
      sessionCookie: {
        maxAgeSource: "session.expiresAt"
      }
    });
  });

  it("sets production browser security headers in the Next proxy", () => {
    const headers = buildSenaSecurityHeaders();

    expect(SENA_SECURITY_HEADER_MANIFEST.cspDirectives).toEqual(expect.arrayContaining([
      "default-src 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ]));
    expect(headers).toMatchObject({
      "content-security-policy-report-only": expect.stringContaining("default-src 'self'"),
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
      "x-sena-runtime": "enterprise-local"
    });
  });

  it("reports managed Postgres or Neon in the runtime header only when primary state env is complete", () => {
    expect(resolveSenaRuntimeHeader({
      SENA_ENTERPRISE_DB_ADAPTER: "neon",
      SENA_ENTERPRISE_STATE_STORE: "postgres",
      DATABASE_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
    })).toBe("enterprise-neon");
    expect(resolveSenaRuntimeHeader({
      SENA_ENTERPRISE_DB_ADAPTER: "postgres",
      SENA_ENTERPRISE_STATE_STORE: "postgres",
      SENA_ENTERPRISE_POSTGRES_URL: "postgres://sena_user:super-secret@example.com/senadb"
    })).toBe("enterprise-postgres");
    expect(resolveSenaRuntimeHeader({
      SENA_ENTERPRISE_DB_ADAPTER: "neon",
      DATABASE_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
    })).toBe("enterprise-local");
    expect(buildSenaSecurityHeaders({
      SENA_ENTERPRISE_DB_ADAPTER: "neon",
      SENA_ENTERPRISE_STATE_STORE: "postgres",
      POSTGRES_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
    })).toMatchObject({
      "x-sena-runtime": "enterprise-neon"
    });
    expect(resolveSenaRuntimeHeader({
      SENA_ENTERPRISE_DB_ADAPTER: "neon",
      SENA_ENTERPRISE_STATE_STORE: "postgres",
      POSTGRES_PRISMA_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
    })).toBe("enterprise-neon");
  });

  it("exposes enterprise governance export controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGovernance
    });
    const csvCalls: string[] = [];
    const csvFetch: typeof fetch = async (input) => {
      csvCalls.push(String(input));
      return new Response("created_at,event\n2026-06-21T00:00:00.000Z,export\n", { status: 200 });
    };

    await exportEnterpriseJsonArtifactAction(
      SENA_WORKSPACE_API_ROUTES.enterprise.health,
      "Enterprise governance health",
      { fetchImpl: recorder.fetchImpl }
    );
    await exportEnterpriseJsonArtifactAction(
      SENA_WORKSPACE_API_ROUTES.enterprise.security,
      "Enterprise security posture",
      { fetchImpl: recorder.fetchImpl }
    );
    const auditCsv = await exportEnterpriseAuditCsvAction({ teamId: "team 1" }, { fetchImpl: csvFetch });
    await exportEnterpriseJsonArtifactAction(
      SENA_WORKSPACE_API_ROUTES.enterprise.backup,
      "Enterprise backup",
      { fetchImpl: recorder.fetchImpl }
    );

    expect(recorder.calls.map((call) => call.url)).toEqual([
      SENA_WORKSPACE_API_ROUTES.enterprise.health,
      SENA_WORKSPACE_API_ROUTES.enterprise.security,
      SENA_WORKSPACE_API_ROUTES.enterprise.backup
    ]);
    expect(csvCalls).toEqual(["/api/sena/governance/audit?format=csv&integrity=1&teamId=team+1"]);
    expect(auditCsv).toContain("created_at,event");
  });

  it("wires data-governance metadata controls through workspace reports and snapshots", () => {
    const model = buildSenaModel(exampleSenaContract);
    const governance = {
      irbApprovalId: "HKLS-GOV-2026",
      consentScope: "Teacher lesson-study discussion research use.",
      retentionPolicy: "De-identified data retained through the pilot closeout.",
      usageConstraints: ["internal research team only", "no production claim without review"],
      dataSteward: "Pilot data steward"
    };
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-21T00:00:00.000Z",
      dataGovernance: governance
    });
    const snapshot = buildSenaProjectSnapshot(model, {
      generatedAt: "2026-06-21T00:00:00.000Z",
      dataGovernance: governance
    });

    expect(report.dataGovernance).toMatchObject({
      schemaVersion: SENA_SCHEMA_VERSIONS.dataGovernanceMetadata,
      status: "complete",
      irbApprovalId: "HKLS-GOV-2026",
      dataSteward: "Pilot data steward"
    });
    expect(report.dataGovernance.usageConstraints).toEqual(governance.usageConstraints);
    expect(report.claimReadinessGate.items.find((item) => item.id === "data-governance")?.status).toBe("ready");
    expect(snapshot.dataGovernance).toEqual(report.dataGovernance);
    expect(snapshot.report.dataGovernance).toEqual(report.dataGovernance);
  });

  it("exposes enterprise ops export controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({ schemaVersion: "sena-enterprise-ops-export-fixture/v1" });
    const deployment = getEnterpriseOrganizationDeploymentPackage({ teamId: "team 1" });
    const deploymentEndpoint = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment");

    await exportEnterpriseJsonArtifactAction(SENA_WORKSPACE_API_ROUTES.enterprise.opsStatus, "Enterprise ops status", {
      fetchImpl: recorder.fetchImpl
    });
    await exportEnterpriseJsonArtifactAction(SENA_WORKSPACE_API_ROUTES.enterprise.opsReadiness, "Enterprise ops readiness", {
      fetchImpl: recorder.fetchImpl
    });
    await exportEnterpriseJsonArtifactAction(SENA_WORKSPACE_API_ROUTES.enterprise.deployment, "Enterprise deployment package", {
      fetchImpl: recorder.fetchImpl
    });
    await exportEnterpriseJsonArtifactAction(SENA_WORKSPACE_API_ROUTES.enterprise.opsAlerts, "Enterprise ops alerts", {
      fetchImpl: recorder.fetchImpl
    });

    expect(recorder.calls.map((call) => call.url)).toEqual([
      SENA_WORKSPACE_API_ROUTES.enterprise.opsStatus,
      SENA_WORKSPACE_API_ROUTES.enterprise.opsReadiness,
      SENA_WORKSPACE_API_ROUTES.enterprise.deployment,
      SENA_WORKSPACE_API_ROUTES.enterprise.opsAlerts
    ]);
    expect(buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.deployment, { teamId: "team 1" }))
      .toBe("/api/sena/ops/deployment?teamId=team+1");
    expect(deployment.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment);
    expect(deployment.identityProductionHandoff.schemaVersion)
      .toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence);
    expect(deployment.identityProductionHandoff.platformRequestPacket.schemaVersion)
      .toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentityPlatformDecisionRequestPacket);
    expect(deployment.identityProductionHandoff.institutionActionPlan.redaction.secretValuesExcluded).toBe(true);
    expect(deployment.identityProductionHandoff.platformRequestPacket.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("requestPacketPolicyHash="),
      expect.stringContaining("requestPacketPolicyBinding=")
    ]));
    expect(deployment.identityProductionHandoff.platformRequestPacket.submission.requiredBodyFields.length)
      .toBeGreaterThan(0);
    expect(deployment.identityProductionHandoff.platformRequestPacket.submission.identityProductionEvidenceBodyFields.length)
      .toBeGreaterThan(0);
    expect(deploymentEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.deployment);
    expect(deploymentEndpoint?.request).toEqual(expect.stringContaining("team-scoped organization deployment handoff package"));
    expect(deploymentEndpoint?.request).toEqual(expect.stringContaining("identityProductionHandoff includes the redacted identity production evidence dossier"));
    expect(deploymentEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment,
      SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionRegister,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence
    ]));
  });

  it("exposes enterprise signed delivery bridge controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({
      status: "accepted",
      summary: { delivered: 1, failed: 0, skipped: 0 }
    });

    await deliverEnterpriseAuditLogAction({ teamId: "team-1" }, {
      jsonHeaders: testEnterpriseJsonHeaders,
      fetchImpl: recorder.fetchImpl
    });
    await deliverEnterpriseBackupAction({ teamId: "team-1" }, {
      jsonHeaders: testEnterpriseJsonHeaders,
      fetchImpl: recorder.fetchImpl
    });
    await syncEnterpriseDatabaseAction({ teamId: "team-1" }, {
      jsonHeaders: testEnterpriseJsonHeaders,
      fetchImpl: recorder.fetchImpl
    });
    await deliverEnterpriseOpsAlertsAction({
      jsonHeaders: testEnterpriseJsonHeaders,
      fetchImpl: recorder.fetchImpl
    });

    expect(recorder.calls.map((call) => call.url)).toEqual([
      SENA_WORKSPACE_API_ROUTES.enterprise.audit,
      SENA_WORKSPACE_API_ROUTES.enterprise.backup,
      SENA_WORKSPACE_API_ROUTES.enterprise.backup,
      SENA_WORKSPACE_API_ROUTES.enterprise.opsAlerts
    ]);
    expect(recorder.calls.map((call) => call.init?.method)).toEqual(["POST", "POST", "POST", "POST"]);
    expect(recorder.calls[0].body).toEqual({ teamId: "team-1", force: true, limit: 100 });
    expect(recorder.calls[1].body).toEqual({ action: "deliver", teamId: "team-1" });
    expect(recorder.calls[2].body).toEqual({ action: "sync-database", teamId: "team-1" });
    expect(recorder.calls[3].body).toEqual({ action: "deliver" });
  });

  it("exposes enterprise SSO preflight controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({
      preflight: {
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight,
        generatedAt: "2026-06-21T00:00:00.000Z",
        baseUrl: "https://sena.example.test",
        summary: {
          checked: 1,
          passed: 1,
          review: 0,
          configuredProviders: 1
        },
        providers: [
          {
            provider: "google",
            status: "pass",
            mode: "oauth-oidc",
            configured: true,
            generatedAt: "2026-06-21T00:00:00.000Z",
            endpointHashes: {},
            checks: []
          }
        ]
      }
    });

    const preflight = await runEnterpriseSsoPreflightAction("google", {
      fetchImpl: recorder.fetchImpl
    });

    expect(SENA_WORKSPACE_API_ROUTES.auth.ssoPreflight).toBe("/api/auth/sso?status=1&preflight=1");
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].url).toBe("/api/auth/sso?status=1&preflight=1&provider=google");
    expect(preflight.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight);
    expect(preflight.providers[0]?.provider).toBe("google");
  });

  it("exposes enterprise provisioning and SCIM readiness controls in the SENA workspace", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith(SENA_WORKSPACE_API_ROUTES.enterprise.deployment)) {
        return new Response(JSON.stringify({
          schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment,
          status: "review",
          summary: {
            identityProductionStatus: "review",
            identitySubmissionVerifierIncomplete: 1,
            identityRotationFreshness: "stale",
            openPlatformDecisions: 2
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
        platformRequestPacket: {
          summary: {
            blockingRequests: 1
          }
        },
        institutionActionPlan: {
          lanes: [
            {
              laneId: "institution-provisioning-owner",
              missingProductionEvidenceIds: []
            }
          ]
        }
      }), { status: 200 });
    };

    const readiness = await refreshEnterpriseProvisioningReadinessAction(
      { teamId: "team 1" },
      { fetchImpl }
    );

    expect(calls).toEqual([
      "/api/sena/ops/deployment?teamId=team+1",
      "/api/sena/ops/identity-production-evidence?teamId=team+1"
    ]);
    expect(readiness.deployment.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseOrganizationDeployment);
    expect(readiness.identityEvidence.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence);
    expect(readiness.identityEvidence.institutionActionPlan.lanes[0]?.laneId).toBe("institution-provisioning-owner");
  });

  it("exposes enterprise session logout controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({ ok: true });

    await logoutEnterpriseSessionAction({
      jsonHeaders: testEnterpriseJsonHeaders,
      fetchImpl: recorder.fetchImpl
    });

    expect(SENA_WORKSPACE_API_ROUTES.auth.logout).toBe("/api/auth/logout");
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({
      url: SENA_WORKSPACE_API_ROUTES.auth.logout,
      body: undefined
    });
    expect(recorder.calls[0].init?.method).toBe("POST");
  });

  it("exposes enterprise notification center controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({ notifications: [] });

    await deliverEnterpriseNotificationsAction(
      { delivery: "notifications", teamId: "team-1" },
      { jsonHeaders: testEnterpriseJsonHeaders, fetchImpl: recorder.fetchImpl }
    );
    await deliverEnterpriseNotificationsAction(
      { delivery: "email", teamId: "team-1" },
      { jsonHeaders: testEnterpriseJsonHeaders, fetchImpl: recorder.fetchImpl }
    );
    await markEnterpriseNotificationReadAction(
      { notificationId: "notification-1" },
      { jsonHeaders: testEnterpriseJsonHeaders, fetchImpl: recorder.fetchImpl }
    );

    expect(recorder.calls.map((call) => call.url)).toEqual([
      SENA_WORKSPACE_API_ROUTES.enterprise.notifications,
      SENA_WORKSPACE_API_ROUTES.enterprise.notifications,
      SENA_WORKSPACE_API_ROUTES.enterprise.notifications
    ]);
    expect(recorder.calls.map((call) => call.init?.method)).toEqual(["POST", "POST", "PATCH"]);
    expect(recorder.calls[0].body).toEqual({ action: "deliver", teamId: "team-1", force: true });
    expect(recorder.calls[1].body).toEqual({ action: "deliver-email", teamId: "team-1", force: true });
    expect(recorder.calls[2].body).toEqual({ notificationId: "notification-1" });
  });

  it("exposes enterprise upload storage controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({
      schemaVersion: SENA_SCHEMA_VERSIONS.uploadList,
      uploads: []
    });

    await refreshEnterpriseUploadStorageAction({ teamId: "team-1", verify: true }, {
      fetchImpl: recorder.fetchImpl
    });
    await createEnterpriseUploadRegistryFilesAction(
      {
        teamId: "team-1",
        files: [new File(["person_id,name\np1,Ada"], "people.csv", { type: "text/csv" })]
      },
      {
        csrfHeaders: testEnterpriseJsonHeaders,
        fetchImpl: recorder.fetchImpl
      }
    );
    await deliverEnterpriseUploadObjectStorageAction(
      { teamId: "team-1", uploadId: "upload-1" },
      { jsonHeaders: testEnterpriseJsonHeaders, fetchImpl: recorder.fetchImpl }
    );

    expect(recorder.calls.map((call) => call.url)).toEqual([
      "/api/sena/uploads?teamId=team-1&verify=1",
      SENA_WORKSPACE_API_ROUTES.enterprise.uploads,
      SENA_WORKSPACE_API_ROUTES.enterprise.uploads
    ]);
    expect(recorder.calls.map((call) => call.init?.method ?? "GET")).toEqual(["GET", "POST", "POST"]);
    expect(recorder.calls[2].body).toEqual({
      action: "deliver-object-storage",
      teamId: "team-1",
      uploadId: "upload-1",
      limit: 1,
      includeReview: true
    });
  });

  it("keeps broad enterprise import adapters usable before sign-in", async () => {
    const result = await importSenaEnterpriseFiles([
      uploadLike("local-lesson-study.srt", [
        "1",
        "00:00:01,000 --> 00:00:03,000",
        "Ada: We should ask a better #Question and gather #Evidence.",
        "",
        "2",
        "00:00:04,000 --> 00:00:06,000",
        "Ben: The graph gives #Evidence for the emerging #Claim."
      ].join("\n"))
    ]);

    expect(result.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseImport);
    expect(result.sources.map((source) => source.profile)).toContain("cleaned-transcript");
    expect(result.cleaningManifest.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.importCleaningManifest);
    expect(result.cleaningManifest.summary.adapterProfiles).toContain("cleaned-transcript");
    expect(result.dataset.people.length).toBeGreaterThan(0);
    expect(result.dataset.coded_segments.length).toBeGreaterThan(0);
  });

  it("routes contract-shaped JSON to the contract importer and keeps its real error", async () => {
    // A contract-shaped payload must never fall back to the forum adapter: the
    // old try/catch surfaced "Forum/LMS JSON did not contain posts" for a
    // malformed SENA contract, hiding the real failure.
    const contractResult = await importSenaEnterpriseFiles([
      uploadLike("contract.json", JSON.stringify({
        people: [{ person_id: "p1", name: "Ada" }],
        utterances: [{ utterance_id: "u1", person_id: "p1", text: "We ask a question." }],
        coded_segments: [{ segment_id: "seg1", utterance_id: "u1", person_id: "p1", codes: "Question" }],
        codebook: [{ code_id: "Question", label: "Question" }]
      }))
    ]);
    expect(contractResult.sources.map((source) => source.profile)).toContain("sena-contract");

    await expect(importSenaEnterpriseFiles([
      uploadLike("not-json.json", "{ this is not json")
    ])).rejects.toThrow(/^not-json\.json: JSON could not be parsed/);

    // A wrapped contract is not contract-shaped (no top-level table arrays), so
    // the forum adapter runs — but the error now names the file and explains
    // the contract shape instead of only "did not contain posts".
    await expect(importSenaEnterpriseFiles([
      uploadLike("wrapped-contract.json", JSON.stringify({ dataset: { people: [{ person_id: "p1" }] } }))
    ])).rejects.toThrow(/^wrapped-contract\.json: Forum\/LMS JSON did not contain posts.*must be top-level arrays\.$/);
  });

  it("still adapts non-contract forum JSON exports", async () => {
    const result = await importSenaEnterpriseFiles([
      uploadLike("forum.json", JSON.stringify({
        posts: [
          { id: "post-1", thread_id: "t1", author: "Ada", message: "We should gather #Evidence." },
          { id: "post-2", thread_id: "t1", author: "Ben", message: "Here is a #Claim.", parent_id: "post-1" }
        ]
      }))
    ]);

    expect(result.sources.map((source) => source.profile)).toContain("lms-forum-json");
    expect(result.dataset.utterances.length).toBeGreaterThan(0);
  });

  it("attaches standalone dataset governance metadata to five-CSV enterprise imports", async () => {
    const result = await importSenaEnterpriseFiles([
      uploadLike("people.csv", "person_id,name,role,group\np1,Ada,teacher,A\np2,Ben,student,A"),
      uploadLike("interactions.csv", "source,target,weight,stage,turn_index\np1,p2,1,teach,1"),
      uploadLike("utterances.csv", "utterance_id,person_id,unit_id,stanza_id,stage,turn_index,text\nu1,p1,g1,s1,teach,1,We ask a question."),
      uploadLike("coded_segments.csv", "segment_id,utterance_id,person_id,unit_id,stanza_id,stage,turn_index,codes\nseg1,u1,p1,g1,s1,teach,1,Question"),
      uploadLike("codebook.csv", "code_id,label,family\nQuestion,Question,inquiry"),
      uploadLike("sena-dataset-metadata.json", JSON.stringify({
        metadata: {
          datasetVersion: "five-csv-governed-v1",
          consent: {
            instrument: "Pilot consent form",
            date: "2026-07-01",
            scope: "Research pilot verification only."
          },
          retention: { policy: "Delete after pilot review." },
          pseudonymization: { personIdPolicy: "opaque", rosterMapping: "not-stored" },
          codebook: { id: "pilot-codebook", version: "v1", contentHash: "0xpilot-codebook-v1" }
        }
      }))
    ]);

    expect(result.sources.map((source) => source.profile)).toContain("dataset-metadata");
    expect(result.dataset.metadata?.datasetVersion).toBe("five-csv-governed-v1");
    expect(result.dataset.metadata?.pseudonymization.personIdPolicy).toBe("opaque");

    const audit = buildSenaDataContractAudit(result.dataset);
    const governanceItem = audit.items.find((item) => item.id === "dataset-governance-metadata");
    expect(governanceItem?.status).toBe("pass");
  });

  it("keeps coding reliability diagnostics usable before sign-in", async () => {
    const result = await importSenaReliabilityFiles([
      uploadLike("local-reliability.csv", [
        "coder_id,item_id,code_id,value",
        "coder-a,u1,Question,1",
        "coder-b,u1,Question,1",
        "coder-a,u2,Evidence,1",
        "coder-b,u2,Evidence,0"
      ].join("\n"))
    ], "Local reliability reviewer");

    expect(result.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.localReliabilityImport);
    expect(result.dashboard.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.codingReliabilityDashboard);
    expect(result.fileCount).toBe(1);
    expect(result.annotationCount).toBe(4);
    expect(result.reviewPatch).toMatchObject({
      reviewer: "Local reliability reviewer",
      codingScheme: "Uploaded multi-coder annotation file"
    });
    expect(result.dashboard.disagreementCount).toBeGreaterThan(0);
  });

  it("keeps group-comparison validation usable before sign-in", () => {
    const suite = buildSenaGroupComparisonSuite({
      dataset: exampleSenaContract,
      comparisons: [
        { groupField: "role", groupA: "Facilitator", groupB: "Evidence builder", metric: "bridgeScore" },
        { groupField: "role", groupA: "Facilitator", groupB: "Evidence builder", metric: "socialStrength" }
      ],
      iterations: 100,
      bootstrapIterations: 100,
      seed: 42,
      alpha: 0.05
    });

    expect(suite.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.groupComparisonSuite);
    expect(suite.correction).toBe("holm");
    expect(suite.comparisonCount).toBe(2);
    expect(suite.diagnostics.metrics).toEqual(["bridgeScore", "socialStrength"]);
    expect(suite.guardrail).toContain("descriptive validation support");
  });

  it("exposes Holm-corrected validation suites from the workspace controls", async () => {
    const recorder = createJsonFetchRecorder({
      schemaVersion: "sena-group-comparison-suite/v1",
      metric: "suite",
      groupA: "coach",
      groupB: "teacher",
      permutation: { pTwoSided: 0.25 }
    });

    await runEnterpriseValidationComparisonAction(
      {
        teamId: "team-1",
        projectId: "project-1",
        snapshot: { schemaVersion: "sena-project-snapshot/v1" },
        groupField: "role",
        groupA: "coach",
        groupB: "teacher",
        suite: true,
        metrics: ["bridgeScore", "socialStrength"],
        iterations: 99,
        seed: 42,
        preregistrationNote: "Holm suite preregistration",
        methodNote: "Holm correction across metrics"
      },
      {
        jsonHeaders: testEnterpriseJsonHeaders,
        fetchImpl: recorder.fetchImpl
      }
    );

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].url).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.validationGroupComparison);
    expect(recorder.calls[0].body).toMatchObject({
      teamId: "team-1",
      projectId: "project-1",
      suite: true,
      metrics: ["bridgeScore", "socialStrength"],
      iterations: 99,
      seed: 42
    });
    expect(recorder.calls[0].body).not.toHaveProperty("metric");
  });

  it("exports validation preregistration plans from local and enterprise validation runs", () => {
    const model = buildSenaModel(exampleSenaContract);
    const contract = buildSenaRuntimeBundle(model).productionPageContract;
    const validationEndpoint = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((endpoint) => endpoint.id === "sena-validation-group-comparison");

    expect(contract.visualChecks.map((check) => check.requiredText)).toContain('data-testid="export-validation-preregistration-plan"');
    expect(SENA_SCHEMA_VERSIONS.validationPreregistrationPlan).toBe("sena-validation-preregistration-plan/v1");
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.artifacts).toContain("validation-preregistration-plan");
    expect(validationEndpoint?.request).toEqual(expect.stringContaining("validationRun.preregistrationPlan.planHash"));
    expect(validationEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.groupComparisonSuite,
      SENA_SCHEMA_VERSIONS.validationRunReview
    ]));
  });

  it("exports platform decision registers for institution adapter ownership review", async () => {
    const recorder = createJsonFetchRecorder({
      acceptance: { id: "acceptance-1" },
      platformDecisionRegister: {
        schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionRegister
      },
      identityProductionEvidence: {
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence
      }
    });

    await submitEnterprisePlatformDecisionReviewAction(
      {
        teamId: "team-1",
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: false,
        ownerName: "Named institution platform owner",
        ownerRole: "Institution IdP owner",
        environment: "production",
        evidenceUrl: "https://evidence.example.test/idp",
        productionEvidenceIds: ["idp-tenant-approval", "sso-provider-secrets"],
        productionEvidenceVerifiedAt: "2026-06-01T00:00:00.000Z",
        requestPacketPolicyHash: "policy-hash",
        notes: "External evidence artifact archived by institution owner."
      },
      {
        jsonHeaders: testEnterpriseJsonHeaders,
        fetchImpl: recorder.fetchImpl
      }
    );

    const platformEndpoint = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions");

    expect(SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionRegister).toBe("sena-enterprise-platform-decision-register/v1");
    expect(SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionProductionEvidenceReceipt)
      .toBe("sena-enterprise-platform-decision-production-evidence-receipt/v1");
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].url).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions);
    expect(recorder.calls[0].body).toMatchObject({
      teamId: "team-1",
      decisionId: "institution-idp-approval",
      status: "accepted",
      productionEvidenceIds: ["idp-tenant-approval", "sso-provider-secrets"],
      productionEvidenceVerifiedAt: "2026-06-01T00:00:00.000Z",
      requestPacketPolicyHash: "policy-hash"
    });
    expect(platformEndpoint?.responses).toEqual(expect.arrayContaining([
      "sena-enterprise-platform-decision-register/v1",
      "sena-enterprise-platform-decision-production-evidence-receipt/v1",
      "sena-enterprise-identity-production-evidence/v1"
    ]));
    expect(platformEndpoint?.request)
      .toEqual(expect.stringContaining("productionEvidenceVerifiedAt is required when productionEvidenceIds include identity production evidence ids"));
    expect(platformEndpoint?.request)
      .toEqual(expect.stringContaining("production evidence receipts include evidenceUrlHostBindingStatus"));
  });

  it("exports enterprise capability audit dossiers for original missing-feature evidence", () => {
    const audit = getEnterpriseCapabilityAudit({ teamId: "team-1" });
    const identityEvidence = getEnterpriseIdentityProductionEvidence({ teamId: "team-1" });
    const documentation = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" });
    const capabilityEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit");
    const identityEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence");

    expect(SENA_WORKSPACE_API_ROUTES.enterprise.capabilityAudit).toBe("/api/sena/ops/capability-audit");
    expect(SENA_WORKSPACE_API_ROUTES.enterprise.identityProductionEvidence).toBe("/api/sena/ops/identity-production-evidence");
    expect(audit.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseCapabilityAudit);
    expect(audit.capabilities.map((capability) => capability.id)).toEqual(expect.arrayContaining([
      "auth-login-register-sso",
      "rbac-team-collaboration",
      "server-persistence-database",
      "sena-backend-apis",
      "data-import-adapters",
      "multicoder-reliability",
      "research-validation-inference",
      "publication-exports",
      "production-security-governance",
      "go-live-operations"
    ]));
    expect(audit.capabilities.find((capability) => capability.id === "auth-login-register-sso")?.requiredArtifacts)
      .toEqual(expect.arrayContaining([
        SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight,
        SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
        SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist
      ]));
    expect(identityEvidence.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence);
    expect(identityEvidence.platformRequestPacket.schemaVersion)
      .toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentityPlatformDecisionRequestPacket);
    expect(identityEvidence.submissionVerifier.schemaVersion)
      .toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionVerifier);
    expect(identityEvidence.rotationFreshness.schemaVersion)
      .toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness);
    expect(identityEvidence.cutoverChecklist.schemaVersion)
      .toBe(SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist);
    expect(identityEvidence.submissionVerifier.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("requestPacketPolicyHash="),
      expect.stringContaining("requestPacketPolicyBinding=")
    ]));
    expect(capabilityEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.capabilityAudit);
    expect(capabilityEndpoint?.summary).toEqual(expect.stringContaining("capability audit"));
    expect(capabilityEndpoint?.request).toEqual(expect.stringContaining("team-scoped enterprise capability audit"));
    expect(capabilityEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseCapabilityAudit,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist
    ]));
    expect(identityEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.identityProductionEvidence);
    expect(identityEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidenceManifest,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityPlatformDecisionRequestPacket,
      SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionVerifier,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityRotationFreshness,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist,
      SENA_SCHEMA_VERSIONS.enterpriseCapabilityAudit
    ]));
    expect(identityEndpoint?.request)
      .toEqual(expect.stringContaining("platformRequestPacket.evidence includes requestPacketPolicyHash and requestPacketPolicyBinding"));
  });

  it("exports native adapter certification dossiers for institution platform owners", () => {
    const certification = getEnterpriseNativeAdapterCertification({ teamId: "team-1" });
    const endpoint = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((candidate) => candidate.id === "sena-ops-native-adapters");

    expect(SENA_WORKSPACE_API_ROUTES.enterprise.nativeAdapters).toBe("/api/sena/ops/native-adapters");
    expect(certification.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification);
    expect(certification.export).toEqual({
      api: SENA_WORKSPACE_API_ROUTES.enterprise.nativeAdapters,
      filename: "sena-enterprise-native-adapter-certification.json"
    });
    expect(certification.adapters.map((adapter) => adapter.id)).toEqual(expect.arrayContaining([
      "managed-database-adapter",
      "institution-audit-siem-adapter",
      "managed-backup-storage-adapter"
    ]));
    expect(certification.adapters.map((adapter) => adapter.decisionId)).toEqual(expect.arrayContaining([
      "native-managed-database",
      "native-audit-siem-adapter",
      "native-managed-backup-storage"
    ]));
    expect(certification.adapters.map((adapter) => adapter.bridgeSchema).filter(Boolean)).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseDatabaseSyncWebhook,
      SENA_SCHEMA_VERSIONS.enterpriseAuditWebhook,
      SENA_SCHEMA_VERSIONS.enterpriseBackupWebhook
    ]));
    expect(endpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.nativeAdapters);
    expect(endpoint?.request).toEqual(expect.stringContaining("team-scoped native adapter certification dossier"));
    expect(endpoint?.responses).toContain(SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification);
  });

  it("exports SaaS operations readiness dossiers for production backend approval", () => {
    const readiness = getEnterpriseSaasOperationsReadiness({ teamId: "team-1" });
    const endpoint = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((candidate) => candidate.id === "sena-ops-saas-operations");

    expect(SENA_WORKSPACE_API_ROUTES.enterprise.saasOperations).toBe("/api/sena/ops/saas-operations");
    expect(readiness.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseSaasOperationsReadiness);
    expect(readiness.export).toEqual({
      api: SENA_WORKSPACE_API_ROUTES.enterprise.saasOperations,
      filename: "sena-enterprise-saas-operations-readiness.json"
    });
    expect(readiness.summary.blockers).toEqual(expect.arrayContaining([
      "saas-operating-model-approval-env-required",
      "full-saas-platform-decision-acceptance-required",
      "native-adapter-certification-production-blockers"
    ]));
    expect(readiness.requiredEvidence).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification,
      SENA_SCHEMA_VERSIONS.enterprisePlatformDecisionAcceptance,
      SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
      SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest
    ]));
    expect(readiness.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("nativeAdapterCertification="),
      expect.stringContaining("identityProductionReleaseGateDigestBinding=")
    ]));
    expect(endpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.saasOperations);
    expect(endpoint?.request).toEqual(expect.stringContaining("team-scoped SaaS operations readiness dossier"));
    expect(endpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.enterpriseSaasOperationsReadiness,
      SENA_SCHEMA_VERSIONS.enterpriseNativeAdapterCertification,
      SENA_SCHEMA_VERSIONS.enterpriseReleaseGateReview,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
      SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest
    ]));
  });

  it("exports go-live rehearsal dossiers that link readiness, adapters, SaaS operations, and release gates", async () => {
    const rehearsalRecorder = createJsonFetchRecorder({
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal,
      releaseGateDraft: {
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft
      }
    });
    const attestationRecorder = createJsonFetchRecorder({
      attestation: {
        schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveAttestation
      }
    });

    const rehearsal = await getEnterpriseGoLiveRehearsalAction(
      { teamId: "team 1" },
      { fetchImpl: rehearsalRecorder.fetchImpl }
    );
    await submitEnterpriseGoLiveAttestationAction(
      {
        teamId: "team 1",
        environment: "production",
        releaseVersion: "2026-06-21",
        decision: "conditional",
        attesterName: "Release owner",
        attesterRole: "Platform owner",
        notes: "Go-live rehearsal reviewed.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: true,
          platformOwnerDecisionReviewed: true
        }
      },
      {
        jsonHeaders: testEnterpriseJsonHeaders,
        fetchImpl: attestationRecorder.fetchImpl
      }
    );

    expect(rehearsal.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal);
    expect(rehearsal.releaseGateDraft.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft);
    expect(buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
      artifact: "rollback-drill",
      teamId: "team 1"
    })).toBe("/api/sena/ops/go-live-rehearsal?artifact=rollback-drill&teamId=team+1");
    expect(buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
      artifact: "post-cutover-monitor",
      teamId: "team 1"
    })).toBe("/api/sena/ops/go-live-rehearsal?artifact=post-cutover-monitor&teamId=team+1");
    expect(buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
      attestations: 1,
      teamId: "team 1"
    })).toBe("/api/sena/ops/go-live-rehearsal?attestations=1&teamId=team+1");
    expect(rehearsalRecorder.calls).toEqual([
      {
        url: "/api/sena/ops/go-live-rehearsal?teamId=team+1",
        init: undefined,
        body: undefined
      }
    ]);
    expect(attestationRecorder.calls[0].url).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal);
    expect(attestationRecorder.calls[0].body).toMatchObject({
      teamId: "team 1",
      environment: "production",
      releaseVersion: "2026-06-21",
      decision: "conditional",
      checklist: {
        rehearsalReviewed: true,
        releaseGateDraftReviewed: true,
        verificationEvidenceReviewed: true,
        rollbackOwnerConfirmed: true,
        platformOwnerDecisionReviewed: true
      }
    });

    const goLiveEndpoint = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal");
    expect(goLiveEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal);
    expect(goLiveEndpoint?.summary).toEqual(expect.stringContaining("go-live rehearsal dossier"));
    expect(goLiveEndpoint?.request).toEqual(expect.stringContaining("identityProductionHandoff"));
    expect(goLiveEndpoint?.responses).toEqual(expect.arrayContaining([
      "sena-enterprise-go-live-rehearsal/v1",
      "sena-enterprise-release-gate-draft/v1",
      "sena-enterprise-go-live-attestation/v1",
      "sena-enterprise-identity-production-evidence/v1"
    ]));
  });

  it("exports domain expert review dossiers for claim-readiness evidence", () => {
    const model = buildSenaModel(exampleSenaContract);
    const contract = buildSenaRuntimeBundle(model).productionPageContract;
    const expertReviewEndpoint = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((endpoint) => endpoint.id === "sena-validation-expert-review");

    expect(SENA_WORKSPACE_API_ROUTES.enterprise.expertReview).toBe("/api/sena/validation/expert-review");
    expect(contract.visualChecks.map((check) => check.requiredText))
      .toContain('data-testid="enterprise-expert-review-dossier-export"');
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.artifacts).toContain("domain-expert-review");
    expect(expertReviewEndpoint?.path).toBe(SENA_WORKSPACE_API_ROUTES.enterprise.expertReview);
    expect(expertReviewEndpoint?.responses).toEqual(expect.arrayContaining([
      SENA_SCHEMA_VERSIONS.expertReviewList,
      SENA_SCHEMA_VERSIONS.expertReviewResponse
    ]));
    expect(SENA_SCHEMA_VERSIONS.enterpriseExpertReview).toBe("sena-enterprise-expert-review/v1");
  });

  it("exposes enterprise collaboration pub/sub delivery controls in the SENA workspace", async () => {
    const recorder = createJsonFetchRecorder({
      schemaVersion: "sena-enterprise-collaboration-pubsub-delivery/v1",
      summary: { delivered: 1, failed: 0, skipped: 0 }
    });

    await deliverEnterpriseCollaborationPubSubAction(
      { projectId: "project 1" },
      {
        jsonHeaders: testEnterpriseJsonHeaders,
        fetchImpl: recorder.fetchImpl
      }
    );

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].url).toBe("/api/sena/projects/project%201/collaboration");
    expect(recorder.calls[0].init?.method).toBe("POST");
    expect(recorder.calls[0].body).toEqual({
      action: "deliver-pubsub",
      force: true,
      limit: 50
    });
    expect(buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" })
      .endpoints.find((endpoint) => endpoint.id === "sena-collaboration")?.responses)
      .toContain("sena-enterprise-collaboration-pubsub-delivery/v1");
  });

  it("builds a single-file review packet for local pilot handoff", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const trace = buildSenaTemporalRuntimeTrace(exampleSenaContract, timelineModel.options, { timelineModel });
    const packet = buildSenaReviewPacket(timelineModel, {
      title: "Lesson Study",
      generatedAt: "2026-06-08T09:00:00.000Z",
      sourceDataset: exampleSenaContract,
      temporalRuntimeTrace: trace,
      demoVerificationManualReviews: {
        "sample-import": {
          status: "passed",
          reviewer: "Research lead",
          verifiedAt: "2026-06-08T09:05:00.000Z",
          notes: "Sample package imported during handoff."
        }
      },
      humanReview: {
        status: "human-reviewed",
        reviewer: "Research lead",
        interpretation: "Review packet preserves the local jENA, jSNA, and SENA evidence chain.",
        limitations: "Pilot sample only.",
        nextActions: "Share with the lesson-study team for method review."
      },
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });

    expect(packet.schemaVersion).toBe("sena-review-packet/v1");
    expect(packet.title).toBe("Lesson Study Review Packet");
    expect(packet.workspaceRoute).toBe("/workspace/sena");
    expect(packet.summary.analysisScope).toEqual({
      scope: "full-conversation",
      label: "Full conversation",
      windowId: null,
      mode: "full-conversation",
      turns: "All"
    });
    expect(packet.summary.pilotReadinessStatus).toBe("ready");
    expect(packet.summary.reportCompletenessStatus).toBe("complete");
    expect(packet.summary.runtimeConsistencyStatus).toBe("consistent");
    expect(packet.summary.dataContractStatus).toBe("valid");
    expect(packet.summary.fusionMathStatus).toBe("verified");
    expect(packet.summary.claimReadinessStatus).toBe("ready");
    expect(packet.summary.codingReliabilityStatus).toBe("ready");
    expect(packet.summary.jenaStatus).toBe("computed");
    expect(packet.summary.jsnaStatus).toBe("computed");
    expect(packet.summary.humanReviewStatus).toBe("human-reviewed");
    expect(packet.summary.demoVerificationCompatibilityStatus).toBe("compatible");
    expect(packet.contents.demoVerification.summary.manualPending).toBe(5);
    expect(packet.contents.demoVerification.summary.manualPassed).toBe(1);
    expect(packet.contents.demoVerification.summary.manualFailed).toBe(0);
    expect(packet.contents.demoVerification.checks.find((check) => check.id === "sample-import")?.manualReview.status).toBe("passed");
    expect(packet.contents.demoVerificationCompatibilityAudit).toEqual(packet.contents.runtimeBundle.demoVerificationCompatibilityAudit);
    expect(packet.contents.demoVerificationCompatibilityAudit.status).toBe("compatible");
    expect(packet.summary.localRuntimeDependencies).toEqual({
      jena: "0.6.2",
      jsna: "npm:@peterhudongpin/sna.js@0.4.0"
    });
    expect(packet.reviewPacketAudit.schemaVersion).toBe("sena-review-packet-audit/v1");
    expect(packet.reviewPacketAudit.status).toBe("complete");
    expect(packet.reviewPacketAudit.reviewNeeded).toBe(0);
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toEqual([
      "artifact-manifest",
      "schema-alignment",
      "pilot-package-manifest",
      "pilot-export-artifact-coverage",
      "analysis-scope-handoff",
      "report-bundle-consistency",
      "project-snapshot-handoff",
      "standalone-runtime-artifacts",
      "runtime-dependency-provenance",
      "evidence-handoff",
      "temporal-handoff",
      "demo-verification-compatibility",
      "production-page-contract",
      "development-plan-handoff",
      "method-protocol-handoff",
      "visual-grammar-handoff",
      "markdown-handoff",
      "guardrail-handoff"
    ]);
    expect(packet.reviewPacketAudit.items.every((item) => item.status === "pass")).toBe(true);
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.actual).toContain("exportCoverage=true");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.actual).toContain("schemaCoverage=true");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.actual).toContain("assetIntegrity=13");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.actual).toContain("assetIntegrityCoverage=true");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.actual).toContain("handoffChecks=6");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("sampleContract=/sena-pilot/sample/lesson-study-sena-contract.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("assetIntegrity=13");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("assetIntegrityArtifact=sena-pilot-package-manifest.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("assetIntegrityEvidence=assetIntegrity|bytes|sha256|sample assets|template assets");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("modelJsonArtifact=sena-project-snapshot.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("modelJsonEvidence=graph nodes|typed edge layers|S/W/B/B_PC/B_CP/G matrices|A_fusion matrix|temporal trace windows");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("runtimeArtifact=sena-runtime-bundle.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-package-manifest")?.evidence).toContain("runtimeEvidence=sena-jena-manifest.json|sena-ena-report.json|sena-jsna-manifest.json|sena-runtime-consistency-audit.json|jena-api-surface|jsna-api-surface|jena-rena-parity|jsna-r-sna-parity|matrix-fingerprints|0.6.2|npm:@peterhudongpin/sna.js@0.4.0");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "pilot-export-artifact-coverage")?.actual).toContain("missing=0");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "project-snapshot-handoff")?.actual).toContain("modelJsonGate=ready");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "project-snapshot-handoff")?.evidence).toContain("edgeLayers=bridge|concept|social");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "project-snapshot-handoff")?.evidence).toContain("readiness=model-json-export:ready");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.actual).toContain("enaReport=computed");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.actual).toContain("runtimeAudit=consistent");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.actual).toContain("artifactEvidence=10");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.actual).toContain(`metricProvenance=${packet.contents.metricProvenanceArtifact.metricProvenance.length}`);
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("enaReportSchema=sena-ena-report/v1");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("runtimeApiSurface=jena-api-surface:pass|jsna-api-surface:pass");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("runtimeParity=jena-rena-parity:pass|jsna-r-sna-parity:pass");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("artifactEvidence=sena-jena-manifest.json|sena-ena-report.json|sena-jsna-manifest.json|sena-sna-report.json|sena-metric-provenance.json|sena-person-code-pair-g-report.json|sena-runtime-consistency-audit.json|sena-pilot-package-manifest.json|sena-coding-reliability-gate.json|sena-runtime-bundle.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("runtimeArtifactHandoff=sena-jsna-manifest.json:jsna-api-surface,jsna-local-dependency,jsna-r-sna-parity,jsna-manifest-status");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("runtimeArtifactHandoff=sena-sna-report.json:jsna-r-sna-parity,jsna-social-matrix,sena-sna-report/v1");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence.some((entry) => entry.startsWith("fusionMathFingerprints=S:0x"))).toBe(true);
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("metricProvenanceSchema=sena-metric-provenance/v1");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "standalone-runtime-artifacts")?.evidence).toContain("runtimeAuditSchema=sena-runtime-consistency/v1");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "development-plan-handoff")?.status).toBe("pass");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "development-plan-handoff")?.actual).toContain("missingPacket=0");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "development-plan-handoff")?.actual).toContain("missingPilot=0");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "development-plan-handoff")?.evidence).toContain("runtimeParityEvidence=jsna-r-sna-social-parity:covered");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "development-plan-handoff")?.evidence).toContain("phase=research-validation:deferred");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.actual).toContain("missingPacket=0");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.actual).toContain("missingPilot=0");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("jENAApi=ena()");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("jSNAApi=gden()|nties()|degree()|betweenness()|reachability()|averagePathLength()|labelPropagation()|components()|isConnected()|geodist()|grecip()");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("runtimeParity=jena-rena-sample-parity:covered|jsna-r-sna-social-parity:covered");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("runtimeParityEvidence=jsna-r-sna-social-parity:covered");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("runtimeConsistency=consistent");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("fusionMath=verified");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("runtimeHandoffs=jena-concept-matrix|jsna-social-matrix|fusion-math");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("runtimeHandoff=jsna-social-matrix:pass");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("companion=sena-pilot-package-manifest.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("companion=sena-metric-provenance.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("companion=sena-coding-reliability-gate.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("companion=sena-claim-readiness-gate.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("visualCheck=fusion-canvas-sna-outer-orbit");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAssets=6");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("adoptedReferences=temporal-fusion-arc-mockup|workspace-shell-c3-collapsed-switcher-mockup|fusion-plane-orbit-mockup");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAsset=a1-inner-solid-mesh-mockup:alternative-reference:output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAsset=temporal-fusion-arc-mockup:adopted-reference:output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAsset=workspace-shell-c3-collapsed-switcher-mockup:adopted-reference:output/sena-workspace-layout-options/sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher.png");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAsset=fusion-plane-orbit-mockup:adopted-reference:output/sena-fusion-redesign-options/sena-fusion-plane-orbit.png");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAssetIntegrity=a1-inner-solid-mesh-mockup:730212:fa123f9d29c4df8a62d02acf85045761749a3170a554b054ff5006498f1bb399");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAssetIntegrity=temporal-fusion-arc-mockup:675378:0bb2ca6c5e9418e90572cfd956bcbfcbde34ec4d27aa3946cc8433a7048bb4bb");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAssetIntegrity=workspace-shell-c3-collapsed-switcher-mockup:145251:bc7c350686c6f3e3af9f0ed3acd3fcaee10bc423cd8be95a36bf88010392d7aa");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "visual-grammar-handoff")?.evidence).toContain("referenceAssetIntegrity=fusion-plane-orbit-mockup:176753:c32d860917f28f9bca822e7b2e9b9215ded6c675d89320c79642cde8a86166e6");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "analysis-scope-handoff")?.actual).toContain("Full conversation");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "analysis-scope-handoff")?.evidence).toContain("summaryWindow=full-conversation");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "temporal-handoff")?.expected).toContain("matrix fingerprints");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "temporal-handoff")?.actual).toContain("matrixFingerprintWindows=3/3");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "temporal-handoff")?.actual).toContain("A_fusionChecksums=3");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "temporal-handoff")?.actual).toContain("fingerprintsMatch=true");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "temporal-handoff")?.evidence).toContain("firstWindowFingerprintIds=S|W|B|B_PC|B_CP|G|A_fusion");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "temporal-handoff")?.evidence.some((entry) => entry.startsWith("firstWindowA_fusionChecksum=0x"))).toBe(true);
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "markdown-handoff")?.evidence).toContain("analysisWindow=true");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "markdown-handoff")?.evidence).toContain("temporalTrace=true");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-review-packet.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-pilot-package-manifest.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-project-snapshot.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-runtime-bundle.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-runtime-consistency-audit.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-jena-manifest.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-ena-report.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-jsna-manifest.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-sna-report.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-metric-provenance.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-person-code-pair-g-report.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-method-protocol.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-visual-grammar.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-development-plan.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-coding-reliability-gate.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-claim-readiness-gate.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-demo-verification-compatibility-audit.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-production-page-contract.json");
    expect(packet.contents.reportJson).toEqual(packet.contents.runtimeBundle.report);
    expect(packet.contents.projectSnapshot.schemaVersion).toBe("sena-project-snapshot/v1");
    expect(packet.contents.projectSnapshot.source.sourceDatasetCounts.utterances).toBe(exampleSenaContract.utterances.length);
    expect(packet.contents.projectSnapshot.reproducibility.requiredRuntimes.ena.dependencySpec).toBe("0.6.2");
    expect(packet.contents.projectSnapshot.reproducibility.requiredRuntimes.sna.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(packet.contents.projectSnapshot.analysis.nodes?.length).toBe(packet.contents.reportJson.figures.fusionGraph.nodes.length);
    expect(packet.contents.projectSnapshot.analysis.edges?.length).toBe(packet.contents.reportJson.figures.fusionGraph.edges.length);
    expect(new Set(packet.contents.projectSnapshot.analysis.edges?.map((edge) => edge.edgeType))).toEqual(new Set(["PP", "CC", "PC"]));
    expect(packet.contents.projectSnapshot.analysis.edges?.map((edge) => edge.edgeType)).toEqual(packet.contents.reportJson.figures.fusionGraph.edges.map((edge) => edge.edgeType));
    expect(packet.contents.projectSnapshot.analysis.matrices.fusion.values).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.fusion.values);
    expect(packet.contents.projectSnapshot.analysis.temporalRuntimeTrace?.windows.length).toBe(packet.contents.temporalRuntimeTrace.windows.length);
    expect(packet.contents.projectSnapshot.analysis.temporalRuntimeTrace?.windows.every((entry) => entry.sena.matrixFingerprints.length === 7)).toBe(true);
    expect(packet.contents.runtimeConsistencyAudit).toEqual(packet.contents.reportJson.runtimeConsistencyAudit);
    expect(packet.contents.fusionMathAudit.matrixFingerprints).toEqual(packet.contents.reportJson.fusionMathAudit.matrixFingerprints);
    expect(packet.contents.runtimeBundle.fusionMathAudit.matrixFingerprints).toEqual(packet.contents.reportJson.fusionMathAudit.matrixFingerprints);
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "report-bundle-consistency")?.actual).toContain("matrixFingerprints=7");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "report-bundle-consistency")?.evidence).toContain("matrixFingerprintIds=S|W|B|B_PC|B_CP|G|A_fusion");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "report-bundle-consistency")?.evidence.some((entry) => entry.startsWith("A_fusionChecksum=0x"))).toBe(true);
    expect(packet.contents.runtimeConsistencyAudit.items.find((item) => item.id === "jena-api-surface")?.status).toBe("pass");
    expect(packet.contents.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.status).toBe("pass");
    expect(packet.contents.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-api-surface")?.status).toBe("pass");
    expect(packet.contents.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity")?.status).toBe("pass");
    expect(packet.contents.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix")?.status).toBe("pass");
    expect(packet.contents.pilotReadinessAudit.items.find((item) => item.id === "model-json-export")?.status).toBe("ready");
    expect(packet.contents.projectSnapshot.workspaceState?.demoVerificationManualReviews["sample-import"]?.status).toBe("passed");
    expect(packet.contents.jenaManifest).toEqual(packet.contents.runtimeBundle.runtimes.ena.manifest);
    expect(packet.contents.enaReportArtifact.schemaVersion).toBe("sena-ena-report/v1");
    expect(packet.contents.enaReportArtifact.manifest).toEqual(packet.contents.jenaManifest);
    expect(packet.contents.enaReportArtifact.conceptMatrix).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.W);
    expect(packet.contents.runtimeBundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.handoffChecks).toContain("jena-concept-matrix");
    expect(packet.contents.jsnaManifest).toEqual(packet.contents.runtimeBundle.runtimes.sna.manifest);
    expect(packet.contents.snaReportArtifact.schemaVersion).toBe("sena-sna-report/v1");
    expect(packet.contents.snaReportArtifact.manifest).toEqual(packet.contents.jsnaManifest);
    expect(packet.contents.snaReportArtifact.socialReport).toEqual(packet.contents.runtimeBundle.runtimes.sna.socialReport);
    expect(packet.contents.snaReportArtifact.socialMatrix).toEqual(packet.contents.runtimeBundle.runtimes.sna.socialMatrix);
    expect(packet.contents.runtimeBundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.handoffChecks).toContain("jsna-social-matrix");
    expect(packet.contents.metricProvenanceArtifact.schemaVersion).toBe("sena-metric-provenance/v1");
    expect(packet.contents.metricProvenanceArtifact.metricProvenance).toEqual(packet.contents.reportJson.validation.metricProvenance);
    expect(packet.contents.metricProvenanceArtifact.socialMetricSnapshot.socialMatrix).toEqual(packet.contents.runtimeBundle.runtimes.sna.socialMatrix);
    expect(packet.contents.metricProvenanceArtifact.epistemicMetricSnapshot.manifest).toEqual(packet.contents.jenaManifest);
    expect(packet.contents.metricProvenanceArtifact.epistemicMetricSnapshot.conceptMatrix).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.W);
    expect(packet.contents.metricProvenanceArtifact.epistemicMetricSnapshot.runtimeConsistencyAudit.status).toBe(packet.contents.runtimeConsistencyAudit.status);
    expect(packet.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.S).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.S);
    expect(packet.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.W).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.W);
    expect(packet.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.B).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.B);
    expect(packet.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.G).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.G);
    expect(packet.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.fusion).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.fusion);
    expect(packet.contents.runtimeBundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("metric-provenance");
    expect(packet.contents.runtimeBundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("fusion-matrix-snapshot");
    expect(packet.contents.runtimeBundle.artifactEvidence.find((artifact) => artifact.filename === "sena-pilot-package-manifest.json")?.handoffChecks).toContain("pilot-asset-integrity");
    expect(packet.contents.runtimeBundle.artifactEvidence.find((artifact) => artifact.filename === "sena-coding-reliability-gate.json")?.handoffChecks).toContain("coding-reliability-gate");
    expect(packet.contents.pairContributionReportArtifact.schemaVersion).toBe("sena-person-code-pair-g-report/v1");
    expect(packet.contents.pairContributionReportArtifact.pairReport).toEqual(packet.contents.runtimeBundle.runtimes.sena.pairReport);
    expect(packet.contents.pairContributionReportArtifact.G).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.G);
    expect(packet.contents.pairContributionReportArtifact.supportingMatrices.W).toEqual(packet.contents.runtimeBundle.runtimes.sena.matrices.W);
    expect(packet.contents.pilotPackageManifest.schemaVersion).toBe("sena-pilot-package-manifest/v1");
    expect(packet.contents.pilotPackageManifest.workspaceRoute).toBe("/workspace/sena");
    expect(packet.contents.pilotPackageManifest.assets.sample).toContain("/sena-pilot/sample/lesson-study-sena-contract.json");
    expect(packet.contents.pilotPackageManifest.assets.templates).toContain("/sena-pilot/templates/coded_segments.csv");
    expect(packet.contents.pilotPackageManifest.assetIntegrity).toHaveLength(13);
    expect(packet.contents.pilotPackageManifest.assetIntegrity.find((asset) => asset.href === "/sena-pilot/sample/lesson-study-sena-contract.json")?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-jena-manifest.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-ena-report.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-jsna-manifest.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-runtime-consistency-audit.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-sna-report.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-metric-provenance.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-person-code-pair-g-report.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-visual-grammar.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(packet.contents.pilotPackageManifest.exportArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(packet.contents.pilotPackageManifest.handoffChecks.map((check) => check.id)).toEqual([
      "model-json-export",
      "local-runtime-manifests",
      "pilot-asset-integrity",
      "review-packet-audit",
      "coding-reliability-gate",
      "metric-provenance"
    ]);
    expect(packet.contents.pilotPackageManifest.exportArtifactSchemas["sena-visual-grammar.json"]).toBe("sena-visual-grammar/v1");
    expect(packet.contents.pilotPackageManifest.exportArtifactSchemas["sena-coding-reliability-gate.json"]).toBe("sena-coding-reliability-gate/v1");
    expect(packet.contents.pilotPackageManifest.exportArtifactSchemas["sena-claim-readiness-gate.json"]).toBe("sena-claim-readiness-gate/v1");
    expect(packet.contents.pilotPackageManifest.exportArtifactSchemas["sena-sna-report.json"]).toBe("sena-sna-report/v1");
    expect(packet.contents.pilotPackageManifest.exportArtifactSchemas["sena-metric-provenance.json"]).toBe("sena-metric-provenance/v1");
    expect(packet.contents.pilotPackageManifest.exportArtifactSchemas["sena-person-code-pair-g-report.json"]).toBe("sena-person-code-pair-g-report/v1");
    expect(packet.contents.evidenceLedger).toEqual(packet.contents.runtimeBundle.evidenceLedger);
    expect(packet.contents.temporalRuntimeTrace).toEqual(trace);
    expect(packet.contents.temporalRuntimeTrace.windows.every((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))).toBe(true);
    expect(packet.contents.productionPageContract).toEqual(packet.contents.runtimeBundle.productionPageContract);
    expect(packet.contents.productionPageContract.visualChecks.find((check) => check.id === "fusion-canvas-center-region")?.requiredText).toContain("fill=\"none\"");
    expect(packet.contents.productionPageContract.visualChecks.find((check) => check.id === "fusion-canvas-sna-outer-orbit")?.requiredText).toBe("data-arc-route=\"outer-orbit\"");
    expect(packet.contents.methodProtocol.schemaVersion).toBe("sena-method-protocol/v1");
    expect(packet.contents.methodProtocol.mathematicalFrame.layers.map((layer) => layer.id)).toContain("A_fusion");
    expect(packet.contents.methodProtocol.runtimeIntegration.jena.apiSurface).toContain("ena()");
    expect(packet.contents.methodProtocol.runtimeIntegration.jsna.apiSurface).toContain("geodist()");
    expect(packet.contents.methodProtocol.requiredCompanionArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(packet.contents.methodProtocol.requiredCompanionArtifacts).toContain("sena-metric-provenance.json");
    expect(packet.contents.methodProtocol.requiredCompanionArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(packet.contents.methodProtocol.requiredCompanionArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(packet.contents.methodProtocol.runtimeParityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(packet.contents.methodProtocol.auditSummary.runtimeConsistency.status).toBe("consistent");
    expect(packet.contents.methodProtocol.runtimeHandoffs.map((handoff) => handoff.id)).toEqual(["jena-concept-matrix", "jsna-social-matrix", "fusion-math"]);
    expect(packet.contents.methodProtocol.runtimeHandoffs.every((handoff) => handoff.status === "pass")).toBe(true);
    expect(packet.contents.methodProtocol.runtimeHandoffs.find((handoff) => handoff.id === "jsna-social-matrix")?.summary).toContain("socialTieRows=");
    expect(packet.contents.visualGrammarArtifact.schemaVersion).toBe("sena-visual-grammar/v1");
    expect(packet.contents.visualGrammarArtifact.visualGrammar).toEqual(packet.contents.methodProtocol.visualGrammar);
    expect(packet.contents.visualGrammarArtifact.visualGrammar).toEqual(packet.contents.reportJson.figures.visualGrammar);
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "a1-inner-solid-mesh-mockup")?.path).toBe("output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "a1-inner-solid-mesh-mockup")?.sha256).toBe("fa123f9d29c4df8a62d02acf85045761749a3170a554b054ff5006498f1bb399");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "temporal-fusion-arc-mockup")?.path).toBe("output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "temporal-fusion-arc-mockup")?.sha256).toBe("0bb2ca6c5e9418e90572cfd956bcbfcbde34ec4d27aa3946cc8433a7048bb4bb");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup")?.path).toBe("output/sena-workspace-layout-options/sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher.png");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup")?.sha256).toBe("bc7c350686c6f3e3af9f0ed3acd3fcaee10bc423cd8be95a36bf88010392d7aa");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.path).toBe("output/sena-fusion-redesign-options/sena-fusion-plane-orbit.png");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.bytes).toBe(176753);
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.sha256).toBe("c32d860917f28f9bca822e7b2e9b9215ded6c675d89320c79642cde8a86166e6");
    expect(packet.contents.developmentPlan.schemaVersion).toBe("sena-development-plan/v1");
    expect(packet.contents.developmentPlan.runtimeParityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(packet.contents.developmentPlan.scope.inScope).toContain("Institution production cutover acceptance evidence with native adapter certification, platform-owner bridge decisions, release-gate records, go-live rehearsal, and redacted operations handoff for database, object storage, pub/sub, audit/SIEM, backup/restore, alerting, email, IdP, and provisioning.");
    expect(packet.contents.developmentPlan.scope.outOfScope).not.toContain("Native managed database, object-storage, collaboration pub/sub, audit/SIEM, and backup/restore adapters beyond the signed webhook bridge handoffs.");
    expect(packet.contents.codingReliabilityGate).toEqual(packet.contents.runtimeBundle.codingReliabilityGate);
    expect(packet.contents.codingReliabilityGate).toEqual(packet.contents.reportJson.codingReliabilityGate);
    expect(packet.contents.codingReliabilityGate.claimUse).toBe("coding-reliability-documented");
    expect(packet.contents.claimReadinessGate).toEqual(packet.contents.runtimeBundle.claimReadinessGate);
    expect(packet.contents.claimReadinessGate).toEqual(packet.contents.reportJson.claimReadinessGate);
    expect(packet.contents.claimReadinessGate.claimUse).toBe("research-claim-ready");
    expect(packet.contents.reportMarkdown).toContain("# Lesson Study");
    expect(packet.contents.reportMarkdown).toContain("Analysis window: Full conversation");
    expect(packet.contents.reportMarkdown).toContain("## Temporal Trace");
    expect(packet.contents.reportMarkdown).toContain("0.6.2");
    expect(packet.reviewGuardrails.some((guardrail) => guardrail.startsWith("Observed structure, not causality:"))).toBe(true);

    const importedPacket = importSenaReviewPacket(JSON.stringify(packet));
    expect(isSenaReviewPacket(importedPacket)).toBe(true);
    expect(importedPacket.reviewPacketAudit.status).toBe("complete");
    expect(importedPacket.contents.projectSnapshot.schemaVersion).toBe("sena-project-snapshot/v1");
    expect(importedPacket.contents.runtimeBundle.schemaVersion).toBe("sena-runtime-bundle/v1");
    expect(importedPacket.contents.jenaManifest.schemaVersion).toBe("sena-ena-manifest/v1");
    expect(importedPacket.contents.jsnaManifest.schemaVersion).toBe("sena-jsna-manifest/v1");
    expect(importedPacket.contents.snaReportArtifact.schemaVersion).toBe("sena-sna-report/v1");
    expect(importedPacket.contents.pairContributionReportArtifact.schemaVersion).toBe("sena-person-code-pair-g-report/v1");
    expect(importedPacket.contents.pilotPackageManifest.schemaVersion).toBe("sena-pilot-package-manifest/v1");
    expect(importedPacket.contents.developmentPlan.schemaVersion).toBe("sena-development-plan/v1");
    expect(importedPacket.contents.codingReliabilityGate.schemaVersion).toBe("sena-coding-reliability-gate/v1");
    expect(importedPacket.contents.claimReadinessGate.schemaVersion).toBe("sena-claim-readiness-gate/v1");
    expect(importedPacket.contents.demoVerificationCompatibilityAudit.schemaVersion).toBe("sena-demo-verification-compatibility/v1");
    expect(importedPacket.contents.productionPageContract.schemaVersion).toBe("sena-production-page-contract/v1");

    const legacyFusionAuditPacket = {
      ...packet,
      contents: {
        ...packet.contents,
        fusionMathAudit: {
          ...packet.contents.fusionMathAudit,
          schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit
        }
      }
    };
    expect(isSenaReviewPacket(legacyFusionAuditPacket)).toBe(true);
  });

  it("rejects malformed review packets before workspace recognition", () => {
    expect(isSenaReviewPacket({ schemaVersion: "sena-review-packet/v1" })).toBe(false);
    expect(() => importSenaReviewPacket({
      schemaVersion: "sena-review-packet/v1",
      title: "Bad Review Packet",
      generatedAt: "2026-06-08T10:00:00.000Z",
      summary: { localRuntimeDependencies: { jena: "0.6.2", jsna: "npm:@peterhudongpin/sna.js@0.4.0" } },
      reviewPacketAudit: { schemaVersion: "sena-review-packet-audit/v1" },
      artifactManifest: [],
      reviewGuardrails: [],
      notes: [],
      contents: {
        reportJson: { schemaVersion: "sena-report/v1" }
      }
    })).toThrow(/review packet\.summary\.analysisScope/i);
  });

  it("rejects invalid review packet analysis scope metadata", () => {
    const model = buildSenaModel(exampleSenaContract);
    const packet = buildSenaReviewPacket(model, {
      generatedAt: "2026-06-08T10:05:00.000Z"
    });

    expect(() => importSenaReviewPacket({
      ...packet,
      summary: {
        ...packet.summary,
        analysisScope: {
          ...packet.summary.analysisScope,
          mode: "bad-mode"
        }
      }
    })).toThrow(/review packet\.summary\.analysisScope\.mode/i);

    expect(isSenaReviewPacket({
      ...packet,
      summary: {
        ...packet.summary,
        analysisScope: {
          ...packet.summary.analysisScope,
          scope: "bad-scope"
        }
      }
    })).toBe(false);
  });

  it("rejects malformed review packet artifact and pilot package manifests", () => {
    const model = buildSenaModel(exampleSenaContract);
    const packet = buildSenaReviewPacket(model, {
      generatedAt: "2026-06-08T10:10:00.000Z"
    });

    expect(() => importSenaReviewPacket({
      ...packet,
      artifactManifest: [
        {
          schemaVersion: "sena-review-packet/v1",
          description: "Missing filename"
        }
      ]
    })).toThrow(/review packet\.artifactManifest\.0\.filename/i);

    expect(() => importSenaReviewPacket({
      ...packet,
      contents: {
        ...packet.contents,
        pilotPackageManifest: {
          ...packet.contents.pilotPackageManifest,
          assets: {
            ...packet.contents.pilotPackageManifest.assets,
            sample: []
          }
        }
      }
    })).toThrow(/review packet\.contents\.pilotPackageManifest\.assets\.sample/i);

    expect(() => importSenaReviewPacket({
      ...packet,
      contents: {
        ...packet.contents,
        pilotPackageManifest: {
          ...packet.contents.pilotPackageManifest,
          exportArtifactSchemas: {
            ...packet.contents.pilotPackageManifest.exportArtifactSchemas,
            "sena-sna-report.json": undefined
          }
        }
      }
    })).toThrow(/review packet\.contents\.pilotPackageManifest\.exportArtifactSchemas\.sena-sna-report\.json/i);

    expect(() => importSenaReviewPacket({
      ...packet,
      contents: {
        ...packet.contents,
        pilotPackageManifest: {
          ...packet.contents.pilotPackageManifest,
          assetIntegrity: []
        }
      }
    })).toThrow(/review packet\.contents\.pilotPackageManifest\.assetIntegrity/i);

    expect(() => importSenaReviewPacket({
      ...packet,
      contents: {
        ...packet.contents,
        pilotPackageManifest: {
          ...packet.contents.pilotPackageManifest,
          assetIntegrity: packet.contents.pilotPackageManifest.assetIntegrity.map((asset, index) => (
            index === 0 ? { ...asset, sha256: "not-a-sha" } : asset
          ))
        }
      }
    })).toThrow(/review packet\.contents\.pilotPackageManifest\.assetIntegrity\.0\.sha256/i);

    expect(() => importSenaReviewPacket({
      ...packet,
      contents: {
        ...packet.contents,
        pilotPackageManifest: {
          ...packet.contents.pilotPackageManifest,
          handoffChecks: [
            {
              id: "model-json-export",
              label: "Restorable model JSON export",
              artifact: "missing-snapshot.json",
              expectedEvidence: ["graph nodes"]
            }
          ]
        }
      }
    })).toThrow(/review packet\.contents\.pilotPackageManifest\.handoffChecks\.0\.artifact/i);

    expect(isSenaReviewPacket({
      ...packet,
      contents: {
        ...packet.contents,
        pilotPackageManifest: {
          ...packet.contents.pilotPackageManifest,
          sampleDataset: {
            ...packet.contents.pilotPackageManifest.sampleDataset,
            expectedCounts: {
              ...packet.contents.pilotPackageManifest.sampleDataset.expectedCounts,
              codedSegments: -1
            }
          }
        }
      }
    })).toBe(false);
  });

  it("builds a reproducible local research pilot project snapshot", () => {
    const timelineModel = buildSenaModel(exampleSenaContract);
    const reflectionWindow = timelineModel.temporal.windows.find((window) => window.label === "Reflection");
    expect(reflectionWindow).toBeTruthy();

    const scopedDataset = scopeSenaDatasetToWindow(exampleSenaContract, reflectionWindow!);
    const model = buildSenaModel(scopedDataset);
    const snapshot = buildSenaProjectSnapshot(model, {
      title: "Reflection Window Snapshot",
      generatedAt: "2026-06-08T01:00:00.000Z",
      sourceDataset: exampleSenaContract,
      activeTemporalWindow: reflectionWindow,
      humanReview: {
        reviewer: "Research lead",
        interpretation: "Reflection window analysis.",
        limitations: "Window-scoped demo only.",
        nextActions: "Compare with full-cycle snapshot."
      },
      dataGovernance: {
        irbApprovalId: "HKLS-REFLECT-2026",
        consentScope: "Reflection-window teacher discussion analysis.",
        retentionPolicy: "Store de-identified snapshot until project closeout.",
        usageConstraints: ["internal research team only"],
        dataSteward: "Pilot data steward"
      }
    });

    expect(snapshot.schemaVersion).toBe("sena-project-snapshot/v1");
    expect(snapshot.dataGovernance?.schemaVersion).toBe("sena-data-governance-metadata/v1");
    expect(snapshot.dataGovernance?.irbApprovalId).toBe("HKLS-REFLECT-2026");
    expect(snapshot.report.dataGovernance.irbApprovalId).toBe("HKLS-REFLECT-2026");
    expect(snapshot.title).toBe("Reflection Window Snapshot");
    expect(snapshot.source.milestone).toBe("local-research-pilot");
    expect(snapshot.source.activeTemporalWindow?.label).toBe("Reflection");
    expect(snapshot.source.sourceDatasetCounts.utterances).toBe(exampleSenaContract.utterances.length);
    expect(snapshot.source.sourceDataset?.utterances.length).toBe(exampleSenaContract.utterances.length);
    expect(snapshot.dataset.utterances.length).toBeLessThan(exampleSenaContract.utterances.length);
    expect(snapshot.reproducibility.requiredRuntimes.ena.engine).toBe("jena-js");
    expect(snapshot.reproducibility.requiredRuntimes.sna.engine).toBe("sna.js");
    expect(snapshot.reproducibility.formula).toBe("A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]");
    expect(snapshot.reproducibility.interpretationGuardrails.length).toBeGreaterThan(0);
    expect(snapshot.analysis.nodes?.map((node) => node.kind)).toEqual(model.nodes.map((node) => node.kind));
    expect(snapshot.analysis.edges?.map((edge) => edge.layer)).toEqual(model.edges.map((edge) => edge.layer));
    expect(snapshot.analysis.edges?.some((edge) => edge.layer === "social")).toBe(true);
    expect(snapshot.analysis.edges?.some((edge) => edge.layer === "concept")).toBe(true);
    expect(snapshot.analysis.edges?.some((edge) => edge.layer === "bridge")).toBe(true);
    expect(snapshot.analysis.matrices.fusion.values).toEqual(model.matrices.fusion.values);
    expect(snapshot.analysis.matrices.G.raw).toEqual(model.matrices.G.raw);
    expect(snapshot.analysis.matrices.G.pairs).toEqual(model.matrices.G.pairs);
    expect(snapshot.analysis.temporalRuntimeTrace?.schemaVersion).toBe("sena-temporal-runtime-trace/v1");
    expect(snapshot.analysis.temporalRuntimeTrace?.sourceDatasetCounts.utterances).toBe(exampleSenaContract.utterances.length);
    expect(snapshot.analysis.temporalRuntimeTrace?.windows.map((entry) => entry.window.label)).toEqual(timelineModel.temporal.windows.map((window) => window.label));
    expect(snapshot.analysis.temporalRuntimeTrace?.windows.every((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))).toBe(true);
    expect(snapshot.report.enaManifest.status).toBe("computed");
    expect(snapshot.report.analysisWindow?.label).toBe("Reflection");
    expect(snapshot.report.humanReview.interpretation).toBe("Reflection window analysis.");
  });

  it("round-trips project snapshots with source data, build options, report review, and temporal window", () => {
    const buildOptions = {
      alpha: 0.35,
      beta: 0.45,
      gamma: 0.9,
      normalization: "log-max" as const,
      temporal: {
        mode: "moving-window" as const,
        movingWindowSize: 4,
        movingWindowStep: 2,
        turnWindowRadius: 2
      }
    };
    const timelineModel = buildSenaModel(exampleSenaContract, buildOptions);
    const activeWindow = timelineModel.temporal.windows[2];
    expect(activeWindow).toBeTruthy();

    const scopedDataset = scopeSenaDatasetToWindow(exampleSenaContract, activeWindow!);
    const model = buildSenaModel(scopedDataset, buildOptions);
    const snapshot = buildSenaProjectSnapshot(model, {
      title: "Moving Window Snapshot",
      generatedAt: "2026-06-08T02:00:00.000Z",
      sourceDataset: exampleSenaContract,
      activeTemporalWindow: activeWindow,
      demoVerificationManualReviews: {
        "sample-import": {
          status: "passed",
          reviewer: "Pilot reviewer",
          verifiedAt: "2026-06-08T02:05:00.000Z",
          notes: "Sample import restored with the snapshot."
        }
      },
      humanReview: {
        status: "human-reviewed",
        reviewer: "Pilot reviewer",
        interpretation: "Moving-window interpretation.",
        limitations: "Small pilot window.",
        nextActions: "Restore this snapshot in the local workspace."
      },
      dataGovernance: {
        irbApprovalId: "MOVING-WINDOW-IRB",
        consentScope: "Moving-window restoration test.",
        retentionPolicy: "Retain only generated fixture artifacts.",
        usageConstraints: ["fixture only"],
        dataSteward: "Pilot reviewer"
      }
    });

    const imported = importSenaProjectSnapshot(JSON.stringify(snapshot));
    const restoredSource = imported.source.sourceDataset;
    expect(isSenaProjectSnapshot(imported)).toBe(true);
    expect(imported.title).toBe("Moving Window Snapshot");
    expect(imported.reproducibility.buildOptions.alpha).toBeCloseTo(0.35);
    expect(imported.reproducibility.buildOptions.normalization).toBe("log-max");
    expect(imported.reproducibility.buildOptions.temporal.mode).toBe("moving-window");
    expect(imported.report.humanReview.reviewer).toBe("Pilot reviewer");
    expect(imported.report.humanReview.nextActions).toMatch(/Restore this snapshot/);
    expect(imported.dataGovernance?.irbApprovalId).toBe("MOVING-WINDOW-IRB");
    expect(imported.report.dataGovernance.irbApprovalId).toBe("MOVING-WINDOW-IRB");
    expect(imported.workspaceState?.demoVerificationManualReviews["sample-import"]).toEqual({
      status: "passed",
      reviewer: "Pilot reviewer",
      verifiedAt: "2026-06-08T02:05:00.000Z",
      notes: "Sample import restored with the snapshot."
    });
    expect(restoredSource?.utterances).toHaveLength(exampleSenaContract.utterances.length);
    expect(imported.dataset.utterances.length).toBeLessThan(restoredSource?.utterances.length ?? 0);

    const restoredTimeline = buildSenaModel(restoredSource ?? imported.dataset, imported.reproducibility.buildOptions);
    expect(restoredTimeline.temporal.windows.some((window) => window.id === imported.source.activeTemporalWindow?.id)).toBe(true);

    const restoredScopedDataset = scopeSenaDatasetToWindow(restoredSource ?? imported.dataset, imported.source.activeTemporalWindow!);
    const restoredModel = buildSenaModel(restoredScopedDataset, imported.reproducibility.buildOptions);
    expect(restoredModel.matrices.fusion.values).toEqual(imported.analysis.matrices.fusion.values);
    expect(imported.analysis.nodes?.length).toBe(restoredModel.nodes.length);
    expect(imported.analysis.edges?.length).toBe(restoredModel.edges.length);
  });

  it("imports legacy v1 snapshots whose buildOptions predate the analysis-config declarations", () => {
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(exampleSenaContract), {
      generatedAt: "2026-06-08T02:10:00.000Z"
    });
    const legacy = JSON.parse(JSON.stringify(snapshot));
    legacy.reproducibility.buildOptions = {
      alpha: 0.72,
      beta: 0.64,
      gamma: 0.86,
      normalization: "max",
      undirectedSocial: true,
      temporal: legacy.reproducibility.buildOptions.temporal
    };

    const imported = importSenaProjectSnapshot(JSON.stringify(legacy));
    expect(imported.schemaVersion).toBe("sena-project-snapshot/v1");
    expect(imported.reproducibility.buildOptions.direction).toBeUndefined();

    const rebuilt = buildSenaModel(imported.dataset, imported.reproducibility.buildOptions);
    expect(rebuilt.options.direction).toBe("undirected");
    expect(rebuilt.options.Phi).toBe("classical_mds");
    expect(rebuilt.options.deg_convention).toBe("row-sum");

    const invalidDeclared = JSON.parse(JSON.stringify(legacy));
    invalidDeclared.reproducibility.buildOptions.direction = "sideways";
    expect(() => importSenaProjectSnapshot(invalidDeclared)).toThrow(/buildOptions.direction is not supported/);
  });

  it("rejects malformed project snapshots before workspace restore", () => {
    expect(isSenaProjectSnapshot({ schemaVersion: "sena-project-snapshot/v1" })).toBe(false);
    expect(() => importSenaProjectSnapshot({
      schemaVersion: "sena-project-snapshot/v1",
      title: "Bad snapshot",
      generatedAt: "2026-06-08T02:00:00.000Z",
      source: {
        milestone: "local-research-pilot",
        activeTemporalWindow: null,
        sourceDatasetCounts: {
          people: 0,
          interactions: 0,
          utterances: 0,
          codedSegments: 0,
          codes: 0
        }
      },
      reproducibility: {
        buildOptions: {
          alpha: "bad",
          beta: 0.5,
          gamma: 0.5,
          normalization: "max",
          temporal: {
            mode: "stage",
            movingWindowSize: 3,
            movingWindowStep: 1,
            turnWindowRadius: 1
          }
        }
      },
      dataset: {},
      analysis: {},
      report: { schemaVersion: "sena-report/v1" }
    })).toThrow(/project snapshot.dataset.people/i);

    const validSnapshot = buildSenaProjectSnapshot(buildSenaModel(exampleSenaContract), {
      generatedAt: "2026-06-08T02:10:00.000Z"
    });
    expect(() => importSenaProjectSnapshot({
      ...validSnapshot,
      workspaceState: {
        demoVerificationManualReviews: {
          "sample-import": {
            status: "maybe",
            reviewer: "Pilot reviewer",
            verifiedAt: "2026-06-08T02:10:00.000Z",
            notes: "Invalid status."
          }
        }
      }
    })).toThrow(/workspaceState\.demoVerificationManualReviews\.sample-import\.status/i);
  });

  it("renders SENA reports to Markdown with matrices, evidence, and review notes", () => {
    const model = buildSenaModel(exampleSenaContract);
    const report = buildSenaReport(model, {
      generatedAt: "2026-06-08T00:00:00.000Z",
      humanReview: {
        reviewer: "Research lead",
        interpretation: "The bridge layer identifies who is associated with code-pair windows.",
        limitations: "Check inter-rater agreement before making claims.",
        nextActions: "Attach reviewed excerpts to the final report."
      }
    });
    const markdown = buildSenaMarkdownReport(report);
    const temporalTopGPair = report.figures.temporalRuntimeNarrative.find((entry) => entry.strongestGPair)
      ?.strongestGPair?.label;

    expect(markdown).toContain("# SENA Analysis Report");
    expect(markdown).toContain("Analysis window: Full conversation");
    expect(markdown).toContain("## Parameters");
    expect(markdown).toContain("- Analysis window: Full conversation");
    expect(markdown).toContain("- Bridge weight rule: count");
    expect(markdown).toContain("- Dataset version:");
    expect(markdown).toContain("- Dataset content hash: 0x");
    expect(markdown).toContain("- Analysis config hash: 0x");
    expect(report.modelCard.schemaVersion).toBe("sena-model-card/v2");
    expect(report.modelCard.renderGate.status).toBe("blocked");
    expect(report.modelCard.renderGate.missingSectionIds).toContain("coding-reliability");
    expect(markdown).toContain("## Model Card");
    expect(markdown).toContain("Model card incomplete - rendering blocked");
    expect(markdown).toContain("Sections complete:");
    expect(markdown).toContain("## Runtime Provenance");
    expect(markdown).toContain("## Interpretation Guardrails");
    expect(markdown).toContain("Joint mode uses declared A_fusion embedding operators");
    expect(markdown).toContain("Laplacian eigenmaps");
    expect(markdown).toContain("operator, delta, dimension, seed, metric exactness, and stress");
    expect(report.operatorDiagnostics.embedding.mds.delta).toBe("shortest-path-reciprocal-weight");
    expect(markdown).toContain("## Embedding Diagnostics");
    expect(markdown).toContain("MDS delta: shortest-path-reciprocal-weight");
    expect(markdown).toContain("metric_exact");
    expect(markdown).toContain("Commute-time");
    expect(markdown).toContain("## Bridge Weight Rule");
    expect(markdown).toContain("Active code value: segment-code-count");
    expect(markdown).toContain("## Attribution Wording Gate");
    expect(markdown).toContain("associated with windows containing the pair");
    expect(markdown).toContain("## Typed Centrality Families");
    expect(markdown).toContain("mixed-type centrality ranking");
    expect(markdown).toContain("A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]");
    expect(markdown).toContain("- ENA dependency: 0.6.2 (node_modules/jena-js/package.json)");
    expect(markdown).toContain("- ENA API surface: ena()");
    expect(markdown).toContain("- SNA dependency: npm:@peterhudongpin/sna.js@0.4.0 (node_modules/sna.js/package.json)");
    expect(markdown).toContain("- SNA API surface: gden(), nties(), degree(), betweenness(), reachability(), averagePathLength(), labelPropagation(), components(), isConnected(), geodist(), grecip()");
    expect(markdown).toContain("### Runtime Parity Evidence");
    expect(markdown).toContain("jena-rena-sample-parity");
    expect(markdown).toContain("jsna-r-sna-social-parity");
    expect(markdown).toContain("fixture=lib/ena/__fixtures__/r-ena-sample-parity.json");
    expect(markdown).toContain("fixture=lib/sena/__fixtures__/r-sna-social-parity.json");
    expect(markdown).toContain("Observed structure, not causality");
    expect(markdown).toContain("## Data Contract Audit");
    expect(markdown).toContain("sena-data-contract-audit/v1");
    expect(markdown).toContain("## jENA Manifest");
    expect(markdown).toContain("## jSNA Manifest");
    expect(markdown).toContain("- Alias: jSNA");
    expect(markdown).toContain("- People/interactions/weighted ties:");
    expect(markdown).toContain("## Runtime Consistency Audit");
    expect(markdown).toContain("sena-runtime-consistency/v1");
    expect(markdown).toContain("## Fusion Math Audit");
    expect(markdown).toContain("sena-fusion-math-audit/v2");
    expect(markdown).toContain("## Pilot Readiness Audit");
    expect(markdown).toContain("sena-pilot-readiness/v1");
    expect(markdown).toContain("## Claim Readiness Gate");
    expect(markdown).toContain("sena-claim-readiness-gate/v1");
    expect(markdown).toContain("Exploratory until coding reliability, data governance");
    expect(markdown).toContain("## Coding Reliability Gate");
    expect(markdown).toContain("sena-coding-reliability-gate/v1");
    expect(markdown).toContain("## Report Completeness Audit");
    expect(markdown).toContain("- Overall status:");
    expect(markdown).toContain("## Validation");
    expect(markdown).toContain("## Temporal Trace");
    expect(markdown).toContain("| Window | Turns | Stages | Utterances | Interactions | Segments | Social | Concept | Bridge | G total | A_fusion checksum | Top S tie | Top W tie | Top B tie | Active G pairs | Top G pair | Lead contributor | Evidence | Top codes |");
    expect(temporalTopGPair).toBeTruthy();
    expect(markdown).toContain(temporalTopGPair as string);
    expect(markdown).toContain("Brainstorming");
    expect(markdown).toContain("Evidence Building");
    expect(markdown).toContain("### S: social layer");
    expect(markdown).toContain("### G: person-code-pair layer");
    expect(markdown).toContain("## Person-Code-Pair Drivers");
    expect(markdown).toContain("direct");
    expect(markdown).toContain("## Method Validation");
    expect(markdown).toContain("### Metric Provenance");
    expect(markdown).toContain("| Metric | Scope | Source | Implementation | Parity status | Interpretation limit |");
    expect(markdown).toContain("sna.js gden() over the S block with diag=false.");
    expect(markdown).toContain("sna.js betweenness(cmode=\"undirected\", rescale=false) over the S block.");
    expect(markdown).toContain("SENA normalized block matrix [alpha*S gamma*B_PC; gamma*B_CP beta*W].");
    expect(markdown).toContain("Alpha/beta/gamma sensitivity");
    expect(markdown).toContain("Community Stability");
    expect(markdown).toContain("Temporal Stability");
    expect(markdown).toContain("Permutation and Bootstrap Null Models");
    expect(markdown).toContain("global-code-label-shuffle");
    expect(markdown).toContain("sena-self-implemented");
    expect(markdown).toContain("## Evidence Snippets");
    expect(markdown).toContain("## Human-Reviewed Interpretation");
    expect(markdown).toContain("The bridge layer identifies who is associated with code-pair windows.");
  });

  it("keeps Joint layout documentation scoped to declared embedding provenance", () => {
    const readme = readWorkspaceBytes("README.md").toString("utf8");
    const layoutSource = readWorkspaceBytes("components/sena/workspace/fusion-layout.ts").toString("utf8");

    expect(readme).toContain("Joint mode uses declared `A_fusion` embedding operators");
    expect(readme).toContain("Laplacian eigenmaps");
    expect(readme).toContain("operator, delta, dimension, deterministic seed, metric exactness, and stress");
    expect(layoutSource).toContain("operatorDiagnostics.embedding.mds.coordinates");
    expect(layoutSource).not.toContain("for (let iteration = 0; iteration < 130");
  });

  it("keeps the social and epistemic blocks symmetric when undirected social mode is declared", () => {
    const model = buildSenaModel(exampleSenaContract, { undirectedSocial: true });

    for (let i = 0; i < model.matrices.S.raw.length; i += 1) {
      for (let j = 0; j < model.matrices.S.raw.length; j += 1) {
        expect(model.matrices.S.raw[i][j]).toBe(model.matrices.S.raw[j][i]);
      }
    }

    for (let i = 0; i < model.matrices.W.raw.length; i += 1) {
      for (let j = 0; j < model.matrices.W.raw.length; j += 1) {
        expect(model.matrices.W.raw[i][j]).toBe(model.matrices.W.raw[j][i]);
      }
    }
  });

  it("computes social-network metrics through SNA.js", () => {
    const model = buildSenaModel(exampleSenaContract, { undirectedSocial: true });
    const ava = model.nodes.find((node) => node.id === "A");

    expect(model.summary.socialAnalysis.engine).toBe("sna.js");
    expect(model.summary.socialAnalysis.tieCount).toBe(10);
    expect(model.summary.socialAnalysis.density).toBeCloseTo(10 / 15);
    expect(model.summary.socialDensity).toBeCloseTo(model.summary.socialAnalysis.density);
    expect(model.summary.socialAnalysis.reciprocity).toBe(0);
    expect(model.summary.socialAnalysis.componentCount).toBe(1);
    expect(model.summary.socialAnalysis.largestComponentSize).toBe(exampleSenaContract.people.length);
    expect(model.summary.socialAnalysis.averagePathLength).toBeGreaterThan(0);
    expect(model.summary.socialAnalysis.communityCount).toBeGreaterThan(0);
    expect(model.socialReport.graph.engine).toBe("sna.js");
    expect(model.socialReport.graph.tieCount).toBe(model.summary.socialAnalysis.tieCount);
    expect(model.socialReport.graph.communityDetection).toMatch(/label propagation/i);
    expect(model.socialReport.actors).toHaveLength(exampleSenaContract.people.length);
    expect(model.socialReport.communities).toHaveLength(model.summary.socialAnalysis.communityCount);

    expect(ava?.kind).toBe("person");
    if (ava?.kind === "person") {
      expect(ava.metrics.socialDegree).toBe(4);
      expect(ava.metrics.socialStrength).toBe(13);
      expect(ava.metrics.socialBetweenness).toBeGreaterThanOrEqual(0);
      expect(ava.metrics.socialReachable).toBe(5);
      expect(ava.metrics.socialComponent).toBe(0);
      expect(ava.metrics.socialCommunity).toBeGreaterThanOrEqual(0);
      expect(ava.metrics.socialCloseness).toBeGreaterThan(0);
    }

    const avaReport = model.socialReport.actors.find((actor) => actor.id === "A");
    expect(avaReport?.degree).toBe(4);
    expect(avaReport?.strength).toBe(13);
    expect(avaReport?.betweenness).toBeGreaterThanOrEqual(0);
    expect(avaReport?.closeness).toBeGreaterThan(0);
  });

  it("builds a jSNA manifest from sna.js social outputs", () => {
    const model = buildSenaModel(exampleSenaContract, { undirectedSocial: true });
    const manifest = buildSenaSnaManifest(model);

    expect(manifest.schemaVersion).toBe("sena-jsna-manifest/v1");
    expect(manifest.status).toBe("computed");
    expect(manifest.engine).toBe("sna.js");
    expect(manifest.engineAlias).toBe("jSNA");
    expect(manifest.source.rowsFrom).toBe("interactions");
    expect(manifest.source.graphMode).toBe("graph");
    expect(manifest.source.undirectedSocial).toBe(true);
    expect(manifest.datasetCounts.people).toBe(exampleSenaContract.people.length);
    expect(manifest.datasetCounts.interactions).toBe(exampleSenaContract.interactions.length);
    expect(manifest.datasetCounts.weightedTies).toBe(model.socialReport.graph.tieCount);
    expect(manifest.datasetCounts.communities).toBe(model.socialReport.graph.communityCount);
    expect(manifest.outputs?.graph).toEqual(model.socialReport.graph);
    expect(manifest.outputs?.actorMetrics).toEqual(model.socialReport.actors);
    expect(manifest.outputs?.communities).toEqual(model.socialReport.communities);
    expect(manifest.outputs?.socialMatrix).toEqual(model.matrices.S);
  });

  it("builds schema-versioned jENA, jSNA, and G contribution report artifacts", () => {
    const model = buildSenaModel(exampleSenaContract);
    const activeWindow = model.temporal.windows[0] ?? null;
    const enaArtifact = buildSenaEnaReportArtifact(model, {
      title: "Lesson Study jENA Report",
      generatedAt: "2026-06-08T10:55:00.000Z",
      activeTemporalWindow: activeWindow
    });
    const snaArtifact = buildSenaSnaReportArtifact(model, {
      title: "Lesson Study jSNA Report",
      generatedAt: "2026-06-08T11:00:00.000Z",
      activeTemporalWindow: activeWindow
    });
    const gArtifact = buildSenaPairContributionReportArtifact(model, {
      title: "Lesson Study G Report",
      generatedAt: "2026-06-08T11:05:00.000Z",
      activeTemporalWindow: activeWindow
    });

    expect(enaArtifact.schemaVersion).toBe("sena-ena-report/v1");
    expect(enaArtifact.workspaceRoute).toBe("/workspace/sena");
    expect(enaArtifact.analysisWindow?.id).toBe(activeWindow?.id);
    expect(enaArtifact.runtimeProvenance.engine).toBe("jena-js");
    expect(enaArtifact.runtimeProvenance.dependencySpec).toBe("0.6.2");
    expect(enaArtifact.runtimeProvenance.apiSurface).toContain("ena()");
    expect(enaArtifact.parameters.normalization).toBe(model.options.normalization);
    expect(enaArtifact.manifest.schemaVersion).toBe("sena-ena-manifest/v1");
    expect(enaArtifact.manifest.status).toBe("computed");
    expect(enaArtifact.conceptMatrix).toEqual(model.matrices.W);
    expect(enaArtifact.conceptPairHandoff).toHaveLength((model.codes.length * (model.codes.length - 1)) / 2);
    expect(enaArtifact.conceptPairHandoff.find((row) => row.id === "evidence|explanation")?.overlapStatus).toBe("overlap");
    expect(enaArtifact.conceptPairHandoff.find((row) => row.id === "evidence|explanation")?.guardrail).toContain("not forced to be equal");
    expect(enaArtifact.enaSpace.dimensions.length).toBeGreaterThan(0);
    expect(enaArtifact.enaSpace.connectionCounts.length).toBeGreaterThan(0);
    expect(enaArtifact.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix")?.status).toBe("pass");
    expect(enaArtifact.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.status).toBe("pass");
    expect(enaArtifact.metricProvenance.some((metric) => metric.source === "jena-js")).toBe(true);
    expect(enaArtifact.metricProvenance.find((metric) => metric.id === "jena-connection-counts")?.parityStatus).toContain("bundled rENA fixture parity");
    expect(enaArtifact.interpretationGuardrails.length).toBeGreaterThan(0);

    expect(snaArtifact.schemaVersion).toBe("sena-sna-report/v1");
    expect(snaArtifact.workspaceRoute).toBe("/workspace/sena");
    expect(snaArtifact.analysisWindow?.id).toBe(activeWindow?.id);
    expect(snaArtifact.runtimeProvenance.engine).toBe("sna.js");
    expect(snaArtifact.runtimeProvenance.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(snaArtifact.runtimeProvenance.apiSurface).toContain("geodist()");
    expect(senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity")?.status).toBe("covered");
    expect(snaArtifact.parameters).toEqual({
      undirectedSocial: model.options.undirectedSocial,
      normalization: model.options.normalization
    });
    expect(snaArtifact.manifest.schemaVersion).toBe("sena-jsna-manifest/v1");
    expect(snaArtifact.manifest.outputs?.graph).toEqual(model.socialReport.graph);
    expect(snaArtifact.socialReport).toEqual(model.socialReport);
    expect(snaArtifact.socialMatrix).toEqual(model.matrices.S);
    expect(snaArtifact.socialTieHandoff).toHaveLength(model.edges.filter((edge) => edge.layer === "social").length);
    expect(snaArtifact.socialTieHandoff.every((row) => row.matrixAligned)).toBe(true);
    expect(snaArtifact.socialTieHandoff.some((row) => row.evidencePreview.length > 0 && row.sourceActor && row.targetActor)).toBe(true);
    expect(snaArtifact.metricProvenance.every((metric) => metric.scope === "social-graph" || metric.scope === "social-actor" || metric.scope === "community")).toBe(true);
    expect(snaArtifact.metricProvenance.find((metric) => metric.id === "betweenness")?.parityStatus).toContain("R sna::betweenness");
    expect(snaArtifact.interpretationGuardrails.length).toBeGreaterThan(0);

    expect(gArtifact.schemaVersion).toBe("sena-person-code-pair-g-report/v1");
    expect(gArtifact.workspaceRoute).toBe("/workspace/sena");
    expect(gArtifact.analysisWindow?.id).toBe(activeWindow?.id);
    expect(gArtifact.runtimeProvenance.senaModel.matrixFormula).toBe("A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]");
    expect(gArtifact.runtimeProvenance.enaRuntime.dependencySpec).toBe("0.6.2");
    expect(gArtifact.runtimeProvenance.snaRuntime.dependencySpec).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(gArtifact.parameters).toEqual({
      alpha: model.options.alpha,
      beta: model.options.beta,
      gamma: model.options.gamma,
      normalization: model.options.normalization
    });
    expect(gArtifact.pairReport).toEqual(model.pairReport);
    expect(gArtifact.G).toEqual(model.matrices.G);
    expect(gArtifact.supportingMatrices.S).toEqual(model.matrices.S);
    expect(gArtifact.supportingMatrices.W).toEqual(model.matrices.W);
    expect(gArtifact.supportingMatrices.B).toEqual(model.matrices.B);
    expect(gArtifact.metricProvenance.some((metric) => metric.scope === "bridge" || metric.scope === "fusion")).toBe(true);
    expect(gArtifact.pairReport.some((pair) => pair.evidence.length > 0)).toBe(true);
  });

  for (const [fixtureName, fixture] of Object.entries(rSnaSocialParity)) {
    it(`matches R-derived SNA centrality, reciprocity, and component fixture: ${fixtureName}`, () => {
      const model = buildSenaModel(buildSocialParityDataset(fixture), { undirectedSocial: true });

      expect(model.matrices.S.raw).toEqual(fixture.undirectedMatrix);
      expect(model.summary.socialAnalysis.reciprocity).toBeCloseTo(fixture.reciprocity, 12);
      expect(model.summary.socialAnalysis.averagePathLength).toBeCloseTo(fixture.averagePathLength, 12);
      expect(model.summary.socialAnalysis.componentCount).toBe(fixture.componentCount);

      for (const [index, personId] of fixture.people.entries()) {
        const actor = model.socialReport.actors.find((candidate) => candidate.id === personId);
        expect(actor).toBeTruthy();
        expect(actor?.degree).toBeCloseTo(fixture.degree[index] ?? 0, 12);
        expect(actor?.strength).toBeCloseTo(fixture.weightedDegree[index] ?? 0, 12);
        expect(actor?.betweenness).toBeCloseTo(fixture.betweenness[index] ?? 0, 12);
        expect(actor?.closeness).toBeCloseTo(fixture.closeness[index] ?? 0, 12);
        expect(actor?.reachable).toBe(fixture.reachable[index] ?? 0);
      }

      expectSamePartition(
        fixture.people.map((personId) => model.socialReport.actors.find((actor) => actor.id === personId)?.component ?? -1),
        fixture.componentLabels
      );
    });
  }

  for (const [fixtureName, fixture] of Object.entries(rSnaSocialParity).filter(([, graph]) => graph.communityLabels)) {
    it(`matches an R-derived label-propagation community fixture: ${fixtureName}`, () => {
      const model = buildSenaModel(buildSocialParityDataset(fixture), { undirectedSocial: true });

      expect(model.summary.socialAnalysis.communityCount).toBe(fixture.communityCount);
      expect(model.socialReport.communities).toHaveLength(fixture.communityCount ?? 0);
      expectSamePartition(
        fixture.people.map((personId) => model.socialReport.actors.find((actor) => actor.id === personId)?.community ?? -1),
        fixture.communityLabels ?? []
      );
    });
  }

  it("handles empty and single-actor edge cases without NaN or crashes", () => {
    const empty = buildSenaModel(createEmptySenaDataset());
    expect(empty.summary.people).toBe(0);
    expect(empty.summary.socialAnalysis.density).toBe(0);
    expect(empty.summary.socialAnalysis.connected).toBe(true);
    expect(empty.temporal.windows).toHaveLength(0);
    const emptyReport = buildSenaReport(empty);
    expect(emptyReport.validation.stability.temporal.variants[0]?.utteranceCoverage).toBe(1);
    expect(emptyReport.dataContractAudit.status).toBe("needs-review");
    expect(emptyReport.dataContractAudit.items.find((item) => item.id === "five-table-shape")?.status).toBe("review");
    expect(emptyReport.completenessAudit.status).toBe("needs-review");
    expect(emptyReport.completenessAudit.items.find((item) => item.id === "data-contract-audit")?.status).toBe("review");
    expect(emptyReport.completenessAudit.items.find((item) => item.id === "jena-manifest")?.status).toBe("review");
    expect(emptyReport.completenessAudit.items.find((item) => item.id === "jsna-manifest")?.status).toBe("review");
    expect(emptyReport.completenessAudit.items.find((item) => item.id === "human-review")?.status).toBe("review");
    expect(emptyReport.runtimeConsistencyAudit.status).toBe("needs-review");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jena-status")?.status).toBe("pass");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jena-local-dependency")?.status).toBe("pass");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jena-api-surface")?.status).toBe("pass");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.status).toBe("pass");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix")?.status).toBe("review");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-local-dependency")?.status).toBe("pass");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-api-surface")?.status).toBe("pass");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity")?.status).toBe("pass");
    expect(emptyReport.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-graph")?.status).toBe("review");
    expect(emptyReport.pilotReadinessAudit.status).toBe("needs-review");
    expect(emptyReport.pilotReadinessAudit.items.find((item) => item.id === "data-contract")?.status).toBe("review");
    expect(emptyReport.pilotReadinessAudit.items.find((item) => item.id === "human-review")?.status).toBe("review");
    expect(emptyReport.claimReadinessGate.status).toBe("exploratory");
    expect(emptyReport.claimReadinessGate.claimUse).toBe("exploratory-only");
    expect(emptyReport.claimReadinessGate.blockers).toContain("Data contract");
    expect(emptyReport.claimReadinessGate.blockers).toContain("Human review");

    const single = buildSenaModel({
      people: [{ id: "solo", label: "Solo", role: "Learner", group: "Solo", initials: "S" }],
      interactions: [],
      utterances: [{
        id: "u1",
        personId: "solo",
        unitId: "u",
        stanzaId: "s",
        stage: "Only",
        turnIndex: 1,
        text: "Solo reflection."
      }],
      coded_segments: [{
        segmentId: "cs1",
        utteranceId: "u1",
        personId: "solo",
        unitId: "u",
        stanzaId: "s",
        stage: "Only",
        turnIndex: 1,
        text: "Solo reflection.",
        codes: ["reflection"]
      }],
      codebook: [{
        id: "reflection",
        label: "Reflection",
        family: "Metacognition",
        description: "Reflective move.",
        color: "#22c55e"
      }]
    });
    expect(single.summary.socialAnalysis.density).toBe(0);
    expect(single.socialReport.actors[0]?.degree).toBe(0);
    expect(single.socialReport.actors[0]?.closeness).toBe(0);
    expect(single.matrices.fusion.values).toHaveLength(2);
  });

  it("surfaces warnings for unknown people/codes while keeping finite metrics", () => {
    const model = buildSenaModel({
      ...exampleSenaContract,
      interactions: [
        ...exampleSenaContract.interactions,
        { source: "A", target: "missing-person", weight: 2, channel: "reply", stage: "Reflection", turnIndex: 99, evidence: "Unknown target" }
      ],
      coded_segments: [
        ...exampleSenaContract.coded_segments,
        {
          segmentId: "bad-code",
          utteranceId: "u1",
          personId: "A",
          unitId: "team",
          stanzaId: "stanza-1",
          stage: "Reflection",
          turnIndex: 99,
          text: "Unknown code reference.",
          codes: ["missing-code"]
        }
      ]
    });

    expect(model.summary.warnings.some((warning) => warning.includes("unknown person"))).toBe(true);
    expect(model.summary.warnings.some((warning) => warning.includes("unknown code"))).toBe(true);
    expect(Number.isFinite(model.summary.socialAnalysis.averagePathLength)).toBe(true);
    expect(model.socialReport.actors.every((actor) => Number.isFinite(actor.closeness))).toBe(true);
  });

  it("keeps log normalization finite under extreme weights", () => {
    const model = buildSenaModel({
      ...exampleSenaContract,
      interactions: exampleSenaContract.interactions.map((interaction, index) => ({
        ...interaction,
        weight: index === 0 ? 1_000_000 : interaction.weight ?? 1
      })),
      coded_segments: exampleSenaContract.coded_segments.map((segment, index) => ({
        ...segment,
        confidence: index === 0 ? 1 : segment.confidence ?? 1
      }))
    }, { normalization: "log-max" });

    const allFusionValues = model.matrices.fusion.values.flat();
    expect(allFusionValues.every(Number.isFinite)).toBe(true);
    expect(Math.max(...allFusionValues)).toBeLessThanOrEqual(Math.max(model.options.alpha, model.options.beta, model.options.gamma));
  });

  it("handles a larger synthetic dataset with report validation checks", () => {
    const dataset = buildLargeSyntheticDataset(40, 12, 180);
    const startedAt = performance.now();
    const model = buildSenaModel(dataset, {
      temporal: {
        mode: "moving-window",
        movingWindowSize: 8,
        movingWindowStep: 4
      }
    });
    const elapsedMs = performance.now() - startedAt;
    const report = buildSenaReport(model, { evidenceLimit: 20 });

    expect(model.summary.people).toBe(dataset.people.length);
    expect(model.summary.concepts).toBe(dataset.codebook.length);
    expect(model.matrices.fusion.values).toHaveLength(dataset.people.length + dataset.codebook.length);
    expect(model.temporal.windows.length).toBeGreaterThan(10);
    expect(report.validation.stability.temporal.variants.every((variant) => variant.segmentCoverage > 0.95)).toBe(true);
    expect(report.validation.sensitivity.layerWeights.variants[0]?.fusionLayerTotals.total).toBeGreaterThan(0);
    expect(report.evidenceSnippets.length).toBeLessThanOrEqual(20);
    expect(elapsedMs).toBeLessThan(5000);
  }, 180_000);

  it("computes interpretable bridge metrics and evidence links", () => {
    const model = buildSenaModel(exampleSenaContract);
    const chen = model.nodes.find((node) => node.id === "C");
    const bridgeEdge = model.edges.find((edge) => edge.layer === "bridge" && edge.source === "C" && edge.target === "explanation");

    expect(chen?.kind).toBe("person");
    if (chen?.kind === "person") {
      expect(chen.metrics.epistemicContribution).toBeGreaterThan(0);
      expect(chen.metrics.topPairs.length).toBeGreaterThan(0);
      expect(Number.isFinite(chen.metrics.alignment)).toBe(true);
    }

    const evidenceExplanation = model.pairReport.find((pair) => pair.id === "evidence|explanation");
    const chenIndex = model.people.findIndex((person) => person.id === "C");
    const pairIndex = model.matrices.G.pairIds.indexOf("evidence|explanation");
    expect(pairIndex).toBeGreaterThanOrEqual(0);
    expect(model.matrices.G.raw[chenIndex]?.[pairIndex]).toBeGreaterThan(0);
    expect(evidenceExplanation?.totalContribution).toBeGreaterThan(0);
    expect(evidenceExplanation?.topContributors.some((contributor) => contributor.id === "C")).toBe(true);
    expect(evidenceExplanation?.evidence.length).toBeGreaterThan(0);

    expect(bridgeEdge?.evidence.length).toBeGreaterThan(0);
    expect(bridgeEdge?.evidence[0].text).toMatch(/explanation/i);
  });

  it("separates direct and supporting G contributors for evidence-explanation links", () => {
    const model = buildSenaModel(exampleSenaContract);
    const evidenceExplanation = model.pairReport.find((pair) => pair.id === "evidence|explanation");
    const ava = evidenceExplanation?.topContributors.find((contributor) => contributor.id === "A");
    const eli = evidenceExplanation?.topContributors.find((contributor) => contributor.id === "E");

    expect(evidenceExplanation?.totalContribution).toBeCloseTo(15);
    expect(ava?.weight).toBeCloseTo(3);
    expect(ava?.directWeight).toBeCloseTo(2);
    expect(ava?.supportingWeight).toBeCloseTo(1);
    expect(ava?.evidence.map((snippet) => snippet.id)).toEqual(["s1", "s6", "s12"]);
    expect(eli?.directWeight).toBe(0);
    expect(eli?.supportingWeight).toBeCloseTo(3);
  });

  it("scales the fusion matrix when layer weights change", () => {
    const lowBridge = buildSenaModel(exampleSenaContract, { gamma: 0.2 });
    const highBridge = buildSenaModel(exampleSenaContract, { gamma: 1 });
    const personOffset = 0;
    const codeOffset = exampleSenaContract.people.length;

    expect(highBridge.matrices.fusion.values[personOffset][codeOffset]).toBeGreaterThan(
      lowBridge.matrices.fusion.values[personOffset][codeOffset]
    );
  });

  it("imports JSON contract tables with validation warnings", () => {
    const result = importSenaJsonContract(JSON.stringify(exampleSenaContract));
    const model = buildSenaModel(result.dataset);

    expect(result.dataset.utterances).toHaveLength(exampleSenaContract.utterances.length);
    expect(result.dataset.coded_segments).toHaveLength(exampleSenaContract.coded_segments.length);
    expect(model.summary.people).toBe(exampleSenaContract.people.length);
  });

  it("computes report temporal transitions from the full source dataset even when the model is window-scoped", () => {
    // Regression for the pilot:verify browser-smoke failure: the workspace builds its
    // analysis model from a dataset scoped to the active temporal window
    // (scopeSenaDatasetToWindow), then exports the report passing the full dataset as
    // sourceDataset. The report's temporalRuntimeTransitions must reflect the full
    // timeline's adjacent-window deltas, not the single scoped window (which has none).
    // Library-only tests missed this because they never scope the model.
    const fullModel = buildSenaModel(lessonStudySenaContract);
    const activeWindow = fullModel.temporal.windows[0];
    const scopedModel = buildSenaModel(scopeSenaDatasetToWindow(lessonStudySenaContract, activeWindow));

    const scopedOnly = buildSenaReport(scopedModel);
    const withSource = buildSenaReport(scopedModel, {
      sourceDataset: lessonStudySenaContract,
      activeTemporalWindow: activeWindow
    });

    const transitions = withSource.figures.temporalRuntimeTransitions;
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.some((transition) => Number.isFinite(transition.delta?.G))).toBe(true);
    // The scoped-only report (no sourceDataset) is the degenerate single-window case.
    expect(scopedOnly.figures.temporalRuntimeTransitions.length).toBeLessThan(transitions.length);
  });

  it("imports mapped CSV tables into the SENA contract", () => {
    const people = parseSenaCsv("person_id,name\nA,Ava\nB,Ben\n");
    const interactions = parseSenaCsv("from,to,weight,turn_index\nA,B,2,1\nB,A,1,2\n");
    const utterances = parseSenaCsv("utterance_id,person_id,stanza_id,turn_index,text\nu1,A,s1,1,Question\nu2,B,s1,2,Evidence\n");
    const segments = parseSenaCsv("segment_id,utterance_id,codes\ns1,u1,question\ns2,u2,evidence|question\n");
    const codebook = parseSenaCsv("code_id,code_label\nquestion,Question\nevidence,Evidence\n");

    const result = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: people.columns, rows: people.rows, mapping: inferSenaColumnMapping("people", people.columns) },
      { name: "interactions.csv", table: "interactions", columns: interactions.columns, rows: interactions.rows, mapping: inferSenaColumnMapping("interactions", interactions.columns) },
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);

    const model = buildSenaModel(result.dataset);
    expect(result.warnings).toHaveLength(0);
    expect(model.summary.people).toBe(2);
    expect(model.summary.concepts).toBe(2);
    expect(model.dataset.interactions[0]?.turnIndex).toBe(1);
    expect(model.summary.socialAnalysis.reciprocity).toBe(1);
  });

  it("derives placeholder people from coded_segments when the people table is absent", () => {
    // A coded_segments-only upload references people (contributor person_id and a
    // directed-bridge target_person_ids) that no other table defines. They must
    // be recovered as placeholder people, otherwise every segment is dropped as
    // "unknown person" and the social/bridge matrices collapse to empty.
    const result = importSenaJsonContract(JSON.stringify({
      coded_segments: [
        { segment_id: "s1", utterance_id: "u1", person_id: "P1", codes: "evidence", stanza_id: "st1", unit_id: "unit-a", target_person_ids: "P3" },
        { segment_id: "s2", utterance_id: "u2", person_id: "P2", codes: "question", stanza_id: "st1", unit_id: "unit-a" }
      ]
    }));

    expect(result.dataset.people.map((person) => person.id).sort()).toEqual(["P1", "P2", "P3"]);
    expect(result.dataset.people.every((person) => person.group === "Derived")).toBe(true);

    const model = buildSenaModel(result.dataset);
    expect(model.summary.warnings.some((warning) => /unknown person/i.test(warning))).toBe(false);
    expect(model.matrices.B.raw).toHaveLength(3);
    expect(model.matrices.B_CP.raw[0]?.length).toBe(3);
  });

  it("exposes target_person_ids in the blank coded_segments template and maps it through CSV import", () => {
    // The blank template must offer the directed-bridge / Human-AI target column,
    // otherwise researchers cannot supply independent B_CP (code -> person) evidence
    // through the five-CSV path even though the importer and model already support it.
    const templateHeader = readPilotAsset("templates/coded_segments.csv").split(/\r?\n/)[0];
    expect(templateHeader.split(",")).toContain("target_person_ids");

    const people = parseSenaCsv("person_id\nA\nB\n");
    const interactions = parseSenaCsv("from,to\nA,B\n");
    const utterances = parseSenaCsv("utterance_id,person_id,stanza_id,turn_index,text\nu1,A,s1,1,Question\nu2,B,s1,2,Evidence\n");
    const segments = parseSenaCsv("segment_id,utterance_id,person_id,target_person_ids,codes\ns1,u1,A,B,question\ns2,u2,B,,evidence\n");
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\n");

    const result = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: people.columns, rows: people.rows, mapping: inferSenaColumnMapping("people", people.columns) },
      { name: "interactions.csv", table: "interactions", columns: interactions.columns, rows: interactions.rows, mapping: inferSenaColumnMapping("interactions", interactions.columns) },
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);

    // The exposed column parses into targetPersonIds, which drives independent
    // B_CP (code -> person) evidence rather than the B_PC transpose fallback.
    const segment = result.dataset.coded_segments.find((entry) => entry.segmentId === "s1");
    expect(segment?.targetPersonIds).toEqual(["B"]);
  });

  it("exposes actor_type in the blank people template and types actors through import (ADR-0006 D2)", () => {
    // Track C-P0: the roster gains additive actor typing. An empty cell means
    // human and stores nothing (untyped rosters stay byte-identical); an AI
    // row is disclosed as roster semantics only, never as achieved Human-AI
    // SENA; an unrecognized value is disclosed and read as human.
    const templateHeader = readPilotAsset("templates/people.csv").split(/\r?\n/)[0];
    expect(templateHeader.split(",")).toContain("actor_type");

    const people = parseSenaCsv("person_id,actor_type\nA,human\nT1,ai_agent\nB,\nX,robot\n");
    const result = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: people.columns, rows: people.rows, mapping: inferSenaColumnMapping("people", people.columns) }
    ]);

    const byId = new Map(result.dataset.people.map((person) => [person.id, person]));
    expect(byId.get("A")?.actorType).toBe("human");
    expect(byId.get("T1")?.actorType).toBe("ai_agent");
    // Undeclared and unrecognized rows store no actorType key at all, so
    // existing snapshots, exports, and fingerprints cannot shift.
    expect(Object.keys(byId.get("B") ?? {})).not.toContain("actorType");
    expect(Object.keys(byId.get("X") ?? {})).not.toContain("actorType");
    expect(result.warnings.some((warning) => warning.includes('actor_type "robot"'))).toBe(true);
    expect(result.warnings.filter((warning) => warning.includes("roster semantics only"))).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes("(T1)"))).toBe(true);
  });

  it("maps target_actor_ids and JSON actor typing onto the stored contract fields (ADR-0006 D2)", () => {
    // The stored field names stay targetPersonIds/actorType until a versioned
    // migration; target_actor_ids is an importer alias, in CSV and JSON form.
    const utterances = parseSenaCsv("utterance_id,person_id,stanza_id,turn_index,text\nu1,A,s1,1,Question\nu2,B,s1,2,Evidence\n");
    const segments = parseSenaCsv("segment_id,utterance_id,person_id,target_actor_ids,codes\ns1,u1,A,B,question\n");
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\n");
    const csvResult = buildSenaDatasetFromTables([
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);
    expect(csvResult.dataset.coded_segments[0]?.targetPersonIds).toEqual(["B"]);

    const jsonResult = importSenaJsonContract(JSON.stringify({
      people: [
        { person_id: "Ada", actor_type: "human" },
        { person_id: "Tutor", actor_type: "ai_agent" },
        { person_id: "Ben" }
      ],
      utterances: [{ utterance_id: "u1", person_id: "Tutor", stanza_id: "s1", turn_index: 1, text: "Hint" }],
      coded_segments: [
        { segment_id: "s1", utterance_id: "u1", person_id: "Tutor", targetActorIds: ["Ada"], codes: "question" }
      ],
      codebook: [{ code_id: "question" }]
    }));
    const tutor = jsonResult.dataset.people.find((person) => person.id === "Tutor");
    expect(tutor?.actorType).toBe("ai_agent");
    expect(jsonResult.dataset.people.find((person) => person.id === "Ada")?.actorType).toBe("human");
    expect(jsonResult.dataset.coded_segments[0]?.targetPersonIds).toEqual(["Ada"]);
    // Typed targets still drive the independent B_CP path, unchanged.
    const model = buildSenaModel(jsonResult.dataset);
    expect(model.operatorDiagnostics.direction.bridgeMode).toBe("pc-cp-independent");
  });

  it("round-trips a comma-bearing person id through the five-CSV path (ADR-0007 D2)", () => {
    // The G1 failure class: a roster keyed "Last, First" could not express its
    // ids through the multi-value target_person_ids cell — the old splitter
    // shredded them on ",". Multi-value cells now split on "|" only, so the
    // quoted CSV cell arrives verbatim and the declared roster resolves it.
    const people = parseSenaCsv('person_id\n"Wong, Ka Yee"\n"Chan, Tai Man"\n');
    const utterances = parseSenaCsv('utterance_id,person_id,stanza_id,turn_index,text\nu1,"Wong, Ka Yee",s1,1,Question\nu2,"Chan, Tai Man",s1,2,Evidence\n');
    const segments = parseSenaCsv('segment_id,utterance_id,person_id,target_person_ids,codes\ns1,u2,"Chan, Tai Man","Wong, Ka Yee",evidence\n');
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\n");

    const result = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: people.columns, rows: people.rows, mapping: inferSenaColumnMapping("people", people.columns) },
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);

    const segment = result.dataset.coded_segments.find((entry) => entry.segmentId === "s1");
    expect(segment?.targetPersonIds).toEqual(["Wong, Ka Yee"]);
    // No fragments were invented and no placeholder was derived (G1 stays fixed).
    expect(result.dataset.people.map((person) => person.id).sort()).toEqual(["Chan, Tai Man", "Wong, Ka Yee"]);
    // A cell that IS a declared id verbatim is not ambiguous — no split warning.
    expect(result.warnings.some((warning) => /read as one value/i.test(warning))).toBe(false);
    // ADR-0007 D1: the delimiter-bearing ids are still disclosed, now as one
    // aggregate per table (a name-keyed roster carries hundreds of them).
    const charsetWarnings = result.warnings.filter((warning) => /^people: \d+ id\(s\) contain/.test(warning));
    expect(charsetWarnings).toHaveLength(1);
    expect(charsetWarnings[0]).toContain('"Wong, Ka Yee"');
  });

  it("accepts JSON arrays for multi-value fields (ADR-0007 D2)", () => {
    // The JSON contract's array form is the canonical escape for ids that
    // contain delimiters: elements join on "|" and split on "|", so each
    // element round-trips verbatim — commas included.
    const result = importSenaJsonContract(JSON.stringify({
      people: [{ person_id: "Wong, Ka Yee" }, { person_id: "Ben" }, { person_id: "Ada" }],
      utterances: [
        { utterance_id: "u1", person_id: "Ada", stanza_id: "s1", turn_index: 1, text: "Question" }
      ],
      coded_segments: [
        {
          segment_id: "s1",
          utterance_id: "u1",
          person_id: "Ada",
          target_person_ids: ["Wong, Ka Yee", "Ben"],
          codes: ["question", "evidence"]
        }
      ],
      codebook: [{ code_id: "question" }, { code_id: "evidence" }]
    }));

    const segment = result.dataset.coded_segments[0];
    expect(segment?.codes).toEqual(["question", "evidence"]);
    expect(segment?.targetPersonIds).toEqual(["Wong, Ka Yee", "Ben"]);
    expect(result.dataset.people.map((person) => person.id).sort()).toEqual(["Ada", "Ben", "Wong, Ka Yee"]);
  });

  it("warns on a legacy comma-joined multi-value cell instead of silently re-reading it (ADR-0007 D2 deprecation)", () => {
    // Before ADR-0007 the cell "question,evidence" meant two codes. It now
    // means one value; the meaning change must be disclosed, not silent.
    const utterances = parseSenaCsv("utterance_id,person_id,stanza_id,turn_index,text\nu1,A,s1,1,Question\n");
    const segments = parseSenaCsv('segment_id,utterance_id,person_id,codes\ns1,u1,A,"question,evidence"\n');
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\n");

    const result = buildSenaDatasetFromTables([
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);

    // One value, taken verbatim — never split, never dropped.
    expect(result.dataset.coded_segments[0]?.codes).toEqual(["question,evidence"]);
    // The deprecation warning names the source table, the row, the field, and the fix.
    expect(result.warnings.some((warning) =>
      warning.includes('coded_segments.csv row 1 codes value "question,evidence"') && warning.includes('Separate multiple values with "|"')
    )).toBe(true);
    // The derived delimiter-bearing code id is not *also* reported as a legal
    // verbatim id: the deprecation warning above owns this value.
    expect(result.warnings.some((warning) =>
      /^codebook: \d+ id\(s\) contain/.test(warning) && warning.includes('"question,evidence"')
    )).toBe(false);
  });

  it("does not flag a delimiter-bearing id the import itself derives (ADR-0007 D2 deprecation scope)", () => {
    // Roster-less upload: the coded_segments table IS the roster, so the author
    // "Wong, Ka Yee" and the target "Chan, Tai Man" become real people. Judging
    // the deprecation warning against the *declared* tables flagged both as
    // "read as one value, not split" moments before deriving them — advice the
    // researcher cannot act on, about ids the import already accepts.
    const segments = parseSenaCsv(
      'segment_id,utterance_id,person_id,target_person_ids,codes\ns1,u1,"Wong, Ka Yee","Chan, Tai Man",evidence\n'
    );

    const result = buildSenaDatasetFromTables([
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) }
    ]);

    expect(result.dataset.people.map((person) => person.id).sort()).toEqual(["Chan, Tai Man", "Wong, Ka Yee"]);
    expect(result.warnings.some((warning) => /read as one value/i.test(warning))).toBe(false);
  });

  it("still flags a legacy multi-value list whose fragments are known ids (ADR-0007 D2 deprecation)", () => {
    // "P2,P3" is the case the deprecation window exists for: both fragments are
    // real people, so under the old splitter this cell meant two targets and
    // now means one. Deriving "P2,P3" as a person must not silence that.
    const segments = parseSenaCsv(
      'segment_id,utterance_id,person_id,target_person_ids,codes\ns1,u1,P1,"P2,P3",evidence\ns2,u2,P2,,question\ns3,u3,P3,,question\n'
    );

    const result = buildSenaDatasetFromTables([
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) }
    ]);

    expect(result.dataset.coded_segments[0]?.targetPersonIds).toEqual(["P2,P3"]);
    expect(result.warnings.some((warning) =>
      warning.includes('coded_segments.csv row 1 target_person_ids value "P2,P3"') && warning.includes('Separate multiple values with "|"')
    )).toBe(true);
  });

  it("aggregates the ADR-0007 D1 charset disclosure instead of warning per id", () => {
    // A 'Last, First' LMS roster is exactly what ADR-0007 D2 exists to support,
    // so one warning per id turned a supported upload into hundreds of
    // unresolvable cleaning warnings.
    const rosterSize = 40;
    const ids = Array.from({ length: rosterSize }, (_, index) => `Wong, Ka Yee ${index + 1}`);
    const people = parseSenaCsv(`person_id\n${ids.map((id) => `"${id}"`).join("\n")}\n`);

    const result = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: people.columns, rows: people.rows, mapping: inferSenaColumnMapping("people", people.columns) }
    ]);

    const charsetWarnings = result.warnings.filter((warning) => /id\(s\) contain "," or ";"/.test(warning));
    expect(charsetWarnings).toHaveLength(1);
    expect(charsetWarnings[0]).toContain(`people: ${rosterSize} id(s) contain`);
    expect(charsetWarnings[0]).toContain('"Wong, Ka Yee 1"');
    expect(charsetWarnings[0]).toContain("…");
    // A "|"-bearing id is a different, actionable problem and stays per id.
    const piped = parseSenaCsv('person_id\n"Wong|Ka Yee"\n"Chan|Tai Man"\n');
    const pipedResult = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: piped.columns, rows: piped.rows, mapping: inferSenaColumnMapping("people", piped.columns) }
    ]);
    expect(pipedResult.warnings.filter((warning) => /contains "\|", the multi-value separator/.test(warning))).toHaveLength(2);
  });

  it("judges each pipe fragment of a half-migrated multi-value cell (ADR-0007 D2 deprecation)", () => {
    // Mid-migration a cell carries both separators. "question|evidence,claim"
    // is two values to the pipe splitter, and the second is a legacy list that
    // silently becomes a fabricated code id — a spurious ENA node. Skipping the
    // whole cell because it contains a "|" hid exactly the case that still hurts.
    const utterances = parseSenaCsv("utterance_id,person_id,stanza_id,turn_index,text\nu1,A,s1,1,Question\n");
    const segments = parseSenaCsv('segment_id,utterance_id,person_id,codes\ns1,u1,A,"question|evidence,claim"\n');
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\nclaim\n");

    const result = buildSenaDatasetFromTables([
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);

    // Splitting is unchanged — the fragment really is one code id.
    expect(result.dataset.coded_segments[0]?.codes).toEqual(["question", "evidence,claim"]);
    expect(result.dataset.codebook.map((code) => code.id)).toContain("evidence,claim");
    // The offending fragment is named, not the whole cell.
    expect(result.warnings.some((warning) =>
      warning.includes('codes value "evidence,claim"') && warning.includes('Separate multiple values with "|"')
    )).toBe(true);
    // The already-migrated fragment is not implicated.
    expect(result.warnings.some((warning) => warning.includes('codes value "question|evidence,claim"'))).toBe(false);
  });

  it("reports a legacy multi-value cell once per import, naming its source table (ADR-0007 D2 deprecation)", () => {
    // Two uploaded coded_segments files carrying the same legacy cell used to
    // produce two identical warnings, both labelled "row 1", with nothing to
    // say which file to open.
    const utterances = parseSenaCsv("utterance_id,person_id,stanza_id,turn_index,text\nu1,A,s1,1,Question\nu2,A,s1,2,Evidence\n");
    const first = parseSenaCsv('segment_id,utterance_id,person_id,codes\ns1,u1,A,"question,evidence"\n');
    const second = parseSenaCsv('segment_id,utterance_id,person_id,codes\ns2,u2,A,"question,evidence"\n');
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\n");

    const result = buildSenaDatasetFromTables([
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "segments-a.csv", table: "coded_segments", columns: first.columns, rows: first.rows, mapping: inferSenaColumnMapping("coded_segments", first.columns) },
      { name: "segments-b.csv", table: "coded_segments", columns: second.columns, rows: second.rows, mapping: inferSenaColumnMapping("coded_segments", second.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);

    const deprecation = result.warnings.filter((warning) => /read as one value/i.test(warning));
    expect(deprecation).toHaveLength(1);
    expect(deprecation[0]).toContain("segments-a.csv row 1 codes");
  });

  it("does not advise on a multi-value cell in a row it skipped (ADR-0007 D2 deprecation)", () => {
    // The row is dropped for having no utterance id, so re-separating its codes
    // cell is advice about a row that is no longer in the dataset.
    const segments = parseSenaCsv('segment_id,utterance_id,person_id,codes\ns1,,A,"question,evidence"\n');
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\n");

    const result = buildSenaDatasetFromTables([
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);

    expect(result.dataset.coded_segments).toHaveLength(0);
    expect(result.warnings.some((warning) => /row 1 is missing segment ID, utterance ID, or codes and was skipped/.test(warning))).toBe(true);
    expect(result.warnings.some((warning) => /read as one value/i.test(warning))).toBe(false);
  });

  it("keeps a flagged legacy cell out of the D1 charset aggregate (ADR-0007 D1/D2)", () => {
    // Reporting that the old splitter would have split "P2,P3" and then, three
    // lines later, that "P2,P3" is legal and kept verbatim is contradictory
    // advice about one id. The deprecation warning owns it; the aggregate's
    // count must stay honest about what it left out.
    const segments = parseSenaCsv(
      'segment_id,utterance_id,person_id,target_person_ids,codes\ns1,u1,P1,"P2,P3",evidence\ns2,u2,P2,,question\ns3,u3,P3,,question\n'
    );

    const result = buildSenaDatasetFromTables([
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) }
    ]);

    expect(result.warnings.some((warning) => /read as one value/i.test(warning))).toBe(true);
    // "P2,P3" was the only delimiter-bearing id, so no aggregate is left to emit.
    expect(result.warnings.filter((warning) => /id\(s\) contain "," or ";"/.test(warning))).toEqual([]);
  });

  it("imports minimal required CSV fields with stable defaults, guarded temporal audit, and snapshot export", () => {
    const people = parseSenaCsv("person_id\nA\nB\n");
    const interactions = parseSenaCsv("from,to\nA,B\n");
    const utterances = parseSenaCsv("utterance_id,person_id,text\nu1,A,Question move\nu2,B,Evidence move\n");
    const segments = parseSenaCsv("segment_id,utterance_id,codes\ns1,u1,question\ns2,u2,evidence|question\n");
    const codebook = parseSenaCsv("code_id\nquestion\nevidence\n");

    const result = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: people.columns, rows: people.rows, mapping: inferSenaColumnMapping("people", people.columns) },
      { name: "interactions.csv", table: "interactions", columns: interactions.columns, rows: interactions.rows, mapping: inferSenaColumnMapping("interactions", interactions.columns) },
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);
    const model = buildSenaModel(result.dataset);
    const report = buildSenaReport(model);
    const snapshot = buildSenaProjectSnapshot(model, {
      generatedAt: "2026-06-09T00:15:00.000Z",
      title: "Minimal Required CSV Snapshot"
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.dataset.people[0]).toMatchObject({
      id: "A",
      label: "A",
      role: "Participant",
      group: "Ungrouped",
      initials: "A"
    });
    expect(result.dataset.interactions[0]).toMatchObject({
      source: "A",
      target: "B",
      weight: 1,
      channel: "interaction",
      stage: "Unstaged",
      evidence: "A -> B"
    });
    expect(result.dataset.interactions[0]?.turnIndex).toBeUndefined();
    expect(result.dataset.utterances[0]).toMatchObject({
      unitId: "unit-1",
      stanzaId: "stanza-1",
      stage: "Unstaged",
      turnIndex: 1
    });
    expect(result.dataset.coded_segments[0]).toMatchObject({
      personId: "A",
      unitId: "unit-1",
      stanzaId: "stanza-1",
      stage: "Unstaged",
      turnIndex: 1,
      text: "Question move"
    });
    expect(result.dataset.codebook[0]).toMatchObject({
      id: "question",
      label: "question",
      family: "Uncategorized",
      description: "No description provided."
    });
    expect(model.summary.people).toBe(2);
    expect(model.summary.socialEdges).toBe(1);
    expect(model.summary.conceptEdges).toBe(1);
    expect(report.dataContractAudit.status).toBe("needs-review");
    expect(report.dataContractAudit.items.find((item) => item.id === "temporal-fields")?.status).toBe("review");
    expect(report.dataContractAudit.items.find((item) => item.id === "temporal-fields")?.actual).toContain("0 stages");
    expect(report.enaManifest.status).toBe("computed");
    expect(report.snaManifest.status).toBe("computed");
    expect(report.matrices.fusion.values.flat().every(Number.isFinite)).toBe(true);
    expect(snapshot.dataset.interactions[0]?.evidence).toBe("A -> B");
    expect(snapshot.analysis.nodes).toHaveLength(model.nodes.length);
    expect(snapshot.analysis.edges).toHaveLength(model.edges.length);
  });

  it("imports the pilot lesson-study CSV assets without manual remapping", () => {
    const tableNames = [
      "lesson-study-people.csv",
      "lesson-study-interactions.csv",
      "lesson-study-utterances.csv",
      "lesson-study-coded_segments.csv",
      "lesson-study-codebook.csv"
    ];

    const tables = tableNames.map((name) => {
      const parsed = parseSenaCsv(readPilotAsset(`sample/${name}`));
      const table: SenaImportTable = name.includes("coded_segments")
        ? "coded_segments"
        : name.includes("interactions")
          ? "interactions"
          : name.includes("utterances")
            ? "utterances"
            : name.includes("codebook")
              ? "codebook"
              : "people";
      return {
        name,
        table,
        columns: parsed.columns,
        rows: parsed.rows,
        mapping: inferSenaColumnMapping(table, parsed.columns)
      };
    });

    const result = buildSenaDatasetFromTables(tables);
    const model = buildSenaModel(result.dataset);
    const report = buildSenaReport(model);

    expect(result.warnings).toHaveLength(0);
    expect(model.summary.people).toBe(4);
    expect(model.summary.concepts).toBe(7);
    expect(model.temporal.windows.map((window) => window.label)).toEqual(["Plan", "Teach", "Reflect"]);
    expect(report.enaManifest.status).toBe("computed");
    expect(result.dataset.interactions.some((interaction) => interaction.evidence.includes("李老師請陳老師把學習目標連到證據"))).toBe(true);
    expect(result.dataset.utterances.some((utterance) => utterance.text.includes("觀課紀錄顯示協作慢慢變成推理的橋"))).toBe(true);
    expect(report.evidenceSnippets.some((snippet) => snippet.text.includes("coordination became a bridge"))).toBe(true);
    expect(report.evidenceSnippets.some((snippet) => snippet.text.includes("學生用圖形做證據但還未說清楚原因"))).toBe(true);
  });

  it("keeps the pilot asset manifest aligned with public sample and template files", () => {
    const sampleHrefs = senaPilotSampleAssets.map((asset) => asset.href);
    const templateHrefs = senaPilotTemplateAssets.map((asset) => asset.href);
    const packageManifest = JSON.parse(readPublicHref(senaPilotPackageManifestUrl)) as {
      schemaVersion: string;
      workspaceRoute: string;
      runtimeRoles: Record<string, string>;
      sampleDataset: {
        contract: string;
        expectedCounts: {
          people: number;
          interactions: number;
          utterances: number;
          codedSegments: number;
          codes: number;
        };
        expectedStages: string[];
        expectedRuntime: {
          jena: string;
          jsna: string;
          dataContractAudit: string;
          fusionMathAudit: string;
          pilotReadinessBeforeHumanReview: string;
        };
      };
      exportArtifacts: string[];
      exportArtifactSchemas: Record<string, string>;
      assets: {
        sample: string[];
        templates: string[];
      };
      assetIntegrity: Array<{
        href: string;
        kind: "sample" | "template";
        format: "json" | "csv";
        bytes: number;
        sha256: string;
      }>;
      handoffChecks: Array<{
        id: string;
        label: string;
        artifact: string;
        expectedEvidence: string[];
      }>;
    };
    const imported = importSenaJsonContract(readPublicHref(packageManifest.sampleDataset.contract));
    const model = buildSenaModel(imported.dataset);
    const report = buildSenaReport(model);

    expect(lessonStudySenaContract.people).toEqual(imported.dataset.people);
    expect(lessonStudySenaContract.interactions).toEqual(imported.dataset.interactions);
    expect(lessonStudySenaContract.utterances).toEqual(imported.dataset.utterances);
    expect(lessonStudySenaContract.coded_segments).toEqual(imported.dataset.coded_segments);
    expect(lessonStudySenaContract.codebook).toEqual(imported.dataset.codebook);
    expect(lessonStudySenaContract.interactions.some((interaction) => interaction.evidence.includes("李老師請陳老師把學習目標連到證據"))).toBe(true);
    expect(lessonStudySampleUrl).toBe("/sena-pilot/sample/lesson-study-sena-contract.json");
    expect(senaPilotPackageManifestUrl).toBe("/sena-pilot/sena-pilot-package-manifest.json");
    expect(senaPilotPackageManifestAsset.href).toBe(senaPilotPackageManifestUrl);
    expect(senaPilotSampleAssets[0]?.href).toBe(lessonStudySampleUrl);
    expect(senaPilotSampleCsvAssets).toHaveLength(5);
    expect(senaPilotSampleAssets).toHaveLength(6);
    expect(senaPilotTemplateAssets).toHaveLength(7);
    expect(new Set([...sampleHrefs, ...templateHrefs]).size).toBe(sampleHrefs.length + templateHrefs.length);
    expect(sampleHrefs.every((href) => href.includes("/sample/"))).toBe(true);
    expect(templateHrefs.every((href) => href.includes("/templates/"))).toBe(true);
    expect(senaPilotTemplateAssets.some((asset) => asset.label === "JSON contract template")).toBe(true);
    expect(senaPilotTemplateAssets.some((asset) => asset.label.includes("Sample"))).toBe(false);
    expect(packageManifest.schemaVersion).toBe("sena-pilot-package-manifest/v1");
    expect(packageManifest.exportArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(packageManifest.workspaceRoute).toBe("/workspace/sena");
    expect(packageManifest.runtimeRoles.jena).toContain("jena-js");
    expect(packageManifest.runtimeRoles.jsna).toContain("sna.js");
    expect(packageManifest.assets.sample).toEqual(sampleHrefs);
    expect(packageManifest.assets.templates).toEqual(templateHrefs);
    expect(packageManifest.assetIntegrity).toHaveLength(sampleHrefs.length + templateHrefs.length);
    expect(senaPilotAssetIntegrity).toEqual(packageManifest.assetIntegrity);
    for (const integrity of packageManifest.assetIntegrity) {
      const expectedKind = sampleHrefs.includes(integrity.href) ? "sample" : "template";
      const bytes = readPublicHrefBytes(integrity.href);
      expect([...sampleHrefs, ...templateHrefs]).toContain(integrity.href);
      expect(integrity.kind).toBe(expectedKind);
      expect(integrity.format).toBe(integrity.href.endsWith(".json") ? "json" : "csv");
      expect(integrity.bytes).toBe(bytes.length);
      expect(integrity.sha256).toBe(sha256Hex(bytes));
    }
    expect(packageManifest.assetIntegrity.map((asset) => asset.href).sort()).toEqual([...sampleHrefs, ...templateHrefs].sort());
    const pilotArtifactCatalog = projectSenaPilotPackageArtifactCatalog();
    expect([...packageManifest.exportArtifacts].sort()).toEqual([...pilotArtifactCatalog.exportArtifacts].sort());
    expect(packageManifest.exportArtifacts.every((artifact) => packageManifest.exportArtifactSchemas[artifact])).toBe(true);
    expect(Object.keys(packageManifest.exportArtifactSchemas).sort()).toEqual([...packageManifest.exportArtifacts].sort());
    expect(packageManifest.exportArtifactSchemas).toEqual(pilotArtifactCatalog.exportArtifactSchemas);
    expect(pilotArtifactCatalog.runtimeArtifactEvidence).toEqual(expect.arrayContaining([
      "sena-jena-manifest.json",
      "sena-ena-report.json",
      "sena-jsna-manifest.json",
      "sena-sna-report.json",
      "sena-runtime-consistency-audit.json",
      "sena-runtime-bundle.json"
    ]));
    expect(packageManifest.handoffChecks.map((check) => check.id)).toEqual([
      "model-json-export",
      "local-runtime-manifests",
      "pilot-asset-integrity",
      "review-packet-audit",
      "coding-reliability-gate",
      "metric-provenance"
    ]);
    expect(senaPilotHandoffChecks).toEqual(packageManifest.handoffChecks);
    expect(packageManifest.handoffChecks.find((check) => check.id === "model-json-export")?.artifact).toBe("sena-project-snapshot.json");
    expect(packageManifest.handoffChecks.find((check) => check.id === "local-runtime-manifests")?.expectedEvidence).toContain("sena-ena-report.json");
    expect(packageManifest.handoffChecks.find((check) => check.id === "local-runtime-manifests")?.expectedEvidence).toContain("sena-runtime-consistency-audit.json");
    expect(packageManifest.handoffChecks.find((check) => check.id === "local-runtime-manifests")?.expectedEvidence).toContain("jena-api-surface");
    expect(packageManifest.handoffChecks.find((check) => check.id === "local-runtime-manifests")?.expectedEvidence).toContain("jsna-api-surface");
    expect(packageManifest.handoffChecks.find((check) => check.id === "local-runtime-manifests")?.expectedEvidence).toContain("jena-rena-parity");
    expect(packageManifest.handoffChecks.find((check) => check.id === "local-runtime-manifests")?.expectedEvidence).toContain("jsna-r-sna-parity");
    expect(packageManifest.handoffChecks.find((check) => check.id === "local-runtime-manifests")?.expectedEvidence).toContain("matrix-fingerprints");
    expect(packageManifest.handoffChecks.find((check) => check.id === "pilot-asset-integrity")?.artifact).toBe("sena-pilot-package-manifest.json");
    expect(packageManifest.handoffChecks.find((check) => check.id === "pilot-asset-integrity")?.expectedEvidence).toContain("assetIntegrity");
    expect(packageManifest.handoffChecks.find((check) => check.id === "pilot-asset-integrity")?.expectedEvidence).toContain("sha256");
    expect(packageManifest.handoffChecks.find((check) => check.id === "coding-reliability-gate")?.artifact).toBe("sena-coding-reliability-gate.json");
    expect(packageManifest.handoffChecks.find((check) => check.id === "coding-reliability-gate")?.expectedEvidence).toContain("agreement metric");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.artifact).toBe("sena-metric-provenance.json");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.expectedEvidence).toContain("sna.js");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.expectedEvidence).toContain("jena-js");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.expectedEvidence).toContain("sena-composite");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.expectedEvidence).toContain("socialMetricSnapshot");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.expectedEvidence).toContain("epistemicMetricSnapshot");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.expectedEvidence).toContain("fusionMetricSnapshot");
    expect(packageManifest.handoffChecks.find((check) => check.id === "metric-provenance")?.expectedEvidence).toContain("interpretation limits");
    expect(packageManifest.handoffChecks.find((check) => check.id === "model-json-export")?.expectedEvidence).toContain("S/W/B/B_PC/B_CP/G matrices");
    expect(packageManifest.handoffChecks.find((check) => check.id === "model-json-export")?.expectedEvidence).toContain("temporal trace windows");
    expect(packageManifest.sampleDataset.expectedCounts).toEqual({
      people: model.dataset.people.length,
      interactions: model.dataset.interactions.length,
      utterances: model.dataset.utterances.length,
      codedSegments: model.dataset.coded_segments.length,
      codes: model.dataset.codebook.length
    });
    expect(model.temporal.windows.map((window) => window.label)).toEqual(packageManifest.sampleDataset.expectedStages);
    expect(report.enaManifest.status).toBe(packageManifest.sampleDataset.expectedRuntime.jena);
    expect(report.snaManifest.status).toBe(packageManifest.sampleDataset.expectedRuntime.jsna);
    expect(report.dataContractAudit.status).toBe(packageManifest.sampleDataset.expectedRuntime.dataContractAudit);
    expect(report.fusionMathAudit.status).toBe(packageManifest.sampleDataset.expectedRuntime.fusionMathAudit);
    expect(report.pilotReadinessAudit.status).toBe(packageManifest.sampleDataset.expectedRuntime.pilotReadinessBeforeHumanReview);
    expect(report.claimReadinessGate.status).toBe("exploratory");
    expect(report.claimReadinessGate.blockers).toContain("Human review");

    for (const asset of [senaPilotPackageManifestAsset, ...senaPilotSampleAssets, ...senaPilotTemplateAssets]) {
      expect(readPublicHref(asset.href).trim().length).toBeGreaterThan(0);
      expect(asset.label.trim()).toBeTruthy();
      expect(asset.detail.trim()).toBeTruthy();
    }
  });

  it("imports the one-click pilot lesson-study JSON asset", () => {
    const result = importSenaJsonContract(readPilotAsset("sample/lesson-study-sena-contract.json"));
    const model = buildSenaModel(result.dataset);
    const enaManifest = buildSenaEnaManifest(model.dataset);
    const report = buildSenaReport(model, {
      title: "Lesson Study SENA Analysis Report",
      humanReview: {
        interpretation: "The sample highlights evidence-explanation links in the reflection stage.",
        limitations: "Demo data only.",
        nextActions: "Replace with project data before making research claims."
      }
    });
    const markdown = buildSenaMarkdownReport(report);

    expect(result.warnings).toHaveLength(0);
    expect(model.summary.people).toBe(4);
    expect(model.summary.socialAnalysis.engine).toBe("sna.js");
    expect(enaManifest.status).toBe("computed");
    expect(enaManifest.datasetCounts.units).toBe(4);
    expect(enaManifest.outputs?.connectionCounts).toHaveLength(4);
    expect(report.runtimeProvenance.enaRuntime.engine).toBe("jena-js");
    expect(report.matrices.fusion.values).toHaveLength(11);
    expect(result.dataset.interactions.some((interaction) => interaction.evidence.includes("李老師請陳老師把學習目標連到證據"))).toBe(true);
    expect(result.dataset.utterances.some((utterance) => utterance.text.includes("學生用圖形做證據但還未說清楚原因"))).toBe(true);
    expect(markdown).toContain("# Lesson Study SENA Analysis Report");
    expect(markdown).toContain("觀課紀錄顯示協作慢慢變成推理的橋");
    expect(markdown).toContain("Runtime Provenance");
    expect(markdown).toContain("Interpretation Guardrails");
  });

  it("keeps the pilot lesson-study social arcs visually tiered", () => {
    const result = importSenaJsonContract(readPilotAsset("sample/lesson-study-sena-contract.json"));
    const model = buildSenaModel(result.dataset, { undirectedSocial: true });
    const socialEdges = model.edges
      .filter((edge) => edge.layer === "social")
      .sort((a, b) => a.id.localeCompare(b.id));
    const weights = socialEdges.map((edge) => edge.weight);

    expect(socialEdges).toHaveLength(6);
    expect(new Set(weights).size).toBe(socialEdges.length);
    expect(Math.max(...weights) / Math.min(...weights)).toBeGreaterThanOrEqual(4);

    const defaultVisibleEdges = model.edges.filter((edge) => edge.normalizedWeight >= 0.16);
    const scale = buildEdgeStrokeScale(defaultVisibleEdges, buildConceptPairContributionMap(model));
    const socialStrokeWidths = socialEdges.map((edge) => readableEdgeStrokeWidth(edge, scale));

    expect(socialEdges.every((edge) => edge.normalizedWeight >= 0.16)).toBe(true);
    expect(new Set(socialStrokeWidths).size).toBe(socialEdges.length);
  });

  it("extracts jENA projected coordinates for the SENA ENA Space layout", () => {
    const result = importSenaJsonContract(readPilotAsset("sample/lesson-study-sena-contract.json"));
    const model = buildSenaModel(result.dataset);
    const enaManifest = buildSenaEnaManifest(model.dataset);
    const coordinates = buildSenaEnaSpaceCoordinateMap(enaManifest, model.people, model.codes);

    expect(coordinates.status).toBe("computed");
    expect(coordinates.source).toBe("jena-js");
    expect(coordinates.dimensions).toEqual(enaManifest.outputs?.dimensions.slice(0, 2));
    for (const person of model.people) {
      expect(coordinates.coordinates[person.id]?.kind).toBe("person");
      expect(Number.isFinite(coordinates.coordinates[person.id]?.x)).toBe(true);
      expect(Number.isFinite(coordinates.coordinates[person.id]?.y)).toBe(true);
    }
    for (const code of model.codes) {
      expect(coordinates.coordinates[code.id]?.kind).toBe("concept");
      expect(Number.isFinite(coordinates.coordinates[code.id]?.rawX)).toBe(true);
      expect(Number.isFinite(coordinates.coordinates[code.id]?.rawY)).toBe(true);
    }
  });

  it("imports the blank JSON contract template as an empty SENA dataset", () => {
    const result = importSenaJsonContract(readPilotAsset("templates/sena-data-contract-template.json"));
    const model = buildSenaModel(result.dataset);
    const enaManifest = buildSenaEnaManifest(result.dataset);
    const coordinates = buildSenaEnaSpaceCoordinateMap(enaManifest, model.people, model.codes);

    expect(result.warnings.some((warning) => warning.includes("missing required field"))).toBe(true);
    expect(model.summary.people).toBe(0);
    expect(model.summary.concepts).toBe(0);
    expect(model.matrices.fusion.values).toHaveLength(0);
    expect(coordinates.status).toBe("skipped");
  });

  it("preserves Chinese and Cantonese lesson-study evidence through import, report, Markdown, and snapshot export", () => {
    const cantoneseEvidence = "我哋睇到學生用圖形解釋，呢個證據支持面積關係。";
    const mandarinReflection = "這個解釋可以回到問題：為什麼底乘高成立？";
    const interactionEvidence = "同伴回應：把證據連到解釋。";
    const people = parseSenaCsv("person_id,label,role\nA,Ms Lee,Teacher\nB,Mr Chan,Researcher\n");
    const interactions = parseSenaCsv(`from,to,weight,turn_index,evidence\nA,B,1,1,${interactionEvidence}\n`);
    const utterances = parseSenaCsv([
      "utterance_id,person_id,stanza_id,stage,turn_index,text",
      `u1,A,s1,Teach,1,${cantoneseEvidence}`,
      `u2,B,s1,Reflect,2,${mandarinReflection}`
    ].join("\n"));
    const segments = parseSenaCsv([
      "segment_id,utterance_id,codes",
      "s1,u1,evidence|explanation",
      "s2,u2,question|explanation"
    ].join("\n"));
    const codebook = parseSenaCsv("code_id,label\nevidence,證據\nexplanation,解釋\nquestion,問題\n");

    const result = buildSenaDatasetFromTables([
      { name: "people.csv", table: "people", columns: people.columns, rows: people.rows, mapping: inferSenaColumnMapping("people", people.columns) },
      { name: "interactions.csv", table: "interactions", columns: interactions.columns, rows: interactions.rows, mapping: inferSenaColumnMapping("interactions", interactions.columns) },
      { name: "utterances.csv", table: "utterances", columns: utterances.columns, rows: utterances.rows, mapping: inferSenaColumnMapping("utterances", utterances.columns) },
      { name: "coded_segments.csv", table: "coded_segments", columns: segments.columns, rows: segments.rows, mapping: inferSenaColumnMapping("coded_segments", segments.columns) },
      { name: "codebook.csv", table: "codebook", columns: codebook.columns, rows: codebook.rows, mapping: inferSenaColumnMapping("codebook", codebook.columns) }
    ]);
    const model = buildSenaModel(result.dataset);
    const report = buildSenaReport(model, { evidenceLimit: 8 });
    const markdown = buildSenaMarkdownReport(report);
    const snapshot = buildSenaProjectSnapshot(model, {
      generatedAt: "2026-06-09T00:00:00.000Z",
      title: "Hong Kong Lesson Study Snapshot"
    });
    const snapshotJson = JSON.stringify(snapshot);

    expect(result.warnings).toHaveLength(0);
    expect(result.dataset.utterances.map((utterance) => utterance.text)).toEqual([
      cantoneseEvidence,
      mandarinReflection
    ]);
    expect(result.dataset.interactions[0]?.evidence).toBe(interactionEvidence);
    expect(model.summary.socialEdges).toBe(1);
    expect(model.summary.conceptEdges).toBeGreaterThan(0);
    expect(report.evidenceSnippets.some((snippet) => snippet.text === cantoneseEvidence)).toBe(true);
    expect(report.evidenceSnippets.some((snippet) => snippet.text === mandarinReflection)).toBe(true);
    expect(markdown).toContain(cantoneseEvidence);
    expect(markdown).toContain(mandarinReflection);
    expect(snapshot.dataset.utterances[0]?.text).toBe(cantoneseEvidence);
    expect(snapshot.report.evidenceSnippets.some((snippet) => snippet.text === mandarinReflection)).toBe(true);
    expect(snapshotJson).toContain(interactionEvidence);
  });

  it("rejects malformed CSV before it reaches the SENA model builder", () => {
    expect(() => parseSenaCsv("person_id,label\n\"A,Ana\n")).toThrow(/unterminated quoted value/i);
  });

  it("pads short CSV rows and tolerates trailing empty cells instead of failing the import", () => {
    const parsed = parseSenaCsv("person_id,label,role\nA,Ana\nB,Ben,Teacher,\n");
    expect(parsed.columns).toEqual(["person_id", "label", "role"]);
    expect(parsed.rows).toEqual([
      { person_id: "A", label: "Ana", role: "" },
      { person_id: "B", label: "Ben", role: "Teacher" }
    ]);
  });

  it("still rejects CSV rows with more non-empty cells than the header", () => {
    expect(() => parseSenaCsv("person_id,label\nA,Ana,extra\n")).toThrow(/has 3 cells but the header has 2/);
  });
});
