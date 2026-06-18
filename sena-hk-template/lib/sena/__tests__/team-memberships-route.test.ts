import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("SENA team memberships route", () => {
  it("returns machine-readable role and status headers for membership updates", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-team-memberships-route-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const owner = enterprise.registerEnterpriseUser({
        name: "Membership Owner",
        email: "membership-owner@example.edu",
        password: "sena-secure-123",
        organization: "Membership Route Lab",
        plan: "lab"
      });
      const member = enterprise.registerEnterpriseUser({
        name: "Membership Coder",
        email: "membership-coder@example.edu",
        password: "sena-secure-123",
        organization: "External Membership Lab",
        plan: "individual"
      });
      const invitation = enterprise.createEnterpriseInvitation(owner.context, {
        teamId: owner.context.teams[0].id,
        email: "membership-coder@example.edu",
        role: "reviewer"
      });
      const accepted = enterprise.acceptEnterpriseInvitation(member.context, {
        invitationId: invitation.id
      });

      sessionToken = owner.token;
      const csrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const route = await import("../../../app/api/sena/team/memberships/route");
      const response = await route.PATCH(new Request("https://sena.example.test/api/sena/team/memberships", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          membershipId: accepted.membership.id,
          role: "coder",
          status: "suspended"
        })
      }));
      const body = await response.json() as {
        schemaVersion?: string;
        membership?: {
          id?: string;
          teamId?: string;
          userId?: string;
          role?: string;
          status?: string;
        };
      };

      expect(response.status).toBe(200);
      expect(body.schemaVersion).toBe("sena-team-membership/v1");
      expect(body.membership?.id).toBe(accepted.membership.id);
      expect(body.membership?.role).toBe("coder");
      expect(body.membership?.status).toBe("suspended");
      expect(response.headers.get("x-sena-membership-id")).toBe(accepted.membership.id);
      expect(response.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(response.headers.get("x-sena-member-user-id")).toBe(member.context.user.id);
      expect(response.headers.get("x-sena-membership-role")).toBe("coder");
      expect(response.headers.get("x-sena-membership-status")).toBe("suspended");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
