import {
  drainEnterpriseServerJobQueue,
  senaServerJobWorkerExecutableKinds
} from "../lib/sena/enterprise/server-job-worker-runtime";
import {
  senaEnterpriseServerJobKinds,
  type SenaEnterpriseServerJobKind
} from "../lib/sena/enterprise/server-job-queue";

/**
 * Runs the in-repo SENA server job worker against the queued job store.
 *
 * The queue's production path is push: the provider POSTs a signed webhook to
 * /api/sena/ops/jobs/worker, which executes the delivered payload. This script
 * is the pull half, for `local` queue mode (where no webhook is ever dispatched)
 * and for draining a backlog by hand. Because the job store never keeps the raw
 * payload, the drain only runs jobs whose payload it can reproduce byte-for-byte
 * against the recorded payloadSha256. An irreproducible retained command is
 * atomically terminalized before claim, with attempts unchanged, instead of
 * being left queued indefinitely or silently reinterpreted for the push path.
 */

type WorkerOptions = {
  limit: number;
  teamId?: string;
  kind?: SenaEnterpriseServerJobKind;
  intervalMs?: number;
  json: boolean;
};

function usage() {
  console.log([
    "Usage: npm run sena:jobs:worker-run -- [options]",
    "",
    "  --limit=<n>       Maximum queued jobs to scan per pass (default 25).",
    "  --team=<teamId>   Restrict the drain to one team.",
    `  --kind=<kind>     Restrict the drain to one job kind (${senaEnterpriseServerJobKinds.join(", ")}).`,
    "  --interval=<ms>   Keep polling on this interval instead of running one pass.",
    "  --json            Print the raw drain report instead of a summary.",
    "  --help            Show this message.",
    "",
    `Executable kinds in this repository: ${senaServerJobWorkerExecutableKinds.join(", ")}.`,
    "Other kinds are left queued and reported; they need an executor that does not exist yet."
  ].join("\n"));
}

function parseOptions(argv: string[]): WorkerOptions | undefined {
  const options: WorkerOptions = { limit: 25, json: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return undefined;
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const [flag, rawValue] = arg.split("=", 2);
    const value = rawValue?.trim();
    if (flag === "--limit" && value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      options.limit = Math.trunc(parsed);
      continue;
    }
    if (flag === "--team" && value) {
      options.teamId = value;
      continue;
    }
    if (flag === "--kind" && value) {
      if (!(senaEnterpriseServerJobKinds as readonly string[]).includes(value)) {
        throw new Error(`--kind must be one of ${senaEnterpriseServerJobKinds.join(", ")}.`);
      }
      options.kind = value as SenaEnterpriseServerJobKind;
      continue;
    }
    if (flag === "--interval" && value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 250) {
        throw new Error("--interval must be at least 250 (milliseconds).");
      }
      options.intervalMs = Math.trunc(parsed);
      continue;
    }
    throw new Error(`Unrecognized option: ${arg}`);
  }
  return options;
}

async function runPass(options: WorkerOptions) {
  const report = await drainEnterpriseServerJobQueue({
    limit: options.limit,
    teamId: options.teamId,
    kind: options.kind
  });

  if (options.json) {
    // Job ids and error hashes only — payload values never reach this report.
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log([
      `SENA job worker pass ${report.generatedAt}:`,
      `scanned=${report.scanned}`,
      `succeeded=${report.succeeded}`,
      `failed=${report.failed}`,
      `skipped=${report.skipped}`
    ].join(" "));
    for (const outcome of report.outcomes) {
      if (outcome.status === "succeeded") continue;
      const detail = outcome.status === "failed"
        ? `errorCode=${outcome.errorCode} errorHash=${outcome.errorHash}`
        : `reason=${outcome.skipReason}`;
      console.log(`  ${outcome.status} ${outcome.kind} ${outcome.jobId} ${detail}`);
    }
  }
  return report;
}

let options: WorkerOptions | undefined;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

if (!options) {
  usage();
  process.exit(0);
}

if (options.intervalMs === undefined) {
  const report = await runPass(options);
  // A failed job is a real failure the operator has to see; skipped jobs are
  // not, they simply have no executor here yet.
  process.exit(report.failed > 0 ? 1 : 0);
}

const intervalMs = options.intervalMs;
const pollOptions = options;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    console.log(`SENA job worker received ${signal}; finishing the current pass.`);
  });
}
console.log(`SENA job worker polling every ${intervalMs}ms. Press Ctrl+C to stop.`);
while (!stopping) {
  try {
    await runPass(pollOptions);
  } catch (error) {
    // One bad pass must not kill the loop; the next tick retries.
    console.error("SENA job worker pass failed:", error instanceof Error ? error.message : String(error));
  }
  if (stopping) break;
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
