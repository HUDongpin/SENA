import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  importSenaJsonContract,
  lessonStudySenaContract
} from "../index";
import {
  createEnterprisePostgresProjectCommentAdapter,
  createEnterprisePostgresProjectPresenceAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import {
  readEnterpriseDb,
  saveDb,
  type SenaEnterpriseDb
} from "../enterprise/state";
import type { SenaEnterpriseSessionContext } from "../enterprise/auth-session";
import type {
  SenaEnterpriseProjectComment,
  SenaEnterpriseProjectPresence
} from "../enterprise/team-collaboration";

function projectSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  return buildSenaProjectSnapshot(buildSenaModel(imported.dataset), {
    title: "Collaboration tenant integrity fixture",
    generatedAt: "2026-08-25T00:00:00.000Z",
    sourceDataset: imported.dataset
  });
}

function storedQuery(row: Record<string, unknown>) {
  return (async (sql: string) => ({
    rows: sql.includes("SELECT *") ? [row] : []
  })) as SenaEnterprisePostgresQuery;
}

function commentRow(payload: SenaEnterpriseProjectComment): Record<string, unknown> {
  return {
    id: payload.id,
    project_id: payload.projectId,
    team_id: payload.teamId,
    user_id: payload.userId,
    target_kind: payload.target.kind,
    target_id: payload.target.id ?? null,
    target_label: payload.target.label ?? null,
    status: payload.status,
    payload,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt
  };
}

function presenceRow(payload: SenaEnterpriseProjectPresence): Record<string, unknown> {
  return {
    id: payload.id,
    project_id: payload.projectId,
    team_id: payload.teamId,
    user_id: payload.userId,
    active_view: payload.activeView,
    cursor_label: payload.cursorLabel,
    payload,
    updated_at: payload.updatedAt,
    expires_at: payload.expiresAt
  };
}

async function expectStoredIntegrity(operation: Promise<unknown>, path: string) {
  await expect(operation).rejects.toMatchObject({
    name: "SenaEnterpriseStoredIntegrityError",
    issues: expect.arrayContaining([expect.objectContaining({ path })])
  });
}

describe("project collaboration tenant integrity", () => {
  const previousDbDir = process.env.SENA_ENTERPRISE_DB_DIR;
  const dbDir = mkdtempSync(path.join(tmpdir(), "sena-collaboration-tenant-"));
  let context: SenaEnterpriseSessionContext;
  let projectId = "";
  let baseDb: SenaEnterpriseDb;

  beforeAll(async () => {
    process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
    const enterprise = await import("../enterprise");
    const registered = enterprise.registerEnterpriseUser({
      name: "Collaboration Integrity Owner",
      email: "collaboration-integrity@example.edu",
      password: "sena-secure-123",
      organization: "Collaboration Integrity Lab",
      plan: "lab"
    });
    context = registered.context;
    const project = enterprise.createEnterpriseProject(context, {
      teamId: context.teams[0].id,
      title: "Collaboration tenant project",
      snapshot: projectSnapshot()
    });
    projectId = project.id;
    enterprise.createEnterpriseProjectComment(context, projectId, {
      body: "Current-team comment"
    });
    enterprise.touchEnterpriseProjectPresence(context, projectId, {
      activeView: "fusion-canvas",
      cursorLabel: "Current-team cursor"
    });
    baseDb = readEnterpriseDb();
  });

  beforeEach(() => {
    const tracked = readEnterpriseDb();
    Object.assign(tracked, structuredClone(baseDb));
    saveDb(tracked);
  });

  afterAll(() => {
    if (previousDbDir === undefined) delete process.env.SENA_ENTERPRISE_DB_DIR;
    else process.env.SENA_ENTERPRISE_DB_DIR = previousDbDir;
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("fails closed before exposing a foreign-team file-backed comment", async () => {
    const enterprise = await import("../enterprise");
    const db = readEnterpriseDb();
    db.projectComments[0].teamId = "team-foreign-comment";
    db.projectComments[0].body = "foreign tenant secret comment";
    saveDb(db);

    expect(() => enterprise.listEnterpriseProjectCollaboration(context, projectId)).toThrow(expect.objectContaining({
      status: 409,
      code: "project_collaboration_comment_integrity_invalid"
    }));
  });

  it("fails closed before exposing foreign-team file-backed presence", async () => {
    const enterprise = await import("../enterprise");
    const db = readEnterpriseDb();
    db.projectPresence[0].teamId = "team-foreign-presence";
    db.projectPresence[0].activeView = "foreign-private-view";
    db.projectPresence[0].cursorLabel = "foreign private cursor";
    saveDb(db);

    expect(() => enterprise.listEnterpriseProjectCollaboration(context, projectId)).toThrow(expect.objectContaining({
      status: 409,
      code: "project_collaboration_presence_integrity_invalid"
    }));
  });

  it("does not overwrite or return foreign-team presence during a presence mutation", async () => {
    const enterprise = await import("../enterprise");
    const db = readEnterpriseDb();
    const presenceId = db.projectPresence[0].id;
    db.projectPresence[0].teamId = "team-foreign-presence";
    db.projectPresence[0].activeView = "foreign-private-view";
    saveDb(db);

    expect(() => enterprise.touchEnterpriseProjectPresence(context, projectId, {
      activeView: "current-team-attempt"
    })).toThrow(expect.objectContaining({
      status: 409,
      code: "project_presence_integrity_invalid"
    }));
    const unchanged = readEnterpriseDb().projectPresence.find((entry) => entry.id === presenceId);
    expect(unchanged).toMatchObject({
      teamId: "team-foreign-presence",
      activeView: "foreign-private-view"
    });
  });

  it("does not resolve or mirror a foreign-team comment", async () => {
    const enterprise = await import("../enterprise");
    const db = readEnterpriseDb();
    const commentId = db.projectComments[0].id;
    db.projectComments[0].teamId = "team-foreign-comment";
    saveDb(db);

    expect(() => enterprise.resolveEnterpriseProjectComment(context, projectId, commentId))
      .toThrow(expect.objectContaining({
        status: 409,
        code: "project_comment_integrity_invalid"
      }));
    expect(readEnterpriseDb().projectComments.find((entry) => entry.id === commentId)?.status).toBe("open");
  });

  it("rejects a foreign-team comment payload returned under current SQL scope", async () => {
    const payload = structuredClone(baseDb.projectComments[0]);
    payload.teamId = "team-foreign-comment";
    const row = commentRow(payload);
    row.team_id = baseDb.projects[0].teamId;
    const adapter = createEnterprisePostgresProjectCommentAdapter({ query: storedQuery(row) });

    await expectStoredIntegrity(adapter.listProjectComments({
      projectId,
      teamId: baseDb.projects[0].teamId
    }), "row.team_id");
  });

  it("rejects foreign-team presence returned under current SQL scope", async () => {
    const payload = structuredClone(baseDb.projectPresence[0]);
    payload.teamId = "team-foreign-presence";
    const row = presenceRow(payload);
    row.team_id = baseDb.projects[0].teamId;
    const adapter = createEnterprisePostgresProjectPresenceAdapter({ query: storedQuery(row) });

    await expectStoredIntegrity(adapter.listProjectPresence({
      projectId,
      teamId: baseDb.projects[0].teamId,
      activeOnly: true
    }), "row.team_id");
  });
});
