# ADR-0011 — Performance budget ratchet confirmed; T7 compute-chunk deferral decided

- **Status:** Accepted under delegated implementation authority (2026-08-16). Peter ratifies at PR review, as with ADR-0009.
- **Context:** Perf Report iteration 9 (2026-08-16). Both items had sat open since 2026-08-03 marked "pending Peter", and both were blocked on evidence rather than on preference.

## Why this ADR exists

Two backlog items — the `total-static-js-br` ratchet and T7 (deferring the eager compute chunk) — were recorded as owner decisions. Re-reading them after iteration 9, the reason each was open was that **nobody had measured the thing the decision turned on**. That is now done, and in both cases the measurement narrows the choice to one defensible answer rather than leaving a preference to be expressed.

Decided here under the same delegated authority ADR-0009 used, on an unmerged branch, so review remains the ratification point.

## Decision 1 — confirm the ratchet at 852,000 B

`totalStaticJsBrotliBytes` stays **852,000 B**, no longer marked provisional.

It was provisional because it had been set against a pre-redesign build. Iteration 9 re-measured by same-session A/B: actual **824,791 B**, headroom **27,209 B (3.19%)**, with the redesign contributing +9,505 B and the 2026-08-15 remediation +2,808 B.

Confirmed at the existing value rather than re-ratcheted down to the new actual, deliberately: **T7 is still open and every option for it reorganises this payload.** One attempt during iteration 9 moved the total +7,874 B before being reverted. Tightening now would spend headroom that work needs and turn an unrelated build into a red gate. Re-ratchet once T7 lands — that is the natural moment, because the number will have moved for a known reason.

## Decision 2 — T7: two-stage shell, not a worker, not decline

**Decline is ruled out by measurement.** The workspace reaches interactive in 0.30 s locally but **3.06 s on Fast 3G and 9.28 s on Slow 3G**, and the compute chunk is 955.9 KiB — **55% of the JS arriving on open**. The 14.2 ms local download that made T7 look negligible in iteration 3 was an artifact of measuring on localhost.

**"Async model with a visible loading state" is not an available option — it already exists.** `SenaFusionWorkspaceLoader` already wraps the workspace in `next/dynamic` with a skeleton, and a Slow 3G user was observed watching that skeleton for the full nine seconds before the entire workspace appeared at once.

**A web worker does not address the measured cost.** The CPU profile attributes the residual to downloading, parsing and evaluating the chunk. A worker moves parse and execute off the main thread but does not reduce the 5.9 s of transfer that gates the figure on Slow 3G. It would help the 180 ms of CPU work; it would not help the seconds.

That leaves **two-stage loading**: render the workspace shell without the model, and bring the figure in when compute lands. It is the only remaining option that attacks the dominant term.

Two cheaper alternatives were implemented or checked and rejected, so this is not chosen by elimination-on-paper:

- **Better chunk scoping — checked, nothing to reclaim.** Only `/workspace/sena` downloads the chunk; `/`, `/docs`, `/workspace` and `/workspace/ena` pull zero of it.
- **Parallel warm-up import — implemented, measured, reverted.** The Slow 3G waterfall showed the chunk idle until 3,300 ms, which looked like ~2.8 s recoverable for free. Starting the import at module scope in the loader gave 9.28 s → 9.34 s (unchanged within noise) while costing +7,874 B, because the eager reference reorganised webpack's chunking instead of scheduling the fetch earlier.

### Consequence, stated plainly

Two-stage loading changes what a user sees: the shell appears early and the figure fills in, instead of everything arriving together. On a fast connection the difference is imperceptible (0.30 s either way). On a slow one it is the difference between nine seconds of skeleton and a usable workspace while the model builds.

It is also the largest of the three in implementation cost: `model` and its ~54 downstream consumers live in one hook, so the split is a component boundary — an outer stage that owns the compute import and an inner stage that runs today's hook unchanged once compute is ready. Hooks cannot be conditional, which is why this is a component split rather than a nullable value threaded through.

**This ADR decides the direction. The implementation is tracked separately and is not part of this record** — landing it half-done and calling T7 closed would be the failure mode this campaign has spent itself documenting.

## Ratification

Peter may reverse either decision at review. The ratchet is a one-line default; the T7 direction is recorded here before implementation precisely so reversing it is cheap.
