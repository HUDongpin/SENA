export type SenaProductionEvidenceArtifactRead = {
  file?: string;
  artifact: Record<string, unknown>;
  artifactSha256: string;
  shaFilePresent: boolean;
  shaFileMatches: boolean;
};

export type SenaCollectedProductionEvidenceArtifactRead = SenaProductionEvidenceArtifactRead & {
  file: string;
};

export type SenaProductionEvidenceBindingPlan = {
  bindable: boolean;
  reason?: string;
  binding?: {
    env: {
      confirmed: string;
    };
  };
  env?: Map<string, string>;
};

export function validateSenaPerformanceBudgetArtifactForBinding(
  artifact: unknown,
  localEvidence: unknown
): string | undefined;

export function planSenaProductionEvidenceArtifactBinding(
  read: SenaProductionEvidenceArtifactRead,
  options: Record<string, unknown>,
  localPerformanceEvidence?: unknown
): SenaProductionEvidenceBindingPlan;

export function collectSenaProductionEvidenceArtifactReads(options: {
  artifacts: string[];
  evidenceDirs: string[];
}): SenaCollectedProductionEvidenceArtifactRead[];

export function classifySenaProductionEvidenceArchiveChildClaims(claims: Array<{
  file: string;
  canonicalFile: string;
  artifactSha256: unknown;
}>): {
  pinGroups: Map<string, Array<{
    file: string;
    canonicalFile: string;
    artifactSha256: unknown;
  }>>;
  pinHashesByFile: Map<string, Set<unknown>>;
  canonicalFilesByFile: Map<string, Set<string>>;
  blockedCanonicalFiles: Set<string>;
};

export function writeSenaProductionEvidenceBindingPlanToVercel(
  options: {
    environment: string;
    scope?: string;
  },
  result: SenaProductionEvidenceBindingPlan & {
    binding: {
      env: {
        confirmed: string;
      };
    };
    env: Map<string, string>;
  }
): void;
