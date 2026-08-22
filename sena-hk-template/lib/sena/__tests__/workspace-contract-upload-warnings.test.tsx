import type { ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useContractUploadAction } from "../../../components/sena/workspace/use-contract-upload-action";
import { useDataImportMappedTableActions } from "../../../components/sena/workspace/use-data-import-mapped-table-actions";
import type { UploadedSenaTable } from "../../../components/sena/workspace/uploaded-table-mapper";
import { createEmptySenaDataset } from "../import";
import { buildSenaSnapshotRestoreResult } from "../snapshot-restore";
import type { SenaDataset, SenaProjectSnapshot } from "../types";
import { loadSena14bb306ReviewPacketFixture } from "./fixtures/sena-14bb306-fixture";

const raggedPeopleCsv = [
  "person_id,label,role",
  "A,Ms Lee,Teacher",
  "B,Mr Chan"
].join("\n");

const raggedRowWarning = "people.csv: CSV row 3 has 2 cells but the header has 3; padded empty values for: role.";

type WorkspaceStore = {
  dataset: SenaDataset;
  uploadedTables: UploadedSenaTable[];
  importError: string | null;
  restoredSnapshot: SenaProjectSnapshot | null;
  restoredFileName: string | null;
};

type WorkspaceHandlers = {
  handleContractUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  updateTableField: (id: string, field: string, column: string) => void;
};

function resolve<T>(value: T | ((current: T) => T), current: T): T {
  return typeof value === "function" ? (value as (previous: T) => T)(current) : value;
}

function createStore(): WorkspaceStore {
  return {
    dataset: createEmptySenaDataset(),
    uploadedTables: [],
    importError: null,
    restoredSnapshot: null,
    restoredFileName: null
  };
}

/**
 * Mounts the real upload hook on top of the real mapped-table hook, so the test
 * exercises the production commit chain (commitUploadedTables -> applyMappedTables
 * -> setDataset) rather than a stub that cannot clear the error channel. Each mount
 * is one React render: re-mount after a state change to pick up new closures.
 */
function mountWorkspace(store: WorkspaceStore): WorkspaceHandlers {
  const noop = () => undefined;
  let handlers: WorkspaceHandlers | null = null;

  function WorkspaceHarness() {
    const mapped = useDataImportMappedTableActions({
      downloadText: noop,
      uploadedTables: store.uploadedTables,
      setDataset: (value) => { store.dataset = resolve(value, store.dataset); },
      setUploadedTables: (value) => { store.uploadedTables = resolve(value, store.uploadedTables); },
      setImportError: (value) => { store.importError = resolve(value, store.importError); },
      setLocalEnterpriseImportResult: noop,
      setLocalEnterpriseReliabilityResult: noop,
      setLocalEnterpriseValidationResult: noop,
      setDemoManualReviews: noop,
      setImportMessage: noop,
      setInterpretation: noop,
      setIsLoadingSample: noop,
      setLimitations: noop,
      setNextActions: noop,
      setReportTitle: noop,
      setReviewer: noop,
      setReviewStatus: noop,
      setSelectedId: noop,
      setWorkspaceRailMode: noop
    });

    const upload = useContractUploadAction({
      applyDemoVerificationManualReviews: noop,
      commitUploadedTables: mapped.commitUploadedTables,
      importFilesViaEnterpriseApi: async () => undefined,
      restoreProjectSnapshot: (snapshot, fileName) => {
        store.restoredSnapshot = buildSenaSnapshotRestoreResult(snapshot).snapshot;
        store.restoredFileName = fileName;
      },
      restoreValidatedProjectSnapshot: (result, fileName) => {
        store.restoredSnapshot = result.snapshot;
        store.restoredFileName = fileName;
      },
      setDataset: (dataset) => { store.dataset = dataset; },
      setDemoManualReviews: noop,
      setImportError: (message) => { store.importError = message; },
      setImportMessage: noop,
      setLocalEnterpriseImportResult: noop,
      setLocalEnterpriseReliabilityResult: noop,
      setLocalEnterpriseValidationResult: noop,
      setUploadedTables: (tables) => { store.uploadedTables = tables; },
      setWorkspaceRailMode: noop,
      uploadedTables: store.uploadedTables
    });

    handlers = {
      handleContractUpload: upload.handleContractUpload,
      updateTableField: mapped.updateTableField
    };
    return null;
  }

  renderToStaticMarkup(<WorkspaceHarness />);
  if (!handlers) throw new Error("Workspace harness did not expose its handlers.");
  return handlers;
}

async function uploadCsv(handlers: WorkspaceHandlers, name: string, csv: string) {
  const input = { files: [new File([csv], name, { type: "text/csv" })], value: name };
  await handlers.handleContractUpload({ currentTarget: input } as unknown as ChangeEvent<HTMLInputElement>);
  return input;
}

describe("SENA workspace contract upload warnings", () => {
  it("surfaces ragged CSV rows from a browser five-CSV upload", async () => {
    const store = createStore();
    const input = await uploadCsv(mountWorkspace(store), "people.csv", raggedPeopleCsv);

    expect(store.dataset.warnings).toContain(raggedRowWarning);
    expect(store.uploadedTables).toHaveLength(1);
    expect(store.uploadedTables[0].rows).toHaveLength(2);
    expect(input.value).toBe("");
  });

  it("keeps ragged-row disclosure out of the import error plate", async () => {
    const store = createStore();
    await uploadCsv(mountWorkspace(store), "people.csv", raggedPeopleCsv);

    // importError renders as a rose ERROR plate; a repaired row is a warning, and
    // the durable warnings panel is where it belongs.
    expect(store.importError).toBeNull();
  });

  it("keeps ragged-row disclosure alive after a column remap", async () => {
    const store = createStore();
    await uploadCsv(mountWorkspace(store), "people.csv", raggedPeopleCsv);
    expect(store.dataset.warnings).toContain(raggedRowWarning);

    // Re-mount so the mapped-table hook closes over the committed tables, then run
    // the routine interaction that used to erase the disclosure.
    const remounted = mountWorkspace(store);
    remounted.updateTableField(store.uploadedTables[0].id, "role", "role");

    expect(store.dataset.warnings).toContain(raggedRowWarning);
    expect(store.importError).toBeNull();
  });

  it("reports every ragged row rather than truncating to the first three", async () => {
    const store = createStore();
    await uploadCsv(mountWorkspace(store), "people.csv", [
      "person_id,label,role",
      "A,Ms Lee",
      "B,Mr Chan",
      "C,Ms Ng",
      "D,Mr Ho"
    ].join("\n"));

    const raggedWarnings = (store.dataset.warnings ?? []).filter((warning) => warning.startsWith("people.csv:"));
    expect(raggedWarnings).toHaveLength(4);
  });

  it("leaves the warning channel untouched for a well-formed upload", async () => {
    const store = createStore();
    await uploadCsv(mountWorkspace(store), "people.csv", [
      "person_id,label,role",
      "A,Ms Lee,Teacher",
      "B,Mr Chan,Researcher"
    ].join("\n"));

    expect(store.dataset.warnings ?? []).not.toContain(raggedRowWarning);
    expect(store.uploadedTables[0].warnings).toEqual([]);
    expect(store.importError).toBeNull();
  });

  it("normalizes the actual 14bb306 nested snapshot through the workspace upload boundary", async () => {
    const historicalPacket = loadSena14bb306ReviewPacketFixture() as {
      contents: { projectSnapshot: SenaProjectSnapshot };
    };
    const store = createStore();
    const fileName = "sena-project-snapshot-14bb306.json";
    const input = {
      files: [new File([JSON.stringify(historicalPacket.contents.projectSnapshot)], fileName, { type: "application/json" })],
      value: fileName
    };

    await mountWorkspace(store).handleContractUpload({ currentTarget: input } as unknown as ChangeEvent<HTMLInputElement>);

    expect(store.restoredFileName).toBe(fileName);
    expect(store.restoredSnapshot?.report.fusionMathAudit).toEqual(expect.objectContaining({
      schemaVersion: "sena-fusion-math-audit/v2",
      sourceSchemaVersion: "sena-fusion-math-audit/v1",
      status: "needs-review"
    }));
    expect(store.restoredSnapshot?.report.codingReliabilityGate).toEqual(expect.objectContaining({
      schemaVersion: "sena-coding-reliability-gate/v2",
      sourceSchemaVersion: "sena-coding-reliability-gate/v1",
      status: "review"
    }));
    expect(store.restoredSnapshot?.report.pilotReadinessAudit.status).toBe("needs-review");
    expect(store.restoredSnapshot?.report.claimReadinessGate.status).toBe("exploratory");
    expect(store.importError).toBeNull();
    expect(input.value).toBe("");
  });
});
