import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const senaScimIdentityProductionExtensionSchema = "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig";
const senaScimUserExtensionSchema = "urn:sena:params:scim:schemas:extension:enterprise:2.0:User";
const senaScimGroupExtensionSchema = "urn:sena:params:scim:schemas:extension:enterprise:2.0:Group";

type ScimGroupMember = { value?: string; type?: string; active?: boolean };
type ScimGroupResource = {
  id?: string;
  externalId?: string;
  displayName?: string;
  members?: ScimGroupMember[];
  [senaScimGroupExtensionSchema]?: { organization?: string; plan?: string; defaultRole?: string };
};
type ScimUserResource = { id?: string; userName?: string; externalId?: string; active?: boolean };
type ScimListResponse<Resource> = {
  totalResults?: number;
  startIndex?: number;
  itemsPerPage?: number;
  Resources?: Resource[];
};
type ScimErrorBody = {
  schemas?: string[];
  status?: string;
  scimType?: string;
  detail?: string;
  senaCode?: string;
  Resources?: unknown;
  totalResults?: unknown;
};

describe("SENA SCIM route production ownership gate", () => {
  it("returns SCIM/IdP ownership and rotation headers on ServiceProviderConfig", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-scim-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_PROVISIONING_TOKEN", "sena-test-provisioning-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/provisioning-auth", async () => await import("../provisioning-auth"));
    vi.doMock("@/lib/sena/scim", async () => await import("../scim"));

    try {
      const enterprise = await import("../enterprise");
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const provisioningRequest = identityEvidence.platformRequestPacket.requests
        .find((request) => request.decisionId === "institution-provisioning-owner");
      const route = await import("../../../app/api/sena/scim/v2/ServiceProviderConfig/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/scim/v2/ServiceProviderConfig", {
        headers: {
          authorization: "Bearer sena-test-provisioning-token"
        }
      }));
      const body = await response.json() as {
        schemaVersion?: string;
        schemas?: string[];
        supportedSchemas?: string[];
        [senaScimIdentityProductionExtensionSchema]?: {
          schemaVersion?: string;
          status?: string;
          provisioningOwnerGate?: string;
          releaseGateBlocked?: boolean;
          missingEvidenceIds?: string[];
          missingTechnicalPrerequisiteEvidenceIds?: string[];
          institutionActionPlan?: {
            digest?: string;
            summary?: {
              blockingLanes?: number;
              readyLanes?: number;
              submissionPath?: string;
            };
          };
          platformDecisionSubmission?: {
            method?: string;
            path?: string;
          };
          redaction?: {
            secretValuesExcluded?: boolean;
            evidenceUrlValuesExcluded?: boolean;
            ownerNamesExcluded?: boolean;
          };
        };
      };
      const identityExtension = body[senaScimIdentityProductionExtensionSchema];

      expect(response.status).toBe(200);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-scim-service-provider-config");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.schemaVersion).toBe("sena-scim-service-provider-config/v1");
      expect(body.schemas).toContain(senaScimIdentityProductionExtensionSchema);
      expect(body.supportedSchemas).toContain(senaScimIdentityProductionExtensionSchema);
      expect(identityExtension).toEqual(expect.objectContaining({
        schemaVersion: "sena-scim-identity-production-gate/v1",
        status: identityEvidence.status,
        provisioningOwnerGate: identityEvidence.status,
        releaseGateBlocked: identityEvidence.releaseGate.approvalBlocked,
        missingEvidenceIds: provisioningRequest?.missingProductionEvidenceIds ?? [],
        missingTechnicalPrerequisiteEvidenceIds: provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds ?? [],
        platformDecisionSubmission: expect.objectContaining({
          method: identityEvidence.platformRequestPacket.submission.method,
          path: identityEvidence.platformRequestPacket.submission.path
        }),
        redaction: {
          secretValuesExcluded: true,
          evidenceUrlValuesExcluded: true,
          ownerNamesExcluded: true
        }
      }));
      expect(identityExtension?.institutionActionPlan).toEqual(expect.objectContaining({
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          blockingLanes: identityEvidence.institutionActionPlan.summary.blockingLanes,
          readyLanes: identityEvidence.institutionActionPlan.summary.readyLanes,
          submissionPath: identityEvidence.institutionActionPlan.summary.submissionPath
        })
      }));
      expect(JSON.stringify(identityExtension)).not.toContain("sena-test-provisioning-token");
      expect(JSON.stringify(identityExtension)).not.toContain("https://<institution-evidence-host>");
      expect(response.headers.get("x-sena-scim-production-owner-gate")).toBe(identityEvidence.status);
      expect(response.headers.get("x-sena-identity-production-status")).toBe(identityEvidence.status);
      expect(response.headers.get("x-sena-identity-release-gate-blocked")).toBe(String(identityEvidence.releaseGate.approvalBlocked));
      expect(response.headers.get("x-sena-identity-provisioning-missing-evidence"))
        .toBe(provisioningRequest?.missingProductionEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-identity-provisioning-missing-technical-prerequisites"))
        .toBe(provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-identity-lifecycle-owner-mode")).toBe("review");
      expect(response.headers.get("x-sena-identity-rotation-freshness")).toBe(identityEvidence.rotationFreshness.status);
      expect(response.headers.get("x-sena-identity-institution-action-plan-digest")).toMatch(/^[a-f0-9]{64}$/);
      expect(response.headers.get("x-sena-identity-institution-action-plan-blocking-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.blockingLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-ready-lanes"))
        .toBe(String(identityEvidence.institutionActionPlan.summary.readyLanes));
      expect(response.headers.get("x-sena-identity-institution-action-plan-submission-path"))
        .toBe(identityEvidence.institutionActionPlan.summary.submissionPath);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});

describe("SENA SCIM Groups resource PatchOp", () => {
  it("applies IdP membership PatchOp bodies and keeps unmentioned group state", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-scim-groups-patch-"));
    vi.resetModules();
    vi.stubEnv("SENA_PROVISIONING_TOKEN", "sena-test-provisioning-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/provisioning-auth", async () => await import("../provisioning-auth"));
    vi.doMock("@/lib/sena/scim", async () => await import("../scim"));

    const groupsBase = "https://sena.example.test/api/sena/scim/v2/Groups";
    const scimHeaders = {
      authorization: "Bearer sena-test-provisioning-token",
      "content-type": "application/scim+json"
    };
    const patchRequest = (groupId: string, body: unknown) => new Request(`${groupsBase}/${groupId}`, {
      method: "PATCH",
      headers: scimHeaders,
      body: JSON.stringify(body)
    });

    try {
      const groupsRoute = await import("../../../app/api/sena/scim/v2/Groups/route");
      const usersRoute = await import("../../../app/api/sena/scim/v2/Users/route");
      const groupResourceRoute = await import("../../../app/api/sena/scim/v2/Groups/[resourceId]/route");

      const created = await groupsRoute.POST(new Request(groupsBase, {
        method: "POST",
        headers: scimHeaders,
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group", senaScimGroupExtensionSchema],
          displayName: "Genomics Cohort",
          externalId: "okta-group-genomics",
          [senaScimGroupExtensionSchema]: {
            organization: "SENA Patch Org",
            plan: "enterprise",
            defaultRole: "coder"
          },
          members: [
            { value: "okta-user-pi", email: "patch-pi@example.edu", display: "Patch PI", type: "pi" },
            { value: "okta-user-coder", email: "patch-coder@example.edu", display: "Patch Coder", type: "coder" }
          ]
        })
      }));
      const createdGroup = await created.json() as ScimGroupResource;
      expect(created.status).toBe(201);
      const groupId = String(createdGroup.id);
      const piMemberId = String(createdGroup.members?.find((member) => member.type === "pi")?.value);
      const coderMemberId = String(createdGroup.members?.find((member) => member.type === "coder")?.value);
      expect(piMemberId).not.toBe("undefined");
      expect(coderMemberId).not.toBe("undefined");

      const analystCreated = await usersRoute.POST(new Request("https://sena.example.test/api/sena/scim/v2/Users", {
        method: "POST",
        headers: scimHeaders,
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", senaScimUserExtensionSchema],
          userName: "patch-analyst@example.edu",
          externalId: "okta-user-analyst",
          name: { formatted: "Patch Analyst" },
          emails: [{ value: "patch-analyst@example.edu", primary: true }],
          [senaScimUserExtensionSchema]: { organization: "SENA Patch Org" }
        })
      }));
      const analystId = String((await analystCreated.json() as { id?: string }).id);
      expect(analystCreated.status).toBe(201);

      const added = await groupResourceRoute.PATCH(patchRequest(groupId, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{
          op: "add",
          path: "members",
          value: [{ value: analystId, display: "patch-analyst@example.edu" }]
        }]
      }), { params: Promise.resolve({ resourceId: groupId }) });
      const addedGroup = await added.json() as ScimGroupResource;

      expect(added.status).toBe(200);
      expect(added.headers.get("x-sena-observed-route")).toBe("sena-scim-groups-resource");
      expect(added.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(addedGroup.id).toBe(groupId);
      expect(addedGroup.displayName).toBe("Genomics Cohort");
      expect(addedGroup.members).toEqual(expect.arrayContaining([
        // A member added without an explicit role lands on the group's stored
        // defaultRole. A PatchOp body carries no group extension of its own, so
        // this only holds because the team persists the default the POST set.
        expect.objectContaining({ value: analystId, type: "coder", active: true }),
        expect.objectContaining({ value: piMemberId, type: "pi", active: true }),
        expect.objectContaining({ value: coderMemberId, type: "coder", active: true })
      ]));

      const removed = await groupResourceRoute.PATCH(patchRequest(groupId, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "remove", path: `members[value eq "${coderMemberId}"]` }]
      }), { params: Promise.resolve({ resourceId: groupId }) });
      const removedGroup = await removed.json() as ScimGroupResource;

      expect(removed.status).toBe(200);
      expect(removedGroup.displayName).toBe("Genomics Cohort");
      expect(removedGroup.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: coderMemberId, active: false }),
        expect.objectContaining({ value: piMemberId, active: true }),
        expect.objectContaining({ value: analystId, active: true })
      ]));

      const renamed = await groupResourceRoute.PATCH(patchRequest(groupId, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "Replace", path: "displayName", value: "Genomics Cohort (Renamed)" }]
      }), { params: Promise.resolve({ resourceId: groupId }) });
      const renamedGroup = await renamed.json() as ScimGroupResource;

      expect(renamed.status).toBe(200);
      expect(renamedGroup.id).toBe(groupId);
      expect(renamedGroup.displayName).toBe("Genomics Cohort (Renamed)");
      expect(renamedGroup.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: piMemberId, type: "pi", active: true }),
        expect.objectContaining({ value: analystId, active: true })
      ]));

      const listed = await groupsRoute.GET(new Request(groupsBase, { headers: scimHeaders }));
      const directory = await listed.json() as { Resources: ScimGroupResource[] };
      const storedGroup = directory.Resources.find((resource) => resource.id === groupId);
      expect(storedGroup?.displayName).toBe("Genomics Cohort (Renamed)");
      expect(storedGroup?.members?.filter((member) => member.active)).toHaveLength(2);
      // The default a PatchOp-added member inherits has to be readable, or an
      // IdP operator cannot tell which role their next `add` will grant.
      expect(storedGroup?.[senaScimGroupExtensionSchema]?.defaultRole).toBe("coder");
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("scopes a PatchOp member removal to the patched group", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-scim-groups-scope-"));
    vi.resetModules();
    vi.stubEnv("SENA_PROVISIONING_TOKEN", "sena-test-provisioning-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/provisioning-auth", async () => await import("../provisioning-auth"));
    vi.doMock("@/lib/sena/scim", async () => await import("../scim"));

    const groupsBase = "https://sena.example.test/api/sena/scim/v2/Groups";
    const scimHeaders = {
      authorization: "Bearer sena-test-provisioning-token",
      "content-type": "application/scim+json"
    };

    try {
      const groupsRoute = await import("../../../app/api/sena/scim/v2/Groups/route");
      const groupResourceRoute = await import("../../../app/api/sena/scim/v2/Groups/[resourceId]/route");
      const seedGroup = async (displayName: string, externalId: string) => {
        const response = await groupsRoute.POST(new Request(groupsBase, {
          method: "POST",
          headers: scimHeaders,
          body: JSON.stringify({
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group", senaScimGroupExtensionSchema],
            displayName,
            externalId,
            [senaScimGroupExtensionSchema]: { organization: "SENA Scope Org", plan: "enterprise" },
            members: [
              { value: `${externalId}-pi`, email: `${externalId}-pi@example.edu`, display: "Scope PI", type: "pi" },
              { value: "okta-shared-coder", email: "shared-coder@example.edu", display: "Shared Coder", type: "coder" }
            ]
          })
        }));
        return await response.json() as ScimGroupResource;
      };

      const firstGroup = await seedGroup("Scope Cohort A", "okta-group-scope-a");
      const secondGroup = await seedGroup("Scope Cohort B", "okta-group-scope-b");
      const sharedMemberId = String(firstGroup.members?.find((member) => member.type === "coder")?.value);
      expect(secondGroup.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: sharedMemberId, active: true })
      ]));

      const removed = await groupResourceRoute.PATCH(new Request(`${groupsBase}/${firstGroup.id}`, {
        method: "PATCH",
        headers: scimHeaders,
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "remove", path: "members", value: [{ value: sharedMemberId }] }]
        })
      }), { params: Promise.resolve({ resourceId: String(firstGroup.id) }) });
      expect(removed.status).toBe(200);
      expect((await removed.json() as ScimGroupResource).members).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: sharedMemberId, active: false })
      ]));

      const listed = await groupsRoute.GET(new Request(groupsBase, { headers: scimHeaders }));
      const directory = await listed.json() as { Resources: ScimGroupResource[] };
      // The directory listing keys members by externalId where one is known,
      // while the provisioning response keys them by the internal user id.
      const sharedMember = (group?: ScimGroupResource) => group?.members
        ?.find((member) => member.value === sharedMemberId || member.value === "okta-shared-coder");
      const storedFirst = directory.Resources.find((resource) => resource.id === firstGroup.id);
      const storedSecond = directory.Resources.find((resource) => resource.id === secondGroup.id);
      expect(sharedMember(storedFirst)?.active).toBe(false);
      expect(sharedMember(storedSecond)?.active).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("keeps PUT on a Groups resource a full-resource replace", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-scim-groups-put-"));
    vi.resetModules();
    vi.stubEnv("SENA_PROVISIONING_TOKEN", "sena-test-provisioning-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/provisioning-auth", async () => await import("../provisioning-auth"));
    vi.doMock("@/lib/sena/scim", async () => await import("../scim"));

    const groupsBase = "https://sena.example.test/api/sena/scim/v2/Groups";
    const scimHeaders = {
      authorization: "Bearer sena-test-provisioning-token",
      "content-type": "application/scim+json"
    };

    try {
      const groupResourceRoute = await import("../../../app/api/sena/scim/v2/Groups/[resourceId]/route");
      const replaced = await groupResourceRoute.PUT(new Request(`${groupsBase}/okta-group-put`, {
        method: "PUT",
        headers: scimHeaders,
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group", senaScimGroupExtensionSchema],
          displayName: "Replaced Cohort",
          externalId: "okta-group-put",
          [senaScimGroupExtensionSchema]: { organization: "SENA Patch Org", plan: "enterprise" },
          members: [
            { value: "okta-put-pi", email: "put-pi@example.edu", display: "Put PI", type: "pi" }
          ]
        })
      }), { params: Promise.resolve({ resourceId: "okta-group-put" }) });
      const replacedGroup = await replaced.json() as ScimGroupResource;

      expect(replaced.status).toBe(200);
      expect(replacedGroup.displayName).toBe("Replaced Cohort");
      expect(replacedGroup.members).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});

describe("SENA SCIM resource reads, deprovisioning, and collection queries", () => {
  const usersBase = "https://sena.example.test/api/sena/scim/v2/Users";
  const groupsBase = "https://sena.example.test/api/sena/scim/v2/Groups";
  const authHeaders = { authorization: "Bearer sena-test-provisioning-token" };
  const scimHeaders = { ...authHeaders, "content-type": "application/scim+json" };
  const readRequest = (url: string) => new Request(url, { headers: authHeaders });
  const deleteRequest = (url: string) => new Request(url, { method: "DELETE", headers: authHeaders });
  const patchRequest = (url: string, body: unknown) => new Request(url, {
    method: "PATCH",
    headers: scimHeaders,
    body: JSON.stringify(body)
  });
  const resourceContext = (resourceId: string) => ({ params: Promise.resolve({ resourceId }) });
  const filterUrl = (base: string, filter: string) => `${base}?filter=${encodeURIComponent(filter)}`;

  type ScimRoutes = {
    usersRoute: typeof import("../../../app/api/sena/scim/v2/Users/route");
    groupsRoute: typeof import("../../../app/api/sena/scim/v2/Groups/route");
    userResourceRoute: typeof import("../../../app/api/sena/scim/v2/Users/[resourceId]/route");
    groupResourceRoute: typeof import("../../../app/api/sena/scim/v2/Groups/[resourceId]/route");
    enterprise: typeof import("../enterprise");
  };

  // Same temp-directory + stubbed-token + aliased-module dance the PatchOp specs
  // above run inline; hoisted here because six cases need it identically.
  async function withScimRoutes<T>(prefix: string, run: (routes: ScimRoutes) => Promise<T>) {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), prefix));
    vi.resetModules();
    vi.stubEnv("SENA_PROVISIONING_TOKEN", "sena-test-provisioning-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/provisioning-auth", async () => await import("../provisioning-auth"));
    vi.doMock("@/lib/sena/scim", async () => await import("../scim"));

    try {
      return await run({
        usersRoute: await import("../../../app/api/sena/scim/v2/Users/route"),
        groupsRoute: await import("../../../app/api/sena/scim/v2/Groups/route"),
        userResourceRoute: await import("../../../app/api/sena/scim/v2/Users/[resourceId]/route"),
        groupResourceRoute: await import("../../../app/api/sena/scim/v2/Groups/[resourceId]/route"),
        enterprise: await import("../enterprise")
      });
    } finally {
      vi.unstubAllEnvs();
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  }

  async function seedGroup(
    groupsRoute: ScimRoutes["groupsRoute"],
    body: Record<string, unknown>
  ) {
    const response = await groupsRoute.POST(new Request(groupsBase, {
      method: "POST",
      headers: scimHeaders,
      body: JSON.stringify(body)
    }));
    return { status: response.status, group: await response.json() as ScimGroupResource };
  }

  async function seedUser(
    usersRoute: ScimRoutes["usersRoute"],
    body: Record<string, unknown>
  ) {
    const response = await usersRoute.POST(new Request(usersBase, {
      method: "POST",
      headers: scimHeaders,
      body: JSON.stringify(body)
    }));
    return { status: response.status, user: await response.json() as ScimUserResource };
  }

  const cohortBody = (input: {
    displayName: string;
    externalId: string;
    organization: string;
    members: Array<{ value: string; email: string; display: string; type: string }>;
  }) => ({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group", senaScimGroupExtensionSchema],
    displayName: input.displayName,
    externalId: input.externalId,
    [senaScimGroupExtensionSchema]: { organization: input.organization, plan: "enterprise" },
    members: input.members
  });

  it("serves a single SCIM User and Group by id and 404s an unknown id", async () => {
    await withScimRoutes("sena-scim-resource-get-", async ({ groupsRoute, userResourceRoute, groupResourceRoute }) => {
      const { status, group } = await seedGroup(groupsRoute, cohortBody({
        displayName: "Read Cohort",
        externalId: "okta-group-read",
        organization: "SENA Read Org",
        members: [
          { value: "okta-read-pi", email: "read-pi@example.edu", display: "Read PI", type: "pi" },
          { value: "okta-read-coder", email: "read-coder@example.edu", display: "Read Coder", type: "coder" }
        ]
      }));
      expect(status).toBe(201);
      const groupId = String(group.id);
      const piId = String(group.members?.find((member) => member.type === "pi")?.value);

      const userRead = await userResourceRoute.GET(readRequest(`${usersBase}/${piId}`), resourceContext(piId));
      const user = await userRead.json() as ScimUserResource;
      expect(userRead.status).toBe(200);
      expect(userRead.headers.get("x-sena-observed-route")).toBe("sena-scim-users-resource");
      expect(user.id).toBe(piId);
      expect(user.userName).toBe("read-pi@example.edu");
      expect(user.active).toBe(true);

      const groupRead = await groupResourceRoute.GET(readRequest(`${groupsBase}/${groupId}`), resourceContext(groupId));
      const readGroup = await groupRead.json() as ScimGroupResource;
      expect(groupRead.status).toBe(200);
      expect(readGroup.id).toBe(groupId);
      expect(readGroup.displayName).toBe("Read Cohort");
      expect(readGroup.members).toHaveLength(2);

      // IdPs that stored only their own id must resolve the same resource.
      const byExternalId = await groupResourceRoute.GET(
        readRequest(`${groupsBase}/okta-group-read`),
        resourceContext("okta-group-read")
      );
      expect(byExternalId.status).toBe(200);
      expect((await byExternalId.json() as ScimGroupResource).id).toBe(groupId);

      const missingUser = await userResourceRoute.GET(
        readRequest(`${usersBase}/okta-user-missing`),
        resourceContext("okta-user-missing")
      );
      expect(missingUser.status).toBe(404);
      const missingUserBody = await missingUser.json() as ScimErrorBody;
      expect(missingUserBody.senaCode).toBe("scim_user_not_found");
      // Same envelope on a non-400: schemas and status always, but scimType only
      // where RFC 7644 defines it (400s), so a 404 must not carry a guessed one.
      expect(missingUserBody.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
      expect(missingUserBody.status).toBe("404");
      expect(missingUserBody.scimType).toBeUndefined();
      expect(missingUserBody.detail).toBeTruthy();

      const missingGroup = await groupResourceRoute.GET(
        readRequest(`${groupsBase}/okta-group-missing`),
        resourceContext("okta-group-missing")
      );
      expect(missingGroup.status).toBe(404);
      expect((await missingGroup.json() as ScimErrorBody).senaCode).toBe("scim_group_not_found");
    });
  });

  it("treats DELETE on a SCIM User as a suspend that keeps the resource readable", async () => {
    await withScimRoutes("sena-scim-user-delete-", async ({ usersRoute, groupsRoute, userResourceRoute }) => {
      const { group } = await seedGroup(groupsRoute, cohortBody({
        displayName: "Delete Cohort",
        externalId: "okta-group-user-delete",
        organization: "SENA Delete Org",
        members: [
          { value: "okta-delete-pi", email: "delete-pi@example.edu", display: "Delete PI", type: "pi" },
          { value: "okta-delete-coder", email: "delete-coder@example.edu", display: "Delete Coder", type: "coder" }
        ]
      }));
      const piId = String(group.members?.find((member) => member.type === "pi")?.value);
      const coderId = String(group.members?.find((member) => member.type === "coder")?.value);

      const deleted = await userResourceRoute.DELETE(
        deleteRequest(`${usersBase}/${coderId}`),
        resourceContext(coderId)
      );
      expect(deleted.status).toBe(204);
      expect(await deleted.text()).toBe("");

      const afterDelete = await userResourceRoute.GET(
        readRequest(`${usersBase}/${coderId}`),
        resourceContext(coderId)
      );
      expect(afterDelete.status).toBe(200);
      expect((await afterDelete.json() as ScimUserResource).active).toBe(false);

      const listed = await usersRoute.GET(readRequest(usersBase));
      const directory = await listed.json() as ScimListResponse<ScimUserResource>;
      expect(directory.totalResults).toBe(2);
      expect(directory.Resources?.find((resource) => resource.id === coderId)?.active).toBe(false);
      expect(directory.Resources?.find((resource) => resource.id === piId)?.active).toBe(true);

      const deletedAgain = await userResourceRoute.DELETE(
        deleteRequest(`${usersBase}/okta-user-missing`),
        resourceContext("okta-user-missing")
      );
      expect(deletedAgain.status).toBe(404);
    });
  });

  it("treats DELETE on a SCIM Group as a roster suspend that keeps the team and its users", async () => {
    await withScimRoutes("sena-scim-group-delete-", async ({ groupsRoute, groupResourceRoute, usersRoute, enterprise }) => {
      // A SENA-owned team whose roster the IdP manages: the owner membership is
      // API-provisioned, so the SCIM roster can be suspended without stranding
      // the team.
      enterprise.provisionEnterpriseOrganization({
        source: "api",
        organization: "SENA Group Delete Org",
        teams: [{ name: "Shared Cohort", plan: "enterprise" }],
        users: [{
          externalId: "sena-owner",
          email: "sena-owner@example.edu",
          name: "SENA Owner",
          memberships: [{ teamName: "Shared Cohort", role: "owner" }]
        }]
      });

      const { status, group } = await seedGroup(groupsRoute, cohortBody({
        displayName: "Shared Cohort",
        externalId: "okta-group-shared",
        organization: "SENA Group Delete Org",
        members: [
          { value: "okta-shared-coder", email: "shared-coder@example.edu", display: "Shared Coder", type: "coder" }
        ]
      }));
      expect(status).toBe(200);
      const groupId = String(group.id);
      const coderId = String(group.members?.find((member) => member.type === "coder")?.value);

      const deleted = await groupResourceRoute.DELETE(
        deleteRequest(`${groupsBase}/${groupId}`),
        resourceContext(groupId)
      );
      expect(deleted.status).toBe(204);
      expect(await deleted.text()).toBe("");

      const afterDelete = await groupResourceRoute.GET(
        readRequest(`${groupsBase}/${groupId}`),
        resourceContext(groupId)
      );
      const readGroup = await afterDelete.json() as ScimGroupResource;
      expect(afterDelete.status).toBe(200);
      expect(readGroup.displayName).toBe("Shared Cohort");
      // Length first: `every` on an emptied roster would pass vacuously, which
      // is exactly the erase this DELETE must not be.
      expect(readGroup.members).toHaveLength(1);
      expect(readGroup.members?.every((member) => member.active === false)).toBe(true);

      // The suspend erases nothing: the user row survives and the API-owned
      // membership that keeps the team administrable is untouched.
      const listedUsers = await usersRoute.GET(readRequest(usersBase));
      const userDirectory = await listedUsers.json() as ScimListResponse<ScimUserResource>;
      expect(userDirectory.Resources?.find((resource) => resource.id === coderId)?.userName)
        .toBe("shared-coder@example.edu");
      const apiDirectory = enterprise.listEnterpriseProvisioningDirectory("api");
      expect(apiDirectory.users.find((user) => user.email === "sena-owner@example.edu")?.memberships)
        .toEqual([expect.objectContaining({ status: "active", role: "owner" })]);

      const missing = await groupResourceRoute.DELETE(
        deleteRequest(`${groupsBase}/okta-group-missing`),
        resourceContext("okta-group-missing")
      );
      expect(missing.status).toBe(404);
    });
  });

  it("refuses a Group DELETE that would leave the team with no active manager", async () => {
    await withScimRoutes("sena-scim-group-delete-guard-", async ({ groupsRoute, groupResourceRoute }) => {
      const { group } = await seedGroup(groupsRoute, cohortBody({
        displayName: "Stranded Cohort",
        externalId: "okta-group-stranded",
        organization: "SENA Stranded Org",
        members: [
          { value: "okta-stranded-pi", email: "stranded-pi@example.edu", display: "Stranded PI", type: "pi" },
          { value: "okta-stranded-coder", email: "stranded-coder@example.edu", display: "Stranded Coder", type: "coder" }
        ]
      }));
      const groupId = String(group.id);

      const deleted = await groupResourceRoute.DELETE(
        deleteRequest(`${groupsBase}/${groupId}`),
        resourceContext(groupId)
      );
      expect(deleted.status).toBe(400);
      expect((await deleted.json() as ScimErrorBody).senaCode).toBe("last_team_manager_required");

      // A refused deprovision must not half-apply.
      const afterRefusal = await groupResourceRoute.GET(
        readRequest(`${groupsBase}/${groupId}`),
        resourceContext(groupId)
      );
      const survivingGroup = await afterRefusal.json() as ScimGroupResource;
      expect(survivingGroup.members).toHaveLength(2);
      expect(survivingGroup.members?.every((member) => member.active === true)).toBe(true);
    });
  });

  it("refuses a Group PatchOp remove that names no resolvable member instead of suspending the roster", async () => {
    await withScimRoutes("sena-scim-group-remove-guard-", async ({ groupsRoute, groupResourceRoute, enterprise }) => {
      // An API-provisioned owner keeps the team administrable, so the
      // last-manager guard cannot stand in for the check under test: without it
      // a roster-wide suspend would be refused for the wrong reason.
      enterprise.provisionEnterpriseOrganization({
        source: "api",
        organization: "SENA Remove Guard Org",
        teams: [{ name: "Remove Guard Cohort", plan: "enterprise" }],
        users: [{
          externalId: "sena-remove-guard-owner",
          email: "remove-guard-owner@example.edu",
          name: "Remove Guard Owner",
          memberships: [{ teamName: "Remove Guard Cohort", role: "owner" }]
        }]
      });
      const { group } = await seedGroup(groupsRoute, cohortBody({
        displayName: "Remove Guard Cohort",
        externalId: "okta-group-remove-guard",
        organization: "SENA Remove Guard Org",
        members: [
          { value: "okta-remove-guard-pi", email: "remove-guard-pi@example.edu", display: "Guard PI", type: "pi" },
          { value: "okta-remove-guard-coder", email: "remove-guard-coder@example.edu", display: "Guard Coder", type: "coder" }
        ]
      }));
      const groupId = String(group.id);

      // Each of these names a removal target that resolves to no member. None is
      // the RFC 7644 3.5.2.2 "remove the whole attribute" request — that one
      // names no value at all — so reading them as one deprovisions the entire
      // cohort behind a 200 nobody retries.
      const unresolvable = [
        { label: "empty delta", value: [] },
        { label: "$ref-only reference", value: [{ $ref: `${usersBase}/okta-remove-guard-coder`, display: "Guard Coder" }] },
        { label: "blank value", value: [{ value: "  " }] }
      ];
      for (const { label, value } of unresolvable) {
        const response = await groupResourceRoute.PATCH(patchRequest(`${groupsBase}/${groupId}`, {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "remove", path: "members", value }]
        }), resourceContext(groupId));
        const body = await response.json() as ScimErrorBody;
        expect([label, response.status]).toEqual([label, 400]);
        expect([label, body.senaCode]).toEqual([label, "invalid_scim_patch"]);
      }

      const afterRefusals = await groupResourceRoute.GET(
        readRequest(`${groupsBase}/${groupId}`),
        resourceContext(groupId)
      );
      const roster = await afterRefusals.json() as ScimGroupResource;
      expect(roster.members).toHaveLength(2);
      expect(roster.members?.every((member) => member.active === true)).toBe(true);

      // The body that genuinely is the whole-attribute remove still lands.
      const clearedAll = await groupResourceRoute.PATCH(patchRequest(`${groupsBase}/${groupId}`, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "remove", path: "members" }]
      }), resourceContext(groupId));
      const clearedGroup = await clearedAll.json() as ScimGroupResource;
      expect(clearedAll.status).toBe(200);
      expect(clearedGroup.members).toHaveLength(2);
      expect(clearedGroup.members?.every((member) => member.active === false)).toBe(true);
    });
  });

  it("keeps a member's provisioned role when an IdP re-adds them without one", async () => {
    await withScimRoutes("sena-scim-group-add-idempotent-", async ({ groupsRoute, groupResourceRoute }) => {
      const { group } = await seedGroup(groupsRoute, cohortBody({
        displayName: "Resync Cohort",
        externalId: "okta-group-resync",
        organization: "SENA Resync Org",
        members: [
          { value: "okta-resync-pi", email: "resync-pi@example.edu", display: "Resync PI", type: "pi" },
          { value: "okta-resync-coder", email: "resync-coder@example.edu", display: "Resync Coder", type: "coder" }
        ]
      }));
      const groupId = String(group.id);
      const piId = String(group.members?.find((member) => member.type === "pi")?.value);
      const coderId = String(group.members?.find((member) => member.type === "coder")?.value);

      // A retry or a full re-sync re-sends members the IdP already added, with a
      // bare value or the RFC-conformant `type: "User"`. Neither is an
      // enterprise role, and neither is a request to demote anyone — least of
      // all the PI whose demotion would wedge the sync on the last-manager guard.
      const resynced = await groupResourceRoute.PATCH(patchRequest(`${groupsBase}/${groupId}`, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "add", path: "members", value: [{ value: piId }, { value: coderId, type: "User" }] }]
      }), resourceContext(groupId));
      const resyncedGroup = await resynced.json() as ScimGroupResource;
      expect(resynced.status).toBe(200);
      expect(resyncedGroup.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: piId, type: "pi", active: true }),
        expect.objectContaining({ value: coderId, type: "coder", active: true })
      ]));

      // Idempotence is not a role freeze: a reference that does name a role
      // still changes one.
      const promoted = await groupResourceRoute.PATCH(patchRequest(`${groupsBase}/${groupId}`, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "add", path: "members", value: [{ value: coderId, type: "reviewer" }] }]
      }), resourceContext(groupId));
      const promotedGroup = await promoted.json() as ScimGroupResource;
      expect(promoted.status).toBe(200);
      expect(promotedGroup.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: coderId, type: "reviewer", active: true })
      ]));

      const stored = await groupResourceRoute.GET(readRequest(`${groupsBase}/${groupId}`), resourceContext(groupId));
      const storedGroup = await stored.json() as ScimGroupResource;
      expect(storedGroup.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: "okta-resync-pi", type: "pi", active: true }),
        expect.objectContaining({ value: "okta-resync-coder", type: "reviewer", active: true })
      ]));
    });
  });

  it("reactivates a suspended SCIM User for real and answers only what it did", async () => {
    await withScimRoutes("sena-scim-user-reactivate-", async ({ groupsRoute, userResourceRoute, groupResourceRoute }) => {
      const seedCohort = async (suffix: string) => (await seedGroup(groupsRoute, cohortBody({
        displayName: `Return Cohort ${suffix.toUpperCase()}`,
        externalId: `okta-group-return-${suffix}`,
        organization: "SENA Return Org",
        members: [
          { value: `okta-return-pi-${suffix}`, email: `return-pi-${suffix}@example.edu`, display: "Return PI", type: "pi" },
          { value: "okta-return-coder", email: "return-coder@example.edu", display: "Return Coder", type: "coder" }
        ]
      }))).group;
      const firstGroup = await seedCohort("a");
      const secondGroup = await seedCohort("b");
      const coderId = String(firstGroup.members?.find((member) => member.type === "coder")?.value);
      const rosterOf = async (groupId: string) => (await (await groupResourceRoute.GET(
        readRequest(`${groupsBase}/${groupId}`),
        resourceContext(groupId)
      )).json() as ScimGroupResource).members?.find((member) => member.value === "okta-return-coder");
      const readCoder = async () => (await (await userResourceRoute.GET(
        readRequest(`${usersBase}/${coderId}`),
        resourceContext(coderId)
      )).json() as ScimUserResource).active;

      const deleted = await userResourceRoute.DELETE(deleteRequest(`${usersBase}/${coderId}`), resourceContext(coderId));
      expect(deleted.status).toBe(204);
      expect(await readCoder()).toBe(false);

      const reactivated = await userResourceRoute.PATCH(patchRequest(`${usersBase}/${coderId}`, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "replace", path: "active", value: true }]
      }), resourceContext(coderId));
      const reactivatedUser = await reactivated.json() as ScimUserResource;
      expect(reactivated.status).toBe(200);

      // The PATCH answer and the GET that immediately follows it are the same
      // fact: an IdP told `active: true` records success and stops retrying.
      expect([reactivatedUser.active, await readCoder()]).toEqual([true, true]);
      // ...and "reactivated" means the suspended memberships came back.
      expect(await rosterOf(String(firstGroup.id))).toEqual(expect.objectContaining({ active: true }));
      expect(await rosterOf(String(secondGroup.id))).toEqual(expect.objectContaining({ active: true }));

      // The inverse of DELETE is not a licence to undo a Group PatchOp removal:
      // a user still active somewhere is already active, so `active: true`
      // restores nothing and must not resurrect the group they were removed from.
      const removed = await groupResourceRoute.PATCH(patchRequest(`${groupsBase}/${secondGroup.id}`, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "remove", path: `members[value eq "${coderId}"]` }]
      }), resourceContext(String(secondGroup.id)));
      expect(removed.status).toBe(200);
      expect(await rosterOf(String(secondGroup.id))).toEqual(expect.objectContaining({ active: false }));

      const reasserted = await userResourceRoute.PATCH(patchRequest(`${usersBase}/${coderId}`, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [{ op: "replace", path: "active", value: true }]
      }), resourceContext(coderId));
      expect([(await reasserted.json() as ScimUserResource).active, await readCoder()]).toEqual([true, true]);
      expect(await rosterOf(String(secondGroup.id))).toEqual(expect.objectContaining({ active: false }));
      expect(await rosterOf(String(firstGroup.id))).toEqual(expect.objectContaining({ active: true }));
    });
  });

  it("applies an eq filter to the Users and Groups collections", async () => {
    await withScimRoutes("sena-scim-filter-", async ({ usersRoute, groupsRoute }) => {
      for (const suffix of ["a", "b", "c"]) {
        const { status } = await seedUser(usersRoute, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", senaScimUserExtensionSchema],
          userName: `filter-${suffix}@example.edu`,
          externalId: `okta-filter-${suffix}`,
          name: { formatted: `Filter ${suffix.toUpperCase()}` },
          emails: [{ value: `filter-${suffix}@example.edu`, primary: true }],
          [senaScimUserExtensionSchema]: { organization: "SENA Filter Org" }
        });
        expect(status).toBe(201);
      }
      await seedGroup(groupsRoute, cohortBody({
        displayName: "Filter Cohort One",
        externalId: "okta-group-filter-one",
        organization: "SENA Filter Org",
        members: [{ value: "okta-filter-pi-one", email: "filter-pi-one@example.edu", display: "Filter PI One", type: "pi" }]
      }));
      await seedGroup(groupsRoute, cohortBody({
        displayName: "Filter Cohort Two",
        externalId: "okta-group-filter-two",
        organization: "SENA Filter Org",
        members: [{ value: "okta-filter-pi-two", email: "filter-pi-two@example.edu", display: "Filter PI Two", type: "pi" }]
      }));

      const byUserName = await usersRoute.GET(readRequest(filterUrl(usersBase, 'userName eq "filter-b@example.edu"')));
      const userNameMatches = await byUserName.json() as ScimListResponse<ScimUserResource>;
      expect(byUserName.status).toBe(200);
      expect(userNameMatches.totalResults).toBe(1);
      expect(userNameMatches.itemsPerPage).toBe(1);
      expect(userNameMatches.Resources?.map((resource) => resource.userName)).toEqual(["filter-b@example.edu"]);

      const byExternalId = await usersRoute.GET(readRequest(filterUrl(usersBase, 'externalId eq "okta-filter-c"')));
      const externalIdMatches = await byExternalId.json() as ScimListResponse<ScimUserResource>;
      expect(externalIdMatches.totalResults).toBe(1);
      expect(externalIdMatches.Resources?.map((resource) => resource.userName)).toEqual(["filter-c@example.edu"]);

      const noMatch = await usersRoute.GET(readRequest(filterUrl(usersBase, 'userName eq "absent@example.edu"')));
      const noMatches = await noMatch.json() as ScimListResponse<ScimUserResource>;
      expect(noMatch.status).toBe(200);
      expect(noMatches.totalResults).toBe(0);
      expect(noMatches.itemsPerPage).toBe(0);
      expect(noMatches.Resources).toEqual([]);

      const byDisplayName = await groupsRoute.GET(readRequest(filterUrl(groupsBase, 'displayName eq "Filter Cohort Two"')));
      const displayNameMatches = await byDisplayName.json() as ScimListResponse<ScimGroupResource>;
      expect(displayNameMatches.totalResults).toBe(1);
      expect(displayNameMatches.Resources?.map((resource) => resource.displayName)).toEqual(["Filter Cohort Two"]);

      const byGroupExternalId = await groupsRoute.GET(
        readRequest(filterUrl(groupsBase, 'externalId eq "okta-group-filter-one"'))
      );
      const groupExternalIdMatches = await byGroupExternalId.json() as ScimListResponse<ScimGroupResource>;
      expect(groupExternalIdMatches.totalResults).toBe(1);
      expect(groupExternalIdMatches.Resources?.map((resource) => resource.displayName)).toEqual(["Filter Cohort One"]);
    });
  });

  it("pages the Users collection with startIndex and count", async () => {
    await withScimRoutes("sena-scim-pagination-", async ({ usersRoute }) => {
      for (const suffix of ["a", "b", "c"]) {
        await seedUser(usersRoute, {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", senaScimUserExtensionSchema],
          userName: `page-${suffix}@example.edu`,
          externalId: `okta-page-${suffix}`,
          emails: [{ value: `page-${suffix}@example.edu`, primary: true }],
          [senaScimUserExtensionSchema]: { organization: "SENA Page Org" }
        });
      }

      const unpaged = await usersRoute.GET(readRequest(usersBase));
      const allUsers = await unpaged.json() as ScimListResponse<ScimUserResource>;
      expect(allUsers.totalResults).toBe(3);
      expect(allUsers.startIndex).toBe(1);
      expect(allUsers.itemsPerPage).toBe(3);
      const orderedNames = allUsers.Resources?.map((resource) => resource.userName) ?? [];

      const secondPage = await usersRoute.GET(readRequest(`${usersBase}?startIndex=2&count=1`));
      const window = await secondPage.json() as ScimListResponse<ScimUserResource>;
      expect(secondPage.status).toBe(200);
      expect(window.totalResults).toBe(3);
      expect(window.startIndex).toBe(2);
      expect(window.itemsPerPage).toBe(1);
      expect(window.Resources?.map((resource) => resource.userName)).toEqual([orderedNames[1]]);

      const tail = await usersRoute.GET(readRequest(`${usersBase}?startIndex=3&count=10`));
      const tailWindow = await tail.json() as ScimListResponse<ScimUserResource>;
      expect(tailWindow.totalResults).toBe(3);
      expect(tailWindow.startIndex).toBe(3);
      expect(tailWindow.itemsPerPage).toBe(1);
      expect(tailWindow.Resources?.map((resource) => resource.userName)).toEqual([orderedNames[2]]);

      // RFC 7644 3.4.2.4: count=0 returns totals only.
      const countOnly = await usersRoute.GET(readRequest(`${usersBase}?count=0`));
      const totalsOnly = await countOnly.json() as ScimListResponse<ScimUserResource>;
      expect(totalsOnly.totalResults).toBe(3);
      expect(totalsOnly.itemsPerPage).toBe(0);
      expect(totalsOnly.Resources).toEqual([]);

      const combined = await usersRoute.GET(
        readRequest(`${filterUrl(usersBase, 'userName eq "page-b@example.edu"')}&startIndex=1&count=5`)
      );
      const combinedPage = await combined.json() as ScimListResponse<ScimUserResource>;
      expect(combinedPage.totalResults).toBe(1);
      expect(combinedPage.Resources?.map((resource) => resource.userName)).toEqual(["page-b@example.edu"]);
    });
  });

  it("advertises exactly the filter support it implements", async () => {
    await withScimRoutes("sena-scim-filter-advertisement-", async ({ usersRoute, groupsRoute }) => {
      const scim = await import("../scim");
      const config = scim.enterpriseScimServiceProviderConfig("https://sena.example.test/api/sena/scim/v2");

      expect(config.filter).toEqual({ supported: true, maxResults: scim.scimListMaxResults });
      // Nothing else grew a capability, so nothing else may claim one.
      expect(config.sort).toEqual({ supported: false });
      expect(config.bulk.supported).toBe(false);
      expect(config.senaFilterSupport.operators).toEqual(["eq"]);
      expect(config.senaFilterSupport.attributes.Users).toEqual([...scim.scimSupportedUserFilterAttributes]);
      expect(config.senaFilterSupport.attributes.Groups).toEqual([...scim.scimSupportedGroupFilterAttributes]);

      // The advertisement is only worth anything if the surface honours it
      // exactly: everything listed is accepted, and a plausible attribute the
      // document omits is refused rather than quietly ignored.
      for (const attribute of config.senaFilterSupport.attributes.Users) {
        const response = await usersRoute.GET(readRequest(filterUrl(usersBase, `${attribute} eq "probe"`)));
        expect([attribute, response.status]).toEqual([attribute, 200]);
      }
      for (const attribute of config.senaFilterSupport.attributes.Groups) {
        const response = await groupsRoute.GET(readRequest(filterUrl(groupsBase, `${attribute} eq "probe"`)));
        expect([attribute, response.status]).toEqual([attribute, 200]);
      }
      const unlistedForUsers = await usersRoute.GET(readRequest(filterUrl(usersBase, 'displayName eq "probe"')));
      expect(unlistedForUsers.status).toBe(400);
      const unlistedForGroups = await groupsRoute.GET(readRequest(filterUrl(groupsBase, 'userName eq "probe"')));
      expect(unlistedForGroups.status).toBe(400);
    });
  });

  it("refuses filter and pagination syntax it does not support instead of ignoring it", async () => {
    await withScimRoutes("sena-scim-filter-refusal-", async ({ usersRoute, groupsRoute }) => {
      await seedUser(usersRoute, {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", senaScimUserExtensionSchema],
        userName: "refuse-a@example.edu",
        externalId: "okta-refuse-a",
        emails: [{ value: "refuse-a@example.edu", primary: true }],
        [senaScimUserExtensionSchema]: { organization: "SENA Refuse Org" }
      });

      const refusals = [
        // Operator SENA does not implement.
        filterUrl(usersBase, 'userName sw "refuse"'),
        // Attribute SENA does not index.
        filterUrl(usersBase, 'name.familyName eq "Refuse"'),
        // Logical composition.
        filterUrl(usersBase, 'userName eq "refuse-a@example.edu" and active eq true'),
        // Complete nonsense must not degrade to "return everything".
        filterUrl(usersBase, "userName")
      ];
      for (const url of refusals) {
        const response = await usersRoute.GET(readRequest(url));
        const body = await response.json() as ScimErrorBody;
        expect(response.status).toBe(400);
        expect(body.senaCode).toBe("unsupported_scim_filter");
        expect(body.Resources).toBeUndefined();
        expect(body.totalResults).toBeUndefined();
      }

      // A conformant IdP parses errors against the SCIM Error message schema; shown
      // SENA's internal {error, code} shape it reports a transport failure instead of
      // the real reason. scimType is only defined for 400s and only over a closed
      // vocabulary, so it is emitted where it genuinely maps and omitted elsewhere.
      for (const url of refusals) {
        const body = await (await usersRoute.GET(readRequest(url))).json() as ScimErrorBody;
        expect(body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
        expect(body.status).toBe("400");
        expect(body.scimType).toBe("invalidFilter");
        expect(body.detail).toBeTruthy();
      }
      const groupRefusal = await groupsRoute.GET(readRequest(filterUrl(groupsBase, 'userName eq "refuse-a@example.edu"')));
      expect(groupRefusal.status).toBe(400);
      expect((await groupRefusal.json() as ScimErrorBody).senaCode).toBe("unsupported_scim_filter");

      for (const url of [`${usersBase}?startIndex=abc`, `${usersBase}?count=nope`]) {
        const response = await usersRoute.GET(readRequest(url));
        const body = await response.json() as ScimErrorBody;
        expect(response.status).toBe(400);
        expect(body.senaCode).toBe("invalid_scim_pagination");
        expect(body.Resources).toBeUndefined();
      }
    });
  });
});
