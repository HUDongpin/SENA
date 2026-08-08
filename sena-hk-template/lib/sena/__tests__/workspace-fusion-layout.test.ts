import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaLayoutMode } from "../types";
import {
  computeFusionLayout,
  fusionCanvasHeight,
  fusionCanvasWidth
} from "../../../components/sena/workspace/fusion-layout";

describe("SENA workspace fusion layout", () => {
  it("keeps Fusion Canvas node layout in a pure workspace module", () => {
    const model = buildSenaModel(lessonStudySenaContract);
    const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);
    // Every mode this module is responsible for — and only those. "plane-orbit"
    // is deliberately absent: the plane owns measured coordinates and the orbit
    // owns its ring math, so it never enters computeFusionLayout at all
    // (ADR 0009; pinned negatively by the next test).
    const modes: SenaLayoutMode[] = ["explanatory", "ena-space", "joint"];

    for (const mode of modes) {
      const nodes = computeFusionLayout(model, mode, enaManifest);

      expect(nodes).toHaveLength(model.nodes.length);
      expect(nodes.map((node) => node.id)).toEqual(model.nodes.map((node) => node.id));
      expect(nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
      expect(nodes.every((node) => node.x >= 0 && node.x <= fusionCanvasWidth)).toBe(true);
      expect(nodes.every((node) => node.y >= 0 && node.y <= fusionCanvasHeight)).toBe(true);
    }
  });

  it("keeps Joint layout scale-to-fit instead of silently clamping simulated coordinates", () => {
    const source = readFileSync(join(process.cwd(), "components/sena/workspace/fusion-layout.ts"), "utf8");

    expect(source).toContain("scaleJointCoordinatesToFit");
    expect(source).not.toContain("Math.max(-1.35");
    expect(source).not.toContain("Math.min(1.35");
    expect(source).not.toContain("Math.max(-1.22");
    expect(source).not.toContain("Math.min(1.22");
  });

  it("uses declared embedding coordinates for Joint layout instead of force simulation", () => {
    const model = buildSenaModel(lessonStudySenaContract);
    const nodes = computeFusionLayout(model, "joint");
    const source = readFileSync(join(process.cwd(), "components/sena/workspace/fusion-layout.ts"), "utf8");

    expect(model.operatorDiagnostics.embedding.mds.available).toBe(true);
    expect(model.operatorDiagnostics.embedding.mds.coordinates).toHaveLength(model.nodes.length);
    expect(model.operatorDiagnostics.embedding.laplacianEigenmaps.available).toBe(true);
    expect(computeFusionLayout(model, "joint", undefined, "laplacian-eigenmaps")).toHaveLength(model.nodes.length);
    expect(nodes).toHaveLength(model.nodes.length);
    expect(nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    expect(source).toContain("operatorDiagnostics.embedding.mds.coordinates");
    expect(source).toContain("operatorDiagnostics.embedding.laplacianEigenmaps.coordinates");
    expect(source).not.toContain("for (let iteration = 0; iteration < 130");
    expect(source).not.toContain("Exploratory force layout over A_fusion weights");
  });

  it("keeps the plane-orbit layout out of computeFusionLayout entirely", () => {
    // The negative half of the mode enumeration above. If a later change gives
    // fusion-layout.ts a "plane-orbit" branch, the Fusion default silently gains
    // a second set of node positions — explanatory coordinates competing with
    // the plane's measured ones — which is exactly what ADR 0009 forbids.
    const source = readFileSync(join(process.cwd(), "components/sena/workspace/fusion-layout.ts"), "utf8");

    expect(source).not.toContain("plane-orbit");
    expect(source).not.toContain("orbit-layout");
    expect(source).toContain('if (layout === "ena-space")');
  });

  it("defaults the workspace to the canonical plane with its social orbit", () => {
    const source = readFileSync(join(process.cwd(), "components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts"), "utf8");
    const staticConfigSource = readFileSync(join(process.cwd(), "components/sena/workspace/workspace-static-config.tsx"), "utf8");
    const centralFusionSource = readFileSync(join(process.cwd(), "components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx"), "utf8");

    // ADR 0009 D5. The default is the one layout whose node positions are
    // measurements; the A1 layouts stay one click away, labeled diagnostic.
    expect(source).toContain('useState<SenaLayoutMode>("plane-orbit")');
    expect(source).not.toContain('useState<SenaLayoutMode>("joint")');
    expect(centralFusionSource).toContain('layout === "plane-orbit"');
    expect(centralFusionSource).toContain("<FusionPlaneOrbitPlot");

    // Button order leads with the default, and the demotion is stated in the
    // control itself rather than only in the ADR.
    expect(staticConfigSource).toContain('{ value: "plane-orbit", label: "Fusion plane + orbit"');
    expect(staticConfigSource.indexOf('value: "plane-orbit"')).toBeLessThan(
      staticConfigSource.indexOf('value: "explanatory"')
    );
    expect(staticConfigSource).toContain("Canonical ENA plane with social orbit");
    expect(staticConfigSource).toContain("Diagnostic — readable non-metric three-layer layout");
    expect(staticConfigSource).toContain("Diagnostic — selectable A_fusion embedding operators");
    expect(staticConfigSource).toContain("Exploratory overlay");
    // ENA Space is not a diagnostic layout; its note stays as it was.
    expect(staticConfigSource).toContain("jENA projected points and code positions");
  });

  it("keeps the declared Joint embedding and its provenance strip for the joint layout", () => {
    const centralFusionSource = readFileSync(join(process.cwd(), "components/sena/workspace/workspace-central-plot-deck-fusion-panel.tsx"), "utf8");
    const overlaySource = readFileSync(join(process.cwd(), "components/sena/workspace/fusion-plot-overlay.tsx"), "utf8");
    const provenanceSource = readFileSync(join(process.cwd(), "components/sena/workspace/runtime-provenance-panels.tsx"), "utf8");

    // The strip is joint's, and the default flip must not have widened it: both
    // surfaces still gate on the layout rather than on "not the new default".
    expect(centralFusionSource).toContain('layout === "joint" && (');
    expect(centralFusionSource).toContain("<JointEmbeddingProvenanceStrip");
    expect(overlaySource).toContain('layout === "joint" && (');
    expect(overlaySource).toContain("<JointEmbeddingProvenanceStrip");
    expect(provenanceSource).toContain('data-testid="joint-embedding-provenance-strip"');
    expect(provenanceSource).toContain("MDS + Schoenberg");
    expect(provenanceSource).toContain("Laplacian eigenmaps");
    expect(provenanceSource).toContain("joint-embedding-operator-laplacian-eigenmaps");
    expect(provenanceSource).toContain("metric exact");
  });
});
