import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const senaScimIdentityProductionExtensionSchema = "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig";

describe("SENA SCIM route production ownership gate", () => {
  it("returns SCIM/IdP ownership and rotation headers on ServiceProviderConfig", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-scim-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_PROVISIONING_TOKEN", "sena-test-provisioning-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/provisioning-auth", async () => await import("../provisioning-auth"));
    vi.doMock("@/lib/sena/scim", async () => await import("../scim"));

    try {
      const enterprise = await import("../enterprise");
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const provisioningRequest = identityEvidence.platformRequestPacket.requests
        .find((request) => request.decisionId === "institution-provisioning-owner");
      const route = await import("../../../app/api/sena/scim/v2/ServiceProviderConfig/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/scim/v2/ServiceProviderConfig", {
        headers: {
          authorization: "Bearer sena-test-provisioning-token"
        }
      }));
      const body = await response.json() as {
        schemaVersion?: string;
        schemas?: string[];
        supportedSchemas?: string[];
        [senaScimIdentityProductionExtensionSchema]?: {
          schemaVersion?: string;
          status?: string;
          provisioningOwnerGate?: string;
          releaseGateBlocked?: boolean;
          missingEvidenceIds?: string[];
          missingTechnicalPrerequisiteEvidenceIds?: string[];
          institutionActionPlan?: {
            digest?: string;
            summary?: {
              blockingLanes?: number;
              readyLanes?: number;
              submissionPath?: string;
            };
          };
          platformDecisionSubmission?: {
            method?: string;
            path?: string;
          };
          redaction?: {
            secretValuesExcluded?: boolean;
            evidenceUrlValuesExcluded?: boolean;
            ownerNamesExcluded?: boolean;
          };
        };
      };
      const identityExtension = body[senaScimIdentityProductionExtensionSchema];

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-scim-service-provider-config");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.schemaVersion).toBe("sena-scim-service-provider-config/v1");
      expect(body.schemas).toContain(senaScimIdentityProductionExtensionSchema);
      expect(body.supportedSchemas).toContain(senaScimIdentityProductionExtensionSchema);
      expect(identityExtension).toEqual(expect.objectContaining({
        schemaVersion: "sena-scim-identity-production-gate/v1",
        status: identityEvidence.status,
        provisioningOwnerGate: identityEvidence.status,
        releaseGateBlocked: identityEvidence.releaseGate.approvalBlocked,
        missingEvidenceIds: provisioningRequest?.missingProductionEvidenceIds ?? [],
        missingTechnicalPrerequisiteEvidenceIds: provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds ?? [],
        platformDecisionSubmission: expect.objectContaining({
          method: identityEvidence.platformRequestPacket.submission.method,
          path: identityEvidence.platformRequestPacket.submission.path
        }),
        redaction: {
          secretValuesExcluded: true,
          evidenceUrlValuesExcluded: true,
          ownerNamesExcluded: true
        }
      }));
      expect(identityExtension?.institutionActionPlan).toEqual(expect.objectContaining({
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          blockingLanes: identityEvidence.institutionActionPlan.summary.blockingLanes,
          readyLanes: identityEvidence.institutionActionPlan.summary.readyLanes,
          submissionPath: identityEvidence.institutionActionPlan.summary.submissionPath
        })
      }));
      expect(JSON.stringify(identityExtension)).not.toContain("sena-test-provisioning-token");
      expect(JSON.stringify(identityExtension)).not.toContain("https://<institution-evidence-host>");
      expect(response.headers.get("x-sena-scim-production-owner-gate")).toBe(identityEvidence.status);
      expect(response.headers.get("x-sena-identity-production-status")).toBe(identityEvidence.status);
      expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(identityEvidence.releaseGate.approvalBlocked));
      expect(response.headers.get("x-sena-identity-provisioning-missing-evidence"))
        .toBe(provisioningRequest?.missingProductionEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-identity-provisioning-missing-technical-prerequisites"))
        .toBe(provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-identity-lifecycle-owner-mode")).toBe("review");
      expect(response.headers.get("x-sena-identity-rotation-freshness")).toBe(identityEvidence.rotationFreshness.status);
      expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.blockingLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.readyLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(identityEvidence.institutionActionPlan.summary.submissionPath);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
