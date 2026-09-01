# PR46 Final-Ready Protected Minimal-Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect one minimal repair lifecycle, make the PR46 final-ready integration test state-aware, bind activation evidence to the exact protected PR number, merge PR46 through protected main, and leave every cleanup object untouched until PR46 post-main verification passes.

**Architecture:** A two-phase A01 PR80 records and activates the repair authority. After PR80 post-main verification, the existing PR46 branch is remerged with that exact protected commit; two RED-first changes are made only in the verifier and governance test, and the registry is reconstructed from the protected source. A later registry-only PR46 final commit must genuinely pass the same 97-test file in final-ready state before exact-head protected merge.

**Tech Stack:** Git worktrees and object plumbing, GitHub CLI, Node.js ESM, TypeScript, Vitest, JSON governance registry, GitHub Actions build/security gates.

---

## File map and ownership

- Create in A01: `coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md` — this executable plan.
- Modify in A01: `coordination/repo-governance/active-work.json` — PR80 lifecycle, protected PR46 repair source, exact evidence, A01 receipts, and branch/work-item heartbeats.
- Modify in PR46 after PR80 activation: `coordination/repo-governance/active-work.json` — protected-source reconstruction, repair/remerge projection, completion evidence, and bounded receipts.
- Modify in PR46 after PR80 activation: `scripts/verify-sena-repo-governance.mjs:885-1040` — validate a protected `requiredActivationPullRequestNumber` instead of hard-coding PR79.
- Modify in PR46 after PR80 activation: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:3749-3770` — bind the integration assertion to the exact stage-0 registry status.
- Extend tests in PR46: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:3830-4175` — RED/GREEN coverage for activation PR identity and unknown-state rejection without increasing the top-level 97-test count.
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
    "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md"
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
    "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md"
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

- [ ] **Step 4: Stage only the registry and run the local gates**

```bash
git add -- coordination/repo-governance/active-work.json
jq empty coordination/repo-governance/active-work.json
git diff --cached --check
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  SENA_GOVERNANCE_TARGET_ROOT=/Volumes/Starship/SENA/.worktrees/sena-a01-repo-governance-20260827 \
  node scripts/verify-sena-repo-governance.mjs audit --pre-commit --registry-from-index
env TMPDIR=/Volumes/Starship/SENA/.tmp .githooks/pre-commit
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  npm --prefix sena-hk-template test -- lib/sena/__tests__/repo-governance.test.ts
```

Expected: audit/write/security pass, only `active-work.json` staged, and the protected-main governance file's exact current test count passes completely. Record the count rather than reusing PR46's 97-test claim.

- [ ] **Step 5: Obtain exact read-only spec and quality reviews**

Freeze and provide reviewers with:

```bash
git write-tree
git ls-files -s -- coordination/repo-governance/active-work.json coordination/repo-governance/pr46-final-ready-repair-design.md coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md
git diff --cached --binary --no-ext-diff --no-renames HEAD -- coordination/repo-governance/active-work.json | shasum -a 256
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
  "status": "pr80-repair-authorization-final-ready-pending-final-head-checks",
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

- [ ] **Step 2: Add exactly one final PR80 receipt**

Append `pr80-final-ready-test-repair-final-authorization` with registry-only scope. Its initial-candidate evidence fields receive the exact head/tree/blob/run/job values read in Step 1. Its action closure is exactly:

```json
{
  "schemaVersion": "sena-registry-reconciliation-receipt/v1",
  "receiptKind": "pr80-final-ready-test-repair-final-authorization",
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

- [ ] **Step 3: Run final local gates, full tests, and immutable reviews**

Repeat Task 2 Step 4 and Step 5 with exactly one staged registry path. Expected: all gates and the entire protected-main governance test file pass; both reviewers approve the exact final tree with no P0/P1.

- [ ] **Step 4: Commit, push, and verify fresh final-head checks**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp git commit -m "chore(governance): finalize PR46 repair authorization"
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

Expected: `errors=[]`, `ownerBlockers=[]`, `unreachableCommitCount=0`. Only now may Task 4 start.

## Task 4: Reconcile PR46 with PR80 protected main and produce RED evidence

**Files:**
- Modify: `coordination/repo-governance/active-work.json`
- Modify: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:3749-4175`

- [ ] **Step 1: Revalidate exact clean PR46 custody**

Require local, named remote, and live PR46 head all equal `e24c635d1f53fccb2264c6be002aec2775de127c`; require a clean worktree/index and both keep-around refs exact. Stop on drift.

- [ ] **Step 2: Preflight the exact protected merge**

Run merge-base and merge-tree against freshly fetched `origin/main`. Expected: `active-work.json` is the sole conflict and verifier/test are candidate-only clean paths. Record the exact merge-tree, base blob, candidate blob, protected blob, path sets, and binary-diff hashes.

- [ ] **Step 3: Run one ordinary merge without committing**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp git merge --no-ff --no-commit "$(git rev-parse origin/main)"
```

Expected: `HEAD` and `ORIG_HEAD` equal `e24c635d1f53fccb2264c6be002aec2775de127c`; `MERGE_HEAD` equals the exact 40-hex value returned by `git rev-parse origin/main` immediately before the merge; `MERGE_AUTOSTASH` is absent; only `active-work.json` is unmerged.

- [ ] **Step 4: Restore the complete protected registry and reconstruct only branch-retirement-owned fields**

Use the exact stage-3 protected `active-work.json` as the full base. Reconstruct the branch-retirement work item/branch, the pending-to-remerge-consumed projection, PR80 activation evidence, blocker evidence, and one bounded repair receipt. Preserve all other protected registry semantics.

- [ ] **Step 5: Add RED assertions without changing production code**

In `repo-governance.test.ts`, add this exact helper near the existing Git helpers:

```ts
function expectedFinalBaseHandshakeModeForStatus(status: unknown) {
  if (status === "consumed-by-final-pr46-remerge-candidate-awaiting-ci") {
    return "final-base-handshake-remerge-consumed-awaiting-ci";
  }
  if (status === "final-pr46-ready-authorization-pending-final-head-checks") {
    return "final-base-handshake-final-ready-pending-head-checks";
  }
  throw new Error(`unsupported final-base handshake status: ${String(status)}`);
}
```

Replace the hard-coded mode assertion with an exact stage-0 index read:

```ts
const stagedRegistry = JSON.parse(
  runGit(projectRoot, ["show", ":coordination/repo-governance/active-work.json"])
);
const stagedStatus = stagedRegistry.workItems.find(
  (entry: { taskId?: string }) => entry.taskId === "SENA-BRANCH-RETIREMENT-20260829"
)?.finalBaseHandshakeAuthorization?.status;
expect(exact.stdout).toContain(
  `mode=${expectedFinalBaseHandshakeModeForStatus(stagedStatus)}`
);
```

In the existing pure three-state test, set the protected binding and evidence to PR80 and add negative mutations:

```ts
sourceAuthorization.protectedActivationBinding.requiredActivationPullRequestNumber = 80;
remergeAuthorization.protectedActivationCompletionEvidence.pullRequestNumber = 80;

expect(() => expectedFinalBaseHandshakeModeForStatus("pending-protected-activation")).toThrow(
  "unsupported final-base handshake status"
);
```

Add existing-table negative cases that set the required activation number to `0` and the completion evidence number to `79`.

- [ ] **Step 6: Run focused tests and require RED from the hard-coded production validator**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  npm --prefix sena-hk-template test -- lib/sena/__tests__/repo-governance.test.ts \
  -t "accepts only the exact three-state final-base handshake projections"
```

Expected before production repair: FAIL because valid PR80 evidence is rejected by the hard-coded PR79 check. Record the exact rule and assertion.

## Task 5: Implement the minimal verifier repair and create the PR46 remerge candidate

**Files:**
- Modify: `scripts/verify-sena-repo-governance.mjs:885-1040`
- Test: `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts:3749-4175`
- Modify: `coordination/repo-governance/active-work.json`

- [ ] **Step 1: Validate the protected activation PR number in the source**

In `validateFinalBaseHandshakeSource`, add this condition to the existing invalid-source branch:

```js
!Number.isInteger(
  authorization.protectedActivationBinding?.requiredActivationPullRequestNumber
) ||
authorization.protectedActivationBinding.requiredActivationPullRequestNumber <= 0 ||
```

- [ ] **Step 2: Replace the hard-coded PR79 completion check**

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

- [ ] **Step 3: Run focused GREEN tests**

Run the exact focused command from Task 4 Step 6 plus the integration test filter `validates the exact PR46 conflict triple`. Expected: both pass; unknown state, zero activation number, and mismatched activation evidence fail closed in their mutation tables.

- [ ] **Step 4: Stage exactly three paths and run all local gates**

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

- [ ] **Step 5: Run the complete 97-test governance file**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  npm --prefix sena-hk-template test -- lib/sena/__tests__/repo-governance.test.ts
```

Expected: `Test Files 1 passed` and `Tests 97 passed`; no skipped or failed test in the full run.

- [ ] **Step 6: Freeze exact staged evidence and obtain final read-only reviews**

Record staged tree, three stage-0 blobs, both parent-domain binary-diff SHA-256 values, three file SHA-256 values, and porcelain-status SHA-256. Require spec and quality `FINAL_APPROVED` with P0-P3 zero.

- [ ] **Step 7: Commit and push the ordinary two-parent candidate**

```bash
env TMPDIR=/Volumes/Starship/SENA/.tmp git commit -m "merge(governance): repair PR46 final-ready lifecycle"
env TMPDIR=/Volumes/Starship/SENA/.tmp \
  NPM_CONFIG_CACHE=/Volumes/Starship/SENA/.tmp/npm-cache \
  git push origin codex/sena-branch-retirement-20260829
```

Expected: the first parent is `e24c635d1f53fccb2264c6be002aec2775de127c`; the second parent is the exact 40-hex value returned by `git rev-parse origin/main` immediately before the merge; the commit has the reviewed tree/blobs, a clean worktree, and named remote equality. PR46 remains Draft.

- [ ] **Step 8: Verify initial exact-head CI**

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

Wait for protected-main build/security and empty annotations. Run commit-bound live audit. Then, only if the root is clean and fetched/live main agree, fast-forward `/Volumes/Starship/SENA` with `git merge --ff-only origin/main`.

Expected: root/main/live origin are one exact commit, audit `errors=[]`, `ownerBlockers=[]`, `unreachableCommitCount=0`.

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

- Spec coverage: Tasks 2-6 cover every repair, activation, RED/GREEN, CI, review, lease, and post-main requirement in the approved design. Task 7 preserves the original one-branch/one-worktree objective.
- Placeholder scan: runtime-generated commit/run/job IDs are obtained by exact commands and written only after readback; no predicted identity is treated as evidence.
- Type consistency: `requiredActivationPullRequestNumber`, both final-base statuses, both resolver modes, and authorization field names are identical across registry, verifier, and test steps.
- Scope consistency: no task authorizes cleanup before PR46 post-main verification, and no task uses reset, rebase, stash, force, broad staging, deployment, provider mutation, or history rewrite.
