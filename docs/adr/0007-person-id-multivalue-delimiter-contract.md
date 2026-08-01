# ADR 0007: Person-ID Charset and Multi-Value Field Delimiter Contract

## Status

Accepted (2026-08-01) — approved by Peter via the 2026-08-01 "fix these issues" directive;
D1 and D2 implemented the same day. Implementation notes:

- Multi-value cells (`codes`, `target_person_ids`) split on `|` only; a cell with no `|`
  is one value, verbatim (`parseMultiValue`, `lib/sena/import.ts`). JSON-contract arrays
  join on `|` in `scalar()`, so the array form round-trips element-by-element.
- D1 charset warnings run over the finished dataset (`warnDelimiterBearingIds`): a
  `|`-bearing id is reported per id as inexpressible in multi-value fields; `,`/`;`-bearing
  ids are legal, so they are aggregated into one tolerated-but-discouraged warning per
  table/field carrying a count and up to three examples — a name-keyed roster carries
  hundreds of them, and one warning each drowned the cleaning manifest. Values the
  deprecation warning below already flagged are left out of that aggregate, count included,
  so no single id is called ambiguous and "legal, kept verbatim" in the same manifest.
- The deprecation window is a per-value warning judged against the **finished** dataset,
  not the declared tables. A `,`/`;`-bearing value that is itself an id the import
  accepts — declared *or* derived — is what the upload meant, so it is not flagged; this is
  what keeps a roster-less upload from flagging the very ids it derives moments later.
  The legacy-list rule takes precedence in the other direction: when every `,`/`;` fragment
  of the value is itself a known id (`P2,P3` where both `P2` and `P3` exist), the old
  splitter would have produced real values, so it is flagged as "read as one value, not
  split" even though the whole value also resolves. Each `|`-separated value of a
  half-migrated cell (`question|evidence,claim`) is judged on its own, only rows the import
  keeps are considered, and each distinct value is reported once per import, naming the
  source table it came from.
- `codes` and `target_person_ids` migrated together, as recommended below. Source-format
  tolerance (any-delimiter tag lists) moved to the adapter boundary: the forum/LMS
  adapter still splits tag lists on `|`/`;`/`,` and emits `|`-joined contract cells.
  The forum adapter now declares `,`/`;`-bearing reply targets verbatim (the G1 loss
  path is closed); only `|`-bearing ids remain undeclarable.
- The bundled pilot contract has no `target_person_ids` and no `,`/`;` multi-value
  cells, so no fixtures or fingerprints changed. The G1 regression test was updated in
  place to pin the corrected (declared, directed) behaviour.

Previously: Proposed (2026-07-31)

## Context

The five-table SENA contract carries several **multi-value** fields — most importantly
`coded_segments.target_person_ids` (directed `B_CP` evidence, ADR-0005) and
`coded_segments.codes` — as a single delimited string. `parseSenaCsv` yields one string per
cell, and `normalizeSegments` splits it with the shared helper:

```ts
// lib/sena/import.ts
function parseCodes(value: string) {
  return value.split(/[|;,]/).map((code) => code.trim()).filter(Boolean);
}
```

So `|`, `;` **and** `,` are all in-band separators for these fields. A person id is never
validated against a charset anywhere in the importer or model, and the JSON contract accepts
whatever id the upload declares.

This is safe for `codes` (code ids are author-controlled and rarely contain punctuation) but
**not** for `target_person_ids`, because person ids frequently come from data the researcher
does not control:

- Forum/LMS exports with no id column fall through to the author **display name**, and the
  standard institutional form is `"Last, First"` — a comma-bearing id.
- Hand-authored contracts may legitimately use names, emails, or handles as ids.

The 2026-07-31 bug sweep (finding **G1**) showed the concrete failure: a reply addressed to
`"Wong, Ka Yee"` was split into `["Wong", "Ka Yee"]`, and — before the fix — the placeholder
derivation then invented two people from the fragments and flipped the bridge to
`pc-cp-independent` on evidence that did not exist. The
`fix/g1-target-person-fabrication` commit closed the *forum-adapter* path (it now refuses
to declare a separator-bearing target and warns) and the *placeholder* path (targets are no
longer derived into people when a roster is declared). **What remains open is the contract
itself:** a researcher still cannot *express* a person id that contains `,`, `;` or `|`
through the five-CSV path or the JSON contract, and a hand-authored roster-less contract can
still mis-split such an id. This is a v1 contract question, which the guardrails reserve for
a decision rather than an ad-hoc patch — hence this ADR.

Aliases already accepted for the field:
`target_person_ids, target_people, target_persons, target_person_id, uptake_person_ids,
addressed_to, receiver_ids, to_person_ids`. The blank template header ships
`... person_id,target_person_ids,unit_id ...`.

## Decision (proposed)

Adopt **both** halves; they are complementary, not alternatives.

### D1 — Declare and document a person-ID charset

Person ids (and code ids) **must not contain** the multi-value delimiters `|`, `;`, `,`. This
is a documentation + validation change, not a runtime-semantics change:

- Document the restriction in the template column help, the JSON-contract schema notes, and
  `CONTEXT.md`'s ubiquitous-language section.
- On import, when a `person_id`, `target_person_ids` element, or `code` id contains a
  delimiter, emit a **cleaning-manifest warning** naming the field and row (the forum adapter
  already does this for reply targets; extend it to the generic CSV/JSON path). Do not throw —
  warn-and-continue matches the rest of the ingestion pipeline.
- The declared roster remains authoritative (per the G1 fix): a delimiter-bearing declared id
  is reported and its directed-evidence use is suppressed, never silently split into actors.

### D2 — Support an escape so restricted ids can still be expressed

Because real rosters key on names and emails, the contract must offer *a* way to carry a
delimiter-bearing id rather than only forbid it:

- Preferred: allow `target_person_ids` (and any multi-value field) to be provided as a **JSON
  array** in the JSON contract and as a **quoted, pipe-delimited** value in CSV, and split
  multi-value CSV cells on `|` **only** (reserving `,`/`;` for legacy single-value tolerance
  behind a documented deprecation). A single-element value with no `|` is taken verbatim, so
  `"Wong, Ka Yee"` round-trips.
- The five-table contract, all v1 `schemaVersion` strings, artifact file names, API response
  shapes, and export formats stay **unchanged**; only the *parsing* of the multi-value cell
  and the *documentation* change. Existing single-value uploads keep working.

## Consequences

- **Reproducibility.** A dataset whose `target_person_ids` previously mis-split will, after
  D2, resolve to the correct single target — changing bridge mode, matrix fingerprints, and
  temporal traces for that dataset. This is a disclosed, deliberate correction (as with
  ADR-0006 D1), not a silent change; affected fixtures/fingerprints must be regenerated.
- **`codes` vs `target_person_ids` asymmetry.** If only the person-id field moves to
  pipe-only splitting, `codes` and `target_person_ids` no longer share one splitter. Either
  migrate both together (cleaner, larger blast radius) or document the divergence explicitly.
  Recommendation: migrate both, since a code id with a comma has the same latent hazard.
- **Backward compatibility.** Any existing upload that *relied* on `,`/`;` to separate
  multiple targets in one cell would change meaning under pipe-only splitting. A one-release
  deprecation window that warns on `,`/`;`-separated multi-value cells before removing the
  behavior is required; the existing regression tests that use `,`-joined values must be
  updated, not deleted.
- **Guardrails.** Bridge construction, `B_CP` direction, and matrix fingerprints are touched
  transitively, so this needs the coordinated SENA-A02/A05/A07/A13/A15 review that ADR-0005
  and ADR-0006 require, with matching tests.

## Alternatives considered

- **Forbid delimiter-bearing ids only (D1 alone).** Simplest, and it makes the failure loud,
  but it leaves name-keyed rosters — the common forum/LMS case — unable to express their
  actual ids, forcing researchers to invent synthetic ids and lose traceability.
- **Silently URL-encode / hash ids on import.** Rejected: it destroys the human-readable
  lineage the review packet depends on, and a hash collision would merge distinct people.
- **Status quo (rely on the G1 adapter fix).** Rejected: the adapter fix prevents
  *fabrication* but not *loss* — a legitimately comma-bearing declared target is still dropped
  from directed evidence with only a warning, understating real directed structure exactly as
  the G1/F2 class of bug did.

## Rollout

1. Accept this ADR (SENA-A02/A05/A07/A13/A15).
2. Implement D1 (charset docs + generic-path warning) first — low risk, no semantics change.
3. Implement D2 behind the deprecation window; update `parseCodes`/`normalizeSegments`, the
   template help, the JSON-contract notes, and the `,`/`;`-using regression tests.
4. Regenerate affected fixtures/fingerprints and disclose the bridge-mode changes.

## References

- ADR-0005 (Directed Person-Code Bridge Contract) — owns `targetPersonIds` → `B_CP`.
- ADR-0006 D1 (Forum reply bridge evidence) — the adapter-side half of the same hazard.
- `20260731_SENA_Bug Report.md` finding **G1**; commit `fix/g1-target-person-fabrication`.
- `lib/sena/import.ts` — `parseCodes`, `normalizeSegments`, `addDerivedContractRows`.
