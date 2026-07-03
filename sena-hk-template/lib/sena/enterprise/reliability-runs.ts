import { randomBytes } from "node:crypto";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  writeEnterpriseState
} from "./state";
import {
  createEnterprisePostgresAdjudicationAdapterFromEnv,
  createEnterprisePostgresReliabilityRunAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import type { SenaEnterpriseAdjudicationRecord } from "./team-collaboration";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  queueEnterpriseNotification
} from "./notifications-delivery";
import type { SenaReliabilityDashboard } from "../reliability";
import {
  prepareSenaReliabilityJsonRequest,
  type SenaReliabilityJsonRequest
} from "../reliability-api";
import { createSenaSchemaPayload, SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaCodingReliabilityReview } from "../types";

export type SenaEnterpriseReliabilityRunStatus = "pending-review" | "pending-adjudication" | "approved" | "rejected";

export type SenaEnterpriseReliabilityAdjudicationCoverage = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage;
  queuedDisagreements: number;
  resolvedDisagreements: number;
  unresolvedDisagreements: number;
  coverageRate: number;
  decisions: {
    include: number;
    exclude: number;
    revise: number;
  };
  updatedAt: string;
};

export type SenaEnterpriseReliabilityRun = {
  id: string;
  teamId: string;
  projectId?: string;
  userId: string;
  status: SenaEnterpriseReliabilityRunStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  reviewer: string;
  fileCount: number;
  annotationCount: number;
  coderCount: number;
  itemCount: number;
  codeCount: number;
  meanPairwiseKappa: number;
  krippendorffAlphaNominal: number;
  disagreementCount: number;
  inputFiles: Array<{
    name: string;
    size: number;
    sha256: string;
  }>;
  dashboard: SenaReliabilityDashboard;
  adjudicationCoverage: SenaEnterpriseReliabilityAdjudicationCoverage;
  reviewPatch: Partial<SenaCodingReliabilityReview>;
  createdAt: string;
};

export type SenaEnterpriseReliabilityAdjudicationResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReliabilityAdjudication;
  reliabilityRunId: string;
  projectId: string;
  teamId: string;
  decision: SenaEnterpriseAdjudicationRecord["decision"];
  summary: {
    queuedDisagreements: number;
    created: number;
    skippedExisting: number;
    resolvedDisagreements: number;
    unresolvedDisagreements: number;
    coverageRate: number;
  };
  reliabilityRun: SenaEnterpriseReliabilityRun;
  adjudications: SenaEnterpriseAdjudicationRecord[];
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

function postgresReliabilityRunRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresReliabilityRunRegistryConfigured() {
  return postgresReliabilityRunRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

export function enterpriseReliabilityRunRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresReliabilityRunRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_reliability_runs",
    evidence: [
      `reliabilityRunRegistryStore=${activeStore}`,
      `reliabilityRunRegistryPostgresRequested=${requested}`,
      `reliabilityRunRegistryPostgresConfigured=${postgresConfig.configured}`,
      `reliabilityRunRegistryPostgresTable=sena_enterprise_reliability_runs`,
      `reliabilityRunRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

async function upsertReliabilityRunsToPostgresIfConfigured(runs: SenaEnterpriseReliabilityRun[]) {
  if (runs.length === 0 || !postgresReliabilityRunRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresReliabilityRunAdapterFromEnv({});
  try {
    await adapter.upsertReliabilityRuns(runs);
  } finally {
    await pool.end?.();
  }
}

async function upsertAdjudicationsToPostgresIfConfigured(records: SenaEnterpriseAdjudicationRecord[]) {
  if (records.length === 0 || !postgresReliabilityRunRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresAdjudicationAdapterFromEnv({});
  try {
    await adapter.upsertAdjudications(records);
  } finally {
    await pool.end?.();
  }
}

function roundedCoverageRate(resolved: number, queued: number) {
  if (queued === 0) return 1;
  return Number((resolved / queued).toFixed(4));
}

function reliabilityDisagreementKey(itemId: string, codeId: string) {
  return `${itemId}::${codeId}`;
}

function buildReliabilityAdjudicationCoverage(
  run: Pick<SenaEnterpriseReliabilityRun, "id" | "createdAt" | "reviewedAt" | "dashboard">,
  adjudications: SenaEnterpriseAdjudicationRecord[]
): SenaEnterpriseReliabilityAdjudicationCoverage {
  const queueKeys = new Set((run.dashboard.adjudicationQueue ?? []).map((disagreement) => (
    reliabilityDisagreementKey(disagreement.itemId, disagreement.codeId)
  )));
  const latestByDisagreement = new Map<string, SenaEnterpriseAdjudicationRecord>();
  adjudications
    .filter((record) => record.reliabilityRunId === run.id)
    .filter((record) => queueKeys.has(reliabilityDisagreementKey(record.itemId, record.codeId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((record) => {
      latestByDisagreement.set(reliabilityDisagreementKey(record.itemId, record.codeId), record);
    });

  const decisions = { include: 0, exclude: 0, revise: 0 };
  let updatedAt = run.reviewedAt ?? run.createdAt;
  for (const record of latestByDisagreement.values()) {
    decisions[record.decision] += 1;
    if (record.createdAt.localeCompare(updatedAt) > 0) updatedAt = record.createdAt;
  }

  const queuedDisagreements = queueKeys.size;
  const resolvedDisagreements = latestByDisagreement.size;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
    queuedDisagreements,
    resolvedDisagreements,
    unresolvedDisagreements: Math.max(queuedDisagreements - resolvedDisagreements, 0),
    coverageRate: roundedCoverageRate(resolvedDisagreements, queuedDisagreements),
    decisions,
    updatedAt
  };
}

function refreshReliabilityAdjudicationCoverage(
  db: ReturnType<typeof readEnterpriseDb>,
  run: SenaEnterpriseReliabilityRun
) {
  run.adjudicationCoverage = buildReliabilityAdjudicationCoverage(run, db.adjudications ?? []);
  return run.adjudicationCoverage;
}

type CreateEnterpriseReliabilityRunInput = {
  teamId: string;
  projectId?: string;
  reviewer: string;
  fileCount: number;
  annotationCount: number;
  inputFiles: SenaEnterpriseReliabilityRun["inputFiles"];
  dashboard: SenaReliabilityDashboard;
  reviewPatch: Partial<SenaCodingReliabilityReview>;
};

function createEnterpriseReliabilityRunInDb(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseReliabilityRunInput,
  db: ReturnType<typeof readEnterpriseDb>
) {
  requireEnterprisePermission(context, input.teamId, "reliability:adjudicate");
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    if (project.teamId !== input.teamId) {
      throw new SenaEnterpriseError("Reliability run team does not match the project team.", 400, "reliability_project_team_mismatch");
    }
    requireEnterprisePermission(context, project.teamId, "reliability:adjudicate");
  }
  const timestamp = now();
  const run: SenaEnterpriseReliabilityRun = {
    id: id("rel"),
    teamId: input.teamId,
    projectId: input.projectId,
    userId: context.user.id,
    status: input.dashboard.disagreementCount > 0 ? "pending-adjudication" : "pending-review",
    reviewer: input.reviewer.trim() || context.user.name,
    fileCount: input.fileCount,
    annotationCount: input.annotationCount,
    coderCount: input.dashboard.coderCount,
    itemCount: input.dashboard.itemCount,
    codeCount: input.dashboard.codeCount,
    meanPairwiseKappa: input.dashboard.meanPairwiseKappa,
    krippendorffAlphaNominal: input.dashboard.krippendorffAlphaNominal,
    disagreementCount: input.dashboard.disagreementCount,
    inputFiles: input.inputFiles,
    dashboard: input.dashboard,
    adjudicationCoverage: {
      schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
      queuedDisagreements: 0,
      resolvedDisagreements: 0,
      unresolvedDisagreements: 0,
      coverageRate: 1,
      decisions: { include: 0, exclude: 0, revise: 0 },
      updatedAt: timestamp
    },
    reviewPatch: input.reviewPatch,
    createdAt: timestamp
  };
  refreshReliabilityAdjudicationCoverage(db, run);
  db.reliabilityRuns.unshift(run);
  db.reliabilityRuns = db.reliabilityRuns.slice(0, 1000);
  appendAudit(db, {
    event: "reliability.run",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      reliabilityRunId: run.id,
      files: run.fileCount,
      annotations: run.annotationCount,
      coders: run.coderCount,
      items: run.itemCount,
      kappa: run.meanPairwiseKappa,
      alpha: run.krippendorffAlphaNominal,
      adjudicationCoverage: run.adjudicationCoverage.coverageRate,
      unresolvedDisagreements: run.adjudicationCoverage.unresolvedDisagreements
    }
  });
  return run;
}

export function createEnterpriseReliabilityRun(context: SenaEnterpriseSessionContext, input: CreateEnterpriseReliabilityRunInput) {
  const db = readEnterpriseDb();
  const run = createEnterpriseReliabilityRunInDb(context, input, db);
  saveDb(db);
  return run;
}

export async function createEnterpriseReliabilityRunWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseReliabilityRunInput
) {
  const run = createEnterpriseReliabilityRun(context, input);
  await upsertReliabilityRunsToPostgresIfConfigured([run]);
  return run;
}

export async function createEnterpriseReliabilityRunWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseReliabilityRunInput
) {
  const state = await readEnterpriseState();
  const run = createEnterpriseReliabilityRunInDb(context, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertReliabilityRunsToPostgresIfConfigured([run]);
  return run;
}

type CreateEnterpriseReliabilityAdjudicationsInput = {
  decision?: SenaEnterpriseAdjudicationRecord["decision"];
  notes?: string;
  limit?: number;
};

function createEnterpriseReliabilityAdjudicationsInDb(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: CreateEnterpriseReliabilityAdjudicationsInput,
  db: ReturnType<typeof readEnterpriseDb>
): SenaEnterpriseReliabilityAdjudicationResult {
  const run = db.reliabilityRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new SenaEnterpriseError("Reliability run was not found.", 404, "reliability_run_not_found");
  if (!run.projectId) {
    throw new SenaEnterpriseError("Reliability run must be linked to a project before adjudication records can be created.", 400, "reliability_project_required");
  }
  const project = db.projects.find((candidate) => candidate.id === run.projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  if (project.teamId !== run.teamId) {
    throw new SenaEnterpriseError("Reliability run team does not match the project team.", 400, "reliability_project_team_mismatch");
  }
  requireEnterprisePermission(context, run.teamId, "reliability:adjudicate");

  const decision = input.decision === "include" || input.decision === "exclude" || input.decision === "revise"
    ? input.decision
    : "revise";
  const queue = run.dashboard.adjudicationQueue.slice(0, Math.min(Math.max(Math.trunc(input.limit ?? run.dashboard.adjudicationQueue.length), 1), 200));
  const adjudications: SenaEnterpriseAdjudicationRecord[] = [];
  let skippedExisting = 0;
  const timestamp = now();
  for (const disagreement of queue) {
    const existing = db.adjudications.find((record) => (
      record.projectId === run.projectId &&
      record.reliabilityRunId === run.id &&
      record.itemId === disagreement.itemId &&
      record.codeId === disagreement.codeId
    ));
    if (existing) {
      skippedExisting += 1;
      continue;
    }
    const record: SenaEnterpriseAdjudicationRecord = {
      id: id("adj"),
      projectId: run.projectId,
      teamId: run.teamId,
      reliabilityRunId: run.id,
      itemId: disagreement.itemId,
      codeId: disagreement.codeId,
      decision,
      reviewerId: context.user.id,
      notes: input.notes?.trim() || `Generated from reliability run ${run.id} disagreement queue.`,
      coderValues: disagreement.values,
      createdAt: timestamp
    };
    db.adjudications.push(record);
    adjudications.push(record);
  }
  const coverage = refreshReliabilityAdjudicationCoverage(db, run);

  appendAudit(db, {
    event: "reliability.adjudicate",
    userId: context.user.id,
    teamId: run.teamId,
    projectId: run.projectId,
    detail: {
      reliabilityRunId: run.id,
      decision,
      queued: run.dashboard.adjudicationQueue.length,
      created: adjudications.length,
      skippedExisting,
      resolvedDisagreements: coverage.resolvedDisagreements,
      unresolvedDisagreements: coverage.unresolvedDisagreements,
      coverageRate: coverage.coverageRate
    }
  });
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReliabilityAdjudication,
    reliabilityRunId: run.id,
    projectId: run.projectId,
    teamId: run.teamId,
    decision,
    summary: {
      queuedDisagreements: run.dashboard.adjudicationQueue.length,
      created: adjudications.length,
      skippedExisting,
      resolvedDisagreements: coverage.resolvedDisagreements,
      unresolvedDisagreements: coverage.unresolvedDisagreements,
      coverageRate: coverage.coverageRate
    },
    reliabilityRun: run,
    adjudications
  };
}

export function createEnterpriseReliabilityAdjudications(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: CreateEnterpriseReliabilityAdjudicationsInput = {}
): SenaEnterpriseReliabilityAdjudicationResult {
  const db = readEnterpriseDb();
  const result = createEnterpriseReliabilityAdjudicationsInDb(context, runId, input, db);
  saveDb(db);
  return result;
}

export async function createEnterpriseReliabilityAdjudicationsWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: CreateEnterpriseReliabilityAdjudicationsInput = {}
) {
  const result = createEnterpriseReliabilityAdjudications(context, runId, input);
  await upsertAdjudicationsToPostgresIfConfigured(result.adjudications);
  await upsertReliabilityRunsToPostgresIfConfigured([result.reliabilityRun]);
  return result;
}

export async function createEnterpriseReliabilityAdjudicationsWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: CreateEnterpriseReliabilityAdjudicationsInput = {}
) {
  const state = await readEnterpriseState();
  const result = createEnterpriseReliabilityAdjudicationsInDb(context, runId, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertAdjudicationsToPostgresIfConfigured(result.adjudications);
  await upsertReliabilityRunsToPostgresIfConfigured([result.reliabilityRun]);
  return result;
}

type ReviewEnterpriseReliabilityRunInput = {
  status: Extract<SenaEnterpriseReliabilityRunStatus, "pending-adjudication" | "approved" | "rejected">;
  notes?: string;
};

function reviewEnterpriseReliabilityRunInDb(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: ReviewEnterpriseReliabilityRunInput,
  db: ReturnType<typeof readEnterpriseDb>
) {
  const run = db.reliabilityRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new SenaEnterpriseError("Reliability run was not found.", 404, "reliability_run_not_found");
  requireEnterprisePermission(context, run.teamId, "reliability:adjudicate");
  const coverage = refreshReliabilityAdjudicationCoverage(db, run);

  if (input.status === "approved" && coverage.unresolvedDisagreements > 0) {
    throw new SenaEnterpriseError("Reliability approval requires all queued reliability disagreements to be adjudicated for this run.", 400, "reliability_adjudication_coverage_required");
  }

  run.status = input.status;
  run.reviewedBy = context.user.id;
  run.reviewedAt = now();
  run.reviewNotes = input.notes?.trim() ?? "";
  refreshReliabilityAdjudicationCoverage(db, run);
  appendAudit(db, {
    event: "reliability.review",
    userId: context.user.id,
    teamId: run.teamId,
    projectId: run.projectId,
    detail: {
      reliabilityRunId: run.id,
      status: run.status,
      disagreements: run.disagreementCount,
      adjudicationCoverage: run.adjudicationCoverage.coverageRate,
      unresolvedDisagreements: run.adjudicationCoverage.unresolvedDisagreements,
      reviewer: context.user.name
    }
  });
  queueEnterpriseNotification(db, {
    kind: "reliability.review",
    userId: run.userId,
    teamId: run.teamId,
    projectId: run.projectId,
    title: "Coding reliability review updated",
    body: `${context.user.name} marked a reliability run as ${run.status}.`,
    actionUrl: run.projectId ? `/workspace/sena?projectId=${encodeURIComponent(run.projectId)}` : "/workspace/sena",
    detail: {
      reliabilityRunId: run.id,
      status: run.status,
      adjudicationCoverage: run.adjudicationCoverage.coverageRate,
      unresolvedDisagreements: run.adjudicationCoverage.unresolvedDisagreements,
      reviewerId: context.user.id
    }
  });
  return run;
}

export function reviewEnterpriseReliabilityRun(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: ReviewEnterpriseReliabilityRunInput
) {
  const db = readEnterpriseDb();
  const run = reviewEnterpriseReliabilityRunInDb(context, runId, input, db);
  saveDb(db);
  return run;
}

export async function reviewEnterpriseReliabilityRunWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: ReviewEnterpriseReliabilityRunInput
) {
  const run = reviewEnterpriseReliabilityRun(context, runId, input);
  await upsertReliabilityRunsToPostgresIfConfigured([run]);
  return run;
}

export async function reviewEnterpriseReliabilityRunWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  runId: string,
  input: ReviewEnterpriseReliabilityRunInput
) {
  const state = await readEnterpriseState();
  const run = reviewEnterpriseReliabilityRunInDb(context, runId, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertReliabilityRunsToPostgresIfConfigured([run]);
  return run;
}

export function listEnterpriseReliabilityRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  return listEnterpriseReliabilityRunsFromDb(context, db, input);
}

export async function listEnterpriseReliabilityRunsAsync(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const state = await readEnterpriseState();
  return listEnterpriseReliabilityRunsFromDb(context, state.db, input);
}

function listEnterpriseReliabilityRunsFromDb(context: SenaEnterpriseSessionContext, db: ReturnType<typeof readEnterpriseDb>, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("reliability:adjudicate"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "reliability:adjudicate");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "reliability:adjudicate");
    teamIds = new Set([project.teamId]);
  }

  return db.reliabilityRuns
    .filter((run) => teamIds.has(run.teamId))
    .filter((run) => !input.projectId || run.projectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type SenaEnterpriseReliabilityRunHeaderSource = Pick<
  SenaEnterpriseReliabilityRun,
  "id" | "status" | "projectId" | "meanPairwiseKappa" | "krippendorffAlphaNominal" | "adjudicationCoverage"
>;

export function buildEnterpriseReliabilityRunHeaders(run: SenaEnterpriseReliabilityRunHeaderSource) {
  return {
    "x-sena-reliability-run-id": run.id,
    "x-sena-reliability-status": run.status,
    ...(run.projectId ? { "x-sena-project-id": run.projectId } : {}),
    "x-sena-reliability-coverage-rate": String(run.adjudicationCoverage.coverageRate),
    "x-sena-unresolved-disagreements": String(run.adjudicationCoverage.unresolvedDisagreements),
    "x-sena-mean-pairwise-kappa": String(run.meanPairwiseKappa),
    "x-sena-krippendorff-alpha": String(run.krippendorffAlphaNominal)
  };
}

export function buildEnterpriseReliabilityRunListResponse(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string },
  listRuns: typeof listEnterpriseReliabilityRuns = listEnterpriseReliabilityRuns
) {
  return {
    body: createSenaSchemaPayload("reliabilityRunList", {
      reliabilityRuns: listRuns(context, input)
    })
  };
}

export async function buildEnterpriseReliabilityRunListResponseAsync(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string }
) {
  return {
    body: createSenaSchemaPayload("reliabilityRunList", {
      reliabilityRuns: await listEnterpriseReliabilityRunsAsync(context, input)
    })
  };
}

export function buildEnterpriseReliabilityRunReviewResponse(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; status?: unknown; notes?: unknown },
  reviewRun: typeof reviewEnterpriseReliabilityRun = reviewEnterpriseReliabilityRun
) {
  const status: Extract<SenaEnterpriseReliabilityRunStatus, "pending-adjudication" | "approved" | "rejected"> =
    body.status === "approved" || body.status === "rejected" ? body.status : "pending-adjudication";
  const reliabilityRun = reviewRun(context, String(body.runId ?? ""), {
    status,
    notes: body.notes ? String(body.notes) : undefined
  });
  return {
    body: createSenaSchemaPayload("reliabilityRunReview", {
      reliabilityRun
    }),
    headers: buildEnterpriseReliabilityRunHeaders(reliabilityRun)
  };
}

export async function buildEnterpriseReliabilityRunReviewResponseWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; status?: unknown; notes?: unknown }
) {
  const status: Extract<SenaEnterpriseReliabilityRunStatus, "pending-adjudication" | "approved" | "rejected"> =
    body.status === "approved" || body.status === "rejected" ? body.status : "pending-adjudication";
  const reliabilityRun = await reviewEnterpriseReliabilityRunWithPostgresMirror(context, String(body.runId ?? ""), {
    status,
    notes: body.notes ? String(body.notes) : undefined
  });
  return {
    body: createSenaSchemaPayload("reliabilityRunReview", {
      reliabilityRun
    }),
    headers: buildEnterpriseReliabilityRunHeaders(reliabilityRun)
  };
}

export async function buildEnterpriseReliabilityRunReviewResponseWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; status?: unknown; notes?: unknown }
) {
  const status: Extract<SenaEnterpriseReliabilityRunStatus, "pending-adjudication" | "approved" | "rejected"> =
    body.status === "approved" || body.status === "rejected" ? body.status : "pending-adjudication";
  const reliabilityRun = await reviewEnterpriseReliabilityRunWithPostgresMirrorAsync(context, String(body.runId ?? ""), {
    status,
    notes: body.notes ? String(body.notes) : undefined
  });
  return {
    body: createSenaSchemaPayload("reliabilityRunReview", {
      reliabilityRun
    }),
    headers: buildEnterpriseReliabilityRunHeaders(reliabilityRun)
  };
}

export function buildEnterpriseReliabilityAdjudicationResponse(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; decision?: unknown; notes?: unknown; limit?: unknown },
  adjudicate: typeof createEnterpriseReliabilityAdjudications = createEnterpriseReliabilityAdjudications
) {
  const decision = body.decision === "include" || body.decision === "exclude" || body.decision === "revise"
    ? body.decision
    : "revise";
  const adjudication: SenaEnterpriseReliabilityAdjudicationResult = adjudicate(context, String(body.runId ?? ""), {
    decision,
    notes: body.notes ? String(body.notes) : undefined,
    limit: body.limit ? Number(body.limit) : undefined
  });
  return {
    body: createSenaSchemaPayload("reliabilityAdjudicationResponse", {
      adjudication
    }),
    status: 201,
    headers: buildEnterpriseReliabilityRunHeaders(adjudication.reliabilityRun)
  };
}

export async function buildEnterpriseReliabilityAdjudicationResponseWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; decision?: unknown; notes?: unknown; limit?: unknown }
) {
  const decision = body.decision === "include" || body.decision === "exclude" || body.decision === "revise"
    ? body.decision
    : "revise";
  const adjudication = await createEnterpriseReliabilityAdjudicationsWithPostgresMirror(context, String(body.runId ?? ""), {
    decision,
    notes: body.notes ? String(body.notes) : undefined,
    limit: body.limit ? Number(body.limit) : undefined
  });
  return {
    body: createSenaSchemaPayload("reliabilityAdjudicationResponse", {
      adjudication
    }),
    status: 201,
    headers: buildEnterpriseReliabilityRunHeaders(adjudication.reliabilityRun)
  };
}

export async function buildEnterpriseReliabilityAdjudicationResponseWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; decision?: unknown; notes?: unknown; limit?: unknown }
) {
  const decision = body.decision === "include" || body.decision === "exclude" || body.decision === "revise"
    ? body.decision
    : "revise";
  const adjudication = await createEnterpriseReliabilityAdjudicationsWithPostgresMirrorAsync(context, String(body.runId ?? ""), {
    decision,
    notes: body.notes ? String(body.notes) : undefined,
    limit: body.limit ? Number(body.limit) : undefined
  });
  return {
    body: createSenaSchemaPayload("reliabilityAdjudicationResponse", {
      adjudication
    }),
    status: 201,
    headers: buildEnterpriseReliabilityRunHeaders(adjudication.reliabilityRun)
  };
}

export function buildEnterpriseReliabilityRunResponse(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseReliabilityRunInput,
  adapters: {
    createReliabilityRun?: typeof createEnterpriseReliabilityRun;
  } = {},
  extraPayload: Record<string, unknown> = {}
) {
  const reliabilityRun = (adapters.createReliabilityRun ?? createEnterpriseReliabilityRun)(context, input);
  return {
    body: createSenaSchemaPayload("reliabilityResponse", {
      ...extraPayload,
      dashboard: input.dashboard,
      reviewPatch: input.reviewPatch,
      reliabilityRun
    }),
    headers: buildEnterpriseReliabilityRunHeaders(reliabilityRun)
  };
}

export async function buildEnterpriseReliabilityRunResponseWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseReliabilityRunInput,
  extraPayload: Record<string, unknown> = {}
) {
  const reliabilityRun = await createEnterpriseReliabilityRunWithPostgresMirror(context, input);
  return {
    body: createSenaSchemaPayload("reliabilityResponse", {
      ...extraPayload,
      dashboard: input.dashboard,
      reviewPatch: input.reviewPatch,
      reliabilityRun
    }),
    headers: buildEnterpriseReliabilityRunHeaders(reliabilityRun)
  };
}

export async function buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseReliabilityRunInput,
  extraPayload: Record<string, unknown> = {}
) {
  const reliabilityRun = await createEnterpriseReliabilityRunWithPostgresMirrorAsync(context, input);
  return {
    body: createSenaSchemaPayload("reliabilityResponse", {
      ...extraPayload,
      dashboard: input.dashboard,
      reviewPatch: input.reviewPatch,
      reliabilityRun
    }),
    headers: buildEnterpriseReliabilityRunHeaders(reliabilityRun)
  };
}

export function buildEnterpriseReliabilityJsonRunResponse(
  context: SenaEnterpriseSessionContext,
  payload: SenaReliabilityJsonRequest,
  adapters: {
    prepareJsonRequest?: typeof prepareSenaReliabilityJsonRequest;
    createReliabilityRun?: typeof createEnterpriseReliabilityRun;
  } = {}
) {
  const prepared = (adapters.prepareJsonRequest ?? prepareSenaReliabilityJsonRequest)(payload, {
    defaultReviewer: context.user.name
  });
  return buildEnterpriseReliabilityRunResponse(context, {
    teamId: prepared.teamId || context.teams[0]?.id || "",
    projectId: prepared.projectId,
    reviewer: prepared.reviewer,
    fileCount: prepared.fileCount,
    annotationCount: prepared.annotationCount,
    inputFiles: prepared.inputFiles,
    dashboard: prepared.dashboard,
    reviewPatch: prepared.reviewPatch
  }, {
    createReliabilityRun: adapters.createReliabilityRun
  }, {
      requestSchemaVersion: SENA_SCHEMA_VERSIONS.reliabilityJsonRequest,
      source: prepared.source
  });
}

export async function buildEnterpriseReliabilityJsonRunResponseWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  payload: SenaReliabilityJsonRequest,
  adapters: {
    prepareJsonRequest?: typeof prepareSenaReliabilityJsonRequest;
  } = {}
) {
  const prepared = (adapters.prepareJsonRequest ?? prepareSenaReliabilityJsonRequest)(payload, {
    defaultReviewer: context.user.name
  });
  return buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync(context, {
    teamId: prepared.teamId || context.teams[0]?.id || "",
    projectId: prepared.projectId,
    reviewer: prepared.reviewer,
    fileCount: prepared.fileCount,
    annotationCount: prepared.annotationCount,
    inputFiles: prepared.inputFiles,
    dashboard: prepared.dashboard,
    reviewPatch: prepared.reviewPatch
  }, {
    requestSchemaVersion: SENA_SCHEMA_VERSIONS.reliabilityJsonRequest,
    source: prepared.source
  });
}

export async function buildEnterpriseReliabilityJsonRunResponseWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  payload: SenaReliabilityJsonRequest,
  adapters: {
    prepareJsonRequest?: typeof prepareSenaReliabilityJsonRequest;
  } = {}
) {
  const prepared = (adapters.prepareJsonRequest ?? prepareSenaReliabilityJsonRequest)(payload, {
    defaultReviewer: context.user.name
  });
  return buildEnterpriseReliabilityRunResponseWithPostgresMirror(context, {
    teamId: prepared.teamId || context.teams[0]?.id || "",
    projectId: prepared.projectId,
    reviewer: prepared.reviewer,
    fileCount: prepared.fileCount,
    annotationCount: prepared.annotationCount,
    inputFiles: prepared.inputFiles,
    dashboard: prepared.dashboard,
    reviewPatch: prepared.reviewPatch
  }, {
    requestSchemaVersion: SENA_SCHEMA_VERSIONS.reliabilityJsonRequest,
    source: prepared.source
  });
}
