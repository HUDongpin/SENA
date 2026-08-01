// Re-runs the assertions in lib/sena/__tests__/workspace-fusion-layout.test.ts
// plus the ENA-space parity invariants, without vitest.
import { buildSenaEnaManifest } from "@/lib/sena/ena-manifest";
import { buildSenaEnaNetwork } from "@/lib/sena/ena-network";
import { buildSenaEnaSpaceCoordinateMap } from "@/lib/sena/layout";
import { buildSenaModel } from "@/lib/sena/model";
import { lessonStudySenaContract } from "@/lib/sena/pilot-assets";
import type { SenaLayoutMode } from "@/lib/sena/types";
import {
  computeFusionLayout,
  fusionCanvasCenter,
  fusionCanvasHeight,
  fusionCanvasWidth
} from "@/components/sena/workspace/fusion-layout";

const model = buildSenaModel(lessonStudySenaContract);
const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);

let failures = 0;
let checks = 0;
function check(label: string, condition: boolean) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

for (const mode of ["explanatory", "ena-space", "joint"] as SenaLayoutMode[]) {
  const nodes = computeFusionLayout(model, mode, enaManifest);
  check(`${mode}: node count`, nodes.length === model.nodes.length);
  check(`${mode}: id order`, nodes.every((node, index) => node.id === model.nodes[index].id));
  check(`${mode}: finite`, nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  check(`${mode}: within canvas`, nodes.every((node) =>
    node.x >= 0 && node.x <= fusionCanvasWidth && node.y >= 0 && node.y <= fusionCanvasHeight));
}

// --- ENA-space parity invariants --------------------------------------------
const coordinates = buildSenaEnaSpaceCoordinateMap(enaManifest, model.people, model.codes, {
  width: fusionCanvasWidth,
  height: fusionCanvasHeight,
  marginX: 92,
  marginY: 78
});
check("ena coordinates computed", coordinates.status === "computed");
check("ena coordinates from jena-js", coordinates.source === "jena-js");

const entries = Object.values(coordinates.coordinates);
// Origin-centred: a node at raw (0,0) must land on the canvas centre, and the
// projection must stay isotropic — one scale for both axes.
const scalesX = entries.filter((e) => Math.abs(e.rawX) > 1e-9).map((e) => (e.x - fusionCanvasCenter.x) / e.rawX);
const scalesY = entries.filter((e) => Math.abs(e.rawY) > 1e-9).map((e) => (fusionCanvasCenter.y - e.y) / e.rawY);
const allScales = [...scalesX, ...scalesY];
const scaleSpread = Math.max(...allScales) - Math.min(...allScales);
check("isotropic single scale", scaleSpread < 1e-9);
check("positive scale", allScales.every((scale) => scale > 0));

// Sign of every raw coordinate must survive the projection, i.e. quadrants read.
check("quadrants preserved", entries.every((e) =>
  Math.sign(e.rawX) === Math.sign(e.x - fusionCanvasCenter.x) || Math.abs(e.rawX) < 1e-12));

const network = buildSenaEnaNetwork(enaManifest);
check("ena network computed", network.status === "computed");
check("ena network basis", network.basis === "mean-line-weights");
check("ena network has dimensions", network.dimensions?.length === 2);
check("ena edge weights positive", network.edges.every((edge) => Number.isFinite(edge.weight)));
// Width must be monotone in |weight| — the property SENA's old layer-relative
// min–max scale did not guarantee across plots.
const sorted = [...network.edges].sort((a, b) => Math.abs(a.weight) - Math.abs(b.weight));
check("stroke width monotone in |w|", sorted.every((edge, index) =>
  index === 0 || edge.jenaStrokeWidth >= sorted[index - 1].jenaStrokeWidth - 1e-12));

console.log(`${checks - failures}/${checks} layout + ENA-network invariants held`);
console.log(`scale=${allScales[0]?.toFixed(4)} edges=${network.edges.length} units=${network.units} dims=${network.dimensions?.join(",")}`);
process.exit(failures === 0 ? 0 : 1);
