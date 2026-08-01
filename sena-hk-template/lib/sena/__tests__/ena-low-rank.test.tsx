import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SenaEnaSpacePlot } from "../../../components/sena/workspace/ena-space-plot";
import { jenaPlotGeometry } from "../../ena/plot-encoding";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaEnaPlotComposition } from "../ena-plot-model";
import { buildSenaMethodProtocol } from "../method-protocol";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaMarkdownReport, buildSenaReport, buildSenaValidation } from "../report";
import { buildSenaRuntimeConsistencyAudit } from "../runtime-consistency";
import { buildSenaSnaManifest } from "../sna-manifest";
import type { SenaDataset } from "../types";

// The 2026-07-31 rank audit (docs/validation/ena-window-rank-audit.md) found
// five scoped pilot windows whose second ENA axis is machine-epsilon noise —
// every one a 2-unit window. This suite pins the disclosure: a degenerate
// window's composition carries a low-rank assessment and ENA Space draws the
// badge, while the healthy full timeline stays badge-free.

const fullModel = buildSenaModel(lessonStudySenaContract);
// Windows are built per temporal mode; the audit's turn-window:0:0-2 needs a
// model built with that mode (radius 1 gives the 0-2 span around turn 1).
const turnWindowModel = buildSenaModel(lessonStudySenaContract, {
  temporal: { mode: "turn-window", turnWindowRadius: 1 }
});
const layers = { social: true, concept: true, bridge: true };

/**
 * The badge's own box in canvas coordinates, next to the box the SVG is showing.
 * Both come out of the rendered markup rather than out of the component's
 * arithmetic, so the assertion is about what a reader sees.
 */
function badgeAndViewBox(markup: string) {
  const viewBox = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(markup);
  const badge =
    /<g data-sena-layer="low-rank-warning"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"[^>]*>.*?<rect[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(
      markup
    );

  expect(viewBox, "expected a viewBox on the plot").not.toBeNull();
  expect(badge, "expected a transformed low-rank badge").not.toBeNull();
  if (!viewBox || !badge) throw new Error("unreadable plot markup");

  const scale = Number(badge[3]);
  const left = Number(badge[1]);
  const top = Number(badge[2]);

  return {
    view: {
      left: Number(viewBox[1]),
      top: Number(viewBox[2]),
      right: Number(viewBox[1]) + Number(viewBox[3]),
      bottom: Number(viewBox[2]) + Number(viewBox[4])
    },
    badge: {
      left,
      top,
      right: left + Number(badge[4]) * scale,
      bottom: top + Number(badge[5]) * scale,
      scale,
      /** Unscaled plate width — the badge's size before the zoom compensation. */
      drawnWidth: Number(badge[4])
    }
  };
}

function compositionForWindow(mode: string, index: number) {
  const window = turnWindowModel.temporal.windows.find(
    (candidate) => candidate.mode === mode && candidate.index === index
  );
  expect(window, `expected ${mode}:${index} window in the pilot`).toBeDefined();
  if (!window) throw new Error(`missing ${mode}:${index}`);

  const scoped = scopeSenaDatasetToWindow(lessonStudySenaContract, window);
  const scopedModel = buildSenaModel(scoped);
  const manifest = buildSenaEnaManifest(scoped);
  return {
    scopedModel,
    manifest,
    composition: buildSenaEnaPlotComposition(manifest, scopedModel.people, scopedModel.codes)
  };
}

describe("low-rank ENA windows disclose their degenerate axis", () => {
  it("flags the audit's turn-window:0 (2 units, SVD2 numerically zero)", () => {
    const { composition } = compositionForWindow("turn-window", 0);

    expect(composition.status).toBe("computed");
    expect(composition.lowRank).not.toBeNull();
    expect(composition.lowRank?.reason).toBe("units");
    expect(composition.lowRank?.units).toBe(2);
    expect(composition.lowRank?.svd2Share).toBeLessThan(1e-6);
  });

  it("leaves the full timeline unflagged (4 units, SVD2 34.6%)", () => {
    const manifest = buildSenaEnaManifest(lessonStudySenaContract);
    const composition = buildSenaEnaPlotComposition(manifest, fullModel.people, fullModel.codes);

    expect(composition.status).toBe("computed");
    expect(composition.lowRank).toBeNull();
  });

  it("draws the badge as marked SENA chrome on a degenerate window only", () => {
    const degenerate = compositionForWindow("turn-window", 0);
    const degenerateMarkup = renderToStaticMarkup(
      <SenaEnaSpacePlot
        model={degenerate.scopedModel}
        enaManifest={degenerate.manifest}
        layers={layers}
        threshold={0}
        selectedId=""
        onSelect={() => undefined}
      />
    );

    expect(degenerateMarkup).toContain('data-sena-layer="low-rank-warning"');
    expect(degenerateMarkup).toContain('data-low-rank-reason="units"');
    expect(degenerateMarkup).toContain("1-D structure");

    const healthyManifest = buildSenaEnaManifest(lessonStudySenaContract);
    const healthyMarkup = renderToStaticMarkup(
      <SenaEnaSpacePlot
        model={fullModel}
        enaManifest={healthyManifest}
        layers={layers}
        threshold={0}
        selectedId=""
        onSelect={() => undefined}
      />
    );

    expect(healthyMarkup).not.toContain("low-rank-warning");
  });

  // The badge used to sit at a fixed spot on the 720x520 canvas while zoom
  // shrinks the viewBox around the centre, so from about 1.05x up the only
  // disclosure ENA Space carries was outside the frame — it vanished exactly
  // when a researcher looked closer at the degenerate axis.
  it("keeps the badge inside the frame at every zoom the plot allows", () => {
    const degenerate = compositionForWindow("turn-window", 0);

    for (const zoom of [0.6, 0.8, 1, 1.05, 2, 4]) {
      const markup = renderToStaticMarkup(
        <SenaEnaSpacePlot
          model={degenerate.scopedModel}
          enaManifest={degenerate.manifest}
          layers={layers}
          threshold={0}
          selectedId=""
          onSelect={() => undefined}
          zoom={zoom}
        />
      );

      const { view, badge } = badgeAndViewBox(markup);
      // The frame is the visible box *and* the paper: below 1x the viewBox
      // grows past the card, and an anchor that tracked only the visible box
      // would put the disclosure in the gutter beside the plot, off the plate
      // it is reporting on. Both bounds, at every zoom.
      const frame = {
        left: Math.max(view.left, 0),
        top: Math.max(view.top, 0),
        right: Math.min(view.right, jenaPlotGeometry.width),
        bottom: Math.min(view.bottom, jenaPlotGeometry.height)
      };

      expect(badge.left, `zoom ${zoom} left edge`).toBeGreaterThanOrEqual(frame.left);
      expect(badge.top, `zoom ${zoom} top edge`).toBeGreaterThanOrEqual(frame.top);
      expect(badge.right, `zoom ${zoom} right edge`).toBeLessThanOrEqual(frame.right);
      expect(badge.bottom, `zoom ${zoom} bottom edge`).toBeLessThanOrEqual(frame.bottom);
      // Counter-scaled, so the plate reads at one size on screen instead of
      // growing into the plot as the space around it shrinks.
      expect(badge.drawnWidth * badge.scale * zoom).toBeCloseTo(badge.drawnWidth, 1);
    }

    // The zoom-out cases are only meaningful if the box really did outgrow the
    // card there; otherwise the clamp assertions above pass vacuously.
    for (const zoom of [0.6, 0.8]) {
      const markup = renderToStaticMarkup(
        <SenaEnaSpacePlot
          model={degenerate.scopedModel}
          enaManifest={degenerate.manifest}
          layers={layers}
          threshold={0}
          selectedId=""
          onSelect={() => undefined}
          zoom={zoom}
        />
      );
      const { view } = badgeAndViewBox(markup);

      expect(view.right, `zoom ${zoom} shows more than the card`).toBeGreaterThan(jenaPlotGeometry.width);
      expect(view.top, `zoom ${zoom} shows more than the card`).toBeLessThan(0);
    }
  });

  it("writes the caveat out in text as well, where no tooltip is needed", () => {
    const degenerate = compositionForWindow("turn-window", 0);
    const markup = renderToStaticMarkup(
      <SenaEnaSpacePlot
        model={degenerate.scopedModel}
        enaManifest={degenerate.manifest}
        layers={layers}
        threshold={0}
        selectedId=""
        onSelect={() => undefined}
        zoom={4}
      />
    );

    expect(markup).toContain('data-visual-role="ena-space-low-rank-note"');
    expect(markup).toContain("Read positions along the first axis only.");

    const healthyMarkup = renderToStaticMarkup(
      <SenaEnaSpacePlot
        model={fullModel}
        enaManifest={buildSenaEnaManifest(lessonStudySenaContract)}
        layers={layers}
        threshold={0}
        selectedId=""
        onSelect={() => undefined}
      />
    );

    expect(healthyMarkup).not.toContain("ena-space-low-rank-note");
  });

  // The assessment's unit count is the projection's, not the plot's: a point row
  // whose person id does not resolve is dropped before plotting, and counting
  // the survivors let dropped rows fabricate a degenerate space.
  it("assesses from the manifest's unit count, not the plotted survivors", () => {
    const manifest = buildSenaEnaManifest(lessonStudySenaContract);
    // Half the people withheld, so half the point rows fail to resolve — the
    // projection is still the healthy 4-unit one the audit measured.
    const halfThePeople = fullModel.people.slice(0, 2);
    const composition = buildSenaEnaPlotComposition(manifest, halfThePeople, fullModel.codes);

    expect(manifest.datasetCounts.units).toBe(4);
    expect(composition.units).toHaveLength(2);
    expect(composition.lowRank).toBeNull();
  });
});

// The badge and the axis titles sit on the same figure quoting the same axis,
// and until now they quoted it on two different bases *and* disagreed with
// /workspace/ena, which titles from the raw rotation-column shares (webENA's
// convention). The manifest now carries both bases explicitly: titles read the
// rotation basis on both routes, the badge keeps the renormalized one the rank
// rule is defined on, and each says which it is.
describe("ENA Space titles axes on the same basis as /workspace/ena", () => {
  const manifest = buildSenaEnaManifest(lessonStudySenaContract);
  const outputs = manifest.outputs;

  it("carries the rotation basis beside the displayed one, not instead of it", () => {
    expect(outputs).toBeDefined();
    if (!outputs?.rotationVariance) throw new Error("expected rotation shares on the manifest");

    const [, second] = outputs.dimensions;
    const drawnMass = outputs.dimensions.reduce(
      (total, dimension) => total + (outputs.rotationVariance?.[dimension] ?? 0),
      0
    );

    // The signature of an unrenormalized basis: the two drawn axes do not
    // account for the whole space, and renormalizing them over their own mass
    // reproduces the displayed shares exactly.
    expect(drawnMass).toBeLessThan(1);
    for (const dimension of outputs.dimensions) {
      expect(outputs.variance[dimension]).toBeCloseTo(
        (outputs.rotationVariance[dimension] ?? 0) / drawnMass,
        12
      );
    }
    expect(outputs.rotationVariance[second]).not.toBeCloseTo(outputs.variance[second], 3);
  });

  it("titles the plot with the rotation share, not the renormalized one", () => {
    if (!outputs?.rotationVariance) throw new Error("expected rotation shares on the manifest");
    const [, second] = outputs.dimensions;

    const composition = buildSenaEnaPlotComposition(manifest, fullModel.people, fullModel.codes);
    // `variance` is what the plot titles with — the same thing <EnaPlot>'s prop
    // means — and the renormalized basis stays reachable under its own name.
    expect(composition.variance[second]).toBeCloseTo(outputs.rotationVariance[second], 12);
    expect(composition.displayedVariance[second]).toBeCloseTo(outputs.variance[second], 12);

    const markup = renderToStaticMarkup(
      <SenaEnaSpacePlot
        model={fullModel}
        enaManifest={manifest}
        layers={layers}
        threshold={0}
        selectedId=""
        onSelect={() => undefined}
      />
    );
    const share = (value: number) => `${second} · ${(value * 100).toFixed(1)}%`;

    expect(markup).toContain(share(outputs.rotationVariance[second]));
    expect(markup).not.toContain(share(outputs.variance[second]));
  });

  // Titling the axes on the rotation basis moved the divergence rather than
  // removing it: the renormalized shares still appear in the stats rail, the
  // temporal trace, and the exported report, on the same screen as axes that
  // now read 28.5%. /workspace/ena resolves this by naming the pair where the
  // number is shown; these surfaces now do the same. Labels only — every
  // number here is correct and unchanged.
  it("names the basis on every surface that shows the renormalized shares", () => {
    const workspaceSource = (fileName: string) =>
      readFileSync(join(process.cwd(), "components/sena/workspace", fileName), "utf8");
    const statsPanel = workspaceSource("workspace-stats-panel.tsx");

    expect(statsPanel).toContain('label="Share of displayed variance"');
    // The cell has to go through the helper below, not format a bare share
    // itself — the helper is where the axis gets named.
    expect(statsPanel).toContain("value={displayedVarianceCell(enaManifest.outputs)}");
    expect(statsPanel).toContain('data-visual-role="jena-variance-basis-note"');
    expect(workspaceSource("temporal-runtime-trace-panel.tsx")).toContain("`Displayed variance ${variance}`");
    // The note's gate is covered by rendering the real panel, above — a source
    // pin on the conditional would survive the note being moved out of it.
    // The two bases coincide when the drawn axes carry the whole space, so the
    // pairing is stated as possible rather than certain.
    expect(statsPanel).toContain("can differ");
    expect(statsPanel).not.toContain("so the two percentages differ");
  });

  // Rendered, not read off the source: a source pin on the gate expression
  // stays green if the note is moved out of the conditional altogether, which
  // is exactly the regression the gate exists to prevent.
  it("shows the basis note only when a drawn pair exists to describe", async () => {
    const { WorkspaceStatsPanel } = await import(
      "../../../components/sena/workspace/workspace-stats-panel"
    );
    const noop = () => undefined;

    function renderPanel(dataset: SenaDataset) {
      const panelModel = buildSenaModel(dataset);
      const panelEnaManifest = buildSenaEnaManifest(dataset);
      const snaManifest = buildSenaSnaManifest(panelModel);

      return renderToStaticMarkup(
        <WorkspaceStatsPanel
          model={panelModel}
          enaManifest={panelEnaManifest}
          snaManifest={snaManifest}
          runtimeConsistencyAudit={buildSenaRuntimeConsistencyAudit({
            model: panelModel,
            enaManifest: panelEnaManifest,
            snaManifest
          })}
          methodValidation={buildSenaValidation(panelModel)}
          methodProtocol={buildSenaMethodProtocol(panelModel)}
          icon={() => null}
          onSelect={noop}
          onExportSocialReport={noop}
          onExportEnaManifestJson={noop}
          onExportSnaManifestJson={noop}
          onExportPairReport={noop}
          onExportMetricProvenance={noop}
          onExportMethodProtocol={noop}
        />
      );
    }

    const note = 'data-visual-role="jena-variance-basis-note"';

    // Two drawn axes: the pairing is real and stated.
    expect(renderPanel(lessonStudySenaContract)).toContain(note);

    // One code is below jENA's two-code floor — no projection, no shares.
    const skipped = renderPanel({
      ...lessonStudySenaContract,
      codebook: lessonStudySenaContract.codebook.slice(0, 1)
    });
    expect(skipped).not.toContain(note);

    // Two codes give one adjacency column and so a single rotation column:
    // the cell still names its axis, but there is no pair to renormalize over
    // and the manifest reports SVD1 0%, so the sentence has to stay away.
    const singleDimension = renderPanel({
      ...lessonStudySenaContract,
      codebook: lessonStudySenaContract.codebook.slice(0, 2)
    });
    expect(singleDimension).not.toContain(note);
    expect(singleDimension).toContain("Share of displayed variance");
  });

  // The cell has room for one number, and "65.4%" under a note about
  // renormalizing to 100% reads as "65.4% of the space is displayed" — the
  // opposite of its meaning. It is SVD1's share *within* the drawn pair, so the
  // cell names the axis the way the report and the temporal trace do.
  it("names the axis the stats cell's single percentage belongs to", async () => {
    const { displayedVarianceCell } = await import(
      "../../../components/sena/workspace/workspace-stats-panel"
    );

    expect(displayedVarianceCell(outputs)).toBe(`${outputs?.dimensions[0]} 65.4%`);
    // Nothing to name when the projection was skipped: no bare axis label, and
    // no percentage invented for a manifest that has none.
    expect(displayedVarianceCell(undefined)).toBe("NA");
  });

  it("labels the exported report's variance line without moving its key", () => {
    const markdown = buildSenaMarkdownReport(buildSenaReport(buildSenaModel(lessonStudySenaContract)));

    // The key stays `- Variance: ` so a prefix reader still matches, and the
    // basis rides on the end of the same line rather than replacing anything.
    expect(markdown).toContain("- Variance: ");
    expect(markdown).toContain("(displayed variance)");
    expect(markdown).toContain("- Variance basis: displayed variance renormalizes the drawn dimensions to 100%");
    // The numbers are untouched by the labelling: the line still carries the
    // renormalized shares, in the report's own 3-digit format.
    const [, second] = outputs?.dimensions ?? [];
    const varianceLine = markdown.split("\n").find((line) => line.startsWith("- Variance: "));
    expect(varianceLine).toContain(`${second} ${(outputs?.variance[second] ?? 0).toFixed(3)}`);
    expect(varianceLine).toMatch(/\(displayed variance\)$/);
    // The two bases coincide when the drawn axes carry the whole space, so the
    // report says they can differ, not that they do.
    expect(markdown).toContain("so the two percentages can differ.");
    expect(markdown).not.toContain("rotated space.\n");
  });

  // A skipped projection has no shares, so there is nothing for a basis
  // sentence to be about — unconditional copy explained a number the report
  // does not carry.
  it("omits the basis sentence when the projection reports no variance", () => {
    // One code is below jENA's two-code floor, so the manifest is skipped.
    const singleCode = {
      ...lessonStudySenaContract,
      codebook: lessonStudySenaContract.codebook.slice(0, 1)
    };
    const markdown = buildSenaMarkdownReport(buildSenaReport(buildSenaModel(singleCode)));

    expect(markdown).toContain("- Variance: NA");
    expect(markdown).not.toContain("- Variance basis:");
    expect(markdown).not.toContain("displayed variance");
  });

  // Two codes give one adjacency column and so one rotation column. The basis
  // label still names what the number is, but the sentence asserting a
  // renormalization over "the drawn dimensions" would describe a set of one —
  // and this projection reports SVD1 0, which is not a renormalization to 100%.
  it("omits the basis sentence when the projection draws a single dimension", () => {
    const twoCodes = {
      ...lessonStudySenaContract,
      codebook: lessonStudySenaContract.codebook.slice(0, 2)
    };
    const singleDimensionManifest = buildSenaEnaManifest(twoCodes);
    const markdown = buildSenaMarkdownReport(buildSenaReport(buildSenaModel(twoCodes)));

    expect(singleDimensionManifest.outputs?.dimensions).toEqual(["SVD1"]);
    expect(markdown).toContain("- Variance: SVD1 0 (displayed variance)");
    expect(markdown).not.toContain("- Variance basis:");
  });
});
