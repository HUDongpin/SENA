import { chromium, firefox, webkit } from "playwright";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { requireVerifierControlledServerCustody } from "./verify-sena-enterprise-api-browser-smoke.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const summaryIds = [
  "central-fusion-scope-layer-counts", "central-fusion-evidence-capsule",
  "central-active-window-brief", "central-fusion-transition-delta", "central-fusion-delta-g-pair"
];
const sourcePaths = [
  "components/sena/workspace/workspace-main-shell-section.tsx",
  "components/sena/workspace/workspace-shell-panels.tsx",
  "components/sena/workspace/central-fusion-analysis-scope.tsx",
  "components/sena/workspace/workspace-data-import-feedback-section.tsx",
  "lib/sena/__tests__/workspace-essential-shell.test.ts",
  "lib/sena/__tests__/workspace-import-error-drawer-retry.test.ts",
  "lib/sena/__tests__/browser-smoke-manifest.test.ts",
  "scripts/verify-sena-mobile-browser-matrix.mjs", "scripts/verify-sena-browser-smoke.mjs",
  "scripts/verify-sena-pilot.mjs",
  "components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts",
  "components/sena/workspace/use-project-snapshot-restore-action.ts",
  "components/sena/workspace/use-enterprise-import-actions.ts",
  "components/sena/workspace/enterprise-actions.ts",
  "lib/sena/__tests__/snapshot-runtime-compatibility.test.ts",
  "lib/sena/runtime-constants.ts", "lib/sena/deterministic-ena.ts", "lib/sena/deterministic-numerics.ts",
  "lib/sena/model.ts", "lib/sena/ena-manifest.ts", "lib/sena/snapshot.ts"
];
const deterministicProfile = "sena-deterministic-v1";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const byId = (page, id) => page.getByTestId(id);
const invariant = (condition, message) => {
  if (!condition) { const error = new Error(message); error.name = "MobileMatrixAssertion"; throw error; }
};
const failureEvidence = (error) => ({
  kind: ["TimeoutError", "MobileMatrixAssertion", "Error"].includes(error.name) ? error.name : "OtherError",
  messageSha256: sha256(String(error.message))
});

async function sourceEvidence() {
  const root = resolve(appRoot, "..");
  const marker = join(root, ".git");
  const gitDir = (await stat(marker)).isDirectory() ? marker
    : resolve(root, (await readFile(marker, "utf8")).trim().replace(/^gitdir: /, ""));
  const git = (args) => execFileSync("git", ["--no-optional-locks", `--git-dir=${gitDir}`, `--work-tree=${root}`, ...args], { encoding: "utf8" }).trim();
  const paths = {};
  for (const path of sourcePaths) {
    const bytes = await readFile(join(appRoot, path));
    let headSha256 = null;
    try { headSha256 = sha256(execFileSync("git", ["--git-dir=" + gitDir, "show", `HEAD:sena-hk-template/${path}`], { stdio: ["ignore", "pipe", "ignore"] })); } catch { /* new verifier */ }
    paths[path] = { sha256: sha256(bytes), headSha256, equalsHead: sha256(bytes) === headSha256 };
  }
  return { head: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]), paths, candidateSha256: sha256(JSON.stringify(paths)) };
}

// Element and every nonempty text Range must fit horizontally, including the
// effective clipping rectangle of overflow ancestors. Document width alone can
// pass while overflow-x:hidden silently removes research evidence.
async function summaryGeometry(page, selectedIds = summaryIds) {
  return page.evaluate((ids) => ids.map((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!element) return { id, missing: true };
    const box = element.getBoundingClientRect();
    let left = 0, right = document.documentElement.clientWidth;
    const clippingAncestors = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {
        const rect = parent.getBoundingClientRect();
        // Client dimensions are layout units; DOMRects include CSS zoom.
        const scale = parent.offsetWidth > 0 ? rect.width / parent.offsetWidth : 0;
        if (!Number.isFinite(scale) || scale <= 0) return { id, passed: false, invalidClipScale: true };
        left = Math.max(left, rect.left + parent.clientLeft * scale);
        right = Math.min(right, rect.left + (parent.clientLeft + parent.clientWidth) * scale);
        clippingAncestors.push({ tag: parent.tagName, left: rect.left, right: rect.right, overflowX: style.overflowX });
      }
    }
    const ranges = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width && rect.height) {
        const parent = node.parentElement;
        const parentBox = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        ranges.push({ left: rect.left, right: rect.right,
          clipped: rect.left < left - 1 || rect.right > right + 1 ||
            (/(hidden|clip)/.test(style.overflowX) && (rect.left < parentBox.left - 1 || rect.right > parentBox.right + 1)) });
      }
    }
    return { id, left: box.left, right: box.right, clipLeft: left, clipRight: right, ranges, clippingAncestors,
      passed: box.width > 0 && box.left >= left - 1 && box.right <= right + 1 && ranges.length > 0 && ranges.every((r) => !r.clipped) };
  }), selectedIds);
}

async function verifyGeometryFixture(page) {
  const measurements = [];
  for (const zoom of [1, 1.25]) {
    await page.evaluate((scale) => {
      const fixture = document.createElement("div"); fixture.dataset.mobileGeometryFixture = "true";
      Object.assign(fixture.style, { position: "fixed", left: "0", top: "0", width: "200px", border: "8px solid black", boxSizing: "border-box", overflow: "hidden", zoom: String(scale) });
      fixture.innerHTML = '<div data-testid="mobile-fixture-fit" style="width:100%">Fits</div><div data-testid="mobile-fixture-clipped" style="width:400px;white-space:nowrap">This deliberately extends past the clipping edge</div>';
      document.body.append(fixture);
    }, zoom);
    try {
      const rows = await summaryGeometry(page, ["mobile-fixture-fit", "mobile-fixture-clipped"]);
      invariant(rows[0].passed === true && rows[1].passed === false, `Geometry fixture incorrectly classified fit/clipping at CSS zoom ${zoom}`);
      measurements.push({ zoom, rows });
    } finally { await page.locator('[data-mobile-geometry-fixture="true"]').evaluate((e) => e.remove()); }
  }
  return measurements;
}

async function paintedEvidence(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points = [0.2, 0.5, 0.8].flatMap((x) => [0.2, 0.5, 0.8].map((y) => ({ x: rect.left + rect.width * x, y: rect.top + rect.height * y })));
    return { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      visible: rect.width > 0 && rect.height > 0,
      samples: points.map(({ x, y }) => {
        const top = document.elementFromPoint(x, y);
        return { x, y, painted: !!top && (top === element || element.contains(top)), topTestId: top?.closest("[data-testid]")?.getAttribute("data-testid") ?? null };
      }) };
  });
}

async function contrastEvidence(locator) {
  return locator.evaluate((element) => {
    const rgba = (value) => {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d"); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255];
    };
    const over = (front, back) => front.slice(0, 3).map((value, index) => value * front[3] + back[index] * (1 - front[3])).concat(1);
    const ancestors = []; for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255, 1];
    for (const node of ancestors) background = over(rgba(getComputedStyle(node).backgroundColor), background);
    const style = getComputedStyle(element);
    const foreground = over(rgba(style.color), background);
    const luminance = (color) => color.slice(0, 3).map((channel) => { const s = channel / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return { foreground, background, ratio: (levels[0] + 0.05) / (levels[1] + 0.05), fontSize: style.fontSize,
      opacityChain: ancestors.map((node) => Number(getComputedStyle(node).opacity)) };
  });
}

async function verifyFocus(page) {
  // Hidden cases are deliberately placed after a real last control, where a
  // broken focus filter would select them at the Tab boundary.
  await page.getByRole("dialog").evaluate((dialog) => {
    const fixtures = document.createElement("div"); fixtures.dataset.mobileFocusFixtures = "true";
    fixtures.innerHTML = '<button data-focus-last="true">Synthetic last control</button><div style="display:none"><button>CSS hidden</button></div><div inert><button>Inert ancestor</button></div><div aria-hidden="true"><button>ARIA hidden ancestor</button></div><fieldset disabled><button tabindex="0">Disabled fieldset</button></fieldset><button disabled tabindex="0">Disabled</button><div style="visibility:hidden"><button>Invisible</button></div><div style="visibility:collapse"><button>Collapsed</button></div><div hidden><button>Hidden ancestor</button></div>';
    dialog.append(fixtures);
  });
  try {
    const first = byId(page, "workspace-rail-sets");
    const last = page.locator('[data-focus-last="true"]');
    await last.focus(); await page.keyboard.press("Tab");
    invariant(await first.evaluate((e) => e === document.activeElement), "Tab from last did not return to first rail control");
    await page.keyboard.press("Shift+Tab");
    invariant(await last.evaluate((e) => e === document.activeElement), "Shift+Tab from first did not return to last eligible control");
    await page.getByRole("button", { name: "Close workspace panel", exact: true }).focus();
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");
      const eligible = await page.evaluate(() => {
        const e = document.activeElement;
        return e instanceof HTMLElement && !e.matches(":disabled") && !e.closest('[hidden],[inert],[aria-hidden="true"]') && e.getClientRects().length > 0 && !["hidden", "collapse"].includes(getComputedStyle(e).visibility);
      });
      invariant(eligible, "Tab entered an ineligible hidden or disabled control");
    }
  } finally {
    await page.locator('[data-mobile-focus-fixtures="true"]').evaluate((e) => e.remove());
  }
}

async function closeDrawer(page, trigger = "sets") {
  await page.keyboard.press("Escape");
  await byId(page, "workspace-left-panel-overlay").waitFor({ state: "hidden" });
  await page.waitForFunction((id) => document.activeElement?.getAttribute("data-testid") === id, `workspace-rail-${trigger}`);
}

async function identity(page) {
  const checksum = await byId(page, "central-fusion-analysis-scope").getAttribute("data-a-fusion-checksum");
  invariant(checksum?.length > 0, "Missing dataset matrix fingerprint");
  return { checksum, counts: await page.locator('[data-testid^="data-count-"]').allTextContents() };
}

async function selectFusion(page) {
  await byId(page, "workspace-plot-switcher").click();
  await byId(page, "workspace-plot-view-fusion").click();
  await byId(page, "central-fusion-analysis-scope").waitFor();
}

async function snapshotFromWorkspace(page) {
  await byId(page, "workspace-research-details-toggle").click();
  await byId(page, "workspace-research-details-tab-exports").click();
  const pending = page.waitForEvent("download");
  await byId(page, "export-project-snapshot").click();
  const download = await pending;
  invariant(await download.failure() === null, "Synthetic snapshot download failed");
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  invariant(JSON.parse(text).schemaVersion === "sena-project-snapshot/v1", "Downloaded snapshot schema mismatch");
  await byId(page, "workspace-research-details-toggle").click();
  return text;
}

// Generate the legacy fixture from the current UI options and active window in
// Node. The bundle and complete snapshot remain in memory; only hashes leave it.
async function legacySnapshotBuilder() {
  const entry = join(appRoot, "__mobile_legacy_snapshot_memory__.ts");
  const bundle = await rolldown({ input: entry, platform: "node", plugins: [{
    name: "mobile-legacy-snapshot-memory",
    resolveId(id) { if (id === entry) return entry; },
    load(id) { if (id === entry) return `
      import { buildSenaModel, scopeSenaDatasetToWindow } from './lib/sena/model';
      import { buildSenaProjectSnapshot } from './lib/sena/snapshot';
      export function legacySnapshot(current) {
        const sourceDataset = current.source.sourceDataset;
        const options = { ...current.reproducibility.buildOptions };
        delete options.numericalRuntime;
        const activeTemporalWindow = current.source.activeTemporalWindow;
        const model = buildSenaModel(activeTemporalWindow ? scopeSenaDatasetToWindow(sourceDataset, activeTemporalWindow) : sourceDataset, options);
        return buildSenaProjectSnapshot(model, { generatedAt: current.generatedAt, sourceDataset, activeTemporalWindow });
      }
    `; }
  }] });
  try {
    const output = await bundle.generate({ format: "esm" });
    const fixtureModule = await import(`data:text/javascript;base64,${Buffer.from(output.output[0].code).toString("base64")}`);
    return fixtureModule.legacySnapshot;
  } finally { await bundle.close(); }
}

function snapshotDatasetHash(snapshot) {
  invariant(snapshot.dataset && snapshot.source?.sourceDataset, "Snapshot is missing full source dataset custody");
  return sha256(JSON.stringify({ dataset: snapshot.dataset, sourceDataset: snapshot.source.sourceDataset }));
}

async function assertExportedProfile(page, report, label, expected, expectedDatasetHash) {
  const snapshot = JSON.parse(await snapshotFromWorkspace(page));
  invariant(snapshot.reproducibility?.buildOptions?.numericalRuntime === expected &&
    snapshot.report?.enaManifest?.options?.numericalRuntime === expected &&
    snapshot.report?.runtimeProvenance?.numericalRuntime === expected, "Exported numerical profile disagrees with selected analysis");
  const datasetSha256 = snapshotDatasetHash(snapshot);
  if (expectedDatasetHash) invariant(datasetSha256 === expectedDatasetHash, "Numerical profile transition changed dataset/source custody");
  (report.profileTransitions ??= []).push({ label, numericalRuntime: expected ?? null, profileAbsent: expected === undefined,
    snapshotSha256: sha256(JSON.stringify(snapshot)), datasetSha256,
    activeWindowSha256: sha256(JSON.stringify(snapshot.source.activeTemporalWindow)) });
  return snapshot;
}

async function verifyProfileTransitions(page, report, check, buildLegacySnapshot) {
  const current = JSON.parse(await snapshotFromWorkspace(page));
  const legacy = buildLegacySnapshot(current);
  const legacyBody = JSON.stringify(legacy);
  const expectedDatasetHash = snapshotDatasetHash(legacy);
  const restoreLegacy = async () => {
    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/sena/snapshot/restore" && response.request().method() === "POST");
    await byId(page, "sena-upload-input").setInputFiles({ name: "legacy-profile.json", mimeType: "application/json", buffer: Buffer.from(legacyBody) });
    invariant((await pending).ok(), "Valid Node legacy snapshot did not pass canonical server restore");
    await byId(page, "workspace-rail-sets").click();
    await page.getByText("legacy-profile.json: project snapshot restored", { exact: false }).waitFor();
    await closeDrawer(page);
  };
  await check("legacy restore retains absent profile", async () => {
    await restoreLegacy();
    await assertExportedProfile(page, report, "legacy", undefined, expectedDatasetHash);
  });
  await check("sample after legacy restore selects deterministic profile", async () => {
    await byId(page, "workspace-rail-sets").click();
    await page.getByRole("button", { name: "Load lesson-study sample", exact: true }).click();
    await page.getByText("Lesson-study sample loaded from the research pilot package.", { exact: true }).waitFor();
    await closeDrawer(page);
    await assertExportedProfile(page, report, "sample-after-legacy", deterministicProfile, expectedDatasetHash);
  });
  await check("raw after legacy restore selects deterministic profile", async () => {
    await restoreLegacy();
    await assertExportedProfile(page, report, "legacy-before-raw", undefined, expectedDatasetHash);
    await byId(page, "sena-upload-input").setInputFiles(join(appRoot, "public/sena-pilot/sample/lesson-study-sena-contract.json"));
    await byId(page, "central-fusion-analysis-scope").waitFor();
    await assertExportedProfile(page, report, "raw-after-legacy", deterministicProfile, expectedDatasetHash);
  });
}

async function verifyRejectedImports(page, report, check) {
  const snapshot = await snapshotFromWorkspace(page);
  const datasetHash = (text) => {
    const value = JSON.parse(text);
    invariant(value.dataset && value.source?.sourceDataset, "Synthetic snapshot is missing dataset custody");
    return sha256(JSON.stringify({ dataset: value.dataset, sourceDataset: value.source.sourceDataset }));
  };
  const beforeDatasetSha256 = datasetHash(snapshot);
  await byId(page, "workspace-rail-sets").click();
  const before = await identity(page);
  invariant(before.counts.length >= 5, "Dataset count identity is empty");
  await closeDrawer(page);
  const upload = async (name, body) => byId(page, "sena-upload-input").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(body) });
  const reject = async (name, body) => {
    await upload(name, body);
    await page.getByRole("dialog").waitFor();
    // The legacy plate is measured for the RED comparison too. It cannot pass
    // the assertion below without the new semantic contract and stable hook.
    const error = byId(page, "workspace-import-error").or(byId(page, "workspace-left-panel").locator(".text-rose-100")).first();
    await error.waitFor({ timeout: 3000 });
    invariant((await error.textContent()).trim().length > 0, "Error alert blanked the true rejection");
    await check("atomic error alert", async () => invariant(await error.getAttribute("data-testid") === "workspace-import-error" && await error.getAttribute("role") === "alert" && await error.getAttribute("aria-atomic") === "true", "Error is not an atomic live alert with a stable hook"));
    const current = await identity(page);
    invariant(JSON.stringify(current) === JSON.stringify(before), "Rejected import changed dataset counts or matrix fingerprint");
    const contrast = await contrastEvidence(error);
    report.contrast.push({ target: "import-error", ...contrast });
    await check("error contrast >=4.5", async () => invariant(contrast.ratio >= 4.5 && contrast.opacityChain.every((o) => o === 1), "Error normal-text contrast below 4.5 or unsupported opacity"));
    await closeDrawer(page);
    const afterDatasetSha256 = datasetHash(await snapshotFromWorkspace(page));
    invariant(afterDatasetSha256 === beforeDatasetSha256, "Rejected import changed exported dataset content");
    (report.rejections ??= []).push({ fileCase: name, before, after: current, beforeDatasetSha256, afterDatasetSha256 });
  };
  for (const [label, body] of [
    ["malformed-first", "{"], ["malformed-repeat", "{"],
    ["corrupt-snapshot", '{"schemaVersion":"sena-project-snapshot/v1"}'],
    ["corrupt-review-packet", '{"schemaVersion":"sena-review-packet/v1"}']
  ]) await check(label, () => reject(label.startsWith("malformed") ? "bad.json" : `${label}.json`, body));

  // Browser-level injected transport failure and timeout, then real retry. This
  // exercises existing error recovery, not a claim about an application timer.
  for (const fault of ["failed", "timedout"]) {
    await check(`transport-${fault}-then-retry`, async () => {
      let intercepted = 0;
      const handler = async (route) => { intercepted += 1; await route.abort(fault); };
      await page.route("**/api/sena/snapshot/restore", handler);
      try { await reject(`transport-${fault}.json`, snapshot); }
      finally { await page.unroute("**/api/sena/snapshot/restore", handler); }
      invariant(intercepted === 1, "Injected transport failure did not hit exactly one restore request");
      const responsePending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/sena/snapshot/restore" && response.request().method() === "POST");
      await upload(`transport-${fault}.json`, snapshot);
      const response = await responsePending;
      (report.transportRetries ??= []).push({ fault, status: response.status(), responseReceivedAt: new Date().toISOString() });
      await byId(page, "workspace-rail-sets").click();
      if (!response.ok()) {
        await byId(page, "workspace-import-error").scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(report.artifactDirectory, `${report.engine}-${report.viewport.width}-retry-${fault}.png`), animations: "disabled" });
      }
      invariant(response.ok(), "Snapshot retry returned a non-success HTTP status");
      await page.getByText(`transport-${fault}.json: project snapshot restored`, { exact: false }).waitFor();
      invariant(await byId(page, "workspace-import-error").count() === 0, "Successful retry retained the rejection alert");
      invariant(JSON.stringify(await identity(page)) === JSON.stringify(before), "Successful snapshot retry changed the expected sample identity");
      await closeDrawer(page);
      await assertExportedProfile(page, report, `deterministic-restore-after-${fault}`, deterministicProfile, beforeDatasetSha256);
    });
  }
}

export async function verifySenaMobileBrowserMatrix(url, custodyOptions = {}) {
  const target = new URL(url);
  requireVerifierControlledServerCustody(custodyOptions, target.origin, custodyOptions.expectedReceiptKeyId, custodyOptions.provisioningToken);
  invariant(target.protocol === "http:" && target.hostname === "127.0.0.1" && target.pathname === "/workspace/sena" && !target.search && !target.hash, "Mobile matrix requires the exact owned loopback workspace route");
  // Nothing above this point launches a browser, sends a request or writes an artifact.
  await mkdir(join(appRoot, ".tmp/playwright"), { recursive: true });
  const directory = await mkdtemp(join(appRoot, ".tmp/playwright/mobile-"));
  const buildLegacySnapshot = await legacySnapshotBuilder();
  const result = { startedAt: new Date().toISOString(), mode: process.argv.includes("--mobile-matrix-only") ? "mobile-matrix-only" : "full-pilot-mobile-matrix", route: "/workspace/sena",
    limitations: ["synthetic data; verifier-owned local server", "forced-light workspace", "browser automation, no VoiceOver/NVDA or physical-device assessment", "44px selected targets are a bounded usability/AAA target check, not blanket WCAG AA certification", "CSS zoom/reflow is recorded separately from viewport tests; not browser UI zoom", "transport timeout is injected, not an application timeout deadline"],
    sourceBefore: await sourceEvidence(), playwrightVersion: JSON.parse(await readFile(join(appRoot, "node_modules/playwright/package.json"), "utf8")).version, cases: [] };
  for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
    let browser;
    try {
      browser = await browserType.launch({ headless: true });
      for (const width of [375, 768, 1024, 1440]) {
        const viewport = { width, height: width === 1440 ? 1100 : 900 };
        const entry = { engine, browserVersion: browser.version(), viewport, artifactDirectory: directory, checks: [], states: [], contrast: [], console: [], pageErrors: [] };
        result.cases.push(entry);
        const context = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true });
        // Native Playwright traces can record raw action parameters/results
        // even with snapshots:false. Use the allowlisted timeline below.
        const page = await context.newPage(); page.setDefaultTimeout(12000);
        page.on("console", (message) => { if (["error", "warning"].includes(message.type())) entry.console.push({ type: message.type(), textSha256: sha256(message.text()) }); });
        page.on("pageerror", (error) => entry.pageErrors.push({ name: error.name, messageSha256: sha256(error.message) }));
        await context.route("**/*", (route) => new URL(route.request().url()).origin === target.origin ? route.continue() : route.abort("blockedbyclient"));
        const check = async (name, operation) => {
          const startedAt = new Date().toISOString();
          try { await operation(); entry.checks.push({ name, passed: true, startedAt, finishedAt: new Date().toISOString() }); }
          catch (error) { entry.checks.push({ name, passed: false, startedAt, finishedAt: new Date().toISOString(), failure: failureEvidence(error) }); }
        };
        const state = async (name) => {
          const geometry = await summaryGeometry(page);
          entry.states.push({ name, geometry });
          await page.screenshot({ path: join(directory, `${engine}-${width}-${name}.png`), animations: "disabled" });
          if (name === "reclosed" && width === 375) await byId(page, "central-fusion-analysis-scope").screenshot({ path: join(directory, `${engine}-${width}-summary.png`), animations: "disabled" });
          invariant(geometry.length === 5 && geometry.every((row) => row.passed), `Clipped or missing research summaries: ${geometry.filter((row) => !row.passed).map((row) => row.id).join(", ")}`);
        };
        try {
          await page.goto(url, { waitUntil: "networkidle" });
          await byId(page, "workspace-persistent-rail").waitFor();
          await byId(page, "central-fusion-analysis-scope").waitFor();
          await check("default numerical profile", () => assertExportedProfile(page, entry, "default", deterministicProfile));
          await byId(page, "sena-upload-input").setInputFiles(join(appRoot, "public/sena-pilot/sample/lesson-study-sena-contract.json"));
          await byId(page, "central-fusion-analysis-scope").waitFor();
          await check("raw import numerical profile", () => assertExportedProfile(page, entry, "raw", deterministicProfile));
          await check("geometry collector synthetic fit and clipping", async () => { entry.geometryFixture = await verifyGeometryFixture(page); });
          await check("closed", () => state("closed"));
          if (width === 375) await check("light and dark preference retain forced-light workspace", async () => {
            entry.preferredColorSchemes = [];
            for (const colorScheme of ["light", "dark"]) {
              await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
              const theme = await byId(page, "workspace-persistent-rail").evaluate((e) => e.closest("[data-theme]")?.getAttribute("data-theme"));
              const contrast = await contrastEvidence(byId(page, "workspace-rail-sets").locator("span").last());
              entry.preferredColorSchemes.push({ preference: colorScheme, workspaceTheme: theme, contrast });
              invariant(theme === "light" && contrast.ratio >= 4.5, "Color preference changed forced-light readability");
              await page.screenshot({ path: join(directory, `${engine}-${width}-preference-${colorScheme}.png`), animations: "disabled" });
            }
            await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
          });
          await check("single rail and forced light reduced motion", async () => {
            invariant(await byId(page, "workspace-persistent-rail").count() === 1, "Expected exactly one persistent rail");
            invariant(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "Reduced motion not effective");
            invariant(await byId(page, "workspace-persistent-rail").evaluate((e) => e.closest("[data-theme]")?.getAttribute("data-theme")) === "light", "Workspace theme changed");
            entry.reducedMotion = await byId(page, "workspace-rail-sets").evaluate((e) => ({ transition: getComputedStyle(e).transitionDuration, animation: getComputedStyle(e).animationDuration }));
            invariant(Object.values(entry.reducedMotion).every((value) => value.split(",").every((duration) => parseFloat(duration) <= 0.00001)), "Reduced motion CSS was not applied to rail controls");
          });
          if (width < 1280) await check("mobile figure keyboard", async () => {
            for (const [key, expected] of [["ArrowLeft", "dual"], ["ArrowRight", "fusion"], ["End", "dual"], ["Home", "fusion"]]) {
              await page.getByRole("tab", { selected: true }).press(key);
              invariant(await byId(page, `workspace-mobile-figure-${expected}`).getAttribute("aria-selected") === "true", `Figure ${key} failed`);
              invariant(await page.getByRole("tabpanel").count() === 1, "Mobile figure composition duplicates panels");
            }
          });
          await byId(page, "workspace-rail-sets").click();
          await page.getByRole("dialog").waitFor();
          await check("open", () => state("open"));
          await check("drawer heading and metrics painted", async () => {
            entry.paint = [];
            for (const locator of [byId(page, "workspace-left-panel").locator(".text-lg").first(), byId(page, "data-count-people"), byId(page, "data-count-codes")]) {
              const evidence = await paintedEvidence(locator); entry.paint.push(evidence);
            }
            invariant(entry.paint.every((e) => e.visible && e.samples.every((s) => s.painted)), "Persistent rail occludes drawer heading or metrics");
          });
          await check("selected 44px targets and active rail contrast", async () => {
            for (const locator of [byId(page, "workspace-rail-sets"), byId(page, "workspace-rail-model"), byId(page, "workspace-rail-plots"), byId(page, "workspace-rail-stats"), page.getByRole("button", { name: "Close workspace panel", exact: true })]) {
              const box = await locator.boundingBox(); invariant(box?.width >= 44 && box?.height >= 44, "Selected target smaller than 44 by 44 CSS pixels");
            }
            const contrast = await contrastEvidence(byId(page, "workspace-rail-sets").locator("span").last()); entry.contrast.push({ target: "active rail label", ...contrast });
            invariant(contrast.ratio >= 4.5 && contrast.opacityChain.every((o) => o === 1), "Active rail normal-text contrast below 4.5 or unsupported opacity");
          });
          await check("focus boundaries skip hidden controls", () => verifyFocus(page));
          await check("scrolled", async () => {
            await page.getByRole("dialog").evaluate((e) => { const scroll = e.querySelector(".overflow-y-auto"); scroll.scrollTop = 400; });
            await state("scrolled");
          });
          await check("Escape restores initiating rail", () => closeDrawer(page));
          await check("reclosed", () => state("reclosed"));
          await check("1024 to 1440 to 1024 composition", async () => {
            for (const nextWidth of [1024, 1440, 1024]) {
              await page.setViewportSize({ width: nextWidth, height: 900 });
              await byId(page, nextWidth === 1440 ? "workspace-desktop-figure-composition" : "workspace-mobile-figure-composition").waitFor({ state: "attached" });
              invariant(await byId(page, "workspace-persistent-rail").count() === 1, "Resize duplicated rail");
            }
            await page.setViewportSize(viewport);
            await byId(page, width === 1440 ? "workspace-desktop-figure-composition" : "workspace-mobile-figure-composition").waitFor({ state: "attached" });
          });
          await check("bounded CSS zoom reflow 125 percent", async () => {
            await page.evaluate(() => { document.documentElement.style.zoom = "1.25"; });
            try {
              entry.zoom = { type: "CSS zoom", scale: 1.25, viewport, geometry: await summaryGeometry(page) };
              invariant(entry.zoom.geometry.every((row) => row.passed), "Zoom/reflow clipped summary");
              await byId(page, "workspace-rail-sets").click();
              const rail = await byId(page, "workspace-persistent-rail").boundingBox();
              const drawer = await page.getByRole("dialog").boundingBox();
              entry.zoom.rail = rail; entry.zoom.drawer = drawer;
              invariant(width < 1280 ? Math.abs(rail.y) <= 1 && Math.abs(drawer.y - rail.y - rail.height) <= 1 : drawer.x >= rail.x + rail.width - 1, "Zoomed drawer does not clear the measured rail");
            }
            finally {
              if (await page.getByRole("dialog").count()) await closeDrawer(page);
              await page.evaluate(() => { document.documentElement.style.zoom = ""; });
            }
          });
          await verifyRejectedImports(page, entry, check);
          await verifyProfileTransitions(page, entry, check, buildLegacySnapshot);
          await check("real persistent rail clicks and pointer return to Fusion", async () => {
            for (const mode of ["model", "plots", "stats", "sets"]) {
              await byId(page, `workspace-rail-${mode}`).click();
              invariant(await byId(page, `workspace-rail-${mode}`).getAttribute("aria-expanded") === "true", `Rail ${mode} did not open`);
            }
            await closeDrawer(page);
            await selectFusion(page);
          });
        } catch (error) { entry.checks.push({ name: "case execution", passed: false, failure: failureEvidence(error) }); }
        finally {
          await check("no uncaught page errors", async () => invariant(entry.pageErrors.length === 0, "Uncaught page errors recorded"));
          if (entry.checks.some((c) => !c.passed)) await page.screenshot({ path: join(directory, `${engine}-${width}-failure.png`) }).catch(() => {});
          await writeFile(join(directory, `${engine}-${width}-failure-timeline.json`), JSON.stringify({
            traceKind: "allowlisted-metadata-only", nativePlaywrightTrace: false, responseBodiesRecorded: false,
            route: "/workspace/sena", engine, browserVersion: entry.browserVersion, viewport,
            steps: entry.checks, capturedStates: entry.states.map((state) => state.name),
            console: entry.console, pageErrors: entry.pageErrors
          }, null, 2) + "\n");
          await context.close();
          console.log(`Mobile matrix ${engine} ${width}: ${entry.checks.filter((c) => c.passed).length}/${entry.checks.length} checks`);
        }
      }
    } catch (error) { result.cases.push({ engine, checks: [{ name: "browser launch or context", passed: false, failure: failureEvidence(error) }] }); }
    finally { await browser?.close(); }
  }
  result.sourceAfter = await sourceEvidence();
  result.sourceUnchanged = result.sourceBefore.candidateSha256 === result.sourceAfter.candidateSha256;
  result.finishedAt = new Date().toISOString();
  result.passed = result.sourceUnchanged && result.cases.length === 12 && result.cases.every((entry) => entry.checks.length >= 19 && entry.checks.every((check) => check.passed));
  result.artifacts = {};
  for (const name of await readdir(directory)) result.artifacts[name] = sha256(await readFile(join(directory, name)));
  const resultBytes = JSON.stringify(result, null, 2) + "\n";
  await writeFile(join(directory, "results.json"), resultBytes);
  await writeFile(join(directory, "results.sha256"), `${sha256(resultBytes)}  results.json\n`);
  console.log(`Mobile matrix evidence: ${directory}/results.json`);
  invariant(result.passed, `Mobile browser matrix failed; see ${directory}/results.json`);
  return result;
}
