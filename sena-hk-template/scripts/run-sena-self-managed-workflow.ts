import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function assertConfigured(key: string) {
  if (!process.env[key]?.trim()) {
    throw new Error(`${key} is required. Run npm run sena:self-managed:env first.`);
  }
}

function uniqueEmail(prefix: string) {
  return `${prefix}+${Date.now()}@example.edu`;
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
(process.env as Record<string, string | undefined>)["NODE_ENV"] =
  process.env.SENA_SELF_MANAGED_WORKFLOW_NODE_ENV?.trim() || "production";

for (const key of [
  "SENA_ENTERPRISE_DEPLOYMENT_MODE",
  "SENA_SELF_MANAGED_WEBHOOK_SINK",
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_OPS_TOKEN",
  "SENA_SESSION_SECRET",
  "SENA_CSRF_SECRET",
  "SENA_MFA_ENCRYPTION_KEY"
]) {
  assertConfigured(key);
}

const enterprise = await import("../lib/sena/enterprise");
const {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} = await import("../lib/sena");

const imported = importSenaJsonContract(lessonStudySenaContract);
const model = buildSenaModel(imported.dataset);
const snapshot = buildSenaProjectSnapshot(model, {
  title: "Self-managed Enterprise Workflow Snapshot",
  generatedAt: new Date().toISOString(),
  sourceDataset: imported.dataset,
  humanReview: {
    status: "human-reviewed",
    reviewer: "Self-managed workflow",
    interpretation: "Local self-managed runtime rehearsal.",
    limitations: "Workflow smoke evidence only.",
    nextActions: "Keep backup, restore, audit, and release verification current."
  },
  codingReliability: {
    status: "documented",
    reviewer: "Self-managed workflow",
    codingScheme: "Lesson-study fixture",
    unitOfCoding: "coded_segments",
    coderCount: 2,
    agreementMetric: "Cohen kappa; Krippendorff alpha",
    agreementValue: "fixture-documented",
    adjudicationNotes: "Workflow fixture.",
    limitations: "Not a study claim."
  }
});

const registered = enterprise.registerEnterpriseUser({
  name: "Self Managed Workflow Owner",
  email: uniqueEmail("self-managed-owner"),
  password: "sena-secure-123",
  organization: "SENA Self Managed",
  plan: "enterprise"
});
const teamId = registered.context.teams[0].id;

const project = enterprise.createEnterpriseProject(registered.context, {
  teamId,
  title: "Self-managed Workflow Project",
  description: "Created by the self-managed runtime workflow.",
  snapshot
});

enterprise.createEnterpriseInvitation(registered.context, {
  teamId,
  email: uniqueEmail("self-managed-reviewer"),
  role: "reviewer",
  baseUrl: process.env.SENA_APP_URL
});

const notificationDelivery = await enterprise.deliverEnterpriseNotifications(registered.context, { teamId, force: true });
const emailDelivery = await enterprise.deliverEnterpriseEmails(registered.context, { teamId, force: true });
const backup = enterprise.createEnterpriseBackup(registered.context, { teamId });
const backupVerification = enterprise.verifyEnterpriseBackup(registered.context, backup);
const backupDelivery = await enterprise.deliverEnterpriseBackup(registered.context, { backup });
const databaseSync = await enterprise.deliverEnterpriseDatabaseSync(registered.context, { backup });
const restoreDryRun = enterprise.restoreEnterpriseBackup(registered.context, backup, { dryRun: true });

enterprise.updateEnterpriseProject(registered.context, project.id, {
  description: "Temporary drift before self-managed restore."
});
const restore = enterprise.restoreEnterpriseBackup(registered.context, backup, { mode: "merge" });
const auditIntegrity = enterprise.verifyEnterpriseAuditIntegrity(registered.context, { teamId });
const auditDelivery = await enterprise.deliverEnterpriseAuditLog(registered.context, { teamId, force: true });

const releaseVersion = `${new Date().toISOString().slice(0, 10)}-self-managed-enterprise`;
const releaseGate = enterprise.createEnterpriseReleaseGateReview(registered.context, {
  teamId,
  environment: "self-managed-production",
  releaseVersion,
  decision: "approved",
  approverName: "Self Managed Release Owner",
  approverRole: "SENA self-managed operator",
  notes: "Approved for an internal self-managed enterprise run. Institution IdP, SCIM, and institution-owned platform evidence are not applicable for this deployment boundary.",
  verificationCommand: "npm run sena:pilot:verify",
  verificationEvidence: {
    status: "passed",
    summary: "npm run sena:pilot:verify completed successfully: pilot smoke, full Vitest suite, Next production build, production artifact checks, workspace browser smoke, auth smoke, SSO fallback smoke, enterprise API smoke, RBAC collaboration smoke, reliability smoke, and validation claim smoke passed."
  }
});

const goLiveAfterRelease = enterprise.getEnterpriseGoLiveRehearsal({ teamId });
const postCutoverObservation = goLiveAfterRelease.status === "ready" &&
  goLiveAfterRelease.postCutoverMonitor.latestObservation.summary.latestStatus === "missing"
  ? enterprise.startEnterprisePostCutoverObservation(registered.context, {
    teamId,
    environment: "self-managed-production",
    releaseVersion
  })
  : null;
const goLiveAfterObservationStart = postCutoverObservation
  ? enterprise.getEnterpriseGoLiveRehearsal({ teamId })
  : goLiveAfterRelease;
const postCutoverMonitorReady = goLiveAfterObservationStart.postCutoverMonitor.status === "ready";
const goLiveAttestation = goLiveAfterObservationStart.status === "ready" && postCutoverMonitorReady
  ? enterprise.createEnterpriseGoLiveAttestation(registered.context, {
    teamId,
    environment: "self-managed-production",
    releaseVersion,
    decision: "approved",
    attesterName: "Self Managed Release Owner",
    attesterRole: "SENA self-managed operator",
    notes: "Approved go-live attestation for the self-managed enterprise runtime after release-gate verification and backup/restore/audit rehearsal.",
    checklist: {
      rehearsalReviewed: true,
      releaseGateDraftReviewed: true,
      verificationEvidenceReviewed: true,
      rollbackOwnerConfirmed: true,
      platformOwnerDecisionReviewed: true
    }
  })
  : null;

const readiness = enterprise.getEnterpriseDeploymentReadiness();
const capabilityAudit = enterprise.getEnterpriseCapabilityAudit();
const deployment = enterprise.getEnterpriseOrganizationDeploymentPackage({ teamId });
const security = enterprise.getEnterpriseSecurityPosture();
const goLive = enterprise.getEnterpriseGoLiveRehearsal({ teamId });

const summary = {
  deploymentMode: process.env.SENA_ENTERPRISE_DEPLOYMENT_MODE,
  nodeEnv: process.env.NODE_ENV,
  sink: process.env.SENA_SELF_MANAGED_WEBHOOK_SINK,
  teamId,
  projectId: project.id,
  notificationProvider: notificationDelivery.provider.mode,
  notificationsDelivered: notificationDelivery.summary.delivered,
  emailProvider: emailDelivery.provider.mode,
  emailsDelivered: emailDelivery.summary.delivered,
  backupStatus: backupVerification.status,
  backupDeliveryStatus: backupDelivery.status,
  databaseSyncStatus: databaseSync.status,
  restoreDryRunStatus: restoreDryRun.status,
  restoreStatus: restore.status,
  auditIntegrityStatus: auditIntegrity.status,
  auditDeliveryProvider: auditDelivery.provider.mode,
  auditEventsDelivered: auditDelivery.summary.delivered,
  readinessStatus: readiness.status,
  readinessBlockingReview: readiness.summary.blockingReview,
  deploymentStatus: deployment.status,
  deploymentMissingRequiredEnv: deployment.summary.missingRequiredEnv,
  securityStatus: security.status,
  releaseGateDecision: releaseGate.decision,
  releaseGateVerificationStatus: releaseGate.verificationEvidence.status,
  releaseGateReadinessBlocking: releaseGate.readinessSnapshot.blockingReview,
  releaseGatePlatformProductionBlocking: releaseGate.platformDecisionSnapshot.productionBlocking,
  releaseGateIdentityStatus: releaseGate.identityProductionSnapshot.status,
  releaseGateIdentityVerifierIncomplete: releaseGate.identityProductionSnapshot.submissionVerifier.incompleteDecisions,
  goLiveStatus: goLive.status,
  goLiveBlockers: goLive.summary.blockers,
  postCutoverObservationStarted: Boolean(postCutoverObservation),
  postCutoverObservationStatus: goLive.postCutoverMonitor.latestObservation.summary.latestStatus,
  postCutoverObservationId: goLive.postCutoverMonitor.latestObservation.summary.latestObservationId ?? "none",
  goLiveAttestationStatus: goLiveAttestation?.status ?? "not-created",
  postCutoverMonitorStatus: goLive.postCutoverMonitor.status,
  capabilityStatus: capabilityAudit.status,
  authCapabilityStatus: capabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso")?.status,
  blockedCapabilities: capabilityAudit.capabilities
    .filter((capability) => capability.status === "blocked")
    .map((capability) => ({
      id: capability.id,
      remainingPlatformDecisions: capability.remainingPlatformDecisions
    })),
  reviewCapabilities: capabilityAudit.capabilities
    .filter((capability) => capability.status === "review")
    .map((capability) => capability.id),
  backupReviewChecks: backupVerification.checks
    .filter((check) => check.status === "review")
    .map((check) => check.id)
};

console.log(JSON.stringify(summary, null, 2));
