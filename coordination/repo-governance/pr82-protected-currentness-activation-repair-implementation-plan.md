# Protected Currentness and PR46 Activation Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land one self-closing protected repair that separates non-destructive currentness observation from cleanup authority, validates exact protected-main advance chains, and establishes the immutable activation source that PR46 may later consume.

**Architecture:** Extend the existing single-file governance verifier with three narrowly bounded contracts: integrated monotonic-behind observation, lifecycle-derived protected-main advance-chain validation, and protected activation evidence matching. Protect the repair itself with a PR80-style two-state registry transition and exact receipt/action/path checks. Keep PR46, EvidenceFlow, root, local retirement targets, invalid pointers, keep-around refs, and every remote branch unchanged until the repair is protected-main active and its post-main audit passes.

**Tech Stack:** Node.js ESM, Git plumbing, GitHub CLI, Vitest, TypeScript, JSON registry contracts, GitHub Actions build/security workflows.

---

## 0. Approved source and non-negotiable boundaries

Read before executing any checkbox:

- Design: `coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md`
- Registry: `coordination/repo-governance/active-work.json`
- Verifier: `scripts/verify-sena-repo-governance.mjs`
- Tests: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
- Branch: `codex/sena-protected-currentness-activation-repair-20260901`
- Design commit: `cfbbf7f18b9d9fe89249cb095e3d1ed619d8aee6`
- Protected source: `969a206b798c159e15ae0b6e5c76d0c94cca92ea`
- Frozen PR46 head: `e24c635d1f53fccb2264c6be002aec2775de127c`

Every command must run with:

```bash
export TMPDIR=/Volumes/Starship/SENA/.tmp
export NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache
```

Do not use reset, checkout-based restoration, rebase, stash, force push,
history rewrite, `git add .`, or an admin merge. Do not delete or mutate any
local/remote branch, registered worktree, invalid pointer, keep-around ref,
archive tag, quarantine ref, EvidenceFlow file, or retirement target.

## 1. File structure and ownership

No new source module is introduced. The verifier and test files are already the
accepted governance boundary, and creating another source file would enlarge
the PR46 conflict contract without isolating an independent subsystem.

- Modify `coordination/repo-governance/active-work.json`
  - Own the repair lane, two-state lifecycle, receipt prefix, actual Draft PR
    identity, downstream PR46 activation binding, currentness modes, and
    evidence states.
- Modify `scripts/verify-sena-repo-governance.mjs:82-101`
  - Preserve one-way PR state observation and add the pure activation matcher.
- Modify `scripts/verify-sena-repo-governance.mjs:1390-2097`
  - Add the repair lifecycle validator beside the protected PR80 validator.
- Modify `scripts/verify-sena-repo-governance.mjs:2425-2565`
  - Validate the new work-item observation mode and prohibit its use outside
    integrated lanes.
- Modify `scripts/verify-sena-repo-governance.mjs:2765-2885`
  - Add non-destructive integrated-behind and exact protected-advance helpers.
- Modify `scripts/verify-sena-repo-governance.mjs:3270-3430`
  - Route local-root and ahead/behind audit decisions through those helpers.
- Modify `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:319-620`
  - Add focused RED/GREEN fixtures for all new observation and advance rules.
- Modify `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:2461-end`
  - Add exact repair lifecycle and activation-binding transition tests.
- Preserve `coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md`
  - Change only its status/evidence text if the owner requests a spec revision.
- Preserve this plan after the plan commit.

## Task 1: Publish the reviewed design/plan seed and obtain the real Draft PR number

**Files:**
- Verify: `coordination/repo-governance/active-work.json`
- Verify: `coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md`
- Verify: `coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md`

- [ ] **Step 1: Freeze the local plan commit and protected source**

Run from `/Volumes/Starship/SENA/.worktrees/sena-pr80-post-main-closeout-20260901`:

```bash
export SENA_REPAIR_BRANCH=codex/sena-protected-currentness-activation-repair-20260901
export SENA_REPAIR_PROTECTED_SOURCE=969a206b798c159e15ae0b6e5c76d0c94cca92ea
export SENA_REPAIR_SEED_HEAD="$(git --no-optional-locks rev-parse HEAD)"
export SENA_REPAIR_SEED_TREE="$(git --no-optional-locks rev-parse HEAD^{tree})"
export SENA_REPAIR_SEED_REGISTRY_BLOB="$(git --no-optional-locks rev-parse HEAD:coordination/repo-governance/active-work.json)"
export SENA_REPAIR_SEED_AHEAD="$(git --no-optional-locks rev-list --count origin/main..HEAD)"
test "$(git --no-optional-locks branch --show-current)" = "$SENA_REPAIR_BRANCH"
test "$(git --no-optional-locks rev-parse origin/main)" = "$SENA_REPAIR_PROTECTED_SOURCE"
test -z "$(git --no-optional-locks status --porcelain=v1)"
test -z "$(git --no-optional-locks ls-remote --heads origin "refs/heads/$SENA_REPAIR_BRANCH")"
```

Expected: every `test` exits zero; the remote-ref query is empty.

- [ ] **Step 2: Re-run the design-seed proof before external mutation**

```bash
node scripts/verify-sena-repo-governance.mjs registry
node scripts/verify-sena-repo-governance.mjs audit --live \
  --registry-from-commit "$SENA_REPAIR_SEED_HEAD"
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts
cd ..
```

Expected: registry passes; audit has `status=pass`, `errors=[]`,
`ownerBlockers=[]`, and zero unreachable commits; governance tests pass 49/49.

- [ ] **Step 3: Push only the reviewed seed branch**

```bash
git --no-optional-locks push --set-upstream origin \
  "refs/heads/$SENA_REPAIR_BRANCH:refs/heads/$SENA_REPAIR_BRANCH"
```

Expected: pre-push policy and security pass; no other ref changes.

- [ ] **Step 4: Create one Draft PR and read back its actual identity**

```bash
gh pr create --repo HUDongpin/SENA --draft --base main \
  --head "$SENA_REPAIR_BRANCH" \
  --title "governance: repair protected currentness and PR46 activation" \
  --body "Implements the owner-reviewed protected currentness and activation repair design. This Draft seed authorizes no implementation, PR46 mutation, cleanup, deletion, deployment, provider mutation, or history rewrite."
export SENA_REPAIR_PR_NUMBER="$(gh pr view "$SENA_REPAIR_BRANCH" --repo HUDongpin/SENA --json number --jq .number)"
export SENA_REPAIR_PR_HEAD="$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json headRefOid --jq .headRefOid)"
test "$SENA_REPAIR_PR_HEAD" = "$SENA_REPAIR_SEED_HEAD"
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json isDraft --jq .isDraft)" = true
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json state --jq .state)" = OPEN
```

Expected: `SENA_REPAIR_PR_NUMBER` is a positive integer; expected current value
is 82, but execution must use the read-back value.

- [ ] **Step 5: Do not treat seed CI as implementation evidence**

Record the seed workflow run IDs for provenance, but label them
`design-plan-seed-only`. Do not write them into the initial implementation
completion evidence and do not mark the PR Ready.

## Task 2: Add the two-state protected repair lifecycle validator TDD-first

**Files:**
- Modify: `scripts/verify-sena-repo-governance.mjs:1390-2097`
- Test: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:2461-end`

- [ ] **Step 1: Write the failing lifecycle test**

Add this test beside the PR80 lifecycle test. Bind `actualPrNumber` to the Draft
PR number read in Task 1; never write literal `82` into the implementation.

```ts
it("fails closed across the protected currentness repair lifecycle", async () => {
  const governance = await import(pathToFileURL(governanceScript).href);
  const currentRegistry = JSON.parse(
    readFileSync(
      join(projectRoot, "coordination", "repo-governance", "active-work.json"),
      "utf8"
    )
  );
  const actualPrNumber = currentRegistry.workItems.find(
    (entry: { taskId?: string }) =>
      entry.taskId === "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901"
  ).prNumber;
  expect(Number.isInteger(actualPrNumber) && actualPrNumber > 0).toBe(true);

  const designPlanSeedHead = runGit(projectRoot, ["rev-parse", "HEAD"]);
  const designPlanSeedRegistry = JSON.parse(
    runGit(projectRoot, [
      "show",
      `${designPlanSeedHead}:coordination/repo-governance/active-work.json`
    ])
  );
  const initial = buildProtectedCurrentnessRepairInitialFixture(
    designPlanSeedRegistry,
    designPlanSeedHead,
    actualPrNumber
  );
  const final = buildProtectedCurrentnessRepairFinalFixture(initial);

  expect(() =>
    governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
      designPlanSeedRegistry,
      initial.registry,
      initial.context
    )
  ).not.toThrow();
  expect(() =>
    governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
      initial.registry,
      final.registry,
      final.context
    )
  ).not.toThrow();

  const replay = structuredClone(final.registry);
  expect(() =>
    governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
      final.registry,
      replay,
      final.context
    )
  ).toThrow("rule=protected-currentness-repair-transition-replay");

  const widened = structuredClone(final.registry);
  widened.workItems.find(
    (entry: { taskId?: string }) =>
      entry.taskId === "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901"
  ).future = { branchDeletionAuthorized: true };
  expect(() =>
    governance.protectedCurrentnessRepairLifecycleResolutionFromRegistries(
      initial.registry,
      widened,
      final.context
    )
  ).toThrow("rule=protected-currentness-repair-final-action-set-invalid");
});
```

Implement the two fixture builders in the test file with complete registry
objects. The seed registry already contains the separately named
`protectedCurrentnessActivationRepairDesignLifecycle`; the implementation
candidate adds `protectedCurrentnessActivationRepairLifecycle`, so the protected
PR80 history and the design-approval record remain immutable. Use these exact
builders:

```ts
const PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST = [
  "coordination/repo-governance/active-work.json",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md",
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];

function buildProtectedCurrentnessRepairInitialFixture(
  seedRegistry: any,
  seedHeadSha: string,
  pullRequestNumber: number
) {
  const registry = structuredClone(seedRegistry);
  const item = registry.workItems.find(
    (entry: { taskId?: string }) =>
      entry.taskId === "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901"
  );
  const branch = registry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-protected-currentness-activation-repair-20260901"
  );
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
  item.headSha = seedHeadSha;
  item.allowedPaths = PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST;
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
    requiredOverallPaths: PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE_FOR_TEST,
    requiredImplementationPaths: [
      "coordination/repo-governance/active-work.json",
      "scripts/verify-sena-repo-governance.mjs",
      "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
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
  branch.upstream =
    "origin/codex/sena-protected-currentness-activation-repair-20260901";
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

  const retirement = registry.workItems.find(
    (entry: { taskId?: string }) =>
      entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const handshake = retirement.finalBaseHandshakeAuthorization;
  handshake.status = "pending-protected-activation";
  handshake.authorizationSourceMainSha =
    "969a206b798c159e15ae0b6e5c76d0c94cca92ea";
  handshake.protectedActivationBinding = {
    mode: "loaded-fetched-origin-main-authorization-registry-commit",
    requiredReceiptKind:
      "pr82-protected-currentness-activation-repair-candidate",
    requiredFinalAuthorizationReceiptKind:
      "pr82-protected-currentness-activation-repair-final-authorization",
    requiredAuthorizationStatus: "pending-protected-activation",
    requiredActivationLifecycleStatus:
      "protected-currentness-activation-repair-ready-pending-final-head-checks",
    requiredActivationPullRequestNumber: pullRequestNumber,
    mustDescendFromAuthorizationSourceMainSha: true,
    mustEqualFetchedOriginMain: true,
    postMainBuildRequired: true,
    postMainSecurityRequired: true,
    postMainAnnotationsMustBeEmpty: true,
    commitBoundLiveAuditRequired: true
  };
  handshake.finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation = true;
  handshake.finalResolverAndTestStageAuthorizedAfterProtectedActivation = true;
  handshake.finalMergeCommitPushAuthorizedAfterRequiredGates = true;
  handshake.finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks = false;
  handshake.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks = false;
  registry.releaseReceipts.push({
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: "pr82-protected-currentness-activation-repair-candidate",
    taskId: item.taskId,
    ownerKey: item.ownerKey,
    scope: item.protectedCurrentnessActivationRepairLifecycle.requiredImplementationPaths,
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
  const item = registry.workItems.find(
    (entry: { taskId?: string }) =>
      entry.taskId === "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901"
  );
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
  const branch = registry.branches.find(
    (entry: { name?: string }) =>
      entry.name === "codex/sena-protected-currentness-activation-repair-20260901"
  );
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
    ...lifecycle.initialCandidateCompletionEvidence,
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
```

Their action sets must be:

```ts
const initialTrueActions = [
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks"
];
const finalTrueActions = [
  "repairReadyAndProtectedMergeAuthorizedAfterFinalChecks"
];
const permanentlyFalseActions = [
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
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts \
  -t "fails closed across the protected currentness repair lifecycle"
cd ..
```

Expected: FAIL because
`protectedCurrentnessRepairLifecycleResolutionFromRegistries` and the fixture
builders do not exist. A syntax error or missing environment variable is not an
acceptable RED.

- [ ] **Step 3: Implement the minimal lifecycle constants and recursive action scan**

Add beside the PR80 constants:

```js
const PROTECTED_CURRENTNESS_REPAIR_TASK_ID =
  "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901";
const PROTECTED_CURRENTNESS_REPAIR_BRANCH =
  "codex/sena-protected-currentness-activation-repair-20260901";
const PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY =
  "Codex-protected-currentness-activation-repair-01a05865";
const PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS =
  "protected-currentness-activation-repair-candidate-awaiting-initial-checks";
const PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS =
  "protected-currentness-activation-repair-ready-pending-final-head-checks";
const PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION =
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks";
const PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION =
  "repairReadyAndProtectedMergeAuthorizedAfterFinalChecks";
const PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT =
  "pr82-protected-currentness-activation-repair-candidate";
const PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT =
  "pr82-protected-currentness-activation-repair-final-authorization";
const PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE = [
  "coordination/repo-governance/active-work.json",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md",
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE = [
  "coordination/repo-governance/active-work.json",
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const PROTECTED_CURRENTNESS_REPAIR_FINAL_SCOPE = [REGISTRY_REPO_PATH];
const PROTECTED_CURRENTNESS_REPAIR_LIFECYCLE_KEYS = [
  "status",
  "oneShot",
  "pullRequestNumber",
  "protectedBaseSha",
  "protectedBaseTreeSha",
  "protectedBaseRegistryBlobSha",
  "designPlanSeedHeadSha",
  "designPlanSeedTreeSha",
  "designPlanSeedRegistryBlobSha",
  "designPlanSeedReceiptPrefix",
  "requiredOverallPaths",
  "requiredImplementationPaths",
  "initialCandidateCompletionEvidence",
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks",
  "repairReadyAndProtectedMergeAuthorizedAfterFinalChecks",
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

export function protectedCurrentnessRepairTrueAuthorizationPaths(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const paths = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (entry === true && key.includes("Authorized")) paths.push(nextPath.join("."));
    if (entry && typeof entry === "object") {
      paths.push(...protectedCurrentnessRepairTrueAuthorizationPaths(entry, nextPath));
    }
  }
  return paths.sort();
}
```

- [ ] **Step 4: Implement exact snapshot and transition validation**

Add a validator following these exact interfaces:

```js
export function validateProtectedCurrentnessRepairLifecycleSnapshot(registry, context = null) {
  const item = (registry.workItems ?? []).find(
    (entry) => entry.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  );
  const branch = (registry.branches ?? []).find(
    (entry) => entry.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH
  );
  const lifecycle = item?.protectedCurrentnessActivationRepairLifecycle;
  if (!item || !branch || !lifecycle) {
    throw new Error("rule=protected-currentness-repair-lifecycle-missing");
  }
  if (
    lifecycle.oneShot !== true ||
    !Number.isInteger(lifecycle.pullRequestNumber) ||
    lifecycle.pullRequestNumber <= 0 ||
    item.prNumber !== lifecycle.pullRequestNumber ||
    branch.pr !== lifecycle.pullRequestNumber ||
    branch.prBase !== "main" ||
    !isSha(lifecycle.protectedBaseSha) ||
    !isSha(lifecycle.protectedBaseTreeSha) ||
    !isSha(lifecycle.protectedBaseRegistryBlobSha) ||
    !isSha(lifecycle.designPlanSeedHeadSha) ||
    !isSha(lifecycle.designPlanSeedTreeSha) ||
    !isSha(lifecycle.designPlanSeedRegistryBlobSha) ||
    !Number.isInteger(lifecycle.designPlanSeedReceiptPrefix?.count) ||
    lifecycle.designPlanSeedReceiptPrefix.count < 0 ||
    !validSha256(lifecycle.designPlanSeedReceiptPrefix?.sha256) ||
    !sameStringSet(
      lifecycle.requiredOverallPaths ?? [],
      PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE
    ) ||
    !sameStringSet(
      lifecycle.requiredImplementationPaths ?? [],
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE
    ) ||
    !sameStringSet(Object.keys(lifecycle), PROTECTED_CURRENTNESS_REPAIR_LIFECYCLE_KEYS)
  ) {
    throw new Error("rule=protected-currentness-repair-lifecycle-core-invalid");
  }

  const truePaths = protectedCurrentnessRepairTrueAuthorizationPaths(lifecycle);
  if (lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS) {
    if (
      !sameStringSet(truePaths, [PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION]) ||
      lifecycle.initialCandidateCompletionEvidence !== null
    ) {
      throw new Error("rule=protected-currentness-repair-initial-action-set-invalid");
    }
  } else if (lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS) {
    if (!sameStringSet(truePaths, [PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION])) {
      throw new Error("rule=protected-currentness-repair-final-action-set-invalid");
    }
    validateProtectedCurrentnessRepairInitialEvidence(
      lifecycle.initialCandidateCompletionEvidence,
      context
    );
  } else {
    throw new Error("rule=protected-currentness-repair-status-invalid");
  }
  return { item, branch, lifecycle };
}

export function protectedCurrentnessRepairLifecycleResolutionFromRegistries(
  sourceRegistry,
  candidateRegistry,
  context = {}
) {
  const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(
    candidateRegistry,
    context
  );
  const sourceItem = (sourceRegistry.workItems ?? []).find(
    (entry) => entry.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  );
  const sourceLifecycle = sourceItem?.protectedCurrentnessActivationRepairLifecycle;

  if (!sourceLifecycle) {
    if (candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS) {
      throw new Error("rule=protected-currentness-repair-transition-source-invalid");
    }
    validateProtectedCurrentnessRepairInitialDelta(sourceRegistry, candidateRegistry, context);
    return candidate;
  }
  if (sourceLifecycle.status === PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS) {
    throw new Error("rule=protected-currentness-repair-transition-replay");
  }
  if (
    sourceLifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS ||
    candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS
  ) {
    throw new Error("rule=protected-currentness-repair-transition-source-invalid");
  }
  validateProtectedCurrentnessRepairFinalDelta(sourceRegistry, candidateRegistry, context);
  return candidate;
}
```

`validateProtectedCurrentnessRepairInitialDelta` and
`validateProtectedCurrentnessRepairFinalDelta` must perform all of the following
with exact JSON or set equality, not truthiness:

```js
const requiredInitialChecks = {
  sourceMatchesExactDesignPlanSeed: true,
  protectedBaseEvidenceRemainsExact969a206: true,
  protectedReceiptPrefixByteEquivalent: true,
  candidateAddsExactlyOneInitialReceipt: true,
  candidateOverallPathsExact: true,
  candidateImplementationPathsExact: true,
  actualPrNumberMatchesWorkItemBranchAndLifecycle: true,
  downstreamActivationBindingMatchesActualPrNumber: true,
  unknownTrueAuthorizationFailsClosed: true
};
const requiredFinalChecks = {
  sourceIsExactInitialCandidateHead: true,
  candidateChangesOnlyRegistry: true,
  candidateAddsExactlyOneFinalReceipt: true,
  lifecycleCoreByteEquivalent: true,
  onlyInitialEvidenceAndStateActionsMayChange: true,
  workItemBranchRemoteAndPrHeadRemainInitialCandidateHead: true,
  prRemainsOpenDraftMergeableCleanBeforeReady: true,
  initialRunAndJobIdsAreDistinctPositiveIntegers: true,
  initialChecksAndReviewsPassed: true,
  replayFailsClosed: true
};
```

Implement the helpers referenced above with these exact contracts:

```js
function validateProtectedCurrentnessRepairInitialEvidence(evidence, context) {
  if (
    !evidence ||
    !["headSha", "treeSha", "registryBlobSha", "verifierBlobSha", "governanceTestBlobSha"]
      .every((field) => isSha(evidence[field])) ||
    !Number.isInteger(evidence.buildRunId) ||
    evidence.buildRunId <= 0 ||
    !exactDistinctPositiveIntegerArray(evidence.repositorySecurityRunIds, 2) ||
    !exactDistinctPositiveIntegerArray(evidence.checkJobIds, 3) ||
    evidence.requiredChecksPassed !== true ||
    evidence.annotationsEmpty !== true ||
    evidence.specReviewApproved !== true ||
    evidence.qualityReviewApproved !== true ||
    !context ||
    context.headSha !== evidence.headSha ||
    context.treeSha !== evidence.treeSha ||
    context.registryBlobSha !== evidence.registryBlobSha ||
    context.verifierBlobSha !== evidence.verifierBlobSha ||
    context.governanceTestBlobSha !== evidence.governanceTestBlobSha ||
    context.buildRunId !== evidence.buildRunId ||
    !sameJson(context.repositorySecurityRunIds, evidence.repositorySecurityRunIds) ||
    !sameJson(context.checkJobIds, evidence.checkJobIds) ||
    context.requiredChecksPassed !== true ||
    context.annotationsEmpty !== true ||
    context.specReviewApproved !== true ||
    context.qualityReviewApproved !== true
  ) {
    throw new Error("rule=protected-currentness-repair-final-evidence-invalid");
  }
}

function repairReceiptPrefixSha256(receipts, count) {
  return sha256Buffer(Buffer.from(JSON.stringify(receipts.slice(0, count))));
}

const REPAIR_INITIAL_MUTABLE_RECORDS = {
  repairWorkItem: [
    "headSha", "aheadBehind", "allowedPaths", "lastHeartbeatAt", "lastObservedAt",
    "nextReviewAt", "expectedCloseAt", "prNumber", "plannedPullRequestNumber",
    "prIsDraft", "prReadyForReview", "mergeAuthorized", "noPrReason", "dirtyState",
    "evidenceState", "protectedCurrentnessActivationRepairLifecycle"
  ],
  repairBranch: [
    "headSha", "upstream", "upstreamState", "upstreamCacheState", "remotePresent",
    "remoteHeadSha", "remoteObservedAt", "pr", "plannedPullRequestNumber", "prState",
    "prStateObservationMode", "prIsDraft", "prReadyForReview", "mergeAuthorized",
    "prHeadSha", "prBase", "noPrReason", "lastOwnerHeartbeatAt", "lastObservedAt",
    "lastCommitAt", "nextReviewAt", "expectedCloseAt", "closeout", "mergeable",
    "mergeStateStatus"
  ],
  a01WorkItem: ["aheadBehindObservationMode", "lastObservedAt", "nextReviewAt", "evidenceState"],
  pr81WorkItem: ["aheadBehindObservationMode", "lastObservedAt", "nextReviewAt", "evidenceState"],
  pr81Branch: ["prStateObservationMode", "lastObservedAt", "nextReviewAt", "closeout"],
  branchRetirementWorkItem: [
    "finalBaseHandshakeAuthorization", "lastObservedAt", "nextReviewAt", "evidenceState"
  ],
  branchRetirementBranch: [
    "prStateObservationMode", "lastObservedAt", "nextReviewAt", "closeout"
  ],
  rootWorkItem: ["lastObservedAt", "nextReviewAt", "evidenceState"],
  rootBranch: ["lastObservedAt", "nextReviewAt", "closeout"]
};

function redactFields(record, fields, label) {
  const copy = structuredClone(record ?? {});
  for (const field of fields) copy[field] = `<${label}:${field}>`;
  return copy;
}

function normalizedRepairInitialImmutableRegistrySha256(registry) {
  const copy = structuredClone(registry);
  copy.updatedAt = "<repair-owned>";
  copy.workItems = (copy.workItems ?? []).map((entry) => {
    if (entry.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID) {
      return redactFields(entry, REPAIR_INITIAL_MUTABLE_RECORDS.repairWorkItem, "repair-item");
    }
    if (entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827") {
      return redactFields(entry, REPAIR_INITIAL_MUTABLE_RECORDS.a01WorkItem, "a01-item");
    }
    if (entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901") {
      return redactFields(entry, REPAIR_INITIAL_MUTABLE_RECORDS.pr81WorkItem, "pr81-item");
    }
    if (entry.taskId === "SENA-BRANCH-RETIREMENT-20260829") {
      return redactFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.branchRetirementWorkItem,
        "pr46-item"
      );
    }
    if (entry.taskId === "SENA-A01-ROOT-CONTROL-PLANE-20260828") {
      return redactFields(entry, REPAIR_INITIAL_MUTABLE_RECORDS.rootWorkItem, "root-item");
    }
    return entry;
  });
  copy.branches = (copy.branches ?? []).map((entry) => {
    if (entry.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH) {
      return redactFields(entry, REPAIR_INITIAL_MUTABLE_RECORDS.repairBranch, "repair-branch");
    }
    if (entry.name === "codex/sena-pr80-post-main-closeout-20260901") {
      return redactFields(entry, REPAIR_INITIAL_MUTABLE_RECORDS.pr81Branch, "pr81-branch");
    }
    if (entry.name === "codex/sena-branch-retirement-20260829") {
      return redactFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.branchRetirementBranch,
        "pr46-branch"
      );
    }
    if (entry.name === "main") {
      return redactFields(entry, REPAIR_INITIAL_MUTABLE_RECORDS.rootBranch, "root-branch");
    }
    return entry;
  });
  copy.releaseReceipts = (copy.releaseReceipts ?? []).filter(
    (entry) => ![
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
    ].includes(entry?.receiptKind)
  );
  return sha256Buffer(Buffer.from(JSON.stringify(copy)));
}

function validateProtectedCurrentnessRepairInitialDelta(sourceRegistry, candidateRegistry, context) {
  const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(candidateRegistry);
  const lifecycle = candidate.lifecycle;
  const sourceReceipts = sourceRegistry.releaseReceipts ?? [];
  const candidateReceipts = candidateRegistry.releaseReceipts ?? [];
  if (
    !context ||
    context.seedHeadSha !== lifecycle.designPlanSeedHeadSha ||
    context.seedTreeSha !== lifecycle.designPlanSeedTreeSha ||
    context.seedRegistryBlobSha !== lifecycle.designPlanSeedRegistryBlobSha ||
    lifecycle.protectedBaseSha !== "969a206b798c159e15ae0b6e5c76d0c94cca92ea" ||
    lifecycle.designPlanSeedReceiptPrefix.count !== sourceReceipts.length ||
    repairReceiptPrefixSha256(
      sourceReceipts,
      lifecycle.designPlanSeedReceiptPrefix.count
    ) !== lifecycle.designPlanSeedReceiptPrefix.sha256 ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) => sameJson(receipt, candidateReceipts[index])) ||
    candidateReceipts.at(-1)?.receiptKind !== PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT ||
    candidateReceipts.at(-1)?.taskId !== PROTECTED_CURRENTNESS_REPAIR_TASK_ID ||
    candidateReceipts.at(-1)?.ownerKey !== PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY ||
    !sameStringSet(
      candidateReceipts.at(-1)?.scope ?? [],
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE
    ) ||
    !sameStringSet(
      protectedCurrentnessRepairTrueAuthorizationPaths(candidateReceipts.at(-1)),
      [`authorizationBoundary.${PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION}`]
    ) ||
    context.pullRequestNumber !== lifecycle.pullRequestNumber ||
    normalizedRepairInitialImmutableRegistrySha256(sourceRegistry) !==
      normalizedRepairInitialImmutableRegistrySha256(candidateRegistry)
  ) {
    throw new Error("rule=protected-currentness-repair-initial-delta-invalid");
  }
}

function normalizedRepairFinalImmutableRegistrySha256(registry) {
  const copy = structuredClone(registry);
  copy.updatedAt = "<repair-final-owned>";
  const finalItemFields = [
    "headSha", "aheadBehind", "lastHeartbeatAt", "lastObservedAt", "nextReviewAt",
    "dirtyState", "evidenceState"
  ];
  const finalLifecycleFields = [
    "status",
    "initialCandidateCompletionEvidence",
    PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION
  ];
  const finalBranchFields = [
    "headSha", "remoteHeadSha", "remoteObservedAt", "prState", "prIsDraft",
    "prReadyForReview", "mergeAuthorized", "prHeadSha", "lastOwnerHeartbeatAt",
    "lastObservedAt", "lastCommitAt", "nextReviewAt", "closeout", "mergeable",
    "mergeStateStatus"
  ];
  copy.workItems = (copy.workItems ?? []).map((entry) => {
    if (entry.taskId !== PROTECTED_CURRENTNESS_REPAIR_TASK_ID) return entry;
    const withLifecycle = {
      ...entry,
      protectedCurrentnessActivationRepairLifecycle: redactFields(
        entry.protectedCurrentnessActivationRepairLifecycle,
        finalLifecycleFields,
        "repair-final-lifecycle"
      )
    };
    return redactFields(withLifecycle, finalItemFields, "repair-final-item");
  });
  copy.branches = (copy.branches ?? []).map((entry) =>
    entry.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH
      ? redactFields(entry, finalBranchFields, "repair-final-branch")
      : entry
  );
  copy.releaseReceipts = (copy.releaseReceipts ?? []).filter(
    (entry) => entry?.receiptKind !== PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  );
  return sha256Buffer(Buffer.from(JSON.stringify(copy)));
}

function validateProtectedCurrentnessRepairFinalDelta(sourceRegistry, candidateRegistry, context) {
  const source = validateProtectedCurrentnessRepairLifecycleSnapshot(sourceRegistry);
  const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(
    candidateRegistry,
    context
  );
  const sourceReceipts = sourceRegistry.releaseReceipts ?? [];
  const candidateReceipts = candidateRegistry.releaseReceipts ?? [];
  if (
    source.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS ||
    candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) => sameJson(receipt, candidateReceipts[index])) ||
    candidateReceipts.at(-1)?.receiptKind !== PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT ||
    candidateReceipts.at(-1)?.taskId !== PROTECTED_CURRENTNESS_REPAIR_TASK_ID ||
    candidateReceipts.at(-1)?.ownerKey !== PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY ||
    !sameStringSet(
      candidateReceipts.at(-1)?.scope ?? [],
      PROTECTED_CURRENTNESS_REPAIR_FINAL_SCOPE
    ) ||
    !sameStringSet(
      protectedCurrentnessRepairTrueAuthorizationPaths(candidateReceipts.at(-1)),
      [`authorizationBoundary.${PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION}`]
    ) ||
    normalizedRepairFinalImmutableRegistrySha256(sourceRegistry) !==
      normalizedRepairFinalImmutableRegistrySha256(candidateRegistry)
  ) {
    throw new Error("rule=protected-currentness-repair-final-delta-invalid");
  }
  validateProtectedCurrentnessRepairInitialEvidence(
    candidate.lifecycle.initialCandidateCompletionEvidence,
    context
  );
}

function protectedCurrentnessRepairObservationContextFromEnvironment(seedHeadSha) {
  return {
    seedHeadSha,
    seedTreeSha: gitText(["rev-parse", `${seedHeadSha}^{tree}`]).trim(),
    seedRegistryBlobSha: gitText([
      "rev-parse",
      `${seedHeadSha}:${REGISTRY_REPO_PATH}`
    ]).trim(),
    pullRequestNumber: Number(process.env.SENA_REPAIR_PR_NUMBER),
    headSha: process.env.SENA_REPAIR_INITIAL_HEAD,
    treeSha: process.env.SENA_REPAIR_INITIAL_TREE,
    registryBlobSha: process.env.SENA_REPAIR_INITIAL_REGISTRY_BLOB,
    verifierBlobSha: process.env.SENA_REPAIR_INITIAL_VERIFIER_BLOB,
    governanceTestBlobSha: process.env.SENA_REPAIR_INITIAL_TEST_BLOB,
    buildRunId: Number(process.env.SENA_REPAIR_INITIAL_BUILD_RUN_ID),
    repositorySecurityRunIds: String(
      process.env.SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS ?? ""
    ).split(",").filter(Boolean).map(Number),
    checkJobIds: String(process.env.SENA_REPAIR_INITIAL_CHECK_JOB_IDS ?? "")
      .split(",").filter(Boolean).map(Number),
    requiredChecksPassed: process.env.SENA_REPAIR_INITIAL_REQUIRED_CHECKS_PASSED === "true",
    annotationsEmpty: process.env.SENA_REPAIR_INITIAL_ANNOTATIONS_EMPTY === "true",
    specReviewApproved: process.env.SENA_REPAIR_INITIAL_SPEC_REVIEW_APPROVED === "true",
    qualityReviewApproved: process.env.SENA_REPAIR_INITIAL_QUALITY_REVIEW_APPROVED === "true"
  };
}
```

- [ ] **Step 5: Wire source-to-index enforcement for this branch**

Call a new `validateProtectedCurrentnessRepairIndexTransition(candidateRegistry)`
from `runWritePolicy`. It must:

```js
function validateProtectedCurrentnessRepairIndexTransition(candidateRegistry) {
  const branchName = gitText(["branch", "--show-current"]).trim();
  if (branchName !== PROTECTED_CURRENTNESS_REPAIR_BRANCH) return;
  const headSha = gitText(["rev-parse", "HEAD"]).trim();
  const sourceRegistry = loadRegistryFromCommit(headSha).parsed;
  const lifecycle = (candidateRegistry.workItems ?? []).find(
    (entry) => entry.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  )?.protectedCurrentnessActivationRepairLifecycle;
  const expected = lifecycle?.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS
    ? PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE
    : lifecycle?.status === PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS
      ? PROTECTED_CURRENTNESS_REPAIR_FINAL_SCOPE
      : null;
  if (!expected) throw new Error("rule=protected-currentness-repair-status-invalid");
  const staged = stagedChangedPaths();
  if (!sameStringSet(staged, expected)) {
    throw new Error("rule=protected-currentness-repair-index-path-set-mismatch");
  }
  protectedCurrentnessRepairLifecycleResolutionFromRegistries(
    sourceRegistry,
    candidateRegistry,
    protectedCurrentnessRepairObservationContextFromEnvironment(headSha)
  );
}
```

- [ ] **Step 6: Run the focused lifecycle test and verify GREEN**

Use the same command as Step 2.

Expected: PASS for the focused test; the full file may still fail because the
remaining new RED tests have not yet been implemented.

## Task 3: Separate integrated monotonic-behind observation from deletion authority

**Files:**
- Modify: `scripts/verify-sena-repo-governance.mjs:2425-2495,2765-2820,3390-3410`
- Test: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:535-620`

- [ ] **Step 1: Write the pure behavior and integration RED tests**

```ts
it("permits only non-destructive integrated monotonic-behind observations", async () => {
  const governance = await import(pathToFileURL(governanceScript).href);
  const baseItem = {
    disposition: "integrated",
    aheadBehindObservationMode: "integrated-monotonic-behind",
    headSha: "a".repeat(40),
    aheadBehind: { baseRef: "origin/main", ahead: 0, behind: 1 },
    lastMergedPullRequest: {
      headSha: "a".repeat(40),
      mergeCommitSha: "b".repeat(40),
      postMainChecksPassed: true
    }
  };
  expect(governance.integratedMonotonicBehindShapeAllowed(
    baseItem,
    "a".repeat(40),
    { baseRef: "origin/main", ahead: 0, behind: 4 }
  )).toBe(true);
  for (const mutate of [
    (item: any) => { item.disposition = "active"; },
    (item: any) => { item.aheadBehindObservationMode = "unknown"; },
    (item: any) => { item.aheadBehind.ahead = 1; },
    (item: any) => { item.lastMergedPullRequest.headSha = "c".repeat(40); }
  ]) {
    const candidate = structuredClone(baseItem);
    mutate(candidate);
    expect(governance.integratedMonotonicBehindShapeAllowed(
      candidate,
      "a".repeat(40),
      { baseRef: "origin/main", ahead: 0, behind: 4 }
    )).toBe(false);
  }
  expect(baseItem).not.toHaveProperty("cleanupAuthorization");
});
```

Extend the real-git fixture used by the existing integrated-cleanup test. Create
an integrated topic head, advance `origin/main`, set the new observation mode,
omit `cleanupAuthorization`, and assert the audit emits only:

```ts
"integrated lane fell farther behind protected main without changing head: SENA-GOVERNANCE-TEST-WRITER"
```

Then mutate the topic head and assert the audit errors.

- [ ] **Step 2: Run and verify RED**

```bash
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts \
  -t "permits only non-destructive integrated monotonic-behind observations"
cd ..
```

Expected: FAIL because `integratedMonotonicBehindShapeAllowed` is absent.

- [ ] **Step 3: Implement the pure shape predicate and ancestry wrapper**

```js
export function integratedMonotonicBehindShapeAllowed(item, actualHeadSha, observed) {
  const recorded = item?.aheadBehind;
  const merged = item?.lastMergedPullRequest;
  return Boolean(
    item?.aheadBehindObservationMode === "integrated-monotonic-behind" &&
    item.disposition === "integrated" &&
    recorded?.baseRef === "origin/main" &&
    observed?.baseRef === recorded.baseRef &&
    actualHeadSha === item.headSha &&
    recorded.ahead === 0 &&
    observed.ahead === 0 &&
    observed.behind >= recorded.behind &&
    merged?.headSha === item.headSha &&
    merged?.postMainChecksPassed === true &&
    isSha(merged?.mergeCommitSha) &&
    item.cleanupAuthorization === undefined
  );
}

function integratedMonotonicBehindObservationAllowed(item, actualHeadSha, observed) {
  if (!integratedMonotonicBehindShapeAllowed(item, actualHeadSha, observed)) return false;
  return (
    git(["merge-base", "--is-ancestor", actualHeadSha, "origin/main"], {
      allowFailure: true
    }).status === 0 &&
    git(["merge-base", "--is-ancestor", item.lastMergedPullRequest.mergeCommitSha, "origin/main"], {
      allowFailure: true
    }).status === 0
  );
}
```

In `validateRegistry`, reject any defined mode except the exact string and reject
the mode unless the item is integrated and lacks cleanup authorization.

In `runAudit`, call this helper after the root-specific helpers and before the
cleanup helper. Emit the exact warning from Step 1.

- [ ] **Step 4: Run focused and existing cleanup tests**

```bash
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts \
  -t "monotonic-behind|integrated cleanup targets"
cd ..
```

Expected: both non-destructive observation and cleanup-authorized behavior pass;
the two authorities remain distinguishable.

## Task 4: Validate exact protected-main advance chains before and after root fast-forward

**Files:**
- Modify: `scripts/verify-sena-repo-governance.mjs:2813-2885,3310-3410`
- Test: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:430-535`

- [ ] **Step 1: Write the exact-chain RED fixture**

Build a temporary repository with:

1. recorded root `R`;
2. registry-only PR closeout merge `M1 = [R, H1]`;
3. repair merge `M2 = [M1, H2]` whose second parent contains a final repair
   lifecycle and exact registry/verifier/test/spec/plan path set.

Test both local states:

```ts
expect(auditBeforeFastForward.errors).not.toContain(
  "workItem ahead/behind differs from registry: SENA-A01-ROOT-CONTROL-PLANE-20260828"
);
expect(auditAfterFastForward.errors).not.toContain("branch head differs from registry: main");
expect(auditAfterFastForward.errors).not.toContain(
  "workItem headSha is not a permitted forward-only allowed-path advance: SENA-A01-ROOT-CONTROL-PLANE-20260828"
);
```

Create one mutation per failure rule and require rejection:

```ts
const rejectedRules = [
  "protected-advance-parent-count",
  "protected-advance-first-parent-order",
  "protected-advance-second-parent-pr-head",
  "protected-advance-tree-mismatch",
  "protected-advance-registry-blob-mismatch",
  "protected-advance-path-set-mismatch",
  "protected-advance-lifecycle-unrecognized",
  "protected-advance-pr-number-mismatch",
  "protected-advance-first-parent-chain-mismatch"
];
```

- [ ] **Step 2: Run and verify RED**

```bash
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts \
  -t "validates exact protected-main advance chains"
cd ..
```

Expected: FAIL because the chain resolver is absent and the current root helper
accepts only registry-only ranges.

- [ ] **Step 3: Implement lifecycle descriptors**

```js
function protectedAdvanceReceiptKindsMatch(registry, expectedKinds) {
  const actual = (registry.releaseReceipts ?? [])
    .map((entry) => entry?.receiptKind)
    .filter((kind) => expectedKinds.includes(kind));
  return sameJson(actual, expectedKinds);
}

function protectedAdvanceBranchMatches(registry, item, branchName, pullRequestNumber, secondParentSha) {
  const branch = (registry.branches ?? []).find((entry) => entry.name === branchName);
  if (
    !item ||
    !branch ||
    branch.pr !== pullRequestNumber ||
    branch.prBase !== "main" ||
    branch.prStateObservationMode !== "monotonic" ||
    !isSha(branch.prHeadSha)
  ) {
    return false;
  }
  const headMatches = branch.prHeadSha === secondParentSha;
  const forwardMatches = ACTIVE_WRITE_DISPOSITIONS.has(item.disposition) &&
    permittedActiveAdvance(branch.prHeadSha, secondParentSha, item);
  return headMatches || forwardMatches;
}

function protectedAdvanceDescriptor(registry, secondParentSha) {
  const pr81 = (registry.workItems ?? []).find(
    (entry) => entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901"
  );
  if (
    pr81?.lastMergedPullRequest?.headSha === secondParentSha &&
    pr81.pr81PostMainCurrentnessCloseoutLifecycle?.status ===
      "pr81-post-main-currentness-closeout-final-ready-pending-head-checks" &&
    protectedAdvanceBranchMatches(
      registry,
      pr81,
      "codex/sena-pr80-post-main-closeout-20260901",
      81,
      secondParentSha
    ) &&
    protectedAdvanceReceiptKindsMatch(registry, [
      "pr81-post-main-currentness-closeout-authorization-candidate",
      "pr81-post-main-currentness-closeout-final-authorization"
    ])
  ) {
    return {
      kind: "pr81-registry-closeout",
      pullRequestNumber: 81,
      expectedPaths: [REGISTRY_REPO_PATH],
      expectedHeadSha: secondParentSha
    };
  }

  const repair = (registry.workItems ?? []).find(
    (entry) => entry.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  );
  const repairLifecycle = repair?.protectedCurrentnessActivationRepairLifecycle;
  if (
    repairLifecycle?.status === PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS &&
    repairLifecycle.repairReadyAndProtectedMergeAuthorizedAfterFinalChecks === true &&
    protectedAdvanceBranchMatches(
      registry,
      repair,
      PROTECTED_CURRENTNESS_REPAIR_BRANCH,
      repairLifecycle.pullRequestNumber,
      secondParentSha
    ) &&
    protectedAdvanceReceiptKindsMatch(registry, [
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
    ])
  ) {
    return {
      kind: "protected-currentness-repair",
      pullRequestNumber: repairLifecycle.pullRequestNumber,
      expectedPaths: repairLifecycle.requiredOverallPaths,
      expectedHeadSha: secondParentSha
    };
  }

  const retirement = (registry.workItems ?? []).find(
    (entry) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const handshake = retirement?.finalBaseHandshakeAuthorization;
  if (
    handshake?.status === "final-pr46-ready-authorization-pending-final-head-checks" &&
    handshake.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks === true &&
    protectedAdvanceBranchMatches(
      registry,
      retirement,
      "codex/sena-branch-retirement-20260829",
      46,
      secondParentSha
    ) &&
    protectedAdvanceReceiptKindsMatch(registry, [
      "pr46-final-base-handshake-remerge-candidate",
      "pr46-final-base-handshake-final-authorization"
    ])
  ) {
    return {
      kind: "pr46-final-base-handshake",
      pullRequestNumber: 46,
      expectedPaths: handshake.authorizedResolverTransition.finalReadyState
        .requiredOverallChangedPathsFromProtectedMain,
      expectedHeadSha: secondParentSha
    };
  }
  return null;
}
```

- [ ] **Step 4: Implement the chain resolver**

```js
export function protectedMainAdvanceChainResolution(registry, fromSha, toSha) {
  if (!isSha(fromSha) || !isSha(toSha)) {
    return { ok: false, rule: "protected-advance-sha-invalid" };
  }
  if (fromSha === toSha) return { ok: true, merges: [] };
  if (git(["merge-base", "--is-ancestor", fromSha, toSha], { allowFailure: true }).status !== 0) {
    return { ok: false, rule: "protected-advance-first-parent-chain-mismatch" };
  }
  const commits = gitText(["rev-list", "--first-parent", "--reverse", `${fromSha}..${toSha}`])
    .split("\n")
    .filter(Boolean);
  let previous = fromSha;
  const merges = [];
  for (const commit of commits) {
    const parents = gitText(["rev-list", "--parents", "-n", "1", commit])
      .trim()
      .split(/\s+/)
      .slice(1);
    if (parents.length !== 2) return { ok: false, rule: "protected-advance-parent-count" };
    if (parents[0] !== previous) {
      return { ok: false, rule: "protected-advance-first-parent-order" };
    }
    const commitRegistry = loadRegistryFromCommit(commit).parsed;
    const descriptor = protectedAdvanceDescriptor(commitRegistry, parents[1]);
    if (!descriptor) return { ok: false, rule: "protected-advance-lifecycle-unrecognized" };
    if (exactTreeSha(commit) !== exactTreeSha(parents[1])) {
      return { ok: false, rule: "protected-advance-tree-mismatch" };
    }
    if (exactBlobSha(commit, REGISTRY_REPO_PATH) !== exactBlobSha(parents[1], REGISTRY_REPO_PATH)) {
      return { ok: false, rule: "protected-advance-registry-blob-mismatch" };
    }
    if (!sameStringSet(changedPathsAcrossCommitRange(parents[0], commit), descriptor.expectedPaths)) {
      return { ok: false, rule: "protected-advance-path-set-mismatch" };
    }
    merges.push({ commit, parents, descriptor });
    previous = commit;
  }
  if (previous !== toSha) {
    return { ok: false, rule: "protected-advance-first-parent-chain-mismatch" };
  }
  return { ok: true, merges };
}
```

Live `OPEN -> MERGED` is checked by the
existing live-PR audit against the current registry's monotonic branch record;
the chain resolver must not duplicate or weaken that check. The negative fixture
must fail when branch name, base, PR number, recorded/allowed-forward head,
observation mode, or receipt order changes.

- [ ] **Step 5: Route both root helpers through the resolver**

Replace the registry-only path check in both root helpers with:

```js
const targetMainSha = gitText(["rev-parse", "origin/main"]).trim();
const resolution = protectedMainAdvanceChainResolution(
  registry,
  item.headSha,
  targetMainSha
);
return resolution.ok && (
  actualHeadSha === item.headSha ||
  actualHeadSha === targetMainSha
);
```

Pass `registry` into both helpers and preserve every existing root identity,
physical-custody, clean-state, fast-forward, and live/cached-main precondition.

- [ ] **Step 6: Run focused root tests and verify GREEN**

```bash
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts \
  -t "protected-main advance chains|integrated read-only root"
cd ..
```

Expected: exact-chain and prior registry-only cases pass; product-path and all
topology mutations fail.

## Task 5: Establish and verify the protected activation identity PR46 must consume

**Files:**
- Modify: `scripts/verify-sena-repo-governance.mjs:82-130,1390-2097`
- Test: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:2461-end`
- Modify: `coordination/repo-governance/active-work.json`

- [ ] **Step 1: Write the activation matcher RED test**

```ts
it("matches protected activation evidence only to the bound positive PR identity", async () => {
  const governance = await import(pathToFileURL(governanceScript).href);
  const currentRegistry = JSON.parse(
    readFileSync(
      join(projectRoot, "coordination", "repo-governance", "active-work.json"),
      "utf8"
    )
  );
  const actualPrNumber = currentRegistry.workItems.find(
    (entry: { taskId?: string }) =>
      entry.taskId === "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901"
  ).prNumber;
  expect(Number.isInteger(actualPrNumber) && actualPrNumber > 0).toBe(true);
  const binding = { requiredActivationPullRequestNumber: actualPrNumber };
  const actual = {
    finalHeadSha: "a".repeat(40),
    protectedMainSha: "b".repeat(40),
    protectedMainTreeSha: "c".repeat(40),
    protectedRegistryBlobSha: "d".repeat(40)
  };
  const evidence = {
    pullRequestNumber: actualPrNumber,
    finalHeadSha: actual.finalHeadSha,
    protectedMainSha: actual.protectedMainSha,
    protectedMainTreeSha: actual.protectedMainTreeSha,
    protectedRegistryBlobSha: actual.protectedRegistryBlobSha,
    postMainBuildRunId: 1,
    postMainBuildCheckJobId: 2,
    postMainRepositorySecurityRunId: 3,
    postMainRepositorySecurityCheckJobId: 4,
    requiredChecksPassed: true,
    annotationsEmpty: true,
    commitBoundLiveAuditStatus: "pass",
    auditErrors: [],
    auditOwnerBlockers: [],
    unreachableCommitCount: 0
  };
  expect(governance.protectedActivationCompletionEvidenceMatches(
    binding,
    evidence,
    actual
  )).toBe(true);
  expect(governance.protectedActivationCompletionEvidenceMatches(
    { ...binding, requiredActivationPullRequestNumber: actualPrNumber + 1 },
    evidence,
    actual
  )).toBe(false);
  expect(governance.protectedActivationCompletionEvidenceMatches(
    binding,
    { ...evidence, auditErrors: ["drift"] },
    actual
  )).toBe(false);
});
```

The committed test therefore reads the protected registry and never assumes the
allocation or requires an external test environment variable.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because `protectedActivationCompletionEvidenceMatches` is absent.

- [ ] **Step 3: Implement the pure matcher**

```js
export function protectedActivationCompletionEvidenceMatches(binding, evidence, actual) {
  const requiredPr = binding?.requiredActivationPullRequestNumber;
  return Boolean(
    Number.isInteger(requiredPr) &&
    requiredPr > 0 &&
    evidence &&
    actual &&
    evidence.pullRequestNumber === requiredPr &&
    evidence.finalHeadSha === actual.finalHeadSha &&
    evidence.protectedMainSha === actual.protectedMainSha &&
    evidence.protectedMainTreeSha === actual.protectedMainTreeSha &&
    evidence.protectedRegistryBlobSha === actual.protectedRegistryBlobSha &&
    Number.isInteger(evidence.postMainBuildRunId) &&
    evidence.postMainBuildRunId > 0 &&
    Number.isInteger(evidence.postMainBuildCheckJobId) &&
    evidence.postMainBuildCheckJobId > 0 &&
    Number.isInteger(evidence.postMainRepositorySecurityRunId) &&
    evidence.postMainRepositorySecurityRunId > 0 &&
    Number.isInteger(evidence.postMainRepositorySecurityCheckJobId) &&
    evidence.postMainRepositorySecurityCheckJobId > 0 &&
    evidence.requiredChecksPassed === true &&
    evidence.annotationsEmpty === true &&
    evidence.commitBoundLiveAuditStatus === "pass" &&
    Array.isArray(evidence.auditErrors) &&
    evidence.auditErrors.length === 0 &&
    Array.isArray(evidence.auditOwnerBlockers) &&
    evidence.auditOwnerBlockers.length === 0 &&
    evidence.unreachableCommitCount === 0
  );
}
```

- [ ] **Step 4: Make the protected repair lifecycle own the rebinding delta**

The initial registry transition must replace only these PR46-owned activation
fields from the protected source:

```json
{
  "status": "pending-protected-activation",
  "authorizationSourceMainSha": "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
  "protectedActivationBinding": {
    "mode": "loaded-fetched-origin-main-authorization-registry-commit",
    "requiredReceiptKind": "pr82-protected-currentness-activation-repair-candidate",
    "requiredFinalAuthorizationReceiptKind": "pr82-protected-currentness-activation-repair-final-authorization",
    "requiredAuthorizationStatus": "pending-protected-activation",
    "requiredActivationLifecycleStatus": "protected-currentness-activation-repair-ready-pending-final-head-checks",
    "requiredActivationPullRequestNumber": 82,
    "mustDescendFromAuthorizationSourceMainSha": true,
    "mustEqualFetchedOriginMain": true,
    "postMainBuildRequired": true,
    "postMainSecurityRequired": true,
    "postMainAnnotationsMustBeEmpty": true,
    "commitBoundLiveAuditRequired": true
  },
  "finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation": true,
  "finalResolverAndTestStageAuthorizedAfterProtectedActivation": true,
  "finalMergeCommitPushAuthorizedAfterRequiredGates": true,
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks": false,
  "pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks": false
}
```

At execution, substitute the actual positive `SENA_REPAIR_PR_NUMBER` for the
displayed expected value 82. The protected repair transition validator must
compare the entire old and new branch-retirement record and reject every change
outside the exact activation-binding allowlist and currentness timestamps/text.

Construct and validate that exact delta in the protected verifier:

```js
const PR46_PROTECTED_ONLY_AFTER_REPAIR = [
  "coordination/repo-governance/pr46-final-ready-repair-design.md",
  "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md"
];

export function expectedProtectedPr46ActivationRebinding(sourceAuthorization, repairPrNumber) {
  if (!Number.isInteger(repairPrNumber) || repairPrNumber <= 0) {
    throw new Error("rule=protected-currentness-repair-activation-pr-invalid");
  }
  return {
    ...sourceAuthorization,
    authorizationSourceMainSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    authorizationSourceMainTreeSha: "c3d3d91ff7868939cb331a8c237349d6abbd9357",
    authorizationSourceRegistryBlobSha: "b0f4bfd1f35d816e22774458a4bc1593c29a745b",
    protectedActivationBinding: {
      mode: "loaded-fetched-origin-main-authorization-registry-commit",
      requiredReceiptKind: PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      requiredFinalAuthorizationReceiptKind: PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT,
      requiredAuthorizationStatus: "pending-protected-activation",
      requiredActivationLifecycleStatus: PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS,
      requiredActivationPullRequestNumber: repairPrNumber,
      mustDescendFromAuthorizationSourceMainSha: true,
      mustEqualFetchedOriginMain: true,
      postMainBuildRequired: true,
      postMainSecurityRequired: true,
      postMainAnnotationsMustBeEmpty: true,
      commitBoundLiveAuditRequired: true
    },
    currentProtectedMainSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    currentProtectedMainTreeSha: "c3d3d91ff7868939cb331a8c237349d6abbd9357",
    currentProtectedRegistryBlobSha: "b0f4bfd1f35d816e22774458a4bc1593c29a745b",
    currentConflictPathCount: 3,
    currentConflictingPaths: [
      "coordination/repo-governance/active-work.json",
      "scripts/verify-sena-repo-governance.mjs",
      "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
    ],
    currentCandidateOnlyCleanPaths: [],
    authorizedResolverTransition: {
      ...sourceAuthorization.authorizedResolverTransition,
      pendingState: {
        ...sourceAuthorization.authorizedResolverTransition.pendingState,
        conflictingPathsMustEqual: [
          "coordination/repo-governance/active-work.json",
          "scripts/verify-sena-repo-governance.mjs",
          "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
        ],
        cleanCandidateOnlyPathsMustEqual: [],
        cleanProtectedOnlyPathsMustEqual: PR46_PROTECTED_ONLY_AFTER_REPAIR,
        exactThreeFileResolutionMustPreserveProtectedRepairLifecycle: true
      },
      requiredRedGreenCases: [
        ...sourceAuthorization.authorizedResolverTransition.requiredRedGreenCases,
        "integrated-monotonic-behind-must-never-imply-cleanup-or-deletion-authority",
        "root-protected-advance-chain-must-reject-parent-tree-registry-path-pr-or-receipt-drift",
        "pr46-activation-evidence-must-match-the-protected-repair-pr-number"
      ]
    },
    requiredExecution: [
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
    ]
  };
}

export function validateProtectedPr46ActivationRebinding(
  sourceAuthorization,
  candidateAuthorization,
  repairPrNumber
) {
  const expected = expectedProtectedPr46ActivationRebinding(
    sourceAuthorization,
    repairPrNumber
  );
  if (!sameJson(candidateAuthorization, expected)) {
    throw new Error("rule=protected-currentness-repair-pr46-activation-delta-invalid");
  }
  return true;
}
```

Call `validateProtectedPr46ActivationRebinding` from the repair initial-delta
validator with the exact source and candidate
`SENA-BRANCH-RETIREMENT-20260829.finalBaseHandshakeAuthorization` objects. The
final repair transition must require those objects to remain byte-equivalent.

- [ ] **Step 5: Run the matcher and lifecycle tests GREEN**

Run the two focused tests with `SENA_REPAIR_PR_NUMBER` exported.

Expected: both pass, including wrong-number and binding-drift negatives.

## Task 6: Construct the exact initial implementation candidate registry

**Files:**
- Modify: `coordination/repo-governance/active-work.json`
- Modify: `scripts/verify-sena-repo-governance.mjs`
- Modify: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`

- [ ] **Step 1: Update only owned currentness fields**

Using `apply_patch`, record:

- repair work item/branch bound to the actual Draft PR number;
- repair remote/PR head equal to the design/plan seed head before this commit;
- repair lifecycle initial state with exactly the initial metadata action true;
- `aheadBehindObservationMode: "integrated-monotonic-behind"` only on integrated
  A01 and PR81 work items with exact merge evidence;
- `prStateObservationMode: "monotonic"` on PR81, repair, and PR46 branches;
- root and BR exact current ahead/behind observations;
- downstream PR46 binding from Task 5;
- one initial receipt whose scope is exactly registry/verifier/test for this
  commit and whose protected overall scope includes design/plan; and
- every cleanup/deletion/Ready/merge/history action false except the single
  initial repair metadata action and the separately conditional three-action
  PR46 pending set.

Use this exact implementation-lifecycle shape, substituting only the shell-bound
seed identities, actual PR number, timestamp observations, and computed receipt
prefix:

```js
const initialRepairLifecycle = {
  status: "protected-currentness-activation-repair-candidate-awaiting-initial-checks",
  oneShot: true,
  pullRequestNumber: Number(process.env.SENA_REPAIR_PR_NUMBER),
  protectedBaseSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
  protectedBaseTreeSha: "c3d3d91ff7868939cb331a8c237349d6abbd9357",
  protectedBaseRegistryBlobSha: "b0f4bfd1f35d816e22774458a4bc1593c29a745b",
  designPlanSeedHeadSha: process.env.SENA_REPAIR_SEED_HEAD,
  designPlanSeedTreeSha: process.env.SENA_REPAIR_SEED_TREE,
  designPlanSeedRegistryBlobSha: process.env.SENA_REPAIR_SEED_REGISTRY_BLOB,
  designPlanSeedReceiptPrefix: {
    count: Number(process.env.SENA_REPAIR_RECEIPT_PREFIX_COUNT),
    sha256: process.env.SENA_REPAIR_RECEIPT_PREFIX_SHA256
  },
  requiredOverallPaths: [
    "coordination/repo-governance/active-work.json",
    "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
    "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md",
    "scripts/verify-sena-repo-governance.mjs",
    "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
  ],
  requiredImplementationPaths: [
    "coordination/repo-governance/active-work.json",
    "scripts/verify-sena-repo-governance.mjs",
    "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
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
```

The matching work item and branch must use:

```js
const repairCurrentness = {
  workItem: {
    prNumber: Number(process.env.SENA_REPAIR_PR_NUMBER),
    plannedPullRequestNumber: Number(process.env.SENA_REPAIR_PR_NUMBER),
    prIsDraft: true,
    prReadyForReview: false,
    mergeAuthorized: false,
    noPrReason: null,
    headSha: process.env.SENA_REPAIR_SEED_HEAD,
    aheadBehind: {
      baseRef: "origin/main",
      ahead: Number(process.env.SENA_REPAIR_SEED_AHEAD),
      behind: 0
    },
    allowedPaths: initialRepairLifecycle.requiredOverallPaths,
    protectedCurrentnessActivationRepairLifecycle: initialRepairLifecycle
  },
  branch: {
    upstream: "origin/codex/sena-protected-currentness-activation-repair-20260901",
    upstreamState: "live",
    upstreamCacheState: "present",
    remotePresent: true,
    remoteHeadSha: process.env.SENA_REPAIR_SEED_HEAD,
    pr: Number(process.env.SENA_REPAIR_PR_NUMBER),
    plannedPullRequestNumber: Number(process.env.SENA_REPAIR_PR_NUMBER),
    prState: "OPEN",
    prStateObservationMode: "monotonic",
    prIsDraft: true,
    prReadyForReview: false,
    mergeAuthorized: false,
    prHeadSha: process.env.SENA_REPAIR_SEED_HEAD,
    prBase: "main",
    noPrReason: null
  }
};
```

- [ ] **Step 2: Preserve receipt prefix byte-for-byte**

Compute before editing:

```bash
export SENA_REPAIR_RECEIPT_PREFIX_COUNT="$(node -e 'const r=require("./coordination/repo-governance/active-work.json"); console.log(r.releaseReceipts.length)')"
export SENA_REPAIR_RECEIPT_PREFIX_SHA256="$(node - <<'NODE'
const fs=require('fs'); const crypto=require('crypto');
const r=JSON.parse(fs.readFileSync('coordination/repo-governance/active-work.json','utf8'));
process.stdout.write(crypto.createHash('sha256').update(JSON.stringify(r.releaseReceipts)).digest('hex'));
NODE
)"
```

After editing, assert the stored count/hash equals these values and the candidate
adds exactly one ordered repair receipt.

- [ ] **Step 3: Stage exactly the three implementation paths**

```bash
git --no-optional-locks add -- \
  coordination/repo-governance/active-work.json \
  scripts/verify-sena-repo-governance.mjs \
  sena-hk-template/lib/sena/__tests__/repo-governance.test.ts
test "$(git --no-optional-locks diff --cached --name-only | sort | tr '\n' ' ')" = \
"coordination/repo-governance/active-work.json scripts/verify-sena-repo-governance.mjs sena-hk-template/lib/sena/__tests__/repo-governance.test.ts "
```

- [ ] **Step 4: Run all local candidate gates**

```bash
node scripts/verify-sena-repo-governance.mjs registry
node scripts/verify-sena-repo-governance.mjs audit --live --registry-from-index
node scripts/verify-sena-repo-governance.mjs write-policy --registry-from-index --staged
node scripts/verify-sena-repo-governance.mjs security --staged
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts
npx tsc --noEmit
npm run build
cd ..
```

Expected: all commands pass; audit errors/owner blockers empty and unreachable
count zero. The governance-test total must equal the newly observed full count,
not the old 49.

- [ ] **Step 5: Freeze immutable candidate identities**

```bash
export SENA_REPAIR_CANDIDATE_PARENT="$(git --no-optional-locks rev-parse HEAD)"
export SENA_REPAIR_CANDIDATE_TREE="$(git --no-optional-locks write-tree)"
export SENA_REPAIR_CANDIDATE_REGISTRY_BLOB="$(git --no-optional-locks hash-object coordination/repo-governance/active-work.json)"
export SENA_REPAIR_CANDIDATE_VERIFIER_BLOB="$(git --no-optional-locks hash-object scripts/verify-sena-repo-governance.mjs)"
export SENA_REPAIR_CANDIDATE_TEST_BLOB="$(git --no-optional-locks hash-object sena-hk-template/lib/sena/__tests__/repo-governance.test.ts)"
export SENA_REPAIR_CANDIDATE_DIFF_SHA256="$(git --no-optional-locks diff --cached --binary | shasum -a 256 | cut -d' ' -f1)"
export SENA_REPAIR_CANDIDATE_STATUS_SHA256="$(git --no-optional-locks status --porcelain=v1 | shasum -a 256 | cut -d' ' -f1)"
```

Record all values in the candidate receipt before committing. Do not call Git
object IDs SHA-256 digests.

- [ ] **Step 6: Obtain two independent read-only reviews**

Require spec and quality/security reviewers to bind their approval to the exact
parent, staged tree, three blobs, binary diff SHA-256, status SHA-256, receipt
prefix, and staged path set. Any finding requires an `apply_patch` correction,
full re-run, and fresh immutable review.

- [ ] **Step 7: Commit the initial implementation candidate**

```bash
git --no-optional-locks commit -m \
  "fix(governance): repair protected currentness activation"
```

Expected: pre-commit write/security gates pass; commit has one parent and only
the three staged implementation paths relative to the design/plan seed.

## Task 7: Push and prove the initial exact head

**Files:** none beyond the committed candidate.

- [ ] **Step 1: Push only the named repair branch**

```bash
export SENA_REPAIR_INITIAL_HEAD="$(git --no-optional-locks rev-parse HEAD)"
export SENA_REPAIR_INITIAL_TREE="$(git --no-optional-locks rev-parse HEAD^{tree})"
export SENA_REPAIR_INITIAL_REGISTRY_BLOB="$(git --no-optional-locks rev-parse HEAD:coordination/repo-governance/active-work.json)"
export SENA_REPAIR_INITIAL_VERIFIER_BLOB="$(git --no-optional-locks rev-parse HEAD:scripts/verify-sena-repo-governance.mjs)"
export SENA_REPAIR_INITIAL_TEST_BLOB="$(git --no-optional-locks rev-parse HEAD:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts)"
git --no-optional-locks push origin \
  "refs/heads/$SENA_REPAIR_BRANCH:refs/heads/$SENA_REPAIR_BRANCH"
```

- [ ] **Step 2: Assert local/remote/PR exact-head equality and Draft state**

```bash
test "$(git --no-optional-locks ls-remote --heads origin "refs/heads/$SENA_REPAIR_BRANCH" | cut -f1)" = "$SENA_REPAIR_INITIAL_HEAD"
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json headRefOid --jq .headRefOid)" = "$SENA_REPAIR_INITIAL_HEAD"
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json isDraft --jq .isDraft)" = true
```

- [ ] **Step 3: Wait for exactly three implementation-head workflow results**

Require:

- PR build-gate success;
- PR repository-security success;
- push repository-security success;
- all three `headSha` values equal `SENA_REPAIR_INITIAL_HEAD`; and
- each job annotations endpoint returns an empty array.

Resolve and wait for the runs with these exact commands:

```bash
export SENA_REPAIR_RUNS_JSON="$(gh run list --repo HUDongpin/SENA \
  --branch "$SENA_REPAIR_BRANCH" --limit 30 \
  --json databaseId,event,status,conclusion,headSha,workflowName)"
export SENA_REPAIR_INITIAL_BUILD_RUN_ID="$(printf '%s' "$SENA_REPAIR_RUNS_JSON" | jq -r \
  --arg head "$SENA_REPAIR_INITIAL_HEAD" \
  'map(select(.headSha==$head and .workflowName=="build-gate" and .event=="pull_request")) | first | .databaseId // empty')"
export SENA_REPAIR_INITIAL_PR_SECURITY_RUN_ID="$(printf '%s' "$SENA_REPAIR_RUNS_JSON" | jq -r \
  --arg head "$SENA_REPAIR_INITIAL_HEAD" \
  'map(select(.headSha==$head and .workflowName=="repo-security-gate" and .event=="pull_request")) | first | .databaseId // empty')"
export SENA_REPAIR_INITIAL_PUSH_SECURITY_RUN_ID="$(printf '%s' "$SENA_REPAIR_RUNS_JSON" | jq -r \
  --arg head "$SENA_REPAIR_INITIAL_HEAD" \
  'map(select(.headSha==$head and .workflowName=="repo-security-gate" and .event=="push")) | first | .databaseId // empty')"
test -n "$SENA_REPAIR_INITIAL_BUILD_RUN_ID"
test -n "$SENA_REPAIR_INITIAL_PR_SECURITY_RUN_ID"
test -n "$SENA_REPAIR_INITIAL_PUSH_SECURITY_RUN_ID"
gh run watch "$SENA_REPAIR_INITIAL_BUILD_RUN_ID" --repo HUDongpin/SENA --exit-status
gh run watch "$SENA_REPAIR_INITIAL_PR_SECURITY_RUN_ID" --repo HUDongpin/SENA --exit-status
gh run watch "$SENA_REPAIR_INITIAL_PUSH_SECURITY_RUN_ID" --repo HUDongpin/SENA --exit-status
export SENA_REPAIR_INITIAL_BUILD_JOB_ID="$(gh run view "$SENA_REPAIR_INITIAL_BUILD_RUN_ID" --repo HUDongpin/SENA --json jobs --jq '.jobs[] | select(.name=="build") | .databaseId')"
export SENA_REPAIR_INITIAL_PR_SECURITY_JOB_ID="$(gh run view "$SENA_REPAIR_INITIAL_PR_SECURITY_RUN_ID" --repo HUDongpin/SENA --json jobs --jq '.jobs[] | select(.name=="repository-security") | .databaseId')"
export SENA_REPAIR_INITIAL_PUSH_SECURITY_JOB_ID="$(gh run view "$SENA_REPAIR_INITIAL_PUSH_SECURITY_RUN_ID" --repo HUDongpin/SENA --json jobs --jq '.jobs[] | select(.name=="repository-security") | .databaseId')"
for SENA_REPAIR_JOB_ID in \
  "$SENA_REPAIR_INITIAL_BUILD_JOB_ID" \
  "$SENA_REPAIR_INITIAL_PR_SECURITY_JOB_ID" \
  "$SENA_REPAIR_INITIAL_PUSH_SECURITY_JOB_ID"; do
  test "$(gh api --paginate "repos/HUDongpin/SENA/check-runs/$SENA_REPAIR_JOB_ID/annotations" --jq length)" = 0
done
export SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS="$SENA_REPAIR_INITIAL_PR_SECURITY_RUN_ID,$SENA_REPAIR_INITIAL_PUSH_SECURITY_RUN_ID"
export SENA_REPAIR_INITIAL_CHECK_JOB_IDS="$SENA_REPAIR_INITIAL_BUILD_JOB_ID,$SENA_REPAIR_INITIAL_PR_SECURITY_JOB_ID,$SENA_REPAIR_INITIAL_PUSH_SECURITY_JOB_ID"
```

Do not use the earlier design/plan seed runs.

- [ ] **Step 4: Re-run exact-head immutable reviews if CI changes the evidence set**

Reviews must still report P0-P3 all zero and mutation count zero. Record run IDs,
job IDs, conclusions, annotations, and review results for the final metadata
transition.

## Task 8: Create the registry-only final authorization transition

**Files:**
- Modify: `coordination/repo-governance/active-work.json`

- [ ] **Step 1: Write the final metadata projection with exact initial evidence**

Use `apply_patch` to:

- set lifecycle status to
  `protected-currentness-activation-repair-ready-pending-final-head-checks`;
- set initial metadata action false;
- set repair Ready/protected-merge action true;
- record initial head/tree/registry/verifier/test blobs;
- record exact build/security run and job IDs, conclusions, empty annotations,
  and immutable review approvals;
- keep repair work-item, branch, remote, and PR heads equal to the exact initial
  candidate head;
- keep PR `OPEN`, Draft, `MERGEABLE/CLEAN`, not Ready, and not merged;
- append exactly one final receipt with registry-only scope; and
- preserve the downstream PR46 activation binding byte-for-byte.

Use this exact state delta:

```js
const finalRepairLifecycle = {
  ...initialRepairLifecycle,
  status: "protected-currentness-activation-repair-ready-pending-final-head-checks",
  initialCandidateCompletionEvidence: {
    headSha: process.env.SENA_REPAIR_INITIAL_HEAD,
    treeSha: process.env.SENA_REPAIR_INITIAL_TREE,
    registryBlobSha: process.env.SENA_REPAIR_INITIAL_REGISTRY_BLOB,
    verifierBlobSha: process.env.SENA_REPAIR_INITIAL_VERIFIER_BLOB,
    governanceTestBlobSha: process.env.SENA_REPAIR_INITIAL_TEST_BLOB,
    buildRunId: Number(process.env.SENA_REPAIR_INITIAL_BUILD_RUN_ID),
    repositorySecurityRunIds: process.env.SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS
      .split(",").map(Number),
    checkJobIds: process.env.SENA_REPAIR_INITIAL_CHECK_JOB_IDS.split(",").map(Number),
    requiredChecksPassed: true,
    annotationsEmpty: true,
    specReviewApproved: true,
    qualityReviewApproved: true
  },
  finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks: false,
  repairReadyAndProtectedMergeAuthorizedAfterFinalChecks: true
};
const finalRepairCurrentness = {
  workItemHeadSha: process.env.SENA_REPAIR_INITIAL_HEAD,
  branchHeadSha: process.env.SENA_REPAIR_INITIAL_HEAD,
  remoteHeadSha: process.env.SENA_REPAIR_INITIAL_HEAD,
  prHeadSha: process.env.SENA_REPAIR_INITIAL_HEAD,
  prState: "OPEN",
  prIsDraft: true,
  prReadyForReview: false,
  mergeAuthorized: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN"
};
```

- [ ] **Step 2: Stage only the registry and run the full final gates**

```bash
git --no-optional-locks add -- coordination/repo-governance/active-work.json
test "$(git --no-optional-locks diff --cached --name-only)" = \
  coordination/repo-governance/active-work.json
node scripts/verify-sena-repo-governance.mjs registry
node scripts/verify-sena-repo-governance.mjs audit --live --registry-from-index
SENA_REPAIR_INITIAL_BUILD_RUN_ID="$SENA_REPAIR_INITIAL_BUILD_RUN_ID" \
SENA_REPAIR_INITIAL_HEAD="$SENA_REPAIR_INITIAL_HEAD" \
SENA_REPAIR_INITIAL_TREE="$SENA_REPAIR_INITIAL_TREE" \
SENA_REPAIR_INITIAL_REGISTRY_BLOB="$SENA_REPAIR_INITIAL_REGISTRY_BLOB" \
SENA_REPAIR_INITIAL_VERIFIER_BLOB="$SENA_REPAIR_INITIAL_VERIFIER_BLOB" \
SENA_REPAIR_INITIAL_TEST_BLOB="$SENA_REPAIR_INITIAL_TEST_BLOB" \
SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS="$SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS" \
SENA_REPAIR_INITIAL_CHECK_JOB_IDS="$SENA_REPAIR_INITIAL_CHECK_JOB_IDS" \
SENA_REPAIR_INITIAL_REQUIRED_CHECKS_PASSED=true \
SENA_REPAIR_INITIAL_ANNOTATIONS_EMPTY=true \
SENA_REPAIR_INITIAL_SPEC_REVIEW_APPROVED=true \
SENA_REPAIR_INITIAL_QUALITY_REVIEW_APPROVED=true \
  node scripts/verify-sena-repo-governance.mjs write-policy \
    --registry-from-index --staged
node scripts/verify-sena-repo-governance.mjs security --staged
cd sena-hk-template
npm test -- --run lib/sena/__tests__/repo-governance.test.ts
npx tsc --noEmit
npm run build
cd ..
```

Expected: all pass at the full new test total.

- [ ] **Step 3: Freeze and independently review the final registry-only tree**

Bind both reviews to parent initial head, staged tree, registry blob, registry
file SHA-256, binary diff SHA-256, status SHA-256, exact receipt prefix/delta,
and one-path scope. Require P0-P3 all zero.

- [ ] **Step 4: Commit and push the final metadata head**

```bash
git --no-optional-locks commit -m \
  "chore(governance): finalize protected currentness repair"
export SENA_REPAIR_FINAL_HEAD="$(git --no-optional-locks rev-parse HEAD)"
git --no-optional-locks push origin \
  "refs/heads/$SENA_REPAIR_BRANCH:refs/heads/$SENA_REPAIR_BRANCH"
```

- [ ] **Step 5: Wait for fresh final-head CI and zero annotations**

Require a new PR build run, PR security run, and push security run, all bound to
`SENA_REPAIR_FINAL_HEAD`. Seed and initial-candidate runs do not count.

Resolve the final runs independently:

```bash
export SENA_REPAIR_FINAL_RUNS_JSON="$(gh run list --repo HUDongpin/SENA \
  --branch "$SENA_REPAIR_BRANCH" --limit 30 \
  --json databaseId,event,status,conclusion,headSha,workflowName)"
export SENA_REPAIR_FINAL_BUILD_RUN_ID="$(printf '%s' "$SENA_REPAIR_FINAL_RUNS_JSON" | jq -r \
  --arg head "$SENA_REPAIR_FINAL_HEAD" \
  'map(select(.headSha==$head and .workflowName=="build-gate" and .event=="pull_request")) | first | .databaseId // empty')"
export SENA_REPAIR_FINAL_PR_SECURITY_RUN_ID="$(printf '%s' "$SENA_REPAIR_FINAL_RUNS_JSON" | jq -r \
  --arg head "$SENA_REPAIR_FINAL_HEAD" \
  'map(select(.headSha==$head and .workflowName=="repo-security-gate" and .event=="pull_request")) | first | .databaseId // empty')"
export SENA_REPAIR_FINAL_PUSH_SECURITY_RUN_ID="$(printf '%s' "$SENA_REPAIR_FINAL_RUNS_JSON" | jq -r \
  --arg head "$SENA_REPAIR_FINAL_HEAD" \
  'map(select(.headSha==$head and .workflowName=="repo-security-gate" and .event=="push")) | first | .databaseId // empty')"
test -n "$SENA_REPAIR_FINAL_BUILD_RUN_ID"
test -n "$SENA_REPAIR_FINAL_PR_SECURITY_RUN_ID"
test -n "$SENA_REPAIR_FINAL_PUSH_SECURITY_RUN_ID"
gh run watch "$SENA_REPAIR_FINAL_BUILD_RUN_ID" --repo HUDongpin/SENA --exit-status
gh run watch "$SENA_REPAIR_FINAL_PR_SECURITY_RUN_ID" --repo HUDongpin/SENA --exit-status
gh run watch "$SENA_REPAIR_FINAL_PUSH_SECURITY_RUN_ID" --repo HUDongpin/SENA --exit-status
export SENA_REPAIR_FINAL_BUILD_JOB_ID="$(gh run view "$SENA_REPAIR_FINAL_BUILD_RUN_ID" --repo HUDongpin/SENA --json jobs --jq '.jobs[] | select(.name=="build") | .databaseId')"
export SENA_REPAIR_FINAL_PR_SECURITY_JOB_ID="$(gh run view "$SENA_REPAIR_FINAL_PR_SECURITY_RUN_ID" --repo HUDongpin/SENA --json jobs --jq '.jobs[] | select(.name=="repository-security") | .databaseId')"
export SENA_REPAIR_FINAL_PUSH_SECURITY_JOB_ID="$(gh run view "$SENA_REPAIR_FINAL_PUSH_SECURITY_RUN_ID" --repo HUDongpin/SENA --json jobs --jq '.jobs[] | select(.name=="repository-security") | .databaseId')"
for SENA_REPAIR_JOB_ID in \
  "$SENA_REPAIR_FINAL_BUILD_JOB_ID" \
  "$SENA_REPAIR_FINAL_PR_SECURITY_JOB_ID" \
  "$SENA_REPAIR_FINAL_PUSH_SECURITY_JOB_ID"; do
  test "$(gh api --paginate "repos/HUDongpin/SENA/check-runs/$SENA_REPAIR_JOB_ID/annotations" --jq length)" = 0
done
```

Then assert freshness:

```bash
test "$SENA_REPAIR_FINAL_BUILD_RUN_ID" != "$SENA_REPAIR_INITIAL_BUILD_RUN_ID"
test "$SENA_REPAIR_FINAL_PR_SECURITY_RUN_ID" != "$SENA_REPAIR_INITIAL_PR_SECURITY_RUN_ID"
test "$SENA_REPAIR_FINAL_PUSH_SECURITY_RUN_ID" != "$SENA_REPAIR_INITIAL_PUSH_SECURITY_RUN_ID"
test "$SENA_REPAIR_FINAL_BUILD_JOB_ID" != "$SENA_REPAIR_INITIAL_BUILD_JOB_ID"
test "$SENA_REPAIR_FINAL_PR_SECURITY_JOB_ID" != "$SENA_REPAIR_INITIAL_PR_SECURITY_JOB_ID"
test "$SENA_REPAIR_FINAL_PUSH_SECURITY_JOB_ID" != "$SENA_REPAIR_INITIAL_PUSH_SECURITY_JOB_ID"
```

For each final job, query the same annotations endpoint and require length zero.

## Task 9: Protected merge, post-main proof, and PR46 handoff

**Files:** none unless evidence reveals a failure.

- [ ] **Step 1: Perform the last-moment exact lease check**

```bash
test "$(git --no-optional-locks rev-parse HEAD)" = "$SENA_REPAIR_FINAL_HEAD"
test "$(git --no-optional-locks ls-remote --heads origin "refs/heads/$SENA_REPAIR_BRANCH" | cut -f1)" = "$SENA_REPAIR_FINAL_HEAD"
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json headRefOid --jq .headRefOid)" = "$SENA_REPAIR_FINAL_HEAD"
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json isDraft --jq .isDraft)" = true
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json mergeable --jq .mergeable)" = MERGEABLE
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json mergeStateStatus --jq .mergeStateStatus)" = CLEAN
```

- [ ] **Step 2: Mark Ready, re-read all checks, and merge without bypass**

```bash
gh pr ready "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA
test "$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json headRefOid --jq .headRefOid)" = "$SENA_REPAIR_FINAL_HEAD"
gh pr merge "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA \
  --merge --match-head-commit "$SENA_REPAIR_FINAL_HEAD"
```

Do not use `--admin` and do not request branch deletion.

- [ ] **Step 3: Freeze the protected merge topology**

```bash
export SENA_REPAIR_MERGE_SHA="$(gh pr view "$SENA_REPAIR_PR_NUMBER" --repo HUDongpin/SENA --json mergeCommit --jq .mergeCommit.oid)"
git --no-optional-locks fetch --no-tags origin main
test "$(git --no-optional-locks rev-parse origin/main)" = "$SENA_REPAIR_MERGE_SHA"
test "$(git --no-optional-locks rev-list --parents -n 1 "$SENA_REPAIR_MERGE_SHA" | awk '{print $2}')" = "$SENA_REPAIR_PROTECTED_SOURCE"
test "$(git --no-optional-locks rev-list --parents -n 1 "$SENA_REPAIR_MERGE_SHA" | awk '{print $3}')" = "$SENA_REPAIR_FINAL_HEAD"
test "$(git --no-optional-locks rev-parse "$SENA_REPAIR_MERGE_SHA^{tree}")" = \
  "$(git --no-optional-locks rev-parse "$SENA_REPAIR_FINAL_HEAD^{tree}")"
```

- [ ] **Step 4: Wait for post-main build/security and annotations**

Require both push workflows to use `SENA_REPAIR_MERGE_SHA`, succeed, and return
zero annotations. Record run and job IDs externally for PR46 completion evidence.

- [ ] **Step 5: Run commit-bound live audit before root fast-forward**

```bash
node scripts/verify-sena-repo-governance.mjs audit --live \
  --registry-from-commit "$SENA_REPAIR_MERGE_SHA"
```

Expected: pass, empty errors/owner blockers, zero unreachable commits; root may
emit only the exact protected-advance warning.

- [ ] **Step 6: Fast-forward the clean read-only root and re-audit**

Run only after Step 5 passes:

```bash
cd /Volumes/Starship/SENA
test -z "$(git --no-optional-locks status --porcelain=v1)"
test "$(git --no-optional-locks branch --show-current)" = main
git --no-optional-locks merge --ff-only "$SENA_REPAIR_MERGE_SHA"
test "$(git --no-optional-locks rev-parse HEAD)" = "$SENA_REPAIR_MERGE_SHA"
node scripts/verify-sena-repo-governance.mjs audit --live \
  --registry-from-commit "$SENA_REPAIR_MERGE_SHA"
```

Expected: second audit also passes. No reset/rebase/stash/force is used.

- [ ] **Step 7: Revalidate frozen PR46 without mutation**

```bash
cd /Volumes/Starship/SENA/.worktrees/sena-branch-retirement-20260829
test "$(git --no-optional-locks rev-parse HEAD)" = \
  e24c635d1f53fccb2264c6be002aec2775de127c
test -z "$(git --no-optional-locks status --porcelain=v1)"
test "$(git --no-optional-locks ls-remote --heads origin refs/heads/codex/sena-branch-retirement-20260829 | cut -f1)" = \
  e24c635d1f53fccb2264c6be002aec2775de127c
test "$(gh pr view 46 --repo HUDongpin/SENA --json headRefOid --jq .headRefOid)" = \
  e24c635d1f53fccb2264c6be002aec2775de127c
git --no-optional-locks merge-tree --write-tree --name-only --messages \
  e24c635d1f53fccb2264c6be002aec2775de127c "$SENA_REPAIR_MERGE_SHA"
```

Expected: PR46 remains Draft and clean; conflicts are exactly registry, verifier,
and governance test; candidate-only clean set is empty. Freeze the recomputed
protected-only clean set and stop before any PR46 merge command.

## Final execution evidence for this plan

This repair plan is complete only when all of the following are proven:

- one protected repair PR, actual number read back and used everywhere;
- ordinary two-parent protected merge with exact-head lease and no admin bypass;
- final-head and post-main build/security success with zero annotations;
- complete new governance test count passing;
- registry, index/live audit, write-policy, security, type-check, and build pass;
- immutable spec and quality/security reviews report P0-P3 all zero;
- commit-bound live audit passes before and after root fast-forward;
- PR46 activation binding names the repair PR and is protected-main immutable;
- PR46 remains untouched at exact `e24c635...` until handoff;
- local/remote branches, worktrees, invalid pointers, EvidenceFlow, keep-around
  refs, archive tags, rescue custody, and retirement targets remain preserved;
- every deletion, cleanup, target, provider, deployment, reset, rebase, stash,
  force, and history-rewrite authorization remains false; and
- the repair stops before PR46 mutation. The full one-branch/one-worktree goal
  remains active and resumes through the separately approved PR46 and cleanup
  plans.

## Plan self-review record

The implementation plan was checked against every section of the approved
design before its local plan commit:

- Design §§1-6, single self-closing repair and lifecycle boundaries: Tasks 1,
  2, 6, 7, and 8.
- Design §7, non-destructive integrated monotonic-behind observation: Task 3.
- Design §8, monotonic PR close without reopening or head drift: Tasks 3, 4,
  5, and the registry projection in Task 6.
- Design §9, exact protected-main advance chain before/after root fast-forward:
  Tasks 4 and 9.
- Design §10, protected PR46 activation rebinding and immutable consumption:
  Tasks 5, 6, and 9.
- Design §11, exact three conflicts, empty candidate-only set, and four
  protected-only documents after the required plan file was added: Task 9.
- Design §12, seed -> actual Draft PR -> initial candidate -> final metadata ->
  protected merge -> post-main -> PR46 handoff data flow: Tasks 1-9 in order.
- Design §13, fail-closed stop conditions: repeated in Tasks 1, 6, 7, 8, and 9.
- Design §14, RED before production and complete negative coverage: Tasks 2-5.
- Design §15, exact acceptance evidence and no cleanup/deletion: Task 9 and the
  final execution-evidence checklist.

Red-flag scanning found no unresolved marker, vague error-handling step, or
undefined new helper. Function names, lifecycle statuses, receipt kinds,
environment-variable names, field names, and path sets were checked for
cross-task consistency. The repair remains one tightly coupled governance
subsystem and does not absorb PR46 implementation or cleanup execution.
