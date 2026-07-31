import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { Canvas } from "@/components/sena/workspace/fusion-canvas";
import { buildSenaEnaManifest } from "@/lib/sena/ena-manifest";
import { buildSenaEnaNetwork } from "@/lib/sena/ena-network";
import { buildSenaModel } from "@/lib/sena/model";
import { lessonStudySenaContract } from "@/lib/sena/pilot-assets";
import type { SenaLayoutMode } from "@/lib/sena/types";

const here = dirname(fileURLToPath(import.meta.url));

const model = buildSenaModel(lessonStudySenaContract);
const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);
const enaNetwork = buildSenaEnaNetwork(enaManifest);

const layers = { social: true, concept: true, bridge: true };

function render(layout: SenaLayoutMode) {
  return renderToStaticMarkup(
    <Canvas
      model={model}
      layout={layout}
      jointEmbeddingOperator="mds-schoenberg"
      enaManifest={enaManifest}
      layers={layers}
      threshold={0}
      selectedId=""
      revealedLabelIds={model.codes.map((code) => code.id)}
      onSelect={() => undefined}
    /> as never
  );
}

const report: Record<string, unknown> = {
  enaManifestStatus: enaManifest.status,
  enaNetwork: {
    status: enaNetwork.status,
    basis: enaNetwork.basis,
    dimensions: enaNetwork.dimensions,
    units: enaNetwork.units,
    edges: enaNetwork.edges.length,
    weights: enaNetwork.edges.map((edge) => `${edge.name}=${edge.weight.toFixed(4)}(w${edge.jenaStrokeWidth.toFixed(2)})`)
  }
};

for (const layout of ["explanatory", "ena-space", "joint"] as SenaLayoutMode[]) {
  const svg = render(layout);
  writeFileSync(join(here, `fusion-${layout}.svg`), svg);
  report[layout] = {
    jenaEnaLinks: (svg.match(/data-edge-basis="jena-mean-line-weights"/g) ?? []).length,
    senaWLinks: (svg.match(/data-visual-role="ena-solid-concept-link"/g) ?? []).length,
    axes: svg.includes('data-visual-role="ena-space-axes"'),
    conceptGuide: svg.includes('data-visual-role="concept-space-guide"'),
    hexNodes: (svg.match(/data-visual-role="sna-person-hex-node"/g) ?? []).length,
    conceptNodes: (svg.match(/data-visual-role="ena-concept-circle-node"/g) ?? []).length,
    halos: (svg.match(/data-visual-role="fusion-readable-link-halo"/g) ?? []).length
  };
}

console.log(JSON.stringify(report, null, 2));
