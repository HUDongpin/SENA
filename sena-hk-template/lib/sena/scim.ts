import {
  listEnterpriseProvisioningDirectory,
  provisionEnterpriseOrganization,
  SenaEnterpriseError,
  type SenaEnterpriseProvisioningDirectory,
  type SenaEnterpriseProvisioningInput,
  type SenaEnterpriseProvisioningMembershipInput,
  type SenaEnterpriseProvisioningResult,
  type SenaEnterpriseProvisioningTeamInput,
  type SenaEnterpriseProvisioningUserInput,
  type SenaEnterpriseRole,
  type SenaEnterpriseSsoProvider
} from "./enterprise";

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
  schemaVersion: "sena-scim-provisioning-bridge/v1";
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

function memberUserFromGroupMember(member: JsonRecord, group: JsonRecord, options: SenaScimProvisioningOptions): SenaEnterpriseProvisioningUserInput | undefined {
  const email = asString(member.email) || (asString(member.value).includes("@") ? asString(member.value) : "");
  if (!email.includes("@")) return undefined;
  const groupExtension = extension(group, senaScimGroupExtensionSchema);
  const externalId = asString(member.externalId) || asString(member.value) || email;
  const role = roleFromValue(member.role ?? member.type ?? extension(member, senaScimGroupExtensionSchema).role, roleFromValue(groupExtension.defaultRole, defaultRole(options)));
  return {
    externalId,
    email,
    name: asString(member.display) || email.split("@")[0],
    organization: organizationFromResource(group, options),
    status: statusFromActive(member.active),
    sso: {
      provider: defaultSsoProvider(options),
      subject: externalId
    },
    memberships: [{
      teamExternalId: asString(group.externalId) || asString(group.id) || asString(group.displayName),
      teamName: asString(group.displayName),
      role,
      status: statusFromActive(member.active)
    }]
  };
}

function buildProvisioningInputFromScimGroup(resource: JsonRecord, options: SenaScimProvisioningOptions): SenaEnterpriseProvisioningInput {
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
      .map((member) => memberUserFromGroupMember(member, resource, options))
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
    schemaVersion: "sena-scim-provisioning-bridge/v1",
    resourceType: "User",
    generatedAt: provisioning.generatedAt,
    organization: provisioning.organization,
    dryRun: provisioning.dryRun,
    provisioning,
    resource: scimUserResponse(resource, provisioning, options)
  };
}

export function provisionEnterpriseScimGroup(resourceInput: unknown, options: SenaScimProvisioningOptions = {}): SenaScimProvisioningBridgeResult {
  const resource = asRecord(resourceInput);
  const input = buildProvisioningInputFromScimGroup(resource, options);
  const provisioning = provisionEnterpriseOrganization(input);
  const group = provisioning.teams[0];
  const id = group?.id ?? asString(resource.id) ?? asString(resource.externalId) ?? asString(resource.displayName);
  const location = options.locationBase ? `${options.locationBase.replace(/\/$/, "")}/Groups/${encodeURIComponent(id)}` : undefined;
  return {
    schemaVersion: "sena-scim-provisioning-bridge/v1",
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

export function enterpriseScimServiceProviderConfig(
  locationBase?: string,
  extensions: JsonRecord = {}
) {
  return {
    schemas: [
      "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
      ...Object.keys(extensions)
    ],
    schemaVersion: "sena-scim-service-provider-config/v1",
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
    schemaVersion: "sena-scim-users-list/v1",
    directorySchemaVersion: directory.schemaVersion
  };
}

export function listEnterpriseScimGroups(locationBase?: string) {
  const directory = listEnterpriseProvisioningDirectory("scim");
  return {
    ...listResponse(directory.teams.map((team) => directoryGroupToScim(team, locationBase))),
    schemaVersion: "sena-scim-groups-list/v1",
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
