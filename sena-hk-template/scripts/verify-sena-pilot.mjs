import net from "node:net";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { cwd } from "node:process";
import { join } from "node:path";
import { verifySenaAuthBrowserSmoke } from "./verify-sena-auth-browser-smoke.mjs";
import { verifySenaBrowserSmoke } from "./verify-sena-browser-smoke.mjs";
import { verifySenaEnaBrowserSmoke } from "./verify-sena-ena-browser-smoke.mjs";
import {
  registerVerifierControlledServerCustody,
  requireVerifierControlledServerCustody,
  verifySenaEnterpriseApiBrowserSmoke
} from "./verify-sena-enterprise-api-browser-smoke.mjs";
import { verifySenaRbacCollaborationBrowserSmoke } from "./verify-sena-rbac-collaboration-browser-smoke.mjs";
import { verifySenaReliabilityBrowserSmoke } from "./verify-sena-reliability-browser-smoke.mjs";
import { verifySenaSsoBrowserSmoke } from "./verify-sena-sso-browser-smoke.mjs";
import { verifySenaValidationClaimBrowserSmoke } from "./verify-sena-validation-claim-browser-smoke.mjs";
import {
  assertSenaVerifierEnvironmentIsLocal,
  buildSenaVerifierEnvironment
} from "./sena-verifier-environment.mjs";

const allowRunningServer = process.env.SENA_VERIFY_ALLOW_RUNNING_SERVER === "1";
const checkOnly = process.argv.includes("--check-only");
const projectRoot = cwd();
const smokePortStart = parsePortStart(process.env.SENA_VERIFY_SMOKE_PORT ?? "3101");
const productionPageContract = readJson("lib/sena/production-page-contract.json");
const provisioningSmokeToken = "sena-pilot-provisioning-token";
const browserSmokeCoveredPlotViewVisualCheckIds = new Set([
  "workspace-mobile-figure-switcher",
  "workspace-mobile-figure-fusion",
  "workspace-mobile-figure-dual",
  "workspace-research-details-toggle",
  "workspace-research-details-drawer",
  "workspace-research-details-tabs",
  "temporal-fusion-arc",
  "temporal-window-fingerprint",
  "temporal-window-fingerprint-role",
  "temporal-fusion-g-pair-metric",
  "temporal-trace-g-pair-line",
  "temporal-transition-evidence",
  "temporal-transition-summary",
  "temporal-transition-summary-role",
  // Ring 3 (ADR 0009). The default Fusion figure and its social orbit: every
  // id here is asserted in the live DOM by verify-sena-browser-smoke.mjs, and
  // verifyInteractiveVisualCheckCoverage below exits 1 if the production
  // contract stops declaring one of them.
  "fusion-plane-orbit-svg-anchor",
  "fusion-plane-nested-ena-plot",
  "fusion-orbit-layer-anchor",
  "fusion-orbit-sena-layer",
  "fusion-orbit-social-lane",
  "fusion-orbit-social-arrowhead",
  "fusion-orbit-lane-normalized-weight",
  "fusion-plane-unit-link",
  "fusion-plane-model-footer",
  "sna-orbit-sociogram",
  "workspace-model-layout-plane-orbit"
]);
const productionShellRequiredText = [
  'data-testid="sena-workspace-loading"'
];

function verifyInteractiveVisualCheckCoverage() {
  const visualCheckIds = new Set(productionPageContract.visualChecks.map((check) => check.id));
  const missing = Array.from(browserSmokeCoveredPlotViewVisualCheckIds)
    .filter((id) => !visualCheckIds.has(id));
  if (missing.length > 0) {
    console.error("Browser-smoke-covered visual checks are missing from the production page contract:");
    missing.forEach((id) => console.error(`  ${id}`));
    process.exit(1);
  }
}

function parsePortStart(value) {
  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port < 65535) return port;
  console.error(`Invalid SENA_VERIFY_SMOKE_PORT: ${value}`);
  process.exit(1);
}

function projectNextServers() {
  if (process.platform === "win32") return [];

  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8"
  });
  if (result.status !== 0 || !result.stdout) return [];

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(`${projectRoot}/node_modules/.bin/next`))
    .filter((line) => /\bnext\s+(dev|start)\b/.test(line));
}

function projectNodeListeners() {
  if (process.platform === "win32") return [];

  const listeners = spawnSync("lsof", ["-n", "-P", "-iTCP", "-sTCP:LISTEN"], {
    encoding: "utf8"
  });
  if (listeners.status !== 0 || !listeners.stdout) return [];

  const pids = Array.from(new Set(
    listeners.stdout
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((columns) => columns[0] === "node" && columns[1])
      .map((columns) => columns[1])
  ));

  return pids.flatMap((pid) => {
    const cwdResult = spawnSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], {
      encoding: "utf8"
    });
    const hasProjectCwd = cwdResult.stdout?.split("\n").some((line) => line === `n${projectRoot}`);
    return hasProjectCwd ? [`node process ${pid} is listening with cwd ${projectRoot}`] : [];
  });
}

function run(label, args, env = {}) {
  console.log(`\n> ${label}`);
  const childEnvironment = buildSenaVerifierEnvironment(process.env, env);
  if (typeof childEnvironment.SENA_ENTERPRISE_DB_DIR === "string") {
    assertSenaVerifierEnvironmentIsLocal(
      childEnvironment,
      childEnvironment.SENA_ENTERPRISE_DB_DIR
    );
  }
  const result = spawnSync("npm", args, {
    env: childEnvironment,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function projectNextBuildProcesses() {
  if (process.platform === "win32") return [];

  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8"
  });
  if (result.status !== 0 || !result.stdout) return [];

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(projectRoot))
    .filter((line) => /\bnext\s+build\b/.test(line));
}

async function waitForNextBuildProcessesToSettle() {
  const startedAt = Date.now();
  while (projectNextBuildProcesses().length > 0 && Date.now() - startedAt < 10_000) {
    await sleep(500);
  }
}

async function runNextProductionBuild() {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`\n> Next production build${attempt > 1 ? ` (retry ${attempt})` : ""}`);
    const result = spawnSync("npm", ["run", "build"], {
      env: buildSenaVerifierEnvironment(process.env),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === "win32"
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status === 0) return;

    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const isKnownProxyTraceRace = output.includes("proxy.js.nft.json") && output.includes("ENOENT");
    if (!isKnownProxyTraceRace || attempt === maxAttempts) {
      process.exit(result.status ?? 1);
    }

    console.warn("Next webpack build hit the known transient proxy trace artifact race; retrying once from a clean .next.");
    await waitForNextBuildProcessesToSettle();
    cleanNextBuildDirectory();
  }
}

function cleanNextBuildDirectory() {
  console.log("\n> Clean .next");
  rmSync(".next", { force: true, recursive: true });
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 40; port += 1) {
    if (await portAvailable(port)) return port;
  }
  throw new Error(`No available local port found from ${startPort} to ${startPort + 39}.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function verifyNextArtifacts() {
  console.log("\n> Verify Next production artifacts");
  const requiredFiles = [
    ".next/server/app/workspace/sena/page.js",
    ".next/server/app/workspace/sena/page_client-reference-manifest.js",
    ".next/server/app/workspace/sena.html",
    ".next/server/app/workspace/sena.rsc",
    // The jENA workbench is now driven by a browser smoke in the same run, so
    // its build output is required rather than incidental.
    ".next/server/app/workspace/ena/page.js",
    ".next/server/app/workspace/ena.html",
    ".next/server/app/workspace/ena.rsc",
    ".next/server/app-paths-manifest.json",
    ".next/server/middleware-manifest.json",
    ".next/server/pages-manifest.json",
    ".next/server/pages/404.html",
    ".next/server/pages/500.html"
  ];
  const missing = requiredFiles.filter((path) => !existsSync(path));

  if (missing.length > 0) {
    console.error("Missing required Next production artifacts:");
    missing.forEach((path) => console.error(`  ${path}`));
    process.exit(1);
  }

  const appPaths = readJson(".next/server/app-paths-manifest.json");
  const pages = readJson(".next/server/pages-manifest.json");
  const manifestIssues = [
    appPaths["/workspace/sena/page"] === "app/workspace/sena/page.js" ? null : "app-paths-manifest missing /workspace/sena/page",
    appPaths["/workspace/ena/page"] === "app/workspace/ena/page.js" ? null : "app-paths-manifest missing /workspace/ena/page",
    pages["/404"] === "pages/404.html" ? null : "pages-manifest missing /404",
    pages["/500"] === "pages/500.html" ? null : "pages-manifest missing /500"
  ].filter(Boolean);

  if (manifestIssues.length > 0) {
    console.error("Invalid Next production manifest entries:");
    manifestIssues.forEach((issue) => console.error(`  ${issue}`));
    process.exit(1);
  }

  console.log("Next production artifacts are present for /workspace/sena and /workspace/ena.");
}

function extractOpeningTagWithText(html, text) {
  const index = html.indexOf(text);
  if (index === -1) return null;

  const start = html.lastIndexOf("<", index);
  const end = html.indexOf(">", index);
  if (start === -1 || end === -1 || end < start) return null;

  return html.slice(start, end + 1);
}

/**
 * Server-rendered-HTML guards for the A1 Fusion Canvas.
 *
 * Two things about this path are worth stating rather than rediscovering:
 * it runs only under SENA_VERIFY_SERVER_RENDERED_WORKSPACE=1 (set nowhere in
 * this repo, and the workspace route is deliberately client-deferred, so the
 * fetched HTML is the loading shell), and since ADR 0009 the Canvas it
 * describes is a *Diagnostic* layout reached with model-layout-explanatory or
 * model-layout-joint — the default figure is the plane-orbit surface, checked
 * live by verify-sena-browser-smoke.mjs. The live-DOM smoke is the gate; this
 * is a static mirror of the Canvas grammar kept in step with the palette.
 */
function verifyFusionCanvasVisualGuards(html) {
  console.log("\n> Verify Fusion Canvas visual guards (Diagnostic layout, server-rendered mode)");

  const canvasTag = extractOpeningTagWithText(html, 'data-testid="sena-fusion-canvas"');
  if (!canvasTag?.startsWith("<svg")) {
    throw new Error("Fusion Canvas SVG anchor was not found as an opening <svg> tag.");
  }

  const workspaceRailTag = extractOpeningTagWithText(html, 'data-testid="sena-workspace-mode-rail"');
  if (!workspaceRailTag?.startsWith("<nav")) {
    throw new Error("C3 workspace rail was not found as an opening <nav> tag.");
  }
  if (!workspaceRailTag.includes('data-visual-role="workspace-shell-c3-glass-rail"')) {
    throw new Error("C3 workspace rail is missing its glass-rail visual role.");
  }

  for (const modelLayoutControlId of [
    "model-layout-explanatory",
    "model-layout-ena-space",
    "model-layout-joint",
    "model-layer-social-toggle",
    "model-layer-concept-toggle",
    "model-layer-bridge-toggle"
  ]) {
    const modelControlTag = extractOpeningTagWithText(html, `data-testid="${modelLayoutControlId}"`);
    if (!modelControlTag?.startsWith("<button")) {
      throw new Error(`Model Builder control ${modelLayoutControlId} was not found as an opening <button> tag.`);
    }
  }

  for (const modelSliderId of [
    "alpha-slider",
    "beta-slider",
    "gamma-slider",
    "edge-threshold-slider"
  ]) {
    const modelSliderTag = extractOpeningTagWithText(html, `data-testid="${modelSliderId}"`);
    if (!modelSliderTag?.startsWith("<input")) {
      throw new Error(`Model Builder slider ${modelSliderId} was not found as an opening <input> tag.`);
    }
  }

  const normalizationSelectTag = extractOpeningTagWithText(html, 'data-testid="normalization-select"');
  if (!normalizationSelectTag?.startsWith("<select")) {
    throw new Error("Model Builder normalization select was not found as an opening <select> tag.");
  }

  const plotSwitcherTag = extractOpeningTagWithText(html, 'data-testid="workspace-plot-switcher"');
  if (!plotSwitcherTag?.startsWith("<button")) {
    throw new Error("Collapsed workspace plot switcher was not found as an opening <button> tag.");
  }
  if (!plotSwitcherTag.includes('data-visual-role="workspace-shell-collapsed-plot-switcher"')) {
    throw new Error("Collapsed workspace plot switcher is missing its visual-role marker.");
  }
  for (const plotToolsSectionId of [
    "plot-tools-dimensions-section",
    "plot-tools-plotted-points-section",
    "plot-tools-network-graph-section",
    "plot-tools-temporal-framing-section"
  ]) {
    const plotToolsSectionTag = extractOpeningTagWithText(html, `data-testid="${plotToolsSectionId}"`);
    if (!plotToolsSectionTag?.startsWith("<section")) {
      throw new Error(`Plot Tools webENA section ${plotToolsSectionId} was not found as an opening <section> tag.`);
    }
    if (!plotToolsSectionTag.includes('data-visual-role="webena-plot-tools-section"')) {
      throw new Error(`Plot Tools webENA section ${plotToolsSectionId} is missing its visual-role marker.`);
    }
  }
  const advancedPlotToolsTag = extractOpeningTagWithText(html, 'data-testid="plot-tools-advanced-drawer"');
  if (!advancedPlotToolsTag?.startsWith("<section")) {
    throw new Error("Plot Tools Advanced Options drawer was not found as an opening <section> tag.");
  }
  if (!advancedPlotToolsTag.includes('data-visual-role="webena-plot-tools-advanced-drawer"')) {
    throw new Error("Plot Tools Advanced Options drawer is missing its visual-role marker.");
  }
  if (!advancedPlotToolsTag.includes('data-open="false"')) {
    throw new Error("Plot Tools Advanced Options drawer should default to collapsed.");
  }
  const centralPlotDeckTag = extractOpeningTagWithText(html, 'data-testid="workspace-central-plot-deck"');
  if (!centralPlotDeckTag?.startsWith("<section")) {
    throw new Error("Central workspace plot deck was not found as an opening <section> tag.");
  }
  if (!centralPlotDeckTag.includes('data-visual-role="workspace-central-plot-deck"')) {
    throw new Error("Central workspace plot deck is missing its visual-role marker.");
  }
  if (!centralPlotDeckTag.includes('data-default-plot-view="fusion"')) {
    throw new Error("Central workspace plot deck must default to the current-window Fusion Plot.");
  }
  if (!centralPlotDeckTag.includes('data-plot-scope="current-window"')) {
    throw new Error("Central workspace plot deck must declare its current-window default scope.");
  }
  const dataViewDrawerTag = extractOpeningTagWithText(html, 'data-testid="workspace-data-view-drawer"');
  if (!dataViewDrawerTag?.startsWith("<div")) {
    throw new Error("Workspace bottom Data View drawer was not found as an opening <div> tag.");
  }
  if (!dataViewDrawerTag.includes('data-visual-role="workspace-bottom-data-view-drawer"')) {
    throw new Error("Workspace bottom Data View drawer is missing its visual-role marker.");
  }
  if (!dataViewDrawerTag.includes('data-open="false"')) {
    throw new Error("Workspace bottom Data View drawer should default to collapsed.");
  }
  const dataViewToggleTag = extractOpeningTagWithText(html, 'data-testid="workspace-data-view-toggle"');
  if (!dataViewToggleTag?.startsWith("<button")) {
    throw new Error("Workspace bottom Data View toggle was not found as an opening <button> tag.");
  }
  const questionNodeTag = extractOpeningTagWithText(html, 'data-node-label="Question"');
  if (!questionNodeTag?.startsWith("<g")) {
    throw new Error("Fusion Canvas Question node group was not found as an opening <g> tag.");
  }
  if (!questionNodeTag.includes('data-node-glyph="Q"')) {
    throw new Error("Fusion Canvas Question node should use Q as its visible glyph.");
  }
  const centralFusionScopeTag = extractOpeningTagWithText(html, 'data-testid="central-fusion-analysis-scope"');
  if (!centralFusionScopeTag?.startsWith("<div")) {
    throw new Error("Central Fusion active-window analysis scope was not found as an opening <div> tag.");
  }
  if (!centralFusionScopeTag.includes('data-visual-role="active-window-fusion-scope"')) {
    throw new Error("Central Fusion active-window analysis scope is missing its visual-role marker.");
  }
  if (!centralFusionScopeTag.includes("data-a-fusion-checksum=")) {
    throw new Error("Central Fusion active-window analysis scope is missing its A_fusion checksum attribute.");
  }
  if (!centralFusionScopeTag.includes("data-delta-fusion=")) {
    throw new Error("Central Fusion active-window analysis scope is missing its adjacent-window A_fusion delta attribute.");
  }
  const centralFusionEvidenceCapsuleTag = extractOpeningTagWithText(html, 'data-testid="central-fusion-evidence-capsule"');
  if (!centralFusionEvidenceCapsuleTag?.startsWith("<div")) {
    throw new Error("Central Fusion current-window evidence capsule was not found as an opening <div> tag.");
  }
  if (!centralFusionEvidenceCapsuleTag.includes('data-visual-role="current-window-fusion-evidence-capsule"')) {
    throw new Error("Central Fusion current-window evidence capsule is missing its visual-role marker.");
  }
  const centralFusionDeltaTag = extractOpeningTagWithText(html, 'data-testid="central-fusion-transition-delta"');
  if (!centralFusionDeltaTag?.startsWith("<div")) {
    throw new Error("Central Fusion adjacent-window delta was not found as an opening <div> tag.");
  }
  if (!centralFusionDeltaTag.includes('data-visual-role="active-window-fusion-transition-delta"')) {
    throw new Error("Central Fusion adjacent-window delta is missing its visual-role marker.");
  }
  const centralFusionGPairTag = extractOpeningTagWithText(html, 'data-testid="central-fusion-delta-g-pair"');
  if (!centralFusionGPairTag?.startsWith("<div")) {
    throw new Error("Central Fusion top G-pair shift was not found as an opening <div> tag.");
  }
  if (!centralFusionGPairTag.includes('data-visual-role="active-window-fusion-g-pair-driver"')) {
    throw new Error("Central Fusion top G-pair shift is missing its visual-role marker.");
  }
  const primaryPlotTag = extractOpeningTagWithText(html, 'data-testid="workspace-primary-plot"');
  if (!primaryPlotTag?.startsWith("<section")) {
    throw new Error("Workspace Primary Plot viewport was not found as an opening <section> tag.");
  }
  if (!primaryPlotTag.includes('data-visual-role="workspace-primary-plot"')) {
    throw new Error("Workspace Primary Plot viewport is missing its visual-role marker.");
  }
  const secondaryPlotTag = extractOpeningTagWithText(html, 'data-testid="workspace-secondary-plot"');
  if (!secondaryPlotTag?.startsWith("<section")) {
    throw new Error("Workspace Secondary Plot viewport was not found as an opening <section> tag.");
  }
  if (!secondaryPlotTag.includes('data-visual-role="workspace-secondary-plot"')) {
    throw new Error("Workspace Secondary Plot viewport is missing its visual-role marker.");
  }
  const secondaryComparisonTag = extractOpeningTagWithText(html, 'data-testid="workspace-secondary-comparison-lens"');
  if (!secondaryComparisonTag?.startsWith("<div")) {
    throw new Error("Workspace Secondary Plot comparison lens was not found as an opening <div> tag.");
  }
  if (!secondaryComparisonTag.includes('data-visual-role="secondary-plot-current-window-comparison"')) {
    throw new Error("Workspace Secondary Plot comparison lens is missing its visual-role marker.");
  }

  const pilotAssetsTag = extractOpeningTagWithText(html, 'data-testid="pilot-assets-panel"');
  if (!pilotAssetsTag?.startsWith("<div")) {
    throw new Error("Pilot assets panel was not found as an opening <div> tag.");
  }
  if (!pilotAssetsTag.includes('data-visual-role="pilot-assets-panel"')) {
    throw new Error("Pilot assets panel is missing its visual-role marker.");
  }
  for (const assetKind of ["manifest", "sample", "template"]) {
    const assetTag = extractOpeningTagWithText(html, `data-asset-kind="${assetKind}"`);
    if (!assetTag?.startsWith("<a")) {
      throw new Error(`Pilot ${assetKind} asset link was not found as an opening <a> tag.`);
    }
    if (!assetTag.includes('data-testid="pilot-asset-link"')) {
      throw new Error(`Pilot ${assetKind} asset link is missing its stable test id.`);
    }
  }
  const assetIntegrityTag = extractOpeningTagWithText(html, 'data-testid="pilot-asset-integrity"');
  if (!assetIntegrityTag?.startsWith("<div")) {
    throw new Error("Pilot asset integrity signal was not found as an opening <div> tag.");
  }
  if (!assetIntegrityTag.includes('data-visual-role="pilot-asset-integrity"')) {
    throw new Error("Pilot asset integrity signal is missing its visual-role marker.");
  }
  const contractTemplateTag = extractOpeningTagWithText(html, 'data-testid="export-contract-template"');
  if (!contractTemplateTag?.startsWith("<button")) {
    throw new Error("Contract template export control was not found as an opening <button> tag.");
  }
  const handoffChecksTag = extractOpeningTagWithText(html, 'data-testid="pilot-handoff-checks"');
  if (!handoffChecksTag?.startsWith("<div")) {
    throw new Error("Pilot handoff checks panel was not found as an opening <div> tag.");
  }
  if (!handoffChecksTag.includes('data-visual-role="pilot-handoff-checks"')) {
    throw new Error("Pilot handoff checks panel is missing its visual-role marker.");
  }
  const modelJsonHandoffTag = extractOpeningTagWithText(html, 'data-handoff-check-id="model-json-export"');
  if (!modelJsonHandoffTag?.startsWith("<div")) {
    throw new Error("Pilot model-json-export handoff check was not found as an opening <div> tag.");
  }

  const guideTag = extractOpeningTagWithText(html, 'data-testid="sena-fusion-center-guide"');
  if (!guideTag?.startsWith("<circle")) {
    throw new Error("Fusion Canvas center guide was not found as an opening <circle> tag.");
  }

  const guideRequirements = [
    'r="184"',
    'fill="none"',
    // P5 re-stepped the concept layer stroke to the single-source palette value
    // (lib/sena/layer-palette.ts). #895dff is retired and forbidden from the
    // plot surfaces by layer-palette-stroke-migration.test.ts, so pinning it
    // here made this guard permanently unsatisfiable.
    'stroke="#A06BF5"',
    'data-layer="concept"',
    'data-visual-role="concept-space-guide"'
  ];
  const missing = guideRequirements.filter((item) => !guideTag.includes(item));
  if (missing.length > 0) {
    throw new Error(`Fusion Canvas center guide is missing required SVG attributes: ${missing.join(", ")}`);
  }

  const disallowed = [
    'fill="#000"',
    'fill="black"',
    'fill="rgb(0,0,0)"',
    'fill="rgb(0 0 0)"'
  ].filter((item) => guideTag.toLowerCase().includes(item));
  if (disallowed.length > 0) {
    throw new Error(`Fusion Canvas center guide contains a black fill: ${disallowed.join(", ")}`);
  }

  const enaSolidLinkTag = extractOpeningTagWithText(html, 'data-visual-role="ena-solid-concept-link"');
  if (!enaSolidLinkTag?.startsWith("<path")) {
    throw new Error("Fusion Canvas ENA solid concept link was not found as an opening <path> tag.");
  }
  if (enaSolidLinkTag.toLowerCase().includes("stroke-dasharray")) {
    throw new Error("Fusion Canvas ENA concept link is dashed; adopted A1 Inner Solid Mesh requires solid W links.");
  }
  const readableLinkHaloTag = extractOpeningTagWithText(html, 'data-visual-role="fusion-readable-link-halo"');
  if (!readableLinkHaloTag?.startsWith("<path")) {
    throw new Error("Fusion Canvas readable link halo was not found as an opening <path> tag.");
  }
  const weightedLinkTag = extractOpeningTagWithText(html, "data-edge-visual-width=");
  if (!weightedLinkTag?.startsWith("<path")) {
    throw new Error("Fusion Canvas weighted link width marker was not found on an opening <path> tag.");
  }
  if (!weightedLinkTag.includes("data-edge-scaled-weight=")) {
    throw new Error("Fusion Canvas weighted link is missing scaled-weight provenance.");
  }
  if (!weightedLinkTag.includes("data-edge-visual-salience=")) {
    throw new Error("Fusion Canvas weighted link is missing visual-salience provenance.");
  }
  const selectableNodeTag = extractOpeningTagWithText(html, 'data-testid="sena-node-');
  if (!selectableNodeTag?.startsWith("<g")) {
    throw new Error("Fusion Canvas selectable node was not found as an opening <g> tag.");
  }
  if (html.includes('data-testid="fusion-selected-node-label"')) {
    throw new Error("Fusion Canvas selected node labels should not render before a node is selected.");
  }

  const enaConceptCircleTag = extractOpeningTagWithText(html, 'data-visual-role="ena-concept-circle-node"');
  if (!enaConceptCircleTag?.startsWith("<circle")) {
    throw new Error("Fusion Canvas ENA concept node was not found as an opening <circle> tag.");
  }

  const snaPersonHexTag = extractOpeningTagWithText(html, 'data-visual-role="sna-person-hex-node"');
  if (!snaPersonHexTag?.startsWith("<polygon")) {
    throw new Error("Fusion Canvas SNA person node was not found as an opening <polygon> tag.");
  }

  const snaOuterOrbitTag = extractOpeningTagWithText(html, 'data-arc-route="outer-orbit"');
  if (!snaOuterOrbitTag?.startsWith("<path")) {
    throw new Error("Fusion Canvas SNA outer-orbit social arc was not found as an opening <path> tag.");
  }
  if (!snaOuterOrbitTag.includes('data-visual-role="outer-social-arc"')) {
    throw new Error("Fusion Canvas SNA outer-orbit path is missing its outer-social-arc visual role.");
  }
  if (!snaOuterOrbitTag.includes('data-layer="social"')) {
    throw new Error("Fusion Canvas SNA outer-orbit path is not bound to the social layer.");
  }

  const layerKeyTag = extractOpeningTagWithText(html, 'data-testid="fusion-layer-key"');
  if (!layerKeyTag?.startsWith("<div")) {
    throw new Error("Fusion Canvas A1 layer key was not found as an opening <div> tag.");
  }
  if (!layerKeyTag.includes('data-visual-role="fusion-layer-key-a1"')) {
    throw new Error("Fusion Canvas A1 layer key is missing its visual-role marker.");
  }
  const lineWeightNoteTag = extractOpeningTagWithText(html, 'data-testid="fusion-layer-key-line-weight-note"');
  if (!lineWeightNoteTag?.startsWith("<div")) {
    throw new Error("Fusion Canvas A1 layer key is missing its line-weight provenance note.");
  }
  const gLayerKeyTag = extractOpeningTagWithText(html, 'data-visual-role="fusion-layer-key-g"');
  if (!gLayerKeyTag?.startsWith("<div")) {
    throw new Error("Fusion Canvas G contribution layer key was not found as an opening <div> tag.");
  }
  const strokeProvenanceTag = extractOpeningTagWithText(html, 'data-testid="edge-visual-stroke-provenance"');
  if (!strokeProvenanceTag?.startsWith("<div")) {
    throw new Error("Fusion Canvas selected-edge line-weight provenance was not found in the inspector.");
  }
  if (!strokeProvenanceTag.includes('data-visual-role="edge-visual-stroke-provenance"')) {
    throw new Error("Fusion Canvas selected-edge line-weight provenance is missing its visual-role marker.");
  }

  const metricProvenanceTag = extractOpeningTagWithText(html, 'data-testid="metric-provenance-panel"');
  if (!metricProvenanceTag?.startsWith("<div")) {
    throw new Error("Metric provenance panel was not found as an opening <div> tag.");
  }
  if (!metricProvenanceTag.includes('data-visual-role="sena-metric-provenance"')) {
    throw new Error("Metric provenance panel is missing its visual-role marker.");
  }

  const jenaConceptHandoffTag = extractOpeningTagWithText(html, 'data-testid="stats-jena-concept-handoff"');
  if (!jenaConceptHandoffTag?.startsWith("<div")) {
    throw new Error("Stats jENA concept-pair handoff panel was not found as an opening <div> tag.");
  }
  if (!jenaConceptHandoffTag.includes('data-visual-role="stats-jena-concept-pair-handoff"')) {
    throw new Error("Stats jENA concept-pair handoff panel is missing its visual-role marker.");
  }

  const jsnaSocialHandoffTag = extractOpeningTagWithText(html, 'data-testid="stats-jsna-social-handoff"');
  if (!jsnaSocialHandoffTag?.startsWith("<div")) {
    throw new Error("Stats jSNA social-tie handoff panel was not found as an opening <div> tag.");
  }
  if (!jsnaSocialHandoffTag.includes('data-visual-role="stats-jsna-social-tie-handoff"')) {
    throw new Error("Stats jSNA social-tie handoff panel is missing its visual-role marker.");
  }

  const methodProtocolRuntimeHandoffTag = extractOpeningTagWithText(html, 'data-testid="method-protocol-runtime-handoffs"');
  if (!methodProtocolRuntimeHandoffTag?.startsWith("<div")) {
    throw new Error("Stats method-protocol runtime handoff panel was not found as an opening <div> tag.");
  }
  if (!methodProtocolRuntimeHandoffTag.includes('data-visual-role="method-protocol-runtime-handoff-ledger"')) {
    throw new Error("Stats method-protocol runtime handoff panel is missing its visual-role marker.");
  }

  for (const exportControlId of [
    "export-stats-sna-report",
    "export-stats-jena-manifest",
    "export-stats-jsna-manifest",
    "export-stats-g-report",
    "export-stats-metric-provenance",
    "export-stats-method-protocol"
  ]) {
    const exportControlTag = extractOpeningTagWithText(html, `data-testid="${exportControlId}"`);
    if (!exportControlTag?.startsWith("<button")) {
      throw new Error(`Stats export control ${exportControlId} was not found as an opening <button> tag.`);
    }
  }

  const edgeProvenanceTag = extractOpeningTagWithText(html, 'data-testid="edge-matrix-provenance"');
  if (!edgeProvenanceTag?.startsWith("<div")) {
    throw new Error("Selected edge matrix provenance panel was not found as an opening <div> tag.");
  }
  if (!edgeProvenanceTag.includes('data-visual-role="edge-matrix-provenance"')) {
    throw new Error("Selected edge matrix provenance panel is missing its visual-role marker.");
  }

  const claimReadinessTag = extractOpeningTagWithText(html, 'data-testid="claim-readiness-gate"');
  if (!claimReadinessTag?.startsWith("<div")) {
    throw new Error("Claim readiness gate panel was not found as an opening <div> tag.");
  }
  if (!claimReadinessTag.includes('data-visual-role="claim-readiness-gate"')) {
    throw new Error("Claim readiness gate panel is missing its visual-role marker.");
  }

  const codingReliabilityTag = extractOpeningTagWithText(html, 'data-testid="coding-reliability-gate"');
  if (!codingReliabilityTag?.startsWith("<div")) {
    throw new Error("Coding reliability gate panel was not found as an opening <div> tag.");
  }
  if (!codingReliabilityTag.includes('data-visual-role="coding-reliability-gate"')) {
    throw new Error("Coding reliability gate panel is missing its visual-role marker.");
  }

  const reviewPacketAuditTag = extractOpeningTagWithText(html, 'data-testid="review-packet-audit"');
  if (!reviewPacketAuditTag?.startsWith("<div")) {
    throw new Error("Review packet audit panel was not found as an opening <div> tag.");
  }
  if (!reviewPacketAuditTag.includes('data-visual-role="review-packet-audit"')) {
    throw new Error("Review packet audit panel is missing its visual-role marker.");
  }

  const methodProtocolHandoffTag = extractOpeningTagWithText(html, 'data-audit-id="method-protocol-handoff"');
  if (!methodProtocolHandoffTag?.startsWith("<div")) {
    throw new Error("Review packet method-protocol handoff audit item was not found as an opening <div> tag.");
  }

  const projectSnapshotHandoffTag = extractOpeningTagWithText(html, 'data-audit-id="project-snapshot-handoff"');
  if (!projectSnapshotHandoffTag?.startsWith("<div")) {
    throw new Error("Review packet project-snapshot handoff audit item was not found as an opening <div> tag.");
  }

  const developmentPlanHandoffTag = extractOpeningTagWithText(html, 'data-audit-id="development-plan-handoff"');
  if (!developmentPlanHandoffTag?.startsWith("<div")) {
    throw new Error("Review packet development-plan handoff audit item was not found as an opening <div> tag.");
  }

  console.log("Fusion Canvas center guide is an unfilled concept-space outline.");
  console.log("C3 Workspace shell exposes the glass rail, collapsed plot switcher, central deck, and Primary/Secondary viewports.");
  console.log("Data Import exposes verified pilot package manifest, sample, template, and handoff-check affordances.");
  console.log("Fusion Canvas uses circular ENA concept nodes and hexagonal SNA person nodes.");
  console.log("Fusion Canvas ENA W links use the adopted solid inner mesh visual role.");
  console.log("Fusion Canvas A1 layer key exposes S/W/B/G visual grammar.");
  console.log("Runtime panel exposes the five-table -> jENA -> jSNA -> SENA fusion handoff chain and concrete JS API surface.");
  console.log("Method Validation exposes metric source, parity, and interpretation-limit provenance.");
  console.log("Stats rail exposes stable real export controls for jSNA, jENA, G, and metric provenance artifacts.");
  console.log("Evidence Inspector exposes selected-edge runtime and matrix provenance.");
  console.log("Report Generator exposes the claim-readiness gate for research-claim handoff.");
  console.log("Report Generator exposes the coding reliability gate for research-claim handoff.");
  console.log("Report Generator exposes the review-packet project-snapshot, development-plan, and method-protocol handoff audits.");
}

function verifyWorkspaceDynamicShell(html) {
  console.log("\n> Verify SENA workspace dynamic shell");
  if (process.env.SENA_VERIFY_SERVER_RENDERED_WORKSPACE === "1") {
    verifyFusionCanvasVisualGuards(html);
    return;
  }
  const loadingShellTag = extractOpeningTagWithText(html, 'data-testid="sena-workspace-loading"');
  if (!loadingShellTag?.startsWith("<main")) {
    throw new Error("SENA workspace dynamic loading shell was not found as an opening <main> tag.");
  }
  if (html.includes('data-testid="sena-fusion-canvas"')) {
    throw new Error("SENA workspace full Fusion Canvas should be deferred to the client bundle, not server-prerendered into the route shell.");
  }
  console.log("SENA workspace route serves a lightweight dynamic shell; full workbench DOM is verified by Playwright smoke.");
}

async function waitForText(url, expectedText, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      const text = await response.text();
      if (response.ok && expectedText.every((item) => text.includes(item))) {
        return { status: response.status, text };
      }
      lastError = `HTTP ${response.status}; missing=${expectedText.filter((item) => !text.includes(item)).join(", ")}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function redactVerifierValues(value, sensitiveValues) {
  let text = String(value ?? "");
  let detected = false;
  sensitiveValues.filter(Boolean).forEach((sensitiveValue) => {
    if (!text.includes(sensitiveValue)) return;
    detected = true;
    text = text.split(sensitiveValue).join("[REDACTED_VERIFIER_VALUE]");
  });
  return { text, detected };
}

async function verifyProductionServerSmoke() {
  console.log("\n> Verify production server smoke");
  const port = await findAvailablePort(smokePortStart);
  const origin = `http://127.0.0.1:${port}`;
  const enterpriseDbDir = mkdtempSync(join(tmpdir(), "sena-pilot-enterprise-db-"));
  const expertReviewSigningSecret = randomBytes(32).toString("hex");
  const expertReviewSigningKeyId = `sena-pilot-smoke-${randomBytes(8).toString("hex")}`;
  let output = "";
  const nextBin = "node_modules/next/dist/bin/next";
  const serverEnvironment = buildSenaVerifierEnvironment(process.env, {
    NODE_ENV: "production",
    PORT: String(port),
    SENA_ENTERPRISE_DB_DIR: enterpriseDbDir,
    SENA_ALLOW_LOCAL_SSO_FALLBACK: "1",
    SENA_APP_URL: origin,
    NEXT_PUBLIC_SENA_APP_URL: origin,
    SENA_PROVISIONING_TOKEN: provisioningSmokeToken,
    SENA_EXPERT_REVIEW_SIGNING_SECRET: expertReviewSigningSecret,
    SENA_EXPERT_REVIEW_SIGNING_KEY_ID: expertReviewSigningKeyId
  });
  assertSenaVerifierEnvironmentIsLocal(serverEnvironment, enterpriseDbDir);
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: projectRoot,
    env: serverEnvironment,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stoppingByVerifier = false;
  let resolveOwnedReadiness;
  const ownedReadiness = new Promise((resolve) => {
    resolveOwnedReadiness = resolve;
  });
  const serverExit = new Promise((resolve) => {
    server.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const serverExitFailure = serverExit.then(({ code, signal }) => {
    if (stoppingByVerifier) return new Promise(() => {});
    throw new Error(`Production server exited before smoke completed (code=${code ?? "null"}, signal=${signal ?? "null"}).`);
  });

  const record = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-6000);
    const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, "");
    if (/\bReady in \d+(?:\.\d+)?(?:ms|s)\b/.test(plainOutput)) {
      resolveOwnedReadiness(true);
    }
  };
  server.stdout.on("data", record);
  server.stderr.on("data", record);

  try {
    await Promise.race([
      ownedReadiness,
      serverExitFailure,
      sleep(30_000).then(() => {
        throw new Error("Timed out waiting for the verifier-owned Next process readiness marker.");
      })
    ]);
    const serverCustody = Object.freeze({
      mode: "verifier-controlled-loopback-temporary-server",
      serverProcess: server,
      serverEnvironment,
      enterpriseDbDir,
      serverWorkingDirectory: projectRoot,
      serverReadyFromOwnedProcess: true
    });
    const custodyOptions = Object.freeze({
      provisioningToken: provisioningSmokeToken,
      expectedReceiptKeyId: expertReviewSigningKeyId,
      serverCustody
    });
    registerVerifierControlledServerCustody(
      custodyOptions,
      origin,
      expertReviewSigningKeyId,
      provisioningSmokeToken
    );
    const assertOwnedServer = () => requireVerifierControlledServerCustody(
      custodyOptions,
      origin,
      expertReviewSigningKeyId,
      provisioningSmokeToken
    );
    const runWithOwnedServer = async (operation) => {
      assertOwnedServer();
      const result = await Promise.race([
        Promise.resolve().then(operation),
        serverExitFailure
      ]);
      assertOwnedServer();
      return result;
    };

    // This is the first network request. Process/env/tmp-state custody is
    // already proved from the owned child's stdout and exact spawn identity.
    const url = `${origin}/workspace/sena`;
    await runWithOwnedServer(async () => {
      const { text } = await waitForText(url, productionShellRequiredText);
      verifyWorkspaceDynamicShell(text);
    });
    assertOwnedServer();
    await Promise.race([
      Promise.resolve().then(() => run("Verify conference load smoke", ["run", "sena:conference:load-check"], {
        SENA_LOAD_TARGET_URL: origin,
        SENA_LOAD_PATHS: "/workspace/sena,/api/sena/docs?format=openapi",
        SENA_LOAD_TARGET_USERS: "2",
        SENA_LOAD_CONCURRENCY: "2",
        SENA_LOAD_DURATION_SECONDS: "1",
        SENA_LOAD_THINK_TIME_MS: "0",
        SENA_LOAD_MAX_REQUESTS: "4",
        SENA_LOAD_MIN_REQUESTS: "4",
        SENA_LOAD_MAX_P95_MS: "5000",
        SENA_LOAD_MAX_ERROR_RATE_PERCENT: "0"
      })),
      serverExitFailure
    ]);
    assertOwnedServer();
    await runWithOwnedServer(() => verifySenaBrowserSmoke(url));
    // /workspace/ena is a different route on the same server. It takes an
    // origin, not the SENA route, and it is public — no session is created
    // before it runs, which is also what it asserts.
    console.log("\n> Verify jENA workbench browser smoke");
    await runWithOwnedServer(() => verifySenaEnaBrowserSmoke(origin));
    console.log("\n> Verify auth browser smoke");
    await runWithOwnedServer(() => verifySenaAuthBrowserSmoke(url));
    console.log("\n> Verify SSO browser smoke");
    await runWithOwnedServer(() => verifySenaSsoBrowserSmoke(url));
    console.log("\n> Verify enterprise API browser smoke");
    await runWithOwnedServer(() => verifySenaEnterpriseApiBrowserSmoke(url, custodyOptions));
    console.log("\n> Verify RBAC collaboration browser smoke");
    await runWithOwnedServer(() => verifySenaRbacCollaborationBrowserSmoke(url));
    console.log("\n> Verify reliability browser smoke");
    await runWithOwnedServer(() => verifySenaReliabilityBrowserSmoke(url, custodyOptions));
    console.log("\n> Verify validation claim browser smoke");
    await runWithOwnedServer(() => verifySenaValidationClaimBrowserSmoke(url, custodyOptions));
    console.log(`Production server served /workspace/sena on port ${port}.`);
  } catch (error) {
    const sensitiveValues = [expertReviewSigningSecret, expertReviewSigningKeyId];
    const safeOutput = redactVerifierValues(output, sensitiveValues);
    const safeError = redactVerifierValues(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
      sensitiveValues
    );
    if (safeOutput.text.trim()) console.error(safeOutput.text);
    if (safeOutput.detected || safeError.detected) {
      throw new Error(`Production server smoke failed after verifier-only signing material was detected and redacted. ${safeError.text}`);
    }
    throw error;
  } finally {
    stoppingByVerifier = true;
    let exited = server.exitCode !== null || server.signalCode !== null;
    if (!exited) {
      server.kill("SIGTERM");
      exited = await Promise.race([
        serverExit.then(() => true),
        sleep(1500).then(() => false)
      ]);
    }
    if (!exited) {
      server.kill("SIGKILL");
      exited = await Promise.race([
        serverExit.then(() => true),
        sleep(500).then(() => false)
      ]);
    }
    if (!exited) {
      throw new Error(`Verifier-owned Next process termination was not observed; temporary state retained at ${enterpriseDbDir}.`);
    }
    rmSync(enterpriseDbDir, { force: true, recursive: true });
  }
}

const nextServers = projectNextServers();
const nodeListeners = projectNodeListeners();
if ((nextServers.length > 0 || nodeListeners.length > 0) && !allowRunningServer) {
  if (nextServers.length > 0) {
    console.error("This project already has a running Next.js server:");
    nextServers.forEach((line) => console.error(`  ${line}`));
  }
  if (nodeListeners.length > 0) {
    console.error("This project has a local node server listening on a TCP port:");
    nodeListeners.forEach((line) => console.error(`  ${line}`));
  }
  console.error("Stop `npm run start` or `npm run dev` before verification so `next build` can safely rebuild .next.");
  console.error("Set SENA_VERIFY_ALLOW_RUNNING_SERVER=1 only if you intentionally accept that risk.");
  process.exit(1);
}

verifyInteractiveVisualCheckCoverage();

if (checkOnly) {
  console.log(nextServers.length > 0 || nodeListeners.length > 0
    ? "A local server is running, but the guard is bypassed."
    : "No conflicting local Next.js server was detected for SENA pilot verification.");
  process.exit(0);
}

const enterpriseTestDbDir = mkdtempSync(join(tmpdir(), "sena-pilot-test-db-"));
try {
  run("SENA pilot smoke", ["run", "sena:pilot:smoke"], { SENA_ENTERPRISE_DB_DIR: enterpriseTestDbDir });
  run("Full test suite", ["test"], { SENA_ENTERPRISE_DB_DIR: enterpriseTestDbDir });
} finally {
  rmSync(enterpriseTestDbDir, { force: true, recursive: true });
}
cleanNextBuildDirectory();
await runNextProductionBuild();
verifyNextArtifacts();
run("Verify performance budget artifact", ["run", "sena:performance:check"]);
await verifyProductionServerSmoke();

console.log("\nSENA pilot verification complete.");
