import { createHash } from "node:crypto";
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

const projectsRouteTestTimeoutMs = 30_000;

function projectRouteSnapshot(title: string) {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title,
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "draft",
      reviewer: "Route project test",
      interpretation: `${title} route persistence test.`,
      limitations: "Fixture only.",
      nextActions: "Attach project route headers."
    },
    codingReliability: {
      status: "not-documented",
      reviewer: "Route project test",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
      agreementValue: "pending",
      adjudicationNotes: "Pending route test evidence.",
      limitations: "Fixture only."
    }
  });
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("SENA projects route", () => {
  it("returns project version and snapshot provenance headers for create, update, and restore", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-projects-route-"));
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
    vi.doMock("@/lib/sena/project-handoff", async () => await import("../project-handoff"));
    vi.doMock("@/lib/sena/snapshot", async () => await import("../snapshot"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Project Owner",
        email: "project-owner@example.edu",
        password: "sena-secure-123",
        organization: "Project Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const createCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const projectsRoute = await import("../../../app/api/sena/projects/route");
      const createSnapshot = projectRouteSnapshot("Route Project Version 1");

      const createResponse = await projectsRoute.POST(new Request("https://sena.example.test/api/sena/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": createCsrf.token
        },
        body: JSON.stringify({
          teamId: registered.context.teams[0].id,
          title: "Route Project",
          description: "Created through the project route test.",
          snapshot: createSnapshot
        })
      }));
      const createBody = await createResponse.json() as {
        schemaVersion?: string;
        project?: { id?: string; teamId?: string; currentVersion?: number; snapshot?: unknown };
      };

      expect(createResponse.status).toBe(201);
      expect(createBody.schemaVersion).toBe("sena-project/v1");
      expect(createBody.project?.currentVersion).toBe(1);
      expect(createResponse.headers.get("x-sena-project-id")).toBe(createBody.project?.id);
      expect(createResponse.headers.get("x-sena-team-id")).toBe(registered.context.teams[0].id);
      expect(createResponse.headers.get("x-sena-project-version")).toBe("1");
      expect(createResponse.headers.get("x-sena-project-snapshot-sha256")).toBe(artifactSha256(createBody.project?.snapshot));

      const projectRoute = await import("../../../app/api/sena/projects/[projectId]/route");
      const updateCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const updateSnapshot = projectRouteSnapshot("Route Project Version 2");
      const updateResponse = await projectRoute.PUT(new Request(`https://sena.example.test/api/sena/projects/${createBody.project?.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": updateCsrf.token
        },
        body: JSON.stringify({
          snapshot: updateSnapshot,
          expectedVersion: 1
        })
      }), { params: Promise.resolve({ projectId: String(createBody.project?.id) }) });
      const updateBody = await updateResponse.json() as {
        project?: { id?: string; currentVersion?: number; snapshot?: unknown };
      };

      expect(updateResponse.status).toBe(200);
      expect(updateBody.project?.currentVersion).toBe(2);
      expect(updateResponse.headers.get("x-sena-project-id")).toBe(createBody.project?.id);
      expect(updateResponse.headers.get("x-sena-project-version")).toBe("2");
      expect(updateResponse.headers.get("x-sena-project-snapshot-sha256")).toBe(artifactSha256(updateBody.project?.snapshot));

      const restoreCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const restoreResponse = await projectRoute.PATCH(new Request(`https://sena.example.test/api/sena/projects/${createBody.project?.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": restoreCsrf.token
        },
        body: JSON.stringify({
          action: "restore-revision",
          version: 1,
          expectedVersion: 2
        })
      }), { params: Promise.resolve({ projectId: String(createBody.project?.id) }) });
      const restoreBody = await restoreResponse.json() as {
        schemaVersion?: string;
        project?: { id?: string; currentVersion?: number; snapshot?: unknown };
        restoredFrom?: { version?: number };
        restoredRevision?: { version?: number };
      };

      expect(restoreResponse.status).toBe(200);
      expect(restoreBody.schemaVersion).toBe("sena-project-revision-restore/v1");
      expect(restoreBody.project?.currentVersion).toBe(3);
      expect(restoreBody.restoredFrom?.version).toBe(1);
      expect(restoreResponse.headers.get("x-sena-project-id")).toBe(createBody.project?.id);
      expect(restoreResponse.headers.get("x-sena-project-version")).toBe("3");
      expect(restoreResponse.headers.get("x-sena-project-snapshot-sha256")).toBe(artifactSha256(restoreBody.project?.snapshot));
      expect(restoreResponse.headers.get("x-sena-project-restored-from-version")).toBe("1");
      expect(restoreResponse.headers.get("x-sena-project-restored-version")).toBe("3");

      const deleteCsrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const deleteResponse = await projectRoute.DELETE(new Request(`https://sena.example.test/api/sena/projects/${createBody.project?.id}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": deleteCsrf.token
        }
      }), { params: Promise.resolve({ projectId: String(createBody.project?.id) }) });
      const deleteBody = await deleteResponse.json() as {
        schemaVersion?: string;
        projectId?: string;
        teamId?: string;
        projectVersion?: number;
        deleted?: boolean;
        deletedAt?: string;
        snapshotSha256?: string;
      };

      expect(deleteResponse.status).toBe(200);
      expect(deleteBody.schemaVersion).toBe("sena-project-delete/v1");
      expect(deleteBody.projectId).toBe(createBody.project?.id);
      expect(deleteBody.teamId).toBe(registered.context.teams[0].id);
      expect(deleteBody.projectVersion).toBe(3);
      expect(deleteBody.deleted).toBe(true);
      expect(deleteBody.deletedAt).toMatch(/^202|^203|^204/);
      expect(deleteBody.snapshotSha256).toBe(artifactSha256(restoreBody.project?.snapshot));
      expect(deleteResponse.headers.get("x-sena-project-id")).toBe(createBody.project?.id);
      expect(deleteResponse.headers.get("x-sena-team-id")).toBe(registered.context.teams[0].id);
      expect(deleteResponse.headers.get("x-sena-project-version")).toBe("3");
      expect(deleteResponse.headers.get("x-sena-project-snapshot-sha256")).toBe(artifactSha256(restoreBody.project?.snapshot));
      expect(deleteResponse.headers.get("x-sena-project-deleted")).toBe("true");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, projectsRouteTestTimeoutMs);
});
