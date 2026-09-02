import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaWorkflowDigest } from "./canonical";
import {
  parseSenaEngineeringRepositoryPreflightReceipt,
  senaEngineeringPathAllowed,
  SENA_ENGINEERING_REAL_COMMAND_PLAN,
  type SenaEngineeringCommandExecutor,
  type SenaEngineeringCommandSpec,
  type SenaEngineeringEvidenceParameters,
  type SenaEngineeringIsolationProof,
  type SenaEngineeringRepositoryPreflightReceipt,
  type SenaEngineeringRunBinding
} from "./engineering-evidence";

const MAX_HASHED_LOG_BYTES = 4 * 1024 * 1024;
const MAX_CONTROL_OUTPUT_BYTES = 16 * 1024 * 1024;
const TERMINATION_GRACE_MS = 5_000;
const DESCENDANT_CLEANUP_MS = 150;
const SANDBOX_EXECUTABLE = "/usr/bin/sandbox-exec";
const GOVERNANCE_REGISTRY_PATH = "coordination/repo-governance/active-work.json";
const ACTIVE_WRITE_DISPOSITIONS = new Set(["active", "ready-for-pr"]);
const SAFE_ENVIRONMENT_KEYS = [
  "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT"
] as const;

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

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
    NEXT_TELEMETRY_DISABLED: "1",
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
    throw new Error("SENA engineering verification refuses runtime environment files.");
  }
}

function commandTimeoutMs(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const parsed = Number(env.SENA_ENGINEERING_COMMAND_TIMEOUT_MS);
  return Number.isFinite(parsed)
    ? Math.max(60_000, Math.min(Math.trunc(parsed), 60 * 60_000))
    : 30 * 60_000;
}

function controlTimeoutMs(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const parsed = Number(env.SENA_ENGINEERING_CONTROL_TIMEOUT_MS);
  return Number.isFinite(parsed)
    ? Math.max(5_000, Math.min(Math.trunc(parsed), 5 * 60_000))
    : 60_000;
}

function trustedExecutable(name: string, env: NodeJS.ProcessEnv) {
  if (path.isAbsolute(name)) {
    accessSync(name, fsConstants.X_OK);
    return name;
  }
  for (const directory of String(env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue through the worker-owned PATH; candidate files are never added.
    }
  }
  throw new Error(`SENA engineering trusted executable is unavailable: ${name}.`);
}

async function runProcess(input: {
  command: SenaEngineeringCommandSpec;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  sandboxProfile?: string;
}) {
  const startedAt = new Date().toISOString();
  const digest = createHash("sha256");
  let bytes = 0;
  const commandExecutable = input.command.fixture && input.command.executable === "node"
    ? process.execPath
    : trustedExecutable(input.command.executable, input.env);
  const executable = input.sandboxProfile ? SANDBOX_EXECUTABLE : commandExecutable;
  const args = input.sandboxProfile
    ? ["-p", input.sandboxProfile, commandExecutable, ...input.command.args]
    : input.command.args;
  const child = spawn(executable, args, {
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
        // The process group may already be gone.
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
      // A candidate command may let descendants outlive its parent. Kill the
      // detached process group before the disposable snapshot is removed.
      signalProcess("SIGTERM");
      setTimeout(() => {
        signalProcess("SIGKILL");
        resolve(outputLimitExceeded ? 125 : timedOut ? 124 : code ?? 1);
      }, DESCENDANT_CLEANUP_MS);
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

async function captureProcess(input: {
  executable: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  allowFailure?: boolean;
}) {
  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  const child = spawn(input.executable, input.args, {
    cwd: input.cwd,
    env: input.env ?? process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes <= MAX_CONTROL_OUTPUT_BYTES) stdout.push(Buffer.from(chunk));
    if (stdoutBytes > MAX_CONTROL_OUTPUT_BYTES) child.kill("SIGKILL");
  });
  const status = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), input.timeoutMs ?? 60_000);
    timer.unref?.();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (value) => {
      clearTimeout(timer);
      resolve(value ?? 1);
    });
  });
  if (stdoutBytes > MAX_CONTROL_OUTPUT_BYTES) {
    throw new Error("SENA engineering control-plane output exceeded its redacted bound.");
  }
  if (status !== 0 && !input.allowFailure) {
    throw new Error("SENA engineering worker could not prove its authoritative repository binding.");
  }
  return { status, stdout: Buffer.concat(stdout) };
}

async function gitBytes(cwd: string, args: string[], options: { allowFailure?: boolean; timeoutMs?: number } = {}) {
  return captureProcess({
    executable: "git",
    args: ["-C", cwd, ...args],
    cwd,
    allowFailure: options.allowFailure,
    timeoutMs: options.timeoutMs
  });
}

async function gitText(cwd: string, args: string[]) {
  const result = await gitBytes(cwd, args);
  return result.stdout.toString("utf8").trim();
}

function samePaths(left: string[], right: string[]) {
  return [...new Set(left)].sort().join("\n") === [...new Set(right)].sort().join("\n");
}

function exactRealCommand(command: SenaEngineeringCommandSpec) {
  const expected = SENA_ENGINEERING_REAL_COMMAND_PLAN[
    command.gate as keyof typeof SENA_ENGINEERING_REAL_COMMAND_PLAN
  ];
  if (!expected || command.fixture || command.commandId !== expected.commandId ||
    command.executable !== expected.executable ||
    command.args.join("\0") !== expected.args.join("\0")) {
    throw new Error("SENA engineering worker rejected a non-canonical verification command.");
  }
}

type CandidateBinding = {
  repoRoot: string;
  appRoot: string;
  appRelativePath: string;
  candidateTreeSha: string;
  dependencyLockDigest: string;
};

async function assertCandidateBinding(input: {
  configuredPath: string;
  evidence: SenaEngineeringEvidenceParameters;
  binding: SenaEngineeringRunBinding;
}): Promise<CandidateBinding> {
  const resolved = realpathSync(input.configuredPath);
  if (!statSync(resolved).isDirectory() || senaWorkflowDigest(resolved) !== input.evidence.worktreePathHash) {
    throw new Error("SENA engineering worktree path does not match its redacted binding.");
  }
  const repoRoot = await gitText(resolved, ["rev-parse", "--show-toplevel"]);
  const appRoot = existsSync(path.join(resolved, "package.json"))
    ? resolved
    : path.join(resolved, "sena-hk-template");
  if (!existsSync(path.join(appRoot, "package.json")) || !existsSync(path.join(appRoot, "package-lock.json"))) {
    throw new Error("SENA engineering worktree does not contain the locked runnable application root.");
  }
  assertNoRuntimeEnvironmentFiles(appRoot);
  const [head, branch, changed, status, candidateTreeSha, treeListing] = await Promise.all([
    gitText(repoRoot, ["rev-parse", "HEAD"]),
    gitText(repoRoot, ["branch", "--show-current"]),
    gitText(repoRoot, ["diff", "--name-only", `${input.binding.baseSha}...${input.binding.candidateSha}`]),
    gitText(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
    gitText(repoRoot, ["rev-parse", `${input.binding.candidateSha}^{tree}`]),
    gitText(repoRoot, ["ls-tree", "-r", input.binding.candidateSha])
  ]);
  if (head !== input.binding.candidateSha || branch !== input.evidence.branch || status !== "") {
    throw new Error("SENA engineering exact candidate worktree is not clean or does not match its binding.");
  }
  if (treeListing.split("\n").some((line) => line.startsWith("120000 ") || line.startsWith("160000 "))) {
    throw new Error("SENA engineering exact candidate contains a symlink or gitlink and cannot be sandboxed safely.");
  }
  const changedPaths = changed ? changed.split("\n").filter(Boolean) : [];
  if (!samePaths(changedPaths, input.evidence.candidateReceipt.changedPaths)) {
    throw new Error("SENA engineering changed-path evidence does not match the exact Git range.");
  }
  const appRelativePath = path.relative(repoRoot, appRoot).split(path.sep).join("/");
  const lockRepoPath = appRelativePath ? `${appRelativePath}/package-lock.json` : "package-lock.json";
  const candidateLock = (await gitBytes(repoRoot, ["show", `${input.binding.candidateSha}:${lockRepoPath}`])).stdout;
  const trustedLock = readFileSync(path.join(appRoot, "package-lock.json"));
  if (!candidateLock.equals(trustedLock)) {
    throw new Error("SENA engineering candidate dependency lock differs from the worker-installed dependency set.");
  }
  return {
    repoRoot,
    appRoot,
    appRelativePath,
    candidateTreeSha,
    dependencyLockDigest: sha256(candidateLock)
  };
}

function sandboxLiteral(value: string) {
  return JSON.stringify(value);
}

function sandboxProfile(snapshotRoot: string, additionalReadRoots: string[]) {
  const readExceptions = [...new Set([
    snapshotRoot,
    path.join(os.homedir(), "Library", "Fonts"),
    path.dirname(path.dirname(realpathSync(process.execPath))),
    ...additionalReadRoots
  ].filter((entry) => existsSync(entry)).map((entry) => realpathSync(entry)))];
  const protectedReadRoots = [...new Set([
    "/Users",
    "/Volumes",
    "/private/tmp",
    "/private/var/folders"
  ].filter((entry) => existsSync(entry)).map((entry) => realpathSync(entry)))];
  const denyReadRule = (protectedRoot: string) => {
    const exceptions = readExceptions.filter((entry) =>
      entry === protectedRoot || entry.startsWith(`${protectedRoot}${path.sep}`));
    if (exceptions.includes(protectedRoot)) return undefined;
    return exceptions.length === 0
      ? `(deny file-read-data (subpath ${sandboxLiteral(protectedRoot)}))`
      : `(deny file-read-data (require-all (subpath ${sandboxLiteral(protectedRoot)}) ${exceptions
          .map((entry) => `(require-not (subpath ${sandboxLiteral(entry)}))`)
          .join(" ")}))`;
  };
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(allow network-inbound (local ip \"localhost:*\"))",
    "(allow network-outbound (remote ip \"localhost:*\"))",
    `(deny file-write* (require-all (require-not (subpath ${sandboxLiteral(snapshotRoot)})) (require-not (literal \"/dev/null\")) (require-not (literal \"/dev/tty\"))))`,
    ...protectedReadRoots.map(denyReadRule).filter((entry): entry is string => Boolean(entry))
  ].join(" ");
}

async function materializeCandidateSnapshot(input: {
  candidate: CandidateBinding;
  candidateSha: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
}) {
  if (process.platform !== "darwin" || !existsSync(SANDBOX_EXECUTABLE)) {
    throw new Error("SENA engineering exact-SHA verification requires the approved macOS sandbox provider.");
  }
  const parent = mkdtempSync(path.join(os.tmpdir(), "sena-evidenceflow-gate-"));
  const snapshotRoot = path.join(parent, "snapshot");
  const archivePath = path.join(parent, "candidate.tar");
  mkdirSync(snapshotRoot, { mode: 0o700 });
  const canonicalSnapshotRoot = realpathSync(snapshotRoot);
  try {
    await captureProcess({
      executable: "git",
      args: ["-C", input.candidate.repoRoot, "archive", "--format=tar", `--output=${archivePath}`, input.candidateSha],
      cwd: input.candidate.repoRoot,
      timeoutMs: controlTimeoutMs(input.env)
    });
    await captureProcess({
      executable: "tar",
      args: ["-xf", archivePath, "-C", snapshotRoot],
      cwd: parent,
      timeoutMs: controlTimeoutMs(input.env)
    });
    unlinkSync(archivePath);
    const snapshotAppRoot = input.candidate.appRelativePath
      ? path.join(canonicalSnapshotRoot, input.candidate.appRelativePath)
      : canonicalSnapshotRoot;
    assertNoRuntimeEnvironmentFiles(snapshotAppRoot);
    const dependencyRoot = path.join(input.candidate.appRoot, "node_modules");
    if (existsSync(dependencyRoot)) {
      const snapshotDependencies = path.join(snapshotAppRoot, "node_modules");
      mkdirSync(snapshotDependencies, { mode: 0o700 });
      for (const entry of readdirSync(dependencyRoot)) {
        const destination = path.join(snapshotDependencies, entry);
        if (entry === ".vite" || entry === ".cache") {
          mkdirSync(destination, { mode: 0o700 });
          continue;
        }
        const target = realpathSync(path.join(dependencyRoot, entry));
        symlinkSync(target, destination, statSync(target).isDirectory() ? "dir" : "file");
      }
    }
    const home = path.join(canonicalSnapshotRoot, ".worker-home");
    const temporary = path.join(canonicalSnapshotRoot, ".worker-tmp");
    const npmCache = path.join(canonicalSnapshotRoot, ".worker-npm-cache");
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(temporary, { mode: 0o700 });
    mkdirSync(npmCache, { mode: 0o700 });
    const browserPath = input.env.PLAYWRIGHT_BROWSERS_PATH?.trim() ||
      path.join(os.homedir(), "Library", "Caches", "ms-playwright");
    const additionalReadRoots = [
      ...(existsSync(dependencyRoot) ? [dependencyRoot] : []),
      ...(existsSync(browserPath) ? [browserPath] : [])
    ];
    const profile = sandboxProfile(canonicalSnapshotRoot, additionalReadRoots);
    return {
      parent,
      snapshotRoot: canonicalSnapshotRoot,
      snapshotAppRoot,
      profile,
      childEnvironment: {
        HOME: home,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        NPM_CONFIG_CACHE: npmCache,
        ...(existsSync(browserPath) ? { PLAYWRIGHT_BROWSERS_PATH: browserPath } : {})
      },
      isolation: {
        provider: "macos-sandbox-exec",
        snapshotKind: "git-archive-exact-sha",
        candidateTreeSha: input.candidate.candidateTreeSha,
        dependencyLockDigest: input.candidate.dependencyLockDigest,
        sandboxPolicyDigest: sha256(profile),
        filesystemPolicy: "snapshot-write-only",
        readPolicy: "host-data-denied",
        networkPolicy: "loopback-only",
        temporarySnapshot: true
      } satisfies SenaEngineeringIsolationProof
    };
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}

function fixtureIsolation(binding: SenaEngineeringRunBinding): SenaEngineeringIsolationProof {
  return {
    provider: "fixed-fixture-simulation",
    snapshotKind: "fixed-fixture",
    candidateTreeSha: binding.candidateSha,
    dependencyLockDigest: senaWorkflowDigest({ fixture: true, version: 1 }),
    sandboxPolicyDigest: senaWorkflowDigest({ fixturePolicy: "fixed-no-side-effect-command-v1" }),
    filesystemPolicy: "fixed-fixture",
    readPolicy: "fixed-fixture",
    networkPolicy: "none",
    temporarySnapshot: true
  };
}

export async function createSenaEngineeringCommandExecutor(input: {
  evidence: SenaEngineeringEvidenceParameters;
  binding: SenaEngineeringRunBinding;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<SenaEngineeringCommandExecutor> {
  const env = input.env ?? process.env;
  const childEnv = engineeringChildEnvironment(env);
  if (input.evidence.targetKind === "fixture-repository") {
    return async (command) => ({
      ...(await runProcess({
        command,
        cwd: process.cwd(),
        env: environmentForCommand(childEnv, command),
        timeoutMs: commandTimeoutMs(env)
      })),
      isolation: fixtureIsolation(input.binding)
    });
  }

  const configured = env.SENA_ENGINEERING_WORKTREE_PATH?.trim();
  if (!configured) throw new Error("SENA engineering local verification worktree is not configured.");
  const candidate = await assertCandidateBinding({ configuredPath: configured, evidence: input.evidence, binding: input.binding });

  return async (command) => {
    exactRealCommand(command);
    const freshCandidate = await assertCandidateBinding({ configuredPath: configured, evidence: input.evidence, binding: input.binding });
    if (freshCandidate.candidateTreeSha !== candidate.candidateTreeSha ||
      freshCandidate.dependencyLockDigest !== candidate.dependencyLockDigest) {
      throw new Error("SENA engineering candidate tree or dependency lock drifted before verification.");
    }
    const snapshot = await materializeCandidateSnapshot({ candidate: freshCandidate, candidateSha: input.binding.candidateSha, env });
    try {
      const result = await runProcess({
        command,
        cwd: snapshot.snapshotAppRoot,
        env: environmentForCommand({ ...childEnv, ...snapshot.childEnvironment }, command),
        timeoutMs: commandTimeoutMs(env),
        sandboxProfile: snapshot.profile
      });
      return { ...result, isolation: snapshot.isolation };
    } finally {
      rmSync(snapshot.parent, { recursive: true, force: true });
    }
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeGitHubRemote(remote: string) {
  const ssh = remote.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  const https = remote.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  const sshUrl = remote.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  const match = ssh ?? https ?? sshUrl;
  return match ? `${match[1]}/${match[2]}` : "";
}

function trustedGovernanceScript(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const configured = env.SENA_WORKFLOW_TRUSTED_REPO_ROOT?.trim();
  const candidates = [
    ...(configured ? [path.resolve(configured)] : []),
    path.resolve(process.cwd(), "..")
  ];
  const trustedRoot = candidates.find((candidate) =>
    existsSync(path.join(candidate, "scripts", "verify-sena-repo-governance.mjs"))
  );
  if (!trustedRoot) throw new Error("SENA engineering trusted governance verifier is unavailable.");
  return path.join(trustedRoot, "scripts", "verify-sena-repo-governance.mjs");
}

export async function observeSenaEngineeringRepositoryPreflight(input: {
  evidence: SenaEngineeringEvidenceParameters;
  binding: SenaEngineeringRunBinding;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<SenaEngineeringRepositoryPreflightReceipt> {
  const env = input.env ?? process.env;
  if (input.evidence.targetKind === "fixture-repository") {
    return parseSenaEngineeringRepositoryPreflightReceipt({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight,
      repo: input.binding.repo,
      baseSha: input.binding.baseSha,
      liveMainSha: input.binding.baseSha,
      candidateSha: input.binding.candidateSha,
      branch: input.evidence.branch,
      ownerLane: input.evidence.ownerLane,
      worktreePathHash: input.evidence.worktreePathHash,
      governanceRegistryDigest: input.evidence.repositoryPreflight.governanceRegistryDigest,
      changedPathDigest: input.evidence.candidateReceipt.changedPathDigest,
      checkedAt: new Date().toISOString(),
      featureWorkFrozen: false,
      protectedMainGreen: true,
      ownerConflict: false,
      dirtyTarget: false,
      headDrift: false,
      allowedPathConflict: false,
      externalSideEffects: false,
      fixture: true,
      provenance: {
        issuer: "sena-workflow-worker",
        observationMode: "fixture-simulation",
        liveMainObservation: "fixed-fixture",
        registryObservation: "fixed-fixture",
        requiredChecksObservation: "fixed-fixture",
        governanceAuditStatus: "fixture-simulated",
        governanceAuditDigest: senaWorkflowDigest({ fixtureAudit: "passed", version: 1 }),
        requiredChecksDigest: senaWorkflowDigest({ fixtureChecks: ["build", "repository-security"], version: 1 }),
        requiredCheckNames: ["build", "repository-security"],
        canonicalRemoteDigest: senaWorkflowDigest({ fixtureRepo: input.binding.repo }),
        activeWorkItemTaskId: "fixture-work-item",
        candidateTreeSha: input.binding.candidateSha,
        baseAncestorOfCandidate: true
      }
    }, input.evidence, input.binding);
  }

  const configured = env.SENA_ENGINEERING_WORKTREE_PATH?.trim();
  if (!configured) throw new Error("SENA engineering authoritative preflight worktree is not configured.");
  const candidate = await assertCandidateBinding({ configuredPath: configured, evidence: input.evidence, binding: input.binding });
  const [remoteUrl, liveMainResult, ancestry, registryResult] = await Promise.all([
    gitText(candidate.repoRoot, ["remote", "get-url", "origin"]),
    gitBytes(candidate.repoRoot, ["ls-remote", "--heads", "origin", "refs/heads/main"], { timeoutMs: controlTimeoutMs(env) }),
    gitBytes(candidate.repoRoot, ["merge-base", "--is-ancestor", input.binding.baseSha, input.binding.candidateSha], { allowFailure: true }),
    gitBytes(candidate.repoRoot, ["show", `${input.binding.baseSha}:${GOVERNANCE_REGISTRY_PATH}`])
  ]);
  const canonicalRemote = normalizeGitHubRemote(remoteUrl);
  const liveMainSha = liveMainResult.stdout.toString("utf8").trim().split(/\s+/)[0] ?? "";
  const governanceRegistryDigest = sha256(registryResult.stdout);
  if (canonicalRemote !== input.binding.repo || liveMainSha !== input.binding.baseSha || ancestry.status !== 0 ||
    governanceRegistryDigest !== input.evidence.repositoryPreflight.governanceRegistryDigest) {
    throw new Error("SENA engineering protected-main, ancestry, remote, or registry binding drifted.");
  }
  let registry: Record<string, unknown>;
  try {
    registry = object(JSON.parse(registryResult.stdout.toString("utf8")));
  } catch {
    throw new Error("SENA engineering protected-main governance registry is invalid.");
  }
  const workItems = Array.isArray(registry.workItems) ? registry.workItems.map(object) : [];
  const activeMatches = workItems.filter((item) =>
    item.branch === input.evidence.branch && ACTIVE_WRITE_DISPOSITIONS.has(String(item.disposition)) &&
    typeof item.worktreePath === "string" && existsSync(item.worktreePath) &&
    senaWorkflowDigest(realpathSync(item.worktreePath)) === input.evidence.worktreePathHash &&
    typeof item.ownerLane === "string" && item.ownerLane.includes(input.evidence.ownerLane)
  );
  const activeItem = activeMatches[0];
  const itemAllowedPaths = Array.isArray(activeItem?.allowedPaths)
    ? activeItem.allowedPaths.filter((entry): entry is string => typeof entry === "string")
    : [];
  const branchRecords = Array.isArray(registry.branches) ? registry.branches.map(object) : [];
  const branchRecord = branchRecords.find((entry) =>
    entry.name === input.evidence.branch && ACTIVE_WRITE_DISPOSITIONS.has(String(entry.disposition))
  );
  const credentialIncident = object(object(registry.incident).credentialExposure);
  const containmentProgress = object(credentialIncident.containmentProgress);
  const githubControlPlane = object(object(registry.policy).githubControlPlane);
  const requiredCheckNames = Array.isArray(githubControlPlane.requiredStatusChecks)
    ? githubControlPlane.requiredStatusChecks.filter((entry): entry is string => typeof entry === "string")
    : [];
  const featureWorkFrozen = credentialIncident.status !== "closed" || containmentProgress.featureWorkFrozen !== false;
  const ownerConflict = activeMatches.length !== 1 || !branchRecord || typeof activeItem?.taskId !== "string";
  const allowedPathConflict = !samePaths(itemAllowedPaths, input.evidence.allowedPaths) ||
    input.evidence.candidateReceipt.changedPaths.some((changedPath) =>
      !itemAllowedPaths.some((allowedPath) => senaEngineeringPathAllowed(changedPath, allowedPath)));
  if (featureWorkFrozen || ownerConflict || allowedPathConflict || githubControlPlane.enforcement !== "active" ||
    githubControlPlane.strictRequiredStatusChecks !== true || requiredCheckNames.length < 1 ||
    new Set(requiredCheckNames).size !== requiredCheckNames.length) {
    throw new Error("SENA engineering governance freeze, owner lane, or allowed-path preflight failed closed.");
  }

  const governanceScript = trustedGovernanceScript(env);
  const [governanceAudit, githubChecks] = await Promise.all([
    captureProcess({
      executable: process.execPath,
      args: [governanceScript, "audit", "--live", "--registry-from-commit", input.binding.baseSha],
      cwd: candidate.repoRoot,
      env: { ...process.env, SENA_GOVERNANCE_TARGET_ROOT: candidate.repoRoot },
      timeoutMs: controlTimeoutMs(env),
      allowFailure: true
    }),
    captureProcess({
      executable: trustedExecutable("gh", process.env),
      args: [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        `repos/${canonicalRemote}/commits/${input.binding.baseSha}/check-runs?per_page=100`
      ],
      cwd: candidate.repoRoot,
      env: { ...process.env, GH_HOST: "github.com" },
      timeoutMs: controlTimeoutMs(env),
      allowFailure: true
    })
  ]);
  let audit: Record<string, unknown>;
  try {
    audit = object(JSON.parse(governanceAudit.stdout.toString("utf8")));
  } catch {
    throw new Error("SENA engineering governance audit did not produce a redacted machine receipt.");
  }
  const ownerBlockers = Array.isArray(audit.ownerBlockers) ? audit.ownerBlockers : [];
  if (governanceAudit.status !== 0 || audit.status !== "pass" || ownerBlockers.length > 0) {
    throw new Error("SENA engineering authoritative live governance audit failed closed.");
  }
  let checkPayload: Record<string, unknown>;
  try {
    checkPayload = object(JSON.parse(githubChecks.stdout.toString("utf8")));
  } catch {
    throw new Error("SENA engineering protected-main checks did not produce a redacted machine receipt.");
  }
  const checkRuns = Array.isArray(checkPayload.check_runs) ? checkPayload.check_runs.map(object) : [];
  const requiredChecks = requiredCheckNames.map((name) => {
    const latest = checkRuns
      .filter((entry) => entry.name === name)
      .sort((left, right) => Date.parse(String(right.completed_at ?? right.started_at ?? 0)) -
        Date.parse(String(left.completed_at ?? left.started_at ?? 0)))[0];
    return {
      name,
      status: latest?.status ?? null,
      conclusion: latest?.conclusion ?? null,
      completedAt: latest?.completed_at ?? null
    };
  });
  if (githubChecks.status !== 0 || requiredChecks.some((entry) =>
    entry.status !== "completed" || entry.conclusion !== "success" ||
    typeof entry.completedAt !== "string" || !Number.isFinite(Date.parse(entry.completedAt))
  )) {
    throw new Error("SENA engineering exact protected-main required checks are not green.");
  }
  return parseSenaEngineeringRepositoryPreflightReceipt({
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowEngineeringRepositoryPreflight,
    repo: input.binding.repo,
    baseSha: input.binding.baseSha,
    liveMainSha,
    candidateSha: input.binding.candidateSha,
    branch: input.evidence.branch,
    ownerLane: input.evidence.ownerLane,
    worktreePathHash: input.evidence.worktreePathHash,
    governanceRegistryDigest,
    changedPathDigest: input.evidence.candidateReceipt.changedPathDigest,
    checkedAt: new Date().toISOString(),
    featureWorkFrozen: false,
    protectedMainGreen: true,
    ownerConflict: false,
    dirtyTarget: false,
    headDrift: false,
    allowedPathConflict: false,
    externalSideEffects: false,
    fixture: false,
    provenance: {
      issuer: "sena-workflow-worker",
      observationMode: "live-read-only",
      liveMainObservation: "git-ls-remote",
      registryObservation: "git-show-protected-main",
      requiredChecksObservation: "github-check-runs",
      governanceAuditStatus: "passed",
      governanceAuditDigest: sha256(governanceAudit.stdout),
      requiredChecksDigest: senaWorkflowDigest({ baseSha: input.binding.baseSha, requiredChecks }),
      requiredCheckNames,
      canonicalRemoteDigest: senaWorkflowDigest({ provider: "github.com", repository: canonicalRemote }),
      activeWorkItemTaskId: String(activeItem.taskId),
      candidateTreeSha: candidate.candidateTreeSha,
      baseAncestorOfCandidate: true
    }
  }, input.evidence, input.binding);
}
