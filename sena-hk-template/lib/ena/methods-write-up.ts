import type { DimensionComparison } from "./comparison";
import { effectiveEnaMinWeight } from "./results";
import type { EnaMapping, EnaRunOptions, EnaRunResult } from "./types";

/**
 * webENA's Stats > Theory & Methods: a methods paragraph generated from the
 * model that is loaded.
 *
 * Every number comes from the run — parameters, counts, variance shares, and
 * any comparison the researcher has on screen. Nothing is filled in from a
 * template, because a methods section that says something the run did not do is
 * worse than no methods section.
 */

export type MethodsWriteUpInput = {
  result: EnaRunResult | null;
  mapping: EnaMapping;
  options: Required<EnaRunOptions>;
  groupBy: string;
  minWeight: number;
  comparisons: DimensionComparison[];
  /**
   * True when the mapping or options changed after `result` was fitted, so the
   * two no longer describe the same analysis (FA13-NEW-2). Required, not
   * optional: this function reads live inputs and a frozen run side by side and
   * interleaves them inside single sentences, so whether they still agree is
   * something every caller has to have answered.
   */
  stale: boolean;
};

/**
 * What replaces the paragraph when the inputs have moved on.
 *
 * Refusing is the whole point of the module: the write-up is composed from the
 * live mapping and options *and* the frozen run, so once those disagree every
 * sentence that mixes them is false in a way no reader could detect. Suppressing
 * the copy is not a fallback here — it is the only honest output.
 */
export const ENA_METHODS_WRITE_UP_STALE =
  "The mapping or accumulation options changed after this model was fitted, so the analysis on screen was not computed from the settings now shown, and a methods paragraph mixing the two would describe an analysis that never ran. Re-run the model to generate its write-up. Nothing has been lost: the fitted model is still plotted, and restoring the settings it ran on brings the write-up back.";

function list(values: string[]) {
  if (values.length === 0) return "none";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function windowSentence(options: Required<EnaRunOptions>) {
  if (options.window === "Conversation") {
    return "Connections were accumulated across whole conversations (an infinite stanza window).";
  }
  const forward = options.windowSizeForward > 0 ? ` and ${options.windowSizeForward} forward` : "";
  return `Connections were accumulated in a moving stanza window of ${options.windowSizeBack} line${options.windowSizeBack === 1 ? "" : "s"} back${forward}.`;
}

function formatP(value: number) {
  if (!Number.isFinite(value)) return "p not available";
  return value < 0.001 ? "p < .001" : `p = ${value.toFixed(3)}`;
}

export function buildEnaMethodsWriteUp({
  result,
  mapping,
  options,
  groupBy,
  minWeight,
  comparisons,
  stale
}: MethodsWriteUpInput) {
  if (!result) {
    return "Run the model to generate a methods write-up describing this analysis.";
  }

  if (stale) {
    return ENA_METHODS_WRITE_UP_STALE;
  }

  const { summary, set } = result;
  const dimensions = summary.dimensions;
  const shares = dimensions
    .map((dimension) => `${dimension} ${((set.variance[dimension] ?? 0) * 100).toFixed(1)}%`)
    .join(", ");

  const paragraphs: string[] = [];

  paragraphs.push(
    `Epistemic Network Analysis was applied to ${summary.rows} coded line${summary.rows === 1 ? "" : "s"} using jena-js, a JavaScript implementation of the rENA model. Units of analysis were defined by ${list(mapping.units)}; conversations were bounded by ${list(mapping.conversation)}; and ${mapping.codes.length} code${mapping.codes.length === 1 ? "" : "s"} were included (${list(mapping.codes)}). This yielded ${summary.units} unit${summary.units === 1 ? "" : "s"} of analysis.`
  );

  paragraphs.push(
    `${windowSentence(options)} Connection strengths were ${options.weightBy === "binary" ? "binarized, so a connection counts once per window regardless of how often it recurs" : "summed, so repeated co-occurrences within a window accumulate"}. The ${options.model} model was used, and node positions were fitted with the ${options.nodePositionMethod} method. The resulting space was rotated with a singular value decomposition and ${options.dimensions} dimension${options.dimensions === 1 ? "" : "s"} retained; the displayed dimensions explain ${shares} of the variance in the space.`
  );

  // The renderer always suppresses below its floor, so this sentence is always
  // true and therefore always written — a dropped edge must never be
  // undisclosed. The parenthetical marks the threshold as a default rather
  // than a researcher choice when the slider did not raise it.
  const effectiveMinWeight = effectiveEnaMinWeight(minWeight);
  const fitSentence =
    ` Connections with a mean weight at or below ${effectiveMinWeight.toFixed(3)} were suppressed from the network graph${
      minWeight > 0 ? "" : " (the renderer's default noise floor)"
    }; this affects the drawn network only, not the projection or node positions.`;
  const groupSentence = groupBy
    ? ` Units were grouped by ${groupBy}, and a mean network and mean point were plotted for each group.`
    : "";
  paragraphs.push(`${groupSentence}${fitSentence}`.trim());

  if (comparisons.length > 0) {
    const [first] = comparisons;
    const perDimension = comparisons
      .map((row) => {
        if (row.parametric.degenerate) {
          return `${row.dimension} could not be tested (${row.left.n} and ${row.right.n} observations)`;
        }
        const exactness =
          row.nonParametric.method === "exact" ? "exact" : "normal-approximation";
        return `on ${row.dimension}, ${row.left.group} (M = ${row.left.mean.toFixed(2)}, SD = ${row.left.sd.toFixed(2)}) against ${row.right.group} (M = ${row.right.mean.toFixed(2)}, SD = ${row.right.sd.toFixed(2)}) gave t(${row.parametric.df.toFixed(1)}) = ${row.parametric.t.toFixed(2)}, ${formatP(row.parametric.p)}, d = ${row.parametric.cohensD.toFixed(2)}, with a Mann-Whitney U of ${row.nonParametric.u.toFixed(1)}, ${formatP(row.nonParametric.p)} (${exactness})`;
      })
      .join("; ");

    paragraphs.push(
      `Groups were compared on the projected coordinates, one observation per unit, with two-sided tests: ${perDimension}. Both a parametric (Welch) and a rank-based test are reported because ${first.left.n} and ${first.right.n} observations are too few to rely on normality.`
    );
  }

  paragraphs.push(
    `The analysis ran through the ${summary.runtime === "worker" ? "in-browser worker" : "server API"} in ${summary.elapsedMs}ms.`
  );

  return paragraphs.join("\n\n");
}
