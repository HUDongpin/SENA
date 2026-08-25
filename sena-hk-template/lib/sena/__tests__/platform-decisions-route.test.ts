import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

class PlatformDecisionRouteMemoryPostgres {
  state: { revision: number; payload: SenaEnterpriseDb } | null = null;
  queries: string[] = [];
  jobRows = [
    platformDecisionServerJobRow("job_platform_decision_queued", "queued", true)
  ];

  async query(sql: string, values: unknown[] = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    this.queries.push(normalizedSql);
    if (/CREATE TABLE IF NOT EXISTS/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/CREATE INDEX IF NOT EXISTS/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
      return {
        rows: this.state ? [{ revision: this.state.revision, payload: this.state.payload }] : [],
        rowCount: this.state ? 1 : 0
      };
    }
    if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO NOTHING/i.test(normalizedSql)) {
      if (!this.state) {
        this.state = {
          revision: 0,
          payload: values[2] as SenaEnterpriseDb
        };
      }
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE "public"\."sena_enterprise_state" SET payload/i.test(normalizedSql)) {
      const expectedRevision = Number(values[2]);
      if (!this.state || this.state.revision !== expectedRevision) {
        return { rows: [], rowCount: 0 };
      }
      this.state = {
        revision: this.state.revision + 1,
        payload: values[0] as SenaEnterpriseDb
      };
      return { rows: [{ revision: this.state.revision }], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO UPDATE/i.test(normalizedSql)) {
      this.state = {
        revision: (this.state?.revision ?? -1) + 1,
        payload: values[2] as SenaEnterpriseDb
      };
      return { rows: [{ revision: this.state.revision }], rowCount: 1 };
    }
    if (/SELECT count\(\*\) AS total FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
      return { rows: [{ total: 0 }], rowCount: 1 };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT count\(\*\) AS total/i.test(normalizedSql)) {
      return {
        rows: [{
          total: this.jobRows.length,
          queued: this.jobRows.filter((row) => row.status === "queued").length,
          running: this.jobRows.filter((row) => row.status === "running").length,
          succeeded: 0,
          failed: 0,
          dead_lettered: 0,
          retryable: this.jobRows.filter((row) => (row.lifecycle as { retryable?: boolean }).retryable).length
        }],
        rowCount: 1
      };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
      return { rows: this.jobRows.slice(0, 1), rowCount: Math.min(this.jobRows.length, 1) };
    }
    throw new Error(`Unexpected Postgres query in platform decisions route test: ${normalizedSql}`);
  }
}

describe("SENA platform decisions route", () => {
  it("requires current identity request packet policy hash and returns audit headers", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-platform-decisions-route-"));
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
        name: "Platform Decision Route Owner",
        email: "platform-decision-route@example.edu",
        password: "sena-secure-123",
        organization: "Platform Decision Route Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const currentRequestPacketPolicyHash = enterprise.getEnterpriseIdentityProductionEvidence({ teamId }).platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      const currentIdentityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({ teamId });
      const currentRequestPacketPolicyBinding = currentIdentityEvidence.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyBinding="))
        ?.slice("requestPacketPolicyBinding=".length);
      expect(currentRequestPacketPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(currentRequestPacketPolicyBinding).toMatch(/^idp:(current|stale|missing)\|provisioning:(current|stale|missing)$/);

      const route = await import("../../../app/api/sena/ops/platform-decisions/route");
      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/ops/platform-decisions?teamId=${encodeURIComponent(teamId)}`));
      const listBody = await listResponse.json() as {
        identityProductionEvidence?: {
          status?: string;
          platformRequestPacket?: {
            evidence?: string[];
            submission?: {
              requiredBodyFields?: string[];
              identityProductionEvidenceBodyFields?: string[];
            };
          };
          cutoverChecklist?: {
            status?: string;
          };
          receiptArchiveManifest?: {
            archivePolicy?: {
              archiveBodyPaths?: string[];
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
      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-ops-platform-decisions");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(listBody.identityProductionEvidence?.status).toBe(currentIdentityEvidence.status);
      expect(listBody.identityProductionEvidence?.platformRequestPacket?.evidence).toContain(`requestPacketPolicyHash=${currentRequestPacketPolicyHash}`);
      expect(listBody.identityProductionEvidence?.platformRequestPacket?.submission?.requiredBodyFields).toContain("requestPacketPolicyHash");
      expect(listBody.identityProductionEvidence?.platformRequestPacket?.submission?.requiredBodyFields).toContain("productionEvidenceArtifactDigest");
      expect(listBody.identityProductionEvidence?.platformRequestPacket?.submission?.identityProductionEvidenceBodyFields).toContain("productionEvidenceArtifactDigest");
      expect(listBody.identityProductionEvidence?.cutoverChecklist?.status).toBe(currentIdentityEvidence.cutoverChecklist.status);
      expect(listBody.identityProductionEvidence?.receiptArchiveManifest?.archivePolicy?.archiveBodyPaths).toContain("identityProductionEvidence.platformRequestPacket");
      expect(listResponse.headers.get("x-sena-identity-request-packet-policy-hash")).toBe(currentRequestPacketPolicyHash);
      expect(listResponse.headers.get("x-sena-identity-request-packet-policy-binding")).toBe(currentRequestPacketPolicyBinding);
      expect(listResponse.headers.get("x-sena-identity-production-evidence-digest")).toMatch(/^[a-f0-9]{64}$/);
      expect(listResponse.headers.get("x-sena-identity-evidence-binding-digest")).toBe(currentIdentityEvidence.evidenceBindingDigest);
      expect(listResponse.headers.get("x-sena-identity-receipt-archive-manifest-digest")).toMatch(/^[a-f0-9]{64}$/);
      expect(listResponse.headers.get("x-sena-identity-production-status")).toBe(currentIdentityEvidence.status);
      expect(listResponse.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(currentIdentityEvidence.releaseGate.approvalBlocked));
      expect(listResponse.headers.get("x-sena-identity-request-blockers")).toBe(String(currentIdentityEvidence.platformRequestPacket.summary.blockingRequests));
      expect(listResponse.headers.get("x-sena-identity-receipt-review-requests")).toBe(String(currentIdentityEvidence.platformRequestPacket.summary.receiptReviewRequests));
      expect(listResponse.headers.get("x-sena-identity-production-blocking-decisions")).toBe(currentIdentityEvidence.releaseGate.productionBlockingDecisionIds.join("|") || "none");
      const currentReceiptArchiveMissingInputs = currentIdentityEvidence.receiptArchiveManifest.evidence
        .find((entry) => entry.startsWith("receiptArchiveMissingInputs="))
        ?.slice("receiptArchiveMissingInputs=".length);
      const currentArtifactCompleteness = currentIdentityEvidence.receiptArchiveManifest.evidence
        .find((entry) => entry.startsWith("receiptArchiveArtifactCompleteness="))
        ?.slice("receiptArchiveArtifactCompleteness=".length);
      expect(listResponse.headers.get("x-sena-identity-receipt-archive-missing-inputs")).toBe(currentReceiptArchiveMissingInputs);
      expect(listResponse.headers.get("x-sena-identity-production-evidence-artifact-completeness")).toBe(currentArtifactCompleteness);
      expect(listResponse.headers.get("x-sena-identity-missing-evidence-ids")).toBe(currentIdentityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none");
      expect(listResponse.headers.get("x-sena-identity-cutover-checklist")).toBe(currentIdentityEvidence.cutoverChecklist.status);
      expect(listResponse.headers.get("x-sena-identity-cutover-blockers")).toBe(String(currentIdentityEvidence.cutoverChecklist.summary.blockingItems));
      expect(listResponse.headers.get("x-sena-identity-production-evidence-artifact-completeness-summary")).toBe("complete:0|partial:0|missing:2");
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-digest")).toBe(listBody.identityProductionEvidence?.institutionActionPlan?.digest);
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-blocking-lanes")).toBe(String(listBody.identityProductionEvidence?.institutionActionPlan?.summary?.blockingLanes));
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-ready-lanes")).toBe("0");
      expect(listResponse.headers.get("x-sena-identity-institution-action-plan-submission-path")).toBe("/api/sena/ops/platform-decisions");
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-digest")).toBe(listBody.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.digest);
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-blocking")).toBe(String(listBody.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.blockingRunbooks));
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-preflight-checks")).toBe(String(listBody.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.preflightChecks));
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-submission-steps")).toBe(String(listBody.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.submissionSteps));
      expect(listResponse.headers.get("x-sena-identity-owner-runbook-receipt-archive-steps")).toBe(String(listBody.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.receiptArchiveSteps));
      const baseBody = {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Maya Lee",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/idp-route-policy",
        productionEvidenceIds: ["idp-tenant-approval"],
        productionEvidenceArtifactDigest: "a".repeat(64),
        productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
        notes: "Institution IdP route evidence references the external approval artifact without raw secrets."
      };

      const missingHashResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/platform-decisions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify(baseBody)
      }));
      const missingHashBody = await missingHashResponse.json() as { code?: string };
      expect(missingHashResponse.status).toBe(400);
      expect(missingHashBody.code).toBe("missing_identity_request_packet_policy_hash");

      const staleHashResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/platform-decisions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          ...baseBody,
          requestPacketPolicyHash: "0".repeat(64)
        })
      }));
      const staleHashBody = await staleHashResponse.json() as { code?: string };
      expect(staleHashResponse.status).toBe(400);
      expect(staleHashBody.code).toBe("stale_identity_request_packet_policy_hash");

      const missingArtifactDigestResponse = await route.POST(new Request("https://sena.example.test/api/sena/ops/platform-decisions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          ...baseBody,
          productionEvidenceArtifactDigest: undefined,
          requestPacketPolicyHash: currentRequestPacketPolicyHash
        })
      }));
      const missingArtifactDigestBody = await missingArtifactDigestResponse.json() as { code?: string };
      expect(missingArtifactDigestResponse.status).toBe(400);
      expect(missingArtifactDigestBody.code).toBe("missing_identity_production_evidence_artifact_digest");

      const response = await route.POST(new Request("https://sena.example.test/api/sena/ops/platform-decisions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          ...baseBody,
          requestPacketPolicyHash: currentRequestPacketPolicyHash
        })
      }));
      const body = await response.json() as {
        acceptance?: {
          decisionId?: string;
          productionEvidenceArtifactDigest?: string;
          submittedRequestPacketPolicyHash?: string;
          productionEvidenceReceipt?: {
            requestPacketPolicyHash?: string;
            submittedRequestPacketPolicyHash?: string;
            productionEvidenceArtifactDigestAlgorithm?: string;
            productionEvidenceArtifactDigestScope?: string;
            productionEvidenceArtifactDigest?: string;
            productionEvidenceArtifactDigestCoveredEvidenceIds?: string[];
            productionEvidenceArtifactDigestCoverageStatus?: string;
            productionEvidenceArtifactDigestCompletenessStatus?: string;
            requestPacketPolicyBindingStatus?: string;
            receiptAuditDigestAlgorithm?: string;
            receiptAuditDigestScope?: string;
            receiptAuditDigest?: string;
            submittedEvidenceDigestAlgorithm?: string;
            submittedEvidenceDigestScope?: string;
            submittedEvidenceDigest?: string;
            responseAuditHeaders?: string[];
            receiptArchiveBodyPaths?: string[];
            verifierStatus?: string;
            technicalBindingStatus?: string;
            technicalReadinessStatus?: string;
            evidenceUrlHostBindingStatus?: string;
            rotationFreshnessStatus?: string;
            rotationExpiredEvidenceIds?: string[];
            rotationDueSoonEvidenceIds?: string[];
          };
        };
        identityProductionEvidence?: {
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
          cutoverChecklist?: {
            status?: string;
            summary?: {
              blockingItems?: number;
            };
          };
          platformRequestPacket?: {
            summary?: {
              blockingRequests?: number;
              receiptReviewRequests?: number;
            };
            evidence?: string[];
          };
          receiptArchiveManifest?: {
            archiveManifestDigest?: string;
            summary?: {
              artifactCompletenessCounts?: Record<string, number>;
            };
            evidence?: string[];
            decisions?: Array<{
              decisionId: string;
              archiveStatus: string;
              missingArchiveInputs: string[];
              productionEvidenceArtifactDigestAlgorithm?: string;
              productionEvidenceArtifactDigestScope?: string;
              productionEvidenceArtifactDigest?: string;
              productionEvidenceArtifactDigestCoveredEvidenceIds?: string[];
              productionEvidenceArtifactDigestCoverageStatus?: string;
              productionEvidenceArtifactDigestCompletenessStatus?: string;
            }>;
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

      expect(response.status).toBe(201);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-platform-decisions");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.acceptance?.decisionId).toBe("institution-idp-approval");
      expect(body.acceptance?.productionEvidenceArtifactDigest).toBe(baseBody.productionEvidenceArtifactDigest);
      expect(body.acceptance?.submittedRequestPacketPolicyHash).toBe(currentRequestPacketPolicyHash);
      expect(body.acceptance?.productionEvidenceReceipt).toEqual(expect.objectContaining({
        requestPacketPolicyHash: currentRequestPacketPolicyHash,
        submittedRequestPacketPolicyHash: currentRequestPacketPolicyHash,
        productionEvidenceArtifactDigestAlgorithm: "sha256",
        productionEvidenceArtifactDigestScope: "external-evidence-artifact",
        productionEvidenceArtifactDigest: baseBody.productionEvidenceArtifactDigest,
        productionEvidenceArtifactDigestCoveredEvidenceIds: baseBody.productionEvidenceIds,
        productionEvidenceArtifactDigestCoverageStatus: "covered",
        productionEvidenceArtifactDigestCompletenessStatus: "partial",
        requestPacketPolicyBindingStatus: "current",
        receiptAuditDigestAlgorithm: "sha256",
        receiptAuditDigestScope: "current-validation-snapshot",
        receiptAuditDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        submittedEvidenceDigestAlgorithm: "sha256",
        submittedEvidenceDigestScope: "platform-submission-inputs",
        submittedEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        responseAuditHeaders: expect.arrayContaining([
          "x-sena-identity-production-receipt-digest",
          "x-sena-identity-submitted-evidence-digest",
          "x-sena-identity-production-evidence-artifact-digest",
          "x-sena-identity-production-evidence-artifact-covered-ids",
          "x-sena-identity-production-evidence-artifact-coverage",
          "x-sena-identity-production-evidence-artifact-completeness",
          "x-sena-identity-submitted-decision-production-evidence-artifact-completeness",
          "x-sena-identity-receipt-archive-status",
          "x-sena-identity-submitted-decision-receipt-archive-missing-inputs",
          "x-sena-identity-receipt-archive-missing-inputs",
          "x-sena-identity-production-status",
          "x-sena-identity-release-gate-blocked",
          "x-sena-identity-request-blockers",
          "x-sena-identity-receipt-review-requests",
          "x-sena-identity-production-blocking-decisions",
          "x-sena-identity-missing-evidence-ids",
          "x-sena-identity-cutover-checklist",
          "x-sena-identity-cutover-blockers",
          "x-sena-identity-production-evidence-artifact-completeness-summary"
        ]),
        receiptArchiveBodyPaths: expect.arrayContaining([
          "acceptance.productionEvidenceReceipt",
          "identityProductionEvidence.receiptArchiveManifest"
        ])
      }));
      expect(response.headers.get("x-sena-identity-request-packet-policy-hash")).toBe(currentRequestPacketPolicyHash);
      expect(response.headers.get("x-sena-identity-request-packet-policy-binding")).toBe("current");
      expect(response.headers.get("x-sena-identity-production-receipt-digest")).toBe(body.acceptance?.productionEvidenceReceipt?.receiptAuditDigest);
      expect(response.headers.get("x-sena-identity-submitted-evidence-digest")).toBe(body.acceptance?.productionEvidenceReceipt?.submittedEvidenceDigest);
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-digest")).toBe(baseBody.productionEvidenceArtifactDigest);
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-covered-ids")).toBe(baseBody.productionEvidenceIds.join("|"));
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-coverage")).toBe("covered");
      expect(response.headers.get("x-sena-identity-submitted-decision-production-evidence-artifact-completeness")).toBe("partial");
      expect(response.headers.get("x-sena-identity-production-verifier-status")).toBe(body.acceptance?.productionEvidenceReceipt?.verifierStatus);
      expect(response.headers.get("x-sena-identity-evidence-url-host-binding")).toBe(body.acceptance?.productionEvidenceReceipt?.evidenceUrlHostBindingStatus);
      expect(response.headers.get("x-sena-identity-technical-binding")).toBe(body.acceptance?.productionEvidenceReceipt?.technicalBindingStatus);
      expect(response.headers.get("x-sena-identity-technical-readiness")).toBe(body.acceptance?.productionEvidenceReceipt?.technicalReadinessStatus);
      expect(response.headers.get("x-sena-identity-rotation-freshness")).toBe(body.acceptance?.productionEvidenceReceipt?.rotationFreshnessStatus);
      expect(response.headers.get("x-sena-identity-rotation-expired-evidence")).toBe(body.acceptance?.productionEvidenceReceipt?.rotationExpiredEvidenceIds?.join("|") || "none");
      expect(response.headers.get("x-sena-identity-rotation-due-soon-evidence")).toBe(body.acceptance?.productionEvidenceReceipt?.rotationDueSoonEvidenceIds?.join("|") || "none");
      const idpArchiveDecision = body.identityProductionEvidence?.receiptArchiveManifest?.decisions
        ?.find((decision) => decision.decisionId === "institution-idp-approval");
      expect(idpArchiveDecision).toEqual(expect.objectContaining({
        productionEvidenceArtifactDigestAlgorithm: "sha256",
        productionEvidenceArtifactDigestScope: "external-evidence-artifact",
        productionEvidenceArtifactDigest: baseBody.productionEvidenceArtifactDigest,
        productionEvidenceArtifactDigestCoveredEvidenceIds: baseBody.productionEvidenceIds,
        productionEvidenceArtifactDigestCoverageStatus: "covered",
        productionEvidenceArtifactDigestCompletenessStatus: "partial"
      }));
      expect(body.identityProductionEvidence?.receiptArchiveManifest?.summary?.artifactCompletenessCounts).toEqual({
        partial: 1,
        missing: 1
      });
      expect(body.identityProductionEvidence?.receiptArchiveManifest?.evidence).toContain(
        "receiptArchiveArtifactCompleteness=complete:0|partial:1|missing:1"
      );
      expect(response.headers.get("x-sena-identity-receipt-archive-status")).toBe(idpArchiveDecision?.archiveStatus);
      expect(response.headers.get("x-sena-identity-submitted-decision-receipt-archive-missing-inputs")).toBe(idpArchiveDecision?.missingArchiveInputs.join("|") || "none");
      expect(response.headers.get("x-sena-identity-production-evidence-digest")).toBe(body.identityProductionEvidence?.dossierDigest);
      expect(response.headers.get("x-sena-identity-evidence-binding-digest")).toBe(body.identityProductionEvidence?.evidenceBindingDigest);
      expect(response.headers.get("x-sena-identity-receipt-archive-manifest-digest")).toBe(body.identityProductionEvidence?.receiptArchiveManifest?.archiveManifestDigest);
      expect(response.headers.get("x-sena-identity-production-status")).toBe(body.identityProductionEvidence?.status);
      expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(body.identityProductionEvidence?.releaseGate?.approvalBlocked));
      expect(response.headers.get("x-sena-identity-request-blockers")).toBe(String(body.identityProductionEvidence?.platformRequestPacket?.summary?.blockingRequests));
      expect(response.headers.get("x-sena-identity-receipt-review-requests")).toBe(String(body.identityProductionEvidence?.platformRequestPacket?.summary?.receiptReviewRequests));
      expect(response.headers.get("x-sena-identity-production-blocking-decisions")).toBe(body.identityProductionEvidence?.releaseGate?.productionBlockingDecisionIds?.join("|") || "none");
      const bodyReceiptArchiveMissingInputs = body.identityProductionEvidence?.receiptArchiveManifest?.evidence
        ?.find((entry) => entry.startsWith("receiptArchiveMissingInputs="))
        ?.slice("receiptArchiveMissingInputs=".length);
      const bodyArtifactCompleteness = body.identityProductionEvidence?.receiptArchiveManifest?.evidence
        ?.find((entry) => entry.startsWith("receiptArchiveArtifactCompleteness="))
        ?.slice("receiptArchiveArtifactCompleteness=".length);
      expect(response.headers.get("x-sena-identity-receipt-archive-missing-inputs")).toBe(bodyReceiptArchiveMissingInputs);
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness")).toBe(bodyArtifactCompleteness);
      expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(body.identityProductionEvidence?.evidenceManifest?.missingEvidenceIds?.join("|") || "none");
      expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(body.identityProductionEvidence?.cutoverChecklist?.status);
      expect(response.headers.get("x-sena-identity-cutover-blockers")).toBe(String(body.identityProductionEvidence?.cutoverChecklist?.summary?.blockingItems));
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness-summary")).toBe("complete:0|partial:1|missing:1");
      expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toBe(body.identityProductionEvidence?.institutionActionPlan?.digest);
      expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes")).toBe(String(body.identityProductionEvidence?.institutionActionPlan?.summary?.blockingLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes")).toBe(String(body.identityProductionEvidence?.institutionActionPlan?.summary?.readyLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path")).toBe(body.identityProductionEvidence?.institutionActionPlan?.summary?.submissionPath);
      expect(response.headers.get("x-sena-identity-owner-runbook-digest")).toBe(body.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.digest);
      expect(response.headers.get("x-sena-identity-owner-runbook-blocking")).toBe(String(body.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.blockingRunbooks));
      expect(response.headers.get("x-sena-identity-owner-runbook-preflight-checks")).toBe(String(body.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.preflightChecks));
      expect(response.headers.get("x-sena-identity-owner-runbook-submission-steps")).toBe(String(body.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.submissionSteps));
      expect(response.headers.get("x-sena-identity-owner-runbook-receipt-archive-steps")).toBe(String(body.identityProductionEvidence?.institutionActionPlan?.ownerRunbooks?.summary?.receiptArchiveSteps));
      expect(body.identityProductionEvidence?.platformRequestPacket?.evidence).toContain(`requestPacketPolicyHash=${currentRequestPacketPolicyHash}`);
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("uses Postgres primary state for platform owner production evidence submissions", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-platform-decisions-postgres-route-"));
    const pg = new PlatformDecisionRouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
        }
      }
    }));
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Platform Decision Owner",
        email: "postgres-platform-decision@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Platform Decision Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const route = await import("../../../app/api/sena/ops/platform-decisions/route");

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/ops/platform-decisions?teamId=${encodeURIComponent(teamId)}`));
      const listBody = await listResponse.json() as {
        identityProductionEvidence?: {
          platformRequestPacket?: { evidence?: string[] };
        };
      };
      const currentRequestPacketPolicyHash = listBody.identityProductionEvidence?.platformRequestPacket?.evidence
        ?.find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-ops-platform-decisions");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(currentRequestPacketPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(pg.queries.some((query) => /SELECT revision, payload FROM "public"\."sena_enterprise_state"/.test(query))).toBe(true);

      const response = await route.POST(new Request("https://sena.example.test/api/sena/ops/platform-decisions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId,
          decisionId: "institution-idp-approval",
          status: "accepted",
          acceptedBridge: true,
          ownerName: "Maya Lee",
          ownerRole: "Institution identity platform owner",
          environment: "pilot-production",
          evidenceUrl: "https://ops.institution.edu/sena/idp-route-policy",
          productionEvidenceIds: ["idp-tenant-approval"],
          productionEvidenceArtifactDigest: "a".repeat(64),
          productionEvidenceVerifiedAt: "2026-01-15T00:00:00.000Z",
          requestPacketPolicyHash: currentRequestPacketPolicyHash,
          notes: "Institution IdP route evidence references the external approval artifact without raw secrets."
        })
      }));
      const body = await response.json() as {
        acceptance?: {
          decisionId?: string;
          productionEvidenceReceipt?: {
            requestPacketPolicyBindingStatus?: string;
          };
        };
        identityProductionEvidence?: {
          receiptArchiveManifest?: {
            evidence?: string[];
          };
        };
      };
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(201);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-platform-decisions");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.acceptance?.decisionId).toBe("institution-idp-approval");
      expect(body.acceptance?.productionEvidenceReceipt?.requestPacketPolicyBindingStatus).toBe("current");
      expect(body.identityProductionEvidence?.receiptArchiveManifest?.evidence)
        .toContain("receiptArchiveArtifactCompleteness=complete:0|partial:1|missing:1");
      expect(pg.state?.payload.platformDecisionAcceptances.map((acceptance) => acceptance.decisionId))
        .toContain("institution-idp-approval");
      expect(pg.state?.payload.auditLog.map((entry) => entry.event))
        .toContain("ops.platform_decision.review");
      expect(pg.queries.some((query) => /UPDATE "public"\."sena_enterprise_state" SET payload/.test(query))).toBe(true);
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("example.neon.tech");
      expect(JSON.stringify(pg.state?.payload)).not.toContain("super-secret");
      expect(JSON.stringify(pg.state?.payload)).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.resetModules();
    }
  });
});

function platformDecisionServerJobRow(id: string, status: string, retryable: boolean) {
  const nowIso = new Date("2026-07-01T00:00:00.000Z").toISOString();
  return {
    id,
    schema_version: "sena-enterprise-server-job/v2",
    kind: "analysis",
    status,
    team_id: "team_platform_decision_pg",
    project_id: "project_platform_decision_pg",
    actor_user_id: "user_platform_decision_pg",
    payload_sha256: "e".repeat(64),
    payload_summary: {
      source: "project",
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    },
    provider: {
      schemaVersion: "sena-enterprise-server-job-queue/v1",
      generatedAt: nowIso,
      mode: "local",
      configured: true,
      productionReady: false,
      secretConfigured: false,
      timeoutMs: 1000,
      inlinePayloadAllowed: false,
      localModeEnabled: true,
      evidence: []
    },
    delivery: {
      attempted: true,
      webhookStatus: "local-sink",
      attemptedAt: nowIso
    },
    worker: {
      expectedAction: "run-analysis",
      payloadDelivery: "project-pointer",
      execution: "local-receipt-only",
      statusCallback: "/api/sena/ops/jobs"
    },
    lifecycle: {
      attempts: 1,
      maxAttempts: 3,
      retryable,
      lastTransition: "enqueue"
    },
    redaction: {
      payloadValuesExcluded: true,
      secretValuesExcluded: true,
      endpointValueExcluded: true
    },
    queued_at: nowIso,
    updated_at: nowIso
  };
}
