export const SENA_KERNEL_PACKAGE = {
  name: "@sena/kernel",
  version: "0.1.0-advisory",
  moduleMap: [
    "M2 data contract",
    "M3 layer construction",
    "M4 fusion assembly",
    "M5 graph operators",
    "M6 embedding diagnostics",
    "M7 temporal runtime",
    "M8 provenance envelope"
  ]
} as const;

export { buildSenaModel, scopeSenaDatasetToWindow } from "../../lib/sena/model";
export {
  buildSenaAnalysisProvenanceEnvelope,
  buildSenaAnalysisRun,
  resolveSenaAnalysisRunSource,
  type SenaAnalysisRunInput,
  type SenaAnalysisRunSourceKind
} from "../../lib/sena/analysis-run";
export {
  buildSenaDataContractAudit,
  buildSenaDataContractAuditArtifact,
  buildSenaDatasetContentHash,
  buildSenaStableContentHash,
  type SenaDataContractAuditArtifactOptions,
  type SenaDataContractAuditOptions
} from "../../lib/sena/data-contract-audit";
export {
  buildSenaFusionAdjacency,
  senaAttributionOperatorDiagnostics,
  senaDirectedOutDegreeLaplacianDiagnostics,
  senaEpsilonRegularizedRandomWalkLaplacian,
  findSenaIsolatedVertices,
  normalizeSenaMatrix,
  senaCommuteTimeEmbeddingDiagnostics,
  senaCombinatorialLaplacian,
  senaDegreeVector,
  senaLaplacianEigenmapDiagnostics,
  senaOutDegreeLaplacian,
  senaOutDegreeRandomWalkDiagnostics,
  senaSchoenbergMdsDiagnostics,
  senaShortestPathDissimilarity,
  senaSymmetrizeMatrix,
  senaSymmetricEigenDecomposition,
  senaSymmetricEigenvalues,
  senaZeroInverseNormalizedLaplacian,
  SENA_ADMISSIBLE_NORMALIZATIONS,
  SENA_GRAPH_OPERATOR_CONVENTIONS,
  type SenaAdmissibleNormalization,
  type SenaAttributionOperatorDiagnostics,
  type SenaCommuteTimeEmbeddingDiagnostics,
  type SenaDirectedOutDegreeLaplacianDiagnostics,
  type SenaFusionAdjacencyInput,
  type SenaIsolatedVertex,
  type SenaLaplacianEigenmapDiagnostics,
  type SenaNormalizationResult,
  type SenaOutDegreeRandomWalkDiagnostics,
  type SenaSchoenbergMdsDiagnostics,
  type SenaSchoenbergMdsOptions,
  type SenaSymmetricEigenDecomposition
} from "../../lib/sena/operators";
export { buildSenaTemporalRuntimeTrace, type SenaTemporalRuntimeTraceOptions } from "../../lib/sena/temporal-runtime";
export {
  SenaInputValidationError,
  SENA_CANONICAL_UINT32_MAX,
  validateSenaAnalyticalInputs,
  validateSenaFusionAdjacencyInputs,
  type SenaFusionAdjacencyValidationInput,
  type SenaInputValidationIssue,
  type SenaInputValidationRule
} from "../../lib/sena/analytical-input-validation";
export type {
  SenaBuildOptions,
  SenaDataset,
  SenaMatrices,
  SenaModel,
  SenaOperatorDiagnostics,
  SenaRuntimeBundle
} from "../../lib/sena/types";
