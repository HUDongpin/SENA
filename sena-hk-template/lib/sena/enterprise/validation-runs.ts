import { createHash, randomBytes } from "node:crypto";
import {
  readEnterpriseDb,
  saveDb
} from "./state";
import { appendAudit } from "./ops-audit";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import type { SenaEnterpriseDb } from "./state";
import type { SenaEnterpriseProject } from "./team-project";
import { getEnterpriseProject } from "./team-project";
import {
  requireEnterprisePermission,
  rolePermissions
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  queueEnterpriseNotification
} from "./notifications-delivery";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  type SenaGroupComparisonMetric,
  type SenaGroupComparisonResult,
  type SenaGroupComparisonSpec,
  type SenaGroupComparisonValidationResult
} from "../inference";
import { importSenaJsonContract } from "../import";
import { senaRuntimeProvenance } from "../runtime-constants";
import { importSenaProjectSnapshot } from "../snapshot";
import { createSenaSchemaPayload, SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaBuildOptions, SenaRuntimeProvenance } from "../types";

export type SenaEnterpriseValidationRunStatus = "pending-review" | "approved" | "rejected";

export type SenaEnterpriseValidationPreregistrationPlan = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.validationPreregistrationPlan;
  planHash: string;
  hashAlgorithm: "sha256";
  analysis: "single-comparison" | "holm-suite";
  primary: {
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
  };
  comparisons: Array<{
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
  }>;
  parameters: {
    permutationIterations: number;
    bootstrapIterations: number;
    seed: number;
    alpha?: number;
    correction?: "holm";
  };
  protocolNoteHash?: string;
  methodNoteHash?: string;
  guardrail: string;
  evidence: string[];
};

export type SenaEnterpriseValidationParityEvidenceInput = {
  walkthroughDatasetLabel?: string;
  walkthroughDatasetHash?: string;
  walkthroughSource?: "input" | "analysis-run" | "project-snapshot";
  walkthroughSourceId?: string;
  expertReviewRequired?: boolean;
  studySpecificInferenceReference?: string;
  notes?: string[];
  runtimeParityIds?: string[];
};

export type SenaEnterpriseFormalInferenceReadiness = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.formalInferenceReadiness;
  status: "model-referenced" | "model-required" | "incomplete";
  resultSchemaVersion: SenaGroupComparisonValidationResult["schemaVersion"];
  analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"];
  preregistrationPlanHash: string;
  studySpecificInferenceReference?: string;
  comparisonCount: number;
  minGroupSize: number;
  smallSampleComparisons: number;
  permutationIterations: number;
  bootstrapIterations: number;
  alpha?: number;
  correction?: "holm";
  checks: Array<{
    id: "preregistration-plan" | "study-specific-model" | "runtime-parity" | "real-data-walkthrough" | "multiplicity-control" | "sample-size";
    label: string;
    status: "passed" | "required" | "review";
    evidence: string[];
  }>;
  blockers: string[];
  warnings: string[];
  guardrail: string;
};

export type SenaEnterpriseValidationParityEvidence = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.validationParityEvidence;
  status: "ready-for-review" | "incomplete";
  validationRunHash: string;
  hashAlgorithm: "sha256";
  analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"];
  preregistrationPlanHash: string;
  runtimeParity: Array<{
    id: string;
    referenceRuntime: string;
    fixturePath: string;
    status: SenaRuntimeProvenance["parityEvidence"][number]["status"];
    coverage: string[];
    sampleHash: string;
    interpretation: string;
  }>;
  walkthrough: {
    datasetLabel: string;
    datasetHash?: string;
    source: "input" | "analysis-run" | "project-snapshot" | "missing";
    sourceId?: string;
    status: "attached" | "missing";
  };
  inference: {
    resultSchemaVersion: SenaGroupComparisonValidationResult["schemaVersion"];
    guardrail: string;
    comparisonCount: number;
    permutationIterations: number;
    bootstrapIterations: number;
    alpha?: number;
    correction?: "holm";
    studySpecificInferenceReference?: string;
  };
  formalInference: SenaEnterpriseFormalInferenceReadiness;
  gates: Array<{
    id: "rena-parity" | "r-sna-parity" | "real-data-walkthrough" | "domain-expert-review" | "study-specific-inference";
    label: string;
    status: "passed" | "missing" | "required" | "attached";
    evidence: string[];
  }>;
  notes: string[];
};

export type SenaEnterpriseValidationRun = {
  id: string;
  teamId: string;
  projectId?: string;
  userId: string;
  status: SenaEnterpriseValidationRunStatus;
  reviewerId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  preregistrationNote: string;
  methodNote: string;
  metric: SenaGroupComparisonMetric;
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
  iterations: number;
  seed: number;
  pTwoSided: number;
  comparisonCount?: number;
  minHolmAdjustedP?: number;
  significantHolmCount?: number;
  observedDifference: number;
  preregistrationPlan?: SenaEnterpriseValidationPreregistrationPlan;
  parityEvidence?: SenaEnterpriseValidationParityEvidence;
  result: SenaGroupComparisonValidationResult;
  createdAt: string;
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function sha256Text(value: string | undefined) {
  return value ? createHash("sha256").update(value).digest("hex") : undefined;
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function latestByTimestamp<T extends { createdAt: string; updatedAt?: string }>(records: T[]) {
  return records
    .slice()
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0];
}

function primaryValidationComparison(result: SenaGroupComparisonValidationResult): SenaGroupComparisonResult {
  return result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? result.primary : result;
}

function validationRunSummary(result: SenaGroupComparisonValidationResult) {
  const primary = primaryValidationComparison(result);
  const suite = result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? result : null;
  return {
    primary,
    comparisonCount: suite?.comparisonCount ?? 1,
    minHolmAdjustedP: suite
      ? suite.comparisons.reduce((minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP), 1)
      : undefined,
    significantHolmCount: suite?.significantHolmCount
  };
}

function comparisonPlanRow(result: SenaGroupComparisonResult) {
  return {
    metric: result.metric,
    groupField: result.groupField,
    groupA: result.groupA,
    groupB: result.groupB
  };
}

function buildValidationPreregistrationPlan(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationNote?: string;
  methodNote?: string;
}): SenaEnterpriseValidationPreregistrationPlan {
  const primary = primaryValidationComparison(input.result);
  const suite = input.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? input.result : null;
  const protocolNote = input.preregistrationNote?.trim() ?? "";
  const methodNote = input.methodNote?.trim() ?? "";
  const analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"] = suite ? "holm-suite" : "single-comparison";
  const comparisons = suite
    ? suite.comparisons.map(comparisonPlanRow)
    : [comparisonPlanRow(primary)];
  const parameters: SenaEnterpriseValidationPreregistrationPlan["parameters"] = {
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    seed: primary.permutation.seed,
    ...(suite ? { alpha: suite.alpha, correction: suite.correction } : {})
  };
  const evidence = [
    `protocolNote=${protocolNote ? "present" : "missing"}`,
    `methodNote=${methodNote ? "present" : "missing"}`,
    `analysis=${analysis}`,
    `comparisons=${comparisons.length}`,
    ...(suite ? [`correction=${suite.correction}`] : []),
    `permutationIterations=${parameters.permutationIterations}`,
    `bootstrapIterations=${parameters.bootstrapIterations}`,
    `seed=${parameters.seed}`
  ];
  const planBody = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationPreregistrationPlan,
    hashAlgorithm: "sha256" as const,
    analysis,
    primary: comparisonPlanRow(primary),
    comparisons,
    parameters,
    protocolNoteHash: sha256Text(protocolNote),
    methodNoteHash: sha256Text(methodNote),
    guardrail: input.result.guardrail,
    evidence
  };
  return {
    ...planBody,
    planHash: artifactSha256(planBody)
  };
}

function deriveValidationParityEvidenceFromProject(
  db: ReturnType<typeof readEnterpriseDb>,
  project: SenaEnterpriseProject | undefined
): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (!project) return undefined;
  const linkedAnalysisRuns = db.analysisRuns.filter((run) => (
    run.projectId === project.id || run.persistedProjectId === project.id
  ));
  const analysisRun = latestByTimestamp(linkedAnalysisRuns);
  if (analysisRun) {
    return {
      walkthroughDatasetLabel: `analysis:${analysisRun.title}`,
      walkthroughDatasetHash: analysisRun.artifactFingerprints.projectSnapshotSha256,
      walkthroughSource: "analysis-run",
      walkthroughSourceId: analysisRun.id,
      notes: [
        `walkthroughSource=analysis-run:${analysisRun.id}`,
        `analysisSourceKind=${analysisRun.sourceKind}`,
        `reportSha256=${analysisRun.artifactFingerprints.reportSha256}`,
        `projectSnapshotSha256=${analysisRun.artifactFingerprints.projectSnapshotSha256}`,
        ...(analysisRun.artifactFingerprints.runtimeBundleSha256 ? [`runtimeBundleSha256=${analysisRun.artifactFingerprints.runtimeBundleSha256}`] : [])
      ]
    };
  }
  return {
    walkthroughDatasetLabel: `project:${project.title}`,
    walkthroughDatasetHash: artifactSha256(project.snapshot),
    walkthroughSource: "project-snapshot",
    walkthroughSourceId: project.id,
    notes: [
      `walkthroughSource=project-snapshot:${project.id}`,
      `projectSnapshotSha256=${artifactSha256(project.snapshot)}`
    ]
  };
}

function mergeValidationParityEvidenceInput(
  automaticEvidence: SenaEnterpriseValidationParityEvidenceInput | undefined,
  manualEvidence: SenaEnterpriseValidationParityEvidenceInput | undefined
): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (!automaticEvidence && !manualEvidence) return undefined;
  return {
    walkthroughDatasetLabel: manualEvidence?.walkthroughDatasetLabel ?? automaticEvidence?.walkthroughDatasetLabel,
    walkthroughDatasetHash: manualEvidence?.walkthroughDatasetHash ?? automaticEvidence?.walkthroughDatasetHash,
    walkthroughSource: manualEvidence?.walkthroughSource ?? automaticEvidence?.walkthroughSource,
    walkthroughSourceId: manualEvidence?.walkthroughSourceId ?? automaticEvidence?.walkthroughSourceId,
    expertReviewRequired: manualEvidence?.expertReviewRequired ?? automaticEvidence?.expertReviewRequired,
    studySpecificInferenceReference: manualEvidence?.studySpecificInferenceReference ?? automaticEvidence?.studySpecificInferenceReference,
    runtimeParityIds: manualEvidence?.runtimeParityIds ?? automaticEvidence?.runtimeParityIds,
    notes: [
      ...(automaticEvidence?.notes ?? []),
      ...(manualEvidence?.notes ?? [])
    ]
  };
}

function buildFormalInferenceReadiness(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationPlan: SenaEnterpriseValidationPreregistrationPlan;
  inference: SenaEnterpriseValidationParityEvidence["inference"];
  gates: SenaEnterpriseValidationParityEvidence["gates"];
}): SenaEnterpriseFormalInferenceReadiness {
  const primary = primaryValidationComparison(input.result);
  const suite = input.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? input.result : null;
  const minGroupSize = suite?.diagnostics.minGroupSize ?? primary.diagnostics.minGroupSize;
  const smallSampleComparisons = suite?.diagnostics.smallSampleComparisons ?? (primary.diagnostics.smallSample ? 1 : 0);
  const runtimeParityPassed = input.gates
    .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity")
    .every((gate) => gate.status === "passed");
  const walkthroughPassed = input.gates.some((gate) => gate.id === "real-data-walkthrough" && gate.status === "passed");
  const studySpecificInferenceReference = input.inference.studySpecificInferenceReference?.trim();
  const checks: SenaEnterpriseFormalInferenceReadiness["checks"] = [
    {
      id: "preregistration-plan",
      label: "Preregistration plan hash",
      status: input.preregistrationPlan.planHash ? "passed" : "required",
      evidence: [
        `schema=${input.preregistrationPlan.schemaVersion}`,
        `planHash=${input.preregistrationPlan.planHash || "missing"}`,
        `analysis=${input.preregistrationPlan.analysis}`
      ]
    },
    {
      id: "study-specific-model",
      label: "Study-specific inferential model reference",
      status: studySpecificInferenceReference ? "passed" : "required",
      evidence: [`reference=${studySpecificInferenceReference || "required-before-publication-claim"}`]
    },
    {
      id: "runtime-parity",
      label: "rENA and R sna parity fixtures",
      status: runtimeParityPassed ? "passed" : "required",
      evidence: input.gates
        .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity")
        .map((gate) => `${gate.id}:${gate.status}`)
    },
    {
      id: "real-data-walkthrough",
      label: "Real-data walkthrough anchor",
      status: walkthroughPassed ? "passed" : "required",
      evidence: input.gates.find((gate) => gate.id === "real-data-walkthrough")?.evidence ?? ["walkthrough=missing"]
    },
    {
      id: "multiplicity-control",
      label: "Multiple-comparison control",
      status: suite ? suite.correction === "holm" ? "passed" : "required" : "passed",
      evidence: suite
        ? [`correction=${suite.correction}`, `comparisons=${suite.comparisonCount}`, `alpha=${suite.alpha}`]
        : ["singleComparison=true"]
    },
    {
      id: "sample-size",
      label: "Group-size diagnostic",
      status: smallSampleComparisons > 0 || minGroupSize < 5 ? "review" : "passed",
      evidence: [`minGroupSize=${minGroupSize}`, `smallSampleComparisons=${smallSampleComparisons}`]
    }
  ];
  const blockers = checks
    .filter((check) => check.status === "required")
    .map((check) => check.id);
  const warnings = [
    ...(smallSampleComparisons > 0 ? [`small-sample-comparisons=${smallSampleComparisons}`] : []),
    ...(minGroupSize < 5 ? [`minGroupSize=${minGroupSize}`] : [])
  ];
  const status: SenaEnterpriseFormalInferenceReadiness["status"] = !runtimeParityPassed || !walkthroughPassed || !input.preregistrationPlan.planHash
    ? "incomplete"
    : studySpecificInferenceReference
      ? "model-referenced"
      : "model-required";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.formalInferenceReadiness,
    status,
    resultSchemaVersion: input.result.schemaVersion,
    analysis: input.preregistrationPlan.analysis,
    preregistrationPlanHash: input.preregistrationPlan.planHash,
    studySpecificInferenceReference: studySpecificInferenceReference || undefined,
    comparisonCount: suite?.comparisonCount ?? 1,
    minGroupSize,
    smallSampleComparisons,
    permutationIterations: input.inference.permutationIterations,
    bootstrapIterations: input.inference.bootstrapIterations,
    alpha: input.inference.alpha,
    correction: input.inference.correction,
    checks,
    blockers,
    warnings,
    guardrail: "Formal inference readiness records whether SENA validation has preregistration, runtime parity, real-data walkthrough, multiplicity control, and a study-specific model reference; it does not replace the model or domain review."
  };
}

function buildValidationParityEvidence(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationPlan: SenaEnterpriseValidationPreregistrationPlan;
  parityEvidence?: SenaEnterpriseValidationParityEvidenceInput;
}): SenaEnterpriseValidationParityEvidence {
  const primary = primaryValidationComparison(input.result);
  const suite = input.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? input.result : null;
  const requestedRuntimeIds = new Set(input.parityEvidence?.runtimeParityIds?.map((runtimeId) => runtimeId.trim()).filter(Boolean));
  const runtimeEvidence = senaRuntimeProvenance.parityEvidence
    .filter((evidence) => requestedRuntimeIds.size === 0 || requestedRuntimeIds.has(evidence.id))
    .map((evidence) => ({
      id: evidence.id,
      referenceRuntime: evidence.referenceRuntime,
      fixturePath: evidence.fixturePath,
      status: evidence.status,
      coverage: evidence.coverage,
      sampleHash: artifactSha256(evidence.sample),
      interpretation: evidence.interpretation
    }));
  const jenaParity = runtimeEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity");
  const jsnaParity = runtimeEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity");
  const walkthroughLabel = input.parityEvidence?.walkthroughDatasetLabel?.trim() || "missing walkthrough dataset";
  const walkthroughHash = input.parityEvidence?.walkthroughDatasetHash?.trim();
  const walkthroughStatus: SenaEnterpriseValidationParityEvidence["walkthrough"]["status"] = walkthroughHash ? "attached" : "missing";
  const walkthroughSource: SenaEnterpriseValidationParityEvidence["walkthrough"]["source"] = walkthroughHash
    ? input.parityEvidence?.walkthroughSource ?? "input"
    : "missing";
  const walkthroughSourceId = input.parityEvidence?.walkthroughSourceId?.trim();
  const expertReviewRequired = input.parityEvidence?.expertReviewRequired ?? true;
  const studySpecificInferenceReference = input.parityEvidence?.studySpecificInferenceReference?.trim();
  const inference: SenaEnterpriseValidationParityEvidence["inference"] = {
    resultSchemaVersion: input.result.schemaVersion,
    guardrail: input.result.guardrail,
    comparisonCount: suite?.comparisonCount ?? 1,
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    alpha: suite?.alpha,
    correction: suite?.correction,
    studySpecificInferenceReference
  };
  const gates: SenaEnterpriseValidationParityEvidence["gates"] = [
    {
      id: "rena-parity",
      label: "jENA/rENA parity fixture evidence",
      status: jenaParity?.status === "covered" ? "passed" : "missing",
      evidence: jenaParity ? [
        `runtime=${jenaParity.referenceRuntime}`,
        `fixture=${jenaParity.fixturePath}`,
        `coverage=${jenaParity.coverage.join("|")}`,
        `sampleHash=${jenaParity.sampleHash}`
      ] : ["runtimeParity=missing"]
    },
    {
      id: "r-sna-parity",
      label: "jSNA/R sna parity fixture evidence",
      status: jsnaParity?.status === "covered" ? "passed" : "missing",
      evidence: jsnaParity ? [
        `runtime=${jsnaParity.referenceRuntime}`,
        `fixture=${jsnaParity.fixturePath}`,
        `coverage=${jsnaParity.coverage.join("|")}`,
        `sampleHash=${jsnaParity.sampleHash}`
      ] : ["runtimeParity=missing"]
    },
    {
      id: "real-data-walkthrough",
      label: "Real dataset walkthrough evidence",
      status: walkthroughStatus === "attached" ? "passed" : "missing",
      evidence: [
        `datasetLabel=${walkthroughLabel}`,
        `datasetHash=${walkthroughHash ?? "missing"}`,
        `source=${walkthroughSource}`,
        ...(walkthroughSourceId ? [`sourceId=${walkthroughSourceId}`] : [])
      ]
    },
    {
      id: "domain-expert-review",
      label: "Domain expert review requirement",
      status: expertReviewRequired ? "required" : "attached",
      evidence: [`required=${expertReviewRequired}`]
    },
    {
      id: "study-specific-inference",
      label: "Study-specific inferential model requirement",
      status: studySpecificInferenceReference ? "attached" : "required",
      evidence: [
        `reference=${studySpecificInferenceReference || "required-before-publication-claim"}`,
        `guardrail=${input.result.guardrail}`
      ]
    }
  ];
  const passedFoundation = gates
    .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity" || gate.id === "real-data-walkthrough")
    .every((gate) => gate.status === "passed");
  const formalInference = buildFormalInferenceReadiness({
    result: input.result,
    preregistrationPlan: input.preregistrationPlan,
    inference,
    gates
  });
  const notes = [
    "This manifest links an enterprise validation run to runtime parity, walkthrough, expert-review, and inference guardrail evidence.",
    "Required expert-review and study-specific inference gates are claim-readiness requirements, not automatic blockers for storing descriptive validation output.",
    ...(input.parityEvidence?.notes?.map((note) => note.trim()).filter(Boolean) ?? [])
  ];
  const manifestBody = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationParityEvidence,
    hashAlgorithm: "sha256" as const,
    analysis: input.preregistrationPlan.analysis,
    preregistrationPlanHash: input.preregistrationPlan.planHash,
    runtimeParity: runtimeEvidence,
    walkthrough: {
      datasetLabel: walkthroughLabel,
      datasetHash: walkthroughHash,
      source: walkthroughSource,
      sourceId: walkthroughSourceId,
      status: walkthroughStatus
    },
    inference,
    formalInference,
    gates,
    notes
  };
  return {
    ...manifestBody,
    status: passedFoundation ? "ready-for-review" : "incomplete",
    validationRunHash: artifactSha256(manifestBody)
  };
}

export function createEnterpriseValidationRun(context: SenaEnterpriseSessionContext, input: {
  teamId: string;
  projectId?: string;
  preregistrationNote?: string;
  methodNote?: string;
  parityEvidence?: SenaEnterpriseValidationParityEvidenceInput;
  result: SenaGroupComparisonValidationResult;
}) {
  requireEnterprisePermission(context, input.teamId, "analysis:run");
  const db = readEnterpriseDb();
  const team = db.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new SenaEnterpriseError("Team was not found.", 404, "team_not_found");
  let project: SenaEnterpriseProject | undefined;
  if (input.projectId) {
    project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    if (project.teamId !== input.teamId) {
      throw new SenaEnterpriseError("Validation run team does not match the project team.", 400, "validation_project_team_mismatch");
    }
    requireEnterprisePermission(context, project.teamId, "analysis:run");
  }
  const summary = validationRunSummary(input.result);
  const primary = summary.primary;
  const preregistrationPlan = buildValidationPreregistrationPlan({
    result: input.result,
    preregistrationNote: input.preregistrationNote,
    methodNote: input.methodNote
  });
  const derivedParityEvidence = deriveValidationParityEvidenceFromProject(db, project);
  const parityEvidence = buildValidationParityEvidence({
    result: input.result,
    preregistrationPlan,
    parityEvidence: mergeValidationParityEvidenceInput(derivedParityEvidence, input.parityEvidence)
  });

  const run: SenaEnterpriseValidationRun = {
    id: id("val"),
    teamId: input.teamId,
    projectId: input.projectId,
    userId: context.user.id,
    status: "pending-review",
    preregistrationNote: input.preregistrationNote?.trim() ?? "",
    methodNote: input.methodNote?.trim() || input.result.guardrail,
    metric: primary.metric,
    groupField: primary.groupField,
    groupA: primary.groupA,
    groupB: primary.groupB,
    iterations: primary.permutation.iterations,
    seed: primary.permutation.seed,
    pTwoSided: primary.permutation.pTwoSided,
    comparisonCount: summary.comparisonCount,
    minHolmAdjustedP: summary.minHolmAdjustedP,
    significantHolmCount: summary.significantHolmCount,
    observedDifference: primary.observedDifference,
    preregistrationPlan,
    parityEvidence,
    result: input.result,
    createdAt: now()
  };
  db.validationRuns.unshift(run);
  db.validationRuns = db.validationRuns.slice(0, 1000);
  appendAudit(db, {
    event: "inference.run",
    userId: context.user.id,
    teamId: input.teamId,
    projectId: input.projectId,
    detail: {
      validationRunId: run.id,
      metric: run.metric,
      groupField: run.groupField,
      groupA: run.groupA,
      groupB: run.groupB,
      pTwoSided: run.pTwoSided,
      comparisonCount: run.comparisonCount ?? 1,
      minHolmAdjustedP: run.minHolmAdjustedP ?? null,
      preregistrationPlanHash: run.preregistrationPlan?.planHash ?? null,
      parityEvidenceHash: run.parityEvidence?.validationRunHash ?? null,
      parityEvidenceStatus: run.parityEvidence?.status ?? null
    }
  });
  saveDb(db);
  return run;
}

export function reviewEnterpriseValidationRun(context: SenaEnterpriseSessionContext, runId: string, input: {
  status: Extract<SenaEnterpriseValidationRunStatus, "approved" | "rejected">;
  notes?: string;
}) {
  const db = readEnterpriseDb();
  const run = db.validationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new SenaEnterpriseError("Validation run was not found.", 404, "validation_run_not_found");
  requireEnterprisePermission(context, run.teamId, "analysis:run");
  run.status = input.status;
  run.reviewerId = context.user.id;
  run.reviewedAt = now();
  run.reviewNotes = input.notes?.trim() ?? "";
  appendAudit(db, {
    event: "validation.review",
    userId: context.user.id,
    teamId: run.teamId,
    projectId: run.projectId,
    detail: {
      validationRunId: run.id,
      status: run.status,
      metric: run.metric,
      pTwoSided: run.pTwoSided,
      comparisonCount: run.comparisonCount ?? 1,
      minHolmAdjustedP: run.minHolmAdjustedP ?? null
    }
  });
  queueEnterpriseNotification(db, {
    kind: "validation.review",
    userId: run.userId,
    teamId: run.teamId,
    projectId: run.projectId,
    title: "Group-comparison validation reviewed",
    body: `${context.user.name} marked a validation run as ${run.status}.`,
    actionUrl: run.projectId ? `/workspace/sena?projectId=${encodeURIComponent(run.projectId)}` : "/workspace/sena",
    detail: {
      validationRunId: run.id,
      status: run.status,
      reviewerId: context.user.id
    }
  });
  saveDb(db);
  return run;
}

export function listEnterpriseValidationRuns(context: SenaEnterpriseSessionContext, input: {
  teamId?: string;
  projectId?: string;
} = {}) {
  const db = readEnterpriseDb();
  let teamIds = new Set(context.memberships
    .filter((membership) => rolePermissions[membership.role].includes("analysis:run"))
    .map((membership) => membership.teamId));

  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "analysis:run");
    teamIds = new Set([input.teamId]);
  }

  if (input.projectId) {
    const project = db.projects.find((candidate) => candidate.id === input.projectId);
    if (!project) throw new SenaEnterpriseError("Project was not found.", 404, "project_not_found");
    requireEnterprisePermission(context, project.teamId, "analysis:run");
    teamIds = new Set([project.teamId]);
  }

  return db.validationRuns
    .filter((run) => teamIds.has(run.teamId))
    .filter((run) => !input.projectId || run.projectId === input.projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type SenaEnterpriseValidationRunHeaderSource = Pick<
  SenaEnterpriseValidationRun,
  "id" | "status" | "projectId" | "comparisonCount" | "pTwoSided" | "minHolmAdjustedP" | "preregistrationPlan" | "parityEvidence"
>;

export function buildEnterpriseValidationRunHeaders(run: SenaEnterpriseValidationRunHeaderSource) {
  return {
    "x-sena-validation-run-id": run.id,
    "x-sena-validation-status": run.status,
    ...(run.projectId ? { "x-sena-project-id": run.projectId } : {}),
    "x-sena-validation-comparison-count": String(run.comparisonCount ?? 1),
    "x-sena-validation-p-two-sided": String(run.pTwoSided),
    ...(run.minHolmAdjustedP !== undefined ? { "x-sena-validation-min-holm-p": String(run.minHolmAdjustedP) } : {}),
    ...(run.preregistrationPlan?.planHash ? { "x-sena-validation-preregistration-sha256": run.preregistrationPlan.planHash } : {}),
    ...(run.parityEvidence?.status ? { "x-sena-validation-parity-status": run.parityEvidence.status } : {}),
    ...(run.parityEvidence?.validationRunHash ? { "x-sena-validation-parity-sha256": run.parityEvidence.validationRunHash } : {}),
    ...(run.parityEvidence?.formalInference.status ? { "x-sena-formal-inference-status": run.parityEvidence.formalInference.status } : {})
  };
}

export function buildEnterpriseValidationRunListResponse(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string; projectId?: string },
  listRuns: typeof listEnterpriseValidationRuns = listEnterpriseValidationRuns
) {
  return {
    body: createSenaSchemaPayload("validationRunList", {
      validationRuns: listRuns(context, input)
    })
  };
}

export function buildEnterpriseValidationRunReviewResponse(
  context: SenaEnterpriseSessionContext,
  body: { runId?: unknown; status?: unknown; notes?: unknown },
  reviewRun: typeof reviewEnterpriseValidationRun = reviewEnterpriseValidationRun
) {
  const validationRun = reviewRun(context, String(body.runId ?? ""), {
    status: body.status === "approved" ? "approved" : "rejected",
    notes: body.notes ? String(body.notes) : undefined
  });
  return {
    body: createSenaSchemaPayload("validationRunReview", {
      validationRun
    }),
    headers: buildEnterpriseValidationRunHeaders(validationRun)
  };
}

const groupComparisonMetrics = new Set<SenaGroupComparisonMetric>([
  "bridgeScore",
  "epistemicContribution",
  "epistemicDiversity",
  "socialStrength",
  "socialDegree",
  "conceptBrokerage",
  "alignment"
]);

function groupComparisonMetricValue(value: unknown): SenaGroupComparisonMetric {
  return groupComparisonMetrics.has(value as SenaGroupComparisonMetric) ? value as SenaGroupComparisonMetric : "bridgeScore";
}

function parseGroupComparisonMetricList(value: unknown, fallback: unknown) {
  const candidates = Array.isArray(value) ? value : [fallback];
  const parsed = candidates
    .map((candidate) => groupComparisonMetricValue(candidate))
    .filter((metric, index, list) => list.indexOf(metric) === index);
  return parsed.length > 0 ? parsed : ["bridgeScore" as SenaGroupComparisonMetric];
}

function parseGroupComparisonSpecs(body: Record<string, unknown>): SenaGroupComparisonSpec[] {
  if (Array.isArray(body.comparisons)) {
    return body.comparisons
      .filter((comparison): comparison is Record<string, unknown> => typeof comparison === "object" && comparison !== null && !Array.isArray(comparison))
      .map((comparison): SenaGroupComparisonSpec => ({
        groupField: comparison.groupField === "role" ? "role" : "group",
        groupA: String(comparison.groupA ?? ""),
        groupB: String(comparison.groupB ?? ""),
        metric: groupComparisonMetricValue(comparison.metric)
      }))
      .filter((comparison) => comparison.groupA && comparison.groupB && comparison.groupA !== comparison.groupB)
      .slice(0, 40);
  }

  const groupA = String(body.groupA ?? "");
  const groupB = String(body.groupB ?? "");
  const groupField = body.groupField === "role" ? "role" : "group";
  return parseGroupComparisonMetricList(body.metrics, body.metric).map((metric) => ({
    groupField,
    groupA,
    groupB,
    metric
  }));
}

function parseEnterpriseValidationParityEvidence(value: unknown): SenaEnterpriseValidationParityEvidenceInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    walkthroughDatasetLabel: record.walkthroughDatasetLabel ? String(record.walkthroughDatasetLabel) : undefined,
    walkthroughDatasetHash: record.walkthroughDatasetHash ? String(record.walkthroughDatasetHash) : undefined,
    expertReviewRequired: typeof record.expertReviewRequired === "boolean" ? record.expertReviewRequired : undefined,
    studySpecificInferenceReference: record.studySpecificInferenceReference ? String(record.studySpecificInferenceReference) : undefined,
    notes: Array.isArray(record.notes) ? record.notes.map((note) => String(note)).slice(0, 20) : undefined,
    runtimeParityIds: Array.isArray(record.runtimeParityIds) ? record.runtimeParityIds.map((id) => String(id)).slice(0, 20) : undefined
  };
}

export function buildEnterpriseGroupComparisonValidationResponse(
  context: SenaEnterpriseSessionContext,
  body: Record<string, unknown>,
  adapters: {
    getProject?: typeof getEnterpriseProject;
    createValidationRun?: typeof createEnterpriseValidationRun;
  } = {}
) {
  const projectId = body.projectId ? String(body.projectId) : undefined;
  const project: SenaEnterpriseProject | null = projectId ? (adapters.getProject ?? getEnterpriseProject)(context, projectId) : null;
  const snapshot = body.snapshot ? importSenaProjectSnapshot(body.snapshot) : project?.snapshot ?? null;
  const dataset = snapshot?.dataset ?? importSenaJsonContract(body.dataset).dataset;
  const comparisons = parseGroupComparisonSpecs(body);
  const buildOptions = snapshot?.reproducibility.buildOptions ?? (
    typeof body.buildOptions === "object" && body.buildOptions !== null && !Array.isArray(body.buildOptions)
      ? body.buildOptions as Partial<SenaBuildOptions>
      : undefined
  );
  const result = comparisons.length <= 1 && body.suite !== true
    ? buildSenaGroupComparison({
      dataset,
      buildOptions,
      groupField: comparisons[0]?.groupField ?? (body.groupField === "role" ? "role" : "group"),
      groupA: comparisons[0]?.groupA ?? String(body.groupA ?? ""),
      groupB: comparisons[0]?.groupB ?? String(body.groupB ?? ""),
      metric: comparisons[0]?.metric ?? groupComparisonMetricValue(body.metric),
      iterations: Number(body.iterations ?? 1000),
      seed: Number(body.seed ?? 20260611),
      bootstrapIterations: Number(body.bootstrapIterations ?? body.iterations ?? 1000)
    })
    : buildSenaGroupComparisonSuite({
      dataset,
      buildOptions,
      comparisons,
      defaultGroupField: body.groupField === "role" ? "role" : "group",
      defaultMetric: groupComparisonMetricValue(body.metric),
      iterations: Number(body.iterations ?? 1000),
      seed: Number(body.seed ?? 20260611),
      bootstrapIterations: Number(body.bootstrapIterations ?? body.iterations ?? 1000),
      alpha: Number(body.alpha ?? 0.05)
    });
  const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
  const validationRun = (adapters.createValidationRun ?? createEnterpriseValidationRun)(context, {
    teamId,
    projectId,
    preregistrationNote: body.preregistrationNote ? String(body.preregistrationNote) : undefined,
    methodNote: body.methodNote ? String(body.methodNote) : undefined,
    parityEvidence: parseEnterpriseValidationParityEvidence(body.parityEvidence),
    result
  });

  return {
    body: {
      ...result,
      validationRun
    },
    headers: buildEnterpriseValidationRunHeaders(validationRun)
  };
}
