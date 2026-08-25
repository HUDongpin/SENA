import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { senaJsonValuesEqual } from "./canonical-json";
import {
  validateSenaProjectSnapshotCanonicalInputs
} from "./analytical-input-validation";
import { buildSenaModel } from "./model";
import {
  normalizeSenaFusionMathAudit,
  type SenaFusionMathAuditEvidence
} from "./fusion-math";
import { assertSenaReliabilityProjectBindingMatchesSnapshot } from "./reliability";
import {
  buildActiveWindowComparison,
  buildSenaActiveWindowBrief,
  buildSenaEvidenceLedger,
  buildSenaReport,
  buildTemporalRuntimeNarrative,
  normalizeSenaDataGovernanceMetadata,
  type SenaReportOptions
} from "./report";
import { buildSenaEnaManifest } from "./ena-manifest";
import { buildSenaSnaManifest } from "./sna-manifest";
import { buildSenaDataContractAudit } from "./data-contract-audit";
import { buildSenaRuntimeConsistencyAudit } from "./runtime-consistency";
import { buildSenaTemporalRuntimeTrace } from "./temporal-runtime";
import { normalizeSenaReportStatisticalLeaves } from "./statistical-leaf-read";
import type {
  SenaDataset,
  SenaDemoVerificationCheck,
  SenaEmbeddingDelta,
  SenaEmbeddingPhi,
  SenaDegreeConvention,
  SenaAnalysisDirection,
  SenaModel,
  SenaNormalization,
  SenaProjectSnapshot,
  SenaReport,
  SenaTemporalMode,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./types";

export type SenaProjectSnapshotOptions = SenaReportOptions & {
  activeTemporalWindow?: SenaTemporalWindow | null;
  sourceDataset?: SenaDataset;
  temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  demoVerificationManualReviews?: Record<string, SenaDemoVerificationCheck["manualReview"]>;
};

export const SENA_PROJECT_SNAPSHOT_CANONICAL_ANALYSIS_MAX_WORK_UNITS = 50_000_000;
export const SENA_PROJECT_SNAPSHOT_MAX_JSON_BYTES = 16 * 1024 * 1024;

const SENA_PROJECT_SNAPSHOT_MAX_JSON_DEPTH = 64;
const SENA_PROJECT_SNAPSHOT_MAX_JSON_TOKENS = 4_194_304;
const SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINERS = 262_144;
const SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINER_MEMBERS = 65_536;
const SENA_PROJECT_SNAPSHOT_MAX_JSON_TOTAL_MEMBERS = 2_097_152;

function datasetCounts(dataset: SenaDataset) {
  return {
    people: dataset.people.length,
    interactions: dataset.interactions.length,
    utterances: dataset.utterances.length,
    codedSegments: dataset.coded_segments.length,
    codes: dataset.codebook.length
  };
}

export function buildSenaProjectSnapshot(model: SenaModel, options: SenaProjectSnapshotOptions = {}): SenaProjectSnapshot {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourceDataset = options.sourceDataset ?? model.dataset;
  const report = buildSenaReport(model, {
    ...options,
    generatedAt
  });
  const temporalRuntimeTrace = options.temporalRuntimeTrace ?? buildSenaTemporalRuntimeTrace(
    sourceDataset,
    model.options,
    { generatedAt }
  );

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectSnapshot,
    title: report.title,
    generatedAt,
    source: {
      milestone: "local-research-pilot",
      activeTemporalWindow: options.activeTemporalWindow ?? null,
      sourceDatasetCounts: datasetCounts(sourceDataset),
      sourceDataset
    },
    reproducibility: {
      requiredRuntimes: {
        sena: report.runtimeProvenance.senaModel,
        ena: report.runtimeProvenance.enaRuntime,
        sna: report.runtimeProvenance.snaRuntime
      },
      formula: report.runtimeProvenance.senaModel.matrixFormula,
      buildOptions: model.options,
      interpretationGuardrails: report.interpretationGuardrails
    },
    dataset: model.dataset,
    analysis: {
      nodes: model.nodes,
      edges: model.edges,
      summary: model.summary,
      matrices: model.matrices,
      socialReport: model.socialReport,
      pairReport: model.pairReport,
      temporal: model.temporal,
      temporalRuntimeTrace
    },
    workspaceState: {
      demoVerificationManualReviews: options.demoVerificationManualReviews ?? {}
    },
    dataGovernance: report.dataGovernance,
    report
  };
}

const normalizationValues = new Set<SenaNormalization>(["max", "frobenius", "log1p-max", "log-max", "none"]);
const temporalModeValues = new Set<SenaTemporalMode>(["stage", "moving-window", "turn-window"]);
const directionValues = new Set<SenaAnalysisDirection>(["directed", "undirected"]);
const degreeConventionValues = new Set<SenaDegreeConvention>(["row-sum"]);
const phiValues = new Set<SenaEmbeddingPhi>(["classical_mds", "laplacian_eigenmaps", "commute_time"]);
const deltaValues = new Set<SenaEmbeddingDelta>(["shortest_path_reciprocal_weight", "combinatorial_laplacian", "commute_time_resistance"]);

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedProduct(limit: number, ...factors: number[]) {
  let product = 1;
  for (const factor of factors) {
    if (!Number.isSafeInteger(factor) || factor < 0 || factor > limit / product) {
      return limit + 1;
    }
    product *= factor;
  }
  return product;
}

export class SenaProjectSnapshotResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SenaProjectSnapshotResourceLimitError";
  }
}

function snapshotAdmissionError() {
  return new SenaProjectSnapshotResourceLimitError(
    "SENA project snapshot exceeds the supported structural admission limit."
  );
}

function assertSenaProjectSnapshotJsonStringAdmission(raw: string) {
  type Frame = { hasContent: boolean; members: number };
  const frames: Frame[] = [];
  let bytes = 0;
  let containers = 0;
  let totalMembers = 0;
  let tokens = 0;
  let inString = false;
  let escaped = false;
  let primitiveToken = false;

  const markContent = () => {
    const frame = frames.at(-1);
    if (!frame || frame.hasContent) return;
    frame.hasContent = true;
    frame.members = 1;
    totalMembers += 1;
    if (totalMembers > SENA_PROJECT_SNAPSHOT_MAX_JSON_TOTAL_MEMBERS) {
      throw snapshotAdmissionError();
    }
  };

  for (const character of raw) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes > SENA_PROJECT_SNAPSHOT_MAX_JSON_BYTES) throw snapshotAdmissionError();
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      markContent();
      tokens += 1;
      primitiveToken = false;
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      markContent();
      tokens += 1;
      primitiveToken = false;
      containers += 1;
      if (containers > SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINERS) throw snapshotAdmissionError();
      frames.push({ hasContent: false, members: 0 });
      if (frames.length > SENA_PROJECT_SNAPSHOT_MAX_JSON_DEPTH) throw snapshotAdmissionError();
    } else if (character === "}" || character === "]") {
      tokens += 1;
      primitiveToken = false;
      frames.pop();
    } else if (character === ",") {
      tokens += 1;
      primitiveToken = false;
      const frame = frames.at(-1);
      if (frame) {
        markContent();
        frame.members += 1;
        totalMembers += 1;
        if (
          frame.members > SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINER_MEMBERS ||
          totalMembers > SENA_PROJECT_SNAPSHOT_MAX_JSON_TOTAL_MEMBERS
        ) {
          throw snapshotAdmissionError();
        }
      }
    } else if (character === ":") {
      tokens += 1;
      primitiveToken = false;
    } else if (
      character !== " " && character !== "\n" &&
      character !== "\r" && character !== "\t"
    ) {
      markContent();
      if (!primitiveToken) {
        tokens += 1;
        primitiveToken = true;
      }
    } else {
      primitiveToken = false;
    }
    if (tokens > SENA_PROJECT_SNAPSHOT_MAX_JSON_TOKENS) throw snapshotAdmissionError();
  }
}

function assertSenaProjectSnapshotObjectAdmission(value: unknown) {
  const seen = new WeakSet<object>();
  const active = new WeakSet<object>();
  const stack: Array<
    | { kind: "enter"; value: unknown; depth: number }
    | { kind: "leave"; value: object }
  > = [{ kind: "enter", value, depth: 0 }];
  let containers = 0;
  let totalMembers = 0;
  let textCodeUnits = 0;

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    if (entry.kind === "leave") {
      active.delete(entry.value);
      continue;
    }
    const candidate = entry.value;
    if (typeof candidate === "string") {
      textCodeUnits += candidate.length;
      if (textCodeUnits > SENA_PROJECT_SNAPSHOT_MAX_JSON_BYTES) throw snapshotAdmissionError();
      continue;
    }
    if (typeof candidate !== "object" || candidate === null) continue;
    if (active.has(candidate)) throw snapshotAdmissionError();
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    active.add(candidate);
    containers += 1;
    if (
      containers > SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINERS ||
      entry.depth > SENA_PROJECT_SNAPSHOT_MAX_JSON_DEPTH
    ) {
      throw snapshotAdmissionError();
    }

    const keys = Object.keys(candidate);
    if (Object.getOwnPropertySymbols(candidate).length > 0) throw snapshotAdmissionError();
    if (keys.length > SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINER_MEMBERS) {
      throw snapshotAdmissionError();
    }
    if (Array.isArray(candidate)) {
      if (
        candidate.length > SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINER_MEMBERS ||
        keys.length !== candidate.length
      ) {
        throw snapshotAdmissionError();
      }
      for (let index = 0; index < candidate.length; index += 1) {
        if (!Object.hasOwn(candidate, index)) throw snapshotAdmissionError();
      }
    }
    totalMembers += keys.length;
    if (totalMembers > SENA_PROJECT_SNAPSHOT_MAX_JSON_TOTAL_MEMBERS) {
      throw snapshotAdmissionError();
    }
    stack.push({ kind: "leave", value: candidate });
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) throw snapshotAdmissionError();
      textCodeUnits += key.length;
      if (textCodeUnits > SENA_PROJECT_SNAPSHOT_MAX_JSON_BYTES) throw snapshotAdmissionError();
      stack.push({
        kind: "enter",
        value: descriptor.value,
        depth: entry.depth + 1
      });
    }
  }
}

type SnapshotDatasetWorkProfile = {
  people: number;
  codes: number;
  interactions: number;
  utterances: number;
  codedSegments: number;
  segmentCodeReferences: number;
  activeCodeUpperBound: number;
  participationWindows: number;
  temporalWindowUpperBound: number;
};

function snapshotDatasetWorkProfile(
  datasetValue: unknown,
  buildOptionsValue: unknown,
  consume: (units: number) => void,
  limit: number
): SnapshotDatasetWorkProfile | null {
  const dataset = recordOrNull(datasetValue);
  if (!dataset) return null;
  const people = Array.isArray(dataset.people) ? dataset.people : null;
  const interactions = Array.isArray(dataset.interactions) ? dataset.interactions : null;
  const utterances = Array.isArray(dataset.utterances) ? dataset.utterances : null;
  const codedSegments = Array.isArray(dataset.coded_segments) ? dataset.coded_segments : null;
  const codebook = Array.isArray(dataset.codebook) ? dataset.codebook : null;
  if (!people || !interactions || !utterances || !codedSegments || !codebook) return null;
  if ([people, interactions, utterances, codedSegments, codebook].some(
    (rows) => rows.length > SENA_PROJECT_SNAPSHOT_MAX_JSON_CONTAINER_MEMBERS
  )) {
    consume(limit + 1);
  }
  const p = people.length;
  const c = codebook.length;
  const rowCount = p + c + interactions.length + utterances.length + codedSegments.length;
  consume(boundedProduct(limit, rowCount, 64));

  let segmentCodeReferences = 0;
  const referencedCodes = new Set<string>();
  const participationWindows = new Set<string>();
  for (let index = 0; index < codedSegments.length; index += 1) {
    const segment = recordOrNull(codedSegments[index]);
    const codes = Array.isArray(segment?.codes) ? segment.codes : null;
    if (codes) {
      consume(boundedProduct(limit, codes.length, codes.length));
      if (codes.length > limit - segmentCodeReferences) consume(limit + 1);
      segmentCodeReferences += codes.length;
      for (const code of codes) {
        if (typeof code === "string") referencedCodes.add(code);
      }
    }
    const targets = Array.isArray(segment?.targetPersonIds) ? segment.targetPersonIds : null;
    if (targets) consume(boundedProduct(limit, targets.length, 16));
    if (typeof segment?.unitId === "string" && typeof segment.stanzaId === "string") {
      participationWindows.add(`${segment.unitId}::${segment.stanzaId}`);
    }
  }

  const buildOptions = recordOrNull(buildOptionsValue);
  const temporal = recordOrNull(buildOptions?.temporal);
  let temporalWindowUpperBound = new Set([
    ...utterances.flatMap((row) => {
      const turn = recordOrNull(row)?.turnIndex;
      return typeof turn === "number" && Number.isFinite(turn) ? [turn] : [];
    }),
    ...codedSegments.flatMap((row) => {
      const turn = recordOrNull(row)?.turnIndex;
      return typeof turn === "number" && Number.isFinite(turn) ? [turn] : [];
    })
  ]).size;
  if (temporal?.mode === "stage") {
    const stages = new Set<string>();
    for (const rows of [utterances, codedSegments, interactions]) {
      for (let index = 0; index < rows.length; index += 1) {
        const stage = recordOrNull(rows[index])?.stage;
        if (typeof stage === "string") stages.add(stage);
      }
    }
    temporalWindowUpperBound = stages.size;
  }
  return {
    people: p,
    codes: c,
    interactions: interactions.length,
    utterances: utterances.length,
    codedSegments: codedSegments.length,
    segmentCodeReferences,
    activeCodeUpperBound: Math.min(c, referencedCodes.size),
    participationWindows: participationWindows.size,
    temporalWindowUpperBound
  };
}

/**
 * Admission runs before semantic validation, deep cloning, normalization, or
 * canonical reconstruction. The bound follows the actual expensive kernels:
 * SNA/social cubic work; three 100-sweep spectral decompositions plus shortest
 * paths and commute-time expansions on a connected fusion graph; per-person
 * attribution eigensolvers; pair/evidence fan-out; validation variants; and
 * full-source/per-window temporal rebuilds. Unreferenced codes prove at least
 * one isolated fusion vertex, which is the model's own safe fast path for the
 * three formal embedding diagnostics.
 */
function assertSenaProjectSnapshotCanonicalAnalysisWorkBudget(
  rootValue: unknown,
  options: { analysisModelBuilds?: number; temporalTraceBuilds?: number } = {}
) {
  const root = recordOrNull(rootValue);
  if (!root) return;
  const reproducibility = recordOrNull(root.reproducibility);
  const limit = SENA_PROJECT_SNAPSHOT_CANONICAL_ANALYSIS_MAX_WORK_UNITS;
  let work = 0;
  const consume = (units: number) => {
    if (!Number.isSafeInteger(units) || units < 0 || units > limit - work) {
      throw new SenaProjectSnapshotResourceLimitError(
        `SENA project snapshot canonical analysis work budget exceeds ${limit} units.`
      );
    }
    work += units;
  };
  const buildOptions = reproducibility?.buildOptions;
  const analysisProfile = snapshotDatasetWorkProfile(root.dataset, buildOptions, consume, limit);
  const source = recordOrNull(root.source);
  const sourceDataset = source?.sourceDataset ?? root.dataset;
  const sourceProfile = snapshotDatasetWorkProfile(sourceDataset, buildOptions, consume, limit);
  const analysis = recordOrNull(root.analysis);
  const hasTemporalRuntimeTrace = analysis?.temporalRuntimeTrace !== undefined;

  const consumeModelBuilds = (profile: SnapshotDatasetWorkProfile, modelBuilds: number) => {
    const p = profile.people;
    const c = profile.codes;
    const n = p + c;
    const activeCodes = profile.activeCodeUpperBound;
    const pairCount = c < 2 ? 0 : c * (c - 1) / 2;
    const rows = profile.interactions + profile.utterances + profile.codedSegments;
    consume(boundedProduct(limit, modelBuilds, 16, p, p, p));
    consume(boundedProduct(limit, modelBuilds, 16, n, n));
    consume(boundedProduct(limit, modelBuilds, 2, pairCount, c));
    consume(boundedProduct(limit, modelBuilds, 2, p, pairCount));
    consume(boundedProduct(limit, modelBuilds, 6, pairCount, profile.codedSegments + profile.segmentCodeReferences));
    consume(boundedProduct(limit, modelBuilds, 2, profile.codedSegments, profile.codedSegments));
    consume(boundedProduct(limit, modelBuilds, 4, p, profile.participationWindows, c, c));
    consume(boundedProduct(limit, modelBuilds, 110, p, c, c));
    consume(boundedProduct(limit, modelBuilds, 110, p, activeCodes, activeCodes, c));
    consume(boundedProduct(limit, modelBuilds, 4, p, c, profile.codedSegments + profile.segmentCodeReferences));
    consume(boundedProduct(limit, modelBuilds, 2, p, p, profile.interactions));
    consume(boundedProduct(limit, modelBuilds, profile.temporalWindowUpperBound, rows + profile.segmentCodeReferences));
    if (activeCodes === c) {
      consume(boundedProduct(limit, modelBuilds, 320, n, n, n));
    }
  };

  if (analysisProfile) {
    consumeModelBuilds(analysisProfile, options.analysisModelBuilds ?? 1);
  }
  if (hasTemporalRuntimeTrace && sourceProfile) {
    consumeModelBuilds(
      sourceProfile,
      (options.temporalTraceBuilds ?? 1) * (1 + sourceProfile.temporalWindowUpperBound)
    );
  }
  if (sourceProfile && recordOrNull(root.source)?.activeTemporalWindow != null) {
    // Active-window reports rebuild the full-source baseline once more for
    // scoped comparison and ranking evidence.
    consumeModelBuilds(sourceProfile, 1);
  }
}

export function assertSenaProjectSnapshotPublicationDerivationWorkBudget(value: unknown) {
  assertSenaProjectSnapshotObjectAdmission(value);
  const root = recordOrNull(value);
  const report = recordOrNull(root?.report);
  const validation = recordOrNull(report?.validation);
  const nullModels = recordOrNull(validation?.nullModels);
  const permutation = recordOrNull(nullModels?.permutation);
  const bootstrap = recordOrNull(nullModels?.bootstrap);
  const permutationIterations = permutation?.iterations;
  const bootstrapIterations = bootstrap?.iterations;
  if (
    Number.isSafeInteger(permutationIterations) &&
    Number.isSafeInteger(bootstrapIterations) &&
    permutationIterations === bootstrapIterations &&
    (permutationIterations as number) > 100
  ) {
    throw new SenaProjectSnapshotResourceLimitError(
      "SENA publication derivation exceeds the supported null-model work ceiling."
    );
  }
  if (
    !Number.isSafeInteger(permutationIterations) ||
    !Number.isSafeInteger(bootstrapIterations) ||
    permutationIterations !== bootstrapIterations ||
    (permutationIterations as number) < 1
  ) {
    throw new Error("SENA publication derivation has an unsupported null-model work declaration.");
  }
  const validationModelBuilds = 13 + 2 * (permutationIterations as number);
  assertSenaProjectSnapshotCanonicalAnalysisWorkBudget(value, {
    // One route-level base model plus the sensitivity/stability/null variants.
    analysisModelBuilds: 1 + validationModelBuilds,
    // buildSenaReport and buildSenaProjectSnapshot currently each construct a
    // fresh trace. Count both before the first route-level model build.
    temporalTraceBuilds: 2
  });
}

function assertArrayField(root: Record<string, unknown>, field: string, context: string) {
  if (!Array.isArray(root[field])) {
    throw new Error(`${context}.${field} must be an array.`);
  }
}

function assertDataset(value: unknown, context: string): asserts value is SenaDataset {
  const root = asRecord(value, context);
  assertArrayField(root, "people", context);
  assertArrayField(root, "interactions", context);
  assertArrayField(root, "utterances", context);
  assertArrayField(root, "coded_segments", context);
  assertArrayField(root, "codebook", context);
}

function assertFiniteNumber(value: unknown, context: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} must be a finite number.`);
  }
}

function assertManualReview(value: unknown, context: string) {
  const review = asRecord(value, context);
  if (review.status !== "pending" && review.status !== "passed" && review.status !== "failed") {
    throw new Error(`${context}.status is not supported.`);
  }
  for (const field of ["reviewer", "verifiedAt", "notes"]) {
    if (typeof review[field] !== "string") {
      throw new Error(`${context}.${field} must be a string.`);
    }
  }
}

function assertWorkspaceState(value: unknown) {
  const state = asRecord(value, "project snapshot.workspaceState");
  const manualReviews = asRecord(state.demoVerificationManualReviews, "project snapshot.workspaceState.demoVerificationManualReviews");
  for (const [checkId, review] of Object.entries(manualReviews)) {
    assertManualReview(review, `project snapshot.workspaceState.demoVerificationManualReviews.${checkId}`);
  }
}

function assertDataGovernance(value: unknown, context: string) {
  const governance = asRecord(value, context);
  if (governance.schemaVersion !== SENA_SCHEMA_VERSIONS.dataGovernanceMetadata) {
    throw new Error(`${context}.schemaVersion is not supported.`);
  }
  if (governance.status !== "complete" && governance.status !== "needs-review") {
    throw new Error(`${context}.status is not supported.`);
  }
  for (const field of ["irbApprovalId", "consentScope", "retentionPolicy", "dataSteward", "reviewedAt", "guardrail"]) {
    if (typeof governance[field] !== "string") {
      throw new Error(`${context}.${field} must be a string.`);
    }
  }
  if (!Array.isArray(governance.usageConstraints) || !Array.isArray(governance.requiredEvidence) || !Array.isArray(governance.blockers)) {
    throw new Error(`${context} usageConstraints, requiredEvidence, and blockers must be arrays.`);
  }
}

function assertBuildOptions(value: unknown) {
  const options = asRecord(value, "project snapshot reproducibility.buildOptions");
  assertFiniteNumber(options.alpha, "project snapshot buildOptions.alpha");
  assertFiniteNumber(options.beta, "project snapshot buildOptions.beta");
  assertFiniteNumber(options.gamma, "project snapshot buildOptions.gamma");

  if (!normalizationValues.has(options.normalization as SenaNormalization)) {
    throw new Error("project snapshot buildOptions.normalization is not supported.");
  }

  if (options.undirectedSocial !== undefined && typeof options.undirectedSocial !== "boolean") {
    throw new Error("project snapshot buildOptions.undirectedSocial must be a boolean when present.");
  }
  // Analysis-config declarations were added after the first sena-project-snapshot/v1
  // exports shipped; legacy snapshots omit them and resolveBuildOptions supplies the
  // declared defaults on rebuild, so they are validated only when present.
  if (options.direction !== undefined && !directionValues.has(options.direction as SenaAnalysisDirection)) {
    throw new Error("project snapshot buildOptions.direction is not supported.");
  }
  if (options.deg_convention !== undefined && !degreeConventionValues.has(options.deg_convention as SenaDegreeConvention)) {
    throw new Error("project snapshot buildOptions.deg_convention is not supported.");
  }
  if (options.Phi !== undefined && !phiValues.has(options.Phi as SenaEmbeddingPhi)) {
    throw new Error("project snapshot buildOptions.Phi is not supported.");
  }
  if (options.delta !== undefined && !deltaValues.has(options.delta as SenaEmbeddingDelta)) {
    throw new Error("project snapshot buildOptions.delta is not supported.");
  }
  if (options.d !== undefined) {
    assertFiniteNumber(options.d, "project snapshot buildOptions.d");
  }
  if (options.seed !== undefined) {
    assertFiniteNumber(options.seed, "project snapshot buildOptions.seed");
  }

  const temporal = asRecord(options.temporal, "project snapshot buildOptions.temporal");
  if (!temporalModeValues.has(temporal.mode as SenaTemporalMode)) {
    throw new Error("project snapshot buildOptions.temporal.mode is not supported.");
  }
  assertFiniteNumber(temporal.movingWindowSize, "project snapshot buildOptions.temporal.movingWindowSize");
  assertFiniteNumber(temporal.movingWindowStep, "project snapshot buildOptions.temporal.movingWindowStep");
  assertFiniteNumber(temporal.turnWindowRadius, "project snapshot buildOptions.temporal.turnWindowRadius");
}

function assertSenaProjectSnapshot(value: unknown): void {
  const root = asRecord(value, "project snapshot");
  if (root.schemaVersion !== SENA_SCHEMA_VERSIONS.projectSnapshot) {
    throw new Error("JSON is not a SENA project snapshot.");
  }

  assertDataset(root.dataset, "project snapshot.dataset");

  const source = asRecord(root.source, "project snapshot.source");
  if (source.milestone !== "local-research-pilot") {
    throw new Error("project snapshot source.milestone is not supported.");
  }
  if (source.sourceDataset !== undefined) {
    assertDataset(source.sourceDataset, "project snapshot.source.sourceDataset");
  }

  const reproducibility = asRecord(root.reproducibility, "project snapshot.reproducibility");
  assertBuildOptions(reproducibility.buildOptions);

  const analysis = asRecord(root.analysis, "project snapshot.analysis");
  if (analysis.nodes !== undefined && !Array.isArray(analysis.nodes)) {
    throw new Error("project snapshot.analysis.nodes must be an array.");
  }
  if (analysis.edges !== undefined && !Array.isArray(analysis.edges)) {
    throw new Error("project snapshot.analysis.edges must be an array.");
  }
  asRecord(analysis.summary, "project snapshot.analysis.summary");
  asRecord(analysis.matrices, "project snapshot.analysis.matrices");
  asRecord(analysis.socialReport, "project snapshot.analysis.socialReport");
  if (!Array.isArray(analysis.pairReport)) {
    throw new Error("project snapshot.analysis.pairReport must be an array.");
  }
  asRecord(analysis.temporal, "project snapshot.analysis.temporal");

  if (root.workspaceState !== undefined) {
    assertWorkspaceState(root.workspaceState);
  }
  if (root.dataGovernance !== undefined) {
    assertDataGovernance(root.dataGovernance, "project snapshot.dataGovernance");
  }

  const report = asRecord(root.report, "project snapshot.report");
  if (report.schemaVersion !== SENA_SCHEMA_VERSIONS.report) {
    throw new Error("project snapshot.report must be a SENA report.");
  }
  const fusionMathAudit = recordOrNull(report.fusionMathAudit);
  const codingReliabilityGate = recordOrNull(report.codingReliabilityGate);
  const isCurrentV2 =
    fusionMathAudit?.schemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit &&
    codingReliabilityGate?.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityGate;
  if (isCurrentV2 && root.dataGovernance === undefined) {
    throw new Error("project snapshot.dataGovernance is required for current-v2 snapshots.");
  }
  if (isCurrentV2 && report.dataGovernance === undefined) {
    throw new Error("project snapshot.report.dataGovernance is required for current-v2 snapshots.");
  }
  if (report.dataGovernance !== undefined) {
    assertDataGovernance(report.dataGovernance, "project snapshot.report.dataGovernance");
  }
}

function canonicalFusionGraph(model: SenaModel) {
  return {
    nodes: model.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind
    })),
    edges: model.edges.map((edge) => ({
      id: edge.id,
      layer: edge.layer,
      edgeType: edge.edgeType,
      sourceKind: edge.sourceKind,
      targetKind: edge.targetKind,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      weight: edge.weight,
      normalizedWeight: edge.normalizedWeight,
      scaledWeight: edge.scaledWeight
    }))
  };
}

function senaMatrixHasShape(value: unknown, rows: number, columns: number) {
  if (!Array.isArray(value) || value.length !== rows) return false;
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = value[rowIndex];
    if (!Array.isArray(row) || row.length !== columns) return false;
  }
  return true;
}

function snapshotMatrixHolderShapesMatchDeclaredDataset(
  datasetValue: unknown,
  matricesValue: unknown
) {
  const dataset = recordOrNull(datasetValue);
  const people = Array.isArray(dataset?.people) ? dataset.people : null;
  const codebook = Array.isArray(dataset?.codebook) ? dataset.codebook : null;
  // Matrix density is meaningful only after dataset dimensions are declared.
  // Missing arrays remain the semantic validator's precise error, while valid
  // declarations still fail closed here before clone or model reconstruction.
  if (!people || !codebook) return true;
  const matrices = recordOrNull(matricesValue);
  const S = recordOrNull(matrices?.S);
  const W = recordOrNull(matrices?.W);
  const B = recordOrNull(matrices?.B);
  const BPC = recordOrNull(matrices?.B_PC);
  const BCP = recordOrNull(matrices?.B_CP);
  const Y = recordOrNull(matrices?.Y);
  const G = recordOrNull(matrices?.G);
  const fusion = recordOrNull(matrices?.fusion);
  if (!S || !W || !B || !BPC || !BCP || !Y || !G || !fusion) {
    return false;
  }
  const p = people.length;
  const c = codebook.length;
  const pairCount = c < 2 ? 0 : c * (c - 1) / 2;
  const temporalColumns = Array.isArray(Y.windowIds) ? Y.windowIds.length : -1;
  return senaMatrixHasShape(S.raw, p, p) &&
    senaMatrixHasShape(S.normalized, p, p) &&
    senaMatrixHasShape(W.raw, c, c) &&
    senaMatrixHasShape(W.normalized, c, c) &&
    senaMatrixHasShape(B.raw, p, c) &&
    senaMatrixHasShape(B.normalized, p, c) &&
    senaMatrixHasShape(BPC.raw, p, c) &&
    senaMatrixHasShape(BPC.normalized, p, c) &&
    senaMatrixHasShape(BCP.raw, c, p) &&
    senaMatrixHasShape(BCP.normalized, c, p) &&
    senaMatrixHasShape(Y.raw, p, temporalColumns) &&
    senaMatrixHasShape(G.raw, p, pairCount) &&
    senaMatrixHasShape(G.normalized, p, pairCount) &&
    senaMatrixHasShape(fusion.values, p + c, p + c);
}

function snapshotMatrixShapesMatchDeclaredDatasetValue(value: unknown) {
  const root = recordOrNull(value);
  const analysis = recordOrNull(root?.analysis);
  const report = recordOrNull(root?.report);
  return snapshotMatrixHolderShapesMatchDeclaredDataset(root?.dataset, analysis?.matrices) &&
    snapshotMatrixHolderShapesMatchDeclaredDataset(root?.dataset, report?.matrices);
}

function assertSenaProjectSnapshotCanonicalAnalysis(
  snapshot: SenaProjectSnapshot,
  report: SenaReport
) {
  if (!snapshotMatrixShapesMatchDeclaredDatasetValue(snapshot)) {
    throw new Error(
      "SENA project snapshot persisted analysis does not match the canonical dataset and build options."
    );
  }
  let canonicalModel: SenaModel;
  try {
    canonicalModel = buildSenaModel(
      snapshot.dataset,
      snapshot.reproducibility.buildOptions
    );
  } catch {
    throw new Error(
      "SENA project snapshot canonical analysis could not be recomputed from the declared dataset and build options."
    );
  }

  const canonicalEnaManifest = buildSenaEnaManifest(canonicalModel.dataset);
  const canonicalSnaManifest = buildSenaSnaManifest(canonicalModel);
  const canonicalDataContractAudit = buildSenaDataContractAudit(canonicalModel.dataset, {
    modelWarnings: canonicalModel.summary.warnings
  });
  const canonicalRuntimeConsistencyAudit = buildSenaRuntimeConsistencyAudit({
    model: canonicalModel,
    enaManifest: canonicalEnaManifest,
    snaManifest: canonicalSnaManifest
  });
  const canonicalEvidenceSnippets = buildSenaEvidenceLedger(canonicalModel, {
    title: report.title,
    generatedAt: report.generatedAt,
    activeTemporalWindow: snapshot.source.activeTemporalWindow,
    evidenceLimit: Math.max(1, report.evidenceSnippets.length),
    humanReview: report.humanReview
  }).snippets;
  const sourceDataset = snapshot.source.sourceDataset ?? snapshot.dataset;
  const canonicalActiveWindowComparison = buildActiveWindowComparison(
    canonicalModel,
    snapshot.source.sourceDataset,
    snapshot.source.activeTemporalWindow
  );
  const canonicalActiveWindowBrief = buildSenaActiveWindowBrief(canonicalModel, {
    activeTemporalWindow: snapshot.source.activeTemporalWindow,
    sourceDataset: snapshot.source.sourceDataset,
    activeWindowComparison: canonicalActiveWindowComparison,
    evidenceSnippets: canonicalEvidenceSnippets,
    humanReview: report.humanReview,
    codingReliabilityGate: report.codingReliabilityGate
  });
  const historicalStatisticalReadProjection =
    report.fusionMathAudit.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit ||
    report.codingReliabilityGate.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityGate;
  let canonicalTemporalRuntimeTrace: SenaTemporalRuntimeTrace | undefined;
  if (snapshot.analysis.temporalRuntimeTrace !== undefined) {
    try {
      canonicalTemporalRuntimeTrace = buildSenaTemporalRuntimeTrace(
        sourceDataset,
        snapshot.reproducibility.buildOptions,
        {
          // A trace may be freshly built and shared into a later snapshot.
          // Its own creation time is provenance, not a model input; rebuild
          // every derived field under that declared time and exact-compare the
          // complete trace below.
          generatedAt: typeof snapshot.analysis.temporalRuntimeTrace.generatedAt === "string"
            ? snapshot.analysis.temporalRuntimeTrace.generatedAt
            : snapshot.generatedAt
        }
      );
    } catch {
      throw new Error(
        "SENA project snapshot canonical temporal runtime trace could not be recomputed from the declared source dataset and build options."
      );
    }
  }

  const analysisComparisons: Array<[unknown, unknown]> = [
    [snapshot.analysis.matrices, canonicalModel.matrices],
    [snapshot.analysis.summary, canonicalModel.summary],
    [snapshot.analysis.socialReport, canonicalModel.socialReport],
    [snapshot.analysis.pairReport, canonicalModel.pairReport],
    [snapshot.analysis.temporal, canonicalModel.temporal],
    [report.operatorDiagnostics, canonicalModel.operatorDiagnostics],
    [report.parameters.buildOptions, canonicalModel.options],
    [report.parameters.datasetCounts, datasetCounts(canonicalModel.dataset)],
    [report.parameters.warnings, canonicalModel.summary.warnings],
    [report.summary, canonicalModel.summary],
    [report.matrices, canonicalModel.matrices],
    [report.socialReport, canonicalModel.socialReport],
    [report.pairReport, canonicalModel.pairReport],
    [report.figures.fusionGraph, canonicalFusionGraph(canonicalModel)],
    [report.figures.temporalTrace, canonicalModel.temporal],
    [report.enaManifest, canonicalEnaManifest],
    [report.snaManifest, canonicalSnaManifest],
    [report.dataContractAudit, canonicalDataContractAudit],
    [report.runtimeConsistencyAudit, canonicalRuntimeConsistencyAudit],
    [report.evidenceSnippets, canonicalEvidenceSnippets],
    [report.analysisWindow, snapshot.source.activeTemporalWindow],
    [snapshot.source.sourceDatasetCounts, datasetCounts(sourceDataset)],
    [snapshot.title, report.title],
    [snapshot.generatedAt, report.generatedAt]
  ];
  // Supported historical v1 projections retain their explicit source-schema
  // and reconciliation markers, but their pre-v2 scoped presentation caches
  // are not reclassified as current canonical evidence. Current-v2 snapshots
  // always take these exact comparisons, and publication rejects projected
  // legacy leaves independently.
  if (!historicalStatisticalReadProjection) {
    analysisComparisons.push(
      [report.figures.activeWindowComparison, canonicalActiveWindowComparison],
      [report.figures.activeWindowBrief, canonicalActiveWindowBrief]
    );
  }
  if (canonicalTemporalRuntimeTrace !== undefined) {
    if (!historicalStatisticalReadProjection) {
      analysisComparisons.push([
        snapshot.analysis.temporalRuntimeTrace,
        canonicalTemporalRuntimeTrace
      ]);
      analysisComparisons.push([
        report.figures.temporalRuntimeNarrative,
        buildTemporalRuntimeNarrative(canonicalModel, canonicalTemporalRuntimeTrace)
      ]);
    }
    analysisComparisons.push([
      report.figures.temporalRuntimeTransitions,
      canonicalTemporalRuntimeTrace.transitions
    ]);
  }
  if (snapshot.analysis.nodes !== undefined) {
    analysisComparisons.push([snapshot.analysis.nodes, canonicalModel.nodes]);
  }
  if (snapshot.analysis.edges !== undefined) {
    analysisComparisons.push([snapshot.analysis.edges, canonicalModel.edges]);
  }
  if (analysisComparisons.some(([persisted, canonical]) =>
    !senaJsonValuesEqual(persisted, canonical)
  )) {
    throw new Error(
      "SENA project snapshot persisted analysis does not match the canonical dataset and build options."
    );
  }
}

export function importSenaProjectSnapshot(source: string | unknown): SenaProjectSnapshot {
  if (typeof source === "string") {
    assertSenaProjectSnapshotJsonStringAdmission(source);
  } else {
    assertSenaProjectSnapshotObjectAdmission(source);
  }
  const value = typeof source === "string" ? JSON.parse(source) : source;
  const root = asRecord(value, "project snapshot");
  if (root.schemaVersion !== SENA_SCHEMA_VERSIONS.projectSnapshot) {
    throw new Error("JSON is not a SENA project snapshot.");
  }
  const reproducibilityInput = asRecord(root.reproducibility, "project snapshot.reproducibility");
  assertSenaProjectSnapshotCanonicalAnalysisWorkBudget(root);
  if (!snapshotMatrixShapesMatchDeclaredDatasetValue(value)) {
    throw new Error(
      "SENA project snapshot persisted analysis does not match the canonical dataset and build options."
    );
  }
  validateSenaProjectSnapshotCanonicalInputs({
    dataset: root.dataset,
    source: root.source,
    buildOptions: reproducibilityInput.buildOptions
  });
  assertSenaProjectSnapshot(value);
  const normalized = structuredClone(value) as Record<string, unknown>;
  const normalizedReport = normalizeSenaReportStatisticalLeaves(
    normalized.report,
    "project snapshot.report"
  ).report;
  if (normalized.dataGovernance !== undefined) {
    const rootGovernance = normalizeSenaDataGovernanceMetadata(
      normalized.dataGovernance as Partial<typeof normalizedReport.dataGovernance>,
      normalizedReport.generatedAt
    );
    if (!senaJsonValuesEqual(rootGovernance, normalizedReport.dataGovernance)) {
      throw new Error("SENA project snapshot carries conflicting current data-governance provenance.");
    }
    normalized.dataGovernance = rootGovernance;
  }
  assertSenaProjectSnapshotCanonicalAnalysis(
    normalized as unknown as SenaProjectSnapshot,
    normalizedReport
  );
  const analysis = asRecord(normalized.analysis, "project snapshot.analysis");
  const reproducibility = asRecord(normalized.reproducibility, "project snapshot.reproducibility");
  normalizeSenaFusionMathAudit(normalizedReport.fusionMathAudit, {
    matrices: analysis.matrices as SenaFusionMathAuditEvidence["matrices"],
    options: reproducibility.buildOptions as SenaFusionMathAuditEvidence["options"],
    pairReport: analysis.pairReport as SenaFusionMathAuditEvidence["pairReport"]
  });
  const projectBinding = normalizedReport.codingReliabilityGate.review.machineEvidence?.projectBinding;
  if (projectBinding) {
    assertSenaReliabilityProjectBindingMatchesSnapshot(
      projectBinding,
      normalized as unknown as SenaProjectSnapshot
    );
  }
  normalized.report = normalizedReport;
  return normalized as SenaProjectSnapshot;
}

export function isSenaProjectSnapshot(value: unknown): value is SenaProjectSnapshot {
  try {
    assertSenaProjectSnapshotObjectAdmission(value);
    const root = asRecord(value, "project snapshot");
    if (root.schemaVersion !== SENA_SCHEMA_VERSIONS.projectSnapshot) return false;
    const reproducibility = asRecord(root.reproducibility, "project snapshot.reproducibility");
    assertSenaProjectSnapshotCanonicalAnalysisWorkBudget(root);
    if (!snapshotMatrixShapesMatchDeclaredDatasetValue(value)) return false;
    validateSenaProjectSnapshotCanonicalInputs({
      dataset: root.dataset,
      source: root.source,
      buildOptions: reproducibility.buildOptions
    });
    assertSenaProjectSnapshot(value);
    const report = asRecord(root.report, "project snapshot.report");
    const fusionMathAudit = asRecord(report.fusionMathAudit, "project snapshot.report.fusionMathAudit");
    const codingReliabilityGate = asRecord(report.codingReliabilityGate, "project snapshot.report.codingReliabilityGate");
    if (fusionMathAudit.schemaVersion !== SENA_SCHEMA_VERSIONS.fusionMathAudit ||
      codingReliabilityGate.schemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityGate) return false;
    const normalizedReport = normalizeSenaReportStatisticalLeaves(report, "project snapshot.report").report;
    if (root.dataGovernance !== undefined) {
      const rootGovernance = normalizeSenaDataGovernanceMetadata(
        root.dataGovernance as Partial<typeof normalizedReport.dataGovernance>,
        normalizedReport.generatedAt
      );
      if (!senaJsonValuesEqual(rootGovernance, normalizedReport.dataGovernance)) return false;
    }
    assertSenaProjectSnapshotCanonicalAnalysis(value as SenaProjectSnapshot, normalizedReport);
    const analysis = asRecord(root.analysis, "project snapshot.analysis");
    normalizeSenaFusionMathAudit(normalizedReport.fusionMathAudit, {
      matrices: analysis.matrices as SenaFusionMathAuditEvidence["matrices"],
      options: reproducibility.buildOptions as SenaFusionMathAuditEvidence["options"],
      pairReport: analysis.pairReport as SenaFusionMathAuditEvidence["pairReport"]
    });
    const projectBinding = normalizedReport.codingReliabilityGate.review.machineEvidence?.projectBinding;
    if (projectBinding) {
      assertSenaReliabilityProjectBindingMatchesSnapshot(projectBinding, value as SenaProjectSnapshot);
    }
    return true;
  } catch {
    return false;
  }
}
