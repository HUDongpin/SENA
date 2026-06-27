import { buildSenaEnaSpaceCoordinateMap } from "../../../lib/sena/layout";
import type { SenaEnaManifest, SenaLayoutMode, SenaModel, SenaNode } from "../../../lib/sena/types";

export type PositionedSenaNode = SenaNode & {
  x: number;
  y: number;
};

export const fusionCanvasWidth = 900;
export const fusionCanvasHeight = 620;
export const fusionCanvasCenter = { x: fusionCanvasWidth / 2, y: fusionCanvasHeight / 2 };
export const fusionConceptGuideRadius = 184;

function socialNodePositions(people: SenaModel["people"]) {
  const positions = new Map<string, { x: number; y: number }>();
  const radiusX = 335;
  const radiusY = 235;

  people.forEach((person, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / people.length;
    positions.set(person.id, {
      x: fusionCanvasCenter.x + Math.cos(angle) * radiusX,
      y: fusionCanvasCenter.y + Math.sin(angle) * radiusY
    });
  });

  return positions;
}

function conceptAnchorPositions(model: SenaModel, radius = 148) {
  const positions = new Map<string, { x: number; y: number }>();
  model.codes.forEach((code, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / model.codes.length;
    positions.set(code.id, {
      x: fusionCanvasCenter.x + Math.cos(angle) * radius,
      y: fusionCanvasCenter.y + Math.sin(angle) * radius
    });
  });
  return positions;
}

function explanatoryLayout(model: SenaModel): PositionedSenaNode[] {
  const people = socialNodePositions(model.people);
  const concepts = conceptAnchorPositions(model, 150);

  return model.nodes.map((node) => {
    const position = node.kind === "person" ? people.get(node.id) : concepts.get(node.id);
    return { ...node, x: position?.x ?? fusionCanvasCenter.x, y: position?.y ?? fusionCanvasCenter.y };
  });
}

function enaSpaceLayout(model: SenaModel, enaManifest?: SenaEnaManifest): PositionedSenaNode[] {
  if (enaManifest) {
    const jenaCoordinates = buildSenaEnaSpaceCoordinateMap(enaManifest, model.people, model.codes, {
      width: fusionCanvasWidth,
      height: fusionCanvasHeight,
      marginX: 92,
      marginY: 78
    });
    if (jenaCoordinates.status === "computed") {
      const fallback = explanatoryLayout(model);
      return model.nodes.map((node, index) => {
        const position = jenaCoordinates.coordinates[node.id] ?? fallback[index];
        return { ...node, x: position?.x ?? fusionCanvasCenter.x, y: position?.y ?? fusionCanvasCenter.y };
      });
    }
  }

  const concepts = conceptAnchorPositions(model, 178);
  const codeOrder = model.codes.map((code) => code.id);

  return model.nodes.map((node, index) => {
    if (node.kind === "concept") {
      const position = concepts.get(node.id);
      return { ...node, x: position?.x ?? fusionCanvasCenter.x, y: position?.y ?? fusionCanvasCenter.y };
    }

    const rowIndex = model.people.findIndex((person) => person.id === node.id);
    const contribution = model.matrices.B.normalized[rowIndex] ?? [];
    const total = contribution.reduce((acc, value) => acc + value, 0);
    if (total === 0) return { ...node, x: fusionCanvasCenter.x - 270 + index * 20, y: fusionCanvasCenter.y + 210 };

    const position = codeOrder.reduce(
      (acc, codeId, codeIndex) => {
        const anchor = concepts.get(codeId) ?? fusionCanvasCenter;
        const weight = contribution[codeIndex] ?? 0;
        return {
          x: acc.x + anchor.x * weight,
          y: acc.y + anchor.y * weight
        };
      },
      { x: 0, y: 0 }
    );

    const offset = (rowIndex - model.people.length / 2) * 12;
    return {
      ...node,
      x: fusionCanvasCenter.x + (position.x / total - fusionCanvasCenter.x) * 1.28 + offset,
      y: fusionCanvasCenter.y + (position.y / total - fusionCanvasCenter.y) * 1.28 - offset * 0.5
    };
  });
}

// Deterministic force layout over A_fusion weights; this is a visual embedding, not an inferential distance model.
function jointLayout(model: SenaModel): PositionedSenaNode[] {
  const initial = explanatoryLayout(model);
  const coords = initial.map((node) => ({
    x: (node.x - fusionCanvasCenter.x) / 310,
    y: (node.y - fusionCanvasCenter.y) / 245
  }));
  const weights = model.matrices.fusion.values;

  for (let iteration = 0; iteration < 130; iteration += 1) {
    const forces = coords.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < coords.length; i += 1) {
      for (let j = i + 1; j < coords.length; j += 1) {
        const dx = coords[j].x - coords[i].x;
        const dy = coords[j].y - coords[i].y;
        const distance = Math.max(0.08, Math.sqrt(dx * dx + dy * dy));
        const repulsion = 0.006 / (distance * distance);
        forces[i].x -= (dx / distance) * repulsion;
        forces[i].y -= (dy / distance) * repulsion;
        forces[j].x += (dx / distance) * repulsion;
        forces[j].y += (dy / distance) * repulsion;

        const attraction = Math.max(weights[i]?.[j] ?? 0, weights[j]?.[i] ?? 0);
        if (attraction > 0) {
          const target = Math.max(0.28, 1.1 - attraction * 0.55);
          const pull = (distance - target) * 0.018 * attraction;
          forces[i].x += (dx / distance) * pull;
          forces[i].y += (dy / distance) * pull;
          forces[j].x -= (dx / distance) * pull;
          forces[j].y -= (dy / distance) * pull;
        }
      }
    }

    for (let i = 0; i < coords.length; i += 1) {
      coords[i].x = Math.max(-1.35, Math.min(1.35, coords[i].x + forces[i].x));
      coords[i].y = Math.max(-1.22, Math.min(1.22, coords[i].y + forces[i].y));
    }
  }

  return initial.map((node, index) => ({
    ...node,
    x: fusionCanvasCenter.x + coords[index].x * 285,
    y: fusionCanvasCenter.y + coords[index].y * 230
  }));
}

export function computeFusionLayout(model: SenaModel, layout: SenaLayoutMode, enaManifest?: SenaEnaManifest): PositionedSenaNode[] {
  if (layout === "ena-space") return enaSpaceLayout(model, enaManifest);
  if (layout === "joint") return jointLayout(model);
  return explanatoryLayout(model);
}
