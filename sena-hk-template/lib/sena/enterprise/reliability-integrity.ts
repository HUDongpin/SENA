import {
  assertSenaReliabilityProjectBindingMatchesSnapshot,
  deriveSenaReliabilityClaimEligibility,
  isSemanticallyValidSenaReliabilityMachineEvidence,
  isValidSenaReliabilityProjectBinding,
  normalizeSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  type SenaReliabilityDashboard,
  type SenaReliabilityDashboardReadModel
} from "../reliability";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import type {
  SenaEnterpriseReliabilityAdjudicationCoverage,
  SenaEnterpriseReliabilityRun
} from "./reliability-runs";
import type { SenaEnterpriseAdjudicationRecord } from "./team-collaboration";
import type { SenaEnterpriseProject, SenaEnterpriseProjectRevision } from "./team-project";
import type {
  SenaCodingReliabilityReview,
  SenaReliabilityProjectBinding
} from "../types";

type SenaEnterpriseReliabilityRunScopeSource = Pick<
  SenaEnterpriseReliabilityRun,
  "id" | "teamId" | "projectId" | "projectBinding"
> & {
  dashboard: SenaReliabilityDashboardReadModel;
};

type SenaEnterpriseReliabilityProjectScope = Pick<
  SenaEnterpriseProject,
  "id" | "teamId" | "currentVersion" | "snapshot"
>;

export type SenaEnterpriseResolvedReliabilityRunProjectScope = {
  scope: "current" | "retained-history";
  project: SenaEnterpriseReliabilityProjectScope;
  dashboard: SenaReliabilityDashboard;
  runIdentity: {
    id: string;
    teamId: string;
    projectId?: string;
    projectBinding?: SenaReliabilityProjectBinding;
  };
};

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

function resolvedReliabilityRunProjectScope(
  run: SenaEnterpriseReliabilityRunScopeSource,
  dashboard: SenaReliabilityDashboard,
  project: SenaEnterpriseReliabilityProjectScope,
  scope: SenaEnterpriseResolvedReliabilityRunProjectScope["scope"]
): SenaEnterpriseResolvedReliabilityRunProjectScope {
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
  return {
    scope,
    project,
    dashboard,
    runIdentity: {
      id: run.id,
      teamId: run.teamId,
      projectId: run.projectId,
      projectBinding: structuredClone(binding)
    }
  };
}

export function assertEnterpriseReliabilityRunCurrentProject(
  run: SenaEnterpriseReliabilityRunScopeSource,
  project: SenaEnterpriseReliabilityProjectScope
): SenaReliabilityDashboard {
  const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
  return resolvedReliabilityRunProjectScope(run, dashboard, project, "current").dashboard;
}

export function resolveEnterpriseReliabilityRunProjectScope(
  run: SenaEnterpriseReliabilityRunScopeSource,
  currentProject: SenaEnterpriseReliabilityProjectScope,
  projectRevisions: Array<Pick<SenaEnterpriseProjectRevision, "projectId" | "teamId" | "version" | "snapshot">>
): SenaEnterpriseResolvedReliabilityRunProjectScope {
  const bindingVersion = run.projectBinding?.projectVersion;
  if (bindingVersion === currentProject.currentVersion) {
    const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
    return resolvedReliabilityRunProjectScope(run, dashboard, currentProject, "current");
  }
  const retainedRevision = projectRevisions.find((revision) => (
    revision.projectId === currentProject.id &&
    revision.teamId === currentProject.teamId &&
    revision.version === bindingVersion
  ));
  if (!retainedRevision) {
    throw new SenaEnterpriseError(
      "Stored reliability run cannot be bound to a current or retained project revision.",
      409,
      "reliability_stored_project_binding_invalid"
    );
  }
  const retainedProject = {
    id: currentProject.id,
    teamId: currentProject.teamId,
    currentVersion: retainedRevision.version,
    snapshot: retainedRevision.snapshot
  };
  const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
  return resolvedReliabilityRunProjectScope(run, dashboard, retainedProject, "retained-history");
}

function assertResolvedReliabilityRunIdentity(
  run: Pick<SenaEnterpriseReliabilityRun, "id" | "teamId" | "projectId" | "projectBinding">,
  resolved: SenaEnterpriseResolvedReliabilityRunProjectScope
) {
  if (run.id !== resolved.runIdentity.id || run.teamId !== resolved.runIdentity.teamId ||
    run.projectId !== resolved.runIdentity.projectId ||
    JSON.stringify(run.projectBinding) !== JSON.stringify(resolved.runIdentity.projectBinding)) {
    throw adjudicationBindingError();
  }
}

export function assertEnterpriseReliabilityAdjudicationRecordFromResolvedScope(
  resolved: SenaEnterpriseResolvedReliabilityRunProjectScope,
  record: SenaEnterpriseAdjudicationRecord
) {
  const { dashboard, project, runIdentity } = resolved;
  const disagreement = dashboard.adjudicationQueue.find((candidate) => (
    candidate.itemId === record.itemId && candidate.codeId === record.codeId
  ));
  if (!disagreement || record.projectId !== project.id || record.teamId !== project.teamId ||
    record.reliabilityRunId !== runIdentity.id || record.projectVersion !== project.currentVersion ||
    record.snapshotFingerprint !== runIdentity.projectBinding?.snapshotFingerprint ||
    !exactStringArray(record.coderIds, dashboard.coderIds) ||
    !exactCoderValues(record.coderValues, disagreement.values, dashboard.coderIds) ||
    !["include", "exclude", "revise"].includes(record.decision) ||
    typeof record.reviewerId !== "string" || record.reviewerId.length === 0 ||
    typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
    throw adjudicationBindingError();
  }
}

export function assertEnterpriseReliabilityAdjudicationRecord(
  run: SenaEnterpriseReliabilityRun,
  project: SenaEnterpriseReliabilityProjectScope,
  record: SenaEnterpriseAdjudicationRecord
) {
  const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
  const resolved = resolvedReliabilityRunProjectScope(run, dashboard, project, "current");
  assertEnterpriseReliabilityAdjudicationRecordFromResolvedScope(resolved, record);
}

function roundedCoverageRate(resolved: number, queued: number) {
  if (queued === 0) return 1;
  return Number((resolved / queued).toFixed(4));
}

function canonicalDisagreementKey(itemId: string, codeId: string) {
  return [itemId, codeId].map((part) => `${part.length}:${part}`).join("");
}

export function buildEnterpriseReliabilityAdjudicationCoverage(
  run: SenaEnterpriseReliabilityRun,
  project: SenaEnterpriseReliabilityProjectScope,
  adjudications: SenaEnterpriseAdjudicationRecord[]
): SenaEnterpriseReliabilityAdjudicationCoverage {
  const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
  const resolved = resolvedReliabilityRunProjectScope(run, dashboard, project, "current");
  return buildEnterpriseReliabilityAdjudicationCoverageFromResolvedScope(
    run,
    resolved,
    adjudications
  );
}

export function buildEnterpriseReliabilityAdjudicationCoverageFromResolvedScope(
  run: SenaEnterpriseReliabilityRun,
  resolved: SenaEnterpriseResolvedReliabilityRunProjectScope,
  adjudications: SenaEnterpriseAdjudicationRecord[]
): SenaEnterpriseReliabilityAdjudicationCoverage {
  assertResolvedReliabilityRunIdentity(run, resolved);
  const queueKeys = new Set(resolved.dashboard.adjudicationQueue.map((entry) => (
    canonicalDisagreementKey(entry.itemId, entry.codeId)
  )));
  const latestByDisagreement = new Map<string, SenaEnterpriseAdjudicationRecord>();
  adjudications
    .filter((record) => record.reliabilityRunId === run.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .forEach((record) => {
      assertEnterpriseReliabilityAdjudicationRecordFromResolvedScope(resolved, record);
      const key = canonicalDisagreementKey(record.itemId, record.codeId);
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

export function buildEnterpriseReliabilityPublicationReviewProjection(
  run: SenaEnterpriseReliabilityRun,
  project: SenaEnterpriseReliabilityProjectScope,
  adjudications: SenaEnterpriseAdjudicationRecord[]
): {
  dashboard: SenaReliabilityDashboard;
  adjudicationCoverage: SenaEnterpriseReliabilityAdjudicationCoverage;
  review: Partial<SenaCodingReliabilityReview>;
} {
  const dashboard = normalizeSenaReliabilityDashboard(run.dashboard);
  const resolved = resolvedReliabilityRunProjectScope(run, dashboard, project, "current");
  const adjudicationCoverage = buildEnterpriseReliabilityAdjudicationCoverageFromResolvedScope(
    run,
    resolved,
    adjudications
  );
  const canonicalReview = reliabilityDashboardToReview(dashboard, run.reviewer);
  if (!canonicalReview.machineEvidence) throw adjudicationBindingError();
  const claimEligibilityInputs = {
    ...structuredClone(canonicalReview.machineEvidence.claimEligibilityInputs),
    unresolvedDisagreementCount: adjudicationCoverage.unresolvedDisagreements
  };
  const machineEvidence = {
    ...structuredClone(canonicalReview.machineEvidence),
    unresolvedDisagreementCount: adjudicationCoverage.unresolvedDisagreements,
    claimEligibilityInputs,
    claimEligibility: deriveSenaReliabilityClaimEligibility(claimEligibilityInputs),
    adjudicationCoverage: structuredClone(adjudicationCoverage)
  };
  if (!isSemanticallyValidSenaReliabilityMachineEvidence(machineEvidence)) {
    throw adjudicationBindingError();
  }
  const decisions = adjudicationCoverage.decisions;
  return {
    dashboard,
    adjudicationCoverage,
    review: {
      ...structuredClone(run.reviewPatch),
      ...canonicalReview,
      adjudicationNotes: [
        `${adjudicationCoverage.queuedDisagreements} queued, ${adjudicationCoverage.resolvedDisagreements} resolved, ${adjudicationCoverage.unresolvedDisagreements} unresolved in the live enterprise adjudication projection.`,
        `Decisions: include=${decisions.include}, exclude=${decisions.exclude}, revise=${decisions.revise}; coverage updated ${adjudicationCoverage.updatedAt}.`,
        "The persisted reliability dashboard, disagreement queue, and raw review patch remain unchanged."
      ].join(" "),
      machineEvidence
    }
  };
}
