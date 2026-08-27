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
Separately, a redacted EvidenceFlow handoff reports provider-side/local/Vercel
environment-configuration writes for DeepSeek, Resend, and SimpleTex. That
external evidence is recorded without values and does not imply a SENA or MAIS
production deployment/redeployment.

## Implemented controls

- `active-work.json` binds each remaining branch/worktree to an owner,
  ownership lane, exact base/head observation, allowed paths, heartbeat,
  review/closeout date, PR disposition, sensitive paths, and five distinct
  evidence layers.
- `provider-containment-ledger-20260827.json` records the corrected nine-provider
  inventory using names, credential classes, environment scope, controlled
  equality states, and redacted proof fields only. It records no values or value
  hashes. A durable mode-`0600` partial receipt is bound by exact path, SHA-256,
  byte count, file type, and observed time. It marks DeepSeek, Resend, and
  SimpleTex complete and records a no-deployment runtime boundary; Resend has a
  bounded dashboard-log review. A later exact owner-attestation receipt
  classifies DeepSeek's two named usage concentrations as expected, closing only
  that reconciliation blocker. The same six remaining provider rows stay open,
  overall containment is false, and remote deletion activation remains
  disallowed.
- A later durable additive no-value receipt records separate sensitive Vercel
  Preview and Production bindings for DeepSeek and Resend, with each new Preview
  binding returning `201`, follow-up inventory reporting `branchScoped=false`,
  and one local assignment in a mode-`0600` file. It extends rather than mutates
  the first receipt, marks only these two secret-store scopes complete, and
  records no value emission, provider call, or deployment/redeployment; overall
  containment and deletion activation remain false.
- A fresh 4,501-byte mode-`0600` read-only receipt extends both prior hashes and
  directly refreshes the six remaining provider rows. It records active and
  console/usage continuity without credential writes/deletes, billable calls,
  model generation, OCR, email, or xAPI statements. DeepSeek, Resend, and
  SimpleTex are carried through the receipt's closure section rather than new
  direct rows; all-provider containment, deletion activation, and feature thaw
  remain false.
- A separate 5,591-byte mode-`0600` readiness receipt binds three
  receipt-attested Qwen consumers, one Mathpix consumer, the owner-requested
  no-deployment dormant OpenRouter/Clerk target, and incomplete BUG_LRS/LRS
  Vercel slots. Independent source review found a fourth minimum-known Qwen
  consumer, `scripts/probe-tutor-providers.mjs`; its default path performs a
  provider POST and only `--list` is read-only. The receipt uses `recordedAt`
  plus `sourceReceipts` and has no separately registered schema. It explicitly
  requires action-time confirmation for credential creation and deletion and is
  sequencing evidence, not replacement, revocation, runtime, deployment,
  containment, or deletion-activation proof.
- A 3,979-byte mode-`0600` blocker receipt freezes the provider-console and
  pre-commit Git boundary at `2026-08-27T12:31:24Z`: root/remote refs remain
  unchanged, PR #21 is Draft/Open at `e6a4533`, and old-head checks do not cover
  current A01 edits. Its later DeepSeek classification action is now satisfied;
  its provider-console states remain a historical snapshot.
- A later independent 4,393-byte mode-`0600` pre-action receipt at
  `2026-08-27T13:12:06Z` records Qwen/OpenRouter/Clerk authenticated with create
  dialogs open but unsubmitted, Mathpix still login-required, and LRS
  authenticated without opening the create action. All final submits, external
  writes/deletes, billable calls, and deployments are false. A non-sensitive
  browser-memory-to-`0600`-FIFO transport-mechanism probe passed without using
  credential material; it does not prove real credential transfer, provider
  creation, secret-store update, runtime binding, rotation, revocation, or
  deployment. The fixed receipt has no parent/source-receipt hash field, so it
  is bound as an independent additive artifact. The same six provider rows
  remain open, containment/deletion activation remain false, feature freeze
  remains true, and PR #21 remains Draft.
- The mode-`0600`, 848-byte owner-attestation receipt at
  `2026-08-27T12:35:03Z`, SHA-256
  `b4a7aeaab9f4b364bb235e61c9735b15f02e0628eb5111a0f5c580dd33544af1`,
  clears only DeepSeek's named usage-reconciliation blocker. It changes no
  credential rotation, other-provider containment, deletion activation, or
  feature-freeze state.
- Although the base receipt observed no OpenRouter/Clerk runtime binding, an
  explicit owner scope correction requires dormant replacements in MAIS local
  plus Vercel Preview/Production before legacy revocation. Their consoles are
  now authenticated with create dialogs open but unsubmitted; action-time
  confirmation, creation, redacted secret-store readback, usage review, and
  revocation remain pending. No current code consumer or deployment
  authorization is claimed.
- The open P0 freeze permits only an exact task/owner/lane/branch/allowed-path
  exception. A label alone cannot create write authority.
- Pre-commit reads the stage-0 registry object from the index, checks all
  staged `ACMRTD` paths against that snapshot, and scans staged blobs including
  Git type changes. A working-only policy overlay cannot authorize the index.
- Pre-push normally accepts exactly one non-deletion current-branch update and
  reads its registry from that outgoing commit. A security-quarantine ref
  deletion is the sole narrow exception: after canonical-remote validation it
  freshly fetches protected `origin/main` and binds push policy, live audit,
  security scan, and deletion-boundary verification to that one commit. The
  protected-main registry must contain an active, unexpired incident receipt
  for the exact ref and old SHA, bind the current operator task/owner and
  GitHub actor, and record completed provider containment plus timestamped
  redacted readback.
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
  quarantined blob ID, bounded high-confidence secret shapes, unauthorized
  deletions, non-fast-forward updates, unregistered refs, direct `main`, rescue
  refs, tags, notes, and non-branch namespaces.
- The exact-SHA contaminated-ref deletion receipt is currently
  `pending-provider-readback`; pending receipts cannot authorize a push. After
  provider containment is proven, Draft PR #21 must first merge through
  protected `main`; a protected-main follow-up may then bind the provider
  evidence and activate the receipt for one exact-lease deletion. Fresh live
  absence readback must precede a protected-main consumed/event-custody receipt.
  Pre-governance `main` must never be used for the deletion.
- GitHub ruleset `21635990` is active on the exact contaminated branch and
  restricts creation, deletion, and non-fast-forward updates. Its sole bypass
  actor is the receipt-bound repository owner. The owner-authenticated hook
  re-reads and verifies the complete live ruleset including that sole bypass;
  deletion-event CI re-verifies all fields exposed to its read-only token and
  separately binds `github.actor`. Actions remains post-acceptance evidence,
  while the ruleset is the server-side pre-acceptance boundary.
- Deletion-event CI checks out event-time default-main `github.sha`, uses the
  event payload's exact `before` and zero `after` for the deleted ref, and
  freezes that `github.sha` as its protected-main authorization registry. It
  neither fetches a later main
  nor scans a false `before..github.sha` range. It verifies `github.actor`; a
  successful deletion must be followed by a
  protected-main consumed receipt containing timestamp and event custody.
- The GitHub workflow provides post-acceptance branch/PR audit evidence. The
  live `main-minimum-safety` ruleset now requires both `build` and
  `repository-security`, using strict required checks. This still is not
  GitHub secret-scanning push protection for arbitrary secret shapes.
- Repository automatic branch deletion is disabled; exact-SHA post-merge
  verification precedes ordinary remote/local branch closeout.

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
| Current no-value ledger/receipt refresh | ten external artifacts matched exact path/hash/byte count/0600 mode/regular/non-symlink/JSON custody; the new receipt's credential-pattern and sensitive semantic-key counts were zero; provider/registry/fail-closed cross-assertions, exact five-path scope, real-index-clean check, `git diff --check`, registry audit, temporary-index write/security hooks, and the focused governance suite all passed; final focused result was 1 file / 36 tests; no product suite/build was required for governance-only evidence updates |
| EvidenceFlow compatibility/recovery-spike binding | first receipt binds exact path/SHA-256/1,657-byte size/0600 mode and in-memory StateGraph/thread/interrupt/replay/digest-dedup evidence; a 2,307-byte mode-0600 extension binds the first hash and records localhost PostgreSQL 16.15 PostgresSaver setup, interrupt persistence, SIGKILL/137, new-process same-thread resume, replay, one receipt row after replay, and zero duplicate effects; the handoff reports one row before replay but the fixed JSON does not record that pre-replay count; institution-managed topology, outbox/server-job integration, multi-host operations, SENA integration, deployment, and production readiness remain unproved; neither audit reran the spike |
| Governance + navigation focused tests | 2/2 files, 39/39 tests passed after adding protected-main deletion, full-hook, event-time CI, candidate-index isolation, and failure-log non-disclosure regressions |
| Sandbox full-suite attempt | 207 files and 2,953 tests passed; the exact-loopback listener test exited before readiness in the restricted sandbox |
| Controlled-loopback full-suite rerun | 208 files passed, 1 live file skipped; 2,954 tests passed, 2 live tests skipped |
| Final full suite, serial phase | 5/5 files, 63/63 tests passed |
| `npx tsc --noEmit` | passed |
| `npm run lint` | passed |
| `npm run build` | passed; Next.js 16.2.12 generated 75/75 pages |
| Script/hook/JSON syntax | `node --check`, both `sh -n` checks, and JSON parse passed |
| Patch hygiene | `git diff --check` passed |
| Local governance audit | `errors=[]`, `status=blocked-owner`, 26 rescue refs, 0 unreachable commits |
| Durable pre-delete live-ref audit at `2026-08-27T12:07:09.098Z` | mode-0600 external receipt bound by exact path/SHA-256/1,593-byte size; 3 heads, 2 tags, 22 PR candidate refs, 27 candidate refs / 24 distinct objects; recursive tree metadata complete; exactly 4 findings, all on exact quarantined docs ref `18d542f`; credential contents not read; deletion not performed; `status=blocked-owner` |
| First reviewable governance commit | `531f320e7b6fe98b29356c7fb2a51b7b52d334ab`; pushed through the pre-push gate |
| GitHub review surface at this update's pre-edit heartbeat | Draft PR #21 exact head `0943a93cef288ba93715c1a5ecf23cac8d527f6d`; build run `33073674556`, repository-security PR run `33073674552`, and repository-security push run `33073670785` all succeeded; these prior-head checks do not cover the new additive receipt update; `build` and `repository-security` are required; automatic branch deletion is disabled |
| Exact-main handoff | automated ladder passes on commit `5cdea568` / tree `4a0f018`, metadata package is independently verified complete, desktop visual passes, and mobile/overall visual fails with an open P1; handoff is conditional/not fully approved |

The skipped live Postgres tests are reported as skipped, not passed. The exact
main release receipt remains the authority for the pilot/browser/performance
chain; this receipt does not relabel governance-branch CI as application
release evidence.

## Independent review

| Reviewer lane | Scope | Disposition |
|---|---|---|
| Evidence review | receipt counts, custody facts, and separation of local/CI/merge/deployment/live claims | APPROVE |
| Plan-compliance review | preservation-first implementation and owner-gated destructive/external boundaries | APPROVE |
| Security review | iterative attack reviews covering staged type changes, writer/disposition binding, freeze exceptions, remote spoofing, protected-main authorization, exact deletion hook wiring, event-time main custody, ruleset readback, actor binding, candidate-index isolation, and failure-log disclosure | APPROVE under the trusted-owner threat model after all reproducible findings were fixed; final focused rerun passed 36/36 governance tests |
| Prior no-value provider/receipt spec review | nine-provider ledger, EvidenceFlow corrections, live-ref counts, deletion order, exact-main boundaries, GAP-06, and changed-path scope before the durable partial receipt arrived | APPROVE after closing one stale production-authorization P1 and two identity/authorization-wording P2 findings; latest partial-receipt binding receives a new review below |
| Durable partial provider receipt integrity review | external file integrity, structure, redaction boundary, provider-row counts, completion boundary, and deletion-activation state | APPROVE; read-only independent audit confirmed 3 completed / 6 remaining, overall containment false, deletion activation false, and no credential values/value hashes/response bodies/endpoint URLs emitted; this is artifact verification, not a second provider login |
| Durable provider secret-store correction integrity review | additive chain to the base provider receipt, DeepSeek/Resend local plus Preview/Production binding metadata, redaction and side-effect boundary | APPROVE; fixed 1,687-byte mode-0600 receipt and prior hash chain verified; distinct environment slots, not retained remote object IDs; no values, provider calls, or deployment; overall containment false |
| Durable provider follow-up readback integrity review | fixed 4,501-byte read-only receipt, two-parent hash chain, six direct pending rows plus three carried completed providers, global side-effect and closure boundary | APPROVE at receipt level; fixed JSON directly contains six rows, not nine; three completed providers come from closure/prior receipts; no writes/deletes/billable actions are receipt-attested globally, containment/deletion remain false, and no live provider call was independently rerun |
| Durable secret-store readiness integrity review | fixed 5,591-byte readiness receipt, source DAG, consumer paths, environment-slot gaps, action-time/deployment boundary, and source comparison | APPROVE with explicit limitation: receipt uses `recordedAt`/`sourceReceipts`, has no independent schema registry, and its three-item Qwen consumer list is non-exhaustive; independent source review found `scripts/probe-tutor-providers.mjs` as a fourth minimum-known Qwen consumer whose default path performs a provider POST; readiness remains non-containment evidence |
| Durable provider blocker integrity and live Git review | fixed 3,979-byte blocker receipt, recursive source chain, console/write fields, root/remote/PR baseline, CI scope, and fail-closed gates | APPROVE as a timestamped blocker baseline; independent `2026-08-27T12:37:26Z` Git/GitHub readback matched root, three heads, Draft PR #21, and old-head green checks; fixed provider rows record writes as false but contain no delete-performed field, and old checks do not cover current A01 edits |
| Durable provider pre-action readiness integrity review | fixed 4,393-byte independent receipt, file integrity, provider UI states, final-submit and side-effect fields, private transport boundary, and fail-closed gates | APPROVE as pre-action evidence only: Qwen/OpenRouter/Clerk authenticated dialogs are open but unsubmitted, Mathpix still needs login, and LRS has not opened its create action; all final submits/writes/deletes/billable calls/deployment are false; the non-sensitive FIFO probe used no credential material and proves no real credential transfer or secret-store update; the fixed receipt has no parent/source hash link; containment/deletion activation stay false and feature freeze stays true |
| Durable DeepSeek owner-attestation integrity review | fixed 848-byte receipt, owner/date/classification/effect/redaction boundary and task provenance | Integrity and bounded effect APPROVE: both named concentrations are owner-classified expected and only that reconciliation blocker clears; NOT FULLY CONFORMANT for self-contained provenance because the fixed JSON lacks a task/thread reference, so this governance ledger separately binds the current task reference to the immutable path/hash |
| Durable pre-delete live-ref receipt integrity review | fixed file integrity, counts, complete-tree flag, exact finding confinement, and deletion boundary | APPROVE at receipt level; 1,593-byte mode-0600 file/hash and internal predicates verified, with no credential body read and `deletionPerformed=false`; reviewer did not independently rerun the full remote tree enumeration |
| EvidenceFlow compatibility-spike integrity review | external file integrity, exact runtime/package declarations, in-memory checks, sensitive-data boundary, and negative claim boundary | APPROVE as isolated compatibility evidence only; not implementation, Postgres runtime, cross-process recovery, deployment, production readiness, or authorization to thaw feature work |
| EvidenceFlow PostgreSQL recovery-spike integrity review | external file/hash-chain integrity, fixed PostgresSaver/checkpoint/kill/resume/replay/dedup fields, sensitive-data boundary, and negative claim boundary | APPROVE as fixed-receipt evidence only; independently confirmed 2,307-byte mode-0600 regular file and prior-receipt hash chain, but did not rerun PostgreSQL or the worker; fixed JSON records only the post-replay row count, does not record cleanup/no-real-DB facts, and retains a source SHA-256 that could not be recomputed without the absent source script/log |
| Current partial-receipt governance spec review | provider/live-ref receipts, pending-provider states, owner scope corrections, ledger/registry/incident prose consistency, fail-closed deletion sequence, runtime/deployment and sensitive-data boundaries | APPROVE after remediating one P1 incomplete pending-provider transcription and one P2 runtime-boundary summary mismatch; final P0=0, P1=0, P2=0; reviewer made no writes |
| Final additive provider/governance delta review | follow-up/readiness/blocker/owner-attestation artifacts, Qwen consumer correction, fixed-vs-handoff field attribution, six-row closure consistency, registry timestamps, and seven-path scope | APPROVE after closing two P1 attribution/wording findings and the earlier P2 timestamp finding; final P0=0, P1=0, P2=0; remaining six providers stay open, containment/deletion activation remain false, feature freeze remains true, and reviewer made no writes |

The final security approval is limited to the implemented controls and the
explicit trusted-owner threat model. Local hooks can still be bypassed with
`--no-verify`, but exact quarantine ruleset `21635990` now provides the remote
creation/deletion/non-fast-forward boundary and limits bypass to the
receipt-bound owner. GitHub Actions remain post-acceptance evidence, and GitHub
does not provide an atomic receipt-consumption primitive; exact ref absence,
the creation restriction, prompt consumed-receipt closeout, provider controls,
and owner discipline remain necessary layers.

## Open owner gates

Machine implementation does not close the P0 incident. The remaining actions
require distinct owner authorization and evidence:

1. confirm the corrected nine-provider accounts/environments without disclosing
   values, complete containment, and capture timestamped redacted provider
   readback;
2. merge Draft PR #21 through protected `main` after its required checks;
3. add the protected-main follow-up that binds provider evidence and activates
   the existing one-shot deletion receipt;
4. delete only the contaminated docs ref with the exact old-SHA lease and abort
   on drift;
5. perform the live absence readback, then add the protected-main
   consumed/deletion-event custody receipt;
6. restore the root checkout to live `main` by ordinary checkout plus
   fast-forward only;
7. decide preservation/archive/cleanup disposition for the four broken
   worktree directories and remaining frozen branches;
8. separately authorize any production promotion.

Until those gates close, the correct top-level state is:

```text
governance implementation: reviewable and machine-verified
credential incident: blocked-owner
root checkout: quarantined
research-pilot software/reviewer package: CONDITIONAL / NOT FULLY APPROVED; mobile P1 open
governed real-data pilot: not yet proven
production promotion: not authorized / not proven
```
