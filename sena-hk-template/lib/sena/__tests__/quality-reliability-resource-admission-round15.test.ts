import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";

const resourceLimits = {
  rawRows: 200_000,
  sources: 100,
  sourceBytes: 25 * 1024 * 1024,
  aggregateBytes: 100 * 1024 * 1024,
  requestBytes: 128 * 1024 * 1024,
  requestChunks: 8_192
} as const;

// Reuse one string across five sources so the aggregate contract is exercised
// without retaining five separate ~20 MiB fixture strings in the test process.
const aggregateJsonPadding = "x".repeat(Math.floor(resourceLimits.aggregateBytes / 5) + 1);

function round15ReliabilitySnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  return buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "Round15 reliability admission project",
    generatedAt: "2026-08-22T00:00:00.000Z",
    sourceDataset: imported.dataset
  });
}

function resetReliabilityEnvironment() {
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  delete process.env.SENA_JOB_QUEUE_ADAPTER;
  delete process.env.SENA_JOB_QUEUE_ALLOW_LOCAL;
  delete process.env.SENA_JOB_QUEUE_URL;
  delete process.env.SENA_JOB_QUEUE_SECRET;
  delete process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD;
  delete process.env.SENA_UPLOAD_MAX_BYTES;
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
      label: "invalid-alias-per-source",
      payload: {
        annotations: "x".repeat(resourceLimits.sourceBytes + 1)
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
    },
    {
      label: "invalid-envelope-aggregate",
      payload: {
        files: Array.from({ length: 5 }, (_, index) => ({
          name: `aggregate-envelope-${index}.json`,
          rows: [],
          padding: aggregateJsonPadding
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

  it("counts every server JSON object alias before selecting the canonical row table", async () => {
    const { readSenaReliabilityUploadRows } = await import("../import-adapters");
    const bytes = Buffer.from(JSON.stringify({
      annotations: [{ coder_id: "c1", item_id: "i1", code_id: "x", value: "1" }],
      rows: Array.from({ length: resourceLimits.rawRows }, () => ({}))
    }));

    await expect(readSenaReliabilityUploadRows({
      name: "mixed-aliases.json",
      bytes
    })).rejects.toEqual(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
  });

  it("treats a server JSON root annotation object as one raw semantic row", async () => {
    vi.resetModules();
    const { readSenaReliabilityUploadRows } = await import("../import-adapters");
    const reliability = await import("../reliability");
    const row = { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" };

    const decoded = await readSenaReliabilityUploadRows({
      name: "single-root-row.json",
      bytes: Buffer.from(JSON.stringify(row), "utf8")
    });
    const parsed = reliability.parseCoderAnnotationsFromRows(decoded.rows);

    expect(decoded.rawRowCount).toBe(1);
    expect(decoded.rows).toEqual([row]);
    expect(parsed.annotations).toEqual([{
      coderId: "c1",
      itemId: "u1",
      codeId: "Evidence",
      value: true
    }]);
  });
});

describe("Round15 decoded reliability file row admission", () => {
  it("counts every local JSON object alias before selecting the canonical row table", async () => {
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
    const text = JSON.stringify({
      rows: [{ coder_id: "c1", item_id: "i1", code_id: "x", value: "1" }],
      annotations: Array.from({ length: resourceLimits.rawRows }, () => ({}))
    });
    const read = vi.fn(async () => text);
    const { importSenaReliabilityFiles } = await import("../reliability-adapters");

    await expect(importSenaReliabilityFiles([{
      name: "local-mixed-aliases.json",
      size: new TextEncoder().encode(text).byteLength,
      text: read,
      arrayBuffer: async () => new ArrayBuffer(0)
    }])).rejects.toEqual(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
    expect(read).toHaveBeenCalledTimes(1);
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });

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

  it("counts primitive invalid JSON rows across local files before filtering or semantic parsing", async () => {
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
    const firstText = JSON.stringify(Array.from({ length: 100_001 }, () => null));
    const secondText = JSON.stringify(Array.from({ length: 100_000 }, () => null));
    const { importSenaReliabilityFiles } = await import("../reliability-adapters");

    await expect(importSenaReliabilityFiles([
      {
        name: "invalid-first.json",
        size: new TextEncoder().encode(firstText).byteLength,
        text: async () => firstText,
        arrayBuffer: async () => new ArrayBuffer(0)
      },
      {
        name: "invalid-second.json",
        size: new TextEncoder().encode(secondText).byteLength,
        text: async () => secondText,
        arrayBuffer: async () => new ArrayBuffer(0)
      }
    ])).rejects.toEqual(expectedLimitIssue({
      path: "annotations",
      rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
      actual: resourceLimits.rawRows + 1,
      maximum: resourceLimits.rawRows
    }));
    expect(parseRows).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });
});

type QueueMode = "local" | "managed";

async function runUploadPointerFanoutCase(
  mode: QueueMode,
  projectBound = false,
  sourceMode: "pointer-fanout" | "mixed-json-pointers" | "invalid-upload-id" = "pointer-fanout",
  queued = true
) {
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
    const project = projectBound ? enterprise.createEnterpriseProject(registered.context, {
      teamId,
      title: "Round15 pointer admission ordering",
      snapshot: round15ReliabilitySnapshot()
    }) : undefined;
    const uploadsBefore = importAnalysis.listEnterpriseUploads(registered.context, teamId);
    const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
    const route = await import("../../../app/api/sena/reliability/route");
    const response = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": csrf.token,
        ...(queued ? { prefer: "respond-async" } : {})
      },
      body: JSON.stringify({
        teamId,
        projectId: project?.id,
        reviewer: "Round15 Pointer Reviewer",
        files: sourceMode === "mixed-json-pointers"
          ? Array.from({ length: 60 }, (_, index) => ({ name: `inline-${index}.json`, rows: [] }))
          : undefined,
        uploadIds: sourceMode === "invalid-upload-id"
          ? ["upl_valid", "   "]
          : Array.from(
              { length: sourceMode === "mixed-json-pointers" ? 60 : resourceLimits.sources + 1 },
              (_, index) => `upl_over_limit_${index}`
            )
      })
    }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual(sourceMode === "mixed-json-pointers" || sourceMode === "invalid-upload-id" ? {
      error: "SENA coding-reliability request sources are invalid.",
      code: "invalid_sena_reliability_sources",
      issues: [{
        path: sourceMode === "mixed-json-pointers" ? "sources" : "uploadIds",
        rule: sourceMode === "mixed-json-pointers" ? "exactly-one-source-mode" : "non-empty-string-upload-id"
      }]
    } : {
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

  it("rejects project-bound pointer fan-out before audited project reads or reliability side effects", async () => {
    await runUploadPointerFanoutCase("managed", true);
  }, 30_000);

  it("rejects 60 JSON plus 60 pointer sources as mixed modes before project or queue side effects", async () => {
    await runUploadPointerFanoutCase("managed", true, "mixed-json-pointers");
  }, 30_000);

  it("rejects mixed JSON plus pointer sources even when synchronous execution was requested", async () => {
    await runUploadPointerFanoutCase("managed", true, "mixed-json-pointers", false);
  }, 30_000);

  it("rejects whitespace upload IDs instead of filtering them before project or queue side effects", async () => {
    await runUploadPointerFanoutCase("managed", true, "invalid-upload-id");
  }, 30_000);

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

async function runDeclaredTransportAdmissionCase(kind: "json" | "multipart") {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round15-transport-${kind}-`));
  let sessionToken = "";
  resetReliabilityEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
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

  try {
    const enterprise = await import("../enterprise");
    const importAnalysis = await import("../enterprise/import-analysis");
    const jobs = await import("../enterprise/server-job-queue");
    const registered = enterprise.registerEnterpriseUser({
      name: `Round15 ${kind} transport reviewer`,
      email: `round15-transport-${kind}@example.edu`,
      password: "sena-secure-123",
      organization: "Round15 Reliability Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    const teamId = registered.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
    const uploadsBefore = importAnalysis.listEnterpriseUploads(registered.context, teamId);
    const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: {
        "content-type": kind === "json" ? "application/json" : "multipart/form-data; boundary=round15",
        "content-length": String(resourceLimits.requestBytes + 1),
        "x-sena-csrf-token": csrf.token
      }
    });
    const transportParser = vi.fn(async () => {
      throw new Error("framework transport parser must not run after an oversized declaration");
    });
    Object.defineProperty(request, kind === "json" ? "json" : "formData", { value: transportParser });
    const route = await import("../../../app/api/sena/reliability/route");
    const response = await route.POST(request);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "SENA coding-reliability input exceeds the supported analysis universe.",
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: kind === "json" ? "annotations" : "files",
        rule: `request-byte-count-at-most-${resourceLimits.requestBytes}`,
        actual: resourceLimits.requestBytes + 1,
        maximum: resourceLimits.requestBytes
      }]
    });
    expect(transportParser).not.toHaveBeenCalled();
    expect(importAnalysis.listEnterpriseUploads(registered.context, teamId)).toEqual(uploadsBefore);
    expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
    expect(enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
  } finally {
    resetReliabilityEnvironment();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

async function runZeroByteChunkTransportAdmissionCase() {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-round15-transport-zero-chunks-"));
  let sessionToken = "";
  resetReliabilityEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
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

  try {
    const enterprise = await import("../enterprise");
    const importAnalysis = await import("../enterprise/import-analysis");
    const jobs = await import("../enterprise/server-job-queue");
    const registered = enterprise.registerEnterpriseUser({
      name: "Round15 zero-chunk transport reviewer",
      email: "round15-transport-zero-chunks@example.edu",
      password: "sena-secure-123",
      organization: "Round15 Reliability Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    const teamId = registered.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
    const uploadsBefore = importAnalysis.listEnterpriseUploads(registered.context, teamId);
    const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
    let emittedChunks = 0;
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": csrf.token
      },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emittedChunks >= 100_000) {
            controller.close();
            return;
          }
          emittedChunks += 1;
          controller.enqueue(new Uint8Array(0));
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    const transportParser = vi.spyOn(Request.prototype, "json").mockImplementation(async () => {
      throw new Error("framework transport parser must not run after the chunk budget is exhausted");
    });
    const route = await import("../../../app/api/sena/reliability/route");
    const response = await route.POST(request);
    const body = JSON.parse(await response.text()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "SENA coding-reliability input exceeds the supported analysis universe.",
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: `request-chunk-count-at-most-${resourceLimits.requestChunks}`,
        actual: resourceLimits.requestChunks + 1,
        maximum: resourceLimits.requestChunks
      }]
    });
    expect(transportParser).not.toHaveBeenCalled();
    expect(emittedChunks).toBeLessThan(100_000);
    expect(importAnalysis.listEnterpriseUploads(registered.context, teamId)).toEqual(uploadsBefore);
    expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
    expect(enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
  } finally {
    resetReliabilityEnvironment();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

describe("Round15 reliability transport admission", () => {
  it.each(["json", "multipart"] as const)(
    "rejects an oversized declared %s request before framework transport parsing or side effects",
    async (kind) => runDeclaredTransportAdmissionCase(kind),
    30_000
  );

  it.each(["absent", "understated"] as const)(
    "bounds the streamed request body when Content-Length is %s before the JSON transport parser",
    async (declaration) => {
      vi.resetModules();
      const transport = await import("../enterprise/reliability-transport");
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(4));
          controller.enqueue(new Uint8Array(5));
          controller.close();
        }
      });
      const headers = new Headers({ "content-type": "application/json" });
      if (declaration === "understated") headers.set("content-length", "4");
      const request = new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers,
        body: stream,
        duplex: "half"
      } as RequestInit & { duplex: "half" });
      const transportParser = vi.fn(async (bounded: Request) => bounded.json());
      let thrown: unknown;
      try {
        const bounded = await transport.readSenaReliabilityBoundedTransportRequest(request, {
          json: true,
          maximum: 8
        });
        await transportParser(bounded);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toEqual(expectedLimitIssue({
        path: "annotations",
        rule: "request-byte-count-at-most-8",
        actual: 9,
        maximum: 8
      }));
      expect(transportParser).not.toHaveBeenCalled();
    }
  );

  it("rejects 100000 zero-byte chunks under a one-byte budget before parsing or side effects", async () => {
    vi.resetModules();
    const transport = await import("../enterprise/reliability-transport");
    let emittedChunks = 0;
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emittedChunks >= 100_000) {
            controller.close();
            return;
          }
          emittedChunks += 1;
          controller.enqueue(new Uint8Array(0));
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    const transportParser = vi.fn(async (bounded: Request) => bounded.json());
    let thrown: unknown;
    try {
      const bounded = await transport.readSenaReliabilityBoundedTransportRequest(request, {
        json: true,
        maximum: 1
      });
      await transportParser(bounded);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(expectedLimitIssue({
      path: "annotations",
      rule: `request-chunk-count-at-most-${resourceLimits.requestChunks}`,
      actual: resourceLimits.requestChunks + 1,
      maximum: resourceLimits.requestChunks
    }));
    expect(transportParser).not.toHaveBeenCalled();
    expect(emittedChunks).toBeLessThan(100_000);
  });

  it("admits exactly 8192 chunks while replaying only non-empty JSON chunks", async () => {
    vi.resetModules();
    const transport = await import("../enterprise/reliability-transport");
    const encoder = new TextEncoder();
    let emittedChunks = 0;
    const request = new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emittedChunks >= resourceLimits.requestChunks) {
            controller.close();
            return;
          }
          const chunk = emittedChunks === 0
            ? encoder.encode("{")
            : emittedChunks === resourceLimits.requestChunks - 1
              ? encoder.encode("}")
              : new Uint8Array(0);
          emittedChunks += 1;
          controller.enqueue(chunk);
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    const transportParser = vi.fn(async (bounded: Request) => bounded.json());

    const bounded = await transport.readSenaReliabilityBoundedTransportRequest(request, {
      json: true,
      maximum: 2
    });

    await expect(transportParser(bounded)).resolves.toEqual({});
    expect(emittedChunks).toBe(resourceLimits.requestChunks);
    expect(transportParser).toHaveBeenCalledTimes(1);
  });

  it("returns the stable public 400 for a zero-byte chunk storm without reliability side effects", async () => {
    await runZeroByteChunkTransportAdmissionCase();
  }, 30_000);

  it("uses the lower configured upload cap for synchronous JSON before parsing or run persistence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-round15-json-configured-cap-"));
    let sessionToken = "";
    resetReliabilityEnvironment();
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_UPLOAD_MAX_BYTES = "8";
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

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Round15 configured JSON reviewer",
        email: "round15-configured-json@example.edu",
        password: "sena-secure-123",
        organization: "Round15 Reliability Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const teamId = registered.context.teams[0].id;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
      const runsBefore = enterprise.listEnterpriseReliabilityRuns(registered.context, {});
      const route = await import("../../../app/api/sena/reliability/route");
      const response = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId,
          annotations: [{ coder_id: "c1", item_id: "i1", code_id: "x", value: "1" }]
        })
      }));
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        error: "SENA coding-reliability input exceeds the supported analysis universe.",
        code: "reliability_universe_limit_exceeded",
        issues: [{
          path: "annotations",
          rule: "source-byte-count-at-most-8",
          actual: expect.any(Number),
          maximum: 8
        }]
      });
      expect(enterprise.listEnterpriseReliabilityRuns(registered.context, {})).toEqual(runsBefore);
      expect(enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
    } finally {
      resetReliabilityEnvironment();
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, 30_000);
});

const queuedJsonFilesParityPayload = {
  reviewer: "Round15 queued JSON files reviewer",
  files: [
    {
      name: "round15-coders-a.json",
      rows: [
        { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
        { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
        { coder_id: "c1", item_id: "u2", code_id: "Evidence", value: "" },
        { ignored: "invalid-row-must-remain-a-warning" }
      ]
    },
    {
      name: "round15-coders-b.json",
      data: [
        { coder_id: "c2", item_id: "u2", code_id: "Evidence", value: "0" }
      ]
    }
  ]
};

async function runQueuedJsonFilesParityCase(mode: "sync" | "local" | "managed") {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round15-json-files-${mode}-`));
  let sessionToken = "";
  let managedWebhook: { workerPayload?: unknown } | undefined;
  resetReliabilityEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  if (mode === "local") {
    process.env.SENA_JOB_QUEUE_ADAPTER = "local";
    process.env.SENA_JOB_QUEUE_ALLOW_LOCAL = "1";
  }
  if (mode === "managed") {
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "round15-json-files-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      managedWebhook = JSON.parse(String(init?.body ?? "{}")) as { workerPayload?: unknown };
      return new Response("", { status: 202 });
    }));
  }
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

  try {
    const enterprise = await import("../enterprise");
    const queue = await import("../enterprise/server-job-queue");
    const runtime = await import("../enterprise/server-job-worker-runtime");
    const reliabilityRuns = await import("../enterprise/reliability-runs");
    const registered = enterprise.registerEnterpriseUser({
      name: `Round15 JSON files ${mode} reviewer`,
      email: `round15-json-files-${mode}@example.edu`,
      password: "sena-secure-123",
      organization: "Round15 Reliability Lab",
      plan: "lab"
    });
    sessionToken = registered.token;
    const teamId = registered.context.teams[0].id;
    const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
    const route = await import("../../../app/api/sena/reliability/route");
    const response = await route.POST(new Request("https://sena.example.test/api/sena/reliability", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sena-csrf-token": csrf.token,
        ...(mode === "sync" ? {} : { prefer: "respond-async" })
      },
      body: JSON.stringify({
        ...queuedJsonFilesParityPayload,
        teamId
      })
    }));
    const responseBody = await response.json() as { id?: string };

    if (mode === "sync") {
      expect(response.status).toBe(200);
    } else {
      expect(response.status).toBe(202);
      if (mode === "local") {
        const drain = await runtime.drainEnterpriseServerJobQueue({ teamId, kind: "reliability" });
        expect(drain.succeeded).toBe(1);
      } else {
        expect(managedWebhook?.workerPayload).toBeDefined();
        const job = await queue.getEnterpriseServerJob(String(responseBody.id));
        const outcome = await runtime.runEnterpriseServerJob({
          job,
          workerPayload: managedWebhook?.workerPayload
        });
        expect(outcome.status).toBe("succeeded");
      }
    }

    const runs = await reliabilityRuns.listEnterpriseReliabilityRunsAsync(registered.context, { teamId });
    expect(runs).toHaveLength(1);
    const run = runs[0];
    return structuredClone({
      fileCount: run.fileCount,
      annotationCount: run.annotationCount,
      inputFiles: run.inputFiles,
      annotations: run.dashboard.derivationEvidence?.annotations,
      skippedCells: run.dashboard.derivationEvidence?.skippedCells,
      status: run.dashboard.status,
      meanPairwiseKappaStatus: run.dashboard.meanPairwiseKappaStatus,
      meanPairwiseKappa: run.dashboard.meanPairwiseKappa,
      krippendorffAlphaNominalStatus: run.dashboard.krippendorffAlphaNominalStatus,
      krippendorffAlphaNominal: run.dashboard.krippendorffAlphaNominal,
      pairwiseCohenKappa: run.dashboard.pairwiseCohenKappa,
      warnings: run.dashboard.warnings
    });
  } finally {
    resetReliabilityEnvironment();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  }
}

describe("Round15 queued JSON files parity", () => {
  it("reconstructs multiple inline aliases without inventing an ambiguous source name", async () => {
    const reliabilityApi = await import("../reliability-api");
    const uploadReader = await import("../enterprise/reliability-upload-reader");
    const defaultReviewer = "Round15 queued alias reviewer";
    const payload = {
      annotations: [
        { coder_id: "c1", item_id: "i1", code_id: "x", value: "1" },
        { coder_id: "c2", item_id: "i1", code_id: "x", value: "1" }
      ],
      rows: [{}],
      data: [{ ignored_alias_row: true }]
    };
    const expected = reliabilityApi.prepareSenaReliabilityJsonRequest(payload, { defaultReviewer });
    const uploads = uploadReader.buildEnterpriseReliabilityJsonQueueUploads(payload);
    const contents = uploads.map((upload) => ({
      upload: {
        importProfile: upload.importProfile,
        originalName: upload.name
      },
      bytes: upload.bytes
    })) as unknown as Parameters<typeof uploadReader.prepareEnterpriseReliabilityQueuedJsonUploads>[0];

    expect(uploadReader.prepareEnterpriseReliabilityQueuedJsonUploads(contents, defaultReviewer)).toEqual(expected);
  });

  it("preserves source summaries, skipped cells, warnings, annotations, and estimates in local and managed queues", async () => {
    const synchronous = await runQueuedJsonFilesParityCase("sync");
    const local = await runQueuedJsonFilesParityCase("local");
    const managed = await runQueuedJsonFilesParityCase("managed");

    expect(synchronous.skippedCells).toHaveLength(1);
    expect(synchronous.meanPairwiseKappaStatus).toBe("insufficient-pairable-units");
    expect(synchronous.meanPairwiseKappa).toBeNull();
    expect.soft(local).toEqual(synchronous);
    expect.soft(managed).toEqual(synchronous);
  }, 60_000);
});

describe("Round15 project-bound work admission ordering", () => {
  it("rejects the full inline algorithm budget before audited project reads or queue persistence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-round15-project-work-budget-"));
    let sessionToken = "";
    resetReliabilityEnvironment();
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "round15-project-work-secret";
    process.env.SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD = "1";
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

    try {
      const enterprise = await import("../enterprise");
      const importAnalysis = await import("../enterprise/import-analysis");
      const jobs = await import("../enterprise/server-job-queue");
      const registered = enterprise.registerEnterpriseUser({
        name: "Round15 project work reviewer",
        email: "round15-project-work@example.edu",
        password: "sena-secure-123",
        organization: "Round15 Reliability Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const teamId = registered.context.teams[0].id;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId,
        title: "Round15 project work ordering",
        snapshot: round15ReliabilitySnapshot()
      });
      const annotations = Array.from({ length: 200_000 }, (_, index) => ({
        coder_id: `c${index % 50}`,
        item_id: `i${Math.floor(index / 50)}`,
        code_id: "x",
        value: "1"
      }));
      const uploadsBefore = importAnalysis.listEnterpriseUploads(registered.context, teamId);
      const auditsBefore = enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events;
      const runsBefore = enterprise.listEnterpriseReliabilityRuns(registered.context, { projectId: project.id });
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
          projectId: project.id,
          reviewer: "Round15 project work reviewer",
          annotations
        })
      }));
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(400);
      expect(body).toEqual({
        error: "SENA coding-reliability input exceeds the supported analysis universe.",
        code: "reliability_universe_limit_exceeded",
        issues: [{
          path: "annotations",
          rule: "algorithm-work-evaluation-count-at-most-10000000",
          actual: 44_900_000,
          maximum: 10_000_000
        }]
      });
      expect(importAnalysis.listEnterpriseUploads(registered.context, teamId)).toEqual(uploadsBefore);
      expect((await jobs.listEnterpriseServerJobs({ teamId })).jobs).toHaveLength(0);
      expect(enterprise.listEnterpriseReliabilityRuns(registered.context, { projectId: project.id })).toEqual(runsBefore);
      expect(enterprise.listEnterpriseAuditLog(registered.context, { teamId, limit: 500 }).events).toEqual(auditsBefore);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      resetReliabilityEnvironment();
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, 30_000);

  it("rejects project-bound pointer metadata before audited project reads or reviewer persistence", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-round15-project-pointer-metadata-"));
    let sessionToken = "";
    resetReliabilityEnvironment();
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
    process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
    process.env.SENA_JOB_QUEUE_SECRET = "round15-project-pointer-secret";
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
    const pointerReader = vi.fn(async () => {
      const reliability = await import("../reliability");
      throw new reliability.SenaReliabilityUniverseLimitError([{
        path: "uploadIds",
        rule: `source-byte-count-at-most-${resourceLimits.sourceBytes}`,
        actual: resourceLimits.sourceBytes + 1,
        maximum: resourceLimits.sourceBytes
      }]);
    });
    vi.doMock("@/lib/sena/enterprise/reliability-upload-reader", async () => ({
      ...await vi.importActual<typeof import("../enterprise/reliability-upload-reader")>("../enterprise/reliability-upload-reader"),
      readEnterpriseReliabilityUploadPointers: pointerReader
    }));

    try {
      const enterprise = await import("../enterprise");
      const importAnalysis = await import("../enterprise/import-analysis");
      const jobs = await import("../enterprise/server-job-queue");
      const registered = enterprise.registerEnterpriseUser({
        name: "Round15 project pointer reviewer",
        email: "round15-project-pointer@example.edu",
        password: "sena-secure-123",
        organization: "Round15 Reliability Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const teamId = registered.context.teams[0].id;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const project = enterprise.createEnterpriseProject(registered.context, {
        teamId,
        title: "Round15 project pointer ordering",
        snapshot: round15ReliabilitySnapshot()
      });
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
          projectId: project.id,
          reviewer: "Round15 project pointer reviewer",
          uploadIds: ["upl_declared_oversized"]
        })
      }));
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(400);
      expect(body).toEqual({
        error: "SENA coding-reliability input exceeds the supported analysis universe.",
        code: "reliability_universe_limit_exceeded",
        issues: [{
          path: "uploadIds",
          rule: `source-byte-count-at-most-${resourceLimits.sourceBytes}`,
          actual: resourceLimits.sourceBytes + 1,
          maximum: resourceLimits.sourceBytes
        }]
      });
      expect(pointerReader).toHaveBeenCalledTimes(1);
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
  }, 30_000);
});

async function runMultipartAdmissionCase(input: {
  mode: QueueMode;
  kind: "count" | "non-file" | "declared-size" | "configured-size" | "aggregate-size" | "combined-rows" | "combined-invalid-rows";
}) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), `sena-round15-multipart-${input.mode}-${input.kind}-`));
  let sessionToken = "";
  resetReliabilityEnvironment();
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_JOB_QUEUE_ADAPTER = input.mode;
  if (input.kind === "configured-size") process.env.SENA_UPLOAD_MAX_BYTES = "8";
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
  if (input.kind === "combined-rows" || input.kind === "combined-invalid-rows") {
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
  const rawRowCounts = input.kind === "combined-invalid-rows" ? [100_001, 100_000] : [];
  const reliabilityRowReader = vi.fn(async () => {
    const index = reliabilityRowReader.mock.calls.length - 1;
    const rows = decodedRows[index] ?? [];
    return {
      rows,
      rawRowCount: rawRowCounts[index] ?? rows.length,
      warnings: []
    };
  });
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
    const project = enterprise.createEnterpriseProject(registered.context, {
      teamId,
      title: `Round15 ${input.kind} multipart admission project`,
      snapshot: round15ReliabilitySnapshot()
    });
    const files = input.kind === "non-file"
      ? []
      : input.kind === "count"
      ? Array.from({ length: resourceLimits.sources + 1 }, (_, index) => (
          new File(["coder_id,item_id,code_id,value\n"], `ratings-${index}.csv`, { type: "text/csv" })
        ))
      : input.kind === "aggregate-size"
        ? Array.from({ length: 5 }, (_, index) => (
            new File(["coder_id,item_id,code_id,value\n"], `aggregate-size-${index}.csv`, { type: "text/csv" })
          ))
        : input.kind === "combined-rows" || input.kind === "combined-invalid-rows"
        ? [
            new File(["coder_id,item_id,code_id,value\n"], `${input.kind}-first.csv`, { type: "text/csv" }),
            new File(["coder_id,item_id,code_id,value\n"], `${input.kind}-second.csv`, { type: "text/csv" })
          ]
        : [new File(["coder_id,item_id,code_id,value\n"], "declared-oversized.csv", { type: "text/csv" })];
    if (input.kind === "declared-size" || input.kind === "configured-size") {
      Object.defineProperty(files[0], "size", {
        value: input.kind === "configured-size" ? 9 : resourceLimits.sourceBytes + 1,
        configurable: true
      });
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
    form.set("projectId", project.id);
    form.set("reviewer", "Round15 Multipart Reviewer");
    form.set("queue", "true");
    if (input.kind === "non-file") form.append("files", "not-a-file");
    else for (const file of files) form.append("files", file);
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
      : input.kind === "non-file"
        ? {
            path: "files" as const,
            rule: "file-value-required"
          }
      : input.kind === "aggregate-size"
        ? {
            path: "files" as const,
            rule: `aggregate-source-byte-count-at-most-${resourceLimits.aggregateBytes}`,
            actual: resourceLimits.aggregateBytes + 5,
            maximum: resourceLimits.aggregateBytes
          }
        : input.kind === "combined-rows" || input.kind === "combined-invalid-rows"
          ? {
              path: "annotations" as const,
              rule: `raw-row-count-at-most-${resourceLimits.rawRows}`,
              actual: resourceLimits.rawRows + 1,
              maximum: resourceLimits.rawRows
            }
          : input.kind === "configured-size"
            ? {
                path: "files" as const,
                rule: "source-byte-count-at-most-8",
                actual: 9,
                maximum: 8
              }
          : {
          path: "files" as const,
          rule: `source-byte-count-at-most-${resourceLimits.sourceBytes}`,
          actual: resourceLimits.sourceBytes + 1,
          maximum: resourceLimits.sourceBytes
        };

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: input.kind === "non-file"
        ? "SENA coding-reliability request sources are invalid."
        : "SENA coding-reliability input exceeds the supported analysis universe.",
      code: input.kind === "non-file"
        ? "invalid_sena_reliability_sources"
        : "reliability_universe_limit_exceeded",
      issues: [expected]
    });
    for (const arrayBufferSpy of arrayBufferSpies) {
      if (input.kind === "combined-rows" || input.kind === "combined-invalid-rows") expect(arrayBufferSpy).toHaveBeenCalledTimes(1);
      else expect(arrayBufferSpy).not.toHaveBeenCalled();
    }
    if (input.kind === "combined-rows" || input.kind === "combined-invalid-rows") {
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

  it("rejects multipart non-File values instead of silently discarding them", async () => {
    await runMultipartAdmissionCase({ mode: "managed", kind: "non-file" });
  }, 30_000);

  it("rejects local multipart declared size before arrayBuffer, parsing, or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "local", kind: "declared-size" });
  }, 30_000);

  it("uses the lower configured upload cap before multipart buffering or parsing", async () => {
    await runMultipartAdmissionCase({ mode: "local", kind: "configured-size" });
  }, 30_000);

  it("rejects managed multipart aggregate declared size before arrayBuffer, parsing, or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "managed", kind: "aggregate-size" });
  }, 30_000);

  it("rejects combined multipart rows after decoding and before semantic parsing or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "managed", kind: "combined-rows" });
  }, 30_000);

  it("counts filtered invalid rows across multipart files before semantic parsing or side effects", async () => {
    await runMultipartAdmissionCase({ mode: "managed", kind: "combined-invalid-rows" });
  }, 30_000);
});
