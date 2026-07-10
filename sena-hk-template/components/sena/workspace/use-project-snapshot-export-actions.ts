"use client";

import { useCallback } from "react";
import type { SenaProjectSnapshot } from "./analysis-runtime";

type DownloadText = (filename: string, text: string, mimeType: string) => void;
type BuildCurrentProjectSnapshot = (generatedAt?: string) => SenaProjectSnapshot;

export type ProjectSnapshotExportActionsOptions = {
  buildCurrentProjectSnapshot: BuildCurrentProjectSnapshot;
  downloadText: DownloadText;
};

export function useProjectSnapshotExportActions({
  buildCurrentProjectSnapshot,
  downloadText
}: ProjectSnapshotExportActionsOptions) {
  const exportProjectSnapshot = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-project-snapshot.json",
      JSON.stringify(buildCurrentProjectSnapshot(generatedAt), null, 2),
      "application/json"
    );
  }, [buildCurrentProjectSnapshot, downloadText]);

  return {
    exportProjectSnapshot
  };
}
