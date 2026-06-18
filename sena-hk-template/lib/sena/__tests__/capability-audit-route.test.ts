import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const capabilityAuditRouteTestTimeoutMs = 30_000;

describe("SENA capability audit route", () => {
  it("returns machine-readable auth production blocker headers for ops gating", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-capability-audit-route-"));
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:00:00.000Z"));
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const enterprise = await import("../enterprise");
      const identityProductionEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const route = await import("../../../app/api/sena/ops/capability-audit/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/capability-audit", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        capabilities?: Array<{
          id: string;
          status: string;
          remainingPlatformDecisions: string[];
          requiredArtifacts: string[];
          nextAction: string;
        }>;
        identityProductionEvidence?: {
          schemaVersion?: string;
          dossierDigest?: string;
          evidenceBindingDigest?: string;
          receiptArchiveManifest?: {
            archiveManifestDigest?: string;
            evidence?: string[];
          };
          rotationFreshness?: {
            status?: string;
            checks?: Array<{
              id: string;
              status: string;
            }>;
          };
          platformRequestPacket?: {
            summary?: {
              blockingRequests?: number;
              receiptReviewRequests?: number;
            };
            evidence?: string[];
            requests?: Array<{
              decisionId: string;
              missingProductionEvidenceIds: string[];
              missingTechnicalPrerequisiteEvidenceIds: string[];
            }>;
          };
          releaseGate?: {
            productionBlockingDecisionIds?: string[];
          };
          institutionActionPlan?: {
            digest?: string;
            summary?: {
              blockingLanes?: number;
              readyLanes?: number;
              submissionPath?: string;
            };
          };
        };
      };
      const authCapability = body.capabilities?.find((capability) => capability.id === "auth-login-register-sso");

      expect(response.status).toBe(200);
      expect(authCapability).toEqual(expect.objectContaining({
        status: "review",
        remainingPlatformDecisions: expect.arrayContaining([
          "institution-idp-approval",
          "institution-provisioning-owner"
        ]),
        requiredArtifacts: expect.arrayContaining([
          "sena-enterprise-identity-production-evidence/v1",
          "sena-enterprise-identity-cutover-checklist/v1"
        ])
      }));
      expect(response.headers.get("x-sena-auth-capability-status")).toBe(authCapability?.status);
      expect(response.headers.get("x-sena-auth-capability-remaining-platform-decisions")).toBe(authCapability?.remainingPlatformDecisions.join("|"));
      expect(response.headers.get("x-sena-auth-capability-required-artifacts")).toBe(authCapability?.requiredArtifacts.join("|"));
      expect(response.headers.get("x-sena-auth-capability-next-action")).toBe(authCapability?.nextAction);
      expect(response.headers.get("x-sena-identity-production-evidence-digest")).toBe(identityProductionEvidence.dossierDigest);
      expect(response.headers.get("x-sena-identity-evidence-binding-digest")).toBe(identityProductionEvidence.evidenceBindingDigest);
      expect(response.headers.get("x-sena-identity-receipt-archive-manifest-digest")).toBe(identityProductionEvidence.receiptArchiveManifest.archiveManifestDigest);
      expect(body.identityProductionEvidence).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-evidence/v1",
        dossierDigest: identityProductionEvidence.dossierDigest,
        evidenceBindingDigest: identityProductionEvidence.evidenceBindingDigest
      }));
      expect(body.identityProductionEvidence?.receiptArchiveManifest?.archiveManifestDigest)
        .toBe(identityProductionEvidence.receiptArchiveManifest.archiveManifestDigest);
      expect(response.headers.get("x-sena-identity-production-evidence-digest")).toBe(body.identityProductionEvidence?.dossierDigest);
      expect(response.headers.get("x-sena-identity-evidence-binding-digest")).toBe(body.identityProductionEvidence?.evidenceBindingDigest);
      expect(response.headers.get("x-sena-identity-receipt-archive-manifest-digest"))
        .toBe(body.identityProductionEvidence?.receiptArchiveManifest?.archiveManifestDigest);
      const requestPacketPolicyHash = identityProductionEvidence.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      const requestPacketPolicyBinding = identityProductionEvidence.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyBinding="))
        ?.slice("requestPacketPolicyBinding=".length);
      expect(response.headers.get("x-sena-identity-request-packet-policy-hash")).toBe(requestPacketPolicyHash);
      expect(response.headers.get("x-sena-identity-request-packet-policy-binding")).toBe(requestPacketPolicyBinding);
      expect(body.identityProductionEvidence?.platformRequestPacket?.evidence).toContain(`requestPacketPolicyHash=${requestPacketPolicyHash}`);
      expect(body.identityProductionEvidence?.platformRequestPacket?.evidence).toContain(`requestPacketPolicyBinding=${requestPacketPolicyBinding}`);
      expect(response.headers.get("x-sena-identity-production-status")).toBe(identityProductionEvidence.status);
      expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(identityProductionEvidence.releaseGate.approvalBlocked));
      expect(response.headers.get("x-sena-identity-request-blockers"))
        .toBe(String(body.identityProductionEvidence?.platformRequestPacket?.summary?.blockingRequests));
      expect(response.headers.get("x-sena-identity-receipt-review-requests"))
        .toBe(String(body.identityProductionEvidence?.platformRequestPacket?.summary?.receiptReviewRequests));
      expect(response.headers.get("x-sena-identity-production-blocking-decisions"))
        .toBe(body.identityProductionEvidence?.releaseGate?.productionBlockingDecisionIds?.join("|") || "none");
      const receiptArchiveMissingInputs = body.identityProductionEvidence?.receiptArchiveManifest?.evidence
        ?.find((entry) => entry.startsWith("receiptArchiveMissingInputs="))
        ?.slice("receiptArchiveMissingInputs=".length);
      const receiptArchiveArtifactCompleteness = body.identityProductionEvidence?.receiptArchiveManifest?.evidence
        ?.find((entry) => entry.startsWith("receiptArchiveArtifactCompleteness="))
        ?.slice("receiptArchiveArtifactCompleteness=".length);
      expect(response.headers.get("x-sena-identity-receipt-archive-missing-inputs"))
        .toBe(receiptArchiveMissingInputs);
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness"))
        .toBe(receiptArchiveArtifactCompleteness);
      expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(identityProductionEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(identityProductionEvidence.cutoverChecklist.status);
      expect(response.headers.get("x-sena-identity-cutover-blockers")).toBe(String(identityProductionEvidence.cutoverChecklist.summary.blockingItems));
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness-summary")).toBe("complete:0|partial:0|missing:2");
      expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toBe(body.identityProductionEvidence?.institutionActionPlan?.digest);
      expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(body.identityProductionEvidence?.institutionActionPlan?.summary?.blockingLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(body.identityProductionEvidence?.institutionActionPlan?.summary?.readyLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(body.identityProductionEvidence?.institutionActionPlan?.summary?.submissionPath);
      expect(response.headers.get("x-sena-identity-rotation-freshness")).toBe(body.identityProductionEvidence?.rotationFreshness?.status);
      const rotationChecks = body.identityProductionEvidence?.rotationFreshness?.checks ?? [];
      expect(response.headers.get("x-sena-identity-rotation-expired-evidence"))
        .toBe(rotationChecks.filter((check) => check.status === "expired").map((check) => check.id).join("|") || "none");
      expect(response.headers.get("x-sena-identity-rotation-due-soon-evidence"))
        .toBe(rotationChecks.filter((check) => check.status === "due-soon").map((check) => check.id).join("|") || "none");
      const idpRequest = body.identityProductionEvidence?.platformRequestPacket?.requests
        ?.find((request) => request.decisionId === "institution-idp-approval");
      const provisioningRequest = body.identityProductionEvidence?.platformRequestPacket?.requests
        ?.find((request) => request.decisionId === "institution-provisioning-owner");
      expect(response.headers.get("x-sena-auth-capability-idp-missing-production-evidence"))
        .toBe(idpRequest?.missingProductionEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-auth-capability-provisioning-missing-production-evidence"))
        .toBe(provisioningRequest?.missingProductionEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-auth-capability-idp-missing-technical-prerequisites"))
        .toBe(idpRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-auth-capability-provisioning-missing-technical-prerequisites"))
        .toBe(provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none");
      expect(JSON.stringify(body)).not.toContain("sena-test-ops-token");
    } finally {
      delete process.env.SENA_OPS_TOKEN;
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.useRealTimers();
      vi.resetModules();
    }
  }, capabilityAuditRouteTestTimeoutMs);
});
