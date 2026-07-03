import { randomBytes } from "node:crypto";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  writeEnterpriseState,
  type SenaEnterpriseDb
} from "./state";
import {
  createEnterprisePostgresExpertReviewAdapterFromEnv,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  requireEnterprisePermission,
  rolePermissions,
  type SenaEnterprisePermission
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  notifyProjectReaders,
  queueEnterpriseNotification
} from "./notifications-delivery";

export type SenaEnterpriseExpertReviewStatus = "requested" | "approved" | "changes-requested" | "rejected";

export type SenaEnterpriseExpertReview = {
  id: string;
  teamId: string;
  projectId: string;
  userId: string;
  status: SenaEnterpriseExpertReviewStatus;
  target: {
    kind: "project" | "validation-run" | "reliability-run" | "claim";
    id?: string;
    label?: string;
  };
  reviewerName: string;
  reviewerRole: string;
  expertiseArea: string;
  claimScope: "exploratory-only" | "claim-ready-with-limits" | "not-claim-ready";
  ratings: {
    dataAdequacy: number;
    methodFit: number;
    interpretationValidity: number;
  };
  strengths: string;
  concerns: string;
  recommendations: string;
  limitations: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
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

function postgresExpertReviewRegistryRequested() {
  return envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase() === "postgres";
}

function postgresExpertReviewRegistryConfigured() {
  return postgresExpertReviewRegistryRequested() && resolveEnterprisePostgresConfig().configured;
}

export function enterpriseExpertReviewRegistryRuntime() {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const requested = postgresExpertReviewRegistryRequested();
  const activeStore = requested && postgresConfig.configured ? "postgres-table" as const : "file-json" as const;
  return {
    activeStore,
    requested,
    postgresConfigured: postgresConfig.configured,
    table: "sena_enterprise_expert_reviews",
    evidence: [
      `expertReviewRegistryStore=${activeStore}`,
      `expertReviewRegistryPostgresRequested=${requested}`,
      `expertReviewRegistryPostgresConfigured=${postgresConfig.configured}`,
      `expertReviewRegistryPostgresTable=sena_enterprise_expert_reviews`,
      `expertReviewRegistryPostgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ]
  };
}

async function upsertExpertReviewsToPostgresIfConfigured(reviews: SenaEnterpriseExpertReview[]) {
  if (reviews.length === 0 || !postgresExpertReviewRegistryConfigured()) return;
  const { adapter, pool } = createEnterprisePostgresExpertReviewAdapterFromEnv({});
  try {
    await adapter.upsertExpertReviews(reviews);
  } finally {
    await pool.end?.();
  }
}

function requireProjectPermissionFromDb(
  db: SenaEnterpriseDb,
  context: SenaEnterpriseSessionContext,
  projectId: string,
  permission: SenaEnterprisePermission
) {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, permission);
  return project;
}

function clampReviewRating(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

function normalizeExpertReviewStatus(value: unknown): SenaEnterpriseExpertReviewStatus {
  if (value === "approved" || value === "changes-requested" || value === "rejected") return value;
  return "requested";
}

function normalizeExpertClaimScope(value: unknown): SenaEnterpriseExpertReview["claimScope"] {
  if (value === "claim-ready-with-limits" || value === "not-claim-ready") return value;
  return "exploratory-only";
}

function validateExpertReviewTarget(db: SenaEnterpriseDb, projectId: string, target: SenaEnterpriseExpertReview["target"]) {
  if (target.kind === "validation-run" && target.id) {
    const run = db.validationRuns.find((candidate) => candidate.id === target.id && candidate.projectId === projectId);
    if (!run) throw new SenaEnterpriseError("Expert review validation target was not found for this project.", 404, "expert_validation_target_not_found");
  }
  if (target.kind === "reliability-run" && target.id) {
    const run = db.reliabilityRuns.find((candidate) => candidate.id === target.id && candidate.projectId === projectId);
    if (!run) throw new SenaEnterpriseError("Expert review reliability target was not found for this project.", 404, "expert_reliability_target_not_found");
  }
}

type CreateEnterpriseExpertReviewInput = {
  projectId: string;
  target?: Partial<SenaEnterpriseExpertReview["target"]>;
  reviewerName?: string;
  reviewerRole?: string;
  expertiseArea?: string;
  status?: SenaEnterpriseExpertReviewStatus;
  claimScope?: SenaEnterpriseExpertReview["claimScope"];
  ratings?: Partial<SenaEnterpriseExpertReview["ratings"]>;
  strengths?: string;
  concerns?: string;
  recommendations?: string;
  limitations?: string;
};

function createEnterpriseExpertReviewInDb(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseExpertReviewInput,
  db: SenaEnterpriseDb
) {
  const project = requireProjectPermissionFromDb(db, context, input.projectId, "expert:review");
  const timestamp = now();
  const target: SenaEnterpriseExpertReview["target"] = {
    kind: input.target?.kind === "validation-run" || input.target?.kind === "reliability-run" || input.target?.kind === "claim"
      ? input.target.kind
      : "project",
    id: input.target?.id?.trim() || undefined,
    label: input.target?.label?.trim() || undefined
  };
  validateExpertReviewTarget(db, project.id, target);
  const status = normalizeExpertReviewStatus(input.status);
  const review: SenaEnterpriseExpertReview = {
    id: id("expert"),
    teamId: project.teamId,
    projectId: project.id,
    userId: context.user.id,
    status,
    target,
    reviewerName: input.reviewerName?.trim() || context.user.name,
    reviewerRole: input.reviewerRole?.trim() || "Domain expert reviewer",
    expertiseArea: input.expertiseArea?.trim() || "SENA interpretation and study-domain review",
    claimScope: normalizeExpertClaimScope(input.claimScope),
    ratings: {
      dataAdequacy: clampReviewRating(input.ratings?.dataAdequacy),
      methodFit: clampReviewRating(input.ratings?.methodFit),
      interpretationValidity: clampReviewRating(input.ratings?.interpretationValidity)
    },
    strengths: input.strengths?.trim() ?? "",
    concerns: input.concerns?.trim() ?? "",
    recommendations: input.recommendations?.trim() ?? "",
    limitations: input.limitations?.trim() ?? "",
    reviewedAt: status === "requested" ? undefined : timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.expertReviews.unshift(review);
  db.expertReviews = db.expertReviews.slice(0, 1000);
  appendAudit(db, {
    event: "expert.review",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope,
      target: review.target.kind,
      dataAdequacy: review.ratings.dataAdequacy,
      methodFit: review.ratings.methodFit,
      interpretationValidity: review.ratings.interpretationValidity
    }
  });
  notifyProjectReaders(db, project, {
    kind: "expert.review",
    title: "Domain expert review recorded",
    body: `${context.user.name} recorded a domain expert review for ${project.title}.`,
    actionUrl: `/workspace/sena?projectId=${encodeURIComponent(project.id)}`,
    excludeUserId: context.user.id,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope
    }
  });
  return review;
}

export function createEnterpriseExpertReview(context: SenaEnterpriseSessionContext, input: CreateEnterpriseExpertReviewInput) {
  const db = readEnterpriseDb();
  const review = createEnterpriseExpertReviewInDb(context, input, db);
  saveDb(db);
  return review;
}

export async function createEnterpriseExpertReviewWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseExpertReviewInput
) {
  const review = createEnterpriseExpertReview(context, input);
  await upsertExpertReviewsToPostgresIfConfigured([review]);
  return review;
}

export async function createEnterpriseExpertReviewWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  input: CreateEnterpriseExpertReviewInput
) {
  const state = await readEnterpriseState();
  const review = createEnterpriseExpertReviewInDb(context, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertExpertReviewsToPostgresIfConfigured([review]);
  return review;
}

type ReviewEnterpriseExpertReviewInput = {
  status?: SenaEnterpriseExpertReviewStatus;
  claimScope?: SenaEnterpriseExpertReview["claimScope"];
  ratings?: Partial<SenaEnterpriseExpertReview["ratings"]>;
  strengths?: string;
  concerns?: string;
  recommendations?: string;
  limitations?: string;
};

function reviewEnterpriseExpertReviewInDb(
  context: SenaEnterpriseSessionContext,
  reviewId: string,
  input: ReviewEnterpriseExpertReviewInput,
  db: SenaEnterpriseDb
) {
  const review = db.expertReviews.find((candidate) => candidate.id === reviewId);
  if (!review) throw new SenaEnterpriseError("Expert review was not found.", 404, "expert_review_not_found");
  requireEnterprisePermission(context, review.teamId, "expert:review");
  const nextStatus = input.status ? normalizeExpertReviewStatus(input.status) : review.status;
  review.status = nextStatus;
  review.claimScope = input.claimScope ? normalizeExpertClaimScope(input.claimScope) : review.claimScope;
  if (input.ratings) {
    review.ratings = {
      dataAdequacy: input.ratings.dataAdequacy === undefined ? review.ratings.dataAdequacy : clampReviewRating(input.ratings.dataAdequacy),
      methodFit: input.ratings.methodFit === undefined ? review.ratings.methodFit : clampReviewRating(input.ratings.methodFit),
      interpretationValidity: input.ratings.interpretationValidity === undefined ? review.ratings.interpretationValidity : clampReviewRating(input.ratings.interpretationValidity)
    };
  }
  if (input.strengths !== undefined) review.strengths = input.strengths.trim();
  if (input.concerns !== undefined) review.concerns = input.concerns.trim();
  if (input.recommendations !== undefined) review.recommendations = input.recommendations.trim();
  if (input.limitations !== undefined) review.limitations = input.limitations.trim();
  review.updatedAt = now();
  if (review.status !== "requested") review.reviewedAt = review.updatedAt;
  appendAudit(db, {
    event: "expert.review",
    userId: context.user.id,
    teamId: review.teamId,
    projectId: review.projectId,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope,
      dataAdequacy: review.ratings.dataAdequacy,
      methodFit: review.ratings.methodFit,
      interpretationValidity: review.ratings.interpretationValidity
    }
  });
  queueEnterpriseNotification(db, {
    kind: "expert.review",
    userId: review.userId,
    teamId: review.teamId,
    projectId: review.projectId,
    title: "Domain expert review updated",
    body: `${context.user.name} marked a domain expert review as ${review.status}.`,
    actionUrl: `/workspace/sena?projectId=${encodeURIComponent(review.projectId)}`,
    detail: {
      expertReviewId: review.id,
      status: review.status,
      claimScope: review.claimScope
    }
  });
  return review;
}

export function reviewEnterpriseExpertReview(
  context: SenaEnterpriseSessionContext,
  reviewId: string,
  input: ReviewEnterpriseExpertReviewInput
) {
  const db = readEnterpriseDb();
  const review = reviewEnterpriseExpertReviewInDb(context, reviewId, input, db);
  saveDb(db);
  return review;
}

export async function reviewEnterpriseExpertReviewWithPostgresMirror(
  context: SenaEnterpriseSessionContext,
  reviewId: string,
  input: ReviewEnterpriseExpertReviewInput
) {
  const review = reviewEnterpriseExpertReview(context, reviewId, input);
  await upsertExpertReviewsToPostgresIfConfigured([review]);
  return review;
}

export async function reviewEnterpriseExpertReviewWithPostgresMirrorAsync(
  context: SenaEnterpriseSessionContext,
  reviewId: string,
  input: ReviewEnterpriseExpertReviewInput
) {
  const state = await readEnterpriseState();
  const review = reviewEnterpriseExpertReviewInDb(context, reviewId, input, state.db);
  await writeEnterpriseState(state, state.db);
  await upsertExpertReviewsToPostgresIfConfigured([review]);
  return review;
}

export function listEnterpriseExpertReviews(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  return listEnterpriseExpertReviewsFromDb(context, db, input);
}

export async function listEnterpriseExpertReviewsAsync(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const state = await readEnterpriseState();
  return listEnterpriseExpertReviewsFromDb(context, state.db, input);
}

function listEnterpriseExpertReviewsFromDb(context: SenaEnterpriseSessionContext, db: SenaEnterpriseDb, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("project:read"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "project:read");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "project:read");
    teamIds = new Set([project.teamId]);
  }

  return db.expertReviews
    .filter((review) => teamIds.has(review.teamId))
    .filter((review) => !input.projectId || review.projectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
