import { createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import type {
  SenaEnterpriseAnalysisRun,
  SenaEnterpriseImportRun,
  SenaEnterpriseUpload
} from "./import-analysis";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import type {
  SenaEnterpriseNotification
} from "./notifications-delivery";
import {
  appendAudit,
  type SenaEnterpriseAuditLogEntry
} from "./ops-audit";
import {
  type SenaEnterpriseGovernanceCheck
} from "./ops-governance";
import type {
  SenaEnterpriseReleaseGateReview
} from "./ops-release-gate";
import type {
  SenaEnterprisePlatformDecisionAcceptance
} from "./ops-platform-decisions";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import type {
  SenaEnterpriseGoLiveAttestation
} from "./ops-go-live-attestations";
import type {
  SenaEnterpriseInvitation
} from "./auth-invitations";
import type {
  SenaEnterprisePostCutoverObservation
} from "./ops-post-cutover-observations";
import type {
  SenaEnterpriseReliabilityRun
} from "./reliability-runs";
import type {
  SenaEnterpriseValidationRun
} from "./validation-runs";
import type {
  SenaEnterpriseExpertReview
} from "./expert-review";
import type {
  SenaEnterpriseDb,
  SenaEnterpriseTeam,
  SenaEnterpriseUser
} from "./state";
import {
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState,
  type SenaEnterpriseStateRead
} from "./state";
import type {
  SenaEnterpriseMembership
} from "./team-memberships";
import type {
  SenaEnterpriseAdjudicationRecord,
  SenaEnterpriseProjectComment
} from "./team-collaboration";
import type {
  SenaEnterpriseProject,
  SenaEnterpriseProjectRevision
} from "./team-project";
import {
  backupWebhookEndpointHash,
  backupWebhookProvider,
  backupWebhookSecret,
  backupWebhookTimeoutMs,
  backupWebhookUrl,
  localWebhookSinkAttempt,
  webhookErrorHash,
  type SenaEnterpriseWebhookProviderMode
} from "./webhook-delivery";

const auditRetentionMaxEvents = 5000;
const enterpriseDbDir = process.env.SENA_ENTERPRISE_DB_DIR || ".sena-enterprise";
const enterpriseDbPath = path.join(enterpriseDbDir, "enterprise-db.json");

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && rolePermissions[membership.role].includes("team:manage"))
    .map((membership) => membership.teamId);
}

export type SenaEnterpriseBackupRecordCounts = {
  users: number;
  teams: number;
  memberships: number;
  invitations: number;
  uploads: number;
  importRuns: number;
  analysisRuns: number;
  projects: number;
  projectRevisions: number;
  comments: number;
  adjudications: number;
  reliabilityRuns: number;
  validationRuns: number;
  expertReviews: number;
  platformDecisionAcceptances: number;
  releaseGateReviews: number;
  postCutoverObservations: number;
  goLiveAttestations: number;
  notifications: number;
  auditEvents: number;
};

export type SenaEnterpriseBackupPayload = {
  users: Array<Omit<SenaEnterpriseUser, "passwordHash">>;
  teams: SenaEnterpriseTeam[];
  memberships: SenaEnterpriseMembership[];
  invitations: SenaEnterpriseInvitation[];
  uploads: SenaEnterpriseUpload[];
  importRuns: SenaEnterpriseImportRun[];
  analysisRuns: SenaEnterpriseAnalysisRun[];
  projects: SenaEnterpriseProject[];
  projectRevisions: SenaEnterpriseProjectRevision[];
  projectComments: SenaEnterpriseProjectComment[];
  adjudications: SenaEnterpriseAdjudicationRecord[];
  reliabilityRuns: SenaEnterpriseReliabilityRun[];
  validationRuns: SenaEnterpriseValidationRun[];
  expertReviews: SenaEnterpriseExpertReview[];
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
  releaseGateReviews: SenaEnterpriseReleaseGateReview[];
  postCutoverObservations: SenaEnterprisePostCutoverObservation[];
  goLiveAttestations: SenaEnterpriseGoLiveAttestation[];
  notifications: SenaEnterpriseNotification[];
  auditLog: SenaEnterpriseAuditLogEntry[];
};

export type SenaEnterpriseBackupArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackup;
  backupId: string;
  generatedAt: string;
  generatedBy: {
    userId: string;
    email: string;
    name: string;
  };
  scope: {
    mode: "managed-teams" | "selected-team";
    teamIds: string[];
    uploadBlobsIncluded: false;
    excludedCollections: string[];
  };
  manifest: {
    storageEngine: "file-backed-json" | "postgres-primary-state";
    storagePathHint: string;
    payloadSha256: string;
    recordCounts: SenaEnterpriseBackupRecordCounts;
    retentionPolicy: {
      auditEventsMax: number;
      sessionsExcluded: true;
      ssoStatesExcluded: true;
      authLockoutsExcluded: true;
      apiRateLimitsExcluded: true;
      mfaSecretsExcluded: true;
      mfaChallengesExcluded: true;
      emailDeliveriesExcluded: true;
      passwordResetTokensExcluded: true;
      presenceExcluded: true;
      collaborationPubSubExcluded: true;
      passwordHashesExcluded: true;
      uploadBlobsExcluded: true;
    };
  };
  payload: SenaEnterpriseBackupPayload;
};

export type SenaEnterpriseBackupVerification = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackupVerification;
  status: "pass" | "review";
  generatedAt: string;
  backupId: string;
  backupGeneratedAt: string;
  payloadSha256: string;
  recordCounts: SenaEnterpriseBackupRecordCounts;
  conflicts: {
    teams: string[];
    projects: string[];
    uploads: string[];
  };
  checks: SenaEnterpriseGovernanceCheck[];
};

export type SenaEnterpriseBackupDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseBackupDelivery;
  status: "not-configured" | "delivered" | "failed";
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
  };
  backup: {
    backupId: string;
    generatedAt: string;
    payloadSha256: string;
    recordCounts: SenaEnterpriseBackupRecordCounts;
    scope: SenaEnterpriseBackupArtifact["scope"];
  };
  verification: SenaEnterpriseBackupVerification;
  delivery: {
    attempted: boolean;
    webhookStatus?: "delivered" | "failed";
    attemptedAt?: string;
    endpointHash?: string;
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  };
};

function publicUser(user: SenaEnterpriseUser): Omit<SenaEnterpriseUser, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function backupRecordCounts(payload: SenaEnterpriseBackupPayload): SenaEnterpriseBackupRecordCounts {
  return {
    users: payload.users.length,
    teams: payload.teams.length,
    memberships: payload.memberships.length,
    invitations: payload.invitations.length,
    uploads: payload.uploads.length,
    importRuns: payload.importRuns.length,
    analysisRuns: (payload.analysisRuns ?? []).length,
    projects: payload.projects.length,
    projectRevisions: payload.projectRevisions.length,
    comments: payload.projectComments.length,
    adjudications: payload.adjudications.length,
    reliabilityRuns: payload.reliabilityRuns.length,
    validationRuns: payload.validationRuns.length,
    expertReviews: (payload.expertReviews ?? []).length,
    platformDecisionAcceptances: (payload.platformDecisionAcceptances ?? []).length,
    releaseGateReviews: (payload.releaseGateReviews ?? []).length,
    postCutoverObservations: (payload.postCutoverObservations ?? []).length,
    goLiveAttestations: (payload.goLiveAttestations ?? []).length,
    notifications: payload.notifications.length,
    auditEvents: payload.auditLog.length
  };
}

function backupPayloadSha256(payload: SenaEnterpriseBackupPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sameRecordCounts(a: SenaEnterpriseBackupRecordCounts, b: SenaEnterpriseBackupRecordCounts) {
  return Object.keys(a).every((key) => {
    const countKey = key as keyof SenaEnterpriseBackupRecordCounts;
    return a[countKey] === b[countKey];
  });
}

function buildBackupPayload(db: SenaEnterpriseDb, teamIds: string[]): SenaEnterpriseBackupPayload {
  const teamIdSet = new Set(teamIds);
  const membershipUserIds = new Set(db.memberships
    .filter((membership) => teamIdSet.has(membership.teamId))
    .map((membership) => membership.userId));
  return {
    users: db.users.filter((user) => membershipUserIds.has(user.id)).map(publicUser),
    teams: db.teams.filter((team) => teamIdSet.has(team.id)),
    memberships: db.memberships.filter((membership) => teamIdSet.has(membership.teamId)),
    invitations: db.invitations.filter((invitation) => teamIdSet.has(invitation.teamId)),
    uploads: db.uploads.filter((upload) => teamIdSet.has(upload.teamId)),
    importRuns: db.importRuns.filter((run) => teamIdSet.has(run.teamId)),
    analysisRuns: db.analysisRuns.filter((run) => teamIdSet.has(run.teamId)),
    projects: db.projects.filter((project) => teamIdSet.has(project.teamId)),
    projectRevisions: db.projectRevisions.filter((revision) => teamIdSet.has(revision.teamId)),
    projectComments: db.projectComments.filter((comment) => teamIdSet.has(comment.teamId)),
    adjudications: db.adjudications.filter((record) => teamIdSet.has(record.teamId)),
    reliabilityRuns: db.reliabilityRuns.filter((run) => teamIdSet.has(run.teamId)),
    validationRuns: db.validationRuns.filter((run) => teamIdSet.has(run.teamId)),
    expertReviews: db.expertReviews.filter((review) => teamIdSet.has(review.teamId)),
    platformDecisionAcceptances: (db.platformDecisionAcceptances ?? []).filter((acceptance) => teamIdSet.has(acceptance.teamId)),
    releaseGateReviews: (db.releaseGateReviews ?? []).filter((review) => teamIdSet.has(review.teamId)),
    postCutoverObservations: (db.postCutoverObservations ?? []).filter((observation) => teamIdSet.has(observation.teamId)),
    goLiveAttestations: (db.goLiveAttestations ?? []).filter((attestation) => teamIdSet.has(attestation.teamId)),
    notifications: db.notifications.filter((notification) => !notification.teamId || teamIdSet.has(notification.teamId)),
    auditLog: db.auditLog.filter((entry) => !entry.teamId || teamIdSet.has(entry.teamId))
  };
}

function backupManifest(
  payload: SenaEnterpriseBackupPayload,
  payloadSha256: string,
  runtime?: SenaEnterpriseStateRead["runtime"]
): SenaEnterpriseBackupArtifact["manifest"] {
  const postgresPrimary = runtime?.activePrimary === "postgres";
  return {
    storageEngine: postgresPrimary ? "postgres-primary-state" : "file-backed-json",
    storagePathHint: postgresPrimary
      ? `postgres:${runtime.postgresConnectionHash ? "configured" : "missing-hash"}`
      : path.basename(enterpriseDbDir),
    payloadSha256,
    recordCounts: backupRecordCounts(payload),
    retentionPolicy: {
      auditEventsMax: auditRetentionMaxEvents,
      sessionsExcluded: true,
      ssoStatesExcluded: true,
      authLockoutsExcluded: true,
      apiRateLimitsExcluded: true,
      mfaSecretsExcluded: true,
      mfaChallengesExcluded: true,
      emailDeliveriesExcluded: true,
      passwordResetTokensExcluded: true,
      presenceExcluded: true,
      collaborationPubSubExcluded: true,
      passwordHashesExcluded: true,
      uploadBlobsExcluded: true
    }
  };
}

function ensureBackupManagePermission(context: SenaEnterpriseSessionContext, teamId?: string) {
  const manageable = manageableTeamIds(context);
  if (teamId) {
    requireEnterprisePermission(context, teamId, "team:manage");
    return [teamId];
  }
  if (manageable.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for enterprise backups.", 403, "backup_permission_denied");
  }
  return manageable;
}

function createEnterpriseBackupFromDb(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string },
  db: SenaEnterpriseDb,
  runtime?: SenaEnterpriseStateRead["runtime"]
): SenaEnterpriseBackupArtifact {
  const teamIds = ensureBackupManagePermission(context, input.teamId);
  appendAudit(db, {
    event: "governance.backup",
    userId: context.user.id,
    teamId: teamIds.length === 1 ? teamIds[0] : undefined,
    detail: {
      teamIds: teamIds.join("|"),
      mode: input.teamId ? "selected-team" : "managed-teams",
      uploadBlobsIncluded: false
    }
  });

  const payload = buildBackupPayload(db, teamIds);
  const payloadSha = backupPayloadSha256(payload);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackup,
    backupId: id("backup"),
    generatedAt: now(),
    generatedBy: {
      userId: context.user.id,
      email: context.user.email,
      name: context.user.name
    },
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamIds,
      uploadBlobsIncluded: false,
      excludedCollections: ["sessions", "ssoStates", "authLockouts", "apiRateLimits", "mfaSecrets", "mfaChallenges", "emailDeliveries", "passwordResetTokens", "projectPresence", "collaborationEvents", "passwordHash", "uploadBlobs"]
    },
    manifest: backupManifest(payload, payloadSha, runtime),
    payload
  };
}

export function createEnterpriseBackup(context: SenaEnterpriseSessionContext, input: { teamId?: string } = {}): SenaEnterpriseBackupArtifact {
  const db = readEnterpriseDb();
  const backup = createEnterpriseBackupFromDb(context, input, db);
  saveDb(db);
  return backup;
}

export async function createEnterpriseBackupWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): Promise<SenaEnterpriseBackupArtifact> {
  const state = await readEnterpriseState();
  const backup = createEnterpriseBackupFromDb(context, input, state.db, state.runtime);
  await saveEnterpriseState(state, state.db);
  return backup;
}

function backupHasPasswordHashes(backup: SenaEnterpriseBackupArtifact) {
  return backup.payload.users.some((user) => Object.prototype.hasOwnProperty.call(user, "passwordHash"));
}

export function verifyEnterpriseBackupAgainstDb(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact,
  db: SenaEnterpriseDb
): SenaEnterpriseBackupVerification {
  ensureBackupManagePermission(context);
  if (backup.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseBackup) {
    throw new SenaEnterpriseError("Unsupported SENA enterprise backup schema.", 400, "unsupported_backup_schema");
  }

  const payloadSha = backupPayloadSha256(backup.payload);
  const actualCounts = backupRecordCounts(backup.payload);
  const conflicts = {
    teams: backup.payload.teams.filter((team) => db.teams.some((current) => current.id === team.id)).map((team) => team.id),
    projects: backup.payload.projects.filter((project) => db.projects.some((current) => current.id === project.id)).map((project) => project.id),
    uploads: backup.payload.uploads.filter((upload) => db.uploads.some((current) => current.id === upload.id)).map((upload) => upload.id)
  };
  const collisionCount = conflicts.teams.length + conflicts.projects.length + conflicts.uploads.length;
  const checksumPass = payloadSha === backup.manifest.payloadSha256;
  const countsPass = sameRecordCounts(actualCounts, backup.manifest.recordCounts);
  const exclusionsPass = (
    backup.scope.uploadBlobsIncluded === false &&
    backup.manifest.retentionPolicy.sessionsExcluded &&
    backup.manifest.retentionPolicy.ssoStatesExcluded &&
    backup.manifest.retentionPolicy.authLockoutsExcluded &&
    backup.manifest.retentionPolicy.apiRateLimitsExcluded &&
    backup.manifest.retentionPolicy.mfaSecretsExcluded &&
    backup.manifest.retentionPolicy.mfaChallengesExcluded &&
    backup.manifest.retentionPolicy.emailDeliveriesExcluded &&
    backup.manifest.retentionPolicy.passwordResetTokensExcluded &&
    backup.manifest.retentionPolicy.presenceExcluded &&
    backup.manifest.retentionPolicy.collaborationPubSubExcluded &&
    backup.manifest.retentionPolicy.passwordHashesExcluded &&
    backup.manifest.retentionPolicy.uploadBlobsExcluded &&
    !backupHasPasswordHashes(backup)
  );
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "backup-checksum",
      label: "Backup payload checksum",
      status: checksumPass ? "pass" : "review",
      evidence: [`declared=${backup.manifest.payloadSha256}`, `actual=${payloadSha}`],
      nextAction: checksumPass ? "Store this checksum alongside the backup handoff record." : "Reject this backup artifact and regenerate it from the source runtime."
    },
    {
      id: "backup-record-counts",
      label: "Backup record count manifest",
      status: countsPass ? "pass" : "review",
      evidence: Object.entries(actualCounts).map(([key, value]) => `${key}=${value}`),
      nextAction: countsPass ? "Use these counts as restore-run acceptance checks." : "Investigate manifest drift before any restore attempt."
    },
    {
      id: "backup-secret-exclusions",
      label: "Backup secret and ephemeral-state exclusions",
      status: exclusionsPass ? "pass" : "review",
      evidence: [
        `uploadBlobsIncluded=${backup.scope.uploadBlobsIncluded}`,
        `excluded=${backup.scope.excludedCollections.join("|")}`,
        `passwordHashesPresent=${backupHasPasswordHashes(backup)}`
      ],
      nextAction: exclusionsPass ? "Keep secrets and transient session state out of handoff archives." : "Remove secrets or transient runtime state before retaining this backup."
    },
    {
      id: "backup-id-collision-preflight",
      label: "Restore ID collision preflight",
      status: collisionCount === 0 ? "pass" : "review",
      evidence: [
        `teamConflicts=${conflicts.teams.length}`,
        `projectConflicts=${conflicts.projects.length}`,
        `uploadConflicts=${conflicts.uploads.length}`
      ],
      nextAction: collisionCount === 0 ? "Restore rehearsal can proceed against an empty or compatible target." : "Choose replace/merge policy before restoring into this existing runtime."
    }
  ];
  const status = checks.every((check) => check.status === "pass") ? "pass" : "review";
  appendAudit(db, {
    event: "governance.backup.verify",
    userId: context.user.id,
    detail: {
      backupId: backup.backupId,
      status,
      payloadSha256: payloadSha,
      collisions: collisionCount
    }
  });
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupVerification,
    status,
    generatedAt: now(),
    backupId: backup.backupId,
    backupGeneratedAt: backup.generatedAt,
    payloadSha256: payloadSha,
    recordCounts: actualCounts,
    conflicts,
    checks
  };
}

export function verifyEnterpriseBackup(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact
): SenaEnterpriseBackupVerification {
  const db = readEnterpriseDb();
  const verification = verifyEnterpriseBackupAgainstDb(context, backup, db);
  saveDb(db);
  return verification;
}

export async function verifyEnterpriseBackupWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  backup: SenaEnterpriseBackupArtifact
): Promise<SenaEnterpriseBackupVerification> {
  const state = await readEnterpriseState();
  const verification = verifyEnterpriseBackupAgainstDb(context, backup, state.db);
  await saveEnterpriseState(state, state.db);
  return verification;
}

export function ensureBackupDeliveryPermission(context: SenaEnterpriseSessionContext, backup: SenaEnterpriseBackupArtifact) {
  const manageable = new Set(manageableTeamIds(context));
  const unauthorizedTeam = backup.scope.teamIds.find((teamId) => !manageable.has(teamId));
  if (unauthorizedTeam) {
    throw new SenaEnterpriseError("Team management permission is required for enterprise backup delivery.", 403, "backup_delivery_permission_denied");
  }
}

function backupWebhookPayload(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification,
  endpointHash: string,
  generatedAt: string
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupWebhook,
    generatedAt,
    backup,
    verification,
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(backupWebhookSecret())
    }
  };
}

async function postBackupWebhook(
  backup: SenaEnterpriseBackupArtifact,
  verification: SenaEnterpriseBackupVerification
) {
  const webhookUrl = backupWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Backup webhook delivery is not configured.", 503, "backup_webhook_not_configured");
  }
  const endpointHash = backupWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(backupWebhookPayload(backup, verification, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "backup.deliver",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-backup-id": backup.backupId,
    "x-sena-backup-payload-sha256": verification.payloadSha256
  };
  const secret = backupWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), backupWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverEnterpriseBackup(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; backup?: SenaEnterpriseBackupArtifact } = {}
): Promise<SenaEnterpriseBackupDeliveryResult> {
  const provider = backupWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const backup = input.backup ?? createEnterpriseBackup(context, { teamId: input.teamId });
  if (input.backup) {
    ensureBackupDeliveryPermission(context, backup);
  }
  const verification = verifyEnterpriseBackup(context, backup);
  if (!backupCoreChecksPass(verification)) {
    throw new SenaEnterpriseError("Backup delivery requires checksum, record counts, and secret exclusions to pass.", 400, "backup_delivery_preflight_failed");
  }

  const result: SenaEnterpriseBackupDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupDelivery,
    status: provider.configured ? "failed" : "not-configured",
    generatedAt: now(),
    provider,
    backup: {
      backupId: backup.backupId,
      generatedAt: backup.generatedAt,
      payloadSha256: verification.payloadSha256,
      recordCounts: verification.recordCounts,
      scope: backup.scope
    },
    verification,
    delivery: {
      attempted: false
    }
  };

  if (!provider.configured) {
    return result;
  }

  const attemptResult = provider.mode === "local-sink"
    ? localWebhookSinkAttempt(provider.endpointHash!)
    : await postBackupWebhook(backup, verification);
  const attemptedAt = now();
  result.status = attemptResult.ok ? "delivered" : "failed";
  result.delivery = {
    attempted: true,
    webhookStatus: attemptResult.ok ? "delivered" : "failed",
    attemptedAt,
    endpointHash: attemptResult.endpointHash,
    httpStatus: attemptResult.httpStatus,
    errorCode: attemptResult.errorCode,
    errorHash: attemptResult.errorHash
  };

  const db = readEnterpriseDb();
  appendAudit(db, {
    event: attemptResult.ok ? "governance.backup.deliver" : "governance.backup.deliver.fail",
    userId: context.user.id,
    teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
    detail: {
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      endpointHash: attemptResult.endpointHash ?? "none",
      httpStatus: attemptResult.httpStatus ?? null,
      errorCode: attemptResult.errorCode ?? null,
      errorHash: attemptResult.errorHash ?? null,
      teams: verification.recordCounts.teams,
      projects: verification.recordCounts.projects,
      uploads: verification.recordCounts.uploads,
      auditEvents: verification.recordCounts.auditEvents
    }
  });
  saveDb(db);
  return result;
}

export async function deliverEnterpriseBackupWithPostgresEvidence(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; backup?: SenaEnterpriseBackupArtifact } = {}
): Promise<SenaEnterpriseBackupDeliveryResult> {
  const provider = backupWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const state = await readEnterpriseState();
  const backup = input.backup ?? createEnterpriseBackupFromDb(context, { teamId: input.teamId }, state.db, state.runtime);
  if (input.backup) {
    ensureBackupDeliveryPermission(context, backup);
  }
  const verification = verifyEnterpriseBackupAgainstDb(context, backup, state.db);
  if (!backupCoreChecksPass(verification)) {
    await saveEnterpriseState(state, state.db);
    throw new SenaEnterpriseError("Backup delivery requires checksum, record counts, and secret exclusions to pass.", 400, "backup_delivery_preflight_failed");
  }

  const result: SenaEnterpriseBackupDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseBackupDelivery,
    status: provider.configured ? "failed" : "not-configured",
    generatedAt: now(),
    provider,
    backup: {
      backupId: backup.backupId,
      generatedAt: backup.generatedAt,
      payloadSha256: verification.payloadSha256,
      recordCounts: verification.recordCounts,
      scope: backup.scope
    },
    verification,
    delivery: {
      attempted: false
    }
  };

  if (!provider.configured) {
    await saveEnterpriseState(state, state.db);
    return result;
  }

  const attemptResult = provider.mode === "local-sink"
    ? localWebhookSinkAttempt(provider.endpointHash!)
    : await postBackupWebhook(backup, verification);
  const attemptedAt = now();
  result.status = attemptResult.ok ? "delivered" : "failed";
  result.delivery = {
    attempted: true,
    webhookStatus: attemptResult.ok ? "delivered" : "failed",
    attemptedAt,
    endpointHash: attemptResult.endpointHash,
    httpStatus: attemptResult.httpStatus,
    errorCode: attemptResult.errorCode,
    errorHash: attemptResult.errorHash
  };

  appendAudit(state.db, {
    event: attemptResult.ok ? "governance.backup.deliver" : "governance.backup.deliver.fail",
    userId: context.user.id,
    teamId: backup.scope.teamIds.length === 1 ? backup.scope.teamIds[0] : undefined,
    detail: {
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      endpointHash: attemptResult.endpointHash ?? "none",
      httpStatus: attemptResult.httpStatus ?? null,
      errorCode: attemptResult.errorCode ?? null,
      errorHash: attemptResult.errorHash ?? null,
      teams: verification.recordCounts.teams,
      projects: verification.recordCounts.projects,
      uploads: verification.recordCounts.uploads,
      auditEvents: verification.recordCounts.auditEvents
    }
  });
  await saveEnterpriseState(state, state.db);
  return result;
}

export function backupCoreChecksPass(verification: SenaEnterpriseBackupVerification) {
  return ["backup-checksum", "backup-record-counts", "backup-secret-exclusions"].every((id) => (
    verification.checks.find((check) => check.id === id)?.status === "pass"
  ));
}
