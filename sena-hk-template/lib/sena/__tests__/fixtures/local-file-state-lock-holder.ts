import fs from "node:fs";
import path from "node:path";
import { createFileEnterpriseStateStore, emptyEnterpriseDb } from "../../enterprise/state";

const [enterpriseDbDir, readyPath] = process.argv.slice(2);
if (!enterpriseDbDir || !readyPath) {
  throw new Error("File-state lock holder requires a database directory and ready path.");
}

const store = createFileEnterpriseStateStore({
  dbDir: enterpriseDbDir,
  lockTimeoutMs: 20_000,
  lockPollMs: 5,
  lockStaleMs: 10,
  createEmptyDb: emptyEnterpriseDb
});

store.mutateAtomically(() => {
  fs.writeFileSync(readyPath, path.basename(store.paths.lockPath));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);
});
