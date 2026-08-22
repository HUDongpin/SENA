import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { buildXlsxWorkbookBuffer } from "../excel-workbook";
import { parseSenaCsv } from "../import";
import {
  preflightSenaReliabilityJsonText,
  SenaReliabilityJsonPreflightScanner
} from "../reliability-json-preflight";
import * as xlsxPreflightModule from "../enterprise/reliability-xlsx-preflight";

function zipEndOfCentralDirectoryOffset(bytes: Buffer) {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("test ZIP EOCD not found");
}

function upgradeTestZipToZip64(bytes: Buffer) {
  const eocd = zipEndOfCentralDirectoryOffset(bytes);
  const entries = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  const prefix = bytes.subarray(0, eocd);
  const zip64 = Buffer.alloc(56);
  zip64.writeUInt32LE(0x06064b50, 0);
  zip64.writeBigUInt64LE(BigInt(44), 4);
  zip64.writeUInt16LE(45, 12);
  zip64.writeUInt16LE(45, 14);
  zip64.writeBigUInt64LE(BigInt(entries), 24);
  zip64.writeBigUInt64LE(BigInt(entries), 32);
  zip64.writeBigUInt64LE(BigInt(directorySize), 40);
  zip64.writeBigUInt64LE(BigInt(directoryOffset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(prefix.byteLength), 8);
  locator.writeUInt32LE(1, 16);
  const sentinelEocd = Buffer.alloc(22);
  sentinelEocd.writeUInt32LE(0x06054b50, 0);
  sentinelEocd.writeUInt16LE(0xffff, 8);
  sentinelEocd.writeUInt16LE(0xffff, 10);
  sentinelEocd.writeUInt32LE(0xffffffff, 12);
  sentinelEocd.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([prefix, zip64, locator, sentinelEocd]);
}

async function testZip(entries: Array<{ name: string; content: string }>) {
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.name, entry.content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
}

describe("reliability JSON structural preflight", () => {
  const preflight = (text: string, maximumRows = 2, maximumSources = 2) => {
    return preflightSenaReliabilityJsonText(text, { mode: "request", maximumRows, maximumSources });
  };

  it("counts escaped top-level aliases and rejects their third row before JSON.parse", () => {
    expect(() => preflight('{"\\u0061nnotations":[{"x":"},{"},{"x":[1,2,3]},{"x":3}]}')).toThrow(expect.objectContaining({
      code: "reliability_universe_limit_exceeded",
      issues: [{ path: "annotations", rule: "raw-row-count-at-most-2", actual: 3, maximum: 2 }]
    }));
  });

  it("charges every duplicate admission alias while ignoring punctuation and false keys inside strings", () => {
    expect(() => preflight('{"annotations":[1,2],"annotations":[{"text":"a,b,},{,[x],\\\"rows\\\":[1,2,3]"}]}'))
      .toThrow(expect.objectContaining({
        issues: [{ path: "annotations", rule: "raw-row-count-at-most-2", actual: 3, maximum: 2 }]
      }));
  });

  it("counts rows and sources across top-level files and every final source alias", () => {
    expect(() => preflight(JSON.stringify({
      files: [
        { rows: [{ id: 1 }], annotations: [{ id: 2 }] },
        { data: [{ id: 3 }] }
      ]
    }), 2, 2)).toThrow(expect.objectContaining({
      issues: [{ path: "annotations", rule: "raw-row-count-at-most-2", actual: 3, maximum: 2 }]
    }));
    expect(() => preflight(JSON.stringify({ files: [{ rows: [] }, { rows: [] }, { rows: [] }] }), 2, 2))
      .toThrow(expect.objectContaining({
        issues: [{ path: "files", rule: "source-count-at-most-2", actual: 3, maximum: 2 }]
      }));
  });

  it("preserves lexical state across UTF-8, unicode escape, number, literal, key, and array chunk boundaries", () => {
    const input = '{"\\u0061nnotations":[-1.25e+3,true,{"text":"雪\\\" evidence"}]}';
    const bytes = Buffer.from(input, "utf8");
    const snowStart = bytes.indexOf(Buffer.from("雪", "utf8"));
    const byteCuts = [2, 5, 8, 11, 17, 24, snowStart + 1, snowStart + 2, bytes.length - 3];
    const decoder = new TextDecoder("utf-8");
    const scanner = new SenaReliabilityJsonPreflightScanner({
      mode: "request",
      maximumRows: 3,
      maximumSources: 1
    });
    let start = 0;
    for (const end of byteCuts) {
      scanner.write(decoder.decode(bytes.subarray(start, end), { stream: true }));
      start = end;
    }
    scanner.write(decoder.decode(bytes.subarray(start), { stream: true }));
    scanner.write(decoder.decode());
    expect(scanner.finish()).toEqual({ rawRows: 3, sources: 1 });
  });

  it("does not retain a large scalar value while scanning bounded chunks", () => {
    const scanner = new SenaReliabilityJsonPreflightScanner({
      mode: "request",
      maximumRows: 1,
      maximumSources: 1
    });
    scanner.write('{"annotations":[{"padding":"');
    const chunk = "x".repeat(4_096);
    for (let index = 0; index < 1_024; index += 1) scanner.write(chunk);
    scanner.write('"}]}');
    expect(scanner.finish()).toEqual({ rawRows: 1, sources: 1 });
    const retainedStrings = Object.values(scanner as unknown as Record<string, unknown>)
      .filter((value): value is string => typeof value === "string");
    expect(Math.max(...retainedStrings.map((value) => value.length))).toBeLessThanOrEqual(32);
  });

  it.each(["rows", "annotations", "data"] as const)(
    "keeps source-mode %s arrays push/pop symmetric at empty and single-row boundaries",
    (alias) => {
      expect(preflightSenaReliabilityJsonText(JSON.stringify({ [alias]: [] }), {
        mode: "source",
        maximumRows: 1,
        maximumSources: 1
      })).toEqual({ rawRows: 0, sources: 1 });
      expect(preflightSenaReliabilityJsonText(JSON.stringify({ [alias]: [{ id: 1 }] }), {
        mode: "source",
        maximumRows: 1,
        maximumSources: 1
      })).toEqual({ rawRows: 1, sources: 1 });
    }
  );

  it("counts one physical source in source mode while charging every alias occurrence for rows", () => {
    expect(preflightSenaReliabilityJsonText(
      '{"annotations":[{}],"rows":[{}],"data":[{}],"rows":[]}',
      {
        mode: "source",
        maximumRows: 3,
        maximumSources: 1
      }
    )).toEqual({ rawRows: 3, sources: 1 });
  });
});

describe("reliability CSV scan-time row budget", () => {
  it("rejects the third data row while scanning and admits the exact boundary", () => {
    const onDataRowLimitExceeded = (actual: number, maximum: number) => {
      throw Object.assign(new Error("row budget"), { actual, maximum });
    };
    expect(() => parseSenaCsv("coder_id\nc1\nc2\nc3", {
      maximumDataRows: 2,
      onDataRowLimitExceeded
    } as never)).toThrow(expect.objectContaining({ actual: 3, maximum: 2 }));
    expect(parseSenaCsv("coder_id\nc1\nc2", {
      maximumDataRows: 2,
      onDataRowLimitExceeded
    } as never).rows).toHaveLength(2);
  });

  it("applies a prior-file remaining budget inside the production CSV decoder", async () => {
    const { readSenaReliabilityUploadRows } = await import("../enterprise/reliability-file-decoder");
    await expect(readSenaReliabilityUploadRows({
      name: "remaining.csv",
      bytes: Buffer.from("coder_id\nc1\nc2")
    }, { consumedRawRows: 199_999 })).rejects.toMatchObject({
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: "raw-row-count-at-most-200000",
        actual: 200_001,
        maximum: 200_000
      }]
    });
  });
});

describe("production JSON pre-parse admission", () => {
  it.each(["rows", "annotations", "data"] as const)(
    "admits a valid server JSON file through its %s alias and preserves the decoded row",
    async (alias) => {
      const { readSenaReliabilityUploadRows } = await import("../enterprise/reliability-file-decoder");
      const row = { coder_id: "c1", item_id: "i1", code_id: "Evidence", value: "1" };
      const decoded = await readSenaReliabilityUploadRows({
        name: `${alias}.json`,
        bytes: Buffer.from(JSON.stringify({ [alias]: [row] }), "utf8")
      });

      expect(decoded.rawRowCount).toBe(1);
      expect(decoded.rows).toEqual([row]);
    }
  );

  it("treats one server JSON file as one source even when raw alias keys repeat", async () => {
    const { readSenaReliabilityUploadRows } = await import("../enterprise/reliability-file-decoder");
    const duplicateAliases = Array.from({ length: 101 }, () => '"rows":[]').join(",");
    const decoded = await readSenaReliabilityUploadRows({
      name: "duplicate-aliases.json",
      bytes: Buffer.from(`{${duplicateAliases}}`, "utf8")
    });

    expect(decoded.rawRowCount).toBe(0);
    expect(decoded.rows).toEqual([]);
  });

  it("uses prior-file remaining rows and rejects before the server file JSON.parse", async () => {
    const { readSenaReliabilityUploadRows } = await import("../enterprise/reliability-file-decoder");
    const jsonParse = vi.spyOn(JSON, "parse");
    let thrown: unknown;
    try {
      await readSenaReliabilityUploadRows({
        name: "remaining.json",
        bytes: Buffer.from("[{},{}]")
      }, { consumedRawRows: 199_999 });
    } catch (error) {
      thrown = error;
    }
    const parseCalls = jsonParse.mock.calls.length;
    jsonParse.mockRestore();
    expect(thrown).toMatchObject({
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: "raw-row-count-at-most-200000",
        actual: 200_001,
        maximum: 200_000
      }]
    });
    expect(parseCalls).toBe(0);
  });

  it("rejects a direct transport body structurally before framework request.json", async () => {
    const transport = await import("../enterprise/reliability-transport");
    const body = `{"annotations":[${"null,".repeat(200_000)}null]}`;
    const frameworkParser = vi.fn(async (bounded: Request) => bounded.json());
    let thrown: unknown;
    try {
      const bounded = await transport.readSenaReliabilityBoundedTransportRequest(new Request(
        "https://sena.example.test/api/sena/reliability",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body
        }
      ), { json: true });
      await frameworkParser(bounded);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: "raw-row-count-at-most-200000",
        actual: 200_001,
        maximum: 200_000
      }]
    });
    expect(frameworkParser).not.toHaveBeenCalled();
  });
});

describe("queued reliability JSON envelope structural admission", () => {
  it("shares raw-row budget and rejects the second envelope before its JSON.parse", async () => {
    vi.resetModules();
    const uploadReader = await import("../enterprise/reliability-upload-reader");
    const { SENA_SCHEMA_VERSIONS } = await import("../schema-registry");
    const envelope = (rows: unknown[]) => Buffer.from(JSON.stringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityJsonSource,
      name: "queued.json",
      rows
    }));
    const contents = [
      {
        upload: { importProfile: uploadReader.SENA_RELIABILITY_JSON_QUEUE_UPLOAD_PROFILES.file },
        bytes: envelope(Array.from({ length: 100_001 }, () => null))
      },
      {
        upload: { importProfile: uploadReader.SENA_RELIABILITY_JSON_QUEUE_UPLOAD_PROFILES.file },
        bytes: envelope(Array.from({ length: 100_000 }, () => null))
      }
    ] as never;
    const jsonParse = vi.spyOn(JSON, "parse");
    let thrown: unknown;
    try {
      uploadReader.prepareEnterpriseReliabilityQueuedJsonUploads(contents, "Queue Reviewer");
    } catch (error) {
      thrown = error;
    }
    const parseCalls = jsonParse.mock.calls.length;
    jsonParse.mockRestore();

    expect(thrown).toMatchObject({
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: "raw-row-count-at-most-200000",
        actual: 200_001,
        maximum: 200_000
      }]
    });
    expect(parseCalls).toBe(1);
  });
});

describe("reliability XLSX pre-decompression budget", () => {
  const preflight = async (
    bytes: Buffer,
    limits: {
      maximumEntries?: number;
      maximumUncompressedBytes?: number;
      maximumDataRows?: number;
      maximumWorksheets?: number;
    }
  ) => {
    const fn = (xlsxPreflightModule as unknown as {
      preflightXlsxWorkbook?: (
        input: Buffer,
        options: typeof limits
      ) => Promise<unknown>;
    }).preflightXlsxWorkbook;
    expect(fn).toBeTypeOf("function");
    return fn!(bytes, limits);
  };

  it("rejects declared entry fan-out before constructing workbook entries", async () => {
    const bytes = await buildXlsxWorkbookBuffer([{ name: "A", rows: [{ value: 1 }] }]);
    await expect(preflight(bytes, { maximumEntries: 1 })).rejects.toMatchObject({
      kind: "entries",
      maximum: 1
    });
  });

  it("rejects actual uncompressed output and cumulative multi-sheet rows, with exact boundary admitted", async () => {
    const bytes = await buildXlsxWorkbookBuffer([
      { name: "First", rows: [{ value: 1 }, { value: 2 }] },
      { name: "Second", rows: [{ value: 3 }, { value: 4 }] }
    ]);
    await expect(preflight(bytes, { maximumUncompressedBytes: 8 })).rejects.toMatchObject({
      kind: "uncompressed-bytes",
      actual: 9,
      maximum: 8
    });
    await expect(preflight(bytes, { maximumDataRows: 3 })).rejects.toMatchObject({
      kind: "data-rows",
      actual: 4,
      maximum: 3
    });
    await expect(preflight(bytes, { maximumDataRows: 4 })).resolves.toMatchObject({ dataRows: 4 });
  });

  it("admits an exact central-entry boundary and rejects exact plus one before lazy entry construction", async () => {
    const bytes = await testZip([
      { name: "one.txt", content: "1" },
      { name: "two.txt", content: "2" }
    ]);
    await expect(preflight(bytes, { maximumEntries: 2 })).resolves.toMatchObject({ entries: 2 });
    await expect(preflight(bytes, { maximumEntries: 1 })).rejects.toMatchObject({
      kind: "entries",
      actual: 2,
      maximum: 1
    });
  });

  it("counts actual decompressed output even when ZIP metadata understates it", async () => {
    const content = "x".repeat(256 * 1024);
    const bytes = await testZip([{ name: "payload.bin", content }]);
    expect(bytes.byteLength).toBeLessThan(4_096);
    const forged = Buffer.from(bytes);
    const eocd = zipEndOfCentralDirectoryOffset(forged);
    const centralOffset = forged.readUInt32LE(eocd + 16);
    const localOffset = forged.readUInt32LE(centralOffset + 42);
    forged.writeUInt32LE(1, centralOffset + 24);
    forged.writeUInt32LE(1, localOffset + 22);

    await expect(preflight(forged, { maximumUncompressedBytes: 64 * 1024 })).rejects.toMatchObject({
      kind: "uncompressed-bytes",
      actual: 64 * 1024 + 1,
      maximum: 64 * 1024
    });
  });

  it("admits valid ZIP64 metadata and fails closed for multi-disk, truncated, and inconsistent directories", async () => {
    const standard = await testZip([{ name: "one.txt", content: "one" }]);
    await expect(preflight(upgradeTestZipToZip64(standard), { maximumEntries: 1 }))
      .resolves.toMatchObject({ entries: 1 });

    const multiDisk = Buffer.from(standard);
    multiDisk.writeUInt16LE(1, zipEndOfCentralDirectoryOffset(multiDisk) + 4);
    await expect(preflight(multiDisk, { maximumEntries: 1 })).rejects.toThrow(/Multi-disk/);

    await expect(preflight(standard.subarray(0, standard.byteLength - 7), { maximumEntries: 1 }))
      .rejects.toThrow(/end-of-central-directory/);

    const inconsistent = Buffer.from(standard);
    inconsistent.writeUInt16LE(0, zipEndOfCentralDirectoryOffset(inconsistent) + 10);
    await expect(preflight(inconsistent, { maximumEntries: 1 })).rejects.toThrow(/entry count is inconsistent/);
  });

  it("enforces worksheet exact and plus-one fan-out before ExcelJS", async () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: "<worksheet><sheetData><row r=\"1\"/></sheetData></worksheet>"
    }));
    const bytes = await testZip(entries);
    await expect(preflight(bytes, { maximumWorksheets: 101 })).resolves.toMatchObject({ worksheets: 101 });
    await expect(preflight(bytes, { maximumWorksheets: 100 })).rejects.toMatchObject({
      kind: "worksheets",
      actual: 101,
      maximum: 100
    });
  });
});

describe("reliability XLSX multi-file remaining budgets", () => {
  it("passes the second XLSX only the global remaining rows and stops before its regular decode", async () => {
    vi.resetModules();
    const actualPreflight = await vi.importActual<typeof import("../enterprise/reliability-xlsx-preflight")>(
      "../enterprise/reliability-xlsx-preflight"
    );
    const actualWorkbook = await vi.importActual<typeof import("../excel-workbook")>("../excel-workbook");
    const preflight = vi.fn(async (_bytes: Buffer, limits: { maximumDataRows?: number }) => {
      if (preflight.mock.calls.length === 1) {
        return { entries: 1, uncompressedBytes: 10, dataRows: 100_001, worksheets: 1 };
      }
      expect(limits.maximumDataRows).toBe(99_999);
      throw new actualPreflight.SenaXlsxWorkbookPreflightError("data-rows", 100_000, 99_999);
    });
    const regularReader = vi.fn(async () => []);
    vi.doMock("../excel-workbook", async () => ({
      ...actualWorkbook,
      readXlsxWorkbookRows: regularReader
    }));
    vi.doMock("../enterprise/reliability-xlsx-preflight", async () => ({
      ...actualPreflight,
      preflightXlsxWorkbook: preflight
    }));
    try {
      const { readSenaReliabilityUploadFiles } = await import("../enterprise/reliability-file-decoder");
      await expect(readSenaReliabilityUploadFiles([
        { name: "first.xlsx", bytes: Buffer.from("first") },
        { name: "second.xlsx", bytes: Buffer.from("second") }
      ])).rejects.toMatchObject({
        code: "reliability_universe_limit_exceeded",
        issues: [{
          path: "annotations",
          rule: "raw-row-count-at-most-200000",
          actual: 200_001,
          maximum: 200_000
        }]
      });
      expect(preflight).toHaveBeenCalledTimes(2);
      expect(regularReader).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("../excel-workbook");
      vi.doUnmock("../enterprise/reliability-xlsx-preflight");
      vi.resetModules();
    }
  });

  it("shares aggregate expanded bytes and gives the next XLSX only the remaining allowance", async () => {
    vi.resetModules();
    const actualPreflight = await vi.importActual<typeof import("../enterprise/reliability-xlsx-preflight")>(
      "../enterprise/reliability-xlsx-preflight"
    );
    const actualWorkbook = await vi.importActual<typeof import("../excel-workbook")>("../excel-workbook");
    const sourceMaximum = 25 * 1024 * 1024;
    const preflight = vi.fn(async (_bytes: Buffer, limits: { maximumUncompressedBytes?: number }) => {
      if (preflight.mock.calls.length <= 4) {
        expect(limits.maximumUncompressedBytes).toBe(sourceMaximum);
        return { entries: 1, uncompressedBytes: sourceMaximum, dataRows: 0, worksheets: 1 };
      }
      expect(limits.maximumUncompressedBytes).toBe(0);
      throw new actualPreflight.SenaXlsxWorkbookPreflightError("uncompressed-bytes", 1, 0);
    });
    const regularReader = vi.fn(async () => []);
    vi.doMock("../excel-workbook", async () => ({
      ...actualWorkbook,
      readXlsxWorkbookRows: regularReader
    }));
    vi.doMock("../enterprise/reliability-xlsx-preflight", async () => ({
      ...actualPreflight,
      preflightXlsxWorkbook: preflight
    }));
    try {
      const { readSenaReliabilityUploadFiles } = await import("../enterprise/reliability-file-decoder");
      await expect(readSenaReliabilityUploadFiles(Array.from({ length: 5 }, (_, index) => ({
        name: `expanded-${index + 1}.xlsx`,
        bytes: Buffer.from(String(index))
      })))).rejects.toMatchObject({
        code: "reliability_universe_limit_exceeded",
        issues: [{
          path: "files",
          rule: "aggregate-decoded-source-byte-count-at-most-104857600",
          actual: 104_857_601,
          maximum: 104_857_600
        }]
      });
      expect(preflight).toHaveBeenCalledTimes(5);
      expect(regularReader).toHaveBeenCalledTimes(4);
    } finally {
      vi.doUnmock("../excel-workbook");
      vi.doUnmock("../enterprise/reliability-xlsx-preflight");
      vi.resetModules();
    }
  });
});
