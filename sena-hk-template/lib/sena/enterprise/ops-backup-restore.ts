import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import {
  appendAudit
} from "./ops-audit";
import {
  backupCoreChecksPass,
  verifyEnterpriseBackupAgainstDb,
  type SenaEnterpriseBackupArtifact,
  type SenaEnterpriseBackupVerification
} from "./ops-backup";
import {
  mutateEnterpriseDbAtomically,
  mutateEnterpriseStateAtomically,
  readEnterpriseDb,
  readEnterpriseState,
  type SenaEnterpriseDb,
  type SenaEnterpriseUser
} from "./state";

function now() {
  return new Date().toISOString();
}

export type SenaEnterpriseBackupRestoreResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackupRestore;
  status: "completed" | "dry-run";
  mode: "merge";
  generatedAt: string;
  backupId: string;
  dryRun: boolean;
  payloadSha256: string;
  verification: SenaEnterpriseBackupVerification;
  summary: {
    usersCreated: number;
    usersUpdated: number;
    teamsCreated: number;
    teamsUpdated: number;
    membershipsCreated: number;
    membershipsUpdated: number;
    invitationsCreated: number;
    invitationsUpdated: number;
    uploadsCreated: number;
    uploadsUpdated: number;
    importRunsCreated: number;
    importRunsUpdated: number;
    analysisRunsCreated: number;
    analysisRunsUpdated: number;
    projectsCreated: number;
    projectsUpdated: number;
    projectRevisionsCreated: number;
    projectRevisionsUpdated: number;
    commentsCreated: number;
    commentsUpdated: number;
    adjudicationsCreated: number;
    adjudicationsUpdated: number;
    reliabilityRunsCreated: number;
    reliabilityRunsUpdated: number;
    validationRunsCreated: number;
    validationRunsUpdated: number;
    expertReviewsCreated: number;
    expertReviewsUpdated: number;
    platformDecisionAcceptancesCreated: number;
    platformDecisionAcceptancesUpdated: number;
    releaseGateReviewsCreated: number;
    releaseGateReviewsUpdated: number;
    postCutoverObservationsCreated: number;
    postCutoverObservationsUpdated: number;
    goLiveAttestationsCreated: number;
    goLiveAttestationsUpdated: number;
    notificationsCreated: number;
    notificationsUpdated: number;
    auditEventsCreated: number;
    auditEventsUpdated: number;
  };
};

function dbWorkingCopy(db: SenaEnterpriseDb): SenaEnterpriseDb {
  return JSON.parse(JSON.stringify(db)) as SenaEnterpriseDb;
}

function canManageAnyTeam(context: SenaEnterpriseSessionContext) {
  return context.memberships.some((membership) => membership.status === "active" && rolePermissions[membership.role].includes("team:manage"));
}

function ensureBackupRestorePermission(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact,
  db: SenaEnterpriseDb = readEnterpriseDb()
) {
  if (!canManageAnyTeam(context)) {
    throw new SenaEnterpriseError("Team management permission is required for enterprise backup restore.", 403, "backup_restore_permission_denied");
  }
  for (const teamId of backup.scope.teamIds) {
    if (db.teams.some((team) => team.id === teamId)) {
      requireEnterprisePermission(context, teamId, "team:manage");
    }
  }
}

function emptyBackupRestoreSummary(): SenaEnterpriseBackupRestoreResult["summary"] {
  return {
    usersCreated: 0,
    usersUpdated: 0,
    teamsCreated: 0,
    teamsUpdated: 0,
    membershipsCreated: 0,
    membershipsUpdated: 0,
    invitationsCreated: 0,
    invitationsUpdated: 0,
    uploadsCreated: 0,
    uploadsUpdated: 0,
    importRunsCreated: 0,
    importRunsUpdated: 0,
    analysisRunsCreated: 0,
    analysisRunsUpdated: 0,
    projectsCreated: 0,
    projectsUpdated: 0,
    projectRevisionsCreated: 0,
    projectRevisionsUpdated: 0,
    commentsCreated: 0,
    commentsUpdated: 0,
    adjudicationsCreated: 0,
    adjudicationsUpdated: 0,
    reliabilityRunsCreated: 0,
    reliabilityRunsUpdated: 0,
    validationRunsCreated: 0,
    validationRunsUpdated: 0,
    expertReviewsCreated: 0,
    expertReviewsUpdated: 0,
    platformDecisionAcceptancesCreated: 0,
    platformDecisionAcceptancesUpdated: 0,
    releaseGateReviewsCreated: 0,
    releaseGateReviewsUpdated: 0,
    postCutoverObservationsCreated: 0,
    postCutoverObservationsUpdated: 0,
    goLiveAttestationsCreated: 0,
    goLiveAttestationsUpdated: 0,
    notificationsCreated: 0,
    notificationsUpdated: 0,
    auditEventsCreated: 0,
    auditEventsUpdated: 0
  };
}

function mergeById<T extends { id: string }>(
  target: T[],
  incoming: T[],
  createdKey: keyof SenaEnterpriseBackupRestoreResult["summary"],
  updatedKey: keyof SenaEnterpriseBackupRestoreResult["summary"],
  summary: SenaEnterpriseBackupRestoreResult["summary"],
  mergeRecord: (existing: T | undefined, incoming: T) => T = (_existing, record) => record
) {
  for (const record of incoming) {
    const index = target.findIndex((candidate) => candidate.id === record.id);
    if (index >= 0) {
      target[index] = mergeRecord(target[index], record);
      summary[updatedKey] += 1;
    } else {
      target.push(mergeRecord(undefined, record));
      summary[createdKey] += 1;
    }
  }
}

export function restoreEnterpriseBackup(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact,
  input: { dryRun?: boolean; mode?: "merge" } = {}
): SenaEnterpriseBackupRestoreResult {
  if (input.dryRun) {
    return buildEnterpriseBackupRestoreResult(context, backup, readEnterpriseDb(), input);
  }
  return mutateEnterpriseDbAtomically((db) => buildEnterpriseBackupRestoreResultAtomically(context, backup, db, input));
}

export async function restoreEnterpriseBackupWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact,
  input: { dryRun?: boolean; mode?: "merge" } = {}
): Promise<SenaEnterpriseBackupRestoreResult> {
  if (input.dryRun) {
    const state = await readEnterpriseState();
    return buildEnterpriseBackupRestoreResult(context, backup, state.db, input);
  }
  return mutateEnterpriseStateAtomically((db) => buildEnterpriseBackupRestoreResultAtomically(context, backup, db, input));
}

function buildEnterpriseBackupRestoreResultAtomically(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact,
  sourceDb: SenaEnterpriseDb,
  input: { dryRun?: boolean; mode?: "merge" }
) {
  const workingDb = dbWorkingCopy(sourceDb);
  const result = buildEnterpriseBackupRestoreResult(context, backup, workingDb, input);
  Object.assign(sourceDb, workingDb);
  return result;
}

function buildEnterpriseBackupRestoreResult(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact,
  sourceDb: SenaEnterpriseDb,
  input: { dryRun?: boolean; mode?: "merge" } = {}
): SenaEnterpriseBackupRestoreResult {
  const dryRun = Boolean(input.dryRun);
  const mode = input.mode ?? "merge";
  if (mode !== "merge") {
    throw new SenaEnterpriseError("Only merge restore mode is supported.", 400, "unsupported_backup_restore_mode");
  }
  ensureBackupRestorePermission(context, backup, sourceDb);
  const verification = verifyEnterpriseBackupAgainstDb(context, backup, sourceDb);
  if (!backupCoreChecksPass(verification)) {
    throw new SenaEnterpriseError("Backup restore requires checksum, record counts, and secret exclusions to pass.", 400, "backup_restore_preflight_failed");
  }

  const db = dryRun ? dbWorkingCopy(sourceDb) : sourceDb;
  const summary = emptyBackupRestoreSummary();
  mergeById(db.users, backup.payload.users as SenaEnterpriseUser[], "usersCreated", "usersUpdated", summary, (existing, incoming) => ({
    ...incoming,
    passwordHash: existing?.passwordHash,
    ssoIdentities: incoming.ssoIdentities ?? existing?.ssoIdentities ?? []
  }));
  mergeById(db.teams, backup.payload.teams, "teamsCreated", "teamsUpdated", summary);
  mergeById(db.memberships, backup.payload.memberships, "membershipsCreated", "membershipsUpdated", summary);
  mergeById(db.invitations, backup.payload.invitations, "invitationsCreated", "invitationsUpdated", summary);
  mergeById(db.uploads, backup.payload.uploads, "uploadsCreated", "uploadsUpdated", summary);
  mergeById(db.importRuns, backup.payload.importRuns, "importRunsCreated", "importRunsUpdated", summary);
  mergeById(db.analysisRuns, backup.payload.analysisRuns ?? [], "analysisRunsCreated", "analysisRunsUpdated", summary);
  mergeById(db.projects, backup.payload.projects, "projectsCreated", "projectsUpdated", summary);
  mergeById(db.projectRevisions, backup.payload.projectRevisions, "projectRevisionsCreated", "projectRevisionsUpdated", summary);
  mergeById(db.projectComments, backup.payload.projectComments, "commentsCreated", "commentsUpdated", summary);
  mergeById(db.adjudications, backup.payload.adjudications, "adjudicationsCreated", "adjudicationsUpdated", summary);
  mergeById(db.reliabilityRuns, backup.payload.reliabilityRuns, "reliabilityRunsCreated", "reliabilityRunsUpdated", summary);
  mergeById(db.validationRuns, backup.payload.validationRuns, "validationRunsCreated", "validationRunsUpdated", summary);
  mergeById(db.expertReviews, backup.payload.expertReviews ?? [], "expertReviewsCreated", "expertReviewsUpdated", summary);
  mergeById(db.platformDecisionAcceptances, backup.payload.platformDecisionAcceptances ?? [], "platformDecisionAcceptancesCreated", "platformDecisionAcceptancesUpdated", summary);
  mergeById(db.releaseGateReviews, backup.payload.releaseGateReviews ?? [], "releaseGateReviewsCreated", "releaseGateReviewsUpdated", summary);
  mergeById(db.postCutoverObservations, backup.payload.postCutoverObservations ?? [], "postCutoverObservationsCreated", "postCutoverObservationsUpdated", summary);
  mergeById(db.goLiveAttestations, backup.payload.goLiveAttestations ?? [], "goLiveAttestationsCreated", "goLiveAttestationsUpdated", summary);
  mergeById(db.notifications, backup.payload.notifications, "notificationsCreated", "notificationsUpdated", summary);
  mergeById(db.auditLog, backup.payload.auditLog, "auditEventsCreated", "auditEventsUpdated", summary);

  if (!dryRun) {
    appendAudit(db, {
      event: "governance.backup.restore",
      userId: context.user.id,
      teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
      detail: {
        backupId: backup.backupId,
        mode,
        payloadSha256: verification.payloadSha256,
        teamsCreated: summary.teamsCreated,
        teamsUpdated: summary.teamsUpdated,
        projectsCreated: summary.projectsCreated,
        projectsUpdated: summary.projectsUpdated
      }
    });
  }

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupRestore,
    status: dryRun ? "dry-run" : "completed",
    mode,
    generatedAt: now(),
    backupId: backup.backupId,
    dryRun,
    payloadSha256: verification.payloadSha256,
    verification,
    summary
  };
}
