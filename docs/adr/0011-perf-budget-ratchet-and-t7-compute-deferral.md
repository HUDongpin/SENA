# ADR-0011 — Performance budget ratchet confirmed; T7 compute-chunk deferral decided

- **Status:** Accepted under delegated implementation authority (2026-08-16); **T7 implemented in `d1e684a`**. Peter ratifies at PR review, as with ADR-0009.
- **Correction (2026-08-16, after implementation):** this ADR calls chunk 2599 "the compute chunk" throughout (below, and in Decision 2). That name is **wrong**, and the Perf Report entry this ADR rests on stated the premise outright — "55% of the payload for code the first paint does not need", now struck at its source. 2599 is the entire workspace client bundle and most of it *is* needed for first paint. Decision 2 still stands — two-stage loading was the right direction and delivers an 8.80 s usable-shell window — but it stands on "the shell should not wait for the whole bundle", not on the false premise that the bundle is mostly unnecessary.
- **Context:** Perf Report iteration 9 (2026-08-16). Both items had sat open since 2026-08-03 marked "pending Peter", and both were blocked on evidence rather than on preference.

## Why this ADR exists

Two backlog items — the `total-static-js-br` ratchet and T7 (deferring the eager compute chunk) — were recorded as owner decisions. Re-reading them after iteration 9, the reason each was open was that **nobody had measured the thing the decision turned on**. That is now done, and in both cases the measurement narrows the choice to one defensible answer rather than leaving a preference to be expressed.

Decided here under the same delegated authority ADR-0009 used, on an unmerged branch, so review remains the ratification point.

## Decision 1 — confirm the ratchet at 852,000 B

`totalStaticJsBrotliBytes` stays **852,000 B**, no longer marked provisional.

It was provisional because it had been set against a pre-redesign build. Iteration 9 re-measured by same-session A/B: actual **824,791 B**, headroom **27,209 B (3.19%)**, with the redesign contributing +9,505 B and the 2026-08-15 remediation +2,808 B.

Confirmed at the existing value rather than re-ratcheted down to the new actual, deliberately: **T7 is still open and every option for it reorganises this payload.** One attempt during iteration 9 moved the total +7,874 B before being reverted. Tightening now would spend headroom that work needs and turn an unrelated build into a red gate. Re-ratchet once T7 lands — that is the natural moment, because the number will have moved for a known reason.

## Decision 2 — T7: two-stage shell, not a worker, not decline

**Decline is ruled out by measurement.** The workspace reaches interactive in 0.30 s locally but **3.06 s on Fast 3G and 9.28 s on Slow 3G**, and chunk 2599 is 955.9 KiB — **55% of the JS arriving on open** (called "the compute chunk" here and below; see the Correction above — it is the whole workspace bundle, and most of it *is* needed for first paint, so the size is the argument, not the redundancy). The 14.2 ms local download that made T7 look negligible in iteration 3 was an artifact of measuring on localhost.

**"Async model with a visible loading state" is not an available option — it already exists.** `SenaFusionWorkspaceLoader` already wraps the workspace in `next/dynamic` with a skeleton, and a Slow 3G user was observed watching that skeleton for the full nine seconds before the entire workspace appeared at once.

**A web worker does not address the measured cost.** The CPU profile attributes the residual to downloading, parsing and evaluating the chunk. A worker moves parse and execute off the main thread but does not reduce the 5.9 s of transfer that gates the figure on Slow 3G. It would help the 180 ms of CPU work; it would not help the seconds.

That leaves **two-stage loading**: render the workspace shell without the model, and bring the figure in when compute lands. It is the only remaining option that attacks the dominant term.

Two cheaper alternatives were implemented or checked and rejected, so this is not chosen by elimination-on-paper:

- **Better chunk scoping — checked, nothing to reclaim.** Only `/workspace/sena` downloads the chunk; `/`, `/docs`, `/workspace` and `/workspace/ena` pull zero of it.
- **Parallel warm-up import — implemented, measured, reverted.** The Slow 3G waterfall showed the chunk idle until 3,300 ms, which looked like ~2.8 s recoverable for free. Starting the import at module scope in the loader gave 9.28 s → 9.34 s (unchanged within noise) while costing +7,874 B, because the eager reference reorganised webpack's chunking instead of scheduling the fetch earlier.

### Consequence, stated plainly

Two-stage loading changes what a user sees: the shell appears early and the figure fills in, instead of everything arriving together. On a fast connection the difference is imperceptible (0.30 s either way). On a slow one it is the difference between nine seconds of skeleton and a usable workspace while the model builds.

It is also the largest of the three in implementation cost: `model` and its ~54 downstream consumers live in one hook, so the split is a component boundary — an outer stage that owns the compute import and an inner stage that runs today's hook unchanged once compute is ready. Hooks cannot be conditional, which is why this is a component split rather than a nullable value threaded through.

**Outcome (implemented `d1e684a`).** Chrome paints at 0.6 s, figure at 9.4 s — an **8.80 s** window where a Slow 3G researcher sees their workspace instead of a skeleton, for +1,493 B and no local cost. Time-to-figure did *not* move, and could not have: the Slow 3G load is bandwidth-saturated, so that number is bytes ÷ bandwidth and two-stage changes ordering rather than bytes. An acceptance criterion demanding it improve was miscalibrated and briefly caused the working implementation to be reverted.

The seconds live in a follow-on this ADR did not scope: **22 of the analysis barrel's 31 modules — 505,495 B, 72% — are reachable only through report and audit builders the figure never reads**, and sit on its critical path only because the hook computes them in render-body `useMemo`s.

**This ADR decided the direction. The implementation is recorded above rather than assumed** — landing it half-done and calling T7 closed would be the failure mode this campaign has spent itself documenting.

## Ratification

Peter may reverse either decision at review. The ratchet is a one-line default; the T7 direction is recorded here before implementation precisely so reversing it is cheap.
