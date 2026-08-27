# SENA exact-main research-pilot release receipt — 2026-08-27

Status: **local exact-SHA gate passed; software/reviewer-package handoff eligible
within the stated evidence boundary**

Governed real-data pilot execution/completion: **not yet eligible or proven**

Production promotion: **not authorized and not proven**

Empirical claim status: **exploratory-only remains in force**

## Exact source and execution environment

All commands in this receipt ran from the clean, independent release worktree:

```text
/Volumes/Starship/SENA/.worktrees/sena-a11-main-receipt-20260827/sena-hk-template
```

Source identity:

| Field | Exact value |
|---|---|
| Git commit | `5cdea568a053347dbc82069bde3e836cffb55cc6` |
| Git tree | `4a0f018023803cb5eef8d67b05658d8656ca1f58` |
| Branch | `codex/sena-a11-main-receipt-20260827` |
| Verified live-main relation | branch HEAD, cached `origin/main`, and live GitHub `main` were the same commit before the run |
| Node | `v24.15.0` |
| npm | `11.12.1` |
| OS | macOS `26.5.2` (`25F84`) |
| Date/time zone | 2026-08-27, Asia/Hong_Kong (UTC+08:00) |

The release branch contains no receipt commit and no application change. The
receipt itself is maintained on the separate A01 governance branch.

## Ordered gate ledger

The gates ran in the order below. Where a runner printed an exact start
timestamp, it is recorded. The original runner did not persist per-command
timestamps for four short commands, so those cells explicitly say that the
timestamp was not captured rather than manufacturing one. A future verifier
should emit a machine-readable start/end/exit ledger automatically.

| Order | Command | Observed time (HKT) | Exit | Result and exact count |
|---:|---|---|---:|---|
| 1 | `npm run sena:fixture:verify` | exact timestamp not captured; completed before 12:21:42 | 0 | pass; one fixture contract; fixture commit `14bb3067adc7df6c985785d57d62a54761839555`; content SHA-256 `e43c07b81f7d6bd409d9d1c4fcc1ce26dfd6d3cb84be4b5c5ff61c87fddae6c9`; 2,450,487 bytes |
| 2 | `npx vitest run lib/sena/__tests__/*reliability*.test.ts lib/sena/__tests__/auth-abuse-hardening.test.ts lib/sena/__tests__/validation-source-replay-budget-round25.test.ts` | start 12:21:42; duration 44.61 s | 0 | 27/27 files passed; 447/447 tests passed |
| 3 | `npm test` | broad start 12:25:21; serial start 12:28:25 | 0 | broad phase: 207 passed, 1 skipped files; 2,922 passed, 2 skipped tests; 183.79 s. Serial phase: 5/5 files and 63/63 tests passed; 454.04 s |
| 4 | `npx tsc --noEmit` | exact timestamp not captured; order preserved | 0 | pass; no TypeScript error |
| 5 | `npm run lint` | exact timestamp not captured; order preserved | 0 | pass; no lint error |
| 6 | `npm run build` | exact timestamp not captured; order preserved | 0 | pass; Next.js 16.2.12 compiled, type-checked, and generated 75/75 pages |
| 7 | `npm run sena:pilot:verify` | broad start 12:37:19; serial start 12:41:15 | 0 | complete handoff gate passed. Pilot smoke 1/1; broad suite 207 passed/1 skipped files and 2,922 passed/2 skipped tests; serial suite 5/5 files and 63/63 tests; build 75/75 pages; browser, API, auth, RBAC, reliability, validation, load-smoke, and non-strict performance stages passed |
| 8 | `env SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED=1 npm run sena:performance:check -- --output output/production-evidence/performance-budget.json` | artifact generated 12:56:29.966 | 0 | strict bindable performance gate passed 5/5 checks; this was the final executable gate |

The full suite is intentionally reported as its two real phases. The skipped
files/tests are not represented as passes.

## Browser and interaction evidence

The temporary production server used by `sena:pilot:verify` listened on local
port `3101` and was stopped by the gate. The browser stages exercised:

- `/workspace/sena` at responsive viewports `375x900`, `768x900`, `1024x900`,
  and `1440x1100`, including the 1024-to-1440 breakpoint transition;
- built-in lesson-study loading, JSON-contract upload, five-CSV upload, sample
  and template downloads, Fusion layouts, alpha/beta/gamma controls, layer and
  normalization controls, Temporal Fusion modes, ENA/SNA evidence panels,
  artifact downloads, project-snapshot restore, and review-packet restore;
- `/workspace/ena` at `1440x1100`, including sample/data view, jENA worker run,
  plot zoom, comparison/grouping, statistics, tools, and exports;
- `/register` and `/login`, SSO provider preflight plus local ORCID/Google
  fallback sessions, enterprise API workflow, RBAC collaboration, approved
  multi-coder reliability workflow, and validation-claim round trip.

The jENA browser gate explicitly collected uncaught `pageerror` events and
failed after each major phase if any occurred; none occurred. The overall smoke
scripts do **not** impose a uniform blanket console-error gate. In particular,
the jENA script documents expected report-only CSP output and a local
`/_vercel/insights` 404. Therefore this receipt proves the assertions encoded
by the named browser gates, not a complete clean-console/clean-network matrix.
That broader matrix remains an item in the developmental-gap register.

The load stage was a bounded local smoke only: 2 users for 1 second, 4 requests,
0 errors, p95 21 ms. It is not a 50-user test and is not production capacity
evidence.

## Strict performance custody

Strict artifact identity:

| Field | Value |
|---|---|
| In-worktree ignored artifact | `output/production-evidence/performance-budget.json` |
| External owner-controlled receipt copy | `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/release-receipts/strict-performance-main-5cdea568-20260827.json` |
| Bytes | `10178` |
| SHA-256, both copies | `1a3fd51785a75fbc1b6da00a048259469a8d52df411ef20fa413aa710164af70` |
| External-copy mode | `0600` |
| Strict bindable execution mode | command set `SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED=1`; artifact policy records `strictProductionEvidenceRequired=true` |
| Bound Git commit | `5cdea568a053347dbc82069bde3e836cffb55cc6` |
| Bound Git dirty state | `false` |
| Total JavaScript | 833,069 bytes |
| Budget | 848,000 bytes |
| Remaining headroom | 14,931 bytes; required minimum 12,000 bytes |
| Measured/source files | 112 / 710 |

The external copy is a custody receipt, not a production deployment artifact.
No performance value has been promoted into a claim about institution-scale
traffic.

## Clean-state proof

After the strict performance command, read-only checks established:

```text
git status --short = <empty>
HEAD = 5cdea568a053347dbc82069bde3e836cffb55cc6
HEAD^{tree} = 4a0f018023803cb5eef8d67b05658d8656ca1f58
```

Thus the tracked and untracked Git status was clean after the final gate. No
later build, test, or mutation command was run in the release worktree.

## Review and evidence disposition

| Review field | Receipt |
|---|---|
| Verification owner | SENA-A11 release-verification lane, executed by Codex |
| Reviewed SHA/tree | `5cdea568a053347dbc82069bde3e836cffb55cc6` / `4a0f018023803cb5eef8d67b05658d8656ca1f58` |
| Local gate finding | all ordered gates above passed |
| Statistical/research finding | fixture and synthetic/approved test evidence is strong; a real governed pilot dataset, real coder adjudication/human review on the same revision, and an independent oracle remain open |
| Security finding | exact-main verification does not close the separate credential incident on the quarantined docs branch |
| Disposition | eligible for software/reviewer-package handoff as code-and-fixture evidence; governed real-data pilot completion and empirical claims remain blocked/exploratory-only |

Historical GitHub evidence is separate:

- PR #20 head CI run `33007461716` passed its type-check/build gate;
- post-merge `main` CI run `33007704490` passed the same gate;
- PR #20 merged as `5cdea568a053347dbc82069bde3e836cffb55cc6`,
  whose tree matches the verified PR head tree.

Those GitHub jobs did not run the complete local suite, the entire pilot
verification chain, or production acceptance. Fresh CI for the governance
tooling belongs to its own draft PR and does not retroactively enlarge PR #20's
evidence.

## Deployment and live boundary

No deployment or alias change was performed. The existing `www.sena.hk` 200
response and `x-sena-runtime=enterprise-neon` observation refer to an older
production deployment created on 2026-08-01. They do not prove that commit
`5cdea568` is deployed, configured, or accepted live.

Final release statement:

```text
software/reviewer-package handoff: eligible under this exact-SHA local receipt
governed real-data pilot execution/completion: not yet eligible / not proven
production promotion: not authorized / not yet proven
deployment evidence: none for 5cdea568
live-behavior evidence: none for 5cdea568
```
