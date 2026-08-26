export const SENA_NEXT_BUILD_ID_GENERATOR: "sena-next-build-input/v2";
export const SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR: "sena-performance-source-custody/v1";

export function isSenaFullGitObjectId(value: unknown): value is string;

export type SenaBuildInputIdentity = {
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

export function senaNextBuildIdFromInputSha256(buildInputSha256: string): string;
export function parseSenaNextBuildId(value: string | undefined): {
  generator: typeof SENA_NEXT_BUILD_ID_GENERATOR | "unknown";
  buildInputSha256: string | "unavailable";
};
export function senaBuildInputSha256(input: Omit<SenaBuildInputIdentity, "buildInputSha256" | "buildId">): string;
export function senaNextBuildIdSha256FromInputSha256(buildInputSha256: string): string;
export function senaSourceFileListSha256(entries: Array<{ path: string }>): string;
export function senaSourceTreeSha256(entries: Array<{ path: string; sha256: string }>): string;
export function senaCanonicalSourceFileHash(root: string, file: string):
  { ok: true; sha256: string } |
  { ok: false; errorHash: string };
export function senaPerformanceSourceCustodyManifestSha256(input: {
  baseGitCommit: string | "unavailable";
  rootGitStatusSha256: string | "unavailable";
  rootGitDirtyFileCount: number | "unknown";
  fileListSha256: string;
  sourceTreeSha256: string;
  fileCount: number;
}): string;
export function collectSenaBuildInputIdentity(root?: string): SenaBuildInputIdentity;
export function generateSenaNextBuildId(root?: string): string;
