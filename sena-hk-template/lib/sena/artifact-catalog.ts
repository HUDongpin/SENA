import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaPilotPackageManifest, SenaReviewPacket, SenaReviewPacketArtifact } from "./types";

type SenaReviewPacketContentKey = keyof SenaReviewPacket["contents"] | "self";

export type SenaCrossArtifactCatalogEntry = SenaReviewPacketArtifact & {
  reviewPacketContentKey: SenaReviewPacketContentKey;
  surfaces: {
    reviewPacketManifest: boolean;
    reviewPacketContents: boolean;
    runtimeBundleArtifactEvidence: boolean;
    pilotPackageManifestExport: boolean;
  };
  checkOwners: {
    reviewPacketAudit: "lib/sena/review-packet.ts";
    runtimeBundleArtifactEvidence: "lib/sena/runtime-bundle.ts";
    pilotPackageManifest: "public/sena-pilot/sena-pilot-package-manifest.json";
  };
};

export type SenaWorkflowArtifactCatalogEntry = SenaReviewPacketArtifact & {
  closeoutContentKey: "run" | "stepReceipts" | "approvals" | "closeoutCommitment" | "self";
  surfaces: {
    workflowCloseout: boolean;
    researchReviewPacket: boolean;
    engineeringEvidenceIndex: boolean;
  };
  checkOwner: "lib/sena/workflow/closeout.ts";
};

const workflowArtifacts: SenaWorkflowArtifactCatalogEntry[] = [
  {
    filename: "sena-workflow-run.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    description: "Authoritative EvidenceFlow run binding, state, evidence boundary, and supersession record.",
    closeoutContentKey: "run",
    surfaces: {
      workflowCloseout: true,
      researchReviewPacket: false,
      engineeringEvidenceIndex: false
    },
    checkOwner: "lib/sena/workflow/closeout.ts"
  },
  {
    filename: "sena-workflow-step-receipts.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowStepReceipt,
    description: "Ordered immutable step receipts with predecessor bindings and SHA-256 audit-chain heads.",
    closeoutContentKey: "stepReceipts",
    surfaces: {
      workflowCloseout: true,
      researchReviewPacket: false,
      engineeringEvidenceIndex: false
    },
    checkOwner: "lib/sena/workflow/closeout.ts"
  },
  {
    filename: "sena-workflow-approvals.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowApproval,
    description: "Digest-bound human approval and rejection receipts for EvidenceFlow interrupts.",
    closeoutContentKey: "approvals",
    surfaces: {
      workflowCloseout: true,
      researchReviewPacket: false,
      engineeringEvidenceIndex: false
    },
    checkOwner: "lib/sena/workflow/closeout.ts"
  },
  {
    filename: "sena-workflow-closeout-commitment.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseoutCommitment,
    description: "On-graph commitment sealing command attempts/errors, pre-closeout receipts, approvals, artifacts, and the explicit self-reference boundary.",
    closeoutContentKey: "closeoutCommitment",
    surfaces: {
      workflowCloseout: true,
      researchReviewPacket: true,
      engineeringEvidenceIndex: true
    },
    checkOwner: "lib/sena/workflow/closeout.ts"
  },
  {
    filename: "sena-workflow-closeout.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowCloseout,
    description: "Verified EvidenceFlow closeout binding the run, receipts, approvals, artifacts, retries, failures, and evidence boundary.",
    closeoutContentKey: "self",
    surfaces: {
      workflowCloseout: true,
      researchReviewPacket: true,
      engineeringEvidenceIndex: true
    },
    checkOwner: "lib/sena/workflow/closeout.ts"
  }
];

const reviewPacketArtifacts: SenaReviewPacketArtifact[] = [
  {
    filename: "sena-review-packet.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.reviewPacket,
    description: "Single-file reviewer handoff containing report Markdown, report JSON, runtime bundle, audits, evidence, walkthrough, and verification checklist."
  },
  {
    filename: "sena-analysis-report.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.report,
    description: "Structured SENA report with parameters, matrices, runtime manifests, evidence, validation, guardrails, claim-readiness gate, and human-review fields."
  },
  {
    filename: "sena-analysis-report.md",
    schemaVersion: "markdown",
    description: "Researcher-readable Markdown report generated from the same structured report object."
  },
  {
    filename: "sena-runtime-bundle.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.runtimeBundle,
    description: "jENA, jSNA, SENA matrix, temporal, validation, audit, and evidence runtime bundle."
  },
  {
    filename: "sena-project-snapshot.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.projectSnapshot,
    description: "Restorable local workspace snapshot with source data, active analysis scope, build options, report, and manual-review state."
  },
  {
    filename: "sena-jena-manifest.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.enaManifest,
    description: "Standalone jENA manifest for ENA projection, connection-count, and line-weight provenance."
  },
  {
    filename: "sena-ena-report.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.enaReport,
    description: "Standalone jENA epistemic report with ENA-space outputs, W-matrix handoff audit, and interpretation guardrails."
  },
  {
    filename: "sena-jsna-manifest.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.jsnaManifest,
    description: "Standalone jSNA/sna.js manifest for social-network runtime provenance."
  },
  {
    filename: "sena-sna-report.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.snaReport,
    description: "Standalone social-network report with SNA metric provenance, manifest, social report, and S matrix."
  },
  {
    filename: "sena-metric-provenance.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.metricProvenance,
    description: "Standalone metric provenance artifact with metric source, parity status, interpretation limits, and social metric snapshot."
  },
  {
    filename: "sena-person-code-pair-g-report.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.personCodePairGReport,
    description: "Standalone person-code-pair G contribution report with supporting S/W/B matrices and interpretation guardrails."
  },
  {
    filename: "sena-pilot-package-manifest.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.pilotPackageManifest,
    description: "Machine-readable pilot package manifest with sample assets, templates, asset-integrity fingerprints, runtime roles, and expected export artifacts."
  },
  {
    filename: "sena-evidence-ledger.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.evidenceLedger,
    description: "Traceable utterance and edge/pair/window evidence ledger for human interpretation review."
  },
  {
    filename: "sena-temporal-runtime-trace.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.temporalRuntimeTrace,
    description: "Per-window jENA/jSNA/SENA runtime status and temporal settings."
  },
  {
    filename: "sena-data-contract-audit.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.dataContractAudit,
    description: "Five-table SENA data-contract validation and row-count evidence."
  },
  {
    filename: "sena-runtime-consistency-audit.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.runtimeConsistency,
    description: "Standalone local jENA/jSNA runtime consistency audit, including jENA concept-pair handoff and jSNA S-matrix checks."
  },
  {
    filename: "sena-fusion-math-audit.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.fusionMathAudit,
    description: "S/W/B/G block construction and A_fusion formula audit."
  },
  {
    filename: "sena-method-protocol.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.methodProtocol,
    description: "Structured SENA mathematical and runtime method protocol for researchers."
  },
  {
    filename: "sena-visual-grammar.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.visualGrammar,
    description: "Standalone visual grammar artifact for A1 Fusion Canvas and Temporal Fusion Arc encodings."
  },
  {
    filename: "sena-development-plan.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.developmentPlan,
    description: "Local research-pilot scope, development phases, deferred production work, and verification gates."
  },
  {
    filename: "sena-pilot-readiness-audit.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.pilotReadiness,
    description: "Local pilot readiness checks across data, formula, runtimes, evidence, validation, and review."
  },
  {
    filename: "sena-coding-reliability-gate.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityGate,
    description: "Standalone coding-reliability gate documenting coding scheme, coder count, agreement evidence, adjudication, and limitations."
  },
  {
    filename: "sena-claim-readiness-gate.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.claimReadinessGate,
    description: "Standalone claim-readiness gate showing whether SENA outputs are research-claim-ready or exploratory-only."
  },
  {
    filename: "sena-demo-walkthrough.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.demoWalkthrough,
    description: "Six-step local demo walkthrough aligned to the workspace anchors."
  },
  {
    filename: "sena-demo-verification.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.demoVerification,
    description: "Manual verification checklist with automated evidence for the local research pilot."
  },
  {
    filename: "sena-demo-verification-compatibility-audit.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.demoVerificationCompatibility,
    description: "Compatibility gate evidence for reapplying demo verification manual-review records to the active model."
  },
  {
    filename: "sena-production-page-contract.json",
    schemaVersion: SENA_SCHEMA_VERSIONS.productionPageContract,
    description: "Production page smoke-test contract for required local demo affordances and visual grammar guards."
  }
];

const reviewPacketContentKeyByFilename: Record<string, SenaReviewPacketContentKey> = {
  "sena-review-packet.json": "self",
  "sena-analysis-report.json": "reportJson",
  "sena-analysis-report.md": "reportMarkdown",
  "sena-runtime-bundle.json": "runtimeBundle",
  "sena-project-snapshot.json": "projectSnapshot",
  "sena-jena-manifest.json": "jenaManifest",
  "sena-ena-report.json": "enaReportArtifact",
  "sena-jsna-manifest.json": "jsnaManifest",
  "sena-sna-report.json": "snaReportArtifact",
  "sena-metric-provenance.json": "metricProvenanceArtifact",
  "sena-person-code-pair-g-report.json": "pairContributionReportArtifact",
  "sena-pilot-package-manifest.json": "pilotPackageManifest",
  "sena-evidence-ledger.json": "evidenceLedger",
  "sena-temporal-runtime-trace.json": "temporalRuntimeTrace",
  "sena-data-contract-audit.json": "dataContractAudit",
  "sena-runtime-consistency-audit.json": "runtimeConsistencyAudit",
  "sena-fusion-math-audit.json": "fusionMathAudit",
  "sena-method-protocol.json": "methodProtocol",
  "sena-visual-grammar.json": "visualGrammarArtifact",
  "sena-development-plan.json": "developmentPlan",
  "sena-pilot-readiness-audit.json": "pilotReadinessAudit",
  "sena-coding-reliability-gate.json": "codingReliabilityGate",
  "sena-claim-readiness-gate.json": "claimReadinessGate",
  "sena-demo-walkthrough.json": "demoWalkthrough",
  "sena-demo-verification.json": "demoVerification",
  "sena-demo-verification-compatibility-audit.json": "demoVerificationCompatibilityAudit",
  "sena-production-page-contract.json": "productionPageContract"
};

const runtimeBundleArtifactEvidenceFilenames = new Set([
  "sena-jena-manifest.json",
  "sena-ena-report.json",
  "sena-jsna-manifest.json",
  "sena-sna-report.json",
  "sena-metric-provenance.json",
  "sena-person-code-pair-g-report.json",
  "sena-runtime-consistency-audit.json",
  "sena-pilot-package-manifest.json",
  "sena-coding-reliability-gate.json",
  "sena-runtime-bundle.json"
]);

const artifactCheckOwners = {
  reviewPacketAudit: "lib/sena/review-packet.ts",
  runtimeBundleArtifactEvidence: "lib/sena/runtime-bundle.ts",
  pilotPackageManifest: "public/sena-pilot/sena-pilot-package-manifest.json"
} as const;

function buildCrossArtifactCatalogEntry(artifact: SenaReviewPacketArtifact): SenaCrossArtifactCatalogEntry {
  const reviewPacketContentKey = reviewPacketContentKeyByFilename[artifact.filename];
  if (!reviewPacketContentKey) {
    throw new Error(`Missing review-packet content key for ${artifact.filename}.`);
  }

  return {
    ...artifact,
    reviewPacketContentKey,
    surfaces: {
      reviewPacketManifest: true,
      reviewPacketContents: true,
      runtimeBundleArtifactEvidence: runtimeBundleArtifactEvidenceFilenames.has(artifact.filename),
      pilotPackageManifestExport: true
    },
    checkOwners: {
      ...artifactCheckOwners
    }
  };
}

const crossArtifactCatalog = reviewPacketArtifacts.map(buildCrossArtifactCatalogEntry);

function cloneCrossArtifactCatalogEntry(entry: SenaCrossArtifactCatalogEntry): SenaCrossArtifactCatalogEntry {
  return {
    ...entry,
    surfaces: {
      ...entry.surfaces
    },
    checkOwners: {
      ...entry.checkOwners
    }
  };
}

export function listSenaCrossArtifactCatalog(): SenaCrossArtifactCatalogEntry[] {
  return crossArtifactCatalog.map(cloneCrossArtifactCatalogEntry);
}

export function getSenaCrossArtifactCatalogEntry(filename: string) {
  const entry = crossArtifactCatalog.find((artifact) => artifact.filename === filename);
  return entry ? cloneCrossArtifactCatalogEntry(entry) : undefined;
}

export function listSenaReviewPacketArtifacts(): SenaReviewPacketArtifact[] {
  return crossArtifactCatalog.map(({ filename, schemaVersion, description }) => ({
    filename,
    schemaVersion,
    description
  }));
}

export function listSenaReviewPacketFilenames() {
  return crossArtifactCatalog.map((artifact) => artifact.filename);
}

export function projectSenaPilotPackageArtifactCatalog(): Pick<SenaPilotPackageManifest, "exportArtifacts" | "exportArtifactSchemas"> & {
  runtimeArtifactEvidence: string[];
} {
  const pilotPackageArtifacts = crossArtifactCatalog.filter((artifact) => artifact.surfaces.pilotPackageManifestExport);
  return {
    exportArtifacts: pilotPackageArtifacts.map((artifact) => artifact.filename),
    exportArtifactSchemas: Object.fromEntries(
      pilotPackageArtifacts.map((artifact) => [artifact.filename, artifact.schemaVersion])
    ),
    runtimeArtifactEvidence: pilotPackageArtifacts
      .filter((artifact) => artifact.surfaces.runtimeBundleArtifactEvidence)
      .map((artifact) => artifact.filename)
  };
}

export function getSenaReviewPacketContentKey(filename: string) {
  return reviewPacketContentKeyByFilename[filename];
}

function cloneWorkflowArtifactCatalogEntry(
  entry: SenaWorkflowArtifactCatalogEntry
): SenaWorkflowArtifactCatalogEntry {
  return {
    ...entry,
    surfaces: {
      ...entry.surfaces
    }
  };
}

export function listSenaWorkflowArtifacts(): SenaWorkflowArtifactCatalogEntry[] {
  return workflowArtifacts.map(cloneWorkflowArtifactCatalogEntry);
}

export function getSenaWorkflowArtifactCatalogEntry(filename: string) {
  const entry = workflowArtifacts.find((artifact) => artifact.filename === filename);
  return entry ? cloneWorkflowArtifactCatalogEntry(entry) : undefined;
}
