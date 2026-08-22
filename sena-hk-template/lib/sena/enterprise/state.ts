import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { importSenaProjectSnapshot } from "../snapshot";
import {
  normalizeSenaGroupComparisonValidationResult,
  type SenaGroupComparisonValidationReadModel
} from "../inference";
import {
  normalizeSenaReliabilityDashboard,
  type SenaReliabilityDashboardReadModel
} from "../reliability";
import { SenaEnterpriseError } from "./errors";
import {
  assertEnterpriseReliabilityAdjudicationRecord,
  buildEnterpriseReliabilityAdjudicationCoverage
} from "./reliability-integrity";
import type {
  SenaEnterpriseAnalysisRun,
  SenaEnterpriseImportRun,
  SenaEnterpriseUpload
} from "./import-analysis";
import type {
  SenaEnterpriseApiRateLimit,
  SenaEnterpriseAuthLockout
} from "./auth-security";
import type {
  SenaEnterpriseSsoProvider,
  SenaEnterpriseSsoState
} from "./auth-sso";
import type {
  SenaEnterpriseSession
} from "./auth-session";
import type {
  SenaEnterprisePasswordResetRequest
} from "./auth-password-reset";
import type {
  SenaEnterpriseMfaChallenge,
  SenaEnterpriseMfaFactor,
  SenaEnterpriseMfaSetup
} from "./auth-mfa";
import type {
  SenaEnterpriseInvitation
} from "./auth-invitations";
import type {
  SenaEnterpriseNotification
} from "./notifications-delivery";
import type {
  SenaEnterpriseEmailDelivery
} from "./notifications-email";
import type {
  SenaEnterpriseAuditLogEntry
} from "./ops-audit";
import type {
  SenaEnterpriseGoLiveAttestation
} from "./ops-go-live-attestations";
import type {
  SenaEnterprisePostCutoverObservation
} from "./ops-post-cutover-observations";
import type {
  SenaEnterpriseReleaseGateReview,
  SenaEnterpriseReleaseGateReviewInput,
  SenaEnterpriseReleaseVerificationEvidence
} from "./ops-release-gate";
import type {
  SenaEnterprisePlatformDecisionAcceptance
} from "./ops-platform-decisions";
import type {
  SenaEnterpriseProvisioningMetadata,
  SenaEnterpriseProvisioningSource
} from "./provisioning";
import type {
  SenaEnterpriseRole
} from "./access-control";
import type {
  SenaEnterpriseExpertReview
} from "./expert-review";
import type {
  SenaEnterpriseReliabilityAdjudicationCoverage,
  SenaEnterpriseReliabilityRun
} from "./reliability-runs";
import type {
  SenaEnterpriseValidationRun
} from "./validation-runs";
import type {
  SenaEnterpriseMembership
} from "./team-memberships";
import type {
  SenaEnterpriseAdjudicationRecord,
  SenaEnterpriseCollaborationPubSubEvent,
  SenaEnterpriseProjectComment,
  SenaEnterpriseProjectPresence
} from "./team-collaboration";
import type {
  SenaEnterpriseProject,
  SenaEnterpriseProjectRevision
} from "./team-project";
import type {
  SenaEnterpriseServerJob
} from "./server-job-queue";
import {
  auditWebhookMaxAttempts,
  collaborationPubSubEndpointHash,
  collaborationPubSubMaxAttempts,
  emailWebhookMaxAttempts,
  notificationWebhookMaxAttempts
} from "./webhook-delivery";
import {
  createEnterprisePostgresStateAdapterFromEnv,
  resolveEnterprisePostgresConfig,
  type SenaEnterprisePostgresPool
} from "../enterprise-postgres";

export type SenaEnterpriseUser = {
  id: string;
  email: string;
  name: string;
  organization: string;
  passwordHash?: string;
  ssoIdentities: Array<{ provider: SenaEnterpriseSsoProvider; subject: string; linkedAt: string }>;
  provisioning?: SenaEnterpriseProvisioningMetadata;
  createdAt: string;
  updatedAt: string;
};

/**
 * A retired team. Provisioning is additive-only, so a team is never erased: the
 * audit history and the analysis runs attached to it have to survive. Archival
 * is the team-level twin of the DELETE-as-suspend that user deprovisioning
 * already established — reversible, and recorded with who did it and when.
 *
 * `suspendedMembershipIds` names exactly the memberships this archival
 * deactivated (the ones that were still active), so restoring the team restores
 * that access and nothing else — including memberships the archiving IdP never
 * carried in its own Group payload.
 */
export type SenaEnterpriseTeamArchival = {
  archivedAt: string;
  archivedBy: string;
  source: SenaEnterpriseProvisioningSource;
  suspendedMembershipIds: string[];
};

export type SenaEnterpriseTeam = {
  id: string;
  name: string;
  plan: "individual" | "lab" | "enterprise";
  organization: string;
  /**
   * Role a provisioned member of this team lands on when the request names no
   * role. Persisted because a SCIM Group PatchOp carries only the operation —
   * not the Group extension that configured the default — so without a stored
   * copy a later "add member" silently falls back to viewer. Undefined on teams
   * provisioned before this field existed, which keeps their fallback exactly
   * where it was.
   */
  defaultRole?: SenaEnterpriseRole;
  /** Present only while the team is retired; cleared by re-provisioning. */
  archived?: SenaEnterpriseTeamArchival;
  provisioning?: SenaEnterpriseProvisioningMetadata;
  createdAt: string;
  updatedAt: string;
};

export type SenaEnterpriseDb = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseDb;
  users: SenaEnterpriseUser[];
  teams: SenaEnterpriseTeam[];
  memberships: SenaEnterpriseMembership[];
  invitations: SenaEnterpriseInvitation[];
  sessions: SenaEnterpriseSession[];
  ssoStates: SenaEnterpriseSsoState[];
  authLockouts: SenaEnterpriseAuthLockout[];
  apiRateLimits: SenaEnterpriseApiRateLimit[];
  mfaFactors: SenaEnterpriseMfaFactor[];
  mfaSetups: SenaEnterpriseMfaSetup[];
  mfaChallenges: SenaEnterpriseMfaChallenge[];
  passwordResetRequests: SenaEnterprisePasswordResetRequest[];
  uploads: SenaEnterpriseUpload[];
  importRuns: SenaEnterpriseImportRun[];
  analysisRuns: SenaEnterpriseAnalysisRun[];
  serverJobs: SenaEnterpriseServerJob[];
  projects: SenaEnterpriseProject[];
  projectRevisions: SenaEnterpriseProjectRevision[];
  projectComments: SenaEnterpriseProjectComment[];
  projectPresence: SenaEnterpriseProjectPresence[];
  adjudications: SenaEnterpriseAdjudicationRecord[];
  collaborationEvents: SenaEnterpriseCollaborationPubSubEvent[];
  reliabilityRuns: SenaEnterpriseReliabilityRun[];
  validationRuns: SenaEnterpriseValidationRun[];
  expertReviews: SenaEnterpriseExpertReview[];
  platformDecisionAcceptances: SenaEnterprisePlatformDecisionAcceptance[];
  releaseGateReviews: SenaEnterpriseReleaseGateReview[];
  postCutoverObservations: SenaEnterprisePostCutoverObservation[];
  goLiveAttestations: SenaEnterpriseGoLiveAttestation[];
  notifications: SenaEnterpriseNotification[];
  emailDeliveries: SenaEnterpriseEmailDelivery[];
  auditLog: SenaEnterpriseAuditLogEntry[];
};

export type SenaEnterpriseReliabilityRunReadModel = Omit<SenaEnterpriseReliabilityRun, "dashboard"> & {
  dashboard: SenaReliabilityDashboardReadModel;
};

export type SenaEnterpriseValidationRunReadModel = Omit<SenaEnterpriseValidationRun, "result"> & {
  result: SenaGroupComparisonValidationReadModel;
};

export type SenaEnterpriseDbReadModel = Omit<SenaEnterpriseDb, "reliabilityRuns" | "validationRuns"> & {
  reliabilityRuns: SenaEnterpriseReliabilityRunReadModel[];
  validationRuns: SenaEnterpriseValidationRunReadModel[];
};

const standardSessionDays = 7;
const sessionDays = standardSessionDays;
const dbLockTimeoutMs = positiveIntegerEnv("SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS", 5000);
const dbLockPollMs = 25;
const authLockoutWindowMinutes = positiveIntegerEnv("SENA_AUTH_LOCKOUT_WINDOW_MINUTES", 15);
const defaultUploadScanEngine = "sena-local-upload-scan/v1" as const;

function positiveIntegerEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function emptyEnterpriseDb(): SenaEnterpriseDb {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDb,
    users: [],
    teams: [],
    memberships: [],
    invitations: [],
    sessions: [],
    ssoStates: [],
    authLockouts: [],
    apiRateLimits: [],
    mfaFactors: [],
    mfaSetups: [],
    mfaChallenges: [],
    passwordResetRequests: [],
    uploads: [],
    importRuns: [],
    analysisRuns: [],
    serverJobs: [],
    projects: [],
    projectRevisions: [],
    projectComments: [],
    projectPresence: [],
    adjudications: [],
    collaborationEvents: [],
    reliabilityRuns: [],
    validationRuns: [],
    expertReviews: [],
    platformDecisionAcceptances: [],
    releaseGateReviews: [],
    postCutoverObservations: [],
    goLiveAttestations: [],
    notifications: [],
    emailDeliveries: [],
    auditLog: []
  };
}

function isReleaseVerificationStatus(status: string): status is SenaEnterpriseReleaseVerificationEvidence["status"] {
  return status === "passed" || status === "failed" || status === "not-run";
}

function normalizeReleaseVerificationEvidence(
  input: Partial<SenaEnterpriseReleaseVerificationEvidence> | SenaEnterpriseReleaseGateReviewInput["verificationEvidence"] | undefined,
  command: string,
  recordedAt: string,
  fallbackSummary: string
): SenaEnterpriseReleaseVerificationEvidence {
  const rawStatus = input?.status ?? "not-run";
  if (!isReleaseVerificationStatus(rawStatus)) {
    throw new SenaEnterpriseError("Release verification status is not recognized.", 400, "invalid_release_verification_status");
  }
  const summary = input?.summary?.trim() || fallbackSummary;
  const outputSha256 = input?.outputSha256?.trim().toLowerCase() || createHash("sha256").update([
    command,
    rawStatus,
    summary,
    recordedAt
  ].join("\n")).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(outputSha256)) {
    throw new SenaEnterpriseError("Release verification outputSha256 must be a 64-character SHA-256 hex digest.", 400, "invalid_release_verification_hash");
  }
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence,
    command,
    status: rawStatus,
    summary: summary.slice(0, 2000),
    outputSha256,
    hashAlgorithm: "sha256",
    recordedAt
  };
}

function authLockoutWindowMs() {
  return authLockoutWindowMinutes * 60 * 1000;
}

function pruneAuthLockouts(db: SenaEnterpriseDb) {
  const timestamp = Date.now();
  const staleFailureCutoff = timestamp - authLockoutWindowMs();
  return (db.authLockouts ?? []).filter((lockout) => {
    const lockedUntil = lockout.lockedUntil ? Date.parse(lockout.lockedUntil) : 0;
    if (lockedUntil > timestamp) return true;
    return Date.parse(lockout.lastFailedAt) >= staleFailureCutoff;
  });
}

function pruneApiRateLimits(db: SenaEnterpriseDb) {
  const current = Date.now();
  return (db.apiRateLimits ?? []).filter((record) => Date.parse(record.expiresAt) > current);
}

function normalizedProjectSnapshotFields(snapshotValue: SenaEnterpriseProject["snapshot"]) {
  const snapshot = importSenaProjectSnapshot(snapshotValue);
  const source = snapshot.source.sourceDataset ?? snapshot.dataset;
  return {
    snapshot,
    datasetCounts: {
      people: source.people.length,
      interactions: source.interactions.length,
      utterances: source.utterances.length,
      codedSegments: source.coded_segments.length,
      codes: source.codebook.length
    },
    activeWindowLabel: snapshot.source.activeTemporalWindow?.label ?? "Full conversation",
    claimUse: snapshot.report.claimReadinessGate.claimUse
  };
}

export function normalizeEnterpriseDb(db: SenaEnterpriseDbReadModel): SenaEnterpriseDb {
  const projects = (db.projects ?? []).map((project) => ({
    ...project,
    ...normalizedProjectSnapshotFields(project.snapshot),
    currentVersion: project.currentVersion ?? 1
  }));
  const projectRevisions = (db.projectRevisions ?? []).map((revision) => ({
    ...revision,
    ...normalizedProjectSnapshotFields(revision.snapshot)
  }));
  const adjudications = db.adjudications ?? [];
  const reliabilityProjectByRunId = new Map<string, SenaEnterpriseProject>();
  const reliabilityRuns = (db.reliabilityRuns ?? []).map((run) => {
    const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
    const normalizedRun: SenaEnterpriseReliabilityRun = {
      ...run,
      dashboard,
      projectBinding: dashboard.projectBinding,
      annotationCount: dashboard.derivationEvidence?.annotations.length ?? run.annotationCount,
      coderCount: dashboard.coderCount,
      itemCount: dashboard.itemCount,
      codeCount: dashboard.codeCount,
      meanPairwiseKappa: dashboard.meanPairwiseKappa,
      krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
      disagreementCount: dashboard.disagreementCount,
      status: run.status ?? (dashboard.disagreementCount > 0 ? "pending-adjudication" : "pending-review")
    };
    const project = normalizedRun.projectId
      ? projects.find((candidate) => candidate.id === normalizedRun.projectId)
      : undefined;
    if (normalizedRun.projectId && !project) {
      throw new SenaEnterpriseError(
        "Stored project-bound reliability run has no current project.",
        409,
        "reliability_stored_project_missing"
      );
    }
    const bindingVersion = normalizedRun.projectBinding?.projectVersion;
    const historicalRevision = project && bindingVersion !== project.currentVersion
      ? projectRevisions.find((revision) => (
        revision.projectId === project.id && revision.version === bindingVersion
      ))
      : undefined;
    const coverageProject = project && bindingVersion === project.currentVersion
      ? project
      : project && historicalRevision
        ? { ...project, currentVersion: historicalRevision.version, snapshot: historicalRevision.snapshot }
        : undefined;
    if (project && !coverageProject) {
      throw new SenaEnterpriseError(
        "Stored reliability run cannot be bound to a current or retained project revision.",
        409,
        "reliability_stored_project_binding_invalid"
      );
    }
    if (coverageProject) reliabilityProjectByRunId.set(normalizedRun.id, coverageProject);
    const adjudicationCoverage = coverageProject
      ? buildEnterpriseReliabilityAdjudicationCoverage(normalizedRun, coverageProject, adjudications)
      : {
        schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
        queuedDisagreements: dashboard.adjudicationQueue.length,
        resolvedDisagreements: 0,
        unresolvedDisagreements: dashboard.adjudicationQueue.length,
        coverageRate: dashboard.adjudicationQueue.length === 0 ? 1 : 0,
        decisions: { include: 0, exclude: 0, revise: 0 },
        updatedAt: normalizedRun.reviewedAt ?? normalizedRun.createdAt
      };
    return { ...normalizedRun, adjudicationCoverage };
  });
  for (const record of adjudications) {
    const run = record.reliabilityRunId
      ? reliabilityRuns.find((candidate) => candidate.id === record.reliabilityRunId)
      : undefined;
    const project = run ? reliabilityProjectByRunId.get(run.id) : undefined;
    if (!run || !project) {
      throw new SenaEnterpriseError(
        "Stored adjudication is not bound to a current project reliability run.",
        409,
        "reliability_adjudication_binding_invalid"
      );
    }
    assertEnterpriseReliabilityAdjudicationRecord(run, project, record);
  }
  return {
    ...db,
    sessions: (db.sessions ?? []).map((session) => ({
      ...session,
      sessionProfile: session.sessionProfile ?? "standard",
      ttlDays: session.ttlDays ?? sessionDays
    })),
    projectRevisions,
    projectComments: db.projectComments ?? [],
    projectPresence: db.projectPresence ?? [],
    adjudications,
    collaborationEvents: (db.collaborationEvents ?? []).map((event) => ({
      ...event,
      detail: event.detail ?? {},
      delivery: {
        ...(event.delivery ?? {}),
        provider: event.delivery?.provider ?? "webhook",
        status: event.delivery?.status ?? "pending",
        endpointHash: event.delivery?.endpointHash ?? collaborationPubSubEndpointHash() ?? "",
        queuedAt: event.delivery?.queuedAt ?? event.createdAt,
        attempts: event.delivery?.attempts ?? 0,
        maxAttempts: event.delivery?.maxAttempts ?? collaborationPubSubMaxAttempts()
      }
    })),
    ssoStates: db.ssoStates ?? [],
    authLockouts: db.authLockouts ?? [],
    apiRateLimits: db.apiRateLimits ?? [],
    mfaFactors: db.mfaFactors ?? [],
    mfaSetups: db.mfaSetups ?? [],
    mfaChallenges: db.mfaChallenges ?? [],
    passwordResetRequests: db.passwordResetRequests ?? [],
    platformDecisionAcceptances: db.platformDecisionAcceptances ?? [],
    releaseGateReviews: (db.releaseGateReviews ?? []).map((review) => ({
      ...review,
      verificationEvidence: normalizeReleaseVerificationEvidence(
        review.verificationEvidence,
        review.verificationCommand,
        review.updatedAt ?? review.createdAt,
        `Legacy release gate ${review.releaseVersion} was recorded before verification evidence capture.`
      )
    })),
    postCutoverObservations: db.postCutoverObservations ?? [],
    goLiveAttestations: db.goLiveAttestations ?? [],
    notifications: (db.notifications ?? []).map((notification) => ({
      ...notification,
      detail: notification.detail ?? {},
      webhookDelivery: notification.webhookDelivery ? {
        ...notification.webhookDelivery,
        attempts: notification.webhookDelivery.attempts ?? 0,
        maxAttempts: notification.webhookDelivery.maxAttempts ?? notificationWebhookMaxAttempts()
      } : undefined
    })),
    emailDeliveries: (db.emailDeliveries ?? []).map((delivery) => ({
      ...delivery,
      attempts: delivery.attempts ?? 0,
      maxAttempts: delivery.maxAttempts ?? emailWebhookMaxAttempts()
    })),
    auditLog: (db.auditLog ?? []).map((entry) => ({
      ...entry,
      detail: entry.detail ?? {},
      webhookDelivery: entry.webhookDelivery ? {
        ...entry.webhookDelivery,
        attempts: entry.webhookDelivery.attempts ?? 0,
        maxAttempts: entry.webhookDelivery.maxAttempts ?? auditWebhookMaxAttempts()
      } : undefined
    })),
    uploads: (db.uploads ?? []).map((upload) => ({
      ...upload,
      scanStatus: upload.scanStatus ?? "passed",
      scanEngine: upload.scanEngine ?? defaultUploadScanEngine,
      scanFindings: upload.scanFindings ?? [],
      objectStorageCustody: upload.objectStorageCustody ? {
        ...upload.objectStorageCustody,
        status: upload.objectStorageCustody.status ?? "pending"
      } : undefined
    })),
    importRuns: (db.importRuns ?? []).map((run) => ({
      ...run,
      cleaningManifest: run.cleaningManifest
    })),
    analysisRuns: db.analysisRuns ?? [],
    serverJobs: db.serverJobs ?? [],
    expertReviews: db.expertReviews ?? [],
    reliabilityRuns,
    validationRuns: (db.validationRuns ?? []).map((run) => {
      const project = run.projectId
        ? projects.find((candidate) => candidate.id === run.projectId)
        : undefined;
      const result = normalizeSenaGroupComparisonValidationResult(
        run.result,
        project ? {
          dataset: project.snapshot.dataset,
          buildOptions: project.snapshot.reproducibility.buildOptions
        } : undefined
      );
      return {
        ...run,
        result,
        status: run.status ?? "pending-review",
        preregistrationNote: run.preregistrationNote ?? "",
        methodNote: run.methodNote ?? result.guardrail ?? ""
      };
    }),
    projects
  };
}

function pruneEnterpriseDbBeforeSave(db: SenaEnterpriseDb) {
  const liveSessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  const livePresence = db.projectPresence.filter((presence) => Date.parse(presence.expiresAt) > Date.now());
  const liveSsoStates = (db.ssoStates ?? []).filter((state) => Date.parse(state.expiresAt) > Date.now());
  const liveAuthLockouts = pruneAuthLockouts(db);
  const liveApiRateLimits = pruneApiRateLimits(db);
  const liveMfaSetups = (db.mfaSetups ?? []).filter((setup) => Date.parse(setup.expiresAt) > Date.now());
  const liveMfaChallenges = (db.mfaChallenges ?? []).filter((challenge) => Date.parse(challenge.expiresAt) > Date.now());
  const livePasswordResetRequests = (db.passwordResetRequests ?? [])
    .filter((request) => !request.usedAt && Date.parse(request.expiresAt) > Date.now());
  const retainedEmailDeliveries = (db.emailDeliveries ?? []).slice(0, 2000);
  const retainedCollaborationEvents = (db.collaborationEvents ?? []).slice(0, 2000);
  const retainedServerJobs = (db.serverJobs ?? []).slice(0, 2000);
  return {
    ...db,
    sessions: liveSessions,
    projectPresence: livePresence,
    ssoStates: liveSsoStates,
    authLockouts: liveAuthLockouts,
    apiRateLimits: liveApiRateLimits,
    mfaSetups: liveMfaSetups,
    mfaChallenges: liveMfaChallenges,
    passwordResetRequests: livePasswordResetRequests,
    emailDeliveries: retainedEmailDeliveries,
    collaborationEvents: retainedCollaborationEvents,
    serverJobs: retainedServerJobs
  };
}

export type SenaEnterpriseStateStore = {
  kind: "synchronous-enterprise-state-store";
  read: () => SenaEnterpriseDb;
  write: (db: SenaEnterpriseDb) => void;
  save: (db: SenaEnterpriseDb) => void;
};

export type SenaEnterprisePrimaryStateRuntime = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePrimaryStateRuntime;
  generatedAt: string;
  mode: "file" | "postgres";
  activePrimary: "file" | "postgres";
  postgresConfigured: boolean;
  postgresPrimaryRequested: boolean;
  asyncPrimaryRequired: boolean;
  fileBackendWritePolicy: "research-pilot" | "blocked";
  fileBackendWriteBlocked: boolean;
  postgresConnectionHash?: string;
  evidence: string[];
  missing: string[];
};

export type SenaEnterpriseStateRead = {
  db: SenaEnterpriseDb;
  revision?: number;
  fileRevision?: string;
  runtime: SenaEnterprisePrimaryStateRuntime;
};

function normalizePostgresStateError(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "status" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    throw new SenaEnterpriseError(
      error instanceof Error ? error.message : "SENA enterprise Postgres state error.",
      (error as { status: number }).status,
      (error as { code: string }).code
    );
  }
  throw error;
}

export function createEnterpriseStateStore(input: {
  read: () => SenaEnterpriseDb;
  write: (db: SenaEnterpriseDb) => void;
  save: (db: SenaEnterpriseDb) => void;
}): SenaEnterpriseStateStore {
  return {
    kind: "synchronous-enterprise-state-store",
    read: input.read,
    write: input.write,
    save: input.save
  };
}

export type SenaFileEnterpriseStateWriteOptions = {
  expectedRevision?: string;
};

export type SenaFileEnterpriseStateStore = Omit<SenaEnterpriseStateStore, "read" | "write" | "save"> & {
  adapter: "file-backed-json";
  read: () => SenaEnterpriseDb;
  readState: () => { db: SenaEnterpriseDb; revision: string };
  write: (db: SenaEnterpriseDb, options?: SenaFileEnterpriseStateWriteOptions) => void;
  save: (db: SenaEnterpriseDb, options?: SenaFileEnterpriseStateWriteOptions) => void;
  /**
   * Runs a synchronous read-modify-write while holding the cross-process file
   * lock. The callback is never invoked when lock acquisition fails, and a
   * thrown callback leaves the persisted database unchanged.
   */
  mutateAtomically: <Result>(mutator: (db: SenaEnterpriseDb) => Result) => Result;
  paths: {
    dbDir: string;
    dbPath: string;
    backupPath: string;
    lockPath: string;
  };
  probeLock: () => (
    | { lockProbe: "pass"; lockTimeoutMs: number; lockErrorHash?: undefined }
    | { lockProbe: "fail"; lockTimeoutMs: number; lockErrorHash: string }
  );
  probeWrite: () => (
    | {
      writable: true;
      writeProbe: "pass";
      writePolicy: "research-pilot";
      writeBlockedReason?: undefined;
      writeErrorHash?: undefined;
    }
    | {
      writable: false;
      writeProbe: "fail";
      writePolicy: "research-pilot" | "blocked";
      writeBlockedReason?: string;
      writeErrorHash: string;
    }
  );
  fileStats: () => {
    dbFileExists: boolean;
    dbBytes: number;
    dbUpdatedAt?: string;
    dbBackupExists: boolean;
    dbBackupBytes: number;
    dbBackupUpdatedAt?: string;
  };
};

export type SenaFileEnterpriseStateStoreOptions = {
  dbDir?: string;
  fileName?: string;
  lockTimeoutMs?: number;
  lockPollMs?: number;
  lockStaleMs?: number;
  createEmptyDb: () => SenaEnterpriseDb;
  validateDb?: (db: SenaEnterpriseDbReadModel) => void;
  normalizeDb?: (db: SenaEnterpriseDbReadModel) => SenaEnterpriseDbReadModel;
  pruneBeforeSave?: (db: SenaEnterpriseDb) => SenaEnterpriseDb;
  lockTimeoutError?: () => Error;
};

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fileLockOwnerAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    // EPERM still proves that a process owns this pid; only ESRCH is a
    // positive dead-owner signal.
    return code !== "ESRCH";
  }
}

function reclaimStaleFileStateLock(lockPath: string, staleMs: number) {
  try {
    const observed = readFileSync(lockPath, "utf8");
    const match = /^(\d+):(\d+):/.exec(observed);
    const ownerPid = match ? Number(match[1]) : undefined;
    const acquiredAt = match ? Number(match[2]) : undefined;
    const statAge = Math.max(0, Date.now() - statSync(lockPath).mtimeMs);
    const declaredAge = Number.isSafeInteger(acquiredAt) && acquiredAt! >= 0
      ? Math.max(0, Date.now() - acquiredAt!)
      : statAge;
    if (Math.max(statAge, declaredAge) < staleMs) return false;
    if (ownerPid !== undefined && fileLockOwnerAlive(ownerPid)) return false;
    // Re-read the owner token immediately before unlinking. A prior owner may
    // have released the path and a new writer acquired it during inspection.
    if (readFileSync(lockPath, "utf8") !== observed) return false;
    unlinkSync(lockPath);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    return code === "ENOENT";
  }
}

function acquireFileStateLock(input: {
  dbDir: string;
  lockPath: string;
  timeoutMs: number;
  pollMs: number;
  staleMs: number;
  lockTimeoutError?: () => Error;
}) {
  if (!existsSync(input.dbDir)) mkdirSync(input.dbDir, { recursive: true });
  const startedAt = Date.now();
  const lockId = `${process.pid}:${Date.now()}:${randomBytes(4).toString("hex")}`;
  while (true) {
    try {
      writeFileSync(input.lockPath, lockId, { flag: "wx" });
      return lockId;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code !== "EEXIST") throw error;
      if (reclaimStaleFileStateLock(input.lockPath, input.staleMs)) continue;
      if (Date.now() - startedAt >= input.timeoutMs) {
        throw input.lockTimeoutError?.() ?? new Error("Timed out waiting for SENA enterprise database write lock.");
      }
      sleepSync(input.pollMs);
    }
  }
}

function releaseFileStateLock(lockPath: string, lockId: string) {
  try {
    if (!existsSync(lockPath)) return;
    const current = readFileSync(lockPath, "utf8");
    if (current === lockId) unlinkSync(lockPath);
  } catch {
    // Lock cleanup failure is reported on the next storage health probe.
  }
}

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export type SenaEnterpriseFileStateWritePolicy = {
  mode: "research-pilot" | "blocked";
  blocked: boolean;
  blockingReasons: string[];
  evidence: string[];
};

// This gate is deliberately NOT senaProductionPosture() (auth-config.ts):
// SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH blocks file-backed writes only in
// combination with NODE_ENV=production, which is why its blocking reason is the
// compound label below. The other two posture flags block on their own, matching
// the canonical predicate. The divergence is pinned by
// production-posture-predicate-agreement.test.ts — aligning this gate with the
// canonical posture is a behaviour change, not a refactor.
export function enterpriseFileStateWritePolicy(): SenaEnterpriseFileStateWritePolicy {
  const productionPerformancePathRequired = booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH");
  const productionPerformancePathHardGate = process.env.NODE_ENV === "production" && productionPerformancePathRequired;
  const productionEvidenceManifestRequired = booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED");
  const platformSaasOperatingModelApproved = booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED");
  const postgresPrimaryActive = primaryStateMode() === "postgres" && resolveEnterprisePostgresConfig().configured;
  const blockingReasons = [
    productionPerformancePathHardGate ? "NODE_ENV=production+SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH" : null,
    productionEvidenceManifestRequired ? "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED" : null,
    platformSaasOperatingModelApproved ? "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED" : null
  ].filter((reason): reason is string => Boolean(reason));
  const blocked = blockingReasons.length > 0;
  return {
    mode: blocked ? "blocked" : "research-pilot",
    blocked,
    blockingReasons,
    evidence: [
      `fileBackendWritePolicy=${blocked ? "blocked" : "research-pilot"}`,
      `fileBackendWriteBlocked=${blocked}`,
      `fileBackendWriteBlockReasons=${blockingReasons.join("|") || "none"}`,
      `fileBackendPostgresPrimaryActive=${postgresPrimaryActive}`,
      `fileBackendProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `fileBackendProductionPerformancePathRequired=${productionPerformancePathRequired}`,
      `fileBackendProductionPerformancePathHardGate=${productionPerformancePathHardGate}`,
      `fileBackendProductionEvidenceManifestRequired=${productionEvidenceManifestRequired}`,
      `fileBackendSaasOperatingModelApproved=${platformSaasOperatingModelApproved}`
    ]
  };
}

function enterpriseFileStateWriteBlockedError() {
  return new SenaEnterpriseError(
    "SENA enterprise file-backed state writes are blocked for production-claim gates. Use the primary Postgres state store instead of writing .sena-enterprise/enterprise-db.json.",
    503,
    "enterprise_file_state_production_write_blocked"
  );
}

function enterpriseFileStateWriteErrorHash(policy: SenaEnterpriseFileStateWritePolicy) {
  return createHash("sha256").update([
    "enterprise_file_state_production_write_blocked",
    policy.blockingReasons.join("|") || "none"
  ].join("\n")).digest("hex");
}

function enterpriseFileStateRevisionConflictError() {
  return new SenaEnterpriseError(
    "SENA enterprise file state changed after this snapshot was read.",
    409,
    "enterprise_file_state_revision_conflict"
  );
}

function enterpriseFileStateUntrackedSnapshotError() {
  return new SenaEnterpriseError(
    "SENA enterprise file state writes require a tracked read snapshot or an explicitly authorized overwrite.",
    409,
    "enterprise_file_state_untracked_snapshot"
  );
}

function postgresPrimaryStateActiveForFileBackend() {
  return primaryStateMode() === "postgres" && resolveEnterprisePostgresConfig().configured;
}

export function createFileEnterpriseStateStore(options: SenaFileEnterpriseStateStoreOptions): SenaFileEnterpriseStateStore {
  const dbDir = options.dbDir || process.env.SENA_ENTERPRISE_DB_DIR || path.join(process.cwd(), ".sena-enterprise");
  const dbPath = path.join(dbDir, options.fileName ?? "enterprise-db.json");
  const backupPath = `${dbPath}.bak`;
  const lockPath = `${dbPath}.lock`;
  const timeoutMs = options.lockTimeoutMs ?? 5000;
  const pollMs = options.lockPollMs ?? 25;
  const staleMs = options.lockStaleMs ?? Math.max(1000, timeoutMs);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 ||
    !Number.isSafeInteger(pollMs) || pollMs <= 0 ||
    !Number.isSafeInteger(staleMs) || staleMs < 0) {
    throw new Error("Enterprise file-state lock timing options must be safe non-negative integers.");
  }
  const normalizeDb = (db: SenaEnterpriseDbReadModel) => normalizeEnterpriseDb(
    options.normalizeDb ? options.normalizeDb(db) : db
  );
  const pruneBeforeSave = options.pruneBeforeSave ?? ((db: SenaEnterpriseDb) => db);
  const trackedRevisions = new WeakMap<SenaEnterpriseDb, string>();
  const missingRevision = createHash("sha256")
    .update("sena-enterprise-file-state:missing")
    .digest("hex");

  const revisionOf = (serialized: string) => createHash("sha256").update(serialized).digest("hex");

  const parsePersisted = () => {
    const serialized = readFileSync(dbPath, "utf8");
    const parsed = JSON.parse(serialized) as SenaEnterpriseDbReadModel;
    options.validateDb?.(parsed);
    return {
      db: normalizeDb(parsed),
      revision: revisionOf(serialized)
    };
  };

  const persistWithoutLock = (db: SenaEnterpriseDb) => {
    options.validateDb?.(db);
    const tmpPath = `${dbPath}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      const serialized = JSON.stringify(db, null, 2);
      JSON.parse(serialized);
      if (existsSync(dbPath)) copyFileSync(dbPath, backupPath);
      writeFileSync(tmpPath, serialized);
      renameSync(tmpPath, dbPath);
      return revisionOf(serialized);
    } finally {
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {
          // Best effort cleanup; ops health reports storage writability separately.
        }
      }
    }
  };

  const acquireWriteLock = () => {
    const fileWritePolicy = enterpriseFileStateWritePolicy();
    if (fileWritePolicy.blocked) throw enterpriseFileStateWriteBlockedError();
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    return acquireFileStateLock({
      dbDir,
      lockPath,
      timeoutMs,
      pollMs,
      staleMs,
      lockTimeoutError: options.lockTimeoutError
    });
  };

  const write = (db: SenaEnterpriseDb, writeOptions: SenaFileEnterpriseStateWriteOptions = {}) => {
    if (enterpriseFileStateWritePolicy().blocked) throw enterpriseFileStateWriteBlockedError();
    const expectedRevision = writeOptions.expectedRevision ?? trackedRevisions.get(db);
    if (!expectedRevision) throw enterpriseFileStateUntrackedSnapshotError();
    const lockId = acquireWriteLock();
    try {
      const currentRevision = existsSync(dbPath)
        ? revisionOf(readFileSync(dbPath, "utf8"))
        : missingRevision;
      if (currentRevision !== expectedRevision) {
        throw enterpriseFileStateRevisionConflictError();
      }
      const nextRevision = persistWithoutLock(db);
      trackedRevisions.set(db, nextRevision);
    } finally {
      releaseFileStateLock(lockPath, lockId);
    }
  };

  const mutateAtomically = <Result>(mutator: (db: SenaEnterpriseDb) => Result) => {
    const lockId = acquireWriteLock();
    try {
      const current = existsSync(dbPath)
        ? parsePersisted()
        : { db: normalizeDb(options.createEmptyDb()), revision: missingRevision };
      const db = current.db;
      const normalizedBaseline = JSON.stringify(db);
      const result = mutator(db);
      const normalizedAfter = JSON.stringify(db);
      const nextRevision = normalizedAfter === normalizedBaseline
        ? current.revision
        : persistWithoutLock(db);
      trackedRevisions.set(db, nextRevision);
      return result;
    } finally {
      releaseFileStateLock(lockPath, lockId);
    }
  };

  const readState = () => {
    // Do not create the store directory on the read path: serverless runtimes
    // (Vercel) have a read-only cwd, and non-persisting reads must return the
    // empty state without touching the filesystem. write() creates the
    // directory itself when persistence is actually allowed.
    if (!existsSync(dbPath)) {
      const db = options.createEmptyDb();
      if (enterpriseFileStateWritePolicy().blocked || postgresPrimaryStateActiveForFileBackend()) {
        const normalized = normalizeDb(db);
        trackedRevisions.set(normalized, missingRevision);
        return { db: normalized, revision: missingRevision };
      }
      const lockId = acquireWriteLock();
      try {
        if (!existsSync(dbPath)) persistWithoutLock(db);
      } finally {
        releaseFileStateLock(lockPath, lockId);
      }
    }

    const state = parsePersisted();
    trackedRevisions.set(state.db, state.revision);
    return state;
  };

  const read = () => readState().db;

  const save = (db: SenaEnterpriseDb, writeOptions: SenaFileEnterpriseStateWriteOptions = {}) => {
    const expectedRevision = writeOptions.expectedRevision ?? trackedRevisions.get(db);
    const pruned = pruneBeforeSave(db);
    write(pruned, {
      ...writeOptions,
      expectedRevision
    });
    const nextRevision = trackedRevisions.get(pruned);
    if (nextRevision) trackedRevisions.set(db, nextRevision);
  };

  return {
    kind: "synchronous-enterprise-state-store",
    adapter: "file-backed-json",
    paths: {
      dbDir,
      dbPath,
      backupPath,
      lockPath
    },
    read,
    readState,
    write,
    save,
    mutateAtomically,
    probeLock: () => {
      let lockId = "";
      try {
        lockId = acquireFileStateLock({
          dbDir,
          lockPath,
          timeoutMs: Math.min(250, timeoutMs),
          pollMs,
          staleMs,
          lockTimeoutError: options.lockTimeoutError
        });
        return { lockProbe: "pass", lockTimeoutMs: timeoutMs };
      } catch (error) {
        const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
        return {
          lockProbe: "fail",
          lockTimeoutMs: timeoutMs,
          lockErrorHash: createHash("sha256").update(message).digest("hex")
        };
      } finally {
        if (lockId) releaseFileStateLock(lockPath, lockId);
      }
    },
    probeWrite: () => {
      const fileWritePolicy = enterpriseFileStateWritePolicy();
      if (fileWritePolicy.blocked) {
        return {
          writable: false,
          writeProbe: "fail",
          writePolicy: "blocked",
          writeBlockedReason: fileWritePolicy.blockingReasons.join("|") || "production-claim",
          writeErrorHash: enterpriseFileStateWriteErrorHash(fileWritePolicy)
        };
      }
      try {
        if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
        const probePath = path.join(dbDir, `.ops-write-probe-${process.pid}-${Date.now()}.tmp`);
        writeFileSync(probePath, "ok");
        unlinkSync(probePath);
        return { writable: true, writeProbe: "pass", writePolicy: "research-pilot" };
      } catch (error) {
        const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
        return {
          writable: false,
          writeProbe: "fail",
          writePolicy: "research-pilot",
          writeErrorHash: createHash("sha256").update(message).digest("hex")
        };
      }
    },
    fileStats: () => {
      const backupStat = existsSync(backupPath) ? statSync(backupPath) : null;
      if (!existsSync(dbPath)) {
        return {
          dbFileExists: false,
          dbBytes: 0,
          dbBackupExists: Boolean(backupStat),
          dbBackupBytes: backupStat?.size ?? 0,
          dbBackupUpdatedAt: backupStat?.mtime.toISOString()
        };
      }
      const stat = statSync(dbPath);
      return {
        dbFileExists: true,
        dbBytes: stat.size,
        dbUpdatedAt: stat.mtime.toISOString(),
        dbBackupExists: Boolean(backupStat),
        dbBackupBytes: backupStat?.size ?? 0,
        dbBackupUpdatedAt: backupStat?.mtime.toISOString()
      };
    }
  };
}

let enterpriseFileStateStore: SenaFileEnterpriseStateStore | null = null;
let enterprisePostgresStateStore: {
  adapter: ReturnType<typeof createEnterprisePostgresStateAdapterFromEnv>["adapter"];
  pool: SenaEnterprisePostgresPool;
} | null = null;

function createEnterpriseFileStateStore() {
  return createFileEnterpriseStateStore({
    dbDir: process.env.SENA_ENTERPRISE_DB_DIR || ".sena-enterprise",
    lockTimeoutMs: dbLockTimeoutMs,
    lockPollMs: dbLockPollMs,
    createEmptyDb: emptyEnterpriseDb,
    validateDb: (db) => {
      if (db.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseDb) {
        throw new SenaEnterpriseError("Unsupported SENA enterprise database schema.", 500, "unsupported_enterprise_db");
      }
    },
    pruneBeforeSave: pruneEnterpriseDbBeforeSave,
    lockTimeoutError: () => new SenaEnterpriseError("Timed out waiting for SENA enterprise database write lock.", 503, "enterprise_db_lock_timeout")
  });
}

function enterpriseStateStore() {
  enterpriseFileStateStore ??= createEnterpriseFileStateStore();
  return enterpriseFileStateStore;
}

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function primaryStateMode() {
  const mode = envValue("SENA_ENTERPRISE_STATE_STORE")?.toLowerCase().replace(/_/g, "-");
  return mode === "postgres" ? "postgres" : "file";
}

function postgresPrimaryStateStore() {
  enterprisePostgresStateStore ??= createEnterprisePostgresStateAdapterFromEnv({
    initialDb: emptyEnterpriseDb
  });
  return enterprisePostgresStateStore;
}

export function getEnterprisePrimaryStateRuntime(): SenaEnterprisePrimaryStateRuntime {
  const postgresConfig = resolveEnterprisePostgresConfig();
  const postgresPrimaryRequested = primaryStateMode() === "postgres";
  const activePrimary = postgresPrimaryRequested && postgresConfig.configured ? "postgres" : "file";
  const fileWritePolicy = enterpriseFileStateWritePolicy();
  const missing = [
    postgresPrimaryRequested ? null : "SENA_ENTERPRISE_STATE_STORE=postgres",
    ...postgresConfig.missingEnv
  ].filter((value): value is string => Boolean(value));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePrimaryStateRuntime,
    generatedAt: new Date().toISOString(),
    mode: primaryStateMode(),
    activePrimary,
    postgresConfigured: postgresConfig.configured,
    postgresPrimaryRequested,
    asyncPrimaryRequired: postgresPrimaryRequested,
    fileBackendWritePolicy: fileWritePolicy.mode,
    fileBackendWriteBlocked: fileWritePolicy.blocked,
    postgresConnectionHash: postgresConfig.connectionHash,
    evidence: [
      `stateStore=${primaryStateMode()}`,
      `activePrimary=${activePrimary}`,
      `postgresConfigured=${postgresConfig.configured}`,
      `postgresPrimaryRequested=${postgresPrimaryRequested}`,
      `postgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`,
      "fileBackend=.sena-enterprise/enterprise-db.json",
      "fileBackendProductionUse=false",
      ...fileWritePolicy.evidence
    ],
    missing
  };
}

export function readEnterpriseDb(): SenaEnterpriseDb {
  return enterpriseStateStore().read();
}

export function writeEnterpriseDb(db: SenaEnterpriseDb, options?: SenaFileEnterpriseStateWriteOptions) {
  enterpriseStateStore().write(db, options);
}

export function mutateEnterpriseDbAtomically<Result>(mutator: (db: SenaEnterpriseDb) => Result) {
  return enterpriseStateStore().mutateAtomically(mutator);
}

type SenaEnterpriseStateMutationOutcome<Result> =
  | { ok: true; result: Result }
  | { ok: false; error: unknown };

function runPersistedMutation<Result>(db: SenaEnterpriseDb, mutator: (db: SenaEnterpriseDb) => Result) {
  try {
    return { ok: true, result: mutator(db) } satisfies SenaEnterpriseStateMutationOutcome<Result>;
  } catch (error) {
    return { ok: false, error } satisfies SenaEnterpriseStateMutationOutcome<Result>;
  }
}

function unwrapPersistedMutation<Result>(outcome: SenaEnterpriseStateMutationOutcome<Result>) {
  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}

function postgresRevisionConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error as { code?: unknown }).code === "postgres_state_revision_conflict");
}

/**
 * Serializes security-sensitive read-modify-write operations. Application
 * errors are captured until their counters/audits have committed, so a failed
 * login or over-budget request cannot lose evidence or have its 401/429 masked
 * by a whole-state revision conflict.
 */
export async function mutateEnterpriseStateAtomically<Result>(
  mutator: (db: SenaEnterpriseDb) => Result
): Promise<Result> {
  const runtime = getEnterprisePrimaryStateRuntime();
  if (runtime.activePrimary === "file") {
    const outcome = enterpriseStateStore().mutateAtomically((db) => runPersistedMutation(db, mutator));
    return unwrapPersistedMutation(outcome);
  }

  const adapter = postgresPrimaryStateStore().adapter;
  const maximumAttempts = 32;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let current;
    try {
      current = await adapter.readState();
    } catch (error) {
      normalizePostgresStateError(error);
    }
    const db = normalizeEnterpriseDb(current.db);
    const normalizedBaseline = JSON.stringify(db);
    const outcome = runPersistedMutation(db, mutator);
    if (JSON.stringify(db) === normalizedBaseline) return unwrapPersistedMutation(outcome);
    try {
      await adapter.writeState(pruneEnterpriseDbBeforeSave(db), {
        expectedRevision: current.revision
      });
      return unwrapPersistedMutation(outcome);
    } catch (error) {
      if (postgresRevisionConflict(error) && attempt < maximumAttempts) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(25, attempt)));
        continue;
      }
      normalizePostgresStateError(error);
    }
  }
  throw new SenaEnterpriseError(
    "SENA enterprise state could not serialize the security mutation.",
    503,
    "enterprise_state_atomic_mutation_exhausted"
  );
}

export function saveDb(db: SenaEnterpriseDb, options?: SenaFileEnterpriseStateWriteOptions) {
  enterpriseStateStore().save(db, options);
}

export function createConfiguredFileEnterpriseStateStore(): SenaFileEnterpriseStateStore {
  return enterpriseStateStore();
}

export async function readEnterpriseState(): Promise<SenaEnterpriseStateRead> {
  const runtime = getEnterprisePrimaryStateRuntime();
  if (runtime.activePrimary === "postgres") {
    try {
      const state = await postgresPrimaryStateStore().adapter.readState();
      return {
        db: normalizeEnterpriseDb(state.db),
        revision: state.revision,
        runtime
      };
    } catch (error) {
      normalizePostgresStateError(error);
    }
  }
  const state = enterpriseStateStore().readState();
  return {
    db: state.db,
    fileRevision: state.revision,
    runtime
  };
}

export async function writeEnterpriseState(state: SenaEnterpriseStateRead, db: SenaEnterpriseDb) {
  if (state.runtime.activePrimary === "postgres") {
    try {
      await postgresPrimaryStateStore().adapter.writeState(db, {
        expectedRevision: state.revision
      });
    } catch (error) {
      normalizePostgresStateError(error);
    }
    return;
  }
  enterpriseStateStore().write(db, {
    expectedRevision: state.fileRevision
  });
}

export async function saveEnterpriseState(state: SenaEnterpriseStateRead, db: SenaEnterpriseDb) {
  if (state.runtime.activePrimary === "postgres") {
    try {
      await postgresPrimaryStateStore().adapter.writeState(pruneEnterpriseDbBeforeSave(db), {
        expectedRevision: state.revision
      });
    } catch (error) {
      normalizePostgresStateError(error);
    }
    return;
  }
  enterpriseStateStore().save(db, {
    expectedRevision: state.fileRevision
  });
}
