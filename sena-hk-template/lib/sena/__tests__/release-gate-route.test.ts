import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const identityProductionDecisionIds = ["institution-idp-approval", "institution-provisioning-owner"];
const receiptArchiveMissingInputOrder = [
  "productionEvidenceReceipt",
  "receiptAuditDigest",
  "submittedEvidenceDigest",
  "productionEvidenceArtifactDigest",
  "requestPacketPolicyBinding",
  "productionEvidenceCompleteness",
  "technicalEvidenceBinding",
  "technicalReadiness",
  "evidenceUrlHostBinding",
  "rotationFreshness"
];
const artifactCompletenessOrder = ["complete", "partial", "missing"];

function formatMissingInputs(counts?: Record<string, number>) {
  return receiptArchiveMissingInputOrder
    .filter((key) => counts?.[key])
    .map((key) => `${key}:${counts?.[key]}`)
    .join("|") || "none";
}

function formatArtifactCompleteness(counts?: Record<string, number>) {
  return artifactCompletenessOrder
    .map((key) => `${key}:${counts?.[key] ?? 0}`)
    .join("|");
}

describe("SENA release gate route", () => {
  it("returns identity production snapshot headers for release approval gating", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-release-gate-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Release Gate Route Owner",
        email: "release-gate-route@example.edu",
        password: "sena-secure-123",
        organization: "Release Gate Route Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const route = await import("../../../app/api/sena/ops/release-gate/route");

      const response = await route.POST(new Request("https://sena.example.test/api/sena/ops/release-gate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId,
          environment: "pilot-production",
          releaseVersion: "2026.06.17-identity-gate-route",
          decision: "conditional",
          approverName: "Institution release owner",
          approverRole: "Platform operations",
          notes: "Conditional release keeps institution IdP and SCIM production evidence blockers visible to release automation.",
          verificationCommand: "npm run sena:pilot:verify",
          verificationEvidence: {
            status: "passed",
            summary: "sena:pilot:verify passed locally; institution identity production evidence still requires platform owner acceptance.",
            outputSha256: "c".repeat(64)
          }
        })
      }));
      const body = await response.json() as {
        review?: {
          platformDecisionSnapshot?: {
            productionBlockingDecisionIds?: string[];
          };
          identityProductionSnapshot?: {
            status?: string;
            dossierDigest?: string;
            evidenceBindingDigest?: string;
            missingEvidenceIds?: string[];
            releaseGateBlocked?: boolean;
            platformRequestPacket?: {
              blockingRequests?: number;
              receiptReviewRequests?: number;
            };
            receiptArchiveManifest?: {
              archiveManifestDigest?: string;
              summary?: {
                missingArchiveInputCounts?: Record<string, number>;
                artifactCompletenessCounts?: Record<string, number>;
              };
            };
            cutoverChecklist?: {
              status?: string;
              summary?: {
                blockingItems?: number;
              };
            };
            institutionActionPlan?: {
              digest?: string;
              summary?: {
                blockingLanes?: number;
                readyLanes?: number;
                submissionPath?: string;
              };
              ownerRunbooks?: {
                digest?: string;
                summary?: {
                  blockingRunbooks?: number;
                  preflightChecks?: number;
                  submissionSteps?: number;
                  receiptArchiveSteps?: number;
                };
              };
            };
          };
        };
      };
      const snapshot = body.review?.identityProductionSnapshot;
      const identityBlockingDecisionIds = body.review?.platformDecisionSnapshot?.productionBlockingDecisionIds
        ?.filter((decisionId) => identityProductionDecisionIds.includes(decisionId));

      expect(response.status).toBe(201);
      expect(snapshot?.status).toBe("review");
      expect(response.headers.get("x-sena-identity-production-evidence-digest")).toBe(snapshot?.dossierDigest);
      expect(response.headers.get("x-sena-identity-evidence-binding-digest")).toBe(snapshot?.evidenceBindingDigest);
      expect(response.headers.get("x-sena-identity-receipt-archive-manifest-digest")).toBe(snapshot?.receiptArchiveManifest?.archiveManifestDigest);
      expect(response.headers.get("x-sena-identity-production-status")).toBe(snapshot?.status);
      expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(snapshot?.releaseGateBlocked));
      expect(response.headers.get("x-sena-identity-request-blockers")).toBe(String(snapshot?.platformRequestPacket?.blockingRequests));
      expect(response.headers.get("x-sena-identity-receipt-review-requests")).toBe(String(snapshot?.platformRequestPacket?.receiptReviewRequests));
      expect(response.headers.get("x-sena-identity-production-blocking-decisions")).toBe(identityBlockingDecisionIds?.join("|") || "none");
      expect(response.headers.get("x-sena-identity-receipt-archive-missing-inputs"))
        .toBe(formatMissingInputs(snapshot?.receiptArchiveManifest?.summary?.missingArchiveInputCounts));
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness"))
        .toBe(formatArtifactCompleteness(snapshot?.receiptArchiveManifest?.summary?.artifactCompletenessCounts));
      expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(snapshot?.missingEvidenceIds?.join("|") || "none");
      expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(snapshot?.cutoverChecklist?.status);
      expect(response.headers.get("x-sena-identity-cutover-blockers")).toBe(String(snapshot?.cutoverChecklist?.summary?.blockingItems));
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness-summary"))
        .toBe(formatArtifactCompleteness(snapshot?.receiptArchiveManifest?.summary?.artifactCompletenessCounts));
      expect(snapshot?.institutionActionPlan?.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toBe(snapshot?.institutionActionPlan?.digest);
      expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(snapshot?.institutionActionPlan?.summary?.blockingLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(snapshot?.institutionActionPlan?.summary?.readyLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(snapshot?.institutionActionPlan?.summary?.submissionPath);
      expect(response.headers.get("x-sena-identity-owner-runbook-digest"))
        .toBe(snapshot?.institutionActionPlan?.ownerRunbooks?.digest);
      expect(response.headers.get("x-sena-identity-owner-runbook-blocking"))
        .toBe(String(snapshot?.institutionActionPlan?.ownerRunbooks?.summary?.blockingRunbooks));
      expect(response.headers.get("x-sena-identity-owner-runbook-preflight-checks"))
        .toBe(String(snapshot?.institutionActionPlan?.ownerRunbooks?.summary?.preflightChecks));
      expect(response.headers.get("x-sena-identity-owner-runbook-submission-steps"))
        .toBe(String(snapshot?.institutionActionPlan?.ownerRunbooks?.summary?.submissionSteps));
      expect(response.headers.get("x-sena-identity-owner-runbook-receipt-archive-steps"))
        .toBe(String(snapshot?.institutionActionPlan?.ownerRunbooks?.summary?.receiptArchiveSteps));

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/ops/release-gate?teamId=${encodeURIComponent(teamId)}`));
      const listBody = await listResponse.json() as {
        reviews?: Array<{
          identityProductionSnapshot?: typeof snapshot;
          platformDecisionSnapshot?: {
            productionBlockingDecisionIds?: string[];
          };
        }>;
      };
      const latestReview = listBody.reviews?.[0];
      const latestSnapshot = latestReview?.identityProductionSnapshot;
      const latestIdentityBlockingDecisionIds = latestReview?.platformDecisionSnapshot?.productionBlockingDecisionIds
        ?.filter((decisionId) => identityProductionDecisionIds.includes(decisionId));

      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("x-sena-identity-production-evidence-digest")).toBe(latestSnapshot?.dossierDigest);
      expect(listResponse.headers.get("x-sena-identity-production-status")).toBe(latestSnapshot?.status);
      expect(listResponse.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(latestSnapshot?.releaseGateBlocked));
      expect(listResponse.headers.get("x-sena-identity-production-blocking-decisions")).toBe(latestIdentityBlockingDecisionIds?.join("|") || "none");
      expect(listResponse.headers.get("x-sena-identity-receipt-archive-missing-inputs"))
        .toBe(formatMissingInputs(latestSnapshot?.receiptArchiveManifest?.summary?.missingArchiveInputCounts));
      expect(listResponse.headers.get("x-sena-identity-production-evidence-artifact-completeness"))
        .toBe(formatArtifactCompleteness(latestSnapshot?.receiptArchiveManifest?.summary?.artifactCompletenessCounts));
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-digest")).toBe(latestSnapshot?.institutionActionPlan?.digest);
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(latestSnapshot?.institutionActionPlan?.summary?.blockingLanes));
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(latestSnapshot?.institutionActionPlan?.summary?.readyLanes));
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(latestSnapshot?.institutionActionPlan?.summary?.submissionPath);
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-digest"))
        .toBe(latestSnapshot?.institutionActionPlan?.ownerRunbooks?.digest);
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-blocking"))
        .toBe(String(latestSnapshot?.institutionActionPlan?.ownerRunbooks?.summary?.blockingRunbooks));
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-preflight-checks"))
        .toBe(String(latestSnapshot?.institutionActionPlan?.ownerRunbooks?.summary?.preflightChecks));
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-submission-steps"))
        .toBe(String(latestSnapshot?.institutionActionPlan?.ownerRunbooks?.summary?.submissionSteps));
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-receipt-archive-steps"))
        .toBe(String(latestSnapshot?.institutionActionPlan?.ownerRunbooks?.summary?.receiptArchiveSteps));
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
