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
import type { SenaEnterpriseDb } from "../enterprise/state";

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

class ProjectRouteMemoryPostgres {
  state: { revision: number; payload: SenaEnterpriseDb } | null = null;
  auditRows: Array<Record<string, unknown>> = [];
  queries: string[] = [];

  async query(sql: string, values: unknown[] = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    this.queries.push(normalizedSql);
    if (/CREATE TABLE IF NOT EXISTS/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/CREATE INDEX IF NOT EXISTS/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
      return {
        rows: this.state ? [{ revision: this.state.revision, payload: this.state.payload }] : [],
        rowCount: this.state ? 1 : 0
      };
    }
    if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO NOTHING/i.test(normalizedSql)) {
      if (!this.state) {
        this.state = {
          revision: 0,
          payload: values[2] as SenaEnterpriseDb
        };
      }
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE "public"\."sena_enterprise_state" SET payload/i.test(normalizedSql)) {
      const expectedRevision = Number(values[2]);
      if (!this.state || this.state.revision !== expectedRevision) {
        return { rows: [], rowCount: 0 };
      }
      this.state = {
        revision: this.state.revision + 1,
        payload: values[0] as SenaEnterpriseDb
      };
      return { rows: [{ revision: this.state.revision }], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO UPDATE/i.test(normalizedSql)) {
      this.state = {
        revision: (this.state?.revision ?? -1) + 1,
        payload: values[2] as SenaEnterpriseDb
      };
      return { rows: [{ revision: this.state.revision }], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
      this.auditRows.unshift({
        id: values[0],
        event: values[1],
        user_id: values[2],
        team_id: values[3],
        project_id: values[4],
        detail: values[5],
        webhook_delivery: values[6],
        created_at: values[7]
      });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected Postgres query in projects route test: ${normalizedSql}`);
  }
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
      expect(createResponse.headers.get("x-sena-observed-route")).toBe("sena-projects");
      expect(createResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");

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
      expect(updateResponse.headers.get("x-sena-observed-route")).toBe("sena-projects");

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
      expect(restoreResponse.headers.get("x-sena-observed-route")).toBe("sena-projects");

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
      expect(deleteResponse.headers.get("x-sena-observed-route")).toBe("sena-projects");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, projectsRouteTestTimeoutMs);

  it("uses Postgres primary state for project CRUD when SENA_ENTERPRISE_STATE_STORE=postgres", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-projects-postgres-route-"));
    const pg = new ProjectRouteMemoryPostgres();
    const poolOptions: unknown[] = [];
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        constructor(options: unknown) {
          poolOptions.push(options);
        }

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
    vi.doMock("@/lib/sena/project-handoff", async () => await import("../project-handoff"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Postgres Project Owner",
        email: "postgres-project-owner@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Project Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      const csrf = enterprise.createEnterpriseCsrfToken(registered.context);
      const projectsRoute = await import("../../../app/api/sena/projects/route");
      const createSnapshot = projectRouteSnapshot("Postgres Route Project");

      const createResponse = await projectsRoute.POST(new Request("https://sena.example.test/api/sena/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sena-csrf-token": csrf.token
        },
        body: JSON.stringify({
          teamId: registered.context.teams[0].id,
          title: "Postgres Route Project",
          snapshot: createSnapshot
        })
      }));
      const createBody = await createResponse.json() as {
        project?: { id?: string; currentVersion?: number };
      };

      expect(createResponse.status).toBe(201);
      expect(createBody.project?.currentVersion).toBe(1);
      expect(poolOptions[0]).toEqual(expect.objectContaining({
        connectionString: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
      }));
      expect(pg.queries.some((query) => /CREATE TABLE IF NOT EXISTS "public"\."sena_enterprise_state"/.test(query))).toBe(true);
      expect(pg.state?.payload.projects.map((project) => project.id)).toContain(createBody.project?.id);
      expect(pg.state?.payload.auditLog.map((entry) => entry.event)).toEqual(expect.arrayContaining([
        "project.create"
      ]));
      expect(pg.auditRows.map((entry) => entry.event)).toEqual(expect.arrayContaining([
        "analysis.run"
      ]));

      const listResponse = await projectsRoute.GET(new Request("https://sena.example.test/api/sena/projects"));
      const listBody = await listResponse.json() as {
        projects?: Array<{ id?: string }>;
      };
      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("x-sena-observed-route")).toBe("sena-projects");
      expect(listResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(listBody.projects?.map((project) => project.id)).toContain(createBody.project?.id);

      const fileBackedProjects = enterprise.readEnterpriseDb().projects;
      expect(fileBackedProjects.map((project: { id: string }) => project.id)).not.toContain(createBody.project?.id);
      expect(JSON.stringify({ createBody, listBody, postgresState: pg.state })).not.toContain("super-secret");
      expect(JSON.stringify({ createBody, listBody, postgresState: pg.state })).not.toContain("example.neon.tech");
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }, projectsRouteTestTimeoutMs);
});
