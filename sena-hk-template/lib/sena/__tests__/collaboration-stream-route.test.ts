import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";

const collaborationStreamRouteTestTimeoutMs = 30_000;

function streamSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Collaboration Stream Project",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Stream test",
      interpretation: "Collaboration stream fixture.",
      limitations: "Fixture only.",
      nextActions: "Verify stream RBAC."
    }
  });
}

describe("SENA collaboration stream route", () => {
  it("preflights session and project RBAC before opening the SSE stream", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-collaboration-stream-"));
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
        name: "Stream Owner",
        email: "stream-owner@example.edu",
        password: "sena-secure-123",
        organization: "Stream Lab",
        plan: "lab"
      });
      const outsider = enterprise.registerEnterpriseUser({
        name: "Stream Outsider",
        email: "stream-outsider@example.edu",
        password: "sena-secure-123",
        organization: "Other Stream Lab",
        plan: "lab"
      });
      const project = enterprise.createEnterpriseProject(owner.context, {
        teamId: owner.context.teams[0].id,
        title: "Collaboration Stream Project",
        snapshot: streamSnapshot()
      });
      const route = await import("../../../app/api/sena/projects/[projectId]/collaboration/stream/route");

      sessionToken = "";
      const unauthenticated = await route.GET(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration/stream`), {
        params: Promise.resolve({ projectId: project.id })
      });
      expect(unauthenticated.status).toBe(401);
      await expect(unauthenticated.json()).resolves.toEqual(expect.objectContaining({ code: "auth_required" }));

      sessionToken = outsider.token;
      const forbidden = await route.GET(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration/stream`), {
        params: Promise.resolve({ projectId: project.id })
      });
      expect(forbidden.status).toBe(403);
      await expect(forbidden.json()).resolves.toEqual(expect.objectContaining({ code: "permission_denied" }));

      sessionToken = owner.token;
      const allowed = await route.GET(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration/stream`), {
        params: Promise.resolve({ projectId: project.id })
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("content-type")).toContain("text/event-stream");
      expect(allowed.headers.get("x-sena-collaboration-stream-auth")).toBe("session-rbac-project-read");
      const reader = allowed.body?.getReader();
      const firstChunk = await reader?.read();
      await reader?.cancel();
      const eventText = new TextDecoder().decode(firstChunk?.value);
      expect(eventText).toContain("event: collaboration");
      expect(eventText).toContain("sena-project-collaboration-stream/v1");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, collaborationStreamRouteTestTimeoutMs);
});
