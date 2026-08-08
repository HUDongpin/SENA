import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

/**
 * Browser-level smoke for the jENA workbench at /workspace/ena.
 *
 * The workbench had no browser gate at all until this file existed: every
 * script under scripts/ drove /workspace/sena, so an import-time crash on this
 * route (which has broken main twice) or a silent regression in the P4c
 * comparison overlay would ship green. The route is a single client component
 * with a bundled Worker, so SSR HTML plus HTTP 200 proves nothing — every
 * assertion below is taken after hydration, from marks the renderer actually
 * drew.
 *
 * Vacuity discipline (Test Suite Ledger EC-8): each check pins a count, an
 * attribute value or an exact string, and every "X appears after the action"
 * check first pins that X is absent before it. The subtraction toggle in
 * particular is asserted default-OFF only from a state where the control is
 * mounted, enabled, and demonstrably live (its sibling overlay is drawn), then
 * flipped on and back off so the default is a choice rather than a dead
 * feature.
 */

const defaultTimeout = 15000;
const enaRoute = "/workspace/ena";

// Ground truth for the bundled lesson-study sample (lib/ena/sample-data.ts),
// observed against a production build. 18 rows x 12 columns, 7 codes, 6 units;
// C(7,2) = 21 connections; SVD1/SVD2 shares come from set.variance, which is
// the same quantity the Stats > Variance panel prints.
const sampleRows = 18;
const sampleColumns = 12;
const sampleCodeIds = ["PoP", "GO", "SC", "MV", "MR", "RoP", "PR"];
const sampleEdgeCount = 21;
const sampleUnitCount = 6;
const sampleDimensions = "SVD1,SVD2";
const sampleXAxisTitle = "SVD1 · 44.1%";
const sampleYAxisTitle = "SVD2 · 26.4%";
const sampleHeaviestEdge = { name: "MV & MR", weight: "0.246" };
const samplePreviewHeaders = [
  "participant",
  "conversation",
  "turn",
  "stage",
  "group",
  "PoP",
  "GO",
  "SC",
  "MV"
];
const samplePreviewRoles = [
  "participantunit",
  "conversationconv",
  "turnmeta",
  "stagemeta",
  "groupmeta",
  "PoPcode",
  "GOcode",
  "SCcode",
  "MVcode",
  "MRcode",
  "RoPcode",
  "PRcode"
];
const comparisonColumn = "group";
const comparisonGroupA = "Comparison";
const comparisonGroupB = "Planning";
// U+2212 MINUS SIGN, not a hyphen — the trace name is the load-bearing proof
// that the drawn network became the subtraction rather than the mean network.
const subtractedTraceName = `${comparisonGroupA} − ${comparisonGroupB}`;
const meanNetworkTraceName = "Mean network";
const paletteHex = {
  "blue-orange": { positive: "#218EBF", negative: "#EF691B" },
  "red-blue": { positive: "#CC2222", negative: "#2222CC" }
};
const sampleCiGeometry = {
  [comparisonGroupA]: { x: [-2.551813, 2.448576], y: [-6.557043, 6.162705] },
  [comparisonGroupB]: { x: [-1.59436, 1.840942], y: [-0.336421, 0.57876] }
};
const signedEdgeSignCounts = { positive: 10, negative: 11 };
const signedThreshold = 0.05;
const signedThresholdSurvivors = 14;
const meanThresholdSurvivors = 21;

function enaSmokeOriginFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return new URL(positional ?? process.env.SENA_ENA_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001").origin;
}

function assertNumber(value, expected, label) {
  if (value !== expected) {
    throw new Error(`Expected ${label} to equal ${expected}, received ${value}.`);
  }
}

function assertText(value, expected, label) {
  if (value !== expected) {
    throw new Error(`Expected ${label} to equal ${JSON.stringify(expected)}, received ${JSON.stringify(value)}.`);
  }
}

function assertTextIncludes(text, expected, label) {
  if (typeof text !== "string" || !text.includes(expected)) {
    throw new Error(`${label} is missing ${JSON.stringify(expected)}; received ${JSON.stringify(text)}.`);
  }
}

function assertDeepEqual(value, expected, label) {
  const actualJson = JSON.stringify(value);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${label} to equal ${expectedJson}, received ${actualJson}.`);
  }
}

function assertClose(value, expected, tolerance, label) {
  if (!Number.isFinite(value) || Math.abs(value - expected) > tolerance) {
    throw new Error(`Expected ${label} to be within ${tolerance} of ${expected}, received ${value}.`);
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

function countBySelector(page, selector) {
  return page.locator(selector).count();
}

async function assertCount(page, selector, expected, label) {
  assertNumber(await countBySelector(page, selector), expected, `${label} (${selector})`);
}

/**
 * React's synthetic onChange ignores a directly assigned `.value`, so range
 * inputs need the native setter plus real events — same helper the workspace
 * smoke uses for its sliders.
 */
async function setRangeValue(page, testId, value) {
  await page.locator(`[data-testid="${testId}"]`).evaluate((element, nextValue) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("Range target is not an input.");
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!valueSetter) throw new Error("HTMLInputElement value setter is unavailable.");
    valueSetter.call(element, String(nextValue));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function downloadTextByButton(page, buttonName, filename) {
  const locator = page.getByRole("button", { name: buttonName, exact: true }).first();
  await locator.waitFor({ state: "visible", timeout: defaultTimeout });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: defaultTimeout }),
    // The export buttons carry `pointer-events-none` while `result` is null, so
    // an actionability click would hang rather than fail; dispatching in-page
    // keeps a genuine regression loud instead of turning it into a timeout.
    locator.evaluate((element) => element.click())
  ]);

  const suggested = download.suggestedFilename();
  if (suggested !== filename) {
    throw new Error(`Expected ${filename} download from button ${buttonName}, received ${suggested}.`);
  }
  const path = await download.path();
  if (!path) throw new Error(`Download path unavailable for ${filename}.`);
  return readFile(path, "utf8");
}

async function readRailState(page) {
  return page.locator("[data-rail-mode]").evaluateAll((elements) => Object.fromEntries(
    elements.map((element) => [element.getAttribute("data-rail-mode"), element.getAttribute("data-active")])
  ));
}

async function readDatasetCards(page) {
  return page.locator("aside").first().evaluate((aside) => {
    const cards = {};
    for (const node of aside.querySelectorAll("div")) {
      const label = (node.textContent ?? "").trim();
      if (label === "Rows" || label === "Columns" || label === "Codes") {
        cards[label] = node.previousElementSibling?.textContent?.trim() ?? null;
      }
    }
    return cards;
  });
}

async function readPlotCensus(page) {
  const plot = page.locator('[data-testid="ena-plot"]').first();
  return {
    dimensions: await plot.getAttribute("data-plot-dimensions"),
    edges: await countBySelector(page, '[data-plot-role="network-edge"]'),
    nodes: await countBySelector(page, '[data-plot-role="network-node"]'),
    points: await countBySelector(page, '[data-plot-role="point"]'),
    nodeIds: await page
      .locator('[data-plot-role="network-node"]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-node-id"))),
    pointTraceNames: await page
      .locator('[data-plot-role="point-trace"]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-trace-name"))),
    networkTraceName: await page.locator('[data-plot-role="network-trace"]').first().getAttribute("data-trace-name"),
    xAxisTitle: await page.locator('[data-plot-role="x-axis-title"]').first().textContent(),
    yAxisTitle: await page.locator('[data-plot-role="y-axis-title"]').first().textContent()
  };
}

async function readEdgeRows(page) {
  return page.locator('[data-plot-role="network-edge"]').evaluateAll((elements) => elements.map((element) => ({
    name: element.getAttribute("data-edge-name"),
    weight: element.getAttribute("data-edge-weight"),
    visualWidth: element.getAttribute("data-edge-visual-width"),
    sign: element.getAttribute("data-edge-sign")
  })));
}

function heaviestEdge(rows) {
  return [...rows].sort((left, right) => Math.abs(Number(right.weight)) - Math.abs(Number(left.weight)))[0];
}

async function readComparisonOverlay(page) {
  return {
    means: await page.locator("[data-sena-group-mean]").evaluateAll((elements) => elements.map((element) => ({
      name: element.getAttribute("data-sena-group-mean"),
      n: element.getAttribute("data-sena-group-n"),
      interval: element.getAttribute("data-sena-group-interval"),
      fill: element.querySelector("rect")?.getAttribute("fill") ?? null
    }))),
    intervals: await page.locator("[data-sena-group-ci]").evaluateAll((elements) => elements.map((element) => ({
      name: element.getAttribute("data-sena-group-ci"),
      x: element.getAttribute("data-sena-ci-x"),
      y: element.getAttribute("data-sena-ci-y"),
      stroke: element.getAttribute("stroke"),
      dash: element.getAttribute("stroke-dasharray")
    }))),
    groupMeanPointTraces: await countBySelector(page, '[data-trace-type="group"]'),
    signedEdges: await countBySelector(page, '[data-plot-role="network-edge"][data-edge-sign]'),
    legendOverlayEntries: await countBySelector(page, '[data-sena-layer="legend-overlay-entries"]')
  };
}

/**
 * Leg 1 — cold signed-out load and a hydration-proof rail switch.
 *
 * "The page loaded" cannot be HTTP 200 or an `<h1>`: /workspace/ena is a client
 * component, so a bundle that throws at import still serves 200 with server
 * HTML. The falsifiable claim is a post-hydration state change — two rail
 * buttons flipping data-active together with a Sets-only node appearing where
 * it was provably absent — plus a pageerror listener.
 */
async function verifyEnaWorkbenchShell(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('[data-visual-role="webena-workbench"]').first().waitFor({ state: "visible", timeout: defaultTimeout });

  // Signed out: the route is public and NavBar shows the auth entry links.
  await assertCount(page, '[data-testid="nav-auth-links"]', 1, "NavBar auth links");
  const authHrefs = await page
    .locator('[data-testid="nav-auth-links"] a')
    .evaluateAll((elements) => elements.map((element) => new URL(element.href).pathname));
  for (const path of ["/login", "/register"]) {
    assertTrue(authHrefs.includes(path), `Signed-out NavBar is missing a ${path} link; saw ${JSON.stringify(authHrefs)}.`);
  }

  await assertCount(page, '[data-rail-mode="model"][data-active="true"]', 1, "default Model rail button");
  assertDeepEqual(
    await readRailState(page),
    { sets: "false", model: "true", plot: "false", stats: "false" },
    "cold-load rail state"
  );
  await assertCount(page, '[data-visual-role="ena-sets-open-data-view"]', 0, "Sets-only Full table button before the rail switch");
  await assertCount(page, '[data-testid="ena-plot"]', 0, "ENA plot before Run jENA");

  await page.locator('[data-rail-mode="sets"]').click({ timeout: defaultTimeout });
  assertDeepEqual(
    await readRailState(page),
    { sets: "true", model: "false", plot: "false", stats: "false" },
    "rail state after switching to Sets"
  );
  await assertCount(page, '[data-visual-role="ena-sets-open-data-view"]', 1, "Sets-only Full table button after the rail switch");
}

/**
 * Leg 2 — the bundled lesson-study sample and the Data View drawer.
 *
 * The dataset is parsed at module scope, so the cold-load caption and the
 * post-click caption are two *different* strings; asserting the transition is
 * what proves the Sample button ran rather than that the page shipped a
 * dataset.
 */
async function verifyEnaSampleAndDataView(page) {
  const status = page.locator("aside p").first();
  assertText(await status.textContent(), "Sample lesson-study dataset loaded.", "cold-load dataset caption");
  assertDeepEqual(
    await readDatasetCards(page),
    { Rows: String(sampleRows), Columns: String(sampleColumns), Codes: String(sampleCodeIds.length) },
    "cold-load dataset cards"
  );

  await page.getByRole("button", { name: "Sample", exact: true }).click({ timeout: defaultTimeout });
  assertText(
    await status.textContent(),
    `Sample dataset: ${sampleRows} rows and ${sampleColumns} columns loaded.`,
    "dataset caption after clicking Sample"
  );
  assertDeepEqual(
    await readDatasetCards(page),
    { Rows: String(sampleRows), Columns: String(sampleColumns), Codes: String(sampleCodeIds.length) },
    "dataset cards after clicking Sample"
  );

  // Column roles are inferred, not configured, so the preview is the only place
  // a reader can check what the run will treat as units, conversations and
  // codes. Pin the whole inferred mapping in order rather than spot-checking
  // one row. (Role tags are uppercased in CSS only; textContent is lowercase.)
  const previewRoles = await page
    .locator("aside li")
    .evaluateAll((elements) => elements.map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim()));
  assertNumber(previewRoles.length, sampleColumns, "column preview rows");
  for (const [index, expected] of samplePreviewRoles.entries()) {
    assertTrue(
      previewRoles[index].startsWith(expected),
      `Column preview row ${index} should start with ${JSON.stringify(expected)}; received ${JSON.stringify(previewRoles[index])}.`
    );
  }

  const toggle = page.locator('[data-visual-role="ena-data-view-toggle"]').first();
  assertText(await toggle.getAttribute("aria-expanded"), "false", "Data View drawer before opening");
  await assertCount(page, "table", 0, "Data View tables before opening");

  await page.locator('[data-visual-role="ena-sets-open-data-view"]').click({ timeout: defaultTimeout });
  assertText(await toggle.getAttribute("aria-expanded"), "true", "Data View drawer after Full table");
  assertDeepEqual(
    await page.locator("table").first().locator("th").evaluateAll((elements) => elements.map((element) => element.textContent?.trim())),
    samplePreviewHeaders,
    "Data View source-row headers"
  );

  await toggle.click({ timeout: defaultTimeout });
  assertText(await toggle.getAttribute("aria-expanded"), "false", "Data View drawer after closing");
  await assertCount(page, "table", 0, "Data View tables after closing");
}

/**
 * Leg 3 — Run jENA through the browser Worker to a rendered plot.
 *
 * `[data-testid="ena-plot"]` existing is not the claim: a degenerate run with
 * no nodes and no edges would satisfy it. The claim is the ink — node ids equal
 * to the mapped code columns and C(7,2) edges — plus the ENA-purity negative
 * (this route passes no overlay/selection props, so those layers must be
 * absent).
 */
async function verifyEnaRunProducesPlot(page) {
  await page.getByText("No model yet", { exact: true }).first().waitFor({ state: "visible", timeout: defaultTimeout });

  const run = page.getByRole("button", { name: "Run jENA", exact: true });
  assertTrue(!(await run.isDisabled()), "Run jENA is disabled on the inferred sample mapping.");
  await run.click({ timeout: defaultTimeout });
  // The worker finishes in ~100ms, so the running alert and its percentage are
  // not observable; wait on the plot itself rather than on progress.
  await page.locator('[data-testid="ena-plot"]').first().waitFor({ state: "attached", timeout: defaultTimeout });

  const census = await readPlotCensus(page);
  assertText(census.dimensions, sampleDimensions, "plot dimensions");
  assertDeepEqual(census.nodeIds, sampleCodeIds, "network node ids");
  assertNumber(census.edges, sampleEdgeCount, "network edge count");
  assertNumber(census.points, sampleUnitCount, "unit point count");
  assertText(census.xAxisTitle, sampleXAxisTitle, "x axis title");
  assertText(census.yAxisTitle, sampleYAxisTitle, "y axis title");
  assertText(census.networkTraceName, meanNetworkTraceName, "network trace name");
  assertDeepEqual(census.pointTraceNames, ["Units"], "point trace names before Group By");
  await assertCount(page, '[data-plot-role="network-node-label"]', sampleCodeIds.length, "network node labels");

  const heaviest = heaviestEdge(await readEdgeRows(page));
  assertText(heaviest.name, sampleHeaviestEdge.name, "heaviest edge name");
  assertText(heaviest.weight, sampleHeaviestEdge.weight, "heaviest edge weight");

  // ENA purity: /workspace/ena renders EnaPlot without overlay edges, hit
  // targets, unit identity or selection, so those SENA layers must not appear.
  for (const layer of ["overlay-edges", "node-hit-targets", "unit-identity", "selection-ring"]) {
    await assertCount(page, `[data-sena-layer="${layer}"]`, 0, `SENA-only layer ${layer} on the ENA workbench`);
  }
  await assertCount(page, '[data-visual-role="ena-low-rank-warning"]', 0, "low-rank warning on the sample dataset");
}

/**
 * Leg 4 — zoom, asserted at both clamps rather than "it changed".
 */
async function verifyEnaPlotZoom(page) {
  const plot = page.locator('[data-testid="ena-plot"]').first();
  const zoomIn = page.locator('[data-visual-role="ena-zoom-in"]').first();
  const zoomOut = page.locator('[data-visual-role="ena-zoom-out"]').first();
  const zoomReset = page.locator('[data-visual-role="ena-zoom-reset"]').first();

  assertText(await plot.getAttribute("data-plot-zoom"), "1.000", "initial plot zoom");
  await zoomIn.click({ timeout: defaultTimeout });
  assertText(await plot.getAttribute("data-plot-zoom"), "1.250", "plot zoom after one zoom in");
  // The header button rounds to 2dp while the svg carries 3dp — both surfaces
  // must agree on the same zoom, which is what a naive shared helper gets wrong.
  assertText(await zoomReset.getAttribute("data-plot-zoom"), "1.25", "header zoom readout after one zoom in");

  for (let index = 0; index < 12 && !(await zoomIn.isDisabled()); index += 1) {
    await zoomIn.click({ timeout: defaultTimeout });
  }
  assertText(await plot.getAttribute("data-plot-zoom"), "4.000", "plot zoom at the upper clamp");
  assertTrue(await zoomIn.isDisabled(), "Zoom in is still enabled at the 4x clamp.");

  await zoomReset.click({ timeout: defaultTimeout });
  assertText(await plot.getAttribute("data-plot-zoom"), "1.000", "plot zoom after reset");

  for (let index = 0; index < 14 && !(await zoomOut.isDisabled()); index += 1) {
    await zoomOut.click({ timeout: defaultTimeout });
  }
  assertText(await plot.getAttribute("data-plot-zoom"), "0.600", "plot zoom at the lower clamp");
  assertTrue(await zoomOut.isDisabled(), "Zoom out is still enabled at the 0.6x clamp.");

  await zoomReset.click({ timeout: defaultTimeout });
  assertText(await plot.getAttribute("data-plot-zoom"), "1.000", "plot zoom after the final reset");
}

/**
 * Leg 5 — the P4c comparison surface (Functional Coverage Ledger FA24-07).
 *
 * This is the reason the file exists: ~300 lines of comparison UI shipped with
 * unit tests only. Every sub-check below is written so the tempting phrasing
 * cannot pass it — see the comment above each block.
 */
async function verifyEnaComparisonSurface(page) {
  await page.locator('[data-rail-mode="plot"]').click({ timeout: defaultTimeout });
  await page.locator('[data-visual-role="ena-comparison"]').first().waitFor({ state: "visible", timeout: defaultTimeout });

  // Gate state: with no Group By the whole A/B surface is unmounted, so the
  // later "the control exists and is off" checks cannot be satisfied by a
  // count-0 locator.
  await assertCount(page, '[data-testid="ena-comparison-group-a"]', 0, "Group A select before choosing a Group By column");
  await assertCount(page, '[data-testid="ena-comparison-subtraction"]', 0, "Subtraction toggle before choosing a Group By column");
  assertTextIncludes(
    await page.locator('[data-visual-role="ena-comparison"]').first().textContent(),
    "Choose a Group By column above, then compare two of its groups here.",
    "comparison gate copy with no Group By"
  );

  const beforeGroupBy = await readPlotCensus(page);
  const edgesBeforeGroupBy = await readEdgeRows(page);

  await page.selectOption('[data-testid="ena-comparison-column"]', comparisonColumn, { timeout: defaultTimeout });
  await page.locator('[data-testid="ena-comparison-subtraction"]').first().waitFor({ state: "attached", timeout: defaultTimeout });

  // FA13-08. "Group traces appeared" alone cannot distinguish the fix from a
  // regression that re-projects the model, so the unchanged half carries the
  // claim: same dimensions, same edge census, byte-identical edge weights.
  const afterGroupBy = await readPlotCensus(page);
  assertDeepEqual(
    afterGroupBy.pointTraceNames,
    ["Units", "Comparison mean", "Planning mean", "Reflecting mean"],
    "point trace names after Group By"
  );
  assertText(afterGroupBy.dimensions, beforeGroupBy.dimensions, "plot dimensions across Group By");
  assertNumber(afterGroupBy.edges, beforeGroupBy.edges, "network edge count across Group By");
  assertText(afterGroupBy.xAxisTitle, beforeGroupBy.xAxisTitle, "x axis title across Group By");
  assertDeepEqual(
    (await readEdgeRows(page)).map((edge) => [edge.name, edge.weight]),
    edgesBeforeGroupBy.map((edge) => [edge.name, edge.weight]),
    "edge names and weights across Group By"
  );

  assertText(await page.locator('[data-testid="ena-comparison-group-a"]').inputValue(), comparisonGroupA, "default Group A");
  assertText(await page.locator('[data-testid="ena-comparison-group-b"]').inputValue(), comparisonGroupB, "default Group B");
  assertDeepEqual(
    await page.locator('[data-testid="ena-comparison-group-a"] option').evaluateAll((elements) => elements.map((element) => element.value)),
    [comparisonGroupA, comparisonGroupB, "Reflecting"],
    "Group A options"
  );

  await verifyEnaGroupMeansAndIntervals(page);
  await verifyEnaComparisonPalette(page);
  await verifyEnaSubtractionDefaultOff(page);
  await verifyEnaDeltaMultiplier(page);
  await verifyEnaSignedThreshold(page);
}

/**
 * Group means + 95% CI: the marks, their n, and the interval geometry.
 *
 * "A percentage/box appears" would pass on a stub, so this pins the per-group
 * n (2 v 3), the interval flag, the 6-dp data-space bounds with lo < hi, the
 * dashed stroke, and — the part that proves it is drawn and not merely
 * described — a positive rendered bounding box for each CI rect.
 */
async function verifyEnaGroupMeansAndIntervals(page) {
  const overlay = await readComparisonOverlay(page);
  assertDeepEqual(
    overlay.means.map((mean) => [mean.name, mean.n, mean.interval]),
    [[comparisonGroupA, "2", "true"], [comparisonGroupB, "3", "true"]],
    "group mean markers"
  );
  assertDeepEqual(
    overlay.intervals.map((interval) => [interval.name, interval.dash]),
    [[comparisonGroupA, "4 3"], [comparisonGroupB, "4 3"]],
    "group CI rects"
  );

  for (const interval of overlay.intervals) {
    const expected = sampleCiGeometry[interval.name];
    assertTrue(Boolean(expected), `Unexpected CI group ${interval.name}.`);
    for (const axis of ["x", "y"]) {
      assertTrue(
        /^-?\d+\.\d{6},-?\d+\.\d{6}$/.test(interval[axis] ?? ""),
        `CI ${axis} bounds for ${interval.name} are not 6-dp data coordinates: ${JSON.stringify(interval[axis])}.`
      );
      const [low, high] = interval[axis].split(",").map(Number);
      assertClose(low, expected[axis][0], 1e-4, `CI ${axis} lower bound for ${interval.name}`);
      assertClose(high, expected[axis][1], 1e-4, `CI ${axis} upper bound for ${interval.name}`);
      assertTrue(low < high, `CI ${axis} bounds for ${interval.name} are not ordered: ${interval[axis]}.`);
    }
  }

  for (const name of [comparisonGroupA, comparisonGroupB]) {
    const box = await page.locator(`[data-sena-group-ci="${name}"]`).first().boundingBox();
    assertTrue(
      Boolean(box) && box.width > 0 && box.height > 0,
      `CI rect for ${name} has no rendered area: ${JSON.stringify(box)}.`
    );
  }

  // Retraction: turning the toggle off must remove the overlay and ONLY the
  // overlay — the jena-js group mean *points* come from Group By, so they stay.
  await page.locator('[data-testid="ena-comparison-intervals"]').uncheck({ timeout: defaultTimeout });
  const off = await readComparisonOverlay(page);
  assertNumber(off.means.length, 0, "group mean markers with intervals off");
  assertNumber(off.intervals.length, 0, "group CI rects with intervals off");
  assertNumber(off.groupMeanPointTraces, 3, "jena-js group traces with intervals off");

  await page.locator('[data-testid="ena-comparison-intervals"]').check({ timeout: defaultTimeout });
  const back = await readComparisonOverlay(page);
  assertNumber(back.means.length, 2, "group mean markers after re-enabling intervals");
  assertNumber(back.intervals.length, 2, "group CI rects after re-enabling intervals");
}

/**
 * Palette preset: the button state AND the hex that reached the ink.
 *
 * data-active alone would pass on a preset that styles nothing. The group mean
 * fills and CI strokes are the only surfaces carrying the raw palette hex —
 * network strokes are desaturated by intensity, so they are deliberately not
 * asserted here.
 */
async function verifyEnaComparisonPalette(page) {
  const readPaletteButtons = () => page
    .locator("[data-comparison-palette]")
    .evaluateAll((elements) => Object.fromEntries(elements.map((element) => [
      element.getAttribute("data-comparison-palette"),
      element.getAttribute("data-active")
    ])));

  const assertPaletteInk = async (paletteId) => {
    const { positive, negative } = paletteHex[paletteId];
    const overlay = await readComparisonOverlay(page);
    assertDeepEqual(
      overlay.means.map((mean) => mean.fill),
      [positive, negative],
      `group mean fills for palette ${paletteId}`
    );
    assertDeepEqual(
      overlay.intervals.map((interval) => interval.stroke),
      [positive, negative],
      `group CI strokes for palette ${paletteId}`
    );
  };

  await assertCount(page, '[data-testid="ena-comparison-palette"]', 1, "comparison palette control");
  assertDeepEqual(await readPaletteButtons(), { "blue-orange": "true", "red-blue": "false" }, "default palette selection");
  await assertPaletteInk("blue-orange");

  await page.locator('[data-comparison-palette="red-blue"]').click({ timeout: defaultTimeout });
  assertDeepEqual(await readPaletteButtons(), { "blue-orange": "false", "red-blue": "true" }, "palette selection after choosing rENA");
  await assertPaletteInk("red-blue");

  await page.locator('[data-comparison-palette="blue-orange"]').click({ timeout: defaultTimeout });
  assertDeepEqual(await readPaletteButtons(), { "blue-orange": "true", "red-blue": "false" }, "palette selection after returning to webENA");
  await assertPaletteInk("blue-orange");
}

/**
 * Subtracted network: DEFAULT-OFF, and off as a choice rather than as damage.
 *
 * The naive "the checkbox is not checked" false-passes three ways: the control
 * is not mounted yet; it is mounted but disabled because A == B; or the whole
 * comparison feature is dead. The first is excluded by the gate assertions in
 * verifyEnaComparisonSurface, the second by asserting it is enabled, the third
 * by requiring the sibling overlay to be live in this same state. Only then is
 * "unchecked, zero signed edges, mean network" a meaningful default — and the
 * on/off round trip proves the signed DOM can appear at all.
 */
async function verifyEnaSubtractionDefaultOff(page) {
  const subtraction = page.locator('[data-testid="ena-comparison-subtraction"]').first();
  await assertCount(page, '[data-testid="ena-comparison-subtraction"]', 1, "subtraction toggle");
  assertTrue(!(await subtraction.isDisabled()), "Subtraction toggle is disabled, so 'off' is forced rather than the default.");

  const live = await readComparisonOverlay(page);
  assertNumber(live.means.length, 2, "group mean markers proving the comparison surface is live");
  assertNumber(live.intervals.length, 2, "group CI rects proving the comparison surface is live");

  assertTrue(!(await subtraction.isChecked()), "Subtracted network is checked by default; it must default off.");
  assertNumber(live.signedEdges, 0, "signed edges in the default state");
  assertNumber(live.legendOverlayEntries, 0, "signed legend block in the default state");
  assertText(
    await page.locator('[data-plot-role="network-trace"]').first().getAttribute("data-trace-name"),
    meanNetworkTraceName,
    "network trace name in the default state"
  );
  assertTrue(
    await page.locator('[data-testid="ena-comparison-multiplier"]').first().isDisabled(),
    "Delta multiplier is enabled while no subtraction is drawn."
  );

  await subtraction.check({ timeout: defaultTimeout });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-plot-role="network-edge"][data-edge-sign]').length > 0,
    undefined,
    { timeout: defaultTimeout }
  );

  const on = await readComparisonOverlay(page);
  assertNumber(on.signedEdges, sampleEdgeCount, "signed edges with the subtraction drawn");
  assertNumber(on.legendOverlayEntries, 1, "signed legend block with the subtraction drawn");
  await assertCount(page, '[data-edge-sign="positive"]', signedEdgeSignCounts.positive, "positive signed edges");
  await assertCount(page, '[data-edge-sign="negative"]', signedEdgeSignCounts.negative, "negative signed edges");
  assertText(
    await page.locator('[data-plot-role="network-trace"]').first().getAttribute("data-trace-name"),
    subtractedTraceName,
    "network trace name with the subtraction drawn"
  );

  const legendTexts = await page.locator('[data-sena-layer="legend"] text').allTextContents();
  for (const entry of [`More in ${comparisonGroupA}`, `More in ${comparisonGroupB}`, subtractedTraceName]) {
    assertTrue(legendTexts.includes(entry), `Signed legend is missing ${JSON.stringify(entry)}; saw ${JSON.stringify(legendTexts)}.`);
  }

  await subtraction.uncheck({ timeout: defaultTimeout });
  const retracted = await readComparisonOverlay(page);
  assertNumber(retracted.signedEdges, 0, "signed edges after untoggling the subtraction");
  assertNumber(retracted.legendOverlayEntries, 0, "signed legend block after untoggling the subtraction");
  assertText(
    await page.locator('[data-plot-role="network-trace"]').first().getAttribute("data-trace-name"),
    meanNetworkTraceName,
    "network trace name after untoggling the subtraction"
  );
}

/**
 * Delta multiplier: the exact ratio AND the invariant, together.
 *
 * "Widths changed" passes on any re-render, and a bug that scaled the
 * *difference* rather than the ink would pass it too. The UI's own claim is
 * "Δ × amplifies the drawn width, not the difference", so the check is every
 * visual width scaled by exactly the multiplier while every edge weight stays
 * byte-identical. Tolerance is 0.02 because both widths are printed at 2dp.
 */
async function verifyEnaDeltaMultiplier(page) {
  const subtraction = page.locator('[data-testid="ena-comparison-subtraction"]').first();
  await subtraction.check({ timeout: defaultTimeout });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-plot-role="network-edge"][data-edge-sign]').length > 0,
    undefined,
    { timeout: defaultTimeout }
  );

  const multiplier = page.locator('[data-testid="ena-comparison-multiplier"]').first();
  assertTrue(!(await multiplier.isDisabled()), "Delta multiplier is disabled while the subtraction is drawn.");
  assertText(await multiplier.inputValue(), "1", "default delta multiplier");

  const baseline = await readEdgeRows(page);
  assertNumber(baseline.length, sampleEdgeCount, "signed edge count at 1x");
  const widestBaseline = Math.max(...baseline.map((edge) => Number(edge.visualWidth)));
  assertClose(widestBaseline, 8, 1e-9, "widest signed edge visual width at 1x");

  await setRangeValue(page, "ena-comparison-multiplier", 3);
  assertText(await multiplier.inputValue(), "3", "delta multiplier after moving the slider");

  const scaled = await readEdgeRows(page);
  assertNumber(scaled.length, baseline.length, "signed edge count at 3x");
  for (let index = 0; index < baseline.length; index += 1) {
    assertText(scaled[index].name, baseline[index].name, `edge name at index ${index} across the multiplier`);
    assertText(scaled[index].weight, baseline[index].weight, `edge weight for ${baseline[index].name} across the multiplier`);
    assertText(scaled[index].sign, baseline[index].sign, `edge sign for ${baseline[index].name} across the multiplier`);
    assertClose(
      Number(scaled[index].visualWidth),
      Number(baseline[index].visualWidth) * 3,
      0.02,
      `3x visual width for ${baseline[index].name}`
    );
  }
  // The widest edge reaching exactly 24.00 also proves nothing clamped it.
  assertClose(Math.max(...scaled.map((edge) => Number(edge.visualWidth))), 24, 1e-9, "widest signed edge visual width at 3x");

  await setRangeValue(page, "ena-comparison-multiplier", 1);
  assertClose(
    Math.max(...(await readEdgeRows(page)).map((edge) => Number(edge.visualWidth))),
    8,
    1e-9,
    "widest signed edge visual width after restoring 1x"
  );
}

/**
 * Minimum edge weight under subtraction (the P6 review fix, commit 26ca5b7).
 *
 * The readout is a pure function of the slider, so asserting it reads 0.050 is
 * true even when the threshold filters the wrong quantity — which is exactly
 * the bug that was fixed. The discriminating assertion is that the SAME slider
 * position keeps a different set of edges depending on whether the subtraction
 * is drawn: |Δ| when it is, pooled mean weight when it is not.
 */
async function verifyEnaSignedThreshold(page) {
  assertText(
    await page.locator('[data-testid="ena-min-edge-weight-effective"]').first().textContent(),
    "0.001",
    "minimum edge weight readout at slider zero"
  );

  await setRangeValue(page, "ena-min-edge-weight-slider", signedThreshold);
  assertText(
    await page.locator('[data-testid="ena-min-edge-weight-effective"]').first().textContent(),
    signedThreshold.toFixed(3),
    "minimum edge weight readout after moving the slider"
  );

  const signedSurvivors = await readEdgeRows(page);
  assertNumber(signedSurvivors.length, signedThresholdSurvivors, "edges surviving the |Δ| threshold with the subtraction drawn");
  for (const edge of signedSurvivors) {
    assertTrue(
      Math.abs(Number(edge.weight)) > signedThreshold,
      `Edge ${edge.name} survived the |Δ| threshold with |weight| ${edge.weight}.`
    );
  }

  await page.locator('[data-testid="ena-comparison-subtraction"]').first().uncheck({ timeout: defaultTimeout });
  const meanSurvivors = await readEdgeRows(page);
  assertNumber(meanSurvivors.length, meanThresholdSurvivors, "edges surviving the mean-weight threshold with the subtraction off");
  assertText(
    await page.locator('[data-testid="ena-min-edge-weight-effective"]').first().textContent(),
    signedThreshold.toFixed(3),
    "minimum edge weight readout is unchanged by the subtraction toggle"
  );

  const signedNames = signedSurvivors.map((edge) => edge.name).sort();
  const meanNames = meanSurvivors.map((edge) => edge.name).sort();
  assertTrue(
    JSON.stringify(signedNames) !== JSON.stringify(meanNames),
    `The same threshold kept the same edges with and without the subtraction (${JSON.stringify(signedNames)}), so it cannot be filtering |Δ|.`
  );

  await setRangeValue(page, "ena-min-edge-weight-slider", 0);
  assertNumber((await readEdgeRows(page)).length, sampleEdgeCount, "edges after restoring the minimum edge weight");
}

/**
 * Leg 6 — the Stats panel's four tabs.
 *
 * Goodness of fit is pinned at its measured value (see the note at the
 * assertion): "1.000 by construction on this fixture" is what makes a tight pin
 * cheap and a loose one worthless, not a reason to assert only structure.
 * Variance pins the two surfaces that must agree — the axis title and the
 * Variance row both print set.variance.
 */
async function verifyEnaStatsPanels(page) {
  await page.locator('[data-rail-mode="stats"]').click({ timeout: defaultTimeout });
  await page.locator('[data-testid="ena-stats-tabs"]').first().waitFor({ state: "visible", timeout: defaultTimeout });

  const readTabs = () => page
    .locator("[data-panel-tab]")
    .evaluateAll((elements) => Object.fromEntries(elements.map((element) => [
      element.getAttribute("data-panel-tab"),
      element.getAttribute("data-active")
    ])));

  assertDeepEqual(
    await readTabs(),
    { comparison: "true", fit: "false", variance: "false", methods: "false" },
    "default Stats tab"
  );
  await assertCount(page, '[data-panel-tab="comparison"][data-active="true"]', 1, "default Compare tab button");
  await assertCount(page, '[data-visual-role="ena-stats-comparison"]', 1, "Stats Compare body on the default tab");
  await assertCount(page, '[data-visual-role="ena-stats-goodness-of-fit"]', 0, "Stats Fit body on the default tab");
  await assertCount(page, '[data-visual-role="ena-stats-methods"]', 0, "Stats Methods body on the default tab");

  const compareText = (await page.locator('[data-visual-role="ena-stats-comparison"]').first().textContent()) ?? "";
  for (const marker of [
    `n ${2} v ${3}`,
    "t(2.8) = -0.39, p = 0.723",
    "U = 2.0, p = 0.800",
    "exact distribution",
    `${comparisonGroupA} mean`,
    `${comparisonGroupB} mean`
  ]) {
    assertTextIncludes(compareText.replace(/\s+/g, " "), marker, "Stats Compare body");
  }

  await page.locator('[data-panel-tab="fit"]').click({ timeout: defaultTimeout });
  assertDeepEqual(
    await readTabs(),
    { comparison: "false", fit: "true", variance: "false", methods: "false" },
    "Stats tabs after selecting Fit"
  );
  await assertCount(page, '[data-visual-role="ena-stats-comparison"]', 0, "Stats Compare body on the Fit tab");
  const fitText = ((await page.locator('[data-visual-role="ena-stats-goodness-of-fit"]').first().textContent()) ?? "").replace(/\s+/g, " ");
  const fitPearson = [...fitText.matchAll(/Pearson(-?\d+\.\d{3}) \[/g)].map((match) => Number(match[1]));
  const fitSpearman = [...fitText.matchAll(/Spearman(-?\d+\.\d{3})/g)].map((match) => Number(match[1]));
  const fitRows = sampleDimensions.split(",").length;
  assertNumber(fitPearson.length, fitRows, "Goodness of Fit Pearson rows (one per plotted dimension)");
  assertNumber(fitSpearman.length, fitRows, "Goodness of Fit Spearman rows (one per plotted dimension)");
  // Pinned at the value, not merely inside [-1, 1]. On this fixture the two
  // retained dimensions ARE the two displayed ones, so each unit's position in
  // the high-dimensional space and its plotted position are the same vector and
  // both correlations are 1.000 by construction. That is a reason to pin
  // tightly, not a reason to skip the pin: a regression in jena-js's
  // enaCorrelations, or a mis-wiring of the manifest's goodnessOfFit, shows up
  // here and nowhere else. Kill-proved 2026-08-08 — forcing the correlations to
  // 0.000 left every structural assertion (row count, [-1, 1] range, the word
  // "Spearman") green while the panel reported a projection that preserves
  // nothing, one line above its own "Above 0.9 is the conventional bar" copy.
  // A fixture that ever retains more dimensions than it displays will legitimately
  // land below 1.000; re-pin it to that measured value rather than loosening this.
  for (const correlation of [...fitPearson, ...fitSpearman]) {
    assertTrue(
      Number.isFinite(correlation) && correlation >= 0.999 && correlation <= 1,
      `Goodness of Fit correlation ${correlation} is not the 1.000 this fixture projects by construction.`
    );
  }
  // The qualitative label the reader actually acts on has to agree with the number.
  assertNumber(
    (fitText.match(/strong/g) ?? []).length,
    fitRows,
    "Goodness of Fit rows labelled strong"
  );
  assertTrue(
    !/\b(adequate|weak)\b/.test(fitText),
    `Goodness of Fit reported a non-strong label for a 1.000 projection: ${fitText}`
  );

  await page.locator('[data-panel-tab="variance"]').click({ timeout: defaultTimeout });
  const varianceText = ((await page.locator("aside").first().textContent()) ?? "").replace(/\s+/g, " ");
  // The Variance rows and the plot axes must print the same share; the exported
  // summary.variance uses a different (renormalized) denominator on purpose, so
  // it is deliberately not cross-asserted here.
  assertTextIncludes(varianceText, "SVD144.1%", "Stats Variance body");
  assertTextIncludes(varianceText, "SVD226.4%", "Stats Variance body");
  assertTextIncludes(sampleXAxisTitle, "44.1%", "x axis title share");
  assertTextIncludes(sampleYAxisTitle, "26.4%", "y axis title share");
  for (const marker of [`Rows${sampleRows}`, `Units${sampleUnitCount}`, `Codes${sampleCodeIds.length}`, "Pathworker"]) {
    assertTextIncludes(varianceText, marker, "Stats Variance model card");
  }

  await page.locator('[data-panel-tab="methods"]').click({ timeout: defaultTimeout });
  await assertCount(page, '[data-visual-role="ena-stats-methods"]', 1, "Stats Methods body");
  await page.locator('[data-visual-role="ena-copy-methods"]').first().click({ timeout: defaultTimeout });
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  // The label flip is cosmetic; the write-up's own numbers are the claim.
  assertTextIncludes(
    clipboard,
    `Epistemic Network Analysis was applied to ${sampleRows} coded lines using jena-js`,
    "copied methods write-up"
  );
  assertTextIncludes(clipboard, `This yielded ${sampleUnitCount} units of analysis.`, "copied methods write-up");
}

/**
 * Leg 7 — clearing Group By retracts the whole comparison overlay.
 */
async function verifyEnaGroupByRetraction(page) {
  await page.locator('[data-rail-mode="plot"]').click({ timeout: defaultTimeout });
  await page.selectOption('[data-testid="ena-comparison-column"]', "", { timeout: defaultTimeout });

  const overlay = await readComparisonOverlay(page);
  assertNumber(overlay.means.length, 0, "group mean markers after clearing Group By");
  assertNumber(overlay.intervals.length, 0, "group CI rects after clearing Group By");
  assertNumber(overlay.groupMeanPointTraces, 0, "jena-js group traces after clearing Group By");
  await assertCount(page, '[data-testid="ena-comparison-group-a"]', 0, "Group A select after clearing Group By");

  const census = await readPlotCensus(page);
  assertDeepEqual(census.pointTraceNames, ["Units"], "point trace names after clearing Group By");
  assertNumber(census.points, sampleUnitCount, "unit point count after clearing Group By");
  assertNumber(census.edges, sampleEdgeCount, "network edge count after clearing Group By");
}

/**
 * Leg 8 — Plot Tools display controls and the reset that must undo them.
 *
 * Flip X is asserted as a true mirror: every point's before/after abscissa must
 * sum to the same constant, which a re-projection or a no-op both fail.
 */
async function verifyEnaPlotToolsDisplay(page) {
  const readPointAbscissas = () => page
    .locator('[data-plot-role="point"]')
    .evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("cx"))));
  const xAxisTitle = () => page.locator('[data-plot-role="x-axis-title"]').first().textContent();
  const xLabelInput = page.getByPlaceholder("SVD1").first();

  const baselineAbscissas = await readPointAbscissas();
  assertNumber(baselineAbscissas.length, sampleUnitCount, "baseline unit points");

  assertText(await xLabelInput.inputValue(), "", "X axis label input before renaming");
  await xLabelInput.fill("Reflection", { timeout: defaultTimeout });
  assertText(await xAxisTitle(), "Reflection · 44.1%", "x axis title after renaming");

  await page.getByText("Variance explained", { exact: true }).click({ timeout: defaultTimeout });
  assertText(await xAxisTitle(), "Reflection", "x axis title with variance explained off");
  await page.getByText("Variance explained", { exact: true }).click({ timeout: defaultTimeout });
  assertText(await xAxisTitle(), "Reflection · 44.1%", "x axis title with variance explained back on");

  await page.getByText("Flip X", { exact: true }).click({ timeout: defaultTimeout });
  const flippedAbscissas = await readPointAbscissas();
  assertNumber(flippedAbscissas.length, baselineAbscissas.length, "unit points after Flip X");
  await assertCount(page, '[data-plot-role="network-edge"]', sampleEdgeCount, "network edges after Flip X");
  const mirrorSums = baselineAbscissas.map((value, index) => value + flippedAbscissas[index]);
  for (let index = 0; index < mirrorSums.length; index += 1) {
    assertTrue(
      Math.abs(flippedAbscissas[index] - baselineAbscissas[index]) > 1,
      `Flip X left point ${index} at ${flippedAbscissas[index]}; nothing moved.`
    );
    assertClose(mirrorSums[index], mirrorSums[0], 1e-6, `Flip X mirror axis for point ${index}`);
  }

  // Reset must restore both the control state and the rendered effect.
  await page.locator('[data-visual-role="ena-plot-tools-reset"]').click({ timeout: defaultTimeout });
  assertText(await xAxisTitle(), sampleXAxisTitle, "x axis title after Reset plot tools");
  assertText(await xLabelInput.inputValue(), "", "X axis label input after Reset plot tools");
  const restoredAbscissas = await readPointAbscissas();
  for (let index = 0; index < baselineAbscissas.length; index += 1) {
    assertClose(restoredAbscissas[index], baselineAbscissas[index], 1e-6, `restored abscissa for point ${index}`);
  }

  await page.getByText("Code labels", { exact: true }).click({ timeout: defaultTimeout });
  await assertCount(page, '[data-plot-role="network-node-label"]', 0, "network node labels with Code labels off");
  await page.getByText("Code labels", { exact: true }).click({ timeout: defaultTimeout });
  await assertCount(page, '[data-plot-role="network-node-label"]', sampleCodeIds.length, "network node labels with Code labels back on");

  await assertCount(page, '[data-plot-role="network-edge-weight"]', 0, "edge weight labels before enabling Connection weights");
  await page.getByText("Connection weights", { exact: true }).click({ timeout: defaultTimeout });
  await assertCount(page, '[data-plot-role="network-edge-weight"]', sampleEdgeCount, "edge weight labels with Connection weights on");
  await page.getByText("Connection weights", { exact: true }).click({ timeout: defaultTimeout });
  await assertCount(page, '[data-plot-role="network-edge-weight"]', 0, "edge weight labels with Connection weights off again");
}

/**
 * Leg 9 — the three exports, tied to the run's own counts.
 *
 * A filename-only check is what the shared download helper already gives, and
 * "non-empty" is not evidence: points rows must equal summary.units and the
 * connections header must carry one column per drawn edge. The ENA result JSON
 * deliberately carries no schemaVersion, so the SENA schema helper is not
 * reused here — the shape is asserted instead.
 */
async function verifyEnaExports(page) {
  const resultText = await downloadTextByButton(page, "JSON", "sena-ena-result.json");
  const result = JSON.parse(resultText);
  assertDeepEqual(Object.keys(result), ["set", "plotModel", "summary", "warnings"], "sena-ena-result.json top-level keys");
  assertNumber(result.summary.rows, sampleRows, "sena-ena-result.json summary.rows");
  assertNumber(result.summary.units, sampleUnitCount, "sena-ena-result.json summary.units");
  assertNumber(result.summary.codes, sampleCodeIds.length, "sena-ena-result.json summary.codes");
  assertDeepEqual(result.summary.dimensions, sampleDimensions.split(","), "sena-ena-result.json summary.dimensions");
  assertText(result.summary.runtime, "worker", "sena-ena-result.json summary.runtime");
  assertDeepEqual(result.warnings, [], "sena-ena-result.json warnings for the sample dataset");

  const pointsCsv = (await downloadTextByButton(page, "Points", "sena-ena-points.csv")).trim().split("\n");
  assertText(pointsCsv[0], `ENA_UNIT,participant,${sampleDimensions}`, "sena-ena-points.csv header");
  assertNumber(pointsCsv.length - 1, result.summary.units, "sena-ena-points.csv data rows");

  const connectionsCsv = (await downloadTextByButton(page, "Connections", "sena-ena-connections.csv")).trim().split("\n");
  const connectionColumns = connectionsCsv[0].split(",");
  assertDeepEqual(connectionColumns.slice(0, 2), ["ENA_UNIT", "participant"], "sena-ena-connections.csv identity columns");
  assertNumber(connectionColumns.length - 2, sampleEdgeCount, "sena-ena-connections.csv connection columns");
  assertText(connectionColumns[2], "PoP & GO", "sena-ena-connections.csv first connection column");
  assertNumber(connectionsCsv.length - 1, result.summary.units, "sena-ena-connections.csv data rows");
}

export async function verifySenaEnaBrowserSmoke(baseUrl = enaSmokeOriginFromCli()) {
  const origin = new URL(baseUrl).origin;
  const url = `${origin}${enaRoute}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"]
  });
  const page = await context.newPage();
  const pageErrors = [];
  // Uncaught client exceptions are the escape that broke main twice on this
  // route. Console errors are NOT gated: a clean load legitimately logs a
  // report-only CSP notice and a /_vercel/insights 404, so a blanket console
  // guard would be a permanent false red.
  page.on("pageerror", (error) => pageErrors.push(error));

  const assertNoPageErrors = (label) => {
    if (pageErrors.length > 0) {
      throw new Error(`Uncaught page error during ${label}: ${pageErrors.map((error) => error.message).join(" | ")}`);
    }
  };

  try {
    await verifyEnaWorkbenchShell(page, url);
    assertNoPageErrors("workbench shell");
    await verifyEnaSampleAndDataView(page);
    assertNoPageErrors("sample dataset and data view");
    await verifyEnaRunProducesPlot(page);
    assertNoPageErrors("jENA worker run");
    await verifyEnaPlotZoom(page);
    assertNoPageErrors("plot zoom");
    await verifyEnaComparisonSurface(page);
    assertNoPageErrors("comparison surface");
    await verifyEnaStatsPanels(page);
    assertNoPageErrors("stats panels");
    await verifyEnaGroupByRetraction(page);
    assertNoPageErrors("group by retraction");
    await verifyEnaPlotToolsDisplay(page);
    assertNoPageErrors("plot tools display");
    await verifyEnaExports(page);
    assertNoPageErrors("exports");

    console.log(`jENA workbench browser smoke passed for ${url}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaEnaBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
