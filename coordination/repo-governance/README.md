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
provider ledger. This governance task performed no provider write. EvidenceFlow
now reports provider-side/local/Vercel containment operations for all nine rows:
DeepSeek, Qwen/Ali, SimpleTex, Mathpix, Resend, OpenRouter, Clerk, BUG LRS, and
LRS. No SENA or MAIS production deployment/redeployment, remote-ref deletion,
or history rewrite is reported.

The earlier partial readback, secret-store correction, follow-up, readiness,
blocker, owner-attestation, and pre-action receipts remain immutable historical
evidence. Five later mode-`0600` closeout receipts are additionally bound by
exact path, SHA-256, byte count, schema, and time:

- Qwen/Ali: `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/qwen-rotation-closeout-20260827T133859Z.json`;
  SHA-256 `7bd7879524647c73a4f14b56f0bbf3c90bbc7aee6fc1cc8658c665e2d897e2ff`;
  1863 bytes; `sena-provider-rotation-closeout/v1`;
  `2026-08-27T13:38:59Z`.
- OpenRouter: `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/openrouter-rotation-closeout-20260827T134430Z.json`;
  SHA-256 `ae0c909bb42bce5378f2649895ad40ea7f19c13ef0628a08e0f4eea2562cd0d3`;
  1978 bytes; the same schema; `2026-08-27T13:44:30Z`.
- Shared BUG LRS/LRS event: `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/lrs-rotation-closeout-20260827T135705Z.json`;
  SHA-256 `c60963b8a85c6caa717ec14db0c669c50bad7540cf78759d4e7629e10f147266`;
  2834 bytes; the same schema; `2026-08-27T13:57:05Z`.
- Clerk: `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/clerk-rotation-closeout-20260827T144832Z.json`;
  SHA-256 `e4a35fab8384c077cffdfd02b6230971ff9c15c45ef68de54ecad4b90b5986d5`;
  2242 bytes; the same schema; `2026-08-27T14:48:32Z`.
- Mathpix: `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/mathpix-rotation-closeout-20260827T150838Z.json`;
  SHA-256 `579f231860591740e48d680a7bd3689679bc800e33f8b992d5c7cd9a16086598`;
  3819 bytes; the same schema; `2026-08-27T15:08:38Z`.

Fresh independent checks confirmed all five are regular non-symlink files with
link count one, exact hashes/sizes/modes, valid redacted JSON, and zero high-risk
credential-pattern findings. Qwen's no-visible-data default usage view retains
an approximately one-hour reporting-delay boundary. OpenRouter's legacy row had
nonzero historical usage, but no owner-frozen threshold exists, so no anomaly
classification is made; console deletion is not restated as an unperformed
legacy endpoint-negative probe. One LRS receipt maps to two shared governance
rows. Its cross-origin `302` probes forwarded no credentials and are not auth
proof. It also records one legacy-username-only selector-timeout diagnostic
exposure; no password or replacement credential was echoed, but deleting the
old Access Key does not prove every diagnostic/session artifact has been erased.
Clerk's owner-requested dormant replacement is now present in one local
assignment plus sensitive, branch-unscoped Preview and Production bindings;
exact private local readback matched. The uniquely matched legacy default secret
was deleted and absent after stable refresh, only the replacement secret remains,
and the publishable key was not modified. No user-data endpoint, billable
operation, deployment, runtime execution, or usage-absence claim is made.

Mathpix's replacement is enabled, exact private local pair readback matched, and
sensitive, branch-unscoped Preview/Production bindings are present. Vercel
sensitive values are write-only, so no exact remote value readback is claimed.
The legacy key was disabled through Mathpix's documented revocation mechanism
and remained disabled after stable refresh; the replacement remained enabled.
Usage showed no data, but no historical-never-used claim is made, and no OCR,
Playground, Results, Requests, runtime execution, deployment, or history rewrite
occurred. Its receipt also records one checkbox-state diagnostic that echoed
only the legacy application identifier; no key or replacement identifier was
echoed, the legacy key was disabled in the same rotation window, and the
identifier itself is not reproduced here.

All nine provider rows are now complete. The superseding no-value readback is
the regular, non-symlink, link-count-one mode-`0600`, 12,089-byte file
`/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-containment-readback-20260827T151341Z.json`,
observed at `2026-08-27T15:13:41Z`, with SHA-256
`49fbd755fe773f861ae9158445480f1cdfbb68110933a7d40756f41a7c00d1b2`.
Independent checks confirmed valid redacted
`sena-provider-containment-readback/v1` JSON, nine complete rows, an exact
twelve-receipt supersession chain, and zero high-risk credential-pattern or
sensitive semantic-string findings. The twelve source receipts also passed
independent exact hash/mode/type/JSON/no-value checks.

Provider containment is therefore true. Those provider receipts alone did not
authorize PR Ready or merge. A separate exact-head owner-authorization receipt
was subsequently consumed when PR #21 became Ready and merged as
`9ecc72b09d51e2426868eb7569449ed9aea0f774`; exact-head and post-main checks
passed. This follow-up declares the deletion receipt active but it remains
non-executable until the activation snapshot is itself on protected `main`.
Feature work remains frozen, and contaminated-ref deletion, root-checkout
movement, incident closure, feature thaw, and deployment remain pending.

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
redacted readback, satisfied; (2) protected merge of PR #21, satisfied as
`9ecc72b...` with post-main checks green; (3) protected-main follow-up activation
of the one-shot receipt bound to provider evidence, current step; (4)
exact-old-SHA lease deletion of only the quarantined docs ref; (5) fresh live
absence readback; and (6) protected-main consumed/deletion-event custody
receipt. The existing owner authorization is declared `active` in this
follow-up, but it is not executable until this exact registry snapshot is the
freshly fetched protected `main`. No deletion may be attempted from an older
main snapshot.

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
inferred from provider or governance implementation evidence:

- PR #21 Ready/merge authorization was separately bound to exact head
  `24d24c8...`, consumed by the protected merge, and closed out against merge
  commit `9ecc72b...` plus successful post-main checks;
- merge this activation follow-up onto protected `main`, then use the already
  owner-authorized one-shot receipt to delete only the contaminated remote
  branch with an exact old-SHA lease, read back live absence, and record the
  protected-main consumed/event-custody receipt in that order;
- rewrite history or request GitHub cached-object removal;
- remove or archive broken worktree directories;
- switch the root checkout and fast-forward local `main`;
- deploy or change the production alias.

The root checkout can return to `main` only after the rescue receipt, sanitized
salvage, credential rotation readback, live-ref audit, lock/process checks, and
owner authorization are all present. The allowed transition is ordinary
checkout plus fast-forward; reset and force are not part of the procedure.
