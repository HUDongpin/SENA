import type { Pool, PoolClient, QueryResult } from "pg";
import { senaWorkflowAuditChainHead, senaWorkflowCanonicalJson, senaWorkflowDigest } from "./canonical";
import { assertSenaWorkflowCheckpointSafe } from "./checkpoint-policy";
import type {
  SenaWorkflowApproval,
  SenaWorkflowArtifact,
  SenaWorkflowCommand,
  SenaWorkflowRun,
  SenaWorkflowRunStatus,
  SenaWorkflowStepReceipt
} from "./types";

type WorkflowQuery = <T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  values?: unknown[]
) => Promise<QueryResult<T>>;

export type SenaWorkflowPostgresClient = {
  query: WorkflowQuery;
  release: () => void;
};

export type SenaWorkflowPostgresPool = {
  query: WorkflowQuery;
  connect: () => Promise<SenaWorkflowPostgresClient>;
  end?: () => Promise<void>;
};

export class SenaWorkflowStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "SenaWorkflowStoreError";
  }
}

type WorkflowSchemaDefinition = {
  id: string;
  name: string;
  role: string;
  productionRequired: true;
  statements: (schemaName: string) => string[];
};

function sqlIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new SenaWorkflowStoreError("Invalid SENA workflow Postgres identifier.", 500, "workflow_sql_identifier_invalid");
  }
  return `"${value}"`;
}

function tableReference(schemaName: string, tableName: string) {
  return `${sqlIdentifier(schemaName)}.${sqlIdentifier(tableName)}`;
}

function indexIdentifier(value: string) {
  return sqlIdentifier(value);
}

const RUNS_TABLE = "sena_workflow_runs";
const COMMANDS_TABLE = "sena_workflow_commands";
const RECEIPTS_TABLE = "sena_workflow_step_receipts";
const APPROVALS_TABLE = "sena_workflow_approvals";
const ARTIFACTS_TABLE = "sena_workflow_artifacts";
const IMMUTABLE_TERMINAL_RUN_STATUSES = new Set<SenaWorkflowRunStatus>([
  "succeeded",
  "cancelled",
  "superseded"
]);

function assertTerminalRunPatchIsNoop(
  current: SenaWorkflowRun,
  patch: Partial<SenaWorkflowRun>
) {
  if (!IMMUTABLE_TERMINAL_RUN_STATUSES.has(current.status)) return;
  const changesTerminalRun = Object.entries(patch).some(([key, value]) => (
    senaWorkflowCanonicalJson(current[key as keyof SenaWorkflowRun]) !== senaWorkflowCanonicalJson(value)
  ));
  if (changesTerminalRun) {
    throw new SenaWorkflowStoreError(
      "An immutable terminal SENA workflow run cannot transition again.",
      409,
      "workflow_terminal_transition_conflict"
    );
  }
}

export const SENA_WORKFLOW_POSTGRES_SCHEMA_DEFINITIONS: readonly WorkflowSchemaDefinition[] = [
  {
    id: "workflow-runs",
    name: RUNS_TABLE,
    role: "authoritative EvidenceFlow runs, optimistic versions, evidence boundaries, and audit-chain heads",
    productionRequired: true,
    statements: (schemaName) => {
      const table = tableReference(schemaName, RUNS_TABLE);
      return [
        `CREATE TABLE IF NOT EXISTS ${table} (
          id text PRIMARY KEY,
          schema_version text NOT NULL,
          version bigint NOT NULL,
          kind text NOT NULL,
          definition_version text NOT NULL,
          definition_hash text NOT NULL,
          mode text NOT NULL,
          team_id text NOT NULL,
          project_id text,
          project_revision_id text,
          research_source_class text,
          repo text,
          base_sha text,
          candidate_sha text,
          source_binding_digest text NOT NULL,
          code_sha text NOT NULL,
          config_digest text NOT NULL,
          status text NOT NULL,
          current_node_id text NOT NULL,
          pending_interrupt jsonb,
          attempt integer NOT NULL,
          blockers jsonb NOT NULL,
          job_references jsonb NOT NULL,
          artifact_references jsonb NOT NULL,
          approval_references jsonb NOT NULL,
          claim_boundary text,
          evidence_layers jsonb NOT NULL,
          start_idempotency_key text NOT NULL,
          start_payload_digest text NOT NULL,
          created_by_user_id text NOT NULL,
          audit_chain_head text,
          receipt_sequence bigint NOT NULL DEFAULT 0,
          parent_run_id text,
          parent_checkpoint_id text,
          superseded_by_run_id text,
          created_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        )`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS pending_interrupt jsonb`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS research_source_class text`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${RUNS_TABLE}_team_start_idempotency_uidx`)} ON ${table} (team_id, start_idempotency_key)`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${RUNS_TABLE}_status_updated_idx`)} ON ${table} (status, updated_at DESC)`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${RUNS_TABLE}_team_updated_idx`)} ON ${table} (team_id, updated_at DESC)`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${RUNS_TABLE}_project_updated_idx`)} ON ${table} (project_id, updated_at DESC)`
      ];
    }
  },
  {
    id: "workflow-commands",
    name: COMMANDS_TABLE,
    role: "transactional workflow command outbox, worker leases, retry attempts, and dead-letter state",
    productionRequired: true,
    statements: (schemaName) => {
      const table = tableReference(schemaName, COMMANDS_TABLE);
      return [
        `CREATE TABLE IF NOT EXISTS ${table} (
          id text PRIMARY KEY,
          run_id text NOT NULL REFERENCES ${tableReference(schemaName, RUNS_TABLE)} (id) ON DELETE RESTRICT,
          kind text NOT NULL,
          expected_version bigint NOT NULL,
          idempotency_key text NOT NULL,
          payload_digest text NOT NULL,
          payload jsonb NOT NULL,
          status text NOT NULL,
          attempts integer NOT NULL DEFAULT 0,
          available_at timestamptz NOT NULL,
          claimed_by text,
          claimed_at timestamptz,
          claim_expires_at timestamptz,
          completed_at timestamptz,
          error_class text,
          error_hash text,
          created_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${COMMANDS_TABLE}_run_idempotency_uidx`)} ON ${table} (run_id, idempotency_key)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${COMMANDS_TABLE}_run_claimed_uidx`)} ON ${table} (run_id) WHERE status = 'claimed'`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${COMMANDS_TABLE}_claim_idx`)} ON ${table} (status, available_at, created_at)`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${COMMANDS_TABLE}_run_created_idx`)} ON ${table} (run_id, created_at)`
      ];
    }
  },
  {
    id: "workflow-step-receipts",
    name: RECEIPTS_TABLE,
    role: "immutable hash-chained node receipts and exact effect-idempotency bindings",
    productionRequired: true,
    statements: (schemaName) => {
      const table = tableReference(schemaName, RECEIPTS_TABLE);
      return [
        `CREATE TABLE IF NOT EXISTS ${table} (
          id text PRIMARY KEY,
          schema_version text NOT NULL,
          run_id text NOT NULL REFERENCES ${tableReference(schemaName, RUNS_TABLE)} (id) ON DELETE RESTRICT,
          node_id text NOT NULL,
          attempt integer NOT NULL,
          sequence bigint NOT NULL,
          effect_key text,
          predecessor_receipt_hashes jsonb NOT NULL,
          input_digest text NOT NULL,
          output_digest text NOT NULL,
          job_id text,
          artifact_references jsonb NOT NULL,
          actor_type text NOT NULL,
          actor_id_hash text,
          code_sha text NOT NULL,
          evidence_layer text NOT NULL,
          state_patch jsonb NOT NULL DEFAULT '{}'::jsonb,
          started_at timestamptz NOT NULL,
          finished_at timestamptz NOT NULL,
          error_class text,
          retry_disposition text NOT NULL,
          previous_audit_chain_head text,
          audit_chain_head text NOT NULL
        )`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS state_patch jsonb NOT NULL DEFAULT '{}'::jsonb`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${RECEIPTS_TABLE}_run_sequence_uidx`)} ON ${table} (run_id, sequence)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${RECEIPTS_TABLE}_logical_attempt_uidx`)} ON ${table} (run_id, node_id, input_digest, attempt)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${RECEIPTS_TABLE}_effect_uidx`)} ON ${table} (run_id, effect_key) WHERE effect_key IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${RECEIPTS_TABLE}_run_node_idx`)} ON ${table} (run_id, node_id, sequence)`
      ];
    }
  },
  {
    id: "workflow-approvals",
    name: APPROVALS_TABLE,
    role: "immutable digest-bound human decisions with actor-role and interrupt custody",
    productionRequired: true,
    statements: (schemaName) => {
      const table = tableReference(schemaName, APPROVALS_TABLE);
      return [
        `CREATE TABLE IF NOT EXISTS ${table} (
          id text PRIMARY KEY,
          schema_version text NOT NULL,
          run_id text NOT NULL REFERENCES ${tableReference(schemaName, RUNS_TABLE)} (id) ON DELETE RESTRICT,
          node_id text NOT NULL,
          interrupt_id text NOT NULL,
          expected_version bigint NOT NULL,
          actor_user_id_hash text NOT NULL,
          actor_role text NOT NULL,
          decision text NOT NULL,
          reason_code text,
          input_digest text NOT NULL,
          candidate_output_digest text NOT NULL,
          decision_digest text NOT NULL,
          created_at timestamptz NOT NULL
        )`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS reason_code text`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${APPROVALS_TABLE}_run_interrupt_uidx`)} ON ${table} (run_id, interrupt_id)`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${APPROVALS_TABLE}_run_created_idx`)} ON ${table} (run_id, created_at)`
      ];
    }
  },
  {
    id: "workflow-artifacts",
    name: ARTIFACTS_TABLE,
    role: "content-addressed workflow artifacts and evidence-layer catalog bindings",
    productionRequired: true,
    statements: (schemaName) => {
      const table = tableReference(schemaName, ARTIFACTS_TABLE);
      return [
        `CREATE TABLE IF NOT EXISTS ${table} (
          id text PRIMARY KEY,
          run_id text NOT NULL REFERENCES ${tableReference(schemaName, RUNS_TABLE)} (id) ON DELETE RESTRICT,
          node_id text NOT NULL,
          filename text NOT NULL,
          schema_version text NOT NULL,
          sha256 text NOT NULL,
          storage_reference text NOT NULL,
          evidence_layer text NOT NULL,
          created_at timestamptz NOT NULL
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ${indexIdentifier(`${ARTIFACTS_TABLE}_run_node_sha_uidx`)} ON ${table} (run_id, node_id, sha256)`,
        `CREATE INDEX IF NOT EXISTS ${indexIdentifier(`${ARTIFACTS_TABLE}_run_node_idx`)} ON ${table} (run_id, node_id, created_at)`
      ];
    }
  }
];

function jsonValue(value: unknown): string {
  return senaWorkflowCanonicalJson(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isoTimestamp(value: unknown) {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function normalizeRun(row: Record<string, unknown>): SenaWorkflowRun {
  return {
    schemaVersion: String(row.schema_version) as SenaWorkflowRun["schemaVersion"],
    id: String(row.id),
    version: numberValue(row.version),
    kind: String(row.kind) as SenaWorkflowRun["kind"],
    definitionVersion: String(row.definition_version) as SenaWorkflowRun["definitionVersion"],
    definitionHash: String(row.definition_hash),
    mode: String(row.mode) as SenaWorkflowRun["mode"],
    teamId: String(row.team_id),
    projectId: optionalString(row.project_id),
    projectRevisionId: optionalString(row.project_revision_id),
    researchSourceClass: optionalString(row.research_source_class) as SenaWorkflowRun["researchSourceClass"],
    repo: optionalString(row.repo),
    baseSha: optionalString(row.base_sha),
    candidateSha: optionalString(row.candidate_sha),
    sourceBindingDigest: String(row.source_binding_digest),
    codeSha: String(row.code_sha),
    configDigest: String(row.config_digest),
    status: String(row.status) as SenaWorkflowRun["status"],
    currentNodeId: String(row.current_node_id),
    pendingInterrupt: row.pending_interrupt
      ? row.pending_interrupt as SenaWorkflowRun["pendingInterrupt"]
      : undefined,
    attempt: numberValue(row.attempt),
    blockers: (row.blockers ?? []) as SenaWorkflowRun["blockers"],
    jobReferences: (row.job_references ?? []) as string[],
    artifactReferences: (row.artifact_references ?? []) as string[],
    approvalReferences: (row.approval_references ?? []) as string[],
    claimBoundary: optionalString(row.claim_boundary) as SenaWorkflowRun["claimBoundary"],
    evidenceLayers: row.evidence_layers as SenaWorkflowRun["evidenceLayers"],
    startIdempotencyKey: String(row.start_idempotency_key),
    startPayloadDigest: String(row.start_payload_digest),
    createdByUserId: String(row.created_by_user_id),
    auditChainHead: optionalString(row.audit_chain_head),
    receiptSequence: numberValue(row.receipt_sequence),
    parentRunId: optionalString(row.parent_run_id),
    parentCheckpointId: optionalString(row.parent_checkpoint_id),
    supersededByRunId: optionalString(row.superseded_by_run_id),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at)
  };
}

function normalizeCommand(row: Record<string, unknown>): SenaWorkflowCommand {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    kind: String(row.kind) as SenaWorkflowCommand["kind"],
    expectedVersion: numberValue(row.expected_version),
    idempotencyKey: String(row.idempotency_key),
    payloadDigest: String(row.payload_digest),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: String(row.status) as SenaWorkflowCommand["status"],
    attempts: numberValue(row.attempts),
    availableAt: isoTimestamp(row.available_at),
    claimedBy: optionalString(row.claimed_by),
    claimedAt: row.claimed_at ? isoTimestamp(row.claimed_at) : undefined,
    claimExpiresAt: row.claim_expires_at ? isoTimestamp(row.claim_expires_at) : undefined,
    completedAt: row.completed_at ? isoTimestamp(row.completed_at) : undefined,
    errorClass: optionalString(row.error_class),
    errorHash: optionalString(row.error_hash),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at)
  };
}

function normalizeReceipt(row: Record<string, unknown>): SenaWorkflowStepReceipt {
  return {
    schemaVersion: String(row.schema_version) as SenaWorkflowStepReceipt["schemaVersion"],
    id: String(row.id),
    runId: String(row.run_id),
    nodeId: String(row.node_id),
    attempt: numberValue(row.attempt),
    sequence: numberValue(row.sequence),
    effectKey: optionalString(row.effect_key),
    predecessorReceiptHashes: (row.predecessor_receipt_hashes ?? []) as string[],
    inputDigest: String(row.input_digest),
    outputDigest: String(row.output_digest),
    jobId: optionalString(row.job_id),
    artifactReferences: (row.artifact_references ?? []) as string[],
    actorType: String(row.actor_type) as SenaWorkflowStepReceipt["actorType"],
    actorIdHash: optionalString(row.actor_id_hash),
    codeSha: String(row.code_sha),
    evidenceLayer: String(row.evidence_layer) as SenaWorkflowStepReceipt["evidenceLayer"],
    statePatch: row.state_patch && Object.keys(row.state_patch as Record<string, unknown>).length > 0
      ? row.state_patch as SenaWorkflowStepReceipt["statePatch"]
      : undefined,
    startedAt: isoTimestamp(row.started_at),
    finishedAt: isoTimestamp(row.finished_at),
    errorClass: optionalString(row.error_class),
    retryDisposition: String(row.retry_disposition) as SenaWorkflowStepReceipt["retryDisposition"],
    previousAuditChainHead: optionalString(row.previous_audit_chain_head),
    auditChainHead: String(row.audit_chain_head)
  };
}

function normalizeApproval(row: Record<string, unknown>): SenaWorkflowApproval {
  return {
    schemaVersion: String(row.schema_version) as SenaWorkflowApproval["schemaVersion"],
    id: String(row.id),
    runId: String(row.run_id),
    nodeId: String(row.node_id),
    interruptId: String(row.interrupt_id),
    expectedVersion: numberValue(row.expected_version),
    actorUserIdHash: String(row.actor_user_id_hash),
    actorRole: String(row.actor_role),
    decision: String(row.decision) as SenaWorkflowApproval["decision"],
    reasonCode: optionalString(row.reason_code),
    inputDigest: String(row.input_digest),
    candidateOutputDigest: String(row.candidate_output_digest),
    decisionDigest: String(row.decision_digest),
    createdAt: isoTimestamp(row.created_at)
  };
}

function normalizeArtifact(row: Record<string, unknown>): SenaWorkflowArtifact {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    nodeId: String(row.node_id),
    filename: String(row.filename),
    schemaVersion: String(row.schema_version),
    sha256: String(row.sha256),
    storageReference: String(row.storage_reference),
    evidenceLayer: String(row.evidence_layer) as SenaWorkflowArtifact["evidenceLayer"],
    createdAt: isoTimestamp(row.created_at)
  };
}

function sameCanonicalValue(left: unknown, right: unknown) {
  return senaWorkflowCanonicalJson(left) === senaWorkflowCanonicalJson(right);
}

function idempotencyConflict() {
  return new SenaWorkflowStoreError(
    "The SENA workflow idempotency key is already bound to a different request.",
    409,
    "workflow_idempotency_conflict"
  );
}

function optimisticConflict() {
  return new SenaWorkflowStoreError(
    "The SENA workflow run changed before this command was accepted.",
    409,
    "workflow_version_conflict"
  );
}

function missingRun() {
  return new SenaWorkflowStoreError("SENA workflow run was not found.", 404, "workflow_run_not_found");
}

async function inTransaction<T>(pool: SenaWorkflowPostgresPool, operation: (client: SenaWorkflowPostgresClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof SenaWorkflowStoreError) throw error;
    throw new SenaWorkflowStoreError(
      "The SENA workflow Postgres transaction failed without exposing stored values.",
      500,
      "workflow_transaction_failed"
    );
  } finally {
    client.release();
  }
}

export function createSenaWorkflowPostgresStore(input: {
  pool: SenaWorkflowPostgresPool | Pool;
  schemaName?: string;
}) {
  const pool = input.pool as SenaWorkflowPostgresPool;
  const schemaName = input.schemaName ?? "public";
  const runsTable = tableReference(schemaName, RUNS_TABLE);
  const commandsTable = tableReference(schemaName, COMMANDS_TABLE);
  const receiptsTable = tableReference(schemaName, RECEIPTS_TABLE);
  const approvalsTable = tableReference(schemaName, APPROVALS_TABLE);
  const artifactsTable = tableReference(schemaName, ARTIFACTS_TABLE);
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    for (const definition of SENA_WORKFLOW_POSTGRES_SCHEMA_DEFINITIONS) {
      for (const statement of definition.statements(schemaName)) await pool.query(statement);
    }
    schemaReady = true;
  }

  async function createRunWithStartCommand(inputCreate: {
    run: SenaWorkflowRun;
    command: SenaWorkflowCommand;
  }) {
    await ensureSchema();
    if (
      inputCreate.command.runId !== inputCreate.run.id ||
      inputCreate.command.kind !== "start" ||
      inputCreate.command.expectedVersion !== inputCreate.run.version ||
      inputCreate.command.payloadDigest !== inputCreate.run.startPayloadDigest
    ) {
      throw new SenaWorkflowStoreError(
        "The SENA workflow run and transactional start command are not bound to the same request.",
        422,
        "workflow_start_binding_invalid"
      );
    }
    assertSenaWorkflowCheckpointSafe(inputCreate.command.payload, "command.payload");
    return inTransaction(pool, async (client) => {
      const inserted = await insertRun(client.query.bind(client), runsTable, inputCreate.run);

      if (inserted.rows[0]) {
        await insertCommand(client.query.bind(client), commandsTable, inputCreate.command);
        return { created: true, run: normalizeRun(inserted.rows[0]), command: inputCreate.command };
      }

      const existingRunResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable}
        WHERE team_id = $1 AND start_idempotency_key = $2
        LIMIT 1
      `, [inputCreate.run.teamId, inputCreate.run.startIdempotencyKey]);
      const existingRunRow = existingRunResult.rows[0];
      if (!existingRunRow || existingRunRow.start_payload_digest !== inputCreate.run.startPayloadDigest) {
        throw idempotencyConflict();
      }
      const existingCommandResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${commandsTable}
        WHERE run_id = $1 AND idempotency_key = $2
        LIMIT 1
      `, [String(existingRunRow.id), inputCreate.command.idempotencyKey]);
      if (!existingCommandResult.rows[0]) {
        throw new SenaWorkflowStoreError(
          "The SENA workflow transactional start command is missing.",
          500,
          "workflow_start_command_missing"
        );
      }
      const existingCommand = normalizeCommand(existingCommandResult.rows[0]);
      if (existingCommand.payloadDigest !== inputCreate.command.payloadDigest) throw idempotencyConflict();
      return { created: false, run: normalizeRun(existingRunRow), command: existingCommand };
    });
  }

  async function forkRun(inputFork: {
    sourceRunId: string;
    teamId: string;
    expectedVersion: number;
    forkedRun: SenaWorkflowRun;
    command: SenaWorkflowCommand;
  }) {
    await ensureSchema();
    const { forkedRun, command } = inputFork;
    const payload = command.payload;
    const invalidBinding =
      forkedRun.id === inputFork.sourceRunId ||
      forkedRun.teamId !== inputFork.teamId ||
      forkedRun.parentRunId !== inputFork.sourceRunId ||
      !forkedRun.parentCheckpointId ||
      forkedRun.status !== "queued" ||
      forkedRun.version !== 1 ||
      forkedRun.receiptSequence !== 0 ||
      Boolean(forkedRun.auditChainHead) ||
      Boolean(forkedRun.supersededByRunId) ||
      forkedRun.jobReferences.length !== 0 ||
      forkedRun.artifactReferences.length !== 0 ||
      forkedRun.approvalReferences.length !== 0 ||
      command.runId !== forkedRun.id ||
      command.kind !== "fork" ||
      command.expectedVersion !== forkedRun.version ||
      command.idempotencyKey !== forkedRun.startIdempotencyKey ||
      command.payloadDigest !== forkedRun.startPayloadDigest ||
      command.payloadDigest !== senaWorkflowDigest(payload) ||
      payload.sourceRunId !== inputFork.sourceRunId ||
      payload.checkpointId !== forkedRun.parentCheckpointId ||
      payload.newSourceBindingDigest !== forkedRun.sourceBindingDigest;
    if (invalidBinding) {
      throw new SenaWorkflowStoreError(
        "The SENA workflow fork is not bound to one source run, checkpoint, and immutable replacement binding.",
        422,
        "workflow_fork_binding_invalid"
      );
    }
    assertSenaWorkflowCheckpointSafe(command.payload, "command.payload");

    return inTransaction(pool, async (client) => {
      const existingResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable}
        WHERE team_id = $1 AND start_idempotency_key = $2
        LIMIT 1
      `, [inputFork.teamId, forkedRun.startIdempotencyKey]);
      if (existingResult.rows[0]) {
        const existingFork = normalizeRun(existingResult.rows[0]);
        const existingCommandResult = await client.query<Record<string, unknown>>(`
          SELECT * FROM ${commandsTable} WHERE run_id = $1 AND idempotency_key = $2 LIMIT 1
        `, [existingFork.id, command.idempotencyKey]);
        const existingCommand = existingCommandResult.rows[0]
          ? normalizeCommand(existingCommandResult.rows[0])
          : undefined;
        if (
          existingFork.id !== forkedRun.id ||
          existingFork.parentRunId !== inputFork.sourceRunId ||
          existingFork.parentCheckpointId !== forkedRun.parentCheckpointId ||
          existingFork.sourceBindingDigest !== forkedRun.sourceBindingDigest ||
          existingFork.projectRevisionId !== forkedRun.projectRevisionId ||
          existingFork.repo !== forkedRun.repo ||
          existingFork.baseSha !== forkedRun.baseSha ||
          existingFork.candidateSha !== forkedRun.candidateSha ||
          existingFork.definitionHash !== forkedRun.definitionHash ||
          existingFork.codeSha !== forkedRun.codeSha ||
          existingFork.configDigest !== forkedRun.configDigest ||
          !existingCommand ||
          existingCommand.kind !== "fork" ||
          existingCommand.payloadDigest !== command.payloadDigest
        ) throw idempotencyConflict();
        const sourceResult = await client.query<Record<string, unknown>>(`
          SELECT * FROM ${runsTable} WHERE id = $1 AND team_id = $2 LIMIT 1
        `, [inputFork.sourceRunId, inputFork.teamId]);
        if (!sourceResult.rows[0]) throw missingRun();
        return {
          created: false,
          sourceRun: normalizeRun(sourceResult.rows[0]),
          forkedRun: existingFork,
          command: existingCommand
        };
      }

      const sourceResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 AND team_id = $2 FOR UPDATE
      `, [inputFork.sourceRunId, inputFork.teamId]);
      if (!sourceResult.rows[0]) throw missingRun();
      const source = normalizeRun(sourceResult.rows[0]);
      if (source.version !== inputFork.expectedVersion) throw optimisticConflict();
      if (source.supersededByRunId || source.status === "superseded") {
        throw new SenaWorkflowStoreError(
          "The SENA workflow source run was already superseded.",
          409,
          "workflow_already_superseded"
        );
      }
      if (
        source.kind !== forkedRun.kind ||
        source.definitionVersion !== forkedRun.definitionVersion ||
        source.mode !== forkedRun.mode
      ) {
        throw new SenaWorkflowStoreError(
          "The SENA workflow fork cannot change workflow kind, definition generation, or execution mode.",
          422,
          "workflow_fork_kind_invalid"
        );
      }

      const inserted = await insertRun(client.query.bind(client), runsTable, forkedRun);
      if (!inserted.rows[0]) throw idempotencyConflict();
      await insertCommand(client.query.bind(client), commandsTable, command);
      const supersededResult = await client.query<Record<string, unknown>>(`
        UPDATE ${runsTable}
        SET version = version + 1,
          status = 'superseded',
          superseded_by_run_id = $3,
          updated_at = $4
        WHERE id = $1 AND team_id = $2 AND version = $5
        RETURNING *
      `, [inputFork.sourceRunId, inputFork.teamId, forkedRun.id, forkedRun.createdAt, source.version]);
      if (!supersededResult.rows[0]) throw optimisticConflict();
      return {
        created: true,
        sourceRun: normalizeRun(supersededResult.rows[0]),
        forkedRun: normalizeRun(inserted.rows[0]),
        command
      };
    });
  }

  async function getRun(runId: string, teamId?: string) {
    await ensureSchema();
    const values: unknown[] = [runId];
    const teamClause = teamId ? ` AND team_id = $${values.push(teamId)}` : "";
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ${runsTable} WHERE id = $1${teamClause} LIMIT 1`,
      values
    );
    return result.rows[0] ? normalizeRun(result.rows[0]) : null;
  }

  async function listRuns(filters: { teamId: string; status?: SenaWorkflowRunStatus; limit?: number }) {
    await ensureSchema();
    const values: unknown[] = [filters.teamId];
    const statusClause = filters.status ? ` AND status = $${values.push(filters.status)}` : "";
    values.push(Math.max(1, Math.min(filters.limit ?? 100, 500)));
    const result = await pool.query<Record<string, unknown>>(`
      SELECT * FROM ${runsTable}
      WHERE team_id = $1${statusClause}
      ORDER BY updated_at DESC, id ASC
      LIMIT $${values.length}
    `, values);
    return result.rows.map(normalizeRun);
  }

  async function listWaitingJobRuns(limit = 500) {
    await ensureSchema();
    const result = await pool.query<Record<string, unknown>>(`
      SELECT * FROM ${runsTable}
      WHERE status = 'waiting_job'
      ORDER BY updated_at ASC, id ASC
      LIMIT $1
    `, [Math.max(1, Math.min(limit, 500))]);
    return result.rows.map(normalizeRun);
  }

  async function enqueueCommand(inputEnqueue: {
    teamId: string;
    expectedVersion: number;
    command: SenaWorkflowCommand;
  }) {
    await ensureSchema();
    assertSenaWorkflowCheckpointSafe(inputEnqueue.command.payload, "command.payload");
    return inTransaction(pool, async (client) => {
      const runResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 AND team_id = $2 FOR UPDATE
      `, [inputEnqueue.command.runId, inputEnqueue.teamId]);
      const runRow = runResult.rows[0];
      if (!runRow) throw missingRun();

      const duplicateResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${commandsTable} WHERE run_id = $1 AND idempotency_key = $2 LIMIT 1
      `, [inputEnqueue.command.runId, inputEnqueue.command.idempotencyKey]);
      if (duplicateResult.rows[0]) {
        const duplicate = normalizeCommand(duplicateResult.rows[0]);
        if (duplicate.payloadDigest !== inputEnqueue.command.payloadDigest) throw idempotencyConflict();
        return { created: false, run: normalizeRun(runRow), command: duplicate };
      }
      if (numberValue(runRow.version) !== inputEnqueue.expectedVersion) throw optimisticConflict();

      await insertCommand(client.query.bind(client), commandsTable, inputEnqueue.command);
      const updatedRun = await client.query<Record<string, unknown>>(`
        UPDATE ${runsTable}
        SET version = version + 1, updated_at = $2
        WHERE id = $1
        RETURNING *
      `, [inputEnqueue.command.runId, inputEnqueue.command.createdAt]);
      return {
        created: true,
        run: normalizeRun(updatedRun.rows[0]),
        command: inputEnqueue.command
      };
    });
  }

  async function claimNextCommand(inputClaim: {
    workerId: string;
    leaseMs?: number;
    maxAttempts?: number;
    kinds?: SenaWorkflowCommand["kind"][];
  }) {
    await ensureSchema();
    const leaseMs = Math.max(1_000, Math.min(inputClaim.leaseMs ?? 30_000, 15 * 60_000));
    const maxAttempts = Math.max(1, Math.min(inputClaim.maxAttempts ?? 5, 20));
    return inTransaction(pool, async (client) => {
      await client.query(`
        WITH expired AS (
          UPDATE ${commandsTable}
          SET status = 'dead_lettered',
            claimed_by = NULL,
            claimed_at = NULL,
            claim_expires_at = NULL,
            updated_at = now(),
            error_class = 'command-lease-exhausted'
          WHERE status = 'claimed' AND claim_expires_at <= now() AND attempts >= $1
          RETURNING run_id
        ), affected AS (
          SELECT DISTINCT run_id FROM expired
        )
        UPDATE ${runsTable} AS run
        SET version = run.version + 1,
          status = 'dead_lettered',
          pending_interrupt = NULL,
          blockers = jsonb_build_array(jsonb_build_object(
            'code', 'workflow_command_lease_exhausted',
            'message', 'The workflow command exhausted its durable worker lease attempts.',
            'nodeId', run.current_node_id,
            'retryable', true
          )),
          updated_at = now()
        FROM affected
        WHERE run.id = affected.run_id
          AND run.status NOT IN ('succeeded', 'cancelled', 'superseded')
      `, [maxAttempts]);
      const runValues: unknown[] = [maxAttempts];
      const runKindsClause = inputClaim.kinds?.length
        ? ` AND candidate_command.kind = ANY($${runValues.push(inputClaim.kinds)}::text[])`
        : "";
      const candidateRun = await client.query<Record<string, unknown>>(`
        SELECT candidate_run.id
        FROM ${runsTable} AS candidate_run
        JOIN LATERAL (
          SELECT candidate_command.id, candidate_command.available_at, candidate_command.created_at
          FROM ${commandsTable} AS candidate_command
          WHERE candidate_command.run_id = candidate_run.id
            AND candidate_command.attempts < $1
            AND (
              (candidate_command.status = 'pending' AND candidate_command.available_at <= now())
              OR (candidate_command.status = 'claimed' AND candidate_command.claim_expires_at <= now())
            )
            ${runKindsClause}
          ORDER BY candidate_command.available_at ASC, candidate_command.created_at ASC, candidate_command.id ASC
          LIMIT 1
        ) AS candidate_command ON true
        WHERE NOT EXISTS (
          SELECT 1 FROM ${commandsTable} AS active_command
          WHERE active_command.run_id = candidate_run.id
            AND active_command.status = 'claimed'
            AND active_command.claim_expires_at > now()
        )
        ORDER BY candidate_command.available_at ASC, candidate_command.created_at ASC, candidate_command.id ASC
        FOR UPDATE OF candidate_run SKIP LOCKED
        LIMIT 1
      `, runValues);
      const runId = candidateRun.rows[0]?.id;
      if (typeof runId !== "string") return null;

      const values: unknown[] = [inputClaim.workerId, leaseMs, maxAttempts, runId];
      const commandKindsClause = inputClaim.kinds?.length
        ? ` AND candidate_command.kind = ANY($${values.push(inputClaim.kinds)}::text[])`
        : "";
      const result = await client.query<Record<string, unknown>>(`
        WITH candidate AS (
          SELECT candidate_command.id
          FROM ${commandsTable} AS candidate_command
          WHERE candidate_command.run_id = $4
            AND candidate_command.attempts < $3
            AND (
              (candidate_command.status = 'pending' AND candidate_command.available_at <= now())
              OR (candidate_command.status = 'claimed' AND candidate_command.claim_expires_at <= now())
            )
            ${commandKindsClause}
            AND NOT EXISTS (
              SELECT 1 FROM ${commandsTable} AS active_command
              WHERE active_command.run_id = $4
                AND active_command.status = 'claimed'
                AND active_command.claim_expires_at > now()
            )
          ORDER BY candidate_command.available_at ASC, candidate_command.created_at ASC, candidate_command.id ASC
          FOR UPDATE OF candidate_command SKIP LOCKED
          LIMIT 1
        )
        UPDATE ${commandsTable} AS command
        SET status = 'claimed',
          attempts = command.attempts + 1,
          claimed_by = $1,
          claimed_at = now(),
          claim_expires_at = now() + ($2::double precision * interval '1 millisecond'),
          updated_at = now(),
          error_class = NULL,
          error_hash = NULL
        FROM candidate
        WHERE command.id = candidate.id
        RETURNING command.*
      `, values);
      return result.rows[0] ? normalizeCommand(result.rows[0]) : null;
    });
  }

  async function completeCommand(inputComplete: { commandId: string; workerId: string; completedAt: string }) {
    await ensureSchema();
    const result = await pool.query<Record<string, unknown>>(`
      UPDATE ${commandsTable}
      SET status = 'completed', completed_at = $3, updated_at = $3, claim_expires_at = NULL
      WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
      RETURNING *
    `, [inputComplete.commandId, inputComplete.workerId, inputComplete.completedAt]);
    if (!result.rows[0]) {
      throw new SenaWorkflowStoreError(
        "The SENA workflow command lease is no longer owned by this worker.",
        409,
        "workflow_command_lease_conflict"
      );
    }
    return normalizeCommand(result.rows[0]);
  }

  async function failCommand(inputFailure: {
    commandId: string;
    workerId: string;
    failedAt: string;
    retryable: boolean;
    retryAt?: string;
    maxAttempts?: number;
    errorClass: string;
    errorHash: string;
  }) {
    await ensureSchema();
    const maxAttempts = Math.max(1, Math.min(inputFailure.maxAttempts ?? 5, 20));
    return inTransaction(pool, async (client) => {
      const result = await client.query<Record<string, unknown>>(`
        UPDATE ${commandsTable}
        SET status = CASE
            WHEN $4::boolean AND attempts < $5 THEN 'pending'
            WHEN attempts >= $5 THEN 'dead_lettered'
            ELSE 'failed'
          END,
          available_at = CASE WHEN $4::boolean AND attempts < $5 THEN COALESCE($6::timestamptz, now()) ELSE available_at END,
          claimed_by = NULL,
          claimed_at = NULL,
          claim_expires_at = NULL,
          error_class = $7,
          error_hash = $8,
          updated_at = $3
        WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
        RETURNING *
      `, [
        inputFailure.commandId,
        inputFailure.workerId,
        inputFailure.failedAt,
        inputFailure.retryable,
        maxAttempts,
        inputFailure.retryAt ?? null,
        inputFailure.errorClass,
        inputFailure.errorHash
      ]);
      if (!result.rows[0]) {
        throw new SenaWorkflowStoreError(
          "The SENA workflow command lease is no longer owned by this worker.",
          409,
          "workflow_command_lease_conflict"
        );
      }
      const command = normalizeCommand(result.rows[0]);
      if (command.status === "failed" || command.status === "dead_lettered") {
        await client.query(`
          UPDATE ${runsTable}
          SET version = version + 1,
            status = $2,
            pending_interrupt = NULL,
            blockers = jsonb_build_array(jsonb_build_object(
              'code', $3::text,
              'message', 'The workflow command failed; inspect its redacted error receipt before retrying.',
              'nodeId', current_node_id,
              'retryable', true
            )),
            updated_at = $4
          WHERE id = $1 AND status NOT IN ('succeeded', 'cancelled', 'superseded')
        `, [command.runId, command.status, inputFailure.errorClass, inputFailure.failedAt]);
      }
      return command;
    });
  }

  async function transitionRun(inputTransition: {
    runId: string;
    teamId: string;
    expectedVersion: number;
    updatedAt: string;
    patch: Partial<Pick<
      SenaWorkflowRun,
      | "status"
      | "currentNodeId"
      | "pendingInterrupt"
      | "attempt"
      | "blockers"
      | "jobReferences"
      | "candidateSha"
      | "claimBoundary"
      | "evidenceLayers"
      | "supersededByRunId"
    >>;
  }) {
    await ensureSchema();
    assertSenaWorkflowCheckpointSafe(inputTransition.patch, "run.patch");
    return inTransaction(pool, async (client) => {
      const currentResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 AND team_id = $2 FOR UPDATE
      `, [inputTransition.runId, inputTransition.teamId]);
      if (!currentResult.rows[0]) throw missingRun();
      const current = normalizeRun(currentResult.rows[0]);
      if (current.version !== inputTransition.expectedVersion) throw optimisticConflict();
      assertTerminalRunPatchIsNoop(current, inputTransition.patch);
      const next = { ...current, ...inputTransition.patch, version: current.version + 1, updatedAt: inputTransition.updatedAt };
      const result = await client.query<Record<string, unknown>>(`
        UPDATE ${runsTable}
        SET version = $3,
          status = $4,
          current_node_id = $5,
          pending_interrupt = $6::jsonb,
          attempt = $7,
          blockers = $8::jsonb,
          job_references = $9::jsonb,
          candidate_sha = $10,
          claim_boundary = $11,
          evidence_layers = $12::jsonb,
          superseded_by_run_id = $13,
          updated_at = $14
        WHERE id = $1 AND team_id = $2 AND version = $15
        RETURNING *
      `, [
        inputTransition.runId,
        inputTransition.teamId,
        next.version,
        next.status,
        next.currentNodeId,
        next.pendingInterrupt ? jsonValue(next.pendingInterrupt) : null,
        next.attempt,
        jsonValue(next.blockers),
        jsonValue(next.jobReferences),
        next.candidateSha ?? null,
        next.claimBoundary ?? null,
        jsonValue(next.evidenceLayers),
        next.supersededByRunId ?? null,
        next.updatedAt,
        current.version
      ]);
      if (!result.rows[0]) throw optimisticConflict();
      return normalizeRun(result.rows[0]);
    });
  }

  async function settleClaimedCommand(inputSettlement: {
    commandId: string;
    workerId: string;
    runId: string;
    teamId: string;
    expectedRunVersion: number;
    completedAt: string;
    patch: Partial<Pick<
      SenaWorkflowRun,
      | "status"
      | "currentNodeId"
      | "pendingInterrupt"
      | "attempt"
      | "blockers"
      | "jobReferences"
      | "candidateSha"
      | "claimBoundary"
      | "evidenceLayers"
      | "supersededByRunId"
    >>;
  }) {
    await ensureSchema();
    assertSenaWorkflowCheckpointSafe(inputSettlement.patch, "run.patch");
    return inTransaction(pool, async (client) => {
      const runResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 AND team_id = $2 FOR UPDATE
      `, [inputSettlement.runId, inputSettlement.teamId]);
      if (!runResult.rows[0]) throw missingRun();
      const current = normalizeRun(runResult.rows[0]);
      if (current.version !== inputSettlement.expectedRunVersion) throw optimisticConflict();
      assertTerminalRunPatchIsNoop(current, inputSettlement.patch);

      const commandResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${commandsTable} WHERE id = $1 AND run_id = $2 FOR UPDATE
      `, [inputSettlement.commandId, inputSettlement.runId]);
      const command = commandResult.rows[0] ? normalizeCommand(commandResult.rows[0]) : undefined;
      if (command?.status !== "claimed" || command.claimedBy !== inputSettlement.workerId) {
        throw new SenaWorkflowStoreError(
          "The SENA workflow command lease is no longer owned by this worker.",
          409,
          "workflow_command_lease_conflict"
        );
      }

      const next = {
        ...current,
        ...inputSettlement.patch,
        version: current.version + 1,
        updatedAt: inputSettlement.completedAt
      };
      const updatedRun = await client.query<Record<string, unknown>>(`
        UPDATE ${runsTable}
        SET version = $3,
          status = $4,
          current_node_id = $5,
          pending_interrupt = $6::jsonb,
          attempt = $7,
          blockers = $8::jsonb,
          job_references = $9::jsonb,
          candidate_sha = $10,
          claim_boundary = $11,
          evidence_layers = $12::jsonb,
          superseded_by_run_id = $13,
          updated_at = $14
        WHERE id = $1 AND team_id = $2 AND version = $15
        RETURNING *
      `, [
        inputSettlement.runId,
        inputSettlement.teamId,
        next.version,
        next.status,
        next.currentNodeId,
        next.pendingInterrupt ? jsonValue(next.pendingInterrupt) : null,
        next.attempt,
        jsonValue(next.blockers),
        jsonValue(next.jobReferences),
        next.candidateSha ?? null,
        next.claimBoundary ?? null,
        jsonValue(next.evidenceLayers),
        next.supersededByRunId ?? null,
        next.updatedAt,
        current.version
      ]);
      if (!updatedRun.rows[0]) throw optimisticConflict();

      const completedCommand = await client.query<Record<string, unknown>>(`
        UPDATE ${commandsTable}
        SET status = 'completed',
          completed_at = $3,
          updated_at = $3,
          claim_expires_at = NULL
        WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
        RETURNING *
      `, [inputSettlement.commandId, inputSettlement.workerId, inputSettlement.completedAt]);
      if (!completedCommand.rows[0]) {
        throw new SenaWorkflowStoreError(
          "The SENA workflow command lease is no longer owned by this worker.",
          409,
          "workflow_command_lease_conflict"
        );
      }
      return {
        run: normalizeRun(updatedRun.rows[0]),
        command: normalizeCommand(completedCommand.rows[0])
      };
    });
  }

  async function appendStepReceipt(
    draft: Omit<SenaWorkflowStepReceipt, "sequence" | "previousAuditChainHead" | "auditChainHead">
  ) {
    await ensureSchema();
    assertSenaWorkflowCheckpointSafe(draft, "receipt");
    return inTransaction(pool, async (client) => {
      const runResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 FOR UPDATE
      `, [draft.runId]);
      if (!runResult.rows[0]) throw missingRun();

      const duplicateResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${receiptsTable}
        WHERE run_id = $1 AND node_id = $2 AND input_digest = $3 AND attempt = $4
        LIMIT 1
      `, [draft.runId, draft.nodeId, draft.inputDigest, draft.attempt]);
      if (duplicateResult.rows[0]) {
        const duplicate = normalizeReceipt(duplicateResult.rows[0]);
        if (
          duplicate.outputDigest !== draft.outputDigest ||
          duplicate.effectKey !== draft.effectKey ||
          !sameCanonicalValue(duplicate.artifactReferences, draft.artifactReferences)
        ) throw idempotencyConflict();
        return { created: false, receipt: duplicate };
      }

      if (draft.effectKey) {
        const effectResult = await client.query<Record<string, unknown>>(`
          SELECT * FROM ${receiptsTable} WHERE run_id = $1 AND effect_key = $2 LIMIT 1
        `, [draft.runId, draft.effectKey]);
        if (effectResult.rows[0]) {
          const effectReceipt = normalizeReceipt(effectResult.rows[0]);
          if (effectReceipt.nodeId !== draft.nodeId || effectReceipt.inputDigest !== draft.inputDigest) {
            throw idempotencyConflict();
          }
          return { created: false, receipt: effectReceipt };
        }
      }

      const run = normalizeRun(runResult.rows[0]);
      const sequence = run.receiptSequence + 1;
      const previousAuditChainHead = run.auditChainHead;
      const receiptWithoutHead = { ...draft, sequence, previousAuditChainHead };
      const auditChainHead = senaWorkflowAuditChainHead({
        previousAuditChainHead,
        receiptWithoutAuditChainHead: receiptWithoutHead
      });
      const receipt: SenaWorkflowStepReceipt = { ...receiptWithoutHead, auditChainHead };
      await client.query(`
        INSERT INTO ${receiptsTable} (
          id, schema_version, run_id, node_id, attempt, sequence, effect_key,
          predecessor_receipt_hashes, input_digest, output_digest, job_id,
          artifact_references, actor_type, actor_id_hash, code_sha, evidence_layer,
          state_patch, started_at, finished_at, error_class, retry_disposition,
          previous_audit_chain_head, audit_chain_head
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,
          $17::jsonb,$18,$19,$20,$21,$22,$23
        )
      `, [
        receipt.id,
        receipt.schemaVersion,
        receipt.runId,
        receipt.nodeId,
        receipt.attempt,
        receipt.sequence,
        receipt.effectKey ?? null,
        jsonValue(receipt.predecessorReceiptHashes),
        receipt.inputDigest,
        receipt.outputDigest,
        receipt.jobId ?? null,
        jsonValue(receipt.artifactReferences),
        receipt.actorType,
        receipt.actorIdHash ?? null,
        receipt.codeSha,
        receipt.evidenceLayer,
        jsonValue(receipt.statePatch ?? {}),
        receipt.startedAt,
        receipt.finishedAt,
        receipt.errorClass ?? null,
        receipt.retryDisposition,
        receipt.previousAuditChainHead ?? null,
        receipt.auditChainHead
      ]);
      await client.query(`
        UPDATE ${runsTable}
        SET audit_chain_head = $2, receipt_sequence = $3, updated_at = $4
        WHERE id = $1
      `, [receipt.runId, receipt.auditChainHead, receipt.sequence, receipt.finishedAt]);
      return { created: true, receipt };
    });
  }

  async function recordApproval(inputApproval: { teamId: string; approval: SenaWorkflowApproval }) {
    await ensureSchema();
    assertSenaWorkflowCheckpointSafe(inputApproval.approval, "approval");
    return inTransaction(pool, async (client) => {
      const runResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 AND team_id = $2 FOR UPDATE
      `, [inputApproval.approval.runId, inputApproval.teamId]);
      if (!runResult.rows[0]) throw missingRun();
      const current = normalizeRun(runResult.rows[0]);

      const duplicateResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${approvalsTable} WHERE run_id = $1 AND interrupt_id = $2 LIMIT 1
      `, [inputApproval.approval.runId, inputApproval.approval.interruptId]);
      if (duplicateResult.rows[0]) {
        const duplicate = normalizeApproval(duplicateResult.rows[0]);
        if (!sameCanonicalValue(duplicate, inputApproval.approval)) throw idempotencyConflict();
        return { created: false, approval: duplicate, run: current };
      }
      if (current.version !== inputApproval.approval.expectedVersion) throw optimisticConflict();

      const approval = inputApproval.approval;
      await client.query(`
        INSERT INTO ${approvalsTable} (
          id, schema_version, run_id, node_id, interrupt_id, expected_version,
          actor_user_id_hash, actor_role, decision, reason_code, input_digest,
          candidate_output_digest, decision_digest, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        approval.id,
        approval.schemaVersion,
        approval.runId,
        approval.nodeId,
        approval.interruptId,
        approval.expectedVersion,
        approval.actorUserIdHash,
        approval.actorRole,
        approval.decision,
        approval.reasonCode ?? null,
        approval.inputDigest,
        approval.candidateOutputDigest,
        approval.decisionDigest,
        approval.createdAt
      ]);
      const references = [...new Set([...current.approvalReferences, approval.id])];
      const updated = await client.query<Record<string, unknown>>(`
        UPDATE ${runsTable}
        SET version = version + 1, approval_references = $2::jsonb, updated_at = $3
        WHERE id = $1 AND version = $4
        RETURNING *
      `, [approval.runId, jsonValue(references), approval.createdAt, current.version]);
      if (!updated.rows[0]) throw optimisticConflict();
      return { created: true, approval, run: normalizeRun(updated.rows[0]) };
    });
  }

  async function recordApprovalAndEnqueueCommand(inputApprovalCommand: {
    teamId: string;
    approval: SenaWorkflowApproval;
    command: SenaWorkflowCommand;
  }) {
    await ensureSchema();
    const { approval, command } = inputApprovalCommand;
    const payload = command.payload;
    const invalidBinding =
      command.runId !== approval.runId ||
      command.kind !== "resume" ||
      command.expectedVersion !== approval.expectedVersion ||
      command.payloadDigest !== senaWorkflowDigest(payload) ||
      payload.interruptId !== approval.interruptId ||
      payload.decision !== approval.decision ||
      payload.decisionDigest !== approval.decisionDigest;
    if (invalidBinding) {
      throw new SenaWorkflowStoreError(
        "The SENA workflow approval and resume command are not bound to the same interrupt and decision.",
        422,
        "workflow_approval_command_binding_invalid"
      );
    }
    assertSenaWorkflowCheckpointSafe(approval, "approval");
    assertSenaWorkflowCheckpointSafe(command.payload, "command.payload");

    return inTransaction(pool, async (client) => {
      const runResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 AND team_id = $2 FOR UPDATE
      `, [approval.runId, inputApprovalCommand.teamId]);
      if (!runResult.rows[0]) throw missingRun();
      const current = normalizeRun(runResult.rows[0]);

      const [approvalResult, commandResult] = await Promise.all([
        client.query<Record<string, unknown>>(`
          SELECT * FROM ${approvalsTable} WHERE run_id = $1 AND interrupt_id = $2 LIMIT 1
        `, [approval.runId, approval.interruptId]),
        client.query<Record<string, unknown>>(`
          SELECT * FROM ${commandsTable} WHERE run_id = $1 AND idempotency_key = $2 LIMIT 1
        `, [command.runId, command.idempotencyKey])
      ]);
      const existingApproval = approvalResult.rows[0]
        ? normalizeApproval(approvalResult.rows[0])
        : undefined;
      const existingCommand = commandResult.rows[0]
        ? normalizeCommand(commandResult.rows[0])
        : undefined;
      if (existingApproval || existingCommand) {
        if (
          !existingApproval ||
          !existingCommand ||
          !sameCanonicalValue({
            schemaVersion: existingApproval.schemaVersion,
            runId: existingApproval.runId,
            nodeId: existingApproval.nodeId,
            interruptId: existingApproval.interruptId,
            expectedVersion: existingApproval.expectedVersion,
            actorUserIdHash: existingApproval.actorUserIdHash,
            actorRole: existingApproval.actorRole,
            decision: existingApproval.decision,
            reasonCode: existingApproval.reasonCode,
            inputDigest: existingApproval.inputDigest,
            candidateOutputDigest: existingApproval.candidateOutputDigest,
            decisionDigest: existingApproval.decisionDigest
          }, {
            schemaVersion: approval.schemaVersion,
            runId: approval.runId,
            nodeId: approval.nodeId,
            interruptId: approval.interruptId,
            expectedVersion: approval.expectedVersion,
            actorUserIdHash: approval.actorUserIdHash,
            actorRole: approval.actorRole,
            decision: approval.decision,
            reasonCode: approval.reasonCode,
            inputDigest: approval.inputDigest,
            candidateOutputDigest: approval.candidateOutputDigest,
            decisionDigest: approval.decisionDigest
          }) ||
          existingCommand.kind !== command.kind ||
          existingCommand.expectedVersion !== command.expectedVersion ||
          existingCommand.payloadDigest !== command.payloadDigest ||
          !sameCanonicalValue(existingCommand.payload, command.payload)
        ) throw idempotencyConflict();
        return {
          created: false,
          approval: existingApproval,
          command: existingCommand,
          run: current
        };
      }
      if (current.version !== approval.expectedVersion) throw optimisticConflict();

      await client.query(`
        INSERT INTO ${approvalsTable} (
          id, schema_version, run_id, node_id, interrupt_id, expected_version,
          actor_user_id_hash, actor_role, decision, reason_code, input_digest,
          candidate_output_digest, decision_digest, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        approval.id,
        approval.schemaVersion,
        approval.runId,
        approval.nodeId,
        approval.interruptId,
        approval.expectedVersion,
        approval.actorUserIdHash,
        approval.actorRole,
        approval.decision,
        approval.reasonCode ?? null,
        approval.inputDigest,
        approval.candidateOutputDigest,
        approval.decisionDigest,
        approval.createdAt
      ]);
      await insertCommand(client.query.bind(client), commandsTable, command);

      const references = [...new Set([...current.approvalReferences, approval.id])];
      const updated = await client.query<Record<string, unknown>>(`
        UPDATE ${runsTable}
        SET version = version + 1, approval_references = $2::jsonb, updated_at = $3
        WHERE id = $1 AND version = $4
        RETURNING *
      `, [approval.runId, jsonValue(references), approval.createdAt, current.version]);
      if (!updated.rows[0]) throw optimisticConflict();
      return {
        created: true,
        approval,
        command,
        run: normalizeRun(updated.rows[0])
      };
    });
  }

  async function appendArtifact(artifact: SenaWorkflowArtifact) {
    await ensureSchema();
    assertSenaWorkflowCheckpointSafe(artifact, "artifact");
    return inTransaction(pool, async (client) => {
      const runResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${runsTable} WHERE id = $1 FOR UPDATE
      `, [artifact.runId]);
      if (!runResult.rows[0]) throw missingRun();
      const current = normalizeRun(runResult.rows[0]);
      const duplicateResult = await client.query<Record<string, unknown>>(`
        SELECT * FROM ${artifactsTable}
        WHERE run_id = $1 AND node_id = $2 AND sha256 = $3
        LIMIT 1
      `, [artifact.runId, artifact.nodeId, artifact.sha256]);
      if (duplicateResult.rows[0]) {
        const duplicate = normalizeArtifact(duplicateResult.rows[0]);
        if (!sameCanonicalValue(duplicate, artifact)) throw idempotencyConflict();
        return { created: false, artifact: duplicate, run: current };
      }
      await client.query(`
        INSERT INTO ${artifactsTable} (
          id, run_id, node_id, filename, schema_version, sha256,
          storage_reference, evidence_layer, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        artifact.id,
        artifact.runId,
        artifact.nodeId,
        artifact.filename,
        artifact.schemaVersion,
        artifact.sha256,
        artifact.storageReference,
        artifact.evidenceLayer,
        artifact.createdAt
      ]);
      const references = [...new Set([...current.artifactReferences, artifact.id])];
      const updated = await client.query<Record<string, unknown>>(`
        UPDATE ${runsTable}
        SET artifact_references = $2::jsonb, updated_at = $3
        WHERE id = $1
        RETURNING *
      `, [artifact.runId, jsonValue(references), artifact.createdAt]);
      return { created: true, artifact, run: normalizeRun(updated.rows[0]) };
    });
  }

  async function runEvents(runId: string, teamId: string) {
    await ensureSchema();
    const run = await getRun(runId, teamId);
    if (!run) throw missingRun();
    const [commands, receipts, approvals, artifacts] = await Promise.all([
      pool.query<Record<string, unknown>>(`SELECT * FROM ${commandsTable} WHERE run_id = $1 ORDER BY created_at, id`, [runId]),
      pool.query<Record<string, unknown>>(`SELECT * FROM ${receiptsTable} WHERE run_id = $1 ORDER BY sequence`, [runId]),
      pool.query<Record<string, unknown>>(`SELECT * FROM ${approvalsTable} WHERE run_id = $1 ORDER BY created_at, id`, [runId]),
      pool.query<Record<string, unknown>>(`SELECT * FROM ${artifactsTable} WHERE run_id = $1 ORDER BY created_at, id`, [runId])
    ]);
    return {
      run,
      commands: commands.rows.map(normalizeCommand),
      receipts: receipts.rows.map(normalizeReceipt),
      approvals: approvals.rows.map(normalizeApproval),
      artifacts: artifacts.rows.map(normalizeArtifact)
    };
  }

  return {
    ensureSchema,
    createRunWithStartCommand,
    forkRun,
    getRun,
    listRuns,
    listWaitingJobRuns,
    enqueueCommand,
    claimNextCommand,
    completeCommand,
    failCommand,
    transitionRun,
    settleClaimedCommand,
    appendStepReceipt,
    recordApproval,
    recordApprovalAndEnqueueCommand,
    appendArtifact,
    runEvents
  };
}

async function insertRun(
  query: WorkflowQuery,
  runsTable: string,
  run: SenaWorkflowRun
) {
  return query<Record<string, unknown>>(`
    INSERT INTO ${runsTable} (
      id, schema_version, version, kind, definition_version, definition_hash, mode,
      team_id, project_id, project_revision_id, repo, base_sha, candidate_sha,
      source_binding_digest, code_sha, config_digest, status, current_node_id, pending_interrupt, attempt,
      blockers, job_references, artifact_references, approval_references, claim_boundary,
      evidence_layers, start_idempotency_key, start_payload_digest, created_by_user_id,
      audit_chain_head, receipt_sequence, parent_run_id, parent_checkpoint_id,
      superseded_by_run_id, created_at, updated_at, research_source_class
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,
      $21::jsonb,$22::jsonb,$23::jsonb,$24::jsonb,$25,$26::jsonb,$27,$28,$29,
      $30,$31,$32,$33,$34,$35,$36,$37
    )
    ON CONFLICT (team_id, start_idempotency_key) DO NOTHING
    RETURNING *
  `, [
    run.id,
    run.schemaVersion,
    run.version,
    run.kind,
    run.definitionVersion,
    run.definitionHash,
    run.mode,
    run.teamId,
    run.projectId ?? null,
    run.projectRevisionId ?? null,
    run.repo ?? null,
    run.baseSha ?? null,
    run.candidateSha ?? null,
    run.sourceBindingDigest,
    run.codeSha,
    run.configDigest,
    run.status,
    run.currentNodeId,
    run.pendingInterrupt ? jsonValue(run.pendingInterrupt) : null,
    run.attempt,
    jsonValue(run.blockers),
    jsonValue(run.jobReferences),
    jsonValue(run.artifactReferences),
    jsonValue(run.approvalReferences),
    run.claimBoundary ?? null,
    jsonValue(run.evidenceLayers),
    run.startIdempotencyKey,
    run.startPayloadDigest,
    run.createdByUserId,
    run.auditChainHead ?? null,
    run.receiptSequence,
    run.parentRunId ?? null,
    run.parentCheckpointId ?? null,
    run.supersededByRunId ?? null,
    run.createdAt,
    run.updatedAt,
    run.researchSourceClass ?? null
  ]);
}

async function insertCommand(
  query: WorkflowQuery,
  commandsTable: string,
  command: SenaWorkflowCommand
) {
  await query(`
    INSERT INTO ${commandsTable} (
      id, run_id, kind, expected_version, idempotency_key, payload_digest,
      payload, status, attempts, available_at, claimed_by, claimed_at,
      claim_expires_at, completed_at, error_class, error_hash, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
    )
  `, [
    command.id,
    command.runId,
    command.kind,
    command.expectedVersion,
    command.idempotencyKey,
    command.payloadDigest,
    jsonValue(command.payload),
    command.status,
    command.attempts,
    command.availableAt,
    command.claimedBy ?? null,
    command.claimedAt ?? null,
    command.claimExpiresAt ?? null,
    command.completedAt ?? null,
    command.errorClass ?? null,
    command.errorHash ?? null,
    command.createdAt,
    command.updatedAt
  ]);
}

export type SenaWorkflowPostgresStore = ReturnType<typeof createSenaWorkflowPostgresStore>;
export type SenaWorkflowPgPool = Pool;
export type SenaWorkflowPgClient = PoolClient;
