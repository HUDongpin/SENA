// Run/cancel sequencing for the ENA workspace, extracted from
// EnaWorkspaceClient so the cancel/settlement interplay is testable without a
// DOM. The component owns the React state and worker refs; it hands this
// module setter callbacks and an executor, plus a mutable run token (a React
// ref in production, a plain { current } object in tests).

import type { EnaMapping, EnaRunOptions } from "@/lib/ena/types";

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
  /**
   * Stamp of the baked-in inputs this attempt is computing from
   * (`enaRunInputFingerprint`), recorded alongside the result it produces.
   */
  inputFingerprint: string;
  /**
   * Records what the on-screen result was computed from; null when there is no
   * result. Deliberately a required member rather than an optional one: a
   * result whose provenance nobody wrote down is exactly the defect below.
   */
  setResultInputs: (fingerprint: string | null) => void;
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
  // The result and the record of what produced it are written together, here
  // and below, under the same guard. Any path that sets one without the other
  // is how a result comes to outlive its inputs (FA13-NEW-2).
  host.setResult(null);
  host.setResultInputs(null);

  try {
    const result = await host.execute();
    if (isCurrentRun()) {
      host.setResult(result);
      host.setResultInputs(host.inputFingerprint);
    }
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

/* ---------------------------------------------------------------------------
   FA13-NEW-2: a settled analysis vs. inputs that moved on.

   supersedeEnaRun above handles the run *in flight*. It cannot help a run that
   has already finished: its guard returns early when nothing is running, so
   changing a baked-in input after a run completed left the finished result on
   screen with nothing marking it. The Methods write-up then composed the live
   mapping and options with that frozen run inside single sentences — "6 codes
   were included (…)" above the same run's "This yielded 6 units of analysis" —
   and Copy and the exports wrote that composite out as a description of work
   that was never done.

   The settled result is deliberately NOT discarded: a stray chip click must
   not throw away a completed analysis. It is marked instead, and everything
   that would turn it into an artifact is held until the next run.
--------------------------------------------------------------------------- */

/**
 * The inputs a run bakes into its result and which cannot be recovered from
 * it: the column mapping and the accumulation options.
 *
 * Composition — Group By and the minimum edge weight — is deliberately absent,
 * and marking a result for them would nag the researcher to re-run for nothing.
 * But the reason is narrower than "composition cannot go stale", which is what
 * this comment used to claim and which is false as stated: a run DOES bake the
 * composition it was started with into `result.plotModel` (buildEnaPlotModel
 * consumes both `groupBy` and `minWeight`), and that frozen model does go stale
 * the moment either control moves.
 *
 * What licenses the exclusion is that every surface which shows or states the
 * composition derives it live rather than reading the frozen model:
 * `composedPlotModel` rebuilds the drawn network from whatever set exists, and
 * the Methods write-up is handed `activeGroupBy` and `minWeight` directly.
 * The JSON export was the exception — it serialised `result.plotModel` verbatim
 * and so shipped a figure spec with no group traces beside a paragraph reading
 * "Units were grouped by stage" — and it is now handed the drawn model instead
 * (`enaResultForExport`). Any future consumer of the frozen `result.plotModel`
 * has to do the same: this stamp will not mark it, and no stale banner will
 * warn about it.
 *
 * The dataset is the third baked-in input, but replacing it clears the result
 * outright (applyCsv), leaving nothing to mark.
 */
export type EnaBakedInInputs = {
  mapping: EnaMapping;
  options: Required<EnaRunOptions>;
};

/**
 * A comparable stamp of the inputs above.
 *
 * The options are stringified from their own keys, sorted, rather than from a
 * hand-written list: an option added to the run later is then covered the day
 * it is added instead of silently falling outside the comparison. Order within
 * the mapping arrays is significant on purpose — a code list in a different
 * order is not demonstrably the run that is on screen, and for a research
 * artifact the conservative answer is the correct one.
 */
export function enaRunInputFingerprint({ mapping, options }: EnaBakedInInputs): string {
  return JSON.stringify({
    units: mapping.units,
    conversation: mapping.conversation,
    codes: mapping.codes,
    metadata: mapping.metadata ?? [],
    options: Object.fromEntries(
      Object.entries(options).sort(([left], [right]) => left.localeCompare(right))
    )
  });
}

export type EnaResultProvenance = {
  hasResult: boolean;
  /** What the on-screen result was computed from; null when there is none. */
  ranWith: string | null;
  /** The same stamp taken from the inputs as they stand now. */
  live: string;
};

/**
 * Whether the result on screen still describes the inputs on screen.
 *
 * Derived from the two stamps rather than remembered in a flag. A boolean set
 * by each mutator has to be cleared again by every path that makes it untrue,
 * and a state transition nobody remembered to write is precisely the defect
 * this replaces — three mutators updated the inputs and left the result alone.
 * A comparison cannot drift out of step that way, and it also means putting a
 * chip back the way it was clears the mark, rather than demanding a re-run to
 * undo a stray click.
 */
export function isEnaResultStale(provenance: EnaResultProvenance): boolean {
  if (!provenance.hasResult || provenance.ranWith === null) return false;
  return provenance.ranWith !== provenance.live;
}

/**
 * Whether a result may be turned into something that outlives the screen — the
 * JSON/points/connections exports, and the Methods write-up on the clipboard.
 *
 * A stale result stays plotted, but must never be written out as though it
 * described the mapping and options now displayed beside it.
 */
export function canPublishEnaResult(provenance: EnaResultProvenance): boolean {
  return provenance.hasResult && !isEnaResultStale(provenance);
}
