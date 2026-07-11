import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

function setupEnterpriseDb(prefix: string) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_APP_URL = "https://sena.example.test";
  return enterpriseDbDir;
}

function cleanupEnterpriseDb(enterpriseDbDir: string) {
  delete process.env.SENA_APP_URL;
  delete process.env.SENA_ENTERPRISE_DB_DIR;
  rmSync(enterpriseDbDir, { recursive: true, force: true });
  vi.resetModules();
}

describe("SENA ops governance response builders", () => {
  it("keeps target route adapters from composing identity response headers directly", () => {
    const routeFiles = [
      path.join(process.cwd(), "app", "api", "sena", "ops", "capability-audit", "route.ts"),
      path.join(process.cwd(), "app", "api", "sena", "ops", "deployment", "route.ts"),
      path.join(process.cwd(), "app", "api", "sena", "ops", "identity-production-evidence", "route.ts"),
      path.join(process.cwd(), "app", "api", "sena", "ops", "release-gate", "route.ts"),
      path.join(process.cwd(), "app", "api", "sena", "ops", "platform-decisions", "route.ts"),
      path.join(process.cwd(), "app", "api", "sena", "ops", "go-live-rehearsal", "route.ts")
    ];

    for (const routeFile of routeFiles) {
      const source = readFileSync(routeFile, "utf8");
      expect(source).toContain("@/lib/sena/enterprise/ops-response-builders");
      expect(source).not.toContain("@/lib/sena/enterprise/ops-governance");
      expect(source).not.toMatch(/"x-sena-identity-[^"]+"/);
      expect(source).not.toMatch(/function\s+\w*Headers\s*\(/);
    }
  });

  it("builds platform decision response bodies and identity audit headers in the use-case module", async () => {
    const enterpriseDbDir = setupEnterpriseDb("sena-ops-governance-platform-response-");
    try {
      const enterprise = await import("../enterprise");
      const opsResponses = await import("../enterprise/ops-response-builders") as Record<string, any>;
      expect(opsResponses.buildEnterprisePlatformDecisionListResponse).toBeTypeOf("function");
      expect(opsResponses.buildEnterprisePlatformDecisionReviewResponse).toBeTypeOf("function");

      const registered = enterprise.registerEnterpriseUser({
        name: "Ops Governance Platform Builder",
        email: "ops-governance-platform-builder@example.edu",
        password: "sena-secure-123",
        organization: "Ops Governance Platform Builder Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      const currentIdentityEvidence = enterprise.getEnterpriseIdentityProductionEvidence({ teamId });
      const currentRequestPacketPolicyHash = currentIdentityEvidence.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);

      const listResponse = opsResponses.buildEnterprisePlatformDecisionListResponse(registered.context, { teamId });
      expect(listResponse.body.identityProductionEvidence.status).toBe(currentIdentityEvidence.status);
      expect(listResponse.body.platformDecisionRegister.schemaVersion).toBe("sena-enterprise-platform-decision-register/v1");
      expect(listResponse.headers["x-sena-identity-request-packet-policy-hash"]).toBe(currentRequestPacketPolicyHash);
      expect(listResponse.headers["x-sena-identity-production-status"]).toBe(currentIdentityEvidence.status);

      const reviewResponse = opsResponses.buildEnterprisePlatformDecisionReviewResponse(registered.context, {
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
        notes: "Institution IdP response builder evidence references an external approval artifact without raw secrets."
      });

      expect(reviewResponse.status).toBe(201);
      expect(reviewResponse.body.acceptance.decisionId).toBe("institution-idp-approval");
      expect(reviewResponse.body.identityProductionEvidence.status).toBe(reviewResponse.headers["x-sena-identity-production-status"]);
      expect(reviewResponse.headers["x-sena-identity-production-receipt-digest"])
        .toBe(reviewResponse.body.acceptance.productionEvidenceReceipt.receiptAuditDigest);
      expect(reviewResponse.headers["x-sena-identity-submitted-decision-production-evidence-artifact-completeness"])
        .toBe(reviewResponse.body.acceptance.productionEvidenceReceipt.productionEvidenceArtifactDigestCompletenessStatus);
    } finally {
      cleanupEnterpriseDb(enterpriseDbDir);
    }
  });

  it("builds go-live rehearsal response bodies and identity handoff headers in the use-case module", async () => {
    const enterpriseDbDir = setupEnterpriseDb("sena-ops-governance-go-live-response-");
    try {
      const enterprise = await import("../enterprise");
      const opsResponses = await import("../enterprise/ops-response-builders") as Record<string, any>;
      expect(opsResponses.buildEnterpriseGoLiveRehearsalResponse).toBeTypeOf("function");
      expect(opsResponses.buildEnterpriseGoLivePostResponse).toBeTypeOf("function");

      const registered = enterprise.registerEnterpriseUser({
        name: "Ops Governance Go Live Builder",
        email: "ops-governance-go-live-builder@example.edu",
        password: "sena-secure-123",
        organization: "Ops Governance Go Live Builder Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      const access = { mode: "session" };

      const rehearsalResponse = opsResponses.buildEnterpriseGoLiveRehearsalResponse({
        teamId,
        artifact: null,
        access,
        context: registered.context
      });
      expect(rehearsalResponse.body.identityProductionHandoff.status)
        .toBe(rehearsalResponse.headers["x-sena-identity-production-status"]);
      expect(rehearsalResponse.headers["x-sena-identity-receipt-archive-manifest-digest"])
        .toBe(rehearsalResponse.body.identityProductionHandoff.receiptArchiveManifest.archiveManifestDigest);

      const monitorResponse = opsResponses.buildEnterpriseGoLiveRehearsalResponse({
        teamId,
        artifact: "post-cutover-monitor",
        access,
        context: registered.context
      });
      expect(monitorResponse.body.latestObservation.schemaVersion).toBe("sena-enterprise-post-cutover-observations/v1");
      expect(monitorResponse.headers["x-sena-identity-production-status"])
        .toBe(rehearsalResponse.body.identityProductionHandoff.status);

      const postResponse = opsResponses.buildEnterpriseGoLivePostResponse(registered.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.17-go-live-builder",
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
      });
      expect(postResponse.status).toBe(201);
      expect(postResponse.body.attestation.identityProductionHandoffSnapshot.status)
        .toBe(postResponse.headers["x-sena-identity-production-status"]);
    } finally {
      cleanupEnterpriseDb(enterpriseDbDir);
    }
  });
});
