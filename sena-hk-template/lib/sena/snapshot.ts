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
import { inspectSenaModelCardSections } from "./model-card";
import { buildSenaClaimReadinessGate } from "./pilot-readiness";
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

export type SenaProjectSnapshotAdmissionLimits = Readonly<{
  maxJsonBytes: number;
  maxJsonDepth: number;
  maxJsonTokens: number;
  maxJsonContainers: number;
  maxJsonContainerMembers: number;
  maxJsonTotalMembers: number;
}>;

export type SenaProjectSnapshotImportOptions = {
  admissionLimits?: SenaProjectSnapshotAdmissionLimits;
};

export const SENA_REVIEW_PACKET_READINESS_PROJECTION_NOTE =
  "Current-v2 review-packet readiness was conservatively reconciled across canonical holders.";

export const SENA_PROJECT_SNAPSHOT_DEFAULT_ADMISSION_LIMITS: SenaProjectSnapshotAdmissionLimits =
  Object.freeze({
    maxJsonBytes: SENA_PROJECT_SNAPSHOT_MAX_JSON_BYTES,
    maxJsonDepth: 64,
    maxJsonTokens: 4_194_304,
    maxJsonContainers: 262_144,
    maxJsonContainerMembers: 65_536,
    maxJsonTotalMembers: 2_097_152
  });

const SENA_PROJECT_SNAPSHOT_MAX_CONFIGURED_ADMISSION_LIMITS: SenaProjectSnapshotAdmissionLimits =
  Object.freeze({
    maxJsonBytes: 32 * 1024 * 1024,
    maxJsonDepth: 64,
    maxJsonTokens: 8_388_608,
    maxJsonContainers: 524_288,
    maxJsonContainerMembers: 131_072,
    maxJsonTotalMembers: 4_194_304
  });

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
  // Snapshot provenance owns the trace clock. A caller-provided cache must
  // never supply a second, attacker-controlled canonicalization timestamp.
  const temporalRuntimeTrace = buildSenaTemporalRuntimeTrace(
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

function resolvedSnapshotAdmissionLimits(
  input?: SenaProjectSnapshotAdmissionLimits
): SenaProjectSnapshotAdmissionLimits {
  const limits = input ?? SENA_PROJECT_SNAPSHOT_DEFAULT_ADMISSION_LIMITS;
  for (const key of Object.keys(SENA_PROJECT_SNAPSHOT_DEFAULT_ADMISSION_LIMITS) as Array<
    keyof SenaProjectSnapshotAdmissionLimits
  >) {
    const value = limits[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > SENA_PROJECT_SNAPSHOT_MAX_CONFIGURED_ADMISSION_LIMITS[key]) {
      throw snapshotAdmissionError();
    }
  }
  return limits;
}

function assertSenaProjectSnapshotJsonStringAdmission(
  raw: string,
  limits: SenaProjectSnapshotAdmissionLimits
) {
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
    if (totalMembers > limits.maxJsonTotalMembers) {
      throw snapshotAdmissionError();
    }
  };

  for (const character of raw) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes > limits.maxJsonBytes) throw snapshotAdmissionError();
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
      if (containers > limits.maxJsonContainers) throw snapshotAdmissionError();
      frames.push({ hasContent: false, members: 0 });
      if (frames.length > limits.maxJsonDepth) throw snapshotAdmissionError();
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
          frame.members > limits.maxJsonContainerMembers ||
          totalMembers > limits.maxJsonTotalMembers
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
    if (tokens > limits.maxJsonTokens) throw snapshotAdmissionError();
  }
}

function nodeRuntimeIdentifiesProxy(value: object) {
  try {
    const runtimeProcess = (globalThis as typeof globalThis & {
      process?: {
        getBuiltinModule?: (id: string) => unknown;
      };
    }).process;
    const util = runtimeProcess?.getBuiltinModule?.("node:util") as {
      types?: { isProxy?: (candidate: unknown) => boolean };
    } | undefined;
    return util?.types?.isProxy?.(value) === true;
  } catch {
    return false;
  }
}

function jsonStringUtf8Bytes(value: string, limit: number) {
  // Opening and closing quotes are part of the JSON carrier.
  let bytes = 2;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === '"' || character === "\\" ||
      character === "\b" || character === "\f" || character === "\n" ||
      character === "\r" || character === "\t") {
      bytes += 2;
    } else if (codePoint < 0x20 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      bytes += 6;
    } else {
      bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    }
    if (bytes > limit) return limit + 1;
  }
  return bytes;
}

/**
 * Direct-object imports accept ordinary, JSON-compatible values. HTTP restore
 * inputs cross the bounded string/parser boundary and therefore cannot carry
 * accessors or Proxies. Node runtimes use util.types.isProxy without a static
 * node:util import (so browser bundles remain valid); other runtimes still
 * receive descriptor/prototype/accessor checks, but JavaScript offers no
 * universal trap-free Proxy detector there.
 */
function assertSenaProjectSnapshotObjectAdmission(
  value: unknown,
  limits: SenaProjectSnapshotAdmissionLimits
) {
  type AdmissionSummary = {
    containers: number;
    members: number;
    tokens: number;
    jsonBytes: number;
    containerDepth: number;
  };
  const memo = new WeakMap<object, AdmissionSummary>();
  const active = new WeakSet<object>();
  const addBounded = (current: number, increment: number, limit: number) => {
    if (!Number.isSafeInteger(increment) || increment < 0 || increment > limit - current) {
      throw snapshotAdmissionError();
    }
    return current + increment;
  };
  const primitiveSummary = (candidate: unknown): AdmissionSummary => {
    if (candidate === null) {
      return { containers: 0, members: 0, tokens: 1, jsonBytes: 4, containerDepth: 0 };
    }
    // JSON has no undefined value. Admitting it would let two distinct direct
    // carriers collapse to the same canonical serialization/hash when an
    // object member is omitted (or to null when it appears in an array).
    if (candidate === undefined) throw snapshotAdmissionError();
    if (typeof candidate === "string") {
      const jsonBytes = jsonStringUtf8Bytes(candidate, limits.maxJsonBytes);
      if (jsonBytes > limits.maxJsonBytes) throw snapshotAdmissionError();
      return { containers: 0, members: 0, tokens: 1, jsonBytes, containerDepth: 0 };
    }
    if (typeof candidate === "boolean") {
      return {
        containers: 0,
        members: 0,
        tokens: 1,
        jsonBytes: candidate ? 4 : 5,
        containerDepth: 0
      };
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return {
        containers: 0,
        members: 0,
        tokens: 1,
        jsonBytes: Object.is(candidate, -0) ? 1 : String(candidate).length,
        containerDepth: 0
      };
    }
    // Bigint, symbols, functions, and non-finite numbers are not ordinary JSON
    // values and must not reach clone/hash/canonicalization.
    throw snapshotAdmissionError();
  };
  const summarize = (candidate: unknown): AdmissionSummary => {
    if (typeof candidate !== "object" || candidate === null) {
      return primitiveSummary(candidate);
    }
    if (active.has(candidate)) throw snapshotAdmissionError();
    const cached = memo.get(candidate);
    if (cached) return cached;
    if (nodeRuntimeIdentifiesProxy(candidate)) throw snapshotAdmissionError();

    const isArray = Array.isArray(candidate);
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== null && prototype !== (isArray ? Array.prototype : Object.prototype)) {
      throw snapshotAdmissionError();
    }
    // Descriptor enumeration comes first: Object.keys would omit a hidden
    // accessor and can invoke Proxy traps before we have inspected hazards.
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key === "symbol")) throw snapshotAdmissionError();
    const keys: string[] = [];
    for (const ownKey of ownKeys) {
      const key = ownKey as string;
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) throw snapshotAdmissionError();
      if (!descriptor.enumerable) {
        if (!(isArray && key === "length")) throw snapshotAdmissionError();
        continue;
      }
      keys.push(key);
    }
    if (keys.length > limits.maxJsonContainerMembers) throw snapshotAdmissionError();
    if (isArray) {
      if (candidate.length > limits.maxJsonContainerMembers || keys.length !== candidate.length) {
        throw snapshotAdmissionError();
      }
      for (let index = 0; index < candidate.length; index += 1) {
        if (!descriptors[String(index)]?.enumerable) throw snapshotAdmissionError();
      }
    }

    active.add(candidate);
    try {
      let summary: AdmissionSummary = {
        containers: 1,
        members: keys.length,
        tokens: 1 + keys.length * 2,
        jsonBytes: 2 + Math.max(0, keys.length - 1),
        containerDepth: 1
      };
      if (summary.members > limits.maxJsonTotalMembers ||
        summary.tokens > limits.maxJsonTokens) {
        throw snapshotAdmissionError();
      }
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor)) throw snapshotAdmissionError();
        if (!isArray) {
          summary.jsonBytes = addBounded(
            summary.jsonBytes,
            jsonStringUtf8Bytes(key, limits.maxJsonBytes) + 1,
            limits.maxJsonBytes
          );
        }
        const child = summarize(descriptor.value);
        summary = {
          containers: addBounded(summary.containers, child.containers, limits.maxJsonContainers),
          members: addBounded(summary.members, child.members, limits.maxJsonTotalMembers),
          tokens: addBounded(summary.tokens, child.tokens, limits.maxJsonTokens),
          jsonBytes: addBounded(summary.jsonBytes, child.jsonBytes, limits.maxJsonBytes),
          containerDepth: Math.max(summary.containerDepth, child.containerDepth + 1)
        };
        if (summary.containerDepth > limits.maxJsonDepth) throw snapshotAdmissionError();
      }
      memo.set(candidate, summary);
      return summary;
    } finally {
      active.delete(candidate);
    }
  };

  summarize(value);
}

export function assertSenaProjectSnapshotAdmission(
  source: string | unknown,
  options: SenaProjectSnapshotImportOptions = {}
) {
  const limits = resolvedSnapshotAdmissionLimits(options.admissionLimits);
  if (typeof source === "string") {
    assertSenaProjectSnapshotJsonStringAdmission(source, limits);
  } else {
    assertSenaProjectSnapshotObjectAdmission(source, limits);
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
    (rows) => rows.length > SENA_PROJECT_SNAPSHOT_DEFAULT_ADMISSION_LIMITS.maxJsonContainerMembers
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
  options: {
    fullModelBuilds?: number;
    validationModelBuilds?: number;
    temporalTraceBuilds?: number;
    activeWindowBaselineBuilds?: number;
  } = {},
  reservation: { work: number } = { work: 0 }
) {
  const root = recordOrNull(rootValue);
  if (!root) return;
  const reproducibility = recordOrNull(root.reproducibility);
  const limit = SENA_PROJECT_SNAPSHOT_CANONICAL_ANALYSIS_MAX_WORK_UNITS;
  const consume = (units: number) => {
    if (!Number.isSafeInteger(units) || units < 0 || units > limit - reservation.work) {
      throw new SenaProjectSnapshotResourceLimitError(
        `SENA project snapshot canonical analysis work budget exceeds ${limit} units.`
      );
    }
    reservation.work += units;
  };
  const buildOptions = reproducibility?.buildOptions;
  const analysisProfile = snapshotDatasetWorkProfile(root.dataset, buildOptions, consume, limit);
  const source = recordOrNull(root.source);
  const sourceDataset = source?.sourceDataset ?? root.dataset;
  const sourceProfile = snapshotDatasetWorkProfile(sourceDataset, buildOptions, consume, limit);
  const analysis = recordOrNull(root.analysis);
  const report = recordOrNull(root.report);
  const fusionMathAudit = recordOrNull(report?.fusionMathAudit);
  const codingReliabilityGate = recordOrNull(report?.codingReliabilityGate);
  const currentV2 = fusionMathAudit?.schemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit &&
    codingReliabilityGate?.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityGate;
  // Deleting a required current trace cannot remove its reservation.
  const hasTemporalRuntimeTrace = currentV2 || analysis?.temporalRuntimeTrace !== undefined;

  const consumeModelBuilds = (
    profile: SnapshotDatasetWorkProfile,
    modelBuilds: number,
    topologyAwareValidation = false
  ) => {
    const p = profile.people;
    // Repeated permutation/bootstrap/sensitivity variants cannot activate a
    // code that the declared coded segments never reference. Keep the one
    // full canonical build on declared topology, while charging repeated
    // validation kernels against the connected-code upper bound. This is the
    // documented fast path that preserves the 100-code inactive fixture.
    const c = topologyAwareValidation
      ? profile.activeCodeUpperBound
      : profile.codes;
    const n = p + c;
    const activeCodes = Math.min(c, profile.activeCodeUpperBound);
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
      // Validation variants reuse the declared topology/configuration and do
      // not carry the full one-time canonical reconstruction multiplier.
      consume(boundedProduct(
        limit,
        modelBuilds,
        topologyAwareValidation ? 160 : 320,
        n,
        n,
        n
      ));
    }
  };

  if (analysisProfile) {
    consumeModelBuilds(analysisProfile, options.fullModelBuilds ?? 1);
    consumeModelBuilds(analysisProfile, options.validationModelBuilds ?? 0, true);
  }
  if (hasTemporalRuntimeTrace && sourceProfile) {
    consumeModelBuilds(
      sourceProfile,
      (options.temporalTraceBuilds ?? 1) * (1 + sourceProfile.temporalWindowUpperBound),
      true
    );
  }
  if (sourceProfile && recordOrNull(root.source)?.activeTemporalWindow != null) {
    // Active-window reports rebuild the full-source baseline once more for
    // scoped comparison and ranking evidence.
    consumeModelBuilds(sourceProfile, options.activeWindowBaselineBuilds ?? 1, true);
  }
}

function declaredSnapshotValidationModelBuilds(value: unknown) {
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
  return 13 + 2 * (permutationIterations as number);
}

export type SenaPublicationDerivationBudgetScope = "standalone" | "route-request";

export function assertSenaProjectSnapshotPublicationDerivationWorkBudget(
  value: unknown,
  options: { scope?: SenaPublicationDerivationBudgetScope } = {}
) {
  assertSenaProjectSnapshotAdmission(value);
  const root = recordOrNull(value);
  if (!root) return;
  const validationModelBuilds = declaredSnapshotValidationModelBuilds(value);
  const routeRequest = options.scope === "route-request";
  assertSenaProjectSnapshotCanonicalAnalysisWorkBudget(value, {
    // Standalone export: canonical importer model/report + export model.
    // Route request: route model/report/snapshot + the complete standalone
    // importer/export path. No downstream phase receives a fresh 50M budget.
    fullModelBuilds: routeRequest ? 3 : 2,
    validationModelBuilds: validationModelBuilds * (routeRequest ? 2 : 1),
    temporalTraceBuilds: routeRequest ? 4 : 2,
    activeWindowBaselineBuilds: routeRequest ? 3 : 2
  });
}

/**
 * Reserves the complete enterprise publication request against the selected
 * raw project snapshot before the publication-specific read projection begins.
 * That path performs no generic project/revision normalization imports; this
 * single preflight therefore accounts for the route plus importer/export work
 * without granting any downstream phase a fresh 50M ceiling.
 */
export function assertSenaEnterprisePublicationRequestDerivationWorkBudget(
  targetSnapshot: unknown
) {
  assertSenaProjectSnapshotPublicationDerivationWorkBudget(targetSnapshot, {
    scope: "route-request"
  });
}

/**
 * Bounded, side-effect-free structural/semantic preflight for the persisted
 * route source. Deterministic caches are rebuilt later, but the route must not
 * derive from malformed datasets, matrices, provenance holders, or a
 * conflicting root/report governance declaration.
 */
export function assertSenaProjectSnapshotPublicationSourceContract(value: unknown) {
  assertSenaProjectSnapshotAdmission(value);
  const root = asRecord(value, "project snapshot");
  const reproducibility = asRecord(root.reproducibility, "project snapshot.reproducibility");
  if (!snapshotMatrixShapesMatchDeclaredDatasetValue(value)) {
    throw new Error(
      "SENA project snapshot persisted analysis does not match the canonical dataset and build options."
    );
  }
  validateSenaProjectSnapshotCanonicalInputs({
    dataset: root.dataset,
    source: root.source,
    buildOptions: reproducibility.buildOptions
  });
  assertSenaProjectSnapshot(value);
  const report = asRecord(root.report, "project snapshot.report");
  const currentV2 = recordOrNull(report.fusionMathAudit)?.schemaVersion ===
      SENA_SCHEMA_VERSIONS.fusionMathAudit &&
    recordOrNull(report.codingReliabilityGate)?.schemaVersion ===
      SENA_SCHEMA_VERSIONS.codingReliabilityGate;
  if (currentV2 && !senaJsonValuesEqual(root.dataGovernance, report.dataGovernance)) {
    throw new Error("SENA project snapshot carries conflicting current data-governance provenance.");
  }
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
  if (isCurrentV2 && analysis.temporalRuntimeTrace === undefined) {
    throw new Error("project snapshot.analysis.temporalRuntimeTrace is required for current-v2 snapshots.");
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

function isEqualOrMoreConservativeStatus(
  projected: string,
  canonical: string,
  readyStatus: string
) {
  return canonical === readyStatus || projected !== readyStatus;
}

function hasExactItemMembershipById(
  projected: ReadonlyArray<{ id: string }>,
  canonical: ReadonlyArray<{ id: string }>
) {
  const projectedIds = projected.map((item) => item.id);
  const canonicalIds = canonical.map((item) => item.id);
  return projectedIds.length === new Set(projectedIds).size &&
    canonicalIds.length === new Set(canonicalIds).size &&
    senaJsonValuesEqual(projectedIds, canonicalIds);
}

/**
 * Review-packet reconciliation is an import-only, fail-closed projection. It
 * may add blockers gathered from another canonical packet holder, but it may
 * never upgrade a canonical readiness result or alter deterministic model,
 * validation, figure, provenance, or model-card evidence.
 */
function isConservativeReviewPacketReadinessProjection(
  projected: SenaReport,
  canonical: SenaReport,
  requireProjectionMarker = true
) {
  const projectedCompleteness = projected.completenessAudit;
  const canonicalCompleteness = canonical.completenessAudit;
  const projectedPilot = projected.pilotReadinessAudit;
  const canonicalPilot = canonical.pilotReadinessAudit;
  if ((requireProjectionMarker &&
      !projectedPilot.notes.includes(SENA_REVIEW_PACKET_READINESS_PROJECTION_NOTE)) ||
    projectedCompleteness.schemaVersion !== canonicalCompleteness.schemaVersion ||
    projectedPilot.schemaVersion !== canonicalPilot.schemaVersion ||
    !hasExactItemMembershipById(projectedCompleteness.items, canonicalCompleteness.items) ||
    !hasExactItemMembershipById(projectedPilot.items, canonicalPilot.items) ||
    !isEqualOrMoreConservativeStatus(
      projectedCompleteness.status,
      canonicalCompleteness.status,
      "complete"
    ) ||
    !isEqualOrMoreConservativeStatus(projectedPilot.status, canonicalPilot.status, "ready")) {
    return false;
  }

  const projectedCompletenessPassed = projectedCompleteness.items
    .filter((item) => item.status === "pass").length;
  const projectedPilotPassed = projectedPilot.items
    .filter((item) => item.status === "ready").length;
  if (projectedCompleteness.passed !== projectedCompletenessPassed ||
    projectedCompleteness.reviewNeeded !== projectedCompleteness.items.length - projectedCompletenessPassed ||
    projectedCompleteness.status !== (projectedCompletenessPassed === projectedCompleteness.items.length
      ? "complete"
      : "needs-review") ||
    projectedPilot.passed !== projectedPilotPassed ||
    projectedPilot.reviewNeeded !== projectedPilot.items.length - projectedPilotPassed ||
    projectedPilot.status !== (projectedPilotPassed === projectedPilot.items.length
      ? "ready"
      : "needs-review")) {
    return false;
  }

  for (let index = 0; index < canonicalCompleteness.items.length; index += 1) {
    const projectedItem = projectedCompleteness.items[index];
    const canonicalItem = canonicalCompleteness.items[index];
    if (!projectedItem || !canonicalItem ||
      projectedItem.id !== canonicalItem.id ||
      projectedItem.label !== canonicalItem.label ||
      !isEqualOrMoreConservativeStatus(projectedItem.status, canonicalItem.status, "pass")) {
      return false;
    }
    if (projectedItem.status === "pass" && !senaJsonValuesEqual(projectedItem, canonicalItem)) {
      return false;
    }
  }

  for (let index = 0; index < canonicalPilot.items.length; index += 1) {
    const projectedItem = projectedPilot.items[index];
    const canonicalItem = canonicalPilot.items[index];
    if (!projectedItem || !canonicalItem ||
      projectedItem.id !== canonicalItem.id ||
      projectedItem.label !== canonicalItem.label ||
      projectedItem.category !== canonicalItem.category ||
      projectedItem.nextAction !== canonicalItem.nextAction ||
      !isEqualOrMoreConservativeStatus(projectedItem.status, canonicalItem.status, "ready")) {
      return false;
    }
    if (projectedItem.status === "ready" && !senaJsonValuesEqual(projectedItem, canonicalItem)) {
      return false;
    }
  }

  const projectedCompletenessItem = projectedPilot.items
    .find((item) => item.id === "report-completeness");
  if (!projectedCompletenessItem ||
    projectedCompletenessItem.status !== (projectedCompleteness.status === "complete" ? "ready" : "review")) {
    return false;
  }
  return senaJsonValuesEqual(
    projected.claimReadinessGate,
    buildSenaClaimReadinessGate(projectedPilot)
  );
}

function assertSenaProjectSnapshotCanonicalAnalysis(
  snapshot: SenaProjectSnapshot,
  report: SenaReport,
  persistedReport: SenaReport = report,
  allowReviewPacketReadinessProjection = false
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
  let canonicalReport: SenaReport | undefined;
  if (!historicalStatisticalReadProjection) {
    try {
      canonicalReport = buildSenaReport(canonicalModel, {
        title: report.title,
        generatedAt: snapshot.generatedAt,
        activeTemporalWindow: snapshot.source.activeTemporalWindow,
        sourceDataset,
        evidenceLimit: Math.max(1, report.evidenceSnippets.length),
        nullModelIterations: report.validation.nullModels.permutation.iterations,
        humanReview: report.humanReview,
        codingReliability: report.codingReliabilityGate.review,
        dataGovernance: {
          irbApprovalId: report.dataGovernance.irbApprovalId,
          consentScope: report.dataGovernance.consentScope,
          retentionPolicy: report.dataGovernance.retentionPolicy,
          usageConstraints: [...report.dataGovernance.usageConstraints],
          dataSteward: report.dataGovernance.dataSteward,
          reviewedAt: report.dataGovernance.reviewedAt
        }
      });
    } catch {
      throw new Error(
        "SENA project snapshot canonical report could not be recomputed from the declared dataset and build options."
      );
    }
  }
  let canonicalTemporalRuntimeTrace: SenaTemporalRuntimeTrace | undefined;
  if (!historicalStatisticalReadProjection || snapshot.analysis.temporalRuntimeTrace !== undefined) {
    try {
      canonicalTemporalRuntimeTrace = buildSenaTemporalRuntimeTrace(
        sourceDataset,
        snapshot.reproducibility.buildOptions,
        {
          generatedAt: snapshot.generatedAt
        }
      );
    } catch {
      throw new Error(
        "SENA project snapshot canonical temporal runtime trace could not be recomputed from the declared source dataset and build options."
      );
    }
  }
  const reviewPacketReadinessProjection = Boolean(
    allowReviewPacketReadinessProjection &&
    canonicalReport &&
    isConservativeReviewPacketReadinessProjection(report, canonicalReport)
  );
  const authoritativeReadReconciliation = Boolean(
    canonicalReport &&
    (
      !senaJsonValuesEqual(persistedReport.humanReview, report.humanReview) ||
      !senaJsonValuesEqual(persistedReport.codingReliabilityGate, report.codingReliabilityGate) ||
      !senaJsonValuesEqual(persistedReport.dataGovernance, report.dataGovernance) ||
      !senaJsonValuesEqual(persistedReport.completenessAudit, report.completenessAudit) ||
      !senaJsonValuesEqual(persistedReport.pilotReadinessAudit, report.pilotReadinessAudit) ||
      !senaJsonValuesEqual(persistedReport.claimReadinessGate, report.claimReadinessGate)
    ) &&
    isConservativeReviewPacketReadinessProjection(report, canonicalReport, false)
  );
  const readinessProjection = reviewPacketReadinessProjection || authoritativeReadReconciliation;

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
    const modelCardMembership = inspectSenaModelCardSections(report.modelCard.sections);
    const failClosedModelCardMembership = modelCardMembership.missingIds.length > 0 ||
      modelCardMembership.duplicateIds.length > 0 ||
      modelCardMembership.unknownIds.length > 0 ||
      modelCardMembership.malformedIndexes.length > 0;
    const comparableCurrentReport = (candidate: SenaReport) => {
      const comparable = structuredClone(candidate) as unknown as Record<string, unknown>;
      if (authoritativeReadReconciliation) {
        // These three source holders have already passed their current-schema
        // semantic normalization. Their canonical builder representation may
        // differ after a fail-closed downgrade; every dependent deterministic
        // cache remains checked separately or through the conservative chain.
        delete comparable.humanReview;
        delete comparable.codingReliabilityGate;
        delete comparable.dataGovernance;
      }
      if (readinessProjection) {
        // The internal packet projection may canonicalize an incomplete
        // authoritative human-review holder (for example human-reviewed ->
        // draft). Every deterministic dependent surface remains exact below;
        // only this source holder and the explicitly conservative readiness
        // trio are reconciled.
        delete comparable.humanReview;
        delete comparable.completenessAudit;
        delete comparable.pilotReadinessAudit;
        delete comparable.claimReadinessGate;
      }
      if (failClosedModelCardMembership) {
        // Malformed membership is retained only as an explicitly blocked read
        // projection. The route/direct publication gates inspect the raw card
        // before canonical import and reject it; a ready card never enters
        // this exception.
        delete comparable.modelCard;
      }
      return comparable;
    };
    analysisComparisons.push(
      [report.figures.activeWindowComparison, canonicalActiveWindowComparison],
      [report.figures.activeWindowBrief, canonicalActiveWindowBrief],
      // The complete current report comparison is the canonical ledger for
      // validation samples/intervals, every deterministic figure, the full
      // model-card/completeness/readiness chain, audits, and any future
      // publication-used field added to buildSenaReport. Persisted caches may
      // be normalized fail-closed, but they are never silently trusted.
      [comparableCurrentReport(report), comparableCurrentReport(canonicalReport!)]
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
  if (!historicalStatisticalReadProjection && canonicalReport) {
    const modelCardMembership = inspectSenaModelCardSections(report.modelCard.sections);
    const failClosedModelCardMembership = modelCardMembership.missingIds.length > 0 ||
      modelCardMembership.duplicateIds.length > 0 ||
      modelCardMembership.unknownIds.length > 0 ||
      modelCardMembership.malformedIndexes.length > 0;
    const reconciled = structuredClone(canonicalReport);
    if (readinessProjection) {
      reconciled.completenessAudit = structuredClone(report.completenessAudit);
      reconciled.pilotReadinessAudit = structuredClone(report.pilotReadinessAudit);
      reconciled.claimReadinessGate = structuredClone(report.claimReadinessGate);
    }
    if (failClosedModelCardMembership) {
      reconciled.modelCard = structuredClone(report.modelCard);
    }
    return reconciled;
  }
  return report;
}

function importSenaProjectSnapshotInternal(
  source: string | unknown,
  options: SenaProjectSnapshotImportOptions,
  allowReviewPacketReadinessProjection: boolean
): SenaProjectSnapshot {
  assertSenaProjectSnapshotAdmission(source, options);
  const value = typeof source === "string" ? JSON.parse(source) : source;
  // JSON.parse can materialize values outside the finite JSON value domain
  // (for example `1e999` becomes Infinity). Re-admit the bounded parsed graph
  // before shallow inspection, cloning, hashing, or canonical reconstruction.
  if (typeof source === "string") {
    assertSenaProjectSnapshotAdmission(value, options);
  }
  const root = asRecord(value, "project snapshot");
  if (root.schemaVersion !== SENA_SCHEMA_VERSIONS.projectSnapshot) {
    throw new Error("JSON is not a SENA project snapshot.");
  }
  const reproducibilityInput = asRecord(root.reproducibility, "project snapshot.reproducibility");
  const rawReport = recordOrNull(root.report);
  const rawFusionMathAudit = recordOrNull(rawReport?.fusionMathAudit);
  const rawCodingReliabilityGate = recordOrNull(rawReport?.codingReliabilityGate);
  const currentV2 = rawFusionMathAudit?.schemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit &&
    rawCodingReliabilityGate?.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityGate;
  assertSenaProjectSnapshotCanonicalAnalysisWorkBudget(root, currentV2 ? {
    fullModelBuilds: 1,
    validationModelBuilds: declaredSnapshotValidationModelBuilds(root),
    temporalTraceBuilds: 2,
    activeWindowBaselineBuilds: 2
  } : undefined);
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
  const persistedReport = normalized.report as unknown as SenaReport;
  let normalizedReport = normalizeSenaReportStatisticalLeaves(
    normalized.report,
    "project snapshot.report"
  ).report;
  if (allowReviewPacketReadinessProjection) {
    const currentReadReconciliation =
      !senaJsonValuesEqual(persistedReport.humanReview, normalizedReport.humanReview) ||
      !senaJsonValuesEqual(persistedReport.codingReliabilityGate, normalizedReport.codingReliabilityGate) ||
      !senaJsonValuesEqual(persistedReport.dataGovernance, normalizedReport.dataGovernance) ||
      !senaJsonValuesEqual(persistedReport.completenessAudit, normalizedReport.completenessAudit) ||
      !senaJsonValuesEqual(persistedReport.pilotReadinessAudit, normalizedReport.pilotReadinessAudit) ||
      !senaJsonValuesEqual(persistedReport.claimReadinessGate, normalizedReport.claimReadinessGate);
    if (currentReadReconciliation) {
      normalizedReport.pilotReadinessAudit.notes = Array.from(new Set([
        ...normalizedReport.pilotReadinessAudit.notes,
        SENA_REVIEW_PACKET_READINESS_PROJECTION_NOTE
      ]));
    }
  }
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
  normalizedReport = assertSenaProjectSnapshotCanonicalAnalysis(
    normalized as unknown as SenaProjectSnapshot,
    normalizedReport,
    persistedReport,
    allowReviewPacketReadinessProjection
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

export function importSenaProjectSnapshot(
  source: string | unknown,
  options: SenaProjectSnapshotImportOptions = {}
): SenaProjectSnapshot {
  return importSenaProjectSnapshotInternal(source, options, false);
}

/**
 * @internal Review-packet restore boundary only. This is intentionally a
 * separate code path instead of a persisted/public import option: a snapshot
 * payload cannot opt itself into conservative projection handling, and direct
 * snapshot/publication imports always use exact canonical comparison.
 */
export function importSenaProjectSnapshotForReviewPacket(
  source: string | unknown,
  options: SenaProjectSnapshotImportOptions = {}
): SenaProjectSnapshot {
  return importSenaProjectSnapshotInternal(source, options, true);
}

export function isSenaProjectSnapshot(value: unknown): value is SenaProjectSnapshot {
  try {
    assertSenaProjectSnapshotAdmission(value);
    const root = asRecord(value, "project snapshot");
    if (root.schemaVersion !== SENA_SCHEMA_VERSIONS.projectSnapshot) return false;
    const reproducibility = asRecord(root.reproducibility, "project snapshot.reproducibility");
    assertSenaProjectSnapshotCanonicalAnalysisWorkBudget(root, {
      fullModelBuilds: 1,
      validationModelBuilds: declaredSnapshotValidationModelBuilds(root),
      temporalTraceBuilds: 2,
      activeWindowBaselineBuilds: 2
    });
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
    assertSenaProjectSnapshotCanonicalAnalysis(
      value as SenaProjectSnapshot,
      normalizedReport,
      report as unknown as SenaReport
    );
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
