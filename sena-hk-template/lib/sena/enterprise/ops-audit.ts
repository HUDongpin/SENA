import { createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  hasEnterprisePermission,
  requireEnterprisePermission
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import type { SenaEnterpriseGovernanceCheck } from "./ops-governance";
import {
  createEnterprisePostgresAuditLogAdapterFromEnv,
  resolveEnterprisePostgresConfig,
  type SenaEnterprisePostgresPool
} from "../enterprise-postgres";
import type { SenaEnterpriseDb } from "./state";
import {
  getEnterprisePrimaryStateRuntime,
  readEnterpriseDb,
  readEnterpriseState,
  saveDb,
  saveEnterpriseState
} from "./state";
import {
  auditWebhookProvider,
  auditWebhookSecret,
  auditWebhookTimeoutMs,
  auditWebhookUrl,
  localWebhookSinkAttempt,
  webhookErrorHash,
  webhookQueueProvider,
  webhookRetryAt,
  type SenaEnterpriseWebhookProviderMode,
  type SenaEnterpriseWebhookQueueProvider
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

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function enterpriseDeploymentMode(): "institution-managed" | "self-managed" {
  const mode = (envValue("SENA_ENTERPRISE_DEPLOYMENT_MODE") ?? envValue("SENA_ENTERPRISE_MODE") ?? "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (mode === "self-managed" || envValue("SENA_SELF_MANAGED_ENTERPRISE") === "1") return "self-managed";
  return "institution-managed";
}

function isSelfManagedEnterpriseMode() {
  return enterpriseDeploymentMode() === "self-managed";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function authEmailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function authEmailDomain(email: string) {
  return normalizeEmail(email).split("@").at(-1) || "unknown";
}

function manageableTeamIds(context: SenaEnterpriseSessionContext) {
  return context.memberships
    .filter((membership) => membership.status === "active" && hasEnterprisePermission(context, membership.teamId, "team:manage"))
    .map((membership) => membership.teamId);
}

export type SenaEnterpriseAuditEvent =
  | "auth.register"
  | "auth.login"
  | "auth.login.failed"
  | "auth.login.locked"
  | "auth.mfa.setup"
  | "auth.mfa.enable"
  | "auth.mfa.challenge"
  | "auth.mfa.verify"
  | "auth.mfa.disable"
  | "auth.password_reset.request"
  | "auth.password_reset.complete"
  | "auth.logout"
  | "auth.session.revoke"
  | "auth.sso"
  | "auth.sso.preflight.pass"
  | "auth.sso.preflight.fail"
  | "security.csrf.fail"
  | "security.rate_limit"
  | "notification.queue"
  | "notification.read"
  | "notification.webhook.deliver"
  | "notification.webhook.fail"
  | "email.queue"
  | "email.webhook.deliver"
  | "email.webhook.fail"
  | "provisioning.sync"
  | "team.invite"
  | "team.invite.accept"
  | "team.invite.revoke"
  | "team.membership.update"
  | "project.create"
  | "project.read"
  | "project.update"
  | "project.restore"
  | "project.delete"
  | "project.comment"
  | "project.comment.resolve"
  | "project.presence"
  | "project.adjudicate"
  | "collaboration.pubsub.deliver"
  | "collaboration.pubsub.fail"
  | "upload.create"
  | "upload.object_storage.deliver"
  | "upload.object_storage.fail"
  | "analysis.run"
  | "analysis.queue"
  | "import.run"
  | "import.queue"
  | "reliability.run"
  | "reliability.queue"
  | "reliability.adjudicate"
  | "reliability.review"
  | "expert.review"
  | "inference.run"
  | "validation.queue"
  | "validation.review"
  | "export.run"
  | "export.queue"
  | "governance.backup"
  | "governance.backup.verify"
  | "governance.backup.deliver"
  | "governance.backup.deliver.fail"
  | "governance.database_sync.deliver"
  | "governance.database_sync.fail"
  | "ops.alert.deliver"
  | "ops.alert.deliver.fail"
  | "ops.server_job.status"
  | "ops.platform_decision.review"
  | "ops.release_gate.review"
  | "ops.post_cutover_observation.start"
  | "ops.post_cutover_observation.sample"
  | "ops.post_cutover_observation.complete"
  | "ops.go_live.attestation"
  | "governance.backup.restore"
  | "governance.audit.export";

export const enterpriseAuditEvents: SenaEnterpriseAuditEvent[] = [
  "auth.register",
  "auth.login",
  "auth.login.failed",
  "auth.login.locked",
  "auth.mfa.setup",
  "auth.mfa.enable",
  "auth.mfa.challenge",
  "auth.mfa.verify",
  "auth.mfa.disable",
  "auth.password_reset.request",
  "auth.password_reset.complete",
  "auth.logout",
  "auth.session.revoke",
  "auth.sso",
  "auth.sso.preflight.pass",
  "auth.sso.preflight.fail",
  "security.csrf.fail",
  "security.rate_limit",
  "notification.queue",
  "notification.read",
  "notification.webhook.deliver",
  "notification.webhook.fail",
  "email.queue",
  "email.webhook.deliver",
  "email.webhook.fail",
  "provisioning.sync",
  "team.invite",
  "team.invite.accept",
  "team.invite.revoke",
  "team.membership.update",
  "project.create",
  "project.read",
  "project.update",
  "project.restore",
  "project.delete",
  "project.comment",
  "project.comment.resolve",
  "project.presence",
  "project.adjudicate",
  "collaboration.pubsub.deliver",
  "collaboration.pubsub.fail",
  "upload.create",
  "upload.object_storage.deliver",
  "upload.object_storage.fail",
  "analysis.run",
  "analysis.queue",
  "import.run",
  "import.queue",
  "reliability.run",
  "reliability.queue",
  "reliability.adjudicate",
  "reliability.review",
  "expert.review",
  "inference.run",
  "validation.queue",
  "validation.review",
  "export.run",
  "export.queue",
  "governance.backup",
  "governance.backup.verify",
  "governance.backup.deliver",
  "governance.backup.deliver.fail",
  "governance.database_sync.deliver",
  "governance.database_sync.fail",
  "ops.alert.deliver",
  "ops.alert.deliver.fail",
  "ops.server_job.status",
  "ops.platform_decision.review",
  "ops.release_gate.review",
  "ops.post_cutover_observation.start",
  "ops.post_cutover_observation.sample",
  "ops.post_cutover_observation.complete",
  "ops.go_live.attestation",
  "governance.backup.restore",
  "governance.audit.export"
];

export function isEnterpriseAuditEvent(value: string): value is SenaEnterpriseAuditEvent {
  return enterpriseAuditEvents.includes(value as SenaEnterpriseAuditEvent);
}

export type SenaEnterpriseAuditWebhookDeliveryStatus = "pending" | "delivered" | "failed";

export type SenaEnterpriseAuditWebhookDelivery = {
  provider: SenaEnterpriseWebhookQueueProvider;
  status: SenaEnterpriseAuditWebhookDeliveryStatus;
  endpointHash: string;
  queuedAt: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  lastStatus?: number;
  lastErrorCode?: string;
  lastErrorHash?: string;
};

export type SenaEnterpriseAuditLogEntry = {
  id: string;
  event: SenaEnterpriseAuditEvent;
  userId?: string;
  teamId?: string;
  projectId?: string;
  createdAt: string;
  detail: Record<string, string | number | boolean | null>;
  webhookDelivery?: SenaEnterpriseAuditWebhookDelivery;
};

export type SenaEnterpriseAuditStoreRuntime = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseAuditStoreRuntime;
  generatedAt: string;
  mode: "postgres-table" | "enterprise-state";
  activeStore: "postgres-table" | "enterprise-state";
  postgresConfigured: boolean;
  postgresPrimaryActive: boolean;
  postgresConnectionHash?: string;
  evidence: string[];
  missing: string[];
};

export type SenaEnterpriseAuditDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseAuditDelivery;
  generatedAt: string;
  provider: {
    mode: SenaEnterpriseWebhookProviderMode;
    configured: boolean;
    endpointHash?: string;
    secretConfigured: boolean;
    timeoutMs: number;
    maxAttempts: number;
  };
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
  };
  integrity: SenaEnterpriseAuditIntegrity;
  summary: {
    attempted: number;
    delivered: number;
    pending: number;
    failed: number;
    skipped: number;
  };
  auditEvents: Array<{
    auditId: string;
    event: SenaEnterpriseAuditEvent;
    teamId?: string;
    projectId?: string;
    webhookStatus: SenaEnterpriseAuditWebhookDeliveryStatus;
    attempts: number;
    httpStatus?: number;
    errorCode?: string;
  }>;
};


export type SenaEnterpriseAuditLogQuery = {
  teamId?: string;
  userId?: string;
  projectId?: string;
  event?: SenaEnterpriseAuditEvent;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type SenaEnterpriseAuditLogResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseAuditLog;
  generatedAt: string;
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
  };
  filters: {
    userId?: string;
    projectId?: string;
    event?: SenaEnterpriseAuditEvent;
    from?: string;
    to?: string;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    returned: number;
    nextOffset: number | null;
  };
  events: SenaEnterpriseAuditLogEntry[];
};

export type SenaEnterpriseAuditIntegrity = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseAuditIntegrity;
  generatedAt: string;
  status: "pass" | "review";
  scope: {
    teamIds: string[];
    requestedTeamId?: string;
  };
  retention: {
    maxEvents: number;
    retainedEvents: number;
    oldestEventAt?: string;
    newestEventAt?: string;
    retentionWindowDays?: number;
    withinConfiguredWindow: boolean;
  };
  chain: {
    algorithm: "sha256-linked-audit-entry-hash";
    eventCount: number;
    headHash: string;
    firstEventHash?: string;
    lastEventHash?: string;
  };
  checks: SenaEnterpriseGovernanceCheck[];
  sample: Array<{ id: string; event: SenaEnterpriseAuditEvent; createdAt: string; entryHash: string; chainHash: string }>;
};


export function latestAuditAt(db: SenaEnterpriseDb, event: SenaEnterpriseAuditEvent) {
  return db.auditLog
    .filter((entry) => entry.event === event)
    .map((entry) => entry.createdAt)
    .sort((a, b) => b.localeCompare(a))[0];
}

let enterprisePostgresAuditStore: {
  adapter: ReturnType<typeof createEnterprisePostgresAuditLogAdapterFromEnv>["adapter"];
  pool: SenaEnterprisePostgresPool;
} | null = null;

export function auditStoreRuntime(): SenaEnterpriseAuditStoreRuntime {
  const primaryStateRuntime = getEnterprisePrimaryStateRuntime();
  const postgresConfig = resolveEnterprisePostgresConfig();
  const postgresPrimaryActive = primaryStateRuntime.activePrimary === "postgres";
  const activeStore = postgresPrimaryActive ? "postgres-table" : "enterprise-state";
  const missing = postgresPrimaryActive
    ? []
    : [
      primaryStateRuntime.postgresPrimaryRequested ? null : "SENA_ENTERPRISE_STATE_STORE=postgres",
      ...postgresConfig.missingEnv
    ].filter((value): value is string => Boolean(value));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditStoreRuntime,
    generatedAt: now(),
    mode: activeStore,
    activeStore,
    postgresConfigured: postgresConfig.configured,
    postgresPrimaryActive,
    postgresConnectionHash: postgresConfig.connectionHash,
    evidence: [
      `auditStore=${activeStore}`,
      `auditStoreSchema=${activeStore === "postgres-table" ? "sena_enterprise_audit_log" : "enterprise-db.auditLog"}`,
      `auditStoreIndexed=${activeStore === "postgres-table"}`,
      `postgresConfigured=${postgresConfig.configured}`,
      `postgresPrimaryActive=${postgresPrimaryActive}`,
      `postgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ],
    missing
  };
}

function isPostgresAuditStoreActive() {
  return auditStoreRuntime().activeStore === "postgres-table";
}

function postgresAuditStore() {
  enterprisePostgresAuditStore ??= createEnterprisePostgresAuditLogAdapterFromEnv({});
  return enterprisePostgresAuditStore.adapter;
}


function auditTimestamp(value?: string) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new SenaEnterpriseError("Audit date filters must be valid ISO timestamps.", 400, "invalid_audit_date");
  }
  return timestamp;
}

export function auditRetentionWindowDays() {
  const value = process.env.SENA_AUDIT_RETENTION_DAYS;
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SenaEnterpriseError("SENA_AUDIT_RETENTION_DAYS must be a positive number of days.", 500, "invalid_audit_retention_days");
  }
  return Math.trunc(parsed);
}


function sortedAuditDetail(detail: SenaEnterpriseAuditLogEntry["detail"]) {
  return Object.fromEntries(Object.entries(detail).sort(([left], [right]) => left.localeCompare(right)));
}

function auditEntryHash(entry: SenaEnterpriseAuditLogEntry) {
  return createHash("sha256").update(JSON.stringify({
    id: entry.id,
    event: entry.event,
    userId: entry.userId ?? null,
    teamId: entry.teamId ?? null,
    projectId: entry.projectId ?? null,
    createdAt: entry.createdAt,
    detail: sortedAuditDetail(entry.detail)
  })).digest("hex");
}

function auditChainRows(entries: SenaEnterpriseAuditLogEntry[]) {
  let chainHash = createHash("sha256").update("sena-enterprise-audit-chain/v1").digest("hex");
  return [...entries]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((entry) => {
      const entryHash = auditEntryHash(entry);
      chainHash = createHash("sha256").update(`${chainHash}.${entryHash}`).digest("hex");
      return {
        id: entry.id,
        event: entry.event,
        createdAt: entry.createdAt,
        entryHash,
        chainHash
      };
    });
}

function scopedUserIdsForTeams(db: SenaEnterpriseDb, teamIds: string[]) {
  const teamIdSet = new Set(teamIds);
  return db.memberships
    .filter((membership) => teamIdSet.has(membership.teamId))
    .map((membership) => membership.userId);
}

function auditEntriesInScope(db: SenaEnterpriseDb, teamIds: string[], entries = db.auditLog) {
  if (teamIds.length === 0) return [];
  const teamIdSet = new Set(teamIds);
  const scopedUserIds = new Set(scopedUserIdsForTeams(db, teamIds));
  return entries.filter((entry) => (
    entry.teamId
      ? teamIdSet.has(entry.teamId)
      : entry.userId
        ? scopedUserIds.has(entry.userId)
        : entry.event === "security.rate_limit"
  ));
}


function auditTeamScope(context?: SenaEnterpriseSessionContext, requestedTeamId?: string) {
  if (!context) {
    const db = readEnterpriseDb();
    return db.teams.map((team) => team.id);
  }
  const manageable = manageableTeamIds(context);
  if (requestedTeamId) {
    requireEnterprisePermission(context, requestedTeamId, "team:manage");
    return [requestedTeamId];
  }
  if (manageable.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for audit log access.", 403, "audit_permission_denied");
  }
  return manageable;
}

function auditTeamScopeFromDb(db: SenaEnterpriseDb, context?: SenaEnterpriseSessionContext, requestedTeamId?: string) {
  if (!context) {
    return db.teams.map((team) => team.id);
  }
  const manageable = manageableTeamIds(context);
  if (requestedTeamId) {
    requireEnterprisePermission(context, requestedTeamId, "team:manage");
    return [requestedTeamId];
  }
  if (manageable.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for audit log access.", 403, "audit_permission_denied");
  }
  return manageable;
}

/**
 * Paged reads stay small enough to answer a UI request. Exports do not page at
 * all — see `exportEnterpriseAuditLogAsync` — so their ceiling is the retention
 * cap itself.
 */
const auditPageMaxLimit = 500;

export const enterpriseAuditExportMaxEvents = auditRetentionMaxEvents;

export function listEnterpriseAuditLog(context: SenaEnterpriseSessionContext, input: SenaEnterpriseAuditLogQuery = {}): SenaEnterpriseAuditLogResult {
  return listEnterpriseAuditLogPage(context, input, auditPageMaxLimit);
}

function listEnterpriseAuditLogPage(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseAuditLogQuery,
  maxLimit: number
): SenaEnterpriseAuditLogResult {
  const db = readEnterpriseDb();
  const teamIds = auditTeamScopeFromDb(db, context, input.teamId);
  const from = auditTimestamp(input.from);
  const to = auditTimestamp(input.to);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), maxLimit);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);

  const filtered = auditEntriesInScope(db, teamIds).filter((entry) => {
    const entryTime = Date.parse(entry.createdAt);
    if (input.event && entry.event !== input.event) return false;
    if (input.projectId && entry.projectId !== input.projectId) return false;
    if (input.userId && entry.userId !== input.userId) return false;
    if (from !== undefined && entryTime < from) return false;
    if (to !== undefined && entryTime > to) return false;
    return true;
  });

  const events = filtered.slice(offset, offset + limit);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditLog,
    generatedAt: now(),
    scope: {
      teamIds,
      requestedTeamId: input.teamId
    },
    filters: {
      userId: input.userId,
      projectId: input.projectId,
      event: input.event,
      from: input.from,
      to: input.to
    },
    pagination: {
      limit,
      offset,
      total: filtered.length,
      returned: events.length,
      nextOffset: offset + events.length < filtered.length ? offset + events.length : null
    },
    events
  };
}

export async function listEnterpriseAuditLogAsync(context: SenaEnterpriseSessionContext, input: SenaEnterpriseAuditLogQuery = {}): Promise<SenaEnterpriseAuditLogResult> {
  return listEnterpriseAuditLogPageAsync(context, input, auditPageMaxLimit);
}

/**
 * The whole scoped set in one answer, for callers producing an archival artifact
 * rather than a screenful. `limit`/`offset` are deliberately not accepted: a page
 * of an audit export is indistinguishable from the export once it is a file on
 * someone's disk. The ceiling is the retention cap, which the file-backed store
 * enforces on write (`appendAudit`) and which the Postgres integrity pass already
 * reads at; when a scoped set exceeds it, `pagination.nextOffset` is non-null and
 * the caller is expected to refuse rather than emit a partial artifact.
 */
export async function exportEnterpriseAuditLogAsync(
  context: SenaEnterpriseSessionContext,
  input: Omit<SenaEnterpriseAuditLogQuery, "limit" | "offset"> = {}
): Promise<SenaEnterpriseAuditLogResult> {
  return listEnterpriseAuditLogPageAsync(
    context,
    { ...input, limit: enterpriseAuditExportMaxEvents, offset: 0 },
    enterpriseAuditExportMaxEvents
  );
}

async function listEnterpriseAuditLogPageAsync(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterpriseAuditLogQuery,
  maxLimit: number
): Promise<SenaEnterpriseAuditLogResult> {
  if (!isPostgresAuditStoreActive()) {
    return listEnterpriseAuditLogPage(context, input, maxLimit);
  }
  const state = await readEnterpriseState();
  const teamIds = auditTeamScopeFromDb(state.db, context, input.teamId);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), maxLimit);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
  auditTimestamp(input.from);
  auditTimestamp(input.to);
  const result = await postgresAuditStore().listEntries({
    ...input,
    teamIds,
    scopedUserIds: scopedUserIdsForTeams(state.db, teamIds),
    limit,
    offset
  });
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditLog,
    generatedAt: now(),
    scope: {
      teamIds,
      requestedTeamId: input.teamId
    },
    filters: {
      userId: input.userId,
      projectId: input.projectId,
      event: input.event,
      from: input.from,
      to: input.to
    },
    pagination: {
      limit,
      offset,
      total: result.total,
      returned: result.events.length,
      nextOffset: offset + result.events.length < result.total ? offset + result.events.length : null
    },
    events: result.events
  };
}

function buildEnterpriseAuditIntegrity(input: {
  db: SenaEnterpriseDb;
  teamIds: string[];
  requestedTeamId?: string;
  scopedEntries: SenaEnterpriseAuditLogEntry[];
  globalEventCount: number;
}): SenaEnterpriseAuditIntegrity {
  const { db, teamIds, requestedTeamId, scopedEntries, globalEventCount } = input;
  const timestampRows = scopedEntries.map((entry) => Date.parse(entry.createdAt));
  const validTimestamps = timestampRows.every((timestamp) => Number.isFinite(timestamp));
  const newestFirst = scopedEntries.every((entry, index) => {
    if (index === 0) return true;
    return entry.createdAt <= scopedEntries[index - 1].createdAt;
  });
  const oldestTimestamp = validTimestamps && timestampRows.length > 0 ? Math.min(...timestampRows) : undefined;
  const newestTimestamp = validTimestamps && timestampRows.length > 0 ? Math.max(...timestampRows) : undefined;
  const retentionWindowDays = auditRetentionWindowDays();
  const withinConfiguredWindow = retentionWindowDays
    ? oldestTimestamp === undefined || oldestTimestamp >= Date.now() - retentionWindowDays * 24 * 60 * 60 * 1000
    : false;
  const chainRows = auditChainRows(scopedEntries);
  const headHash = chainRows.at(-1)?.chainHash ?? createHash("sha256").update("sena-enterprise-audit-chain/v1.empty").digest("hex");
  const checks: SenaEnterpriseGovernanceCheck[] = [
    {
      id: "audit-chain-hash",
      label: "Audit chain hash",
      status: validTimestamps ? "pass" : "review",
      evidence: [
        "algorithm=sha256-linked-audit-entry-hash",
        `events=${scopedEntries.length}`,
        `headHash=${headHash}`,
        `validTimestamps=${validTimestamps}`
      ],
      nextAction: validTimestamps ? "Archive the chain head with external audit exports." : "Repair invalid audit timestamps before relying on audit chain evidence."
    },
    {
      id: "audit-event-order",
      label: "Audit event order",
      status: newestFirst ? "pass" : "review",
      evidence: [
        "expected=newest-first",
        `newestFirst=${newestFirst}`
      ],
      nextAction: newestFirst ? "Keep append-only newest-first audit storage." : "Repair audit event ordering before export or restore."
    },
    {
      id: "audit-retention-cap",
      label: "Audit retention cap",
      status: globalEventCount <= auditRetentionMaxEvents ? "pass" : "review",
      evidence: [
        `globalEvents=${globalEventCount}`,
        `scopedEvents=${scopedEntries.length}`,
        `maxEvents=${auditRetentionMaxEvents}`
      ],
      nextAction: globalEventCount <= auditRetentionMaxEvents ? "Export audit chain heads before event rotation." : "Export and rotate audit logs to restore the configured event cap."
    },
    {
      id: "audit-retention-window",
      label: "Audit retention window policy",
      status: retentionWindowDays && withinConfiguredWindow ? "pass" : "review",
      evidence: [
        `retentionDays=${retentionWindowDays ?? "missing"}`,
        `withinWindow=${withinConfiguredWindow}`,
        `oldestEventAt=${oldestTimestamp ? new Date(oldestTimestamp).toISOString() : "none"}`,
        `newestEventAt=${newestTimestamp ? new Date(newestTimestamp).toISOString() : "none"}`
      ],
      nextAction: retentionWindowDays
        ? "Keep SENA_AUDIT_RETENTION_DAYS aligned with institutional retention policy."
        : "Set SENA_AUDIT_RETENTION_DAYS before production audit-log retention is claimed."
    }
  ];
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditIntegrity,
    generatedAt: now(),
    status: checks.every((check) => check.status === "pass") ? "pass" : "review",
    scope: {
      teamIds,
      requestedTeamId
    },
    retention: {
      maxEvents: auditRetentionMaxEvents,
      retainedEvents: scopedEntries.length,
      oldestEventAt: oldestTimestamp ? new Date(oldestTimestamp).toISOString() : undefined,
      newestEventAt: newestTimestamp ? new Date(newestTimestamp).toISOString() : undefined,
      retentionWindowDays,
      withinConfiguredWindow
    },
    chain: {
      algorithm: "sha256-linked-audit-entry-hash",
      eventCount: scopedEntries.length,
      headHash,
      firstEventHash: chainRows[0]?.entryHash,
      lastEventHash: chainRows.at(-1)?.entryHash
    },
    checks,
    sample: chainRows.slice(-10).reverse()
  };
}

export function verifyEnterpriseAuditIntegrity(context?: SenaEnterpriseSessionContext, input: { teamId?: string } = {}): SenaEnterpriseAuditIntegrity {
  const db = readEnterpriseDb();
  return verifyEnterpriseAuditIntegrityFromDb(db, context, input);
}

export function verifyEnterpriseAuditIntegrityFromDb(
  db: SenaEnterpriseDb,
  context?: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterpriseAuditIntegrity {
  const teamIds = auditTeamScopeFromDb(db, context, input.teamId);
  return buildEnterpriseAuditIntegrity({
    db,
    teamIds,
    requestedTeamId: input.teamId,
    scopedEntries: auditEntriesInScope(db, teamIds),
    globalEventCount: db.auditLog.length
  });
}

export async function verifyEnterpriseAuditIntegrityAsync(context?: SenaEnterpriseSessionContext, input: { teamId?: string } = {}): Promise<SenaEnterpriseAuditIntegrity> {
  const state = await readEnterpriseState();
  const teamIds = auditTeamScopeFromDb(state.db, context, input.teamId);
  if (!isPostgresAuditStoreActive()) {
    return verifyEnterpriseAuditIntegrityFromDb(state.db, context, input);
  }
  const scoped = await postgresAuditStore().listEntries({
    teamIds,
    scopedUserIds: scopedUserIdsForTeams(state.db, teamIds),
    limit: auditRetentionMaxEvents,
    offset: 0
  });
  const globalTeamIds = [...new Set([...state.db.teams.map((team) => team.id), ...teamIds])];
  const global = await postgresAuditStore().listEntries({
    teamIds: globalTeamIds,
    scopedUserIds: state.db.users.map((user) => user.id),
    limit: 1,
    offset: 0
  });
  return buildEnterpriseAuditIntegrity({
    db: state.db,
    teamIds,
    requestedTeamId: input.teamId,
    scopedEntries: scoped.events,
    globalEventCount: global.total
  });
}

export function recordEnterpriseAudit(entry: Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">) {
  const db = readEnterpriseDb();
  appendAudit(db, entry);
  saveDb(db);
}

export async function recordEnterpriseAuditAsync(entry: Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">) {
  if (isPostgresAuditStoreActive()) {
    await postgresAuditStore().appendEntry(buildAuditEntry(entry));
    return;
  }
  const state = await readEnterpriseState();
  appendAudit(state.db, entry);
  await saveEnterpriseState(state, state.db);
}

function buildAuditEntry(entry: Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">): SenaEnterpriseAuditLogEntry {
  return {
    id: id("audit"),
    createdAt: now(),
    ...entry,
    webhookDelivery: entry.webhookDelivery ?? initialAuditWebhookDelivery()
  };
}

export function appendAudit(db: SenaEnterpriseDb, entry: Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">) {
  db.auditLog.unshift(buildAuditEntry(entry));
  db.auditLog = db.auditLog.slice(0, auditRetentionMaxEvents);
}

function initialAuditWebhookDelivery(queuedAt = now()): SenaEnterpriseAuditWebhookDelivery | undefined {
  const provider = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  if (!provider.configured || !provider.endpointHash) return undefined;
  return {
    provider: webhookQueueProvider(provider),
    status: "pending",
    endpointHash: provider.endpointHash,
    queuedAt,
    attempts: 0,
    maxAttempts: provider.maxAttempts
  };
}

function ensureAuditWebhookDelivery(entry: SenaEnterpriseAuditLogEntry) {
  const provider = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  if (!provider.configured || !provider.endpointHash) return undefined;
  if (!entry.webhookDelivery || entry.webhookDelivery.endpointHash !== provider.endpointHash) {
    entry.webhookDelivery = {
      provider: webhookQueueProvider(provider),
      status: "pending",
      endpointHash: provider.endpointHash,
      queuedAt: now(),
      attempts: 0,
      maxAttempts: provider.maxAttempts
    };
  } else {
    entry.webhookDelivery.maxAttempts = provider.maxAttempts;
  }
  return entry.webhookDelivery;
}

function sanitizedAuditForwardDetail(detail: SenaEnterpriseAuditLogEntry["detail"]) {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    const lowered = key.toLowerCase();
    if (typeof value === "string" && lowered.includes("email") && value.includes("@")) {
      sanitized[`${key}Hash`] = authEmailHash(value);
      sanitized[`${key}Domain`] = authEmailDomain(value);
    } else if (typeof value === "string" && /(token|secret|password|invitecode|code)/i.test(key)) {
      sanitized[`${key}Hash`] = createHash("sha256").update(value).digest("hex");
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function auditWebhookPayload(
  entry: SenaEnterpriseAuditLogEntry,
  delivery: SenaEnterpriseAuditWebhookDelivery,
  attempt: number,
  generatedAt: string,
  integrity: SenaEnterpriseAuditIntegrity,
  chainRow?: ReturnType<typeof auditChainRows>[number]
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditWebhook,
    generatedAt,
    audit: {
      id: entry.id,
      event: entry.event,
      userId: entry.userId,
      teamId: entry.teamId,
      projectId: entry.projectId,
      createdAt: entry.createdAt,
      detail: sanitizedAuditForwardDetail(entry.detail),
      entryHash: chainRow?.entryHash ?? auditEntryHash(entry),
      chainHash: chainRow?.chainHash,
      chainHead: integrity.chain.headHash,
      chainAlgorithm: integrity.chain.algorithm
    },
    integrity: {
      status: integrity.status,
      scopedEvents: integrity.chain.eventCount,
      retentionWindowDays: integrity.retention.retentionWindowDays,
      withinConfiguredWindow: integrity.retention.withinConfiguredWindow
    },
    delivery: {
      provider: delivery.provider,
      endpointHash: delivery.endpointHash,
      attempt,
      maxAttempts: delivery.maxAttempts
    }
  };
}

async function postAuditWebhook(
  entry: SenaEnterpriseAuditLogEntry,
  delivery: SenaEnterpriseAuditWebhookDelivery,
  integrity: SenaEnterpriseAuditIntegrity,
  chainRow?: ReturnType<typeof auditChainRows>[number]
) {
  const webhookUrl = auditWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Audit webhook delivery is not configured.", 503, "audit_webhook_not_configured");
  }
  const generatedAt = now();
  const attempt = delivery.attempts + 1;
  const body = JSON.stringify(auditWebhookPayload(entry, delivery, attempt, generatedAt, integrity, chainRow));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "audit.forward",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-audit-id": entry.id,
    "x-sena-audit-chain-head": integrity.chain.headHash
  };
  const secret = auditWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), auditWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverEnterpriseAuditLog(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; limit?: number; force?: boolean; auditId?: string } = {}
): Promise<SenaEnterpriseAuditDeliveryResult> {
  const provider = auditWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const force = Boolean(input.force);
  const teamIds = auditTeamScope(context, input.teamId);
  const integrity = verifyEnterpriseAuditIntegrity(context, { teamId: input.teamId });
  const result: SenaEnterpriseAuditDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseAuditDelivery,
    generatedAt: now(),
    provider,
    scope: {
      teamIds,
      requestedTeamId: input.teamId
    },
    integrity,
    summary: {
      attempted: 0,
      delivered: 0,
      pending: 0,
      failed: 0,
      skipped: 0
    },
    auditEvents: []
  };

  if (!provider.configured) {
    return result;
  }

  const db = readEnterpriseDb();
  const scopedEntries = auditEntriesInScope(db, teamIds);
  const chainRowById = new Map(auditChainRows(scopedEntries).map((row) => [row.id, row]));
  const nowMs = Date.now();
  const deliveryQueue: SenaEnterpriseAuditLogEntry[] = [];

  for (const entry of scopedEntries
    .filter((candidate) => !input.auditId || candidate.id === input.auditId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const delivery = ensureAuditWebhookDelivery(entry);
    if (!delivery) {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.status === "delivered") {
      result.summary.skipped += 1;
      continue;
    }
    if (delivery.attempts >= delivery.maxAttempts) {
      result.summary.skipped += 1;
      continue;
    }
    if (!force && delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > nowMs) {
      result.summary.skipped += 1;
      continue;
    }
    deliveryQueue.push(entry);
  }

  const targets = deliveryQueue.slice(0, limit);
  result.summary.skipped += deliveryQueue.length - targets.length;

  for (const entry of targets) {
    const delivery = entry.webhookDelivery!;
    const attemptResult = provider.mode === "local-sink"
      ? localWebhookSinkAttempt(delivery.endpointHash)
      : await postAuditWebhook(entry, delivery, integrity, chainRowById.get(entry.id));
    const attemptedAt = now();
    delivery.attempts += 1;
    delivery.lastAttemptAt = attemptedAt;
    delivery.lastStatus = attemptResult.httpStatus;
    delivery.lastErrorCode = attemptResult.errorCode;
    delivery.lastErrorHash = attemptResult.errorHash;

    if (attemptResult.ok) {
      delivery.status = "delivered";
      delivery.deliveredAt = attemptedAt;
      delete delivery.nextAttemptAt;
      delete delivery.failedAt;
      result.summary.delivered += 1;
    } else if (delivery.attempts >= delivery.maxAttempts) {
      delivery.status = "failed";
      delivery.failedAt = attemptedAt;
      delete delivery.nextAttemptAt;
      result.summary.failed += 1;
    } else {
      delivery.status = "pending";
      delivery.nextAttemptAt = webhookRetryAt(delivery.attempts);
      result.summary.pending += 1;
    }

    result.summary.attempted += 1;
    result.auditEvents.push({
      auditId: entry.id,
      event: entry.event,
      teamId: entry.teamId,
      projectId: entry.projectId,
      webhookStatus: delivery.status,
      attempts: delivery.attempts,
      httpStatus: delivery.lastStatus,
      errorCode: delivery.lastErrorCode
    });
  }

  saveDb(db);
  return result;
}
