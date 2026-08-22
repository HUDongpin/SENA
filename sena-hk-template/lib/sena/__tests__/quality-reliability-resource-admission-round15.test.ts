import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const resourceLimits = {
  rawRows: 200_000,
  sources: 100,
  sourceBytes: 25 * 1024 * 1024,
  aggregateBytes: 100 * 1024 * 1024
} as const;

// Reuse one string across five sources so the aggregate contract is exercised
// without retaining five separate ~20 MiB fixture strings in the test process.
const aggregateJsonPadding = "x".repeat(Math.floor(resourceLimits.aggregateBytes / 5) + 1);

function resetReliabilityEnvironment() {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_JOB_QUEUE_ADAPTER;
  delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
  delete process.env.SENA_JOB_QUEUE_URL;
  delete process.env.SENA_JOB_QUEUE_SECRET;
  delete process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD;
}

function expectedLimitIssue(input: {
  path: "annotations" | "files" | "uploadIds";
  rule: string;
  actual: number | "safe-integer-overflow";
  maximum: number;
}) {
  return expect.objectContaining({
    name: "SenaReliabilityUniverseLimitError",
    status: 400,
    code: "reliability_universe_limit_exceeded",
    issues: [input]
  });
}

afterEach(() => {
  resetReliabilityEnvironment();
  vi.doUnmock("../reliability");
  vi.doUnmock("../enterprise/import-analysis");
  vi.doUnmock("@/lib/sena/enterprise/reliability-upload-reader");
  vi.doUnmock("@/lib/sena/import-adapters");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Round15 raw reliability admission", () => {
  it("rejects 200001 invalid JSON rows before the semantic parser or dashboard", async () => {
    vi.resetModules();
    const parseRows = vi.fn(() => {
      throw new Error("semantic reliability parser must not run");
    });
    const buildDashboard = vi.fn(() => {
      throw new Error("reliability dashboard must not run");
    });
    vi.doMock("../reliability", async () => ({
      ...await vi.importActual<typeof import("../reliability")>("../reliability"),
      parseCoderAnnotationsFromRows: parseRows,
      buildSenaReliabilityDashboard: buildDashboard
    }));
    const { prepareSenaReliabilityJsonRequest } = await import("../reliability-api");
    const rows = Array.from({ length: resourceLimits.rawRows + 1 }, () => ({}));

    expect(() => prepareSenaReliabilityJsonRequest({ annotations: rows })).toThrow(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it("counts invalid rows across every JSON file source before row flattening", async () => {
    vi.resetModules();
    const parseRows = vi.fn(() => {
      throw new Error("semantic reliability parser must not run");
    });
    const buildDashboard = vi.fn(() => {
      throw new Error("reliability dashboard must not run");
    });
    vi.doMock("../reliability", async () => ({
      ...await vi.importActual<typeof import("../reliability")>("../reliability"),
      parseCoderAnnotationsFromRows: parseRows,
      buildSenaReliabilityDashboard: buildDashboard
    }));
    const { prepareSenaReliabilityJsonRequest } = await import("../reliability-api");
    const firstRows = Array.from({ length: 100_001 }, () => ({}));
    const secondRows = Array.from({ length: 100_000 }, () => ({}));

    expect(() => prepareSenaReliabilityJsonRequest({
      files: [
        { name: "first.json", rows: firstRows },
        { name: "second.json", rows: secondRows }
      ]
    })).toThrow(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it("counts every supplied inline and file-backed JSON row even when one shape takes semantic precedence", async () => {
    vi.resetModules();
    const parseRows = vi.fn(() => {
      throw new Error("semantic reliability parser must not run");
    });
    const buildDashboard = vi.fn(() => {
      throw new Error("reliability dashboard must not run");
    });
    vi.doMock("../reliability", async () => ({
      ...await vi.importActual<typeof import("../reliability")>("../reliability"),
      parseCoderAnnotationsFromRows: parseRows,
      buildSenaReliabilityDashboard: buildDashboard
    }));
    const { prepareSenaReliabilityJsonRequest } = await import("../reliability-api");

    expect(() => prepareSenaReliabilityJsonRequest({
      files: [{
        name: "file-source.json",
        rows: Array.from({ length: 100_001 }, () => ({}))
      }],
      annotations: Array.from({ length: 100_000 }, () => ({}))
    })).toThrow(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it("rejects JSON file fan-out before source mapping, parsing, or dashboard work", async () => {
    vi.resetModules();
    const parseRows = vi.fn(() => {
      throw new Error("semantic reliability parser must not run");
    });
    const buildDashboard = vi.fn(() => {
      throw new Error("reliability dashboard must not run");
    });
    vi.doMock("../reliability", async () => ({
      ...await vi.importActual<typeof import("../reliability")>("../reliability"),
      parseCoderAnnotationsFromRows: parseRows,
      buildSenaReliabilityDashboard: buildDashboard
    }));
    const { prepareSenaReliabilityJsonRequest } = await import("../reliability-api");

    expect(() => prepareSenaReliabilityJsonRequest({
      files: Array.from({ length: resourceLimits.sources + 1 }, (_, index) => ({
        name: `source-${index}.json`,
        rows: [{}]
      }))
    })).toThrow(expectedLimitIssue({
      path: "files",
      rule: `source-count-at-most-${resourceLimits.sources}`,
      actual: resourceLimits.sources + 1,
      maximum: resourceLimits.sources
    }));
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "per-source",
      payload: {
        annotations: [{ padding: "x".repeat(resourceLimits.sourceBytes + 1) }]
      },
      rule: `source-byte-count-at-most-${resourceLimits.sourceBytes}`,
      maximum: resourceLimits.sourceBytes
    },
    {
      label: "aggregate",
      payload: {
        files: Array.from({ length: 5 }, (_, index) => ({
          name: `aggregate-${index}.json`,
          rows: [{ padding: aggregateJsonPadding }]
        }))
      },
      rule: `aggregate-source-byte-count-at-most-${resourceLimits.aggregateBytes}`,
      maximum: resourceLimits.aggregateBytes
    }
  ])("rejects JSON $label bytes before semantic parsing and source-summary hashing", async ({ payload, rule, maximum }) => {
    vi.resetModules();
    const parseRows = vi.fn(() => {
      throw new Error("semantic reliability parser must not run");
    });
    const buildDashboard = vi.fn(() => {
      throw new Error("reliability dashboard must not run");
    });
    vi.doMock("../reliability", async () => ({
      ...await vi.importActual<typeof import("../reliability")>("../reliability"),
      parseCoderAnnotationsFromRows: parseRows,
      buildSenaReliabilityDashboard: buildDashboard
    }));
    const { prepareSenaReliabilityJsonRequest } = await import("../reliability-api");
    let thrown: unknown;
    try {
      prepareSenaReliabilityJsonRequest(payload);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "SenaReliabilityUniverseLimitError",
      status: 400,
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: payload.files ? "files" : "annotations",
        rule,
        actual: expect.any(Number),
        maximum
      }]
    });
    const actual = (thrown as { issues?: Array<{ actual?: number }> } | undefined)?.issues?.[0]?.actual;
    expect(actual).toBeGreaterThan(maximum);
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it("rejects combined XLSX sheet rows immediately after decoding and before sheet flatMap", async () => {
    vi.resetModules();
    const firstRows = Array.from({ length: 100_001 }, () => ({}));
    const secondRows = Array.from({ length: 100_000 }, () => ({}));
    const workbookReader = vi.fn(async () => [
      { name: "First", rows: firstRows },
      { name: "Second", rows: secondRows }
    ]);
    vi.doMock("../excel-workbook", async () => ({
      ...await vi.importActual<typeof import("../excel-workbook")>("../excel-workbook"),
      readXlsxWorkbookRows: workbookReader
    }));
    const { readSenaReliabilityUploadRows } = await import("../import-adapters");
    const flatMap = vi.spyOn(Array.prototype, "flatMap");
    let thrown: unknown;
    try {
      await readSenaReliabilityUploadRows({ name: "oversized-sheets.xlsx", bytes: Buffer.from("xlsx") });
    } catch (error) {
      thrown = error;
    }
    const flatMapCalls = flatMap.mock.calls.length;
    flatMap.mockRestore();

    expect(thrown).toEqual(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
    expect(workbookReader).toHaveBeenCalledTimes(1);
    expect(flatMapCalls).toBe(0);
  });
});

describe("Round15 decoded reliability file row admission", () => {
  it("rejects every known local declared size before reading when another file has no size metadata", async () => {
    const oversizedRead = vi.fn(async () => "[]");
    const unknownSizeRead = vi.fn(async () => "[]");
    const { importSenaReliabilityFiles } = await import("../reliability-adapters");

    await expect(importSenaReliabilityFiles([
      {
        name: "declared-oversized.json",
        size: resourceLimits.sourceBytes + 1,
        text: oversizedRead,
        arrayBuffer: async () => new ArrayBuffer(0)
      },
      {
        name: "unknown-size.json",
        text: unknownSizeRead,
        arrayBuffer: async () => new ArrayBuffer(0)
      }
    ])).rejects.toEqual(expectedLimitIssue({
      path: "files",
      rule: `source-byte-count-at-most-${resourceLimits.sourceBytes}`,
      actual: resourceLimits.sourceBytes + 1,
      maximum: resourceLimits.sourceBytes
    }));
    expect(oversizedRead).not.toHaveBeenCalled();
    expect(unknownSizeRead).not.toHaveBeenCalled();
  });

  it("rejects combined file rows after decoding and before semantic parsing or broad row flatMap", async () => {
    vi.resetModules();
    const parseRows = vi.fn(() => {
      throw new Error("semantic reliability parser must not run");
    });
    const buildDashboard = vi.fn(() => {
      throw new Error("reliability dashboard must not run");
    });
    vi.doMock("../reliability", async () => ({
      ...await vi.importActual<typeof import("../reliability")>("../reliability"),
      parseCoderAnnotationsFromRows: parseRows,
      buildSenaReliabilityDashboard: buildDashboard
    }));
    const firstText = JSON.stringify(Array.from({ length: 100_001 }, () => ({})));
    const secondText = JSON.stringify(Array.from({ length: 100_000 }, () => ({})));
    const firstRead = vi.fn(async () => firstText);
    const secondRead = vi.fn(async () => secondText);
    const { importSenaReliabilityFiles } = await import("../reliability-adapters");
    const flatMap = vi.spyOn(Array.prototype, "flatMap");
    let thrown: unknown;
    try {
      await importSenaReliabilityFiles([
        {
          name: "first.json",
          size: Buffer.byteLength(firstText),
          text: firstRead,
          arrayBuffer: async () => new ArrayBuffer(0)
        },
        {
          name: "second.json",
          size: Buffer.byteLength(secondText),
          text: secondRead,
          arrayBuffer: async () => new ArrayBuffer(0)
        }
      ]);
    } catch (error) {
      thrown = error;
    }
    const flatMapCalls = flatMap.mock.calls.length;
    flatMap.mockRestore();

    expect(thrown).toEqual(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
    expect(firstRead).toHaveBeenCalledTimes(1);
    expect(secondRead).toHaveBeenCalledTimes(1);
    expect(flatMapCalls).toBe(0);
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });
});

type QueueMode = "local" | "managed";

async function runUploadPointerFanoutCase(mode: QueueMode) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round15-pointer-fanout-${mode}-`));
  let sessionToken = "";
  resetReliabilityEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = mode;
  if (mode === "local") {
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
  } else {
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "round15-pointer-fanout-secret";
  }
  const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.doMock("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
  vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
  vi.doMock("@/lib/sena/import", async () => await import("../import"));
  const pointerReader = vi.fn(async () => ({
    contents: [],
    parsedFiles: [],
    fileWarnings: [],
    parsed: { annotations: [], warnings: [], skippedCells: [] }
  }));
  vi.doMock("@/lib/sena/enterprise/reliability-upload-reader", async () => ({
    ...await vi.importActual<typeof import("../enterprise/reliability-upload-reader")>("../enterprise/reliability-upload-reader"),
    readEnterpriseReliabilityUploadPointers: pointerReader
  }));

  try {
    const enterprise = await import("../enterprise");
    const importAnalysis = await import("../enterprise/import-analysis");
    const jobs = await import("../enterprise/server-job-queue");
    const registered = enterprise.registerEnterpriseUser({
      name: `Round15 ${mode} pointer reviewer`,
      email: `round15-pointer-fanout-${mode}@example.edu`,
      password: "sena-secure-123",
      organization: "Round15 Reliability Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    const teamId = registered.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
    const uploadsBefore = importAnalysis.listEnterpriseUploads(registered.context, teamId);
    const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
    const route = await import("../../../app/api/sena/reliability/route");
    const response = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": csrf.token,
        prefer: "respond-async"
      },
      body: JSON.stringify({
        teamId,
        reviewer: "Round15 Pointer Reviewer",
        uploadIds: Array.from({ length: resourceLimits.sources + 1 }, (_, index) => `upl_over_limit_${index}`)
      })
    }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "SENA coding-reliability input exceeds the supported analysis universe.",
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "uploadIds",
        rule: `source-count-at-most-${resourceLimits.sources}`,
        actual: resourceLimits.sources + 1,
        maximum: resourceLimits.sources
      }]
    });
    expect(pointerReader).not.toHaveBeenCalled();
    expect(importAnalysis.listEnterpriseUploads(registered.context, teamId)).toEqual(uploadsBefore);
    expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
    expect(enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    resetReliabilityEnvironment();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

describe("Round15 queue pointer admission", () => {
  it.each(["local", "managed"] as const)(
    "rejects over-limit %s uploadIds without truncation or side effects",
    async (mode) => runUploadPointerFanoutCase(mode),
    30_000
  );

  it.each([
    {
      label: "per-source",
      uploads: [{
        id: "upl_oversized_metadata",
        originalName: "oversized.csv",
        size: resourceLimits.sourceBytes + 1
      }],
      rule: `source-byte-count-at-most-${resourceLimits.sourceBytes}`,
      maximum: resourceLimits.sourceBytes
    },
    {
      label: "aggregate",
      uploads: Array.from({ length: 5 }, (_, index) => ({
        id: `upl_aggregate_${index}`,
        originalName: `aggregate-${index}.csv`,
        size: Math.floor(resourceLimits.aggregateBytes / 5) + 1
      })),
      rule: `aggregate-source-byte-count-at-most-${resourceLimits.aggregateBytes}`,
      maximum: resourceLimits.aggregateBytes
    }
  ])("rejects pointer $label metadata bytes before decrypting or parsing upload contents", async ({ uploads, rule, maximum }) => {
    vi.resetModules();
    const metadataReader = vi.fn(async () => uploads);
    const contentReader = vi.fn(async () => {
      throw new Error("encrypted upload content must not be read");
    });
    vi.doMock("../enterprise/import-analysis", async () => ({
      ...await vi.importActual<typeof import("../enterprise/import-analysis")>("../enterprise/import-analysis"),
      readEnterpriseUploadMetadataAsync: metadataReader,
      readEnterpriseUploadContentsAsync: contentReader
    }));
    const { readEnterpriseReliabilityUploadPointers } = await import("../enterprise/reliability-upload-reader");
    let thrown: unknown;
    try {
      await readEnterpriseReliabilityUploadPointers({} as never, {
        teamId: "team-round15",
        uploadIds: uploads.map((upload) => upload.id)
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "SenaReliabilityUniverseLimitError",
      status: 400,
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "uploadIds",
        rule,
        actual: expect.any(Number),
        maximum
      }]
    });
    const actual = (thrown as { issues?: Array<{ actual?: number }> } | undefined)?.issues?.[0]?.actual;
    expect(actual).toBeGreaterThan(maximum);
    expect(metadataReader).toHaveBeenCalledTimes(1);
    expect(contentReader).not.toHaveBeenCalled();
  });
});

async function runMultipartAdmissionCase(input: {
  mode: QueueMode;
  kind: "count" | "declared-size" | "aggregate-size" | "combined-rows";
}) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round15-multipart-${input.mode}-${input.kind}-`));
  let sessionToken = "";
  resetReliabilityEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = input.mode;
  if (input.mode === "local") {
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
  } else {
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "round15-multipart-secret";
  }
  const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.doMock("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
    })
  }));
  vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
  vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
  vi.doMock("@/lib/sena/reliability-api", async () => await import("../reliability-api"));
  const semanticParser = vi.fn(() => {
    throw new Error("semantic reliability parser must not run");
  });
  if (input.kind === "combined-rows") {
    vi.doMock("@/lib/sena/reliability", async () => ({
      ...await vi.importActual<typeof import("../reliability")>("../reliability"),
      parseCoderAnnotationsFromRows: semanticParser
    }));
  } else {
    vi.doMock("@/lib/sena/reliability", async () => await import("../reliability"));
  }
  vi.doMock("@/lib/sena/import", async () => await import("../import"));
  const decodedRows = input.kind === "combined-rows"
    ? [
        Array.from({ length: 100_001 }, () => ({})),
        Array.from({ length: 100_000 }, () => ({}))
      ]
    : [];
  const reliabilityRowReader = vi.fn(async () => ({
    rows: decodedRows[reliabilityRowReader.mock.calls.length - 1] ?? [],
    warnings: []
  }));
  vi.doMock("@/lib/sena/import-adapters", async () => ({
    ...await vi.importActual<typeof import("../import-adapters")>("../import-adapters"),
    readSenaReliabilityUploadRows: reliabilityRowReader
  }));

  try {
    const enterprise = await import("../enterprise");
    const importAnalysis = await import("../enterprise/import-analysis");
    const jobs = await import("../enterprise/server-job-queue");
    const registered = enterprise.registerEnterpriseUser({
      name: `Round15 ${input.mode} multipart reviewer`,
      email: `round15-multipart-${input.mode}-${input.kind}@example.edu`,
      password: "sena-secure-123",
      organization: "Round15 Reliability Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    const teamId = registered.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
    const files = input.kind === "count"
      ? Array.from({ length: resourceLimits.sources + 1 }, (_, index) => (
          new File(["coder_id,item_id,code_id,value\n"], `ratings-${index}.csv`, { type: "text/csv" })
        ))
      : input.kind === "aggregate-size"
        ? Array.from({ length: 5 }, (_, index) => (
            new File(["coder_id,item_id,code_id,value\n"], `aggregate-size-${index}.csv`, { type: "text/csv" })
          ))
        : input.kind === "combined-rows"
        ? [
            new File(["coder_id,item_id,code_id,value\n"], `${input.kind}-first.csv`, { type: "text/csv" }),
            new File(["coder_id,item_id,code_id,value\n"], `${input.kind}-second.csv`, { type: "text/csv" })
          ]
        : [new File(["coder_id,item_id,code_id,value\n"], "declared-oversized.csv", { type: "text/csv" })];
    if (input.kind === "declared-size") {
      Object.defineProperty(files[0], "size", { value: resourceLimits.sourceBytes + 1, configurable: true });
    } else if (input.kind === "aggregate-size") {
      for (const file of files) {
        Object.defineProperty(file, "size", {
          value: Math.floor(resourceLimits.aggregateBytes / 5) + 1,
          configurable: true
        });
      }
    }
    const arrayBufferSpies = files.map((file) => vi.spyOn(file, "arrayBuffer"));
    const form = new FormData();
    form.set("teamId", teamId);
    form.set("reviewer", "Round15 Multipart Reviewer");
    form.set("queue", "true");
    for (const file of files) form.append("files", file);
    const uploadsBefore = importAnalysis.listEnterpriseUploads(registered.context, teamId);
    const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: { "x-sena-csrf-token": csrf.token }
    });
    Object.defineProperty(request, "formData", { value: vi.fn(async () => form) });
    const route = await import("../../../app/api/sena/reliability/route");
    const response = await route.POST(request);
    const body = await response.json() as Record<string, unknown>;
    const expected = input.kind === "count"
      ? {
          path: "files" as const,
          rule: `source-count-at-most-${resourceLimits.sources}`,
          actual: resourceLimits.sources + 1,
          maximum: resourceLimits.sources
        }
      : input.kind === "aggregate-size"
        ? {
            path: "files" as const,
            rule: `aggregate-source-byte-count-at-most-${resourceLimits.aggregateBytes}`,
            actual: resourceLimits.aggregateBytes + 5,
            maximum: resourceLimits.aggregateBytes
          }
        : input.kind === "combined-rows"
          ? {
              path: "annotations" as const,
              rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
              actual: resourceLimits.rawRows + 1,
              maximum: resourceLimits.rawRows
            }
          : {
          path: "files" as const,
          rule: `source-byte-count-at-most-${resourceLimits.sourceBytes}`,
          actual: resourceLimits.sourceBytes + 1,
          maximum: resourceLimits.sourceBytes
        };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "SENA coding-reliability input exceeds the supported analysis universe.",
      code: "reliability_universe_limit_exceeded",
      issues: [expected]
    });
    for (const arrayBufferSpy of arrayBufferSpies) {
      if (input.kind === "combined-rows") expect(arrayBufferSpy).toHaveBeenCalledTimes(1);
      else expect(arrayBufferSpy).not.toHaveBeenCalled();
    }
    if (input.kind === "combined-rows") {
      expect(reliabilityRowReader).toHaveBeenCalledTimes(2);
      expect(semanticParser).not.toHaveBeenCalled();
    } else {
      expect(reliabilityRowReader).not.toHaveBeenCalled();
    }
    expect(importAnalysis.listEnterpriseUploads(registered.context, teamId)).toEqual(uploadsBefore);
    expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
    expect(enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    resetReliabilityEnvironment();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

describe("Round15 multipart admission", () => {
  it("rejects managed multipart file fan-out before arrayBuffer, parsing, or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "managed", kind: "count" });
  }, 30_000);

  it("rejects local multipart declared size before arrayBuffer, parsing, or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "local", kind: "declared-size" });
  }, 30_000);

  it("rejects managed multipart aggregate declared size before arrayBuffer, parsing, or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "managed", kind: "aggregate-size" });
  }, 30_000);

  it("rejects combined multipart rows after decoding and before semantic parsing or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "managed", kind: "combined-rows" });
  }, 30_000);
});
