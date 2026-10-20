import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, rmSync, symlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LOCAL_WORKSPACE_PATH, LOCAL_WORKSPACE_SCHEMA,
  captureLocalPreservation, hasLocalWorkspaceIdentity,
  localCandidateIdentity, mapHistoricalWorkspacePath, validateLocalWorkspace
} from "../sena-local-workspace-governance.mjs";

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
  // Git resolves this symlink when reporting --git-path, so the native-path
  // equality guard rejects it before the later regular-file check.
  rejectsRule(() => fx.validate(), "native-context");
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
