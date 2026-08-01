/**
 * jena-js 0.6.2 vs rENA 0.3.1 parity on the Class 1 CoI data.
 *
 * Runs the identical model spec the R pipeline used (units Condition>Group>Speaker,
 * conversation Group, MovingStanzaWindow back=5, 3 SVD dimensions) and diffs
 * node positions, unit points, line weights and condition mean networks against
 * the R goldens in Class 1_ENA/*_3D ENA outputs/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Resolved by path so the script runs from this folder without its own install.
const jenaUrl = new URL("../../../sena-hk-template/node_modules/jena-js/dist/index.js", import.meta.url);
const { ena, enaCorrelations } = await import(jenaUrl.href);

const here = dirname(fileURLToPath(import.meta.url));
const CODES = ["TE", "EX", "IN", "RE", "SP", "TP"];
const DIMS = ["X", "Y", "Z"];

const GOLDEN_DIRS = {
  tp1: "/Users/dongpinhu/Desktop/Class 1_ENA/Lesson 1_In-class_3D ENA outputs",
  tp2: "/Users/dongpinhu/Desktop/Class 1_ENA/Lesson 1_After-class_3D ENA outputs",
  tp3: "/Users/dongpinhu/Desktop/Class 1_ENA/Lesson 2_3D ENA outputs"
};

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; } else quoted = false;
      } else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(current); current = ""; }
    else current += char;
  }
  cells.push(current);
  return cells;
}

function maxAbs(values) {
  return values.reduce((best, value) => Math.max(best, Math.abs(value)), 0);
}

function pearson(a, b) {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - meanA;
    const y = b[i] - meanB;
    num += x * y; da += x * x; db += y * y;
  }
  if (da === 0 || db === 0) return 1;
  return num / Math.sqrt(da * db);
}

function runOne(tp) {
  const input = parseCsv(readFileSync(join(here, `${tp}_ena_input.csv`), "utf8"));
  const rows = input.map((row) => ({
    MsgID: row.MsgID,
    Group: row.Group,
    Condition: row.Condition,
    Speaker: row.Speaker,
    Seq: Number(row.Seq),
    ...Object.fromEntries(CODES.map((code) => [code, Number(row[code])]))
  }));
  // R sorted by (Group, Seq) before accumulating; the CSV already carries that order.

  const started = process.hrtime.bigint();
  const set = ena({
    rows,
    units: ["Condition", "Group", "Speaker"],
    conversation: ["Group"],
    codes: CODES,
    window: "MovingStanzaWindow",
    windowSizeBack: 5,
    dimensions: 3
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const goldenDir = GOLDEN_DIRS[tp];
  const gNodes = parseCsv(readFileSync(join(goldenDir, `${tp}_nodes.csv`), "utf8"));
  const gPoints = parseCsv(readFileSync(join(goldenDir, `${tp}_points.csv`), "utf8"));
  const gWeights = parseCsv(readFileSync(join(goldenDir, `${tp}_line_weights.csv`), "utf8"));
  const gNetworks = parseCsv(readFileSync(join(goldenDir, `${tp}_networks.csv`), "utf8"));

  const rotationColumns = set.rotation.rotationColumns.slice(0, 3);

  // --- Dimension sign alignment (SVD sign is arbitrary; rENA and jena-js may differ) ---
  const jsNodes = new Map((set.rotation.nodes ?? []).map((node) => [String(node.code), node]));
  const signs = rotationColumns.map((column, dimIndex) => {
    const pairs = gNodes.map((row) => {
      const node = jsNodes.get(row.code);
      return [Number(row[DIMS[dimIndex]]), Number(node?.[column] ?? 0)];
    });
    const dot = pairs.reduce((sum, [r, j]) => sum + r * j, 0);
    return dot < 0 ? -1 : 1;
  });

  // --- Nodes ---
  const nodeDeltas = [];
  for (const row of gNodes) {
    const node = jsNodes.get(row.code);
    rotationColumns.forEach((column, dimIndex) => {
      nodeDeltas.push(Number(node?.[column] ?? 0) * signs[dimIndex] - Number(row[DIMS[dimIndex]]));
    });
  }

  // --- Points (matched on ENA_UNIT label) ---
  const jsPoints = new Map(set.points.map((point) => {
    const label = [point.Condition, point.Group, point.Speaker].join("::");
    return [label, point];
  }));
  const pointDeltas = [];
  const pointPairs = rotationColumns.map(() => ({ r: [], j: [] }));
  let unmatchedUnits = 0;
  for (const row of gPoints) {
    const point = jsPoints.get(row.ENA_UNIT);
    if (!point) { unmatchedUnits += 1; continue; }
    rotationColumns.forEach((column, dimIndex) => {
      const jsValue = Number(point[column] ?? 0) * signs[dimIndex];
      const rValue = Number(row[DIMS[dimIndex]]);
      pointDeltas.push(jsValue - rValue);
      pointPairs[dimIndex].r.push(rValue);
      pointPairs[dimIndex].j.push(jsValue);
    });
  }

  // --- Line weights (edge columns; rotation-invariant) ---
  const edgeNames = set.adjacencyKey.map((entry) => entry.name);
  const jsWeights = new Map(set.lineWeights.map((row) => {
    const label = [row.Condition, row.Group, row.Speaker].join("::");
    return [label, row];
  }));
  const weightDeltas = [];
  let missingEdgeColumns = [];
  for (const row of gWeights) {
    const jsRow = jsWeights.get(row.ENA_UNIT);
    if (!jsRow) continue;
    for (const name of edgeNames) {
      if (!(name in row)) { missingEdgeColumns.push(name); continue; }
      weightDeltas.push(Number(jsRow[name] ?? 0) - Number(row[name]));
    }
  }
  missingEdgeColumns = [...new Set(missingEdgeColumns)];

  // --- Condition mean networks (mean of line weights per condition) ---
  const byCondition = { AI: [], "Non-AI": [] };
  for (const row of set.lineWeights) {
    const bucket = byCondition[String(row.Condition)];
    if (bucket) bucket.push(row);
  }
  const networkDeltas = [];
  for (const row of gNetworks) {
    const name = row.edge;
    const meanOf = (bucket) => bucket.reduce((sum, r) => sum + Number(r[name] ?? 0), 0) / bucket.length;
    networkDeltas.push(meanOf(byCondition.AI) - Number(row.AI_mean));
    networkDeltas.push(meanOf(byCondition["Non-AI"]) - Number(row.NonAI_mean));
  }

  const variance = rotationColumns.map((column) => set.variance[column]);

  // --- Variance + goodness-of-fit vs full-precision R diagnostics ---
  const rDiagnostics = JSON.parse(readFileSync(join(here, "r-goldens-diagnostics.json"), "utf8"))[tp];
  const varianceDeltas = variance.map((value, index) => value - rDiagnostics.variance[index]);
  const jsCorrelations = enaCorrelations(set);
  const pearsonDeltas = rDiagnostics.pearson.map((value, index) => jsCorrelations[index].pearson - value);
  const spearmanDeltas = rDiagnostics.spearman.map((value, index) => jsCorrelations[index].spearman - value);

  return {
    maxAbsVarianceDelta: maxAbs(varianceDeltas),
    maxAbsPearsonDelta: maxAbs(pearsonDeltas),
    maxAbsSpearmanDelta: maxAbs(spearmanDeltas),
    pearson: jsCorrelations.map((entry) => Number(entry.pearson.toFixed(9))),
    spearman: jsCorrelations.map((entry) => Number(entry.spearman.toFixed(9))),
    tp,
    elapsedMs: Number(elapsedMs.toFixed(1)),
    units: set.unitLabels.length,
    codes: set.codes.length,
    edges: edgeNames.length,
    rotationColumns,
    signFlips: signs,
    variance: variance.map((v) => Number(v.toFixed(6))),
    unmatchedUnits,
    missingEdgeColumns,
    maxAbsNodeDelta: maxAbs(nodeDeltas),
    maxAbsPointDelta: maxAbs(pointDeltas),
    maxAbsLineWeightDelta: maxAbs(weightDeltas),
    maxAbsNetworkDelta: maxAbs(networkDeltas),
    pointCorrelations: pointPairs.map((pair) => Number(pearson(pair.r, pair.j).toFixed(12))),
    comparedNodeCells: nodeDeltas.length,
    comparedPointCells: pointDeltas.length,
    comparedWeightCells: weightDeltas.length,
    comparedNetworkCells: networkDeltas.length
  };
}

const results = ["tp1", "tp2", "tp3"].map(runOne);
for (const result of results) {
  console.log(JSON.stringify(result, null, 2));
}
writeFileSync(join(here, "jena-parity-results.json"), JSON.stringify(results, null, 2));
