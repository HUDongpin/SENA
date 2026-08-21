import {
  normalizeSenaFusionMathAudit,
  type SenaFusionMathAuditEvidence
} from "./fusion-math";
import { buildSenaClaimReadinessGate } from "./pilot-readiness";
import { normalizeSenaCodingReliabilityGate } from "./report";
import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import {
  assertSenaReportHolderStructure,
  assertSenaRuntimeBundleHolderStructure
} from "./statistical-holder-structure";
import type {
  SenaClaimReadinessGate,
  SenaCodingReliabilityGate,
  SenaDemoVerification,
  SenaDemoWalkthrough,
  SenaDevelopmentPlan,
  SenaFusionMathAudit,
  SenaPilotReadinessAudit,
  SenaReport,
  SenaReportCompletenessAudit,
  SenaRuntimeBundle
} from "./types";

type JsonRecord = Record<string, unknown>;

export type SenaStatisticalLeafReadState = {
  legacyFusionMath: boolean;
  legacyCodingReliability: boolean;
  needsCurrentEvidence: boolean;
};

function asRecord(value: unknown, context: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as JsonRecord;
}

function parseSource(source: string | unknown) {
  return typeof source === "string" ? JSON.parse(source) as unknown : source;
}

function markPilotReadinessForStatisticalReview(
  value: SenaPilotReadinessAudit,
  state: SenaStatisticalLeafReadState,
  completenessAudit?: SenaReportCompletenessAudit
): SenaPilotReadinessAudit {
  const audit = structuredClone(value);
  const reasons = new Map<string, { reason: string; blocker: string }>();
  if (state.legacyFusionMath) {
    reasons.set("fusion-math", {
      reason: "Historical v1 fusion evidence does not prove the current v2 nonnegative-value contract.",
      blocker: "current-v2-fusion-nonnegative-evidence-required"
    });
  }
  if (state.legacyCodingReliability) {
    reasons.set("coding-reliability", {
      reason: "Historical v1 reliability evidence cannot establish current v2 machine eligibility.",
      blocker: "current-v2-reliability-evidence-required"
    });
  }
  audit.items = audit.items.map((item) => {
    if (item.id === "report-completeness" && completenessAudit?.status === "needs-review") {
      return {
        ...item,
        status: "review" as const,
        summary: `${completenessAudit.passed} report checks passed; ${completenessAudit.reviewNeeded} need review`,
        evidence: completenessAudit.items.flatMap((entry) => [
          `${entry.label}: ${entry.status}`,
          ...entry.evidence.filter((evidence) => evidence.startsWith("current-v2-"))
        ]),
        nextAction: "Resolve every normalized report-completeness review item before treating this restored artifact as ready."
      };
    }
    const invalidation = reasons.get(item.id);
    return invalidation ? {
      ...item,
      status: "review" as const,
      summary: invalidation.reason,
      evidence: [
        "legacy-statistical-contract-normalized",
        invalidation.blocker,
        invalidation.reason
      ],
      nextAction: "Attach current v2 statistical evidence before treating this restored artifact as ready."
    } : item;
  });
  const passed = audit.items.filter((item) => item.status === "ready").length;
  return {
    ...audit,
    status: passed === audit.items.length ? "ready" : "needs-review",
    passed,
    reviewNeeded: audit.items.length - passed,
    notes: Array.from(new Set([
      ...audit.notes,
      "Restore normalization never upgrades historical statistical evidence to current-ready status."
    ]))
  };
}

function invalidatedReadiness(
  pilotReadinessAudit: SenaPilotReadinessAudit,
  state: SenaStatisticalLeafReadState,
  completenessAudit?: SenaReportCompletenessAudit
): { pilotReadinessAudit: SenaPilotReadinessAudit; claimReadinessGate: SenaClaimReadinessGate } {
  const normalizedPilot = state.needsCurrentEvidence
    ? markPilotReadinessForStatisticalReview(pilotReadinessAudit, state, completenessAudit)
    : structuredClone(pilotReadinessAudit);
  return {
    pilotReadinessAudit: normalizedPilot,
    claimReadinessGate: state.needsCurrentEvidence
      ? buildSenaClaimReadinessGate(normalizedPilot)
      : structuredClone(buildSenaClaimReadinessGate(normalizedPilot))
  };
}

export function reconcileSenaStatisticalReadiness(
  pilotReadinessAudit: SenaPilotReadinessAudit,
  state: SenaStatisticalLeafReadState,
  completenessAudit?: SenaReportCompletenessAudit
): { pilotReadinessAudit: SenaPilotReadinessAudit; claimReadinessGate: SenaClaimReadinessGate } {
  return invalidatedReadiness(pilotReadinessAudit, state, completenessAudit);
}

function reconcileReportCompleteness(
  value: SenaReportCompletenessAudit,
  fusionMathAudit: SenaFusionMathAudit,
  codingReliabilityGate: SenaCodingReliabilityGate,
  state: SenaStatisticalLeafReadState
): SenaReportCompletenessAudit {
  const audit = structuredClone(value);
  audit.items = audit.items.map((item) => {
    if (item.id === "fusion-math-audit" && state.legacyFusionMath) {
      return {
        ...item,
        status: "review" as const,
        summary: `${fusionMathAudit.passed} formula checks passed; ${fusionMathAudit.reviewNeeded} need review`,
        evidence: [
          "current-v2-fusion-nonnegative-evidence-required",
          ...fusionMathAudit.items.map((entry) => `${entry.label}: ${entry.status}`)
        ]
      };
    }
    if (item.id === "coding-reliability" && state.legacyCodingReliability) {
      return {
        ...item,
        status: "review" as const,
        summary: "Current v2 coding-reliability machine evidence is required.",
        evidence: [
          `sourceSchemaVersion=${codingReliabilityGate.sourceSchemaVersion}`,
          `machineEligibility=${codingReliabilityGate.machineClaimEligibility.eligible ? "eligible" : "ineligible"}`,
          ...codingReliabilityGate.machineClaimEligibility.blockers
        ]
      };
    }
    return item;
  });
  const passed = audit.items.filter((item) => item.status === "pass").length;
  return {
    ...audit,
    status: passed === audit.items.length ? "complete" : "needs-review",
    passed,
    reviewNeeded: audit.items.length - passed,
    notes: Array.from(new Set([
      ...audit.notes,
      "Restored completeness is reconciled from normalized statistical leaves before readiness is evaluated."
    ]))
  };
}

export function reconcileSenaReportStatisticalSurfaces(
  report: SenaReport,
  state: SenaStatisticalLeafReadState
): SenaReport {
  if (!state.needsCurrentEvidence) return report;
  report.completenessAudit = reconcileReportCompleteness(
    report.completenessAudit,
    report.fusionMathAudit,
    report.codingReliabilityGate,
    state
  );
  const readiness = invalidatedReadiness(report.pilotReadinessAudit, state, report.completenessAudit);
  report.pilotReadinessAudit = readiness.pilotReadinessAudit;
  report.claimReadinessGate = readiness.claimReadinessGate;
  return report;
}

function reconcileDemoWalkthrough(
  value: SenaDemoWalkthrough,
  pilotReadinessAudit: SenaPilotReadinessAudit
) {
  const readiness = new Map(pilotReadinessAudit.items.map((item) => [item.id, item.status]));
  value.steps = value.steps.map((step) => {
    const dependenciesReady = step.readinessItemIds.every((id) => readiness.get(id) === "ready");
    const status = step.status === "ready" && dependenciesReady ? "ready" as const : "review" as const;
    return {
      ...step,
      status,
      evidence: dependenciesReady
        ? step.evidence
        : normalizedReadinessEvidence(pilotReadinessAudit, step.readinessItemIds)
    };
  });
  const readySteps = value.steps.filter((step) => step.status === "ready").length;
  value.summary = {
    ...value.summary,
    totalSteps: value.steps.length,
    readySteps,
    reviewSteps: value.steps.length - readySteps,
    pilotReadinessStatus: pilotReadinessAudit.status
  };
}

const verificationReadinessIds: Record<string, string[]> = {
  "sample-import": ["data-contract", "model-json-export"],
  "weights-and-formula": ["fusion-model", "model-json-export", "fusion-math"],
  "layout-switching": ["fusion-model", "model-json-export"],
  "evidence-inspection": ["evidence-ledger"],
  "temporal-runtime": ["method-validation"],
  "report-exports": ["report-completeness", "coding-reliability", "data-governance", "human-review"]
};

function normalizedReadinessEvidence(
  pilotReadinessAudit: SenaPilotReadinessAudit,
  readinessItemIds: string[]
) {
  return Array.from(new Set([
    "legacy-statistical-dependent-evidence-invalidated",
    ...readinessItemIds.flatMap((id) => {
      const item = pilotReadinessAudit.items.find((candidate) => candidate.id === id);
      return item
        ? [
          `${item.label}: ${item.status}`,
          item.summary,
          ...item.evidence.filter((evidence) =>
            evidence === "legacy-statistical-contract-normalized" || evidence.startsWith("current-v2-"))
        ]
        : [`${id}: missing`];
    })
  ]));
}

function reconcileDemoVerification(
  value: SenaDemoVerification,
  pilotReadinessAudit: SenaPilotReadinessAudit
) {
  const readiness = new Map(pilotReadinessAudit.items.map((item) => [item.id, item.status]));
  value.checks = value.checks.map((check) => {
    const dependencies = verificationReadinessIds[check.id];
    const dependenciesReady = Boolean(dependencies) && dependencies.every((id) => readiness.get(id) === "ready");
    if (check.status === "pass" && dependenciesReady) return check;
    return {
      ...check,
      status: "review" as const,
      observedEvidence: normalizedReadinessEvidence(pilotReadinessAudit, dependencies ?? []),
      manualReview: {
        status: "pending" as const,
        reviewer: "",
        verifiedAt: "",
        notes: "Prior verification is invalidated until every normalized readiness dependency is current-ready."
      }
    };
  });
  const automatedPass = value.checks.filter((check) => check.status === "pass").length;
  value.summary = {
    ...value.summary,
    totalChecks: value.checks.length,
    automatedPass,
    automatedReview: value.checks.length - automatedPass,
    manualPending: value.checks.filter((check) => check.manualReview.status === "pending").length,
    manualPassed: value.checks.filter((check) => check.manualReview.status === "passed").length,
    manualFailed: value.checks.filter((check) => check.manualReview.status === "failed").length,
    pilotReadinessStatus: pilotReadinessAudit.status
  };
}

function reconcileDevelopmentPlan(
  value: SenaDevelopmentPlan,
  pilotReadinessAudit: SenaPilotReadinessAudit,
  demoWalkthrough: SenaDemoWalkthrough,
  demoVerification: SenaDemoVerification,
  state: SenaStatisticalLeafReadState
) {
  value.currentGate = {
    pilotReadinessStatus: pilotReadinessAudit.status,
    automatedVerification: {
      totalChecks: demoVerification.summary.totalChecks,
      passed: demoVerification.summary.automatedPass,
      review: demoVerification.summary.automatedReview,
      manualPending: demoVerification.summary.manualPending,
      manualPassed: demoVerification.summary.manualPassed,
      manualFailed: demoVerification.summary.manualFailed
    },
    readyItems: pilotReadinessAudit.items.filter((item) => item.status === "ready").map((item) => item.id),
    reviewItems: pilotReadinessAudit.items.filter((item) => item.status === "review").map((item) => item.id)
  };
  const walkthroughStatus = new Map(demoWalkthrough.steps.map((step) => [step.id, step.status]));
  value.workflowAnchors = value.workflowAnchors.map((anchor) => ({
    ...anchor,
    status: walkthroughStatus.get(anchor.id) ?? "review"
  }));
  if (pilotReadinessAudit.status !== "ready" || demoVerification.summary.automatedReview > 0) {
    value.deliveryCandidate.status = "pre-candidate";
    value.nextStage.status = "verification-required";
  }
  value.phases = value.phases.map((phase) => {
    const dependencies = phase.id === "runtime-foundation" && state.legacyFusionMath
      ? ["fusion-math"]
      : phase.id === "research-validation" && state.needsCurrentEvidence
        ? ["fusion-math", "coding-reliability"]
        : [];
    if (dependencies.length === 0) return phase;
    return {
      ...phase,
      status: phase.status === "complete" ? "active" as const : phase.status,
      evidence: normalizedReadinessEvidence(pilotReadinessAudit, dependencies)
    };
  });
  value.notes = Array.from(new Set([
    ...value.notes,
    "Legacy-dependent plan evidence was invalidated and rebuilt from normalized current readiness items."
  ]));
}

export function reconcileSenaRuntimeBundleStatisticalSurfaces(
  runtimeBundle: SenaRuntimeBundle,
  state: SenaStatisticalLeafReadState
) {
  if (!state.needsCurrentEvidence) return runtimeBundle;
  reconcileSenaReportStatisticalSurfaces(runtimeBundle.report, state);
  const readiness = invalidatedReadiness(
    runtimeBundle.pilotReadinessAudit,
    state,
    runtimeBundle.report.completenessAudit
  );
  runtimeBundle.pilotReadinessAudit = readiness.pilotReadinessAudit;
  runtimeBundle.claimReadinessGate = readiness.claimReadinessGate;
  runtimeBundle.report.pilotReadinessAudit = structuredClone(readiness.pilotReadinessAudit);
  runtimeBundle.report.claimReadinessGate = structuredClone(readiness.claimReadinessGate);
  reconcileDemoWalkthrough(runtimeBundle.demoWalkthrough, runtimeBundle.pilotReadinessAudit);
  reconcileDemoVerification(runtimeBundle.demoVerification, runtimeBundle.pilotReadinessAudit);
  reconcileDevelopmentPlan(
    runtimeBundle.developmentPlan,
    runtimeBundle.pilotReadinessAudit,
    runtimeBundle.demoWalkthrough,
    runtimeBundle.demoVerification,
    state
  );
  return runtimeBundle;
}

export function normalizeSenaStatisticalLeafHolder(
  holder: JsonRecord,
  context: string,
  fusionEvidence?: SenaFusionMathAuditEvidence
): SenaStatisticalLeafReadState {
  const fusionMathAudit = normalizeSenaFusionMathAudit(holder.fusionMathAudit, fusionEvidence);
  const codingReliabilityGate = normalizeSenaCodingReliabilityGate(holder.codingReliabilityGate);
  holder.fusionMathAudit = fusionMathAudit;
  holder.codingReliabilityGate = codingReliabilityGate;
  const legacyFusionMath = fusionMathAudit.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit;
  const legacyCodingReliability = codingReliabilityGate.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityGate;
  if (!context) throw new Error("SENA statistical leaf context is required.");
  return {
    legacyFusionMath,
    legacyCodingReliability,
    needsCurrentEvidence: legacyFusionMath || legacyCodingReliability
  };
}

function reportFusionEvidence(holder: JsonRecord, context: string): SenaFusionMathAuditEvidence {
  const parameters = asRecord(holder.parameters, `${context}.parameters`);
  return {
    matrices: holder.matrices as SenaFusionMathAuditEvidence["matrices"],
    options: parameters.buildOptions as SenaFusionMathAuditEvidence["options"],
    pairReport: holder.pairReport as SenaFusionMathAuditEvidence["pairReport"]
  };
}

function runtimeFusionEvidence(holder: JsonRecord, context: string): SenaFusionMathAuditEvidence {
  const parameters = asRecord(holder.parameters, `${context}.parameters`);
  const runtimes = asRecord(holder.runtimes, `${context}.runtimes`);
  const sena = asRecord(runtimes.sena, `${context}.runtimes.sena`);
  return {
    matrices: sena.matrices as SenaFusionMathAuditEvidence["matrices"],
    options: parameters.buildOptions as SenaFusionMathAuditEvidence["options"],
    pairReport: sena.pairReport as SenaFusionMathAuditEvidence["pairReport"]
  };
}

export function normalizeSenaReportStatisticalLeaves(
  value: unknown,
  context = "SENA report"
): { report: SenaReport; state: SenaStatisticalLeafReadState } {
  const report = structuredClone(asRecord(value, context));
  if (report.schemaVersion !== SENA_SCHEMA_VERSIONS.report) {
    throw new Error(`${context}.schemaVersion is not supported.`);
  }
  assertSenaReportHolderStructure(report, context);
  const state = normalizeSenaStatisticalLeafHolder(report, context, reportFusionEvidence(report, context));
  reconcileSenaReportStatisticalSurfaces(report as SenaReport, state);
  return { report: report as SenaReport, state };
}

export function normalizeSenaRuntimeBundleStatisticalLeaves(
  value: unknown,
  context = "SENA runtime bundle"
): { runtimeBundle: SenaRuntimeBundle; state: SenaStatisticalLeafReadState } {
  const runtimeBundle = structuredClone(asRecord(value, context));
  if (runtimeBundle.schemaVersion !== SENA_SCHEMA_VERSIONS.runtimeBundle) {
    throw new Error(`${context}.schemaVersion is not supported.`);
  }
  assertSenaRuntimeBundleHolderStructure(runtimeBundle, context);
  const bundleState = normalizeSenaStatisticalLeafHolder(
    runtimeBundle,
    context,
    runtimeFusionEvidence(runtimeBundle, context)
  );
  const normalizedReport = normalizeSenaReportStatisticalLeaves(runtimeBundle.report, `${context}.report`);
  runtimeBundle.report = normalizedReport.report;
  const state = {
    legacyFusionMath: bundleState.legacyFusionMath || normalizedReport.state.legacyFusionMath,
    legacyCodingReliability: bundleState.legacyCodingReliability || normalizedReport.state.legacyCodingReliability,
    needsCurrentEvidence: bundleState.needsCurrentEvidence || normalizedReport.state.needsCurrentEvidence
  };
  if (state.needsCurrentEvidence) {
    reconcileSenaRuntimeBundleStatisticalSurfaces(runtimeBundle as SenaRuntimeBundle, state);

    if (Array.isArray(runtimeBundle.artifactEvidence)) {
      runtimeBundle.artifactEvidence = runtimeBundle.artifactEvidence.map((entry) => {
        if (entry.filename === "sena-fusion-math-audit.json") {
          return { ...entry, schemaVersion: SENA_SCHEMA_VERSIONS.fusionMathAudit, status: "review" as const };
        }
        if (entry.filename === "sena-coding-reliability-gate.json") {
          return { ...entry, schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityGate, status: "review" as const };
        }
        return entry;
      });
    }
  }
  return { runtimeBundle: runtimeBundle as SenaRuntimeBundle, state };
}

function hasNormalizedStatisticalLeaves(holder: JsonRecord) {
  const fusionMathAudit = asRecord(holder.fusionMathAudit, "fusionMathAudit");
  const codingReliabilityGate = asRecord(holder.codingReliabilityGate, "codingReliabilityGate");
  return fusionMathAudit.schemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit &&
    codingReliabilityGate.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityGate;
}

export function importSenaReport(source: string | unknown): SenaReport {
  return normalizeSenaReportStatisticalLeaves(parseSource(source)).report;
}

export function isSenaReport(value: unknown): value is SenaReport {
  try {
    const record = asRecord(value, "SENA report");
    if (record.schemaVersion !== SENA_SCHEMA_VERSIONS.report || !hasNormalizedStatisticalLeaves(record)) return false;
    normalizeSenaReportStatisticalLeaves(record);
    return true;
  } catch {
    return false;
  }
}

export function importSenaRuntimeBundle(source: string | unknown): SenaRuntimeBundle {
  return normalizeSenaRuntimeBundleStatisticalLeaves(parseSource(source)).runtimeBundle;
}

export function isSenaRuntimeBundle(value: unknown): value is SenaRuntimeBundle {
  try {
    const record = asRecord(value, "SENA runtime bundle");
    const report = asRecord(record.report, "SENA runtime bundle.report");
    if (record.schemaVersion !== SENA_SCHEMA_VERSIONS.runtimeBundle ||
      !hasNormalizedStatisticalLeaves(record) ||
      !hasNormalizedStatisticalLeaves(report)) return false;
    normalizeSenaRuntimeBundleStatisticalLeaves(record);
    return true;
  } catch {
    return false;
  }
}
