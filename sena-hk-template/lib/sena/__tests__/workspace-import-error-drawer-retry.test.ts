import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { SetStateAction } from "react";
import { describe, expect, it } from "vitest";
import {
  INITIAL_WORKSPACE_IMPORT_ERROR_STATE,
  nextWorkspaceImportErrorState,
  type WorkspaceImportErrorState
} from "../../../components/sena/workspace/use-sena-fusion-workspace-main-shell-props";
import { workspaceImportErrorDrawerSignal } from "../../../components/sena/workspace/workspace-main-shell-section";

const workspaceDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../components/sena/workspace");

const GENERIC_IMPORT_FAILURE = "SENA import failed.";
const GENERIC_ENTERPRISE_FAILURE = "Enterprise import failed.";

type WorkspaceEvent =
  | { kind: "import-failed"; message: string }
  | { kind: "import-succeeded" }
  | { kind: "close-drawer" };

type SessionTrace = {
  drawerOpens: number;
  drawerOpen: boolean;
  plateMessages: Array<string | null>;
};

/**
 * Replays a workspace session through the two shipped decisions that make the
 * import-error drawer open: the reducer behind setImportError, and the drawer
 * effect's dependency signal. Everything else models React itself — a setState
 * that stores an identical value bails out without re-rendering, and an effect
 * whose dependencies are unchanged does not re-run. Those two rules are exactly
 * what let a repeated failure go silent, so the model has to keep them.
 */
function runWorkspaceSession(events: WorkspaceEvent[]): SessionTrace {
  let errorState: WorkspaceImportErrorState = INITIAL_WORKSPACE_IMPORT_ERROR_STATE;
  let committedSignal = workspaceImportErrorDrawerSignal({
    importError: errorState.message,
    importErrorAttempt: errorState.attempt
  });
  const trace: SessionTrace = { drawerOpens: 0, drawerOpen: false, plateMessages: [errorState.message] };

  function setImportError(value: SetStateAction<string | null>) {
    const next = nextWorkspaceImportErrorState(errorState, value);
    if (next === errorState) return; // React bails out: no re-render, no effects.
    errorState = next;
    trace.plateMessages.push(errorState.message);
    const signal = workspaceImportErrorDrawerSignal({
      importError: errorState.message,
      importErrorAttempt: errorState.attempt
    });
    if (signal === committedSignal) return; // Unchanged dependencies: the effect does not re-run.
    committedSignal = signal;
    if (!signal) return; // The effect's own early return when there is no error.
    trace.drawerOpen = true;
    trace.drawerOpens += 1;
  }

  for (const event of events) {
    if (event.kind === "import-failed") setImportError(event.message);
    if (event.kind === "import-succeeded") setImportError(null);
    if (event.kind === "close-drawer") trace.drawerOpen = false;
  }

  return trace;
}

describe("import error drawer reopens for a repeated failure", () => {
  it("opens the drawer for the first failed header upload", () => {
    const trace = runWorkspaceSession([{ kind: "import-failed", message: GENERIC_IMPORT_FAILURE }]);

    expect(trace.drawerOpens).toBe(1);
    expect(trace.drawerOpen).toBe(true);
  });

  it("reopens the drawer when the same bad file is picked again", () => {
    // The header input sits outside the drawer and goes inert while it is open, so
    // the retry path is: close the drawer, pick the same file, fail identically.
    const trace = runWorkspaceSession([
      { kind: "import-failed", message: GENERIC_IMPORT_FAILURE },
      { kind: "close-drawer" },
      { kind: "import-failed", message: GENERIC_IMPORT_FAILURE }
    ]);

    expect(trace.drawerOpens).toBe(2);
    expect(trace.drawerOpen).toBe(true);
  });

  it("reopens for two unrelated failures that collapse to the same generic message", () => {
    const trace = runWorkspaceSession([
      { kind: "import-failed", message: GENERIC_ENTERPRISE_FAILURE },
      { kind: "close-drawer" },
      { kind: "import-failed", message: GENERIC_ENTERPRISE_FAILURE },
      { kind: "close-drawer" },
      { kind: "import-failed", message: GENERIC_ENTERPRISE_FAILURE }
    ]);

    expect(trace.drawerOpens).toBe(3);
  });

  it("keeps the error plate populated across a repeated failure", () => {
    const trace = runWorkspaceSession([
      { kind: "import-failed", message: GENERIC_IMPORT_FAILURE },
      { kind: "close-drawer" },
      { kind: "import-failed", message: GENERIC_IMPORT_FAILURE }
    ]);

    // Blanking and re-setting would also re-run the effect, but it flashes the plate
    // off while the failure is still true. The message must never go null here.
    expect(trace.plateMessages.slice(1)).toEqual([GENERIC_IMPORT_FAILURE, GENERIC_IMPORT_FAILURE]);
  });

  it("closes the plate on a successful import and reopens on the next failure", () => {
    const trace = runWorkspaceSession([
      { kind: "import-failed", message: GENERIC_IMPORT_FAILURE },
      { kind: "close-drawer" },
      { kind: "import-succeeded" },
      { kind: "import-failed", message: GENERIC_IMPORT_FAILURE }
    ]);

    expect(trace.plateMessages).toEqual([null, GENERIC_IMPORT_FAILURE, null, GENERIC_IMPORT_FAILURE]);
    expect(trace.drawerOpens).toBe(2);
  });
});

describe("workspace import error state", () => {
  it("changes the drawer signal for a repeat of the identical message", () => {
    const first = nextWorkspaceImportErrorState(INITIAL_WORKSPACE_IMPORT_ERROR_STATE, GENERIC_IMPORT_FAILURE);
    const second = nextWorkspaceImportErrorState(first, GENERIC_IMPORT_FAILURE);

    expect(second.message).toBe(first.message);
    expect(
      workspaceImportErrorDrawerSignal({ importError: second.message, importErrorAttempt: second.attempt })
    ).not.toBe(
      workspaceImportErrorDrawerSignal({ importError: first.message, importErrorAttempt: first.attempt })
    );
  });

  it("has no drawer signal while there is no error", () => {
    expect(
      workspaceImportErrorDrawerSignal({ importError: null, importErrorAttempt: 7 })
    ).toBe(workspaceImportErrorDrawerSignal({ importError: null, importErrorAttempt: 0 }));
    expect(workspaceImportErrorDrawerSignal({ importError: null, importErrorAttempt: 7 })).toBeFalsy();
  });

  it("returns the same state object for a redundant clear so React can bail out", () => {
    const cleared = nextWorkspaceImportErrorState(INITIAL_WORKSPACE_IMPORT_ERROR_STATE, null);

    expect(cleared).toBe(INITIAL_WORKSPACE_IMPORT_ERROR_STATE);
  });

  it("supports the functional setState form the import hooks pass through", () => {
    const raised = nextWorkspaceImportErrorState(INITIAL_WORKSPACE_IMPORT_ERROR_STATE, GENERIC_IMPORT_FAILURE);
    const appended = nextWorkspaceImportErrorState(raised, (current) => `${current} Retry.`);

    expect(appended.message).toBe(`${GENERIC_IMPORT_FAILURE} Retry.`);
    expect(appended.attempt).toBeGreaterThan(raised.attempt);
  });
});

describe("import error drawer effect wiring", () => {
  // The effect itself needs a DOM renderer to observe; this pins that it consumes
  // the signal the tests above exercise rather than the raw message.
  const mainShellSource = readFileSync(resolve(workspaceDir, "workspace-main-shell-section.tsx"), "utf8");

  it("keys the drawer effect on the import error signal", () => {
    expect(mainShellSource).toContain("workspaceImportErrorDrawerSignal(leftRailProps.dataImportFeedbackProps)");
    expect(mainShellSource).toContain("}, [importErrorDrawerSignal]);");
  });
});
