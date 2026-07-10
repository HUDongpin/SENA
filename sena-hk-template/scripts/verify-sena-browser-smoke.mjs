import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const defaultTimeout = 15000;
const sampleContractJsonPath = samplePath("lesson-study-sena-contract.json");
const sampleCsvPaths = [
  "lesson-study-people.csv",
  "lesson-study-interactions.csv",
  "lesson-study-utterances.csv",
  "lesson-study-coded_segments.csv",
  "lesson-study-codebook.csv"
].map(samplePath);
const bilingualEvidenceMarkers = [
  "李老師請陳老師把學習目標連到證據",
  "學生用圖形做證據但還未說清楚原因",
  "觀課紀錄顯示協作慢慢變成推理的橋",
  "何老師請黃博士協助解讀證據模式"
];
const primaryBilingualEvidenceMarker = bilingualEvidenceMarkers[1];

function samplePath(filename) {
  return fileURLToPath(new URL(`../public/sena-pilot/sample/${filename}`, import.meta.url));
}

function smokeUrlFromCli() {
  const positional = process.argv.find((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
  return positional ?? process.env.SENA_BROWSER_SMOKE_URL ?? "http://127.0.0.1:3001/workspace/sena";
}

async function waitForVisibleText(page, text) {
  const startedAt = Date.now();
  const locator = page.getByText(text, { exact: false });
  let lastCount = 0;

  while (Date.now() - startedAt < defaultTimeout) {
    lastCount = await locator.count().catch(() => 0);
    for (let index = 0; index < Math.min(lastCount, 50); index += 1) {
      if (await locator.nth(index).isVisible().catch(() => false)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for visible text ${JSON.stringify(text)}; matched ${lastCount} hidden or detached node(s).`);
}

async function clickByTestId(page, testId) {
  await page.locator(`[data-testid="${testId}"]`).first().click({ timeout: defaultTimeout });
}

async function activateButtonByTestId(page, testId) {
  const locator = page.locator(`[data-testid="${testId}"]`).first();
  await locator.waitFor({ state: "visible", timeout: defaultTimeout });
  await locator.evaluate((element) => element.click());
}

async function waitForCanvasZoom(page, selector, expectedZoom) {
  await page.waitForFunction(
    ({ selector: targetSelector, expected }) => document.querySelector(targetSelector)?.getAttribute("data-plot-zoom") === expected,
    { selector, expected: expectedZoom },
    { timeout: defaultTimeout }
  );
}

async function verifyWeightedFusionLinkWidths(page) {
  const canvas = page.locator('[data-testid="central-fusion-priority-plot"] [data-testid="sena-fusion-canvas"]').first();
  const layerSelectors = {
    social: '[data-layer="social"][data-visual-role="outer-social-arc"][data-edge-visual-width]',
    concept: '[data-layer="concept"][data-visual-role="ena-solid-concept-link"][data-edge-visual-width]',
    bridge: '[data-layer="bridge"][data-visual-role="person-code-bridge-ribbon"][data-edge-visual-width]'
  };

  for (const [layer, selector] of Object.entries(layerSelectors)) {
    const locator = canvas.locator(selector);
    await locator.first().waitFor({ state: "attached", timeout: defaultTimeout });
    const rows = await locator.evaluateAll((elements) => elements.map((element) => ({
      width: Number(element.getAttribute("data-edge-visual-width")),
      raw: Number(element.getAttribute("data-edge-weight")),
      scaled: Number(element.getAttribute("data-edge-scaled-weight")),
      salience: Number(element.getAttribute("data-edge-visual-salience"))
    })));
    if (rows.some((row) => !Number.isFinite(row.width) || !Number.isFinite(row.raw) || !Number.isFinite(row.scaled) || !Number.isFinite(row.salience))) {
      throw new Error(`Fusion Canvas ${layer} links are missing weight/width provenance: ${JSON.stringify(rows)}`);
    }
    const uniqueWidths = new Set(rows.map((row) => row.width.toFixed(2)));
    const uniqueSignals = new Set(rows.map((row) => `${row.raw.toFixed(4)}:${row.scaled.toFixed(4)}:${row.salience.toFixed(4)}`));
    if ((layer === "social" || layer === "concept") && rows.length > 1 && uniqueSignals.size > 1 && uniqueWidths.size < 2) {
      throw new Error(`Fusion Canvas ${layer} links should use variable stroke widths, received ${JSON.stringify(rows)}.`);
    }
  }
}

async function uploadFilesByTestId(page, testId, files) {
  await page.locator(`[data-testid="${testId}"]`).first().setInputFiles(files, { timeout: defaultTimeout });
}

async function expectMetricValue(page, testId, expectedValue) {
  const text = await page.locator(`[data-testid="${testId}"]`).first().innerText({ timeout: defaultTimeout });
  const firstLine = text.split("\n")[0]?.trim();
  if (firstLine !== String(expectedValue)) {
    throw new Error(`Expected ${testId} to show ${expectedValue}, received ${JSON.stringify(text)}.`);
  }
}

async function expectLessonStudyCounts(page) {
  await expectMetricValue(page, "data-count-people", 4);
  await expectMetricValue(page, "data-count-codes", 7);
  await expectMetricValue(page, "data-count-utterances", 10);
  await expectMetricValue(page, "data-count-segments", 10);
  await expectMetricValue(page, "data-count-social-ties", 8);
}

async function verifySampleUploadPaths(page) {
  await clickByTestId(page, "clear-sena-contract");
  await waitForVisibleText(page, "No SENA contract loaded.");

  const contractTemplateText = await downloadTextByButton(page, /Contract template/i, "sena-data-contract-template.json");
  const contractTemplate = JSON.parse(contractTemplateText);
  for (const table of ["people", "interactions", "utterances", "coded_segments", "codebook"]) {
    if (!Array.isArray(contractTemplate[table]) || contractTemplate[table].length !== 0) {
      throw new Error(`Exported contract template table ${table} should be an empty array.`);
    }
  }
  await uploadTextPayloadByTestId(page, "sena-data-import-upload-input", "sena-data-contract-template.json", "application/json", contractTemplateText);
  await waitForVisibleText(page, "sena-data-contract-template.json: JSON contract loaded.");
  await expectMetricValue(page, "data-count-people", 0);
  await expectMetricValue(page, "data-count-codes", 0);
  await expectMetricValue(page, "data-count-utterances", 0);
  await expectMetricValue(page, "data-count-segments", 0);
  await expectMetricValue(page, "data-count-social-ties", 0);

  await uploadFilesByTestId(page, "sena-upload-input", sampleContractJsonPath);
  await waitForVisibleText(page, "lesson-study-sena-contract.json: JSON contract loaded.");
  await expectLessonStudyCounts(page);

  await clickByTestId(page, "clear-sena-contract");
  await waitForVisibleText(page, "No SENA contract loaded.");

  await uploadFilesByTestId(page, "sena-data-import-upload-input", sampleCsvPaths);
  await waitForVisibleText(page, "5 mapped tables loaded.");
  await expectLessonStudyCounts(page);
}

async function selectWorkspacePlotView(page, view, expectedText) {
  await clickByTestId(page, "workspace-plot-switcher");
  await clickByTestId(page, `workspace-plot-view-${view}`);
  const switcherText = await page.locator('[data-testid="workspace-plot-switcher"]').first().innerText({ timeout: defaultTimeout });
  assertTextIncludes(switcherText, expectedText, `workspace plot switcher ${view}`);
  await waitForVisibleText(page, expectedText);
}

async function expectWorkspaceRailPanel(page, mode, expectedTitle) {
  await activateButtonByTestId(page, `workspace-rail-${mode}`);
  await page.locator(`[data-testid="workspace-rail-${mode}"][aria-pressed="true"]`).first().waitFor({ state: "visible", timeout: defaultTimeout });
  const panel = page.locator('[data-testid="workspace-left-panel"]').first();
  await panel.getByText(expectedTitle, { exact: false }).first().waitFor({ state: "visible", timeout: defaultTimeout });
}

async function closeWorkspaceTaskDrawer(page) {
  const drawer = page.locator('[data-testid="workspace-left-panel-overlay"]').first();
  if (await drawer.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Close workspace panel" }).click({ timeout: defaultTimeout });
    await drawer.waitFor({ state: "hidden", timeout: defaultTimeout });
  }
}

async function openResearchDetailsTab(page, tab) {
  await closeWorkspaceTaskDrawer(page);
  const drawer = page.locator('[data-testid="workspace-research-details-drawer"]').first();
  if (await drawer.getAttribute("data-open") !== "true") {
    await clickByTestId(page, "workspace-research-details-toggle");
  }
  await page.locator(`[data-testid="workspace-research-details-tab-${tab}"]`).click({ timeout: defaultTimeout });
  await page.locator(`[data-testid="workspace-research-details-tab-${tab}"][aria-selected="true"]`).waitFor({ state: "visible", timeout: defaultTimeout });
  return page.locator(`#workspace-research-details-panel-${tab}`).first();
}

async function closeResearchDetailsDrawer(page) {
  const drawer = page.locator('[data-testid="workspace-research-details-drawer"]').first();
  if (await drawer.getAttribute("data-open") === "true") {
    await clickByTestId(page, "workspace-research-details-toggle");
    await page.locator('[data-testid="workspace-research-details-drawer"][data-open="false"]').waitFor({ state: "visible", timeout: defaultTimeout });
  }
}

async function verifyResponsiveWorkspaceShell(browser, url) {
  for (const width of [375, 768, 1024, 1440]) {
    const height = width >= 1280 ? 1100 : 900;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.locator(width < 1280
        ? '[data-testid="workspace-mobile-figure-composition"]'
        : '[data-testid="workspace-desktop-figure-composition"]').waitFor({ state: "visible", timeout: defaultTimeout });
      await page.locator('[data-testid="workspace-primary-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight
      }));
      if (layout.scrollWidth > layout.clientWidth) {
        throw new Error(`Responsive workspace overflows horizontally at ${width}px: ${JSON.stringify(layout)}.`);
      }
      if (width >= 1280 && layout.scrollHeight > layout.viewportHeight + 4) {
        throw new Error(`Desktop workspace exceeds the viewport height at ${width}px: ${JSON.stringify(layout)}.`);
      }

      const detailsDrawer = page.locator('[data-testid="workspace-research-details-drawer"]').first();
      if (await detailsDrawer.getAttribute("data-open") !== "false") {
        throw new Error(`Research Details should default closed at ${width}px.`);
      }
      if (await detailsDrawer.locator("table:visible").count() !== 0) {
        throw new Error(`Advanced tables should not be visible by default at ${width}px.`);
      }
      for (const selector of ['[data-testid="claim-readiness-gate"]', '[data-testid="enterprise-runtime-panel"]']) {
        if (await page.locator(`${selector}:visible`).count() !== 0) {
          throw new Error(`Advanced surface ${selector} should not be visible by default at ${width}px.`);
        }
      }
      const visibleFusionCanvasCount = await page.locator('[data-testid="sena-fusion-canvas"]:visible').count();
      if (visibleFusionCanvasCount !== 1) {
        throw new Error(`Expected exactly one visible Fusion Canvas at ${width}px, received ${visibleFusionCanvasCount}.`);
      }

      const mobileSwitcher = page.locator('[data-testid="workspace-mobile-figure-switcher"]').first();
      if (width < 1280) {
        await mobileSwitcher.waitFor({ state: "visible", timeout: defaultTimeout });
        if (await page.locator('[data-testid="workspace-mobile-figure-composition"] [role="tabpanel"]').count() !== 1) {
          throw new Error(`Responsive workspace should mount exactly one core tabpanel at ${width}px.`);
        }
        await page.locator('[data-testid="workspace-mobile-figure-fusion"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
        if (await page.locator('[data-testid="workspace-secondary-plot"]:visible').count() !== 0) {
          throw new Error(`Dual Lens should be hidden behind the responsive switcher at ${width}px.`);
        }
        await page.locator('[data-testid="workspace-mobile-figure-fusion"]').focus();
        await page.keyboard.press("ArrowLeft");
        await page.locator('[data-testid="workspace-mobile-figure-dual"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
        if (await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) !== "workspace-mobile-figure-dual") {
          throw new Error(`ArrowLeft should wrap Fusion focus to Dual Lens at ${width}px.`);
        }
        await page.keyboard.press("ArrowRight");
        await page.locator('[data-testid="workspace-mobile-figure-fusion"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
        if (await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) !== "workspace-mobile-figure-fusion") {
          throw new Error(`ArrowRight should wrap Dual Lens focus to Fusion at ${width}px.`);
        }
        await clickByTestId(page, "workspace-mobile-figure-dual");
        await page.locator('[data-testid="workspace-mobile-figure-dual"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
        await page.locator('[data-testid="workspace-secondary-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });
        if (await page.locator('[data-testid="workspace-primary-plot"]:visible').count() !== 0) {
          throw new Error(`Fusion should be hidden when Dual Lens is selected at ${width}px.`);
        }
        await clickByTestId(page, "workspace-mobile-figure-fusion");
        await page.locator('[data-testid="workspace-primary-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });
      } else {
        if (await mobileSwitcher.isVisible()) {
          throw new Error("The responsive figure switcher should be hidden at the desktop breakpoint.");
        }
        if (await page.locator('[role="tablist"]:visible, [role="tabpanel"]:visible').count() !== 0) {
          throw new Error("Desktop core figures should not expose mobile tablist or tabpanel semantics.");
        }
        await page.locator('[data-testid="workspace-secondary-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });
      }

      if (width === 1024) {
        await page.setViewportSize({ width: 1440, height });
        await page.locator('[data-testid="workspace-desktop-figure-composition"]').waitFor({ state: "visible", timeout: defaultTimeout });
        if (await page.locator('[data-testid="workspace-mobile-figure-switcher"]').count() !== 0) {
          throw new Error("Workspace matchMedia listener did not remove mobile tab semantics after widening the viewport.");
        }
        await page.locator('[data-testid="workspace-secondary-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });
        await page.setViewportSize({ width, height });
        await page.locator('[data-testid="workspace-mobile-figure-composition"]').waitFor({ state: "visible", timeout: defaultTimeout });
      }
    } finally {
      await context.close();
    }
  }
}

async function verifyResearchDetailsDrawer(page) {
  const drawer = page.locator('[data-testid="workspace-research-details-drawer"]').first();
  const toggle = page.locator('[data-testid="workspace-research-details-toggle"]').first();
  await drawer.waitFor({ state: "visible", timeout: defaultTimeout });

  const initialState = await drawer.getAttribute("data-open");
  if (initialState !== "false") {
    throw new Error(`Research Details should default closed, received data-open=${initialState}.`);
  }
  for (const advancedSelector of ['[role="tabpanel"]', "#sena-stats-deck", "#workflow-report", '[data-testid="enterprise-runtime-panel"]']) {
    if (await drawer.locator(advancedSelector).count() !== 0) {
      throw new Error(`Research Details mounted advanced content while closed: ${advancedSelector}.`);
    }
  }

  await toggle.click({ timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-research-details-tab-data"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('#workspace-research-details-panel-data').getByText("Raw Conversation Stream", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });

  const tabCases = [
    ["analysis", "#sena-stats-deck", "SNA Metrics"],
    ["evidence", "#workspace-research-details-panel-evidence", "Evidence Ledger"],
    ["validation", "#workspace-research-details-panel-validation", "Method Validation"],
    ["exports", "#workflow-report", "Report Generator"],
    ["administration", '[data-testid="enterprise-runtime-panel"]', "Enterprise runtime"]
  ];
  for (const [tab, contentSelector, uniqueText] of tabCases) {
    await page.locator(`[data-testid="workspace-research-details-tab-${tab}"]`).click({ timeout: defaultTimeout });
    await page.locator(`[data-testid="workspace-research-details-tab-${tab}"][aria-selected="true"]`).waitFor({ state: "visible", timeout: defaultTimeout });
    const content = drawer.locator(contentSelector).first();
    await content.waitFor({ state: "visible", timeout: defaultTimeout });
    await content.getByText(uniqueText, { exact: false }).first().waitFor({ state: "visible", timeout: defaultTimeout });
  }

  await activateButtonByTestId(page, "workspace-rail-model");
  const taskDrawer = page.locator('[data-testid="workspace-left-panel-overlay"]').first();
  await taskDrawer.waitFor({ state: "visible", timeout: defaultTimeout });
  await page.keyboard.press("Escape");
  await taskDrawer.waitFor({ state: "hidden", timeout: defaultTimeout });
  if (await drawer.getAttribute("data-open") !== "true") {
    throw new Error("First stacked Escape should leave Research Details open.");
  }
  await page.keyboard.press("Escape");
  if (await drawer.getAttribute("data-open") !== "false") {
    throw new Error("Second stacked Escape should close Research Details.");
  }
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-testid") === "workspace-research-details-toggle",
    undefined,
    { timeout: defaultTimeout }
  );
  const focusedAfterEscape = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
  if (focusedAfterEscape !== "workspace-research-details-toggle") {
    throw new Error(`Research Details Escape close should return focus to its toggle, received ${focusedAfterEscape || "no focus"}.`);
  }

  await page.evaluate(() => {
    window.location.hash = "#workflow-report";
  });
  await page.locator('[data-testid="workspace-research-details-tab-exports"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await drawer.locator("#workflow-report").waitFor({ state: "visible", timeout: defaultTimeout });

  await toggle.click({ timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-research-details-drawer"][data-open="false"]').waitFor({ state: "visible", timeout: defaultTimeout });
  if (await page.evaluate(() => window.location.hash) !== "") {
    throw new Error("Closing Research Details should clear its recognized report hash.");
  }
  await page.evaluate(() => {
    window.location.hash = "#workflow-report";
  });
  await page.locator('[data-testid="workspace-research-details-tab-exports"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await drawer.locator("#workflow-report").waitFor({ state: "visible", timeout: defaultTimeout });

  await page.evaluate(() => {
    window.location.hash = "#sena-stats-deck";
  });
  await page.locator('[data-testid="workspace-research-details-tab-analysis"][aria-selected="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await drawer.locator("#sena-stats-deck").waitFor({ state: "visible", timeout: defaultTimeout });

  await toggle.click({ timeout: defaultTimeout });
  if (await drawer.getAttribute("data-open") !== "false") {
    throw new Error("Research Details toggle did not close the drawer.");
  }
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-testid") === "workspace-research-details-toggle",
    undefined,
    { timeout: defaultTimeout }
  );
  const focusedAfterToggle = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
  if (focusedAfterToggle !== "workspace-research-details-toggle") {
    throw new Error(`Research Details toggle close should retain focus, received ${focusedAfterToggle || "no focus"}.`);
  }
  await page.evaluate(() => window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`));
}

async function verifyWorkspaceShellAndPlotViews(page) {
  await page.locator('[data-testid="sena-workspace-mode-rail"][data-visual-role="workspace-shell-c3-glass-rail"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-rail-icon-model"][data-icon-name="layer-stack"][data-visual-role="workspace-rail-model-layer-stack-icon"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-rail-icon-stats"][data-icon-name="network-metrics"][data-visual-role="workspace-rail-network-metrics-icon"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('circle[data-visual-role="ena-concept-circle-node"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await page.locator('[data-node-label="Question"][data-node-glyph="Q"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await page.locator('polygon[data-visual-role="sna-person-hex-node"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-central-plot-deck"][data-visual-role="workspace-central-plot-deck"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="central-fusion-analysis-scope"][data-visual-role="active-window-fusion-scope"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="central-fusion-priority-plot"][data-visual-role="fusion-plot-priority-stack"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="central-fusion-evidence-capsule"][data-visual-role="current-window-fusion-evidence-capsule"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="central-active-window-brief"][data-visual-role="active-window-interpretation-brief"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-primary-plot"][data-visual-role="workspace-primary-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-secondary-plot"][data-visual-role="workspace-secondary-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-secondary-comparison-lens"][data-visual-role="secondary-plot-current-window-comparison"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-secondary-ranking-context"][data-visual-role="secondary-plot-signal-ranking-context"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await verifyResearchDetailsDrawer(page);

  const centralDeck = page.locator('[data-testid="workspace-central-plot-deck"]').first();
  const centralDeckDefaults = await centralDeck.evaluate((element) => ({
    defaultPlotView: element.getAttribute("data-default-plot-view") ?? "",
    plotScope: element.getAttribute("data-plot-scope") ?? ""
  }));
  if (centralDeckDefaults.defaultPlotView !== "fusion" || centralDeckDefaults.plotScope !== "current-window") {
    throw new Error(`Central plot deck must default to the current-window Fusion Plot, received ${JSON.stringify(centralDeckDefaults)}.`);
  }
  const priorityPrecedesAnalysisScope = await page.locator('[data-testid="workspace-central-plot-deck"]').first().evaluate((deck) => {
    const priorityPlot = deck.querySelector('[data-testid="central-fusion-priority-plot"]');
    const analysisScope = deck.querySelector('[data-testid="central-fusion-analysis-scope"]');
    if (!priorityPlot || !analysisScope) return false;
    return (priorityPlot.compareDocumentPosition(analysisScope) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  if (!priorityPrecedesAnalysisScope) {
    throw new Error("Current-window Fusion plot stack must sit directly above the analysis scope.");
  }
  const fusionPriorityOrderIsSwapped = await page.locator('[data-testid="workspace-primary-plot"]').first().evaluate((primaryPlot) => {
    const canvasFrame = primaryPlot.querySelector('[data-testid="central-fusion-canvas-frame"]');
    const activeViewToolbar = primaryPlot.querySelector('[data-testid="central-active-view-toolbar"]');
    const layerKey = primaryPlot.querySelector('[data-testid="fusion-layer-key"]');
    if (!canvasFrame || !activeViewToolbar || !layerKey) return false;
    const canvasBeforeToolbar = (canvasFrame.compareDocumentPosition(activeViewToolbar) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const toolbarBeforeLayerKey = (activeViewToolbar.compareDocumentPosition(layerKey) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return canvasBeforeToolbar && toolbarBeforeLayerKey;
  });
  if (!fusionPriorityOrderIsSwapped) {
    throw new Error("Current-window Fusion plot order must be Canvas, Active view toolbar, then A1 layer key.");
  }

  const initialPlotSwitcherText = await page.locator('[data-testid="workspace-plot-switcher"]').first().innerText({ timeout: defaultTimeout });
  assertTextIncludes(initialPlotSwitcherText, "Fusion", "workspace default plot switcher");
  if (initialPlotSwitcherText.includes("Temporal")) {
    throw new Error(`Workspace default plot switcher should not open on Temporal: ${initialPlotSwitcherText}`);
  }
  await waitForVisibleText(page, "Fusion Plot - Current Window");
  await waitForVisibleText(page, "Top social tie");
  await waitForVisibleText(page, "Interpretation guardrail");
  await waitForVisibleText(page, "Current-window comparison lens");
  await page.locator('[data-testid="fusion-layer-key-line-weight-note"][data-visual-role="fusion-layer-key-line-weight-note"]').first().waitFor({ state: "visible", timeout: defaultTimeout });

  const dataViewDrawer = page.locator('[data-testid="workspace-data-view-drawer"][data-visual-role="workspace-bottom-data-view-drawer"]').first();
  await dataViewDrawer.waitFor({ state: "visible", timeout: defaultTimeout });
  const initialDataViewState = await dataViewDrawer.getAttribute("data-open");
  if (initialDataViewState !== "false") {
    throw new Error(`Workspace Data View drawer should default to collapsed, received data-open=${initialDataViewState}.`);
  }
  await activateButtonByTestId(page, "workspace-data-view-toggle");
  await page.locator('[data-testid="workspace-data-view-content"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-data-view-utterances"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-data-view-segments"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="workspace-data-view-interactions"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await waitForVisibleText(page, "Coded Segments");
  const openDataViewState = await dataViewDrawer.getAttribute("data-open");
  if (openDataViewState !== "true") {
    throw new Error(`Workspace Data View drawer did not expand, received data-open=${openDataViewState}.`);
  }
  await activateButtonByTestId(page, "workspace-data-view-toggle");
  const collapsedDataViewState = await dataViewDrawer.getAttribute("data-open");
  if (collapsedDataViewState !== "false") {
    throw new Error(`Workspace Data View drawer did not collapse, received data-open=${collapsedDataViewState}.`);
  }

  const centralFusionCanvasSelector = '[data-testid="central-fusion-priority-plot"] [data-testid="sena-fusion-canvas"]';
  await page.locator('[data-testid="fusion-plot-central-zoom-controls"][data-visual-role="fusion-plot-zoom-controls"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await waitForCanvasZoom(page, centralFusionCanvasSelector, "1.000");
  await activateButtonByTestId(page, "fusion-plot-central-zoom-in");
  await waitForCanvasZoom(page, centralFusionCanvasSelector, "1.125");
  await activateButtonByTestId(page, "fusion-plot-central-zoom-out");
  await waitForCanvasZoom(page, centralFusionCanvasSelector, "1.000");
  await activateButtonByTestId(page, "fusion-plot-central-zoom-out");
  await waitForCanvasZoom(page, centralFusionCanvasSelector, "0.875");
  await activateButtonByTestId(page, "fusion-plot-central-zoom-reset");
  await waitForCanvasZoom(page, centralFusionCanvasSelector, "1.000");

  await activateButtonByTestId(page, "maximize-fusion-plot");
  const maximizedFusionPlot = page.locator('[data-testid="fusion-plot-maximized-overlay"][data-visual-role="fusion-plot-maximized-window"]').first();
  await maximizedFusionPlot.waitFor({ state: "visible", timeout: defaultTimeout });
  await maximizedFusionPlot.locator('[data-testid="fusion-maximized-compact-key"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await maximizedFusionPlot.locator('[data-testid="fusion-plot-maximized-zoom-controls"][data-visual-role="fusion-plot-zoom-controls"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  const maximizedCanvas = maximizedFusionPlot.locator('[data-testid="sena-fusion-canvas"]').first();
  await maximizedCanvas.waitFor({ state: "visible", timeout: defaultTimeout });
  const maximizedFusionCanvasSelector = '[data-testid="fusion-plot-maximized-overlay"] [data-testid="sena-fusion-canvas"]';
  await waitForCanvasZoom(page, maximizedFusionCanvasSelector, "1.000");
  await activateButtonByTestId(page, "fusion-plot-maximized-zoom-in");
  await waitForCanvasZoom(page, maximizedFusionCanvasSelector, "1.125");
  await activateButtonByTestId(page, "fusion-plot-maximized-zoom-reset");
  await waitForCanvasZoom(page, maximizedFusionCanvasSelector, "1.000");
  const maximizedCanvasBox = await maximizedCanvas.boundingBox({ timeout: defaultTimeout });
  if (!maximizedCanvasBox || maximizedCanvasBox.width < 900 || maximizedCanvasBox.height < 500) {
    throw new Error(`Maximized Fusion plot canvas is too small: ${JSON.stringify(maximizedCanvasBox)}.`);
  }
  const bodyOverflowWhileMaximized = await page.evaluate(() => document.body.style.overflow);
  if (bodyOverflowWhileMaximized !== "hidden") {
    throw new Error(`Maximized Fusion plot should lock page scrolling, received body overflow ${JSON.stringify(bodyOverflowWhileMaximized)}.`);
  }
  await activateButtonByTestId(page, "restore-fusion-plot");
  await maximizedFusionPlot.waitFor({ state: "hidden", timeout: defaultTimeout });

  await expectWorkspaceRailPanel(page, "sets", "Data Import");
  await expectWorkspaceRailPanel(page, "model", "Model Builder");
  await expectWorkspaceRailPanel(page, "plots", "Plot Tools");
  await expectWorkspaceRailPanel(page, "stats", "Top actors");
  const statsRuntimeSnapshot = page.locator('[data-testid="stats-runtime-snapshot"][data-visual-role="stats-jena-jsna-runtime-snapshot"]').first();
  await statsRuntimeSnapshot.waitFor({ state: "visible", timeout: defaultTimeout });
  const statsRuntimeText = await statsRuntimeSnapshot.innerText({ timeout: defaultTimeout });
  assertTextIncludes(statsRuntimeText, "jENA", "workspace stats runtime snapshot");
  assertTextIncludes(statsRuntimeText, "jSNA", "workspace stats runtime snapshot");
  assertTextIncludes(statsRuntimeText.toLowerCase(), "live js", "workspace stats runtime snapshot");
  const statsMetricProvenanceSummary = page.locator('[data-testid="stats-metric-provenance-summary"][data-visual-role="stats-metric-provenance-summary"]').first();
  await statsMetricProvenanceSummary.waitFor({ state: "visible", timeout: defaultTimeout });
  const statsMetricProvenanceText = await statsMetricProvenanceSummary.innerText({ timeout: defaultTimeout });
  assertTextIncludes(statsMetricProvenanceText, "sena-metric-provenance/v1", "workspace stats metric provenance summary");
  assertTextIncludes(statsMetricProvenanceText, "Direct jSNA", "workspace stats metric provenance summary");
  assertTextIncludes(statsMetricProvenanceText, "jENA", "workspace stats metric provenance summary");
  assertTextIncludes(statsMetricProvenanceText, "SENA implemented", "workspace stats metric provenance summary");
  if (statsMetricProvenanceText.includes("SENA-derived")) {
    throw new Error("workspace stats metric provenance summary still advertises a SENA-derived metric source.");
  }
  const statsPlotSwitcherText = await page.locator('[data-testid="workspace-plot-switcher"]').first().innerText({ timeout: defaultTimeout });
  assertTextIncludes(statsPlotSwitcherText, "SNA", "workspace stats rail plot view");
  const statsTopGPair = page.locator('[data-testid="stats-top-g-pair"]').first();
  await statsTopGPair.waitFor({ state: "visible", timeout: defaultTimeout });
  const statsTopGPairTarget = await statsTopGPair.getAttribute("data-selection-target");
  if (!statsTopGPairTarget || !statsTopGPairTarget.startsWith("concept:")) {
    throw new Error(`Stats top G pair should select a real ENA concept edge, received ${statsTopGPairTarget ?? "missing"}.`);
  }
  await statsTopGPair.click();
  await page.locator('[data-testid="concept-edge-g-attribution"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await expectWorkspaceRailPanel(page, "plots", "Network Graph");
  await page.locator('[data-testid="plot-tools-dimensions-section"][data-visual-role="webena-plot-tools-section"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="plot-tools-plotted-points-section"][data-visual-role="webena-plot-tools-section"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="plot-tools-network-graph-section"][data-visual-role="webena-plot-tools-section"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="plot-tools-temporal-framing-section"][data-visual-role="webena-plot-tools-section"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  const plotToolsAdvancedDrawer = page.locator('[data-testid="plot-tools-advanced-drawer"][data-visual-role="webena-plot-tools-advanced-drawer"]').first();
  await plotToolsAdvancedDrawer.waitFor({ state: "visible", timeout: defaultTimeout });
  const initialPlotToolsAdvancedState = await plotToolsAdvancedDrawer.getAttribute("data-open");
  if (initialPlotToolsAdvancedState !== "false") {
    throw new Error(`Plot Tools Advanced Options drawer should default to collapsed, received data-open=${initialPlotToolsAdvancedState}.`);
  }
  await clickByTestId(page, "plot-tools-advanced-drawer-toggle");
  await page.locator('[data-testid="plot-tools-advanced-drawer-content"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  const openPlotToolsAdvancedState = await plotToolsAdvancedDrawer.getAttribute("data-open");
  if (openPlotToolsAdvancedState !== "true") {
    throw new Error(`Plot Tools Advanced Options drawer did not expand, received data-open=${openPlotToolsAdvancedState}.`);
  }
  await clickByTestId(page, "plot-tools-advanced-drawer-toggle");
  const plotToolsSwitcherText = await page.locator('[data-testid="workspace-plot-switcher"]').first().innerText({ timeout: defaultTimeout });
  assertTextIncludes(plotToolsSwitcherText, "Fusion", "workspace plot-tools rail plot view");

  const viewCases = [
    ["dual", "Dual Lens"],
    ["ena", "ENA Space"],
    ["sna", "SNA"],
    ["evidence", "Evidence"],
    ["matrix", "Matrix"],
    ["temporal", "Temporal"],
    ["fusion", "Fusion"]
  ];
  await closeWorkspaceTaskDrawer(page);
  for (const [view, label] of viewCases) {
    await selectWorkspacePlotView(page, view, label);
    if (view === "dual") {
      await page.locator('[data-testid="central-dual-lens-dashboard"][data-visual-role="dual-lens-dashboard"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
      await page.locator('[data-testid="central-dual-lens-runtime"][data-visual-role="dual-lens-runtime-handoff"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
      await waitForVisibleText(page, "jSNA social lens");
      await waitForVisibleText(page, "jENA epistemic lens");
      await waitForVisibleText(page, "SENA bridge lens");
    }
  }

  await page.locator('[data-testid="sena-fusion-canvas"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await waitForVisibleText(page, "A1 INNER SOLID MESH");
}

async function centralFusionScope(page) {
  const scope = await page.locator('[data-testid="central-fusion-analysis-scope"]').first().evaluate((element) => ({
    windowId: element.getAttribute("data-window-id") ?? "",
    windowLabel: element.getAttribute("data-window-label") ?? "",
    turns: element.getAttribute("data-window-turns") ?? "",
    checksum: element.getAttribute("data-a-fusion-checksum") ?? "",
    transitionId: element.getAttribute("data-transition-id") ?? "",
    deltaFusion: element.getAttribute("data-delta-fusion") ?? "",
    deltaG: element.getAttribute("data-delta-g") ?? "",
    text: element.textContent?.replace(/\s+/g, " ").trim() ?? ""
  }));
  const gPair = await page.locator('[data-testid="central-fusion-delta-g-pair"]').first().evaluate((element) => ({
    from: element.getAttribute("data-g-pair-from") ?? "",
    to: element.getAttribute("data-g-pair-to") ?? "",
    changed: element.getAttribute("data-g-pair-changed") ?? "",
    text: element.textContent?.replace(/\s+/g, " ").trim() ?? ""
  }));
  return { ...scope, gPair };
}

async function verifyActiveWindowFusionScope(page) {
  await selectWorkspacePlotView(page, "fusion", "Fusion");
  const planScope = await centralFusionScope(page);
  assertTextIncludes(planScope.windowLabel, "Plan", "default central Fusion analysis scope");
  if (!/^0x[a-f0-9]{8}$/.test(planScope.checksum)) {
    throw new Error(`Default central Fusion A_fusion checksum is not stable: ${planScope.checksum}.`);
  }
  if (!planScope.transitionId || !Number.isFinite(Number(planScope.deltaFusion)) || !Number.isFinite(Number(planScope.deltaG))) {
    throw new Error(`Default central Fusion adjacent-window delta is incomplete: ${JSON.stringify(planScope)}.`);
  }
  await page.locator('[data-testid="central-fusion-transition-delta"][data-visual-role="active-window-fusion-transition-delta"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="central-fusion-delta-g-pair"][data-visual-role="active-window-fusion-g-pair-driver"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await waitForVisibleText(page, "Adjacent-window delta");
  await waitForVisibleText(page, "Top G pair shift");
  if (!planScope.gPair.from || !planScope.gPair.to || !["true", "false"].includes(planScope.gPair.changed)) {
    throw new Error(`Default central Fusion G-pair shift is incomplete: ${JSON.stringify(planScope.gPair)}.`);
  }

  await selectWorkspacePlotView(page, "temporal", "Temporal");
  await page.locator('[data-testid="temporal-fusion-phase-teach"]').click({ timeout: defaultTimeout });
  await page.locator('[data-testid="temporal-fusion-phase-teach"][aria-pressed="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await selectWorkspacePlotView(page, "fusion", "Fusion");
  const teachScope = await centralFusionScope(page);
  assertTextIncludes(teachScope.windowLabel, "Teach", "Teach central Fusion analysis scope");
  if (!/^0x[a-f0-9]{8}$/.test(teachScope.checksum)) {
    throw new Error(`Teach central Fusion A_fusion checksum is not stable: ${teachScope.checksum}.`);
  }
  if (!teachScope.transitionId || !Number.isFinite(Number(teachScope.deltaFusion)) || !Number.isFinite(Number(teachScope.deltaG))) {
    throw new Error(`Teach central Fusion adjacent-window delta is incomplete: ${JSON.stringify(teachScope)}.`);
  }
  if (!teachScope.gPair.from || !teachScope.gPair.to || !["true", "false"].includes(teachScope.gPair.changed)) {
    throw new Error(`Teach central Fusion G-pair shift is incomplete: ${JSON.stringify(teachScope.gPair)}.`);
  }
  if (teachScope.checksum === planScope.checksum || teachScope.windowId === planScope.windowId) {
    throw new Error(`Central Fusion scope did not change after selecting Teach: before=${JSON.stringify(planScope)} after=${JSON.stringify(teachScope)}.`);
  }
  assertTextIncludes(teachScope.text, "Interpretation guardrail", "Teach central Fusion analysis scope text");
}

async function setRangeValue(page, testId, value) {
  await page.locator(`[data-testid="${testId}"]`).evaluate((element, nextValue) => {
    if (!(element instanceof HTMLInputElement)) throw new Error(`${nextValue} target is not an input.`);
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!valueSetter) throw new Error("HTMLInputElement value setter is unavailable.");
    valueSetter.call(element, String(nextValue));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function downloadTextByButton(page, buttonName, filename) {
  return downloadTextByLocator(page, page.getByRole("button", { name: buttonName }).first(), filename, `button ${buttonName}`);
}

async function downloadTextByTestId(page, testId, filename) {
  return downloadTextByLocator(page, page.locator(`[data-testid="${testId}"]`).first(), filename, `test id ${testId}`);
}

async function downloadTextByLocator(page, locator, filename, description) {
  await locator.waitFor({ state: "visible", timeout: defaultTimeout });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: defaultTimeout }),
    locator.evaluate((element) => element.click())
  ]);

  const suggested = download.suggestedFilename();
  if (suggested !== filename) {
    throw new Error(`Expected ${filename} download from ${description}, received ${suggested}.`);
  }

  const path = await download.path();
  if (!path) throw new Error(`Download path unavailable for ${filename}.`);
  return readFile(path, "utf8");
}

async function downloadJsonByButton(page, buttonName, filename, schemaVersion) {
  const text = await downloadTextByButton(page, buttonName, filename);
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion !== schemaVersion) {
    throw new Error(`Expected ${filename} schemaVersion ${schemaVersion}, received ${parsed?.schemaVersion}.`);
  }
  return { parsed, text };
}

async function downloadJsonByTestId(page, testId, filename, schemaVersion) {
  const text = await downloadTextByTestId(page, testId, filename);
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion !== schemaVersion) {
    throw new Error(`Expected ${filename} schemaVersion ${schemaVersion}, received ${parsed?.schemaVersion}.`);
  }
  return { parsed, text };
}

async function uploadTextPayloadByTestId(page, testId, name, mimeType, text) {
  await uploadFilesByTestId(page, testId, {
    name,
    mimeType,
    buffer: Buffer.from(text)
  });
}

function assertNumber(value, expected, label) {
  if (value !== expected) {
    throw new Error(`Expected ${label} to equal ${expected}, received ${value}.`);
  }
}

function assertTextIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} is missing ${JSON.stringify(expected)}.`);
  }
}

function assertTextIncludesOneOf(text, expectedValues, label) {
  if (!expectedValues.some((expected) => text.includes(expected))) {
    throw new Error(`${label} is missing one of ${expectedValues.map((expected) => JSON.stringify(expected)).join(", ")}.`);
  }
}

function assertArrayIncludes(values, expected, label) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${label} is missing ${JSON.stringify(expected)}.`);
  }
}

function sha256Hex(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

async function fetchPilotAssetText(page, url, href) {
  const assetUrl = new URL(href, url).toString();
  const response = await page.request.get(assetUrl, { timeout: defaultTimeout });
  if (!response.ok()) {
    throw new Error(`Pilot asset ${href} returned HTTP ${response.status()}.`);
  }
  return response.text();
}

async function verifyPilotAssetLinks(page, url) {
  await page.locator('[data-testid="pilot-assets-panel"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="pilot-assets-panel"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await page.locator('[data-testid="pilot-asset-integrity"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="pilot-asset-integrity"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  const integritySignal = await page.locator('[data-testid="pilot-asset-integrity"]').first().innerText({ timeout: defaultTimeout });
  assertTextIncludes(integritySignal, "13 manifest fingerprints", "pilot asset integrity signal");

  const links = await page.locator('[data-testid="pilot-asset-link"]').evaluateAll((anchors) => anchors.map((anchor) => ({
    href: anchor.getAttribute("href") ?? "",
    dataHref: anchor.getAttribute("data-asset-href") ?? "",
    kind: anchor.getAttribute("data-asset-kind") ?? "",
    label: anchor.textContent?.replace(/\s+/g, " ").trim() ?? ""
  })));
  if (links.length !== 14) {
    throw new Error(`Expected 14 pilot asset links, received ${links.length}.`);
  }
  for (const link of links) {
    if (link.href !== link.dataHref) {
      throw new Error(`Pilot asset link data href mismatch for ${link.label}: href=${link.href}; data=${link.dataHref}.`);
    }
    if (!["manifest", "sample", "template"].includes(link.kind)) {
      throw new Error(`Pilot asset link has unexpected kind ${JSON.stringify(link.kind)} for ${link.href}.`);
    }
  }

  const manifestLinks = links.filter((link) => link.kind === "manifest");
  const sampleLinks = links.filter((link) => link.kind === "sample");
  const templateLinks = links.filter((link) => link.kind === "template");
  if (manifestLinks.length !== 1 || sampleLinks.length !== 6 || templateLinks.length !== 7) {
    throw new Error(`Unexpected pilot asset counts: manifest=${manifestLinks.length}; sample=${sampleLinks.length}; template=${templateLinks.length}.`);
  }

  const manifest = JSON.parse(await fetchPilotAssetText(page, url, manifestLinks[0].href));
  if (manifest.schemaVersion !== "sena-pilot-package-manifest/v1") {
    throw new Error(`Pilot package manifest schema mismatch: ${manifest.schemaVersion}.`);
  }
  const sampleHrefs = sampleLinks.map((link) => link.href).sort();
  const templateHrefs = templateLinks.map((link) => link.href).sort();
  if (JSON.stringify(sampleHrefs) !== JSON.stringify([...manifest.assets.sample].sort())) {
    throw new Error("Pilot sample links do not match package manifest assets.sample.");
  }
  if (JSON.stringify(templateHrefs) !== JSON.stringify([...manifest.assets.templates].sort())) {
    throw new Error("Pilot template links do not match package manifest assets.templates.");
  }
  const integrityEntries = manifest.assetIntegrity ?? [];
  if (integrityEntries.length !== sampleLinks.length + templateLinks.length) {
    throw new Error(`Pilot manifest assetIntegrity should cover ${sampleLinks.length + templateLinks.length} assets, received ${integrityEntries.length}.`);
  }
  const expectedAssetHrefs = [...sampleHrefs, ...templateHrefs].sort();
  if (JSON.stringify(integrityEntries.map((asset) => asset.href).sort()) !== JSON.stringify(expectedAssetHrefs)) {
    throw new Error("Pilot manifest assetIntegrity hrefs do not match sample/template assets.");
  }
  for (const integrity of integrityEntries) {
    const text = await fetchPilotAssetText(page, url, integrity.href);
    const expectedKind = sampleHrefs.includes(integrity.href) ? "sample" : "template";
    const expectedFormat = integrity.href.endsWith(".json") ? "json" : "csv";
    if (integrity.kind !== expectedKind || integrity.format !== expectedFormat) {
      throw new Error(`Pilot assetIntegrity metadata mismatch for ${integrity.href}.`);
    }
    if (integrity.bytes !== Buffer.byteLength(text, "utf8")) {
      throw new Error(`Pilot assetIntegrity byte count mismatch for ${integrity.href}.`);
    }
    if (integrity.sha256 !== sha256Hex(text)) {
      throw new Error(`Pilot assetIntegrity sha256 mismatch for ${integrity.href}.`);
    }
  }
  if (manifest.sampleDataset.contract !== "/sena-pilot/sample/lesson-study-sena-contract.json") {
    throw new Error(`Unexpected lesson-study contract path: ${manifest.sampleDataset.contract}.`);
  }
  await page.locator('[data-testid="pilot-handoff-checks"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="pilot-handoff-checks"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  const handoffCheckElements = await page.locator('[data-testid="pilot-handoff-check"]').evaluateAll((items) => items.map((item) => ({
    id: item.getAttribute("data-handoff-check-id") ?? "",
    artifact: item.getAttribute("data-handoff-artifact") ?? "",
    label: item.textContent?.replace(/\s+/g, " ").trim() ?? ""
  })));
  if (handoffCheckElements.length !== manifest.handoffChecks.length) {
    throw new Error(`Expected ${manifest.handoffChecks.length} visible handoff checks, received ${handoffCheckElements.length}.`);
  }
  for (const check of manifest.handoffChecks) {
    const element = handoffCheckElements.find((candidate) => candidate.id === check.id);
    if (!element || element.artifact !== check.artifact) {
      throw new Error(`Visible handoff check ${check.id} does not match the pilot manifest.`);
    }
  }
  if (manifest.exportArtifactSchemas?.["sena-data-contract-audit.json"] !== "sena-data-contract-audit/v1") {
    throw new Error("Pilot manifest has stale data-contract audit schema.");
  }
  if (!manifest.exportArtifacts?.includes("sena-ena-report.json") ||
    manifest.exportArtifactSchemas?.["sena-ena-report.json"] !== "sena-ena-report/v1") {
    throw new Error("Pilot manifest has stale jENA report export artifact metadata.");
  }
  if (!manifest.exportArtifacts?.includes("sena-metric-provenance.json") ||
    manifest.exportArtifactSchemas?.["sena-metric-provenance.json"] !== "sena-metric-provenance/v1") {
    throw new Error("Pilot manifest has stale metric-provenance export artifact metadata.");
  }
  if (manifest.exportArtifactSchemas?.["sena-fusion-math-audit.json"] !== "sena-fusion-math-audit/v1") {
    throw new Error("Pilot manifest has stale fusion-math audit schema.");
  }
  if (manifest.exportArtifactSchemas?.["sena-runtime-consistency-audit.json"] !== "sena-runtime-consistency/v1") {
    throw new Error("Pilot manifest has stale runtime-consistency audit schema.");
  }
  if (!manifest.exportArtifacts?.includes("sena-coding-reliability-gate.json") ||
    manifest.exportArtifactSchemas?.["sena-coding-reliability-gate.json"] !== "sena-coding-reliability-gate/v1") {
    throw new Error("Pilot manifest has stale coding-reliability gate export artifact metadata.");
  }
  const handoffChecks = manifest.handoffChecks ?? [];
  const modelJsonHandoff = handoffChecks.find((check) => check.id === "model-json-export");
  if (modelJsonHandoff?.artifact !== "sena-project-snapshot.json") {
    throw new Error("Pilot manifest is missing the model-json-export handoff check.");
  }
  for (const expected of ["S/W/B/B_PC/B_CP/G matrices", "temporal trace windows"]) {
    if (!modelJsonHandoff.expectedEvidence?.includes(expected)) {
      throw new Error(`Pilot manifest model-json-export handoff is missing expected evidence ${expected}.`);
    }
  }
  const runtimeHandoff = handoffChecks.find((check) => check.id === "local-runtime-manifests");
  if (runtimeHandoff?.artifact !== "sena-runtime-bundle.json" ||
    !runtimeHandoff.expectedEvidence?.includes("sena-jena-manifest.json") ||
    !runtimeHandoff.expectedEvidence?.includes("sena-ena-report.json") ||
    !runtimeHandoff.expectedEvidence?.includes("sena-jsna-manifest.json") ||
    !runtimeHandoff.expectedEvidence?.includes("sena-runtime-consistency-audit.json") ||
    !runtimeHandoff.expectedEvidence?.includes("jena-api-surface") ||
    !runtimeHandoff.expectedEvidence?.includes("jsna-api-surface") ||
    !runtimeHandoff.expectedEvidence?.includes("jena-rena-parity") ||
    !runtimeHandoff.expectedEvidence?.includes("jsna-r-sna-parity") ||
    !runtimeHandoff.expectedEvidence?.includes("matrix-fingerprints")) {
    throw new Error("Pilot manifest is missing the local-runtime-manifests handoff check.");
  }
  const assetIntegrityHandoff = handoffChecks.find((check) => check.id === "pilot-asset-integrity");
  if (assetIntegrityHandoff?.artifact !== "sena-pilot-package-manifest.json" ||
    !assetIntegrityHandoff.expectedEvidence?.includes("assetIntegrity") ||
    !assetIntegrityHandoff.expectedEvidence?.includes("bytes") ||
    !assetIntegrityHandoff.expectedEvidence?.includes("sha256")) {
    throw new Error("Pilot manifest is missing the pilot-asset-integrity handoff check.");
  }
  const metricProvenanceHandoff = handoffChecks.find((check) => check.id === "metric-provenance");
  for (const expected of ["sna.js", "jena-js", "sena-self-implemented", "sena-composite", "socialMetricSnapshot", "epistemicMetricSnapshot", "fusionMetricSnapshot"]) {
    if (metricProvenanceHandoff?.artifact !== "sena-metric-provenance.json" || !metricProvenanceHandoff.expectedEvidence?.includes(expected)) {
      throw new Error(`Pilot manifest metric-provenance handoff is missing expected evidence ${expected}.`);
    }
  }

  const lessonStudyContract = JSON.parse(await fetchPilotAssetText(page, url, manifest.sampleDataset.contract));
  if (lessonStudyContract.people?.length !== manifest.sampleDataset.expectedCounts.people ||
    lessonStudyContract.utterances?.length !== manifest.sampleDataset.expectedCounts.utterances ||
    lessonStudyContract.coded_segments?.length !== manifest.sampleDataset.expectedCounts.codedSegments ||
    lessonStudyContract.codebook?.length !== manifest.sampleDataset.expectedCounts.codes) {
    throw new Error("Lesson-study JSON asset counts do not match the pilot manifest.");
  }
  const lessonStudyContractText = JSON.stringify(lessonStudyContract);
  for (const marker of bilingualEvidenceMarkers) {
    assertTextIncludes(lessonStudyContractText, marker, "lesson-study JSON bilingual evidence");
  }

  const templateContract = JSON.parse(await fetchPilotAssetText(page, url, "/sena-pilot/templates/sena-data-contract-template.json"));
  for (const table of ["people", "interactions", "utterances", "coded_segments", "codebook"]) {
    if (!Array.isArray(templateContract[table]) || templateContract[table].length !== 0) {
      throw new Error(`JSON contract template table ${table} should be an empty array.`);
    }
  }

  for (const link of [...sampleLinks, ...templateLinks].filter((asset) => asset.href.endsWith(".csv"))) {
    const csv = await fetchPilotAssetText(page, url, link.href);
    const firstLine = csv.split(/\r?\n/)[0] ?? "";
    if (!firstLine.includes(",")) {
      throw new Error(`CSV pilot asset ${link.href} is missing a header row.`);
    }
  }
  const sampleCsvText = (await Promise.all(sampleLinks.filter((asset) => asset.href.endsWith(".csv")).map((link) => fetchPilotAssetText(page, url, link.href)))).join("\n");
  for (const marker of bilingualEvidenceMarkers) {
    assertTextIncludes(sampleCsvText, marker, "lesson-study CSV bilingual evidence");
  }
}

async function prepareArtifactDownloadPage(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator('[data-testid="sena-fusion-canvas"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await expectWorkspaceRailPanel(page, "sets", "Data Import");
  await activateButtonByTestId(page, "load-lesson-study-sample");
  await waitForVisibleText(page, "Lesson-study sample loaded from the research pilot package.");
  await expectLessonStudyCounts(page);
  await activateButtonByTestId(page, "workspace-rail-model");
  await setRangeValue(page, "alpha-slider", "0.33");
  await setRangeValue(page, "beta-slider", "0.44");
  await setRangeValue(page, "gamma-slider", "0.55");
  await waitForVisibleText(page, "0.33");
  await waitForVisibleText(page, "0.44");
  await waitForVisibleText(page, "0.55");
  await expectWorkspaceRailPanel(page, "sets", "Data Import");
  return { context, page };
}

async function withPreparedArtifactDownloadPage(browser, url, callback) {
  const { context, page } = await prepareArtifactDownloadPage(browser, url);
  try {
    await callback(page);
  } finally {
    await context.close();
  }
}

async function verifyRuntimeMethodArtifactDownloads(page) {
  await openResearchDetailsTab(page, "exports");
  const { parsed: runtimeBundle } = await downloadJsonByButton(
    page,
    /Export runtime bundle/i,
    "sena-runtime-bundle.json",
    "sena-runtime-bundle/v1"
  );
  if (runtimeBundle.runtimes?.ena?.manifest?.schemaVersion !== "sena-ena-manifest/v1") {
    throw new Error("Runtime bundle is missing embedded jENA manifest provenance.");
  }
  if (runtimeBundle.runtimes?.sna?.manifest?.schemaVersion !== "sena-jsna-manifest/v1") {
    throw new Error("Runtime bundle is missing embedded jSNA manifest provenance.");
  }
  const artifactEvidence = Array.isArray(runtimeBundle.artifactEvidence) ? runtimeBundle.artifactEvidence : [];
  const artifactEvidenceFilenames = artifactEvidence.map((artifact) => artifact.filename);
  for (const filename of [
    "sena-jena-manifest.json",
    "sena-ena-report.json",
    "sena-jsna-manifest.json",
    "sena-sna-report.json",
    "sena-metric-provenance.json",
    "sena-person-code-pair-g-report.json",
    "sena-runtime-consistency-audit.json",
    "sena-pilot-package-manifest.json",
    "sena-coding-reliability-gate.json",
    "sena-runtime-bundle.json"
  ]) {
    assertArrayIncludes(artifactEvidenceFilenames, filename, "runtime bundle artifact evidence");
  }
  const enaReportEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json");
  if (enaReportEvidence?.status !== "ready" ||
    !enaReportEvidence.handoffChecks?.includes("jena-concept-matrix") ||
    !enaReportEvidence.handoffChecks?.includes("jena-rena-parity")) {
    throw new Error("Runtime bundle artifact evidence is missing ready jENA report handoff coverage.");
  }
  const jenaManifestEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-jena-manifest.json");
  if (jenaManifestEvidence?.status !== "ready" ||
    !jenaManifestEvidence.handoffChecks?.includes("jena-api-surface") ||
    !jenaManifestEvidence.handoffChecks?.includes("jena-rena-parity")) {
    throw new Error("Runtime bundle artifact evidence is missing jENA API surface handoff coverage.");
  }
  const snaReportEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json");
  if (snaReportEvidence?.status !== "ready" ||
    !snaReportEvidence.handoffChecks?.includes("jsna-social-matrix") ||
    !snaReportEvidence.handoffChecks?.includes("jsna-r-sna-parity")) {
    throw new Error("Runtime bundle artifact evidence is missing ready jSNA report handoff coverage.");
  }
  const metricProvenanceEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json");
  if (metricProvenanceEvidence?.status !== "ready" ||
    !metricProvenanceEvidence.handoffChecks?.includes("metric-provenance") ||
    !metricProvenanceEvidence.handoffChecks?.includes("interpretation-limits") ||
    !metricProvenanceEvidence.handoffChecks?.includes("jsna-social-matrix") ||
    !metricProvenanceEvidence.handoffChecks?.includes("jena-concept-matrix") ||
    !metricProvenanceEvidence.handoffChecks?.includes("fusion-matrix-snapshot") ||
    !metricProvenanceEvidence.matrixCoverage?.includes("snapshots=social|epistemic|fusion")) {
    throw new Error("Runtime bundle artifact evidence is missing metric-provenance handoff coverage.");
  }
  const jsnaManifestEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-jsna-manifest.json");
  if (jsnaManifestEvidence?.status !== "ready" ||
    !jsnaManifestEvidence.handoffChecks?.includes("jsna-api-surface") ||
    !jsnaManifestEvidence.handoffChecks?.includes("jsna-r-sna-parity")) {
    throw new Error("Runtime bundle artifact evidence is missing jSNA API surface handoff coverage.");
  }
  const runtimeAuditEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-consistency-audit.json");
  if (runtimeAuditEvidence?.status !== "ready" ||
    !runtimeAuditEvidence.handoffChecks?.includes("jena-api-surface") ||
    !runtimeAuditEvidence.handoffChecks?.includes("jena-rena-parity") ||
    !runtimeAuditEvidence.handoffChecks?.includes("jsna-r-sna-parity") ||
    !runtimeAuditEvidence.handoffChecks?.includes("jsna-api-surface")) {
    throw new Error("Runtime bundle artifact evidence is missing runtime API surface audit handoff coverage.");
  }
  const pilotManifestEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-pilot-package-manifest.json");
  if (pilotManifestEvidence?.status !== "ready" ||
    !pilotManifestEvidence.handoffChecks?.includes("pilot-asset-integrity") ||
    !pilotManifestEvidence.matrixCoverage?.includes("assetIntegrity=13") ||
    !pilotManifestEvidence.evidenceCoverage?.includes("sha256=13")) {
    throw new Error("Runtime bundle artifact evidence is missing pilot asset-integrity handoff coverage.");
  }
  const runtimeBundleEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-bundle.json");
  if (runtimeBundleEvidence?.status !== "ready" || !runtimeBundleEvidence.matrixCoverage?.some((entry) => String(entry).startsWith("A_fusion="))) {
    throw new Error("Runtime bundle artifact evidence is missing S/W/B/B_PC/B_CP/G/A_fusion matrix coverage.");
  }
  if (!runtimeBundleEvidence.handoffChecks?.includes("matrix-fingerprints") ||
    !runtimeBundleEvidence.evidenceCoverage?.includes("matrixFingerprints=7") ||
    !runtimeBundleEvidence.evidenceCoverage?.some((entry) => /^A_fusionChecksum=0x[a-f0-9]{8}$/.test(String(entry)))) {
    throw new Error("Runtime bundle artifact evidence is missing matrix fingerprint handoff coverage.");
  }
  const codingReliabilityEvidence = artifactEvidence.find((artifact) => artifact.filename === "sena-coding-reliability-gate.json");
  if (!codingReliabilityEvidence ||
    !codingReliabilityEvidence.handoffChecks?.includes("coding-reliability-gate") ||
    !codingReliabilityEvidence.matrixCoverage?.some((entry) => String(entry).startsWith("claimUse="))) {
    throw new Error("Runtime bundle artifact evidence is missing coding-reliability gate handoff coverage.");
  }
  assertArrayIncludes(runtimeBundle.developmentPlan?.requiredArtifacts, "sena-coding-reliability-gate.json", "runtime bundle development plan artifacts");
  assertArrayIncludes(runtimeBundle.developmentPlan?.requiredArtifacts, "sena-claim-readiness-gate.json", "runtime bundle development plan artifacts");
  assertArrayIncludes(runtimeBundle.developmentPlan?.requiredArtifacts, "sena-ena-report.json", "runtime bundle development plan artifacts");
  assertArrayIncludes(runtimeBundle.developmentPlan?.requiredArtifacts, "sena-metric-provenance.json", "runtime bundle development plan artifacts");
  assertArrayIncludes(runtimeBundle.demoVerification?.summary?.requiredArtifacts, "sena-review-packet.json", "runtime bundle demo verification artifacts");
  assertArrayIncludes(runtimeBundle.demoVerification?.summary?.requiredArtifacts, "sena-ena-report.json", "runtime bundle demo verification artifacts");
  assertArrayIncludes(runtimeBundle.demoVerification?.summary?.requiredArtifacts, "sena-metric-provenance.json", "runtime bundle demo verification artifacts");

  const { parsed: enaReport } = await downloadJsonByButton(
    page,
    /Export ENA report/i,
    "sena-ena-report.json",
    "sena-ena-report/v1"
  );
  if (enaReport.manifest?.schemaVersion !== "sena-ena-manifest/v1" || enaReport.manifest?.status !== "computed") {
    throw new Error("jENA report export is missing computed manifest provenance.");
  }
  assertArrayIncludes(enaReport.runtimeProvenance?.apiSurface, "ena()", "jENA report API surface");
  if (enaReport.runtimeConsistencyAudit?.items?.find((item) => item.id === "jena-concept-matrix")?.status !== "pass") {
    throw new Error("jENA report export is missing passing concept-pair handoff evidence.");
  }
  if (!enaReport.enaSpace?.connectionCounts?.length || !enaReport.conceptMatrix?.labels?.length) {
    throw new Error("jENA report export is missing ENA-space connection counts or W concept matrix labels.");
  }
  if (!enaReport.conceptPairHandoff?.some((row) => row.overlapStatus === "overlap" && row.jenaConnectionTotal > 0 && row.senaRawWeight > 0)) {
    throw new Error("jENA report export is missing concept-pair handoff rows linking jENA totals to SENA W weights.");
  }

  await closeResearchDetailsDrawer(page);
  await clickByTestId(page, "workspace-rail-stats");
  await waitForVisibleText(page, "Local runtime snapshot");
  const { parsed: snaReport } = await downloadJsonByButton(
    page,
    /Export SNA report/i,
    "sena-sna-report.json",
    "sena-sna-report/v1"
  );
  if (snaReport.manifest?.schemaVersion !== "sena-jsna-manifest/v1" || snaReport.manifest?.status !== "computed") {
    throw new Error("jSNA report export is missing computed manifest provenance.");
  }
  assertArrayIncludes(snaReport.runtimeProvenance?.apiSurface, "geodist()", "jSNA report API surface");
  if (!snaReport.socialMatrix?.labels?.length || snaReport.socialReport?.graph?.engine !== "sna.js") {
    throw new Error("jSNA report export is missing social matrix labels or sna.js graph provenance.");
  }
  if (!snaReport.socialTieHandoff?.some((row) => row.matrixAligned && row.edgeWeight > 0 && row.evidencePreview?.length > 0)) {
    throw new Error("jSNA report export is missing social-tie handoff rows linking jSNA matrix weights to SENA S edges.");
  }

  const { parsed: metricProvenance } = await downloadJsonByTestId(
    page,
    "export-stats-metric-provenance",
    "sena-metric-provenance.json",
    "sena-metric-provenance/v1"
  );
  if (!metricProvenance.metricProvenance?.some((metric) => metric.source === "sna.js") ||
    !metricProvenance.metricProvenance?.some((metric) => metric.source === "jena-js") ||
    !metricProvenance.metricProvenance?.some((metric) => metric.source === "sena-self-implemented") ||
    !metricProvenance.metricProvenance?.some((metric) => metric.source === "sena-composite")) {
    throw new Error("Metric provenance export is missing expected metric source separation.");
  }
  assertTextIncludes((metricProvenance.notes ?? []).join(" "), "jENA metrics", "metric provenance notes");
  assertTextIncludes((metricProvenance.notes ?? []).join(" "), "SENA composite metrics", "metric provenance notes");
  assertTextIncludes((metricProvenance.notes ?? []).join(" "), "social, epistemic, and fusion snapshots", "metric provenance notes");
  assertTextIncludes(metricProvenance.metricProvenance?.find((metric) => metric.id === "betweenness")?.parityStatus ?? "", "R sna::betweenness", "metric provenance betweenness parity");
  if (metricProvenance.coverage?.totalMetrics !== metricProvenance.metricProvenance?.length ||
    !metricProvenance.socialMetricSnapshot?.socialMatrix?.labels?.length) {
    throw new Error("Metric provenance export is missing coverage counts or social metric snapshot.");
  }
  if (!metricProvenance.socialMetricSnapshot?.socialTieHandoff?.some((row) => row.matrixAligned && row.edgeWeight > 0)) {
    throw new Error("Metric provenance export is missing jSNA social-tie handoff evidence.");
  }
  if (metricProvenance.epistemicMetricSnapshot?.manifest?.schemaVersion !== "sena-ena-manifest/v1" ||
    metricProvenance.epistemicMetricSnapshot?.runtimeConsistencyAudit?.status !== "consistent" ||
    !metricProvenance.epistemicMetricSnapshot?.conceptMatrix?.labels?.length ||
    !metricProvenance.epistemicMetricSnapshot?.enaSpace?.connectionCounts?.length ||
    !metricProvenance.epistemicMetricSnapshot?.conceptPairHandoff?.some((row) => row.overlapStatus === "overlap")) {
    throw new Error("Metric provenance export is missing jENA manifest, W matrix, or runtime consistency evidence.");
  }
  if (!Number.isFinite(metricProvenance.fusionMetricSnapshot?.parameters?.alpha) ||
    !Number.isFinite(metricProvenance.fusionMetricSnapshot?.parameters?.beta) ||
    !Number.isFinite(metricProvenance.fusionMetricSnapshot?.parameters?.gamma) ||
    typeof metricProvenance.fusionMetricSnapshot?.parameters?.normalization !== "string" ||
    !metricProvenance.fusionMetricSnapshot?.matrices?.S?.labels?.length ||
    !metricProvenance.fusionMetricSnapshot?.matrices?.W?.labels?.length ||
    !metricProvenance.fusionMetricSnapshot?.matrices?.B?.rowLabels?.length ||
    !metricProvenance.fusionMetricSnapshot?.matrices?.G?.pairs?.length ||
    !metricProvenance.fusionMetricSnapshot?.matrices?.fusion?.labels?.length ||
    !(metricProvenance.fusionMetricSnapshot?.layerTotals?.total > 0)) {
    throw new Error("Metric provenance export is missing S/W/B/G/fusion matrix snapshots or layer totals.");
  }

  const { parsed: methodProtocol } = await downloadJsonByTestId(
    page,
    "export-stats-method-protocol",
    "sena-method-protocol.json",
    "sena-method-protocol/v1"
  );
  if (methodProtocol.auditSummary?.runtimeConsistency?.status !== "consistent" ||
    methodProtocol.auditSummary?.fusionMath?.status !== "verified" ||
    methodProtocol.runtimeHandoffs?.map((handoff) => handoff.id).join("|") !== "jena-concept-matrix|jsna-social-matrix|fusion-math" ||
    !methodProtocol.runtimeHandoffs?.every((handoff) => handoff.status === "pass") ||
    !methodProtocol.runtimeHandoffs?.find((handoff) => handoff.id === "jsna-social-matrix")?.summary?.includes("socialTieRows=")) {
    throw new Error("Method protocol export is missing runtime handoff evidence for jENA, jSNA, or fusion math.");
  }

  await openResearchDetailsTab(page, "exports");
  const { parsed: runtimeAudit } = await downloadJsonByButton(
    page,
    /Export runtime audit/i,
    "sena-runtime-consistency-audit.json",
    "sena-runtime-consistency/v1"
  );
  if (runtimeAudit.status !== "consistent") {
    throw new Error(`Runtime consistency audit export should be consistent for the lesson-study sample, received ${runtimeAudit.status}.`);
  }
  const jenaConceptAudit = runtimeAudit.items?.find((item) => item.id === "jena-concept-matrix");
  if (jenaConceptAudit?.status !== "pass" || !String(jenaConceptAudit.actual ?? "").includes("overlap=")) {
    throw new Error("Runtime consistency audit export is missing the jENA concept-pair handoff pass evidence.");
  }
  const jenaApiSurfaceAudit = runtimeAudit.items?.find((item) => item.id === "jena-api-surface");
  if (jenaApiSurfaceAudit?.status !== "pass" || !String(jenaApiSurfaceAudit.actual ?? "").includes("ena()")) {
    throw new Error("Runtime consistency audit export is missing the jENA API surface pass evidence.");
  }
  const jenaRenaParityAudit = runtimeAudit.items?.find((item) => item.id === "jena-rena-parity");
  if (jenaRenaParityAudit?.status !== "pass" ||
    !String(jenaRenaParityAudit.actual ?? "").includes("r-ena-sample-parity") ||
    !String(jenaRenaParityAudit.actual ?? "").includes("lineWeights")) {
    throw new Error("Runtime consistency audit export is missing the jENA rENA fixture parity evidence.");
  }
  const jsnaRSnaParityAudit = runtimeAudit.items?.find((item) => item.id === "jsna-r-sna-parity");
  if (jsnaRSnaParityAudit?.status !== "pass" ||
    !String(jsnaRSnaParityAudit.actual ?? "").includes("r-sna-social-parity") ||
    !String(jsnaRSnaParityAudit.actual ?? "").includes("graphFamilies=5")) {
    throw new Error("Runtime consistency audit export is missing the jSNA R sna fixture parity evidence.");
  }
  const jsnaApiSurfaceAudit = runtimeAudit.items?.find((item) => item.id === "jsna-api-surface");
  if (jsnaApiSurfaceAudit?.status !== "pass" || !String(jsnaApiSurfaceAudit.actual ?? "").includes("geodist()")) {
    throw new Error("Runtime consistency audit export is missing the jSNA API surface pass evidence.");
  }
  const jsnaSocialMatrixAudit = runtimeAudit.items?.find((item) => item.id === "jsna-social-matrix");
  if (jsnaSocialMatrixAudit?.status !== "pass" ||
    !String(jsnaSocialMatrixAudit.actual ?? "").includes("socialTieRows=") ||
    !String(jsnaSocialMatrixAudit.actual ?? "").includes("alignedTieRows=") ||
    jsnaSocialMatrixAudit.metrics?.socialTieHandoffAligned !== true) {
    throw new Error("Runtime consistency audit export is missing jSNA social-tie handoff matrix evidence.");
  }

  await closeResearchDetailsDrawer(page);
  await expectWorkspaceRailPanel(page, "sets", "Data Import");
  const { parsed: dataAudit } = await downloadJsonByButton(
    page,
    /Export data audit/i,
    "sena-data-contract-audit.json",
    "sena-data-contract-audit/v1"
  );
  if (dataAudit.status !== "valid") {
    throw new Error(`Data contract audit export should be valid for the lesson-study sample, received ${dataAudit.status}.`);
  }

  const fusionMathAudit = runtimeBundle.fusionMathAudit;
  if (fusionMathAudit?.schemaVersion !== "sena-fusion-math-audit/v1") {
    throw new Error("Runtime bundle is missing the archived fusion math audit.");
  }
  if (fusionMathAudit.status !== "verified") {
    throw new Error(`Archived fusion math audit should be verified, received ${fusionMathAudit.status}.`);
  }
  const matrixFingerprints = Array.isArray(fusionMathAudit.matrixFingerprints) ? fusionMathAudit.matrixFingerprints : [];
  const matrixFingerprintIds = matrixFingerprints.map((fingerprint) => fingerprint.id).join("|");
  if (matrixFingerprintIds !== "S|W|B|B_PC|B_CP|G|A_fusion" ||
    !matrixFingerprints.every((fingerprint) => fingerprint.checksumAlgorithm === "sena-stable-fnv1a32/v1" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum))) {
    throw new Error("Fusion math audit export is missing stable S/W/B/B_PC/B_CP/G/A_fusion matrix fingerprints.");
  }

  await openResearchDetailsTab(page, "analysis");
  const { parsed: temporalTrace } = await downloadJsonByButton(
    page,
    /Export temporal runtime/i,
    "sena-temporal-runtime-trace.json",
    "sena-temporal-runtime-trace/v1"
  );
  if (!temporalTrace.windows?.some((entry) => entry.ena?.status === "computed" && entry.sna?.status === "computed")) {
    throw new Error("Temporal runtime trace export is missing computed jENA/jSNA window status.");
  }
  if (!temporalTrace.windows?.every((entry) => entry.sena?.matrixFingerprints?.length === 7) ||
    !temporalTrace.windows?.some((entry) => entry.sena?.matrixFingerprints?.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))) {
    throw new Error("Temporal runtime trace export is missing per-window matrix fingerprints.");
  }
  if (!temporalTrace.transitions?.length ||
    !temporalTrace.transitions.some((transition) => transition.direction && transition.delta && Number.isFinite(transition.delta.G))) {
    throw new Error("Temporal runtime trace export is missing adjacent-window transition delta evidence.");
  }

  await openResearchDetailsTab(page, "evidence");
  const { parsed: evidenceLedger } = await downloadJsonByButton(
    page,
    /Export evidence ledger/i,
    "sena-evidence-ledger.json",
    "sena-evidence-ledger/v1"
  );
  if (!evidenceLedger.snippets?.length) {
    throw new Error("Evidence ledger export is missing evidence snippets.");
  }
  if (!evidenceLedger.snippets.some((snippet) => snippet.lineage?.table && snippet.lineage?.rowId)) {
    throw new Error("Evidence ledger export is missing five-table evidence lineage.");
  }
  assertTextIncludesOneOf(JSON.stringify(evidenceLedger), bilingualEvidenceMarkers, "evidence ledger bilingual evidence");
}

async function verifyWorkflowHandoffArtifactDownloads(page) {
  await openResearchDetailsTab(page, "exports");
  const { parsed: walkthrough } = await downloadJsonByButton(
    page,
    /Export walkthrough JSON/i,
    "sena-demo-walkthrough.json",
    "sena-demo-walkthrough/v1"
  );
  if (walkthrough.summary?.totalSteps < 6) {
    throw new Error("Demo walkthrough export is missing the six-step workflow.");
  }
  if (!walkthrough.steps?.some((step) => step.exportArtifacts?.includes("sena-coding-reliability-gate.json"))) {
    throw new Error("Demo walkthrough export is missing the coding-reliability gate artifact.");
  }
  if (!walkthrough.steps?.some((step) => step.exportArtifacts?.includes("sena-metric-provenance.json"))) {
    throw new Error("Demo walkthrough export is missing the metric-provenance artifact.");
  }
  if (!walkthrough.steps?.some((step) => step.exportArtifacts?.includes("sena-claim-readiness-gate.json"))) {
    throw new Error("Demo walkthrough export is missing the claim-readiness gate artifact.");
  }
  if (!walkthrough.steps?.some((step) => step.exportArtifacts?.includes("sena-ena-report.json"))) {
    throw new Error("Demo walkthrough export is missing the standalone jENA report artifact.");
  }

  const { parsed: verification } = await downloadJsonByButton(
    page,
    /Export verification JSON/i,
    "sena-demo-verification.json",
    "sena-demo-verification/v1"
  );
  assertArrayIncludes(verification.summary?.requiredArtifacts, "sena-review-packet.json", "demo verification required artifacts");
  assertArrayIncludes(verification.summary?.requiredArtifacts, "sena-ena-report.json", "demo verification required artifacts");
  assertArrayIncludes(verification.summary?.requiredArtifacts, "sena-metric-provenance.json", "demo verification required artifacts");
  assertArrayIncludes(verification.summary?.requiredArtifacts, "sena-coding-reliability-gate.json", "demo verification required artifacts");
  assertArrayIncludes(verification.summary?.requiredArtifacts, "sena-claim-readiness-gate.json", "demo verification required artifacts");
  const sampleImportCheck = verification.checks?.find((check) => check.id === "sample-import");
  if (!sampleImportCheck?.manualAction?.includes("assetIntegrity fingerprints") ||
    !sampleImportCheck?.expectedOutcome?.includes("manifest fingerprints")) {
    throw new Error("Demo verification sample-import check is missing asset-integrity manual review wording.");
  }
  assertArrayIncludes(sampleImportCheck.observedEvidence, "assetIntegrity=13", "demo verification sample-import evidence");
  assertArrayIncludes(sampleImportCheck.observedEvidence, "assetIntegritySha256=13", "demo verification sample-import evidence");
  assertArrayIncludes(sampleImportCheck.observedEvidence, "handoff=pilot-asset-integrity", "demo verification sample-import evidence");

  const { parsed: compatibilityAudit } = await downloadJsonByButton(
    page,
    /Export compatibility audit/i,
    "sena-demo-verification-compatibility-audit.json",
    "sena-demo-verification-compatibility/v1"
  );
  if (compatibilityAudit.status !== "compatible") {
    throw new Error(`Demo verification compatibility export should be compatible, received ${compatibilityAudit.status}.`);
  }

  const { parsed: pageContract } = await downloadJsonByButton(
    page,
    /Export page contract/i,
    "sena-production-page-contract.json",
    "sena-production-page-contract/v1"
  );
  for (const c3ShellCheckId of [
    "workspace-shell-rail",
    "workspace-plot-switcher",
    "workspace-plot-tools-dimensions-section",
    "workspace-plot-tools-plotted-points-section",
    "workspace-plot-tools-network-graph-section",
    "workspace-plot-tools-temporal-framing-section",
    "workspace-plot-tools-advanced-drawer",
    "workspace-plot-tools-advanced-drawer-role",
    "workspace-central-plot-deck",
    "workspace-central-default-fusion",
    "workspace-central-current-window-scope",
    "workspace-bottom-data-view-drawer",
    "workspace-bottom-data-view-drawer-role",
    "workspace-bottom-data-view-toggle",
    "central-fusion-analysis-scope",
    "central-fusion-evidence-capsule",
    "central-fusion-evidence-capsule-role",
    "central-fusion-transition-delta",
    "central-fusion-delta-g-pair",
    "workspace-primary-plot",
    "workspace-secondary-plot",
    "workspace-secondary-comparison-lens",
    "workspace-secondary-comparison-lens-role"
  ]) {
    if (!pageContract.visualChecks?.some((check) => check.id === c3ShellCheckId)) {
      throw new Error(`Production page contract export is missing the C3 shell visual check ${c3ShellCheckId}.`);
    }
  }
  if (!pageContract.visualChecks?.some((check) => check.id === "review-packet-method-protocol-handoff")) {
    throw new Error("Production page contract export is missing the review-packet method-protocol handoff visual check.");
  }
  if (!pageContract.visualChecks?.some((check) => check.id === "review-packet-project-snapshot-handoff")) {
    throw new Error("Production page contract export is missing the review-packet project-snapshot handoff visual check.");
  }
  if (!pageContract.visualChecks?.some((check) => check.id === "review-packet-development-plan-handoff")) {
    throw new Error("Production page contract export is missing the review-packet development-plan handoff visual check.");
  }
  if (!pageContract.visualChecks?.some((check) => check.id === "next-stage-development-plan")) {
    throw new Error("Production page contract export is missing the next-stage development plan visual check.");
  }
  if (!pageContract.sections?.some((section) => section.id === "next-stage-plan")) {
    throw new Error("Production page contract export is missing the next-stage plan required-text section.");
  }

  const { parsed: developmentPlan } = await downloadJsonByButton(
    page,
    /Export development plan/i,
    "sena-development-plan.json",
    "sena-development-plan/v1"
  );
  assertArrayIncludes(developmentPlan.requiredArtifacts, "sena-method-protocol.json", "development plan required artifacts");
  assertArrayIncludes(developmentPlan.requiredArtifacts, "sena-project-snapshot.json", "development plan required artifacts");
  assertArrayIncludes(developmentPlan.requiredArtifacts, "sena-coding-reliability-gate.json", "development plan required artifacts");
  assertArrayIncludes(developmentPlan.requiredArtifacts, "sena-claim-readiness-gate.json", "development plan required artifacts");
  assertTextIncludes(
    developmentPlan.scope?.inScope?.join(" ") ?? "",
    "Restorable model JSON snapshot export",
    "development plan model JSON scope"
  );
  if (!developmentPlan.runtimeParityEvidence?.some((evidence) => evidence.id === "jena-rena-sample-parity" && evidence.fixturePath === "lib/ena/__fixtures__/r-ena-sample-parity.json")) {
    throw new Error("Development plan export is missing structured jENA rENA parity evidence.");
  }
  if (!developmentPlan.runtimeParityEvidence?.some((evidence) => evidence.id === "jsna-r-sna-social-parity" && evidence.fixturePath === "lib/sena/__fixtures__/r-sna-social-parity.json")) {
    throw new Error("Development plan export is missing structured jSNA R sna parity evidence.");
  }
  assertTextIncludes(
    developmentPlan.scope?.inScope?.join(" ") ?? "",
    "parity fixture evidence",
    "development plan runtime parity scope"
  );
  assertTextIncludes(
    developmentPlan.phases?.find((phase) => phase.id === "runtime-foundation")?.deliverables?.join(" ") ?? "",
    "jSNA/R sna + igraph parity evidence",
    "development plan runtime parity deliverables"
  );
  assertTextIncludes(
    developmentPlan.phases?.find((phase) => phase.id === "runtime-foundation")?.exitCriteria?.join(" ") ?? "",
    "jSNA/R sna fixture parity",
    "development plan runtime parity exit criteria"
  );
  if (developmentPlan.nextStage?.horizon !== "post-delivery-candidate") {
    throw new Error("Development plan export is missing the post-delivery next-stage horizon.");
  }
  if (developmentPlan.nextStage?.priority !== "research-validation-before-platform") {
    throw new Error("Development plan export is missing the research-validation-before-platform priority.");
  }
  assertArrayIncludes(
    developmentPlan.nextStage?.phases?.map((phase) => phase.id) ?? [],
    "pilot-handoff-freeze",
    "development plan next-stage phases"
  );
  assertArrayIncludes(
    developmentPlan.nextStage?.phases?.map((phase) => phase.id) ?? [],
    "researcher-walkthrough",
    "development plan next-stage phases"
  );
  assertArrayIncludes(
    developmentPlan.nextStage?.phases?.map((phase) => phase.id) ?? [],
    "research-validation",
    "development plan next-stage phases"
  );
  assertArrayIncludes(
    developmentPlan.nextStage?.phases?.map((phase) => phase.id) ?? [],
    "platform-decision-gate",
    "development plan next-stage phases"
  );
  assertTextIncludes(
    developmentPlan.nextStage?.releaseGate?.dataScenarios?.join(" ") ?? "",
    "Chinese and Cantonese",
    "development plan next-stage data scenarios"
  );
  assertTextIncludes(
    developmentPlan.nextStage?.releaseGate?.regressionRules?.join(" ") ?? "",
    "A1 Inner Solid Mesh",
    "development plan next-stage regression rules"
  );
  assertTextIncludes(
    developmentPlan.nextStage?.publicInterfacePolicy?.join(" ") ?? "",
    "sena-project-snapshot/v1",
    "development plan next-stage public interface policy"
  );

  const { parsed: readinessAudit } = await downloadJsonByButton(
    page,
    /Export readiness JSON/i,
    "sena-pilot-readiness-audit.json",
    "sena-pilot-readiness/v1"
  );
  if (!readinessAudit.items?.some((item) => item.id === "human-review")) {
    throw new Error("Pilot readiness export is missing the human-review gate item.");
  }
  const modelJsonReadiness = readinessAudit.items?.find((item) => item.id === "model-json-export");
  if (!modelJsonReadiness) {
    throw new Error("Pilot readiness export is missing the model-json-export gate item.");
  }
  assertTextIncludes(modelJsonReadiness.summary ?? "", "sena-project-snapshot.json", "model JSON readiness summary");
  assertArrayIncludes(modelJsonReadiness.evidence, "artifact=sena-project-snapshot.json", "model JSON readiness evidence");
}

async function verifyDeclaredResearchArtifactDownloads(browser, url) {
  await withPreparedArtifactDownloadPage(browser, url, verifyRuntimeMethodArtifactDownloads);
  await withPreparedArtifactDownloadPage(browser, url, verifyWorkflowHandoffArtifactDownloads);
}

async function verifyArtifactDownloadsAndRestore(page) {
  await openResearchDetailsTab(page, "exports");
  const { parsed: snapshot, text: snapshotText } = await downloadJsonByButton(
    page,
    /Export project snapshot/i,
    "sena-project-snapshot.json",
    "sena-project-snapshot/v1"
  );
  assertNumber(snapshot.reproducibility?.buildOptions?.alpha, 0.33, "snapshot alpha");
  assertNumber(snapshot.reproducibility?.buildOptions?.beta, 0.44, "snapshot beta");
  assertNumber(snapshot.reproducibility?.buildOptions?.gamma, 0.55, "snapshot gamma");
  assertNumber(snapshot.source?.sourceDatasetCounts?.utterances, 10, "snapshot source utterances");
  if (!snapshot.analysis?.nodes?.some((node) => node.kind === "person") ||
    !snapshot.analysis?.nodes?.some((node) => node.kind === "concept")) {
    throw new Error("Project snapshot model JSON is missing person/concept nodes.");
  }
  const snapshotEdgeLayers = snapshot.analysis?.edges?.map((edge) => edge.layer) ?? [];
  for (const layer of ["social", "concept", "bridge"]) {
    assertArrayIncludes(snapshotEdgeLayers, layer, "snapshot model edge layers");
  }
  for (const matrix of ["S", "W", "B", "G"]) {
    if (!Array.isArray(snapshot.analysis?.matrices?.[matrix]?.raw) ||
      !Array.isArray(snapshot.analysis?.matrices?.[matrix]?.normalized)) {
      throw new Error(`Project snapshot model JSON is missing matrix ${matrix}.`);
    }
  }
  if (!Array.isArray(snapshot.analysis?.matrices?.G?.pairs) ||
    !snapshot.analysis.matrices.G.pairs.length) {
    throw new Error("Project snapshot model JSON is missing G pair metadata.");
  }
  if (!Array.isArray(snapshot.analysis?.matrices?.fusion?.values)) {
    throw new Error("Project snapshot model JSON is missing fusion matrix values.");
  }
  if (!snapshot.analysis?.temporalRuntimeTrace?.windows?.length) {
    throw new Error("Project snapshot model JSON is missing temporal runtime trace windows.");
  }
  if (!snapshot.analysis?.temporalRuntimeTrace?.transitions?.length) {
    throw new Error("Project snapshot model JSON is missing temporal runtime transition evidence.");
  }
  for (const marker of bilingualEvidenceMarkers) {
    assertTextIncludes(snapshotText, marker, "project snapshot bilingual evidence");
  }

  const { parsed: reportJson } = await downloadJsonByButton(page, /Export report JSON/i, "sena-analysis-report.json", "sena-report/v1");
  assertTextIncludes(reportJson.runtimeProvenance?.enaRuntime?.dependencySpec ?? "", "vendor/jena-js", "report JSON jENA provenance");
  assertTextIncludes(reportJson.runtimeProvenance?.snaRuntime?.dependencySpec ?? "", "vendor/sna-js", "report JSON jSNA provenance");
  if (!reportJson.runtimeProvenance?.parityEvidence?.some((evidence) => evidence.id === "jena-rena-sample-parity" && evidence.referenceRuntime === "rENA")) {
    throw new Error("Report JSON is missing jENA rENA fixture parity provenance.");
  }
  if (!reportJson.runtimeProvenance?.parityEvidence?.some((evidence) => evidence.id === "jsna-r-sna-social-parity" && evidence.referenceRuntime === "R sna + igraph")) {
    throw new Error("Report JSON is missing jSNA R sna fixture parity provenance.");
  }
  if (reportJson.claimReadinessGate?.schemaVersion !== "sena-claim-readiness-gate/v1") {
    throw new Error("Report JSON is missing the claim-readiness gate.");
  }
  assertTextIncludes(reportJson.claimReadinessGate?.claimUse ?? "", "exploratory-only", "report JSON claim readiness");
  if (reportJson.codingReliabilityGate?.schemaVersion !== "sena-coding-reliability-gate/v1") {
    throw new Error("Report JSON is missing the coding-reliability gate.");
  }
  assertTextIncludes(reportJson.codingReliabilityGate?.claimUse ?? "", "coding-reliability-needed", "report JSON coding reliability");
  if (!reportJson.claimReadinessGate?.blockers?.includes("Coding reliability")) {
    throw new Error("Report JSON claim-readiness gate does not block on coding reliability by default.");
  }
  const temporalNarrative = reportJson.figures?.temporalRuntimeNarrative ?? [];
  if (!temporalNarrative.some((entry) => entry.strongestGPair?.totalContribution > 0)) {
    throw new Error("Report JSON temporalRuntimeNarrative is missing a strongest G pair.");
  }
  const temporalTransitions = reportJson.figures?.temporalRuntimeTransitions ?? [];
  if (!temporalTransitions.length || !temporalTransitions.some((transition) => Number.isFinite(transition.delta?.G))) {
    throw new Error("Report JSON temporalRuntimeTransitions is missing adjacent-window delta evidence.");
  }
  const activeWindowComparison = reportJson.figures?.activeWindowComparison;
  if (!activeWindowComparison || activeWindowComparison.baselineScope !== "full-conversation") {
    throw new Error("Report JSON is missing the active-window comparison against the full conversation.");
  }
  const comparisonMetricIds = (activeWindowComparison.metrics ?? []).map((metric) => metric.id).join("|");
  if (comparisonMetricIds !== "sna-density|social-ties|ena-links|bridge-links|g-total|fusion-total") {
    throw new Error(`Report JSON active-window comparison has unexpected metrics: ${comparisonMetricIds}.`);
  }
  if (!activeWindowComparison.topSignals?.currentTopConceptTie?.label || !activeWindowComparison.topSignals?.baselineTopGPair?.label) {
    throw new Error("Report JSON active-window comparison is missing top W/G signals.");
  }
  const rankingContextIds = (activeWindowComparison.rankingContext ?? []).map((entry) => entry.id).join("|");
  if (rankingContextIds !== "top-social-tie|top-concept-tie|top-bridge-tie|top-g-pair") {
    throw new Error(`Report JSON active-window comparison has unexpected ranking context: ${rankingContextIds}.`);
  }
  if (!(activeWindowComparison.rankingContext ?? []).some((entry) => entry.layer === "W" && entry.baselineRank !== null) ||
    !(activeWindowComparison.rankingContext ?? []).some((entry) => entry.layer === "G" && entry.baselineShare !== null)) {
    throw new Error("Report JSON active-window comparison ranking context is missing W rank or G share evidence.");
  }
  const activeWindowBrief = reportJson.figures?.activeWindowBrief;
  if (!activeWindowBrief || activeWindowBrief.schemaVersion !== "sena-active-window-brief/v1") {
    throw new Error("Report JSON is missing the active-window interpretation brief.");
  }
  if ((activeWindowBrief.dominantSignals ?? []).map((signal) => signal.layer).join("|") !== "S|W|B|G" ||
    !(activeWindowBrief.evidenceCues ?? []).length ||
    (activeWindowBrief.reviewChecklist ?? []).map((item) => item.id).join("|") !== "active-window-baseline|evidence-ledger|coding-reliability|human-review") {
    throw new Error("Report JSON active-window brief is missing S/W/B/G signals, evidence cues, or review checklist.");
  }
  const reportMatrixFingerprints = reportJson.fusionMathAudit?.matrixFingerprints ?? [];
  if (reportMatrixFingerprints.map((fingerprint) => fingerprint.id).join("|") !== "S|W|B|B_PC|B_CP|G|A_fusion" ||
    !reportMatrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum))) {
    throw new Error("Report JSON is missing stable fusion-math matrix fingerprints.");
  }
  assertTextIncludesOneOf(JSON.stringify(reportJson), bilingualEvidenceMarkers, "report JSON bilingual evidence");

  const { parsed: codingReliabilityGate } = await downloadJsonByButton(
    page,
    /Export reliability gate/i,
    "sena-coding-reliability-gate.json",
    "sena-coding-reliability-gate/v1"
  );
  assertTextIncludes(codingReliabilityGate.claimUse ?? "", "coding-reliability-needed", "coding reliability gate export");
  if (codingReliabilityGate.status !== reportJson.codingReliabilityGate.status) {
    throw new Error("Coding reliability gate export status does not match the report JSON coding-reliability gate.");
  }

  const { parsed: claimReadinessGate } = await downloadJsonByButton(
    page,
    /Export claim gate JSON/i,
    "sena-claim-readiness-gate.json",
    "sena-claim-readiness-gate/v1"
  );
  assertTextIncludes(claimReadinessGate.claimUse ?? "", "exploratory-only", "claim gate export");
  if (claimReadinessGate.status !== reportJson.claimReadinessGate.status) {
    throw new Error("Claim gate export status does not match the report JSON claim-readiness gate.");
  }

  const reportMarkdown = await downloadTextByButton(page, /Export report MD/i, "sena-analysis-report.md");
  assertTextIncludes(reportMarkdown, "## Runtime Provenance", "report Markdown");
  assertTextIncludes(reportMarkdown, "### Runtime Parity Evidence", "report Markdown");
  assertTextIncludes(reportMarkdown, "jena-rena-sample-parity", "report Markdown");
  assertTextIncludes(reportMarkdown, "jsna-r-sna-social-parity", "report Markdown");
  assertTextIncludes(reportMarkdown, "## Fusion Math Audit", "report Markdown");
  assertTextIncludes(reportMarkdown, "### Matrix Fingerprints", "report Markdown");
  assertTextIncludes(reportMarkdown, "sena-stable-fnv1a32", "report Markdown matrix fingerprints");
  assertTextIncludes(reportMarkdown, "## Claim Readiness Gate", "report Markdown");
  assertTextIncludes(reportMarkdown, "## Coding Reliability Gate", "report Markdown");
  assertTextIncludes(reportMarkdown, "Exploratory until coding reliability", "report Markdown claim readiness");
  assertTextIncludes(reportMarkdown, "Lineage: table=", "report Markdown evidence lineage");
  assertTextIncludes(reportMarkdown, "Top G pair", "report Markdown temporal narrative");
  assertTextIncludes(reportMarkdown, "Lead contributor", "report Markdown temporal narrative");
  assertTextIncludes(reportMarkdown, "## Active Window Comparison", "report Markdown active-window comparison");
  assertTextIncludes(reportMarkdown, "| Metric | Window | Full conversation | Delta | Share |", "report Markdown active-window comparison");
  assertTextIncludes(reportMarkdown, "| Ranking context | Layer | Current-window top signal | Window weight | Full-conversation weight | Full rank | Full share |", "report Markdown active-window ranking context");
  assertTextIncludes(reportMarkdown, "Top current-window W tie", "report Markdown active-window ranking context");
  assertTextIncludes(reportMarkdown, "## Active Window Brief", "report Markdown active-window brief");
  assertTextIncludes(reportMarkdown, "sena-active-window-brief/v1", "report Markdown active-window brief");
  assertTextIncludes(reportMarkdown, "### Brief Review Checklist", "report Markdown active-window brief");
  assertTextIncludes(reportMarkdown, "### Temporal Transitions", "report Markdown temporal transitions");
  assertTextIncludes(reportMarkdown, "Delta A_fusion", "report Markdown temporal transitions");
  assertTextIncludesOneOf(reportMarkdown, bilingualEvidenceMarkers, "report Markdown bilingual evidence");

  const { parsed: reviewPacket, text: reviewPacketText } = await downloadJsonByButton(
    page,
    /Export review packet/i,
    "sena-review-packet.json",
    "sena-review-packet/v1"
  );
  const visualGrammar = reviewPacket.contents?.visualGrammarArtifact;
  if (visualGrammar?.schemaVersion !== "sena-visual-grammar/v1") {
    throw new Error("Review packet is missing the archived visual grammar artifact.");
  }
  const visualGrammarIds = visualGrammar.visualGrammar?.map((item) => item.id) ?? [];
  if (!visualGrammarIds.includes("fusion-canvas-a1") || !visualGrammarIds.includes("temporal-fusion-arc") || !visualGrammarIds.includes("workspace-shell-c3-collapsed-switcher")) {
    throw new Error(`Archived visual grammar artifact is missing adopted grammar ids: ${visualGrammarIds.join(", ")}.`);
  }
  if (!visualGrammar.referenceAssets?.some((asset) => asset.id === "a1-inner-solid-mesh-mockup" && asset.role === "adopted-reference" && asset.path === "output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png" && asset.bytes === 730212 && asset.sha256 === "fa123f9d29c4df8a62d02acf85045761749a3170a554b054ff5006498f1bb399")) {
    throw new Error("Archived visual grammar artifact is missing the adopted A1 Inner Solid Mesh mockup reference.");
  }
  if (!visualGrammar.referenceAssets?.some((asset) => asset.id === "temporal-fusion-arc-mockup" && asset.role === "adopted-reference" && asset.path === "output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png" && asset.bytes === 675378 && asset.sha256 === "0bb2ca6c5e9418e90572cfd956bcbfcbde34ec4d27aa3946cc8433a7048bb4bb")) {
    throw new Error("Archived visual grammar artifact is missing the adopted Temporal Fusion Arc mockup reference.");
  }
  if (!visualGrammar.referenceAssets?.some((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup" && asset.role === "adopted-reference" && asset.path === "output/sena-workspace-layout-options/sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher.png" && asset.bytes === 145251 && asset.sha256 === "bc7c350686c6f3e3af9f0ed3acd3fcaee10bc423cd8be95a36bf88010392d7aa")) {
    throw new Error("Archived visual grammar artifact is missing the adopted C3 Workspace Shell mockup reference.");
  }
  const temporalGrammar = visualGrammar.visualGrammar?.find((item) => item.id === "temporal-fusion-arc");
  assertTextIncludes(temporalGrammar?.visualEncoding ?? "", "S/W/B/G", "Temporal Fusion visual grammar");
  assertTextIncludes(temporalGrammar?.visualEncoding ?? "", "top G pair labels", "Temporal Fusion visual grammar");
  const workspaceShellGrammar = visualGrammar.visualGrammar?.find((item) => item.id === "workspace-shell-c3-collapsed-switcher");
  assertTextIncludes(workspaceShellGrammar?.visualEncoding ?? "", "metric provenance summary", "Workspace shell visual grammar");
  assertTextIncludes(workspaceShellGrammar?.dataMapping ?? "", "direct jSNA", "Workspace shell visual grammar");
  assertTextIncludes(workspaceShellGrammar?.dataMapping ?? "", "SENA composite", "Workspace shell visual grammar");
  assertTextIncludes(temporalGrammar?.dataMapping ?? "", "active person-code-pair counts", "Temporal Fusion visual grammar");
  assertTextIncludes(temporalGrammar?.dataMapping ?? "", "strongest G pair labels", "Temporal Fusion visual grammar");
  assertTextIncludes(workspaceShellGrammar?.visualEncoding ?? "", "collapsed Plots switcher", "Workspace shell visual grammar");
  assertTextIncludes(workspaceShellGrammar?.visualEncoding ?? "", "Apple-style glass tiles", "Workspace shell visual grammar");
  if (reviewPacket.contents?.projectSnapshot?.schemaVersion !== "sena-project-snapshot/v1") {
    throw new Error("Review packet is missing embedded project snapshot.");
  }
  if (!reviewPacket.artifactManifest?.some((artifact) => artifact.filename === "sena-person-code-pair-g-report.json")) {
    throw new Error("Review packet artifact manifest is missing the G report artifact.");
  }
  if (!reviewPacket.artifactManifest?.some((artifact) => artifact.filename === "sena-runtime-consistency-audit.json")) {
    throw new Error("Review packet artifact manifest is missing the runtime consistency audit artifact.");
  }
  if (!reviewPacket.artifactManifest?.some((artifact) => artifact.filename === "sena-ena-report.json")) {
    throw new Error("Review packet artifact manifest is missing the standalone jENA report artifact.");
  }
  if (!reviewPacket.artifactManifest?.some((artifact) => artifact.filename === "sena-metric-provenance.json")) {
    throw new Error("Review packet artifact manifest is missing the metric-provenance artifact.");
  }
  if (reviewPacket.contents?.enaReportArtifact?.schemaVersion !== "sena-ena-report/v1" ||
    reviewPacket.contents?.enaReportArtifact?.manifest?.status !== "computed") {
    throw new Error("Review packet is missing embedded computed jENA report artifact.");
  }
  if (reviewPacket.contents?.enaReportArtifact?.runtimeConsistencyAudit?.items?.find((item) => item.id === "jena-concept-matrix")?.status !== "pass") {
    throw new Error("Review packet jENA report artifact is missing passing concept-pair handoff evidence.");
  }
  if (reviewPacket.contents?.metricProvenanceArtifact?.schemaVersion !== "sena-metric-provenance/v1" ||
    !reviewPacket.contents?.metricProvenanceArtifact?.metricProvenance?.some((metric) => metric.source === "sena-self-implemented") ||
    reviewPacket.contents?.metricProvenanceArtifact?.epistemicMetricSnapshot?.manifest?.status !== "computed" ||
    reviewPacket.contents?.metricProvenanceArtifact?.epistemicMetricSnapshot?.runtimeConsistencyAudit?.status !== "consistent" ||
    !reviewPacket.contents?.metricProvenanceArtifact?.fusionMetricSnapshot?.matrices?.fusion?.labels?.length) {
    throw new Error("Review packet is missing embedded metric-provenance artifact.");
  }
  if (reviewPacket.contents?.runtimeConsistencyAudit?.schemaVersion !== "sena-runtime-consistency/v1") {
    throw new Error("Review packet is missing embedded runtime consistency audit.");
  }
  if (reviewPacket.contents.runtimeConsistencyAudit.items?.find((item) => item.id === "jena-concept-matrix")?.status !== "pass") {
    throw new Error("Review packet runtime consistency audit is missing passing jENA concept-pair handoff evidence.");
  }
  if (reviewPacket.contents.runtimeConsistencyAudit.items?.find((item) => item.id === "jena-api-surface")?.status !== "pass") {
    throw new Error("Review packet runtime consistency audit is missing passing jENA API surface evidence.");
  }
  if (reviewPacket.contents.runtimeConsistencyAudit.items?.find((item) => item.id === "jena-rena-parity")?.status !== "pass") {
    throw new Error("Review packet runtime consistency audit is missing passing jENA rENA fixture parity evidence.");
  }
  if (reviewPacket.contents.runtimeConsistencyAudit.items?.find((item) => item.id === "jsna-r-sna-parity")?.status !== "pass") {
    throw new Error("Review packet runtime consistency audit is missing passing jSNA R sna fixture parity evidence.");
  }
  if (reviewPacket.contents.runtimeConsistencyAudit.items?.find((item) => item.id === "jsna-api-surface")?.status !== "pass") {
    throw new Error("Review packet runtime consistency audit is missing passing jSNA API surface evidence.");
  }
  const standaloneRuntimeHandoff = reviewPacket.reviewPacketAudit?.items?.find((item) => item.id === "standalone-runtime-artifacts");
  if (standaloneRuntimeHandoff?.status !== "pass") {
    throw new Error("Review packet audit is missing a passing standalone-runtime-artifacts item.");
  }
  assertArrayIncludes(standaloneRuntimeHandoff.evidence, "runtimeParity=jena-rena-parity:pass|jsna-r-sna-parity:pass", "review packet standalone runtime parity evidence");
  assertArrayIncludes(
    standaloneRuntimeHandoff.evidence,
    "runtimeArtifactHandoff=sena-jsna-manifest.json:jsna-api-surface,jsna-local-dependency,jsna-r-sna-parity,jsna-manifest-status",
    "review packet standalone runtime parity evidence"
  );
  assertArrayIncludes(
    standaloneRuntimeHandoff.evidence,
    "runtimeArtifactHandoff=sena-sna-report.json:jsna-r-sna-parity,jsna-social-matrix,sena-sna-report/v1",
    "review packet standalone runtime parity evidence"
  );
  if (!standaloneRuntimeHandoff.evidence?.some((entry) => String(entry).startsWith("fusionMathFingerprints=S:0x"))) {
    throw new Error("Review packet standalone runtime handoff is missing matrix fingerprint evidence.");
  }
  const reportBundleHandoff = reviewPacket.reviewPacketAudit?.items?.find((item) => item.id === "report-bundle-consistency");
  if (reportBundleHandoff?.status !== "pass" ||
    !String(reportBundleHandoff.actual ?? "").includes("matrixFingerprints=7") ||
    !reportBundleHandoff.evidence?.includes("matrixFingerprintIds=S|W|B|B_PC|B_CP|G|A_fusion")) {
    throw new Error("Review packet report-bundle handoff is missing matrix fingerprint consistency evidence.");
  }
  const packetMatrixFingerprints = reviewPacket.contents?.fusionMathAudit?.matrixFingerprints ?? [];
  if (packetMatrixFingerprints.map((fingerprint) => fingerprint.id).join("|") !== "S|W|B|B_PC|B_CP|G|A_fusion") {
    throw new Error("Review packet fusion math audit is missing S/W/B/B_PC/B_CP/G/A_fusion matrix fingerprints.");
  }
  if (reviewPacket.contents?.visualGrammarArtifact?.schemaVersion !== "sena-visual-grammar/v1") {
    throw new Error("Review packet is missing embedded visual grammar artifact.");
  }
  if (!reviewPacket.contents?.visualGrammarArtifact?.referenceAssets?.some((asset) => asset.id === "a1-inner-solid-mesh-mockup" && asset.path === "output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png" && asset.sha256 === "fa123f9d29c4df8a62d02acf85045761749a3170a554b054ff5006498f1bb399")) {
    throw new Error("Review packet visual grammar artifact is missing the A1 mockup reference.");
  }
  if (!reviewPacket.contents?.visualGrammarArtifact?.referenceAssets?.some((asset) => asset.id === "temporal-fusion-arc-mockup" && asset.path === "output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png" && asset.sha256 === "0bb2ca6c5e9418e90572cfd956bcbfcbde34ec4d27aa3946cc8433a7048bb4bb")) {
    throw new Error("Review packet visual grammar artifact is missing the Temporal Fusion Arc mockup reference.");
  }
  if (!reviewPacket.contents?.visualGrammarArtifact?.referenceAssets?.some((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup" && asset.path === "output/sena-workspace-layout-options/sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher.png" && asset.sha256 === "bc7c350686c6f3e3af9f0ed3acd3fcaee10bc423cd8be95a36bf88010392d7aa")) {
    throw new Error("Review packet visual grammar artifact is missing the C3 Workspace Shell mockup reference.");
  }
  if (!reviewPacket.artifactManifest?.some((artifact) => artifact.filename === "sena-visual-grammar.json")) {
    throw new Error("Review packet artifact manifest is missing the visual grammar artifact.");
  }
  if (!reviewPacket.artifactManifest?.some((artifact) => artifact.filename === "sena-claim-readiness-gate.json")) {
    throw new Error("Review packet artifact manifest is missing the claim-readiness gate artifact.");
  }
  if (!reviewPacket.artifactManifest?.some((artifact) => artifact.filename === "sena-coding-reliability-gate.json")) {
    throw new Error("Review packet artifact manifest is missing the coding-reliability gate artifact.");
  }
  if (reviewPacket.contents?.claimReadinessGate?.schemaVersion !== "sena-claim-readiness-gate/v1") {
    throw new Error("Review packet is missing embedded claim-readiness gate.");
  }
  if (reviewPacket.contents?.codingReliabilityGate?.schemaVersion !== "sena-coding-reliability-gate/v1") {
    throw new Error("Review packet is missing embedded coding-reliability gate.");
  }
  const pilotPackageHandoff = reviewPacket.reviewPacketAudit?.items?.find((item) => item.id === "pilot-package-manifest");
  if (pilotPackageHandoff?.status !== "pass") {
    throw new Error("Review packet audit is missing a passing pilot-package manifest handoff item.");
  }
  assertTextIncludes(pilotPackageHandoff.actual ?? "", "assetIntegrityCoverage=true", "review packet pilot package handoff");
  assertArrayIncludes(pilotPackageHandoff.evidence, "assetIntegrity=13", "review packet pilot package handoff evidence");
  assertArrayIncludes(pilotPackageHandoff.evidence, "runtimeArtifact=sena-runtime-bundle.json", "review packet pilot package runtime handoff evidence");
  assertArrayIncludes(
    pilotPackageHandoff.evidence,
    "runtimeEvidence=sena-jena-manifest.json|sena-ena-report.json|sena-jsna-manifest.json|sena-runtime-consistency-audit.json|jena-api-surface|jsna-api-surface|jena-rena-parity|jsna-r-sna-parity|matrix-fingerprints|file:vendor/jena-js|file:vendor/sna-js",
    "review packet pilot package runtime handoff evidence"
  );
  if (!reviewPacket.contents?.pilotPackageManifest?.assetIntegrity?.some((asset) => asset.href === "/sena-pilot/sample/lesson-study-sena-contract.json" && /^[a-f0-9]{64}$/.test(asset.sha256))) {
    throw new Error("Review packet pilot package manifest is missing lesson-study asset integrity fingerprint.");
  }
  const projectSnapshotHandoff = reviewPacket.reviewPacketAudit?.items?.find((item) => item.id === "project-snapshot-handoff");
  if (projectSnapshotHandoff?.status !== "pass") {
    throw new Error("Review packet audit is missing a passing project-snapshot handoff item.");
  }
  assertTextIncludes(projectSnapshotHandoff.actual ?? "", "modelJsonGate=ready", "review packet project snapshot handoff");
  assertArrayIncludes(projectSnapshotHandoff.evidence, "edgeLayers=bridge|concept|social", "review packet project snapshot handoff evidence");
  assertArrayIncludes(projectSnapshotHandoff.evidence, "readiness=model-json-export:ready", "review packet project snapshot handoff evidence");
  const developmentPlanHandoff = reviewPacket.reviewPacketAudit?.items?.find((item) => item.id === "development-plan-handoff");
  if (developmentPlanHandoff?.status !== "pass") {
    throw new Error("Review packet audit is missing a passing development-plan handoff item.");
  }
  assertTextIncludes(developmentPlanHandoff.actual ?? "", "missingPacket=0", "review packet development-plan handoff");
  assertTextIncludes(developmentPlanHandoff.actual ?? "", "missingPilot=0", "review packet development-plan handoff");
  assertArrayIncludes(developmentPlanHandoff.evidence, "runtimeParityEvidence=jsna-r-sna-social-parity:covered", "review packet development-plan handoff evidence");
  assertArrayIncludes(developmentPlanHandoff.evidence, "phase=research-validation:deferred", "review packet development-plan handoff evidence");
  const methodProtocolHandoff = reviewPacket.reviewPacketAudit?.items?.find((item) => item.id === "method-protocol-handoff");
  if (methodProtocolHandoff?.status !== "pass") {
    throw new Error("Review packet audit is missing a passing method-protocol handoff item.");
  }
  if (!methodProtocolHandoff.evidence?.includes("runtimeParityEvidence=jena-rena-sample-parity:covered")) {
    throw new Error("Review packet method-protocol handoff audit does not include jENA rENA fixture parity evidence.");
  }
  if (!methodProtocolHandoff.evidence?.includes("runtimeParityEvidence=jsna-r-sna-social-parity:covered")) {
    throw new Error("Review packet method-protocol handoff audit does not include jSNA R sna fixture parity evidence.");
  }
  if (!methodProtocolHandoff.evidence?.includes("runtimeConsistency=consistent") ||
    !methodProtocolHandoff.evidence?.includes("fusionMath=verified") ||
    !methodProtocolHandoff.evidence?.includes("runtimeHandoffs=jena-concept-matrix|jsna-social-matrix|fusion-math") ||
    !methodProtocolHandoff.evidence?.includes("runtimeHandoff=jsna-social-matrix:pass")) {
    throw new Error("Review packet method-protocol handoff audit does not include method runtime handoff evidence.");
  }
  if (!methodProtocolHandoff.evidence?.includes("companion=sena-pilot-package-manifest.json")) {
    throw new Error("Review packet method-protocol handoff audit does not include the pilot package manifest companion artifact.");
  }
  if (!methodProtocolHandoff.evidence?.includes("companion=sena-coding-reliability-gate.json")) {
    throw new Error("Review packet method-protocol handoff audit does not include the coding-reliability companion artifact.");
  }
  if (!methodProtocolHandoff.evidence?.includes("companion=sena-metric-provenance.json")) {
    throw new Error("Review packet method-protocol handoff audit does not include the metric-provenance companion artifact.");
  }
  if (!methodProtocolHandoff.evidence?.includes("companion=sena-claim-readiness-gate.json")) {
    throw new Error("Review packet method-protocol handoff audit does not include the claim-readiness companion artifact.");
  }
  if (!reviewPacket.contents?.methodProtocol?.requiredCompanionArtifacts?.includes("sena-pilot-package-manifest.json")) {
    throw new Error("Review packet method protocol is missing the pilot package manifest companion artifact.");
  }
  if (!reviewPacket.contents?.methodProtocol?.requiredCompanionArtifacts?.includes("sena-coding-reliability-gate.json")) {
    throw new Error("Review packet method protocol is missing the coding-reliability companion artifact.");
  }
  if (!reviewPacket.contents?.methodProtocol?.requiredCompanionArtifacts?.includes("sena-metric-provenance.json")) {
    throw new Error("Review packet method protocol is missing the metric-provenance companion artifact.");
  }
  if (!reviewPacket.contents?.methodProtocol?.requiredCompanionArtifacts?.includes("sena-claim-readiness-gate.json")) {
    throw new Error("Review packet method protocol is missing the claim-readiness companion artifact.");
  }
  if (!reviewPacket.contents?.methodProtocol?.runtimeParityEvidence?.some((evidence) => evidence.id === "jena-rena-sample-parity")) {
    throw new Error("Review packet method protocol is missing jENA rENA fixture parity evidence.");
  }
  if (!reviewPacket.contents?.methodProtocol?.runtimeParityEvidence?.some((evidence) => evidence.id === "jsna-r-sna-social-parity")) {
    throw new Error("Review packet method protocol is missing jSNA R sna fixture parity evidence.");
  }
  if (reviewPacket.contents?.methodProtocol?.auditSummary?.runtimeConsistency?.status !== "consistent" ||
    reviewPacket.contents?.methodProtocol?.auditSummary?.fusionMath?.status !== "verified" ||
    reviewPacket.contents?.methodProtocol?.runtimeHandoffs?.map((handoff) => handoff.id).join("|") !== "jena-concept-matrix|jsna-social-matrix|fusion-math" ||
    !reviewPacket.contents?.methodProtocol?.runtimeHandoffs?.every((handoff) => handoff.status === "pass")) {
    throw new Error("Review packet method protocol is missing method-level runtime handoff summaries.");
  }
  for (const marker of bilingualEvidenceMarkers) {
    assertTextIncludes(reviewPacketText, marker, "review packet bilingual evidence");
  }

  await closeResearchDetailsDrawer(page);
  await expectWorkspaceRailPanel(page, "sets", "Data Import");
  await uploadTextPayloadByTestId(page, "sena-upload-input", "sena-review-packet.json", "application/json", reviewPacketText);
  await waitForVisibleText(page, "sena-review-packet.json: review packet restored editable workspace state");
  await expectLessonStudyCounts(page);

  await clickByTestId(page, "clear-sena-contract");
  await waitForVisibleText(page, "No SENA contract loaded.");

  await uploadTextPayloadByTestId(page, "sena-data-import-upload-input", "sena-project-snapshot.json", "application/json", snapshotText);
  await waitForVisibleText(page, "sena-project-snapshot.json: project snapshot restored");
  await expectLessonStudyCounts(page);
  await waitForVisibleText(page, "0.33");
  await waitForVisibleText(page, "0.44");
  await waitForVisibleText(page, "0.55");
}

async function verifyCanvasSelection(page) {
  const inspector = page.locator('[data-testid="sena-inspector"]');
  const centralFusionPlot = page.locator('[data-testid="central-fusion-priority-plot"]').first();
  const personNode = centralFusionPlot.locator('[data-testid^="sena-node-"][data-node-kind="person"]').first();
  const personNodeTestId = await personNode.getAttribute("data-testid", { timeout: defaultTimeout });
  const personNodeId = personNodeTestId?.replace(/^sena-node-/, "");
  await personNode.click({ timeout: defaultTimeout });
  await inspector.getByText("Bridge score (exp.)", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("SNA degree", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  const centralNodeLabels = page.locator('[data-testid="central-fusion-priority-plot"] [data-testid="fusion-selected-node-label"][data-selected="true"]');
  if (personNodeId) {
    await page.locator(`[data-testid="central-fusion-priority-plot"] [data-testid="fusion-selected-node-label"][data-node-id="${personNodeId}"][data-selected="true"]`).waitFor({ state: "attached", timeout: defaultTimeout });
  }
  const selectedNodeLabelCount = await centralNodeLabels.count();
  if (selectedNodeLabelCount !== 1) {
    throw new Error(`Fusion Canvas should show exactly one selected node label after node click, received ${selectedNodeLabelCount}.`);
  }

  const bridgeEdge = centralFusionPlot.locator('[data-testid^="sena-edge-"][data-layer="bridge"]').first();
  const rawWeight = inspector.getByText("Raw weight", { exact: true });
  await bridgeEdge.click({ force: true, timeout: defaultTimeout });
  try {
    await rawWeight.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    await bridgeEdge.evaluate((element) => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await rawWeight.waitFor({ state: "visible", timeout: defaultTimeout });
  }
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="central-fusion-priority-plot"] [data-testid="fusion-selected-node-label"][data-selected="true"]').length === 0,
    undefined,
    { timeout: defaultTimeout }
  );
  await page.locator('[data-testid="edge-matrix-provenance"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="edge-matrix-provenance"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await page.locator('[data-testid="edge-visual-stroke-provenance"][data-visual-role="edge-visual-stroke-provenance"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Line weight provenance", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Visual salience", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Stroke width", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="edge-matrix-fingerprint"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="edge-matrix-fingerprint"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await inspector.getByText("Matrix provenance", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Matrix fingerprint", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("A_fusion fingerprint", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Runtime source", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("SENA bridge", { exact: false }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("gamma 0.55", { exact: false }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Evidence", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-testid="evidence-lineage"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="five-table-evidence-lineage"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await inspector.getByText("table coded_segments", { exact: false }).first().waitFor({ state: "visible", timeout: defaultTimeout });

  const socialEdge = centralFusionPlot.locator('[data-testid^="sena-edge-"][data-layer="social"]').first();
  await socialEdge.click({ force: true, timeout: defaultTimeout });
  const jsnaTieHandoff = page.locator('[data-testid="social-edge-jsna-handoff"]');
  try {
    await jsnaTieHandoff.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    await socialEdge.evaluate((element) => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await jsnaTieHandoff.waitFor({ state: "visible", timeout: defaultTimeout });
  }
  await page.locator('[data-visual-role="social-edge-jsna-tie-handoff"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await inspector.getByText("jSNA tie evidence", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("S matrix", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("jSNA matrix", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Source actor", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Target actor", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  const jsnaTieHandoffAttrs = await jsnaTieHandoff.evaluate((element) => ({
    matrixAligned: element.getAttribute("data-matrix-aligned"),
    edgeWeight: Number(element.getAttribute("data-edge-weight") ?? "0"),
    socialMatrixWeight: Number(element.getAttribute("data-social-matrix-weight") ?? "0"),
    manifestMatrixWeight: Number(element.getAttribute("data-manifest-matrix-weight") ?? "0"),
    evidenceCount: Number(element.getAttribute("data-evidence-count") ?? "0")
  }));
  if (
    jsnaTieHandoffAttrs.matrixAligned !== "true" ||
    jsnaTieHandoffAttrs.edgeWeight <= 0 ||
    jsnaTieHandoffAttrs.socialMatrixWeight <= 0 ||
    jsnaTieHandoffAttrs.manifestMatrixWeight <= 0 ||
    jsnaTieHandoffAttrs.evidenceCount <= 0
  ) {
    throw new Error(`Social-edge jSNA handoff panel has invalid attributes: ${JSON.stringify(jsnaTieHandoffAttrs)}`);
  }

  const conceptEdge = centralFusionPlot.locator('[data-testid^="sena-edge-"][data-layer="concept"]').first();
  await conceptEdge.click({ force: true, timeout: defaultTimeout });
  const jenaPairHandoff = page.locator('[data-testid="concept-edge-jena-handoff"]');
  await jenaPairHandoff.waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="concept-edge-jena-pair-handoff"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await inspector.getByText("jENA pair evidence", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("jENA count", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("SENA W raw", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  const jenaPairHandoffAttrs = await jenaPairHandoff.evaluate((element) => ({
    overlapStatus: element.getAttribute("data-overlap-status"),
    adjacencyColumn: element.getAttribute("data-adjacency-column"),
    jenaConnectionTotal: Number(element.getAttribute("data-jena-connection-total") ?? "0"),
    senaWWeight: Number(element.getAttribute("data-sena-w-weight") ?? "0")
  }));
  if (
    jenaPairHandoffAttrs.overlapStatus !== "overlap" ||
    !jenaPairHandoffAttrs.adjacencyColumn ||
    jenaPairHandoffAttrs.adjacencyColumn === "missing" ||
    jenaPairHandoffAttrs.jenaConnectionTotal <= 0 ||
    jenaPairHandoffAttrs.senaWWeight <= 0
  ) {
    throw new Error(`Concept-edge jENA handoff panel has invalid attributes: ${JSON.stringify(jenaPairHandoffAttrs)}`);
  }
  await page.locator('[data-testid="concept-edge-g-attribution"]').waitFor({ state: "visible", timeout: defaultTimeout });
  await page.locator('[data-visual-role="concept-edge-g-attribution"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
  await inspector.getByText("G attribution", { exact: true }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("jENA aligned", { exact: false }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("beta 0.44", { exact: false }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("G fingerprint", { exact: false }).waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Direct", { exact: false }).first().waitFor({ state: "visible", timeout: defaultTimeout });
  await inspector.getByText("Support", { exact: false }).first().waitFor({ state: "visible", timeout: defaultTimeout });
}

export async function verifySenaBrowserSmoke(url = smokeUrlFromCli()) {
  console.log("\n> Verify browser interaction smoke");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true
  });

  try {
    await verifyResponsiveWorkspaceShell(browser, url);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.locator('[data-testid="sena-fusion-canvas"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
    await verifyWorkspaceShellAndPlotViews(page);
    await page.locator('[data-layer="social"][data-visual-role="outer-social-arc"][data-arc-route="outer-orbit"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-layer="concept"][data-visual-role="ena-solid-concept-link"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-visual-role="fusion-readable-link-halo"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await verifyWeightedFusionLinkWidths(page);
    const initialCentralNodeLabelCount = await page.locator('[data-testid="central-fusion-priority-plot"] [data-testid="fusion-selected-node-label"]').count();
    if (initialCentralNodeLabelCount !== 0) {
      throw new Error(`Fusion node labels should be hidden before a node is selected, received ${initialCentralNodeLabelCount}.`);
    }
    await verifyActiveWindowFusionScope(page);
    await waitForVisibleText(page, "SENA Analysis Studio");
    await waitForVisibleText(page, "Fusion Canvas");
    await clickByTestId(page, "workspace-rail-sets");
    await expectLessonStudyCounts(page);
    await waitForVisibleText(page, "Lesson-study sample loaded from the bundled SENA pilot package.");
    await verifyPilotAssetLinks(page, url);

    await verifySampleUploadPaths(page);

    await clickByTestId(page, "load-lesson-study-sample");
    await waitForVisibleText(page, "Lesson-study sample loaded from the research pilot package.");
    await expectLessonStudyCounts(page);

    await activateButtonByTestId(page, "workspace-rail-model");
    await clickByTestId(page, "model-layout-ena-space");
    await waitForVisibleText(page, "jENA projected points and code positions");
    await clickByTestId(page, "model-layout-joint");
    await waitForVisibleText(page, "Selectable A_fusion embedding operators");
    await waitForVisibleText(page, "Joint embedding provenance");
    await waitForVisibleText(page, "stress");
    await clickByTestId(page, "model-layout-explanatory");
    await waitForVisibleText(page, "Readable non-metric three-layer layout");

    for (const modelControlId of [
	      "model-layout-explanatory",
	      "model-layout-ena-space",
	      "model-layout-joint",
	      "model-layer-social-toggle",
	      "model-layer-concept-toggle",
	      "model-layer-bridge-toggle",
	      "alpha-slider",
	      "beta-slider",
	      "gamma-slider",
	      "edge-threshold-slider",
	      "normalization-select"
    ]) {
      await page.locator(`[data-testid="${modelControlId}"]`).first().waitFor({ state: "visible", timeout: defaultTimeout });
    }
    await setRangeValue(page, "alpha-slider", "0.33");
    await setRangeValue(page, "beta-slider", "0.44");
    await setRangeValue(page, "gamma-slider", "0.55");
    await waitForVisibleText(page, "0.33");
    await waitForVisibleText(page, "0.44");
    await waitForVisibleText(page, "0.55");
    await clickByTestId(page, "workspace-rail-stats");
    await waitForVisibleText(page, "Metric provenance");
    await waitForVisibleText(page, "sena-metric-provenance/v1");
    await waitForVisibleText(page, "Local runtime snapshot");
    await waitForVisibleText(page, "jENA concept-pair handoff");
    await waitForVisibleText(page, "SENA W coverage audit");
    await waitForVisibleText(page, "Semantic handoff only");
    const jenaConceptHandoffPanel = page.locator('[data-testid="stats-jena-concept-handoff"]');
    await jenaConceptHandoffPanel.waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="stats-jena-concept-pair-handoff"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    const jenaConceptHandoffAttrs = await jenaConceptHandoffPanel.evaluate((element) => ({
      status: element.getAttribute("data-status"),
      expectedPairs: Number(element.getAttribute("data-expected-pairs") ?? "0"),
      adjacencyPairs: Number(element.getAttribute("data-adjacency-pairs") ?? "0"),
      positiveJenaPairs: Number(element.getAttribute("data-positive-jena-pairs") ?? "0"),
      positiveSenaWPairs: Number(element.getAttribute("data-positive-sena-w-pairs") ?? "0"),
      overlapPairs: Number(element.getAttribute("data-overlap-pairs") ?? "0")
    }));
    if (
      jenaConceptHandoffAttrs.status !== "pass" ||
      jenaConceptHandoffAttrs.expectedPairs <= 0 ||
      jenaConceptHandoffAttrs.adjacencyPairs !== jenaConceptHandoffAttrs.expectedPairs ||
      jenaConceptHandoffAttrs.positiveJenaPairs <= 0 ||
      jenaConceptHandoffAttrs.positiveSenaWPairs <= 0 ||
      jenaConceptHandoffAttrs.overlapPairs <= 0
    ) {
      throw new Error(`Stats jENA concept-pair handoff panel has invalid coverage attributes: ${JSON.stringify(jenaConceptHandoffAttrs)}`);
    }
    await waitForVisibleText(page, "jSNA social-tie handoff");
    await waitForVisibleText(page, "SENA S matrix audit");
    await waitForVisibleText(page, "Direct matrix handoff");
    const jsnaSocialHandoffPanel = page.locator('[data-testid="stats-jsna-social-handoff"]');
    await jsnaSocialHandoffPanel.waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="stats-jsna-social-tie-handoff"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    const jsnaSocialHandoffAttrs = await jsnaSocialHandoffPanel.evaluate((element) => ({
      status: element.getAttribute("data-status"),
      socialTieRows: Number(element.getAttribute("data-social-tie-rows") ?? "0"),
      alignedTieRows: Number(element.getAttribute("data-aligned-tie-rows") ?? "0"),
      positiveTieRows: Number(element.getAttribute("data-positive-tie-rows") ?? "0"),
      evidenceTieRows: Number(element.getAttribute("data-evidence-tie-rows") ?? "0")
    }));
    if (
      jsnaSocialHandoffAttrs.status !== "pass" ||
      jsnaSocialHandoffAttrs.socialTieRows <= 0 ||
      jsnaSocialHandoffAttrs.alignedTieRows !== jsnaSocialHandoffAttrs.socialTieRows ||
      jsnaSocialHandoffAttrs.positiveTieRows <= 0 ||
      jsnaSocialHandoffAttrs.evidenceTieRows <= 0
    ) {
      throw new Error(`Stats jSNA social-tie handoff panel has invalid coverage attributes: ${JSON.stringify(jsnaSocialHandoffAttrs)}`);
    }
    await waitForVisibleText(page, "Method protocol handoffs");
    await waitForVisibleText(page, "Formula, jENA, and jSNA evidence");
    const methodProtocolHandoffs = page.locator('[data-testid="method-protocol-runtime-handoffs"]');
    await methodProtocolHandoffs.waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="method-protocol-runtime-handoff-ledger"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    const methodProtocolHandoffAttrs = await methodProtocolHandoffs.evaluate((element) => ({
      handoffCount: Number(element.getAttribute("data-handoff-count") ?? "0"),
      passCount: Number(element.getAttribute("data-pass-count") ?? "0"),
      runtimeStatus: element.getAttribute("data-runtime-status"),
      fusionStatus: element.getAttribute("data-fusion-status")
    }));
    if (
      methodProtocolHandoffAttrs.handoffCount !== 3 ||
      methodProtocolHandoffAttrs.passCount !== 3 ||
      methodProtocolHandoffAttrs.runtimeStatus !== "consistent" ||
      methodProtocolHandoffAttrs.fusionStatus !== "verified"
    ) {
      throw new Error(`Stats method-protocol handoff panel has invalid attributes: ${JSON.stringify(methodProtocolHandoffAttrs)}`);
    }
    await openResearchDetailsTab(page, "exports");
    await waitForVisibleText(page, "jena-js");
    await waitForVisibleText(page, "sna.js closeness()");
    await waitForVisibleText(page, "sna.js labelPropagation()");
    await waitForVisibleText(page, "sena-self-implemented");
    await waitForVisibleText(page, "sena-composite");
    await waitForVisibleText(page, "R sna::betweenness fixtures");
    await openResearchDetailsTab(page, "validation");
    await page.locator('[data-testid="metric-provenance-panel"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="sena-metric-provenance"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await openResearchDetailsTab(page, "exports");
    await waitForVisibleText(page, "Claim readiness gate");
    await waitForVisibleText(page, "sena-claim-readiness-gate/v1");
    await waitForVisibleText(page, "sena-claim-readiness-gate.json");
    await waitForVisibleText(page, "exploratory-only");
    await waitForVisibleText(page, "Exploratory until coding reliability");
    await page.locator('[data-testid="claim-readiness-gate"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="claim-readiness-gate"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await waitForVisibleText(page, "Review packet audit");
    await waitForVisibleText(page, "Method protocol handoff");
    await page.locator('[data-testid="review-packet-audit"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="review-packet-audit"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-audit-id="project-snapshot-handoff"]').waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-audit-id="development-plan-handoff"]').waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-audit-id="method-protocol-handoff"]').waitFor({ state: "attached", timeout: defaultTimeout });

    await closeResearchDetailsDrawer(page);
    await clickByTestId(page, "workspace-plot-switcher");
    await clickByTestId(page, "workspace-plot-view-temporal");
    await waitForVisibleText(page, "Temporal Fusion Arc");
    await activateButtonByTestId(page, "temporal-mode-moving-window");
    await waitForVisibleText(page, "Window size");
    await waitForVisibleText(page, "Step");
    await activateButtonByTestId(page, "temporal-mode-turn-window");
    await waitForVisibleText(page, "Turn radius");
    await activateButtonByTestId(page, "temporal-mode-stage");
    await waitForVisibleText(page, "Temporal Fusion Arc");
    await waitForVisibleText(page, "Plan - Teach - Reflect story view");
    await waitForVisibleText(page, "G pair contributions");
    await waitForVisibleText(page, "Raw G pairs");
    await waitForVisibleText(page, "Top G pair");
    await waitForVisibleText(page, "Top G pair in this window");
    await waitForVisibleText(page, "Temporal transition evidence");
    await waitForVisibleText(page, "Delta G");
    await waitForVisibleText(page, "Delta A_fusion");
    await page.locator('[data-testid="temporal-fusion-arc"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="temporal-g-pair-metric"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-visual-role="temporal-trace-g-pair-line"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-testid="temporal-transition-evidence"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await openResearchDetailsTab(page, "analysis");
    await waitForVisibleText(page, "A_fusion checksum");
    await page.locator('[data-testid="temporal-window-fingerprint"]').first().waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="temporal-window-fingerprint"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await page.locator('[data-testid="temporal-transition-summary"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await page.locator('[data-visual-role="temporal-transition-summary"]').first().waitFor({ state: "attached", timeout: defaultTimeout });
    await closeResearchDetailsDrawer(page);
    await page.locator('[data-testid="temporal-fusion-phase-teach"]').click({ timeout: defaultTimeout });
    await page.locator('[data-testid="temporal-fusion-phase-teach"][aria-pressed="true"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await waitForVisibleText(page, "evidence refs");

    await selectWorkspacePlotView(page, "fusion", "Fusion");
    await page.locator('[data-testid="central-fusion-priority-plot"]').waitFor({ state: "visible", timeout: defaultTimeout });
    await verifyCanvasSelection(page);

    await verifyArtifactDownloadsAndRestore(page);
    await openResearchDetailsTab(page, "exports");
    await downloadJsonByButton(page, /Export ENA report/i, "sena-ena-report.json", "sena-ena-report/v1");
    await closeResearchDetailsDrawer(page);
    await clickByTestId(page, "workspace-rail-stats");
    await waitForVisibleText(page, "Local runtime snapshot");
    await downloadJsonByTestId(page, "export-stats-sna-report", "sena-sna-report.json", "sena-sna-report/v1");
    await downloadJsonByTestId(page, "export-stats-jena-manifest", "sena-jena-manifest.json", "sena-ena-manifest/v1");
    await downloadJsonByTestId(page, "export-stats-jsna-manifest", "sena-jsna-manifest.json", "sena-jsna-manifest/v1");
    await downloadJsonByTestId(page, "export-stats-g-report", "sena-person-code-pair-g-report.json", "sena-person-code-pair-g-report/v1");
    await verifyDeclaredResearchArtifactDownloads(browser, url);

    console.log(`Browser interaction smoke passed for ${url}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifySenaBrowserSmoke().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
