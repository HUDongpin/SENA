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

  it("defaults the workspace to the declared Joint embedding with a provenance strip", () => {
    const source = readFileSync(join(process.cwd(), "components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts"), "utf8");
    const staticConfigSource = readFileSync(join(process.cwd(), "components/sena/workspace/workspace-static-config.tsx"), "utf8");
    const centralPlotSource = readFileSync(join(process.cwd(), "components/sena/workspace/workspace-central-plot-deck.tsx"), "utf8");
    const rightColumnSource = readFileSync(join(process.cwd(), "components/sena/workspace/workspace-right-inspector-column.tsx"), "utf8");
    const provenanceSource = readFileSync(join(process.cwd(), "components/sena/workspace/runtime-provenance-panels.tsx"), "utf8");

    expect(source).toContain('useState<SenaLayoutMode>("joint")');
    expect(`${centralPlotSource}\n${rightColumnSource}`).toContain("<JointEmbeddingProvenanceStrip");
    expect(provenanceSource).toContain('data-testid="joint-embedding-provenance-strip"');
    expect(provenanceSource).toContain("MDS + Schoenberg");
    expect(provenanceSource).toContain("Laplacian eigenmaps");
    expect(provenanceSource).toContain("joint-embedding-operator-laplacian-eigenmaps");
    expect(provenanceSource).toContain("metric exact");
    expect(staticConfigSource).toContain("Exploratory overlay");
  });
});
