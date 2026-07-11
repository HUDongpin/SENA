"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";
import type {
  SenaDataset,
  SenaTemporalMode,
  SenaTemporalWindow
} from "@/lib/sena/types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type TemporalAnimationEffectsOptions = {
  dataset: SenaDataset;
  temporalMode: SenaTemporalMode;
  movingWindowSize: number;
  movingWindowStep: number;
  turnWindowRadius: number;
  pendingActiveWindow: SenaTemporalWindow | null;
  temporalWindows: SenaTemporalWindow[];
  isAnimating: boolean;
  animationMs: number;
  setActiveWindowIndex: StateSetter<number>;
  setIsAnimating: StateSetter<boolean>;
  setPendingActiveWindow: StateSetter<SenaTemporalWindow | null>;
};

export function useTemporalAnimationEffects({
  dataset,
  temporalMode,
  movingWindowSize,
  movingWindowStep,
  turnWindowRadius,
  pendingActiveWindow,
  temporalWindows,
  isAnimating,
  animationMs,
  setActiveWindowIndex,
  setIsAnimating,
  setPendingActiveWindow
}: TemporalAnimationEffectsOptions) {
  useEffect(() => {
    setActiveWindowIndex(0);
    setIsAnimating(false);
  }, [dataset, temporalMode, movingWindowSize, movingWindowStep, turnWindowRadius, setActiveWindowIndex, setIsAnimating]);

  useEffect(() => {
    if (!pendingActiveWindow) return;
    const restoredIndex = temporalWindows.findIndex((window) => (
      window.id === pendingActiveWindow.id ||
      (
        window.label === pendingActiveWindow.label &&
        window.startTurn === pendingActiveWindow.startTurn &&
        window.endTurn === pendingActiveWindow.endTurn
      )
    ));
    setActiveWindowIndex(restoredIndex >= 0 ? restoredIndex : 0);
    setPendingActiveWindow(null);
  }, [pendingActiveWindow, setActiveWindowIndex, setPendingActiveWindow, temporalWindows]);

  useEffect(() => {
    if (temporalWindows.length <= 1) setIsAnimating(false);
    setActiveWindowIndex((current) => Math.min(current, Math.max(0, temporalWindows.length - 1)));
  }, [setActiveWindowIndex, setIsAnimating, temporalWindows.length]);

  useEffect(() => {
    if (!isAnimating || temporalWindows.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setActiveWindowIndex((current) => (current + 1) % temporalWindows.length);
    }, animationMs);
    return () => window.clearInterval(interval);
  }, [animationMs, isAnimating, setActiveWindowIndex, temporalWindows.length]);
}
