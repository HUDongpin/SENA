import {
  assertSenaReliabilityProjectBindingMatchesSnapshot,
  isValidSenaReliabilityProjectBinding,
  normalizeSenaReliabilityDashboard,
  type SenaReliabilityDashboard
} from "../reliability";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import type {
  SenaEnterpriseReliabilityAdjudicationCoverage,
  SenaEnterpriseReliabilityRun
} from "./reliability-runs";
import type { SenaEnterpriseAdjudicationRecord } from "./team-collaboration";
import type { SenaEnterpriseProject } from "./team-project";

function exactStringArray(left: unknown, right: string[]) {
  return Array.isArray(left) && left.length === right.length &&
    left.every((entry, index) => entry === right[index]);
}

function canonicalBooleanEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.every(([coderId, decision]) => coderId.length > 0 && typeof decision === "boolean")
    ? entries as Array<[string, boolean]>
    : null;
}

function exactCoderValues(value: unknown, expected: Record<string, boolean>, coderIds: string[]) {
  const submitted = canonicalBooleanEntries(value);
  const canonicalExpected = canonicalBooleanEntries(expected);
  return submitted !== null && canonicalExpected !== null &&
    exactStringArray(submitted.map(([coderId]) => coderId), coderIds) &&
    JSON.stringify(submitted) === JSON.stringify(canonicalExpected);
}

function adjudicationBindingError() {
  return new SenaEnterpriseError(
    "Reliability adjudication binding does not match the current project revision and canonical disagreement queue.",
    409,
    "reliability_adjudication_binding_invalid"
  );
}

export function assertEnterpriseReliabilityRunCurrentProject(
  run: SenaEnterpriseReliabilityRun,
  project: Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">
): SenaReliabilityDashboard {
  const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
  const binding = run.projectBinding;
  if (!run.projectId || run.projectId !== project.id || run.teamId !== project.teamId ||
    !isValidSenaReliabilityProjectBinding(binding) ||
    JSON.stringify(binding) !== JSON.stringify(dashboard.projectBinding) ||
    binding.projectId !== project.id || binding.projectVersion !== project.currentVersion) {
    throw adjudicationBindingError();
  }
  try {
    assertSenaReliabilityProjectBindingMatchesSnapshot(binding, project.snapshot, {
      projectId: project.id,
      projectVersion: project.currentVersion
    });
  } catch {
    throw adjudicationBindingError();
  }
  return dashboard;
}

export function assertEnterpriseReliabilityAdjudicationRecord(
  run: SenaEnterpriseReliabilityRun,
  project: Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">,
  record: SenaEnterpriseAdjudicationRecord
) {
  const dashboard = assertEnterpriseReliabilityRunCurrentProject(run, project);
  const disagreement = dashboard.adjudicationQueue.find((candidate) => (
    candidate.itemId === record.itemId && candidate.codeId === record.codeId
  ));
  if (!disagreement || record.projectId !== project.id || record.teamId !== project.teamId ||
    record.reliabilityRunId !== run.id || record.projectVersion !== project.currentVersion ||
    record.snapshotFingerprint !== run.projectBinding?.snapshotFingerprint ||
    !exactStringArray(record.coderIds, dashboard.coderIds) ||
    !exactCoderValues(record.coderValues, disagreement.values, dashboard.coderIds) ||
    !["include", "exclude", "revise"].includes(record.decision) ||
    typeof record.reviewerId !== "string" || record.reviewerId.length === 0 ||
    typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
    throw adjudicationBindingError();
  }
}

function roundedCoverageRate(resolved: number, queued: number) {
  if (queued === 0) return 1;
  return Number((resolved / queued).toFixed(4));
}

export function buildEnterpriseReliabilityAdjudicationCoverage(
  run: SenaEnterpriseReliabilityRun,
  project: Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">,
  adjudications: SenaEnterpriseAdjudicationRecord[]
): SenaEnterpriseReliabilityAdjudicationCoverage {
  const dashboard = assertEnterpriseReliabilityRunCurrentProject(run, project);
  const queueKeys = new Set(dashboard.adjudicationQueue.map((entry) => `${entry.itemId}\u0000${entry.codeId}`));
  const latestByDisagreement = new Map<string, SenaEnterpriseAdjudicationRecord>();
  adjudications
    .filter((record) => record.reliabilityRunId === run.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .forEach((record) => {
      assertEnterpriseReliabilityAdjudicationRecord(run, project, record);
      const key = `${record.itemId}\u0000${record.codeId}`;
      if (!queueKeys.has(key)) throw adjudicationBindingError();
      latestByDisagreement.set(key, record);
    });
  const decisions = { include: 0, exclude: 0, revise: 0 };
  let updatedAt = run.reviewedAt ?? run.createdAt;
  for (const record of latestByDisagreement.values()) {
    decisions[record.decision] += 1;
    if (record.createdAt.localeCompare(updatedAt) > 0) updatedAt = record.createdAt;
  }
  const queuedDisagreements = queueKeys.size;
  const resolvedDisagreements = latestByDisagreement.size;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
    queuedDisagreements,
    resolvedDisagreements,
    unresolvedDisagreements: Math.max(queuedDisagreements - resolvedDisagreements, 0),
    coverageRate: roundedCoverageRate(resolvedDisagreements, queuedDisagreements),
    decisions,
    updatedAt
  };
}
