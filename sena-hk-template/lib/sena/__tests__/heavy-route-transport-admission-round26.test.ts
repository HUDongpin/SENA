import { afterEach, describe, expect, it, vi } from "vitest";

const dummyContext = {
  user: { id: "user_round26", name: "Round 26 reviewer" },
  teams: [{ id: "team_round26" }]
};

afterEach(() => {
  vi.doUnmock("@/lib/sena/api-helpers");
  vi.doUnmock("@/lib/sena/enterprise/expert-review");
  vi.doUnmock("@/lib/sena/enterprise/team-project");
  vi.doUnmock("@sena/kernel");
  vi.restoreAllMocks();
  vi.resetModules();
});

async function mockMutationSession() {
  const requireMutationSession = vi.fn(async () => dummyContext);
  vi.doMock("@/lib/sena/api-helpers", async () => ({
    ...await vi.importActual<typeof import("../api-helpers")>("../api-helpers"),
    requireApiSessionForMutation: requireMutationSession
  }));
  return requireMutationSession;
}

function jsonRequest(pathname: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://sena.example.test${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

describe("heavy route transport admission ordering", () => {
  it("rejects oversized validation transport before auth or Request.json", async () => {
    vi.resetModules();
    const auth = await mockMutationSession();
    const parse = vi.spyOn(Request.prototype, "json");
    const route = await import("../../../app/api/sena/validation/group-comparison/route");
    const response = await route.POST(jsonRequest(
      "/api/sena/validation/group-comparison",
      {},
      { "content-length": String(32 * 1024 * 1024 + 1) }
    ));

    expect(response.status).toBe(413);
    expect(JSON.parse(await response.text())).toMatchObject({ code: "validation_request_too_large" });
    expect(auth).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  });

  it("rejects expert-review unknown fields before auth or expert state entry", async () => {
    vi.resetModules();
    const auth = await mockMutationSession();
    const createReview = vi.fn(async () => {
      throw new Error("expert review state must not be entered");
    });
    vi.doMock("@/lib/sena/enterprise/expert-review", async () => ({
      ...await vi.importActual<typeof import("../enterprise/expert-review")>("../enterprise/expert-review"),
      createEnterpriseExpertReviewWithPostgresMirrorAsync: createReview
    }));
    const route = await import("../../../app/api/sena/validation/expert-review/route");
    const response = await route.POST(jsonRequest("/api/sena/validation/expert-review", {
      projectId: "project_round26",
      unsupported: "must-not-enter-state"
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "expert_review_request_fields_invalid" });
    expect(auth).not.toHaveBeenCalled();
    expect(createReview).not.toHaveBeenCalled();
  });

  it("rejects analysis control-shape violations before auth, project reads, or model entry", async () => {
    vi.resetModules();
    const auth = await mockMutationSession();
    const getProject = vi.fn(async () => {
      throw new Error("project state must not be read");
    });
    const buildRun = vi.fn(() => {
      throw new Error("analysis model must not run");
    });
    vi.doMock("@/lib/sena/enterprise/team-project", async () => ({
      ...await vi.importActual<typeof import("../enterprise/team-project")>("../enterprise/team-project"),
      getEnterpriseProjectAsync: getProject
    }));
    vi.doMock("@sena/kernel", async () => ({
      ...await vi.importActual<typeof import("@sena/kernel")>("@sena/kernel"),
      buildSenaAnalysisRun: buildRun
    }));
    const route = await import("../../../app/api/sena/analyze/route");
    const response = await route.POST(jsonRequest("/api/sena/analyze", {
      projectId: "project_round26",
      humanReview: { status: "draft", unsupported: true }
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "analysis_request_fields_invalid" });
    expect(auth).not.toHaveBeenCalled();
    expect(getProject).not.toHaveBeenCalled();
    expect(buildRun).not.toHaveBeenCalled();
  });

  it("rejects import file fan-out before auth, formData parsing, or file buffering", async () => {
    vi.resetModules();
    const auth = await mockMutationSession();
    const parse = vi.spyOn(Request.prototype, "formData");
    const fileBuffer = vi.spyOn(File.prototype, "arrayBuffer");
    const form = new FormData();
    for (let index = 0; index < 101; index += 1) {
      form.append("files", new File(["a"], `${index}.csv`, { type: "text/csv" }));
    }
    const route = await import("../../../app/api/sena/import/route");
    const response = await route.POST(new Request("https://sena.example.test/api/sena/import", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "import_request_multipart_limits_exceeded"
    });
    expect(auth).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(fileBuffer).not.toHaveBeenCalled();
  });
});
