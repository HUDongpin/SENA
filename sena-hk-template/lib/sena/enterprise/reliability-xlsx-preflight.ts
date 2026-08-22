import JSZip from "jszip";
import { SaxesParser } from "saxes";

export type SenaXlsxWorkbookPreflightLimits = {
  maximumEntries?: number;
  maximumUncompressedBytes?: number;
  maximumDataRows?: number;
  maximumWorksheets?: number;
  maximumRowIndex?: number;
};

export type SenaXlsxWorkbookPreflight = {
  entries: number;
  uncompressedBytes: number;
  dataRows: number;
  worksheets: number;
};

export class SenaXlsxWorkbookPreflightError extends Error {
  readonly name = "SenaXlsxWorkbookPreflightError";

  constructor(
    readonly kind: "entries" | "uncompressed-bytes" | "data-rows" | "worksheets" | "row-index",
    readonly actual: number,
    readonly maximum: number
  ) {
    super(`XLSX ${kind} ${actual} exceeds the supported maximum of ${maximum}.`);
  }
}

function workbookBuffer(input: ArrayBuffer | Buffer | Uint8Array) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  return Buffer.from(input);
}

function checkedXlsxPreflightLimit(value: number | undefined, name: string) {
  const resolved = value ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new Error(`XLSX ${name} must be a non-negative safe integer.`);
  }
  return resolved;
}

function safeZip64Number(value: bigint, label: string) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`XLSX ZIP64 ${label} exceeds the JavaScript safe-integer range.`);
  }
  return Number(value);
}

/**
 * Reads and independently walks the central directory before JSZip constructs
 * one object per archive entry. This also rejects multi-disk and inconsistent
 * directory metadata instead of trusting an attacker-controlled EOCD count.
 */
function xlsxCentralDirectoryEntryCount(bytes: Buffer, maximumEntries: number) {
  const eocdMinimumSize = 22;
  const maximumCommentBytes = 65_535;
  let eocdOffset = -1;
  for (
    let cursor = bytes.length - eocdMinimumSize;
    cursor >= Math.max(0, bytes.length - eocdMinimumSize - maximumCommentBytes);
    cursor -= 1
  ) {
    if (bytes.readUInt32LE(cursor) === 0x06054b50) {
      const commentLength = bytes.readUInt16LE(cursor + 20);
      if (cursor + eocdMinimumSize + commentLength === bytes.length) {
        eocdOffset = cursor;
        break;
      }
    }
  }
  if (eocdOffset < 0) throw new Error("XLSX ZIP end-of-central-directory record is missing or invalid.");
  if (bytes.readUInt16LE(eocdOffset + 4) !== 0 || bytes.readUInt16LE(eocdOffset + 6) !== 0) {
    throw new Error("Multi-disk XLSX ZIP archives are not supported.");
  }

  let declaredEntries = bytes.readUInt16LE(eocdOffset + 10);
  let centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  let centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (declaredEntries === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    const locatorOffset = eocdOffset - 20;
    if (locatorOffset < 0 || bytes.readUInt32LE(locatorOffset) !== 0x07064b50) {
      throw new Error("XLSX ZIP64 locator is missing or invalid.");
    }
    if (bytes.readUInt32LE(locatorOffset + 4) !== 0 || bytes.readUInt32LE(locatorOffset + 16) !== 1) {
      throw new Error("Multi-disk XLSX ZIP64 archives are not supported.");
    }
    const zip64Offset = safeZip64Number(bytes.readBigUInt64LE(locatorOffset + 8), "directory offset");
    if (zip64Offset < 0 || zip64Offset + 56 > bytes.length || bytes.readUInt32LE(zip64Offset) !== 0x06064b50) {
      throw new Error("XLSX ZIP64 end-of-central-directory record is missing or invalid.");
    }
    if (bytes.readUInt32LE(zip64Offset + 16) !== 0 || bytes.readUInt32LE(zip64Offset + 20) !== 0) {
      throw new Error("Multi-disk XLSX ZIP64 archives are not supported.");
    }
    declaredEntries = safeZip64Number(bytes.readBigUInt64LE(zip64Offset + 32), "entry count");
    centralDirectorySize = safeZip64Number(bytes.readBigUInt64LE(zip64Offset + 40), "directory size");
    centralDirectoryOffset = safeZip64Number(bytes.readBigUInt64LE(zip64Offset + 48), "directory offset");
  }
  if (declaredEntries > maximumEntries) {
    throw new SenaXlsxWorkbookPreflightError("entries", declaredEntries, maximumEntries);
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (!Number.isSafeInteger(centralDirectoryEnd) || centralDirectoryOffset < 0 ||
    centralDirectoryEnd > eocdOffset || centralDirectoryEnd > bytes.length) {
    throw new Error("XLSX ZIP central-directory bounds are invalid.");
  }
  let cursor = centralDirectoryOffset;
  let walkedEntries = 0;
  while (cursor < centralDirectoryEnd) {
    if (cursor + 46 > centralDirectoryEnd || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("XLSX ZIP central-directory entry is invalid.");
    }
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (!Number.isSafeInteger(next) || next <= cursor || next > centralDirectoryEnd) {
      throw new Error("XLSX ZIP central-directory entry bounds are invalid.");
    }
    walkedEntries += 1;
    if (walkedEntries > maximumEntries) {
      throw new SenaXlsxWorkbookPreflightError("entries", walkedEntries, maximumEntries);
    }
    cursor = next;
  }
  if (cursor !== centralDirectoryEnd || walkedEntries !== declaredEntries) {
    throw new Error("XLSX ZIP central-directory entry count is inconsistent.");
  }
  return walkedEntries;
}

/**
 * Bounds archive fan-out, actual decompressed output, and worksheet row
 * objects before ExcelJS is allowed to materialize a workbook. This module is
 * deliberately imported only by the server reliability decoder: the generic
 * workbook reader remains client-safe and does not re-export this preflight.
 * JSZip only builds its lazy entry catalog after the independent central-
 * directory cap; every entry is then decompressed as a bounded stream.
 * Worksheet XML is fed through SAX so row counting does not require a DOM or
 * workbook object.
 */
export async function preflightXlsxWorkbook(
  input: ArrayBuffer | Buffer | Uint8Array,
  limits: SenaXlsxWorkbookPreflightLimits = {}
): Promise<SenaXlsxWorkbookPreflight> {
  const bytes = workbookBuffer(input);
  const maximumEntries = checkedXlsxPreflightLimit(limits.maximumEntries, "maximumEntries");
  const maximumUncompressedBytes = checkedXlsxPreflightLimit(
    limits.maximumUncompressedBytes,
    "maximumUncompressedBytes"
  );
  const maximumDataRows = checkedXlsxPreflightLimit(limits.maximumDataRows, "maximumDataRows");
  const maximumWorksheets = checkedXlsxPreflightLimit(limits.maximumWorksheets, "maximumWorksheets");
  const maximumRowIndex = checkedXlsxPreflightLimit(limits.maximumRowIndex ?? 1_048_576, "maximumRowIndex");
  const entries = xlsxCentralDirectoryEntryCount(bytes, maximumEntries);
  const archive = await JSZip.loadAsync(bytes);
  let uncompressedBytes = 0;
  let dataRows = 0;
  let worksheets = 0;

  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue;
    // Match the exact unanchored worksheet pattern used by ExcelJS 4.4.x.
    // Any archive entry the downstream decoder can materialize must be walked
    // here first, including a worksheet path embedded below another prefix.
    const isWorksheet = /xl\/worksheets\/sheet(\d+)\.xml/i.test(entry.name);
    let rowOrdinal = 0;
    let parser: SaxesParser | undefined;
    let decoder: TextDecoder | undefined;
    if (isWorksheet) {
      worksheets += 1;
      if (worksheets > maximumWorksheets) {
        throw new SenaXlsxWorkbookPreflightError("worksheets", worksheets, maximumWorksheets);
      }
      decoder = new TextDecoder("utf-8");
      parser = new SaxesParser();
      parser.on("opentag", (tag) => {
        const localName = tag.name.includes(":") ? tag.name.slice(tag.name.lastIndexOf(":") + 1) : tag.name;
        if (localName !== "row") return;
        rowOrdinal += 1;
        const rawRowNumber = typeof tag.attributes.r === "string" ? tag.attributes.r : undefined;
        const rowNumber = rawRowNumber && /^\d+$/.test(rawRowNumber) ? Number(rawRowNumber) : rowOrdinal;
        if (!Number.isSafeInteger(rowNumber) || rowNumber < 1 || rowNumber > maximumRowIndex) {
          throw new SenaXlsxWorkbookPreflightError(
            "row-index",
            Number.isSafeInteger(rowNumber) && rowNumber >= 0 ? rowNumber : maximumRowIndex + 1,
            maximumRowIndex
          );
        }
        if (rowNumber === 1) return;
        dataRows += 1;
        if (dataRows > maximumDataRows) {
          throw new SenaXlsxWorkbookPreflightError("data-rows", dataRows, maximumDataRows);
        }
      });
    }

    const stream = entry.nodeStream("nodebuffer") as NodeJS.ReadableStream & {
      destroy?: (cause?: Error) => void;
    };
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        if (typeof stream.destroy === "function") {
          stream.destroy(error instanceof Error ? error : undefined);
        }
        reject(error);
      };
      stream.on("data", (value: Buffer | Uint8Array) => {
        if (settled) return;
        try {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          if (chunk.byteLength > Number.MAX_SAFE_INTEGER - uncompressedBytes) {
            throw new SenaXlsxWorkbookPreflightError(
              "uncompressed-bytes",
              maximumUncompressedBytes + 1,
              maximumUncompressedBytes
            );
          }
          uncompressedBytes += chunk.byteLength;
          if (uncompressedBytes > maximumUncompressedBytes) {
            throw new SenaXlsxWorkbookPreflightError(
              "uncompressed-bytes",
              maximumUncompressedBytes + 1,
              maximumUncompressedBytes
            );
          }
          if (parser && decoder) parser.write(decoder.decode(chunk, { stream: true }));
        } catch (error) {
          fail(error);
        }
      });
      stream.on("error", fail);
      stream.on("end", () => {
        if (settled) return;
        try {
          if (parser && decoder) parser.write(decoder.decode()).close();
          settled = true;
          resolve();
        } catch (error) {
          fail(error);
        }
      });
      stream.resume();
    });
  }

  return { entries, uncompressedBytes, dataRows, worksheets };
}
