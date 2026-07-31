// Headless render of the SENA ENA plot: bundles the real component, renders it
// against the real Lesson 1 model, and writes an SVG plus a two-theme HTML page.
// Used as the visual check when the Next dev server cannot be started.
//
//   cd sena-hk-template
//   cp ../docs/validation/parity/render-ena-plot.tsx .tmp/plot-preview/entry.tsx
//   cp ../docs/validation/parity/tp1_ena_input.csv .tmp/plot-preview/
//   ./node_modules/@esbuild/darwin-arm64/bin/esbuild .tmp/plot-preview/entry.tsx \
//     --bundle --platform=node --format=esm --packages=external \
//     --jsx=automatic --alias:@=. --outfile=.tmp/plot-preview/bundle.mjs
//   node .tmp/plot-preview/bundle.mjs
//   node ../docs/validation/parity/resolve-theme.mjs   # writes plot-{light,dark}.svg
//   rsvg-convert -w 1440 .tmp/plot-preview/plot-light.svg -o plot-light.png
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { ena } from "jena-js";
import { EnaPlot } from "@/components/ena/EnaPlot";
import { buildEnaPlotModel } from "@/lib/ena/results";

const here = dirname(fileURLToPath(import.meta.url));
const CODES = ["TE", "EX", "IN", "RE", "SP", "TP"];

function parseCsv(text: string) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]));
  });
}

const input = parseCsv(readFileSync(join(here, "tp1_ena_input.csv"), "utf8").replace(/\r\n/g, "\n"));
const rows = input.map((row) => ({
  Group: row.Group,
  Condition: row.Condition,
  Speaker: row.Speaker,
  ...Object.fromEntries(CODES.map((code) => [code, Number(row[code])]))
}));

const set = ena({
  rows,
  units: ["Condition", "Group", "Speaker"],
  conversation: ["Group"],
  codes: CODES,
  window: "MovingStanzaWindow",
  windowSizeBack: 5,
  dimensions: 2
});

const model = buildEnaPlotModel(set);
const variance = set.variance;
const svg = renderToStaticMarkup(<EnaPlot model={model} variance={variance} /> as never);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SENA ENA plot preview</title>
<style>
  :root { --background: 229 240 239; --foreground: 13 21 38; --muted: 67 83 105; }
  [data-theme="dark"] { --background: 8 25 23; --foreground: 237 246 255; --muted: 166 198 191; }
  body { margin: 0; font-family: Inter, system-ui, sans-serif; background: rgb(var(--background)); color: rgb(var(--foreground)); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
  .pane { border: 1px solid rgb(var(--foreground) / 0.15); border-radius: 12px; padding: 8px; background: rgb(var(--background)); }
  h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin: 4px 8px 8px; color: rgb(var(--muted)); }
</style></head>
<body>
  <div class="row">
    <div class="pane" data-theme="light"><h2>Light</h2>${svg}</div>
    <div class="pane" data-theme="dark"><h2>Dark</h2>${svg}</div>
  </div>
</body></html>`;

writeFileSync(join(here, "preview.html"), page);
writeFileSync(join(here, "plot.svg"), svg);

const edgeCount = (svg.match(/data-plot-role="network-edge"/g) ?? []).length;
const nodeCount = (svg.match(/data-plot-role="network-node"/g) ?? []).length;
const pointCount = (svg.match(/data-plot-role="point"/g) ?? []).length;
console.log(JSON.stringify({
  units: set.unitLabels.length,
  traces: model.traces.map((trace) => `${trace.type}:${trace.name}`),
  variance,
  axisTitles: [model.axes.x.title, model.axes.y.title],
  rendered: { edges: edgeCount, networkNodes: nodeCount, points: pointCount },
  hasTitle: svg.includes('data-plot-role="title"'),
  hasLegend: svg.includes('data-sena-layer="legend"'),
  svgBytes: svg.length
}, null, 2));
