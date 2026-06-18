import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

function evidenceValue(evidence: string[] | undefined, key: string) {
  return evidence
    ?.find((entry) => entry.startsWith(`${key}=`))
    ?.slice(key.length + 1);
}

describe("SENA SaaS operations route", () => {
  it("returns identity production readiness headers for SaaS operations gating", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-saas-operations-route-"));
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
        name: "SaaS Operations Route Owner",
        email: "saas-operations-route@example.edu",
        password: "sena-secure-123",
        organization: "SaaS Operations Route Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;
      sessionToken = registered.token;
      const route = await import("../../../app/api/sena/ops/saas-operations/route");
      const response = await route.GET(new Request(`https://sena.example.test/api/sena/ops/saas-operations?teamId=${encodeURIComponent(teamId)}`));
      const body = await response.json() as {
        status?: string;
        summary?: {
          identityProductionStatus?: string;
          identitySubmissionVerifierIncomplete?: number | "missing";
          identityRotationFreshness?: string;
          identityCutoverChecklist?: string;
          identityCutoverBlockers?: number | "missing";
          blockers?: string[];
        };
        evidence?: string[];
      };

      expect(response.status).toBe(200);
      expect(body.status).toBe("blocked");
      expect(body.summary?.blockers).toContain("release-gate-identity-production-evidence-required");
      expect(response.headers.get("x-sena-saas-operations-status")).toBe(body.status);
      expect(response.headers.get("x-sena-saas-operations-blockers")).toBe(body.summary?.blockers?.join("|"));
      expect(response.headers.get("x-sena-identity-production-status")).toBe(body.summary?.identityProductionStatus);
      expect(response.headers.get("x-sena-identity-submission-verifier-incomplete"))
        .toBe(String(body.summary?.identitySubmissionVerifierIncomplete));
      expect(response.headers.get("x-sena-identity-rotation-freshness")).toBe(body.summary?.identityRotationFreshness);
      expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(body.summary?.identityCutoverChecklist);
      expect(response.headers.get("x-sena-identity-cutover-blockers")).toBe(String(body.summary?.identityCutoverBlockers));
      expect(response.headers.get("x-sena-identity-release-gate-digest-binding"))
        .toBe(evidenceValue(body.evidence, "identityProductionReleaseGateDigestBinding"));
      expect(response.headers.get("x-sena-identity-latest-release-gate-evidence-binding-digest"))
        .toBe(evidenceValue(body.evidence, "latestReleaseGateIdentityEvidenceBindingDigest"));
      expect(response.headers.get("x-sena-identity-current-evidence-binding-digest"))
        .toBe(evidenceValue(body.evidence, "currentIdentityProductionEvidenceBindingDigest"));
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
