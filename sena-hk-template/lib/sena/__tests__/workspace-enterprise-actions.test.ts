import { describe, expect, it } from "vitest";
import {
  addEnterpriseAdjudicationAction,
  addEnterpriseCommentAction,
  createEnterpriseUploadRegistryFilesAction,
  deliverEnterpriseCollaborationPubSubAction,
  deliverEnterpriseUploadObjectStorageAction,
  enableEnterpriseMfaAction,
  exportEnterprisePublicationAction,
  importEnterpriseReliabilityFilesAction,
  openEnterpriseProjectAction,
  refreshEnterpriseUploadStorageAction,
  reviewEnterpriseReliabilityRunAction,
  reviewEnterpriseValidationRunAction,
  revokeEnterpriseSessionAction,
  runEnterpriseValidationComparisonAction,
  runEnterpriseSsoPreflightAction,
  saveEnterpriseProjectAction,
  startEnterpriseMfaSetupAction,
  submitEnterpriseExpertReviewAction,
  touchEnterprisePresenceAction
} from "../../../components/sena/workspace/enterprise-actions";

describe("SENA workspace enterprise action helpers", () => {
  const jsonHeaders = async () => ({
    "content-type": "application/json",
    "x-sena-csrf-token": "csrf-token"
  });
  const csrfHeaders = async () => ({
    "x-sena-csrf-token": "csrf-token"
  });

  it("centralizes authenticated session action request construction", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];

    const payload = await revokeEnterpriseSessionAction({
      action: "revoke-others"
    }, {
      jsonHeaders,
      fetchImpl: async (input, init) => {
        seen.push({ url: String(input), init });
        return new Response(JSON.stringify({
          generatedAt: "2026-06-19T00:00:00.000Z",
          remainingSessions: [],
          revokedCount: 2
        }), { status: 200 });
      }
    });

    expect(payload.revokedCount).toBe(2);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("/api/auth/sessions");
    expect(seen[0].init?.method).toBe("DELETE");
    expect(seen[0].init?.headers).toEqual({
      "content-type": "application/json",
      "x-sena-csrf-token": "csrf-token"
    });
    expect(JSON.parse(String(seen[0].init?.body))).toEqual({ action: "revoke-others" });
  });

  it("centralizes MFA setup and enable action bodies", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.action === "setup") {
        return new Response(JSON.stringify({
          schemaVersion: "sena-enterprise-mfa-setup/v1",
          method: "totp",
          setupToken: "setup-token",
          secret: "secret",
          otpauthUrl: "otpauth://totp/SENA",
          expiresAt: "2026-06-19T00:05:00.000Z"
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        schemaVersion: "sena-enterprise-mfa-status/v1",
        enabled: true,
        method: "totp"
      }), { status: 200 });
    };

    const setup = await startEnterpriseMfaSetupAction({ jsonHeaders, fetchImpl });
    const status = await enableEnterpriseMfaAction({
      setupToken: setup.setupToken,
      code: "123456"
    }, {
      jsonHeaders,
      fetchImpl
    });

    expect(status.enabled).toBe(true);
    expect(requests.map((request) => request.url)).toEqual(["/api/auth/mfa", "/api/auth/mfa"]);
    expect(requests.map((request) => request.init?.method)).toEqual(["POST", "POST"]);
    expect(requests.map((request) => JSON.parse(String(request.init?.body)))).toEqual([
      { action: "setup" },
      { action: "enable", setupToken: "setup-token", code: "123456" }
    ]);
  });

  it("returns validated SSO preflight evidence from the provider action", async () => {
    const preflight = await runEnterpriseSsoPreflightAction("google", {
      fetchImpl: async (input) => {
        expect(String(input)).toBe("/api/auth/sso?status=1&preflight=1&provider=google");
        return new Response(JSON.stringify({
          schemaVersion: "sena-sso-provider-status/v1",
          preflight: {
            schemaVersion: "sena-enterprise-sso-preflight/v1",
            generatedAt: "2026-06-19T00:00:00.000Z",
            baseUrl: "https://sena.example",
            summary: {
              checked: 1,
              passed: 1,
              review: 0,
              configuredProviders: 1
            },
            providers: []
          }
        }), { status: 200 });
      }
    });

    expect(preflight.summary).toMatchObject({ checked: 1, passed: 1, review: 0 });
  });

  it("centralizes enterprise upload registry and object-storage requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        schemaVersion: "sena-enterprise-upload-list/v1",
        uploads: [],
        status: "checked",
        summary: { delivered: 1, failed: 0, skipped: 0 }
      }), { status: 200 });
    };

    const uploadFile = new File(["person_id,name"], "people.csv", { type: "text/csv" });
    await refreshEnterpriseUploadStorageAction({ teamId: "team 1", verify: true }, { fetchImpl });
    await createEnterpriseUploadRegistryFilesAction({ files: [uploadFile], teamId: "team 1" }, { csrfHeaders, fetchImpl });
    await deliverEnterpriseUploadObjectStorageAction({ teamId: "team 1", uploadId: "upload/1" }, { jsonHeaders, fetchImpl });

    expect(requests.map((request) => request.url)).toEqual([
      "/api/sena/uploads?teamId=team+1&verify=1",
      "/api/sena/uploads",
      "/api/sena/uploads"
    ]);
    expect(requests.map((request) => request.init?.method)).toEqual([undefined, "POST", "POST"]);
    expect(requests[1].init?.headers).toEqual({ "x-sena-csrf-token": "csrf-token" });
    expect(requests[1].init?.body).toBeInstanceOf(FormData);
    expect((requests[1].init?.body as FormData).get("teamId")).toBe("team 1");
    expect((requests[1].init?.body as FormData).getAll("files")).toHaveLength(1);
    expect(JSON.parse(String(requests[2].init?.body))).toEqual({
      action: "deliver-object-storage",
      teamId: "team 1",
      uploadId: "upload/1",
      limit: 1,
      includeReview: true
    });
  });

  it("centralizes collaboration presence, comment, adjudication, and pubsub actions", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        project: { id: "project/1", title: "Pilot", currentVersion: 3, updatedAt: "2026-06-19T00:00:00.000Z" },
        revisions: [],
        comments: [],
        presence: [],
        adjudications: [],
        reliabilityRuns: [],
        validationRuns: [],
        expertReviews: [],
        summary: { delivered: 2, failed: 0, skipped: 1 }
      }), { status: 200 });
    };

    await touchEnterprisePresenceAction({ projectId: "project/1", activeView: "plots", cursorLabel: "fusion" }, { jsonHeaders, fetchImpl });
    await addEnterpriseCommentAction({
      projectId: "project/1",
      body: "Looks ready",
      target: { kind: "project", label: "Project" }
    }, { jsonHeaders, fetchImpl });
    await addEnterpriseAdjudicationAction({
      projectId: "project/1",
      reliabilityRunId: "rel-1",
      itemId: "item-1",
      codeId: "code-1",
      decision: "include",
      notes: "Resolved"
    }, { jsonHeaders, fetchImpl });
    await deliverEnterpriseCollaborationPubSubAction({ projectId: "project/1" }, { jsonHeaders, fetchImpl });

    expect(requests).toHaveLength(4);
    expect(requests.every((request) => request.url === "/api/sena/projects/project%2F1/collaboration")).toBe(true);
    expect(requests.map((request) => JSON.parse(String(request.init?.body)).action)).toEqual([
      "presence",
      "comment",
      "adjudication",
      "deliver-pubsub"
    ]);
  });

  it("centralizes enterprise project save and open requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        project: {
          id: "project-1",
          teamId: "team-1",
          title: "Pilot",
          description: "Saved project",
          currentVersion: 2,
          datasetCounts: { people: 1, utterances: 1, codedSegments: 1, codes: 1 },
          activeWindowLabel: "All",
          claimUse: "exploratory-only",
          updatedAt: "2026-06-19T00:00:00.000Z",
          snapshot: { schemaVersion: "sena-project-snapshot/v1" }
        }
      }), { status: 200 });
    };

    await saveEnterpriseProjectAction({
      teamId: "team-1",
      title: "Pilot",
      description: "Saved project",
      snapshot: { schemaVersion: "sena-project-snapshot/v1" },
      projectId: undefined,
      expectedVersion: undefined
    }, { jsonHeaders, fetchImpl });
    await openEnterpriseProjectAction({ projectId: "project-1" }, { fetchImpl });

    expect(requests.map((request) => request.url)).toEqual([
      "/api/sena/projects",
      "/api/sena/projects/project-1"
    ]);
    expect(requests[0].init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
      teamId: "team-1",
      title: "Pilot",
      description: "Saved project"
    });
    expect(requests[1].init).toBeUndefined();
  });

  it("centralizes enterprise publication export blob requests", async () => {
    const payload = await exportEnterprisePublicationAction({
      format: "pdf",
      projectId: "project-1"
    }, {
      jsonHeaders,
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("/api/sena/exports/publication");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          format: "pdf",
          projectId: "project-1"
        });
        return new Response("pdf-bytes", {
          status: 200,
          headers: { "content-disposition": "attachment; filename=\"sena-publication.pdf\"" }
        });
      }
    });

    expect(payload.filename).toBe("sena-publication.pdf");
    expect(await payload.blob.text()).toBe("pdf-bytes");
  });

  it("centralizes reliability upload and review requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        reviewPatch: { status: "documented" },
        dashboard: {
          meanPairwiseKappa: 0.8,
          krippendorffAlphaNominal: 0.7,
          disagreementCount: 2
        },
        reliabilityRun: { id: "rel-1", status: "approved" }
      }), { status: 200 });
    };

    await importEnterpriseReliabilityFilesAction({
      files: [new File(["item,code"], "reliability.csv", { type: "text/csv" })],
      teamId: "team-1",
      projectId: "project-1",
      reviewer: "Reviewer"
    }, { csrfHeaders, fetchImpl });
    await reviewEnterpriseReliabilityRunAction({
      runId: "rel-1",
      status: "approved",
      notes: "Looks good"
    }, { jsonHeaders, fetchImpl });

    expect(requests.map((request) => request.url)).toEqual([
      "/api/sena/reliability",
      "/api/sena/reliability"
    ]);
    expect(requests.map((request) => request.init?.method)).toEqual(["POST", "PATCH"]);
    expect(requests[0].init?.body).toBeInstanceOf(FormData);
    expect((requests[0].init?.body as FormData).get("projectId")).toBe("project-1");
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({
      runId: "rel-1",
      status: "approved",
      notes: "Looks good"
    });
  });

  it("centralizes validation and expert-review action requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(input).includes("expert-review")) {
        return new Response(JSON.stringify({
          expertReview: {
            id: body.reviewId ?? "expert-1",
            status: body.status,
            claimScope: body.claimScope
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        schemaVersion: "sena-group-comparison-validation/v1",
        metric: "weighted_social_strength",
        groupA: "A",
        groupB: "B",
        permutation: { pTwoSided: 0.04 },
        validationRun: {
          id: body.runId ?? "val-1",
          status: body.status ?? "pending-review"
        }
      }), { status: 200 });
    };

    await runEnterpriseValidationComparisonAction({
      teamId: "team-1",
      projectId: "project-1",
      snapshot: { schemaVersion: "sena-project-snapshot/v1" },
      groupField: "role",
      groupA: "A",
      groupB: "B",
      metric: "weighted_social_strength",
      iterations: 1000,
      seed: 20260611,
      preregistrationNote: "Pre",
      methodNote: "Method",
      parityEvidence: { studySpecificInferenceReference: "doi:example" }
    }, { jsonHeaders, fetchImpl });
    await reviewEnterpriseValidationRunAction({ runId: "val-1", status: "approved", notes: "Approved" }, { jsonHeaders, fetchImpl });
    await submitEnterpriseExpertReviewAction({
      projectId: "project-1",
      target: { kind: "project", label: "Project claim review" },
      reviewerName: "Expert",
      expertiseArea: "Learning analytics",
      status: "approved",
      claimScope: "exploratory-only",
      ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
      concerns: "",
      recommendations: "",
      limitations: "Pilot only"
    }, { jsonHeaders, fetchImpl });

    expect(requests.map((request) => request.url)).toEqual([
      "/api/sena/validation/group-comparison",
      "/api/sena/validation/group-comparison",
      "/api/sena/validation/expert-review"
    ]);
    expect(requests.map((request) => request.init?.method)).toEqual(["POST", "PATCH", "POST"]);
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
      teamId: "team-1",
      projectId: "project-1",
      metric: "weighted_social_strength",
      parityEvidence: { studySpecificInferenceReference: "doi:example" }
    });
    expect(JSON.parse(String(requests[2].init?.body))).toMatchObject({
      projectId: "project-1",
      status: "approved",
      claimScope: "exploratory-only"
    });
  });
});
