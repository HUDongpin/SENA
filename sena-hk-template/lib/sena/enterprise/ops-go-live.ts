import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type {
  SenaEnterpriseIdentityProductionEvidence
} from "./identity-production-evidence";
import {
  formatIdentityReceiptArchiveMissingInputCounts,
  latestReleaseGateIdentityReceiptArchiveEvidence
} from "./identity-receipt-archive";
import {
  getEnterpriseOpsAlerts,
  getEnterpriseOpsAlertsWithPostgresEvidence,
  type SenaEnterpriseOpsAlerts
} from "./ops-alerts";
import {
  getEnterpriseOrganizationDeploymentPackage,
  getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence,
  type SenaEnterpriseOrganizationDeploymentPackage
} from "./ops-deployment";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseDeploymentReadinessWithPostgresEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import type {
  SenaEnterpriseSaasOperationsReadiness
} from "./ops-saas-operations";
import {
  getEnterpriseGovernanceStatus,
  getEnterpriseGovernanceStatusWithPostgresEvidence,
  type SenaEnterpriseGovernanceStatus
} from "./ops-governance";
import {
  postCutoverObservationList,
  type SenaEnterprisePostCutoverObservationList
} from "./ops-post-cutover-observations";
import type {
  SenaEnterpriseReleaseGateDecision,
  SenaEnterpriseReleaseGateReview,
  SenaEnterpriseReleaseVerificationEvidence
} from "./ops-release-gate";
import {
  getEnterpriseOpsStatus,
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus
} from "./ops-status";
import {
  readEnterpriseDb,
  readEnterpriseState,
  type SenaEnterpriseDb
} from "./state";

function now() {
  return new Date().toISOString();
}

export type SenaEnterpriseReleaseGateDraft = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft;
  generatedAt: string;
  decision: SenaEnterpriseReleaseGateDecision;
  environment: string;
  releaseVersion: string;
  verificationCommand: string;
  verificationEvidence: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence;
    command: string;
    status: SenaEnterpriseReleaseVerificationEvidence["status"];
    summary: string;
  };
  notes: string;
  requiredBeforeSubmit: string[];
  evidence: string[];
};

export type SenaEnterpriseGoLiveRollbackDrill = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveRollbackDrill;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  summary: {
    goLiveStatus: "ready" | "review" | "blocked";
    backupReady: boolean;
    restoreRehearsed: boolean;
    alertingReady: boolean;
    releaseGateReady: boolean;
    blockers: string[];
  };
  requiredEvidence: string[];
  runbook: {
    ownerEvidence: string[];
    steps: Array<{
      id: string;
      label: string;
      owner: string;
      command?: string;
      evidence: string[];
    }>;
  };
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseGoLiveMonitor = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveMonitor;
  generatedAt: string;
  status: "ready" | "watch" | "blocked";
  observationWindow: {
    recommendedMinutes: number;
    exitCriteria: string[];
  };
  summary: {
    goLiveStatus: "ready" | "review" | "blocked";
    opsStatus: SenaEnterpriseOpsStatus["status"];
    alertsStatus: SenaEnterpriseOpsAlerts["status"];
    criticalAlerts: number;
    warningAlerts: number;
    releaseGateReady: boolean;
    rollbackReady: boolean;
    postCutoverObservationReady: boolean;
    blockers: string[];
  };
  requiredEvidence: string[];
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "watch" | "blocked";
    evidence: string[];
    nextAction: string;
  }>;
  latestObservation: SenaEnterprisePostCutoverObservationList;
  evidence: string[];
  nextActions: string[];
};

export type SenaEnterpriseGoLiveRehearsal = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal;
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  export: {
    api: "/api/sena/ops/go-live-rehearsal";
    filename: "sena-enterprise-go-live-rehearsal.json";
  };
  rehearsal: {
    deploymentPackage: "sena-enterprise-organization-deployment/v1";
    deploymentReadiness: "sena-enterprise-deployment-readiness/v1";
    governance: "sena-enterprise-governance/v1";
    platformDecisionRegister: "sena-enterprise-platform-decision-register/v1";
    nativeAdapterCertification: "sena-enterprise-native-adapter-certification/v1";
    saasOperationsReadiness: "sena-enterprise-saas-operations-readiness/v1";
    releaseGate: "sena-enterprise-release-gate-reviews/v1";
  };
  summary: {
    blockingItems: number;
    advisoryItems: number;
    governanceReviewItems: number;
    openPlatformDecisions: number;
    acceptedPlatformDecisions: number;
    nativeAdapterProductionBlocking: number;
    saasOperationsStatus: SenaEnterpriseSaasOperationsReadiness["status"];
    releaseGateReviews: number;
    latestReleaseGateStatus?: SenaEnterpriseReleaseGateDecision;
    latestReleaseGateVerificationStatus?: SenaEnterpriseReleaseVerificationEvidence["status"];
    blockers: string[];
  };
  requiredEvidence: string[];
  verificationCommands: string[];
  identityProductionHandoff: SenaEnterpriseIdentityProductionEvidence;
  releaseGateDraft: SenaEnterpriseReleaseGateDraft;
  rollbackDrill: SenaEnterpriseGoLiveRollbackDrill;
  postCutoverMonitor: SenaEnterpriseGoLiveMonitor;
  evidence: string[];
  nextActions: string[];
};

function buildEnterpriseReleaseGateDraft(input: {
  generatedAt: string;
  status: SenaEnterpriseGoLiveRehearsal["status"];
  blockers: string[];
  verificationCommands: string[];
  latestReleaseGate?: SenaEnterpriseOrganizationDeploymentPackage["releaseGate"]["latestReview"];
}): SenaEnterpriseReleaseGateDraft {
  const verificationCommand = input.verificationCommands.find((command) => command === "npm run sena:pilot:verify") ??
    input.verificationCommands[0] ??
    "npm run sena:pilot:verify";
  const decision: SenaEnterpriseReleaseGateDecision = input.status === "ready"
    ? "approved"
    : input.status === "review"
      ? "conditional"
      : "blocked";
  const verificationStatus: SenaEnterpriseReleaseVerificationEvidence["status"] = input.status === "ready" && input.latestReleaseGate?.verificationEvidence.status === "passed"
    ? "passed"
    : "not-run";
  const blockerSummary = input.blockers.length > 0 ? input.blockers.join(", ") : "none";
  const latestReleaseGateIdentitySnapshot = input.latestReleaseGate?.identityProductionSnapshot;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseGateDraft,
    generatedAt: input.generatedAt,
    decision,
    environment: input.latestReleaseGate?.environment ?? "pilot-production",
    releaseVersion: input.latestReleaseGate?.releaseVersion ?? `${input.generatedAt.slice(0, 10)}-go-live-rehearsal`,
    verificationCommand,
    verificationEvidence: {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseReleaseVerificationEvidence,
      command: verificationCommand,
      status: verificationStatus,
      summary: `Generated from sena-enterprise-go-live-rehearsal/v1. Rehearsal status=${input.status}; blockers=${blockerSummary}. Run ${verificationCommand} and paste the real verification output summary before approving production release.`
    },
    notes: `Go-live rehearsal draft generated from current ops evidence. Suggested decision=${decision}. Blockers=${blockerSummary}.`,
    requiredBeforeSubmit: [
      "Run npm run sena:pilot:verify and paste the real verification summary before approving production release.",
      input.blockers.length > 0
        ? "Resolve go-live rehearsal blockers before changing the draft decision to approved."
        : "Attach the latest verifier output or keep the decision conditional until verification evidence is reviewed."
    ],
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "releaseGateReview=sena-enterprise-release-gate-review/v1",
      "verificationEvidence=sena-enterprise-release-verification-evidence/v1",
      `suggestedDecision=${decision}`,
      `verificationStatus=${verificationStatus}`,
      `blockers=${input.blockers.length}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot)
    ]
  };
}

function buildEnterpriseGoLiveRollbackDrill(input: {
  generatedAt: string;
  goLiveStatus: SenaEnterpriseGoLiveRehearsal["status"];
  goLiveBlockers: string[];
  readiness: SenaEnterpriseDeploymentReadiness;
  governance: SenaEnterpriseGovernanceStatus;
  verificationCommands: string[];
  latestReleaseGate?: SenaEnterpriseOrganizationDeploymentPackage["releaseGate"]["latestReview"];
  identityProductionReleaseGateDigestBinding: "current" | "stale" | "missing";
}): SenaEnterpriseGoLiveRollbackDrill {
  const readinessItems = [...input.readiness.blocking, ...input.readiness.advisory];
  const readinessItem = (id: string) => readinessItems.find((item) => item.id === id);
  const governanceCheck = (id: string) => input.governance.checks.find((check) => check.id === id);
  const backupFreshness = readinessItem("backup-freshness");
  const backupWebhook = readinessItem("backup-webhook");
  const alertWebhook = readinessItem("alert-webhook");
  const restoreRehearsal = governanceCheck("backup-restore-rehearsal");
  const deploymentMonitoring = governanceCheck("deployment-monitoring");
  const releaseGateReview = governanceCheck("release-gate-review");
  const latestReleaseGateApproved = input.latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = input.latestReleaseGate?.verificationEvidence.status === "passed";
  const latestReleaseGateIdentitySnapshot = input.latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const backupReady = backupFreshness?.status === "pass" && backupWebhook?.status === "pass";
  const restoreRehearsed = restoreRehearsal?.status === "pass";
  const alertingReady = alertWebhook?.status === "pass" && deploymentMonitoring?.status === "pass";
  const releaseGateReady = latestReleaseGateApproved &&
    latestReleaseGateVerificationPassed &&
    latestReleaseGateIdentityReady &&
    input.identityProductionReleaseGateDigestBinding === "current";
  const verificationCommand = input.verificationCommands.find((command) => command === "npm run sena:pilot:verify") ??
    input.verificationCommands[0] ??
    "npm run sena:pilot:verify";
  const blockers = Array.from(new Set([
    ...input.goLiveBlockers,
    backupReady ? null : "fresh-managed-backup-required",
    restoreRehearsed ? null : "backup-restore-rehearsal-required",
    alertingReady ? null : "incident-alerting-required",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    input.identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker))));
  const nextActions = Array.from(new Set([
    backupReady ? null : backupFreshness?.nextAction ?? backupWebhook?.nextAction ?? "Run and deliver a verified managed backup before cutover.",
    restoreRehearsed ? null : restoreRehearsal?.nextAction ?? "Run POST /api/sena/governance/backup action=restore-dry-run with the cutover backup artifact.",
    alertingReady ? null : deploymentMonitoring?.nextAction ?? alertWebhook?.nextAction ?? "Connect signed ops alerts to the incident channel before cutover.",
    releaseGateReady ? null : releaseGateReview?.nextAction ?? "Record an approved release gate with passed verification evidence before cutover.",
    latestReleaseGateIdentityReady ? null : "Resolve release-gate identity production evidence review before rollback readiness is marked ready.",
    input.identityProductionReleaseGateDigestBinding === "current" ? null : "Record a fresh release gate review after the latest institution identity production evidence handoff changes."
  ].filter((action): action is string => Boolean(action))));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveRollbackDrill,
    generatedAt: input.generatedAt,
    status: blockers.length > 0 ? "blocked" : input.goLiveStatus === "ready" ? "ready" : "review",
    summary: {
      goLiveStatus: input.goLiveStatus,
      backupReady: Boolean(backupReady),
      restoreRehearsed: Boolean(restoreRehearsed),
      alertingReady: Boolean(alertingReady),
      releaseGateReady: Boolean(releaseGateReady),
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-backup/v1",
      "sena-enterprise-backup-verification/v1",
      "sena-enterprise-backup-restore/v1",
      "sena-enterprise-ops-alerts/v1",
      "sena-enterprise-ops-alert-delivery/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "npm run sena:pilot:verify"
    ],
    runbook: {
      ownerEvidence: [
        ...(backupWebhook?.evidence ?? []),
        ...(deploymentMonitoring?.evidence ?? []),
        ...(releaseGateReview?.evidence ?? [])
      ].filter((entry) => /owner|runbook|webhook|releaseGate|verification/i.test(entry)),
      steps: [
        {
          id: "freeze-traffic",
          label: "Freeze institution traffic and route users to the incident channel.",
          owner: "institution-platform-owner",
          evidence: [
            "alertsApi=/api/sena/ops/alerts",
            "statusApi=/api/sena/ops/status",
            `alertingReady=${alertingReady ? "yes" : "no"}`
          ]
        },
        {
          id: "snapshot-and-verify",
          label: "Export, verify, and deliver the current team-scoped backup artifact.",
          owner: "team-manager-or-platform-owner",
          command: "GET /api/sena/governance/backup then POST /api/sena/governance/backup",
          evidence: [
            "backup=sena-enterprise-backup/v1",
            "backupVerification=sena-enterprise-backup-verification/v1",
            `backupReady=${backupReady ? "yes" : "no"}`
          ]
        },
        {
          id: "restore-dry-run",
          label: "Run a dry-run merge restore using the rollback backup artifact.",
          owner: "team-manager-or-platform-owner",
          command: "POST /api/sena/governance/backup action=restore-dry-run",
          evidence: [
            "restore=sena-enterprise-backup-restore/v1",
            `restoreRehearsed=${restoreRehearsed ? "yes" : "no"}`
          ]
        },
        {
          id: "rollback-release",
          label: "Rollback to the last approved deployment tag or keep the release gate blocked.",
          owner: "release-approver",
          evidence: [
            "releaseGate=sena-enterprise-release-gate-review/v1",
            `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
            `latestVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
            `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
            `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
            `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
            `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
            `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
            ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
            `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`
          ]
        },
        {
          id: "verify-after-rollback",
          label: "Run the full SENA verifier and attach the output to the release gate.",
          owner: "release-approver",
          command: verificationCommand,
          evidence: [
            "verificationEvidence=sena-enterprise-release-verification-evidence/v1",
            "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1"
          ]
        }
      ]
    },
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "rollbackDrill=sena-enterprise-go-live-rollback-drill/v1",
      `goLiveStatus=${input.goLiveStatus}`,
      `backupFreshness=${backupFreshness?.status ?? "missing"}`,
      `backupWebhook=${backupWebhook?.status ?? "missing"}`,
      `restoreRehearsal=${restoreRehearsal?.status ?? "missing"}`,
      `alertWebhook=${alertWebhook?.status ?? "missing"}`,
      `deploymentMonitoring=${deploymentMonitoring?.status ?? "missing"}`,
      `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`,
      `blockers=${blockers.length}`
    ],
    nextActions
  };
}

function buildEnterpriseGoLiveMonitor(input: {
  generatedAt: string;
  goLiveStatus: SenaEnterpriseGoLiveRehearsal["status"];
  goLiveBlockers: string[];
  opsStatus: SenaEnterpriseOpsStatus;
  opsAlerts: SenaEnterpriseOpsAlerts;
  rollbackDrill: SenaEnterpriseGoLiveRollbackDrill;
  latestObservation: SenaEnterprisePostCutoverObservationList;
  latestReleaseGate?: SenaEnterpriseOrganizationDeploymentPackage["releaseGate"]["latestReview"];
  verificationCommands: string[];
  identityProductionReleaseGateDigestBinding: "current" | "stale" | "missing";
}): SenaEnterpriseGoLiveMonitor {
  const criticalAlerts = input.opsAlerts.summary.critical;
  const warningAlerts = input.opsAlerts.summary.warning;
  const latestReleaseGateApproved = input.latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = input.latestReleaseGate?.verificationEvidence.status === "passed";
  const latestReleaseGateIdentitySnapshot = input.latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const releaseGateReady = latestReleaseGateApproved &&
    latestReleaseGateVerificationPassed &&
    latestReleaseGateIdentityReady &&
    input.identityProductionReleaseGateDigestBinding === "current";
  const rollbackReady = input.rollbackDrill.status === "ready";
  const latestObservation = input.latestObservation.observations[0];
  const postCutoverObservationReady = latestObservation?.status === "ready";
  const verificationCommand = input.verificationCommands.find((command) => command === "npm run sena:pilot:verify") ??
    input.verificationCommands[0] ??
    "npm run sena:pilot:verify";
  const serverJobRuntimeCheck = input.opsStatus.checks.find((check) => check.id === "ops-server-job-runtime");
  const serverJobRuntimeEvidence = [
    `serverJobsTotal=${input.opsStatus.counts.serverJobs}`,
    `serverJobsQueued=${input.opsStatus.queues.serverJobsQueued}`,
    `serverJobsRunning=${input.opsStatus.queues.serverJobsRunning}`,
    `serverJobsFailed=${input.opsStatus.queues.serverJobsFailed}`,
    `serverJobsDeadLettered=${input.opsStatus.queues.serverJobsDeadLettered}`,
    `serverJobsRetryable=${input.opsStatus.queues.serverJobsRetryable}`,
    ...(serverJobRuntimeCheck?.evidence ?? [])
      .filter((entry) => entry.startsWith("serverJobStore=") ||
        entry.startsWith("serverJobQueueCountsSource=") ||
        entry.startsWith("serverJobQueueCountsRead="))
  ];
  const checks: SenaEnterpriseGoLiveMonitor["checks"] = [
    {
      id: "go-live-rehearsal",
      label: "Go-live rehearsal status",
      status: input.goLiveStatus === "ready" ? "pass" : "blocked",
      evidence: [
        "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
        `status=${input.goLiveStatus}`,
        `blockers=${input.goLiveBlockers.length}`
      ],
      nextAction: input.goLiveStatus === "ready"
        ? "Keep the current go-live rehearsal attached to the cutover record."
        : "Resolve go-live rehearsal blockers before starting the post-cutover observation window."
    },
    {
      id: "ops-status",
      label: "Ops status endpoint",
      status: input.opsStatus.status === "degraded" ? "blocked" : input.opsStatus.status === "ready" ? "pass" : "watch",
      evidence: [
        `opsStatus=${input.opsStatus.status}`,
        `storageWritable=${input.opsStatus.storage.writable}`,
        `lockProbe=${input.opsStatus.storage.lockProbe}`,
        `backupStatus=${input.opsStatus.backup.status}`,
        `uptimeSeconds=${input.opsStatus.deployment.uptimeSeconds}`,
        ...serverJobRuntimeEvidence
      ],
      nextAction: input.opsStatus.status === "ready"
        ? "Keep status and metrics polling active throughout the observation window."
        : "Keep the observation window open until ops status is ready and degraded checks are cleared."
    },
    {
      id: "critical-alerts",
      label: "Critical ops alerts",
      status: criticalAlerts === 0 ? "pass" : "blocked",
      evidence: [
        `alertsStatus=${input.opsAlerts.status}`,
        `critical=${criticalAlerts}`,
        `warning=${warningAlerts}`,
        `firing=${input.opsAlerts.summary.firing}`
      ],
      nextAction: criticalAlerts === 0
        ? "Keep alert delivery connected and watch for regressions."
        : "Resolve critical firing alerts before closing cutover observation."
    },
    {
      id: "warning-alerts",
      label: "Warning ops alerts",
      status: warningAlerts === 0 ? "pass" : "watch",
      evidence: [
        `warning=${warningAlerts}`,
        `owner=${input.opsAlerts.ownership.owner}`,
        `runbook=${input.opsAlerts.ownership.runbookUrl ? "configured" : "missing"}`
      ],
      nextAction: warningAlerts === 0
        ? "No warning alerts are firing."
        : "Keep watch status until warning alerts are acknowledged or cleared."
    },
    {
      id: "rollback-drill",
      label: "Rollback drill readiness",
      status: rollbackReady ? "pass" : "blocked",
      evidence: [
        `rollbackDrill=${input.rollbackDrill.schemaVersion}`,
        `rollbackStatus=${input.rollbackDrill.status}`,
        `rollbackBlockers=${input.rollbackDrill.summary.blockers.length}`
      ],
      nextAction: rollbackReady
        ? "Keep the rollback drill attached to the cutover handoff."
        : "Resolve rollback drill blockers before closing cutover observation."
    },
    {
      id: "post-cutover-observation",
      label: "60-minute post-cutover observation",
      status: postCutoverObservationReady ? "pass" : "blocked",
      evidence: [
        `observationSchema=${input.latestObservation.schemaVersion}`,
        `observationId=${latestObservation?.id ?? "missing"}`,
        `observationStatus=${latestObservation?.status ?? "missing"}`,
        `observationSamples=${latestObservation?.samples.length ?? 0}`,
        `requiredUntil=${latestObservation?.requiredUntil ?? "missing"}`,
        `completedAt=${latestObservation?.completedAt ?? "missing"}`
      ],
      nextAction: postCutoverObservationReady
        ? "Keep the completed 60-minute observation attached to the cutover record."
        : "Start, sample, and complete the 60-minute post-cutover observation before approving go-live."
    },
    {
      id: "release-verification",
      label: "Release gate verification",
      status: releaseGateReady ? "pass" : "blocked",
      evidence: [
        "releaseGate=sena-enterprise-release-gate-review/v1",
        `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
        `latestVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
        `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
        `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
        `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
        `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
        `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
        ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
        `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`,
        `verificationCommand=${verificationCommand}`
      ],
      nextAction: releaseGateReady
        ? "Keep the passed verifier output attached to the release gate."
        : "Run the full verifier and record an approved release gate with passed verification evidence, including identity production evidence readiness."
    }
  ];
  const blockers = Array.from(new Set([
    input.goLiveStatus === "ready" ? null : "go-live-rehearsal-not-ready",
    input.opsStatus.status === "degraded" ? "ops-status-degraded" : null,
    criticalAlerts === 0 ? null : "critical-ops-alerts-firing",
    rollbackReady ? null : "rollback-drill-not-ready",
    postCutoverObservationReady ? null : "post-cutover-observation-required",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    input.identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker))));
  const watchItems = checks.filter((check) => check.status === "watch");
  const status: SenaEnterpriseGoLiveMonitor["status"] = blockers.length > 0 ? "blocked" : watchItems.length > 0 ? "watch" : "ready";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveMonitor,
    generatedAt: input.generatedAt,
    status,
    observationWindow: {
      recommendedMinutes: 60,
      exitCriteria: [
        "No critical ops alerts firing during the observation window.",
        "Warning ops alerts are acknowledged, cleared, or assigned to an owner.",
        "Ops status remains ready or non-degraded for the full observation window.",
        "Rollback drill evidence remains attached and ready.",
        "The full SENA pilot verifier has passed and is attached to the release gate."
      ]
    },
    summary: {
      goLiveStatus: input.goLiveStatus,
      opsStatus: input.opsStatus.status,
      alertsStatus: input.opsAlerts.status,
      criticalAlerts,
      warningAlerts,
      releaseGateReady,
      rollbackReady,
      postCutoverObservationReady,
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-ops-status/v1",
      "sena-enterprise-ops-alerts/v1",
      "sena-enterprise-ops-alert-delivery/v1",
      "sena-enterprise-go-live-rollback-drill/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "npm run sena:pilot:verify"
    ],
    latestObservation: input.latestObservation,
    checks,
    evidence: [
      "goLiveRehearsal=sena-enterprise-go-live-rehearsal/v1",
      "postCutoverMonitor=sena-enterprise-go-live-monitor/v1",
      `status=${status}`,
      `opsStatus=${input.opsStatus.status}`,
      `alertsStatus=${input.opsAlerts.status}`,
      `criticalAlerts=${criticalAlerts}`,
      `warningAlerts=${warningAlerts}`,
      `rollbackDrill=${input.rollbackDrill.status}`,
      `postCutoverObservation=${latestObservation?.status ?? "missing"}`,
      `postCutoverObservationId=${latestObservation?.id ?? "missing"}`,
      `postCutoverObservationSamples=${latestObservation?.samples.length ?? 0}`,
      `latestReleaseGate=${input.latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${input.latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `identityProductionReleaseGateDigestBinding=${input.identityProductionReleaseGateDigestBinding}`,
      `observationWindowMinutes=60`
    ],
    nextActions: Array.from(new Set(checks
      .filter((check) => check.status !== "pass")
      .map((check) => check.nextAction)))
  };
}

function buildEnterpriseGoLiveRehearsal(input: {
  deployment: SenaEnterpriseOrganizationDeploymentPackage;
  readiness: SenaEnterpriseDeploymentReadiness;
  governance: SenaEnterpriseGovernanceStatus;
  opsStatus: SenaEnterpriseOpsStatus;
  opsAlerts: SenaEnterpriseOpsAlerts;
  latestObservation: SenaEnterprisePostCutoverObservationList;
}): SenaEnterpriseGoLiveRehearsal {
  const nativeAdapterProductionBlocking = input.deployment.nativeAdapterCertification.summary.productionBlocking;
  const latestReleaseGate = input.deployment.releaseGate.latestReview;
  const latestReleaseGateApproved = latestReleaseGate?.decision === "approved";
  const latestReleaseGateVerificationPassed = latestReleaseGate?.verificationEvidence.status === "passed";
  const latestReleaseGateIdentitySnapshot = latestReleaseGate?.identityProductionSnapshot;
  const latestReleaseGateIdentityReady = latestReleaseGateIdentitySnapshot?.status === "ready" &&
    !latestReleaseGateIdentitySnapshot.releaseGateBlocked;
  const identityProductionReleaseGateDigestBinding = !latestReleaseGateIdentitySnapshot?.evidenceBindingDigest || !input.deployment.identityProductionHandoff.evidenceBindingDigest
    ? "missing"
    : latestReleaseGateIdentitySnapshot.evidenceBindingDigest === input.deployment.identityProductionHandoff.evidenceBindingDigest
      ? "current"
      : "stale";
  const blockers = [
    input.readiness.summary.blockingReview === 0 ? null : "deployment-readiness-blocking-items",
    input.deployment.saasOperationsReadiness.status === "ready" ? null : "saas-operations-not-ready",
    nativeAdapterProductionBlocking === 0 ? null : "native-adapter-certification-production-blockers",
    latestReleaseGateApproved ? null : "approved-release-gate-required",
    latestReleaseGateVerificationPassed ? null : "release-gate-verification-passed-required",
    latestReleaseGateIdentityReady ? null : "release-gate-identity-production-evidence-required",
    identityProductionReleaseGateDigestBinding === "current" ? null : "release-gate-identity-production-evidence-digest-stale"
  ].filter((blocker): blocker is string => Boolean(blocker));
  const governanceReviewItems = input.governance.checks.filter((check) => check.status === "review").length;
  const advisoryItems = input.readiness.summary.advisoryReview + governanceReviewItems;
  const generatedAt = now();
  const verificationCommands = Array.from(new Set([
    ...input.readiness.runbook.verificationCommands,
    latestReleaseGate?.verificationCommand
  ].filter((command): command is string => Boolean(command))));
  const nextActions = Array.from(new Set([
    ...input.readiness.blocking.filter((item) => item.status === "review").map((item) => item.nextAction),
    ...input.deployment.saasOperationsReadiness.nextActions,
    ...input.deployment.nativeAdapterCertification.nextActions,
    latestReleaseGateApproved && latestReleaseGateVerificationPassed ? null : "Record an approved release gate with passed verification evidence after running the full pilot verifier.",
    latestReleaseGateIdentityReady ? null : "Resolve release-gate identity production evidence review before go-live rehearsal is marked ready.",
    identityProductionReleaseGateDigestBinding === "current" ? null : "Record a fresh release gate review after the latest institution identity production evidence handoff changes.",
    advisoryItems === 0 ? null : "Resolve advisory readiness and governance review items before institution production cutover."
  ].filter((action): action is string => Boolean(action))));

  const status: SenaEnterpriseGoLiveRehearsal["status"] = blockers.length > 0
    ? "blocked"
    : advisoryItems > 0 || input.deployment.status !== "ready"
      ? "review"
      : "ready";
  const releaseGateDraft = buildEnterpriseReleaseGateDraft({
    generatedAt,
    status,
    blockers,
    verificationCommands,
    latestReleaseGate
  });
  const rollbackDrill = buildEnterpriseGoLiveRollbackDrill({
    generatedAt,
    goLiveStatus: status,
    goLiveBlockers: blockers,
    readiness: input.readiness,
    governance: input.governance,
    verificationCommands,
    latestReleaseGate,
    identityProductionReleaseGateDigestBinding
  });
  const postCutoverMonitor = buildEnterpriseGoLiveMonitor({
    generatedAt,
    goLiveStatus: status,
    goLiveBlockers: blockers,
    opsStatus: input.opsStatus,
    opsAlerts: input.opsAlerts,
    rollbackDrill,
    latestObservation: input.latestObservation,
    latestReleaseGate,
    verificationCommands,
    identityProductionReleaseGateDigestBinding
  });
  const identityProductionRequestPacketEvidence = (sourceKey: string, targetKey: string) => {
    const evidence = input.deployment.identityProductionHandoff.platformRequestPacket.evidence
      .find((item) => item.startsWith(`${sourceKey}=`));
    return evidence ? `${targetKey}=${evidence.slice(sourceKey.length + 1)}` : null;
  };
  const identityProductionHandoffEvidence = [
    identityProductionRequestPacketEvidence("requestPacketPolicyHash", "identityProductionRequestPacketPolicyHash"),
    identityProductionRequestPacketEvidence("requestPacketPolicyBinding", "identityProductionRequestPacketPolicyBinding"),
    identityProductionRequestPacketEvidence("receiptReviewRequests", "identityProductionReceiptReviewRequests"),
    identityProductionRequestPacketEvidence("evidenceUrlAllowedHosts", "identityProductionEvidenceUrlAllowedHosts")
  ].filter((evidence): evidence is string => Boolean(evidence));
  const identityProductionHandoffHostBinding = input.deployment.identityProductionHandoff.evidenceUrlHostBinding;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveRehearsal,
    generatedAt,
    status,
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    export: {
      api: "/api/sena/ops/go-live-rehearsal",
      filename: "sena-enterprise-go-live-rehearsal.json"
    },
    rehearsal: {
      deploymentPackage: input.deployment.schemaVersion,
      deploymentReadiness: input.readiness.schemaVersion,
      governance: input.governance.schemaVersion,
      platformDecisionRegister: input.deployment.platformDecisionRegister.schemaVersion,
      nativeAdapterCertification: input.deployment.nativeAdapterCertification.schemaVersion,
      saasOperationsReadiness: input.deployment.saasOperationsReadiness.schemaVersion,
      releaseGate: input.deployment.releaseGate.schemaVersion
    },
    summary: {
      blockingItems: input.readiness.summary.blockingReview,
      advisoryItems: input.readiness.summary.advisoryReview,
      governanceReviewItems,
      openPlatformDecisions: input.deployment.summary.openPlatformDecisions,
      acceptedPlatformDecisions: input.deployment.summary.acceptedPlatformDecisions,
      nativeAdapterProductionBlocking,
      saasOperationsStatus: input.deployment.saasOperationsReadiness.status,
      releaseGateReviews: input.deployment.releaseGate.summary.total,
      latestReleaseGateStatus: latestReleaseGate?.decision,
      latestReleaseGateVerificationStatus: latestReleaseGate?.verificationEvidence.status,
      blockers
    },
    requiredEvidence: [
      "sena-enterprise-deployment-readiness/v1",
      "sena-enterprise-organization-deployment/v1",
      "sena-enterprise-governance/v1",
      "sena-enterprise-platform-decision-register/v1",
      "sena-enterprise-native-adapter-certification/v1",
      "sena-enterprise-saas-operations-readiness/v1",
      "sena-enterprise-go-live-rollback-drill/v1",
      "sena-enterprise-go-live-monitor/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-release-verification-evidence/v1",
      "npm run sena:pilot:verify"
    ],
    verificationCommands,
    identityProductionHandoff: input.deployment.identityProductionHandoff,
    releaseGateDraft,
    rollbackDrill,
    postCutoverMonitor,
    evidence: [
      "redaction=secret-values-excluded",
      "endpointValues=hashed",
      `deploymentPackage=${input.deployment.schemaVersion}`,
      `deploymentReadiness=${input.readiness.schemaVersion}`,
      `governance=${input.governance.schemaVersion}`,
      `platformDecisionRegister=${input.deployment.platformDecisionRegister.schemaVersion}`,
      `nativeAdapterCertification=${input.deployment.nativeAdapterCertification.schemaVersion}`,
      `nativeAdapterProductionBlocking=${nativeAdapterProductionBlocking}`,
      `saasOperations=${input.deployment.saasOperationsReadiness.schemaVersion}`,
      `saasOperationsStatus=${input.deployment.saasOperationsReadiness.status}`,
      `releaseGate=${input.deployment.releaseGate.schemaVersion}`,
      `releaseGateReviews=${input.deployment.releaseGate.summary.total}`,
      `latestReleaseGate=${latestReleaseGate?.decision ?? "missing"}`,
      `latestReleaseGateVerification=${latestReleaseGate?.verificationEvidence.status ?? "missing"}`,
      `latestReleaseGateIdentityProductionStatus=${latestReleaseGateIdentitySnapshot?.status ?? "missing"}`,
      `latestReleaseGateIdentityVerifierIncomplete=${latestReleaseGateIdentitySnapshot?.submissionVerifier.incompleteDecisions ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissing=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingProductionEvidence ?? "missing"}`,
      `latestReleaseGateIdentityVerifierMissingTechnical=${latestReleaseGateIdentitySnapshot?.submissionVerifier.missingTechnicalPrerequisites ?? "missing"}`,
      `latestReleaseGateIdentityRotationFreshness=${latestReleaseGateIdentitySnapshot?.rotationFreshness.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverChecklist=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.status ?? "missing"}`,
      `latestReleaseGateIdentityCutoverBlockers=${latestReleaseGateIdentitySnapshot?.cutoverChecklist.summary.blockingItems ?? "missing"}`,
      `latestReleaseGateIdentityProductionEvidenceDigest=${latestReleaseGateIdentitySnapshot?.dossierDigest ?? "missing"}`,
      `latestReleaseGateIdentityEvidenceBindingDigest=${latestReleaseGateIdentitySnapshot?.evidenceBindingDigest ?? "missing"}`,
      ...latestReleaseGateIdentityReceiptArchiveEvidence(latestReleaseGateIdentitySnapshot),
      `identityProductionHandoff=${input.deployment.identityProductionHandoff.schemaVersion}`,
      `identityProductionHandoffStatus=${input.deployment.identityProductionHandoff.status}`,
      `identityProductionHandoffMissingEvidence=${input.deployment.identityProductionHandoff.evidenceManifest.missingEvidenceIds.length}`,
      `identityProductionRequestBlockers=${input.deployment.identityProductionHandoff.platformRequestPacket.summary.blockingRequests}`,
      `identityProductionHandoffDigest=${input.deployment.identityProductionHandoff.dossierDigest ?? "missing"}`,
      `identityProductionHandoffEvidenceBindingDigest=${input.deployment.identityProductionHandoff.evidenceBindingDigest ?? "missing"}`,
      `identityProductionReceiptArchiveManifestDigest=${input.deployment.identityProductionHandoff.receiptArchiveManifest.archiveManifestDigest ?? "missing"}`,
      `identityProductionReceiptArchiveReadyForArchive=${input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.readyForArchive}`,
      `identityProductionReceiptArchiveReview=${input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.reviewArchives}`,
      `identityProductionReceiptArchiveMissingReceipts=${input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.missingReceipts}`,
      `identityProductionReceiptArchiveMissingInputs=${formatIdentityReceiptArchiveMissingInputCounts(input.deployment.identityProductionHandoff.receiptArchiveManifest.summary.missingArchiveInputCounts)}`,
      `identityProductionReleaseGateDigestBinding=${identityProductionReleaseGateDigestBinding}`,
      ...identityProductionHandoffEvidence,
      `identityProductionHandoffHostBinding=${identityProductionHandoffHostBinding.status}`,
      `identityProductionHandoffAllowedHostConfig=${identityProductionHandoffHostBinding.allowedHostConfigStatus}`,
      `identityProductionHandoffAllowedHosts=${identityProductionHandoffHostBinding.allowedHostCount}`,
      `identityProductionHandoffInvalidAllowedHosts=${identityProductionHandoffHostBinding.invalidAllowedHostCount}`,
      `postCutoverMonitor=${postCutoverMonitor.schemaVersion}`
    ],
    nextActions
  };
}

export function getEnterpriseGoLiveRehearsal(input: {
  teamId?: string;
  db?: SenaEnterpriseDb;
  deployment?: SenaEnterpriseOrganizationDeploymentPackage;
  readiness?: SenaEnterpriseDeploymentReadiness;
  opsStatus?: SenaEnterpriseOpsStatus;
  opsAlerts?: SenaEnterpriseOpsAlerts;
  governance?: SenaEnterpriseGovernanceStatus;
  latestObservation?: SenaEnterprisePostCutoverObservationList;
} = {}): SenaEnterpriseGoLiveRehearsal {
  const db = input.db ?? (
    input.deployment && input.governance && input.latestObservation ? undefined : readEnterpriseDb()
  );
  const readiness = input.readiness ?? getEnterpriseDeploymentReadiness();
  const opsStatus = input.opsStatus ?? getEnterpriseOpsStatus();
  const deployment = input.deployment ?? getEnterpriseOrganizationDeploymentPackage({
    teamId: input.teamId,
    db,
    readiness,
    opsStatus
  });
  const governance = input.governance ?? getEnterpriseGovernanceStatus({ db, opsStatus });
  const opsAlerts = input.opsAlerts ?? getEnterpriseOpsAlerts(opsStatus, readiness);
  const latestObservation = input.latestObservation ?? postCutoverObservationList(
    ((db ?? readEnterpriseDb()).postCutoverObservations ?? [])
      .filter((observation) => !input.teamId || observation.teamId === input.teamId),
    { teamId: input.teamId }
  );
  return buildEnterpriseGoLiveRehearsal({ deployment, readiness, governance, opsStatus, opsAlerts, latestObservation });
}

export async function getEnterpriseGoLiveRehearsalWithPostgresEvidence(input: {
  teamId?: string;
  deployment?: SenaEnterpriseOrganizationDeploymentPackage;
  readiness?: SenaEnterpriseDeploymentReadiness;
  opsStatus?: SenaEnterpriseOpsStatus;
  opsAlerts?: SenaEnterpriseOpsAlerts;
  governance?: SenaEnterpriseGovernanceStatus;
  latestObservation?: SenaEnterprisePostCutoverObservationList;
} = {}): Promise<SenaEnterpriseGoLiveRehearsal> {
  const opsStatus = input.opsStatus ?? await getEnterpriseOpsStatusWithPostgresEvidence();
  const readiness = input.readiness ?? await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus });
  const deployment = input.deployment ?? await getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence({
    teamId: input.teamId,
    readiness,
    opsStatus
  });
  const governance = input.governance ?? await getEnterpriseGovernanceStatusWithPostgresEvidence({ opsStatus });
  const opsAlerts = input.opsAlerts ?? await getEnterpriseOpsAlertsWithPostgresEvidence(opsStatus, readiness);
  const state = input.latestObservation ? null : await readEnterpriseState();
  const latestObservation = input.latestObservation ?? postCutoverObservationList(
    (state?.db.postCutoverObservations ?? [])
      .filter((observation) => !input.teamId || observation.teamId === input.teamId),
    { teamId: input.teamId }
  );
  return getEnterpriseGoLiveRehearsal({
    teamId: input.teamId,
    deployment,
    readiness,
    opsStatus,
    opsAlerts,
    governance,
    latestObservation
  });
}
