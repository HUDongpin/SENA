import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaTemporalWindow, SenaVisualGrammarArtifact, SenaVisualGrammarItem, SenaVisualGrammarReferenceAsset } from "./types";

export const senaVisualGrammar: SenaVisualGrammarItem[] = [
  {
    id: "fusion-canvas-a1",
    label: "A1 Inner Solid Mesh Fusion Canvas",
    visualEncoding: "S uses thick blue outer-orbit social arcs around hexagonal person nodes; W uses solid purple links inside the concept space between circular ENA concept nodes; B uses translucent cyan person-code bridge ribbons; G uses low-emphasis contribution arcs in reports. S/W/B line thickness is scaled within the active visible layer from auditable edge salience, so stronger SNA ties, ENA co-occurrences, and person-code bridges read as heavier strokes; when active W weights are tied, concept-pair G contribution provides a transparent tie-breaker for ENA stroke emphasis. Day-mode readability is protected with light link halos and on-demand high-contrast label plates: node labels are hidden by default, and selecting a person or concept node reveals only that selected node label.",
    dataMapping: "S maps to person-person social ties, W maps to code-code ENA co-occurrence links, B maps to person-code contribution weights, and G maps to person-code-pair explanatory contributions. Rendered S/W/B links expose weight, normalized weight, scaled weight, visual salience, and visual stroke width as data attributes for auditability.",
    interpretationRole: "Supports integrated inspection of the normalized typed heterogeneous graph while preserving traditional ENA solid concept links.",
    guardrail: "Visual distance and arc placement are explanatory layout choices; inspect report matrices, weights, normalization, runtime provenance, and evidence before making research claims."
  },
  {
    id: "temporal-fusion-arc",
    label: "Temporal Fusion Arc",
    visualEncoding: "Plan, Teach, and Reflect phases are shown as clickable story panels with concept hexes, actor nodes, S/W/B/G metric bars, bridge/concept transition curves, rose G pair-contribution arcs, top G pair labels, and adjacent-window transition evidence.",
    dataMapping: "Phase panels use temporal windows, top code weights, evidence person IDs, turn ranges, evidence counts, normalized social, concept, and bridge temporal metrics, plus temporal runtime G matrix totals, active person-code-pair counts, strongest G pair labels, lead contributors, and adjacent-window S/W/B/G/A_fusion deltas.",
    interpretationRole: "Helps researchers narrate how epistemic moves, social-epistemic bridges, and person-code-pair contribution patterns develop across lesson-study windows.",
    guardrail: "Temporal Fusion Arc is a narrative and inspection view; it should not be used as evidence of causal sequence without temporal design, coding reliability, and human review."
  },
  {
    id: "workspace-shell-c3-collapsed-switcher",
    label: "C3 Workspace Shell with Collapsed Plot Switcher",
    visualEncoding: "The SENA Workspace shell follows the ENA official workbench pattern with a left Sets/Model/Plot Tools/Stats rail, a dominant central plot canvas, right-side Primary Plot and Secondary Plot viewports, a bottom Data View drawer under the central plot, and a collapsed Plots switcher that replaces six persistent plot pills with one expandable plot-control entry. The left rail uses compact Apple-style glass tiles with semantic icons for Sets, Model, Plot Tools, and Stats; the Model tile uses the adopted Layer Stack glyph for model layers and fusion structure, the Stats tile uses the adopted Network Metrics glyph combining graph nodes with metric bars, and the Stats panel includes a compact metric provenance summary before metric interpretation.",
    dataMapping: "The central canvas carries the active Temporal Fusion, Fusion A1, ENA Space, SNA, Evidence, or Matrix plot; the bottom Data View drawer maps directly to utterances, coded_segments, interactions, active-window labels, and S/W/B counts without replacing the graph; the right viewports keep synchronized supporting plots visible; the left rail maps to workflow context and plot tooling rather than data results. The Stats provenance summary maps metric counts to direct jSNA, jENA, SENA-implemented, and SENA composite source categories.",
    interpretationRole: "Defines the target workspace shell for making SENA's multi-plot research value legible without crowding the primary analytical view.",
    guardrail: "This shell is a product-workspace layout reference. It should not be interpreted as analysis output, and live implementation must preserve keyboard access, visible labels, and the current export/report provenance gates."
  }
];

export const senaVisualGrammarReferenceAssets: SenaVisualGrammarReferenceAsset[] = [
  {
    id: "a1-inner-solid-mesh-mockup",
    label: "A1 Inner Solid Mesh mockup",
    path: "output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png",
    bytes: 730212,
    sha256: "fa123f9d29c4df8a62d02acf85045761749a3170a554b054ff5006498f1bb399",
    role: "adopted-reference",
    relatedGrammarId: "fusion-canvas-a1",
    note: "Adopted main Fusion Canvas direction: solid purple ENA W mesh inside the concept space with blue SNA outer-orbit arcs."
  },
  {
    id: "a2-dual-rail-ena-mockup",
    label: "A2 Dual-Rail ENA mockup",
    path: "output/sena-fusion-design-options/sena-fusion-option-a2-dual-rail-ena.png",
    bytes: 729332,
    sha256: "8ed3e8a9bfc3865ed732bb27b67a1653c99c300b0fe6ca392a21e39b5e096122",
    role: "alternative-reference",
    relatedGrammarId: "fusion-canvas-a1",
    note: "Alternative A reference retained for stronger S/W line-style differentiation if dense datasets need it."
  },
  {
    id: "a3-white-core-ena-mockup",
    label: "A3 White-Core ENA mockup",
    path: "output/sena-fusion-design-options/sena-fusion-option-a3-white-core-ena.png",
    bytes: 754582,
    sha256: "5bce6cdd3a611569a93006ee1cccb083b331f46bcf00d620d030957c14597b74",
    role: "alternative-reference",
    relatedGrammarId: "fusion-canvas-a1",
    note: "Alternative A reference retained for dense overlapping concept links that need extra legibility."
  },
  {
    id: "temporal-fusion-arc-mockup",
    label: "Temporal Fusion Arc mockup",
    path: "output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png",
    bytes: 675378,
    sha256: "0bb2ca6c5e9418e90572cfd956bcbfcbde34ec4d27aa3946cc8433a7048bb4bb",
    role: "adopted-reference",
    relatedGrammarId: "temporal-fusion-arc",
    note: "Adopted Temporal Fusion direction for Plan, Teach, and Reflect lesson-study storytelling."
  },
  {
    id: "workspace-shell-c3-collapsed-switcher-mockup",
    label: "C3 Workspace Shell collapsed plot switcher mockup",
    path: "output/sena-workspace-layout-options/sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher.png",
    bytes: 145251,
    sha256: "bc7c350686c6f3e3af9f0ed3acd3fcaee10bc423cd8be95a36bf88010392d7aa",
    role: "adopted-reference",
    relatedGrammarId: "workspace-shell-c3-collapsed-switcher",
    note: "Adopted SENA Workspace shell direction: ENA-inspired workbench with a dominant Temporal Fusion canvas, right-side Primary/Secondary plot viewports, collapsed plot switcher, and compact glass semantic rail icons."
  }
];

export type SenaVisualGrammarArtifactOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
};

export function buildSenaVisualGrammarArtifact(
  options: SenaVisualGrammarArtifactOptions = {}
): SenaVisualGrammarArtifact {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.visualGrammar,
    title: options.title?.trim() || "SENA Visual Grammar",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    workspaceRoute: "/workspace/sena",
    analysisWindow: options.activeTemporalWindow ?? null,
    visualGrammar: senaVisualGrammar,
    referenceAssets: senaVisualGrammarReferenceAssets,
    notes: [
      "This artifact records the adopted explanatory visual encodings for the local SENA research pilot.",
      "It preserves the A1 Inner Solid Mesh distinction between solid ENA W links and outer-orbit SNA S arcs, with layer-relative weighted stroke widths, readable link halos, and on-demand selected-node label plates for day-mode inspection.",
      "It preserves the Temporal Fusion Arc direction for narrating Plan, Teach, and Reflect lesson-study windows with S/W/B/G visual signals.",
      "It records the C3 Workspace Shell direction for the future /workspace/sena workbench: dominant central plot, right-side Primary/Secondary viewports, bottom Data View drawer, collapsed plot switcher, compact Apple-style glass semantic rail icons, and a Stats metric provenance summary for direct jSNA, jENA, SENA-implemented, and composite metrics.",
      "Visual grammar supports inspection and reporting, but matrix exports, runtime provenance, evidence, and human review remain authoritative for research interpretation."
    ]
  };
}
