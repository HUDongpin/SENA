import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

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
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.db/senadb");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    const jobRows = [
      serverJobRow("job_release_gate_queued", "queued", true),
      serverJobRow("job_release_gate_running", "running", false)
    ];
    let postgresState: { revision: number; payload: SenaEnterpriseDb } | null = null;
    const postgresQueries: string[] = [];
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          const normalizedSql = sql.replace(/\s+/g, " ").trim();
          postgresQueries.push(normalizedSql);
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE INDEX IF NOT EXISTS "sena_enterprise_server_jobs_/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/CREATE INDEX IF NOT EXISTS "sena_enterprise_audit_log_/i.test(normalizedSql)) {
            return { rows: [], rowCount: 0 };
          }
          if (/INSERT INTO "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
            return { rows: [], rowCount: 1 };
          }
          if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
            return {
              rows: postgresState ? [{ revision: postgresState.revision, payload: postgresState.payload }] : [],
              rowCount: postgresState ? 1 : 0
            };
          }
          if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO NOTHING/i.test(normalizedSql)) {
            if (!postgresState) {
              postgresState = {
                revision: 0,
                payload: values[2] as SenaEnterpriseDb
              };
            }
            return { rows: [], rowCount: 1 };
          }
          if (/UPDATE "public"\."sena_enterprise_state" SET payload/i.test(normalizedSql)) {
            postgresState = {
              revision: (postgresState?.revision ?? 0) + 1,
              payload: values[0] as SenaEnterpriseDb
            };
            return { rows: [{ revision: postgresState.revision }], rowCount: 1 };
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
                total: jobRows.length,
                queued: jobRows.filter((row) => row.status === "queued").length,
                running: jobRows.filter((row) => row.status === "running").length,
                succeeded: 0,
                failed: 0,
                dead_lettered: 0,
                retryable: jobRows.filter((row) => (row.lifecycle as { retryable?: boolean }).retryable).length
              }],
              rowCount: 1
            };
          }
          if (/SELECT \* FROM "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
            return { rows: [jobRows[0]], rowCount: 1 };
          }
          throw new Error(`Unexpected Postgres query: ${normalizedSql}`);
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
          id?: string;
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
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-release-gate");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(postgresQueries.some((query) => /SELECT count\(\*\) AS total/i.test(query))).toBe(true);
      expect(snapshot?.status).toBe("review");
      expect(JSON.stringify(body)).not.toContain("super-secret");
      expect(JSON.stringify(body)).not.toContain("example.db");
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
      const finalPostgresState = postgresState as unknown as { revision: number; payload: SenaEnterpriseDb };
      expect(finalPostgresState.payload.releaseGateReviews.map((review) => review.id)).toContain(body.review?.id);
      expect(finalPostgresState.payload.auditLog.some((entry) => entry.event === "ops.release_gate.review")).toBe(true);

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/ops/release-gate?teamId=${encodeURIComponent(teamId)}`));
      const listBody = await listResponse.json() as {
        reviews?: Array<{
          id?: string;
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
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-ops-release-gate");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(listBody.reviews?.map((review) => review.id)).toContain(body.review?.id);
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
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

function serverJobRow(id: string, status: string, retryable: boolean) {
  const nowIso = new Date("2026-07-01T00:00:00.000Z").toISOString();
  return {
    id,
    schema_version: "sena-enterprise-server-job/v1",
    kind: "analysis",
    status,
    team_id: "team_release_gate_pg",
    project_id: "project_release_gate_pg",
    actor_user_id: "user_release_gate_pg",
    payload_sha256: "b".repeat(64),
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
