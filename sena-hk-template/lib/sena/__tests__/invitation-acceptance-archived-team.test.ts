import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Team archival suspends every membership the team still granted, and every
 * context-driven reader decides "is this team mine" through an *active*
 * membership. An invitation issued before the archival is therefore the one
 * writer that can still mint a fresh active membership into a retired team —
 * which would hand its holder full RBAC on a team that is hidden from every
 * listing, i.e. revive it. These cases pin that every invitation-acceptance
 * entry point refuses, and that the refusal is the same 410 a genuinely missing
 * team produces.
 */

type PersistedDb = {
  users: Array<{ id: string; email: string }>;
  teams: Array<{
    id: string;
    name: string;
    organization: string;
    archived?: { archivedAt: string; archivedBy: string; source: string; suspendedMembershipIds: string[] };
  }>;
  memberships: Array<{ id: string; teamId: string; userId: string; role: string; status: string }>;
  invitations: Array<{ id: string; teamId: string; email: string; inviteCode: string; status: string }>;
};

const organization = "Archived Cohort Lab";
const scratchDirs: string[] = [];

afterEach(() => {
  while (scratchDirs.length > 0) {
    rmSync(scratchDirs.pop()!, { recursive: true, force: true });
  }
});

/**
 * Each case gets its own database directory and module registry: the file state
 * store is memoised per module instance and captures SENA_ENTERPRISE_DB_DIR at
 * construction.
 */
async function loadHarness() {
  const dbDir = mkdtempSync(path.join(tmpdir(), "sena-invite-archived-"));
  scratchDirs.push(dbDir);
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = dbDir;
  delete process.env.SENA_ENTERPRISE_STATE_STORE;
  delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
  delete process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH;
  delete process.env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED;
  delete process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED;

  const enterprise = await import("../enterprise");
  const provisioning = await import("../enterprise/provisioning");

  const readDb = () => JSON.parse(readFileSync(path.join(dbDir, "enterprise-db.json"), "utf8")) as PersistedDb;

  /** A workspace owner with a live team, established the ordinary way. */
  const registerOwner = (org: string, email: string) => enterprise.registerEnterpriseUser({
    name: "Cohort PI",
    email,
    password: "sena-secure-123",
    organization: org,
    plan: "lab"
  });

  const invite = (
    context: Parameters<typeof enterprise.createEnterpriseInvitation>[0],
    teamId: string,
    email: string
  ) => enterprise.createEnterpriseInvitation(context, { teamId, email, role: "reviewer" });

  const archiveTeam = async (org: string) => await provisioning.provisionEnterpriseOrganizationAsync({
    source: "api",
    organization: org,
    teams: [{ name: org, archived: true } as never]
  });

  const restoreTeam = async (org: string) => await provisioning.provisionEnterpriseOrganizationAsync({
    source: "api",
    organization: org,
    teams: [{ name: org, archived: false } as never]
  });

  const rosterOf = (db: PersistedDb, teamId: string) => db.memberships
    .filter((membership) => membership.teamId === teamId)
    .map((membership) => ({ id: membership.id, userId: membership.userId, role: membership.role, status: membership.status }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return { enterprise, readDb, registerOwner, invite, archiveTeam, restoreTeam, rosterOf };
}

/** The whole scenario: a live team, an invitation, then archival. */
async function archivedTeamWithPendingInvitation() {
  const harness = await loadHarness();
  const owner = harness.registerOwner(organization, "cohort-pi@example.edu");
  const teamId = owner.context.teams[0].id;
  const invitation = harness.invite(owner.context, teamId, "late-joiner@example.edu");
  await harness.archiveTeam(organization);
  const rosterAfterArchival = harness.rosterOf(harness.readDb(), teamId);
  expect(rosterAfterArchival.every((membership) => membership.status === "suspended")).toBe(true);
  return { ...harness, owner, teamId, invitation, rosterAfterArchival };
}

describe("invitations into an archived team", () => {
  it("refuses a password registration that redeems an invitation issued before the archival", async () => {
    const { enterprise, readDb, teamId, invitation, rosterAfterArchival } = await archivedTeamWithPendingInvitation();

    await expect(enterprise.registerEnterpriseUserAsync({
      name: "Late Joiner",
      email: "late-joiner@example.edu",
      password: "sena-secure-456",
      organization: "Outside Lab",
      inviteCode: invitation.inviteCode
    })).rejects.toMatchObject({ code: "invitation_team_missing", status: 410 });

    const db = readDb();
    expect(rosterOfUnchanged(db, teamId, rosterAfterArchival)).toBe(true);
    expect(db.users.map((user) => user.email)).not.toContain("late-joiner@example.edu");
    expect(db.invitations.find((candidate) => candidate.id === invitation.id)?.status).toBe("pending");
  });

  it("refuses an SSO sign-in that redeems an invitation issued before the archival", async () => {
    const { enterprise, readDb, teamId, invitation, rosterAfterArchival } = await archivedTeamWithPendingInvitation();

    await expect(enterprise.ssoEnterpriseUserAsync({
      provider: "institution",
      email: "late-joiner@example.edu",
      name: "Late Joiner",
      organization: "Outside Lab",
      subject: "late-joiner-001",
      inviteCode: invitation.inviteCode
    })).rejects.toMatchObject({ code: "invitation_team_missing", status: 410 });

    const db = readDb();
    expect(rosterOfUnchanged(db, teamId, rosterAfterArchival)).toBe(true);
    expect(db.users.map((user) => user.email)).not.toContain("late-joiner@example.edu");
    expect(db.invitations.find((candidate) => candidate.id === invitation.id)?.status).toBe("pending");
  });

  it("refuses an SSO sign-in that would reactivate the membership the archival suspended", async () => {
    // The sharpest revival: the invitee is already on the roster, so the SSO
    // path does not create a membership — it flips the archived one back to
    // active, which is exactly the state archival exists to prevent.
    const { enterprise, readDb, registerOwner, invite, archiveTeam, rosterOf } = await loadHarness();
    const owner = registerOwner(organization, "cohort-pi@example.edu");
    const teamId = owner.context.teams[0].id;

    const firstInvitation = invite(owner.context, teamId, "cohort-coder@example.edu");
    // A second invitation for the same person, still pending when the team retires.
    const staleInvitation = invite(owner.context, teamId, "cohort-coder@example.edu");
    enterprise.registerEnterpriseUser({
      name: "Cohort Coder",
      email: "cohort-coder@example.edu",
      password: "sena-secure-456",
      organization: "Outside Lab",
      inviteCode: firstInvitation.inviteCode
    });
    await archiveTeam(organization);
    const rosterAfterArchival = rosterOf(readDb(), teamId);
    expect(rosterAfterArchival).toHaveLength(2);

    await expect(enterprise.ssoEnterpriseUserAsync({
      provider: "institution",
      email: "cohort-coder@example.edu",
      subject: "cohort-coder-001",
      inviteCode: staleInvitation.inviteCode
    })).rejects.toMatchObject({ code: "invitation_team_missing", status: 410 });

    const db = readDb();
    expect(rosterOf(db, teamId)).toEqual(rosterAfterArchival);
    expect(db.invitations.find((candidate) => candidate.id === staleInvitation.id)?.status).toBe("pending");
  });

  it("refuses a signed-in acceptance of an invitation issued before the archival", async () => {
    const { enterprise, readDb, registerOwner, invite, archiveTeam, rosterOf } = await loadHarness();
    const owner = registerOwner(organization, "cohort-pi@example.edu");
    const teamId = owner.context.teams[0].id;
    // An account that already exists elsewhere accepts through the team API
    // rather than through signup.
    const outsider = enterprise.registerEnterpriseUser({
      name: "Outside Reviewer",
      email: "outside-reviewer@example.edu",
      password: "sena-secure-456",
      organization: "Outside Lab",
      plan: "lab"
    });
    const invitation = invite(owner.context, teamId, "outside-reviewer@example.edu");
    await archiveTeam(organization);
    const rosterAfterArchival = rosterOf(readDb(), teamId);

    await expect(enterprise.acceptEnterpriseInvitationAsync(outsider.context, {
      inviteCode: invitation.inviteCode
    })).rejects.toMatchObject({ code: "invitation_team_missing", status: 410 });

    const db = readDb();
    expect(rosterOf(db, teamId)).toEqual(rosterAfterArchival);
    expect(db.invitations.find((candidate) => candidate.id === invitation.id)?.status).toBe("pending");
  });

  it("reports the archived team exactly as a genuinely missing one, leaking nothing extra", async () => {
    const { enterprise, invitation } = await archivedTeamWithPendingInvitation();

    const archivedRefusal = await captureError(() => enterprise.registerEnterpriseUserAsync({
      name: "Late Joiner",
      email: "late-joiner@example.edu",
      password: "sena-secure-456",
      organization: "Outside Lab",
      inviteCode: invitation.inviteCode
    }));

    expect(archivedRefusal).toMatchObject({ code: "invitation_team_missing", status: 410 });
    expect(String((archivedRefusal as { message?: string }).message)).toBe("Invitation team is no longer available.");
    // Nothing in the refusal names the team, its id, or its retired state.
    expect(JSON.stringify(archivedRefusal)).not.toContain(organization);
    expect(JSON.stringify(archivedRefusal)).not.toContain("archiv");
  });
});

describe("invitations that must keep working", () => {
  it("still admits a registration into a live team", async () => {
    const { enterprise, readDb, registerOwner, invite, rosterOf } = await loadHarness();
    const owner = registerOwner("Live Cohort Lab", "live-pi@example.edu");
    const teamId = owner.context.teams[0].id;
    const invitation = invite(owner.context, teamId, "live-joiner@example.edu");

    const joined = await enterprise.registerEnterpriseUserAsync({
      name: "Live Joiner",
      email: "live-joiner@example.edu",
      password: "sena-secure-456",
      organization: "Outside Lab",
      inviteCode: invitation.inviteCode
    });

    expect(joined.context.memberships.map((membership) => membership.teamId)).toContain(teamId);
    const db = readDb();
    expect(rosterOf(db, teamId).filter((membership) => membership.status === "active")).toHaveLength(2);
    expect(db.invitations.find((candidate) => candidate.id === invitation.id)?.status).toBe("accepted");
  });

  it("still admits an SSO sign-in into a live team", async () => {
    const { enterprise, readDb, registerOwner, invite, rosterOf } = await loadHarness();
    const owner = registerOwner("Live Cohort Lab", "live-pi@example.edu");
    const teamId = owner.context.teams[0].id;
    const invitation = invite(owner.context, teamId, "live-sso-joiner@example.edu");

    const joined = await enterprise.ssoEnterpriseUserAsync({
      provider: "institution",
      email: "live-sso-joiner@example.edu",
      subject: "live-sso-joiner-001",
      inviteCode: invitation.inviteCode
    });

    expect(joined.context.memberships.map((membership) => membership.teamId)).toContain(teamId);
    expect(rosterOf(readDb(), teamId).filter((membership) => membership.status === "active")).toHaveLength(2);
  });

  it("admits a fresh invitation again once the team is restored, and restores the suspended roster", async () => {
    const { enterprise, readDb, registerOwner, invite, archiveTeam, restoreTeam, rosterOf } = await loadHarness();
    const owner = registerOwner(organization, "cohort-pi@example.edu");
    const teamId = owner.context.teams[0].id;
    const ownerMembershipId = owner.context.memberships[0].id;

    await archiveTeam(organization);
    expect(rosterOf(readDb(), teamId).every((membership) => membership.status === "suspended")).toBe(true);

    const restored = await restoreTeam(organization);
    expect(restored.teams[0].archival).toBe("restored");
    const restoredDb = readDb();
    expect(restoredDb.teams.find((team) => team.id === teamId)?.archived).toBeUndefined();
    expect(restoredDb.memberships.find((membership) => membership.id === ownerMembershipId)?.status).toBe("active");

    const invitation = invite(owner.context, teamId, "post-restore-joiner@example.edu");
    const joined = await enterprise.registerEnterpriseUserAsync({
      name: "Post Restore Joiner",
      email: "post-restore-joiner@example.edu",
      password: "sena-secure-456",
      organization: "Outside Lab",
      inviteCode: invitation.inviteCode
    });

    expect(joined.context.memberships.map((membership) => membership.teamId)).toContain(teamId);
    expect(rosterOf(readDb(), teamId).filter((membership) => membership.status === "active")).toHaveLength(2);
  });
});

function rosterOfUnchanged(
  db: PersistedDb,
  teamId: string,
  expected: Array<{ id: string; userId: string; role: string; status: string }>
) {
  const actual = db.memberships
    .filter((membership) => membership.teamId === teamId)
    .map((membership) => ({ id: membership.id, userId: membership.userId, role: membership.role, status: membership.status }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function captureError(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error as { code?: string; status?: number; message?: string };
  }
  throw new Error("Expected the call to be refused.");
}
