"use client";

import { useEffect, useState } from "react";

export function useWorkspaceDesktopMode() {
  const [isDesktopMode, setIsDesktopMode] = useState(false);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    const syncDesktopMode = () => setIsDesktopMode(desktopQuery.matches);

    syncDesktopMode();
    desktopQuery.addEventListener("change", syncDesktopMode);
    return () => desktopQuery.removeEventListener("change", syncDesktopMode);
  }, []);

  return isDesktopMode;
}
