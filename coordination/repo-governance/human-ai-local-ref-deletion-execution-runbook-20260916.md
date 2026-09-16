# Human-AI local-ref deletion execution runbook

Status: **PREPARATION ONLY — DRAFT FOR CTO REVIEW**

This document plans a later owner-machine deletion of one local Git ref. It
does **not** authorize that deletion. It does **not** revive closed PR #46.

## Non-negotiable for this preparation PR

The following are forbidden in this PR and remain forbidden until a later
**CTO authorize** instruction names an execution operator, machine, and
window:

- Do not delete any Git ref.
- Do not run compare-and-swap (`git update-ref -d … <old-oid>` or `--stdin`
  `delete`).
- Do not consume `pending-release`.
- Do not set `status` to `active` or `consumed`.
- Do not mint completion receipts that claim deletion happened.
- Do not revive, Ready, or merge closed PR #46.
- Do not reopen `codex/sena-branch-retirement-20260829` as a write lane.
- Do not remove worktrees, invalid-pointer orphans, archive tags, quarantine
  refs, or any other target.
- Do not use force, reset, rebase, stash, or history rewrite.

Authorization status stays `pending-release`. Completion evidence stays
`null`. This file is a runbook, not a receipt.

## Bound identities (minted by PR #92, now on protected main)

| Field | Exact value |
|---|---|
| Authorization id | `SENA-LOCAL-REF-RETIRE-HUMAN-AI-20260829` |
| `deletionRelease.id` | `SENA-LOCAL-REF-RETIRE-HUMAN-AI-20260829-DELETION-RELEASE-20260916` |
| Target ref | `refs/heads/codex/sena-human-ai-research-docs` |
| Expected old SHA | `5537582fbf820951777f88ef5bc5c63e23feada3` |
| Purpose | `archive-ref-retirement` |
| Status (must remain) | `pending-release` |
| `exactCasRequired` | `true` |
| `ordinaryBranchDAllowed` | `false` |
| `forceBranchDAllowed` | `false` |
| `historyRewriteAllowed` | `false` |
| `oneShot` | `true` |
| `remoteHeadRequiredAbsent` | `true` |
| `registeredWorktreeOccupancyRequired` | `none` |
| Window | `2026-09-16T01:32:00Z` → `2026-09-19T01:32:00Z` |
| `pendingAuthorizationCommit` | `8f4625772137336d53afc1e0e8289dcf703fe177` |
| Protected-main mint merge | `a7d7c50373186a7e9f66dde992a4738561eff253` (PR #92) |
| Archive tag | `refs/tags/archive/codex-sena-human-ai-research-docs-20260823` |
| Archive tag object | `d69d06072483904b0ba3eb3bb264721b7d5c4c43` |
| Archive peeled commit | `5537582fbf820951777f88ef5bc5c63e23feada3` |
| Receipt directory | `/Volumes/Starship/SENA的衍生文件/SENA-backups/20260829-branch-retirement/ordinary/receipts` |
| Ledger operator task | `SENA-BRANCH-RETIREMENT-20260829` |
| Ledger operator branch | `codex/sena-branch-retirement-20260829` |
| Ledger operator owner key | `Codex-branch-retirement-01a04916` |

Ledger operator fields above are identity bindings from the #92 mint. They
are **not** permission to reopen PR #46. Execution, if later authorized, is a
new CTO-scoped operator action on the owner machine.

## Owner-machine gate

Cloud clones and GitHub origin do not hold this local head. Execution must
target the machine where the named local ref actually exists.

- Historical control root: `/Volumes/Starship/SENA`
- Do not treat a cloud checkout, CI checkout, or GitHub clone as the
  execution environment.
- A missing local ref **in this clone** is expected and is **not** proof that
  the owner machine also lacks it.
- The invalid-pointer orphan
  `/Volumes/Starship/SENA/.worktrees/sena-human-ai-research-docs` is a
  preservation object. Occupancy required is `none`. Do not remove or repair
  it as part of this retirement.

## Reconcile finding and CTO decision fork

Observed on 2026-09-16 from a cloud clone of `HUDongpin/SENA` at protected
main `a7d7c50373186a7e9f66dde992a4738561eff253` (read-only; no ref mutation):

| Observation | Result |
|---|---|
| Local `refs/heads/codex/sena-human-ai-research-docs` | **absent** |
| `git ls-remote --heads origin refs/heads/codex/sena-human-ai-research-docs` | **empty** (no remote head) |
| Archive tag `archive/codex-sena-human-ai-research-docs-20260823` | **present**; peels to `5537582f…` |
| Ledger `branches[codex/sena-human-ai-research-docs].localRefState` | still `present` |
| Ledger remote head | `remotePresent: false` (no live origin head) |
| Authorization `status` | `pending-release` |
| Completion evidence | all `null` |

This is a **cloud-clone reconcile**. It does not inspect `/Volumes/Starship/SENA`.
CTO must choose one fork after an owner-machine preflight:

### Fork A — ref-found-later (CAS deletion)

Owner-machine preflight proves
`refs/heads/codex/sena-human-ai-research-docs` is present and exact
`5537582fbf820951777f88ef5bc5c63e23feada3`. After a distinct CTO authorize,
the operator may run the exact CAS delete below, then record consumed
closeout with receipts.

### Fork B — already-absent / phantom `present` flag (ledger-only)

Owner-machine preflight proves the local ref is **already absent**, origin
head remains absent, and the archive tag still peels to `5537582f…`. Then
CAS cannot succeed: there is no old OID to compare. Execution becomes
**ledger-only retirement of a phantom `localRefState=present` flag**. That
is a separate CTO decision. This runbook does not authorize it, does not
invent a consumed receipt, and does not flip ledger fields.

Stop if the owner machine has not been inspected. Do not infer Fork B from
cloud-clone absence alone.

## Preflight checklist (read-only; do not execute CAS)

Run on the owner machine after CTO authorize and **before** any
`update-ref`. Every check is observational. Failure of any row is a stop.

### 1. Prove the local ref is present at the exact SHA (Fork A)

```bash
git -C /Volumes/Starship/SENA show-ref --verify --hash refs/heads/codex/sena-human-ai-research-docs
git -C /Volumes/Starship/SENA rev-parse --verify refs/heads/codex/sena-human-ai-research-docs^{commit}
```

Required: both print `5537582fbf820951777f88ef5bc5c63e23feada3`.

If `show-ref --verify` fails because the ref is missing, **do not CAS**.
Escalate Fork B to CTO.

### 2. Prove the receipt directory exists and is empty

```bash
RECEIPT_DIR="/Volumes/Starship/SENA的衍生文件/SENA-backups/20260829-branch-retirement/ordinary/receipts"
test -d "$RECEIPT_DIR"
test ! -L "$RECEIPT_DIR"
find "$RECEIPT_DIR" -mindepth 1 -maxdepth 1 -print
```

Required: directory exists, is not a symlink, and `find` prints nothing.
Do not create placeholder receipts. Do not claim deletion.

### 3. Prove unexpired authorization and deletionRelease

From protected `origin/main` (at or after `a7d7c503…`), confirm
`coordination/repo-governance/active-work.json`:

- `policy.localRefRetirementAuthorizations[]` id
  `SENA-LOCAL-REF-RETIRE-HUMAN-AI-20260829` has `status=pending-release`
  until CTO later changes that in a separate authorized commit.
- `expiresAt` and `deletionRelease.expiresAt` are both
  `2026-09-19T01:32:00Z` and still in the future at execution time.
- `deletionRelease.id` is
  `SENA-LOCAL-REF-RETIRE-HUMAN-AI-20260829-DELETION-RELEASE-20260916`.
- `deletionRelease.exactTargetRef` and `exactExpectedOldSha` match the
  bound identities.
- `effectiveOnlyAfterAuthorizationReachesProtectedMain` and
  `effectiveOnlyAfterReleaseReachesProtectedMain` are `true`.
- Completion evidence remains null before execute:
  `authorizationRegistryCommit`, `eventId`, `consumedAt`, `executedBy`,
  `localRefAbsenceReadbackAt`, `result`, `preparedReceiptPath`,
  `preparedReceiptSha256`, `completedReceiptPath`,
  `completedReceiptSha256`.

If the window has expired, stop. Do not mint a new window in this runbook.

### 4. Prove protected main is at or after the #92 mint

```bash
git -C /Volumes/Starship/SENA fetch origin main
git -C /Volumes/Starship/SENA merge-base --is-ancestor \
  a7d7c50373186a7e9f66dde992a4738561eff253 origin/main
git -C /Volumes/Starship/SENA rev-parse origin/main
```

Required: ancestor check exits 0. Live `origin/main` is `a7d7c503…` or a
descendant. Do not execute against a divergent or rewritten `main`.

### 5. Prove no remote head

```bash
git -C /Volumes/Starship/SENA ls-remote --heads origin \
  refs/heads/codex/sena-human-ai-research-docs
```

Required: empty output. `remoteHeadRequiredAbsent=true`. A live origin head
is a stop. Do not `git push --delete`.

### 6. Prove quarantine isolation

The only CAS target is `refs/heads/codex/sena-human-ai-research-docs` at
`5537582f…`. Stop if the proposed command names any of:

- `refs/heads/docs/ledger-reconciliation-2026-08-19`
- `18d542f707e56aa9d043dd497e0efe48b540db20`
- `refs/heads/main`
- any rescue ref, archive tag, or other branch

Archive tag `refs/tags/archive/codex-sena-human-ai-research-docs-20260823`
must remain. Verify peel before and after (after is a later execution step):

```bash
git -C /Volumes/Starship/SENA rev-parse \
  archive/codex-sena-human-ai-research-docs-20260823^{commit}
```

Required: `5537582fbf820951777f88ef5bc5c63e23feada3`.

### 7. Prove no registered worktree occupancy of the target ref

`registeredWorktreeOccupancyRequired` is `none`. Stop if a **valid** Git
worktree is checked out on `codex/sena-human-ai-research-docs`. The
invalid-pointer orphan listed above is not a valid occupancy and must not
be deleted to satisfy this check.

## Exact CAS delete command shape (do not run in this PR)

Ordinary `git branch -d` and force `git branch -D` are forbidden.
`exactCasRequired=true` means the old OID is part of the mutation.

One-shot local form:

```bash
git -C /Volumes/Starship/SENA update-ref -d \
  refs/heads/codex/sena-human-ai-research-docs \
  5537582fbf820951777f88ef5bc5c63e23feada3
```

Equivalent `--stdin` form:

```bash
printf 'delete refs/heads/codex/sena-human-ai-research-docs 5537582fbf820951777f88ef5bc5c63e23feada3\n' \
  | git -C /Volumes/Starship/SENA update-ref --stdin
```

Both forms delete the named ref **only if** its current value equals
`5537582f…`. A mismatch must fail closed with the ref left unchanged.

Forbidden command shapes:

```text
git branch -d codex/sena-human-ai-research-docs
git branch -D codex/sena-human-ai-research-docs
git update-ref -d refs/heads/codex/sena-human-ai-research-docs
git push origin --delete codex/sena-human-ai-research-docs
git push --force
git worktree remove …
```

The third `update-ref -d` line is forbidden because it omits the old OID
and is not exact CAS.

**Do not run any of these commands as part of this preparation PR.**

## Receipt requirements (future execution only)

Receipts are owner-only files under the bound receipt directory. They are
not created by this PR.

### Prepared receipt (after CTO authorize, before CAS)

- Path under the bound `receiptDirectory`.
- Must **not** claim the ref was deleted.
- Records operator, machine (`/Volumes/Starship/SENA`), exact ref, expected
  old SHA, live `origin/main`, empty receipt-dir proof, unexpired
  authorization and `deletionRelease` ids, remote-head absence, quarantine
  isolation, and the chosen fork (A or stop).
- Mode `0600`, regular non-symlink file, SHA-256 bound into the later
  closeout ledger fields `preparedReceiptPath` / `preparedReceiptSha256`.
- Minting a prepared receipt is still **not** authorized by this runbook.

### Completed receipt (after successful CAS, Fork A only)

- Separate file from the prepared receipt.
- Claims deletion only after:
  - `git show-ref --verify` of the target ref fails (absent);
  - archive tag still peels to `5537582f…`;
  - origin head still absent;
  - CAS old-OID matched.
- Records `executedBy`, `localRefAbsenceReadbackAt`, `result`, and
  `eventId` if one exists for local CAS (local CAS has no GitHub ruleset
  suite; do not invent a GitHub deletion event id).
- Bound into `completedReceiptPath` / `completedReceiptSha256`.
- This preparation PR must not mint it.

Fork B, if CTO later authorizes ledger-only closeout, needs a **different**
receipt schema that claims absence-already, not CAS-deleted. That schema is
out of scope here.

## Ledger transition fields after success (not applied in this PR)

After a later authorized Fork A CAS and a later closeout commit, the
registry contract requires:

| Object | Before (now) | After successful closeout |
|---|---|---|
| `authorization.status` | `pending-release` | `consumed` |
| `authorization.authorizationRegistryCommit` | `null` | SHA of the protected-main closeout commit |
| `authorization.eventId` | `null` | local CAS event id or documented null policy |
| `authorization.consumedAt` | `null` | ISO timestamp of consumption |
| `authorization.executedBy` | `null` | executing operator identity |
| `authorization.localRefAbsenceReadbackAt` | `null` | ISO timestamp of post-delete absence |
| `authorization.result` | `null` | `deleted` (Fork A) |
| `authorization.preparedReceiptPath` / `Sha256` | `null` | bound prepared receipt |
| `authorization.completedReceiptPath` / `Sha256` | `null` | bound completed receipt |
| `branches[…].localRefState` | `present` | `retired` |
| `branches[…].disposition` | `preservation-review` | `archived` |
| `branches[…].headSha` | `5537582f…` | remains the retired tip identity unless CTO specifies otherwise |
| Archive tag | present | **unchanged** |

While status remains `pending-release` or `active`, the verifier **rejects**
any completion evidence and **requires** `localRefState=present`. Therefore
this preparation PR must not pre-fill those fields.

A separate `status=active` hop, if used, still cannot carry completion
evidence. CTO decides whether execution uses `pending-release` → `active`
→ CAS → `consumed`, or a single post-CAS consumed closeout after explicit
authorize. This PR performs neither hop.

## Stop conditions

Stop immediately, leave the ref untouched, and return to CTO if any of the
following is true:

- No distinct CTO authorize for **this** execution window.
- Clock is at or after `2026-09-19T01:32:00Z`.
- Protected `origin/main` is not a descendant of `a7d7c503…`.
- Local ref SHA ≠ `5537582f…` (including missing ref → Fork B, not CAS).
- Origin still has `heads/codex/sena-human-ai-research-docs`.
- Receipt directory missing, is a symlink, or is not empty.
- Command would touch quarantine, `main`, archive tags, rescue refs, or
  another branch.
- Operator attempts to Ready/merge/reopen PR #46.
- Operator is not on `/Volumes/Starship/SENA` (or the CTO-named successor
  owner-machine path).
- Valid worktree occupancy of the target branch is discovered.
- Any force, reset, rebase, stash, or history rewrite is proposed.
- Cloud-clone or CI environment is used as the deletion host.

## CTO authorize required before execute

PR #92 placed an unexpired `pending-release` plus `deletionRelease` on
protected main. That mint's own basis states that **no actual git ref
deletion is authorized**.

This runbook is the execution-planning artifact for CTO review. It is not
itself the authorize signal.

Required before any CAS or ledger consumption:

1. CTO names Fork A or Fork B after owner-machine preflight.
2. CTO names the executing operator and the owner-machine path.
3. CTO confirms PR #46 stays closed and is not the execution vehicle.
4. CTO confirms the window `expiresAt=2026-09-19T01:32:00Z` is still valid
   or mints a successor authorization in a separate PR.

Until that authorize exists, status remains `pending-release`, completion
evidence remains null, and the Human-AI local ref — if it still exists on
the owner machine — must stay present.
