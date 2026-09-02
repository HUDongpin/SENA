# Protected Currentness and PR46 Activation Repair Design

Status: owner-reviewed written specification; implementation remains blocked pending the implementation-plan execution choice and its exact protected gates.

Date: 2026-09-01

Owners: SENA-A01 coordination, SENA-A10 governance/security, SENA-A11 verification, and SENA-BRANCH-RETIREMENT-20260829

## 1. Decision

Create one self-closing protected repair pull request from exact protected main
`969a206b798c159e15ae0b6e5c76d0c94cca92ea`. The pull request number must be
read back from GitHub after Draft PR creation; `PR82` is only the expected label
at design time.

The repair has three responsibilities:

1. distinguish non-destructive currentness observation from cleanup or deletion
   authorization;
2. validate an exact chain of protected-main advances while the read-only root
   is behind or after it fast-forwards; and
3. replace PR46's stale PR80 activation source with a new immutable activation
   binding established on protected main, never by PR46 itself.

The repair must close its own post-merge observation gap. It must not require a
second registry-only closeout PR merely to describe that the repair PR merged.

## 2. Frozen source evidence

The design is based on these independently verified current facts:

- protected and fetched `origin/main`:
  `969a206b798c159e15ae0b6e5c76d0c94cca92ea`;
- PR81 final head:
  `0444b59968f6699f0ace6f4cb6eda4d6f8f44695`;
- PR81 merge commit:
  `969a206b798c159e15ae0b6e5c76d0c94cca92ea`;
- PR46 local, named-remote, and live Draft PR head:
  `e24c635d1f53fccb2264c6be002aec2775de127c`;
- PR46 tree:
  `56be367593f0b41c89fe74536e9c3834ce08fcc0`;
- read-only root local `main`:
  `a8da14209a9e14a3a53e29e13c86ae8eecbd5928`;
- local topology before this design lane: nine local branches and four
  registered worktrees;
- live remote topology: `main` plus the A01, PR46, EvidenceFlow, and PR81
  branches; no remote deletion is authorized.

PR81 final-head and post-main build/security checks passed with zero
annotations. Its commit-bound live audit failed with no owner blockers and zero
unreachable commits because:

1. the PR81 branch record still observed PR81 as `OPEN` after the live PR became
   `MERGED`; and
2. the integrated A01 work item recorded an exact behind count that necessarily
   increased when PR81 became protected main.

The audit also exposed a deeper activation mismatch. PR46's protected activation
binding still names PR80, while the exact current protected-main merge is PR81.
The existing final-base-handshake validator binds activation evidence to the
same protected-main commit and second parent. PR46 therefore cannot truthfully
consume the stale binding, and PR46 must not amend its own authorization source.

The attempted PR46 merge against `969a206...` was restored without reset,
checkout, stash, rebase, force, or ref movement. PR46 is clean at the exact
frozen head and has no `MERGE_HEAD`.

## 3. Goals

The protected repair must:

- make an integrated lane's monotonic behind drift auditable without granting
  branch, worktree, or remote deletion authority;
- allow only one-way `OPEN -> MERGED|CLOSED` PR observation when exact head
  custody is preserved;
- validate root currentness against an explicit sequence of protected merge
  lifecycles rather than a broad path allowlist;
- establish the exact new protected activation identity that PR46 may consume;
- preserve the protected PR80 lifecycle and receipt prefix;
- preserve the dirty EvidenceFlow worktree, PR46 custody, invalid-pointer
  custody, rescue refs, keep-around refs, archive tags, and all remote branches;
- remain Draft until both initial and final exact-head gates pass; and
- stop after protected activation and post-main evidence, before any PR46
  mutation or cleanup.

## 4. Non-goals

This repair does not authorize or perform:

- PR46 merge, Ready transition, branch mutation, or conflict resolution;
- local-ref retirement or retirement-receipt minting;
- local or remote branch deletion;
- worktree removal;
- orphan or invalid-pointer mutation;
- archive-tag, quarantine, target-ref, deployment, provider, or credential
  mutation;
- reset, checkout-based restoration, rebase, stash, force, or history rewrite;
- a general rule that trusts arbitrary commits merely because they appear on
  `origin/main`; or
- unrelated verifier refactoring.

## 5. Alternatives considered

### 5.1 Recommended: one self-closing protected repair PR

The repair installs the observation and protected-advance contracts and carries
the new PR46 activation binding in the same protected lifecycle. Its own
post-merge state is derivable from exact base, branch-head, merge-parent, tree,
path, PR, and receipt evidence, so no follow-up closeout PR is required.

This is the selected design because it preserves protected-source authority and
avoids another self-referential currentness loop.

### 5.2 Code repair followed by a registry-only closeout PR

Rejected. The closeout merge would itself advance protected main after the
activation repair. PR46 would then either point at the earlier repair commit or
require another rebinding, recreating the same loop.

### 5.3 Let PR46 rewrite its activation binding

Rejected. Candidate-controlled validation would allow the consumer to enlarge
or replace its own authority. That contradicts the protected-source immutability
introduced by PR80.

## 6. Repair lane and lifecycle

Reuse the registered worktree currently located at
`/Volumes/Starship/SENA/.worktrees/sena-pr80-post-main-closeout-20260901`.
The historical PR81 local branch remains present but loses the worktree when the
new branch is created. No fifth worktree is created.

The new task and branch are:

- task: `SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901`;
- branch: `codex/sena-protected-currentness-activation-repair-20260901`;
- base: exact `969a206b798c159e15ae0b6e5c76d0c94cca92ea`.

The design-spec commit is local-only and may change only:

- `coordination/repo-governance/active-work.json`; and
- this design file.

It records no push or PR authority. After owner review of this written
specification, a separate implementation plan must define the exact transition
to the implementation candidate.

The implemented protected repair must use two candidate states:

1. `protected-currentness-activation-repair-candidate-awaiting-initial-checks`;
2. `protected-currentness-activation-repair-ready-pending-final-head-checks`.

The initial state may enable only one registry-only final-authorization metadata
commit after its exact head passes required local gates, build, both security
checks, zero-annotation readback, and immutable review. The final state consumes
that action and may conditionally enable only Ready and ordinary protected merge
after the final exact head passes fresh copies of the same gates.

All direct actions on the repair work item remain explicitly false except the
single state-specific repair action described above. A separately sealed PR46
`pending-protected-activation` authorization may contain exactly the three
conditional remerge/resolver/commit-push actions required by the existing
final-base handshake. Those actions are inert unless later live completion
evidence proves this repair's exact protected merge and post-main gates. Every
cleanup, deletion, PR46 Ready/merge, target, provider, deployment, reset,
rebase, stash, force, and history-rewrite action remains false.

## 7. Integrated monotonic-behind observation

Add one optional work-item field:

```json
"aheadBehindObservationMode": "integrated-monotonic-behind"
```

The verifier may convert an ahead/behind mismatch to a warning only when all of
these conditions hold:

1. `item.disposition === "integrated"`;
2. `item.aheadBehind.baseRef === "origin/main"`;
3. the actual local branch head exactly equals `item.headSha`;
4. recorded and observed `ahead` both equal zero;
5. observed `behind` is greater than or equal to recorded `behind`;
6. the item has exact `lastMergedPullRequest.headSha === item.headSha`;
7. `lastMergedPullRequest.mergeCommitSha` is a valid commit;
8. both the item head and recorded merge commit are ancestors of current
   `origin/main`; and
9. no cleanup authorization is inferred or synthesized.

The field is invalid on an active, ready-for-PR, frozen, quarantine, archived,
or preservation-review item. A head change, positive ahead count, unavailable
base, decreasing behind count, missing merge evidence, or failed ancestry check
remains an error.

This contract is observation only. It must not be accepted by any branch,
worktree, local-ref, remote-ref, or deletion boundary as mutation authority.

## 8. Monotonic PR lifecycle observation

Use the existing branch field:

```json
"prStateObservationMode": "monotonic"
```

Apply it only to branches whose open PR may close while a protected registry
snapshot remains current. The existing helper remains fail-closed:

- recorded state must be `OPEN`;
- live state may advance only to `MERGED` or `CLOSED`;
- the recorded PR head must match the live head or be a permitted forward-only
  allowed-path advance of the same active lane; and
- `MERGED|CLOSED -> OPEN`, branch-name drift, base drift, or unbound head drift
  remains an error.

The repair registry must truthfully close PR81 and place monotonic observation
on the repair branch and PR46 before their later protected transitions.

## 9. Exact protected-main advance chain

Root currentness must be proven by merge topology and lifecycle custody, not by
trusting a branch name or a generic set of paths.

Introduce an exact protected-advance resolver that accepts a sequence whose
first commit is the root's recorded head and whose last commit is fetched
`origin/main` or the local fast-forwarded root head. Every non-first-parent
advance in the sequence must match one of the explicitly supported lifecycle
records in the registry:

1. the exact PR81 registry-only closeout lifecycle;
2. the exact protected currentness/activation repair lifecycle; or
3. after the repair is active, the exact PR46 final-base-handshake lifecycle.

For each recognized merge commit the resolver must verify:

- exactly two ordered parents;
- first parent equals the preceding protected-main commit;
- second parent equals the exact live PR head or a forward-only registry-only
  final metadata descendant of the recorded initial head;
- merge tree equals the second-parent tree;
- registry blob equals the second-parent registry blob;
- branch name, PR number, base branch, lifecycle status, receipt sequence, and
  active action set are exact;
- all changed paths equal the lifecycle's declared path set; and
- the live PR state is a permitted monotonic close of the recorded state.

The resolver must reject:

- squash, rebase, octopus, single-parent, or reversed-parent topology;
- an unknown PR or receipt;
- an unknown or additional changed path;
- tree or registry-blob mismatch;
- a final metadata commit that changes anything except the registry;
- a merge commit not reachable through the exact first-parent chain; or
- a live/cached main mismatch.

Before the root fast-forwards, the resolver may convert only the root's exact
behind observation into a warning. After a clean ordinary fast-forward, it may
also accept the exact local root head advance. It never authorizes a root write
commit, non-fast-forward update, or target-ref mutation.

## 10. PR46 activation rebinding

The protected repair, not PR46, replaces the pending PR46 activation binding.
The binding must contain:

- the actual positive repair PR number read back from GitHub;
- exact repair lifecycle receipt kinds;
- exact repair base SHA;
- required ordinary protected merge topology;
- post-main build and repository-security requirements;
- zero-annotation requirement;
- commit-bound live-audit requirement; and
- a requirement that the authorization commit equal fetched `origin/main`.

The repair source registry may expose only the existing final-base-handshake
pending action set: ordinary remerge reconciliation, exact resolver/test
staging, and the resulting merge-candidate commit/push. The action set is
conditional on exact protected activation; PR46 Ready/merge and every cleanup
or deletion action remain false. After the repair has merged and its post-main
evidence is available, the later PR46 candidate may consume those three actions
and add only `protectedActivationCompletionEvidence` plus the bounded remerge
receipt inside the branch-retirement-owned projection. That evidence must bind:

- actual repair PR number;
- final repair PR head;
- protected merge commit, tree, registry blob, and ordered parents;
- post-main build/security run and job IDs;
- successful conclusions and empty annotations; and
- passing commit-bound audit with empty errors, empty owner blockers, and zero
  unreachable commits.

PR46 may not modify the binding, lifecycle receipt kinds, activation PR number,
required path set, or any other authorization-core field.

The binding keeps the PR46 source authorization status
`pending-protected-activation`; a distinct
`requiredActivationLifecycleStatus` names the repair's final protected-ready
status. These two states must not be conflated.

## 11. PR46 re-entry topology

After the repair is protected-main active, revalidate PR46 before touching its
worktree:

- local, named remote, and live PR head must remain exact `e24c635...`;
- tree and the registry/verifier/test blobs must remain frozen;
- both keep-around refs must remain reachable;
- index and worktree must remain clean; and
- PR46 must remain `OPEN`, Draft, and conflicting until the exact remerge is
  authorized.

Merge-tree against the new protected main must report exactly these conflicts:

- `coordination/repo-governance/active-work.json`;
- `scripts/verify-sena-repo-governance.mjs`;
- `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`.

The candidate-only clean set must be empty. The protected-only clean set must be
recomputed and frozen; it is expected to include the two PR80 design/plan files,
this repair design, and the required repair implementation plan. Execution must
use the observed exact four-path set rather than silently relying on that
expectation.

## 12. Data flow

1. Exact protected main `969a206...` and the owner-reviewed design feed the
   repair implementation candidate.
2. The initial candidate is committed and pushed, then a Draft PR is created;
   its actual number is read back and becomes the only acceptable repair PR
   identity.
3. Initial exact-head gates and immutable reviews feed one registry-only final
   authorization commit.
4. Fresh final-head gates permit only Ready and ordinary protected merge with an
   exact-head lease and no admin bypass.
5. The protected merge, post-main build/security results, zero annotations, and
   passing commit-bound live audit become the activation evidence available to
   PR46.
6. PR46 re-enters its separately gated three-conflict lifecycle.
7. Only after PR46 is protected-main active and passes post-main gates may a
   separately protected local cleanup lifecycle begin.

## 13. Failure handling and stop conditions

Stop without advancing authority if any of these conditions occurs:

- protected main changes after a candidate source is frozen;
- root, PR46, EvidenceFlow, PR81, A01, or the repair lane differs from its
  permitted currentness contract;
- any required check fails or any annotation array is non-empty;
- the repair PR number, branch, base, head, merge method, parent order, tree,
  registry blob, receipt prefix, or path set differs;
- the full governance suite, native registry validation, write policy,
  security gate, or live audit fails;
- an immutable reviewer reports any unresolved finding;
- an unauthorized true action appears at any depth;
- PR46 merge-tree produces a different conflict or clean-path set; or
- any deletion, cleanup, target, provider, deployment, reset, rebase, stash,
  force, or history-rewrite action becomes true.

On failure, preserve the exact branch/worktree/index state, report the evidence,
and do not infer cleanup or mutation authority from a green lower-level gate.

## 14. Test design

Use test-driven development. The first production change is forbidden until the
new focused tests fail for the intended missing behavior.

Required RED/GREEN contracts include:

1. PR81 `OPEN -> MERGED` with exact allowed head custody;
2. integrated A01 behind growth with unchanged head and zero ahead;
3. rejection of the same behind mode on an active feature lane;
4. rejection of head, ahead, ancestry, merge-evidence, or mode drift;
5. root audit before and after a clean fast-forward across the exact PR81 plus
   repair merge chain;
6. rejection of squash, rebase, reversed-parent, unknown-path, tree, registry,
   receipt, PR-number, or live-main drift;
7. PR46 activation evidence matching the protected repair binding;
8. rejection when PR46 attempts to alter that binding;
9. exact repair initial-to-final receipt and action-set transitions; and
10. confirmation that every cleanup and deletion authorization remains false.

After focused GREEN, run the complete repository-governance test file, native
registry validation, live audit, staged write policy, security gate, type-check,
production build, GitHub build/security workflows, annotation readback, and
independent read-only spec plus quality/security reviews.

## 15. Acceptance criteria

The protected repair is complete only when:

- its final exact head is immutable-reviewed and all required checks pass;
- it is merged through branch protection by ordinary two-parent merge with an
  exact-head lease and no admin bypass;
- its post-main build and security checks pass with zero annotations;
- commit-bound live audit reports `errors=[]`, `ownerBlockers=[]`, and zero
  unreachable commits both before and after any root fast-forward required by
  the execution plan;
- the protected activation binding is available for the separately gated PR46
  lifecycle without requiring PR46 to rewrite it; and
- no cleanup, branch deletion, worktree removal, orphan mutation, remote
  deletion, target mutation, or history rewrite has occurred.

This acceptance activates only the separately gated PR46 repair. It does not by
itself satisfy the final one-local-branch/one-worktree objective.
