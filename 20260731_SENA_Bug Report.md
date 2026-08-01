# SENA Bug Report — 2026-07-31

**Scope:** Bug-detection sweep over the runnable SENA application in `sena-hk-template`,
concentrated on source that changed since the 2026-07-18 sweep (the F1–F6 hardening and
ADR-0006 D1 forum bridge evidence), plus the ingestion → bridge-matrix path they feed.
**Reviewer:** Claude (Opus 5), driven by Peter (Dongpin HU).
**Branch:** `main` @ `bbd7eb3`.
**Previous report:** `20260718_SENA_Bug Report.md` (F1–F6, all fixed).

---

## 0. Gate status — automated gates could NOT be completed

This is a caveat on the whole report, not a finding.

| Gate | Result during detection | Result after the fix (run unsandboxed) |
|---|---|---|
| `tsc --noEmit` | Killed after ~25 min without finishing (sandboxed) | **Clean, exit 0** |
| `eslint` | Not run | **Clean, exit 0** on all changed files |
| `npm test` (full vitest) | Died at startup with `ERR_INVALID_PACKAGE_CONFIG` (sandboxed) | **1035 passed / 1 skipped, 0 failed** |

The machine recovered partway through the session (a vitest file that had taken ~26 min to
even load later ran in 15 s), so the gates below were ultimately run for real.

One test **file** still fails, and it is **not** related to this work:
`lib/ena/__tests__/plot-parity.test.ts` — a new, still-untracked file from a concurrent
session — fails at collection with `ReferenceError: document is not defined`, because
`renderENAPlot` needs a DOM and the file declares no jsdom environment. It imports only
`jena-js` and `lib/ena/*` and reaches nothing changed here. Worth flagging to whoever owns it.

Three environment problems, none of them SENA defects:

1. **The agent sandbox blocks large module loads.** Under the default sandbox,
   `require('typescript')` hangs indefinitely at 0% CPU; unsandboxed the same call
   returns in ~21 s. This is what produced the misleading `ERR_INVALID_PACKAGE_CONFIG`
   on `vitest/package.json` and then `rolldown/package.json` — the files are intact and
   parse fine. Re-run gates outside the agent sandbox.
2. **The machine is saturated.** Load average 27–55 throughout, dominated by
   `mds_stores` (Spotlight, ~90–150% CPU, running 5 days), `WindowServer` (~42%) and
   `fileproviderd` (~32%). `vite-node` and even `grep` timed out at multi-minute
   deadlines. Spotlight appears to be churning the 498 MB `node_modules`; excluding it
   from indexing would likely fix this, but that is a system-settings change I left to you.
3. **Another agent is editing this repo concurrently.** During the sweep,
   `components/ena/EnaPlot.tsx`, `app/workspace/ena/EnaWorkspaceClient.tsx`, new
   `lib/ena/plot-encoding.ts` + `lib/ena/__tests__/plot-parity.test.ts` and — later —
   `lib/sena/index.ts`, `lib/sena/layout.ts` and `components/sena/workspace/fusion-canvas.tsx`
   appeared or changed (ENA plot-parity / coordinate-projection work; most likely the Codex
   session running in the ChatGPT app). None of it was touched here, but it means **the gate
   results below were produced against a tree that also contains that unrelated
   work-in-progress.** The changes for this report are confined to
   `lib/sena/import.ts`, `lib/sena/import-adapters.ts` and
   `lib/sena/__tests__/enterprise.test.ts`.

**Findings below were therefore established by source review plus targeted execution
probes** (transpiled with the TypeScript API and run on plain Node, bypassing the hung
toolchain). Every probe result quoted is real output, reproduced in §3.

---

## 1. Findings

| # | Severity | Area | File | One-line |
|---|----------|------|------|----------|
| G1 | **Medium–High** | Ingestion → bridge layer | `import.ts`, `import-adapters.ts` | Unresolvable / delimiter-bearing `targetPersonIds` fabricate participants and flip `B_CP` to independent mode on invented evidence |
| G2 | Low | CSV import | `import.ts` | Short rows are padded silently — `parseSenaCsv` has no warning channel at all |

---

## Resolution status — both fixed (2026-07-31)

Branch `fix/g1-target-person-fabrication`.

| # | Fix | Files changed |
|---|-----|---------------|
| G1 | `addDerivedContractRows` derives placeholder people from `targetPersonIds` **only when the upload declared no people roster**. A declared roster is authoritative, so an unmatched target stays a dangling reference reported by `buildBridgeMatrix` rather than becoming a roster member; with no roster, the `coded_segments` table *is* the roster and a declared target legitimately introduces the person it names (this is the F6 case, preserved). `adaptForumRows` gained `resolveDeclaredTarget`, a strict resolver that emits `""` plus a manifest warning when a reply target does not resolve to a known author, or when the resolved id carries a `\|`/`;`/`,` separator that the multi-value field would shred. | `lib/sena/import.ts`, `lib/sena/import-adapters.ts` |
| G2 | `parseSenaCsv` now returns `warnings: string[]` (additive — existing `{ columns, rows }` destructuring is unaffected) and records both short-row padding and dropped trailing cells. `importSenaEnterpriseFiles` prefixes them with the file name and pushes them into the cleaning manifest for both the CSV and forum paths. | `lib/sena/import.ts`, `lib/sena/import-adapters.ts` |

The S layer is deliberately untouched: `resolvePersonIdentity` still passes an
unresolved reply-to through to the interaction, so social ties behave exactly as before.
An unresolvable target can therefore still enter the roster via the *interactions*
derivation — pre-existing behaviour, out of scope here, and it no longer affects `B_CP`.

**Regression tests added** (6, in `lib/sena/__tests__/enterprise.test.ts`):
separator-bearing forum target → no fabricated people, transpose fallback, social tie
intact, warning disclosed; unresolvable forum target → no declared target, transpose
fallback, warning; JSON contract with an unknown `target_person_ids` → roster unchanged,
model warns `unknown target person`; F6 regression → segments-only upload still recovers its
contributor; `parseSenaCsv` ragged-row warnings incl. over-long rows still throwing;
ragged CSV surfaced in the cleaning manifest.

**Verification:** `tsc --noEmit` clean, `eslint` clean on all changed files, and the full
suite green — **1035 passed / 1 skipped / 0 failed** (up from 1018 at the last sweep), with
the single unrelated `lib/ena` collection failure noted in §0.

The first full run surfaced a genuine conflict worth recording: the original G1 fix removed
target-derived people outright, which broke the F6 test
*"derives placeholder people from coded_segments when the people table is absent"*
(it asserts a segments-only contract recovers `P3` from `target_person_ids`). That test is
right for its case — with no roster, the contract is the only source of truth — so the fix
was narrowed to the `hasDeclaredRoster` rule above rather than overriding the test.
ADR-0006 D1's happy path was re-confirmed: targets that resolve cleanly still produce
`pc-cp-independent`.

---

### G1 — Unresolved target persons are invented, not dropped *(Medium–High)*

**Files:** `lib/sena/import.ts` — `addDerivedContractRows` (~407–426), `parseCodes` (~127–132),
`normalizeSegments` (~331); `lib/sena/import-adapters.ts` — `resolvePersonIdentity` /
`adaptForumRows` (~404–476); consumed by `lib/sena/model.ts` — `buildBridgeMatrix` (~659–707).

This is a **regression created by the interaction of two 2026-07-18 changes** that are each
correct in isolation: the F6 fix (derive placeholder people from `coded_segments`, including
`targetPersonIds`) and ADR-0006 D1 (forum reply targets now populate `target_person_ids`).

**The chain:**

1. `adaptForumRows` resolves a reply's target through `resolvePersonIdentity`, which
   returns the **raw input unchanged** when it cannot resolve it:
   ```ts
   const resolvePersonIdentity = (value: string) =>
     (value ? personIdentityIndex.get(value) ?? value : "");
   ```
   So an unresolvable target is written onto the segment rather than left empty.
2. `normalizeSegments` parses `target_person_ids` with `parseCodes`, which splits on
   `[|;,]`. A person id containing a comma — routine when an export has no id column and
   `authorId` falls through to `name`/`display_name`, and `"Last, First"` is the standard
   Canvas/Moodle display form — is **split into multiple ids**.
3. `addDerivedContractRows` then **creates a placeholder person for every unknown target id**.
4. Because those placeholders now exist in `personIndex`, `buildBridgeMatrix` sets
   `hasIndependentCpEvidence = true` and returns the independently-estimated `Bcp` instead
   of the `B_PC` transpose fallback.

**Measured effect** (probe, §3.2): two real participants, one reply addressed to
`"Wong, Ka Yee"` →

```
roster:  [ 'Wong, Ka Yee', 'Chan, Tai Man', 'Wong', 'Ka Yee' ]   # 2 real, 2 fabricated
targets: ["Wong","Ka Yee"]
B_CP  (code "Evidence"): [0, 0, 1, 1]     # all mass on the two fabricated actors
B_PC:                    [[0],[1],[0],[0]] # correctly on the real author
```

The real addressee receives **zero** `B_CP` mass; two people who do not exist receive all of
it. `B_CP ≠ B_PCᵀ`, so the whole model leaves transpose-fallback and reports directed
bridge structure that is entirely an artifact of the split.

The control case in the same probe shows the general form of the bug — it does **not**
require a comma. Any target id that simply doesn't match a real person (`"P1"`) is also
fabricated into the roster and also flips the bridge mode:

```
roster:  [ 'Wong, Ka Yee', 'Chan, Tai Man', 'P1' ]
B_CP:    [0, 0, 1]
```

**Why this matters beyond the numbers:** it directly violates the ADR-0006 D1 guardrail,
which states that unresolved targets must "leave the segment target empty (transpose
fallback preserved) with a manifest warning — **never invent a target**"
(`docs/adr/0006-forum-reply-bridge-evidence-and-actor-typing.md`, §D1). It also silently
inflates person count, `S`/`B` dimensions, and every per-person metric. The only signal is a
`derived a placeholder person from coded_segments` warning, which reads as benign.

Note the S layer is **not** affected — `normalizeInteractions` reads `source`/`target` as
plain fields without `parseCodes`, so the social tie keeps the correct
`"Wong, Ka Yee"` identity. The same resolved target therefore yields *different identities in
S and in B_CP* within one dataset.

**Suggested fix (three independent hardenings, any one breaks the chain):**
- Do **not** derive placeholder people from `targetPersonIds` in `addDerivedContractRows`;
  restrict derivation to `segment.personId`. Unknown targets should fall back to the existing
  `references unknown target person` warning in `buildBridgeMatrix` — which is the
  ADR-0006-mandated behaviour.
- In `adaptForumRows`, emit `""` when `personIdentityIndex` has no entry (i.e. drop the
  `?? value` fallback for the segment target) and push a manifest warning.
- Give `targetPersonIds` a delimiter that cannot occur in an id, or quote/escape ids on the
  way in — splitting identifiers on `,` is unsafe for any name-keyed roster.

---

### G2 — `parseSenaCsv` pads short rows with no warning channel *(Low)*

**File:** `lib/sena/import.ts`, `parseSenaCsv` (~222–240).

The F5 fix correctly stopped one ragged row from aborting a five-CSV upload, but
`parseSenaCsv` returns `{ columns, rows }` and has **no way to report anything**. Short rows
are padded with `""` silently. Verified (§3.1): a `coded_segments` row truncated before its
last column yields `codes: ""`.

When the missing column is required the row is later rejected — but with a misleading
`missing segment ID, utterance ID, or codes` message rather than "row was ragged". When the
missing columns are **optional** (`confidence`, `stage`, `turn_index`, `target_person_ids`)
the row is accepted with silent defaults and nothing anywhere records that the source row was
malformed.

The original F5 recommendation was "padding short rows with empty strings **(and warning)**";
the warning half was not implemented. Suggested fix: return a `warnings: string[]` alongside
`columns`/`rows` and surface it in the cleaning manifest.

---

## 2. Reviewed and found correct

- **F1** (transcript stage thirds). `parsedTurnCount` counts exactly the lines that
  `speakerLinePattern` matches, and every matched line unconditionally pushes an utterance,
  so `parsedTurnCount === utterances.length`. Denominator and `turnIndex` now agree. The
  hoisted regex has no `g` flag, so `.test()` is stateless — no lastIndex hazard.
- **F3** (stage-window scoping). `window.mode` is genuinely set (`model.ts:1213`, `"stage"` at
  `1294`) and `window.stages` for a stage window is exactly that stage, so the new
  `mode === "stage"` branch matches `buildTemporalWindows`. Turn/moving modes are untouched.
- **F4** (Krippendorff α). The coincidence-matrix rewrite is the canonical estimator:
  each unit with *m* ≥ 2 ratings contributes its *m*(*m*−1) ordered pairs at weight 1/(*m*−1),
  and `alpha = 1 − (n−1)·Σ_{c≠k} o_ck / Σ_{c≠k} n_c·n_k` is the correct
  sampling-without-replacement form. Both guards are right: `pairableTotal < 2 → 0`
  (no pairable data) and `expectedDisagreement === 0 → 1` (single category).
- **report.ts temporal transitions.** Computing the trace from `options.sourceDataset` is
  correct, and the extra `buildSenaModel` call is confined to export paths
  (`snapshot.ts`, `runtime-bundle.ts`, the export-actions hook) — not a per-render hot path.
- **F2** (forum identity index). Ids are indexed before labels so ids win collisions, as
  documented. The `parent_post_id → authorByPost` path already maps through canonical ids.

## 3. Probe output (reproductions)

Probes were transpiled with `ts.transpileModule` and run on plain Node; they touch only
`lib/sena/import.ts` and `lib/sena/model.ts`, so they avoid the module loads that hang.

### 3.1 Short-row padding (G2)

Input `coded_segments` CSV, header of 6 columns, second data row truncated to 5:

```
row2: {"segment_id":"cs2","utterance_id":"u2","person_id":"P1","unit_id":"unit1","stanza_id":"st1","codes":""}
>>> row2.codes is: "" (silently empty, no warning channel)
```

### 3.2 Fabricated participants and bridge-mode flip (G1)

People `"Wong, Ka Yee"` and `"Chan, Tai Man"`; one coded segment by Chan with
`target_person_ids = "Wong, Ka Yee"`:

```
=== A: target id contains a comma ===
  roster: [ 'Wong, Ka Yee', 'Chan, Tai Man', 'Wong', 'Ka Yee' ]
  segment targets: ["Wong","Ka Yee"]
  B_CP: rowLabels ["Evidence"], columnLabels ["Wong, Ka Yee","Chan, Tai Man","Wong","Ka Yee"],
        raw [[0,0,1,1]]
  B_PC: raw [[0],[1],[0],[0]]

=== B: control — plain unresolvable id, no split ===
  roster: [ 'Wong, Ka Yee', 'Chan, Tai Man', 'P1' ]
  segment targets: ["P1"]
  B_CP: raw [[0,0,1]]
```

Warnings emitted in case A were only:

```
people table did not include "Wong"; derived a placeholder person from coded_segments.
people table did not include "Ka Yee"; derived a placeholder person from coded_segments.
```

---

## 4. Recommended next actions

1. **Fix G1.** The one-line version is to stop deriving placeholder people from
   `targetPersonIds`; do that plus the `adaptForumRows` empty-on-unresolved change to
   restore the ADR-0006 guardrail.
2. **Add regression tests**: (a) segment whose `target_person_ids` names an unknown person →
   no new roster entry, `B_CP = B_PCᵀ` preserved, warning emitted; (b) forum export with
   `"Last, First"` display-name authors → reply resolves to exactly one real target, roster
   size unchanged; (c) `parseSenaCsv` ragged row → warning surfaced.
3. **Fix G2** by giving `parseSenaCsv` a warnings channel.
4. **Re-run the full gates** (`tsc`, `eslint`, `npm test`) outside the agent sandbox and on a
   quiet machine — §0 means this report carries no green gate evidence.

*Line numbers are approximate and reference `main` @ `bbd7eb3`.*
