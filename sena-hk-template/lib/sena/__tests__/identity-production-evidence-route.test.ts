import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";

const identityProductionEvidenceRouteTestTimeoutMs = 30_000;

describe("SENA identity production evidence route", () => {
  it("returns handoff digest headers for ops archive capture", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-identity-production-evidence-route-"));
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/identity-production-evidence/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/identity-production-evidence", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        dossierDigestAlgorithm?: string;
        dossierDigestScope?: string;
        dossierDigest?: string;
        evidenceBindingDigestAlgorithm?: string;
        evidenceBindingDigestScope?: string;
        evidenceBindingDigest?: string;
        platformRequestPacket?: {
          summary?: {
            blockingRequests?: number;
            missingProductionEvidence?: number;
            missingTechnicalPrerequisites?: number;
            receiptReviewRequests?: number;
          };
          evidence?: string[];
        };
        status?: string;
        releaseGate?: {
          approvalBlocked?: boolean;
          productionBlockingDecisionIds?: string[];
        };
        evidenceManifest?: {
          missingEvidenceIds?: string[];
        };
        cutoverChecklist?: {
          status?: string;
          summary?: {
            blockingItems?: number;
          };
        };
        receiptArchiveManifest?: {
          archiveManifestDigestAlgorithm?: string;
          archiveManifestDigestScope?: string;
          archiveManifestDigest?: string;
          summary?: {
            missingArchiveInputCounts?: {
              productionEvidenceReceipt?: number;
            };
            artifactCompletenessCounts?: {
              missing?: number;
            };
          };
        };
        institutionActionPlan?: {
          schemaVersion?: string;
          digest?: string;
          summary?: {
            lanes?: number;
            blockingLanes?: number;
            missingProductionEvidence?: number;
            missingTechnicalPrerequisites?: number;
            submissionPath?: string;
          };
          ownerRunbooks?: {
            digestAlgorithm?: string;
            digestScope?: string;
            digest?: string;
            summary?: {
              blockingRunbooks?: number;
              preflightChecks?: number;
              submissionSteps?: number;
              receiptArchiveSteps?: number;
            };
          };
          lanes?: Array<{
            id?: string;
            ownerRole?: string;
            decisionIds?: string[];
            status?: string;
            blocking?: boolean;
            missingProductionEvidenceIds?: string[];
            missingTechnicalPrerequisiteEvidenceIds?: string[];
            rotationEvidenceIds?: string[];
            submissionDrafts?: Array<{
              decisionId?: string;
              submissionDraft?: {
                decisionId?: string;
                productionEvidenceIds?: string[];
                requestPacketPolicyHash?: string;
                productionEvidenceArtifactDigest?: string;
              };
            }>;
            responseAuditHeaders?: string[];
            receiptArchiveBodyPaths?: string[];
            nextActions?: string[];
          }>;
        };
      };

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-identity-production-evidence");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body).toEqual(expect.objectContaining({
        dossierDigestAlgorithm: "sha256",
        dossierDigestScope: "identity-production-evidence-dossier",
        dossierDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(body).toEqual(expect.objectContaining({
        evidenceBindingDigestAlgorithm: "sha256",
        evidenceBindingDigestScope: "identity-production-evidence-binding",
        evidenceBindingDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(body.receiptArchiveManifest).toEqual(expect.objectContaining({
        archiveManifestDigestAlgorithm: "sha256",
        archiveManifestDigestScope: "identity-receipt-archive-manifest",
        archiveManifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          missingArchiveInputCounts: {
            productionEvidenceReceipt: 2
          },
          artifactCompletenessCounts: {
            missing: 2
          }
        })
      }));
      expect(response.headers.get("x-sena-identity-production-evidence-digest")).toBe(body.dossierDigest);
      expect(response.headers.get("x-sena-identity-evidence-binding-digest")).toBe(body.evidenceBindingDigest);
      expect(response.headers.get("x-sena-identity-receipt-archive-manifest-digest")).toBe(body.receiptArchiveManifest?.archiveManifestDigest);
      const requestPacketPolicyHash = body.platformRequestPacket?.evidence
        ?.find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      const requestPacketPolicyBinding = body.platformRequestPacket?.evidence
        ?.find((entry) => entry.startsWith("requestPacketPolicyBinding="))
        ?.slice("requestPacketPolicyBinding=".length);
      expect(requestPacketPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-identity-request-packet-policy-hash")).toBe(requestPacketPolicyHash);
      expect(requestPacketPolicyBinding).toMatch(/^idp:(current|stale|missing)\|provisioning:(current|stale|missing)$/);
      expect(response.headers.get("x-sena-identity-request-packet-policy-binding")).toBe(requestPacketPolicyBinding);
      expect(response.headers.get("x-sena-identity-receipt-archive-missing-inputs")).toBe("productionEvidenceReceipt:2");
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness")).toBe("complete:0|partial:0|missing:2");
      expect(response.headers.get("x-sena-identity-production-evidence-artifact-completeness-summary")).toBe("complete:0|partial:0|missing:2");
      expect(response.headers.get("x-sena-identity-production-status")).toBe(body.status);
      expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(body.releaseGate?.approvalBlocked));
      expect(response.headers.get("x-sena-identity-request-blockers")).toBe(String(body.platformRequestPacket?.summary?.blockingRequests));
      expect(response.headers.get("x-sena-identity-receipt-review-requests")).toBe(String(body.platformRequestPacket?.summary?.receiptReviewRequests));
      expect(response.headers.get("x-sena-identity-production-blocking-decisions")).toBe(body.releaseGate?.productionBlockingDecisionIds?.join("|") || "none");
      expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(body.evidenceManifest?.missingEvidenceIds?.join("|") || "none");
      expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(body.cutoverChecklist?.status);
      expect(response.headers.get("x-sena-identity-cutover-blockers")).toBe(String(body.cutoverChecklist?.summary?.blockingItems));
      expect(body.institutionActionPlan).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-institution-action-plan/v1",
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          lanes: 2,
          blockingLanes: 2,
          missingProductionEvidence: body.platformRequestPacket?.summary?.missingProductionEvidence,
          missingTechnicalPrerequisites: body.platformRequestPacket?.summary?.missingTechnicalPrerequisites,
          submissionPath: "/api/sena/ops/platform-decisions"
        })
      }));
      expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toBe(body.institutionActionPlan?.digest);
      expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes")).toBe(String(body.institutionActionPlan?.summary?.blockingLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes")).toBe("0");
      expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path")).toBe(body.institutionActionPlan?.summary?.submissionPath);
      expect(body.institutionActionPlan?.ownerRunbooks).toEqual(expect.objectContaining({
        digestAlgorithm: "sha256",
        digestScope: "identity-owner-runbook",
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          blockingRunbooks: 2,
          preflightChecks: expect.any(Number),
          submissionSteps: 2,
          receiptArchiveSteps: 2
        })
      }));
      expect(response.headers.get("x-sena-identity-owner-runbook-digest")).toBe(body.institutionActionPlan?.ownerRunbooks?.digest);
      expect(response.headers.get("x-sena-identity-owner-runbook-blocking")).toBe(String(body.institutionActionPlan?.ownerRunbooks?.summary?.blockingRunbooks));
      expect(response.headers.get("x-sena-identity-owner-runbook-preflight-checks")).toBe(String(body.institutionActionPlan?.ownerRunbooks?.summary?.preflightChecks));
      expect(response.headers.get("x-sena-identity-owner-runbook-submission-steps")).toBe(String(body.institutionActionPlan?.ownerRunbooks?.summary?.submissionSteps));
      expect(response.headers.get("x-sena-identity-owner-runbook-receipt-archive-steps")).toBe(String(body.institutionActionPlan?.ownerRunbooks?.summary?.receiptArchiveSteps));
      const idpLane = body.institutionActionPlan?.lanes?.find((lane) => lane.id === "institution-idp-owner");
      expect(idpLane).toEqual(expect.objectContaining({
        ownerRole: "Institution IdP owner",
        decisionIds: ["institution-idp-approval"],
        status: "review",
        blocking: true,
        missingProductionEvidenceIds: expect.arrayContaining([
          "idp-tenant-approval",
          "idp-callback-approval",
          "sso-provider-secrets",
          "sso-secret-store-reference",
          "sso-secret-rotation"
        ]),
        rotationEvidenceIds: ["sso-secret-rotation"],
        responseAuditHeaders: expect.arrayContaining([
          "x-sena-identity-production-receipt-digest",
          "x-sena-identity-submitted-evidence-digest"
        ]),
        receiptArchiveBodyPaths: expect.arrayContaining([
          "identityProductionEvidence.platformRequestPacket",
          "identityProductionEvidence.receiptArchiveManifest",
          "identityProductionEvidence.institutionActionPlan"
        ])
      }));
      expect(idpLane?.submissionDrafts?.[0]).toEqual(expect.objectContaining({
        decisionId: "institution-idp-approval",
        submissionDraft: expect.objectContaining({
          decisionId: "institution-idp-approval",
          productionEvidenceIds: expect.arrayContaining(["idp-tenant-approval", "sso-secret-rotation"]),
          productionEvidenceArtifactDigest: "<sha256-hex-artifact-digest>",
          requestPacketPolicyHash: requestPacketPolicyHash
        })
      }));
      const provisioningLane = body.institutionActionPlan?.lanes?.find((lane) => lane.id === "institution-provisioning-owner");
      expect(provisioningLane).toEqual(expect.objectContaining({
        ownerRole: "Institution provisioning owner",
        decisionIds: ["institution-provisioning-owner"],
        status: "review",
        blocking: true,
        missingProductionEvidenceIds: expect.arrayContaining([
          "provisioning-owner",
          "scim-or-idp-ownership",
          "bearer-token-rotation",
          "lifecycle-guardrails"
        ]),
        rotationEvidenceIds: ["bearer-token-rotation"]
      }));
      expect(JSON.stringify(body.institutionActionPlan)).not.toContain("https://<institution-evidence-host>");
      expect(JSON.stringify(body.institutionActionPlan)).not.toContain("sena-test-ops-token");
      expect(JSON.stringify(body)).not.toContain("sena-test-ops-token");
    } finally {
      delete process.env.SENA_OPS_TOKEN;
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, identityProductionEvidenceRouteTestTimeoutMs);

  it("reads Postgres-backed server job evidence for production owner exports", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-identity-production-evidence-postgres-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.db/senadb");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    const jobRows = [
      serverJobRow("job_identity_evidence_queued", "queued", true),
      serverJobRow("job_identity_evidence_running", "running", false)
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
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/identity-production-evidence/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/identity-production-evidence", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        status?: string;
        dossierDigest?: string;
        platformRequestPacket?: {
          summary?: {
            blockingRequests?: number;
          };
        };
      };
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.status).toBe("review");
      expect(body.dossierDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-identity-production-evidence");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("x-sena-identity-production-evidence-digest")).toBe(body.dossierDigest);
      expect(response.headers.get("x-sena-identity-request-blockers"))
        .toBe(String(body.platformRequestPacket?.summary?.blockingRequests));
      expect(postgresQueries.some((query) => /SELECT count\(\*\) AS total/i.test(query))).toBe(true);
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("example.db");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }, identityProductionEvidenceRouteTestTimeoutMs);
});

function serverJobRow(id: string, status: string, retryable: boolean) {
  const nowIso = new Date("2026-07-01T00:00:00.000Z").toISOString();
  return {
    id,
    schema_version: "sena-enterprise-server-job/v1",
    kind: "analysis",
    status,
    team_id: "team_identity_evidence_pg",
    project_id: "project_identity_evidence_pg",
    actor_user_id: "user_identity_evidence_pg",
    payload_sha256: "d".repeat(64),
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
