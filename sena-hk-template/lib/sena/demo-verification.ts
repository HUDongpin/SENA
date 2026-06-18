import type {
  SenaDemoVerification,
  SenaDemoVerificationCompatibilityAudit,
  SenaDemoVerificationCompatibilityItem,
  SenaDemoVerificationCheck,
  SenaModel,
  SenaPilotPackageManifest,
  SenaPilotReadinessAudit,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./types";
import pilotPackageManifestJson from "../../public/sena-pilot/sena-pilot-package-manifest.json";

export type SenaDemoVerificationOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
  manualReviews?: Record<string, Partial<SenaDemoVerificationCheck["manualReview"]>>;
};

type VerificationDefinition = {
  id: string;
  label: string;
  anchor: string;
  readinessItemIds: string[];
  manualAction: string;
  expectedOutcome: string;
  requiredArtifacts: string[];
  extraEvidence?: (model: SenaModel, trace: SenaTemporalRuntimeTrace) => string[];
  extraPass?: (model: SenaModel, trace: SenaTemporalRuntimeTrace) => boolean;
};

const pilotPackageManifest = pilotPackageManifestJson as SenaPilotPackageManifest;

const verificationDefinitions: VerificationDefinition[] = [
  {
    id: "sample-import",
    label: "Sample or five-table import",
    anchor: "#workflow-data",
    readinessItemIds: ["data-contract", "model-json-export"],
    manualAction: "Load the lesson-study sample or upload all five SENA contract tables, confirm the package manifest assetIntegrity fingerprints are present, then confirm the Data contract audit is valid and project snapshot export is restorable.",
    expectedOutcome: "The Data Import panel shows valid five-table counts, manifest fingerprints for sample/template assets, and a project snapshot model JSON carrying graph nodes, typed edges, S/W/B/G, fusion, and temporal trace.",
    requiredArtifacts: ["sena-pilot-package-manifest.json", "sena-data-contract-audit.json", "sena-project-snapshot.json"],
    extraEvidence: (model) => [
      `people=${model.dataset.people.length}`,
      `interactions=${model.dataset.interactions.length}`,
      `utterances=${model.dataset.utterances.length}`,
      `codedSegments=${model.dataset.coded_segments.length}`,
      `codes=${model.dataset.codebook.length}`,
      `sampleAssets=${pilotPackageManifest.assets.sample.length}`,
      `templateAssets=${pilotPackageManifest.assets.templates.length}`,
      `assetIntegrity=${pilotPackageManifest.assetIntegrity.length}`,
      `assetIntegritySha256=${pilotPackageManifest.assetIntegrity.filter((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)).length}`,
      `handoff=${pilotPackageManifest.handoffChecks.find((check) => check.id === "pilot-asset-integrity")?.id ?? "missing"}`
    ],
    extraPass: (model) => model.dataset.people.length > 0 && model.dataset.codebook.length >= 2
  },
  {
    id: "weights-and-formula",
    label: "Weights and fusion formula",
    anchor: "#workflow-model",
    readinessItemIds: ["fusion-model", "model-json-export", "fusion-math"],
    manualAction: "Adjust alpha, beta, gamma, normalization, threshold, and layer visibility, then confirm the archived formula audit is present in the runtime bundle or review packet.",
    expectedOutcome: "The archived formula audit remains verified and S/W/B/G matrix dimensions still match the active model and restorable model JSON export.",
    requiredArtifacts: [
      "sena-jena-manifest.json",
      "sena-ena-report.json",
      "sena-jsna-manifest.json",
      "sena-sna-report.json",
      "sena-fusion-math-audit.json",
      "sena-runtime-consistency-audit.json",
      "sena-runtime-bundle.json"
    ],
    extraEvidence: (model) => [
      `alpha=${model.options.alpha}`,
      `beta=${model.options.beta}`,
      `gamma=${model.options.gamma}`,
      `normalization=${model.options.normalization}`
    ],
    extraPass: (model) => [model.options.alpha, model.options.beta, model.options.gamma].every(Number.isFinite)
  },
  {
    id: "layout-switching",
    label: "Fusion canvas layouts",
    anchor: "#workflow-canvas",
    readinessItemIds: ["fusion-model", "model-json-export"],
    manualAction: "Switch Explanatory, ENA Space, and Joint layouts; confirm nodes, edges, labels, and model JSON snapshot export remain visible and complete.",
    expectedOutcome: "All three layouts render a nonblank fusion canvas, with jENA projected coordinates available for ENA Space when computed and snapshot export preserving graph structure.",
    requiredArtifacts: ["sena-project-snapshot.json", "sena-visual-grammar.json", "sena-analysis-report.json"],
    extraEvidence: (model) => [
      "layouts=explanatory, ena-space, joint",
      `nodes=${model.nodes.length}`,
      `edges=${model.edges.length}`
    ],
    extraPass: (model) => model.nodes.length > 0 && model.edges.length > 0
  },
  {
    id: "evidence-inspection",
    label: "Evidence inspection",
    anchor: "#workflow-evidence",
    readinessItemIds: ["evidence-ledger"],
    manualAction: "Select at least one person node, one concept node, and one typed edge; inspect the original evidence snippets.",
    expectedOutcome: "Inspector and Evidence Ledger expose traceable utterance snippets before interpretation.",
    requiredArtifacts: ["sena-evidence-ledger.json", "sena-person-code-pair-g-report.json"],
    extraEvidence: (model) => [
      `edgeEvidence=${model.edges.reduce((total, edge) => total + edge.evidence.length, 0)}`,
      `pairEvidence=${model.pairReport.reduce((total, pair) => total + pair.evidence.length, 0)}`,
      `temporalEvidence=${model.temporal.windows.reduce((total, window) => total + window.evidence.length, 0)}`
    ],
    extraPass: (model) => model.edges.some((edge) => edge.evidence.length > 0)
  },
  {
    id: "temporal-runtime",
    label: "Temporal runtime trace",
    anchor: "#workflow-temporal",
    readinessItemIds: ["method-validation"],
    manualAction: "Switch Stage, Moving, and Turn temporal modes; review per-window jENA/jSNA/SENA runtime status and A_fusion checksums.",
    expectedOutcome: "Temporal Runtime Trace contains windows, per-window runtime statuses, and S/W/B/G/A_fusion matrix fingerprints for the selected source dataset.",
    requiredArtifacts: ["sena-temporal-runtime-trace.json", "sena-runtime-bundle.json"],
    extraEvidence: (model, trace) => [
      `modelWindows=${model.temporal.windows.length}`,
      `runtimeWindows=${trace.windows.length}`,
      `temporalMode=${trace.temporalSettings.mode}`,
      `matrixFingerprintWindows=${trace.windows.filter((entry) => entry.sena.matrixFingerprints.length === 5).length}/${trace.windows.length}`,
      `A_fusionChecksums=${trace.windows.filter((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum))).length}`
    ],
    extraPass: (_model, trace) => trace.windows.length > 0 &&
      trace.windows.every((entry) => entry.sena.matrixFingerprints.length === 5) &&
      trace.windows.every((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))
  },
  {
    id: "report-exports",
    label: "Report and review exports",
    anchor: "#workflow-report",
    readinessItemIds: ["report-completeness", "coding-reliability", "data-governance", "human-review"],
    manualAction: "Fill reviewer, interpretation, limitations, next actions, coding reliability evidence, and data-governance metadata; export readiness, metric provenance, coding-reliability gate, claim-readiness gate, review packet, JSON report, and Markdown report.",
    expectedOutcome: "Report, metric-provenance, coding-reliability, claim-readiness, and review-packet exports include parameters, matrices, runtime provenance, evidence, guardrails, audits, coding reliability gate, data-governance metadata, and human-review fields.",
    requiredArtifacts: [
      "sena-demo-verification.json",
      "sena-demo-verification-compatibility-audit.json",
      "sena-production-page-contract.json",
      "sena-development-plan.json",
      "sena-pilot-readiness-audit.json",
      "sena-metric-provenance.json",
      "sena-coding-reliability-gate.json",
      "sena-claim-readiness-gate.json",
      "sena-visual-grammar.json",
      "sena-review-packet.json",
      "sena-analysis-report.json",
      "sena-analysis-report.md"
    ],
    extraEvidence: (_model, trace) => [
      `runtimeTrace=${trace.schemaVersion}`,
      "metricProvenance=required",
      "codingReliability=required",
      "humanReview=required"
    ]
  }
];

function readinessEvidence(audit: SenaPilotReadinessAudit, readinessItemIds: string[]) {
  return readinessItemIds.flatMap((id) => {
    const item = audit.items.find((candidate) => candidate.id === id);
    return item ? [`${item.label}: ${item.status}`, ...item.evidence] : [`${id}: missing`];
  });
}

function readinessPass(audit: SenaPilotReadinessAudit, readinessItemIds: string[]) {
  return readinessItemIds.every((id) => audit.items.find((item) => item.id === id)?.status === "ready");
}

function manualReview(): SenaDemoVerificationCheck["manualReview"] {
  return {
    status: "pending",
    reviewer: "",
    verifiedAt: "",
    notes: ""
  };
}

function mergedManualReview(
  review: Partial<SenaDemoVerificationCheck["manualReview"]> | undefined
): SenaDemoVerificationCheck["manualReview"] {
  const fallback = manualReview();
  const status = review?.status ?? fallback.status;
  return {
    status,
    reviewer: review?.reviewer ?? fallback.reviewer,
    verifiedAt: status === "pending" ? "" : (review?.verifiedAt ?? fallback.verifiedAt),
    notes: review?.notes ?? fallback.notes
  };
}

function datasetCounts(model: SenaModel) {
  return {
    people: model.dataset.people.length,
    interactions: model.dataset.interactions.length,
    utterances: model.dataset.utterances.length,
    codedSegments: model.dataset.coded_segments.length,
    codes: model.dataset.codebook.length
  };
}

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

function compactCounts(counts: SenaDemoVerification["parameters"]["datasetCounts"]) {
  return `people=${counts.people}, interactions=${counts.interactions}, utterances=${counts.utterances}, codedSegments=${counts.codedSegments}, codes=${counts.codes}`;
}

function compatibilityItem(
  id: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string
): SenaDemoVerificationCompatibilityItem {
  return {
    id,
    label,
    status: passed ? "pass" : "review",
    expected,
    actual
  };
}

export function buildSenaDemoVerificationCompatibilityAudit(
  model: SenaModel,
  verification: SenaDemoVerification
): SenaDemoVerificationCompatibilityAudit {
  const currentCounts = datasetCounts(model);
  const countMatch = stableJson(currentCounts) === stableJson(verification.parameters.datasetCounts);
  const buildOptionsMatch = stableJson(model.options) === stableJson(verification.parameters.buildOptions);
  const items = [
    compatibilityItem(
      "dataset-counts",
      "Dataset counts",
      countMatch,
      compactCounts(currentCounts),
      compactCounts(verification.parameters.datasetCounts)
    ),
    compatibilityItem(
      "build-options",
      "Build options",
      buildOptionsMatch,
      stableJson(model.options),
      stableJson(verification.parameters.buildOptions)
    )
  ];
  const passed = items.filter((item) => item.status === "pass").length;
  const reviewNeeded = items.length - passed;

  return {
    schemaVersion: "sena-demo-verification-compatibility/v1",
    status: reviewNeeded === 0 ? "compatible" : "mismatch",
    passed,
    reviewNeeded,
    items,
    notes: [
      "Compatibility is checked before applying standalone demo verification manual-review records to the current workspace.",
      "A compatible checklist has the same dataset counts and build options as the active SENA model."
    ]
  };
}

export function buildSenaDemoVerification(model: SenaModel, options: SenaDemoVerificationOptions): SenaDemoVerification {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const checks = verificationDefinitions.map<SenaDemoVerificationCheck>((definition) => {
    const pass = readinessPass(options.pilotReadinessAudit, definition.readinessItemIds) &&
      (definition.extraPass?.(model, options.temporalRuntimeTrace) ?? true);
    return {
      id: definition.id,
      label: definition.label,
      anchor: definition.anchor,
      status: pass ? "pass" : "review",
      manualAction: definition.manualAction,
      expectedOutcome: definition.expectedOutcome,
      observedEvidence: [
        ...readinessEvidence(options.pilotReadinessAudit, definition.readinessItemIds),
        ...(definition.extraEvidence?.(model, options.temporalRuntimeTrace) ?? [])
      ],
      requiredArtifacts: definition.requiredArtifacts,
      manualReview: mergedManualReview(options.manualReviews?.[definition.id])
    };
  });
  const requiredArtifacts = Array.from(new Set(checks.flatMap((check) => check.requiredArtifacts)));
  const automatedPass = checks.filter((check) => check.status === "pass").length;
  const manualPending = checks.filter((check) => check.manualReview.status === "pending").length;
  const manualPassed = checks.filter((check) => check.manualReview.status === "passed").length;
  const manualFailed = checks.filter((check) => check.manualReview.status === "failed").length;

  return {
    schemaVersion: "sena-demo-verification/v1",
    title: options.title?.trim() || "SENA Demo Verification Checklist",
    generatedAt,
    workspaceRoute: "/workspace/sena",
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: {
      buildOptions: model.options,
      datasetCounts: datasetCounts(model),
      warnings: model.summary.warnings
    },
    summary: {
      totalChecks: checks.length,
      automatedPass,
      automatedReview: checks.length - automatedPass,
      manualPending,
      manualPassed,
      manualFailed,
      requiredArtifacts,
      pilotReadinessStatus: options.pilotReadinessAudit.status
    },
    checks,
    notes: [
      "This checklist records the manual verification path requested for the local SENA research pilot demo.",
      "Automated pass/review status comes from the current model, pilot-readiness audit, and temporal runtime trace.",
      "ManualReview fields default to pending and can record researcher verification after operating the UI."
    ]
  };
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, context: string) {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }
}

function assertNumber(value: unknown, context: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} must be a finite number.`);
  }
}

function assertStringArray(value: unknown, context: string) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${context} must be a string array.`);
  }
}

function assertManualReview(value: unknown, context: string) {
  const review = asRecord(value, context);
  if (review.status !== "pending" && review.status !== "passed" && review.status !== "failed") {
    throw new Error(`${context}.status is not supported.`);
  }
  assertString(review.reviewer, `${context}.reviewer`);
  assertString(review.verifiedAt, `${context}.verifiedAt`);
  assertString(review.notes, `${context}.notes`);
}

function assertDemoVerification(value: unknown): asserts value is SenaDemoVerification {
  const root = asRecord(value, "demo verification");
  if (root.schemaVersion !== "sena-demo-verification/v1") {
    throw new Error("JSON is not a SENA demo verification checklist.");
  }
  assertString(root.title, "demo verification.title");
  assertString(root.generatedAt, "demo verification.generatedAt");
  if (root.workspaceRoute !== "/workspace/sena") {
    throw new Error("demo verification.workspaceRoute is not supported.");
  }

  const summary = asRecord(root.summary, "demo verification.summary");
  for (const field of ["totalChecks", "automatedPass", "automatedReview", "manualPending", "manualPassed", "manualFailed"]) {
    assertNumber(summary[field], `demo verification.summary.${field}`);
  }
  assertStringArray(summary.requiredArtifacts, "demo verification.summary.requiredArtifacts");
  if (summary.pilotReadinessStatus !== "ready" && summary.pilotReadinessStatus !== "needs-review") {
    throw new Error("demo verification.summary.pilotReadinessStatus is not supported.");
  }

  if (!Array.isArray(root.checks)) {
    throw new Error("demo verification.checks must be an array.");
  }
  for (const [index, candidate] of root.checks.entries()) {
    const check = asRecord(candidate, `demo verification.checks.${index}`);
    assertString(check.id, `demo verification.checks.${index}.id`);
    assertString(check.label, `demo verification.checks.${index}.label`);
    assertString(check.anchor, `demo verification.checks.${index}.anchor`);
    if (check.status !== "pass" && check.status !== "review") {
      throw new Error(`demo verification.checks.${index}.status is not supported.`);
    }
    assertString(check.manualAction, `demo verification.checks.${index}.manualAction`);
    assertString(check.expectedOutcome, `demo verification.checks.${index}.expectedOutcome`);
    assertStringArray(check.observedEvidence, `demo verification.checks.${index}.observedEvidence`);
    assertStringArray(check.requiredArtifacts, `demo verification.checks.${index}.requiredArtifacts`);
    assertManualReview(check.manualReview, `demo verification.checks.${index}.manualReview`);
  }
  if (root.notes !== undefined) {
    assertStringArray(root.notes, "demo verification.notes");
  }
}

export function importSenaDemoVerification(source: string | unknown): SenaDemoVerification {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  assertDemoVerification(value);
  return value;
}

export function isSenaDemoVerification(value: unknown): value is SenaDemoVerification {
  try {
    assertDemoVerification(value);
    return true;
  } catch {
    return false;
  }
}
