# SENA rescue-ref semantic triage — 2026-08-27

## Identity and limits

- Comparison main: `5cdea568a053347dbc82069bde3e836cffb55cc6`
- Namespace: `refs/rescue/sena-20260827/*`
- Refs reviewed: 26/26 maximal tips
- Known incident path hits across every reachable rescue history: 0
- Known incident blob `15a131415d0206782265902b0af612a80e16bae2`
  reachable hits: 0
- Credential documents/values opened or printed: no

This review used commit metadata, parents, path names, diff stats, patch IDs,
tree comparisons, stash index/untracked parents, and non-sensitive semantic
diffs. It is preservation triage, not authorization to delete refs/bundles,
cherry-pick, merge, prune, or run GC.

Ancestry alone cannot close these refs: none of the 26 tips is an ancestor of
current main. Patch/tree and successor evidence is therefore recorded
explicitly.

## Complete ref disposition

| Rescue ref | Date | Scope | Disposition and main evidence |
|---|---:|---|---|
| `reflog-only-0190acc` | 08-21 | `enterprise-postgres.ts` | Superseded by `c298b3c`, which retains both a human-readable error and the required compatibility token that the rescue variant dropped. |
| `unreachable-005f997236ad` | 08-15 | contract template, SCIM, smoke, ledger | Represented then strengthened through `4db767b`, `d989661`, `8608071`, `18999ba`, and `95fe8b7`. |
| `unreachable-145c56698300` | 07-12 | published jENA/jSNA migration | Superseded by same-theme `e4baf3d`, which adds a stronger worker change; package pins later advanced again. |
| `unreachable-165b180e3bfe` | 08-15 | production-posture predicate | Early incomplete stash; superseded by final eight-file `c7e5420`. |
| `unreachable-18fb188c2ba5` | 08-11 | ENA Model-column chip semantics | Represented: tip tree equals PR #15 merge tree `882ce8f`. |
| `unreachable-1da30b6340cf` | 07-31 | docs/navigation/logo | Patch-equivalent to `48d74d0`, then navigation evolved further. |
| `unreachable-1f3b20e6ff65` | 08-11 | ENA chip semantics | Represented: patch/tree equivalent to `0994b89`. |
| `unreachable-2a3437e91637` | 08-16 | production-posture + agreement test | Superseded by `c7e5420`, which corrects two additional predicates. |
| `unreachable-35f531fddba9` | 08-15 | SCIM groups | Production state represented by `f99f765`; later SCIM fixes/tests are stronger. |
| `unreachable-6614e0cef2b7` | 08-15 | import/adapters | Earlier import state; represented then strengthened via `ee59f1a`/`f99f765` and later fixes. |
| `unreachable-6654112` | 08-25 | publication/report/review/runtime/snapshot/statistical readers | Superseded by same-parent `3c0b074`, which adds snapshot object admission and a separate >100-work resource guard; PR #20 adds many later custody fixes. |
| `unreachable-7dc4665cbdbf` | 08-09 | ENA cancellation lifecycle | Superseded by `b102570`, then run-token/input-supersession work in `9647ce5`, `5d24a27`, and `a61ab3b`. |
| `unreachable-891f3dbbb996` | 08-18 | production-posture predicate | Represented: tip tree equals `c7e5420`. |
| `unreachable-90b9e7adb11a` | 08-18 | predicate merge verification | Represented: tip tree equals PR #18 merge `14bb3067`. |
| `unreachable-91ec7611b60c` | 08-09 | ENA input supersession | Represented by identical `5d24a27` tree, then strengthened by `a61ab3b`. |
| `unreachable-98f4cfef4ac2` | 08-15 | ops jobs/queue | Snapshot equals `f99f765`; later queue custody/retry/fairness work supersedes it. |
| `unreachable-9e3c5ea731a8` | 08-18 | production-posture predicate | Represented: same final tree as `c7e5420`. |
| `unreachable-b0ee35167452` | 08-09 | ENA input supersession | Represented by `5d24a27`, then strengthened. |
| `unreachable-bcde0f114de5` | 08-11 | functional coverage ledger | Patch-equivalent to `5d8a829`; ledger later evolved. |
| `unreachable-c0638c160af1` | 08-15 | SCIM/reset/import/publication/job worker; stash P3 files | Represented then strengthened across `18999ba`, `9106fd7`, `7fb3575`, `eb710e2`, and `b1bf2fc`. All seven P3 untracked files reached main; four were exact at first add and three were strengthened before commit. |
| `unreachable-d1e302fdf796` | 08-11 | two-commit test-harness chain | Both patches represented; tip tree equals `0e540ca`. |
| `unreachable-e630d58ae937` | 08-16 | auth abuse test | Exact state entered in `d8ab534`, then `652197b` added stronger real-IP proof. |
| `unreachable-e695a7e7da3d` | 08-08 | generated `next-env.d.ts` | Superseded generated-state noise; current main retains the production-build path. |
| `unreachable-ed16f1b4ed2e` | 08-18 | workspace home link | Represented: tip tree equals `765b418`. |
| `unreachable-ee13637bf978` | 07-31 | Vitest config | Patch/tree equivalent to `54317b1`, then configuration evolved. |
| `unreachable-ee59f1a13482` | 08-15 | import/adapters | Snapshot equals `f99f765`, then import logic evolved. |

## Recent patch-unique closure

There are 18 distinct `git cherry` `+` commits across the rescued graphs,
including stash index/untracked precursors. Only two are dated 2026-08-20 or
later:

- `0190acc`: classified as a weaker predecessor of `c298b3c`;
- `6654112`: classified as a weaker predecessor of `3c0b074` and the remaining
  PR #20 integrity sequence.

Result: **0 recent patch-unique commits remain unclassified; 0 refs require an
immediate salvage lane; 0 refs require security quarantine.**

The rescue namespace and verified external bundle remain required preservation
objects until the governance PR, exact-SHA receipt, owner review, and an
ordinary recoverable closeout decision are all complete.
