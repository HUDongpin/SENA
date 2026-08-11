import { chromium } from "playwright";

/**
 * Browser interaction-latency benchmark for the SENA workspace, used by the
 * performance campaign ledger (20260802_SENA_Perf Report.md, target T6). Run:
 *
 *   node scripts/bench-sena-workspace-latency.mjs [url]
 *   SENA_LATENCY_RUNS=15 node scripts/bench-sena-workspace-latency.mjs
 *
 * Measurement regime (pinned by the loop's timing rules — do not relax silently):
 *   - Target MUST be a production server (`next start`), warmed before run 1.
 *     Dev-server numbers are meaningless here (on-demand compilation).
 *   - Cold-load metrics use a FRESH browser context per run, so no HTTP cache,
 *     no warm JS heap, no prior module graph.
 *   - N >= 15 runs; medians with IQR and full min/max, never medians alone.
 *   - Timing is taken IN-PAGE via performance.now() and a MutationObserver, not
 *     by polling from Node: a Node-side poll adds round-trip latency of the same
 *     order as a plot switch (tens of ms) and would swamp the signal.
 *
 * Metrics:
 *   responseEnd / domContentLoaded / loadEvent — navigation timing (server + shell).
 *   canvasFirst    — first fusion canvas element to appear, already populated.
 *   canvasSettled  — the canvas element that SURVIVES, i.e. the one the user
 *                    actually interacts with. This is the honest "interactive"
 *                    moment and the number to quote.
 *   canvasRemountMs — canvasSettled - canvasFirst; nonzero means the workspace
 *                    was rendered twice (see below).
 *
 * Why two canvases: use-workspace-desktop-mode.ts starts at `useState(false)`
 * and only flips to desktop in a post-paint effect, so at >=1280px the first
 * commit renders the MOBILE branch and React then tears the subtree down and
 * rebuilds it as desktop. The first canvas ends up detached (isConnected
 * false). A harness that resolves on the first match measures a discarded
 * element, so this script tracks every canvas element and reports the connected
 * one. Viewport is pinned below because this behaviour is width-dependent.
 *
 *   plot switch     — click -> last DOM mutation, per view tab, warm context.
 *
 * Compression note: bytes seen by this script are wire bytes from `next start`
 * (gzip); the sena:performance:check budgets are brotli. Different quantities.
 */

const url = process.argv[2] ?? process.env.SENA_LATENCY_URL ?? "http://127.0.0.1:3123/workspace/sena";
const RUNS = Number(process.env.SENA_LATENCY_RUNS ?? 15);
const CANVAS = '[data-testid="sena-fusion-canvas"]';
const NODE_MARK = '[data-testid^="sena-node-"]';
const VIEWS = ["fusion", "dual", "temporal", "ena", "sna", "evidence", "matrix"];
const SETTLE_MS = 150;
// Pinned: the desktop/mobile branch swap is width-dependent, so an unpinned
// viewport would silently change which code path is measured.
const VIEWPORT = { width: 1440, height: 900 };

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const mid = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    p25: at(0.25),
    p75: at(0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

const fmt = (v) => (v === null || v === undefined ? "     —" : v.toFixed(1).padStart(8));

function row(label, s) {
  return `  ${label.padEnd(22)}${fmt(s.median)}${fmt(s.p25)}${fmt(s.p75)}${fmt(s.min)}${fmt(s.max)}`;
}

// Installed before any page script; records when the canvas appears and when it
// first carries model nodes, plus a rolling "last mutation" clock for switches.
function instrument() {
  // canvases: every distinct canvas element seen, with the time it first
  // carried model nodes. Retaining the element lets us ask isConnected later,
  // which is how the surviving canvas is identified after the branch swap.
  window.__sena = { canvases: [], lastMutation: null };
  const check = () => {
    window.__sena.lastMutation = performance.now();
    for (const canvas of document.querySelectorAll('[data-testid="sena-fusion-canvas"]')) {
      if (window.__sena.canvases.some((entry) => entry.el === canvas)) continue;
      if (!canvas.querySelector('[data-testid^="sena-node-"]')) continue;
      window.__sena.canvases.push({ el: canvas, at: performance.now() });
    }
  };
  const observe = () => {
    if (!document.documentElement) return false;
    new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
    check();
    return true;
  };
  if (!observe()) document.addEventListener("readystatechange", observe, { once: true });
}

const browser = await chromium.launch();
const cold = {
  responseEnd: [],
  domContentLoaded: [],
  loadEvent: [],
  canvasFirst: [],
  canvasSettled: [],
  canvasRemountMs: []
};
const switches = Object.fromEntries(VIEWS.map((v) => [v, []]));

// --- Cold load: fresh context per run. -------------------------------------
for (let run = 0; run < RUNS; run += 1) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForSelector(`${CANVAS} ${NODE_MARK}`, { timeout: 30000 });
  // The branch swap lands a few ms after the first canvas; wait for the DOM to
  // stop mutating so the surviving canvas is the one we record.
  await page.waitForFunction(
    (settleMs) => window.__sena.lastMutation !== null && performance.now() - window.__sena.lastMutation > settleMs,
    SETTLE_MS,
    { timeout: 30000 }
  );

  const sample = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const seen = window.__sena.canvases;
    const surviving = seen.filter((entry) => entry.el.isConnected);
    const first = seen.length ? seen[0].at : null;
    const settled = surviving.length ? surviving[surviving.length - 1].at : first;
    return {
      responseEnd: nav ? nav.responseEnd : null,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
      loadEvent: nav ? nav.loadEventEnd : null,
      canvasFirst: first,
      canvasSettled: settled,
      canvasRemountMs: first !== null && settled !== null ? settled - first : null,
      canvasElementsSeen: seen.length
    };
  });
  for (const key of Object.keys(cold)) {
    if (typeof sample[key] === "number") cold[key].push(sample[key]);
  }
  await context.close();
}

// --- Plot switches: warm context, one full pass per run. --------------------
const switchContext = await browser.newContext({ viewport: VIEWPORT });
await switchContext.addInitScript(instrument);
const switchPage = await switchContext.newPage();
await switchPage.goto(url, { waitUntil: "load", timeout: 30000 });
await switchPage.waitForSelector(`${CANVAS} ${NODE_MARK}`, { timeout: 30000 });

for (let run = 0; run < RUNS; run += 1) {
  for (const view of VIEWS) {
    await switchPage.evaluate(() => {
      window.__sena.lastMutation = null;
      window.__sena.switchStart = performance.now();
    });
    await switchPage.click(`[data-testid="workspace-view-tab-${view}"]`);
    // Settle in-page: resolve once no mutation has landed for SETTLE_MS.
    const latency = await switchPage.evaluate(async (settleMs) => {
      const start = window.__sena.switchStart;
      for (;;) {
        const last = window.__sena.lastMutation;
        if (last !== null && performance.now() - last > settleMs) return last - start;
        if (performance.now() - start > 5000) return null;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }, SETTLE_MS);
    if (typeof latency === "number") switches[view].push(latency);
  }
}
await switchContext.close();
await browser.close();

const header = `  ${"metric".padEnd(22)}${"median".padStart(8)}${"p25".padStart(8)}${"p75".padStart(8)}${"min".padStart(8)}${"max".padStart(8)}`;

console.log(`\nSENA workspace latency — ${url}  (viewport ${VIEWPORT.width}x${VIEWPORT.height})`);
console.log(`\ncold load (fresh context per run), ms since navigation start:`);
console.log(header);
for (const [key, samples] of Object.entries(cold)) {
  if (samples.length) console.log(row(key, stats(samples)));
}

console.log(`\nplot switch (warm context), ms from click to last DOM mutation:`);
console.log(header);
for (const view of VIEWS) {
  if (switches[view].length) console.log(row(view, stats(switches[view])));
}

const allSwitches = VIEWS.flatMap((v) => switches[v]);
if (allSwitches.length) console.log(row("ALL VIEWS", stats(allSwitches)));
console.log(
  `\nProtocol: ${RUNS} runs; fresh browser context per cold-load run; in-page ` +
    `performance.now() + MutationObserver; switch settle window ${SETTLE_MS} ms. ` +
    `Requires a warmed production server (next start).`
);
