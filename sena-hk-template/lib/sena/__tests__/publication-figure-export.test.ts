import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";
import { buildSenaPublicationFigure } from "../publication-figure";
import {
  buildSenaPublicationExport,
  buildSenaPublicationPng,
  buildSenaPublicationSvg
} from "../publication-export";
import type { SenaDataset, SenaModel } from "../types";

// B2. "Export figure SVG/PNG" has to export a figure. The artifact these suites
// pin is the canonical ENA plane — the plane-orbit default's ENA half — because
// that is the measured, rENA-standard picture a paper carries, and it is a pure
// function of the model. Every assertion below is written so that deleting the
// plane and leaving the old metric card behind turns it red.

function publicationSnapshot(dataset: SenaDataset, title: string) {
  const model = buildSenaModel(dataset);
  return buildSenaProjectSnapshot(model, {
    title,
    generatedAt: "2026-08-15T00:00:00.000Z",
    sourceDataset: dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Publication figure test",
      interpretation: "Fixture interpretation.",
      limitations: "Fixture only.",
      nextActions: "None."
    },
    codingReliability: {
      status: "documented",
      reviewer: "Publication figure test",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Cohen kappa",
      agreementValue: "kappa=1",
      adjudicationNotes: "No disagreements in fixture.",
      limitations: "Fixture only."
    },
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic publication export fixture only.",
      retentionPolicy: "Delete generated fixture state after the test run.",
      usageConstraints: ["Do not use as real participant evidence."],
      dataSteward: "Publication figure test"
    }
  });
}

function pilotDataset() {
  return importSenaJsonContract(lessonStudySenaContract).dataset;
}

/** A genuinely different model: the same codebook, half the coded evidence. */
function reducedDataset(): SenaDataset {
  const dataset = pilotDataset();
  const keep = Math.ceil(dataset.coded_segments.length / 2);
  return { ...dataset, coded_segments: dataset.coded_segments.slice(0, keep) };
}

function occurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

function attributeValues(svg: string, attribute: string) {
  return [...svg.matchAll(new RegExp(`${attribute}="([^"]*)"`, "g"))].map((match) => match[1]);
}

/**
 * pdf-lib Flate-compresses its content streams and writes show-text operands as
 * hex strings, so neither the drawing operators nor the labels are readable in
 * the raw bytes. Inflate every stream that will inflate, then turn `<48656C6C6F>`
 * back into `(Hello)` so an assertion can name the text a reader would see.
 */
function pdfContentStreams(pdf: Buffer) {
  const decoded: string[] = [];
  let cursor = 0;
  while (cursor < pdf.length) {
    const start = pdf.indexOf("stream", cursor);
    if (start < 0) break;
    const end = pdf.indexOf("endstream", start);
    if (end < 0) break;
    let bodyStart = start + "stream".length;
    if (pdf[bodyStart] === 0x0d) bodyStart += 1;
    if (pdf[bodyStart] === 0x0a) bodyStart += 1;
    try {
      decoded.push(inflateSync(pdf.subarray(bodyStart, end)).toString("latin1"));
    } catch {
      decoded.push(pdf.subarray(bodyStart, end).toString("latin1"));
    }
    cursor = end + "endstream".length;
  }
  return decoded
    .join("\n")
    .replace(/<([0-9A-Fa-f]+)>/g, (match, hex: string) =>
      hex.length % 2 === 0 ? `(${Buffer.from(hex, "hex").toString("latin1")})` : match
    );
}

function pngDimensions(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Decode the IDAT chunks of the exports' own encoder (filter 0, RGBA8). */
function pngPixels(png: Buffer) {
  const { width, height } = pngDimensions(png);
  const chunks: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const scanlines = inflateSync(Buffer.concat(chunks));
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    scanlines.copy(pixels, y * width * 4, y * stride + 1, (y + 1) * stride);
  }
  return { width, height, pixels };
}

const pilotModel: SenaModel = buildSenaModel(pilotDataset());
const pilotFigure = buildSenaPublicationFigure(pilotModel);

describe("SENA publication figure export", () => {
  it("renders the canonical ENA plane, not a metric card, into the exported SVG", async () => {
    expect(pilotFigure.status).toBe("computed");
    expect(pilotFigure.nodes).toHaveLength(pilotModel.codes.length);
    expect(pilotFigure.edges.length).toBeGreaterThan(0);
    expect(pilotFigure.units).toHaveLength(pilotModel.people.length);

    const snapshot = publicationSnapshot(pilotDataset(), "Publication Figure Fixture");
    const exported = await buildSenaPublicationExport(snapshot, "svg");
    const svg = String(exported.body);

    // Plotted geometry derived from the model: one node mark per code, one edge
    // mark per drawn ENA connection, unit points, and the axis cross.
    expect(svg).toContain('data-sena-figure="canonical-ena-plane"');
    expect(occurrences(svg, 'data-plot-role="network-node"')).toBe(pilotFigure.nodes.length);
    expect(occurrences(svg, 'data-plot-role="network-edge"')).toBe(pilotFigure.edges.length);
    expect(occurrences(svg, 'data-plot-role="point"')).toBe(pilotFigure.units.length);
    expect(svg).toContain('data-plot-role="axes"');
    expect(svg).toContain('data-plot-role="x-axis-title"');
    expect(svg).toContain('data-plot-role="y-axis-title"');

    // Real code names on real node marks — a metric bar chart has neither.
    for (const code of pilotModel.codes) expect(svg).toContain(code.label);
    expect(svg).toContain('data-plot-role="network-node-label"');
    for (const node of pilotFigure.nodes) expect(svg).toContain(`data-node-id="${node.id}"`);

    // Every edge carries the weight it was drawn from, so the ink is checkable.
    const edgeWeights = attributeValues(svg, "data-edge-weight").map(Number);
    expect(edgeWeights).toHaveLength(pilotFigure.edges.length);
    expect(edgeWeights.every((weight) => Number.isFinite(weight) && weight > 0)).toBe(true);

    // The figure is the dominant content: more plotted marks than metric rows,
    // and a plate that occupies most of the canvas.
    expect(occurrences(svg, 'data-plot-role="network-edge"')).toBeGreaterThan(
      occurrences(svg, 'data-sena-metric="')
    );
    expect(svg).toContain("SENA publication export");

    // The model definition an ENA figure is unreadable without.
    expect(svg).toContain("MovingStanzaWindow");
    expect(svg).toContain("Co-registration");
  });

  it("derives the figure from the model — a different model draws a different plane", () => {
    const reducedModel = buildSenaModel(reducedDataset());
    const reducedFigure = buildSenaPublicationFigure(reducedModel);

    expect(reducedFigure.status).toBe("computed");
    const pilotNodes = pilotFigure.nodes.map((node) => `${node.id}:${node.x.toFixed(3)}:${node.y.toFixed(3)}`);
    const reducedNodes = reducedFigure.nodes.map((node) => `${node.id}:${node.x.toFixed(3)}:${node.y.toFixed(3)}`);
    expect(reducedNodes).not.toEqual(pilotNodes);

    const pilotSvg = buildSenaPublicationSvg(pilotModel, "Fixture");
    const reducedSvg = buildSenaPublicationSvg(reducedModel, "Fixture");
    expect(reducedSvg).not.toBe(pilotSvg);
    expect(attributeValues(reducedSvg, "data-edge-weight")).not.toEqual(
      attributeValues(pilotSvg, "data-edge-weight")
    );

    const pilotPng = buildSenaPublicationPng(pilotModel, "Fixture");
    const reducedPng = buildSenaPublicationPng(reducedModel, "Fixture");
    expect(reducedPng.equals(pilotPng)).toBe(false);
  });

  it("rasterises the same plane geometry into the exported PNG", async () => {
    const snapshot = publicationSnapshot(pilotDataset(), "Publication Figure Fixture");
    const exported = await buildSenaPublicationExport(snapshot, "png");
    const png = exported.body as Buffer;
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const { width, height, pixels } = pngPixels(png);
    const plate = pilotFigure.raster;
    expect(width).toBeGreaterThanOrEqual(plate.x + plate.width);
    expect(height).toBeGreaterThanOrEqual(plate.y + plate.height);

    // The plate is a drawn figure: many distinct colours from anti-aliased
    // edges and discs, and at least one node-dark pixel. A blank plate or a
    // block of flat metric bars cannot satisfy both.
    const colours = new Set<string>();
    let darkPixels = 0;
    let bluePixels = 0;
    for (let y = plate.y; y < plate.y + plate.height; y += 1) {
      for (let x = plate.x; x < plate.x + plate.width; x += 1) {
        const offset = (y * width + x) * 4;
        const [r, g, b] = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
        colours.add(`${r},${g},${b}`);
        if (r < 60 && g < 70 && b < 90) darkPixels += 1;
        if (b > r + 20 && b > 90) bluePixels += 1;
      }
    }
    expect(colours.size).toBeGreaterThan(40);
    expect(darkPixels).toBeGreaterThan(200);
    expect(bluePixels).toBeGreaterThan(200);
  });

  it("carries the figure into the HTML artifact, not just a prose Figures section", async () => {
    const snapshot = publicationSnapshot(pilotDataset(), "Publication Figure Fixture");
    const html = String((await buildSenaPublicationExport(snapshot, "html")).body);

    // The report's own "Figures" heading is prose (counts), so asserting the word
    // "Figures" would pass against the figure-less document this test exists to forbid.
    expect(html).toContain('data-sena-figure="canonical-ena-plane"');
    expect(html).toContain("<svg");
    // Inlined, not linked: the artifact must stay a single self-contained file.
    expect(html).not.toContain("<?xml");
    // Real plotted geometry, in the count the model actually produces — a decorative
    // or placeholder svg would not track the fixture.
    expect(occurrences(html, 'data-plot-role="network-edge"')).toBe(pilotFigure.edges.length);
    expect(occurrences(html, 'data-plot-role="network-node"')).toBe(pilotFigure.nodes.length);
  });

  it("carries the figure into the package, DOCX, and PDF artifacts", async () => {
    const snapshot = publicationSnapshot(pilotDataset(), "Publication Figure Fixture");

    const packaged = await buildSenaPublicationExport(snapshot, "package");
    const parsed = JSON.parse(String(packaged.body)) as {
      figureEvidence: { status: string; figure: string; nodes: number; edges: number; units: number };
      artifacts: Array<{ format: string; bodyBase64: string }>;
    };
    expect(parsed.figureEvidence).toEqual(expect.objectContaining({
      status: "computed",
      figure: "canonical-ena-plane",
      nodes: pilotFigure.nodes.length,
      edges: pilotFigure.edges.length,
      units: pilotFigure.units.length
    }));
    const packagedSvg = Buffer.from(
      parsed.artifacts.find((artifact) => artifact.format === "svg")?.bodyBase64 ?? "",
      "base64"
    ).toString("utf8");
    expect(occurrences(packagedSvg, 'data-plot-role="network-edge"')).toBe(pilotFigure.edges.length);

    const docx = (await buildSenaPublicationExport(snapshot, "docx")).body as Buffer;
    const docxEntries = docx.toString("latin1");
    expect(docxEntries).toContain("word/media/");
    expect(docxEntries).toMatch(/word\/media\/[^\s"]*\.svg/);
    expect(docxEntries).toMatch(/word\/media\/[^\s"]*\.png/);

    const pdf = (await buildSenaPublicationExport(snapshot, "pdf")).body as Buffer;
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pdfContent = pdfContentStreams(pdf);
    // Vector figure drawn straight onto the page: the code labels are real
    // selectable PDF text and the edges are real stroked path operators, not an
    // embedded raster. A PDF that pasted in the PNG would have neither.
    for (const code of pilotModel.codes) expect(pdfContent).toContain(`(${code.label})`);
    expect(pdfContent).toContain("(Canonical ENA plane)");
    const strokedPaths = (pdfContent.match(/\bS\n/g) ?? []).length;
    expect(strokedPaths).toBeGreaterThanOrEqual(pilotFigure.edges.length);
    expect(pdfContent).not.toContain("/Image");
  });
});
