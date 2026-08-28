import { Pool, type PoolConfig } from "pg";
import {
  enterprisePostgresPoolOptions,
  resolveEnterprisePostgresConfig
} from "../enterprise-postgres";
import { createSenaWorkflowPostgresStore } from "./postgres-store";

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
