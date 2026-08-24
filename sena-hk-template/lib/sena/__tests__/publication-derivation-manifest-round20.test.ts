import { createHash } from "node:crypto";
import JSZip from "jszip";
import { decodePDFRawStream, PDFDocument, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  reliabilityDashboardToReview
} from "../index";
import { readXlsxWorkbookRows } from "../excel-workbook";
import {
  buildSenaPublicationExport,
  type SenaPublicationDerivationManifest,
  type SenaPublicationFormat
} from "../publication-export";

const binaryFormats = new Set<SenaPublicationFormat>(["png", "xlsx", "docx", "pdf"]);

function readySnapshot() {
  const dataset = importSenaJsonContract(lessonStudySenaContract).dataset;
  return buildSenaProjectSnapshot(buildSenaModel(dataset), {
    title: "Self-contained Derivation Manifest",
    generatedAt: "2026-08-23T00:00:00.000Z",
    sourceDataset: dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Derivation manifest reviewer",
      interpretation: "Synthetic manifest fixture.",
      limitations: "Fixture only.",
      nextActions: "Retain the embedded derivation manifest with every artifact."
    },
    codingReliability: reliabilityDashboardToReview(buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
    ]), "Derivation manifest reviewer"),
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic publication derivation fixture only.",
      retentionPolicy: "Delete generated fixture artifacts after verification.",
      usageConstraints: ["Do not use as real participant evidence."],
      dataSteward: "Derivation manifest reviewer"
    }
  });
}

function decodeXmlText(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function manifestFromHtml(body: Buffer) {
  const match = /<script[^>]*data-sena-derivation-manifest[^>]*>([\s\S]*?)<\/script>/.exec(body.toString("utf8"));
  if (!match) throw new Error("HTML derivation manifest was not found.");
  return JSON.parse(match[1]) as SenaPublicationDerivationManifest;
}

function manifestFromSvg(body: Buffer) {
  const match = /<metadata id="sena-publication-derivation-manifest">([\s\S]*?)<\/metadata>/.exec(body.toString("utf8"));
  if (!match) throw new Error("SVG derivation manifest was not found.");
  return JSON.parse(decodeXmlText(match[1])) as SenaPublicationDerivationManifest;
}

function manifestFromPng(body: Buffer) {
  let offset = 8;
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset);
    const type = body.subarray(offset + 4, offset + 8).toString("ascii");
    const data = body.subarray(offset + 8, offset + 8 + length);
    if (type === "iTXt") {
      const keywordEnd = data.indexOf(0);
      const keyword = data.subarray(0, keywordEnd).toString("latin1");
      let cursor = keywordEnd + 3;
      cursor = data.indexOf(0, cursor) + 1;
      cursor = data.indexOf(0, cursor) + 1;
      if (keyword === "SENA Derivation Manifest") {
        return JSON.parse(data.subarray(cursor).toString("utf8")) as SenaPublicationDerivationManifest;
      }
    }
    offset += 12 + length;
  }
  throw new Error("PNG derivation manifest was not found.");
}

async function manifestFromXlsx(body: Buffer) {
  const sheets = await readXlsxWorkbookRows(body);
  const rows = sheets.find((sheet) => sheet.name === "Derivation Manifest")?.rows;
  const manifestJson = rows?.find((row) => row.key === "manifestJson")?.value;
  if (typeof manifestJson !== "string") throw new Error("XLSX derivation manifest was not found.");
  return JSON.parse(manifestJson) as SenaPublicationDerivationManifest;
}

async function manifestFromDocx(body: Buffer) {
  const zip = await JSZip.loadAsync(body);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("DOCX document XML was not found.");
  const text = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlText(match[1]))
    .join("");
  const match = /SENA_DERIVATION_MANIFEST_BEGIN([\s\S]*?)SENA_DERIVATION_MANIFEST_END/.exec(text);
  if (!match) throw new Error("DOCX derivation manifest was not found.");
  return JSON.parse(match[1]) as SenaPublicationDerivationManifest;
}

async function manifestFromPdf(body: Buffer) {
  const pdf = await PDFDocument.load(body);
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    try {
      const decoded = Buffer.from(decodePDFRawStream(object).decode()).toString("utf8");
      if (decoded.includes('"schemaVersion":"sena-publication-derivation-manifest/v2"')) {
        return JSON.parse(decoded) as SenaPublicationDerivationManifest;
      }
    } catch {
      // Non-manifest content streams can use encodings this probe does not need.
    }
  }
  throw new Error("PDF derivation manifest attachment was not found.");
}

async function extractManifest(format: SenaPublicationFormat, body: string | Buffer) {
  const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  if (format === "html") return manifestFromHtml(bytes);
  if (format === "svg") return manifestFromSvg(bytes);
  if (format === "png") return manifestFromPng(bytes);
  if (format === "xlsx") return manifestFromXlsx(bytes);
  if (format === "docx") return manifestFromDocx(bytes);
  if (format === "pdf") return manifestFromPdf(bytes);
  const parsed = JSON.parse(bytes.toString("utf8")) as { derivationManifest?: SenaPublicationDerivationManifest };
  if (!parsed.derivationManifest) throw new Error("Package derivation manifest was not found.");
  return parsed.derivationManifest;
}

describe("publication derivation manifest embedding", () => {
  it("makes every standalone format and every packaged artifact independently carry the same manifest", async () => {
    const snapshot = readySnapshot();
    const formats: SenaPublicationFormat[] = ["html", "svg", "png", "xlsx", "docx", "pdf"];
    let expected: SenaPublicationDerivationManifest | undefined;

    for (const format of formats) {
      const result = await buildSenaPublicationExport(snapshot, format);
      expect(binaryFormats.has(format)).toBe(Buffer.isBuffer(result.body));
      const embedded = await extractManifest(format, result.body);
      expect(embedded).toEqual(result.derivationManifest);
      expect(embedded).toEqual(expect.objectContaining({
        schemaVersion: "sena-publication-derivation-manifest/v2",
        sourceKind: "inline-snapshot",
        derivationKind: "inline-snapshot",
        manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(embedded.hashBoundaries).toEqual(expect.objectContaining({
        persistedSnapshotSha256: null,
        readProjectionSnapshotSha256: null,
        publicationSnapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(embedded.guardrails).toContain(
        "No persisted or read-projection snapshot hash is asserted for this standalone input; those boundaries are null."
      );
      expect(embedded.guardrails.join(" ")).not.toContain("raw stored evidence");
      const { manifestSha256, ...manifestCore } = embedded;
      expect(createHash("sha256").update(JSON.stringify(manifestCore), "utf8").digest("hex"))
        .toBe(manifestSha256);
      expected ??= embedded;
      expect(embedded).toEqual(expected);
    }

    const packageResult = await buildSenaPublicationExport(snapshot, "package");
    const packageBody = JSON.parse(String(packageResult.body)) as {
      derivationManifest: SenaPublicationDerivationManifest;
      artifacts: Array<{ format: SenaPublicationFormat; bodyBase64: string }>;
    };
    expect(packageBody.derivationManifest).toEqual(expected);
    expect(packageResult.derivationManifest).toEqual(expected);
    for (const artifact of packageBody.artifacts) {
      expect(await extractManifest(artifact.format, Buffer.from(artifact.bodyBase64, "base64"))).toEqual(expected);
    }
  }, 30_000);
});
