import { createHash, randomBytes } from "node:crypto";
import { canonicalSenaJson } from "../canonical-json";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { importSenaProjectSnapshot } from "../snapshot";
import type { SenaProjectSnapshot } from "../types";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import {
  appendAudit,
  recordEnterpriseAudit
} from "./ops-audit";
import {
  readEnterpriseState,
  readEnterpriseDb,
  writeEnterpriseState,
  writeEnterpriseDb
} from "./state";

export type SenaEnterpriseProject = {
  id: string;
  teamId: string;
  ownerId: string;
  currentVersion: number;
  title: string;
  description: string;
  snapshot: SenaProjectSnapshot;
  datasetCounts: {
    people: number;
    interactions: number;
    utterances: number;
    codedSegments: number;
    codes: number;
  };
  activeWindowLabel: string;
  claimUse: string;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseProjectRevision = {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  version: number;
  summary: string;
  /** Present on current revisions; absent legacy rows retain snapshot-only restore semantics. */
  title?: string;
  /** Present on current revisions; absent legacy rows retain snapshot-only restore semantics. */
  description?: string;
  snapshot: SenaProjectSnapshot;
  datasetCounts: SenaEnterpriseProject["datasetCounts"];
  activeWindowLabel: string;
  claimUse: string;
  createdAt: string;
};

/**
 * Immutable analytical-revision identity captured by enterprise evidence records.
 * The field remains optional on persisted evidence types so historical records can
 * still be read, but an absent or stale binding is never claim-ready.
 */
export type SenaEnterpriseProjectEvidenceBinding = {
  projectId: string;
  projectVersion: number;
  snapshotSha256: string;
};

export type SenaEnterpriseProjectDeletion = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.projectDelete;
  projectId: string;
  teamId: string;
  projectVersion: number;
  deleted: true;
  deletedAt: string;
  snapshotSha256: string;
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function enterpriseProjectBindingSnapshotSha256(snapshot: SenaProjectSnapshot) {
  return createHash("sha256").update(canonicalSenaJson(snapshot) ?? "null").digest("hex");
}

export function buildEnterpriseProjectEvidenceBinding(
  project: Pick<SenaEnterpriseProject, "id" | "currentVersion" | "snapshot">
): SenaEnterpriseProjectEvidenceBinding {
  return {
    projectId: project.id,
    projectVersion: project.currentVersion,
    snapshotSha256: enterpriseProjectBindingSnapshotSha256(project.snapshot)
  };
}

export function enterpriseProjectEvidenceBindingMatches(
  binding: SenaEnterpriseProjectEvidenceBinding | undefined,
  project: Pick<SenaEnterpriseProject, "id" | "currentVersion" | "snapshot">
) {
  return binding?.projectId === project.id &&
    binding.projectVersion === project.currentVersion &&
    binding.snapshotSha256 === enterpriseProjectBindingSnapshotSha256(project.snapshot);
}

function snapshotCounts(snapshot: SenaProjectSnapshot) {
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  return {
    people: source.people.length,
    interactions: source.interactions.length,
    utterances: source.utterances.length,
    codedSegments: source.coded_segments.length,
    codes: source.codebook.length
  };
}

function revisionSummary(snapshot: SenaProjectSnapshot) {
  const counts = snapshotCounts(snapshot);
  return `${counts.people} people, ${counts.codes} codes, ${counts.utterances} utterances; claim=${snapshot.report.claimReadinessGate.claimUse}`;
}

function buildProjectRevision(project: SenaEnterpriseProject, userId: string, version: number, summary?: string): SenaEnterpriseProjectRevision {
  return {
    id: id("rev"),
    projectId: project.id,
    teamId: project.teamId,
    userId,
    version,
    summary: summary?.trim() || revisionSummary(project.snapshot),
    title: project.title,
    description: project.description,
    snapshot: project.snapshot,
    datasetCounts: project.datasetCounts,
    activeWindowLabel: project.activeWindowLabel,
    claimUse: project.claimUse,
    createdAt: now()
  };
}

function assertEnterpriseProjectExpectedVersion(project: SenaEnterpriseProject, expectedVersion?: number) {
  if (expectedVersion === undefined) return;
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new SenaEnterpriseError("Project expectedVersion must be a positive integer.", 400, "project_invalid_expected_version");
  }
  if (project.currentVersion !== expectedVersion) {
    throw new SenaEnterpriseError(
      `Project version conflict: current version is ${project.currentVersion}, but the update was based on version ${expectedVersion}.`,
      409,
      "project_version_conflict"
    );
  }
}

function listEnterpriseProjectsFromDb(context: SenaEnterpriseSessionContext, db: ReturnType<typeof readEnterpriseDb>) {
  const allowedTeamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("project:read"))
    .map((membership) => membership.teamId));

  return db.projects
    .filter((project) => allowedTeamIds.has(project.teamId))
    .map(({ snapshot: _snapshot, ...project }) => project)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listEnterpriseProjects(context: SenaEnterpriseSessionContext) {
  return listEnterpriseProjectsFromDb(context, readEnterpriseDb());
}

export async function listEnterpriseProjectsAsync(context: SenaEnterpriseSessionContext) {
  const state = await readEnterpriseState();
  return listEnterpriseProjectsFromDb(context, state.db);
}

export function createEnterpriseProject(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  title: string;
  description?: string;
  snapshot: SenaProjectSnapshot;
}) {
  requireEnterprisePermission(context, input.teamId, "project:create");
  const snapshot = importSenaProjectSnapshot(input.snapshot);
  const db = readEnterpriseDb();
  const timestamp = now();
  const project: SenaEnterpriseProject = {
    id: id("project"),
    teamId: input.teamId,
    ownerId: context.user.id,
    currentVersion: 1,
    title: input.title.trim() || snapshot.title || "Untitled SENA Project",
    description: input.description?.trim() ?? "",
    snapshot,
    datasetCounts: snapshotCounts(snapshot),
    activeWindowLabel: snapshot.source.activeTemporalWindow?.label ?? "Full conversation",
    claimUse: snapshot.report.claimReadinessGate.claimUse,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.projects.push(project);
  db.projectRevisions.push(buildProjectRevision(project, context.user.id, 1, "Initial project snapshot"));
  writeEnterpriseDb(db);
  recordEnterpriseAudit({
    event: "project.create",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: project.id,
    detail: { title: project.title }
  });
  return project;
}

export async function createEnterpriseProjectAsync(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  title: string;
  description?: string;
  snapshot: SenaProjectSnapshot;
}) {
  requireEnterprisePermission(context, input.teamId, "project:create");
  const snapshot = importSenaProjectSnapshot(input.snapshot);
  const state = await readEnterpriseState();
  const db = state.db;
  const timestamp = now();
  const project: SenaEnterpriseProject = {
    id: id("project"),
    teamId: input.teamId,
    ownerId: context.user.id,
    currentVersion: 1,
    title: input.title.trim() || snapshot.title || "Untitled SENA Project",
    description: input.description?.trim() ?? "",
    snapshot,
    datasetCounts: snapshotCounts(snapshot),
    activeWindowLabel: snapshot.source.activeTemporalWindow?.label ?? "Full conversation",
    claimUse: snapshot.report.claimReadinessGate.claimUse,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.projects.push(project);
  db.projectRevisions.push(buildProjectRevision(project, context.user.id, 1, "Initial project snapshot"));
  appendAudit(db, {
    event: "project.create",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: project.id,
    detail: { title: project.title }
  });
  await writeEnterpriseState(state, db);
  return project;
}

export function getEnterpriseProject(context: SenaEnterpriseSessionContext, projectId: string) {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:read");
  writeEnterpriseDb(db);
  recordEnterpriseAudit({
    event: "project.read",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: { title: project.title }
  });
  return project;
}

export async function getEnterpriseProjectAsync(context: SenaEnterpriseSessionContext, projectId: string) {
  const state = await readEnterpriseState();
  const db = state.db;
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:read");
  appendAudit(db, {
    event: "project.read",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: { title: project.title }
  });
  await writeEnterpriseState(state, db);
  return project;
}

/**
 * Resolves a project and enforces tenant read permission without appending the
 * audited `project.read` event or writing enterprise state. Resource-admission
 * paths use this lookup before they know a request is safe to execute.
 */
export async function getEnterpriseProjectReadOnlyAsync(
  context: SenaEnterpriseSessionContext,
  projectId: string
) {
  const state = await readEnterpriseState();
  const project = state.db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:read");
  return project;
}

/**
 * Resolves the immutable project revision named by a queued analytical job.
 * The active project and retained revision come from one primary-state read;
 * duplicate exact versions are rejected instead of choosing an arbitrary row.
 */
export async function getEnterpriseProjectRevisionSourceReadOnlyAsync(
  context: SenaEnterpriseSessionContext,
  projectId: string,
  version: number
) {
  const state = await readEnterpriseState();
  const project = state.db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:read");
  const revisions = state.db.projectRevisions.filter((candidate) => (
    candidate.projectId === projectId &&
    candidate.teamId === project.teamId &&
    candidate.version === version
  ));
  if (revisions.length === 0) {
    throw new SenaEnterpriseError(
      "The requested project revision is no longer retained.",
      409,
      "project_revision_not_found"
    );
  }
  if (revisions.length !== 1) {
    throw new SenaEnterpriseError(
      "The requested project revision is ambiguous.",
      409,
      "project_revision_ambiguous"
    );
  }
  const revision = revisions[0];
  const sourceProject: SenaEnterpriseProject = {
    ...project,
    currentVersion: revision.version,
    title: revision.title ?? project.title,
    description: revision.description ?? project.description,
    snapshot: revision.snapshot,
    datasetCounts: revision.datasetCounts,
    activeWindowLabel: revision.activeWindowLabel,
    claimUse: revision.claimUse,
    updatedAt: revision.createdAt
  };
  return { currentProject: project, revision, sourceProject };
}

export function updateEnterpriseProject(context: SenaEnterpriseSessionContext, projectId: string, input: {
  title?: string;
  description?: string;
  snapshot?: SenaProjectSnapshot;
  expectedVersion?: number;
}) {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:update");
  assertEnterpriseProjectExpectedVersion(project, input.expectedVersion);
  const snapshot = input.snapshot ? importSenaProjectSnapshot(input.snapshot) : undefined;
  const nextTitle = input.title === undefined ? project.title : input.title.trim() || project.title;
  const nextDescription = input.description === undefined ? project.description : input.description.trim();
  const metadataChanged = nextTitle !== project.title || nextDescription !== project.description;
  project.title = nextTitle;
  project.description = nextDescription;
  if (snapshot) {
    project.snapshot = snapshot;
    project.datasetCounts = snapshotCounts(snapshot);
    project.activeWindowLabel = snapshot.source.activeTemporalWindow?.label ?? "Full conversation";
    project.claimUse = snapshot.report.claimReadinessGate.claimUse;
  }
  if (snapshot || metadataChanged) {
    project.currentVersion += 1;
    db.projectRevisions.push(buildProjectRevision(project, context.user.id, project.currentVersion));
  }
  project.updatedAt = now();
  writeEnterpriseDb(db);
  recordEnterpriseAudit({
    event: "project.update",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: { title: project.title }
  });
  return project;
}

export async function updateEnterpriseProjectAsync(context: SenaEnterpriseSessionContext, projectId: string, input: {
  title?: string;
  description?: string;
  snapshot?: SenaProjectSnapshot;
  expectedVersion?: number;
}) {
  const state = await readEnterpriseState();
  const db = state.db;
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:update");
  assertEnterpriseProjectExpectedVersion(project, input.expectedVersion);
  const snapshot = input.snapshot ? importSenaProjectSnapshot(input.snapshot) : undefined;
  const nextTitle = input.title === undefined ? project.title : input.title.trim() || project.title;
  const nextDescription = input.description === undefined ? project.description : input.description.trim();
  const metadataChanged = nextTitle !== project.title || nextDescription !== project.description;
  project.title = nextTitle;
  project.description = nextDescription;
  if (snapshot) {
    project.snapshot = snapshot;
    project.datasetCounts = snapshotCounts(snapshot);
    project.activeWindowLabel = snapshot.source.activeTemporalWindow?.label ?? "Full conversation";
    project.claimUse = snapshot.report.claimReadinessGate.claimUse;
  }
  if (snapshot || metadataChanged) {
    project.currentVersion += 1;
    db.projectRevisions.push(buildProjectRevision(project, context.user.id, project.currentVersion));
  }
  project.updatedAt = now();
  appendAudit(db, {
    event: "project.update",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: { title: project.title }
  });
  await writeEnterpriseState(state, db);
  return project;
}

export function restoreEnterpriseProjectRevision(context: SenaEnterpriseSessionContext, projectId: string, input: {
  revisionId?: string;
  version?: number;
  expectedVersion?: number;
}) {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:update");
  assertEnterpriseProjectExpectedVersion(project, input.expectedVersion);
  const targetRevision = input.revisionId
    ? db.projectRevisions.find((revision) => revision.projectId === projectId && revision.id === input.revisionId)
    : Number.isInteger(input.version)
      ? db.projectRevisions.find((revision) => revision.projectId === projectId && revision.version === input.version)
      : undefined;
  if (!targetRevision) throw new SenaEnterpriseError("Project revision was not found.", 404, "project_revision_not_found");
  if (targetRevision.teamId !== project.teamId) {
    throw new SenaEnterpriseError(
      "Project revision failed team ownership validation.",
      409,
      "project_revision_integrity_invalid"
    );
  }
  if (targetRevision.version === project.currentVersion) {
    throw new SenaEnterpriseError("The selected revision is already the current project version.", 409, "project_revision_already_current");
  }
  const restoredSnapshot = importSenaProjectSnapshot(targetRevision.snapshot);
  const previousVersion = project.currentVersion;
  if (targetRevision.title !== undefined) project.title = targetRevision.title;
  if (targetRevision.description !== undefined) project.description = targetRevision.description;
  project.snapshot = restoredSnapshot;
  project.datasetCounts = snapshotCounts(restoredSnapshot);
  project.activeWindowLabel = restoredSnapshot.source.activeTemporalWindow?.label ?? "Full conversation";
  project.claimUse = restoredSnapshot.report.claimReadinessGate.claimUse;
  project.currentVersion += 1;
  project.updatedAt = now();
  const restoredRevision = buildProjectRevision(
    project,
    context.user.id,
    project.currentVersion,
    `Restored from version ${targetRevision.version}: ${targetRevision.summary}`
  );
  db.projectRevisions.push(restoredRevision);
  writeEnterpriseDb(db);
  recordEnterpriseAudit({
    event: "project.restore",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      title: project.title,
      restoredFromVersion: targetRevision.version,
      restoredToVersion: project.currentVersion,
      previousVersion,
      revisionId: targetRevision.id
    }
  });
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectRevisionRestore,
    project,
    restoredFrom: {
      id: targetRevision.id,
      version: targetRevision.version,
      summary: targetRevision.summary
    },
    restoredRevision: {
      id: restoredRevision.id,
      version: restoredRevision.version,
      summary: restoredRevision.summary
    }
  };
}

export async function restoreEnterpriseProjectRevisionAsync(context: SenaEnterpriseSessionContext, projectId: string, input: {
  revisionId?: string;
  version?: number;
  expectedVersion?: number;
}) {
  const state = await readEnterpriseState();
  const db = state.db;
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:update");
  assertEnterpriseProjectExpectedVersion(project, input.expectedVersion);
  const targetRevision = input.revisionId
    ? db.projectRevisions.find((revision) => revision.projectId === projectId && revision.id === input.revisionId)
    : Number.isInteger(input.version)
      ? db.projectRevisions.find((revision) => revision.projectId === projectId && revision.version === input.version)
      : undefined;
  if (!targetRevision) throw new SenaEnterpriseError("Project revision was not found.", 404, "project_revision_not_found");
  if (targetRevision.teamId !== project.teamId) {
    throw new SenaEnterpriseError(
      "Project revision failed team ownership validation.",
      409,
      "project_revision_integrity_invalid"
    );
  }
  if (targetRevision.version === project.currentVersion) {
    throw new SenaEnterpriseError("The selected revision is already the current project version.", 409, "project_revision_already_current");
  }
  const restoredSnapshot = importSenaProjectSnapshot(targetRevision.snapshot);
  const previousVersion = project.currentVersion;
  if (targetRevision.title !== undefined) project.title = targetRevision.title;
  if (targetRevision.description !== undefined) project.description = targetRevision.description;
  project.snapshot = restoredSnapshot;
  project.datasetCounts = snapshotCounts(restoredSnapshot);
  project.activeWindowLabel = restoredSnapshot.source.activeTemporalWindow?.label ?? "Full conversation";
  project.claimUse = restoredSnapshot.report.claimReadinessGate.claimUse;
  project.currentVersion += 1;
  project.updatedAt = now();
  const restoredRevision = buildProjectRevision(
    project,
    context.user.id,
    project.currentVersion,
    `Restored from version ${targetRevision.version}: ${targetRevision.summary}`
  );
  db.projectRevisions.push(restoredRevision);
  appendAudit(db, {
    event: "project.restore",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      title: project.title,
      restoredFromVersion: targetRevision.version,
      restoredToVersion: project.currentVersion,
      previousVersion,
      revisionId: targetRevision.id
    }
  });
  await writeEnterpriseState(state, db);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectRevisionRestore,
    project,
    restoredFrom: {
      id: targetRevision.id,
      version: targetRevision.version,
      summary: targetRevision.summary
    },
    restoredRevision: {
      id: restoredRevision.id,
      version: restoredRevision.version,
      summary: restoredRevision.summary
    }
  };
}

export function deleteEnterpriseProject(context: SenaEnterpriseSessionContext, projectId: string): SenaEnterpriseProjectDeletion {
  const db = readEnterpriseDb();
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:delete");
  const deletedAt = now();
  const deletion: SenaEnterpriseProjectDeletion = {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectDelete,
    projectId: project.id,
    teamId: project.teamId,
    projectVersion: project.currentVersion,
    deleted: true,
    deletedAt,
    snapshotSha256: artifactSha256(project.snapshot)
  };
  db.projects = db.projects.filter((candidate) => candidate.id !== projectId);
  db.projectRevisions = db.projectRevisions.filter((revision) => revision.projectId !== projectId);
  db.projectComments = db.projectComments.filter((comment) => comment.projectId !== projectId);
  db.projectPresence = db.projectPresence.filter((presence) => presence.projectId !== projectId);
  db.adjudications = db.adjudications.filter((adjudication) => adjudication.projectId !== projectId);
  db.analysisRuns = db.analysisRuns.filter((run) => run.projectId !== projectId && run.persistedProjectId !== projectId);
  db.reliabilityRuns = db.reliabilityRuns.filter((run) => run.projectId !== projectId);
  db.validationRuns = db.validationRuns.filter((run) => run.projectId !== projectId);
  db.expertReviews = db.expertReviews.filter((review) => review.projectId !== projectId);
  writeEnterpriseDb(db);
  recordEnterpriseAudit({
    event: "project.delete",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      title: project.title,
      projectVersion: project.currentVersion,
      snapshotSha256: deletion.snapshotSha256
    }
  });
  return deletion;
}

export async function deleteEnterpriseProjectAsync(context: SenaEnterpriseSessionContext, projectId: string): Promise<SenaEnterpriseProjectDeletion> {
  const state = await readEnterpriseState();
  const db = state.db;
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
  requireEnterprisePermission(context, project.teamId, "project:delete");
  const deletedAt = now();
  const deletion: SenaEnterpriseProjectDeletion = {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectDelete,
    projectId: project.id,
    teamId: project.teamId,
    projectVersion: project.currentVersion,
    deleted: true,
    deletedAt,
    snapshotSha256: artifactSha256(project.snapshot)
  };
  db.projects = db.projects.filter((candidate) => candidate.id !== projectId);
  db.projectRevisions = db.projectRevisions.filter((revision) => revision.projectId !== projectId);
  db.projectComments = db.projectComments.filter((comment) => comment.projectId !== projectId);
  db.projectPresence = db.projectPresence.filter((presence) => presence.projectId !== projectId);
  db.adjudications = db.adjudications.filter((adjudication) => adjudication.projectId !== projectId);
  db.analysisRuns = db.analysisRuns.filter((run) => run.projectId !== projectId && run.persistedProjectId !== projectId);
  db.reliabilityRuns = db.reliabilityRuns.filter((run) => run.projectId !== projectId);
  db.validationRuns = db.validationRuns.filter((run) => run.projectId !== projectId);
  db.expertReviews = db.expertReviews.filter((review) => review.projectId !== projectId);
  appendAudit(db, {
    event: "project.delete",
    userId: context.user.id,
    teamId: project.teamId,
    projectId: project.id,
    detail: {
      title: project.title,
      projectVersion: project.currentVersion,
      snapshotSha256: deletion.snapshotSha256
    }
  });
  await writeEnterpriseState(state, db);
  return deletion;
}
