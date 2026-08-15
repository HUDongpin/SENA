import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const senaScimIdentityProductionExtensionSchema = "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig";
const senaScimUserExtensionSchema = "urn:sena:params:scim:schemas:extension:enterprise:2.0:User";
const senaScimGroupExtensionSchema = "urn:sena:params:scim:schemas:extension:enterprise:2.0:Group";

type ScimGroupMember = { value?: string; type?: string; active?: boolean };
type ScimGroupResource = { id?: string; displayName?: string; members?: ScimGroupMember[] };

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
        // A member added without an explicit role lands on the least-privileged
        // default: the group's defaultRole is not part of stored team state.
        expect.objectContaining({ value: analystId, type: "viewer", active: true }),
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
