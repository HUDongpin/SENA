import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { senaRuntimeProvenance } from "./runtime-constants";
import type {
  SenaDemoVerification,
  SenaDemoWalkthrough,
  SenaDeliveryCandidatePlan,
  SenaDevelopmentPlan,
  SenaDevelopmentPlanPhase,
  SenaModel,
  SenaNextStageDevelopmentPlan,
  SenaPilotReadinessAudit,
  SenaTemporalWindow
} from "./types";

export type SenaDevelopmentPlanOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  demoWalkthrough: SenaDemoWalkthrough;
  demoVerification: SenaDemoVerification;
};

const inScope = [
  "Local demo readiness for researchers and education pilot users.",
  "Five-table SENA data contract import, templates, lesson-study sample data, and asset-integrity fingerprints.",
  "Browser-side S/W/B/B_PC/B_CP/G construction with the explicit A_fusion block equation.",
  "Restorable model JSON snapshot export with graph nodes, typed edges, S/W/B/B_PC/B_CP/G, fusion matrix, and temporal trace.",
  "Local jENA and jSNA JavaScript runtime provenance, manifests, parity fixture evidence, and traceable exports.",
  "Evidence inspection, temporal runtime trace, report exports, and human-review handoff.",
  "Local enterprise-runtime vertical slice for auth, RBAC teams, server-side projects, imports, reliability, validation, publication exports, ops readiness, and redacted organization deployment handoff evidence.",
  "Institution production cutover acceptance evidence with native adapter certification, platform-owner bridge decisions, release-gate records, go-live rehearsal, and redacted operations handoff for database, object storage, pub/sub, audit/SIEM, backup/restore, alerting, email, IdP, and provisioning."
];

const outOfScope = [
  "External institution account operations, credential issuance, secret rotation ceremonies, and incident staffing performed outside this repository.",
  "Commercial billing, procurement, legal contracting, and pricing operations.",
  "Live R runtime dependency for the website; R-derived fixtures remain development-time validation evidence.",
  "Substantive causal inference, assessment claims, or publication claims without additional research validation."
];

const deliveryVerificationCommands = [
  "npm run lint",
  "npm test",
  "npm run sena:pilot:smoke",
  "npm run sena:pilot:browser-smoke -- http://127.0.0.1:3001/workspace/sena",
  "npm run sena:pilot:verify"
];

const browserAcceptanceScenarios = [
  "Import the lesson-study JSON sample, upload the five-table CSV sample, and re-upload the empty contract template.",
  "Switch Fusion Canvas layouts across Explanatory, ENA Space, and Joint while keeping the central plot visible.",
  "Change Temporal Trace mode across Stage, Moving, and Turn; verify per-window jENA/jSNA/SENA status and A_fusion checksums.",
  "Inspect a person node, concept node, typed edge, Evidence Ledger entry, and G attribution before exporting reports.",
  "Export and parse runtime bundle, review packet, jENA/jSNA manifests, metric provenance, report JSON, and report Markdown.",
  "Re-upload sena-project-snapshot.json and confirm dataset, weights, temporal window, and review fields restore."
];

const handoffPackage = [
  "lesson-study sample JSON and five-table CSV files",
  "blank five-table templates and empty JSON contract template",
  "sena-project-snapshot.json",
  "sena-runtime-bundle.json",
  "sena-review-packet.json",
  "sena-demo-verification.json",
  "sena-demo-walkthrough.json",
  "sena-development-plan.json"
];

const deliveryBoundaries = [
  "The website uses local JavaScript jENA and jSNA runtimes only; no live R runtime is introduced.",
  "All v1 export schemas remain backward compatible; delivery-plan fields are additive.",
  "Local enterprise-runtime bridges now cover auth, RBAC, server persistence, collaboration, import, reliability, validation, exports, ops readiness, signed alerting, and redacted organization deployment evidence.",
  "Native managed database/object-storage/pub-sub/audit-SIEM/backup-restore, institution IdP/SCIM, deployment escalation, institution email, and SaaS operations are represented by runnable adapter-certification, platform-decision acceptance, release-gate, and go-live rehearsal artifacts.",
  "Research claims remain exploratory until coding reliability, human review, ethics, and domain validation are complete."
];

const nextStageDataScenarios = [
  "Empty JSON contract and blank five-table templates.",
  "Bundled lesson-study sample dataset.",
  "Chinese and Cantonese lesson-study evidence preserved through import, report, Markdown, and snapshot export.",
  "Unknown person or code references remain visible as data-contract review items.",
  "Missing temporal fields keep temporal coverage guarded instead of silently producing unsupported claims.",
  "Incomplete human-review or coding-reliability fields keep claim readiness exploratory-only."
];

const nextStageRegressionRules = [
  "Preserve the six-step /workspace/sena workflow: Data Import, Model Builder, Fusion Canvas, Evidence, Temporal Trace, and Report.",
  "Preserve A1 Inner Solid Mesh visual grammar, Temporal Fusion Arc, G attribution, and S/W/B/B_PC/B_CP/G/A_fusion provenance.",
  "Preserve v1 artifact schemas with additive metadata only.",
  "Keep native managed database/object-storage/pub-sub/audit-SIEM/backup-restore adapters, institution IdP/SCIM approval, deployment escalation ownership, and SaaS backend requirements covered by machine-readable platform-decision acceptance and release-gate records."
];

const nextStagePublicInterfacePolicy = [
  "Keep /workspace/sena and /workspace/ena as stable pilot routes, with /api/ena/run retained as a session-protected compatibility endpoint.",
  "Keep sena-project-snapshot/v1, sena-runtime-bundle/v1, sena-review-packet/v1, sena-report/v1, and sena-claim-readiness-gate/v1 export schemas backward compatible.",
  "Do not introduce a live R runtime; local vendor/jena-js and vendor/sna-js remain the website runtimes, with R-derived fixtures used only as validation evidence.",
  "Do not make an external production-managed database a required pilot dependency; adapter certification and platform-owner acceptance records remain the institution cutover handoff path while sena-project-snapshot.json stays portable."
];

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function phaseEvidence(audit: SenaPilotReadinessAudit, ids: string[]) {
  return ids.flatMap((id) => {
    const item = audit.items.find((candidate) => candidate.id === id);
    return item ? [`${item.label}: ${item.status}`, ...item.evidence.slice(0, 3)] : [`${id}: missing`];
  });
}

function buildPhases(model: SenaModel, options: SenaDevelopmentPlanOptions): SenaDevelopmentPlanPhase[] {
  return [
    {
      id: "runtime-foundation",
      label: "Runtime foundation",
      status: "complete",
      scope: "Keep the local SENA model, jENA, and jSNA runtimes deterministic and exportable.",
      deliverables: [
        "S/W/B/B_PC/B_CP/G matrix construction",
        "A_fusion formula audit",
        "restorable model JSON snapshot",
        "jENA manifest",
        "jSNA manifest",
        "jENA/rENA parity evidence",
        "jSNA/R sna + igraph parity evidence",
        "runtime consistency audit"
      ],
      evidence: phaseEvidence(options.pilotReadinessAudit, ["fusion-model", "model-json-export", "fusion-math", "runtime-consistency", "runtime-artifacts"]),
      exitCriteria: [
        "Local runtime dependency specs are recorded as file:vendor packages.",
        "Fusion math audit is verified for the active model.",
        "Project snapshot export preserves graph nodes, typed edges, S/W/B/B_PC/B_CP/G, fusion, and temporal trace.",
        "jENA and jSNA manifests match the SENA model evidence chain.",
        "Runtime consistency audit records covered jENA/rENA and jSNA/R sna fixture parity."
      ]
    },
    {
      id: "local-research-pilot",
      label: "Local research pilot package",
      status: "active",
      scope: "Make /workspace/sena demo-ready for lesson-study and collaboration-analysis pilots.",
      deliverables: [
        "sample and template import package",
        "asset-integrity handoff check",
        "restorable model JSON export",
        "method protocol",
        "visual grammar artifact",
        "archived formula-audit handoff",
        "development plan",
        "demo walkthrough",
        "demo verification checklist",
        "review packet"
      ],
      evidence: [
        `people=${model.dataset.people.length}`,
        `codes=${model.dataset.codebook.length}`,
        `workflowSteps=${options.demoWalkthrough.summary.totalSteps}`,
        `verificationChecks=${options.demoVerification.summary.totalChecks}`,
        `pilotReadiness=${options.pilotReadinessAudit.status}`
      ],
      exitCriteria: [
        "Smoke test, full test suite, build, and browser walkthrough pass.",
        "Human-review fields are completed before sharing a report externally.",
        "Review packet contains report JSON, Markdown, restorable model JSON, runtimes, parity evidence, audits, method protocol, visual grammar, development plan, and pilot asset-integrity evidence."
      ]
    },
    {
      id: "research-validation",
      label: "Research validation",
      status: "deferred",
      scope: "Strengthen claims beyond local demo readiness through study design and external validation.",
      deliverables: [
        "coding reliability evidence",
        "jENA benchmark comparison",
        "SNA metric parity expansion beyond bundled R sna + igraph fixtures",
        "statistical uncertainty plan",
        "ethics and data-governance review"
      ],
      evidence: phaseEvidence(options.pilotReadinessAudit, ["method-validation", "coding-reliability", "evidence-ledger", "human-review"]),
      exitCriteria: [
        "Research team confirms coding scheme reliability and interpretation rules.",
        "Validation evidence supports the intended research claims.",
        "Limitations and next actions are reviewed by a domain expert."
      ]
    },
    {
      id: "production-platform",
      label: "Institution cutover acceptance evidence",
      status: "active",
      scope: "Run the enterprise backend readiness loop for native adapter certification, platform-owner acceptance, release-gate review, go-live rehearsal, and redacted handoff evidence without marking production cutover complete.",
      deliverables: [
        "native adapter certification dossier",
        "platform decision acceptance register",
        "managed database, object storage, pub/sub, audit/SIEM, backup, email, alerting, IdP, and provisioning bridge evidence",
        "SaaS operations readiness dossier",
        "release-gate review and verification evidence",
        "go-live rehearsal, rollback drill, and post-cutover monitor",
        "redacted organization deployment handoff package",
        "deployment hardening"
      ],
      evidence: [
        "localEnterpriseRuntime=auth|rbac|projects|imports|reliability|validation|exports|ops",
        "deploymentPackage=sena-enterprise-organization-deployment/v1",
        "signedBridges=database-sync|object-storage|collaboration-pubsub|backup|audit|alerts|notifications|email",
        "nativeAdapterCertification=sena-enterprise-native-adapter-certification/v1",
        "platformDecisionRegister=sena-enterprise-platform-decision-register/v1",
        "saasOperationsReadiness=sena-enterprise-saas-operations-readiness/v1",
        "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1"
      ],
      exitCriteria: [
        "Every production-blocking adapter is native-ready or has a platform-owner accepted bridge record.",
        "SaaS operations readiness is backed by operating-model approval and release-gate verification evidence.",
        "Go-live rehearsal links readiness, adapters, rollback, monitoring, and attestation artifacts before institution cutover."
      ]
    }
  ];
}

function buildDeliveryCandidatePlan(
  model: SenaModel,
  options: SenaDevelopmentPlanOptions,
  requiredArtifacts: string[]
): SenaDeliveryCandidatePlan {
  const automatedChecksPass = options.demoVerification.summary.automatedReview === 0 &&
    options.demoVerification.summary.automatedPass === options.demoVerification.summary.totalChecks;
  const pilotReady = options.pilotReadinessAudit.status === "ready";
  const hasCoreHandoff = [
    "sena-project-snapshot.json",
    "sena-runtime-bundle.json",
    "sena-review-packet.json",
    "sena-demo-verification.json",
    "sena-demo-walkthrough.json"
  ].every((artifact) => requiredArtifacts.includes(artifact));
  const status: SenaDeliveryCandidatePlan["status"] = pilotReady && automatedChecksPass && hasCoreHandoff
    ? "delivery-candidate"
    : "pre-candidate";
  const walkthroughById = new Map(options.demoWalkthrough.steps.map((step) => [step.id, step]));

  return {
    status,
    horizon: "4-week-local-research-pilot",
    priority: "pilot-delivery",
    successCriteria: [
      "/workspace/sena completes lesson-study import, S/W/B/B_PC/B_CP/G/A_fusion analysis, Temporal Trace, evidence inspection, report export, review-packet export, and snapshot re-upload.",
      "The full local pilot gate passes in a clean environment after stopping dev/start servers.",
      "Researchers receive a fixed handoff package with sample data, templates, restorable model JSON, runtime artifacts, review packet, verification checklist, and walkthrough script."
    ],
    weeklyPlan: [
      {
        week: 1,
        label: "Freeze pilot baseline",
        focus: "Confirm jENA/jSNA runtime provenance, current tests, known boundaries, and full pilot verification.",
        deliverables: [
          "full pilot verification record",
          "README delivery-candidate status",
          "development-plan runtime provenance",
          "clean local-JS runtime boundary"
        ],
        exitCriteria: [
          "npm run sena:pilot:verify passes after stopping local dev/start servers.",
          "README and development plan state that local enterprise bridges, native adapter certification, platform-owner acceptance, SaaS operations readiness, and go-live rehearsal are runnable production backend evidence."
        ]
      },
      {
        week: 2,
        label: "Polish researcher workbench",
        focus: "Tighten the webENA-style researcher workspace without changing core routes or export schemas.",
        deliverables: [
          "stable left rail, secondary panel, central Fusion Plot, right plots, and bottom Data View drawer",
          "clear empty/import/error states",
          "readable evidence inspector",
          "preserved A1 Inner Solid Mesh grammar"
        ],
        exitCriteria: [
          "Browser smoke confirms plot switching, zoom, maximize, temporal controls, and Data View drawer.",
          "Fusion Canvas still distinguishes S outer arcs, solid W mesh, B ribbons, and low-emphasis G signals."
        ]
      },
      {
        week: 3,
        label: "Strengthen research handoff gates",
        focus: "Make coding reliability, data governance, human review, and claim-readiness unavoidable in researcher exports.",
        deliverables: [
          "coding-reliability gate",
          "data-governance metadata gate",
          "human-review fields",
          "claim-readiness gate",
          "report guardrails",
          "reproducible jENA/jSNA/SENA artifact chain"
        ],
        exitCriteria: [
          "Review packet reproduces jENA report, jSNA report, metric provenance, runtime audit, fusion math audit, and report guardrails.",
          "Markdown and JSON reports state that A_fusion is not causal and Joint layout distance is not an inferential statistic."
        ]
      },
      {
        week: 4,
        label: "Package delivery candidate",
        focus: "Create the fixed local pilot handoff package and bilingual walkthrough script.",
        deliverables: [
          "fixed pilot handoff package",
          "Chinese/English walkthrough script",
          "delivery-candidate development plan",
          "final verification pass"
        ],
        exitCriteria: [
          "All verification commands pass.",
          "Reviewers can follow the script from data import through Fusion Canvas, Temporal Trace, evidence inspection, and review-packet export."
        ]
      }
    ],
    verificationCommands: deliveryVerificationCommands,
    browserAcceptanceScenarios,
    handoffPackage,
    demoScript: [
      {
        step: 1,
        label: "Import data",
        zh: "导入 lesson-study 样例或五表 CSV，确认 Data contract audit 有效。",
        en: "Import the lesson-study sample or five CSV tables and confirm the Data contract audit is valid.",
        anchor: walkthroughById.get("data-import")?.anchor ?? "#workflow-data",
        exportArtifacts: walkthroughById.get("data-import")?.exportArtifacts ?? ["sena-project-snapshot.json"]
      },
      {
        step: 2,
        label: "Review Fusion Canvas",
        zh: "查看 Fusion Canvas，切换 Explanatory、ENA Space、Joint，并保留 A1 图层语法。",
        en: "Review Fusion Canvas, switch Explanatory, ENA Space, and Joint layouts, and keep the A1 layer grammar visible.",
        anchor: walkthroughById.get("fusion-canvas")?.anchor ?? "#workflow-canvas",
        exportArtifacts: walkthroughById.get("fusion-canvas")?.exportArtifacts ?? ["sena-visual-grammar.json"]
      },
      {
        step: 3,
        label: "Inspect Temporal Trace",
        zh: "切换 Stage、Moving、Turn 时序模式，检查每个窗口的 jENA/jSNA/SENA 状态和 A_fusion checksum。",
        en: "Switch Stage, Moving, and Turn temporal modes, then inspect per-window jENA/jSNA/SENA status and A_fusion checksums.",
        anchor: walkthroughById.get("temporal-trace")?.anchor ?? "#workflow-temporal",
        exportArtifacts: walkthroughById.get("temporal-trace")?.exportArtifacts ?? ["sena-temporal-runtime-trace.json"]
      },
      {
        step: 4,
        label: "Inspect evidence",
        zh: "选择节点、边和 G 贡献，回看原始 utterance evidence 后再写解释。",
        en: "Select nodes, edges, and G contributions, then inspect original utterance evidence before writing interpretations.",
        anchor: walkthroughById.get("evidence")?.anchor ?? "#workflow-evidence",
        exportArtifacts: walkthroughById.get("evidence")?.exportArtifacts ?? ["sena-evidence-ledger.json"]
      },
      {
        step: 5,
        label: "Export review packet",
        zh: "填写 human review 与 coding reliability，导出 review packet、runtime bundle、report JSON/Markdown。",
        en: "Fill human review and coding reliability fields, then export the review packet, runtime bundle, and report JSON/Markdown.",
        anchor: walkthroughById.get("report")?.anchor ?? "#workflow-report",
        exportArtifacts: [
          "sena-review-packet.json",
          "sena-runtime-bundle.json",
          "sena-analysis-report.json",
          "sena-analysis-report.md"
        ]
      }
    ],
    boundaries: deliveryBoundaries
  };
}

function buildNextStageDevelopmentPlan(
  generatedAt: string,
  deliveryCandidate: SenaDeliveryCandidatePlan
): SenaNextStageDevelopmentPlan {
  const baselineVerified = deliveryCandidate.status === "delivery-candidate" &&
    deliveryCandidate.verificationCommands.includes("npm run sena:pilot:verify");

  return {
    status: baselineVerified ? "baseline-verified" : "verification-required",
    horizon: "post-delivery-candidate",
    priority: "research-validation-before-platform",
    baseline: {
      command: "npm run sena:pilot:verify",
      expectedResult: "Full local pilot gate passes, including Vitest, Next production build, production server smoke, visual guards, and browser interaction smoke.",
      recordedAt: generatedAt,
      evidence: [
        `deliveryCandidate=${deliveryCandidate.status}`,
        "releaseGate=npm run sena:pilot:verify",
        "currentBaseline=local research pilot delivery candidate, not production SaaS"
      ]
    },
    phases: [
      {
        id: "pilot-handoff-freeze",
        label: "Pilot Handoff Freeze",
        status: "active",
        goal: "Freeze the verified local research pilot package before external researcher walkthroughs.",
        deliverables: [
          "fixed six-step /workspace/sena workflow",
          "sample/templates package",
          "sena-project-snapshot.json",
          "sena-runtime-bundle.json",
          "sena-review-packet.json",
          "walkthrough, verification, and development-plan exports"
        ],
        acceptanceCriteria: [
          "npm run sena:pilot:verify passes immediately before handoff.",
          "Review packet includes runtime bundle, report JSON/Markdown, method protocol, visual grammar, parity evidence, and asset-integrity checks.",
          "No v1 artifact schema is changed except by additive fields."
        ]
      },
      {
        id: "researcher-walkthrough",
        label: "Researcher Walkthrough",
        status: "next",
        goal: "Run complete walkthroughs with the lesson-study sample and one or two real research datasets.",
        deliverables: [
          "researcher observation notes",
          "lesson-study walkthrough record",
          "real-dataset import notes",
          "evidence-inspection and G-contribution interpretation notes",
          "review-packet export usability notes"
        ],
        acceptanceCriteria: [
          "Researchers can explain Data Import, Temporal Fusion Arc, G contribution, Evidence Inspector, and review packet export without developer intervention.",
          "All publication-facing or instructional claims remain exploratory-only until human review and coding reliability are complete.",
          "Confusing terminology, missing evidence, or report blockers are captured as research-validation backlog items."
        ]
      },
      {
        id: "research-validation",
        label: "Research Validation",
        status: "deferred",
        goal: "Strengthen claims beyond local demo readiness through parity, reliability, uncertainty, and domain review evidence.",
        deliverables: [
          "real research dataset validation notes",
          "expanded jENA/rENA parity evidence",
          "expanded jSNA/R sna parity evidence",
          "coding reliability evidence",
          "uncertainty and stability notes",
          "domain expert review notes",
          "reproducibility artifact guidance for papers and project reports"
        ],
        acceptanceCriteria: [
          "Report and review packet are accepted as reproducibility artifacts by the research team.",
          "Coding reliability, human review, evidence ledger, method validation, and runtime alignment gates are ready for any research claim.",
          "Real research datasets, uncertainty/stability checks, and domain expert review are complete before any stronger-than-exploratory claim is made.",
          "Limitations clearly separate exploratory network evidence from causal, assessment, or publication claims."
        ],
        blockedUntil: [
          "Pilot handoff package is frozen.",
          "At least one researcher walkthrough has been completed and reviewed.",
          "One or two real research datasets have completed import, evidence inspection, and review-packet export.",
          "Coding reliability, uncertainty/stability, and domain expert review evidence are attached."
        ]
      },
      {
        id: "platform-decision-gate",
        label: "Production Platform Acceptance",
        status: "gate",
        goal: "Record whether each production backend adapter is accepted as a signed bridge or replaced with an institution-native service before cutover.",
        deliverables: [
          "target-user decision",
          "data-governance requirements",
          "maintenance ownership plan",
          "deployment escalation ownership requirements",
          "native managed persistence, institution SCIM/IdP bridge ownership, notification provider, and SaaS operations acceptance records"
        ],
        acceptanceCriteria: [
          "Pilot workflows are validated with target users before institution cutover.",
          "Data governance and maintenance responsibility are approved.",
          "Native managed database/object-storage/pub-sub/audit-SIEM/backup-restore adapters, institution SCIM/IdP bridge ownership, deployment escalation ownership, institution email provider, and SaaS backend each have accepted bridge, native-ready, or blocked decision evidence."
        ],
        blockedUntil: [
          "Research validation scope is agreed.",
          "Real user and governance requirements are documented."
        ]
      }
    ],
    releaseGate: {
      command: "npm run sena:pilot:verify",
      browserAcceptanceScenarios,
      dataScenarios: nextStageDataScenarios,
      regressionRules: nextStageRegressionRules
    },
    publicInterfacePolicy: nextStagePublicInterfacePolicy,
    assumptions: [
      "Near-term priority remains research, education, and instructor-facing learning analytics.",
      "Generalized SaaS operations, native managed database/object-storage/pub-sub/audit-SIEM/backup-restore adapters, institution SCIM/IdP approval, production deployment escalation ownership, and institution-owned email-provider operations are represented by acceptance, certification, and release-gate artifacts in the enterprise backend.",
      "The current verified local pilot is the baseline for next-stage work.",
      "Research claims require human review, coding-reliability evidence, real-data walkthrough evidence, uncertainty/stability checks, and domain review; otherwise reports remain exploratory-only."
    ]
  };
}

export function buildSenaDevelopmentPlan(model: SenaModel, options: SenaDevelopmentPlanOptions): SenaDevelopmentPlan {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const readyItems = options.pilotReadinessAudit.items.filter((item) => item.status === "ready").map((item) => item.id);
  const reviewItems = options.pilotReadinessAudit.items.filter((item) => item.status === "review").map((item) => item.id);
  const requiredArtifacts = uniqueStrings([
    "sena-pilot-package-manifest.json",
    "sena-development-plan.json",
    "sena-method-protocol.json",
    "sena-runtime-bundle.json",
    "sena-review-packet.json",
    "sena-project-snapshot.json",
    "sena-demo-walkthrough.json",
    "sena-demo-verification.json",
    "sena-demo-verification-compatibility-audit.json",
    "sena-production-page-contract.json",
    ...options.demoWalkthrough.steps.flatMap((step) => step.exportArtifacts),
    ...options.demoVerification.summary.requiredArtifacts
  ]);
  const deliveryCandidate = buildDeliveryCandidatePlan(model, options, requiredArtifacts);
  const nextStage = buildNextStageDevelopmentPlan(generatedAt, deliveryCandidate);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.developmentPlan,
    title: options.title?.trim() || "SENA Development Plan",
    generatedAt,
    workspaceRoute: "/workspace/sena",
    milestone: "local-research-pilot",
    audience: ["researchers", "education pilot users", "lesson-study teams"],
    analysisWindow: options.activeTemporalWindow ?? null,
    runtimeIntegration: {
      sena: senaRuntimeProvenance.senaModel,
      jena: senaRuntimeProvenance.enaRuntime,
      jsna: senaRuntimeProvenance.snaRuntime
    },
    runtimeParityEvidence: senaRuntimeProvenance.parityEvidence,
    scope: {
      inScope,
      outOfScope
    },
    workflowAnchors: options.demoWalkthrough.steps.map((step) => ({
      id: step.id,
      label: step.label,
      anchor: step.anchor,
      status: step.status,
      exportArtifacts: step.exportArtifacts
    })),
    currentGate: {
      pilotReadinessStatus: options.pilotReadinessAudit.status,
      automatedVerification: {
        totalChecks: options.demoVerification.summary.totalChecks,
        passed: options.demoVerification.summary.automatedPass,
        review: options.demoVerification.summary.automatedReview,
        manualPending: options.demoVerification.summary.manualPending,
        manualPassed: options.demoVerification.summary.manualPassed,
        manualFailed: options.demoVerification.summary.manualFailed
      },
      readyItems,
      reviewItems
    },
    phases: buildPhases(model, options),
    deliveryCandidate,
    nextStage,
    requiredArtifacts,
    nextDecisions: [
      "Freeze the verified local pilot handoff package before researcher walkthroughs.",
      "Run the lesson-study sample and one or two real research datasets through the full walkthrough before expanding platform scope.",
      "Enter research validation only after walkthrough evidence identifies the needed parity, reliability, uncertainty, and domain-review work.",
      "Use the delivery-candidate checklist to decide whether the local pilot package is ready for researcher walkthroughs.",
      "Run the full pilot verification gate after stopping local dev/start servers before external handoff.",
      "Decide which additional validation evidence is needed before making publication-facing claims.",
      "Use the redacted organization deployment package, native adapter certification, SaaS operations readiness, release gate, and go-live rehearsal before institution cutover."
    ],
    notes: [
      "This plan is generated from the active SENA model, readiness audit, walkthrough, and verification checklist.",
      "It records local pilot scope plus production SaaS backend readiness evidence; external institution operations still require platform-owner execution.",
      `Delivery candidate status: ${deliveryCandidate.status}.`
    ]
  };
}
