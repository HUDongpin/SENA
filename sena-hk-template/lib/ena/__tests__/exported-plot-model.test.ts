import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ena } from "jena-js";
import type { ENAPlotModel } from "jena-js/plot";
import { parseCsv } from "../csv";
import { sampleEnaCsv } from "../sample-data";
import { buildEnaMethodsWriteUp } from "../methods-write-up";
import { buildEnaPlotModel, buildEnaRunResult, enaResultForExport } from "../results";
import { defaultEnaOptions, inferEnaMapping, prepareEnaRun } from "../validation";
import { canPublishEnaResult, enaRunInputFingerprint, isEnaResultStale } from "../../../app/workspace/ena/run-lifecycle";
import type { EnaRunResult } from "../types";

// FA13-NEW-2, second artifact class: the JSON export shipped the plot model the
// run was *fitted* with, not the one on screen.
//
// `result.plotModel` is built once, at run time, from `request.composition`;
// buildEnaPlotModel consumes both `groupBy` (the group-mean traces) and
// `minWeight` (the network threshold). Composition is deliberately outside the
// staleness stamp — the drawn figure and the Methods write-up both follow those
// two controls live — so moving them raises no banner and leaves the result
// publishable, which is correct for the plot and was not correct for the
// export: it serialised the frozen model verbatim. The researcher then held a
// figure spec and a methods paragraph, exported together, describing two
// different networks.
//
// Chosen fix: export the model that is drawn (`composedPlotModel`), not the one
// that was fitted. The alternatives were dropping plotModel from the payload
// (which costs the researcher the figure spec the export exists to provide) and
// gating the JSON button on a composition-aware stamp (which would demand a
// re-run for a slider nudge — the exact nagging the exclusion avoids).

const parsed = parseCsv(sampleEnaCsv);

/** Group By and a threshold the sample dataset actually responds to. */
const GROUP_BY = "stage";
const MIN_WEIGHT = 0.15;

function groupTraceNames(model: ENAPlotModel) {
  return model.traces.filter((trace) => trace.type === "group").map((trace) => trace.name);
}

function networkEdgeWeights(model: ENAPlotModel) {
  const network = model.traces.find((trace) => trace.type === "network");
  return (network?.network?.edges ?? []).map((edge) => Math.abs(edge.weight));
}

/**
 * The workspace as it stands after a run, driven through the production
 * functions: the run through `buildEnaRunResult`, the drawn figure through
 * `buildEnaPlotModel` exactly as the `composedPlotModel` memo builds it, and
 * the download payload through `enaResultForExport`. Re-implementing any of
 * those here would pass while the workspace still wrote the wrong file.
 */
function workspaceAfterRun(ranWith: { groupBy?: string; minWeight?: number }) {
  const mapping = inferEnaMapping(parsed.headers, parsed.rows);
  const options = { ...defaultEnaOptions };
  const prepared = prepareEnaRun({ rows: parsed.rows, mapping, options });
  const composition =
    ranWith.groupBy || ranWith.minWeight
      ? { ...(ranWith.groupBy ? { groupBy: ranWith.groupBy } : {}), ...(ranWith.minWeight ? { minWeight: ranWith.minWeight } : {}) }
      : undefined;
  const result: EnaRunResult = buildEnaRunResult(
    ena(prepared.options),
    parsed.rows.length,
    "worker",
    7,
    prepared.warnings,
    composition
  );
  const stamp = enaRunInputFingerprint({ mapping, options });

  return {
    mapping,
    options,
    result,
    /** EnaWorkspaceClient's composedPlotModel, for the subtraction-off path. */
    compose: (groupBy: string, minWeight: number) =>
      buildEnaPlotModel(result.set, {
        ...(groupBy ? { groupBy } : {}),
        ...(minWeight > 0 ? { minWeight } : {})
      }),
    provenance: () => ({ hasResult: true, ranWith: stamp, live: enaRunInputFingerprint({ mapping, options }) }),
    writeUp: (groupBy: string, minWeight: number) =>
      buildEnaMethodsWriteUp({
        result,
        mapping,
        options,
        groupBy,
        minWeight,
        comparisons: [],
        stale: isEnaResultStale({ hasResult: true, ranWith: stamp, live: enaRunInputFingerprint({ mapping, options }) })
      })
  };
}

describe("the JSON export carries the drawn figure, not the fitted one (FA13-NEW-2)", () => {
  it("exports the group traces the figure is drawing, not the none it was fitted with", () => {
    // The reported reproduction: run with Group By empty and the slider at 0,
    // then set Group By and raise the slider.
    const workspace = workspaceAfterRun({});
    const drawn = workspace.compose(GROUP_BY, MIN_WEIGHT);

    // Preconditions, so this test cannot pass by the two models being identical.
    expect(groupTraceNames(workspace.result.plotModel)).toHaveLength(0);
    expect(groupTraceNames(drawn).length).toBeGreaterThan(0);

    const exported = JSON.parse(JSON.stringify(enaResultForExport(workspace.result, drawn))) as EnaRunResult;

    expect(groupTraceNames(exported.plotModel)).toEqual(groupTraceNames(drawn));
  });

  it("exports the threshold the Methods paragraph states", () => {
    const workspace = workspaceAfterRun({});
    const drawn = workspace.compose(GROUP_BY, MIN_WEIGHT);

    const fitted = networkEdgeWeights(workspace.result.plotModel);
    const drawnWeights = networkEdgeWeights(drawn);
    // The slider genuinely bites on this dataset: the fitted network keeps
    // edges the drawn one suppresses.
    expect(Math.min(...fitted)).toBeLessThanOrEqual(MIN_WEIGHT);
    expect(drawnWeights.length).toBeGreaterThan(0);
    expect(fitted.length).toBeGreaterThan(drawnWeights.length);

    const exported = JSON.parse(JSON.stringify(enaResultForExport(workspace.result, drawn))) as EnaRunResult;
    const exportedWeights = networkEdgeWeights(exported.plotModel);

    expect(exportedWeights).toEqual(drawnWeights);
    // Stated as the paragraph states it: nothing at or below the threshold
    // survives into the exported network graph.
    const writeUp = workspace.writeUp(GROUP_BY, MIN_WEIGHT);
    expect(writeUp).toContain(`Units were grouped by ${GROUP_BY}`);
    expect(writeUp).toContain(`at or below ${MIN_WEIGHT.toFixed(3)} were suppressed`);
    for (const weight of exportedWeights) expect(weight).toBeGreaterThan(MIN_WEIGHT);
  });

  it("hands over the drawn model itself, whatever the composition put in it", () => {
    // Identity rather than a field-by-field comparison: the drawn model is also
    // where the subtracted comparison network lives (withEnaSubtractionNetwork),
    // and the export must follow the figure wherever composition takes it
    // instead of re-deriving a second opinion about what is on screen.
    const workspace = workspaceAfterRun({});
    const drawn = workspace.compose(GROUP_BY, MIN_WEIGHT);

    expect(enaResultForExport(workspace.result, drawn).plotModel).toBe(drawn);
  });

  it("leaves the set, the summary and the warnings as the run produced them", () => {
    // Only the figure spec is recomposed. The points/connections CSVs export
    // the fitted quantities, and the JSON must not disagree with them.
    const workspace = workspaceAfterRun({});
    const exported = enaResultForExport(workspace.result, workspace.compose(GROUP_BY, MIN_WEIGHT));

    expect(exported.set).toBe(workspace.result.set);
    expect(exported.summary).toEqual(workspace.result.summary);
    expect(exported.warnings).toEqual(workspace.result.warnings);
  });

  it("keeps the fitted model when nothing has been composed", () => {
    // composedPlotModel is null only when there is no result to draw; the
    // fallback keeps the export defined rather than shipping a payload with no
    // figure in it at all.
    const workspace = workspaceAfterRun({ groupBy: GROUP_BY });
    expect(enaResultForExport(workspace.result, null).plotModel).toBe(workspace.result.plotModel);
  });

  it("recomposes even when the run was started with a composition of its own", () => {
    // The fitted model is not stale only when composition started empty. A run
    // started grouped, then regrouped, freezes the *first* grouping.
    const workspace = workspaceAfterRun({ groupBy: GROUP_BY, minWeight: MIN_WEIGHT });
    expect(groupTraceNames(workspace.result.plotModel).length).toBeGreaterThan(0);

    const drawn = workspace.compose("", 0);
    const exported = enaResultForExport(workspace.result, drawn);

    expect(groupTraceNames(exported.plotModel)).toHaveLength(0);
    expect(networkEdgeWeights(exported.plotModel).length).toBeGreaterThan(
      networkEdgeWeights(workspace.result.plotModel).length
    );
  });

  it("still asks nobody to re-run for a composition change", () => {
    // Pins the option that was chosen over an export-only stamp: moving Group
    // By or the slider leaves the result publishable and unmarked. The export
    // is made correct by recomposing it, not by refusing it.
    const workspace = workspaceAfterRun({});
    expect(isEnaResultStale(workspace.provenance())).toBe(false);
    expect(canPublishEnaResult(workspace.provenance())).toBe(true);

    const stamp = enaRunInputFingerprint({ mapping: workspace.mapping, options: workspace.options });
    expect(stamp).not.toContain("groupBy");
    expect(stamp).not.toContain("minWeight");
  });
});

/**
 * Slice a `function name(...) { ... }` body out of a source file by counting
 * braces from its opening one.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} not found in EnaWorkspaceClient.tsx`).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

describe("EnaWorkspaceClient serialises the composed model", () => {
  const source = readFileSync(join(process.cwd(), "app/workspace/ena/EnaWorkspaceClient.tsx"), "utf8");

  it("passes the drawn model into the JSON export", () => {
    // The behaviour above is enaResultForExport's; this pins the call site,
    // which is where the defect was. Without it the helper can be perfect and
    // simply not called, with this suite still green.
    const body = functionBody(source, "exportResultJson");
    expect(body).toContain("enaResultForExport(result, composedPlotModel)");
  });

  it("does not stringify the fitted result directly", () => {
    expect(functionBody(source, "exportResultJson")).not.toContain("JSON.stringify(result,");
  });

  it("keeps the CSV exports on the fitted quantities", () => {
    // Composition does not touch the projection or the connection counts, so
    // these two must keep exporting result.set and must not be "fixed" too.
    expect(functionBody(source, "exportPointsCsv")).toContain("result.set.points");
    expect(functionBody(source, "exportConnectionsCsv")).toContain("result.set.connectionCounts");
  });

  it("still gates the JSON export on the staleness answer", () => {
    // Recomposing the figure fixes the composition mismatch; it says nothing
    // about a mapping or option change, which must still hold the export.
    expect(functionBody(source, "exportResultJson")).toContain("resultIsPublishable");
  });
});
