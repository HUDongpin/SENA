import { createHash, randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  rolePermissions,
  type SenaEnterpriseRole
} from "./access-control";
import { SenaEnterpriseError } from "./errors";
import {
  readEnterpriseDb,
  writeEnterpriseDb
} from "./state";
import { recordEnterpriseAudit } from "./ops-audit";
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

function recordProvisioningAudit(entry: Omit<SenaEnterpriseAuditLogEntry, "id" | "createdAt">) {
  recordEnterpriseAudit(entry);
}

export function provisionEnterpriseOrganization(input: SenaEnterpriseProvisioningInput): SenaEnterpriseProvisioningResult {
  const source = validProvisioningSource(input.source) ? input.source : "api";
  const organization = input.organization.trim();
  if (!organization) throw new SenaEnterpriseError("Provisioning requires an organization name.", 400, "invalid_provisioning_organization");
  const dryRun = Boolean(input.dryRun);
  const savedDb = readEnterpriseDb();
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
    let team = provisionedTeamByInput(db, source, organization, teamInput);
    let status: "created" | "updated" = "updated";
    if (!team) {
      team = {
        id: id("team"),
        name,
        plan,
        organization: teamInput.organization?.trim() || organization,
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
      team.provisioning = provisioningMetadata(source, teamInput.externalId ?? team.provisioning?.externalId, syncedAt);
      team.updatedAt = syncedAt;
      result.summary.teamsUpdated += 1;
    }
    result.teams.push({ id: team.id, externalId: team.provisioning?.externalId, name: team.name, status });
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
        if (activeTeamManagerCount(db, membership.teamId, { membershipId: membership.id, role: membership.role, status: "suspended" }) === 0) {
          throw new SenaEnterpriseError("Provisioning cannot suspend the last active team manager.", 400, "last_team_manager_required");
        }
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
        if (activeTeamManagerCount(db, team.id, { membershipId: membership.id, role: membershipInput.role, status: membershipStatus }) === 0) {
          throw new SenaEnterpriseError("Provisioning cannot remove the last active team manager.", 400, "last_team_manager_required");
        }
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
    if (activeTeamManagerCount(db, teamId) === 0) {
      throw new SenaEnterpriseError("Provisioned teams require at least one active owner, PI, or manager.", 400, "provisioning_team_manager_required");
    }
  }

  if (!dryRun) {
    writeEnterpriseDb(db);
    recordProvisioningAudit({
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
        membershipsUpdated: result.summary.membershipsUpdated
      }
    });
  }
  return result;
}

export function listEnterpriseProvisioningDirectory(source: SenaEnterpriseProvisioningSource = "scim"): SenaEnterpriseProvisioningDirectory {
  const db = readEnterpriseDb();
  const users = db.users.filter((user) => user.provisioning?.source === source);
  const teams = db.teams.filter((team) => team.provisioning?.source === source);
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
        .filter((membership) => membership.userId === user.id && membership.provisioning?.source === source)
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
    members: Array<{
      userId: string;
      userExternalId?: string;
      display: string;
      role: SenaEnterpriseRole;
      status: SenaEnterpriseMembership["status"];
    }>;
  }>;
};
