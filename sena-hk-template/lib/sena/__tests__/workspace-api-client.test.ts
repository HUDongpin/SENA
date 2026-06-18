import { describe, expect, it } from "vitest";
import {
  buildEnterpriseExpertReviewQuery,
  buildEnterpriseTeamQuery,
  buildSenaWorkspaceApiUrl,
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
});
