import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function expectIdentityGateHeaders(response: Response, identityEvidence: {
  status: string;
  releaseGate: { approvalBlocked: boolean };
  evidenceManifest: { missingEvidenceIds: string[] };
  rotationFreshness: { status: string };
  institutionActionPlan: {
    digest?: string;
    summary: {
      blockingLanes: number;
      readyLanes: number;
      submissionPath: string;
    };
  };
}) {
  expect(response.headers.get("x-sena-auth-production-gate")).toBe(identityEvidence.status);
  expect(response.headers.get("x-sena-identity-production-status")).toBe(identityEvidence.status);
  expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(identityEvidence.releaseGate.approvalBlocked));
  expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(identityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none");
  expect(response.headers.get("x-sena-identity-rotation-freshness")).toBe(identityEvidence.rotationFreshness.status);
  expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toMatch(/^[a-f0-9]{64}$/);
  expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
    .toBe(String(identityEvidence.institutionActionPlan.summary.blockingLanes));
  expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
    .toBe(String(identityEvidence.institutionActionPlan.summary.readyLanes));
  expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path"))
    .toBe(identityEvidence.institutionActionPlan.summary.submissionPath);
}

describe("SENA MFA and password reset production gate headers", () => {
  it("returns identity production gate headers on MFA status, setup, enable, and disable responses", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-mfa-gate-"));
    let sessionToken = "";
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
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
        name: "MFA Gate User",
        email: "mfa-gate@example.edu",
        password: "sena-secure-123",
        organization: "MFA Gate Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const route = await import("../../../app/api/auth/mfa/route");
      const response = await route.GET();
      const body = await response.json() as {
        schemaVersion?: string;
      };

      expect(response.status).toBe(200);
      expect(body.schemaVersion).toBe("sena-enterprise-mfa-status/v1");
      expectIdentityGateHeaders(response, identityEvidence);

      const setupResponse = await route.POST(new Request("https://sena.example.test/api/auth/mfa", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [csrf.headerName]: csrf.token
        },
        body: JSON.stringify({ action: "setup" })
      }));
      const setupBody = await setupResponse.json() as {
        schemaVersion?: string;
        setupToken?: string;
        secret?: string;
      };
      expect(setupResponse.status).toBe(201);
      expect(setupBody.schemaVersion).toBe("sena-enterprise-mfa-setup/v1");
      expect(setupBody.secret).toMatch(/^[A-Z2-7]+$/);
      expectIdentityGateHeaders(setupResponse, identityEvidence);

      const enableResponse = await route.POST(new Request("https://sena.example.test/api/auth/mfa", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [csrf.headerName]: csrf.token
        },
        body: JSON.stringify({
          action: "enable",
          setupToken: setupBody.setupToken,
          code: totpCode(setupBody.secret ?? ""),
          label: "Route test authenticator"
        })
      }));
      const enableBody = await enableResponse.json() as {
        schemaVersion?: string;
        enabled?: boolean;
      };
      expect(enableResponse.status).toBe(200);
      expect(enableBody.schemaVersion).toBe("sena-enterprise-mfa-status/v1");
      expect(enableBody.enabled).toBe(true);
      expectIdentityGateHeaders(enableResponse, identityEvidence);

      const disableResponse = await route.DELETE(new Request("https://sena.example.test/api/auth/mfa", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          [csrf.headerName]: csrf.token
        },
        body: JSON.stringify({
          code: totpCode(setupBody.secret ?? "")
        })
      }));
      const disableBody = await disableResponse.json() as {
        schemaVersion?: string;
        enabled?: boolean;
      };
      expect(disableResponse.status).toBe(200);
      expect(disableBody.schemaVersion).toBe("sena-enterprise-mfa-status/v1");
      expect(disableBody.enabled).toBe(false);
      expectIdentityGateHeaders(disableResponse, identityEvidence);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("returns identity production gate headers on password reset request and confirm responses", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-reset-gate-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN = "1";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      enterprise.registerEnterpriseUser({
        name: "Reset Gate User",
        email: "reset-gate@example.edu",
        password: "sena-secure-123",
        organization: "Reset Gate Lab",
        plan: "lab"
      });
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const route = await import("../../../app/api/auth/password-reset/route");
      const response = await route.POST(new Request("https://sena.example.test/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request",
          email: "reset-gate@example.edu"
        })
      }));
      const body = await response.json() as {
        schemaVersion?: string;
        delivery?: {
          resetToken?: string;
        };
      };

      expect(response.status).toBe(202);
      expect(body.schemaVersion).toBe("sena-enterprise-password-reset-request/v1");
      expect(body.delivery?.resetToken).toBeTruthy();
      expectIdentityGateHeaders(response, identityEvidence);

      const confirmResponse = await route.POST(new Request("https://sena.example.test/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          resetToken: body.delivery?.resetToken,
          password: "sena-secure-456"
        })
      }));
      const confirmBody = await confirmResponse.json() as {
        schemaVersion?: string;
        status?: string;
      };
      expect(confirmResponse.status).toBe(200);
      expect(confirmBody.schemaVersion).toBe("sena-enterprise-password-reset-complete/v1");
      expect(confirmBody.status).toBe("completed");
      expectIdentityGateHeaders(confirmResponse, identityEvidence);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN;
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
