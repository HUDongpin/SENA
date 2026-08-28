import { enterprisePostgresPoolOptions } from "../lib/sena/enterprise-postgres";
import { createSenaWorkflowGraphNodeExecutor } from "../lib/sena/workflow/node-executor";
import { createEvidenceFlowPostgresSaver } from "../lib/sena/workflow/langgraph-compatibility";
import {
  createSenaWorkflowPostgresStoreFromEnv,
  senaWorkflowPostgresRuntimeStatus
} from "../lib/sena/workflow/postgres-runtime";
import { createSenaWorkflowServerJobOperationAdapter } from "../lib/sena/workflow/server-job-operations";
import { createSenaWorkflowWorkerRuntime } from "../lib/sena/workflow/worker-runtime";
import { recoverSenaWorkflowJobTerminalCommands } from "../lib/sena/workflow/job-terminal-bridge";
import { getEnterpriseServerJob } from "../lib/sena/enterprise/server-job-queue";

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function workerIdentity() {
  const configured = process.env.SENA_WORKFLOW_WORKER_ID?.trim();
  if (configured && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(configured)) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SENA_WORKFLOW_WORKER_ID is required for a production workflow worker.");
  }
  return `sena-workflow-worker-local-${process.pid}`;
}

function postgresConnectionString() {
  const options = enterprisePostgresPoolOptions();
  if (typeof options.connectionString !== "string" || !options.connectionString.trim()) {
    throw new Error("SENA EvidenceFlow worker requires the configured authoritative Postgres connection.");
  }
  return options.connectionString;
}

async function main() {
  const runtimeStatus = senaWorkflowPostgresRuntimeStatus();
  if (!runtimeStatus.configured) {
    throw new Error("SENA EvidenceFlow authoritative Postgres is not configured.");
  }
  const workerId = workerIdentity();
  const once = process.env.SENA_WORKFLOW_WORKER_ONCE === "1";
  const idlePollMs = positiveInteger(process.env.SENA_WORKFLOW_WORKER_POLL_MS, 500, 30_000);
  const maxAttempts = positiveInteger(process.env.SENA_WORKFLOW_WORKER_MAX_ATTEMPTS, 5, 20);
  const leaseMs = positiveInteger(process.env.SENA_WORKFLOW_WORKER_LEASE_MS, 30_000, 15 * 60_000);
  const { store, pool } = createSenaWorkflowPostgresStoreFromEnv();
  const checkpointer = createEvidenceFlowPostgresSaver(postgresConnectionString());
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await store.ensureSchema();
    await checkpointer.setup();
    const operations = createSenaWorkflowServerJobOperationAdapter({ store });
    const nodeExecutor = createSenaWorkflowGraphNodeExecutor({ store, operations });
    const worker = createSenaWorkflowWorkerRuntime({
      store,
      checkpointer,
      nodeExecutor,
      workerId,
      leaseMs,
      maxAttempts,
      onError(error) {
        const errorClass = error instanceof Error ? error.name : "UnknownError";
        process.stderr.write(`${JSON.stringify({
          event: "sena-workflow-worker-error",
          errorClass,
          payloadValuesExcluded: true,
          secretValuesExcluded: true
        })}\n`);
      }
    });
    process.stdout.write(`${JSON.stringify({
      event: "sena-workflow-worker-started",
      workerId,
      mode: "postgres-authoritative",
      checkpointSchema: "sena_langgraph",
      payloadValuesExcluded: true,
      secretValuesExcluded: true
    })}\n`);

    do {
      const recovery = await recoverSenaWorkflowJobTerminalCommands({
        store,
        readServerJob: getEnterpriseServerJob,
        limit: 100
      });
      const recoveryFailures = recovery.outcomes.filter((outcome) => outcome.status === "recovery-failed");
      if (recoveryFailures.length > 0) {
        process.stderr.write(`${JSON.stringify({
          event: "sena-workflow-worker-job-wake-recovery",
          status: "failed",
          waitingRunCount: recovery.waitingRunCount,
          failureCount: recoveryFailures.length,
          errorHashes: recoveryFailures.map((outcome) => outcome.errorHash),
          payloadValuesExcluded: true,
          secretValuesExcluded: true
        })}\n`);
      }
      const result = await worker.runOnce();
      if (result.status !== "idle") {
        process.stdout.write(`${JSON.stringify({
          event: "sena-workflow-worker-command",
          status: result.status,
          commandStatus: result.command.status,
          retryScheduled: result.status === "failed" ? result.retryScheduled : false,
          payloadValuesExcluded: true,
          secretValuesExcluded: true
        })}\n`);
      }
      if (once) break;
      if (result.status === "idle" && !stopping) {
        await new Promise((resolve) => setTimeout(resolve, idlePollMs));
      }
    } while (!stopping);
  } finally {
    await checkpointer.end().catch(() => undefined);
    await pool.end();
  }
}

main().catch((error) => {
  const errorClass = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`${JSON.stringify({
    event: "sena-workflow-worker-fatal",
    errorClass,
    payloadValuesExcluded: true,
    secretValuesExcluded: true
  })}\n`);
  process.exitCode = 1;
});
