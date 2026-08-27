# SENA credential incident action packet — 2026-08-27

Status: **P0 / blocked-owner**

Coordinator: SENA-A01

Security and provider owner: SENA-A10 plus repository owner

Values inspected or recorded by this governance task: **no**

## Confirmed evidence

- Private GitHub repository: `HUDongpin/SENA`.
- Live remote branch: `docs/ledger-reconciliation-2026-08-19`.
- Exact branch SHA: `18d542f707e56aa9d043dd497e0efe48b540db20`.
- Two tracked paths:
  - `All API Keys.docx`
  - `sena-hk-template/All API Keys.docx`
- Both paths use Git blob `15a131415d0206782265902b0af612a80e16bae2`.
- The two paths and blob are absent from live `main=5cdea568a053347dbc82069bde3e836cffb55cc6`.
- No credential value was opened, extracted, displayed, logged, copied to the
  ordinary rescue bundle, or committed by this task. The EvidenceFlow handoff
  used below contains names, state enums, and controlled equality booleans only.
- Repository secret scanning was observed disabled at the incident baseline.

Read-only live-ref metadata audit at `2026-08-27T12:07:09.098Z`:

- live `main` remained
  `5cdea568a053347dbc82069bde3e836cffb55cc6`;
- the contaminated docs head remained live at exact SHA
  `18d542f707e56aa9d043dd497e0efe48b540db20`;
- candidate coverage was 3 heads, 2 tags, and 22 GitHub pull-candidate refs,
  for 27 candidate refs backed by 24 distinct objects;
- recursive tree metadata collection completed for every candidate object;
- exactly 4 findings were recorded, all on
  `refs/heads/docs/ledger-reconciliation-2026-08-19@18d542f707e56aa9d043dd497e0efe48b540db20`:
  the two known forbidden paths each produced the expected path/blob finding;
- every other head, tag, PR-head candidate, and PR-merge candidate was free of
  both known paths and the known blob;
- no file body was fetched, opened, or printed by this audit;
- no deletion was performed;
- current open pull requests at this update's pre-edit heartbeat: `1` (Draft PR #21, exact head `65cdf83ce55157207d377f8bbbbcf4c168c3b25a`);
- repository visibility: private; forks: `0`;
- `main-minimum-safety` ruleset: active;
- GitHub Actions repository secrets: `0` (names/values not requested);
- GitHub API exposed no enabled secret-scanning or push-protection status for
  this repository. Local pre-commit/pre-push and CI scanning therefore remain
  necessary, but they do not replace provider-side invalidation.

The pre-delete audit is held in a regular, non-symlink, mode-`0600`, 1,593-byte
external receipt at
`/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/ref-reachability/live-ref-reachability-predelete-20260827T120709Z.json`,
with SHA-256
`0f50fdebd37520288c3a409e635c6cb92bfb75c74fa4e93b8fafe04517922845`.

The live governance audit remains `blocked-owner`: the contaminated remote head,
provider containment/readback, and quarantined root checkout are still open.
The finding count is not a provider-containment receipt and does not authorize
the already owner-approved remote deletion receipt to become active.

Private visibility reduces public exposure but does not make a pushed secret
safe. Provider-side revocation/rotation is required before Git ref or history
cleanup. Deleting a file or branch cannot replace credential invalidation.

## EvidenceFlow correction and no-value scope

The current provider inventory is exactly: DeepSeek, Qwen/Ali, SimpleTex,
Mathpix, Resend, OpenRouter, Clerk, BUG LRS, and LRS. Earlier governance prose
that classified a live-secret-shaped candidate as Stripe and then called it
invalid was unsupported: the candidate occurred in the Clerk secret-key
context, and Clerk secrets may legitimately use the observed `sk_live_` naming
shape. A Stripe `401` response cannot establish that a Clerk credential is
invalid. The earlier Resend invalid/replaced claim was also unsupported at that
time. A later EvidenceFlow handoff now reports replacement plus dashboard
deletion, but the old `403` remains semantically indeterminate because a
sending-only key cannot call the management API; the dashboard deletion is the
reported revocation evidence.

The machine-readable source of truth is
`provider-containment-ledger-20260827.json`. It records no credential value and
no credential-value hash. This governance task performed no provider write.
EvidenceFlow separately reports provider-side/local/Vercel configuration writes
for DeepSeek, Qwen/Ali, SimpleTex, Resend, OpenRouter, BUG LRS, and LRS. No SENA
or MAIS production deployment or redeployment, remote-ref deletion, or history
rewrite was reported.

| Provider | Credential name class | Current redacted configuration state | Provider/readback state | Remaining closure evidence |
|---|---|---|---|---|
| DeepSeek | API key | replacement in local MAIS plus separate sensitive Vercel Preview and Production bindings; post-receipt Preview creation returned `201`, inventory reports `branchScoped=false`; current MAIS credential DOCX not reverified after replacement | partial durable receipt marks provider row complete: replacement active through official read-only balance endpoint; old key deleted and returns `401`; owner later classifies both named usage concentrations as expected | later complete durable receipt must include the additive Preview correction; no deployed-runtime consumption claim because deployment was not authorized |
| Qwen/Ali | API key | replacement installed in local MAIS plus sensitive Vercel Preview and Production bindings; readiness receipt records three direct consumers, while independent source review adds `scripts/probe-tutor-providers.mjs` as a fourth minimum-known consumer; the leaked MAIS credential DOCX was not rewritten by this operation | closeout receipt marks this provider row complete: replacement official read-only status remained `200`; legacy changed from `200` to `401` after console deletion | provider containment row closed; the default usage view showed no visible data but has an approximately one-hour reporting-delay boundary, so no historical-zero-use or anomaly claim is made; runtime-consumer execution and deployment remain unproved |
| SimpleTex | API credential | replacement in local MAIS and Vercel Preview/Production environment configuration; combined Preview+Production binding preserved | partial durable receipt marks provider row complete: old app deleted; only the named replacement remains; console-only review and no OCR call | no deployed-runtime consumption claim because deployment was not authorized |
| Mathpix | application identifier and API key | local app identifier/key pair exists; Vercel key exists in Preview/Production but the app identifier is absent in both; consumer is `app/api/handwriting-recognition/route.ts`; prior equality to leaked value in current MAIS credential DOCX | read-only receipt confirms exposed/current OCR-usage `200`, active, with zero usage signal; the `2026-08-27T13:12:06Z` pre-action receipt still records login required and create dialog not reached | console login, action-time confirmation, replacement/revocation, usage review, local pair update, add app identifier and replace key in both Vercel targets, and complete provider receipt |
| Resend | API key | replacement sending-only key in local MAIS plus separate sensitive Vercel Preview and Production bindings; post-receipt Preview creation returned `201`, inventory reports `branchScoped=false` | partial durable receipt marks provider row complete: old key deleted in dashboard; only replacement row remains; Logs showed no visible retained entries | later complete durable receipt must include the additive Preview correction; no deployed-runtime send claim because deployment was not authorized; dashboard log visibility remains a bounded review, not proof of no historical use |
| OpenRouter | API key | owner-requested dormant replacement now exists in local MAIS plus sensitive Vercel Preview and Production bindings; no current code consumer and no deployment authorized | closeout receipt marks this provider row complete: replacement status `200`, effective limit `0`, replacement usage `0`; the uniquely matched legacy console row was deleted | historical legacy usage was nonzero, but no owner-frozen anomaly threshold existed, so no anomaly classification is made; no legacy endpoint-negative probe or deployed-runtime proof is claimed |
| Clerk | secret key | current local/Vercel binding and code consumers remain absent; owner still requires a dormant replacement in MAIS `.env.local` plus Vercel Preview/Production before revocation | prior `403` remains indeterminate with no revocation/Stripe inference; the latest operational handoff reports a verification-code challenge, and no closeout receipt is bound | complete the challenge, create the dormant replacement, obtain redacted three-target secret-store readback, review usage, revoke legacy material, and issue a closeout receipt; no deployment authorized |
| BUG LRS | username/password pair | shared replacement is present in local MAIS and sensitive Vercel Preview/Production bindings; shares consumers `lib/server/lrsClient.ts` and `scripts/bug-triage.js`; the leaked MAIS credential DOCX was not rewritten by this operation | one shared LRS.io receipt closes both BUG LRS/LRS provider rows; the old shared Access Key was precisely deleted in console and absent after stable refresh | all legacy/replacement `/about` probes stopped at cross-origin `302` before an auth result and did not forward credentials, so runtime authentication remains unproved; key-level usage was unavailable within the safe authorized surface |
| LRS | username/password pair | same shared replacement and complete local/Preview/Production binding set as BUG LRS | same one-to-two closeout receipt mapping and console deletion evidence | same cross-origin `302` non-auth-proof and bounded usage-review limitation; no xAPI statement, deployment, or production behavior was exercised |

The base partial receipt recorded `replacementRequired=false` for OpenRouter and
Clerk because no current runtime binding was found. A later explicit owner scope
correction supersedes that planning state: both providers now require dormant
replacement credentials and the three redacted target bindings before legacy
revocation. It does not change the evidence that there is no current code
consumer, and it does not authorize deployment.

DeepSeek's console export for `2026-08-01..2026-08-27` showed one legacy-key
identity/name row, 12 positive-use days, no replacement usage, and concentration
signals at or above ten times the median on `2026-08-10` for requests and
`2026-08-24` for cost. At `2026-08-27T12:34:26Z`, the owner classified both
named concentrations as expected activity in the current task. That owner
attestation closes only the DeepSeek workload-reconciliation blocker; it does
not change the other six provider rows, deletion activation, feature freeze, or
prove that every other account event was authorized. The exact durable receipt
is the regular mode-`0600`, 848-byte file
`/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/deepseek-usage-owner-attestation-20260827T123503Z.json`,
recorded at `2026-08-27T12:35:03Z`, with SHA-256
`b4a7aeaab9f4b364bb235e61c9735b15f02e0628eb5111a0f5c580dd33544af1`.
It records no credential value, account identifier, amount, or endpoint value.
The fixed receipt does not contain a task/thread reference field; this
governance ledger binds the current delegated owner instruction's task reference
to that immutable hash without claiming the field existed in the receipt.

A durable partial receipt is bound by metadata only:

```text
path   = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-containment-readback-20260827T114654Z.json
sha256 = b46f9c559ac19146f0fc97169615143cac98a1ee39fcbf08175f78331d9e77ca
bytes  = 7764
mode   = 0600
observedAt = 2026-08-27T11:46:54Z
```

Independent local checks confirmed a regular non-symlink file, matching hash,
size and mode, valid JSON, `redacted=true`, nine provider rows, no high-risk
credential pattern match, `providerContainmentComplete=false`, and
`remoteDeletionReceiptActivationAllowed=false`. The operator identity remains
inside the mode-`0600` artifact and is not duplicated here. The receipt marks
DeepSeek, Resend, and SimpleTex complete and leaves six provider rows open.
Because deletion activation requires completion of all provider rows, the
one-shot deletion receipt remains `pending-provider-readback` and P0 remains
fail-closed.

After that fixed receipt, a durable additive no-value secret-store correction
records that DeepSeek and Resend each gained a separate sensitive Vercel Preview
binding in addition to the existing Production binding. Each Preview-creation
call returned `201`; follow-up inventory reported distinct Preview/Production
bindings with `branchScoped=false`; each local assignment count is one in a
mode-`0600` file. No value was emitted, no provider call was made, and no
deployment/redeployment occurred. The regular, non-symlink, mode-`0600`,
1,687-byte correction receipt is
`/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-secret-store-binding-correction-20260827T120757Z.json`,
observed at `2026-08-27T12:07:57Z`, with SHA-256
`2acd8fb2cca3c87057f235aade9779265bddd9d126b9a43124406a2446f7aa5e`.
It extends rather than mutates the first receipt, marks only these two
secret-store scopes complete, and keeps all-provider containment and remote
deletion activation false. The receipt proves distinct Preview and Production
environment slots but does not retain remote binding object IDs.

A later immutable read-only follow-up binds both earlier hashes and refreshes
the six still-open provider rows without performing credential writes/deletes,
billable calls, model generation, OCR, email, or xAPI statements:

```text
path   = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-containment-readback-20260827T122317Z.json
sha256 = c00fa574dba8925a9e761674e9046e6ca5f12765d74e445a1d8d023b83aa5b3a
bytes  = 4501
mode   = 0600
observedAt = 2026-08-27T12:23:17Z
```

It confirms continuity of the active/pending states summarized above, reports
no credential material, value hashes, response bodies, endpoint URLs, account
identifiers, or balances, and leaves exactly the same three completed and six
remaining providers. It is not a containment receipt: overall containment,
remote deletion activation, and feature thaw remain false, false, and false.

A separate readiness receipt binds the consumer and environment-slot inventory
used to plan safe replacement order:

```text
path   = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-secret-store-readiness-20260827T122652Z.json
sha256 = 84551782024448336e3e4fdda46e13512491bcc8f8ccf37ead62f22b23e6c3db
bytes  = 5591
mode   = 0600
recordedAt = 2026-08-27T12:26:52Z
```

It records a non-exhaustive Qwen, Mathpix, and LRS consumer/binding inventory
and confirms the owner-requested dormant OpenRouter/Clerk target. Independent
source review verified its three Qwen paths and found the additional Qwen probe
consumer noted in the table; the fixed receipt itself remains immutable and
does not contain that fourth path. It authorizes neither credential
creation/deletion nor a production deployment; both credential actions still
require action-time confirmation. It is a readiness inventory, not proof of
replacement, rotation, revocation, runtime consumption, containment closure,
or deletion activation. It uses `recordedAt` and `sourceReceipts`, not
`observedAt` and `extends`, and no independent schema registry was found.

The current owner-blocker boundary is separately frozen at
`2026-08-27T12:31:24Z` in a regular mode-`0600`, 3,979-byte receipt:

```text
path   = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-containment-blocker-20260827T123124Z.json
sha256 = c6b003d5b45adfe69551ab495f314867761b5e26cc1551bcb24001e31a81a824
```

It records LRS key-management login readiness, required logins for
OpenRouter/Clerk/Mathpix, unverified Qwen authentication state, and
`writePerformed=false` on every fixed provider row. The accompanying handoff
reports zero deletes, but the fixed blocker JSON has no per-provider or
aggregate `deletePerformed` field; that distinction is retained here. Its Git
snapshot keeps the clean quarantined root at
`18d542f`, live `main` at `5cdea568`, the contaminated head unchanged, and PR
#21 Draft/Open at old head `e6a4533`; the old-head green checks explicitly do
not cover the then-uncommitted A01 changes. This is a timestamped blocker
baseline, not permission to mark PR #21 ready, merge, activate deletion, move
the root checkout, create an EvidenceFlow feature worktree, or thaw feature
development. The receipt's DeepSeek owner-classification action was subsequently
satisfied by the `2026-08-27T12:34:26Z` attestation above. Its console snapshot
is historical: a later pre-action receipt supersedes Qwen/OpenRouter/Clerk to
authenticated and leaves Mathpix as the only pending browser login, while LRS
remains authenticated without opening the create action. No provider action is
thereby complete.

The independent additive pre-action readiness receipt is:

```text
path   = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-rotation-preaction-readiness-20260827T131206Z.json
sha256 = 96b9bc5beb8557b421164c1bbc5898a71d2fa3d664ca5c1685054896772846e7
bytes  = 4393
mode   = 0600
schemaVersion = provider-rotation-preaction-readiness/v1
recordedAt = 2026-08-27T13:12:06Z
```

Independent local checks confirmed a regular non-symlink file, matching hash,
size and mode, valid JSON, `redacted=true`, and no high-risk credential-pattern
or sensitive semantic-key finding. The five fixed provider objects map to six
governance rows because the one `lrs` action covers the shared BUG LRS/LRS
binding. Qwen, OpenRouter, and Clerk are authenticated with create dialogs open
but unsubmitted; Mathpix remains login-required; LRS is authenticated with the
create dialog not opened. Every provider row has `finalSubmitPerformed=false`,
and the receipt records no external write, delete, billable call, or deployment.
It has no source/parent receipt-hash field, so this ledger binds it as an
independent additive artifact rather than claiming an internal hash chain.

The receipt also records that a non-sensitive browser-memory-to-mode-`0600`
FIFO-to-secret-store-process transport-mechanism probe passed. The probe did
not use credential material, place it in arguments/terminal/persistent temporary
files, or emit the probe value. It therefore proves no real credential transfer,
replacement creation, secret-store update, runtime binding, deployment,
rotation, or revocation. Action-time confirmation and the actual provider,
secret-store, usage-review, and legacy-revocation evidence remain pending.
Overall containment is false, remote deletion activation is false, feature
freeze is true, and this artifact does not make PR #21 ready or authorize a
merge or ref deletion.

## Provider closeout receipts bound after pre-action readiness

Three later immutable closeout receipts close four provider rows. Independent
local verification confirmed each file is regular, non-symlink, link count one,
mode `0600`, exact-size and exact-hash matched, valid JSON with schema
`sena-provider-rotation-closeout/v1`, `redacted=true`, and zero high-risk
credential-pattern findings:

```text
Qwen/Ali
path       = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/qwen-rotation-closeout-20260827T133859Z.json
sha256     = 7bd7879524647c73a4f14b56f0bbf3c90bbc7aee6fc1cc8658c665e2d897e2ff
bytes      = 1863
mode       = 0600
recordedAt = 2026-08-27T13:38:59Z

OpenRouter
path       = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/openrouter-rotation-closeout-20260827T134430Z.json
sha256     = ae0c909bb42bce5378f2649895ad40ea7f19c13ef0628a08e0f4eea2562cd0d3
bytes      = 1978
mode       = 0600
recordedAt = 2026-08-27T13:44:30Z

BUG LRS + LRS shared event
path       = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/lrs-rotation-closeout-20260827T135705Z.json
sha256     = c60963b8a85c6caa717ec14db0c669c50bad7540cf78759d4e7629e10f147266
bytes      = 2834
mode       = 0600
recordedAt = 2026-08-27T13:57:05Z
```

The Qwen closeout proves replacement creation, redacted local plus
Preview/Production updates, replacement read-only `200`, and legacy `200` to
`401` after console deletion. Its usage page showed no visible records in the
default view, but the recorded approximately one-hour reporting delay prevents
any claim of zero historical, delayed, or other-window usage and prevents an
anomaly conclusion. No billable generation, runtime-consumer execution,
deployment, or live behavior is claimed.

The OpenRouter closeout proves a dormant replacement with status `200`, zero
effective limit and zero replacement usage at readback, redacted local plus
Preview/Production bindings, and precise console deletion of the legacy row.
The legacy row had nonzero historical usage; because no owner-frozen threshold
existed, it is classified as neither anomalous nor expected. A legacy endpoint
negative probe was not run, so console deletion is the revocation evidence and
must not be restated as an API rejection.

The single LRS.io closeout maps to the two shared BUG LRS/LRS governance rows.
It proves replacement creation, six local assignments, six Preview plus six
Production sensitive bindings, and precise console deletion of the old shared
Access Key. Every legacy/replacement `/about` attempt returned a cross-origin
`302` before an authentication result; credentials were not followed across the
redirect. Those probes therefore distinguish neither old nor replacement auth
state and provide no runtime-authentication proof. Key-level usage was not
available in the safe authorized surface, broader real-user xAPI analytics were
not read, and no xAPI statement was sent.

One secondary-exposure event is retained for that shared LRS rotation: a browser
selector-timeout diagnostic echoed the legacy username only. The legacy
password and all replacement credentials were not echoed, and the old shared
Access Key was deleted in the same rotation window. Provider-side deletion
contains the old credential object; it does not erase the prior diagnostic
disclosure or prove the username is absent from every session artifact or log.
No username, value, value fragment, or value hash is recorded here.

The current aggregate is seven of nine rows complete: DeepSeek, Qwen/Ali,
SimpleTex, Resend, OpenRouter, BUG LRS, and LRS. Exactly two rows remain open:
Mathpix (rotation incomplete) and Clerk (verification-code challenge, without a
durable closeout receipt). Consequently, provider containment remains false,
the deletion receipt remains inactive, feature work remains frozen, PR #21
remains Draft, and neither merge nor deployment is authorized.

## File relationship and runtime boundary

- The two forbidden SENA DOCX paths are the same Git blob
  `15a131415d0206782265902b0af612a80e16bae2`.
- That SENA document is not the same file as the current MAIS credential DOCX.
  This is a controlled file-relationship boolean, not a credential-value
  comparison disclosed here.
- The affected runtime observed by the no-value handoff is primarily MAIS-MVP.
- A local pulled SENA production-environment snapshot did not show these
  provider-variable classes. The SENA Vercel remote environment-scope inventory
  was not successfully obtained, so local absence must not be stated as remote
  absence.

## Immediate freeze

Until closure:

- no commit, push, PR, merge, rebase, deployment, or ordinary development from
  the contaminated branch;
- no `git gc`, prune, branch/worktree deletion, or history rewrite;
- no copy of either document into a session artifact, ordinary backup, rescue
  bundle, screenshot, issue, PR, or chat;
- the root checkout remains a quarantined read-only control object.

## Owner-only containment completion

An authorized human/security operator completes the pending proof fields in a
secure system and records only redacted status, operator, timestamp, and evidence
ID in the linked ledger. Do not paste values or value hashes into this file or
Git.

Required sequence per credential:

1. Determine provider, account, environment, and downstream consumers without
   recording the value in Codex or Git.
2. For production, create and install the replacement before revoking the old
   value; for test/expired credentials, still obtain provider-side invalidation
   readback.
3. Update the formal secret store, required deployment environment, and local
   environment under their separate custody controls.
4. Revoke the old value.
5. Review provider usage logs for anomalous calls across the exposure window.
6. Record only provider/name/environment, redacted status, operator, and time.

## Repository and automation exposure review

Record counts and permission classes, not personal tokens or credential values:

- repository owners, admins, maintainers, collaborators, teams, and deploy keys;
- GitHub Actions workflows, secrets/environments, bots, GitHub Apps, and recent
  workflow runs that could read repository content;
- forks, mirrors, clones under institutional control, backups, caches, and
  archival systems;
- Vercel/GitHub integrations and any other repository-connected deployment
  automation;
- access/audit events for the contaminated branch when the account plan exposes
  them.

Current governance evidence must be refreshed immediately before closure; a
snapshot count is not durable truth.

## Sanitized salvage

The contaminated commit spans multiple owner lanes and must not be merged,
rebased, or cherry-picked as a unit. From a freshly verified `origin/main`,
create narrow sanitized candidates and review them independently:

1. ledger/performance reconciliation;
2. Fusion geometry and orbit routing;
3. accessibility and browser smoke;
4. necessary visual evidence only.

For every slice:

- list exact source and target paths;
- prove neither forbidden path nor blob is present;
- exclude obsolete screenshots/generated output;
- run owner-lane tests and visual/browser acceptance where applicable;
- make one reviewable commit and PR with exact-SHA evidence.

## Destructive cleanup authorization gate

An owner authorization receipt already exists for the exact contaminated ref
and old SHA, but its status is `pending-provider-readback`. It is neither
unapproved nor executable. It must remain pending until provider containment
has timestamped redacted readback and the governance controls are protected on
`main`.

The mandatory order is:

1. Complete provider containment for every ledger row and capture timestamped,
   redacted readback for replacement/revocation, usage review, secret-store
   state, and dependent-runtime state as applicable.
2. Merge Draft PR #21 into protected `main` only through its required review and
   CI controls.
3. Commit a protected-main follow-up that activates the one-shot deletion
   receipt and binds it to the completed provider evidence.
4. Delete only `refs/heads/docs/ledger-reconciliation-2026-08-19`, using the
   exact old-SHA lease for
   `18d542f707e56aa9d043dd497e0efe48b540db20`; abort on drift.
5. Perform a fresh live absence readback across heads, tags, and PR candidate
   refs for both forbidden paths and the known blob.
6. Commit a protected-main consumed receipt with deletion-event custody and the
   live absence timestamp.

Never attempt the deletion from pre-governance `main` or activate the receipt
before provider readback. The prior sanitized-salvage disposition remains a
separate prerequisite; the contaminated commit must never be merged, rebased,
or cherry-picked as a unit.

`main` is not rewritten by default because it does not contain the blob. History
rewrite with `git-filter-repo` and GitHub Support cached-object removal are
separate, higher-impact actions used only if reachability, compliance, or
non-revocable-secret evidence requires them.

References:

- [GitHub: Remediating a leaked secret](https://docs.github.com/en/code-security/tutorials/remediate-leaked-secrets/remediating-a-leaked-secret)
- [GitHub: Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## Closure gate

This incident can move from `blocked-owner` to `closed` only when all are true:

- every real credential is revoked/rotated with provider-side redacted readback;
- provider/repository/automation usage review is complete;
- formal secret stores and required deployment environments are updated;
- every live remote head/tag/candidate ref is free of both paths and the blob;
- PR #21 governance controls are on protected `main`, the one-shot deletion
  receipt is consumed, and deletion-event custody is recorded there;
- sanitized salvage has an explicit per-slice disposition;
- local document copies have an owner-authorized safe disposition;
- exact hashes, timestamps, operator names, and authorization receipts are
  preserved without credential values.
