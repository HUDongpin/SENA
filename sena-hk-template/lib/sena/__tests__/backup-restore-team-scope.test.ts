import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseBackupArtifact } from "../enterprise/ops-backup";
import type { SenaEnterpriseDb } from "../enterprise/state";

const stamp = "2026-01-01T00:00:00.000Z";

function syncBackupIntegrity(backup: SenaEnterpriseBackupArtifact) {
  const payload = backup.payload;
  backup.manifest.payloadSha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  backup.manifest.recordCounts = {
    users: payload.users.length,
    teams: payload.teams.length,
    memberships: payload.memberships.length,
    invitations: payload.invitations.length,
    uploads: payload.uploads.length,
    importRuns: payload.importRuns.length,
    analysisRuns: (payload.analysisRuns ?? []).length,
    projects: payload.projects.length,
    projectRevisions: payload.projectRevisions.length,
    comments: payload.projectComments.length,
    adjudications: payload.adjudications.length,
    reliabilityRuns: payload.reliabilityRuns.length,
    validationRuns: payload.validationRuns.length,
    expertReviews: (payload.expertReviews ?? []).length,
    platformDecisionAcceptances: (payload.platformDecisionAcceptances ?? []).length,
    releaseGateReviews: (payload.releaseGateReviews ?? []).length,
    postCutoverObservations: (payload.postCutoverObservations ?? []).length,
    goLiveAttestations: (payload.goLiveAttestations ?? []).length,
    notifications: payload.notifications.length,
    auditEvents: payload.auditLog.length
  };
}

function readDb(dbPath: string) {
  return JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
}

async function withIsolatedEnterprise<T>(prefix: string, run: (args: {
  enterprise: typeof import("../enterprise");
  dbPath: string;
}) => Promise<T>) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
  const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  delete process.env.SENA_ENTERPRISE_STATE_STORE;
  delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
  delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
  try {
    const enterprise = await import("../enterprise");
    return await run({ enterprise, dbPath });
  } finally {
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    vi.resetModules();
    rmSync(enterpriseDbDir, { recursive: true, force: true });
  }
}

function registerPair(enterprise: typeof import("../enterprise")) {
  const owner = enterprise.registerEnterpriseUser({
    name: "Scope Owner",
    email: "scope-owner@example.edu",
    password: "sena-secure-123",
    organization: "Scope Lab",
    plan: "enterprise"
  });
  const outsider = enterprise.registerEnterpriseUser({
    name: "Scope Outsider",
    email: "scope-outsider@example.edu",
    password: "sena-secure-123",
    organization: "Other Lab",
    plan: "enterprise"
  });
  return { owner, outsider };
}

describe("SENA backup restore team scope", () => {
  it("rejects the whole restore when a membership is outside the authorized teams", async () => {
    await withIsolatedEnterprise("sena-backup-restore-scope-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const outsiderTeamId = outsider.context.teams[0].id;
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.memberships.push({
        id: "member_outside_scope",
        teamId: outsiderTeamId,
        userId: outsider.context.user.id,
        role: "owner",
        status: "active",
        createdAt: stamp,
        updatedAt: stamp
      });
      syncBackupIntegrity(backup);
      const before = readFileSync(dbPath, "utf8");

      for (const dryRun of [true, false]) {
        let caught: unknown;
        try {
          enterprise.restoreEnterpriseBackup(owner.context, backup, { mode: "merge", dryRun });
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(Error);
        expect(caught).toMatchObject({
          status: 400,
          code: "backup_restore_record_outside_scope"
        });
        expect(readFileSync(dbPath, "utf8")).toBe(before);
      }
      expect(readDb(dbPath).memberships.some((membership) => membership.id === "member_outside_scope")).toBe(false);
      expect(readDb(dbPath).memberships.some((membership) => membership.teamId === outsiderTeamId && membership.userId === owner.context.user.id)).toBe(false);
    });
  });

  it("rejects the whole restore when an audit event is outside the authorized teams", async () => {
    await withIsolatedEnterprise("sena-backup-restore-audit-scope-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.auditLog.push({
        id: "audit_outside_scope",
        event: "project.read",
        teamId: outsider.context.teams[0].id,
        createdAt: stamp,
        detail: { title: "outside" }
      });
      syncBackupIntegrity(backup);
      const before = readFileSync(dbPath, "utf8");

      let caught: unknown;
      try {
        enterprise.restoreEnterpriseBackup(owner.context, backup, { mode: "merge" });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        status: 400,
        code: "backup_restore_record_outside_scope"
      });
      expect(readFileSync(dbPath, "utf8")).toBe(before);
      expect(readDb(dbPath).auditLog.some((entry) => entry.id === "audit_outside_scope")).toBe(false);
    });
  });

  it("rejects the whole restore when a notification is outside the authorized teams", async () => {
    await withIsolatedEnterprise("sena-backup-restore-notification-scope-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.notifications.push({
        id: "note_outside_scope",
        kind: "team.invite",
        status: "delivered",
        channel: "in-app",
        teamId: outsider.context.teams[0].id,
        title: "Outside",
        body: "Outside",
        createdAt: stamp,
        detail: {}
      });
      syncBackupIntegrity(backup);
      const before = readFileSync(dbPath, "utf8");

      let caught: unknown;
      try {
        enterprise.restoreEnterpriseBackup(owner.context, backup, { mode: "merge" });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        status: 400,
        code: "backup_restore_record_outside_scope"
      });
      expect(readFileSync(dbPath, "utf8")).toBe(before);
      expect(readDb(dbPath).notifications.some((notification) => notification.id === "note_outside_scope")).toBe(false);
    });
  });

  it("rejects user records supplied to backup restore", async () => {
    await withIsolatedEnterprise("sena-backup-restore-users-", async ({ enterprise, dbPath }) => {
      const owner = enterprise.registerEnterpriseUser({
        name: "User Restore Owner",
        email: "user-restore-owner@example.edu",
        password: "sena-secure-123",
        organization: "User Restore Lab",
        plan: "enterprise"
      });
      const teamId = owner.context.teams[0].id;
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      const beforeUsers = readDb(dbPath).users;
      backup.payload.users[0] = {
        ...backup.payload.users[0],
        email: "pwned@example.edu",
        name: "Overwritten Owner"
      };
      backup.payload.users.push({
        id: "user_restore_attacker",
        email: "restore-attacker@example.edu",
        name: "Restore Attacker",
        organization: "Outside",
        ssoIdentities: [{ provider: "institution", subject: "attacker-subject", linkedAt: stamp }],
        createdAt: stamp,
        updatedAt: stamp
      });
      syncBackupIntegrity(backup);

      const restore = enterprise.restoreEnterpriseBackup(owner.context, backup, { mode: "merge" });
      const afterUsers = readDb(dbPath).users;

      expect(restore.status).toBe("completed");
      expect(restore.summary.usersCreated).toBe(0);
      expect(restore.summary.usersUpdated).toBe(0);
      expect(afterUsers).toEqual(beforeUsers);
      expect(afterUsers.some((user) => user.id === "user_restore_attacker")).toBe(false);
      expect(afterUsers.some((user) => user.email === "pwned@example.edu")).toBe(false);
    });
  });

  it("restores records inside the authorized team scope", async () => {
    await withIsolatedEnterprise("sena-backup-restore-inscope-", async ({ enterprise, dbPath }) => {
      const owner = enterprise.registerEnterpriseUser({
        name: "In Scope Owner",
        email: "in-scope-owner@example.edu",
        password: "sena-secure-123",
        organization: "In Scope Lab",
        plan: "enterprise"
      });
      const teamId = owner.context.teams[0].id;
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.auditLog.push({
        id: "audit_without_team",
        event: "auth.login",
        createdAt: stamp,
        detail: { method: "password" }
      });
      syncBackupIntegrity(backup);
      const originalName = backup.payload.teams.find((team) => team.id === teamId)?.name;
      const persisted = readDb(dbPath);
      const team = persisted.teams.find((candidate) => candidate.id === teamId);
      if (!team || !originalName) throw new Error("Expected the authorized team in the backup.");
      team.name = "Drifted team name";
      writeFileSync(dbPath, JSON.stringify(persisted));

      const restore = enterprise.restoreEnterpriseBackup(owner.context, backup, { mode: "merge" });
      const restored = readDb(dbPath).teams.find((candidate) => candidate.id === teamId);

      expect(restore.status).toBe("completed");
      expect(restore.summary.teamsUpdated).toBeGreaterThan(0);
      expect(restored?.name).toBe(originalName);
      expect(readDb(dbPath).auditLog.some((entry) => entry.id === "audit_without_team")).toBe(true);
    });
  });
});
