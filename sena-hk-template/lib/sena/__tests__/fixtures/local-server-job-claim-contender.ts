import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";

const [mode, contenderId, jobId, coordinationDir, workerPayloadPath] = process.argv.slice(2);
if ((mode !== "claim" && mode !== "worker") || !contenderId || !jobId || !coordinationDir) {
  throw new Error("Local claim contender requires mode, contenderId, jobId, and coordinationDir.");
}

const databasePath = path.join(String(process.env.SENA_ENTERPRISE_DB_DIR), "enterprise-db.json");
const originalReadFileSync = fs.readFileSync.bind(fs);
let coordinateUnlockedRead = false;
let coordinated = false;
let databaseReadCount = 0;

function waitForFile(filePath: string, timeoutMs = 20_000) {
  const startedAt = Date.now();
  const waiter = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(filePath)) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for claim coordination file ${path.basename(filePath)}.`);
    }
    Atomics.wait(waiter, 0, 0, 10);
  }
}

// The RED version reads outside the file-store write lock. Hold both real
// processes after that read so both can truthfully return claimed=true from the
// same queued snapshot. Once the lock-scoped mutation primitive exists, this
// hook stays dormant and the same process race exercises the production CAS.
fs.readFileSync = ((filePath: fs.PathOrFileDescriptor, ...args: unknown[]) => {
  const result = (originalReadFileSync as (...input: unknown[]) => unknown)(filePath, ...args);
  if (String(filePath) === databasePath) databaseReadCount += 1;
  const coordinatedReadNumber = mode === "worker" ? 5 : 1;
  if (coordinateUnlockedRead && !coordinated && String(filePath) === databasePath &&
    databaseReadCount === coordinatedReadNumber) {
    coordinated = true;
    fs.writeFileSync(path.join(coordinationDir, `read-${contenderId}`), "ready");
    waitForFile(path.join(coordinationDir, "release-readers"));
  }
  return result;
}) as typeof fs.readFileSync;
syncBuiltinESMExports();

const state = await import("../../enterprise/state");
const queue = await import("../../enterprise/server-job-queue");
const runtime = mode === "worker" ? await import("../../enterprise/server-job-worker-runtime") : undefined;
coordinateUnlockedRead = !("mutateEnterpriseDbAtomically" in state);

// Load the candidate before resetting the read counter. A pointer-backed
// reliability worker then performs candidate lookup, read-only context
// construction, upload metadata/content admission, and finally the old claim
// read as database reads 1 through 5 respectively.
const job = mode === "worker" ? await queue.getEnterpriseServerJob(jobId) : undefined;
const workerPayload = mode === "worker" && workerPayloadPath
  ? JSON.parse(originalReadFileSync(workerPayloadPath, "utf8")) as Record<string, unknown>
  : undefined;
if (mode === "worker" && !workerPayload) {
  throw new Error("Worker contender requires a canonical worker payload file.");
}
databaseReadCount = 0;

fs.writeFileSync(path.join(coordinationDir, `ready-${contenderId}`), "ready");
waitForFile(path.join(coordinationDir, "start"));

const result = mode === "worker"
  ? await runtime!.runEnterpriseServerJob({
      job: job!,
      workerPayload: workerPayload!,
      runId: `worker_run_process_${contenderId}`
    })
  : await queue.claimEnterpriseServerJob({
      jobId,
      workerRunId: `worker_run_process_${contenderId}`
    });
process.stdout.write(`CLAIM_RESULT:${JSON.stringify(result)}\n`);
