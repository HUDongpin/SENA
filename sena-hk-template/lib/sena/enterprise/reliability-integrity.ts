import {
  assertSenaReliabilityProjectBindingMatchesSnapshot,
  deriveSenaReliabilityClaimEligibility,
  isSemanticallyValidSenaReliabilityMachineEvidence,
  isValidSenaReliabilityProjectBinding,
  normalizeSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  senaReliabilityProjectBindingsEqual,
  type SenaReliabilityDashboard,
  type SenaReliabilityDashboardReadModel
} from "../reliability";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { compareSenaCanonicalText } from "../canonical-order.mjs";
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

type SenaReliabilityDisagreement = SenaReliabilityDashboard["adjudicationQueue"][number];

function exactStringArray(left: unknown, right: string[]) {
  return Array.isArray(left) && left.length === right.length &&
    left.every((entry, index) => entry === right[index]);
}

function canonicalBooleanEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => compareSenaCanonicalText(left, right));
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
    !senaReliabilityProjectBindingsEqual(binding, dashboard.projectBinding) ||
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
    !senaReliabilityProjectBindingsEqual(run.projectBinding, resolved.runIdentity.projectBinding)) {
    throw adjudicationBindingError();
  }
}

function assertEnterpriseReliabilityAdjudicationRecordWithQueueIndex(
  resolved: SenaEnterpriseResolvedReliabilityRunProjectScope,
  record: SenaEnterpriseAdjudicationRecord,
  queueByKey: ReadonlyMap<string, SenaReliabilityDisagreement>
) {
  const { dashboard, project, runIdentity } = resolved;
  const disagreement = queueByKey.get(senaReliabilityDisagreementKey(record.itemId, record.codeId));
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

export function assertEnterpriseReliabilityAdjudicationRecordFromResolvedScope(
  resolved: SenaEnterpriseResolvedReliabilityRunProjectScope,
  record: SenaEnterpriseAdjudicationRecord
) {
  assertEnterpriseReliabilityAdjudicationRecordWithQueueIndex(
    resolved,
    record,
    reliabilityDisagreementQueueIndex(resolved.dashboard)
  );
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

export function normalizeEnterpriseReliabilityAdjudicationCoverageSummary(
  dashboard: SenaReliabilityDashboard,
  value: unknown
): SenaEnterpriseReliabilityAdjudicationCoverage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw adjudicationBindingError();
  }
  const coverage = value as Record<string, unknown>;
  if (Object.keys(coverage).sort().join("|") !==
    "coverageRate|decisions|queuedDisagreements|resolvedDisagreements|schemaVersion|unresolvedDisagreements|updatedAt") {
    throw adjudicationBindingError();
  }
  const decisionsValue = coverage.decisions;
  if (!decisionsValue || typeof decisionsValue !== "object" || Array.isArray(decisionsValue) ||
    Object.keys(decisionsValue).sort().join("|") !== "exclude|include|revise") {
    throw adjudicationBindingError();
  }
  const decisions = decisionsValue as Record<string, unknown>;
  const include = decisions.include;
  const exclude = decisions.exclude;
  const revise = decisions.revise;
  if (![include, exclude, revise].every((count) => (
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0
  ))) {
    throw adjudicationBindingError();
  }
  const resolvedDisagreements = (include as number) + (exclude as number) + (revise as number);
  const queuedDisagreements = dashboard.adjudicationQueue.length;
  const unresolvedDisagreements = Math.max(queuedDisagreements - resolvedDisagreements, 0);
  const coverageRate = roundedCoverageRate(resolvedDisagreements, queuedDisagreements);
  const updatedAt = coverage.updatedAt;
  if (coverage.schemaVersion !== SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage ||
    coverage.queuedDisagreements !== queuedDisagreements ||
    coverage.resolvedDisagreements !== resolvedDisagreements ||
    resolvedDisagreements > queuedDisagreements ||
    coverage.unresolvedDisagreements !== unresolvedDisagreements ||
    coverage.coverageRate !== coverageRate ||
    typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) {
    throw adjudicationBindingError();
  }
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityAdjudicationCoverage,
    queuedDisagreements,
    resolvedDisagreements,
    unresolvedDisagreements,
    coverageRate,
    decisions: {
      include: include as number,
      exclude: exclude as number,
      revise: revise as number
    },
    updatedAt
  };
}

export function senaReliabilityDisagreementKey(itemId: string, codeId: string) {
  return [itemId, codeId].map((part) => `${part.length}:${part}`).join("");
}

function reliabilityDisagreementQueueIndex(dashboard: SenaReliabilityDashboard) {
  return new Map(dashboard.adjudicationQueue.map((entry) => ([
    senaReliabilityDisagreementKey(entry.itemId, entry.codeId),
    entry
  ])));
}

export function groupEnterpriseReliabilityAdjudicationsByRunId(
  adjudications: SenaEnterpriseAdjudicationRecord[]
) {
  const byRunId = new Map<string, SenaEnterpriseAdjudicationRecord[]>();
  for (const record of adjudications) {
    if (typeof record.reliabilityRunId !== "string" || record.reliabilityRunId.length === 0) continue;
    const records = byRunId.get(record.reliabilityRunId);
    if (records) records.push(record);
    else byRunId.set(record.reliabilityRunId, [record]);
  }
  return byRunId;
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
  const queueByKey = reliabilityDisagreementQueueIndex(resolved.dashboard);
  const latestByDisagreement = new Map<string, SenaEnterpriseAdjudicationRecord>();
  adjudications
    .filter((record) => record.reliabilityRunId === run.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .forEach((record) => {
      assertEnterpriseReliabilityAdjudicationRecordWithQueueIndex(resolved, record, queueByKey);
      const key = senaReliabilityDisagreementKey(record.itemId, record.codeId);
      latestByDisagreement.set(key, record);
    });
  const decisions = { include: 0, exclude: 0, revise: 0 };
  let updatedAt = run.reviewedAt ?? run.createdAt;
  for (const record of latestByDisagreement.values()) {
    decisions[record.decision] += 1;
    if (record.createdAt.localeCompare(updatedAt) > 0) updatedAt = record.createdAt;
  }
  const queuedDisagreements = queueByKey.size;
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
