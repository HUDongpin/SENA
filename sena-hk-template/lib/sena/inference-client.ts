/**
 * Browser-facing validation runtime surface.
 *
 * Keeping this export list explicit lets the workspace's lazy client chunk
 * tree-shake server-only source-custody, retained-evidence, and hashing code
 * from the much larger inference module.
 */
export {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite
} from "./inference";

export type { SenaGroupComparisonSourceBuildAdmissionLimits } from "./inference";
