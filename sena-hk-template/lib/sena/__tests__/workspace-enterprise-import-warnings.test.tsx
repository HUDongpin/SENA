import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEnterpriseImportActions } from "../../../components/sena/workspace/use-enterprise-import-actions";
import { createEmptySenaDataset } from "../import";
import type { SenaDataset, SenaProjectSnapshot } from "../types";

const adapterWarning = "roster.csv: CSV row 3 has 2 cells but the header has 3; padded empty values for: role.";
const tableWarning = "codebook table is not uploaded; validation may derive placeholders where possible.";
// uniqueBy (lib/sena/import.ts) emits this once per extra occurrence, so a roster
// listing P1 three times produces two byte-identical lines that must both survive.
const duplicateWarning = 'Duplicate person id "P1" was ignored.';

type EnterpriseStore = {
  dataset: SenaDataset;
  importError: string | null;
  restoredSnapshots: string[];
};

function resolve<T>(value: T | ((current: T) => T), current: T): T {
  return typeof value === "function" ? (value as (previous: T) => T)(current) : value;
}

function createStore(): EnterpriseStore {
  return { dataset: createEmptySenaDataset(), importError: null, restoredSnapshots: [] };
}

function datasetWith(warnings: string[]): SenaDataset {
  return {
    ...createEmptySenaDataset(),
    people: [{ id: "A", label: "Ms Lee", role: "Teacher", group: "Lesson study", initials: "ML" }],
    warnings
  };
}

/**
 * Mounts the real enterprise import hook. Each mount is one React render, matching
 * the harness used for the contract-upload path.
 */
function mountEnterpriseImport(store: EnterpriseStore, enterpriseUserPresent: boolean) {
  const noop = () => undefined;
  let importFiles: ((files: File[]) => Promise<void>) | null = null;

  function EnterpriseImportHarness() {
    const actions = useEnterpriseImportActions({
      enterpriseUserPresent,
      activeEnterpriseTeamId: "team-1",
      enterpriseCsrfHeaders: async () => ({}),
      setEnterpriseBusy: noop,
      setWorkspaceRailMode: noop,
      setDataset: (value) => { store.dataset = resolve(value, store.dataset); },
      setUploadedTables: noop,
      setDemoManualReviews: noop,
      setSelectedId: noop,
      setImportMessage: noop,
      setImportError: (value) => { store.importError = resolve(value, store.importError); },
      setEnterpriseMessage: noop,
      setLocalEnterpriseImportResult: noop,
      setLocalEnterpriseReliabilityResult: noop,
      setLocalEnterpriseValidationResult: noop,
      setActiveEnterpriseProjectId: noop,
      setEnterpriseImportRuns: noop,
      setEnterpriseProjects: noop,
      setEnterpriseAnalysisRuns: noop,
      restoreProjectSnapshot: (snapshot, fileName) => {
        store.restoredSnapshots.push(fileName);
        store.dataset = snapshot.source.sourceDataset ?? snapshot.dataset;
      },
      refreshEnterpriseState: async () => undefined,
      refreshEnterpriseCollaboration: async () => undefined,
      touchEnterprisePresence: async () => undefined
    });
    importFiles = actions.importFilesViaEnterpriseApi;
    return null;
  }

  renderToStaticMarkup(<EnterpriseImportHarness />);
  if (!importFiles) throw new Error("Enterprise import harness did not expose its action.");
  return importFiles as (files: File[]) => Promise<void>;
}

function csvFile() {
  return new File(["person_id,label,role\nA,Ms Lee,Teacher\n"], "roster.csv", { type: "text/csv" });
}

afterEach(() => {
  vi.doUnmock("@/lib/sena/import-adapters");
  vi.doUnmock("../../../components/sena/workspace/enterprise-actions");
  vi.resetModules();
});

describe("SENA workspace enterprise import warnings", () => {
  it("routes local adapter import warnings to the durable dataset channel", async () => {
    // Stubbed so the assertions do not race the concurrent import-adapters change
    // that folds csv warnings into dataset.warnings; the union must hold either way.
    vi.doMock("@/lib/sena/import-adapters", () => ({
      importSenaEnterpriseFiles: async () => ({
        schemaVersion: "sena-enterprise-import/v1",
        dataset: datasetWith([tableWarning]),
        warnings: [adapterWarning, tableWarning],
        sources: [{ name: "roster.csv", profile: "csv-table", rows: 1, warnings: [adapterWarning] }],
        cleaningManifest: { schemaVersion: "sena-import-cleaning-manifest/v1", checks: [], summary: {}, recommendedNextActions: [] }
      })
    }));

    const store = createStore();
    await mountEnterpriseImport(store, false)([csvFile()]);

    expect(store.dataset.warnings).toContain(adapterWarning);
    expect(store.dataset.warnings).toContain(tableWarning);
    expect(store.importError).toBeNull();
  });

  it("does not duplicate warnings the adapter already folded into the dataset", async () => {
    // Mirrors the post-change adapter shape: dataset.warnings already carries the
    // csv warning. The union must stay idempotent rather than double-reporting.
    vi.doMock("@/lib/sena/import-adapters", () => ({
      importSenaEnterpriseFiles: async () => ({
        schemaVersion: "sena-enterprise-import/v1",
        dataset: datasetWith([adapterWarning, tableWarning]),
        warnings: [adapterWarning, tableWarning],
        sources: [],
        cleaningManifest: { schemaVersion: "sena-import-cleaning-manifest/v1", checks: [], summary: {}, recommendedNextActions: [] }
      })
    }));

    const store = createStore();
    await mountEnterpriseImport(store, false)([csvFile()]);

    expect(store.dataset.warnings).toEqual([adapterWarning, tableWarning]);
  });

  it("preserves repeated warning lines at their true count", async () => {
    // A people.csv listing P1 three times: two identical duplicate warnings plus one
    // table warning. The panel must render 3 lines to match the reported count.
    vi.doMock("@/lib/sena/import-adapters", () => ({
      importSenaEnterpriseFiles: async () => ({
        schemaVersion: "sena-enterprise-import/v1",
        dataset: datasetWith([]),
        warnings: [duplicateWarning, duplicateWarning, tableWarning],
        sources: [],
        cleaningManifest: { schemaVersion: "sena-import-cleaning-manifest/v1", checks: [], summary: {}, recommendedNextActions: [] }
      })
    }));

    const store = createStore();
    await mountEnterpriseImport(store, false)([csvFile()]);

    expect(store.dataset.warnings).toEqual([duplicateWarning, duplicateWarning, tableWarning]);
    expect(store.dataset.warnings).toHaveLength(3);
  });

  it("stays idempotent when the adapter already folded a duplicate-bearing list in", async () => {
    // Post-F13 the local path hands back the same array in both fields; re-merging a
    // list that already carries the duplicates must not grow it to five entries.
    const alreadyFolded = [duplicateWarning, duplicateWarning, tableWarning];
    vi.doMock("@/lib/sena/import-adapters", () => ({
      importSenaEnterpriseFiles: async () => ({
        schemaVersion: "sena-enterprise-import/v1",
        dataset: datasetWith(alreadyFolded),
        warnings: alreadyFolded,
        sources: [],
        cleaningManifest: { schemaVersion: "sena-import-cleaning-manifest/v1", checks: [], summary: {}, recommendedNextActions: [] }
      })
    }));

    const store = createStore();
    await mountEnterpriseImport(store, false)([csvFile()]);

    expect(store.dataset.warnings).toEqual(alreadyFolded);
  });

  it("appends only the surplus occurrences of a partially folded warning", async () => {
    // dataset already has one copy; the run reports two. Exactly one more is owed,
    // and the existing entries keep their position ahead of the appended surplus.
    vi.doMock("@/lib/sena/import-adapters", () => ({
      importSenaEnterpriseFiles: async () => ({
        schemaVersion: "sena-enterprise-import/v1",
        dataset: datasetWith([duplicateWarning]),
        warnings: [duplicateWarning, duplicateWarning, adapterWarning],
        sources: [],
        cleaningManifest: { schemaVersion: "sena-import-cleaning-manifest/v1", checks: [], summary: {}, recommendedNextActions: [] }
      })
    }));

    const store = createStore();
    await mountEnterpriseImport(store, false)([csvFile()]);

    expect(store.dataset.warnings).toEqual([duplicateWarning, duplicateWarning, adapterWarning]);
  });

  it("keeps a genuine local import failure on the error channel", async () => {
    vi.doMock("@/lib/sena/import-adapters", () => ({
      importSenaEnterpriseFiles: async () => { throw new Error("No supported SENA import tables were found."); }
    }));

    const store = createStore();
    await mountEnterpriseImport(store, false)([csvFile()]);

    expect(store.importError).toBe("No supported SENA import tables were found.");
  });

  it("routes signed-in API import warnings to the durable dataset channel", async () => {
    vi.doMock("../../../components/sena/workspace/enterprise-actions", async () => ({
      ...await vi.importActual<Record<string, unknown>>("../../../components/sena/workspace/enterprise-actions"),
      importEnterpriseFilesAction: async () => ({
        dataset: datasetWith([tableWarning]),
        warnings: [adapterWarning, tableWarning],
        sources: [{ profile: "csv-table" }]
      })
    }));
    const { useEnterpriseImportActions: hook } = await import("../../../components/sena/workspace/use-enterprise-import-actions");

    const store = createStore();
    let importFiles: ((files: File[]) => Promise<void>) | null = null;
    const noop = () => undefined;
    function Harness() {
      importFiles = hook({
        enterpriseUserPresent: true,
        activeEnterpriseTeamId: "team-1",
        enterpriseCsrfHeaders: async () => ({}),
        setEnterpriseBusy: noop,
        setWorkspaceRailMode: noop,
        setDataset: (value) => { store.dataset = resolve(value, store.dataset); },
        setUploadedTables: noop,
        setDemoManualReviews: noop,
        setSelectedId: noop,
        setImportMessage: noop,
        setImportError: (value) => { store.importError = resolve(value, store.importError); },
        setEnterpriseMessage: noop,
        setLocalEnterpriseImportResult: noop,
        setLocalEnterpriseReliabilityResult: noop,
        setLocalEnterpriseValidationResult: noop,
        setActiveEnterpriseProjectId: noop,
        setEnterpriseImportRuns: noop,
        setEnterpriseProjects: noop,
        setEnterpriseAnalysisRuns: noop,
        restoreProjectSnapshot: noop,
        refreshEnterpriseState: async () => undefined,
        refreshEnterpriseCollaboration: async () => undefined,
        touchEnterprisePresence: async () => undefined
      }).importFilesViaEnterpriseApi;
      return null;
    }
    renderToStaticMarkup(<Harness />);
    await importFiles!([csvFile()]);

    expect(store.dataset.warnings).toContain(adapterWarning);
    expect(store.importError).toBeNull();
  });

  it("folds API import warnings in even when a persisted project snapshot is restored", async () => {
    const snapshot = {
      dataset: datasetWith([]),
      source: { sourceDataset: datasetWith([tableWarning]) }
    } as unknown as SenaProjectSnapshot;
    vi.doMock("../../../components/sena/workspace/enterprise-actions", async () => ({
      ...await vi.importActual<Record<string, unknown>>("../../../components/sena/workspace/enterprise-actions"),
      importEnterpriseFilesAction: async () => ({
        dataset: datasetWith([]),
        warnings: [adapterWarning],
        sources: [{ profile: "csv-table" }],
        persistedProject: { id: "proj-1", title: "Imported SENA Project", snapshot }
      })
    }));
    const { useEnterpriseImportActions: hook } = await import("../../../components/sena/workspace/use-enterprise-import-actions");

    const store = createStore();
    let importFiles: ((files: File[]) => Promise<void>) | null = null;
    const noop = () => undefined;
    function Harness() {
      importFiles = hook({
        enterpriseUserPresent: true,
        activeEnterpriseTeamId: "team-1",
        enterpriseCsrfHeaders: async () => ({}),
        setEnterpriseBusy: noop,
        setWorkspaceRailMode: noop,
        setDataset: (value) => { store.dataset = resolve(value, store.dataset); },
        setUploadedTables: noop,
        setDemoManualReviews: noop,
        setSelectedId: noop,
        setImportMessage: noop,
        setImportError: (value) => { store.importError = resolve(value, store.importError); },
        setEnterpriseMessage: noop,
        setLocalEnterpriseImportResult: noop,
        setLocalEnterpriseReliabilityResult: noop,
        setLocalEnterpriseValidationResult: noop,
        setActiveEnterpriseProjectId: noop,
        setEnterpriseImportRuns: noop,
        setEnterpriseProjects: noop,
        setEnterpriseAnalysisRuns: noop,
        restoreProjectSnapshot: (restored, fileName) => {
          store.restoredSnapshots.push(fileName);
          store.dataset = restored.source.sourceDataset ?? restored.dataset;
        },
        refreshEnterpriseState: async () => undefined,
        refreshEnterpriseCollaboration: async () => undefined,
        touchEnterprisePresence: async () => undefined
      }).importFilesViaEnterpriseApi;
      return null;
    }
    renderToStaticMarkup(<Harness />);
    await importFiles!([csvFile()]);

    expect(store.restoredSnapshots).toEqual(["Imported SENA Project"]);
    expect(store.dataset.warnings).toContain(adapterWarning);
    expect(store.dataset.warnings).toContain(tableWarning);
    expect(store.importError).toBeNull();
  });
});
