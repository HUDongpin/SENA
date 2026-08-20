import { normalizeSenaFusionMathAudit } from "./fusion-math";
import { buildSenaClaimReadinessGate } from "./pilot-readiness";
import { normalizeSenaCodingReliabilityGate } from "./report";
import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type {
  SenaClaimReadinessGate,
  SenaPilotReadinessAudit,
  SenaReport,
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
  state: SenaStatisticalLeafReadState
): SenaPilotReadinessAudit {
  const audit = structuredClone(value);
  const reasons = new Map<string, string>();
  if (state.legacyFusionMath) {
    reasons.set("fusion-math", "Historical v1 fusion evidence does not prove the current v2 nonnegative-value contract.");
  }
  if (state.legacyCodingReliability) {
    reasons.set("coding-reliability", "Historical v1 reliability evidence cannot establish current v2 machine eligibility.");
  }
  audit.items = audit.items.map((item) => {
    const reason = reasons.get(item.id);
    return reason ? {
      ...item,
      status: "review" as const,
      summary: reason,
      evidence: Array.from(new Set([...item.evidence, "legacy-statistical-contract-normalized", reason])),
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
  state: SenaStatisticalLeafReadState
): { pilotReadinessAudit: SenaPilotReadinessAudit; claimReadinessGate: SenaClaimReadinessGate } {
  const normalizedPilot = state.needsCurrentEvidence
    ? markPilotReadinessForStatisticalReview(pilotReadinessAudit, state)
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
  state: SenaStatisticalLeafReadState
): { pilotReadinessAudit: SenaPilotReadinessAudit; claimReadinessGate: SenaClaimReadinessGate } {
  return invalidatedReadiness(pilotReadinessAudit, state);
}

export function normalizeSenaStatisticalLeafHolder(
  holder: JsonRecord,
  context: string
): SenaStatisticalLeafReadState {
  const fusionMathAudit = normalizeSenaFusionMathAudit(holder.fusionMathAudit);
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

export function normalizeSenaReportStatisticalLeaves(
  value: unknown,
  context = "SENA report"
): { report: SenaReport; state: SenaStatisticalLeafReadState } {
  const report = structuredClone(asRecord(value, context));
  if (report.schemaVersion !== SENA_SCHEMA_VERSIONS.report) {
    throw new Error(`${context}.schemaVersion is not supported.`);
  }
  const state = normalizeSenaStatisticalLeafHolder(report, context);
  if (state.needsCurrentEvidence) {
    const pilotReadinessAudit = report.pilotReadinessAudit as SenaPilotReadinessAudit;
    const readiness = invalidatedReadiness(pilotReadinessAudit, state);
    report.pilotReadinessAudit = readiness.pilotReadinessAudit;
    report.claimReadinessGate = readiness.claimReadinessGate;
  }
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
  const bundleState = normalizeSenaStatisticalLeafHolder(runtimeBundle, context);
  const normalizedReport = normalizeSenaReportStatisticalLeaves(runtimeBundle.report, `${context}.report`);
  runtimeBundle.report = normalizedReport.report;
  const state = {
    legacyFusionMath: bundleState.legacyFusionMath || normalizedReport.state.legacyFusionMath,
    legacyCodingReliability: bundleState.legacyCodingReliability || normalizedReport.state.legacyCodingReliability,
    needsCurrentEvidence: bundleState.needsCurrentEvidence || normalizedReport.state.needsCurrentEvidence
  };
  if (state.needsCurrentEvidence) {
    const readiness = invalidatedReadiness(runtimeBundle.pilotReadinessAudit as SenaPilotReadinessAudit, state);
    runtimeBundle.pilotReadinessAudit = readiness.pilotReadinessAudit;
    runtimeBundle.claimReadinessGate = readiness.claimReadinessGate;
    const report = runtimeBundle.report as SenaReport;
    report.pilotReadinessAudit = structuredClone(readiness.pilotReadinessAudit);
    report.claimReadinessGate = structuredClone(readiness.claimReadinessGate);

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
    if (runtimeBundle.developmentPlan && typeof runtimeBundle.developmentPlan === "object") {
      const developmentPlan = runtimeBundle.developmentPlan as SenaRuntimeBundle["developmentPlan"];
      developmentPlan.currentGate.pilotReadinessStatus = "needs-review";
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
