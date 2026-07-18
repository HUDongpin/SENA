# SENA Ethics & Data-Governance Checklist (Track B4)

A required review step before any SENA report is shared beyond the local pilot.
It operationalises the learning-analytics governance principles (DELICATE;
Pardo & Siemens, 2014) and the research-grade gate of the Human–AI brief
(`docs/research/human-ai/…2026-07-11.md`, §2.6 & §8) against the app's existing
`sena-dataset-metadata` contract. This checklist gates *claims*, not the tool:
until it passes, reports stay `exploratory-only`.

## A. Consent, purpose & retention · 同意、目的与留存

Maps to the `metadata.consent`, `metadata.retention` fields
(`dataset-governance-metadata` audit item).

- [ ] **Consent instrument** recorded (`consent.instrument`, `consent.date`) and
      covers secondary analysis of discourse/interaction data.
- [ ] **Purpose** stated and the analysis stays within it (`consent.scope`).
- [ ] **Retention policy** recorded (`retention.policy`); raw transcripts and
      derived matrices have a deletion plan.
- [ ] For minors / classroom data: institutional ethics / IRB approval on file.

## B. Pseudonymisation & access · 假名化与访问

Maps to `metadata.pseudonymization`.

- [ ] Person IDs are **opaque** (`pseudonymization.personIdPolicy = "opaque"`);
      the roster mapping is **not stored** in the dataset
      (`pseudonymization.rosterMapping = "not-stored"`).
- [ ] No real names, emails, or free-text PII in `label`, `evidence`, or segment
      `text` fields exported in the review packet.
- [ ] Access to the runtime bundle / review packet is limited to the research team.

## C. Coding provenance & reliability · 编码溯源与信度

- [ ] Every coded segment traces raw → cleaned → segmented → coded → matrices →
      report (evidence ledger intact).
- [ ] Human coding has **inter-rater reliability** (Cohen's κ / Krippendorff α ≥
      the 0.6/0.8 gate); AI-assisted coding has a **held-out human audit** and
      records coder/source + version.
- [ ] Codebook records definition, inclusion/exclusion rules, examples, and
      version/hash. Coding *consistency* is not claimed as construct *validity*.

## D. Human–AI provenance (if any actor is AI) · Human–AI 溯源

Only if the dataset includes an AI participant.

- [ ] AI actors are typed as `ai_agent` (not silently placed in `people`); model
      provider / snapshot / config-version / prompt-hash recorded where available,
      `not_exposed` where not.
- [ ] AI instances are per-group/session (no global AI super-hub).
- [ ] A `B_PC` transpose is **not** reported as independent code → person uptake;
      uptake is coded from explicit adoption/challenge/rejection evidence.
- [ ] Measurement non-invariance checked: AI text length/density does not
      mechanically dominate B/G/W (binary-presence vs count sensitivity run).

## E. Valid analysis units & inference · 有效分析单位与推断

- [ ] Independent/assignment units are declared (student / group / class /
      session) — **turns, segments, and edges are records, not samples**.
- [ ] Any inference uses permutation/bootstrap over *valid units*; repeated runs
      of one model are not counted as new learners.
- [ ] Window mode, normalization, and α/β/γ are **declared with rationale** and a
      sensitivity check is attached
      (`sena-parameter-sensitivity-*.md`).

## F. Interpretation guardrails · 解释护栏 (prohibited claims)

- [ ] Report does **not** claim: causation from co-occurrence; understanding from
      code presence; quality from centrality/G; peer influence without ruling out
      selection/homophily; generalisation from a single class/group/deployment.
- [ ] Report states `A_fusion` is a normalized typed supra-adjacency, not a causal
      model, and Joint-layout distance is not an inferential statistic.

---

**Sign-off.** Domain expert: ____________  Date: ________
Coding reliability reviewer: ____________  Date: ________

## References

- Drachsler, H., & Greller, W. (2016). Privacy and analytics — it's a DELICATE
  issue. *LAK 2016*. https://doi.org/10.1145/2883851.2883893
- Pardo, A., & Siemens, G. (2014). Ethical and privacy principles for learning
  analytics. *BJET, 45*(3). https://doi.org/10.1111/bjet.12152
