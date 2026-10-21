import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  reliabilityDashboardToReview
} from "../index";
import type { SenaEnterpriseBackupArtifact } from "../enterprise/ops-backup";
import type { SenaEnterpriseDb } from "../enterprise/state";
import type { SenaProjectSnapshot } from "../types";

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

let projectSnapshotCache: SenaProjectSnapshot | undefined;

function projectSnapshot() {
  if (projectSnapshotCache) return structuredClone(projectSnapshotCache);
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  const reliability = buildSenaReliabilityDashboard([
    { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true }
  ]);
  projectSnapshotCache = buildSenaProjectSnapshot(model, {
    title: "Scope restore snapshot",
    generatedAt: stamp,
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Scope test",
      interpretation: "Scope test interpretation.",
      limitations: "Fixture only.",
      nextActions: "Continue validation."
    },
    codingReliability: reliabilityDashboardToReview(reliability, "Scope test"),
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic fixture only.",
      retentionPolicy: "Delete generated fixture state after the test run.",
      usageConstraints: ["Do not use as real participant evidence."],
      dataSteward: "Scope test"
    }
  });
  return structuredClone(projectSnapshotCache);
}

function expectRestoreRejected(
  enterprise: typeof import("../enterprise"),
  context: ReturnType<typeof import("../enterprise").registerEnterpriseUser>["context"],
  backup: SenaEnterpriseBackupArtifact,
  dbPath: string
) {
  syncBackupIntegrity(backup);
  const before = readFileSync(dbPath, "utf8");
  let caught: unknown;
  try {
    enterprise.restoreEnterpriseBackup(context, backup, { mode: "merge" });
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    status: 400,
    code: "backup_restore_record_outside_scope"
  });
  expect(readFileSync(dbPath, "utf8")).toBe(before);
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

  it("rejects a restore that reuses another team's membership id", async () => {
    await withIsolatedEnterprise("sena-backup-restore-member-id-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const outsiderTeamId = outsider.context.teams[0].id;
      const outsideMembership = readDb(dbPath).memberships.find((membership) => membership.teamId === outsiderTeamId);
      if (!outsideMembership) throw new Error("Expected the other team's membership.");
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.memberships.push({
        ...outsideMembership,
        teamId,
        userId: owner.context.user.id,
        role: "owner"
      });

      expectRestoreRejected(enterprise, owner.context, backup, dbPath);
      const stored = readDb(dbPath).memberships.find((membership) => membership.id === outsideMembership.id);
      expect(stored?.teamId).toBe(outsiderTeamId);
      expect(stored?.userId).toBe(outsider.context.user.id);
    });
  });

  it("rejects a restore that reuses another team's project id", async () => {
    await withIsolatedEnterprise("sena-backup-restore-project-id-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const outsiderTeamId = outsider.context.teams[0].id;
      const project = enterprise.createEnterpriseProject(outsider.context, {
        teamId: outsiderTeamId,
        title: "Outside project",
        snapshot: projectSnapshot()
      });
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.projects.push({
        ...project,
        teamId,
        title: "Claimed project"
      });

      expectRestoreRejected(enterprise, owner.context, backup, dbPath);
      expect(readDb(dbPath).projects.find((candidate) => candidate.id === project.id)?.teamId).toBe(outsiderTeamId);
    });
  });

  it("rejects a restore whose projectId points outside the authorized teams", async () => {
    await withIsolatedEnterprise("sena-backup-restore-project-ref-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const outsiderTeamId = outsider.context.teams[0].id;
      const project = enterprise.createEnterpriseProject(outsider.context, {
        teamId: outsiderTeamId,
        title: "Referenced outside project",
        snapshot: projectSnapshot()
      });
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.projectRevisions.push({
        id: "rev_outside_project",
        projectId: project.id,
        teamId,
        userId: owner.context.user.id,
        version: 1,
        summary: "Points outside",
        title: project.title,
        description: project.description,
        snapshot: project.snapshot,
        datasetCounts: project.datasetCounts,
        activeWindowLabel: project.activeWindowLabel,
        claimUse: project.claimUse,
        createdAt: stamp
      });

      expectRestoreRejected(enterprise, owner.context, backup, dbPath);
      expect(readDb(dbPath).projectRevisions.some((revision) => revision.id === "rev_outside_project")).toBe(false);
    });
  });

  it("restores audit and notification history that cites a deleted project", async () => {
    await withIsolatedEnterprise("sena-backup-restore-deleted-project-", async ({ enterprise, dbPath }) => {
      const owner = enterprise.registerEnterpriseUser({
        name: "Deleted Project Owner",
        email: "deleted-project-owner@example.edu",
        password: "sena-secure-123",
        organization: "Deleted Project Lab",
        plan: "enterprise"
      });
      const teamId = owner.context.teams[0].id;
      const project = enterprise.createEnterpriseProject(owner.context, {
        teamId,
        title: "Deleted before backup",
        snapshot: projectSnapshot()
      });
      enterprise.deleteEnterpriseProject(owner.context, project.id);
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      expect(backup.payload.projects.some((saved) => saved.id === project.id)).toBe(false);
      expect(backup.payload.auditLog.some((entry) => entry.event === "project.delete" && entry.projectId === project.id)).toBe(true);
      backup.payload.notifications.push({
        id: "note_deleted_project",
        kind: "team.invite",
        status: "delivered",
        channel: "in-app",
        teamId,
        userId: owner.context.user.id,
        projectId: project.id,
        title: "Deleted project",
        body: "Historical notice",
        createdAt: stamp,
        detail: {}
      });
      syncBackupIntegrity(backup);

      const restore = enterprise.restoreEnterpriseBackup(owner.context, backup, { mode: "merge" });
      const restored = readDb(dbPath);

      expect(restore.status).toBe("completed");
      expect(restored.projects.some((saved) => saved.id === project.id)).toBe(false);
      expect(restored.auditLog.some((entry) => entry.event === "project.delete" && entry.projectId === project.id)).toBe(true);
      expect(restored.notifications.some((notification) => notification.id === "note_deleted_project" && notification.projectId === project.id)).toBe(true);
    });
  });

  it("rejects an audit event whose projectId points at another team's project", async () => {
    await withIsolatedEnterprise("sena-backup-restore-audit-project-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const project = enterprise.createEnterpriseProject(outsider.context, {
        teamId: outsider.context.teams[0].id,
        title: "Outside audit project",
        snapshot: projectSnapshot()
      });
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      backup.payload.auditLog.push({
        id: "audit_outside_project",
        event: "project.delete",
        teamId,
        userId: owner.context.user.id,
        projectId: project.id,
        createdAt: stamp,
        detail: { title: "outside project" }
      });

      expectRestoreRejected(enterprise, owner.context, backup, dbPath);
      expect(readDb(dbPath).auditLog.some((entry) => entry.id === "audit_outside_project")).toBe(false);
      expect(readDb(dbPath).projects.find((candidate) => candidate.id === project.id)?.teamId).toBe(outsider.context.teams[0].id);
    });
  });

  it("rejects a membership whose userId is outside the authorized teams", async () => {
    await withIsolatedEnterprise("sena-backup-restore-member-user-", async ({ enterprise, dbPath }) => {
      const { owner, outsider } = registerPair(enterprise);
      const teamId = owner.context.teams[0].id;
      const backup = enterprise.createEnterpriseBackup(owner.context, { teamId });
      const ownMembership = backup.payload.memberships.find((membership) => membership.userId === owner.context.user.id);
      if (!ownMembership) throw new Error("Expected the caller's membership.");
      ownMembership.userId = outsider.context.user.id;

      expectRestoreRejected(enterprise, owner.context, backup, dbPath);
      const stored = readDb(dbPath).memberships.find((membership) => membership.id === ownMembership.id);
      expect(stored?.userId).toBe(owner.context.user.id);
      expect(stored?.teamId).toBe(teamId);
    });
  });
});
