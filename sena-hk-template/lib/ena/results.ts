import { addNetwork, addNodes, addPoints, createENAPlotModel, type ENAPlotModel, type ENASet, type Row } from "jena-js";
import type { EnaRunResult, EnaRuntime } from "./types";

const plotPalette = ["#18b7c9", "#7b50f5", "#e850d2", "#16a34a", "#f59e0b", "#ef4444"];

function numeric(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function averageConnectionRow(set: ENASet): Row {
  if (set.lineWeights.length === 0) return {};

  return Object.fromEntries(set.codeColumns.map((column) => {
    const value = set.lineWeights.reduce((sum, row) => sum + numeric(row[column]), 0) / set.lineWeights.length;
    return [column, value];
  }));
}

export function buildEnaPlotModel(set: ENASet): ENAPlotModel {
  const model = createENAPlotModel(set, {
    title: "ENA projection",
    scaleTo: "network",
    axisPadding: 1.35,
    palette: plotPalette
  });

  addNetwork(model, set, averageConnectionRow(set), { name: "Mean network", color: plotPalette[0], minWeight: 0.001 });
  addNodes(model, set, { name: "Codes", color: plotPalette[1] });
  addPoints(model, set, undefined, { name: "Units", color: plotPalette[2] });

  return model;
}

export function buildEnaRunResult(
  set: ENASet,
  rowCount: number,
  runtime: EnaRuntime,
  elapsedMs: number,
  warnings: string[]
): EnaRunResult {
  return {
    set,
    plotModel: buildEnaPlotModel(set),
    summary: {
      rows: rowCount,
      units: set.unitLabels.length,
      codes: set.codes.length,
      dimensions: set.rotation.rotationColumns,
      variance: set.variance,
      elapsedMs,
      runtime
    },
    warnings
  };
}
