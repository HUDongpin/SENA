import { Pool, type PoolConfig } from "pg";
import {
  enterprisePostgresPoolOptions,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { createSenaWorkflowPostgresStore } from "./postgres-store";
import { createEvidenceFlowPostgresSaver } from "./langgraph-compatibility";

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
