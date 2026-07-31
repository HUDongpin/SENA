"use client";

import { useEffect, useMemo, useState } from "react";
import type { SenaModel } from "./analysis-runtime";

export type FusionCanvasSelectionStateOptions = {
  model: SenaModel;
};

export type FusionCanvasSelectionSnapshot = {
  selectedId: string;
  revealedNodeLabelIds: string[];
};

/**
 * Click semantics for a Fusion Canvas node/edge, as a pure state transition so
 * the label toggle is auditable without a DOM.
 *
 * A node's on-canvas label shows while it is `selected || revealed`
 * (see fusion-canvas.tsx), so:
 * - Clicking an edge (not a graph node) selects it; edges carry no label.
 * - Clicking an unselected node selects it and pins its label on.
 * - Clicking the already-selected node toggles it off: selection clears and its
 *   revealed label is dropped, so the label disappears. This is the "one click
 *   shows, click again hides" rule.
 */
export function nextFusionCanvasSelection(
  current: FusionCanvasSelectionSnapshot,
  id: string,
  graphNodeIds: Set<string>
): FusionCanvasSelectionSnapshot {
  if (!graphNodeIds.has(id)) {
    return { selectedId: id, revealedNodeLabelIds: current.revealedNodeLabelIds };
  }
  if (current.selectedId === id) {
    return {
      selectedId: "",
      revealedNodeLabelIds: current.revealedNodeLabelIds.filter((revealedId) => revealedId !== id)
    };
  }
  return {
    selectedId: id,
    revealedNodeLabelIds: current.revealedNodeLabelIds.includes(id)
      ? current.revealedNodeLabelIds
      : [...current.revealedNodeLabelIds, id]
  };
}

export function useFusionCanvasSelectionState({
  model
}: FusionCanvasSelectionStateOptions) {
  const [selectedId, setSelectedId] = useState("");
  const selected = selectedId ? model.edges.find((edge) => edge.id === selectedId) ??
      model.nodes.find((node) => node.id === selectedId)
    : undefined;
  const graphNodeIds = useMemo(() => new Set(model.nodes.map((node) => node.id)), [model.nodes]);
  const [revealedNodeLabelIds, setRevealedNodeLabelIds] = useState<string[]>([]);

  useEffect(() => {
    setRevealedNodeLabelIds((current) => {
      const next = current.filter((id) => graphNodeIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [graphNodeIds]);

  useEffect(() => {
    if (selectedId && !selected) setSelectedId("");
  }, [selected, selectedId]);

  function handleCanvasSelect(id: string) {
    const next = nextFusionCanvasSelection({ selectedId, revealedNodeLabelIds }, id, graphNodeIds);
    setSelectedId(next.selectedId);
    setRevealedNodeLabelIds(next.revealedNodeLabelIds);
  }

  return {
    handleCanvasSelect,
    revealedNodeLabelIds,
    selected,
    selectedId,
    setSelectedId
  };
}
