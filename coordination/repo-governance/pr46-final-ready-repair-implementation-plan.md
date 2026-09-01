# PR46 Final-Ready Protected Minimal-Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect one minimal repair lifecycle, isolate the PR46 conflict-intake integration test from mutable checkout state, bind activation evidence to the exact protected PR number, merge PR46 through protected main, and leave every cleanup object untouched until PR46 post-main verification passes.

**Architecture:** A fail-closed two-state A01 PR80 records and activates the repair authority. PR80 itself adds a recursive action/receipt transition validator and negative tests before any authority reaches protected main. After PR80 post-main verification, the existing PR46 branch is remerged with that exact frozen protected commit; the checkout-coupled integration fixture and hard-coded activation identity are repaired RED-first, and the registry is reconstructed from the protected source. A later registry-only PR46 final commit and the clean post-main checkout must both genuinely pass the same 97-test file.

**Tech Stack:** Git worktrees and object plumbing, GitHub CLI, Node.js ESM, TypeScript, Vitest, JSON governance registry, GitHub Actions build/security gates.

---

## File map and ownership

- Create in A01: `coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md` — this executable plan.
- Modify in A01: `coordination/repo-governance/active-work.json` — PR80 lifecycle, protected PR46 repair source, exact evidence, A01 receipts, and branch/work-item heartbeats.
- Modify in A01: `scripts/verify-sena-repo-governance.mjs` — enforce PR80's exact two-state transition, recursive true-action closure, receipt prefix/delta/order/scope, final evidence, and replay prohibition.
- Modify in A01: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts` — negative PR80 lifecycle contracts; test fixtures remove PR80 receipts when they remove the owning work item.
- Modify in PR46 after PR80 activation: `coordination/repo-governance/active-work.json` — protected-source reconstruction, repair/remerge projection, completion evidence, and bounded receipts.
- Modify in PR46 after PR80 activation: `scripts/verify-sena-repo-governance.mjs:885-1040` — validate a protected `requiredActivationPullRequestNumber` instead of hard-coding PR79.
- Modify in PR46 after PR80 activation: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:3749-4175` — replace the live-index integration fixture with explicit source/candidate projection contexts and add RED/GREEN coverage for activation PR identity without increasing the top-level 97-test count.
- Do not modify the root checkout, EvidenceFlow files, cleanup targets, archive/quarantine content, keep-around refs, or invalid-pointer directories in this plan.

## Task 1: Commit this implementation plan and freeze execution inputs

**Files:**
- Create: `coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md`
- Reference: `coordination/repo-governance/pr46-final-ready-repair-design.md`

- [ ] **Step 1: Verify the design and plan are the only A01 changes**

Run from `/Volumes/Starship/SENA/.worktrees/sena-a01-repo-governance-20260827`:

```bash
git status --short
git diff --check
git diff --name-only
```

Expected before staging: only `coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md` is untracked; the design is already committed at `1b80b81f5c292ba9d2ae3723e7338c3cb4941b36`.

- [ ] **Step 2: Stage only the implementation plan and run the index gates**

```bash
git add -- coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  SENA_GOVERNANCE_TARGET_ROOT=/Volumes/Starship/SENA/.worktrees/sena-a01-repo-governance-20260827 \
  node scripts/verify-sena-repo-governance.mjs audit --pre-commit --registry-from-index
env TMPDIR=/Volumes/Starship/SENA/.tmp .githooks/pre-commit
```

Expected: audit `status=pass`, `errors=[]`, `ownerBlockers=[]`, `unreachableCommitCount=0`; write-policy and security both report `staged=1`.

- [ ] **Step 3: Commit the implementation plan**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  git commit -m "docs(governance): plan PR46 final-ready repair"
```

Expected: one new local A01 commit with one added file and a clean worktree. Do not push yet.

- [ ] **Step 4: Revalidate the clean PR46 input**

Run from `/Volumes/Starship/SENA/.worktrees/sena-branch-retirement-20260829`:

```bash
git rev-parse HEAD HEAD^{tree}
git status --short
git ls-remote --heads origin codex/sena-branch-retirement-20260829 main
git show-ref \
  refs/keep-around/sena-pr46-final-handshake-autostash-index-20260901 \
  refs/keep-around/sena-pr46-final-handshake-autostash-wip-20260901
```

Expected: clean `HEAD=e24c635d1f53fccb2264c6be002aec2775de127c`, tree `56be367593f0b41c89fe74536e9c3834ce08fcc0`, named remote head equal to HEAD, live main `ca7d464e5e58e48996daaee01ac22f929b964b8f`, and both keep-around refs unchanged.

## Task 2: Build the initial A01 PR80 protected repair candidate

**Files:**
- Modify: `coordination/repo-governance/active-work.json`
- Modify: `coordination/repo-governance/pr46-final-ready-repair-design.md`
- Modify: `coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md`
- Modify: `scripts/verify-sena-repo-governance.mjs`
- Modify: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
- Reference: `coordination/repo-governance/pr46-final-ready-repair-design.md`

- [ ] **Step 1: Capture fresh exact identities**

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git rev-parse HEAD HEAD^{tree}
git rev-parse ca7d464e5e58e48996daaee01ac22f929b964b8f^{tree}
git rev-parse ca7d464e5e58e48996daaee01ac22f929b964b8f:coordination/repo-governance/active-work.json
git ls-remote --heads origin main codex/sena-a01-repo-governance-20260827 codex/sena-branch-retirement-20260829
gh pr list --state all --limit 10 --json number,state,headRefName,headRefOid
```

Expected: live main remains `ca7d464e5e58e48996daaee01ac22f929b964b8f`; no PR80 exists; PR46 remote remains `e24c635d1f53fccb2264c6be002aec2775de127c`. Record the exact UTC time and current A01 plan-commit SHA in the candidate rather than predicting them.

- [ ] **Step 2: Add the PR80 lifecycle and reset the protected PR46 source to the new pending activation**

Use `apply_patch` to update only A01-owned and branch-retirement coordination fields in `active-work.json`. The new protected binding must contain this exact semantic core:

```json
{
  "status": "pending-protected-activation",
  "oneShot": true,
  "protectedActivationBinding": {
    "mode": "loaded-fetched-origin-main-authorization-registry-commit",
    "requiredReceiptKind": "pr80-final-ready-test-repair-authorization-candidate",
    "requiredFinalAuthorizationReceiptKind": "pr80-final-ready-test-repair-final-authorization",
    "requiredAuthorizationStatus": "pending-protected-activation",
    "requiredActivationPullRequestNumber": 80,
    "mustDescendFromAuthorizationSourceMainSha": true,
    "mustEqualFetchedOriginMain": true,
    "postMainBuildRequired": true,
    "postMainSecurityRequired": true,
    "postMainAnnotationsMustBeEmpty": true,
    "commitBoundLiveAuditRequired": true
  },
  "pullRequestNumber": 46,
  "candidateHeadSha": "e24c635d1f53fccb2264c6be002aec2775de127c",
  "candidateTreeSha": "56be367593f0b41c89fe74536e9c3834ce08fcc0",
  "candidateRegistryBlobSha": "83a3b3ab4e5dd9fd584d4d1c49a2e51c59c66339",
  "candidateVerifierBlobSha": "d28a3fb23c9ada864fe65271c0ee30b97d034da0",
  "candidateGovernanceTestBlobSha": "5eff890f19262194637dd388e86297a8cdc17ebb",
  "candidateParents": [
    "5101ee2789acdcb4ac4c294a25ab5d7b645d1bde",
    "ca7d464e5e58e48996daaee01ac22f929b964b8f"
  ],
  "mergeBaseSha": "ca7d464e5e58e48996daaee01ac22f929b964b8f",
  "finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation": true,
  "finalResolverAndTestStageAuthorizedAfterProtectedActivation": true,
  "finalMergeCommitPushAuthorizedAfterRequiredGates": true,
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks": false,
  "pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks": false,
  "implementationAuthorizedNow": false,
  "localRefRetirementAuthorized": false,
  "retirementReceiptMintingAuthorized": false,
  "branchDeletionAuthorized": false,
  "worktreeRemovalAuthorized": false,
  "orphanWorktreeMutationAuthorized": false,
  "targetTagMutationAuthorized": false,
  "quarantineMutationAuthorized": false,
  "deploymentAuthorized": false,
  "providerMutationAuthorized": false,
  "resetAuthorized": false,
  "rebaseAuthorized": false,
  "stashAuthorized": false,
  "forceAuthorized": false,
  "historyRewriteAuthorized": false
}
```

Also add this exact `pr80FinalReadyTestRepairLifecycle` object to the A01 work item. Runtime timestamps are added from the UTC command in Step 1; they do not change its action closure:

```json
{
  "status": "pr80-repair-authorization-candidate-awaiting-initial-checks",
  "oneShot": true,
  "pullRequestNumber": 80,
  "protectedBaseSha": "ca7d464e5e58e48996daaee01ac22f929b964b8f",
  "protectedBaseTreeSha": "a83b9547f440757ee3f38d4f8ba8fd88b3cb287b",
  "protectedBaseRegistryBlobSha": "9b8f6ceea9c60486a8f85e0afa074f62efcf4a7f",
  "requiredCandidatePaths": [
    "coordination/repo-governance/active-work.json",
    "coordination/repo-governance/pr46-final-ready-repair-design.md",
    "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md",
    "scripts/verify-sena-repo-governance.mjs",
    "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
  ],
  "repairImplementationPaths": [
    "scripts/verify-sena-repo-governance.mjs",
    "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
  ],
  "blockedFinalReadyEvidence": {
    "headSha": "e24c635d1f53fccb2264c6be002aec2775de127c",
    "stagedTreeSha": "2a1f436e61d69e1b158e9bbdc526b5842922ccb7",
    "stagedRegistryBlobSha": "f50af94583b3c8e50e1084eb1c1cdd5ce05c5d8b",
    "registryOnlyDiffSha256": "38cebc0f82b5294a849f3644f259901e25c065020ac69001fecd47ce6eb388e1",
    "statusSha256": "f8c06cfa548444a7ddb521145d3177b7ec425ee36b0911cd20e0b1b53598be37",
    "fullTestsPassed": 96,
    "fullTestsTotal": 97,
    "specFindingPriority": "P1",
    "qualityFindingPriority": "P2",
    "committed": false,
    "pushed": false
  },
  "protectedBaseReceiptPrefix": {
    "count": 31,
    "sha256": "f4a0dc3989d36915fd611e89f37dce968bd6d85348e21bc721e730980e4d1d67"
  },
  "authorizedTransition": {
    "allowedStatuses": [
      "pr80-repair-authorization-candidate-awaiting-initial-checks",
      "pr80-ready-authorization-pending-final-head-checks"
    ],
    "arbitraryStatusMustFailClosed": true,
    "unknownTrueAuthorizationMustFailClosedRecursively": true,
    "replayOfEarlierActionMustFailClosed": true,
    "receiptPrefixMustRemainByteEquivalent": true,
    "exactTransitionOrderRequired": true,
    "completeA01WorkItemAndBranchAuthorizationSetMustBeCompared": true,
    "finalFieldLevelDelta": {
      "allowedWorkItemFields": [
        "headSha",
        "aheadBehind",
        "lastHeartbeatAt",
        "lastObservedAt",
        "nextReviewAt",
        "prNumber",
        "noPrReason",
        "prIsDraft",
        "prReadyForReview",
        "mergeAuthorized",
        "dirtyState",
        "evidenceState"
      ],
      "allowedLifecycleFields": [
        "status",
        "initialCandidateCompletionEvidence",
        "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks",
        "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks"
      ],
      "allowedBranchFields": [
        "headSha",
        "remoteHeadSha",
        "remoteObservedAt",
        "pr",
        "prState",
        "prIsDraft",
        "prReadyForReview",
        "mergeAuthorized",
        "prHeadSha",
        "noPrReason",
        "lastOwnerHeartbeatAt",
        "lastObservedAt",
        "lastCommitAt",
        "nextReviewAt",
        "closeout",
        "mergeable",
        "mergeStateStatus"
      ],
      "siblingAuthorizationWideningMustFailClosed": true,
      "allowedPathsOwnerDispositionAndHistoricalAuthorizationDriftMustFailClosed": true
    },
    "finalEvidenceBinding": {
      "buildRunIdCount": 1,
      "repositorySecurityRunIdCount": 2,
      "checkJobIdCount": 3,
      "arraysMustContainDistinctPositiveIntegers": true,
      "lifecycleReceiptAndExplicitObservationContextMustMatch": true
    },
    "initialState": {
      "allowedTrueAuthorizationPaths": [
        "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks"
      ],
      "requiredReceiptKind": "pr80-final-ready-test-repair-authorization-candidate",
      "requiredReceiptScope": [
        "coordination/repo-governance/active-work.json",
        "coordination/repo-governance/pr46-final-ready-repair-design.md",
        "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md",
        "scripts/verify-sena-repo-governance.mjs",
        "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
      ],
      "completeA01AuthorizationSetMustEqualProtectedSourcePlusInitialAction": true
    },
    "finalState": {
      "allowedTrueAuthorizationPaths": [
        "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks"
      ],
      "requiredReceiptKind": "pr80-final-ready-test-repair-final-authorization",
      "requiredReceiptScope": [
        "coordination/repo-governance/active-work.json"
      ],
      "a01WriterLaneSealedAfterFinalCommit": true,
      "unchangedFinalLifecycleDeltaOnA01MustFailClosed": true,
      "laterRegistryLifecyclesMustUseSeparatelyValidatedNonA01Lane": true,
      "requiredFinalPreCommitPrState": {
        "pullRequestNumber": 80,
        "state": "OPEN",
        "base": "main",
        "isDraft": true,
        "prReadyForReview": false,
        "mergeAuthorized": false,
        "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN",
        "workItemBranchRemoteAndPrHeadMustEqualInitialCandidateHead": true,
        "appliesOnlyDuringInitialToFinalTransition": true,
        "standalonePostMainSnapshotMayRecordMonotonicMergedCurrentness": true
      }
    }
  },
  "initialCandidateCompletionEvidence": null,
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks": true,
  "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks": false,
  "pr46ReadyAndProtectedMergeAuthorizedNow": false,
  "localRefRetirementAuthorized": false,
  "retirementReceiptMintingAuthorized": false,
  "branchDeletionAuthorized": false,
  "worktreeRemovalAuthorized": false,
  "orphanWorktreeMutationAuthorized": false,
  "targetTagMutationAuthorized": false,
  "quarantineMutationAuthorized": false,
  "deploymentAuthorized": false,
  "providerMutationAuthorized": false,
  "resetAuthorized": false,
  "rebaseAuthorized": false,
  "stashAuthorized": false,
  "forceAuthorized": false,
  "historyRewriteAuthorized": false
}
```

- [ ] **Step 3: Add the initial PR80 receipt**

Append exactly one A01-owned receipt with this action closure:

```json
{
  "schemaVersion": "sena-registry-reconciliation-receipt/v1",
  "receiptKind": "pr80-final-ready-test-repair-authorization-candidate",
  "taskId": "SENA-A01-REPO-GOVERNANCE-20260827",
  "ownerKey": "Codex-primary-writer",
  "scope": [
    "coordination/repo-governance/active-work.json",
    "coordination/repo-governance/pr46-final-ready-repair-design.md",
    "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md",
    "scripts/verify-sena-repo-governance.mjs",
    "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
  ],
  "authorizationBoundary": {
    "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks": true,
    "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks": false,
    "pr46ReadyAndProtectedMergeAuthorizedNow": false,
    "localRefRetirementAuthorized": false,
    "branchDeletionAuthorized": false,
    "worktreeRemovalAuthorized": false,
    "orphanWorktreeMutationAuthorized": false,
    "deploymentAuthorized": false,
    "providerMutationAuthorized": false,
    "resetAuthorized": false,
    "rebaseAuthorized": false,
    "stashAuthorized": false,
    "forceAuthorized": false,
    "historyRewriteAuthorized": false
  }
}
```

Record the frozen blocker tree `2a1f436e61d69e1b158e9bbdc526b5842922ccb7`, registry blob `f50af94583b3c8e50e1084eb1c1cdd5ce05c5d8b`, registry-only diff SHA-256 `38cebc0f82b5294a849f3644f259901e25c065020ac69001fecd47ce6eb388e1`, status SHA-256 `f8c06cfa548444a7ddb521145d3177b7ec425ee36b0911cd20e0b1b53598be37`, 96/97 result, spec P1, and quality P2 as evidence, not authority.

- [ ] **Step 4: Stage exactly the five-path initial candidate and run the local gates**

```bash
git add -- \
  coordination/repo-governance/active-work.json \
  coordination/repo-governance/pr46-final-ready-repair-design.md \
  coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md \
  scripts/verify-sena-repo-governance.mjs \
  sena-hk-template/lib/sena/__tests__/repo-governance.test.ts
jq empty coordination/repo-governance/active-work.json
node --check scripts/verify-sena-repo-governance.mjs
git diff --cached --check
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  SENA_GOVERNANCE_TARGET_ROOT=/Volumes/Starship/SENA/.worktrees/sena-a01-repo-governance-20260827 \
  node scripts/verify-sena-repo-governance.mjs audit --pre-commit --registry-from-index
env TMPDIR=/Volumes/Starship/SENA/.tmp .githooks/pre-commit
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  npm --prefix sena-hk-template test -- lib/sena/__tests__/repo-governance.test.ts
```

Expected: exact five-path overall candidate, audit/write/security pass, the PR80 lifecycle contract observed RED before implementation now GREEN, and the protected-main governance file's exact current test count passes completely. Record the count rather than reusing PR46's 97-test claim.

The focused PR80 mutation table must cover prefix count, prefix SHA-256, historical-prefix receipt drift, direct-final bootstrap, unchanged initial replay, exact index path mismatch, lifecycle core drift, sibling top-level authorization, `allowedPaths` widening, owner/disposition drift, historical authorization mutation, non-A01 registry drift, missing/extra/reordered/scope-expanded receipts, CI array cardinality/distinctness, lifecycle/receipt mismatch, observation-context mismatch, final PR Draft/Ready/number/state/head drift, and final replay. It must also exercise the initial-registry selector with initial, final, post-final, missing-head, and unavailable-head inputs in the present run.

The write-policy invocation must compare the stage-0 tree to the lifecycle-selected source commit: exact protected `ca7d464` for the initial state, and the exact recorded initial PR80 head for the final state. It must reject any path set other than the five-path initial scope or registry-only final scope, respectively.

At each PR80 transition, require the full candidate receipt array to equal the source array plus exactly one ordered PR80 receipt. The final PR80 commit seals the A01 writer lane, so any unchanged-final-lifecycle A01 delta fails closed. Standalone registry validation still permits later non-PR80 receipts appended by a separately validated non-A01 lane—planned work continues on the branch-retirement lane—while pinning the protected prefix and both PR80 receipts.

- [ ] **Step 5: Obtain exact read-only spec and quality reviews**

Freeze and provide reviewers with:

```bash
git write-tree
git ls-files -s -- coordination/repo-governance/active-work.json coordination/repo-governance/pr46-final-ready-repair-design.md coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md scripts/verify-sena-repo-governance.mjs sena-hk-template/lib/sena/__tests__/repo-governance.test.ts
git diff --cached --binary --no-ext-diff --no-renames HEAD -- coordination/repo-governance/active-work.json coordination/repo-governance/pr46-final-ready-repair-design.md coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md scripts/verify-sena-repo-governance.mjs sena-hk-template/lib/sena/__tests__/repo-governance.test.ts | shasum -a 256
git status --porcelain=v1 | shasum -a 256
shasum -a 256 coordination/repo-governance/active-work.json
```

Expected: no P0/P1 findings; reviewers are read-only and mutate nothing.

- [ ] **Step 6: Commit and push the initial PR80 candidate**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp git commit -m "chore(governance): authorize PR46 final-ready repair"
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  git push origin codex/sena-a01-repo-governance-20260827
```

Expected: named remote branch equals the new local candidate head; no other ref changes.

- [ ] **Step 7: Create Draft PR80 and wait for initial checks**

```bash
gh pr create --draft \
  --base main \
  --head codex/sena-a01-repo-governance-20260827 \
  --title "chore(governance): authorize PR46 final-ready repair" \
  --body "Protected minimal-repair authorization only. PR46 remains Draft; no cleanup or target mutation is authorized."
```

Expected: returned PR number is exactly 80. Wait for build, PR security, and push security bound to the exact candidate head; all must conclude `success` with annotation arrays `[]`.

## Task 3: Finalize and protected-merge PR80

**Files:**
- Modify: `coordination/repo-governance/active-work.json`

- [ ] **Step 1: Record exact initial PR80 CI and consume the metadata action**

Use `gh pr checks 80 --json bucket,link,name,state,workflow` to obtain the exact successful check links and integer job identities, then run the following loop with those returned IDs to require empty annotation arrays:

```bash
for pr80_job_id in $(gh pr checks 80 --json bucket,link --jq '.[] | select(.bucket == "pass") | .link' | sed -E 's#^.*/job/([0-9]+)$#\1#'); do
  gh api "repos/HUDongpin/SENA/check-runs/${pr80_job_id}/annotations"
done
```

Patch the lifecycle to:

```json
{
  "status": "pr80-ready-authorization-pending-final-head-checks",
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks": false,
  "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks": true,
  "pr46ReadyAndProtectedMergeAuthorizedNow": false,
  "localRefRetirementAuthorized": false,
  "branchDeletionAuthorized": false,
  "worktreeRemovalAuthorized": false,
  "orphanWorktreeMutationAuthorized": false,
  "deploymentAuthorized": false,
  "providerMutationAuthorized": false,
  "resetAuthorized": false,
  "rebaseAuthorized": false,
  "stashAuthorized": false,
  "forceAuthorized": false,
  "historyRewriteAuthorized": false
}
```

Populate `initialCandidateCompletionEvidence` with the exact committed initial head, tree, registry blob, one build run, exactly two distinct repository-security runs, exactly three distinct check jobs, empty-annotation proof, and both immutable-review approvals read in this step. The local validator cannot authenticate a GitHub ID merely from its numeric magnitude; authenticity comes from the exact `gh` readback and immutable review. It does require exact cardinality/distinctness and equality with both the final receipt and the explicitly supplied pre-commit observation context.

Update both A01 records to the exact observed pre-final state: PR number 80, state OPEN, base `main`, Draft true, Ready false, merge-authorized false, and `MERGEABLE/CLEAN`. Set the work-item head, branch head, remote head, and PR head to the exact initial candidate head. Wrong/missing PR identity, non-Draft/Ready claims, merge authorization, or any head mismatch must fail during this initial-to-final transition. Do not apply this pre-final constraint as a permanent standalone snapshot rule: after protected merge, the branch-retirement lane may record truthful MERGED/non-Draft/final-head/merge-commit currentness and A01 closeout while preserving immutable PR80 lifecycle evidence.

- [ ] **Step 2: Add exactly one final PR80 receipt**

Append `pr80-final-ready-test-repair-final-authorization` with registry-only scope. Its initial-candidate evidence fields receive the exact head/tree/blob/run/job values read in Step 1. Its action closure is exactly:

```json
{
  "schemaVersion": "sena-registry-reconciliation-receipt/v1",
  "receiptKind": "pr80-final-ready-test-repair-final-authorization",
  "status": "authorized-for-pr80-ready-and-protected-merge-after-final-head-checks",
  "taskId": "SENA-A01-REPO-GOVERNANCE-20260827",
  "ownerKey": "Codex-primary-writer",
  "scope": [
    "coordination/repo-governance/active-work.json"
  ],
  "authorizationBoundary": {
    "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks": false,
    "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks": true,
    "pr46ReadyAndProtectedMergeAuthorizedNow": false,
    "localRefRetirementAuthorized": false,
    "retirementReceiptMintingAuthorized": false,
    "branchDeletionAuthorized": false,
    "worktreeRemovalAuthorized": false,
    "orphanWorktreeMutationAuthorized": false,
    "targetTagMutationAuthorized": false,
    "quarantineMutationAuthorized": false,
    "deploymentAuthorized": false,
    "providerMutationAuthorized": false,
    "resetAuthorized": false,
    "rebaseAuthorized": false,
    "stashAuthorized": false,
    "forceAuthorized": false,
    "historyRewriteAuthorized": false
  }
}
```

Also copy all evidence fields into the final receipt: `authorizationSourceInitialHeadSha`, `authorizationSourceInitialTreeSha`, `authorizationSourceInitialRegistryBlobSha`, `buildRunId`, `repositorySecurityRunIds`, `checkJobIds`, `requiredChecksPassed`, `annotationsEmpty`, `specReviewApproved`, and `qualityReviewApproved`. Any missing field or mismatch fails closed.

- [ ] **Step 3: Run final local gates, full tests, and immutable reviews**

Repeat the audit, hook, full-test, hash-freeze, and immutable-review gates from Task 2 with exactly one staged registry path. Supply the exact observed build/security/job IDs and the three true readback/review booleans through `SENA_PR80_INITIAL_BUILD_RUN_ID`, `SENA_PR80_INITIAL_REPOSITORY_SECURITY_RUN_IDS`, `SENA_PR80_INITIAL_CHECK_JOB_IDS`, `SENA_PR80_INITIAL_REQUIRED_CHECKS_PASSED`, `SENA_PR80_INITIAL_ANNOTATIONS_EMPTY`, `SENA_PR80_INITIAL_SPEC_REVIEW_APPROVED`, and `SENA_PR80_INITIAL_QUALITY_REVIEW_APPROVED` to both the direct write-policy command and the pre-commit hook. Explicitly run the PR80 transition validator against the exact initial candidate commit and final index.

Expected: the final receipt is the sole ordered delta; the earlier action is false; the Ready/merge action is the only newly true authorization across the complete A01 work item and branch; every historical A01 authorization path is unchanged; and an exact field-level comparison permits only lifecycle/evidence/currentness fields while rejecting sibling authorization, `allowedPaths`, owner/disposition, or historical-state drift. Both reviewers must approve with no P0/P1.

- [ ] **Step 4: Commit, push, and verify fresh final-head checks**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  SENA_PR80_INITIAL_BUILD_RUN_ID="$pr80_initial_build_run_id" \
  SENA_PR80_INITIAL_REPOSITORY_SECURITY_RUN_IDS="$pr80_initial_security_run_ids" \
  SENA_PR80_INITIAL_CHECK_JOB_IDS="$pr80_initial_check_job_ids" \
  SENA_PR80_INITIAL_REQUIRED_CHECKS_PASSED=true \
  SENA_PR80_INITIAL_ANNOTATIONS_EMPTY=true \
  SENA_PR80_INITIAL_SPEC_REVIEW_APPROVED=true \
  SENA_PR80_INITIAL_QUALITY_REVIEW_APPROVED=true \
  git commit -m "chore(governance): finalize PR46 repair authorization"
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  git push origin codex/sena-a01-repo-governance-20260827
```

Expected: new exact head gets a fresh build and both security checks; all success, all annotations empty.

- [ ] **Step 5: Mark PR80 Ready and merge through protection**

```bash
gh pr ready 80
gh pr merge 80 --merge --match-head-commit "$(git rev-parse HEAD)"
```

Expected: no `--admin`, no branch deletion, and GitHub records a two-parent protected-main merge commit whose second parent is the exact final PR80 head.

- [ ] **Step 6: Verify PR80 post-main evidence**

Wait for post-main build and repository-security. Require success and empty annotations, then run:

```bash
git fetch --no-tags origin main
node scripts/verify-sena-repo-governance.mjs audit --live --registry-from-commit "$(git rev-parse origin/main)"
```

Expected: `errors=[]`, `ownerBlockers=[]`, `unreachableCommitCount=0`. The A01 writer lane is now terminal and must receive no third commit; Task 4 and every later governance lifecycle run from the separately validated branch-retirement lane. Only now may Task 4 start.

## Task 4: Reconcile PR46 with PR80 protected main and produce RED evidence

**Files:**
- Modify: `coordination/repo-governance/active-work.json`
- Modify: `scripts/verify-sena-repo-governance.mjs`
- Modify: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:3749-4175`

- [ ] **Step 1: Revalidate exact clean PR46 custody**

Require local, named remote, and live PR46 head all equal `e24c635d1f53fccb2264c6be002aec2775de127c`; require a clean worktree/index and both keep-around refs exact. Stop on drift.

- [ ] **Step 2: Preflight the exact protected merge**

Fetch main, require live `refs/heads/main` and fetched `origin/main` equality, and freeze that exact 40-hex commit as the task-scoped `pr80_verified_main_sha`. Run merge-base, merge-tree, post-main CI evidence, and commit-bound live audit against that frozen SHA. Expected conflict set: registry, verifier, and governance test exactly. Expected candidate-only clean set: empty. Expected protected-only clean set: the design and implementation-plan documents exactly. Record the merge-tree and all base/candidate/protected blobs and path sets. Any different topology or subsequent main advance invalidates this lifecycle and requires a fresh preflight.

```bash
git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
pr80_fetched_main_sha=$(git rev-parse origin/main)
pr80_live_main_sha=$(git ls-remote --heads origin refs/heads/main | awk '{print $1}')
test "$pr80_fetched_main_sha" = "$pr80_live_main_sha"
pr80_verified_main_sha=$pr80_fetched_main_sha
test "${#pr80_verified_main_sha}" -eq 40
```

- [ ] **Step 3: Run one ordinary merge without committing**

```bash
test "$(git rev-parse origin/main)" = "$pr80_verified_main_sha"
test "$(git ls-remote --heads origin refs/heads/main | awk '{print $1}')" = "$pr80_verified_main_sha"
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  git merge --no-ff --no-commit "$pr80_verified_main_sha"
```

Expected: both equality checks pass immediately before mutation; `HEAD` and `ORIG_HEAD` equal `e24c635d1f53fccb2264c6be002aec2775de127c`; `MERGE_HEAD` equals the already reviewed `pr80_verified_main_sha`; `MERGE_AUTOSTASH` is absent; exactly registry, verifier, and governance test are unmerged. Do not resolve `origin/main` a second time as the merge operand.

- [ ] **Step 4: Resolve the exact three-file conflict composition**

Keep stages 1/2/3 available until resolution proof is frozen. For `active-work.json`, use the exact stage-3 protected file as the full base, then reconstruct only the branch-retirement work item/branch, pending-to-remerge-consumed projection, PR80 activation evidence, blocker evidence, and one bounded repair receipt. For the verifier, preserve the complete PR46 final-base-handshake/local-retirement implementation and port the protected PR80 lifecycle enforcement before applying the explicit activation-number repair. For the governance test, preserve the complete PR46 97-test surface, port the PR80 negative contracts, and replace the mutable-checkout integration fixture with the deterministic projection matrix. Stage no path until conflict markers are absent and each composed file passes syntax/diff checks.

- [ ] **Step 5: Add RED assertions without changing production code**

First record the existing aggregate test's two state-coupling RED cases without changing it:

1. from a clean committed final-ready head, it still requests `--candidate-registry-from-index --staged` even though no stage-0 registry delta exists;
2. from a clean post-main checkout, using current `origin/main` as the authorization source feeds a consumed/final-ready registry into a source validator that correctly requires `pending-protected-activation`.

Then replace that aggregate test with a deterministic fixture that never reads the live SENA `projectRoot` index, status, current branch, named remote, or `refs/remotes/origin/main`. Reuse the pure `finalBaseHandshakeResolutionFromRegistries` entry point with explicit cloned source/candidate registries and contexts. Within the existing test count, assert this exact matrix:

- staged remerge projection resolves only to `final-base-handshake-remerge-consumed-awaiting-ci`;
- clean committed remerge-head projection resolves to the same exact mode;
- staged registry-only final-ready projection resolves only to `final-base-handshake-final-ready-pending-head-checks`;
- clean committed final-ready-head projection resolves to the same exact mode;
- simulated post-main execution replays the preserved pending source snapshot and final candidate snapshot without consulting the checkout's consumed main registry, and resolves to the final-ready mode;
- ambiguous/missing projection source, missing stage-0 input, dirty-head projection, arbitrary status, unknown nested true authorization, retained prior action, parent/path/blob drift, and receipt drift all fail closed.

Keep the operational command coverage separate: Task 5 Step 4 invokes `conflict-intake` against the real exact staged candidate, and Task 6 invokes it again against the real exact final-ready candidate. The full Vitest fixture must not depend on either transient index.

In the same pure matrix, set `sourceAuthorization.protectedActivationBinding.requiredActivationPullRequestNumber = 80` and `remergeAuthorization.protectedActivationCompletionEvidence.pullRequestNumber = 80`. Add negative cases that set the required activation number to `0`, omit it, or change the completion evidence number to `79`.

- [ ] **Step 6: Run focused tests and require RED from the hard-coded production validator**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  npm --prefix sena-hk-template test -- lib/sena/__tests__/repo-governance.test.ts \
  -t "accepts only the exact three-state final-base handshake projections"
```

Expected before production repair: FAIL because valid PR80 evidence is rejected by the hard-coded PR79 check. The deterministic projection cases themselves must no longer depend on whether the PR46 worktree currently has a staged index. Record the exact rule and assertion.

## Task 5: Implement the minimal verifier repair and create the PR46 remerge candidate

**Files:**
- Modify: `scripts/verify-sena-repo-governance.mjs:885-1040`
- Test: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:3749-4175`
- Modify: `coordination/repo-governance/active-work.json`

- [ ] **Step 1: Update the pending topology validator to the exact protected PR80 shape**

In `finalBaseHandshakePendingTopologyErrors`, require the exact three-conflict set (registry, verifier, governance test), an empty candidate-only clean set, and the exact two-document protected-only clean set. Bind those sets to the protected `pendingState` fields and add negative cases for every missing, extra, or reclassified path. This is a protected topology correction; do not retain the former registry-only-conflict/candidate-only-code assumption.

- [ ] **Step 2: Validate the protected activation PR number in the source**

In `validateFinalBaseHandshakeSource`, add this condition to the existing invalid-source branch:

```js
!Number.isInteger(
  authorization.protectedActivationBinding?.requiredActivationPullRequestNumber
) ||
authorization.protectedActivationBinding.requiredActivationPullRequestNumber <= 0 ||
```

- [ ] **Step 3: Replace the hard-coded PR79 completion check**

At the start of `validateProtectedActivationCompletionEvidence`, derive the protected number:

```js
const requiredActivationPullRequestNumber =
  candidateAuthorization?.protectedActivationBinding?.requiredActivationPullRequestNumber;
```

Replace `evidence.pullRequestNumber !== 79` with:

```js
!Number.isInteger(requiredActivationPullRequestNumber) ||
requiredActivationPullRequestNumber <= 0 ||
evidence.pullRequestNumber !== requiredActivationPullRequestNumber
```

Do not change any commit/tree/blob/parent/run/job/annotation/audit checks.

- [ ] **Step 4: Run focused GREEN tests**

Run the exact focused command from Task 4 Step 6 plus the deterministic projection-matrix test filter. Expected: staged-index, clean remerge head, staged/clean final-ready, and simulated post-main contexts all pass from explicit snapshots; omitted/zero activation number, mismatched activation evidence, mutable-state fallback, and every existing negative mutation fail closed.

- [ ] **Step 5: Stage exactly three paths and run all local gates**

```bash
git add -- \
  coordination/repo-governance/active-work.json \
  scripts/verify-sena-repo-governance.mjs \
  sena-hk-template/lib/sena/__tests__/repo-governance.test.ts
node --check scripts/verify-sena-repo-governance.mjs
git diff --cached --check
node scripts/verify-sena-repo-governance.mjs audit --pre-commit --registry-from-index
node scripts/verify-sena-repo-governance.mjs write-policy --registry-from-index --staged
node scripts/verify-sena-repo-governance.mjs security --staged
node scripts/verify-sena-repo-governance.mjs conflict-intake \
  --authorization-registry-commit "$(git rev-parse origin/main)" \
  --candidate-registry-from-index --staged
```

Expected: exact three staged paths, all gates pass, final-base mode is remerge-consumed, and normalized non-owned registry hashes match.

- [ ] **Step 6: Run the complete 97-test governance file**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  npm --prefix sena-hk-template test -- lib/sena/__tests__/repo-governance.test.ts
```

Expected: `Test Files 1 passed` and `Tests 97 passed`; no skipped or failed test in the full run.

- [ ] **Step 7: Freeze exact staged evidence and obtain final read-only reviews**

Record staged tree, three stage-0 blobs, both parent-domain binary-diff SHA-256 values, three file SHA-256 values, and porcelain-status SHA-256. Require spec and quality `FINAL_APPROVED` with P0-P3 zero.

- [ ] **Step 8: Commit and push the ordinary two-parent candidate**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp git commit -m "merge(governance): repair PR46 final-ready lifecycle"
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  git push origin codex/sena-branch-retirement-20260829
```

Expected: the first parent is `e24c635d1f53fccb2264c6be002aec2775de127c`; the second parent is the exact 40-hex value returned by `git rev-parse origin/main` immediately before the merge; the commit has the reviewed tree/blobs, a clean worktree, and named remote equality. PR46 remains Draft.

- [ ] **Step 9: Verify initial exact-head CI**

Wait for build, PR security, and push security at the new exact head. Require all success and all annotation arrays empty. Record run/job IDs.

## Task 6: Create the genuine final-ready PR46 head and merge it

**Files:**
- Modify: `coordination/repo-governance/active-work.json`

- [ ] **Step 1: Create the registry-only final authorization**

Record the exact preceding candidate head/tree/registry/verifier/test blobs, ordered parents, both binary-diff SHA-256 values, normalized registry hash, 97/97, reviews, and initial CI identities. Set:

```json
{
  "status": "final-pr46-ready-authorization-pending-final-head-checks",
  "finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation": false,
  "finalResolverAndTestStageAuthorizedAfterProtectedActivation": false,
  "finalMergeCommitPushAuthorizedAfterRequiredGates": false,
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks": false,
  "pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks": true,
  "localRefRetirementAuthorized": false,
  "branchDeletionAuthorized": false,
  "worktreeRemovalAuthorized": false,
  "orphanWorktreeMutationAuthorized": false,
  "deploymentAuthorized": false,
  "providerMutationAuthorized": false,
  "resetAuthorized": false,
  "rebaseAuthorized": false,
  "stashAuthorized": false,
  "forceAuthorized": false,
  "historyRewriteAuthorized": false
}
```

Append exactly one bounded `pr46-final-base-handshake-final-authorization` receipt with registry-only scope and the same sole true conditional Ready/merge path.

- [ ] **Step 2: Prove the final-ready index is genuinely green**

Stage only `active-work.json`; rerun audit, write-policy, security, final-ready conflict-intake, the complete 97-test file, and exact read-only reviews. Expected: conflict-intake mode `final-base-handshake-final-ready-pending-head-checks` and 97/97, not 96/97.

- [ ] **Step 3: Commit, push, and verify final exact-head checks**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp git commit -m "chore(governance): finalize PR46 protected merge authorization"
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  git push origin codex/sena-branch-retirement-20260829
```

Wait for fresh build and both security checks bound to the exact final head; require success and empty annotations.

- [ ] **Step 4: Mark PR46 Ready and merge with exact-head lease**

```bash
gh pr ready 46
gh pr merge 46 --merge --match-head-commit "$(git rev-parse HEAD)"
```

Expected: no admin bypass and no branch deletion.

- [ ] **Step 5: Verify post-main and fast-forward the root**

Wait for protected-main build/security and empty annotations. Run commit-bound live audit. Then, only if the root is clean and fetched/live main agree, fast-forward `/Volumes/Starship/SENA` with `git merge --ff-only origin/main`. From that clean post-main checkout, rerun the complete governance test file with no staged index; this is the acceptance proof that the deterministic fixture no longer depends on a transient PR46 projection.

Expected: root/main/live origin are one exact commit, audit `errors=[]`, `ownerBlockers=[]`, `unreachableCommitCount=0`, and the complete governance file remains 97/97 from clean post-main.

## Task 7: Hand off to the existing serial cleanup lifecycle

**Files:**
- Reference: `coordination/repo-governance/active-work.json`
- Reference: exact external custody manifests and receipts; do not open credential document contents.

- [ ] **Step 1: Recompute final topology and authority before cleanup**

Run `git branch -vv`, `git worktree list --porcelain`, live `git ls-remote --heads origin`, PR queries, all worktree status checks, process/lock checks, custody hash/mode/bundle verification, and the protected registry audit.

- [ ] **Step 2: Continue the already approved retirement order**

Do not batch operations. Use the protected guarded local-ref mechanism serially for Human-AI, quirky, statistical-integrity, and ledger quarantine. Each successor begins only after the prior execution/receipt/closeout reaches protected main.

- [ ] **Step 3: Close invalid pointers, EvidenceFlow, A01, and branch-retirement lanes**

Require per-object recovery custody and process/lock absence before invalid-pointer removal. Preserve and integrate or archive the dirty EvidenceFlow lane before worktree removal. Remove A01 and branch-retirement worktrees/branches last.

- [ ] **Step 4: Prove the requested final state**

Expected authoritative local result:

```text
local branch count: 1
local branch: main
registered worktree count: 1
registered worktree: /Volumes/Starship/SENA
root status: clean
```

Report live remote branches separately. Do not claim remote deletion unless separately authorized and executed.

## Plan self-review

- Spec coverage: Tasks 2-3 protect PR80's own transition and receipt closure before activation; Tasks 4-6 cover deterministic PR46 projections, activation identity, RED/GREEN, CI, review, lease, and clean post-main test proof. Task 7 preserves the original one-branch/one-worktree objective.
- Placeholder scan: runtime-generated commit/run/job IDs are obtained by exact commands and written only after readback; no predicted identity is treated as evidence.
- Type consistency: both PR80 statuses, both PR80 action paths and receipt kinds, `requiredActivationPullRequestNumber`, both final-base statuses, both resolver modes, and authorization field names are identical across registry, verifier, and test steps.
- Scope consistency: no task authorizes cleanup before PR46 post-main verification, and no task uses reset, rebase, stash, force, broad staging, deployment, provider mutation, or history rewrite.
