// Run/cancel sequencing for the ENA workspace, extracted from
// EnaWorkspaceClient so the cancel/settlement interplay is testable without a
// DOM. The component owns the React state and worker refs; it hands this
// module setter callbacks and an executor, plus a mutable cancel flag (a React
// ref in production, a plain { current } object in tests).

export const ENA_RUN_CANCELLED_MESSAGE = "Analysis cancelled.";

export type EnaCancelFlag = { current: boolean };

export type EnaRunHost<TResult> = {
  /** 0 for the worker runtime (which reports progress), null for the API. */
  initialProgress: number | null;
  execute: () => Promise<TResult>;
  /** Runs when the attempt settles either way; the component drops its run handle here. */
  onSettled: () => void;
  setIsRunning: (isRunning: boolean) => void;
  setProgress: (progress: number | null) => void;
  setError: (message: string | null) => void;
  setResult: (result: TResult | null) => void;
};

export type EnaCancelHost = {
  /** Cancels the in-flight run and tears the worker down (jena-js handle.cancel + client.terminate). */
  teardown: () => void;
  setIsRunning: (isRunning: boolean) => void;
  setProgress: (progress: number | null) => void;
  setError: (message: string | null) => void;
};

export async function runEnaAnalysis<TResult>(cancelRequested: EnaCancelFlag, host: EnaRunHost<TResult>): Promise<void> {
  cancelRequested.current = false;
  host.setIsRunning(true);
  host.setProgress(host.initialProgress);
  host.setError(null);
  host.setResult(null);

  try {
    const result = await host.execute();
    if (!cancelRequested.current) host.setResult(result);
  } catch (runError) {
    // FA13-16: cancelling terminates the worker, and jena-js then rejects the
    // in-flight run with its own "ENA worker client terminated." Error — a
    // microtask after cancelEnaAnalysis has already written the user-facing
    // cancel message. A cancelled run's settlement must not repaint the error
    // (or, on the API runtime, land a late result the user walked away from).
    if (!cancelRequested.current) {
      host.setError(runError instanceof Error ? runError.message : "ENA analysis failed.");
    }
  } finally {
    host.onSettled();
    host.setIsRunning(false);
    host.setProgress(null);
  }
}

export function cancelEnaAnalysis(cancelRequested: EnaCancelFlag, host: EnaCancelHost): void {
  cancelRequested.current = true;
  host.teardown();
  host.setIsRunning(false);
  host.setProgress(null);
  host.setError(ENA_RUN_CANCELLED_MESSAGE);
}
