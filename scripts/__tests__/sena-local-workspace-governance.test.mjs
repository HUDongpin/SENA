import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync, copyFileSync, existsSync as prExistsSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, rmSync, symlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_WORKSPACE_PATH, LOCAL_WORKSPACE_SCHEMA,
  captureLocalPreservation, hasLocalWorkspaceIdentity,
  localCandidateIdentity, mapHistoricalWorkspacePath, validateLocalWorkspace,
  validateLocalPush, validatePortableLocalWorkspace, isHistoricalLocalMainEvent,
  localWorkspaceHistoryTouches, isHistoricalUntouchedLocalWorkspaceEvent,
  localWorkspacePushRequiresTaskGate
} from "../sena-local-workspace-governance.mjs";

const REPO_ROOT_FOR_TEST = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const VERIFIER_PATH = join(REPO_ROOT_FOR_TEST, "scripts/verify-sena-repo-governance.mjs");
const LOCAL_MODULE_PATH = join(REPO_ROOT_FOR_TEST, "scripts/sena-local-workspace-governance.mjs");
const INTEGRATED_MAIN = "e8f8a78a226f4b6830a28cced3a728c89587025b";
const LEGACY_PATH = "coordination/repo-governance/active-work.json";
const TARGET_PATH = "app/page.tsx";
const sha = value => createHash("sha256").update(value).digest("hex");
const blob = value => createHash("sha1").update(`blob ${value.length}\0`).update(value).digest("hex");
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function runGit(root, args) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_") && key !== "GIT_OPTIONAL_LOCKS") delete env[key];
  }
  return execFileSync("git", ["--no-replace-objects", "-C", root, ...args], {
    env, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024
  });
}
const gitText = (root, args) => runGit(root, args).toString().trim();

function put(path, value, mode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
  if (mode !== undefined) chmodSync(path, mode);
}

function fixture(t) {
  const temp = mkdtempSync(join(realpathSync(tmpdir()), "sena-local-governance-test-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const controlRoot = join(temp, "control");
  mkdirSync(controlRoot);
  runGit(controlRoot, ["init", "--initial-branch=main"]);
  for (const [key, value] of [
    ["user.name", "SENA Governance Test"], ["user.email", "sena-test@example.invalid"],
    ["commit.gpgsign", "false"], ["core.hooksPath", ".githooks"]
  ]) runGit(controlRoot, ["config", key, value]);
  runGit(controlRoot, ["remote", "add", "origin", "https://github.com/HUDongpin/SENA.git"]);
  put(join(controlRoot, ".githooks/pre-commit"), "#!/bin/sh\nexit 0\n", 0o755);
  put(join(controlRoot, ".githooks/pre-push"), "#!/bin/sh\nexit 0\n", 0o755);
  put(join(controlRoot, "scripts/verify-sena-repo-governance.mjs"), "// Original fixture verifier.\n");
  put(join(controlRoot, "scripts/sena-local-workspace-governance.mjs"), "// Original fixture module.\n");
  put(join(controlRoot, TARGET_PATH), 'export const title = "Imported data";\n');
  put(join(controlRoot, "preserved.txt"), "Original unrelated researcher notes.\n");
  put(join(controlRoot, ".gitignore"), "orphan/\n");
  put(join(controlRoot, "orphan/preserved.txt"), "Preserved unregistered worktree source.\n");
  runGit(controlRoot, ["add", "."]);
  runGit(controlRoot, ["commit", "-m", "Create rescue source"]);
  const seed = gitText(controlRoot, ["rev-parse", "HEAD"]);
  const rescueRef = "refs/rescue/sena-fixture/source";
  runGit(controlRoot, ["update-ref", rescueRef, seed]);

  const custody = join(temp, "custody");
  mkdirSync(custody, { mode: 0o700 });
  const bundlePath = join(custody, "rescue.bundle");
  runGit(controlRoot, ["bundle", "create", bundlePath, rescueRef]);
  chmodSync(bundlePath, 0o600);
  const inventoryPath = join(custody, "orphan-inventory.json");
  put(inventoryPath, encode({ entries: [] }), 0o600);
  const diskSourcePath = join(custody, "retained-source.txt");
  const diskSource = Buffer.from("Unique retained fixture source.\n");
  put(diskSourcePath, diskSource, 0o600);
  const historical = {
    schemaVersion: "sena-repo-governance/v1", repo: "/Volumes/Starship/SENA",
    orphanWorktrees: [{ path: "/Volumes/Starship/SENA/orphan" }],
    rescue: {
      remotePushAllowed: false, namespace: "refs/rescue/sena-fixture", expectedRefCount: 1,
      refListSha256: sha(Buffer.from(`${rescueRef} ${seed}\n`)),
      bundlePath, bundleSha256: sha(readFileSync(bundlePath)),
      orphanInventory: { path: inventoryPath, sha256: sha(readFileSync(inventoryPath)) },
      diskOnlySourceCopies: [{ path: diskSourcePath, sha256: sha(diskSource), size: diskSource.length, gitBlob: blob(diskSource) }]
    }
  };
  const historicalBytes = encode(historical);
  put(join(controlRoot, LEGACY_PATH), historicalBytes);
  runGit(controlRoot, ["add", LEGACY_PATH]);
  runGit(controlRoot, ["commit", "-m", "Bind legacy governance evidence"]);
  const base = gitText(controlRoot, ["rev-parse", "HEAD"]);
  const branch = "codex/coding-scope-test";
  const root = join(temp, "task");
  runGit(controlRoot, ["worktree", "add", "-b", branch, root, base]);
  assert.equal(realpathSync(root), root);
  assert.equal(realpathSync(controlRoot), controlRoot);
  assert.equal(hasLocalWorkspaceIdentity(root), false);

  // These unrelated changes must survive byte-for-byte, not merely as dirty paths.
  put(join(controlRoot, "preserved.txt"), "Uncommitted owner notes, revision one.\n");
  put(join(controlRoot, "untracked-owner.txt"), "Untracked owner notes, revision one.\n");
  put(join(root, TARGET_PATH), 'export const title = "Coded Data and Reliability";\n');
  const registry = {
    schemaVersion: LOCAL_WORKSPACE_SCHEMA, repo: controlRoot,
    scope: "local-commit-only", historicalAuthority: "non-authorizing",
    historicalSource: {
      repo: historical.repo, commit: base,
      tree: gitText(root, ["rev-parse", `${base}^{tree}`]), registryPath: LEGACY_PATH,
      registryBlob: gitText(root, ["rev-parse", `${base}:${LEGACY_PATH}`]),
      registrySha256: sha(historicalBytes)
    },
    pathMapping: { from: historical.repo, to: controlRoot },
    authorization: {
      threadId: "fixture-thread", operations: ["relocate", "register", "branch", "commit"],
      userInstruction: "Migrate this fixture workspace, register this task, and commit locally."
    },
    task: {
      taskId: "SENA-CODING-SCOPE-TEST", ownerKey: "fixture-owner", threadId: "fixture-thread",
      worktreePath: root, branch, disposition: "active", baseSha: base,
      noPrReason: "Local commit only; remote operations are not authorized.",
      allowedPaths: [LOCAL_WORKSPACE_PATH, TARGET_PATH]
    },
    preservation: captureLocalPreservation(root, branch, [join(controlRoot, "orphan")])
  };
  const registryPath = join(root, LOCAL_WORKSPACE_PATH);
  const authorizationDirectory = join(controlRoot, ".git/sena-local-authorizations");
  mkdirSync(authorizationDirectory, { mode: 0o700 });
  chmodSync(authorizationDirectory, 0o700);
  const receiptPath = join(authorizationDirectory, `${registry.task.taskId}.json`);
  const writeRegistry = () => {
    put(registryPath, encode(registry));
    runGit(root, ["add", "--", LOCAL_WORKSPACE_PATH]);
  };
  writeRegistry();
  runGit(root, ["add", "--", TARGET_PATH]);
  const seal = () => {
    const now = Date.now();
    const receipt = {
      schemaVersion: "sena-local-commit-authorization/v1", taskId: registry.task.taskId,
      ownerKey: registry.task.ownerKey, authorization: registry.authorization,
      createdAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
      candidate: localCandidateIdentity(root, controlRoot)
    };
    put(receiptPath, encode(receipt), 0o600);
    return receipt;
  };
  seal();
  const validate = (requireStaged = true) => validateLocalWorkspace({
    root, controlRoot, registryBytes: readFileSync(registryPath), requireStaged
  });
  return {
    temp, root, controlRoot, base, branch, registry, registryPath, receiptPath,
    authorizationDirectory, historicalBytes, diskSourcePath, bundlePath, rescueRef,
    writeRegistry, seal, validate
  };
}

function rejectsRule(fn, rule) {
  assert.throws(fn, error => error instanceof Error && error.message.includes(`rule=local-workspace-${rule}`));
}

test("real linked worktree accepts its exact owner-authorized staged tree and preserves historical state", t => {
  const fx = fixture(t);
  const result = fx.validate();
  assert.equal(hasLocalWorkspaceIdentity(fx.root), true);
  assert.deepEqual(result, {
    schemaVersion: LOCAL_WORKSPACE_SCHEMA, taskId: fx.registry.task.taskId,
    localCommitAuthorized: true, durableCustody: "verified",
    historicalLiveCustody: "not-recertified", remoteOperationsAuthorized: false
  });
  assert.equal(gitText(fx.controlRoot, ["rev-parse", "HEAD"]), fx.base);
  assert.deepEqual(readFileSync(join(fx.root, LEGACY_PATH)), fx.historicalBytes);
  assert.deepEqual(captureLocalPreservation(fx.root, fx.branch, [join(fx.controlRoot, "orphan")]), fx.registry.preservation);
});

test("changed staged registry bytes cannot reuse an authorization for the previous index tree", t => {
  const fx = fixture(t);
  put(fx.registryPath, Buffer.concat([readFileSync(fx.registryPath), Buffer.from("\n")]));
  runGit(fx.root, ["add", "--", LOCAL_WORKSPACE_PATH]);
  rejectsRule(() => fx.validate(), "candidate-not-authorized");
});

test("a registry cannot redirect task ownership to a different worktree", t => {
  const fx = fixture(t);
  fx.registry.task.worktreePath = fx.controlRoot;
  fx.writeRegistry();
  fx.seal();
  rejectsRule(() => fx.validate(), "task-identity");
});

test("historical registry hash tampering is rejected even with a freshly sealed candidate", t => {
  const fx = fixture(t);
  fx.registry.historicalSource.registrySha256 = "0".repeat(64);
  fx.writeRegistry();
  fx.seal();
  rejectsRule(() => fx.validate(), "historical-registry-hash");
});

test("historical tree identity tampering cannot substitute another source", t => {
  const fx = fixture(t);
  fx.registry.historicalSource.tree = "0".repeat(40);
  fx.writeRegistry();
  fx.seal();
  rejectsRule(() => fx.validate(), "historical-source-identity");
});

test("working-copy mutation of the historical registry is rejected", t => {
  const fx = fixture(t);
  put(join(fx.root, LEGACY_PATH), Buffer.concat([fx.historicalBytes, Buffer.from("\n")]));
  rejectsRule(() => fx.validate(), "historical-registry-mutated");
});

test("an extra staged file remains outside scope even when the new index tree has a receipt", t => {
  const fx = fixture(t);
  put(join(fx.root, "unrelated.ts"), "export const unrelated = true;\n");
  runGit(fx.root, ["add", "--", "unrelated.ts"]);
  fx.seal();
  rejectsRule(() => fx.validate(), "staged-path-scope");
});

test("expired owner receipt cannot authorize the unchanged candidate", t => {
  const fx = fixture(t);
  const receipt = JSON.parse(readFileSync(fx.receiptPath));
  receipt.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  receipt.expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  put(fx.receiptPath, encode(receipt), 0o600);
  rejectsRule(() => fx.validate(), "authorization-expired");
});

test("changing bytes in an already dirty retained tracked file fails preservation", t => {
  const fx = fixture(t);
  const before = gitText(fx.controlRoot, ["status", "--porcelain=v1"]);
  put(join(fx.controlRoot, "preserved.txt"), "Uncommitted owner notes, revision two.\n");
  assert.equal(gitText(fx.controlRoot, ["status", "--porcelain=v1"]), before);
  rejectsRule(() => fx.validate(), "preservation-changed");
});

test("changing bytes in an already untracked retained file fails preservation", t => {
  const fx = fixture(t);
  const before = gitText(fx.controlRoot, ["status", "--porcelain=v1"]);
  put(join(fx.controlRoot, "untracked-owner.txt"), "Untracked owner notes, revision two.\n");
  assert.equal(gitText(fx.controlRoot, ["status", "--porcelain=v1"]), before);
  rejectsRule(() => fx.validate(), "preservation-changed");
});

test("altered disk-only source evidence fails its immutable custody hash", t => {
  const fx = fixture(t);
  put(fx.diskSourcePath, "Altered retained fixture source.\n", 0o600);
  rejectsRule(() => fx.validate(), "custody-file-hash");
});

test("altered rescue bundle bytes fail before evidence can be accepted", t => {
  const fx = fixture(t);
  put(fx.bundlePath, Buffer.concat([readFileSync(fx.bundlePath), Buffer.from("changed")]), 0o600);
  rejectsRule(() => fx.validate(), "custody-file-hash");
});

test("moved rescue ref is detected without deleting any retained reference", t => {
  const fx = fixture(t);
  runGit(fx.root, ["update-ref", fx.rescueRef, fx.base]);
  rejectsRule(() => fx.validate(), "rescue-refs");
});

test("a non-codex branch cannot borrow a valid task receipt", t => {
  const fx = fixture(t);
  runGit(fx.root, ["branch", "-m", "scratch/coding-scope-test"]);
  rejectsRule(() => fx.validate(), "branch");
});

test("a different codex branch cannot borrow the registered task identity", t => {
  const fx = fixture(t);
  runGit(fx.root, ["branch", "-m", "codex/another-task"]);
  rejectsRule(() => fx.validate(), "task-identity");
});

test("an alternate index is rejected even if it contains identical staged bytes", t => {
  const fx = fixture(t);
  const alternate = join(fx.temp, "alternate-index");
  copyFileSync(gitText(fx.root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]), alternate);
  const original = process.env.GIT_INDEX_FILE;
  process.env.GIT_INDEX_FILE = alternate;
  try {
    rejectsRule(() => fx.validate(), "alternate-index");
  } finally {
    if (original === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = original;
  }
});

test("a symlink in the receipt parent path cannot impersonate native authorization custody", t => {
  const fx = fixture(t);
  const alternateDirectory = join(fx.controlRoot, ".git/authorization-elsewhere");
  renameSync(fx.authorizationDirectory, alternateDirectory);
  symlinkSync(alternateDirectory, fx.authorizationDirectory, "dir");
  rejectsRule(() => fx.validate(), "path-not-physical");
});

test("a hardlinked owner receipt is rejected despite matching content and permissions", t => {
  const fx = fixture(t);
  linkSync(fx.receiptPath, join(fx.temp, "receipt-hardlink.json"));
  rejectsRule(() => fx.validate(), "authorization-file");
});

test("exact commit is inspectable but the same receipt cannot authorize another commit", t => {
  const fx = fixture(t);
  fx.validate();
  runGit(fx.root, ["commit", "-m", "Clarify coding scope"]);
  assert.equal(fx.validate(false).localCommitAuthorized, false);
  rejectsRule(() => fx.validate(), "single-commit-base");
  put(join(fx.root, TARGET_PATH), 'export const title = "A second change";\n');
  runGit(fx.root, ["add", "--", TARGET_PATH]);
  rejectsRule(() => fx.validate(), "single-commit-base");
  rejectsRule(() => fx.validate(false), "inspection-not-authorized");
});

test("orphan content changes cannot hide behind invalid Git metadata or ignore rules", t => {
  const fx = fixture(t);
  put(join(fx.controlRoot, "orphan/preserved.txt"), "Changed unregistered worktree source.\n");
  rejectsRule(() => fx.validate(), "preservation-changed");
});

test("a symlink at the native index path is rejected even when its bytes match", t => {
  const fx = fixture(t);
  const index = gitText(fx.root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  const moved = join(fx.temp, "moved-index");
  renameSync(index, moved);
  symlinkSync(moved, index);
  // Git versions may report the lexical or resolved index path; either
  // custody guard must reject the symlink.
  assert.throws(() => fx.validate(), /rule=local-workspace-(native-context|path-not-physical)/);
});

test("root relocation respects path-segment boundaries and preserves sibling custody paths", () => {
  const from = "/Volumes/Starship/SENA";
  const to = "/Volumes/Mars/SENA";
  assert.equal(mapHistoricalWorkspacePath(from, from, to), to);
  assert.equal(mapHistoricalWorkspacePath(`${from}/.worktrees/task`, from, to), `${to}/.worktrees/task`);
  for (const sibling of [`${from}的衍生文件`, `${from}-backups`]) {
    assert.equal(mapHistoricalWorkspacePath(sibling, from, to), sibling);
  }
});

const PR_REMOTE_URL = "https://github.com/HUDongpin/SENA.git";
const PR_ZERO_SHA = "0".repeat(40);

function publishingFixture(t) {
  const fx = fixture(t);
  fx.validate();
  runGit(fx.root, ["commit", "-m", "Commit original local coding scope"]);
  const firstCommit = gitText(fx.root, ["rev-parse", "HEAD"]);
  fx.registry.scope = "local-commit-and-pr";
  fx.registry.authorization.operations = ["commit", "push", "pr"];
  fx.registry.authorization.userInstruction = "Commit these changes and create a pull request.";
  fx.registry.task.commitBaseSha = firstCommit;
  fx.registry.task.noPrReason = "A PR is authorized after this exact branch is published.";
  fx.writeRegistry();
  fx.seal();
  fx.validate();
  runGit(fx.root, ["commit", "-m", "Bind explicit commit and PR authorization"]);
  const head = gitText(fx.root, ["rev-parse", "HEAD"]);
  const ref = `refs/heads/${fx.branch}`;
  const pushReceiptPath = join(fx.authorizationDirectory, `${fx.registry.task.taskId}.push.json`);
  const now = Date.now();
  const pushReceipt = {
    schemaVersion: "sena-local-push-authorization/v1",
    taskId: fx.registry.task.taskId, ownerKey: fx.registry.task.ownerKey,
    authorization: fx.registry.authorization,
    createdAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    candidate: localCandidateIdentity(fx.root, fx.controlRoot),
    remote: { name: "origin", url: PR_REMOTE_URL, ref, expectedOldSha: PR_ZERO_SHA }
  };
  put(pushReceiptPath, encode(pushReceipt), 0o600);
  const updatesText = `${ref} ${head} ${ref} ${PR_ZERO_SHA}\n`;
  return { ...fx, head, firstCommit, ref, pushReceipt, pushReceiptPath, updatesText };
}

// All native Git operations remain real. The only intercepted command is the
// exact public remote-ref observation. Unexpected external operations fail
// closed, and the sentinel proves validation actually made the observation.
function withRemoteObservation(fx, observed, action, addUntrackedDuringObservation = false) {
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = join(fx.temp, "remote-observation-bin");
  const sentinel = join(fx.temp, "remote-observation.log");
  put(join(bin, "git"), `#!${process.execPath}
import { appendFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const commandIndex = args.indexOf("ls-remote");
if (commandIndex >= 0) {
  const expected = ["--no-replace-objects", "-C", ${JSON.stringify(fx.root)},
    "ls-remote", "--refs", ${JSON.stringify(PR_REMOTE_URL)}, ${JSON.stringify(fx.ref)}];
  if (JSON.stringify(args) !== JSON.stringify(expected)) process.exit(97);
  appendFileSync(${JSON.stringify(sentinel)}, JSON.stringify(args) + "\\n");
  if (${addUntrackedDuringObservation}) writeFileSync(${JSON.stringify(join(fx.root, "unexpected.txt"))}, "concurrent file\\n");
  process.stdout.write(${JSON.stringify(observed)});
  process.exit(0);
}
if (args.some(arg => ["push", "fetch", "pull", "clone"].includes(arg))) process.exit(98);
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit", env: process.env });
process.exit(result.status ?? 99);
`, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  try {
    return action(() => prExistsSync(sentinel)
      ? readFileSync(sentinel, "utf8").trim().split("\n").filter(Boolean).length : 0);
  } finally {
    process.env.PATH = oldPath;
  }
}

function pushValidation(fx, overrides = {}) {
  return validateLocalPush({
    root: fx.root, controlRoot: fx.controlRoot, updatesText: fx.updatesText,
    remoteName: "origin", remoteLocation: PR_REMOTE_URL, ...overrides
  });
}

function portableFixture(t, kind) {
  const fx = publishingFixture(t);
  const root = join(fx.temp, "portable-clone");
  runGit(fx.temp, ["clone", "--no-local", "--no-hardlinks", fx.controlRoot, root]);
  runGit(root, ["remote", "set-url", "origin", PR_REMOTE_URL]);
  runGit(root, ["config", "user.name", "SENA Portable Test"]);
  runGit(root, ["config", "user.email", "sena-portable@example.invalid"]);
  runGit(root, ["config", "commit.gpgsign", "false"]);
  runGit(root, ["config", "core.hooksPath", ".githooks"]);
  runGit(root, ["checkout", "--detach", fx.head]);
  let checkout = fx.head;
  let event;
  let githubRef;
  if (kind === "pull_request") {
    checkout = gitText(root, ["commit-tree", `${fx.head}^{tree}`,
      "-p", fx.base, "-p", fx.head, "-m", "Synthetic PR merge"]);
    runGit(root, ["checkout", "--detach", checkout]);
    githubRef = "refs/pull/17/merge";
    event = {
      repository: { full_name: "HUDongpin/SENA" }, number: 17,
      pull_request: {
        base: { sha: fx.base, ref: "main", repo: { full_name: "HUDongpin/SENA" } },
        head: { sha: fx.head, ref: fx.branch, repo: { full_name: "HUDongpin/SENA" } }
      }
    };
  } else {
    githubRef = fx.ref;
    event = {
      repository: { full_name: "HUDongpin/SENA" }, ref: fx.ref,
      before: PR_ZERO_SHA, after: fx.head, deleted: false, forced: false
    };
  }
  const environment = {
    GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "HUDongpin/SENA",
    GITHUB_EVENT_NAME: kind, GITHUB_SHA: checkout, GITHUB_REF: githubRef
  };
  // The source fixture still has its original absolute paths in the committed
  // registry, but neither private receipt nor rescue evidence is reachable.
  renameSync(fx.authorizationDirectory, `${fx.authorizationDirectory}-offline`);
  renameSync(dirname(fx.bundlePath), `${dirname(fx.bundlePath)}-offline`);
  assert.equal(prExistsSync(join(root, ".git/sena-local-authorizations")), false);
  assert.equal(prExistsSync(fx.receiptPath), false);
  assert.equal(prExistsSync(fx.bundlePath), false);
  return { ...fx, root, event, environment, checkout };
}

test("PR delivery: exact branch push requires a real bounded remote observation", t => {
  const fx = publishingFixture(t);
  withRemoteObservation(fx, "", count => {
    assert.deepEqual(pushValidation(fx), {
      taskId: fx.registry.task.taskId, head: fx.head, ref: fx.ref, expectedOldSha: PR_ZERO_SHA
    });
    assert.equal(count(), 1);
  });
});

test("PR delivery: main, tags, deletion, wrong head and multiple refs cannot borrow push approval", t => {
  const fx = publishingFixture(t);
  const invalid = [
    `${fx.ref} ${fx.head} refs/heads/main ${PR_ZERO_SHA}\n`,
    `${fx.ref} ${fx.head} refs/tags/release ${PR_ZERO_SHA}\n`,
    `(delete) ${PR_ZERO_SHA} ${fx.ref} ${fx.head}\n`,
    `${fx.ref} ${fx.base} ${fx.ref} ${PR_ZERO_SHA}\n`,
    `${fx.ref} ${fx.head} ${fx.ref} ${fx.base}\n`
  ];
  withRemoteObservation(fx, "", count => {
    for (const updatesText of invalid) {
      rejectsRule(() => pushValidation(fx, { updatesText }), "push-update");
    }
    rejectsRule(() => pushValidation(fx, { updatesText: fx.updatesText.repeat(2) }), "push-update-count");
    assert.equal(count(), 0);
  });
});

test("PR delivery: wrong remote and stale receipt are rejected before external observation", t => {
  const fx = publishingFixture(t);
  withRemoteObservation(fx, "", count => {
    rejectsRule(() => pushValidation(fx, { remoteName: "another-origin" }), "push-remote-identity");
    rejectsRule(() => pushValidation(fx, { remoteLocation: "https://github.com/another/repository.git" }), "push-remote-identity");
    const receipt = structuredClone(fx.pushReceipt);
    receipt.candidate.head = fx.base;
    put(fx.pushReceiptPath, encode(receipt), 0o600);
    rejectsRule(() => pushValidation(fx), "push-candidate");
    receipt.candidate = fx.pushReceipt.candidate;
    receipt.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    receipt.expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    put(fx.pushReceiptPath, encode(receipt), 0o600);
    rejectsRule(() => pushValidation(fx), "authorization-expired");
    assert.equal(count(), 0);
  });
});

test("PR delivery: a changed live remote ref invalidates the exact new-branch approval", t => {
  const fx = publishingFixture(t);
  withRemoteObservation(fx, `${fx.base}\t${fx.ref}\n`, count => {
    rejectsRule(() => pushValidation(fx), "push-remote-changed");
    assert.equal(count(), 1);
  });
});

test("PR delivery: portable push provenance works without host custody and grants no authority", t => {
  const fx = portableFixture(t, "push");
  const result = validatePortableLocalWorkspace(fx);
  assert.equal(result.head, fx.head);
  assert.equal(result.sourceCommit, fx.base);
  assert.equal(result.portableProvenance, "verified");
  assert.equal(result.historicalLiveCustody, "not-recertified");
  assert.equal(result.localCommitAuthorized, false);
  assert.equal(result.remoteOperationsAuthorized, false);
});

test("PR delivery: detached PR merge validates its exact ordered base and head parents", t => {
  const fx = portableFixture(t, "pull_request");
  assert.equal(gitText(fx.root, ["rev-list", "--parents", "-n", "1", "HEAD"]),
    `${fx.checkout} ${fx.base} ${fx.head}`);
  const result = validatePortableLocalWorkspace(fx);
  assert.equal(result.kind, "pull_request");
  assert.equal(result.head, fx.head);
  assert.equal(result.localCommitAuthorized, false);
  assert.equal(result.remoteOperationsAuthorized, false);
});

test("PR delivery: portable push rejects wrong repository, checkout, ref and forced or deleted events", t => {
  const fx = portableFixture(t, "push");
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, environment: { ...fx.environment, GITHUB_ACTIONS: "false" }
  }), "ci-repository");
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, environment: { ...fx.environment, GITHUB_REPOSITORY: "another/repository" }
  }), "ci-repository");
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, environment: { ...fx.environment, GITHUB_SHA: fx.base }
  }), "ci-checkout");
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, environment: { ...fx.environment, GITHUB_REF: "refs/heads/main" }
  }), "ci-push-event");
  for (const patch of [{ forced: true }, { deleted: true }, { after: fx.base }]) {
    rejectsRule(() => validatePortableLocalWorkspace({
      ...fx, event: { ...fx.event, ...patch }
    }), "ci-push-event");
  }
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, event: { ...fx.event, ref: "refs/heads/codex/unregistered" },
    environment: { ...fx.environment, GITHUB_REF: "refs/heads/codex/unregistered" }
  }), "ci-task");
});

test("PR delivery: portable PR rejects fork identity and incorrect synthetic merge parents", t => {
  const fx = portableFixture(t, "pull_request");
  const event = structuredClone(fx.event);
  event.pull_request.head.repo.full_name = "another/SENA";
  rejectsRule(() => validatePortableLocalWorkspace({ ...fx, event }), "ci-pr-event");
  const wrongMerge = gitText(fx.root, ["commit-tree", `${fx.head}^{tree}`,
    "-p", fx.head, "-p", fx.base, "-m", "Wrong parent order"]);
  runGit(fx.root, ["checkout", "--detach", wrongMerge]);
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, environment: { ...fx.environment, GITHUB_SHA: wrongMerge }
  }), "ci-pr-checkout");
});

test("PR delivery: portable source identity cannot be rewritten by the candidate commit", t => {
  const fx = portableFixture(t, "push");
  const registry = JSON.parse(readFileSync(join(fx.root, LOCAL_WORKSPACE_PATH)));
  registry.historicalSource.registrySha256 = "0".repeat(64);
  put(join(fx.root, LOCAL_WORKSPACE_PATH), encode(registry));
  runGit(fx.root, ["add", "--", LOCAL_WORKSPACE_PATH]);
  runGit(fx.root, ["commit", "-m", "Tamper historical source hash"]);
  const tampered = gitText(fx.root, ["rev-parse", "HEAD"]);
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, event: { ...fx.event, after: tampered },
    environment: { ...fx.environment, GITHUB_SHA: tampered }
  }), "ci-source-identity");
});

test("PR delivery: intermediate out-of-scope changes remain rejected after their final-tree removal", t => {
  const fx = portableFixture(t, "push");
  put(join(fx.root, "outside-scope.ts"), "export const unauthorized = true;\n");
  runGit(fx.root, ["add", "--", "outside-scope.ts"]);
  runGit(fx.root, ["commit", "-m", "Add out-of-scope source"]);
  runGit(fx.root, ["rm", "--", "outside-scope.ts"]);
  runGit(fx.root, ["commit", "-m", "Remove out-of-scope source"]);
  const changed = gitText(fx.root, ["rev-parse", "HEAD"]);
  assert.equal(gitText(fx.root, ["diff", "--name-only", fx.head, changed]), "");
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, event: { ...fx.event, after: changed },
    environment: { ...fx.environment, GITHUB_SHA: changed }
  }), "ci-history-scope");
});

test("PR delivery: portable allowlists require exact relative-path arrays", t => {
  const fx = portableFixture(t, "push");
  for (const paths of ["app/page.tsx coordination/repo-governance/local-workspace.json", ["**"], ["../outside"]]) {
    const registry = JSON.parse(readFileSync(join(fx.root, LOCAL_WORKSPACE_PATH)));
    registry.task.allowedPaths = paths;
    put(join(fx.root, LOCAL_WORKSPACE_PATH), encode(registry));
    runGit(fx.root, ["add", "--", LOCAL_WORKSPACE_PATH]);
    runGit(fx.root, ["commit", "-m", "Malformed portable allowlist"]);
    const head = gitText(fx.root, ["rev-parse", "HEAD"]);
    rejectsRule(() => validatePortableLocalWorkspace({
      ...fx, event: { ...fx.event, after: head },
      environment: { ...fx.environment, GITHUB_SHA: head }
    }), "ci-allowed-paths");
  }
});

test("PR delivery: an extra in-scope descendant still needs its own commit-base registration", t => {
  const fx = portableFixture(t, "push");
  put(join(fx.root, TARGET_PATH), "export const anotherChange = true;\n");
  runGit(fx.root, ["add", "--", TARGET_PATH]);
  runGit(fx.root, ["commit", "-m", "Unregistered next commit"]);
  const head = gitText(fx.root, ["rev-parse", "HEAD"]);
  rejectsRule(() => validatePortableLocalWorkspace({
    ...fx, event: { ...fx.event, after: head },
    environment: { ...fx.environment, GITHUB_SHA: head }
  }), "ci-commit-base");
});

test("PR delivery: a new untracked file during remote read fails the final clean barrier", t => {
  const fx = publishingFixture(t);
  withRemoteObservation(fx, "", () => {
    rejectsRule(() => pushValidation(fx), "push-final-observation-changed");
  }, true);
});

test("PR delivery: integrated main retires task authority without pinning future ledger bytes", t => {
  const fx = portableFixture(t, "push");
  const integrated = gitText(fx.root, ["commit-tree", `${fx.head}^{tree}`,
    "-p", fx.base, "-p", fx.head, "-m", "Integrate reviewed feature"]);
  runGit(fx.root, ["checkout", "--detach", integrated]);
  put(join(fx.root, LEGACY_PATH), Buffer.concat([readFileSync(join(fx.root, LEGACY_PATH)), Buffer.from("\n")]));
  runGit(fx.root, ["add", LEGACY_PATH]);
  runGit(fx.root, ["commit", "-m", "Later legitimate ledger update"]);
  const after = gitText(fx.root, ["rev-parse", "HEAD"]);
  const event = { ...fx.event, ref: "refs/heads/main", before: integrated, after };
  const environment = { ...fx.environment, GITHUB_REF: event.ref, GITHUB_SHA: after };
  assert.equal(isHistoricalLocalMainEvent({ root: fx.root, event, environment }), true);
  rejectsRule(() => isHistoricalLocalMainEvent({
    root: fx.root, event: { ...event, forced: true }, environment
  }), "ci-main-event");
  assert.equal(isHistoricalLocalMainEvent(fx), false);
});

function governanceProcessEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_") && key !== "GIT_OPTIONAL_LOCKS") delete env[key];
    if (key.startsWith("GITHUB_")) delete env[key];
  }
  delete env.SENA_GOVERNANCE_TARGET_ROOT;
  delete env.SENA_GOVERNANCE_CONTROL_ROOT;
  delete env.SENA_GOVERNANCE_REMOTE_LOCATION;
  return { ...env, ...overrides };
}

function runVerifier(script, args, { cwd, env, input } = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd, env, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
}

function outputOf(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.slice(0, 4000);
}

function cloneIntegratedMain(t) {
  const temp = mkdtempSync(join(realpathSync(tmpdir()), "sena-local-pr-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, "repo");
  runGit(REPO_ROOT_FOR_TEST, ["clone", "--local", REPO_ROOT_FOR_TEST, root]);
  for (const [key, value] of [
    ["user.name", "SENA Governance Test"],
    ["user.email", "sena-test@example.invalid"],
    ["commit.gpgsign", "false"]
  ]) runGit(root, ["config", key, value]);
  runGit(root, ["checkout", "--detach", INTEGRATED_MAIN]);
  return { temp, root };
}

function useWorkspaceVerifier(root) {
  copyFileSync(VERIFIER_PATH, join(root, "scripts/verify-sena-repo-governance.mjs"));
  copyFileSync(LOCAL_MODULE_PATH, join(root, "scripts/sena-local-workspace-governance.mjs"));
}

function commitFile(root, path, message) {
  runGit(root, ["add", "--", path]);
  runGit(root, ["commit", "-m", message]);
  return gitText(root, ["rev-parse", "HEAD"]);
}

function writePullRequestEvent(directory, { number, base, head, branch }) {
  const path = join(directory, `event-${number}.json`);
  writeFileSync(path, JSON.stringify({
    repository: { full_name: "HUDongpin/SENA" },
    number,
    pull_request: {
      base: { ref: "main", sha: base, repo: { full_name: "HUDongpin/SENA" } },
      head: { ref: branch, sha: head, repo: { full_name: "HUDongpin/SENA" } }
    }
  }));
  return path;
}

function pullRequestEnv(eventPath, { number, checkout }) {
  return governanceProcessEnv({
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "HUDongpin/SENA",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REF: `refs/pull/${number}/merge`,
    GITHUB_SHA: checkout,
    GITHUB_EVENT_PATH: eventPath
  });
}

function runPullRequest(root, eventDirectory, { number, base, head, branch, args, checkout = head }) {
  const eventPath = writePullRequestEvent(eventDirectory, { number, base, head, branch });
  runGit(root, ["checkout", "-f", "--detach", checkout]);
  useWorkspaceVerifier(root);
  const script = join(root, "scripts/verify-sena-repo-governance.mjs");
  return runVerifier(script, args, {
    cwd: root,
    env: pullRequestEnv(eventPath, { number, checkout })
  });
}

function assertSameVerifierResult(actual, expected) {
  assert.equal(actual.status, expected.status, outputOf(actual));
  assert.equal(actual.stderr, expected.stderr);
  assert.equal(actual.stdout, expected.stdout);
  assert.match(`${actual.stdout}\n${actual.stderr}`, /SENA_REPO_REGISTRY/);
  assert.doesNotMatch(`${actual.stdout}\n${actual.stderr}`, /local-workspace-/);
}

function directVerifier(root, args) {
  useWorkspaceVerifier(root);
  return runVerifier(join(root, "scripts/verify-sena-repo-governance.mjs"), args, {
    cwd: root,
    env: governanceProcessEnv()
  });
}

test("merged main runs registry verification outside the retired local-workspace worktree", () => {
  const result = runVerifier(VERIFIER_PATH, ["registry"], {
    cwd: REPO_ROOT_FOR_TEST,
    env: governanceProcessEnv()
  });
  const output = outputOf(result);
  assert.match(output, /SENA_REPO_REGISTRY/);
  assert.doesNotMatch(output, /local-workspace-/);
});

test("a normal PR branch updated to main passes full verification", t => {
  const { temp, root } = cloneIntegratedMain(t);
  const base = gitText(root, ["rev-parse", "HEAD"]);
  put(join(root, "coordination/repo-governance/pr-normal-note.txt"), "ordinary pull request note\n");
  const head = commitFile(root, "coordination/repo-governance/pr-normal-note.txt", "Record an ordinary pull request note");
  runGit(root, ["checkout", "-f", "--detach", head]);
  const directRegistry = directVerifier(root, ["registry"]);
  const registry = runPullRequest(root, temp, {
    number: 201, base, head, branch: "cursor/normal-pr-updated-to-main", args: ["registry"]
  });
  assertSameVerifierResult(registry, directRegistry);
  const synthetic = gitText(root, ["commit-tree", `${head}^{tree}`, "-p", base, "-p", head, "-m", "Merge pull request"]);
  runGit(root, ["checkout", "-f", "--detach", synthetic]);
  const directSynthetic = directVerifier(root, ["registry"]);
  const syntheticRegistry = runPullRequest(root, temp, {
    number: 206, base, head, branch: "cursor/normal-pr-updated-to-main",
    args: ["registry"], checkout: synthetic
  });
  assert.equal(gitText(root, ["rev-list", "--parents", "-n", "1", synthetic]), `${synthetic} ${base} ${head}`);
  assertSameVerifierResult(syntheticRegistry, directSynthetic);
  const directAudit = directVerifier(root, ["audit", "--ci"]);
  const audit = runPullRequest(root, temp, {
    number: 201, base, head, branch: "cursor/normal-pr-updated-to-main", args: ["audit", "--ci"]
  });
  assert.equal(audit.status, directAudit.status, outputOf(audit));
  assert.doesNotMatch(outputOf(audit), /local-workspace-/);
  assert.match(audit.stdout, /sena-repo-governance-portable-audit\/v1/);
  const older = gitText(root, ["rev-parse", `${base}^1`]);
  runGit(root, ["checkout", "-f", "--detach", older]);
  put(join(root, "coordination/repo-governance/pr-merged-note.txt"), "note from before integration\n");
  commitFile(root, "coordination/repo-governance/pr-merged-note.txt", "Note from the pre-integration parent");
  runGit(root, ["merge", "--no-edit", base]);
  const merged = gitText(root, ["rev-parse", "HEAD"]);
  assert.equal(gitText(root, ["diff", "--name-only", base, merged, "--", LOCAL_WORKSPACE_PATH]), "");
  runGit(root, ["checkout", "-f", "--detach", merged]);
  const directMerged = directVerifier(root, ["registry"]);
  const mergedRegistry = runPullRequest(root, temp, {
    number: 202, base, head: merged, branch: "cursor/pr-merged-main", args: ["registry"]
  });
  assertSameVerifierResult(mergedRegistry, directMerged);
});

test("a clock-only active-work heartbeat passes ci-source-identity", t => {
  const { temp, root } = cloneIntegratedMain(t);
  const base = gitText(root, ["rev-parse", "HEAD"]);
  const ledger = join(root, LEGACY_PATH);
  const original = readFileSync(ledger, "utf8");
  const updated = original
    .replaceAll("2026-10-18T20:17:41Z", "2026-10-20T21:00:00Z")
    .replaceAll("2026-10-20T20:17:41Z", "2026-10-22T21:00:00Z");
  assert.notEqual(updated, original);
  put(ledger, updated);
  const head = commitFile(root, LEGACY_PATH, "governance: currentness heartbeat clock-only");
  assert.equal(gitText(root, ["diff", "--name-only", base, head]), LEGACY_PATH);
  runGit(root, ["checkout", "-f", "--detach", head]);
  const direct = directVerifier(root, ["registry"]);
  const result = runPullRequest(root, temp, {
    number: 203,
    base,
    head,
    branch: "codex/sena-coding-scope-mars-20261020",
    args: ["registry"]
  });
  assert.doesNotMatch(outputOf(result), /local-workspace-ci-source-identity/);
  assertSameVerifierResult(result, direct);
});

test("a PR that changes the local-workspace entry still gets the local-workspace gate", t => {
  const { temp, root } = cloneIntegratedMain(t);
  const base = gitText(root, ["rev-parse", "HEAD"]);
  const entry = join(root, LOCAL_WORKSPACE_PATH);
  const original = readFileSync(entry, "utf8");
  const updated = original.replace(
    "Owner authorized committing the scoped delivery update",
    "Owner authorized committing the scoped delivery update gate"
  );
  assert.notEqual(updated, original);
  put(entry, updated);
  const head = commitFile(root, LOCAL_WORKSPACE_PATH, "Touch the local-workspace entry");
  const result = runPullRequest(root, temp, {
    number: 204, base, head, branch: "cursor/touches-local-workspace", args: ["registry"]
  });
  assert.equal(result.status, 1, outputOf(result));
  assert.match(result.stderr, /rule=local-workspace-ci-task/);
  assert.doesNotMatch(outputOf(result), /SENA_REPO_REGISTRY pass/);

  runGit(root, ["checkout", "-f", "--detach", base]);
  put(entry, updated);
  const touched = commitFile(root, LOCAL_WORKSPACE_PATH, "Touch the local-workspace entry again");
  runGit(root, ["revert", "--no-edit", touched]);
  const restored = gitText(root, ["rev-parse", "HEAD"]);
  assert.equal(gitText(root, ["diff", "--name-only", base, restored, "--", LOCAL_WORKSPACE_PATH]), "");
  const reverted = runPullRequest(root, temp, {
    number: 205, base, head: restored, branch: "cursor/reverts-local-workspace", args: ["registry"]
  });
  assert.equal(reverted.status, 1, outputOf(reverted));
  assert.match(reverted.stderr, /rule=local-workspace-ci-task/);
});

test("an unrelated staged commit is not rejected by the retired local-workspace task", t => {
  const { root } = cloneIntegratedMain(t);
  put(join(root, "coordination/repo-governance/pr-staged-note.txt"), "staged ordinary note\n");
  runGit(root, ["add", "--", "coordination/repo-governance/pr-staged-note.txt"]);
  useWorkspaceVerifier(root);
  const result = runVerifier(join(root, "scripts/verify-sena-repo-governance.mjs"), [
    "write-policy", "--registry-from-index", "--staged"
  ], { cwd: root, env: governanceProcessEnv() });
  const output = outputOf(result);
  assert.equal(result.status, 1, output);
  assert.match(output, /index registry snapshot is invalid|index-writer-unregistered/);
  assert.doesNotMatch(output, /local-workspace-/);
});

test("a merge that restores the local-workspace entry still counts as a change", t => {
  const temp = mkdtempSync(join(realpathSync(tmpdir()), "sena-restore-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, "repo");
  mkdirSync(root);
  runGit(root, ["init", "-b", "main"]);
  for (const [key, value] of [
    ["user.name", "SENA Governance Test"], ["user.email", "sena-test@example.invalid"], ["commit.gpgsign", "false"]
  ]) runGit(root, ["config", key, value]);
  put(join(root, "README.md"), "root\n");
  runGit(root, ["add", "README.md"]);
  runGit(root, ["commit", "-m", "Root"]);
  const beforeEntry = gitText(root, ["rev-parse", "HEAD"]);
  const entry = join(root, LOCAL_WORKSPACE_PATH);
  put(entry, "{\"schemaVersion\":\"sena-local-workspace/v1\",\"task\":{\"worktreePath\":\"/nonexistent/sena-task\"}}\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "Add the entry"]);
  const main = gitText(root, ["rev-parse", "HEAD"]);
  runGit(root, ["checkout", "-b", "side"]);
  put(entry, "{\"schemaVersion\":\"sena-local-workspace/v1\",\"task\":{\"worktreePath\":\"/nonexistent/sena-task\"},\"changed\":true}\n");
  const edited = commitFile(root, LOCAL_WORKSPACE_PATH, "Change the entry");
  const restored = gitText(root, ["commit-tree", `${main}^{tree}`, "-p", edited, "-p", main, "-m", "Restore the entry"]);
  assert.equal(gitText(root, ["diff", "--name-only", main, restored, "--", LOCAL_WORKSPACE_PATH]), "");
  assert.equal(localWorkspaceHistoryTouches(root, main, restored), true);
  runGit(root, ["checkout", "-f", "--detach", restored]);
  const event = {
    repository: { full_name: "HUDongpin/SENA" },
    pull_request: {
      base: { ref: "main", sha: main, repo: { full_name: "HUDongpin/SENA" } },
      head: { ref: "side", sha: restored, repo: { full_name: "HUDongpin/SENA" } }
    }
  };
  assert.equal(isHistoricalUntouchedLocalWorkspaceEvent({
    root,
    event,
    environment: {
      GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "HUDongpin/SENA", GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF: "refs/heads/side", GITHUB_SHA: restored
    }
  }), false);
  put(join(root, "later.txt"), "later\n");
  const later = commitFile(root, "later.txt", "Unrelated follow-up");
  runGit(root, ["checkout", "-f", "--detach", later]);
  runGit(root, ["update-ref", "refs/heads/main", main]);
  assert.equal(localWorkspacePushRequiresTaskGate({
    root,
    head: later,
    updatesText: `refs/heads/side ${later} refs/heads/side ${edited}\n`
  }), true);
  runGit(root, ["update-ref", "refs/remotes/origin/main", beforeEntry]);
  runGit(root, ["update-ref", "refs/heads/main", main]);
  assert.equal(localWorkspacePushRequiresTaskGate({
    root,
    head: main,
    updatesText: `refs/heads/main ${main} refs/heads/main ${beforeEntry}\n`
  }), false);
});
