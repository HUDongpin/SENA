"use client";

import { useCallback } from "react";
import {
  buildSenaMethodProtocol,
  buildSenaVisualGrammarArtifact,
  type SenaModel,
  type SenaTemporalWindow
} from "./analysis-runtime";

type DownloadText = (filename: string, text: string, mimeType: string) => void;

export type MethodArtifactExportActionsOptions = {
  activeTemporalWindow: SenaTemporalWindow | null | undefined;
  downloadText: DownloadText;
  model: SenaModel;
  reportTitle: string;
};

export function useMethodArtifactExportActions({
  activeTemporalWindow,
  downloadText,
  model,
  reportTitle
}: MethodArtifactExportActionsOptions) {
  const exportMethodProtocolJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-method-protocol.json",
      JSON.stringify(
        buildSenaMethodProtocol(model, {
          title: `${reportTitle} Method Protocol`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, downloadText, model, reportTitle]);

  const exportVisualGrammarJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-visual-grammar.json",
      JSON.stringify(
        buildSenaVisualGrammarArtifact({
          title: `${reportTitle} Visual Grammar`,
          generatedAt,
          activeTemporalWindow: activeTemporalWindow ?? null
        }),
        null,
        2
      ),
      "application/json"
    );
  }, [activeTemporalWindow, downloadText, reportTitle]);

  return {
    exportMethodProtocolJson,
    exportVisualGrammarJson
  };
}
