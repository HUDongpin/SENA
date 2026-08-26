import { senaJsonValuesEqual } from "./canonical-json";
import {
  normalizeSenaFusionMathAudit,
  type SenaFusionMathAuditEvidence
} from "./fusion-math";
import { inspectSenaModelCardSections } from "./model-card";
import {
  buildSenaClaimReadinessGate,
  SENA_PILOT_READINESS_ITEM_IDS
} from "./pilot-readiness";
import {
  SENA_DEMO_VERIFICATION_CHECK_IDS,
  SENA_DEMO_VERIFICATION_READINESS_IDS
} from "./demo-verification";
import {
  SENA_DEMO_WALKTHROUGH_READINESS_IDS,
  SENA_DEMO_WALKTHROUGH_STEP_IDS
} from "./demo-walkthrough";
import {
  buildSenaRuntimeArtifactEvidence,
  SENA_RUNTIME_ARTIFACT_FILENAMES
} from "./runtime-bundle";
import {
  isSenaReportHumanReviewComplete,
  isSenaReportHumanReviewTextPresent,
  normalizeSenaDataGovernanceMetadata,
  normalizeSenaCodingReliabilityGate,
  SENA_REPORT_COMPLETENESS_ITEM_IDS
} from "./report";
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
  SenaDataGovernanceMetadata,
  SenaDevelopmentPlan,
  SenaFusionMathAudit,
  SenaPilotReadinessAudit,
  SenaReport,
  SenaReportCompletenessAudit,
  SenaReportHumanReview,
  SenaRuntimeBundle
} from "./types";

type JsonRecord = Record<string, unknown>;

export type SenaStatisticalLeafReadState = {
  legacyFusionMath: boolean;
  legacyCodingReliability: boolean;
  needsCurrentEvidence: boolean;
};

export function assertSenaExactItemMembership(
  itemIds: readonly string[],
  expectedItemIds: readonly string[],
  context: string
) {
  const unique = new Set(itemIds);
  const expected = new Set(expectedItemIds);
  const missing = expectedItemIds.filter((id) => !unique.has(id));
  const unexpected = Array.from(unique).filter((id) => !expected.has(id));
  if (unique.size !== itemIds.length || missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${context} membership is invalid ` +
      `(missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}; ` +
      `duplicates=${itemIds.length - unique.size}).`
    );
  }
}

const legacyPilotReadinessReconciliationNote =
  "Restore normalization never upgrades historical statistical evidence to current-ready status.";
const currentPilotReadinessReconciliationNote =
  "Current-v2 pilot readiness was reconciled from current statistical and review evidence.";
const legacyCompletenessReconciliationNote =
  "Restored completeness is reconciled from normalized statistical leaves before readiness is evaluated.";
const currentCompletenessReconciliationNote =
  "Current-v2 report completeness was reconciled from current statistical and human-review evidence.";
const legacyDevelopmentPlanReconciliationNote =
  "Legacy-dependent plan evidence was invalidated and rebuilt from normalized current readiness items.";
const legacyReadinessEvidenceMarker = "legacy-statistical-dependent-evidence-invalidated";
const currentReadinessEvidenceMarker = "current-v2-readiness-evidence-reconciled";

export function selectSenaFailClosedCodingReliabilityGate(
  gates: readonly SenaCodingReliabilityGate[],
  context: string
): SenaCodingReliabilityGate {
  if (gates.length === 0) {
    throw new Error(`${context} has no coding-reliability provenance.`);
  }
  const current = gates.filter((gate) =>
    gate.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityGate
  );
  const legacy = gates.filter((gate) =>
    gate.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityGate
  );
  if (!current.every((gate) => senaJsonValuesEqual(gate, current[0]))) {
    const readyQualifier = current.every((gate) => gate.status === "ready")
      ? "conflicting ready coding-reliability provenance; "
      : "";
    throw new Error(
      `${context} carries ${readyQualifier}conflicting current-v2 coding-reliability provenance.`
    );
  }
  if (!legacy.every((gate) => senaJsonValuesEqual(gate, legacy[0]))) {
    throw new Error(`${context} carries conflicting legacy coding-reliability provenance.`);
  }
  return structuredClone(
    legacy[0] ?? current.find((gate) => gate.status !== "ready") ?? current[0] ?? gates[0]
  );
}

export function selectSenaFailClosedFusionMathAudit(
  audits: readonly SenaFusionMathAudit[],
  context: string
): SenaFusionMathAudit {
  if (audits.length === 0) {
    throw new Error(`${context} has no fusion-math provenance.`);
  }
  const current = audits.filter((audit) =>
    audit.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit
  );
  const legacy = audits.filter((audit) =>
    audit.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.fusionMathAudit
  );
  if (!current.every((audit) => senaJsonValuesEqual(audit, current[0]))) {
    throw new Error(`${context} carries conflicting current-v2 fusion-math provenance.`);
  }
  if (!legacy.every((audit) => senaJsonValuesEqual(audit, legacy[0]))) {
    throw new Error(`${context} carries conflicting legacy fusion-math provenance.`);
  }
  return structuredClone(
    legacy[0] ?? current.find((audit) => audit.status !== "verified") ?? current[0] ?? audits[0]
  );
}

export function canonicalSenaReportHumanReview(
  candidates: readonly SenaReportHumanReview[],
  context: string
): SenaReportHumanReview {
  if (candidates.length === 0) {
    throw new Error(`${context} has no human-review provenance.`);
  }
  const selectField = <Field extends Exclude<keyof SenaReportHumanReview, "status">>(
    field: Field
  ): SenaReportHumanReview[Field] => {
    const values = candidates.map((candidate) => candidate[field]);
    const meaningful = values.filter((value) => field === "reviewedAt"
      ? Boolean(value.trim())
      : isSenaReportHumanReviewTextPresent(value)
    );
    const uniqueMeaningful = Array.from(new Set(meaningful));
    if (uniqueMeaningful.length > 1) {
      throw new Error(`${context} carries conflicting current human-review ${field} provenance.`);
    }
    return uniqueMeaningful[0] ?? values.find((value) => Boolean(value.trim())) ?? "";
  };
  return {
    status: candidates.every(isSenaReportHumanReviewComplete) ? "human-reviewed" : "draft",
    reviewer: selectField("reviewer"),
    reviewedAt: selectField("reviewedAt"),
    interpretation: selectField("interpretation"),
    limitations: selectField("limitations"),
    nextActions: selectField("nextActions")
  };
}

export function canonicalSenaDataGovernanceMetadata(
  candidates: readonly SenaDataGovernanceMetadata[],
  context: string
): SenaDataGovernanceMetadata {
  if (candidates.length === 0) {
    throw new Error(`${context} has no data-governance provenance.`);
  }
  const canonical = candidates[0];
  if (!candidates.every((candidate) => senaJsonValuesEqual(candidate, canonical))) {
    throw new Error(`${context} carries conflicting current data-governance provenance.`);
  }
  return structuredClone(canonical);
}

function reconciliationNotes(
  notes: string[],
  state: SenaStatisticalLeafReadState,
  reconciled: boolean,
  legacyNote: string,
  currentNote: string
) {
  const selectedNote = state.needsCurrentEvidence ? legacyNote : currentNote;
  const obsoleteNote = state.needsCurrentEvidence ? currentNote : legacyNote;
  const normalizedNotes = notes.filter((note) => note !== obsoleteNote);
  return state.needsCurrentEvidence || reconciled || normalizedNotes.length !== notes.length
    ? Array.from(new Set([...normalizedNotes, selectedNote]))
    : normalizedNotes;
}

function reconcileReadinessEvidenceMarker(
  evidence: string[],
  state: SenaStatisticalLeafReadState
) {
  const selectedMarker = state.needsCurrentEvidence
    ? legacyReadinessEvidenceMarker
    : currentReadinessEvidenceMarker;
  const obsoleteMarker = state.needsCurrentEvidence
    ? currentReadinessEvidenceMarker
    : legacyReadinessEvidenceMarker;
  if (!evidence.includes(obsoleteMarker)) return evidence;
  return Array.from(new Set([
    ...evidence.filter((entry) => entry !== obsoleteMarker),
    selectedMarker
  ]));
}

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
  completenessAudit?: SenaReportCompletenessAudit,
  codingReliabilityGate?: SenaCodingReliabilityGate,
  humanReview?: SenaReportHumanReview,
  fusionMathAudit?: SenaFusionMathAudit,
  dataGovernance?: SenaDataGovernanceMetadata
): SenaPilotReadinessAudit {
  const audit = structuredClone(value);
  let reconciled = false;
  const reasons = new Map<string, { reason: string; blocker: string }>();
  if (state.legacyCodingReliability) {
    reasons.set("coding-reliability", {
      reason: "Historical v1 reliability evidence cannot establish current v2 machine eligibility.",
      blocker: "current-v2-reliability-evidence-required"
    });
  }
  audit.items = audit.items.map((item) => {
    if (item.id === "fusion-math" && fusionMathAudit) {
      const currentVerified = !state.legacyFusionMath && fusionMathAudit.status === "verified";
      const next = {
        ...item,
        status: currentVerified ? "ready" as const : "review" as const,
        summary: state.legacyFusionMath
          ? "Historical v1 fusion evidence does not prove the current v2 nonnegative-value contract."
          : `${fusionMathAudit.passed} formula checks passed; ${fusionMathAudit.reviewNeeded} need review`,
        evidence: state.legacyFusionMath
          ? [
              "legacy-statistical-contract-normalized",
              "current-v2-fusion-nonnegative-evidence-required",
              ...fusionMathAudit.items.map((entry) => `${entry.label}: ${entry.status}`)
            ]
          : fusionMathAudit.items.map((entry) => `${entry.label}: ${entry.status}`),
        nextAction: "Resolve formula block mismatches before using weighted fusion results in a pilot report."
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "report-completeness" && completenessAudit) {
      const next = {
        ...item,
        status: completenessAudit.status === "complete" ? "ready" as const : "review" as const,
        summary: `${completenessAudit.passed} report checks passed; ${completenessAudit.reviewNeeded} need review`,
        evidence: completenessAudit.items.map((entry) => `${entry.label}: ${entry.status}`),
        nextAction: "Complete every report section before sharing a pilot export."
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    const invalidation = reasons.get(item.id);
    if (invalidation) {
      const next = {
        ...item,
        status: "review" as const,
        summary: invalidation.reason,
        evidence: [
          "legacy-statistical-contract-normalized",
          invalidation.blocker,
          invalidation.reason
        ],
        nextAction: "Attach current v2 statistical evidence before treating this restored artifact as ready."
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "coding-reliability" && codingReliabilityGate) {
      const next = {
        ...item,
        status: codingReliabilityGate.status === "ready" ? "ready" as const : "review" as const,
        summary: codingReliabilityGate.status === "ready"
          ? `Coding reliability documented by ${codingReliabilityGate.review.reviewer}`
          : `${codingReliabilityGate.blockers.length} coding-reliability blocker${codingReliabilityGate.blockers.length === 1 ? "" : "s"}`,
        evidence: [codingReliabilityGate.schemaVersion, ...codingReliabilityGate.evidence],
        nextAction: "Document the coding scheme, coding unit, coder count, agreement metric/value, adjudication notes, and limitations before treating SENA patterns as research claims."
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "data-governance" && dataGovernance) {
      const ready = dataGovernance.status === "complete" && dataGovernance.blockers.length === 0;
      const next = {
        ...item,
        status: ready ? "ready" as const : "review" as const,
        summary: ready
          ? `Data governance documented by ${dataGovernance.dataSteward || "assigned steward"}`
          : `${dataGovernance.blockers.length} data-governance blocker${dataGovernance.blockers.length === 1 ? "" : "s"}`,
        evidence: [
          dataGovernance.schemaVersion,
          `status=${dataGovernance.status}`,
          `irb=${dataGovernance.irbApprovalId ? "present" : "missing"}`,
          `consent=${dataGovernance.consentScope ? "present" : "missing"}`,
          `retention=${dataGovernance.retentionPolicy ? "present" : "missing"}`,
          `usageConstraints=${dataGovernance.usageConstraints.length}`,
          `dataSteward=${dataGovernance.dataSteward ? "present" : "missing"}`,
          ...dataGovernance.blockers.map((blocker) => `missing=${blocker}`)
        ],
        nextAction: "Document IRB/ethics approval, consent scope, retention policy, usage constraints, and data steward before treating SENA patterns as research claims."
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "human-review" && humanReview) {
      const complete = isSenaReportHumanReviewComplete(humanReview);
      const next = {
        ...item,
        status: complete ? "ready" as const : "review" as const,
        summary: humanReview.status === "human-reviewed"
          ? `Reviewed by ${humanReview.reviewer || "unassigned"}`
          : "Draft interpretation",
        evidence: [
          `reviewer=${humanReview.reviewer || "unassigned"}`,
          `interpretation=${isSenaReportHumanReviewTextPresent(humanReview.interpretation) ? "present" : "missing"}`,
          `limitations=${isSenaReportHumanReviewTextPresent(humanReview.limitations) ? "present" : "missing"}`,
          `nextActions=${isSenaReportHumanReviewTextPresent(humanReview.nextActions) ? "present" : "missing"}`
        ],
        nextAction: "Mark as human-reviewed only after interpretation, limitations, and next actions are filled."
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    return item;
  });
  const passed = audit.items.filter((item) => item.status === "ready").length;
  const status = passed === audit.items.length ? "ready" as const : "needs-review" as const;
  reconciled ||= audit.status !== status || audit.passed !== passed || audit.reviewNeeded !== audit.items.length - passed;
  return {
    ...audit,
    status,
    passed,
    reviewNeeded: audit.items.length - passed,
    notes: reconciliationNotes(
      audit.notes,
      state,
      reconciled,
      legacyPilotReadinessReconciliationNote,
      currentPilotReadinessReconciliationNote
    )
  };
}

function invalidatedReadiness(
  pilotReadinessAudit: SenaPilotReadinessAudit,
  state: SenaStatisticalLeafReadState,
  completenessAudit?: SenaReportCompletenessAudit,
  codingReliabilityGate?: SenaCodingReliabilityGate,
  humanReview?: SenaReportHumanReview,
  fusionMathAudit?: SenaFusionMathAudit,
  dataGovernance?: SenaDataGovernanceMetadata
): { pilotReadinessAudit: SenaPilotReadinessAudit; claimReadinessGate: SenaClaimReadinessGate } {
  const normalizedPilot = state.needsCurrentEvidence || completenessAudit || codingReliabilityGate || humanReview || fusionMathAudit || dataGovernance
    ? markPilotReadinessForStatisticalReview(
        pilotReadinessAudit,
        state,
        completenessAudit,
        codingReliabilityGate,
        humanReview,
        fusionMathAudit,
        dataGovernance
      )
    : structuredClone(pilotReadinessAudit);
  return {
    pilotReadinessAudit: normalizedPilot,
    claimReadinessGate: buildSenaClaimReadinessGate(normalizedPilot)
  };
}

export function reconcileSenaStatisticalReadiness(
  pilotReadinessAudit: SenaPilotReadinessAudit,
  state: SenaStatisticalLeafReadState,
  completenessAudit?: SenaReportCompletenessAudit,
  codingReliabilityGate?: SenaCodingReliabilityGate,
  humanReview?: SenaReportHumanReview,
  fusionMathAudit?: SenaFusionMathAudit,
  dataGovernance?: SenaDataGovernanceMetadata
): { pilotReadinessAudit: SenaPilotReadinessAudit; claimReadinessGate: SenaClaimReadinessGate } {
  return invalidatedReadiness(
    pilotReadinessAudit,
    state,
    completenessAudit,
    codingReliabilityGate,
    humanReview,
    fusionMathAudit,
    dataGovernance
  );
}

function reconcileReportCompleteness(
  value: SenaReportCompletenessAudit,
  fusionMathAudit: SenaFusionMathAudit,
  codingReliabilityGate: SenaCodingReliabilityGate,
  humanReview: SenaReportHumanReview,
  state: SenaStatisticalLeafReadState,
  dataGovernance: SenaDataGovernanceMetadata
): SenaReportCompletenessAudit {
  const audit = structuredClone(value);
  let reconciled = false;
  audit.items = audit.items.map((item) => {
    if (item.id === "fusion-math-audit") {
      const currentVerified = !state.legacyFusionMath && fusionMathAudit.status === "verified";
      const next = {
        ...item,
        status: currentVerified ? "pass" as const : "review" as const,
        summary: `${fusionMathAudit.passed} formula checks passed; ${fusionMathAudit.reviewNeeded} need review`,
        evidence: state.legacyFusionMath
          ? [
              "current-v2-fusion-nonnegative-evidence-required",
              ...fusionMathAudit.items.map((entry) => `${entry.label}: ${entry.status}`)
            ]
          : fusionMathAudit.items.map((entry) => `${entry.label}: ${entry.status}`)
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "coding-reliability" && state.legacyCodingReliability) {
      const next = {
        ...item,
        status: "review" as const,
        summary: "Current v2 coding-reliability machine evidence is required.",
        evidence: [
          `sourceSchemaVersion=${codingReliabilityGate.sourceSchemaVersion}`,
          `machineEligibility=${codingReliabilityGate.machineClaimEligibility.eligible ? "eligible" : "ineligible"}`,
          ...codingReliabilityGate.machineClaimEligibility.blockers
        ]
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "coding-reliability") {
      const review = codingReliabilityGate.review;
      const present = (value: string) => Boolean(value.trim()) && value.trim() !== "Pending coding reliability documentation.";
      const next = {
        ...item,
        status: codingReliabilityGate.status === "ready" ? "pass" as const : "review" as const,
        summary: codingReliabilityGate.status === "ready"
          ? `Coding reliability documented by ${review.reviewer}`
          : "Coding reliability evidence is incomplete",
        evidence: [
          `status=${review.status}`,
          `reviewer=${review.reviewer || "unassigned"}`,
          `codingScheme=${present(review.codingScheme) ? "present" : "missing"}`,
          `unitOfCoding=${present(review.unitOfCoding) ? "present" : "missing"}`,
          `coderCount=${review.coderCount}`,
          `agreementMetric=${present(review.agreementMetric) ? "present" : "missing"}`,
          `agreementValue=${present(review.agreementValue) ? "present" : "missing"}`,
          `adjudication=${present(review.adjudicationNotes) ? "present" : "missing"}`
        ]
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "data-governance") {
      const ready = dataGovernance.status === "complete" && dataGovernance.blockers.length === 0;
      const next = {
        ...item,
        status: ready ? "pass" as const : "review" as const,
        summary: ready
          ? `Data governance reviewed by ${dataGovernance.dataSteward || "assigned steward"}`
          : `${dataGovernance.blockers.length} data-governance blocker${dataGovernance.blockers.length === 1 ? "" : "s"}`,
        evidence: [
          dataGovernance.schemaVersion,
          `status=${dataGovernance.status}`,
          `irb=${dataGovernance.irbApprovalId ? "present" : "missing"}`,
          `consent=${dataGovernance.consentScope ? "present" : "missing"}`,
          `retention=${dataGovernance.retentionPolicy ? "present" : "missing"}`,
          `usageConstraints=${dataGovernance.usageConstraints.length}`,
          `dataSteward=${dataGovernance.dataSteward ? "present" : "missing"}`,
          ...dataGovernance.blockers.map((blocker) => `missing=${blocker}`)
        ]
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    if (item.id === "human-review") {
      const complete = isSenaReportHumanReviewComplete(humanReview);
      const next = {
        ...item,
        status: complete ? "pass" as const : "review" as const,
        summary: complete ? `Reviewed by ${humanReview.reviewer}` : "Draft or incomplete human-review fields",
        evidence: [
          `status=${humanReview.status}`,
          `reviewer=${humanReview.reviewer || "unassigned"}`,
          `interpretation=${isSenaReportHumanReviewTextPresent(humanReview.interpretation) ? "present" : "missing"}`,
          `limitations=${isSenaReportHumanReviewTextPresent(humanReview.limitations) ? "present" : "missing"}`,
          `nextActions=${isSenaReportHumanReviewTextPresent(humanReview.nextActions) ? "present" : "missing"}`
        ]
      };
      reconciled ||= JSON.stringify(next) !== JSON.stringify(item);
      return next;
    }
    return item;
  });
  const passed = audit.items.filter((item) => item.status === "pass").length;
  const status = passed === audit.items.length ? "complete" as const : "needs-review" as const;
  reconciled ||= audit.status !== status || audit.passed !== passed || audit.reviewNeeded !== audit.items.length - passed;
  return {
    ...audit,
    status,
    passed,
    reviewNeeded: audit.items.length - passed,
    notes: reconciliationNotes(
      audit.notes,
      state,
      reconciled,
      legacyCompletenessReconciliationNote,
      currentCompletenessReconciliationNote
    )
  };
}

function reconcileModelCardReliability(
  modelCard: SenaReport["modelCard"],
  codingReliabilityGate: SenaCodingReliabilityGate,
  state: SenaStatisticalLeafReadState,
  dataGovernance: SenaDataGovernanceMetadata
) {
  const codingReliabilityReady = codingReliabilityGate.status === "ready";
  const dataGovernanceReady = dataGovernance.status === "complete" && dataGovernance.blockers.length === 0;
  modelCard.sections = modelCard.sections.map((section) => {
    if (section.id === "coding-reliability") return {
        ...section,
        status: codingReliabilityReady ? "complete" as const : "needs-review" as const,
        evidence: state.legacyCodingReliability
          ? Array.from(new Set([
              `status=${codingReliabilityGate.status}`,
              ...codingReliabilityGate.evidence,
              "current-v2-reliability-evidence-required",
              "legacy statistical read projection cannot establish publication readiness"
            ]))
          : [`status=${codingReliabilityGate.status}`, ...codingReliabilityGate.evidence]
      };
    if (section.id === "data-contract" && !dataGovernanceReady) return {
      ...section,
      status: "needs-review" as const
    };
    return section;
  });
  modelCard.reliability = state.legacyCodingReliability
    ? {
        status: "needs-review",
        summary: "Historical v1 reliability evidence cannot establish current publication readiness.",
        evidence: Array.from(new Set([
          ...codingReliabilityGate.evidence,
          "current-v2-reliability-evidence-required"
        ]))
      }
    : {
        status: codingReliabilityReady ? "complete" : "needs-review",
        summary: codingReliabilityReady
          ? codingReliabilityGate.guardrail
          : "Coding reliability evidence is incomplete; keep claims exploratory.",
        evidence: [...codingReliabilityGate.evidence]
      };
  const sectionIntegrity = inspectSenaModelCardSections(modelCard.sections);
  const missingSectionIds = sectionIntegrity.blockingIds;
  const sectionMembershipInconsistent = sectionIntegrity.missingIds.length > 0 ||
    sectionIntegrity.duplicateIds.length > 0 ||
    sectionIntegrity.unknownIds.length > 0 ||
    sectionIntegrity.malformedIndexes.length > 0;
  const renderBlocked = missingSectionIds.length > 0 ||
    sectionIntegrity.unknownIds.length > 0 ||
    sectionIntegrity.malformedIndexes.length > 0;
  const renderedBlockers = [
    ...missingSectionIds,
    ...sectionIntegrity.unknownIds.map((id) => `unknown:${id}`),
    ...sectionIntegrity.malformedIndexes.map((index) => `malformed:${index}`)
  ];
  modelCard.renderGate = {
    status: renderBlocked ? "blocked" : "ready",
    missingSectionIds,
    message: !renderBlocked
      ? "Model card complete - rendering permitted."
      : sectionMembershipInconsistent
        ? `Model card incomplete or inconsistent - rendering blocked: ${renderedBlockers.join(", ")}.`
        : `Model card incomplete - rendering blocked: ${renderedBlockers.join(", ")}.`
  };
  return modelCard;
}

function reconcileReportReviewChecklistCaches(report: SenaReport) {
  const brief = report.figures.activeWindowBrief;
  if (!brief) return;
  const expectedItemIds = [
    "active-window-baseline",
    "evidence-ledger",
    "coding-reliability",
    "human-review"
  ];
  const itemIds = brief.reviewChecklist.map((item) => item.id);
  const uniqueItemIds = new Set<string>(itemIds);
  const missing = expectedItemIds.filter((id) => !uniqueItemIds.has(id));
  const unexpected = Array.from(uniqueItemIds).filter((id) => !expectedItemIds.includes(id));
  if (uniqueItemIds.size !== itemIds.length || missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      "SENA active-window review-checklist membership is invalid " +
      `(missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}; ` +
      `duplicates=${itemIds.length - uniqueItemIds.size}).`
    );
  }
  const humanReviewComplete = isSenaReportHumanReviewComplete(report.humanReview);
  const codingReliabilityReady = report.codingReliabilityGate.status === "ready";
  brief.reviewChecklist = brief.reviewChecklist.map((item) => {
    if (item.id === "human-review") {
      return {
        ...item,
        status: humanReviewComplete ? "present" as const : "needed" as const,
        detail: humanReviewComplete
          ? "Human review is marked complete."
          : "Human interpretation fields remain draft or incomplete."
      };
    }
    if (item.id === "coding-reliability") {
      return {
        ...item,
        status: codingReliabilityReady ? "present" as const : "needed" as const,
        detail: codingReliabilityReady
          ? "Coding reliability gate is documented."
          : "Coding reliability gate remains required before research claims."
      };
    }
    return item;
  });
}

export function reconcileSenaReportStatisticalSurfaces(
  report: SenaReport,
  state: SenaStatisticalLeafReadState
): SenaReport {
  if (report.humanReview.status === "human-reviewed" && !isSenaReportHumanReviewComplete(report.humanReview)) {
    report.humanReview = { ...report.humanReview, status: "draft" };
  }
  report.completenessAudit = reconcileReportCompleteness(
    report.completenessAudit,
    report.fusionMathAudit,
    report.codingReliabilityGate,
    report.humanReview,
    state,
    report.dataGovernance
  );
  const readiness = invalidatedReadiness(
    report.pilotReadinessAudit,
    state,
    report.completenessAudit,
    report.codingReliabilityGate,
    report.humanReview,
    report.fusionMathAudit,
    report.dataGovernance
  );
  report.pilotReadinessAudit = readiness.pilotReadinessAudit;
  report.claimReadinessGate = readiness.claimReadinessGate;
  reconcileModelCardReliability(report.modelCard, report.codingReliabilityGate, state, report.dataGovernance);
  reconcileReportReviewChecklistCaches(report);
  return report;
}

function reconcileDemoWalkthrough(
  value: SenaDemoWalkthrough,
  pilotReadinessAudit: SenaPilotReadinessAudit,
  state: SenaStatisticalLeafReadState
) {
  assertSenaExactItemMembership(
    value.steps.map((step) => step.id),
    SENA_DEMO_WALKTHROUGH_STEP_IDS,
    "SENA demo-walkthrough step"
  );
  const readiness = new Map(pilotReadinessAudit.items.map((item) => [item.id, item.status]));
  value.steps = value.steps.map((step) => {
    const dependencies = SENA_DEMO_WALKTHROUGH_READINESS_IDS[step.id] ?? [];
    const dependenciesReady = dependencies.every((id) => readiness.get(id) === "ready");
    const status = step.status === "ready" && dependenciesReady ? "ready" as const : "review" as const;
    return {
      ...step,
      readinessItemIds: [...dependencies],
      status,
      evidence: dependenciesReady
        ? reconcileReadinessEvidenceMarker(step.evidence, state)
        : normalizedReadinessEvidence(pilotReadinessAudit, dependencies, state)
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

function normalizedReadinessEvidence(
  pilotReadinessAudit: SenaPilotReadinessAudit,
  readinessItemIds: readonly string[],
  state: SenaStatisticalLeafReadState
) {
  return Array.from(new Set([
    state.needsCurrentEvidence
      ? legacyReadinessEvidenceMarker
      : currentReadinessEvidenceMarker,
    ...readinessItemIds.flatMap((id) => {
      const item = pilotReadinessAudit.items.find((candidate) => candidate.id === id);
      return item
        ? [
          `${item.label}: ${item.status}`,
          item.summary,
          ...item.evidence.filter((evidence) =>
            (state.needsCurrentEvidence && evidence === "legacy-statistical-contract-normalized") ||
            evidence.startsWith("current-v2-"))
        ]
        : [`${id}: missing`];
    })
  ]));
}

function reconcileDemoVerification(
  value: SenaDemoVerification,
  pilotReadinessAudit: SenaPilotReadinessAudit,
  state: SenaStatisticalLeafReadState
) {
  assertSenaExactItemMembership(
    value.checks.map((check) => check.id),
    SENA_DEMO_VERIFICATION_CHECK_IDS,
    "SENA demo-verification check"
  );
  const readiness = new Map(pilotReadinessAudit.items.map((item) => [item.id, item.status]));
  value.checks = value.checks.map((check) => {
    const dependencies = SENA_DEMO_VERIFICATION_READINESS_IDS[check.id];
    const dependenciesReady = Boolean(dependencies) && dependencies.every((id) => readiness.get(id) === "ready");
    if (dependenciesReady) {
      return {
        ...check,
        readinessItemIds: [...dependencies],
        observedEvidence: reconcileReadinessEvidenceMarker(check.observedEvidence, state)
      };
    }
    return {
      ...check,
      readinessItemIds: [...(dependencies ?? [])],
      status: "review" as const,
      observedEvidence: normalizedReadinessEvidence(pilotReadinessAudit, dependencies ?? [], state)
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

function developmentPhaseEvidence(
  pilotReadinessAudit: SenaPilotReadinessAudit,
  readinessItemIds: string[]
) {
  return readinessItemIds.flatMap((id) => {
    const item = pilotReadinessAudit.items.find((candidate) => candidate.id === id);
    return item
      ? [`${item.label}: ${item.status}`, ...item.evidence.slice(0, 3)]
      : [`${id}: missing`];
  });
}

function replacePrefixedEntry(values: string[], prefix: string, replacement: string) {
  const normalized: string[] = [];
  let replaced = false;
  for (const value of values) {
    if (!value.startsWith(prefix)) {
      normalized.push(value);
      continue;
    }
    if (!replaced) normalized.push(replacement);
    replaced = true;
  }
  if (!replaced) normalized.push(replacement);
  return normalized;
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
    if (phase.id === "local-research-pilot") {
      return {
        ...phase,
        evidence: replacePrefixedEntry(
          phase.evidence,
          "pilotReadiness=",
          `pilotReadiness=${pilotReadinessAudit.status}`
        )
      };
    }
    const dependencies = phase.id === "runtime-foundation"
      ? ["fusion-model", "model-json-export", "fusion-math", "runtime-consistency", "runtime-artifacts"]
      : phase.id === "research-validation"
        ? ["method-validation", "coding-reliability", "evidence-ledger", "human-review"]
        : [];
    if (dependencies.length === 0) return phase;
    const dependenciesReady = dependencies.every((id) =>
      pilotReadinessAudit.items.find((item) => item.id === id)?.status === "ready"
    );
    return {
      ...phase,
      status: !dependenciesReady && phase.status === "complete" ? "active" as const : phase.status,
      evidence: (phase.id === "runtime-foundation" && state.legacyFusionMath) ||
        (phase.id === "research-validation" && state.legacyCodingReliability)
        ? normalizedReadinessEvidence(pilotReadinessAudit, dependencies, state)
        : developmentPhaseEvidence(pilotReadinessAudit, dependencies)
    };
  });
  value.nextStage.baseline.evidence = replacePrefixedEntry(
    value.nextStage.baseline.evidence,
    "deliveryCandidate=",
    `deliveryCandidate=${value.deliveryCandidate.status}`
  );
  value.notes = replacePrefixedEntry(
    value.notes,
    "Delivery candidate status: ",
    `Delivery candidate status: ${value.deliveryCandidate.status}.`
  );
  if (state.needsCurrentEvidence) {
    value.notes = Array.from(new Set([
      ...value.notes,
      legacyDevelopmentPlanReconciliationNote
    ]));
  } else {
    value.notes = value.notes.filter((note) => note !== legacyDevelopmentPlanReconciliationNote);
  }
}

function reconcileRuntimeArtifactEvidence(runtimeBundle: SenaRuntimeBundle) {
  if (!Array.isArray(runtimeBundle.artifactEvidence)) return;
  const filenames = runtimeBundle.artifactEvidence.map((entry) => entry.filename);
  const uniqueFilenames = new Set(filenames);
  const expectedFilenames = new Set<string>(SENA_RUNTIME_ARTIFACT_FILENAMES);
  const missing = SENA_RUNTIME_ARTIFACT_FILENAMES.filter((filename) => !uniqueFilenames.has(filename));
  const unexpected = Array.from(uniqueFilenames).filter((filename) => !expectedFilenames.has(filename));
  if (uniqueFilenames.size !== filenames.length || missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      "SENA runtime artifact-evidence membership is invalid " +
      `(missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}; ` +
      `duplicates=${filenames.length - uniqueFilenames.size}).`
    );
  }
  runtimeBundle.artifactEvidence = buildSenaRuntimeArtifactEvidence(
    {
      matrices: runtimeBundle.runtimes.sena.matrices,
      pairReport: runtimeBundle.runtimes.sena.pairReport,
      socialReport: runtimeBundle.runtimes.sna.socialReport
    },
    runtimeBundle.report,
    runtimeBundle.evidenceLedger,
    runtimeBundle.temporalRuntimeTrace
  );
}

export function reconcileSenaRuntimeBundleStatisticalSurfaces(
  runtimeBundle: SenaRuntimeBundle,
  state: SenaStatisticalLeafReadState
) {
  const failClosedFusionMathAudit = selectSenaFailClosedFusionMathAudit(
    [runtimeBundle.fusionMathAudit, runtimeBundle.report.fusionMathAudit],
    "SENA runtime bundle"
  );
  runtimeBundle.fusionMathAudit = structuredClone(failClosedFusionMathAudit);
  runtimeBundle.report.fusionMathAudit = structuredClone(failClosedFusionMathAudit);
  const failClosedGate = selectSenaFailClosedCodingReliabilityGate(
    [runtimeBundle.codingReliabilityGate, runtimeBundle.report.codingReliabilityGate],
    "SENA runtime bundle"
  );
  runtimeBundle.codingReliabilityGate = structuredClone(failClosedGate);
  runtimeBundle.report.codingReliabilityGate = structuredClone(failClosedGate);
  const humanReview = canonicalSenaReportHumanReview(
    [runtimeBundle.report.humanReview, runtimeBundle.evidenceLedger.humanReview],
    "SENA runtime bundle"
  );
  runtimeBundle.report.humanReview = structuredClone(humanReview);
  runtimeBundle.evidenceLedger.humanReview = structuredClone(humanReview);
  reconcileSenaReportStatisticalSurfaces(runtimeBundle.report, state);
  const readiness = invalidatedReadiness(
    runtimeBundle.pilotReadinessAudit,
    state,
    runtimeBundle.report.completenessAudit,
    runtimeBundle.codingReliabilityGate,
    runtimeBundle.report.humanReview,
    runtimeBundle.fusionMathAudit,
    runtimeBundle.report.dataGovernance
  );
  runtimeBundle.pilotReadinessAudit = readiness.pilotReadinessAudit;
  runtimeBundle.claimReadinessGate = readiness.claimReadinessGate;
  reconcileModelCardReliability(
    runtimeBundle.modelCard,
    runtimeBundle.codingReliabilityGate,
    state,
    runtimeBundle.report.dataGovernance
  );
  runtimeBundle.report.pilotReadinessAudit = structuredClone(readiness.pilotReadinessAudit);
  runtimeBundle.report.claimReadinessGate = structuredClone(readiness.claimReadinessGate);
  reconcileSenaRuntimeBundleReadinessDerivations(runtimeBundle, state);
  return runtimeBundle;
}

export function reconcileSenaRuntimeBundleReadinessDerivations(
  runtimeBundle: SenaRuntimeBundle,
  state: SenaStatisticalLeafReadState
) {
  reconcileDemoWalkthrough(runtimeBundle.demoWalkthrough, runtimeBundle.pilotReadinessAudit, state);
  reconcileDemoVerification(runtimeBundle.demoVerification, runtimeBundle.pilotReadinessAudit, state);
  reconcileDevelopmentPlan(
    runtimeBundle.developmentPlan,
    runtimeBundle.pilotReadinessAudit,
    runtimeBundle.demoWalkthrough,
    runtimeBundle.demoVerification,
    state
  );
  reconcileRuntimeArtifactEvidence(runtimeBundle);
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
  const typedReport = report as SenaReport;
  assertSenaExactItemMembership(
    typedReport.completenessAudit.items.map((item) => item.id),
    SENA_REPORT_COMPLETENESS_ITEM_IDS,
    `${context} report-completeness item`
  );
  assertSenaExactItemMembership(
    typedReport.pilotReadinessAudit.items.map((item) => item.id),
    SENA_PILOT_READINESS_ITEM_IDS,
    `${context} pilot-readiness item`
  );
  typedReport.dataGovernance = normalizeSenaDataGovernanceMetadata(
    typedReport.dataGovernance,
    typedReport.generatedAt
  );
  const state = normalizeSenaStatisticalLeafHolder(report, context, reportFusionEvidence(report, context));
  reconcileSenaReportStatisticalSurfaces(typedReport, state);
  return { report: typedReport, state };
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
  const typedRuntimeBundle = runtimeBundle as SenaRuntimeBundle;
  assertSenaExactItemMembership(
    typedRuntimeBundle.pilotReadinessAudit.items.map((item) => item.id),
    SENA_PILOT_READINESS_ITEM_IDS,
    `${context} pilot-readiness item`
  );
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
  reconcileSenaRuntimeBundleStatisticalSurfaces(typedRuntimeBundle, state);
  return { runtimeBundle: typedRuntimeBundle, state };
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
