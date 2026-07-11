"use client";

import { type ChangeEvent, useCallback } from "react";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import type { SenaEnterpriseImportResult } from "@/lib/sena/import-adapters";
import type { SenaLocalReliabilityImportResult } from "@/lib/sena/reliability-adapters";
import type {
  SenaDataset,
  SenaDemoVerification,
  SenaProjectSnapshot
} from "@/lib/sena/types";
import type { LocalEnterpriseValidationResult } from "./enterprise-contracts";
import {
  importSenaDemoVerification,
  importSenaJsonContract,
  importSenaProjectSnapshot,
  importSenaReviewPacket,
  inferSenaColumnMapping,
  inferSenaTableFromName,
  parseSenaCsv,
  senaDatasetMetadataFromJson
} from "./analysis-runtime";
import type { UploadedSenaTable } from "./uploaded-table-mapper";
import type { WorkspaceRailMode } from "./workspace-shell-panels";
import type { DemoManualReviewState } from "./use-demo-verification-manual-review-actions";

export type ContractUploadActionOptions = {
  applyDemoVerificationManualReviews: (verification: SenaDemoVerification, fileName: string) => void;
  commitUploadedTables: (tables: UploadedSenaTable[]) => void;
  importFilesViaEnterpriseApi: (files: File[]) => Promise<void>;
  restoreProjectSnapshot: (snapshot: SenaProjectSnapshot, fileName: string) => void;
  setDataset: (dataset: SenaDataset) => void;
  setDemoManualReviews: (manualReviews: DemoManualReviewState) => void;
  setImportError: (message: string | null) => void;
  setImportMessage: (message: string) => void;
  setLocalEnterpriseImportResult: (result: SenaEnterpriseImportResult | null) => void;
  setLocalEnterpriseReliabilityResult: (result: SenaLocalReliabilityImportResult | null) => void;
  setLocalEnterpriseValidationResult: (result: LocalEnterpriseValidationResult | null) => void;
  setUploadedTables: (tables: UploadedSenaTable[]) => void;
  setWorkspaceRailMode: (mode: WorkspaceRailMode) => void;
  uploadedTables: UploadedSenaTable[];
};

export function useContractUploadAction({
  applyDemoVerificationManualReviews,
  commitUploadedTables,
  importFilesViaEnterpriseApi,
  restoreProjectSnapshot,
  setDataset,
  setDemoManualReviews,
  setImportError,
  setImportMessage,
  setLocalEnterpriseImportResult,
  setLocalEnterpriseReliabilityResult,
  setLocalEnterpriseValidationResult,
  setUploadedTables,
  setWorkspaceRailMode,
  uploadedTables
}: ContractUploadActionOptions) {
  const handleContractUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    setWorkspaceRailMode("sets");
    if (files.some((file) => !/\.(csv|json)$/i.test(file.name))) {
      await importFilesViaEnterpriseApi(files);
      input.value = "";
      return;
    }

    // Batches that include a standalone dataset-metadata JSON go through the
    // enterprise import adapters so five-CSV uploads can attach governance
    // metadata that plain CSV tables cannot carry.
    const jsonTexts = await Promise.all(files.map(async (file) => (
      file.name.toLowerCase().endsWith(".json") ? await file.text() : null
    )));
    if (jsonTexts.some((text) => text !== null && Boolean(senaDatasetMetadataFromJson(text)))) {
      await importFilesViaEnterpriseApi(files);
      input.value = "";
      return;
    }

    try {
      const nextTables: UploadedSenaTable[] = [];
      for (const file of files) {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).schemaVersion === SENA_SCHEMA_VERSIONS.projectSnapshot
          ) {
            restoreProjectSnapshot(importSenaProjectSnapshot(parsed), file.name);
            continue;
          }

          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).schemaVersion === SENA_SCHEMA_VERSIONS.reviewPacket
          ) {
            const packet = importSenaReviewPacket(parsed);
            restoreProjectSnapshot(packet.contents.projectSnapshot, file.name);
            setImportMessage(`${file.name}: review packet restored editable workspace state (${packet.reviewPacketAudit.status}; ${packet.summary.pilotReadinessStatus}).`);
            setImportError(null);
            continue;
          }

          if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).schemaVersion === SENA_SCHEMA_VERSIONS.demoVerification
          ) {
            applyDemoVerificationManualReviews(importSenaDemoVerification(parsed), file.name);
            continue;
          }

          const result = importSenaJsonContract(parsed);
          setDataset(result.dataset);
          setUploadedTables([]);
          setLocalEnterpriseImportResult(null);
          setLocalEnterpriseReliabilityResult(null);
          setLocalEnterpriseValidationResult(null);
          setDemoManualReviews({});
          setImportMessage(`${file.name}: JSON contract loaded.`);
          setImportError(null);
          continue;
        }

        const parsed = parseSenaCsv(text);
        const table = inferSenaTableFromName(file.name);
        nextTables.push({
          id: `${file.name}-${file.lastModified}-${nextTables.length}`,
          name: file.name,
          table,
          columns: parsed.columns,
          rows: parsed.rows,
          mapping: inferSenaColumnMapping(table, parsed.columns)
        });
      }

      if (nextTables.length > 0) {
        commitUploadedTables([...uploadedTables, ...nextTables]);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "SENA import failed.");
    } finally {
      input.value = "";
    }
  }, [
    applyDemoVerificationManualReviews,
    commitUploadedTables,
    importFilesViaEnterpriseApi,
    restoreProjectSnapshot,
    setDataset,
    setDemoManualReviews,
    setImportError,
    setImportMessage,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setUploadedTables,
    setWorkspaceRailMode,
    uploadedTables
  ]);

  return {
    handleContractUpload
  };
}
