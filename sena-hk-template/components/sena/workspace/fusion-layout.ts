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
const jointLayoutMargin = { x: 86, y: 72 };
export type SenaJointEmbeddingOperator = "mds-schoenberg" | "laplacian-eigenmaps" | "commute-time";

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

function scaleJointCoordinatesToFit(coords: Array<{ x: number; y: number }>) {
  if (coords.length === 0) return [];

  const finiteCoords = coords.map((coordinate) => ({
    x: Number.isFinite(coordinate.x) ? coordinate.x : 0,
    y: Number.isFinite(coordinate.y) ? coordinate.y : 0
  }));
  const minX = Math.min(...finiteCoords.map((coordinate) => coordinate.x));
  const maxX = Math.max(...finiteCoords.map((coordinate) => coordinate.x));
  const minY = Math.min(...finiteCoords.map((coordinate) => coordinate.y));
  const maxY = Math.max(...finiteCoords.map((coordinate) => coordinate.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const availableWidth = fusionCanvasWidth - jointLayoutMargin.x * 2;
  const availableHeight = fusionCanvasHeight - jointLayoutMargin.y * 2;
  const scaleX = spanX > 1e-9 ? availableWidth / spanX : availableWidth;
  const scaleY = spanY > 1e-9 ? availableHeight / spanY : availableHeight;
  const scale = Math.min(scaleX, scaleY, 285);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return finiteCoords.map((coordinate) => ({
    x: fusionCanvasCenter.x + (coordinate.x - midX) * scale,
    y: fusionCanvasCenter.y + (coordinate.y - midY) * scale
  }));
}

function formalEmbeddingCoordinates(model: SenaModel, operator: SenaJointEmbeddingOperator) {
  if (operator === "laplacian-eigenmaps" && model.operatorDiagnostics.embedding.laplacianEigenmaps.available) {
    return model.operatorDiagnostics.embedding.laplacianEigenmaps.coordinates;
  }
  if (operator === "commute-time" && model.operatorDiagnostics.embedding.commuteTime.available) {
    return model.operatorDiagnostics.embedding.commuteTime.coordinates;
  }
  if (model.operatorDiagnostics.embedding.mds.available) {
    return model.operatorDiagnostics.embedding.mds.coordinates;
  }
  return null;
}

function jointLayout(model: SenaModel, operator: SenaJointEmbeddingOperator): PositionedSenaNode[] {
  const initial = explanatoryLayout(model);
  const coordinates = formalEmbeddingCoordinates(model, operator);
  if (!coordinates || coordinates.length !== initial.length) return initial;
  const coords = coordinates.map((row) => ({
    x: row[0] ?? 0,
    y: row[1] ?? 0
  }));

  const scaledCoords = scaleJointCoordinatesToFit(coords);
  return initial.map((node, index) => ({
    ...node,
    x: scaledCoords[index]?.x ?? fusionCanvasCenter.x,
    y: scaledCoords[index]?.y ?? fusionCanvasCenter.y
  }));
}

export function computeFusionLayout(
  model: SenaModel,
  layout: SenaLayoutMode,
  enaManifest?: SenaEnaManifest,
  jointEmbeddingOperator: SenaJointEmbeddingOperator = "mds-schoenberg"
): PositionedSenaNode[] {
  if (layout === "ena-space") return enaSpaceLayout(model, enaManifest);
  if (layout === "joint") return jointLayout(model, jointEmbeddingOperator);
  return explanatoryLayout(model);
}
