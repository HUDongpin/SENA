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
  ordinary rescue bundle, or committed by this task.
- Repository secret scanning was observed disabled at the incident baseline.

Read-only live refresh at `2026-08-27T05:03:15Z`:

- live `main` remained
  `5cdea568a053347dbc82069bde3e836cffb55cc6`;
- the contaminated docs head remained live at exact SHA
  `18d542f707e56aa9d043dd497e0efe48b540db20`;
- the only other live refs were two reviewed archive tags; the governance audit
  found neither prohibited path/blob in `main` or either archive tag;
- open pull requests: `0` before the governance Draft PR;
- repository visibility: private; forks: `0`;
- `main-minimum-safety` ruleset: active;
- GitHub Actions repository secrets: `0` (names/values not requested);
- GitHub API exposed no enabled secret-scanning or push-protection status for
  this repository. Local pre-commit/pre-push and CI scanning therefore remain
  necessary, but they do not replace provider-side invalidation.

The live governance audit completed with zero machine-control errors and status
`blocked-owner`: the contaminated remote head, provider inventory/rotation, and
quarantined root checkout are the remaining owner gates.

Private visibility reduces public exposure but does not make a pushed secret
safe. Provider-side revocation/rotation is required before Git ref or history
cleanup. Deleting a file or branch cannot replace credential invalidation.

## Immediate freeze

Until closure:

- no commit, push, PR, merge, rebase, deployment, or ordinary development from
  the contaminated branch;
- no `git gc`, prune, branch/worktree deletion, or history rewrite;
- no copy of either document into a session artifact, ordinary backup, rescue
  bundle, screenshot, issue, PR, or chat;
- the root checkout remains a quarantined read-only control object.

## Owner-only credential inventory

An authorized human/security operator completes the table in a secure system.
Do not paste values into this file or Git.

| Provider | Account/tenant | Environment | Credential variable/name | Replacement installed | Old credential revoked | Provider readback | Usage-log review | Operator | Verified at | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| owner to complete | owner to complete | owner to complete | name only, no value | pending | pending | pending | pending | pending | pending | blocked-owner |

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

Remote ref removal is not currently authorized. When the owner separately
authorizes it, the change must use an exact old-SHA lease and must abort on
drift. Before execution, record:

- fresh live branch SHA;
- completed provider rotation/revocation readback;
- completed sanitized salvage disposition;
- heads/tags/hidden refs/PR refs/forks/clones/cache audit;
- named operator and authorization timestamp.

After removal, query live heads again and verify the forbidden paths/blob are
absent from every live candidate ref. `main` is not rewritten by default because
it does not contain the blob. History rewrite with `git-filter-repo` and GitHub
Support cached-object removal are separate, higher-impact actions used only if
reachability, compliance, or non-revocable-secret evidence requires them.

References:

- [GitHub: Remediating a leaked secret](https://docs.github.com/en/code-security/tutorials/remediate-leaked-secrets/remediating-a-leaked-secret)
- [GitHub: Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## Closure gate

This incident can move from `blocked-owner` to `closed` only when all are true:

- every real credential is revoked/rotated with provider-side redacted readback;
- provider/repository/automation usage review is complete;
- formal secret stores and required deployment environments are updated;
- every live remote head/tag/candidate ref is free of both paths and the blob;
- sanitized salvage has an explicit per-slice disposition;
- local document copies have an owner-authorized safe disposition;
- exact hashes, timestamps, operator names, and authorization receipts are
  preserved without credential values.
