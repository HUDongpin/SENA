# ADR 0010: Declared Roster Is the Authoritative Actor Boundary in Every Layer

## Status

Accepted (2026-08-09) — Peter answered Test Suite Ledger decision 13 (finding Q9) with
"it's a bug — fix it with gate + warn (not gate-silently, not disclose-and-keep)";
implemented the same day on `fix/q9-roster-target-gate`. Implementation notes:

- The gate is **target-only**: `addDerivedContractRows` (`lib/sena/import.ts`) still
  derives a placeholder person from `interaction.source` regardless of roster — a source
  is a *contribution* (the person demonstrably acted), recovered the same way as an
  unknown utterance author or segment contributor. Only `interaction.target` stops
  deriving when a people roster was declared. Roster-less uploads keep full derivation:
  with no people table, the data tables *are* the roster (the F6 rule).
- The disclosure is judged against the **finished** roster, after every derivation loop
  has run, so an id minted later from a contribution is not misreported as dangling. It
  is aggregated per dangling id with a tie count:
  `declared people roster does not include "<id>"; N interaction(s) targeting it were
  excluded from the social layer (a target is a claim about an actor, not a declaration
  of one).` It rides the existing cleaning-manifest channel (`dataset.warnings` →
  `SenaImportResult` → workspace alerts; the enterprise queue sees it as an
  `uploadWarnings` count), so no new plumbing was added.
- The forum adapter's lenient `resolvePersonIdentity` pass-through
  (`lib/sena/import-adapters.ts`) is **deliberately kept**: the import-layer gate is the
  single enforcement point for every producer (JSON contract, CSV tables, adapters), and
  suppressing the target at the adapter would bypass that disclosure. This closes the
  sibling question the 2026-07-31 report deferred and the 2026-08-01 report dropped.
  `resolveDeclaredTarget`'s stricter resolution remains in force for directed B_CP
  evidence per ADR-0006 D1 — the two resolvers now serve two documented rules.
- **Enterprise multi-file route.** The pre-commit adversarial review proved (by executed
  repro) that `importSenaEnterpriseFiles`' double-import defeated the gate: a roster-less
  contract file legitimately derives its people per-file, `datasetToTables` round-tripped
  those `group:"Derived"` placeholders as *declared* rows, and the merged pass then saw
  the fabricated target already seated — while discarding the analyst's real declared row
  of the same id as a "duplicate". Fixed in the same change: `datasetToTables` no longer
  round-trips reconstruction placeholders (`group:"Derived"` with `label === id` — the
  marker convention the data-contract audit already reserves), so the merged pass is the
  one authoritative roster verdict; and per-file derivation/roster-gate warnings are
  filtered out of the combined manifest (they survive per-file on `sources`), so each
  disclosure appears exactly once instead of twice.

## Context

G1 (2026-07-31) established the rule this ADR generalizes: **a target is a claim about
an actor, not a declaration of one.** Its fix closed two fabrication chains — the forum
adapter (`resolveDeclaredTarget` warns and suppresses unresolvable reply targets) and the
coded_segments placeholder path (`target_person_ids` no longer derives people under a
declared roster, per ADR-0006 D1's "never invent a target" guardrail). A third chain, the
S-layer identity pass-through, was deliberately left open as blast-radius containment
("pre-existing behaviour, out of scope here", 2026-07-31 Bug Report:78–81) — documented
in a test comment, never ratified by an ADR.

Q9 (2026-08-03) then proved by executed repro that the loop this pass-through feeds was
never enumerated: the interactions loop in `addDerivedContractRows` minted a
`group:"Derived"` roster member for any unknown `interaction.target`, with no roster
gate — declared roster `[P1, P2]` plus one interaction targeting `"Ghost"` produced a
person count of 3. The same function stated the correct rule twice in comments and
applied it 20 lines below for `target_person_ids`, but not here. Accepted ADR-0007 D1
("the declared roster remains authoritative") pointed the same way.

Two things raised the stakes since the 2026-07-31 containment decision. ADR-0009's
plane-orbit default renders every roster member as a named hexagon on the flagship
fusion figure, so a fabricated actor is now a visibly named participant on SENA's
headline output. And methodologically, a declared roster is a boundary specification:
the analyst, not the data, defines the node set — inflating N from claims distorts
person counts, S-matrix dimensions, density, and per-person normalization in ways no
import-log note cures once published.

## Decision

- **D1 — Gate.** Under a declared people roster, no roster member is ever derived from
  `interaction.target`. The gate is target-only (sources and other contribution-shaped
  fields keep deriving); roster-less uploads are unchanged.
- **D2 — Warn.** Every dangling interaction target is disclosed in the cleaning
  manifest, aggregated per id with a tie count, judged against the finished roster. The
  disclosure must name the excluded ties, because `buildSocialMatrix` drops each such
  interaction entirely — including the *declared source's* outgoing weight — and that
  loss must be visible where the dangling id is still known.
- **D3 — Single enforcement point.** The roster boundary is enforced, and disclosed,
  once: at import. Adapters keep lenient identity pass-through for the social layer so
  the gate sees the original claim; they may enrich warnings with source-format context
  but must not silently suppress S-layer targets.

## Consequences

- **Reproducibility.** A dataset containing unresolvable interaction targets (typically
  a forum/LMS export whose replies point at deleted or non-author accounts) changes
  person counts, S dimensions, and matrix fingerprints on re-import relative to
  pre-ADR-0010 review packets and snapshots. As with ADR-0006 D1 and ADR-0007 D2, this
  is a disclosed, deliberate correction, not a silent change. No bundled dataset is
  affected — the sample data, pilot contract, and templates are roster-closed.
- **Tie censoring, disclosed.** A declared source's interaction with an out-of-roster
  target is excluded from S, so that source's outward activity is undercounted. The
  warning discloses the loss per id; the methodologically richer alternative — an
  explicit external-alter construct (tie retained; node marked non-roster and excluded
  from counts, normalization, and the orbit figure) — is recorded as future work and
  requires its own ADR. Nothing in the current ruleset supports minting actors from
  claims, opt-in or otherwise.
- **Audit surfaces.** `data-contract-audit` derivedPeople counts drop for affected
  uploads (no test pins the value). The stale test comment pinning "Ghost may still
  enter the roster through the social layer" was replaced by assertions of the gated
  behavior.

## Guardrails

This is an S-layer semantics change (roster membership, a social edge, person counts, S
dimensions, matrix fingerprints), landed under the coordinated SENA-A02/A05/A07/A13/A15
review that ADR-0005:48 and the ADR-0006/0007 precedent require, with matching tests.
Kill-proof per the Test Suite Ledger protocol: the Q9 repro and the forum-adapter
assertion were watched **red** against the ungated code (2 failed / 17 passed in
`enterprise.test.ts`) before the gate landed, then green after, alongside two
preservation pins (source derivation under a declared roster; full derivation
roster-less) that were green on both sides. A pre-commit adversarial review (3 lenses,
every finding independently re-verified by execution) then surfaced the enterprise
round-trip bypass and a surviving live-check mutant; both were fixed with their own
watched kills — the cross-file regression test red against the bypass, and the
`dataset.people.length`-at-gate-time mutant killed by exactly one test (1 failed /
20 passed) in a single-invocation probe. Full suite (1356 passed / 1 skipped),
`tsc --noEmit`, and `next build` green at landing.

## Alternatives considered

- **Disclose-and-keep** (mint + warn, the pre-decision behavior): rejected. It ratifies
  the exact shape both prior G1 fixes eliminated, leaves the roster-authority rule
  contradicted 20 lines from its own statement, renders fabricated actors as named
  hexagons under ADR-0009, and forces the TL-A3 invariant into the "declared row *or
  disclosed derivation*" phrasing the ledger pre-identified as an EC-8 vacuous pass.
- **Silent gate** (gate without the manifest warning): rejected. It converts disclosed
  fabrication into undisclosed data loss — the whole tie, including the real source's
  weight, vanishes with only a generic model-layer warning — contradicting the guardrail
  form of ADR-0006 D1 ("with a manifest warning") and SENA-A05's brief that derived and
  cleaning provenance remain explicit.
- **Adapter-side suppression** (extend `resolveDeclaredTarget` to the S layer): rejected
  as the enforcement point. It would fix only adapter producers, leaving the JSON/CSV
  contract path mintable (the Q9 repro is a direct contract upload), and suppressing
  before import would silence the single disclosure D2 depends on.
- **External-alter construct now**: deferred as future work (see Consequences); it
  reintroduces fingerprint forks behind a switch and was not blast-tested.
