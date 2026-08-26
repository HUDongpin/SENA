import type { SenaAnalysisRunInput } from "./analysis-run";
import type { SenaEnterpriseServerJobPayloadSummary } from "./enterprise/server-job-queue";

export type SenaAnalysisApiBody = Record<string, unknown>;

export type SenaAnalysisApiProjectSource = {
  id: string;
  teamId: string;
  currentVersion: number;
  title: string;
  snapshot: unknown;
};

export type SenaAnalysisApiRunHeaderSource = {
  id: string;
  sourceKind: string;
  projectId?: string;
  persistedProjectId?: string;
  artifactFingerprints: {
    reportSha256: string;
    projectSnapshotSha256: string;
    runtimeBundleSha256?: string;
  };
};

export type SenaAnalysisApiProjectHeaderSource = {
  id: string;
  currentVersion: number;
};

export type SenaAnalysisQueueJobInput = {
  kind: "analysis";
  teamId: string;
  projectId?: string;
  actorUserId: string;
  payload: Record<string, unknown>;
  payloadSummary: SenaEnterpriseServerJobPayloadSummary;
};

function optionalString(value: unknown) {
  return value ? String(value) : undefined;
}

function optionalNumber(value: unknown) {
  return value === undefined ? undefined : Number(value);
}

export function sanitizeSenaClientCodingReliability(value: unknown): SenaAnalysisRunInput["codingReliability"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const { machineEvidence: _untrustedMachineEvidence, ...documentation } = value as Record<string, unknown>;
  return documentation as SenaAnalysisRunInput["codingReliability"];
}

function analysisSource(body: SenaAnalysisApiBody, sourceProject: SenaAnalysisApiProjectSource | null) {
  if (sourceProject) return "project";
  if (body.snapshot && body.dataset) return "mixed";
  if (body.snapshot) return "snapshot";
  if (body.dataset) return "dataset";
  return "unknown";
}

export function resolveSenaAnalysisTeamId(input: {
  body: SenaAnalysisApiBody;
  sourceProject: SenaAnalysisApiProjectSource | null;
  fallbackTeamId?: string;
}) {
  return String(input.body.teamId || input.sourceProject?.teamId || input.fallbackTeamId || "");
}

export function buildSenaAnalysisRunRequestInput(input: {
  body: SenaAnalysisApiBody;
  sourceProject: SenaAnalysisApiProjectSource | null;
}): SenaAnalysisRunInput {
  const { body, sourceProject } = input;
  return {
    sourceKind: sourceProject ? "project" : undefined,
    snapshot: sourceProject?.snapshot ?? body.snapshot,
    dataset: body.dataset,
    buildOptions: body.buildOptions as SenaAnalysisRunInput["buildOptions"],
    title: optionalString(body.title) ?? sourceProject?.title,
    activeTemporalWindowId: optionalString(body.activeTemporalWindowId),
    includeRuntimeBundle: body.includeRuntimeBundle === true,
    humanReview: body.humanReview as SenaAnalysisRunInput["humanReview"],
    codingReliability: sanitizeSenaClientCodingReliability(body.codingReliability),
    dataGovernance: body.dataGovernance as SenaAnalysisRunInput["dataGovernance"]
  };
}

export function buildSenaAnalysisQueueJobInput(input: {
  body: SenaAnalysisApiBody;
  teamId: string;
  sourceProject: SenaAnalysisApiProjectSource | null;
  actorUserId: string;
  inlinePayloadAllowed: boolean;
}): SenaAnalysisQueueJobInput {
  const { body, sourceProject } = input;
  const activeTemporalWindowId = optionalString(body.activeTemporalWindowId);
  const includeRuntimeBundle = body.includeRuntimeBundle === true;
  const persist = body.persist === true;
  const updateProject = body.updateProject !== false;
  const expectedVersion = optionalNumber(body.expectedVersion);

  return {
    kind: "analysis",
    teamId: input.teamId,
    projectId: sourceProject?.id,
    actorUserId: input.actorUserId,
    payload: {
      action: "run-analysis",
      teamId: input.teamId,
      projectId: sourceProject?.id,
      projectVersion: sourceProject?.currentVersion,
      title: optionalString(body.title) ?? sourceProject?.title,
      activeTemporalWindowId,
      buildOptions: body.buildOptions,
      includeRuntimeBundle,
      humanReview: body.humanReview,
      codingReliability: sanitizeSenaClientCodingReliability(body.codingReliability),
      dataGovernance: body.dataGovernance,
      persist,
      updateProject,
      expectedVersion,
      ...(input.inlinePayloadAllowed ? {
        inlineSnapshot: body.snapshot,
        inlineDataset: body.dataset
      } : {})
    },
    payloadSummary: {
      source: analysisSource(body, sourceProject),
      projectVersion: sourceProject?.currentVersion,
      expectedVersion,
      includeRuntimeBundle,
      persist,
      updateProject,
      activeTemporalWindowId,
      hasInlineSnapshot: Boolean(body.snapshot),
      hasInlineDataset: Boolean(body.dataset),
      payloadValuesExcluded: true
    }
  };
}

export function analysisRunHeaders(
  run: SenaAnalysisApiRunHeaderSource,
  project?: SenaAnalysisApiProjectHeaderSource
): HeadersInit {
  const headers: Record<string, string> = {
    "x-sena-analysis-run-id": run.id,
    "x-sena-analysis-source-kind": run.sourceKind,
    "x-sena-report-sha256": run.artifactFingerprints.reportSha256,
    "x-sena-project-snapshot-sha256": run.artifactFingerprints.projectSnapshotSha256
  };
  const projectId = project?.id ?? run.persistedProjectId ?? run.projectId;
  if (projectId) headers["x-sena-project-id"] = projectId;
  if (project) headers["x-sena-project-version"] = String(project.currentVersion);
  if (run.artifactFingerprints.runtimeBundleSha256) {
    headers["x-sena-runtime-bundle-sha256"] = run.artifactFingerprints.runtimeBundleSha256;
  }
  return headers;
}
