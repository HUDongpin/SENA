# SENA preservation-first governance implementation receipt — 2026-08-27

Status: **implementation reviewable; machine controls pass; P0 remains
blocked-owner**

Scope: Git data preservation, session/worktree/branch registry, local/CI
security gates, developmental-gap triage, and exact-main local handoff evidence

Production promotion: **not authorized and not performed**

## Source and change boundary

The implementation was prepared in the registered worktree and branch:

```text
/Volumes/Starship/SENA/.worktrees/sena-a01-repo-governance-20260827
codex/sena-a01-repo-governance-20260827
base = 5cdea568a053347dbc82069bde3e836cffb55cc6
```

The quarantined root checkout was not switched, reset, stashed, merged,
rebased, cleaned, or used for tracked writes. The implementation did not
delete a branch/ref/worktree, rewrite history, read either credential DOCX,
revoke or rotate a provider credential, change a Vercel setting, or deploy.

## Implemented controls

- `active-work.json` binds each remaining branch/worktree to an owner,
  ownership lane, exact base/head observation, allowed paths, heartbeat,
  review/closeout date, PR disposition, sensitive paths, and five distinct
  evidence layers.
- The open P0 freeze permits only an exact task/owner/lane/branch/allowed-path
  exception. A label alone cannot create write authority.
- Pre-commit reads the stage-0 registry object from the index, checks all
  staged `ACMRTD` paths against that snapshot, and scans staged blobs including
  Git type changes. A working-only policy overlay cannot authorize the index.
- Pre-push accepts exactly one non-deletion current-branch update. It first
  reads the registry from the outgoing commit and applies owner, disposition,
  forward-only, allowed-path, remote-state, and canonical-remote checks without
  network contact.
- The remote name, Git-provided remote location, resolved fetch URL, and
  resolved push URL must all identify `github.com/HUDongpin/SENA`. The identity
  exists both as a hard-coded invariant and a registry field. Host lookalikes,
  userinfo, percent encoding, query/fragment data, dot paths, extra paths,
  multiple push URLs, `pushurl`, and `pushInsteadOf` rewrites fail without URL
  or credential-value output.
- Only after the local remote/write policy passes does pre-push run the live
  remote query and the complete rescue-ref, bundle, orphan-inventory, and
  disk-only-source custody audit using the same outgoing-commit registry.
- The scanner blocks the prohibited DOCX path at any depth, non-example env
  files, private-key files, named credential exports/archives, the known
  quarantined blob ID, bounded high-confidence secret shapes, deletions,
  non-fast-forward updates, unregistered refs, direct `main`, rescue refs,
  tags, notes, and non-branch namespaces.
- The GitHub workflow provides post-acceptance branch/PR audit evidence. It is
  not represented as server-side push protection; the existing ruleset and
  owner/platform security settings remain separate.

## Preservation evidence

The preservation gate currently verifies:

| Evidence | Verified result |
|---|---|
| Local rescue refs | 26 namespaced refs; includes `6654112` and `0190acc` |
| `git fsck --unreachable --no-reflogs` | 0 unreachable commits after rescue |
| Offline rescue bundle | SHA-256 `26753db5921b1bfbe6f9e58220737e6a68e769fd97132c2684f3a1e35088159e`; `git bundle verify` passes |
| Rescue ref-list | SHA-256 `2b4834c8bf701ed416a408ac2cfae5be44c7037cdcee309eec24b5d4ead9ad88` |
| Orphan inventory | 3,860 non-generated files; 3,849 represented by `origin/main`; 11 disk-only; 2 reviewable disk-only source files |
| Disk-only source copies | owner-only external copies with Git blob and SHA-256 verification |
| Broken worktree directories | 4 preserved, inventoried, and still not cleanup-authorized |
| Contaminated DOCX blob | excluded from ordinary rescue bundle; live docs branch remains an owner blocker |

The two disk-only navigation files received semantic review. The old
implementation is not suitable for cherry-pick; only its still-applicable
breakpoint complement invariant was re-expressed as a current regression test.

## Verification ledger

All commands below ran in the governance worktree unless the row explicitly
names the exact-main release worktree.

| Gate | Result |
|---|---|
| Governance + navigation focused tests | 2/2 files, 33/33 tests passed |
| Final full suite, broad phase | 208 files passed, 1 live file skipped; 2,953 tests passed, 2 live tests skipped |
| Final full suite, serial phase | 5/5 files, 63/63 tests passed |
| `npx tsc --noEmit` | passed |
| `npm run lint` | passed |
| `npm run build` | passed; Next.js 16.2.12 generated 75/75 pages |
| Script/hook/JSON syntax | `node --check`, both `sh -n` checks, and JSON parse passed |
| Patch hygiene | `git diff --check` passed |
| Local governance audit | `errors=[]`, `status=blocked-owner`, 26 rescue refs, 0 unreachable commits |
| Live governance audit at `2026-08-27T06:29:44.349Z` | `errors=[]`, `status=blocked-owner`; 2 live heads, 2 tags, 0 open PRs before this governance draft |
| Exact-main handoff | separate receipt binds the full pilot gate to commit `5cdea568` / tree `4a0f018` |

The skipped live Postgres tests are reported as skipped, not passed. The exact
main release receipt remains the authority for the pilot/browser/performance
chain; this receipt does not relabel governance-branch CI as application
release evidence.

## Independent review

| Reviewer lane | Scope | Disposition |
|---|---|---|
| Evidence review | receipt counts, custody facts, and separation of local/CI/merge/deployment/live claims | APPROVE |
| Plan-compliance review | preservation-first implementation and owner-gated destructive/external boundaries | APPROVE |
| Security review | four iterative attack reviews covering staged type changes, writer/disposition binding, freeze exceptions, remote spoofing, snapshot authorization, and pre-network ordering | APPROVE after all reproducible findings were fixed |

The final security approval is limited to the implemented cooperative controls.
Local hooks can still be bypassed by an authorized local user with
`--no-verify`, and branch-controlled GitHub Actions run after server acceptance.
Repository rules, required reviews, secret scanning/push protection, provider
controls, and owner discipline remain necessary layers.

## Open owner gates

Machine implementation does not close the P0 incident. The remaining actions
require distinct owner authorization and evidence:

1. identify affected providers/accounts/environments without disclosing values;
2. revoke/rotate every real credential and capture provider-side redacted
   readback;
3. update approved secret stores and dependent environments;
4. delete the contaminated remote docs ref with an exact old-SHA lease after
   sanitized salvage and owner approval;
5. restore the root checkout to live `main` by ordinary checkout plus
   fast-forward only;
6. decide preservation/archive/cleanup disposition for the four broken
   worktree directories and remaining frozen branches;
7. separately authorize any production promotion.

Until those gates close, the correct top-level state is:

```text
governance implementation: reviewable and machine-verified
credential incident: blocked-owner
root checkout: quarantined
research-pilot software/reviewer package: locally eligible only under exact-SHA receipt
governed real-data pilot: not yet proven
production promotion: not authorized / not proven
```
