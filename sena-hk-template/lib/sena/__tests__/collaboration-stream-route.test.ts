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
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

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
      expect(unauthenticated.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration-stream");
      expect(unauthenticated.headers.get("x-sena-observed-status-class")).toBe("4xx");
      await expect(unauthenticated.json()).resolves.toEqual(expect.objectContaining({ code: "auth_required" }));

      sessionToken = outsider.token;
      const forbidden = await route.GET(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration/stream`), {
        params: Promise.resolve({ projectId: project.id })
      });
      expect(forbidden.status).toBe(403);
      expect(forbidden.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration-stream");
      expect(forbidden.headers.get("x-sena-observed-status-class")).toBe("4xx");
      await expect(forbidden.json()).resolves.toEqual(expect.objectContaining({ code: "permission_denied" }));

      sessionToken = owner.token;
      const allowed = await route.GET(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration/stream`), {
        params: Promise.resolve({ projectId: project.id })
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get("content-type")).toContain("text/event-stream");
      expect(allowed.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration-stream");
      expect(allowed.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(allowed.headers.get("x-sena-collaboration-stream-observation")).toBe("setup-only");
      expect(allowed.headers.get("x-sena-collaboration-stream-auth")).toBe("session-rbac-project-read");
      expect(allowed.headers.get("x-sena-collaboration-comment-source")).toBe("file-json");
      expect(allowed.headers.get("x-sena-collaboration-presence-source")).toBe("file-json");
      expect(allowed.headers.get("x-sena-collaboration-reliability-source")).toBe("file-json");
      expect(allowed.headers.get("x-sena-collaboration-validation-source")).toBe("file-json");
      expect(allowed.headers.get("x-sena-collaboration-expert-review-source")).toBe("file-json");
      expect(allowed.headers.get("x-sena-collaboration-adjudication-source")).toBe("file-json");
      const reader = allowed.body?.getReader();
      const firstChunk = await reader?.read();
      await reader?.cancel();
      const eventText = new TextDecoder().decode(firstChunk?.value);
      expect(eventText).toContain("event: collaboration");
      expect(eventText).toContain("sena-project-collaboration-stream/v1");
      expect(eventText).toContain("evidenceSource");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, collaborationStreamRouteTestTimeoutMs);

  it("persists collaboration route presence, comments, and stream reads through Postgres primary state", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-collaboration-postgres-route-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
        }
      }
    }));
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Collaboration Owner",
        email: "postgres-collaboration-owner@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Collaboration Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
        teamId: registered.context.teams[0].id,
        title: "Postgres Collaboration Project",
        snapshot: streamSnapshot()
      });

      const route = await import("../../../app/api/sena/projects/[projectId]/collaboration/route");
      const streamRoute = await import("../../../app/api/sena/projects/[projectId]/collaboration/stream/route");
      const presenceCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const presenceResponse = await route.POST(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": presenceCsrf.token
        },
        body: JSON.stringify({
          action: "presence",
          activeView: "temporal-fusion",
          cursorLabel: "Temporal Fusion Arc"
        })
      }), {
        params: Promise.resolve({ projectId: project.id })
      });
      expect(presenceResponse.status).toBe(200);
      expect(presenceResponse.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration");
      expect(presenceResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");

      const commentCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const commentResponse = await route.POST(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": commentCsrf.token
        },
        body: JSON.stringify({
          action: "comment",
          body: "Postgres primary-state collaboration note.",
          target: { kind: "project", id: project.id, label: "Project overview" }
        })
      }), {
        params: Promise.resolve({ projectId: project.id })
      });
      const commentBody = await commentResponse.json() as {
        comment?: { id?: string; status?: string };
      };
      const commentId = commentBody.comment?.id;
      expect(commentResponse.status).toBe(201);
      expect(commentResponse.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration");
      expect(commentResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(commentId).toMatch(/^comment_/);
      expect(pg.state?.payload.projectComments.map((comment) => comment.id)).toContain(commentId);
      expect(pg.projectComments.map((comment) => comment.id)).toContain(commentId);
      expect(pg.state?.payload.projectPresence.map((presence) => presence.userId)).toContain(registered.context.user.id);
      expect(pg.projectPresence.map((presence) => presence.userId)).toContain(registered.context.user.id);

      const resolveCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const resolveResponse = await route.POST(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": resolveCsrf.token
        },
        body: JSON.stringify({
          action: "resolve-comment",
          commentId
        })
      }), {
        params: Promise.resolve({ projectId: project.id })
      });
      const resolveBody = await resolveResponse.json() as {
        comment?: { id?: string; status?: string };
      };
      expect(resolveResponse.status).toBe(200);
      expect(resolveResponse.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration");
      expect(resolveResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(resolveBody.comment?.status).toBe("resolved");
      expect(pg.state?.payload.projectComments.find((comment) => comment.id === commentId)?.status).toBe("resolved");
      expect(pg.projectComments.find((comment) => comment.id === commentId)?.status).toBe("resolved");

      const listResponse = await route.GET(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration`), {
        params: Promise.resolve({ projectId: project.id })
      });
      const listBody = await listResponse.json() as {
        comments?: Array<{ id?: string; status?: string }>;
        presence?: Array<{ userId?: string }>;
      };
      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(listResponse.headers.get("x-sena-collaboration-comment-source")).toBe("postgres-table");
      expect(listResponse.headers.get("x-sena-collaboration-presence-source")).toBe("postgres-table");
      expect(listBody.comments?.find((comment) => comment.id === commentId)?.status).toBe("resolved");
      expect(listBody.presence?.map((presence) => presence.userId)).toContain(registered.context.user.id);

      const streamResponse = await streamRoute.GET(new Request(`https://sena.example.test/api/sena/projects/${project.id}/collaboration/stream`), {
        params: Promise.resolve({ projectId: project.id })
      });
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get("x-sena-observed-route")).toBe("sena-project-collaboration-stream");
      expect(streamResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(streamResponse.headers.get("x-sena-collaboration-stream-observation")).toBe("setup-only");
      expect(streamResponse.headers.get("x-sena-collaboration-comment-source")).toBe("postgres-table");
      const reader = streamResponse.body?.getReader();
      const firstChunk = await reader?.read();
      await reader?.cancel();
      const eventText = new TextDecoder().decode(firstChunk?.value);
      expect(eventText).toContain("event: collaboration");
      expect(eventText).toContain("Postgres primary-state collaboration note.");

      const fileBackedDb = enterprise.readEnterpriseDb();
      expect(fileBackedDb.projects.map((candidate: { id: string }) => candidate.id)).not.toContain(project.id);
      expect(fileBackedDb.projectComments.map((comment: { id: string }) => comment.id)).not.toContain(commentId);
      expect(fileBackedDb.projectPresence.map((presence: { userId: string }) => presence.userId)).not.toContain(registered.context.user.id);
      expect(JSON.stringify({ listBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ listBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, collaborationStreamRouteTestTimeoutMs);
});
