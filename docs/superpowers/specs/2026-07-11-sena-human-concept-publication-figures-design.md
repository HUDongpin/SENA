# SENA Human–Human and Concept–Concept Publication Figures Design

Date: 2026-07-11

Status: User-approved design direction

Owner lane: SENA-A06 Fusion Workspace UI and Visual Grammar, coordinated with SENA-A02 runtime semantics and SENA-A11 verification

## Objective

Use the current SENA runtime and the bundled lesson-study collaborative-learning sample to create publication-ready figures that represent:

1. overall Human–Human relationships;
2. overall Concept–Concept relationships; and
3. Plan–Teach–Reflect changes in both relationship layers.

The figure set must preserve the distinction between the social matrix S and the epistemic co-occurrence matrix W. It must not imply that the displayed networks are causal models or that visual distance is an inferential result.

## Source Data

The only input dataset is:

    sena-hk-template/public/sena-pilot/sample/lesson-study-sena-contract.json

The bundled sample is synthetic and contains:

- 4 participants: Ms Lee, Mr Chan, Dr Wong, and Ms Ho;
- 7 concepts: Question, Hypothesis, Evidence, Explanation, Critique, Reflection, and Coordination;
- 8 directed interaction records;
- 10 utterances;
- 10 coded segments; and
- three stages: Plan, Teach, and Reflect.

The generator must read this JSON contract and pass it to the current SENA model code. It must not duplicate the S/W construction algorithms in a separate figure-only implementation.

## Runtime Configuration

The figure generator uses these declared SENA options:

    normalization: max
    bridgeWeightRule: count
    direction: directed
    undirectedSocial: false
    temporal.mode: stage
    seed: 0

The full model supplies the overall S and W matrices. For temporal panels, the generator uses the SENA stage windows to scope the dataset, then runs the same model builder for each stage. Raw matrix weights drive visible edge widths; normalized values and runtime identifiers remain in the figure data and manifest.

## Selected Visual Direction

The approved direction is separation-first:

- S and W are presented as independent overall figures.
- Temporal S and W are paired in a shared small-multiple plate.
- B, B_PC, B_CP, G, and fusion edges are not drawn in the main figure set.
- Captions state that the figures isolate two SENA layers for interpretability.

This direction favors peer-review readability over a dense integrated supra-network.

## Figure 1: Overall Human–Human Network

Filename stem:

    figure-1-human-human-overall

Design:

- white background;
- fixed circular participant layout;
- rounded-rectangle participant nodes;
- blue directed arcs with arrowheads;
- reverse-curved paths for reciprocal pairs;
- line width proportional to raw interaction weight using one declared S scale;
- compact numeric edge labels with white halos;
- full participant labels plus roles;
- legend explaining direction and edge-width scale;
- subtitle identifying the S matrix, directed analysis, and full-conversation scope.

The layout is deterministic. Participant locations do not depend on force simulation and therefore remain reproducible.

## Figure 2: Overall Concept–Concept Network

Filename stem:

    figure-2-concept-concept-overall

Design:

- white background;
- fixed circular concept layout;
- circular concept nodes using the codebook colors;
- solid purple undirected W links, consistent with the adopted SENA visual grammar;
- line width proportional to raw code co-occurrence;
- fixed node size to avoid conflating code prevalence with network position;
- external labels with short leader lines where needed;
- legend explaining W, co-occurrence weight, and the absence of causal direction;
- subtitle identifying unit-scoped stanza co-occurrence over the full conversation.

All non-zero W edges are retained. Low-weight edges use reduced opacity so the strongest Evidence–Explanation, Evidence–Critique, and Explanation–Critique relationships remain legible.

## Figure 3: Temporal Paired Small Multiples

Filename stem:

    figure-3-temporal-paired-small-multiples

Design:

- a 2 × 3 panel plate;
- columns: Plan, Teach, Reflect;
- top row: Human–Human S;
- bottom row: Concept–Concept W;
- fixed participant positions across all top-row panels;
- fixed concept positions across all bottom-row panels;
- global S width scale shared by all S panels;
- global W width scale shared by all W panels;
- inactive nodes retained in a muted state to preserve positional comparison;
- stage-level counts shown in a compact header;
- shared legend rather than repeated panel legends;
- no edge labels inside small panels.

The panel design supports visual comparison of changing relationships without suggesting that panel-to-panel change is causal.

## Publication Styling

- SVG is the authoritative vector format.
- PNG is rendered from each SVG at high resolution.
- Figure 1 and Figure 2 use a 3:2 landscape canvas suitable for journal double-column placement.
- Figure 3 uses a wider 5:3 canvas suitable for a full-width figure.
- Typography uses Arial/Helvetica-compatible system fonts with no external font dependency.
- Minimum final-size text is equivalent to approximately 8 pt.
- Human nodes and concept nodes use both different shapes and different colors.
- S and W edges remain distinguishable without relying only on color.
- All backgrounds are opaque white.
- No shadows, gradients, decorative glows, or UI chrome appear in manuscript figures.

## Outputs

The generator writes to:

    sena-hk-template/output/sena-publication-figures-human-concept/

Required artifacts:

    figure-1-human-human-overall.svg
    figure-1-human-human-overall.png
    figure-2-concept-concept-overall.svg
    figure-2-concept-concept-overall.png
    figure-3-temporal-paired-small-multiples.svg
    figure-3-temporal-paired-small-multiples.png
    figure-data.json
    figure-manifest.json
    captions.md

The manifest records:

- dataset version and content hash;
- SENA configuration;
- runtime matrix labels and values;
- stage order;
- artifact filenames, dimensions, byte counts, and SHA-256 hashes;
- generation timestamp;
- interpretation guardrails.

The captions document the dataset as synthetic and define S and W explicitly.

## Implementation Structure

Add a focused generator:

    sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts

Add one package command:

    sena:figures:human-concept

The generator contains four bounded responsibilities:

1. load and validate the bundled sample;
2. build overall and stage-scoped SENA models;
3. create deterministic SVG figures from model outputs; and
4. render PNGs and write the manifest/data/caption artifacts.

SVG helpers remain private to the generator unless another publication workflow demonstrates a real reuse need.

## Error Handling

Generation fails with a non-zero exit when:

- the sample file is missing or invalid JSON;
- required people, codes, interactions, coded segments, or stages are absent;
- the runtime does not return S or W labels/matrices;
- matrix dimensions do not match labels;
- Plan, Teach, or Reflect cannot be resolved;
- SVG output lacks a required title, node label, or legend;
- PNG rendering fails;
- artifact hashes cannot be computed.

The generator does not silently invent missing stages, participants, codes, or matrix entries.

## Verification

Automated verification must prove:

1. the generator exits successfully;
2. all nine required artifacts exist and are non-empty;
3. overall S/W matrices in figure-data.json equal fresh current-runtime outputs;
4. the three temporal stages are present in Plan–Teach–Reflect order;
5. all four participant labels appear in Figures 1 and 3;
6. all seven concept labels appear in Figures 2 and 3;
7. Figure 1 contains directed arrow markers;
8. Figure 2 W links are solid and have no arrow marker;
9. Figure 3 contains six network panels with shared scales;
10. SVG XML parses and PNG files have the declared dimensions;
11. manifest SHA-256 values match the generated files; and
12. no tracked or unrelated user files are modified by generation.

Visual QA must inspect all three PNGs at full resolution and confirm:

- no clipped titles, labels, legends, or panels;
- no unreadable label overlap;
- reciprocal Human–Human arcs remain distinguishable;
- dense W links remain interpretable;
- stage layouts are positionally stable;
- colors remain readable against white;
- figure meaning remains understandable without the interactive SENA workspace.

## Non-Goals

- No Human–AI nodes are introduced in this figure set.
- No live SENA workspace UI is changed.
- No B/G/fusion network is included in the main figures.
- No causal, inferential, or statistical-significance claim is added.
- No production deployment or external publication submission is performed.
