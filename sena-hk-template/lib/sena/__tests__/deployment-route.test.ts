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
}

describe("SENA deployment route", () => {
  it("returns identity production handoff headers for deployment archive gating", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-deployment-route-"));
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
        name: "Deployment Route Owner",
        email: "deployment-route@example.edu",
        password: "sena-secure-123",
        organization: "Deployment Route Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      sessionToken = registered.token;
      const route = await import("../../../app/api/sena/ops/deployment/route");
      const response = await route.GET(new Request(`https://sena.example.test/api/sena/ops/deployment?teamId=${encodeURIComponent(teamId)}`));
      const body = await response.json() as {
        identityProductionHandoff?: IdentityHandoffShape;
      };

      expect(response.status).toBe(503);
      expect(body.identityProductionHandoff?.status).toBe("review");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-deployment");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("5xx");
      expectIdentityHandoffHeaders(response, body.identityProductionHandoff);
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
