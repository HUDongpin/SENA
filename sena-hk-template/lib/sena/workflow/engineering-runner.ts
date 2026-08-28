import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { senaWorkflowDigest } from "./canonical";
import type {
  SenaEngineeringCommandExecutor,
  SenaEngineeringCommandSpec,
  SenaEngineeringEvidenceParameters,
  SenaEngineeringRunBinding
} from "./engineering-evidence";

const MAX_HASHED_LOG_BYTES = 4 * 1024 * 1024;
const TERMINATION_GRACE_MS = 5_000;
const SAFE_ENVIRONMENT_KEYS = [
  "PATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT"
] as const;

function engineeringChildEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): NodeJS.ProcessEnv {
  const safe: Record<string, string> = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value) safe[key] = value;
  }
  return {
    ...safe,
    NODE_ENV: "test",
    CI: "1",
    NO_UPDATE_NOTIFIER: "1",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    SENA_EVIDENCEFLOW_MODE: "shadow",
    SENA_EXTERNAL_SIDE_EFFECTS_AUTHORIZED: "0"
  };
}

function environmentForCommand(base: NodeJS.ProcessEnv, command: SenaEngineeringCommandSpec): NodeJS.ProcessEnv {
  return {
    ...base,
    NODE_ENV: command.gate === "build" || command.gate === "pilot-verify" ? "production" : "test"
  };
}

function assertNoRuntimeEnvironmentFiles(appRoot: string) {
  const forbidden = readdirSync(appRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(".env") && ![".env.example", ".env.sample"].includes(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (forbidden.length > 0) {
    throw new Error("SENA engineering verification refuses a worktree with runtime environment files.");
  }
}

function commandTimeoutMs(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const parsed = Number(env.SENA_ENGINEERING_COMMAND_TIMEOUT_MS);
  return Number.isFinite(parsed)
    ? Math.max(60_000, Math.min(Math.trunc(parsed), 60 * 60_000))
    : 30 * 60_000;
}

async function runProcess(input: {
  command: SenaEngineeringCommandSpec;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}) {
  const startedAt = new Date().toISOString();
  const digest = createHash("sha256");
  let bytes = 0;
  const executable = input.command.fixture && input.command.executable === "node"
    ? process.execPath
    : input.command.executable;
  const child = spawn(executable, input.command.args, {
    cwd: input.cwd,
    env: input.env,
    detached: process.platform !== "win32",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let outputLimitExceeded = false;
  const absorb = (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MAX_HASHED_LOG_BYTES) outputLimitExceeded = true;
    if (outputLimitExceeded) return;
    digest.update(chunk);
  };
  child.stdout.on("data", absorb);
  child.stderr.on("data", absorb);
  const exitCode = await new Promise<number>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let terminationRequested = false;
    let escalationTimer: NodeJS.Timeout | undefined;
    const signalProcess = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        // The process may have exited between observation and signalling.
      }
    };
    const requestTermination = () => {
      if (terminationRequested) return;
      terminationRequested = true;
      signalProcess("SIGTERM");
      escalationTimer = setTimeout(() => signalProcess("SIGKILL"), TERMINATION_GRACE_MS);
      escalationTimer.unref?.();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, input.timeoutMs);
    timer.unref?.();
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (escalationTimer) clearTimeout(escalationTimer);
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (escalationTimer) clearTimeout(escalationTimer);
      resolve(outputLimitExceeded ? 125 : timedOut ? 124 : code ?? 1);
    });
    const outputGuard = setInterval(() => {
      if (outputLimitExceeded) requestTermination();
      if (settled) clearInterval(outputGuard);
    }, 25);
    outputGuard.unref?.();
  });
  return {
    exitCode,
    startedAt,
    finishedAt: new Date().toISOString(),
    logSummaryDigest: digest.digest("hex")
  };
}

async function gitText(cwd: string, args: string[]) {
  const output: Buffer[] = [];
  const child = spawn("git", ["-C", cwd, ...args], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => output.push(Buffer.from(chunk)));
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error("SENA engineering runner could not verify the Git worktree binding.");
  return Buffer.concat(output).toString("utf8").trim();
}

function samePaths(left: string[], right: string[]) {
  return [...new Set(left)].sort().join("\n") === [...new Set(right)].sort().join("\n");
}

export async function createSenaEngineeringCommandExecutor(input: {
  evidence: SenaEngineeringEvidenceParameters;
  binding: SenaEngineeringRunBinding;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<SenaEngineeringCommandExecutor> {
  const env = input.env ?? process.env;
  const childEnv = engineeringChildEnvironment(env);
  if (input.evidence.targetKind === "fixture-repository") {
    return (command) => runProcess({
      command,
      cwd: process.cwd(),
      env: environmentForCommand(childEnv, command),
      timeoutMs: commandTimeoutMs(env)
    });
  }

  const configured = env.SENA_ENGINEERING_WORKTREE_PATH?.trim();
  if (!configured) throw new Error("SENA engineering local verification worktree is not configured.");
  const resolved = realpathSync(configured);
  if (!statSync(resolved).isDirectory() || senaWorkflowDigest(resolved) !== input.evidence.worktreePathHash) {
    throw new Error("SENA engineering worktree path does not match its redacted binding.");
  }
  const appRoot = existsSync(path.join(resolved, "package.json"))
    ? resolved
    : path.join(resolved, "sena-hk-template");
  if (!existsSync(path.join(appRoot, "package.json"))) {
    throw new Error("SENA engineering worktree does not contain the runnable application root.");
  }
  assertNoRuntimeEnvironmentFiles(appRoot);
  const [head, branch, changed, trackedStatus] = await Promise.all([
    gitText(appRoot, ["rev-parse", "HEAD"]),
    gitText(appRoot, ["branch", "--show-current"]),
    gitText(appRoot, ["diff", "--name-only", `${input.binding.baseSha}...${input.binding.candidateSha}`]),
    gitText(appRoot, ["status", "--porcelain=v1", "--untracked-files=no"])
  ]);
  if (head !== input.binding.candidateSha || branch !== input.evidence.branch || trackedStatus !== "") {
    throw new Error("SENA engineering exact candidate worktree is not clean or does not match its binding.");
  }
  const changedPaths = changed ? changed.split("\n").filter(Boolean) : [];
  if (!samePaths(changedPaths, input.evidence.candidateReceipt.changedPaths)) {
    throw new Error("SENA engineering changed-path evidence does not match the exact Git range.");
  }

  return async (command) => {
    const result = await runProcess({
      command,
      cwd: appRoot,
      env: environmentForCommand(childEnv, command),
      timeoutMs: commandTimeoutMs(env)
    });
    const [freshHead, freshStatus] = await Promise.all([
      gitText(appRoot, ["rev-parse", "HEAD"]),
      gitText(appRoot, ["status", "--porcelain=v1", "--untracked-files=no"])
    ]);
    if (freshHead !== input.binding.candidateSha || freshStatus !== "") {
      throw new Error("SENA engineering verification changed or drifted the tracked candidate worktree.");
    }
    return result;
  };
}
