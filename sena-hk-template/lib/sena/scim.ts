import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaEnterpriseRole } from "./enterprise/access-control";
import type { SenaEnterpriseSsoProvider } from "./enterprise";
import { SenaEnterpriseError } from "./enterprise/errors";
import {
  listEnterpriseProvisioningDirectory,
  provisionEnterpriseOrganization,
  type SenaEnterpriseProvisioningDirectory,
  type SenaEnterpriseProvisioningInput,
  type SenaEnterpriseProvisioningMembershipInput,
  type SenaEnterpriseProvisioningResult,
  type SenaEnterpriseProvisioningTeamInput,
  type SenaEnterpriseProvisioningUserInput
} from "./enterprise/provisioning";

export const scimCoreUserSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
export const scimCoreGroupSchema = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const scimEnterpriseUserSchema = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
export const senaScimUserExtensionSchema = "urn:sena:params:scim:schemas:extension:enterprise:2.0:User";
export const senaScimGroupExtensionSchema = "urn:sena:params:scim:schemas:extension:enterprise:2.0:Group";
export const senaScimIdentityProductionExtensionSchema = "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig";

const enterpriseRoles: SenaEnterpriseRole[] = ["owner", "pi", "admin", "coder", "reviewer", "viewer"];
const ssoProviders: SenaEnterpriseSsoProvider[] = ["institution", "google", "orcid"];

type JsonRecord = Record<string, unknown>;

export type SenaScimProvisioningOptions = {
  organization?: string;
  dryRun?: boolean;
  defaultRole?: SenaEnterpriseRole;
  defaultSsoProvider?: SenaEnterpriseSsoProvider;
  locationBase?: string;
};

export type SenaScimProvisioningBridgeResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.scimProvisioningBridge;
  resourceType: "User" | "Group";
  generatedAt: string;
  organization: string;
  dryRun: boolean;
  provisioning: SenaEnterpriseProvisioningResult;
  resource: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extension(resource: JsonRecord, urn: string) {
  return asRecord(resource[urn]);
}

function roleFromValue(value: unknown, fallback: SenaEnterpriseRole): SenaEnterpriseRole {
  const normalized = asString(value).toLowerCase();
  return enterpriseRoles.includes(normalized as SenaEnterpriseRole) ? normalized as SenaEnterpriseRole : fallback;
}

function ssoProviderFromValue(value: unknown, fallback: SenaEnterpriseSsoProvider): SenaEnterpriseSsoProvider {
  const normalized = asString(value).toLowerCase();
  return ssoProviders.includes(normalized as SenaEnterpriseSsoProvider) ? normalized as SenaEnterpriseSsoProvider : fallback;
}

function statusFromActive(active: unknown) {
  return active === false ? "suspended" as const : "active" as const;
}

function organizationFromResource(resource: JsonRecord, options: SenaScimProvisioningOptions) {
  return asString(extension(resource, senaScimUserExtensionSchema).organization) ||
    asString(extension(resource, senaScimGroupExtensionSchema).organization) ||
    asString(extension(resource, scimEnterpriseUserSchema).organization) ||
    asString(resource.organization) ||
    options.organization ||
    process.env.SENA_SCIM_ORGANIZATION?.trim() ||
    "SENA SCIM Organization";
}

function scimUserEmail(resource: JsonRecord) {
  const emails = asArray(resource.emails).map(asRecord);
  const primary = emails.find((email) => email.primary === true && asString(email.value));
  const first = emails.find((email) => asString(email.value));
  return asString(primary?.value) || asString(first?.value) || asString(resource.userName);
}

function scimUserName(resource: JsonRecord, email: string) {
  const name = asRecord(resource.name);
  return asString(name.formatted) ||
    [asString(name.givenName), asString(name.familyName)].filter(Boolean).join(" ") ||
    asString(resource.displayName) ||
    email.split("@")[0];
}

function defaultRole(options: SenaScimProvisioningOptions) {
  return roleFromValue(process.env.SENA_SCIM_DEFAULT_ROLE, options.defaultRole ?? "viewer");
}

function defaultSsoProvider(options: SenaScimProvisioningOptions) {
  return ssoProviderFromValue(process.env.SENA_SCIM_DEFAULT_SSO_PROVIDER, options.defaultSsoProvider ?? "institution");
}

function teamInputFromMembership(membership: SenaEnterpriseProvisioningMembershipInput): SenaEnterpriseProvisioningTeamInput | undefined {
  const externalId = membership.teamExternalId?.trim();
  const name = membership.teamName?.trim() || externalId;
  if (!name) return undefined;
  return { externalId, name, plan: "enterprise" };
}

function dedupeTeams(teams: SenaEnterpriseProvisioningTeamInput[]) {
  const seen = new Set<string>();
  return teams.filter((team) => {
    const key = `${team.externalId ?? ""}:${team.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeMemberships(memberships: SenaEnterpriseProvisioningMembershipInput[]) {
  const seen = new Set<string>();
  return memberships.filter((membership) => {
    const key = membership.teamId ?? membership.teamExternalId ?? membership.teamName ?? "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function membershipFromRecord(record: JsonRecord, fallbackRole: SenaEnterpriseRole): SenaEnterpriseProvisioningMembershipInput | undefined {
  const recordExtension = extension(record, senaScimUserExtensionSchema);
  const role = roleFromValue(record.role ?? record.type ?? recordExtension.role, fallbackRole);
  const teamExternalId = asString(record.teamExternalId) || asString(record.value) || asString(record.externalId);
  const teamName = asString(record.teamName) || asString(record.display) || asString(record.displayName) || teamExternalId;
  const teamId = asString(record.teamId);
  if (!teamId && !teamExternalId && !teamName) return undefined;
  return {
    teamId: teamId || undefined,
    teamExternalId: teamExternalId || undefined,
    teamName: teamName || undefined,
    role,
    status: statusFromActive(record.active)
  };
}

function membershipsFromScimUser(resource: JsonRecord, fallbackRole: SenaEnterpriseRole) {
  const senaExtension = extension(resource, senaScimUserExtensionSchema);
  const explicitMemberships = asArray(senaExtension.memberships)
    .map(asRecord)
    .map((membership) => membershipFromRecord(membership, fallbackRole))
    .filter((membership): membership is SenaEnterpriseProvisioningMembershipInput => Boolean(membership));
  const groupMemberships = asArray(resource.groups)
    .map(asRecord)
    .map((group) => membershipFromRecord(group, fallbackRole))
    .filter((membership): membership is SenaEnterpriseProvisioningMembershipInput => Boolean(membership));
  return dedupeMemberships([...explicitMemberships, ...groupMemberships]);
}

function buildProvisioningUserFromScim(resource: JsonRecord, options: SenaScimProvisioningOptions): SenaEnterpriseProvisioningUserInput {
  const email = scimUserEmail(resource);
  if (!email.includes("@")) {
    throw new SenaEnterpriseError("SCIM User requires userName or emails[].value with a valid email.", 400, "invalid_scim_user_email");
  }
  const senaExtension = extension(resource, senaScimUserExtensionSchema);
  const externalId = asString(resource.externalId) || asString(resource.id) || email;
  const provider = ssoProviderFromValue(senaExtension.ssoProvider, defaultSsoProvider(options));
  const subject = asString(senaExtension.ssoSubject) || externalId || email;
  return {
    externalId,
    email,
    name: scimUserName(resource, email),
    organization: organizationFromResource(resource, options),
    status: statusFromActive(resource.active),
    sso: { provider, subject },
    memberships: membershipsFromScimUser(resource, defaultRole(options))
  };
}

function scimUserResponse(resource: JsonRecord, provisioning: SenaEnterpriseProvisioningResult, options: SenaScimProvisioningOptions) {
  const user = provisioning.users[0];
  const email = scimUserEmail(resource);
  const id = user?.id ?? asString(resource.id) ?? asString(resource.externalId) ?? email;
  const location = options.locationBase ? `${options.locationBase.replace(/\/$/, "")}/Users/${encodeURIComponent(id)}` : undefined;
  return {
    schemas: [scimCoreUserSchema, scimEnterpriseUserSchema, senaScimUserExtensionSchema],
    id,
    externalId: asString(resource.externalId) || asString(resource.id) || email,
    userName: email,
    name: {
      formatted: scimUserName(resource, email)
    },
    active: resource.active !== false,
    emails: [{ value: email, primary: true }],
    meta: {
      resourceType: "User",
      created: provisioning.generatedAt,
      lastModified: provisioning.generatedAt,
      location
    },
    [senaScimUserExtensionSchema]: {
      organization: provisioning.organization,
      provisioningSchema: provisioning.schemaVersion,
      emailHash: user?.emailHash,
      emailDomain: user?.emailDomain,
      summary: provisioning.summary
    }
  };
}

// A Group PatchOp only speaks about one group, so a deactivated member must
// lose that group's membership without being suspended everywhere else. PUT
// keeps the whole-resource semantics it always had.
type ScimGroupProvisioningScope = { scopeMemberStatusToGroup?: boolean };

function memberUserFromGroupMember(member: JsonRecord, group: JsonRecord, options: SenaScimProvisioningOptions, scope: ScimGroupProvisioningScope = {}): SenaEnterpriseProvisioningUserInput | undefined {
  const email = asString(member.email) || (asString(member.value).includes("@") ? asString(member.value) : "");
  if (!email.includes("@")) return undefined;
  const groupExtension = extension(group, senaScimGroupExtensionSchema);
  const externalId = asString(member.externalId) || asString(member.value) || email;
  const role = roleFromValue(member.role ?? member.type ?? extension(member, senaScimGroupExtensionSchema).role, roleFromValue(groupExtension.defaultRole, defaultRole(options)));
  const memberStatus = statusFromActive(member.active);
  return {
    externalId,
    email,
    name: asString(member.display) || email.split("@")[0],
    organization: organizationFromResource(group, options),
    status: scope.scopeMemberStatusToGroup ? "active" : memberStatus,
    sso: {
      provider: defaultSsoProvider(options),
      subject: externalId
    },
    memberships: [{
      teamExternalId: asString(group.externalId) || asString(group.id) || asString(group.displayName),
      teamName: asString(group.displayName),
      role,
      status: memberStatus
    }]
  };
}

function buildProvisioningInputFromScimGroup(resource: JsonRecord, options: SenaScimProvisioningOptions, scope: ScimGroupProvisioningScope = {}): SenaEnterpriseProvisioningInput {
  const displayName = asString(resource.displayName);
  if (!displayName) {
    throw new SenaEnterpriseError("SCIM Group requires displayName.", 400, "invalid_scim_group_display_name");
  }
  const groupExtension = extension(resource, senaScimGroupExtensionSchema);
  const team: SenaEnterpriseProvisioningTeamInput = {
    externalId: asString(resource.externalId) || asString(resource.id) || displayName,
    name: displayName,
    organization: organizationFromResource(resource, options),
    plan: groupExtension.plan === "individual" || groupExtension.plan === "lab" || groupExtension.plan === "enterprise"
      ? groupExtension.plan
      : "enterprise"
  };
  return {
    source: "scim",
    organization: organizationFromResource(resource, options),
    dryRun: Boolean(options.dryRun),
    teams: [team],
    users: asArray(resource.members)
      .map(asRecord)
      .map((member) => memberUserFromGroupMember(member, resource, options, scope))
      .filter((user): user is SenaEnterpriseProvisioningUserInput => Boolean(user))
  };
}

export function provisionEnterpriseScimUser(resourceInput: unknown, options: SenaScimProvisioningOptions = {}): SenaScimProvisioningBridgeResult {
  const resource = asRecord(resourceInput);
  const user = buildProvisioningUserFromScim(resource, options);
  const teams = dedupeTeams((user.memberships ?? [])
    .map(teamInputFromMembership)
    .filter((team): team is SenaEnterpriseProvisioningTeamInput => Boolean(team)));
  const provisioning = provisionEnterpriseOrganization({
    source: "scim",
    organization: user.organization ?? organizationFromResource(resource, options),
    dryRun: Boolean(options.dryRun),
    teams,
    users: [user]
  });
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.scimProvisioningBridge,
    resourceType: "User",
    generatedAt: provisioning.generatedAt,
    organization: provisioning.organization,
    dryRun: provisioning.dryRun,
    provisioning,
    resource: scimUserResponse(resource, provisioning, options)
  };
}

function provisionScimGroupResource(resource: JsonRecord, options: SenaScimProvisioningOptions, scope: ScimGroupProvisioningScope): SenaScimProvisioningBridgeResult {
  const input = buildProvisioningInputFromScimGroup(resource, options, scope);
  const provisioning = provisionEnterpriseOrganization(input);
  const group = provisioning.teams[0];
  const id = group?.id ?? asString(resource.id) ?? asString(resource.externalId) ?? asString(resource.displayName);
  const location = options.locationBase ? `${options.locationBase.replace(/\/$/, "")}/Groups/${encodeURIComponent(id)}` : undefined;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.scimProvisioningBridge,
    resourceType: "Group",
    generatedAt: provisioning.generatedAt,
    organization: provisioning.organization,
    dryRun: provisioning.dryRun,
    provisioning,
    resource: {
      schemas: [scimCoreGroupSchema, senaScimGroupExtensionSchema],
      id,
      externalId: group?.externalId ?? (asString(resource.externalId) || asString(resource.id) || asString(resource.displayName)),
      displayName: group?.name ?? asString(resource.displayName),
      members: provisioning.memberships.map((membership) => ({
        value: membership.userId,
        type: membership.role,
        active: membership.status === "active"
      })),
      meta: {
        resourceType: "Group",
        created: provisioning.generatedAt,
        lastModified: provisioning.generatedAt,
        location
      },
      [senaScimGroupExtensionSchema]: {
        organization: provisioning.organization,
        provisioningSchema: provisioning.schemaVersion,
        summary: provisioning.summary
      }
    }
  };
}

export function provisionEnterpriseScimGroup(resourceInput: unknown, options: SenaScimProvisioningOptions = {}): SenaScimProvisioningBridgeResult {
  return provisionScimGroupResource(asRecord(resourceInput), options, {});
}

export function enterpriseScimServiceProviderConfig(
  locationBase?: string,
  extensions: JsonRecord = {}
) {
  return {
    schemas: [
      "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
      ...Object.keys(extensions)
    ],
    schemaVersion: SENA_SCHEMA_VERSIONS.scimServiceProviderConfig,
    documentationUri: "/api/sena/scim/v2/ServiceProviderConfig",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: false, maxResults: 0 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{
      type: "oauthbearertoken",
      name: "Bearer provisioning token",
      description: "Use SENA_PROVISIONING_TOKEN in the Authorization bearer header.",
      specUri: "https://datatracker.ietf.org/doc/html/rfc7644",
      primary: true
    }],
    resources: {
      Users: `${locationBase ?? ""}/Users`,
      Groups: `${locationBase ?? ""}/Groups`
    },
    supportedSchemas: [
      scimCoreUserSchema,
      scimCoreGroupSchema,
      scimEnterpriseUserSchema,
      senaScimUserExtensionSchema,
      senaScimGroupExtensionSchema,
      ...Object.keys(extensions)
    ],
    ...extensions
  };
}

function listResponse(resources: JsonRecord[]) {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources
  };
}

function directoryUserToScim(user: SenaEnterpriseProvisioningDirectory["users"][number], locationBase?: string): JsonRecord {
  const location = locationBase ? `${locationBase.replace(/\/$/, "")}/Users/${encodeURIComponent(user.id)}` : undefined;
  return {
    schemas: [scimCoreUserSchema, scimEnterpriseUserSchema, senaScimUserExtensionSchema],
    id: user.id,
    externalId: user.externalId,
    userName: user.email,
    name: { formatted: user.name },
    active: user.memberships.some((membership) => membership.status === "active"),
    emails: [{ value: user.email, primary: true }],
    groups: user.memberships.map((membership) => ({
      value: membership.teamExternalId ?? membership.teamId,
      display: membership.teamName,
      type: membership.role
    })),
    meta: {
      resourceType: "User",
      lastModified: new Date().toISOString(),
      location
    },
    [senaScimUserExtensionSchema]: {
      organization: user.organization,
      ssoSubjects: user.ssoSubjects,
      memberships: user.memberships.map((membership) => ({
        teamId: membership.teamId,
        teamExternalId: membership.teamExternalId,
        teamName: membership.teamName,
        role: membership.role,
        status: membership.status
      }))
    }
  };
}

function directoryUserToScimProvisioningPayload(user: SenaEnterpriseProvisioningDirectory["users"][number]): JsonRecord {
  return {
    schemas: [scimCoreUserSchema, scimEnterpriseUserSchema, senaScimUserExtensionSchema],
    id: user.id,
    externalId: user.externalId ?? user.id,
    userName: user.email,
    active: user.memberships.some((membership) => membership.status === "active"),
    name: { formatted: user.name },
    emails: [{ value: user.email, primary: true }],
    [senaScimUserExtensionSchema]: {
      organization: user.organization,
      memberships: user.memberships.map((membership) => ({
        teamId: membership.teamId,
        teamExternalId: membership.teamExternalId,
        teamName: membership.teamName,
        role: membership.role,
        status: membership.status,
        active: membership.status === "active"
      }))
    }
  };
}

function replaceScimPath(resource: JsonRecord, path: string, value: unknown) {
  const normalizedPath = path.trim().toLowerCase();
  if (normalizedPath === "active") {
    resource.active = value === false ? false : true;
    if (value === false) {
      resource.groups = [];
      const senaExtension = { ...extension(resource, senaScimUserExtensionSchema), memberships: [] };
      resource[senaScimUserExtensionSchema] = senaExtension;
    }
    return;
  }
  if (normalizedPath === "username") {
    resource.userName = value;
    return;
  }
  if (normalizedPath === "emails") {
    resource.emails = value;
    return;
  }
  if (normalizedPath === "name") {
    resource.name = value;
    return;
  }
  if (normalizedPath === "groups") {
    resource.groups = value;
    return;
  }
  if (normalizedPath === `${senaScimUserExtensionSchema.toLowerCase()}.memberships` || normalizedPath.endsWith(":user.memberships") || normalizedPath === "memberships") {
    const senaExtension = { ...extension(resource, senaScimUserExtensionSchema), memberships: value };
    resource[senaScimUserExtensionSchema] = senaExtension;
    return;
  }
  throw new SenaEnterpriseError(`Unsupported SCIM PatchOp path: ${path}`, 400, "unsupported_scim_patch_path");
}

function applyScimPatchOperations(resource: JsonRecord, patchInput: unknown) {
  const patch = asRecord(patchInput);
  const operations = asArray(patch.Operations ?? patch.operations).map(asRecord);
  if (operations.length === 0) {
    throw new SenaEnterpriseError("SCIM PatchOp requires at least one operation.", 400, "invalid_scim_patch");
  }
  for (const operation of operations) {
    const op = asString(operation.op || "replace").toLowerCase();
    if (op !== "replace" && op !== "add") {
      throw new SenaEnterpriseError(`Unsupported SCIM PatchOp operation: ${op}`, 400, "unsupported_scim_patch_operation");
    }
    const path = asString(operation.path);
    if (path) {
      replaceScimPath(resource, path, operation.value);
      continue;
    }
    const value = asRecord(operation.value);
    for (const [key, entryValue] of Object.entries(value)) {
      resource[key] = entryValue;
    }
  }
  return resource;
}

function directoryGroupToScim(team: SenaEnterpriseProvisioningDirectory["teams"][number], locationBase?: string): JsonRecord {
  const location = locationBase ? `${locationBase.replace(/\/$/, "")}/Groups/${encodeURIComponent(team.id)}` : undefined;
  return {
    schemas: [scimCoreGroupSchema, senaScimGroupExtensionSchema],
    id: team.id,
    externalId: team.externalId,
    displayName: team.name,
    members: team.members.map((member) => ({
      value: member.userExternalId ?? member.userId,
      display: member.display,
      type: member.role,
      active: member.status === "active"
    })),
    meta: {
      resourceType: "Group",
      lastModified: new Date().toISOString(),
      location
    },
    [senaScimGroupExtensionSchema]: {
      organization: team.organization,
      plan: team.plan
    }
  };
}

export function listEnterpriseScimUsers(locationBase?: string) {
  const directory = listEnterpriseProvisioningDirectory("scim");
  return {
    ...listResponse(directory.users.map((user) => directoryUserToScim(user, locationBase))),
    schemaVersion: SENA_SCHEMA_VERSIONS.scimUsersList,
    directorySchemaVersion: directory.schemaVersion
  };
}

export function listEnterpriseScimGroups(locationBase?: string) {
  const directory = listEnterpriseProvisioningDirectory("scim");
  return {
    ...listResponse(directory.teams.map((team) => directoryGroupToScim(team, locationBase))),
    schemaVersion: SENA_SCHEMA_VERSIONS.scimGroupsList,
    directorySchemaVersion: directory.schemaVersion
  };
}

export function patchEnterpriseScimUser(resourceId: string, patchInput: unknown, options: SenaScimProvisioningOptions = {}): SenaScimProvisioningBridgeResult {
  const directory = listEnterpriseProvisioningDirectory("scim");
  const user = directory.users.find((candidate) => candidate.id === resourceId || candidate.externalId === resourceId);
  if (!user) {
    throw new SenaEnterpriseError("SCIM User was not found for PatchOp.", 404, "scim_user_not_found");
  }
  const patchedResource = applyScimPatchOperations(directoryUserToScimProvisioningPayload(user), patchInput);
  return provisionEnterpriseScimUser(patchedResource, options);
}

function directoryGroupToScimProvisioningPayload(
  team: SenaEnterpriseProvisioningDirectory["teams"][number],
  directory: SenaEnterpriseProvisioningDirectory
): JsonRecord {
  const userById = new Map(directory.users.map((user) => [user.id, user]));
  return {
    schemas: [scimCoreGroupSchema, senaScimGroupExtensionSchema],
    id: team.id,
    externalId: team.externalId ?? team.id,
    displayName: team.name,
    members: team.members.map((member) => {
      const user = userById.get(member.userId);
      return {
        value: member.userExternalId ?? member.userId,
        email: user?.email ?? "",
        display: member.display,
        type: member.role,
        active: member.status === "active"
      };
    }),
    [senaScimGroupExtensionSchema]: {
      organization: team.organization,
      plan: team.plan
    }
  };
}

// IdPs address a member by whichever id they saw first — the SCIM resource id,
// the externalId, or the userName — so every reference is resolved through the
// provisioned directory before it is matched or provisioned.
type ScimGroupMemberDirectory = {
  aliasKeys(reference: string): string[];
  canonicalKey(reference: string): string;
  member(reference: JsonRecord, fallbackRole: SenaEnterpriseRole): JsonRecord;
};

function scimGroupMemberDirectory(directory: SenaEnterpriseProvisioningDirectory): ScimGroupMemberDirectory {
  const index = new Map<string, SenaEnterpriseProvisioningDirectory["users"][number]>();
  for (const user of directory.users) {
    for (const alias of [user.id, user.externalId, user.email]) {
      const key = asString(alias).toLowerCase();
      if (key) index.set(key, user);
    }
  }
  const lookup = (reference: string) => index.get(reference.trim().toLowerCase());
  return {
    aliasKeys(reference) {
      const user = lookup(reference);
      if (!user) return [reference.trim().toLowerCase()].filter(Boolean);
      return [user.id, user.externalId, user.email].map((alias) => asString(alias).toLowerCase()).filter(Boolean);
    },
    canonicalKey(reference) {
      return (lookup(reference)?.id ?? reference.trim()).toLowerCase();
    },
    member(reference, fallbackRole) {
      const raw = asString(reference.value) || asString(reference.email) || asString(reference.display);
      const user = lookup(raw);
      const email = asString(reference.email) || user?.email || (raw.includes("@") ? raw : "");
      if (!email.includes("@")) {
        throw new SenaEnterpriseError(
          `SCIM Group member "${raw}" is not a provisioned user.`,
          400,
          "scim_group_member_not_found"
        );
      }
      return {
        value: user?.externalId ?? user?.id ?? raw ?? email,
        email,
        display: asString(reference.display) || user?.name || email.split("@")[0],
        type: roleFromValue(reference.role ?? reference.type, fallbackRole),
        active: reference.active !== false
      };
    }
  };
}

function scimGroupMemberKey(member: JsonRecord, members: ScimGroupMemberDirectory) {
  return members.canonicalKey(asString(member.value) || asString(member.email));
}

function scimGroupMemberReferences(value: unknown) {
  if (Array.isArray(value)) return value.map(asRecord);
  return isRecord(value) ? [value] : [];
}

function parseScimGroupPatchPath(path: string) {
  const filtered = /^([^[\]]+)\[\s*value\s+eq\s+["']([^"']+)["']\s*\]$/i.exec(path.trim());
  if (filtered) return { attribute: filtered[1], filterValue: filtered[2] };
  if (path.includes("[")) {
    throw new SenaEnterpriseError(`Unsupported SCIM PatchOp path filter: ${path}`, 400, "unsupported_scim_patch_path");
  }
  return { attribute: path, filterValue: undefined };
}

// Provisioning is additive, so a removed member has to stay in the payload as
// an inactive entry — dropping it silently would leave the stored membership
// untouched and the IdP's removal would never land.
function patchScimGroupMembers(
  current: JsonRecord[],
  op: string,
  value: unknown,
  filterValue: string | undefined,
  members: ScimGroupMemberDirectory,
  fallbackRole: SenaEnterpriseRole
) {
  if (op === "remove") {
    const targets = new Set<string>();
    for (const reference of [filterValue, ...scimGroupMemberReferences(value).map((entry) => asString(entry.value) || asString(entry.email))]) {
      for (const alias of members.aliasKeys(asString(reference))) targets.add(alias);
    }
    return current.map((member) => {
      const aliases = members.aliasKeys(asString(member.value) || asString(member.email));
      const matched = targets.size === 0 || aliases.some((alias) => targets.has(alias));
      return matched ? { ...member, active: false } : member;
    });
  }

  const incoming = scimGroupMemberReferences(value).map((reference) => members.member(
    filterValue && !asString(reference.value) ? { ...reference, value: filterValue } : reference,
    fallbackRole
  ));
  if (filterValue && incoming.length === 0) {
    throw new SenaEnterpriseError("SCIM Group PatchOp member operation requires a value.", 400, "invalid_scim_patch");
  }
  const incomingKeys = new Set(incoming.map((member) => scimGroupMemberKey(member, members)));
  const retained = current
    .filter((member) => !incomingKeys.has(scimGroupMemberKey(member, members)))
    // A pathless/unfiltered replace is a full member-list replacement: everyone
    // the IdP left out is no longer a member.
    .map((member) => (op === "replace" && !filterValue ? { ...member, active: false } : member));
  return [...retained, ...incoming];
}

function applyScimGroupPatchAttribute(
  resource: JsonRecord,
  attribute: string,
  op: string,
  value: unknown,
  filterValue: string | undefined,
  members: ScimGroupMemberDirectory,
  fallbackRole: SenaEnterpriseRole
) {
  const normalizedAttribute = attribute.trim().toLowerCase();
  if (normalizedAttribute === "members") {
    resource.members = patchScimGroupMembers(asArray(resource.members).map(asRecord), op, value, filterValue, members, fallbackRole);
    return;
  }
  if (normalizedAttribute === "displayname") {
    if (op === "remove") {
      throw new SenaEnterpriseError("SCIM Group displayName cannot be removed.", 400, "invalid_scim_group_display_name");
    }
    const displayName = asString(value);
    if (!displayName) {
      throw new SenaEnterpriseError("SCIM Group requires displayName.", 400, "invalid_scim_group_display_name");
    }
    resource.displayName = displayName;
    return;
  }
  throw new SenaEnterpriseError(`Unsupported SCIM PatchOp path: ${attribute}`, 400, "unsupported_scim_patch_path");
}

function applyScimGroupPatchOperations(
  resource: JsonRecord,
  patchInput: unknown,
  members: ScimGroupMemberDirectory,
  fallbackRole: SenaEnterpriseRole
) {
  const patch = asRecord(patchInput);
  const operations = asArray(patch.Operations ?? patch.operations).map(asRecord);
  if (operations.length === 0) {
    throw new SenaEnterpriseError("SCIM PatchOp requires at least one operation.", 400, "invalid_scim_patch");
  }
  for (const operation of operations) {
    const op = asString(operation.op || "replace").toLowerCase();
    if (op !== "replace" && op !== "add" && op !== "remove") {
      throw new SenaEnterpriseError(`Unsupported SCIM PatchOp operation: ${op}`, 400, "unsupported_scim_patch_operation");
    }
    const path = asString(operation.path);
    if (!path) {
      if (op === "remove") {
        throw new SenaEnterpriseError("SCIM PatchOp remove requires a path.", 400, "invalid_scim_patch");
      }
      for (const [key, entryValue] of Object.entries(asRecord(operation.value))) {
        applyScimGroupPatchAttribute(resource, key, op, entryValue, undefined, members, fallbackRole);
      }
      continue;
    }
    const { attribute, filterValue } = parseScimGroupPatchPath(path);
    applyScimGroupPatchAttribute(resource, attribute, op, operation.value, filterValue, members, fallbackRole);
  }
  return resource;
}

export function patchEnterpriseScimGroup(resourceId: string, patchInput: unknown, options: SenaScimProvisioningOptions = {}): SenaScimProvisioningBridgeResult {
  const directory = listEnterpriseProvisioningDirectory("scim");
  const team = directory.teams.find((candidate) => candidate.id === resourceId || candidate.externalId === resourceId);
  if (!team) {
    throw new SenaEnterpriseError("SCIM Group was not found for PatchOp.", 404, "scim_group_not_found");
  }
  const payload = directoryGroupToScimProvisioningPayload(team, directory);
  const fallbackRole = roleFromValue(extension(payload, senaScimGroupExtensionSchema).defaultRole, defaultRole(options));
  const patchedResource = applyScimGroupPatchOperations(
    payload,
    patchInput,
    scimGroupMemberDirectory(directory),
    fallbackRole
  );
  return provisionScimGroupResource(patchedResource, options, { scopeMemberStatusToGroup: true });
}
