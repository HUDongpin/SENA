import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { buildXlsxWorkbookBuffer } from "./excel-workbook";
import { buildSenaModel } from "./model";
import { inspectSenaModelCardSections } from "./model-card";
import {
  SENA_PUBLICATION_FIGURE_LAYOUT,
  buildSenaPublicationFigure,
  buildSenaPublicationFigureSvgDocument,
  drawSenaPublicationFigureOnPdf,
  hexToRgb,
  rasterizeSenaPublicationFigure,
  renderSenaPublicationFigureSvgGroup,
  type SenaFigureRasterTarget,
  type SenaPublicationFigure
} from "./publication-figure";
import {
  buildSenaMarkdownReport,
  isSenaReportHumanReviewComplete,
  normalizeSenaCodingReliabilityGate,
  normalizeSenaDataGovernanceMetadata
} from "./report";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import {
  assertSenaProjectSnapshotPublicationDerivationWorkBudget,
  importSenaProjectSnapshot
} from "./snapshot";
import { SenaEnterpriseError } from "./enterprise/errors";
import type { SenaEnterprisePublicationStateBinding } from "./enterprise/publication-state-binding";
import type { SenaModel, SenaProjectSnapshot, SenaReport } from "./types";

export type SenaPublicationFormat = "html" | "svg" | "png" | "xlsx" | "docx" | "pdf" | "package";

export type SenaPublicationExport = {
  filename: string;
  contentType: string;
  body: string | Buffer;
  derivationManifest: SenaPublicationDerivationManifest;
};

export type SenaPublicationEnterpriseProjectEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationEnterpriseProjectEvidence;
  projectId: string;
  teamId: string;
  currentVersion: number;
  title: string;
  activeWindowLabel: string;
  claimUse: string;
  sourceSnapshotSha256: string;
  reportSha256: string;
  stateBinding: SenaEnterprisePublicationStateBinding;
  publicationDerivation?: {
    kind: "current-project-reliability-run";
    reliabilityRunId: string;
    reliabilityRunSha256: string;
    reliabilityDashboardSchemaVersion: string;
    projectVersion: number;
    persistedSourceSnapshotSha256: string;
    readProjectionSourceSnapshotSha256: string;
    derivedPublicationSnapshotSha256: string;
  };
  claimPackage: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage;
    status: string;
    blockers: number;
    warnings: number;
    sourceSnapshotSha256: string;
    persistedSourceSnapshotSha256: string;
    sha256: string;
  };
};

export type SenaPublicationDerivationManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationDerivationManifest;
  generatedAt: string;
  sourceKind: "inline-snapshot" | "enterprise-project" | "report-model";
  derivationKind: "inline-snapshot" | "persisted-project-snapshot" | "current-project-reliability-run" | "report-model";
  publicationSnapshot: {
    schemaVersion: string;
    title: string;
    generatedAt: string;
    sha256: string;
    reportSha256: string;
  };
  hashBoundaries: {
    hashAlgorithm: "sha256";
    persistedSnapshotSha256: string | null;
    readProjectionSnapshotSha256: string | null;
    publicationSnapshotSha256: string;
    reportSha256: string;
  };
  manifestIntegrity: {
    algorithm: "sha256";
    encoding: "utf8";
    serialization: "JSON.stringify in schema field order";
    scope: "all manifest fields except manifestSha256";
  };
  enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence;
  guardrails: string[];
  manifestSha256: string;
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

function publicationDerivationManifestError() {
  return new SenaEnterpriseError(
    "Publication derivation evidence does not match the selected snapshot and atomic state binding.",
    409,
    "publication_derivation_manifest_binding_invalid"
  );
}

function enterprisePublicationEvidenceIsConsistent(evidence: SenaPublicationEnterpriseProjectEvidence) {
  const { bindingSha256, ...bindingCore } = evidence.stateBinding;
  const binding = evidence.stateBinding;
  const reliability = binding.reliabilityRun;
  const derivation = evidence.publicationDerivation;
  return (
    sha256Json(bindingCore) === bindingSha256 &&
    binding.project.projectId === evidence.projectId &&
    binding.project.projectVersion === evidence.currentVersion &&
    binding.claimPackage.sha256 === evidence.claimPackage.sha256 &&
    binding.claimPackage.projectVersion === evidence.currentVersion &&
    binding.claimPackage.sourceSnapshotSha256 === evidence.claimPackage.sourceSnapshotSha256 &&
    binding.claimPackage.persistedSnapshotSha256 === evidence.claimPackage.persistedSourceSnapshotSha256 &&
    binding.claimPackage.reliabilityRunId === (reliability?.runId ?? null) &&
    (!reliability || (
      reliability.status === "approved" &&
      reliability.projectVersion === evidence.currentVersion &&
      reliability.unresolvedDisagreements === 0
    )) &&
    (reliability ? Boolean(derivation) : !derivation) &&
    (!reliability || !derivation || (
      derivation.kind === "current-project-reliability-run" &&
      reliability.runId === derivation.reliabilityRunId &&
      reliability.sha256 === derivation.reliabilityRunSha256 &&
      reliability.dashboardSchemaVersion === derivation.reliabilityDashboardSchemaVersion &&
      reliability.projectVersion === derivation.projectVersion
    ))
  );
}

export function buildSenaPublicationDerivationManifest(input: {
  snapshot?: SenaProjectSnapshot;
  model?: SenaModel;
  report: SenaReport;
  enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence;
}): SenaPublicationDerivationManifest {
  const snapshotSha256 = input.snapshot
    ? sha256Json(input.snapshot)
    : sha256Json({ report: input.report, modelOptions: input.model?.options });
  const reportSha256 = sha256Json(input.report);
  const enterpriseEvidence = input.enterpriseProjectEvidence;
  const persistedSnapshotSha256 = enterpriseEvidence?.stateBinding.project.persistedSnapshotSha256 ?? null;
  const readProjectionSnapshotSha256 = enterpriseEvidence?.stateBinding.project.readProjectionSnapshotSha256 ?? null;
  const derivationKind = enterpriseEvidence?.publicationDerivation
    ? "current-project-reliability-run" as const
    : enterpriseEvidence
      ? "persisted-project-snapshot" as const
      : input.snapshot
        ? "inline-snapshot" as const
        : "report-model" as const;

  if (enterpriseEvidence && (
    !enterprisePublicationEvidenceIsConsistent(enterpriseEvidence) ||
    enterpriseEvidence.sourceSnapshotSha256 !== snapshotSha256 ||
    enterpriseEvidence.reportSha256 !== reportSha256 ||
    enterpriseEvidence.claimPackage.persistedSourceSnapshotSha256 !== persistedSnapshotSha256 ||
    enterpriseEvidence.claimPackage.sourceSnapshotSha256 !== readProjectionSnapshotSha256 ||
    enterpriseEvidence.stateBinding.claimPackage.persistedSnapshotSha256 !== persistedSnapshotSha256 ||
    enterpriseEvidence.stateBinding.claimPackage.sourceSnapshotSha256 !== readProjectionSnapshotSha256 ||
    (enterpriseEvidence.publicationDerivation && (
      enterpriseEvidence.publicationDerivation.persistedSourceSnapshotSha256 !== persistedSnapshotSha256 ||
      enterpriseEvidence.publicationDerivation.readProjectionSourceSnapshotSha256 !== readProjectionSnapshotSha256 ||
      enterpriseEvidence.publicationDerivation.derivedPublicationSnapshotSha256 !== snapshotSha256
    ))
  )) {
    throw publicationDerivationManifestError();
  }

  const manifestCore = {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationDerivationManifest,
    generatedAt: input.snapshot?.generatedAt ?? input.report.generatedAt,
    sourceKind: enterpriseEvidence ? "enterprise-project" as const : input.snapshot ? "inline-snapshot" as const : "report-model" as const,
    derivationKind,
    publicationSnapshot: {
      schemaVersion: input.snapshot?.schemaVersion ?? "derived-from-report",
      title: input.snapshot?.title ?? input.report.title,
      generatedAt: input.snapshot?.generatedAt ?? input.report.generatedAt,
      sha256: snapshotSha256,
      reportSha256
    },
    hashBoundaries: {
      hashAlgorithm: "sha256" as const,
      persistedSnapshotSha256,
      readProjectionSnapshotSha256,
      publicationSnapshotSha256: snapshotSha256,
      reportSha256
    },
    manifestIntegrity: {
      algorithm: "sha256" as const,
      encoding: "utf8" as const,
      serialization: "JSON.stringify in schema field order" as const,
      scope: "all manifest fields except manifestSha256" as const
    },
    ...(enterpriseEvidence ? { enterpriseProjectEvidence: structuredClone(enterpriseEvidence) } : {}),
    guardrails: [
      ...(enterpriseEvidence
        ? ["The persisted hash identifies raw stored evidence; the read-projection hash identifies non-persisted compatibility normalization."]
        : ["No persisted or read-projection snapshot hash is asserted for this standalone input; those boundaries are null."]),
      "The publication snapshot hash identifies the exact rendered/exported analytical snapshot.",
      "A derivation manifest records provenance and integrity boundaries; it does not make a causal or inferential claim."
    ]
  };
  return {
    ...manifestCore,
    manifestSha256: sha256Json(manifestCore)
  };
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
  ",": ["00000", "00000", "00000", "00000", "01100", "01100", "01000"],
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

function pngInternationalTextChunk(keyword: string, text: string) {
  return pngChunk("iTXt", Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0, 0, 0, 0, 0]),
    Buffer.from(text, "utf8")
  ]));
}

function encodePng(
  width: number,
  height: number,
  pixels: Buffer,
  internationalText: Array<{ keyword: string; text: string }> = []
) {
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
    ...internationalText.map(({ keyword, text }) => pngInternationalTextChunk(keyword, text)),
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

/**
 * Composite one pixel at partial coverage. `fillRect` writes opaque blocks,
 * which is all a bar chart needed; a figure needs anti-aliased strokes and
 * discs, and a stroke drawn opaque at its nominal width is a visibly different
 * mark from the one the SVG draws. The canvas is opaque throughout (the plate
 * is filled white first), so source-over reduces to a lerp.
 */
function blendPixel(
  pixels: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  color: readonly [number, number, number],
  alpha: number
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const weight = Math.min(1, Math.max(0, alpha));
  if (weight <= 0) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = Math.round(pixels[offset] + (color[0] - pixels[offset]) * weight);
  pixels[offset + 1] = Math.round(pixels[offset + 1] + (color[1] - pixels[offset + 1]) * weight);
  pixels[offset + 2] = Math.round(pixels[offset + 2] + (color[2] - pixels[offset + 2]) * weight);
  pixels[offset + 3] = 255;
}

/**
 * The 5x7 font is uppercase ASCII plus a handful of punctuation marks. Anything
 * outside it renders as a blank, so the few characters the figure's own strings
 * carry are folded onto glyphs that exist rather than silently disappearing —
 * the middot separator and the Greek rho in the co-registration line.
 */
function bitmapSafeText(value: string) {
  return value
    .replace(/[·•]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/ρ/g, "RHO")
    .replace(/[^\x20-\x7E]/g, " ");
}

/** Glyph cell scale for a plane-space font size at a given raster scale. */
function bitmapGlyphScale(fontSize: number, rasterScale: number) {
  return Math.max(1, Math.round((fontSize * rasterScale) / 7));
}

function bitmapTextWidth(text: string, glyphScale: number) {
  return text.length * 6 * glyphScale;
}

/**
 * Raster bindings for `rasterizeSenaPublicationFigure`. The figure module owns
 * the marks and the coverage maths; this owns the pixel buffer and the font, so
 * neither has to know about the other.
 */
function figureRasterTarget(
  pixels: Buffer,
  width: number,
  height: number,
  placement: { x: number; y: number; scale: number }
): SenaFigureRasterTarget {
  return {
    width,
    height,
    offsetX: placement.x,
    offsetY: placement.y,
    scale: placement.scale,
    blend: (x, y, color, alpha) => blendPixel(pixels, width, height, x, y, color, alpha),
    text: (value, x, y, fontSize, color, anchor) => {
      const safe = bitmapSafeText(value);
      const glyphScale = bitmapGlyphScale(fontSize, placement.scale);
      const textWidth = bitmapTextWidth(safe, glyphScale);
      const left = anchor === "end" ? x - textWidth : anchor === "middle" ? x - textWidth / 2 : x;
      // The figure gives a baseline; the bitmap font draws from the glyph top.
      drawText(pixels, width, height, safe, left, y - 7 * glyphScale, glyphScale, [
        color[0],
        color[1],
        color[2],
        255
      ]);
    }
  };
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

const PUBLICATION_SUBTITLE =
  "SENA publication export — canonical ENA plane (jENA projection); summary metrics below the figure.";
const PUBLICATION_GUARDRAIL =
  "Guardrail: descriptive analytics; report coding reliability, human review, and method settings with any claim.";
/**
 * The PNG's own caveat, drawn on its face. The raster carries the figure's real
 * geometry but renders text in a 5x7 bitmap font (see `buildSenaPublicationPng`),
 * so the file says which artifact a paper should actually use.
 */
const PUBLICATION_RASTER_NOTE =
  "Raster export: figure geometry is exact; labels use a bitmap font. Use the SVG for publication.";

/**
 * The publication figure, dominant, with the summary metrics kept underneath it.
 *
 * The figure is `buildSenaPublicationFigure`'s canonical ENA plane rendered by
 * the shared renderer in `publication-figure.ts`; the metric strip is what this
 * export used to be in its entirety, demoted to a provenance band because the
 * counts are still worth carrying beside the plot and cost one row to keep.
 *
 * `figure` is threaded rather than recomputed so a package build resolves the
 * projection once for all six artifacts.
 */
export function buildSenaPublicationSvg(
  model: SenaModel,
  title: string,
  figure: SenaPublicationFigure = buildSenaPublicationFigure(model),
  derivationManifest?: SenaPublicationDerivationManifest
) {
  const { width, height } = SENA_PUBLICATION_FIGURE_LAYOUT.svg.document;
  const plate = figure.vector;
  const rows = metricRows(model);
  const chipWidth = plate.width / rows.length;
  const metrics = rows.map(([label, value], index) => {
    const x = plate.x + index * chipWidth;
    return `<g data-sena-metric="${escapeXml(String(label))}">
    <text x="${(x + 10).toFixed(1)}" y="946" font-size="10" font-weight="600" fill="#64748b">${escapeXml(String(label))}</text>
    <text x="${(x + 10).toFixed(1)}" y="962" font-size="14" font-weight="700" fill="#1f2937">${escapeXml(String(value))}</text>
  </g>`;
  }).join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(`${title} — canonical ENA plane`)}" font-family="Arial, Helvetica, sans-serif">
  ${derivationManifest ? `<metadata id="sena-publication-derivation-manifest">${escapeXml(JSON.stringify(derivationManifest))}</metadata>` : ""}
  <rect width="${width}" height="${height}" fill="#f8fafc"/>
  <rect x="36" y="32" width="${width - 72}" height="966" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="${plate.x}" y="76" font-size="28" font-weight="800" fill="#111827">${escapeXml(title)}</text>
  <text x="${plate.x}" y="102" font-size="14" font-weight="600" fill="#64748b">${escapeXml(PUBLICATION_SUBTITLE)}</text>
  <g data-sena-figure-plate="canonical-ena-plane" transform="translate(${plate.x} ${plate.y}) scale(${plate.scale})">
${renderSenaPublicationFigureSvgGroup(figure)}
  </g>
  <text data-sena-figure-caption="model-definition" x="${plate.x}" y="902" font-size="12" font-weight="700" fill="#64748b">${escapeXml(figure.caption.modelDefinition)}</text>
  <text data-sena-figure-caption="goodness-of-fit" x="${plate.x}" y="920" font-size="11" font-weight="600" fill="#475569">${escapeXml(figure.caption.goodnessOfFit)}</text>
  <rect x="${plate.x}" y="930" width="${plate.width}" height="38" rx="6" fill="#f1f5f9"/>
  ${metrics}
  <text x="${plate.x}" y="988" font-size="11" fill="#64748b">${escapeXml(PUBLICATION_GUARDRAIL)}</text>
</svg>`;
}

/**
 * The same figure, rasterised.
 *
 * WHAT THIS IS AND IS NOT. Every line, disc, and ring below is the figure's own
 * geometry, drawn by `rasterizeSenaPublicationFigure` with coverage-based
 * anti-aliasing at 2x — the plot a reader sees here is the plot the SVG draws,
 * not a summary standing in for it. What is degraded is type: the only font
 * available in this file set is the 5x7 bitmap above, so labels are uppercase
 * and unhinted. Rasterising the SVG properly would need `sharp`, which is a
 * devDependency and is absent from the production export runtime, so the honest
 * options were a real figure with bitmap labels or no figure at all. The PNG
 * names the limitation on its own face and points at the SVG.
 */
export function buildSenaPublicationPng(
  model: SenaModel,
  title: string,
  figure: SenaPublicationFigure = buildSenaPublicationFigure(model),
  derivationManifest?: SenaPublicationDerivationManifest
) {
  const { width, height } = SENA_PUBLICATION_FIGURE_LAYOUT.png.document;
  const plate = figure.raster;
  const pixels = Buffer.alloc(width * height * 4);
  fillRect(pixels, width, height, 0, 0, width, height, [248, 250, 252, 255]);
  fillRect(pixels, width, height, 36, 32, width - 72, height - 96, [255, 255, 255, 255]);
  fillRect(pixels, width, height, 36, 32, width - 72, 2, [203, 213, 225, 255]);
  fillRect(pixels, width, height, 36, height - 66, width - 72, 2, [203, 213, 225, 255]);
  fillRect(pixels, width, height, 36, 32, 2, height - 96, [203, 213, 225, 255]);
  fillRect(pixels, width, height, width - 38, 32, 2, height - 96, [203, 213, 225, 255]);

  drawText(pixels, width, height, bitmapSafeText(title).slice(0, 46), plate.x, 60, 5, [17, 24, 39, 255]);
  drawText(pixels, width, height, bitmapSafeText(PUBLICATION_SUBTITLE), plate.x, 108, 2, [100, 116, 139, 255]);

  // The figure's paper, then the figure. The plate is filled first because the
  // marks composite onto it.
  fillRect(pixels, width, height, plate.x, plate.y, plate.width, plate.height, [255, 255, 255, 255]);
  rasterizeSenaPublicationFigure(figure, figureRasterTarget(pixels, width, height, plate));

  drawText(pixels, width, height, bitmapSafeText(figure.caption.modelDefinition), plate.x, 1200, 2, [100, 116, 139, 255]);
  drawText(pixels, width, height, bitmapSafeText(figure.caption.goodnessOfFit), plate.x, 1226, 2, [71, 85, 105, 255]);

  const rows = metricRows(model);
  const chipWidth = plate.width / rows.length;
  rows.forEach(([label, value], index) => {
    const x = plate.x + index * chipWidth;
    drawText(pixels, width, height, bitmapSafeText(String(label)), x, 1256, 2, [100, 116, 139, 255]);
    drawText(pixels, width, height, bitmapSafeText(String(value)), x, 1278, 3, [31, 41, 55, 255]);
  });

  drawText(pixels, width, height, bitmapSafeText(PUBLICATION_GUARDRAIL), plate.x, 1316, 2, [100, 116, 139, 255]);
  drawText(pixels, width, height, bitmapSafeText(PUBLICATION_RASTER_NOTE), plate.x, 1344, 2, [148, 118, 20, 255]);
  return encodePng(width, height, pixels, derivationManifest ? [{
    keyword: "SENA Derivation Manifest",
    text: JSON.stringify(derivationManifest)
  }] : []);
}

/**
 * The bare figure as a PNG at the plate's own size — the DOCX image fallback,
 * which needs a raster with no page furniture around it.
 */
export function buildSenaPublicationFigurePng(figure: SenaPublicationFigure) {
  const scale = SENA_PUBLICATION_FIGURE_LAYOUT.png.plate.scale;
  const width = Math.round(figure.plane.width * scale);
  const height = Math.round(figure.plane.height * scale);
  const pixels = Buffer.alloc(width * height * 4);
  fillRect(pixels, width, height, 0, 0, width, height, [255, 255, 255, 255]);
  rasterizeSenaPublicationFigure(figure, figureRasterTarget(pixels, width, height, { x: 0, y: 0, scale }));
  return encodePng(width, height, pixels);
}

export function buildSenaPublicationHtml(
  report: SenaReport,
  figure?: SenaPublicationFigure,
  derivationManifest?: SenaPublicationDerivationManifest
) {
  const markdown = buildSenaMarkdownReport(report);
  // The report's own "Figures" section is prose — node, edge and window counts —
  // so without this the HTML export is the one publication artifact that names
  // figures and shows none. Inlined rather than linked: the artifact has to stay
  // a single self-contained file an author can attach.
  const figureBlock = figure
    ? `<figure data-sena-figure="canonical-ena-plane">${
        buildSenaPublicationFigureSvgDocument(figure).replace(/^<\?xml[^>]*\?>\s*/, "")
      }<figcaption>${escapeXml(`${figure.caption.modelDefinition}. ${figure.caption.goodnessOfFit}.`)}</figcaption></figure>`
    : "";
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
<body>${figureBlock}${body}${derivationManifest ? `<script type="application/json" data-sena-derivation-manifest>${JSON.stringify(derivationManifest).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")}</script>` : ""}</body>
</html>`;
}

export async function buildSenaPublicationWorkbook(
  model: SenaModel,
  report: SenaReport,
  derivationManifest?: SenaPublicationDerivationManifest
) {
  return buildXlsxWorkbookBuffer([
    {
      name: "Summary",
      rows: metricRows(model).map(([metric, value]) => ({ metric, value }))
    },
    {
      name: "Claim readiness",
      rows: [
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
          schemaVersion: SENA_SCHEMA_VERSIONS.humanReview,
          status: report.humanReview.status,
          reviewer: report.humanReview.reviewer,
          reviewedAt: report.humanReview.reviewedAt,
          blockers: report.humanReview.status === "human-reviewed" ? "" : "human review not completed"
        }
      ]
    },
    {
      name: "Coding reliability",
      rows: [
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
      ]
    },
    {
      name: "Data governance",
      rows: [
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
      ]
    },
    {
      name: "Matrix fingerprints",
      rows: report.fusionMathAudit.matrixFingerprints.map((fingerprint) => ({
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
      }))
    },
    {
      name: "Evidence snippets",
      rows: report.evidenceSnippets.slice(0, 80).map((snippet, index) => ({
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
      }))
    },
    {
      name: "SNA actors",
      rows: model.socialReport.actors.map((actor) => ({
        id: actor.id,
        label: actor.label,
        degree: actor.degree,
        strength: actor.strength,
        closeness: actor.closeness,
        component: actor.component,
        community: actor.community
      }))
    },
    {
      name: "G pairs",
      rows: model.pairReport.map((pair) => ({
        pair: pair.label,
        totalContribution: pair.totalContribution,
        contributors: pair.topContributors.map((contributor) => `${contributor.label}:${contributor.weight}`).join("; ")
      }))
    },
    {
      name: "Metric provenance",
      rows: report.validation.metricProvenance.map((metric) => ({
        metric: metric.label,
        source: metric.source,
        parityStatus: metric.parityStatus,
        interpretationLimit: metric.interpretationLimit
      }))
    },
    ...(derivationManifest ? [{
      name: "Derivation Manifest",
      rows: [
        { key: "schemaVersion", value: derivationManifest.schemaVersion },
        { key: "manifestSha256", value: derivationManifest.manifestSha256 },
        { key: "sourceKind", value: derivationManifest.sourceKind },
        { key: "derivationKind", value: derivationManifest.derivationKind },
        { key: "manifestJson", value: JSON.stringify(derivationManifest) }
      ]
    }] : [])
  ]);
}

/** Word content width at the default page and margins, in px at 96dpi. */
const DOCX_FIGURE_WIDTH = 600;

export async function buildSenaPublicationDocx(
  model: SenaModel,
  report: SenaReport,
  figure: SenaPublicationFigure = buildSenaPublicationFigure(model),
  derivationManifest?: SenaPublicationDerivationManifest
) {
  // Vector first: Word renders the SVG and keeps the figure resolution-free, and
  // the PNG fallback is what older Word builds (and most converters) fall back
  // to. `ImageRun`'s svg variant requires the fallback, which is exactly the
  // right contract here.
  const figureImage = new ImageRun({
    type: "svg",
    data: Buffer.from(buildSenaPublicationFigureSvgDocument(figure), "utf8"),
    fallback: { type: "png", data: buildSenaPublicationFigurePng(figure) },
    transformation: {
      width: DOCX_FIGURE_WIDTH,
      height: Math.round((DOCX_FIGURE_WIDTH * figure.plane.height) / figure.plane.width)
    }
  });

  const document = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
        new Paragraph({
          children: [new TextRun({ text: "SENA publication report", bold: true }), new TextRun(" generated from the enterprise export API.")]
        }),
        new Paragraph({ text: "Figure 1. Canonical ENA plane", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [figureImage] }),
        new Paragraph({ children: [new TextRun({ text: figure.caption.modelDefinition, size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: figure.caption.goodnessOfFit, size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: figure.caption.guardrail, size: 18, italics: true })] }),
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
        new Paragraph("SENA outputs are descriptive analytics. Include coding reliability, human review, runtime provenance, and method settings with any publication-facing interpretation."),
        ...(derivationManifest ? [
          new Paragraph({ text: "Derivation Manifest", heading: HeadingLevel.HEADING_1 }),
          new Paragraph(`Schema: ${derivationManifest.schemaVersion}; SHA-256: ${derivationManifest.manifestSha256}`),
          new Paragraph({
            children: [new TextRun({
              text: `SENA_DERIVATION_MANIFEST_BEGIN${JSON.stringify(derivationManifest)}SENA_DERIVATION_MANIFEST_END`,
              vanish: true
            })]
          })
        ] : [])
      ]
    }]
  });
  return Buffer.from(await Packer.toBuffer(document));
}

function pdfColor(hex: string) {
  const [red, green, blue] = hexToRgb(hex);
  return rgb(red / 255, green / 255, blue / 255);
}

/**
 * Helvetica's WinAnsi encoding cannot represent the Greek rho the
 * co-registration line carries, and pdf-lib throws rather than dropping it.
 * Fold the figure's few non-Latin marks onto ASCII before they reach the page.
 */
function pdfSafeText(value: string) {
  return value
    .replace(/ρ/g, "rho")
    .replace(/[·•]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ");
}

export async function buildSenaPublicationPdf(
  model: SenaModel,
  report: SenaReport,
  figure: SenaPublicationFigure = buildSenaPublicationFigure(model),
  derivationManifest?: SenaPublicationDerivationManifest
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const { height } = page.getSize();
  let y = height - 56;

  page.drawText(pdfSafeText(report.title).slice(0, 82), { x: 48, y, size: 18, font: bold, color: rgb(0.07, 0.1, 0.18) });
  y -= 20;
  page.drawText("SENA publication export - canonical ENA plane", { x: 48, y, size: 10, font, color: rgb(0.35, 0.41, 0.5) });

  // The figure as real vectors. pdf-lib draws lines, circles, and embedded
  // Helvetica natively, so the PDF carries the same geometry as the SVG with
  // proper typography rather than an embedded bitmap.
  const plateWidth = 516;
  const plateScale = plateWidth / figure.plane.width;
  const plateTop = y - 18;
  const plateBottom = plateTop - figure.plane.height * plateScale;
  page.drawRectangle({
    x: 48,
    y: plateBottom,
    width: plateWidth,
    height: figure.plane.height * plateScale,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.8, 0.84, 0.88),
    borderWidth: 0.6
  });
  drawSenaPublicationFigureOnPdf(figure, {
    x: 48,
    top: plateTop,
    scale: plateScale,
    drawLine: ({ x1, y1, x2, y2, color, thickness, opacity }) => {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness,
        color: pdfColor(color),
        opacity
      });
    },
    drawDisc: ({ x, y: discY, radius, color, borderColor, borderWidth }) => {
      page.drawCircle({
        x,
        y: discY,
        size: radius,
        color: pdfColor(color),
        ...(borderColor ? { borderColor: pdfColor(borderColor), borderWidth: borderWidth ?? 0.5 } : {})
      });
    },
    drawText: ({ text, x, y: textY, size, color, bold: isBold, anchor }) => {
      const face = isBold ? bold : font;
      const safe = pdfSafeText(text);
      const textWidth = face.widthOfTextAtSize(safe, size);
      const left = anchor === "end" ? x - textWidth : anchor === "middle" ? x - textWidth / 2 : x;
      page.drawText(safe, { x: left, y: textY, size, font: face, color: pdfColor(color) });
    }
  });

  y = plateBottom - 14;
  page.drawText(pdfSafeText(figure.caption.modelDefinition).slice(0, 128), { x: 48, y, size: 7, font, color: rgb(0.35, 0.41, 0.5) });
  y -= 11;
  page.drawText(pdfSafeText(figure.caption.goodnessOfFit).slice(0, 128), { x: 48, y, size: 7, font, color: rgb(0.35, 0.41, 0.5) });
  y -= 22;

  page.drawText("Summary metrics", { x: 48, y, size: 12, font: bold, color: rgb(0.07, 0.1, 0.18) });
  y -= 16;
  for (const [metric, value] of metricRows(model)) {
    page.drawText(metric, { x: 56, y, size: 9, font: bold, color: rgb(0.12, 0.16, 0.22) });
    page.drawText(String(value), { x: 200, y, size: 9, font, color: rgb(0.12, 0.16, 0.22) });
    y -= 12;
  }

  y -= 10;
  page.drawText("Claim readiness", { x: 48, y, size: 12, font: bold, color: rgb(0.07, 0.1, 0.18) });
  y -= 14;
  page.drawText(pdfSafeText(`${report.claimReadinessGate.status}; ${report.claimReadinessGate.claimUse}`).slice(0, 110), { x: 56, y, size: 9, font, color: rgb(0.12, 0.16, 0.22) });
  y -= 22;
  page.drawText("Guardrail", { x: 48, y, size: 12, font: bold, color: rgb(0.07, 0.1, 0.18) });
  y -= 14;
  page.drawText("Descriptive analytics only until coding reliability, human review, and method settings are documented.", {
    x: 56,
    y,
    size: 8,
    font,
    color: rgb(0.35, 0.41, 0.5)
  });

  if (derivationManifest) {
    await pdf.attach(
      Buffer.from(JSON.stringify(derivationManifest), "utf8"),
      "sena-publication-derivation-manifest.json",
      {
        mimeType: "application/json",
        description: `SENA derivation manifest ${derivationManifest.manifestSha256}`
      }
    );
    pdf.setSubject(`SENA derivation manifest SHA-256 ${derivationManifest.manifestSha256}`);
    pdf.setKeywords(["SENA", "derivation manifest", derivationManifest.manifestSha256]);
  }

  return Buffer.from(await pdf.save());
}

const packagedPublicationFormats = ["svg", "png", "html", "xlsx", "docx", "pdf"] as const;

type PackagedPublicationFormat = typeof packagedPublicationFormats[number];

function hasCompleteSenaMethodValidation(report: SenaReport) {
  const validation = report.validation;
  return Array.isArray(validation?.metricProvenance) && validation.metricProvenance.length > 0 &&
    validation.sensitivity?.layerWeights?.id === "layer-weights" &&
    validation.sensitivity.layerWeights.variants.length > 0 &&
    validation.sensitivity?.normalization?.id === "normalization" &&
    validation.sensitivity.normalization.variants.length > 0 &&
    Array.isArray(validation.stability?.community?.normalizationAgreement) &&
    validation.stability.community.normalizationAgreement.length > 0 &&
    Array.isArray(validation.stability?.temporal?.variants) &&
    validation.stability.temporal.variants.length > 0 &&
    validation.nullModels?.schemaVersion === SENA_SCHEMA_VERSIONS.nullModels &&
    Number.isSafeInteger(validation.nullModels.permutation?.iterations) &&
    validation.nullModels.permutation.iterations > 0 &&
    Array.isArray(validation.nullModels.permutation.samplesPreview) &&
    validation.nullModels.permutation.samplesPreview.length > 0 &&
    Number.isSafeInteger(validation.nullModels.bootstrap?.iterations) &&
    validation.nullModels.bootstrap.iterations > 0 &&
    Array.isArray(validation.nullModels.bootstrap.samplesPreview) &&
    validation.nullModels.bootstrap.samplesPreview.length > 0;
}

export function assertSenaPublicationModelCardReady(report: SenaReport) {
  // Legacy snapshots exported before the model card existed carry no
  // report.modelCard; block them with a clear re-run hint instead of crashing
  // on the missing render gate.
  const renderGate = (report as Partial<SenaReport>).modelCard?.renderGate;
  if (!renderGate) {
    throw new SenaEnterpriseError(
      "Publication export blocked: this snapshot predates the SENA model card; re-run the analysis to regenerate the report with model-card evidence.",
      409,
      "publication_export_model_card_blocked"
    );
  }
  const nonCurrentStatisticalEvidence = [
    ...(report.fusionMathAudit.schemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit &&
      report.fusionMathAudit.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit
      ? [] : ["current-fusion-math-evidence"]),
    ...(report.codingReliabilityGate.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityGate &&
      report.codingReliabilityGate.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityGate
      ? [] : ["current-coding-reliability-evidence"])
  ];
  if (nonCurrentStatisticalEvidence.length > 0) {
    throw new SenaEnterpriseError(
      `Publication export blocked: historical statistical read projections are not current publication evidence: ${nonCurrentStatisticalEvidence.join(", ")}.`,
      409,
      "publication_export_model_card_blocked"
    );
  }
  const codingReliabilityGate = normalizeSenaCodingReliabilityGate(report.codingReliabilityGate);
  const dataGovernance = normalizeSenaDataGovernanceMetadata(report.dataGovernance, report.generatedAt);
  const modelCardSectionIntegrity = inspectSenaModelCardSections(report.modelCard.sections);
  const missingReadiness = Array.from(new Set([
    ...renderGate.missingSectionIds,
    ...modelCardSectionIntegrity.blockingIds,
    ...(codingReliabilityGate.status === "ready" ? [] : ["coding-reliability"]),
    ...(dataGovernance.status === "complete" ? [] : ["data-governance"]),
    ...(report.dataGovernance.schemaVersion === SENA_SCHEMA_VERSIONS.dataGovernanceMetadata
      ? [] : ["current-data-governance-schema"]),
    ...(isSenaReportHumanReviewComplete(report.humanReview) ? [] : ["human-review"]),
    ...(report.completenessAudit.status === "complete" ? [] : ["report-completeness"]),
    ...(report.pilotReadinessAudit.status === "ready" ? [] : ["pilot-readiness"]),
    ...(report.claimReadinessGate.status === "ready" ? [] : ["claim-readiness"]),
    ...(report.dataContractAudit.status === "valid" &&
      report.dataContractAudit.reviewNeeded === 0 &&
      report.dataContractAudit.items.length > 0 &&
      report.dataContractAudit.items.every((item) => item.status === "pass")
      ? [] : ["data-contract-audit"]),
    ...(report.runtimeConsistencyAudit.status === "consistent" &&
      report.runtimeConsistencyAudit.reviewNeeded === 0 &&
      report.runtimeConsistencyAudit.items.length > 0 &&
      report.runtimeConsistencyAudit.items.every((item) => item.status === "pass")
      ? [] : ["runtime-consistency-audit"]),
    ...(report.fusionMathAudit.status === "verified" &&
      report.fusionMathAudit.reviewNeeded === 0 &&
      report.fusionMathAudit.items.length > 0 &&
      report.fusionMathAudit.items.every((item) => item.status === "pass")
      ? [] : ["fusion-math-audit"]),
    ...(report.enaManifest.status === "computed" ? [] : ["ena-runtime"]),
    ...(report.snaManifest.status === "computed" ? [] : ["sna-runtime"]),
    ...(hasCompleteSenaMethodValidation(report) ? [] : ["method-validation"])
  ]));
  if (renderGate.status === "ready" && missingReadiness.length === 0) return;
  throw new SenaEnterpriseError(
    `Publication export blocked until the SENA model card and derived research-readiness evidence are complete: ${missingReadiness.join(", ") || "unknown"}.`,
    409,
    "publication_export_model_card_blocked"
  );
}

/**
 * The projection the export draws.
 *
 * `report.enaManifest` is the projection the report itself was written from, so
 * taking it rather than recomputing keeps the figure and the report's own ENA
 * numbers provably the same run — and it is free. A snapshot old enough to
 * predate the field falls back to computing it from the model's dataset, which
 * is the same deterministic call `buildSenaReport` makes.
 */
function publicationFigureFor(model: SenaModel, report: SenaReport) {
  const manifest = (report as Partial<SenaReport>).enaManifest;
  return buildSenaPublicationFigure(model, manifest ? { manifest } : {});
}

async function buildSingleSenaPublicationExport(
  model: SenaModel,
  report: SenaReport,
  safeTitle: string,
  format: PackagedPublicationFormat,
  figure: SenaPublicationFigure,
  derivationManifest: SenaPublicationDerivationManifest
): Promise<SenaPublicationExport> {
  if (format === "svg") {
    return {
      filename: `${safeTitle}.svg`,
      contentType: "image/svg+xml; charset=utf-8",
      body: buildSenaPublicationSvg(model, report.title, figure, derivationManifest),
      derivationManifest
    };
  }
  if (format === "png") {
    return {
      filename: `${safeTitle}.png`,
      contentType: "image/png",
      body: buildSenaPublicationPng(model, report.title, figure, derivationManifest),
      derivationManifest
    };
  }
  if (format === "html") {
    return {
      filename: `${safeTitle}.html`,
      contentType: "text/html; charset=utf-8",
      body: buildSenaPublicationHtml(report, figure, derivationManifest),
      derivationManifest
    };
  }
  if (format === "xlsx") {
    return {
      filename: `${safeTitle}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: await buildSenaPublicationWorkbook(model, report, derivationManifest),
      derivationManifest
    };
  }
  if (format === "docx") {
    return {
      filename: `${safeTitle}.docx`,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: await buildSenaPublicationDocx(model, report, figure, derivationManifest),
      derivationManifest
    };
  }
  return {
    filename: `${safeTitle}.pdf`,
    contentType: "application/pdf",
    body: await buildSenaPublicationPdf(model, report, figure, derivationManifest),
    derivationManifest
  };
}

export async function buildSenaPublicationPackage(
  model: SenaModel,
  report: SenaReport,
  safeTitle: string,
  snapshot?: SenaProjectSnapshot,
  enterpriseProjectEvidence?: SenaPublicationEnterpriseProjectEvidence,
  derivationManifest: SenaPublicationDerivationManifest = buildSenaPublicationDerivationManifest({
    snapshot,
    model,
    report,
    enterpriseProjectEvidence
  })
) {
  // One projection for all six artifacts: the SVG, PNG, DOCX, and PDF each draw
  // the same figure, so resolving it once is both cheaper and the guarantee that
  // the package's four pictures cannot disagree with each other.
  const figure = publicationFigureFor(model, report);
  const artifacts = await Promise.all(packagedPublicationFormats.map(async (format) => {
    const exportArtifact = await buildSingleSenaPublicationExport(
      model,
      report,
      safeTitle,
      format,
      figure,
      derivationManifest
    );
    const bytes = bodyBuffer(exportArtifact.body);
    return {
      format,
      filename: exportArtifact.filename,
      contentType: exportArtifact.contentType,
      bytes: bytes.byteLength,
      sha256: sha256Buffer(bytes),
      derivationManifestSha256: derivationManifest.manifestSha256,
      bodyBase64: bytes.toString("base64")
    };
  }));
  const artifactManifest = artifacts.map(({ bodyBase64: _bodyBase64, ...artifact }) => artifact);
  const sourceSnapshotEvidence = {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationSourceSnapshot,
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
  // What figure the package's four picture artifacts contain, and how big it is.
  // Without this the manifest describes six files by size and hash and says
  // nothing about whether any of them holds a figure at all — which is exactly
  // how a package of six summary cards passed as a publication package.
  const figureEvidence = {
    status: figure.status,
    figure: figure.figure,
    title: figure.title,
    reason: figure.reason,
    dimensions: figure.dimensions,
    nodes: figure.nodes.length,
    edges: figure.edges.length,
    units: figure.units.length,
    formats: ["svg", "png", "docx", "pdf"],
    modelDefinition: figure.caption.modelDefinition,
    goodnessOfFit: figure.caption.goodnessOfFit,
    rasterLimitation: PUBLICATION_RASTER_NOTE
  };
  const verificationCertificate = {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationVerificationCertificate,
    status: artifactManifest.every((artifact) => artifact.bytes > 0 && artifact.sha256.length === 64) ? "verified" : "needs-review",
    generatedAt: report.generatedAt,
    derivationManifestSha256: derivationManifest.manifestSha256,
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
    figureEvidence,
    verificationCertificate,
    enterpriseProjectEvidence,
    derivationManifest
  };
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationPackage,
    manifest: {
      title: report.title,
      formats: [...packagedPublicationFormats],
      artifactCount: artifacts.length,
      hashAlgorithm: "sha256",
      sourceSnapshotSha256: sourceSnapshotEvidence.snapshotSha256,
      reportSha256: sourceSnapshotEvidence.reportSha256,
      derivationManifestSha256: derivationManifest.manifestSha256,
      packageSha256: createHash("sha256").update(JSON.stringify(packageEvidence)).digest("hex")
    },
    claimEvidence,
    sourceSnapshotEvidence,
    figureEvidence,
    enterpriseProjectEvidence,
    derivationManifest,
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
  assertSenaProjectSnapshotPublicationDerivationWorkBudget(snapshot);
  snapshot = importSenaProjectSnapshot(snapshot);
  const model = buildSenaModel(snapshot.dataset, snapshot.reproducibility.buildOptions);
  const report = snapshot.report;
  assertSenaPublicationModelCardReady(report);
  const safeTitle = (snapshot.title || report.title || "sena-publication").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sena-publication";
  const derivationManifest = buildSenaPublicationDerivationManifest({
    snapshot,
    model,
    report,
    enterpriseProjectEvidence
  });

  if (format === "package") {
    return {
      filename: `${safeTitle}.sena-publication-package.json`,
      contentType: "application/vnd.sena.publication-package+json; charset=utf-8",
      body: JSON.stringify(await buildSenaPublicationPackage(
        model,
        report,
        safeTitle,
        snapshot,
        enterpriseProjectEvidence,
        derivationManifest
      ), null, 2),
      derivationManifest
    };
  }
  return buildSingleSenaPublicationExport(
    model,
    report,
    safeTitle,
    format,
    publicationFigureFor(model, report),
    derivationManifest
  );
}
