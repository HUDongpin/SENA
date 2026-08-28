import { beforeEach, describe, expect, it, vi } from "vitest";

const requireApiSession = vi.fn();
const verifyCsrf = vi.fn();
const createRun = vi.fn();
const performAction = vi.fn();

vi.mock("@/lib/sena/api-helpers", () => ({ requireApiSession }));
vi.mock("@/lib/sena/enterprise/auth-session", () => ({ verifyEnterpriseCsrfTokenAsync: verifyCsrf }));
vi.mock("@/lib/sena/enterprise/team-project", () => ({
  getEnterpriseProjectAsync: vi.fn(async () => ({ id: "project_1", currentVersion: 3 }))
}));
vi.mock("@/lib/sena/enterprise/team-collaboration", () => ({
  listEnterpriseProjectCollaborationWithPostgresEvidenceAsync: vi.fn(async () => ({
    revisions: [{ id: "revision_3", version: 3 }]
  }))
}));
vi.mock("@/lib/sena/workflow/api-runtime", () => ({
  createSenaWorkflowRun: createRun,
  performSenaWorkflowAction: performAction,
  withSenaWorkflowStore: vi.fn(async (operation: (store: object) => unknown) => operation({}))
}));

function formRequest(entries: Array<[string, string]>) {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return new Request("https://sena.example.test/workspace/sena/automation/command", {
    method: "POST",
    body: form
  });
}

const common: Array<[string, string]> = [
  ["csrfToken", "csrf-test-token"],
  ["idempotencyKey", "sena-ui-test-00000000-0000-4000-8000-000000000000"],
  ["teamId", "team_1"]
];

describe("EvidenceFlow progressive form command adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiSession.mockResolvedValue({ user: { id: "user_1" } });
    verifyCsrf.mockResolvedValue(true);
    createRun.mockResolvedValue({ run: { id: "workflow_run_created" } });
    performAction.mockResolvedValue({ run: { id: "workflow_run_existing" } });
  });

  it("maps an engineering form to the authoritative run command and redirects with pending wording", async () => {
    const { POST } = await import("../../../app/workspace/sena/automation/command/route");
    const response = await POST(formRequest([
      ...common,
      ["intent", "start-engineering"],
      ["repo", "HUDongpin/SENA"],
      ["baseSha", "a".repeat(40)],
      ["candidateSha", "b".repeat(40)],
      ["workRequestDigest", "c".repeat(64)],
      ["engineeringJson", JSON.stringify({ engineeringEvidence: { fixtureRepository: true } })]
    ]));

    expect(verifyCsrf).toHaveBeenCalledWith(expect.anything(), "csrf-test-token");
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: common[1][1],
      body: expect.objectContaining({
        kind: "engineering-release",
        teamId: "team_1",
        repo: "HUDongpin/SENA",
        baseSha: "a".repeat(40),
        candidateSha: "b".repeat(40),
        workRequestDigest: "c".repeat(64)
      })
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/^\/workspace\/sena\/automation\?/);
    expect(response.headers.get("location")).not.toContain("sena.example.test");
    expect(response.headers.get("location")).toContain("run=workflow_run_created");
    expect(response.headers.get("location")).toContain("notice=started");
  });

  it("maps an approval form without weakening expectedVersion or digest binding", async () => {
    const { POST } = await import("../../../app/workspace/sena/automation/command/route");
    const response = await POST(formRequest([
      ...common,
      ["intent", "approve"],
      ["runId", "workflow_run_existing"],
      ["expectedVersion", "7"],
      ["interruptId", "interrupt_exact"],
      ["decisionDigest", "d".repeat(64)]
    ]));

    expect(performAction).toHaveBeenCalledWith(expect.objectContaining({
      runId: "workflow_run_existing",
      idempotencyKey: common[1][1],
      body: {
        action: "approve",
        expectedVersion: 7,
        interruptId: "interrupt_exact",
        decisionDigest: "d".repeat(64)
      }
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("notice=action");
  });

  it("rejects an oversized declared form before session, CSRF, or workflow state reads", async () => {
    const { POST } = await import("../../../app/workspace/sena/automation/command/route");
    const response = await POST(new Request("https://sena.example.test/workspace/sena/automation/command", {
      method: "POST",
      headers: { "content-length": String(64 * 1024 + 1) },
      body: "blocked"
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=workflow_form_too_large");
    expect(requireApiSession).not.toHaveBeenCalled();
    expect(verifyCsrf).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
  });

  it("bounds a chunked form even when Content-Length is absent", async () => {
    const { POST } = await import("../../../app/workspace/sena/automation/command/route");
    const request = new Request("https://sena.example.test/workspace/sena/automation/command", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `payload=${"x".repeat(64 * 1024 + 1)}`
    });
    expect(request.headers.get("content-length")).toBeNull();
    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=workflow_form_too_large");
    expect(requireApiSession).not.toHaveBeenCalled();
  });
});
