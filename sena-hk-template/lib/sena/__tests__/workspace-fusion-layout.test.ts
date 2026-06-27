import { describe, expect, it } from "vitest";
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
});
