import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type PersistedTeam = {
  id: string;
  name: string;
  organization: string;
  defaultRole?: string;
  archived?: {
    archivedAt: string;
    archivedBy: string;
    source: string;
    suspendedMembershipIds: string[];
  };
  provisioning?: { source: string; externalId?: string };
};

type PersistedDb = {
  users: Array<{ id: string; email: string }>;
  teams: PersistedTeam[];
  memberships: Array<{ id: string; teamId: string; userId: string; role: string; status: string }>;
  auditLog: Array<{ id: string; event: string; teamId?: string }>;
};

const organization = "SCIM Provisioned Lab";
const cohortTeam = {
  externalId: "retiring-cohort",
  name: "Retiring Cohort",
  organization,
  plan: "enterprise" as const
};

const scratchDirs: string[] = [];

afterEach(() => {
  while (scratchDirs.length > 0) {
    rmSync(scratchDirs.pop()!, { recursive: true, force: true });
  }
});

/**
 * Each case gets its own enterprise database directory and its own module
 * registry: the file state store is memoised per module instance and captures
 * SENA_ENTERPRISE_DB_DIR at construction.
 */
async function loadHarness() {
  const dbDir = mkdtempSync(path.join(tmpdir(), "sena-team-archival-"));
  scratchDirs.push(dbDir);
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
  delete process.env.SENA_ENTERPRISE_STATE_STORE;
  delete process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH;
  delete process.env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED;
  delete process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED;

  const provisioning = await import("../enterprise/provisioning");
  const enterprise = await import("../enterprise");

  const readDb = () => JSON.parse(readFileSync(path.join(dbDir, "enterprise-db.json"), "utf8")) as PersistedDb;

  /** The group as an IdP first provisions it: one PI, who is the team's only manager. */
  const provisionCohort = async (team: Partial<typeof cohortTeam> & { defaultRole?: string } = {}) => {
    const result = await provisioning.provisionEnterpriseOrganizationAsync({
      source: "scim",
      organization,
      teams: [{ ...cohortTeam, ...team } as never],
      users: [{
        externalId: "cohort-pi-001",
        email: "cohort-pi@example.edu",
        name: "Cohort PI",
        sso: { provider: "institution", subject: "cohort-pi-001" },
        memberships: [{ teamExternalId: cohortTeam.externalId, role: "pi" }]
      }]
    });
    return result.teams[0].id;
  };

  /**
   * A member the archiving source's own payload never carries: only team-level
   * archival can retire this access.
   */
  const provisionLocalCoder = async (teamId: string) => {
    await provisioning.provisionEnterpriseOrganizationAsync({
      source: "api",
      organization,
      users: [{
        externalId: "local-coder",
        email: "local-coder@example.edu",
        sso: { provider: "institution", subject: "local-coder" },
        memberships: [{ teamId, role: "coder" }]
      }]
    });
  };

  const archiveCohort = async () => await provisioning.provisionEnterpriseOrganizationAsync({
    source: "scim",
    organization,
    teams: [{ ...cohortTeam, archived: true } as never]
  });

  const restoreCohort = async () => await provisioning.provisionEnterpriseOrganizationAsync({
    source: "scim",
    organization,
    teams: [{ ...cohortTeam, archived: false } as never]
  });

  const membershipFor = (db: PersistedDb, teamId: string, email: string) => {
    const user = db.users.find((candidate) => candidate.email === email);
    return db.memberships.find((membership) => membership.teamId === teamId && membership.userId === user?.id);
  };

  return {
    provisioning,
    enterprise,
    readDb,
    provisionCohort,
    provisionLocalCoder,
    archiveCohort,
    restoreCohort,
    membershipFor
  };
}

describe("provisioned team default role", () => {
  it("persists the configured default on the team record and republishes it in the directory", async () => {
    const { provisioning, readDb, provisionCohort } = await loadHarness();
    const teamId = await provisionCohort({ defaultRole: "coder" });

    expect(readDb().teams.find((team) => team.id === teamId)?.defaultRole).toBe("coder");
    const directory = await provisioning.listEnterpriseProvisioningDirectoryAsync("scim");
    expect(directory.teams.find((team) => team.id === teamId)?.defaultRole).toBe("coder");
  });

  it("keeps the stored default when a later request does not carry one", async () => {
    const { provisioning, readDb, provisionCohort } = await loadHarness();
    const teamId = await provisionCohort({ defaultRole: "coder" });

    // This is the recovery case: a membership-only sync speaks about the team
    // without repeating whatever configured its default.
    await provisioning.provisionEnterpriseOrganizationAsync({
      source: "scim",
      organization,
      teams: [cohortTeam]
    });

    expect(readDb().teams.find((team) => team.id === teamId)?.defaultRole).toBe("coder");
  });

  it("replaces the stored default when a later request carries a new one", async () => {
    const { readDb, provisionCohort } = await loadHarness();
    const teamId = await provisionCohort({ defaultRole: "coder" });
    await provisionCohort({ defaultRole: "reviewer" });

    expect(readDb().teams.find((team) => team.id === teamId)?.defaultRole).toBe("reviewer");
  });

  it("leaves a team provisioned without a default exactly as it was", async () => {
    const { provisioning, readDb, provisionCohort } = await loadHarness();
    const teamId = await provisionCohort();

    expect(readDb().teams.find((team) => team.id === teamId)?.defaultRole).toBeUndefined();
    const directory = await provisioning.listEnterpriseProvisioningDirectoryAsync("scim");
    expect(directory.teams.find((team) => team.id === teamId)?.defaultRole).toBeUndefined();
  });

  it("refuses a default role that is not a SENA role", async () => {
    const { provisioning } = await loadHarness();
    await expect(provisioning.provisionEnterpriseOrganizationAsync({
      source: "scim",
      organization,
      teams: [{ ...cohortTeam, defaultRole: "superuser" } as never]
    })).rejects.toMatchObject({ code: "invalid_provisioning_team_default_role" });
  });

  it("never lets the stored default override a role the request names", async () => {
    const { readDb, provisionCohort, membershipFor } = await loadHarness();
    const teamId = await provisionCohort({ defaultRole: "coder" });

    expect(membershipFor(readDb(), teamId, "cohort-pi@example.edu")?.role).toBe("pi");
  });
});

describe("provisioned team archival", () => {
  it("retires the team without erasing it, suspending every membership it still granted", async () => {
    const { readDb, provisionCohort, provisionLocalCoder, archiveCohort } = await loadHarness();
    const teamId = await provisionCohort();
    await provisionLocalCoder(teamId);
    const auditIdsBefore = readDb().auditLog.map((entry) => entry.id);
    expect(auditIdsBefore.length).toBeGreaterThan(0);

    // The group's PI is the team's only active manager, so before archival
    // existed this request could only be refused with last_team_manager_required.
    const result = await archiveCohort();
    expect(result.teams[0].archival).toBe("archived");

    const db = readDb();
    const team = db.teams.find((candidate) => candidate.id === teamId);
    expect(team).toBeDefined();
    expect(team?.archived?.archivedAt).toEqual(expect.any(String));
    expect(team?.archived?.archivedBy).toBe("scim:retiring-cohort");
    expect(team?.archived?.source).toBe("scim");
    expect(team?.archived?.suspendedMembershipIds).toHaveLength(2);

    const teamMemberships = db.memberships.filter((membership) => membership.teamId === teamId);
    expect(teamMemberships).toHaveLength(2);
    expect(teamMemberships.every((membership) => membership.status === "suspended")).toBe(true);

    const auditIdsAfter = new Set(db.auditLog.map((entry) => entry.id));
    for (const auditId of auditIdsBefore) expect(auditIdsAfter.has(auditId)).toBe(true);
  });

  it("drops an archived team and its memberships out of the provisioning directory", async () => {
    const { provisioning, provisionCohort, archiveCohort } = await loadHarness();
    const teamId = await provisionCohort();
    await archiveCohort();

    const directory = await provisioning.listEnterpriseProvisioningDirectoryAsync("scim");
    expect(directory.teams.some((team) => team.id === teamId)).toBe(false);
    expect(directory.users.find((user) => user.email === "cohort-pi@example.edu")?.memberships).toEqual([]);
  });

  it("drops an archived team out of the session context and out of RBAC", async () => {
    const { enterprise, provisionCohort, provisionLocalCoder, archiveCohort } = await loadHarness();
    const teamId = await provisionCohort();
    await provisionLocalCoder(teamId);
    await archiveCohort();

    const login = enterprise.ssoEnterpriseUser({
      provider: "institution",
      email: "local-coder@example.edu",
      subject: "local-coder"
    });
    expect(login.context.teams.some((team) => team.id === teamId)).toBe(false);
    expect(login.context.memberships.some((membership) => membership.teamId === teamId)).toBe(false);
    expect(enterprise.hasEnterprisePermission(login.context, teamId, "project:read")).toBe(false);
  });

  it("refuses to grant active membership on an archived team", async () => {
    const { provisioning, provisionCohort, archiveCohort } = await loadHarness();
    const teamId = await provisionCohort();
    await archiveCohort();

    await expect(provisioning.provisionEnterpriseOrganizationAsync({
      source: "api",
      organization,
      users: [{
        externalId: "late-joiner",
        email: "late-joiner@example.edu",
        memberships: [{ teamId, role: "coder" }]
      }]
    })).rejects.toMatchObject({ code: "provisioning_team_archived" });
  });

  it("keeps the archival record stable when the same team is archived twice", async () => {
    const { readDb, provisionCohort, archiveCohort } = await loadHarness();
    const teamId = await provisionCohort();
    await archiveCohort();
    const first = readDb().teams.find((team) => team.id === teamId)?.archived;

    const second = await archiveCohort();
    expect(second.teams[0].archival).toBeUndefined();
    expect(readDb().teams.find((team) => team.id === teamId)?.archived).toEqual(first);
  });

  it("restores exactly the access the archival suspended", async () => {
    const { provisioning, readDb, provisionCohort, provisionLocalCoder, archiveCohort, restoreCohort, membershipFor } = await loadHarness();
    const teamId = await provisionCohort();
    await provisionLocalCoder(teamId);
    // Suspended by the IdP before the team was ever retired: restoring the team
    // must not hand this membership back.
    await provisioning.provisionEnterpriseOrganizationAsync({
      source: "scim",
      organization,
      users: [{
        externalId: "cohort-viewer-001",
        email: "cohort-viewer@example.edu",
        memberships: [{ teamExternalId: cohortTeam.externalId, role: "viewer", status: "suspended" }]
      }]
    });

    await archiveCohort();
    const restored = await restoreCohort();
    expect(restored.teams[0].archival).toBe("restored");

    const db = readDb();
    expect(db.teams.find((team) => team.id === teamId)?.archived).toBeUndefined();
    expect(membershipFor(db, teamId, "cohort-pi@example.edu")?.status).toBe("active");
    expect(membershipFor(db, teamId, "local-coder@example.edu")?.status).toBe("active");
    expect(membershipFor(db, teamId, "cohort-viewer@example.edu")?.status).toBe("suspended");

    const directory = await provisioning.listEnterpriseProvisioningDirectoryAsync("scim");
    expect(directory.teams.some((team) => team.id === teamId)).toBe(true);
  });

  it("returns a restored team to the session context and to RBAC", async () => {
    const { enterprise, provisionCohort, provisionLocalCoder, archiveCohort, restoreCohort } = await loadHarness();
    const teamId = await provisionCohort();
    await provisionLocalCoder(teamId);
    await archiveCohort();
    await restoreCohort();

    const login = enterprise.ssoEnterpriseUser({
      provider: "institution",
      email: "local-coder@example.edu",
      subject: "local-coder"
    });
    expect(login.context.teams.some((team) => team.id === teamId)).toBe(true);
    expect(enterprise.hasEnterprisePermission(login.context, teamId, "project:read")).toBe(true);
  });
});
