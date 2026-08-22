import { describe, expect, it } from "vitest";
import {
  buildEnterpriseExpertReviewQuery,
  buildEnterpriseTeamQuery,
  buildSenaWorkspaceApiUrl,
  requestSenaSnapshotRestore,
  requestSenaWorkspaceJson,
  SenaWorkspaceApiError,
  SENA_WORKSPACE_API_ROUTES
} from "../../../components/sena/workspace/api-client";

describe("SENA workspace API client contract", () => {
  it("centralizes stable workspace API routes", () => {
    expect(SENA_WORKSPACE_API_ROUTES.auth.csrf).toBe("/api/auth/csrf");
    expect(SENA_WORKSPACE_API_ROUTES.enterprise.team).toBe("/api/sena/team");
    expect(SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions).toBe("/api/sena/ops/platform-decisions");
    expect(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal).toBe("/api/sena/ops/go-live-rehearsal");
    expect(SENA_WORKSPACE_API_ROUTES.enterprise.provisioning).toBe("/api/sena/provisioning");
    expect(SENA_WORKSPACE_API_ROUTES.enterprise.scimUsers).toBe("/api/sena/scim/v2/Users");
    expect(SENA_WORKSPACE_API_ROUTES.publicationExport).toBe("/api/sena/exports/publication");
    expect(SENA_WORKSPACE_API_ROUTES.snapshotRestore).toBe("/api/sena/snapshot/restore");
  });

  it("builds encoded team and project query strings for enterprise actions", () => {
    expect(buildEnterpriseTeamQuery()).toBe("");
    expect(buildEnterpriseTeamQuery("team 1")).toBe("?teamId=team%201");
    expect(buildEnterpriseTeamQuery("team 1", "&")).toBe("&teamId=team%201");

    expect(buildEnterpriseExpertReviewQuery({ teamId: "team 1", projectId: "project/1" }))
      .toBe("?teamId=team+1&projectId=project%2F1");
    expect(buildEnterpriseExpertReviewQuery({ teamId: "", projectId: "" })).toBe("");
  });

  it("builds route URLs without scattering /api literals through workspace code", () => {
    expect(buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions, { teamId: "team 1" }))
      .toBe("/api/sena/ops/platform-decisions?teamId=team+1");
    expect(buildSenaWorkspaceApiUrl(SENA_WORKSPACE_API_ROUTES.enterprise.goLiveRehearsal, {
      artifact: "rollback-drill",
      teamId: "team 1"
    })).toBe("/api/sena/ops/go-live-rehearsal?artifact=rollback-drill&teamId=team+1");
  });

  it("reads typed JSON responses through the workspace API helper", async () => {
    const payload = await requestSenaWorkspaceJson<{ ok: true }>("/api/sena/team", undefined, {
      fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    });

    expect(payload).toEqual({ ok: true });
  });

  it("throws a structured workspace API error for non-OK JSON responses", async () => {
    await expect(requestSenaWorkspaceJson("/api/sena/team", undefined, {
      errorMessage: "Could not load team state.",
      fetchImpl: async () => new Response(JSON.stringify({ error: "team_not_found" }), { status: 404 })
    })).rejects.toMatchObject({
      name: "SenaWorkspaceApiError",
      message: "team_not_found",
      status: 404,
      url: "/api/sena/team",
      payload: { error: "team_not_found" }
    } satisfies Partial<SenaWorkspaceApiError>);
  });

  it("posts a schema-versioned snapshot source to the stateless restore boundary", async () => {
    const source = { schemaVersion: "sena-project-snapshot/v1", marker: "fixture" };
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const response = { schemaVersion: "sena-snapshot-restore-result/v1" };

    await expect(requestSenaSnapshotRestore(source, {
      fetchImpl: async (input, init) => {
        request = { input, init };
        return new Response(JSON.stringify(response), { status: 200 });
      }
    })).resolves.toEqual(response);

    expect(request?.input).toBe(SENA_WORKSPACE_API_ROUTES.snapshotRestore);
    expect(request?.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" }
    });
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      schemaVersion: "sena-snapshot-restore-request/v1",
      source
    });
  });
});
