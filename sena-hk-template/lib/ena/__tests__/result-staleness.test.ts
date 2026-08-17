import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ena } from "jena-js";
import { parseCsv } from "../csv";
import { sampleEnaCsv } from "../sample-data";
import { buildEnaRunResult } from "../results";
import { ENA_METHODS_WRITE_UP_STALE, buildEnaMethodsWriteUp } from "../methods-write-up";
import {
  defaultEnaOptions,
  inferEnaMapping,
  prepareEnaRun,
  sanitizeMapping,
  toggleEnaColumnChip
} from "../validation";
import {
  canPublishEnaResult,
  enaRunInputFingerprint,
  isEnaResultStale,
  runEnaAnalysis,
  supersedeEnaRun,
  type EnaRunToken
} from "../../../app/workspace/ena/run-lifecycle";
import type { EnaMapping, EnaRunOptions, EnaRunResult } from "../types";

// A5 / FA13-NEW-2 (Functional Coverage Ledger, 2026-08-15): a settled analysis
// was never invalidated when its inputs changed.
//
// supersedeEnaRun handles the run *in flight*; its guard returns early when
// nothing is running, so after a run completed, updateMapping / toggleColumn /
// updateOptions changed the inputs and left the finished result on screen with
// nothing marking it. buildEnaMethodsWriteUp then read the live mapping and
// options beside that frozen run and interleaved them inside single sentences
// — "6 codes were included (…)" directly above the same run's "This yielded 6
// units of analysis" and its variance shares — and Copy plus the JSON/points/
// connections exports wrote the composite out as a description of an analysis
// that was never performed. The module's own opening line is the standard it
// failed: a methods section describing something the run did not do is worse
// than no methods section.
//
// Chosen semantics: the settled result is NOT discarded (a stray chip click
// must not throw away completed work). It is marked stale, and everything that
// would turn it into an artifact is held until the researcher re-runs.

const parsed = parseCsv(sampleEnaCsv);

/**
 * The workspace's own state wiring, driven through the production functions
 * rather than re-implemented: the run goes through `runEnaAnalysis`, the chip
 * click through `toggleEnaColumnChip`, the staleness question through
 * `isEnaResultStale`, and the paragraph through `buildEnaMethodsWriteUp`. A
 * local re-implementation of any of those would pass while the workspace was
 * still broken, which is how this defect survived on main.
 */
function createWorkspace() {
  let mapping: EnaMapping = inferEnaMapping(parsed.headers, parsed.rows);
  let options: Required<EnaRunOptions> = { ...defaultEnaOptions };
  let result: EnaRunResult | null = null;
  let resultInputs: string | null = null;
  let isRunning = false;
  const runToken: EnaRunToken = { current: 0 };

  const provenance = () => ({
    hasResult: result !== null,
    ranWith: resultInputs,
    live: enaRunInputFingerprint({ mapping, options })
  });

  // EnaWorkspaceClient.supersedeRunForInputChange, verbatim in behaviour.
  const supersedeRunForInputChange = () => {
    if (!isRunning) return;
    supersedeEnaRun(runToken, {
      teardown: () => {},
      setIsRunning: (value) => { isRunning = value; },
      setProgress: () => {}
    });
  };

  return {
    mapping: () => mapping,
    result: () => result,
    resultInputs: () => resultInputs,
    isStale: () => isEnaResultStale(provenance()),
    canPublish: () => canPublishEnaResult(provenance()),

    async run() {
      await runEnaAnalysis<EnaRunResult>(runToken, {
        initialProgress: 0,
        execute: async () => {
          const prepared = prepareEnaRun({ rows: parsed.rows, mapping, options });
          return buildEnaRunResult(ena(prepared.options), parsed.rows.length, "worker", 7, prepared.warnings, {});
        },
        onSettled: () => {},
        setIsRunning: (value) => { isRunning = value; },
        setProgress: () => {},
        setError: () => {},
        setResult: (value) => { result = value; },
        inputFingerprint: enaRunInputFingerprint({ mapping, options }),
        setResultInputs: (value) => { resultInputs = value; }
      });
    },

    toggleColumn(column: string) {
      supersedeRunForInputChange();
      mapping = toggleEnaColumnChip(mapping, column, parsed.headers);
    },

    updateMapping(partial: Partial<EnaMapping>) {
      supersedeRunForInputChange();
      mapping = sanitizeMapping({ ...mapping, ...partial }, parsed.headers);
    },

    updateOptions(partial: Partial<Required<EnaRunOptions>>) {
      supersedeRunForInputChange();
      options = { ...options, ...partial };
    },

    clear() {
      result = null;
      resultInputs = null;
    },

    writeUp() {
      return buildEnaMethodsWriteUp({
        result,
        mapping,
        options,
        groupBy: "",
        minWeight: 0,
        comparisons: [],
        stale: isEnaResultStale(provenance())
      });
    }
  };
}

describe("a settled analysis outliving its inputs (A5 / FA13-NEW-2)", () => {
  it("never prints the live mapping's code count beside the frozen run's counts", async () => {
    // The reported reproduction, end to end: load the sample, Run to
    // completion, untick one code chip with nothing in flight.
    const workspace = createWorkspace();
    await workspace.run();

    const settled = workspace.result();
    expect(settled).not.toBeNull();
    const ranWithCodes = settled!.summary.codes;
    const ranWithUnits = settled!.summary.units;
    expect(workspace.writeUp()).toContain(`${ranWithCodes} codes were included`);

    workspace.toggleColumn(workspace.mapping().codes[0]);
    expect(workspace.mapping().codes.length).toBe(ranWithCodes - 1);

    // The result is deliberately still here — a stray click must not discard a
    // completed analysis — but it is now marked, and the paragraph refuses.
    expect(workspace.result()).not.toBeNull();
    expect(workspace.isStale()).toBe(true);

    const writeUp = workspace.writeUp();
    expect(writeUp).toBe(ENA_METHODS_WRITE_UP_STALE);
    // The exact composite the ledger caught, asserted directly: the live code
    // count must never share a paragraph with the frozen run's yield.
    expect(
      writeUp.includes(`${workspace.mapping().codes.length} codes were included`) &&
        writeUp.includes(`${ranWithUnits} units of analysis`)
    ).toBe(false);
    expect(writeUp).not.toContain("units of analysis");
    expect(writeUp).not.toContain("of the variance in the space");
  });

  it("holds the clipboard and every export while the result is stale", async () => {
    const workspace = createWorkspace();
    await workspace.run();
    expect(workspace.canPublish()).toBe(true);

    workspace.toggleColumn(workspace.mapping().codes[0]);

    // Copy of the write-up and the JSON / points / connections exports all read
    // this one gate, so none of them can write out a stale projection.
    expect(workspace.canPublish()).toBe(false);
  });

  it("marks the result stale for a run-option change, not just a mapping change", async () => {
    // updateOptions is the third mutator named in the defect. Model and Window
    // are baked into the projection exactly as the mapping is.
    const workspace = createWorkspace();
    await workspace.run();

    workspace.updateOptions({ model: "AccumulatedTrajectory" });
    expect(workspace.isStale()).toBe(true);
    expect(workspace.canPublish()).toBe(false);
    expect(workspace.writeUp()).toBe(ENA_METHODS_WRITE_UP_STALE);
  });

  it("clears the mark when a new run completes", async () => {
    const workspace = createWorkspace();
    await workspace.run();
    workspace.toggleColumn(workspace.mapping().codes[0]);
    expect(workspace.isStale()).toBe(true);

    await workspace.run();

    expect(workspace.isStale()).toBe(false);
    expect(workspace.canPublish()).toBe(true);
    // And the fresh paragraph describes the mapping that actually ran.
    expect(workspace.writeUp()).toContain(`${workspace.mapping().codes.length} codes were included`);
    expect(workspace.writeUp()).toContain(`${workspace.result()!.summary.units} units of analysis`);
  });

  it("clears the mark on Clear", async () => {
    const workspace = createWorkspace();
    await workspace.run();
    workspace.toggleColumn(workspace.mapping().codes[0]);
    expect(workspace.isStale()).toBe(true);

    workspace.clear();

    expect(workspace.result()).toBeNull();
    // The provenance goes with the result. Left behind, it would be compared
    // against the next run's inputs and could mark a fresh result stale.
    expect(workspace.resultInputs()).toBeNull();
    expect(workspace.isStale()).toBe(false);
    expect(workspace.canPublish()).toBe(false);
  });

  it("un-marks the result when the change is put back exactly", async () => {
    // Staleness is derived from the inputs, not remembered in a flag, so
    // reverting a stray change restores the analysis instead of demanding a
    // re-run of work that is still perfectly valid. A remembered flag cannot do
    // this: nothing would ever clear it but a re-run.
    const workspace = createWorkspace();
    await workspace.run();
    const fittedWith = workspace.resultInputs();

    workspace.updateOptions({ model: "AccumulatedTrajectory" });
    expect(workspace.isStale()).toBe(true);
    expect(workspace.canPublish()).toBe(false);

    workspace.updateOptions({ model: defaultEnaOptions.model });

    expect(workspace.isStale()).toBe(false);
    expect(workspace.canPublish()).toBe(true);
    expect(workspace.resultInputs()).toBe(fittedWith);
    // ...and the paragraph comes back describing the run that is plotted.
    expect(workspace.writeUp()).toContain(`${workspace.result()!.summary.units} units of analysis`);
  });

  it("stays marked when a code is put back in a different order", async () => {
    // The chip only ever unmaps or assigns metadata (FA13-05), so restoring a
    // code takes the Codes multi-select — which appends, leaving the list in an
    // order the run never saw. The stamp is order-sensitive on purpose: a
    // differently-ordered mapping is not demonstrably the run on screen, and
    // for a research artifact the conservative answer is the correct one.
    const workspace = createWorkspace();
    await workspace.run();
    const code = workspace.mapping().codes[0];

    workspace.toggleColumn(code);
    expect(workspace.isStale()).toBe(true);

    workspace.updateMapping({ codes: [...workspace.mapping().codes, code] });

    expect(workspace.mapping().codes).toContain(code);
    expect(workspace.isStale()).toBe(true);
    expect(workspace.canPublish()).toBe(false);
  });

  it("does not mark a result stale for the composition controls", () => {
    // Group By and the minimum edge weight are rebuilt from whatever set
    // exists (composedPlotModel), so they follow their controls immediately and
    // cannot go stale. They are excluded from the stamp by construction: it is
    // built only from the mapping and the run options, and there is no way to
    // pass them in. This pins the exclusion against a future "be safe, include
    // everything" edit that would nag the researcher to re-run for a slider.
    const mapping = inferEnaMapping(parsed.headers, parsed.rows);
    const stamp = enaRunInputFingerprint({ mapping, options: defaultEnaOptions });

    expect(stamp).not.toContain("groupBy");
    expect(stamp).not.toContain("minWeight");
    expect(isEnaResultStale({ hasResult: true, ranWith: stamp, live: stamp })).toBe(false);
  });

  it("says nothing is stale before anything has run", () => {
    const stamp = enaRunInputFingerprint({
      mapping: inferEnaMapping(parsed.headers, parsed.rows),
      options: defaultEnaOptions
    });
    expect(isEnaResultStale({ hasResult: false, ranWith: null, live: stamp })).toBe(false);
    expect(canPublishEnaResult({ hasResult: false, ranWith: null, live: stamp })).toBe(false);
  });
});

describe("the input stamp covers every baked-in input", () => {
  const mapping = inferEnaMapping(parsed.headers, parsed.rows);
  const baseline = enaRunInputFingerprint({ mapping, options: defaultEnaOptions });

  // Each run option, one at a time. Without this, an option could be left out
  // of the stamp and a result fitted with a different window, weighting or
  // dimension count would go on presenting itself as current.
  const changes: Array<[string, Partial<Required<EnaRunOptions>>]> = [
    ["model", { model: "AccumulatedTrajectory" }],
    ["window", { window: "Conversation" }],
    ["weightBy", { weightBy: "sum" }],
    ["windowSizeBack", { windowSizeBack: 4 }],
    ["windowSizeForward", { windowSizeForward: 2 }],
    ["dimensions", { dimensions: 3 }],
    ["nodePositionMethod", { nodePositionMethod: "directed" }]
  ];

  it.each(changes)("changes the stamp when %s changes", (_name, partial) => {
    expect(enaRunInputFingerprint({ mapping, options: { ...defaultEnaOptions, ...partial } })).not.toBe(baseline);
  });

  it("covers every key the run options actually carry", () => {
    // The list above is hand-written and will rot; this will not. A new option
    // added to defaultEnaOptions must move the stamp, or a result fitted before
    // it was changed would still look current.
    for (const key of Object.keys(defaultEnaOptions)) {
      const current = defaultEnaOptions[key as keyof Required<EnaRunOptions>];
      const mutated = { ...defaultEnaOptions, [key]: typeof current === "number" ? Number(current) + 1 : `${current}-changed` };
      expect(
        enaRunInputFingerprint({ mapping, options: mutated as Required<EnaRunOptions> }),
        `run option "${key}" is not part of the stamp`
      ).not.toBe(baseline);
    }
  });

  it.each(["units", "conversation", "codes", "metadata"] as const)(
    "changes the stamp when the %s mapping changes",
    (role) => {
      const mutated: EnaMapping = { ...mapping, [role]: [...(mapping[role] ?? []), "another-column"] };
      expect(enaRunInputFingerprint({ mapping: mutated, options: defaultEnaOptions })).not.toBe(baseline);
    }
  );

  it("is stable for inputs that did not change", () => {
    // A stamp that moved on its own would mark every result stale the moment it
    // landed, which is a different way of destroying the same work.
    expect(enaRunInputFingerprint({ mapping: { ...mapping }, options: { ...defaultEnaOptions } })).toBe(baseline);
  });
});

describe("runEnaAnalysis records what each result was computed from", () => {
  function harness() {
    const state = { result: null as string | null, inputs: null as string | null };
    const runToken: EnaRunToken = { current: 0 };
    const run = (execute: () => Promise<string>, inputFingerprint: string) =>
      runEnaAnalysis<string>(runToken, {
        initialProgress: null,
        execute,
        onSettled: () => {},
        setIsRunning: () => {},
        setProgress: () => {},
        setError: () => {},
        setResult: (value) => { state.result = value; },
        inputFingerprint,
        setResultInputs: (value) => { state.inputs = value; }
      });
    return { state, runToken, run };
  }

  it("writes the result and its provenance together", async () => {
    const { state, run } = harness();
    await run(() => Promise.resolve("projection"), "stamp-A");
    expect(state.result).toBe("projection");
    expect(state.inputs).toBe("stamp-A");
  });

  it("leaves neither behind when a run fails", async () => {
    const { state, run } = harness();
    await run(() => Promise.resolve("projection"), "stamp-A");
    await run(() => Promise.reject(new Error("boom")), "stamp-B");
    expect(state.result).toBeNull();
    expect(state.inputs).toBeNull();
  });

  it("does not let a superseded run stamp its inputs onto the workspace", async () => {
    // The API runtime has no AbortController, so an abandoned request keeps
    // flying. If it could still write its provenance, it would stamp the
    // *current* inputs as matching a result that never landed — and a genuinely
    // stale result would then look current.
    const { state, runToken, run } = harness();
    let resolveAbandoned: (value: string) => void = () => {};
    const abandoned = run(() => new Promise<string>((resolve) => { resolveAbandoned = resolve; }), "stamp-abandoned");

    supersedeEnaRun(runToken, { teardown: () => {}, setIsRunning: () => {}, setProgress: () => {} });
    resolveAbandoned("projection of inputs the user replaced");
    await abandoned;

    expect(state.result).toBeNull();
    expect(state.inputs).toBeNull();
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

describe("EnaWorkspaceClient wires the staleness gate to every artifact", () => {
  const source = readFileSync(join(process.cwd(), "app/workspace/ena/EnaWorkspaceClient.tsx"), "utf8");

  // The behaviour above lives in run-lifecycle and methods-write-up; these pin
  // the call sites, which is where the defect actually was. Without them, the
  // gate can be computed correctly and simply not consulted, with the module
  // suites still green — exactly the shape of the original bug.
  it.each(["exportResultJson", "exportPointsCsv", "exportConnectionsCsv", "copyMethodsWriteUp"])(
    "%s refuses to publish a stale result",
    (artifact) => {
      expect(functionBody(source, artifact)).toContain("resultIsPublishable");
    }
  );

  it("passes the staleness answer into the methods write-up", () => {
    // Not merely disabling Copy: the paragraph itself must stop reading as
    // authoritative, or a researcher transcribes it by hand.
    expect(source).toContain("stale: resultIsStale");
  });

  it("clears the recorded provenance wherever it clears the result", () => {
    expect(functionBody(source, "applyCsv")).toContain("setResultInputs(null)");

    // The Clear button is an inline handler, so it is located by its own label
    // — the workspace has a second RotateCcw button (Reset plot tools) that
    // must not be mistaken for it — and checked as the pair it has to write. A
    // result cleared without its provenance leaves a stamp from a run that is
    // no longer on screen to be compared against the next one.
    const clearLabel = source.indexOf("/> Clear");
    expect(clearLabel, "the Clear button was not found by its label").toBeGreaterThan(-1);
    const clearButton = source.slice(source.lastIndexOf("<GhostButton", clearLabel), clearLabel);
    expect(clearButton).toContain("setResult(null)");
    expect(clearButton).toContain("setResultInputs(null)");
  });

  it("hands the run its own input stamp rather than recomputing one later", () => {
    expect(functionBody(source, "runAnalysis")).toContain("inputFingerprint: liveInputFingerprint");
    expect(functionBody(source, "runAnalysis")).toContain("setResultInputs");
  });

  it("keeps the stamp off the composition controls", () => {
    // The fingerprint is built from mapping and options only. Group By and
    // minWeight must not creep into that call, or every slider nudge would
    // demand a re-run.
    const call = source.slice(source.indexOf("enaRunInputFingerprint({"), source.indexOf("enaRunInputFingerprint({") + 120);
    expect(call).toContain("mapping, options");
    expect(call).not.toContain("groupBy");
    expect(call).not.toContain("minWeight");
  });

  it("says so on screen, next to the plot and next to the write-up", () => {
    // Disabling the buttons is not enough on its own: a researcher who cannot
    // see why reads the plot as current and retypes the numbers.
    expect(source).toContain('data-visual-role="ena-result-stale-warning"');
    expect(source).toContain('data-visual-role="ena-methods-stale-warning"');
    expect(source).toContain("resultIsStale && (");
  });
});
