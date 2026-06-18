import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import * as XLSX from "xlsx";
import { buildSenaModel } from "./model";
import { buildSenaMarkdownReport } from "./report";
import type { SenaModel, SenaProjectSnapshot, SenaReport } from "./types";

export type SenaPublicationFormat = "html" | "svg" | "png" | "xlsx" | "docx" | "pdf" | "package";

export type SenaPublicationExport = {
  filename: string;
  contentType: string;
  body: string | Buffer;
};

export type SenaPublicationEnterpriseProjectEvidence = {
  schemaVersion: "sena-publication-enterprise-project-evidence/v1";
  projectId: string;
  teamId: string;
  currentVersion: number;
  title: string;
  activeWindowLabel: string;
  claimUse: string;
  sourceSnapshotSha256: string;
  reportSha256: string;
  claimPackage: {
    schemaVersion: "sena-enterprise-claim-evidence-package/v1";
    status: string;
    blockers: number;
    warnings: number;
    sourceSnapshotSha256: string;
  };
};

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function bodyBuffer(body: string | Buffer) {
  return typeof body === "string" ? Buffer.from(body, "utf8") : body;
}

function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Json(value: unknown) {
  return sha256Buffer(Buffer.from(JSON.stringify(value), "utf8"));
}

function snapshotDatasetCounts(snapshot: SenaProjectSnapshot) {
  return snapshot.source.sourceDatasetCounts ?? {
    people: snapshot.dataset.people.length,
    interactions: snapshot.dataset.interactions.length,
    utterances: snapshot.dataset.utterances.length,
    codedSegments: snapshot.dataset.coded_segments.length,
    codes: snapshot.dataset.codebook.length
  };
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const font5x7: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "(": ["00110", "01000", "10000", "10000", "10000", "01000", "00110"],
  ")": ["01100", "00010", "00001", "00001", "00001", "00010", "01100"],
  "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"]
};

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width: number, height: number, pixels: Buffer) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (width * 4 + 1);
    scanlines[scanlineOffset] = 0;
    pixels.copy(scanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

type Rgba = [number, number, number, number];

function fillRect(pixels: Buffer, width: number, height: number, x: number, y: number, rectWidth: number, rectHeight: number, color: Rgba) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + rectWidth));
  const endY = Math.min(height, Math.ceil(y + rectHeight));
  for (let row = startY; row < endY; row += 1) {
    for (let column = startX; column < endX; column += 1) {
      const offset = (row * width + column) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }
}

function drawText(pixels: Buffer, width: number, height: number, text: string, x: number, y: number, scale: number, color: Rgba) {
  let cursorX = x;
  for (const rawChar of text.toUpperCase()) {
    const glyph = font5x7[rawChar] ?? font5x7[" "];
    glyph.forEach((row, rowIndex) => {
      Array.from(row).forEach((value, columnIndex) => {
        if (value === "1") {
          fillRect(pixels, width, height, cursorX + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
        }
      });
    });
    cursorX += 6 * scale;
  }
}

function metricRows(model: SenaModel) {
  return [
    ["People", model.summary.people],
    ["Codes", model.summary.concepts],
    ["SNA ties", model.summary.socialEdges],
    ["ENA links", model.summary.conceptEdges],
    ["Bridge links", model.summary.bridgeEdges],
    ["G pairs", model.pairReport.filter((pair) => pair.totalContribution > 0).length],
    ["Density", Number(model.socialReport.graph.density.toFixed(4))],
    ["Average path", Number(model.socialReport.graph.averagePathLength.toFixed(4))]
  ] as Array<[string, string | number]>;
}

export function buildSenaPublicationSvg(model: SenaModel, title: string) {
  const rows = metricRows(model);
  const barMax = Math.max(...rows.map(([, value]) => Number(value) || 0), 1);
  const width = 920;
  const height = 190 + rows.length * 42;
  const bars = rows.map(([label, value], index) => {
    const y = 138 + index * 42;
    const numeric = Number(value) || 0;
    const barWidth = Math.max(4, (numeric / barMax) * 440);
    return `
      <text x="64" y="${y + 20}" font-size="18" font-weight="700" fill="#1f2937">${escapeXml(label)}</text>
      <rect x="230" y="${y}" width="${barWidth.toFixed(1)}" height="26" rx="4" fill="#56b09d"/>
      <text x="${250 + barWidth}" y="${y + 20}" font-size="16" font-weight="700" fill="#334155">${escapeXml(String(value))}</text>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="SENA publication summary">
  <rect width="${width}" height="${height}" fill="#f8fafc"/>
  <rect x="36" y="32" width="${width - 72}" height="${height - 64}" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="64" y="76" font-size="30" font-weight="800" fill="#111827">${escapeXml(title)}</text>
  <text x="64" y="106" font-size="15" font-weight="600" fill="#64748b">SENA publication export: social, epistemic, bridge, and person-code-pair summary.</text>
  ${bars}
  <text x="64" y="${height - 42}" font-size="13" fill="#64748b">Guardrail: descriptive analytics; report coding reliability, human review, and method settings with any claim.</text>
</svg>`;
}

export function buildSenaPublicationPng(model: SenaModel, title: string) {
  const rows = metricRows(model);
  const barMax = Math.max(...rows.map(([, value]) => Number(value) || 0), 1);
  const width = 1200;
  const height = 760;
  const pixels = Buffer.alloc(width * height * 4);
  fillRect(pixels, width, height, 0, 0, width, height, [248, 250, 252, 255]);
  fillRect(pixels, width, height, 44, 42, width - 88, height - 84, [255, 255, 255, 255]);
  fillRect(pixels, width, height, 44, 42, width - 88, 2, [203, 213, 225, 255]);
  fillRect(pixels, width, height, 44, height - 44, width - 88, 2, [203, 213, 225, 255]);
  fillRect(pixels, width, height, 44, 42, 2, height - 84, [203, 213, 225, 255]);
  fillRect(pixels, width, height, width - 46, 42, 2, height - 84, [203, 213, 225, 255]);
  fillRect(pixels, width, height, 72, 84, 12, 86, [86, 176, 157, 255]);

  drawText(pixels, width, height, title.slice(0, 42), 104, 78, 5, [17, 24, 39, 255]);
  drawText(pixels, width, height, "SENA PUBLICATION EXPORT", 108, 130, 3, [71, 85, 105, 255]);
  drawText(pixels, width, height, "SOCIAL  EPISTEMIC  BRIDGE  G-PAIR SUMMARY", 108, 160, 2, [100, 116, 139, 255]);

  rows.forEach(([label, value], index) => {
    const y = 230 + index * 52;
    const numeric = Number(value) || 0;
    const barWidth = Math.max(8, (numeric / barMax) * 570);
    fillRect(pixels, width, height, 320, y + 5, 600, 26, [226, 232, 240, 255]);
    fillRect(pixels, width, height, 320, y + 5, barWidth, 26, [86, 176, 157, 255]);
    fillRect(pixels, width, height, 320, y + 5, 2, 26, [20, 83, 78, 255]);
    drawText(pixels, width, height, label, 104, y, 3, [31, 41, 55, 255]);
    drawText(pixels, width, height, String(value), 944, y, 3, [51, 65, 85, 255]);
  });

  drawText(pixels, width, height, "GUARDRAIL: DESCRIPTIVE ANALYTICS. REPORT CODING RELIABILITY AND HUMAN REVIEW.", 104, 686, 2, [100, 116, 139, 255]);
  return encodePng(width, height, pixels);
}

export function buildSenaPublicationHtml(report: SenaReport) {
  const markdown = buildSenaMarkdownReport(report);
  const body = markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeXml(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${escapeXml(line.slice(3))}</h2>`;
      if (line.startsWith("- ")) return `<li>${escapeXml(line.slice(2))}</li>`;
      if (!line.trim()) return "";
      return `<p>${escapeXml(line)}</p>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(report.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 48px; color: #172033; line-height: 1.55; }
    h1 { font-size: 30px; margin-bottom: 4px; }
    h2 { margin-top: 28px; border-bottom: 1px solid #d7dee8; padding-bottom: 6px; }
    p, li { font-size: 13px; }
    li { margin: 4px 0; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function worksheetFromRows(rows: Array<Record<string, string | number | boolean | null>>) {
  return XLSX.utils.json_to_sheet(rows);
}

export function buildSenaPublicationWorkbook(model: SenaModel, report: SenaReport) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows(metricRows(model).map(([metric, value]) => ({ metric, value }))), "Summary");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows([
    {
      gate: "Claim readiness",
      schemaVersion: report.claimReadinessGate.schemaVersion,
      status: report.claimReadinessGate.status,
      claimUse: report.claimReadinessGate.claimUse,
      blockers: report.claimReadinessGate.blockers.join("; "),
      guardrail: report.claimReadinessGate.guardrail
    },
    {
      gate: "Completeness",
      schemaVersion: report.completenessAudit.schemaVersion,
      status: report.completenessAudit.status,
      passed: report.completenessAudit.passed,
      reviewNeeded: report.completenessAudit.reviewNeeded,
      blockers: report.completenessAudit.items.filter((item) => item.status === "review").map((item) => item.label).join("; ")
    },
    {
      gate: "Human review",
      schemaVersion: "sena-human-review/v1",
      status: report.humanReview.status,
      reviewer: report.humanReview.reviewer,
      reviewedAt: report.humanReview.reviewedAt,
      blockers: report.humanReview.status === "human-reviewed" ? "" : "human review not completed"
    }
  ]), "Claim readiness");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows([
    {
      schemaVersion: report.codingReliabilityGate.schemaVersion,
      status: report.codingReliabilityGate.status,
      claimUse: report.codingReliabilityGate.claimUse,
      reviewer: report.codingReliabilityGate.review.reviewer,
      reviewedAt: report.codingReliabilityGate.review.reviewedAt,
      codingScheme: report.codingReliabilityGate.review.codingScheme,
      unitOfCoding: report.codingReliabilityGate.review.unitOfCoding,
      coderCount: report.codingReliabilityGate.review.coderCount,
      agreementMetric: report.codingReliabilityGate.review.agreementMetric,
      agreementValue: report.codingReliabilityGate.review.agreementValue,
      adjudicationNotes: report.codingReliabilityGate.review.adjudicationNotes,
      blockers: report.codingReliabilityGate.blockers.join("; "),
      guardrail: report.codingReliabilityGate.guardrail
    }
  ]), "Coding reliability");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows([
    {
      schemaVersion: report.dataGovernance.schemaVersion,
      status: report.dataGovernance.status,
      irbApprovalId: report.dataGovernance.irbApprovalId,
      consentScope: report.dataGovernance.consentScope,
      retentionPolicy: report.dataGovernance.retentionPolicy,
      usageConstraints: report.dataGovernance.usageConstraints.join("; "),
      dataSteward: report.dataGovernance.dataSteward,
      reviewedAt: report.dataGovernance.reviewedAt,
      blockers: report.dataGovernance.blockers.join("; "),
      guardrail: report.dataGovernance.guardrail
    }
  ]), "Data governance");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows(report.fusionMathAudit.matrixFingerprints.map((fingerprint) => ({
    id: fingerprint.id,
    label: fingerprint.label,
    shape: fingerprint.shape,
    checksumAlgorithm: fingerprint.checksumAlgorithm,
    checksum: fingerprint.checksum,
    valueKinds: fingerprint.valueKinds.join("|"),
    rawTotal: fingerprint.totals.raw ?? null,
    normalizedTotal: fingerprint.totals.normalized ?? null,
    valuesTotal: fingerprint.totals.values ?? null,
    rawNonZero: fingerprint.nonZero.raw ?? null,
    normalizedNonZero: fingerprint.nonZero.normalized ?? null,
    valuesNonZero: fingerprint.nonZero.values ?? null
  }))), "Matrix fingerprints");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows(report.evidenceSnippets.slice(0, 80).map((snippet, index) => ({
    index: index + 1,
    activeWindow: report.analysisWindow?.label ?? "Full conversation",
    source: snippet.source,
    sourceId: snippet.sourceId,
    sourceLabel: snippet.sourceLabel,
    evidenceId: snippet.id,
    stage: snippet.stage,
    personId: snippet.personId ?? null,
    label: snippet.label,
    codes: snippet.codes?.join("|") ?? "",
    text: snippet.text,
    lineageTable: snippet.lineage?.table ?? null,
    lineageRowId: snippet.lineage?.rowId ?? null
  }))), "Evidence snippets");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows(model.socialReport.actors.map((actor) => ({
    id: actor.id,
    label: actor.label,
    degree: actor.degree,
    strength: actor.strength,
    closeness: actor.closeness,
    component: actor.component,
    community: actor.community
  }))), "SNA actors");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows(model.pairReport.map((pair) => ({
    pair: pair.label,
    totalContribution: pair.totalContribution,
    contributors: pair.topContributors.map((contributor) => `${contributor.label}:${contributor.weight}`).join("; ")
  }))), "G pairs");
  XLSX.utils.book_append_sheet(workbook, worksheetFromRows(report.validation.metricProvenance.map((metric) => ({
    metric: metric.label,
    source: metric.source,
    parityStatus: metric.parityStatus,
    interpretationLimit: metric.interpretationLimit
  }))), "Metric provenance");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

export async function buildSenaPublicationDocx(model: SenaModel, report: SenaReport) {
  const document = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
        new Paragraph({
          children: [new TextRun({ text: "SENA publication report", bold: true }), new TextRun(" generated from the enterprise export API.")]
        }),
        new Paragraph({ text: "Summary Metrics", heading: HeadingLevel.HEADING_1 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: metricRows(model).map(([metric, value]) => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(String(metric))] }),
              new TableCell({ children: [new Paragraph(String(value))] })
            ]
          }))
        }),
        new Paragraph({ text: "Claim Readiness", heading: HeadingLevel.HEADING_1 }),
        new Paragraph(`Status: ${report.claimReadinessGate.status}; use: ${report.claimReadinessGate.claimUse}`),
        new Paragraph({ text: "Guardrail", heading: HeadingLevel.HEADING_1 }),
        new Paragraph("SENA outputs are descriptive analytics. Include coding reliability, human review, runtime provenance, and method settings with any publication-facing interpretation.")
      ]
    }]
  });
  return Buffer.from(await Packer.toBuffer(document));
}

export async function buildSenaPublicationPdf(model: SenaModel, report: SenaReport) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const { height } = page.getSize();
  let y = height - 56;

  page.drawText(report.title.slice(0, 82), { x: 48, y, size: 18, font: bold, color: rgb(0.07, 0.1, 0.18) });
  y -= 32;
  page.drawText("SENA publication summary", { x: 48, y, size: 11, font, color: rgb(0.35, 0.41, 0.5) });
  y -= 34;

  for (const [metric, value] of metricRows(model)) {
    page.drawText(metric, { x: 56, y, size: 11, font: bold, color: rgb(0.12, 0.16, 0.22) });
    page.drawText(String(value), { x: 260, y, size: 11, font, color: rgb(0.12, 0.16, 0.22) });
    y -= 22;
  }

  y -= 18;
  page.drawText("Claim readiness", { x: 48, y, size: 13, font: bold, color: rgb(0.07, 0.1, 0.18) });
  y -= 22;
  page.drawText(`${report.claimReadinessGate.status}; ${report.claimReadinessGate.claimUse}`.slice(0, 95), { x: 56, y, size: 10, font, color: rgb(0.12, 0.16, 0.22) });
  y -= 36;
  page.drawText("Guardrail", { x: 48, y, size: 13, font: bold, color: rgb(0.07, 0.1, 0.18) });
  y -= 22;
  page.drawText("Descriptive analytics only until coding reliability, human review, and method settings are documented.", {
    x: 56,
    y,
    size: 9,
    font,
    color: rgb(0.35, 0.41, 0.5)
  });

  return Buffer.from(await pdf.save());
}

const packagedPublicationFormats = ["svg", "png", "html", "xlsx", "docx", "pdf"] as const;

type PackagedPublicationFormat = typeof packagedPublicationFormats[number];

async function buildSingleSenaPublicationExport(
  model: SenaModel,
  report: SenaReport,
  safeTitle: string,
  format: PackagedPublicationFormat
): Promise<SenaPublicationExport> {
  if (format === "svg") {
    return {
      filename: `${safeTitle}.svg`,
      contentType: "image/svg+xml; charset=utf-8",
      body: buildSenaPublicationSvg(model, report.title)
    };
  }
  if (format === "png") {
    return {
      filename: `${safeTitle}.png`,
      contentType: "image/png",
      body: buildSenaPublicationPng(model, report.title)
    };
  }
  if (format === "html") {
    return {
      filename: `${safeTitle}.html`,
      contentType: "text/html; charset=utf-8",
      body: buildSenaPublicationHtml(report)
    };
  }
  if (format === "xlsx") {
    return {
      filename: `${safeTitle}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: buildSenaPublicationWorkbook(model, report)
    };
  }
  if (format === "docx") {
    return {
      filename: `${safeTitle}.docx`,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: await buildSenaPublicationDocx(model, report)
    };
  }
  return {
    filename: `${safeTitle}.pdf`,
    contentType: "application/pdf",
    body: await buildSenaPublicationPdf(model, report)
  };
}

export async function buildSenaPublicationPackage(
  model: SenaModel,
  report: SenaReport,
  safeTitle: string,
  snapshot?: SenaProjectSnapshot,
  enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence
) {
  const artifacts = await Promise.all(packagedPublicationFormats.map(async (format) => {
    const exportArtifact = await buildSingleSenaPublicationExport(model, report, safeTitle, format);
    const bytes = bodyBuffer(exportArtifact.body);
    return {
      format,
      filename: exportArtifact.filename,
      contentType: exportArtifact.contentType,
      bytes: bytes.byteLength,
      sha256: sha256Buffer(bytes),
      bodyBase64: bytes.toString("base64")
    };
  }));
  const artifactManifest = artifacts.map(({ bodyBase64: _bodyBase64, ...artifact }) => artifact);
  const sourceSnapshotEvidence = {
    schemaVersion: "sena-publication-source-snapshot/v1",
    snapshotSchemaVersion: snapshot?.schemaVersion ?? "derived-from-report",
    snapshotTitle: snapshot?.title ?? report.title,
    snapshotGeneratedAt: snapshot?.generatedAt ?? report.generatedAt,
    snapshotSha256: snapshot ? sha256Json(snapshot) : sha256Json({ report, modelOptions: model.options }),
    reportSha256: sha256Json(report),
    dataGovernance: report.dataGovernance,
    datasetCounts: snapshot ? snapshotDatasetCounts(snapshot) : {
      people: model.dataset.people.length,
      interactions: model.dataset.interactions.length,
      utterances: model.dataset.utterances.length,
      codedSegments: model.dataset.coded_segments.length,
      codes: model.dataset.codebook.length
    },
    buildOptions: snapshot?.reproducibility.buildOptions ?? model.options,
    activeTemporalWindow: snapshot?.source.activeTemporalWindow
      ? {
          id: snapshot.source.activeTemporalWindow.id,
          label: snapshot.source.activeTemporalWindow.label,
          mode: snapshot.source.activeTemporalWindow.mode,
          index: snapshot.source.activeTemporalWindow.index,
          startTurn: snapshot.source.activeTemporalWindow.startTurn,
          endTurn: snapshot.source.activeTemporalWindow.endTurn
        }
      : null,
    matrixFingerprints: report.fusionMathAudit.matrixFingerprints.map((fingerprint) => ({
      id: fingerprint.id,
      label: fingerprint.label,
      shape: fingerprint.shape,
      checksumAlgorithm: fingerprint.checksumAlgorithm,
      checksum: fingerprint.checksum,
      sha256: sha256Json(fingerprint)
    }))
  };
  const claimEvidence = {
    claimReadinessStatus: report.claimReadinessGate.status,
    claimUse: report.claimReadinessGate.claimUse,
    codingReliability: report.codingReliabilityGate.status,
    humanReview: report.humanReview.status,
    completenessStatus: report.completenessAudit.status,
    guardrails: [
      "Publication package bundles are descriptive SENA analytics exports.",
      "Keep coding reliability, human review, metric provenance, and method settings with publication-facing claims."
    ]
  };
  const verificationCertificate = {
    schemaVersion: "sena-publication-verification-certificate/v1",
    status: artifactManifest.every((artifact) => artifact.bytes > 0 && artifact.sha256.length === 64) ? "verified" : "needs-review",
    generatedAt: report.generatedAt,
    sourceSnapshotSha256: sourceSnapshotEvidence.snapshotSha256,
    reportSha256: sourceSnapshotEvidence.reportSha256,
    artifactChecks: artifactManifest.map((artifact) => ({
      filename: artifact.filename,
      format: artifact.format,
      contentType: artifact.contentType,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      status: artifact.bytes > 0 && artifact.sha256.length === 64 ? "verified" : "needs-review"
    })),
    gateEvidence: {
      claimReadinessStatus: report.claimReadinessGate.status,
      codingReliabilityStatus: report.codingReliabilityGate.status,
      humanReviewStatus: report.humanReview.status,
      completenessStatus: report.completenessAudit.status
    },
    guardrails: claimEvidence.guardrails
  };
  const packageEvidence = {
    artifactManifest,
    sourceSnapshotEvidence,
    claimEvidence,
    verificationCertificate,
    enterpriseProjectEvidence
  };
  return {
    schemaVersion: "sena-publication-package/v1",
    manifest: {
      title: report.title,
      formats: [...packagedPublicationFormats],
      artifactCount: artifacts.length,
      hashAlgorithm: "sha256",
      sourceSnapshotSha256: sourceSnapshotEvidence.snapshotSha256,
      reportSha256: sourceSnapshotEvidence.reportSha256,
      packageSha256: createHash("sha256").update(JSON.stringify(packageEvidence)).digest("hex")
    },
    claimEvidence,
    sourceSnapshotEvidence,
    enterpriseProjectEvidence,
    artifactManifest,
    verificationCertificate,
    artifacts
  };
}

export async function buildSenaPublicationExport(
  snapshot: SenaProjectSnapshot,
  format: SenaPublicationFormat,
  enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence
): Promise<SenaPublicationExport> {
  const model = buildSenaModel(snapshot.dataset, snapshot.reproducibility.buildOptions);
  const report = snapshot.report;
  const safeTitle = (snapshot.title || report.title || "sena-publication").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sena-publication";

  if (format === "package") {
    return {
      filename: `${safeTitle}.sena-publication-package.json`,
      contentType: "application/vnd.sena.publication-package+json; charset=utf-8",
      body: JSON.stringify(await buildSenaPublicationPackage(model, report, safeTitle, snapshot, enterpriseProjectEvidence), null, 2)
    };
  }
  return buildSingleSenaPublicationExport(model, report, safeTitle, format);
}
