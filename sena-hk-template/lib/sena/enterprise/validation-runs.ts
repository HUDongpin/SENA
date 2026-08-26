import { createHash, randomBytes } from "node:crypto";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  writeEnterpriseState
} from "./state";
import {
  createEnterprisePostgresValidationRunAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import type { SenaEnterpriseDb } from "./state";
import type {
  SenaEnterpriseProject,
  SenaEnterpriseProjectEvidenceBinding
} from "./team-project";
import {
  buildEnterpriseProjectEvidenceBinding,
  enterpriseProjectBindingSnapshotSha256,
  getEnterpriseProject,
  getEnterpriseProjectAsync
} from "./team-project";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  queueEnterpriseNotification
} from "./notifications-delivery";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  isCurrentSenaGroupComparisonValidationResult,
  normalizeSenaGroupComparisonValidationResult,
  type SenaGroupComparisonMetric,
  type SenaGroupComparisonResult,
  type SenaGroupComparisonSpec,
  type SenaGroupComparisonValidationResult
} from "../inference";
import { importSenaJsonContract } from "../import";
import { validateSenaAnalyticalInputs } from "../analytical-input-validation";
import { importSenaProjectSnapshot } from "../snapshot";
import { createSenaSchemaPayload, SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaBuildOptions, SenaDataset, SenaRuntimeProvenance } from "../types";
import {
  buildEnterpriseValidationParityEvidence,
  buildEnterpriseValidationPreregistrationPlan,
  normalizeEnterpriseValidationRunEvidence,
  sealEnterpriseValidationRunEvidence,
  SenaEnterpriseValidationAnalysisRunIndex,
  SenaEnterpriseValidationProjectRevisionIndex
} from "./validation-integrity";
import { senaValidationSourceVerificationCache } from "./validation-request-scope";

export {
  enterpriseValidationParityEvidenceHash,
  enterpriseValidationPreregistrationPlanHash,
  isEnterpriseValidationParityEvidenceHashValid,
  isEnterpriseValidationPreregistrationPlanHashValid
} from "./validation-integrity";

export type SenaEnterpriseValidationRunStatus = "pending-review" | "approved" | "rejected";

export type SenaEnterpriseValidationPreregistrationPlan = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.validationPreregistrationPlan;
  planHash: string;
  hashAlgorithm: "sha256";
  analysis: "single-comparison" | "holm-suite";
  primary: {
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
  };
  comparisons: Array<{
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
  }>;
  parameters: {
    permutationIterations: number;
    bootstrapIterations: number;
    seed: number;
    alpha?: number;
    correction?: "holm";
  };
  protocolNoteHash?: string;
  methodNoteHash?: string;
  guardrail: string;
  evidence: string[];
};

export type SenaEnterpriseValidationParityEvidenceInput = {
  walkthroughDatasetLabel?: string;
  walkthroughDatasetHash?: string;
  walkthroughSource?: "input" | "analysis-run" | "project-snapshot";
  walkthroughSourceId?: string;
  expertReviewRequired?: boolean;
  studySpecificInferenceReference?: string;
  notes?: string[];
  runtimeParityIds?: string[];
};

export type SenaEnterpriseFormalInferenceReadiness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.formalInferenceReadiness;
  status: "model-referenced" | "model-required" | "incomplete";
  resultSchemaVersion: SenaGroupComparisonValidationResult["schemaVersion"];
  analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"];
  preregistrationPlanHash: string;
  studySpecificInferenceReference?: string;
  comparisonCount: number;
  minGroupSize: number;
  smallSampleComparisons: number;
  permutationIterations: number;
  bootstrapIterations: number;
  alpha?: number;
  correction?: "holm";
  checks: Array<{
    id: "preregistration-plan" | "study-specific-model" | "runtime-parity" | "real-data-walkthrough" | "multiplicity-control" | "sample-size";
    label: string;
    status: "passed" | "required" | "review";
    evidence: string[];
  }>;
  blockers: string[];
  warnings: string[];
  guardrail: string;
};

export type SenaEnterpriseValidationParityEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.validationParityEvidence;
  status: "ready-for-review" | "incomplete";
  validationRunHash: string;
  hashAlgorithm: "sha256";
  analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"];
  preregistrationPlanHash: string;
  runtimeParity: Array<{
    id: string;
    referenceRuntime: string;
    fixturePath: string;
    status: SenaRuntimeProvenance["parityEvidence"][number]["status"];
    coverage: string[];
    sampleHash: string;
    interpretation: string;
  }>;
  walkthrough: {
    datasetLabel: string;
    datasetHash?: string;
    source: "input" | "analysis-run" | "project-snapshot" | "missing";
    sourceId?: string;
    status: "attached" | "missing";
  };
  inference: {
    resultSchemaVersion: SenaGroupComparisonValidationResult["schemaVersion"];
    guardrail: string;
    comparisonCount: number;
    permutationIterations: number;
    bootstrapIterations: number;
    alpha?: number;
    correction?: "holm";
    studySpecificInferenceReference?: string;
  };
  formalInference: SenaEnterpriseFormalInferenceReadiness;
  gates: Array<{
    id: "rena-parity" | "r-sna-parity" | "real-data-walkthrough" | "domain-expert-review" | "study-specific-inference";
    label: string;
    status: "passed" | "missing" | "required" | "attached";
    evidence: string[];
  }>;
  notes: string[];
};

export type SenaEnterpriseValidationRun = {
  id: string;
  teamId: string;
  projectId?: string;
  /** Historical records may be unbound; claim aggregation treats them as exploratory-only. */
  projectBinding?: SenaEnterpriseProjectEvidenceBinding;
  userId: string;
  status: SenaEnterpriseValidationRunStatus;
  reviewerId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  preregistrationNote: string;
  methodNote: string;
  metric: SenaGroupComparisonMetric;
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
  iterations: number;
  seed: number;
  pTwoSided: number;
  comparisonCount?: number;
  minHolmAdjustedP?: number;
  significantHolmCount?: number;
  observedDifference: number;
  /** Historical reviewed runs may not carry the v1 seal and remain exploratory. */
  validationRunEvidenceSchemaVersion?: typeof SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence;
  validationRunEvidenceHash?: string;
  preregistrationPlan?: SenaEnterpriseValidationPreregistrationPlan;
  parityEvidence?: SenaEnterpriseValidationParityEvidence;
  result: SenaGroupComparisonValidationResult;
  createdAt: string;
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function postgresValidationRunRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresValidationRunRegistryConfigured() {
  return postgresValidationRunRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

export function enterpriseValidationRunRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresValidationRunRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_validation_runs",
    evidence: [
      `validationRunRegistryStore=${activeStore}`,
      `validationRunRegistryPostgresRequested=${requested}`,
      `validationRunRegistryPostgresConfigured=${postgresConfig.configured}`,
      `validationRunRegistryPostgresTable=sena_enterprise_validation_runs`,
      `validationRunRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

async function upsertValidationRunsToPostgresIfConfigured(runs: SenaEnterpriseValidationRun[]) {
  if (runs.length === 0 || !postgresValidationRunRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresValidationRunAdapterFromEnv({});
  try {
    await adapter.upsertValidationRuns(runs);
  } finally {
    await pool.end?.();
  }
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function latestByTimestamp<T extends { createdAt: string; updatedAt?: string }>(records: T[]) {
  return records
    .slice()
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
}

function primaryValidationComparison(result: SenaGroupComparisonValidationResult): SenaGroupComparisonResult {
  return result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? result.primary : result;
}

function validationRunSummary(result: SenaGroupComparisonValidationResult) {
  const primary = primaryValidationComparison(result);
  const suite = result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? result : null;
  return {
    primary,
    comparisonCount: suite?.comparisonCount ?? 1,
    minHolmAdjustedP: suite
      ? suite.comparisons.reduce((minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP), 1)
      : undefined,
    significantHolmCount: suite?.significantHolmCount
  };
}

function deriveValidationParityEvidenceFromProject(
  db: ReturnType<typeof readEnterpriseDb>,
  project: SenaEnterpriseProject | undefined
): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (!project) return undefined;
  const projectSnapshotBindingSha256 = enterpriseProjectBindingSnapshotSha256(project.snapshot);
  const linkedAnalysisRuns = db.analysisRuns.filter((run) => (
    run.teamId === project.teamId &&
    (run.projectId === project.id || run.persistedProjectId === project.id) &&
    run.artifactFingerprints.projectSnapshotBindingSha256 === projectSnapshotBindingSha256
  ));
  const analysisRun = latestByTimestamp(linkedAnalysisRuns);
  if (analysisRun) {
    return {
      walkthroughDatasetLabel: `analysis:${analysisRun.title}`,
      walkthroughDatasetHash: projectSnapshotBindingSha256,
      walkthroughSource: "analysis-run",
      walkthroughSourceId: analysisRun.id,
      notes: [
        `walkthroughSource=analysis-run:${analysisRun.id}`,
        `analysisSourceKind=${analysisRun.sourceKind}`,
        `reportSha256=${analysisRun.artifactFingerprints.reportSha256}`,
        `analysisProjectSnapshotArtifactSha256=${analysisRun.artifactFingerprints.projectSnapshotSha256}`,
        `analysisProjectSnapshotBindingSha256=${analysisRun.artifactFingerprints.projectSnapshotBindingSha256 ?? "legacy-missing"}`,
        `projectBindingSnapshotSha256=${projectSnapshotBindingSha256}`,
        ...(analysisRun.artifactFingerprints.runtimeBundleSha256 ? [`runtimeBundleSha256=${analysisRun.artifactFingerprints.runtimeBundleSha256}`] : [])
      ]
    };
  }
  return {
    walkthroughDatasetLabel: `project:${project.title}`,
    walkthroughDatasetHash: projectSnapshotBindingSha256,
    walkthroughSource: "project-snapshot",
    walkthroughSourceId: project.id,
    notes: [
      `walkthroughSource=project-snapshot:${project.id}`,
      `projectBindingSnapshotSha256=${projectSnapshotBindingSha256}`
    ]
  };
}

function mergeValidationParityEvidenceInput(
  automaticEvidence: SenaEnterpriseValidationParityEvidenceInput | undefined,
  manualEvidence: SenaEnterpriseValidationParityEvidenceInput | undefined
): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (!automaticEvidence && !manualEvidence) return undefined;
  return {
    walkthroughDatasetLabel: automaticEvidence?.walkthroughDatasetLabel ?? manualEvidence?.walkthroughDatasetLabel,
    walkthroughDatasetHash: automaticEvidence?.walkthroughDatasetHash ?? manualEvidence?.walkthroughDatasetHash,
    walkthroughSource: automaticEvidence?.walkthroughSource ?? manualEvidence?.walkthroughSource,
    walkthroughSourceId: automaticEvidence?.walkthroughSourceId ?? manualEvidence?.walkthroughSourceId,
    expertReviewRequired: manualEvidence?.expertReviewRequired ?? automaticEvidence?.expertReviewRequired,
    studySpecificInferenceReference: manualEvidence?.studySpecificInferenceReference ?? automaticEvidence?.studySpecificInferenceReference,
    runtimeParityIds: manualEvidence?.runtimeParityIds ?? automaticEvidence?.runtimeParityIds,
    notes: [
      ...(automaticEvidence?.notes ?? []),
      ...(manualEvidence?.notes ?? [])
    ]
  };
}

type CreateEnterpriseValidationRunInput = {
  teamId: string;
  projectId?: string;
  preregistrationNote?: string;
  methodNote?: string;
  parityEvidence?: SenaEnterpriseValidationParityEvidenceInput;
  result: SenaGroupComparisonValidationResult;
};

function createEnterpriseValidationRunInDb(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseValidationRunInput,
  db: ReturnType<typeof readEnterpriseDb>
) {
  const sourceVerificationCache = senaValidationSourceVerificationCache();
  input = {
    ...input,
    result: normalizeSenaGroupComparisonValidationResult(input.result)
  };
  if (!isCurrentSenaGroupComparisonValidationResult(input.result)) {
    throw new SenaEnterpriseError(
      "New enterprise validation runs require current-v2 source-bound group-comparison evidence.",
      400,
      "validation_current_result_required"
    );
  }
  requireEnterprisePermission(context, input.teamId, "analysis:run");
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  let project: SenaEnterpriseProject | undefined;
  if (input.projectId) {
    project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    if (project.teamId !== input.teamId) {
      throw new SenaEnterpriseError("Validation run team does not match the project team.", 400, "validation_project_team_mismatch");
    }
    requireEnterprisePermission(context, project.teamId, "analysis:run");
  }
  if (project) {
    input = {
      ...input,
      result: normalizeSenaGroupComparisonValidationResult(input.result, {
        dataset: project.snapshot.dataset,
        buildOptions: project.snapshot.reproducibility.buildOptions
      }, sourceVerificationCache)
    };
  }
  const summary = validationRunSummary(input.result);
  const primary = summary.primary;
  const preregistrationNote = input.preregistrationNote?.trim() ?? "";
  const methodNote = input.methodNote?.trim() || input.result.guardrail;
  const preregistrationPlan = buildEnterpriseValidationPreregistrationPlan({
    result: input.result,
    preregistrationNote,
    methodNote
  });
  const derivedParityEvidence = deriveValidationParityEvidenceFromProject(db, project);
  const parityEvidence = buildEnterpriseValidationParityEvidence({
    result: input.result,
    preregistrationPlan,
    parityEvidence: mergeValidationParityEvidenceInput(derivedParityEvidence, input.parityEvidence)
  });

  const unsealedRun: SenaEnterpriseValidationRun = {
    id: id("val"),
    teamId: input.teamId,
    projectId: input.projectId,
    projectBinding: project ? buildEnterpriseProjectEvidenceBinding(project) : undefined,
    userId: context.user.id,
    status: "pending-review",
    preregistrationNote,
    methodNote,
    metric: primary.metric,
    groupField: primary.groupField,
    groupA: primary.groupA,
    groupB: primary.groupB,
    iterations: primary.permutation.iterations,
    seed: primary.permutation.seed,
    pTwoSided: primary.permutation.pTwoSided,
    comparisonCount: summary.comparisonCount,
    minHolmAdjustedP: summary.minHolmAdjustedP,
    significantHolmCount: summary.significantHolmCount,
    observedDifference: primary.observedDifference,
    preregistrationPlan,
    parityEvidence,
    result: input.result,
    createdAt: now()
  };
  const run = sealEnterpriseValidationRunEvidence(unsealedRun, project, {
    analysisRuns: db.analysisRuns,
    sourceVerificationCache
  });
  db.validationRuns.unshift(run);
  db.validationRuns = db.validationRuns.slice(0, 1000);
  appendAudit(db, {
    event: "inference.run",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      validationRunId: run.id,
      metric: run.metric,
      groupField: run.groupField,
      groupA: run.groupA,
      groupB: run.groupB,
      pTwoSided: run.pTwoSided,
      comparisonCount: run.comparisonCount ?? 1,
      minHolmAdjustedP: run.minHolmAdjustedP ?? null,
      preregistrationPlanHash: run.preregistrationPlan?.planHash ?? null,
      parityEvidenceHash: run.parityEvidence?.validationRunHash ?? null,
      parityEvidenceStatus: run.parityEvidence?.status ?? null
    }
  });
  return run;
}

export function createEnterpriseValidationRun(context: SenaEnterpriseSessionContext, input: CreateEnterpriseValidationRunInput) {
  const db = readEnterpriseDb();
  const run = createEnterpriseValidationRunInDb(context, input, db);
  saveDb(db);
  return run;
}

export async function createEnterpriseValidationRunWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseValidationRunInput
) {
  const run = createEnterpriseValidationRun(context, input);
  await upsertValidationRunsToPostgresIfConfigured([run]);
  return run;
}

export async function createEnterpriseValidationRunWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseValidationRunInput
) {
  const state = await readEnterpriseState();
  const run = createEnterpriseValidationRunInDb(context, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertValidationRunsToPostgresIfConfigured([run]);
  return run;
}

export function reviewEnterpriseValidationRun(context: SenaEnterpriseSessionContext, runId: string, input: {
  status: Extract<SenaEnterpriseValidationRunStatus, "approved" | "rejected">;
  notes?: string;
}) {
  const db = readEnterpriseDb();
  const run = reviewEnterpriseValidationRunInDb(context, runId, input, db);
  saveDb(db);
  return run;
}

function reviewEnterpriseValidationRunInDb(context: SenaEnterpriseSessionContext, runId: string, input: {
  status: Extract<SenaEnterpriseValidationRunStatus, "approved" | "rejected">;
  notes?: string;
}, db: ReturnType<typeof readEnterpriseDb>) {
  const run = db.validationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new SenaEnterpriseError("Validation run was not found.", 404, "validation_run_not_found");
  requireEnterprisePermission(context, run.teamId, "analysis:run");
  const project = run.projectId
    ? db.projects.find((candidate) => candidate.id === run.projectId)
    : undefined;
  const sourceVerificationCache = senaValidationSourceVerificationCache();
  const snapshotHashCache = new WeakMap<object, { bindingSha256: string }>();
  const projectRevisionIndex = run.projectId && run.projectBinding
    ? new SenaEnterpriseValidationProjectRevisionIndex(
        db.projectRevisions,
        snapshotHashCache,
        {
          projectId: run.projectId,
          teamId: run.teamId,
          version: run.projectBinding.projectVersion
        }
      )
    : undefined;
  const analysisRunIndex = new SenaEnterpriseValidationAnalysisRunIndex(db.analysisRuns);
  const verifiedRun = normalizeEnterpriseValidationRunEvidence(run, project, {
    evidenceHash: "optional",
    projectRevisions: db.projectRevisions,
    projectRevisionIndex,
    analysisRuns: db.analysisRuns,
    analysisRunIndex,
    snapshotHashCache,
    sourceVerificationCache
  });
  const reviewedRun = sealEnterpriseValidationRunEvidence({
    ...verifiedRun,
    status: input.status,
    reviewerId: context.user.id,
    reviewedAt: now(),
    reviewNotes: input.notes?.trim() ?? ""
  }, project, {
    projectRevisions: db.projectRevisions,
    projectRevisionIndex,
    analysisRuns: db.analysisRuns,
    analysisRunIndex,
    snapshotHashCache,
    sourceVerificationCache
  });
  Object.assign(run, reviewedRun);
  appendAudit(db, {
    event: "validation.review",
    userId: context.user.id,
    teamId: run.teamId,
    projectId: run.projectId,
    detail: {
      validationRunId: run.id,
      status: run.status,
      metric: run.metric,
      pTwoSided: run.pTwoSided,
      comparisonCount: run.comparisonCount ?? 1,
      minHolmAdjustedP: run.minHolmAdjustedP ?? null
    }
  });
  queueEnterpriseNotification(db, {
    kind: "validation.review",
    userId: run.userId,
    teamId: run.teamId,
    projectId: run.projectId,
    title: "Group-comparison validation reviewed",
    body: `${context.user.name} marked a validation run as ${run.status}.`,
    actionUrl: run.projectId ? `/workspace/sena?projectId=${encodeURIComponent(run.projectId)}` : "/workspace/sena",
    detail: {
      validationRunId: run.id,
      status: run.status,
      reviewerId: context.user.id
    }
  });
  return run;
}

export async function reviewEnterpriseValidationRunWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: Parameters<typeof reviewEnterpriseValidationRun>[2]
) {
  const run = reviewEnterpriseValidationRun(context, runId, input);
  await upsertValidationRunsToPostgresIfConfigured([run]);
  return run;
}

export async function reviewEnterpriseValidationRunWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: Parameters<typeof reviewEnterpriseValidationRun>[2]
) {
  const state = await readEnterpriseState();
  const run = reviewEnterpriseValidationRunInDb(context, runId, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertValidationRunsToPostgresIfConfigured([run]);
  return run;
}

export function listEnterpriseValidationRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  return listEnterpriseValidationRunsFromDb(context, db, input);
}

export async function listEnterpriseValidationRunsAsync(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const state = await readEnterpriseState();
  return listEnterpriseValidationRunsFromDb(context, state.db, input);
}

function listEnterpriseValidationRunsFromDb(context: SenaEnterpriseSessionContext, db: ReturnType<typeof readEnterpriseDb>, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("analysis:run"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "analysis:run");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "analysis:run");
    teamIds = new Set([project.teamId]);
  }

  return db.validationRuns
    .filter((run) => teamIds.has(run.teamId))
    .filter((run) => !input.projectId || run.projectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type SenaEnterpriseValidationRunHeaderSource = Pick<
  SenaEnterpriseValidationRun,
  "id" | "status" | "projectId" | "comparisonCount" | "pTwoSided" | "minHolmAdjustedP" |
  "validationRunEvidenceHash" | "preregistrationPlan" | "parityEvidence"
>;

export function buildEnterpriseValidationRunHeaders(run: SenaEnterpriseValidationRunHeaderSource) {
  return {
    "x-sena-validation-run-id": run.id,
    "x-sena-validation-status": run.status,
    ...(run.projectId ? { "x-sena-project-id": run.projectId } : {}),
    "x-sena-validation-comparison-count": String(run.comparisonCount ?? 1),
    "x-sena-validation-p-two-sided": String(run.pTwoSided),
    ...(run.minHolmAdjustedP !== undefined ? { "x-sena-validation-min-holm-p": String(run.minHolmAdjustedP) } : {}),
    ...(run.validationRunEvidenceHash ? {
      "x-sena-validation-run-evidence-sha256": run.validationRunEvidenceHash
    } : {}),
    ...(run.preregistrationPlan?.planHash ? { "x-sena-validation-preregistration-sha256": run.preregistrationPlan.planHash } : {}),
    ...(run.parityEvidence?.status ? { "x-sena-validation-parity-status": run.parityEvidence.status } : {}),
    ...(run.parityEvidence?.validationRunHash ? { "x-sena-validation-parity-sha256": run.parityEvidence.validationRunHash } : {}),
    ...(run.parityEvidence?.formalInference.status ? { "x-sena-formal-inference-status": run.parityEvidence.formalInference.status } : {})
  };
}

export function buildEnterpriseValidationRunListResponse(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string },
  listRuns: typeof listEnterpriseValidationRuns = listEnterpriseValidationRuns
) {
  return {
    body: createSenaSchemaPayload("validationRunList", {
      validationRuns: listRuns(context, input)
    })
  };
}

export async function buildEnterpriseValidationRunListResponseAsync(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string }
) {
  return {
    body: createSenaSchemaPayload("validationRunList", {
      validationRuns: await listEnterpriseValidationRunsAsync(context, input)
    })
  };
}

export function buildEnterpriseValidationRunReviewResponse(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; status?: unknown; notes?: unknown },
  reviewRun: typeof reviewEnterpriseValidationRun = reviewEnterpriseValidationRun
) {
  const validationRun = reviewRun(context, String(body.runId ?? ""), {
    status: body.status === "approved" ? "approved" : "rejected",
    notes: body.notes ? String(body.notes) : undefined
  });
  return {
    body: createSenaSchemaPayload("validationRunReview", {
      validationRun
    }),
    headers: buildEnterpriseValidationRunHeaders(validationRun)
  };
}

export async function buildEnterpriseValidationRunReviewResponseWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; status?: unknown; notes?: unknown }
) {
  const validationRun = await reviewEnterpriseValidationRunWithPostgresMirror(context, String(body.runId ?? ""), {
    status: body.status === "approved" ? "approved" : "rejected",
    notes: body.notes ? String(body.notes) : undefined
  });
  return {
    body: createSenaSchemaPayload("validationRunReview", {
      validationRun
    }),
    headers: buildEnterpriseValidationRunHeaders(validationRun)
  };
}

export async function buildEnterpriseValidationRunReviewResponseWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; status?: unknown; notes?: unknown }
) {
  const validationRun = await reviewEnterpriseValidationRunWithPostgresMirrorAsync(context, String(body.runId ?? ""), {
    status: body.status === "approved" ? "approved" : "rejected",
    notes: body.notes ? String(body.notes) : undefined
  });
  return {
    body: createSenaSchemaPayload("validationRunReview", {
      validationRun
    }),
    headers: buildEnterpriseValidationRunHeaders(validationRun)
  };
}

const defaultGroupComparisonMetric: SenaGroupComparisonMetric = "socialStrength";

function groupComparisonMetricValue(value: unknown): SenaGroupComparisonMetric {
  return value === undefined ? defaultGroupComparisonMetric : value as SenaGroupComparisonMetric;
}

function parseGroupComparisonMetricList(value: unknown, fallback: unknown) {
  const candidates = Array.isArray(value) ? value : [fallback ?? defaultGroupComparisonMetric];
  return (candidates as SenaGroupComparisonMetric[])
    .filter((metric, index, list) => list.indexOf(metric) === index);
}

function parseGroupComparisonSpecs(body: Record<string, unknown>): SenaGroupComparisonSpec[] {
  if (Array.isArray(body.comparisons)) {
    const defaultGroupField = (body.groupField ?? "group") as "group" | "role";
    const defaultMetric = groupComparisonMetricValue(body.metric);
    return body.comparisons.map((comparison): SenaGroupComparisonSpec => {
      const record = comparison as Record<string, unknown>;
      return {
        groupField: (record.groupField ?? defaultGroupField) as "group" | "role",
        groupA: record.groupA as string,
        groupB: record.groupB as string,
        metric: (record.metric ?? defaultMetric) as SenaGroupComparisonMetric
      };
    });
  }

  const groupA = body.groupA as string;
  const groupB = body.groupB as string;
  const groupField = (body.groupField ?? "group") as "group" | "role";
  return parseGroupComparisonMetricList(body.metrics, body.metric).map((metric) => ({
    groupField,
    groupA,
    groupB,
    metric
  }));
}

export type SenaResolvedEnterpriseGroupComparisonInput = {
  projectId?: string;
  project: SenaEnterpriseProject | null;
  snapshot: ReturnType<typeof importSenaProjectSnapshot> | null;
  dataset: SenaDataset;
  buildOptions?: Partial<SenaBuildOptions>;
  comparisons: SenaGroupComparisonSpec[];
  defaultGroupField: "group" | "role";
  defaultMetric: SenaGroupComparisonMetric;
  iterations: number;
  bootstrapIterations: number;
  seed: number;
  alpha: number;
  suite: boolean;
};

export function resolveEnterpriseGroupComparisonInput(
  body: Record<string, unknown>,
  project: SenaEnterpriseProject | null
): SenaResolvedEnterpriseGroupComparisonInput {
  const projectId = body.projectId ? String(body.projectId) : undefined;
  const snapshot = body.snapshot
    ? importSenaProjectSnapshot(body.snapshot)
    : project?.snapshot
      ? importSenaProjectSnapshot(project.snapshot)
      : null;
  const dataset = snapshot?.dataset ?? importSenaJsonContract(body.dataset).dataset;
  const effectiveBuildOptions = snapshot?.reproducibility.buildOptions ?? body.buildOptions;
  validateSenaAnalyticalInputs({
    dataset,
    buildOptions: effectiveBuildOptions,
    groupComparison: body
  });
  const iterations = (body.iterations ?? 1000) as number;
  return {
    projectId,
    project,
    snapshot,
    dataset,
    buildOptions: effectiveBuildOptions as Partial<SenaBuildOptions> | undefined,
    comparisons: parseGroupComparisonSpecs(body),
    defaultGroupField: (body.groupField ?? "group") as "group" | "role",
    defaultMetric: groupComparisonMetricValue(body.metric),
    iterations,
    bootstrapIterations: (body.bootstrapIterations ?? iterations) as number,
    seed: (body.seed ?? 20260611) as number,
    alpha: (body.alpha ?? 0.05) as number,
    suite: (body.suite ?? false) as boolean
  };
}

function parseEnterpriseValidationParityEvidence(value: unknown): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    walkthroughDatasetLabel: record.walkthroughDatasetLabel ? String(record.walkthroughDatasetLabel) : undefined,
    walkthroughDatasetHash: record.walkthroughDatasetHash ? String(record.walkthroughDatasetHash) : undefined,
    expertReviewRequired: typeof record.expertReviewRequired === "boolean" ? record.expertReviewRequired : undefined,
    studySpecificInferenceReference: record.studySpecificInferenceReference ? String(record.studySpecificInferenceReference) : undefined,
    notes: Array.isArray(record.notes) ? record.notes.map((note) => String(note)).slice(0, 20) : undefined,
    runtimeParityIds: Array.isArray(record.runtimeParityIds) ? record.runtimeParityIds.map((id) => String(id)).slice(0, 20) : undefined
  };
}

export function buildEnterpriseGroupComparisonValidationResponse(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>,
  adapters: {
    getProject?: typeof getEnterpriseProject;
    createValidationRun?: typeof createEnterpriseValidationRun;
  } = {}
) {
  const projectId = body.projectId ? String(body.projectId) : undefined;
  const project: SenaEnterpriseProject | null = projectId ? (adapters.getProject ?? getEnterpriseProject)(context, projectId) : null;
  const resolved = resolveEnterpriseGroupComparisonInput(body, project);
  const result = resolved.comparisons.length <= 1 && !resolved.suite
    ? buildSenaGroupComparison({
      dataset: resolved.dataset,
      buildOptions: resolved.buildOptions,
      groupField: resolved.comparisons[0].groupField,
      groupA: resolved.comparisons[0].groupA,
      groupB: resolved.comparisons[0].groupB,
      metric: resolved.comparisons[0].metric,
      iterations: resolved.iterations,
      seed: resolved.seed,
      bootstrapIterations: resolved.bootstrapIterations
    })
    : buildSenaGroupComparisonSuite({
      dataset: resolved.dataset,
      buildOptions: resolved.buildOptions,
      comparisons: resolved.comparisons,
      defaultGroupField: resolved.defaultGroupField,
      defaultMetric: resolved.defaultMetric,
      iterations: resolved.iterations,
      seed: resolved.seed,
      bootstrapIterations: resolved.bootstrapIterations,
      alpha: resolved.alpha
    });
  const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
  const validationRun = (adapters.createValidationRun ?? createEnterpriseValidationRun)(context, {
    teamId,
    projectId,
    preregistrationNote: body.preregistrationNote ? String(body.preregistrationNote) : undefined,
    methodNote: body.methodNote ? String(body.methodNote) : undefined,
    parityEvidence: parseEnterpriseValidationParityEvidence(body.parityEvidence),
    result
  });

  return {
    body: {
      ...result,
      validationRun
    },
    headers: buildEnterpriseValidationRunHeaders(validationRun)
  };
}

export async function buildEnterpriseGroupComparisonValidationResponseWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  const response = buildEnterpriseGroupComparisonValidationResponse(context, body);
  await upsertValidationRunsToPostgresIfConfigured([response.body.validationRun]);
  return response;
}

export async function buildEnterpriseGroupComparisonValidationResponseWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>
) {
  const projectId = body.projectId ? String(body.projectId) : undefined;
  const project: SenaEnterpriseProject | null = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
  const resolved = resolveEnterpriseGroupComparisonInput(body, project);
  const result = resolved.comparisons.length <= 1 && !resolved.suite
    ? buildSenaGroupComparison({
      dataset: resolved.dataset,
      buildOptions: resolved.buildOptions,
      groupField: resolved.comparisons[0].groupField,
      groupA: resolved.comparisons[0].groupA,
      groupB: resolved.comparisons[0].groupB,
      metric: resolved.comparisons[0].metric,
      iterations: resolved.iterations,
      seed: resolved.seed,
      bootstrapIterations: resolved.bootstrapIterations
    })
    : buildSenaGroupComparisonSuite({
      dataset: resolved.dataset,
      buildOptions: resolved.buildOptions,
      comparisons: resolved.comparisons,
      defaultGroupField: resolved.defaultGroupField,
      defaultMetric: resolved.defaultMetric,
      iterations: resolved.iterations,
      seed: resolved.seed,
      bootstrapIterations: resolved.bootstrapIterations,
      alpha: resolved.alpha
    });
  const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
  const validationRun = await createEnterpriseValidationRunWithPostgresMirrorAsync(context, {
    teamId,
    projectId,
    preregistrationNote: body.preregistrationNote ? String(body.preregistrationNote) : undefined,
    methodNote: body.methodNote ? String(body.methodNote) : undefined,
    parityEvidence: parseEnterpriseValidationParityEvidence(body.parityEvidence),
    result
  });

  return {
    body: {
      ...result,
      validationRun
    },
    headers: buildEnterpriseValidationRunHeaders(validationRun)
  };
}
