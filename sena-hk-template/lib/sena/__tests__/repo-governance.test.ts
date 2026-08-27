import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  symlinkSync,
  chmodSync,
  existsSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(process.cwd(), "..");
const governanceScript = join(projectRoot, "scripts", "verify-sena-repo-governance.mjs");
const tempRoots: string[] = [];

function temporaryRoot(label: string) {
  const root = mkdtempSync(join(tmpdir(), `sena-${label}-`));
  tempRoots.push(root);
  return root;
}

function runNode(
  script: string,
  args: string[],
  options: { cwd?: string; input?: string; env?: Partial<NodeJS.ProcessEnv> } = {}
) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? projectRoot,
    input: options.input,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    maxBuffer: 16 * 1024 * 1024
  });
}

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function isActiveWriter(entry: { disposition: string }) {
  return ["active", "ready-for-pr"].includes(entry.disposition);
}

function createGovernedFixture(label: string, allowedPaths = ["README.md", "coordination/repo-governance/**"]) {
  const root = temporaryRoot(label);
  const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(governanceScript, script);
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.name", "SENA governance test"]);
  runGit(root, ["config", "user.email", "sena-governance@example.invalid"]);
  runGit(root, ["branch", "-M", "topic"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/HUDongpin/SENA.git"]);
  writeFileSync(join(root, "README.md"), "safe base\n");
  runGit(root, ["add", "README.md"]);
  runGit(root, ["commit", "-q", "-m", "safe base"]);
  const base = runGit(root, ["rev-parse", "HEAD"]);
  runGit(root, ["update-ref", "refs/remotes/origin/main", base]);

  const template = JSON.parse(
    readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
  );
  const templateItem = template.workItems.find(isActiveWriter);
  const templateBranch = template.branches.find(isActiveWriter);
  const now = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const taskId = "SENA-GOVERNANCE-TEST-WRITER";
  const ownerKey = "test-writer";
  const registryPath = join(root, "coordination", "repo-governance", "active-work.json");
  const registry = {
    ...template,
    updatedAt: now,
    repo: root,
    policy: {
      ...template.policy,
      hookCustodyPath: join(root, ".githooks"),
      freezeExceptionBindings: [
        {
          exception: "governance-preservation",
          taskId,
          ownerKey,
          ownerLane: "test-governance",
          branch: "topic",
          allowedPaths,
          authorizationBasis: "Explicit test fixture authorization; no real credential values."
        }
      ]
    },
    workItems: [
      {
        ...templateItem,
        taskId,
        threadId: "test-thread",
        repo: root,
        cwd: root,
        owner: "test writer",
        ownerKey,
        ownerLane: "test-governance",
        branch: "topic",
        worktreePath: root,
        baseSha: base,
        headSha: base,
        aheadBehind: { baseRef: "origin/main", ahead: 0, behind: 0 },
        allowedPaths,
        createdAt: now,
        lastHeartbeatAt: now,
        lastObservedAt: now,
        nextReviewAt: tomorrow,
        expectedCloseAt: tomorrow,
        noPrReason: "test fixture before first push",
        dirtyState: "active-wip",
        disposition: "active",
        freezeException: "governance-preservation"
      }
    ],
    branches: [
      {
        ...templateBranch,
        name: "topic",
        owner: "test writer",
        ownerKey,
        baseSha: base,
        headSha: base,
        upstream: "origin/main",
        upstreamState: "live",
        upstreamCacheState: "present",
        remotePresent: false,
        remoteHeadSha: null,
        remoteObservedAt: now,
        pr: null,
        noPrReason: "test fixture before first push",
        lastOwnerHeartbeatAt: now,
        lastObservedAt: now,
        lastCommitAt: now,
        nextReviewAt: tomorrow,
        expectedCloseAt: tomorrow,
        disposition: "active"
      }
    ],
    orphanWorktrees: []
  };
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  runGit(root, ["add", "coordination/repo-governance/active-work.json"]);
  runGit(root, ["commit", "-q", "-m", "register governed writer"]);
  const head = runGit(root, ["rev-parse", "HEAD"]);
  return { root, script, registryPath, registry, base, head, ref: "refs/heads/topic" };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("SENA repository governance", () => {
  it("accepts the machine-readable active-work registry", () => {
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const activeWriterCount = registry.workItems.filter((item: { disposition: string }) =>
      ["active", "ready-for-pr"].includes(item.disposition)
    ).length;
    const result = runNode(governanceScript, ["registry"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SENA_REPO_REGISTRY pass");
    expect(result.stdout).toContain(`activeWriters=${activeWriterCount}`);
  });

  it("declares monotonic control-plane observations without weakening feature branches", () => {
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const main = registry.branches.find((branch: { name: string }) => branch.name === "main");
    const governance = registry.branches.find(
      (branch: { name: string }) => branch.name === "codex/sena-a01-repo-governance-20260827"
    );
    const featureBranches = registry.branches.filter(
      (branch: { name: string }) => branch.name !== "main"
    );

    expect(registry.incident.credentialExposure.liveMainObservationMode).toBe("lower-bound");
    expect(main.remoteObservationMode).toBe("lower-bound");
    expect(governance.prStateObservationMode).toBe("monotonic");
    expect(featureBranches.every((branch: { remoteObservationMode?: string }) => !branch.remoteObservationMode)).toBe(
      true
    );
  });

  it("fails closed when an active writer exceeds the 72-hour heartbeat freeze threshold", () => {
    const root = temporaryRoot("stale-heartbeat");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const active = registry.workItems.find(isActiveWriter);
    active.lastHeartbeatAt = "2020-01-01T00:00:00Z";
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["registry", "--registry", registryPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("more than 72 hours and must be frozen");
  });

  it("blocks forbidden binary credential paths without needing to inspect document text", () => {
    const result = runNode(governanceScript, ["security", "--paths-from-stdin"], {
      input: ["All API Keys.docx", "nested/ALL API KEYS.DOCX", "safe/readme.md"].join("\n")
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("rule=all-api-keys-docx");
    expect(result.stderr).toContain("findingCount=2");
  });

  it("allows documented example env files but rejects real env paths and private-key filenames", () => {
    const allowed = runNode(governanceScript, ["security", "--paths-from-stdin"], {
      input: [".env.example", ".env.test.example"].join("\n")
    });
    expect(allowed.status).toBe(0);

    const blocked = runNode(governanceScript, ["security", "--paths-from-stdin"], {
      input: [".env", "app/.env.production", "keys/id_ed25519"].join("\n")
    });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("rule=non-example-env");
    expect(blocked.stderr).toContain("rule=private-key-filename");

    const archives = runNode(governanceScript, ["security", "--paths-from-stdin"], {
      input: ["exports/private-keys.zip", "backup/keys.tar.gz"].join("\n")
    });
    expect(archives.status).toBe(1);
    expect(archives.stderr).toContain("rule=sensitive-key-archive-filename");

    const expanded = runNode(governanceScript, ["security", "--paths-from-stdin"], {
      input: [".envrc", "config/.env-prod", "backup/id_rsa.zip", "exports/api_keys.yaml"].join("\n")
    });
    expect(expanded.status).toBe(1);
    expect(expanded.stderr).toContain("rule=non-example-env");
    expect(expanded.stderr).toContain("rule=sensitive-key-archive-filename");
    expect(expanded.stderr).toContain("rule=credential-export-filename");
  });

  it("blocks prohibited paths in the staged index before a commit exists", () => {
    const root = temporaryRoot("staged-index");
    const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(governanceScript, script);
    runGit(root, ["init", "-q"]);
    writeFileSync(join(root, "All API Keys.docx"), "TEST-FIXTURE-NOT-REAL\n");
    runGit(root, ["add", "All API Keys.docx"]);

    const result = runNode(script, ["security", "--staged"], { cwd: root });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("rule=all-api-keys-docx");
    expect(result.stderr).toContain("source=index");
  });

  it("scans staged Git type changes, including a regular file changed to a symlink", () => {
    const root = temporaryRoot("staged-type-change");
    const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(governanceScript, script);
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.name", "SENA governance test"]);
    runGit(root, ["config", "user.email", "sena-governance@example.invalid"]);
    writeFileSync(join(root, "probe.txt"), "safe regular file\n");
    writeFileSync(join(root, "safe-link.txt"), "safe regular file\n");
    runGit(root, ["add", "probe.txt", "safe-link.txt"]);
    runGit(root, ["commit", "-q", "-m", "regular files"]);

    const fakeToken = `ghp_${"T".repeat(40)}`;
    rmSync(join(root, "probe.txt"));
    rmSync(join(root, "safe-link.txt"));
    symlinkSync(fakeToken, join(root, "probe.txt"));
    symlinkSync("safe-target-not-a-secret", join(root, "safe-link.txt"));
    runGit(root, ["add", "probe.txt", "safe-link.txt"]);
    expect(runGit(root, ["diff", "--cached", "--name-status"])).toContain("T\tprobe.txt");

    const blocked = runNode(script, ["security", "--staged"], { cwd: root });
    const combined = `${blocked.stdout}${blocked.stderr}`;
    expect(blocked.status).toBe(1);
    expect(combined).toContain("path=probe.txt");
    expect(combined).toContain("rule=github-token");
    expect(combined).not.toContain(fakeToken);

    runGit(root, ["restore", "--staged", "probe.txt"]);
    const safe = runNode(script, ["security", "--staged"], { cwd: root });
    expect(safe.status).toBe(0);
  });

  it("blocks a known sensitive blob object even after it is renamed to an innocuous binary path", () => {
    const root = temporaryRoot("known-blob");
    const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(governanceScript, script);
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.name", "SENA governance test"]);
    runGit(root, ["config", "user.email", "sena-governance@example.invalid"]);
    writeFileSync(join(root, "notes.docx"), Buffer.from([0, 1, 2, 3, 4, 5]));
    runGit(root, ["add", "notes.docx"]);
    runGit(root, ["commit", "-q", "-m", "binary fixture"]);
    const fixtureOid = runGit(root, ["rev-parse", "HEAD:notes.docx"]);

    const result = runNode(script, ["security", "--tree", "HEAD"], {
      cwd: root,
      env: { SENA_GOVERNANCE_ADDITIONAL_DENY_BLOB_OIDS: fixtureOid }
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("path=notes.docx");
    expect(result.stderr).toContain("rule=known-sensitive-blob-oid");
  });

  it("detects an explicit fake token fixture without printing the fixture value", () => {
    const root = temporaryRoot("fake-secret");
    const fixturePath = join(root, "fixture.txt");
    const fakeToken = `ghp_${"A".repeat(40)}`;
    writeFileSync(fixturePath, `TEST-FIXTURE-NOT-REAL=${fakeToken}\n`);

    const result = runNode(governanceScript, ["security", "--files-from-stdin"], {
      input: `${fixturePath}\n`
    });
    const combined = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(combined).toContain("rule=github-token");
    expect(combined).not.toContain(fakeToken);
  });

  it("redacts a fake token embedded in a filename and escapes the path from logs", () => {
    const root = temporaryRoot("fake-secret-filename");
    const fakeToken = `ghp_${"B".repeat(40)}`;
    const fixturePath = join(root, `${fakeToken}.txt`);
    writeFileSync(fixturePath, "TEST-FIXTURE-NOT-REAL\n");

    const result = runNode(governanceScript, ["security", "--files-from-stdin"], {
      input: `${fixturePath}\n`
    });
    const combined = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(combined).toContain("redacted-sensitive-path");
    expect(combined).not.toContain(fakeToken);
  });

  it("does not echo a token-shaped branch name when the pre-commit audit fails", () => {
    const fixture = createGovernedFixture("precommit-log-redaction");
    const fakeToken = `ghp_${"A".repeat(36)}`;
    runGit(fixture.root, ["branch", "-m", fakeToken]);

    const hookDirectory = join(fixture.root, ".githooks");
    const hookPath = join(hookDirectory, "pre-commit");
    mkdirSync(hookDirectory, { recursive: true });
    copyFileSync(join(projectRoot, ".githooks", "pre-commit"), hookPath);
    chmodSync(hookPath, 0o755);

    const result = spawnSync(hookPath, [], {
      cwd: fixture.root,
      encoding: "utf8",
      env: process.env
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("repository governance write gate failed");
    expect(result.stderr).not.toContain(fakeToken);
    expect(result.stdout).not.toContain(fakeToken);
  });

  it("scans every commit in an outgoing range even when the forbidden file is later removed", () => {
    const root = temporaryRoot("outgoing-range");
    const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(governanceScript, script);
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.name", "SENA governance test"]);
    runGit(root, ["config", "user.email", "sena-governance@example.invalid"]);
    writeFileSync(join(root, "README.md"), "safe\n");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-q", "-m", "safe base"]);
    const base = runGit(root, ["rev-parse", "HEAD"]);

    writeFileSync(join(root, "All API Keys.docx"), "TEST-FIXTURE-NOT-REAL\n");
    runGit(root, ["add", "All API Keys.docx"]);
    runGit(root, ["commit", "-q", "-m", "unsafe fixture"]);
    rmSync(join(root, "All API Keys.docx"));
    runGit(root, ["add", "-u"]);
    runGit(root, ["commit", "-q", "-m", "remove fixture"]);
    const head = runGit(root, ["rev-parse", "HEAD"]);

    const result = runNode(script, ["security", "--range", `${base}..${head}`, "--tree", head], {
      cwd: root
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("path=All API Keys.docx");
    expect(result.stderr).toContain("rule=all-api-keys-docx");
    expect(result.stderr).not.toContain("TEST-FIXTURE-NOT-REAL");
  });

  it("scans each parent of a merge commit when a forbidden file is introduced by the merge and later removed", () => {
    const root = temporaryRoot("merge-range");
    const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(governanceScript, script);
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.name", "SENA governance test"]);
    runGit(root, ["config", "user.email", "sena-governance@example.invalid"]);
    writeFileSync(join(root, "README.md"), "safe\n");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-q", "-m", "base"]);
    const base = runGit(root, ["rev-parse", "HEAD"]);
    const trunk = runGit(root, ["branch", "--show-current"]);

    runGit(root, ["checkout", "-q", "-b", "side"]);
    writeFileSync(join(root, "side.txt"), "side\n");
    runGit(root, ["add", "side.txt"]);
    runGit(root, ["commit", "-q", "-m", "side"]);
    runGit(root, ["checkout", "-q", trunk]);
    writeFileSync(join(root, "main.txt"), "main\n");
    runGit(root, ["add", "main.txt"]);
    runGit(root, ["commit", "-q", "-m", "main"]);
    runGit(root, ["merge", "--no-commit", "side"]);
    writeFileSync(join(root, "All API Keys.docx"), "TEST-FIXTURE-NOT-REAL\n");
    runGit(root, ["add", "All API Keys.docx"]);
    runGit(root, ["commit", "-q", "-m", "merge with unsafe fixture"]);
    rmSync(join(root, "All API Keys.docx"));
    runGit(root, ["add", "-u"]);
    runGit(root, ["commit", "-q", "-m", "remove unsafe fixture"]);
    const head = runGit(root, ["rev-parse", "HEAD"]);

    const result = runNode(script, ["security", "--range", `${base}..${head}`, "--tree", head], {
      cwd: root
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("path=All API Keys.docx");
    expect(result.stderr).toContain("rule=all-api-keys-docx");
  });

  it("scans contaminated ancestors of a new branch even when another remote-tracking ref already reaches them", () => {
    const root = temporaryRoot("new-branch-ancestor");
    const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(governanceScript, script);
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.name", "SENA governance test"]);
    runGit(root, ["config", "user.email", "sena-governance@example.invalid"]);
    writeFileSync(join(root, "README.md"), "safe\n");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-q", "-m", "safe base"]);
    const base = runGit(root, ["rev-parse", "HEAD"]);
    runGit(root, ["update-ref", "refs/remotes/origin/main", base]);

    writeFileSync(join(root, "All API Keys.docx"), "TEST-FIXTURE-NOT-REAL\n");
    runGit(root, ["add", "All API Keys.docx"]);
    runGit(root, ["commit", "-q", "-m", "unsafe ancestor"]);
    rmSync(join(root, "All API Keys.docx"));
    runGit(root, ["add", "-u"]);
    runGit(root, ["commit", "-q", "-m", "remove unsafe path"]);
    const contaminatedRemote = runGit(root, ["rev-parse", "HEAD"]);
    runGit(root, ["update-ref", "refs/remotes/origin/contaminated", contaminatedRemote]);
    writeFileSync(join(root, "safe.txt"), "safe descendant\n");
    runGit(root, ["add", "safe.txt"]);
    runGit(root, ["commit", "-q", "-m", "safe descendant"]);
    const head = runGit(root, ["rev-parse", "HEAD"]);

    const result = runNode(script, ["security", "--pre-push", "--remote-name", "origin"], {
      cwd: root,
      input: `refs/heads/new ${head} refs/heads/new ${"0".repeat(40)}\n`
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("path=All API Keys.docx");
    expect(result.stderr).toContain("rule=all-api-keys-docx");
  });

  it("rejects ref deletion and non-fast-forward updates without an authorization receipt", () => {
    const root = temporaryRoot("ref-mutation");
    const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(governanceScript, script);
    runGit(root, ["init", "-q"]);
    runGit(root, ["config", "user.name", "SENA governance test"]);
    runGit(root, ["config", "user.email", "sena-governance@example.invalid"]);
    writeFileSync(join(root, "README.md"), "base\n");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-q", "-m", "base"]);
    const remoteSha = runGit(root, ["rev-parse", "HEAD"]);

    const deletion = runNode(script, ["security", "--pre-push", "--remote-name", "origin"], {
      cwd: root,
      input: `(delete) ${"0".repeat(40)} refs/heads/topic ${remoteSha}\n`
    });
    expect(deletion.status).toBe(1);
    expect(deletion.stderr).toContain("rule=ref-deletion-not-authorized");

    runGit(root, ["checkout", "-q", "--orphan", "rewrite"]);
    rmSync(join(root, "README.md"));
    writeFileSync(join(root, "replacement.txt"), "replacement\n");
    runGit(root, ["add", "-A"]);
    runGit(root, ["commit", "-q", "-m", "rewrite"]);
    const localSha = runGit(root, ["rev-parse", "HEAD"]);
    const rewrite = runNode(script, ["security", "--pre-push", "--remote-name", "origin"], {
      cwd: root,
      input: `refs/heads/topic ${localSha} refs/heads/topic ${remoteSha}\n`
    });
    expect(rewrite.status).toBe(1);
    expect(rewrite.stderr).toContain("rule=non-fast-forward-update-not-authorized");
  });

  it("rejects unknown active lane and disposition values instead of dropping them from writer counts", () => {
    const root = temporaryRoot("registry-enums");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const active = registry.workItems.find(isActiveWriter);
    active.laneType = "release-like-but-unregistered";
    active.disposition = "actively-writing-typo";
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["registry", "--registry", registryPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported disposition");
    expect(result.stderr).toContain("unsupported laneType");
  });

  it("binds a P0 freeze exception to the exact task, owner, branch, lane, and allowed paths", () => {
    const root = temporaryRoot("freeze-binding");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const active = registry.workItems.find(isActiveWriter);
    active.allowedPaths = ["sena-hk-template/app/**"];
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["registry", "--registry", registryPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lacks an exact P0 freeze-exception binding");
  });

  it("does not let an active work item reopen an integrated or frozen branch", () => {
    const root = temporaryRoot("branch-write-pairing");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const active = registry.workItems.find(isActiveWriter);
    const branch = registry.branches.find((entry: { name: string }) => entry.name === active.branch);
    branch.disposition = "integrated";
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["registry", "--registry", registryPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("disposition does not match its writable branch");
  });

  it("binds every outgoing update to the current registered branch on origin", () => {
    const fixture = createGovernedFixture("outgoing-owner-binding");
    const remoteSha = "0".repeat(40);
    const valid = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
      cwd: fixture.root,
      input: `${fixture.ref} ${fixture.head} ${fixture.ref} ${remoteSha}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(valid.status).toBe(0);

    const attempts = [
      ["refs/heads/main", "protected-main-direct-push-not-authorized"],
      ["refs/heads/unregistered", "outgoing-remote-ref-ownership-mismatch"],
      ["refs/rescue/leak", "rescue-ref-remote-push-not-authorized"]
    ];
    for (const [remoteRef, rule] of attempts) {
      const result = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
        cwd: fixture.root,
        input: `${fixture.ref} ${fixture.head} ${remoteRef} ${remoteSha}\n`,
        env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`rule=${rule}`);
    }
  });

  it("rejects empty pre-push input and non-origin remotes without falling back to HEAD", () => {
    const empty = runNode(governanceScript, ["security", "--pre-push", "--remote-name", "origin"], {
      cwd: projectRoot,
      input: ""
    });
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain("pre-push input is empty");

    const fixture = createGovernedFixture("non-origin");
    const nonOrigin = runNode(fixture.script, ["push-policy", "--remote-name", "backup"], {
      cwd: fixture.root,
      input: `${fixture.ref} ${fixture.head} ${fixture.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(nonOrigin.status).toBe(1);
    expect(nonOrigin.stderr).toContain("rule=non-origin-remote-not-authorized");
  });

  it("binds origin to the canonical SENA GitHub identity without echoing a hostile remote location", () => {
    const fixture = createGovernedFixture("remote-identity");
    const update = `${fixture.ref} ${fixture.head} ${fixture.ref} ${"0".repeat(40)}\n`;
    for (const location of [
      "https://github.com/HUDongpin/SENA.git",
      "git@github.com:HUDongpin/SENA.git",
      "ssh://git@github.com:22/HUDongpin/SENA.git"
    ]) {
      const accepted = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
        cwd: fixture.root,
        input: update,
        env: { SENA_GOVERNANCE_REMOTE_LOCATION: location }
      });
      expect(accepted.status).toBe(0);
    }

    const fakeToken = `ghp_${"R".repeat(40)}`;
    for (const location of [
      "https://github.com.evil/HUDongpin/SENA.git",
      `https://user:${fakeToken}@github.com/HUDongpin/SENA.git`,
      "https://github.com/HUDongpin/%53ENA.git",
      "https://github.com/HUDongpin/SENA.git/../other",
      "https://github.com/HUDongpin/SENA.git/."
    ]) {
      const blocked = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
        cwd: fixture.root,
        input: update,
        env: { SENA_GOVERNANCE_REMOTE_LOCATION: location }
      });
      const combined = `${blocked.stdout}${blocked.stderr}`;
      expect(blocked.status).toBe(1);
      expect(combined).toContain("rule=remote-location-identity-mismatch");
      expect(combined).not.toContain(fakeToken);
      expect(combined).not.toContain(location);
    }

    const missing = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
      cwd: fixture.root,
      input: update,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "" }
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("rule=remote-location-missing");
  });

  it("rejects a spoofed or ambiguous configured push URL even when origin fetch remains canonical", () => {
    const spoofed = createGovernedFixture("pushurl-spoof");
    runGit(spoofed.root, ["config", "remote.origin.pushurl", "https://evil.example/HUDongpin/SENA.git"]);
    const spoofedResult = runNode(spoofed.script, ["push-policy", "--remote-name", "origin"], {
      cwd: spoofed.root,
      input: `${spoofed.ref} ${spoofed.head} ${spoofed.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(spoofedResult.status).toBe(1);
    expect(spoofedResult.stderr).toContain("rule=configured-push-remote-identity-mismatch");

    const ambiguous = createGovernedFixture("pushurl-multiple");
    runGit(ambiguous.root, ["config", "--add", "remote.origin.pushurl", "https://github.com/HUDongpin/SENA.git"]);
    runGit(ambiguous.root, ["config", "--add", "remote.origin.pushurl", "https://evil.example/HUDongpin/SENA.git"]);
    const ambiguousResult = runNode(ambiguous.script, ["push-policy", "--remote-name", "origin"], {
      cwd: ambiguous.root,
      input: `${ambiguous.ref} ${ambiguous.head} ${ambiguous.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(ambiguousResult.status).toBe(1);
    expect(ambiguousResult.stderr).toContain("rule=configured-push-remote-identity-mismatch");

    const rewritten = createGovernedFixture("push-instead-of");
    runGit(rewritten.root, [
      "config",
      "url.https://evil.example/.pushInsteadOf",
      "https://github.com/"
    ]);
    const rewrittenResult = runNode(rewritten.script, ["push-policy", "--remote-name", "origin"], {
      cwd: rewritten.root,
      input: `${rewritten.ref} ${rewritten.head} ${rewritten.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(rewrittenResult.status).toBe(1);
    expect(rewrittenResult.stderr).toContain("rule=configured-push-remote-identity-mismatch");
  });

  it("rejects a hostile remote identity before the pre-push hook invokes any remote transport", () => {
    const fixture = createGovernedFixture("remote-before-live-audit");
    const helperDirectory = join(fixture.root, "helpers");
    const hookDirectory = join(fixture.root, ".githooks");
    const helperPath = join(helperDirectory, "git");
    const hookPath = join(hookDirectory, "pre-push");
    const sentinel = join(fixture.root, "transport-invoked.txt");
    mkdirSync(helperDirectory, { recursive: true });
    mkdirSync(hookDirectory, { recursive: true });
    const realGit = spawnSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    expect(realGit).not.toBe("");
    writeFileSync(helperPath, [
      "#!/bin/sh",
      "if [ \"$1\" = \"ls-remote\" ]; then",
      "  printf 'invoked\\n' > \"$SENA_TEST_TRANSPORT_SENTINEL\"",
      "  exit 1",
      "fi",
      "exec \"$SENA_TEST_REAL_GIT\" \"$@\"",
      ""
    ].join("\n"));
    chmodSync(helperPath, 0o700);
    copyFileSync(join(projectRoot, ".githooks", "pre-push"), hookPath);
    chmodSync(hookPath, 0o700);
    runGit(fixture.root, ["remote", "set-url", "origin", "evil::sentinel"]);

    const result = spawnSync(hookPath, ["origin", "evil::sentinel"], {
      cwd: fixture.root,
      input: `${fixture.ref} ${fixture.head} ${fixture.ref} ${"0".repeat(40)}\n`,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${helperDirectory}:${process.env.PATH ?? ""}`,
        SENA_TEST_TRANSPORT_SENTINEL: sentinel,
        SENA_TEST_REAL_GIT: realGit
      }
    });
    const combined = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(combined).toContain("configured-fetch-remote-identity-mismatch");
    expect(combined).not.toContain("evil::sentinel");
    expect(existsSync(sentinel)).toBe(false);
  });

  it("uses the staged registry snapshot, not a working-only allowlist overlay, for commit authorization", () => {
    const fixture = createGovernedFixture("index-registry-snapshot");
    const overlay = JSON.parse(JSON.stringify(fixture.registry));
    overlay.workItems[0].allowedPaths.push("outside.txt");
    overlay.policy.freezeExceptionBindings[0].allowedPaths.push("outside.txt");
    writeFileSync(fixture.registryPath, `${JSON.stringify(overlay, null, 2)}\n`);
    writeFileSync(join(fixture.root, "outside.txt"), "reviewable but outside the committed allowlist\n");
    runGit(fixture.root, ["add", "outside.txt"]);

    const blocked = runNode(
      fixture.script,
      ["write-policy", "--registry-from-index", "--staged"],
      { cwd: fixture.root }
    );
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("rule=staged-path-outside-commit-registry-allowlist");

    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    const auditable = runNode(
      fixture.script,
      ["write-policy", "--registry-from-index", "--staged"],
      { cwd: fixture.root }
    );
    expect(auditable.status).toBe(0);
    expect(auditable.stdout).toContain("registrySource=index");
  });

  it("uses the outgoing commit registry for push authorization and full rescue custody", () => {
    const fixture = createGovernedFixture("commit-registry-snapshot");
    const overlay = JSON.parse(JSON.stringify(fixture.registry));
    overlay.workItems[0].allowedPaths.push("outside.txt");
    overlay.policy.freezeExceptionBindings[0].allowedPaths.push("outside.txt");
    overlay.rescue.expectedRefCount = 0;
    writeFileSync(fixture.registryPath, `${JSON.stringify(overlay, null, 2)}\n`);
    writeFileSync(join(fixture.root, "outside.txt"), "unauthorized outgoing path\n");
    runGit(fixture.root, ["add", "outside.txt"]);
    runGit(fixture.root, ["commit", "-q", "-m", "outside committed registry authorization"]);
    const outgoing = runGit(fixture.root, ["rev-parse", "HEAD"]);

    const blocked = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
      cwd: fixture.root,
      input: `${fixture.ref} ${outgoing} ${fixture.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("rule=outgoing-head-not-permitted-by-commit-registry");

    const custody = runNode(
      fixture.script,
      ["audit", "--registry-from-commit", outgoing],
      { cwd: fixture.root }
    );
    const report = JSON.parse(custody.stdout);
    expect(report.errors).toContain("rescue ref count 0 does not equal registry expectation 26");
  });

  it("leaves a CI audit signal for forced, non-branch, and unregistered pushed refs", () => {
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const branch = registry.branches.find(isActiveWriter);
    const ref = `refs/heads/${branch.name}`;
    const head = runGit(projectRoot, ["rev-parse", ref]);
    const before = branch.remotePresent ? branch.remoteHeadSha : "0".repeat(40);
    const valid = runNode(
      governanceScript,
      [
        "security",
        "--push-event",
        "--event-ref",
        ref,
        "--event-before",
        before,
        "--event-after",
        head,
        "--event-forced",
        "false",
        "--event-deleted",
        "false"
      ],
      { cwd: projectRoot }
    );
    expect(valid.status).toBe(0);

    for (const [eventRef, forced, rule] of [
      ["refs/heads/unregistered", "false", "push-event-branch-unregistered"],
      [ref, "true", "forced-push-event-not-authorized"],
      ["refs/rescue/leak", "false", "rescue-ref-remote-push-not-authorized"]
    ]) {
      const result = runNode(
        governanceScript,
        [
          "security",
          "--push-event",
          "--event-ref",
          eventRef,
          "--event-before",
          before,
          "--event-after",
          head,
          "--event-forced",
          forced,
          "--event-deleted",
          "false"
        ],
        { cwd: projectRoot }
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`rule=${rule}`);
    }
  });

  it("binds work-item ownership to the branch ledger and forces stale ownerless-PR work into review", () => {
    const root = temporaryRoot("registry-lifecycle");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const active = registry.workItems.find(isActiveWriter);
    const branch = registry.branches.find((entry: { name: string }) => entry.name === active.branch);
    active.ownerKey = "mismatched-owner";
    active.prNumber = null;
    active.noPrReason = "fixture deliberately has no PR";
    branch.pr = null;
    branch.noPrReason = "fixture deliberately has no PR";
    branch.lastCommitAt = "2020-01-01T00:00:00Z";
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["registry", "--registry", registryPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ownerKey does not match its branch disposition");
    expect(result.stderr).toContain("older than seven days without a PR");
  });

  it("fails closed when an active lane misses its scheduled review", () => {
    const root = temporaryRoot("registry-review-deadline");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const active = registry.workItems.find(isActiveWriter);
    const branch = registry.branches.find((entry: { name: string }) => entry.name === active.branch);
    active.nextReviewAt = "2020-01-01T00:00:00Z";
    branch.nextReviewAt = "2020-01-01T00:00:00Z";
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["registry", "--registry", registryPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("active workItem");
    expect(result.stderr).toContain("active branch");
    expect(result.stderr).toContain("overdue nextReviewAt");
  });

  it("fails closed if a preserved orphan pointer identity differs from the custody registry", () => {
    const root = temporaryRoot("orphan-pointer");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    registry.orphanWorktrees[0].gitPointerTarget = "/invalid/replacement-pointer";
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["audit", "--registry", registryPath]);
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.errors.some((error: string) => error.includes("pointer identity changed"))).toBe(true);
  });

  it("rejects writes from the quarantined root checkout during the P0 freeze", () => {
    const result = runNode(governanceScript, ["audit", "--pre-commit"], {
      env: { SENA_GOVERNANCE_TARGET_ROOT: "/Volumes/Starship/SENA" }
    });
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.errors.some((error: string) => error.includes("security-quarantine branch"))).toBe(true);
  });

  it("reports owner blockers separately from machine-control failures", () => {
    const result = runNode(governanceScript, ["audit"]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe("blocked-owner");
    expect(report.errors).toEqual([]);
    expect(report.unreachableCommitCount).toBe(0);
    expect(report.invalidDiskMarkerCount).toBe(4);
    expect(report.ownerBlockers).toContain(
      "credential inventory, provider rotation/revocation, and remote contaminated-ref cleanup require owner action"
    );
  });

  it("does not leak a pre-commit candidate index into other registered worktrees", () => {
    const root = temporaryRoot("candidate-index-isolation");
    const sourceIndex = runGit(projectRoot, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
    const candidateIndex = join(root, "candidate-index");
    copyFileSync(sourceIndex, candidateIndex);

    const result = runNode(governanceScript, ["audit", "--pre-commit", "--registry-from-index"], {
      env: { GIT_INDEX_FILE: candidateIndex, GIT_OPTIONAL_LOCKS: "0" }
    });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.errors).toEqual([]);
    expect(report.status).toBe("blocked-owner");
  });

  it("enforces rescue bundle custody instead of trusting the ledger text", () => {
    const root = temporaryRoot("rescue-custody");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    registry.rescue.bundleSha256 = "0".repeat(64);
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["audit", "--registry", registryPath]);
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.errors).toContain("rescue bundle SHA-256 does not match registry");
  });
});
