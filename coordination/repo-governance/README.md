# SENA repository governance

This directory is the SENA control-plane ledger for sessions, branches, Git
worktrees, rescue refs, incident boundaries, and evidence maturity. It does not
contain credential values, provider tokens, runtime databases, or copies of
sensitive documents.

## Current operating boundary

Ordinary feature development remains frozen while the credential incident in
`active-work.json` is `blocked-owner`. The safe work allowed during that freeze
is limited to preservation, redacted security containment, governance tooling,
sanitized salvage review, and exact-SHA verification.

`provider-containment-ledger-20260827.json` is the machine-readable no-value
provider ledger. EvidenceFlow reports replacement and revocation for DeepSeek,
Resend, and SimpleTex, while this governance task itself performed no provider
write. A mode-`0600` durable partial receipt observed at
`2026-08-27T11:46:54Z` is bound by path, SHA-256, byte count, and file mode; it
marks those three provider rows complete and records the no-deployment runtime
boundary. The owner has since classified DeepSeek's two named concentration
dates as expected activity, closing that one reconciliation blocker; the other
six rows remain open. The receipt itself says overall containment is incomplete
and remote deletion activation is disallowed, so no completed incident
containment is claimed. A second durable additive receipt extends the first for
DeepSeek/Resend secret-store scope, binding separate sensitive Preview and
Production assignments without value emission, provider calls, or deployment;
it also keeps overall containment and deletion activation false. A third
read-only receipt refreshes the six remaining rows at `2026-08-27T12:23:17Z`
without a credential write/delete or billable/runtime side effect. A fourth
readiness receipt at `2026-08-27T12:26:52Z` binds a non-exhaustive
Qwen/Mathpix/LRS consumer and environment-slot inventory plus the
owner-requested dormant OpenRouter/Clerk target; independent source review adds
`scripts/probe-tutor-providers.mjs` as a fourth minimum-known Qwen consumer.
Those additions improve sequencing evidence only: six provider rows remain
open, credential creation/deletion still requires action-time confirmation,
feature work remains frozen, and deletion activation remains false.
A fifth mode-`0600` blocker receipt at `2026-08-27T12:31:24Z` freezes the
remaining owner-login/action-time-confirmation boundary and the pre-commit Git
snapshot. It explicitly states that PR #21's old-head green checks do not cover
the current A01 edits; it authorizes no merge, remote-ref deletion, root
movement, EvidenceFlow feature worktree, or thaw. Its DeepSeek classification
action was subsequently satisfied by owner attestation; the remaining provider
login/rotation/revocation actions are unchanged.

The root checkout at `/Volumes/Starship/SENA` is a quarantined control-plane
checkout. It must not be switched, reset, stashed, rebased, merged, cleaned, or
used for feature work until the P0 owner gate is closed. New work uses a branch
and a Git-registered worktree created from a freshly verified `origin/main`.

## Hard rules

1. One top-level write task has one owner, one branch, and one registered
   worktree.
2. A branch has at most one active writer. Review agents are read-only unless a
   written handoff changes ownership.
3. At most three write worktrees may be active: one integration/release lane
   and two feature lanes.
4. The first reviewable commit must gain an upstream plus draft PR, or a
   machine-readable `noPrReason`, within 24 hours.
5. A dirty worktree without a heartbeat for 24 hours is warned. At 72 hours it
   is frozen for preservation review. It is never auto-deleted.
6. An ownerless/no-PR branch older than seven calendar days enters manual
   review. Patch equivalence is not ancestry and never authorizes force delete.
7. Merged plus clean worktrees receive ordinary same-day closeout. `git stash`,
   `git clean -fdx`, `git reset --hard`, forced worktree removal, and
   unauthorized branch deletion are not closeout tools.
8. Every evidence claim names its layer: local, CI, merged, deployed, and live.
   A green layer never implies the later layers.

## Registry lifecycle

Every write task is entered in `active-work.json` before its first tracked
write. Required fields include task/thread identity, absolute cwd, owner lane,
branch, worktree, base/head SHA, allowed paths, owner heartbeat/review date, PR or
`noPrReason`, dirty state, sensitive paths, five-layer evidence state, and one
of these dispositions:

- `active`
- `ready-for-pr`
- `integrated`
- `frozen-recovery`
- `security-quarantine`
- `preservation-review`
- `archived`
- `cleanup-approved`

`lastHeartbeatAt` is an owner/writer signal and is never refreshed merely
because an auditor observed the branch. `lastObservedAt` records the audit and
`lastCommitAt` is Git evidence; frozen/legacy objects may therefore have a null
owner heartbeat. `nextReviewAt` is always an ISO date even when final closeout
remains owner-gated.

`headSha` is the last heartbeated exact head. An active lane may advance only
forward from that SHA and only through its declared `allowedPaths`; the audit
warns until the next heartbeat records the new head. Inactive/frozen lanes must
match exactly. The audit also checks the registered worktree/branch pairing,
upstream, ahead/behind tuple, dirty allowed paths, 24/72-hour heartbeat policy,
one release plus at most two feature lanes, and preservation custody.

`main` is the deliberate exception to exact-equality observations: its
recorded remote SHA and the credential incident's `liveMainSha` are monotonic
lower bounds. A live audit accepts only a descendant of those SHAs and reports
the advance as a warning. This prevents a governance PR from making its own
registry recursively stale when it merges, while a rewrite or divergent
`main` still fails closed. A registered open PR may likewise advance only to
GitHub's terminal `MERGED` or `CLOSED` state with the same recorded head SHA;
that transition stays a warning until ordinary closeout refreshes the ledger.

While the P0 incident is open, an active task cannot obtain write permission by
choosing a `freezeException` label. Each exception is bound in policy to one
exact task, owner key, owner lane, branch, and complete allowed-path set, with
its authorization basis recorded. A writable work item and its branch must
also have the same `active` or `ready-for-pr` disposition.

An ownership handoff records the old owner acknowledgement, exact head SHA,
clean/dirty state, untracked-file inventory, and new owner acknowledgement
before the new writer starts.

## Commands

Run from `sena-hk-template`:

```bash
npm run sena:repo:registry
npm run sena:repo:security
npm run sena:repo:audit
```

The full local topology audit re-hashes the rescue ref list, bundle, inventory,
and disk-only source copies and runs `git bundle verify` on the recorded
custodian clone. It can additionally
perform a fail-closed live read-only GitHub heads/tags and PR query:

```bash
node ../scripts/verify-sena-repo-governance.mjs audit --live
```

Generate a non-generated orphan-worktree inventory only into an owner-controlled
path outside the repository:

```bash
npm run sena:repo:inventory -- --output /approved/owner-only/path/inventory.json
```

The inventory hashes reviewable files, compares their Git blob IDs with
`origin/main`, local/remote branches, rescue refs, and the object database, and
reports disk-only candidates. Generated directories are size-summarized.
Sensitive runtime directories are classified but not copied.

## Security gate

During this P0 freeze the shared clone is configured to the absolute,
owner-recorded hook custody path in `active-work.json`. The hooks discover the
actual caller worktree and run the governance script against that target, so
the quarantined root and completed release worktree are fail-closed while the
registered governance exception remains writable. After this change is
integrated and the owner authorizes root restoration, hook custody should move
to relative `.githooks` in the restored checkout.

`.githooks/pre-commit` reads the stage-0 registry object from the index, binds
every staged path to that snapshot's exact writer/freeze allowlist, and scans
the staged index before a prohibited object enters a commit. An unstaged policy
overlay therefore cannot authorize a commit. `.githooks/pre-push` requires one
ref update. Ordinary pushes read the registry from the outgoing commit and use
that same commit snapshot for the live topology/preservation audit and writer
policy. A deletion has no outgoing commit, so its special path first validates
the canonical remote, fetches the live protected `origin/main`, and uses that
single exact main commit for push policy, live audit, security scan, and
deletion-boundary checks. Working-tree policy text and an operator-only local
commit are not push authorization sources.

The push policy requires `origin`, the current registered writer's exact local
branch ref, and the same exact remote branch ref. The hook-provided remote
location plus all resolved fetch/push URLs must normalize to the hard-coded and
registry-bound `github.com/HUDongpin/SENA` identity; a `pushurl`,
`pushInsteadOf`, lookalike host, credential-bearing URL, alternate path, or
ambiguous URL set fails without echoing the URL. It rejects direct `main`
updates, other owners' or unregistered branches, tags, notes, rescue refs,
unauthorized deletions, and non-fast-forward updates. Empty, multi-ref, or
partially captured update input fails closed.
The scanner examines the final tree and every outgoing commit, including every
parent comparison of a merge commit, so adding a forbidden file during merge
resolution and deleting it later still fails. It blocks:

- any case variant of `All API Keys.docx` at any depth;
- non-example `.env*` files;
- private-key filenames and extensions;
- explicitly named credential/key exports and sensitive archives;
- the known quarantined credential-document blob by exact object ID, even if it
  is renamed to an innocuous binary filename;
- high-confidence private-key and provider-token shapes in text blobs.

Binary document protection is path-based and therefore does not rely on a text
scanner. Blobs beyond the bounded text scanner are rejected fail-closed rather
than silently skipped. Non-fast-forward updates remain rejected. A remote
security-quarantine branch deletion is accepted only when the freshly fetched
protected `origin/main` registry contains an active, unexpired incident receipt
binding the exact ref and old SHA to the current operator task/owner and GitHub
actor, with provider containment complete and a timestamped redacted provider
readback. The receipt is also bound to live GitHub ruleset `21635990`, which
restricts creation, deletion, and non-fast-forward updates for the exact
quarantine ref and gives only the owner actor a bypass. Pending, expired,
consumed, wrong-actor, wrong-ruleset, or mismatched receipts fail closed. After
a successful exact-lease deletion, the absent ref plus the creation restriction
closes ordinary replay, and the receipt must immediately move to `consumed`
with event custody on protected `main`. This is an owner-controlled operational
one-shot, not a claim that GitHub provides an atomic receipt-consumption
primitive. New branches are
compared against trusted `origin/main`, so a contaminated ancestor already
reachable from another remote branch is not excluded. Findings contain only a
sanitized path (or stable redacted path hash), rule ID, and sanitized source;
the matched value is never printed. Tests construct explicitly fake
credentials at runtime and assert that neither content nor filename values are
emitted.

The deletion is strictly ordered: (1) provider containment plus timestamped
redacted readback; (2) protected merge of Draft PR #21; (3) protected-main
follow-up activation of the one-shot receipt bound to provider evidence; (4)
exact-old-SHA lease deletion of only the quarantined docs ref; (5) fresh live
absence readback; and (6) protected-main consumed/deletion-event custody
receipt. The existing owner authorization remains
`pending-provider-readback`; it is neither absent nor executable. No deletion
may be attempted from pre-governance `main`.

The added GitHub Actions workflow runs the fast gate on pushes/PRs whose
checked-out ref contains that workflow. It cannot retroactively protect an old
branch that lacks the workflow, and it detects a pushed commit after server
acceptance rather than acting as server-side push protection. The exact
quarantine ruleset is therefore the remote pre-acceptance boundary. For a
deletion event, Actions checks out deletion-event `github.sha`, which is the
event-time default-main commit. It uses `github.event.before` and the zero
`github.event.after` for the deleted ref itself, while using `github.sha` only
as the immutable protected-main authorization commit. It does not fetch a
later `main`, so a
subsequent activation or consumed-receipt commit cannot rewrite the event's
authorization result. It loads that protected-main receipt, verifies
`github.actor` and every ruleset
field visible to its read-only token, and does not invent a commit range for
the deleted ref. GitHub may omit `bypass_actors` for tokens without ruleset
write authority; the owner-authenticated pre-push readback must verify the sole
bypass actor before deletion, while CI never treats an omitted field as new
authorization. Other push
events remain bound to an active registry branch and its forward-only allowed
paths; forced and non-branch mutations remain failures.
Post-PR updates to `main` remain governed by the GitHub ruleset because CI
cannot reliably distinguish every server-mediated merge strategy from a direct
push after acceptance. The live `main-minimum-safety` ruleset now requires both
the existing `build` check and `repository-security`, with strict required
checks enabled. Repository-level automatic branch deletion is disabled so a
merged branch remains available until exact-SHA post-merge verification and
ordinary closeout. These are live GitHub settings and must be re-read before a
merge rather than inferred from this ledger. CI also runs a portable
checkout-topology audit; clone-specific rescue custody stays in the full local
pre-push audit on the recorded custodian. Other clones cannot claim custody of
artifacts they do not hold. GitHub secret scanning and push protection remain
owner/platform-plan availability gates.

## P0 preservation state

The local `refs/rescue/sena-20260827/*` namespace protects every maximal
unreachable tip identified during the 2026-08-27 audit, including the
patch-unique `6654112` and reflog-only `0190acc`. Rescue refs are local-only and
must not be pushed without a separate security review.

The verified bundle and orphan-source quarantine are outside the repository.
Their paths and SHA-256 values are recorded in `active-work.json` and the rescue
receipt. Neither sensitive DOCX is included in that bundle or copied into the
ordinary rescue area.

Four broken worktree directories remain preserved in place. Their `.git`
pointers target the pre-migration Desktop repository and are invalid. Listing
them in the registry makes them audited preservation objects; it does not make
them valid Git worktrees and does not authorize cleanup.

The two disk-only navigation files were compared semantically with current
`main`. The old `xl` implementation is superseded by current `lg` compaction and
must not be cherry-picked. Its still-useful breakpoint-complement invariant was
selectively re-expressed as a current-strategy regression test.

The durable pre-delete live-ref audit at `2026-08-27T12:07:09.098Z` covered 3 heads, 2
tags, and 22 PR candidate refs: 27 candidate refs backed by 24 distinct objects.
Recursive tree metadata was complete. Exactly four findings were confined to
the two forbidden path/blob occurrences on the quarantined docs head; every
other head, tag, PR-head candidate, and PR-merge candidate was clear. No file
body was obtained or printed, and no deletion was performed. Its regular,
non-symlink, mode-`0600`, 1,593-byte external receipt is bound by SHA-256 in the
registry.

## Development frontier

`developmental-gap-register-20260827.md` is the source-bound priority ledger.
It now records an exact 375x900 mobile P1: persistent-rail heading coverage,
metric overlap, and five internally clipped elements. Ordinary product work is
still frozen; after P0 closes, the mobile GAP-06 fix is the first product-code
lane that can start without external real data. The real-data walkthrough,
genuine coding-reliability/adjudication/human-review evidence, and independent
mathematical/statistical oracle remain separate research inputs. Claim readiness
stays exploratory and production cutover stays owner-gated.

## Exact-main handoff receipt

`exact-main-release-receipt-20260827.md` binds the complete local research-pilot
gate sequence to commit `5cdea568a053347dbc82069bde3e836cffb55cc6` and tree
`4a0f018023803cb5eef8d67b05658d8656ca1f58`. It records real test counts,
responsive browser coverage, strict performance custody, and the clean final
worktree state. The automated ladder passes and the later metadata package is
independently verified complete, but independent visual review passes desktop
and fails mobile/overall with an open P1. Research-pilot/reviewer handoff is
therefore conditional and not fully approved. Deployment and live behavior
remain unproved.

## Owner-gated actions

The following actions require distinct owner authorization and must not be
inferred from this governance implementation:

- finish every still-pending provider action and proof in the no-value provider
  ledger, including Qwen/Ali, Mathpix, the owner-requested dormant
  OpenRouter/Clerk replacements plus local/Preview/Production bindings, and the
  shared LRS.io binding represented by BUG LRS/LRS;
- bind all remaining and future rotations/revocations, secret-store changes,
  usage reviews, and runtime boundaries to a later complete redacted readback
  that supersedes the current partial receipt;
- merge Draft PR #21, activate the one-shot receipt on protected `main`, delete
  the contaminated remote branch with an exact old-SHA lease, read back live
  absence, and record the protected-main consumed/event-custody receipt in that
  order;
- rewrite history or request GitHub cached-object removal;
- remove or archive broken worktree directories;
- switch the root checkout and fast-forward local `main`;
- deploy or change the production alias.

The root checkout can return to `main` only after the rescue receipt, sanitized
salvage, credential rotation readback, live-ref audit, lock/process checks, and
owner authorization are all present. The allowed transition is ordinary
checkout plus fast-forward; reset and force are not part of the procedure.
