"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import { lessonStudySampleUrl } from "@/lib/sena/pilot-assets";
import type { SenaEnterpriseImportResult } from "@/lib/sena/import-adapters";
import type { SenaLocalReliabilityImportResult } from "@/lib/sena/reliability-adapters";
import type { SenaDataset } from "@/lib/sena/types";
import { requestSenaWorkspaceJson } from "./api-client";
import type {
  LocalEnterpriseValidationResult
} from "./enterprise-contracts";
import {
  buildSenaDatasetFromTables,
  createEmptySenaDataset,
  importSenaJsonContract,
  inferSenaColumnMapping,
  type SenaImportTable,
  type SenaReportHumanReview
} from "./analysis-runtime";
import type { UploadedSenaTable } from "./uploaded-table-mapper";
import type { WorkspaceRailMode } from "./workspace-shell-panels";
import type { DemoManualReviewState } from "./use-demo-verification-manual-review-actions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type DownloadText = (filename: string, text: string, mimeType: string) => void;

export type DataImportMappedTableActionsOptions = {
  downloadText: DownloadText;
  uploadedTables: UploadedSenaTable[];
  setDataset: StateSetter<SenaDataset>;
  setUploadedTables: StateSetter<UploadedSenaTable[]>;
  setLocalEnterpriseImportResult: StateSetter<SenaEnterpriseImportResult | null>;
  setLocalEnterpriseReliabilityResult: StateSetter<SenaLocalReliabilityImportResult | null>;
  setLocalEnterpriseValidationResult: StateSetter<LocalEnterpriseValidationResult | null>;
  setDemoManualReviews: StateSetter<DemoManualReviewState>;
  setImportError: StateSetter<string | null>;
  setImportMessage: StateSetter<string>;
  setInterpretation: StateSetter<string>;
  setIsLoadingSample: StateSetter<boolean>;
  setLimitations: StateSetter<string>;
  setNextActions: StateSetter<string>;
  setReportTitle: StateSetter<string>;
  setReviewer: StateSetter<string>;
  setReviewStatus: StateSetter<SenaReportHumanReview["status"]>;
  setSelectedId: StateSetter<string>;
  setWorkspaceRailMode: StateSetter<WorkspaceRailMode>;
};

export function useDataImportMappedTableActions({
  downloadText,
  uploadedTables,
  setDataset,
  setUploadedTables,
  setLocalEnterpriseImportResult,
  setLocalEnterpriseReliabilityResult,
  setLocalEnterpriseValidationResult,
  setDemoManualReviews,
  setImportError,
  setImportMessage,
  setInterpretation,
  setIsLoadingSample,
  setLimitations,
  setNextActions,
  setReportTitle,
  setReviewer,
  setReviewStatus,
  setSelectedId,
  setWorkspaceRailMode
}: DataImportMappedTableActionsOptions) {
  const applyMappedTables = useCallback((tables: UploadedSenaTable[]) => {
    const result = buildSenaDatasetFromTables(tables);
    setDataset(result.dataset);
    setLocalEnterpriseImportResult(null);
    setLocalEnterpriseReliabilityResult(null);
    setLocalEnterpriseValidationResult(null);
    setDemoManualReviews({});
    setImportMessage(`${tables.length} mapped table${tables.length === 1 ? "" : "s"} loaded.`);
    setImportError(null);
  }, [
    setDataset,
    setDemoManualReviews,
    setImportError,
    setImportMessage,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult
  ]);

  const commitUploadedTables = useCallback((tables: UploadedSenaTable[]) => {
    setUploadedTables(tables);
    applyMappedTables(tables);
  }, [applyMappedTables, setUploadedTables]);

  const updateUploadedTable = useCallback((id: string, updater: (table: UploadedSenaTable) => UploadedSenaTable) => {
    commitUploadedTables(uploadedTables.map((table) => table.id === id ? updater(table) : table));
  }, [commitUploadedTables, uploadedTables]);

  const updateTableContract = useCallback((id: string, table: SenaImportTable) => {
    updateUploadedTable(id, (current) => ({
      ...current,
      table,
      mapping: inferSenaColumnMapping(table, current.columns)
    }));
  }, [updateUploadedTable]);

  const updateTableField = useCallback((id: string, field: string, column: string) => {
    updateUploadedTable(id, (current) => {
      const mapping = { ...current.mapping };
      if (column) mapping[field] = column;
      else delete mapping[field];
      return { ...current, mapping };
    });
  }, [updateUploadedTable]);

  const clearContract = useCallback(() => {
    setWorkspaceRailMode("sets");
    setDataset(createEmptySenaDataset());
    setUploadedTables([]);
    setLocalEnterpriseImportResult(null);
    setLocalEnterpriseReliabilityResult(null);
    setLocalEnterpriseValidationResult(null);
    setDemoManualReviews({});
    setImportMessage("No SENA contract loaded.");
    setImportError(null);
    setSelectedId("");
  }, [
    setDataset,
    setDemoManualReviews,
    setImportError,
    setImportMessage,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setSelectedId,
    setUploadedTables,
    setWorkspaceRailMode
  ]);

  const loadLessonStudySample = useCallback(async () => {
    setWorkspaceRailMode("sets");
    setIsLoadingSample(true);
    try {
      const sample = await requestSenaWorkspaceJson<unknown>(
        lessonStudySampleUrl,
        undefined,
        { errorMessage: "Could not load the lesson-study sample." }
      );
      const result = importSenaJsonContract(sample);
      setDataset(result.dataset);
      setUploadedTables([]);
      setLocalEnterpriseImportResult(null);
      setLocalEnterpriseReliabilityResult(null);
      setLocalEnterpriseValidationResult(null);
      setReportTitle("Lesson Study SENA Analysis Report");
      setReviewStatus("draft");
      setReviewer("");
      setInterpretation("");
      setLimitations("");
      setNextActions("");
      setDemoManualReviews({});
      setSelectedId("");
      setImportMessage("Lesson-study sample loaded from the research pilot package.");
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not load the lesson-study sample.");
    } finally {
      setIsLoadingSample(false);
    }
  }, [
    setDataset,
    setDemoManualReviews,
    setImportError,
    setImportMessage,
    setInterpretation,
    setIsLoadingSample,
    setLimitations,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setNextActions,
    setReportTitle,
    setReviewStatus,
    setReviewer,
    setSelectedId,
    setUploadedTables,
    setWorkspaceRailMode
  ]);

  const exportContractTemplate = useCallback(() => {
    downloadText(
      "sena-data-contract-template.json",
      JSON.stringify({ people: [], interactions: [], utterances: [], coded_segments: [], codebook: [] }, null, 2),
      "application/json"
    );
  }, [downloadText]);

  return {
    applyMappedTables,
    clearContract,
    commitUploadedTables,
    exportContractTemplate,
    loadLessonStudySample,
    updateTableContract,
    updateTableField
  };
}
