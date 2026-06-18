import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("SENA team invitations route", () => {
  it("returns machine-readable lifecycle headers for create, accept, and revoke", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-team-invitations-route-"));
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
        name: "Invitation Owner",
        email: "invitation-owner@example.edu",
        password: "sena-secure-123",
        organization: "Invitation Route Lab",
        plan: "lab"
      });
      const invitee = enterprise.registerEnterpriseUser({
        name: "Route Reviewer",
        email: "route-reviewer@example.edu",
        password: "sena-secure-123",
        organization: "External Route Lab",
        plan: "individual"
      });
      sessionToken = owner.token;
      const ownerCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const route = await import("../../../app/api/sena/team/invitations/route");

      const createResponse = await route.POST(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": ownerCsrf.token
        },
        body: JSON.stringify({
          teamId: owner.context.teams[0].id,
          email: "route-reviewer@example.edu",
          role: "reviewer"
        })
      }));
      const createBody = await createResponse.json() as {
        invitation?: { id?: string; teamId?: string; role?: string; status?: string; inviteCode?: string };
      };

      expect(createResponse.status).toBe(201);
      expect(createResponse.headers.get("x-sena-invitation-id")).toBe(createBody.invitation?.id);
      expect(createResponse.headers.get("x-sena-invitation-status")).toBe("pending");
      expect(createResponse.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(createResponse.headers.get("x-sena-invitation-role")).toBe("reviewer");

      sessionToken = invitee.token;
      const inviteeCsrf = enterprise.createEnterpriseCsrfToken(invitee.context);
      const acceptResponse = await route.PATCH(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": inviteeCsrf.token
        },
        body: JSON.stringify({ inviteCode: createBody.invitation?.inviteCode })
      }));
      const acceptBody = await acceptResponse.json() as {
        invitation?: { id?: string; teamId?: string; role?: string; status?: string };
        membership?: { id?: string; role?: string; status?: string };
      };

      expect(acceptResponse.status).toBe(200);
      expect(acceptResponse.headers.get("x-sena-invitation-id")).toBe(createBody.invitation?.id);
      expect(acceptResponse.headers.get("x-sena-invitation-status")).toBe("accepted");
      expect(acceptResponse.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(acceptResponse.headers.get("x-sena-membership-id")).toBe(acceptBody.membership?.id);
      expect(acceptResponse.headers.get("x-sena-membership-role")).toBe("reviewer");
      expect(acceptResponse.headers.get("x-sena-membership-status")).toBe("active");

      sessionToken = owner.token;
      const revokeTarget = enterprise.createEnterpriseInvitation(owner.context, {
        teamId: owner.context.teams[0].id,
        email: "route-viewer@example.edu",
        role: "viewer"
      });
      const revokeCsrf = enterprise.createEnterpriseCsrfToken(owner.context);
      const revokeResponse = await route.DELETE(new Request("https://sena.example.test/api/sena/team/invitations", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": revokeCsrf.token
        },
        body: JSON.stringify({ invitationId: revokeTarget.id })
      }));

      expect(revokeResponse.status).toBe(200);
      expect(revokeResponse.headers.get("x-sena-invitation-id")).toBe(revokeTarget.id);
      expect(revokeResponse.headers.get("x-sena-invitation-status")).toBe("revoked");
      expect(revokeResponse.headers.get("x-sena-team-id")).toBe(owner.context.teams[0].id);
      expect(revokeResponse.headers.get("x-sena-invitation-role")).toBe("viewer");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
