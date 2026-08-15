import { createHash, randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  rolePermissions,
  type SenaEnterpriseRole
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  readEnterpriseDb,
  readEnterpriseState,
  writeEnterpriseDb,
  writeEnterpriseState
} from "./state";
import { recordEnterpriseAudit, recordEnterpriseAuditAsync } from "./ops-audit";
import type { SenaEnterpriseSsoProvider } from "./auth-sso";
import type { SenaEnterpriseAuditLogEntry } from "./ops-audit";
import type { SenaEnterpriseDb, SenaEnterpriseTeam } from "./state";
import type { SenaEnterpriseMembership } from "./team-memberships";

export type SenaEnterpriseProvisioningSource = "api" | "scim";

export type SenaEnterpriseProvisioningMetadata = {
  source: SenaEnterpriseProvisioningSource;
  externalId?: string;
  lastSyncedAt: string;
};

export type SenaEnterpriseProvisioningTeamInput = {
  externalId?: string;
  name: string;
  organization?: string;
  plan?: SenaEnterpriseTeam["plan"];
  /**
   * Role members of this team default to. Persisted on the team record;
   * undefined leaves an already-stored default untouched, so a provisioning
   * request that does not speak about defaults cannot silently erase one.
   */
  defaultRole?: SenaEnterpriseRole;
  /**
   * `true` retires the team, `false` restores it, undefined leaves its archival
   * state exactly as it is.
   */
  archived?: boolean;
  /** Actor recorded on the archival; defaults to the provisioning source. */
  archivedBy?: string;
};

export type SenaEnterpriseProvisioningMembershipInput = {
  teamId?: string;
  teamExternalId?: string;
  teamName?: string;
  role: SenaEnterpriseRole;
  status?: SenaEnterpriseMembership["status"];
};

export type SenaEnterpriseProvisioningUserInput = {
  externalId?: string;
  email: string;
  name?: string;
  organization?: string;
  status?: SenaEnterpriseMembership["status"];
  sso?: {
    provider: SenaEnterpriseSsoProvider;
    subject: string;
  };
  memberships?: SenaEnterpriseProvisioningMembershipInput[];
};

export type SenaEnterpriseProvisioningInput = {
  source?: SenaEnterpriseProvisioningSource;
  organization: string;
  dryRun?: boolean;
  teams?: SenaEnterpriseProvisioningTeamInput[];
  users?: SenaEnterpriseProvisioningUserInput[];
};

export type SenaEnterpriseProvisioningResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProvisioning;
  generatedAt: string;
  dryRun: boolean;
  source: SenaEnterpriseProvisioningSource;
  organization: string;
  summary: {
    teamsCreated: number;
    teamsUpdated: number;
    usersCreated: number;
    usersUpdated: number;
    membershipsCreated: number;
    membershipsUpdated: number;
  };
  teams: Array<{
    id: string;
    externalId?: string;
    name: string;
    status: "created" | "updated";
    /** Set only when this request changed the team's archival state. */
    archival?: "archived" | "restored";
  }>;
  users: Array<{
    id: string;
    externalId?: string;
    emailHash: string;
    emailDomain: string;
    status: "created" | "updated";
  }>;
  memberships: Array<{
    id: string;
    teamId: string;
    userId: string;
    role: SenaEnterpriseRole;
    status: SenaEnterpriseMembership["status"];
    change: "created" | "updated";
  }>;
};

const provisioningSsoProviders: SenaEnterpriseSsoProvider[] = ["institution", "google", "orcid"];

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function authEmailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function authEmailDomain(email: string) {
  const domain = normalizeEmail(email).split("@")[1] || "unknown";
  return domain.replace(/[^a-z0-9.-]+/g, "-").slice(0, 128) || "unknown";
}

function dbWorkingCopy(db: SenaEnterpriseDb): SenaEnterpriseDb {
  return JSON.parse(JSON.stringify(db)) as SenaEnterpriseDb;
}

function provisioningMetadata(source: SenaEnterpriseProvisioningSource, externalId: string | undefined, syncedAt: string): SenaEnterpriseProvisioningMetadata {
  return {
    source,
    externalId: externalId?.trim() || undefined,
    lastSyncedAt: syncedAt
  };
}

function provisioningExternalIdMatches(record: { provisioning?: SenaEnterpriseProvisioningMetadata }, source: SenaEnterpriseProvisioningSource, externalId?: string) {
  return Boolean(externalId && record.provisioning?.source === source && record.provisioning.externalId === externalId);
}

function provisionedTeamByInput(db: SenaEnterpriseDb, source: SenaEnterpriseProvisioningSource, organization: string, input: SenaEnterpriseProvisioningTeamInput) {
  const name = input.name.trim();
  if (!name) throw new SenaEnterpriseError("Provisioned teams require a name.", 400, "invalid_provisioning_team");
  return db.teams.find((team) => provisioningExternalIdMatches(team, source, input.externalId)) ??
    db.teams.find((team) => team.name.toLowerCase() === name.toLowerCase() && team.organization.toLowerCase() === organization.toLowerCase());
}

function provisionedTeamByMembership(db: SenaEnterpriseDb, source: SenaEnterpriseProvisioningSource, organization: string, input: SenaEnterpriseProvisioningMembershipInput) {
  if (input.teamId) return db.teams.find((team) => team.id === input.teamId);
  if (input.teamExternalId) return db.teams.find((team) => provisioningExternalIdMatches(team, source, input.teamExternalId));
  if (input.teamName) {
    return db.teams.find((team) => team.name.toLowerCase() === input.teamName!.trim().toLowerCase() && team.organization.toLowerCase() === organization.toLowerCase());
  }
  return undefined;
}

function validProvisioningSource(source: unknown): source is SenaEnterpriseProvisioningSource {
  return source === "api" || source === "scim";
}

function activeTeamManagerCount(db: SenaEnterpriseDb, teamId: string, override?: {
  membershipId: string;
  role: SenaEnterpriseRole;
  status: SenaEnterpriseMembership["status"];
}) {
  return db.memberships.filter((membership) => {
    const role = override?.membershipId === membership.id ? override.role : membership.role;
    const status = override?.membershipId === membership.id ? override.status : membership.status;
    return membership.teamId === teamId && status === "active" && rolePermissions[role].includes("team:manage");
  }).length;
}

/**
 * The last-active-manager guard exists to stop a team being stranded with
 * nobody who can administer it. A retired team has nobody by construction, so
 * an archived team is out of the calculation entirely — otherwise retiring a
 * team whose only manager it owns would be refused rather than applied.
 */
function teamIsArchived(db: SenaEnterpriseDb, teamId: string) {
  return Boolean(db.teams.find((team) => team.id === teamId)?.archived);
}

function requireActiveTeamManagers(db: SenaEnterpriseDb, teamId: string, error: SenaEnterpriseError, override?: {
  membershipId: string;
  role: SenaEnterpriseRole;
  status: SenaEnterpriseMembership["status"];
}) {
  if (teamIsArchived(db, teamId)) return;
  if (activeTeamManagerCount(db, teamId, override) === 0) throw error;
}

/**
 * Retires a team. Every membership still active on it is suspended — not just
 * the ones the archiving source provisioned — because every reader that decides
 * "is this team mine" does so through an active membership: the session context
 * (`contextFromDb`), and therefore team listings and every RBAC check built on
 * it. A team that vanished from listings but still granted permissions would be
 * worse than no archival at all.
 */
function archiveProvisionedTeam(
  db: SenaEnterpriseDb,
  team: SenaEnterpriseTeam,
  input: SenaEnterpriseProvisioningTeamInput,
  source: SenaEnterpriseProvisioningSource,
  syncedAt: string
) {
  if (team.archived) return false;
  const suspended = db.memberships.filter((membership) => membership.teamId === team.id && membership.status === "active");
  for (const membership of suspended) {
    membership.status = "suspended";
    membership.updatedAt = syncedAt;
  }
  team.archived = {
    archivedAt: syncedAt,
    archivedBy: input.archivedBy?.trim() || `${source}:${team.provisioning?.externalId ?? team.id}`,
    source,
    suspendedMembershipIds: suspended.map((membership) => membership.id)
  };
  team.updatedAt = syncedAt;
  return true;
}

function restoreProvisionedTeam(db: SenaEnterpriseDb, team: SenaEnterpriseTeam, syncedAt: string) {
  if (!team.archived) return false;
  const restored = new Set(team.archived.suspendedMembershipIds);
  for (const membership of db.memberships) {
    if (!restored.has(membership.id) || membership.status === "active") continue;
    membership.status = "active";
    membership.updatedAt = syncedAt;
  }
  delete team.archived;
  team.updatedAt = syncedAt;
  return true;
}

type SenaEnterpriseProvisioningAuditEntry = Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">;

type SenaEnterpriseProvisioningCommit = {
  result: SenaEnterpriseProvisioningResult;
  /** Null for a dry run: nothing is persisted, so nothing is audited. */
  audit: SenaEnterpriseProvisioningAuditEntry | null;
};

function recordProvisioningAudit(entry: SenaEnterpriseProvisioningAuditEntry) {
  recordEnterpriseAudit(entry);
}

/**
 * Applies a provisioning request to an already-read enterprise database and
 * hands the caller the audit entry to record.
 *
 * Persistence is deliberately the caller's job so the same mutation can be
 * committed against whichever primary state store is configured: the
 * synchronous file store (`provisionEnterpriseOrganization`) or the async
 * primary — Postgres under SENA_ENTERPRISE_STATE_STORE=postgres —
 * (`provisionEnterpriseOrganizationAsync`). A dry run mutates a throwaway copy
 * of `savedDb`, so a caller that honours `result.dryRun` never persists it.
 */
function provisionEnterpriseOrganizationInDb(
  input: SenaEnterpriseProvisioningInput,
  savedDb: SenaEnterpriseDb
): SenaEnterpriseProvisioningCommit {
  const source = validProvisioningSource(input.source) ? input.source : "api";
  const organization = input.organization.trim();
  if (!organization) throw new SenaEnterpriseError("Provisioning requires an organization name.", 400, "invalid_provisioning_organization");
  const dryRun = Boolean(input.dryRun);
  const db = dryRun ? dbWorkingCopy(savedDb) : savedDb;
  const syncedAt = now();
  const result: SenaEnterpriseProvisioningResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProvisioning,
    generatedAt: syncedAt,
    dryRun,
    source,
    organization,
    summary: {
      teamsCreated: 0,
      teamsUpdated: 0,
      usersCreated: 0,
      usersUpdated: 0,
      membershipsCreated: 0,
      membershipsUpdated: 0
    },
    teams: [],
    users: [],
    memberships: []
  };

  for (const teamInput of input.teams ?? []) {
    const name = teamInput.name.trim();
    const plan = teamInput.plan ?? "enterprise";
    if (plan !== "individual" && plan !== "lab" && plan !== "enterprise") {
      throw new SenaEnterpriseError("Provisioned team plan is not supported.", 400, "invalid_provisioning_plan");
    }
    if (teamInput.defaultRole && !rolePermissions[teamInput.defaultRole]) {
      throw new SenaEnterpriseError("Provisioned team default role is not supported.", 400, "invalid_provisioning_team_default_role");
    }
    let team = provisionedTeamByInput(db, source, organization, teamInput);
    let status: "created" | "updated" = "updated";
    if (!team) {
      team = {
        id: id("team"),
        name,
        plan,
        organization: teamInput.organization?.trim() || organization,
        defaultRole: teamInput.defaultRole,
        provisioning: provisioningMetadata(source, teamInput.externalId, syncedAt),
        createdAt: syncedAt,
        updatedAt: syncedAt
      };
      db.teams.push(team);
      status = "created";
      result.summary.teamsCreated += 1;
    } else {
      team.name = name;
      team.plan = plan;
      team.organization = teamInput.organization?.trim() || organization;
      if (teamInput.defaultRole) team.defaultRole = teamInput.defaultRole;
      team.provisioning = provisioningMetadata(source, teamInput.externalId ?? team.provisioning?.externalId, syncedAt);
      team.updatedAt = syncedAt;
      result.summary.teamsUpdated += 1;
    }
    // Archival is settled before memberships are applied, so the membership
    // guards below see the team's final state: a retired team is out of the
    // manager calculation, and a restored one accepts active members again.
    let archival: "archived" | "restored" | undefined;
    if (teamInput.archived === true && archiveProvisionedTeam(db, team, teamInput, source, syncedAt)) {
      archival = "archived";
    } else if (teamInput.archived === false && restoreProvisionedTeam(db, team, syncedAt)) {
      archival = "restored";
    }
    result.teams.push({ id: team.id, externalId: team.provisioning?.externalId, name: team.name, status, archival });
  }

  const touchedTeamIds = new Set(result.teams.map((team) => team.id));

  for (const userInput of input.users ?? []) {
    const email = normalizeEmail(userInput.email);
    if (!email.includes("@")) throw new SenaEnterpriseError("Provisioned users require a valid email.", 400, "invalid_provisioning_email");
    if (userInput.status && userInput.status !== "active" && userInput.status !== "suspended") {
      throw new SenaEnterpriseError("Provisioned user status is not supported.", 400, "invalid_provisioning_user_status");
    }
    let user = db.users.find((candidate) => provisioningExternalIdMatches(candidate, source, userInput.externalId)) ??
      db.users.find((candidate) => candidate.email === email);
    let userStatus: "created" | "updated" = "updated";
    if (!user) {
      user = {
        id: id("user"),
        email,
        name: userInput.name?.trim() || email.split("@")[0],
        organization: userInput.organization?.trim() || organization,
        ssoIdentities: [],
        provisioning: provisioningMetadata(source, userInput.externalId, syncedAt),
        createdAt: syncedAt,
        updatedAt: syncedAt
      };
      db.users.push(user);
      userStatus = "created";
      result.summary.usersCreated += 1;
    } else {
      user.email = email;
      user.name = userInput.name?.trim() || user.name;
      user.organization = userInput.organization?.trim() || organization;
      user.provisioning = provisioningMetadata(source, userInput.externalId ?? user.provisioning?.externalId, syncedAt);
      user.updatedAt = syncedAt;
      result.summary.usersUpdated += 1;
    }
    if (userInput.sso?.provider && userInput.sso.subject) {
      const subject = userInput.sso.subject.trim();
      if (!subject) throw new SenaEnterpriseError("Provisioned SSO subject cannot be empty.", 400, "invalid_provisioning_sso_subject");
      if (!provisioningSsoProviders.includes(userInput.sso.provider)) {
        throw new SenaEnterpriseError("Provisioned SSO provider is not supported.", 400, "invalid_provisioning_sso_provider");
      }
      if (!user.ssoIdentities.some((identity) => identity.provider === userInput.sso!.provider && identity.subject === subject)) {
        user.ssoIdentities.push({ provider: userInput.sso.provider, subject, linkedAt: syncedAt });
      }
    }
    result.users.push({
      id: user.id,
      externalId: user.provisioning?.externalId,
      emailHash: authEmailHash(user.email),
      emailDomain: authEmailDomain(user.email),
      status: userStatus
    });

    if (userInput.status === "suspended") {
      for (const membership of db.memberships.filter((candidate) => candidate.userId === user!.id && candidate.status !== "suspended")) {
        requireActiveTeamManagers(
          db,
          membership.teamId,
          new SenaEnterpriseError("Provisioning cannot suspend the last active team manager.", 400, "last_team_manager_required"),
          { membershipId: membership.id, role: membership.role, status: "suspended" }
        );
        membership.status = "suspended";
        membership.provisioning = provisioningMetadata(source, membership.provisioning?.externalId ?? `${user.provisioning?.externalId ?? user.id}:${membership.teamId}`, syncedAt);
        membership.updatedAt = syncedAt;
        result.summary.membershipsUpdated += 1;
        touchedTeamIds.add(membership.teamId);
        result.memberships.push({
          id: membership.id,
          teamId: membership.teamId,
          userId: user.id,
          role: membership.role,
          status: membership.status,
          change: "updated"
        });
      }
    }

    for (const membershipInput of userInput.memberships ?? []) {
      if (!rolePermissions[membershipInput.role]) {
        throw new SenaEnterpriseError("Provisioned membership role is not supported.", 400, "invalid_provisioning_role");
      }
      const membershipStatus = userInput.status === "suspended" ? "suspended" : membershipInput.status ?? "active";
      if (membershipStatus !== "active" && membershipStatus !== "suspended") {
        throw new SenaEnterpriseError("Provisioned membership status is not supported.", 400, "invalid_provisioning_membership_status");
      }
      const team = provisionedTeamByMembership(db, source, organization, membershipInput);
      if (!team) {
        throw new SenaEnterpriseError("Provisioned membership referenced a missing team.", 400, "provisioning_team_missing");
      }
      // A retired team may still take suspended memberships — that is exactly
      // what the archiving request writes — but granting active access to it
      // would resurrect the team for RBAC while it stays hidden from listings.
      if (team.archived && membershipStatus === "active") {
        throw new SenaEnterpriseError("Provisioned memberships cannot be added to an archived team.", 400, "provisioning_team_archived");
      }
      let membership = db.memberships.find((candidate) => candidate.teamId === team.id && candidate.userId === user!.id);
      const change: "created" | "updated" = membership ? "updated" : "created";
      if (!membership) {
        membership = {
          id: id("member"),
          teamId: team.id,
          userId: user.id,
          role: membershipInput.role,
          status: membershipStatus,
          provisioning: provisioningMetadata(source, `${user.provisioning?.externalId ?? user.id}:${team.provisioning?.externalId ?? team.id}`, syncedAt),
          createdAt: syncedAt,
          updatedAt: syncedAt
        };
        db.memberships.push(membership);
        result.summary.membershipsCreated += 1;
      } else {
        requireActiveTeamManagers(
          db,
          team.id,
          new SenaEnterpriseError("Provisioning cannot remove the last active team manager.", 400, "last_team_manager_required"),
          { membershipId: membership.id, role: membershipInput.role, status: membershipStatus }
        );
        membership.role = membershipInput.role;
        membership.status = membershipStatus;
        membership.provisioning = provisioningMetadata(source, membership.provisioning?.externalId ?? `${user.provisioning?.externalId ?? user.id}:${team.provisioning?.externalId ?? team.id}`, syncedAt);
        membership.updatedAt = syncedAt;
        result.summary.membershipsUpdated += 1;
      }
      touchedTeamIds.add(team.id);
      result.memberships.push({
        id: membership.id,
        teamId: team.id,
        userId: user.id,
        role: membership.role,
        status: membership.status,
        change
      });
    }
  }

  for (const teamId of touchedTeamIds) {
    requireActiveTeamManagers(
      db,
      teamId,
      new SenaEnterpriseError("Provisioned teams require at least one active owner, PI, or manager.", 400, "provisioning_team_manager_required")
    );
  }

  if (dryRun) return { result, audit: null };
  return {
    result,
    audit: {
      event: "provisioning.sync",
      teamId: result.teams[0]?.id,
      detail: {
        source,
        organization,
        dryRun,
        teamsCreated: result.summary.teamsCreated,
        teamsUpdated: result.summary.teamsUpdated,
        usersCreated: result.summary.usersCreated,
        usersUpdated: result.summary.usersUpdated,
        membershipsCreated: result.summary.membershipsCreated,
        membershipsUpdated: result.summary.membershipsUpdated,
        teamsArchived: result.teams.filter((team) => team.archival === "archived").length,
        teamsRestored: result.teams.filter((team) => team.archival === "restored").length
      }
    }
  };
}

/**
 * File-primary provisioning. Unchanged behaviour: read, mutate, write, audit —
 * all through the synchronous file-backed store. Callers that can await should
 * prefer provisionEnterpriseOrganizationAsync, which routes the same write to
 * the configured primary state store.
 */
export function provisionEnterpriseOrganization(input: SenaEnterpriseProvisioningInput): SenaEnterpriseProvisioningResult {
  const db = readEnterpriseDb();
  const { result, audit } = provisionEnterpriseOrganizationInDb(input, db);
  if (!result.dryRun) {
    writeEnterpriseDb(db);
    if (audit) recordProvisioningAudit(audit);
  }
  return result;
}

/**
 * Primary-state provisioning: the SCIM and /api/sena/provisioning write path.
 * With the file store as primary this is byte-for-byte the file behaviour
 * above; with SENA_ENTERPRISE_STATE_STORE=postgres the provisioned users,
 * teams, and memberships land in the Postgres primary that login,
 * registration, and team reads actually consult — instead of a
 * .sena-enterprise/enterprise-db.json those readers never open.
 */
export async function provisionEnterpriseOrganizationAsync(input: SenaEnterpriseProvisioningInput): Promise<SenaEnterpriseProvisioningResult> {
  const state = await readEnterpriseState();
  const { result, audit } = provisionEnterpriseOrganizationInDb(input, state.db);
  if (!result.dryRun) {
    await writeEnterpriseState(state, state.db);
    if (audit) await recordEnterpriseAuditAsync(audit);
  }
  return result;
}

export function listEnterpriseProvisioningDirectory(source: SenaEnterpriseProvisioningSource = "scim"): SenaEnterpriseProvisioningDirectory {
  return listEnterpriseProvisioningDirectoryFromDb(readEnterpriseDb(), source);
}

/** Primary-state twin of listEnterpriseProvisioningDirectory: the SCIM read surface. */
export async function listEnterpriseProvisioningDirectoryAsync(
  source: SenaEnterpriseProvisioningSource = "scim"
): Promise<SenaEnterpriseProvisioningDirectory> {
  const state = await readEnterpriseState();
  return listEnterpriseProvisioningDirectoryFromDb(state.db, source);
}

function listEnterpriseProvisioningDirectoryFromDb(
  db: SenaEnterpriseDb,
  source: SenaEnterpriseProvisioningSource
): SenaEnterpriseProvisioningDirectory {
  const users = db.users.filter((user) => user.provisioning?.source === source);
  // An archived team is retired: it leaves the directory, and so do the
  // memberships pointing at it, so a directory read never advertises a group
  // that a GET would 404 on.
  const archivedTeamIds = new Set(db.teams.filter((team) => team.archived).map((team) => team.id));
  const teams = db.teams.filter((team) => team.provisioning?.source === source && !team.archived);
  const teamById = new Map(db.teams.map((team) => [team.id, team]));
  const userById = new Map(db.users.map((user) => [user.id, user]));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProvisioningDirectory,
    generatedAt: now(),
    source,
    users: users.map((user) => ({
      id: user.id,
      externalId: user.provisioning?.externalId,
      email: user.email,
      name: user.name,
      organization: user.organization,
      ssoSubjects: user.ssoIdentities.map((identity) => `${identity.provider}:${identity.subject}`),
      memberships: db.memberships
        .filter((membership) => (
          membership.userId === user.id &&
          membership.provisioning?.source === source &&
          !archivedTeamIds.has(membership.teamId)
        ))
        .map((membership) => {
          const team = teamById.get(membership.teamId);
          return {
            id: membership.id,
            teamId: membership.teamId,
            teamExternalId: team?.provisioning?.externalId,
            teamName: team?.name ?? membership.teamId,
            role: membership.role,
            status: membership.status
          };
        })
    })),
    teams: teams.map((team) => ({
      id: team.id,
      externalId: team.provisioning?.externalId,
      name: team.name,
      organization: team.organization,
      plan: team.plan,
      defaultRole: team.defaultRole,
      members: db.memberships
        .filter((membership) => membership.teamId === team.id && membership.provisioning?.source === source)
        .map((membership) => {
          const user = userById.get(membership.userId);
          return {
            userId: membership.userId,
            userExternalId: user?.provisioning?.externalId,
            display: user?.name ?? membership.userId,
            role: membership.role,
            status: membership.status
          };
        })
    }))
  };
}

export type SenaEnterpriseProvisioningDirectory = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProvisioningDirectory;
  generatedAt: string;
  source: SenaEnterpriseProvisioningSource;
  users: Array<{
    id: string;
    externalId?: string;
    email: string;
    name: string;
    organization: string;
    ssoSubjects: string[];
    memberships: Array<{
      id: string;
      teamId: string;
      teamExternalId?: string;
      teamName: string;
      role: SenaEnterpriseRole;
      status: SenaEnterpriseMembership["status"];
    }>;
  }>;
  teams: Array<{
    id: string;
    externalId?: string;
    name: string;
    organization: string;
    plan: SenaEnterpriseTeam["plan"];
    /**
     * The team's stored default role, surfaced so a provisioning client can
     * recover it on a request that does not carry the group's own extension.
     */
    defaultRole?: SenaEnterpriseRole;
    members: Array<{
      userId: string;
      userExternalId?: string;
      display: string;
      role: SenaEnterpriseRole;
      status: SenaEnterpriseMembership["status"];
    }>;
  }>;
};
