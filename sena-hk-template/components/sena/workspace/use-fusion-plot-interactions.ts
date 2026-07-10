"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect
} from "react";
import {
  clampFusionPlotZoom,
  fusionPlotZoomStep
} from "./workspace-shell-panels";
import type { SenaLayer } from "./analysis-runtime";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type LayerVisibility = Record<SenaLayer, boolean>;

export type FusionPlotInteractionsOptions = {
  isFusionPlotMaximized: boolean;
  setIsFusionPlotMaximized: StateSetter<boolean>;
  setFusionPlotZoom: StateSetter<number>;
  setLayers: StateSetter<LayerVisibility>;
};

export function useFusionPlotInteractions({
  isFusionPlotMaximized,
  setIsFusionPlotMaximized,
  setFusionPlotZoom,
  setLayers
}: FusionPlotInteractionsOptions) {
  useEffect(() => {
    if (!isFusionPlotMaximized) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFusionPlotMaximized(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFusionPlotMaximized, setIsFusionPlotMaximized]);

  useEffect(() => {
    if (!isFusionPlotMaximized) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFusionPlotMaximized]);

  const maximizeFusionPlot = useCallback(() => {
    setIsFusionPlotMaximized(true);
  }, [setIsFusionPlotMaximized]);

  const closeFusionPlotMaximized = useCallback(() => {
    setIsFusionPlotMaximized(false);
  }, [setIsFusionPlotMaximized]);

  const zoomInFusionPlot = useCallback(() => {
    setFusionPlotZoom((current) => clampFusionPlotZoom(current + fusionPlotZoomStep));
  }, [setFusionPlotZoom]);

  const zoomOutFusionPlot = useCallback(() => {
    setFusionPlotZoom((current) => clampFusionPlotZoom(current - fusionPlotZoomStep));
  }, [setFusionPlotZoom]);

  const resetFusionPlotZoom = useCallback(() => {
    setFusionPlotZoom(1);
  }, [setFusionPlotZoom]);

  const toggleLayer = useCallback((layer: SenaLayer) => {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }, [setLayers]);

  return {
    closeFusionPlotMaximized,
    maximizeFusionPlot,
    resetFusionPlotZoom,
    toggleLayer,
    zoomInFusionPlot,
    zoomOutFusionPlot
  };
}
