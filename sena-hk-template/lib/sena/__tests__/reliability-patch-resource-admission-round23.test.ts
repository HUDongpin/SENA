import { afterEach, describe, expect, it, vi } from "vitest";

const patchRequestByteLimit = 65_536;
const reliabilityNoteByteLimit = 8_192;
const requestChunkLimit = 8_192;

const transportError = (actual: number, rule = `request-byte-count-at-most-${patchRequestByteLimit}`) => ({
  error: "SENA coding-reliability input exceeds the supported analysis universe.",
  code: "reliability_universe_limit_exceeded",
  issues: [{
    path: "annotations",
    rule,
    actual,
    maximum: rule.startsWith("request-chunk-count") ? requestChunkLimit : patchRequestByteLimit
  }]
});

const dummyContext = {
  user: { id: "user_round23", name: "Round23 reviewer" },
  teams: [{ id: "team_round23" }]
};

afterEach(() => {
  vi.doUnmock("@/lib/sena/api-helpers");
  vi.doUnmock("@/lib/sena/enterprise/reliability-runs");
  vi.doUnmock("../enterprise/state");
  vi.doUnmock("../enterprise/ops-audit");
  vi.doUnmock("../enterprise/notifications-delivery");
  vi.doUnmock("../enterprise-postgres");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadIsolatedPatchRoute(options: { admitReview?: boolean; enforceNotes?: boolean } = {}) {
  vi.resetModules();
  const requireMutationSession = vi.fn(async () => dummyContext);
  const adjudicate = vi.fn(async () => {
    throw new Error("adjudication builder must not run after transport rejection");
  });
  const review = vi.fn(async () => {
    if (options.admitReview) {
      return { body: { accepted: true }, headers: {} };
    }
    throw new Error("review builder must not run after transport rejection");
  });
  vi.doMock("@/lib/sena/api-helpers", async () => ({
    ...await vi.importActual<typeof import("../api-helpers")>("../api-helpers"),
    requireApiSessionForMutation: requireMutationSession
  }));
  vi.doMock("@/lib/sena/enterprise/reliability-runs", async () => {
    const parseSenaReliabilityMutationBody = options.enforceNotes
      ? (await vi.importActual<typeof import("../enterprise/reliability-runs")>(
        "../enterprise/reliability-runs"
      )).parseSenaReliabilityMutationBody
      : <T,>(body: T) => body;
    return {
      buildEnterpriseReliabilityAdjudicationResponseWithPostgresMirrorAsync: adjudicate,
      buildEnterpriseReliabilityJsonRunResponseWithPostgresMirrorAsync: vi.fn(),
      buildEnterpriseReliabilityRunListResponseAsync: vi.fn(),
      buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync: vi.fn(),
      buildEnterpriseReliabilityRunReviewResponseWithPostgresMirrorAsync: review,
      parseSenaReliabilityMutationBody,
      SENA_RELIABILITY_PATCH_REQUEST_BYTE_LIMIT: patchRequestByteLimit
    };
  });
  const route = await import("../../../app/api/sena/reliability/route");
  return { route, requireMutationSession, adjudicate, review };
}

function streamedPatchRequest(input: {
  chunks: Uint8Array[];
  contentLength?: number;
  onChunk?: () => void;
}) {
  let index = 0;
  const headers = new Headers({ "content-type": "application/json" });
  if (input.contentLength !== undefined) headers.set("content-length", String(input.contentLength));
  return new Request("https://sena.example.test/api/sena/reliability", {
    method: "PATCH",
    headers,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= input.chunks.length) {
          controller.close();
          return;
        }
        input.onChunk?.();
        controller.enqueue(input.chunks[index]);
        index += 1;
      }
    }),
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

function expectNoPatchStateEntry(input: Awaited<ReturnType<typeof loadIsolatedPatchRoute>>) {
  expect(input.requireMutationSession).not.toHaveBeenCalled();
  expect(input.adjudicate).not.toHaveBeenCalled();
  expect(input.review).not.toHaveBeenCalled();
}

describe("reliability PATCH bounded transport", () => {
  it("admits a complete PATCH envelope of exactly 65536 bytes", async () => {
    const isolated = await loadIsolatedPatchRoute({ admitReview: true });
    const prefix = JSON.stringify({
      action: "review",
      runId: "rel_round23",
      status: "rejected",
      notes: "boundary",
      padding: ""
    }).slice(0, -2);
    const suffix = '"}';
    const body = `${prefix}${"x".repeat(patchRequestByteLimit - prefix.length - suffix.length)}${suffix}`;
    expect(new TextEncoder().encode(body)).toHaveLength(patchRequestByteLimit);
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "content-length": String(patchRequestByteLimit)
      },
      body
    });

    const response = await isolated.route.PATCH(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(isolated.requireMutationSession).toHaveBeenCalledTimes(1);
    expect(isolated.review).toHaveBeenCalledTimes(1);
    expect(isolated.adjudicate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "non-string",
      { secret: "round23-invalid-note-secret" },
      400,
      "reliability_notes_invalid",
      "Reliability notes must be a string when provided.",
      "round23-invalid-note-secret"
    ],
    [
      "8193-byte",
      `${"界".repeat(2_730)}abc`,
      413,
      "reliability_notes_too_large",
      `Reliability notes must be at most ${reliabilityNoteByteLimit} UTF-8 bytes.`,
      "abc"
    ]
  ] as const)(
    "rejects %s notes before auth/state entry with a stable non-echoing response",
    async (_label, notes, status, code, error, secretMarker) => {
      const isolated = await loadIsolatedPatchRoute({ enforceNotes: true });
      const request = new Request("https://sena.example.test/api/sena/reliability", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review", runId: "rel_round23", status: "rejected", notes })
      });

      const response = await isolated.route.PATCH(request);
      const text = await response.text();

      expect(response.status).toBe(status);
      expect(JSON.parse(text)).toEqual({ error, code });
      expect(text).not.toContain(secretMarker);
      expectNoPatchStateEntry(isolated);
    }
  );

  it.each([
    ["null", null, "null"],
    ["array", ["round23-array-body-secret"], "round23-array-body-secret"],
    ["string", "round23-string-body-secret", "round23-string-body-secret"],
    ["number", 23, "23"],
    ["boolean", false, "false"]
  ] as const)(
    "rejects a top-level %s body before auth/state entry with a stable non-echoing response",
    async (_label, body, secretMarker) => {
      const isolated = await loadIsolatedPatchRoute({ enforceNotes: true });
      const request = new Request("https://sena.example.test/api/sena/reliability", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });

      const response = await isolated.route.PATCH(request);
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(JSON.parse(text)).toEqual({
        error: "Reliability PATCH body must be a JSON object.",
        code: "reliability_mutation_body_invalid"
      });
      expect(text).not.toContain(secretMarker);
      expectNoPatchStateEntry(isolated);
    }
  );

  it("rejects a body-less PATCH before JSON parsing, auth, or state entry", async () => {
    const isolated = await loadIsolatedPatchRoute({ enforceNotes: true });
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "PATCH",
      headers: { "content-type": "application/json" }
    });
    const parse = vi.spyOn(Request.prototype, "json");

    const response = await isolated.route.PATCH(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Reliability PATCH body must be a JSON object.",
      code: "reliability_mutation_body_invalid"
    });
    expect(parse).not.toHaveBeenCalled();
    expectNoPatchStateEntry(isolated);
  });

  it("fast-fails an oversized Content-Length before body parsing, auth/state entry, or body disclosure", async () => {
    const isolated = await loadIsolatedPatchRoute();
    const secretMarker = "round23-sensitive-review-body";
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "content-length": String(patchRequestByteLimit + 1)
      },
      body: JSON.stringify({ notes: `${secretMarker}${"x".repeat(patchRequestByteLimit)}` })
    });
    const parse = vi.fn(async () => ({ notes: secretMarker }));
    Object.defineProperty(request, "json", { value: parse });

    const response = await isolated.route.PATCH(request);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(text)).toEqual(transportError(patchRequestByteLimit + 1));
    expect(text).not.toContain(secretMarker);
    expect(parse).not.toHaveBeenCalled();
    expectNoPatchStateEntry(isolated);
  });

  it.each(["absent", "understated"] as const)(
    "caps a streamed PATCH with %s Content-Length before parsing or state entry",
    async (declaration) => {
      const isolated = await loadIsolatedPatchRoute();
      const request = streamedPatchRequest({
        chunks: [new Uint8Array(patchRequestByteLimit), new Uint8Array(1)],
        contentLength: declaration === "understated" ? 1 : undefined
      });
      const parse = vi.spyOn(Request.prototype, "json");

      const response = await isolated.route.PATCH(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(transportError(patchRequestByteLimit + 1));
      expect(parse).not.toHaveBeenCalled();
      expectNoPatchStateEntry(isolated);
    }
  );

  it("rejects one oversized yielded chunk before parsing or state entry", async () => {
    const isolated = await loadIsolatedPatchRoute();
    let yieldedChunks = 0;
    const request = streamedPatchRequest({
      chunks: [new Uint8Array(patchRequestByteLimit + 1)],
      onChunk: () => { yieldedChunks += 1; }
    });
    const parse = vi.spyOn(Request.prototype, "json");

    const response = await isolated.route.PATCH(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(transportError(patchRequestByteLimit + 1));
    expect(yieldedChunks).toBe(1);
    expect(parse).not.toHaveBeenCalled();
    expectNoPatchStateEntry(isolated);
  });

  it("rejects a zero-byte chunk storm before parsing or state entry", async () => {
    const isolated = await loadIsolatedPatchRoute();
    let yieldedChunks = 0;
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (yieldedChunks >= requestChunkLimit + 1) {
            controller.close();
            return;
          }
          yieldedChunks += 1;
          controller.enqueue(new Uint8Array(0));
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    const parse = vi.spyOn(Request.prototype, "json");

    const response = await isolated.route.PATCH(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(transportError(
      requestChunkLimit + 1,
      `request-chunk-count-at-most-${requestChunkLimit}`
    ));
    expect(yieldedChunks).toBe(requestChunkLimit + 1);
    expect(parse).not.toHaveBeenCalled();
    expectNoPatchStateEntry(isolated);
  });
});

function headerReadyReliabilityRun() {
  return {
    id: "rel_round23",
    projectId: "project_round23",
    status: "rejected" as const,
    meanPairwiseKappa: null,
    krippendorffAlphaNominal: null,
    adjudicationCoverage: { coverageRate: 0, unresolvedDisagreements: 1 }
  };
}

describe("reliability adjudication/review notes admission", () => {
  it("exports the 64 KiB PATCH and 8 KiB note contracts with a bounded 100-record copy budget", async () => {
    const runs = await import("../enterprise/reliability-runs") as Record<string, unknown>;

    expect(runs.SENA_RELIABILITY_PATCH_REQUEST_BYTE_LIMIT).toBe(patchRequestByteLimit);
    expect(runs.SENA_RELIABILITY_NOTE_BYTE_LIMIT).toBe(reliabilityNoteByteLimit);
    expect(
      Number(runs.SENA_RELIABILITY_NOTE_BYTE_LIMIT) *
      Number(runs.SENA_RELIABILITY_ADJUDICATION_REQUEST_LIMIT)
    ).toBe(819_200);
  });

  it("admits exactly 8192 UTF-8 bytes for both review and adjudication notes", async () => {
    const runs = await import("../enterprise/reliability-runs");
    const boundaryNotes = `${"界".repeat(2_730)}ab`;
    expect(new TextEncoder().encode(boundaryNotes)).toHaveLength(reliabilityNoteByteLimit);
    const reviewRun = vi.fn(() => headerReadyReliabilityRun());
    const adjudicate = vi.fn(() => ({
      reliabilityRun: headerReadyReliabilityRun(),
      adjudications: [],
      summary: {},
      reliabilityRunId: "rel_round23",
      projectId: "project_round23",
      teamId: "team_round23",
      decision: "include"
    }));

    runs.buildEnterpriseReliabilityRunReviewResponse(
      dummyContext as never,
      { runId: "rel_round23", status: "rejected", notes: boundaryNotes },
      reviewRun as never
    );
    runs.buildEnterpriseReliabilityAdjudicationResponse(
      dummyContext as never,
      { runId: "rel_round23", decision: "include", notes: boundaryNotes },
      adjudicate as never
    );

    expect(reviewRun).toHaveBeenCalledWith(expect.anything(), "rel_round23", expect.objectContaining({
      notes: boundaryNotes
    }));
    expect(adjudicate).toHaveBeenCalledWith(expect.anything(), "rel_round23", expect.objectContaining({
      notes: boundaryNotes
    }));
  });

  it("revalidates notes if a parsed mutation body is changed after its private WeakMap pin", async () => {
    const runs = await import("../enterprise/reliability-runs");
    const body = runs.parseSenaReliabilityMutationBody({
      runId: "rel_round23",
      status: "rejected",
      notes: "initially valid"
    });
    (body as { notes?: unknown }).notes = { secret: "round23-mutated-note-secret" };
    const sideEffect = vi.fn(() => {
      throw new Error("mutation adapter must not run after pinned body mutation");
    });

    expect(() => runs.buildEnterpriseReliabilityRunReviewResponse(
      dummyContext as never,
      body,
      sideEffect as never
    )).toThrow(expect.objectContaining({
      status: 400,
      code: "reliability_notes_invalid"
    }));
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it("rejects a post-pin notes accessor without invoking the getter or mutation adapter", async () => {
    const runs = await import("../enterprise/reliability-runs");
    const body = runs.parseSenaReliabilityMutationBody({
      runId: "rel_round23",
      status: "rejected",
      notes: "initially valid"
    });
    const notesGetter = vi.fn(() => ({ secret: "round23-accessor-note-secret" }));
    Object.defineProperty(body, "notes", {
      configurable: true,
      enumerable: true,
      get: notesGetter
    });
    const sideEffect = vi.fn(() => {
      throw new Error("mutation adapter must not run after pinned accessor replacement");
    });

    expect(() => runs.buildEnterpriseReliabilityRunReviewResponse(
      dummyContext as never,
      body,
      sideEffect as never
    )).toThrow(expect.objectContaining({
      status: 400,
      code: "reliability_notes_invalid"
    }));
    expect(notesGetter).not.toHaveBeenCalled();
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it("consumes an unchanged route-parser pin without a second UTF-8 normalization pass", async () => {
    const runs = await import("../enterprise/reliability-runs");
    const notes = "Round23 route-to-builder single-pass notes.";
    const byteLength = vi.spyOn(Buffer, "byteLength");
    const reviewRun = vi.fn(() => headerReadyReliabilityRun());
    try {
      const body = runs.parseSenaReliabilityMutationBody({
        runId: "rel_round23",
        status: "rejected",
        notes
      });
      runs.buildEnterpriseReliabilityRunReviewResponse(
        dummyContext as never,
        body,
        reviewRun as never
      );

      expect(byteLength.mock.calls.filter(([value]) => value === notes)).toHaveLength(1);
      expect(reviewRun).toHaveBeenCalledTimes(1);
    } finally {
      byteLength.mockRestore();
    }
  });

  it.each([
    ["review", (runs: typeof import("../enterprise/reliability-runs"), notes: unknown, sideEffect: ReturnType<typeof vi.fn>) => (
      runs.buildEnterpriseReliabilityRunReviewResponse(
        dummyContext as never,
        { runId: "rel_round23", status: "rejected", notes },
        sideEffect as never
      )
    )],
    ["adjudication", (runs: typeof import("../enterprise/reliability-runs"), notes: unknown, sideEffect: ReturnType<typeof vi.fn>) => (
      runs.buildEnterpriseReliabilityAdjudicationResponse(
        dummyContext as never,
        { runId: "rel_round23", decision: "include", notes },
        sideEffect as never
      )
    )]
  ] as const)("rejects oversized %s notes at the exact UTF-8 boundary before its mutation adapter", async (_kind, invoke) => {
    const runs = await import("../enterprise/reliability-runs");
    const sideEffect = vi.fn(() => {
      throw new Error("mutation adapter must not run for oversized notes");
    });
    const notes = `${"界".repeat(2_730)}abc`;
    expect(new TextEncoder().encode(notes)).toHaveLength(reliabilityNoteByteLimit + 1);

    expect(() => invoke(runs, notes, sideEffect)).toThrow(expect.objectContaining({
      status: 413,
      code: "reliability_notes_too_large",
      message: `Reliability notes must be at most ${reliabilityNoteByteLimit} UTF-8 bytes.`
    }));
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null, 400, "reliability_notes_invalid"],
    ["boolean", false, 400, "reliability_notes_invalid"],
    ["number", 0, 400, "reliability_notes_invalid"],
    ["object", {}, 400, "reliability_notes_invalid"],
    ["array", [], 400, "reliability_notes_invalid"],
    ["8193-byte Unicode string", `${"界".repeat(2_730)}abc`, 413, "reliability_notes_too_large"]
  ] as const)(
    "rejects %s notes before any async state read, write, audit, notification, or Postgres mirror",
    async (_label, notes, status, code) => {
      vi.resetModules();
      const readEnterpriseDb = vi.fn(() => {
        throw new Error("file state must not be read for invalid notes");
      });
      const readEnterpriseState = vi.fn(async () => {
        throw new Error("primary state must not be read for invalid notes");
      });
      const saveDb = vi.fn();
      const writeEnterpriseState = vi.fn();
      const appendAudit = vi.fn();
      const queueEnterpriseNotification = vi.fn();
      const reliabilityAdapter = vi.fn();
      const adjudicationAdapter = vi.fn();
      const resolveEnterprisePostgresConfig = vi.fn();
      vi.doMock("../enterprise/state", async () => ({
        ...await vi.importActual<typeof import("../enterprise/state")>("../enterprise/state"),
        readEnterpriseDb,
        readEnterpriseState,
        saveDb,
        writeEnterpriseState
      }));
      vi.doMock("../enterprise/ops-audit", async () => ({
        ...await vi.importActual<typeof import("../enterprise/ops-audit")>("../enterprise/ops-audit"),
        appendAudit
      }));
      vi.doMock("../enterprise/notifications-delivery", async () => ({
        ...await vi.importActual<typeof import("../enterprise/notifications-delivery")>("../enterprise/notifications-delivery"),
        queueEnterpriseNotification
      }));
      vi.doMock("../enterprise-postgres", async () => ({
        ...await vi.importActual<typeof import("../enterprise-postgres")>("../enterprise-postgres"),
        createEnterprisePostgresReliabilityRunAdapterFromEnv: reliabilityAdapter,
        createEnterprisePostgresAdjudicationAdapterFromEnv: adjudicationAdapter,
        resolveEnterprisePostgresConfig
      }));
      const runs = await import("../enterprise/reliability-runs");

      await expect(runs.buildEnterpriseReliabilityRunReviewResponseWithPostgresMirrorAsync(
        dummyContext as never,
        { runId: "rel_round23", status: "rejected", notes }
      )).rejects.toMatchObject({ status, code });
      await expect(runs.buildEnterpriseReliabilityAdjudicationResponseWithPostgresMirrorAsync(
        dummyContext as never,
        { runId: "rel_round23", decision: "include", notes }
      )).rejects.toMatchObject({ status, code });
      await expect(runs.reviewEnterpriseReliabilityRunWithPostgresMirrorAsync(
        dummyContext as never,
        "rel_round23",
        { status: "rejected", notes } as never
      )).rejects.toMatchObject({ status, code });
      await expect(runs.createEnterpriseReliabilityAdjudicationsWithPostgresMirrorAsync(
        dummyContext as never,
        "rel_round23",
        { decision: "include", notes } as never
      )).rejects.toMatchObject({ status, code });

      expect(readEnterpriseDb).not.toHaveBeenCalled();
      expect(readEnterpriseState).not.toHaveBeenCalled();
      expect(saveDb).not.toHaveBeenCalled();
      expect(writeEnterpriseState).not.toHaveBeenCalled();
      expect(appendAudit).not.toHaveBeenCalled();
      expect(queueEnterpriseNotification).not.toHaveBeenCalled();
      expect(reliabilityAdapter).not.toHaveBeenCalled();
      expect(adjudicationAdapter).not.toHaveBeenCalled();
      expect(resolveEnterprisePostgresConfig).not.toHaveBeenCalled();
    }
  );
});
