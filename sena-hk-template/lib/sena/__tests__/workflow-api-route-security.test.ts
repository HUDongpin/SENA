import { afterEach, describe, expect, it, vi } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaWorkflowCommand, SenaWorkflowRun } from "../workflow/types";

const context = {
  user: { id: "workflow_route_user", name: "Workflow route reviewer" },
  teams: [{ id: "workflow_route_team" }]
};

function run(overrides: Partial<SenaWorkflowRun> = {}): SenaWorkflowRun {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.workflowRun,
    id: "workflow_run_route_security",
    version: 7,
    kind: "engineering-release",
    definitionVersion: "v1",
    definitionHash: "1".repeat(64),
    mode: "shadow",
    teamId: "workflow_route_team",
    repo: "HUDongpin/SENA",
    baseSha: "2".repeat(40),
    candidateSha: "3".repeat(40),
    sourceBindingDigest: "4".repeat(64),
    codeSha: "5".repeat(40),
    configDigest: "6".repeat(64),
    status: "failed",
    currentNodeId: "focused-gates",
    attempt: 1,
    blockers: [],
    jobReferences: [],
    artifactReferences: [],
    approvalReferences: [],
    evidenceLayers: {
      source: "passed",
      local: "failed",
      ci: "not-run",
      merged: "not-run",
      deployed: "not-run",
      live: "not-run"
    },
    startIdempotencyKey: "route-secret-idempotency-key",
    startPayloadDigest: "7".repeat(64),
    createdByUserId: "route-secret-user-id",
    receiptSequence: 0,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:01:00.000Z",
    ...overrides
  };
}

function command(runId: string): SenaWorkflowCommand {
  return {
    id: "workflow_command_route_security",
    runId,
    kind: "fork",
    expectedVersion: 1,
    idempotencyKey: "route-secret-command-idempotency",
    payloadDigest: "8".repeat(64),
    payload: { sourceSecret: "must-not-reach-route-response" },
    status: "pending",
    attempts: 0,
    availableAt: "2026-08-28T00:01:00.000Z",
    createdAt: "2026-08-28T00:01:00.000Z",
    updatedAt: "2026-08-28T00:01:00.000Z"
  };
}

async function routeApiHelpers() {
  vi.doMock("@/lib/sena/api-helpers", async () => ({
    observeSenaApiRoute: async (
      _request: Request,
      _metadata: unknown,
      operation: () => Promise<Response>
    ) => {
      try {
        return await operation();
      } catch (error) {
        const shaped = error as { status?: number; code?: string; message?: string };
        return Response.json({ code: shaped.code ?? "internal_error" }, { status: shaped.status ?? 500 });
      }
    },
    requireApiSession: vi.fn(async () => context),
    requireApiSessionForMutation: vi.fn(async () => context)
  }));
  vi.doMock("@/lib/sena/enterprise/access-control", () => ({
    requireEnterprisePermission: vi.fn()
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/sena/api-helpers");
  vi.doUnmock("@/lib/sena/enterprise/access-control");
  vi.doUnmock("@/lib/sena/workflow/api-runtime");
  vi.doUnmock("@/lib/sena/workflow/closeout");
  vi.doUnmock("@/lib/sena/workflow/postgres-runtime");
});

describe("EvidenceFlow API route evidence boundaries", () => {
  it("projects every run-shaped fork response and excludes command payloads", async () => {
    await routeApiHelpers();
    const sourceRun = run({ id: "workflow_run_source", status: "superseded" });
    const forkedRun = run({
      id: "workflow_run_forked",
      status: "queued",
      startIdempotencyKey: "fork-secret-idempotency",
      createdByUserId: "fork-secret-user"
    });
    const forkCommand = command(forkedRun.id);
    vi.doMock("@/lib/sena/workflow/api-runtime", () => ({
      readSenaWorkflowJson: vi.fn(async () => ({ action: "fork" })),
      requireSenaWorkflowIdempotencyKey: vi.fn(() => "request-idempotency"),
      withSenaWorkflowStore: vi.fn(async (operation: (store: object) => unknown) => operation({})),
      performSenaWorkflowAction: vi.fn(async () => ({
        action: "fork",
        created: true,
        sourceRun,
        forkedRun,
        run: forkedRun,
        command: forkCommand
      }))
    }));
    vi.doMock("@/lib/sena/workflow/postgres-runtime", () => ({
      senaWorkflowCheckpointBinding: vi.fn()
    }));

    const route = await import("../../../app/api/sena/workflows/runs/[runId]/actions/route");
    const response = await route.POST(new Request(
      "https://sena.example.test/api/sena/workflows/runs/workflow_run_source/actions",
      { method: "POST", body: "{}" }
    ), { params: Promise.resolve({ runId: sourceRun.id }) });
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      run: { id: forkedRun.id, startIdempotencyKeyHash: expect.any(String), createdByUserIdHash: expect.any(String) },
      forkedRun: { id: forkedRun.id, startIdempotencyKeyHash: expect.any(String), createdByUserIdHash: expect.any(String) },
      sourceRun: { id: sourceRun.id, startIdempotencyKeyHash: expect.any(String), createdByUserIdHash: expect.any(String) },
      command: { id: forkCommand.id, idempotencyKeyHash: expect.any(String), payloadExcluded: true }
    });
    for (const forbidden of [
      sourceRun.startIdempotencyKey,
      sourceRun.createdByUserId,
      forkedRun.startIdempotencyKey,
      forkedRun.createdByUserId,
      forkCommand.idempotencyKey,
      "must-not-reach-route-response"
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("requires an exact version for provisional closeout before reading events", async () => {
    await routeApiHelpers();
    const failedRun = run();
    const getRun = vi.fn(async () => failedRun);
    const runEvents = vi.fn();
    vi.doMock("@/lib/sena/workflow/api-runtime", () => ({
      withSenaWorkflowStore: vi.fn(async (operation: (store: object) => unknown) => operation({ getRun, runEvents }))
    }));

    const route = await import("../../../app/api/sena/workflows/runs/[runId]/closeout/route");
    const response = await route.GET(new Request(
      `https://sena.example.test/api/sena/workflows/runs/${failedRun.id}/closeout`
    ), { params: Promise.resolve({ runId: failedRun.id }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "workflow_closeout_version_binding_required" });
    expect(runEvents).not.toHaveBeenCalled();
  });

  it("rejects a provisional closeout when the event snapshot version drifted", async () => {
    await routeApiHelpers();
    const failedRun = run();
    const getRun = vi.fn(async () => failedRun);
    const runEvents = vi.fn(async () => ({
      run: { ...failedRun, version: failedRun.version + 1 },
      commands: [], receipts: [], approvals: [], artifacts: []
    }));
    vi.doMock("@/lib/sena/workflow/api-runtime", () => ({
      withSenaWorkflowStore: vi.fn(async (operation: (store: object) => unknown) => operation({ getRun, runEvents }))
    }));

    const route = await import("../../../app/api/sena/workflows/runs/[runId]/closeout/route");
    const response = await route.GET(new Request(
      `https://sena.example.test/api/sena/workflows/runs/${failedRun.id}/closeout?version=${failedRun.version}`
    ), { params: Promise.resolve({ runId: failedRun.id }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "workflow_closeout_version_conflict" });
  });
});
