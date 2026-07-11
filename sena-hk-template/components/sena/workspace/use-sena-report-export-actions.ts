"use client";

import { useCallback } from "react";
import {
  buildSenaEnaReportArtifact,
  buildSenaMetricProvenanceArtifact,
  buildSenaPairContributionReportArtifact,
  buildSenaSnaReportArtifact,
  type SenaModel,
  type SenaTemporalWindow
} from "./analysis-runtime";

type DownloadText = (filename: string, text: string, mimeType: string) => void;

export type SenaReportExportActionsOptions = {
  activeTemporalWindow: SenaTemporalWindow | null | undefined;
  downloadText: DownloadText;
  model: SenaModel;
  reportTitle: string;
};

export function useSenaReportExportActions({
  activeTemporalWindow,
  downloadText,
  model,
  reportTitle
}: SenaReportExportActionsOptions) {
  const exportPairReport = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-person-code-pair-g-report.json",
      JSON.stringify(
        buildSenaPairContributionReportArtifact(model, {
          title: `${reportTitle} Person-Code-Pair G Report`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, downloadText, model, reportTitle]);

  const exportSocialReport = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-sna-report.json",
      JSON.stringify(
        buildSenaSnaReportArtifact(model, {
          title: `${reportTitle} jSNA Social Report`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, downloadText, model, reportTitle]);

  const exportMetricProvenance = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-metric-provenance.json",
      JSON.stringify(
        buildSenaMetricProvenanceArtifact(model, {
          title: `${reportTitle} Metric Provenance`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, downloadText, model, reportTitle]);

  const exportEnaReport = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-ena-report.json",
      JSON.stringify(
        buildSenaEnaReportArtifact(model, {
          title: `${reportTitle} jENA Epistemic Report`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, downloadText, model, reportTitle]);

  return {
    exportEnaReport,
    exportMetricProvenance,
    exportPairReport,
    exportSocialReport
  };
}
