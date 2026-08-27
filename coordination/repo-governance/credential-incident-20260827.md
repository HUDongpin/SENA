# SENA credential incident action packet — 2026-08-27

Status: **P0 / blocked-owner (remote containment complete; root restoration pending)**

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
- current open pull requests at this update's pre-edit heartbeat: `1` (Draft PR #21, exact head `8c4a75157cac2a368ccc9633c554ae9234072320`);
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

The live governance incident remains `blocked-owner`: later evidence now closes
provider containment, but the contaminated remote head, protected-main
activation/consumption sequence, sanitized-salvage disposition, and quarantined
root checkout are still open. The finding count is not a provider-containment
receipt and does not authorize the already owner-approved remote deletion
receipt to become active.

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
for DeepSeek, Qwen/Ali, SimpleTex, Mathpix, Resend, OpenRouter, Clerk, BUG LRS,
and LRS. No SENA or MAIS production deployment or redeployment, remote-ref
deletion, or history rewrite was reported.

| Provider | Credential name class | Current redacted configuration state | Provider/readback state | Evidence boundary / remaining non-provider proof |
|---|---|---|---|---|
| DeepSeek | API key | replacement in local MAIS plus separate sensitive Vercel Preview and Production bindings; post-receipt Preview creation returned `201`, inventory reports `branchScoped=false`; current MAIS credential DOCX not reverified after replacement | partial durable receipt marks provider row complete: replacement active through official read-only balance endpoint; old key deleted and returns `401`; owner later classifies both named usage concentrations as expected | provider row closed; the complete superseding readback includes the additive Preview correction; no deployed-runtime consumption claim because deployment was not authorized |
| Qwen/Ali | API key | replacement installed in local MAIS plus sensitive Vercel Preview and Production bindings; readiness receipt records three direct consumers, while independent source review adds `scripts/probe-tutor-providers.mjs` as a fourth minimum-known consumer; the leaked MAIS credential DOCX was not rewritten by this operation | closeout receipt marks this provider row complete: replacement official read-only status remained `200`; legacy changed from `200` to `401` after console deletion | provider containment row closed; the default usage view showed no visible data but has an approximately one-hour reporting-delay boundary, so no historical-zero-use or anomaly claim is made; runtime-consumer execution and deployment remain unproved |
| SimpleTex | API credential | replacement in local MAIS and Vercel Preview/Production environment configuration; combined Preview+Production binding preserved | partial durable receipt marks provider row complete: old app deleted; only the named replacement remains; console-only review and no OCR call | no deployed-runtime consumption claim because deployment was not authorized |
| Mathpix | application identifier and API key | replacement pair is installed in local MAIS and as sensitive, branch-unscoped Vercel Preview/Production bindings; exact private local readback matched both fields; Vercel sensitive values are write-only, so exact remote value readback is not claimed; consumer is `app/api/handwriting-recognition/route.ts` | closeout receipt marks this row complete: replacement key is enabled; the legacy key was disabled through Mathpix's documented revocation mechanism and remained disabled after stable refresh; replacement remained enabled; Usage showed no data | provider row closed; no OCR, Playground, Results, Requests, deployment, or runtime-consumer execution occurred, and the no-data usage view is not expanded into a historical-never-used claim |
| Resend | API key | replacement sending-only key in local MAIS plus separate sensitive Vercel Preview and Production bindings; post-receipt Preview creation returned `201`, inventory reports `branchScoped=false` | partial durable receipt marks provider row complete: old key deleted in dashboard; only replacement row remains; Logs showed no visible retained entries | provider row closed; the complete superseding readback includes the additive Preview correction; no deployed-runtime send claim because deployment was not authorized; dashboard log visibility remains a bounded review, not proof of no historical use |
| OpenRouter | API key | owner-requested dormant replacement now exists in local MAIS plus sensitive Vercel Preview and Production bindings; no current code consumer and no deployment authorized | closeout receipt marks this provider row complete: replacement status `200`, effective limit `0`, replacement usage `0`; the uniquely matched legacy console row was deleted | historical legacy usage was nonzero, but no owner-frozen anomaly threshold existed, so no anomaly classification is made; no legacy endpoint-negative probe or deployed-runtime proof is claimed |
| Clerk | secret key | owner-requested dormant replacement is installed in MAIS `.env.local` plus sensitive, unscoped Vercel Preview and Production bindings; exact private local readback matched; no current code consumer and no deployment authorized | closeout receipt marks this provider row complete: replacement secret created in the official console; the uniquely matched legacy default secret was deleted and absent after stable refresh; only the replacement secret remains; the publishable key was not modified | provider verification was intentionally limited to the official console because no safe non-user-data endpoint was used; no usage-absence, runtime execution, deployment, or live-behavior claim is made |
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
attestation closed only the DeepSeek workload-reconciliation blocker at that
time; it did not by itself change the other provider rows, deletion activation,
feature freeze, or prove that every other account event was authorized. The
exact durable receipt is the regular mode-`0600`, 848-byte file
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
This receipt is now superseded by the complete readback recorded below. It
remains immutable evidence of the earlier partial state and did not itself
activate the one-shot deletion receipt.

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
rotation, or revocation. At that timestamp, action-time confirmation and the
actual provider, secret-store, usage-review, and legacy-revocation evidence
remained pending.
At the time of this artifact, overall containment was false, remote deletion
activation was false, and feature freeze was true. Later closeouts supersede its
provider-progress state; this historical artifact still does not make PR #21
ready or authorize a merge or ref deletion.

## Provider closeout receipts bound after pre-action readiness

Five later immutable closeout receipts close six provider rows. Independent
local verification confirmed each file is regular, non-symlink, link count one,
mode `0600`, exact-size and exact-hash matched, valid JSON with schema
`sena-provider-rotation-closeout/v1`, `redacted=true`, and zero high-risk
credential-pattern findings; the Clerk and Mathpix receipts also have zero
sensitive semantic-string leaf findings:

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

Clerk
path       = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/clerk-rotation-closeout-20260827T144832Z.json
sha256     = e4a35fab8384c077cffdfd02b6230971ff9c15c45ef68de54ecad4b90b5986d5
bytes      = 2242
mode       = 0600
recordedAt = 2026-08-27T14:48:32Z

Mathpix
path       = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/mathpix-rotation-closeout-20260827T150838Z.json
sha256     = 579f231860591740e48d680a7bd3689679bc800e33f8b992d5c7cd9a16086598
bytes      = 3819
mode       = 0600
recordedAt = 2026-08-27T15:08:38Z
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

The Clerk closeout proves the owner-requested dormant replacement was created in
the official console, transferred through a mode-`0600` FIFO, and installed as
one local assignment plus sensitive, branch-unscoped Preview and Production
bindings. Exact private local readback matched. The uniquely matched legacy
default secret was deleted and absent after stable refresh; only the replacement
secret remains. The publishable key was not modified. No user-data endpoint,
billable operation, deployment, or history rewrite was performed. The bounded
verification class is official-console-only, so no usage-absence or runtime
execution claim is made.

The Mathpix closeout proves creation and enablement of the replacement key,
mode-`0600` private transfer, exact private local pair readback, and sensitive,
branch-unscoped Preview/Production bindings. The provider exposes sensitive
Vercel values as write-only, so only binding state—not exact remote value
readback—is claimed. Mathpix provides no self-service delete control; its
documented disable-key mechanism is the revocation operation. The legacy key
was disabled and remained disabled after stable refresh, while the replacement
remained enabled. Usage displayed no data, but no historical-never-used claim is
made. No OCR, Playground, Results, Requests, deployment, or history rewrite was
performed.

One Mathpix secondary-exposure event is retained: a failed checkbox-state
diagnostic echoed only the legacy application identifier. It did not display
the legacy application key, replacement identifier, or replacement key. The
legacy key was disabled in the same rotation window. No identifier, value,
fragment, object ID, or private URL is reproduced here, and provider-side
disablement does not prove the diagnostic material is absent from every session
artifact or log.

The current provider aggregate is nine of nine rows complete: DeepSeek,
Qwen/Ali, SimpleTex, Mathpix, Resend, OpenRouter, Clerk, BUG LRS, and LRS. No
provider row remains open, and provider containment is true. PR #21 merged as
`9ecc72b...`; activation PR #22 then merged exact head `aaf679d...` through
protected `main` as `b002f976...`, with both post-main checks green. The first
exact-lease deletion attempt passed actor/remote identity, push policy, and the
exact deletion boundary, but the local governance audit then failed closed
before remote mutation because two historical ahead/behind observations and the
PR #22 lifecycle state were stale. Fresh live readback proved the contaminated
ref remained at the exact expected old SHA. PR #23 then merged exact head
`b008cad...` as `606daa6...`, with both post-main checks green. The next
exact-old-SHA deletion succeeded. GitHub ruleset suite `3846639027` binds the
owner actor, exact ref, old SHA, zero after-SHA, and bypass result. A fresh
mode-`0600` recursive Git Trees metadata audit covered all 27 live head/tag/pull
candidates and found neither forbidden path nor the known blob. Feature work
remains frozen while the consumed/event-custody record reaches protected main
and the root checkout remains locally quarantined. No deployment or history
rewrite occurred.

## Complete superseding provider readback

The final no-value provider prerequisite is held in this immutable receipt:

```text
path       = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/provider-containment-readback-20260827T151341Z.json
sha256     = 49fbd755fe773f861ae9158445480f1cdfbb68110933a7d40756f41a7c00d1b2
bytes      = 12089
mode       = 0600
observedAt = 2026-08-27T15:13:41Z
```

Independent checks confirmed a regular, non-symlink, link-count-one file,
matching size/hash/mode, valid redacted JSON using
`sena-provider-containment-readback/v1`, exactly nine complete provider rows,
and zero high-risk credential-pattern or sensitive semantic-string findings.
Its `supersedes` chain binds twelve immutable receipts by exact identifier and
SHA-256. All twelve source receipts were independently rechecked as mode-`0600`
regular, non-symlink, link-count-one valid JSON with matching expected hashes
and no high-risk credential-pattern finding.

The immutable provider receipt establishes only the provider prerequisite:
`providerContainmentComplete=true` and
`providerPrerequisiteForProtectedMainActivationSatisfied=true`. At the same
time it records `remoteDeletionReceiptCurrentlyActive=false`,
`protectedMainMergeRequiredBeforeActivation=true`, `incidentClosed=false`, and
`featureWorkFrozen=true`. Those remain receipt-time facts and were not rewritten.
Its receipt-layer eligibility flag was not the actual registry activation state
and was not used to skip protected-main merge. The later owner authorization and
merge closeout are separately held as mode-`0600` no-value receipts:

```text
authorization path   = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/pr21-owner-authorization-20260827T165546Z.json
authorization sha256 = 8a63c9d790fdd305c84e9ca84f36e7409749f46ad6c3440fd47d6059bfd5c71f
merge closeout path  = /Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/provider-containment/pr21-merge-closeout-20260827T170026Z.json
merge closeout sha256= d1388392a36dfa312773fde65d7c3532cac0ff04545a6ae5c7219d0369c868fe
```

Neither receipt authorizes deployment or history rewrite. The merge closeout
also records that the contaminated ref was still present and no deletion had
been attempted.

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

## Provider-containment evidence boundary

The authorized human/security operations are complete for all nine provider
rows. Only redacted status, operator role, timestamp, and evidence identifiers
are bound here; values and value hashes must never be pasted into this file or
Git. The per-credential sequence below records the procedure that produced the
now-complete evidence and remains the rule for any future rotation.

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
and old SHA. The timestamped redacted provider prerequisite is complete, PR #21
is merged, and this follow-up changes the registry status from
`pending-provider-readback` to `active`. The activation still remains
non-executable while it exists only on this branch: the deletion hook requires
the authorization registry commit to be the freshly fetched protected `main`
commit, the exact old SHA to match, and the live quarantine ruleset to match.

The mandatory order is:

1. **Satisfied:** complete provider containment for every ledger row and capture
   timestamped, redacted readback for replacement/revocation, usage review,
   secret-store state, and dependent-runtime state as applicable.
2. **Satisfied:** merge PR #21 into protected `main` only through its required
   review and CI controls; exact head `24d24c8...` merged as `9ecc72b...`, and
   both post-main checks passed.
3. **Satisfied:** activation PR #22 merged exact head `aaf679d...` through
   protected `main` as `b002f976...`; both exact post-main checks passed.
3a. **Satisfied:** bind historical read-only work-item
   ahead/behind evidence to immutable `b002f976...`, record PR #22 as merged,
   and preserve the first blocked attempt as no-remote-mutation evidence on
   protected `main` through PR #23; exact head `b008cad...` merged as
   `606daa6...` and post-main checks passed.
4. **Satisfied:** delete only `refs/heads/docs/ledger-reconciliation-2026-08-19`, using the
   exact old-SHA lease for
   `18d542f707e56aa9d043dd497e0efe48b540db20`; abort on drift.
5. **Satisfied:** perform a fresh live absence readback across heads, tags, and
   PR candidate refs for both forbidden paths and the known blob; 27 candidates,
   complete recursive tree metadata, zero findings.
6. **Current follow-up:** commit a protected-main consumed receipt with deletion-event custody and the
   live absence timestamp.

The post-delete reachability receipt is the regular mode-`0600`, 1,266-byte
file `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/ref-reachability/live-ref-reachability-postdelete-20260827T180312Z.json`,
SHA-256 `e4137d7394b0bace0c9e39f1c26f4eda61bd83b6abc928c48936676ab8668672`,
observed at `2026-08-27T18:05:51.205Z`. The deletion closeout is the regular
mode-`0600`, 3,515-byte file
`/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/ref-reachability/remote-ref-deletion-closeout-20260827T180709Z.json`,
SHA-256 `d614f86d3a058afbf5aab08466fcac4b41ab08ad148a8bbd3ed966e345fe3873`.
Neither receipt contains credential values or document bodies.

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
