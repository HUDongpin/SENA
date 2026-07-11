"use client";

import { useEffect, useMemo, useState } from "react";
import type { SenaModel } from "./analysis-runtime";

export type FusionCanvasSelectionStateOptions = {
  model: SenaModel;
};

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
    setSelectedId(id);
    if (!graphNodeIds.has(id)) return;
    setRevealedNodeLabelIds((current) => current.includes(id) ? current : [...current, id]);
  }

  return {
    handleCanvasSelect,
    revealedNodeLabelIds,
    selected,
    selectedId,
    setSelectedId
  };
}
