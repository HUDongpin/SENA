/**
 * The one place SENA's four analytic channels — S, W, B, G — decide what colour
 * they are.
 *
 * Two values per channel, because a 1px line on paper and a 6px chip on a
 * tinted plate are not read under the same conditions. `stroke` is what a mark
 * on the ENA plane, the A1 canvas, the Temporal Fusion Arc or the timeline
 * trace paints itself with; all four surfaces sit on white, and the bright set
 * those marks used to carry (#2f73ff / #735cf6 / #24dcee / #fb7185) was tuned
 * for the dark shell they used to live in. The strokes below are the 2026-08-08
 * re-step, validated against all six dataviz palette checks on white —
 * including the deutan separation the shipped S/W pair failed at ΔE 1.5.
 *
 * `chip` is that bright literal, unchanged: layer keys, inspector badges and
 * marketing swatches keep it (ADR 0009 Q4 scoped the re-step to strokes, so the
 * product's colour identity survives the readability fix). Recording both here
 * makes the split a decision one file states, rather than a discrepancy spread
 * across a dozen components that no reader can tell from a mistake.
 */

/**
 * Three of these are `SenaLayer` values; `pair` is not. G is a per-pair
 * contribution report rather than an edge layer, so it has no `SenaLayer`
 * member — but it is a channel a reader sees and must be able to name, and the
 * layer key, the timeline trace and the arc all draw it.
 */
export type SenaLayerPaletteChannel = "social" | "concept" | "bridge" | "pair";

export type SenaLayerPaletteEntry = {
  /** The channel's token in `A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]`, plus G. */
  token: "S" | "W" | "B" | "G";
  /** Plot marks on white paper. Validated 2026-08-08; do not re-step one in isolation. */
  stroke: string;
  /** Chips, inspector badges, marketing swatches — the pre-P5 bright set (Q4). */
  chip: string;
};

export const senaLayerPalette: Record<SenaLayerPaletteChannel, SenaLayerPaletteEntry> = {
  social: { token: "S", stroke: "#2451CC", chip: "#2f73ff" },
  concept: { token: "W", stroke: "#A06BF5", chip: "#735cf6" },
  bridge: { token: "B", stroke: "#0891B2", chip: "#24dcee" },
  pair: { token: "G", stroke: "#DB2777", chip: "#fb7185" }
};

const senaLayerPaletteEntries = Object.entries(senaLayerPalette) as Array<
  [SenaLayerPaletteChannel, SenaLayerPaletteEntry]
>;

/** `senaLayerStrokes.social` reads better inside JSX than the full entry does. */
export const senaLayerStrokes = Object.fromEntries(
  senaLayerPaletteEntries.map(([channel, entry]) => [channel, entry.stroke])
) as Record<SenaLayerPaletteChannel, string>;

export const senaLayerChips = Object.fromEntries(
  senaLayerPaletteEntries.map(([channel, entry]) => [channel, entry.chip])
) as Record<SenaLayerPaletteChannel, string>;

/**
 * The cyan accent (the shell's `cyanGlow`) that outlines a person hexagon, a
 * unit-identity marker and an active-phase plate. Not a channel — nothing is
 * measured in it — so the P5 re-step leaves its value exactly where P0–P2 left
 * it and only gives it a home. That it equals B's chip today is history, not a
 * rule: a person node is not a bridge, and the two are free to diverge.
 */
export const senaPlotAccentStroke = "#24dcee";
