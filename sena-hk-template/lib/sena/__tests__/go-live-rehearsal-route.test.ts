import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

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

type IdentityHandoffShape = {
  status?: string;
  dossierDigest?: string;
  evidenceBindingDigest?: string;
  evidenceManifest?: {
    missingEvidenceIds?: string[];
  };
  releaseGate?: {
    approvalBlocked?: boolean;
    productionBlockingDecisionIds?: string[];
  };
  platformRequestPacket?: {
    summary?: {
      blockingRequests?: number;
      receiptReviewRequests?: number;
    };
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

function expectIdentityHandoffHeaders(response: Response, snapshot?: IdentityHandoffShape) {
  expect(response.headers.get("x-sena-identity-production-evidence-digest")).toBe(snapshot?.dossierDigest);
  expect(response.headers.get("x-sena-identity-evidence-binding-digest")).toBe(snapshot?.evidenceBindingDigest);
  expect(response.headers.get("x-sena-identity-receipt-archive-manifest-digest")).toBe(snapshot?.receiptArchiveManifest?.archiveManifestDigest);
  expect(response.headers.get("x-sena-identity-production-status")).toBe(snapshot?.status);
  expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(snapshot?.releaseGate?.approvalBlocked));
  expect(response.headers.get("x-sena-identity-request-blockers")).toBe(String(snapshot?.platformRequestPacket?.summary?.blockingRequests));
  expect(response.headers.get("x-sena-identity-receipt-review-requests")).toBe(String(snapshot?.platformRequestPacket?.summary?.receiptReviewRequests));
  expect(response.headers.get("x-sena-identity-production-blocking-decisions")).toBe(snapshot?.releaseGate?.productionBlockingDecisionIds?.join("|") || "none");
  expect(response.headers.get("x-sena-identity-receipt-archive-missing-inputs"))
    .toBe(formatMissingInputs(snapshot?.receiptArchiveManifest?.summary?.missingArchiveInputCounts));
  expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness"))
    .toBe(formatArtifactCompleteness(snapshot?.receiptArchiveManifest?.summary?.artifactCompletenessCounts));
  expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(snapshot?.evidenceManifest?.missingEvidenceIds?.join("|") || "none");
  expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(snapshot?.cutoverChecklist?.status);
  expect(response.headers.get("x-sena-identity-cutover-blockers")).toBe(String(snapshot?.cutoverChecklist?.summary?.blockingItems));
  expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness-summary"))
    .toBe(formatArtifactCompleteness(snapshot?.receiptArchiveManifest?.summary?.artifactCompletenessCounts));
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
}

describe("SENA go-live rehearsal route", () => {
  it("returns identity production handoff headers for go-live gating", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-go-live-rehearsal-route-"));
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
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Go Live Route Owner",
        email: "go-live-route@example.edu",
        password: "sena-secure-123",
        organization: "Go Live Route Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const route = await import("../../../app/api/sena/ops/go-live-rehearsal/route");

      const getResponse = await route.GET(new Request(`https://sena.example.test/api/sena/ops/go-live-rehearsal?teamId=${encodeURIComponent(teamId)}`));
      const getBody = await getResponse.json() as {
        identityProductionHandoff?: IdentityHandoffShape;
      };
      expect(getResponse.status).toBe(200);
      expect(getBody.identityProductionHandoff?.status).toBe("review");
      expect(getResponse.headers.get("x-sena-observed-route")).toBe("sena-ops-go-live-rehearsal");
      expect(getResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expectIdentityHandoffHeaders(getResponse, getBody.identityProductionHandoff);

      const monitorResponse = await route.GET(new Request(`https://sena.example.test/api/sena/ops/go-live-rehearsal?artifact=post-cutover-monitor&teamId=${encodeURIComponent(teamId)}`));
      const monitorBody = await monitorResponse.json() as {
        latestObservation?: {
          schemaVersion: string;
          summary: { latestStatus: string };
        };
      };
      expect(monitorResponse.status).toBe(200);
      expect(monitorBody.latestObservation).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-post-cutover-observations/v1",
        summary: expect.objectContaining({
          latestStatus: "missing"
        })
      }));

      const missingCsrfActionResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/go-live-rehearsal", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "record-post-cutover-sample",
          teamId,
          observationId: "post-cutover_missing"
        })
      }));
      const missingCsrfActionBody = await missingCsrfActionResponse.json() as { code?: string };
      expect(missingCsrfActionResponse.status).toBe(403);
      expect(missingCsrfActionBody.code).toBe("csrf_invalid");
      expect(missingCsrfActionResponse.headers.get("x-sena-observed-route")).toBe("sena-ops-go-live-rehearsal");
      expect(missingCsrfActionResponse.headers.get("x-sena-observed-status-class")).toBe("4xx");

      const actionResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/go-live-rehearsal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          action: "start-post-cutover-observation",
          teamId,
          environment: "pilot-production",
          releaseVersion: "2026.06.17-go-live-route"
        })
      }));
      const actionBody = await actionResponse.json() as { error?: string; code?: string };
      expect(actionResponse.status).toBe(409);
      expect(actionBody.code).toBe("post_cutover_observation_start_blocked");

      const postResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/go-live-rehearsal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId,
          environment: "pilot-production",
          releaseVersion: "2026.06.17-go-live-route",
          decision: "conditional",
          attesterName: "Institution release owner",
          attesterRole: "Platform operations",
          notes: "Conditional go-live attestation keeps institution IdP and SCIM evidence blockers visible to final cutover automation.",
          checklist: {
            rehearsalReviewed: true,
            releaseGateDraftReviewed: true,
            verificationEvidenceReviewed: true,
            rollbackOwnerConfirmed: false,
            platformOwnerDecisionReviewed: false
          }
        })
      }));
      const postBody = await postResponse.json() as {
        attestation?: {
          identityProductionHandoffSnapshot?: IdentityHandoffShape;
        };
      };
      expect(postResponse.status).toBe(201);
      expect(postBody.attestation?.identityProductionHandoffSnapshot?.status).toBe("review");
      expectIdentityHandoffHeaders(postResponse, postBody.attestation?.identityProductionHandoffSnapshot);
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
