import fs from "node:fs";
import path from "node:path";

const [coordinationDir] = process.argv.slice(2);
if (!coordinationDir) throw new Error("Local stale writer requires a coordination directory.");

function waitForFile(filePath: string, timeoutMs = 20_000) {
  const startedAt = Date.now();
  const waiter = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(filePath)) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for stale-writer coordination file ${path.basename(filePath)}.`);
    }
    Atomics.wait(waiter, 0, 0, 10);
  }
}

const state = await import("../../enterprise/state");
const staleDb = state.readEnterpriseDb();
const firstTeam = staleDb.teams[0];
if (!firstTeam) throw new Error("Stale writer fixture requires one enterprise team.");
firstTeam.name = "Stale ordinary writer must not win";

fs.writeFileSync(path.join(coordinationDir, "stale-writer-ready"), "ready");
waitForFile(path.join(coordinationDir, "release-stale-writer"));

try {
  state.writeEnterpriseDb(staleDb);
  process.stdout.write(`STALE_WRITE_RESULT:${JSON.stringify({ written: true })}\n`);
} catch (error) {
  process.stdout.write(`STALE_WRITE_RESULT:${JSON.stringify({
    written: false,
    code: error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined,
    status: error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined
  })}\n`);
}
