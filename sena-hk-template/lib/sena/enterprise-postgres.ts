import { createHash } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import type {
  SenaEnterpriseBackupArtifact,
  SenaEnterpriseBackupRecordCounts,
  SenaEnterpriseBackupVerification,
  SenaEnterpriseDb
} from "./enterprise";

export type SenaEnterprisePostgresQuery = <T = Record<string, unknown>>(
  sql: string,
  values?: unknown[]
) => Promise<{ rows: T[]; rowCount?: number | null }>;

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

const defaultSchemaName = "public";
const defaultStateTableName = "sena_enterprise_state";
const defaultDatabaseSyncTableName = "sena_enterprise_database_syncs";
const defaultStateKey = "default";

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
  return envValue(env, "SENA_ENTERPRISE_POSTGRES_URL") ||
    envValue(env, "SENA_DATABASE_URL") ||
    envValue(env, "POSTGRES_URL") ||
    envValue(env, "DATABASE_URL");
}

function enterprisePostgresUrlEnvName(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return [
    "SENA_ENTERPRISE_POSTGRES_URL",
    "SENA_DATABASE_URL",
    "POSTGRES_URL",
    "DATABASE_URL"
  ].find((key) => Boolean(envValue(env, key)));
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
    connectionString ? null : "SENA_ENTERPRISE_POSTGRES_URL or SENA_DATABASE_URL or POSTGRES_URL or DATABASE_URL"
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

function roundTripJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeStoredDb(value: unknown): SenaEnterpriseDb {
  const db = typeof value === "string" ? JSON.parse(value) as SenaEnterpriseDb : value as SenaEnterpriseDb;
  if (!db || typeof db !== "object" || db.schemaVersion !== "sena-enterprise-db/v1") {
    throw new SenaEnterprisePostgresError("Unsupported SENA enterprise Postgres state schema.", 500, "unsupported_postgres_state_schema");
  }
  return roundTripJson(db);
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
