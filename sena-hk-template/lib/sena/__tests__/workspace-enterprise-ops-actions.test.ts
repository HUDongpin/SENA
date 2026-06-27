import { describe, expect, it } from "vitest";
import {
  deliverEnterpriseAuditLogAction,
  deliverEnterpriseBackupAction,
  deliverEnterpriseOpsAlertsAction,
  exportEnterpriseAuditCsvAction,
  exportEnterpriseJsonArtifactAction,
  getEnterpriseGoLiveRehearsalAction,
  refreshEnterpriseProvisioningReadinessAction,
  submitEnterpriseGoLiveAttestationAction,
  submitEnterprisePlatformDecisionReviewAction,
  submitEnterpriseReleaseGateReviewAction,
  syncEnterpriseDatabaseAction
} from "../../../components/sena/workspace/enterprise-ops-actions";

describe("SENA workspace enterprise ops action helpers", () => {
  const jsonHeaders = async () => ({
    "content-type": "application/json",
    "x-sena-csrf-token": "csrf-token"
  });

  it("centralizes platform decision and release gate review POSTs", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (String(input).includes("release-gate")) {
        return new Response(JSON.stringify({ review: { releaseVersion: "v1", decision: "approved" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ acceptance: { decisionId: "institution-idp-approval", status: "accepted" } }), { status: 200 });
    };

    await submitEnterprisePlatformDecisionReviewAction({
      teamId: "team-1",
      decisionId: "institution-idp-approval",
      status: "accepted",
      acceptedBridge: true,
      ownerName: "Owner",
      ownerRole: "IT",
      environment: "production",
      evidenceUrl: "https://example.edu/evidence",
      productionEvidenceIds: ["idp-tenant-approval"],
      productionEvidenceVerifiedAt: "2026-06-19T00:00:00.000Z",
      requestPacketPolicyHash: "a".repeat(64),
      notes: "Approved"
    }, { jsonHeaders, fetchImpl });
    await submitEnterpriseReleaseGateReviewAction({
      teamId: "team-1",
      environment: "production",
      releaseVersion: "v1",
      decision: "approved",
      approverName: "Approver",
      approverRole: "PI",
      notes: "Ready",
      verificationCommand: "npm run sena:pilot:verify",
      verificationEvidence: {
        status: "passed",
        summary: "Passed",
        outputSha256: "b".repeat(64)
      }
    }, { jsonHeaders, fetchImpl });

    expect(requests.map((request) => request.url)).toEqual([
      "/api/sena/ops/platform-decisions",
      "/api/sena/ops/release-gate"
    ]);
    expect(requests.map((request) => request.init?.method)).toEqual(["POST", "POST"]);
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
      teamId: "team-1",
      decisionId: "institution-idp-approval",
      acceptedBridge: true
    });
    expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({
      releaseVersion: "v1",
      verificationCommand: "npm run sena:pilot:verify"
    });
  });

  it("centralizes governance export and delivery requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (String(input).includes("format=csv")) {
        return new Response("id,event\n1,login", { status: 200 });
      }
      return new Response(JSON.stringify({
        ok: true,
        status: "checked",
        summary: { delivered: 1, failed: 0, skipped: 0 },
        backup: { recordCounts: { teams: 1, projects: 2, auditEvents: 3 } },
        alerts: { summary: { firing: 1, critical: 0 } }
      }), { status: 200 });
    };

    await exportEnterpriseJsonArtifactAction("/api/sena/governance/health", "Health", { fetchImpl });
    const auditCsv = await exportEnterpriseAuditCsvAction({ teamId: "team-1" }, { fetchImpl });
    await deliverEnterpriseAuditLogAction({ teamId: "team-1" }, { jsonHeaders, fetchImpl });
    await deliverEnterpriseBackupAction({ teamId: "team-1" }, { jsonHeaders, fetchImpl });
    await syncEnterpriseDatabaseAction({ teamId: "team-1" }, { jsonHeaders, fetchImpl });
    await deliverEnterpriseOpsAlertsAction({ jsonHeaders, fetchImpl });

    expect(auditCsv).toBe("id,event\n1,login");
    expect(requests.map((request) => request.url)).toEqual([
      "/api/sena/governance/health",
      "/api/sena/governance/audit?format=csv&integrity=1&teamId=team-1",
      "/api/sena/governance/audit",
      "/api/sena/governance/backup",
      "/api/sena/governance/backup",
      "/api/sena/ops/alerts"
    ]);
    expect(JSON.parse(String(requests[2].init?.body))).toEqual({ teamId: "team-1", force: true, limit: 100 });
    expect(JSON.parse(String(requests[3].init?.body))).toEqual({ action: "deliver", teamId: "team-1" });
    expect(JSON.parse(String(requests[4].init?.body))).toEqual({ action: "sync-database", teamId: "team-1" });
    expect(JSON.parse(String(requests[5].init?.body))).toEqual({ action: "deliver" });
  });

  it("centralizes go-live and provisioning readiness requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (String(input).includes("deployment")) {
        return new Response(JSON.stringify({
          schemaVersion: "sena-enterprise-organization-deployment/v1",
          status: "review",
          summary: {},
          serviceEndpoints: [],
          env: []
        }), { status: 200 });
      }
      if (String(input).includes("identity-production-evidence")) {
        return new Response(JSON.stringify({
          schemaVersion: "sena-enterprise-identity-production-evidence/v1",
          platformRequestPacket: { summary: { blockingRequests: 0 } }
        }), { status: 200 });
      }
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ attestation: { releaseVersion: "v1", decision: "approved" } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        schemaVersion: "sena-enterprise-go-live-rehearsal/v1",
        releaseGateDraft: {
          schemaVersion: "sena-enterprise-release-gate-draft/v1",
          decision: "approved",
          environment: "production",
          releaseVersion: "v1",
          notes: "Ready",
          verificationEvidence: { status: "passed", summary: "Passed" }
        }
      }), { status: 200 });
    };

    const rehearsal = await getEnterpriseGoLiveRehearsalAction({ teamId: "team-1" }, { fetchImpl });
    await submitEnterpriseGoLiveAttestationAction({
      teamId: "team-1",
      environment: "production",
      releaseVersion: "v1",
      decision: "approved",
      attesterName: "Approver",
      attesterRole: "PI",
      notes: "Ready",
      checklist: {
        rehearsalReviewed: true,
        releaseGateDraftReviewed: true,
        verificationEvidenceReviewed: true,
        rollbackOwnerConfirmed: true,
        platformOwnerDecisionReviewed: true
      }
    }, { jsonHeaders, fetchImpl });
    const readiness = await refreshEnterpriseProvisioningReadinessAction({ teamId: "team-1" }, { fetchImpl });

    expect(rehearsal.releaseGateDraft.releaseVersion).toBe("v1");
    expect(readiness.deployment.schemaVersion).toBe("sena-enterprise-organization-deployment/v1");
    expect(requests.map((request) => request.url)).toEqual([
      "/api/sena/ops/go-live-rehearsal?teamId=team-1",
      "/api/sena/ops/go-live-rehearsal",
      "/api/sena/ops/deployment?teamId=team-1",
      "/api/sena/ops/identity-production-evidence?teamId=team-1"
    ]);
  });
});
