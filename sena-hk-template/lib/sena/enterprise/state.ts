import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
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
  SenaEnterpriseProvisioningMetadata
} from "./provisioning";
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
import {
  auditWebhookMaxAttempts,
  collaborationPubSubEndpointHash,
  collaborationPubSubMaxAttempts,
  emailWebhookMaxAttempts,
  notificationWebhookMaxAttempts
} from "./webhook-delivery";

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

export type SenaEnterpriseTeam = {
  id: string;
  name: string;
  plan: "individual" | "lab" | "enterprise";
  organization: string;
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

export function normalizeEnterpriseDb(db: SenaEnterpriseDb): SenaEnterpriseDb {
  return {
    ...db,
    sessions: (db.sessions ?? []).map((session) => ({
      ...session,
      sessionProfile: session.sessionProfile ?? "standard",
      ttlDays: session.ttlDays ?? sessionDays
    })),
    projectRevisions: db.projectRevisions ?? [],
    projectComments: db.projectComments ?? [],
    projectPresence: db.projectPresence ?? [],
    adjudications: db.adjudications ?? [],
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
      scanFindings: upload.scanFindings ?? []
    })),
    importRuns: (db.importRuns ?? []).map((run) => ({
      ...run,
      cleaningManifest: run.cleaningManifest
    })),
    analysisRuns: db.analysisRuns ?? [],
    expertReviews: db.expertReviews ?? [],
    reliabilityRuns: (db.reliabilityRuns ?? []).map((run) => {
      const normalizedRun = {
        ...run,
        status: run.status ?? (run.disagreementCount > 0 ? "pending-adjudication" : "pending-review")
      };
      return {
        ...normalizedRun,
        adjudicationCoverage: buildReliabilityAdjudicationCoverage(normalizedRun, db.adjudications ?? [])
      };
    }),
    validationRuns: (db.validationRuns ?? []).map((run) => ({
      ...run,
      status: run.status ?? "pending-review",
      preregistrationNote: run.preregistrationNote ?? "",
      methodNote: run.methodNote ?? run.result?.guardrail ?? ""
    })),
    projects: (db.projects ?? []).map((project) => ({
      ...project,
      currentVersion: project.currentVersion ?? 1
    }))
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
    collaborationEvents: retainedCollaborationEvents
  };
}

export type SenaEnterpriseStateStore = {
  kind: "synchronous-enterprise-state-store";
  read: () => SenaEnterpriseDb;
  write: (db: SenaEnterpriseDb) => void;
  save: (db: SenaEnterpriseDb) => void;
};

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

export type SenaFileEnterpriseStateStore = SenaEnterpriseStateStore & {
  adapter: "file-backed-json";
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
    | { writable: true; writeProbe: "pass"; writeErrorHash?: undefined }
    | { writable: false; writeProbe: "fail"; writeErrorHash: string }
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
  createEmptyDb: () => SenaEnterpriseDb;
  validateDb?: (db: SenaEnterpriseDb) => void;
  normalizeDb?: (db: SenaEnterpriseDb) => SenaEnterpriseDb;
  pruneBeforeSave?: (db: SenaEnterpriseDb) => SenaEnterpriseDb;
  lockTimeoutError?: () => Error;
};

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireFileStateLock(input: {
  dbDir: string;
  lockPath: string;
  timeoutMs: number;
  pollMs: number;
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

export function createFileEnterpriseStateStore(options: SenaFileEnterpriseStateStoreOptions): SenaFileEnterpriseStateStore {
  const dbDir = options.dbDir || process.env.SENA_ENTERPRISE_DB_DIR || path.join(process.cwd(), ".sena-enterprise");
  const dbPath = path.join(dbDir, options.fileName ?? "enterprise-db.json");
  const backupPath = `${dbPath}.bak`;
  const lockPath = `${dbPath}.lock`;
  const timeoutMs = options.lockTimeoutMs ?? 5000;
  const pollMs = options.lockPollMs ?? 25;
  const normalizeDb = options.normalizeDb ?? ((db: SenaEnterpriseDb) => db);
  const pruneBeforeSave = options.pruneBeforeSave ?? ((db: SenaEnterpriseDb) => db);

  const write = (db: SenaEnterpriseDb) => {
    options.validateDb?.(db);
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    const lockId = acquireFileStateLock({
      dbDir,
      lockPath,
      timeoutMs,
      pollMs,
      lockTimeoutError: options.lockTimeoutError
    });
    const tmpPath = `${dbPath}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      const serialized = JSON.stringify(db, null, 2);
      JSON.parse(serialized);
      if (existsSync(dbPath)) copyFileSync(dbPath, backupPath);
      writeFileSync(tmpPath, serialized);
      renameSync(tmpPath, dbPath);
    } finally {
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {
          // Best effort cleanup; ops health reports storage writability separately.
        }
      }
      releaseFileStateLock(lockPath, lockId);
    }
  };

  const read = () => {
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    if (!existsSync(dbPath)) {
      const db = options.createEmptyDb();
      write(db);
      return db;
    }

    const parsed = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
    options.validateDb?.(parsed);
    return normalizeDb(parsed);
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
    write,
    save: (db) => write(pruneBeforeSave(db)),
    probeLock: () => {
      let lockId = "";
      try {
        lockId = acquireFileStateLock({
          dbDir,
          lockPath,
          timeoutMs: Math.min(250, timeoutMs),
          pollMs,
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
      try {
        if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
        const probePath = path.join(dbDir, `.ops-write-probe-${process.pid}-${Date.now()}.tmp`);
        writeFileSync(probePath, "ok");
        unlinkSync(probePath);
        return { writable: true, writeProbe: "pass" };
      } catch (error) {
        const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
        return {
          writable: false,
          writeProbe: "fail",
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
    normalizeDb: normalizeEnterpriseDb,
    pruneBeforeSave: pruneEnterpriseDbBeforeSave,
    lockTimeoutError: () => new SenaEnterpriseError("Timed out waiting for SENA enterprise database write lock.", 503, "enterprise_db_lock_timeout")
  });
}

function enterpriseStateStore() {
  enterpriseFileStateStore ??= createEnterpriseFileStateStore();
  return enterpriseFileStateStore;
}

export function readEnterpriseDb(): SenaEnterpriseDb {
  return enterpriseStateStore().read();
}

export function writeEnterpriseDb(db: SenaEnterpriseDb) {
  enterpriseStateStore().write(db);
}

export function saveDb(db: SenaEnterpriseDb) {
  enterpriseStateStore().save(db);
}

export function createConfiguredFileEnterpriseStateStore(): SenaFileEnterpriseStateStore {
  return enterpriseStateStore();
}
