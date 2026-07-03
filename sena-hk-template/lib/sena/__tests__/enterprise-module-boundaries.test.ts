import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFileEnterpriseStateStore,
  createEnterpriseStateStore,
  type SenaEnterpriseStateStore
} from "../enterprise/state";
import {
  enterpriseErrorResponse,
  SenaEnterpriseError
} from "../enterprise/errors";
import {
  loginEnterpriseUser,
  registerEnterpriseUser
} from "../enterprise";
import { senaSessionCookieName } from "../enterprise/auth-session";
import {
  createEnterpriseProject,
  listEnterpriseProjects
} from "../enterprise/team-project";
import {
  getEnterpriseDeploymentReadiness
} from "../enterprise/ops-deployment-readiness";
import {
  getEnterpriseGoLiveRehearsal
} from "../enterprise/ops-go-live";
import {
  buildEnterpriseReliabilityJsonRunResponse,
  buildEnterpriseReliabilityRunResponse,
  buildEnterpriseReliabilityRunHeaders,
  buildEnterpriseReliabilityRunListResponse
} from "../enterprise/reliability-runs";
import {
  buildEnterpriseGroupComparisonValidationResponse,
  buildEnterpriseValidationRunHeaders,
  buildEnterpriseValidationRunListResponse,
  buildEnterpriseValidationRunReviewResponse
} from "../enterprise/validation-runs";
import {
  buildEnterpriseNotificationDeliveryResponse,
  buildEnterpriseNotificationListResponse,
  buildEnterpriseNotificationReadResponse
} from "../enterprise/notifications-delivery";
import { lessonStudySenaContract } from "../pilot-assets";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaEnterpriseDb } from "../enterprise";

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) return collectRouteFiles(absolute);
    return entry === "route.ts" ? [absolute] : [];
  });
}

function emptyEnterpriseDb(): SenaEnterpriseDb {
  return {
    schemaVersion: "sena-enterprise-db/v1",
    users: [],
    teams: [],
    memberships: [],
    invitations: [],
    sessions: [],
    ssoStates: [],
    authLockouts: [],
    apiRateLimits: [],
    mfaFactors: [],
    mfaSetups: [],
    mfaChallenges: [],
    passwordResetRequests: [],
    uploads: [],
    importRuns: [],
    analysisRuns: [],
    projects: [],
    projectRevisions: [],
    projectComments: [],
    projectPresence: [],
    adjudications: [],
    collaborationEvents: [],
    reliabilityRuns: [],
    validationRuns: [],
    expertReviews: [],
    platformDecisionAcceptances: [],
    releaseGateReviews: [],
    postCutoverObservations: [],
    goLiveAttestations: [],
    notifications: [],
    emailDeliveries: [],
    auditLog: []
  };
}

describe("SENA enterprise module boundaries", () => {
  it("exposes domain modules for identity, project, and ops callers", () => {
    expect(senaSessionCookieName).toBe("sena_session");
    expect(registerEnterpriseUser).toBeTypeOf("function");
    expect(loginEnterpriseUser).toBeTypeOf("function");
    expect(createEnterpriseProject).toBeTypeOf("function");
    expect(listEnterpriseProjects).toBeTypeOf("function");
    expect(getEnterpriseDeploymentReadiness).toBeTypeOf("function");
    expect(getEnterpriseGoLiveRehearsal).toBeTypeOf("function");
    expect(createFileEnterpriseStateStore).toBeTypeOf("function");
  });

  it("owns enterprise error helpers in the errors module", () => {
    const errorsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "errors.ts"), "utf8");
    const response = enterpriseErrorResponse(new SenaEnterpriseError("Denied.", 403, "permission_denied"));

    expect(errorsSource).not.toMatch(/from\s+"..\/enterprise"/);
    expect(response).toEqual({
      body: { error: "Denied.", code: "permission_denied" },
      status: 403
    });
  });

  it("owns role and permission contracts in the access-control module", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const identityAuthSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "identity-production-evidence.ts"), "utf8");
    const accessControlPath = path.join(process.cwd(), "lib", "sena", "enterprise", "access-control.ts");

    expect(existsSync(accessControlPath)).toBe(true);
    const accessControlSource = readFileSync(accessControlPath, "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseRole\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePermission\s*=/);
    expect(facadeSource).not.toMatch(/export const rolePermissions\s*:/);
    expect(facadeSource).not.toMatch(/export function hasEnterprisePermission\s*\(/);
    expect(facadeSource).not.toMatch(/export function requireEnterprisePermission\s*\(/);
    expect(identityAuthSource).not.toMatch(/export\s+type\s+\{\s*SenaEnterpriseRole\s*\}\s+from\s+"\.\/access-control"/);
    expect(identityAuthSource).not.toMatch(/export\s+\{\s*requireEnterprisePermission\s*\}\s+from\s+"\.\/access-control"/);
    expect(accessControlSource).toMatch(/export type SenaEnterpriseRole\s*=/);
    expect(accessControlSource).toMatch(/export type SenaEnterprisePermission\s*=/);
    expect(accessControlSource).toMatch(/export const rolePermissions\s*:/);
    expect(accessControlSource).toMatch(/export function hasEnterprisePermission\s*\(/);
    expect(accessControlSource).toMatch(/export function requireEnterprisePermission\s*\(/);
  });

  it("owns shared webhook delivery helpers in the webhook delivery module", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const notificationsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "notifications-delivery.ts"), "utf8");
    const webhookDeliveryPath = path.join(process.cwd(), "lib", "sena", "enterprise", "webhook-delivery.ts");

    expect(existsSync(webhookDeliveryPath)).toBe(true);
    const webhookDeliverySource = readFileSync(webhookDeliveryPath, "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseWebhookProviderMode\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseWebhookQueueProvider\s*=/);
    expect(facadeSource).not.toMatch(/function webhookQueueProvider\s*\(/);
    expect(facadeSource).not.toMatch(/function localWebhookSinkAttempt\s*\(/);
    expect(facadeSource).not.toMatch(/function localWebhookSinkEndpointHash\s*\(/);
    expect(facadeSource).not.toMatch(/function localWebhookSinkProvider\s*\(/);
    expect(facadeSource).not.toMatch(/function webhookRetryAt\s*\(/);
    expect(facadeSource).not.toMatch(/function webhookErrorHash\s*\(/);
    expect(facadeSource).not.toMatch(/function notificationWebhook(?:Url|Secret|TimeoutMs|MaxAttempts|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function emailWebhook(?:Url|Secret|TimeoutMs|MaxAttempts|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function auditWebhook(?:Url|Secret|TimeoutMs|MaxAttempts|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function backupWebhook(?:Url|Secret|TimeoutMs|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function databaseSyncWebhook(?:Url|Secret|TimeoutMs|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function alertWebhook(?:Url|Secret|TimeoutMs|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function objectStorageWebhook(?:Url|Secret|TimeoutMs|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function collaborationPubSub(?:WebhookUrl|WebhookSecret|TimeoutMs|MaxAttempts|EndpointHash|Provider)\s*\(/);
    expect(facadeSource).not.toMatch(/function selfManagedLocalWebhookSinkEnabled\s*\(/);
    expect(notificationsSource).not.toMatch(/function localWebhookSinkEndpointHash\s*\(/);
    expect(notificationsSource).not.toMatch(/function localWebhookSinkProvider\s*\(/);
    expect(notificationsSource).not.toMatch(/function notificationWebhook(?:Url|Secret|TimeoutMs|MaxAttempts|EndpointHash|Provider)\s*\(/);
    expect(notificationsSource).not.toMatch(/function emailWebhook(?:Url|Secret|TimeoutMs|MaxAttempts|EndpointHash|Provider)\s*\(/);
    expect(notificationsSource).not.toMatch(/function selfManagedLocalWebhookSinkEnabled\s*\(/);
    expect(notificationsSource).not.toMatch(/function positiveIntegerEnv\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function localWebhookSinkEndpointHash\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function localWebhookSinkProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function webhookEndpointHash\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function webhookUrlFromEnv\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function webhookProviderFromEnv\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function selfManagedLocalWebhookSinkEnabled\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function notificationWebhookProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function emailWebhookProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function auditWebhookProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function backupWebhookProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function databaseSyncWebhookProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function alertWebhookProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function objectStorageWebhookProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function collaborationPubSubProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export type SenaEnterpriseWebhookProviderMode\s*=/);
    expect(webhookDeliverySource).toMatch(/export type SenaEnterpriseWebhookQueueProvider\s*=/);
    expect(webhookDeliverySource).toMatch(/export function webhookQueueProvider\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function localWebhookSinkAttempt\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function webhookRetryAt\s*\(/);
    expect(webhookDeliverySource).toMatch(/export function webhookErrorHash\s*\(/);
  });

  it("keeps API routes off the monolithic enterprise facade", () => {
    const routeFiles = collectRouteFiles(path.join(process.cwd(), "app", "api"));
    const facadeImports = routeFiles.filter((file) => (
      /from\s+"@\/lib\/sena\/enterprise";/.test(readFileSync(file, "utf8"))
    ));

    expect(facadeImports).toEqual([]);
  });

  it("keeps notification route parsing and responses inside the notifications module", () => {
    const routeSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "notifications", "route.ts"), "utf8");
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const notificationsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "notifications-delivery.ts"), "utf8");
    const notificationsEmailPath = path.join(process.cwd(), "lib", "sena", "enterprise", "notifications-email.ts");

    expect(existsSync(notificationsEmailPath)).toBe(true);
    const notificationsEmailSource = existsSync(notificationsEmailPath) ? readFileSync(notificationsEmailPath, "utf8") : "";

    expect(routeSource).toContain("@/lib/sena/enterprise/notifications-delivery");
    expect(routeSource).not.toContain("SENA_SCHEMA_VERSIONS");
    expect(routeSource).not.toMatch(/function\s+\w*Param\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseNotifications\s*\(/);
    expect(facadeSource).not.toMatch(/export function markEnterpriseNotificationRead\s*\(/);
    expect(facadeSource).not.toMatch(/export function queueEnterpriseNotification\s*\(/);
    expect(facadeSource).not.toMatch(/export function queueEnterpriseEmail\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseNotifications\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseEmails\s*\(/);
    expect(facadeSource).not.toMatch(/function notifyTeamManagers\s*\(/);
    expect(facadeSource).not.toMatch(/function notifyProjectReaders\s*\(/);
    expect(notificationsSource).toMatch(/export function listEnterpriseNotifications\s*\(/);
    expect(notificationsSource).toMatch(/export function markEnterpriseNotificationRead\s*\(/);
    expect(notificationsSource).toMatch(/export function queueEnterpriseNotification\s*\(/);
    expect(notificationsSource).toMatch(/export async function deliverEnterpriseNotifications\s*\(/);
    expect(notificationsSource).not.toMatch(/export function queueEnterpriseEmail\s*\(/);
    expect(notificationsSource).not.toMatch(/export async function deliverEnterpriseEmails\s*\(/);
    expect(notificationsSource).not.toMatch(/function sealEmailDeliveryPayload\s*\(/);
    expect(notificationsSource).not.toMatch(/function postEmailWebhook\s*\(/);
    expect(notificationsEmailSource).toMatch(/export function queueEnterpriseEmail\s*\(/);
    expect(notificationsEmailSource).toMatch(/export async function deliverEnterpriseEmails\s*\(/);
    expect(notificationsEmailSource).toMatch(/function sealEmailDeliveryPayload\s*\(/);
    expect(notificationsEmailSource).toMatch(/async function postEmailWebhook\s*\(/);
    expect(notificationsSource).toMatch(/export function notifyTeamManagers\s*\(/);
    expect(notificationsSource).toMatch(/export function notifyProjectReaders\s*\(/);
    expect(buildEnterpriseNotificationListResponse).toBeTypeOf("function");
    expect(buildEnterpriseNotificationReadResponse).toBeTypeOf("function");
    expect(buildEnterpriseNotificationDeliveryResponse).toBeTypeOf("function");
  });

  it("owns import, upload, and analysis run type contracts in the import-analysis module", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const importAnalysisSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "import-analysis.ts"), "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseUpload\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseImportRun\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseAnalysisRun\s*=/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseUploads\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseUploadBlobs\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseUploads\s*\(/);
    expect(facadeSource).not.toMatch(/export function verifyEnterpriseUploadStorage\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseImportRun/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseImportRuns/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseAnalysisRun/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseAnalysisRuns/);
    expect(importAnalysisSource).not.toMatch(/export\s+type\s+\{\s*SenaEnterpriseProject\s*\}\s+from\s+"\.\/team-project"/);
    expect(importAnalysisSource).toMatch(/export type SenaEnterpriseUpload\s*=/);
    expect(importAnalysisSource).toMatch(/export type SenaEnterpriseImportRun\s*=/);
    expect(importAnalysisSource).toMatch(/export type SenaEnterpriseAnalysisRun\s*=/);
    expect(importAnalysisSource).toMatch(/export function createEnterpriseUploads\s*\(/);
    expect(importAnalysisSource).toMatch(/export async function deliverEnterpriseUploadBlobs\s*\(/);
    expect(importAnalysisSource).toMatch(/export function listEnterpriseUploads\s*\(/);
    expect(importAnalysisSource).toMatch(/export function verifyEnterpriseUploadStorage\s*\(/);
    expect(importAnalysisSource).toMatch(/export function createEnterpriseImportRun/);
    expect(importAnalysisSource).toMatch(/export function listEnterpriseImportRuns/);
    expect(importAnalysisSource).toMatch(/export function createEnterpriseAnalysisRun/);
    expect(importAnalysisSource).toMatch(/export function listEnterpriseAnalysisRuns/);
  });

  it("separates team membership lifecycle from project and collaboration contracts", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const identityAuthSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "identity-production-evidence.ts"), "utf8");
    const authInvitationsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "auth-invitations.ts"), "utf8");
    const teamMembershipsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "team-memberships.ts");
    const teamMembershipsSource = existsSync(teamMembershipsPath) ? readFileSync(teamMembershipsPath, "utf8") : "";
    const teamCollaborationPath = path.join(process.cwd(), "lib", "sena", "enterprise", "team-collaboration.ts");
    const teamCollaborationSource = existsSync(teamCollaborationPath) ? readFileSync(teamCollaborationPath, "utf8") : "";
    const teamProjectSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "team-project.ts"), "utf8");
    const teamRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "team", "route.ts"), "utf8");
    const teamMembershipsRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "team", "memberships", "route.ts"), "utf8");
    const teamInvitationsRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "team", "invitations", "route.ts"), "utf8");
    const projectCollaborationRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "projects", "[projectId]", "collaboration", "route.ts"), "utf8");
    const projectCollaborationStreamSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "projects", "[projectId]", "collaboration", "stream", "route.ts"), "utf8");
    const validationRunsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "validation-runs.ts"), "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseProject\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseMembership\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseInvitation\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseProjectComment\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseCollaborationPubSubEvent\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseAdjudicationRecord\s*=/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseProjects\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseProject\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseProject\s*\(/);
    expect(facadeSource).not.toMatch(/export function updateEnterpriseProject\s*\(/);
    expect(facadeSource).not.toMatch(/export function restoreEnterpriseProjectRevision\s*\(/);
    expect(facadeSource).not.toMatch(/export function deleteEnterpriseProject\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseTeamState\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseInvitation\s*\(/);
    expect(facadeSource).not.toMatch(/export function acceptEnterpriseInvitation\s*\(/);
    expect(facadeSource).not.toMatch(/export function updateEnterpriseMembership\s*\(/);
    expect(facadeSource).not.toMatch(/export function revokeEnterpriseInvitation\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseProjectCollaboration\s*\(/);
    expect(facadeSource).not.toMatch(/export function touchEnterpriseProjectPresence\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseProjectComment\s*\(/);
    expect(facadeSource).not.toMatch(/export function resolveEnterpriseProjectComment\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseAdjudicationRecord\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseCollaborationPubSub\s*\(/);
    expect(facadeSource).not.toMatch(/function invitationRegisterUrl\s*\(/);
    expect(identityAuthSource).not.toMatch(/acceptEnterpriseInvitation/);
    expect(identityAuthSource).not.toMatch(/createEnterpriseInvitation/);
    expect(identityAuthSource).not.toMatch(/revokeEnterpriseInvitation/);
    expect(identityAuthSource).not.toMatch(/updateEnterpriseMembership/);
    expect(validationRunsSource).not.toMatch(/export\s+\{\s*getEnterpriseProject\s*\}\s+from\s+"\.\/team-project"/);
    expect(teamInvitationsRouteSource).toContain("@/lib/sena/enterprise/auth-invitations");
    expect(teamInvitationsRouteSource).not.toContain("@/lib/sena/enterprise/team-project");
    expect(authInvitationsSource).toMatch(/export type SenaEnterpriseInvitation\s*=/);
    expect(authInvitationsSource).toMatch(/export function createEnterpriseInvitation\s*\(/);
    expect(authInvitationsSource).toMatch(/export function acceptEnterpriseInvitation\s*\(/);
    expect(authInvitationsSource).toMatch(/export function revokeEnterpriseInvitation\s*\(/);
    expect(authInvitationsSource).toMatch(/function invitationRegisterUrl\s*\(/);
    expect(existsSync(teamMembershipsPath)).toBe(true);
    expect(teamRouteSource).toContain("@/lib/sena/enterprise/team-memberships");
    expect(teamRouteSource).not.toContain("@/lib/sena/enterprise/team-project");
    expect(teamMembershipsRouteSource).toContain("@/lib/sena/enterprise/team-memberships");
    expect(teamMembershipsRouteSource).not.toContain("@/lib/sena/enterprise/team-project");
    expect(teamMembershipsSource).toMatch(/export type SenaEnterpriseMembership\s*=/);
    expect(teamMembershipsSource).toMatch(/export function listEnterpriseTeamState\s*\(/);
    expect(teamMembershipsSource).toMatch(/export function updateEnterpriseMembership\s*\(/);
    expect(teamMembershipsSource).toMatch(/function activeTeamManagerCount\s*\(/);
    expect(existsSync(teamCollaborationPath)).toBe(true);
    expect(projectCollaborationRouteSource).toContain("@/lib/sena/enterprise/team-collaboration");
    expect(projectCollaborationRouteSource).not.toContain("@/lib/sena/enterprise/team-project");
    expect(projectCollaborationStreamSource).toContain("@/lib/sena/enterprise/team-collaboration");
    expect(projectCollaborationStreamSource).not.toContain("@/lib/sena/enterprise/team-project");
    expect(teamCollaborationSource).toMatch(/export type SenaEnterpriseProjectComment\s*=/);
    expect(teamCollaborationSource).toMatch(/export type SenaEnterpriseProjectPresence\s*=/);
    expect(teamCollaborationSource).toMatch(/export type SenaEnterpriseCollaborationPubSubEvent\s*=/);
    expect(teamCollaborationSource).toMatch(/export type SenaEnterpriseAdjudicationRecord\s*=/);
    expect(teamCollaborationSource).toMatch(/export async function deliverEnterpriseCollaborationPubSub\s*\(/);
    expect(teamCollaborationSource).toMatch(/export function listEnterpriseProjectCollaboration\s*\(/);
    expect(teamCollaborationSource).toMatch(/export function touchEnterpriseProjectPresence\s*\(/);
    expect(teamCollaborationSource).toMatch(/export function createEnterpriseProjectComment\s*\(/);
    expect(teamCollaborationSource).toMatch(/export function resolveEnterpriseProjectComment\s*\(/);
    expect(teamCollaborationSource).toMatch(/export function createEnterpriseAdjudicationRecord\s*\(/);
    expect(teamCollaborationSource).toMatch(/function queueEnterpriseCollaborationEvent\s*\(/);
    expect(teamCollaborationSource).toMatch(/function postCollaborationPubSubWebhook\s*\(/);
    expect(teamProjectSource).toMatch(/export type SenaEnterpriseProject\s*=/);
    expect(teamProjectSource).not.toMatch(/export type SenaEnterpriseMembership\s*=/);
    expect(teamProjectSource).not.toMatch(/export type SenaEnterpriseInvitation\s*=/);
    expect(teamProjectSource).not.toMatch(/export type SenaEnterpriseProjectComment\s*=/);
    expect(teamProjectSource).not.toMatch(/export type SenaEnterpriseProjectPresence\s*=/);
    expect(teamProjectSource).not.toMatch(/export type SenaEnterpriseCollaborationPubSubEvent\s*=/);
    expect(teamProjectSource).not.toMatch(/export type SenaEnterpriseAdjudicationRecord\s*=/);
    expect(teamProjectSource).toMatch(/export function listEnterpriseProjects\s*\(/);
    expect(teamProjectSource).toMatch(/export function createEnterpriseProject\s*\(/);
    expect(teamProjectSource).toMatch(/export function getEnterpriseProject\s*\(/);
    expect(teamProjectSource).toMatch(/export function updateEnterpriseProject\s*\(/);
    expect(teamProjectSource).toMatch(/export function restoreEnterpriseProjectRevision\s*\(/);
    expect(teamProjectSource).toMatch(/export function deleteEnterpriseProject\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function listEnterpriseTeamState\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function createEnterpriseInvitation\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function acceptEnterpriseInvitation\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function updateEnterpriseMembership\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function revokeEnterpriseInvitation\s*\(/);
    expect(teamProjectSource).not.toMatch(/function activeTeamManagerCount\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function listEnterpriseProjectCollaboration\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function touchEnterpriseProjectPresence\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function createEnterpriseProjectComment\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function resolveEnterpriseProjectComment\s*\(/);
    expect(teamProjectSource).not.toMatch(/export function createEnterpriseAdjudicationRecord\s*\(/);
    expect(teamProjectSource).not.toMatch(/export async function deliverEnterpriseCollaborationPubSub\s*\(/);
    expect(teamProjectSource).not.toMatch(/function queueEnterpriseCollaborationEvent\s*\(/);
    expect(teamProjectSource).not.toMatch(/function postCollaborationPubSubWebhook\s*\(/);
    expect(teamProjectSource).not.toMatch(/function invitationRegisterUrl\s*\(/);
  });

  it("owns session, MFA, and password-reset type contracts in focused auth modules", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const identityAuthSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "identity-production-evidence.ts"), "utf8");
    const authConfigPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-config.ts");
    const authInvitationsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-invitations.ts");
    const authLoginPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-login.ts");
    const authMfaPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-mfa.ts");
    const authPasswordPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-password.ts");
    const authPasswordResetPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-password-reset.ts");
    const authRegistrationPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-registration.ts");
    const authRuntimePath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-runtime.ts");
    const authSecurityPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-security.ts");
    const authSessionPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-session.ts");
    const authSsoPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-sso.ts");
    const identityReadinessPath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-readiness.ts");
    const identityEvidenceUrlPolicyPath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-evidence-url-policy.ts");
    const identityRequestPacketPath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-request-packet.ts");
    const identitySubmissionGatesPath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-submission-gates.ts");
    const identityReceiptArchivePath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-receipt-archive.ts");
    const identityActionPlanPath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-action-plan.ts");
    const opsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-governance.ts"), "utf8");

    expect(existsSync(authConfigPath)).toBe(true);
    expect(existsSync(authInvitationsPath)).toBe(true);
    expect(existsSync(authLoginPath)).toBe(true);
    expect(existsSync(authMfaPath)).toBe(true);
    expect(existsSync(authPasswordPath)).toBe(true);
    expect(existsSync(authPasswordResetPath)).toBe(true);
    expect(existsSync(authRegistrationPath)).toBe(true);
    expect(existsSync(authRuntimePath)).toBe(false);
    expect(existsSync(authSecurityPath)).toBe(true);
    expect(existsSync(authSessionPath)).toBe(true);
    expect(existsSync(authSsoPath)).toBe(true);
    expect(existsSync(identityReadinessPath)).toBe(true);
    expect(existsSync(identityEvidenceUrlPolicyPath)).toBe(true);
    expect(existsSync(identityRequestPacketPath)).toBe(true);
    expect(existsSync(identitySubmissionGatesPath)).toBe(true);
    expect(existsSync(identityReceiptArchivePath)).toBe(true);
    expect(existsSync(identityActionPlanPath)).toBe(true);
    const authConfigSource = readFileSync(authConfigPath, "utf8");
    const authInvitationsSource = readFileSync(authInvitationsPath, "utf8");
    const authLoginSource = readFileSync(authLoginPath, "utf8");
    const authMfaSource = readFileSync(authMfaPath, "utf8");
    const authPasswordSource = readFileSync(authPasswordPath, "utf8");
    const authPasswordResetSource = readFileSync(authPasswordResetPath, "utf8");
    const authRegistrationSource = readFileSync(authRegistrationPath, "utf8");
    const authSecuritySource = readFileSync(authSecurityPath, "utf8");
    const authSessionSource = readFileSync(authSessionPath, "utf8");
    const authSsoSource = readFileSync(authSsoPath, "utf8");
    const identityReadinessSource = readFileSync(identityReadinessPath, "utf8");
    const identityEvidenceUrlPolicySource = readFileSync(identityEvidenceUrlPolicyPath, "utf8");
    const identityRequestPacketSource = readFileSync(identityRequestPacketPath, "utf8");
    const identitySubmissionGatesSource = readFileSync(identitySubmissionGatesPath, "utf8");
    const identityReceiptArchiveSource = readFileSync(identityReceiptArchivePath, "utf8");
    const identityActionPlanSource = readFileSync(identityActionPlanPath, "utf8");
    const opsReleaseGateSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-release-gate.ts"), "utf8");
    const opsGoLiveSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-go-live.ts"), "utf8");
    const opsCapabilityAuditSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-capability-audit.ts"), "utf8");
    const opsPlatformDecisionsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-platform-decisions.ts"), "utf8");
    const opsDeploymentSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-deployment.ts"), "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSessionProfile\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseCsrfToken\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseMfaStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseLoginResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePasswordResetRequestResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSsoProviderStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflight\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflightResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityTechnicalEvidenceBinding\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityRotationFreshness\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityEvidenceUrlHostBinding\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityProductionDecisionId\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityReceiptArchiveMissingInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityPlatformDecisionRequestPacket\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentitySubmissionVerifier\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityCutoverChecklist\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityReceiptArchiveManifest\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityInstitutionActionLaneId\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityInstitutionActionOwnerRole\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentitySubmissionMatrix\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityOwnerRunbooks\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityInstitutionActionPlan\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseIdentityProductionEvidence\s*=/);
    expect(facadeSource).not.toMatch(/const identityProductionDecisionIds\s*:/);
    expect(facadeSource).not.toMatch(/function isIdentityProductionDecisionId\s*\(/);
    expect(facadeSource).not.toMatch(/const identityReceiptArchiveMissingInputOrder\s*:/);
    expect(facadeSource).not.toMatch(/const identityPlatformDecisionSubmissionRequiredBodyFields\s*:/);
    expect(facadeSource).not.toMatch(/const identityProductionEvidenceSubmissionBodyFields\s*:/);
    expect(facadeSource).not.toMatch(/const identityStableSubmissionDigestInputFields\s*=/);
    expect(facadeSource).not.toMatch(/const identityPlatformDecisionResponseAuditHeaders\s*:/);
    expect(facadeSource).not.toMatch(/const identityPlatformDecisionReceiptArchiveBodyPaths\s*:/);
    expect(facadeSource).not.toMatch(/const identityPlatformDecisionReceiptArchivePolicy\s*:/);
    expect(facadeSource).not.toMatch(/function productionSecretStrength\s*\(/);
    expect(facadeSource).not.toMatch(/function provisioningTokenProductionEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function identitySecretVersionBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function secretStoreReferenceBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function identitySecretRotationCadenceBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function idpTenantBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function identityLifecycleOwnerModeBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityTechnicalEvidenceBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function identityTechnicalEvidenceBindingStatus\s*\(/);
    expect(facadeSource).not.toMatch(/function identityPlatformEvidenceBindingStatus\s*\(/);
    expect(facadeSource).not.toMatch(/function identityTechnicalReadinessStatus\s*\(/);
    expect(facadeSource).not.toMatch(/function identityTechnicalEvidenceBindingEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function configuredSenaAppOrigin\s*\(/);
    expect(facadeSource).not.toMatch(/function isIdentityProductionEvidenceEnvironment\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceEnvironment\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceOwnerRole\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceVerifiedAt\s*\(/);
    expect(facadeSource).not.toMatch(/function normalizeIdentityProductionEvidenceArtifactDigest\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceNotes\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceFreeText\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityEvidenceUrlHostBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function identityEvidenceUrlPolicy\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceUrlSecurity\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceUrl\s*\(/);
    expect(facadeSource).not.toMatch(/function requireIdentityProductionEvidenceAppOrigin\s*\(/);
    expect(facadeSource).not.toMatch(/const platformDecisionProductionEvidenceIdsByDecision\s*:/);
    expect(facadeSource).not.toMatch(/const identityProductionOwnerRolePolicy\s*:/);
    expect(facadeSource).not.toMatch(/const genericIdentityProductionOwnerNames\s*=/);
    expect(facadeSource).not.toMatch(/function identityEvidenceAllowedHostConfig\s*\(/);
    expect(facadeSource).not.toMatch(/const identityRotationFreshnessPolicy\s*=/);
    expect(facadeSource).not.toMatch(/const identityRotationFreshnessSpecs\s*:/);
    expect(facadeSource).not.toMatch(/function normalizedProductionEvidenceIds\s*\(/);
    expect(facadeSource).not.toMatch(/function rotationFreshnessCheck\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityRotationFreshness\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionProductionEvidenceFresh\s*\(/);
    expect(facadeSource).not.toMatch(/function identityRequestPacketPolicyAnchor\s*\(/);
    expect(facadeSource).not.toMatch(/function identityRequestPacketPolicyHash\s*\(/);
    expect(facadeSource).not.toMatch(/function normalizeSubmittedIdentityRequestPacketPolicyHash\s*\(/);
    expect(facadeSource).not.toMatch(/function identityRequestPacketPolicyBinding\s*\(/);
    expect(facadeSource).not.toMatch(/function identityProductionEvidenceArtifactCompletenessStatus\s*\(/);
    expect(facadeSource).not.toMatch(/function identityProductionArtifactDigestRequiredEvidenceIds\s*\(/);
    expect(facadeSource).not.toMatch(/function identityProductionEvidenceArtifactDigestSubmissionPolicy\s*\(/);
    expect(facadeSource).not.toMatch(/function identityProductionEvidenceArtifactDigestTemplatePolicy\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityPlatformDecisionRequestPacket\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentitySubmissionVerifier\s*\(/);
    expect(facadeSource).not.toMatch(/function summarizeIdentityReceiptArchiveMissingInputs\s*\(/);
    expect(facadeSource).not.toMatch(/function formatIdentityReceiptArchiveMissingInputCounts\s*\(/);
    expect(facadeSource).not.toMatch(/const identityReceiptArchiveArtifactCompletenessOrder\s*=/);
    expect(facadeSource).not.toMatch(/function summarizeIdentityReceiptArchiveArtifactCompleteness\s*\(/);
    expect(facadeSource).not.toMatch(/function formatIdentityReceiptArchiveArtifactCompletenessCounts\s*\(/);
    expect(facadeSource).not.toMatch(/function identityReceiptArchiveArtifactCompletenessReady\s*\(/);
    expect(facadeSource).not.toMatch(/function latestReleaseGateIdentityReceiptArchiveArtifactCompleteness\s*\(/);
    expect(facadeSource).not.toMatch(/function latestReleaseGateIdentityReceiptArchiveEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function identityReceiptArchiveDecisionAuditSummaries\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityReceiptArchiveManifest\s*\(/);
    expect(facadeSource).not.toMatch(/const identityCutoverChecklistSpecs\s*:/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityCutoverChecklist\s*\(/);
    expect(facadeSource).not.toMatch(/const identityInstitutionActionLaneSpecs\s*:/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentitySubmissionMatrix\s*\(/);
    expect(facadeSource).not.toMatch(/const identityOwnerRunbookPreflightSpecs\s*:/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityOwnerRunbooks\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityInstitutionActionPlan\s*\(/);
    expect(facadeSource).not.toMatch(/function identityProductionEvidenceBindingDigest\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseIdentityProductionEvidenceDossier\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseIdentityProductionEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export\s+type\s+\{\s*SenaEnterpriseIdentityProductionEvidence\s*\}\s+from\s+"\.\/identity-production-evidence"/);
    expect(opsSource).not.toMatch(/export\s+\{\s*getEnterpriseIdentityProductionEvidence\s*\}/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseSessionProfile\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseCsrfToken\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseMfaStatus\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseLoginResult\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterprisePasswordResetRequestResult\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseSsoProviderStatus\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflight\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflightResult\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSessionProfile\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSession\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSessionSummary\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSessionList\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSessionRevocation\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseCsrfToken\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSessionContext\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseAuthLockout\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseApiRateLimit\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseSessionProfile\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseSession\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseAuthLockout\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseApiRateLimit\s*=/);
    expect(authSessionSource).toMatch(/export type SenaEnterpriseSessionProfile\s*=/);
    expect(authSessionSource).toMatch(/export type SenaEnterpriseSession\s*=/);
    expect(authSessionSource).toMatch(/export type SenaEnterpriseSessionSummary\s*=/);
    expect(authSessionSource).toMatch(/export type SenaEnterpriseSessionList\s*=/);
    expect(authSessionSource).toMatch(/export type SenaEnterpriseSessionRevocation\s*=/);
    expect(authSessionSource).toMatch(/export type SenaEnterpriseCsrfToken\s*=/);
    expect(authSessionSource).toMatch(/export type SenaEnterpriseSessionContext\s*=/);
    expect(authSecuritySource).toMatch(/export type SenaEnterpriseAuthLockout\s*=/);
    expect(authSecuritySource).toMatch(/export type SenaEnterpriseApiRateLimit\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaSealedSecret\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaFactor\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaSetup\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaChallenge\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaStatus\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaSetupResult\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaEnableResult\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseMfaDisableResult\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaSealedSecret\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaFactor\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaSetup\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaChallenge\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaStatus\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaSetupResult\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaEnableResult\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseMfaDisableResult\s*=/);
    expect(authMfaSource).toMatch(/export type SenaEnterpriseLoginMfaChallenge\s*=/);
    expect(authLoginSource).toMatch(/export type SenaEnterpriseLoginResult\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseLoginResult\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterprisePasswordResetRequest\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterprisePasswordResetRequestResult\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterprisePasswordResetCompleteResult\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterprisePasswordResetRequest\s*=/);
    expect(authPasswordResetSource).toMatch(/export type SenaEnterprisePasswordResetRequest\s*=/);
    expect(authPasswordResetSource).toMatch(/export type SenaEnterprisePasswordResetRequestResult\s*=/);
    expect(authPasswordResetSource).toMatch(/export type SenaEnterprisePasswordResetCompleteResult\s*=/);
    expect(authPasswordSource).toMatch(/export const enterprisePasswordPolicy\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSsoProviderStatus\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflight\s*=/);
    expect(authLoginSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflightResult\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseSsoProviderStatus\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflight\s*=/);
    expect(authRegistrationSource).not.toMatch(/export type SenaEnterpriseSsoProviderPreflightResult\s*=/);
    expect(authSsoSource).toMatch(/export type SenaEnterpriseSsoProviderStatus\s*=/);
    expect(authSsoSource).toMatch(/export type SenaEnterpriseSsoProviderPreflight\s*=/);
    expect(authSsoSource).toMatch(/export type SenaEnterpriseSsoProviderPreflightResult\s*=/);
    expect(authInvitationsSource).not.toMatch(/export type SenaEnterpriseLoginResult\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityTechnicalEvidenceBinding\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityRotationFreshness\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityEvidenceUrlHostBinding\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityProductionDecisionId\s*=/);
    expect(identityReadinessSource).toMatch(/export type SenaEnterpriseIdentityTechnicalEvidenceBinding\s*=/);
    expect(identityReadinessSource).toMatch(/export type SenaEnterpriseIdentityRotationFreshness\s*=/);
    expect(identityReadinessSource).not.toMatch(/export type SenaEnterpriseIdentityEvidenceUrlHostBinding\s*=/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export type SenaEnterpriseIdentityEvidenceUrlHostBinding\s*=/);
    expect(identityReadinessSource).toMatch(/export type SenaEnterpriseIdentityProductionDecisionId\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityPlatformDecisionRequestPacket\s*=/);
    expect(identityRequestPacketSource).toMatch(/export type SenaEnterpriseIdentityPlatformDecisionRequestPacket\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentitySubmissionVerifier\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityCutoverChecklist\s*=/);
    expect(identitySubmissionGatesSource).toMatch(/export type SenaEnterpriseIdentitySubmissionVerifier\s*=/);
    expect(identitySubmissionGatesSource).toMatch(/export type SenaEnterpriseIdentityCutoverChecklist\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityInstitutionActionLaneId\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityInstitutionActionOwnerRole\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentitySubmissionMatrix\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityOwnerRunbooks\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityInstitutionActionPlan\s*=/);
    expect(identityActionPlanSource).toMatch(/export type SenaEnterpriseIdentityInstitutionActionLaneId\s*=/);
    expect(identityActionPlanSource).toMatch(/export type SenaEnterpriseIdentityInstitutionActionOwnerRole\s*=/);
    expect(identityActionPlanSource).toMatch(/export type SenaEnterpriseIdentitySubmissionMatrix\s*=/);
    expect(identityActionPlanSource).toMatch(/export type SenaEnterpriseIdentityOwnerRunbooks\s*=/);
    expect(identityActionPlanSource).toMatch(/export type SenaEnterpriseIdentityInstitutionActionPlan\s*=/);
    expect(identityAuthSource).toMatch(/export type SenaEnterpriseIdentityProductionEvidence\s*=/);
    expect(identityAuthSource).not.toMatch(/export const identityProductionDecisionIds\s*:/);
    expect(identityAuthSource).not.toMatch(/export function isIdentityProductionDecisionId\s*\(/);
    expect(identityReadinessSource).toMatch(/export const identityProductionDecisionIds\s*:/);
    expect(identityReadinessSource).toMatch(/export function isIdentityProductionDecisionId\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const identityPlatformDecisionSubmissionRequiredBodyFields\s*:/);
    expect(identityAuthSource).not.toMatch(/export const identityProductionEvidenceSubmissionBodyFields\s*:/);
    expect(identityAuthSource).not.toMatch(/export const identityStableSubmissionDigestInputFields\s*=/);
    expect(identityAuthSource).not.toMatch(/export const identityPlatformDecisionResponseAuditHeaders\s*:/);
    expect(identityAuthSource).not.toMatch(/export const identityPlatformDecisionReceiptArchiveBodyPaths\s*:/);
    expect(identityAuthSource).not.toMatch(/export const identityPlatformDecisionReceiptArchivePolicy\s*:/);
    expect(identityRequestPacketSource).toMatch(/export const identityPlatformDecisionSubmissionRequiredBodyFields\s*:/);
    expect(identityRequestPacketSource).toMatch(/export const identityProductionEvidenceSubmissionBodyFields\s*:/);
    expect(identityRequestPacketSource).toMatch(/export const identityStableSubmissionDigestInputFields\s*=/);
    expect(identityRequestPacketSource).toMatch(/export const identityPlatformDecisionResponseAuditHeaders\s*:/);
    expect(identityRequestPacketSource).toMatch(/export const identityPlatformDecisionReceiptArchiveBodyPaths\s*:/);
    expect(identityRequestPacketSource).toMatch(/export const identityPlatformDecisionReceiptArchivePolicy\s*:/);
    expect(identityAuthSource).not.toMatch(/export function productionSecretStrength\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function provisioningTokenProductionEvidence\s*\(/);
    expect(authLoginSource).not.toMatch(/export function productionSecretStrength\s*\(/);
    expect(authLoginSource).not.toMatch(/export function provisioningTokenProductionEvidence\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function productionSecretStrength\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function provisioningTokenProductionEvidence\s*\(/);
    expect(authConfigSource).toMatch(/export function productionSecretStrength\s*\(/);
    expect(authConfigSource).toMatch(/export function provisioningTokenProductionEvidence\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identitySecretVersionBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function secretStoreReferenceBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function secretStoreReferenceReady\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identitySecretRotationCadenceBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identitySecretRotationCadenceReady\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identitySecretRotationMaxAgeDays\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identitySecretRotationWarningDays\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function idpTenantBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function idpTenantBindingReady\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityLifecycleOwnerModeBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityLifecycleOwnerModeReady\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityTechnicalEvidenceBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityTechnicalEvidenceBindingStatus\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityPlatformEvidenceBindingStatus\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityTechnicalReadinessStatus\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityTechnicalEvidenceBindingEvidence\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identitySecretVersionBinding\s*\(/);
    expect(identityReadinessSource).toMatch(/export function secretStoreReferenceBinding\s*\(/);
    expect(identityReadinessSource).toMatch(/export function secretStoreReferenceReady\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identitySecretRotationCadenceBinding\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identitySecretRotationCadenceReady\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identitySecretRotationMaxAgeDays\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identitySecretRotationWarningDays\s*\(/);
    expect(identityReadinessSource).toMatch(/export function idpTenantBinding\s*\(/);
    expect(identityReadinessSource).toMatch(/export function idpTenantBindingReady\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identityLifecycleOwnerModeBinding\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identityLifecycleOwnerModeReady\s*\(/);
    expect(identityReadinessSource).toMatch(/export function buildEnterpriseIdentityTechnicalEvidenceBinding\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identityTechnicalEvidenceBindingStatus\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identityPlatformEvidenceBindingStatus\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identityTechnicalReadinessStatus\s*\(/);
    expect(identityReadinessSource).toMatch(/export function identityTechnicalEvidenceBindingEvidence\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function configuredSenaAppOrigin\s*\(/);
    expect(authLoginSource).not.toMatch(/export function configuredSenaAppOrigin\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function configuredSenaAppOrigin\s*\(/);
    expect(authConfigSource).toMatch(/export function configuredSenaAppOrigin\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function isIdentityProductionEvidenceEnvironment\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceEnvironment\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceOwnerRole\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceVerifiedAt\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function normalizeIdentityProductionEvidenceArtifactDigest\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceNotes\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceFreeText\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function isIdentityProductionEvidenceEnvironment\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceEnvironment\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceOwnerRole\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceVerifiedAt\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function normalizeIdentityProductionEvidenceArtifactDigest\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceNotes\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceFreeText\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityEvidenceUrlHostBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceUrlPolicy\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceUrlSecurity\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceUrl\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireIdentityProductionEvidenceAppOrigin\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceUrlSecurity\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceUrl\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function requireIdentityProductionEvidenceAppOrigin\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceUrlPolicy\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function buildEnterpriseIdentityEvidenceUrlHostBinding\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceUrlPolicy\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function buildEnterpriseIdentityEvidenceUrlHostBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const platformDecisionProductionEvidenceIdsByDecision\s*:/);
    expect(identityReadinessSource).toMatch(/export const platformDecisionProductionEvidenceIdsByDecision\s*:/);
    expect(identityAuthSource).not.toMatch(/export const identityProductionOwnerRolePolicy\s*:/);
    expect(identityAuthSource).not.toMatch(/export const genericIdentityProductionOwnerNames\s*=/);
    expect(identityRequestPacketSource).toMatch(/export const identityProductionOwnerRolePolicy\s*:/);
    expect(identityRequestPacketSource).toMatch(/export const genericIdentityProductionOwnerNames\s*=/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceAllowedHostConfig\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceUrlHostHashes\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceUrlHostBindingStatus\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceUrlHostBindingEvidence\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceUrlHostBindingCurrent\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceAllowedHostEvidence\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceUrlRejectedSensitiveQueryParameters\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionEvidenceNotesPolicy\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionEvidenceFreeTextPolicy\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionEvidenceNoteSecretCarriers\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionEvidenceFreeTextSecretCarriers\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityEvidenceUrlHasSpecificEvidencePath\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const identityRotationFreshnessPolicy\s*=/);
    expect(identityAuthSource).not.toMatch(/export const identityRotationFreshnessSpecs\s*:/);
    expect(identityAuthSource).not.toMatch(/export function normalizedProductionEvidenceIds\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function rotationFreshnessCheck\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityRotationFreshness\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function platformDecisionProductionEvidenceFresh\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceAllowedHostConfig\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceUrlHostHashes\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceUrlHostBindingStatus\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceUrlHostBindingEvidence\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceUrlHostBindingCurrent\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceAllowedHostEvidence\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceUrlRejectedSensitiveQueryParameters\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityProductionEvidenceNotesPolicy\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityProductionEvidenceFreeTextPolicy\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityProductionEvidenceNoteSecretCarriers\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityProductionEvidenceFreeTextSecretCarriers\s*\(/);
    expect(identityReadinessSource).not.toMatch(/export function identityEvidenceUrlHasSpecificEvidencePath\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceAllowedHostConfig\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceUrlHostHashes\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceUrlHostBindingStatus\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceUrlHostBindingEvidence\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceUrlHostBindingCurrent\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceAllowedHostEvidence\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceUrlRejectedSensitiveQueryParameters\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityProductionEvidenceNotesPolicy\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityProductionEvidenceFreeTextPolicy\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityProductionEvidenceNoteSecretCarriers\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityProductionEvidenceFreeTextSecretCarriers\s*\(/);
    expect(identityEvidenceUrlPolicySource).toMatch(/export function identityEvidenceUrlHasSpecificEvidencePath\s*\(/);
    expect(identityReadinessSource).toMatch(/export const identityRotationFreshnessPolicy\s*=/);
    expect(identityReadinessSource).toMatch(/export const identityRotationFreshnessSpecs\s*:/);
    expect(identityReadinessSource).toMatch(/export function normalizedProductionEvidenceIds\s*\(/);
    expect(identityReadinessSource).toMatch(/export function rotationFreshnessCheck\s*\(/);
    expect(identityReadinessSource).toMatch(/export function buildEnterpriseIdentityRotationFreshness\s*\(/);
    expect(identityReadinessSource).toMatch(/export function platformDecisionProductionEvidenceFresh\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityRequestPacketPolicyAnchor\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityRequestPacketPolicyHash\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function normalizeSubmittedIdentityRequestPacketPolicyHash\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityRequestPacketPolicyBinding\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionEvidenceArtifactCompletenessStatus\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionArtifactDigestRequiredEvidenceIds\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionEvidenceArtifactDigestSubmissionPolicy\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityProductionEvidenceArtifactDigestTemplatePolicy\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityPlatformDecisionRequestPacket\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function identityRequestPacketPolicyAnchor\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function identityRequestPacketPolicyHash\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function normalizeSubmittedIdentityRequestPacketPolicyHash\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function identityRequestPacketPolicyBinding\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function identityProductionEvidenceArtifactCompletenessStatus\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function identityProductionArtifactDigestRequiredEvidenceIds\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function identityProductionEvidenceArtifactDigestSubmissionPolicy\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function identityProductionEvidenceArtifactDigestTemplatePolicy\s*\(/);
    expect(identityRequestPacketSource).toMatch(/export function buildEnterpriseIdentityPlatformDecisionRequestPacket\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentitySubmissionVerifier\s*\(/);
    expect(identitySubmissionGatesSource).toMatch(/export function buildEnterpriseIdentitySubmissionVerifier\s*\(/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityReceiptArchiveMissingInput\s*=/);
    expect(identityAuthSource).not.toMatch(/export type SenaEnterpriseIdentityReceiptArchiveManifest\s*=/);
    expect(identityAuthSource).not.toMatch(/export const identityReceiptArchiveMissingInputOrder\s*:/);
    expect(identityAuthSource).not.toMatch(/export function summarizeIdentityReceiptArchiveMissingInputs\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function formatIdentityReceiptArchiveMissingInputCounts\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const identityReceiptArchiveArtifactCompletenessOrder\s*=/);
    expect(identityAuthSource).not.toMatch(/export function summarizeIdentityReceiptArchiveArtifactCompleteness\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function formatIdentityReceiptArchiveArtifactCompletenessCounts\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityReceiptArchiveArtifactCompletenessReady\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function latestReleaseGateIdentityReceiptArchiveArtifactCompleteness\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function latestReleaseGateIdentityReceiptArchiveEvidence\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function identityReceiptArchiveDecisionAuditSummaries\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityReceiptArchiveManifest\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export type SenaEnterpriseIdentityReceiptArchiveMissingInput\s*=/);
    expect(identityReceiptArchiveSource).toMatch(/export type SenaEnterpriseIdentityReceiptArchiveManifest\s*=/);
    expect(identityReceiptArchiveSource).toMatch(/export const identityReceiptArchiveMissingInputOrder\s*:/);
    expect(identityReceiptArchiveSource).toMatch(/export function summarizeIdentityReceiptArchiveMissingInputs\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export function formatIdentityReceiptArchiveMissingInputCounts\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export const identityReceiptArchiveArtifactCompletenessOrder\s*=/);
    expect(identityReceiptArchiveSource).toMatch(/export function summarizeIdentityReceiptArchiveArtifactCompleteness\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export function formatIdentityReceiptArchiveArtifactCompletenessCounts\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export function identityReceiptArchiveArtifactCompletenessReady\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export function latestReleaseGateIdentityReceiptArchiveArtifactCompleteness\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export function latestReleaseGateIdentityReceiptArchiveEvidence\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export function identityReceiptArchiveDecisionAuditSummaries\s*\(/);
    expect(identityReceiptArchiveSource).toMatch(/export function buildEnterpriseIdentityReceiptArchiveManifest\s*\(/);
    expect(opsReleaseGateSource).toMatch(/from "\.\/identity-receipt-archive"/);
    expect(opsGoLiveSource).toMatch(/from "\.\/identity-receipt-archive"/);
    expect(opsCapabilityAuditSource).toMatch(/from "\.\/identity-receipt-archive"/);
    expect(identityAuthSource).not.toMatch(/export const identityCutoverChecklistSpecs\s*:/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityCutoverChecklist\s*\(/);
    expect(identitySubmissionGatesSource).toMatch(/export const identityCutoverChecklistSpecs\s*:/);
    expect(identitySubmissionGatesSource).toMatch(/export function buildEnterpriseIdentityCutoverChecklist\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const identityInstitutionActionLaneSpecs\s*:/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentitySubmissionMatrix\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const identityOwnerRunbookPreflightSpecs\s*:/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityOwnerRunbooks\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function buildEnterpriseIdentityInstitutionActionPlan\s*\(/);
    expect(identityActionPlanSource).toMatch(/export const identityInstitutionActionLaneSpecs\s*:/);
    expect(identityActionPlanSource).toMatch(/export function buildEnterpriseIdentitySubmissionMatrix\s*\(/);
    expect(identityActionPlanSource).toMatch(/export const identityOwnerRunbookPreflightSpecs\s*:/);
    expect(identityActionPlanSource).toMatch(/export function buildEnterpriseIdentityOwnerRunbooks\s*\(/);
    expect(identityActionPlanSource).toMatch(/export function buildEnterpriseIdentityInstitutionActionPlan\s*\(/);
    expect(identityAuthSource).toMatch(/from "\.\/identity-action-plan"/);
    expect(identityAuthSource).toMatch(/from "\.\/identity-readiness"/);
    expect(identityAuthSource).toMatch(/from "\.\/identity-request-packet"/);
    expect(identityReceiptArchiveSource).toMatch(/from "\.\/identity-request-packet"/);
    expect(identityActionPlanSource).toMatch(/from "\.\/identity-request-packet"/);
    expect(opsReleaseGateSource).toMatch(/from "\.\/identity-request-packet"/);
    expect(opsPlatformDecisionsSource).toMatch(/from "\.\/identity-request-packet"/);
    expect(identityAuthSource).toMatch(/from "\.\/identity-submission-gates"/);
    expect(identityActionPlanSource).toMatch(/from "\.\/identity-submission-gates"/);
    expect(opsReleaseGateSource).toMatch(/from "\.\/identity-submission-gates"/);
    expect(identityReceiptArchiveSource).toMatch(/from "\.\/identity-readiness"/);
    expect(identityActionPlanSource).toMatch(/from "\.\/identity-readiness"/);
    expect(opsReleaseGateSource).toMatch(/from "\.\/identity-readiness"/);
    expect(opsPlatformDecisionsSource).toMatch(/from "\.\/identity-readiness"/);
    expect(opsDeploymentSource).toMatch(/from "\.\/identity-readiness"/);
    expect(opsCapabilityAuditSource).toMatch(/from "\.\/identity-readiness"/);
    expect(opsReleaseGateSource).toMatch(/from "\.\/identity-action-plan"/);
    expect(identityAuthSource).toMatch(/export function buildEnterpriseIdentityProductionEvidenceDossier\s*\(/);
    expect(identityAuthSource).toMatch(/export function getEnterpriseIdentityProductionEvidence\s*\(/);
  });

  it("owns session, MFA, and CSRF runtime helpers in focused auth modules", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const identityAuthSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "identity-production-evidence.ts"), "utf8");
    const authConfigPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-config.ts");
    const authInvitationsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-invitations.ts");
    const authLoginPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-login.ts");
    const authMfaPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-mfa.ts");
    const authPasswordPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-password.ts");
    const authPasswordResetPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-password-reset.ts");
    const authRegistrationPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-registration.ts");
    const authRuntimePath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-runtime.ts");
    const authSecurityPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-security.ts");
    const authSessionPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-session.ts");
    const authSsoPath = path.join(process.cwd(), "lib", "sena", "enterprise", "auth-sso.ts");

    expect(existsSync(authConfigPath)).toBe(true);
    expect(existsSync(authInvitationsPath)).toBe(true);
    expect(existsSync(authLoginPath)).toBe(true);
    expect(existsSync(authMfaPath)).toBe(true);
    expect(existsSync(authPasswordPath)).toBe(true);
    expect(existsSync(authPasswordResetPath)).toBe(true);
    expect(existsSync(authRegistrationPath)).toBe(true);
    expect(existsSync(authRuntimePath)).toBe(false);
    expect(existsSync(authSecurityPath)).toBe(true);
    expect(existsSync(authSessionPath)).toBe(true);
    expect(existsSync(authSsoPath)).toBe(true);
    const authConfigSource = readFileSync(authConfigPath, "utf8");
    const authInvitationsSource = readFileSync(authInvitationsPath, "utf8");
    const authLoginSource = readFileSync(authLoginPath, "utf8");
    const authMfaSource = readFileSync(authMfaPath, "utf8");
    const authPasswordSource = readFileSync(authPasswordPath, "utf8");
    const authPasswordResetSource = readFileSync(authPasswordResetPath, "utf8");
    const authRegistrationSource = readFileSync(authRegistrationPath, "utf8");
    const authSecuritySource = readFileSync(authSecurityPath, "utf8");
    const authSessionSource = readFileSync(authSessionPath, "utf8");
    const authSsoSource = readFileSync(authSsoPath, "utf8");
    const apiHelpersSource = readFileSync(path.join(process.cwd(), "lib", "sena", "api-helpers.ts"), "utf8");
    const opsGovernanceSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-governance.ts"), "utf8");
    const opsStatusSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-status.ts"), "utf8");
    const passwordResetRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "auth", "password-reset", "route.ts"), "utf8");

    expect(facadeSource).not.toMatch(/export const senaSessionCookieName\s*=/);
    expect(facadeSource).not.toMatch(/export const senaCsrfHeaderName\s*=/);
    expect(facadeSource).not.toMatch(/export function sanitizeEnterpriseContext\s*\(/);
    expect(facadeSource).not.toMatch(/export function logoutEnterpriseSession\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseSessions\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseCsrfToken\s*\(/);
    expect(facadeSource).not.toMatch(/export function verifyEnterpriseCsrfToken\s*\(/);
    expect(facadeSource).not.toMatch(/export function revokeEnterpriseSessions\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseSession\s*\(/);
    expect(facadeSource).not.toMatch(/export function requireEnterpriseSession\s*\(/);
    expect(facadeSource).not.toMatch(/export function enforceEnterpriseApiRateLimit\s*\(/);
    expect(facadeSource).not.toMatch(/export function registerEnterpriseUser\s*\(/);
    expect(facadeSource).not.toMatch(/export function loginEnterpriseUser\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseMfaStatus\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseMfaSetup\s*\(/);
    expect(facadeSource).not.toMatch(/export function enableEnterpriseMfa\s*\(/);
    expect(facadeSource).not.toMatch(/export function disableEnterpriseMfa\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterprisePasswordReset\s*\(/);
    expect(facadeSource).not.toMatch(/export function completeEnterprisePasswordReset\s*\(/);
    expect(facadeSource).not.toMatch(/export function enterpriseLocalSsoFallbackPolicy\s*\(/);
    expect(facadeSource).not.toMatch(/export function requireEnterpriseLocalSsoFallbackAllowed\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseSsoProviderStatuses\s*\(/);
    expect(facadeSource).not.toMatch(/export function isEnterpriseSsoProviderConfigured\s*\(/);
    expect(facadeSource).not.toMatch(/export async function preflightEnterpriseSsoProviders\s*\(/);
    expect(facadeSource).not.toMatch(/export async function createEnterpriseSsoAuthorization\s*\(/);
    expect(facadeSource).not.toMatch(/export async function completeEnterpriseSsoCallback\s*\(/);
    expect(facadeSource).not.toMatch(/export function ssoEnterpriseUser\s*\(/);
    expect(facadeSource).not.toMatch(/function isAuthLockoutActive\s*\(/);
    expect(facadeSource).not.toMatch(/function pruneApiRateLimits\s*\(/);
    expect(facadeSource).not.toMatch(/const enterprisePasswordPolicy\s*=/);
    expect(facadeSource).not.toMatch(/function mfaKeySource\s*\(/);
    expect(facadeSource).not.toMatch(/function csrfKeySource\s*\(/);
    expect(facadeSource).not.toMatch(/function passwordResetTokenExposure\s*\(/);
    expect(facadeSource).not.toMatch(/function passwordPolicyEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function parseIpv4Octets\s*\(/);
    expect(facadeSource).not.toMatch(/function isLocalOrPrivateIdentityEvidenceHost\s*\(/);
    expect(facadeSource).not.toMatch(/function isReservedIdentityEvidenceHost\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const senaSessionCookieName\s*=/);
    expect(identityAuthSource).not.toMatch(/export const senaCsrfHeaderName\s*=/);
    expect(identityAuthSource).not.toMatch(/export function sanitizeEnterpriseContext\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function logoutEnterpriseSession\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function listEnterpriseSessions\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function createEnterpriseCsrfToken\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function verifyEnterpriseCsrfToken\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function revokeEnterpriseSessions\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function getEnterpriseSession\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireEnterpriseSession\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function enforceEnterpriseApiRateLimit\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function registerEnterpriseUser\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function loginEnterpriseUser\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function getEnterpriseMfaStatus\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function createEnterpriseMfaSetup\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function enableEnterpriseMfa\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function disableEnterpriseMfa\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function createEnterprisePasswordReset\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function completeEnterprisePasswordReset\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function enterpriseLocalSsoFallbackPolicy\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function requireEnterpriseLocalSsoFallbackAllowed\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function getEnterpriseSsoProviderStatuses\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function isEnterpriseSsoProviderConfigured\s*\(/);
    expect(identityAuthSource).not.toMatch(/export async function preflightEnterpriseSsoProviders\s*\(/);
    expect(identityAuthSource).not.toMatch(/export async function createEnterpriseSsoAuthorization\s*\(/);
    expect(identityAuthSource).not.toMatch(/export async function completeEnterpriseSsoCallback\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function ssoEnterpriseUser\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function isAuthLockoutActive\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function pruneApiRateLimits\s*\(/);
    expect(identityAuthSource).not.toMatch(/export const enterprisePasswordPolicy\s*=/);
    expect(identityAuthSource).not.toMatch(/export function mfaKeySource\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function csrfKeySource\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function passwordResetTokenExposure\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function passwordPolicyEvidence\s*\(/);
    expect(authLoginSource).not.toMatch(/export const senaSessionCookieName\s*=/);
    expect(authLoginSource).not.toMatch(/export const senaCsrfHeaderName\s*=/);
    expect(authLoginSource).not.toMatch(/export function sanitizeEnterpriseContext\s*\(/);
    expect(authLoginSource).not.toMatch(/export function logoutEnterpriseSession\s*\(/);
    expect(authLoginSource).not.toMatch(/export function listEnterpriseSessions\s*\(/);
    expect(authLoginSource).not.toMatch(/export function createEnterpriseCsrfToken\s*\(/);
    expect(authLoginSource).not.toMatch(/export function verifyEnterpriseCsrfToken\s*\(/);
    expect(authLoginSource).not.toMatch(/export function revokeEnterpriseSessions\s*\(/);
    expect(authLoginSource).not.toMatch(/export function getEnterpriseSession\s*\(/);
    expect(authLoginSource).not.toMatch(/export function requireEnterpriseSession\s*\(/);
    expect(authLoginSource).not.toMatch(/function createSession\s*\(/);
    expect(authLoginSource).not.toMatch(/function contextFromDb\s*\(/);
    expect(authLoginSource).not.toMatch(/function csrfTokenForSession\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export const senaSessionCookieName\s*=/);
    expect(authRegistrationSource).not.toMatch(/function createSession\s*\(/);
    expect(authRegistrationSource).not.toMatch(/function contextFromDb\s*\(/);
    expect(authSessionSource).toMatch(/export const senaSessionCookieName\s*=/);
    expect(authSessionSource).toMatch(/export const senaCsrfHeaderName\s*=/);
    expect(authSessionSource).toMatch(/export function createSession\s*\(/);
    expect(authSessionSource).toMatch(/export function contextFromDb\s*\(/);
    expect(authSessionSource).toMatch(/export function sanitizeEnterpriseContext\s*\(/);
    expect(authSessionSource).toMatch(/export function logoutEnterpriseSession\s*\(/);
    expect(authSessionSource).toMatch(/export function listEnterpriseSessions\s*\(/);
    expect(authSessionSource).toMatch(/export function createEnterpriseCsrfToken\s*\(/);
    expect(authSessionSource).toMatch(/export function verifyEnterpriseCsrfToken\s*\(/);
    expect(authSessionSource).toMatch(/export function revokeEnterpriseSessions\s*\(/);
    expect(authSessionSource).toMatch(/export function getEnterpriseSession\s*\(/);
    expect(authSessionSource).toMatch(/export function requireEnterpriseSession\s*\(/);
    expect(authSessionSource).toMatch(/function csrfTokenForSession\s*\(/);
    expect(authLoginSource).not.toMatch(/export function enforceEnterpriseApiRateLimit\s*\(/);
    expect(authLoginSource).not.toMatch(/export function isAuthLockoutActive\s*\(/);
    expect(authLoginSource).not.toMatch(/export function pruneApiRateLimits\s*\(/);
    expect(authLoginSource).not.toMatch(/function recordFailedLogin\s*\(/);
    expect(authLoginSource).not.toMatch(/function findAuthLockout\s*\(/);
    expect(authLoginSource).not.toMatch(/function authLockoutTeamId\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function enforceEnterpriseApiRateLimit\s*\(/);
    expect(authSecuritySource).toMatch(/export function enforceEnterpriseApiRateLimit\s*\(/);
    expect(authSecuritySource).toMatch(/export function isAuthLockoutActive\s*\(/);
    expect(authSecuritySource).toMatch(/export function pruneApiRateLimits\s*\(/);
    expect(authSecuritySource).toMatch(/export function recordFailedLogin\s*\(/);
    expect(authSecuritySource).toMatch(/export function findAuthLockout\s*\(/);
    expect(authSecuritySource).toMatch(/function authLockoutTeamId\s*\(/);
    expect(authRegistrationSource).toMatch(/export function registerEnterpriseUser\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function loginEnterpriseUser\s*\(/);
    expect(authLoginSource).toMatch(/export function loginEnterpriseUser\s*\(/);
    expect(authLoginSource).not.toMatch(/export function registerEnterpriseUser\s*\(/);
    expect(authLoginSource).not.toMatch(/export function getEnterpriseMfaStatus\s*\(/);
    expect(authLoginSource).not.toMatch(/export function createEnterpriseMfaSetup\s*\(/);
    expect(authLoginSource).not.toMatch(/export function enableEnterpriseMfa\s*\(/);
    expect(authLoginSource).not.toMatch(/export function disableEnterpriseMfa\s*\(/);
    expect(authLoginSource).not.toMatch(/function base32Encode\s*\(/);
    expect(authLoginSource).not.toMatch(/function sealMfaSecret\s*\(/);
    expect(authLoginSource).not.toMatch(/function verifyTotp\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function getEnterpriseMfaStatus\s*\(/);
    expect(authMfaSource).toMatch(/export function getEnterpriseMfaStatus\s*\(/);
    expect(authMfaSource).toMatch(/export function createEnterpriseMfaSetup\s*\(/);
    expect(authMfaSource).toMatch(/export function enableEnterpriseMfa\s*\(/);
    expect(authMfaSource).toMatch(/export function disableEnterpriseMfa\s*\(/);
    expect(authMfaSource).toMatch(/function base32Encode\s*\(/);
    expect(authMfaSource).toMatch(/function sealMfaSecret\s*\(/);
    expect(authMfaSource).toMatch(/function verifyTotp\s*\(/);
    expect(authLoginSource).not.toMatch(/export function createEnterprisePasswordReset\s*\(/);
    expect(authLoginSource).not.toMatch(/export function completeEnterprisePasswordReset\s*\(/);
    expect(authLoginSource).not.toMatch(/function passwordResetExpiry\s*\(/);
    expect(authLoginSource).not.toMatch(/function passwordResetDeliveryMode\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function createEnterprisePasswordReset\s*\(/);
    expect(authPasswordResetSource).toMatch(/export function createEnterprisePasswordReset\s*\(/);
    expect(authPasswordResetSource).toMatch(/export function completeEnterprisePasswordReset\s*\(/);
    expect(authPasswordResetSource).toMatch(/function passwordResetExpiry\s*\(/);
    expect(authPasswordResetSource).toMatch(/function passwordResetDeliveryMode\s*\(/);
    expect(passwordResetRouteSource).toContain("@/lib/sena/enterprise/auth-password-reset");
    expect(passwordResetRouteSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    expect(authLoginSource).not.toMatch(/export function enterpriseLocalSsoFallbackPolicy\s*\(/);
    expect(authLoginSource).not.toMatch(/export function requireEnterpriseLocalSsoFallbackAllowed\s*\(/);
    expect(authLoginSource).not.toMatch(/export function getEnterpriseSsoProviderStatuses\s*\(/);
    expect(authLoginSource).not.toMatch(/export function isEnterpriseSsoProviderConfigured\s*\(/);
    expect(authLoginSource).not.toMatch(/export async function preflightEnterpriseSsoProviders\s*\(/);
    expect(authLoginSource).not.toMatch(/export async function createEnterpriseSsoAuthorization\s*\(/);
    expect(authLoginSource).not.toMatch(/export async function completeEnterpriseSsoCallback\s*\(/);
    expect(authLoginSource).not.toMatch(/export function ssoEnterpriseUser\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function ssoEnterpriseUser\s*\(/);
    expect(authSsoSource).toMatch(/export function enterpriseLocalSsoFallbackPolicy\s*\(/);
    expect(authSsoSource).toMatch(/export function requireEnterpriseLocalSsoFallbackAllowed\s*\(/);
    expect(authSsoSource).toMatch(/export function getEnterpriseSsoProviderStatuses\s*\(/);
    expect(authSsoSource).toMatch(/export function isEnterpriseSsoProviderConfigured\s*\(/);
    expect(authSsoSource).toMatch(/export async function preflightEnterpriseSsoProviders\s*\(/);
    expect(authSsoSource).toMatch(/export async function createEnterpriseSsoAuthorization\s*\(/);
    expect(authSsoSource).toMatch(/export async function completeEnterpriseSsoCallback\s*\(/);
    expect(authSsoSource).toMatch(/export function ssoEnterpriseUser\s*\(/);
    expect(apiHelpersSource).toContain("./enterprise/auth-security");
    expect(opsGovernanceSource).toContain("./auth-security");
    expect(opsStatusSource).toContain("./auth-security");
    expect(authLoginSource).not.toMatch(/export const enterprisePasswordPolicy\s*=/);
    expect(authLoginSource).not.toMatch(/export function passwordPolicyEvidence\s*\(/);
    expect(authLoginSource).not.toMatch(/function hashPassword\s*\(/);
    expect(authLoginSource).not.toMatch(/function validateEnterprisePassword\s*\(/);
    expect(authLoginSource).not.toMatch(/function verifyPassword\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export const enterprisePasswordPolicy\s*=/);
    expect(authPasswordSource).toMatch(/export const enterprisePasswordPolicy\s*=/);
    expect(authPasswordSource).toMatch(/export function passwordPolicyEvidence\s*\(/);
    expect(authPasswordSource).toMatch(/export function hashPassword\s*\(/);
    expect(authPasswordSource).toMatch(/export function validateEnterprisePassword\s*\(/);
    expect(authPasswordSource).toMatch(/export function verifyPassword\s*\(/);
    expect(authLoginSource).not.toMatch(/export function now\s*\(/);
    expect(authLoginSource).not.toMatch(/export function sha256Text\s*\(/);
    expect(authLoginSource).not.toMatch(/export function artifactSha256\s*\(/);
    expect(authLoginSource).not.toMatch(/export function envValue\s*\(/);
    expect(authLoginSource).not.toMatch(/export function mfaKeySource\s*\(/);
    expect(authLoginSource).not.toMatch(/export function csrfKeySource\s*\(/);
    expect(authLoginSource).not.toMatch(/export function passwordResetTokenExposure\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function envValue\s*\(/);
    expect(authConfigSource).toMatch(/export function now\s*\(/);
    expect(authConfigSource).toMatch(/export function sha256Text\s*\(/);
    expect(authConfigSource).toMatch(/export function artifactSha256\s*\(/);
    expect(authConfigSource).toMatch(/export function envValue\s*\(/);
    expect(authConfigSource).toMatch(/export function mfaKeySource\s*\(/);
    expect(authConfigSource).toMatch(/export function csrfKeySource\s*\(/);
    expect(authConfigSource).toMatch(/export function passwordResetTokenExposure\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function parseIpv4Octets\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function isLocalOrPrivateIdentityEvidenceHost\s*\(/);
    expect(identityAuthSource).not.toMatch(/export function isReservedIdentityEvidenceHost\s*\(/);
    expect(authLoginSource).not.toMatch(/export function parseIpv4Octets\s*\(/);
    expect(authLoginSource).not.toMatch(/export function isLocalOrPrivateIdentityEvidenceHost\s*\(/);
    expect(authLoginSource).not.toMatch(/export function isReservedIdentityEvidenceHost\s*\(/);
    expect(authRegistrationSource).not.toMatch(/export function parseIpv4Octets\s*\(/);
    expect(authConfigSource).toMatch(/export function parseIpv4Octets\s*\(/);
    expect(authConfigSource).toMatch(/export function isLocalOrPrivateIdentityEvidenceHost\s*\(/);
    expect(authConfigSource).toMatch(/export function isReservedIdentityEvidenceHost\s*\(/);
    expect(apiHelpersSource).toContain("./enterprise/auth-session");

    const loginRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "auth", "login", "route.ts"), "utf8");
    expect(loginRouteSource).toContain("@/lib/sena/enterprise/auth-login");
    expect(loginRouteSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    expect(loginRouteSource).not.toContain("@/lib/sena/enterprise/identity-production-evidence");
    const registerRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "auth", "register", "route.ts"), "utf8");
    expect(registerRouteSource).toContain("@/lib/sena/enterprise/auth-registration");
    expect(registerRouteSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    expect(registerRouteSource).not.toContain("@/lib/sena/enterprise/identity-production-evidence");
    const authSessionRouteFiles = [
      path.join("app", "api", "auth", "csrf", "route.ts"),
      path.join("app", "api", "auth", "logout", "route.ts"),
      path.join("app", "api", "auth", "me", "route.ts"),
      path.join("app", "api", "auth", "sessions", "route.ts")
    ];
    for (const routeFile of authSessionRouteFiles) {
      const routeSource = readFileSync(path.join(process.cwd(), routeFile), "utf8");
      expect(routeSource).toContain("@/lib/sena/enterprise/auth-session");
      expect(routeSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    }
    const mfaRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "auth", "mfa", "route.ts"), "utf8");
    expect(mfaRouteSource).toContain("@/lib/sena/enterprise/auth-mfa");
    expect(mfaRouteSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    expect(passwordResetRouteSource).toContain("@/lib/sena/enterprise/auth-password-reset");
    expect(passwordResetRouteSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    const ssoCallbackRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "auth", "sso", "callback", "route.ts"), "utf8");
    expect(ssoCallbackRouteSource).toContain("@/lib/sena/enterprise/auth-sso");
    expect(ssoCallbackRouteSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    const ssoRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "auth", "sso", "route.ts"), "utf8");
    expect(ssoRouteSource).toContain("@/lib/sena/enterprise/auth-sso");
    expect(ssoRouteSource).not.toContain("@/lib/sena/enterprise/auth-runtime");
    expect(ssoRouteSource).toContain("@/lib/sena/enterprise/identity-production-evidence");
    expect(authInvitationsSource).toMatch(/export function requirePendingInvitationForEmail\s*\(/);
    expect(authInvitationsSource).toMatch(/export function safeInviteCode\s*\(/);
    expect(authRegistrationSource).toContain("./auth-invitations");
    expect(authSsoSource).toContain("./auth-invitations");
  });

  it("owns identity production evidence in a dedicated evidence module", () => {
    const identityAuthPath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-auth.ts");
    const identityProductionEvidencePath = path.join(process.cwd(), "lib", "sena", "enterprise", "identity-production-evidence.ts");
    const enterpriseFacadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");

    expect(existsSync(identityProductionEvidencePath)).toBe(true);
    expect(existsSync(identityAuthPath)).toBe(false);

    const identityProductionEvidenceSource = readFileSync(identityProductionEvidencePath, "utf8");
    expect(identityProductionEvidenceSource).toMatch(/export type SenaEnterpriseIdentityProductionEvidence\s*=/);
    expect(identityProductionEvidenceSource).toMatch(/export function buildEnterpriseIdentityProductionEvidenceDossier\s*\(/);
    expect(identityProductionEvidenceSource).toMatch(/export function getEnterpriseIdentityProductionEvidence\s*\(/);
    expect(identityProductionEvidenceSource).not.toMatch(/export const senaSessionCookieName\s*=/);
    expect(identityProductionEvidenceSource).not.toMatch(/export function loginEnterpriseUser\s*\(/);
    expect(enterpriseFacadeSource).toContain("./enterprise/identity-production-evidence");
    expect(enterpriseFacadeSource).not.toContain("./enterprise/identity-auth");

    const sourceFiles = [
      ...collectRouteFiles(path.join(process.cwd(), "app", "api")),
      ...readdirSync(path.join(process.cwd(), "lib", "sena", "enterprise"))
        .filter((entry) => entry.endsWith(".ts"))
        .map((entry) => path.join(process.cwd(), "lib", "sena", "enterprise", entry)),
      path.join(process.cwd(), "lib", "sena", "enterprise.ts")
    ];
    const staleImports = sourceFiles.filter((file) => readFileSync(file, "utf8").includes("identity-auth"));
    expect(staleImports).toEqual([]);
  });

  it("owns notification and email delivery type contracts in the notifications module", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const notificationsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "notifications-delivery.ts"), "utf8");
    const notificationsEmailPath = path.join(process.cwd(), "lib", "sena", "enterprise", "notifications-email.ts");

    expect(existsSync(notificationsEmailPath)).toBe(true);
    const notificationsEmailSource = existsSync(notificationsEmailPath) ? readFileSync(notificationsEmailPath, "utf8") : "";

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseNotificationKind\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseNotification\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseEmailDeliveryPayload\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseEmailDeliveryResult\s*=/);
    expect(notificationsSource).toMatch(/export type SenaEnterpriseNotificationKind\s*=/);
    expect(notificationsSource).toMatch(/export type SenaEnterpriseNotification\s*=/);
    expect(notificationsSource).not.toMatch(/export type SenaEnterpriseEmailDeliveryPayload\s*=/);
    expect(notificationsSource).not.toMatch(/export type SenaEnterpriseEmailDeliveryResult\s*=/);
    expect(notificationsEmailSource).toMatch(/export type SenaEnterpriseEmailDeliveryPayload\s*=/);
    expect(notificationsEmailSource).toMatch(/export type SenaEnterpriseEmailDeliveryResult\s*=/);
  });

  it("owns reliability, validation, expert-review, and claim type contracts in focused validation modules", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const reliabilityRunsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "reliability-runs.ts");
    const validationRunsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "validation-runs.ts");
    const staleReliabilityValidationPath = path.join(process.cwd(), "lib", "sena", "enterprise", "reliability-validation.ts");
    const expertReviewPath = path.join(process.cwd(), "lib", "sena", "enterprise", "expert-review.ts");
    const claimPackagePath = path.join(process.cwd(), "lib", "sena", "enterprise", "claim-evidence-package.ts");
    expect(existsSync(reliabilityRunsPath)).toBe(true);
    expect(existsSync(validationRunsPath)).toBe(true);
    expect(existsSync(staleReliabilityValidationPath)).toBe(false);
    expect(existsSync(expertReviewPath)).toBe(true);
    expect(existsSync(claimPackagePath)).toBe(true);
    const reliabilityRunsSource = readFileSync(reliabilityRunsPath, "utf8");
    const validationRunsSource = readFileSync(validationRunsPath, "utf8");
    const expertReviewSource = readFileSync(expertReviewPath, "utf8");
    const claimPackageSource = readFileSync(claimPackagePath, "utf8");
    const reliabilityRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "reliability", "route.ts"), "utf8");
    const validationRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "validation", "group-comparison", "route.ts"), "utf8");
    const expertReviewRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "validation", "expert-review", "route.ts"), "utf8");
    const claimPackageRouteSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "validation", "claim-package", "route.ts"), "utf8");
    const stateSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "state.ts"), "utf8");
    const backupSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-backup.ts"), "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReliabilityRun\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseValidationRun\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseExpertReview\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseClaimEvidencePackage\s*=/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseExpertReview\s*\(/);
    expect(facadeSource).not.toMatch(/export function reviewEnterpriseExpertReview\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseExpertReviews\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseClaimEvidencePackage\s*\(/);
    expect(validationRunsSource).toMatch(/export type SenaEnterpriseValidationRun\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseReliabilityRun\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseReliabilityRunStatus\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseReliabilityAdjudicationCoverage\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseReliabilityAdjudicationResult\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseExpertReview\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseExpertReviewStatus\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseClaimEvidencePackage\s*=/);
    expect(validationRunsSource).not.toMatch(/export type SenaEnterpriseClaimEvidencePackageStatus\s*=/);
    expect(validationRunsSource).not.toMatch(/export function createEnterpriseReliabilityRun\s*\(/);
    expect(validationRunsSource).not.toMatch(/export function createEnterpriseReliabilityAdjudications\s*\(/);
    expect(validationRunsSource).not.toMatch(/export function reviewEnterpriseReliabilityRun\s*\(/);
    expect(validationRunsSource).not.toMatch(/export function listEnterpriseReliabilityRuns\s*\(/);
    expect(validationRunsSource).not.toMatch(/export function createEnterpriseExpertReview\s*\(/);
    expect(validationRunsSource).not.toMatch(/export function reviewEnterpriseExpertReview\s*\(/);
    expect(validationRunsSource).not.toMatch(/export function listEnterpriseExpertReviews\s*\(/);
    expect(validationRunsSource).not.toMatch(/export function getEnterpriseClaimEvidencePackage\s*\(/);
    expect(reliabilityRunsSource).toMatch(/export type SenaEnterpriseReliabilityRun\s*=/);
    expect(reliabilityRunsSource).toMatch(/export type SenaEnterpriseReliabilityRunStatus\s*=/);
    expect(reliabilityRunsSource).toMatch(/export type SenaEnterpriseReliabilityAdjudicationCoverage\s*=/);
    expect(reliabilityRunsSource).toMatch(/export type SenaEnterpriseReliabilityAdjudicationResult\s*=/);
    expect(reliabilityRunsSource).toMatch(/export function createEnterpriseReliabilityRun\s*\(/);
    expect(reliabilityRunsSource).toMatch(/export function createEnterpriseReliabilityAdjudications\s*\(/);
    expect(reliabilityRunsSource).toMatch(/export function reviewEnterpriseReliabilityRun\s*\(/);
    expect(reliabilityRunsSource).toMatch(/export function listEnterpriseReliabilityRuns\s*\(/);
    expect(validationRunsSource).toMatch(/export function createEnterpriseValidationRun\s*\(/);
    expect(validationRunsSource).toMatch(/export function reviewEnterpriseValidationRun\s*\(/);
    expect(validationRunsSource).toMatch(/export function listEnterpriseValidationRuns\s*\(/);
    expect(expertReviewSource).toMatch(/export type SenaEnterpriseExpertReview\s*=/);
    expect(expertReviewSource).toMatch(/export type SenaEnterpriseExpertReviewStatus\s*=/);
    expect(expertReviewSource).toMatch(/export function createEnterpriseExpertReview\s*\(/);
    expect(expertReviewSource).toMatch(/export function reviewEnterpriseExpertReview\s*\(/);
    expect(expertReviewSource).toMatch(/export function listEnterpriseExpertReviews\s*\(/);
    expect(expertReviewSource).toMatch(/function requireProjectPermissionFromDb\s*\(/);
    expect(claimPackageSource).toMatch(/export type SenaEnterpriseClaimEvidencePackage\s*=/);
    expect(claimPackageSource).toMatch(/export type SenaEnterpriseClaimEvidencePackageStatus\s*=/);
    expect(claimPackageSource).toMatch(/export function getEnterpriseClaimEvidencePackage\s*\(/);
    expect(claimPackageSource).toMatch(/function claimPackageSourceSnapshotEvidence\s*\(/);
    expect(reliabilityRouteSource).toContain("@/lib/sena/enterprise/reliability-runs");
    expect(reliabilityRouteSource).not.toContain("@/lib/sena/enterprise/reliability-validation");
    expect(validationRouteSource).toContain("@/lib/sena/enterprise/validation-runs");
    expect(validationRouteSource).not.toContain("@/lib/sena/enterprise/reliability-validation");
    expect(expertReviewRouteSource).toContain("@/lib/sena/enterprise/expert-review");
    expect(expertReviewRouteSource).not.toContain("@/lib/sena/enterprise/reliability-validation");
    expect(claimPackageRouteSource).toContain("@/lib/sena/enterprise/claim-evidence-package");
    expect(claimPackageRouteSource).not.toContain("@/lib/sena/enterprise/reliability-validation");
    expect(stateSource).toContain("./reliability-runs");
    expect(stateSource).toContain("./validation-runs");
    expect(stateSource).toContain("./expert-review");
    expect(backupSource).toContain("./reliability-runs");
    expect(backupSource).toContain("./validation-runs");
  });

  it("owns organization provisioning type contracts in the provisioning module", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const identityAuthSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "identity-production-evidence.ts"), "utf8");
    const provisioningSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "provisioning.ts"), "utf8");
    const routeSource = readFileSync(path.join(process.cwd(), "app", "api", "sena", "provisioning", "route.ts"), "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseProvisioningSource\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseProvisioningMetadata\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseProvisioningInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseProvisioningResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseProvisioningDirectory\s*=/);
    expect(facadeSource).not.toMatch(/export function provisionEnterpriseOrganization/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseProvisioningDirectory/);
    expect(identityAuthSource).not.toMatch(/provisionEnterpriseOrganization/);
    expect(identityAuthSource).not.toMatch(/listEnterpriseProvisioningDirectory/);
    expect(identityAuthSource).not.toMatch(/SenaEnterpriseProvisioningInput/);
    expect(provisioningSource).toMatch(/export type SenaEnterpriseProvisioningSource\s*=/);
    expect(provisioningSource).toMatch(/export type SenaEnterpriseProvisioningMetadata\s*=/);
    expect(provisioningSource).toMatch(/export type SenaEnterpriseProvisioningInput\s*=/);
    expect(provisioningSource).toMatch(/export type SenaEnterpriseProvisioningResult\s*=/);
    expect(provisioningSource).toMatch(/export type SenaEnterpriseProvisioningDirectory\s*=/);
    expect(provisioningSource).toMatch(/export function provisionEnterpriseOrganization/);
    expect(provisioningSource).toMatch(/export function listEnterpriseProvisioningDirectory/);
    expect(routeSource).toContain("@/lib/sena/enterprise/provisioning");
    expect(routeSource).not.toContain("@/lib/sena/enterprise/identity-production-evidence");
  });

  it("owns audit log and governance check type contracts in the ops governance module", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const opsSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-governance.ts"), "utf8");
    const opsResponseSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "ops-response-builders.ts"), "utf8");
    const opsAlertsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-alerts.ts");
    const opsAuditPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-audit.ts");
    const opsBackupPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-backup.ts");
    const opsDatabaseSyncPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-database-sync.ts");
    const opsBackupRestorePath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-backup-restore.ts");
    const opsCapabilityAuditPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-capability-audit.ts");
    const opsDeploymentDecisionsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-deployment-decisions.ts");
    const opsDeploymentPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-deployment.ts");
    const opsDeploymentEnvPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-deployment-env.ts");
    const opsDeploymentReadinessPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-deployment-readiness.ts");
    const opsDeploymentServiceEndpointsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-deployment-service-endpoints.ts");
    const opsGoLivePath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-go-live.ts");
    const opsGoLiveAttestationsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-go-live-attestations.ts");
    const opsMetricsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-metrics.ts");
    const opsPlatformAdapterCertificationPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-platform-adapter-certification.ts");
    const opsPlatformDecisionChecklistPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-platform-decision-checklist.ts");
    const opsPlatformDecisionsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-platform-decisions.ts");
    const opsPlatformDecisionPolicyPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-platform-decision-policy.ts");
    const opsPostCutoverObservationsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-post-cutover-observations.ts");
    const opsProductionEvidencePath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-production-evidence.ts");
    const opsReleaseGatePath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-release-gate.ts");
    const opsRuntimePath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-runtime.ts");
    const opsSaasOperationsPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-saas-operations.ts");
    const opsSecurityPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-security.ts");
    const opsStatusPath = path.join(process.cwd(), "lib", "sena", "enterprise", "ops-status.ts");
    const opsAlertsRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "alerts", "route.ts"),
      "utf8"
    );
    const opsMetricsRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "metrics", "route.ts"),
      "utf8"
    );
    const opsReadinessRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "readiness", "route.ts"),
      "utf8"
    );
    const opsDeploymentRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "deployment", "route.ts"),
      "utf8"
    );
    const opsSaasOperationsRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "saas-operations", "route.ts"),
      "utf8"
    );
    const opsProductionEvidenceRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "production-evidence", "route.ts"),
      "utf8"
    );
    const opsStatusRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "status", "route.ts"),
      "utf8"
    );
    const governanceAuditRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "governance", "audit", "route.ts"),
      "utf8"
    );
    const opsCapabilityAuditRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "capability-audit", "route.ts"),
      "utf8"
    );
    const opsReleaseGateRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "ops", "release-gate", "route.ts"),
      "utf8"
    );
    const governanceBackupRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "governance", "backup", "route.ts"),
      "utf8"
    );
    const governanceSecurityRouteSource = readFileSync(
      path.join(process.cwd(), "app", "api", "sena", "governance", "security", "route.ts"),
      "utf8"
    );

    expect(existsSync(opsAlertsPath)).toBe(true);
    expect(existsSync(opsAuditPath)).toBe(true);
    expect(existsSync(opsBackupPath)).toBe(true);
    expect(existsSync(opsBackupRestorePath)).toBe(true);
    expect(existsSync(opsCapabilityAuditPath)).toBe(true);
    expect(existsSync(opsDeploymentDecisionsPath)).toBe(true);
    expect(existsSync(opsDeploymentPath)).toBe(true);
    expect(existsSync(opsDeploymentEnvPath)).toBe(true);
    expect(existsSync(opsDeploymentReadinessPath)).toBe(true);
    expect(existsSync(opsDeploymentServiceEndpointsPath)).toBe(true);
    expect(existsSync(opsGoLivePath)).toBe(true);
    expect(existsSync(opsGoLiveAttestationsPath)).toBe(true);
    expect(existsSync(opsMetricsPath)).toBe(true);
    expect(existsSync(opsPlatformAdapterCertificationPath)).toBe(true);
    expect(existsSync(opsPlatformDecisionChecklistPath)).toBe(true);
    expect(existsSync(opsPlatformDecisionsPath)).toBe(true);
    expect(existsSync(opsPlatformDecisionPolicyPath)).toBe(true);
    expect(existsSync(opsPostCutoverObservationsPath)).toBe(true);
    expect(existsSync(opsReleaseGatePath)).toBe(true);
    expect(existsSync(opsRuntimePath)).toBe(true);
    expect(existsSync(opsSaasOperationsPath)).toBe(true);
    expect(existsSync(opsSecurityPath)).toBe(true);
    expect(existsSync(opsStatusPath)).toBe(true);
    const opsAlertsSource = readFileSync(opsAlertsPath, "utf8");
    const opsAuditSource = readFileSync(opsAuditPath, "utf8");
    const opsBackupSource = readFileSync(opsBackupPath, "utf8");
    const opsDatabaseSyncSource = existsSync(opsDatabaseSyncPath) ? readFileSync(opsDatabaseSyncPath, "utf8") : "";
    const opsBackupRestoreSource = existsSync(opsBackupRestorePath) ? readFileSync(opsBackupRestorePath, "utf8") : "";
    const opsCapabilityAuditSource = readFileSync(opsCapabilityAuditPath, "utf8");
    const opsDeploymentDecisionsSource = readFileSync(opsDeploymentDecisionsPath, "utf8");
    const opsDeploymentSource = readFileSync(opsDeploymentPath, "utf8");
    const opsProductionEvidenceSource = readFileSync(opsProductionEvidencePath, "utf8");
    const opsDeploymentEnvSource = readFileSync(opsDeploymentEnvPath, "utf8");
    const opsDeploymentReadinessSource = readFileSync(opsDeploymentReadinessPath, "utf8");
    const opsDeploymentServiceEndpointsSource = readFileSync(opsDeploymentServiceEndpointsPath, "utf8");
    const opsGoLiveSource = readFileSync(opsGoLivePath, "utf8");
    const opsGoLiveAttestationsSource = existsSync(opsGoLiveAttestationsPath) ? readFileSync(opsGoLiveAttestationsPath, "utf8") : "";
    const opsMetricsSource = readFileSync(opsMetricsPath, "utf8");
    const opsPlatformAdapterCertificationSource = readFileSync(opsPlatformAdapterCertificationPath, "utf8");
    const opsPlatformDecisionChecklistSource = readFileSync(opsPlatformDecisionChecklistPath, "utf8");
    const opsPlatformDecisionsSource = readFileSync(opsPlatformDecisionsPath, "utf8");
    const opsPlatformDecisionPolicySource = readFileSync(opsPlatformDecisionPolicyPath, "utf8");
    const opsPostCutoverObservationsSource = readFileSync(opsPostCutoverObservationsPath, "utf8");
    const opsReleaseGateSource = readFileSync(opsReleaseGatePath, "utf8");
    const opsRuntimeSource = readFileSync(opsRuntimePath, "utf8");
    const opsSaasOperationsSource = readFileSync(opsSaasOperationsPath, "utf8");
    const opsSecuritySource = readFileSync(opsSecurityPath, "utf8");
    const opsStatusSource = readFileSync(opsStatusPath, "utf8");

    expect(facadeSource).not.toMatch(/export type SenaEnterpriseAuditEvent\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseAuditLogEntry\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseAuditIntegrity\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGovernanceCheck\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGovernanceStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseBackupRecordCounts\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseBackupPayload\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseBackupArtifact\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseBackupVerification\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseBackupDeliveryResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseDatabaseSyncResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseBackupRestoreResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseStorageEngine\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePostgresStorageEvidence\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseOpsStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseDeploymentReadinessItem\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseDeploymentReadiness\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentEnv\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentDecision\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentPackage\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionProductionEvidenceReceipt\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptance\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceList\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionCategory\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistItem\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionRegisterDecision\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePlatformDecisionRegister\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseNativeAdapterCertificationStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseNativeAdapterCertification\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSaasOperationsReadiness\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseCapabilityAuditStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseCapabilityAuditItem\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseCapabilityAudit\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReleaseGateDecision\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReleaseVerificationStatus\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReleaseVerificationEvidence\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReleaseGateReview\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReleaseGateReviewInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReleaseGateReviewList\s*=/);
    expect(facadeSource).not.toMatch(/const enterprisePlatformDecisionIds\s*=/);
    expect(facadeSource).not.toMatch(/const enterprisePlatformDecisionAcceptanceStatuses\s*=/);
    expect(facadeSource).not.toMatch(/const enterpriseReleaseGateDecisions\s*=/);
    expect(facadeSource).not.toMatch(/function isEnterprisePlatformDecisionId\s*\(/);
    expect(facadeSource).not.toMatch(/function isEnterprisePlatformDecisionAcceptanceStatus\s*\(/);
    expect(facadeSource).not.toMatch(/function isEnterpriseReleaseGateDecision\s*\(/);
    expect(facadeSource).not.toMatch(/function isEnterpriseReleaseVerificationStatus\s*\(/);
    expect(facadeSource).not.toMatch(/function enterpriseDeploymentMode\s*\(/);
    expect(facadeSource).not.toMatch(/function isSelfManagedEnterpriseMode\s*\(/);
    expect(facadeSource).not.toMatch(/function isSelfManagedIdentityDecision\s*\(/);
    expect(facadeSource).not.toMatch(/const selfManagedLocalPlatformDecisionIds\s*=/);
    expect(facadeSource).not.toMatch(/function isSelfManagedLocalPlatformDecision\s*\(/);
    expect(facadeSource).not.toMatch(/function selfManagedIdentityEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function selfManagedIdentityNextAction\s*\(/);
    expect(facadeSource).not.toMatch(/function selfManagedIdentityChecklistItems\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionCategory\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionAcceptanceCriteria\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionProductionBlocking\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionOwnerEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function latestPlatformDecisionAcceptances\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionAcceptedBridge\s*\(/);
    expect(facadeSource).not.toMatch(/function missingPlatformDecisionAcceptanceEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function stableTechnicalEvidenceBindingDigestInput\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionProductionEvidenceReceipt\s*\(/);
    expect(facadeSource).not.toMatch(/function summarizePlatformDecisionAcceptances\s*\(/);
    expect(facadeSource).not.toMatch(/export function reviewEnterprisePlatformDecision\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterprisePlatformDecisionAcceptances\s*\(/);
    expect(facadeSource).not.toMatch(/function platformDecisionEvidenceChecklist\s*\(/);
    expect(facadeSource).not.toMatch(/function missingPlatformDecisionProductionEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterprisePlatformDecisionRegister\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterprisePlatformDecisionRegister\s*\(/);
    expect(facadeSource).not.toMatch(/function nativeAdapterSpec\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseNativeAdapterCertification\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseNativeAdapterCertification\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseSaasOperationsReadiness\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseSaasOperationsReadiness\s*\(/);
    expect(facadeSource).not.toMatch(/function manageableTeamIds\s*\(/);
    expect(facadeSource).not.toMatch(/function requiredPlatformDecisionText\s*\(/);
    expect(facadeSource).not.toMatch(/function normalizedPlatformDecisionEvidenceUrl\s*\(/);
    expect(facadeSource).not.toMatch(/function enterprisePostgresStorageEngine\s*\(/);
    expect(facadeSource).not.toMatch(/function enterprisePostgresStorageEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function enterprisePostgresPublicEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function deploymentEnv\s*\(/);
    expect(facadeSource).not.toMatch(/function deploymentWebhookEnv\s*\(/);
    expect(facadeSource).not.toMatch(/function opsTokenConfigured\s*\(/);
    expect(facadeSource).not.toMatch(/function alertingOwner\s*\(/);
    expect(facadeSource).not.toMatch(/function alertingChannel\s*\(/);
    expect(facadeSource).not.toMatch(/function alertingRunbookUrl\s*\(/);
    expect(facadeSource).not.toMatch(/function latestAuditAt\s*\(/);
    expect(facadeSource).not.toMatch(/function backupAgeSeconds\s*\(/);
    expect(facadeSource).not.toMatch(/function auditRetentionWindowDays\s*\(/);
    expect(facadeSource).not.toMatch(/function readinessItem\s*\(/);
    expect(facadeSource).not.toMatch(/function governanceCheck\s*\(/);
    expect(facadeSource).not.toMatch(/function readinessFromGovernance\s*\(/);
    expect(facadeSource).not.toMatch(/function summarizeReleaseGateReviews\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseDeploymentReleaseGateEvidence\s*\(/);
    expect(facadeSource).not.toMatch(/function enterpriseReleaseGateIdentityProductionSnapshot\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseReleaseGateReview\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseReleaseGateReviews\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseDeploymentReadiness\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseCapabilityAudit\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseOrganizationDeploymentPackage\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseGovernanceStatus\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterprisePlatformDecisionListResponse\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterprisePlatformDecisionReviewResponse\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterpriseGoLiveRehearsalResponse\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterpriseGoLivePostResponse\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditEvent\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditLogEntry\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditIntegrity\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditWebhookDeliveryStatus\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditWebhookDelivery\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditDeliveryResult\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditLogQuery\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseAuditLogResult\s*=/);
    expect(opsSource).not.toMatch(/export const enterpriseAuditEvents\s*:/);
    expect(opsSource).not.toMatch(/export function isEnterpriseAuditEvent\s*\(/);
    expect(opsSource).not.toMatch(/export function latestAuditAt\s*\(/);
    expect(opsSource).not.toMatch(/export function auditRetentionWindowDays\s*\(/);
    expect(opsSource).not.toMatch(/export function listEnterpriseAuditLog\s*\(/);
    expect(opsSource).not.toMatch(/export function verifyEnterpriseAuditIntegrity\s*\(/);
    expect(opsSource).not.toMatch(/export function appendAudit\s*\(/);
    expect(opsSource).not.toMatch(/export function recordEnterpriseAudit\s*\(/);
    expect(opsSource).not.toMatch(/export async function deliverEnterpriseAuditLog\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseBackupRecordCounts\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseBackupPayload\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseBackupArtifact\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseBackupVerification\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseBackupDeliveryResult\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseDatabaseSyncResult\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseBackupRestoreResult\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseStorageEngine\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePostgresStorageEvidence\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseOpsStatus\s*=/);
    expect(opsSource).not.toMatch(/export function enterprisePostgresStorageEngine\s*\(/);
    expect(opsSource).not.toMatch(/export function enterprisePostgresStorageEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function enterprisePostgresPublicEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function opsTokenConfigured\s*\(/);
    expect(opsSource).not.toMatch(/export function backupAgeSeconds\s*\(/);
    expect(opsSource).not.toMatch(/export function getEnterpriseOpsStatus\s*\(/);
    expect(opsSource).not.toMatch(/export function createEnterpriseBackup\s*\(/);
    expect(opsSource).not.toMatch(/export function verifyEnterpriseBackup\s*\(/);
    expect(opsSource).not.toMatch(/export async function deliverEnterpriseBackup\s*\(/);
    expect(opsSource).not.toMatch(/export async function deliverEnterpriseDatabaseSync\s*\(/);
    expect(opsSource).not.toMatch(/export function restoreEnterpriseBackup\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseCapabilityAuditStatus\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseCapabilityAuditItem\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseCapabilityAudit\s*=/);
    expect(opsSource).not.toMatch(/export function getEnterpriseCapabilityAudit\s*\(/);
    expect(opsSource).not.toMatch(/export function getEnterprisePlatformDecisionRegister\s*\(/);
    expect(opsSource).not.toMatch(/export function getEnterpriseNativeAdapterCertification\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseDeploymentReadinessItem\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseDeploymentReadiness\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentEnv\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentDecision\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentPackage\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseSaasOperationsReadiness\s*=/);
    expect(opsSource).not.toMatch(/export function getEnterpriseDeploymentReadiness\s*\(/);
    expect(opsSource).not.toMatch(/export function getEnterpriseOrganizationDeploymentPackage\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterpriseSaasOperationsReadiness\s*\(/);
    expect(opsSource).not.toMatch(/export function getEnterpriseSaasOperationsReadiness\s*\(/);
    expect(opsSource).not.toMatch(/export function deploymentEnv\s*\(/);
    expect(opsSource).not.toMatch(/export function deploymentWebhookEnv\s*\(/);
    expect(opsSource).not.toMatch(/export function readinessItem\s*\(/);
    expect(opsSource).not.toMatch(/export function readinessFromGovernance\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterpriseOpsMetrics\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/function metricLine\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/const identityMetricsReadinessItemIds\s*=/);
    expect(opsDeploymentSource).not.toMatch(/export function buildEnterpriseOpsMetrics\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/export type SenaEnterpriseSaasOperationsReadiness\s*=/);
    expect(opsDeploymentSource).not.toMatch(/export function buildEnterpriseSaasOperationsReadiness\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/export type SenaEnterpriseDeploymentReadinessItem\s*=/);
    expect(opsDeploymentSource).not.toMatch(/export type SenaEnterpriseDeploymentReadiness\s*=/);
    expect(opsDeploymentSource).not.toMatch(/export function getEnterpriseDeploymentReadiness\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/export function readinessItem\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/export function readinessFromGovernance\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentDecision\s*=/);
    expect(opsDeploymentSource).not.toMatch(/export function buildEnterpriseOrganizationDeploymentDecisions\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/id: "native-managed-database"/);
    expect(opsDeploymentSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentEnv\s*=/);
    expect(opsDeploymentSource).not.toMatch(/export function deploymentEnv\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/export function deploymentWebhookEnv\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/export type SenaEnterpriseOrganizationDeploymentServiceEndpoint\s*=/);
    expect(opsDeploymentSource).not.toMatch(/export const enterpriseOrganizationDeploymentServiceEndpoints\s*=/);
    expect(opsDeploymentSource).not.toMatch(/id: "ops-deployment"/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseReleaseGateDecision\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseReleaseVerificationStatus\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseReleaseVerificationEvidence\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseReleaseGateReview\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseReleaseGateReviewInput\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseReleaseGateReviewList\s*=/);
    expect(opsSource).not.toMatch(/export const enterpriseReleaseGateDecisions\s*=/);
    expect(opsSource).not.toMatch(/export function isEnterpriseReleaseGateDecision\s*\(/);
    expect(opsSource).not.toMatch(/export function isEnterpriseReleaseVerificationStatus\s*\(/);
    expect(opsSource).not.toMatch(/export function summarizeReleaseGateReviews\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterpriseDeploymentReleaseGateEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function enterpriseReleaseGateIdentityProductionSnapshot\s*\(/);
    expect(opsSource).not.toMatch(/export function createEnterpriseReleaseGateReview\s*\(/);
    expect(opsSource).not.toMatch(/export function listEnterpriseReleaseGateReviews\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceStatus\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionProductionEvidenceReceipt\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptance\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceList\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceInput\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionCategory\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistStatus\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistItem\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionRegisterDecision\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionRegister\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseNativeAdapterCertificationStatus\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseNativeAdapterCertification\s*=/);
    expect(opsSource).not.toMatch(/export const enterprisePlatformDecisionIds\s*=/);
    expect(opsSource).not.toMatch(/export const enterprisePlatformDecisionAcceptanceStatuses\s*=/);
    expect(opsSource).not.toMatch(/export function isEnterprisePlatformDecisionId\s*\(/);
    expect(opsSource).not.toMatch(/export function isEnterprisePlatformDecisionAcceptanceStatus\s*\(/);
    expect(opsSource).not.toMatch(/export function enterpriseDeploymentMode\s*\(/);
    expect(opsSource).not.toMatch(/export function isSelfManagedEnterpriseMode\s*\(/);
    expect(opsSource).not.toMatch(/export function isSelfManagedIdentityDecision\s*\(/);
    expect(opsSource).not.toMatch(/export const selfManagedLocalPlatformDecisionIds\s*=/);
    expect(opsSource).not.toMatch(/export function isSelfManagedLocalPlatformDecision\s*\(/);
    expect(opsSource).not.toMatch(/export function selfManagedIdentityEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function selfManagedIdentityNextAction\s*\(/);
    expect(opsSource).not.toMatch(/export function selfManagedIdentityChecklistItems\s*\(/);
    expect(opsSource).not.toMatch(/export function platformDecisionCategory\s*\(/);
    expect(opsSource).not.toMatch(/export function platformDecisionAcceptanceCriteria\s*\(/);
    expect(opsSource).not.toMatch(/export function platformDecisionProductionBlocking\s*\(/);
    expect(opsSource).not.toMatch(/export function platformDecisionOwnerEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function latestPlatformDecisionAcceptances\s*\(/);
    expect(opsSource).not.toMatch(/export function platformDecisionAcceptedBridge\s*\(/);
    expect(opsSource).not.toMatch(/export function idpAcceptanceEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function provisioningOwnerAcceptanceEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function platformDecisionProductionEvidenceReceipt\s*\(/);
    expect(opsSource).not.toMatch(/export function summarizePlatformDecisionAcceptances\s*\(/);
    expect(opsSource).not.toMatch(/export function reviewEnterprisePlatformDecision\s*\(/);
    expect(opsSource).not.toMatch(/export function listEnterprisePlatformDecisionAcceptances\s*\(/);
    expect(opsSource).not.toMatch(/export function missingPlatformDecisionProductionEvidence\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterprisePlatformDecisionRegister\s*\(/);
    expect(opsSource).not.toMatch(/export function buildEnterpriseNativeAdapterCertification\s*\(/);
    expect(opsSource).not.toMatch(/export function requiredPlatformDecisionText\s*\(/);
    expect(opsSource).not.toMatch(/export function normalizedPlatformDecisionEvidenceUrl\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceStatus\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionCategory\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistStatus\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistItem\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export type SenaEnterpriseNativeAdapterCertificationStatus\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export type SenaEnterpriseNativeAdapterCertification\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export const enterprisePlatformDecisionIds\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export const enterprisePlatformDecisionAcceptanceStatuses\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function isEnterprisePlatformDecisionId\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function isEnterprisePlatformDecisionAcceptanceStatus\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function enterpriseDeploymentMode\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function isSelfManagedEnterpriseMode\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function isSelfManagedIdentityDecision\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export const selfManagedLocalPlatformDecisionIds\s*=/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function isSelfManagedLocalPlatformDecision\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function selfManagedIdentityEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function selfManagedIdentityNextAction\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function selfManagedIdentityChecklistItems\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function platformDecisionCategory\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function platformDecisionAcceptanceCriteria\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function platformDecisionProductionBlocking\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function platformDecisionOwnerEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function platformDecisionAcceptedBridge\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function idpAcceptanceEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function provisioningOwnerAcceptanceEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function platformDecisionChecklistEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function platformDecisionEvidenceChecklistItem\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function acceptedPlatformChecklistStatus\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function presentPlatformChecklistStatus\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function platformDecisionEvidenceChecklist\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function nativeAdapterSpec\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function nativeAdapterCertificationStatus\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/function nativeAdapterCertificationEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function buildEnterpriseNativeAdapterCertification\s*\(/);
    expect(opsPlatformDecisionChecklistSource).toMatch(/function platformDecisionChecklistEvidence\s*\(/);
    expect(opsPlatformDecisionChecklistSource).toMatch(/function platformDecisionEvidenceChecklistItem\s*\(/);
    expect(opsPlatformDecisionChecklistSource).toMatch(/function acceptedPlatformChecklistStatus\s*\(/);
    expect(opsPlatformDecisionChecklistSource).toMatch(/function presentPlatformChecklistStatus\s*\(/);
    expect(opsPlatformDecisionChecklistSource).toMatch(/export function platformDecisionEvidenceChecklist\s*\(/);
    expect(opsPlatformAdapterCertificationSource).toMatch(/function nativeAdapterSpec\s*\(/);
    expect(opsPlatformAdapterCertificationSource).toMatch(/function nativeAdapterCertificationStatus\s*\(/);
    expect(opsPlatformAdapterCertificationSource).toMatch(/function nativeAdapterCertificationEvidence\s*\(/);
    expect(opsPlatformAdapterCertificationSource).toMatch(/export function buildEnterpriseNativeAdapterCertification\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function requiredPlatformDecisionText\s*\(/);
    expect(opsPlatformDecisionsSource).not.toMatch(/export function normalizedPlatformDecisionEvidenceUrl\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationSample\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePostCutoverObservation\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationList\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationInput\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationSampleInput\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationCompletionInput\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveChecklist\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationDecision\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestation\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationInput\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationList\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseReleaseGateDraft\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveRollbackDrill\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveMonitor\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseGoLiveRehearsal\s*=/);
    expect(opsSource).not.toMatch(/export function listEnterprisePostCutoverObservations\s*\(/);
    expect(opsSource).not.toMatch(/export function startEnterprisePostCutoverObservation\s*\(/);
    expect(opsSource).not.toMatch(/export function recordEnterprisePostCutoverObservationSample\s*\(/);
    expect(opsSource).not.toMatch(/export function completeEnterprisePostCutoverObservation\s*\(/);
    expect(opsSource).not.toMatch(/export function createEnterpriseGoLiveAttestation\s*\(/);
    expect(opsSource).not.toMatch(/export function listEnterpriseGoLiveAttestations\s*\(/);
    expect(opsSource).not.toMatch(/export function getEnterpriseGoLiveRehearsal\s*\(/);
    expect(opsSource).not.toMatch(/function buildEnterpriseGoLiveRehearsal\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationSample\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterprisePostCutoverObservation\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationList\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationInput\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationSampleInput\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationCompletionInput\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export function postCutoverObservationList\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/export function listEnterprisePostCutoverObservations\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/export function startEnterprisePostCutoverObservation\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/export function recordEnterprisePostCutoverObservationSample\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/export function completeEnterprisePostCutoverObservation\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseOpsAlert\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseOpsAlerts\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseOpsAlertDeliveryResult\s*=/);
    expect(opsSource).not.toMatch(/export function alertingOwner\s*\(/);
    expect(opsSource).not.toMatch(/export function alertingChannel\s*\(/);
    expect(opsSource).not.toMatch(/export function alertingRunbookUrl\s*\(/);
    expect(opsSource).not.toMatch(/export function getEnterpriseOpsAlerts\s*\(/);
    expect(opsSource).not.toMatch(/export async function deliverEnterpriseOpsAlerts\s*\(/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseSecurityControlCategory\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseSecurityControl\s*=/);
    expect(opsSource).not.toMatch(/export type SenaEnterpriseSecurityPosture\s*=/);
    expect(opsSource).not.toMatch(/export function getEnterpriseSecurityPosture\s*\(/);
    expect(opsSource).not.toMatch(/from\s+"..\/enterprise"/);
    expect(opsAlertsSource).not.toMatch(/from\s+"..\/enterprise"/);
    expect(opsAuditSource).not.toMatch(/from\s+"..\/enterprise"/);
    expect(opsBackupSource).not.toMatch(/from\s+"..\/enterprise"/);
    expect(opsSecuritySource).not.toMatch(/from\s+"..\/enterprise"/);
    expect(opsStatusSource).not.toMatch(/from\s+"..\/enterprise"/);
    expect(opsSource).not.toMatch(/function now\s*\(/);
    expect(opsSource).not.toMatch(/function envValue\s*\(/);
    expect(opsSource).not.toMatch(/function positiveIntegerEnv\s*\(/);
    expect(opsSource).not.toMatch(/function normalizedBaseUrl\s*\(/);
    expect(opsSource).not.toMatch(/function sha256Text\s*\(/);
    expect(opsSource).not.toMatch(/function artifactSha256\s*\(/);
    expect(opsSource).not.toMatch(/function normalizeEmail\s*\(/);
    expect(opsSource).not.toMatch(/function authEmailHash\s*\(/);
    expect(opsSource).not.toMatch(/function authEmailDomain\s*\(/);
    expect(opsSource).not.toMatch(/const enterpriseDbDir\s*=/);
    expect(opsSource).not.toMatch(/const enterpriseDbPath\s*=/);
    expect(opsDeploymentSource).not.toMatch(/function positiveIntegerEnv\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/function normalizedBaseUrl\s*\(/);
    expect(opsDeploymentSource).not.toMatch(/const enterpriseDbDir\s*=/);
    expect(opsDeploymentSource).not.toMatch(/const enterpriseDbPath\s*=/);
    expect(opsStatusSource).not.toMatch(/function now\s*\(/);
    expect(opsStatusSource).not.toMatch(/function envValue\s*\(/);
    expect(opsStatusSource).not.toMatch(/function positiveIntegerEnv\s*\(/);
    expect(opsStatusSource).not.toMatch(/const enterpriseDbDir\s*=/);
    expect(opsStatusSource).not.toMatch(/const enterpriseDbPath\s*=/);
    expect(opsRuntimeSource).toMatch(/export const enterpriseDbDir\s*=/);
    expect(opsRuntimeSource).toMatch(/export const enterpriseDbPath\s*=/);
    expect(opsRuntimeSource).toMatch(/export const enterpriseDbPathHint\s*=/);
    expect(opsRuntimeSource).toMatch(/export const dbLockTimeoutMs\s*=/);
    expect(opsRuntimeSource).toMatch(/export const auditRetentionMaxEvents\s*=/);
    expect(opsRuntimeSource).toMatch(/export function now\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function envValue\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function positiveIntegerEnv\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function normalizedBaseUrl\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function sha256Text\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function artifactSha256\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function normalizeEmail\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function authEmailHash\s*\(/);
    expect(opsRuntimeSource).toMatch(/export function authEmailDomain\s*\(/);
    expect(opsAlertsSource).toContain("./ops-status");
    expect(opsAlertsRouteSource).toContain("@/lib/sena/enterprise/ops-alerts");
    expect(opsAlertsRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(opsMetricsRouteSource).toContain("@/lib/sena/enterprise/ops-metrics");
    expect(opsMetricsRouteSource).toContain("@/lib/sena/enterprise/ops-deployment-readiness");
    expect(opsMetricsRouteSource).toContain("@/lib/sena/enterprise/ops-status");
    expect(opsReadinessRouteSource).toContain("@/lib/sena/enterprise/ops-deployment-readiness");
    expect(opsReadinessRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(opsDeploymentRouteSource).toContain("@/lib/sena/enterprise/ops-deployment");
    expect(opsDeploymentRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(opsSaasOperationsRouteSource).toContain("@/lib/sena/enterprise/ops-saas-operations");
    expect(opsSaasOperationsRouteSource).toContain("@/lib/sena/enterprise/ops-deployment");
    expect(opsSaasOperationsRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(opsProductionEvidenceSource).toContain("./ops-runtime");
    expect(opsProductionEvidenceRouteSource).toContain("@/lib/sena/enterprise/ops-production-evidence");
    expect(opsProductionEvidenceRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(readFileSync(path.join(process.cwd(), "app", "api", "sena", "ops", "native-adapters", "route.ts"), "utf8"))
      .toContain("@/lib/sena/enterprise/ops-deployment");
    expect(opsStatusRouteSource).toContain("@/lib/sena/enterprise/ops-status");
    expect(governanceAuditRouteSource).toContain("@/lib/sena/enterprise/ops-audit");
    expect(governanceAuditRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(opsCapabilityAuditRouteSource).toContain("@/lib/sena/enterprise/ops-capability-audit");
    expect(opsReleaseGateRouteSource).toContain("@/lib/sena/enterprise/ops-release-gate");
    expect(opsReleaseGateRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(governanceBackupRouteSource).toContain("@/lib/sena/enterprise/ops-backup");
    expect(governanceBackupRouteSource).toContain("@/lib/sena/enterprise/ops-database-sync");
    expect(governanceBackupRouteSource).toContain("@/lib/sena/enterprise/ops-backup-restore");
    expect(governanceBackupRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(governanceSecurityRouteSource).toContain("@/lib/sena/enterprise/ops-security");
    expect(governanceSecurityRouteSource).not.toContain("@/lib/sena/enterprise/ops-governance");
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSecurityControlCategory\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSecurityControl\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseSecurityPosture\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseOpsAlert\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseOpsAlerts\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseOpsAlertDeliveryResult\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationSample\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePostCutoverObservation\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationList\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationSampleInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterprisePostCutoverObservationCompletionInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveChecklist\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationDecision\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestation\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationInput\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationList\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseReleaseGateDraft\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveRollbackDrill\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveMonitor\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseGoLiveRehearsal\s*=/);
    expect(facadeSource).not.toMatch(/export const enterpriseAuditEvents\s*:/);
    expect(facadeSource).not.toMatch(/export function isEnterpriseAuditEvent\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseAuditLog\s*\(/);
    expect(facadeSource).not.toMatch(/export function verifyEnterpriseAuditIntegrity\s*\(/);
    expect(facadeSource).not.toMatch(/export function appendAudit\s*\(/);
    expect(facadeSource).not.toMatch(/export function recordEnterpriseAudit\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseAuditLog\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterprisePostCutoverObservations\s*\(/);
    expect(facadeSource).not.toMatch(/export function startEnterprisePostCutoverObservation\s*\(/);
    expect(facadeSource).not.toMatch(/export function recordEnterprisePostCutoverObservationSample\s*\(/);
    expect(facadeSource).not.toMatch(/export function completeEnterprisePostCutoverObservation\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseGoLiveAttestation\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseGoLiveAttestations\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseOpsStatus\s*\(/);
    expect(facadeSource).not.toMatch(/export function buildEnterpriseOpsMetrics\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseOpsAlerts\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseOpsAlerts\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseSecurityPosture\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseBackup\s*\(/);
    expect(facadeSource).not.toMatch(/export function verifyEnterpriseBackup\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseBackup\s*\(/);
    expect(facadeSource).not.toMatch(/export async function deliverEnterpriseDatabaseSync\s*\(/);
    expect(facadeSource).not.toMatch(/export function restoreEnterpriseBackup\s*\(/);
    expect(facadeSource).not.toMatch(/export function getEnterpriseGoLiveRehearsal\s*\(/);
    expect(facadeSource).not.toMatch(/function buildEnterpriseGoLiveRehearsal\s*\(/);
    expect(facadeSource).not.toMatch(/function auditWebhookPayload\s*\(/);
    expect(facadeSource).not.toMatch(/function postAuditWebhook\s*\(/);
    expect(facadeSource).not.toMatch(/function dbWorkingCopy\s*\(/);
    expect(opsSource).not.toMatch(/function dbWorkingCopy\s*\(/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditEvent\s*=/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditLogEntry\s*=/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditIntegrity\s*=/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditWebhookDeliveryStatus\s*=/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditWebhookDelivery\s*=/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditDeliveryResult\s*=/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditLogQuery\s*=/);
    expect(opsAuditSource).toMatch(/export type SenaEnterpriseAuditLogResult\s*=/);
    expect(opsSource).toMatch(/export type SenaEnterpriseGovernanceCheck\s*=/);
    expect(opsSource).toMatch(/export type SenaEnterpriseGovernanceStatus\s*=/);
    expect(opsBackupSource).toMatch(/export type SenaEnterpriseBackupRecordCounts\s*=/);
    expect(opsBackupSource).toMatch(/export type SenaEnterpriseBackupPayload\s*=/);
    expect(opsBackupSource).toMatch(/export type SenaEnterpriseBackupArtifact\s*=/);
    expect(opsBackupSource).toMatch(/export type SenaEnterpriseBackupVerification\s*=/);
    expect(opsBackupSource).toMatch(/export type SenaEnterpriseBackupDeliveryResult\s*=/);
    expect(existsSync(opsDatabaseSyncPath)).toBe(true);
    expect(opsBackupSource).not.toMatch(/export type SenaEnterpriseDatabaseSyncResult\s*=/);
    expect(opsBackupSource).not.toMatch(/export type SenaEnterpriseBackupRestoreResult\s*=/);
    expect(opsDatabaseSyncSource).toMatch(/export type SenaEnterpriseDatabaseSyncResult\s*=/);
    expect(opsDatabaseSyncSource).toMatch(/export async function deliverEnterpriseDatabaseSync\s*\(/);
    expect(opsDatabaseSyncSource).toMatch(/function databaseSyncWebhookPayload\s*\(/);
    expect(opsDatabaseSyncSource).toMatch(/async function postDatabaseSyncWebhook\s*\(/);
    expect(opsDatabaseSyncSource).toMatch(/async function writeDatabaseSyncPostgres\s*\(/);
    expect(opsBackupRestoreSource).toMatch(/export type SenaEnterpriseBackupRestoreResult\s*=/);
    expect(opsBackupRestoreSource).toMatch(/export function restoreEnterpriseBackup\s*\(/);
    expect(opsBackupRestoreSource).toMatch(/function dbWorkingCopy\s*\(/);
    expect(opsBackupRestoreSource).toMatch(/function emptyBackupRestoreSummary\s*\(/);
    expect(opsBackupRestoreSource).toMatch(/function mergeById\s*</);
    expect(opsBackupRestoreSource).toMatch(/function ensureBackupRestorePermission\s*\(/);
    expect(opsStatusSource).toMatch(/export type SenaEnterpriseStorageEngine\s*=/);
    expect(opsStatusSource).toMatch(/export type SenaEnterprisePostgresStorageEvidence\s*=/);
    expect(opsStatusSource).toMatch(/export type SenaEnterpriseOpsStatus\s*=/);
    expect(opsDeploymentReadinessSource).toMatch(/export type SenaEnterpriseDeploymentReadinessItem\s*=/);
    expect(opsDeploymentReadinessSource).toMatch(/export type SenaEnterpriseDeploymentReadiness\s*=/);
    expect(opsDeploymentEnvSource).toMatch(/export type SenaEnterpriseOrganizationDeploymentEnv\s*=/);
    expect(opsDeploymentServiceEndpointsSource).toMatch(/export type SenaEnterpriseOrganizationDeploymentServiceEndpoint\s*=/);
    expect(opsDeploymentDecisionsSource).toMatch(/export type SenaEnterpriseOrganizationDeploymentDecision\s*=/);
    expect(opsDeploymentDecisionsSource).toMatch(/export function buildEnterpriseOrganizationDeploymentDecisions\s*\(/);
    expect(opsDeploymentSource).toMatch(/export type SenaEnterpriseOrganizationDeploymentPackage\s*=/);
    expect(opsPlatformDecisionsSource).toMatch(/export type SenaEnterprisePlatformDecisionProductionEvidenceReceipt\s*=/);
    expect(opsPlatformDecisionsSource).toMatch(/export type SenaEnterprisePlatformDecisionAcceptance\s*=/);
    expect(opsPlatformDecisionsSource).toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceList\s*=/);
    expect(opsPlatformDecisionsSource).toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceInput\s*=/);
    expect(opsPlatformDecisionsSource).toMatch(/export type SenaEnterprisePlatformDecisionRegisterDecision\s*=/);
    expect(opsPlatformDecisionsSource).toMatch(/export type SenaEnterprisePlatformDecisionRegister\s*=/);
    expect(opsPlatformAdapterCertificationSource).toMatch(/export type SenaEnterpriseNativeAdapterCertificationStatus\s*=/);
    expect(opsPlatformAdapterCertificationSource).toMatch(/export type SenaEnterpriseNativeAdapterCertification\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export type SenaEnterprisePlatformDecisionAcceptanceStatus\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export type SenaEnterprisePlatformDecisionCategory\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistStatus\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export type SenaEnterprisePlatformDecisionEvidenceChecklistItem\s*=/);
    expect(opsSaasOperationsSource).toMatch(/export type SenaEnterpriseSaasOperationsReadiness\s*=/);
    expect(opsCapabilityAuditSource).toMatch(/export type SenaEnterpriseCapabilityAuditStatus\s*=/);
    expect(opsCapabilityAuditSource).toMatch(/export type SenaEnterpriseCapabilityAuditItem\s*=/);
    expect(opsCapabilityAuditSource).toMatch(/export type SenaEnterpriseCapabilityAudit\s*=/);
    expect(opsReleaseGateSource).toMatch(/export type SenaEnterpriseReleaseGateDecision\s*=/);
    expect(opsReleaseGateSource).toMatch(/export type SenaEnterpriseReleaseVerificationStatus\s*=/);
    expect(opsReleaseGateSource).toMatch(/export type SenaEnterpriseReleaseVerificationEvidence\s*=/);
    expect(opsReleaseGateSource).toMatch(/export type SenaEnterpriseReleaseGateReview\s*=/);
    expect(opsReleaseGateSource).toMatch(/export type SenaEnterpriseReleaseGateReviewInput\s*=/);
    expect(opsReleaseGateSource).toMatch(/export type SenaEnterpriseReleaseGateReviewList\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export const enterprisePlatformDecisionIds\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export const enterprisePlatformDecisionAcceptanceStatuses\s*=/);
    expect(opsReleaseGateSource).toMatch(/export const enterpriseReleaseGateDecisions\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function isEnterprisePlatformDecisionId\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function isEnterprisePlatformDecisionAcceptanceStatus\s*\(/);
    expect(opsReleaseGateSource).toMatch(/export function isEnterpriseReleaseGateDecision\s*\(/);
    expect(opsReleaseGateSource).toMatch(/export function isEnterpriseReleaseVerificationStatus\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function enterpriseDeploymentMode\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function isSelfManagedEnterpriseMode\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function isSelfManagedIdentityDecision\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export const selfManagedLocalPlatformDecisionIds\s*=/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function isSelfManagedLocalPlatformDecision\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function selfManagedIdentityEvidence\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function selfManagedIdentityNextAction\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function selfManagedIdentityChecklistItems\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function platformDecisionCategory\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function platformDecisionAcceptanceCriteria\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function platformDecisionProductionBlocking\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function platformDecisionOwnerEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).toMatch(/export function latestPlatformDecisionAcceptances\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function platformDecisionAcceptedBridge\s*\(/);
    expect(opsPlatformDecisionChecklistSource).toMatch(/export function idpAcceptanceEvidence\s*\(/);
    expect(opsPlatformDecisionChecklistSource).toMatch(/export function provisioningOwnerAcceptanceEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).toMatch(/export function platformDecisionProductionEvidenceReceipt\s*\(/);
    expect(opsPlatformDecisionsSource).toMatch(/export function summarizePlatformDecisionAcceptances\s*\(/);
    expect(opsPlatformDecisionsSource).toMatch(/export function reviewEnterprisePlatformDecision\s*\(/);
    expect(opsPlatformDecisionsSource).toMatch(/export function listEnterprisePlatformDecisionAcceptances\s*\(/);
    expect(opsPlatformDecisionsSource).toMatch(/export function missingPlatformDecisionProductionEvidence\s*\(/);
    expect(opsPlatformDecisionsSource).toMatch(/export function buildEnterprisePlatformDecisionRegister\s*\(/);
    expect(opsDeploymentSource).toMatch(/export function getEnterprisePlatformDecisionRegister\s*\(/);
    expect(opsPlatformAdapterCertificationSource).toMatch(/export function buildEnterpriseNativeAdapterCertification\s*\(/);
    expect(opsDeploymentSource).toMatch(/export function getEnterpriseNativeAdapterCertification\s*\(/);
    expect(opsSaasOperationsSource).toMatch(/export function buildEnterpriseSaasOperationsReadiness\s*\(/);
    expect(opsDeploymentSource).toMatch(/export function getEnterpriseSaasOperationsReadiness\s*\(/);
    expect(opsSource).toMatch(/export function manageableTeamIds\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function requiredPlatformDecisionText\s*\(/);
    expect(opsPlatformDecisionPolicySource).toMatch(/export function normalizedPlatformDecisionEvidenceUrl\s*\(/);
    expect(opsStatusSource).toMatch(/export function enterprisePostgresStorageEngine\s*\(/);
    expect(opsStatusSource).toMatch(/export function enterprisePostgresStorageEvidence\s*\(/);
    expect(opsStatusSource).toMatch(/export function enterprisePostgresPublicEvidence\s*\(/);
    expect(opsDeploymentEnvSource).toMatch(/export function deploymentEnv\s*\(/);
    expect(opsDeploymentEnvSource).toMatch(/export function deploymentWebhookEnv\s*\(/);
    expect(opsDeploymentServiceEndpointsSource).toMatch(/export const enterpriseOrganizationDeploymentServiceEndpoints\s*=/);
    expect(opsStatusSource).toMatch(/export function opsTokenConfigured\s*\(/);
    expect(opsAlertsSource).toMatch(/export function alertingOwner\s*\(/);
    expect(opsAlertsSource).toMatch(/export function alertingChannel\s*\(/);
    expect(opsAlertsSource).toMatch(/export function alertingRunbookUrl\s*\(/);
    expect(opsAuditSource).toMatch(/export function latestAuditAt\s*\(/);
    expect(opsStatusSource).toMatch(/export function backupAgeSeconds\s*\(/);
    expect(opsAuditSource).toMatch(/export function auditRetentionWindowDays\s*\(/);
    expect(opsDeploymentReadinessSource).toMatch(/export function readinessItem\s*\(/);
    expect(opsSource).toMatch(/export function governanceCheck\s*\(/);
    expect(opsDeploymentReadinessSource).toMatch(/export function readinessFromGovernance\s*\(/);
    expect(opsReleaseGateSource).toMatch(/export function summarizeReleaseGateReviews\s*\(/);
    expect(opsReleaseGateSource).toMatch(/export function buildEnterpriseDeploymentReleaseGateEvidence\s*\(/);
    expect(opsReleaseGateSource).toMatch(/export function enterpriseReleaseGateIdentityProductionSnapshot\s*\(/);
    expect(opsReleaseGateSource).toMatch(/export function createEnterpriseReleaseGateReview\s*\(/);
    expect(opsReleaseGateSource).toMatch(/export function listEnterpriseReleaseGateReviews\s*\(/);
    expect(opsDeploymentReadinessSource).toMatch(/export function getEnterpriseDeploymentReadiness\s*\(/);
    expect(opsCapabilityAuditSource).toMatch(/export function getEnterpriseCapabilityAudit\s*\(/);
    expect(opsDeploymentSource).toMatch(/export function getEnterpriseOrganizationDeploymentPackage\s*\(/);
    expect(opsSource).toMatch(/export function getEnterpriseGovernanceStatus\s*\(/);
    expect(opsResponseSource).toMatch(/export function buildEnterprisePlatformDecisionListResponse\s*\(/);
    expect(opsResponseSource).toMatch(/export function buildEnterprisePlatformDecisionReviewResponse\s*\(/);
    expect(opsResponseSource).toMatch(/export function buildEnterpriseGoLiveRehearsalResponse\s*\(/);
    expect(opsResponseSource).toMatch(/export function buildEnterpriseGoLivePostResponse\s*\(/);
    expect(opsSecuritySource).toMatch(/export type SenaEnterpriseSecurityControlCategory\s*=/);
    expect(opsSecuritySource).toMatch(/export type SenaEnterpriseSecurityControl\s*=/);
    expect(opsSecuritySource).toMatch(/export type SenaEnterpriseSecurityPosture\s*=/);
    expect(opsAlertsSource).toMatch(/export type SenaEnterpriseOpsAlert\s*=/);
    expect(opsAlertsSource).toMatch(/export type SenaEnterpriseOpsAlerts\s*=/);
    expect(opsAlertsSource).toMatch(/export type SenaEnterpriseOpsAlertDeliveryResult\s*=/);
    expect(opsPostCutoverObservationsSource).toMatch(/export type SenaEnterprisePostCutoverObservationSample\s*=/);
    expect(opsPostCutoverObservationsSource).toMatch(/export type SenaEnterprisePostCutoverObservation\s*=/);
    expect(opsPostCutoverObservationsSource).toMatch(/export type SenaEnterprisePostCutoverObservationList\s*=/);
    expect(opsPostCutoverObservationsSource).toMatch(/export type SenaEnterprisePostCutoverObservationInput\s*=/);
    expect(opsPostCutoverObservationsSource).toMatch(/export type SenaEnterprisePostCutoverObservationSampleInput\s*=/);
    expect(opsPostCutoverObservationsSource).toMatch(/export type SenaEnterprisePostCutoverObservationCompletionInput\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterpriseGoLiveChecklist\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationDecision\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestation\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationInput\s*=/);
    expect(opsGoLiveSource).not.toMatch(/export type SenaEnterpriseGoLiveAttestationList\s*=/);
    expect(opsGoLiveAttestationsSource).toMatch(/export type SenaEnterpriseGoLiveChecklist\s*=/);
    expect(opsGoLiveAttestationsSource).toMatch(/export type SenaEnterpriseGoLiveAttestationDecision\s*=/);
    expect(opsGoLiveAttestationsSource).toMatch(/export type SenaEnterpriseGoLiveAttestation\s*=/);
    expect(opsGoLiveAttestationsSource).toMatch(/export type SenaEnterpriseGoLiveAttestationInput\s*=/);
    expect(opsGoLiveAttestationsSource).toMatch(/export type SenaEnterpriseGoLiveAttestationList\s*=/);
    expect(opsGoLiveSource).toMatch(/export type SenaEnterpriseReleaseGateDraft\s*=/);
    expect(opsGoLiveSource).toMatch(/export type SenaEnterpriseGoLiveRollbackDrill\s*=/);
    expect(opsGoLiveSource).toMatch(/export type SenaEnterpriseGoLiveMonitor\s*=/);
    expect(opsGoLiveSource).toMatch(/export type SenaEnterpriseGoLiveRehearsal\s*=/);
    expect(opsAuditSource).toMatch(/export const enterpriseAuditEvents\s*:/);
    expect(opsAuditSource).toMatch(/export function isEnterpriseAuditEvent\s*\(/);
    expect(opsAuditSource).toMatch(/export function latestAuditAt\s*\(/);
    expect(opsAuditSource).toMatch(/export function auditRetentionWindowDays\s*\(/);
    expect(opsAuditSource).toMatch(/export function listEnterpriseAuditLog\s*\(/);
    expect(opsAuditSource).toMatch(/export function verifyEnterpriseAuditIntegrity\s*\(/);
    expect(opsAuditSource).toMatch(/export function appendAudit\s*\(/);
    expect(opsAuditSource).toMatch(/export function recordEnterpriseAudit\s*\(/);
    expect(opsAuditSource).toMatch(/export async function deliverEnterpriseAuditLog\s*\(/);
    expect(opsPostCutoverObservationsSource).toMatch(/export function postCutoverObservationList\s*\(/);
    expect(opsPostCutoverObservationsSource).toMatch(/export function listEnterprisePostCutoverObservations\s*\(/);
    expect(opsPostCutoverObservationsSource).toMatch(/export function startEnterprisePostCutoverObservation\s*\(/);
    expect(opsPostCutoverObservationsSource).toMatch(/export function recordEnterprisePostCutoverObservationSample\s*\(/);
    expect(opsPostCutoverObservationsSource).toMatch(/export function completeEnterprisePostCutoverObservation\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/export function createEnterpriseGoLiveAttestation\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/export function listEnterpriseGoLiveAttestations\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/function normalizeGoLiveChecklist\s*\(/);
    expect(opsGoLiveSource).not.toMatch(/function summarizeGoLiveAttestations\s*\(/);
    expect(opsGoLiveAttestationsSource).toMatch(/export function createEnterpriseGoLiveAttestation\s*\(/);
    expect(opsGoLiveAttestationsSource).toMatch(/export function listEnterpriseGoLiveAttestations\s*\(/);
    expect(opsGoLiveAttestationsSource).toMatch(/function normalizeGoLiveChecklist\s*\(/);
    expect(opsGoLiveAttestationsSource).toMatch(/function summarizeGoLiveAttestations\s*\(/);
    expect(opsStatusSource).toMatch(/export function getEnterpriseOpsStatus\s*\(/);
    expect(opsMetricsSource).toMatch(/function metricLine\s*\(/);
    expect(opsMetricsSource).toMatch(/const identityMetricsReadinessItemIds\s*=/);
    expect(opsMetricsSource).toMatch(/export function buildEnterpriseOpsMetrics\s*\(/);
    expect(opsAlertsSource).toMatch(/export function getEnterpriseOpsAlerts\s*\(/);
    expect(opsAlertsSource).toMatch(/export async function deliverEnterpriseOpsAlerts\s*\(/);
    expect(opsSecuritySource).toMatch(/export function getEnterpriseSecurityPosture\s*\(/);
    expect(opsBackupSource).toMatch(/export function createEnterpriseBackup\s*\(/);
    expect(opsBackupSource).toMatch(/export function verifyEnterpriseBackup\s*\(/);
    expect(opsBackupSource).toMatch(/export async function deliverEnterpriseBackup\s*\(/);
    expect(opsBackupSource).not.toMatch(/export async function deliverEnterpriseDatabaseSync\s*\(/);
    expect(opsBackupSource).not.toMatch(/function databaseSyncWebhookPayload\s*\(/);
    expect(opsBackupSource).not.toMatch(/async function postDatabaseSyncWebhook\s*\(/);
    expect(opsBackupSource).not.toMatch(/async function writeDatabaseSyncPostgres\s*\(/);
    expect(opsBackupSource).not.toMatch(/export function restoreEnterpriseBackup\s*\(/);
    expect(opsBackupSource).not.toMatch(/function dbWorkingCopy\s*\(/);
    expect(opsBackupSource).not.toMatch(/function emptyBackupRestoreSummary\s*\(/);
    expect(opsBackupSource).not.toMatch(/function mergeById\s*</);
    expect(opsBackupSource).not.toMatch(/function ensureBackupRestorePermission\s*\(/);
    expect(opsBackupRestoreSource).toMatch(/export function restoreEnterpriseBackup\s*\(/);
    expect(opsGoLiveSource).toMatch(/export function getEnterpriseGoLiveRehearsal\s*\(/);
    expect(opsGoLiveSource).toMatch(/function buildEnterpriseGoLiveRehearsal\s*\(/);
    expect(opsAuditSource).toMatch(/function auditWebhookPayload\s*\(/);
    expect(opsAuditSource).toMatch(/function postAuditWebhook\s*\(/);
  });

  it("wraps enterprise persistence behind an explicit state store seam", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const stateSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "state.ts"), "utf8");
    const stateContractConsumerPaths = [
      path.join(process.cwd(), "lib", "sena", "enterprise-postgres.ts"),
      ...[
        "auth-invitations.ts",
        "auth-login.ts",
        "auth-registration.ts",
        "auth-sso.ts",
        "expert-review.ts",
        "identity-production-evidence.ts",
        "notifications-email.ts",
        "notifications-delivery.ts",
        "ops-alerts.ts",
        "ops-audit.ts",
        "ops-backup-restore.ts",
        "ops-backup.ts",
        "ops-capability-audit.ts",
        "ops-database-sync.ts",
        "ops-go-live-attestations.ts",
        "ops-go-live.ts",
        "ops-governance.ts",
        "ops-platform-decisions.ts",
        "ops-response-builders.ts",
        "ops-security.ts",
        "ops-status.ts",
        "provisioning.ts",
        "reliability-runs.ts",
        "team-collaboration.ts",
        "team-memberships.ts",
        "team-project.ts",
        "validation-runs.ts"
      ].map((fileName) => path.join(process.cwd(), "lib", "sena", "enterprise", fileName))
    ];
    for (const filePath of stateContractConsumerPaths) {
      expect(existsSync(filePath)).toBe(true);
    }
    const stateContractConsumerSources = stateContractConsumerPaths.map((filePath) => ({
      filePath,
      source: readFileSync(filePath, "utf8")
    }));
    let current = emptyEnterpriseDb();
    const writes: string[] = [];
    const saves: string[] = [];
    const store: SenaEnterpriseStateStore = createEnterpriseStateStore({
      read: () => current,
      write: (next) => {
        writes.push(next.schemaVersion);
        current = next;
      },
      save: (next) => {
        saves.push(next.schemaVersion);
        current = next;
      }
    });

    const first = store.read();
    store.write({ ...first, teams: [{ id: "team_1" } as never] });
    store.save({ ...store.read(), users: [{ id: "user_1" } as never] });

    expect(store.kind).toBe("synchronous-enterprise-state-store");
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseUser\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseTeam\s*=/);
    expect(facadeSource).not.toMatch(/export type SenaEnterpriseDb\s*=/);
    expect(facadeSource).not.toMatch(/function emptyDb\s*\(/);
    expect(facadeSource).not.toMatch(/function normalizeDb\s*\(/);
    expect(facadeSource).not.toMatch(/function pruneEnterpriseDbBeforeSave\s*\(/);
    expect(facadeSource).not.toMatch(/function enterpriseStateStore\s*\(/);
    expect(facadeSource).not.toMatch(/export function readEnterpriseDb\s*\(/);
    expect(facadeSource).not.toMatch(/export function writeEnterpriseDb\s*\(/);
    expect(facadeSource).not.toMatch(/export function saveDb\s*\(/);
    expect(facadeSource).not.toMatch(/export function createFileEnterpriseStateStore\s*\(/);
    expect(stateSource).toMatch(/export type SenaEnterpriseUser\s*=/);
    expect(stateSource).toMatch(/export type SenaEnterpriseTeam\s*=/);
    expect(stateSource).toMatch(/export type SenaEnterpriseDb\s*=/);
    expect(stateSource).toMatch(/export function emptyEnterpriseDb\s*\(/);
    expect(stateSource).toMatch(/export function normalizeEnterpriseDb\s*\(/);
    expect(stateSource).toMatch(/function pruneEnterpriseDbBeforeSave\s*\(/);
    expect(stateSource).toMatch(/function enterpriseStateStore\s*\(/);
    expect(stateSource).toMatch(/export function readEnterpriseDb\s*\(/);
    expect(stateSource).toMatch(/export function writeEnterpriseDb\s*\(/);
    expect(stateSource).toMatch(/export function saveDb\s*\(/);
    expect(stateSource).toMatch(/export function createConfiguredFileEnterpriseStateStore\s*\(/);
    for (const { filePath, source } of stateContractConsumerSources) {
      expect(source, filePath).not.toMatch(
        /import\s+(?:type\s+)?\{[^}]*SenaEnterprise(?:Db|Team|User)[^}]*\}\s*from\s+"(?:\.\.\/enterprise|\.\/enterprise)";/
      );
      expect(source, filePath).not.toMatch(
        /import\s+\{[^}]*\b(?:readEnterpriseDb|writeEnterpriseDb|saveDb|createFileEnterpriseStateStore)\b[^}]*\}\s*from\s+"(?:\.\.\/enterprise|\.\/enterprise)";/
      );
    }
    expect(current.teams).toHaveLength(1);
    expect(current.users).toHaveLength(1);
    expect(writes).toEqual(["sena-enterprise-db/v1"]);
    expect(saves).toEqual(["sena-enterprise-db/v1"]);
  });

  it("owns the file-backed local enterprise persistence adapter in the state module", () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-state-boundary-"));
    try {
      const store = createFileEnterpriseStateStore({
        dbDir: enterpriseDbDir,
        createEmptyDb: emptyEnterpriseDb,
        validateDb: (db) => {
          if (db.schemaVersion !== "sena-enterprise-db/v1") {
            throw new Error("unsupported schema");
          }
        },
        normalizeDb: (db) => ({
          ...db,
          teams: db.teams ?? [],
          sessions: db.sessions ?? []
        }),
        pruneBeforeSave: (db) => ({
          ...db,
          sessions: db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now())
        })
      });

      const initial = store.read();
      const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
      expect(initial.schemaVersion).toBe("sena-enterprise-db/v1");
      expect(existsSync(dbPath)).toBe(true);

      store.write({
        ...initial,
        teams: [{ id: "team_persisted" } as never]
      });
      expect(store.read().teams.map((team) => team.id)).toEqual(["team_persisted"]);
      expect(existsSync(`${dbPath}.bak`)).toBe(true);

      store.save({
        ...store.read(),
        sessions: [
          { id: "expired", expiresAt: new Date(Date.now() - 60_000).toISOString() } as never,
          { id: "live", expiresAt: new Date(Date.now() + 60_000).toISOString() } as never
        ]
      });

      expect(store.read().sessions.map((session) => session.id)).toEqual(["live"]);
      expect(store.adapter).toBe("file-backed-json");
      expect(store.paths.dbDir).toBe(enterpriseDbDir);

      expect(store.probeWrite().writeProbe).toBe("pass");
      expect(store.probeLock().lockProbe).toBe("pass");
      expect(store.fileStats()).toMatchObject({
        dbFileExists: true,
        dbBackupExists: true
      });
    } finally {
      rmSync(enterpriseDbDir, { recursive: true, force: true });
    }
  });

  it("deepens reliability and validation route response behavior in the enterprise module", () => {
    const facadeSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise.ts"), "utf8");
    const reliabilitySource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "reliability-runs.ts"), "utf8");
    const validationSource = readFileSync(path.join(process.cwd(), "lib", "sena", "enterprise", "validation-runs.ts"), "utf8");
    const validationRun = {
      id: "val_1",
      status: "approved",
      projectId: "project_1",
      comparisonCount: 2,
      pTwoSided: 0.0321,
      minHolmAdjustedP: 0.0642,
      preregistrationPlan: { planHash: "plan_hash" },
      parityEvidence: {
        status: "ready-for-review",
        validationRunHash: "parity_hash",
        formalInference: { status: "model-required" }
      }
    };
    const reliabilityRun = {
      id: "rel_1",
      status: "pending-review",
      projectId: "project_1",
      meanPairwiseKappa: 0.81,
      krippendorffAlphaNominal: 0.76,
      adjudicationCoverage: {
        coverageRate: 0.9,
        unresolvedDisagreements: 1
      }
    };
    const context = { user: { id: "user_1" }, teams: [], memberships: [] } as never;

    expect(buildEnterpriseValidationRunHeaders(validationRun as never)).toMatchObject({
      "x-sena-validation-run-id": "val_1",
      "x-sena-validation-status": "approved",
      "x-sena-validation-comparison-count": "2",
      "x-sena-validation-parity-status": "ready-for-review"
    });
    expect(buildEnterpriseReliabilityRunHeaders(reliabilityRun as never)).toMatchObject({
      "x-sena-reliability-run-id": "rel_1",
      "x-sena-reliability-status": "pending-review",
      "x-sena-unresolved-disagreements": "1"
    });

    const validationList = buildEnterpriseValidationRunListResponse(context, { teamId: "team_1" }, () => [validationRun as never]);
    const reliabilityList = buildEnterpriseReliabilityRunListResponse(context, { projectId: "project_1" }, () => [reliabilityRun as never]);
    const review = buildEnterpriseValidationRunReviewResponse(context, {
      runId: "val_1",
      status: "approved",
      notes: "ready"
    }, () => validationRun as never);

    expect(validationList.body.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.validationRunList);
    expect(validationList.body.validationRuns).toHaveLength(1);
    expect(reliabilityList.body.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.reliabilityRunList);
    expect(reliabilityList.body.reliabilityRuns).toHaveLength(1);
    expect(review.body.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.validationRunReview);
    expect(review.headers?.["x-sena-validation-run-id"]).toBe("val_1");
    expect(facadeSource).not.toMatch(/export function createEnterpriseReliabilityRun\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseReliabilityAdjudications\s*\(/);
    expect(facadeSource).not.toMatch(/export function reviewEnterpriseReliabilityRun\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseReliabilityRuns\s*\(/);
    expect(facadeSource).not.toMatch(/export function createEnterpriseValidationRun\s*\(/);
    expect(facadeSource).not.toMatch(/export function reviewEnterpriseValidationRun\s*\(/);
    expect(facadeSource).not.toMatch(/export function listEnterpriseValidationRuns\s*\(/);
    expect(reliabilitySource).toMatch(/export function createEnterpriseReliabilityRun\s*\(/);
    expect(reliabilitySource).toMatch(/export function createEnterpriseReliabilityAdjudications\s*\(/);
    expect(reliabilitySource).toMatch(/export function reviewEnterpriseReliabilityRun\s*\(/);
    expect(reliabilitySource).toMatch(/export function listEnterpriseReliabilityRuns\s*\(/);
    expect(validationSource).toMatch(/export function createEnterpriseValidationRun\s*\(/);
    expect(validationSource).toMatch(/export function reviewEnterpriseValidationRun\s*\(/);
    expect(validationSource).toMatch(/export function listEnterpriseValidationRuns\s*\(/);
  });

  it("collapses group-comparison validation POST behavior behind the enterprise validation interface", () => {
    const context = {
      user: { id: "user_1", name: "Reviewer" },
      teams: [{ id: "team_1" }],
      memberships: []
    } as never;
    const createdInputs: Array<{ teamId: string; resultSchema: string }> = [];

    const response = buildEnterpriseGroupComparisonValidationResponse(context, {
      teamId: "team_1",
      dataset: lessonStudySenaContract,
      groupField: "role",
      groupA: "Lead teacher",
      groupB: "Peer observer",
      metric: "bridgeScore",
      iterations: 100,
      bootstrapIterations: 100
    }, {
      createValidationRun: (_context, input) => {
        createdInputs.push({
          teamId: input.teamId,
          resultSchema: input.result.schemaVersion
        });
        return {
          id: "val_generated",
          status: "pending-review",
          comparisonCount: 1,
          pTwoSided: "permutation" in input.result ? input.result.permutation.pTwoSided : input.result.primary.permutation.pTwoSided,
          result: input.result
        } as never;
      }
    });

    expect(response.body.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.groupComparison);
    expect(response.body.validationRun.id).toBe("val_generated");
    expect(response.headers?.["x-sena-validation-run-id"]).toBe("val_generated");
    expect(createdInputs).toEqual([{
      teamId: "team_1",
      resultSchema: SENA_SCHEMA_VERSIONS.groupComparison
    }]);
  });

  it("collapses JSON reliability POST behavior behind the enterprise validation interface", () => {
    const context = {
      user: { id: "user_1", name: "Reviewer" },
      teams: [{ id: "team_1" }],
      memberships: []
    } as never;

    const response = buildEnterpriseReliabilityJsonRunResponse(context, {
      reviewer: "Coder Lead",
      rows: []
    }, {
      prepareJsonRequest: () => ({
        schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityPreparedInput,
        source: "json-annotations",
        teamId: undefined,
        projectId: "project_1",
        reviewer: "Coder Lead",
        fileCount: 1,
        annotationCount: 0,
        inputFiles: [],
        dashboard: {
          coderCount: 0,
          itemCount: 0,
          codeCount: 0,
          meanPairwiseKappa: 0,
          krippendorffAlphaNominal: 0,
          disagreementCount: 0,
          warnings: [],
          adjudicationQueue: []
        },
        reviewPatch: {},
        warnings: []
      } as never),
      createReliabilityRun: (_context, input) => ({
        id: "rel_generated",
        status: "pending-review",
        projectId: input.projectId,
        meanPairwiseKappa: input.dashboard.meanPairwiseKappa,
        krippendorffAlphaNominal: input.dashboard.krippendorffAlphaNominal,
        adjudicationCoverage: {
          coverageRate: 1,
          unresolvedDisagreements: 0
        }
      } as never)
    });

    const body = response.body as typeof response.body & { requestSchemaVersion: string };
    expect(body.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.reliabilityResponse);
    expect(body.requestSchemaVersion).toBe(SENA_SCHEMA_VERSIONS.reliabilityJsonRequest);
    expect(body.reliabilityRun.id).toBe("rel_generated");
    expect(response.headers?.["x-sena-reliability-run-id"]).toBe("rel_generated");
  });

  it("builds reliability run responses through one enterprise interface", () => {
    const context = {
      user: { id: "user_1", name: "Reviewer" },
      teams: [{ id: "team_1" }],
      memberships: []
    } as never;
    const response = buildEnterpriseReliabilityRunResponse(context, {
      teamId: "team_1",
      reviewer: "Reviewer",
      fileCount: 1,
      annotationCount: 0,
      inputFiles: [],
      dashboard: {
        coderCount: 0,
        itemCount: 0,
        codeCount: 0,
        meanPairwiseKappa: 0,
        krippendorffAlphaNominal: 0,
        disagreementCount: 0,
        warnings: [],
        adjudicationQueue: []
      },
      reviewPatch: {}
    } as never, {
      createReliabilityRun: (_context, input) => ({
        id: "rel_form",
        status: "pending-review",
        meanPairwiseKappa: input.dashboard.meanPairwiseKappa,
        krippendorffAlphaNominal: input.dashboard.krippendorffAlphaNominal,
        adjudicationCoverage: {
          coverageRate: 1,
          unresolvedDisagreements: 0
        }
      } as never)
    });

    expect(response.body.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.reliabilityResponse);
    expect(response.body.reliabilityRun.id).toBe("rel_form");
    expect(response.headers?.["x-sena-reliability-run-id"]).toBe("rel_form");
  });
});
