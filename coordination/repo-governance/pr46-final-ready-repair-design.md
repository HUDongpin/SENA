# PR46 Final-Ready Protected Minimal-Repair Design

Status: owner-approved execution direction; every exact candidate remains blocked until its local gates and immutable reviews pass.

Date: 2026-09-01

Owners: SENA-A01 governance lane and SENA-BRANCH-RETIREMENT-20260829 lane

## 1. Decision

Use one new protected A01 lifecycle to authorize a minimal, state-aware PR46 repair while preserving the existing PR46 evidence lineage.

The PR46 repair has exactly two behavioral changes:

1. Replace the conflict-intake integration test's dependence on the live SENA index, checkout status, and mutable `origin/main` with a deterministic isolated projection matrix. The matrix exercises staged-index, clean remerge-head, final-ready, and post-main execution contexts from explicit source/candidate snapshots, while the operational conflict-intake command remains an exact candidate gate.
2. Replace the verifier's hard-coded PR79 activation identity with an exact positive `requiredActivationPullRequestNumber` supplied by the protected activation binding and checked against the candidate's activation-completion evidence.

PR80 also introduces the protection needed to authorize those changes: a fail-closed two-state transition validator with an exact recursive true-action set, immutable receipt prefix, ordered one-receipt deltas, replay rejection, and negative tests. That protection is lifecycle enforcement, not a third PR46 behavioral change.

The repair does not weaken the final-base-handshake state machine, recursive closed authorization set, exact parent/path/blob checks, live PR head check, normalized non-owned registry check, receipt sequence, CI requirements, exact-head lease, or cleanup prohibition.

## 2. Problem and exact frozen evidence

Protected main and the clean root are exact commit:

- `ca7d464e5e58e48996daaee01ac22f929b964b8f`

The pushed PR46 remerge candidate is exact commit:

- head: `e24c635d1f53fccb2264c6be002aec2775de127c`
- tree: `56be367593f0b41c89fe74536e9c3834ce08fcc0`
- ordered parents:
  - `5101ee2789acdcb4ac4c294a25ab5d7b645d1bde`
  - `ca7d464e5e58e48996daaee01ac22f929b964b8f`
- registry blob: `83a3b3ab4e5dd9fd584d4d1c49a2e51c59c66339`
- verifier blob: `d28a3fb23c9ada864fe65271c0ee30b97d034da0`
- governance-test blob: `5eff890f19262194637dd388e86297a8cdc17ebb`

That exact candidate passed:

- native audit, write-policy, security, and remerge-consumed conflict-intake;
- the complete repository-governance test file, 97/97;
- final immutable spec and quality review with P0-P3 all zero;
- build run `33458602803`, job `99703785040`;
- pull-request repository-security run `33458602756`, job `99703784709`;
- push repository-security run `33458598644`, job `99703772123`;
- zero annotations for all three check jobs.

The uncommitted, unpushed final-ready registry-only projection was frozen as:

- staged tree: `2a1f436e61d69e1b158e9bbdc526b5842922ccb7`
- staged registry blob: `f50af94583b3c8e50e1084eb1c1cdd5ce05c5d8b`
- registry file SHA-256: `eeb719380277daf9fe175bcabc9abc4bf5de31d6c7329dc6ab47dbf96febf3d0`
- registry-only binary diff SHA-256 versus `e24c635`: `38cebc0f82b5294a849f3644f259901e25c065020ac69001fecd47ce6eb388e1`
- porcelain-status SHA-256: `f8c06cfa548444a7ddb521145d3177b7ec425ee36b0911cd20e0b1b53598be37`

After recording those exact identifiers and the review conclusions, the blocked projection was restored with `apply_patch` and explicit path staging to the clean pushed `e24c635` registry blob `83a3b3ab...`. No commit, remote ref, snapshot object, or keep-around ref was removed or rewritten.

This projection passes JSON validation, diff-check, pre-commit audit, write-policy, security, and exact final-ready conflict-intake. The full governance file is 96/97. Its only failure is the integration assertion that requires `mode=final-base-handshake-remerge-consumed-awaiting-ci` even though the accepted registry status correctly resolves to `mode=final-base-handshake-final-ready-pending-head-checks`.

The dedicated pure three-state resolver test passes for the final-ready state. The defect is therefore a state-coupled integration fixture, not a permission bypass. Nevertheless, the protected execution order requires the final-ready projection itself to pass the complete suite, so the blocked projection was not committed or pushed.

PR46 remains OPEN and Draft. No local branch, registered worktree, invalid-pointer directory, keep-around ref, archive tag, quarantine object, or retirement target has been removed.

## 3. Constraints and non-negotiable invariants

### 3.1 Preservation and Git operation constraints

- Preserve the dirty EvidenceFlow worktree and all unrelated owner lanes.
- Preserve the root checkout as read-only coordination and fast-forward integration only.
- Do not use reset, rebase, stash, force push, history rewrite, `git add .`, or broad path staging.
- Use explicit pathspec staging.
- Keep the two Git-generated PR46 snapshot commits reachable through their current `refs/keep-around/...` refs; their cleanup is not authorized by this design.
- Do not modify any retirement target until PR46 is protected-main active and its post-main gates pass.
- Keep local refs, registered worktrees, physical invalid-pointer directories, cached remote-tracking refs, live remote heads, and GitHub PR state as distinct evidence layers.

### 3.2 Authorization constraints

- PR80 may authorize only the repair lifecycle described here.
- PR46 must remain Draft until the exact final-ready head passes all final gates.
- The PR46 Ready/protected-merge authority must remain conditional and must be the only true authorization path in the final-ready state.
- Branch deletion, worktree removal, orphan mutation, local-ref retirement, receipt minting for retirement, tag/quarantine mutation, deployment, provider mutation, reset, rebase, stash, force, and history rewrite remain false throughout this repair.
- A green candidate, green CI run, merged governance PR, or local 97/97 result grants only its explicitly recorded lifecycle authority.

### 3.3 Evidence constraints

- Label Git object identifiers separately from SHA-256 file and binary-diff digests.
- Bind every review to an exact tree, stage-0 blob set, binary-diff digest, and porcelain-status digest.
- Read back every GitHub check's run ID, job ID, conclusion, head SHA, and annotations array.
- Require the live named PR46 remote head to equal the candidate head before each protected action.
- Require the protected authorization commit to equal freshly fetched `origin/main`.

## 4. Rejected alternatives

### 4.1 Evidence-composition waiver

Rejected because it would combine the immutable `e24c635` 97/97 run with a separate final-ready focused pass while leaving the current aggregate suite at 96/97. That would preserve a known false-red exit code and contradict the protected full-suite execution order.

### 4.2 Clean replacement PR that abandons PR46 lineage

Reserved only as a future fallback. It would reduce merge-conflict complexity but would require a separate supersession contract, preservation of the unmerged PR46 lineage, a new candidate branch, and new custody/closure evidence. It changes more governance semantics than the minimal repair.

## 5. Architecture

The lifecycle has two coordinated but independently gated parts.

### 5.1 Part A: protected A01 repair authorization lifecycle

The A01 lane creates PR80 from exact protected main. Its initial candidate is limited to five paths: the registry, this design, the implementation plan, the governance verifier, and the governance test. The verifier/test delta exists only to make PR80's own authorization lifecycle enforceable before protection.

The initial PR80 registry candidate must record:

- the exact protected base `ca7d464` tree and registry blob;
- the exact pushed PR46 candidate `e24c635` tree, blobs, ordered parents, CI identities, and zero-annotation evidence;
- the exact blocked final-ready index tree/blob/diff/status digests and 96/97 failure;
- the spec-review P1 conclusion and the quality-review P2 classification without collapsing them into one claim;
- a new activation binding with `requiredActivationPullRequestNumber: 80`;
- the exact two permitted implementation paths:
  - `scripts/verify-sena-repo-governance.mjs`
  - `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
- the exact protected receipt prefix count and SHA-256, the only two allowed lifecycle statuses, the one allowed true action per status, and the one ordered receipt/scope required at each transition;
- the exact allowed post-activation actions: restore the blocked index to clean `e24c635`, freeze the exact protected activation commit, require precisely three conflicts (registry, verifier, governance test), run one ordinary remerge, resolve those three paths under the protected/PR46 composition contract, implement the two PR46 repairs RED-first, commit/push the exact three-path merge candidate, create one later registry-only final authorization, and stop before cleanup.

PR80 uses two candidate states:

1. `pr80-repair-authorization-candidate-awaiting-initial-checks`
2. `pr80-ready-authorization-pending-final-head-checks`

The initial state permits only the A01 registry-only final-authorization metadata commit after initial exact-head checks. The final state consumes that action and conditionally permits only PR80 Ready/protected merge after the final head's fresh checks.

The verifier must reject an arbitrary status, a retained earlier action, any unknown top-level or nested `*Authorized: true`, a missing/extra/reordered receipt, receipt scope expansion, protected-receipt-prefix drift, a direct final-state bootstrap, or replay from the final state. The initial-to-final comparison must use an exact field-level allowlist rather than replacing the whole A01 work item/branch: `allowedPaths`, owner/disposition, historical authorization objects, and every other unlisted field remain immutable. Recursive authorization-path comparison spans the complete A01 work item and branch, with only the lifecycle's initial action replaced by its final action.

The pre-commit write-policy must execute the real source-to-index transition, not merely validate a standalone JSON shape. The initial state is compared to exact protected `ca7d464` and must have exactly the five declared overall paths; the final state is compared to the exact initial PR80 head recorded in completion evidence and must have exactly one registry path.

During either PR80 transition, the candidate receipt array must equal the source byte-semantically plus exactly one ordered receipt. The final PR80 commit seals the A01 writer lane: an unchanged final PR80 lifecycle may not authorize a third A01 commit. Later non-PR80 receipts may be appended only through a separately validated non-A01 lane (the existing branch-retirement lane is the planned continuation) without invalidating the historical PR80 prefix; the two PR80 receipts themselves, their order, scopes, actions, and evidence remain immutable.

Final PR80 evidence requires one positive build run ID, exactly two distinct positive repository-security run IDs, and exactly three distinct positive check-job IDs. The lifecycle evidence, final receipt, and explicitly supplied observation context must match on all Git identities, run/job arrays, check/annotation booleans, and initial immutable-review approvals. Numeric shape alone is not provider authenticity; exact GitHub readback and review supply that evidence layer.

During the exact initial-to-final registry-only transition, the final metadata candidate must still describe PR80 as exactly OPEN, Draft, not Ready, and not merge-authorized. Both A01 work-item and branch records must identify PR80, the branch base must remain `main`, mergeability must be `MERGEABLE/CLEAN`, and work-item head, branch head, remote head, and PR head must all equal the exact initial candidate head. Only after the final metadata head itself passes fresh checks may the external Ready transition occur. This pre-final constraint is not a permanent historical snapshot rule: after protected merge, a separately validated non-A01 lane may record truthful monotonic MERGED/non-Draft/final-head/merge-commit currentness and A01 closeout while preserving the immutable PR80 lifecycle and receipt pair.

The two required A01 receipts are:

- `pr80-final-ready-test-repair-authorization-candidate`
- `pr80-final-ready-test-repair-final-authorization`

PR80 must remain Draft until its final exact-head build and both security checks pass with zero annotations and independent read-only review approves the exact final tree. It is then merged without admin bypass and with an exact-head lease. Its protected merge must pass post-main build, security, zero-annotation readback, and commit-bound live audit before Part B begins.

### 5.2 Part B: authorized PR46 repair and reconciliation

Part B starts only after the exact PR80 protected-main commit is fetched and post-main verified.

The sequence is:

1. Revalidate the frozen PR46 blocker evidence and require the working file and index to remain at the clean pushed `e24c635` commit. If an identical blocked projection reappears before protected activation, restore it using `apply_patch` plus explicit `git add -- coordination/repo-governance/active-work.json`; do not use reset, checkout, rebase, or stash.
2. Recompute the clean `e24c635` tree and registry/verifier/test blobs before any merge operation.
3. Require a clean index/worktree and local/named-remote/PR head equality at `e24c635`.
4. Run merge-tree preflight against the exact PR80 protected-main commit. Because PR80 intentionally protects its own lifecycle in the verifier and governance test while PR46 already changed those files, the required conflict set is exactly `coordination/repo-governance/active-work.json`, `scripts/verify-sena-repo-governance.mjs`, and `sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`. The candidate-only clean set must be empty, and the protected-only clean set must contain exactly the design and implementation-plan documents. Any different set stops the lifecycle.
5. Execute one ordinary `git merge --no-ff --no-commit <exact-protected-main>`.
6. Resolve the three conflicts without accepting either side wholesale: use the complete protected registry as the registry base and reconstruct only branch-retirement-owned fields plus one bounded receipt; preserve the protected PR80 lifecycle validator/tests while porting the complete PR46 final-base-handshake verifier/tests and the two narrowly authorized PR46 repairs. Keep all three merge stages available until this composition is proven.
7. Preserve all unrelated protected registry semantics and prove the normalized non-owned registry hash is unchanged.
8. Produce RED evidence before implementation:
   - the current live-index-coupled integration test cannot remain green across staged, clean-head, and merged-main execution contexts;
   - activation evidence declaring PR80 fails against the hard-coded PR79 verifier rule.
9. Implement the two minimal repairs.
10. Stage exactly the three authorized paths: registry, verifier, and governance test.
11. Pass native gates, focused tests, the complete governance suite, and exact immutable spec/quality review.
12. Commit a new ordinary two-parent PR46 merge candidate whose first parent is `e24c635` and whose second parent is the exact PR80 protected-main commit.
13. Push only the named PR46 branch while the PR remains Draft; pass its initial exact-head build/security checks and zero-annotation readback.
14. Create one registry-only final-authorization metadata commit. It must record the exact preceding merge candidate and consume the metadata action while conditionally enabling only PR46 Ready/protected merge after the new final head's checks.
15. Run the complete governance suite against the final-ready projection. The isolated projection matrix must make this a genuine 97/97 pass and must remain green again after protected-main merge, rather than composing evidence from a transient staged index.
16. Complete exact immutable review, final exact-head CI, zero annotations, Ready transition, and protected merge with exact-head lease.
17. Verify post-main build/security, zero annotations, and commit-bound live audit.

## 6. Minimal implementation details

### 6.1 Deterministic conflict-intake integration fixture

Remove the aggregate test's direct reads of the live project index, worktree dirtiness, current branch, and mutable `refs/remotes/origin/main`. Those are operational inputs and cannot be a stable full-suite fixture.

Use explicit protected-source and candidate snapshots with deterministic contexts to cover:

- staged remerge projection -> `final-base-handshake-remerge-consumed-awaiting-ci`;
- clean committed remerge head -> the same exact remerge-consumed mode;
- staged registry-only final-ready projection -> `final-base-handshake-final-ready-pending-head-checks`;
- clean committed final-ready head -> the same exact final-ready mode;
- a simulated post-main test run that replays the preserved protected source plus final candidate snapshots without consulting the checkout's now-consumed `origin/main` registry.

The fixture must still reject ambiguous/missing projection sources, missing stage-0 input, dirty head projections, arbitrary status, unknown nested true authorization, parent/path/blob drift, receipt drift, and stale activation evidence. Operational pre-commit and pre-push gates continue to run `conflict-intake` against the actual exact staged or clean candidate; the complete test file itself no longer assumes that a transient index exists.

### 6.2 Activation PR identity

Extend `protectedActivationBinding` with a required positive integer:

- `requiredActivationPullRequestNumber`

The verifier must:

- reject a missing, zero, negative, non-integer, or unexpected activation PR number;
- compare `protectedActivationCompletionEvidence.pullRequestNumber` to the exact protected binding value;
- continue to bind the activation commit, tree, registry blob, final PR head, ordered parents, post-main build/security run and job identities, empty annotations, audit status, empty error/blocker arrays, and zero unreachable commits;
- never infer the PR number from chronology or a hard-coded constant.

No other protected-activation check is weakened.

### 6.3 Repair receipt closure

The PR46 repair receipt must be sequence-preserving and action-closed. It may record only the exact repair/remerge action enabled by the protected PR80 source. The later final receipt may contain only the conditional PR46 Ready/protected-merge authorization path as true. Unknown nested true authorization paths must fail closed.

## 7. Data and evidence flow

1. Protected `ca7d464` and immutable PR46 `e24c635` evidence feed the PR80 candidate registry.
2. PR80 initial CI feeds the PR80 final registry metadata commit.
3. PR80 final CI and exact review permit PR80 Ready/protected merge.
4. The exact PR80 protected-main commit plus post-main evidence becomes the sole authorization source for PR46 repair.
5. PR46 RED/GREEN results, exact merge topology, staged tree/blob/diff digests, and independent reviews feed the new PR46 remerge candidate receipt.
6. Initial PR46 candidate CI feeds its registry-only final authorization commit.
7. Final PR46 CI, 97/97, review, and exact-head lease permit PR46 protected merge.
8. PR46 post-main evidence unlocks only the next separately governed cleanup lifecycle; it does not itself delete anything.

## 8. Failure handling and stop conditions

Stop without advancing authority if any of the following occurs:

- A01 or PR46 local/named-remote/PR head identity drifts.
- Protected main changes after a candidate's source was frozen.
- PR80 or PR46 has any failing required check or non-empty annotation array.
- A reviewer reports any unresolved P0 or P1 finding.
- The blocked PR46 snapshot, keep-around refs, or e24 blobs no longer match.
- Merge-tree's conflict set is anything other than the exact registry/verifier/governance-test triple, its candidate-only clean set is nonempty, or its protected-only clean set differs from the two PR80 documents.
- The ordinary merge creates or references an unexpected autostash.
- Non-branch-retirement protected registry semantics change.
- The staged path set differs from the exact authorized set.
- The deterministic integration fixture consults the live project index/status/`origin/main`, accepts more than the one mode implied by its explicit projection, or does not remain valid in a simulated post-main run.
- The activation PR number is missing, inferred, or mismatched.
- The complete governance suite is not fully green in both the new remerge-consumed candidate and the later final-ready projection.
- Any cleanup, retirement, ref, worktree, orphan, deployment, provider, reset, rebase, stash, force, or history-rewrite authorization becomes true.

If the ordinary merge itself must be abandoned, stop and obtain an exact protected authorization for the specific high-level `git merge --abort` state. Do not substitute a reset or stash operation.

## 9. Verification matrix

### 9.1 PR80 initial candidate

- JSON parse and `git diff --check`
- index-bound governance audit
- write-policy and security gates
- exact five-path source-to-index projection
- fail-closed lifecycle validator GREEN after observed RED
- negative cases for status, top-level/nested/sibling true-action closure, unchanged-lifecycle staged deltas, replay, receipt prefix count/hash/historical drift, missing/extra/reordered/scope-expanded receipts, direct-final bootstrap, protected-base/core/index-path/non-owned drift, `allowedPaths`/owner/disposition/historical-authorization drift, and final run/job/receipt/context evidence cardinality or mismatch
- normalized non-owned registry equivalence
- exact candidate hashes and receipt closure
- independent spec and quality review
- build, PR security, push security
- zero annotations

### 9.2 PR80 final authorization

- registry-only first-parent delta
- initial-candidate evidence recomputation
- exactly one bounded final receipt
- consumed metadata action and only conditional PR80 Ready/merge true
- full local gates and independent exact-state review
- fresh final-head build/security/zero annotations
- exact-head protected merge
- post-main build/security/zero annotations/live audit

### 9.3 PR46 repair candidate

- exact frozen-state and live-head revalidation
- merge-tree exact-three-conflict, empty-candidate-only, and two-protected-document proof
- ordinary merge parent and autostash proof
- RED evidence for both defects
- focused GREEN tests for both repairs and their negative cases
- `node --check` and `git diff --check`
- index-bound audit, write-policy, security, and conflict-intake
- exact three-path delta and normalized non-owned registry equivalence
- complete governance suite 97/97
- immutable exact-hash spec and quality review
- initial exact-head build/security/zero annotations

### 9.4 PR46 final authorization and merge

- registry-only first-parent delta
- exact preceding candidate head/tree/registry/verifier/test blobs and ordered parents
- both binary-diff hash domains
- exact CI run/job/annotation identities
- deterministic final-ready and simulated post-main integration pass
- complete governance suite 97/97
- final immutable review
- fresh final-head build/security/zero annotations
- exact-head protected merge without admin bypass
- post-main build/security/zero annotations/commit-bound live audit

## 10. Cleanup gate after PR46

Only after PR46 is protected-main active and post-main verified may the existing cleanup plan resume. It remains serial:

1. retire `codex/sena-human-ai-research-docs` through its exact guarded local-ref authorization and custody;
2. retire `claude/quirky-merkle-da02fa` through its successor authorization;
3. retire `codex/sena-statistical-integrity-v2` only with its exact archive tag and custody;
4. handle `docs/ledger-reconciliation-2026-08-19` only through security-quarantine custody and fresh-main selective reconstruction rules;
5. resolve the four invalid-pointer directories only after per-directory identity, process/lock, and recovery-custody readback;
6. preserve and close the dirty EvidenceFlow lane before its branch/worktree removal;
7. remove the A01 and branch-retirement lanes last;
8. prove exactly one local branch (`main`) and one registered worktree (`/Volumes/Starship/SENA`) remain, while reporting live remote branches separately.

## 11. Acceptance criteria

The repair design is complete only when:

- PR80 has activated the exact repair authority through protected main and post-main verification;
- PR46's repaired remerge-consumed candidate genuinely passes 97/97 and all local/CI/review gates;
- PR46's registry-only final-ready projection also genuinely passes 97/97 and all final gates;
- PR46 merges with the exact final head lease and passes post-main verification;
- the unchanged complete governance test file passes again from the clean post-main checkout without a staged-index dependency;
- no cleanup object was mutated before that point;
- every evidence claim names its exact layer and does not infer later authority from an earlier green gate.

## 12. Spec self-review

- Placeholder scan: no TBD, TODO, or unspecified identity remains.
- Internal consistency: the two repairs are separately defined, both are protected before implementation, and the final-ready state still requires a registry-only commit.
- Scope check: the design excludes unrelated ref/worktree/orphan cleanup and provider/deployment work.
- Ambiguity check: exact statuses, modes, paths, stop conditions, and evidence layers are explicitly defined.
