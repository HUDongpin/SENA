"use client";

import { useCallback } from "react";
import type {
  SenaEnaManifest,
  SenaFusionMathAudit,
  SenaRuntimeConsistencyAudit,
  SenaSnaManifest
} from "./analysis-runtime";

type DownloadText = (filename: string, text: string, mimeType: string) => void;

export type RuntimeManifestExportActionsOptions = {
  downloadText: DownloadText;
  enaManifest: SenaEnaManifest;
  fusionMathAudit: SenaFusionMathAudit;
  runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
  snaManifest: SenaSnaManifest;
};

export function useRuntimeManifestExportActions({
  downloadText,
  enaManifest,
  fusionMathAudit,
  runtimeConsistencyAudit,
  snaManifest
}: RuntimeManifestExportActionsOptions) {
  const exportEnaManifestJson = useCallback(() => {
    downloadText(
      "sena-jena-manifest.json",
      JSON.stringify(enaManifest, null, 2),
      "application/json"
    );
  }, [downloadText, enaManifest]);

  const exportSnaManifestJson = useCallback(() => {
    downloadText(
      "sena-jsna-manifest.json",
      JSON.stringify(snaManifest, null, 2),
      "application/json"
    );
  }, [downloadText, snaManifest]);

  const exportRuntimeConsistencyAuditJson = useCallback(() => {
    downloadText(
      "sena-runtime-consistency-audit.json",
      JSON.stringify(runtimeConsistencyAudit, null, 2),
      "application/json"
    );
  }, [downloadText, runtimeConsistencyAudit]);

  const exportFusionMathAuditJson = useCallback(() => {
    downloadText(
      "sena-fusion-math-audit.json",
      JSON.stringify(fusionMathAudit, null, 2),
      "application/json"
    );
  }, [downloadText, fusionMathAudit]);

  return {
    exportEnaManifestJson,
    exportFusionMathAuditJson,
    exportRuntimeConsistencyAuditJson,
    exportSnaManifestJson
  };
}
