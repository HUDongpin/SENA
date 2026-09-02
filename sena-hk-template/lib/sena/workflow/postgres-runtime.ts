import { Pool, type PoolConfig } from "pg";
import {
  enterprisePostgresPoolOptions,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { createSenaWorkflowPostgresStore } from "./postgres-store";
import { createEvidenceFlowPostgresSaver } from "./langgraph-compatibility";
import { senaWorkflowDigest } from "./canonical";

export type SenaWorkflowCheckpointBinding = {
  checkpointId: string;
  runId: string;
  definitionHash: string;
  sourceBindingDigest: string;
  codeSha: string;
  configDigest: string;
  stateDigest: string;
};

function checkpointRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function checkpointStrings(value: unknown) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : [];
}

/** Canonical, checkpoint-safe projection shared by API fork validation. */
export function senaWorkflowCheckpointStateDigest(state: Record<string, unknown>) {
  return senaWorkflowDigest({
    runId: typeof state.runId === "string" ? state.runId : "",
    kind: typeof state.kind === "string" ? state.kind : "",
    teamId: typeof state.teamId === "string" ? state.teamId : "",
    definitionHash: typeof state.definitionHash === "string" ? state.definitionHash : "",
    sourceBindingDigest: typeof state.sourceBindingDigest === "string" ? state.sourceBindingDigest : "",
    codeSha: typeof state.codeSha === "string" ? state.codeSha : "",
    configDigest: typeof state.configDigest === "string" ? state.configDigest : "",
    workflowStatus: typeof state.workflowStatus === "string" ? state.workflowStatus : "",
    claimBoundary: typeof state.claimBoundary === "string" ? state.claimBoundary : null,
    evidenceLayers: checkpointRecord(state.evidenceLayers),
    completedNodeIds: checkpointStrings(state.completedNodeIds),
    nodeReceiptHashes: checkpointRecord(state.nodeReceiptHashes),
    nodeOutputDigests: checkpointRecord(state.nodeOutputDigests),
    artifactReferences: checkpointStrings(state.artifactReferences),
    jobReferences: checkpointStrings(state.jobReferences),
    approvalReferences: checkpointStrings(state.approvalReferences),
    blockers: Array.isArray(state.blockers) ? state.blockers : []
  });
}

export function senaWorkflowPostgresRuntimeStatus(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  const enterprise = resolveEnterprisePostgresConfig(env);
  return {
    configured: enterprise.configured,
    mode: enterprise.configured ? "postgres-authoritative" as const : "not-configured" as const,
    connectionHash: enterprise.connectionHash,
    missing: enterprise.missingEnv,
    evidence: [
      ...enterprise.evidence,
      "workflowStore=postgres-only",
      "fileFallback=disabled",
      "langGraphCheckpointSchema=sena_langgraph"
    ],
    redaction: {
      connectionValueExcluded: true as const,
      secretValuesExcluded: true as const
    }
  };
}

export function createSenaWorkflowPostgresStoreFromEnv(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  poolFactory?: (options: PoolConfig) => Pool;
  schemaName?: string;
} = {}) {
  const poolOptions = enterprisePostgresPoolOptions(input.env);
  const pool = (input.poolFactory ?? ((options: PoolConfig) => new Pool(options)))(poolOptions);
  const store = createSenaWorkflowPostgresStore({ pool, schemaName: input.schemaName });
  return { store, pool, poolOptions };
}

export async function senaWorkflowCheckpointExists(input: {
  runId: string;
  checkpointId: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}) {
  const options = enterprisePostgresPoolOptions(input.env);
  if (typeof options.connectionString !== "string" || !options.connectionString.trim()) {
    throw new Error("SENA EvidenceFlow checkpoint lookup requires a Postgres connection string.");
  }
  const saver = createEvidenceFlowPostgresSaver(options.connectionString);
  try {
    const tuple = await saver.getTuple({
      configurable: {
        thread_id: input.runId,
        checkpoint_id: input.checkpointId
      }
    });
    return Boolean(tuple);
  } finally {
    await saver.end().catch(() => undefined);
  }
}

export async function senaWorkflowCheckpointBinding(input: {
  runId: string;
  checkpointId: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<SenaWorkflowCheckpointBinding | null> {
  const options = enterprisePostgresPoolOptions(input.env);
  if (typeof options.connectionString !== "string" || !options.connectionString.trim()) {
    throw new Error("SENA EvidenceFlow checkpoint lookup requires a Postgres connection string.");
  }
  const saver = createEvidenceFlowPostgresSaver(options.connectionString);
  try {
    const tuple = await saver.getTuple({
      configurable: {
        thread_id: input.runId,
        checkpoint_id: input.checkpointId
      }
    });
    if (!tuple) return null;
    const checkpoint = tuple.checkpoint as unknown as { channel_values?: Record<string, unknown> };
    const state = checkpoint.channel_values ?? {};
    const runId = typeof state.runId === "string" ? state.runId : "";
    const definitionHash = typeof state.definitionHash === "string" ? state.definitionHash : "";
    const sourceBindingDigest = typeof state.sourceBindingDigest === "string" ? state.sourceBindingDigest : "";
    const codeSha = typeof state.codeSha === "string" ? state.codeSha : "";
    const configDigest = typeof state.configDigest === "string" ? state.configDigest : "";
    if (!runId || !definitionHash || !sourceBindingDigest || !codeSha || !configDigest) return null;
    const stateDigest = senaWorkflowCheckpointStateDigest(state);
    return {
      checkpointId: input.checkpointId,
      runId,
      definitionHash,
      sourceBindingDigest,
      codeSha,
      configDigest,
      stateDigest
    };
  } finally {
    await saver.end().catch(() => undefined);
  }
}
