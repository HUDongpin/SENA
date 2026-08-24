import type { Stats } from "node:fs";

export const SENA_PERFORMANCE_BUILD_MEASUREMENT_GENERATOR: "sena-performance-build-measurement/v2";

export type SenaPerformanceBudgetRead = {
  actualBrotliBytes?: number;
  missingArtifactFiles: number;
  readErrorHashes: string[];
  readAttempts: number;
  transientReadRecoveries: number;
};

export type SenaPerformanceBuildMeasurement = {
  generator: typeof SENA_PERFORMANCE_BUILD_MEASUREMENT_GENERATOR;
  productionBuildPresent: boolean;
  observationStable: boolean;
  measuredArtifactSetSha256: string | "unavailable";
  measuredArtifactFileCount: number;
  totalStaticJsFiles: number;
  workspaceRouteJsFiles: number;
  traversalErrorCount: number;
  traversalErrorSha256: string;
  metrics: {
    workspaceHtml: SenaPerformanceBudgetRead;
    workspaceRouteJs: SenaPerformanceBudgetRead;
    totalStaticJs: SenaPerformanceBudgetRead;
  };
  observationReadAttempts: number;
  observationTransientRecoveries: number;
};

export function measureSenaPerformanceBuildOutput(root?: string, options?: {
  readFile?: (file: string) => Buffer;
  readdir?: (directory: string) => string[];
  lstat?: (file: string) => Stats;
  attempts?: number;
}): SenaPerformanceBuildMeasurement;

export function senaBuildIdIsRegularFile(root?: string, options?: {
  lstat?: (file: string) => Stats;
}): boolean;

export function validateSenaLocalPerformanceBuildMeasurement(
  artifact: unknown,
  measurement: SenaPerformanceBuildMeasurement
): string | undefined;

export type SenaLocalPerformanceBuildEvidence = {
  measurement: SenaPerformanceBuildMeasurement;
  observationStable: boolean;
  buildIdAvailable: boolean;
  nextBuildIdSha256: string | "missing";
  nextBuildIdGenerator: "sena-next-build-input/v2" | "unknown";
  nextBuildMatchesCurrentSource: boolean;
  currentBuildInputIdentity: {
    gitCommit: string | "unavailable";
    gitDirty: boolean | "unknown";
    gitDirtyFileCount: number | "unknown";
    gitStatusSha256: string | "unavailable";
    packageLockSha256: string | "missing";
    sourceTreeSha256: string;
    sourceFileListSha256: string;
    sourceFileCount: number;
    sourceReadErrorCount: number;
    sourceReadErrorSha256: string;
    buildInputSha256: string;
    buildId: string;
  };
};

export function observeSenaLocalPerformanceBuildEvidence(root?: string, options?: {
  readFile?: (file: string) => Buffer;
  readdir?: (directory: string) => string[];
  lstat?: (file: string) => Stats;
  attempts?: number;
}): SenaLocalPerformanceBuildEvidence;

export function validateSenaLocalPerformanceBuildEvidence(
  artifact: unknown,
  localEvidence: SenaLocalPerformanceBuildEvidence
): string | undefined;
