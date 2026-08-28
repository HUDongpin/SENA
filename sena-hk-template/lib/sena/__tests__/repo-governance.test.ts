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
  existsSync,
  realpathSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

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

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
      refDeletionAuthorizations: [],
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
  it("does not downgrade a pre-push audit when the registry repo is a symlink alias of the control root", async () => {
    const controlRoot = temporaryRoot("audit-control-root");
    const aliasParent = temporaryRoot("audit-control-alias-parent");
    const registryRepoAlias = join(aliasParent, "repo-alias");
    symlinkSync(controlRoot, registryRepoAlias, "dir");
    const governance = await import(pathToFileURL(governanceScript).href);

    expect(
      governance.shouldRunPortableAudit(
        new Map([["pre-push", []]]),
        controlRoot,
        registryRepoAlias
      )
    ).toBe(false);
  });

  it("fails closed when an unresolvable registry-repo symlink would otherwise select portable audit", async () => {
    const controlRoot = temporaryRoot("audit-loop-control-root");
    const aliasParent = temporaryRoot("audit-loop-alias-parent");
    const registryRepoAlias = join(aliasParent, "repo-loop");
    symlinkSync(registryRepoAlias, registryRepoAlias, "dir");
    const governance = await import(pathToFileURL(governanceScript).href);

    expect(() =>
      governance.shouldRunPortableAudit(
        new Map([["pre-push", []]]),
        controlRoot,
        registryRepoAlias
      )
    ).toThrow(/registry repo path cannot be resolved.*ELOOP/);
  });

  it("rejects an active worktree whose inside-looking symlink escapes the physical repository", () => {
    const fixture = createGovernedFixture("physical-custody-escape");
    const externalWorktree = temporaryRoot("physical-custody-external");
    const escapedAlias = join(fixture.root, "inside-looking-writer");
    symlinkSync(externalWorktree, escapedAlias, "dir");
    const registry = JSON.parse(readFileSync(fixture.registryPath, "utf8"));
    registry.workItems[0].worktreePath = escapedAlias;
    registry.workItems[0].cwd = escapedAlias;
    writeFileSync(fixture.registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(fixture.script, ["audit", "--registry", fixture.registryPath], {
      cwd: fixture.root
    });
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(
      report.errors.some((error: string) =>
        error.startsWith("active workItem physical repo/worktreePath/cwd custody escapes the control root")
      )
    ).toBe(true);
  });

  it("binds hook custody to the canonical control-root hooks directory", async () => {
    const controlRoot = temporaryRoot("hook-custody-control-root");
    const hooksPath = join(controlRoot, ".githooks");
    const benignAlias = join(controlRoot, "hooks-alias");
    const externalHooks = temporaryRoot("hook-custody-external");
    const externalAlias = join(controlRoot, "external-hooks-alias");
    mkdirSync(hooksPath, { recursive: true });
    symlinkSync(hooksPath, benignAlias, "dir");
    symlinkSync(externalHooks, externalAlias, "dir");
    const governance = await import(pathToFileURL(governanceScript).href);

    const relativeInternal = governance.resolveHookCustodyDirectory(
      controlRoot,
      controlRoot,
      ".githooks",
      ".githooks"
    );
    expect(relativeInternal).toEqual({ path: realpathSync(hooksPath), error: null });

    const benignAliasResult = governance.resolveHookCustodyDirectory(
      controlRoot,
      controlRoot,
      benignAlias,
      benignAlias
    );
    expect(benignAliasResult).toEqual({ path: realpathSync(hooksPath), error: null });

    const absoluteExternal = governance.resolveHookCustodyDirectory(
      controlRoot,
      controlRoot,
      externalHooks,
      externalHooks
    );
    expect(absoluteExternal.path).toBe(null);
    expect(absoluteExternal.error).toMatch(/outside the canonical control-root hooks directory/);

    const insideLookingExternal = governance.resolveHookCustodyDirectory(
      controlRoot,
      controlRoot,
      externalAlias,
      externalAlias
    );
    expect(insideLookingExternal.path).toBe(null);
    expect(insideLookingExternal.error).toMatch(/outside the canonical control-root hooks directory/);
  });

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

  it("permits a monotonic PR close after the recorded head advances only through allowed paths", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);

    expect(
      governance.monotonicPrTransitionAllowed({
        observationMode: "monotonic",
        recordedState: "OPEN",
        liveState: "MERGED",
        recordedHeadPresent: true,
        recordedHeadMatches: false,
        permittedForwardAdvance: true
      })
    ).toBe(true);
    expect(
      governance.monotonicPrTransitionAllowed({
        observationMode: "monotonic",
        recordedState: "OPEN",
        liveState: "MERGED",
        recordedHeadPresent: true,
        recordedHeadMatches: false,
        permittedForwardAdvance: false
      })
    ).toBe(false);
    expect(
      governance.monotonicPrTransitionAllowed({
        observationMode: "monotonic",
        recordedState: "MERGED",
        liveState: "OPEN",
        recordedHeadPresent: true,
        recordedHeadMatches: true,
        permittedForwardAdvance: true
      })
    ).toBe(false);
  });

  it("routes live remote and PR observations through the merge-aware active-advance helper", () => {
    const source = readFileSync(governanceScript, "utf8");
    expect(source).toContain(
      "permittedActiveAdvance(branchRecord.remoteHeadSha, liveHeadSha, activeItem)"
    );
    expect(source).toContain(
      "permittedActiveAdvance(branchRecord.prHeadSha, pr.headRefOid, activeItem)"
    );
    expect(source).toContain("changedPathsAcrossProtectedMainCandidateRange(");
    expect(source).not.toContain(
      "changedPathsAcrossCommitRange(branchRecord.remoteHeadSha, liveHeadSha)"
    );
    expect(source).not.toContain(
      "changedPathsAcrossCommitRange(branchRecord.prHeadSha, pr.headRefOid)"
    );
  });

  it("treats protected-main fast-forwards as baseline intake while still rejecting lane-authored path escapes", () => {
    const fixture = createGovernedFixture("protected-main-baseline-intake");
    const registry = JSON.parse(readFileSync(fixture.registryPath, "utf8"));
    registry.workItems[0].headSha = fixture.head;
    registry.workItems[0].allowedPaths = ["README.md"];
    registry.workItems[0].aheadBehind = { baseRef: "origin/main", ahead: 0, behind: 0 };
    registry.workItems[0].dirtyState = "clean-protected-main-baseline";
    registry.policy.freezeExceptionBindings[0].allowedPaths = ["README.md"];
    registry.branches[0].headSha = fixture.head;
    writeFileSync(fixture.registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "protected main governance heartbeat"]);
    const protectedMainHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", protectedMainHead]);

    const protectedMainAudit = runNode(
      fixture.script,
      ["audit", "--registry-from-commit", protectedMainHead],
      { cwd: fixture.root, env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root } }
    );
    const protectedMainReport = JSON.parse(protectedMainAudit.stdout);
    expect(protectedMainReport.errors).not.toContain(
      "workItem headSha is not a permitted forward-only allowed-path advance: SENA-GOVERNANCE-TEST-WRITER"
    );

    writeFileSync(join(fixture.root, "outside.txt"), "lane-authored path escape\n");
    runGit(fixture.root, ["add", "outside.txt"]);
    runGit(fixture.root, ["commit", "-q", "-m", "unauthorized lane candidate"]);
    const candidateAudit = runNode(
      fixture.script,
      ["audit", "--registry-from-commit", protectedMainHead],
      { cwd: fixture.root, env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root } }
    );
    const candidateReport = JSON.parse(candidateAudit.stdout);
    expect(candidateReport.errors).toContain(
      "workItem headSha is not a permitted forward-only allowed-path advance: SENA-GOVERNANCE-TEST-WRITER"
    );
  });

  it("allows exact integrated cleanup targets to fall farther behind protected main without allowing new lane commits", () => {
    const fixture = createGovernedFixture("integrated-cleanup-behind-drift");
    const candidateHead = fixture.head;

    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", candidateHead]);
    runGit(fixture.root, ["checkout", "-q", "--detach", candidateHead]);
    writeFileSync(join(fixture.root, "protected-main-closeout.txt"), "protected main closeout\n");
    runGit(fixture.root, ["add", "protected-main-closeout.txt"]);
    runGit(fixture.root, ["commit", "-q", "-m", "protected main closeout"]);
    const advancedMain = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", advancedMain]);
    runGit(fixture.root, ["checkout", "-q", "topic"]);
    runGit(fixture.root, ["branch", "--set-upstream-to=origin/main", "topic"]);

    const registry = JSON.parse(readFileSync(fixture.registryPath, "utf8"));
    const item = registry.workItems[0];
    const branch = registry.branches[0];
    item.headSha = candidateHead;
    item.aheadBehind = { baseRef: "origin/main", ahead: 0, behind: 0 };
    item.dirtyState = "clean-integrated-awaiting-authorized-cleanup";
    item.disposition = "integrated";
    item.lastMergedPullRequest = {
      number: 9001,
      headSha: candidateHead,
      mergeCommitSha: advancedMain,
      mergedAt: new Date().toISOString(),
      postMainBuildRunId: 9002,
      postMainRepositorySecurityRunId: 9003,
      postMainChecksPassed: true
    };
    item.cleanupAuthorization = {
      status: "active",
      purpose: "integrated-lane-cleanup",
      ref: "refs/heads/topic",
      expectedOldSha: candidateHead,
      effectiveOnlyAfterThisCloseoutReachesProtectedMain: true,
      requiredCleanHeadSha: candidateHead,
      ordinaryLocalWorktreeRemoval: true,
      ordinaryLocalBranchDeletion: true,
      ordinaryRemoteBranchDeletion: true,
      forceResetRebaseOrHistoryRewrite: false,
      exactLeaseRequired: true,
      oneShot: true,
      operatorBranch: "topic",
      operatorTaskId: "SENA-GOVERNANCE-TEST-WRITER",
      operatorOwnerKey: "test-writer",
      githubActor: "HUDongpin",
      authorizedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      consumedAt: null,
      deletionEventId: null,
      executedBy: null,
      remoteRefAbsenceReadbackAt: null,
      result: null
    };
    branch.headSha = candidateHead;
    branch.upstream = "origin/main";
    branch.disposition = "integrated";
    branch.lastMergedPullRequest = {
      number: 9001,
      headSha: candidateHead,
      mergeCommitSha: advancedMain,
      mergedAt: item.lastMergedPullRequest.mergedAt
    };

    const registryRoot = temporaryRoot("integrated-cleanup-registry");
    const registryPath = join(registryRoot, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const integratedAudit = runNode(fixture.script, ["audit", "--registry", registryPath], {
      cwd: fixture.root,
      env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
    });
    const integratedReport = JSON.parse(integratedAudit.stdout);
    expect(integratedReport.errors).not.toContain(
      "workItem ahead/behind differs from registry: SENA-GOVERNANCE-TEST-WRITER"
    );
    expect(integratedReport.warnings).toContain(
      "integrated cleanup target fell farther behind protected main without changing head: SENA-GOVERNANCE-TEST-WRITER"
    );

    const mismatchedCleanup = structuredClone(registry);
    mismatchedCleanup.workItems[0].cleanupAuthorization.requiredCleanHeadSha = fixture.base;
    writeFileSync(registryPath, `${JSON.stringify(mismatchedCleanup, null, 2)}\n`);
    const mismatchedCleanupAudit = runNode(fixture.script, ["audit", "--registry", registryPath], {
      cwd: fixture.root,
      env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
    });
    const mismatchedCleanupReport = JSON.parse(mismatchedCleanupAudit.stdout);
    expect(mismatchedCleanupReport.errors).toContain(
      "workItem ahead/behind differs from registry: SENA-GOVERNANCE-TEST-WRITER"
    );
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    writeFileSync(join(fixture.root, "unauthorized-after-integration.txt"), "must remain blocked\n");
    runGit(fixture.root, ["add", "unauthorized-after-integration.txt"]);
    runGit(fixture.root, ["commit", "-q", "-m", "unauthorized post-integration lane commit"]);
    const mutatedAudit = runNode(fixture.script, ["audit", "--registry", registryPath], {
      cwd: fixture.root,
      env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
    });
    const mutatedReport = JSON.parse(mutatedAudit.stdout);
    expect(mutatedAudit.status).toBe(1);
    expect(mutatedReport.errors).toContain(
      "workItem headSha is not a permitted forward-only allowed-path advance: SENA-GOVERNANCE-TEST-WRITER"
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

  it("permits one exact quarantine-ref deletion only with active provider-readback authorization", () => {
    const fixture = createGovernedFixture("authorized-ref-deletion");
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const topic = fixture.registry.branches[0];
    fixture.registry.incident.credentialExposure.providerContainmentStatus = "complete";
    fixture.registry.incident.credentialExposure.remoteBranch = "quarantine";
    fixture.registry.incident.credentialExposure.commitSha = fixture.base;
    fixture.registry.policy.githubControlPlane.credentialQuarantineRuleset = {
      id: 9001,
      name: "test-quarantine-ruleset",
      enforcement: "active",
      targetRef: "refs/heads/quarantine",
      rules: ["creation", "deletion", "non_fast_forward"],
      soleBypassActor: "HUDongpin",
      soleBypassActorId: 47708816,
      observedAt: now
    };
    fixture.registry.branches.push({
      ...topic,
      name: "quarantine",
      owner: "security owner",
      ownerKey: "security-owner",
      upstream: "origin/quarantine",
      upstreamState: "live",
      upstreamCacheState: "present",
      remotePresent: true,
      remoteHeadSha: fixture.base,
      remoteObservedAt: now,
      pr: null,
      noPrReason: "test-only security quarantine",
      lastOwnerHeartbeatAt: null,
      lastObservedAt: now,
      lastCommitAt: now,
      nextReviewAt: expiresAt,
      expectedCloseAt: "owner-gated:test-exact-ref-deletion",
      disposition: "security-quarantine"
    });
    fixture.registry.policy.refDeletionAuthorizations = [
      {
        id: "TEST-QUARANTINE-DELETE",
        status: "active",
        ref: "refs/heads/quarantine",
        expectedOldSha: fixture.base,
        purpose: "credential-incident-containment",
        operatorBranch: "topic",
        operatorTaskId: "SENA-GOVERNANCE-TEST-WRITER",
        operatorOwnerKey: "test-writer",
        githubActor: "HUDongpin",
        githubActorId: 47708816,
        remoteRulesetId: 9001,
        remoteRulesetName: "test-quarantine-ruleset",
        remoteRulesetEnforcement: "active",
        authorizedBy: "test owner",
        authorizationBasis: "Explicit test fixture authorization with fake content only.",
        authorizedAt: now,
        expiresAt,
        providerReadbackAt: now,
        providerEvidenceId: "test-provider-readback",
        providerEvidenceSha256: "a".repeat(64),
        consumedAt: null,
        deletionEventId: null,
        executedBy: null,
        remoteRefAbsenceReadbackAt: null,
        result: null,
        exactLeaseRequired: true,
        oneShot: true
      }
    ];
    writeFileSync(fixture.registryPath, `${JSON.stringify(fixture.registry, null, 2)}\n`);
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "authorize exact quarantine deletion"]);
    const authorizationCommit = runGit(fixture.root, ["rev-parse", "HEAD"]);

    const unanchored = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
      cwd: fixture.root,
      input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(unanchored.status).toBe(1);
    expect(unanchored.stderr).toContain("protected-main authorization registry commit is required");

    const forgedFromWriterHead = runNode(
      fixture.script,
      [
        "push-policy",
        "--remote-name",
        "origin",
        "--authorization-registry-commit",
        authorizationCommit
      ],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`,
        env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
      }
    );
    expect(forgedFromWriterHead.status).toBe(1);
    expect(forgedFromWriterHead.stderr).toContain(
      "protected-main authorization registry is not the fetched origin/main commit"
    );

    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", authorizationCommit]);

    const authorized = runNode(
      fixture.script,
      [
        "push-policy",
        "--remote-name",
        "origin",
        "--authorization-registry-commit",
        authorizationCommit
      ],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`,
        env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
      }
    );
    expect(authorized.status).toBe(0);
    expect(authorized.stdout).toContain("SENA_PUSH_POLICY pass updates=1");

    const authorizedSecurity = runNode(
      fixture.script,
      [
        "security",
        "--pre-push",
        "--remote-name",
        "origin",
        "--authorization-registry-commit",
        authorizationCommit
      ],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`
      }
    );
    expect(authorizedSecurity.status).toBe(0);
    expect(authorizedSecurity.stdout).toContain("SENA_SECURITY_GATE pass");

    const authorizedPushEvent = runNode(
      fixture.script,
      [
        "security",
        "--push-event",
        "--event-ref",
        "refs/heads/quarantine",
        "--event-before",
        fixture.base,
        "--event-after",
        "0".repeat(40),
        "--event-forced",
        "false",
        "--event-deleted",
        "true",
        "--event-actor",
        "HUDongpin",
        "--authorization-registry-commit",
        authorizationCommit
      ],
      { cwd: fixture.root }
    );
    expect(authorizedPushEvent.status).toBe(0);

    const wrongActor = runNode(
      fixture.script,
      [
        "security",
        "--push-event",
        "--event-ref",
        "refs/heads/quarantine",
        "--event-before",
        fixture.base,
        "--event-after",
        "0".repeat(40),
        "--event-forced",
        "false",
        "--event-deleted",
        "true",
        "--event-actor",
        "unexpected-actor",
        "--authorization-registry-commit",
        authorizationCommit
      ],
      { cwd: fixture.root }
    );
    expect(wrongActor.status).toBe(1);
    expect(wrongActor.stderr).toContain("rule=ref-deletion-event-not-authorized");

    const readOnlyHelperDirectory = join(fixture.root, "readonly-ruleset-helper");
    const readOnlyGhPath = join(readOnlyHelperDirectory, "gh");
    mkdirSync(readOnlyHelperDirectory, { recursive: true });
    writeFileSync(
      readOnlyGhPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' '{\"id\":9001,\"name\":\"test-quarantine-ruleset\",\"target\":\"branch\",\"enforcement\":\"active\",\"conditions\":{\"ref_name\":{\"include\":[\"refs/heads/quarantine\"],\"exclude\":[]}},\"rules\":[{\"type\":\"deletion\"},{\"type\":\"non_fast_forward\"},{\"type\":\"creation\"}]}'",
        ""
      ].join("\n")
    );
    chmodSync(readOnlyGhPath, 0o700);
    const hiddenBypassForReadOnlyCi = runNode(
      fixture.script,
      [
        "deletion-boundary",
        "--push-event",
        "--event-actor",
        "HUDongpin",
        "--authorization-registry-commit",
        authorizationCommit
      ],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`,
        env: { PATH: `${readOnlyHelperDirectory}:${process.env.PATH ?? ""}` }
      }
    );
    expect(hiddenBypassForReadOnlyCi.status).toBe(0);
    const hiddenBypassForOwnerHook = runNode(
      fixture.script,
      ["deletion-boundary", "--authorization-registry-commit", authorizationCommit],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`,
        env: { PATH: `${readOnlyHelperDirectory}:${process.env.PATH ?? ""}` }
      }
    );
    expect(hiddenBypassForOwnerHook.status).toBe(1);
    expect(hiddenBypassForOwnerHook.stderr).toContain("live GitHub quarantine ruleset does not match");

    const wrongLease = runNode(
      fixture.script,
      [
        "push-policy",
        "--remote-name",
        "origin",
        "--authorization-registry-commit",
        authorizationCommit
      ],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.head}\n`,
        env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
      }
    );
    expect(wrongLease.status).toBe(1);
    expect(wrongLease.stderr).toContain("rule=ref-deletion-receipt-missing-or-inactive");

    fixture.registry.policy.refDeletionAuthorizations[0].status = "consumed";
    fixture.registry.policy.refDeletionAuthorizations[0].consumedAt = new Date().toISOString();
    fixture.registry.policy.refDeletionAuthorizations[0].deletionEventId = "test-delete-event";
    fixture.registry.policy.refDeletionAuthorizations[0].executedBy = "HUDongpin";
    fixture.registry.policy.refDeletionAuthorizations[0].remoteRefAbsenceReadbackAt = new Date().toISOString();
    fixture.registry.policy.refDeletionAuthorizations[0].result = "deleted";
    writeFileSync(fixture.registryPath, `${JSON.stringify(fixture.registry, null, 2)}\n`);
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "consume exact quarantine deletion receipt"]);
    const consumedCommit = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", consumedCommit]);
    const replay = runNode(
      fixture.script,
      [
        "push-policy",
        "--remote-name",
        "origin",
        "--authorization-registry-commit",
        consumedCommit
      ],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`,
        env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
      }
    );
    expect(replay.status).toBe(1);
    expect(replay.stderr).toContain("rule=ref-deletion-receipt-missing-or-inactive");
  });

  it("wires the complete pre-push deletion path to a freshly fetched protected-main registry", () => {
    const fixture = createGovernedFixture("authorized-ref-deletion-hook");
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const topic = fixture.registry.branches[0];
    runGit(fixture.root, ["branch", "main", fixture.base]);
    runGit(fixture.root, ["branch", "quarantine", fixture.base]);
    const evidenceRoot = temporaryRoot("authorized-ref-deletion-evidence");
    const bundlePath = join(evidenceRoot, "rescue.bundle");
    const inventoryPath = join(evidenceRoot, "orphan-inventory.json");
    runGit(fixture.root, ["bundle", "create", bundlePath, "topic"]);
    chmodSync(bundlePath, 0o600);
    writeFileSync(inventoryPath, `${JSON.stringify({ roots: [] }, null, 2)}\n`, { mode: 0o600 });
    fixture.registry.workItems[0].allowedPaths = [
      "README.md",
      ".githooks/**",
      "coordination/repo-governance/**",
      "helpers/**",
      "scripts/verify-sena-repo-governance.mjs"
    ];
    fixture.registry.policy.freezeExceptionBindings[0].allowedPaths =
      fixture.registry.workItems[0].allowedPaths;
    fixture.registry.rescue = {
      namespace: "refs/rescue/sena-test",
      expectedRefCount: 0,
      refListSha256: createHash("sha256").update("").digest("hex"),
      includes: [],
      fsckUnreachableCommitsAfter: 0,
      bundlePath,
      bundleSha256: sha256File(bundlePath),
      bundleVerify: "pass-complete-history",
      orphanInventory: {
        path: inventoryPath,
        sha256: sha256File(inventoryPath),
        fileCount: 0,
        originMainRepresentedCount: 0,
        diskOnlyCount: 0,
        diskOnlyReviewableSourceCount: 0,
        sensitiveRuntimeMetadataCount: 0,
        skippedGeneratedDirectoryCount: 0
      },
      diskOnlySourceCopies: [],
      remotePushAllowed: false
    };
    fixture.registry.incident = {
      credentialExposure: {
        status: "closed",
        closureEvidence: {
          providerReadbackAt: now,
          liveRefAuditAt: now,
          authorizedBy: "SENA governance test"
        },
        providerContainmentStatus: "complete",
        remoteBranch: "quarantine",
        commitSha: fixture.base,
        blobSha: "f".repeat(40),
        forbiddenPaths: ["All API Keys.docx", "sena-hk-template/All API Keys.docx"],
        liveMainSha: fixture.base,
        liveMainObservationMode: "lower-bound"
      }
    };
    fixture.registry.policy.githubControlPlane.credentialQuarantineRuleset = {
      id: 9002,
      name: "test-hook-quarantine-ruleset",
      enforcement: "active",
      targetRef: "refs/heads/quarantine",
      rules: ["creation", "deletion", "non_fast_forward"],
      soleBypassActor: "HUDongpin",
      soleBypassActorId: 47708816,
      observedAt: now
    };
    const quarantineBranch = {
      ...topic,
      name: "quarantine",
      owner: "security owner",
      ownerKey: "security-owner",
      upstream: "origin/quarantine",
      upstreamState: "live",
      upstreamCacheState: "present",
      remotePresent: true,
      remoteHeadSha: fixture.base,
      remoteObservedAt: now,
      pr: null,
      noPrReason: "test-only security quarantine",
      lastOwnerHeartbeatAt: null,
      lastObservedAt: now,
      lastCommitAt: now,
      nextReviewAt: expiresAt,
      expectedCloseAt: "owner-gated:test-exact-ref-deletion",
      disposition: "security-quarantine"
    };
    const mainBranch = {
      ...topic,
      name: "main",
      owner: "test protected main",
      ownerKey: "test-protected-main",
      baseSha: fixture.base,
      headSha: fixture.base,
      targetSha: fixture.base,
      upstream: "origin/main",
      upstreamState: "live",
      upstreamCacheState: "present",
      remotePresent: true,
      remoteHeadSha: fixture.base,
      remoteObservationMode: "lower-bound",
      remoteObservedAt: now,
      pr: null,
      prState: null,
      prIsDraft: false,
      prReadyForReview: false,
      mergeAuthorized: false,
      prHeadSha: null,
      prBase: null,
      noPrReason: "synthetic protected-main branch",
      prStateObservationMode: null,
      lastMergedPullRequest: null,
      lastOwnerHeartbeatAt: null,
      lastObservedAt: now,
      lastCommitAt: now,
      nextReviewAt: expiresAt,
      expectedCloseAt: expiresAt,
      disposition: "integrated",
      closeout: "synthetic protected-main lower-bound"
    };
    fixture.registry.branches.push(quarantineBranch, mainBranch);
    fixture.registry.policy.refDeletionAuthorizations = [
      {
        id: "TEST-HOOK-QUARANTINE-DELETE",
        status: "active",
        ref: "refs/heads/quarantine",
        expectedOldSha: fixture.base,
        purpose: "credential-incident-containment",
        operatorBranch: "topic",
        operatorTaskId: "SENA-GOVERNANCE-TEST-WRITER",
        operatorOwnerKey: "test-writer",
        githubActor: "HUDongpin",
        githubActorId: 47708816,
        remoteRulesetId: 9002,
        remoteRulesetName: "test-hook-quarantine-ruleset",
        remoteRulesetEnforcement: "active",
        authorizedBy: "test owner",
        authorizationBasis: "Explicit test fixture authorization with fake content only.",
        authorizedAt: now,
        expiresAt,
        providerReadbackAt: now,
        providerEvidenceId: "test-hook-provider-readback",
        providerEvidenceSha256: "b".repeat(64),
        consumedAt: null,
        deletionEventId: null,
        executedBy: null,
        remoteRefAbsenceReadbackAt: null,
        result: null,
        exactLeaseRequired: true,
        oneShot: true
      }
    ];
    writeFileSync(fixture.registryPath, `${JSON.stringify(fixture.registry, null, 2)}\n`);
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "authorize hook deletion from protected main"]);
    const authorizationCommit = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", authorizationCommit]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/quarantine", fixture.base]);
    runGit(fixture.root, ["branch", "--set-upstream-to=origin/main", "topic"]);
    runGit(fixture.root, ["branch", "--set-upstream-to=origin/main", "main"]);
    runGit(fixture.root, ["branch", "--set-upstream-to=origin/quarantine", "quarantine"]);

    const hookDirectory = join(fixture.root, ".githooks");
    const hookPath = join(hookDirectory, "pre-push");
    const preCommitHookPath = join(hookDirectory, "pre-commit");
    const helperDirectory = join(fixture.root, "helpers");
    const helperPath = join(helperDirectory, "git");
    const ghHelperPath = join(helperDirectory, "gh");
    mkdirSync(hookDirectory, { recursive: true });
    mkdirSync(helperDirectory, { recursive: true });
    copyFileSync(join(projectRoot, ".githooks", "pre-push"), hookPath);
    copyFileSync(join(projectRoot, ".githooks", "pre-commit"), preCommitHookPath);
    chmodSync(hookPath, 0o700);
    chmodSync(preCommitHookPath, 0o700);
    runGit(fixture.root, ["config", "core.hooksPath", ".githooks"]);
    const realGit = spawnSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    expect(realGit).not.toBe("");
    writeFileSync(
      helperPath,
      [
        "#!/bin/sh",
        "if [ \"$1\" = \"ls-remote\" ] && [ \"$2\" = \"--heads\" ] && [ \"$3\" = \"origin\" ]; then",
        "  printf '%s\\trefs/heads/main\\n' \"$SENA_TEST_AUTHORIZATION_SHA\"",
        "  exit 0",
        "fi",
        "if [ \"$1\" = \"ls-remote\" ] && [ \"$2\" = \"--heads\" ] && [ \"$3\" = \"--tags\" ]; then",
        "  printf '%s\\trefs/heads/main\\n' \"$SENA_TEST_AUTHORIZATION_SHA\"",
        "  printf '%s\\trefs/heads/quarantine\\n' \"$SENA_TEST_TARGET_SHA\"",
        "  exit 0",
        "fi",
        "if [ \"$1\" = \"fetch\" ]; then",
        "  exec \"$SENA_TEST_REAL_GIT\" update-ref refs/remotes/origin/main \"$SENA_TEST_AUTHORIZATION_SHA\"",
        "fi",
        "exec \"$SENA_TEST_REAL_GIT\" \"$@\"",
        ""
      ].join("\n")
    );
    chmodSync(helperPath, 0o700);
    writeFileSync(
      ghHelperPath,
      [
        "#!/bin/sh",
        "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"list\" ]; then",
        "  printf '%s\\n' '[]'",
        "  exit 0",
        "fi",
        "printf '%s\\n' '{\"id\":9002,\"name\":\"test-hook-quarantine-ruleset\",\"target\":\"branch\",\"enforcement\":\"active\",\"bypass_actors\":[{\"actor_id\":47708816,\"actor_type\":\"User\",\"bypass_mode\":\"always\"}],\"conditions\":{\"ref_name\":{\"include\":[\"refs/heads/quarantine\"],\"exclude\":[]}},\"rules\":[{\"type\":\"deletion\"},{\"type\":\"non_fast_forward\"},{\"type\":\"creation\"}]}'",
        ""
      ].join("\n")
    );
    chmodSync(ghHelperPath, 0o700);

    const result = spawnSync(hookPath, ["origin", "https://github.com/HUDongpin/SENA.git"], {
      cwd: fixture.root,
      input: `(delete) ${"0".repeat(40)} refs/heads/quarantine ${fixture.base}\n`,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${helperDirectory}:${process.env.PATH ?? ""}`,
        SENA_TEST_AUTHORIZATION_SHA: authorizationCommit,
        SENA_TEST_TARGET_SHA: fixture.base,
        SENA_TEST_REAL_GIT: realGit
      }
    });
    const combined = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(0);
    expect(combined).toContain("SENA_PUSH_IDENTITY pass");
    expect(combined).toContain("SENA_PUSH_POLICY pass updates=1");
    expect(combined).toContain("SENA_DELETION_BOUNDARY pass ruleset=9002");
    expect(combined).toContain("SENA_SECURITY_GATE pass");
  });

  it("allows one native-hook deletion for an exact merged clean lane cleanup and rejects drift", () => {
    const fixture = createGovernedFixture("integrated-cleanup-hook", [
      "README.md",
      ".gitignore",
      "coordination/repo-governance/**"
    ]);
    writeFileSync(join(fixture.root, ".gitignore"), ".worktrees/\n");
    runGit(fixture.root, ["add", ".gitignore"]);
    runGit(fixture.root, ["commit", "-q", "-m", "ignore fixture worktrees"]);
    const integratedHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["branch", "main", integratedHead]);
    const targetPath = join(fixture.root, ".worktrees", "cleanup-target");
    mkdirSync(dirname(targetPath), { recursive: true });
    runGit(fixture.root, ["worktree", "add", "-q", "-b", "cleanup-target", targetPath, integratedHead]);

    const evidenceRoot = temporaryRoot("integrated-cleanup-evidence");
    const bundlePath = join(evidenceRoot, "rescue.bundle");
    const inventoryPath = join(evidenceRoot, "orphan-inventory.json");
    runGit(fixture.root, ["bundle", "create", bundlePath, "topic"]);
    chmodSync(bundlePath, 0o600);
    writeFileSync(inventoryPath, `${JSON.stringify({ roots: [] }, null, 2)}\n`, { mode: 0o600 });

    const registry = JSON.parse(readFileSync(fixture.registryPath, "utf8"));
    const operator = registry.workItems[0];
    const operatorBranch = registry.branches[0];
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    operator.repo = fixture.root;
    operator.allowedPaths = [
      "README.md",
      ".gitignore",
      ".githooks/**",
      "cleanup-hook-helpers/**",
      "coordination/repo-governance/**",
      "scripts/verify-sena-repo-governance.mjs"
    ];
    operatorBranch.headSha = integratedHead;
    registry.policy.freezeExceptionBindings[0].allowedPaths = operator.allowedPaths;
    registry.rescue = {
      namespace: "refs/rescue/sena-test",
      expectedRefCount: 0,
      refListSha256: createHash("sha256").update("").digest("hex"),
      includes: [],
      fsckUnreachableCommitsAfter: 0,
      bundlePath,
      bundleSha256: sha256File(bundlePath),
      bundleVerify: "pass-complete-history",
      orphanInventory: {
        path: inventoryPath,
        sha256: sha256File(inventoryPath),
        fileCount: 0,
        originMainRepresentedCount: 0,
        diskOnlyCount: 0,
        diskOnlyReviewableSourceCount: 0,
        sensitiveRuntimeMetadataCount: 0,
        skippedGeneratedDirectoryCount: 0
      },
      diskOnlySourceCopies: [],
      remotePushAllowed: false
    };
    registry.incident = {
      credentialExposure: {
        status: "closed",
        closureEvidence: {
          providerReadbackAt: now,
          liveRefAuditAt: now,
          authorizedBy: "SENA governance test"
        },
        providerContainmentStatus: "complete",
        blobSha: "f".repeat(40),
        forbiddenPaths: ["All API Keys.docx", "sena-hk-template/All API Keys.docx"],
        liveMainSha: integratedHead,
        liveMainObservationMode: "lower-bound"
      }
    };
    const mainBranch = {
      ...operatorBranch,
      name: "main",
      owner: "test protected main",
      ownerKey: "test-protected-main",
      baseSha: integratedHead,
      headSha: integratedHead,
      targetSha: integratedHead,
      upstream: "origin/main",
      upstreamState: "live",
      upstreamCacheState: "present",
      remotePresent: true,
      remoteHeadSha: integratedHead,
      remoteObservationMode: "lower-bound",
      remoteObservedAt: now,
      pr: null,
      prState: null,
      prIsDraft: false,
      prReadyForReview: false,
      mergeAuthorized: false,
      prHeadSha: null,
      prBase: null,
      noPrReason: "synthetic protected-main branch",
      prStateObservationMode: null,
      lastMergedPullRequest: null,
      lastOwnerHeartbeatAt: null,
      lastObservedAt: now,
      lastCommitAt: now,
      nextReviewAt: expiresAt,
      expectedCloseAt: expiresAt,
      disposition: "integrated",
      closeout: "synthetic protected-main lower-bound"
    };
    const targetItem = {
      ...operator,
      taskId: "SENA-INTEGRATED-CLEANUP-TARGET",
      threadId: "test-cleanup-target-thread",
      cwd: targetPath,
      owner: "test cleanup target",
      ownerKey: "test-cleanup-target",
      ownerLane: "test integrated cleanup",
      branch: "cleanup-target",
      worktreePath: targetPath,
      baseSha: integratedHead,
      headSha: integratedHead,
      aheadBehind: { baseRef: "origin/main", ahead: 0, behind: 0 },
      allowedPaths: ["README.md"],
      lastHeartbeatAt: null,
      lastObservedAt: now,
      nextReviewAt: expiresAt,
      expectedCloseAt: expiresAt,
      prNumber: 9001,
      prIsDraft: false,
      prReadyForReview: true,
      mergeAuthorized: true,
      noPrReason: null,
      dirtyState: "clean-integrated-test-target",
      evidenceState: {
        local: "clean exact test fixture",
        ci: "test fixture checks passed",
        merged: "test fixture merged",
        deployed: "not authorized",
        live: "not claimed"
      },
      disposition: "integrated",
      lastMergedPullRequest: {
        number: 9001,
        headSha: integratedHead,
        mergeCommitSha: integratedHead,
        mergedAt: now,
        postMainBuildRunId: 9002,
        postMainRepositorySecurityRunId: 9003,
        postMainChecksPassed: true
      },
      cleanupAuthorization: {
        status: "active",
        purpose: "integrated-lane-cleanup",
        ref: "refs/heads/cleanup-target",
        expectedOldSha: integratedHead,
        effectiveOnlyAfterThisCloseoutReachesProtectedMain: true,
        requiredCleanHeadSha: integratedHead,
        ordinaryLocalWorktreeRemoval: true,
        ordinaryLocalBranchDeletion: true,
        ordinaryRemoteBranchDeletion: true,
        forceResetRebaseOrHistoryRewrite: false,
        exactLeaseRequired: true,
        oneShot: true,
        operatorBranch: "topic",
        operatorTaskId: operator.taskId,
        operatorOwnerKey: operator.ownerKey,
        githubActor: "HUDongpin",
        authorizedAt: now,
        expiresAt,
        consumedAt: null,
        deletionEventId: null,
        executedBy: null,
        remoteRefAbsenceReadbackAt: null,
        result: null
      }
    };
    const targetBranch = {
      ...operatorBranch,
      name: "cleanup-target",
      owner: targetItem.owner,
      ownerKey: targetItem.ownerKey,
      baseSha: integratedHead,
      headSha: integratedHead,
      upstream: "origin/cleanup-target",
      upstreamState: "live",
      upstreamCacheState: "present",
      remotePresent: true,
      remoteHeadSha: integratedHead,
      remoteObservedAt: now,
      pr: 9001,
      prState: "MERGED",
      prIsDraft: false,
      prReadyForReview: true,
      mergeAuthorized: true,
      prHeadSha: integratedHead,
      prBase: "main",
      noPrReason: null,
      prStateObservationMode: "monotonic",
      lastMergedPullRequest: {
        number: 9001,
        headSha: integratedHead,
        mergeCommitSha: integratedHead,
        mergedAt: now
      },
      lastOwnerHeartbeatAt: null,
      lastObservedAt: now,
      lastCommitAt: now,
      nextReviewAt: expiresAt,
      expectedCloseAt: expiresAt,
      disposition: "integrated",
      closeout: "test-only exact integrated cleanup target"
    };
    registry.workItems.push(targetItem);
    registry.branches.push(targetBranch, mainBranch);
    writeFileSync(fixture.registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "authorize exact integrated cleanup"]);
    const authorizationCommit = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", authorizationCommit]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/cleanup-target", integratedHead]);
    runGit(fixture.root, ["branch", "--set-upstream-to=origin/main", "topic"]);
    runGit(fixture.root, ["branch", "--set-upstream-to=origin/main", "main"]);
    runGit(targetPath, ["branch", "--set-upstream-to=origin/cleanup-target", "cleanup-target"]);

    const hookDirectory = join(fixture.root, ".githooks");
    const hookPath = join(hookDirectory, "pre-push");
    const preCommitHookPath = join(hookDirectory, "pre-commit");
    const helperDirectory = join(fixture.root, "cleanup-hook-helpers");
    const gitHelperPath = join(helperDirectory, "git");
    const ghHelperPath = join(helperDirectory, "gh");
    mkdirSync(hookDirectory, { recursive: true });
    mkdirSync(helperDirectory, { recursive: true });
    copyFileSync(join(projectRoot, ".githooks", "pre-push"), hookPath);
    copyFileSync(join(projectRoot, ".githooks", "pre-commit"), preCommitHookPath);
    chmodSync(hookPath, 0o700);
    chmodSync(preCommitHookPath, 0o700);
    runGit(fixture.root, ["config", "core.hooksPath", ".githooks"]);
    const realGit = spawnSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    writeFileSync(gitHelperPath, [
      "#!/bin/sh",
      "if [ \"$1\" = \"ls-remote\" ] && [ \"$2\" = \"--heads\" ] && [ \"$3\" = \"origin\" ]; then",
      "  printf '%s\\trefs/heads/main\\n' \"$SENA_TEST_AUTHORIZATION_SHA\"",
      "  exit 0",
      "fi",
      "if [ \"$1\" = \"ls-remote\" ] && [ \"$2\" = \"--heads\" ] && [ \"$3\" = \"--tags\" ]; then",
      "  printf '%s\\trefs/heads/main\\n' \"$SENA_TEST_AUTHORIZATION_SHA\"",
      "  printf '%s\\trefs/heads/cleanup-target\\n' \"$SENA_TEST_TARGET_SHA\"",
      "  exit 0",
      "fi",
      "if [ \"$1\" = \"fetch\" ]; then",
      "  exec \"$SENA_TEST_REAL_GIT\" update-ref refs/remotes/origin/main \"$SENA_TEST_AUTHORIZATION_SHA\"",
      "fi",
      "exec \"$SENA_TEST_REAL_GIT\" \"$@\"",
      ""
    ].join("\n"));
    chmodSync(gitHelperPath, 0o700);
    writeFileSync(ghHelperPath, [
      "#!/bin/sh",
      "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"list\" ]; then",
      `  printf '%s\\n' '[{"baseRefName":"main","closedAt":"${now}","headRefName":"cleanup-target","headRefOid":"${integratedHead}","mergedAt":"${now}","number":9001,"state":"MERGED"}]'`,
      "  exit 0",
      "fi",
      "printf '%s\\n' '[]'",
      ""
    ].join("\n"));
    chmodSync(ghHelperPath, 0o700);

    const hookEnvironment = {
      ...process.env,
      PATH: `${helperDirectory}:${process.env.PATH ?? ""}`,
      SENA_TEST_AUTHORIZATION_SHA: authorizationCommit,
      SENA_TEST_TARGET_SHA: integratedHead,
      SENA_TEST_REAL_GIT: realGit
    };
    const hookResult = spawnSync(hookPath, ["origin", "https://github.com/HUDongpin/SENA.git"], {
      cwd: fixture.root,
      input: `(delete) ${"0".repeat(40)} refs/heads/cleanup-target ${integratedHead}\n`,
      encoding: "utf8",
      env: hookEnvironment
    });
    const combined = `${hookResult.stdout}${hookResult.stderr}`;
    expect(hookResult.status, combined).toBe(0);
    expect(combined).toContain("SENA_PUSH_POLICY pass updates=1");
    expect(combined).toContain("SENA_DELETION_BOUNDARY pass cleanup=SENA-INTEGRATED-CLEANUP-TARGET");
    expect(combined).toContain("SENA_SECURITY_GATE pass");

    const directAudit = runNode(fixture.script, [
      "audit",
      "--pre-push",
      "--live",
      "--registry-from-commit",
      authorizationCommit
    ], {
      cwd: fixture.root,
      env: hookEnvironment
    });
    expect(directAudit.status, directAudit.stdout).toBe(0);
    const directAuditReport = JSON.parse(directAudit.stdout);
    expect(directAuditReport.schemaVersion).toBe("sena-repo-governance-audit/v1");
    expect(directAuditReport.schemaVersion).not.toBe("sena-repo-governance-portable-audit/v1");
    expect(directAuditReport.liveRemoteRefs.available).toBe(true);
    expect(directAuditReport.livePullRequests.available).toBe(true);
    expect(directAuditReport.rescueRefCount).toBe(0);
    expect(directAuditReport.registeredWorktreeCount).toBe(2);
    expect(directAuditReport.errors).toEqual([]);

    const drifted = runNode(fixture.script, [
      "push-policy",
      "--remote-name",
      "origin",
      "--authorization-registry-commit",
      authorizationCommit
    ], {
      cwd: fixture.root,
      input: `(delete) ${"0".repeat(40)} refs/heads/cleanup-target ${fixture.base}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(drifted.status).toBe(1);
    expect(drifted.stderr).toContain("rule=ref-deletion-receipt-missing-or-inactive");

    const wrongActor = runNode(fixture.script, [
      "security",
      "--push-event",
      "--event-ref",
      "refs/heads/cleanup-target",
      "--event-before",
      integratedHead,
      "--event-after",
      "0".repeat(40),
      "--event-forced",
      "false",
      "--event-deleted",
      "true",
      "--event-actor",
      "unexpected-actor",
      "--authorization-registry-commit",
      authorizationCommit
    ], { cwd: fixture.root });
    expect(wrongActor.status).toBe(1);
    expect(wrongActor.stderr).toContain("rule=ref-deletion-event-not-authorized");

    runGit(fixture.root, ["worktree", "remove", targetPath]);
    const externalWorktreeParent = temporaryRoot("integrated-cleanup-external-parent");
    const externalTargetPath = join(externalWorktreeParent, "cleanup-target");
    runGit(fixture.root, ["worktree", "add", "-q", externalTargetPath, "cleanup-target"]);
    symlinkSync(externalTargetPath, targetPath, "dir");

    const escapedPush = runNode(fixture.script, [
      "push-policy",
      "--remote-name",
      "origin",
      "--authorization-registry-commit",
      authorizationCommit
    ], {
      cwd: fixture.root,
      input: `(delete) ${"0".repeat(40)} refs/heads/cleanup-target ${integratedHead}\n`,
      env: {
        ...hookEnvironment,
        SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git"
      }
    });
    expect(escapedPush.status).toBe(1);

    const escapedBoundary = runNode(fixture.script, [
      "deletion-boundary",
      "--authorization-registry-commit",
      authorizationCommit
    ], {
      cwd: fixture.root,
      input: `(delete) ${"0".repeat(40)} refs/heads/cleanup-target ${integratedHead}\n`,
      env: hookEnvironment
    });
    expect(escapedBoundary.status).toBe(1);
    expect(escapedBoundary.stderr).toContain("deletion-boundary host physical custody is invalid");

    const escapedAudit = runNode(fixture.script, [
      "audit",
      "--pre-push",
      "--live",
      "--registry-from-commit",
      authorizationCommit
    ], {
      cwd: fixture.root,
      env: hookEnvironment
    });
    expect(escapedAudit.status).toBe(1);
    const escapedAuditReport = JSON.parse(escapedAudit.stdout);
    expect(
      escapedAuditReport.errors.some((error: string) =>
        error.startsWith("authorization-bearing workItem physical custody escapes the control root")
      )
    ).toBe(true);
  });

  it("keeps deletion-event CI on protected main with exact event SHA and actor custody", () => {
    const workflow = readFileSync(join(projectRoot, ".github", "workflows", "repo-security-gate.yml"), "utf8");
    expect(workflow).toContain("SENA_PUSH_HEAD_SHA: ${{ github.event.after }}");
    expect(workflow).not.toContain("SENA_PUSH_HEAD_SHA: ${{ github.sha }}");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).not.toContain("ref: main");
    expect(workflow).toContain("SENA_EVENT_MAIN_SHA: ${{ github.sha }}");
    expect(workflow).toContain('git update-ref refs/remotes/origin/main "$SENA_EVENT_MAIN_SHA"');
    expect(workflow.match(/if: github\.event_name != 'push' \|\| github\.event\.deleted != true/g)?.length).toBe(2);
    expect(workflow).toContain("--event-actor \"$SENA_PUSH_ACTOR\"");
    expect(workflow).toContain("deletion-boundary");
    expect(workflow).toContain("--authorization-registry-commit \"$authorization_sha\"");
    expect(workflow).toContain("cancel-in-progress: false");
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
    registry.incident.credentialExposure.status = "blocked-owner";
    delete registry.incident.credentialExposure.closureEvidence;
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

  it("scopes push-policy and push-event checks to lane commits after protected-main baseline intake", () => {
    const fixture = createGovernedFixture("push-protected-main-baseline");
    const registry = JSON.parse(readFileSync(fixture.registryPath, "utf8"));
    registry.workItems[0].headSha = fixture.head;
    registry.workItems[0].allowedPaths = ["README.md"];
    registry.workItems[0].aheadBehind = { baseRef: "origin/main", ahead: 0, behind: 0 };
    registry.workItems[0].dirtyState = "clean-protected-main-baseline";
    registry.policy.freezeExceptionBindings[0].allowedPaths = ["README.md"];
    registry.branches[0].headSha = fixture.head;
    writeFileSync(fixture.registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "protected main baseline intake"]);
    const protectedMainHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", protectedMainHead]);

    writeFileSync(join(fixture.root, "README.md"), "allowed lane candidate\n");
    runGit(fixture.root, ["add", "README.md"]);
    runGit(fixture.root, ["commit", "-q", "-m", "allowed lane candidate"]);
    const allowedHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
    const allowedPush = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
      cwd: fixture.root,
      input: `${fixture.ref} ${allowedHead} ${fixture.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(allowedPush.status, `${allowedPush.stdout}${allowedPush.stderr}`).toBe(0);
    const allowedEvent = runNode(fixture.script, [
      "security",
      "--push-event",
      "--event-ref",
      fixture.ref,
      "--event-before",
      "0".repeat(40),
      "--event-after",
      allowedHead,
      "--event-forced",
      "false",
      "--event-deleted",
      "false"
    ], { cwd: fixture.root });
    expect(allowedEvent.status, `${allowedEvent.stdout}${allowedEvent.stderr}`).toBe(0);

    runGit(fixture.root, ["switch", "-q", "-c", "protected-main-fixture", protectedMainHead]);
    writeFileSync(
      join(fixture.root, "coordination", "repo-governance", "heartbeat.txt"),
      "protected main only\n"
    );
    runGit(fixture.root, ["add", "coordination/repo-governance/heartbeat.txt"]);
    runGit(fixture.root, ["commit", "-q", "-m", "advance protected main control plane"]);
    const protectedMainAdvance = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", protectedMainAdvance]);
    runGit(fixture.root, ["switch", "-q", "topic"]);
    runGit(fixture.root, ["merge", "-q", "--no-edit", "origin/main"]);
    const mergedAllowedHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
    const mergedAllowedPush = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
      cwd: fixture.root,
      input: `${fixture.ref} ${mergedAllowedHead} ${fixture.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(mergedAllowedPush.status, `${mergedAllowedPush.stdout}${mergedAllowedPush.stderr}`).toBe(0);
    const mergedAllowedEvent = runNode(fixture.script, [
      "security",
      "--push-event",
      "--event-ref",
      fixture.ref,
      "--event-before",
      "0".repeat(40),
      "--event-after",
      mergedAllowedHead,
      "--event-forced",
      "false",
      "--event-deleted",
      "false"
    ], { cwd: fixture.root });
    expect(mergedAllowedEvent.status, `${mergedAllowedEvent.stdout}${mergedAllowedEvent.stderr}`).toBe(0);

    writeFileSync(join(fixture.root, "outside.txt"), "unauthorized lane path\n");
    runGit(fixture.root, ["add", "outside.txt"]);
    runGit(fixture.root, ["commit", "-q", "-m", "unauthorized lane candidate"]);
    const rejectedHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
    const rejectedPush = runNode(fixture.script, ["push-policy", "--remote-name", "origin"], {
      cwd: fixture.root,
      input: `${fixture.ref} ${rejectedHead} ${fixture.ref} ${"0".repeat(40)}\n`,
      env: { SENA_GOVERNANCE_REMOTE_LOCATION: "https://github.com/HUDongpin/SENA.git" }
    });
    expect(rejectedPush.status).toBe(1);
    expect(rejectedPush.stderr).toContain("rule=outgoing-head-not-permitted-by-commit-registry");
    const rejectedEvent = runNode(fixture.script, [
      "security",
      "--push-event",
      "--event-ref",
      fixture.ref,
      "--event-before",
      "0".repeat(40),
      "--event-after",
      rejectedHead,
      "--event-forced",
      "false",
      "--event-deleted",
      "false"
    ], { cwd: fixture.root });
    expect(rejectedEvent.status).toBe(1);
    expect(rejectedEvent.stderr).toContain("rule=push-event-head-not-permitted");
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
    const fixture = createGovernedFixture("quarantined-root");
    const registry = JSON.parse(readFileSync(fixture.registryPath, "utf8"));
    registry.incident.credentialExposure.status = "blocked-owner";
    delete registry.incident.credentialExposure.closureEvidence;
    registry.branches[0].disposition = "security-quarantine";
    writeFileSync(fixture.registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(fixture.script, ["audit", "--pre-commit"], {
      cwd: fixture.root,
      env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
    });
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.errors.some((error: string) => error.includes("security-quarantine branch"))).toBe(true);
  });

  it("reports owner blockers separately from machine-control failures", () => {
    const root = temporaryRoot("owner-blocker-state");
    const registry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    registry.incident.credentialExposure.status = "blocked-owner";
    delete registry.incident.credentialExposure.closureEvidence;
    for (const active of registry.workItems.filter(isActiveWriter)) {
      if (active.freezeException === "governance-preservation") continue;
      active.disposition = "integrated";
      const actualHead = runGit(projectRoot, ["rev-parse", active.branch]);
      active.headSha = actualHead;
      const [ahead, behind] = runGit(projectRoot, [
        "rev-list",
        "--left-right",
        "--count",
        `${active.branch}...${active.aheadBehind.baseRef}`
      ]).split(/\s+/).map(Number);
      active.aheadBehind = { ...active.aheadBehind, ahead, behind };
      const branch = registry.branches.find((entry: { name: string }) => entry.name === active.branch);
      branch.disposition = "integrated";
      branch.headSha = actualHead;
    }
    const registryPath = join(root, "active-work.json");
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, ["audit", "--registry", registryPath]);
    expect(result.status, result.stdout).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe("blocked-owner");
    expect(report.errors).toEqual([]);
    expect(report.unreachableCommitCount).toBe(0);
    expect(report.invalidDiskMarkerCount).toBe(4);
    expect(report.ownerBlockers).toContain(
      "credential inventory, provider rotation/revocation, and remote contaminated-ref cleanup require owner action"
    );
  });

  it("reports a closed incident with restored root control plane as pass", () => {
    const result = runNode(governanceScript, ["audit"]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe("pass");
    expect(report.errors).toEqual([]);
    expect(report.ownerBlockers).toEqual([]);
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
    expect(report.status).toBe("pass");
    expect(report.ownerBlockers).toEqual([]);
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
