// Run/cancel sequencing for the ENA workspace, extracted from
// EnaWorkspaceClient so the cancel/settlement interplay is testable without a
// DOM. The component owns the React state and worker refs; it hands this
// module setter callbacks and an executor, plus a mutable run token (a React
// ref in production, a plain { current } object in tests).

export const ENA_RUN_CANCELLED_MESSAGE = "Analysis cancelled.";

/**
 * Monotonic run counter. Each run claims the next value and writes state only
 * while it still holds it; cancelling bumps it, and so does the next run. A
 * boolean "cancelled" flag cannot express this: the next run has to clear it,
 * which hands the abandoned run a window in which it looks live again.
 */
export type EnaRunToken = { current: number };

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

export type EnaSupersedeHost = {
  /** Cancels the in-flight run and tears the worker down (jena-js handle.cancel + client.terminate). */
  teardown: () => void;
  setIsRunning: (isRunning: boolean) => void;
  setProgress: (progress: number | null) => void;
};

export type EnaCancelHost = EnaSupersedeHost & {
  setError: (message: string | null) => void;
};

export async function runEnaAnalysis<TResult>(runToken: EnaRunToken, host: EnaRunHost<TResult>): Promise<void> {
  const token = (runToken.current += 1);
  const isCurrentRun = () => runToken.current === token;

  host.setIsRunning(true);
  host.setProgress(host.initialProgress);
  host.setError(null);
  host.setResult(null);

  try {
    const result = await host.execute();
    if (isCurrentRun()) host.setResult(result);
  } catch (runError) {
    // FA13-16: cancelling terminates the worker, and jena-js then rejects the
    // in-flight run with its own "ENA worker client terminated." Error — a
    // microtask after cancelEnaAnalysis has already written the user-facing
    // cancel message. Neither a cancelled run nor one the user has superseded
    // may repaint the error.
    if (isCurrentRun()) {
      host.setError(runError instanceof Error ? runError.message : "ENA analysis failed.");
    }
  } finally {
    // The API runtime has no AbortController, so an abandoned request keeps
    // flying and can settle at any moment — including while a fresh run is in
    // flight. Only the run still holding the token may stand the UI down or
    // drop the component's run handle; for a cancelled run, teardown already
    // did both.
    if (isCurrentRun()) {
      host.onSettled();
      host.setIsRunning(false);
      host.setProgress(null);
    }
  }
}

/**
 * Abandon the run in flight and stand the UI down, saying nothing about why.
 *
 * FA13-NEW: a run is computed from the dataset, mapping and accumulation
 * options as they stood when it started, and all three are baked into its
 * result. Change one of them and the run can no longer be allowed to settle —
 * its projection would paint over the new grid while the layer key, Compare
 * table and Methods write-up went on deriving from the new inputs, with
 * nothing to signal the mismatch. Bumping the token is what makes the
 * abandonment stick: teardown cannot reach an API run, which has no
 * AbortController and keeps flying until it settles.
 *
 * Silent by design — the caller is reporting the change that caused it (an
 * import message, a repopulated mapping). Cancel is this plus the message.
 */
export function supersedeEnaRun(runToken: EnaRunToken, host: EnaSupersedeHost): void {
  runToken.current += 1;
  host.teardown();
  host.setIsRunning(false);
  host.setProgress(null);
}

export function cancelEnaAnalysis(runToken: EnaRunToken, host: EnaCancelHost): void {
  supersedeEnaRun(runToken, host);
  host.setError(ENA_RUN_CANCELLED_MESSAGE);
}
