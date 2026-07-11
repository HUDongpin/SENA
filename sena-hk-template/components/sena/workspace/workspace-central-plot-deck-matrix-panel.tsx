import { MatrixPreview } from "./matrix-preview";
import type { CentralMatrixViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";

export function CentralMatrixViewPanel({ model }: CentralMatrixViewPanelProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      <MatrixPreview title="S: social layer" rowLabels={model.matrices.S.labels} columnLabels={model.matrices.S.labels} values={model.matrices.S.raw} />
      <MatrixPreview title="W: concept layer" rowLabels={model.matrices.W.labels} columnLabels={model.matrices.W.labels} values={model.matrices.W.raw} />
      <MatrixPreview title="B: bridge layer" rowLabels={model.matrices.B.rowLabels} columnLabels={model.matrices.B.columnLabels} values={model.matrices.B.raw} />
      <MatrixPreview title="G: person-code-pair layer" rowLabels={model.matrices.G.rowLabels} columnLabels={model.matrices.G.columnLabels} values={model.matrices.G.raw} />
    </div>
  );
}
