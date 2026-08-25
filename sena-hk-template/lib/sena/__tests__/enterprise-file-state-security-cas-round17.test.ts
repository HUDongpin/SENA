import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveInstalledPackageFile } from "../../../scripts/resolve-installed-package-file";

const viteNodePath = resolveInstalledPackageFile("vite-node", "vite-node.mjs", import.meta.url);
const contenderPath = path.join(
  process.cwd(),
  "lib/sena/__tests__/fixtures/local-auth-security-contender.ts"
);
const lockHolderPath = path.join(
  process.cwd(),
  "lib/sena/__tests__/fixtures/local-file-state-lock-holder.ts"
);
const tempDirs: string[] = [];
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function totpCode(secret: string) {
  const normalized = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    buffer = (buffer << 5) | base32Alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function tempDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function waitForFiles(paths: string[], timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (!paths.every(existsSync)) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting for auth security contenders.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function spawnContender(input: {
  mode: "login" | "rate-limit" | "csrf" | "mfa";
  contenderId: string;
  coordinationDir: string;
  enterpriseDbDir: string;
  contextPath?: string;
}) {
  const child = spawn(process.execPath, [
    viteNodePath,
    "--script",
    contenderPath,
    input.mode,
    input.contenderId,
    input.coordinationDir,
    input.contextPath ?? ""
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SENA_ENTERPRISE_DB_DIR: input.enterpriseDbDir,
      SENA_ENTERPRISE_STATE_STORE: "",
      SENA_ENTERPRISE_DB_ADAPTER: "",
      DATABASE_URL: "",
      SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS: "20000",
      SENA_AUTH_LOCKOUT_MAX_FAILURES: "5"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const completion = new Promise<Record<string, unknown>>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Auth security contender ${input.contenderId} exited ${code}: ${stderr || stdout}`));
        return;
      }
      const payload = stdout.match(/SECURITY_MUTATION_RESULT:(\{.*\})/)?.[1];
      if (!payload) {
        reject(new Error(`Auth security contender ${input.contenderId} omitted its result: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(payload) as Record<string, unknown>);
    });
  });
  return { child, completion };
}

afterEach(() => {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS;
  delete process.env.SENA_AUTH_LOCKOUT_MAX_FAILURES;
  vi.resetModules();
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("enterprise auth security state serialization", () => {
  it.each(["login", "rate-limit"] as const)(
    "serializes cross-process %s counters without surfacing state CAS conflicts",
    async (mode) => {
      const enterpriseDbDir = tempDir(`sena-auth-cas-${mode}-`);
      const coordinationDir = tempDir(`sena-auth-cas-coordination-${mode}-`);
      process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
      process.env.SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS = "20000";
      process.env.SENA_AUTH_LOCKOUT_MAX_FAILURES = "5";
      vi.resetModules();
      const enterprise = await import("../enterprise");
      if (mode === "login") {
        enterprise.registerEnterpriseUser({
          name: "Concurrent Lockout",
          email: "concurrent-lockout@example.edu",
          password: "sena-secure-123",
          organization: "Security CAS Lab"
        });
      } else {
        // Initialize the state file before the parent-owned lock blocks every
        // contender at the mutation boundary.
        enterprise.readEnterpriseDb();
      }

      const lockPath = path.join(enterpriseDbDir, "enterprise-db.json.lock");
      writeFileSync(lockPath, `${process.pid}:${Date.now()}:parent-test-lock`);
      const contenders = Array.from({ length: 5 }, (_, index) => spawnContender({
        mode,
        contenderId: String(index + 1),
        coordinationDir,
        enterpriseDbDir
      }));
      await waitForFiles(contenders.map((_, index) => path.join(coordinationDir, `ready-${index + 1}`)));
      // On the old read-then-save path every process has now taken the same
      // stale snapshot and is waiting to write it. The fixed path is waiting
      // before its read and therefore observes each predecessor's increment.
      await new Promise((resolve) => setTimeout(resolve, 250));
      unlinkSync(lockPath);
      const results = await Promise.all(contenders.map((entry) => entry.completion));

      expect(results.some((entry) => String(entry.code).includes("state_revision_conflict"))).toBe(false);
      const persisted = JSON.parse(readFileSync(path.join(enterpriseDbDir, "enterprise-db.json"), "utf8")) as {
        authLockouts?: Array<{ failedCount: number }>;
        apiRateLimits?: Array<{ bucket: string; requestCount: number }>;
        auditLog?: Array<{ event: string }>;
      };
      if (mode === "login") {
        expect(results.map((entry) => entry.code).sort()).toEqual([
          "auth_locked",
          "invalid_credentials",
          "invalid_credentials",
          "invalid_credentials",
          "invalid_credentials"
        ]);
        expect(persisted.authLockouts).toEqual([expect.objectContaining({ failedCount: 5 })]);
        expect(persisted.auditLog?.filter((entry) => entry.event === "auth.login.failed")).toHaveLength(5);
      } else {
        expect(results.filter((entry) => entry.status === "accepted")).toHaveLength(4);
        expect(results.filter((entry) => entry.code === "api_rate_limited")).toHaveLength(1);
        expect(persisted.apiRateLimits?.find((entry) => entry.bucket === "auth.concurrent"))
          .toEqual(expect.objectContaining({ requestCount: 5 }));
        expect(persisted.auditLog?.filter((entry) => entry.event === "security.rate_limit")).toHaveLength(1);
      }
    },
    30_000
  );

  it.each(["csrf", "mfa"] as const)(
    "persists every concurrent invalid %s audit while preserving the domain error",
    async (mode) => {
      const enterpriseDbDir = tempDir(`sena-auth-cas-${mode}-`);
      const coordinationDir = tempDir(`sena-auth-cas-coordination-${mode}-`);
      const contextPath = path.join(coordinationDir, "context.json");
      process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
      process.env.SENA_ENTERPRISE_DB_LOCK_TIMEOUT_MS = "20000";
      vi.resetModules();
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: `Concurrent ${mode}`,
        email: `concurrent-${mode}@example.edu`,
        password: "sena-secure-123",
        organization: "Security CAS Lab"
      });
      if (mode === "mfa") {
        const setup = enterprise.createEnterpriseMfaSetup(registered.context);
        // The fixture only needs an enabled factor; use the recovery code path
        // to avoid copying a live TOTP secret into child arguments or output.
        enterprise.enableEnterpriseMfa(registered.context, {
          setupToken: setup.setupToken,
          code: totpCode(setup.secret)
        });
      }
      writeFileSync(contextPath, JSON.stringify(registered.context));

      const lockPath = path.join(enterpriseDbDir, "enterprise-db.json.lock");
      writeFileSync(lockPath, `${process.pid}:${Date.now()}:parent-test-lock`);
      const contenders = Array.from({ length: 5 }, (_, index) => spawnContender({
        mode,
        contenderId: String(index + 1),
        coordinationDir,
        enterpriseDbDir,
        contextPath
      }));
      await waitForFiles(contenders.map((_, index) => path.join(coordinationDir, `ready-${index + 1}`)));
      await new Promise((resolve) => setTimeout(resolve, 250));
      unlinkSync(lockPath);
      const results = await Promise.all(contenders.map((entry) => entry.completion));

      const expectedCode = mode === "csrf" ? "csrf_invalid" : "invalid_mfa_code";
      expect(results.map((entry) => entry.code)).toEqual(Array(5).fill(expectedCode));
      const persisted = JSON.parse(readFileSync(path.join(enterpriseDbDir, "enterprise-db.json"), "utf8")) as {
        auditLog?: Array<{ event: string; detail?: { phase?: string; success?: boolean } }>;
      };
      const audits = mode === "csrf"
        ? persisted.auditLog?.filter((entry) => entry.event === "security.csrf.fail")
        : persisted.auditLog?.filter((entry) => entry.event === "auth.mfa.verify" &&
          entry.detail?.phase === "disable" && entry.detail?.success === false);
      expect(audits).toHaveLength(5);
    },
    30_000
  );
});

describe("enterprise file-state crash lock recovery", () => {
  it("fails closed on the real lock left after its owning process is killed", async () => {
    const dbDir = tempDir("sena-killed-file-lock-");
    const coordinationDir = tempDir("sena-killed-file-lock-coordination-");
    const readyPath = path.join(coordinationDir, "lock-held");
    vi.resetModules();
    const state = await import("../enterprise/state");
    const store = state.createFileEnterpriseStateStore({
      dbDir,
      lockTimeoutMs: 100,
      lockPollMs: 5,
      lockStaleMs: 0,
      createEmptyDb: state.emptyEnterpriseDb
    });
    store.read();

    const holder = spawn(process.execPath, [
      viteNodePath,
      "--script",
      lockHolderPath,
      dbDir,
      readyPath
    ], {
      cwd: process.cwd(),
      env: { ...process.env, SENA_ENTERPRISE_DB_DIR: dbDir },
      stdio: ["ignore", "pipe", "pipe"]
    });
    try {
      await waitForFiles([readyPath]);
      expect(readFileSync(store.paths.lockPath, "utf8")).toMatch(new RegExp(`^${holder.pid}:`));
      const closed = new Promise<void>((resolve) => holder.once("close", () => resolve()));
      expect(holder.kill("SIGKILL")).toBe(true);
      await closed;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const orphanedLock = readFileSync(store.paths.lockPath, "utf8");
      expect(() => store.mutateAtomically((db) => db.users.length)).toThrow(/Timed out/);
      expect(readFileSync(store.paths.lockPath, "utf8")).toBe(orphanedLock);
    } finally {
      if (holder.exitCode === null && holder.signalCode === null) holder.kill("SIGKILL");
    }
  }, 20_000);

  it("does not unlink a stale lock owned by a dead process", async () => {
    const dbDir = tempDir("sena-dead-file-lock-");
    vi.resetModules();
    const state = await import("../enterprise/state");
    const store = state.createFileEnterpriseStateStore({
      dbDir,
      lockTimeoutMs: 50,
      lockPollMs: 10,
      lockStaleMs: 0,
      createEmptyDb: state.emptyEnterpriseDb
    } as never);
    store.read();
    writeFileSync(store.paths.lockPath, `99999999:${Date.now() - 10_000}:dead-owner`);

    const orphanedLock = readFileSync(store.paths.lockPath, "utf8");
    expect(() => store.mutateAtomically((db) => db.users.length)).toThrow(/Timed out/);
    expect(readFileSync(store.paths.lockPath, "utf8")).toBe(orphanedLock);
  });

  it("does not reclaim an old lock while its owning process is alive", async () => {
    const dbDir = tempDir("sena-live-file-lock-");
    vi.resetModules();
    const state = await import("../enterprise/state");
    const store = state.createFileEnterpriseStateStore({
      dbDir,
      lockTimeoutMs: 50,
      lockPollMs: 5,
      lockStaleMs: 5,
      createEmptyDb: state.emptyEnterpriseDb
    } as never);
    store.read();
    writeFileSync(store.paths.lockPath, `${process.pid}:${Date.now() - 10_000}:live-owner`);

    expect(() => store.mutateAtomically((db) => db.users.length)).toThrow(/Timed out/);
    expect(existsSync(store.paths.lockPath)).toBe(true);
  });
});
