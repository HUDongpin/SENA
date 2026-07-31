import type { ENAPlotModel, ENAPlotTrace } from "jena-js/plot";

/**
 * webENA's Plot Tools, as data.
 *
 * The controls split in two by what they touch. Model options change the space
 * itself — which way an axis runs, what it is called, which codes are in it —
 * and are applied by transforming the plot model before it reaches the
 * renderer, so `EnaPlot` keeps one rendering path and the jena-js parity suite
 * keeps comparing like with like. Ink options change how the same space is
 * drawn — marker size, edge thickness, which labels are inked — and are passed
 * to the renderer, where every default reproduces jena-js exactly.
 */
export type EnaPlotModelDisplay = {
  /** Mirror the X axis about the data origin — rENA's flip. */
  flipX: boolean;
  flipY: boolean;
  /** webENA's "dimension labels": the axis titles, on or off. */
  showAxisTitles: boolean;
  /** Empty keeps the rotation's own dimension name. */
  axisTitleX: string;
  axisTitleY: string;
  /** Codes with no surviving connection: drawn, or dropped from the network. */
  showUnconnectedCodes: boolean;
};

export type EnaPlotInkDisplay = {
  /** Multiplier on unit/group marker radius — webENA's "scale units". */
  unitScale: number;
  /** Multiplier on edge stroke width — webENA's "scale for edge weights". */
  edgeWeightScale: number;
  /** Print each drawn edge's mean weight beside it. */
  showEdgeWeights: boolean;
  showCodeLabels: boolean;
  /** A gate, not an override: labels still stand down on a crowded plot. */
  showUnitLabels: boolean;
  showGroupLabels: boolean;
};

export type EnaPlotDisplay = EnaPlotModelDisplay &
  EnaPlotInkDisplay & {
    /** Append each dimension's variance share to its axis title. */
    showVariance: boolean;
  };

export const defaultEnaPlotDisplay: EnaPlotDisplay = {
  flipX: false,
  flipY: false,
  showAxisTitles: true,
  axisTitleX: "",
  axisTitleY: "",
  showUnconnectedCodes: true,
  unitScale: 1,
  edgeWeightScale: 1,
  showEdgeWeights: false,
  showCodeLabels: true,
  showUnitLabels: true,
  showGroupLabels: true,
  showVariance: true
};

export const enaPlotScaleRange = { min: 0.5, max: 2.5 } as const;

export function clampEnaPlotScale(scale: number) {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(enaPlotScaleRange.max, Math.max(enaPlotScaleRange.min, scale));
}

function labelledTraceTypes(display: EnaPlotInkDisplay) {
  const hidden = new Set<ENAPlotTrace["type"]>();
  if (!display.showUnitLabels) {
    hidden.add("points");
    hidden.add("trajectory");
  }
  if (!display.showGroupLabels) hidden.add("group");
  if (!display.showCodeLabels) hidden.add("nodes");
  return hidden;
}

function connectedCodeIds(trace: ENAPlotTrace) {
  const connected = new Set<string>();
  for (const edge of trace.network?.edges ?? []) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return connected;
}

/**
 * Apply the model-space options. Pure: the input model is never mutated, so a
 * control can be turned off again and land back on exactly the original space.
 *
 * Flipping negates coordinates and leaves the axis range alone, which is an
 * exact mirror because jena-js ranges are symmetric about zero
 * (`enaAxisRange`). Nothing moves outside the visible window.
 */
export function applyEnaPlotModelDisplay(
  model: ENAPlotModel,
  display: EnaPlotModelDisplay
): ENAPlotModel {
  const flipXSign = display.flipX ? -1 : 1;
  const flipYSign = display.flipY ? -1 : 1;
  const hideUnconnected = !display.showUnconnectedCodes;

  const traces = model.traces.map((trace) => {
    const next: ENAPlotTrace = { ...trace };

    if (trace.points) {
      next.points = trace.points.map((point) => ({
        ...point,
        x: point.x * flipXSign,
        y: point.y * flipYSign
      }));
    }

    if (trace.network) {
      const connected = hideUnconnected ? connectedCodeIds(trace) : null;
      next.network = {
        edges: trace.network.edges,
        nodes: trace.network.nodes
          .filter((node) => (connected ? connected.has(node.id) : true))
          .map((node) => ({
            ...node,
            x: node.x === undefined ? node.x : node.x * flipXSign,
            y: node.y === undefined ? node.y : node.y * flipYSign
          }))
      };
    }

    return next;
  });

  const xTitle = display.showAxisTitles ? display.axisTitleX.trim() || model.axes.x.title : "";
  const yTitle = display.showAxisTitles ? display.axisTitleY.trim() || model.axes.y.title : "";

  return {
    ...model,
    axes: {
      x: { ...model.axes.x, title: xTitle },
      y: { ...model.axes.y, title: yTitle }
    },
    traces
  };
}

/**
 * Variance shares re-keyed onto the titles the plot will actually print.
 *
 * `EnaPlot` looks a share up by axis title, so a renamed axis would silently
 * lose its "· 44.1%" without this remap. Returns undefined when the researcher
 * has turned variance off, which is the same signal as having no variance.
 */
export function enaPlotDisplayVariance(
  model: ENAPlotModel,
  variance: Record<string, number> | undefined,
  display: EnaPlotDisplay
): Record<string, number> | undefined {
  if (!display.showVariance || !variance || !display.showAxisTitles) return undefined;

  const [xDimension, yDimension] = model.dimensions;
  const xTitle = display.axisTitleX.trim() || model.axes.x.title;
  const yTitle = display.axisTitleY.trim() || model.axes.y.title;
  const remapped: Record<string, number> = { ...variance };

  const xShare = variance[xDimension] ?? variance[model.axes.x.title];
  const yShare = variance[yDimension] ?? variance[model.axes.y.title];
  if (xShare !== undefined) remapped[xTitle] = xShare;
  if (yShare !== undefined) remapped[yTitle] = yShare;

  return remapped;
}

/** Ink options as the renderer wants them, with every value clamped. */
export function enaPlotInkDisplay(display: EnaPlotDisplay): EnaPlotInkDisplay {
  return {
    unitScale: clampEnaPlotScale(display.unitScale),
    edgeWeightScale: clampEnaPlotScale(display.edgeWeightScale),
    showEdgeWeights: display.showEdgeWeights,
    showCodeLabels: display.showCodeLabels,
    showUnitLabels: display.showUnitLabels,
    showGroupLabels: display.showGroupLabels
  };
}

/** True when the traces of this type should have their labels inked. */
export function enaPlotTraceLabelsVisible(type: ENAPlotTrace["type"], display: EnaPlotInkDisplay) {
  return !labelledTraceTypes(display).has(type);
}
