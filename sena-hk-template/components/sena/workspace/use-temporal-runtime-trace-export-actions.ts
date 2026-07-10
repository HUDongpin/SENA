"use client";

import { useCallback } from "react";
import type {
  SenaBuildOptions,
  SenaDataset,
  SenaModel
} from "@/lib/sena/types";
import { buildSenaTemporalRuntimeTrace } from "./analysis-runtime";

type DownloadText = (filename: string, text: string, mimeType: string) => void;

export type TemporalRuntimeTraceExportActionsOptions = {
  buildOptions: Partial<SenaBuildOptions>;
  dataset: SenaDataset;
  downloadText: DownloadText;
  timelineModel: SenaModel;
};

export function useTemporalRuntimeTraceExportActions({
  buildOptions,
  dataset,
  downloadText,
  timelineModel
}: TemporalRuntimeTraceExportActionsOptions) {
  const exportTemporalRuntimeTraceJson = useCallback(() => {
    const generatedAt = new Date().toISOString();
    downloadText(
      "sena-temporal-runtime-trace.json",
      JSON.stringify(
        buildSenaTemporalRuntimeTrace(dataset, buildOptions, { generatedAt, timelineModel }),
        null,
        2
      ),
      "application/json"
    );
  }, [buildOptions, dataset, downloadText, timelineModel]);

  return {
    exportTemporalRuntimeTraceJson
  };
}
