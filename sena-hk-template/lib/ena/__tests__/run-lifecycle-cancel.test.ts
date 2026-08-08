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
  type EnaCancelFlag
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
  const cancelRequested: EnaCancelFlag = { current: false };
  const setters = {
    setIsRunning: (isRunning: boolean) => { state.isRunning = isRunning; },
    setProgress: (progress: number | null) => { state.progress = progress; },
    setError: (message: string | null) => { state.error = message; }
  };
  return {
    state,
    cancelRequested,
    run(execute: () => Promise<string>, initialProgress: number | null = 0) {
      return runEnaAnalysis<string>(cancelRequested, {
        initialProgress,
        execute,
        onSettled: () => { state.settled += 1; },
        setResult: (result) => { state.result = result; },
        ...setters
      });
    },
    cancel(teardown: () => void) {
      cancelEnaAnalysis(cancelRequested, { teardown, ...setters });
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
    expect(harness.state.settled).toBe(1);
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
});
