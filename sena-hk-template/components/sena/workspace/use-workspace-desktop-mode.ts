"use client";

import { useEffect, useState } from "react";

export function useWorkspaceDesktopMode() {
  // Seeded from the real viewport on the first render, not corrected after
  // paint: the workspace is client-only (next/dynamic ssr:false), so `window`
  // exists here. Starting at `false` made desktop visitors render the mobile
  // branch and then swap, which React resolves by tearing the whole workspace
  // subtree down and rebuilding it (~21 ms and a transient mobile layout).
  // The `typeof window` guard keeps the hook safe if it is ever server-rendered.
  const [isDesktopMode, setIsDesktopMode] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches
  );

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    const syncDesktopMode = () => setIsDesktopMode(desktopQuery.matches);

    syncDesktopMode();
    desktopQuery.addEventListener("change", syncDesktopMode);
    return () => desktopQuery.removeEventListener("change", syncDesktopMode);
  }, []);

  return isDesktopMode;
}
