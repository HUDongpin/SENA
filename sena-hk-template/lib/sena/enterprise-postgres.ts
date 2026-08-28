import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import {
  SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY,
  SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY,
  SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY
} from "./analysis-queue-command";
import { SENA_SERVER_JOB_COMMAND_CUSTODY } from "./server-job-command-envelope";
import {
  SenaGroupComparisonSourceVerificationCache,
  type SenaGroupComparisonValidationReadModel
} from "./inference";
import {
  normalizeSenaReliabilityDashboard,
  type SenaReliabilityDashboard,
  type SenaReliabilityDashboardReadModel
} from "./reliability";
import { senaProductionPostureFrom } from "./enterprise/auth-config";
import { createHash, randomBytes } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import type {
  SenaEnterpriseBackupArtifact,
  SenaEnterpriseBackupRecordCounts,
  SenaEnterpriseBackupVerification
} from "./enterprise";
import type {
  SenaEnterpriseAnalysisRun,
  SenaEnterpriseImportRun,
  SenaEnterpriseUpload
} from "./enterprise/import-analysis";
import type {
  SenaEnterpriseReliabilityRun,
  SenaEnterpriseReliabilityRunStatus
} from "./enterprise/reliability-runs";
import type {
  SenaEnterpriseValidationRun,
  SenaEnterpriseValidationRunStatus
} from "./enterprise/validation-runs";
import type {
  SenaEnterpriseExpertReview,
  SenaEnterpriseExpertReviewStatus
} from "./enterprise/expert-review";
import type {
  SenaEnterpriseAdjudicationRecord
} from "./enterprise/team-collaboration";
import type {
  SenaEnterpriseProjectComment,
  SenaEnterpriseProjectPresence
} from "./enterprise/team-collaboration";
import type {
  SenaEnterpriseAuditEvent,
  SenaEnterpriseAuditLogEntry,
  SenaEnterpriseAuditLogQuery
} from "./enterprise/ops-audit";
import type {
  SenaEnterpriseServerJob,
  SenaEnterpriseServerJobKind,
  SenaEnterpriseServerJobList,
  SenaEnterpriseServerJobQueueDelivery,
  SenaEnterpriseServerJobStatus
} from "./enterprise/server-job-queue";
import { projectEnterpriseServerJobReadModel } from "./enterprise/server-job-contract";
import { SenaEnterpriseError } from "./enterprise/errors";
import type { SenaEnterpriseObservedRequest } from "./enterprise/ops-observability";
import type { SenaProjectSnapshot } from "./types";
import {
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue
} from "./enterprise/ops-runtime";
import {
  enterprisePostgresConnectionStringFromEnv,
  enterprisePostgresUrlEnvNameFromEnv,
  supportedPostgresUrlEnvNamesLabel
} from "./enterprise/postgres-url-env";
import type { SenaEnterpriseDb } from "./enterprise/state";
import {
  buildEnterpriseReliabilityAdjudicationCoverageFromResolvedScope,
  normalizeEnterpriseReliabilityAdjudicationCoverageSummary,
  resolveEnterpriseReliabilityRunProjectScope
} from "./enterprise/reliability-integrity";
import {
  normalizeEnterpriseValidationRunEvidence,
  projectEnterpriseValidationRunReadCarrier,
  SenaEnterpriseValidationAnalysisRunIndex,
  SenaEnterpriseValidationRunIntegrityError,
  type SenaEnterpriseValidationSnapshotHashCache
} from "./enterprise/validation-integrity";
import { senaValidationSourceVerificationCache } from "./enterprise/validation-request-scope";
import { SENA_WORKFLOW_POSTGRES_SCHEMA_DEFINITIONS } from "./workflow/postgres-store";

export type SenaEnterprisePostgresQuery = <T = Record<string, unknown>>(
  sql: string,
  values?: unknown[]
) => Promise<{ rows: T[]; rowCount?: number | null }>;

export type SenaEnterpriseStoredIntegrityIssue = {
  path: string;
  rule: "row-payload-mismatch" | "current-project-source-required" | "current-project-binding-mismatch";
};

/**
 * A deliberately value-free error for persisted SQL/payload integrity failures.
 * Callers may safely serialize `issues`; neither the SQL value nor the embedded
 * payload value is retained in the error.
 */
export class SenaEnterpriseStoredIntegrityError extends Error {
  readonly issues: SenaEnterpriseStoredIntegrityIssue[];

  constructor(issue: SenaEnterpriseStoredIntegrityIssue) {
    super("Stored enterprise evidence failed canonical reliability dashboard (reliability-dashboard), group-comparison, or project-binding integrity validation.");
    this.name = "SenaEnterpriseStoredIntegrityError";
    this.issues = [issue];
  }
}

export type SenaEnterprisePostgresConfig = {
  mode: "postgres" | "file";
  configured: boolean;
  adapterRequested: boolean;
  adapter?: "postgres" | "neon";
  urlEnvName?: string;
  connectionHash?: string;
  missingEnv: string[];
  evidence: string[];
};

export type SenaEnterprisePostgresStateRead = {
  db: SenaEnterpriseDb;
  revision: number;
  initialized: boolean;
};

export type SenaEnterprisePostgresStateWrite = {
  revision: number;
};

export type SenaEnterprisePostgresPool = {
  query: SenaEnterprisePostgresQuery;
  end?: () => Promise<void>;
};

export type SenaEnterprisePostgresPoolFactory = (options: PoolConfig) => SenaEnterprisePostgresPool;

export type SenaEnterprisePostgresProbeStatus = "pass" | "review";

export type SenaEnterprisePostgresProbeStep = {
  attempted: boolean;
  status: SenaEnterprisePostgresProbeStatus;
  rowCount?: number | null;
  errorCode?: string;
  errorHash?: string;
};

export type SenaEnterprisePostgresSchemaStatementKind =
  | "table"
  | "index"
  | "unique-index"
  | "add-column"
  | "alter-column-nullability";

export type SenaEnterprisePostgresSchemaContract = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePostgresSchemaContract;
  generatedAt: string;
  status: "pass" | "review";
  schemaName: string;
  summary: {
    tableCount: number;
    productionTableCount: number;
    verifierTableCount: number;
    indexCount: number;
    uniqueIndexCount: number;
    ddlStatementCount: number;
    destructiveDdlStatementCount: number;
    migrationMode: "create-if-not-exists";
  };
  tables: Array<{
    id: string;
    name: string;
    role: string;
    productionRequired: boolean;
  }>;
  indexes: Array<{
    name: string;
    tableName: string;
    kind: "index" | "unique-index";
    sqlSha256: string;
  }>;
  ddl: {
    statementFingerprints: Array<{
      kind: SenaEnterprisePostgresSchemaStatementKind;
      name: string;
      tableName?: string;
      sqlSha256: string;
    }>;
    destructiveDdlExcluded: boolean;
    connectionValuesExcluded: true;
  };
  evidence: string[];
  redaction: {
    sqlValuesExcluded: true;
    connectionValuesExcluded: true;
    secretValuesExcluded: true;
  };
};

export type SenaEnterprisePostgresProbe = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePostgresProbe;
  generatedAt: string;
  status: SenaEnterprisePostgresProbeStatus;
  provider: {
    configured: boolean;
    adapter?: "postgres" | "neon";
    urlEnvName?: string;
    connectionHash?: string;
    missingEnv: string[];
    pool: {
      max: number;
      idleTimeoutMillis: number;
      connectionTimeoutMillis: number;
      keepAlive: true;
    };
    connectionValueExcluded: true;
  };
  probe: {
    schemaName: string;
    tableName: string;
    probeIdHash?: string;
    payloadSha256?: string;
    createTable: SenaEnterprisePostgresProbeStep;
    insert: SenaEnterprisePostgresProbeStep;
    select: SenaEnterprisePostgresProbeStep;
    delete: SenaEnterprisePostgresProbeStep;
    cleanupStatus: "not-attempted" | "deleted" | "review";
  };
  schemaContract: SenaEnterprisePostgresSchemaContract;
  evidence: string[];
  redaction: {
    connectionValuesExcluded: true;
    probeIdValuesExcluded: true;
    secretValuesExcluded: true;
  };
};

export type SenaEnterprisePostgresProbeReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

export type SenaEnterprisePostgresSchemaContractReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

const defaultSchemaName = "public";
const defaultStateTableName = "sena_enterprise_state";
const defaultDatabaseSyncTableName = "sena_enterprise_database_syncs";
const defaultServerJobsTableName = "sena_enterprise_server_jobs";
const defaultAuditLogTableName = "sena_enterprise_audit_log";
const defaultUploadsTableName = "sena_enterprise_uploads";
const defaultImportRunsTableName = "sena_enterprise_import_runs";
const defaultAnalysisRunsTableName = "sena_enterprise_analysis_runs";
const defaultReliabilityRunsTableName = "sena_enterprise_reliability_runs";
const defaultValidationRunsTableName = "sena_enterprise_validation_runs";
const defaultExpertReviewsTableName = "sena_enterprise_expert_reviews";
const defaultAdjudicationsTableName = "sena_enterprise_adjudications";
const defaultProjectCommentsTableName = "sena_enterprise_project_comments";
const defaultProjectPresenceTableName = "sena_enterprise_project_presence";
const defaultObservedRequestsTableName = "sena_enterprise_observed_requests";
const defaultPostgresProbeTableName = "sena_enterprise_postgres_live_probes";
const defaultStateKey = "default";

type EnterprisePostgresSchemaEnsurer = {
  ensureSchema: () => Promise<void>;
};

type EnterprisePostgresSchemaTableDefinition = {
  id: string;
  name: string;
  role: string;
  productionRequired: boolean;
  createEnsurer: (input: {
    query: SenaEnterprisePostgresQuery;
    schemaName: string;
  }) => EnterprisePostgresSchemaEnsurer;
};

const enterprisePostgresSchemaTableDefinitions: EnterprisePostgresSchemaTableDefinition[] = [
  {
    id: "primary-state",
    name: defaultStateTableName,
    role: "primary enterprise state snapshots, revisions, teams, projects, sessions, invitations, and governance state",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresStateAdapter({
      query,
      schemaName,
      initialDb: () => ({ schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseDb }) as SenaEnterpriseDb
    })
  },
  {
    id: "uploads",
    name: defaultUploadsTableName,
    role: "uploaded research files, import custody, scan status, hashes, and object-storage handoff metadata",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresUploadAdapter({ query, schemaName })
  },
  {
    id: "import-runs",
    name: defaultImportRunsTableName,
    role: "structured import run history, status, warnings, and data-contract audit payloads",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresImportRunAdapter({ query, schemaName })
  },
  {
    id: "analysis-runs",
    name: defaultAnalysisRunsTableName,
    role: "SENA/ENA/SNA analysis run history, source snapshots, and persisted project links",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresAnalysisRunAdapter({ query, schemaName })
  },
  {
    id: "reliability-runs",
    name: defaultReliabilityRunsTableName,
    role: "coding reliability runs, reviewer sign-off status, and adjudication readiness metadata",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresReliabilityRunAdapter({ query, schemaName })
  },
  {
    id: "validation-runs",
    name: defaultValidationRunsTableName,
    role: "method validation runs, inference readiness, parity evidence, and review state",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresValidationRunAdapter({ query, schemaName })
  },
  {
    id: "expert-reviews",
    name: defaultExpertReviewsTableName,
    role: "expert review records, claim scope, target binding, and review status",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresExpertReviewAdapter({ query, schemaName })
  },
  {
    id: "adjudications",
    name: defaultAdjudicationsTableName,
    role: "reliability adjudication records, item/code targets, and reviewer history",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresAdjudicationAdapter({ query, schemaName })
  },
  {
    id: "project-comments",
    name: defaultProjectCommentsTableName,
    role: "team collaboration comments, threaded review discussion, and target-linked notes",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresProjectCommentAdapter({ query, schemaName })
  },
  {
    id: "project-presence",
    name: defaultProjectPresenceTableName,
    role: "collaboration presence, active project users, and expiry cleanup visibility",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresProjectPresenceAdapter({ query, schemaName })
  },
  {
    id: "database-syncs",
    name: defaultDatabaseSyncTableName,
    role: "managed database sync receipts and webhook delivery evidence",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresDatabaseSyncAdapter({ query, schemaName })
  },
  {
    id: "server-jobs",
    name: defaultServerJobsTableName,
    role: "server-side job queue, worker delivery status, retries, and payload custody hashes",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresServerJobAdapter({ query, schemaName })
  },
  {
    id: "audit-log",
    name: defaultAuditLogTableName,
    role: "append-oriented audit events, SIEM/webhook delivery evidence, and queryable governance trail",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresAuditLogAdapter({ query, schemaName })
  },
  {
    id: "observed-requests",
    name: defaultObservedRequestsTableName,
    role: "request-level observability samples, latency/error SLI evidence, and route health analysis",
    productionRequired: true,
    createEnsurer: ({ query, schemaName }) => createEnterprisePostgresObservedRequestAdapter({ query, schemaName })
  },
  ...SENA_WORKFLOW_POSTGRES_SCHEMA_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    role: definition.role,
    productionRequired: definition.productionRequired,
    createEnsurer: ({ query, schemaName }: { query: SenaEnterprisePostgresQuery; schemaName: string }) => ({
      ensureSchema: async () => {
        for (const statement of definition.statements(schemaName)) await query(statement);
      }
    })
  })),
  {
    id: "live-postgres-probe",
    name: defaultPostgresProbeTableName,
    role: "redacted live Postgres verifier table for CREATE/INSERT/SELECT/DELETE permission evidence",
    productionRequired: false,
    createEnsurer: ({ query, schemaName }) => ({
      ensureSchema: async () => {
        await query(postgresLiveProbeCreateTableSql(stateTableRef(schemaName, defaultPostgresProbeTableName)));
      }
    })
  }
];

class SenaEnterprisePostgresError extends Error {
  constructor(
    message: string,
    public status = 500,
    public code = "sena_enterprise_postgres_error"
  ) {
    super(message);
  }
}

function envValue(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

export function enterprisePostgresConnectionString(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  return enterprisePostgresConnectionStringFromEnv(env);
}

function enterprisePostgresUrlEnvName(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return enterprisePostgresUrlEnvNameFromEnv(env);
}

export function resolveEnterprisePostgresConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): SenaEnterprisePostgresConfig {
  const adapter = envValue(env, "SENA_ENTERPRISE_DB_ADAPTER");
  const adapterMode = adapter === "postgres" || adapter === "neon" ? adapter : undefined;
  const adapterRequested = Boolean(adapterMode);
  const connectionString = enterprisePostgresConnectionString(env);
  const urlEnvName = enterprisePostgresUrlEnvName(env);
  const configured = adapterRequested && Boolean(connectionString);
  const missingEnv = [
    adapterRequested ? null : "SENA_ENTERPRISE_DB_ADAPTER=postgres",
    connectionString ? null : supportedPostgresUrlEnvNamesLabel()
  ].filter((value): value is string => Boolean(value));

  return {
    mode: configured ? "postgres" : "file",
    configured,
    adapterRequested,
    adapter: adapterMode,
    urlEnvName,
    connectionHash: connectionString ? createHash("sha256").update(connectionString).digest("hex") : undefined,
    missingEnv,
    evidence: [
      `adapter=${adapter ?? "file"}`,
      `configured=${configured}`,
      `url=${urlEnvName ?? "missing"}`,
      `connectionHash=${connectionString ? createHash("sha256").update(connectionString).digest("hex") : "none"}`
    ]
  };
}

function positiveIntegerEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
  fallback: number,
  max: number
) {
  const parsed = Number(envValue(env, key));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

export function enterprisePostgresPoolOptions(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): PoolConfig {
  const connectionString = enterprisePostgresConnectionString(env);
  if (!connectionString) {
    throw new SenaEnterprisePostgresError(
      "SENA enterprise Postgres connection string is not configured.",
      503,
      "postgres_connection_not_configured"
    );
  }
  return {
    connectionString,
    max: positiveIntegerEnv(env, "SENA_ENTERPRISE_POSTGRES_MAX_POOL_SIZE", 5, 20),
    idleTimeoutMillis: positiveIntegerEnv(env, "SENA_ENTERPRISE_POSTGRES_IDLE_TIMEOUT_MS", 5000, 60_000),
    connectionTimeoutMillis: positiveIntegerEnv(env, "SENA_ENTERPRISE_POSTGRES_CONNECTION_TIMEOUT_MS", 10_000, 60_000),
    keepAlive: true
  };
}

function redactedPostgresPoolSettings(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  return {
    max: positiveIntegerEnv(env, "SENA_ENTERPRISE_POSTGRES_MAX_POOL_SIZE", 5, 20),
    idleTimeoutMillis: positiveIntegerEnv(env, "SENA_ENTERPRISE_POSTGRES_IDLE_TIMEOUT_MS", 5000, 60_000),
    connectionTimeoutMillis: positiveIntegerEnv(env, "SENA_ENTERPRISE_POSTGRES_CONNECTION_TIMEOUT_MS", 10_000, 60_000),
    keepAlive: true as const
  };
}

function booleanEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  const value = envValue(env, key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function validSha256(value?: string) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

// Production posture is answered by senaProductionPostureFrom() (enterprise/
// auth-config.ts), never re-derived here: re-derivation is what let the
// password-reset interlock drift onto a NODE_ENV-only test and fail open
// (f5d94fa). The site-local opt-in flag is the only term this gate adds on top.
export function enterprisePostgresLiveProbeRequired(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  return booleanEnv(env, "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED") ||
    senaProductionPostureFrom(env);
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePostgresSchemaSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function postgresLiveProbeCreateTableSql(tableRef: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${tableRef} (
      id text PRIMARY KEY,
      payload_sha256 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

function postgresSchemaStatementMetadata(sql: string) {
  const tableMatch = sql.match(/^CREATE TABLE IF NOT EXISTS "[^"]+"\."([^"]+)"/i);
  if (tableMatch) {
    return {
      kind: "table" as const,
      name: tableMatch[1]
    };
  }

  const uniqueIndexMatch = sql.match(/^CREATE UNIQUE INDEX IF NOT EXISTS "([^"]+)" ON "[^"]+"\."([^"]+)"/i);
  if (uniqueIndexMatch) {
    return {
      kind: "unique-index" as const,
      name: uniqueIndexMatch[1],
      tableName: uniqueIndexMatch[2]
    };
  }

  const indexMatch = sql.match(/^CREATE INDEX IF NOT EXISTS "([^"]+)" ON "[^"]+"\."([^"]+)"/i);
  if (indexMatch) {
    return {
      kind: "index" as const,
      name: indexMatch[1],
      tableName: indexMatch[2]
    };
  }

  const nullabilityMatch = sql.match(
    /^ALTER TABLE "[^"]+"\."([^"]+)" ALTER COLUMN "?([a-z0-9_]+)"? DROP NOT NULL$/i
  );
  if (nullabilityMatch) {
    return {
      kind: "alter-column-nullability" as const,
      name: `${nullabilityMatch[2]}:drop-not-null`,
      tableName: nullabilityMatch[1]
    };
  }

  const additiveColumnMatch = sql.match(
    /^ALTER TABLE "[^"]+"\."([^"]+)" ADD COLUMN IF NOT EXISTS "?([a-z0-9_]+)"?\s+.+$/i
  );
  if (additiveColumnMatch) {
    return {
      kind: "add-column" as const,
      name: additiveColumnMatch[2],
      tableName: additiveColumnMatch[1]
    };
  }

  throw new SenaEnterprisePostgresError(
    "Unsupported SENA enterprise Postgres schema statement.",
    500,
    "unsupported_postgres_schema_statement"
  );
}

function postgresSchemaHasDestructiveDdl(sql: string) {
  if (/^ALTER TABLE "[^"]+"\."[^"]+" ALTER COLUMN "?[a-z0-9_]+"? DROP NOT NULL$/i.test(sql)) {
    return false;
  }
  return /\b(DROP|TRUNCATE|ALTER\s+TABLE\s+[^;]+\s+DROP)\b/i.test(sql);
}

export async function buildEnterprisePostgresSchemaContract(input: {
  schemaName?: string;
} = {}): Promise<SenaEnterprisePostgresSchemaContract> {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const capturedSql: string[] = [];
  const captureQuery: SenaEnterprisePostgresQuery = async (sql) => {
    capturedSql.push(normalizePostgresSchemaSql(sql));
    return { rows: [], rowCount: 0 };
  };

  for (const definition of enterprisePostgresSchemaTableDefinitions) {
    const ensurer = definition.createEnsurer({ query: captureQuery, schemaName });
    await ensurer.ensureSchema();
  }

  const statementFingerprints = capturedSql.map((sql) => {
    const metadata = postgresSchemaStatementMetadata(sql);
    return {
      ...metadata,
      sqlSha256: sha256Text(sql)
    };
  });
  const tableStatements = statementFingerprints.filter((statement) => statement.kind === "table");
  const indexStatements = statementFingerprints.filter((statement) => statement.kind === "index" || statement.kind === "unique-index");
  const destructiveDdlStatementCount = capturedSql.filter(postgresSchemaHasDestructiveDdl).length;
  const productionTableCount = enterprisePostgresSchemaTableDefinitions.filter((definition) => definition.productionRequired).length;
  const verifierTableCount = enterprisePostgresSchemaTableDefinitions.length - productionTableCount;
  const status = destructiveDdlStatementCount === 0 &&
    tableStatements.length === enterprisePostgresSchemaTableDefinitions.length
    ? "pass"
    : "review";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePostgresSchemaContract,
    generatedAt: new Date().toISOString(),
    status,
    schemaName,
    summary: {
      tableCount: tableStatements.length,
      productionTableCount,
      verifierTableCount,
      indexCount: indexStatements.length,
      uniqueIndexCount: indexStatements.filter((statement) => statement.kind === "unique-index").length,
      ddlStatementCount: statementFingerprints.length,
      destructiveDdlStatementCount,
      migrationMode: "create-if-not-exists"
    },
    tables: enterprisePostgresSchemaTableDefinitions.map((definition) => ({
      id: definition.id,
      name: definition.name,
      role: definition.role,
      productionRequired: definition.productionRequired
    })),
    indexes: indexStatements.map((statement) => ({
      name: statement.name,
      tableName: statement.tableName ?? "unknown",
      kind: statement.kind,
      sqlSha256: statement.sqlSha256
    })),
    ddl: {
      statementFingerprints,
      destructiveDdlExcluded: destructiveDdlStatementCount === 0,
      connectionValuesExcluded: true
    },
    evidence: [
      "schemaContractSource=enterprisePostgresAdapterEnsureSchema",
      "schemaContractSqlValues=hashed",
      "migrationMode=create-table-if-not-exists|add-column-if-not-exists|alter-column-nullability|create-index-if-not-exists",
      `schemaContractStatus=${status}`,
      `schemaContractTables=${tableStatements.length}`,
      `schemaContractProductionTables=${productionTableCount}`,
      `schemaContractIndexes=${indexStatements.length}`,
      `schemaContractUniqueIndexes=${indexStatements.filter((statement) => statement.kind === "unique-index").length}`,
      `schemaContractDdlStatements=${statementFingerprints.length}`,
      `schemaContractDestructiveDdlStatements=${destructiveDdlStatementCount}`,
      "connectionValues=excluded",
      "secretValues=excluded"
    ],
    redaction: {
      sqlValuesExcluded: true,
      connectionValuesExcluded: true,
      secretValuesExcluded: true
    }
  };
}

function postgresErrorHash(error: unknown) {
  const normalized = error instanceof Error
    ? `${error.name}:${"code" in error ? String((error as { code?: unknown }).code) : "unknown"}:${error.message}`
    : String(error);
  return sha256Text(normalized);
}

function postgresErrorCode(error: unknown) {
  if (error instanceof SenaEnterprisePostgresError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    return `postgres_${String((error as { code?: unknown }).code)}`;
  }
  return error instanceof Error ? "postgres_probe_error" : "postgres_probe_unknown_error";
}

function postgresProbeProvider(
  config: SenaEnterprisePostgresConfig,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): SenaEnterprisePostgresProbe["provider"] {
  return {
    configured: config.configured,
    adapter: config.adapter,
    urlEnvName: config.urlEnvName,
    connectionHash: config.connectionHash,
    missingEnv: config.missingEnv,
    pool: redactedPostgresPoolSettings(env),
    connectionValueExcluded: true
  };
}

function probeStep(input?: {
  ok: boolean;
  rowCount?: number | null;
  error?: unknown;
}): SenaEnterprisePostgresProbeStep {
  if (!input) {
    return {
      attempted: false,
      status: "review"
    };
  }
  return {
    attempted: true,
    status: input.ok ? "pass" : "review",
    rowCount: input.rowCount,
    errorCode: input.ok ? undefined : postgresErrorCode(input.error),
    errorHash: input.ok ? undefined : postgresErrorHash(input.error)
  };
}

function reviewPostgresProbe(input: {
  config: SenaEnterprisePostgresConfig;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  schemaContract: SenaEnterprisePostgresSchemaContract;
  schemaName?: string;
  tableName?: string;
  evidence: string[];
  error?: unknown;
}): SenaEnterprisePostgresProbe {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePostgresProbe,
    generatedAt: new Date().toISOString(),
    status: "review",
    provider: postgresProbeProvider(input.config, input.env),
    probe: {
      schemaName: input.schemaName ?? defaultSchemaName,
      tableName: input.tableName ?? defaultPostgresProbeTableName,
      createTable: probeStep(),
      insert: probeStep(),
      select: probeStep(),
      delete: probeStep(),
      cleanupStatus: "not-attempted"
    },
    schemaContract: input.schemaContract,
    evidence: [
      ...input.config.evidence,
      ...input.evidence,
      `schemaContractStatus=${input.schemaContract.status}`,
      `schemaContractTables=${input.schemaContract.summary.tableCount}`,
      `schemaContractIndexes=${input.schemaContract.summary.indexCount}`,
      input.error ? `errorHash=${postgresErrorHash(input.error)}` : "errorHash=none",
      "postgresProbeApi=/api/sena/ops/postgres",
      "postgresProbeScript=npm run sena:postgres:verify"
    ],
    redaction: {
      connectionValuesExcluded: true,
      probeIdValuesExcluded: true,
      secretValuesExcluded: true
    }
  };
}

export function enterprisePostgresProbeReadiness(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): SenaEnterprisePostgresProbeReadiness {
  const artifactHash = envValue(env, "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256");
  const verifiedAt = envValue(env, "SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt, env);
  const artifactValidationPassed = envValue(env, "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION") === "pass";
  const required = enterprisePostgresLiveProbeRequired(env);
  const confirmed = booleanEnv(env, "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  return {
    required,
    confirmed,
    artifactHash,
    verifiedAt,
    artifactHashConfigured,
    verifiedAtConfigured,
    evidence: [
      `postgresLiveProbeRequired=${required}`,
      `postgresLiveProbeConfirmed=${confirmed}`,
      `postgresProbeExplicitlyRequired=${booleanEnv(env, "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED")}`,
      `postgresProductionRuntime=${env.NODE_ENV === "production"}`,
      `postgresProductionPerformancePathRequired=${booleanEnv(env, "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `postgresProductionEvidenceManifestRequired=${booleanEnv(env, "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `postgresSaasOperatingModelApproved=${booleanEnv(env, "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `postgresProbeArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `postgresProbeVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt, env)}`,
      `postgresProbeArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      "postgresProbeApi=/api/sena/ops/postgres",
      "postgresProbeScript=npm run sena:postgres:verify",
      "postgresProbeSteps=CREATE_TABLE|INSERT|SELECT|DELETE"
    ]
  };
}

export function enterprisePostgresSchemaContractReadiness(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): SenaEnterprisePostgresSchemaContractReadiness {
  const artifactHash = envValue(env, "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256");
  const verifiedAt = envValue(env, "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt, env);
  const artifactValidationPassed = envValue(env, "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION") === "pass";
  const required = enterprisePostgresLiveProbeRequired(env) ||
    booleanEnv(env, "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_REQUIRED");
  const confirmed = booleanEnv(env, "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  return {
    required,
    confirmed,
    artifactHash,
    verifiedAt,
    artifactHashConfigured,
    verifiedAtConfigured,
    evidence: [
      `postgresSchemaContractRequired=${required}`,
      `postgresSchemaContractConfirmed=${confirmed}`,
      `postgresSchemaContractExplicitlyRequired=${booleanEnv(env, "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_REQUIRED")}`,
      `postgresSchemaContractProductionRuntime=${env.NODE_ENV === "production"}`,
      `postgresSchemaContractProductionPerformancePathRequired=${booleanEnv(env, "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `postgresSchemaContractProductionEvidenceManifestRequired=${booleanEnv(env, "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `postgresSchemaContractSaasOperatingModelApproved=${booleanEnv(env, "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `postgresSchemaContractArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `postgresSchemaContractVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt, env)}`,
      `postgresSchemaContractArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      `postgresSchemaContractSchema=${SENA_SCHEMA_VERSIONS.enterprisePostgresSchemaContract}`,
      "postgresSchemaContractScript=npm run sena:postgres:schema-contract",
      "postgresSchemaContractSource=enterprisePostgresAdapterEnsureSchema"
    ]
  };
}

async function runPostgresProbeStep(operation: () => Promise<{ rowCount?: number | null }>) {
  try {
    const result = await operation();
    return probeStep({ ok: true, rowCount: result.rowCount });
  } catch (error) {
    return probeStep({ ok: false, error });
  }
}

export async function verifyEnterprisePostgresProbe(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
  probeId?: string;
} = {}): Promise<SenaEnterprisePostgresProbe> {
  const env = input.env ?? process.env;
  const config = resolveEnterprisePostgresConfig(env);
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultPostgresProbeTableName;
  const schemaContract = await buildEnterprisePostgresSchemaContract({ schemaName });
  if (!config.configured) {
    return reviewPostgresProbe({
      config,
      env,
      schemaContract,
      schemaName,
      tableName,
      evidence: ["postgresConfig=missing", "probe=not-attempted"]
    });
  }

  let pool: SenaEnterprisePostgresPool | undefined;
  const probeId = input.probeId ?? `sena_pg_probe_${randomBytes(8).toString("hex")}`;
  const payloadSha256 = sha256Text(`${probeId}:${new Date().toISOString()}`);
  const tableRef = stateTableRef(schemaName, tableName);
  try {
    const poolOptions = enterprisePostgresPoolOptions(env);
    const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
    pool = poolFactory(poolOptions);
  } catch (error) {
    return reviewPostgresProbe({
      config,
      env,
      schemaContract,
      schemaName,
      tableName,
      evidence: ["postgresPool=not-created", "probe=not-attempted"],
      error
    });
  }

  const createTable = await runPostgresProbeStep(async () => pool!.query(postgresLiveProbeCreateTableSql(tableRef)));
  const insert = createTable.status === "pass"
    ? await runPostgresProbeStep(async () => pool!.query(`
      INSERT INTO ${tableRef} (id, payload_sha256)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE
      SET payload_sha256 = EXCLUDED.payload_sha256,
        created_at = now()
    `, [probeId, payloadSha256]))
    : probeStep();
  const select = insert.status === "pass"
    ? await runPostgresProbeStep(async () => {
      const result = await pool!.query<{ payload_sha256: string }>(`
        SELECT payload_sha256
        FROM ${tableRef}
        WHERE id = $1
        LIMIT 1
      `, [probeId]);
      if (result.rows[0]?.payload_sha256 !== payloadSha256) {
        throw new SenaEnterprisePostgresError("Postgres live probe payload mismatch.", 500, "postgres_probe_payload_mismatch");
      }
      return { rowCount: result.rows.length };
    })
    : probeStep();
  const deleteStep = insert.status === "pass"
    ? await runPostgresProbeStep(async () => pool!.query(`
      DELETE FROM ${tableRef}
      WHERE id = $1
    `, [probeId]))
    : probeStep();

  await pool.end?.();

  const cleanupStatus = deleteStep.attempted
    ? deleteStep.status === "pass" ? "deleted" : "review"
    : "not-attempted";
  const status: SenaEnterprisePostgresProbeStatus = createTable.status === "pass" &&
    insert.status === "pass" &&
    select.status === "pass" &&
    cleanupStatus === "deleted"
    ? "pass"
    : "review";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePostgresProbe,
    generatedAt: new Date().toISOString(),
    status,
    provider: postgresProbeProvider(config, env),
    probe: {
      schemaName,
      tableName,
      probeIdHash: sha256Text(probeId),
      payloadSha256,
      createTable,
      insert,
      select,
      delete: deleteStep,
      cleanupStatus
    },
    schemaContract,
    evidence: [
      ...config.evidence,
      `probeStatus=${status}`,
      `probeCreateTable=${createTable.status}`,
      `probeInsert=${insert.status}`,
      `probeSelect=${select.status}`,
      `probeDelete=${deleteStep.status}`,
      `schemaContractStatus=${schemaContract.status}`,
      `schemaContractTables=${schemaContract.summary.tableCount}`,
      `schemaContractIndexes=${schemaContract.summary.indexCount}`,
      "probeIdValue=excluded",
      "postgresConnectionValue=excluded",
      "postgresProbeApi=/api/sena/ops/postgres",
      "postgresProbeScript=npm run sena:postgres:verify"
    ],
    redaction: {
      connectionValuesExcluded: true,
      probeIdValuesExcluded: true,
      secretValuesExcluded: true
    }
  };
}

function assertSafeIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new SenaEnterprisePostgresError(`Invalid Postgres ${label} identifier.`, 500, "invalid_postgres_identifier");
  }
  return value;
}

function quotedIdentifier(value: string, label: string) {
  return `"${assertSafeIdentifier(value, label)}"`;
}

function stateTableRef(schemaName: string, tableName: string) {
  return `${quotedIdentifier(schemaName, "schema")}.${quotedIdentifier(tableName, "table")}`;
}

function indexIdentifier(value: string) {
  return quotedIdentifier(value, "index");
}

function roundTripJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalStoredJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalStoredJson(entry));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalStoredJson(entry)])
    );
  }
  return value;
}

function storedValuesMatch(rowValue: unknown, payloadValue: unknown) {
  if (payloadValue === null || payloadValue === undefined) {
    return rowValue === null || rowValue === undefined;
  }
  if (typeof payloadValue === "number") {
    return Number.isFinite(payloadValue) &&
      ((typeof rowValue === "number" && Number.isFinite(rowValue) && rowValue === payloadValue) ||
        (typeof rowValue === "string" && rowValue.trim().length > 0 && Number(rowValue) === payloadValue));
  }
  if (typeof payloadValue === "string" || typeof payloadValue === "boolean") {
    return rowValue === payloadValue;
  }
  try {
    return JSON.stringify(canonicalStoredJson(rowValue)) === JSON.stringify(canonicalStoredJson(payloadValue));
  } catch {
    return false;
  }
}

function storedDatesMatch(rowValue: unknown, payloadValue: unknown) {
  if (payloadValue === null || payloadValue === undefined) {
    return rowValue === null || rowValue === undefined;
  }
  try {
    return storedDateToIso(rowValue) === storedDateToIso(payloadValue);
  } catch {
    return false;
  }
}

function storedIntegrityFailure(
  path: string,
  rule: SenaEnterpriseStoredIntegrityIssue["rule"] = "row-payload-mismatch"
): never {
  throw new SenaEnterpriseStoredIntegrityError({ path, rule });
}

function assertStoredField(
  row: Record<string, unknown>,
  column: string,
  payloadValue: unknown,
  options: { date?: boolean } = {}
) {
  const matches = options.date
    ? storedDatesMatch(row[column], payloadValue)
    : storedValuesMatch(row[column], payloadValue);
  if (!matches) storedIntegrityFailure(`row.${column}`);
}

function normalizeStoredDb(value: unknown): SenaEnterpriseDb {
  const db = typeof value === "string" ? JSON.parse(value) as SenaEnterpriseDb : value as SenaEnterpriseDb;
  if (!db || typeof db !== "object" || db.schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseDb) {
    throw new SenaEnterprisePostgresError("Unsupported SENA enterprise Postgres state schema.", 500, "unsupported_postgres_state_schema");
  }
  return roundTripJson(db);
}

function normalizeStoredJson<T>(value: unknown): T {
  return roundTripJson(typeof value === "string" ? JSON.parse(value) : value) as T;
}

function storedDateToIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date(String(value)).toISOString();
}

function normalizeStoredServerJob(row: Record<string, unknown>): SenaEnterpriseServerJob {
  const schemaVersion = String(row.schema_version);
  if (schemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseServerJob &&
    schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.enterpriseServerJob) {
    storedIntegrityFailure("row.schema_version");
  }
  return projectEnterpriseServerJobReadModel({
    schemaVersion: schemaVersion as SenaEnterpriseServerJob["schemaVersion"],
    id: String(row.id),
    kind: String(row.kind) as SenaEnterpriseServerJobKind,
    status: String(row.status) as SenaEnterpriseServerJobStatus,
    queuedAt: storedDateToIso(row.queued_at),
    updatedAt: storedDateToIso(row.updated_at),
    teamId: String(row.team_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    actorUserId: String(row.actor_user_id),
    payloadSha256: String(row.payload_sha256),
    payloadSummary: normalizeStoredJson<SenaEnterpriseServerJob["payloadSummary"]>(row.payload_summary),
    provider: normalizeStoredJson<SenaEnterpriseServerJob["provider"]>(row.provider),
    delivery: normalizeStoredJson<SenaEnterpriseServerJob["delivery"]>(row.delivery),
    worker: normalizeStoredJson<SenaEnterpriseServerJob["worker"]>(row.worker),
    lifecycle: normalizeStoredJson<SenaEnterpriseServerJob["lifecycle"]>(row.lifecycle),
    resultReceipt: row.result_receipt
      ? normalizeStoredJson<SenaEnterpriseServerJob["resultReceipt"]>(row.result_receipt)
      : undefined,
    redaction: normalizeStoredJson<SenaEnterpriseServerJob["redaction"]>(row.redaction)
  });
}

function normalizeStoredAuditLogEntry(row: Record<string, unknown>): SenaEnterpriseAuditLogEntry {
  return {
    id: String(row.id),
    event: String(row.event) as SenaEnterpriseAuditEvent,
    userId: row.user_id ? String(row.user_id) : undefined,
    teamId: row.team_id ? String(row.team_id) : undefined,
    projectId: row.project_id ? String(row.project_id) : undefined,
    createdAt: storedDateToIso(row.created_at),
    detail: normalizeStoredJson<SenaEnterpriseAuditLogEntry["detail"]>(row.detail),
    webhookDelivery: row.webhook_delivery
      ? normalizeStoredJson<SenaEnterpriseAuditLogEntry["webhookDelivery"]>(row.webhook_delivery)
      : undefined
  };
}

function normalizeStoredUpload(row: Record<string, unknown>): SenaEnterpriseUpload {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    userId: String(row.user_id),
    originalName: String(row.original_name),
    storedName: String(row.stored_name),
    contentType: String(row.content_type),
    size: Number(row.size_bytes ?? 0),
    sha256: String(row.sha256),
    importProfile: row.import_profile ? String(row.import_profile) : undefined,
    warningCount: Number(row.warning_count ?? 0),
    scanStatus: String(row.scan_status) as SenaEnterpriseUpload["scanStatus"],
    scanEngine: String(row.scan_engine) as SenaEnterpriseUpload["scanEngine"],
    scanFindings: normalizeStoredJson<SenaEnterpriseUpload["scanFindings"]>(row.scan_findings),
    storagePath: String(row.storage_path),
    objectStorageCustody: row.object_storage_custody
      ? normalizeStoredJson<SenaEnterpriseUpload["objectStorageCustody"]>(row.object_storage_custody)
      : undefined,
    createdAt: storedDateToIso(row.created_at)
  };
}

function normalizeStoredImportRun(row: Record<string, unknown>): SenaEnterpriseImportRun {
  const payload = normalizeStoredJson<SenaEnterpriseImportRun>(row.payload);
  return {
    ...payload,
    createdAt: storedDateToIso(payload.createdAt)
  };
}

function normalizeStoredAnalysisRun(row: Record<string, unknown>): SenaEnterpriseAnalysisRun {
  const payload = normalizeStoredJson<SenaEnterpriseAnalysisRun>(row.payload);
  return {
    ...payload,
    createdAt: storedDateToIso(payload.createdAt)
  };
}

type SenaEnterpriseReliabilityProjectSource = {
  id: string;
  teamId: string;
  currentVersion: number;
  snapshot: SenaProjectSnapshot;
};

type SenaEnterpriseReliabilityReadContext = {
  project?: SenaEnterpriseReliabilityProjectSource;
  projectRevisions?: Array<{
    projectId: string;
    teamId: string;
    version: number;
    snapshot: SenaProjectSnapshot;
  }>;
  expectedProjectId?: string;
  expectedTeamId?: string;
  expectedTeamIds?: string[];
  expectedStatus?: SenaEnterpriseReliabilityRunStatus;
  adjudications?: SenaEnterpriseAdjudicationRecord[];
};

function normalizeStoredReliabilityRun(
  row: Record<string, unknown>,
  context: SenaEnterpriseReliabilityReadContext = {}
): SenaEnterpriseReliabilityRun {
  const payload = normalizeStoredJson<Omit<SenaEnterpriseReliabilityRun, "dashboard"> & {
    dashboard: SenaReliabilityDashboardReadModel;
  }>(row.payload);

  const identityRowFields: Array<[string, unknown, { date?: boolean }?]> = [
    ["id", payload.id],
    ["team_id", payload.teamId],
    ["project_id", payload.projectId],
    ["user_id", payload.userId],
    ["status", payload.status],
    ["reviewed_by", payload.reviewedBy],
    ["reviewed_at", payload.reviewedAt, { date: true }],
    ["reviewer", payload.reviewer],
    ["file_count", payload.fileCount],
    ["input_files", payload.inputFiles],
    ["created_at", payload.createdAt, { date: true }]
  ];
  identityRowFields.forEach(([column, value, options]) => assertStoredField(row, column, value, options));

  if (context.expectedProjectId !== undefined && payload.projectId !== context.expectedProjectId) {
    storedIntegrityFailure("row.project_id");
  }
  if (context.expectedTeamId !== undefined && payload.teamId !== context.expectedTeamId) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedTeamIds !== undefined && !context.expectedTeamIds.includes(payload.teamId)) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedStatus !== undefined && payload.status !== context.expectedStatus) {
    storedIntegrityFailure("row.status");
  }

  let dashboard: SenaReliabilityDashboard;
  let resolvedScope: ReturnType<typeof resolveEnterpriseReliabilityRunProjectScope> | undefined;
  if (payload.projectId) {
    if (!context.project) {
      storedIntegrityFailure("payload.projectBinding", "current-project-source-required");
    }
    try {
      resolvedScope = resolveEnterpriseReliabilityRunProjectScope(
        payload,
        context.project,
        context.projectRevisions ?? []
      );
      dashboard = resolvedScope.dashboard;
    } catch {
      storedIntegrityFailure("payload.projectBinding", "current-project-binding-mismatch");
    }
  } else if (context.project) {
    storedIntegrityFailure("row.project_id");
  } else {
    dashboard = normalizeSenaReliabilityDashboard(payload.dashboard);
  }
  const canonicalDerivedFields = {
    annotationCount: dashboard.derivationEvidence?.annotations.length ?? payload.annotationCount,
    coderCount: dashboard.coderCount,
    itemCount: dashboard.itemCount,
    codeCount: dashboard.codeCount,
    meanPairwiseKappa: dashboard.meanPairwiseKappa,
    krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
    disagreementCount: dashboard.disagreementCount
  };
  for (const [field, canonicalValue] of Object.entries(canonicalDerivedFields)) {
    if (!storedValuesMatch(payload[field as keyof typeof payload], canonicalValue)) {
      storedIntegrityFailure(`payload.${field}`);
    }
  }
  let adjudicationCoverage: SenaEnterpriseReliabilityRun["adjudicationCoverage"];
  try {
    adjudicationCoverage = resolvedScope && context.adjudications !== undefined
      ? buildEnterpriseReliabilityAdjudicationCoverageFromResolvedScope(
          { ...payload, dashboard },
          resolvedScope,
          context.adjudications
        )
      : normalizeEnterpriseReliabilityAdjudicationCoverageSummary(
          dashboard,
          payload.adjudicationCoverage
        );
  } catch {
    storedIntegrityFailure("payload.adjudicationCoverage");
  }
  if (!storedValuesMatch(payload.adjudicationCoverage, adjudicationCoverage)) {
    storedIntegrityFailure("payload.adjudicationCoverage");
  }
  const derivedRowFields: Array<[string, unknown]> = [
    ["annotation_count", canonicalDerivedFields.annotationCount],
    ["coder_count", canonicalDerivedFields.coderCount],
    ["item_count", canonicalDerivedFields.itemCount],
    ["code_count", canonicalDerivedFields.codeCount],
    ["mean_pairwise_kappa", canonicalDerivedFields.meanPairwiseKappa],
    ["krippendorff_alpha_nominal", canonicalDerivedFields.krippendorffAlphaNominal],
    ["disagreement_count", canonicalDerivedFields.disagreementCount],
    ["adjudication_coverage_rate", adjudicationCoverage.coverageRate],
    ["unresolved_disagreements", adjudicationCoverage.unresolvedDisagreements]
  ];
  derivedRowFields.forEach(([column, value]) => assertStoredField(row, column, value));
  return {
    ...payload,
    dashboard,
    projectBinding: dashboard.projectBinding,
    ...canonicalDerivedFields,
    adjudicationCoverage,
    createdAt: storedDateToIso(payload.createdAt),
    reviewedAt: payload.reviewedAt ? storedDateToIso(payload.reviewedAt) : undefined
  };
}

type SenaEnterpriseValidationProjectSource = {
  id: string;
  teamId: string;
  currentVersion: number;
  snapshot: SenaProjectSnapshot;
};

// Bound one SQL read independently of the larger file-state retention window.
// Exact claim targets use a separate id/status lookup with LIMIT 1.
export const SENA_POSTGRES_VALIDATION_LIST_REPLAY_LIMIT = 100;

type SenaEnterpriseValidationReadContext = {
  project?: SenaEnterpriseValidationProjectSource;
  projectRevisions?: Array<{
    projectId: string;
    teamId: string;
    version: number;
    snapshot: SenaProjectSnapshot;
  }>;
  analysisRuns?: Array<Pick<
    SenaEnterpriseAnalysisRun,
    "id" | "teamId" | "projectId" | "persistedProjectId" | "artifactFingerprints"
  >>;
  analysisRunIndex?: SenaEnterpriseValidationAnalysisRunIndex;
  snapshotHashCache?: SenaEnterpriseValidationSnapshotHashCache;
  sourceVerificationCache?: SenaGroupComparisonSourceVerificationCache;
  expectedProjectId?: string;
  expectedTeamId?: string;
  expectedTeamIds?: string[];
  expectedStatus?: SenaEnterpriseValidationRunStatus;
  expectedRunId?: string;
};

function normalizeStoredValidationRun(
  row: Record<string, unknown>,
  context: SenaEnterpriseValidationReadContext = {}
): SenaEnterpriseValidationRun {
  const rawPayload = normalizeStoredJson<Omit<SenaEnterpriseValidationRun, "result"> & {
    result: SenaGroupComparisonValidationReadModel;
  }>(row.payload);
  let payload: SenaEnterpriseValidationRun;
  try {
    payload = projectEnterpriseValidationRunReadCarrier(rawPayload);
  } catch (error) {
    if (error instanceof SenaEnterpriseValidationRunIntegrityError) {
      storedIntegrityFailure(`payload.${error.path}`);
    }
    throw error;
  }
  const rowFields: Array<[string, unknown, { date?: boolean }?]> = [
    ["id", payload.id],
    ["team_id", payload.teamId],
    ["project_id", payload.projectId],
    ["user_id", payload.userId],
    ["status", payload.status],
    ["reviewer_id", payload.reviewerId],
    ["reviewed_at", payload.reviewedAt, { date: true }],
    ["metric", payload.metric],
    ["group_field", payload.groupField],
    ["group_a", payload.groupA],
    ["group_b", payload.groupB],
    ["iterations", payload.iterations],
    ["seed", payload.seed],
    ["p_two_sided", payload.pTwoSided],
    ["comparison_count", payload.comparisonCount ?? 1],
    ["min_holm_adjusted_p", payload.minHolmAdjustedP],
    ["significant_holm_count", payload.significantHolmCount],
    ["observed_difference", payload.observedDifference],
    ["result_schema_version", payload.result?.schemaVersion],
    ["preregistration_plan_hash", payload.preregistrationPlan?.planHash],
    ["parity_evidence_status", payload.parityEvidence?.status],
    ["parity_evidence_hash", payload.parityEvidence?.validationRunHash],
    ["formal_inference_status", payload.parityEvidence?.formalInference?.status],
    ["created_at", payload.createdAt, { date: true }]
  ];
  rowFields.forEach(([column, value, options]) => assertStoredField(row, column, value, options));

  const projectIds = [context.expectedProjectId, context.project?.id, payload.projectId]
    .filter((value): value is string => value !== undefined);
  if (projectIds.length > 0) {
    if (projectIds.length !== 3 || new Set(projectIds).size !== 1 ||
      typeof row.project_id !== "string" || row.project_id !== projectIds[0]) {
      storedIntegrityFailure("row.project_id", "current-project-binding-mismatch");
    }
  } else if (row.project_id !== null && row.project_id !== undefined) {
    storedIntegrityFailure("row.project_id");
  }
  if (context.expectedTeamId !== undefined && payload.teamId !== context.expectedTeamId) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedTeamIds !== undefined && !context.expectedTeamIds.includes(payload.teamId)) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedStatus !== undefined && payload.status !== context.expectedStatus) {
    storedIntegrityFailure("row.status");
  }
  if (context.expectedRunId !== undefined &&
    (payload.id !== context.expectedRunId || row.id !== context.expectedRunId)) {
    storedIntegrityFailure("row.id");
  }

  const storedRun = {
    ...payload,
    createdAt: storedDateToIso(payload.createdAt),
    reviewedAt: payload.reviewedAt ? storedDateToIso(payload.reviewedAt) : undefined
  };
  let normalizedRun: SenaEnterpriseValidationRun;
  try {
    normalizedRun = normalizeEnterpriseValidationRunEvidence(
      storedRun as unknown as SenaEnterpriseValidationRun,
      context.project,
      {
        evidenceHash: "optional",
        projectRevisions: context.projectRevisions,
        analysisRuns: context.analysisRuns,
        analysisRunIndex: context.analysisRunIndex,
        snapshotHashCache: context.snapshotHashCache,
        sourceVerificationCache: context.sourceVerificationCache
      }
    );
  } catch (error) {
    if (error instanceof SenaEnterpriseValidationRunIntegrityError) {
      storedIntegrityFailure(`payload.${error.path}`);
    }
    throw error;
  }
  const derived = {
    metric: normalizedRun.metric,
    groupField: normalizedRun.groupField,
    groupA: normalizedRun.groupA,
    groupB: normalizedRun.groupB,
    iterations: normalizedRun.iterations,
    seed: normalizedRun.seed,
    pTwoSided: normalizedRun.pTwoSided,
    comparisonCount: normalizedRun.comparisonCount ?? 1,
    minHolmAdjustedP: normalizedRun.minHolmAdjustedP,
    significantHolmCount: normalizedRun.significantHolmCount,
    observedDifference: normalizedRun.observedDifference
  };
  for (const [key, expected] of Object.entries(derived)) {
    if (!storedValuesMatch(payload[key as keyof typeof payload], expected)) {
      storedIntegrityFailure(`payload.${key}`);
    }
  }
  return normalizedRun;
}

type SenaEnterpriseExpertReviewReadContext = {
  expectedProjectId?: string;
  expectedTeamId?: string;
  expectedTeamIds?: string[];
  expectedStatus?: SenaEnterpriseExpertReviewStatus;
  expectedClaimScope?: SenaEnterpriseExpertReview["claimScope"];
};

function normalizeStoredExpertReview(
  row: Record<string, unknown>,
  context: SenaEnterpriseExpertReviewReadContext = {}
): SenaEnterpriseExpertReview {
  const payload = normalizeStoredJson<SenaEnterpriseExpertReview>(row.payload);
  const rowFields: Array<[string, unknown, { date?: boolean }?]> = [
    ["id", payload.id],
    ["team_id", payload.teamId],
    ["project_id", payload.projectId],
    ["user_id", payload.userId],
    ["status", payload.status],
    ["target_kind", payload.target?.kind],
    ["target_id", payload.target?.id],
    ["target_label", payload.target?.label],
    ["reviewer_name", payload.reviewerName],
    ["reviewer_role", payload.reviewerRole],
    ["expertise_area", payload.expertiseArea],
    ["claim_scope", payload.claimScope],
    ["data_adequacy", payload.ratings?.dataAdequacy],
    ["method_fit", payload.ratings?.methodFit],
    ["interpretation_validity", payload.ratings?.interpretationValidity],
    ["reviewed_at", payload.reviewedAt, { date: true }],
    ["created_at", payload.createdAt, { date: true }],
    ["updated_at", payload.updatedAt, { date: true }]
  ];
  rowFields.forEach(([column, value, options]) => assertStoredField(row, column, value, options));
  if (context.expectedProjectId !== undefined && payload.projectId !== context.expectedProjectId) {
    storedIntegrityFailure("row.project_id");
  }
  if (context.expectedTeamId !== undefined && payload.teamId !== context.expectedTeamId) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedTeamIds !== undefined && !context.expectedTeamIds.includes(payload.teamId)) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedStatus !== undefined && payload.status !== context.expectedStatus) {
    storedIntegrityFailure("row.status");
  }
  if (context.expectedClaimScope !== undefined && payload.claimScope !== context.expectedClaimScope) {
    storedIntegrityFailure("row.claim_scope");
  }
  const normalized: SenaEnterpriseExpertReview = {
    ...payload,
    createdAt: storedDateToIso(payload.createdAt),
    updatedAt: storedDateToIso(payload.updatedAt),
    reviewedAt: payload.reviewedAt ? storedDateToIso(payload.reviewedAt) : undefined
  };
  return normalized;
}

type SenaEnterpriseAdjudicationReadContext = {
  expectedProjectId?: string;
  expectedReliabilityRunId?: string;
  expectedTeamId?: string;
  expectedTeamIds?: string[];
};

function normalizeStoredAdjudication(
  row: Record<string, unknown>,
  context: SenaEnterpriseAdjudicationReadContext = {}
): SenaEnterpriseAdjudicationRecord {
  const payload = normalizeStoredJson<SenaEnterpriseAdjudicationRecord>(row.payload);
  const rowFields: Array<[string, unknown, { date?: boolean }?]> = [
    ["id", payload.id],
    ["project_id", payload.projectId],
    ["team_id", payload.teamId],
    ["reliability_run_id", payload.reliabilityRunId],
    ["item_id", payload.itemId],
    ["code_id", payload.codeId],
    ["decision", payload.decision],
    ["reviewer_id", payload.reviewerId],
    ["coder_values", payload.coderValues],
    ["created_at", payload.createdAt, { date: true }]
  ];
  rowFields.forEach(([column, value, options]) => assertStoredField(row, column, value, options));
  if (context.expectedProjectId !== undefined && payload.projectId !== context.expectedProjectId) {
    storedIntegrityFailure("row.project_id");
  }
  if (context.expectedReliabilityRunId !== undefined &&
    payload.reliabilityRunId !== context.expectedReliabilityRunId) {
    storedIntegrityFailure("row.reliability_run_id");
  }
  if (context.expectedTeamId !== undefined && payload.teamId !== context.expectedTeamId) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedTeamIds !== undefined && !context.expectedTeamIds.includes(payload.teamId)) {
    storedIntegrityFailure("row.team_id");
  }
  return {
    ...payload,
    createdAt: storedDateToIso(payload.createdAt)
  };
}

type SenaEnterpriseProjectCommentReadContext = {
  expectedProjectId?: string;
  expectedTeamId?: string;
  expectedTeamIds?: string[];
  expectedStatus?: SenaEnterpriseProjectComment["status"];
};

function normalizeStoredProjectComment(
  row: Record<string, unknown>,
  context: SenaEnterpriseProjectCommentReadContext = {}
): SenaEnterpriseProjectComment {
  const payload = normalizeStoredJson<SenaEnterpriseProjectComment>(row.payload);
  const rowFields: Array<[string, unknown, { date?: boolean }?]> = [
    ["id", payload.id],
    ["project_id", payload.projectId],
    ["team_id", payload.teamId],
    ["user_id", payload.userId],
    ["target_kind", payload.target?.kind],
    ["target_id", payload.target?.id],
    ["target_label", payload.target?.label],
    ["status", payload.status],
    ["created_at", payload.createdAt, { date: true }],
    ["updated_at", payload.updatedAt, { date: true }]
  ];
  rowFields.forEach(([column, value, options]) => assertStoredField(row, column, value, options));
  if (context.expectedProjectId !== undefined && payload.projectId !== context.expectedProjectId) {
    storedIntegrityFailure("row.project_id");
  }
  if (context.expectedTeamId !== undefined && payload.teamId !== context.expectedTeamId) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedTeamIds !== undefined && !context.expectedTeamIds.includes(payload.teamId)) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedStatus !== undefined && payload.status !== context.expectedStatus) {
    storedIntegrityFailure("row.status");
  }
  return {
    ...payload,
    createdAt: storedDateToIso(payload.createdAt),
    updatedAt: storedDateToIso(payload.updatedAt)
  };
}

type SenaEnterpriseProjectPresenceReadContext = {
  expectedProjectId?: string;
  expectedTeamId?: string;
  expectedTeamIds?: string[];
};

function normalizeStoredProjectPresence(
  row: Record<string, unknown>,
  context: SenaEnterpriseProjectPresenceReadContext = {}
): SenaEnterpriseProjectPresence {
  const payload = normalizeStoredJson<SenaEnterpriseProjectPresence>(row.payload);
  const rowFields: Array<[string, unknown, { date?: boolean }?]> = [
    ["id", payload.id],
    ["project_id", payload.projectId],
    ["team_id", payload.teamId],
    ["user_id", payload.userId],
    ["active_view", payload.activeView],
    ["cursor_label", payload.cursorLabel],
    ["updated_at", payload.updatedAt, { date: true }],
    ["expires_at", payload.expiresAt, { date: true }]
  ];
  rowFields.forEach(([column, value, options]) => assertStoredField(row, column, value, options));
  if (context.expectedProjectId !== undefined && payload.projectId !== context.expectedProjectId) {
    storedIntegrityFailure("row.project_id");
  }
  if (context.expectedTeamId !== undefined && payload.teamId !== context.expectedTeamId) {
    storedIntegrityFailure("row.team_id");
  }
  if (context.expectedTeamIds !== undefined && !context.expectedTeamIds.includes(payload.teamId)) {
    storedIntegrityFailure("row.team_id");
  }
  return {
    ...payload,
    updatedAt: storedDateToIso(payload.updatedAt),
    expiresAt: storedDateToIso(payload.expiresAt)
  };
}

function normalizeStoredObservedRequest(row: Record<string, unknown>): SenaEnterpriseObservedRequest {
  const payload = row.payload
    ? normalizeStoredJson<Partial<SenaEnterpriseObservedRequest>>(row.payload)
    : {};
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseObservedRequest,
    observedAt: storedDateToIso(row.observed_at ?? payload.observedAt),
    requestIdHash: String(row.request_id_hash ?? payload.requestIdHash),
    routeId: String(row.route_id ?? payload.routeId),
    method: String(row.method ?? payload.method),
    statusCode: Number(row.status_code ?? payload.statusCode ?? 0),
    statusClass: String(row.status_class ?? payload.statusClass ?? "unknown") as SenaEnterpriseObservedRequest["statusClass"],
    durationMs: Number(row.duration_ms ?? payload.durationMs ?? 0),
    slow: Boolean(row.slow ?? payload.slow),
    error: Boolean(row.error ?? payload.error),
    errorCodeHash: row.error_code_hash ? String(row.error_code_hash) : payload.errorCodeHash,
    redaction: payload.redaction ?? {
      requestIdValueExcluded: true,
      pathValueExcluded: true,
      queryValueExcluded: true,
      payloadValueExcluded: true,
      secretValuesExcluded: true
    }
  };
}

export function createEnterprisePostgresStateAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  initialDb: () => SenaEnterpriseDb;
  schemaName?: string;
  tableName?: string;
  stateKey?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultStateTableName;
  const stateKey = input.stateKey ?? defaultStateKey;
  const tableRef = stateTableRef(schemaName, tableName);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        schema_version text NOT NULL,
        revision bigint NOT NULL DEFAULT 0,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    schemaReady = true;
  }

  async function readState(): Promise<SenaEnterprisePostgresStateRead> {
    await ensureSchema();
    const current = await input.query<{
      revision: number | string;
      payload: unknown;
    }>(`
      SELECT revision, payload
      FROM ${tableRef}
      WHERE id = $1
      LIMIT 1
    `, [stateKey]);

    const row = current.rows[0];
    if (row) {
      return {
        db: normalizeStoredDb(row.payload),
        revision: Number(row.revision),
        initialized: false
      };
    }

    const db = roundTripJson(input.initialDb());
    await input.query(`
      INSERT INTO ${tableRef} (id, schema_version, payload, revision)
      VALUES ($1, $2, $3::jsonb, 0)
      ON CONFLICT (id) DO NOTHING
    `, [stateKey, db.schemaVersion, db]);
    return { db, revision: 0, initialized: true };
  }

  async function writeState(
    db: SenaEnterpriseDb,
    options: { expectedRevision?: number } = {}
  ): Promise<SenaEnterprisePostgresStateWrite> {
    await ensureSchema();
    const payload = roundTripJson(db);
    if (options.expectedRevision !== undefined) {
      const result = await input.query<{ revision: number | string }>(`
        UPDATE ${tableRef}
        SET payload = $1::jsonb,
          schema_version = $4,
          revision = revision + 1,
          updated_at = now()
        WHERE id = $2 AND revision = $3
        RETURNING revision
      `, [payload, stateKey, options.expectedRevision, payload.schemaVersion]);
      const row = result.rows[0];
      if (!row) {
        throw new SenaEnterprisePostgresError(
          "Postgres enterprise state revision conflict.",
          409,
          "postgres_state_revision_conflict"
        );
      }
      return { revision: Number(row.revision) };
    }

    const result = await input.query<{ revision: number | string }>(`
      INSERT INTO ${tableRef} (id, schema_version, payload, revision)
      VALUES ($1, $2, $3::jsonb, 0)
      ON CONFLICT (id) DO UPDATE
      SET payload = EXCLUDED.payload,
        schema_version = EXCLUDED.schema_version,
        revision = ${tableRef}.revision + 1,
        updated_at = now()
      RETURNING revision
    `, [stateKey, payload.schemaVersion, payload]);
    return { revision: Number(result.rows[0]?.revision ?? 0) };
  }

  return {
    ensureSchema,
    readState,
    writeState
  };
}

export function createEnterprisePostgresUploadAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultUploadsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const shaIndex = indexIdentifier(`${tableName}_sha256_idx`);
  const custodyIndex = indexIdentifier(`${tableName}_custody_status_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        team_id text NOT NULL,
        user_id text NOT NULL,
        original_name text NOT NULL,
        stored_name text NOT NULL,
        content_type text NOT NULL,
        size_bytes bigint NOT NULL,
        sha256 text NOT NULL,
        import_profile text,
        warning_count integer NOT NULL DEFAULT 0,
        scan_status text NOT NULL,
        scan_engine text NOT NULL,
        scan_findings jsonb NOT NULL,
        storage_path text NOT NULL,
        object_storage_custody jsonb,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${shaIndex} ON ${tableRef} (sha256)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${custodyIndex} ON ${tableRef} ((COALESCE(object_storage_custody->>'status', 'pending')))`);
    schemaReady = true;
  }

  async function upsertUploads(uploads: SenaEnterpriseUpload[]) {
    await ensureSchema();
    for (const upload of uploads) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          team_id,
          user_id,
          original_name,
          stored_name,
          content_type,
          size_bytes,
          sha256,
          import_profile,
          warning_count,
          scan_status,
          scan_engine,
          scan_findings,
          storage_path,
          object_storage_custody,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13::jsonb,
          $14,
          $15::jsonb,
          $16,
          now()
        )
        ON CONFLICT (id) DO UPDATE
        SET team_id = EXCLUDED.team_id,
          user_id = EXCLUDED.user_id,
          original_name = EXCLUDED.original_name,
          stored_name = EXCLUDED.stored_name,
          content_type = EXCLUDED.content_type,
          size_bytes = EXCLUDED.size_bytes,
          sha256 = EXCLUDED.sha256,
          import_profile = EXCLUDED.import_profile,
          warning_count = EXCLUDED.warning_count,
          scan_status = EXCLUDED.scan_status,
          scan_engine = EXCLUDED.scan_engine,
          scan_findings = EXCLUDED.scan_findings,
          storage_path = EXCLUDED.storage_path,
          object_storage_custody = EXCLUDED.object_storage_custody,
          created_at = EXCLUDED.created_at,
          updated_at = now()
      `, [
        upload.id,
        upload.teamId,
        upload.userId,
        upload.originalName,
        upload.storedName,
        upload.contentType,
        upload.size,
        upload.sha256,
        upload.importProfile ?? null,
        // Mirror column is NOT NULL DEFAULT 0, so the unset ("not yet parsed")
        // state flattens to 0 here; the primary document store preserves it.
        upload.warningCount ?? 0,
        upload.scanStatus,
        upload.scanEngine,
        roundTripJson(upload.scanFindings),
        upload.storagePath,
        upload.objectStorageCustody ? roundTripJson(upload.objectStorageCustody) : null,
        upload.createdAt
      ]);
    }
  }

  async function listUploads(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredUpload(row));
  }

  return {
    ensureSchema,
    upsertUploads,
    listUploads
  };
}

export function createEnterprisePostgresImportRunAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultImportRunsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const statusIndex = indexIdentifier(`${tableName}_status_created_idx`);
  const warningIndex = indexIdentifier(`${tableName}_warnings_created_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        team_id text NOT NULL,
        user_id text NOT NULL,
        status text NOT NULL,
        file_count integer NOT NULL,
        upload_ids jsonb NOT NULL,
        source_profiles jsonb NOT NULL,
        warning_count integer NOT NULL DEFAULT 0,
        warnings_preview jsonb NOT NULL,
        cleaning_manifest_schema text,
        dataset_counts jsonb NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${statusIndex} ON ${tableRef} (status, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${warningIndex} ON ${tableRef} (warning_count, created_at DESC)`);
    schemaReady = true;
  }

  async function upsertImportRuns(runs: SenaEnterpriseImportRun[]) {
    await ensureSchema();
    for (const run of runs) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          team_id,
          user_id,
          status,
          file_count,
          upload_ids,
          source_profiles,
          warning_count,
          warnings_preview,
          cleaning_manifest_schema,
          dataset_counts,
          payload,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7::jsonb,
          $8,
          $9::jsonb,
          $10,
          $11::jsonb,
          $12::jsonb,
          $13,
          now()
        )
        ON CONFLICT (id) DO UPDATE
        SET team_id = EXCLUDED.team_id,
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          file_count = EXCLUDED.file_count,
          upload_ids = EXCLUDED.upload_ids,
          source_profiles = EXCLUDED.source_profiles,
          warning_count = EXCLUDED.warning_count,
          warnings_preview = EXCLUDED.warnings_preview,
          cleaning_manifest_schema = EXCLUDED.cleaning_manifest_schema,
          dataset_counts = EXCLUDED.dataset_counts,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = now()
      `, [
        run.id,
        run.teamId,
        run.userId,
        run.status,
        run.fileCount,
        roundTripJson(run.uploadIds),
        roundTripJson(Array.from(new Set(run.sources.map((source) => source.profile)))),
        run.warningCount,
        roundTripJson(run.warningsPreview),
        run.cleaningManifest?.schemaVersion ?? null,
        roundTripJson(run.datasetCounts),
        roundTripJson(run),
        run.createdAt
      ]);
    }
  }

  async function listImportRuns(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    status?: SenaEnterpriseImportRun["status"];
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.status) {
      clauses.push(`status = ${add(inputFilters.status)}`);
    }
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredImportRun(row));
  }

  return {
    ensureSchema,
    upsertImportRuns,
    listImportRuns
  };
}

export function createEnterprisePostgresAnalysisRunAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultAnalysisRunsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_created_idx`);
  const persistedProjectIndex = indexIdentifier(`${tableName}_persisted_project_created_idx`);
  const sourceIndex = indexIdentifier(`${tableName}_source_created_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        schema_version text NOT NULL,
        team_id text NOT NULL,
        user_id text NOT NULL,
        project_id text,
        persisted_project_id text,
        source_kind text NOT NULL,
        title text NOT NULL,
        active_temporal_window_id text,
        dataset_counts jsonb NOT NULL,
        analysis_dataset_counts jsonb NOT NULL,
        summary jsonb NOT NULL,
        artifact_fingerprints jsonb NOT NULL,
        include_runtime_bundle boolean NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, created_at DESC) WHERE project_id IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${persistedProjectIndex} ON ${tableRef} (persisted_project_id, created_at DESC) WHERE persisted_project_id IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${sourceIndex} ON ${tableRef} (source_kind, created_at DESC)`);
    schemaReady = true;
  }

  async function upsertAnalysisRuns(runs: SenaEnterpriseAnalysisRun[]) {
    await ensureSchema();
    for (const run of runs) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          schema_version,
          team_id,
          user_id,
          project_id,
          persisted_project_id,
          source_kind,
          title,
          active_temporal_window_id,
          dataset_counts,
          analysis_dataset_counts,
          summary,
          artifact_fingerprints,
          include_runtime_bundle,
          payload,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11::jsonb,
          $12::jsonb,
          $13::jsonb,
          $14,
          $15::jsonb,
          $16,
          now()
        )
        ON CONFLICT (id) DO UPDATE
        SET schema_version = EXCLUDED.schema_version,
          team_id = EXCLUDED.team_id,
          user_id = EXCLUDED.user_id,
          project_id = EXCLUDED.project_id,
          persisted_project_id = EXCLUDED.persisted_project_id,
          source_kind = EXCLUDED.source_kind,
          title = EXCLUDED.title,
          active_temporal_window_id = EXCLUDED.active_temporal_window_id,
          dataset_counts = EXCLUDED.dataset_counts,
          analysis_dataset_counts = EXCLUDED.analysis_dataset_counts,
          summary = EXCLUDED.summary,
          artifact_fingerprints = EXCLUDED.artifact_fingerprints,
          include_runtime_bundle = EXCLUDED.include_runtime_bundle,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = now()
      `, [
        run.id,
        SENA_SCHEMA_VERSIONS.analysisRun,
        run.teamId,
        run.userId,
        run.projectId ?? null,
        run.persistedProjectId ?? null,
        run.sourceKind,
        run.title,
        run.activeTemporalWindow?.id ?? null,
        roundTripJson(run.datasetCounts),
        roundTripJson(run.analysisDatasetCounts),
        roundTripJson(run.summary),
        roundTripJson(run.artifactFingerprints),
        run.includeRuntimeBundle,
        roundTripJson(run),
        run.createdAt
      ]);
    }
  }

  async function listAnalysisRuns(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    projectId?: string;
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.projectId) {
      const placeholder = add(inputFilters.projectId);
      clauses.push(`(project_id = ${placeholder} OR persisted_project_id = ${placeholder})`);
    }
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredAnalysisRun(row));
  }

  return {
    ensureSchema,
    upsertAnalysisRuns,
    listAnalysisRuns
  };
}

export function createEnterprisePostgresReliabilityRunAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultReliabilityRunsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_created_idx`);
  const statusIndex = indexIdentifier(`${tableName}_status_created_idx`);
  const reviewIndex = indexIdentifier(`${tableName}_reviewed_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        team_id text NOT NULL,
        project_id text,
        user_id text NOT NULL,
        status text NOT NULL,
        reviewed_by text,
        reviewed_at timestamptz,
        reviewer text NOT NULL,
        file_count integer NOT NULL,
        annotation_count integer NOT NULL,
        coder_count integer NOT NULL,
        item_count integer NOT NULL,
        code_count integer NOT NULL,
        mean_pairwise_kappa double precision,
        krippendorff_alpha_nominal double precision,
        disagreement_count integer NOT NULL,
        adjudication_coverage_rate double precision NOT NULL,
        unresolved_disagreements integer NOT NULL,
        input_files jsonb NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await input.query(`ALTER TABLE ${tableRef} ALTER COLUMN mean_pairwise_kappa DROP NOT NULL`);
    await input.query(`ALTER TABLE ${tableRef} ALTER COLUMN krippendorff_alpha_nominal DROP NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, created_at DESC) WHERE project_id IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${statusIndex} ON ${tableRef} (status, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${reviewIndex} ON ${tableRef} (reviewed_at DESC) WHERE reviewed_at IS NOT NULL`);
    schemaReady = true;
  }

  async function upsertReliabilityRuns(runs: SenaEnterpriseReliabilityRun[]) {
    await ensureSchema();
    for (const run of runs) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          team_id,
          project_id,
          user_id,
          status,
          reviewed_by,
          reviewed_at,
          reviewer,
          file_count,
          annotation_count,
          coder_count,
          item_count,
          code_count,
          mean_pairwise_kappa,
          krippendorff_alpha_nominal,
          disagreement_count,
          adjudication_coverage_rate,
          unresolved_disagreements,
          input_files,
          payload,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19::jsonb,
          $20::jsonb,
          $21,
          now()
        )
        ON CONFLICT (id) DO UPDATE
        SET team_id = EXCLUDED.team_id,
          project_id = EXCLUDED.project_id,
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          reviewed_by = EXCLUDED.reviewed_by,
          reviewed_at = EXCLUDED.reviewed_at,
          reviewer = EXCLUDED.reviewer,
          file_count = EXCLUDED.file_count,
          annotation_count = EXCLUDED.annotation_count,
          coder_count = EXCLUDED.coder_count,
          item_count = EXCLUDED.item_count,
          code_count = EXCLUDED.code_count,
          mean_pairwise_kappa = EXCLUDED.mean_pairwise_kappa,
          krippendorff_alpha_nominal = EXCLUDED.krippendorff_alpha_nominal,
          disagreement_count = EXCLUDED.disagreement_count,
          adjudication_coverage_rate = EXCLUDED.adjudication_coverage_rate,
          unresolved_disagreements = EXCLUDED.unresolved_disagreements,
          input_files = EXCLUDED.input_files,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = now()
      `, [
        run.id,
        run.teamId,
        run.projectId ?? null,
        run.userId,
        run.status,
        run.reviewedBy ?? null,
        run.reviewedAt ?? null,
        run.reviewer,
        run.fileCount,
        run.annotationCount,
        run.coderCount,
        run.itemCount,
        run.codeCount,
        run.meanPairwiseKappa,
        run.krippendorffAlphaNominal,
        run.disagreementCount,
        run.adjudicationCoverage.coverageRate,
        run.adjudicationCoverage.unresolvedDisagreements,
        roundTripJson(run.inputFiles),
        roundTripJson(run),
        run.createdAt
      ]);
    }
  }

  async function listReliabilityRuns(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    projectId?: string;
    project?: SenaEnterpriseReliabilityProjectSource;
    projectRevisions?: Array<{
      projectId: string;
      teamId: string;
      version: number;
      snapshot: SenaProjectSnapshot;
    }>;
    analysisRuns?: Array<Pick<
      SenaEnterpriseAnalysisRun,
      "id" | "teamId" | "projectId" | "persistedProjectId" | "artifactFingerprints"
    >>;
    adjudications?: SenaEnterpriseAdjudicationRecord[];
    status?: SenaEnterpriseReliabilityRunStatus;
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.projectId) clauses.push(`project_id = ${add(inputFilters.projectId)}`);
    if (inputFilters.status) clauses.push(`status = ${add(inputFilters.status)}`);
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredReliabilityRun(row, {
      project: inputFilters.project,
      projectRevisions: inputFilters.projectRevisions,
      expectedProjectId: inputFilters.projectId,
      expectedTeamId: inputFilters.teamId,
      expectedTeamIds: inputFilters.teamIds,
      expectedStatus: inputFilters.status,
      adjudications: inputFilters.adjudications
    }));
  }

  return {
    ensureSchema,
    upsertReliabilityRuns,
    listReliabilityRuns
  };
}

export function createEnterprisePostgresValidationRunAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultValidationRunsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_created_idx`);
  const statusIndex = indexIdentifier(`${tableName}_status_created_idx`);
  const reviewIndex = indexIdentifier(`${tableName}_reviewed_idx`);
  const formalInferenceIndex = indexIdentifier(`${tableName}_formal_inference_created_idx`);
  const parityIndex = indexIdentifier(`${tableName}_parity_created_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        team_id text NOT NULL,
        project_id text,
        user_id text NOT NULL,
        status text NOT NULL,
        reviewer_id text,
        reviewed_at timestamptz,
        metric text NOT NULL,
        group_field text NOT NULL,
        group_a text NOT NULL,
        group_b text NOT NULL,
        iterations integer NOT NULL,
        seed integer NOT NULL,
        p_two_sided double precision NOT NULL,
        comparison_count integer NOT NULL,
        min_holm_adjusted_p double precision,
        significant_holm_count integer,
        observed_difference double precision NOT NULL,
        result_schema_version text NOT NULL,
        preregistration_plan_hash text,
        parity_evidence_status text,
        parity_evidence_hash text,
        formal_inference_status text,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, created_at DESC) WHERE project_id IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${statusIndex} ON ${tableRef} (status, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${reviewIndex} ON ${tableRef} (reviewed_at DESC) WHERE reviewed_at IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${formalInferenceIndex} ON ${tableRef} (formal_inference_status, created_at DESC) WHERE formal_inference_status IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${parityIndex} ON ${tableRef} (parity_evidence_status, created_at DESC) WHERE parity_evidence_status IS NOT NULL`);
    schemaReady = true;
  }

  async function upsertValidationRuns(runs: SenaEnterpriseValidationRun[]) {
    await ensureSchema();
    for (const run of runs) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          team_id,
          project_id,
          user_id,
          status,
          reviewer_id,
          reviewed_at,
          metric,
          group_field,
          group_a,
          group_b,
          iterations,
          seed,
          p_two_sided,
          comparison_count,
          min_holm_adjusted_p,
          significant_holm_count,
          observed_difference,
          result_schema_version,
          preregistration_plan_hash,
          parity_evidence_status,
          parity_evidence_hash,
          formal_inference_status,
          payload,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $24::jsonb,
          $25,
          now()
        )
        ON CONFLICT (id) DO UPDATE
        SET team_id = EXCLUDED.team_id,
          project_id = EXCLUDED.project_id,
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          reviewer_id = EXCLUDED.reviewer_id,
          reviewed_at = EXCLUDED.reviewed_at,
          metric = EXCLUDED.metric,
          group_field = EXCLUDED.group_field,
          group_a = EXCLUDED.group_a,
          group_b = EXCLUDED.group_b,
          iterations = EXCLUDED.iterations,
          seed = EXCLUDED.seed,
          p_two_sided = EXCLUDED.p_two_sided,
          comparison_count = EXCLUDED.comparison_count,
          min_holm_adjusted_p = EXCLUDED.min_holm_adjusted_p,
          significant_holm_count = EXCLUDED.significant_holm_count,
          observed_difference = EXCLUDED.observed_difference,
          result_schema_version = EXCLUDED.result_schema_version,
          preregistration_plan_hash = EXCLUDED.preregistration_plan_hash,
          parity_evidence_status = EXCLUDED.parity_evidence_status,
          parity_evidence_hash = EXCLUDED.parity_evidence_hash,
          formal_inference_status = EXCLUDED.formal_inference_status,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = now()
      `, [
        run.id,
        run.teamId,
        run.projectId ?? null,
        run.userId,
        run.status,
        run.reviewerId ?? null,
        run.reviewedAt ?? null,
        run.metric,
        run.groupField,
        run.groupA,
        run.groupB,
        run.iterations,
        run.seed,
        run.pTwoSided,
        run.comparisonCount ?? 1,
        run.minHolmAdjustedP ?? null,
        run.significantHolmCount ?? null,
        run.observedDifference,
        run.result.schemaVersion,
        run.preregistrationPlan?.planHash ?? null,
        run.parityEvidence?.status ?? null,
        run.parityEvidence?.validationRunHash ?? null,
        run.parityEvidence?.formalInference?.status ?? null,
        roundTripJson(run),
        run.createdAt
      ]);
    }
  }

  async function listValidationRuns(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    projectId?: string;
    runId?: string;
    status?: SenaEnterpriseValidationRunStatus;
    limit?: number;
    project?: SenaEnterpriseValidationProjectSource;
    projectRevisions?: Array<{
      projectId: string;
      teamId: string;
      version: number;
      snapshot: SenaProjectSnapshot;
    }>;
    analysisRuns?: Array<Pick<
      SenaEnterpriseAnalysisRun,
      "id" | "teamId" | "projectId" | "persistedProjectId" | "artifactFingerprints"
    >>;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.projectId) clauses.push(`project_id = ${add(inputFilters.projectId)}`);
    if (inputFilters.runId) clauses.push(`id = ${add(inputFilters.runId)}`);
    if (inputFilters.status) clauses.push(`status = ${add(inputFilters.status)}`);
    const limit = Math.max(1, Math.min(
      inputFilters.limit ?? SENA_POSTGRES_VALIDATION_LIST_REPLAY_LIMIT,
      SENA_POSTGRES_VALIDATION_LIST_REPLAY_LIMIT
    ));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    const snapshotHashCache: SenaEnterpriseValidationSnapshotHashCache = new WeakMap();
    const sourceVerificationCache = senaValidationSourceVerificationCache();
    const analysisRunIndex = new SenaEnterpriseValidationAnalysisRunIndex(inputFilters.analysisRuns ?? []);
    return result.rows.slice(0, limit).map((row) => normalizeStoredValidationRun(row, {
      project: inputFilters.project,
      projectRevisions: inputFilters.projectRevisions,
      analysisRuns: inputFilters.analysisRuns,
      analysisRunIndex,
      snapshotHashCache,
      sourceVerificationCache,
      expectedProjectId: inputFilters.projectId,
      expectedTeamId: inputFilters.teamId,
      expectedTeamIds: inputFilters.teamIds,
      expectedStatus: inputFilters.status,
      expectedRunId: inputFilters.runId
    }));
  }

  return {
    ensureSchema,
    upsertValidationRuns,
    listValidationRuns
  };
}

export function createEnterprisePostgresExpertReviewAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultExpertReviewsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_created_idx`);
  const statusIndex = indexIdentifier(`${tableName}_status_created_idx`);
  const claimScopeIndex = indexIdentifier(`${tableName}_claim_scope_created_idx`);
  const targetIndex = indexIdentifier(`${tableName}_target_created_idx`);
  const reviewedIndex = indexIdentifier(`${tableName}_reviewed_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        team_id text NOT NULL,
        project_id text NOT NULL,
        user_id text NOT NULL,
        status text NOT NULL,
        target_kind text NOT NULL,
        target_id text,
        target_label text,
        reviewer_name text NOT NULL,
        reviewer_role text NOT NULL,
        expertise_area text NOT NULL,
        claim_scope text NOT NULL,
        data_adequacy integer NOT NULL,
        method_fit integer NOT NULL,
        interpretation_validity integer NOT NULL,
        payload jsonb NOT NULL,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${statusIndex} ON ${tableRef} (status, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${claimScopeIndex} ON ${tableRef} (claim_scope, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${targetIndex} ON ${tableRef} (target_kind, target_id, created_at DESC) WHERE target_id IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${reviewedIndex} ON ${tableRef} (reviewed_at DESC) WHERE reviewed_at IS NOT NULL`);
    schemaReady = true;
  }

  async function upsertExpertReviews(reviews: SenaEnterpriseExpertReview[]) {
    await ensureSchema();
    for (const review of reviews) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          team_id,
          project_id,
          user_id,
          status,
          target_kind,
          target_id,
          target_label,
          reviewer_name,
          reviewer_role,
          expertise_area,
          claim_scope,
          data_adequacy,
          method_fit,
          interpretation_validity,
          payload,
          reviewed_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16::jsonb,
          $17,
          $18,
          $19
        )
        ON CONFLICT (id) DO UPDATE
        SET team_id = EXCLUDED.team_id,
          project_id = EXCLUDED.project_id,
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          target_kind = EXCLUDED.target_kind,
          target_id = EXCLUDED.target_id,
          target_label = EXCLUDED.target_label,
          reviewer_name = EXCLUDED.reviewer_name,
          reviewer_role = EXCLUDED.reviewer_role,
          expertise_area = EXCLUDED.expertise_area,
          claim_scope = EXCLUDED.claim_scope,
          data_adequacy = EXCLUDED.data_adequacy,
          method_fit = EXCLUDED.method_fit,
          interpretation_validity = EXCLUDED.interpretation_validity,
          payload = EXCLUDED.payload,
          reviewed_at = EXCLUDED.reviewed_at,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        review.id,
        review.teamId,
        review.projectId,
        review.userId,
        review.status,
        review.target.kind,
        review.target.id ?? null,
        review.target.label ?? null,
        review.reviewerName,
        review.reviewerRole,
        review.expertiseArea,
        review.claimScope,
        review.ratings.dataAdequacy,
        review.ratings.methodFit,
        review.ratings.interpretationValidity,
        roundTripJson(review),
        review.reviewedAt ?? null,
        review.createdAt,
        review.updatedAt
      ]);
    }
  }

  async function listExpertReviews(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    projectId?: string;
    status?: SenaEnterpriseExpertReviewStatus;
    claimScope?: SenaEnterpriseExpertReview["claimScope"];
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.projectId) clauses.push(`project_id = ${add(inputFilters.projectId)}`);
    if (inputFilters.status) clauses.push(`status = ${add(inputFilters.status)}`);
    if (inputFilters.claimScope) clauses.push(`claim_scope = ${add(inputFilters.claimScope)}`);
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredExpertReview(row, {
      expectedProjectId: inputFilters.projectId,
      expectedTeamId: inputFilters.teamId,
      expectedTeamIds: inputFilters.teamIds,
      expectedStatus: inputFilters.status,
      expectedClaimScope: inputFilters.claimScope
    }));
  }

  return {
    ensureSchema,
    upsertExpertReviews,
    listExpertReviews
  };
}

export function createEnterprisePostgresAdjudicationAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultAdjudicationsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_created_idx`);
  const reliabilityRunIndex = indexIdentifier(`${tableName}_reliability_run_created_idx`);
  const targetIndex = indexIdentifier(`${tableName}_target_created_idx`);
  const reviewerIndex = indexIdentifier(`${tableName}_reviewer_created_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        project_id text NOT NULL,
        team_id text NOT NULL,
        reliability_run_id text,
        item_id text NOT NULL,
        code_id text NOT NULL,
        decision text NOT NULL,
        reviewer_id text NOT NULL,
        coder_values jsonb NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${reliabilityRunIndex} ON ${tableRef} (reliability_run_id, created_at DESC) WHERE reliability_run_id IS NOT NULL`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${targetIndex} ON ${tableRef} (project_id, item_id, code_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${reviewerIndex} ON ${tableRef} (reviewer_id, created_at DESC)`);
    schemaReady = true;
  }

  async function upsertAdjudications(records: SenaEnterpriseAdjudicationRecord[]) {
    await ensureSchema();
    for (const record of records) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          project_id,
          team_id,
          reliability_run_id,
          item_id,
          code_id,
          decision,
          reviewer_id,
          coder_values,
          payload,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::jsonb,
          $10::jsonb,
          $11,
          now()
        )
        ON CONFLICT (id) DO UPDATE
        SET project_id = EXCLUDED.project_id,
          team_id = EXCLUDED.team_id,
          reliability_run_id = EXCLUDED.reliability_run_id,
          item_id = EXCLUDED.item_id,
          code_id = EXCLUDED.code_id,
          decision = EXCLUDED.decision,
          reviewer_id = EXCLUDED.reviewer_id,
          coder_values = EXCLUDED.coder_values,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = now()
      `, [
        record.id,
        record.projectId,
        record.teamId,
        record.reliabilityRunId ?? null,
        record.itemId,
        record.codeId,
        record.decision,
        record.reviewerId,
        roundTripJson(record.coderValues),
        roundTripJson(record),
        record.createdAt
      ]);
    }
  }

  async function listAdjudications(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    projectId?: string;
    reliabilityRunId?: string;
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.projectId) clauses.push(`project_id = ${add(inputFilters.projectId)}`);
    if (inputFilters.reliabilityRunId) clauses.push(`reliability_run_id = ${add(inputFilters.reliabilityRunId)}`);
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredAdjudication(row, {
      expectedProjectId: inputFilters.projectId,
      expectedReliabilityRunId: inputFilters.reliabilityRunId,
      expectedTeamId: inputFilters.teamId,
      expectedTeamIds: inputFilters.teamIds
    }));
  }

  return {
    ensureSchema,
    upsertAdjudications,
    listAdjudications
  };
}

export function createEnterprisePostgresProjectCommentAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultProjectCommentsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_updated_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_updated_idx`);
  const statusIndex = indexIdentifier(`${tableName}_status_updated_idx`);
  const userIndex = indexIdentifier(`${tableName}_user_updated_idx`);
  const targetIndex = indexIdentifier(`${tableName}_target_updated_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        project_id text NOT NULL,
        team_id text NOT NULL,
        user_id text NOT NULL,
        target_kind text NOT NULL,
        target_id text,
        target_label text,
        status text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${statusIndex} ON ${tableRef} (status, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${userIndex} ON ${tableRef} (user_id, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${targetIndex} ON ${tableRef} (target_kind, target_id, updated_at DESC) WHERE target_id IS NOT NULL`);
    schemaReady = true;
  }

  async function upsertProjectComments(comments: SenaEnterpriseProjectComment[]) {
    await ensureSchema();
    for (const comment of comments) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          project_id,
          team_id,
          user_id,
          target_kind,
          target_id,
          target_label,
          status,
          payload,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::jsonb,
          $10,
          $11
        )
        ON CONFLICT (id) DO UPDATE
        SET project_id = EXCLUDED.project_id,
          team_id = EXCLUDED.team_id,
          user_id = EXCLUDED.user_id,
          target_kind = EXCLUDED.target_kind,
          target_id = EXCLUDED.target_id,
          target_label = EXCLUDED.target_label,
          status = EXCLUDED.status,
          payload = EXCLUDED.payload,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        comment.id,
        comment.projectId,
        comment.teamId,
        comment.userId,
        comment.target.kind,
        comment.target.id ?? null,
        comment.target.label ?? null,
        comment.status,
        roundTripJson(comment),
        comment.createdAt,
        comment.updatedAt
      ]);
    }
  }

  async function listProjectComments(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    projectId?: string;
    status?: SenaEnterpriseProjectComment["status"];
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.projectId) clauses.push(`project_id = ${add(inputFilters.projectId)}`);
    if (inputFilters.status) clauses.push(`status = ${add(inputFilters.status)}`);
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredProjectComment(row, {
      expectedProjectId: inputFilters.projectId,
      expectedTeamId: inputFilters.teamId,
      expectedTeamIds: inputFilters.teamIds,
      expectedStatus: inputFilters.status
    }));
  }

  return {
    ensureSchema,
    upsertProjectComments,
    listProjectComments
  };
}

export function createEnterprisePostgresProjectPresenceAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultProjectPresenceTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const teamIndex = indexIdentifier(`${tableName}_team_updated_idx`);
  const projectActiveIndex = indexIdentifier(`${tableName}_project_active_idx`);
  const userIndex = indexIdentifier(`${tableName}_user_updated_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        project_id text NOT NULL,
        team_id text NOT NULL,
        user_id text NOT NULL,
        active_view text NOT NULL,
        cursor_label text NOT NULL,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL
      )
    `);
    await input.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${tableName}_project_user_unique_idx`)} ON ${tableRef} (project_id, user_id)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectActiveIndex} ON ${tableRef} (project_id, expires_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${userIndex} ON ${tableRef} (user_id, updated_at DESC)`);
    schemaReady = true;
  }

  async function upsertProjectPresence(records: SenaEnterpriseProjectPresence[]) {
    await ensureSchema();
    for (const presence of records) {
      await input.query(`
        INSERT INTO ${tableRef} (
          id,
          project_id,
          team_id,
          user_id,
          active_view,
          cursor_label,
          payload,
          updated_at,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8,
          $9
        )
        ON CONFLICT (project_id, user_id) DO UPDATE
        SET id = EXCLUDED.id,
          team_id = EXCLUDED.team_id,
          active_view = EXCLUDED.active_view,
          cursor_label = EXCLUDED.cursor_label,
          payload = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at,
          expires_at = EXCLUDED.expires_at
      `, [
        presence.id,
        presence.projectId,
        presence.teamId,
        presence.userId,
        presence.activeView,
        presence.cursorLabel,
        roundTripJson(presence),
        presence.updatedAt,
        presence.expiresAt
      ]);
    }
  }

  async function listProjectPresence(inputFilters: {
    teamIds?: string[];
    teamId?: string;
    projectId?: string;
    activeOnly?: boolean;
    nowIso?: string;
    limit?: number;
  } = {}) {
    await ensureSchema();
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamId) {
      clauses.push(`team_id = ${add(inputFilters.teamId)}`);
    } else if (inputFilters.teamIds) {
      if (inputFilters.teamIds.length === 0) {
        clauses.push("false");
      } else {
        clauses.push(`team_id = ANY(${add(inputFilters.teamIds)}::text[])`);
      }
    }
    if (inputFilters.projectId) clauses.push(`project_id = ${add(inputFilters.projectId)}`);
    if (inputFilters.activeOnly) clauses.push(`expires_at > ${add(inputFilters.nowIso ?? new Date().toISOString())}`);
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 500, 5000));
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredProjectPresence(row, {
      expectedProjectId: inputFilters.projectId,
      expectedTeamId: inputFilters.teamId,
      expectedTeamIds: inputFilters.teamIds
    }));
  }

  return {
    ensureSchema,
    upsertProjectPresence,
    listProjectPresence
  };
}

export function createEnterprisePostgresDatabaseSyncAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultDatabaseSyncTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id bigserial PRIMARY KEY,
        backup_id text NOT NULL,
        payload_sha256 text NOT NULL,
        backup jsonb NOT NULL,
        verification jsonb NOT NULL,
        record_counts jsonb NOT NULL,
        revision bigint NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    schemaReady = true;
  }

  async function writeSync(
    backup: SenaEnterpriseBackupArtifact,
    verification: SenaEnterpriseBackupVerification
  ) {
    await ensureSchema();
    const recordCounts = roundTripJson(verification.recordCounts) as SenaEnterpriseBackupRecordCounts;
    const result = await input.query<{ revision: number | string }>(`
      INSERT INTO ${tableRef} (
        backup_id,
        payload_sha256,
        backup,
        verification,
        record_counts,
        revision
      )
      VALUES (
        $1,
        $2,
        $3::jsonb,
        $4::jsonb,
        $5::jsonb,
        COALESCE((SELECT max(revision) + 1 FROM ${tableRef}), 1)
      )
      RETURNING revision
    `, [
      backup.backupId,
      verification.payloadSha256,
      roundTripJson(backup),
      roundTripJson(verification),
      recordCounts
    ]);
    return {
      backupId: backup.backupId,
      payloadSha256: verification.payloadSha256,
      revision: Number(result.rows[0]?.revision ?? 1)
    };
  }

  return {
    ensureSchema,
    writeSync
  };
}

export function createEnterprisePostgresServerJobAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultServerJobsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const statusIndex = indexIdentifier(`${tableName}_status_updated_idx`);
  const teamIndex = indexIdentifier(`${tableName}_team_updated_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_updated_idx`);
  const kindIndex = indexIdentifier(`${tableName}_kind_status_idx`);
  const claimableDeliverySql = `(
    delivery->'sourceReady' = 'true'::jsonb
    OR (
      NOT (delivery ? 'sourceReady')
      AND (
        delivery->>'webhookStatus' IN ('delivered', 'local-sink')
        OR (
          delivery->>'webhookStatus' = 'failed'
          AND delivery->>'failureStage' = 'queue-dispatch'
        )
      )
    )
  )`;
  const exactUploadPointersSql = `(
    CASE
      WHEN jsonb_typeof(payload_summary->'uploadIds') IS DISTINCT FROM 'array' THEN false
      WHEN jsonb_array_length(payload_summary->'uploadIds') NOT BETWEEN 1 AND 100 THEN false
      ELSE
        NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(payload_summary->'uploadIds') AS upload_entry(value)
          WHERE jsonb_typeof(upload_entry.value) <> 'string'
            OR btrim(upload_entry.value #>> '{}') = ''
        )
        AND (
          SELECT count(*)
          FROM jsonb_array_elements(payload_summary->'uploadIds') AS upload_entry(value)
        ) = (
          SELECT count(DISTINCT btrim(upload_entry.value #>> '{}'))
          FROM jsonb_array_elements(payload_summary->'uploadIds') AS upload_entry(value)
        )
    END
  )`;
  const exactProjectVersionSql = `(
    CASE
      WHEN jsonb_typeof(payload_summary->'projectVersion') IS DISTINCT FROM 'number' THEN false
      ELSE
        (payload_summary->>'projectVersion')::numeric BETWEEN 1 AND 9007199254740991
        AND trunc((payload_summary->>'projectVersion')::numeric) =
          (payload_summary->>'projectVersion')::numeric
      END
  )`;
  const exactProjectTeamIdSql = `(
    CASE
      WHEN jsonb_typeof(payload_summary->'projectTeamId') IS DISTINCT FROM 'string' THEN false
      ELSE payload_summary->>'projectTeamId' = team_id
    END
  )`;
  const exactSyntheticHeartbeatShapeSql = `COALESCE((
    kind = 'analysis'
    AND NOT (payload_summary ? 'commandEnvelopeUploadId')
    AND NOT (payload_summary ? 'commandEnvelopeSha256')
    AND id ~ '^server_job_worker_heartbeat_[a-f0-9]{24}$'
    AND team_id = 'ops-heartbeat'
    AND project_id = 'worker-heartbeat'
    AND actor_user_id = 'ops-heartbeat'
    AND payload_sha256 ~ '^[a-f0-9]{64}$'
    AND payload_summary->>'source' = 'project'
    AND payload_summary->'projectVersion' = '1'::jsonb
    AND payload_summary->'hasInlineSnapshot' = 'false'::jsonb
    AND payload_summary->'hasInlineDataset' = 'false'::jsonb
    AND payload_summary->'payloadValuesExcluded' = 'true'::jsonb
    AND worker->>'expectedAction' = 'run-analysis'
    AND worker->>'payloadDelivery' = 'project-pointer'
    AND worker->>'execution' = 'external-worker-required'
    AND worker->>'statusCallback' = '/api/sena/ops/jobs'
  ), false)`;
  const exactAnalysisCommandCustodySql = `COALESCE((
    CASE
      WHEN payload_summary->>'commandCustody' = '${SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY}' THEN
        jsonb_typeof(payload_summary->'commandEnvelopeUploadId') = 'string'
        AND (payload_summary->>'commandEnvelopeUploadId') ~ '^upload_[a-f0-9]{24}$'
        AND jsonb_typeof(payload_summary->'commandEnvelopeSha256') = 'string'
        AND (payload_summary->>'commandEnvelopeSha256') ~ '^[a-f0-9]{64}$'
      WHEN payload_summary->>'commandCustody' = '${SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY}' THEN
        NOT (payload_summary ? 'commandEnvelopeUploadId')
        AND NOT (payload_summary ? 'commandEnvelopeSha256')
      WHEN payload_summary->>'commandCustody' = '${SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY}' THEN
        ${exactSyntheticHeartbeatShapeSql}
      ELSE false
    END
  ), false)`;
  const exactWorkerCommandCustodySql = `COALESCE((
    payload_summary->>'commandCustody' = '${SENA_SERVER_JOB_COMMAND_CUSTODY}'
    AND jsonb_typeof(payload_summary->'commandEnvelopeUploadId') = 'string'
    AND (payload_summary->>'commandEnvelopeUploadId') ~ '^upload_[a-f0-9]{24}$'
    AND jsonb_typeof(payload_summary->'commandEnvelopeSha256') = 'string'
    AND (payload_summary->>'commandEnvelopeSha256') ~ '^[a-f0-9]{64}$'
  ), false)`;
  const analysisCustodyQuarantineSql = `(
    /* sena-analysis-custody-quarantine */
    kind = 'analysis'
    AND status = 'queued'
    AND ${claimableDeliverySql}
    AND (${exactAnalysisCommandCustodySql}) IS NOT TRUE
  )`;
  const claimableSourceSql = `(
    /* sena-claimable-source */
    ${claimableDeliverySql}
    AND payload_summary->'hasInlineSnapshot' = 'false'::jsonb
    AND payload_summary->'hasInlineDataset' = 'false'::jsonb
    AND CASE
      WHEN kind = 'analysis' THEN
        payload_summary->>'source' = 'project'
        AND worker->>'payloadDelivery' = 'project-pointer'
        AND project_id IS NOT NULL
        AND btrim(project_id) <> ''
        AND ${exactProjectVersionSql}
        AND (${exactAnalysisCommandCustodySql}) IS TRUE
      WHEN kind = 'validation' THEN
        payload_summary->>'source' = 'project'
        AND worker->>'payloadDelivery' = 'project-pointer'
        AND project_id IS NOT NULL
        AND btrim(project_id) <> ''
        AND ${exactProjectVersionSql}
        AND ${exactProjectTeamIdSql}
        AND (${exactWorkerCommandCustodySql}) IS TRUE
      WHEN kind = 'publication-export' THEN
        payload_summary->>'source' = 'project'
        AND worker->>'payloadDelivery' = 'project-pointer'
        AND project_id IS NOT NULL
        AND btrim(project_id) <> ''
        AND ${exactProjectVersionSql}
        AND ${exactProjectTeamIdSql}
        AND (${exactWorkerCommandCustodySql}) IS TRUE
      WHEN kind IN ('import', 'reliability') THEN
        worker->>'payloadDelivery' = 'upload-pointer'
        AND ${exactUploadPointersSql}
      ELSE false
    END
  )`;
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        schema_version text NOT NULL,
        kind text NOT NULL,
        status text NOT NULL,
        team_id text NOT NULL,
        project_id text,
        actor_user_id text NOT NULL,
        payload_sha256 text NOT NULL,
        payload_summary jsonb NOT NULL,
        provider jsonb NOT NULL,
        delivery jsonb NOT NULL,
        worker jsonb NOT NULL,
        lifecycle jsonb NOT NULL,
        result_receipt jsonb,
        redaction jsonb NOT NULL,
        queued_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await input.query(`ALTER TABLE ${tableRef} ADD COLUMN IF NOT EXISTS result_receipt jsonb`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${statusIndex} ON ${tableRef} (status, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, updated_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${kindIndex} ON ${tableRef} (kind, status, updated_at DESC)`);
    schemaReady = true;
  }

  async function upsertJob(job: SenaEnterpriseServerJob) {
    await ensureSchema();
    await input.query(`
      INSERT INTO ${tableRef} (
        id,
        schema_version,
        kind,
        status,
        team_id,
        project_id,
        actor_user_id,
        payload_sha256,
        payload_summary,
        provider,
        delivery,
        worker,
        lifecycle,
        result_receipt,
        redaction,
        queued_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10::jsonb,
        $11::jsonb,
        $12::jsonb,
        $13::jsonb,
        $14::jsonb,
        $15::jsonb,
        $16,
        $17
      )
      ON CONFLICT (id) DO UPDATE
      SET schema_version = EXCLUDED.schema_version,
        kind = EXCLUDED.kind,
        status = EXCLUDED.status,
        team_id = EXCLUDED.team_id,
        project_id = EXCLUDED.project_id,
        actor_user_id = EXCLUDED.actor_user_id,
        payload_sha256 = EXCLUDED.payload_sha256,
        payload_summary = EXCLUDED.payload_summary,
        provider = EXCLUDED.provider,
        delivery = EXCLUDED.delivery,
        worker = EXCLUDED.worker,
        lifecycle = EXCLUDED.lifecycle,
        result_receipt = EXCLUDED.result_receipt,
        redaction = EXCLUDED.redaction,
        queued_at = EXCLUDED.queued_at,
        updated_at = EXCLUDED.updated_at
    `, [
      job.id,
      job.schemaVersion,
      job.kind,
      job.status,
      job.teamId,
      job.projectId ?? null,
      job.actorUserId,
      job.payloadSha256,
      roundTripJson(job.payloadSummary),
      roundTripJson(job.provider),
      roundTripJson(job.delivery),
      roundTripJson(job.worker),
      roundTripJson(job.lifecycle),
      job.resultReceipt ? roundTripJson(job.resultReceipt) : null,
      roundTripJson(job.redaction),
      job.queuedAt,
      job.updatedAt
    ]);
  }

  async function insertJobIfAbsent(job: SenaEnterpriseServerJob) {
    await ensureSchema();
    const inserted = await input.query<Record<string, unknown>>(`
      INSERT INTO ${tableRef} (
        id,
        schema_version,
        kind,
        status,
        team_id,
        project_id,
        actor_user_id,
        payload_sha256,
        payload_summary,
        provider,
        delivery,
        worker,
        lifecycle,
        result_receipt,
        redaction,
        queued_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10::jsonb,
        $11::jsonb,
        $12::jsonb,
        $13::jsonb,
        $14::jsonb,
        $15::jsonb,
        $16,
        $17
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `, [
      job.id,
      job.schemaVersion,
      job.kind,
      job.status,
      job.teamId,
      job.projectId ?? null,
      job.actorUserId,
      job.payloadSha256,
      roundTripJson(job.payloadSummary),
      roundTripJson(job.provider),
      roundTripJson(job.delivery),
      roundTripJson(job.worker),
      roundTripJson(job.lifecycle),
      job.resultReceipt ? roundTripJson(job.resultReceipt) : null,
      roundTripJson(job.redaction),
      job.queuedAt,
      job.updatedAt
    ]);
    if (inserted.rows[0]) {
      return { created: true, job: normalizeStoredServerJob(inserted.rows[0]) };
    }
    const existing = await input.query<Record<string, unknown>>(`
      SELECT * FROM ${tableRef} WHERE id = $1 LIMIT 1
    `, [job.id]);
    if (!existing.rows[0]) {
      throw new SenaEnterpriseError(
        "The deterministic SENA server job could not be read after its insert conflict.",
        500,
        "server_job_idempotency_read_failed"
      );
    }
    return { created: false, job: normalizeStoredServerJob(existing.rows[0]) };
  }

  async function claimQueuedJob(job: SenaEnterpriseServerJob) {
    await ensureSchema();
    const result = await input.query<Record<string, unknown>>(`
      UPDATE ${tableRef}
      SET status = 'running',
        lifecycle = $2::jsonb,
        updated_at = $3
      WHERE id = $1 AND status = 'queued'
        AND ${claimableSourceSql}
      RETURNING *
    `, [job.id, roundTripJson(job.lifecycle), job.updatedAt]);
    return result.rows[0] ? normalizeStoredServerJob(result.rows[0]) : null;
  }

  async function transitionJobStatus(inputTransition: {
    job: SenaEnterpriseServerJob;
    expectedStatus: SenaEnterpriseServerJobStatus;
    expectedWorkerRunId?: string;
    expectedLeaseExpiresAt?: string;
    requireSourceReady: boolean;
  }) {
    await ensureSchema();
    const values: unknown[] = [
      inputTransition.job.id,
      inputTransition.job.status,
      roundTripJson(inputTransition.job.lifecycle),
      inputTransition.job.resultReceipt ? roundTripJson(inputTransition.job.resultReceipt) : null,
      inputTransition.job.updatedAt,
      inputTransition.expectedStatus
    ];
    const clauses = ["id = $1", "status = $6"];
    if (inputTransition.expectedWorkerRunId) {
      values.push(inputTransition.expectedWorkerRunId);
      clauses.push(`lifecycle->>'workerRunId' = $${values.length}`);
    }
    if (inputTransition.expectedLeaseExpiresAt) {
      values.push(inputTransition.expectedLeaseExpiresAt);
      clauses.push(`lifecycle->>'leaseExpiresAt' = $${values.length}`);
    }
    if (inputTransition.requireSourceReady) clauses.push(claimableSourceSql);
    const result = await input.query<Record<string, unknown>>(`
      UPDATE ${tableRef}
      SET status = $2,
        lifecycle = $3::jsonb,
        result_receipt = $4::jsonb,
        updated_at = $5
      WHERE ${clauses.join(" AND ")}
      RETURNING *
    `, values);
    return result.rows[0] ? normalizeStoredServerJob(result.rows[0]) : null;
  }

  async function finalizeDelivery(inputDelivery: {
    jobId: string;
    delivery: SenaEnterpriseServerJobQueueDelivery;
    failQueuedJob: boolean;
    failedLifecycle: SenaEnterpriseServerJob["lifecycle"];
    updatedAt: string;
  }) {
    await ensureSchema();
    const result = await input.query<Record<string, unknown>>(`
      UPDATE ${tableRef}
      SET delivery = $2::jsonb,
        status = CASE WHEN status = 'queued' AND $3::boolean THEN 'failed' ELSE status END,
        lifecycle = CASE WHEN status = 'queued' AND $3::boolean THEN $4::jsonb ELSE lifecycle END,
        updated_at = $5
      WHERE id = $1
      RETURNING *
    `, [
      inputDelivery.jobId,
      roundTripJson(inputDelivery.delivery),
      inputDelivery.failQueuedJob,
      roundTripJson(inputDelivery.failedLifecycle),
      inputDelivery.updatedAt
    ]);
    return result.rows[0] ? normalizeStoredServerJob(result.rows[0]) : null;
  }

  async function reopenFailedDispatchJob(inputReopen: {
    job: SenaEnterpriseServerJob;
    expectedErrorHash?: string;
  }) {
    await ensureSchema();
    const values: unknown[] = [
      inputReopen.job.id,
      roundTripJson(inputReopen.job.lifecycle),
      roundTripJson(inputReopen.job.delivery),
      inputReopen.job.updatedAt
    ];
    const errorHashClause = inputReopen.expectedErrorHash
      ? ` AND delivery->>'errorHash' = $${values.push(inputReopen.expectedErrorHash)}`
      : " AND delivery->>'errorHash' IS NULL";
    const result = await input.query<Record<string, unknown>>(`
      UPDATE ${tableRef}
      SET status = 'queued',
        lifecycle = $2::jsonb,
        delivery = $3::jsonb,
        updated_at = $4
      WHERE id = $1
        AND status = 'failed'
        AND delivery->>'webhookStatus' = 'failed'
        AND delivery->>'failureStage' = 'queue-dispatch'
        AND COALESCE((lifecycle->>'attempts')::integer, 0) = 0
        ${errorHashClause}
      RETURNING *
    `, values);
    return result.rows[0] ? normalizeStoredServerJob(result.rows[0]) : null;
  }

  function filterClauses(inputFilters: {
    status?: SenaEnterpriseServerJobStatus;
    kind?: SenaEnterpriseServerJobKind;
    kinds?: readonly SenaEnterpriseServerJobKind[];
    teamId?: string;
    projectId?: string;
    claimableOnly?: boolean;
    analysisCustodyQuarantineOnly?: boolean;
    excludeSyntheticWorkerHeartbeat?: boolean;
  }) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replace("?", `$${values.length}`));
    };
    if (inputFilters.status) add("status = ?", inputFilters.status);
    if (inputFilters.kind) add("kind = ?", inputFilters.kind);
    if (inputFilters.kinds) {
      add("/* sena-worker-executable-kinds */ kind = ANY(?::text[])", inputFilters.kinds);
    }
    if (inputFilters.teamId) add("team_id = ?", inputFilters.teamId);
    if (inputFilters.projectId) add("project_id = ?", inputFilters.projectId);
    if (inputFilters.claimableOnly) clauses.push(claimableSourceSql);
    if (inputFilters.analysisCustodyQuarantineOnly) clauses.push(analysisCustodyQuarantineSql);
    if (inputFilters.excludeSyntheticWorkerHeartbeat) {
      clauses.push(`(
        /* sena-exclude-synthetic-worker-heartbeat */
        payload_summary->>'commandCustody' = '${SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY}'
        AND ${exactSyntheticHeartbeatShapeSql}
      ) IS NOT TRUE`);
    }
    return {
      values,
      where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    };
  }

  async function listJobs(inputFilters: {
    status?: SenaEnterpriseServerJobStatus;
    kind?: SenaEnterpriseServerJobKind;
    teamId?: string;
    projectId?: string;
    claimableOnly?: boolean;
    analysisCustodyQuarantineOnly?: boolean;
    excludeSyntheticWorkerHeartbeat?: boolean;
    limit?: number;
  } = {}): Promise<SenaEnterpriseServerJobList> {
    await ensureSchema();
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 100, 500));
    const filters = filterClauses(inputFilters);
    const summaryResult = await input.query<{
      total: number | string;
      queued: number | string;
      running: number | string;
      succeeded: number | string;
      failed: number | string;
      dead_lettered: number | string;
      retryable: number | string;
    }>(`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE status = 'queued') AS queued,
        count(*) FILTER (WHERE status = 'running') AS running,
        count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
        count(*) FILTER (WHERE status = 'failed') AS failed,
        count(*) FILTER (WHERE status = 'dead-lettered') AS dead_lettered,
        count(*) FILTER (WHERE (lifecycle->>'retryable')::boolean = true) AS retryable
      FROM ${tableRef}
      ${filters.where}
    `, filters.values);
    const listValues = [...filters.values, limit];
    const jobsResult = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${filters.where}
      ORDER BY updated_at DESC
      LIMIT $${listValues.length}
    `, listValues);
    const summaryRow = summaryResult.rows[0] ?? {
      total: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead_lettered: 0,
      retryable: 0
    };
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobList,
      generatedAt: new Date().toISOString(),
      summary: {
        total: Number(summaryRow.total ?? 0),
        queued: Number(summaryRow.queued ?? 0),
        running: Number(summaryRow.running ?? 0),
        succeeded: Number(summaryRow.succeeded ?? 0),
        failed: Number(summaryRow.failed ?? 0),
        deadLettered: Number(summaryRow.dead_lettered ?? 0),
        retryable: Number(summaryRow.retryable ?? 0)
      },
      jobs: jobsResult.rows.map((row) => normalizeStoredServerJob(row))
    };
  }

  async function findOldestClaimableJob(inputFilters: {
    kinds: readonly SenaEnterpriseServerJobKind[];
    teamId?: string;
  }) {
    await ensureSchema();
    const filters = filterClauses({
      status: "queued",
      kinds: inputFilters.kinds,
      teamId: inputFilters.teamId,
      claimableOnly: true,
      excludeSyntheticWorkerHeartbeat: true
    });
    const values = [...filters.values, 1];
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${filters.where}
      ORDER BY updated_at ASC, id ASC
      LIMIT $${values.length}
    `, values);
    return result.rows[0] ? normalizeStoredServerJob(result.rows[0]) : null;
  }

  async function findExpiredRunningJobs(inputFilters: {
    kinds: readonly SenaEnterpriseServerJobKind[];
    teamId?: string;
    observedAt: string;
    limit?: number;
  }) {
    await ensureSchema();
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 100, 500));
    const values: unknown[] = [inputFilters.kinds, inputFilters.observedAt];
    const teamClause = inputFilters.teamId
      ? ` AND team_id = $${values.push(inputFilters.teamId)}`
      : "";
    values.push(limit);
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      WHERE status = 'running'
        AND kind = ANY($1::text[])
        AND lifecycle->>'leaseExpiresAt' IS NOT NULL
        AND (lifecycle->>'leaseExpiresAt')::timestamptz <= $2::timestamptz
        ${teamClause}
      ORDER BY (lifecycle->>'leaseExpiresAt')::timestamptz ASC, id ASC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredServerJob(row));
  }

  async function getJob(jobId: string) {
    await ensureSchema();
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      WHERE id = $1
      LIMIT 1
    `, [jobId]);
    return result.rows[0] ? normalizeStoredServerJob(result.rows[0]) : null;
  }

  return {
    ensureSchema,
    upsertJob,
    insertJobIfAbsent,
    claimQueuedJob,
    transitionJobStatus,
    finalizeDelivery,
    reopenFailedDispatchJob,
    listJobs,
    findOldestClaimableJob,
    findExpiredRunningJobs,
    getJob
  };
}

export function createEnterprisePostgresAuditLogAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultAuditLogTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const createdIndex = indexIdentifier(`${tableName}_created_idx`);
  const teamIndex = indexIdentifier(`${tableName}_team_created_idx`);
  const userIndex = indexIdentifier(`${tableName}_user_created_idx`);
  const projectIndex = indexIdentifier(`${tableName}_project_created_idx`);
  const eventIndex = indexIdentifier(`${tableName}_event_created_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        id text PRIMARY KEY,
        event text NOT NULL,
        user_id text,
        team_id text,
        project_id text,
        detail jsonb NOT NULL,
        webhook_delivery jsonb,
        created_at timestamptz NOT NULL
      )
    `);
    await input.query(`CREATE INDEX IF NOT EXISTS ${createdIndex} ON ${tableRef} (created_at DESC, id DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${teamIndex} ON ${tableRef} (team_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${userIndex} ON ${tableRef} (user_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${projectIndex} ON ${tableRef} (project_id, created_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${eventIndex} ON ${tableRef} (event, created_at DESC)`);
    schemaReady = true;
  }

  async function appendEntry(entry: SenaEnterpriseAuditLogEntry) {
    await ensureSchema();
    await input.query(`
      INSERT INTO ${tableRef} (
        id,
        event,
        user_id,
        team_id,
        project_id,
        detail,
        webhook_delivery,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb,
        $7::jsonb,
        $8
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      entry.id,
      entry.event,
      entry.userId ?? null,
      entry.teamId ?? null,
      entry.projectId ?? null,
      roundTripJson(entry.detail),
      entry.webhookDelivery ? roundTripJson(entry.webhookDelivery) : null,
      entry.createdAt
    ]);
  }

  function auditWhere(inputFilters: SenaEnterpriseAuditLogQuery & {
    teamIds: string[];
    scopedUserIds: string[];
  }) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.teamIds.length === 0) {
      clauses.push("false");
    } else {
      const teamParam = addValue(inputFilters.teamIds);
      const userParam = addValue(inputFilters.scopedUserIds);
      clauses.push(`(team_id = ANY(${teamParam}::text[]) OR user_id = ANY(${userParam}::text[]) OR event = 'security.rate_limit')`);
    }
    if (inputFilters.event) clauses.push(`event = ${addValue(inputFilters.event)}`);
    if (inputFilters.projectId) clauses.push(`project_id = ${addValue(inputFilters.projectId)}`);
    if (inputFilters.userId) clauses.push(`user_id = ${addValue(inputFilters.userId)}`);
    if (inputFilters.from) clauses.push(`created_at >= ${addValue(inputFilters.from)}`);
    if (inputFilters.to) clauses.push(`created_at <= ${addValue(inputFilters.to)}`);
    return {
      values,
      where: `WHERE ${clauses.join(" AND ")}`
    };
  }

  async function listEntries(inputFilters: SenaEnterpriseAuditLogQuery & {
    teamIds: string[];
    scopedUserIds: string[];
  }) {
    await ensureSchema();
    const limit = Math.min(Math.max(Math.trunc(inputFilters.limit ?? 100), 1), 5000);
    const offset = Math.max(Math.trunc(inputFilters.offset ?? 0), 0);
    const filters = auditWhere(inputFilters);
    const countResult = await input.query<{ total: number | string }>(`
      SELECT count(*) AS total
      FROM ${tableRef}
      ${filters.where}
    `, filters.values);
    const listValues = [...filters.values, limit, offset];
    const rowsResult = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${filters.where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${listValues.length - 1}
      OFFSET $${listValues.length}
    `, listValues);
    return {
      total: Number(countResult.rows[0]?.total ?? 0),
      events: rowsResult.rows.map((row) => normalizeStoredAuditLogEntry(row))
    };
  }

  return {
    ensureSchema,
    appendEntry,
    listEntries
  };
}

export function createEnterprisePostgresObservedRequestAdapter(input: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
  tableName?: string;
}) {
  const schemaName = input.schemaName ?? defaultSchemaName;
  const tableName = input.tableName ?? defaultObservedRequestsTableName;
  const tableRef = stateTableRef(schemaName, tableName);
  const uniqueIndex = indexIdentifier(`${tableName}_uniq_idx`);
  const observedIndex = indexIdentifier(`${tableName}_observed_idx`);
  const routeIndex = indexIdentifier(`${tableName}_route_idx`);
  const statusIndex = indexIdentifier(`${tableName}_status_idx`);
  const slowIndex = indexIdentifier(`${tableName}_slow_idx`);
  const errorIndex = indexIdentifier(`${tableName}_error_idx`);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await input.query(`
      CREATE TABLE IF NOT EXISTS ${tableRef} (
        request_id_hash text NOT NULL,
        observed_at timestamptz NOT NULL,
        route_id text NOT NULL,
        method text NOT NULL,
        status_code integer NOT NULL,
        status_class text NOT NULL,
        duration_ms integer NOT NULL,
        slow boolean NOT NULL,
        error boolean NOT NULL,
        error_code_hash text,
        payload jsonb NOT NULL
      )
    `);
    await input.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${uniqueIndex} ON ${tableRef} (request_id_hash, observed_at, route_id)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${observedIndex} ON ${tableRef} (observed_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${routeIndex} ON ${tableRef} (route_id, observed_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${statusIndex} ON ${tableRef} (status_class, observed_at DESC)`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${slowIndex} ON ${tableRef} (observed_at DESC) WHERE slow = true`);
    await input.query(`CREATE INDEX IF NOT EXISTS ${errorIndex} ON ${tableRef} (observed_at DESC) WHERE error = true`);
    schemaReady = true;
  }

  async function upsertObservedRequests(samples: SenaEnterpriseObservedRequest[]) {
    if (samples.length === 0) return;
    await ensureSchema();
    for (const sample of samples) {
      await input.query(`
        INSERT INTO ${tableRef} (
          request_id_hash,
          observed_at,
          route_id,
          method,
          status_code,
          status_class,
          duration_ms,
          slow,
          error,
          error_code_hash,
          payload
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb
        )
        ON CONFLICT (request_id_hash, observed_at, route_id) DO UPDATE
        SET method = EXCLUDED.method,
          status_code = EXCLUDED.status_code,
          status_class = EXCLUDED.status_class,
          duration_ms = EXCLUDED.duration_ms,
          slow = EXCLUDED.slow,
          error = EXCLUDED.error,
          error_code_hash = EXCLUDED.error_code_hash,
          payload = EXCLUDED.payload
      `, [
        sample.requestIdHash,
        sample.observedAt,
        sample.routeId,
        sample.method,
        sample.statusCode,
        sample.statusClass,
        sample.durationMs,
        sample.slow,
        sample.error,
        sample.errorCodeHash ?? null,
        roundTripJson(sample)
      ]);
    }
  }

  function observedRequestWhere(inputFilters: {
    since?: string;
    routeId?: string;
    statusClass?: SenaEnterpriseObservedRequest["statusClass"];
  }) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (inputFilters.since) clauses.push(`observed_at >= ${addValue(inputFilters.since)}`);
    if (inputFilters.routeId) clauses.push(`route_id = ${addValue(inputFilters.routeId)}`);
    if (inputFilters.statusClass) clauses.push(`status_class = ${addValue(inputFilters.statusClass)}`);
    return {
      values,
      where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    };
  }

  async function listObservedRequests(inputFilters: {
    since?: string;
    routeId?: string;
    statusClass?: SenaEnterpriseObservedRequest["statusClass"];
    limit?: number;
  } = {}) {
    await ensureSchema();
    const limit = Math.max(1, Math.min(inputFilters.limit ?? 1000, 10_000));
    const filters = observedRequestWhere(inputFilters);
    const values = [...filters.values, limit];
    const result = await input.query<Record<string, unknown>>(`
      SELECT *
      FROM ${tableRef}
      ${filters.where}
      ORDER BY observed_at DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map((row) => normalizeStoredObservedRequest(row)).reverse();
  }

  return {
    ensureSchema,
    upsertObservedRequests,
    listObservedRequests
  };
}

export function createEnterprisePostgresUploadAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresUploadAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresImportRunAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresImportRunAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresAnalysisRunAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresAnalysisRunAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresReliabilityRunAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresReliabilityRunAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresValidationRunAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresValidationRunAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresExpertReviewAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresExpertReviewAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresAdjudicationAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresAdjudicationAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresProjectCommentAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresProjectCommentAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresProjectPresenceAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresProjectPresenceAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresDatabaseSyncAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresDatabaseSyncAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresServerJobAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresServerJobAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresAuditLogAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresAuditLogAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresObservedRequestAdapterFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresObservedRequestAdapter({
    query: (sql, values) => pool.query(sql, values),
    schemaName: input.schemaName,
    tableName: input.tableName
  });
  return { adapter, pool, poolOptions };
}

export function createEnterprisePostgresStateAdapterFromEnv(input: {
  initialDb: () => SenaEnterpriseDb;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: SenaEnterprisePostgresPoolFactory;
  schemaName?: string;
  tableName?: string;
  stateKey?: string;
}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const poolFactory = input.poolFactory ?? ((options: PoolConfig) => new Pool(options));
  const pool = poolFactory(poolOptions);
  const adapter = createEnterprisePostgresStateAdapter({
    query: (sql, values) => pool.query(sql, values),
    initialDb: input.initialDb,
    schemaName: input.schemaName,
    tableName: input.tableName,
    stateKey: input.stateKey
  });
  return { adapter, pool, poolOptions };
}
