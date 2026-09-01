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

function protectedCurrentnessRepairFrozenSourceForTest() {
  const verifierSource = readFileSync(governanceScript, "utf8");
  const declaration = verifierSource.match(
    /export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA\s*=\s*\n?\s*"([0-9a-f]{40})";/
  );
  if (!declaration) {
    throw new Error("missing exported protected currentness repair frozen seed head");
  }
  const headSha = declaration[1];
  const treeSha = runGit(projectRoot, [
    "--no-optional-locks",
    "rev-parse",
    `${headSha}^{tree}`
  ]);
  const registryBlobSha = runGit(projectRoot, [
    "--no-optional-locks",
    "rev-parse",
    `${headSha}:coordination/repo-governance/active-work.json`
  ]);
  const registry = JSON.parse(
    runGit(projectRoot, [
      "--no-optional-locks",
      "show",
      `${headSha}:coordination/repo-governance/active-work.json`
    ])
  );
  return { headSha, treeSha, registryBlobSha, registry };
}

function runGitWithEnvironment(
  root: string,
  args: string[],
  environment: Record<string, string>,
  input?: string
) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function treeFromCommitWithPathChanges(
  root: string,
  baseCommit: string,
  sourceCommit: string,
  sourcePaths: string[],
  changes: Array<
    | { kind: "remove"; path: string }
    | { kind: "copy"; from: string; to: string }
    | { kind: "content"; path: string; content: string }
  >
) {
  const indexRoot = temporaryRoot("isolated-git-index");
  const indexEnvironment = { GIT_INDEX_FILE: join(indexRoot, "index") };
  runGitWithEnvironment(root, ["read-tree", baseCommit], indexEnvironment);
  const installFromCommit = (from: string, to: string) => {
    const record = runGit(root, ["ls-tree", sourceCommit, "--", from]);
    const match = record.match(/^(\d+)\s+blob\s+([0-9a-f]{40})\t/);
    if (!match) throw new Error(`missing source blob for ${from}`);
    runGitWithEnvironment(
      root,
      ["update-index", "--add", "--cacheinfo", `${match[1]},${match[2]},${to}`],
      indexEnvironment
    );
  };
  for (const path of sourcePaths) installFromCommit(path, path);
  for (const change of changes) {
    if (change.kind === "remove") {
      runGitWithEnvironment(
        root,
        ["update-index", "--force-remove", change.path],
        indexEnvironment
      );
    } else if (change.kind === "copy") {
      installFromCommit(change.from, change.to);
    } else {
      const blob = runGitWithEnvironment(
        root,
        ["hash-object", "-w", "--stdin"],
        indexEnvironment,
        change.content
      );
      runGitWithEnvironment(
        root,
        ["update-index", "--add", "--cacheinfo", `100644,${blob},${change.path}`],
        indexEnvironment
      );
    }
  }
  return runGitWithEnvironment(root, ["write-tree"], indexEnvironment);
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

  const template = protectedCurrentnessRepairFrozenSourceForTest().registry;
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
    releaseReceipts: (template.releaseReceipts ?? []).filter(
      (entry: { receiptKind?: string }) =>
        ![
          "pr80-final-ready-test-repair-authorization-candidate",
          "pr80-final-ready-test-repair-final-authorization"
        ].includes(entry.receiptKind ?? "")
    ),
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

function createIntegratedMonotonicBehindFixture(label: string) {
  const fixture = createGovernedFixture(label);
  const hooksDirectory = join(fixture.root, ".githooks");
  mkdirSync(hooksDirectory, { recursive: true });
  for (const hookName of ["pre-commit", "pre-push"]) {
    const hookPath = join(hooksDirectory, hookName);
    writeFileSync(hookPath, "#!/bin/sh\nexit 0\n");
    chmodSync(hookPath, 0o700);
  }
  runGit(fixture.root, [
    "add",
    "scripts/verify-sena-repo-governance.mjs",
    ".githooks/pre-commit",
    ".githooks/pre-push"
  ]);
  runGit(fixture.root, ["commit", "-q", "-m", "track governed verifier and hooks"]);
  runGit(fixture.root, ["config", "core.hooksPath", ".githooks"]);
  const candidateHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
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
  const evidenceRoot = temporaryRoot(`${label}-evidence`);
  const bundlePath = join(evidenceRoot, "rescue.bundle");
  const inventoryPath = join(evidenceRoot, "orphan-inventory.json");
  runGit(fixture.root, ["bundle", "create", bundlePath, "topic"]);
  chmodSync(bundlePath, 0o600);
  writeFileSync(inventoryPath, `${JSON.stringify({ roots: [] }, null, 2)}\n`, {
    mode: 0o600
  });
  registry.rescue = {
    namespace: "refs/rescue/sena-monotonic-behind-test",
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
  item.headSha = candidateHead;
  item.aheadBehind = { baseRef: "origin/main", ahead: 0, behind: 0 };
  item.aheadBehindObservationMode = "integrated-monotonic-behind";
  item.dirtyState = "clean-integrated-monotonic-behind-observation";
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
  delete item.cleanupAuthorization;
  branch.headSha = candidateHead;
  branch.upstream = "origin/main";
  branch.disposition = "integrated";

  const registryRoot = temporaryRoot(`${label}-registry`);
  const observationRegistryPath = join(registryRoot, "active-work.json");
  writeFileSync(observationRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return {
    ...fixture,
    registry,
    observationRegistryPath,
    candidateHead,
    advancedMain
  };
}

function selectPr80InitialRegistry(
  currentRegistry: any,
  loadRegistryFromCommit: (commit: string) => any
) {
  const currentItem = currentRegistry.workItems?.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
  );
  const lifecycle = currentItem?.pr80FinalReadyTestRepairLifecycle;
  if (lifecycle?.status === "pr80-repair-authorization-candidate-awaiting-initial-checks") {
    return currentRegistry;
  }
  if (lifecycle?.status !== "pr80-ready-authorization-pending-final-head-checks") {
    throw new Error("unsupported PR80 lifecycle status for initial-registry selection");
  }
  const initialHeadSha = lifecycle.initialCandidateCompletionEvidence?.headSha;
  if (typeof initialHeadSha !== "string" || !/^[0-9a-f]{40}$/.test(initialHeadSha)) {
    throw new Error("PR80 final snapshot lacks an exact initial completion head");
  }
  return loadRegistryFromCommit(initialHeadSha);
}

const PROTECTED_CURRENTNESS_REPAIR_TASK_FOR_TEST =
  "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901";
const PROTECTED_CURRENTNESS_REPAIR_BRANCH_FOR_TEST =
  "codex/sena-protected-currentness-activation-repair-20260901";
const PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST = [
  "coordination/repo-governance/active-work.json",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md",
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST = [
  "coordination/repo-governance/active-work.json",
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const PR81_FINAL_REQUIRED_EXECUTION_FOR_TEST = [
  "stage-only-active-work-and-pass-index-audit-write-policy-security-native-pre-commit-and-49-of-49-governance-tests",
  "commit-and-push-the-initial-registry-only-pr81-candidate-and-create-draft-pr81",
  "verify-initial-pr81-exact-head-build-and-both-repository-security-checks-with-zero-annotations",
  "obtain-fresh-independent-read-only-spec-and-quality-reviews-of-the-exact-initial-head",
  "commit-and-push-one-registry-only-final-pr81-authorization-metadata-transition",
  "verify-final-pr81-exact-head-build-and-both-repository-security-checks-with-zero-annotations",
  "mark-pr81-ready-and-protected-merge-with-exact-head-lease-without-admin-bypass",
  "verify-pr81-post-main-build-security-zero-annotations-and-exact-main-commit-bound-live-audit",
  "only-after-pr81-protected-activation-and-audit-reenter-the-separately-gated-pr46-lifecycle",
  "stop-before-any-pr46-ready-merge-local-ref-retirement-receipt-minting-branch-worktree-orphan-target-tag-quarantine-deployment-provider-or-history-mutation"
];

function protectedCurrentnessRepairItemForTest(registry: any) {
  return registry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_FOR_TEST
  );
}

function protectedCurrentnessRepairBranchForTest(registry: any) {
  return registry.branches.find(
    (entry: { name?: string }) => entry.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH_FOR_TEST
  );
}

function expectedProtectedPr46ActivationRebindingForTest(
  sourceAuthorization: any,
  repairPrNumber: number
) {
  const expected = structuredClone(sourceAuthorization);
  expected.status = "pending-protected-activation";
  expected.authorizationSourceMainSha =
    "969a206b798c159e15ae0b6e5c76d0c94cca92ea";
  expected.authorizationSourceMainTreeSha =
    "c3d3d91ff7868939cb331a8c237349d6abbd9357";
  expected.authorizationSourceRegistryBlobSha =
    "b0f4bfd1f35d816e22774458a4bc1593c29a745b";
  expected.protectedActivationBinding = {
    mode: "loaded-fetched-origin-main-authorization-registry-commit",
    requiredReceiptKind: "pr82-protected-currentness-activation-repair-candidate",
    requiredFinalAuthorizationReceiptKind:
      "pr82-protected-currentness-activation-repair-final-authorization",
    requiredAuthorizationStatus: "pending-protected-activation",
    requiredActivationLifecycleStatus:
      "protected-currentness-activation-repair-ready-pending-final-head-checks",
    requiredActivationPullRequestNumber: repairPrNumber,
    mustDescendFromAuthorizationSourceMainSha: true,
    mustEqualFetchedOriginMain: true,
    postMainBuildRequired: true,
    postMainSecurityRequired: true,
    postMainAnnotationsMustBeEmpty: true,
    commitBoundLiveAuditRequired: true
  };
  expected.currentProtectedMainSha = expected.authorizationSourceMainSha;
  expected.currentProtectedMainTreeSha = expected.authorizationSourceMainTreeSha;
  expected.currentProtectedRegistryBlobSha = expected.authorizationSourceRegistryBlobSha;
  expected.currentConflictPathCount = 3;
  expected.currentConflictingPaths = [
    ...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST
  ];
  expected.currentCandidateOnlyCleanPaths = [];
  expected.authorizedResolverTransition.pendingState = {
    ...expected.authorizedResolverTransition.pendingState,
    conflictingPathsMustEqual: [
      ...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST
    ],
    cleanCandidateOnlyPathsMustEqual: [],
    cleanProtectedOnlyPathsMustEqual: [...PR46_REPAIR_PROTECTED_ONLY_PATHS_FOR_TEST],
    exactThreeFileResolutionMustPreserveProtectedRepairLifecycle: true
  };
  expected.authorizedResolverTransition.requiredRedGreenCases = [
    ...sourceAuthorization.authorizedResolverTransition.requiredRedGreenCases,
    ...PR46_REPAIR_REQUIRED_RED_GREEN_APPEND_FOR_TEST
  ];
  expected.requiredExecution = [...PR46_REPAIR_REQUIRED_EXECUTION_FOR_TEST];
  expected.finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation = true;
  expected.finalResolverAndTestStageAuthorizedAfterProtectedActivation = true;
  expected.finalMergeCommitPushAuthorizedAfterRequiredGates = true;
  expected.finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks = false;
  expected.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks = false;
  return expected;
}

function buildProtectedCurrentnessRepairInitialFixture(
  seedRegistry: any,
  seedHeadSha: string,
  pullRequestNumber: number
) {
  const registry = structuredClone(seedRegistry);
  const item = protectedCurrentnessRepairItemForTest(registry);
  const branch = protectedCurrentnessRepairBranchForTest(registry);
  const seedTreeSha = runGit(projectRoot, ["rev-parse", `${seedHeadSha}^{tree}`]);
  const seedRegistryBlobSha = runGit(projectRoot, [
    "rev-parse",
    `${seedHeadSha}:coordination/repo-governance/active-work.json`
  ]);
  const receiptPrefix = {
    count: registry.releaseReceipts.length,
    sha256: createHash("sha256")
      .update(JSON.stringify(registry.releaseReceipts))
      .digest("hex")
  };
  item.prNumber = pullRequestNumber;
  item.plannedPullRequestNumber = pullRequestNumber;
  item.noPrReason = null;
  item.prIsDraft = true;
  item.prReadyForReview = false;
  item.mergeAuthorized = false;
  item.headSha = seedHeadSha;
  item.allowedPaths = [...PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST];
  item.protectedCurrentnessActivationRepairLifecycle = {
    status: "protected-currentness-activation-repair-candidate-awaiting-initial-checks",
    oneShot: true,
    pullRequestNumber,
    protectedBaseSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    protectedBaseTreeSha: "c3d3d91ff7868939cb331a8c237349d6abbd9357",
    protectedBaseRegistryBlobSha: "b0f4bfd1f35d816e22774458a4bc1593c29a745b",
    designPlanSeedHeadSha: seedHeadSha,
    designPlanSeedTreeSha: seedTreeSha,
    designPlanSeedRegistryBlobSha: seedRegistryBlobSha,
    designPlanSeedReceiptPrefix: receiptPrefix,
    requiredOverallPaths: [...PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST],
    requiredImplementationPaths: [
      ...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST
    ],
    initialCandidateCompletionEvidence: null,
    finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks: true,
    repairReadyAndProtectedMergeAuthorizedAfterFinalChecks: false,
    pr46ReadyAndProtectedMergeAuthorizedNow: false,
    localRefRetirementAuthorized: false,
    retirementReceiptMintingAuthorized: false,
    branchDeletionAuthorized: false,
    worktreeRemovalAuthorized: false,
    orphanWorktreeMutationAuthorized: false,
    targetRefMutationAuthorized: false,
    targetTagMutationAuthorized: false,
    quarantineMutationAuthorized: false,
    deploymentAuthorized: false,
    providerMutationAuthorized: false,
    resetAuthorized: false,
    rebaseAuthorized: false,
    stashAuthorized: false,
    forceAuthorized: false,
    historyRewriteAuthorized: false
  };
  branch.pr = pullRequestNumber;
  branch.plannedPullRequestNumber = pullRequestNumber;
  branch.headSha = seedHeadSha;
  branch.upstream = `origin/${PROTECTED_CURRENTNESS_REPAIR_BRANCH_FOR_TEST}`;
  branch.upstreamState = "live";
  branch.upstreamCacheState = "present";
  branch.remotePresent = true;
  branch.remoteHeadSha = seedHeadSha;
  branch.prState = "OPEN";
  branch.prStateObservationMode = "monotonic";
  branch.prIsDraft = true;
  branch.prReadyForReview = false;
  branch.mergeAuthorized = false;
  branch.prBase = "main";
  branch.noPrReason = null;
  branch.prHeadSha = seedHeadSha;
  branch.mergeable = "MERGEABLE";
  branch.mergeStateStatus = "CLEAN";

  const retirement = registry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const sourceRetirement = seedRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  retirement.finalBaseHandshakeAuthorization =
    expectedProtectedPr46ActivationRebindingForTest(
      sourceRetirement.finalBaseHandshakeAuthorization,
      pullRequestNumber
    );
  registry.releaseReceipts.push({
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: "pr82-protected-currentness-activation-repair-candidate",
    taskId: item.taskId,
    ownerKey: item.ownerKey,
    scope: [...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST],
    authorizationBoundary: {
      finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks: true
    }
  });
  return {
    registry,
    context: { seedHeadSha, seedTreeSha, seedRegistryBlobSha, pullRequestNumber }
  };
}

function buildProtectedCurrentnessRepairFinalFixture(initial: any) {
  const registry = structuredClone(initial.registry);
  const item = protectedCurrentnessRepairItemForTest(registry);
  const lifecycle = item.protectedCurrentnessActivationRepairLifecycle;
  lifecycle.status =
    "protected-currentness-activation-repair-ready-pending-final-head-checks";
  lifecycle.initialCandidateCompletionEvidence = {
    headSha: "a".repeat(40),
    treeSha: "b".repeat(40),
    registryBlobSha: "c".repeat(40),
    verifierBlobSha: "d".repeat(40),
    governanceTestBlobSha: "e".repeat(40),
    buildRunId: 1,
    repositorySecurityRunIds: [2, 3],
    checkJobIds: [4, 5, 6],
    requiredChecksPassed: true,
    annotationsEmpty: true,
    specReviewApproved: true,
    qualityReviewApproved: true
  };
  lifecycle.finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks = false;
  lifecycle.repairReadyAndProtectedMergeAuthorizedAfterFinalChecks = true;
  item.headSha = lifecycle.initialCandidateCompletionEvidence.headSha;
  const branch = protectedCurrentnessRepairBranchForTest(registry);
  branch.headSha = lifecycle.initialCandidateCompletionEvidence.headSha;
  branch.remoteHeadSha = lifecycle.initialCandidateCompletionEvidence.headSha;
  branch.prHeadSha = lifecycle.initialCandidateCompletionEvidence.headSha;
  branch.prState = "OPEN";
  branch.prIsDraft = true;
  branch.prReadyForReview = false;
  branch.mergeAuthorized = false;
  branch.mergeable = "MERGEABLE";
  branch.mergeStateStatus = "CLEAN";
  registry.releaseReceipts.push({
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: "pr82-protected-currentness-activation-repair-final-authorization",
    taskId: item.taskId,
    ownerKey: item.ownerKey,
    scope: ["coordination/repo-governance/active-work.json"],
    ...structuredClone(lifecycle.initialCandidateCompletionEvidence),
    authorizationBoundary: {
      repairReadyAndProtectedMergeAuthorizedAfterFinalChecks: true
    }
  });
  return {
    registry,
    context: {
      ...initial.context,
      ...lifecycle.initialCandidateCompletionEvidence
    }
  };
}

async function createSyntheticProtectedMainPr81Fixture(
  label: string,
  options: { staleRepairLifecycle?: boolean; extraCandidatePath?: boolean } = {}
) {
  const root = temporaryRoot(label);
  const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
  const registryPath = join(root, "coordination", "repo-governance", "active-work.json");
  mkdirSync(dirname(script), { recursive: true });
  mkdirSync(dirname(registryPath), { recursive: true });
  copyFileSync(governanceScript, script);
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.name", "SENA protected-main chain test"]);
  runGit(root, ["config", "user.email", "sena-chain@example.invalid"]);
  runGit(root, ["branch", "-M", "main"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/HUDongpin/SENA.git"]);
  writeFileSync(registryPath, `${JSON.stringify({ stage: "protected-source" }, null, 2)}\n`);
  runGit(root, ["add", "coordination/repo-governance/active-work.json"]);
  runGit(root, ["commit", "-q", "-m", "protected source"]);
  const protectedSource = runGit(root, ["rev-parse", "HEAD"]);
  const protectedSourceTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);
  const protectedSourceRegistryBlob = runGit(root, [
    "rev-parse",
    "HEAD:coordination/repo-governance/active-work.json"
  ]);

  runGit(root, ["checkout", "-q", "-b", "pr81", protectedSource]);
  writeFileSync(registryPath, `${JSON.stringify({ stage: "pr81-initial" }, null, 2)}\n`);
  const initialPaths = ["coordination/repo-governance/active-work.json"];
  if (options.extraCandidatePath) {
    writeFileSync(join(root, "extra-pr81-path.txt"), "extra\n");
    initialPaths.push("extra-pr81-path.txt");
  }
  runGit(root, ["add", ...initialPaths]);
  runGit(root, ["commit", "-q", "-m", "pr81 initial candidate"]);
  const initialHead = runGit(root, ["rev-parse", "HEAD"]);
  const initialTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);
  const initialRegistryBlob = runGit(root, [
    "rev-parse",
    "HEAD:coordination/repo-governance/active-work.json"
  ]);

  const mergeTimeRegistry = JSON.parse(
    runGit(projectRoot, [
      "show",
      "0444b59968f6699f0ace6f4cb6eda4d6f8f44695:coordination/repo-governance/active-work.json"
    ])
  );
  if (options.staleRepairLifecycle) {
    const staleSource = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const staleItem = structuredClone(protectedCurrentnessRepairItemForTest(staleSource));
    const staleBranch = structuredClone(protectedCurrentnessRepairBranchForTest(staleSource));
    staleItem.protectedCurrentnessActivationRepairLifecycle = { status: "stale-unbound" };
    mergeTimeRegistry.workItems.push(staleItem);
    mergeTimeRegistry.branches.push(staleBranch);
  }
  const item = mergeTimeRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  );
  const branch = mergeTimeRegistry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-pr80-post-main-closeout-20260901"
  );
  const lifecycle = item.pr81PostMainCurrentnessCloseoutLifecycle;
  lifecycle.requiredExecution = [...PR81_FINAL_REQUIRED_EXECUTION_FOR_TEST];
  lifecycle.protectedSourceMainSha = protectedSource;
  lifecycle.protectedSourceTreeSha = protectedSourceTree;
  lifecycle.protectedSourceRegistryBlobSha = protectedSourceRegistryBlob;
  lifecycle.initialCandidateCompletionEvidence.headSha = initialHead;
  lifecycle.initialCandidateCompletionEvidence.treeSha = initialTree;
  lifecycle.initialCandidateCompletionEvidence.registryBlobSha = initialRegistryBlob;
  item.headSha = initialHead;
  branch.headSha = initialHead;
  branch.remoteHeadSha = initialHead;
  branch.prHeadSha = initialHead;
  const candidateReceipt = mergeTimeRegistry.releaseReceipts[33];
  candidateReceipt.protectedSource.mainSha = protectedSource;
  candidateReceipt.protectedSource.treeSha = protectedSourceTree;
  candidateReceipt.protectedSource.registryBlobSha = protectedSourceRegistryBlob;
  const finalReceipt = mergeTimeRegistry.releaseReceipts[34];
  Object.assign(finalReceipt.initialCandidateCompletionEvidence, {
    headSha: initialHead,
    treeSha: initialTree,
    registryBlobSha: initialRegistryBlob,
    pullRequestHeadSha: initialHead
  });
  finalReceipt.protectedInitialReceiptPrefix = {
    count: 34,
    sha256: createHash("sha256")
      .update(JSON.stringify(mergeTimeRegistry.releaseReceipts.slice(0, 34)))
      .digest("hex")
  };
  writeFileSync(registryPath, `${JSON.stringify(mergeTimeRegistry, null, 2)}\n`);
  runGit(root, ["add", "coordination/repo-governance/active-work.json"]);
  runGit(root, ["commit", "-q", "-m", "pr81 final metadata"]);
  const secondParent = runGit(root, ["rev-parse", "HEAD"]);
  runGit(root, ["checkout", "-q", "main"]);
  runGit(root, ["merge", "-q", "--no-ff", "pr81", "-m", "merge protected PR81"]);
  const mergeCommit = runGit(root, ["rev-parse", "HEAD"]);
  const mergeTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);
  const registryBlob = runGit(root, [
    "rev-parse",
    "HEAD:coordination/repo-governance/active-work.json"
  ]);
  runGit(root, ["update-ref", "refs/remotes/origin/main", mergeCommit]);

  const currentObservationRegistry = structuredClone(mergeTimeRegistry);
  const currentItem = currentObservationRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  );
  const currentBranch = currentObservationRegistry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-pr80-post-main-closeout-20260901"
  );
  const realCurrent = JSON.parse(
    readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
  );
  const mergedTemplate = realCurrent.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  ).lastMergedPullRequest;
  const lastMergedPullRequest = {
    ...structuredClone(mergedTemplate),
    headSha: secondParent,
    headTreeSha: mergeTree,
    registryBlobSha: registryBlob,
    mergeCommitSha: mergeCommit,
    orderedParentShas: [protectedSource, secondParent]
  };
  currentItem.headSha = secondParent;
  currentItem.disposition = "integrated";
  currentItem.lastMergedPullRequest = structuredClone(lastMergedPullRequest);
  currentBranch.headSha = secondParent;
  currentBranch.prHeadSha = secondParent;
  currentBranch.prState = "MERGED";
  currentBranch.prStateObservationMode = "monotonic";
  currentBranch.disposition = "integrated";
  currentBranch.lastMergedPullRequest = structuredClone(lastMergedPullRequest);

  const previousTargetRoot = process.env.SENA_GOVERNANCE_TARGET_ROOT;
  process.env.SENA_GOVERNANCE_TARGET_ROOT = root;
  let governance: any;
  try {
    governance = await import(
      `${pathToFileURL(script).href}?protectedMainChain=${Date.now()}-${Math.random()}`
    );
  } finally {
    if (previousTargetRoot === undefined) delete process.env.SENA_GOVERNANCE_TARGET_ROOT;
    else process.env.SENA_GOVERNANCE_TARGET_ROOT = previousTargetRoot;
  }
  return {
    root,
    governance,
    protectedSource,
    initialHead,
    secondParent,
    mergeCommit,
    mergeTimeRegistry,
    currentObservationRegistry
  };
}

function extendSyntheticProtectedMainFixtureWithRepair(
  fixture: any,
  options: { stalePr46Lifecycle?: boolean } = {}
) {
  runGit(fixture.root, ["checkout", "-q", "-b", "repair", fixture.mergeCommit]);
  const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
  const initial = buildProtectedCurrentnessRepairInitialFixture(
    frozenSource.registry,
    frozenSource.headSha,
    82
  );
  const registryPath = join(
    fixture.root,
    "coordination",
    "repo-governance",
    "active-work.json"
  );
  writeFileSync(registryPath, `${JSON.stringify(initial.registry, null, 2)}\n`);
  for (const [relativePath, contents] of [
    [
      "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
      "synthetic repair design\n"
    ],
    [
      "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md",
      "synthetic repair plan\n"
    ],
    ["scripts/verify-sena-repo-governance.mjs", readFileSync(governanceScript, "utf8")],
    [
      "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts",
      "synthetic governance test fixture\n"
    ]
  ] as Array<[string, string]>) {
    const absolutePath = join(fixture.root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
  runGit(fixture.root, ["add", ...PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST]);
  runGit(fixture.root, ["commit", "-q", "-m", "repair initial candidate"]);
  const repairInitialHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
  const repairInitialTree = runGit(fixture.root, ["rev-parse", "HEAD^{tree}"]);
  const repairInitialRegistryBlob = runGit(fixture.root, [
    "rev-parse",
    "HEAD:coordination/repo-governance/active-work.json"
  ]);
  const repairInitialVerifierBlob = runGit(fixture.root, [
    "rev-parse",
    "HEAD:scripts/verify-sena-repo-governance.mjs"
  ]);
  const repairInitialTestBlob = runGit(fixture.root, [
    "rev-parse",
    "HEAD:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
  ]);
  const final = buildProtectedCurrentnessRepairFinalFixture(initial);
  const repairItem = protectedCurrentnessRepairItemForTest(final.registry);
  const repairBranch = protectedCurrentnessRepairBranchForTest(final.registry);
  const repairLifecycle = repairItem.protectedCurrentnessActivationRepairLifecycle;
  repairLifecycle.protectedBaseSha = fixture.mergeCommit;
  repairLifecycle.protectedBaseTreeSha = runGit(fixture.root, [
    "rev-parse",
    `${fixture.mergeCommit}^{tree}`
  ]);
  repairLifecycle.protectedBaseRegistryBlobSha = runGit(fixture.root, [
    "rev-parse",
    `${fixture.mergeCommit}:coordination/repo-governance/active-work.json`
  ]);
  const evidence = repairLifecycle.initialCandidateCompletionEvidence;
  Object.assign(evidence, {
    headSha: repairInitialHead,
    treeSha: repairInitialTree,
    registryBlobSha: repairInitialRegistryBlob,
    verifierBlobSha: repairInitialVerifierBlob,
    governanceTestBlobSha: repairInitialTestBlob
  });
  repairItem.headSha = repairInitialHead;
  repairBranch.headSha = repairInitialHead;
  repairBranch.remoteHeadSha = repairInitialHead;
  repairBranch.prHeadSha = repairInitialHead;
  repairBranch.prStateObservationMode = "monotonic";
  Object.assign(final.registry.releaseReceipts.at(-1), evidence);
  if (options.stalePr46Lifecycle) {
    const staleRetirement = final.registry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    );
    staleRetirement.finalBaseHandshakeAuthorization.status =
      "final-pr46-ready-authorization-pending-final-head-checks";
  }
  writeFileSync(registryPath, `${JSON.stringify(final.registry, null, 2)}\n`);
  runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
  runGit(fixture.root, ["commit", "-q", "-m", "repair final metadata"]);
  const repairSecondParent = runGit(fixture.root, ["rev-parse", "HEAD"]);
  runGit(fixture.root, ["checkout", "-q", "main"]);
  runGit(fixture.root, ["merge", "-q", "--no-ff", "repair", "-m", "merge protected repair"]);
  const repairMergeCommit = runGit(fixture.root, ["rev-parse", "HEAD"]);
  runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", repairMergeCommit]);

  const currentObservationRegistry = structuredClone(final.registry);
  const currentPr81Item = currentObservationRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  );
  const currentPr81Branch = currentObservationRegistry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-pr80-post-main-closeout-20260901"
  );
  const priorPr81Item = fixture.currentObservationRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  );
  const priorPr81Branch = fixture.currentObservationRegistry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-pr80-post-main-closeout-20260901"
  );
  Object.assign(currentPr81Item, structuredClone(priorPr81Item));
  Object.assign(currentPr81Branch, structuredClone(priorPr81Branch));
  return {
    ...fixture,
    repairInitialHead,
    repairSecondParent,
    repairMergeCommit,
    repairMergeTimeRegistry: final.registry,
    currentObservationRegistry
  };
}

function commitTree(root: string, tree: string, parents: string[], message: string) {
  const result = spawnSync(
    "git",
    ["commit-tree", tree, ...parents.flatMap((parent) => ["-p", parent])],
    {
      cwd: root,
      input: `${message}\n`,
      encoding: "utf8",
      env: process.env
    }
  );
  if (result.status !== 0) throw new Error(`git commit-tree failed: ${result.stderr}`);
  return result.stdout.trim();
}

function extendSyntheticProtectedMainFixtureWithPr46(fixture: any) {
  runGit(fixture.root, ["checkout", "-q", "-b", "pr46-lane", fixture.initialHead]);
  mkdirSync(join(fixture.root, "scripts"), { recursive: true });
  writeFileSync(join(fixture.root, "scripts", "verify-sena-repo-governance.mjs"), "pr46 lane\n");
  runGit(fixture.root, ["add", "scripts/verify-sena-repo-governance.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "synthetic pr46 lane"]);
  const laneHead = runGit(fixture.root, ["rev-parse", "HEAD"]);
  runGit(fixture.root, ["checkout", "-q", "main"]);

  const candidateRegistry = JSON.parse(
    runGit(fixture.root, [
      "show",
      `${fixture.repairMergeCommit}:coordination/repo-governance/active-work.json`
    ])
  );
  const retirementItem = candidateRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const retirementBranch = candidateRegistry.branches.find(
    (entry: { name?: string }) => entry.name === "codex/sena-branch-retirement-20260829"
  );
  const prefix = {
    count: candidateRegistry.releaseReceipts.length,
    sha256: createHash("sha256")
      .update(JSON.stringify(candidateRegistry.releaseReceipts))
      .digest("hex")
  };
  const candidateBoundary = {
    finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks: true,
    pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks: false,
    implementationAuthorizedNow: false,
    localRefRetirementAuthorized: false,
    retirementReceiptMintingAuthorized: false,
    branchDeletionAuthorized: false,
    worktreeRemovalAuthorized: false,
    orphanWorktreeMutationAuthorized: false,
    targetTagMutationAuthorized: false,
    quarantineMutationAuthorized: false,
    deploymentAuthorized: false,
    providerMutationAuthorized: false,
    resetAuthorized: false,
    rebaseAuthorized: false,
    stashAuthorized: false,
    forceAuthorized: false,
    historyRewriteAuthorized: false
  };
  candidateRegistry.releaseReceipts.push({
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: "pr46-final-base-handshake-remerge-candidate",
    status: "consumed-by-final-pr46-remerge-candidate-awaiting-ci",
    taskId: "SENA-BRANCH-RETIREMENT-20260829",
    ownerKey: "Codex-branch-retirement-01a04916",
    scope: [
      "coordination/repo-governance/active-work.json",
      "scripts/verify-sena-repo-governance.mjs",
      "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
    ],
    protectedReceiptPrefix: prefix,
    authorizationBoundary: candidateBoundary
  });
  const registryPath = join(
    fixture.root,
    "coordination",
    "repo-governance",
    "active-work.json"
  );
  writeFileSync(registryPath, `${JSON.stringify(candidateRegistry, null, 2)}\n`);
  writeFileSync(
    join(fixture.root, "scripts", "verify-sena-repo-governance.mjs"),
    `${readFileSync(governanceScript, "utf8")}\n// synthetic PR46 candidate\n`
  );
  writeFileSync(
    join(fixture.root, "sena-hk-template", "lib", "sena", "__tests__", "repo-governance.test.ts"),
    "synthetic PR46 candidate test\n"
  );
  runGit(fixture.root, ["add", ...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST]);
  const candidateTree = runGit(fixture.root, ["write-tree"]);
  const candidateHead = commitTree(
    fixture.root,
    candidateTree,
    [laneHead, fixture.repairMergeCommit],
    "synthetic PR46 remerge candidate"
  );
  runGit(fixture.root, ["update-ref", "refs/heads/pr46-lane", candidateHead, laneHead]);
  runGit(fixture.root, ["checkout", "-q", "pr46-lane"]);
  const candidateRegistryBlob = runGit(fixture.root, [
    "rev-parse",
    "HEAD:coordination/repo-governance/active-work.json"
  ]);
  const candidateVerifierBlob = runGit(fixture.root, [
    "rev-parse",
    "HEAD:scripts/verify-sena-repo-governance.mjs"
  ]);
  const candidateTestBlob = runGit(fixture.root, [
    "rev-parse",
    "HEAD:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
  ]);

  const finalRegistry = structuredClone(candidateRegistry);
  const finalItem = finalRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const finalBranch = finalRegistry.branches.find(
    (entry: { name?: string }) => entry.name === "codex/sena-branch-retirement-20260829"
  );
  const handshake = finalItem.finalBaseHandshakeAuthorization;
  handshake.status = "final-pr46-ready-authorization-pending-final-head-checks";
  handshake.protectedReceiptPrefix = prefix;
  const evidenceValues: Record<string, any> = {
    candidateHeadSha: candidateHead,
    candidateTreeSha: candidateTree,
    candidateRegistryBlobSha: candidateRegistryBlob,
    candidateVerifierBlobSha: candidateVerifierBlob,
    candidateGovernanceTestBlobSha: candidateTestBlob,
    candidateParentShas: [laneHead, fixture.repairMergeCommit],
    binaryDiffSha256AgainstProtectedMain:
      fixture.governance.protectedMainPr46BinaryDiffSha256(
        fixture.repairMergeCommit,
        candidateHead
      ),
    normalizedRegistrySha256:
      fixture.governance.protectedMainNormalizedNonOwnedRegistrySha256(
        candidateRegistry
      ),
    candidateIndexAuditPassed: true,
    writePolicyPassed: true,
    securityPassed: true,
    exactConflictIntakePassed: true,
    conflictIntakeMode: "final-base-handshake-remerge-consumed-awaiting-ci",
    fullRepoGovernanceTestsPassed: 100,
    fullRepoGovernanceTestsTotal: 100,
    specReviewApproved: true,
    qualityReviewApproved: true,
    buildRunId: 101,
    repositorySecurityRunIds: [102, 103],
    checkJobIds: [104, 105, 106],
    requiredChecksPassed: true,
    annotationsEmpty: true
  };
  handshake.remergeCandidateCompletionEvidence = Object.fromEntries(
    handshake.authorizedResolverTransition.finalReadyState
      .requiredRemergeCandidateCompletionEvidenceFields
      .map((field: string) => [field, evidenceValues[field]])
  );
  handshake.finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation = false;
  handshake.finalResolverAndTestStageAuthorizedAfterProtectedActivation = false;
  handshake.finalMergeCommitPushAuthorizedAfterRequiredGates = false;
  handshake.finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks = false;
  handshake.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks = true;
  finalItem.headSha = candidateHead;
  finalItem.prNumber = 46;
  finalItem.prIsDraft = true;
  finalItem.prReadyForReview = false;
  finalItem.mergeAuthorized = false;
  finalItem.disposition = "active";
  finalBranch.headSha = candidateHead;
  finalBranch.remoteHeadSha = candidateHead;
  finalBranch.prHeadSha = candidateHead;
  finalBranch.pr = 46;
  finalBranch.prBase = "main";
  finalBranch.prState = "OPEN";
  finalBranch.prStateObservationMode = "monotonic";
  finalBranch.prIsDraft = true;
  finalBranch.prReadyForReview = false;
  finalBranch.mergeAuthorized = false;
  finalBranch.disposition = "active";
  const finalBoundary = Object.fromEntries(
    Object.keys(candidateBoundary).map((field) => [field, false])
  );
  finalBoundary.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks = true;
  finalRegistry.releaseReceipts.push({
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: "pr46-final-base-handshake-final-authorization",
    status: "final-pr46-ready-authorization-pending-final-head-checks",
    taskId: "SENA-BRANCH-RETIREMENT-20260829",
    ownerKey: "Codex-branch-retirement-01a04916",
    scope: ["coordination/repo-governance/active-work.json"],
    remergeCandidateCompletionEvidence: structuredClone(
      handshake.remergeCandidateCompletionEvidence
    ),
    authorizationBoundary: finalBoundary
  });
  writeFileSync(registryPath, `${JSON.stringify(finalRegistry, null, 2)}\n`);
  runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
  runGit(fixture.root, ["commit", "-q", "-m", "PR46 final metadata"]);
  const pr46SecondParent = runGit(fixture.root, ["rev-parse", "HEAD"]);
  runGit(fixture.root, ["checkout", "-q", "main"]);
  runGit(fixture.root, ["merge", "-q", "--no-ff", "pr46-lane", "-m", "merge protected PR46"]);
  const pr46MergeCommit = runGit(fixture.root, ["rev-parse", "HEAD"]);
  runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", pr46MergeCommit]);
  const currentObservationRegistry = structuredClone(finalRegistry);
  const currentPr81Item = currentObservationRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  );
  const currentPr81Branch = currentObservationRegistry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-pr80-post-main-closeout-20260901"
  );
  const priorPr81Item = fixture.currentObservationRegistry.workItems.find(
    (entry: { taskId?: string }) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  );
  const priorPr81Branch = fixture.currentObservationRegistry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-pr80-post-main-closeout-20260901"
  );
  Object.assign(currentPr81Item, structuredClone(priorPr81Item));
  Object.assign(currentPr81Branch, structuredClone(priorPr81Branch));
  return {
    ...fixture,
    laneHead,
    candidateHead,
    pr46SecondParent,
    pr46MergeCommit,
    currentObservationRegistry
  };
}

function pr46GitEvidenceForTest(fixture: any, candidateHead: string) {
  const candidateRegistry = JSON.parse(
    runGit(fixture.root, [
      "show",
      `${candidateHead}:coordination/repo-governance/active-work.json`
    ])
  );
  return {
    candidateHeadSha: candidateHead,
    candidateTreeSha: runGit(fixture.root, ["rev-parse", `${candidateHead}^{tree}`]),
    candidateRegistryBlobSha: runGit(fixture.root, [
      "rev-parse",
      `${candidateHead}:coordination/repo-governance/active-work.json`
    ]),
    candidateVerifierBlobSha: runGit(fixture.root, [
      "rev-parse",
      `${candidateHead}:scripts/verify-sena-repo-governance.mjs`
    ]),
    candidateGovernanceTestBlobSha: runGit(fixture.root, [
      "rev-parse",
      `${candidateHead}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
    ]),
    candidateParentShas: runGit(fixture.root, ["rev-list", "--parents", "-n", "1", candidateHead])
      .split(/\s+/)
      .slice(1),
    binaryDiffSha256AgainstProtectedMain:
      fixture.governance.protectedMainPr46BinaryDiffSha256(
        fixture.repairMergeCommit,
        candidateHead
      ),
    normalizedRegistrySha256:
      fixture.governance.protectedMainNormalizedNonOwnedRegistrySha256(candidateRegistry)
  };
}

function registryOnlyMetadataChildForTest(root: string, candidateHead: string, label: string) {
  const registry = JSON.parse(
    runGit(root, [
      "show",
      `${candidateHead}:coordination/repo-governance/active-work.json`
    ])
  );
  registry.syntheticFinalMetadataNonce = label;
  const tree = treeFromCommitWithPathChanges(
    root,
    candidateHead,
    candidateHead,
    [],
    [{
      kind: "content",
      path: "coordination/repo-governance/active-work.json",
      content: `${JSON.stringify(registry, null, 2)}\n`
    }]
  );
  return commitTree(root, tree, [candidateHead], `synthetic final metadata ${label}`);
}

function pr46CandidatePathVariantForTest(fixture: any, mode: "missing" | "extra" | "rename") {
  const exactPaths = [
    "coordination/repo-governance/active-work.json",
    "scripts/verify-sena-repo-governance.mjs",
    "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
  ];
  const changes = mode === "missing"
    ? [{
        kind: "remove" as const,
        path: "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
      }]
    : mode === "extra"
      ? [{ kind: "content" as const, path: "extra-pr46-path.txt", content: "extra\n" }]
      : [
          { kind: "remove" as const, path: "scripts/verify-sena-repo-governance.mjs" },
          {
            kind: "copy" as const,
            from: "scripts/verify-sena-repo-governance.mjs",
            to: "scripts/verify-sena-repo-governance-renamed.mjs"
          }
        ];
  const tree = treeFromCommitWithPathChanges(
    fixture.root,
    fixture.repairMergeCommit,
    fixture.candidateHead,
    exactPaths,
    changes
  );
  return commitTree(
    fixture.root,
    tree,
    [fixture.laneHead, fixture.repairMergeCommit],
    `synthetic PR46 ${mode} path candidate`
  );
}

function repairCandidateVariantForTest(
  fixture: any,
  mode: "missing" | "extra" | "rename" | "invalid-registry"
) {
  const exactPaths = [...PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST];
  const designPath =
    "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md";
  const changes = mode === "missing"
    ? [{ kind: "remove" as const, path: designPath }]
    : mode === "extra"
      ? [{ kind: "content" as const, path: "extra-repair-path.txt", content: "extra\n" }]
      : mode === "rename"
        ? [
            { kind: "remove" as const, path: designPath },
            {
              kind: "copy" as const,
              from: designPath,
              to: "coordination/repo-governance/pr82-protected-currentness-activation-repair-design-renamed.md"
            }
          ]
        : [{
            kind: "content" as const,
            path: "coordination/repo-governance/active-work.json",
            content: "{invalid-json\n"
          }];
  const tree = treeFromCommitWithPathChanges(
    fixture.root,
    fixture.mergeCommit,
    fixture.repairInitialHead,
    exactPaths,
    changes
  );
  return commitTree(
    fixture.root,
    tree,
    [fixture.mergeCommit],
    `synthetic repair ${mode} candidate`
  );
}

function repairLifecycleForCandidateTest(fixture: any, candidateHead: string) {
  const lifecycle = structuredClone(
    protectedCurrentnessRepairItemForTest(fixture.repairMergeTimeRegistry)
      .protectedCurrentnessActivationRepairLifecycle
  );
  Object.assign(lifecycle.initialCandidateCompletionEvidence, {
    headSha: candidateHead,
    treeSha: runGit(fixture.root, ["rev-parse", `${candidateHead}^{tree}`]),
    registryBlobSha: runGit(fixture.root, [
      "rev-parse",
      `${candidateHead}:coordination/repo-governance/active-work.json`
    ]),
    verifierBlobSha: runGit(fixture.root, [
      "rev-parse",
      `${candidateHead}:scripts/verify-sena-repo-governance.mjs`
    ]),
    governanceTestBlobSha: runGit(fixture.root, [
      "rev-parse",
      `${candidateHead}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
    ])
  });
  return lifecycle;
}

function realPr81DescriptorForTest() {
  const mergeTimeRegistry = JSON.parse(
    runGit(projectRoot, [
      "show",
      "0444b59968f6699f0ace6f4cb6eda4d6f8f44695:coordination/repo-governance/active-work.json"
    ])
  );
  const currentObservationRegistry = JSON.parse(
    readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
  );
  return {
    mergeTimeRegistry,
    currentObservationRegistry,
    mergeCommitSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    orderedParentShas: [
      "a8da14209a9e14a3a53e29e13c86ae8eecbd5928",
      "0444b59968f6699f0ace6f4cb6eda4d6f8f44695"
    ],
    secondParentSha: "0444b59968f6699f0ace6f4cb6eda4d6f8f44695",
    mergeTreeSha: "c3d3d91ff7868939cb331a8c237349d6abbd9357",
    registryBlobSha: "b0f4bfd1f35d816e22774458a4bc1593c29a745b"
  };
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
    const protectedCurrentnessRepair = registry.workItems.find(
      (item: { taskId?: string }) =>
        item.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_FOR_TEST
    );
    const activeWriterCount = registry.workItems.filter((item: { disposition: string }) =>
      ["active", "ready-for-pr"].includes(item.disposition)
    ).length;
    const result = runNode(governanceScript, ["registry"]);
    expect(Object.hasOwn(protectedCurrentnessRepair, "aheadBehindObservationMode")).toBe(false);
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

  it("accepts only the exact integrated monotonic-behind observation shape", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const headSha = "a".repeat(40);
    const mergeCommitSha = "b".repeat(40);
    const baseItem = {
      taskId: "SENA-MONOTONIC-BEHIND-SHAPE",
      aheadBehindObservationMode: "integrated-monotonic-behind",
      disposition: "integrated",
      headSha,
      aheadBehind: { baseRef: "origin/main", ahead: 0, behind: 2 },
      lastMergedPullRequest: {
        headSha,
        mergeCommitSha,
        postMainChecksPassed: true
      }
    };
    const observed = { baseRef: "origin/main", ahead: 0, behind: 3 };
    const allowed = governance.integratedMonotonicBehindShapeAllowed;

    expect(Object.hasOwn(baseItem, "cleanupAuthorization")).toBe(false);
    expect(allowed(baseItem, headSha, observed)).toBe(true);
    expect(allowed(baseItem, headSha, { ...observed, behind: 2 })).toBe(true);

    const itemCases: Array<[string, (item: any) => void]> = [
      ["unknown mode", (item) => { item.aheadBehindObservationMode = "unknown"; }],
      ["empty mode", (item) => { item.aheadBehindObservationMode = ""; }],
      ...[
        "active",
        "ready-for-pr",
        "frozen-recovery",
        "preservation-review",
        "archived",
        "cleanup-approved"
      ].map((disposition) => [
        `${disposition} disposition`,
        (item: any) => { item.disposition = disposition; }
      ] as [string, (item: any) => void]),
      ["head drift", (item) => { item.headSha = "c".repeat(40); }],
      ["missing recorded ahead/behind", (item) => { delete item.aheadBehind; }],
      ["null recorded ahead/behind", (item) => { item.aheadBehind = null; }],
      ["recorded ahead/behind missing behind", (item) => {
        delete item.aheadBehind.behind;
      }],
      ["recorded ahead/behind array", (item) => {
        item.aheadBehind = Object.assign([], {
          baseRef: "origin/main",
          ahead: 0,
          behind: 2
        });
      }],
      ["recorded ahead/behind class-like", (item) => {
        class RecordedAheadBehind {
          baseRef = "origin/main";
          ahead = 0;
          behind = 2;
        }
        item.aheadBehind = new RecordedAheadBehind();
      }],
      ["recorded base drift", (item) => { item.aheadBehind.baseRef = "origin/release"; }],
      ["recorded conflicting base alias", (item) => {
        item.aheadBehind.base = "origin/release";
      }],
      ["recorded extra base ref", (item) => {
        item.aheadBehind.extraBaseRef = "origin/main";
      }],
      ["recorded ahead positive", (item) => { item.aheadBehind.ahead = 1; }],
      ["recorded ahead negative", (item) => { item.aheadBehind.ahead = -1; }],
      ["recorded ahead string", (item) => { item.aheadBehind.ahead = "0"; }],
      ["recorded ahead NaN", (item) => { item.aheadBehind.ahead = Number.NaN; }],
      ["recorded behind negative", (item) => { item.aheadBehind.behind = -1; }],
      ["recorded behind noninteger", (item) => { item.aheadBehind.behind = 1.5; }],
      ["recorded behind string", (item) => { item.aheadBehind.behind = "2"; }],
      ["recorded behind NaN", (item) => { item.aheadBehind.behind = Number.NaN; }],
      ["missing merged PR", (item) => { delete item.lastMergedPullRequest; }],
      ["mismatched merged head", (item) => { item.lastMergedPullRequest.headSha = "d".repeat(40); }],
      ["invalid merge SHA", (item) => { item.lastMergedPullRequest.mergeCommitSha = "invalid"; }],
      ["post-main checks false", (item) => { item.lastMergedPullRequest.postMainChecksPassed = false; }],
      ...[
        ["merge base alias", "base", "main"],
        ["merge base ref alias", "baseRef", "origin/main"],
        ["merge base ref name alias", "baseRefName", "main"],
        ["merge target base ref alias", "targetBaseRef", "origin/main"]
      ].map(([label, key, value]) => [
        label,
        (item: any) => { item.lastMergedPullRequest[key] = value; }
      ] as [string, (item: any) => void])
    ];
    for (const [label, mutate] of itemCases) {
      const item = structuredClone(baseItem);
      mutate(item);
      expect(allowed(item, headSha, observed), label).toBe(false);
    }

    const observationCases: Array<[string, any]> = [
      ["missing observation", undefined],
      ["null observation", null],
      ["observed missing behind", {
        baseRef: "origin/main",
        ahead: 0
      }],
      ["observed array", Object.assign([], {
        baseRef: "origin/main",
        ahead: 0,
        behind: 3
      })],
      ["observed class-like", new (class ObservedAheadBehind {
        baseRef = "origin/main";
        ahead = 0;
        behind = 3;
      })()],
      ["observed base drift", { ...observed, baseRef: "origin/release" }],
      ["observed conflicting base alias", {
        ...observed,
        base: "origin/release"
      }],
      ["observed extra base ref", {
        ...observed,
        extraBaseRef: "origin/main"
      }],
      ["observed ahead positive", { ...observed, ahead: 1 }],
      ["observed ahead negative", { ...observed, ahead: -1 }],
      ["observed ahead string", { ...observed, ahead: "0" }],
      ["observed ahead NaN", { ...observed, ahead: Number.NaN }],
      ["observed behind decrease", { ...observed, behind: 1 }],
      ["observed behind negative", { ...observed, behind: -1 }],
      ["observed behind noninteger", { ...observed, behind: 2.5 }],
      ["observed behind string", { ...observed, behind: "3" }],
      ["observed behind NaN", { ...observed, behind: Number.NaN }]
    ];
    for (const [label, value] of observationCases) {
      expect(allowed(baseItem, headSha, value), label).toBe(false);
    }

    for (const cleanupAuthorization of [undefined, null, false, {}]) {
      const item = { ...structuredClone(baseItem), cleanupAuthorization };
      expect(
        allowed(item, headSha, observed),
        `present cleanupAuthorization=${JSON.stringify(cleanupAuthorization)}`
      ).toBe(false);
    }
  });

  it("requires cached origin/main ancestry for integrated monotonic-behind observations", async () => {
    const fixture = createIntegratedMonotonicBehindFixture("monotonic-behind-ancestry");
    const previousTargetRoot = process.env.SENA_GOVERNANCE_TARGET_ROOT;
    process.env.SENA_GOVERNANCE_TARGET_ROOT = fixture.root;
    let governance: any;
    try {
      governance = await import(
        `${pathToFileURL(fixture.script).href}?monotonicBehind=${Date.now()}`
      );
    } finally {
      if (previousTargetRoot === undefined) delete process.env.SENA_GOVERNANCE_TARGET_ROOT;
      else process.env.SENA_GOVERNANCE_TARGET_ROOT = previousTargetRoot;
    }
    const item = fixture.registry.workItems[0];
    const observed = { baseRef: "origin/main", ahead: 0, behind: 1 };

    expect(
      governance.integratedMonotonicBehindObservationAllowed(
        item,
        fixture.candidateHead,
        observed
      )
    ).toBe(true);

    const treeSha = runGit(fixture.root, ["rev-parse", `${fixture.candidateHead}^{tree}`]);
    const unrelatedCommit = runGit(fixture.root, [
      "commit-tree",
      treeSha,
      "-m",
      "unrelated observation evidence"
    ]);
    const unrelatedHead = structuredClone(item);
    unrelatedHead.headSha = unrelatedCommit;
    unrelatedHead.lastMergedPullRequest.headSha = unrelatedCommit;
    expect(
      governance.integratedMonotonicBehindObservationAllowed(
        unrelatedHead,
        unrelatedCommit,
        observed
      )
    ).toBe(false);

    const unrelatedMerge = structuredClone(item);
    unrelatedMerge.lastMergedPullRequest.mergeCommitSha = unrelatedCommit;
    expect(
      governance.integratedMonotonicBehindObservationAllowed(
        unrelatedMerge,
        fixture.candidateHead,
        observed
      )
    ).toBe(false);

    const unavailableHead = structuredClone(item);
    unavailableHead.headSha = "e".repeat(40);
    unavailableHead.lastMergedPullRequest.headSha = unavailableHead.headSha;
    expect(
      governance.integratedMonotonicBehindObservationAllowed(
        unavailableHead,
        unavailableHead.headSha,
        observed
      )
    ).toBe(false);

    runGit(fixture.root, ["update-ref", "-d", "refs/remotes/origin/main"]);
    expect(
      governance.integratedMonotonicBehindObservationAllowed(
        item,
        fixture.candidateHead,
        observed
      )
    ).toBe(false);
  });

  it("validates the integrated monotonic-behind registry contract without granting cleanup authority", () => {
    const fixture = createIntegratedMonotonicBehindFixture("monotonic-behind-registry");
    const taskId = fixture.registry.workItems[0].taskId;
    const exactModeError =
      `workItem ${taskId} aheadBehindObservationMode must be integrated-monotonic-behind when declared`;
    const integratedError =
      `workItem ${taskId} integrated-monotonic-behind observation requires integrated disposition`;
    const cleanupError =
      `workItem ${taskId} integrated-monotonic-behind observation forbids cleanupAuthorization`;
    const contractError =
      `workItem ${taskId} has invalid integrated-monotonic-behind observation contract`;
    const writeRegistry = (registry: any) => {
      writeFileSync(
        fixture.observationRegistryPath,
        `${JSON.stringify(registry, null, 2)}\n`
      );
      return runNode(
        fixture.script,
        ["registry", "--registry", fixture.observationRegistryPath],
        { cwd: fixture.root, env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root } }
      );
    };

    expect(writeRegistry(fixture.registry).status).toBe(0);
    const absent = structuredClone(fixture.registry);
    delete absent.workItems[0].aheadBehindObservationMode;
    expect(writeRegistry(absent).status).toBe(0);

    for (const mode of ["", "unknown", "integrated-monotonic-behind "]) {
      const registry = structuredClone(fixture.registry);
      registry.workItems[0].aheadBehindObservationMode = mode;
      const result = writeRegistry(registry);
      expect(result.status, `mode=${JSON.stringify(mode)}`).toBe(1);
      expect(result.stderr).toContain(exactModeError);
    }

    const active = structuredClone(fixture.registry);
    active.workItems[0].disposition = "active";
    expect(writeRegistry(active).stderr).toContain(integratedError);

    for (const cleanupAuthorization of [null, false, {}]) {
      const registry = structuredClone(fixture.registry);
      registry.workItems[0].cleanupAuthorization = cleanupAuthorization;
      const result = writeRegistry(registry);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(cleanupError);
    }

    const structuralMutations: Array<[string, (item: any) => void]> = [
      ["recorded base", (item) => { item.aheadBehind.baseRef = "origin/release"; }],
      ["recorded conflicting base alias", (item) => {
        item.aheadBehind.base = "origin/release";
      }],
      ["recorded extra base ref", (item) => {
        item.aheadBehind.extraBaseRef = "origin/main";
      }],
      ["recorded ahead", (item) => { item.aheadBehind.ahead = 1; }],
      ["recorded ahead string", (item) => { item.aheadBehind.ahead = "0"; }],
      ["recorded behind negative", (item) => { item.aheadBehind.behind = -1; }],
      ["recorded behind noninteger", (item) => { item.aheadBehind.behind = 0.5; }],
      ["recorded behind NaN", (item) => { item.aheadBehind.behind = Number.NaN; }],
      ["missing merge evidence", (item) => { delete item.lastMergedPullRequest; }],
      ["mismatched merge head", (item) => {
        item.lastMergedPullRequest.headSha = "f".repeat(40);
      }],
      ["invalid merge SHA", (item) => {
        item.lastMergedPullRequest.mergeCommitSha = "invalid";
      }],
      ["post-main checks false", (item) => {
        item.lastMergedPullRequest.postMainChecksPassed = false;
      }],
      ...[
        ["merge base alias", "base", "main"],
        ["merge base ref alias", "baseRef", "origin/main"],
        ["merge base ref name alias", "baseRefName", "main"],
        ["merge target base ref alias", "targetBaseRef", "origin/main"]
      ].map(([label, key, value]) => [
        label,
        (item: any) => { item.lastMergedPullRequest[key] = value; }
      ] as [string, (item: any) => void])
    ];
    for (const [label, mutate] of structuralMutations) {
      const registry = structuredClone(fixture.registry);
      mutate(registry.workItems[0]);
      const result = writeRegistry(registry);
      expect(result.status, label).toBe(1);
      expect(result.stderr, label).toContain(contractError);
    }
  });

  it("warns only for a non-destructive integrated monotonic-behind increase", () => {
    const fixture = createIntegratedMonotonicBehindFixture("monotonic-behind-audit");
    const taskId = fixture.registry.workItems[0].taskId;
    const warning =
      `integrated lane fell farther behind protected main without changing head: ${taskId}`;
    const mismatchError = `workItem ahead/behind differs from registry: ${taskId}`;
    const runAudit = (registry: any) => {
      writeFileSync(
        fixture.observationRegistryPath,
        `${JSON.stringify(registry, null, 2)}\n`
      );
      const result = runNode(
        fixture.script,
        ["audit", "--registry", fixture.observationRegistryPath],
        { cwd: fixture.root, env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root } }
      );
      return { result, report: JSON.parse(result.stdout) };
    };

    const allowed = runAudit(fixture.registry);
    expect(
      allowed.result.status,
      JSON.stringify({ errors: allowed.report.errors, warnings: allowed.report.warnings })
    ).toBe(0);
    expect(allowed.report.errors).toEqual([]);
    expect(allowed.report.warnings).toEqual([warning]);
    expect(allowed.report.warnings).not.toContain(
      `integrated cleanup target fell farther behind protected main without changing head: ${taskId}`
    );

    const equalBehind = structuredClone(fixture.registry);
    equalBehind.workItems[0].aheadBehind.behind = 1;
    const equal = runAudit(equalBehind);
    expect(equal.result.status).toBe(0);
    expect(equal.report.errors).toEqual([]);
    expect(equal.report.warnings).not.toContain(warning);

    const decreased = structuredClone(fixture.registry);
    decreased.workItems[0].aheadBehind.behind = 2;
    const decrease = runAudit(decreased);
    expect(decrease.result.status).toBe(1);
    expect(decrease.report.errors).toContain(mismatchError);
    expect(decrease.report.warnings).not.toContain(warning);

    const badMergeAncestry = structuredClone(fixture.registry);
    const treeSha = runGit(fixture.root, ["rev-parse", `${fixture.candidateHead}^{tree}`]);
    badMergeAncestry.workItems[0].lastMergedPullRequest.mergeCommitSha = runGit(
      fixture.root,
      ["commit-tree", treeSha, "-m", "unrelated merge evidence"]
    );
    const ancestry = runAudit(badMergeAncestry);
    expect(ancestry.result.status).toBe(1);
    expect(ancestry.report.errors).toContain(mismatchError);
    expect(ancestry.report.warnings).not.toContain(warning);

    const badMergeEvidence = structuredClone(fixture.registry);
    badMergeEvidence.workItems[0].lastMergedPullRequest.headSha = "f".repeat(40);
    const evidence = runAudit(badMergeEvidence);
    expect(evidence.result.status).toBe(1);
    expect(evidence.report.errors).toContain(
      `workItem ${taskId} has invalid integrated-monotonic-behind observation contract`
    );

    writeFileSync(join(fixture.root, "unauthorized-after-integration.txt"), "blocked\n");
    runGit(fixture.root, ["add", "unauthorized-after-integration.txt"]);
    runGit(fixture.root, ["commit", "-q", "-m", "unauthorized post-integration commit"]);
    const drift = runAudit(fixture.registry);
    expect(drift.result.status).toBe(1);
    expect(drift.report.errors).toContain(
      `workItem headSha is not a permitted forward-only allowed-path advance: ${taskId}`
    );
    expect(drift.report.errors).toContain(mismatchError);
    expect(drift.report.warnings).not.toContain(warning);
  });

  it("does not treat integrated monotonic-behind observation metadata as ref-deletion authority", () => {
    const fixture = createIntegratedMonotonicBehindFixture("monotonic-behind-no-authority");
    runGit(fixture.root, ["checkout", "-q", "--detach", fixture.advancedMain]);
    writeFileSync(
      fixture.registryPath,
      `${JSON.stringify(fixture.registry, null, 2)}\n`
    );
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "record observation-only metadata"]);
    const authorizationCommit = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", authorizationCommit]);
    runGit(fixture.root, ["checkout", "-q", "topic"]);

    const deletion = runNode(
      fixture.script,
      ["deletion-boundary", "--authorization-registry-commit", authorizationCommit],
      {
        cwd: fixture.root,
        input: `(delete) ${"0".repeat(40)} refs/heads/topic ${fixture.candidateHead}\n`,
        env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
      }
    );
    expect(deletion.status).toBe(1);
    expect(deletion.stderr).toContain(
      "deletion-boundary lacks an active exact protected-main authorization"
    );
    expect(deletion.stdout).not.toContain("SENA_DELETION_BOUNDARY pass");
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

  it("resolves the immutable real PR81 protected-main merge with later observation evidence", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    expect(typeof governance.protectedMainAdvanceChainResolution).toBe("function");

    const currentObservationRegistry = JSON.parse(
      readFileSync(
        join(projectRoot, "coordination", "repo-governance", "active-work.json"),
        "utf8"
      )
    );
    const mergeTimeRegistry = JSON.parse(
      runGit(projectRoot, [
        "show",
        "0444b59968f6699f0ace6f4cb6eda4d6f8f44695:coordination/repo-governance/active-work.json"
      ])
    );
    const mergeTimeItem = mergeTimeRegistry.workItems.find(
      (entry: { taskId?: string }) =>
        entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
    );
    const mergeTimeBranch = mergeTimeRegistry.branches.find(
      (entry: { name?: string }) =>
        entry.name === "codex/sena-pr80-post-main-closeout-20260901"
    );
    expect(mergeTimeItem.lastMergedPullRequest).toBeUndefined();
    expect(mergeTimeItem.aheadBehindObservationMode).toBeUndefined();
    expect(mergeTimeBranch.lastMergedPullRequest).toBeUndefined();
    expect(mergeTimeBranch.prStateObservationMode).toBeUndefined();

    expect(
      governance.protectedMainAdvanceChainResolution(
        currentObservationRegistry,
        "a8da14209a9e14a3a53e29e13c86ae8eecbd5928",
        "969a206b798c159e15ae0b6e5c76d0c94cca92ea"
      )
    ).toEqual({
      allowed: true,
      rule: null,
      mergeCommitShas: ["969a206b798c159e15ae0b6e5c76d0c94cca92ea"],
      failedCommitSha: null
    });
    const descriptor = {
      mergeTimeRegistry,
      currentObservationRegistry,
      mergeCommitSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
      orderedParentShas: [
        "a8da14209a9e14a3a53e29e13c86ae8eecbd5928",
        "0444b59968f6699f0ace6f4cb6eda4d6f8f44695"
      ],
      secondParentSha: "0444b59968f6699f0ace6f4cb6eda4d6f8f44695",
      mergeTreeSha: "c3d3d91ff7868939cb331a8c237349d6abbd9357",
      registryBlobSha: "b0f4bfd1f35d816e22774458a4bc1593c29a745b"
    };
    expect(governance.validatePr81ProtectedMainMergeDescriptor(descriptor)).toBe(true);
    const pr81Mutations: Array<[string, (copy: any) => void]> = [
      ["lifecycle", (copy) => { delete copy.mergeTimeRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).pr81PostMainCurrentnessCloseoutLifecycle; }],
      ["PR number", (copy) => { copy.mergeTimeRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).prNumber = 80; }],
      ["base", (copy) => { copy.mergeTimeRegistry.branches.find(
        (entry: any) => entry.name === "codex/sena-pr80-post-main-closeout-20260901"
      ).prBase = "develop"; }],
      ["prefix", (copy) => { copy.mergeTimeRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).pr81PostMainCurrentnessCloseoutLifecycle.protectedSourceReceiptPrefix.sha256 = "0".repeat(64); }],
      ["duplicate", (copy) => { copy.mergeTimeRegistry.releaseReceipts.push(
        structuredClone(copy.mergeTimeRegistry.releaseReceipts.at(-1))
      ); }],
      ["receipt order", (copy) => { const receipts = copy.mergeTimeRegistry.releaseReceipts;
        [receipts[33], receipts[34]] = [receipts[34], receipts[33]]; }],
      ["receipt action", (copy) => { copy.mergeTimeRegistry.releaseReceipts[34]
        .authorizationBoundary.pr46ReadyAndProtectedMergeAuthorizedNow = true; }],
      ["current state", (copy) => { copy.currentObservationRegistry.branches.find(
        (entry: any) => entry.name === "codex/sena-pr80-post-main-closeout-20260901"
      ).prState = "OPEN"; }],
      ...["headSha", "mergeCommitSha", "headTreeSha", "registryBlobSha"].map(
        (field): [string, (copy: any) => void] => [field, (copy) => {
          copy.currentObservationRegistry.workItems.find(
            (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
          ).lastMergedPullRequest[field] = "f".repeat(40);
        }]
      ),
      ["parents", (copy) => { copy.currentObservationRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).lastMergedPullRequest.orderedParentShas.reverse(); }],
      ["post-main field", (copy) => { delete copy.currentObservationRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).lastMergedPullRequest.annotationsEmpty; }]
    ];
    for (const [label, mutate] of pr81Mutations) {
      const copy = structuredClone(descriptor);
      mutate(copy);
      expect(governance.validatePr81ProtectedMainMergeDescriptor(copy), label).toBe(false);
    }
  });

  it("rejects every PR81 exact-schema and truthful historical-audit drift", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const mutations: Array<[string, (copy: any) => void]> = [
      ...["fail", "pass", "unknown"].map(
        (status): [string, (copy: any) => void] => [
          `synchronous ${status} audit`,
          (copy) => {
            for (const merged of [
              copy.currentObservationRegistry.workItems.find(
                (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
              ).lastMergedPullRequest,
              copy.currentObservationRegistry.branches.find(
                (entry: any) => entry.name === "codex/sena-pr80-post-main-closeout-20260901"
              ).lastMergedPullRequest
            ]) {
              merged.commitBoundLiveAuditStatus = status;
              merged.commitBoundLiveAuditErrors = ["forged"];
              merged.commitBoundLiveAuditOwnerBlockers = ["forged"];
              merged.unreachableCommitCount = 7;
            }
          }
        ]
      ),
      ...[true, false, null].map(
        (value): [string, (copy: any) => void] => [
          `lifecycle extra ${String(value)}`,
          (copy) => { copy.mergeTimeRegistry.workItems.find(
            (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
          ).pr81PostMainCurrentnessCloseoutLifecycle.unknown = value; }
        ]
      ),
      ["lifecycle missing", (copy) => { delete copy.mergeTimeRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).pr81PostMainCurrentnessCloseoutLifecycle.requiredExecution; }],
      ["candidate receipt top extra", (copy) => { copy.mergeTimeRegistry.releaseReceipts[33].unknown = false; }],
      ["candidate receipt top missing", (copy) => { delete copy.mergeTimeRegistry.releaseReceipts[33].authorizationBasis; }],
      ["final receipt top extra", (copy) => { copy.mergeTimeRegistry.releaseReceipts[34].unknown = null; }],
      ["final receipt top missing", (copy) => { delete copy.mergeTimeRegistry.releaseReceipts[34].authorizationBasis; }],
      ...[
        ["candidate protectedSource", "protectedSource", "releaseReceiptPrefixCount"],
        ["candidate pr80 evidence", "pr80FinalAndPostMainEvidence", "finalBuildRunId"],
        ["candidate blocked audit", "blockedAuditEvidence", "ownerBlockers"],
        ["candidate boundary", "authorizationBoundary", "branchDeletionAuthorized"],
        ["final evidence", "initialCandidateCompletionEvidence", "buildRunId"],
        ["final boundary", "authorizationBoundary", "branchDeletionAuthorized"]
      ].flatMap(([label, record, missingKey]) => {
        const receiptIndex = label.startsWith("final") ? 34 : 33;
        return [
          [`${label} extra`, (copy: any) => {
            copy.mergeTimeRegistry.releaseReceipts[receiptIndex][record].unknown = false;
          }],
          [`${label} missing`, (copy: any) => {
            delete copy.mergeTimeRegistry.releaseReceipts[receiptIndex][record][missingKey];
          }]
        ] as Array<[string, (copy: any) => void]>;
      }),
      ["lastMerged extra both", (copy) => {
        for (const merged of [
          copy.currentObservationRegistry.workItems.find(
            (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
          ).lastMergedPullRequest,
          copy.currentObservationRegistry.branches.find(
            (entry: any) => entry.name === "codex/sena-pr80-post-main-closeout-20260901"
          ).lastMergedPullRequest
        ]) merged.unknown = false;
      }],
      ["lastMerged missing both", (copy) => {
        for (const merged of [
          copy.currentObservationRegistry.workItems.find(
            (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
          ).lastMergedPullRequest,
          copy.currentObservationRegistry.branches.find(
            (entry: any) => entry.name === "codex/sena-pr80-post-main-closeout-20260901"
          ).lastMergedPullRequest
        ]) delete merged.postMainBuildRunId;
      }],
      ["lastMerged one-sided", (copy) => { copy.currentObservationRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).lastMergedPullRequest.commitBoundLiveAuditStatus = "arbitrary"; }],
      ...[
        ["duplicate prefix", 0],
        ["duplicate middle", 20],
        ["duplicate tail", 35]
      ].map(([label, index]): [string, (copy: any) => void] => [
        String(label),
        (copy) => { copy.mergeTimeRegistry.releaseReceipts.splice(
          Number(index),
          0,
          structuredClone(copy.mergeTimeRegistry.releaseReceipts[33])
        ); }
      ])
    ];
    const accepted = [];
    for (const [label, mutate] of mutations) {
      const copy = structuredClone(realPr81DescriptorForTest());
      mutate(copy);
      if (governance.validatePr81ProtectedMainMergeDescriptor(copy)) accepted.push(label);
    }
    expect(accepted).toEqual([]);
  });

  it("binds the PR81 final lifecycle action map and ordered required execution", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    expect(governance.PR81_FINAL_REQUIRED_EXECUTION).toEqual(
      PR81_FINAL_REQUIRED_EXECUTION_FOR_TEST
    );
    const falseActionFields = [
      "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks",
      "pr46RemergeOrMutationAuthorizedNow",
      "pr46ReadyAndProtectedMergeAuthorizedNow",
      "localRefRetirementAuthorized",
      "retirementReceiptMintingAuthorized",
      "branchDeletionAuthorized",
      "worktreeRemovalAuthorized",
      "orphanWorktreeMutationAuthorized",
      "targetRefMutationAuthorized",
      "targetTagMutationAuthorized",
      "quarantineMutationAuthorized",
      "deploymentAuthorized",
      "providerMutationAuthorized",
      "resetAuthorized",
      "rebaseAuthorized",
      "stashAuthorized",
      "forceAuthorized",
      "historyRewriteAuthorized"
    ];
    const mutations: Array<[string, (lifecycle: any) => void]> = [
      ...falseActionFields.map(
        (field): [string, (lifecycle: any) => void] => [
          `lifecycle action ${field}`,
          (lifecycle) => { lifecycle[field] = true; }
        ]
      ),
      ["requiredExecution empty", (lifecycle) => { lifecycle.requiredExecution = []; }],
      ["requiredExecution extra", (lifecycle) => {
        lifecycle.requiredExecution.push("forged-extra-step");
      }],
      ["requiredExecution missing", (lifecycle) => { lifecycle.requiredExecution.splice(4, 1); }],
      ["requiredExecution replace", (lifecycle) => {
        lifecycle.requiredExecution[4] = "forged-replacement-step";
      }],
      ["requiredExecution swap", (lifecycle) => {
        [lifecycle.requiredExecution[4], lifecycle.requiredExecution[5]] =
          [lifecycle.requiredExecution[5], lifecycle.requiredExecution[4]];
      }],
      ["requiredExecution duplicate", (lifecycle) => {
        lifecycle.requiredExecution.splice(4, 0, lifecycle.requiredExecution[4]);
      }]
    ];
    const accepted = [];
    for (const [label, mutate] of mutations) {
      const descriptor = structuredClone(realPr81DescriptorForTest());
      const lifecycle = descriptor.mergeTimeRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ).pr81PostMainCurrentnessCloseoutLifecycle;
      mutate(lifecycle);
      if (governance.validatePr81ProtectedMainMergeDescriptor(descriptor)) {
        accepted.push(label);
      }
    }
    expect(accepted).toEqual([]);
  });

  it("selects exactly one merge-time descriptor instead of priority-routing stale lifecycles", async () => {
    const staleRepair = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-stale-repair-on-pr81",
      { staleRepairLifecycle: true }
    );
    expect(
      staleRepair.governance.protectedMainAdvanceChainResolution(
        staleRepair.currentObservationRegistry,
        staleRepair.protectedSource,
        staleRepair.mergeCommit
      ).allowed
    ).toBe(true);

    const pr81 = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-stale-pr46-on-repair"
    );
    const stalePr46 = extendSyntheticProtectedMainFixtureWithRepair(pr81, {
      stalePr46Lifecycle: true
    });
    expect(
      stalePr46.governance.protectedMainAdvanceChainResolution(
        stalePr46.currentObservationRegistry,
        stalePr46.protectedSource,
        stalePr46.repairMergeCommit
      ).allowed
    ).toBe(true);
    const forgedPr81 = {
      kind: "pr81-registry-closeout",
      expectedPaths: ["coordination/repo-governance/active-work.json"]
    };
    const forgedRepair = {
      kind: "protected-currentness-repair",
      expectedPaths: [
        "coordination/repo-governance/active-work.json",
        "scripts/verify-sena-repo-governance.mjs"
      ]
    };
    expect(
      stalePr46.governance.protectedMainUniqueMergeTimeCandidate([
        forgedPr81,
        forgedRepair
      ])
    ).toBeNull();
    expect(
      stalePr46.governance.protectedMainUniqueMergeTimeCandidate([])
    ).toBeNull();
  });

  it("routes a synthetic protected PR81 merge through root helpers before and after root fast-forward", async () => {
    const fixture = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-pr81-root-helper"
    );
    const rootItem = {
      taskId: "SENA-A01-ROOT-CONTROL-PLANE-20260828",
      disposition: "integrated",
      laneType: "read-only",
      branch: "main",
      headSha: fixture.protectedSource,
      aheadBehind: { baseRef: "origin/main", ahead: 0, behind: 0 },
      dirtyState: "clean-main-exact-origin-main",
      repo: fixture.root,
      cwd: fixture.root,
      worktreePath: fixture.root
    };
    const branchRecord = {
      name: "main",
      headSha: fixture.protectedSource,
      remoteObservationMode: "lower-bound",
      remoteHeadSha: fixture.protectedSource
    };
    const mergeTimeDescriptor = {
        mergeTimeRegistry: fixture.mergeTimeRegistry,
        mergeCommitSha: fixture.mergeCommit,
        orderedParentShas: [fixture.protectedSource, fixture.secondParent],
        secondParentSha: fixture.secondParent,
        mergeTreeSha: runGit(fixture.root, ["rev-parse", `${fixture.mergeCommit}^{tree}`]),
        registryBlobSha: runGit(fixture.root, [
          "rev-parse",
          `${fixture.mergeCommit}:coordination/repo-governance/active-work.json`
        ])
      };
    expect(
      fixture.governance.validatePr81ProtectedMainMergeDescriptor(
        mergeTimeDescriptor,
        { mergeTimeOnly: true }
      )
    ).toBe(true);
    expect(
      fixture.governance.protectedMainMergeTimeCandidateResolution(mergeTimeDescriptor)?.kind
    ).toBe("pr81-registry-closeout");
    expect(
      fixture.governance.integratedReadOnlyRootRemoteRegistryAdvanceAllowed(
        rootItem,
        fixture.protectedSource,
        { baseRef: "origin/main", ahead: 0, behind: 1 },
        branchRecord,
        fixture.currentObservationRegistry
      )
    ).toBe(true);
    expect(
      fixture.governance.integratedReadOnlyRootRegistryAdvanceAllowed(
        rootItem,
        fixture.mergeCommit,
        fixture.currentObservationRegistry
      )
    ).toBe(true);
    expect(
      fixture.governance.integratedReadOnlyRootRegistryAdvanceAllowed(
        rootItem,
        fixture.secondParent,
        fixture.currentObservationRegistry
      )
    ).toBe(false);
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        "invalid",
        fixture.mergeCommit
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-sha-invalid",
      mergeCommitShas: [],
      failedCommitSha: null
    });
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        "9".repeat(40)
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-git-read-failed",
      mergeCommitShas: [],
      failedCommitSha: "9".repeat(40)
    });
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.mergeCommit,
        fixture.protectedSource
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-first-parent-chain-mismatch",
      mergeCommitShas: [],
      failedCommitSha: fixture.protectedSource
    });
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        fixture.secondParent
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-parent-count",
      mergeCommitShas: [],
      failedCommitSha: fixture.initialHead
    });
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        fixture.protectedSource
      )
    ).toEqual({
      allowed: true,
      rule: null,
      mergeCommitShas: [],
      failedCommitSha: null
    });
    const treeMismatchCommit = commitTree(
      fixture.root,
      runGit(fixture.root, ["rev-parse", `${fixture.protectedSource}^{tree}`]),
      [fixture.protectedSource, fixture.secondParent],
      "forged tree mismatch"
    );
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        treeMismatchCommit
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-tree-mismatch",
      mergeCommitShas: [],
      failedCommitSha: treeMismatchCommit
    });
    const octopusCommit = commitTree(
      fixture.root,
      runGit(fixture.root, ["rev-parse", `${fixture.secondParent}^{tree}`]),
      [fixture.protectedSource, fixture.secondParent, fixture.initialHead],
      "forged octopus"
    );
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        octopusCommit
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-parent-count",
      mergeCommitShas: [],
      failedCommitSha: octopusCommit
    });
    const unrecognizedMerge = commitTree(
      fixture.root,
      runGit(fixture.root, ["rev-parse", `${fixture.initialHead}^{tree}`]),
      [fixture.protectedSource, fixture.initialHead],
      "forged unrecognized lifecycle merge"
    );
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        unrecognizedMerge
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-lifecycle-unrecognized",
      mergeCommitShas: [],
      failedCommitSha: unrecognizedMerge
    });
    const invalidRegistryTree = treeFromCommitWithPathChanges(
      fixture.root,
      fixture.protectedSource,
      fixture.protectedSource,
      [],
      [{
        kind: "content",
        path: "coordination/repo-governance/active-work.json",
        content: "{invalid-json\n"
      }]
    );
    const invalidRegistrySecondParent = commitTree(
      fixture.root,
      invalidRegistryTree,
      [fixture.protectedSource],
      "invalid registry second parent"
    );
    const invalidRegistryMerge = commitTree(
      fixture.root,
      invalidRegistryTree,
      [fixture.protectedSource, invalidRegistrySecondParent],
      "merge invalid registry"
    );
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        invalidRegistryMerge
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-registry-read-failed",
      mergeCommitShas: [],
      failedCommitSha: invalidRegistryMerge
    });
    const forgedObservation = structuredClone(fixture.currentObservationRegistry);
    forgedObservation.branches.find(
      (entry: any) => entry.name === "codex/sena-pr80-post-main-closeout-20260901"
    ).prState = "OPEN";
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        forgedObservation,
        fixture.protectedSource,
        fixture.mergeCommit
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-current-observation-invalid",
      mergeCommitShas: [],
      failedCommitSha: fixture.mergeCommit
    });
    const pathMismatch = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-pr81-path-mismatch",
      { extraCandidatePath: true }
    );
    expect(
      pathMismatch.governance.protectedMainAdvanceChainResolution(
        pathMismatch.currentObservationRegistry,
        pathMismatch.protectedSource,
        pathMismatch.mergeCommit
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-path-set-mismatch",
      mergeCommitShas: [],
      failedCommitSha: pathMismatch.mergeCommit
    });
  });

  it("resolves a complete synthetic PR81 plus repair merge chain before and after root fast-forward", async () => {
    const pr81 = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-pr81-repair-chain"
    );
    const fixture = extendSyntheticProtectedMainFixtureWithRepair(pr81);
    const rootItem = {
      taskId: "SENA-A01-ROOT-CONTROL-PLANE-20260828",
      disposition: "integrated",
      laneType: "read-only",
      branch: "main",
      headSha: fixture.protectedSource,
      aheadBehind: { baseRef: "origin/main", ahead: 0, behind: 0 },
      dirtyState: "clean-main-exact-origin-main",
      repo: fixture.root,
      cwd: fixture.root,
      worktreePath: fixture.root
    };
    const branchRecord = {
      name: "main",
      headSha: fixture.protectedSource,
      remoteObservationMode: "lower-bound",
      remoteHeadSha: fixture.protectedSource
    };
    expect(() =>
      fixture.governance.validateProtectedCurrentnessRepairLifecycleSnapshot(
        fixture.currentObservationRegistry,
        fixture.governance.PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY
      )
    ).not.toThrow();
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        fixture.mergeCommit
      )
    ).toEqual({
      allowed: true,
      rule: null,
      mergeCommitShas: [fixture.mergeCommit],
      failedCommitSha: null
    });
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        fixture.repairMergeCommit
      )
    ).toEqual({
      allowed: true,
      rule: null,
      mergeCommitShas: [fixture.mergeCommit, fixture.repairMergeCommit],
      failedCommitSha: null
    });
    const forgedRepairObservation = structuredClone(fixture.currentObservationRegistry);
    protectedCurrentnessRepairBranchForTest(forgedRepairObservation).prState = "CLOSED";
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        forgedRepairObservation,
        fixture.protectedSource,
        fixture.repairMergeCommit
      )
    ).toEqual({
      allowed: false,
      rule: "protected-advance-current-observation-invalid",
      mergeCommitShas: [fixture.mergeCommit],
      failedCommitSha: fixture.repairMergeCommit
    });
    expect(
      fixture.governance.integratedReadOnlyRootRemoteRegistryAdvanceAllowed(
        rootItem,
        fixture.protectedSource,
        { baseRef: "origin/main", ahead: 0, behind: 2 },
        branchRecord,
        fixture.currentObservationRegistry
      )
    ).toBe(true);
    expect(
      fixture.governance.integratedReadOnlyRootRegistryAdvanceAllowed(
        rootItem,
        fixture.repairMergeCommit,
        fixture.currentObservationRegistry
      )
    ).toBe(true);
    expect(
      fixture.governance.integratedReadOnlyRootRegistryAdvanceAllowed(
        rootItem,
        fixture.mergeCommit,
        fixture.currentObservationRegistry
      )
    ).toBe(false);
  });

  it("starts before-fast-forward validation at the recorded root head when remote observation is the intermediate PR81 merge", async () => {
    const pr81 = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-real-lower-bound"
    );
    const fixture = extendSyntheticProtectedMainFixtureWithRepair(pr81);
    const rootItem = {
      taskId: "SENA-A01-ROOT-CONTROL-PLANE-20260828",
      disposition: "integrated",
      laneType: "read-only",
      branch: "main",
      headSha: fixture.protectedSource,
      aheadBehind: { baseRef: "origin/main", ahead: 0, behind: 0 },
      dirtyState: "clean-main-exact-origin-main",
      repo: fixture.root,
      cwd: fixture.root,
      worktreePath: fixture.root
    };
    const intermediateRemoteObservation = {
      name: "main",
      headSha: fixture.protectedSource,
      remoteObservationMode: "lower-bound",
      remoteHeadSha: fixture.mergeCommit
    };
    const observed = { baseRef: "origin/main", ahead: 0, behind: 2 };
    const exactChain = fixture.governance.protectedMainAdvanceChainResolution(
      fixture.currentObservationRegistry,
      rootItem.headSha,
      fixture.repairMergeCommit
    );
    expect(exactChain).toEqual({
      allowed: true,
      rule: null,
      mergeCommitShas: [fixture.mergeCommit, fixture.repairMergeCommit],
      failedCommitSha: null
    });
    expect(
      fixture.governance.integratedReadOnlyRootRemoteRegistryAdvanceAllowed(
        rootItem,
        rootItem.headSha,
        observed,
        intermediateRemoteObservation,
        fixture.currentObservationRegistry
      )
    ).toBe(true);

    const pr81Records = (registry: any) => ({
      item: registry.workItems.find(
        (entry: { taskId?: string }) =>
          entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
      ),
      branch: registry.branches.find(
        (entry: { name?: string }) =>
          entry.name === "codex/sena-pr80-post-main-closeout-20260901"
      )
    });
    const mutateBothMergedRecords = (
      registry: any,
      mutate: (record: any) => void
    ) => {
      const records = pr81Records(registry);
      mutate(records.item.lastMergedPullRequest);
      mutate(records.branch.lastMergedPullRequest);
    };
    const omittedMergeEvidenceMutations = [
      [
        "missing PR81 merge observation",
        (registry: any) => {
          const records = pr81Records(registry);
          delete records.item.lastMergedPullRequest;
          delete records.branch.lastMergedPullRequest;
        }
      ],
      [
        "interchanged PR81 and repair merge identity",
        (registry: any) => mutateBothMergedRecords(
          registry,
          (record) => (record.mergeCommitSha = fixture.repairMergeCommit)
        )
      ],
      [
        "duplicate PR81 ordered parents",
        (registry: any) => mutateBothMergedRecords(
          registry,
          (record) => (record.orderedParentShas = [
            fixture.protectedSource,
            fixture.protectedSource
          ])
        )
      ],
      [
        "interposed merge in PR81 ordered parents",
        (registry: any) => mutateBothMergedRecords(
          registry,
          (record) => (record.orderedParentShas = [
            fixture.protectedSource,
            fixture.repairMergeCommit,
            fixture.secondParent
          ])
        )
      ],
      [
        "wrong PR81 ordered parent order",
        (registry: any) => mutateBothMergedRecords(
          registry,
          (record) => record.orderedParentShas.reverse()
        )
      ],
      [
        "wrong PR81 branch identity",
        (registry: any) => (pr81Records(registry).branch.pr = 82)
      ],
      [
        "wrong PR81 currentness identity",
        (registry: any) => (pr81Records(registry).branch.prState = "OPEN")
      ]
    ] as Array<[string, (registry: any) => void]>;

    for (const [label, mutate] of omittedMergeEvidenceMutations) {
      const currentObservation = structuredClone(
        fixture.currentObservationRegistry
      );
      mutate(currentObservation);
      expect.soft(
        fixture.governance.protectedMainAdvanceChainResolution(
          currentObservation,
          rootItem.headSha,
          fixture.repairMergeCommit
        ),
        `${label}: full chain`
      ).toEqual({
        allowed: false,
        rule: "protected-advance-current-observation-invalid",
        mergeCommitShas: [],
        failedCommitSha: fixture.mergeCommit
      });
      expect.soft(
        fixture.governance.integratedReadOnlyRootRemoteRegistryAdvanceAllowed(
          rootItem,
          rootItem.headSha,
          observed,
          intermediateRemoteObservation,
          currentObservation
        ),
        `${label}: before-fast-forward helper`
      ).toBe(false);
    }
  });

  it("binds protected repair merge evidence to real Git objects", async () => {
    const pr81 = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-repair-git-binding"
    );
    const fixture = extendSyntheticProtectedMainFixtureWithRepair(pr81);
    const descriptor = {
      mergeTimeRegistry: fixture.repairMergeTimeRegistry,
      currentObservationRegistry: fixture.currentObservationRegistry,
      mergeCommitSha: fixture.repairMergeCommit,
      orderedParentShas: [fixture.mergeCommit, fixture.repairSecondParent],
      secondParentSha: fixture.repairSecondParent,
      mergeTreeSha: runGit(fixture.root, ["rev-parse", `${fixture.repairMergeCommit}^{tree}`]),
      registryBlobSha: runGit(fixture.root, [
        "rev-parse",
        `${fixture.repairMergeCommit}:coordination/repo-governance/active-work.json`
      ])
    };
    expect(
      fixture.governance.validateProtectedCurrentnessRepairMergeDescriptor(descriptor)
    ).toBe(true);
    const mutations: Array<[string, (copy: any) => void]> = [
      ["protected base head", (copy) => {
        for (const registry of [copy.mergeTimeRegistry, copy.currentObservationRegistry]) {
          protectedCurrentnessRepairItemForTest(registry)
            .protectedCurrentnessActivationRepairLifecycle.protectedBaseSha = "1".repeat(40);
        }
      }],
      ["protected base tree", (copy) => {
        for (const registry of [copy.mergeTimeRegistry, copy.currentObservationRegistry]) {
          protectedCurrentnessRepairItemForTest(registry)
            .protectedCurrentnessActivationRepairLifecycle.protectedBaseTreeSha = "2".repeat(40);
        }
      }],
      ["protected base registry", (copy) => {
        for (const registry of [copy.mergeTimeRegistry, copy.currentObservationRegistry]) {
          protectedCurrentnessRepairItemForTest(registry)
            .protectedCurrentnessActivationRepairLifecycle.protectedBaseRegistryBlobSha =
              "3".repeat(40);
        }
      }],
      ...[
        ["candidate tree", "treeSha", "4".repeat(40)],
        ["candidate registry", "registryBlobSha", "5".repeat(40)],
        ["candidate verifier", "verifierBlobSha", "6".repeat(40)],
        ["candidate test", "governanceTestBlobSha", "7".repeat(40)]
      ].map(([label, field, value]): [string, (copy: any) => void] => [
        String(label),
        (copy) => {
          for (const registry of [copy.mergeTimeRegistry, copy.currentObservationRegistry]) {
            protectedCurrentnessRepairItemForTest(registry)
              .protectedCurrentnessActivationRepairLifecycle
              .initialCandidateCompletionEvidence[field] = value;
            registry.releaseReceipts.at(-1)[field] = value;
          }
        }
      ]),
      ["candidate head unavailable", (copy) => {
        const unavailable = "8".repeat(40);
        for (const registry of [copy.mergeTimeRegistry, copy.currentObservationRegistry]) {
          const item = protectedCurrentnessRepairItemForTest(registry);
          const branch = protectedCurrentnessRepairBranchForTest(registry);
          item.protectedCurrentnessActivationRepairLifecycle
            .initialCandidateCompletionEvidence.headSha = unavailable;
          item.headSha = unavailable;
          branch.headSha = unavailable;
          branch.remoteHeadSha = unavailable;
          branch.prHeadSha = unavailable;
          registry.releaseReceipts.at(-1).headSha = unavailable;
        }
      }]
    ];
    const accepted = [];
    for (const [label, mutate] of mutations) {
      const copy = structuredClone(descriptor);
      mutate(copy);
      if (fixture.governance.validateProtectedCurrentnessRepairMergeDescriptor(copy)) {
        accepted.push(label);
      }
    }
    expect(accepted).toEqual([]);
    const validLifecycle = protectedCurrentnessRepairItemForTest(
      fixture.repairMergeTimeRegistry
    ).protectedCurrentnessActivationRepairLifecycle;
    expect(validLifecycle.initialCandidateCompletionEvidence.treeSha).toBe(
      runGit(fixture.root, ["rev-parse", `${fixture.repairInitialHead}^{tree}`])
    );
    expect(validLifecycle.initialCandidateCompletionEvidence.registryBlobSha).toBe(
      runGit(fixture.root, [
        "rev-parse",
        `${fixture.repairInitialHead}:coordination/repo-governance/active-work.json`
      ])
    );
    expect(validLifecycle.initialCandidateCompletionEvidence.verifierBlobSha).toBe(
      runGit(fixture.root, [
        "rev-parse",
        `${fixture.repairInitialHead}:scripts/verify-sena-repo-governance.mjs`
      ])
    );
    expect(validLifecycle.initialCandidateCompletionEvidence.governanceTestBlobSha).toBe(
      runGit(fixture.root, [
        "rev-parse",
        `${fixture.repairInitialHead}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ])
    );
    expect(
      fixture.governance.protectedMainRepairCandidateGitEvidenceMatches(
        validLifecycle,
        fixture.mergeCommit,
        fixture.repairSecondParent
      )
    ).toBe(true);
    for (const mode of ["missing", "extra", "rename", "invalid-registry"] as const) {
      const candidate = repairCandidateVariantForTest(fixture, mode);
      const lifecycle = repairLifecycleForCandidateTest(fixture, candidate);
      let finalChild;
      if (mode === "invalid-registry") {
        const validFinal = structuredClone(fixture.repairMergeTimeRegistry);
        validFinal.syntheticFinalMetadataNonce = mode;
        const tree = treeFromCommitWithPathChanges(
          fixture.root,
          candidate,
          candidate,
          [],
          [{
            kind: "content",
            path: "coordination/repo-governance/active-work.json",
            content: `${JSON.stringify(validFinal, null, 2)}\n`
          }]
        );
        finalChild = commitTree(
          fixture.root,
          tree,
          [candidate],
          "synthetic valid final after invalid repair registry"
        );
      } else {
        finalChild = registryOnlyMetadataChildForTest(fixture.root, candidate, `repair-${mode}`);
      }
      expect(
        fixture.governance.protectedMainRepairCandidateGitEvidenceMatches(
          lifecycle,
          fixture.mergeCommit,
          finalChild
        ),
        mode
      ).toBe(false);
    }
    const driftedFinalTree = treeFromCommitWithPathChanges(
      fixture.root,
      fixture.repairInitialHead,
      fixture.repairInitialHead,
      [],
      [{
        kind: "content",
        path: "scripts/verify-sena-repo-governance.mjs",
        content: "drifted repair final verifier\n"
      }]
    );
    const driftedFinal = commitTree(
      fixture.root,
      driftedFinalTree,
      [fixture.repairInitialHead],
      "synthetic drifted repair final metadata"
    );
    expect(
      fixture.governance.protectedMainRepairCandidateGitEvidenceMatches(
        validLifecycle,
        fixture.mergeCommit,
        driftedFinal
      )
    ).toBe(false);
  });

  it("resolves the synthetic PR81 repair and final PR46 protected merge chain", async () => {
    const pr81 = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-pr81-repair-pr46-chain"
    );
    const repair = extendSyntheticProtectedMainFixtureWithRepair(pr81);
    const fixture = extendSyntheticProtectedMainFixtureWithPr46(repair);
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        fixture.repairMergeCommit
      ).allowed
    ).toBe(true);
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.protectedSource,
        fixture.pr46MergeCommit
      )
    ).toEqual({
      allowed: true,
      rule: null,
      mergeCommitShas: [
        fixture.mergeCommit,
        fixture.repairMergeCommit,
        fixture.pr46MergeCommit
      ],
      failedCommitSha: null
    });

    const mergeTimeRegistry = JSON.parse(
      runGit(fixture.root, [
        "show",
        `${fixture.pr46SecondParent}:coordination/repo-governance/active-work.json`
      ])
    );
    const descriptor = {
      mergeTimeRegistry,
      currentObservationRegistry: fixture.currentObservationRegistry,
      mergeCommitSha: fixture.pr46MergeCommit,
      orderedParentShas: [fixture.repairMergeCommit, fixture.pr46SecondParent],
      secondParentSha: fixture.pr46SecondParent,
      mergeTreeSha: runGit(fixture.root, ["rev-parse", `${fixture.pr46MergeCommit}^{tree}`]),
      registryBlobSha: runGit(fixture.root, [
        "rev-parse",
        `${fixture.pr46MergeCommit}:coordination/repo-governance/active-work.json`
      ])
    };
    expect(fixture.governance.validatePr46ProtectedMainMergeDescriptor(descriptor)).toBe(true);
    const forgedEvidenceMutations: Array<[string, (evidence: any) => void]> = [
      ["candidate parents reversed", (evidence) => { evidence.candidateParentShas.reverse(); }],
      ["candidate protected parent drift", (evidence) => {
        evidence.candidateParentShas[1] = "f".repeat(40);
      }],
      ["candidate tree", (evidence) => { evidence.candidateTreeSha = "1".repeat(40); }],
      ["candidate registry blob", (evidence) => {
        evidence.candidateRegistryBlobSha = "2".repeat(40);
      }],
      ["candidate verifier blob", (evidence) => {
        evidence.candidateVerifierBlobSha = "3".repeat(40);
      }],
      ["candidate test blob", (evidence) => {
        evidence.candidateGovernanceTestBlobSha = "4".repeat(40);
      }],
      ["candidate binary diff", (evidence) => {
        evidence.binaryDiffSha256AgainstProtectedMain = "c".repeat(64);
      }],
      ["candidate normalized hash", (evidence) => {
        evidence.normalizedRegistrySha256 = "d".repeat(64);
      }]
    ];
    const acceptedForgedEvidence = [];
    for (const [label, mutate] of forgedEvidenceMutations) {
      const copy = structuredClone(descriptor);
      const mergeItem = copy.mergeTimeRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
      );
      const currentItem = copy.currentObservationRegistry.workItems.find(
        (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
      );
      const evidenceCopies = [
        mergeItem.finalBaseHandshakeAuthorization.remergeCandidateCompletionEvidence,
        copy.mergeTimeRegistry.releaseReceipts.at(-1).remergeCandidateCompletionEvidence,
        currentItem.finalBaseHandshakeAuthorization.remergeCandidateCompletionEvidence
      ];
      for (const evidence of evidenceCopies) mutate(evidence);
      if (fixture.governance.validatePr46ProtectedMainMergeDescriptor(copy)) {
        acceptedForgedEvidence.push(label);
      }
    }
    expect(acceptedForgedEvidence).toEqual([]);
    const validGitEvidence = pr46GitEvidenceForTest(fixture, fixture.candidateHead);
    expect(validGitEvidence.candidateTreeSha).toBe(
      runGit(fixture.root, ["rev-parse", `${fixture.candidateHead}^{tree}`])
    );
    expect(validGitEvidence.candidateRegistryBlobSha).toBe(
      runGit(fixture.root, [
        "rev-parse",
        `${fixture.candidateHead}:coordination/repo-governance/active-work.json`
      ])
    );
    expect(validGitEvidence.candidateVerifierBlobSha).toBe(
      runGit(fixture.root, [
        "rev-parse",
        `${fixture.candidateHead}:scripts/verify-sena-repo-governance.mjs`
      ])
    );
    expect(validGitEvidence.candidateGovernanceTestBlobSha).toBe(
      runGit(fixture.root, [
        "rev-parse",
        `${fixture.candidateHead}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ])
    );
    expect(validGitEvidence.binaryDiffSha256AgainstProtectedMain).not.toBe("a".repeat(64));
    expect(validGitEvidence.normalizedRegistrySha256).not.toBe("b".repeat(64));
    expect(
      fixture.governance.protectedMainPr46CandidateGitEvidenceMatches(
        validGitEvidence,
        fixture.repairMergeCommit,
        fixture.pr46SecondParent
      )
    ).toBe(true);
    const candidateTree = runGit(fixture.root, [
      "rev-parse",
      `${fixture.candidateHead}^{tree}`
    ]);
    const topologyVariants = [
      ["linear", [fixture.repairMergeCommit]],
      ["three parents", [fixture.laneHead, fixture.repairMergeCommit, fixture.initialHead]],
      ["reversed parents", [fixture.repairMergeCommit, fixture.laneHead]],
      ["non-protected second parent", [fixture.laneHead, fixture.initialHead]]
    ] as Array<[string, string[]]>;
    for (const [label, parents] of topologyVariants) {
      const candidate = commitTree(
        fixture.root,
        candidateTree,
        parents,
        `synthetic PR46 ${label}`
      );
      const finalChild = registryOnlyMetadataChildForTest(fixture.root, candidate, label);
      const evidence = pr46GitEvidenceForTest(fixture, candidate);
      expect(
        fixture.governance.protectedMainPr46CandidateGitEvidenceMatches(
          evidence,
          fixture.repairMergeCommit,
          finalChild
        ),
        label
      ).toBe(false);
    }
    for (const mode of ["missing", "extra", "rename"] as const) {
      const candidate = pr46CandidatePathVariantForTest(fixture, mode);
      const finalChild = registryOnlyMetadataChildForTest(fixture.root, candidate, mode);
      let evidence;
      try {
        evidence = pr46GitEvidenceForTest(fixture, candidate);
      } catch {
        const candidateRegistry = JSON.parse(
          runGit(fixture.root, [
            "show",
            `${candidate}:coordination/repo-governance/active-work.json`
          ])
        );
        evidence = {
          ...validGitEvidence,
          candidateHeadSha: candidate,
          candidateTreeSha: runGit(fixture.root, ["rev-parse", `${candidate}^{tree}`]),
          candidateRegistryBlobSha: runGit(fixture.root, [
            "rev-parse",
            `${candidate}:coordination/repo-governance/active-work.json`
          ]),
          candidateParentShas: runGit(fixture.root, [
            "rev-list", "--parents", "-n", "1", candidate
          ]).split(/\s+/).slice(1),
          binaryDiffSha256AgainstProtectedMain:
            fixture.governance.protectedMainPr46BinaryDiffSha256(
              fixture.repairMergeCommit,
              candidate
            ),
          normalizedRegistrySha256:
            fixture.governance.protectedMainNormalizedNonOwnedRegistrySha256(
              candidateRegistry
            )
        };
      }
      expect(
        fixture.governance.protectedMainPr46CandidateGitEvidenceMatches(
          evidence,
          fixture.repairMergeCommit,
          finalChild
        ),
        `${mode} path set`
      ).toBe(false);
    }
    runGit(fixture.root, ["checkout", "-q", "--detach", fixture.candidateHead]);
    writeFileSync(
      join(fixture.root, "scripts", "verify-sena-repo-governance.mjs"),
      "drifted after candidate\n"
    );
    runGit(fixture.root, ["add", "scripts/verify-sena-repo-governance.mjs"]);
    const driftedFinalTree = runGit(fixture.root, ["write-tree"]);
    const driftedFinal = commitTree(
      fixture.root,
      driftedFinalTree,
      [fixture.candidateHead],
      "synthetic drifted final metadata"
    );
    expect(
      fixture.governance.protectedMainPr46CandidateGitEvidenceMatches(
        validGitEvidence,
        fixture.repairMergeCommit,
        driftedFinal
      )
    ).toBe(false);
    const pr46Mutations: Array<[string, (copy: any) => void]> = [
      ["status", (copy) => {
        copy.mergeTimeRegistry.workItems.find(
          (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
        ).finalBaseHandshakeAuthorization.status = "unrecognized";
      }],
      ["sole ready action", (copy) => {
        copy.mergeTimeRegistry.workItems.find(
          (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
        ).finalBaseHandshakeAuthorization.finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks = true;
      }],
      ["receipt order", (copy) => {
        const receipts = copy.mergeTimeRegistry.releaseReceipts;
        [receipts[receipts.length - 2], receipts[receipts.length - 1]] =
          [receipts[receipts.length - 1], receipts[receipts.length - 2]];
      }],
      ["receipt status", (copy) => {
        copy.mergeTimeRegistry.releaseReceipts.at(-1).status = "drifted";
      }],
      ["overall path", (copy) => {
        copy.mergeTimeRegistry.workItems.find(
          (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
        ).finalBaseHandshakeAuthorization.authorizedResolverTransition.finalReadyState
          .requiredOverallChangedPathsFromProtectedMain.push("extra.txt");
      }],
      ["missing overall path", (copy) => {
        copy.mergeTimeRegistry.workItems.find(
          (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
        ).finalBaseHandshakeAuthorization.authorizedResolverTransition.finalReadyState
          .requiredOverallChangedPathsFromProtectedMain.pop();
      }],
      ["recorded remerge parent", (copy) => {
        copy.mergeTimeRegistry.workItems.find(
          (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
        ).finalBaseHandshakeAuthorization.remergeCandidateCompletionEvidence.candidateHeadSha =
          fixture.repairMergeCommit;
      }],
      ["pull request number", (copy) => {
        copy.mergeTimeRegistry.workItems.find(
          (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
        ).prNumber = 45;
      }],
      ["base branch", (copy) => {
        copy.mergeTimeRegistry.branches.find(
          (entry: any) => entry.name === "codex/sena-branch-retirement-20260829"
        ).prBase = "develop";
      }],
      ["observation substitutes merge lifecycle", (copy) => {
        delete copy.mergeTimeRegistry.workItems.find(
          (entry: any) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
        ).finalBaseHandshakeAuthorization;
      }]
    ];
    for (const [label, mutate] of pr46Mutations) {
      const copy = structuredClone(descriptor);
      mutate(copy);
      expect(
        fixture.governance.validatePr46ProtectedMainMergeDescriptor(copy),
        label
      ).toBe(false);
    }
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        fixture.currentObservationRegistry,
        fixture.repairMergeCommit,
        fixture.pr46SecondParent
      ).allowed
    ).toBe(false);

    const badStatus = structuredClone(fixture.currentObservationRegistry);
    badStatus.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    ).finalBaseHandshakeAuthorization.status = "pending-protected-activation";
    expect(
      fixture.governance.protectedMainAdvanceChainResolution(
        badStatus,
        fixture.protectedSource,
        fixture.pr46MergeCommit
      ).allowed
    ).toBe(false);
  });

  it("requires the exact schema version on both PR46 transition receipts", async () => {
    const pr81 = await createSyntheticProtectedMainPr81Fixture(
      "protected-main-pr46-receipt-schema"
    );
    const repair = extendSyntheticProtectedMainFixtureWithRepair(pr81);
    const fixture = extendSyntheticProtectedMainFixtureWithPr46(repair);
    const descriptor = {
      mergeTimeRegistry: JSON.parse(
        runGit(fixture.root, [
          "show",
          `${fixture.pr46SecondParent}:coordination/repo-governance/active-work.json`
        ])
      ),
      currentObservationRegistry: fixture.currentObservationRegistry,
      mergeCommitSha: fixture.pr46MergeCommit,
      orderedParentShas: [fixture.repairMergeCommit, fixture.pr46SecondParent],
      secondParentSha: fixture.pr46SecondParent,
      mergeTreeSha: runGit(fixture.root, ["rev-parse", `${fixture.pr46MergeCommit}^{tree}`]),
      registryBlobSha: runGit(fixture.root, [
        "rev-parse",
        `${fixture.pr46MergeCommit}:coordination/repo-governance/active-work.json`
      ])
    };
    const versioned = structuredClone(descriptor);
    expect(
      fixture.governance.validatePr46ProtectedMainMergeDescriptor(versioned)
    ).toBe(true);
    const missing = structuredClone(descriptor);
    delete missing.mergeTimeRegistry.releaseReceipts.at(-2).schemaVersion;
    expect(
      fixture.governance.validatePr46ProtectedMainMergeDescriptor(missing)
    ).toBe(false);
    const wrong = structuredClone(versioned);
    wrong.mergeTimeRegistry.releaseReceipts.at(-1).schemaVersion = "wrong/v1";
    expect(
      fixture.governance.validatePr46ProtectedMainMergeDescriptor(wrong)
    ).toBe(false);
    const extra = structuredClone(versioned);
    extra.mergeTimeRegistry.releaseReceipts.at(-1).unknown = false;
    expect(
      fixture.governance.validatePr46ProtectedMainMergeDescriptor(extra)
    ).toBe(false);
  });

  it("rejects a linear registry-only commit as a protected-main root advance", () => {
    const fixture = createGovernedFixture("integrated-root-registry-only-advance");
    runGit(fixture.root, ["branch", "-M", "main"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", fixture.head]);
    runGit(fixture.root, ["branch", "--set-upstream-to=origin/main", "main"]);

    const registry = JSON.parse(readFileSync(fixture.registryPath, "utf8"));
    const item = registry.workItems[0];
    const branch = registry.branches[0];
    item.taskId = "SENA-A01-ROOT-CONTROL-PLANE-20260828";
    item.owner = "SENA-A01 root control plane";
    item.ownerKey = "SENA-A01";
    item.ownerLane = "A01 read-only coordination";
    item.laneType = "read-only";
    item.branch = "main";
    item.headSha = fixture.head;
    item.aheadBehind = { baseRef: "origin/main", ahead: 0, behind: 0 };
    item.allowedPaths = ["<read-only coordination and synchronization only>"];
    item.prNumber = null;
    item.noPrReason = "Root is the read-only protected-main control plane.";
    item.dirtyState = "clean-main-exact-origin-main";
    item.disposition = "integrated";
    delete item.prIsDraft;
    delete item.prReadyForReview;
    delete item.mergeAuthorized;
    delete item.freezeException;
    delete item.cleanupAuthorization;

    branch.name = "main";
    branch.owner = "SENA-A01";
    branch.ownerKey = "SENA-A01";
    branch.headSha = fixture.head;
    branch.upstream = "origin/main";
    branch.upstreamState = "live";
    branch.upstreamCacheState = "present";
    branch.remotePresent = true;
    branch.remoteHeadSha = fixture.head;
    branch.remoteObservationMode = "lower-bound";
    branch.pr = null;
    branch.noPrReason = "Control-plane main branch.";
    branch.disposition = "integrated";
    delete branch.prState;
    delete branch.prIsDraft;
    delete branch.prReadyForReview;
    delete branch.mergeAuthorized;
    delete branch.prHeadSha;
    delete branch.prBase;
    delete branch.prStateObservationMode;

    const registryRoot = temporaryRoot("integrated-root-registry-snapshot");
    const registrySnapshot = join(registryRoot, "active-work.json");
    writeFileSync(registrySnapshot, `${JSON.stringify(registry, null, 2)}\n`);
    writeFileSync(fixture.registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    runGit(fixture.root, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(fixture.root, ["commit", "-q", "-m", "protected main registry-only heartbeat"]);
    const registryOnlyMain = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", registryOnlyMain]);

    const registryOnlyAudit = runNode(fixture.script, ["audit", "--registry", registrySnapshot], {
      cwd: fixture.root,
      env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
    });
    const registryOnlyReport = JSON.parse(registryOnlyAudit.stdout);
    expect(registryOnlyAudit.status).toBe(1);
    expect(registryOnlyReport.errors).toContain("branch head differs from registry: main");
    expect(registryOnlyReport.errors).toContain(
      "workItem headSha is not a permitted forward-only allowed-path advance: SENA-A01-ROOT-CONTROL-PLANE-20260828"
    );
    expect(registryOnlyReport.warnings).not.toContain(
      "integrated read-only root absorbed a protected-main registry-only advance: SENA-A01-ROOT-CONTROL-PLANE-20260828"
    );

    runGit(fixture.root, ["checkout", "-q", "--detach", registryOnlyMain]);
    runGit(fixture.root, ["branch", "-f", "main", fixture.head]);
    runGit(fixture.root, ["checkout", "-q", "main"]);
    const remoteOnlyAudit = runNode(fixture.script, ["audit", "--registry", registrySnapshot], {
      cwd: fixture.root,
      env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
    });
    const remoteOnlyReport = JSON.parse(remoteOnlyAudit.stdout);
    expect(remoteOnlyAudit.status).toBe(1);
    expect(remoteOnlyReport.errors).toContain(
      "workItem ahead/behind differs from registry: SENA-A01-ROOT-CONTROL-PLANE-20260828"
    );
    expect(remoteOnlyReport.warnings).not.toContain(
      "integrated read-only root observed a protected-main registry-only remote advance without advancing local main: SENA-A01-ROOT-CONTROL-PLANE-20260828"
    );

    runGit(fixture.root, ["checkout", "-q", "--detach", registryOnlyMain]);
    writeFileSync(join(fixture.root, "README.md"), "unauthorized protected-main product change\n");
    runGit(fixture.root, ["add", "README.md"]);
    runGit(fixture.root, ["commit", "-q", "-m", "protected main product change"]);
    const productMain = runGit(fixture.root, ["rev-parse", "HEAD"]);
    runGit(fixture.root, ["update-ref", "refs/remotes/origin/main", productMain]);
    runGit(fixture.root, ["checkout", "-q", "main"]);

    const productAudit = runNode(fixture.script, ["audit", "--registry", registrySnapshot], {
      cwd: fixture.root,
      env: { SENA_GOVERNANCE_TARGET_ROOT: fixture.root }
    });
    const productReport = JSON.parse(productAudit.stdout);
    expect(productAudit.status).toBe(1);
    expect(productReport.errors).toContain(
      "workItem ahead/behind differs from registry: SENA-A01-ROOT-CONTROL-PLANE-20260828"
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
      const [ahead, behind] = runGit(projectRoot, [
        "rev-list",
        "--left-right",
        "--count",
        `${active.branch}...${active.aheadBehind.baseRef}`
      ]).split(/\s+/).map(Number);
      active.aheadBehind = { ...active.aheadBehind, ahead, behind };
      const branch = registry.branches.find((entry: { name: string }) => entry.name === active.branch);
      branch.disposition = "integrated";
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

  it("fails closed across the exact PR80 repair authorization transition and receipt delta", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    expect(typeof governance.pr80RepairLifecycleResolutionFromRegistries).toBe("function");
    expect(typeof governance.pr80RepairLifecycleTrueAuthorizationPaths).toBe("function");
    expect(typeof governance.assertPr80RepairLifecycleIndexPaths).toBe("function");
    expect(typeof governance.assertPr80RepairA01ProjectionAdvanced).toBe("function");
    expect(typeof governance.validatePr80RepairLifecycleSnapshot).toBe("function");

    const currentRegistry = JSON.parse(
      readFileSync(join(projectRoot, "coordination", "repo-governance", "active-work.json"), "utf8")
    );
    const initialRegistry = selectPr80InitialRegistry(currentRegistry, (commit) =>
      JSON.parse(
        runGit(projectRoot, [
          "show",
          `${commit}:coordination/repo-governance/active-work.json`
        ])
      )
    );
    const initialItem = initialRegistry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
    );
    const initialLifecycle = initialItem.pr80FinalReadyTestRepairLifecycle;
    expect(
      selectPr80InitialRegistry(initialRegistry, () => {
        throw new Error("initial selector must not load a commit for an initial snapshot");
      })
    ).toBe(initialRegistry);
    const protectedRegistry = JSON.parse(
      runGit(projectRoot, [
        "show",
        `${initialLifecycle.protectedBaseSha}:coordination/repo-governance/active-work.json`
      ])
    );
    const protectedContext = {
      sourceHeadSha: initialLifecycle.protectedBaseSha,
      sourceTreeSha: initialLifecycle.protectedBaseTreeSha,
      sourceRegistryBlobSha: initialLifecycle.protectedBaseRegistryBlobSha
    };

    expect(
      governance.pr80RepairLifecycleResolutionFromRegistries(
        protectedRegistry,
        initialRegistry,
        protectedContext
      ).mode
    ).toBe("pr80-repair-authorization-candidate-awaiting-initial-checks");
    expect(governance.pr80RepairLifecycleTrueAuthorizationPaths(initialLifecycle)).toEqual([
      "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks"
    ]);

    const initialCases: Array<[string, (candidate: typeof initialRegistry) => void]> = [
      ["rule=pr80-repair-status-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.status = "arbitrary";
      }],
      ["rule=pr80-repair-initial-action-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.future = { nestedMutationAuthorized: true };
      }],
      ["rule=pr80-repair-initial-action-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.futureMutationAuthorized = true;
      }],
      ["rule=pr80-repair-initial-a01-authorization-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).futureCleanupAuthorized = true;
      }],
      ["rule=pr80-repair-initial-a01-authorization-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr79FinalAuthorization.readyForReviewAuthorizedAfterFinalHeadChecks = false;
      }],
      ["rule=pr80-repair-receipt-prefix-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.protectedBaseReceiptPrefix.count += 1;
      }],
      ["rule=pr80-repair-receipt-prefix-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.protectedBaseReceiptPrefix.sha256 = "0".repeat(64);
      }],
      ["rule=pr80-repair-receipt-prefix-invalid", (candidate) => {
        candidate.releaseReceipts[0].status = "historical-prefix-drift";
      }],
      ["rule=pr80-repair-initial-receipt-delta-invalid", (candidate) => {
        candidate.releaseReceipts.pop();
      }],
      ["rule=pr80-repair-initial-receipt-delta-invalid", (candidate) => {
        candidate.releaseReceipts.push(structuredClone(candidate.releaseReceipts.at(-1)));
      }],
      ["rule=pr80-repair-initial-receipt-delta-invalid", (candidate) => {
        candidate.releaseReceipts.push({ receiptKind: "unrelated-extra-receipt" });
      }],
      ["rule=pr80-repair-transition-receipt-invalid", (candidate) => {
        candidate.releaseReceipts.at(-1).scope.push("unexpected.ts");
      }],
      ["rule=pr80-repair-transition-receipt-invalid", (candidate) => {
        candidate.releaseReceipts.at(-1).authorizationBoundary.futureMutationAuthorized = true;
      }]
    ];
    for (const [expectedError, mutate] of initialCases) {
      const candidate = structuredClone(initialRegistry);
      mutate(candidate);
      expect(() =>
        governance.pr80RepairLifecycleResolutionFromRegistries(
          protectedRegistry,
          candidate,
          protectedContext
        )
      ).toThrow(expectedError);
    }
    expect(() =>
      governance.pr80RepairLifecycleResolutionFromRegistries(
        protectedRegistry,
        initialRegistry,
        { ...protectedContext, sourceHeadSha: "0".repeat(40) }
      )
    ).toThrow("rule=pr80-repair-protected-base-mismatch");
    expect(() =>
      governance.pr80RepairLifecycleResolutionFromRegistries(
        initialRegistry,
        structuredClone(initialRegistry),
        protectedContext
      )
    ).toThrow("rule=pr80-repair-transition-source-invalid");
    expect(() =>
      governance.assertPr80RepairA01ProjectionAdvanced(
        initialRegistry,
        structuredClone(initialRegistry)
      )
    ).toThrow("rule=pr80-repair-unchanged-lifecycle-staged-delta");
    expect(() =>
      governance.assertPr80RepairLifecycleIndexPaths(initialLifecycle, [
        ...initialLifecycle.requiredCandidatePaths,
        "unexpected.ts"
      ])
    ).toThrow("rule=pr80-repair-index-path-set-mismatch");

    const initialCandidateHeadSha = "a".repeat(40);
    const initialCandidateTreeSha = "b".repeat(40);
    const initialCandidateRegistryBlobSha = "c".repeat(40);
    const finalRegistry = structuredClone(initialRegistry);
    const finalItem = finalRegistry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
    );
    const finalLifecycle = finalItem.pr80FinalReadyTestRepairLifecycle;
    finalLifecycle.status = "pr80-ready-authorization-pending-final-head-checks";
    finalLifecycle.finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks = false;
    finalLifecycle.pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks = true;
    finalLifecycle.initialCandidateCompletionEvidence = {
      headSha: initialCandidateHeadSha,
      treeSha: initialCandidateTreeSha,
      registryBlobSha: initialCandidateRegistryBlobSha,
      buildRunId: 33460000001,
      repositorySecurityRunIds: [33460000002, 33460000003],
      checkJobIds: [99710000001, 99710000002, 99710000003],
      requiredChecksPassed: true,
      annotationsEmpty: true,
      specReviewApproved: true,
      qualityReviewApproved: true
    };
    finalItem.headSha = initialCandidateHeadSha;
    finalItem.prNumber = 80;
    finalItem.prIsDraft = true;
    finalItem.prReadyForReview = false;
    finalItem.mergeAuthorized = false;
    const finalBranch = finalRegistry.branches.find(
      (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
    );
    finalBranch.headSha = initialCandidateHeadSha;
    finalBranch.remoteHeadSha = initialCandidateHeadSha;
    finalBranch.pr = 80;
    finalBranch.prState = "OPEN";
    finalBranch.prBase = "main";
    finalBranch.prIsDraft = true;
    finalBranch.prReadyForReview = false;
    finalBranch.mergeAuthorized = false;
    finalBranch.prHeadSha = initialCandidateHeadSha;
    finalBranch.mergeable = "MERGEABLE";
    finalBranch.mergeStateStatus = "CLEAN";
    finalRegistry.releaseReceipts.push({
      schemaVersion: "sena-registry-reconciliation-receipt/v1",
      receiptKind: "pr80-final-ready-test-repair-final-authorization",
      status: "authorized-for-pr80-ready-and-protected-merge-after-final-head-checks",
      taskId: "SENA-A01-REPO-GOVERNANCE-20260827",
      ownerKey: "Codex-primary-writer",
      scope: ["coordination/repo-governance/active-work.json"],
      authorizationSourceInitialHeadSha: initialCandidateHeadSha,
      authorizationSourceInitialTreeSha: initialCandidateTreeSha,
      authorizationSourceInitialRegistryBlobSha: initialCandidateRegistryBlobSha,
      buildRunId: 33460000001,
      repositorySecurityRunIds: [33460000002, 33460000003],
      checkJobIds: [99710000001, 99710000002, 99710000003],
      requiredChecksPassed: true,
      annotationsEmpty: true,
      specReviewApproved: true,
      qualityReviewApproved: true,
      authorizationBoundary: {
        finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks: false,
        pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks: true,
        pr46ReadyAndProtectedMergeAuthorizedNow: false,
        branchDeletionAuthorized: false
      }
    });
    const initialContext = {
      sourceHeadSha: initialCandidateHeadSha,
      sourceTreeSha: initialCandidateTreeSha,
      sourceRegistryBlobSha: initialCandidateRegistryBlobSha,
      buildRunId: 33460000001,
      repositorySecurityRunIds: [33460000002, 33460000003],
      checkJobIds: [99710000001, 99710000002, 99710000003],
      requiredChecksPassed: true,
      annotationsEmpty: true,
      specReviewApproved: true,
      qualityReviewApproved: true
    };

    expect(
      governance.pr80RepairLifecycleResolutionFromRegistries(
        initialRegistry,
        finalRegistry,
        initialContext
      ).mode
    ).toBe("pr80-ready-authorization-pending-final-head-checks");
    expect(governance.pr80RepairLifecycleTrueAuthorizationPaths(finalLifecycle)).toEqual([
      "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks"
    ]);

    const finalCases: Array<[string, (candidate: typeof finalRegistry) => void]> = [
      ["rule=pr80-repair-final-action-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks = true;
      }],
      ["rule=pr80-repair-final-action-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.future = { nestedMutationAuthorized: true };
      }],
      ["rule=pr80-repair-final-a01-authorization-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).futureCleanupAuthorized = true;
      }],
      ["rule=pr80-repair-final-field-scope-drift", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).allowedPaths.push("unexpected/**");
      }],
      ["rule=pr80-repair-final-field-scope-drift", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).ownerKey = "drifted-owner";
      }],
      ["rule=pr80-repair-final-field-scope-drift", (candidate) => {
        candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).disposition = "integrated";
      }],
      ["rule=pr80-repair-final-a01-authorization-set-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr79FinalAuthorization.readyForReviewAuthorizedAfterFinalHeadChecks = false;
      }],
      ["rule=pr80-repair-lifecycle-core-drift", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.requiredExecution.push("unexpected-action");
      }],
      ["rule=pr80-repair-final-field-scope-drift", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.futurePolicy = "allow";
      }],
      ["rule=pr80-repair-final-field-scope-drift", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-ROOT-CONTROL-PLANE-20260828"
        ).headSha = "0".repeat(40);
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).prIsDraft = false;
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).prReadyForReview = true;
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).mergeAuthorized = true;
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).prNumber = 81;
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        delete candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).pr;
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).prState = "MERGED";
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).headSha = "0".repeat(40);
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).remoteHeadSha = "0".repeat(40);
      }],
      ["rule=pr80-repair-final-pr-state-invalid", (candidate) => {
        candidate.branches.find(
          (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
        ).prHeadSha = "0".repeat(40);
      }],
      ["rule=pr80-repair-final-receipt-delta-invalid", (candidate) => {
        candidate.releaseReceipts.pop();
      }],
      ["rule=pr80-repair-final-receipt-delta-invalid", (candidate) => {
        candidate.releaseReceipts.push(structuredClone(candidate.releaseReceipts.at(-1)));
      }],
      ["rule=pr80-repair-final-receipt-delta-invalid", (candidate) => {
        candidate.releaseReceipts.push({ receiptKind: "unrelated-extra-receipt" });
      }],
      ["rule=pr80-repair-final-receipt-delta-invalid", (candidate) => {
        const [candidateReceipt] = candidate.releaseReceipts.splice(-2, 1);
        candidate.releaseReceipts.push(candidateReceipt);
      }],
      ["rule=pr80-repair-transition-receipt-invalid", (candidate) => {
        candidate.releaseReceipts.at(-1).scope.push("unexpected.ts");
      }],
      ["rule=pr80-repair-final-evidence-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.initialCandidateCompletionEvidence.requiredChecksPassed = false;
      }],
      ["rule=pr80-repair-final-evidence-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.initialCandidateCompletionEvidence.repositorySecurityRunIds = [33460000002];
      }],
      ["rule=pr80-repair-final-evidence-invalid", (candidate) => {
        candidate.workItems.find(
          (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
        ).pr80FinalReadyTestRepairLifecycle.initialCandidateCompletionEvidence.checkJobIds = [99710000001, 99710000001, 99710000003];
      }],
      ["rule=pr80-repair-final-evidence-invalid", (candidate) => {
        candidate.releaseReceipts.at(-1).buildRunId += 1;
      }]
    ];
    for (const [expectedError, mutate] of finalCases) {
      const candidate = structuredClone(finalRegistry);
      mutate(candidate);
      expect(() =>
        governance.pr80RepairLifecycleResolutionFromRegistries(
          initialRegistry,
          candidate,
          initialContext
        )
      ).toThrow(expectedError);
    }

    expect(() =>
      governance.pr80RepairLifecycleResolutionFromRegistries(
        initialRegistry,
        finalRegistry,
        { ...initialContext, checkJobIds: [99710000001, 99710000002, 99710000004] }
      )
    ).toThrow("rule=pr80-repair-final-evidence-invalid");
    expect(() =>
      governance.pr80RepairLifecycleResolutionFromRegistries(
        protectedRegistry,
        finalRegistry,
        initialContext
      )
    ).toThrow("rule=pr80-repair-transition-source-invalid");

    expect(() =>
      governance.pr80RepairLifecycleResolutionFromRegistries(
        finalRegistry,
        structuredClone(finalRegistry),
        initialContext
      )
    ).toThrow("rule=pr80-repair-transition-replay");

    const postFinalRegistry = structuredClone(finalRegistry);
    postFinalRegistry.releaseReceipts.push({ receiptKind: "later-separately-authorized-receipt" });
    const postMainHeadSha = "d".repeat(40);
    const postFinalItem = postFinalRegistry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
    );
    postFinalItem.headSha = postMainHeadSha;
    postFinalItem.prIsDraft = false;
    postFinalItem.prReadyForReview = true;
    postFinalItem.disposition = "integrated";
    postFinalItem.dirtyState = "clean-pr80-merged-a01-terminal";
    postFinalItem.lastMergedPullRequest = {
      number: 80,
      headSha: postMainHeadSha,
      mergeCommitSha: "e".repeat(40),
      postMainChecksPassed: true
    };
    const postFinalBranch = postFinalRegistry.branches.find(
      (entry: { name?: string }) => entry.name === "codex/sena-a01-repo-governance-20260827"
    );
    postFinalBranch.headSha = postMainHeadSha;
    postFinalBranch.remoteHeadSha = postMainHeadSha;
    postFinalBranch.prHeadSha = postMainHeadSha;
    postFinalBranch.prState = "MERGED";
    postFinalBranch.prIsDraft = false;
    postFinalBranch.prReadyForReview = true;
    postFinalBranch.disposition = "integrated";
    postFinalBranch.lastMergedPullRequest = structuredClone(postFinalItem.lastMergedPullRequest);
    postFinalBranch.closeout = "PR80 merged; A01 terminal and awaiting non-A01 retirement";
    expect(
      governance.validatePr80RepairLifecycleSnapshot(postFinalRegistry).status
    ).toBe("pr80-ready-authorization-pending-final-head-checks");
    expect(
      selectPr80InitialRegistry(finalRegistry, (commit) => {
        expect(commit).toBe(initialCandidateHeadSha);
        return initialRegistry;
      })
    ).toBe(initialRegistry);
    expect(
      selectPr80InitialRegistry(postFinalRegistry, () => initialRegistry)
    ).toBe(initialRegistry);
    const missingInitialHeadRegistry = structuredClone(finalRegistry);
    missingInitialHeadRegistry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827"
    ).pr80FinalReadyTestRepairLifecycle.initialCandidateCompletionEvidence.headSha = null;
    expect(() =>
      selectPr80InitialRegistry(missingInitialHeadRegistry, () => initialRegistry)
    ).toThrow("PR80 final snapshot lacks an exact initial completion head");
    expect(() =>
      selectPr80InitialRegistry(finalRegistry, () => {
        throw new Error("initial registry commit unavailable");
      })
    ).toThrow("initial registry commit unavailable");
    expect(() =>
      governance.assertPr80RepairA01ProjectionAdvanced(
        finalRegistry,
        postFinalRegistry
      )
    ).toThrow("rule=pr80-repair-final-a01-writer-lane-sealed");
  });

  it("fails closed across the protected currentness repair lifecycle", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    expect(typeof governance.validateProtectedCurrentnessRepairLifecycleSnapshot).toBe("function");
    expect(
      typeof governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries
    ).toBe("function");
    expect(typeof governance.validateProtectedCurrentnessRepairInitialDelta).toBe("function");
    expect(typeof governance.validateProtectedCurrentnessRepairFinalDelta).toBe("function");
    expect(
      typeof governance.validateProtectedCurrentnessRepairInitialEvidenceStructure
    ).toBe("function");
    expect(
      typeof governance.validateProtectedCurrentnessRepairInitialEvidenceAgainstContext
    ).toBe("function");
    expect(typeof governance.protectedCurrentnessRepairObservationContextFromEnvironment).toBe(
      "function"
    );
    expect(typeof governance.validateProtectedCurrentnessRepairIndexTransition).toBe("function");
    expect(typeof governance.assertProtectedCurrentnessRepairIndexPaths).toBe("function");
    expect(typeof governance.protectedCurrentnessRepairTrueBooleanPaths).toBe("function");

    const currentRegistry = JSON.parse(
      readFileSync(
        join(projectRoot, "coordination", "repo-governance", "active-work.json"),
        "utf8"
      )
    );
    const currentItem = protectedCurrentnessRepairItemForTest(currentRegistry);
    const actualPrNumber = currentItem.prNumber;
    expect(Number.isInteger(actualPrNumber) && actualPrNumber > 0).toBe(true);
    expect(actualPrNumber).toBe(82);

    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const designPlanSeedHead = frozenSource.headSha;
    const designPlanSeedTree = frozenSource.treeSha;
    const designPlanSeedRegistry = frozenSource.registry;
    const indexedRegistry = JSON.parse(
      runGit(projectRoot, [
        "--no-optional-locks",
        "show",
        ":coordination/repo-governance/active-work.json"
      ])
    );
    const expectedReceiptKindsForLifecycleStatus = (status: unknown) => {
      if (status === governance.PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS) {
        return [governance.PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT];
      }
      if (status === governance.PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS) {
        return [
          governance.PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
          governance.PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
        ];
      }
      throw new Error(`unsupported protected currentness repair lifecycle status: ${String(status)}`);
    };
    const expectPhaseAwareRepairReceipts = (registry: any) => {
      const lifecycle = protectedCurrentnessRepairItemForTest(
        registry
      ).protectedCurrentnessActivationRepairLifecycle;
      const expectedKinds = expectedReceiptKindsForLifecycleStatus(
        lifecycle?.status
      );
      const prefixCount = lifecycle.designPlanSeedReceiptPrefix.count;
      const prefixReceipts = registry.releaseReceipts.slice(0, prefixCount);
      expect(prefixCount).toBe(designPlanSeedRegistry.releaseReceipts.length);
      expect(prefixReceipts).toEqual(designPlanSeedRegistry.releaseReceipts);
      expect(
        createHash("sha256")
          .update(JSON.stringify(prefixReceipts))
          .digest("hex")
      ).toBe(lifecycle.designPlanSeedReceiptPrefix.sha256);
      expect(registry.releaseReceipts).toHaveLength(
        prefixCount + expectedKinds.length
      );
      expect(
        registry.releaseReceipts.slice(prefixCount).map((receipt: any) => ({
          schemaVersion: receipt.schemaVersion,
          receiptKind: receipt.receiptKind
        }))
      ).toEqual(expectedKinds.map((receiptKind: string) => ({
        schemaVersion: "sena-registry-reconciliation-receipt/v1",
        receiptKind
      })));
      expect(registry.releaseReceipts.at(-1)).toMatchObject({
        schemaVersion: "sena-registry-reconciliation-receipt/v1",
        receiptKind: expectedKinds.at(-1)
      });
    };
    expect(designPlanSeedHead).toBe(
      governance.PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA
    );
    expect(
      protectedCurrentnessRepairItemForTest(designPlanSeedRegistry)
    ).not.toHaveProperty("protectedCurrentnessActivationRepairLifecycle");
    expect(
      protectedCurrentnessRepairItemForTest(currentRegistry)
    ).toHaveProperty("protectedCurrentnessActivationRepairLifecycle");
    expect(
      protectedCurrentnessRepairItemForTest(indexedRegistry)
    ).toHaveProperty("protectedCurrentnessActivationRepairLifecycle");
    expect(() => expectedReceiptKindsForLifecycleStatus(undefined)).toThrow(
      "unsupported protected currentness repair lifecycle status"
    );
    expect(() => expectedReceiptKindsForLifecycleStatus("future-status")).toThrow(
      "unsupported protected currentness repair lifecycle status"
    );
    expectPhaseAwareRepairReceipts(currentRegistry);
    expectPhaseAwareRepairReceipts(indexedRegistry);
    const initial = buildProtectedCurrentnessRepairInitialFixture(
      designPlanSeedRegistry,
      designPlanSeedHead,
      actualPrNumber
    );
    const final = buildProtectedCurrentnessRepairFinalFixture(initial);
    const initialLifecycle = protectedCurrentnessRepairItemForTest(
      initial.registry
    ).protectedCurrentnessActivationRepairLifecycle;
    const finalLifecycle = protectedCurrentnessRepairItemForTest(
      final.registry
    ).protectedCurrentnessActivationRepairLifecycle;
    expectPhaseAwareRepairReceipts(initial.registry);
    expectPhaseAwareRepairReceipts(final.registry);
    const fixturePrefixCount = initialLifecycle.designPlanSeedReceiptPrefix.count;
    expect(initial.registry.releaseReceipts).toHaveLength(fixturePrefixCount + 1);
    expect(final.registry.releaseReceipts).toHaveLength(fixturePrefixCount + 2);
    expect(final.registry.releaseReceipts.at(-1)).toMatchObject({
      schemaVersion: "sena-registry-reconciliation-receipt/v1",
      receiptKind: governance.PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
    });

    expect(initial.context.seedTreeSha).toBe(designPlanSeedTree);
    expect(initial.context.seedRegistryBlobSha).toBe(frozenSource.registryBlobSha);
    expect(initialLifecycle.designPlanSeedReceiptPrefix).toEqual({
      count: designPlanSeedRegistry.releaseReceipts.length,
      sha256: createHash("sha256")
        .update(JSON.stringify(designPlanSeedRegistry.releaseReceipts))
        .digest("hex")
    });
    expect(
      protectedCurrentnessRepairItemForTest(initial.registry)
        .protectedCurrentnessActivationRepairDesignLifecycle
    ).toEqual(currentItem.protectedCurrentnessActivationRepairDesignLifecycle);
    expect(
      protectedCurrentnessRepairItemForTest(final.registry)
        .protectedCurrentnessActivationRepairDesignLifecycle
    ).toEqual(currentItem.protectedCurrentnessActivationRepairDesignLifecycle);

    expect(
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        designPlanSeedRegistry,
        initial.registry,
        initial.context
      ).lifecycle.status
    ).toBe("protected-currentness-activation-repair-candidate-awaiting-initial-checks");
    expect(
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        initial.registry,
        final.registry,
        final.context
      ).lifecycle.status
    ).toBe("protected-currentness-activation-repair-ready-pending-final-head-checks");
    expect(governance.protectedCurrentnessRepairTrueBooleanPaths(initialLifecycle)).toEqual([
      "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks",
      "oneShot"
    ]);
    expect(governance.protectedCurrentnessRepairTrueBooleanPaths(finalLifecycle)).toEqual([
      "initialCandidateCompletionEvidence.annotationsEmpty",
      "initialCandidateCompletionEvidence.qualityReviewApproved",
      "initialCandidateCompletionEvidence.requiredChecksPassed",
      "initialCandidateCompletionEvidence.specReviewApproved",
      "oneShot",
      "repairReadyAndProtectedMergeAuthorizedAfterFinalChecks"
    ]);
    expect(
      governance.validateProtectedCurrentnessRepairInitialEvidenceStructure(
        finalLifecycle.initialCandidateCompletionEvidence
      )
    ).toBe(true);
    expect(
      governance.validateProtectedCurrentnessRepairInitialEvidenceAgainstContext(
        finalLifecycle.initialCandidateCompletionEvidence,
        final.context
      )
    ).toBe(true);
    const structurallyInvalidEvidence = structuredClone(
      finalLifecycle.initialCandidateCompletionEvidence
    );
    structurallyInvalidEvidence.repositorySecurityRunIds = [2, 2];
    expect(() =>
      governance.validateProtectedCurrentnessRepairInitialEvidenceStructure(
        structurallyInvalidEvidence
      )
    ).toThrow("rule=protected-currentness-repair-final-evidence-structure-invalid");
    expect(() =>
      governance.validateProtectedCurrentnessRepairLifecycleSnapshot(final.registry)
    ).toThrow("rule=protected-currentness-repair-snapshot-mode-required");
    expect(
      governance.protectedCurrentnessRepairTrueBooleanPaths(
        final.registry.releaseReceipts.at(-1)
      )
    ).toEqual([
      "annotationsEmpty",
      "authorizationBoundary.repairReadyAndProtectedMergeAuthorizedAfterFinalChecks",
      "qualityReviewApproved",
      "requiredChecksPassed",
      "specReviewApproved"
    ]);

    expect(governance.assertProtectedCurrentnessRepairIndexPaths(null, [])).toBe(true);
    expect(
      governance.assertProtectedCurrentnessRepairIndexPaths(initialLifecycle, [
        ...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST
      ])
    ).toBe(true);
    expect(
      governance.assertProtectedCurrentnessRepairIndexPaths(finalLifecycle, [
        "coordination/repo-governance/active-work.json"
      ])
    ).toBe(true);
    expect(() =>
      governance.assertProtectedCurrentnessRepairIndexPaths(initialLifecycle, [
        "coordination/repo-governance/active-work.json"
      ])
    ).toThrow("rule=protected-currentness-repair-index-path-set-mismatch");
    expect(() =>
      governance.assertProtectedCurrentnessRepairIndexPaths(initialLifecycle, [
        ...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST,
        "unrelated.txt"
      ])
    ).toThrow("rule=protected-currentness-repair-index-path-set-mismatch");
    const cleanIndexRoot = temporaryRoot("protected-currentness-clean-index");
    const cleanIndexEnvironment: Record<string, string> = {
      GIT_INDEX_FILE: join(cleanIndexRoot, "index"),
      GIT_OPTIONAL_LOCKS: "0",
      SENA_REPAIR_PR_NUMBER: String(actualPrNumber)
    };
    runGitWithEnvironment(
      projectRoot,
      ["--no-optional-locks", "read-tree", "HEAD"],
      cleanIndexEnvironment
    );
    expect(
      runGitWithEnvironment(
        projectRoot,
        ["--no-optional-locks", "diff", "--cached", "--name-only"],
        cleanIndexEnvironment
      )
    ).toBe("");
    const cleanIndexWritePolicy = runNode(
      governanceScript,
      ["write-policy", "--registry-from-index", "--staged"],
      { env: cleanIndexEnvironment }
    );
    expect(cleanIndexWritePolicy.status, cleanIndexWritePolicy.stderr).toBe(0);
    expect(cleanIndexWritePolicy.stdout).toContain("SENA_WRITE_POLICY pass staged=0");

    const expectInitialFailure = (mutate: (candidate: any) => void, rule?: string) => {
      const candidate = structuredClone(initial.registry);
      mutate(candidate);
      const assertion = expect(() =>
        governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
          designPlanSeedRegistry,
          candidate,
          initial.context
        )
      );
      return rule ? assertion.toThrow(rule) : assertion.toThrow();
    };
    const expectFinalFailure = (mutate: (candidate: any) => void, rule?: string) => {
      const candidate = structuredClone(final.registry);
      mutate(candidate);
      const assertion = expect(() =>
        governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
          initial.registry,
          candidate,
          final.context
        )
      );
      return rule ? assertion.toThrow(rule) : assertion.toThrow();
    };

    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        designPlanSeedRegistry,
        final.registry,
        final.context
      )
    ).toThrow("rule=protected-currentness-repair-transition-source-invalid");
    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        initial.registry,
        structuredClone(initial.registry),
        initial.context
      )
    ).toThrow("rule=protected-currentness-repair-transition-source-invalid");
    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        final.registry,
        structuredClone(final.registry),
        final.context
      )
    ).toThrow("rule=protected-currentness-repair-transition-replay");

    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.status = "arbitrary";
    }, "rule=protected-currentness-repair-status-invalid");
    expectInitialFailure((candidate) => candidate.releaseReceipts.pop());
    expectInitialFailure((candidate) =>
      candidate.releaseReceipts.push(structuredClone(candidate.releaseReceipts.at(-1)))
    );
    expectInitialFailure((candidate) => {
      const receipt = candidate.releaseReceipts.pop();
      candidate.releaseReceipts.splice(candidate.releaseReceipts.length - 1, 0, receipt);
    });
    expectInitialFailure((candidate) =>
      candidate.releaseReceipts.at(-1).scope.push("scope-expanded.txt")
    );
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.designPlanSeedReceiptPrefix.count += 1;
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.designPlanSeedReceiptPrefix.sha256 =
        "0".repeat(64);
    });
    expectInitialFailure((candidate) => {
      candidate.releaseReceipts[0].status = "historical-prefix-drift";
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).allowedPaths = [
        ...PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST
      ].reverse();
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).ownerKey = "wrong-owner";
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).disposition = "integrated";
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairDesignLifecycle.implementationAuthorizedNow = false;
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.unknownAction = true;
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).prNumber = actualPrNumber + 1;
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairBranchForTest(candidate).pr = actualPrNumber + 1;
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).headSha = "f".repeat(40);
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.designPlanSeedTreeSha = "f".repeat(40);
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.designPlanSeedRegistryBlobSha =
        "f".repeat(40);
    });
    expectInitialFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.requiredImplementationPaths[0] =
        "wrong-path";
    });
    expectInitialFailure((candidate) => {
      candidate.releaseReceipts.at(-1).receiptKind = "wrong-receipt";
    });

    for (const [label, mutate] of [
      ["cleanupAllowed:true", (lifecycle: any) => (lifecycle.cleanupAllowed = true)],
      ["cleanupAllowed:false", (lifecycle: any) => (lifecycle.cleanupAllowed = false)],
      ["canDelete:true", (lifecycle: any) => (lifecycle.canDelete = true)],
      ["mutationEnabled:true", (lifecycle: any) => (lifecycle.mutationEnabled = true)],
      [
        "future.branchRemovalAllowed:true",
        (lifecycle: any) => (lifecycle.future = { branchRemovalAllowed: true })
      ]
    ] as Array<[string, (lifecycle: any) => void]>) {
      expectInitialFailure((candidate) => {
        mutate(
          protectedCurrentnessRepairItemForTest(
            candidate
          ).protectedCurrentnessActivationRepairLifecycle
        );
      });
      expect(label.length).toBeGreaterThan(0);
    }
    expectInitialFailure((candidate) => {
      candidate.releaseReceipts.at(-1).authorizationBoundary.cleanup_allowed = true;
    });
    expectInitialFailure((candidate) => {
      candidate.releaseReceipts.at(-1).authorizationBoundary.cleanupAllowed = false;
    });

    expectFinalFailure((candidate) => candidate.releaseReceipts.pop());
    expectFinalFailure((candidate) =>
      candidate.releaseReceipts.push(structuredClone(candidate.releaseReceipts.at(-1)))
    );
    expectFinalFailure((candidate) => {
      const last = candidate.releaseReceipts.length - 1;
      [candidate.releaseReceipts[last - 1], candidate.releaseReceipts[last]] = [
        candidate.releaseReceipts[last],
        candidate.releaseReceipts[last - 1]
      ];
    });
    expectFinalFailure((candidate) =>
      candidate.releaseReceipts.at(-1).scope.push("scope-expanded.txt")
    );
    expectFinalFailure((candidate) => {
      candidate.releaseReceipts[0].status = "historical-prefix-drift";
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).allowedPaths.push("future-path");
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).ownerKey = "wrong-owner";
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).disposition = "integrated";
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairDesignLifecycle.implementationAuthorizedNow = false;
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.unknownAction = true;
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(candidate).prNumber = actualPrNumber + 1;
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairBranchForTest(candidate).headSha = "f".repeat(40);
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.initialCandidateCompletionEvidence.treeSha =
        "f".repeat(40);
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.initialCandidateCompletionEvidence.registryBlobSha =
        "f".repeat(40);
    });
    expectFinalFailure((candidate) => {
      candidate.releaseReceipts.at(-1).scope = ["wrong-path"];
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.initialCandidateCompletionEvidence.futureMutation =
        true;
    });
    expectFinalFailure((candidate) => {
      candidate.releaseReceipts.at(-1).extraBoundary = { canPush: true };
    });
    expectFinalFailure((candidate) => {
      candidate.releaseReceipts.at(-1).authorizationBoundary.cleanupAllowed = false;
    });
    expectFinalFailure((candidate) => {
      delete candidate.releaseReceipts.at(-1).governanceTestBlobSha;
    });
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.initialCandidateCompletionEvidence.repositorySecurityRunIds = [
        2,
        2
      ];
    }, "rule=protected-currentness-repair-final-evidence-invalid");
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.initialCandidateCompletionEvidence.checkJobIds = [
        4,
        5,
        5
      ];
    }, "rule=protected-currentness-repair-final-evidence-invalid");
    expectFinalFailure((candidate) => {
      protectedCurrentnessRepairItemForTest(
        candidate
      ).protectedCurrentnessActivationRepairLifecycle.initialCandidateCompletionEvidence.annotationsEmpty =
        false;
    }, "rule=protected-currentness-repair-final-action-set-invalid");
    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        initial.registry,
        final.registry,
        { ...final.context, verifierBlobSha: "f".repeat(40) }
      )
    ).toThrow("rule=protected-currentness-repair-final-evidence-context-mismatch");
  });

  it("rejects newly true authorization-like values in every normalized initial mutable container", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const seedHead = frozenSource.headSha;
    const seedRegistry = frozenSource.registry;
    const initial = buildProtectedCurrentnessRepairInitialFixture(
      seedRegistry,
      seedHead,
      82
    );
    const item = (registry: any, taskId: string) =>
      registry.workItems.find((entry: { taskId?: string }) => entry.taskId === taskId);
    const branch = (registry: any, name: string) =>
      registry.branches.find((entry: { name?: string }) => entry.name === name);
    const evidenceContainer = (record: any) => record.evidenceState;
    const closeoutContainer = (record: any) => {
      record.closeout = {
        observation: record.closeout
      };
      return record.closeout;
    };
    const normalizedContainers = [
      [
        "repair workItem aheadBehind",
        (registry: any) => item(
          registry,
          "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901"
        ).aheadBehind
      ],
      [
        "repair workItem evidenceState",
        (registry: any) => evidenceContainer(
          item(registry, "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901")
        )
      ],
      [
        "repair branch closeout",
        (registry: any) => closeoutContainer(
          branch(registry, "codex/sena-protected-currentness-activation-repair-20260901")
        )
      ],
      [
        "A01 workItem evidenceState",
        (registry: any) => evidenceContainer(
          item(registry, "SENA-A01-REPO-GOVERNANCE-20260827")
        )
      ],
      [
        "PR81 workItem evidenceState",
        (registry: any) => evidenceContainer(
          item(registry, "SENA-PR80-POST-MAIN-CLOSEOUT-20260901")
        )
      ],
      [
        "PR81 branch closeout",
        (registry: any) => closeoutContainer(
          branch(registry, "codex/sena-pr80-post-main-closeout-20260901")
        )
      ],
      [
        "PR46 workItem evidenceState",
        (registry: any) => evidenceContainer(
          item(registry, "SENA-BRANCH-RETIREMENT-20260829")
        )
      ],
      [
        "PR46 branch closeout",
        (registry: any) => closeoutContainer(
          branch(registry, "codex/sena-branch-retirement-20260829")
        )
      ],
      [
        "root workItem evidenceState",
        (registry: any) => evidenceContainer(
          item(registry, "SENA-A01-ROOT-CONTROL-PLANE-20260828")
        )
      ],
      [
        "root branch closeout",
        (registry: any) => closeoutContainer(branch(registry, "main"))
      ]
    ] as Array<[string, (registry: any) => any]>;
    const newlyTrueAttacks = [
      ["cleanup:true", (container: any) => (container.cleanup = true)],
      [
        "branchDeletion:true",
        (container: any) => (container.branchDeletion = true)
      ],
      [
        "worktreeRemoval:true",
        (container: any) => (container.worktreeRemoval = true)
      ],
      ["retirement:true", (container: any) => (container.retirement = true)],
      [
        "grantCleanup:true",
        (container: any) => (container.grantCleanup = true)
      ],
      ["mayDelete:true", (container: any) => (container.mayDelete = true)],
      [
        "authorization parent with currentness-like leaf",
        (container: any) => (container.unreviewedAuthorization = {
          remotePresent: true
        })
      ],
      [
        "nested unreviewed branch deletion authorization",
        (container: any) => (container.unreviewedAuthorization = {
          branchDeletionAuthorized: true
        })
      ],
      [
        "unknown arbitrary true",
        (container: any) => (container.unrecognizedFutureFlag = true)
      ],
      [
        "allowed leaf at wrong root path",
        (container: any) => (container.remotePresent = true)
      ],
      [
        "flat dotted key cannot match the nested initial allowlist",
        (container: any) => (
          container["unreviewedCurrentness.remotePresent"] = true
        )
      ],
      [
        "allowed leaf under wrong parent",
        (container: any) => (container.otherCurrentness = {
          remotePresent: true
        })
      ],
      [
        "allowed leaf at wrong depth",
        (container: any) => (container.unreviewedCurrentness = {
          nested: { remotePresent: true }
        })
      ]
    ] as Array<[string, (container: any) => void]>;

    for (const [containerLabel, selectContainer] of normalizedContainers) {
      for (const [attackLabel, attack] of newlyTrueAttacks) {
        const candidate = structuredClone(initial.registry);
        attack(selectContainer(candidate));
        let failure: unknown;
        try {
          governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
            seedRegistry,
            candidate,
            initial.context
          );
        } catch (error) {
          failure = error;
        }
        expect.soft(
          (failure as Error | undefined)?.message,
          `${containerLabel}: ${attackLabel}`
        ).toBe(
          "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
        );
      }
      if (containerLabel !== "repair workItem evidenceState") {
        const wrongContainer = structuredClone(initial.registry);
        selectContainer(wrongContainer).unreviewedCurrentness = {
          remotePresent: true
        };
        expect.soft(
          () => governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
            seedRegistry,
            wrongContainer,
            initial.context
          ),
          `${containerLabel}: exact path in wrong container`
        ).toThrow(
          "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
        );
      }
    }

    const currentnessOnly = structuredClone(initial.registry);
    protectedCurrentnessRepairItemForTest(
      currentnessOnly
    ).evidenceState.unreviewedCurrentness = {
      remotePresent: true,
      checksPassed: true
    };
    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        seedRegistry,
        currentnessOnly,
        initial.context
      )
    ).not.toThrow();
  });

  it("rejects newly true authorization-like values in every normalized final mutable container", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const seedHead = frozenSource.headSha;
    const seedRegistry = frozenSource.registry;
    const initial = buildProtectedCurrentnessRepairInitialFixture(
      seedRegistry,
      seedHead,
      82
    );
    const final = buildProtectedCurrentnessRepairFinalFixture(initial);
    const normalizedContainers = [
      [
        "repair workItem aheadBehind",
        (registry: any) => {
          return protectedCurrentnessRepairItemForTest(registry).aheadBehind;
        }
      ],
      [
        "repair workItem evidenceState",
        (registry: any) => {
          return protectedCurrentnessRepairItemForTest(registry).evidenceState;
        }
      ],
      [
        "repair branch closeout",
        (registry: any) => {
          const repairBranch = protectedCurrentnessRepairBranchForTest(registry);
          repairBranch.closeout = {
            observation: repairBranch.closeout
          };
          return repairBranch.closeout;
        }
      ]
    ] as Array<[string, (registry: any) => any]>;
    const newlyTrueAttacks = [
      ["cleanup:true", (container: any) => (container.cleanup = true)],
      [
        "branchDeletion:true",
        (container: any) => (container.branchDeletion = true)
      ],
      [
        "worktreeRemoval:true",
        (container: any) => (container.worktreeRemoval = true)
      ],
      ["retirement:true", (container: any) => (container.retirement = true)],
      [
        "grantCleanup:true",
        (container: any) => (container.grantCleanup = true)
      ],
      ["mayDelete:true", (container: any) => (container.mayDelete = true)],
      [
        "authorization parent with currentness-like leaf",
        (container: any) => (container.unreviewedAuthorization = {
          requiredChecksPassed: true
        })
      ],
      [
        "nested unreviewed branch deletion authorization",
        (container: any) => (container.unreviewedAuthorization = {
          branchDeletionAuthorized: true
        })
      ],
      [
        "unknown arbitrary true",
        (container: any) => (container.unrecognizedFutureFlag = true)
      ],
      [
        "allowed leaf at wrong root path",
        (container: any) => (container.requiredChecksPassed = true)
      ],
      [
        "flat dotted key cannot match the nested final allowlist",
        (container: any) => (
          container["unreviewedCurrentness.requiredChecksPassed"] = true
        )
      ],
      [
        "allowed leaf under wrong parent",
        (container: any) => (container.otherCurrentness = {
          requiredChecksPassed: true
        })
      ],
      [
        "allowed leaf at wrong depth",
        (container: any) => (container.unreviewedCurrentness = {
          nested: { requiredChecksPassed: true }
        })
      ]
    ] as Array<[string, (container: any) => void]>;

    for (const [containerLabel, selectContainer] of normalizedContainers) {
      for (const [attackLabel, attack] of newlyTrueAttacks) {
        const candidate = structuredClone(final.registry);
        attack(selectContainer(candidate));
        let failure: unknown;
        try {
          governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
            initial.registry,
            candidate,
            final.context
          );
        } catch (error) {
          failure = error;
        }
        expect.soft(
          (failure as Error | undefined)?.message,
          `${containerLabel}: ${attackLabel}`
        ).toBe(
          "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
        );
      }
      if (containerLabel !== "repair workItem evidenceState") {
        const wrongContainer = structuredClone(final.registry);
        selectContainer(wrongContainer).unreviewedCurrentness = {
          requiredChecksPassed: true,
          annotationsEmpty: true
        };
        expect.soft(
          () => governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
            initial.registry,
            wrongContainer,
            final.context
          ),
          `${containerLabel}: exact paths in wrong container`
        ).toThrow(
          "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
        );
      }
    }

    const currentnessOnly = structuredClone(final.registry);
    protectedCurrentnessRepairItemForTest(
      currentnessOnly
    ).evidenceState.unreviewedCurrentness = {
      requiredChecksPassed: true,
      annotationsEmpty: true
    };
    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        initial.registry,
        currentnessOnly,
        final.context
      )
    ).not.toThrow();

    const sourceWithExistingTrue = structuredClone(initial.registry);
    const candidateWithExistingTrue = structuredClone(final.registry);
    for (const registry of [sourceWithExistingTrue, candidateWithExistingTrue]) {
      protectedCurrentnessRepairItemForTest(
        registry
      ).evidenceState.preexistingObservation = {
        branchDeletion: true
      };
    }
    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        sourceWithExistingTrue,
        candidateWithExistingTrue,
        final.context
      )
    ).not.toThrow();

    const movedPathCandidate = structuredClone(final.registry);
    protectedCurrentnessRepairItemForTest(
      movedPathCandidate
    ).evidenceState.renamedObservation = {
      branchDeletion: true
    };
    expect(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        sourceWithExistingTrue,
        movedPathCandidate,
        final.context
      )
    ).toThrow(
      "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
    );

    const setTrueAtSegments = (container: any, segments: string[]) => {
      let cursor = container;
      for (const segment of segments.slice(0, -1)) {
        cursor[segment] = {};
        cursor = cursor[segment];
      }
      cursor[segments.at(-1)!] = true;
    };
    const structurallyDistinctPathPairs = [
      ["dot", ["segment.with.dot", "leaf"], ["segment.with.dot.leaf"]],
      ["slash", ["segment/with/slash", "leaf"], ["segment/with/slash.leaf"]],
      ["tilde", ["segment~with~tilde", "leaf"], ["segment~with~tilde.leaf"]],
      [
        "JSON encoding characters",
        ["segment\\with\"quote[],", "leaf"],
        ["segment\\with\"quote[],.leaf"]
      ]
    ] as Array<[string, string[], string[]]>;
    for (const [label, nestedSegments, flatSegments] of structurallyDistinctPathPairs) {
      const nestedSource = structuredClone(initial.registry);
      const flatCandidate = structuredClone(final.registry);
      setTrueAtSegments(
        protectedCurrentnessRepairItemForTest(nestedSource).evidenceState,
        nestedSegments
      );
      setTrueAtSegments(
        protectedCurrentnessRepairItemForTest(flatCandidate).evidenceState,
        flatSegments
      );
      expect.soft(
        () => governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
          nestedSource,
          flatCandidate,
          final.context
        ),
        `${label}: nested source to flat candidate`
      ).toThrow(
        "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
      );

      const flatSource = structuredClone(initial.registry);
      const nestedCandidate = structuredClone(final.registry);
      setTrueAtSegments(
        protectedCurrentnessRepairItemForTest(flatSource).evidenceState,
        flatSegments
      );
      setTrueAtSegments(
        protectedCurrentnessRepairItemForTest(nestedCandidate).evidenceState,
        nestedSegments
      );
      expect.soft(
        () => governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
          flatSource,
          nestedCandidate,
          final.context
        ),
        `${label}: flat source to nested candidate`
      ).toThrow(
        "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
      );
    }
  });

  it("requires exact own keys on every workItem aheadBehind record", () => {
    const fixtureRoot = temporaryRoot("ahead-behind-exact-own-keys");
    const registryPath = join(fixtureRoot, "active-work.json");
    const registry = JSON.parse(
      readFileSync(
        join(projectRoot, "coordination", "repo-governance", "active-work.json"),
        "utf8"
      )
    );
    protectedCurrentnessRepairItemForTest(
      registry
    ).aheadBehind.unreviewedObservation = false;
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = runNode(governanceScript, [
      "registry",
      "--registry",
      registryPath
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "has invalid aheadBehind values"
    );
  });

  it("rejects drift from the immutable protected currentness repair seed", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const frozenSeedHead = frozenSource.headSha;
    const frozenSeedRegistry = frozenSource.registry;
    const actualPrNumber = protectedCurrentnessRepairItemForTest(
      frozenSeedRegistry
    ).prNumber;

    const receiptDriftSource = structuredClone(frozenSeedRegistry);
    receiptDriftSource.releaseReceipts.push({
      schemaVersion: "sena-registry-reconciliation-receipt/v1",
      receiptKind: "unrelated-source-and-candidate-prefix-drift",
      taskId: "UNRELATED",
      ownerKey: "unrelated",
      scope: [],
      authorizationBoundary: {}
    });
    const receiptDriftCandidate = buildProtectedCurrentnessRepairInitialFixture(
      receiptDriftSource,
      frozenSeedHead,
      actualPrNumber
    );
    expect.soft(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        receiptDriftSource,
        receiptDriftCandidate.registry,
        receiptDriftCandidate.context
      )
    ).toThrow("rule=protected-currentness-repair-frozen-source-receipt-prefix-invalid");

    const mutableDriftSource = structuredClone(frozenSeedRegistry);
    protectedCurrentnessRepairItemForTest(mutableDriftSource).lastObservedAt =
      "2026-09-01T08:10:00Z";
    protectedCurrentnessRepairItemForTest(mutableDriftSource).evidenceState = {
      ...protectedCurrentnessRepairItemForTest(mutableDriftSource).evidenceState,
      local: "source-and-candidate-mutated-together"
    };
    const mutableDriftCandidate = buildProtectedCurrentnessRepairInitialFixture(
      mutableDriftSource,
      frozenSeedHead,
      actualPrNumber
    );
    expect.soft(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        mutableDriftSource,
        mutableDriftCandidate.registry,
        mutableDriftCandidate.context
      )
    ).toThrow("rule=protected-currentness-repair-frozen-source-canonical-registry-invalid");

    const identityDriftSource = structuredClone(frozenSeedRegistry);
    const identityDriftCandidate = buildProtectedCurrentnessRepairInitialFixture(
      identityDriftSource,
      frozenSeedHead,
      actualPrNumber
    );
    const otherHeadSha = "1".repeat(40);
    const otherTreeSha = "2".repeat(40);
    const otherRegistryBlobSha = "3".repeat(40);
    for (const registry of [identityDriftSource, identityDriftCandidate.registry]) {
      protectedCurrentnessRepairItemForTest(registry).headSha = otherHeadSha;
      const branch = protectedCurrentnessRepairBranchForTest(registry);
      branch.headSha = otherHeadSha;
      branch.remoteHeadSha = otherHeadSha;
      branch.prHeadSha = otherHeadSha;
    }
    const identityDriftLifecycle = protectedCurrentnessRepairItemForTest(
      identityDriftCandidate.registry
    ).protectedCurrentnessActivationRepairLifecycle;
    identityDriftLifecycle.designPlanSeedHeadSha = otherHeadSha;
    identityDriftLifecycle.designPlanSeedTreeSha = otherTreeSha;
    identityDriftLifecycle.designPlanSeedRegistryBlobSha = otherRegistryBlobSha;
    const identityDriftContext = {
      ...identityDriftCandidate.context,
      seedHeadSha: otherHeadSha,
      seedTreeSha: otherTreeSha,
      seedRegistryBlobSha: otherRegistryBlobSha
    };
    expect.soft(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        identityDriftSource,
        identityDriftCandidate.registry,
        identityDriftContext
      )
    ).toThrow("rule=protected-currentness-repair-frozen-source-context-invalid");
  });

  it("rejects coordinated protected repair PR and custody identity drift", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const frozenSeedHead = frozenSource.headSha;
    const frozenSeedRegistry = frozenSource.registry;
    const actualPrNumber = protectedCurrentnessRepairItemForTest(
      frozenSeedRegistry
    ).prNumber;

    const prDrift = buildProtectedCurrentnessRepairInitialFixture(
      frozenSeedRegistry,
      frozenSeedHead,
      actualPrNumber
    );
    const prDriftItem = protectedCurrentnessRepairItemForTest(prDrift.registry);
    const prDriftBranch = protectedCurrentnessRepairBranchForTest(prDrift.registry);
    const coordinatedPrNumber = 83;
    prDriftItem.prNumber = coordinatedPrNumber;
    prDriftItem.plannedPullRequestNumber = coordinatedPrNumber;
    prDriftBranch.pr = coordinatedPrNumber;
    prDriftBranch.plannedPullRequestNumber = coordinatedPrNumber;
    prDriftItem.protectedCurrentnessActivationRepairLifecycle.pullRequestNumber =
      coordinatedPrNumber;
    prDrift.context.pullRequestNumber = coordinatedPrNumber;
    prDrift.registry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    ).finalBaseHandshakeAuthorization.protectedActivationBinding
      .requiredActivationPullRequestNumber = coordinatedPrNumber;
    expect.soft(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        frozenSeedRegistry,
        prDrift.registry,
        prDrift.context
      )
    ).toThrow("rule=protected-currentness-repair-frozen-pr-identity-invalid");

    const coordinatedCustodyDrift = buildProtectedCurrentnessRepairInitialFixture(
      frozenSeedRegistry,
      frozenSeedHead,
      actualPrNumber
    );
    const custodyItem = protectedCurrentnessRepairItemForTest(
      coordinatedCustodyDrift.registry
    );
    const custodyBranch = protectedCurrentnessRepairBranchForTest(
      coordinatedCustodyDrift.registry
    );
    custodyItem.noPrReason = "positive PR must not carry a no-PR reason";
    custodyBranch.upstream = "origin/main";
    custodyBranch.upstreamState = "base-only";
    custodyBranch.upstreamCacheState = "absent";
    custodyBranch.noPrReason = "positive PR must not carry a no-PR reason";
    expect.soft(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        frozenSeedRegistry,
        coordinatedCustodyDrift.registry,
        coordinatedCustodyDrift.context
      )
    ).toThrow("rule=protected-currentness-repair-custody-identity-invalid");

    const baseOnlyDrift = buildProtectedCurrentnessRepairInitialFixture(
      frozenSeedRegistry,
      frozenSeedHead,
      actualPrNumber
    );
    protectedCurrentnessRepairBranchForTest(baseOnlyDrift.registry).upstream = "origin/main";
    expect.soft(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        frozenSeedRegistry,
        baseOnlyDrift.registry,
        baseOnlyDrift.context
      )
    ).toThrow("rule=protected-currentness-repair-custody-identity-invalid");

    const positivePrWithNoReason = buildProtectedCurrentnessRepairInitialFixture(
      frozenSeedRegistry,
      frozenSeedHead,
      actualPrNumber
    );
    protectedCurrentnessRepairItemForTest(positivePrWithNoReason.registry).noPrReason =
      "not allowed with PR82";
    protectedCurrentnessRepairBranchForTest(positivePrWithNoReason.registry).noPrReason =
      "not allowed with PR82";
    expect.soft(() =>
      governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
        frozenSeedRegistry,
        positivePrWithNoReason.registry,
        positivePrWithNoReason.context
      )
    ).toThrow("rule=protected-currentness-repair-custody-identity-invalid");
  });

  it("enforces protected repair source-to-index wiring through a temporary index", () => {
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const frozenSeedHead = frozenSource.headSha;
    const frozenSeedRegistry = frozenSource.registry;
    const actualPrNumber = protectedCurrentnessRepairItemForTest(
      frozenSeedRegistry
    ).prNumber;
    const initial = buildProtectedCurrentnessRepairInitialFixture(
      frozenSeedRegistry,
      frozenSeedHead,
      actualPrNumber
    );
    const realIndexPath = runGit(projectRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "index"
    ]);
    const realIndexSha256Before = sha256File(realIndexPath);
    const realCachedPathsBefore = runGit(projectRoot, [
      "--no-optional-locks",
      "diff",
      "--cached",
      "--name-only"
    ]);
    const gitCommonDir = runGit(projectRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir"
    ]);
    const realObjectDirectory = join(gitCommonDir, "objects");
    const candidateBytes = `${JSON.stringify(initial.registry, null, 2)}\n`;

    const runTemporaryIndexGit = (
      args: string[],
      env: NodeJS.ProcessEnv,
      input?: string | Buffer
    ) => {
      const result = spawnSync("git", args, {
        cwd: projectRoot,
        encoding: "utf8",
        env,
        input,
        maxBuffer: 16 * 1024 * 1024
      });
      if (result.status !== 0) {
        throw new Error(`temporary-index git ${args.join(" ")} failed: ${result.stderr}`);
      }
      return result.stdout.trim();
    };
    const buildTemporaryIndex = (label: string, stagedPaths: string[]) => {
      const root = temporaryRoot(label);
      const temporaryIndexPath = join(root, "index");
      const temporaryObjectDirectory = join(root, "objects");
      mkdirSync(temporaryObjectDirectory, { recursive: true });
      const env = {
        ...process.env,
        GIT_INDEX_FILE: temporaryIndexPath,
        GIT_OBJECT_DIRECTORY: temporaryObjectDirectory,
        GIT_ALTERNATE_OBJECT_DIRECTORIES: realObjectDirectory,
        GIT_OPTIONAL_LOCKS: "0",
        SENA_REPAIR_PR_NUMBER: String(actualPrNumber)
      };
      runTemporaryIndexGit(
        ["--no-optional-locks", "read-tree", frozenSeedHead],
        env
      );
      expect(
        runTemporaryIndexGit(
          ["--no-optional-locks", "diff", "--cached", "--name-only"],
          env
        )
      ).toBe("");
      for (const path of stagedPaths) {
        const mode = runTemporaryIndexGit(
          ["--no-optional-locks", "ls-files", "-s", path],
          env
        ).split(/\s+/, 1)[0];
        const bytes = path === "coordination/repo-governance/active-work.json"
          ? candidateBytes
          : path === "CONTEXT.md"
            ? `${readFileSync(join(projectRoot, path), "utf8")}\ntemporary-index-only\n`
            : readFileSync(join(projectRoot, path));
        const blob = runTemporaryIndexGit(
          ["--no-optional-locks", "hash-object", "-w", "--stdin"],
          env,
          bytes
        );
        runTemporaryIndexGit(
          [
            "--no-optional-locks",
            "update-index",
            "--add",
            "--cacheinfo",
            `${mode},${blob},${path}`
          ],
          env
        );
      }
      return env;
    };

    const exactEnvironment = buildTemporaryIndex(
      "protected-currentness-exact-index",
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST
    );
    const exact = runNode(
      governanceScript,
      ["write-policy", "--registry-from-index", "--staged"],
      { env: exactEnvironment }
    );
    expect(exact.status, exact.stderr).toBe(0);
    expect(exact.stdout).toContain("SENA_WRITE_POLICY pass staged=3");

    const partialEnvironment = buildTemporaryIndex("protected-currentness-partial-index", [
      "coordination/repo-governance/active-work.json"
    ]);
    const partial = runNode(
      governanceScript,
      ["write-policy", "--registry-from-index", "--staged"],
      { env: partialEnvironment }
    );
    expect(partial.status).toBe(1);
    expect(partial.stderr).toContain(
      "rule=protected-currentness-repair-index-path-set-mismatch"
    );

    const unrelatedEnvironment = buildTemporaryIndex(
      "protected-currentness-unrelated-index",
      [...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST, "CONTEXT.md"]
    );
    const unrelated = runNode(
      governanceScript,
      ["write-policy", "--registry-from-index", "--staged"],
      { env: unrelatedEnvironment }
    );
    expect(unrelated.status).toBe(1);
    expect(unrelated.stderr).toContain(
      "rule=protected-currentness-repair-index-path-set-mismatch"
    );

    expect(sha256File(realIndexPath)).toBe(realIndexSha256Before);
    expect(
      runGit(projectRoot, [
        "--no-optional-locks",
        "diff",
        "--cached",
        "--name-only"
      ])
    ).toBe(realCachedPathsBefore);
  });

  it("reaches context-bound final repair validation through a temporary index", () => {
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const frozenSeedHead = frozenSource.headSha;
    const frozenSeedRegistry = frozenSource.registry;
    const actualPrNumber = protectedCurrentnessRepairItemForTest(
      frozenSeedRegistry
    ).prNumber;
    const initial = buildProtectedCurrentnessRepairInitialFixture(
      frozenSeedRegistry,
      frozenSeedHead,
      actualPrNumber
    );
    const final = buildProtectedCurrentnessRepairFinalFixture(initial);
    const tempRepo = temporaryRoot("protected-currentness-final-source");
    const registryPath = join(
      tempRepo,
      "coordination",
      "repo-governance",
      "active-work.json"
    );
    mkdirSync(dirname(registryPath), { recursive: true });

    for (const registry of [initial.registry, final.registry]) {
      registry.repo = tempRepo;
      registry.policy.hookCustodyPath = join(tempRepo, ".githooks");
      for (const item of registry.workItems) {
        item.repo = tempRepo;
        item.worktreePath = tempRepo;
        item.cwd = tempRepo;
      }
    }

    runGit(tempRepo, ["init", "-q"]);
    runGit(tempRepo, ["config", "user.name", "SENA final transition test"]);
    runGit(tempRepo, ["config", "user.email", "sena-final@example.invalid"]);
    runGit(tempRepo, ["branch", "-M", PROTECTED_CURRENTNESS_REPAIR_BRANCH_FOR_TEST]);
    writeFileSync(registryPath, `${JSON.stringify(initial.registry, null, 2)}\n`);
    runGit(tempRepo, ["add", "coordination/repo-governance/active-work.json"]);
    runGit(tempRepo, ["commit", "-q", "-m", "legal initial lifecycle source"]);

    const sourceHead = runGit(tempRepo, ["rev-parse", "HEAD"]);
    const sourceIndexPath = runGit(tempRepo, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "index"
    ]);
    const temporaryIndexRoot = temporaryRoot("protected-currentness-final-index");
    const temporaryIndexPath = join(temporaryIndexRoot, "index");
    const temporaryObjectDirectory = join(temporaryIndexRoot, "objects");
    mkdirSync(temporaryObjectDirectory, { recursive: true });
    copyFileSync(sourceIndexPath, temporaryIndexPath);
    const tempRepoObjectDirectory = join(
      runGit(tempRepo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
      "objects"
    );
    const finalBytes = `${JSON.stringify(final.registry, null, 2)}\n`;
    const tempIndexEnvironment = {
      ...process.env,
      GIT_INDEX_FILE: temporaryIndexPath,
      GIT_OBJECT_DIRECTORY: temporaryObjectDirectory,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: tempRepoObjectDirectory,
      GIT_OPTIONAL_LOCKS: "0",
      SENA_GOVERNANCE_TARGET_ROOT: tempRepo,
      SENA_REPAIR_PR_NUMBER: String(actualPrNumber),
      SENA_REPAIR_INITIAL_HEAD: final.context.headSha,
      SENA_REPAIR_INITIAL_TREE: final.context.treeSha,
      SENA_REPAIR_INITIAL_REGISTRY_BLOB: final.context.registryBlobSha,
      SENA_REPAIR_INITIAL_VERIFIER_BLOB: final.context.verifierBlobSha,
      SENA_REPAIR_INITIAL_TEST_BLOB: final.context.governanceTestBlobSha,
      SENA_REPAIR_INITIAL_BUILD_RUN_ID: String(final.context.buildRunId),
      SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS:
        final.context.repositorySecurityRunIds.join(","),
      SENA_REPAIR_INITIAL_CHECK_JOB_IDS: final.context.checkJobIds.join(","),
      SENA_REPAIR_INITIAL_REQUIRED_CHECKS_PASSED: "true",
      SENA_REPAIR_INITIAL_ANNOTATIONS_EMPTY: "true",
      SENA_REPAIR_INITIAL_SPEC_REVIEW_APPROVED: "true",
      SENA_REPAIR_INITIAL_QUALITY_REVIEW_APPROVED: "true"
    };
    const hashResult = spawnSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: tempRepo,
      encoding: "utf8",
      env: tempIndexEnvironment,
      input: finalBytes
    });
    expect(hashResult.status, hashResult.stderr).toBe(0);
    const finalRegistryBlob = hashResult.stdout.trim();
    const updateResult = spawnSync(
      "git",
      [
        "update-index",
        "--add",
        "--cacheinfo",
        `100644,${finalRegistryBlob},coordination/repo-governance/active-work.json`
      ],
      { cwd: tempRepo, encoding: "utf8", env: tempIndexEnvironment }
    );
    expect(updateResult.status, updateResult.stderr).toBe(0);

    const realIndexPath = runGit(projectRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "index"
    ]);
    const realIndexSha256Before = sha256File(realIndexPath);
    const realCachedPathsBefore = runGit(projectRoot, [
      "--no-optional-locks",
      "diff",
      "--cached",
      "--name-only"
    ]);
    const realRefsBefore = runGit(projectRoot, [
      "for-each-ref",
      "--format=%(refname) %(objectname)"
    ]);
    const realObjectCountBefore = runGit(projectRoot, ["count-objects", "-v"]);

    const exact = runNode(
      governanceScript,
      ["write-policy", "--registry-from-index", "--staged"],
      { cwd: tempRepo, env: tempIndexEnvironment }
    );
    expect(exact.status, exact.stderr).toBe(0);
    expect(exact.stdout).toContain("SENA_WRITE_POLICY pass staged=1");

    const mismatched = runNode(
      governanceScript,
      ["write-policy", "--registry-from-index", "--staged"],
      {
        cwd: tempRepo,
        env: {
          ...tempIndexEnvironment,
          SENA_REPAIR_INITIAL_BUILD_RUN_ID: String(final.context.buildRunId + 1)
        }
      }
    );
    expect(mismatched.status).toBe(1);
    expect(mismatched.stderr).toContain(
      "rule=protected-currentness-repair-final-evidence-context-mismatch"
    );

    const missing = runNode(
      governanceScript,
      ["write-policy", "--registry-from-index", "--staged"],
      {
        cwd: tempRepo,
        env: { ...tempIndexEnvironment, SENA_REPAIR_INITIAL_HEAD: "" }
      }
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain(
      "rule=protected-currentness-repair-final-evidence-context-missing"
    );

    expect(runGit(tempRepo, ["rev-parse", "HEAD"])).toBe(sourceHead);
    expect(sha256File(realIndexPath)).toBe(realIndexSha256Before);
    expect(
      runGit(projectRoot, [
        "--no-optional-locks",
        "diff",
        "--cached",
        "--name-only"
      ])
    ).toBe(realCachedPathsBefore);
    expect(
      runGit(projectRoot, ["for-each-ref", "--format=%(refname) %(objectname)"])
    ).toBe(realRefsBefore);
    expect(runGit(projectRoot, ["count-objects", "-v"])).toBe(realObjectCountBefore);
  });
});

const PROTECTED_ACTIVATION_BINDING_KEYS_FOR_TEST = [
  "mode",
  "requiredReceiptKind",
  "requiredFinalAuthorizationReceiptKind",
  "requiredAuthorizationStatus",
  "requiredActivationLifecycleStatus",
  "requiredActivationPullRequestNumber",
  "mustDescendFromAuthorizationSourceMainSha",
  "mustEqualFetchedOriginMain",
  "postMainBuildRequired",
  "postMainSecurityRequired",
  "postMainAnnotationsMustBeEmpty",
  "commitBoundLiveAuditRequired"
];

const PROTECTED_ACTIVATION_EVIDENCE_KEYS_FOR_TEST = [
  "pullRequestNumber",
  "finalHeadSha",
  "protectedSourceMainSha",
  "protectedMergeCommitSha",
  "protectedMergeTreeSha",
  "protectedRegistryBlobSha",
  "fetchedOriginMainSha",
  "orderedParentShas",
  "finalHeadTreeSha",
  "finalHeadRegistryBlobSha",
  "postMainBuild",
  "postMainRepositorySecurity",
  "commitBoundLiveAudits",
  "requiredChecksPassed",
  "annotationsEmpty"
];

const PR46_REPAIR_PROTECTED_ONLY_PATHS_FOR_TEST = [
  "coordination/repo-governance/pr46-final-ready-repair-design.md",
  "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md"
];

const PR46_REPAIR_REQUIRED_EXECUTION_FOR_TEST = [
  "verify-the-owner-reviewed-repair-design-and-plan-seed-at-exact-protected-source-969a206",
  "push-only-the-named-repair-branch-and-create-one-draft-pr-to-read-back-its-actual-number",
  "write-and-observe-red-tests-before-each-currentness-chain-lifecycle-or-activation-production-change",
  "commit-and-push-the-exact-three-path-initial-repair-candidate-after-full-local-gates-and-immutable-reviews",
  "verify-initial-repair-head-build-both-security-checks-and-zero-annotation-readback",
  "commit-and-push-one-registry-only-final-repair-authorization",
  "verify-final-repair-head-build-both-security-checks-zero-annotations-and-fresh-reviews",
  "mark-the-repair-pr-ready-and-use-an-ordinary-protected-merge-with-exact-head-lease-and-no-admin-bypass",
  "verify-repair-post-main-build-security-zero-annotations-and-commit-bound-live-audit-before-and-after-root-fast-forward",
  "revalidate-pr46-exact-e24c635-head-three-conflicts-empty-candidate-only-and-four-path-protected-only-set",
  "only-after-those-gates-allow-pr46-to-consume-the-protected-binding-without-changing-its-core",
  "stop-before-pr46-mutation-local-ref-retirement-branch-worktree-orphan-remote-target-provider-deployment-or-history-mutation"
];

const PR46_REPAIR_REQUIRED_RED_GREEN_APPEND_FOR_TEST = [
  "integrated-monotonic-behind-must-never-imply-cleanup-or-deletion-authority",
  "root-protected-advance-chain-must-reject-parent-tree-registry-path-pr-or-receipt-drift",
  "pr46-activation-evidence-must-match-the-protected-repair-pr-number"
];

async function createProtectedActivationCompletionFixture(label: string) {
  const root = temporaryRoot(label);
  const script = join(root, "scripts", "verify-sena-repo-governance.mjs");
  const registryPath = join(root, "coordination", "repo-governance", "active-work.json");
  mkdirSync(dirname(script), { recursive: true });
  mkdirSync(dirname(registryPath), { recursive: true });
  copyFileSync(governanceScript, script);
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.name", "SENA activation completion test"]);
  runGit(root, ["config", "user.email", "sena-activation@example.invalid"]);
  runGit(root, ["branch", "-M", "main"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/HUDongpin/SENA.git"]);

  writeFileSync(registryPath, `${JSON.stringify({ stage: "protected-source" }, null, 2)}\n`);
  runGit(root, ["add", "coordination/repo-governance/active-work.json"]);
  runGit(root, ["commit", "-q", "-m", "protected source"]);
  const protectedSourceMainSha = runGit(root, ["rev-parse", "HEAD"]);

  writeFileSync(
    registryPath,
    `${JSON.stringify({
      stage: "repair-final-head",
      workItems: [
        {
          taskId: "SENA-A01-ROOT-CONTROL-PLANE-20260828",
          headSha: protectedSourceMainSha
        }
      ]
    }, null, 2)}\n`
  );
  runGit(root, ["add", "coordination/repo-governance/active-work.json"]);
  runGit(root, ["commit", "-q", "-m", "repair final head"]);
  const finalHeadSha = runGit(root, ["rev-parse", "HEAD"]);
  const finalHeadTreeSha = runGit(root, ["rev-parse", `${finalHeadSha}^{tree}`]);
  const finalHeadRegistryBlobSha = runGit(root, [
    "rev-parse",
    `${finalHeadSha}:coordination/repo-governance/active-work.json`
  ]);
  const protectedMergeCommitSha = runGit(root, [
    "commit-tree",
    finalHeadTreeSha,
    "-p",
    protectedSourceMainSha,
    "-p",
    finalHeadSha,
    "-m",
    "protected repair merge"
  ]);
  runGit(root, ["update-ref", "refs/remotes/origin/main", protectedMergeCommitSha]);

  const workflow = (
    workflowName: "build-gate" | "repo-security-gate",
    runId: number,
    jobId: number
  ) => ({
    workflowName,
    event: "push",
    runId,
    jobId,
    headSha: protectedMergeCommitSha,
    status: "completed",
    conclusion: "success",
    annotationCount: 0
  });
  const readback = {
    pullRequestNumber: 82,
    finalHeadSha,
    protectedSourceMainSha,
    protectedMergeCommitSha,
    protectedMergeTreeSha: finalHeadTreeSha,
    protectedRegistryBlobSha: finalHeadRegistryBlobSha,
    fetchedOriginMainSha: protectedMergeCommitSha,
    orderedParentShas: [protectedSourceMainSha, finalHeadSha],
    finalHeadTreeSha,
    finalHeadRegistryBlobSha,
    postMainBuild: workflow("build-gate", 101, 102),
    postMainRepositorySecurity: workflow("repo-security-gate", 103, 104),
    commitBoundLiveAudits: {
      beforeRootFastForward: {
        schemaVersion: "sena-repo-governance-audit/v1",
        phase: "before-root-fast-forward",
        authorizationRegistryCommitSha: protectedMergeCommitSha,
        auditedRegistryBlobSha: finalHeadRegistryBlobSha,
        checkoutHeadSha: protectedSourceMainSha,
        status: "pass",
        errors: [],
        ownerBlockers: [],
        unreachableCommitCount: 0
      },
      afterRootFastForward: {
        schemaVersion: "sena-repo-governance-audit/v1",
        phase: "after-root-fast-forward",
        authorizationRegistryCommitSha: protectedMergeCommitSha,
        auditedRegistryBlobSha: finalHeadRegistryBlobSha,
        checkoutHeadSha: protectedMergeCommitSha,
        status: "pass",
        errors: [],
        ownerBlockers: [],
        unreachableCommitCount: 0
      }
    }
  };
  const binding = {
    authorizationSourceMainSha: protectedSourceMainSha,
    protectedActivationBinding: {
      mode: "loaded-fetched-origin-main-authorization-registry-commit",
      requiredReceiptKind: "pr82-protected-currentness-activation-repair-candidate",
      requiredFinalAuthorizationReceiptKind:
        "pr82-protected-currentness-activation-repair-final-authorization",
      requiredAuthorizationStatus: "pending-protected-activation",
      requiredActivationLifecycleStatus:
        "protected-currentness-activation-repair-ready-pending-final-head-checks",
      requiredActivationPullRequestNumber: 82,
      mustDescendFromAuthorizationSourceMainSha: true,
      mustEqualFetchedOriginMain: true,
      postMainBuildRequired: true,
      postMainSecurityRequired: true,
      postMainAnnotationsMustBeEmpty: true,
      commitBoundLiveAuditRequired: true
    }
  };

  const previousTargetRoot = process.env.SENA_GOVERNANCE_TARGET_ROOT;
  process.env.SENA_GOVERNANCE_TARGET_ROOT = root;
  let governance: any;
  try {
    governance = await import(
      `${pathToFileURL(script).href}?protectedActivation=${Date.now()}-${Math.random()}`
    );
  } finally {
    if (previousTargetRoot === undefined) delete process.env.SENA_GOVERNANCE_TARGET_ROOT;
    else process.env.SENA_GOVERNANCE_TARGET_ROOT = previousTargetRoot;
  }
  return { root, governance, readback, binding };
}

describe("protected activation completion and PR46 repair rebinding", () => {
  it("resolves exact independent Git identity and matches only branded completion evidence", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-completion"
    );
    expect(typeof fixture.governance.resolveProtectedActivationCompletionActual).toBe(
      "function"
    );
    expect(typeof fixture.governance.protectedActivationCompletionEvidenceMatches).toBe(
      "function"
    );
    const actual = fixture.governance.resolveProtectedActivationCompletionActual(
      fixture.readback
    );
    const evidence = structuredClone(actual);

    expect(Object.keys(actual).sort()).toEqual(
      [...PROTECTED_ACTIVATION_EVIDENCE_KEYS_FOR_TEST].sort()
    );
    expect(
      fixture.governance.protectedActivationCompletionEvidenceMatches(
        fixture.binding,
        evidence,
        actual
      )
    ).toBe(true);
    expect(
      fixture.governance.protectedActivationCompletionEvidenceMatches(
        fixture.binding,
        evidence,
        structuredClone(actual)
      )
    ).toBe(false);
    expect(
      fixture.governance.protectedActivationCompletionEvidenceMatches(
        fixture.binding,
        evidence,
        { ...actual }
      )
    ).toBe(false);
  });

  it("ignores a post-import structuredClone replacement at every protected activation clone boundary", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-structured-clone"
    );
    const governance = await import(pathToFileURL(governanceScript).href);
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const frozenHead = frozenSource.headSha;
    const frozenRegistry = frozenSource.registry;
    const sourceAuthorization = frozenRegistry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    ).finalBaseHandshakeAuthorization;
    const initial = buildProtectedCurrentnessRepairInitialFixture(
      frozenRegistry,
      frozenHead,
      82
    );
    const structuredCloneDescriptorBefore = Object.getOwnPropertyDescriptor(
      globalThis,
      "structuredClone"
    );
    expect(structuredCloneDescriptorBefore).toBeDefined();
    const nativeStructuredClone = globalThis.structuredClone.bind(globalThis);
    const withStructuredCloneReplacement = <T>(
      mutateClone: (clone: any) => void,
      operation: () => T
    ) => {
      const replacement = ((value: unknown, options?: any) => {
        const clone = nativeStructuredClone(value, options);
        mutateClone(clone);
        return clone;
      }) as typeof structuredClone;
      try {
        Object.defineProperty(globalThis, "structuredClone", {
          ...structuredCloneDescriptorBefore,
          value: replacement
        });
        return operation();
      } finally {
        Object.defineProperty(
          globalThis,
          "structuredClone",
          structuredCloneDescriptorBefore!
        );
      }
    };
    const expectStructuredCloneDescriptorRestored = () => {
      expect.soft(
        Object.getOwnPropertyDescriptor(globalThis, "structuredClone")
      ).toEqual(structuredCloneDescriptorBefore);
    };

    const brandedSource = withStructuredCloneReplacement(
      (clone) => {
        if (typeof clone?.candidateHeadSha === "string") {
          clone.candidateHeadSha = "f".repeat(40);
        }
      },
      () => governance.resolveProtectedPr46ActivationRebindingSource(frozenRegistry)
    );
    expect.soft(brandedSource.candidateHeadSha).toBe(
      sourceAuthorization.candidateHeadSha
    );
    expectStructuredCloneDescriptorRestored();

    const cleanBrandedSource =
      governance.resolveProtectedPr46ActivationRebindingSource(frozenRegistry);
    const expectedRebinding = withStructuredCloneReplacement(
      (clone) => {
        if (typeof clone?.candidateHeadSha === "string") {
          clone.candidateHeadSha = "f".repeat(40);
        }
      },
      () => governance.expectedProtectedPr46ActivationRebinding(cleanBrandedSource, 82)
    );
    expect.soft(expectedRebinding.candidateHeadSha).toBe(
      sourceAuthorization.candidateHeadSha
    );
    expectStructuredCloneDescriptorRestored();

    const completionActual = withStructuredCloneReplacement(
      (clone) => {
        const build = clone?.postMainBuild ??
          (clone?.workflowName === "build-gate" ? clone : null);
        if (build) build.headSha = "f".repeat(40);
        const audits = clone?.commitBoundLiveAudits ??
          (clone?.beforeRootFastForward ? clone : null);
        if (audits) audits.beforeRootFastForward.status = "fail";
      },
      () => fixture.governance.resolveProtectedActivationCompletionActual(
        fixture.readback
      )
    );
    expect.soft(completionActual.postMainBuild.headSha).toBe(
      fixture.readback.postMainBuild.headSha
    );
    expect.soft(
      completionActual.commitBoundLiveAudits.beforeRootFastForward.status
    ).toBe("pass");
    expectStructuredCloneDescriptorRestored();

    let initialValidation: unknown;
    let initialValidationError: unknown;
    let normalizedRegistryCloneCount = 0;
    try {
      initialValidation = withStructuredCloneReplacement(
        (clone) => {
          if (clone?.schemaVersion === "sena-repo-governance/v1") {
            normalizedRegistryCloneCount += 1;
            if (normalizedRegistryCloneCount === 1) {
              clone.policy.maxWriteWorktrees += 1;
            }
          }
        },
        () => governance.validateProtectedCurrentnessRepairInitialDelta(
          frozenRegistry,
          initial.registry,
          initial.context
        )
      );
    } catch (error) {
      initialValidationError = error;
    }
    expect.soft(initialValidationError).toBeUndefined();
    expect.soft(initialValidation).toBe(true);
    expectStructuredCloneDescriptorRestored();

    const cleanProtectedMainNormalization =
      governance.protectedMainNormalizedNonOwnedRegistrySha256(frozenRegistry);
    const poisonedProtectedMainNormalization = withStructuredCloneReplacement(
      (clone) => {
        if (clone?.schemaVersion === "sena-repo-governance/v1") {
          clone.policy.maxWriteWorktrees += 1;
        }
      },
      () => governance.protectedMainNormalizedNonOwnedRegistrySha256(
        frozenRegistry
      )
    );
    expect.soft(poisonedProtectedMainNormalization).toBe(
      cleanProtectedMainNormalization
    );
    expectStructuredCloneDescriptorRestored();
  });

  it("fails closed on activation binding, evidence, workflow, audit, aggregate, and schema drift", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-negatives"
    );
    const actual = fixture.governance.resolveProtectedActivationCompletionActual(
      fixture.readback
    );
    const evidence = structuredClone(actual);
    const expectFalse = (
      mutateBinding: (value: any) => void = () => undefined,
      mutateEvidence: (value: any) => void = () => undefined,
      suppliedActual: any = actual
    ) => {
      const binding = structuredClone(fixture.binding);
      const candidateEvidence = structuredClone(evidence);
      mutateBinding(binding);
      mutateEvidence(candidateEvidence);
      expect(
        fixture.governance.protectedActivationCompletionEvidenceMatches(
          binding,
          candidateEvidence,
          suppliedActual
        )
      ).toBe(false);
    };

    for (const prNumber of [0, 81, null, undefined]) {
      expectFalse((binding) => {
        if (prNumber === undefined) {
          delete binding.protectedActivationBinding.requiredActivationPullRequestNumber;
        } else {
          binding.protectedActivationBinding.requiredActivationPullRequestNumber = prNumber;
        }
      });
    }
    expectFalse((binding) => {
      binding.authorizationSourceMainSha = "f".repeat(40);
    });
    expectFalse((binding) => {
      binding.protectedActivationBinding.requiredActivationLifecycleStatus = "wrong";
    });
    expectFalse((binding) => {
      binding.protectedActivationBinding.future = false;
    });
    expectFalse((binding) => {
      delete binding.protectedActivationBinding.postMainBuildRequired;
    });
    expectFalse((binding) => {
      binding.future = false;
    });
    expect(Object.keys(fixture.binding.protectedActivationBinding).sort()).toEqual(
      [...PROTECTED_ACTIVATION_BINDING_KEYS_FOR_TEST].sort()
    );

    for (const [label, mutate] of [
      ["pull request", (value: any) => (value.pullRequestNumber = 81)],
      ["final head", (value: any) => (value.finalHeadSha = "f".repeat(40))],
      ["source", (value: any) => (value.protectedSourceMainSha = "f".repeat(40))],
      ["merge", (value: any) => (value.protectedMergeCommitSha = "f".repeat(40))],
      ["tree", (value: any) => (value.protectedMergeTreeSha = "f".repeat(40))],
      ["blob", (value: any) => (value.protectedRegistryBlobSha = "f".repeat(40))],
      ["fetched", (value: any) => (value.fetchedOriginMainSha = "f".repeat(40))],
      ["parents reversed", (value: any) => value.orderedParentShas.reverse()],
      ["parents one", (value: any) => value.orderedParentShas.pop()],
      ["parents three", (value: any) => value.orderedParentShas.push("f".repeat(40))],
      ["final tree", (value: any) => (value.finalHeadTreeSha = "f".repeat(40))],
      ["final blob", (value: any) => (value.finalHeadRegistryBlobSha = "f".repeat(40))],
      ["build workflow", (value: any) => (value.postMainBuild.workflowName = "wrong")],
      ["build event", (value: any) => (value.postMainBuild.event = "pull_request")],
      ["build head", (value: any) => (value.postMainBuild.headSha = "f".repeat(40))],
      ["build status", (value: any) => (value.postMainBuild.status = "queued")],
      ["build conclusion", (value: any) => (value.postMainBuild.conclusion = "failure")],
      ["annotation", (value: any) => (value.postMainBuild.annotationCount = 1)],
      ["run reuse", (value: any) => (value.postMainRepositorySecurity.runId = 101)],
      ["job reuse", (value: any) => (value.postMainRepositorySecurity.jobId = 102)],
      ["aggregate checks", (value: any) => (value.requiredChecksPassed = false)],
      ["aggregate annotations", (value: any) => (value.annotationsEmpty = false)],
      ["audit status", (value: any) => (value.commitBoundLiveAudits.beforeRootFastForward.status = "fail")],
      ["audit errors", (value: any) => value.commitBoundLiveAudits.beforeRootFastForward.errors.push("drift")],
      ["audit blockers", (value: any) => value.commitBoundLiveAudits.afterRootFastForward.ownerBlockers.push("drift")],
      ["audit reachability", (value: any) => (value.commitBoundLiveAudits.afterRootFastForward.unreachableCommitCount = 1)],
      ["unknown evidence", (value: any) => (value.future = false)],
      ["unknown workflow", (value: any) => (value.postMainBuild.future = false)],
      ["unknown audit", (value: any) => (value.commitBoundLiveAudits.future = false)]
    ] as Array<[string, (value: any) => void]>) {
      expectFalse(() => undefined, mutate);
      expect(label.length).toBeGreaterThan(0);
    }
    expectFalse(() => undefined, (value) => {
      delete value.protectedMergeTreeSha;
    });
    expectFalse(() => undefined, (value) => {
      delete value.postMainBuild.jobId;
    });
    expectFalse(() => undefined, (value) => {
      delete value.commitBoundLiveAudits.beforeRootFastForward.errors;
    });

    const unsupportedAggregate = structuredClone(evidence);
    unsupportedAggregate.postMainBuild.conclusion = "failure";
    unsupportedAggregate.requiredChecksPassed = true;
    expect(
      fixture.governance.protectedActivationCompletionEvidenceMatches(
        fixture.binding,
        unsupportedAggregate,
        actual
      )
    ).toBe(false);
  });

  it("rejects exact-readback schema and caller-authored Git identity drift before branding", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-readback"
    );
    const expectReadbackFailure = (mutate: (value: any) => void) => {
      const readback = structuredClone(fixture.readback);
      mutate(readback);
      expect(() =>
        fixture.governance.resolveProtectedActivationCompletionActual(readback)
      ).toThrow();
    };
    expectReadbackFailure((value) => (value.orderedParentShas = [value.finalHeadSha]));
    expectReadbackFailure((value) => value.orderedParentShas.reverse());
    expectReadbackFailure((value) => value.orderedParentShas.push(value.finalHeadSha));
    expectReadbackFailure((value) => (value.protectedMergeTreeSha = "f".repeat(40)));
    expectReadbackFailure((value) => (value.protectedRegistryBlobSha = "f".repeat(40)));
    expectReadbackFailure((value) => (value.finalHeadTreeSha = "f".repeat(40)));
    expectReadbackFailure((value) => (value.finalHeadRegistryBlobSha = "f".repeat(40)));
    expectReadbackFailure((value) => (value.protectedMergeCommitSha = value.finalHeadSha));
    expectReadbackFailure((value) => (value.fetchedOriginMainSha = value.finalHeadSha));
    expectReadbackFailure((value) => (value.pullRequestNumber = 0));
    expectReadbackFailure((value) => (value.pullRequestNumber = 81));
    expectReadbackFailure((value) => (value.postMainBuild.runId = 0));
    expectReadbackFailure((value) => (value.postMainRepositorySecurity.jobId = 102));
    expectReadbackFailure((value) => (value.postMainRepositorySecurity.workflowName = "wrong"));
    expectReadbackFailure((value) => (value.postMainBuild.annotationCount = 1));
    expectReadbackFailure((value) =>
      value.commitBoundLiveAudits.beforeRootFastForward.errors.push("drift")
    );
    expectReadbackFailure((value) => (value.future = false));
    expectReadbackFailure((value) => (value.postMainBuild.future = false));
    expectReadbackFailure((value) => (value.commitBoundLiveAudits.future = false));
    expectReadbackFailure((value) => delete value.finalHeadSha);
    expectReadbackFailure((value) => delete value.postMainBuild.runId);
    expectReadbackFailure((value) =>
      delete value.commitBoundLiveAudits.afterRootFastForward.status
    );
  });

  it("builds and validates the only exact PR46 activation rebinding delta", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    expect(typeof governance.expectedProtectedPr46ActivationRebinding).toBe("function");
    expect(typeof governance.validateProtectedPr46ActivationRebinding).toBe("function");
    const sourceRegistry = protectedCurrentnessRepairFrozenSourceForTest().registry;
    const sourceAuthorization =
      governance.resolveProtectedPr46ActivationRebindingSource(sourceRegistry);
    const expected = governance.expectedProtectedPr46ActivationRebinding(
      sourceAuthorization,
      82
    );
    expect(governance.validateProtectedPr46ActivationRebinding(
      sourceAuthorization,
      expected,
      82
    )).toBe(true);
    expect(expected.authorizationSourceMainSha).toBe(
      "969a206b798c159e15ae0b6e5c76d0c94cca92ea"
    );
    expect(expected.authorizationSourceMainTreeSha).toBe(
      "c3d3d91ff7868939cb331a8c237349d6abbd9357"
    );
    expect(expected.authorizationSourceRegistryBlobSha).toBe(
      "b0f4bfd1f35d816e22774458a4bc1593c29a745b"
    );
    expect(expected.currentProtectedMainSha).toBe(expected.authorizationSourceMainSha);
    expect(expected.currentProtectedMainTreeSha).toBe(expected.authorizationSourceMainTreeSha);
    expect(expected.currentProtectedRegistryBlobSha).toBe(
      expected.authorizationSourceRegistryBlobSha
    );
    expect(expected.currentConflictPathCount).toBe(3);
    expect(expected.currentConflictingPaths).toEqual(
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE_FOR_TEST
    );
    expect(expected.currentCandidateOnlyCleanPaths).toEqual([]);
    expect(expected.authorizedResolverTransition.pendingState.cleanProtectedOnlyPathsMustEqual)
      .toEqual(PR46_REPAIR_PROTECTED_ONLY_PATHS_FOR_TEST);
    expect(expected.authorizedResolverTransition.pendingState
      .exactThreeFileResolutionMustPreserveProtectedRepairLifecycle).toBe(true);
    expect(expected.authorizedResolverTransition.requiredRedGreenCases.slice(-3)).toEqual(
      PR46_REPAIR_REQUIRED_RED_GREEN_APPEND_FOR_TEST
    );
    expect(expected.requiredExecution).toEqual(PR46_REPAIR_REQUIRED_EXECUTION_FOR_TEST);
    expect(expected.finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation).toBe(true);
    expect(expected.finalResolverAndTestStageAuthorizedAfterProtectedActivation).toBe(true);
    expect(expected.finalMergeCommitPushAuthorizedAfterRequiredGates).toBe(true);
    expect(expected.finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks).toBe(false);
    expect(expected.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks).toBe(false);
    for (const field of [
      "implementationAuthorizedNow",
      "localRefRetirementAuthorized",
      "retirementReceiptMintingAuthorized",
      "branchDeletionAuthorized",
      "worktreeRemovalAuthorized",
      "orphanWorktreeMutationAuthorized",
      "targetTagMutationAuthorized",
      "quarantineMutationAuthorized",
      "deploymentAuthorized",
      "providerMutationAuthorized",
      "resetAuthorized",
      "rebaseAuthorized",
      "stashAuthorized",
      "forceAuthorized",
      "historyRewriteAuthorized"
    ]) {
      expect(expected[field]).toBe(false);
    }
  });

  it("rejects wrong PR identity and every owned or non-owned PR46 rebinding drift", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const sourceRegistry = protectedCurrentnessRepairFrozenSourceForTest().registry;
    const sourceAuthorization =
      governance.resolveProtectedPr46ActivationRebindingSource(sourceRegistry);
    for (const wrong of [0, 81, 83, null]) {
      expect(() =>
        governance.expectedProtectedPr46ActivationRebinding(sourceAuthorization, wrong)
      ).toThrow("rule=protected-currentness-repair-activation-pr-invalid");
    }
    const expected = governance.expectedProtectedPr46ActivationRebinding(
      sourceAuthorization,
      82
    );
    const expectInvalid = (mutate: (value: any) => void) => {
      const candidate = structuredClone(expected);
      mutate(candidate);
      expect(() =>
        governance.validateProtectedPr46ActivationRebinding(
          sourceAuthorization,
          candidate,
          82
        )
      ).toThrow("rule=protected-currentness-repair-pr46-activation-delta-invalid");
    };
    for (const mutate of [
      (value: any) => (value.protectedActivationBinding.requiredActivationPullRequestNumber = 81),
      (value: any) => (value.authorizationSourceMainSha = "f".repeat(40)),
      (value: any) => (value.authorizationSourceMainTreeSha = "f".repeat(40)),
      (value: any) => (value.authorizationSourceRegistryBlobSha = "f".repeat(40)),
      (value: any) => (value.currentProtectedMainSha = "f".repeat(40)),
      (value: any) => (value.currentConflictPathCount = 2),
      (value: any) => value.currentConflictingPaths.reverse(),
      (value: any) => value.currentCandidateOnlyCleanPaths.push("future-path"),
      (value: any) => value.authorizedResolverTransition.pendingState
        .cleanProtectedOnlyPathsMustEqual.reverse(),
      (value: any) => delete value.authorizedResolverTransition.pendingState
        .exactThreeFileResolutionMustPreserveProtectedRepairLifecycle,
      (value: any) => value.authorizedResolverTransition.requiredRedGreenCases.push(
        PR46_REPAIR_REQUIRED_RED_GREEN_APPEND_FOR_TEST[2]
      ),
      (value: any) => value.authorizedResolverTransition.requiredRedGreenCases.reverse(),
      (value: any) => value.requiredExecution.reverse(),
      (value: any) => value.requiredExecution.push("future-action"),
      (value: any) => (value.finalMergeCommitPushAuthorizedAfterRequiredGates = false),
      (value: any) => (value.finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks = true),
      (value: any) => (value.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks = true),
      (value: any) => (value.branchDeletionAuthorized = true),
      (value: any) => (value.candidateHeadSha = "f".repeat(40)),
      (value: any) => (value.future = false),
      (value: any) => (value.authorizedResolverTransition.future = false)
    ]) {
      expectInvalid(mutate);
    }
  });

  it("makes the initial repair transition own the canonical PR46 rebinding and the final transition preserve it", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const frozenSeedHead = frozenSource.headSha;
    const frozenSeedRegistry = frozenSource.registry;
    const initial = buildProtectedCurrentnessRepairInitialFixture(
      frozenSeedRegistry,
      frozenSeedHead,
      82
    );
    const sourceAuthorization =
      governance.resolveProtectedPr46ActivationRebindingSource(frozenSeedRegistry);
    const retirement = initial.registry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    );
    retirement.finalBaseHandshakeAuthorization =
      governance.expectedProtectedPr46ActivationRebinding(sourceAuthorization, 82);
    expect(governance.validateProtectedCurrentnessRepairInitialDelta(
      frozenSeedRegistry,
      initial.registry,
      initial.context
    )).toBe(true);

    const final = buildProtectedCurrentnessRepairFinalFixture(initial);
    expect(governance.validateProtectedCurrentnessRepairFinalDelta(
      initial.registry,
      final.registry,
      final.context
    )).toBe(true);
    const driftedFinal = structuredClone(final.registry);
    driftedFinal.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    ).finalBaseHandshakeAuthorization.currentConflictPathCount = 2;
    expect(() => governance.validateProtectedCurrentnessRepairFinalDelta(
      initial.registry,
      driftedFinal,
      final.context
    )).toThrow("rule=protected-currentness-repair-final-delta-invalid");
  });

  it("rejects inherited serialization hooks without leaking global prototype changes", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-prototype-hooks"
    );
    const actual = fixture.governance.resolveProtectedActivationCompletionActual(
      fixture.readback
    );
    const objectKeysBefore = Reflect.ownKeys(Object.prototype);
    const arrayKeysBefore = Reflect.ownKeys(Array.prototype);
    const objectDescriptorBefore = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "toJSON"
    );
    const arrayDescriptorBefore = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "toJSON"
    );
    let matcherAcceptedDifferentEvidence = false;
    let resolverAcceptedDifferentParents = false;
    try {
      Object.defineProperty(Object.prototype, "toJSON", {
        configurable: true,
        value: () => "collapsed-object"
      });
      const differentEvidence = structuredClone(actual);
      differentEvidence.orderedParentShas.reverse();
      matcherAcceptedDifferentEvidence =
        fixture.governance.protectedActivationCompletionEvidenceMatches(
          fixture.binding,
          differentEvidence,
          actual
        );
      delete (Object.prototype as { toJSON?: unknown }).toJSON;

      Object.defineProperty(Array.prototype, "toJSON", {
        configurable: true,
        value: () => "collapsed-array"
      });
      const differentReadback = structuredClone(fixture.readback);
      differentReadback.orderedParentShas.reverse();
      try {
        fixture.governance.resolveProtectedActivationCompletionActual(
          differentReadback
        );
        resolverAcceptedDifferentParents = true;
      } catch {
        resolverAcceptedDifferentParents = false;
      }
    } finally {
      if (objectDescriptorBefore) {
        Object.defineProperty(Object.prototype, "toJSON", objectDescriptorBefore);
      } else {
        delete (Object.prototype as { toJSON?: unknown }).toJSON;
      }
      if (arrayDescriptorBefore) {
        Object.defineProperty(Array.prototype, "toJSON", arrayDescriptorBefore);
      } else {
        delete (Array.prototype as { toJSON?: unknown }).toJSON;
      }
    }

    expect(matcherAcceptedDifferentEvidence).toBe(false);
    expect(resolverAcceptedDifferentParents).toBe(false);
    expect(Reflect.ownKeys(Object.prototype)).toEqual(objectKeysBefore);
    expect(Reflect.ownKeys(Array.prototype)).toEqual(arrayKeysBefore);
    expect(Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")).toEqual(
      objectDescriptorBefore
    );
    expect(Object.getOwnPropertyDescriptor(Array.prototype, "toJSON")).toEqual(
      arrayDescriptorBefore
    );
  });

  it("rejects hostile Proxy values at every activation boundary without triggering traps", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-proxies"
    );
    const actual = fixture.governance.resolveProtectedActivationCompletionActual(
      fixture.readback
    );
    const evidence = structuredClone(actual);
    const trap = () => {
      throw new Error("hostile proxy trap must not run");
    };
    const hostileProxy = (value: any) => new Proxy(value, {
      get: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
      getOwnPropertyDescriptor: trap
    });
    const expectMatcherFalseWithoutThrow = (binding: any, suppliedEvidence: any) => {
      let result: unknown;
      expect(() => {
        result = fixture.governance.protectedActivationCompletionEvidenceMatches(
          binding,
          suppliedEvidence,
          actual
        );
      }).not.toThrow();
      expect(result).toBe(false);
    };

    expectMatcherFalseWithoutThrow(hostileProxy(structuredClone(fixture.binding)), evidence);
    expectMatcherFalseWithoutThrow(
      fixture.binding,
      hostileProxy(structuredClone(evidence))
    );
    const nestedWorkflowEvidence = structuredClone(evidence);
    nestedWorkflowEvidence.postMainBuild = hostileProxy(
      nestedWorkflowEvidence.postMainBuild
    );
    expectMatcherFalseWithoutThrow(fixture.binding, nestedWorkflowEvidence);
    const parentProxyEvidence = structuredClone(evidence);
    parentProxyEvidence.orderedParentShas = hostileProxy(
      parentProxyEvidence.orderedParentShas
    );
    expectMatcherFalseWithoutThrow(fixture.binding, parentProxyEvidence);

    for (const readback of [
      hostileProxy(structuredClone(fixture.readback)),
      (() => {
        const value = structuredClone(fixture.readback);
        value.postMainBuild = hostileProxy(value.postMainBuild);
        return value;
      })(),
      (() => {
        const value = structuredClone(fixture.readback);
        value.orderedParentShas = hostileProxy(value.orderedParentShas);
        return value;
      })()
    ]) {
      expect(() =>
        fixture.governance.resolveProtectedActivationCompletionActual(readback)
      ).toThrow("rule=protected-activation-completion-readback-invalid");
    }

    const sourceRegistry = protectedCurrentnessRepairFrozenSourceForTest().registry;
    const projectGovernance = await import(pathToFileURL(governanceScript).href);
    const sourceAuthorization =
      projectGovernance.resolveProtectedPr46ActivationRebindingSource(sourceRegistry);
    const expected = projectGovernance.expectedProtectedPr46ActivationRebinding(
      sourceAuthorization,
      82
    );
    expect(() =>
      projectGovernance.expectedProtectedPr46ActivationRebinding(
        hostileProxy(structuredClone(sourceAuthorization)),
        82
      )
    ).toThrow("rule=protected-currentness-repair-pr46-source-unbranded");
    expect(() =>
      projectGovernance.validateProtectedPr46ActivationRebinding(
        sourceAuthorization,
        hostileProxy(structuredClone(expected)),
        82
      )
    ).toThrow("rule=protected-currentness-repair-pr46-activation-delta-invalid");
  });

  it("rejects symbol, nonplain, null-prototype, accessor, array-extra, and cyclic data", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-plain-data"
    );
    const actual = fixture.governance.resolveProtectedActivationCompletionActual(
      fixture.readback
    );
    const expectMatcherFalse = (mutate: (binding: any, evidence: any) => void) => {
      const binding = structuredClone(fixture.binding);
      const evidence = structuredClone(actual);
      mutate(binding, evidence);
      expect(() =>
        fixture.governance.protectedActivationCompletionEvidenceMatches(
          binding,
          evidence,
          actual
        )
      ).not.toThrow();
      expect(
        fixture.governance.protectedActivationCompletionEvidenceMatches(
          binding,
          evidence,
          actual
        )
      ).toBe(false);
    };

    expectMatcherFalse((_binding, evidence) => {
      evidence[Symbol("extra")] = true;
    });
    expectMatcherFalse((_binding, evidence) => {
      evidence.postMainBuild = Object.assign(
        Object.create(null),
        evidence.postMainBuild
      );
    });
    expectMatcherFalse((binding) => {
      binding.protectedActivationBinding = new (class BindingRecord {
        mode = binding.protectedActivationBinding.mode;
      })();
    });
    expectMatcherFalse((_binding, evidence) => {
      evidence.orderedParentShas.extra = "not-an-index";
    });
    expectMatcherFalse((_binding, evidence) => {
      Object.defineProperty(evidence.postMainBuild, "workflowName", {
        configurable: true,
        enumerable: true,
        get: () => "build-gate"
      });
    });
    expectMatcherFalse((_binding, evidence) => {
      evidence.postMainBuild.headSha = evidence;
    });
    expectMatcherFalse((_binding, evidence) => {
      evidence.postMainBuild.runId = BigInt(101);
    });
    expectMatcherFalse((_binding, evidence) => {
      evidence.postMainBuild.jobId = undefined;
    });
    expectMatcherFalse((_binding, evidence) => {
      evidence.commitBoundLiveAudits.beforeRootFastForward.status = () => "pass";
    });

    const readbackWithSymbol = structuredClone(fixture.readback);
    Object.defineProperty(readbackWithSymbol, Symbol("extra"), {
      configurable: true,
      enumerable: true,
      value: true,
      writable: true
    });
    expect(() =>
      fixture.governance.resolveProtectedActivationCompletionActual(
        readbackWithSymbol
      )
    ).toThrow("rule=protected-activation-completion-readback-invalid");
    const readbackWithArrayExtra = structuredClone(fixture.readback);
    Object.defineProperty(readbackWithArrayExtra.orderedParentShas, "extra", {
      configurable: true,
      enumerable: true,
      value: true,
      writable: true
    });
    expect(() =>
      fixture.governance.resolveProtectedActivationCompletionActual(
        readbackWithArrayExtra
      )
    ).toThrow("rule=protected-activation-completion-readback-invalid");

    const sourceRegistry = protectedCurrentnessRepairFrozenSourceForTest().registry;
    const projectGovernance = await import(pathToFileURL(governanceScript).href);
    const sourceAuthorization =
      projectGovernance.resolveProtectedPr46ActivationRebindingSource(sourceRegistry);
    const nullPrototypeSource = Object.assign(
      Object.create(null),
      sourceAuthorization
    );
    expect(() =>
      projectGovernance.expectedProtectedPr46ActivationRebinding(
        nullPrototypeSource,
        82
      )
    ).toThrow("rule=protected-currentness-repair-pr46-source-unbranded");
    const expected = projectGovernance.expectedProtectedPr46ActivationRebinding(
      sourceAuthorization,
      82
    );
    expected[Symbol("extra")] = true;
    expect(() =>
      projectGovernance.validateProtectedPr46ActivationRebinding(
        sourceAuthorization,
        expected,
        82
      )
    ).toThrow("rule=protected-currentness-repair-pr46-activation-delta-invalid");
  });

  it("requires a module-branded frozen-registry source for every PR46 rebinding authority path", async () => {
    const governance = await import(pathToFileURL(governanceScript).href);
    const frozenSource = protectedCurrentnessRepairFrozenSourceForTest();
    const frozenHead = frozenSource.headSha;
    const frozenRegistry = frozenSource.registry;
    const plainAuthorization = frozenRegistry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    ).finalBaseHandshakeAuthorization;
    const candidateAuthorization = expectedProtectedPr46ActivationRebindingForTest(
      plainAuthorization,
      82
    );

    for (const unbranded of [
      plainAuthorization,
      structuredClone(plainAuthorization),
      { ...plainAuthorization },
      JSON.parse(JSON.stringify(plainAuthorization))
    ]) {
      expect.soft(() =>
        governance.expectedProtectedPr46ActivationRebinding(unbranded, 82)
      ).toThrow("rule=protected-currentness-repair-pr46-source-unbranded");
      expect.soft(() =>
        governance.validateProtectedPr46ActivationRebinding(
          unbranded,
          candidateAuthorization,
          82
        )
      ).toThrow("rule=protected-currentness-repair-pr46-source-unbranded");
    }

    const driftedSourceRegistry = structuredClone(frozenRegistry);
    driftedSourceRegistry.workItems.find(
      (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
    ).finalBaseHandshakeAuthorization.candidateHeadSha = "f".repeat(40);
    const driftedInitial = buildProtectedCurrentnessRepairInitialFixture(
      driftedSourceRegistry,
      frozenHead,
      82
    );
    expect.soft(() => governance.validateProtectedCurrentnessRepairInitialDelta(
      driftedSourceRegistry,
      driftedInitial.registry,
      driftedInitial.context
    )).toThrow("rule=protected-currentness-repair-frozen-source-registry-invalid");

    expect(typeof governance.resolveProtectedPr46ActivationRebindingSource).toBe(
      "function"
    );
    const branded = governance.resolveProtectedPr46ActivationRebindingSource(
      frozenRegistry
    );
    const expected = governance.expectedProtectedPr46ActivationRebinding(branded, 82);
    expect(governance.validateProtectedPr46ActivationRebinding(
      branded,
      expected,
      82
    )).toBe(true);
    for (const lostBrand of [
      structuredClone(branded),
      { ...branded },
      JSON.parse(JSON.stringify(branded))
    ]) {
      expect(() =>
        governance.expectedProtectedPr46ActivationRebinding(lostBrand, 82)
      ).toThrow("rule=protected-currentness-repair-pr46-source-unbranded");
    }

    for (const mutate of [
      (registry: any) => (registry.updatedAt = "2026-09-01T23:59:59Z"),
      (registry: any) => registry.releaseReceipts.pop(),
      (registry: any) => (registry.workItems[0].headSha = "f".repeat(40))
    ]) {
      const drifted = structuredClone(frozenRegistry);
      mutate(drifted);
      expect(() =>
        governance.resolveProtectedPr46ActivationRebindingSource(drifted)
      ).toThrow("rule=protected-currentness-repair-frozen-source-registry-invalid");
    }
  });

  it("requires two commit-bound root-fast-forward audit identities", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-two-audits"
    );
    expect.soft(() =>
      fixture.governance.resolveProtectedActivationCompletionActual(
        fixture.readback
      )
    ).not.toThrow();

    const legacySingular = structuredClone(fixture.readback);
    Reflect.deleteProperty(legacySingular, "commitBoundLiveAudits");
    Object.defineProperty(legacySingular, "commitBoundLiveAudit", {
      configurable: true,
      enumerable: true,
      value: {
        status: "pass",
        errors: [],
        ownerBlockers: [],
        unreachableCommitCount: 0
      },
      writable: true
    });
    expect.soft(() =>
      fixture.governance.resolveProtectedActivationCompletionActual(
        legacySingular
      )
    ).toThrow("rule=protected-activation-completion-readback-invalid");

    const expectAuditFailure = (mutate: (readback: any) => void) => {
      const readback = structuredClone(fixture.readback);
      mutate(readback);
      expect(() =>
        fixture.governance.resolveProtectedActivationCompletionActual(readback)
      ).toThrow("rule=protected-activation-completion-readback-invalid");
    };
    for (const commitSha of [
      fixture.readback.protectedSourceMainSha,
      fixture.readback.finalHeadSha,
      "f".repeat(40)
    ]) {
      expectAuditFailure((value) => {
        value.commitBoundLiveAudits.beforeRootFastForward
          .authorizationRegistryCommitSha = commitSha;
      });
    }
    expectAuditFailure((value) => {
      value.commitBoundLiveAudits.afterRootFastForward.authorizationRegistryCommitSha =
        value.protectedSourceMainSha;
    });
    expectAuditFailure((value) => {
      value.commitBoundLiveAudits.beforeRootFastForward.auditedRegistryBlobSha =
        "f".repeat(40);
    });
    expectAuditFailure((value) => {
      const before = value.commitBoundLiveAudits.beforeRootFastForward;
      value.commitBoundLiveAudits.beforeRootFastForward =
        value.commitBoundLiveAudits.afterRootFastForward;
      value.commitBoundLiveAudits.afterRootFastForward = before;
    });
    expectAuditFailure((value) => {
      value.commitBoundLiveAudits.afterRootFastForward = structuredClone(
        value.commitBoundLiveAudits.beforeRootFastForward
      );
    });
    expectAuditFailure((value) => {
      delete value.commitBoundLiveAudits.afterRootFastForward;
    });
    for (const checkoutHeadSha of [
      fixture.readback.finalHeadSha,
      fixture.readback.protectedMergeCommitSha,
      "f".repeat(40)
    ]) {
      expectAuditFailure((value) => {
        value.commitBoundLiveAudits.beforeRootFastForward.checkoutHeadSha =
          checkoutHeadSha;
      });
    }
    for (const checkoutHeadSha of [
      fixture.readback.protectedSourceMainSha,
      fixture.readback.finalHeadSha,
      "f".repeat(40)
    ]) {
      expectAuditFailure((value) => {
        value.commitBoundLiveAudits.afterRootFastForward.checkoutHeadSha =
          checkoutHeadSha;
      });
    }
  });

  it("requires canonical mutable JSON descriptors from callers while accepting branded frozen actuals", async () => {
    const fixture = await createProtectedActivationCompletionFixture(
      "protected-activation-canonical-descriptors"
    );
    const actual = fixture.governance.resolveProtectedActivationCompletionActual(
      fixture.readback
    );
    const jsonEvidence = JSON.parse(JSON.stringify(actual));
    expect(Object.isFrozen(actual)).toBe(true);
    expect(Object.isFrozen(actual.postMainBuild)).toBe(true);
    expect(Object.isFrozen(actual.orderedParentShas)).toBe(true);
    expect(
      fixture.governance.protectedActivationCompletionEvidenceMatches(
        fixture.binding,
        jsonEvidence,
        actual
      )
    ).toBe(true);

    const expectDescriptorEvidenceFailure = (mutate: (evidence: any) => void) => {
      const evidence = JSON.parse(JSON.stringify(actual));
      mutate(evidence);
      expect(
        fixture.governance.protectedActivationCompletionEvidenceMatches(
          fixture.binding,
          evidence,
          actual
        )
      ).toBe(false);
    };
    expectDescriptorEvidenceFailure((evidence) => {
      Object.defineProperty(evidence.postMainBuild, "hidden", {
        value: "ignored-by-json",
        enumerable: false,
        writable: true,
        configurable: true
      });
    });
    expectDescriptorEvidenceFailure((evidence) => {
      Object.defineProperty(evidence.postMainBuild, "runId", {
        value: evidence.postMainBuild.runId,
        enumerable: true,
        writable: false,
        configurable: false
      });
    });
    expectDescriptorEvidenceFailure((evidence) => {
      Object.defineProperty(evidence.orderedParentShas, "0", {
        value: evidence.orderedParentShas[0],
        enumerable: false,
        writable: true,
        configurable: true
      });
    });
    expectDescriptorEvidenceFailure((evidence) => {
      Object.defineProperty(evidence.orderedParentShas, "1", {
        value: evidence.orderedParentShas[1],
        enumerable: true,
        writable: false,
        configurable: false
      });
    });

    const expectDescriptorReadbackFailure = (mutate: (readback: any) => void) => {
      const readback = JSON.parse(JSON.stringify(fixture.readback));
      mutate(readback);
      expect(() =>
        fixture.governance.resolveProtectedActivationCompletionActual(readback)
      ).toThrow("rule=protected-activation-completion-readback-invalid");
    };
    expectDescriptorReadbackFailure((readback) => {
      Object.defineProperty(readback, "hidden", {
        value: true,
        enumerable: false,
        writable: true,
        configurable: true
      });
    });
    expectDescriptorReadbackFailure((readback) => {
      Object.defineProperty(readback, "pullRequestNumber", {
        value: 82,
        enumerable: true,
        writable: false,
        configurable: false
      });
    });
    expectDescriptorReadbackFailure((readback) => {
      Object.defineProperty(readback.orderedParentShas, "0", {
        value: readback.orderedParentShas[0],
        enumerable: false,
        writable: true,
        configurable: true
      });
    });

    const projectGovernance = await import(pathToFileURL(governanceScript).href);
    const frozenRegistry = protectedCurrentnessRepairFrozenSourceForTest().registry;
    const brandedSource =
      projectGovernance.resolveProtectedPr46ActivationRebindingSource(
        frozenRegistry
      );
    const expected = projectGovernance.expectedProtectedPr46ActivationRebinding(
      brandedSource,
      82
    );
    expect(projectGovernance.validateProtectedPr46ActivationRebinding(
      brandedSource,
      JSON.parse(JSON.stringify(expected)),
      82
    )).toBe(true);
    for (const mutate of [
      (candidate: any) => Object.defineProperty(candidate, "hidden", {
        value: true,
        enumerable: false,
        writable: true,
        configurable: true
      }),
      (candidate: any) => Object.defineProperty(candidate, "currentConflictPathCount", {
        value: 3,
        enumerable: true,
        writable: false,
        configurable: false
      }),
      (candidate: any) => Object.defineProperty(candidate.currentConflictingPaths, "0", {
        value: candidate.currentConflictingPaths[0],
        enumerable: false,
        writable: true,
        configurable: true
      })
    ]) {
      const candidate = JSON.parse(JSON.stringify(expected));
      mutate(candidate);
      expect(() =>
        projectGovernance.validateProtectedPr46ActivationRebinding(
          brandedSource,
          candidate,
          82
        )
      ).toThrow("rule=protected-currentness-repair-pr46-activation-delta-invalid");
    }
  });
});
