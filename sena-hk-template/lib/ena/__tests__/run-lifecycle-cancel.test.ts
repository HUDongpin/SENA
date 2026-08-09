import { describe, expect, it } from "vitest";
import {
  createENAWorkerClient,
  type ENAWorkerLike,
  type ENAWorkerOptions,
  type ENAWorkerRequest,
  type ENAWorkerResponse,
  type ENAWorkerRunHandle
} from "jena-js/browser";
import {
  ENA_RUN_CANCELLED_MESSAGE,
  cancelEnaAnalysis,
  runEnaAnalysis,
  type EnaRunToken
} from "../../../app/workspace/ena/run-lifecycle";

// FA13-16 (Functional Coverage Ledger, escalation 2026-08-08): Cancel sets
// "Analysis cancelled.", but client.terminate() synchronously rejects the
// in-flight run with jena-js's own Error("ENA worker client terminated."), and
// that rejection's continuation lands in a microtask *after* the cancel
// handler returns — overwriting the intended message with a library-internal
// string. These tests drive the real jena-js browser client over a stub
// worker, so the rejection order under test is the library's actual behavior,
// not a re-implementation of it.

const workerOptions: ENAWorkerOptions = {
  rows: [],
  units: ["unit"],
  conversation: ["turn"],
  codes: ["A", "B"]
};

type LifecycleState = {
  error: string | null;
  isRunning: boolean;
  progress: number | null;
  result: string | null;
  settled: number;
};

function createHarness() {
  const state: LifecycleState = { error: null, isRunning: false, progress: null, result: null, settled: 0 };
  const runToken: EnaRunToken = { current: 0 };
  const setters = {
    setIsRunning: (isRunning: boolean) => { state.isRunning = isRunning; },
    setProgress: (progress: number | null) => { state.progress = progress; },
    setError: (message: string | null) => { state.error = message; }
  };
  return {
    state,
    runToken,
    run(execute: () => Promise<string>, initialProgress: number | null = 0) {
      return runEnaAnalysis<string>(runToken, {
        initialProgress,
        execute,
        onSettled: () => { state.settled += 1; },
        setResult: (result) => { state.result = result; },
        ...setters
      });
    },
    cancel(teardown: () => void) {
      cancelEnaAnalysis(runToken, { teardown, ...setters });
    }
  };
}

// Minimal ENAWorkerLike that never answers, standing in for a worker mid-run.
// `emit` lets a test deliver a worker response by hand.
function createStubWorker() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const posted: ENAWorkerRequest[] = [];
  let terminated = false;
  const worker: ENAWorkerLike = {
    postMessage(message) {
      posted.push(message);
    },
    addEventListener(type: string, listener: (event: never) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (event: unknown) => void);
    },
    removeEventListener(type: string, listener: (event: never) => void) {
      listeners.get(type)?.delete(listener as (event: unknown) => void);
    },
    terminate() {
      terminated = true;
    }
  };
  return {
    worker,
    posted,
    isTerminated: () => terminated,
    emitMessage(response: ENAWorkerResponse) {
      for (const listener of listeners.get("message") ?? []) listener({ data: response });
    }
  };
}

describe("ENA run lifecycle vs jena-js worker teardown (FA13-16)", () => {
  it("keeps the cancel message when terminate() rejects the in-flight run", async () => {
    const stub = createStubWorker();
    const client = createENAWorkerClient(stub.worker);
    const harness = createHarness();

    let handle: ENAWorkerRunHandle | undefined;
    const attempt = harness.run(() => {
      handle = client.start(workerOptions, () => {});
      return handle.promise as Promise<never>;
    });
    expect(harness.state.isRunning).toBe(true);
    expect(harness.state.progress).toBe(0);

    // The Cancel click, exactly as EnaWorkspaceClient wires it: cancel the
    // handle (posts a cancel request the stub worker will never answer), then
    // terminate the client — which rejects handle.promise synchronously.
    harness.cancel(() => {
      handle?.cancel();
      client.terminate();
    });
    expect(harness.state.error).toBe(ENA_RUN_CANCELLED_MESSAGE);
    expect(stub.isTerminated()).toBe(true);

    // Let the rejected run's catch/finally microtasks land. Pre-fix, this is
    // where "ENA worker client terminated." overwrote the cancel message.
    await attempt;
    expect(harness.state.error).toBe(ENA_RUN_CANCELLED_MESSAGE);
    expect(harness.state.isRunning).toBe(false);
    expect(harness.state.progress).toBeNull();
    // The cancelled run touches nothing on its way out — teardown already
    // dropped the run handle, and re-running that cleanup would clobber the
    // handle of whatever run started next. The other half of this claim (a
    // current run does settle, exactly once) is pinned by the test below.
    expect(harness.state.settled).toBe(0);
  });

  it("still surfaces a genuine worker failure verbatim when nothing was cancelled", async () => {
    const stub = createStubWorker();
    const client = createENAWorkerClient(stub.worker);
    const harness = createHarness();

    let handle: ENAWorkerRunHandle | undefined;
    const attempt = harness.run(() => {
      handle = client.start(workerOptions, () => {});
      return handle.promise as Promise<never>;
    });
    stub.emitMessage({ v: 1, kind: "error", id: handle!.id, message: "codes produced an empty adjacency matrix" });

    await attempt;
    expect(harness.state.error).toBe("codes produced an empty adjacency matrix");
    expect(harness.state.isRunning).toBe(false);
    expect(harness.state.settled).toBe(1);
  });

  it("discards a result that settles after cancel instead of resurrecting it", async () => {
    // The API runtime has no worker to terminate, so a cancelled fetch can
    // still resolve; the run was abandoned, so its late result must not land.
    const harness = createHarness();
    let resolveRun: (value: string) => void = () => {};
    const attempt = harness.run(() => new Promise<string>((resolve) => { resolveRun = resolve; }), null);

    harness.cancel(() => {});
    resolveRun("late API result");

    await attempt;
    expect(harness.state.result).toBeNull();
    expect(harness.state.error).toBe(ENA_RUN_CANCELLED_MESSAGE);
  });

  it("does not mute the run that comes after a cancel", async () => {
    const harness = createHarness();
    const first = harness.run(() => new Promise<string>(() => {}), null);
    harness.cancel(() => {});
    await Promise.race([first, Promise.resolve()]);

    // A fresh run must reset the cancel flag: its own failure surfaces...
    await harness.run(() => Promise.reject(new Error("real failure")), null);
    expect(harness.state.error).toBe("real failure");

    // ...and its own success lands.
    await harness.run(() => Promise.resolve("second wind"), null);
    expect(harness.state.result).toBe("second wind");
    expect(harness.state.error).toBeNull();
  });

  it("does not resurrect a cancelled run's result once a new run has started", async () => {
    // The API runtime has no AbortController, so a cancelled fetch keeps
    // flying. A shared cancelled-state flag has to be cleared by the next run
    // (the test above), which hands the abandoned run a window in which it
    // looks live again — so its stale result lands as if it were the new run's,
    // and its cleanup stands the new run down mid-flight. A run must be judged
    // against its own identity, not against shared state its successor owns.
    const harness = createHarness();
    let resolveAbandoned: (value: string) => void = () => {};
    const abandoned = harness.run(() => new Promise<string>((resolve) => { resolveAbandoned = resolve; }), null);

    harness.cancel(() => {});

    // The replacement run is a worker run, so its progress starts at 0 rather
    // than null: an abandoned run that ran the cleanup would blank it, which a
    // null-progress current run could not tell apart from doing nothing.
    let resolveCurrent: (value: string) => void = () => {};
    const current = harness.run(() => new Promise<string>((resolve) => { resolveCurrent = resolve; }), 0);
    expect(harness.state.isRunning).toBe(true);

    resolveAbandoned("result of the run the user cancelled");
    await abandoned;
    expect(harness.state.result).toBeNull();
    expect(harness.state.isRunning).toBe(true);
    expect(harness.state.progress).toBe(0);

    resolveCurrent("result of the run the user is waiting for");
    await current;
    expect(harness.state.result).toBe("result of the run the user is waiting for");
  });

  it("keeps the newest run's outcome when an earlier run settles last", async () => {
    // Overlapping runs with no cancel between them. Today's UI cannot produce
    // this — the Run button is *replaced* by Cancel while a run is in flight
    // (EnaWorkspaceClient), so runAnalysis has one reachable call site and the
    // cancel-then-rerun path above is the live defect. This pins the module's
    // own invariant, so a second call site (a retry, an auto-rerun on a mapping
    // change) cannot reintroduce last-settled-wins.
    const harness = createHarness();
    let resolveSuperseded: (value: string) => void = () => {};
    const superseded = harness.run(() => new Promise<string>((resolve) => { resolveSuperseded = resolve; }), null);
    let resolveNewest: (value: string) => void = () => {};
    const newest = harness.run(() => new Promise<string>((resolve) => { resolveNewest = resolve; }), null);

    resolveNewest("newest result");
    await newest;
    expect(harness.state.result).toBe("newest result");

    resolveSuperseded("superseded result");
    await superseded;
    expect(harness.state.result).toBe("newest result");
  });

  it("does not paint a superseded run's failure over the current run", async () => {
    // Error-side twin of the test above, and likewise a guard on the module
    // rather than a reproduction of today's UI.
    const harness = createHarness();
    let rejectSuperseded: (error: Error) => void = () => {};
    const superseded = harness.run(() => new Promise<string>((_resolve, reject) => { rejectSuperseded = reject; }), null);
    await harness.run(() => Promise.resolve("current result"), null);

    rejectSuperseded(new Error("superseded failure"));
    await superseded;
    expect(harness.state.error).toBeNull();
    expect(harness.state.result).toBe("current result");
  });
});
