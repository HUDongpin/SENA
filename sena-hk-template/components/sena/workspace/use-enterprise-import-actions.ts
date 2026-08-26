"use client";

import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { SenaEnterpriseImportResult } from "@/lib/sena/import-adapters";
import type { SenaLocalReliabilityImportResult } from "@/lib/sena/reliability-adapters";
import type {
  SenaDataset,
  SenaDemoVerificationCheck,
  SenaProjectSnapshot
} from "@/lib/sena/types";
import { importEnterpriseFilesAction } from "./enterprise-actions";
import type {
  EnterpriseAnalysisRun,
  EnterpriseImportRun,
  EnterpriseProjectSummary,
  LocalEnterpriseValidationResult
} from "./enterprise-contracts";
import type { UploadedSenaTable } from "./uploaded-table-mapper";
import type { WorkspaceRailMode } from "./workspace-shell-panels";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type DemoManualReviewState = Record<string, SenaDemoVerificationCheck["manualReview"]>;

// Import warnings belong in the durable warnings panel, not the rose error plate.
// The cleaning manifest carries only counts, so dataset.warnings is the one channel
// that keeps the warning text after the next workspace interaction.
//
// Merge as a multiset, not a set: repeated warning lines are individually meaningful
// (uniqueBy in lib/sena/import.ts emits one identical `Duplicate person id "P1" was
// ignored.` per extra occurrence), so deduplicating would under-report against the
// warning count shown elsewhere. Appending only the surplus occurrences keeps this
// idempotent, so re-applying it — or applying it after the adapter already folded the
// same list into dataset.warnings — cannot grow the array.
function withImportWarnings(dataset: SenaDataset, warnings: string[] | undefined): SenaDataset {
  if (!warnings?.length) return dataset;
  const existing = dataset.warnings ?? [];
  const unclaimed = new Map<string, number>();
  for (const warning of existing) unclaimed.set(warning, (unclaimed.get(warning) ?? 0) + 1);

  const additions = warnings.filter((warning) => {
    const available = unclaimed.get(warning) ?? 0;
    if (available === 0) return true;
    unclaimed.set(warning, available - 1);
    return false;
  });

  if (additions.length === 0) return dataset;
  return { ...dataset, warnings: [...existing, ...additions] };
}

export type EnterpriseImportActionsOptions = {
  enterpriseUserPresent: boolean;
  activeEnterpriseTeamId: string;
  enterpriseCsrfHeaders: () => Promise<Record<string, string>>;
  setEnterpriseBusy: StateSetter<boolean>;
  setWorkspaceRailMode: StateSetter<WorkspaceRailMode>;
  setDataset: StateSetter<SenaDataset>;
  setUploadedTables: StateSetter<UploadedSenaTable[]>;
  setDemoManualReviews: StateSetter<DemoManualReviewState>;
  setSelectedId: StateSetter<string>;
  setImportMessage: StateSetter<string>;
  setImportError: StateSetter<string | null>;
  setEnterpriseMessage: StateSetter<string>;
  setLocalEnterpriseImportResult: StateSetter<SenaEnterpriseImportResult | null>;
  setLocalEnterpriseReliabilityResult: StateSetter<SenaLocalReliabilityImportResult | null>;
  setLocalEnterpriseValidationResult: StateSetter<LocalEnterpriseValidationResult | null>;
  setActiveEnterpriseProjectId: StateSetter<string>;
  setEnterpriseImportRuns: StateSetter<EnterpriseImportRun[]>;
  setEnterpriseProjects: StateSetter<EnterpriseProjectSummary[]>;
  setEnterpriseAnalysisRuns: StateSetter<EnterpriseAnalysisRun[]>;
  restoreProjectSnapshot: (snapshot: SenaProjectSnapshot, fileName: string) => void | Promise<void>;
  refreshEnterpriseState: () => Promise<void>;
  refreshEnterpriseCollaboration: (projectId?: string) => Promise<void>;
  touchEnterprisePresence: (projectId?: string, options?: { quiet?: boolean }) => Promise<void>;
};

export function useEnterpriseImportActions({
  enterpriseUserPresent,
  activeEnterpriseTeamId,
  enterpriseCsrfHeaders,
  setEnterpriseBusy,
  setWorkspaceRailMode,
  setDataset,
  setUploadedTables,
  setDemoManualReviews,
  setSelectedId,
  setImportMessage,
  setImportError,
  setEnterpriseMessage,
  setLocalEnterpriseImportResult,
  setLocalEnterpriseReliabilityResult,
  setLocalEnterpriseValidationResult,
  setActiveEnterpriseProjectId,
  setEnterpriseImportRuns,
  setEnterpriseProjects,
  setEnterpriseAnalysisRuns,
  restoreProjectSnapshot,
  refreshEnterpriseState,
  refreshEnterpriseCollaboration,
  touchEnterprisePresence
}: EnterpriseImportActionsOptions) {
  const importFilesLocallyWithEnterpriseAdapters = useCallback(async (files: File[]) => {
    setEnterpriseBusy(true);
    setWorkspaceRailMode("sets");
    try {
      const { importSenaEnterpriseFiles } = await import("@/lib/sena/import-adapters");
      const result = await importSenaEnterpriseFiles(files);
      setDataset(withImportWarnings(result.dataset, result.warnings));
      setUploadedTables([]);
      setDemoManualReviews({});
      setSelectedId("");
      setLocalEnterpriseImportResult(result);
      setLocalEnterpriseReliabilityResult(null);
      setLocalEnterpriseValidationResult(null);
      const profiles = result.sources.map((source) => `${source.profile}:${source.rows}`).join(", ") || "adapter";
      const reviewChecks = result.cleaningManifest.checks.filter((check) => check.status === "review").length;
      setImportMessage(`Local enterprise import loaded ${files.length} file${files.length === 1 ? "" : "s"}: ${profiles}; cleaning manifest ${reviewChecks} review checks.`);
      setImportError(null);
      setEnterpriseMessage(`Local import completed without sign-in: ${result.dataset.people.length} people, ${result.dataset.utterances.length} utterances, ${result.warnings.length} warnings. Sign in to persist uploads, import runs, and saved projects.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Local enterprise import failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    setDataset,
    setDemoManualReviews,
    setEnterpriseBusy,
    setEnterpriseMessage,
    setImportError,
    setImportMessage,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setSelectedId,
    setUploadedTables,
    setWorkspaceRailMode
  ]);

  const importFilesViaEnterpriseApi = useCallback(async (files: File[]) => {
    if (!enterpriseUserPresent) {
      await importFilesLocallyWithEnterpriseAdapters(files);
      return;
    }
    setEnterpriseBusy(true);
    setWorkspaceRailMode("sets");
    try {
      const importTitle = files.length === 1
        ? files[0].name.replace(/\.[^.]+$/, "") || "Imported SENA Project"
        : `Imported SENA Project (${files.length} files)`;
      const payload = await importEnterpriseFilesAction(
        {
          files,
          teamId: activeEnterpriseTeamId || undefined,
          createProject: true,
          includeRuntimeBundle: true,
          title: importTitle,
          description: `Created from enterprise import of ${files.map((file) => file.name).join(", ")}.`
        },
        { csrfHeaders: enterpriseCsrfHeaders }
      );
      if (!payload.dataset) {
        // A queued 202 returns a server-job receipt, not an import result;
        // leave the current workspace dataset untouched instead of clobbering
        // it to undefined (§4.4). Results arrive via the external worker.
        setImportError(null);
        setEnterpriseMessage(`Enterprise import was queued as server job ${payload.id ?? "(unknown)"}; the external worker will complete it and the current workspace dataset is unchanged.`);
        return;
      }
      if (payload.persistedProject?.snapshot) {
        await restoreProjectSnapshot(payload.persistedProject.snapshot, payload.persistedProject.title);
        setActiveEnterpriseProjectId(payload.persistedProject.id);
      } else {
        setDataset(payload.dataset);
        setUploadedTables([]);
        setDemoManualReviews({});
        setSelectedId("");
      }
      // restoreProjectSnapshot sets the dataset itself, so fold the run warnings in
      // afterwards to cover both branches with one durable disclosure.
      setDataset((current) => withImportWarnings(current, payload.warnings));
      setImportMessage(`Enterprise import loaded ${files.length} file${files.length === 1 ? "" : "s"}: ${payload.sources?.map((source: { profile: string }) => source.profile).join(", ") || "adapter"}.`);
      setImportError(null);
      const importRun = payload.importRun;
      if (importRun) setEnterpriseImportRuns((runs) => [importRun, ...runs.filter((run) => run.id !== importRun.id)]);
      const persistedProject = payload.persistedProject;
      if (persistedProject) {
        setEnterpriseProjects((projects) => [
          persistedProject,
          ...projects.filter((project) => project.id !== persistedProject.id)
        ]);
      }
      const enterpriseAnalysisRun = payload.enterpriseAnalysisRun;
      if (enterpriseAnalysisRun) {
        setEnterpriseAnalysisRuns((runs) => [
          enterpriseAnalysisRun,
          ...runs.filter((run) => run.id !== enterpriseAnalysisRun.id)
        ]);
      }
      const scanSummary = payload.uploads?.map((upload: { scanStatus?: string }) => upload.scanStatus ?? "unscanned").join(", ") || "unscanned";
      const manifestSummary = payload.cleaningManifest?.schemaVersion
        ? `; cleaning manifest ${payload.cleaningManifest.checks?.filter((check: { status: string }) => check.status === "review").length ?? 0} review checks`
        : "";
      const projectSummary = payload.persistedProject
        ? `; saved project ${payload.persistedProject.title} (${payload.persistedProject.id}) with analysis ${payload.enterpriseAnalysisRun?.id ?? "run"}`
        : "";
      setEnterpriseMessage(`Enterprise import ${payload.importRun?.id ?? "run"} completed: ${payload.importRun?.datasetCounts?.people ?? payload.dataset.people.length} people, ${payload.importRun?.datasetCounts?.utterances ?? payload.dataset.utterances.length} utterances, ${payload.importRun?.warningCount ?? payload.warnings?.length ?? 0} warnings; upload scan ${scanSummary}${manifestSummary}${projectSummary}.`);
      setLocalEnterpriseImportResult(null);
      setLocalEnterpriseReliabilityResult(null);
      setLocalEnterpriseValidationResult(null);
      if (payload.persistedProject?.id) {
        await refreshEnterpriseState();
        await refreshEnterpriseCollaboration(payload.persistedProject.id);
        await touchEnterprisePresence(payload.persistedProject.id, { quiet: true });
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Enterprise import failed.");
    } finally {
      setEnterpriseBusy(false);
    }
  }, [
    activeEnterpriseTeamId,
    enterpriseCsrfHeaders,
    enterpriseUserPresent,
    importFilesLocallyWithEnterpriseAdapters,
    refreshEnterpriseCollaboration,
    refreshEnterpriseState,
    restoreProjectSnapshot,
    setActiveEnterpriseProjectId,
    setDataset,
    setDemoManualReviews,
    setEnterpriseAnalysisRuns,
    setEnterpriseBusy,
    setEnterpriseImportRuns,
    setEnterpriseMessage,
    setEnterpriseProjects,
    setImportError,
    setImportMessage,
    setLocalEnterpriseImportResult,
    setLocalEnterpriseReliabilityResult,
    setLocalEnterpriseValidationResult,
    setSelectedId,
    setUploadedTables,
    setWorkspaceRailMode,
    touchEnterprisePresence
  ]);

  return {
    importFilesLocallyWithEnterpriseAdapters,
    importFilesViaEnterpriseApi
  };
}
