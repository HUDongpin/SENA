import type { SenaEnterprisePostgresQuery } from "../enterprise-postgres";
import { SenaEnterpriseError } from "./errors";

export interface WorkerProofStoredRecord {
  id: string;
  nonceSha256: string;
  bindingSha256: string;
  bindingMac: string;
  binding: Record<string, string>;
  issuerRuntimeSha256: string;
  issuedAt: string;
  expiresAt: string;
  dispatchAcceptedAt?: string;
  dispatchHttpStatus?: number;
  callbackAcceptedAt?: string;
  receipt?: Record<string, unknown>;
  receiptMac?: string;
}

export interface WorkerProofDispatchInput {
  id: string;
  bindingSha256: string;
  bindingMac: string;
  httpStatus: number;
}

export interface WorkerProofCallbackInput {
  id: string;
  nonceSha256: string;
  bindingSha256: string;
  bindingMac: string;
  receipt: Record<string, unknown>;
  receiptMac: string;
}

export interface WorkerProofPostgresStore {
  ensureSchema(): Promise<void>;
  insertChallenge(record: WorkerProofStoredRecord): Promise<WorkerProofStoredRecord>;
  getChallenge(id: string): Promise<WorkerProofStoredRecord | undefined>;
  recordDispatch(input: WorkerProofDispatchInput): Promise<WorkerProofStoredRecord | undefined>;
  consumeCallback(input: WorkerProofCallbackInput): Promise<WorkerProofStoredRecord | undefined>;
  latestReceipt(input: { bindingSha256: string; notBefore: string }): Promise<WorkerProofStoredRecord | undefined>;
}

type WorkerProofRow = {
  id: string;
  nonce_sha256: string;
  binding_sha256: string;
  binding_mac: string;
  binding: Record<string, string>;
  issuer_runtime_sha256: string;
  issued_at: Date | string;
  expires_at: Date | string;
  dispatch_accepted_at: Date | string | null;
  dispatch_http_status: number | null;
  callback_accepted_at: Date | string | null;
  receipt: Record<string, unknown> | null;
  receipt_mac: string | null;
};

function invalidInput(label: string): never {
  throw new SenaEnterpriseError(`Invalid worker proof ${label}.`, 400, "worker_proof_store_input_invalid");
}

function assertId(value: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) invalidInput("id");
}

function assertHash(value: string, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) invalidInput(label);
}

function assertDate(value: string, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalidInput(label);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalidInput(label);
}

function serializeObject(value: Record<string, unknown>, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidInput(label);
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized[0] !== "{") invalidInput(label);
    return serialized;
  } catch {
    return invalidInput(label);
  }
}

function quotedIdentifier(value: string) {
  if (typeof value !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value)) {
    throw new SenaEnterpriseError("Invalid Postgres schema identifier.", 500, "invalid_postgres_identifier");
  }
  return `"${value}"`;
}

function storedRecord(row: WorkerProofRow | undefined): WorkerProofStoredRecord | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    nonceSha256: row.nonce_sha256,
    bindingSha256: row.binding_sha256,
    bindingMac: row.binding_mac,
    binding: row.binding,
    issuerRuntimeSha256: row.issuer_runtime_sha256,
    issuedAt: new Date(row.issued_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    ...(row.dispatch_accepted_at == null ? {} : { dispatchAcceptedAt: new Date(row.dispatch_accepted_at).toISOString() }),
    ...(row.dispatch_http_status == null ? {} : { dispatchHttpStatus: row.dispatch_http_status }),
    ...(row.callback_accepted_at == null ? {} : { callbackAcceptedAt: new Date(row.callback_accepted_at).toISOString() }),
    ...(row.receipt == null ? {} : { receipt: row.receipt }),
    ...(row.receipt_mac == null ? {} : { receiptMac: row.receipt_mac })
  };
}

export function createWorkerProofPostgresStore(options: {
  query: SenaEnterprisePostgresQuery;
  schemaName?: string;
}): WorkerProofPostgresStore {
  const { query } = options;
  const table = `${quotedIdentifier(options.schemaName ?? "public")}."sena_enterprise_worker_proofs"`;
  let schemaReady: Promise<void> | undefined;

  async function ensureSchema() {
    if (!schemaReady) {
      schemaReady = (async () => {
        await query(`CREATE TABLE IF NOT EXISTS ${table} (
          id text PRIMARY KEY,
          nonce_sha256 text NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
          binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[a-f0-9]{64}$'),
          binding_mac text NOT NULL CHECK (binding_mac ~ '^[a-f0-9]{64}$'),
          binding jsonb NOT NULL CHECK (jsonb_typeof(binding) = 'object'),
          issuer_runtime_sha256 text NOT NULL CHECK (issuer_runtime_sha256 ~ '^[a-f0-9]{64}$'),
          issued_at timestamptz NOT NULL,
          expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
          dispatch_accepted_at timestamptz,
          dispatch_http_status integer CHECK (dispatch_http_status BETWEEN 200 AND 299),
          callback_accepted_at timestamptz,
          receipt jsonb CHECK (jsonb_typeof(receipt) = 'object'),
          receipt_mac text CHECK (receipt_mac ~ '^[a-f0-9]{64}$'),
          CHECK ((dispatch_accepted_at IS NULL) = (dispatch_http_status IS NULL)),
          CHECK ((callback_accepted_at IS NULL) = (receipt IS NULL)
            AND (callback_accepted_at IS NULL) = (receipt_mac IS NULL))
        )`);
        await query(`CREATE INDEX IF NOT EXISTS "sena_enterprise_worker_proofs_receipts_idx"
          ON ${table} (binding_sha256, callback_accepted_at DESC, issued_at DESC, id DESC)
          WHERE dispatch_accepted_at IS NOT NULL AND callback_accepted_at IS NOT NULL`);
      })().catch((error) => {
        schemaReady = undefined;
        throw error;
      });
    }
    await schemaReady;
  }

  return {
    ensureSchema,
    async insertChallenge(record) {
      assertId(record.id);
      assertHash(record.nonceSha256, "nonce hash");
      assertHash(record.bindingSha256, "binding hash");
      assertHash(record.bindingMac, "binding MAC");
      assertHash(record.issuerRuntimeSha256, "issuer runtime hash");
      assertDate(record.issuedAt, "issue time");
      assertDate(record.expiresAt, "expiry time");
      if (record.expiresAt <= record.issuedAt) invalidInput("expiry time");
      const bindingJson = serializeObject(record.binding, "binding");
      if (Object.values(record.binding).some((value) => typeof value !== "string")) invalidInput("binding");
      if (record.dispatchAcceptedAt !== undefined || record.dispatchHttpStatus !== undefined
        || record.callbackAcceptedAt !== undefined || record.receipt !== undefined || record.receiptMac !== undefined) {
        invalidInput("initial acceptance state");
      }
      await ensureSchema();
      const result = await query<WorkerProofRow>(`INSERT INTO ${table}
        (id, nonce_sha256, binding_sha256, binding_mac, binding, issuer_runtime_sha256, issued_at, expires_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $8::timestamptz)
        RETURNING *`, [
        record.id, record.nonceSha256, record.bindingSha256, record.bindingMac,
        bindingJson, record.issuerRuntimeSha256, record.issuedAt, record.expiresAt
      ]);
      const inserted = storedRecord(result.rows[0]);
      if (!inserted) throw new SenaEnterpriseError("Worker proof challenge was not stored.", 500, "worker_proof_store_insert_failed");
      return inserted;
    },
    async getChallenge(id) {
      assertId(id);
      await ensureSchema();
      const result = await query<WorkerProofRow>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      return storedRecord(result.rows[0]);
    },
    async recordDispatch(input) {
      assertId(input.id);
      assertHash(input.bindingSha256, "binding hash");
      assertHash(input.bindingMac, "binding MAC");
      if (!Number.isInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) invalidInput("HTTP status");
      if (input.httpStatus < 200 || input.httpStatus > 299) return undefined;
      await ensureSchema();
      // Only dispatch columns change: a callback may already have been consumed.
      // Capture wall-clock time only after the row lock, including when a lock
      // holder commits without changing the row (no UPDATE predicate recheck).
      const result = await query<WorkerProofRow>(`WITH locked AS MATERIALIZED (
          SELECT id FROM ${table}
          WHERE id = $1 AND binding_sha256 = $2 AND binding_mac = $3
            AND dispatch_accepted_at IS NULL
          FOR UPDATE
        ), acceptance AS MATERIALIZED (
          SELECT id, clock_timestamp() AS accepted_at FROM locked
        )
        UPDATE ${table} AS proof
        SET dispatch_accepted_at = acceptance.accepted_at, dispatch_http_status = $4
        FROM acceptance
        WHERE proof.id = acceptance.id AND proof.id = $1
          AND proof.binding_sha256 = $2 AND proof.binding_mac = $3
          AND proof.dispatch_accepted_at IS NULL
          AND proof.expires_at > acceptance.accepted_at
          AND proof.issued_at <= acceptance.accepted_at + interval '30 seconds'
        RETURNING proof.*`, [input.id, input.bindingSha256, input.bindingMac, input.httpStatus]);
      return storedRecord(result.rows[0]);
    },
    async consumeCallback(input) {
      assertId(input.id);
      assertHash(input.nonceSha256, "nonce hash");
      assertHash(input.bindingSha256, "binding hash");
      assertHash(input.bindingMac, "binding MAC");
      assertHash(input.receiptMac, "receipt MAC");
      const receiptJson = serializeObject(input.receipt, "receipt");
      await ensureSchema();
      // The dependent materialized CTEs enforce lock-then-clock ordering in one
      // statement. The same post-lock time gates expiry and records acceptance.
      const result = await query<WorkerProofRow>(`WITH locked AS MATERIALIZED (
          SELECT id FROM ${table}
          WHERE id = $1 AND nonce_sha256 = $2 AND binding_sha256 = $3 AND binding_mac = $4
            AND callback_accepted_at IS NULL
          FOR UPDATE
        ), acceptance AS MATERIALIZED (
          SELECT id, clock_timestamp() AS accepted_at FROM locked
        )
        UPDATE ${table} AS proof
        SET callback_accepted_at = acceptance.accepted_at, receipt = $5::jsonb, receipt_mac = $6
        FROM acceptance
        WHERE proof.id = acceptance.id AND proof.id = $1
          AND proof.nonce_sha256 = $2 AND proof.binding_sha256 = $3 AND proof.binding_mac = $4
          AND proof.callback_accepted_at IS NULL
          AND proof.expires_at > acceptance.accepted_at
          AND proof.issued_at <= acceptance.accepted_at + interval '30 seconds'
        RETURNING proof.*`, [
        input.id, input.nonceSha256, input.bindingSha256, input.bindingMac, receiptJson, input.receiptMac
      ]);
      return storedRecord(result.rows[0]);
    },
    async latestReceipt(input) {
      assertHash(input.bindingSha256, "binding hash");
      assertDate(input.notBefore, "receipt freshness time");
      await ensureSchema();
      const result = await query<WorkerProofRow>(`SELECT * FROM ${table}
        WHERE binding_sha256 = $1
          AND dispatch_accepted_at IS NOT NULL AND callback_accepted_at IS NOT NULL
          AND callback_accepted_at >= $2::timestamptz
        ORDER BY callback_accepted_at DESC, issued_at DESC, id DESC
        LIMIT 1`, [input.bindingSha256, input.notBefore]);
      return storedRecord(result.rows[0]);
    }
  };
}
